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
//   ⑤ R4 (2026-09-27): access and notification are TWO operations, access
//     first — the account ⋯ offers 授权访问… then 通知…; the owner's case:
//     the group 工作 with ACCESS ONLY and one agent with access + a wake on a
//     filter; the Notify picker is EXACTLY the access list; the card line
//     names both with their modes; every row wears the INHERITED line
//     "（账号）"; removing access removes the notification in one write
//     — then (R3 r2, D4 2026-09-27) the account's conversations do NOT join
//     the first screen for the account grain alone — one joins once an agent
//     READS it (a stub agent session's own agent route), wearing the read tag
//   ⑥ zero Latin-only "Track"/"tracked" words on the panel and the window
//   ⑦ (hotfix 2026-09-26, the owner's toast "请求被拒绝: mode 'filtered' needs a
//     filterId") the owner's EXACT numbers through 通知…: 组 · 工作, 匹配过滤器的
//     消息 with two time-window rules, 每个窗口一份摘要 9999, cap 9999 ⇒ the
//     dialog says "已保持在最大值 1440 / 1000" BEFORE saving, 保存 closes with NO
//     error toast, the account line says it, the wire holds the minted filter
//     id, and re-opening prefills the rules and the stored numbers
//   mirror-193 (2026-09-27, the 2.369.193 Actions mirror, red on both heavy attempts): ⑤'s Grant access… runs
//     with page 1's channels-updated frames HELD from before the seed — the runner's order (the panel's copy had
//     not heard of Xi), constructed on every machine — and the dialog must draw and save the SERVER's lists (it
//     reads GET …/adapters/:id/view); every save is judged by its toast's ARRIVAL (a MutationObserver log), never
//     by counting a stack that also shrinks (⑦'s control: an older toast leaving mid-save reads the runner's
//     `[]`); ⑧ a grant landing WHILE the dialog is open is refused `grain-changed` (nothing written) and the dialog
//     re-opens on it; ⑨/⑨b the conversation window's list has ONE writer (three renders in flight; a repaint's
//     clear and its scroll event), constructed and judged once every bar and page parsed; CONTROL = one scratch
//     bundle with the three client fixes reverted. A page throw names its line.
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
import vm from 'node:vm';
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
    if (r2.result?.exceptionDetails) {
      // a red names its throw (mirror-193: the runner's log cut the JSON before anything said WHICH line threw):
      // the exception's own description, then the evaluated expression's line under a caret, then the raw record
      const x = r2.result.exceptionDetails;
      const lines = String(expr).split('\n');
      let at = lines[x.lineNumber] !== undefined ? `\n    at expression line ${x.lineNumber + 1}: ${lines[x.lineNumber].trim().slice(0, 240)}` : '';
      // an expression that does not even compile: V8's own parse here names the line and draws the caret
      if (x.exception && x.exception.className === 'SyntaxError') { try { new vm.Script(String(expr), { filename: 'page-expression' }); } catch (e) { at = '\n    ' + String(e.stack).split('\n').slice(0, 4).join('\n    '); } }
      const desc = (x.exception && x.exception.description) || x.text || 'unknown';
      throw new Error('page threw: ' + String(desc).split('\n').slice(0, 3).join(' | ') + at + '\n    ' + JSON.stringify(x).slice(0, 900));
    }
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

// ── ⑤ R4 (2026-09-27): ACCESS and NOTIFICATION are TWO OPERATIONS, access first ──
// The owner: "你之前的交互的问题是把'让agent能访问对话'和'让agent会被通知'耦合在一起了" /
// "这实际上应该是两种不同的操作，前者是后者的前提". The owner's concrete case: the
// account is given to the GROUP 工作 with ACCESS ONLY (no notification), and to one
// agent with access + a WAKE on a filter; the card line names both with their modes.
// (No agent session runs on this scratch server: the agent's access is seeded through
// the route, and the dialog keeps a stored principal — "(此刻不在线)".)
const tgWork = await api('POST', '/api/tasks', { title: '工作' });
const GID = tgWork.json && tgWork.json.task && tgWork.json.task.id;
ok(tgWork.status === 200 && GID, 'FIXTURE: the Task Group 工作', JSON.stringify(tgWork.json));
let tgSeen = false;
for (let i = 0; i < 200 && !tgSeen; i++) { tgSeen = await p1.evaljs(`(window.app.sidebar._tasks || []).some((t) => t.title === '工作')`); if (!tgSeen) await sleep(150); }
ok(tgSeen, 'FIXTURE: page 1\'s Task Group mirror holds 工作 (the Grant access… picker offers it from there)');
// THE RUNNER'S ORDER, CONSTRUCTED (mirror-193, attempt 1): the seed below reached the server, and the 2-lane
// runner's page had not yet applied its `channels-updated` when 授权访问… opened — the dialog drew the panel's copy
// (no Xi ⇒ its default row = the first live agent, reader) and its whole-list Save wrote [reader, 工作] over Xi.
// Here page 1 HOLDS every `channels-updated` frame from before the seed until the dialog was judged: its panel copy
// is stale BY CONSTRUCTION on every machine, and the dialog must still draw — and save over — the server's lists.
const HOLD = (on) => `(() => {
  const w = window.app.ws, sock = w.ws;
  if (${on}) {
    if (window.__vsHeld) return { held: 'already' };
    // every URL the page fetches from here on (the dialog's fresh read is judged from it, never from the resource
    // timing buffer, which stops recording at 250 entries)
    window.__vsFetchLog = [];
    if (!window.__vsFetchWrapped) { window.__vsFetchWrapped = true; const f0 = window.fetch; window.fetch = function (u, ...r) { try { window.__vsFetchLog.push(String((u && u.url) || u)); } catch {} return f0.call(this, u, ...r); }; }
    const orig = sock.onmessage;
    window.__vsHeld = { sock, orig, frames: [] };
    sock.onmessage = (e) => { let ty = null; try { ty = JSON.parse(e.data).type; } catch {} if (ty === 'channels-updated') { window.__vsHeld.frames.push(e); return; } orig.call(sock, e); };
    return { held: true };
  }
  const h = window.__vsHeld; if (!h) return { released: 0 };
  h.sock.onmessage = h.orig; window.__vsHeld = null;
  for (const e of h.frames) h.orig.call(h.sock, e);
  return { released: h.frames.length };
})()`;
const PANEL_LINE = `(() => { const l = document.querySelector('.rail-panel-channels .chan-sec[data-adapter="fake-poll"] .chan-grain-line[data-grain="account"]'); return l ? l.textContent : ''; })()`;
ok((await p1.evaljs(HOLD(true))).held === true, 'CONSTRUCTION: page 1 holds its channels-updated frames (its panel copy will not hear of the seed)');
const seed = await api('PUT', '/api/channels/adapters/fake-poll/access', { access: [{ principal: { kind: 'agent', id: 'agent-xi', name: 'Xi' }, authority: 'draft' }] });
ok(seed.status === 200 && seed.json.ok && seed.json.watchers.length === 0, 'FIXTURE: the agent Xi holds ACCESS to the whole account (the first operation, through its route) — no notification', JSON.stringify(seed.json));
const W_BAD = await api('PUT', '/api/channels/adapters/fake-poll/watchers', { watchers: [{ principal: { kind: 'group', id: GID, name: '工作' }, notify: 'wake' }] });
ok(W_BAD.status === 400 && W_BAD.json.code === 'watcher-needs-access' && W_BAD.json.principal && W_BAD.json.principal.id === GID, 'a notification for 工作 BEFORE it has access is refused BY NAME (watcher-needs-access) — notification needs access', JSON.stringify(W_BAD.json));
// THE TOASTS A SAVE PRODUCED, JUDGED BY ARRIVAL (mirror-193, attempt 2: `[]` — the old judge counted the stack before
// the click and sliced the stack after it; a toast is capped at 4 and expires 3 s after it is shown, so an OLDER
// toast leaving during a slow save shifted the count and the new toast fell outside the slice). A MutationObserver
// on the page records every toast AS IT IS ADDED with its instant; a save is judged once its OUTCOME arrived — the
// dialog gone AND a toast recorded, or an error toast — under a deadline only for a save that never answers.
const TOAST_LOG = `if (!window.__vsToastLog) {
    window.__vsToastLog = [];
    new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) { const all = n.nodeType === 1 ? [n, ...n.querySelectorAll('.global-toast')] : []; for (const x of all) if (x.classList && x.classList.contains('global-toast')) window.__vsToastLog.push({ at: Date.now(), error: x.classList.contains('global-toast-error'), text: (x.querySelector('.global-toast-body') || x).textContent }); } }).observe(document.body, { childList: true, subtree: true });
  }`;
