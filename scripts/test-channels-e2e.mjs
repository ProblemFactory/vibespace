#!/usr/bin/env node
// CHANNELS END TO END (docs/design-communication-panel.zh.md §19's P0 EXIT
// CONDITIONS; gate row `test-channels-e2e`, heavy tier — a real worktree
// server and headless chrome).
//
// The exit conditions this drives, in the order the design states them:
//   ① a fake-adapter conversation APPEARS IN THE PANEL (with its freshness chip)
//   ② it OPENS AS A WINDOW
//   ③ it SURVIVES ONE RESTART (SIGKILL the server, reboot, reload — the window
//      comes back from its openSpec and the tracked/unread state from disk)
//   ④ it SYNCS BETWEEN TWO CLIENTS (one tracks, the other repaints)
//   ⑤ two simultaneous passes each advance their own cursor (asserted through
//      the REAL routes against the REAL store, not a unit fixture)
//   ⑥ A READ-ONLY CONVERSATION RENDERS NO SEND CONTROL AT ALL
//
// Everything is per-pid (scripts/scratch.mjs) — no machine-global port and no
// fixed /tmp path — and the server gets a NAMED scratch HOME, because a server
// can only discover what lives under the home it runs with and the machine's
// production instance walks the real one.
// Run: node scripts/test-channels-e2e.mjs   (SKIPs without chrome)
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePort, scratch, scratchHome } from './scratch.mjs';
const require = createRequire(import.meta.url);

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }

const PORT = await freePort(), CDP_PORT = await freePort();
const wt = scratch('chan-e2e');
const fakeHome = scratchHome('chan-e2e-home', fs);
const chromeDir = scratch('chan-e2e-chrome');

let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── throwaway worktree + WORKING-TREE overlay (a pre-commit run must test what
//    is about to ship) ──
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) {
  execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
}
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
// The bundle's baked version must MATCH the server's, or `_checkBundleFreshness`
// reloads the tab once per server version — mid-evaluate, which CDP reports as
// "Inspected target navigated or closed" and which would make every assertion
// below a coin flip rather than a measurement.
fs.writeFileSync(path.join(wt, 'src/lib/build-version.js'), `export const BUILD_VERSION = ${JSON.stringify(require(path.join(repo, 'package.json')).version)};\n`);
execSync('npx esbuild src/client.js --bundle --outfile=public/bundle.js --format=iife --platform=browser --target=es2020 --loader:.css=css',
  { cwd: wt, stdio: 'ignore' });

