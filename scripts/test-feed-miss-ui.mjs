#!/usr/bin/env node
// THE SEARCH FEED SAYS ITS STATE ONCE, IN THE BROWSER (lane lark-search-miss, owner 2026-10-11 「老有这个提示是咋回事
// 能根治吗？」 — the row said "搜索漏掉了 200 条中的 7 条 (3.5%) — 已恢复为每个会话单独检查" + a topic-check line, every
// cycle). Gate row `test-feed-miss-ui`, heavy tier — a real worktree server on the fake adapter WITH its change feed
// (VIBESPACE_CHANNELS_FAKE_FEED=1), the owner's measured state SEEDED into the feed row + its miss memo (6 `system`
// records + 1 `post` the search had not indexed yet), headless chrome, the UI in ZH:
//   ① the card's feed line is ONE quiet status line (no warning style) — the measurement restarted under the classified
//     rule says "（核实中）"; no separate topic-check line; the FACTS are its tooltip (the live numbers, the learned
//     overlap, the classes not counted, the last misses with their class, the topic checks 检查新话题 …)
//   ② GET /api/channels/adapters/fake-poll/view hands the last ≤ 20 misses, each with its class
//   ③ a carrying feed (re-seeded, restarted) says "（已核实无漏）"
// PNG (the line + its tooltip drawn below it): $FEED_MISS_SHOTS/after.png (default: a scratch dir).
// FEED_MISS_BASE=<sha> draws the SAME seeded state on that commit as before.png (the lane's before/after — no gate leg).
import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePort, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
const VNC_ENV = await vncEnv();
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }

let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOTS = process.env.FEED_MISS_SHOTS || scratch('feed-miss-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const roots = [];
const procs = [];
const cleanup = () => {
  for (const p of procs) { try { p.kill('SIGKILL'); } catch {} }
  for (const r of roots) { try { endRootedProcesses(r); } catch {} try { execSync(`git worktree remove --force ${r}`, { cwd: repo, stdio: 'ignore' }); } catch {} try { fs.rmSync(r, { recursive: true, force: true }); } catch {} }
};
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });

