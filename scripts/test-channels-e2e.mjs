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
//   ⑩ P3 (design §9): the composer PROPOSES → the inline approval card (identity
//      row + the identityMarking warning) and the OTHER client's Outbox window
//      show the same record → ONE For-you pointer with its id on the row →
//      Approve sends (fake adapter), client 2 repaints off the broadcast, the
//      pointer is retracted, the audit holds propose→approve→attempt→outcome
//      with draftedBy/approvedBy/sentAs/identityMarking; Reject with a reason;
//      the outbox survives the restart in ③
//   ⑪ P4 (design §9.4/§9.5): a send whose answer was LOST lands as `unknown`
//      (never failed, never re-sent) with ONE For-you item and a Check
//      outcome button; Check outcome from the card settles it to sent, the
//      item is retracted, reconcile-attempt → reconcile-outcome are audited
//      beside exactly ONE attempt line; the panel's sender-line switch reads
//      OFF (instance default), turning a channel's on is audited, and a
//      user's own draft carries no sender-line note; the reconciled proposal
//      survives the restart in ③
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
import { freePort, scratch, scratchHome, ONBOARDED_SOURCE } from './scratch.mjs';
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
    await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
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
        untracked: r.querySelector('.chan-untracked') ? r.querySelector('.chan-untracked').textContent : null,
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
ok(panel.sections.length === 4 && ['fake-poll', 'fake-push', 'fake-scan', 'Agents'].every((s) => panel.sections.includes(s)), 'the three fake adapters AND the built-in Agents adapter (P3, seeded whenever the wiring names live sessions) are sections', JSON.stringify(panel.sections));
ok(panel.rows.length >= 6, `EXIT ①: fake-adapter conversations APPEAR IN THE PANEL (${panel.rows.length} rows)`, JSON.stringify(panel.rows.slice(0, 2)));
// NOTHING IS TRACKED YET, so nothing is fetched — and the rows SAY so: an
// untracked row carries NO freshness pill (design §4.3 — there is no evidence
// to claim; r3's "not polling" pill was the one that truncated to "…polling"
// in ja at the default rail, verifier r4), its line-2 text is the claim.
ok(panel.rows.every((r) => !r.tracked), 'FIXTURE: on a fresh instance no row is tracked (untracked is the default state of every discovered conversation)');
ok(panel.rows.every((r) => !r.chip && r.untracked === 'not tracked'), 'an UNTRACKED row carries NO freshness pill — its "not tracked" text is the claim; a pill would promise a fetch nothing will make', JSON.stringify(panel.rows.map((r) => [r.conv, r.chip, r.untracked])));
{
  const wire = await (await fetch(`http://127.0.0.1:${PORT}/api/channels`)).json();
  const off = (wire.conversations || []).filter((c) => !c.tracked).map((c) => c.freshness && c.freshness.state);
  ok(off.length >= 6 && off.every((x) => x === 'off'), 'the WIRE still carries the untracked claim as structure (`freshness.state === "off"`) — the panel chooses not to draw it', JSON.stringify(off));
}

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
ok(send.note && /policy/i.test(send.note) && /outbox/i.test(send.note), 'the composer SAYS which policy governs the reply and that it goes through the outbox (P3) — never a control that silently does nothing', send.note);
// …and NOW a poll-lane row says how long its evidence may be: the chip moved
// from "not polling" to "within …" the moment tracking made the fetch real.
const tracked1 = await p1.evaljs(OPEN_PANEL);
const opsRow = tracked1.ok && tracked1.rows.find((r) => r.conv === 'fake-poll/fake-poll-ops');
ok(opsRow && opsRow.tracked && /^within /.test(opsRow.chip), 'a TRACKED poll-lane row says how long its evidence may be ("within …", never a bare "Updated N min ago")', JSON.stringify(opsRow));
ok(tracked1.rows.filter((r) => !r.tracked).every((r) => r.chip === null && r.untracked === 'not tracked'), '…while the still-untracked rows carry no pill and say "not tracked" (nothing is fetched)', JSON.stringify(tracked1.rows.map((r) => [r.conv, r.tracked, r.chip, r.untracked])));

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

