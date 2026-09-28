#!/usr/bin/env node
// THE CHANNELS PANEL REDRAWS IN PLACE (verify round 4, 2026-09-27; gate row
// `test-channels-panel-redraw`, heavy tier — a real worktree server on a store
// seeded with ONE disabled Lark account of 879 conversations, zero vendor calls,
// headless chrome, the UI in ZH).
//
// Round 3 measured the panel's redraw at 100 ms over 879 rows with "Show all"
// open and judged it LOW. Round 4 measured what that means: `draw()` rebuilt
// EVERY row and replaced the root on EVERY `channels-updated` broadcast — a
// PARTIAL digest naming ONE row cost 90–115 ms of main thread (the JS build
// AND the re-layout of the re-attached 879-row lists), 37 % of the thread and a
// 108 ms p95 frame at four broadcasts a second, a 100 ms hitch per pass during a
// first ingest — and, the rows detached, a click in flight on one was dropped
// (the picker's round-4 lesson). Now the group list, every part, every account
// section and its rows box are KEPT across draws and reconciled (`reconcile`:
// a node already where it belongs is never touched), rows are memoised by key +
// signature: 2–4 ms, 1.7 % of the thread under the same storm.
//
//   ① the panel over 879 conversations, "Show all" open on the first screen and
//     the account card (1 758 rows drawn)
//   ② a WHOLE digest redraw and a PARTIAL digest naming ONE row: < BOUND ms
//     each; the row nodes, the rows box, the group list and the part are the
//     very same elements afterwards
//   ③ twenty broadcasts 250 ms apart: the handler's busy share of the wall
//     < 15 %
//   ④ a TRUSTED click (CDP) on a row with a broadcast between the press and
//     the release still opens its conversation (the row was never detached)
//   ⑤ a collapsed account section stays collapsed across a redraw; a row that
//     left the digest leaves the list
//   ⑥ CONTROL: the scratch copy's bundle rebuilt with `reconcile` replaced by
//     `replaceChildren` (the round-3 draw) — the same partial digest ≥ 4×
//     slower, and the same trusted click across a broadcast LOST
// Run: node scripts/test-channels-panel-redraw.mjs   (SKIPs without chrome)
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
const PORT = await freePort(), CDP_PORT = await freePort();
const wt = scratch('chan-panel-redraw');
const fakeHome = scratchHome('chan-panel-redraw-home', fs);
const chromeDir = scratch('chan-panel-redraw-chrome');
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = (x) => JSON.stringify(x);
/** The redraw bound: measured 2–4 ms here after the fix (90–115 before), ×10 slack for a loaded runner. */
const BOUND_MS = 40;
const N = 879;

try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin']) { fs.rmSync(path.join(wt, f), { recursive: true, force: true }); fs.cpSync(path.join(repo, f), path.join(wt, f), { recursive: true }); }
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.writeFileSync(path.join(wt, 'src/lib/build-version.js'), `export const BUILD_VERSION = ${JSON.stringify(require(path.join(repo, 'package.json')).version)};\n`);
const bundle = () => execSync('npx esbuild src/client.js --bundle --outfile=public/bundle.js --format=iife --platform=browser --target=es2020 --loader:.css=css', { cwd: wt, stdio: 'ignore' });
bundle();

// ── the SEED: 879 conversations of one disabled Lark account (the real adapter's toRecord over invented items) ──
const W = (rel) => require(path.join(wt, rel));
const { createChannelStore } = W('src/channel-store.js');
const lark = W('src/channels/lark.js');
const NOW = Date.now(), MIN = 60e3;
const larkItem = (id, at, msg_type, content, extra = {}) => ({ message_id: id, msg_type, create_time: String(at), chat_id: 'oc_x', sender: { id: 'ou_ada', sender_type: 'user' }, body: { content: JSON.stringify(content) }, ...extra });
const names = new Map([['ou_ada', 'Ada']]);
{
  const store = createChannelStore({ dir: path.join(wt, 'data/channels'), log: { log() {}, warn() {}, error() {} } });
  const acct = (id, kind, label, scopes) => ({ id, kind, label, enabled: false, auth: { tokenEnc: null, expiresAt: null, scopes, user: null }, lastPass: null, consecutiveFailures: 0, push: { enabled: false, claimedExclusive: 'unknown', state: null, lastEventAt: null, missRate: 0, demotedAt: null, demotedWhy: null, samples: [] }, scan: null });
  await store.adapters.update((ad) => { ad.adapters.push(acct('lark', 'lark', 'Lark', ['im:message', 'im:chat:readonly'])); });
  const caps = { read: 'yes', sendAs: ['user'], why: null, at: NOW };
  await store.index.update(() => { for (let i = 0; i < N; i++) { const en = store.index.entry('lark', 'oc_' + i); en.title = 'Room ' + i; en.kind = 'group'; en.convCaps = caps; en.lastAt = NOW - i * MIN; en.listedAt = NOW; en.unread = i % 7 === 0 ? 2 : 0; } });
  for (let i = 0; i < N; i++) store.appendRecords('lark', 'oc_' + i, [lark.toRecord('lark', 'oc_' + i, larkItem('om_' + i, NOW - i * MIN, 'text', { text: 'last message of room ' + i }), { names })]);
  store.index.flush && store.index.flush(); store.close && store.close();
}