/** A scratch tree: the working tree's code (or `sha`'s), its own bundle, its own HOME. */
function tree(tag, sha = null) {
  const wt = scratch(`feed-miss-${tag}`);
  const home = scratchHome(`feed-miss-${tag}-home`, fs);
  roots.push(wt, home);
  execSync(`git worktree add --detach ${wt} ${sha || 'HEAD'}`, { cwd: repo, stdio: 'ignore' });
  if (!sha) for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
  fs.writeFileSync(path.join(wt, 'src/lib/build-version.js'), `export const BUILD_VERSION = ${JSON.stringify(require(path.join(wt, 'package.json')).version)};\n`);
  execSync('npx esbuild src/client.js --bundle --outfile=public/bundle.js --format=iife --platform=browser --target=es2020 --loader:.css=css', { cwd: wt, stdio: 'ignore' });
  return { wt, home };
}
async function boot(t, port) {
  const srv = spawn(process.execPath, ['server.js'], { cwd: t.wt, stdio: 'ignore', env: { ...process.env, ...VNC_ENV, PORT: String(port), HOME: t.home, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', VIBESPACE_CHANNELS_FAKE: '1', VIBESPACE_CHANNELS_FAKE_CONVS: '3', VIBESPACE_CHANNELS_FAKE_FEED: '1', VIBESPACE_INTEGRATION_FAKE_APIKEY: 'fake_feed_miss' } });
  procs.push(srv);
  for (let i = 0; i < 160; i++) { try { await fetch(`http://127.0.0.1:${port}/api/home`); return srv; } catch { await sleep(250); } }
  return null;
}
const adaptersFile = (t) => path.join(t.wt, 'data/channels/adapters.json');
/** Wait for the fake account's row to exist (the first boot writes it), stop the server, seed `feed`, write the memo. */
async function seed(t, port, srv, feedOf, memoRows) {
  for (let i = 0; i < 120; i++) { try { const d = JSON.parse(fs.readFileSync(adaptersFile(t), 'utf-8')); const rows = Array.isArray(d) ? d : d.adapters; if (rows.some((r) => r.id === 'fake-poll' && r.lastOkAt && r.feed && r.feed.lastOkAt)) break; } catch {} await sleep(250); }
  await sleep(1500);   // the account's first pass persisted (its sign-in, its rows)
  srv.kill('SIGKILL'); await sleep(500);
  try { endRootedProcesses(t.wt); } catch {}
  const d = JSON.parse(fs.readFileSync(adaptersFile(t), 'utf-8'));
  const rows = Array.isArray(d) ? d : d.adapters;
  const row = rows.find((r) => r.id === 'fake-poll');
  row.feed = feedOf(row.feed || {});
  row.auth = { ...(row.auth || {}), scopes: ['fake'] };   // a signed-in account's evidence (channel-caps authState) — the feed line is a connected account's
  fs.writeFileSync(adaptersFile(t), JSON.stringify(d, null, 2));
  if (memoRows) { const dir = path.join(t.wt, 'data/channels/fake-poll'); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'feed-misses.json'), JSON.stringify({ v: 1, rows: memoRows }), { mode: 0o600 }); }
  return boot(t, port);
}

// THE OWNER'S MEASURED STATE (adapters.json, read-only, 2026-10-11): demoted at 5 of 200, the window holding 7 of 200, the
// topic checks 7 872 / 159, the threads named by 250 hits; the 7 misses: 6 `system` + 1 `post` (fetched 223 s in)
const NOW = Date.now();
const samples = (n, p) => Array.from({ length: n }, (_, i) => ({ at: NOW - (n - i) * 60e3, n: 1, p: i >= n - p ? 1 : 0 }));
const counters = (c) => ({ ...(c || {}), threadHits: 250, rechecks: 7872, recheckWidened: 159, missedTypes: { system: 6, post: 1 }, pages: 51936 });
const OLD = (f) => ({ ...f, mode: 'demoted', demotedAt: NOW - 3600e3, promotedAt: NOW - 13 * 3600e3, lastFlip: { at: NOW - 3600e3, from: 'carrying', to: 'demoted', total: 200, missed: 5, rate: 0.025 }, samples: samples(200, 7), counters: counters(f.counters) });
const MEMO = [...Array.from({ length: 6 }, (_, i) => ({ id: `om_sys${i}`, convId: 'fake-poll-room-1', chatType: 'group', msgType: 'system', createdAt: NOW - (7 - i) * 900e3, firstSeenAt: NOW - (7 - i) * 900e3 + 90e3, ageAtFirstSeen: 90, searchWindow: { from: NOW - (7 - i) * 900e3 - 60e3, to: NOW - (7 - i) * 900e3 + 80e3 }, inThread: false, fromBot: false, hadSearchHit: true, cls: 'excluded-type' })),
  { id: 'om_post1', convId: 'fake-poll-room-2', chatType: 'group', msgType: 'post', createdAt: NOW - 1800e3, firstSeenAt: NOW - 1800e3 + 223e3, ageAtFirstSeen: 223, searchWindow: { from: NOW - 1860e3, to: NOW - 1800e3 + 90e3 }, inThread: false, fromBot: false, hadSearchHit: false, cls: 'lag' }];
// after the upgrade the measurement restarts ONCE under the classified rule (measuring); only the post counts
const NEW = (f) => ({ ...OLD(f), mode: 'measuring', lastFlip: null, measureRev: 2, samples: samples(194, 1), lagMargin: { sec: 223, n: 1, at: NOW - 1577e3 } });

const CDP_PORT = await freePort();
const chromeDir = scratch('feed-miss-chrome');
roots.push(chromeDir);
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1400,1000', `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore' });
procs.push(chrome);
const WebSocket = require('ws');
for (let i = 0; i < 120; i++) { try { await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json(); break; } catch { await sleep(250); } }
/** The account reads as signed in once its first pass after a (re)start learned it — the page opens after that. */
async function connected(port) {
  for (let i = 0; i < 240; i++) { try { const j = await (await fetch(`http://127.0.0.1:${port}/api/channels/adapters/fake-poll/view`)).json(); if (j.adapter && j.adapter.auth && j.adapter.auth.state === 'connected' && j.adapter.feed) return true; } catch {} await sleep(250); }
  return false;
}
async function page(port) {
  await connected(port);
  const t = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((res) => ws.on('open', res));
  let seq = 0; const pend = new Map();
  const cdp = (method, params = {}) => new Promise((res) => { const id = ++seq; pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  // THE ACCOUNT CARD is drawn for a VENDOR account (adapterView `connectable` — Lark, Gmail, Slack); the fake is a source.
  // Zero vendor calls: the SERVER's own fake-poll row (its feed view computed from the seeded row + memo) reaches the REAL
  // client marked as a Lark account — the one field the harness changes, on every /api/channels* answer
  const asLark = async (p) => {
    const b = await cdp('Fetch.getResponseBody', { requestId: p.requestId });
    let body = b.result ? (b.result.base64Encoded ? Buffer.from(b.result.body, 'base64').toString('utf-8') : b.result.body) : '';
    try { const j = JSON.parse(body); const fix = (a) => { if (a && a.id === 'fake-poll') { a.connectable = true; a.vendor = 'Lark'; } }; (j.adapters || []).forEach(fix); if (j.adapter) fix(j.adapter); body = JSON.stringify(j); } catch {}
    await cdp('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: p.responseStatusCode || 200, responseHeaders: (p.responseHeaders || []).filter((h) => !/^(content-length|content-encoding)$/i.test(h.name)), body: Buffer.from(body, 'utf-8').toString('base64') });
  };
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } else if (m.method === 'Fetch.requestPaused') asLark(m.params).catch(() => {}); });
  await cdp('Fetch.enable', { patterns: [{ urlPattern: '*/api/channels*', requestStage: 'Response' }] });
  const evaljs = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error('page threw: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 600)); return r.result.result.value; };
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "try { localStorage.setItem('vibespace.lang', 'zh'); } catch {}" });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/` });
  for (let i = 0; i < 160; i++) { try { if (await evaljs('!!(window.app && window.app.wm && window.app.sidebar)')) break; } catch {} await sleep(250); }
  return { cdp, evaljs, close: () => { try { ws.close(); } catch {} fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${t.id}`).catch(() => {}); } };
}
/** The fake account's card: its notes, the feed line's text / warn / title, and a PNG of the line with its tooltip drawn. */
async function card(p, png) {
  const r = await p.evaljs(`(async () => {
    const sb = window.app.sidebar; if (!sb.isOpen) sb.toggle(true); sb._railGo('channels');
    // the account's sign-in state is learned at its first pass after a (re)start — the feed line is a connected account's
    for (let i = 0; i < 360; i++) {
      const sec = document.querySelector('.rail-panel-channels .chan-sec[data-adapter="fake-poll"]');
      const line = sec && sec.querySelector('[data-chan-feed="fake-poll"]');
      if (line) {
        const notes = [...sec.querySelectorAll('.chan-sec-note')];
        // the PNG: the REAL nodes (the head, every note line) cloned into a 640 px box at the page's corner — the rail is
        // 188 px and scrolled — with the feed line's tooltip drawn below it (a tooltip is never in a screenshot)
        const box = document.createElement('div'); box.className = 'rail-panel-channels';
        box.style.cssText = 'position:fixed;left:0;top:0;width:640px;z-index:2147483647;padding:8px 10px;background:var(--bg-secondary, #161b22)';
        const sc = document.createElement('div'); sc.className = sec.className.replace('chan-collapsed', ''); box.appendChild(sc);
        const head = sec.querySelector('.chan-sec-head'); if (head) sc.appendChild(head.cloneNode(true));
        for (const n of notes) sc.appendChild(n.cloneNode(true));
        const tip = document.createElement('pre'); tip.textContent = line.title || '';
        tip.style.cssText = 'margin:6px 0 0 0;padding:6px 8px;font:12px/1.45 system-ui,sans-serif;white-space:pre-wrap;background:#1f2328;color:#e6edf3;border-radius:6px;border:1px solid #30363d';
        if (line.title) sc.appendChild(tip);
        document.body.appendChild(box);
        const b = box.getBoundingClientRect();
        return { text: line.textContent.trim(), warn: line.classList.contains('chan-warn'), title: line.title || '', notes: notes.map((n) => n.textContent.trim()), threadsLine: !!sec.querySelector('[data-chan-feed-threads]'), clip: { x: 0, y: 0, width: Math.ceil(b.width), height: Math.ceil(b.height) } };
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    const sec = document.querySelector('.rail-panel-channels .chan-sec[data-adapter="fake-poll"]');
    let dg = null; try { const j = await (await fetch('/api/channels')).json(); const a = (j.adapters || []).find((x) => x.id === 'fake-poll'); dg = a ? { auth: a.auth, feed: a.feed ? { state: a.feed.state } : null, txt: sec ? sec.textContent.slice(0, 400) : null, kids: sec ? [...sec.children].map((c) => c.className).slice(0, 12) : null } : Object.keys(j); } catch (e) { dg = String(e); }
    return { dg, missing: true, secs: [...document.querySelectorAll('.rail-panel-channels .chan-sec[data-adapter]')].map((x) => x.dataset.adapter), notes: sec ? [...sec.querySelectorAll('.chan-sec-note')].map((n) => n.textContent.trim()) : null };
  })()`);
  if (r && r.missing) { console.log('  · no feed line: ' + JSON.stringify(r)); return null; }
  if (r && png) {
    await p.cdp('Page.bringToFront');
    const s = await p.cdp('Page.captureScreenshot', { format: 'png', clip: { ...r.clip, scale: 1 } });
    if (s.result && s.result.data) fs.writeFileSync(path.join(SHOTS, png), Buffer.from(s.result.data, 'base64')); else console.log('  · no screenshot: ' + JSON.stringify(s).slice(0, 300));
  }
  return r;
}

