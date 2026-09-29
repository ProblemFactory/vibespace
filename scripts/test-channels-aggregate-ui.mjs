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
//     re-opens on it; ⑨/⑨b the conversation window's list has ONE writer (three writers in flight; a rebuild's
//     clear and its scroll event), constructed and judged once every bar and page parsed; CONTROL = one scratch
//     bundle with the client fixes reverted (the .195 merge: the dialog's fresh read, the window's SERIAL QUEUE made
//     "run now", the paging verdict's ready rule + scroll-evidence clauses removed). A page throw names its line.
//   ⑦b (channel-polish verify round 2): a stored digest's own daily cap is a field a person can type into
//   ②b R3 (2026-09-26, "lark图像不能预览吗？"): a LARK-SHAPED picture (`image/*`, no name, text "[image]")
//     is drawn IN PLACE of its "[image]" line (§25: the words never drawn); a click opens the shared overlay; a picture the vendor
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

// ── ⑩ (lane channel-rich D2): THE BEACON — a local http server every HOSTILE mail in the fake world's mail room
//    tries to reach (script, onerror, meta refresh, base, form, iframe, CSS url()/@import/image-set, srcset, an http
//    tracker picture, …). It must NEVER be hit: before Show pictures, after it, ever.
const http = require('node:http');
const BEACON_PORT = await freePort();
const beaconHits = [];
const beacon = http.createServer((req, res) => { beaconHits.push(`${req.method} ${req.url}`); res.writeHead(204); res.end(); });
// security verify r2 (continued): TCP CONNECTIONS are counted too — a preconnect / dns-prefetch-style leak opens a socket
// and sends no request, which a request log never sees (process-independent: an out-of-process sandboxed frame included)
let beaconConns = 0;
beacon.on('connection', () => { beaconConns++; });
await new Promise((r) => beacon.listen(BEACON_PORT, '127.0.0.1', r));
const BEACON = `http://127.0.0.1:${BEACON_PORT}`;
// ── ⑩x (security verify r2, 2026-09-28): THE ATTACK CORPUS (scripts/mail-attack-corpus.mjs) in its own room through the
//    fake adapter's VIBESPACE_CHANNELS_FAKE_MAIL_DIR seam, an HTTPS beacon beside the http one (a self-signed cert;
//    chrome ignores certificate errors for it) — every hit is recorded with its referer + cookie, attributed by path
const https = require('node:https');
const BEACON_TLS_PORT = await freePort();
const tlsHits = [];
const tlsDir = scratch('chan-agg-ui-tls');
fs.mkdirSync(tlsDir, { recursive: true });
let BEACON_S = null, beaconTls = null;
try {
  execSync(`openssl req -x509 -newkey rsa:2048 -nodes -keyout ${tlsDir}/key.pem -out ${tlsDir}/cert.pem -days 2 -subj "/CN=127.0.0.1"`, { stdio: 'ignore' });
  beaconTls = https.createServer({ key: fs.readFileSync(`${tlsDir}/key.pem`), cert: fs.readFileSync(`${tlsDir}/cert.pem`) }, (req, res) => { tlsHits.push({ url: req.url, ref: req.headers.referer || null, cookie: req.headers.cookie || null }); res.writeHead(204); res.end(); });
  await new Promise((r) => beaconTls.listen(BEACON_TLS_PORT, '127.0.0.1', r));
  BEACON_S = `https://127.0.0.1:${BEACON_TLS_PORT}`;
} catch { BEACON_S = null; }
const { mailAttackCorpus } = await import('./mail-attack-corpus.mjs');
const CORPUS = mailAttackCorpus(BEACON, BEACON_S || BEACON);
const corpusDir = scratch('chan-agg-ui-corpus');
fs.mkdirSync(corpusDir, { recursive: true });
for (const c of CORPUS) fs.writeFileSync(path.join(corpusDir, `${c.name}.html`), c.html);
const MAIL_N = 30;