const SAVE_OUTCOME = (dlgId) => `async (saveBtn) => {
    const t0 = Date.now(), at0 = window.__vsToastLog.length;
    saveBtn.click();
    const since = () => window.__vsToastLog.slice(at0).map(({ error, text }) => ({ error, text }));
    for (let i = 0; i < 300; i++) { const ts = since(); const closed = !document.getElementById(${JSON.stringify(dlgId)}); if ((closed && ts.length) || ts.some((x) => x.error)) break; await new Promise((r) => setTimeout(r, 100)); }
    return { closed: !document.getElementById(${JSON.stringify(dlgId)}), toasts: since(), ms: Date.now() - t0 };
  }`;
const MENU = (item) => `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 200 && !document.querySelector('.rail-panel-channels .chan-sec[data-adapter="fake-poll"] .chan-sec-more'); i++) await sleep(150);
  document.querySelector('.rail-panel-channels .chan-sec[data-adapter="fake-poll"] .chan-sec-more').click();
  await sleep(200);
  const items = [...document.querySelectorAll('.context-menu .context-menu-item')].map((x) => x.textContent.trim());
  const it = [...document.querySelectorAll('.context-menu .context-menu-item')].find((x) => x.textContent.trim() === ${JSON.stringify('%ITEM%')});
  if (!it) { document.querySelector('.context-menu') && document.querySelector('.context-menu').remove(); return { fail: 'no item', items }; }
  it.click();
  return { items };
})()`.replace('%ITEM%', item);
const m1 = await p1.evaljs(MENU('授权访问…'));
ok(!m1.fail && m1.items.indexOf('授权访问…') >= 0 && m1.items.indexOf('授权访问…') + 1 === m1.items.indexOf('通知…') && !m1.items.some((x) => /交给/.test(x)), 'the account ⋯ offers TWO operations, access first — 授权访问… then 通知… — and no 交给一个 agent… any more', JSON.stringify(m1.items));
const grant = await p1.evaljs(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 300 && !document.getElementById('chan-access-dialog'); i++) await sleep(100);   // a deadline for a dialog that never opens (it re-reads the grain first)
  const dlg = document.getElementById('chan-access-dialog');
  if (!dlg) return { fail: 'Grant access… did not open' };
  const title = dlg.querySelector('.dialog-header h3').textContent;
  const before = [...dlg.querySelectorAll('.chan-access-row')].map((r) => r.querySelector('select').selectedOptions[0].textContent);
  // the evidence the construction held and the dialog read the server: the panel's copy has no Xi, the dialog
  // fetched the account's fresh view
  const panelLine = ${PANEL_LINE};
  const readFresh = (window.__vsFetchLog || []).some((u) => /\\/api\\/channels\\/adapters\\/fake-poll\\/view$/.test(u));
  const add = [...dlg.querySelectorAll('button')].find((b) => b.textContent.trim() === '添加 agent 或组');
  if (!add) return { fail: 'no 添加 agent 或组' };
  add.click(); await sleep(50);
  const rows = [...dlg.querySelectorAll('.chan-access-row')];
  const who = rows[rows.length - 1].querySelector('select');
  const opt = [...who.options].find((o) => o.textContent === '组 · 工作');
  if (!opt) return { fail: 'the group is not offered as 组 · 工作', opts: [...who.options].map((o) => o.textContent) };
  who.value = opt.value; who.dispatchEvent(new Event('change')); await sleep(50);
  ${TOAST_LOG}
  const out = await (${SAVE_OUTCOME('chan-access-dialog')})([...dlg.querySelectorAll('button')].find((b) => b.textContent.trim() === '保存'));
  return { title, before, panelLine, readFresh, ...out };
})()`);
const released = await p1.evaljs(HOLD(false));
ok(!grant.fail && !/Xi/.test(grant.panelLine) && released.released > 0, `CONSTRUCTION held: when the dialog opened, page 1's panel copy had not heard of Xi (its account line: "${grant.panelLine}"; ${released.released} held frame(s) released after)`, JSON.stringify({ panelLine: grant.panelLine, released }));
ok(!grant.fail && /授权访问整个账号/.test(grant.title) && grant.before.length === 1 && /Xi/.test(grant.before[0]) && grant.readFresh, '授权访问… opens "授权访问整个账号 — …" with the account\'s access rows as the SERVER holds them (Xi, kept though not live) — read fresh (GET …/adapters/fake-poll/view), never from the stale panel copy', JSON.stringify(grant));
ok(grant.closed && !(grant.toasts || []).some((x) => x.error) && (grant.toasts || []).some((x) => /访问权限已保存/.test(x.text) && /通知…/.test(x.text)), 'adding 组 · 工作 and saving closes with the toast "访问权限已保存 … 除非添加通知（通知…），否则不会唤醒任何人"', JSON.stringify(grant.toasts));
const acc1 = ((await api('GET', '/api/channels')).json.adapters || []).find((x) => x.id === 'fake-poll').accountGrain;
ok(acc1 && acc1.access.map((r) => `${r.principal.name}:${r.authority}`).sort().join() === 'Xi:draft,工作:draft' && acc1.watchers.length === 0, 'the wire: ACCESS = Xi + 工作 (both draft), WATCHERS = none', JSON.stringify(acc1 && { access: acc1.access, watchers: acc1.watchers }));
const m2 = await p1.evaljs(MENU('通知…'));
ok(!m2.fail, 'the account ⋯ 通知… opens', JSON.stringify(m2));
const notify = await p1.evaljs(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 300 && !document.querySelector('#chan-notify-dialog .chan-watch-row'); i++) await sleep(100);   // a deadline for a dialog that never opens (it re-reads the grain first)
  const dlg = document.getElementById('chan-notify-dialog');
  if (!dlg) return { fail: 'Notify… did not open' };
  const row = dlg.querySelector('.chan-watch-row');
  const who = row.querySelector('select');
  const picker = [...who.options].map((o) => o.textContent);
  const addNote = [...dlg.querySelectorAll('button')].find((b) => b.textContent.trim() === '添加通知');
  const sels = row.querySelectorAll('select.chan-opt-input');
  who.value = [...who.options].find((o) => /Xi/.test(o.textContent)).value; who.dispatchEvent(new Event('change'));
  sels[1].value = 'filtered'; sels[1].dispatchEvent(new Event('change')); await sleep(50);
  [...row.querySelectorAll('button')].find((b) => b.textContent.trim() === '添加规则').click(); await sleep(50);
  const inp = row.querySelector('.chan-af-rule input'); inp.value = 'deploy'; inp.dispatchEvent(new Event('input'));
  for (let i = 0; i < 40; i++) { const st = row.querySelector('.chan-af-stat'); if (st && !/估算中|估计中|Estimating/.test(st.textContent)) break; await sleep(150); }
  const estimate = row.querySelector('.chan-af-stat').textContent;
  const total = dlg.querySelector('.chan-watch-total') ? dlg.querySelector('.chan-watch-total').textContent : null;
  ${TOAST_LOG}
  const out = await (${SAVE_OUTCOME('chan-notify-dialog')})([...dlg.querySelectorAll('button')].find((b) => b.textContent.trim() === '保存'));
  return { picker, canAdd: !!addNote && addNote.style.display !== 'none', estimate, total, ...out };
})()`);
ok(!notify.fail && notify.picker.length === 2 && notify.picker.some((o) => /Xi/.test(o)) && notify.picker.includes('组 · 工作'), 'the NOTIFY picker is EXACTLY the account\'s access list (Xi, 组 · 工作) — nobody without access is offered', JSON.stringify(notify.picker));
ok(notify.closed && !(notify.toasts || []).some((x) => x.error) && /每天约/.test(notify.total || ''), 'one watcher (Xi, wake, 按过滤器 keyword deploy) saves with no error; the total line sums the ceilings', JSON.stringify(notify));
const acc2 = ((await api('GET', '/api/channels')).json.adapters || []).find((x) => x.id === 'fake-poll').accountGrain;
ok(acc2 && acc2.watchers.length === 1 && acc2.watchers[0].principal.name === 'Xi' && acc2.watchers[0].notify === 'wake' && acc2.watchers[0].mode === 'filtered' && acc2.watchers[0].filter && acc2.watchers[0].filter.rules[0].value === 'deploy' && acc2.access.length === 2, 'the wire: Xi WATCHES (wake on its filter); 工作 has ACCESS ONLY — no watcher', JSON.stringify(acc2 && acc2.watchers));
const CARD = '访问：Xi（起草）, 组 · 工作（起草） · 通知：Xi 每批唤醒 按过滤器';
const card = await p1.evaljs(`(async () => {
  for (let i = 0; i < 60; i++) { const l = document.querySelector('.rail-panel-channels .chan-sec[data-adapter="fake-poll"] .chan-grain-line[data-grain="account"]'); if (l && /通知：Xi/.test(l.textContent)) return l.textContent; await new Promise((r) => setTimeout(r, 200)); }
  const l = document.querySelector('.rail-panel-channels .chan-sec[data-adapter="fake-poll"] .chan-grain-line[data-grain="account"]'); return l ? l.textContent : null;
})()`);
ok(card === CARD, `THE OWNER'S CASE on the account card: "${card}" — both principals with their modes (工作 access only, Xi woken on a filter)`, card);
// R4 verify r1: the SECOND client (page 2, open since ④) shows the same line off the broadcast — no reload
const card2 = await p2.evaljs(`(async () => {
  for (let i = 0; i < 60; i++) { const l = document.querySelector('.rail-panel-channels .chan-sec[data-adapter="fake-poll"] .chan-grain-line[data-grain="account"]'); if (l && /通知：Xi/.test(l.textContent)) return l.textContent; await new Promise((r) => setTimeout(r, 200)); }
  const l = document.querySelector('.rail-panel-channels .chan-sec[data-adapter="fake-poll"] .chan-grain-line[data-grain="account"]'); return l ? l.textContent : null;
})()`);
ok(card2 === CARD, `a SECOND client shows the same access + notification line without a reload: "${card2}"`, card2);
const inh = await p1.evaljs(`(async () => {
  for (let i = 0; i < 60; i++) {
    const rows = [...document.querySelectorAll('.rail-panel-channels .chan-row')].filter((r) => (r.dataset.conv || '').startsWith('fake-poll/'));
    const tags = rows.map((r) => r.querySelector('.chan-row-assign'));
    if (tags.length && tags.every(Boolean) && tags.every((x) => /工作/.test(x.textContent))) return { rows: rows.map((r) => ({ conv: r.dataset.conv, text: r.querySelector('.chan-row-assign').textContent, grain: r.querySelector('.chan-row-assign').dataset.grain, dim: r.querySelector('.chan-row-assign').classList.contains('chan-row-inherited') })) };
    await new Promise((r) => setTimeout(r, 200));
  }
  return { fail: 'the rows never showed the inherited access / notification' };
})()`);
ok(!inh.fail && inh.rows.length === 5 && inh.rows.every((r) => r.grain === 'account' && r.dim && /Xi/.test(r.text) && /工作/.test(r.text) && /（账号）/.test(r.text)), 'EVERY row of the account wears the INHERITED line (访问 … · 通知 …), dim and labelled （账号）', JSON.stringify(inh).slice(0, 500));
const win2 = await p1.evaljs(`(async () => {
  const w = window.app.openChannel('fake-poll', 'fake-poll-room-3');
  for (let i = 0; i < 60; i++) { const c = w.content.querySelector('.chan-assign-chip'); if (c && /工作/.test(c.textContent)) return { chip: c.textContent, inherited: c.classList.contains('chan-assign-inherited') }; await new Promise((r) => setTimeout(r, 200)); }
  return { fail: 'no inherited chip on the window' };
})()`);
ok(!win2.fail && win2.inherited && /（账号）/.test(win2.chip) && /通知：Xi/.test(win2.chip), 'the conversation window\'s chip says both, inherited from the account', JSON.stringify(win2));
// REMOVING ACCESS REMOVES THE NOTIFICATION — through the dialog (× on Xi's row)
const drop = await p1.evaljs(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelector('.rail-panel-channels .chan-sec[data-adapter="fake-poll"] .chan-sec-more').click(); await sleep(200);
  [...document.querySelectorAll('.context-menu .context-menu-item')].find((x) => x.textContent.trim() === '授权访问…').click();
  for (let i = 0; i < 300 && !document.getElementById('chan-access-dialog'); i++) await sleep(100);   // a deadline for a dialog that never opens (it re-reads the grain first)
  const dlg = document.getElementById('chan-access-dialog');
  const row = [...dlg.querySelectorAll('.chan-access-row')].find((r) => /Xi/.test(r.querySelector('select').selectedOptions[0].textContent));
  row.querySelector('.chan-af-rm').click(); await sleep(50);
  const note = [...dlg.querySelectorAll('.chan-flow-note')].map((x) => x.textContent).find((x) => /也会移除这些通知/.test(x)) || null;
  [...dlg.querySelectorAll('button')].find((b) => b.textContent.trim() === '保存').click();
  for (let i = 0; i < 50 && document.getElementById('chan-access-dialog'); i++) await sleep(100);
  return { note, closed: !document.getElementById('chan-access-dialog') };
})()`);
ok(drop.closed && drop.note && /Xi/.test(drop.note), 'removing Xi\'s access says BEFORE saving that its notification goes too', JSON.stringify(drop));
const acc3 = ((await api('GET', '/api/channels')).json.adapters || []).find((x) => x.id === 'fake-poll').accountGrain;
ok(acc3 && acc3.access.length === 1 && acc3.access[0].principal.name === '工作' && acc3.watchers.length === 0, 'the wire: Xi\'s access AND its notification are gone in one write; 工作 keeps its access', JSON.stringify(acc3));
// (merge of R3 + R4, 2.369.191) R3's r2 checks run AFTER R4's ⑤: the account now holds 工作's ACCESS
// row only (Xi's access + notification were just removed) — the same "handed over at the account
// grain, nothing delivered" state D4 is about.
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

// ── ⑦ THE OWNER'S SAVE (hotfix 2026-09-26) through NOTIFY…, clamped VISIBLY ──
// The owner's screenshot: 组 · 工作, 匹配过滤器的消息 (two 时间窗口 rules), 每个窗口一份摘要
// (窗口 9999), 每天最多唤醒次数 9999 ⇒ 保存 answered 请求被拒绝: mode 'filtered' needs a
// filterId, and the 9999s were SILENTLY held to 1440 / 1000. Now 工作 has access (⑤), the
// Notify dialog says "已保持在最大值 1440 / 1000" BEFORE saving, and the save lands.
const OWNER_NOTIFY = (edit, construct = false) => `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelector('.rail-panel-channels .chan-sec[data-adapter="fake-poll"] .chan-sec-more').click(); await sleep(200);
  [...document.querySelectorAll('.context-menu .context-menu-item')].find((x) => x.textContent.trim() === '通知…').click();
  for (let i = 0; i < 300 && !document.querySelector('#chan-notify-dialog .chan-watch-row'); i++) await sleep(100);   // a deadline for a dialog that never opens (it re-reads the grain first)
  const dlg = document.getElementById('chan-notify-dialog');
  if (!dlg) return { fail: 'Notify… did not open' };
  const row = dlg.querySelector('.chan-watch-row');
  const sels = row.querySelectorAll('select.chan-opt-input');
  const rules = () => [...row.querySelectorAll('.chan-af-rules .chan-af-rule')];
  let prefill = null, clamps = null;
  if (${edit}) {
    prefill = { who: sels[0].selectedOptions[0].textContent, mode: sels[1].value, notify: sels[2].value, rules: rules().map((r) => [...r.querySelectorAll('input')].map((i) => i.value)), nums: [...row.querySelectorAll('input[type=number]')].map((i) => i.value) };
  } else {
    if (sels[0].selectedOptions[0].textContent !== '组 · 工作') return { fail: 'the only principal with access is not preselected', who: sels[0].selectedOptions[0].textContent };
    sels[1].value = 'filtered'; sels[1].dispatchEvent(new Event('change'));
    const add = [...row.querySelectorAll('button')].find((b) => b.textContent.trim() === '添加规则');
    const windows = [['09:00', '12:00'], ['14:00', '18:00']];
    for (let k = 0; k < windows.length; k++) {
      add.click(); await sleep(50);
      const r = rules()[k];
      const ks = r.querySelector('select'); ks.value = 'time-window'; ks.dispatchEvent(new Event('change')); await sleep(50);
      const ins = rules()[k].querySelectorAll('input');
      ins[0].value = windows[k][0]; ins[0].dispatchEvent(new Event('input'));
      ins[1].value = windows[k][1]; ins[1].dispatchEvent(new Event('input'));
    }
    sels[2].value = 'digest'; sels[2].dispatchEvent(new Event('change'));
    const nums = [...row.querySelectorAll('input[type=number]')];
    nums[0].value = '9999'; nums[0].dispatchEvent(new Event('input'));
    nums[1].value = '9999'; nums[1].dispatchEvent(new Event('input'));
    await sleep(100);
    clamps = [...row.querySelectorAll('.chan-flow-note[data-clamp]')].filter((x) => x.style.display !== 'none').map((x) => x.textContent);
  }
  for (let i = 0; i < 40; i++) { const st = row.querySelector('.chan-af-stat'); if (st && !/估算中|估计中|Estimating/.test(st.textContent)) break; await sleep(150); }
  ${TOAST_LOG}
  // THE RUNNER'S ORDER, CONSTRUCTED (attempt 2): an older toast is on the stack when the save starts and LEAVES
  // before the save's toast arrives (its 3 s expiry on a slow box); the pre-fix judge's arithmetic — count
  // before, slice after — runs beside the arrival log on the same save
  let old = null;
  if (${construct}) {
    let stack = document.getElementById('global-toasts');
    if (!stack) { stack = document.createElement('div'); stack.id = 'global-toasts'; document.body.appendChild(stack); }
    const older = document.createElement('div'); older.className = 'global-toast global-toast-info'; older.textContent = 'an older toast';
    stack.appendChild(older);
    await new Promise((r) => setTimeout(r, 0));   // the observer's record of it lands BEFORE the save's mark
    old = { before: document.querySelectorAll('#global-toasts .global-toast').length, older };
  }
  const saveBtn = [...dlg.querySelectorAll('button')].find((b) => b.textContent.trim() === '保存');
  const judged = (${SAVE_OUTCOME('chan-notify-dialog')})(saveBtn);
  if (old) old.older.remove();   // it expires while the save is in flight
  const { closed, toasts, ms } = await judged;
  const preFix = old ? [...document.querySelectorAll('#global-toasts .global-toast')].slice(old.before).map((x) => ({ error: x.classList.contains('global-toast-error'), text: x.textContent })) : null;
  if (!closed) document.getElementById('chan-notify-dialog').remove();
  return { prefill, clamps, closed, toasts, ms, preFix };
})()`;
const own = await p1.evaljs(OWNER_NOTIFY(false, true));
ok(!own.fail && Array.isArray(own.clamps) && own.clamps.includes('已保持在最大值 1440') && own.clamps.includes('已保持在最大值 1000'), 'the owner\'s 9999s are CLAMPED VISIBLY before saving: "已保持在最大值 1440" under the window, "已保持在最大值 1000" under the cap', JSON.stringify(own));
ok(own.closed && !(own.toasts || []).some((x) => x.error) && (own.toasts || []).some((x) => /通知已保存/.test(x.text) && /超出范围的数字已保持在上下限/.test(x.text)) && !(own.toasts || []).some((x) => /filterId|mode 'filtered'/.test(x.text)), `the save closes with no error toast — "通知已保存 … 超出范围的数字已保持在上下限" — and nothing says \`mode 'filtered' needs a filterId\` (judged by the toast's ARRIVAL, ${own.ms} ms after the click, while an older toast left the stack)`, JSON.stringify(own.toasts));
ok(Array.isArray(own.preFix) && own.preFix.length === 0 && (own.toasts || []).length > 0, 'CONTROL (the runner\'s attempt 2, constructed): on the SAME save the pre-fix judge — count the stack before the click, slice it after — reads `[]`, the runner\'s exact value, because the older toast left meanwhile; the arrival log holds the save\'s toast', JSON.stringify({ preFix: own.preFix, arrived: own.toasts }));
const line = await p1.evaljs(`(async () => {
  for (let i = 0; i < 60; i++) { const l = document.querySelector('.rail-panel-channels .chan-sec[data-adapter="fake-poll"] .chan-grain-line[data-grain="account"]'); if (l && /1440/.test(l.textContent)) return l.textContent; await new Promise((r) => setTimeout(r, 200)); }
  return null;
})()`);
ok(line === '访问：组 · 工作（起草） · 通知：组 · 工作 每 1440 分钟一份摘要 按过滤器', `the account card's line reads "${line}"`, line);
const acctW = ((((await api('GET', '/api/channels')).json.adapters || []).find((x) => x.id === 'fake-poll') || {}).accountGrain || { watchers: [] }).watchers[0] || {};
ok(acctW.mode === 'filtered' && acctW.filterId === `f-account-fake-poll|group:${GID}` && acctW.filter && acctW.filter.rules.map((r) => `${r.from}-${r.to}`).join() === '09:00-12:00,14:00-18:00' && acctW.principal.name === '工作' && acctW.notify === 'digest' && acctW.digestMinutes === 1440 && acctW.dailyWakeCap === 1000, 'the wire holds the watcher: 工作, filtered by f-account-fake-poll|group:<id> (09:00-12:00, 14:00-18:00), digest 1440, cap 1000', JSON.stringify(acctW));
const again = await p1.evaljs(OWNER_NOTIFY(true));
ok(!again.fail && again.prefill && again.prefill.who === '组 · 工作' && again.prefill.mode === 'filtered' && again.prefill.notify === 'digest' && JSON.stringify(again.prefill.rules) === JSON.stringify([['09:00', '12:00'], ['14:00', '18:00']]) && JSON.stringify(again.prefill.nums) === JSON.stringify(['1440', '1000']), 're-opening 通知… prefills 组 · 工作 with the two saved windows and the numbers AS STORED (1440, 1000)', JSON.stringify(again));
ok(again.closed && !(again.toasts || []).some((x) => x.error), 'saving the edit (the filter re-sent inline) closes with no error toast', JSON.stringify(again.toasts));

