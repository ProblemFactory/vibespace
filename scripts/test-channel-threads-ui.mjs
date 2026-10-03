#!/usr/bin/env node
// THREADS + REACTIONS IN THE CHANNEL WINDOW, IN A REAL BROWSER (lane channel-threads, spec §7.3; gate row
// `test-channel-threads-ui`, heavy tier — a worktree server + headless chrome, zero vendor calls: the FAKE adapter
// (`VIBESPACE_CHANNELS_FAKE=1`, its seeded threads + reactions, the 120-message big room of
// `VIBESPACE_CHANNELS_FAKE_BIG`) and ONE disabled Lark account seeded through the REAL `toRecord` (a reply whose
// parent was never stored). One leg per brief item:
//
//   (f) THE TRICKLE: the 120-row room scrolled end to end by trusted wheels in 3 s — the account's reaction-list
//       calls in that minute ≤ `channels.reactionsPerMin` (20), read off the server's own counters; the rows it
//       asked are drawn with their chips
//   (a) THE QUOTE LINE: a reply shows `↩ author: text`; a click flashes the parent (the class on the right
//       `data-vid`); a parent that was never stored (the Lark room) is said in words and a click says so ONCE
//   (q) A QUOTE IS A QUOTE (owner ruling 2026-09-28, "都是"): in the Lark room a reply made WITHOUT reply_in_thread
//       (parent_id + root_id, no thread id) draws the quoted-original strip (data-place-kind "quote": the parent's
//       author + text) and NO "在话题中" tag; the message it quotes grows NO chip; a click on the strip flashes the
//       parent and opens NO pane; the topic reply keeps its tag, the topic root its chip, the pane says 话题; the
//       fake-poll big room's quotes carry no tag either; no 线程 anywhere in a zh channel window
//   (b) THE PANE at 1280 px: the thread chip opens a SIDE pane (two lists in the window), the main list's scrollTop
//       unchanged; at 360 px a STACKED view covers the list and Back returns with the list's scrollTop unchanged
//   (c) REPLY IN THREAD: typed + sent in the pane ⇒ the fake receives `inThread` (the reply lands in the thread's
//       listing), shown in the pane AND in the main list with the `in thread` tag; the main composer's draft untouched
//   (d) REACT / UNREACT (lane reaction-hover): no `+` chip anywhere and no empty strip; a REAL hover on a message shows
//       its action bar, a REAL press on its Add reaction opens THE picker anchored under the button (the bar stays
//       while it is open), arrows + Enter pick, the chip appears `.rx-mine` with count 1; a click removes it; the
//       strip's other chips are the very same DOM nodes (probe stamps)
//   (r) THE BAR IS AN OVERLAY (lane reaction-hover — the owner: "不改变上下布局关系"): a message with no reaction and
//       one with reactions, each in five states (pointer away / on it / the keyboard in the bar by a REAL Tab / the
//       bar removed from the DOM / for the bare one a reaction added and taken back) — the row's offsetHeight, the
//       next row's offsetTop and the list's scrollHeight identical; hidden it takes no press; at the right edge, its
//       middle on the head line; THE PIXELS: rest vs keyboard and hovered vs hovered-without-bar differ ONLY inside
//       the bar's box, rest vs hovered only by the row's own hover wash outside it (screenshots r-row-*.png); the
//       keyboard inside the bar (→ one tab stop moves, Enter opens the picker, Esc gives the keyboard back)
//   (t) REPLY IN THREAD + QUOTE FROM THE BAR: every row's bar follows the PURE table (no Quote inside a topic); Quote
//       puts the quote above the composer and the send carries it (the new message shows what it quotes, the stored
//       record answers it); Reply in thread on a topic reply opens its topic answering THAT reply; the pane's rows
//       are react · thread (the old ↩ gone), the root's answers the thread itself; on a plain message a NEW thread
//       (the message its root, "no replies", never "not loaded"), whose first reply makes the message a topic root
//       (its chip, its bar re-synced without Quote)
//   (e) ANOTHER CLIENT'S REACTION: two pages on one conversation; page B reacts; page A's chip changes IN PLACE
//       within 2 s — no row rebuilt (probe stamps), no `/messages` fetch (the broadcast carried the result)
//   (g) THE PHONE (360 × 740, touch): a long press on a chip opens the who-list; a tap toggles; no `+`, no empty strip,
//       and the hover bar is not drawn (hover: none)
//   (p) THE PHONE AT 390 px (lane channel-touch-menu, 2.369.203): a LONG PRESS on a message's words is the platform's
//       SELECTION (Chrome's own gesture path) and opens no menu; the message's … button (≥ 44 px wide, over no word, the
//       element under its centre) opens its SAME actions as a menu (添加表情回应 · 在话题中回复 · 引用 · 复制文本), the
//       row's geometry identical with the menu open; the desktop draws no …; Add reaction from the menu → the picker → a tap reacts
//       (the row grows by its strip) → a tap takes it back (the row closes up exactly)
//   (h) zh + ja at 360 px, DejaVu Sans: the thread chip, the `in thread` tag, the pane bar's words and the pane composer's
//       line (naive-user ⑥ — it was cut to "…あなたとしてす…"; control: the pre-fix nowrap rule injected cuts it) drawn WHOLE
//       (the pill rule)
//
// Scratch names `vs-chanthreads-*`, free ports, never :7/5901 (vncEnv). Screenshots only into $VS_THREADS_SHOTS. Run: node scripts/test-channel-threads-ui.mjs (SKIPs without chrome)
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePort, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv } from './scratch.mjs';
const VNC_ENV = await vncEnv();
const require = createRequire(import.meta.url);

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
const T0 = Date.now();
const SHOTS = process.env.VS_THREADS_SHOTS || null;   // screenshots only when asked (a dir the caller owns)

const PORT = await freePort(), CDP_PORT = await freePort();
const wt = scratch('chanthreads');
const fakeHome = scratchHome('chanthreads-home', fs);
const chromeDir = scratch('chanthreads-chrome');

let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = (x) => JSON.stringify(x);

try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.writeFileSync(path.join(wt, 'src/lib/build-version.js'), `export const BUILD_VERSION = ${JSON.stringify(require(path.join(repo, 'package.json')).version)};\n`);
execSync('npx esbuild src/client.js --bundle --outfile=public/bundle.js --format=iife --platform=browser --target=es2020 --loader:.css=css', { cwd: wt, stdio: 'ignore' });

// ── THE SEED: the three fake accounts (as the engine seeds them) + ONE disabled Lark account whose room holds a
//    topic root, its reply, and a reply to a message never stored — the REAL Lark toRecord over invented items ──
const W = (rel) => require(path.join(wt, rel));
const NOW = Date.now(), MIN = 60e3;
{
  const { createChannelStore } = W('src/channel-store.js');
  const fake = W('src/channels/fake.js');
  const lark = W('src/channels/lark.js');
  const store = createChannelStore({ dir: path.join(wt, 'data/channels'), log: { log() {}, warn() {}, error() {} } });
  const capsOf = { 'fake-poll': fake.fakePoll.caps, 'fake-push': fake.fakePush.caps, 'fake-scan': fake.fakeScan.caps };
  await store.adapters.update((ad) => {
    for (const kind of fake.FAKE_KINDS) {
      const c = capsOf[kind];
      ad.adapters.push({ id: kind, kind, label: kind, enabled: true, auth: { tokenEnc: null, expiresAt: null, scopes: [] }, lastPass: null, consecutiveFailures: 0, reactionPolicy: 'propose',
        push: { enabled: c.receive === 'push' && !c.pushOptIn, claimedExclusive: 'unknown', state: null, lastEventAt: null, missRate: 0, demotedAt: null, demotedWhy: null, samples: [] },
        scan: c.receive === 'scan' ? { hostId: null, chosenSource: null, grantAskedAt: null, hostFacts: null } : null });
    }
    ad.adapters.push({ id: 'lark', kind: 'lark', label: 'Lark / 飞书', enabled: false, reactionPolicy: 'propose', auth: { tokenEnc: null, expiresAt: null, scopes: ['im:message', 'im:message.send_as_user', 'im:chat:readonly'], user: null }, lastPass: null, consecutiveFailures: 0, push: { enabled: false, claimedExclusive: 'unknown', state: null, lastEventAt: null, missRate: 0, demotedAt: null, demotedWhy: null, samples: [] }, scan: null });
  });
  await store.index.update(() => { const en = store.index.entry('lark', 'oc_thr'); en.title = 'Topic room'; en.kind = 'group'; en.convCaps = { read: 'yes', sendAs: [], why: 'disabled', at: NOW }; en.lastAt = NOW; en.listedAt = NOW; });
  const item = (id, at, text, sender, extra = {}) => ({ message_id: id, msg_type: 'text', create_time: String(at), chat_id: 'oc_thr', sender: { id: sender, sender_type: 'user' }, body: { content: JSON.stringify({ text }) }, ...extra });
  const names = new Map([['ou_ada', 'Ada'], ['ou_brook', 'Brook'], ['ou_cass', 'Cass']]);
  store.appendRecords('lark', 'oc_thr', [
    lark.toRecord('lark', 'oc_thr', item('om_t0', NOW - 30 * MIN, 'when is the weekly now?', 'ou_ada', { thread_id: 'omt_a' }), { names }),
    lark.toRecord('lark', 'oc_thr', item('om_t1', NOW - 25 * MIN, 'at three', 'ou_brook', { root_id: 'om_t0', parent_id: 'om_t0', thread_id: 'omt_a' }), { names }),
    lark.toRecord('lark', 'oc_thr', item('om_t2', NOW - 20 * MIN, 'agreed with the old plan', 'ou_cass', { root_id: 'om_gone', parent_id: 'om_gone' }), { names }),
    // (q) a plain message and a QUOTE of it (a Lark reply without reply_in_thread: parent_id + root_id, no thread id)
    lark.toRecord('lark', 'oc_thr', item('om_p', NOW - 15 * MIN, 'ship on friday', 'ou_ada'), { names }),
    lark.toRecord('lark', 'oc_thr', item('om_q', NOW - 14 * MIN, 'fine by me', 'ou_brook', { root_id: 'om_p', parent_id: 'om_p' }), { names }),
  ]);
  store.index.flush && store.index.flush();
  store.close && store.close();
}

const boot = () => spawn(process.execPath, ['server.js'], {
  cwd: wt, stdio: 'ignore',
  env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', VIBESPACE_CHANNELS_FAKE: '1', VIBESPACE_CHANNELS_FAKE_BIG: '120' },
});
const srv = boot();
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu',
  '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1280,900', '--disable-background-timer-throttling',
  `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv && srv.kill('SIGKILL'); } catch {}
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  for (const d of [chromeDir, fakeHome]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
};
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
const waitServer = async () => { for (let i = 0; i < 160; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); return true; } catch { await sleep(250); } } return false; };
ok(await waitServer(), 'the worktree server booted (the fake accounts + a disabled Lark account)');
const api = async (method, p, body) => { const r = await fetch(`http://127.0.0.1:${PORT}${p}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }); let j = {}; try { j = await r.json(); } catch {} return { status: r.status, json: j }; };
// the fake accounts ingest their rooms (a pass each; the big room holds 120)
for (let i = 0; i < 80; i++) { const r = await api('GET', '/api/channels/fake-poll/fake-poll-big/messages?limit=5'); if (r.status === 200 && (r.json.records || []).length) break; await sleep(250); }