// ── ⑩ P3: PROPOSE → INLINE CARD → APPROVE → SENT → POINTER RETRACTED (design §9) ──
// The user drafts from the composer. fake-poll has no conversation policy
// and no adapter default, so the policy reads `review` (decision 9) and the
// proposal lands in awaiting-approval. The card renders INLINE in the
// conversation window on client 1 AND in the Outbox window on client 2 from
// ONE store; the identity row WARNS (fake-poll declares
// identityMarking:'unknown' — as loud as `marked`, §9.5); ONE "For you"
// pointer is filed with its id persisted on the index row; Approve on the
// inline card sends through the fake adapter; client 2 repaints off
// `channel-outbox-updated`; the engine retracts the pointer; the audit log
// holds propose → approve → ATTEMPT → OUTCOME with draftedBy / approvedBy /
// sentAs / identityMarking on every line. Then the other decision: reject
// with a reason, and the pointer goes with it.
const readTodos = async () => (await (await fetch(`http://127.0.0.1:${PORT}/api/user-todos`)).json()).todos || { open: [], resolved: [] };
const readRow = () => JSON.parse(fs.readFileSync(path.join(wt, 'data/channels/index.json'), 'utf-8')).conversations['fake-poll/fake-poll-ops'];
// the index reaches disk on the store's 500 ms debounce (2 s interval); wait for the write, bounded
const waitRow = async (pred) => { for (let i = 0; i < 24; i++) { const r = readRow(); if (pred(r)) return r; await sleep(250); } return readRow(); };
const PROPOSE = (text) => `(async () => {
  const w = [...window.app.wm.windows.values()].find((x) => x._openSpec && x._openSpec.convId === 'fake-poll-ops');
  const ta = w.content.querySelector('.chanwin-composer textarea');
  const btn = w.content.querySelector('[data-channel-propose]');
  if (!ta || !btn) return { fail: 'no composer' };
  ta.value = ${JSON.stringify(text)};
  btn.click();
  for (let i = 0; i < 80; i++) {
    const card = w.content.querySelector('.chanwin-outbox .chan-prop-awaiting-approval');
    if (card) return {
      id: card.dataset.proposal, cls: card.className,
      identity: card.querySelector('.chan-prop-identity')?.textContent || null,
      warn: card.querySelector('.chan-prop-idwarn')?.textContent || null,
      policy: card.querySelector('.chan-prop-policy')?.textContent || null,
      text: card.querySelector('.chan-prop-text')?.textContent || null,
      approve: !!card.querySelector('button[data-approve]'),
      buttons: card.querySelectorAll('.chan-prop-actions > button').length,
    };
    await new Promise((r) => setTimeout(r, 250));
  }
  return { fail: 'no awaiting card', html: w.content.querySelector('.chanwin-outbox')?.textContent?.slice(0, 200) || null };
})()`;
{
  const propose = await p1.evaljs(PROPOSE('Hello from the e2e user'));
  ok(!propose.fail, 'EXIT P3 ①: a reply from the composer becomes a PROPOSAL and lands in awaiting-approval (fake-poll reads `review`)', JSON.stringify(propose));
  ok(propose.text === 'Hello from the e2e user', 'the inline card carries the drafted text (textContent, never innerHTML)', JSON.stringify(propose));
  ok(!!propose.identity && /Will send as/.test(propose.identity), 'the card carries the IDENTITY ROW ("Will send as …")', String(propose.identity));
  ok(!!propose.warn, "fake-poll declares identityMarking:'unknown' ⇒ the card WARNS (unverified is as loud as marked — §9.5)", String(propose.identity));
  ok(!!propose.policy && /approval/i.test(propose.policy), "the card says WHY it waits (the policy's reasons in words)", String(propose.policy));
  ok(propose.approve && propose.buttons === 3, 'an awaiting card offers Approve / Edit… / Reject…', JSON.stringify(propose));
  const pid = propose.id;

  // the pointer: ONE For-you item per conversation, its id on the index row
  const todos = await readTodos();
  const ptr = (todos.open || []).filter((t) => t.sessionKey === 'channels' && /awaiting approval/.test(t.text));
  ok(ptr.length === 1, 'EXIT P3 ②: exactly ONE open "For you" pointer is filed for the conversation (count-free text)', JSON.stringify((todos.open || []).map((t) => [t.sessionKey, t.text])));
  const ix1 = await waitRow((r) => !!r.pendingTodoId);
  ok(ptr.length === 1 && ix1.pendingTodoId === ptr[0].id, "the pointer's id is PERSISTED on the conversation row (`pendingTodoId`) — the retraction link", JSON.stringify({ row: ix1.pendingTodoId, item: ptr[0] && ptr[0].id }));

  // the second client: panel button + row badge + the Outbox window, same proposal, same store
  const p2ob = await p2.evaljs(`(async () => {
    const w = window.app.openChannelOutbox();
    for (let i = 0; i < 80; i++) {
      const card = w.content.querySelector('.chan-outbox-list .chan-prop');
      const btn = document.querySelector('.rail-panel-channels [data-outbox-button]');
      const row = document.querySelector('.rail-panel-channels .chan-row[data-conv="fake-poll/fake-poll-ops"] .chan-awaiting');
      if (card && btn && row) return { id: card.dataset.proposal, cls: card.className, type: w.type, btn: btn.textContent, rowBadge: row.textContent, where: card.querySelector('.chan-prop-where')?.textContent || null };
      await new Promise((r) => setTimeout(r, 250));
    }
    return { fail: 'no outbox card / button / row badge on client 2', btn: document.querySelector('.rail-panel-channels [data-outbox-button]')?.textContent || null };
  })()`);
  ok(!p2ob.fail && p2ob.id === pid && p2ob.type === 'channel-outbox', "EXIT P3 ③: the OTHER client's Outbox window shows the SAME proposal (one store, two places)", JSON.stringify(p2ob));
  ok(!p2ob.fail && /1/.test(p2ob.btn) && /1/.test(p2ob.rowBadge), "its panel button and the row badge carry the awaiting count (the pointer's degrade surface)", JSON.stringify({ btn: p2ob.btn, row: p2ob.rowBadge }));
  ok(!!p2ob.where && /Ops room/.test(p2ob.where), 'the Outbox card names its conversation (the inline one does not need to)', String(p2ob.where));

  // approve on the INLINE card (client 1) → sent; client 2 repaints off the broadcast
  const approved = await p1.evaljs(`(async () => {
    const w = [...window.app.wm.windows.values()].find((x) => x._openSpec && x._openSpec.convId === 'fake-poll-ops');
    const b = w.content.querySelector('.chanwin-outbox .chan-prop[data-proposal="${pid}"] button[data-approve]');
    if (!b) return { fail: 'no approve button' };
    b.click();
    for (let i = 0; i < 80; i++) {
      const card = w.content.querySelector('.chanwin-outbox .chan-prop[data-proposal="${pid}"]');
      if (card && /chan-prop-sent/.test(card.className)) return { cls: card.className, approve: !!card.querySelector('button[data-approve]') };
      await new Promise((r) => setTimeout(r, 250));
    }
    return { fail: 'never sent', cls: w.content.querySelector('.chanwin-outbox .chan-prop[data-proposal="${pid}"]')?.className || null };
  })()`);
  ok(!approved.fail && !approved.approve, 'EXIT P3 ④: Approve on the inline card SENDS (the fake adapter) and the card repaints as sent with no decision buttons', JSON.stringify(approved));
  const p2sent = await p2.evaljs(`(async () => {
    for (let i = 0; i < 80; i++) {
      const card = document.querySelector('.chan-outbox-list .chan-prop[data-proposal="${pid}"]');
      if (card && /chan-prop-sent/.test(card.className)) return { ok: true, after: i * 250 };
      await new Promise((r) => setTimeout(r, 250));
    }
    return { ok: false };
  })()`);
  ok(p2sent.ok, `the other client's Outbox window repainted to sent off \`channel-outbox-updated\` (${p2sent.after}ms), no refresh`, JSON.stringify(p2sent));

  // the pointer is RETRACTED by the engine; the row's link is cleared
  const todos2 = await readTodos();
  const ptrGone = !(todos2.open || []).some((t) => ptr[0] && t.id === ptr[0].id);
  const ptrDone = (todos2.resolved || []).find((t) => ptr[0] && t.id === ptr[0].id);
  const ix2 = await waitRow((r) => !r.pendingTodoId);
  ok(ptrGone && !!ptrDone && ptrDone.resolvedBy === 'system' && !ix2.pendingTodoId, 'EXIT P3 ⑤: the pointer is RETRACTED (by the engine, as `system`) when the last proposal leaves awaiting-approval, and the row forgets its id', JSON.stringify({ gone: ptrGone, done: ptrDone && [ptrDone.status, ptrDone.resolvedBy], row: ix2.pendingTodoId }));

  // the audit log: attempt BEFORE outcome, the identity fields on every line
  const audit = fs.readFileSync(path.join(wt, 'data/channels/audit.ndjson'), 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((a) => a.kind === 'outbox' && a.proposalId === pid);
  const ops = audit.map((a) => a.op);
  ok(ops.indexOf('propose') >= 0 && ops.indexOf('approve') > ops.indexOf('propose') && ops.indexOf('attempt') > ops.indexOf('approve') && ops.indexOf('outcome') > ops.indexOf('attempt'), 'EXIT P3 ⑥: the audit log holds propose → approve → ATTEMPT → OUTCOME in that order', ops.join(' → '));
  const outcome = audit.find((a) => a.op === 'outcome');
  ok(!!outcome && outcome.draftedBy && outcome.draftedBy.kind === 'user' && outcome.approvedBy === 'user' && outcome.sentAs === 'user' && outcome.identityMarking === 'unknown', 'every line carries draftedBy / approvedBy / sentAs / identityMarking', JSON.stringify(outcome));

  // REJECT with a reason — the other decision — and the pointer goes with it
  const second = await p1.evaljs(PROPOSE('Second draft, to be rejected'));
  ok(!second.fail && second.id !== pid, 'a second proposal lands in awaiting-approval (a new id)', JSON.stringify(second));
  const ptrB = (await readTodos()).open.filter((t) => t.sessionKey === 'channels' && /awaiting approval/.test(t.text));
  ok(ptrB.length === 1 && ptr[0] && ptrB[0].id === ptr[0].id, 'the pointer is RE-FILED as the SAME item (dedupe by text = the idempotence we want), not a second one', JSON.stringify({ before: ptr[0] && ptr[0].id, now: ptrB.map((t) => t.id) }));
  const rejected = await p1.evaljs(`(async () => {
    const w = [...window.app.wm.windows.values()].find((x) => x._openSpec && x._openSpec.convId === 'fake-poll-ops');
    const card = w.content.querySelector('.chanwin-outbox .chan-prop[data-proposal="${second.id}"]');
    card.querySelector('button[data-reject]').click();   // Reject… (a4: reject · edit · approve, by data attribute never by position)
    const box = card.querySelector('.chan-prop-rejectbox');
    if (!box) return { fail: 'no reject box' };
    box.querySelector('input').value = 'wrong tone for that room';
    box.querySelector('button').click();
    for (let i = 0; i < 80; i++) {
      const c2 = w.content.querySelector('.chanwin-outbox .chan-prop[data-proposal="${second.id}"]');
      if (c2 && /chan-prop-rejected/.test(c2.className)) return { cls: c2.className, reason: c2.querySelector('.chan-prop-reason')?.textContent || null, approve: !!c2.querySelector('button[data-approve]') };
      await new Promise((r) => setTimeout(r, 250));
    }
    return { fail: 'never rejected' };
  })()`);
  ok(!rejected.fail && /wrong tone/.test(rejected.reason || '') && !rejected.approve, 'Reject with a reason repaints the card as rejected, carrying the reason verbatim', JSON.stringify(rejected));
  const todos3 = await readTodos();
  const rowC = await waitRow((r) => !r.pendingTodoId);
  ok(!(todos3.open || []).some((t) => ptrB[0] && t.id === ptrB[0].id) && !rowC.pendingTodoId, 'the pointer is retracted again after the rejection (no awaiting proposal remains)', JSON.stringify({ open: (todos3.open || []).map((t) => t.text), row: rowC.pendingTodoId }));
  const auditB = fs.readFileSync(path.join(wt, 'data/channels/audit.ndjson'), 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((a) => a.kind === 'outbox' && a.proposalId === second.id).map((a) => a.op);
  ok(auditB.includes('reject') && !auditB.includes('attempt'), 'a rejected proposal has a reject line and NO attempt line (nothing was sent)', auditB.join(' → '));
  // client 2's Outbox window is closed again so the restart leg below restores only the channel windows it measures
  await p2.evaljs(`(() => { for (const w of [...window.app.wm.windows.values()].filter((x) => x.type === 'channel-outbox')) window.app.wm.closeWindow(w.id); return true; })()`);
}

// ── ⑪ P4: A LOST ANSWER IS UNKNOWN, AND A PERSON SETTLES IT (design §9.4 / §9.5) ──
// The fake adapter is steered by markers in the text: `[[fake:lost]]` = the
// request left and the answer never came, `[[fake:landed]]` = the platform
// holds the message when asked. Approve ⇒ the card repaints as `unknown`
// (never failed, never re-sent) with the "never retried" sentence, ONE
// For-you item asks the user to look, the audit OUTCOME line says lost; the
// card's Check outcome button (drawn only because fake-poll declares an
// idempotency mechanism) asks the adapter with the SAME key ⇒ sent, the item
// is retracted by the engine, reconcile-attempt → reconcile-outcome are
// audited, and the audit holds exactly ONE attempt line. Then the sender
// honesty switch (decision 17 as overruled): the panel row reads OFF
// (instance default); turning the channel's switch on is audited and
// repaints; a USER's own draft still carries no sender-line note.
const WIN = `[...window.app.wm.windows.values()].find((x) => x._openSpec && x._openSpec.convId === 'fake-poll-ops')`;
const readAudit = (id) => fs.readFileSync(path.join(wt, 'data/channels/audit.ndjson'), 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((a) => a.proposalId === id);
const readView = async (id) => ((await (await fetch(`http://127.0.0.1:${PORT}/api/channels/outbox?conv=fake-poll/fake-poll-ops`)).json()).proposals || []).find((p) => p.id === id) || null;
{
  const LOST_TEXT = 'Lost on the wire [[fake:lost]] [[fake:landed]]';
  const third = await p1.evaljs(PROPOSE(LOST_TEXT));
  ok(!third.fail, 'a third proposal (whose answer the fake adapter will LOSE) lands in awaiting-approval', JSON.stringify(third));
  const pid3 = third.id;
  const unknown = await p1.evaljs(`(async () => {
    const w = ${WIN};
    const b = w.content.querySelector('.chanwin-outbox .chan-prop[data-proposal="${pid3}"] button[data-approve]');
    if (!b) return { fail: 'no approve button' };
    b.click();
    for (let i = 0; i < 80; i++) {
      const card = w.content.querySelector('.chanwin-outbox .chan-prop[data-proposal="${pid3}"]');
      if (card && /chan-prop-unknown/.test(card.className)) return { cls: card.className, reasons: [...card.querySelectorAll('.chan-prop-reason')].map((x) => x.textContent), reconcile: !!card.querySelector('button[data-reconcile]'), approve: !!card.querySelector('button[data-approve]'), honesty: !!card.querySelector('.chan-prop-honesty') };
      await new Promise((r) => setTimeout(r, 250));
    }
    return { fail: 'never unknown', cls: w.content.querySelector('.chanwin-outbox .chan-prop[data-proposal="${pid3}"]')?.className || null };
  })()`);
  ok(!unknown.fail && !unknown.approve, 'EXIT P4 ①: a send whose answer was LOST repaints the card as UNKNOWN — not failed, no decision buttons', JSON.stringify(unknown));
  ok(!unknown.fail && unknown.reasons.some((r) => /answer was lost/.test(r)) && unknown.reasons.some((r) => /never retried automatically/i.test(r)), "the card carries the adapter's reason verbatim and the sentence that it is never retried", JSON.stringify(unknown.reasons));
  ok(!unknown.fail && unknown.reconcile && !unknown.honesty, 'the card offers Check outcome (fake-poll declares an idempotency mechanism) and no sender-line note (the switch is off)', JSON.stringify(unknown));
  const todosU = await readTodos();
  const unk = (todosU.open || []).filter((t) => /UNKNOWN outcome/.test(t.text));
  ok(unk.length === 1, 'EXIT P4 ②: exactly ONE For-you item asks the user to look at the platform', JSON.stringify((todosU.open || []).map((t) => t.text)));
  const oc = readAudit(pid3).find((a) => a.op === 'outcome');
  ok(!!oc && oc.lost === true && oc.state === 'unknown', 'the audit OUTCOME line says LOST (state unknown)', JSON.stringify(oc));
  const v1 = await readView(pid3);
  ok(!!v1 && v1.state === 'unknown' && v1.canReconcile === true && Number.isFinite(v1.attemptAt) && v1.wire && v1.wire.text === LOST_TEXT && v1.wire.honestyLine === false, 'the API view: unknown, canReconcile, the attempt instant and the WIRE text stamped (what the check compares against)', JSON.stringify(v1 && { state: v1.state, canReconcile: v1.canReconcile, attemptAt: v1.attemptAt, wire: v1.wire }));

  // Check outcome from the card ⇒ sent
  const settled = await p1.evaljs(`(async () => {
    const w = ${WIN};
    const b = w.content.querySelector('.chanwin-outbox .chan-prop[data-proposal="${pid3}"] button[data-reconcile]');
    if (!b) return { fail: 'no reconcile button' };
    b.click();
    for (let i = 0; i < 80; i++) {
      const card = w.content.querySelector('.chanwin-outbox .chan-prop[data-proposal="${pid3}"]');
      if (card && /chan-prop-sent/.test(card.className)) return { cls: card.className, line: card.querySelector('.chan-prop-reconcile')?.textContent || null, reconcile: !!card.querySelector('button[data-reconcile]') };
      await new Promise((r) => setTimeout(r, 250));
    }
    return { fail: 'never sent', cls: w.content.querySelector('.chanwin-outbox .chan-prop[data-proposal="${pid3}"]')?.className || null };
  })()`);
  ok(!settled.fail && !settled.reconcile, 'EXIT P4 ③: Check outcome from the card settles it to SENT and the button is gone', JSON.stringify(settled));
  ok(!settled.fail && /Checked 1/.test(settled.line || '') && /landed/.test(settled.line || ''), 'the card says "Checked 1× — last answer: it landed"', String(settled.line));
  const todosV = await readTodos();
  const unkDone = (todosV.resolved || []).find((t) => unk[0] && t.id === unk[0].id);
  ok(!(todosV.open || []).some((t) => unk[0] && t.id === unk[0].id) && !!unkDone && unkDone.resolvedBy === 'system', 'the unknown-outcome item is RETRACTED by the engine (as `system`)', JSON.stringify({ done: unkDone && [unkDone.status, unkDone.resolvedBy] }));
  const ops3 = readAudit(pid3).filter((a) => a.kind === 'outbox').map((a) => a.op);
  ok(JSON.stringify(ops3) === JSON.stringify(['propose', 'approve', 'attempt', 'outcome', 'reconcile-attempt', 'reconcile-outcome']), 'the audit holds propose → approve → attempt → outcome(lost) → reconcile-attempt → reconcile-outcome, and exactly ONE attempt line (nothing was re-sent)', ops3.join(' → '));
  const rco = readAudit(pid3).find((a) => a.op === 'reconcile-outcome');
  ok(!!rco && rco.answer === 'landed' && rco.sentAs === 'user' && rco.state === 'sent', 'the reconcile-outcome line says LANDED with the identity fields', JSON.stringify(rco));
  const v2 = await readView(pid3);
  ok(!!v2 && v2.state === 'sent' && v2.result && v2.result.reconciled === true && !!v2.result.vendorMessageId && v2.receipt && v2.receipt.reconciled === true && v2.reconcile && v2.reconcile.n === 1 && v2.reconcile.lastAnswer === 'landed', 'the proposal records the vendor id, the receipt says it was established by reconcile, one check counted', JSON.stringify(v2 && { result: v2.result, receipt: v2.receipt, reconcile: v2.reconcile }));

  // THE SENDER HONESTY SWITCH (§9.5): OFF by default, per channel, never on a user's own draft.
  // a4 (docs/design-communication-panel-ui.md §4.2): the switch is a CHECKABLE ROW of the
  // section's ⋯ menu (the `channel-adapter` contribution menu), read and clicked THROUGH the
  // menu — the section spreads no verbs above its rows any more.
  const SW_MENU = `(() => {
    for (const m of document.querySelectorAll('.context-menu')) m.remove();
    const row = document.querySelector('.rail-panel-channels .chan-row[data-conv="fake-poll/fake-poll-ops"]');
    let sec = row && row.parentElement;
    while (sec && !sec.classList.contains('chan-sec')) sec = sec.parentElement;
    const more = sec && sec.querySelector(':scope > .chan-sec-head .chan-sec-more');
    if (!more) return null;
    more.click();
    const chk = document.querySelector('.context-menu .chan-menu-check[data-honesty-line]');
    return chk ? { chk, item: chk.closest('.context-menu-item'), menu: chk.closest('.context-menu') } : null;
  })()`;
  const SW_READ = `(() => { const m = ${SW_MENU}; if (!m) return null; const out = { state: m.chk.dataset.honestyLine, label: m.item.textContent.trim() }; m.menu.remove(); return out; })()`;
  const SW_CLICK = (which) => `(() => { const m = ${SW_MENU}; if (!m) return false; const target = ${which === 'switch' ? 'm.item' : "[...m.menu.querySelectorAll('.context-menu-item')].find((x) => x !== m.item && /instance default/i.test(x.textContent))"}; if (!target) { m.menu.remove(); return false; } target.click(); for (const x of document.querySelectorAll('.context-menu')) x.remove(); return true; })()`;
  const sw0 = (await p1.evaljs(SW_READ)) || { fail: 'no switch' };
  ok(!sw0.fail && sw0.state === 'off' && /instance default/.test(sw0.label), "EXIT P4 ④: the section menu's Sender line row reads OFF (instance default) — decision 17 as overruled", JSON.stringify(sw0));
  const sw1 = await p1.evaljs(`(async () => {
    if (!${SW_CLICK('switch')}) return { fail: 'no switch' };
    for (let i = 0; i < 80; i++) {
      const c = ${SW_READ};
      if (c && c.state === 'on') return { state: c.state, label: c.label, after: i * 250 };
      await new Promise((r) => setTimeout(r, 250));
    }
    const c = ${SW_READ}; return { fail: 'never on', state: c && c.state };
  })()`);
  ok(!sw1.fail && sw1.state === 'on' && !/instance default/.test(sw1.label), "turning the channel's switch ON repaints the row off `channels-updated` (a per-channel choice, no longer the instance default)", JSON.stringify(sw1));
  const auditSw = fs.readFileSync(path.join(wt, 'data/channels/audit.ndjson'), 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((a) => a.kind === 'policy' && a.op === 'sender-honesty-line');
  ok(auditSw.some((a) => a.adapterId === 'fake-poll' && a.value === true), 'the switch change is audited', JSON.stringify(auditSw));
  const fourth = await p1.evaljs(PROPOSE('My own words, no line'));
  const fourthCard = fourth.fail ? null : await p1.evaljs(`(() => { const w = ${WIN}; const card = w.content.querySelector('.chanwin-outbox .chan-prop[data-proposal="${fourth.id}"]'); return card ? { honesty: !!card.querySelector('.chan-prop-honesty'), text: card.querySelector('.chan-prop-text')?.textContent || null } : { fail: 'no card' }; })()`);
  ok(!fourth.fail && fourthCard && !fourthCard.fail && fourthCard.honesty === false && fourthCard.text === 'My own words, no line', "a USER's own draft carries NO sender-line note even with the channel's switch on (nothing to disclose)", JSON.stringify(fourthCard));
  const v4 = fourth.fail ? null : await readView(fourth.id);
  ok(!!v4 && v4.honestyLine === null, 'the API view agrees: honestyLine null for a user draft', JSON.stringify(v4 && v4.honestyLine));
  // back to the instance default, and the pending draft rejected so the restart leg measures what ⑩ left
  const sw2 = await p1.evaljs(`(async () => {
    if (!${SW_CLICK('default')}) return { fail: 'no Use instance default row' };
    for (let i = 0; i < 80; i++) {
      const c = ${SW_READ};
      if (c && c.state === 'off' && /instance default/.test(c.label)) return { state: c.state, label: c.label };
      await new Promise((r) => setTimeout(r, 250));
    }
    const c = ${SW_READ}; return { fail: 'never back', state: c && c.state, label: c && c.label };
  })()`);
  ok(!sw2.fail && sw2.state === 'off', '"Use instance default" puts the channel back to following the (OFF) instance setting', JSON.stringify(sw2));
  if (!fourth.fail) {
    const rj = await (await fetch(`http://127.0.0.1:${PORT}/api/channels/outbox/${encodeURIComponent(fourth.id)}/reject`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason: 'e2e cleanup' }) })).json();
    ok(rj.ok === true, 'cleanup: the pending user draft is rejected through the route', JSON.stringify(rj));
  }
}

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
  const ob = await (await fetch(`http://127.0.0.1:${PORT}/api/channels/outbox`)).json();
  ok(Array.isArray(ob.proposals) && ob.proposals.some((p) => p.state === 'sent') && ob.proposals.some((p) => p.state === 'rejected'),
    'EXIT P3 ⑦: the outbox (a sent and a rejected proposal) survived the SIGKILL + reboot — outbox.json is written atomically', JSON.stringify((ob.proposals || []).map((p) => [p.id, p.state])));
  ok((ob.proposals || []).some((p) => p.state === 'sent' && p.reconcile && p.reconcile.n === 1 && p.reconcile.lastAnswer === 'landed' && p.result && p.result.reconciled === true && Number.isFinite(p.attemptAt) && p.wire && p.wire.text),
    'EXIT P4 ⑤: the reconciled proposal survived the reboot with its attempt instant, wire text and reconcile record on disk', JSON.stringify((ob.proposals || []).map((p) => [p.id, p.state, p.reconcile && p.reconcile.n])));
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
      const rows = [...document.querySelectorAll('.rail-panel-channels .chan-row.chan-tracked')];
      if (rows.length) return rows.map((r) => r.querySelector('.chan-chip') ? r.querySelector('.chan-chip').textContent : null);
      await new Promise((r) => setTimeout(r, 250));
    }
    return null;
  })()`);
  ok(Array.isArray(chips) && chips.length && chips.every(Boolean), 'every TRACKED row still carries a chip in zh', JSON.stringify(chips));
  ok(chips.some((x) => /[一-鿿]/.test(x)),
    'THE CHIP IS TRANSLATED — the honesty contract of this whole feature now speaks the reader\'s language', JSON.stringify(chips));
  await p1.evaljs(`localStorage.removeItem('vibespace.lang'), 1`);
}

// ── ⑫ THE a4 DESIGN INVARIANTS (docs/design-communication-panel-ui.md §4; owner
//    "界面很乱，没有层次") — measured on the rendered chrome, not on class names ──
// (a) rows sit on ONE grid: every freshness pill's right edge and every line-2
//     badge's right edge align within 1px across the panel; (b) nothing scrolls
//     sideways at 375px — the panel, a conversation window and the Outbox; (c)
//     every glyph on these surfaces is an SVG (no text symbol, no emoji);
//     (d) one chip colour per meaning — the five card states resolve to distinct
//     colours, `unknown` is not `failed`'s red, and a freshness AGE is the
//     neutral pill while `live` alone is green.
{
  await p1.evaljs(`(() => { const sb = window.app.sidebar; if (!sb.isOpen) sb.toggle(true); if (sb._activeTab !== 'channels') sb._railGo('channels'); return 1; })()`);
  await sleep(500);
  const grid = await p1.evaljs(`(async () => {
    for (let i = 0; i < 80; i++) { if (document.querySelectorAll('.rail-panel-channels .chan-row').length >= 4) break; await new Promise((r) => setTimeout(r, 250)); }
    const rows = [...document.querySelectorAll('.rail-panel-channels .chan-row')];
    const trackedRows = rows.filter((r) => r.classList.contains('chan-tracked')).length;
    const R = (el) => el.getBoundingClientRect();
    const visible = (el) => el && R(el).width > 0;
    const pills = rows.map((r) => r.querySelector('.chan-row-line .chan-chip')).filter(visible).map((e) => Math.round(R(e).right));
    // the VISIBLE needs-you badge of each row (the narrow-rail container query swaps the pair for one pill)
    const badges = rows.map((r) => [...r.querySelectorAll('.chan-row-sub .chan-unread, .chan-row-sub .chan-awaiting, .chan-row-sub .chan-untracked, .chan-row-sub .chan-row-needs')].filter(visible).pop()).filter(Boolean).map((e) => Math.round(R(e).right));
    const titles = rows.map((r) => Math.round(R(r.querySelector('.chan-row-title')).left));
    const lineOne = rows.map((r) => { const l = r.querySelector('.chan-row-line'); return [r.classList.contains('chan-tracked'), [...l.querySelectorAll('.chan-chip, .chan-unread, .chan-awaiting, .chan-untracked')].length]; });
    const spread = (xs) => xs.length ? Math.max(...xs) - Math.min(...xs) : 0;
    return { rows: rows.length, trackedRows, pills, badges, titles, lineOne, pillSpread: spread(pills), badgeSpread: spread(badges), titleSpread: spread(titles) };
  })()`);
  ok(grid.rows >= 4 && grid.trackedRows >= 2 && grid.pills.length === grid.trackedRows && grid.pillSpread <= 1, `(a) every TRACKED row's freshness pill sits on the same right edge (±1px over ${grid.trackedRows} of ${grid.rows} rows: spread ${grid.pillSpread})`, JSON.stringify(grid));
  ok(grid.badgeSpread <= 1 && grid.titleSpread <= 1, `(a) the line-2 badges share a right edge and the titles a left edge (spreads ${grid.badgeSpread} / ${grid.titleSpread})`, JSON.stringify(grid));
  ok(grid.lineOne.every(([tracked, n]) => n === (tracked ? 1 : 0)), '(a) line 1 carries exactly ONE pill on a tracked row and NONE on an untracked one — the freshness claim; unread / awaiting / untracked live on line 2', JSON.stringify(grid.lineOne));
  // the badge PAIR is the default; the ONE-pill collapse belongs to the narrow rail only. The rows
  // are inline-size containers themselves, so an unnamed @container query used to resolve against
  // the 166px row and collapse the pair at the 260px default (round 3) — pinned at both widths.
  const KINDS = `(() => { const R = (el) => el.getBoundingClientRect(); const vis = (el) => !!el && R(el).width > 0; const rows = [...document.querySelectorAll('.rail-panel-channels .chan-row')]; return { width: R(document.querySelector('.rail-panel-channels')).width, unread: rows.filter((r) => vis(r.querySelector('.chan-unread'))).length, needs: rows.filter((r) => vis(r.querySelector('.chan-row-needs'))).length, chips: rows.filter((r) => vis(r.querySelector('.chan-row-line .chan-chip'))).length, label: vis(document.querySelector('.rail-panel-channels .chan-outbox-label')), count: vis(document.querySelector('.rail-panel-channels .chan-sec-count')), name: vis(document.querySelector('.rail-panel-channels .chan-sec:not(.chan-connect) .chan-sec-name')), headTitle: (document.querySelector('.rail-panel-channels .chan-sec:not(.chan-connect) .chan-sec-head') || {}).title || '' }; })()`;
  const k260 = await p1.evaljs(KINDS);
  ok(k260.unread > 0 && k260.needs === 0 && k260.count && k260.name && k260.chips > 0, `(a) at the default rail (${Math.round(k260.width)}px of panel) the unread count and the awaiting pill are SEPARATE badges, the section name, count and the freshness pills show`, JSON.stringify(k260));
  await p1.evaljs(`(() => { const sb = window.app.sidebar; sb._resizer._setSize(200); sb._applySidebarLayoutWidth(200); return 1; })()`);
  await sleep(400);
  const k200 = await p1.evaljs(KINDS);
  ok(k200.width < k260.width && k200.needs > 0 && k200.unread === 0 && !k200.label, `(a) at the 200px rail (${Math.round(k200.width)}px of panel) the pair collapses to ONE needs-you pill and the Outbox label hides`, JSON.stringify(k200));
  // verifier r4: a "5…" freshness claim is worse than none, and a three-letter name stub says nothing —
  // under the narrow container the pill hides (its sentence rides the title's tooltip), the head keeps
  // the kind glyph + dot + COUNT and drops the name (the label rides the head's tooltip)
  ok(k200.chips === 0 && !k200.name && k200.count && k200.headTitle.length > 0, `(a) at the 200px rail the freshness pills and the section names hide, the section count stays and the head carries its label as a tooltip ("${k200.headTitle}")`, JSON.stringify(k200));
  await p1.evaljs(`(() => { const sb = window.app.sidebar; sb._resizer._setSize(260); sb._applySidebarLayoutWidth(260); return 1; })()`);
  await sleep(400);

  // (c) SVG-only glyphs, measured as text: no leaf text node on these surfaces is a bare symbol
  await p1.evaljs(`(() => { window.app.openChannel('fake-poll', 'fake-poll-ops'); window.app.openChannelOutbox(); return 1; })()`);
  await sleep(1500);
  const glyphs = await p1.evaljs(`(() => {
    const roots = [document.querySelector('.rail-panel-channels'), ...[...window.app.wm.windows.values()].filter((w) => w.type === 'channel' || w.type === 'channel-outbox').map((w) => w.content)].filter(Boolean);
    const SYM = /^[\\u2190-\\u21FF\\u2500-\\u27BF\\u2B00-\\u2BFF\\u3000-\\u303F\\uFE0F\\u{1F000}-\\u{1FAFF}·•▸▾⋯✕✎⚠✓✗]+$/u;
    const bad = []; let ic = 0, icSvg = 0;
    for (const root of roots) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let n; while ((n = walker.nextNode())) { const s = n.nodeValue.trim(); if (s && SYM.test(s)) bad.push(s + ' @ ' + (n.parentElement.className || n.parentElement.tagName)); }
      for (const el of root.querySelectorAll('.chan-ic')) { ic++; if (el.querySelector('svg')) icSvg++; }
    }
    return { roots: roots.length, bad, ic, icSvg };
  })()`);
  ok(glyphs.roots >= 3 && glyphs.bad.length === 0, '(c) no text-symbol glyph on the panel, a conversation window or the Outbox — every glyph is an SVG (§17)', JSON.stringify(glyphs));
  ok(glyphs.ic > 0 && glyphs.ic === glyphs.icSvg, `(c) every icon slot holds an <svg> (${glyphs.icSvg}/${glyphs.ic})`, JSON.stringify(glyphs));

  // (d) one colour per meaning, read off the REAL stylesheet: the five state pills are
  //     rendered as probes inside the Outbox list (the e2e store holds only some states),
  //     the rendered cards are checked against the same answers, then the probes go
  const colours = await p1.evaljs(`(() => {
    const ob = [...window.app.wm.windows.values()].find((w) => w.type === 'channel-outbox');
    const all = ob.content.querySelector('.chan-seg [data-view="all"]'); if (all) all.click();
    const c = (el) => el && getComputedStyle(el).color;
    const list = ob.content.querySelector('.chan-outbox-list');
    const st = {};
    for (const k of ['awaiting-approval', 'sent', 'failed', 'unknown', 'rejected']) { const p = document.createElement('span'); p.className = 'chan-prop-state chan-prop-state-' + k; p.textContent = k; list.appendChild(p); st[k] = c(p); p.remove(); }
    const rendered = {}; for (const el of ob.content.querySelectorAll('.chan-prop-state')) { const k = [...el.classList].find((x) => x.startsWith('chan-prop-state-')).slice('chan-prop-state-'.length); rendered[k] = c(el); }
    st.renderedAgree = Object.entries(rendered).every(([k, v]) => !(k in st) || st[k] === v);
    const panel = document.querySelector('.rail-panel-channels');
    const chips = [...panel.querySelectorAll('.chan-row-line .chan-chip')].map((el) => ({ live: el.classList.contains('chan-chip-live'), off: el.classList.contains('chan-chip-off'), color: c(el) }));
    return { states: st, chips };
  })()`);
  const stc = colours.states;
  const distinct = new Set(['awaiting-approval', 'sent', 'failed', 'unknown', 'rejected'].map((k) => stc[k]).filter(Boolean)).size;
  ok(stc['awaiting-approval'] && stc.sent && stc.failed && stc.unknown && stc.rejected && distinct === 5 && stc.renderedAgree === true, '(d) the five card states render in FIVE distinct colours (one colour per meaning), and the rendered cards agree', JSON.stringify(stc));
  ok(stc.unknown !== stc.failed && stc.rejected !== stc.failed, "(d) `unknown` (not a failure, §9.4) and `rejected` never wear `failed`'s red", JSON.stringify(stc));
  const ages = colours.chips.filter((x) => !x.live && !x.off).map((x) => x.color), lives = colours.chips.filter((x) => x.live).map((x) => x.color);
  ok(new Set(ages).size <= 1 && (!lives.length || (new Set(lives).size === 1 && !ages.includes(lives[0]))), '(d) every freshness AGE is the one neutral pill; `live` alone is a different (green) colour', JSON.stringify(colours.chips));

  // (b) 375px: nothing scrolls sideways on the three surfaces
  await p1.cdp('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 1, mobile: false });
  await sleep(600);
  const narrow = await p1.evaljs(`(() => {
    const out = {};
    const probe = (name, el) => { if (!el) { out[name] = null; return; } out[name] = { sw: el.scrollWidth, cw: el.clientWidth, over: el.scrollWidth > el.clientWidth + 1 }; };
    probe('panel', document.querySelector('.rail-panel-channels'));
    for (const w of window.app.wm.windows.values()) if (w.type === 'channel') probe('window', w.content.querySelector('.chanwin')); else if (w.type === 'channel-outbox') probe('outbox', w.content.querySelector('.chanwin'));
    const wide = [];
    for (const w of window.app.wm.windows.values()) if (w.type === 'channel' || w.type === 'channel-outbox') for (const el of w.content.querySelectorAll('.chan-prop, .chanwin-bar, .chanwin-foot, .chan-prop-actions')) { const r = el.getBoundingClientRect(); if (r.right > innerWidth + 1) wide.push(el.className + ' right=' + Math.round(r.right)); }
    return { ...out, wide, vw: innerWidth };
  })()`);
  ok(narrow.vw === 375 && narrow.panel && !narrow.panel.over && narrow.window && !narrow.window.over && narrow.outbox && !narrow.outbox.over, '(b) at 375px the panel, a conversation window and the Outbox have NO sideways overflow', JSON.stringify(narrow));
  ok(narrow.wide.length === 0, '(b) no card, bar, foot or action row reaches past the 375px viewport', JSON.stringify(narrow.wide));
  await p1.cdp('Emulation.setDeviceMetricsOverride', { width: 1200, height: 800, deviceScaleFactor: 1, mobile: false });
  await sleep(400);
  await p1.evaljs(`(() => { for (const w of [...window.app.wm.windows.values()].filter((x) => x.type === 'channel' || x.type === 'channel-outbox')) window.app.wm.closeWindow(w.id); return 1; })()`);
}