// ── ⑧ mirror-193: a list that changes WHILE the dialog is open is never written over ──
// The dialog now draws the server's lists — but it stays open while the user edits, and its Save is still the
// grain's WHOLE list. It sends the STAMP of what it drew (`base`); a grain that moved since is refused
// `grain-changed` (nothing written), the toast says so and the dialog re-opens on the lists as they are now.
const WORK_P = { kind: 'group', id: GID, name: '工作' }, YU = { kind: 'agent', id: 'agent-yu', name: 'Yu' }, ZED = { kind: 'agent', id: 'agent-zed', name: 'Zed' };
const accessNames = async () => ((((await api('GET', '/api/channels')).json.adapters || []).find((x) => x.id === 'fake-poll') || {}).accountGrain || { access: [] }).access.map((r) => r.principal.name).sort().join();
const OPEN_ROWS = `(async () => {
  for (let i = 0; i < 300 && !document.querySelector('#chan-access-dialog .chan-access-row'); i++) await new Promise((r) => setTimeout(r, 100));
  const dlg = document.getElementById('chan-access-dialog');
  if (!dlg) return { fail: 'Grant access… did not open' };
  return { rows: [...dlg.querySelectorAll('.chan-access-row')].map((r) => r.querySelector('select').selectedOptions[0].textContent), readFresh: (window.__vsFetchLog || []).filter((u) => /\\/api\\/channels\\/adapters\\/fake-poll\\/view$/.test(u)).length };
})()`;
const SAVE_OPEN = `(async () => {
  ${TOAST_LOG}
  const dlg = document.getElementById('chan-access-dialog');
  const out = await (${SAVE_OUTCOME('chan-access-dialog')})([...dlg.querySelectorAll('button')].find((b) => b.textContent.trim() === '保存'));
  // a refusal re-opens the dialog on the lists as they are now: wait for a dialog that is NOT the one saved
  let rows = null;
  for (let i = 0; i < 300; i++) { const d = document.getElementById('chan-access-dialog'); if (d && d !== dlg && d.querySelector('.chan-access-row')) { rows = [...d.querySelectorAll('.chan-access-row')].map((r) => r.querySelector('select').selectedOptions[0].textContent); break; } await new Promise((r) => setTimeout(r, 100)); }
  const d2 = document.getElementById('chan-access-dialog');
  if (d2) { const cancel = [...d2.querySelectorAll('button')].find((b) => b.textContent.trim() === '取消'); if (cancel) cancel.click(); else d2.remove(); }
  return { ...out, reopened: rows };
})()`;
const m8 = await p1.evaljs(MENU('授权访问…'));
const o8 = m8.fail ? m8 : await p1.evaljs(OPEN_ROWS);
ok(!o8.fail && o8.rows.length === 1 && o8.rows[0] === '组 · 工作', 'FIXTURE: 授权访问… is open on the account\'s one access row (组 · 工作)', JSON.stringify(o8));
const g8 = await api('PUT', '/api/channels/adapters/fake-poll/access', { access: [{ principal: WORK_P, authority: 'draft' }, { principal: YU, authority: 'draft' }] });
ok(g8.status === 200 && (await accessNames()) === 'Yu,工作', 'WHILE IT IS OPEN, Yu is granted through the route (another window, an agent\'s approved request)', JSON.stringify(g8.json).slice(0, 200));
const s8 = await p1.evaljs(SAVE_OPEN);
ok(s8.toasts.some((x) => x.error && /在对话框打开期间被改动/.test(x.text)) && !s8.toasts.some((x) => /访问权限已保存/.test(x.text)), `Save (the dialog's list [工作], drawn before Yu) is REFUSED by name — the toast says the list changed while the dialog was open and nothing was saved (${s8.ms} ms)`, JSON.stringify(s8));
ok(Array.isArray(s8.reopened) && s8.reopened.some((x) => /Yu/.test(x)) && s8.reopened.some((x) => x === '组 · 工作'), `…and the dialog RE-OPENS on the lists as they are now (${JSON.stringify(s8.reopened)})`, JSON.stringify(s8.reopened));
ok((await accessNames()) === 'Yu,工作', 'the wire: Yu KEPT its access — the stale whole list was never written', await accessNames());