let srv = null;
const bootServer = () => spawn(process.execPath, ['server.js'], {
  cwd: wt, stdio: 'ignore',
  // lane channel-rich: the fake PUSH account also carries the mail room (30 HTML mails + a pictures mail + a hostile
  // mail + a plain one + a bot's line) — on the push fake, so the poll fake's five rooms stay every other leg's fixture
  env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', VIBESPACE_CHANNELS_FAKE: '1', VIBESPACE_CHANNELS_FAKE_CONVS: '3', VIBESPACE_CHANNELS_FAKE_MAIL: String(MAIL_N), VIBESPACE_CHANNELS_FAKE_BEACON: BEACON, VIBESPACE_CHANNELS_FAKE_MAIL_DIR: corpusDir },
});
srv = bootServer();
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu',
  '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1400,1000', '--disable-background-timer-throttling', '--ignore-certificate-errors',
  `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => {
  try { beacon.close(); } catch {}
  try { beaconTls && beaconTls.close(); } catch {}
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv && srv.kill('SIGKILL'); } catch {}
  // the fixture's dtach master + stub CLI are THIS suite's processes — ended by evidence (their argv names this scratch tree)
  if (HAVE_DTACH) { try { execFileSync('pkill', ['-KILL', '-f', STUB], { stdio: 'ignore' }); } catch {} try { execFileSync('pkill', ['-KILL', '-f', SOCK_DIR], { stdio: 'ignore' }); } catch {} }
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  for (const d of [chromeDir, fakeHome, tlsDir, corpusDir]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
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
    // a picture is loaded LAZILY (img.loading = 'lazy'): one above the fold loads when it scrolls into view —
    // since channel-polish's taller IM rows the room's first picture sits above the opening scroll (the list
    // opens at its newest message), so the reader scrolls it into view, as a person would
    for (const im of imgs) if (!im.complete) im.scrollIntoView({ block: 'nearest' });
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
    const out = { drawn: img.dataset.drawn === '1', w: img.naturalWidth, src: img.getAttribute('src'), bodyText: body.textContent, inBody: body.contains(img), alt: img.alt };
    img.click();
    await new Promise((r) => setTimeout(r, 100));
    const ov = document.querySelector('.chat-img-overlay img');
    out.overlay = ov ? ov.getAttribute('src') : null;
    if (ov) ov.parentElement.click();
    out.overlayGone = !document.querySelector('.chat-img-overlay');
    return out;
  })()`);
  ok(!lark1.fail && lark1.drawn && lark1.w === 8 && /\/attachment\/fake-poll-room-1-img0\?msg=[^&]+&inline=1$/.test(lark1.src), 'a LARK-SHAPED picture (`image/*`, no name) is DRAWN — fetched on demand through OUR route and decoded', JSON.stringify(lark1));
  // §25 (2026-09-27): the record's tree draws the picture IN PLACE of its placeholder — the "[image]" words never reach the body at all
  ok(lark1.bodyText === '' && lark1.inBody, '…IN the message body, in place of its "[image]" line — the words never drawn (the record keeps them for agents and search)', JSON.stringify(lark1));
  ok(lark1.alt === '图片', 'the picture is named in the device\'s language (图片), never the adapter\'s English', lark1.alt);
  ok(!!lark1.overlay && lark1.overlay.endsWith(lark1.src) && lark1.overlayGone, 'a click opens THE shared image overlay on the same route (and a click closes it)', JSON.stringify(lark1));
  const refused = await p1.evaljs(`(async () => {
    const w = window.app.openChannel('fake-poll', 'fake-poll-room-2');
    for (let i = 0; i < 80; i++) {
      const gone = w.content.querySelector('.chanmsg-att-failed[data-channel-image="fake-poll-room-2-gone"]');
      const flaky = w.content.querySelector('img.chanmsg-thumb[data-channel-image="fake-poll-room-2-flaky"]');
      if (gone && flaky && flaky.dataset.drawn === '1') {
        const row = flaky.closest('.chanmsg');
        return { gone: { text: gone.textContent, title: gone.title, why: gone.querySelector('.chanmsg-att-why').textContent, retry: !!gone.querySelector('[data-channel-retry]'), refused: gone.dataset.refused }, flaky: { w: flaky.naturalWidth, src: flaky.getAttribute('src') }, body: row.querySelector('.chanmsg-body').textContent, chipInBody: row.querySelector('.chanmsg-body').contains(gone), sawWait: !!window.__sawWait };
      }
      if (w.content.querySelector('.chanmsg-att-wait')) window.__sawWait = w.content.querySelector('.chanmsg-att-wait').textContent;
      await new Promise((r) => setTimeout(r, 250));
    }
    return { fail: 'the refused / retried pictures never settled', html: [...w.content.querySelectorAll('.chanmsg-atts')].map((x) => x.textContent).join(' | ') };
  })()`);
  ok(!refused.fail && refused.flaky.w === 8 && /&n=1$/.test(refused.flaky.src), 'a picture the vendor RATE-LIMITED once waits the vendor\'s time and draws on its own retry (`&n=1`)', JSON.stringify(refused));
  ok(!refused.fail && refused.gone.refused === 'forbidden' && refused.gone.why === '被禁止' && refused.gone.retry && /图片加载失败/.test(refused.gone.title) && /图片/.test(refused.gone.text), 'a picture the vendor REFUSES is the chip that NAMES the reason in zh (图片 · 被禁止, the sentence in its title) with a Retry — never a bare "image ⬇"', JSON.stringify(refused.gone));
  ok(!refused.fail && !/\[image\]/.test(refused.body) && refused.chipInBody, '…standing IN the body where the picture would be — no "[image]" words left over (§25)', JSON.stringify([refused.body, refused.chipInBody]));
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
  for (let k = 0; k < 6; k++) { list.scrollTop = 0; list.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true })); await new Promise((r) => setTimeout(r, 500)); }   // the person's wheel up at the top (round 3: a bare scroll event is displacement)
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
  const sub = dlg.querySelector('.chan-dialog-sub') ? dlg.querySelector('.chan-dialog-sub').textContent : null;
  // channel-polish (2026-09-27): who = the ONE principal picker; a pick adds the principal's authority row
  const before = [...dlg.querySelectorAll('.chan-access-row .chan-access-who')].map((r) => r.textContent);
  // the evidence the construction held and the dialog read the server (mirror-193): the panel's copy has no Xi,
  // the dialog fetched the account's fresh view
  const panelLine = ${PANEL_LINE};
  const readFresh = (window.__vsFetchLog || []).some((u) => /\\/api\\/channels\\/adapters\\/fake-poll\\/view$/.test(u));
  for (let i = 0; i < 40 && !dlg.querySelector('.chan-access-pick .pp-row'); i++) await sleep(100);
  const opt = [...dlg.querySelectorAll('.chan-access-pick .pp-row')].find((o) => o.querySelector('.pp-name') && o.querySelector('.pp-name').textContent === '工作');
  if (!opt) return { fail: 'the group 工作 is not offered by the picker', opts: [...dlg.querySelectorAll('.chan-access-pick .pp-row')].map((o) => o.textContent) };
  opt.click(); await sleep(50);
  ${TOAST_LOG}
  const out = await (${SAVE_OUTCOME('chan-access-dialog')})([...dlg.querySelectorAll('button')].find((b) => b.textContent.trim() === '保存'));
  return { title, sub, before, panelLine, readFresh, ...out };
})()`);
const released = await p1.evaljs(HOLD(false));
ok(!grant.fail && !/Xi/.test(grant.panelLine) && released.released > 0, `CONSTRUCTION held: when the dialog opened, page 1's panel copy had not heard of Xi (its account line: "${grant.panelLine}"; ${released.released} held frame(s) released after)`, JSON.stringify({ panelLine: grant.panelLine, released }));
ok(!grant.fail && grant.title === '谁可以在这里阅读和操作？' && /^整个账号 —— /.test(grant.sub || '') && grant.before.length === 1 && /Xi/.test(grant.before[0]) && grant.readFresh, '授权访问… asks "谁可以在这里阅读和操作？" over "整个账号 —— …" (channel-polish: plain words) with the account\'s access rows as the SERVER holds them (Xi, kept though not live) — read fresh (GET …/adapters/fake-poll/view), never from the stale panel copy (mirror-193)', JSON.stringify(grant));
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
  // channel-polish: who = the compact principal picker (its list in a popover)
  row.querySelector('.chan-watch-who .pp-trigger').click(); await sleep(100);
  const picker = [...document.querySelectorAll('.pp-pop .pp-row .pp-name')].map((o) => o.textContent);
  const addNote = [...dlg.querySelectorAll('button')].find((b) => b.textContent.trim() === '添加通知');
  [...document.querySelectorAll('.pp-pop .pp-row')].find((o) => /Xi/.test(o.textContent)).click(); await sleep(50);
  row.querySelector('input[type=radio][value=rule]').click(); await sleep(50);   // ② "只有符合规则的消息…"
  [...row.querySelectorAll('button')].find((b) => b.textContent.trim() === '添加规则').click(); await sleep(50);
  const inp = row.querySelector('.chan-af-rule input'); inp.value = 'deploy'; inp.dispatchEvent(new Event('input'));
  for (let i = 0; i < 40; i++) { const st = row.querySelector('.chan-af-stat'); if (st && !/估算中|估计中|Estimating/.test(st.textContent)) break; await sleep(150); }
  const estimate = row.querySelector('.chan-af-stat').textContent;
  const total = dlg.querySelector('.chan-watch-total') ? dlg.querySelector('.chan-watch-total').textContent : null;
  ${TOAST_LOG}
  const out = await (${SAVE_OUTCOME('chan-notify-dialog')})([...dlg.querySelectorAll('button')].find((b) => b.textContent.trim() === '保存'));
  return { picker, canAdd: !!addNote && addNote.style.display !== 'none', estimate, total, ...out };
})()`);
ok(!notify.fail && notify.picker.length === 2 && notify.picker.some((o) => /Xi/.test(o)) && notify.picker.includes('工作'), 'the NOTIFY picker is EXACTLY the account\'s access list (Xi, 工作) — nobody without access is offered', JSON.stringify(notify.picker));
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
  const row = [...dlg.querySelectorAll('.chan-access-row')].find((r) => /Xi/.test(r.querySelector('.chan-access-who').textContent));
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
  const rules = () => [...row.querySelectorAll('.chan-af-rules .chan-af-rule')];
  let prefill = null, clamps = null;
  if (${edit}) {
    prefill = { who: row.querySelector('.chan-watch-who .pp-trigger-name').textContent, mode: row.querySelector('input[type=radio][value=rule]').checked ? 'filtered' : 'all', notify: row.querySelector('input[type=radio][value=digest]').checked ? 'digest' : 'wake', preview: (row.querySelector('.chan-notify-preview') || {}).textContent || null, rules: rules().map((r) => [...r.querySelectorAll('input')].map((i) => i.value)), nums: [...row.querySelectorAll('input[type=number]')].map((i) => i.value) };
  } else {
    const who0 = row.querySelector('.chan-watch-who .pp-trigger-name').textContent;
    if (who0 !== '工作') return { fail: 'the only principal with access is not preselected', who: who0 };
    // channel-polish: the THREE plain questions — ② "只有符合规则的消息…" folds the rule editor open
    row.querySelector('input[type=radio][value=rule]').click();
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
    // ③ "每 [9999] 分钟一份摘要" (its own clamp) and, its OWN line under the answers, "每天最多 [9999] 次" (its
    // clamp under it) — the owner's two 9999s, each said at its own field (verify round 2: the cap bounds the
    // digest too, so it is no third answer to click)
    const nums = [...row.querySelectorAll('input[type=number]')];
    row.querySelector('input[type=radio][value=digest]').click();
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
ok(!again.fail && again.prefill && again.prefill.who === '工作' && again.prefill.mode === 'filtered' && again.prefill.notify === 'digest' && JSON.stringify(again.prefill.rules) === JSON.stringify([['09:00', '12:00'], ['14:00', '18:00']]) && JSON.stringify(again.prefill.nums) === JSON.stringify(['1440', '1000']), 're-opening 通知… prefills 组 · 工作 with the two saved windows and the numbers AS STORED (1440, 1000)', JSON.stringify(again));
ok(again.closed && !(again.toasts || []).some((x) => x.error), 'saving the edit (the filter re-sent inline) closes with no error toast', JSON.stringify(again.toasts));

// ── ⑦b A DIGEST KEEPS ITS OWN DAILY CAP, AND A PERSON CAN CHANGE IT (verify round 2, 2026-09-27) ──
// The watcher's `dailyWakeCap` bounds a digest as it bounds a wake (the engine reads it for both), and the owner's
// own save above is exactly that shape: a digest every 1440 minutes, at most 1000 a day. Question ③ drew the cap
// as a THIRD exclusive answer beside "right away" and "a digest" — so with "a digest" chosen the cap's field was
// DISABLED: a stored digest's cap could be read in the preview and never changed, and a new digest could not be
// given one. The cap is its own line now, always editable. TRUSTED typing (CDP) — a disabled field takes no focus.
{
  const opened = await p1.evaljs(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    document.querySelector('.rail-panel-channels .chan-sec[data-adapter="fake-poll"] .chan-sec-more').click(); await sleep(200);
    [...document.querySelectorAll('.context-menu .context-menu-item')].find((x) => x.textContent.trim() === '通知…').click();
    for (let i = 0; i < 40 && !document.querySelector('#chan-notify-dialog .chan-watch-row'); i++) await sleep(100);
    const row = document.querySelector('#chan-notify-dialog .chan-watch-row');
    if (!row) return { fail: 'Notify… did not open' };
    const nums = [...row.querySelectorAll('input[type=number]')];
    const cap = nums[1];
    cap.focus(); cap.select();
    const R = cap.getBoundingClientRect();
    return { n: nums.length, disabled: cap.disabled, focused: document.activeElement === cap, value: cap.value, shown: R.width > 0 && R.height > 0, how: [...row.querySelectorAll('input[type=radio]')].filter((r) => r.checked && /^(now|digest|cap)$/.test(r.value)).map((r) => r.value), answers: [...row.querySelectorAll('input[type=radio]')].map((r) => r.value) };
  })()`);
  ok(!opened.fail && opened.n === 2 && JSON.stringify(opened.how) === JSON.stringify(['digest']) && opened.value === '1000' && opened.shown && !opened.disabled && opened.focused, 'a stored DIGEST opens with its own daily cap (1000) in a field a person can use — shown, enabled, focusable', JSON.stringify(opened));
  ok(!opened.fail && !opened.answers.includes('cap'), 'the cap is not a third exclusive answer beside "right away" and "a digest" (it bounds both)', JSON.stringify(opened.answers));
  await p1.cdp('Input.insertText', { text: '7' });
  const saved = await p1.evaljs(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const dlg = document.getElementById('chan-notify-dialog');
    const row = dlg.querySelector('.chan-watch-row');
    const cap = [...row.querySelectorAll('input[type=number]')][1];
    await sleep(400);
    for (let i = 0; i < 40; i++) { const st = row.querySelector('.chan-af-stat'); if (st && !/估算中|估计中|Estimating/.test(st.textContent)) break; await sleep(150); }
    const out = { typed: cap.value, preview: (row.querySelector('.chan-notify-preview') || {}).textContent || '' };
    for (const x of document.querySelectorAll('#global-toasts .global-toast')) x.dataset.seenBefore = '1';   // by MARK, never by index (an older toast expiring shifts every index)
    [...dlg.querySelectorAll('button')].find((b) => b.textContent.trim() === '保存').click();
    for (let i = 0; i < 50 && document.getElementById('chan-notify-dialog'); i++) await sleep(100);
    await sleep(200);
    out.closed = !document.getElementById('chan-notify-dialog');
    out.toasts = [...document.querySelectorAll('#global-toasts .global-toast:not([data-seen-before])')].map((x) => ({ error: x.classList.contains('global-toast-error'), text: x.textContent }));
    if (!out.closed) document.getElementById('chan-notify-dialog').remove();
    return out;
  })()`);
  ok(saved.typed === '7' && /7/.test(saved.preview) && /1440/.test(saved.preview), 'typing 7 into it lands in the field, and the preview says the digest AND its new cap', JSON.stringify(saved));
  const w7 = ((((await api('GET', '/api/channels')).json.adapters || []).find((x) => x.id === 'fake-poll') || {}).accountGrain || { watchers: [] }).watchers[0] || {};
  ok(saved.closed && !(saved.toasts || []).some((x) => x.error) && w7.notify === 'digest' && w7.digestMinutes === 1440 && w7.dailyWakeCap === 7 && w7.mode === 'filtered' && w7.filter && w7.filter.rules.length === 2, 'the wire: still the digest every 1440 minutes on its two windows — at most 7 a day', JSON.stringify([saved.toasts, w7]));
}

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
  return { rows: [...dlg.querySelectorAll('.chan-access-row')].map((r) => r.querySelector('.chan-access-who').textContent), readFresh: (window.__vsFetchLog || []).filter((u) => /\\/api\\/channels\\/adapters\\/fake-poll\\/view$/.test(u)).length };
})()`;
const SAVE_OPEN = `(async () => {
  ${TOAST_LOG}
  const dlg = document.getElementById('chan-access-dialog');
  const out = await (${SAVE_OUTCOME('chan-access-dialog')})([...dlg.querySelectorAll('button')].find((b) => b.textContent.trim() === '保存'));
  // a refusal re-opens the dialog on the lists as they are now: wait for a dialog that is NOT the one saved
  let rows = null;
  for (let i = 0; i < 300; i++) { const d = document.getElementById('chan-access-dialog'); if (d && d !== dlg && d.querySelector('.chan-access-row')) { rows = [...d.querySelectorAll('.chan-access-row')].map((r) => r.querySelector('.chan-access-who').textContent); break; } await new Promise((r) => setTimeout(r, 100)); }
  const d2 = document.getElementById('chan-access-dialog');
  if (d2) { const cancel = [...d2.querySelectorAll('button')].find((b) => b.textContent.trim() === '取消'); if (cancel) cancel.click(); else d2.remove(); }
  return { ...out, reopened: rows };
})()`;
const m8 = await p1.evaljs(MENU('授权访问…'));
const o8 = m8.fail ? m8 : await p1.evaljs(OPEN_ROWS);
ok(!o8.fail && o8.rows.length === 1 && o8.rows[0] === '工作', 'FIXTURE: 授权访问… is open on the account\'s one access row (工作)', JSON.stringify(o8));
const g8 = await api('PUT', '/api/channels/adapters/fake-poll/access', { access: [{ principal: WORK_P, authority: 'draft' }, { principal: YU, authority: 'draft' }] });
ok(g8.status === 200 && (await accessNames()) === 'Yu,工作', 'WHILE IT IS OPEN, Yu is granted through the route (another window, an agent\'s approved request)', JSON.stringify(g8.json).slice(0, 200));
const s8 = await p1.evaljs(SAVE_OPEN);
ok(s8.toasts.some((x) => x.error && /在对话框打开期间被改动/.test(x.text)) && !s8.toasts.some((x) => /访问权限已保存/.test(x.text)), `Save (the dialog's list [工作], drawn before Yu) is REFUSED by name — the toast says the list changed while the dialog was open and nothing was saved (${s8.ms} ms)`, JSON.stringify(s8));
ok(Array.isArray(s8.reopened) && s8.reopened.some((x) => /Yu/.test(x)) && s8.reopened.some((x) => x === '工作'), `…and the dialog RE-OPENS on the lists as they are now (${JSON.stringify(s8.reopened)})`, JSON.stringify(s8.reopened));
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
// ⑨b the REPAINT of an open window while it is scrolled away from the top: the rebuild's clear drops scrollTop to 0
// and the scroll handler asks for the page ABOVE the boundary the clear just reset — the tail page again, prepended
// beside the rebuild's own. Constructed: the window open and settled at its bottom, ONE REBUILD; judged once its page
// (and any upward page) parsed. THE .195 MERGE: since lane channel-render (§25) a broadcast naming the conversation
// PATCHES the list in place (new rows appended, never a clear) — the rebuild that still clears is a reconnect's
// re-read (`onStateChange` → render()), so that is the trigger here; the broadcasts stay held so no patch interleaves.
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
    window.app.ws._notifyState(true);   // the rebuild: a reconnect's re-read (the broadcast only patches since §25)
    // the rebuild's CLEAR (its page still held) drops scrollTop to 0; the scroll event a visible page dispatches for
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
ok(rp.before > 0 && rp.cleared && rp.parsed === rp.started && rp.after === rp.before, `ONE LIST, ONE WRITER (⑨b): a rebuild (a reconnect's re-read) repainting an open window (its clear dropping scrollTop to 0 and that scroll event dispatched) draws its ${rp.before} message(s) once (${rp.after} drawn; pages read: ${rp.urls.join(' ')})`, JSON.stringify(rp));
ok(race.bars >= 3 && race.barsParsed === race.bars && race.parsed === race.started && race.page > 0 && race.shown === race.page, `ONE LIST, ONE WRITER: three renders in flight together (the open's page answering last; ${race.started} of them fetched a page) — the window shows the page's ${race.page} record(s) ONCE (${race.shown} drawn)`, JSON.stringify(race));