const WebSocket = require('ws');
/** test-mobile-select's phone (the chat's proven Android shape) */
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36';
async function newPage({ lang = 'zh', phone = false, font = false, width = 360, android = false } = {}) {
  const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' });
  const t = await r.json();
  const ws = new WebSocket(t.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((res) => ws.on('open', res));
  let seq = 0; const pend = new Map();
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const cdp = (method, params = {}) => new Promise((res) => { const id = ++seq; pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  const errors = [];
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.method === 'Runtime.exceptionThrown') errors.push(String((m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description) || m.params.exceptionDetails.text).slice(0, 300)); });
  await cdp('Runtime.enable'); await cdp('Page.enable');
  const evaljs = async (expr) => {
    const r2 = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r2.result?.exceptionDetails) throw new Error('page threw: ' + JSON.stringify(r2.result.exceptionDetails).slice(0, 900));
    if (!r2.result || !r2.result.result || !('value' in r2.result.result)) throw new Error('no value from page: ' + JSON.stringify(r2).slice(0, 600));
    return r2.result.result.value;
  };
  if (phone) {
    // `android` (channel-touch-menu verify r1): THE CHAT'S PHONE, scripts/test-mobile-select.mjs — 390 × 844, DPR 3, an
    // Android UA, hover:none / pointer:coarse — the shape its Android-shaped long press was proven in
    await cdp('Emulation.setDeviceMetricsOverride', android ? { width: 390, height: 844, deviceScaleFactor: 3, mobile: true } : { width, height: 740, deviceScaleFactor: 2, mobile: true });
    await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    if (android) {
      await cdp('Emulation.setUserAgentOverride', { userAgent: ANDROID_UA, platform: 'Linux armv8l' });
      await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] });
    }
  } else await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('vibespace.lang', ${J(lang)}); } catch {}` });
  // the pill rule is judged under the CI runner's font (DejaVu Sans — the .185 mirror lesson)
  if (font) await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = '* { font-family: \"DejaVu Sans\" !important; }'; document.head.appendChild(s); });" });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  let ready = false;
  for (let i = 0; i < 160; i++) { try { if (await evaljs("!!(window.app && window.app.wm && window.app.openChannel) && !document.getElementById('loading-screen')")) { ready = true; break; } } catch {} await sleep(250); }
  const shot = async (file) => { if (!SHOTS) return; try { fs.mkdirSync(SHOTS, { recursive: true }); const r3 = await cdp('Page.captureScreenshot', { format: 'png' }); if (r3.result && r3.result.data) fs.writeFileSync(path.join(SHOTS, file), Buffer.from(r3.result.data, 'base64')); } catch {} };
  // `text` (lane reaction-hover): a key that ACTIVATES a focused button (Enter / Space) needs its char — CDP sends no
  // keypress without it, and the browser's own activation never happens
  const key = async (k, code, vk, text) => { await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, ...(text ? { text, unmodifiedText: text } : {}) }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk }); };
  const wheel = (x, y, dy) => cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: dy });
  const touch = async (x, y, holdMs) => { await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await sleep(holdMs); await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
  // lane reaction-hover: a REAL pointer (the bar is a :hover overlay — a script's .click() never proves it is reachable)
  const move = (x, y) => cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
  const click = async (x, y) => { await move(x, y); for (const type of ['mousePressed', 'mouseReleased']) await cdp('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }); };
  // a clip of the page as base64 PNG (deviceScaleFactor 1 on the desktop page: one pixel = one CSS px)
  const capture = async ({ name = null, x, y, width: w, height: h }) => { const r3 = await cdp('Page.captureScreenshot', { format: 'png', clip: { x, y, width: w, height: h, scale: 1 } }); const d = r3.result && r3.result.data; if (d && SHOTS && name) { try { fs.mkdirSync(SHOTS, { recursive: true }); fs.writeFileSync(path.join(SHOTS, name), Buffer.from(d, 'base64')); } catch {} } return d || null; };
  return { cdp, evaljs, ready, shot, key, wheel, touch, move, click, capture, errors, close: () => { try { ws.close(); } catch {} } };
}
for (let i = 0; i < 120; i++) { try { await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json(); break; } catch { await sleep(250); } }

/** Open a conversation window (maximized when asked), wait for `min` rows; `window.__w[tag]` = it. */
const OPEN = (a, c, tag, { min = 1, maximize = false } = {}) => `(async () => {
  const w = window.app.openChannel(${J(a)}, ${J(c)});
  ${maximize ? 'window.app.wm.toggleMaximize(w.id);' : ''}
  for (let i = 0; i < 200; i++) { if (w.content.querySelectorAll('.chanmsg[data-vid]').length >= ${min}) break; await new Promise((r) => setTimeout(r, 100)); }
  window.__w = window.__w || {}; window.__w[${J(tag)}] = w;
  return { rows: w.content.querySelectorAll('.chanmsg[data-vid]').length };
})()`;
/** A ROW TO PRESS, ONCE THE LIST STANDS STILL (channel-touch-menu verify r1, measured): the reaction trickle asks the
 *  rows in the viewport 800 ms after a scroll and draws their strips — rows above a row read 400 ms after its
 *  scrollIntoView grew and pushed it 34 px down within the next second. Scroll, wait until the row's top and the
 *  list's height have held for 1.2 s (≤ 10 s), then take the VISIBLE row with no reaction nearest the list's centre
 *  (every visible row has been asked by then). → { vid, settled, waited } */
const PICK_ROW = (tag, geo) => `(async () => {
  const l = window.__w[${J(tag)}].content.querySelector('.chanwin-main .chanwin-list');
  const plain = (r) => r.querySelector(':scope > .chanmsg-bar')?.dataset.acts === 'react thread quote' && !r.querySelector('.chanmsg-rx') && !r.querySelector('a[href], img') && r.nextElementSibling;
  const rows = [...l.querySelectorAll('.chanmsg[data-vid]')].filter(plain);
  const first = rows[Math.max(0, rows.length - 3)];
  if (!first) return null;
  first.scrollIntoView({ block: 'center' });
  const at = () => Math.round(first.getBoundingClientRect().top) + '/' + l.scrollHeight + '/' + Math.round(l.scrollTop);
  let last = at(), still = 0, waited = 0;
  while (still < 1200 && waited < 10000) { await new Promise((r) => setTimeout(r, 150)); waited += 150; const now = at(); if (now === last) still += 150; else { still = 0; last = now; } }
  const lr = l.getBoundingClientRect(), mid = (lr.top + lr.bottom) / 2;
  const off = (r) => { const q = r.getBoundingClientRect(); return Math.abs((q.top + q.bottom) / 2 - mid); };
  const row = [...l.querySelectorAll('.chanmsg[data-vid]')].filter((r) => { const q = r.getBoundingClientRect(); return plain(r) && q.top >= lr.top && q.bottom <= lr.bottom; }).sort((a, b) => off(a) - off(b))[0];
  if (!row) return null;
  row.dataset.geo = ${J(geo)};
  return { vid: row.dataset.vid, settled: still >= 1200, waited };
})()`;
const LIST = (tag) => `window.__w[${J(tag)}].content.querySelector('.chanwin-main .chanwin-list')`;
const adapterRx = async (id) => { const r = await api('GET', '/api/channels'); const a = (r.json.adapters || []).find((x) => x.id === id); return (a && a.reactions) || null; };

const p1 = await newPage({ lang: 'zh' });
ok(p1.ready, 'the page loaded the app (zh, 1280 × 900)');

// ── (a) THE QUOTE LINE: a click flashes the parent; a parent never stored is said once ──
console.log('(a) the quote line');
{
  const o = await p1.evaljs(OPEN('fake-poll', 'fake-poll-big', 'big', { min: 30, maximize: true }));
  ok(o.rows >= 30, `the big room is drawn (${o.rows} rows, maximized)`);
  await sleep(1500);   // the first trickle (the rows in view, debounced 800 ms)
  const q = await p1.evaljs(`(async () => {
    const w = window.__w.big;
    const qs = [...w.content.querySelectorAll('.chanwin-list .chanmsg-replyq[data-reply-of]')].filter((b) => w.content.querySelector('.chanwin-list .chanmsg[data-vid="' + CSS.escape(b.dataset.replyOf) + '"]'));
    if (!qs.length) return { found: false };
    const b = qs[qs.length - 1];
    const words = b.textContent;
    b.click();
    const target = w.content.querySelector('.chanwin-list .chanmsg[data-vid="' + CSS.escape(b.dataset.replyOf) + '"]');
    let flashed = false;
    for (let i = 0; i < 20 && !flashed; i++) { flashed = target.classList.contains('chanmsg-flash'); if (!flashed) await new Promise((r) => setTimeout(r, 25)); }
    const others = w.content.querySelectorAll('.chanwin-list .chanmsg-flash').length;
    return { found: true, words, flashed, others, of: b.dataset.replyOf };
  })()`);
  ok(q.found && /\S/.test(q.words) && q.flashed && q.others === 1, `a reply's quote line reads "${(q.words || '').slice(0, 40)}…"; a click flashes the parent — the class on the right data-vid (${q.of}), no other row`, J(q));
  await p1.evaljs(OPEN('lark', 'oc_thr', 'lark', { min: 3 }));
  const nl = await p1.evaljs(`(async () => {
    const w = window.__w.lark;
    const b = w.content.querySelector('.chanmsg[data-vid="om_t2"] .chanmsg-replyq');
    const tag = w.content.querySelector('.chanmsg[data-vid="om_t1"] .chanmsg-in-thread');
    const chip = w.content.querySelector('.chanmsg[data-vid="om_t0"] .chanmsg-thread-chip');
    const words = b ? b.textContent : null;
    const before = [...document.querySelectorAll('.global-toast-body')].length;
    if (b) b.click();
    for (let i = 0; i < 60 && [...document.querySelectorAll('.global-toast-body')].length <= before; i++) await new Promise((r) => setTimeout(r, 100));
    await new Promise((r) => setTimeout(r, 1200));   // …and nothing more after the first
    const toasts = [...document.querySelectorAll('.global-toast-body')].map((x) => x.textContent).slice(before);
    return { words, dim: !!(b && b.classList.contains('chanmsg-replyq-dim')), toasts, tag: tag ? tag.textContent : null, chip: chip ? chip.textContent : null };
  })()`);
  ok(nl.words === '引用了一条尚未加载的消息' && nl.dim, 'a QUOTE of a message never stored (a Lark parent_id with no record, no thread id) is said in words — "引用了一条尚未加载的消息", dim — never a blank', J(nl));
  ok(nl.toasts.filter((x) => x === '那条消息比已加载的内容更早').length === 1, `a click on it says so ONCE (${nl.toasts.length} toast(s): ${nl.toasts.join(' | ')})`, J({ toasts: nl.toasts, errors: p1.errors }));
  ok(nl.tag === '在话题中' && /条回复|打开以加载/.test(nl.chip || ''), `the REAL Lark shape draws: the topic reply's "在话题中" tag and the topic root's chip ("${nl.chip}")`, J(nl));
  // (q) A QUOTE IS A QUOTE — the strip, no tag, no chip on what it quotes, a click jumps (never a pane); 话题, never 线程
  console.log('(q) a quote is a quote, a topic is a topic');
  await p1.evaljs("(() => { for (const x of document.querySelectorAll('.global-toast')) x.remove(); return 1; })()");
  const qv = await p1.evaljs(`(async () => {
    const w = window.__w.lark;
    const row = (v) => w.content.querySelector('.chanwin-main .chanmsg[data-vid="' + v + '"]');
    for (let i = 0; i < 60 && !row('om_q'); i++) await new Promise((r) => setTimeout(r, 100));
    const qr = row('om_q'), pr = row('om_p'), t2 = row('om_t2'), t1 = row('om_t1'), t0 = row('om_t0');
    const strip = qr && qr.querySelector('.chanmsg-replyq');
    const out = {
      strip: strip ? { kind: strip.dataset.placeKind, text: strip.textContent, of: strip.dataset.replyOf } : null,
      quoteTag: !!(qr && qr.querySelector('.chanmsg-in-thread')), t2Tag: !!(t2 && t2.querySelector('.chanmsg-in-thread')), t2Kind: t2 && t2.querySelector('.chanmsg-replyq') ? t2.querySelector('.chanmsg-replyq').dataset.placeKind : null,
      parentChip: !!(pr && pr.querySelector('.chanmsg-thread-chip')),
      topicTag: t1 && t1.querySelector('.chanmsg-in-thread') ? t1.querySelector('.chanmsg-in-thread').textContent : null,
      topicChip: !!(t0 && t0.querySelector('.chanmsg-thread-chip')),
      noThreadWord: !w.content.textContent.includes('线程'),
    };
    if (strip) strip.click();
    let flashed = false;
    for (let i = 0; i < 20 && !flashed; i++) { flashed = !!(pr && pr.classList.contains('chanmsg-flash')); if (!flashed) await new Promise((r) => setTimeout(r, 25)); }
    await new Promise((r) => setTimeout(r, 400));
    const pane0 = w.content.querySelector('.chanthread');
    out.flashed = flashed; out.paneOpen = !!(pane0 && !pane0.hidden);
    return out;
  })()`);
  await p1.shot('q-quote-list.png');
  Object.assign(qv, await p1.evaljs(`(async () => {
    const w = window.__w.lark;
    const out = {};
    const t0 = w.content.querySelector('.chanwin-main .chanmsg[data-vid="om_t0"]');
    // the topic's chip still opens the pane, titled 话题 (never 线程) — the pane is built on its first open
    const chip = t0 && t0.querySelector('.chanmsg-thread-chip');
    if (chip) chip.click();
    let pane = null;
    for (let i = 0; i < 60 && !(pane && !pane.hidden); i++) { pane = w.content.querySelector('.chanthread'); if (!(pane && !pane.hidden)) await new Promise((r) => setTimeout(r, 50)); }
    await new Promise((r) => setTimeout(r, 300));
    out.topicPane = !!(pane && !pane.hidden); out.paneTitle = pane ? (pane.querySelector('.chanthread-head b') || {}).textContent : null;
    out.noThreadWordPane = !w.content.textContent.includes('线程');
    return out;
  })()`));
  await p1.shot('q-topic-pane.png');
  await p1.evaljs("(() => { const pane = window.__w.lark.content.querySelector('.chanthread'); const x = pane && (pane.querySelector('.chanthread-close') || pane.querySelector('.chanthread-back')); if (x) x.click(); return 1; })()");
  ok(qv.strip && qv.strip.kind === 'quote' && qv.strip.of === 'om_p' && /Ada/.test(qv.strip.text) && /ship on friday/.test(qv.strip.text) && !qv.quoteTag, `a Lark reply WITHOUT reply_in_thread draws the quoted original above it ("${qv.strip && qv.strip.text}", data-place-kind "quote") and NO "在话题中" tag`, J(qv));
  ok(!qv.parentChip && !qv.t2Tag && qv.t2Kind === 'quote', 'the message it quotes grows NO topic chip, and the quote of a message never stored carries no tag either', J(qv));
  ok(qv.flashed && !qv.paneOpen, 'a click on the quote strip flashes the quoted message and opens NO pane', J({ flashed: qv.flashed, paneOpen: qv.paneOpen }));
  ok(qv.topicTag === '在话题中' && qv.topicChip && qv.topicPane && qv.paneTitle === '话题', `a real topic keeps its tag ("${qv.topicTag}") and its chip, and the chip opens the pane titled "${qv.paneTitle}"`, J(qv));
  ok(qv.noThreadWord && qv.noThreadWordPane, 'no 线程 anywhere in the zh window (the list, the tags, the pane) — 话题 only');
  const bq = await p1.evaljs(`(() => {
    const w = window.__w.big;
    const quotes = [...w.content.querySelectorAll('.chanwin-main .chanmsg .chanmsg-replyq[data-place-kind="quote"]')].map((s) => s.closest('.chanmsg'));
    const topics = [...w.content.querySelectorAll('.chanwin-main .chanmsg .chanmsg-in-thread')].length;
    return { quotes: quotes.length, tagged: quotes.filter((r) => r.querySelector('.chanmsg-in-thread')).length, topics };
  })()`);
  ok(bq.quotes >= 3 && bq.tagged === 0 && bq.topics >= 1, `the fake-poll big room (both shapes): ${bq.quotes} quotes drawn, ${bq.tagged} of them tagged "in thread"; ${bq.topics} topic replies tagged`, J(bq));
  await p1.evaljs("(() => { for (const x of document.querySelectorAll('.global-toast')) x.remove(); window.app.wm.closeWindow && window.app.wm.closeWindow(window.__w.lark.id); return 1; })()");
}