// ── ⑨ mirror-193: ONE CONVERSATION WINDOW, ONE COPY OF ITS MESSAGES ──
// Found by the emulated slow runner (1 CPU beside two busy loops: the picture legs red 5 of 14 pre-fix, 3 of 10 with
// the ⑤/⑦ fixes): the window drew its messages TWICE or THREE TIMES — the open's render, the broadcast the watch
// beat's fetch sends and the one the open's mark-read sends each cleared the list, awaited its page and appended it;
// a picture leg's selector found the stale copy's lazy <img>, which never loaded. CONSTRUCTED here on every machine:
// the window's page answers are HELD (the open's 900 ms, the two broadcast renders' 300 ms) and two broadcasts
// naming the conversation arrive while the open's page is in flight; judged once every page PARSED (a render applies
// or drops its page in the microtasks after the parse): the window shows each record of the page ONCE.
const RACE = (conv) => `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const MSG = '/api/channels/fake-poll/' + encodeURIComponent(${JSON.stringify(conv)}) + '/messages?';
  const OUTBOX = '/api/channels/outbox?conv=' + encodeURIComponent('fake-poll/' + ${JSON.stringify(conv)});
  const f0 = window.fetch;
  const BAR = '/api/channels/fake-poll/' + encodeURIComponent(${JSON.stringify(conv)});
  const seen = { started: 0, done: 0, parsed: 0, bars: 0, barsParsed: 0, url: null };
  // A RENDER'S FATE IS DECIDED RIGHT AFTER ITS BAR PARSES (a superseded one returns there, the newest starts its
  // page in the same microtasks) — so once every bar parsed, \`started\` counts every page there will be
  const counted = (x, key) => { const j0 = x.json.bind(x); x.json = async () => { const v = await j0(); seen[key]++; return v; }; return x; };
  window.fetch = function (u, ...r) {
    const s = String((u && u.url) || u);
    const p = f0.call(this, u, ...r);
    if (s === BAR) { seen.bars++; return p.then((x) => counted(x, 'barsParsed')); }
    if (!s.includes(MSG)) return p;
    seen.started++; seen.url = s;
    const hold = seen.started === 1 ? 900 : 300;   // the open's page answers LAST
    // the render applies (or drops) its page in the microtasks right after the body parses — so once every page
    // PARSED, the next macrotask sees every apply that will ever happen
    return p.then((x) => new Promise((res) => setTimeout(() => { seen.done++; res(counted(x, 'parsed')); }, hold)));
  };
  // the server's OWN broadcasts (the open's mark-read, the watch beat) are HELD until the sample: exactly the two
  // constructed ones start renders, so "every page parsed" is a fact about every render there will be
  const sock = window.app.ws.ws, orig = sock.onmessage, held = [];
  sock.onmessage = (e) => { let ty = null; try { ty = JSON.parse(e.data).type; } catch {} if (ty === 'channels-updated') { held.push(e); return; } orig.call(sock, e); };
  let w = null, shown = -1;
  try {
    w = window.app.openChannel('fake-poll', ${JSON.stringify(conv)});
    for (let i = 0; i < 1500 && seen.started < 1; i++) await sleep(20);
    const msg = JSON.stringify({ type: 'channels-updated', partial: true, changedKeys: ['fake-poll/' + ${JSON.stringify(conv)}], changed: [${JSON.stringify(conv)}], digest: null });
    for (let k = 0; k < 2; k++) { orig.call(sock, { data: msg }); await sleep(30); }
    for (let i = 0; i < 600 && !(seen.bars >= 3 && seen.barsParsed === seen.bars && seen.started >= 1 && seen.parsed === seen.started); i++) await sleep(50);
    shown = w ? w.content.querySelectorAll('.chanwin-list .chanmsg').length : -1;
  } finally { window.fetch = f0; sock.onmessage = orig; for (const e of held) orig.call(sock, e); }
  const page = seen.url ? ((await (await f0(seen.url)).json()).records || []).length : -1;
  if (w) window.app.wm.closeWindow(w.id);
  return { ...seen, shown, page };
})()`;
// ⑨b the REPAINT of an open window (a broadcast naming it) while it is scrolled away from the top: the render's
// clear drops scrollTop to 0 and the scroll handler asks for the page ABOVE the boundary the clear just reset — the
// tail page again, prepended beside the render's own. Constructed: the window open and settled at its bottom, one
// broadcast; judged once its page (and any upward page) parsed.
const REPAINT = (conv) => `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const MSG = '/api/channels/fake-poll/' + encodeURIComponent(${JSON.stringify(conv)}) + '/messages?';
  const w = window.app.openChannel('fake-poll', ${JSON.stringify(conv)});
  const list = () => w.content.querySelector('.chanwin-list');
  for (let i = 0; i < 600 && !(list() && list().querySelectorAll('.chanmsg').length); i++) await sleep(50);
  const before = list().querySelectorAll('.chanmsg').length;
  list().scrollTop = list().scrollHeight;
  await sleep(100);
  const f0 = window.fetch;
  const seen = { started: 0, parsed: 0, urls: [], visible: document.visibilityState };
  window.fetch = function (u, ...r) {
    const s = String((u && u.url) || u);
    const p = f0.call(this, u, ...r);
    if (!s.includes(MSG)) return p;
    seen.started++; seen.urls.push(s.slice(s.indexOf('?')));
    return p.then((x) => new Promise((res) => setTimeout(() => { const j0 = x.json.bind(x); x.json = async () => { const v = await j0(); seen.parsed++; return v; }; res(x); }, 300)));
  };
  const sock = window.app.ws.ws, orig = sock.onmessage, held = [];
  sock.onmessage = (e) => { let ty = null; try { ty = JSON.parse(e.data).type; } catch {} if (ty === 'channels-updated') { held.push(e); return; } orig.call(sock, e); };
  let after = -1;
  try {
    orig.call(sock, { data: JSON.stringify({ type: 'channels-updated', partial: true, changedKeys: ['fake-poll/' + ${JSON.stringify(conv)}], changed: [${JSON.stringify(conv)}], digest: null }) });
    // the render's CLEAR (its page still held) drops scrollTop to 0; the scroll event a visible page dispatches for
    // it at its next frame is dispatched here explicitly (a background page runs no frames) — that is the event
    for (let i = 0; i < 600 && list().querySelectorAll('.chanmsg').length; i++) await sleep(20);
    seen.cleared = list().querySelectorAll('.chanmsg').length === 0;
    seen.scrollTop = list().scrollTop;
    list().dispatchEvent(new Event('scroll'));
    for (let i = 0; i < 600 && !(seen.started >= 1 && seen.parsed === seen.started); i++) await sleep(50);
    after = list().querySelectorAll('.chanmsg').length;
  } finally { window.fetch = f0; sock.onmessage = orig; for (const e of held) orig.call(sock, e); }
  window.app.wm.closeWindow(w.id);
  return { ...seen, before, after };
})()`;
const baseRooms = ((await api('GET', '/api/channels')).json.conversations || []).filter((c) => c.adapterId === 'fake-poll' && !/^fake-poll-room-\d+$/.test(c.id)).map((c) => c.id).sort();
ok(baseRooms.length >= 2, `FIXTURE: two base rooms no window has opened yet (${baseRooms.join(', ')})`, JSON.stringify(baseRooms));
const race = await p1.evaljs(RACE(baseRooms[0]));
const rp = await p1.evaljs(REPAINT(baseRooms[0]));
ok(rp.before > 0 && rp.cleared && rp.parsed === rp.started && rp.after === rp.before, `ONE LIST, ONE WRITER (⑨b): a broadcast repainting an open window (its clear dropping scrollTop to 0 and that scroll event dispatched) draws its ${rp.before} message(s) once (${rp.after} drawn; pages read: ${rp.urls.join(' ')})`, JSON.stringify(rp));
ok(race.bars >= 3 && race.barsParsed === race.bars && race.parsed === race.started && race.page > 0 && race.shown === race.page, `ONE LIST, ONE WRITER: three renders in flight together (the open's page answering last; ${race.started} of them fetched a page) — the window shows the page's ${race.page} record(s) ONCE (${race.shown} drawn)`, JSON.stringify(race));

