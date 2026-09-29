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
//   (d) REACT / UNREACT: `+` opens the picker, arrows + Enter pick, the chip appears `.rx-mine` with count 1; a
//       click removes it; the strip's other chips are the very same DOM nodes (probe stamps)
//   (e) ANOTHER CLIENT'S REACTION: two pages on one conversation; page B reacts; page A's chip changes IN PLACE
//       within 2 s — no row rebuilt (probe stamps), no `/messages` fetch (the broadcast carried the result)
//   (g) THE PHONE (360 × 740, touch): a long press on a chip opens the who-list; a tap toggles; the `+` never wraps
//       alone onto a line
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
async function newPage({ lang = 'zh', phone = false, font = false } = {}) {
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
    await cdp('Emulation.setDeviceMetricsOverride', { width: 360, height: 740, deviceScaleFactor: 2, mobile: true });
    await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  } else await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('vibespace.lang', ${J(lang)}); } catch {}` });
  // the pill rule is judged under the CI runner's font (DejaVu Sans — the .185 mirror lesson)
  if (font) await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = '* { font-family: \"DejaVu Sans\" !important; }'; document.head.appendChild(s); });" });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  let ready = false;
  for (let i = 0; i < 160; i++) { try { if (await evaljs("!!(window.app && window.app.wm && window.app.openChannel) && !document.getElementById('loading-screen')")) { ready = true; break; } } catch {} await sleep(250); }
  const shot = async (file) => { if (!SHOTS) return; try { fs.mkdirSync(SHOTS, { recursive: true }); const r3 = await cdp('Page.captureScreenshot', { format: 'png' }); if (r3.result && r3.result.data) fs.writeFileSync(path.join(SHOTS, file), Buffer.from(r3.result.data, 'base64')); } catch {} };
  const key = async (k, code, vk) => { for (const type of ['keyDown', 'keyUp']) await cdp('Input.dispatchKeyEvent', { type, key: k, code, windowsVirtualKeyCode: vk }); };
  const wheel = (x, y, dy) => cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: dy });
  const touch = async (x, y, holdMs) => { await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await sleep(holdMs); await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
  return { cdp, evaljs, ready, shot, key, wheel, touch, errors, close: () => { try { ws.close(); } catch {} } };
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

// ── (d) REACT / UNREACT in the main list — the picker by keyboard, the strip patched in place ──
console.log('(d) react / unreact');
const RXROW = {};
{
  const pick = await p1.evaljs(`(async () => {
    const w = window.__w.big;
    const l = w.content.querySelector('.chanwin-main .chanwin-list');
    const lr = l.getBoundingClientRect();
    const rows = [...l.querySelectorAll('.chanmsg[data-vid]')].filter((r) => { const b = r.getBoundingClientRect(); return b.top >= lr.top && b.bottom <= lr.bottom - 60 && r.querySelector('.rx-add'); });
    if (!rows.length) return { rows: 0 };
    const row = rows[rows.length - 1];
    const set = await (await fetch('/api/channels/fake-poll/emoji-set')).json();
    // the strip must hold a chip of somebody's before the pick (its node identity is the point): one added through
    // the route (the broadcast patches it in), unless the row has one already
    if (!row.querySelector('.rx-chip:not(.rx-add)')) {
      await fetch('/api/channels/fake-poll/fake-poll-big/messages/' + encodeURIComponent(row.dataset.vid) + '/reactions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'bulb' }) });
      for (let i = 0; i < 40 && !row.querySelector('.rx-chip:not(.rx-add)'); i++) await new Promise((r) => setTimeout(r, 100));
    }
    const have = new Set([...row.querySelectorAll('.rx-chip:not(.rx-add)')].map((c) => c.dataset.key));
    const idx = set.quick.findIndex((k) => !have.has(k));
    [...row.querySelectorAll('.rx-chip:not(.rx-add)')].forEach((c, i) => { c.dataset.probe = 'p' + i; });
    // THE GLYPH IS CONTENT: no chip of the window still says :key: for a key the vocabulary draws
    const glyphs = new Map(set.keys.filter((k) => k.glyph).map((k) => [k.key, k.glyph]));
    const named = [...w.content.querySelectorAll('.rx-chip:not(.rx-add) > .rx-name')].map((x) => x.parentElement.dataset.key).filter((k) => glyphs.has(k));
    const drawnGlyphs = w.content.querySelectorAll('.rx-chip:not(.rx-add) > .rx-glyph').length;
    row.querySelector('.rx-add').click();
    for (let i = 0; i < 40 && !document.querySelector('.rx-picker'); i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return { rows: rows.length, vid: row.dataset.vid, key: set.quick[idx], idx, focused: document.activeElement && document.activeElement.dataset.key, probes: row.querySelectorAll('[data-probe]').length, named, drawnGlyphs };
  })()`);
  Object.assign(RXROW, pick);
  ok(pick.named && pick.named.length === 0 && pick.drawnGlyphs >= 3, `every chip draws the vocabulary's glyph (${pick.drawnGlyphs} glyph chips; none left as :key: for a key that has one — a strip drawn before the set loaded is re-faced in place)`, J(pick.named));
  if (!(pick.rows >= 1 && pick.idx >= 0)) { ok(false, '(d) found no row to react on', J(pick)); process.exit(1); }
  ok(pick.rows >= 1 && pick.idx >= 0 && pick.focused && pick.probes >= 1, `the + opens the picker with the first quick emoji focused (${pick.focused}); the pick will be the ${pick.idx + 1}th quick key "${pick.key}"`, J(pick));
  for (let i = 0; i < pick.idx; i++) await p1.key('ArrowRight', 'ArrowRight', 39);
  const foc = await p1.evaljs('document.activeElement && document.activeElement.dataset.key || null');
  await p1.key('Enter', 'Enter', 13);
  const d1 = await p1.evaljs(`(async () => {
    const row = window.__w.big.content.querySelector('.chanwin-main .chanmsg[data-vid="' + CSS.escape(${J(pick.vid)}) + '"]');
    let chip = null;
    for (let i = 0; i < 60 && !chip; i++) { chip = row.querySelector('.rx-chip.rx-mine[data-key="' + CSS.escape(${J(pick.key)}) + '"]'); if (!chip) await new Promise((r) => setTimeout(r, 100)); }
    const probes = [...row.querySelectorAll('[data-probe]')].filter((c) => c.isConnected).length;
    return { chip: !!chip, n: chip ? chip.querySelector('.rx-n').textContent : null, pressed: chip ? chip.getAttribute('aria-pressed') : null, probes, picker: !!document.querySelector('.rx-picker') };
  })()`);
  ok(foc === pick.key && d1.chip && d1.n === '1' && d1.pressed === 'true' && !d1.picker, `arrows + Enter picked "${foc}": the chip appears .rx-mine with count 1 (aria-pressed) and the picker closed`, J(d1));
  ok(d1.probes === pick.probes, `the strip's other chips are the very same DOM nodes (${d1.probes}/${pick.probes} probes kept)`);
  const d2 = await p1.evaljs(`(async () => {
    const row = window.__w.big.content.querySelector('.chanwin-main .chanmsg[data-vid="' + CSS.escape(${J(pick.vid)}) + '"]');
    row.querySelector('.rx-chip.rx-mine[data-key="' + CSS.escape(${J(pick.key)}) + '"]').click();
    let gone = false;
    for (let i = 0; i < 60 && !gone; i++) { gone = !row.querySelector('.rx-chip[data-key="' + CSS.escape(${J(pick.key)}) + '"]'); if (!gone) await new Promise((r) => setTimeout(r, 100)); }
    return { gone, probes: [...row.querySelectorAll('[data-probe]')].filter((c) => c.isConnected).length };
  })()`);
  ok(d2.gone && d2.probes === pick.probes, `a click on our chip removes the reaction — the chip is gone, the other ${d2.probes} chips kept`, J(d2));
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
  const alone = await p3.evaljs(`(() => {
    const out = [];
    for (const s of window.__w.big.content.querySelectorAll('.chanmsg-rx')) {
      const add = s.querySelector(':scope > .rx-add'); const chips = [...s.querySelectorAll(':scope > .rx-chip:not(.rx-add)')];
      if (!add || !chips.length) continue;
      const a = add.getBoundingClientRect();
      const mates = chips.filter((c) => Math.abs(c.getBoundingClientRect().top - a.top) < 4).length;
      const inside = a.right <= s.getBoundingClientRect().right + 1;
      out.push({ lines: new Set(chips.map((c) => Math.round(c.getBoundingClientRect().top))).size, mates, inside });
    }
    return out;
  })()`);
  ok(alone.length >= 3 && alone.every((x) => x.mates >= 1 && x.inside), `the + never wraps ALONE: on each of ${alone.length} strips it shares its line with a chip (multi-line strips: ${alone.filter((x) => x.lines > 1).length})`, J(alone.filter((x) => !(x.mates >= 1 && x.inside))));
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
  // the "sent at once, as you" half — the leg above would read it red
  const cut = await p4.evaljs(`(async () => {
    const w = window.__w.big; const chip = [...w.content.querySelectorAll('.chanwin-main .chanmsg-thread-chip')].pop(); chip.click();
    const pane = w.content.querySelector('.chanthread'); for (let i = 0; i < 100 && pane.hidden; i++) await new Promise((r) => setTimeout(r, 50)); await new Promise((r) => setTimeout(r, 400));
    const n = pane.querySelector('.chanthread-foot .chanwin-note-text'); if (!n) return null;
    const whole = n.scrollWidth <= n.clientWidth + 1;
    const st = document.createElement('style'); st.textContent = '.chanthread-composer .chanwin-note-text { white-space: nowrap !important; overflow: hidden !important; }'; document.head.appendChild(st);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const cutNow = n.scrollWidth > n.clientWidth + 1; st.remove();
    return { whole, cutNow, text: n.textContent };
  })()`);
  ok(cut && cut.whole && cut.cutNow && /すぐに送信/.test(cut.text), `CONTROL (naive-user ⑥): the pane's composer line "${cut && cut.text}" is whole in ja at 360 px, and the pre-fix nowrap rule cuts it`, J(cut));
  p4.close();
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
