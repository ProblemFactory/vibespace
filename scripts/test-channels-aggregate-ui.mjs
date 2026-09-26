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
//     "（账号）"; the conversation window's chip says it too
//   ⑥ zero Latin-only "Track"/"tracked" words on the panel and the window
//
// Per-pid scratch (scripts/scratch.mjs); the server gets vncEnv() (§57), a
// scratch HOME, VIBESPACE_CHANNELS_FAKE=1 and VIBESPACE_CHANNELS_FAKE_CONVS=3
// (the fake world's synthetic rooms carry attachments). Zero vendor calls.
// Run: node scripts/test-channels-aggregate-ui.mjs   (SKIPs without chrome)
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
const acl = await api('GET', '/api/channels');
ok((acl.json.conversations || []).filter((c) => c.adapterId === 'fake-poll').every((c) => c.assignment && c.assignment.source === 'account'), 'the wire agrees: every row\'s effective assignment comes from the account grain');

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