// ── ⑧ CONTROL: the PRE-FIX DIALOG (it draws the panel's copy) rebuilt into the scratch bundle ──
// Under the same construction (page 1 holds its channels-updated frames, the grain moves through the route) the
// pre-fix dialog DRAWS the stale list — the construction reaches the runner's mechanism — and its Save is still
// refused by the server's stamp check alone: the wire keeps the newcomer.
{
  const MOD = path.join(wt, 'src/lib/channel-filter-editor.js');
  const src = fs.readFileSync(MOD, 'utf8');
  const FRESH = "  const fresh = await fetchJson(`/api/channels/adapters/${encodeURIComponent(target.adapter.id)}/view`);\n  if (!fresh || fresh.error || !fresh.adapter) { showToast(routeErrorText(fresh), { type: 'error' }); return null; }\n  const a = fresh.adapter;\n";
  ok(src.split(FRESH).length === 2, 'CONTROL setup: the fresh read is spelled once where the control reverts it to the panel copy');
  fs.writeFileSync(MOD, src.replace(FRESH, '  const a = target.adapter;\n'));
  // ⑨'s guard reverted in the SAME control bundle: a page is applied whichever render fetched it
  const WMOD = path.join(wt, 'src/lib/channel-window.js');
  const wsrc = fs.readFileSync(WMOD, 'utf8');
  const GUARD = '    if (!pageFor(gen)) return 0;   // a newer render owns the list now — this page is not applied\n';
  ok(wsrc.split(GUARD).length === 2, 'CONTROL setup: the window\'s page guard is spelled once where the control removes it');
  const READY = '    if (list.scrollTop > 4 || upInFlight || !listReady) return;\n';
  ok(wsrc.split(READY).length === 2, 'CONTROL setup: the window\'s list-ready guard is spelled once where the control removes it');
  fs.writeFileSync(WMOD, wsrc.replace(GUARD, '').replace(READY, '    if (list.scrollTop > 4) return;\n'));
  execSync('npx esbuild src/client.js --bundle --outfile=public/bundle.js --format=iife --platform=browser --target=es2020 --loader:.css=css', { cwd: wt, stdio: 'ignore' });
  ok(await p1.reload(), 'CONTROL: page 1 reloaded on the pre-fix bundle');
  const cp = await p1.evaljs(PANEL);
  ok(cp.ok, 'CONTROL: the panel renders on the pre-fix bundle', JSON.stringify(cp).slice(0, 200));
  ok((await p1.evaljs(HOLD(true))).held === true, 'CONTROL: page 1 holds its channels-updated frames');
  const gz = await api('PUT', '/api/channels/adapters/fake-poll/access', { access: [{ principal: WORK_P, authority: 'draft' }, { principal: YU, authority: 'draft' }, { principal: ZED, authority: 'draft' }] });
  ok(gz.status === 200 && (await accessNames()) === 'Yu,Zed,工作', 'CONTROL: Zed is granted through the route while the page\'s copy cannot hear of it');
  const mc = await p1.evaljs(MENU('授权访问…'));
  const oc = mc.fail ? mc : await p1.evaljs(OPEN_ROWS);
  ok(!oc.fail && oc.readFresh === 0 && oc.rows.length === 2 && !oc.rows.some((x) => /Zed/.test(x)), `CONTROL: the pre-fix dialog DRAWS THE STALE LIST (${JSON.stringify(oc.rows)}, no fresh read) — the runner's attempt-1 mechanism, reached by the construction; the fixed leg above would go red`, JSON.stringify(oc));
  const sc = await p1.evaljs(SAVE_OPEN);
  ok(sc.toasts.some((x) => x.error && /在对话框打开期间被改动/.test(x.text)) && (await accessNames()) === 'Yu,Zed,工作', 'CONTROL: …and its stale Save is refused by the server\'s stamp check alone — Zed kept (the second half of the fix holds without the first)', JSON.stringify({ toasts: sc.toasts, wire: await accessNames() }));
  await p1.evaljs(HOLD(false));
  const rpc = await p1.evaljs(REPAINT(baseRooms[1]));
  ok(rpc.before > 0 && rpc.cleared && rpc.after > rpc.before, `CONTROL (⑨b): without the ready guard the repaint's clear asks for the page above a reset boundary — the tail again — and the window draws ${rpc.after} for ${rpc.before} (pages read: ${rpc.urls.join(' ')})`, JSON.stringify(rpc));
  const rc = await p1.evaljs(RACE(baseRooms[1]));
  ok(rc.bars >= 3 && rc.started >= 2 && rc.parsed === rc.started && rc.page > 0 && rc.shown >= 2 * rc.page, `CONTROL (⑨): without the page guard the same three renders draw the page ${Math.round(rc.shown / Math.max(1, rc.page) * 10) / 10}× (${rc.shown} for ${rc.page}) — the slow runner's duplicate list; the leg above would go red`, JSON.stringify(rc));
}

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
