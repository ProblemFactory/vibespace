#!/usr/bin/env node
// lane channel-row-notices — HEAVY (chrome, zero vendor calls, no product server): THE ACCOUNT ROW'S NOTICE GRAMMAR (the owner,
// 2026-10-23, on his Channels window: 「这个提示最好不要常驻了，很丑陋；然后为啥我这里提示需要重新授权，重新授权干啥？」 + ADDENDUM 1/2).
// The REAL renderChannelsPanel (an esbuild iife of the tree — the channel-reauth-line harness) in headless chrome, zh, over a
// stub HTTP server whose accounts are SHAPED like the owner's (synthesized — never anyone's data): a Lark account whose push
// lane is parked `sdk-not-installed` and whose paged consent left 248 permissions (a consent from before the names were kept),
// a second Lark account whose consent kept them (next page 115, 3 pages, an agent holds its raw API), a Slack account whose
// sign-in expires in 3 days, and a Gmail account whose sign-in is dead (lane channel-reauth-visible's red line).
// ① desk (1100 px): the parked push lane is ONE short plain line «实时推送未开启 — 消息靠轮询（30 秒–15 分钟）» + ⓘ + 「知道了」 —
// no command anywhere on the row; the 248 line waits under ⓘ; the kept-names account LEADS with its gain «继续授权以获取应用下一组
// 权限（115 个），总计剩余 248 个权限 — 授权后 agent 可通过 API 使用…»; the countdown says when and that one re-authorization
// keeps it (plain); the dead sign-in's red line is unchanged; no line says a bare «需要重新授权»; ② ⓘ opens the fold (the cause,
// where the steps are, the 248 line + 重新授权 → THE account's Re-authorize dialog), and it survives a redraw; ③ 「知道了」 puts
// the line away at once, the user state keeps {account: sig}, a RELOAD draws nothing — ⓘ still reaches the details; ④ the
// state CHANGES (another code) ⇒ the line is back; ⑤ the phone (390 px): nothing wider than the screen, a 36 px ⓘ.
// CONTROL (the bundle rebuilt with the old paragraph): ① is red. RN_SHOTS=<dir> writes desk.png, fold.png and phone.png.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePort, scratch, ONBOARDED_SOURCE } from './scratch.mjs';