// ── BEFORE (lane-only): the same seeded state on the base commit — the warning line + the topic-check line
if (process.env.FEED_MISS_BASE) {
  const tb = tree('base', process.env.FEED_MISS_BASE);
  const port = await freePort();
  const s0 = await boot(tb, port);
  await seed(tb, port, s0, OLD, null);
  const p = await page(port);
  const r = await card(p, 'before.png');
  console.log(`  · BEFORE (${process.env.FEED_MISS_BASE}): ${JSON.stringify(r && { text: r.text, warn: r.warn, notes: r.notes })}`);
  p.close();
}

// ── AFTER: the working tree
const ta = tree('after');
const port = await freePort();
const s1 = await boot(ta, port);
ok(!!s1, 'the worktree server booted (the fake adapter with its change feed)');
const s2 = await seed(ta, port, s1, NEW, MEMO);
ok(!!s2, 'the owner\'s measured state is seeded (a feed row + its miss memo) and the server restarted');
const p1 = await page(port);
const r1 = await card(p1, 'after.png');
ok(r1 && r1.text === '新消息：搜索每 30 秒 + 每会话核对（核实中）' && r1.warn === false, `① ONE quiet status line, no warning style: ${JSON.stringify(r1 && r1.text)}`, JSON.stringify(r1));
ok(r1 && !r1.threadsLine && !r1.notes.some((n) => /检查新话题|搜索漏掉了/.test(n)), '① the topic-check line left the row; no note says the old warning', JSON.stringify(r1 && r1.notes));
const tipWant = ['实测：搜索漏掉 194 条中的 1 条（0.5%）', '搜索窗口重叠 223 秒', '不计入（搜索不返回这些）：搜索不返回的消息类型 ×6', '搜索最近没找到的消息：', 'post — 索引尚未收录（写入后 90 秒内）', 'system — 搜索不返回的消息类型（system）', '检查新话题 7872 次，发现 159 个'];
ok(r1 && tipWant.every((x) => r1.title.includes(x)), '① the FACTS are the tooltip: the live numbers, the learned overlap, the classes not counted, the named misses, the topic checks', JSON.stringify(r1 && r1.title));
const api = await (await fetch(`http://127.0.0.1:${port}/api/channels/adapters/fake-poll/view`)).json();
const fv = (api && (api.feed || (api.adapter && api.adapter.feed))) || null;
ok(fv && Array.isArray(fv.misses) && fv.misses.length === 7 && fv.misses.length <= 20 && fv.misses.every((x) => x.cls && x.id) && fv.misses.filter((x) => x.cls === 'excluded-type').length === 6 && fv.misses.some((x) => x.id === 'om_post1' && x.cls === 'lag' && x.searchAgeSec === 90),
  '② GET /api/channels/adapters/fake-poll/view hands the last ≤ 20 misses, each with its class', JSON.stringify(fv ? fv.misses : Object.keys(api || {})));
p1.close();
// ── ③ carrying
const s3 = await seed(ta, port, s2, (f) => ({ ...f, mode: 'carrying', promotedAt: Date.now() - 600e3, samples: samples(300, 0) }), null);
const p2 = await page(port);
const r3 = s3 ? await card(p2, null) : null;
ok(r3 && r3.text === '新消息：搜索每 30 秒（已核实无漏）' && r3.warn === false, `③ a carrying feed says it once: ${JSON.stringify(r3 && r3.text)}`, JSON.stringify(r3));
p2.close();
console.log(`  PNGs: ${SHOTS}`);
console.log(`\n${fail ? '✗' : '✓'} test-feed-miss-ui: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