// ── (b) + (c) THE PANE at 1280 px and a reply in it ──
console.log('(b)(c) the side pane and a reply in the thread');
let paneKey = null;
{
  // back to the bottom of the big room, the main composer holding a draft
  await p1.evaljs(`(() => { const l = ${LIST('big')}; l.scrollTop = l.scrollHeight; const ta = window.__w.big.content.querySelector('.chanwin-main .chanwin-foot textarea'); if (ta) { ta.value = 'main draft 42'; ta.dispatchEvent(new Event('input', { bubbles: true })); } return !!ta; })()`);
  await sleep(400);
  const b = await p1.evaljs(`(async () => {
    const w = window.__w.big;
    const l = w.content.querySelector('.chanwin-main .chanwin-list');
    const chips = [...l.querySelectorAll('.chanmsg-thread-chip')];
    if (!chips.length) return { chips: 0 };
    const chip = chips[chips.length - 1];
    const st0 = l.scrollTop;
    chip.click();
    const pane = w.content.querySelector('.chanthread');
    for (let i = 0; i < 100 && !(pane && !pane.hidden && pane.querySelectorAll('.chanthread-list .chanmsg').length >= 2); i++) await new Promise((r) => setTimeout(r, 50));
    const pr = pane.getBoundingClientRect(), lr = l.getBoundingClientRect();
    return { chips: chips.length, key: chip.dataset.threadKey, side: pane.classList.contains('chanthread-side'), rows: pane.querySelectorAll('.chanthread-list .chanmsg').length, st0, st1: l.scrollTop, paneLeft: Math.round(pr.left), listRight: Math.round(lr.right), paneW: Math.round(pr.width), listW: Math.round(lr.width) };
  })()`);
  paneKey = b.key;
  ok(b.chips >= 1 && b.side && b.rows >= 2 && b.paneLeft >= b.listRight - 2 && b.paneW >= 280 && b.listW >= 280, `the thread chip opens a SIDE pane: two lists in the window (list ${b.listW} px | pane ${b.paneW} px), the root + ${b.rows - 1} repl(y/ies)`, J(b));
  ok(Math.abs(b.st1 - b.st0) <= 2, `the main list's scrollTop is unchanged by the open (${b.st0} → ${b.st1})`);
  await p1.shot('b-side-pane.png');
  // (c) type + send in the pane
  const TEXT = `thread reply ${process.pid}`;
  const c = await p1.evaljs(`(async () => {
    const w = window.__w.big;
    const pane = w.content.querySelector('.chanthread');
    const ta = pane.querySelector('.chanthread-foot textarea');
    if (!ta) return { ta: false, foot: pane.querySelector('.chanthread-foot').textContent };
    ta.value = ${J(TEXT)}; ta.dispatchEvent(new Event('input', { bubbles: true }));
    pane.querySelector('[data-thread-send]').click();
    let inPane = null, inList = null;
    for (let i = 0; i < 200 && !(inPane && inList); i++) {
      inPane = [...pane.querySelectorAll('.chanthread-list .chanmsg')].find((r) => r.textContent.includes(${J(TEXT)})) || null;
      inList = [...w.content.querySelectorAll('.chanwin-main .chanwin-list .chanmsg')].find((r) => r.textContent.includes(${J(TEXT)})) || null;
      if (!(inPane && inList)) await new Promise((r) => setTimeout(r, 100));
    }
    const main = w.content.querySelector('.chanwin-main .chanwin-foot textarea');
    await new Promise((r) => setTimeout(r, 600));   // past the send's own redraw and the broadcasts it caused
    const now = pane.querySelector('.chanthread-foot textarea');
    return { ta: true, inPane: !!inPane, inList: !!inList, tagged: !!(inList && inList.querySelector('.chanmsg-in-thread')), vid: inList ? inList.dataset.vid : null, mainDraft: main ? main.value : null, cleared: !!now && now.value === '' };
  })()`);
  ok(c.inPane && c.inList && c.tagged && c.cleared, 'Reply in thread: the reply appears in the pane AND in the main list with the "in thread" tag; the pane\'s box (the one on screen, after the broadcasts) is empty', J(c));
  ok(c.mainDraft === 'main draft 42', 'the main composer\'s draft is untouched by a send in the pane', J(c.mainDraft));
  const th = await api('GET', `/api/channels/fake-poll/fake-poll-big/thread/${encodeURIComponent(paneKey)}`);
  ok(th.status === 200 && (th.json.records || []).some((r) => r.vendorId === c.vid && r.threadKey === th.json.thread.key), 'the fake received inThread: the vendor put the reply INTO the thread (its threadKey is the thread\'s)', J({ key: th.json.thread && th.json.thread.key, vid: c.vid }));
  await p1.shot('c-thread-reply.png');
  await p1.evaljs("(() => { const x = window.__w.big.content.querySelector('.chanthread-close'); if (x) x.click(); return 1; })()");
}

// ── (d) REACT / UNREACT in the main list — the HOVER BAR's Add reaction by a REAL pointer, the picker by keyboard, the
//    strip patched in place (lane reaction-hover: the `+` chip under every message is gone; adding is the bar) ──
console.log('(d) react / unreact (the hover action bar)');
const RXROW = {};
{
  const prep = await p1.evaljs(`(async () => {
    const w = window.__w.big;
    const l = w.content.querySelector('.chanwin-main .chanwin-list');
    const lr = l.getBoundingClientRect();
    // a row in the UPPER half of the list: the picker opens BELOW the bar's button (createPopover) and must fit there
    const rows = [...l.querySelectorAll('.chanmsg[data-vid]')].filter((r) => { const b = r.getBoundingClientRect(); return b.top >= lr.top + 16 && b.bottom <= lr.top + lr.height * 0.5 && r.querySelector(':scope > .chanmsg-bar [data-act="react"]'); });
    if (!rows.length) return { rows: 0 };
    const row = rows[rows.length - 1];
    const set = await (await fetch('/api/channels/fake-poll/emoji-set')).json();
    // the strip must hold a chip of somebody's before the pick (its node identity is the point): one added through
    // the route (the broadcast patches it in), unless the row has one already
    if (!row.querySelector('.rx-chip')) {
      await fetch('/api/channels/fake-poll/fake-poll-big/messages/' + encodeURIComponent(row.dataset.vid) + '/reactions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'bulb' }) });
      for (let i = 0; i < 40 && !row.querySelector('.rx-chip'); i++) await new Promise((r) => setTimeout(r, 100));
    }
    const have = new Set([...row.querySelectorAll('.rx-chip')].map((c) => c.dataset.key));
    const idx = set.quick.findIndex((k) => !have.has(k));
    [...row.querySelectorAll('.rx-chip')].forEach((c, i) => { c.dataset.probe = 'p' + i; });
    // THE GLYPH IS CONTENT: no chip of the window still says :key: for a key the vocabulary draws
    const glyphs = new Map(set.keys.filter((k) => k.glyph).map((k) => [k.key, k.glyph]));
    const named = [...w.content.querySelectorAll('.rx-chip > .rx-name')].map((x) => x.parentElement.dataset.key).filter((k) => glyphs.has(k));
    const drawnGlyphs = w.content.querySelectorAll('.rx-chip > .rx-glyph').length;
    const strips = [...w.content.querySelectorAll('.chanmsg-rx')];
    const body = row.querySelector(':scope > .chanmsg-body') || row;
    const br = body.getBoundingClientRect();
    return { rows: rows.length, vid: row.dataset.vid, key: set.quick[idx], idx, probes: row.querySelectorAll('[data-probe]').length, named, drawnGlyphs,
      plusLeft: w.content.querySelectorAll('.rx-add').length, emptyStrips: strips.filter((x) => !x.querySelector('.rx-chip')).length, strips: strips.length,
      at: { x: Math.round(br.left + Math.min(40, br.width / 2)), y: Math.round(br.top + Math.min(8, br.height / 2)) } };
  })()`);
  Object.assign(RXROW, prep);
  ok(prep.named && prep.named.length === 0 && prep.drawnGlyphs >= 3, `every chip draws the vocabulary's glyph (${prep.drawnGlyphs} glyph chips; none left as :key: for a key that has one — a strip drawn before the set loaded is re-faced in place)`, J(prep.named));
  ok(prep.plusLeft === 0 && prep.strips >= 3 && prep.emptyStrips === 0, `NO "+" chip anywhere in the window and no empty strip — a strip exists only under a message WITH reactions (${prep.strips} strips, ${prep.plusLeft} "+")`, J(prep));
  if (!(prep.rows >= 1 && prep.idx >= 0)) { ok(false, '(d) found no row to react on', J(prep)); process.exit(1); }
  // the pointer rests on the message's text ⇒ its bar shows; a REAL press on the bar's Add reaction opens the picker
  await p1.move(prep.at.x, prep.at.y);
  await sleep(350);   // past the bar's fade (var(--transition))
  const btn = await p1.evaljs(`(() => {
    const row = window.__w.big.content.querySelector('.chanwin-main .chanmsg[data-vid="' + CSS.escape(${J(prep.vid)}) + '"]');
    const b = row.querySelector(':scope > .chanmsg-bar [data-act="react"]');
    const bar = b.closest('.chanmsg-bar');
    const r = b.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), bottom: r.bottom, left: r.left, op: getComputedStyle(bar).opacity, pe: getComputedStyle(bar).pointerEvents,
      label: b.getAttribute('aria-label'), title: b.title, svg: !!b.querySelector('svg'), text: b.textContent.trim(), acts: bar.dataset.acts, hit: document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === b || b.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)) };
  })()`);
  ok(btn.op === '1' && btn.pe === 'auto' && btn.hit && btn.svg && btn.text === '' && btn.label === '添加表情回应' && /^添加表情回应/.test(btn.title), `a REAL hover on the message shows its bar (opacity ${btn.op}, actions "${btn.acts}"); Add reaction is an SVG glyph with no text, named "${btn.label}" (title + aria-label), and the point under it IS the button`, J(btn));
  await p1.click(btn.x, btn.y);
  const pick = await p1.evaljs(`(async () => {
    for (let i = 0; i < 40 && !document.querySelector('.rx-picker'); i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const p = document.querySelector('.rx-picker');
    const row = window.__w.big.content.querySelector('.chanwin-main .chanmsg[data-vid="' + CSS.escape(${J(prep.vid)}) + '"]');
    const pr = p ? p.getBoundingClientRect() : null;
    return { picker: !!p, top: pr ? pr.top : null, left: pr ? pr.left : null, right: pr ? pr.right : null, vw: innerWidth, focused: document.activeElement && document.activeElement.dataset.key, probes: row.querySelectorAll('[data-probe]').length, barOpen: row.querySelector(':scope > .chanmsg-bar').classList.contains('open') };
  })()`);
  // the pointer leaves the message while the picker is open: the bar stays (its picker hangs from it)
  await p1.move(4, 4);
  await sleep(350);
  const held = await p1.evaljs(`(() => { const bar = window.__w.big.content.querySelector('.chanwin-main .chanmsg[data-vid="' + CSS.escape(${J(prep.vid)}) + '"] > .chanmsg-bar'); return { op: getComputedStyle(bar).opacity, picker: !!document.querySelector('.rx-picker') }; })()`);
  // createPopover anchors at the button's bottom-left and pulls a picker that would leave the viewport back inside it —
  // the bar sits at the message's RIGHT edge, so the picker either starts at the button or ends at the viewport's edge
  // with the button above it
  const under = pick.picker && Math.abs(pick.top - (btn.bottom + 2)) <= 3 && (Math.abs(pick.left - btn.left) <= 3 || (pick.left < btn.left && pick.right >= btn.left + 1 && pick.right <= pick.vw));
  ok(under && pick.focused && pick.probes >= 1, `the press opens THE picker anchored under the bar's button (its top ${pick.top && Math.round(pick.top)} = the button's bottom ${Math.round(btn.bottom)} + 2; it spans ${pick.left && Math.round(pick.left)}–${pick.right && Math.round(pick.right)} px over the button at ${Math.round(btn.left)} px) with the first quick emoji focused (${pick.focused}); the pick will be the ${prep.idx + 1}th quick key "${prep.key}"`, J({ pick, btn }));
  ok(pick.barOpen && held.op === '1' && held.picker, 'the bar stays shown while its picker is open, even with the pointer gone (.open)', J(held));
  for (let i = 0; i < prep.idx; i++) await p1.key('ArrowRight', 'ArrowRight', 39);
  const foc = await p1.evaljs('document.activeElement && document.activeElement.dataset.key || null');
  await p1.key('Enter', 'Enter', 13);
  const d1 = await p1.evaljs(`(async () => {
    const row = window.__w.big.content.querySelector('.chanwin-main .chanmsg[data-vid="' + CSS.escape(${J(prep.vid)}) + '"]');
    let chip = null;
    for (let i = 0; i < 60 && !chip; i++) { chip = row.querySelector('.rx-chip.rx-mine[data-key="' + CSS.escape(${J(prep.key)}) + '"]'); if (!chip) await new Promise((r) => setTimeout(r, 100)); }
    const probes = [...row.querySelectorAll('[data-probe]')].filter((c) => c.isConnected).length;
    return { chip: !!chip, n: chip ? chip.querySelector('.rx-n').textContent : null, pressed: chip ? chip.getAttribute('aria-pressed') : null, probes, picker: !!document.querySelector('.rx-picker') };
  })()`);
  ok(foc === prep.key && d1.chip && d1.n === '1' && d1.pressed === 'true' && !d1.picker, `arrows + Enter picked "${foc}": the chip appears .rx-mine with count 1 (aria-pressed) and the picker closed`, J(d1));
  ok(d1.probes === prep.probes, `the strip's other chips are the very same DOM nodes (${d1.probes}/${prep.probes} probes kept)`);
  const d2 = await p1.evaljs(`(async () => {
    const row = window.__w.big.content.querySelector('.chanwin-main .chanmsg[data-vid="' + CSS.escape(${J(prep.vid)}) + '"]');
    row.querySelector('.rx-chip.rx-mine[data-key="' + CSS.escape(${J(prep.key)}) + '"]').click();
    let gone = false;
    for (let i = 0; i < 60 && !gone; i++) { gone = !row.querySelector('.rx-chip[data-key="' + CSS.escape(${J(prep.key)}) + '"]'); if (!gone) await new Promise((r) => setTimeout(r, 100)); }
    return { gone, probes: [...row.querySelectorAll('[data-probe]')].filter((c) => c.isConnected).length };
  })()`);
  ok(d2.gone && d2.probes === prep.probes, `a click on our chip removes the reaction — the chip is gone, the other ${d2.probes} chips kept`, J(d2));
}