let srv = null;
const bootServer = () => spawn(process.execPath, ['server.js'], {
  cwd: wt, stdio: 'ignore',
  env: { ...process.env, PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', VIBESPACE_CHANNELS_FAKE: '1' },
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

// ── CDP plumbing (one connection per PAGE — the multi-client leg needs two) ──
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
    if (r2.error) throw new Error('cdp error: ' + JSON.stringify(r2.error).slice(0, 400));
    if (!r2.result || !r2.result.result || !('value' in r2.result.result)) throw new Error('no value from page: ' + JSON.stringify(r2).slice(0, 600));
    return r2.result.result.value;
  };
  const load = async () => {
    await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
    for (let i = 0; i < 160; i++) { try { if (await evaljs('!!(window.app && window.app.wm && window.app.sidebar)')) return true; } catch {} await sleep(250); }
    return false;
  };
  return { cdp, evaljs, load, close: () => { try { ws.close(); } catch {} } };
}

for (let i = 0; i < 120; i++) { try { await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json(); break; } catch { await sleep(250); } }
const p1 = await newPage();
ok(await p1.load(), 'page 1 loaded the app');

// ── ① the panel lists the fake adapter's conversations, with chips ──
const OPEN_PANEL = `(async () => {
  const sb = window.app.sidebar;
  if (!sb._railEl) return { ok: false, why: 'no rail' };
  sb._railGo('channels');
  for (let i = 0; i < 80; i++) {
    const rows = [...document.querySelectorAll('.rail-panel-channels .chan-row')];
    if (rows.length) return {
      ok: true,
      rows: rows.map((r) => ({
        conv: r.dataset.conv,
        title: r.querySelector('.chan-row-title').textContent,
        chip: r.querySelector('.chan-chip') ? r.querySelector('.chan-chip').textContent : null,
        tracked: r.classList.contains('chan-tracked'),
        unread: r.querySelector('.chan-unread') ? r.querySelector('.chan-unread').textContent : null,
      })),
      sections: [...document.querySelectorAll('.rail-panel-channels .chan-sec-head b')].map((b) => b.textContent),
    };
    await new Promise((r) => setTimeout(r, 250));
  }
  return { ok: false, why: 'no rows', html: document.querySelector('.rail-panel-channels')?.textContent?.slice(0, 200) };
})()`;
const panel = await p1.evaljs(OPEN_PANEL);
ok(panel.ok, 'the Channels rail panel renders', JSON.stringify(panel));
ok(panel.sections.length === 3 && panel.sections.includes('fake-poll'), 'the three fake adapters are sections', JSON.stringify(panel.sections));
ok(panel.rows.length >= 6, `EXIT ①: fake-adapter conversations APPEAR IN THE PANEL (${panel.rows.length} rows)`, JSON.stringify(panel.rows.slice(0, 2)));
ok(panel.rows.every((r) => r.chip), 'EVERY row carries a FRESHNESS CHIP — the honesty contract of this whole feature', JSON.stringify(panel.rows.map((r) => r.chip)));
// NOTHING IS TRACKED YET, so nothing is fetched — and the chips SAY so (r3).
// They used to read "within 5m" here: a promise about a fetch that would never
// happen, on every row a fresh instance shows.
ok(panel.rows.every((r) => !r.tracked), 'FIXTURE: on a fresh instance no row is tracked (untracked is the default state of every discovered conversation)');
ok(panel.rows.every((r) => /^(not polling|not scanning)$/.test(r.chip)) && panel.rows.some((r) => r.chip === 'not polling') && panel.rows.some((r) => r.chip === 'not scanning'),
  'an UNTRACKED row\'s chip says "not polling" / "not scanning" — never "within 5m" about a fetch nothing will make', JSON.stringify(panel.rows.map((r) => [r.conv, r.chip])));

// ── ② the conversation opens as a WINDOW ──
const OPEN_WIN = (adapter, conv) => `(async () => {
  const w = window.app.openChannel('${adapter}', '${conv}');
  for (let i = 0; i < 80; i++) {
    const el = w.content.querySelector('.chanwin-bar b');
    if (el && el.textContent) return {
      id: w.id, type: w.type, title: el.textContent,
      wmTitle: w.title, titleSpan: w.titleSpan ? w.titleSpan.textContent : null,
      spec: w._openSpec,
      composer: w.content.querySelectorAll('[data-channel-send]').length,
      readonly: w.content.querySelector('.chanwin-readonly') ? w.content.querySelector('.chanwin-readonly').textContent : null,
      msgs: w.content.querySelectorAll('.chanmsg').length,
      empty: w.content.querySelector('.chanwin-empty') ? w.content.querySelector('.chanwin-empty').textContent : null,
    };
    await new Promise((r) => setTimeout(r, 250));
  }
  return { fail: 'window never rendered' };
})()`;
const win1 = await p1.evaljs(OPEN_WIN('fake-poll', 'fake-poll-ops'));
ok(win1.type === 'channel' && win1.spec && win1.spec.action === 'openChannel', 'EXIT ②: it opens as a registered `channel` window carrying its openSpec', JSON.stringify(win1));
// THE TITLE BAR NAMES THE CONVERSATION (r3): `winInfo.setTitle?.(…)` was a
// permanent no-op (the literal has no such member), so every channel window
// read "Channel" and two open conversations were indistinguishable.
ok(win1.wmTitle === win1.title && win1.titleSpan === win1.title && win1.title !== 'Channel',
  `the window's title bar and taskbar entry carry the conversation's title ("${win1.title}"), not the generic "Channel"`, JSON.stringify({ wm: win1.wmTitle, span: win1.titleSpan, bar: win1.title }));
const again = await p1.evaljs(`(() => { const a = window.app.openChannel('fake-poll','fake-poll-ops'); const b = window.app.openChannel('fake-poll','fake-poll-ops'); return { same: a.id === b.id, n: [...window.app.wm.windows.values()].filter((w) => w.type === 'channel').length }; })()`);
ok(again.same && again.n === 1, 'opening the SAME conversation twice focuses the one window (singleton per CONVERSATION, not per kind)', JSON.stringify(again));

// ── ⑥ the read-only conversation renders NO send control AT ALL ──
await p1.evaljs(`fetch('/api/channels/fake-poll/fake-poll-announce/track', { method:'POST', headers:{'Content-Type':'application/json'}, body:'{"tracked":true}' }).then(r=>r.json())`);
await sleep(1500);
const ro = await p1.evaljs(OPEN_WIN('fake-poll', 'fake-poll-announce'));
ok(ro.composer === 0, 'EXIT ⑥: a READ-ONLY conversation renders NO send control at all', JSON.stringify(ro));
ok(ro.readonly && /read-only/i.test(ro.readonly), '…and it SAYS why, with the adapter\'s own reason (an absent control with no explanation is the silent failure this forbids)', ro.readonly);

// POSITIVE CONTROL: the sendable one DOES draw a composer — an assertion that
// nothing is drawn proves nothing unless something is drawn elsewhere.
await p1.evaljs(`fetch('/api/channels/fake-poll/fake-poll-ops/track', { method:'POST', headers:{'Content-Type':'application/json'}, body:'{"tracked":true}' }).then(r=>r.json())`);
await sleep(1500);
const send = await p1.evaljs(`(async () => {
  const w = [...window.app.wm.windows.values()].find((x) => x._openSpec && x._openSpec.convId === 'fake-poll-ops');
  // Wait for BOTH halves: the composer appears as soon as convCaps resolves,
  // while the page arrives after the window's own re-read of the broadcast.
  for (let i = 0; i < 60; i++) {
    if (w.content.querySelectorAll('[data-channel-send]').length && w.content.querySelectorAll('.chanmsg').length) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  return { composer: w.content.querySelectorAll('[data-channel-send]').length, msgs: w.content.querySelectorAll('.chanmsg').length, note: w.content.querySelector('.chanwin-note')?.textContent || null };
})()`);
ok(send.composer === 1, 'POSITIVE CONTROL: the SENDABLE conversation does draw one (the read-only zero is a decision, not an empty window)', JSON.stringify(send));
ok(send.msgs > 0, 'a tracked conversation renders its ingested messages', JSON.stringify(send));
ok(send.note && /outbox/i.test(send.note), 'the composer SAYS it is not connected yet rather than silently doing nothing', send.note);
// …and NOW a poll-lane row says how long its evidence may be: the chip moved
// from "not polling" to "within …" the moment tracking made the fetch real.
const tracked1 = await p1.evaljs(OPEN_PANEL);
const opsRow = tracked1.ok && tracked1.rows.find((r) => r.conv === 'fake-poll/fake-poll-ops');
ok(opsRow && opsRow.tracked && /^within /.test(opsRow.chip), 'a TRACKED poll-lane row says how long its evidence may be ("within …", never a bare "Updated N min ago")', JSON.stringify(opsRow));
ok(tracked1.rows.filter((r) => !r.tracked).every((r) => /^(not polling|not scanning)$/.test(r.chip)), '…while the still-untracked rows still say nothing is fetched', JSON.stringify(tracked1.rows.map((r) => [r.conv, r.tracked, r.chip])));

// ── ⑤ two simultaneous passes each advance their own cursor (real routes) ──
{
  const before = JSON.parse(fs.readFileSync(path.join(wt, 'data/channels/index.json'), 'utf-8'));
  await Promise.all([
    fetch(`http://127.0.0.1:${PORT}/api/channels/fake-push/fake-push-ops/track`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"tracked":true}' }),
    fetch(`http://127.0.0.1:${PORT}/api/channels/fake-scan/fake-scan-ops/track`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"tracked":true}' }),
  ]);
  await sleep(2500);
  const ix = JSON.parse(fs.readFileSync(path.join(wt, 'data/channels/index.json'), 'utf-8')).conversations;
  ok(ix['fake-push/fake-push-ops'].anchor && ix['fake-scan/fake-scan-ops'].anchor,
    'EXIT ⑤: two simultaneous passes each advanced their OWN cursor, through the REAL store',
    JSON.stringify({ push: ix['fake-push/fake-push-ops'].anchor, scan: ix['fake-scan/fake-scan-ops'].anchor, before: Object.keys(before.conversations).length }));
  ok(ix['fake-poll/fake-poll-ops'].anchor && ix['fake-poll/fake-poll-announce'].anchor, '…and the earlier pass\'s cursors are still there (nothing clobbered anything)');
  const logs = fs.readdirSync(path.join(wt, 'data/channels/msgs'));
  ok(logs.length === 3, 'each adapter owns its own message-log directory', logs.join(','));
  // THE SCAN LANE'S CHIP AND ITS LOG AGREE (r3): the pass PRODUCED
  // `scan.hostFacts`, the resolver chose a source from them, records were
  // ingested THROUGH that source, and the chip says "scanned … ago". Before:
  // 11 records ingested under `host-facts-stale` and a chip reading "not
  // scanning" — the honesty contract publishing the opposite of what happened.
  const scanRow = await p1.evaljs(`fetch('/api/channels').then(r=>r.json()).then(d=>JSON.stringify(d.conversations.find(c=>c.id==='fake-scan-ops')))`).then(JSON.parse);
  const adapters = JSON.parse(fs.readFileSync(path.join(wt, 'data/channels/adapters.json'), 'utf-8')).adapters;
  const scanRec = adapters.find((a) => a.id === 'fake-scan');
  ok(scanRec.scan && scanRec.scan.hostFacts && scanRec.scan.hostFacts.platform, 'the scan pass PRODUCED `scan.hostFacts` on the adapter row (the field had no producer before)', JSON.stringify(scanRec.scan));
  ok(scanRow.lane.via === 'scan' && scanRow.lane.source !== null && scanRow.freshness.state === 'aged',
    `the tracked scan row's lane has a SOURCE (${scanRow.lane.source}) and its chip says "scanned … ago" — the same answer the ingest was gated on`, JSON.stringify({ lane: scanRow.lane, freshness: scanRow.freshness }));
}

// ── ④ two clients, one list ──
const p2 = await newPage();
ok(await p2.load(), 'page 2 loaded the app');
const p2rows = await p2.evaljs(OPEN_PANEL);
ok(p2rows.ok && p2rows.rows.filter((r) => r.tracked).length === 4, 'EXIT ④(a): the second client sees the SAME tracked state', JSON.stringify(p2rows.rows.map((r) => [r.conv, r.tracked])));
// Now UNtrack from page 1 and watch page 2 repaint off the broadcast — never a poll.
await p1.evaljs(`fetch('/api/channels/fake-scan/fake-scan-ops/track', { method:'POST', headers:{'Content-Type':'application/json'}, body:'{"tracked":false}' }).then(r=>r.json())`);
const synced = await p2.evaljs(`(async () => {
  for (let i = 0; i < 40; i++) {
    const row = [...document.querySelectorAll('.rail-panel-channels .chan-row')].find((r) => r.dataset.conv === 'fake-scan/fake-scan-ops');
    if (row && !row.classList.contains('chan-tracked')) return { ok: true, after: i * 250 };
    await new Promise((r) => setTimeout(r, 250));
  }
  return { ok: false };
})()`);
ok(synced.ok, `EXIT ④(b): a change on ONE client repaints the OTHER from the broadcast (${synced.after}ms), with no refresh`, JSON.stringify(synced));

// ── ③ survive a restart ──
{
  // The layout autosave is ANTI-ECHO gated: it only broadcasts state the USER
  // caused (`_userDirty`, expiring after 60s of no input). Everything above
  // opened windows programmatically, so a real pointerdown is what makes this
  // leg measure the restore rather than an autosave that never ran.
  await p1.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: 700, y: 20, button: 'left', clickCount: 1 });
  await p1.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 700, y: 20, button: 'left', clickCount: 1 });
  await p1.evaljs('window.app.layoutManager.scheduleAutoSave(), 1');
  await sleep(3500);
  const layouts = path.join(wt, 'data/layouts.json');
  ok(fs.existsSync(layouts) && /openChannel/.test(fs.readFileSync(layouts, 'utf-8')), 'the channel window is in the saved layout (its openSpec, not its contents)');
  srv.kill('SIGKILL');
  await sleep(1200);
  srv = bootServer();
  ok(await waitServer(), 'the server rebooted');
  ok(await p1.load(), 'page 1 reloaded');
  const back = await p1.evaljs(`(async () => {
    // Wait for the TRACKED conversation's window to have finished its own
    // fetch — a window that has drawn its context bar has not necessarily
    // drawn its page yet, and asserting on the earlier instant measures the
    // race rather than the restore.
    for (let i = 0; i < 120; i++) {
      const ws = [...window.app.wm.windows.values()].filter((w) => w.type === 'channel');
      const ops = ws.find((w) => w._openSpec && w._openSpec.convId === 'fake-poll-ops');
      if (ops && ops.content.querySelectorAll('.chanmsg').length) {
        return { n: ws.length, convs: ws.map((w) => w._openSpec && w._openSpec.convId), msgs: ws.map((w) => w.content.querySelectorAll('.chanmsg').length), opsMsgs: ops.content.querySelectorAll('.chanmsg').length };
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    const ws = [...window.app.wm.windows.values()].filter((w) => w.type === 'channel');
    return { n: ws.length, convs: ws.map((w) => w._openSpec && w._openSpec.convId), msgs: ws.map((w) => w.content.querySelectorAll('.chanmsg').length), opsMsgs: 0 };
  })()`);
  ok(back.n >= 1 && back.convs.includes('fake-poll-ops'), 'EXIT ③: the conversation window came back from its openSpec after a SIGKILL + reboot', JSON.stringify(back));
  ok(back.opsMsgs > 0, '…and it re-read its messages from the store that survived with it', JSON.stringify(back));
  const state = await p1.evaljs(`fetch('/api/channels').then(r=>r.json()).then(d=>({tracked:d.conversations.filter(c=>c.tracked).map(c=>c.id).sort(), unreadTotal:d.unreadTotal}))`);
  ok(JSON.stringify(state.tracked) === JSON.stringify(['fake-poll-announce', 'fake-poll-ops', 'fake-push-ops']),
    '…and the tracked set survived too (the index is atomic + flushed on exit)', JSON.stringify(state));
}

