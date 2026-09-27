#!/usr/bin/env node
// THE AGGREGATED IM, IN THE BROWSER (owner ruling 2026-09-26; design
// docs/design-communication-panel.zh.md §5 invariant 6 / §6.2 / §6.5 / §7.3;
// gate row `test-channels-aggregate-ui`, heavy tier — a real worktree server
// on the fake adapter and headless chrome, the UI in ZH).
//
//   ① the panel lists EVERY conversation of an account with its freshness
//     chip — no 跟踪 / 未跟踪 / 仅登录 anywhere, no Track verb in any menu
//   ② a conversation window reads its messages; an IMAGE attachment renders
//     as a thumbnail loaded through OUR route (`img.src`, `?inline=1`, a
//     decoded PNG), a FILE attachment is a download chip whose route answers
//     `Content-Disposition: attachment` + nosniff + a sandbox CSP
//   ③ scrolling up past the local log loads the vendor's older history
//   ④ the row menu's 刷新周期 ▸ 每分钟 sets the override: the chip says it,
//     the full view says it, a SECOND client's row says it, a reload keeps it
//   ⑤ the account ⋯ 交给一个 agent… hands the whole account to a Task Group
//     through the one editor, and every row then wears the INHERITED chip
//     "（账号）"; the conversation window's chip says it too; D4 (2026-09-27):
//     the account's conversations do NOT join the first screen for that
//     alone — one joins once an agent READS it (a stub agent session's own
//     agent route), wearing the read tag
//   ⑥ zero Latin-only "Track"/"tracked" words on the panel and the window
//   ⑦ (hotfix 2026-09-26, the owner's toast "请求被拒绝: mode 'filtered' needs a
//     filterId") the owner's EXACT dialog: 组 · 工作, 匹配过滤器的消息 with two
//     time-window rules, 每个窗口一份摘要 9999, cap 9999, 起草 ⇒ 保存 closes with
//     NO error toast, the account line says it, the wire holds the minted
//     filter id, and re-opening prefills the two rules and saves again
//   ②b R3 (2026-09-26, "lark图像不能预览吗？"): a LARK-SHAPED picture (`image/*`, no name, text "[image]")
//     is drawn and its "[image]" line leaves; a click opens the shared overlay; a picture the vendor
//     rate-limits once draws on its own retry; a refused one is the chip that NAMES the reason (zh) with a
//     Retry that asks again
//
// Per-pid scratch (scripts/scratch.mjs); the server gets vncEnv() (§57), a
// scratch HOME, VIBESPACE_CHANNELS_FAKE=1 and VIBESPACE_CHANNELS_FAKE_CONVS=3
// (the fake world's synthetic rooms carry attachments), and ONE stub agent
// session (a dtach socket + meta with its vsst_ token, the groups-e2e
// fixture's shape) for ⑤'s agent read. Zero vendor calls.
// Run: node scripts/test-channels-aggregate-ui.mjs   (SKIPs without chrome)
import { execSync, execFileSync, spawn } from 'node:child_process';
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

const PORT = await freePort(), CDP_PORT = await freePort();
const wt = scratch('chan-agg-ui');
const fakeHome = scratchHome('chan-agg-ui-home', fs);
const chromeDir = scratch('chan-agg-ui-chrome');

let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.writeFileSync(path.join(wt, 'src/lib/build-version.js'), `export const BUILD_VERSION = ${JSON.stringify(require(path.join(repo, 'package.json')).version)};\n`);
execSync('npx esbuild src/client.js --bundle --outfile=public/bundle.js --format=iife --platform=browser --target=es2020 --loader:.css=css', { cwd: wt, stdio: 'ignore' });

// ── D4 (2026-09-27): ONE stub agent session — a dtach socket + its meta (vsst_ token) — so ⑤ can READ a conversation
//    through the agent's own route (the one door that stamps an agent read). Without dtach that one leg SKIPs, by name.
const HAVE_DTACH = (() => { try { execFileSync('dtach', ['--help'], { stdio: 'ignore' }); return true; } catch (e) { return e.code !== 'ENOENT'; } })();
const STUB = path.join(wt, 'stub-cli.cjs');
const SOCK_DIR = path.join(wt, 'data/sockets');
// a plain uuid like groups-e2e's stubs (never the fixtureSid family: that class writes a transcript into the server's
// home and is censused by test-fixture-isolation (c); this stub only publishes ~/.claude/sessions/<pid>.json)
const READER = { cid: 'a99e0001-0000-4000-8000-00000000000c', name: 'reader', token: 'vsst_' + 'e2eaggregatereader00000000000001', sockName: `cw-1-${Date.now()}` };
if (HAVE_DTACH) {
  fs.writeFileSync(STUB, `'use strict';
// a STUB agent CLI: publishes this process in the CLI session registry of $HOME and stays alive
const fs = require('fs'), path = require('path');
const [cid, name] = process.argv.slice(2);
const dir = path.join(process.env.HOME, '.claude', 'sessions');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, process.pid + '.json'), JSON.stringify({ pid: process.pid, sessionId: cid, name }));
setInterval(() => {}, 1 << 30);
`);
  const META_DIR = path.join(wt, 'data/session-meta');
  fs.mkdirSync(SOCK_DIR, { recursive: true }); fs.mkdirSync(META_DIR, { recursive: true });
  fs.writeFileSync(path.join(META_DIR, READER.sockName + '.json'), JSON.stringify({
    webuiSessionId: 'sess-agg-reader', sockName: READER.sockName, claudeSessionId: READER.cid, backendSessionId: READER.cid,
    name: READER.name, mode: 'chat', backend: 'claude', cwd: wt, createdAt: Date.now(), agentToken: READER.token,
  }));
  execFileSync('dtach', ['-n', path.join(SOCK_DIR, READER.sockName), '-E', '-z', process.execPath, STUB, READER.cid, READER.name], { env: { ...process.env, HOME: fakeHome } });
}