// ── (r) THE BAR NEVER MOVES THE LAYOUT (lane reaction-hover — the owner: "不改变上下布局关系") + THE KEYBOARD ──
//    Two messages of the big room — one with no reaction, one with reactions — measured in five states: the pointer
//    away, the pointer on the message (a REAL hover), the keyboard inside the bar (a REAL Tab: focus-visible, the
//    pointer away), the bar REMOVED from the DOM (the reference), and (the bare one) with a reaction added and taken
//    back through the route. The row's offsetHeight, the next row's offsetTop and the list's scrollHeight are the same
//    in every state; the bar sits at the right edge with its middle on the head line; hidden it takes no press.
//    Then the PIXELS: the rest shot vs the keyboard shot, and the hovered shot vs the same with the bar hidden — every
//    differing pixel lies inside the bar's box; and the rest vs hovered — outside the bar's box only the row's own
//    4 % hover wash differs (no glyph moved: a moved text line differs by far more than a wash).
console.log('(r) the bar is an overlay: geometry in five states, the pixels, the keyboard');
{
  await p1.move(4, 4);
  await p1.evaljs("(() => { for (const p of document.querySelectorAll('.rx-picker, .rx-who, .context-menu')) p.remove(); const l = " + LIST('big') + "; l.scrollTop = l.scrollHeight; return 1; })()");
  await sleep(500);
  // the two rows: a HEAD row (a run's first message — its bar centres on the name line) with no reaction, plain (all
  // three actions), with no focusable of its own (its bar is the next tab stop after the row above); and one WITH chips
  // candidates from the whole list; each is scrolled to the middle and given the reaction trickle's time (its debounce +
  // the call) — a row the trickle grows a strip on is not "bare" any more, the next candidate is taken
  const pickRows = await p1.evaljs(`(async () => {
    const l = ${LIST('big')};
    const rows = [...l.querySelectorAll('.chanmsg[data-vid]')];
    const bareOk = (r) => !r.classList.contains('chanmsg-cont') && r.querySelector(':scope > .chanmsg-head') && !r.querySelector('.chanmsg-rx') && r.querySelector(':scope > .chanmsg-bar')?.dataset.acts === 'react thread quote' && !r.querySelector('a[href], img') && r.nextElementSibling;
    const richOk = (r) => r.querySelector('.chanmsg-rx .rx-chip') && r.querySelector(':scope > .chanmsg-bar') && r.nextElementSibling;
    const settle = async (r) => { r.scrollIntoView({ block: 'center' }); await new Promise((x) => setTimeout(x, 2600)); };
    let a = null, tried = 0;
    for (const r of rows.filter(bareOk).reverse().slice(0, 6)) { tried++; await settle(r); if (bareOk(r)) { a = r; break; } }
    const b = rows.filter(richOk).reverse()[0] || null;
    if (a) a.dataset.geo = 'bare';
    if (b) b.dataset.geo = 'rich';
    return { bare: a ? a.dataset.vid : null, rich: b ? b.dataset.vid : null, nBare: rows.filter(bareOk).length, nRich: rows.filter(richOk).length, tried, heads: rows.filter((r) => !r.classList.contains('chanmsg-cont')).length, acts: [...new Set(rows.map((r) => r.querySelector(':scope > .chanmsg-bar')?.dataset.acts || '(none)'))] };
  })()`);
  ok(!!pickRows.bare && !!pickRows.rich, `two rows to measure: "${pickRows.bare}" (no reaction, head row, react · thread · quote) and "${pickRows.rich}" (with reactions)`, J(pickRows));
  const GEO = (tag) => `(() => {
    const row = document.querySelector('[data-geo="${tag}"]');
    const next = row.nextElementSibling;
    const l = row.closest('.chanwin-list');
    const bar = row.querySelector(':scope > .chanmsg-bar');
    const head = row.querySelector(':scope > .chanmsg-head');
    const br = bar ? bar.getBoundingClientRect() : null, rr = row.getBoundingClientRect(), hr = head ? head.getBoundingClientRect() : null;
    const cs = bar ? getComputedStyle(bar) : null;
    const hitAt = br ? document.elementFromPoint(br.left + br.width / 2, br.top + br.height / 2) : null;
    return { h: row.offsetHeight, next: next.offsetTop, sh: l.scrollHeight, top: Math.round(rr.top * 10) / 10,
      bar: br ? { left: br.left, right: br.right, top: br.top, bottom: br.bottom, mid: (br.top + br.bottom) / 2 } : null,
      rowRight: rr.right, rowLeft: rr.left, rowTop: rr.top, rowBottom: rr.bottom, headMid: hr ? (hr.top + hr.bottom) / 2 : null,
      op: cs ? cs.opacity : null, pe: cs ? cs.pointerEvents : null, vis: cs ? cs.visibility : null, disp: cs ? cs.display : null,
      hitBar: !!(bar && hitAt && bar.contains(hitAt)), strip: !!row.querySelector(':scope > .chanmsg-rx'), active: document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.act || null : null, activeInBar: !!(bar && bar.contains(document.activeElement)) };
  })()`;
  const same = (a, b) => a.h === b.h && a.next === b.next && a.sh === b.sh && a.top === b.top;
  const pointAt = async (tag) => p1.evaljs(`(() => { const b = document.querySelector('[data-geo="${tag}"] > .chanmsg-body').getBoundingClientRect(); return { x: Math.round(b.left + Math.min(30, b.width / 2)), y: Math.round(b.top + Math.min(8, b.height / 2)) }; })()`);
  // the keyboard: focus the tab stop just BEFORE the row's bar (in document order), then a REAL Tab
  const tabInto = async (tag) => {
    await p1.evaljs(`(() => {
      const row = document.querySelector('[data-geo="${tag}"]');
      const target = row.querySelector(':scope > .chanmsg-bar .chanmsg-bar-btn');
      const all = [...document.querySelectorAll('button, a[href], input, textarea, select, [tabindex]')].filter((e) => e.tabIndex >= 0 && !e.disabled && e.getClientRects().length);
      const i = all.indexOf(target);
      if (i > 0) all[i - 1].focus({ preventScroll: true });
      return i;
    })()`);
    await p1.key('Tab', 'Tab', 9);
    await sleep(350);
  };
  const MEASURE = async (tag) => {
    const out = {};
    await p1.evaljs(`(() => { document.querySelector('[data-geo="${tag}"]').scrollIntoView({ block: 'center' }); return 1; })()`);
    await p1.move(4, 4); await sleep(600);
    out.rest = await p1.evaljs(GEO(tag));
    const at = await pointAt(tag);
    await p1.move(at.x, at.y); await sleep(350);
    out.hover = await p1.evaljs(GEO(tag));
    await p1.move(4, 4); await sleep(350);
    await tabInto(tag);
    out.key = await p1.evaljs(GEO(tag));
    await p1.evaljs("(() => { document.activeElement && document.activeElement.blur(); return 1; })()");
    await sleep(350);
    out.gone = await p1.evaljs(`(() => { const row = document.querySelector('[data-geo="${tag}"]'); const bar = row.querySelector(':scope > .chanmsg-bar'); window.__barHeld = bar; bar.remove(); return 1; })()`).then(() => p1.evaljs(GEO(tag)));
    await p1.evaljs(`(() => { document.querySelector('[data-geo="${tag}"]').appendChild(window.__barHeld); window.__barHeld = null; return 1; })()`);
    return out;
  };
  const g1 = await MEASURE('bare');
  const g2 = await MEASURE('rich');
  for (const [tag, g] of [['no reaction', g1], ['with reactions', g2]]) {
    ok(same(g.rest, g.hover) && same(g.rest, g.key) && same(g.rest, g.gone), `GEOMETRY (${tag}): the row's offsetHeight ${g.rest.h} px, the next row's offsetTop ${g.rest.next} px and the list's scrollHeight ${g.rest.sh} px are identical with the pointer away / on the message / the keyboard in the bar / the bar removed from the DOM`, J({ rest: [g.rest.h, g.rest.next, g.rest.sh, g.rest.top], hover: [g.hover.h, g.hover.next, g.hover.sh, g.hover.top], key: [g.key.h, g.key.next, g.key.sh, g.key.top], gone: [g.gone.h, g.gone.next, g.gone.sh, g.gone.top] }));
    ok(g.rest.op === '0' && g.rest.pe === 'none' && !g.rest.hitBar && g.hover.op === '1' && g.hover.pe === 'auto' && g.hover.hitBar, `VISIBILITY (${tag}): hidden at rest (opacity ${g.rest.op}, the press at its middle reaches the message, not the bar); shown under the pointer (opacity ${g.hover.op}, the bar takes the press)`, J({ rest: [g.rest.op, g.rest.pe, g.rest.hitBar], hover: [g.hover.op, g.hover.pe, g.hover.hitBar] }));
    ok(g.key.op === '1' && g.key.activeInBar && g.key.active === 'react', `KEYBOARD (${tag}): a REAL Tab from the stop before it lands on the bar's first button (${g.key.active}) and the bar shows with the pointer away`, J({ op: g.key.op, active: g.key.active }));
  }
  const b1 = g1.hover.bar;
  ok(b1 && b1.right <= g1.hover.rowRight - 1 && b1.right >= g1.hover.rowRight - 12 && b1.left > g1.hover.rowLeft + (g1.hover.rowRight - g1.hover.rowLeft) / 2, `POSITION: the bar sits at the message's RIGHT edge (its right ${b1 && Math.round(b1.right)} px, the row's ${Math.round(g1.hover.rowRight)} px)`, J(b1));
  ok(b1 && g1.hover.headMid !== null && Math.abs(b1.mid - g1.hover.headMid) <= 1.5, `POSITION: its middle is on the head line (bar ${b1 && b1.mid.toFixed(1)} px, head line ${g1.hover.headMid && g1.hover.headMid.toFixed(1)} px)`, J({ bar: b1, head: g1.hover.headMid }));
  // WITH AND WITHOUT REACTIONS: the bare row grows a strip for a reaction (that is content) and closes up EXACTLY when
  // it is taken back — no line was ever reserved; under the pointer the grown row keeps its height too
  const bareVid = pickRows.bare;
  const rxUrl = `/api/channels/fake-poll/fake-poll-big/messages/${encodeURIComponent(bareVid)}/reactions`;
  const addR = await api('POST', rxUrl, { key: 'tea' });
  const grown = await p1.evaljs(`(async () => { const row = document.querySelector('[data-geo="bare"]'); for (let i = 0; i < 60 && !row.querySelector('.chanmsg-rx'); i++) await new Promise((r) => setTimeout(r, 100)); return 1; })()`).then(() => p1.evaljs(GEO('bare')));
  const gAt = await pointAt('bare');
  await p1.move(gAt.x, gAt.y); await sleep(350);
  const grownHover = await p1.evaljs(GEO('bare'));
  await p1.move(4, 4); await sleep(200);
  const delR = await api('DELETE', `${rxUrl}/tea`);
  const back = await p1.evaljs(`(async () => { const row = document.querySelector('[data-geo="bare"]'); for (let i = 0; i < 60 && row.querySelector('.chanmsg-rx'); i++) await new Promise((r) => setTimeout(r, 100)); return 1; })()`).then(() => p1.evaljs(GEO('bare')));
  ok(addR.status === 200 && grown.strip && grown.h > g1.rest.h && same(grown, grownHover), `WITH a reaction the row grows by its strip (${g1.rest.h} → ${grown.h} px) and keeps that height under the pointer (${grownHover.h} px, next row ${grown.next} = ${grownHover.next})`, J({ add: addR.status, grown: [grown.h, grown.next], hover: [grownHover.h, grownHover.next] }));
  ok(delR.status === 200 && !back.strip && back.h === g1.rest.h && back.next === g1.rest.next, `taken back, the row closes up EXACTLY (${grown.h} → ${back.h} px = ${g1.rest.h} px before; next row ${back.next} = ${g1.rest.next}) — no line is reserved for adding one`, J({ del: delR.status, back: [back.h, back.next], before: [g1.rest.h, g1.rest.next] }));

  // ── THE PIXELS: shots of the bare row at rest / keyboard / hovered / hovered with the bar hidden ──
  await p1.evaljs(`(() => { document.querySelector('[data-geo="bare"]').scrollIntoView({ block: 'center' }); return 1; })()`);
  await sleep(600);
  const clipOf = await p1.evaljs(`(() => { const row = document.querySelector('[data-geo="bare"]'); const r = row.getBoundingClientRect(); const lr = row.closest('.chanwin-list').getBoundingClientRect(); const y0 = Math.max(lr.top, r.top - 10), y1 = Math.min(lr.bottom, r.bottom + 10); return { x: Math.round(r.left), y: Math.round(y0), width: Math.round(r.width), height: Math.round(y1 - y0) }; })()`);
  await p1.move(4, 4); await sleep(350);
  const shotRest = await p1.capture({ ...clipOf, name: 'r-row-rest.png' });
  await tabInto('bare');
  const keyGeo = await p1.evaljs(GEO('bare'));
  const shotKey = await p1.capture({ ...clipOf, name: 'r-row-keyboard.png' });
  await p1.evaljs("(() => { document.activeElement && document.activeElement.blur(); return 1; })()");
  const hAt = await pointAt('bare');
  await p1.move(hAt.x, hAt.y); await sleep(350);
  const hoverGeo = await p1.evaljs(GEO('bare'));
  const shotHover = await p1.capture({ ...clipOf, name: 'r-row-hover.png' });
  await p1.evaljs("(() => { const s = document.createElement('style'); s.id = '__nobar'; s.textContent = '.chanmsg-bar { visibility: hidden !important; transition: none !important; }'; document.head.appendChild(s); return 1; })()");
  await sleep(100);
  const shotHoverNoBar = await p1.capture({ ...clipOf, name: 'r-row-hover-nobar.png' });
  await p1.evaljs("(() => { document.getElementById('__nobar')?.remove(); return 1; })()");
  await p1.move(4, 4); await sleep(200);
  // the comparison in the page (canvas): the bounding box of every differing pixel, the largest channel delta outside a box
  // RASTER NOISE (measured, run 5 of this lane: ONE pixel 4/255 off at a glyph edge when the bar's compositing layer
  // came up): a pixel outside the bar's box that differs by ≤ NOISE/255 is antialiasing, at most NOISE_PX of them;
  // anything the bar could MOVE (a glyph, an edge, a background) differs by far more, over many pixels
  const NOISE = 8, NOISE_PX = 4;
  const DIFF = (a, b, box) => `(async () => {
    const NOISE = ${NOISE};
    const load = async (d) => { const img = new Image(); img.src = 'data:image/png;base64,' + d; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, c.width, c.height); };
    const A = await load(${J(a)}), B = await load(${J(b)});
    if (A.width !== B.width || A.height !== B.height) return { sizeMismatch: true };
    const box = ${J(box)};
    let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, outside = 0, outsideMax = 0, outsideStrong = 0;
    for (let y = 0; y < A.height; y++) for (let x = 0; x < A.width; x++) {
      const i = (y * A.width + x) * 4;
      const d = Math.max(Math.abs(A.data[i] - B.data[i]), Math.abs(A.data[i + 1] - B.data[i + 1]), Math.abs(A.data[i + 2] - B.data[i + 2]));
      if (!d) continue;
      n++; if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
      if (box && !(x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1)) { outside++; if (d > outsideMax) outsideMax = d; if (d > NOISE) outsideStrong++; }
    }
    return { n, box: n ? { x0, y0, x1, y1 } : null, outside, outsideMax, outsideStrong, w: A.width, h: A.height };
  })()`;
  // the bar's box in the clip's pixels (+1 px: its shadow's antialiased edge stays inside the bar's own paint box + the shadow)
  const barBox = (geo, pad) => ({ x0: Math.floor(geo.bar.left - clipOf.x) - pad, y0: Math.floor(geo.bar.top - clipOf.y) - pad, x1: Math.ceil(geo.bar.right - clipOf.x) + pad, y1: Math.ceil(geo.bar.bottom - clipOf.y) + pad });
  // the shadow (var(--shadow-window): 0 4px 16px in light, 0 8px 32px in dark) paints past the border box — the bar's
  // OWN paint box is its border box grown by the shadow's offset + blur; measured from the computed shadow
  const shadowPad = await p1.evaljs(`(() => { const s = getComputedStyle(document.querySelector('[data-geo="bare"] > .chanmsg-bar')).boxShadow; const n = (s.match(/-?\\d+(\\.\\d+)?px/g) || []).map((x) => Math.abs(parseFloat(x))); return Math.ceil((n[1] || 0) + (n[2] || 0)) + 1; })()`);
  const kBox = barBox(keyGeo, shadowPad), hBox = barBox(hoverGeo, shadowPad);
  const dKey = await p1.evaljs(DIFF(shotRest, shotKey, kBox));
  const dBar = await p1.evaljs(DIFF(shotHover, shotHoverNoBar, hBox));
  const dHover = await p1.evaljs(DIFF(shotRest, shotHover, hBox));
  ok(shotRest && dKey.n > 50 && dKey.outsideStrong === 0 && dKey.outside <= NOISE_PX, `PIXELS — at rest vs the keyboard in the bar: ${dKey.n} pixels differ, every one but ${dKey.outside} raster-noise pixel(s) (≤ ${dKey.outsideMax}/255) inside the bar's box (bar ${J(kBox)}, shadow pad ${shadowPad} px) — the message itself is pixel-identical`, J(dKey));
  ok(dBar.n > 50 && dBar.outsideStrong === 0 && dBar.outside <= NOISE_PX, `PIXELS — hovered vs hovered with the bar hidden: ${dBar.n} pixels differ, every one but ${dBar.outside} raster-noise pixel(s) (≤ ${dBar.outsideMax}/255) inside the bar's box (${J(hBox)})`, J(dBar));
  ok(dHover.n > 0 && dHover.outsideMax <= 16, `PIXELS — at rest vs hovered: outside the bar's box only the row's own hover wash differs (${dHover.outside} pixels, the largest channel delta ${dHover.outsideMax} ≤ 16 — a moved glyph differs by far more)`, J(dHover));

  // ── THE KEYBOARD INSIDE THE BAR: ← → move (one tab stop), Enter = the action, Esc closes the picker and gives the
  //    keyboard back to the bar's button (the data-popover protocol) ──
  await tabInto('bare');
  await p1.key('ArrowRight', 'ArrowRight', 39);
  const k1 = await p1.evaljs(`(() => { const bar = document.querySelector('[data-geo="bare"] > .chanmsg-bar'); return { act: document.activeElement.dataset.act, tabs: [...bar.querySelectorAll('.chanmsg-bar-btn')].map((b) => b.tabIndex).join(','), op: getComputedStyle(bar).opacity }; })()`);
  await p1.key('ArrowLeft', 'ArrowLeft', 37);
  await p1.key('Enter', 'Enter', 13, '\r');
  const k2 = await p1.evaljs(`(async () => { for (let i = 0; i < 40 && !document.querySelector('.rx-picker'); i++) await new Promise((r) => setTimeout(r, 50)); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); return { picker: !!document.querySelector('.rx-picker'), inPicker: !!(document.activeElement && document.activeElement.closest('.rx-picker')) }; })()`);
  await p1.key('Escape', 'Escape', 27);
  await sleep(300);
  const k3 = await p1.evaljs(`(() => { const bar = document.querySelector('[data-geo="bare"] > .chanmsg-bar'); return { picker: !!document.querySelector('.rx-picker'), act: document.activeElement && document.activeElement.dataset.act, inBar: bar.contains(document.activeElement), op: getComputedStyle(bar).opacity, open: bar.classList.contains('open') }; })()`);
  ok(k1.act === 'thread' && k1.tabs === '-1,0,-1' && k1.op === '1', `→ moves inside the bar (to "${k1.act}"; ONE tab stop follows it: ${k1.tabs})`, J(k1));
  ok(k2.picker && k2.inPicker && !k3.picker && k3.inBar && k3.act === 'react' && k3.op === '1' && !k3.open, 'Enter on Add reaction opens the picker with the keyboard in it; Esc closes it and the keyboard is back on the bar\'s Add reaction, the bar still shown', J({ k2, k3 }));
  await p1.evaljs("(() => { document.activeElement && document.activeElement.blur(); for (const e of document.querySelectorAll('[data-geo]')) delete e.dataset.geo; return 1; })()");
}