const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = process.env.RN_SHOTS || '';
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
let pass = 0, fail = 0;
const ok = (c, msg, detail) => { if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg + (detail ? '\n      ' + String(detail).slice(0, 900) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── the bundle: the REAL panel of the tree (patch = {from, to} rewrites channels-panel.js for the control)
const esbuild = require(path.join(repo, 'node_modules/esbuild'));
const dir = scratch('chan-row-notices');
async function bundle(name, patch = null) {
  const entry = `import { renderChannelsPanel } from ${JSON.stringify(path.join(repo, 'src/lib/channels-panel.js'))};
const hs = new Set();
const app = { ws: { onGlobal: (h) => { hs.add(h); return () => hs.delete(h); }, offGlobal: (h) => hs.delete(h), onStateChange() {}, offStateChange() {} },
  wm: { windows: new Map(), createWindow() { throw new Error('no wm in this harness'); } }, openChannel: (a, id) => { window.__opened = [a, id]; } };
window.__fire = (m) => { for (const h of [...hs]) h(m); };
renderChannelsPanel(app, document.getElementById('host'));`;
  const plugins = patch ? [{ name: 'patch', setup(b) { b.onLoad({ filter: /channels-panel\.js$/ }, (a) => { const s = fs.readFileSync(a.path, 'utf8'); if (!s.includes(patch.from)) throw new Error('patch anchor missing'); return { contents: s.replace(patch.from, patch.to), loader: 'js' }; }); } }] : [];
  await esbuild.build({ stdin: { contents: entry, resolveDir: repo, loader: 'js' }, bundle: true, format: 'iife', platform: 'browser', target: 'es2020', outfile: path.join(dir, name), loader: { '.css': 'empty' }, logLevel: 'error', plugins });
}
await bundle('after.js');
// the CONTROL: the row as it was — the lane's whole remedy sentence as a warning line, no ⓘ, no 「知道了」
await bundle('paragraph.js', { from: '  const pp = pushNoticeParts(a, kinds);\n', to: "  const pp = a.push && a.push.state === 'unavailable' ? { line: noteLine('chan-sec-note', chanCaps.pushLaneText(a.push, a.lane, { t, now: Date.now() }), { warn: true }), details: [] } : null;\n" }).catch((e) => ok(false, 'CONTROL bundle (the old paragraph)', e.message));

// ── the stub server (synthesized — never anyone's data; SHAPED like the owner's accounts)
const LARK_MOD = require(path.join(repo, 'src/channels/lark.js'));
const NOW = Date.now(), H = 3600e3, D = 86400e3;
const at0714 = (() => { const d = new Date(NOW); d.setHours(7, 14, 0, 0); return d.getTime() > NOW ? NOW - H : d.getTime(); })();
const hhmm = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const acct = (id, kind, label, extra = {}) => ({ id, kind, label, connectable: true, enabled: true, auth: { state: 'connected' }, authState: 'ok', authCause: null, authSince: null, presets: [], credentials: [], lastPass: { at: NOW - 30e3, ok: true, code: null }, consecutiveFailures: 0, ...extra });
const more = (o) => ({ what: 'more', scopes: [], missing: [], refused: [], console: false, wanted: true, next: null, pages: null, families: [], api: false, ...o });
const PARKED = { enabled: true, optIn: false, claimedExclusive: 'unknown', state: 'unavailable', lastStateCode: 'sdk-not-installed', lastStateAt: NOW - 600e3, lastStateWhy: 'the official Lark SDK (@larksuiteoapi/node-sdk) is not installed on this instance — `npm install @larksuiteoapi/node-sdk` and restart; until then the poll carries everything', demotedAt: null, missRate: { rate: 0, total: 0, missed: 0, enough: false, threshold: 0.02 }, unavailableWords: { ...LARK_MOD.unavailableWords }, unavailableCauses: { ...LARK_MOD.unavailableCauses } };
const LARK = acct('lark', 'lark', 'Lark / 飞书', { auth: { state: 'connected', user: 'Carol', renews: true, expiresAt: NOW + 6.9 * D, morePending: 248, nextPageCount: null }, lane: { via: 'poll' }, push: PARKED, grants: [more({ n: 248, api: true })] });
const FAMS = [{ family: 'docs', n: 60 }, { family: 'calendar', n: 20 }, { family: 'contacts', n: 15 }, { family: 'approval', n: 10 }, { family: 'other', n: 10 }];
const LARK2 = acct('lark:b', 'lark', 'Lark / 飞书', { auth: { state: 'connected', user: 'Dana', renews: true, expiresAt: NOW + 6.9 * D, morePending: 248, nextPageCount: 115 }, lane: { via: 'poll' }, grants: [more({ n: 248, next: 115, pages: 3, families: FAMS, api: true })] });
const SLACK = acct('slack', 'slack', 'Slack', { auth: { state: 'connected', user: 'Erin', expiresAt: NOW + 3 * D + 60e3 } });
const DEAD = acct('gmail:a', 'gmail', 'Gmail', { auth: { state: 'expired', why: 'refresh-refused', user: 'alice@example.test' }, authState: 'expired', authCause: 'refresh-refused', authSince: at0714, lastPass: { at: NOW - 60e3, ok: false, code: 'auth-expired', error: 'gmail token refresh: Token has been expired or revoked.' }, consecutiveFailures: 4 });
let adapters = [LARK, LARK2, SLACK, DEAD];
const KINDS = [{ kind: 'lark', label: 'Lark / 飞书', integration: 'lark', pushSetup: { steps: LARK_MOD.pushSetup.steps.map((s) => ({ words: s.words, code: s.code || null })), after: LARK_MOD.pushSetup.after } }];
const rowsOf = (id, n, title) => Array.from({ length: n }, (_, i) => ({ key: `${id}/c${i}`, adapterId: id, id: 'c' + i, title: `${title} ${i + 1}`, kind: 'group', lastAt: NOW - (i + 1) * 0.7 * H, lastText: `note ${i + 1}`, unread: 0, freshness: { state: 'live', seconds: 30 } }));
const convs = [...rowsOf('lark', 4, '项目群'), ...rowsOf('lark:b', 3, '设计群'), ...rowsOf('slack', 3, 'channel'), ...rowsOf('gmail:a', 2, 'Thread')];
const digestNow = () => ({ adapters, kinds: KINDS, counts: { all: convs.length, byAdapter: Object.fromEntries(adapters.map((a) => [a.id, convs.filter((c) => c.adapterId === a.id).length])) }, heads: Object.fromEntries(adapters.map((a) => [a.id, convs.filter((c) => c.adapterId === a.id).map((c) => c.key)])), conversations: convs });
// every account section OPEN (lane channels-fold-default folds a quiet account by default — the person's own open wins)
const OPEN_FOLDS = { channelsPanelFolds: Object.fromEntries(adapters.map((a) => [`acct:${a.id}`, false])) };
let userState = { ...OPEN_FOLDS };
const patches = [];
const files = { '/style.css': [path.join(repo, 'public/style.css'), 'text/css'] };
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const json = (o, st = 200) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (u.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(`<!doctype html><html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/style.css"><style>body{margin:0;background:var(--bg-root)} #win{background:var(--bg-window);width:${u.searchParams.get('w') || '520px'};min-height:100vh;box-sizing:border-box;padding:10px 8px}</style><script>try{localStorage.setItem('vibespace.lang','zh')}catch{}</script></head><body><div id="win"><div id="host" class="rail-panel rail-panel-channels chan-window"></div></div><script src="/${u.searchParams.get('b') || 'after.js'}"></script></body></html>`); return; }
  if (/^\/[a-z]+\.js$/.test(u.pathname) && fs.existsSync(path.join(dir, u.pathname.slice(1)))) { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(fs.readFileSync(path.join(dir, u.pathname.slice(1)))); return; }
  if (files[u.pathname]) { res.writeHead(200, { 'Content-Type': files[u.pathname][1] }); res.end(fs.readFileSync(files[u.pathname][0])); return; }
  if (u.pathname === '/api/channels') return json(digestNow());
  if (u.pathname === '/api/channels/rows') { const ad = u.searchParams.get('adapter') || u.searchParams.get('adapterId') || ''; const rows = convs.filter((c) => !ad || c.adapterId === ad); return json({ rows, next: null, total: rows.length }); }
  if (u.pathname === '/api/channel-groups') return json({ groups: [] });
  if (u.pathname === '/api/user-state') {
    if (req.method === 'GET') return json(userState);
    let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { try { const p = JSON.parse(b || '{}'); patches.push(p); userState = { ...userState, ...p }; } catch {} json({ ok: true }); }); return;
  }
  json({ error: 'not in this harness' }, 404);
});
const PORT = await freePort();
await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));
const CDP_PORT = await freePort();
const chromeDir = scratch('chan-row-notices-chrome');
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--font-render-hinting=none', `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => { try { chrome.kill('SIGKILL'); } catch {} try { srv.close(); } catch {} for (const d of [chromeDir, dir]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} } };
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
const WebSocket = require(path.join(repo, 'node_modules/ws'));
for (let i = 0; i < 120; i++) { try { await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json(); break; } catch { await sleep(250); } }
async function page(w, h, query) {
  const tg = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(tg.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r) => ws.on('open', r));
  let seq = 0; const pend = new Map();
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const cdp = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: w < 600 });
  const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error('page threw: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 600)); return r.result?.result?.value; };
  const load = async () => {
    await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/?${query}` });
    for (let i = 0; i < 80; i++) { await sleep(150); if (await ev(`document.querySelectorAll('.chan-account .chan-sec-head').length === ${adapters.length}`).catch(() => false)) break; }
    await sleep(300);
  };
  await load();
  const shot = async (file) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); const [ww, hh] = await ev(`(() => { const b = document.getElementById('win').getBoundingClientRect(); return [Math.ceil(b.width), Math.ceil(Math.min(b.scrollHeight || b.height, 1400))]; })()`); const r = await cdp('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: ww, height: hh, scale: 1 }, captureBeyondViewport: true }); fs.writeFileSync(path.join(SHOTS, file), Buffer.from(r.result.data, 'base64')); };
  return { ev, shot, load, close: () => { try { ws.close(); } catch {} } };
}

// every account section as drawn: its visible lines (words, warn, verbs), the push line, the ⓘ toggles, the fold
const SECS = `(() => {
  const vis = (el) => !!el && el.getBoundingClientRect().height > 0 && getComputedStyle(el).display !== 'none' && !el.closest('[hidden]');
  const txt = (el) => (el.querySelector('.chan-note-text, .chan-sec-health-text, .chan-sec-reauth-text') || el).textContent;
  const out = {};
  for (const s of document.querySelectorAll('.chan-account[data-adapter]')) {
    const lines = [...s.querySelectorAll('.chan-sec-note, .chan-sec-health, .chan-sec-reauth')].map((n) => ({ text: txt(n), shown: vis(n), warn: n.classList.contains('chan-warn'), folded: !!n.closest('.chan-sec-details'), verbs: [...n.querySelectorAll('button')].map((b) => b.textContent || b.getAttribute('aria-label')), push: n.dataset.chanPush || null, grants: n.dataset.chanGrants || null, expiring: n.dataset.chanExpiring || null, red: n.classList.contains('chan-sec-reauth'), h: Math.round(((n.querySelector('.chan-note-text') || n).getBoundingClientRect()).height) }));
    const fold = s.querySelector('.chan-sec-details');
    const infos = [...s.querySelectorAll('.chan-sec-info')];
    out[s.dataset.adapter] = { lines, shownText: lines.filter((l) => l.shown).map((l) => l.text), visibleAll: s.innerText, fold: fold ? { open: vis(fold), text: fold.textContent } : null, infos: infos.map((b) => ({ exp: b.getAttribute('aria-expanded'), w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height), inPush: !!b.closest('[data-chan-push]'), inHealth: !!b.closest('.chan-sec-health') })), right: Math.round(s.getBoundingClientRect().right) };
  }
  return { secs: out, vw: document.documentElement.clientWidth, sw: document.documentElement.scrollWidth };
})()`;
const LINE = '实时推送未开启 — 消息靠轮询（30 秒–15 分钟）';
const PAGED_OLD = '继续授权以获取应用下一组权限，总计剩余 248 个权限（具体是哪些，授权时才知道）；现在的收发消息不受影响';
const PAGED_KEPT = '继续授权以获取应用下一组权限（115 个），总计剩余 248 个权限 — 授权后 agent 可通过 API 使用云文档、日历、通讯录、审批…；现在的收发消息不受影响';
const COMMAND = /npm|@larksuiteoapi|im:message\.group_msg|`/;
const BARE = /^(需要重新授权|needs re-authorization)\s*(\(|（|$)/;
const pushOf = (S, id) => S.secs[id].lines.find((l) => l.push === id) || null;
const first = (S, label) => {
  const L = S.secs.lark, L2 = S.secs['lark:b'], SL = S.secs.slack, G = S.secs['gmail:a'];
  const p = pushOf(S, 'lark');
  ok(p && p.shown && p.text === LINE && !p.warn && p.h <= 20 && p.verbs.includes('知道了') && p.verbs.includes('详情'), `${label} ① the parked push lane is ONE short plain line «${p && p.text}» (${p && p.h} px) + ⓘ + 「知道了」`, JSON.stringify(p));
  ok(L && !COMMAND.test(L.visibleAll) && !L.shownText.some((x) => /248/.test(x)) && L.fold && !L.fold.open && L.infos.some((b) => b.inHealth) && L.infos.every((b) => b.exp === 'false'), `${label} ① no command anywhere on the row (no npm, no scope, no backtick); the 248 line waits under ⓘ (closed); the health line carries ⓘ`, JSON.stringify({ visible: L && L.visibleAll, fold: L && L.fold }));
  const g2 = L2 && L2.lines.find((l) => l.grants === 'lark:b');
  ok(g2 && g2.shown && !g2.folded && g2.text === PAGED_KEPT && !g2.warn && g2.verbs.includes('重新授权'), `${label} ① the account whose consent kept the names LEADS with the gain (plain) + 「重新授权」: «${g2 && g2.text}»`, JSON.stringify(g2));
  const ex = SL && SL.lines.find((l) => l.expiring === 'slack');
  ok(ex && ex.shown && /^登录将在 .+ 后到期 — 到期前再授权一次即可$/.test(ex.text) && !ex.warn && ex.verbs.includes('重新授权'), `${label} ① the countdown says when and what keeps it, plain: «${ex && ex.text}»`, JSON.stringify(ex));
  const red = G && G.lines.find((l) => l.red);
  ok(red && red.shown && red.text === `登录失效 — 需要重新授权 · 服务方拒绝了刷新令牌 · 始于 ${hhmm(at0714)}` && red.verbs.includes('重新连接'), `${label} ① the dead sign-in's red line (lane channel-reauth-visible) is unchanged: «${red && red.text}»`, JSON.stringify(red));
  const all = Object.values(S.secs).flatMap((s) => s.lines.map((l) => l.text));
  ok(all.length > 8 && all.every((x) => !BARE.test(String(x).trim())), `${label} ① RED CONTROL: none of the ${all.length} lines is a bare «需要重新授权»`, JSON.stringify(all));
  ok(S.sw <= S.vw && Object.values(S.secs).every((s) => s.right <= S.vw), `${label} nothing wider than the screen`, JSON.stringify({ vw: S.vw, sw: S.sw }));
};

console.log('§1 desk (1100 px, zh, light): the rows of four accounts shaped like the owner\'s');
const d = await page(1100, 1000, 'b=after.js');
first(await d.ev(SECS), 'desk');
await d.shot('desk.png');

console.log('§2 ⓘ opens the fold: the cause, where the steps are, the 248 line — and it survives a redraw');
await d.ev(`(() => { document.querySelector('[data-chan-push="lark"] .chan-sec-info').click(); return 1; })()`);
await sleep(150);
let S = await d.ev(SECS);
const F = S.secs.lark;
const fl = F.lines.filter((l) => l.folded && l.shown).map((l) => l.text);
ok(F.fold && F.fold.open && fl.includes('本实例没有安装飞书官方 SDK。') && fl.includes('不会漏消息：每条消息仍靠轮询收到。') && fl.some((x) => /实时推送（可选）/.test(x) && /诊断/.test(x)) && fl.includes(PAGED_OLD) && F.infos.every((b) => b.exp === 'true'), '② the fold says the cause, that nothing is lost, where the steps are (the setup card + Diagnostics) and the 248 line; both ⓘ say expanded', JSON.stringify({ fl, infos: F.infos }));
ok(!COMMAND.test(F.visibleAll), '② …and still no command on the row (the install steps are the setup card\'s)', F.visibleAll);
await d.shot('fold.png');
await d.ev(`(() => { window.__fire({ type: 'channels-updated', digest: { partial: true, conversations: [], adapters: ${JSON.stringify(adapters)} } }); return 1; })()`);
await sleep(500);
S = await d.ev(SECS);
ok(S.secs.lark.fold && S.secs.lark.fold.open, '② a redraw (a broadcast) keeps the fold open (per page session)', JSON.stringify(S.secs.lark.fold));
await d.ev(`(() => { const b = [...document.querySelectorAll('.chan-account[data-adapter="lark"] .chan-sec-details button')].find((x) => x.textContent === '重新授权'); b.click(); return 1; })()`);
let dlg = null;
for (let i = 0; i < 20 && !dlg; i++) { await sleep(150); dlg = await d.ev(`(() => { const x = document.getElementById('chan-reauth-dialog'); return x ? (x.textContent || '').slice(0, 200) : null; })()`); }
ok(dlg && /重新授权/.test(dlg), '② the 248 line\'s 「重新授权」 opens THE account\'s Re-authorize dialog', dlg);
await d.ev(`(() => { const x = document.getElementById('chan-reauth-dialog'); const c = x && (x.closest('.modal-overlay, .dialog-overlay') || x); if (c) c.remove(); return 1; })()`);

console.log('§3 「知道了」 puts the line away — kept per instance, a reload draws nothing');
await d.ev(`(() => { document.querySelector('[data-chan-push="lark"] .chan-push-ack').click(); return 1; })()`);
await sleep(300);
S = await d.ev(SECS);
ok(!pushOf(S, 'lark') && patches.length >= 1 && userState.channelsNoticesSeen && userState.channelsNoticesSeen.lark === 'unavailable:sdk-not-installed', `③ the line is gone at once; the user state keeps {lark: '${userState.channelsNoticesSeen && userState.channelsNoticesSeen.lark}'}`, JSON.stringify({ patches, push: pushOf(S, 'lark') }));
d.close();
const r = await page(1100, 1000, 'b=after.js');
S = await r.ev(SECS);
ok(!pushOf(S, 'lark') && S.secs.lark.infos.some((b) => b.inHealth), '③ after a RELOAD the put-away line stays away; the health line\'s ⓘ is still there', JSON.stringify(S.secs.lark.lines));
await r.ev(`(() => { document.querySelector('.chan-account[data-adapter="lark"] .chan-sec-health .chan-sec-info').click(); return 1; })()`);
await sleep(150);
S = await r.ev(SECS);
ok(S.secs.lark.fold.open && S.secs.lark.lines.some((l) => l.folded && l.shown && l.text === '本实例没有安装飞书官方 SDK。'), '③ …and ⓘ still reaches the details of the state that was put away', JSON.stringify(S.secs.lark.fold));
r.close();

console.log('§4 the state CHANGES ⇒ the line is back');
LARK.push = { ...PARKED, lastStateCode: 'needs-credentials', lastStateWhy: 'no usable app credential' };
const c4 = await page(1100, 1000, 'b=after.js');
S = await c4.ev(SECS);
const p4 = pushOf(S, 'lark');
ok(p4 && p4.shown && p4.text === LINE && p4.verbs.includes('知道了'), '④ another code (the SDK appeared, then the credential failed): the line is shown again', JSON.stringify(p4));
c4.close();
LARK.push = PARKED; userState = { ...OPEN_FOLDS };

console.log('§5 phone (390 px): the same lines, nothing wider, a 36 px ⓘ');
const ph = await page(390, 844, 'b=after.js&w=100%25');
first(await ph.ev(SECS), 'phone');
const PI = (await ph.ev(SECS)).secs.lark.infos;
ok(PI.length >= 2 && PI.every((b) => b.w >= 36 && b.h >= 36), `phone ⑤ every ⓘ is a 36 px target (${PI.map((b) => `${b.w}×${b.h}`).join(', ')})`, JSON.stringify(PI));
await ph.shot('phone.png');
ph.close();

console.log('§6 CONTROL: the bundle rebuilt with the old paragraph');
if (fs.existsSync(path.join(dir, 'paragraph.js'))) {
  const c = await page(1100, 1000, 'b=paragraph.js');
  const X = await c.ev(SECS);
  const xp = X.secs.lark.lines.find((l) => l.shown && /npm install/.test(l.text));
  ok(xp && xp.warn && COMMAND.test(X.secs.lark.visibleAll) && !pushOf(X, 'lark'), 'CONTROL: the old row draws the install paragraph as a warning (commands on the row, no 「知道了」) — leg ① would be red', JSON.stringify(xp));
  c.close();
}
// chrome's helpers outlive a SIGKILL of its parent by a moment and re-create the profile dir: wait for the exit, then sweep
try { chrome.kill('SIGKILL'); } catch {}
await new Promise((r) => { if (chrome.exitCode !== null || chrome.signalCode) r(); else { chrome.once('exit', r); setTimeout(r, 3000); } });
await sleep(500);
cleanup();
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass} passed, 0 failed)`);
process.exit(fail ? 1 : 0);