let srv = null;
const bootServer = () => spawn(process.execPath, ['server.js'], {
  cwd: wt, stdio: 'ignore',
  env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', VIBESPACE_CHANNELS_FAKE: '1', VIBESPACE_CHANNELS_FAKE_CONVS: '3' },
});
srv = bootServer();
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu',
  '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1400,1000', '--disable-background-timer-throttling',
  `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv && srv.kill('SIGKILL'); } catch {}
  // the fixture's dtach master + stub CLI are THIS suite's processes — ended by evidence (their argv names this scratch tree)
  if (HAVE_DTACH) { try { execFileSync('pkill', ['-KILL', '-f', STUB], { stdio: 'ignore' }); } catch {} try { execFileSync('pkill', ['-KILL', '-f', SOCK_DIR], { stdio: 'ignore' }); } catch {} }
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  for (const d of [chromeDir, fakeHome]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
};
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
const waitServer = async () => { for (let i = 0; i < 120; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); return true; } catch { await sleep(250); } } return false; };
ok(await waitServer(), 'the worktree server booted');
const api = async (method, p, body) => { const r = await fetch(`http://127.0.0.1:${PORT}${p}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }); let j = {}; try { j = await r.json(); } catch {} return { status: r.status, json: j, headers: r.headers }; };

const WebSocket = require('ws');
async function newPage() {
  const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' });
  const t = await r.json();
  const ws = new WebSocket(t.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((res) => ws.on('open', res));
  let seq = 0; const pend = new Map();
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const cdp = (method, params = {}) => new Promise((res) => { const id = ++seq; pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  await cdp('Runtime.enable'); await cdp('Page.enable');
  const evaljs = async (expr) => {
    const r2 = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r2.result?.exceptionDetails) throw new Error('page threw: ' + JSON.stringify(r2.result.exceptionDetails).slice(0, 900));
    if (!r2.result || !r2.result.result || !('value' in r2.result.result)) throw new Error('no value from page: ' + JSON.stringify(r2).slice(0, 600));
    return r2.result.result.value;
  };
  const load = async () => {
    // THE UI IN ZH (the owner's language): the per-device language key before the app reads it
    await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
    await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "try { localStorage.setItem('vibespace.lang', 'zh'); } catch {}" });
    await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
    for (let i = 0; i < 160; i++) { try { if (await evaljs('!!(window.app && window.app.wm && window.app.sidebar)')) return true; } catch {} await sleep(250); }
    return false;
  };
  return { cdp, evaljs, load, reload: load, close: () => { try { ws.close(); } catch {} } };
}
for (let i = 0; i < 120; i++) { try { await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json(); break; } catch { await sleep(250); } }
const p1 = await newPage();
ok(await p1.load(), 'page 1 loaded the app (zh)');

// the first pass ingests EVERY conversation — wait for the synthetic rooms' anchors
for (let i = 0; i < 80; i++) {
  const d = await api('GET', '/api/channels');
  const rooms = (d.json.conversations || []).filter((c) => c.adapterId === 'fake-poll');
  if (rooms.length >= 5 && rooms.every((c) => c.lastText)) break;
  await sleep(250);
}

// ── ① the panel: every conversation, a chip each, no 跟踪 ──
const PANEL = `(async () => {
  const sb = window.app.sidebar;
  if (!sb._railEl) return { ok: false, why: 'no rail' };
  sb._railGo('channels');
  for (let i = 0; i < 80; i++) {
    const rows = [...document.querySelectorAll('.rail-panel-channels .chan-row')];
    if (rows.length >= 8) {
      const root = document.querySelector('.rail-panel-channels');
      return { ok: true, text: root.textContent, rows: rows.map((r) => ({ conv: r.dataset.conv, chip: r.querySelector('.chan-chip') ? r.querySelector('.chan-chip').textContent : null, assign: r.querySelector('.chan-row-assign') ? { text: r.querySelector('.chan-row-assign').textContent, grain: r.querySelector('.chan-row-assign').dataset.grain } : null })) };
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return { ok: false, why: 'rows never came', text: document.querySelector('.rail-panel-channels')?.textContent?.slice(0, 300) };
})()`;
const panel = await p1.evaljs(PANEL);
ok(panel.ok, 'the Channels panel renders its rows', JSON.stringify(panel).slice(0, 400));
const pollRows = (panel.rows || []).filter((r) => r.conv && r.conv.startsWith('fake-poll/'));
ok(pollRows.length === 5, `EVERY conversation of the account is listed — the two base rooms and the three synthetic ones (${pollRows.length})`, JSON.stringify(pollRows.map((r) => r.conv)));
ok((panel.rows || []).every((r) => r.chip && r.chip.length > 0), 'every row carries its freshness chip (every conversation is fetched)', JSON.stringify((panel.rows || []).map((r) => r.chip)));
ok(panel.ok && !/跟踪|未跟踪|仅登录|Track|tracked/.test(panel.text), 'the panel says NOTHING about tracking — no 跟踪 / 未跟踪 / 仅登录 / Track anywhere', (panel.text || '').match(/.{0,20}(跟踪|仅登录|Track|tracked).{0,20}/g));
const rowMenu = await p1.evaljs(`(async () => {
  const row = document.querySelector('.rail-panel-channels .chan-row[data-conv="fake-poll/fake-poll-room-1"]');
  row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 200, clientY: 200 }));
  await new Promise((r) => setTimeout(r, 200));
  const items = [...document.querySelectorAll('.context-menu .context-menu-item')].map((x) => x.textContent.trim());
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  document.querySelectorAll('.context-menu').forEach((m) => m.remove());
  return items;
})()`);
ok(rowMenu.some((x) => /刷新周期/.test(x)) && rowMenu.some((x) => /立即刷新/.test(x)) && !rowMenu.some((x) => /跟踪/.test(x)), 'the row menu offers 立即刷新 and 刷新周期 ▸, and no 跟踪 verb', JSON.stringify(rowMenu));