const boot = () => spawn(process.execPath, ['server.js'], { cwd: wt, stdio: 'ignore', env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' } });
const srv = boot();
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1400,1000', '--disable-background-timer-throttling', `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv.kill('SIGKILL'); } catch {}
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  for (const d of [chromeDir, fakeHome]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
};
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
const waitServer = async () => { for (let i = 0; i < 160; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); return true; } catch { await sleep(250); } } return false; };
ok(await waitServer(), 'the worktree server booted on the seeded store');
const api = async (method, p, body) => { const r = await fetch(`http://127.0.0.1:${PORT}${p}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }); let j = {}; try { j = await r.json(); } catch {} return { status: r.status, json: j }; };
const WebSocket = require(path.join(repo, 'node_modules/ws'));
for (let i = 0; i < 120; i++) { try { await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json(); break; } catch { await sleep(250); } }
async function newPage() {
  const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' });
  const tg = await r.json();
  const ws = new WebSocket(tg.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
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
    await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
    await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "try { localStorage.setItem('vibespace.lang', 'zh'); } catch {}" });
    await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
    for (let i = 0; i < 160; i++) { try { if (await evaljs("!!(window.app && window.app.wm && window.app.sidebar && window.app.openChannel) && !document.getElementById('loading-screen')")) return true; } catch {} await sleep(250); }
    return false;
  };
  return { cdp, evaljs, load, close: () => { try { ws.close(); } catch {} } };
}

const digest = (await api('GET', '/api/channels')).json;
ok(Array.isArray(digest.conversations) && digest.conversations.length === N, `FIXTURE: the digest holds ${N} conversations`);
const OPEN = `(async () => {
  const btn = document.querySelector('[data-rail="channels"], [data-tab="channels"]');
  if (btn) btn.click();
  for (let i = 0; i < 100 && !document.querySelector('.chan-row, .chan-grow'); i++) await new Promise((r) => setTimeout(r, 100));
  // the ALL view (the attention list is short by construction) + every "Show all"
  const seg = [...document.querySelectorAll('.chan-view-btn')].find((x) => x.getAttribute('aria-pressed') === 'false');
  if (seg) { seg.click(); await new Promise((r) => setTimeout(r, 200)); }
  for (let k = 0; k < 4; k++) { const b = [...document.querySelectorAll('button')].find((x) => /显示全部|Show all/.test(x.textContent)); if (!b) break; b.click(); await new Promise((r) => setTimeout(r, 300)); }
  return { grows: document.querySelectorAll('.chan-grow').length, rows: document.querySelectorAll('.chan-row').length };
})()`;
/** The measurement, run in the page: identity across a whole and a partial digest, the times, a 250 ms storm. */
const MEASURE = (d) => `(async () => {
  const d = ${J(d)};
  const one = { ...d, partial: true, conversations: d.conversations.slice(0, 1) };
  const fire = (dd) => { for (const fn of window.app.ws.globalHandlers) { try { fn({ type: 'channels-updated', digest: dd, partial: !!dd.partial }); } catch (e) {} } };
  const snap = () => ({ grows: [...document.querySelectorAll('.chan-grow')], rows: [...document.querySelectorAll('.chan-row')], box: document.querySelector('.chan-rows'), list: document.querySelector('.chan-groups'), part: document.querySelector('.chan-part[data-part="accounts"]'), sec: document.querySelector('.chan-sec.chan-account') });
  fire(d); await new Promise((r) => setTimeout(r, 50));
  const s0 = snap();
  // the handler AND the layout it left dirty (a forced read right after — what the next frame pays)
  const ms = (dd) => { const t0 = performance.now(); fire(dd); void document.body.offsetHeight; return performance.now() - t0; };
  const whole = [ms(d), ms(d), ms(d)];
  const partial = [ms(one), ms(one), ms(one)];
  const s1 = snap();
  const same = (a, b) => a.length > 0 && a.length === b.length && a.every((x, i) => x === b[i]);
  const gaps = []; let last = performance.now(); let stop = false;
  const tick = () => { const n = performance.now(); gaps.push(n - last); last = n; if (!stop) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  const t0 = performance.now(); let n = 0, busy = 0;
  await new Promise((res) => { const iv = setInterval(() => { const a = performance.now(); fire(n % 2 ? one : d); void document.body.offsetHeight; busy += performance.now() - a; if (++n >= 20) { clearInterval(iv); res(); } }, 250); });
  stop = true;
  const wall = performance.now() - t0;
  return { grows: s0.grows.length, rows: s0.rows.length, whole: whole.map((x) => Math.round(x * 10) / 10), partial: partial.map((x) => Math.round(x * 10) / 10), sameGrows: same(s0.grows, s1.grows), sameRows: same(s0.rows, s1.rows), sameBox: !!s0.box && s0.box === s1.box, sameList: !!s0.list && s0.list === s1.list, samePart: !!s0.part && s0.part === s1.part, sameSec: !!s0.sec && s0.sec === s1.sec, storm: { n, busyMs: Math.round(busy), wallMs: Math.round(wall), share: Math.round(1000 * busy / wall) / 10, longGaps: gaps.filter((g) => g > 50).length, p95: Math.round(gaps.sort((a, b) => a - b)[Math.floor(gaps.length * 0.95)] || 0) } };
})()`;
/** A trusted click on a row with a broadcast between the press and the release: does its window open? */
async function clickAcrossBroadcast(p, d) {
  const pt = await p.evaljs(`(() => { const rows = [...document.querySelectorAll('.chan-row')]; const row = rows[Math.min(5, rows.length - 1)]; row.scrollIntoView({ block: 'center' }); const r = row.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), conv: row.dataset.conv, wins: window.app.wm.windows ? window.app.wm.windows.size : Object.keys(window.app.wm._windows || {}).length }; })()`);
  await p.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y });
  await p.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  await p.evaljs(`(() => { const d = ${J(d)}; for (const fn of window.app.ws.globalHandlers) { try { fn({ type: 'channels-updated', digest: d }); } catch (e) {} } return 1; })()`);
  await sleep(40);
  await p.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  await sleep(400);
  const opened = await p.evaljs(`(() => { const n = document.querySelectorAll('.chanwin').length; for (const w of [...(window.app.wm.windows ? window.app.wm.windows.values() : [])]) { if (w.content && w.content.querySelector('.chanwin')) window.app.wm.closeWindow(w.id); } return { chanWindows: n }; })()`);
  return { ...pt, ...opened };
}

// ═══ ① ② ③ the fixed panel ═══
console.log('① ② ③ the panel over 879 conversations: a whole and a partial redraw in place, the storm');
const p1 = await newPage();
ok(await p1.load(), 'the page loaded');
const O = await p1.evaljs(OPEN);
ok(O.grows >= N && O.rows >= N, `FIXTURE: "Show all" open on the first screen (${O.grows} rows) and the account card (${O.rows} rows)`, J(O));
const M = await p1.evaljs(MEASURE(digest));
console.log(`    (measured: whole ${M.whole.join(' / ')} ms · partial ${M.partial.join(' / ')} ms · storm ${M.storm.busyMs} ms busy of ${M.storm.wallMs} = ${M.storm.share} %, long frames ${M.storm.longGaps}, p95 ${M.storm.p95} ms)`);
ok(M.whole.every((x) => x < BOUND_MS) && M.partial.every((x) => x < BOUND_MS), `② a whole digest and a partial digest naming ONE row each redraw the 1 758-row panel in < ${BOUND_MS} ms (whole ${M.whole.join(' / ')}, partial ${M.partial.join(' / ')} — 90–115 ms before the fix)`, J(M));
ok(M.sameGrows && M.sameRows && M.sameBox && M.sameList && M.samePart && M.sameSec, '② every row, the rows box, the group list, the Accounts part and the account section are the SAME elements after the redraws (kept and reconciled, never rebuilt)', J(M));
ok(M.storm.n === 20 && M.storm.share < 15, `③ twenty broadcasts 250 ms apart keep the handler's share of the main thread under 15 % (${M.storm.share} % — 37 % before the fix)`, J(M.storm));
// ═══ ④ the trusted click across a broadcast ═══
console.log('④ a trusted click on a row with a broadcast between the press and the release');
const C = await clickAcrossBroadcast(p1, digest);
ok(C.chanWindows >= 1, `④ the click on ${C.conv} across a broadcast OPENED its conversation (${C.chanWindows} window) — the row was never detached`, J(C));
// ═══ ⑤ fold state + a row that left ═══
console.log('⑤ a collapsed account stays collapsed across a redraw; a row that left the digest leaves the list');
const F = await p1.evaljs(`(async () => {
  const d = ${J(digest)};
  const fire = (dd) => { for (const fn of window.app.ws.globalHandlers) { try { fn({ type: 'channels-updated', digest: dd, partial: !!dd.partial }); } catch (e) {} } };
  const sec = document.querySelector('.chan-sec.chan-account');
  sec.querySelector('.chan-sec-head').click();
  const folded0 = sec.classList.contains('chan-collapsed');
  fire(d); await new Promise((r) => setTimeout(r, 50));
  const sec1 = document.querySelector('.chan-sec.chan-account');
  const folded1 = sec1.classList.contains('chan-collapsed');
  sec1.querySelector('.chan-sec-head').click();
  const gone = { ...d, conversations: d.conversations.filter((c) => c.id !== 'oc_3') };
  fire(gone); await new Promise((r) => setTimeout(r, 50));
  const left = !document.querySelector('.chan-row[data-conv="lark/oc_3"]') && !document.querySelector('.chan-grow[data-grow$="/oc_3"], .chan-grow[data-grow="oc_3"]');
  const back = document.querySelectorAll('.chan-row').length;
  fire(d); await new Promise((r) => setTimeout(r, 50));
  return { folded0, folded1, same: sec === sec1, left, back, rows: document.querySelectorAll('.chan-row').length };
})()`);
ok(F.folded0 && F.folded1 && F.same, '⑤ a collapsed account section stays collapsed across a redraw (the same element, its class kept)', J(F));
ok(F.left && F.back === N - 1 && F.rows === N, '⑤ a conversation that left the digest leaves both lists; back in the digest, it is back', J(F));
// ═══ ⑤b THE SIGNATURE NAMES WHAT THE ROW PRINTS (verify round 5, 2026-09-27) ═══
// round 4 signed `assignment` (the first watcher / access row) but line 3 prints the WHOLE access + watchers lists:
// a second principal granted access never reached the memoised row (reproduced against the live route)
console.log('⑤b a second principal granted access reaches the row\'s line 3 (the memo signature names access + watchers)');
const withAccess = (d, ids) => ({ ...d, partial: true, conversations: d.conversations.filter((c) => c.id === 'oc_5').map((c) => ({ ...c, access: ids.map((id) => ({ principal: { kind: 'group', id, name: id }, authority: 'draft', source: 'conversation' })), watchers: [], assignment: { principal: { kind: 'group', id: ids[0], name: ids[0] }, mode: null, notify: null, digestMinutes: null, dailyWakeCap: null, authority: 'draft', authorityStored: 'draft', authorityClamped: false, authorityWhy: null, authorityWhyCap: null, source: 'conversation', patternId: null, patternLabel: null, hits7d: 0 } })) });
const ACC = await p1.evaljs(`(async () => {
  const d = ${J(digest)};
  const fire = (dd) => { for (const fn of window.app.ws.globalHandlers) { try { fn({ type: 'channels-updated', digest: dd, partial: !!dd.partial }); } catch (e) {} } };
  const line = () => { const r = document.querySelector('.chan-row[data-conv="lark/oc_5"]'); const a = r && r.querySelector('.chan-row-assign'); return a ? a.textContent : null; };
  const row = () => document.querySelector('.chan-row[data-conv="lark/oc_5"]');
  fire(${J(withAccess(digest, ['Alpha']))}); await new Promise((r) => setTimeout(r, 50));
  const one = line(), r1 = row();
  fire(${J(withAccess(digest, ['Alpha', 'Beta']))}); await new Promise((r) => setTimeout(r, 50));
  const two = line(), r2 = row();
  fire(${J(withAccess(digest, ['Alpha', 'Beta', 'Gamma']))}); await new Promise((r) => setTimeout(r, 50));
  const three = line(), r3 = row();
  fire(${J(withAccess(digest, ['Alpha', 'Beta', 'Gamma']))}); await new Promise((r) => setTimeout(r, 50));
  const again = row();
  fire(d); await new Promise((r) => setTimeout(r, 50));
  return { one, two, three, rebuilt: r1 !== r2 && r2 !== r3, kept: r3 === again, after: line() };
})()`);
ok(/Alpha/.test(ACC.one || '') && !/Beta/.test(ACC.one || '') && /Alpha/.test(ACC.two || '') && /Beta/.test(ACC.two || '') && /Gamma/.test(ACC.three || ''), `⑤b line 3 follows the access list — one, two, three principals in turn (the assignment — the FIRST row — never changed; round 4's signature kept "Alpha" for ever): ${J([ACC.one, ACC.two, ACC.three])}`, J(ACC));
ok(ACC.rebuilt && ACC.kept && ACC.after === null, '⑤b …the row is rebuilt when its facts change and KEPT when they do not (the same digest again = the same element); the plain digest takes line 3 away', J(ACC));
// ═══ ⑤c THE ACCOUNT HEAD SURVIVES A BROADCAST TOO (verify round 5) ═══
// the rows were memoised in round 4, but the section HEAD (the fold, ⋯), the grain lines and "Show all" were rebuilt
// per draw — a trusted click on ⋯ across a broadcast opened no menu, a click on the head toggled no fold (reproduced)
console.log('⑤c a trusted click on the account head\'s ⋯ (and on the head itself) across a broadcast lands');
/** A trusted click on `sel` with a partial broadcast between the press and the release: what happened? */
async function clickHeadAcross(p, d, sel, bc) {
  const pt = await p.evaljs(`(() => { const e = document.querySelector(${J(sel)}); if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); window.__m0 = document.querySelectorAll('.context-menu').length; window.__c0 = document.querySelector('.chan-sec.chan-account').classList.contains('chan-collapsed'); window.__h0 = document.querySelector('.chan-sec.chan-account .chan-sec-head'); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  if (!pt) return { found: false };
  await p.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y });
  await p.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  // `bc`: false = no broadcast; true = a partial digest naming ONE row unchanged (round 5); 'unread' = the same row with
  // its unread +1 — the head's COUNT title changes ("{n} conversations · {k} unread"), what every message brings (round 6)
  if (bc) { await p.evaljs(`(() => { const d = ${J(d)}; const rows = d.conversations.slice(0, 1).map((c) => (${J(bc === 'unread')} ? { ...c, unread: (Number(c.unread) || 0) + 1 + Math.floor(Math.random() * 1000) } : c)); const one = { ...d, partial: true, conversations: rows }; for (const fn of window.app.ws.globalHandlers) { try { fn({ type: 'channels-updated', digest: one, partial: true }); } catch (e) {} } return 1; })()`); await sleep(40); }
  await p.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  await sleep(300);
  return p.evaljs(`(() => { const menus = document.querySelectorAll('.context-menu').length - window.__m0; const mm = document.querySelector('.context-menu'); const at = mm ? [Math.round(mm.getBoundingClientRect().left), Math.round(mm.getBoundingClientRect().top)] : null; const sec = document.querySelector('.chan-sec.chan-account'); const toggled = sec.classList.contains('chan-collapsed') !== window.__c0; const sameHead = sec.querySelector('.chan-sec-head') === window.__h0; for (const m of document.querySelectorAll('.context-menu')) m.remove(); if (sec.classList.contains('chan-collapsed')) sec.querySelector('.chan-sec-head').click(); return { found: true, menus, at, toggled, sameHead }; })()`);
}
const H0 = await clickHeadAcross(p1, digest, '.chan-sec.chan-account .chan-sec-more', false);
const H1 = await clickHeadAcross(p1, digest, '.chan-sec.chan-account .chan-sec-more', true);
const H2 = await clickHeadAcross(p1, digest, '.chan-sec.chan-account .chan-sec-name', true);
ok(H0.found && H0.menus === 1, 'FIXTURE (⑤c): a plain trusted click on the account head\'s ⋯ opens its menu', J(H0));
ok(H1.found && H1.menus === 1 && H1.sameHead && J(H1.at) === J(H0.at) && H0.at && H0.at[1] > 20, `⑤c the ⋯ click ACROSS a broadcast opens the menu — the head rebuilt the same is the same element (reconcile keeps an equal node, handlers refreshed), and the menu opens UNDER the button (${J(H1.at)} = the plain click's ${J(H0.at)}; an adopted handler anchored on its fresh, detached button would open it at the corner)`, J([H0, H1]));
ok(H2.found && H2.toggled && H2.sameHead, '⑤c the head click ACROSS a broadcast toggles the fold', J(H2));
// ⑤d THE HEAD IS A KEPT NODE, PATCHED IN PLACE (verify round 6, 2026-09-27): a broadcast that CHANGES the count's title
// (a conversation's unread +1 — every message a pass brings on a busy account) made round 5's rebuilt head UNEQUAL, so it
// was replaced and a trusted 300 ms press on ⋯ across it was lost (3/3 reproduced; 10 % of presses at a message every
// 3 s, 70 % under the ingest storm). The head is built once per account and patched: the same element, the new title.
console.log('⑤d a trusted click on ⋯ across a broadcast that CHANGES the head\'s count lands, the title patched in place');
const H4 = await clickHeadAcross(p1, digest, '.chan-sec.chan-account .chan-sec-more', 'unread');
const T4 = await p1.evaljs(`(() => document.querySelector('.chan-sec.chan-account .chan-sec-count').title)()`);
ok(H4.found && H4.menus === 1 && H4.sameHead && J(H4.at) === J(H0.at) && /未读|unread/.test(T4), `⑤d the ⋯ click across an unread-changing broadcast opens the menu under the button — the SAME head element, its count title now "${T4}"`, J([H4, T4]));
const H5 = await clickHeadAcross(p1, digest, '.chan-sec.chan-account .chan-sec-name', 'unread');
ok(H5.found && H5.toggled && H5.sameHead, '⑤d the head click across an unread-changing broadcast toggles the fold', J(H5));
p1.close();

// ═══ ⑥ CONTROL: the round-3 draw (replaceChildren) — the same measurements ═══
console.log('⑥ CONTROL: the scratch bundle rebuilt with reconcile = replaceChildren (the round-3 draw)');
{
  const rel = 'src/lib/channels-panel.js';
  const src = fs.readFileSync(path.join(wt, rel), 'utf-8');
  const from = `  for (const k of [...kids]) if (!want.has(k)) k.remove();
  for (let i = 0; i < out.length; i++) if (kids[i] !== out[i]) parent.insertBefore(out[i], kids[i] || null);`;
  ok(src.includes(from), 'CONTROL setup: the in-place reconcile is spelled once');
  fs.writeFileSync(path.join(wt, rel), src.replace(from, '  parent.replaceChildren(...out);'));   // the SCRATCH copy only — never the checkout
  bundle();
  const p2 = await newPage();
  ok(await p2.load(), 'the control page loaded');
  const O2 = await p2.evaljs(OPEN);
  const M2 = await p2.evaljs(MEASURE(digest));
  console.log(`    (control: whole ${M2.whole.join(' / ')} ms · partial ${M2.partial.join(' / ')} ms · storm ${M2.storm.share} %, long frames ${M2.storm.longGaps}, p95 ${M2.storm.p95} ms)`);
  const best = Math.min(...M.partial), worst2 = Math.min(...M2.partial);
  ok(O2.rows >= N && worst2 >= 4 * Math.max(1, best), `CONTROL: with replaceChildren the partial redraw is ≥ 4× slower (${worst2} ms vs ${best} ms) — ② would redden`, J([M.partial, M2.partial]));
  const C2 = await clickAcrossBroadcast(p2, digest);
  ok(C2.chanWindows === 0, `CONTROL: with replaceChildren the same trusted click across a broadcast is LOST (${C2.chanWindows} window opened) — ④ would redden`, J(C2));
  p2.close();
}
// ═══ ⑦ CONTROL (round 5): the ROUND-4 panel — reconcile without the equal-node keep, the signature without access ═══
console.log('⑦ CONTROL: the scratch bundle rebuilt as round 4 left it (no equal-node keep; `access` off the signature)');
{
  const rel = 'src/lib/channels-panel.js';
  const src = fs.readFileSync(path.join(repo, rel), 'utf-8');   // the checkout's text (the ⑥ control rewrote the scratch copy)
  const keep = /  \/\/ a fresh node equal to the old one at its index is the old one \(kept, handlers refreshed\)\n  for \(let i = 0; i < out\.length && i < kids\.length; i\+\+\) \{\n[\s\S]*?\n  \}\n(?=  for \(const k of \[\.\.\.kids\]\))/;
  const sigLine = 'conv.assignment, conv.access, conv.watchers, conv.held]);';
  // round 6 keeps the head by KEY (a layer above the equal-node keep): the round-5 shape builds it fresh per draw
  const headKeep = "const h = keep('head:' + a.id, () => {";
  const headFresh = "const h = ((k, make) => make())('head:' + a.id, () => {";
  ok(keep.test(src) && src.includes(sigLine) && src.includes(headKeep), 'CONTROL setup (round 5): the equal-node keep, the access + watchers signature entries and the round-6 kept head are spelled once');
  fs.writeFileSync(path.join(wt, rel), src.replace(keep, '').replace(sigLine, 'conv.assignment, conv.held]);').replace(headKeep, headFresh));   // the SCRATCH copy only
  bundle();
  const p3 = await newPage();
  ok(await p3.load(), 'the round-4 control page loaded');
  await p3.evaljs(OPEN);
  const ACC3 = await p3.evaljs(`(async () => {
    const fire = (dd) => { for (const fn of window.app.ws.globalHandlers) { try { fn({ type: 'channels-updated', digest: dd, partial: !!dd.partial }); } catch (e) {} } };
    const line = () => { const r = document.querySelector('.chan-row[data-conv="lark/oc_5"]'); const a = r && r.querySelector('.chan-row-assign'); return a ? a.textContent : null; };
    fire(${J(withAccess(digest, ['Alpha']))}); await new Promise((r) => setTimeout(r, 50));
    const one = line();
    fire(${J(withAccess(digest, ['Alpha', 'Beta']))}); await new Promise((r) => setTimeout(r, 50));
    return { one, two: line() };
  })()`);
  ok(/Alpha/.test(ACC3.one || '') && !/Beta/.test(ACC3.two || ''), `CONTROL (round 5): with round 4's signature the row still says "${ACC3.two}" after [Alpha, Beta] was saved — ⑤b would redden`, J(ACC3));
  const H3 = await clickHeadAcross(p3, digest, '.chan-sec.chan-account .chan-sec-more', true);
  ok(H3.found && H3.menus === 0 && !H3.sameHead, 'CONTROL (round 5): without the equal-node keep the ⋯ click across a broadcast opens NO menu (the head was detached) — ⑤c would redden', J(H3));
  p3.close();
}
// ═══ ⑧ CONTROL (round 6): the ROUND-5 panel — the equal-node keep present, the head built fresh per draw ═══
console.log('⑧ CONTROL: the scratch bundle rebuilt as round 5 left it (the head fresh per draw, kept only while equal)');
{
  const rel = 'src/lib/channels-panel.js';
  const src = fs.readFileSync(path.join(repo, rel), 'utf-8');
  const headKeep = "const h = keep('head:' + a.id, () => {";
  ok(src.includes(headKeep), 'CONTROL setup (round 6): the kept head is spelled once');
  fs.writeFileSync(path.join(wt, rel), src.replace(headKeep, "const h = ((k, make) => make())('head:' + a.id, () => {"));   // the SCRATCH copy only
  bundle();
  const p4 = await newPage();
  ok(await p4.load(), 'the round-5 control page loaded');
  await p4.evaljs(OPEN);
  const H6 = await clickHeadAcross(p4, digest, '.chan-sec.chan-account .chan-sec-more', true);
  const H7 = await clickHeadAcross(p4, digest, '.chan-sec.chan-account .chan-sec-more', 'unread');
  ok(H6.found && H6.menus === 1 && H6.sameHead, 'CONTROL (round 6) setup: round 5\'s own leg still holds on its copy — a same-row broadcast keeps the equal head', J(H6));
  ok(H7.found && H7.menus === 0 && !H7.sameHead, 'CONTROL (round 6): with the head built fresh per draw an unread-changing broadcast REPLACES it and the ⋯ click across it opens NO menu — ⑤d would redden', J(H7));
  p4.close();
}

console.log(`\n(${Math.round((Date.now() - T0) / 1000)} s)`);
console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