// ── ⑦ AN OPEN WINDOW IS NOT A TRAFFIC GENERATOR (r2) ──────────────────────
// The broadcast-driven render() used to POST /read, markRead() broadcast
// unconditionally, the broadcast re-rendered, and the cycle ran at ~490
// requests a second for ever with ONE window open and the user touching
// nothing — rewriting `readAt` ~500 times a second, i.e. destroying the very
// mark it was setting. Each cycle cost a full digest() (a deep clone of the
// whole index), a serialized index.update() and a broadcast to EVERY client,
// so N clients with the window open was quadratic.
//
// Counted with OUR OWN counters: the browser's resource-timing buffer
// saturates, and a saturated buffer reads as "0 requests".
{
  await p1.evaljs(`(() => {
    window.__cnt = { bc: 0, read: 0, byUrl: {} };
    const of = window.fetch;
    window.fetch = function (u) {
      const s = String(typeof u === 'string' ? u : (u && u.url) || '').split('?')[0];
      if (s.includes('/api/channels')) window.__cnt.byUrl[s] = (window.__cnt.byUrl[s] || 0) + 1;
      if (s.endsWith('/read')) window.__cnt.read++;
      return of.apply(this, arguments);
    };
    window.app.ws.onGlobal((m) => { if (m && m.type === 'channels-updated') window.__cnt.bc++; });
    return true;
  })()`);
  // The window for fake-poll-ops is already open from ②/⑥ above.
  const open = await p1.evaljs(`[...window.app.wm.windows.values()].filter(w => w.type === 'channel').length`);
  ok(open >= 1, 'at least one channel window is open for this measurement (a zero here would make the count below vacuous)', String(open));
  await p1.evaljs('window.__cnt = { bc: 0, read: 0, byUrl: {} }');
  await sleep(6000);
  const idle = await p1.evaljs('JSON.stringify(window.__cnt)');
  const c = JSON.parse(idle);
  ok(c.read < 5, `an OPEN window idle for six seconds issues almost no /read POSTs (${c.read}) — marking read is a USER action, not a repaint side effect`, idle);
  ok(c.bc < 20, `…and the engine is not broadcasting on its own account either (${c.bc})`, idle);
  const unread = await p1.evaljs(`fetch('/api/channels').then(r=>r.json()).then(d=>(d.conversations.find(x=>x.id==='fake-poll-ops')||{}).unread)`);
  ok(unread === 0, 'and the mark the window DID set on open is still standing — the loop used to rewrite it hundreds of times a second', String(unread));
}