// ── (t) REPLY IN THREAD and QUOTE from the bar (lane reaction-hover — the owner: "把 reply in thread，quote 也都放在鼠标
//    悬浮按钮里"): a plain message is QUOTED (the composer says so; the send carries the quote; the new message shows
//    what it quotes); a topic's message offers no Quote; Reply in thread on a reply inside a topic opens that topic
//    answering it; on a plain message it opens a NEW thread rooted at it, whose first reply makes it a topic ──
console.log('(t) reply in thread and quote from the bar');
{
  await p1.move(4, 4);
  await p1.evaljs("(() => { const l = " + LIST('big') + "; l.scrollTop = l.scrollHeight; return 1; })()");
  await sleep(400);
  const barBtn = (vid, act) => p1.evaljs(`(() => { const row = window.__w.big.content.querySelector('.chanwin-main .chanmsg[data-vid="' + CSS.escape(${J(vid)}) + '"]'); const b = row && row.querySelector(':scope > .chanmsg-bar [data-act="${act}"]'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), label: b.getAttribute('aria-label') }; })()`);
  // 2.369.200 integration (the heavy run's red, reproduced alone at load ~25): a row scrolled into view gets its reaction strip /
  // thread chip from a fetch that can land AFTER the measure — a row above grew 34 px between barBtn and the press, and the
  // press hit a paragraph. The row is measured only once it holds still (its top and height unchanged over two reads).
  const rowStill = async (vid) => { let last = null; for (let i = 0; i < 40; i++) { const r = await p1.evaljs(`(() => { const row = window.__w.big.content.querySelector('.chanwin-main .chanmsg[data-vid="' + CSS.escape(${J(vid)}) + '"]'); if (!row) return null; const q = row.getBoundingClientRect(); const l = row.closest('.chanwin-list'); return Math.round(q.top) + ':' + Math.round(q.height) + ':' + (l ? l.scrollHeight : 0); })()`); if (r !== null && r === last) return true; last = r; await sleep(200); } return false; };
  const hoverRow = async (vid) => { await p1.evaljs(`(() => { window.__w.big.content.querySelector('.chanwin-main .chanmsg[data-vid="' + CSS.escape(${J(vid)}) + '"]').scrollIntoView({ block: 'center' }); return 1; })()`); await sleep(200); await rowStill(vid); const at = await p1.evaljs(`(() => { const row = window.__w.big.content.querySelector('.chanwin-main .chanmsg[data-vid="' + CSS.escape(${J(vid)}) + '"]'); const b = (row.querySelector(':scope > .chanmsg-body') || row).getBoundingClientRect(); return { x: Math.round(b.left + Math.min(30, b.width / 2)), y: Math.round(b.top + Math.min(8, b.height / 2)) }; })()`); await p1.move(at.x, at.y); await sleep(350); await rowStill(vid); };
  const kinds = await p1.evaljs(`(() => {
    const rows = [...window.__w.big.content.querySelectorAll('.chanwin-main .chanmsg[data-vid]')];
    const kindOf = (r) => (r._place && r._place.kind) || 'plain';
    const pick = (f) => rows.filter(f).slice(-3)[0] || null;
    const plain = rows.filter((r) => kindOf(r) === 'plain' && r.querySelector(':scope > .chanmsg-bar') && r.querySelector(':scope > .chanmsg-body') && (r.querySelector(':scope > .chanmsg-body').textContent || '').trim());
    const topicReply = pick((r) => kindOf(r) === 'topic-reply' && r.querySelector(':scope > .chanmsg-bar'));
    const acts = (r) => r ? r.querySelector(':scope > .chanmsg-bar').dataset.acts : null;
    const census = {};
    for (const r of rows) { const k = kindOf(r); const a = r.querySelector(':scope > .chanmsg-bar') ? r.querySelector(':scope > .chanmsg-bar').dataset.acts : '(none)'; census[k + ' → ' + a] = (census[k + ' → ' + a] || 0) + 1; }
    const q = plain[plain.length - 2] || null, p = plain[plain.length - 4] || null;
    return { census, quoteVid: q ? q.dataset.vid : null, quoteWho: q ? q.querySelector('.chanmsg-head b, b')?.textContent || null : null, threadVid: p ? p.dataset.vid : null, topicReply: topicReply ? topicReply.dataset.vid : null, topicReplyActs: acts(topicReply) };
  })()`);
  const bad = Object.keys(kinds.census).filter((k) => (/^topic-/.test(k) && /quote/.test(k.split(' → ')[1])) || (/^(plain|quote) → /.test(k) && k.split(' → ')[1] !== 'react thread quote'));
  ok(bad.length === 0 && kinds.quoteVid && kinds.threadVid && kinds.topicReply, `every drawn row's bar follows the table — plain / quote: react · thread · quote; inside a topic: no Quote (${Object.entries(kinds.census).map(([k, n]) => k + ' ×' + n).join('; ')})`, J({ bad, kinds }));
  // QUOTE
  await hoverRow(kinds.quoteVid);
  const qb = await barBtn(kinds.quoteVid, 'quote');
  ok(!!qb && qb.label === '引用', `the plain message's bar names its Quote "${qb && qb.label}"`, J(qb));
  await p1.click(qb.x, qb.y);
  await sleep(300);
  const QTEXT = `quoted reply ${process.pid}`;
  const q1 = await p1.evaljs(`(() => { const foot = window.__w.big.content.querySelector('.chanwin-main .chanwin-foot'); const line = foot.querySelector('.chanwin-quote'); const ta = foot.querySelector('textarea'); return { line: line ? line.textContent : null, of: line ? line.dataset.quoteOf : null, focused: document.activeElement === ta, draft: ta ? ta.value : null }; })()`);
  ok(q1.line && q1.of === kinds.quoteVid && /引用回复/.test(q1.line) && q1.focused && q1.draft === 'main draft 42', `Quote puts the quote above the composer ("${q1.line}"), the keyboard in the box, the draft kept`, J(q1));
  const q2 = await p1.evaljs(`(async () => {
    const w = window.__w.big;
    const ta = w.content.querySelector('.chanwin-main .chanwin-foot textarea');
    ta.value = ${J(QTEXT)}; ta.dispatchEvent(new Event('input', { bubbles: true }));
    w.content.querySelector('.chanwin-main [data-channel-direct]').click();
    let row = null;
    for (let i = 0; i < 200 && !row; i++) { row = [...w.content.querySelectorAll('.chanwin-main .chanwin-list .chanmsg')].find((r) => r.textContent.includes(${J(QTEXT)})) || null; if (!row) await new Promise((r) => setTimeout(r, 100)); }
    await new Promise((r) => setTimeout(r, 400));
    const strip = row && row.querySelector('.chanmsg-replyq');
    return { row: !!row, of: strip ? strip.dataset.replyOf : null, kind: strip ? strip.dataset.placeKind : null, line: !!w.content.querySelector('.chanwin-main .chanwin-quote'), vid: row ? row.dataset.vid : null };
  })()`);
  const sent = await api('GET', '/api/channels/fake-poll/fake-poll-big/messages?limit=20');
  const rec = (sent.json.records || []).find((r) => r.vendorId === q2.vid);
  ok(q2.row && q2.of === kinds.quoteVid && q2.kind === 'quote' && !q2.line && rec && rec.replyTo === kinds.quoteVid, `the send carried the quote: the new message shows what it quotes (data-place-kind "${q2.kind}", of ${q2.of}), the stored record answers ${rec && rec.replyTo}, and the composer's quote line is gone`, J({ q2, replyTo: rec && rec.replyTo }));
  await p1.evaljs("(() => { const ta = window.__w.big.content.querySelector('.chanwin-main .chanwin-foot textarea'); if (ta) { ta.value = 'main draft 42'; ta.dispatchEvent(new Event('input', { bubbles: true })); } return 1; })()");
  // REPLY IN THREAD on a reply INSIDE a topic: no Quote; the pane opens on that topic, answering this reply
  ok(kinds.topicReplyActs === 'react thread', `a reply inside a topic offers no Quote (its bar: "${kinds.topicReplyActs}")`);
  await hoverRow(kinds.topicReply);
  const tb = await barBtn(kinds.topicReply, 'thread');
  await p1.click(tb.x, tb.y);
  const t1 = await p1.evaljs(`(async () => {
    const w = window.__w.big;
    const pane = w.content.querySelector('.chanthread');
    for (let i = 0; i < 100 && !(pane && !pane.hidden && pane.querySelector('.chanthread-foot textarea')); i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 300));
    const row = w.content.querySelector('.chanwin-main .chanmsg[data-vid="' + CSS.escape(${J(kinds.topicReply)}) + '"]');
    const who = row && row._place && row._place.thread ? null : null;
    const target = pane.querySelector('.chanthread-target');
    return { open: !pane.hidden, target: target ? target.textContent : null, focused: document.activeElement === pane.querySelector('.chanthread-foot textarea'), inPane: !!pane.querySelector('.chanthread-list .chanmsg[data-vid="' + CSS.escape(${J(kinds.topicReply)}) + '"]') };
  })()`);
  ok(tb.label === '在话题中回复' && t1.open && t1.inPane && /^回复 /.test(t1.target || '') && t1.focused, `"${tb.label}" on a topic reply opens its topic in the pane answering THAT reply ("${t1.target}"), the keyboard in the pane's box`, J(t1));
  // in the pane: a reply's bar picks it; the root's bar answers the thread itself
  const pr = await p1.evaljs(`(() => { const pane = window.__w.big.content.querySelector('.chanthread'); const rows = [...pane.querySelectorAll('.chanthread-list .chanmsg[data-vid]')]; const root = rows.find((r) => r.classList.contains('chanthread-rootrow')); const reply = rows.filter((r) => !r.classList.contains('chanthread-rootrow')).pop(); const acts = (r) => r && r.querySelector(':scope > .chanmsg-bar') ? r.querySelector(':scope > .chanmsg-bar').dataset.acts : null; return { root: root ? root.dataset.vid : null, reply: reply ? reply.dataset.vid : null, rootActs: acts(root), replyActs: acts(reply), replyLabel: reply ? reply.querySelector(':scope > .chanmsg-bar [data-act="thread"]').getAttribute('aria-label') : null, picks: pane.querySelectorAll('.chanthread-pick').length }; })()`);
  ok(pr.rootActs === 'react thread' && pr.replyActs === 'react thread' && pr.replyLabel === '在话题中回复这条消息' && pr.picks === 0, `in the pane every row's bar is react · thread (never Quote); a reply's is "${pr.replyLabel}"; the old ↩ button is gone (${pr.picks})`, J(pr));
  await p1.evaljs(`(() => { const pane = window.__w.big.content.querySelector('.chanthread'); const r = pane.querySelector('.chanthread-list .chanmsg[data-vid="' + CSS.escape(${J(pr.root)}) + '"]'); r.scrollIntoView({ block: 'center' }); return 1; })()`);
  const rootAt = await p1.evaljs(`(() => { const r = window.__w.big.content.querySelector('.chanthread .chanmsg[data-vid="' + CSS.escape(${J(pr.root)}) + '"] > .chanmsg-body').getBoundingClientRect(); return { x: Math.round(r.left + 20), y: Math.round(r.top + 6) }; })()`);
  await p1.move(rootAt.x, rootAt.y); await sleep(350);
  const rb = await p1.evaljs(`(() => { const b = window.__w.big.content.querySelector('.chanthread .chanmsg[data-vid="' + CSS.escape(${J(pr.root)}) + '"] > .chanmsg-bar [data-act="thread"]'); const r = b.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  await p1.click(rb.x, rb.y);
  await sleep(250);
  const t2 = await p1.evaljs(`(() => { const pane = window.__w.big.content.querySelector('.chanthread'); return { target: !!pane.querySelector('.chanthread-target'), focused: document.activeElement === pane.querySelector('.chanthread-foot textarea') }; })()`);
  ok(!t2.target && t2.focused, 'the ROOT\'s Reply in thread answers the thread itself (the "Replying to" line is gone), the keyboard in the box', J(t2));
  await p1.evaljs("(() => { const x = window.__w.big.content.querySelector('.chanthread-close'); if (x) x.click(); return 1; })()");
  // REPLY IN THREAD on a PLAIN message: a NEW thread — the pane shows the message as its root and no replies; the first
  // reply mints the thread: it lands in the pane, the message becomes a topic root (its chip) and loses its Quote
  await p1.move(4, 4);
  await hoverRow(kinds.threadVid);
  const pb = await barBtn(kinds.threadVid, 'thread');
  await p1.click(pb.x, pb.y);
  const n1 = await p1.evaljs(`(async () => {
    const pane = window.__w.big.content.querySelector('.chanthread');
    for (let i = 0; i < 100 && !(pane && !pane.hidden && pane.querySelector('.chanthread-list .chanmsg')); i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 300));
    const root = pane.querySelector('.chanthread-list .chanthread-rootrow');
    return { open: !pane.hidden, root: root ? root.dataset.vid : null, empty: (pane.querySelector('.chanthread-list .chanwin-empty') || {}).textContent || null, notLoaded: /尚未加载/.test(pane.textContent), focused: document.activeElement === pane.querySelector('.chanthread-foot textarea') };
  })()`);
  ok(n1.open && n1.root === kinds.threadVid && n1.empty === '还没有回复。' && !n1.notLoaded && n1.focused, `Reply in thread on a plain message opens a NEW thread: the message is its root, "${n1.empty}", never "not loaded"; the keyboard in the box`, J(n1));
  const NTEXT = `first in a new thread ${process.pid}`;
  const n2 = await p1.evaljs(`(async () => {
    const w = window.__w.big;
    const pane = w.content.querySelector('.chanthread');
    const ta = pane.querySelector('.chanthread-foot textarea');
    ta.value = ${J(NTEXT)}; ta.dispatchEvent(new Event('input', { bubbles: true }));
    pane.querySelector('[data-thread-send]').click();
    let inPane = null, chip = null;
    for (let i = 0; i < 200 && !(inPane && chip); i++) {
      inPane = [...pane.querySelectorAll('.chanthread-list .chanmsg')].find((r) => r.textContent.includes(${J(NTEXT)})) || null;
      const row = w.content.querySelector('.chanwin-main .chanmsg[data-vid="' + CSS.escape(${J(kinds.threadVid)}) + '"]');
      chip = row && row.querySelector('.chanmsg-thread-chip');
      if (!(inPane && chip)) await new Promise((r) => setTimeout(r, 100));
    }
    await new Promise((r) => setTimeout(r, 300));
    const row = w.content.querySelector('.chanwin-main .chanmsg[data-vid="' + CSS.escape(${J(kinds.threadVid)}) + '"]');
    return { inPane: !!inPane, chip: !!chip, empty: !!pane.querySelector('.chanthread-list .chanwin-empty'), acts: row && row.querySelector(':scope > .chanmsg-bar') ? row.querySelector(':scope > .chanmsg-bar').dataset.acts : null };
  })()`);
  ok(n2.inPane && !n2.empty && n2.chip && n2.acts === 'react thread', `the first reply lands in the new thread (the "no replies" line gone); the message became a topic root — its chip grew and its bar re-synced to "${n2.acts}" (no Quote inside a topic)`, J(n2));
  await p1.shot('t-new-thread.png');
  await p1.evaljs("(() => { const x = window.__w.big.content.querySelector('.chanthread-close'); if (x) x.click(); return 1; })()");
  await p1.move(4, 4);
}

// ── (e) ANOTHER CLIENT'S REACTION arrives in place ──
console.log('(e) another client\'s reaction, live');
{
  const p2 = await newPage({ lang: 'zh' });
  ok(p2.ready, 'a second page (another client) loaded');
  await p2.evaljs(OPEN('fake-poll', 'fake-poll-big', 'big', { min: 20 }));
  const setup = await p1.evaljs(`(() => {
    const w = window.__w.big;
    const rows = [...w.content.querySelectorAll('.chanwin-main .chanwin-list .chanmsg[data-vid]')];
    rows.forEach((r, i) => { r.dataset.rowProbe = 'r' + i; });
    window.__msgFetches = 0;
    if (!window.__fSpy) { window.__fSpy = true; const f0 = window.fetch; window.fetch = function (u, ...a) { if (/\\/messages(\\?|$)/.test(String((u && u.url) || u))) window.__msgFetches++; return f0.call(this, u, ...a); }; }
    const row = rows[rows.length - 3];
    const have = [...row.querySelectorAll('.rx-chip:not(.rx-add)')].map((c) => c.dataset.key);
    return { stamped: rows.length, vid: row.dataset.vid, have };
  })()`);
  const K2 = ['rocket', 'bulb', 'coffee', 'tea', 'moon'].find((k) => !setup.have.includes(k));
  const t0 = Date.now();
  const b = await p2.evaljs(`(async () => { const r = await fetch('/api/channels/fake-poll/fake-poll-big/messages/' + encodeURIComponent(${J(setup.vid)}) + '/reactions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: ${J(K2)} }) }); return { status: r.status, body: await r.json() }; })()`);
  const e = await p1.evaljs(`(async () => {
    const w = window.__w.big;
    const row = w.content.querySelector('.chanwin-main .chanmsg[data-vid="' + CSS.escape(${J(setup.vid)}) + '"]');
    let chip = null;
    for (let i = 0; i < 40 && !chip; i++) { chip = row.querySelector('.rx-chip[data-key="' + CSS.escape(${J(K2)}) + '"]'); if (!chip) await new Promise((r) => setTimeout(r, 50)); }
    const kept = [...w.content.querySelectorAll('[data-row-probe]')].filter((r) => r.isConnected).length;
    return { chip: !!chip, n: chip ? chip.querySelector('.rx-n').textContent : null, mine: chip ? chip.classList.contains('rx-mine') : null, kept, fetches: window.__msgFetches };
  })()`);
  const ms = Date.now() - t0;
  ok(b.status === 200 && e.chip && Number(e.n) >= 1 && ms < 2000 + 1500, `page B reacted "${K2}"; page A's row grew the chip IN PLACE (${e.n}) within ${ms} ms`, J({ b: b.status, e }));
  ok(e.kept === setup.stamped && e.fetches === 0, `no row was rebuilt (${e.kept}/${setup.stamped} probe-stamped rows are the same nodes) and page A fetched no /messages for it (${e.fetches}) — the broadcast carried the RESULT`, J(e));
  // attack 16: a window that MISSED a patch (its chip for K2 is gone — a dropped socket) reconciles on the next
  // message broadcast: the re-read page carries the folded list, the strip is patched by key, no row replaced
  await p1.evaljs(`(() => { const c = window.__w.big.content.querySelector('.chanwin-main .chanmsg[data-vid="' + CSS.escape(${J(setup.vid)}) + '"] .rx-chip[data-key="' + CSS.escape(${J(K2)}) + '"]'); if (c) c.remove(); return !!c; })()`);
  await p2.evaljs(`fetch('/api/channels/fake-poll/fake-poll-big/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'a new message ${process.pid}', replyTo: ${J(setup.vid)}, inThread: true, expectWakes: 0 }) }).then((r) => r.status)`);   // a thread reply: the send kicks the room's pass at once
  const e16 = await p1.evaljs(`(async () => {
    const w = window.__w.big;
    let chip = null, fresh = false;
    for (let i = 0; i < 100 && !(chip && fresh); i++) {
      chip = w.content.querySelector('.chanwin-main .chanmsg[data-vid="' + CSS.escape(${J(setup.vid)}) + '"] .rx-chip[data-key="' + CSS.escape(${J(K2)}) + '"]');
      fresh = [...w.content.querySelectorAll('.chanwin-main .chanmsg')].some((r) => r.textContent.includes('a new message ${process.pid}'));
      if (!(chip && fresh)) await new Promise((r) => setTimeout(r, 100));
    }
    return { chip: !!chip, fresh, kept: [...w.content.querySelectorAll('[data-row-probe]')].filter((r) => r.isConnected).length };
  })()`);
  ok(e16.chip && e16.fresh && e16.kept === setup.stamped, `attack 16: a window that missed a patch (its chip removed) gets it back from the next message broadcast's re-read — reconciled by key, the new message appended, ${e16.kept}/${setup.stamped} rows the same nodes`, J(e16));
  await p2.evaljs(`fetch('/api/channels/fake-poll/fake-poll-big/messages/' + encodeURIComponent(${J(setup.vid)}) + '/reactions/' + encodeURIComponent(${J(K2)}), { method: 'DELETE' }).then((r) => r.status)`);
  p2.close();
}

// ── (g) THE PHONE: the who-list on a long press, a tap toggles, the + never alone; (b) at 360 px: stacked + Back ──
console.log('(g) the phone (360 × 740, touch)');
{
  const p3 = await newPage({ lang: 'zh', phone: true, font: true });
  ok(p3.ready, 'the phone page loaded (360 × 740, touch emulation)');
  const o = await p3.evaljs(OPEN('fake-poll', 'fake-poll-big', 'big', { min: 10 }));
  await sleep(2000);
  const target = await p3.evaljs(`(async () => {
    const w = window.__w.big;
    const l = w.content.querySelector('.chanwin-main .chanwin-list');
    const lr = l.getBoundingClientRect();
    const all = [...l.querySelectorAll('.rx-chip:not(.rx-add):not(.rx-mine)')];
    if (!all.length) return null;
    const c = all[all.length - 1];
    c.scrollIntoView({ block: 'center' });
    c.dataset.phoneProbe = '1';
    await new Promise((r) => setTimeout(r, 400));
    const r = c.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), key: c.dataset.key, n: c.querySelector('.rx-n').textContent, vid: c.closest('.chanmsg').dataset.vid, touch: window.app.isTouch };
  })()`);
  ok(o.rows >= 10 && target && target.touch, `the phone draws the room with chips (${o.rows} rows), the app judged the device touch-first`, J(target));
  if (target) {
    await p3.touch(target.x, target.y, 700);
    await sleep(300);
    const who = await p3.evaljs("(() => { const p = document.querySelector('.rx-who'); return p ? { rows: p.querySelectorAll('.rx-who-row').length, head: p.querySelector('.rx-who-head').textContent } : null; })()");
    ok(!!who && who.rows >= 1, `a LONG PRESS on a chip opens the who-list (${who && who.rows} name(s), "${who && who.head}")`, J(who));
    const n0 = await p3.evaljs(`(() => { const c = document.querySelector('[data-phone-probe]'); return c ? { n: c.querySelector('.rx-n').textContent, mine: c.classList.contains('rx-mine') } : null; })()`);
    ok(n0 && n0.n === target.n && !n0.mine, 'the long press did NOT toggle the chip (the synthesized click is suppressed)', J(n0));
    await p3.key('Escape', 'Escape', 27);
    await p3.evaljs("(() => { for (const p of document.querySelectorAll('.rx-who')) p.remove(); return 1; })()");
    await p3.touch(target.x, target.y, 60);
    const t1 = await p3.evaljs(`(async () => { let c = null; for (let i = 0; i < 60; i++) { c = document.querySelector('.chanmsg[data-vid="' + CSS.escape(${J(target.vid)}) + '"] .rx-chip[data-key="' + CSS.escape(${J(target.key)}) + '"]'); if (c && c.classList.contains('rx-mine')) break; await new Promise((r) => setTimeout(r, 100)); } return c ? { mine: c.classList.contains('rx-mine'), n: c.querySelector('.rx-n').textContent, same: c.dataset.phoneProbe === '1' } : null; })()`);
    ok(t1 && t1.mine && Number(t1.n) === Number(target.n) + 1 && t1.same, `a TAP toggles: the chip is now ours (${target.n} → ${t1 && t1.n}), the same node`, J(t1));
    await p3.touch(target.x, target.y, 60);
    const t2 = await p3.evaljs(`(async () => { let c = null; for (let i = 0; i < 60; i++) { c = document.querySelector('.chanmsg[data-vid="' + CSS.escape(${J(target.vid)}) + '"] .rx-chip[data-key="' + CSS.escape(${J(target.key)}) + '"]'); if (c && !c.classList.contains('rx-mine')) break; await new Promise((r) => setTimeout(r, 100)); } return c ? { mine: c.classList.contains('rx-mine'), n: c.querySelector('.rx-n').textContent } : null; })()`);
    ok(t2 && !t2.mine && t2.n === target.n, 'a second tap takes it back', J(t2));
  }
  // lane reaction-hover: the `+` that sat at the end of every strip (and alone under every message) is gone — a strip
  // holds chips only, and the hover bar is not drawn on a touch device (its long press is the door — leg (p))
  const strips = await p3.evaljs(`(() => {
    const w = window.__w.big;
    const s = [...w.content.querySelectorAll('.chanmsg-rx')];
    const bars = [...w.content.querySelectorAll('.chanmsg-bar')];
    return { strips: s.length, plus: w.content.querySelectorAll('.rx-add').length, empty: s.filter((x) => !x.querySelector('.rx-chip')).length, bars: bars.length, shown: bars.filter((b) => getComputedStyle(b).display !== 'none').length, hoverNone: matchMedia('(hover: none) and (pointer: coarse)').matches };
  })()`);
  ok(strips.strips >= 3 && strips.plus === 0 && strips.empty === 0 && strips.hoverNone && strips.bars >= 3 && strips.shown === 0, `the phone: ${strips.strips} strips, no "+" and no empty strip; the ${strips.bars} hover bars are not drawn (hover: none)`, J(strips));
  // (b) at 360: the STACKED pane covers the list; Back returns with the list's scrollTop unchanged
  const s = await p3.evaljs(`(async () => {
    const w = window.__w.big;
    const l = w.content.querySelector('.chanwin-main .chanwin-list');
    const chips = [...l.querySelectorAll('.chanmsg-thread-chip')];
    if (!chips.length) return { chips: 0 };
    l.scrollTop = Math.max(0, l.scrollHeight - l.clientHeight - 40);
    await new Promise((r) => setTimeout(r, 300));
    const st0 = l.scrollTop;
    // THE READING POSITION = the first row in view and its offset from the list's top (content may change under a
    // covered list — a reaction chip patched in above; the browser's scroll anchoring keeps that row in place)
    const lr0 = l.getBoundingClientRect();
    const firstRow = [...l.querySelectorAll('.chanmsg[data-vid]')].find((r) => r.getBoundingClientRect().bottom > lr0.top + 2);
    const anchor0 = firstRow ? { vid: firstRow.dataset.vid, off: Math.round(firstRow.getBoundingClientRect().top - lr0.top) } : null;
    window.__anchor0 = anchor0;
    chips[chips.length - 1].click();
    const pane = w.content.querySelector('.chanthread');
    for (let i = 0; i < 100 && !(pane && !pane.hidden && pane.querySelectorAll('.chanthread-list .chanmsg').length >= 1); i++) await new Promise((r) => setTimeout(r, 50));
    const pr = pane.getBoundingClientRect(), mr = w.content.querySelector('.chanwin-main').getBoundingClientRect();
    const covers = pr.left <= mr.left + 1 && pr.right >= mr.right - 1 && pr.top <= mr.top + 1 && pr.bottom >= mr.bottom - 1;
    const back = pane.querySelector('.chanthread-back');
    const bb = back ? back.getBoundingClientRect() : null;
    return { chips: chips.length, stacked: pane.classList.contains('chanthread-stacked'), covers, st0, anchor0, back: !!back, backSize: bb ? [Math.round(bb.width), Math.round(bb.height)] : null };
  })()`);
  ok(s.chips >= 1 && s.stacked && s.covers && s.back && s.backSize[0] >= 36 && s.backSize[1] >= 36, `at 360 px the thread is a PUSHED view: stacked over the list, a Back button ${s.backSize && s.backSize.join('×')} px`, J(s));
  await p3.shot('g-phone-stacked.png');
  // attack 20: the pane open, the window minimized and restored — the pane's draft and scroll survive; the layout
  // record opens the LIST (a pane is never persisted)
  const a20 = await p3.evaljs(`(async () => {
    const w = window.__w.big;
    const pane = w.content.querySelector('.chanthread');
    const ta = pane.querySelector('.chanthread-foot textarea');
    ta.value = 'draft kept 20'; ta.dispatchEvent(new Event('input', { bubbles: true }));
    const pl = pane.querySelector('.chanthread-list'); pl.scrollTop = 0; const st0 = pl.scrollTop;
    window.app.wm.minimize(w.id); await new Promise((r) => setTimeout(r, 400));
    window.app.wm.restore(w.id); await new Promise((r) => setTimeout(r, 400));
    const ta2 = pane.querySelector('.chanthread-foot textarea');
    return { open: !pane.hidden, draft: ta2 ? ta2.value : null, st: pl.scrollTop, st0, spec: w._openSpec || null };
  })()`);
  ok(a20.open && a20.draft === 'draft kept 20' && Math.abs(a20.st - a20.st0) <= 2 && a20.spec && JSON.stringify(Object.keys(a20.spec).sort()) === JSON.stringify(['action', 'adapterId', 'convId']), 'attack 20: minimize + restore keeps the pane open with its draft and scroll; the layout record names only the conversation (a replay opens the list, never a pane)', J(a20));
  await p3.evaljs("(() => { const ta = window.__w.big.content.querySelector('.chanthread-foot textarea'); if (ta) { ta.value = ''; ta.dispatchEvent(new Event('input', { bubbles: true })); } return 1; })()");
  const back = await p3.evaljs(`(async () => { const w = window.__w.big; const pane = w.content.querySelector('.chanthread'); pane.querySelector('.chanthread-back').click(); await new Promise((r) => setTimeout(r, 300)); const l = w.content.querySelector('.chanwin-main .chanwin-list'); const a0 = window.__anchor0; const row = a0 && l.querySelector('.chanmsg[data-vid="' + CSS.escape(a0.vid) + '"]'); const off = row ? Math.round(row.getBoundingClientRect().top - l.getBoundingClientRect().top) : null; return { hidden: pane.hidden, st: l.scrollTop, anchor: a0, off, focus: document.activeElement && document.activeElement.className }; })()`);
  ok(back.hidden && back.anchor && back.off !== null && Math.abs(back.off - back.anchor.off) <= 4, `Back returns to the list at the same reading position (row ${back.anchor && back.anchor.vid} at ${back.anchor && back.anchor.off} → ${back.off} px; scrollTop ${s.st0} → ${back.st})`, J(back));

  // ── (h) zh + ja at 360 px, DejaVu Sans: the chip, the tag and the pane bar's words drawn WHOLE ──
  console.log('(h) zh + ja at 360 px');
  const MEASURE = `(async () => {
    const w = window.__w.big;
    const out = [];
    const whole = (el, what) => { if (!el) return; const r = el.getBoundingClientRect(); const row = el.closest('.chanmsg, .chanthread-bar'); const rr = row ? row.getBoundingClientRect() : r; out.push({ what, text: el.textContent, ok: el.scrollWidth <= el.clientWidth + 1 && r.right <= rr.right + 1 && r.width > 0 }); };
    for (const c of [...w.content.querySelectorAll('.chanwin-main .chanmsg-thread-chip')].slice(-6)) whole(c, 'chip');
    for (const c of [...w.content.querySelectorAll('.chanwin-main .chanmsg-in-thread')].slice(-6)) whole(c, 'tag');
    const chip = [...w.content.querySelectorAll('.chanwin-main .chanmsg-thread-chip')].pop();
    if (chip) { chip.click(); const pane = w.content.querySelector('.chanthread'); for (let i = 0; i < 100 && pane.hidden; i++) await new Promise((r) => setTimeout(r, 50)); await new Promise((r) => setTimeout(r, 400)); whole(pane.querySelector('.chanthread-head b'), 'pane title'); whole(pane.querySelector('.chanthread-count'), 'pane count'); whole(pane.querySelector('.chanthread-foot .chanwin-note-text'), 'pane composer line'); const ta = pane.querySelector('.chanthread-foot textarea'); out.push({ what: 'placeholder', text: ta ? ta.placeholder : null, ok: !!ta }); pane.querySelector('.chanthread-back') && pane.querySelector('.chanthread-back').click(); }
    return out;
  })()`;
  const zh = await p3.evaljs(MEASURE);
  // attack 21: a chip that would wrap in ja at 360 px — every pill measured whole
  ok(zh.length >= 4 && zh.every((x) => x.ok) && zh.some((x) => x.what === 'chip' && /条回复/.test(x.text)) && zh.some((x) => x.what === 'placeholder' && x.text === '在话题中回复…') && zh.every((x) => !x.text.includes('线程')), `zh: every chip / tag / pane word drawn whole (${zh.length}: ${[...new Set(zh.map((x) => x.text))].slice(0, 5).join(' | ')})`, J(zh.filter((x) => !x.ok)));
  await p3.shot('h-zh.png');
  p3.close();
  const p4 = await newPage({ lang: 'ja', phone: true, font: true });
  await p4.evaljs(OPEN('fake-poll', 'fake-poll-big', 'big', { min: 10 }));
  await sleep(1200);
  const ja = await p4.evaljs(MEASURE);
  ok(ja.length >= 4 && ja.every((x) => x.ok) && ja.some((x) => x.what === 'chip' && /件の返信/.test(x.text)) && ja.some((x) => x.what === 'placeholder' && x.text === 'スレッドで返信…'), `ja: every chip / tag / pane word drawn whole (${ja.length}: ${[...new Set(ja.map((x) => x.text))].slice(0, 5).join(' | ')})`, J(ja.filter((x) => !x.ok)));
  await p4.shot('h-ja.png');
  // naive-user pass ⑥ CONTROL: the pre-fix composer line (nowrap + ellipsis, the main composer's rule) in ja at 360 px CUTS
  // the "sent at once, as you" half — the leg above would read it red.
  // FONT-INDEPENDENT (lane-mirror-197, 2026-09-29): the premise "the one-line text is wider than its box at 360 px" is a fact
  // about the FONT — the Actions runner has no CJK family and DejaVu's fallback boxes are narrower than the glyphs a ja user
  // sees, so there the line FITS and the pre-fix rule has nothing to cut (`cutNow:false`, red twice on the mirror, green here).
  // The control measures the one-line width; when it fits, the box is narrowed BY CONSTRUCTION to 60 % of that width and the
  // RULE's effect is judged there: the pre-fix rule cuts, the product rule wraps it whole — under any font.
  const cut = await p4.evaljs(`(async () => {
    const w = window.__w.big; const chip = [...w.content.querySelectorAll('.chanwin-main .chanmsg-thread-chip')].pop(); chip.click();
    const pane = w.content.querySelector('.chanthread'); for (let i = 0; i < 100 && pane.hidden; i++) await new Promise((r) => setTimeout(r, 50)); await new Promise((r) => setTimeout(r, 400));
    const n = pane.querySelector('.chanthread-foot .chanwin-note-text'); if (!n) return null;
    const raf2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const whole = n.scrollWidth <= n.clientWidth + 1;                                  // the product rule at 360 px, this font
    const st = document.createElement('style'); st.textContent = '.chanthread-composer .chanwin-note-text { white-space: nowrap !important; overflow: hidden !important; }'; document.head.appendChild(st);
    await raf2();
    const lineW = n.scrollWidth, boxW = n.clientWidth;                                  // the line on ONE line vs its box
    const cutAt360 = lineW > boxW + 1;                                                  // the finding as reported (needs CJK glyph widths)
    let narrowed = null;
    if (!cutAt360) { narrowed = Math.floor(lineW * 0.6); n.style.maxWidth = narrowed + 'px'; await raf2(); }
    const cutNow = n.scrollWidth > n.clientWidth + 1;                                   // the pre-fix rule at a box the line cannot fit
    const oneLineH = n.getBoundingClientRect().height;
    st.remove(); await raf2();
    const wholeAtBox = n.scrollWidth <= n.clientWidth + 1;                              // the product rule at the SAME box: nothing cut…
    const wrapped = narrowed === null || n.getBoundingClientRect().height > oneLineH + 1;   // …because it wrapped
    n.style.maxWidth = '';
    return { whole, cutAt360, narrowed, lineW, boxW, cutNow, wholeAtBox, wrapped, font: getComputedStyle(n).fontFamily.slice(0, 60), text: n.textContent };
  })()`);
  ok(cut && cut.whole && cut.cutNow && cut.wholeAtBox && cut.wrapped && /すぐに送信/.test(cut.text), `CONTROL (naive-user ⑥): the pane's composer line "${cut && cut.text}" is whole in ja at 360 px, and the pre-fix nowrap rule cuts it${cut && cut.narrowed !== null ? ` (this machine's font draws the line ${cut.lineW} px, narrower than its ${cut.boxW} px box — the rule judged at a ${cut.narrowed} px box: pre-fix cut, product wrapped whole)` : ' (at the natural 360 px box)'}`, J(cut));
  p4.close();
}

// ── (p) THE PHONE AT 390 px (lane reaction-hover): no hover there, so the bar is not drawn — a LONG PRESS on a message
//    opens its SAME actions as a menu (the explorer's touch rows); the message's layout is identical before, with the
//    menu open and after; Add reaction from the menu opens the picker and a tap reacts; taken back, the row closes up ──
console.log('(p) the phone at 390 px: the long-press menu and the geometry');
{
  const p6 = await newPage({ lang: 'zh', phone: true, width: 390 });
  ok(p6.ready, 'the phone page loaded (390 × 740, touch emulation, zh)');
  await p6.evaljs(OPEN('fake-poll', 'fake-poll-big', 'big', { min: 10 }));
  await sleep(1500);
  const pick = await p6.evaljs(PICK_ROW('big', 'phone'));
  const vid = pick && pick.vid;
  ok(!!vid && pick.settled, `a message with no reaction to press (${vid}), the list still for 1.2 s (${pick && pick.waited} ms)`, J(pick));
  const PG = `(() => { const row = document.querySelector('[data-geo="phone"]'); const l = row.closest('.chanwin-list'); const b = row.querySelector(':scope > .chanmsg-body').getBoundingClientRect(); const bar = row.querySelector(':scope > .chanmsg-bar'); return { h: row.offsetHeight, next: row.nextElementSibling.offsetTop, sh: l.scrollHeight, top: Math.round(row.getBoundingClientRect().top), x: Math.round(b.left + Math.min(40, b.width / 2)), y: Math.round(b.top + Math.min(10, b.height / 2)), bar: bar ? getComputedStyle(bar).display : null, strip: !!row.querySelector(':scope > .chanmsg-rx') }; })()`;
  const same = (a, b) => a.h === b.h && a.next === b.next && a.sh === b.sh && a.top === b.top;
  const before = await p6.evaljs(PG);
  // ANDROID-SHAPED long press on the words — THE CHAT'S OWN METHOD (scripts/test-mobile-select.mjs ②, verify r1): its
  // phone (390 × 844, DPR 3, an Android UA, hover:none / pointer:coarse), Chrome's own touch emulator (a held mouse ⇒ a
  // touch + its native long press: selectstart → the word selected → a TRUSTED touch contextmenu, ~680 ms; dispatched
  // touch events never produce one in headless), the page in front (the gesture provider runs for the focused page
  // only), the page's event log at window CAPTURE (before the door can stop anything) + every menu build. The point is
  // read on a SETTLED row (PICK_ROW) and the leg reads where the touch LANDED. MEASURED (the old leg's red, lane and
  // control alike): the touchstart's clientX/Y on the word, its TARGET the author's name 11 px above (Chrome's touch
  // adjustment — a real finger's too), the platform's long press on the word; the door judged the target ⇒ its timer,
  // our menu at 500 ms, the selection held off. The door now judges the point (utils.js pressFacts).
  {
    const pa = await newPage({ lang: 'zh', phone: true, android: true });
    await pa.evaljs(OPEN('fake-poll', 'fake-poll-big', 'big', { min: 10 }));
    await sleep(1500);
    const pk = await pa.evaljs(PICK_ROW('big', 'android'));
    const wp = pk && await pa.evaljs(`(() => { const b = document.querySelector('[data-geo="android"] > .chanmsg-body'); const w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { const m = /[A-Za-z\\u4e00-\\u9fff]{3,}/.exec(n.data); if (m && !n.parentElement.closest('a, button, [role], .chanblk-at, .chan-at, .chanblk-code')) { const r = document.createRange(); r.setStart(n, m.index); r.setEnd(n, m.index + m[0].length); const q = r.getBoundingClientRect(); const x = q.left + q.width / 2, y = q.top + q.height / 2; const at = document.elementFromPoint(x, y); return { x, y, word: m[0], at: at && at.tagName + '.' + at.className, ua: navigator.userAgent.includes('Android'), dpr: devicePixelRatio, touch: window.app.isTouch }; } } return null; })()`);
    await pa.evaljs(`(() => { window.__log = []; window.__menus = 0; window.__tt = null;
      const desc = (n) => { const el = n && (n.nodeType === 1 ? n : n.parentElement); return el ? el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\\s+/).join('.') : '') : null; };
      for (const type of ['touchstart', 'touchend', 'contextmenu', 'selectstart']) addEventListener(type, (e) => { if (type === 'touchstart' && !window.__tt) window.__tt = { x: e.touches[0].clientX, y: e.touches[0].clientY, target: desc(e.target) }; const row = { type, trusted: e.isTrusted, ptype: e.pointerType ?? null, target: desc(e.target) }; window.__log.push(row); setTimeout(() => { row.prevented = e.defaultPrevented; }, 0); }, true);
      new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && n.classList.contains('context-menu')) window.__menus++; }).observe(document.body, { childList: true, subtree: true });
      return 1; })()`);
    if (wp) {
      await pa.cdp('Page.bringToFront');
      await pa.cdp('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' });
      // (fired, never awaited: under the touch emulator the press's reply never comes — awaiting it hangs the leg)
      pa.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: wp.x, y: wp.y, button: 'left', clickCount: 1 });
      await sleep(900);
      pa.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: wp.x, y: wp.y, button: 'left', clickCount: 1 });
      await sleep(350);
      await pa.cdp('Emulation.setEmitTouchEventsForMouse', { enabled: false });
    }
    const a = await pa.evaljs(`(() => { const s = getSelection(); const inBody = (n) => !!n && !!(n.nodeType === 1 ? n : n.parentElement)?.closest('[data-geo="android"] > .chanmsg-body'); const body = document.querySelector('[data-geo="android"] > .chanmsg-body');
      return { sel: s.toString(), inBody: inBody(s.anchorNode), tt: window.__tt, landed: !!window.__tt && inBody(document.elementFromPoint(window.__tt.x, window.__tt.y)), menus: document.querySelectorAll('.context-menu').length, built: window.__menus, log: window.__log, us: body ? getComputedStyle(body).userSelect : null }; })()`);
    const trustedCm = a.log.filter((r) => r.type === 'contextmenu' && r.trusted);
    const synthCm = a.log.filter((r) => r.type === 'contextmenu' && !r.trusted);
    console.log('    measured order: ' + a.log.map((r) => `${r.type}${r.type === 'contextmenu' ? (r.trusted ? '(trusted ' + r.ptype + ')' : '(synthetic)') : ''}${r.prevented ? '[prevented]' : ''}@${r.target}`).join(' → '));
    const near = !!wp && !!a.tt && Math.abs(a.tt.x - wp.x) <= 1 && Math.abs(a.tt.y - wp.y) <= 1;
    ok(!!wp && wp.ua && wp.dpr === 3 && wp.touch && pk.settled && near && a.landed, `ANDROID (the chat's phone: Android UA, DPR ${wp && wp.dpr}): the finger is ON the word it measured ("${wp && wp.word}" in the message body, the list still for 1.2 s; the touchstart's target as Chrome adjusted it: ${a.tt && a.tt.target})`, J({ pk, wp, tt: a.tt }));
    ok(a.sel.trim().length > 0 && a.inBody, `a LONG PRESS on the words is the platform's SELECTION ("${a.sel.trim()}", user-select ${a.us})`, J({ sel: a.sel, inBody: a.inBody, us: a.us }));
    ok(a.log.some((r) => r.type === 'selectstart') && trustedCm.length === 1 && trustedCm[0].ptype === 'touch' && trustedCm[0].prevented === false, 'the native long press happened (selectstart, then a TRUSTED touch contextmenu) and the page did NOT cancel it', J(a.log));
    ok(synthCm.length === 0 && a.menus === 0 && a.built === 0, `no synthetic contextmenu (the door armed no timer on the words), no menu built or open (${a.built} / ${a.menus})`, J({ synth: synthCm, menus: a.menus, built: a.built }));
    pa.close();
    await p6.cdp('Page.bringToFront');   // p6's own touch legs need the page in front again (else they never return)
  }
  // iOS-SHAPED (raw touch events, no native gesture): our door arms no timer on text ⇒ no menu either
  await p6.touch(before.x, before.y, 700);
  await sleep(300);
  const ios = await p6.evaljs(`document.querySelectorAll('.context-menu').length`);
  ok(ios === 0, `an iOS-shaped long press on the words opens no menu (${ios})`);
  // THE … BUTTON: a finger's target in the row's corner, over no word, the element under its own centre
  const mb = await p6.evaljs(`(() => { const row = document.querySelector('[data-geo="phone"]'); const b = row.querySelector(':scope > .chanmsg-tmore'); if (!b) return null; const r = b.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; const at = document.elementFromPoint(x, y);
    const rg = document.createRange(); rg.selectNodeContents(row.querySelector(':scope > .chanmsg-body')); const words = [...rg.getClientRects()].filter((q) => q.width > 0 && q.bottom > r.top && q.top < r.bottom);
    return { x: Math.round(x), y: Math.round(y), w: Math.round(r.width), h: Math.round(r.height), rowH: row.offsetHeight, self: !!at && b.contains(at), over: words.filter((q) => q.right > r.left + 0.5).length, label: b.getAttribute('aria-label'), svg: !!b.querySelector('svg') }; })()`);
  ok(!!mb && mb.w >= 44 && mb.h >= Math.min(44, mb.rowH) && mb.self && mb.over === 0 && mb.svg && mb.label === '消息操作', `the message's … button: ${mb && mb.w}×${mb && mb.h} px (row ${mb && mb.rowH} px), the element under its centre, over no word, an SVG named "${mb && mb.label}"`, J(mb));
  if (mb) await p6.touch(mb.x, mb.y, 60);
  await sleep(300);
  const menu = await p6.evaljs(`(() => { const m = document.querySelector('.context-menu'); return m ? [...m.querySelectorAll('.context-menu-item')].map((x) => { const r = x.getBoundingClientRect(); return { text: x.textContent, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), h: Math.round(r.height) }; }) : null; })()`);
  const during = await p6.evaljs(PG);
  ok(before.bar === 'none' && menu && JSON.stringify(menu.map((m) => m.text)) === JSON.stringify(['添加表情回应', '在话题中回复', '引用', '复制文本']), `no hover bar on the phone (display ${before.bar}); a tap on the … opens its actions as a menu: ${menu && menu.map((m) => m.text).join(' · ')}`, J({ bar: before.bar, menu }));
  ok(same(before, during), `GEOMETRY at 390 px: the row's offsetHeight ${before.h} px, the next row's offsetTop ${before.next} px and the list's scrollHeight ${before.sh} px are the same with the menu open`, J({ before, during }));
  // Add reaction from the menu: the picker, a tap on its first quick emoji, the chip
  const add = menu && menu.find((m) => m.text === '添加表情回应');
  if (add) await p6.touch(add.x, add.y, 60);
  const pk = await p6.evaljs(`(async () => { for (let i = 0; i < 40 && !document.querySelector('.rx-picker'); i++) await new Promise((r) => setTimeout(r, 50)); await new Promise((r) => setTimeout(r, 300)); const b = document.querySelector('.rx-picker .rx-picker-quick .rx-pick'); if (!b) return null; const r = b.getBoundingClientRect(); return { key: b.dataset.key, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), menu: !!document.querySelector('.context-menu') }; })()`);
  ok(!!pk && !pk.menu, `"添加表情回应" in the menu opens THE picker (the menu closed; first quick key ${pk && pk.key})`, J(pk));
  if (pk) await p6.touch(pk.x, pk.y, 60);
  const grown = await p6.evaljs(`(async () => { const row = document.querySelector('[data-geo="phone"]'); for (let i = 0; i < 60 && !row.querySelector('.rx-chip.rx-mine'); i++) await new Promise((r) => setTimeout(r, 100)); await new Promise((r) => setTimeout(r, 200)); return 1; })()`).then(() => p6.evaljs(PG));
  const mine = await p6.evaljs(`(() => { const c = document.querySelector('[data-geo="phone"] .rx-chip.rx-mine'); if (!c) return null; const r = c.getBoundingClientRect(); return { key: c.dataset.key, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  ok(!!mine && mine.key === (pk && pk.key) && grown.strip && grown.h > before.h, `a tap on it reacts: the chip "${mine && mine.key}" is ours and the row grew by its strip (${before.h} → ${grown.h} px)`, J({ mine, grown }));
  if (mine) await p6.touch(mine.x, mine.y, 60);
  const after = await p6.evaljs(`(async () => { const row = document.querySelector('[data-geo="phone"]'); for (let i = 0; i < 60 && row.querySelector('.chanmsg-rx'); i++) await new Promise((r) => setTimeout(r, 100)); await new Promise((r) => setTimeout(r, 200)); return 1; })()`).then(() => p6.evaljs(PG));
  ok(!after.strip && after.h === before.h && after.next === before.next, `taken back with a tap, the row closes up EXACTLY (${grown.h} → ${after.h} px = ${before.h} px; next row ${after.next} = ${before.next})`, J({ before, after }));
  await p6.shot('p-phone-390.png');
  p6.close();
  // DESKTOP unchanged: no … anywhere (created only on a touch-first device); the hover bar is the door there
  const desk = await p1.evaljs(`({ more: document.querySelectorAll('.chanmsg-tmore').length, bars: document.querySelectorAll('.chanmsg > .chanmsg-bar').length })`);
  ok(desk.more === 0 && desk.bars > 0, `the desktop page draws no … (${desk.more}) beside its ${desk.bars} hover bars`, J(desk));
}

// ── (f) THE TRICKLE: a 120-row room scrolled end to end in 3 s spends ≤ 20 list calls in the minute ──
console.log('(f) the reaction trickle under a scroll storm');
{
  const p5 = await newPage({ lang: 'zh' });
  const o = await p5.evaljs(OPEN('fake-poll', 'fake-poll-big', 'big', { min: 30, maximize: true }));
  ok(o.rows >= 30, `the big room is drawn (${o.rows} rows)`);
  await sleep(1500);   // the first trickle (the rows in view, debounced 800 ms)
  const at = await p5.evaljs(`(() => { const l = ${LIST('big')}; const r = l.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  const t0 = Date.now();
  while (Date.now() - t0 < 3000) { await p5.wheel(at.x, at.y, -500); await sleep(60); }
  await sleep(2500);   // the trickle's last debounce + its calls
  const rx = await adapterRx('fake-poll');
  const drawn = await p5.evaljs(`(() => { const w = window.__w.big; return { rows: w.content.querySelectorAll('.chanmsg[data-vid]').length, withChips: [...w.content.querySelectorAll('.chanmsg[data-vid]')].filter((r) => r.querySelector('.rx-chip:not(.rx-add)')).length }; })()`);
  ok(rx && rx.calls60s >= 1 && rx.calls60s <= 20 && rx.listedThisMinute <= 20, `attack 7: the storm spent ${rx && rx.calls60s} reaction-list calls (${rx && rx.listedThisMinute} counted this minute) — the per-account ceiling of ${rx && rx.perMinute}/min holds; every leg before it counted too — the ceiling holds under the storm`, J(rx));
  ok(drawn.rows > o.rows && drawn.withChips >= 3, `the wheels paged older rows in (${o.rows} → ${drawn.rows}) and the rows the trickle asked are drawn with their chips (${drawn.withChips})`, J(drawn));
  await p5.shot('f-trickle.png');
  p5.close();
}


p1.close();
console.log(`\n(${Math.round((Date.now() - T0) / 1000)} s${SHOTS ? `; screenshots in ${SHOTS}` : ''})`);
console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