// ── ⑬ THE PANEL REPAINTS IN PLACE (a1 D12, verifier r4): a `channels-updated`
//    broadcast neither tears the panel down nor refetches — the scroller's
//    scrollTop and a fold the user made survive N broadcasts ──
{
  // a short viewport so the rail's list actually scrolls
  await p1.cdp('Emulation.setDeviceMetricsOverride', { width: 1200, height: 420, deviceScaleFactor: 1, mobile: false });
  await sleep(400);
  const armed = await p1.evaljs(`(async () => {
    const sb = window.app.sidebar; if (!sb.isOpen) sb.toggle(true); if (sb._activeTab !== 'channels') sb._railGo('channels');
    for (let i = 0; i < 80; i++) { if (document.querySelectorAll('.rail-panel-channels .chan-row').length >= 4) break; await new Promise((r) => setTimeout(r, 250)); }
    const m = { panelRemoved: 0, panelAdded: 0, fetches: 0, broadcasts: 0, samples: [] };
    window.__d12 = m;
    const mo = new MutationObserver((muts) => { for (const x of muts) { for (const n of x.removedNodes) if (n.nodeType === 1 && n.classList.contains('rail-panel-channels')) m.panelRemoved++; for (const n of x.addedNodes) if (n.nodeType === 1 && n.classList.contains('rail-panel-channels')) m.panelAdded++; } });
    mo.observe(sb.listEl, { childList: true, subtree: true });
    const of = window.fetch; window.fetch = function (u, ...r) { if (/^\\/api\\/channels(\\?|$)/.test(String(u))) m.fetches++; return of.call(this, u, ...r); };
    m.unpatch = () => { mo.disconnect(); window.fetch = of; };
    window.app.ws.onGlobal((msg) => { if (msg.type === 'channels-updated') { m.broadcasts++; setTimeout(() => m.samples.push(sb.listEl.scrollTop), 300); } });
    const head = document.querySelector('.rail-panel-channels .chan-sec:not(.chan-connect) .chan-sec-head'); if (head) head.click();   // a fold the user made
    const sc = sb.listEl; sc.scrollTop = 60; m.scrollSet = sc.scrollTop; m.scrollable = sc.scrollHeight - sc.clientHeight;
    return { scrollSet: m.scrollSet, scrollable: m.scrollable, folded: document.querySelectorAll('.rail-panel-channels .chan-sec.chan-collapsed').length };
  })()`);
  ok(armed.scrollSet >= 30 && armed.folded === 1, `FIXTURE: the list scrolls (${armed.scrollSet}px of ${armed.scrollable}) and one section is folded`, JSON.stringify(armed));
  const act = async (method, p, body) => (await fetch(`http://127.0.0.1:${PORT}${p}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })).status;
  await act('POST', '/api/channels/fake-poll/fake-poll-announce/track', { tracked: true }); await sleep(900);
  await act('POST', '/api/channels/fake-poll/fake-poll-ops/read', {}); await sleep(900);
  await act('PUT', '/api/channels/adapters/fake-scan', { enabled: false }); await sleep(900);
  await act('PUT', '/api/channels/adapters/fake-scan', { enabled: true }); await sleep(900);
  await act('POST', '/api/channels/fake-poll/fake-poll-announce/track', { tracked: false }); await sleep(1500);
  const m = await p1.evaljs(`(() => { const m = window.__d12; m.unpatch(); const sb = window.app.sidebar; return { panelRemoved: m.panelRemoved, panelAdded: m.panelAdded, fetches: m.fetches, broadcasts: m.broadcasts, samples: m.samples, scrollNow: sb.listEl.scrollTop, scrollSet: m.scrollSet, foldedAfter: document.querySelectorAll('.rail-panel-channels .chan-sec.chan-collapsed').length, rows: document.querySelectorAll('.rail-panel-channels .chan-row').length }; })()`);
  ok(m.broadcasts >= 4, `FIXTURE: the five route actions reached the page as broadcasts (${m.broadcasts})`, JSON.stringify(m));
  ok(m.panelRemoved === 0 && m.panelAdded === 0, `D12: across ${m.broadcasts} broadcasts the panel is NEVER torn down and rebuilt (removed ${m.panelRemoved}, added ${m.panelAdded} — it was 7/7 for 7)`, JSON.stringify(m));
  ok(m.fetches === 0, `D12: ZERO /api/channels fetches across ${m.broadcasts} broadcasts — the digest on the broadcast is the computation (it was one per broadcast)`, JSON.stringify(m));
  ok(Math.abs(m.scrollNow - m.scrollSet) <= 1 && m.samples.length >= 4 && m.samples.every((x) => Math.abs(x - m.scrollSet) <= 1), `D12: the scroller stays at ${m.scrollSet}px through every repaint (samples ${JSON.stringify(m.samples)}; it used to clamp to 0)`, JSON.stringify(m));
  ok(m.foldedAfter === 1 && m.rows >= 4, 'D12: a section the user folded stays folded and the rows are still there', JSON.stringify(m));
  await p1.evaljs(`(() => { const h = document.querySelector('.rail-panel-channels .chan-sec.chan-collapsed .chan-sec-head'); if (h) h.click(); return 1; })()`);
  await p1.cdp('Emulation.setDeviceMetricsOverride', { width: 1200, height: 800, deviceScaleFactor: 1, mobile: false });
  await sleep(400);
}

// ── ⑭ THE WARNING LINE'S GLYPH SITS BESIDE ITS SENTENCE (verifier r4): the
//    `> span` flex rule once matched the icon's span too, so the alert glyph
//    became a 124px box and the sentence started ~110px to its right, or the
//    glyph sat alone on its own line. Measured on the fake sections' own
//    needs-credentials line (this boot provides no cluster credential) at three
//    rail widths ──
{
  const NOTES = `(() => { const R = (el) => el.getBoundingClientRect(); return [...document.querySelectorAll('.rail-panel-channels .chan-sec-note.chan-warn')].map((n) => { const ic = n.querySelector('.chan-ic'); const s = n.querySelector('span:not(.chan-ic)'); if (!ic || !s) return { missing: true }; const a = R(ic), b = R(s); return { gap: Math.round(b.left - a.right), icW: Math.round(a.width), sameLine: Math.abs(a.top - b.top) < 12, text: s.textContent.slice(0, 40) }; }); })()`;
  for (const w of [260, 340, 500]) {
    await p1.evaljs(`(() => { const sb = window.app.sidebar; sb._resizer._setSize(${w}); sb._applySidebarLayoutWidth(${w}); return 1; })()`);
    await sleep(400);
    const notes = await p1.evaljs(NOTES);
    ok(notes.length >= 1 && notes.every((n) => !n.missing && n.gap >= 0 && n.gap <= 8 && n.icW <= 16 && n.sameLine), `at a ${w}px rail every warning line's glyph is a ≤16px slot whose right edge is within 8px of its sentence, on the same line (${notes.length} lines)`, JSON.stringify(notes));
  }
  await p1.evaljs(`(() => { const sb = window.app.sidebar; sb._resizer._setSize(260); sb._applySidebarLayoutWidth(260); return 1; })()`);
  await sleep(300);
}

// ── ⑮ A TASK GROUP IS NAMED BY ITS TITLE, NEVER ITS ID (a1 A5; verifier r4:
//    the fix was unpinned) — the Assign & filter "Wake" select and the Reach
//    dialog's roster + a granted row ──
{
  const J = { 'Content-Type': 'application/json' };
  // ⑨ left the page in zh (the language switch takes effect on load) — this leg matches the ⋯ menu's English words
  await p1.evaljs(`localStorage.removeItem('vibespace.lang'), 1`);
  ok(await p1.load(), 'page 1 reloaded in en for the menu words');
  const mk = await (await fetch(`http://127.0.0.1:${PORT}/api/tasks`, { method: 'POST', headers: J, body: JSON.stringify({ title: 'Ops triage' }) })).json();
  const gid = mk.task && mk.task.id;
  ok(!!gid && /^T-/.test(gid) && gid !== 'Ops triage', 'FIXTURE: a Task Group whose generated `T-…` id differs from its title', JSON.stringify(mk));
  const nameOnly = await (await fetch(`http://127.0.0.1:${PORT}/api/tasks`, { method: 'POST', headers: J, body: JSON.stringify({ name: 'Only a name' }) })).json();
  ok(!!nameOnly.error && /title/.test(nameOnly.error), 'NEGATIVE CONTROL: the store has no `name` — a name-only group is REFUSED by name, so `name` can never be what a row is named by', JSON.stringify(nameOnly));
  const seen = await p1.evaljs(`(async () => { for (let i = 0; i < 40; i++) { const g = (window.app.sidebar._tasks || []).find((x) => x.id === ${JSON.stringify(gid)}); if (g) return { title: g.title, hasName: 'name' in g, old: g.name || g.id }; await new Promise((r) => setTimeout(r, 250)); } return null; })()`);
  ok(!!seen && seen.title === 'Ops triage' && !seen.hasName && seen.old === gid, 'CONTROL: the client\'s task row carries `title` and no `name`, so the pre-a3 formula (`name || id`) names it by its id — the defect this leg pins', JSON.stringify(seen));
  const assign = await p1.evaljs(`(async () => {
    const w = window.app.openChannel('fake-poll', 'fake-poll-ops');
    for (let i = 0; i < 40; i++) { if (w.content.querySelector('[data-channel-assign]')) break; await new Promise((r) => setTimeout(r, 250)); }
    w.content.querySelector('[data-channel-assign]').click();
    for (let i = 0; i < 40; i++) { if (document.querySelector('#chan-assign-dialog select')) break; await new Promise((r) => setTimeout(r, 250)); }
    const sel = document.querySelector('#chan-assign-dialog select');
    const opts = sel ? [...sel.options].map((o) => o.textContent) : [];
    for (const o of document.querySelectorAll('.dialog-overlay')) o.remove();
    return opts;
  })()`);
  ok(assign.some((o) => /Ops triage/.test(o)) && !assign.some((o) => o.includes(gid)), 'PIN: the Assign & filter "Wake" select names the group by its TITLE and never shows its id', JSON.stringify(assign));
  // a grant that carries only {kind, id} (an assignment's shape) must be named from the roster
  const granted = await (await fetch(`http://127.0.0.1:${PORT}/api/channels/fake-poll/fake-poll-ops/reach`, { method: 'PUT', headers: J, body: JSON.stringify({ principal: { kind: 'group', id: gid }, level: 'visible' }) })).json();
  ok(!!granted && !granted.error, 'FIXTURE: the group is granted reach with a name-less principal', JSON.stringify(granted));
  await sleep(600);
  const reach = await p1.evaljs(`(async () => {
    const w = [...window.app.wm.windows.values()].find((x) => x._openSpec && x._openSpec.convId === 'fake-poll-ops');
    const b = w.content.querySelector('.chanwin-title-row .icon-btn'); if (!b) return { fail: 'no ⋯' }; b.click();
    await new Promise((r) => setTimeout(r, 200));
    const it = [...document.querySelectorAll('.context-menu .context-menu-item')].find((x) => /^Reach & policy/.test(x.textContent.trim())); if (!it) return { fail: 'no Reach item: ' + [...document.querySelectorAll('.context-menu .context-menu-item')].map((x) => x.textContent.trim()).join('|') };
    it.click();
    for (let i = 0; i < 40; i++) { if (document.querySelector('#chan-reach-dialog .chan-reach-row')) break; await new Promise((r) => setTimeout(r, 250)); }
    const rows = [...document.querySelectorAll('#chan-reach-dialog .chan-reach-row .chan-reach-who')].map((x) => x.textContent);
    const roster = [...document.querySelectorAll('#chan-reach-dialog .chan-reach-add select option')].map((o) => o.textContent);
    for (const o of document.querySelectorAll('.dialog-overlay')) o.remove();
    return { rows, roster };
  })()`);
  ok(!reach.fail && reach.rows.some((x) => /Ops triage/.test(x)) && !reach.rows.some((x) => x.includes(gid)), 'PIN: the Reach dialog names the granted group by its TITLE (resolved from the roster — the grant carried no name) and never its id', JSON.stringify(reach));
  ok(!reach.fail && reach.roster.some((x) => /Ops triage/.test(x)) && !reach.roster.some((x) => x.includes(gid)), 'PIN: the Reach roster select names the group by its TITLE and never its id', JSON.stringify(reach));
  await fetch(`http://127.0.0.1:${PORT}/api/channels/fake-poll/fake-poll-ops/reach`, { method: 'PUT', headers: J, body: JSON.stringify({ principal: { kind: 'group', id: gid }, level: null }) });
  await p1.evaljs(`(() => { for (const w of [...window.app.wm.windows.values()].filter((x) => x.type === 'channel')) window.app.wm.closeWindow(w.id); return 1; })()`);
}

// ── ⑯ THE FRESHNESS PILL FITS (verifier r4): at the 260px default rail, in
//    en, zh AND ja, no pill is truncated (the ellipsis once ate ja's negation —
//    ポーリングしていま… read as "polling" when the truth was "not polling"),
//    and no untracked row carries one ──
{
  const PILLS = `(async () => {
    const sb = window.app.sidebar; if (!sb.isOpen) sb.toggle(true); if (sb._activeTab !== 'channels') sb._railGo('channels');
    for (let i = 0; i < 80; i++) { if (document.querySelectorAll('.rail-panel-channels .chan-row').length >= 4) break; await new Promise((r) => setTimeout(r, 250)); }
    const rows = [...document.querySelectorAll('.rail-panel-channels .chan-row')];
    return { width: document.querySelector('.rail-panel-channels').getBoundingClientRect().width, rows: rows.map((r) => { const c = r.querySelector('.chan-row-line .chan-chip'); return { tracked: r.classList.contains('chan-tracked'), chip: c ? c.textContent : null, fits: c ? c.scrollWidth <= c.clientWidth : null, w: c ? c.getBoundingClientRect().width : 0 }; }) };
  })()`;
  for (const lang of ['zh', 'ja', 'en']) {
    await p1.evaljs(`(() => { ${lang === 'en' ? "localStorage.removeItem('vibespace.lang')" : `localStorage.setItem('vibespace.lang', ${JSON.stringify(lang)})`}; return 1; })()`);
    ok(await p1.load(), `page 1 reloaded in ${lang}`);
    const r = await p1.evaljs(PILLS);
    const tracked = r.rows.filter((x) => x.tracked), untracked = r.rows.filter((x) => !x.tracked);
    ok(tracked.length >= 2 && tracked.every((x) => x.chip && x.fits === true), `${lang}: at the ${Math.round(r.width)}px panel every tracked row's pill is drawn whole (no ellipsis)`, JSON.stringify(r.rows));
    ok(untracked.length >= 1 && untracked.every((x) => x.chip === null), `${lang}: no untracked row carries a freshness pill`, JSON.stringify(untracked));
  }
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