// ── ⑧ A CLOSED WINDOW IS CLOSED (r2) ──────────────────────────────────────
// `ws.onGlobal()` returned undefined, so `off?.()` in both teardowns was a
// silent no-op: a CLOSED channel window kept re-rendering, kept fetching and
// kept POSTing /read over the user's mark, holding its whole detached DOM
// subtree alive with it.
//
// TWO LAYERS, and the measurement says which is which: reverting `onGlobal`
// ALONE reddens the contract pin below (the teardowns name `offGlobal`, so
// the count still holds); reverting the two teardowns ALONE is ALL PASS. The
// load-bearing fix is the RETURN VALUE; the named-const teardown is a belt
// that does not depend on it. Reverting BOTH is the pre-fix state and
// reproduces the leak (26 → 30 handlers, and a closed window still fetching).
{
  ok(await p1.evaljs(`typeof window.app.ws.offGlobal`) === 'function', 'the ws manager offers offGlobal');
  ok(await p1.evaljs(`typeof window.app.ws.onGlobal(function probe(){})`) === 'function',
    'onGlobal RETURNS its own unsubscribe — `off?.()` on undefined is how this class comes back');
  await p1.evaljs(`(() => { const h = window.app.ws.globalHandlers; const i = h.findIndex(f => f.name === 'probe'); if (i >= 0) h.splice(i, 1); return true; })()`);

  await p1.evaljs(`(() => { for (const w of [...window.app.wm.windows.values()].filter(x => x.type === 'channel')) window.app.wm.closeWindow(w.id); return true; })()`);
  await sleep(600);
  const pre = await p1.evaljs('window.app.ws.globalHandlers.length');
  await p1.evaljs(`(() => {
    window.app.openChannel('fake-poll','fake-poll-ops');
    window.app.openChannel('fake-poll','fake-poll-announce');
    window.app.openChannel('fake-push','fake-push-ops');
    return true;
  })()`);
  await sleep(2500);
  await p1.evaljs(`(() => { for (const w of [...window.app.wm.windows.values()].filter(x => x.type === 'channel')) window.app.wm.closeWindow(w.id); return true; })()`);
  await sleep(600);
  const post = await p1.evaljs('window.app.ws.globalHandlers.length');
  const still = await p1.evaljs(`[...window.app.wm.windows.values()].filter(w => w.type === 'channel').length`);
  ok(still === 0, 'the three windows really are closed', String(still));
  ok(post === pre, `opening AND closing three channel windows leaves the handler list where it started (${pre} → ${post})`);

  // …and the closed windows issue NOTHING when the engine broadcasts.
  await p1.evaljs('window.__cnt = { bc: 0, read: 0, byUrl: {} }');
  await fetch(`http://127.0.0.1:${PORT}/api/channels/fake-poll/fake-poll-ops/read`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"at":0}' });
  await sleep(3000);
  const after = JSON.parse(await p1.evaljs('JSON.stringify(window.__cnt)'));
  const conv = after.byUrl['/api/channels/fake-poll/fake-poll-ops'] || 0;
  ok(conv === 0 && after.read === 0,
    'a CLOSED window fetches NOTHING and POSTs NOTHING when the engine broadcasts', JSON.stringify(after));
  const readAt = JSON.parse(fs.readFileSync(path.join(wt, 'data/channels/index.json'), 'utf-8')).conversations['fake-poll/fake-poll-ops'].readAt;
  ok(readAt === 0, 'and the read mark we set to 0 is still 0 — no ghost window overwrote it', String(readAt));
}