// ── ⑩ lane channel-rich (2026-09-28): A MAIL IS SHOWN FORMATTED, SAFELY; A BOT HAS ITS MARK ──
// The owner: "gmail 这种富文本 html 内容似乎完全没有按照 html 渲染 … lark 里还有标记为 app 的情况". The fake push
// account's MAIL ROOM (the Gmail record's shape: a `role: body` text/html part, a cid: picture) opened in a window:
// the formatted body is in a FULLY SANDBOXED frame (`sandbox="allow-scripts"` only — an opaque origin), its remote
// picture NOT requested until 显示图片, the plain text a toggle away, a hostile mail runs NOTHING and reaches NOTHING
// (the beacon), the resizer's message trusted only from its own frame, 30 HTML mails hold ≤ LIVE_FRAME_CAP frames,
// and the phone width; a bot's line wears the bot mark.
{
  const MF = require(path.join(repo, 'src/mail-frame.js'));
  // WIRING PIN (lane-mirror-197, 2026-09-29): the DOM half re-judges the live set after every APPLIED height — a row that
  // slides into the visible band because a frame above shrank crosses no observer threshold and fires no scroll, the two
  // triggers the reconcile had; the runner saw the 7th of 7 short mails on screen as a blank box
  { const cmf = fs.readFileSync(path.join(repo, 'src/lib/channel-mail-frame.js'), 'utf8'); const APPLY = "s.h = hv.h; s.frame.style.height = hv.h + 'px'; s.box.dataset.h = String(hv.h);"; const at = cmf.indexOf(APPLY); const fnEnd = cmf.indexOf('\n  }\n', at); const nextLater = cmf.indexOf('later();', at);
    ok(at > 0 && cmf.split(APPLY).length === 2 && nextLater > at && nextLater < fnEnd, 'WIRING PIN: an APPLIED height re-judges the live set — `later()` follows the apply inside applyHeight (channel-mail-frame.js)'); }
  const MAIL = 'fake-push-mail';
  let n = 0;
  for (let i = 0; i < 160; i++) { const d = await api('GET', `/api/channels/fake-push/${MAIL}/messages?limit=60`); n = (d.json.records || []).length; if (n >= MAIL_N + 6) break; await sleep(250); }
  ok(n >= MAIL_N + 6, `FIXTURE: the mail room is ingested (${n} records: ${MAIL_N} HTML mails + pictures + hostile + plain + wide + quoted + a bot)`);
  const body = await api('GET', `/api/channels/fake-push/${MAIL}/messages?limit=60`);
  const pic = (body.json.records || []).find((r) => r.vendorId === `${MAIL}-pictures`);
  ok(pic && pic.attachments.some((a) => a.role === 'body' && a.mime === 'text/html') && pic.attachments.some((a) => a.cid === 'logo@fake'), 'the record names its formatted BODY (role body, text/html) and its cid: picture (the record keeps `role` and `cid`)', JSON.stringify(pic && pic.attachments));
  // a frame goes live on the list's IntersectionObserver + a frame callback: a BACKGROUND tab runs no frames, so
  // page 1 is brought to the front first (a person reads a mail in the tab they are looking at)
  await p1.cdp('Page.bringToFront');
  await p1.evaljs(`(async () => {
    const w = window.app.openChannel('fake-push', '${MAIL}');
    window.__mailW = w;
    window.__xss = null;
    for (let i = 0; i < 200; i++) { if (w.content.querySelectorAll('.chanmsg').length >= ${MAIL_N + 6}) break; await new Promise((r) => setTimeout(r, 100)); }
    return true;
  })()`);
  const ROW = (vid) => `[...window.__mailW.content.querySelectorAll('.chanmsg')].find((r) => r.dataset.vid === '${vid}')`;
  const waitFrame = async (vid, pred = 'true') => p1.evaljs(`(async () => {
    for (let i = 0; i < 150; i++) {
      const row = ${ROW(vid)};
      const f = row && row.querySelector('iframe.chanmail-frame');
      if (f && row.querySelector('.chanmail-box').dataset.h && (${pred})) return true;
      if (row && i % 10 === 0) row.scrollIntoView({ block: 'center' });
      await new Promise((r) => setTimeout(r, 100));
    }
    const row = ${ROW(vid)};
    const m = row && row.querySelector('.chanmail');
    window.__mailDiag = m ? { cls: row.className, note: m.querySelector('.chanmail-note').textContent, box: m.querySelector('.chanmail-box').innerHTML.slice(0, 200), boxHidden: m.querySelector('.chanmail-box').hidden } : { row: !!row, chanmail: false };
    return false;
  })()`);
  const diag = async () => JSON.stringify(await p1.evaljs('window.__mailDiag || null'));
  // ⓐ the BOT's line wears its mark
  const bot = await p1.evaljs(`(() => { const r = ${ROW(`${MAIL}-bot`)}; return r ? { name: r.querySelector('.chanmsg-head b') && r.querySelector('.chanmsg-head b').textContent, mark: !!r.querySelector('.chanmsg-head .chanmsg-bot svg'), title: r.querySelector('.chanmsg-bot') && r.querySelector('.chanmsg-bot').title, emoji: /[\\u{1F300}-\\u{1FAFF}]/u.test(r.textContent) } : null; })()`);
  ok(bot && bot.name === 'Build Bot' && bot.mark && bot.title === '机器人' && !bot.emoji, 'D3: a bot\'s line shows its NAME with a small bot mark — the icon library\'s SVG (titled 机器人), never an emoji', JSON.stringify(bot));
  // ⓑ a mail with NO html part renders as before (its markup-looking plain text is WORDS, no frame)
  const plain = await p1.evaljs(`(() => { const r = ${ROW(`${MAIL}-plain`)}; return r ? { frame: !!r.querySelector('.chanmail'), text: r.querySelector('.chanmsg-body').textContent } : null; })()`);
  ok(plain && !plain.frame && plain.text.includes('<td>markup in the plain part</td>'), 'a mail with no text/html part: no frame, its plain text as WORDS (a markup-looking line stays words)', JSON.stringify(plain));
  // ⓒ the PICTURES mail: formatted, sandboxed, remote picture blocked, cid: drawn
  ok(await waitFrame(`${MAIL}-pictures`), 'the pictures mail draws its FRAME and the frame reported its height (our resizer ran, its message was accepted)', await diag());
  const F = await p1.evaljs(`(() => {
    const r = ${ROW(`${MAIL}-pictures`)};
    const f = r.querySelector('iframe.chanmail-frame');
    const doc = f.srcdoc;
    const pics = r.querySelector('.chanmail-pictures');
    return {
      sandbox: f.getAttribute('sandbox'), opaque: f.contentDocument === null, formatted: r.classList.contains('chanmail-formatted'),
      bodyHidden: getComputedStyle(r.querySelector('.chanmsg-body')).display === 'none',
      csp: (doc.match(/Content-Security-Policy" content="([^"]*)"/) || [])[1] || '', remote: /img\\.example\\.invalid/.test(doc), cid: /src="data:image\\/png;base64,/.test(doc),
      blocked: (doc.match(/data-vs-blocked="1"/g) || []).length, scripts: (doc.match(/<script/g) || []).length, h: Number(r.querySelector('.chanmail-box').dataset.h),
      pics: pics && !pics.hidden ? pics.textContent : null, modes: [...r.querySelectorAll('.chanmail-mode')].map((b) => [b.textContent, b.getAttribute('aria-pressed')]),
      stripLogo: [...r.querySelectorAll('.chanmsg-atts [data-channel-image]')].map((n) => getComputedStyle(n.closest('.chanmsg-pic') || n).display),
      docBody: doc.slice(doc.indexOf('<body>'), doc.lastIndexOf('<script')).replace(/base64,[A-Za-z0-9+/=]+/g, 'base64,…'),
    };
  })()`);
  ok(F.sandbox === 'allow-scripts' && F.opaque && F.formatted && F.bodyHidden, 'the frame is sandboxed "allow-scripts" ONLY (an opaque origin: contentDocument is null to the parent); the row is formatted, its text body hidden', JSON.stringify(F));
  ok(F.csp === MF.cspFor({ nonce: (F.csp.match(/'nonce-([^']+)'/) || [])[1] }) && !/https:/.test(F.csp) && !F.remote && F.blocked === 2 && F.scripts === 1, 'the frame document: OUR CSP (no https: before the press), the remote + tracker pictures carry NO src (blocked, marked), ONE script (ours)', JSON.stringify([F.csp, F.remote, F.blocked, F.scripts, F.docBody]));
  ok(F.cid && F.stripLogo.every((d) => d === 'none'), 'the cid: picture is drawn IN the mail (a data: picture the parent fetched through our route) — and not drawn again in the strip under it', JSON.stringify(F.stripLogo));
  ok(F.pics === '显示图片（2）' && F.modes[0][0] === '格式化' && F.modes[0][1] === 'true' && F.modes[1][0] === '纯文本' && F.h >= MF.HEIGHT_MIN, 'the bar says 格式化 | 纯文本 (formatted pressed) and 显示图片（2）', JSON.stringify(F));
  // ⓓ the resizer message SPOOFED from another frame (carrying the REAL token) is ignored
  const spoof = await p1.evaljs(`(async () => {
    const r = ${ROW(`${MAIL}-pictures`)};
    const f = r.querySelector('iframe.chanmail-frame');
    const tok = (f.srcdoc.match(/var T="([^"]+)"/) || [])[1];
    // the frame's OWN height must have settled before the spoof is judged against it (lane-mirror-197: under the runner's
    // CPU the first read was the 24 px the frame posted before its content loaded, the second its real 327 px — a
    // legitimate growth read as the spoof's): two reads 300 ms apart agree, bounded at 5 s
    { const t0 = Date.now(); let prev = null; while (Date.now() - t0 < 5000) { const h = f.style.height; if (h === prev) break; prev = h; await new Promise((res) => setTimeout(res, 300)); } }
    const h0 = f.style.height;
    const evil = document.createElement('iframe');
    evil.setAttribute('sandbox', 'allow-scripts');
    evil.srcdoc = '<script>parent.postMessage({vsMail:' + JSON.stringify(tok) + ',h:7777},"*");parent.postMessage({vsMail:' + JSON.stringify(tok) + ',open:"https://evil.example/x"},"*");<\/script>';
    const opened = []; const o0 = window.open; window.open = (...a) => { opened.push(a[0]); return null; };
    document.body.appendChild(evil);
    await new Promise((res) => setTimeout(res, 800));
    evil.remove(); window.open = o0;
    return { tok: !!tok, h0, h1: f.style.height, opened };
  })()`);
  ok(spoof.tok && spoof.h0 === spoof.h1 && !spoof.opened.length, 'a SPOOFED resizer message (another frame, carrying the real token) moves nothing and opens nothing — the parent checks the SOURCE window', JSON.stringify(spoof));
  // ⓔ Show pictures: this message's frame is rebuilt with https: in its CSP and the remote src; the tracker never
  await p1.evaljs(`(() => { ${ROW(`${MAIL}-pictures`)}.querySelector('.chanmail-pictures').click(); return true; })()`);
  ok(await waitFrame(`${MAIL}-pictures`, "/img-src data: https:/.test(f.srcdoc)"), 'after 显示图片 the frame is rebuilt');
  const P = await p1.evaljs(`(() => { const r = ${ROW(`${MAIL}-pictures`)}; const d = r.querySelector('iframe.chanmail-frame').srcdoc; return { https: /img-src data: https:/.test(d), remote: /src="https:\\/\\/img\\.example\\.invalid\\/pic\\.png"/.test(d), tracker: /tracker\\.gif/.test(d), button: r.querySelector('.chanmail-pictures').hidden }; })()`);
  ok(P.https && P.remote && !P.tracker && P.button, 'Show pictures: https: joins img-src FOR THIS FRAME, the https picture gets its src, the http tracker never; the button is gone', JSON.stringify(P));
  // ⓕ Plain text ⇄ Formatted
  const T1 = await p1.evaljs(`(async () => {
    const r = ${ROW(`${MAIL}-pictures`)};
    r.querySelector('.chanmail-mode[data-mode="plain"]').click();
    await new Promise((res) => setTimeout(res, 200));
    const plain = { frame: !!r.querySelector('iframe.chanmail-frame'), formatted: r.classList.contains('chanmail-formatted'), body: getComputedStyle(r.querySelector('.chanmsg-body')).display !== 'none' && /Newsletter/.test(r.querySelector('.chanmsg-body').textContent) };
    // naive-user verify (2026-09-28): the bar must not have moved UNDER the text — it stays where the pointer left it
    plain.barAboveBody = r.querySelector('.chanmail-bar').getBoundingClientRect().bottom <= r.querySelector('.chanmsg-body').getBoundingClientRect().top + 1;
    r.querySelector('.chanmail-mode[data-mode="formatted"]').click();
    return plain;
  })()`);
  ok(!T1.frame && !T1.formatted && T1.body, '纯文本: the frame is gone and the TEXT body is shown', JSON.stringify(T1));
  ok(T1.barAboveBody === true, '…and the 格式化 | 纯文本 bar stays ABOVE the text (it never jumps under the body when pressed)', JSON.stringify(T1));
  ok(await waitFrame(`${MAIL}-pictures`), '格式化: the frame comes back');
  // ⓖ THE HOSTILE MAIL: nothing runs, nothing is reached
  ok(await waitFrame(`${MAIL}-hostile`), 'the hostile mail draws its frame (sanitized)');
  await sleep(1500);
  const HM = await p1.evaljs(`(() => {
    const r = ${ROW(`${MAIL}-hostile`)};
    const f = r.querySelector('iframe.chanmail-frame');
    const d = f.srcdoc;
    return { xss: window.__xss, opaque: f.contentDocument === null, sandbox: f.getAttribute('sandbox'), scripts: (d.match(/<script/gi) || []).length,
      reach: /(src|style|href)="[^"]*127\\.0\\.0\\.1:${BEACON_PORT}|<style>[^<]*127\\.0\\.0\\.1:${BEACON_PORT}/.test(d), bad: (d.match(/<(iframe|object|embed|form|input|button|meta http|base|link|svg|math|video)\\b/gi) || []).length, on: /\\son[a-z]+\\s*=/i.test(d), js: /javascript:/i.test(d),
      windowFrames: document.querySelectorAll('iframe').length, top: location.href };
  })()`);
  ok(HM.xss === null && HM.opaque && HM.sandbox === 'allow-scripts' && HM.scripts === 1 && !HM.reach && HM.bad <= 1 && !HM.on && !HM.js, 'HOSTILE: window.__xss untouched, the frame opaque + sandboxed, ONE script (ours), no load from the beacon, no dangerous element (the one match is our own CSP <meta>), no handler, no javascript:', JSON.stringify(HM));
  ok(beaconHits.length === 0, `the BEACON was never hit — script / onerror / meta refresh / base / form / iframe / CSS url() / @import / srcset / the http tracker (${beaconHits.length} hits)`, beaconHits.join(', '));
  ok(HM.top === `http://127.0.0.1:${PORT}/`, 'the page never navigated (a meta refresh / base / target=_top reached nothing)', HM.top);
  // ⓖ2 (naive-user verify, 2026-09-28) THE QUOTED HISTORY IS FOLDED: a Gmail-shaped reply's `gmail_quote` is
  //    marked ONCE (the outermost), hidden in the frame behind one "显示引用内容" button, shown on a press. The frame
  //    is opaque to the parent, so the SAME srcdoc is read through a test-only same-origin probe frame (no
  //    sandbox: the probe is this suite's, never the product's — the product's frame stays allow-scripts)
  ok(await waitFrame(`${MAIL}-quoted`), 'the quoted mail draws its frame');
  const QF = await p1.evaljs(`(async () => {
    const r = ${ROW(`${MAIL}-quoted`)};
    const doc = r.querySelector('iframe.chanmail-frame').srcdoc;
    const probe = document.createElement('iframe'); probe.style.cssText = 'width:600px;height:400px;position:fixed;left:-2000px;top:0';
    probe.srcdoc = doc; document.body.appendChild(probe);
    await new Promise((res) => setTimeout(res, 600));
    const d = probe.contentDocument;
    // (ids never survive the sanitizer — DOMPurify forbids id — so the paragraphs are found by their words)
    const byWords = (w) => [...d.querySelectorAll('p')].find((x) => x.textContent.trim() === w) || null;
    const btn = d.querySelector('button.vs-q'), old = byWords('Can we ship the fix today?'), nu = byWords('Sounds good — shipping it.');
    const bodyH = () => Math.round(d.body.getBoundingClientRect().height);
    const out = { marks: (doc.match(/data-vs-quote="1"/g) || []).length, btn: btn ? btn.textContent : null, newShown: !!nu && nu.getBoundingClientRect().height > 0, oldHiddenBefore: !!old && old.getBoundingClientRect().height === 0, h0: bodyH() };
    if (btn) btn.click();
    await new Promise((res) => setTimeout(res, 300));
    out.oldShownAfter = !!old && old.getBoundingClientRect().height > 0; out.btnAfter = btn ? btn.textContent : null; out.h1 = bodyH();
    probe.remove();
    return out;
  })()`);
  ok(QF.marks === 1 && QF.btn === '显示引用内容' && QF.newShown && QF.oldHiddenBefore, 'the quoted history is marked ONCE (the outermost gmail_quote), the new words show, the quote is folded behind 显示引用内容', JSON.stringify(QF));
  ok(QF.oldShownAfter && QF.btnAfter === '收起引用内容' && QF.h1 > QF.h0, 'a press shows the quoted mail, the button says 收起引用内容, the document grew (the resizer posts the new height)', JSON.stringify(QF));
  // ⓗ LAZY: 30 HTML mails never hold 30 frames — scrolled top to bottom; at every stop EVERY formatted row on
  //    screen is live (security verify r2, continued: the cap used to blank visible mails past the sixth) and the
  //    frames never outnumber max(LIVE_FRAME_CAP, the rows on screen)
  const LZ = await p1.evaljs(`(async () => {
    const w = window.__mailW, list = w.content.querySelector('.chanwin-list');
    const counts = [], blank = [], over = [];
    for (let y = 0; y <= list.scrollHeight; y += Math.max(200, list.clientHeight / 2)) {
      list.scrollTop = y; list.dispatchEvent(new Event('scroll'));
      await new Promise((r) => setTimeout(r, 900));
      const L = list.getBoundingClientRect();
      const fm = [...w.content.querySelectorAll('.chanmsg.chanmail-formatted')];
      const onScreen = fm.filter((row) => { const b = row.querySelector('.chanmail-box').getBoundingClientRect(); return b.height > 0 && b.bottom > L.top && b.top < L.bottom; });
      const n = w.content.querySelectorAll('iframe.chanmail-frame').length;
      counts.push(n);
      for (const row of onScreen) if (!row.querySelector('iframe.chanmail-frame')) blank.push(y + ':' + row.dataset.vid);
      if (n > Math.max(${MF.LIVE_FRAME_CAP}, onScreen.length)) over.push(y + ':' + n + '>' + onScreen.length);
    }
    return { counts, blank, over, total: w.content.querySelectorAll('.chanmail').length };
  })()`);
  ok(LZ.total >= MAIL_N + 2 && Math.max(...LZ.counts) < LZ.total && Math.max(...LZ.counts) >= 1 && !LZ.over.length && !LZ.blank.length, `LAZY: ${LZ.total} formatted mails, at most ${Math.max(...LZ.counts)} live frames at any scroll position (never more than max(cap ${MF.LIVE_FRAME_CAP}, the rows on screen)) and every formatted row ON SCREEN is live at every stop`, JSON.stringify(LZ));
  // ⓘ THE PHONE WIDTH: nothing leaves the row, the toggle is a finger's target
  await p1.cdp('Emulation.setDeviceMetricsOverride', { width: 375, height: 760, deviceScaleFactor: 2, mobile: true });
  await sleep(600);
  const PH = await p1.evaljs(`(async () => {
    const r = ${ROW(`${MAIL}-pictures`)};
    r.scrollIntoView({ block: 'center' });
    await new Promise((res) => setTimeout(res, 800));
    const list = window.__mailW.content.querySelector('.chanwin-list');
    const box = r.querySelector('.chanmail-box').getBoundingClientRect(), row = r.getBoundingClientRect();
    return { overflow: list.scrollWidth > list.clientWidth + 1, inside: box.right <= row.right + 1 && box.left >= row.left - 1, modeH: Math.round(r.querySelector('.chanmail-mode').getBoundingClientRect().height), vw: window.innerWidth };
  })()`);
  ok(PH.vw <= 400 && !PH.overflow && PH.inside && PH.modeH >= 36, 'the phone width: the frame stays inside its row, nothing scrolls sideways, the toggle is ≥ 36 px tall', JSON.stringify(PH));
  // ⓘ2 (naive-user verify, 2026-09-28) FIT TO WIDTH: a 900 px newsletter at the phone's ~300 px frame is ZOOMED to
  //    fit — its right edge is inside the frame, nothing is cut (the frame's overflow is hidden: a cut mail was
  //    unreadable AND unreachable). Read through the test-only probe at the product frame's own width; the
  //    CONTROL is the same document with our fit rule neutered (zoom pinned at 1) — it overflows.
  ok(await waitFrame(`${MAIL}-wide`), 'the wide newsletter draws its frame at the phone width');
  const FW = await p1.evaljs(`(async () => {
    const r = ${ROW(`${MAIL}-wide`)};
    const f = r.querySelector('iframe.chanmail-frame');
    const w = Math.round(f.getBoundingClientRect().width);
    const read = async (doc) => {
      const probe = document.createElement('iframe'); probe.style.cssText = 'width:' + w + 'px;height:300px;position:fixed;left:-2000px;top:0';
      probe.srcdoc = doc; document.body.appendChild(probe);
      await new Promise((res) => setTimeout(res, 700));
      const d = probe.contentDocument, m = [...d.querySelectorAll('td')].find((x) => x.textContent.trim() === 'Wide newsletter') || null;
      const out = { zoom: d.body.style.zoom, sw: Math.round(d.body.getBoundingClientRect().width), cw: d.documentElement.clientWidth, right: m ? Math.round(m.getBoundingClientRect().right) : null, h: Math.round(d.body.getBoundingClientRect().height) };
      probe.remove();
      return out;
    };
    const fit = await read(f.srcdoc);
    const neutered = f.srcdoc.replace("b.style.zoom=sw>cw+1?String(cw/sw):'1';", "b.style.zoom='1';");
    const ctl = await read(neutered);
    ctl.patched = neutered !== f.srcdoc;
    return { w, fit, ctl, boxH: Number(r.querySelector('.chanmail-box').dataset.h) };
  })()`);
  ok(FW.w < 400 && FW.fit.zoom && Number(FW.fit.zoom) < 0.5 && FW.fit.sw <= FW.fit.cw + 1 && FW.fit.right <= FW.w, `FIT: the 900 px mail is zoomed to the ${FW.w} px frame (zoom ${FW.fit.zoom}), its right edge inside, nothing overflows`, JSON.stringify(FW));
  ok(FW.ctl.zoom === '1' && FW.ctl.patched === true && FW.ctl.right > FW.w + 100, 'CONTROL: the same document with the fit rule neutered overflows the frame (the cut the owner would have seen)', JSON.stringify(FW.ctl));
  ok(FW.boxH >= MF.HEIGHT_MIN && FW.boxH < 400, 'the product frame\'s reported height is the ZOOMED content\'s (a fitted mail is short, not a 900 px-wide mail\'s tall wrap)', JSON.stringify(FW.boxH));
  await p1.cdp('Emulation.clearDeviceMetricsOverride');
  await p1.evaljs(`(() => { window.app.wm.closeWindow(window.__mailW.id); return true; })()`);
  ok(beaconHits.length === 0, `…and at the end of the leg the beacon is still untouched (${beaconHits.length})`, beaconHits.join(', '));
  // CONTROL: the SAME hostile mail rendered RAW (the eml viewer's shape without its sandbox: no sanitizer, no CSP,
  // same origin) reaches the beacon — the zeros above are the wall, not a dead fixture
  await p1.evaljs(`(async () => {
    const r = await fetch('/api/channels/fake-push/${MAIL}/attachment/' + encodeURIComponent('${MAIL}-hostile-body') + '?msg=${MAIL}-hostile');
    const raw = document.createElement('iframe');
    raw.srcdoc = await r.text();
    document.body.appendChild(raw);
    await new Promise((res) => setTimeout(res, 2000));
    raw.remove();
    return true;
  })()`);
  ok(beaconHits.length > 0 && beaconHits.some((h) => /\/script|\/onerror|\/css|\/import/.test(h)) && beaconConns > 0, `CONTROL: the same hostile mail rendered RAW reaches the beacon (${beaconHits.length} hits over ${beaconConns} TCP connections — the connection counter ⑩x reads is not blind: ${beaconHits.slice(0, 6).join(', ')})`);
}

// ── ⑩x (security verify r2, 2026-09-28): THE ATTACK CORPUS, IN REAL CHROME ──
// Every mail of scripts/mail-attack-corpus.mjs (script in every syntax incl. the DOMPurify bypass classes, the CSP
// meta, srcdoc / raw-text breakouts, DOM clobbering, every remote-load vector — link rels, media, srcset, CSS url() /
// @import / image-set / cursor / content / @font-face / mask, table backgrounds, protocol-relative + relative pictures,
// cid: abuse, an animated height, a fixed overlay, 1 000 pictures, a fake quote mark) rendered through the product's
// own path in its own room (`fake-push-attack`): the srcdoc parsed as the frame parses it (a DOM census: ONE nonce'd
// script, ours; the CSP meta right after the charset; no dangerous element / handler / javascript: / reach in any
// attribute or style), the frame opaque + `allow-scripts`, ZERO beacon hits (http + https) before Show pictures — then
// ONLY https images after it, with no referer and no cookie; a click on a javascript: / entity / data: link opens
// nothing, on an https link the parent opens it (noopener) and the page never navigates; the animated mail moves
// nothing; cid: names only the message's own part; a probe script under the product's OWN frame configuration reaches
// nothing; the attachment route says Content-Length.
{
  const MF = require(path.join(repo, 'src/mail-frame.js'));
  const ATK = 'fake-push-attack';
  const BP = BEACON_PORT, SP = BEACON_TLS_PORT;
  await p1.cdp('Page.bringToFront');
  let n = 0;
  for (let i = 0; i < 160; i++) { const d = await api('GET', `/api/channels/fake-push/${ATK}/messages?limit=200`); n = (d.json.records || []).length; if (n >= Math.min(50, CORPUS.length)) break; await sleep(250); }
  // a FIRST ingest takes the newest 50: the rest through /older (the vendor's own page), honouring the floor
  for (let i = 0; i < 40 && n < CORPUS.length; i++) {
    const d = await api('GET', `/api/channels/fake-push/${ATK}/messages?limit=200`);
    const recs = d.json.records || []; n = recs.length; if (n >= CORPUS.length) break;
    const r = await api('POST', `/api/channels/fake-push/${ATK}/older`, { before: recs[0] ? recs[0].at : null, beforeId: recs[0] ? recs[0].vendorId : null, limit: 50 });
    if (r.json && r.json.refused) { await sleep(Math.min(20000, Number(r.json.retryAfterMs) || 1000) + 100); continue; }
    if (r.json && r.json.exhausted) { n = (await api('GET', `/api/channels/fake-push/${ATK}/messages?limit=200`)).json.records.length; break; }
    await sleep(300);
  }
  ok(n === CORPUS.length, `FIXTURE: the attack room holds every corpus mail (${n} of ${CORPUS.length})`);
  const rows = await p1.evaljs(`(async () => {
    const w = window.app.openChannel('fake-push', '${ATK}');
    window.__atkW = w; window.__xss = null; window.__opened = []; const o0 = window.open; window.open = (...a) => { window.__opened.push(String(a[0])); return null; };
    for (let i = 0; i < 100; i++) { if (w.content.querySelectorAll('.chanmsg').length >= 20) break; await new Promise((r) => setTimeout(r, 100)); }
    const list = w.content.querySelector('.chanwin-list');
    for (let k = 0; k < 60 && w.content.querySelectorAll('.chanmsg').length < ${CORPUS.length}; k++) { list.scrollTop = 0; list.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true })); await new Promise((r) => setTimeout(r, 400)); }
    return w.content.querySelectorAll('.chanmsg').length;
  })()`);
  ok(rows === CORPUS.length, `the window shows every corpus mail after paging up (${rows})`);
  // A VISIBLE MAIL IS NEVER A BLANK BOX (security verify r2, continued): the attack room is mostly SHORT mails, so
  // more than LIVE_FRAME_CAP of them sit on screen at once — around five of them, every formatted row on screen is
  // live (the round-1 cap left the rest blank placeholders, their text hidden: run6's `custom-elements: timeout`)
  // THE FRAMES' OWN EVIDENCE, with a deadline — never a fixed sample (lane-mirror-197, 2026-09-29: two naps of 2.5 s + 1.2 s
  // judged the runner's picture while six frames above were still shrinking from their 140 px placeholders; the product
  // re-judges the live set after every applied height now, and the judge waits until every formatted row on screen holds a
  // live, measured frame AND the picture has stopped moving — two reads 150 ms apart agree — then re-centres the named row
  // and waits once more; past 8 s it judges what it sees and says so)
  const shortView = await p1.evaljs(`(async () => { const w = window.__atkW; const list = w.content.querySelector('.chanwin-list'); const out = { maxOnScreen: 0, blank: [], waits: [] };
    const onScreen = () => { const L = list.getBoundingClientRect(); return [...w.content.querySelectorAll('.chanmsg.chanmail-formatted')].filter((r) => { const b = r.querySelector('.chanmail-box').getBoundingClientRect(); return b.height > 0 && b.bottom > L.top && b.top < L.bottom; }); };
    const isLive = (r) => !!(r.querySelector('iframe.chanmail-frame') && r.querySelector('.chanmail-box').dataset.h);
    const settle = async (t0) => { let prev = null; while (Date.now() - t0 < 8000) { const on = onScreen(); const sig = on.map((r) => r.dataset.vid + '@' + Math.round(r.getBoundingClientRect().top) + (isLive(r) ? '+' : '-')).join('|'); if (sig === prev && on.every(isLive)) return true; prev = sig; await new Promise((r) => setTimeout(r, 150)); } return false; };
    for (const name of ['script-src', 'svg-onload', 'iframe-src', 'math-mglyph', 'dom-clobber']) {
      const row = [...w.content.querySelectorAll('.chanmsg')].find((r) => r.dataset.vid === '${ATK}-x-' + name); if (!row) { out.blank.push('no-row:' + name); continue; }
      const t0 = Date.now();
      row.scrollIntoView({ block: 'center' }); const s1 = await settle(t0);
      row.scrollIntoView({ block: 'center' }); const s2 = await settle(t0);
      out.waits.push(name + ':' + (Date.now() - t0) + 'ms' + (s1 && s2 ? '' : ':deadline'));
      const on = onScreen();
      out.maxOnScreen = Math.max(out.maxOnScreen, on.length);
      for (const r of on) if (!isLive(r)) out.blank.push(name + ':' + r.dataset.vid.replace(/.*-x-/, ''));
    }
    return out; })()`);
  ok(shortView.maxOnScreen > MF.LIVE_FRAME_CAP && !shortView.blank.length, `around five short corpus mails up to ${shortView.maxOnScreen} formatted mails are on screen (> the cap ${MF.LIVE_FRAME_CAP}) and EVERY one is live — a visible mail is never a blank box (settled: ${(shortView.waits || []).join(' ')})`, JSON.stringify(shortView));
  const AROW = (vid) => `[...window.__atkW.content.querySelectorAll('.chanmsg')].find((r) => r.dataset.vid === '${vid}')`;
  const waitAtk = async (vid) => p1.evaljs(`(async () => { const t0 = Date.now(); while (Date.now() - t0 < 8000) { const row = ${AROW(vid)}; if (!row) return 'no-row'; const f = row.querySelector('iframe.chanmail-frame'); if (f && row.querySelector('.chanmail-box').dataset.h) return 'ok'; if (row.querySelector('.chanmail-note') && !row.querySelector('.chanmail-note').hidden) return 'note:' + row.querySelector('.chanmail-note').textContent; row.scrollIntoView({ block: 'center' }); await new Promise((r) => setTimeout(r, 120)); } return 'timeout'; })()`);
  /** THE DOM CENSUS of one frame's srcdoc, parsed as the frame parses it. A STYLE is judged by the functions a browser
   *  LOADS from (url / image / image-set / cross-fade / element / src) — a defanged escape (`\75 rl(<beacon>)` → `75 rl(…)`,
   *  the css-escapes mail) names none, and the beacon count below proves it reaches nothing.
   *  READ ONLY ONCE THE ROW IS LIVE, MEASURED AND STILL (lane-mirror-197, 2026-09-29): the row is centred, its frame live with
   *  a posted height, and two reads 150 ms apart put the frame at the same y — a fixed 300 ms sample after `waitAtk` read
   *  three rows on the runner AFTER a neighbour's late height had pushed them out of the keep zone and the lazy rule had
   *  dropped their frames ("dropped before the census"). Past 8 s it answers `{timeout}` naming the last state. */
  const census = (vid) => p1.evaljs(`(async () => { const t0 = Date.now(); let prevY = null, last = 'no-row';
    while (Date.now() - t0 < 8000) {
      const r = ${AROW(vid)}; if (!r) return null;
      const f = r.querySelector('iframe.chanmail-frame'); const box = r.querySelector('.chanmail-box');
      if (f && box.dataset.h) { const y = Math.round(f.getBoundingClientRect().y); if (prevY === y) return read(r, f); prevY = y; last = 'moving'; }
      else { prevY = null; last = f ? 'unmeasured' : 'no-frame'; }
      r.scrollIntoView({ block: 'center' }); await new Promise((res) => setTimeout(res, 150));
    }
    return { timeout: last };
    function read(r, f) { const d = f.srcdoc; const pd = new DOMParser().parseFromString(d, 'text/html'); const rect = f.getBoundingClientRect();
    return { sandbox: f.getAttribute('sandbox'), opaque: f.contentDocument === null, scripts: pd.querySelectorAll('script').length, nonced: pd.querySelectorAll('script[nonce]').length, ourScript: pd.querySelectorAll('script').length === 1 && /vsMail:T/.test(pd.querySelector('script').textContent),
      heads: [...pd.head.children].map((x) => x.tagName.toLowerCase() + ':' + (x.getAttribute('http-equiv') || x.getAttribute('name') || (x.getAttribute('charset') ? 'charset' : ''))),
      danger: [...pd.querySelectorAll('iframe,object,embed,form,input,button,base,link,svg,math,video,audio,picture,source,track,template,noscript,textarea,title,xmp,plaintext,dialog,portal,slot,applet,frame,frameset,select,option,marquee,meta[http-equiv=refresh],meta[name=referrer][content=unsafe-url]')].map((x) => x.tagName.toLowerCase()),
      onAttrs: [...pd.querySelectorAll('*')].flatMap((x) => [...x.attributes].filter((a) => /^on/i.test(a.name)).map((a) => x.tagName + '@' + a.name)),
      reach: [...pd.querySelectorAll('*')].flatMap((x) => [...x.attributes].filter((a) => /^(href|src|srcset|action|formaction|data|poster|background|ping|xlink:href|srcdoc|style|download|target)$/i.test(a.name) && (/^(srcset|action|formaction|data|poster|background|ping|xlink:href|srcdoc|download|target)$/i.test(a.name) || /javascript:|data:text|vbscript:|url\\s*\\(/i.test(a.value) || (a.name !== 'href' && a.name !== 'style' && new RegExp('127\\\\.0\\\\.0\\\\.1:${BP}\\\\b').test(a.value)) || (a.name === 'style' && /(?:^|[^a-z0-9_-])(?:image|image-set|-webkit-image-set|cross-fade|element|src)\\s*\\(/i.test(a.value)))).map((a) => x.tagName + '@' + a.name + '=' + a.value.slice(0, 40))),
      styleReach: [...pd.querySelectorAll('style')].filter((x) => /url\\s*\\(|@import|expression|keyframes|animation|(?:^|[^a-z0-9_-])(?:image|image-set|-webkit-image-set|cross-fade|element|src)\\s*\\(/i.test(x.textContent)).length,
      idsOrNames: [...pd.querySelectorAll('[id],[name]')].map((x) => x.tagName.toLowerCase()), custom: [...pd.querySelectorAll('*')].map((x) => x.tagName.toLowerCase()).filter((t) => t.includes('-') || t === 'x-foo'),
      httpsImgs: (d.match(/src="https:\\/\\/127\\.0\\.0\\.1:${SP}\\//g) || []).length, dataImgs: (d.match(/src="data:image\\//g) || []).length, blocked: (d.match(/data-vs-blocked="1"/g) || []).length, quoteMarks: (d.match(/data-vs-quote="1"/g) || []).length,
      h: Number(r.querySelector('.chanmail-box').dataset.h), rect: { x: rect.x, y: rect.y }, pics: r.querySelector('.chanmail-pictures').hidden ? null : r.querySelector('.chanmail-pictures').textContent }; } })()`);
  const bad = [], noFrame = [];
  const h0 = beaconHits.length, s0 = tlsHits.length, c0 = beaconConns;
  const clickOutcomes = {};
  for (const c of CORPUS) {
    const vid = `${ATK}-x-${c.name}`;
    const st = await waitAtk(vid);
    if (st !== 'ok') { noFrame.push(`${c.name}: ${st}`); continue; }
    const x = await census(vid);
    if (!x || x.timeout) { noFrame.push(`${c.name}: ${x ? `no live, measured, still frame within 8 s (last: ${x.timeout})` : 'no row'}`); continue; }
    const why = [];
    if (x.sandbox !== 'allow-scripts' || !x.opaque) why.push(`sandbox=${x.sandbox} opaque=${x.opaque}`);
    if (x.scripts !== 1 || x.nonced !== 1 || !x.ourScript) why.push(`scripts=${x.scripts} nonced=${x.nonced} ours=${x.ourScript}`);
    if (x.heads.slice(0, 3).join() !== 'meta:charset,meta:Content-Security-Policy,meta:referrer') why.push(`head=${x.heads.join()}`);
    if (x.danger.length) why.push(`danger=${x.danger.join()}`);
    if (x.onAttrs.length) why.push(`on=${x.onAttrs.join()}`);
    if (x.reach.length) why.push(`reach=${x.reach.join()}`);
    if (x.styleReach) why.push(`styleReach=${x.styleReach}`);
    if (x.idsOrNames.join() !== 'meta') why.push(`ids/names=${x.idsOrNames.join()}`);   // the referrer meta's own name
    if (x.custom.length) why.push(`custom=${x.custom.join()}`);
    if (x.h < MF.HEIGHT_MIN || x.h > MF.HEIGHT_MAX) why.push(`h=${x.h}`);
    if (c.name === 'cid-abuse' && x.dataImgs !== 2) why.push(`cid pictures=${x.dataImgs} (the two spellings of the message's own logo@fake, nothing else)`);
    if (c.name === 'quoted-inject' && x.quoteMarks !== 1) why.push(`quote marks=${x.quoteMarks} (only OUR mark on the gmail_quote)`);
    if (c.name === 'many-images' && x.blocked !== MF.MAX_IMAGES) why.push(`blocked=${x.blocked} of 1 000 (MAX_IMAGES)`);
    if (why.length) bad.push(`${c.name}: ${why.join('; ')}`);
    if (c.click) {
      const before = await p1.evaljs('window.__opened.length');
      for (let attempt = 0; attempt < 3; attempt++) {
        if ((await waitAtk(vid)) !== 'ok') break;
        // a LIVE frame may sit in the keep zone, above or below the list's visible band (waitAtk scrolls only a row
        // whose frame is not live yet — run6 pressed a-download's frame at y = −28 + 40, i.e. above the list, and
        // "opened nothing"): scroll it to the centre, let the neighbours' heights settle, and press only when the
        // frame's top 40 px are inside the list's visible band
        const rect = await p1.evaljs(`(async () => { const row = ${AROW(vid)}; const list = window.__atkW.content.querySelector('.chanwin-list'); let prev = null;
          for (let k = 0; k < 30; k++) { row.scrollIntoView({ block: 'center' }); await new Promise((r) => setTimeout(r, 150)); const f = row.querySelector('iframe.chanmail-frame'); if (!f) continue; const r = f.getBoundingClientRect(), L = list.getBoundingClientRect(); const cur = Math.round(r.y);
            if (prev === cur && r.y >= L.top && r.y + Math.min(40, r.height / 2) + 4 <= L.bottom) return { x: r.x, y: r.y, h: r.height, inBand: true }; prev = cur; }
          const f = row.querySelector('iframe.chanmail-frame'); const r = f ? f.getBoundingClientRect() : { x: 0, y: 0, height: 0 }; return { x: r.x, y: r.y, h: r.height, inBand: false }; })()`);
        if (!rect.inBand) continue;
        const px = rect.x + 60, py = rect.y + Math.min(40, rect.h / 2);
        await p1.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: px, y: py, button: 'left', clickCount: 1 });
        await p1.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: px, y: py, button: 'left', clickCount: 1 });
        await sleep(600);
        clickOutcomes[c.name] = await p1.evaljs(`({ opened: window.__opened.slice(${before}), top: location.href, xss: window.__xss })`);
        // a link expected to open: one more press if the first landed on a rebuilt frame; a link expected to open nothing never needs one
        if (clickOutcomes[c.name].opened.length || /javascript|xlink|base-href|form-/.test(c.name)) break;
      }
    }
  }
  ok(!noFrame.length, `every corpus mail draws its frame (${CORPUS.length - noFrame.length} of ${CORPUS.length})`, noFrame.join('; '));
  ok(!bad.length, `THE DOM CENSUS over ${CORPUS.length} hostile mails: opaque allow-scripts frame, ONE nonce'd script (ours), the CSP meta right after the charset, no dangerous element / handler / javascript: / srcset / action / ping / target / download / url() / keyframes, no id / name, no custom element; cid: only the message's own part; only our quote mark; 1 000 pictures capped`, bad.join('\n    '));
  ok(beaconHits.length === h0 && tlsHits.length === s0 && beaconConns === c0, `ZERO beacon hits (http ${beaconHits.length - h0}, https ${tlsHits.length - s0}) and ZERO new TCP connections to the http beacon (${beaconConns - c0} — no preconnect / dns-prefetch / prefetch opened a socket) across the whole corpus before Show pictures — no script, no meta refresh / base / form / iframe / object / embed, no link rel, no media, no srcset, no CSS url() / @import / image-set / cursor / content / font / mask, no table background, no http picture`, [...beaconHits.slice(h0), ...tlsHits.slice(s0).map((h) => h.url)].join(', '));
  const co = clickOutcomes;
  ok(co['a-javascript'] && !co['a-javascript'].opened.length && co['a-javascript-entities'] && !co['a-javascript-entities'].opened.length && co['xlink-href'] && !co['xlink-href'].opened.length && co['base-href'] && !co['base-href'].opened.length && co['form-javascript'] && !co['form-javascript'].opened.length && co['form-post'] && !co['form-post'].opened.length, 'a real click on a javascript: / entity-spelled / xlink / base-relative link or a form button opens NOTHING', JSON.stringify(co));
  ok(co['a-target-top'] && co['a-target-top'].opened.length === 1 && co['a-target-top'].opened[0] === `${BEACON_S || BEACON}/a-target-top/target-top` && co['a-download'] && co['a-download'].opened.length === 1 && /\/a-download\/download$/.test(co['a-download'].opened[0]), 'a real click on an https link: the PARENT opens exactly that URL (target=_top / ping / download dropped), through window.open with noopener', JSON.stringify([co['a-target-top'], co['a-download']]));
  ok(Object.values(co).every((o) => o.top === `http://127.0.0.1:${PORT}/` && o.xss === null), 'the page never navigated and window.__xss is untouched after every click');
  // SHOW PICTURES on the https mail: ONLY https images load (no referer, no cookie), the http one and every CSS /
  // link / media vector still nothing — for THIS sender's frames (the press is per sender)
  const t1 = beaconHits.length, u1 = tlsHits.length, c1 = beaconConns;
  const pressed = await p1.evaljs(`(() => { const r = ${AROW(`${ATK}-x-pictures-https`)}; const b = r.querySelector('.chanmail-pictures'); if (b && !b.hidden) { b.click(); return 'pressed'; } return 'no-button'; })()`);
  ok(pressed === 'pressed', 'Show pictures pressed on the https mail');
  for (const name of ['pictures-https', 'css-reach', 'link-rels', 'media', 'img-srcset-lazy', 'table-background', 'svg-use-href', 'meta-referrer']) await waitAtk(`${ATK}-x-${name}`);
  await sleep(2500);
  const after = tlsHits.slice(u1);
  ok(beaconHits.length === t1 && beaconConns === c1, `after Show pictures the http beacon is still untouched (${beaconHits.length - t1} hits, ${beaconConns - c1} new connections) — the http picture, every CSS url() / link / media / table background`, beaconHits.slice(t1).join(', '));
  ok(after.length >= 2 && after.every((h) => /^\/(pictures-https|img-srcset-lazy|meta-referrer)\/(pic|pic2|lazy|referrer)\.png(\?.*)?$/.test(h.url) && h.ref === null && h.cookie === null), `after Show pictures ONLY the https <img src> pictures loaded (${after.length}: ${[...new Set(after.map((h) => h.url))].join(', ')}), each with NO referer and NO cookie — never a CSS url(), a font, a link rel, a media source, a protocol-relative or a relative path`, JSON.stringify(after));
  if (BEACON_S) { await waitAtk(`${ATK}-x-css-reach`); const cx = await census(`${ATK}-x-css-reach`); ok(cx && !cx.timeout && cx.styleReach === 0 && cx.reach.length === 0, 'the CSS-reach mail with pictures ON: still no url() / @import / image-set in any style (the CSP would allow an https url() — the sanitizer never writes one)', JSON.stringify(cx)); }
  // THE ANIMATED MAIL moves nothing: no height message, one row height, one scrollTop over 3 s
  await waitAtk(`${ATK}-x-height-animation`);
  const storm = await p1.evaljs(`(async () => { const w = window.__atkW; const list = w.content.querySelector('.chanwin-list'); const row = ${AROW(`${ATK}-x-height-animation`)}; row.scrollIntoView({ block: 'center' }); await new Promise((r) => setTimeout(r, 2000)); const f = row.querySelector('iframe.chanmail-frame'); if (!f) return { noFrame: true };
    let msgs = 0; const h = (e) => { if (e.source === f.contentWindow && e.data && e.data.h !== undefined) msgs++; }; window.addEventListener('message', h);
    const tops = [], hs = []; const t0 = performance.now(); await new Promise((res) => { const tick = (t) => { tops.push(list.scrollTop); hs.push(row.getBoundingClientRect().height); if (t - t0 < 3000) requestAnimationFrame(tick); else res(); }; requestAnimationFrame(tick); });
    window.removeEventListener('message', h); return { msgs, rowHeights: new Set(hs).size, scrollTops: new Set(tops).size, anim: /keyframes|animation/i.test(f.srcdoc) }; })()`);
  ok(!storm.noFrame && storm.msgs === 0 && storm.rowHeights === 1 && storm.scrollTops === 1 && !storm.anim, `the height-animation mail: ${storm.msgs} height messages, ${storm.rowHeights} row height, ${storm.scrollTops} scrollTop in 3 s (its keyframes never reached the frame)`, JSON.stringify(storm));
  // THE TRAILING EDGE (security verify r2, continued): a burst of heights past the settle — the window narrowed in 12
  // steps 25 ms apart — ends with the row at the frame's LAST posted height (round 2's budget held it and the frame
  // never posts a height twice: measured 677 → 696 posted, the row stayed 677, the mail's last line cut)
  await waitAtk(`${ATK}-x-height-burst`);
  const drag = await p1.evaljs(`(async () => { const w = window.__atkW; const el = w.element; const row = ${AROW(`${ATK}-x-height-burst`)}; row.scrollIntoView({ block: 'center' });
    await new Promise((r) => setTimeout(r, 2500)); const f = row.querySelector('iframe.chanmail-frame'); if (!f) return { noFrame: true };
    const posted = []; const h = (e) => { if (e.source === f.contentWindow && e.data && e.data.h !== undefined) posted.push(e.data.h); }; window.addEventListener('message', h);
    const w0 = el.getBoundingClientRect().width; const target = Math.max(360, Math.round(w0 * 0.7));
    for (let k = 1; k <= 12; k++) { el.style.width = Math.round(w0 - (w0 - target) * k / 12) + 'px'; await new Promise((r) => setTimeout(r, 25)); }
    await new Promise((r) => setTimeout(r, 1500)); window.removeEventListener('message', h);
    const out = { w0, wEnd: Math.round(el.getBoundingClientRect().width), posts: posted.length, seq: posted.join(','), last: posted[posted.length - 1], applied: parseInt(f.style.height, 10), frozen: row.querySelector('.chanmail-box').dataset.frozen || null };
    el.style.width = w0 + 'px'; return out; })()`);
  ok(!drag.noFrame && drag.posts >= 2 && drag.applied === drag.last && !drag.frozen, `a window narrowed in 12 quick steps: the frame posted ${drag.posts} heights (${drag.seq}) and the row ends at the LAST one (${drag.applied} px) — a held height lands at the gap's end`, JSON.stringify(drag));
  // THE SANDBOX, PROVED WITH OUR OWN SCRIPT under the product's exact frame configuration: every reach fails
  const probe = await p1.evaljs(`(async () => {
    const r = ${AROW(`${ATK}-x-a-download`)}; r.scrollIntoView({ block: 'center' }); await new Promise((res) => setTimeout(res, 500));
    const f = r.querySelector('iframe.chanmail-frame'); if (!f) return { noFrame: true };
    const doc = f.srcdoc; const nonce = (doc.match(/nonce-([^']+)'/) || [])[1]; const B = '${BEACON}';
    const js = \`(async()=>{const out={};const t=async(n,fn)=>{try{const v=await fn();out[n]='ok:'+String(v).slice(0,40)}catch(e){out[n]='ERR:'+(e&&e.message||e).slice(0,120)}};
      await t('parentDocument',()=>parent.document.title);await t('topLocation',()=>{top.location='\${B}/probe/top';return 'set'});await t('parentLocation',()=>{parent.location='\${B}/probe/parent';return 'set'});
      await t('windowOpen',()=>{const x=window.open('\${B}/probe/open');return x?'window':'null'});await t('form',()=>{const fm=document.createElement('form');fm.action='\${B}/probe/form';fm.method='post';document.body.appendChild(fm);fm.submit();return 'submitted'});
      await t('alert',()=>{alert('x');return 'returned'});await t('sendBeacon',()=>navigator.sendBeacon('\${B}/probe/beacon','x'));await t('fetch',()=>fetch('\${B}/probe/fetch').then(r=>r.status));
      await t('xhr',()=>new Promise((res,rej)=>{const x=new XMLHttpRequest();x.open('GET','\${B}/probe/xhr');x.onload=()=>res(x.status);x.onerror=()=>rej(new Error('xhr error'));x.send()}));await t('ws',()=>new Promise((res,rej)=>{const s=new WebSocket('ws://127.0.0.1:${BP}/probe/ws');s.onerror=()=>rej(new Error('ws error'));s.onopen=()=>res('open')}));
      await t('img',()=>new Promise((res,rej)=>{const i=new Image();i.onload=()=>res('loaded');i.onerror=()=>rej(new Error('img blocked'));i.src='\${B}/probe/img.png'}));await t('localStorage',()=>localStorage.length);await t('cookie',()=>document.cookie.length);
      await t('fullscreen',()=>document.body.requestFullscreen().then(()=>'ok'));await t('prefetch',()=>{const l=document.createElement('link');l.rel='prefetch';l.href='\${B}/probe/prefetch';document.head.appendChild(l);return 'appended'});
      await t('cssImport',()=>{const s=document.createElement('style');s.textContent='@import url(\${B}/probe/import.css); body{background:url(\${B}/probe/css.png)}';document.head.appendChild(s);return 'appended'});await t('font',()=>{const s=document.createElement('style');s.textContent='@font-face{font-family:zz;src:url(\${B}/probe/font.woff)} body{font-family:zz}';document.head.appendChild(s);return 'appended'});
      await t('iframe',()=>{const i=document.createElement('iframe');i.src='\${B}/probe/child';document.body.appendChild(i);return 'appended'});await t('object',()=>{const o=document.createElement('object');o.data='\${B}/probe/object';document.body.appendChild(o);return 'appended'});await t('video',()=>{const v=document.createElement('video');v.src='\${B}/probe/video.mp4';document.body.appendChild(v);v.load();return 'loaded'});
      await t('eval',()=>eval('1+1'));await t('spoofHeight',()=>{parent.postMessage({vsMail:'wrong',h:9999},'*');return 'posted'});setTimeout(()=>parent.postMessage({probe:out},'*'),1500)})()\`;
    const doc2 = doc.replace(/<script nonce="[^"]+">[\\s\\S]*<\\/script>/, '<script nonce="' + nonce + '">' + js + '</script>');
    const pf = document.createElement('iframe'); pf.setAttribute('sandbox', f.getAttribute('sandbox')); pf.setAttribute('referrerpolicy', 'no-referrer'); pf.style.cssText = 'width:300px;height:100px;position:fixed;left:0;top:0';
    const got = new Promise((res) => { const h = (e) => { if (e.source === pf.contentWindow && e.data && e.data.probe) { window.removeEventListener('message', h); res(e.data.probe); } }; window.addEventListener('message', h); setTimeout(() => res({ timeout: true }), 8000); });
    pf.srcdoc = doc2; document.body.appendChild(pf); const out = await got; pf.remove(); out.__replaced = doc2 !== doc; out.__top = location.href; out.__opened = window.__opened.length; return out; })()`);
  await sleep(1500);
  const probeHits = [...beaconHits.slice(t1), ...tlsHits.slice(u1 + after.length).map((h) => h.url)].filter((u) => /\/probe\//.test(u));
  ok(probe && probe.__replaced && !probe.timeout && /Blocked a frame/.test(probe.parentDocument) && /does not/.test(probe.topLocation) && /does not/.test(probe.parentLocation) && probe.windowOpen === 'ok:null' && /sandbox/.test(probe.localStorage) && /sandbox/.test(probe.cookie) && /Failed to fetch/.test(probe.fetch) && /error/.test(probe.xhr) && /error/.test(probe.ws) && /blocked/.test(probe.img) && /Content Security Policy/.test(probe.eval) && /permissions policy/i.test(probe.fullscreen), 'THE SANDBOX, with OUR script under the product\'s exact frame configuration: parent.document blocked, top / parent navigation refused, window.open null, no storage, no cookie, fetch / XHR / WebSocket / Image refused, eval refused, fullscreen refused', JSON.stringify(probe));
  ok(!probeHits.length && probe.__top === `http://127.0.0.1:${PORT}/`, `…and NOTHING reached the beacon from it — form submit, sendBeacon, prefetch, @import, @font-face, a child iframe, object, video, self-navigation (${probeHits.length} hits)`, probeHits.join(', '));
  // THE ATTACHMENT ROUTE SAYS ITS SIZE (finding A's chrome half: round 1's header guard had nothing to read)
  {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/channels/fake-push/${ATK}/attachment/${encodeURIComponent(`${ATK}-x-script-plain-body`)}?msg=${ATK}-x-script-plain`);
    const body = await r.arrayBuffer();
    ok(r.status === 200 && Number(r.headers.get('content-length')) === body.byteLength && body.byteLength > 0 && r.headers.get('x-content-type-options') === 'nosniff' && /sandbox/.test(r.headers.get('content-security-policy') || ''), `the attachment route answers Content-Length (${r.headers.get('content-length')} = the body's ${body.byteLength} bytes) + nosniff + a sandbox CSP`, JSON.stringify([r.status, r.headers.get('content-length'), r.headers.get('transfer-encoding')]));
  }
  await p1.evaljs(`(() => { window.app.wm.closeWindow(window.__atkW.id); return true; })()`);
}

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
  // ⑨ / ⑨b's ONE mechanism neutered in the SAME control bundle (the .195 merge kept lane channel-render's): the
  // window's SERIAL QUEUE becomes "run now" (every list writer — a render, a patch, an upward page — interleaves
  // again), and the rule that a scroll event the rebuild's own clear caused is nobody's scroll is removed WHOLE —
  // `listReady` ('not-ready') AND the three clauses that make a scroll event prove itself (no-input / shrunk /
  // no-room): each alone refuses the clear's event (the clear is a clamp to a room of 0), so a control that removed
  // one layer would stay green for the wrong reason (the layered-guard rule)
  const WMOD = path.join(wt, 'src/lib/channel-window.js');
  const wsrc = fs.readFileSync(WMOD, 'utf8');
  const SERIAL = '  const serial = (fn) => { const run = queue.then(fn, fn); queue = run.catch(() => {}); return run; };\n';
  ok(wsrc.split(SERIAL).length === 2, 'CONTROL setup: the window\'s serial queue is spelled once where the control makes it "run now"');
  fs.writeFileSync(WMOD, wsrc.replace(SERIAL, '  const serial = (fn) => Promise.resolve().then(fn);\n'));
  const PMOD = path.join(wt, 'src/lib/channel-paging.js');
  const psrc = fs.readFileSync(PMOD, 'utf8');
  const READY = [
    "  if (!listReady) return { page: false, why: 'not-ready' };\n",
    "  if (cause === 'scroll' && !inputFresh({ inputAt, now, gutterDrag })) return { page: false, why: 'no-input' };\n",
    "  if (cause === 'scroll' && roomAtInput !== null && roomAtInput !== undefined && Number.isFinite(Number(roomAtInput)) && Number(room) < Number(roomAtInput)) return { page: false, why: 'shrunk' };\n",
    "  if (cause === 'scroll' && Number(room) <= TOP_PX) return { page: false, why: 'no-room' };\n",
  ];
  ok(READY.every((c) => psrc.split(c).length === 2), 'CONTROL setup: the list-ready rule and the three scroll-event clauses are each spelled once in the paging verdict');
  fs.writeFileSync(PMOD, READY.reduce((acc, c) => acc.replace(c, ''), psrc));
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
  ok(rpc.before > 0 && rpc.cleared && rpc.after > rpc.before, `CONTROL (⑨b): without the queue and the ready rule the rebuild's clear asks for the page above a reset boundary — the tail again — and the window draws ${rpc.after} for ${rpc.before} (pages read: ${rpc.urls.join(' ')})`, JSON.stringify(rpc));
  const rc = await p1.evaljs(RACE(baseRooms[1]));
  ok(rc.bars >= 3 && rc.started >= 2 && rc.parsed === rc.started && rc.page > 0 && rc.shown >= 2 * rc.page, `CONTROL (⑨): without the serial queue the same three list writers draw the page ${Math.round(rc.shown / Math.max(1, rc.page) * 10) / 10}× (${rc.shown} for ${rc.page}) — the slow runner's duplicate list; the leg above would go red`, JSON.stringify(rc));
}

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