// ── ② the window: messages, an image thumbnail through OUR route, a download chip ──
const WIN = (conv) => `(async () => {
  const w = window.app.openChannel('fake-poll', '${conv}');
  for (let i = 0; i < 80; i++) {
    const imgs = [...w.content.querySelectorAll('img.chanmsg-thumb')];
    if (w.content.querySelectorAll('.chanmsg').length && imgs.length && imgs.every((im) => im.complete)) {
      return {
        id: w.id, msgs: w.content.querySelectorAll('.chanmsg').length,
        imgs: imgs.map((im) => ({ src: im.getAttribute('src'), w: im.naturalWidth, h: im.naturalHeight })),
        chips: [...w.content.querySelectorAll('a.chanmsg-att')].map((a) => ({ href: a.getAttribute('href'), dl: a.getAttribute('download'), text: a.textContent })),
        chip: w.content.querySelector('.chan-assign-chip') ? w.content.querySelector('.chan-assign-chip').textContent : null,
        text: w.content.textContent,
      };
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return { fail: 'window never showed its attachments', text: w.content.textContent.slice(0, 300) };
})()`;
const win = await p1.evaljs(WIN('fake-poll-room-1'));
ok(!win.fail && win.msgs > 0, `the conversation window reads its messages (${win.msgs})`, JSON.stringify(win).slice(0, 300));
ok(win.imgs && win.imgs.length >= 1 && win.imgs.every((im) => /^\/api\/channels\/fake-poll\/fake-poll-room-1\/attachment\/[^?]+\?msg=[^&]+&inline=1$/.test(im.src) && im.w === 8 && im.h === 8), 'an IMAGE attachment is a thumbnail loaded through OUR route (?inline=1) and decoded (8×8 PNG)', JSON.stringify(win.imgs));
ok(win.chips && win.chips.length >= 1 && win.chips.every((c) => /\/attachment\//.test(c.href) && c.dl && /notes-\d+\.txt/.test(c.text)), 'a FILE attachment is a download chip (name + download attribute)', JSON.stringify(win.chips));
if (win.chips && win.chips[0]) {
  const r = await fetch(`http://127.0.0.1:${PORT}${win.chips[0].href}`);
  const body = await r.text();
  ok(r.status === 200 && /^attachment;/.test(r.headers.get('content-disposition') || '') && r.headers.get('x-content-type-options') === 'nosniff' && /sandbox/.test(r.headers.get('content-security-policy') || '') && /fixture attachment/.test(body), 'the download answers `attachment` + nosniff + a sandbox CSP, and carries the file', JSON.stringify([r.status, r.headers.get('content-disposition'), r.headers.get('content-type')]));
}
ok(win.text && !/跟踪|Track/.test(win.text), 'the window says nothing about tracking');

// ── ②b R3 (2026-09-26, the owner: "lark图像不能预览吗？" — he saw "[image]" and a bare "image ⬇" chip) ──
//    A LARK-SHAPED picture (text "[image]", a generic `image/*` attachment, no name) is DRAWN through our
//    route and its "[image]" line leaves; a click opens THE shared overlay; a picture the vendor rate-limits
//    once retries ITSELF and draws; a picture the vendor refuses becomes the chip that NAMES the reason
//    (in zh) with a Retry that asks again — never a silent "image ⬇".
{
  const lark1 = await p1.evaljs(`(async () => {
    const w = [...window.app.wm.windows.values()].find((x) => x._openSpec && x._openSpec.convId === 'fake-poll-room-1');
    const img = w.content.querySelector('img.chanmsg-thumb[data-channel-image="fake-poll-room-1-img0"]');
    if (!img) return { fail: 'no Lark-shaped thumbnail' };
    for (let i = 0; i < 40 && !img.dataset.drawn; i++) await new Promise((r) => setTimeout(r, 150));
    const row = img.closest('.chanmsg');
    const body = row.querySelector('.chanmsg-body');
    const out = { drawn: img.dataset.drawn === '1', w: img.naturalWidth, src: img.getAttribute('src'), bodyText: body.textContent, bodyShown: getComputedStyle(body).display !== 'none', alt: img.alt };
    img.click();
    await new Promise((r) => setTimeout(r, 100));
    const ov = document.querySelector('.chat-img-overlay img');
    out.overlay = ov ? ov.getAttribute('src') : null;
    if (ov) ov.parentElement.click();
    out.overlayGone = !document.querySelector('.chat-img-overlay');
    return out;
  })()`);
  ok(!lark1.fail && lark1.drawn && lark1.w === 8 && /\/attachment\/fake-poll-room-1-img0\?msg=[^&]+&inline=1$/.test(lark1.src), 'a LARK-SHAPED picture (`image/*`, no name) is DRAWN — fetched on demand through OUR route and decoded', JSON.stringify(lark1));
  ok(lark1.bodyText === '' && !lark1.bodyShown, '…and its "[image]" text line LEAVES once the picture is drawn (the record keeps it for agents and search)', JSON.stringify(lark1));
  ok(lark1.alt === '图片', 'the picture is named in the device\'s language (图片), never the adapter\'s English', lark1.alt);
  ok(!!lark1.overlay && lark1.overlay.endsWith(lark1.src) && lark1.overlayGone, 'a click opens THE shared image overlay on the same route (and a click closes it)', JSON.stringify(lark1));
  const refused = await p1.evaljs(`(async () => {
    const w = window.app.openChannel('fake-poll', 'fake-poll-room-2');
    for (let i = 0; i < 80; i++) {
      const gone = w.content.querySelector('.chanmsg-att-failed[data-channel-image="fake-poll-room-2-gone"]');
      const flaky = w.content.querySelector('img.chanmsg-thumb[data-channel-image="fake-poll-room-2-flaky"]');
      if (gone && flaky && flaky.dataset.drawn === '1') {
        const row = flaky.closest('.chanmsg');
        return { gone: { text: gone.textContent, title: gone.title, why: gone.querySelector('.chanmsg-att-why').textContent, retry: !!gone.querySelector('[data-channel-retry]'), refused: gone.dataset.refused }, flaky: { w: flaky.naturalWidth, src: flaky.getAttribute('src') }, body: row.querySelector('.chanmsg-body').textContent, sawWait: !!window.__sawWait };
      }
      if (w.content.querySelector('.chanmsg-att-wait')) window.__sawWait = w.content.querySelector('.chanmsg-att-wait').textContent;
      await new Promise((r) => setTimeout(r, 250));
    }
    return { fail: 'the refused / retried pictures never settled', html: [...w.content.querySelectorAll('.chanmsg-atts')].map((x) => x.textContent).join(' | ') };
  })()`);
  ok(!refused.fail && refused.flaky.w === 8 && /&n=1$/.test(refused.flaky.src), 'a picture the vendor RATE-LIMITED once waits the vendor\'s time and draws on its own retry (`&n=1`)', JSON.stringify(refused));
  ok(!refused.fail && refused.gone.refused === 'forbidden' && refused.gone.why === '被禁止' && refused.gone.retry && /图片加载失败/.test(refused.gone.title) && /图片/.test(refused.gone.text), 'a picture the vendor REFUSES is the chip that NAMES the reason in zh (图片 · 被禁止, the sentence in its title) with a Retry — never a bare "image ⬇"', JSON.stringify(refused.gone));
  ok(!refused.fail && refused.body === '[image]', '…and the message keeps ONE "[image]" line — for the picture that did not draw', JSON.stringify(refused.body));
  const retried = await p1.evaljs(`(async () => {
    const w = [...window.app.wm.windows.values()].find((x) => x._openSpec && x._openSpec.convId === 'fake-poll-room-2');
    w.content.querySelector('[data-channel-retry="fake-poll-room-2-gone"]').click();
    const saw = { img: false };
    for (let i = 0; i < 40; i++) {
      if (w.content.querySelector('img.chanmsg-thumb[data-channel-image="fake-poll-room-2-gone"]')) saw.img = true;
      const chip = w.content.querySelector('.chanmsg-att-failed[data-channel-image="fake-poll-room-2-gone"]');
      if (saw.img && chip) return { ...saw, why: chip.querySelector('.chanmsg-att-why').textContent };
      await new Promise((r) => setTimeout(r, 100));
    }
    return { ...saw, fail: 'no second verdict' };
  })()`);
  ok(!retried.fail && retried.img && retried.why === '被禁止', 'Retry asks AGAIN (a new thumbnail, `retry=1` past the remembered refusal) and a refusal that stands is said again', JSON.stringify(retried));
}

// ── ③ scroll up into the vendor's older history ──
const older = await p1.evaljs(`(async () => {
  const w = [...window.app.wm.windows.values()].find((x) => x._openSpec && x._openSpec.convId === 'fake-poll-ops') || window.app.openChannel('fake-poll', 'fake-poll-ops');
  for (let i = 0; i < 60 && !w.content.querySelectorAll('.chanmsg').length; i++) await new Promise((r) => setTimeout(r, 250));
  const before = w.content.querySelectorAll('.chanmsg').length;
  const list = w.content.querySelector('.chanwin-list');
  for (let k = 0; k < 6; k++) { list.scrollTop = 0; list.dispatchEvent(new Event('scroll')); await new Promise((r) => setTimeout(r, 500)); }
  return { before, after: w.content.querySelectorAll('.chanmsg').length, start: w.content.querySelector('.chanwin-start') ? w.content.querySelector('.chanwin-start').textContent : null };
})()`);
ok(older.start && /会话的开头|最早/.test(older.start), 'scrolling past the local log asks the vendor for older history and says where the conversation begins', JSON.stringify(older));

// ── ④ the override from the row menu, persisted, on a second client, after a reload ──
const pick = await p1.evaljs(`(async () => {
  const row = document.querySelector('.rail-panel-channels .chan-row[data-conv="fake-poll/fake-poll-room-2"]');
  row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 220, clientY: 220 }));
  await new Promise((r) => setTimeout(r, 200));
  const head = [...document.querySelectorAll('.context-menu .context-menu-item')].find((x) => /刷新周期/.test(x.textContent));
  if (!head) return { fail: 'no 刷新周期 item' };
  head.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  head.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 250));
  const minute = [...document.querySelectorAll('.context-menu .context-menu-item')].find((x) => x.textContent.trim() === '每分钟');
  if (!minute) return { fail: 'no 每分钟 item', items: [...document.querySelectorAll('.context-menu .context-menu-item')].map((x) => x.textContent.trim()) };
  minute.click();
  for (let i = 0; i < 40; i++) {
    const chip = document.querySelector('.rail-panel-channels .chan-row[data-conv="fake-poll/fake-poll-room-2"] .chan-chip');
    if (chip && /1\\s*分钟|1m/.test(chip.textContent)) return { chip: chip.textContent };
    await new Promise((r) => setTimeout(r, 150));
  }
  return { fail: 'the chip never showed the new period', chip: document.querySelector('.rail-panel-channels .chan-row[data-conv="fake-poll/fake-poll-room-2"] .chan-chip')?.textContent };
})()`);
ok(!pick.fail, 'the row menu 刷新周期 ▸ 每分钟 sets the override and the chip says it at once', JSON.stringify(pick));
const fv = await api('GET', '/api/channels/fake-poll/fake-poll-room-2');
ok(fv.json.conversation && fv.json.conversation.refresh && fv.json.conversation.refresh.every === 60 && fv.json.conversation.cadence.seconds === 60, 'the override is PERSISTED on the conversation (every 60 s, the scheduler\'s cadence)', JSON.stringify(fv.json.conversation && fv.json.conversation.refresh));
const p2 = await newPage();
ok(await p2.load(), 'page 2 loaded');
const p2rows = await p2.evaljs(PANEL);
const r2 = (p2rows.rows || []).find((r) => r.conv === 'fake-poll/fake-poll-room-2');
ok(r2 && /1\s*分钟|1m/.test(r2.chip || ''), 'a SECOND client shows the same period on the same row', JSON.stringify(r2));
await p1.reload();
const after = await p1.evaljs(PANEL);
const r3 = (after.rows || []).find((r) => r.conv === 'fake-poll/fake-poll-room-2');
ok(r3 && /1\s*分钟|1m/.test(r3.chip || ''), '…and a reload keeps it', JSON.stringify(r3));

// ── ⑤ hand the whole account to a Task Group through the one editor ──
const tg = await api('POST', '/api/tasks', { title: 'Ops desk' });
ok(tg.status === 200 && tg.json.task && tg.json.task.id, 'FIXTURE: a Task Group to hand the account to', JSON.stringify(tg.json));
for (let i = 0; i < 40; i++) { if (await p1.evaljs(`(window.app.sidebar._tasks || []).some((t) => t.title === 'Ops desk')`)) break; await sleep(150); }
const hand = await p1.evaljs(`(async () => {
  const sec = document.querySelector('.rail-panel-channels .chan-sec[data-adapter="fake-poll"]');
  const more = sec && sec.querySelector('.chan-sec-more');
  if (!more) return { fail: 'no ⋯ on the fake-poll section' };
  more.click();
  await new Promise((r) => setTimeout(r, 200));
  const items = [...document.querySelectorAll('.context-menu .context-menu-item')];
  const it = items.find((x) => /交给一个 agent/.test(x.textContent));
  if (!it) return { fail: 'no 交给一个 agent… item', items: items.map((x) => x.textContent.trim()) };
  it.click();
  for (let i = 0; i < 40 && !document.getElementById('chan-scope-assign-dialog'); i++) await new Promise((r) => setTimeout(r, 100));
  const dlg = document.getElementById('chan-scope-assign-dialog');
  if (!dlg) return { fail: 'the editor did not open' };
  const who = dlg.querySelector('select');
  const opt = [...who.options].find((o) => /Ops desk/.test(o.textContent));
  if (!opt) return { fail: 'the Task Group is not offered', opts: [...who.options].map((o) => o.textContent) };
  who.value = opt.value; who.dispatchEvent(new Event('change'));
  for (let i = 0; i < 40; i++) { const st = dlg.querySelector('.chan-af-stat'); if (st && !/估算中|估计中|Estimating/.test(st.textContent)) break; await new Promise((r) => setTimeout(r, 150)); }
  const estimate = dlg.querySelector('.chan-af-stat') ? dlg.querySelector('.chan-af-stat').textContent : null;
  const save = [...dlg.querySelectorAll('button')].find((b) => /保存/.test(b.textContent));
  save.click();
  for (let i = 0; i < 40 && document.getElementById('chan-scope-assign-dialog'); i++) await new Promise((r) => setTimeout(r, 100));
  return { estimate, closed: !document.getElementById('chan-scope-assign-dialog') };
})()`);
ok(!hand.fail && hand.closed, 'the account ⋯ 交给一个 agent… opens the ONE editor and saves the account grain to the Task Group', JSON.stringify(hand));
ok(hand.estimate && /每天唤醒/.test(hand.estimate), 'before saving the editor shows the honest estimate over the account ("大约每天唤醒 N 次")', hand.estimate);
const inh = await p1.evaljs(`(async () => {
  for (let i = 0; i < 60; i++) {
    const rows = [...document.querySelectorAll('.rail-panel-channels .chan-row')].filter((r) => (r.dataset.conv || '').startsWith('fake-poll/'));
    const tags = rows.map((r) => r.querySelector('.chan-row-assign'));
    if (tags.length && tags.every(Boolean)) return { rows: rows.map((r) => ({ conv: r.dataset.conv, text: r.querySelector('.chan-row-assign').textContent, grain: r.querySelector('.chan-row-assign').dataset.grain, dim: r.querySelector('.chan-row-assign').classList.contains('chan-row-inherited') })), grainLine: document.querySelector('.rail-panel-channels .chan-grain-line') ? document.querySelector('.rail-panel-channels .chan-grain-line').textContent : null };
    await new Promise((r) => setTimeout(r, 200));
  }
  return { fail: 'the rows never showed the inherited assignment' };
})()`);
ok(!inh.fail && inh.rows.length === 5 && inh.rows.every((r) => r.grain === 'account' && r.dim && /Ops desk/.test(r.text) && /（账号）/.test(r.text)), 'EVERY row of the account now wears the INHERITED chip, dim and labelled （账号）', JSON.stringify(inh).slice(0, 500));
ok(inh.grainLine && /已交给/.test(inh.grainLine) && /Ops desk/.test(inh.grainLine), 'the account section says 已交给 Ops desk · …', inh.grainLine);
const win2 = await p1.evaljs(`(async () => {
  const w = window.app.openChannel('fake-poll', 'fake-poll-room-3');
  for (let i = 0; i < 60; i++) { const c = w.content.querySelector('.chan-assign-chip'); if (c && /Ops desk/.test(c.textContent)) return { chip: c.textContent, inherited: c.classList.contains('chan-assign-inherited') }; await new Promise((r) => setTimeout(r, 200)); }
  return { fail: 'no inherited chip on the window' };
})()`);
ok(!win2.fail && win2.inherited && /（账号）/.test(win2.chip), 'the conversation window\'s chip says the assignment is inherited from the account', JSON.stringify(win2));
// R3 (§23) + D4 (2026-09-27, the integrator's ruling — "handing the whole account to an agent would put all 824
// back on the first screen, the exact thing the owner asked us to stop"): handed over at the ACCOUNT grain, the
// account's conversations do NOT join the attention list for that alone. One joins once an agent READ it (a wake
// DELIVERED to the agent would too — the fake world never grows a message, so the read is the leg), wearing the
// read tag: the account grain is never the reason by itself.
const FOCUS_POLL = `(() => { const g = document.querySelector('.rail-panel-channels .chan-groups'); const rows = [...document.querySelectorAll('.rail-panel-channels .chan-groups > .chan-grow')].filter((r) => (r.dataset.grow || '').startsWith('fake-poll/')); return { view: g ? g.dataset.view : null, rows: rows.map((r) => { const tg = r.querySelector('.chan-grow-tag'); const who = r.querySelector('.chan-tag-who'); return { key: r.dataset.grow, tag: tg ? tg.dataset.tag : null, text: tg ? tg.textContent : null, who: who ? who.textContent : null }; }) }; })()`;
let off = null;
for (let i = 0; i < 12; i++) { off = await p1.evaljs(FOCUS_POLL); if (off.rows.length) break; await sleep(250); }
ok(off.view === 'focus' && off.rows.length === 0, 'D4: handed over at the ACCOUNT grain, NONE of the account\'s 5 conversations joins the attention list for that alone (no wake delivered, no agent read — watched 3 s)', JSON.stringify(off));
const allView = await p1.evaljs(`(async () => { document.querySelector('.rail-panel-channels .chan-view-btn[data-view="all"]').click(); await new Promise((r) => setTimeout(r, 300)); const f = ${FOCUS_POLL}; document.querySelector('.rail-panel-channels .chan-view-btn[data-view="focus"]').click(); await new Promise((r) => setTimeout(r, 300)); return f; })()`);
ok(allView.view === 'all' && allView.rows.length === 5 && allView.rows.every((r) => r.tag === null), '…"全部" still lists all 5 — untagged: an account-grain hand-over is not a reason to be on the first screen', JSON.stringify(allView));
if (!HAVE_DTACH) console.log('  SKIP: the agent-read leg needs dtach for its stub agent session (no dtach on PATH)');
else {
  const RCONV = 'fake-poll-room-3';
  const reach = await api('PUT', `/api/channels/fake-poll/${RCONV}/reach`, { principal: { kind: 'agent', id: READER.cid, name: READER.name }, level: 'visible' });
  ok(reach.status === 200, `FIXTURE: ${READER.name} may see fake-poll/${RCONV}`, JSON.stringify(reach.json).slice(0, 200));
  const rd = await fetch(`http://127.0.0.1:${PORT}/api/agent/channels/read?conv=${encodeURIComponent('fake-poll/' + RCONV)}`, { headers: { Authorization: 'Bearer ' + READER.token } }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
  ok(rd.status === 200 && rd.body.ok && (rd.body.records || []).length > 0, `FIXTURE: ${READER.name} READS fake-poll/${RCONV} through its own agent route (vibespace-channels read)`, JSON.stringify(rd.body).slice(0, 200));
  let on = null;
  for (let i = 0; i < 40; i++) { on = await p1.evaljs(FOCUS_POLL); if (on.rows.length) break; await sleep(250); }
  ok(on.rows.length === 1 && on.rows[0].key === `fake-poll/${RCONV}` && on.rows[0].tag === 'read' && on.rows[0].who === READER.name && /读过/.test(on.rows[0].text || ''), `the agent's READ lists that ONE conversation, tagged "${on && on.rows[0] ? on.rows[0].text : ''}" (the read tag, never "→ Ops desk"); the other 4 stay off`, JSON.stringify(on));
}
const acl = await api('GET', '/api/channels');
ok((acl.json.conversations || []).filter((c) => c.adapterId === 'fake-poll').every((c) => c.assignment && c.assignment.source === 'account'), 'the wire agrees: every row\'s effective assignment comes from the account grain');

// ── ⑦ THE OWNER'S SAVE (hotfix 2026-09-26): a filtered hand-off with its filter inline ──
// The owner's screenshot: "把整个账号交给一个 agent — Lark / 飞书", 唤醒 组 · 工作, 开 = 匹配过滤器的
// 消息 (two 时间窗口 rules), 投递 = 每个窗口一份摘要 (窗口 9999), 每天最多唤醒次数 9999, 权限 起草
// ⇒ 保存 answered 请求被拒绝: mode 'filtered' needs a filterId. Driven through the same dialog
// on the fake account, from a fresh hand-off (the Ops desk grain of ⑤ released first).
const un = await api('PUT', '/api/channels/adapters/fake-poll/assignment', { assignment: null });
ok(un.status === 200 && un.json.ok === true, 'FIXTURE: the account grain of ⑤ is released (a fresh hand-off, as the owner\'s was)', JSON.stringify(un.json));
const tgWork = await api('POST', '/api/tasks', { title: '工作' });
ok(tgWork.status === 200 && tgWork.json.task && tgWork.json.task.id, 'FIXTURE: the Task Group 工作', JSON.stringify(tgWork.json));
for (let i = 0; i < 40; i++) { if (await p1.evaljs(`(window.app.sidebar._tasks || []).some((t) => t.title === '工作')`)) break; await sleep(150); }
const OWNER_DIALOG = (edit) => `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 40; i++) { const s = document.querySelector('.rail-panel-channels .chan-sec[data-adapter="fake-poll"]'); if (s && ${edit ? '' : '!'}s.querySelector('.chan-grain-line[data-grain="account"]')) break; await sleep(150); }
  const sec = document.querySelector('.rail-panel-channels .chan-sec[data-adapter="fake-poll"]');
  const more = sec && sec.querySelector('.chan-sec-more');
  if (!more) return { fail: 'no ⋯ on the fake-poll section' };
  more.click();
  await sleep(200);
  const it = [...document.querySelectorAll('.context-menu .context-menu-item')].find((x) => /交给/.test(x.textContent));
  if (!it) return { fail: 'no 交给 item', items: [...document.querySelectorAll('.context-menu .context-menu-item')].map((x) => x.textContent.trim()) };
  const itemText = it.textContent.trim();
  it.click();
  for (let i = 0; i < 40 && !document.getElementById('chan-scope-assign-dialog'); i++) await sleep(100);
  const dlg = document.getElementById('chan-scope-assign-dialog');
  if (!dlg) return { fail: 'the editor did not open' };
  const title = dlg.querySelector('.dialog-header h3') ? dlg.querySelector('.dialog-header h3').textContent : null;
  const selWith = (v) => [...dlg.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === v));
  const rows = () => [...dlg.querySelectorAll('.chan-af-rules:not(.chan-pat-rules) .chan-af-rule')];
  let prefill = null;
  if (${edit}) {
    prefill = { mode: selWith('filtered').value, notify: selWith('digest').value, rules: rows().map((r) => [...r.querySelectorAll('input')].map((i) => i.value)), who: dlg.querySelector('select').selectedOptions[0] ? dlg.querySelector('select').selectedOptions[0].textContent : null };
  } else {
    const who = dlg.querySelector('select');
    const opt = [...who.options].find((o) => o.textContent === '组 · 工作');
    if (!opt) return { fail: 'the group is not offered as 组 · 工作', opts: [...who.options].map((o) => o.textContent) };
    who.value = opt.value; who.dispatchEvent(new Event('change'));
    const mode = selWith('filtered'); mode.value = 'filtered'; mode.dispatchEvent(new Event('change'));
    const add = [...dlg.querySelectorAll('button')].find((b) => b.textContent.trim() === '添加规则');
    if (!add) return { fail: 'no 添加规则 button' };
    const windows = [['09:00', '12:00'], ['14:00', '18:00']];
    for (let k = 0; k < windows.length; k++) {
      add.click(); await sleep(50);
      const row = rows()[k];
      const ks = row.querySelector('select'); ks.value = 'time-window'; ks.dispatchEvent(new Event('change')); await sleep(50);
      const ins = rows()[k].querySelectorAll('input');
      ins[0].value = windows[k][0]; ins[0].dispatchEvent(new Event('input'));
      ins[1].value = windows[k][1]; ins[1].dispatchEvent(new Event('input'));
    }
    const notify = selWith('digest'); notify.value = 'digest'; notify.dispatchEvent(new Event('change'));
    const nums = [...dlg.querySelectorAll('input[type=number]')];
    nums[0].value = '9999'; nums[0].dispatchEvent(new Event('input'));
    nums[1].value = '9999'; nums[1].dispatchEvent(new Event('input'));
    const auth = selWith('draft'); auth.value = 'draft'; auth.dispatchEvent(new Event('change'));
  }
  for (let i = 0; i < 40; i++) { const st = dlg.querySelector('.chan-af-stat'); if (st && !/估算中|估计中|Estimating/.test(st.textContent)) break; await sleep(150); }
  const estimate = dlg.querySelector('.chan-af-stat') ? dlg.querySelector('.chan-af-stat').textContent : null;
  const toastsBefore = document.querySelectorAll('#global-toasts .global-toast').length;
  const save = [...dlg.querySelectorAll('button')].find((b) => b.textContent.trim() === '保存');
  save.click();
  for (let i = 0; i < 50 && document.getElementById('chan-scope-assign-dialog'); i++) await sleep(100);
  await sleep(200);
  const toasts = [...document.querySelectorAll('#global-toasts .global-toast')].slice(toastsBefore).map((x) => ({ error: x.classList.contains('global-toast-error'), text: x.textContent }));
  const closed = !document.getElementById('chan-scope-assign-dialog');
  if (!closed) document.getElementById('chan-scope-assign-dialog').remove();
  return { itemText, title, prefill, estimate, closed, toasts };
})()`;
const own = await p1.evaljs(OWNER_DIALOG(false));
ok(!own.fail && /把整个账号交给一个 agent/.test(own.title || ''), 'the account ⋯ 交给一个 agent… opens 把整个账号交给一个 agent — …', JSON.stringify(own));
ok(own.closed && !(own.toasts || []).some((x) => x.error), 'the OWNER\'S save (组 · 工作, 匹配过滤器的消息 × two 时间窗口 rules, 每个窗口一份摘要 9999, cap 9999, 起草) CLOSES with no error toast', JSON.stringify(own.toasts));
ok((own.toasts || []).some((x) => !x.error && /账号已交给 工作/.test(x.text)) && !(own.toasts || []).some((x) => /filterId|mode 'filtered'/.test(x.text)), 'the toast says 账号已交给 工作 — and nothing says `mode \'filtered\' needs a filterId`', JSON.stringify(own.toasts));
const line = await p1.evaljs(`(async () => {
  for (let i = 0; i < 60; i++) { const l = document.querySelector('.rail-panel-channels .chan-sec[data-adapter="fake-poll"] .chan-grain-line[data-grain="account"]'); if (l && /工作/.test(l.textContent)) return l.textContent; await new Promise((r) => setTimeout(r, 200)); }
  return null;
})()`);
ok(line === '已交给 工作 · 已过滤 · 每 1440 分钟一份摘要', `the account card's line reads "${line}" (9999 held to the 1440-minute bound)`, line);
const wire = await api('GET', '/api/channels');
const acctA = ((wire.json.adapters || []).find((x) => x.id === 'fake-poll') || {}).assignment || {};
ok(acctA.mode === 'filtered' && acctA.filterId === 'f-account-fake-poll' && acctA.filter && acctA.filter.rules.length === 2 && acctA.filter.rules.map((r) => `${r.from}-${r.to}`).join() === '09:00-12:00,14:00-18:00' && acctA.principal.kind === 'group' && acctA.principal.name === '工作' && acctA.notify === 'digest' && acctA.digestMinutes === 1440 && acctA.dailyWakeCap === 1000 && acctA.authority === 'draft', 'the wire holds the grain: group 工作, filtered by f-account-fake-poll (09:00-12:00, 14:00-18:00), digest 1440, cap 1000, draft', JSON.stringify(acctA));
const again = await p1.evaljs(OWNER_DIALOG(true));
ok(!again.fail && /已交给 agent/.test(again.itemText || '') && again.prefill && again.prefill.who === '组 · 工作' && again.prefill.mode === 'filtered' && again.prefill.notify === 'digest' && JSON.stringify(again.prefill.rules) === JSON.stringify([['09:00', '12:00'], ['14:00', '18:00']]), 're-opening (已交给 agent —— 编辑…) prefills 组 · 工作 and 匹配过滤器的消息 with the two saved windows', JSON.stringify(again));
ok(again.closed && !(again.toasts || []).some((x) => x.error), 'saving the edit (the filter re-sent inline) closes with no error toast', JSON.stringify(again.toasts));

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