// ── ⑨ THE FRESHNESS CHIP IS IN THE DEVICE'S LANGUAGE (r2) ─────────────────
// The claim leaves the server as STRUCTURE and the sentence is composed in
// the browser, because the digest is broadcast to every client at once while
// the language is per DEVICE. Before that split these nine strings shipped
// English-only to a zh/ja UI — and the build's i18n scan could not see them,
// because they left the server as data rather than as a `t()` literal.
{
  const wire = await p1.evaljs(`fetch('/api/channels').then(r=>r.json()).then(d=>JSON.stringify({fresh:d.conversations[0]&&d.conversations[0].freshness, warn:d.conversations[0]&&d.conversations[0].identityWarning}))`);
  const w = JSON.parse(wire);
  ok(w.fresh && w.fresh.state && !('text' in w.fresh), 'the WIRE carries {kind,state,seconds} and no sentence', wire);
  ok(w.warn && !('text' in w.warn), '…and the identity warning carries {level,marking,verbatim} only', wire);
  const zh = await p1.evaljs(`(async () => {
    localStorage.setItem('vibespace.lang', 'zh');
    return true;
  })()`);
  ok(zh === true, 'the device language is switched for the next load');
  ok(await p1.load(), 'page 1 reloaded in zh');
  const chips = await p1.evaljs(`(async () => {
    const sb = window.app.sidebar;
    sb._railGo('channels');
    for (let i = 0; i < 80; i++) {
      const rows = [...document.querySelectorAll('.rail-panel-channels .chan-row')];
      if (rows.length) return rows.map((r) => r.querySelector('.chan-chip') ? r.querySelector('.chan-chip').textContent : null);
      await new Promise((r) => setTimeout(r, 250));
    }
    return null;
  })()`);
  ok(Array.isArray(chips) && chips.length && chips.every(Boolean), 'every row still carries a chip in zh', JSON.stringify(chips));
  ok(chips.some((x) => /[一-鿿]/.test(x)),
    'THE CHIP IS TRANSLATED — the honesty contract of this whole feature now speaks the reader\'s language', JSON.stringify(chips));
  await p1.evaljs(`localStorage.removeItem('vibespace.lang'), 1`);
}

// ── the routes' host parameter is a PARAMETER with a named refusal ──
{
  const r = await (await fetch(`http://127.0.0.1:${PORT}/api/channels?host=some-other-machine`)).json();
  ok(/only/.test(r.error || '') , 'a question about ANOTHER machine gets a NAMED refusal, never this machine\'s answer (hostId is a parameter from day one — decision 15)', JSON.stringify(r));
  const ok404 = await (await fetch(`http://127.0.0.1:${PORT}/api/channels/fake-poll/not-a-conversation`)).json();
  ok(/No such conversation/.test(ok404.error || ''), 'an unknown conversation is a 404 with a reason');
}

p1.close(); p2.close();
console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
