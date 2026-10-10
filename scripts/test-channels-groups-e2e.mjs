#!/usr/bin/env node
// AGENT GROUPS IN THE PANEL, END TO END (design-communication-panel.zh.md §22 +
// §22.5, chunk g3; heavy tier — a real worktree server and headless chrome).
//
// THE FIXTURE: two FAKE AGENT SESSIONS the server adopts at boot the way it
// adopts any surviving session — a real `dtach -n` socket + its session meta
// (a conversation id, a name, chat mode) — whose program is a STUB CLI: it
// publishes itself in the (scratch) home's CLI session registry
// (`~/.claude/sessions/<pid>.json`, the registry THE delivery ladder's
// local-inbox rung reads) and appends every frame it is handed to a log. So a
// WAKE travels the REAL ladder, through the REAL spend authorizer, into a
// stub that RECORDS it — nothing is ever billed, nothing leaves the machine.
//
// What it drives, as the owner does in the panel:
//   ① the FIRST SCREEN is the group list; "New group" opens the dialog: the
//      two live sessions are listed (under "No task group"), nothing
//      pre-selected; the echo says "will wake 2 agent(s)" with Wake now ON;
//      the group is created with a HOSTILE name and its window opens
//   ② the hostile name renders as TEXT everywhere (row, window bar, taskbar
//      title) — no element injected, no script ran
//   ③ each invitee's stub received exactly ONE invite frame (the create's
//      wake count), carrying the opening context
//   ④ the owner sets alpha's notify to `always` in the group detail (the
//      select; beta stays `next-turn`), then SENDS from the window composer
//      as You: alpha's stub records the wake, beta's records NOTHING (control:
//      beta's count is asserted unchanged), the toast says "woke 1", the
//      message is drawn as "You" at once
//   ⑤ the @-autocomplete: "@be" offers beta, Enter inserts "@beta ", the
//      preview names beta, the send wakes beta — the mention rule end to end
//   ⑥ THE LIST ORDERS BY ACTIVITY: groups and a linked account's fake conversation in
//      ONE list, newest first (the fake's records carry their own instants —
//      the fixture includes future-dated ones, so it is placed by them, never
//      by a guess); a second group (created later) is ahead of the first, a
//      message in the first moves it ahead again — repainted in place from
//      `channel-groups-updated`, zero fetches
//   ⑦ an AGENT posts into the group (its session token, the CLI's route): the
//      row shows 1 unread and the rail's Channels badge counts it; opening the
//      window marks it read (the owner's act) and the rail badge drops by one
//   ⑧ the Accounts section's fold is PERSISTED: folded, reloaded, still folded
//   ⑨ R3 (2026-09-26, design §23): the first screen is the ATTENTION list — the groups and no untouched
//      conversation; 5 handed to alpha + 3 READ by beta through its own agent route + 1 draft awaiting ⇒
//      exactly those 9 join, one tag each ("→ alpha" / "beta read …" / "1 to approve"), the header's two
//      counts, "All" = the whole list, the filter in both views ("{n} more in All" + the message search),
//      and at 375 px one column with the tag under the title (⑥ reads the list through "All")
//   ⑩ 2026-09-27 (lane channel-withdraw): beta proposes, then WITHDRAWS through its own route ⇒ the card
//      reads "Withdrawn by beta · wrong thread" with no buttons and the For-you row resolves, no reload;
//      "Approve ▾" offers the two deliveries + "Approve with edits…", the choice is remembered as the next
//      primary, "wake the agent now" reaches beta's stub ONCE ("Handed to beta at HH:MM — it was woken for
//      it"), "tell it with its next message" reads "Waiting for beta's next message" until beta's next
//      prompt drains the stash — the same card's fate line patched in place
//   ⑫ lane stash-any-turn (2026-10-05): a group message parked for beta's next turn rides a group wake (alpha's @beta) —
//      the woken turn's prompt-context carries it under the echo guard's words, the strip empties, the card is drawn
//
// Everything is per-pid (scripts/scratch.mjs), the server runs under a NAMED
// scratch HOME, every process this suite starts is ended by it. AUTH IS ON
// (r3): the owner logs in and drives the page with its cookie — the owner's
// real rung, where its routes are not paced, so no leg sleeps out a floor.
// Run: node scripts/test-channels-groups-e2e.mjs   (SKIPs without chrome/dtach)
import { execSync, execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePort, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv } from './scratch.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port for every server this suite boots (never the machine-global :7/5901 — test-architecture §57)
const require = createRequire(import.meta.url);

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
try { execFileSync('dtach', ['--help'], { stdio: 'ignore' }); } catch (e) { if (e.code === 'ENOENT') { console.log('SKIP: no dtach on PATH (the fixture sessions are dtach sessions)'); process.exit(0); } }

const PORT = await freePort(), CDP_PORT = await freePort();
const wt = scratch('chan-groups-e2e');
const fakeHome = scratchHome('chan-groups-e2e-home', fs);
const chromeDir = scratch('chan-groups-e2e-chrome');

let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── throwaway worktree + WORKING-TREE overlay (a pre-commit run tests what is about to ship) ──
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) {
  execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
}
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.writeFileSync(path.join(wt, 'src/lib/build-version.js'), `export const BUILD_VERSION = ${JSON.stringify(require(path.join(repo, 'package.json')).version)};\n`);
execSync('npx esbuild src/client.js --bundle --outfile=public/bundle.js --format=iife --platform=browser --target=es2020 --loader:.css=css', { cwd: wt, stdio: 'ignore' });

// ── THE FIXTURE: two fake agent sessions (a dtach socket + meta each) whose program is a STUB CLI ──
const STUB = path.join(wt, 'stub-cli.cjs');
fs.writeFileSync(STUB, `'use strict';
// a STUB agent CLI: publishes this process in the CLI session registry of $HOME (the
// registry the delivery ladder's local-inbox rung reads) and RECORDS every frame it is handed
const net = require('net'), fs = require('fs'), path = require('path');
const [cid, name, sock, log] = process.argv.slice(2);
try { fs.unlinkSync(sock); } catch {}
const dir = path.join(process.env.HOME, '.claude', 'sessions');
fs.mkdirSync(dir, { recursive: true });
const srv = net.createServer((c) => { let buf = ''; c.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (line) fs.appendFileSync(log, line + '\\n'); } }); c.on('error', () => {}); });
srv.listen(sock, () => fs.writeFileSync(path.join(dir, process.pid + '.json'), JSON.stringify({ pid: process.pid, sessionId: cid, messagingSocketPath: sock, name })));
setInterval(() => {}, 1 << 30);
`);
const SOCK_DIR = path.join(wt, 'data/sockets'), META_DIR = path.join(wt, 'data/session-meta');
fs.mkdirSync(SOCK_DIR, { recursive: true }); fs.mkdirSync(META_DIR, { recursive: true });
const AGENTS = [
  { key: 'a', cid: 'a1a1a1a1-0000-4000-8000-00000000000a', name: 'alpha', token: 'vsst_' + 'e2egroupsalpha000000000000000001' },
  { key: 'b', cid: 'b2b2b2b2-0000-4000-8000-00000000000b', name: 'beta', token: 'vsst_' + 'e2egroupsbeta0000000000000000002' },
];
const t0 = Date.now();
for (const [i, ag] of AGENTS.entries()) {
  ag.sockName = `cw-${i + 1}-${t0}`;
  ag.inbox = path.join(wt, `inbox-${ag.key}.sock`);
  ag.log = path.join(wt, `frames-${ag.key}.ndjson`);
  fs.writeFileSync(path.join(META_DIR, ag.sockName + '.json'), JSON.stringify({
    webuiSessionId: `sess-grp-${ag.key}`, sockName: ag.sockName, claudeSessionId: ag.cid, backendSessionId: ag.cid,
    name: ag.name, mode: 'chat', backend: 'claude', cwd: wt, createdAt: t0, agentToken: ag.token,
  }));
  execFileSync('dtach', ['-n', path.join(SOCK_DIR, ag.sockName), '-E', '-z', process.execPath, STUB, ag.cid, ag.name, ag.inbox, ag.log], { env: { ...process.env, HOME: fakeHome } });
}
const frames = (ag) => { try { return fs.readFileSync(ag.log, 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((f) => f.type === 'user'); } catch { return []; } };

let srv = null;
const PASSWORD = 'e2e-groups-' + process.pid;
const bootServer = () => spawn(process.execPath, ['server.js'], {
  cwd: wt, stdio: 'ignore',
  // AUTH ON (r3): the owner's REAL rung — a cookie proves the owner, so the
  // owner's routes are not paced (expectWakes is still required) and no leg
  // has to wait out the 30 s per-target floor (it slept 30 s here before)
  // R3 (§23): 15 synthetic rooms per fake account (the NAMED seam) — the first screen's attention list is
  // judged among ~50 conversations, most of which nothing touched
  env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: PASSWORD, VIBESPACE_CHANNELS_FAKE: '1', VIBESPACE_CHANNELS_FAKE_CONVS: '15' },
});
srv = bootServer();
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu',
  '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1400,1000', '--disable-background-timer-throttling',
  `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore' });

const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv && srv.kill('SIGKILL'); } catch {}
  // the fixture's dtach masters + stub CLIs are THIS suite's processes — ended by evidence (their argv names this scratch tree)
  try { execFileSync('pkill', ['-KILL', '-f', STUB], { stdio: 'ignore' }); } catch {}
  try { execFileSync('pkill', ['-KILL', '-f', SOCK_DIR], { stdio: 'ignore' }); } catch {}
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  for (const d of [chromeDir, fakeHome, wt]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
};
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });

const waitServer = async () => { for (let i = 0; i < 160; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); return true; } catch { await sleep(250); } } return false; };
ok(await waitServer(), 'the worktree server booted');
// the owner's login: ONE cookie for the node-side calls and the page
const unauthed = await fetch(`http://127.0.0.1:${PORT}/api/channel-groups`).then((r) => r.status).catch(() => 0);
ok(unauthed === 401, `FIXTURE: auth is ON — a cookie-less owner route answers 401 (${unauthed})`);
const login = await fetch(`http://127.0.0.1:${PORT}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: PASSWORD }) });
const TOKEN = ((login.headers.get('set-cookie') || '').match(/vs_token=([a-f0-9]+)/) || [])[1] || null;
ok(login.status === 200 && !!TOKEN, 'FIXTURE: the owner logs in (the vs_token cookie)');
const api = async (method, p, body, headers = {}) => { const r = await fetch(`http://127.0.0.1:${PORT}${p}`, { method, headers: { 'Content-Type': 'application/json', Cookie: `vs_token=${TOKEN}`, ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }); let j = null; try { j = await r.json(); } catch {} return { status: r.status, body: j }; };
let roster = null;
for (let i = 0; i < 60; i++) { roster = await api('GET', '/api/channel-groups/roster'); if (roster.body && Array.isArray(roster.body.sessions) && roster.body.sessions.length >= 2) break; await sleep(500); }
ok(roster.body && AGENTS.every((ag) => roster.body.sessions.some((s) => s.cid === ag.cid && s.name === ag.name)), 'FIXTURE: the server adopted BOTH fake sessions and the roster lists them (conversation id + name)', JSON.stringify(roster.body));
ok(AGENTS.every((ag) => fs.readdirSync(path.join(fakeHome, '.claude', 'sessions')).some((f) => JSON.parse(fs.readFileSync(path.join(fakeHome, '.claude', 'sessions', f), 'utf-8')).sessionId === ag.cid)), 'FIXTURE: each stub CLI published itself in the SCRATCH home\'s CLI registry');

// ── CDP plumbing ──
const WebSocket = require('ws');
async function newPage() {
  const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' });
  const tgt = await r.json();
  const ws = new WebSocket(tgt.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((res) => ws.on('open', res));
  let seq = 0; const pend = new Map();
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const cdp = (method, params = {}) => new Promise((res) => { const id = ++seq; pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Network.setCookie', { name: 'vs_token', value: TOKEN, url: `http://127.0.0.1:${PORT}/`, httpOnly: true });
  const evaljs = async (expr) => {
    const r2 = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r2.result?.exceptionDetails) throw new Error('page threw: ' + JSON.stringify(r2.result.exceptionDetails).slice(0, 900));
    if (!r2.result || !r2.result.result || !('value' in r2.result.result)) throw new Error('no value from page: ' + JSON.stringify(r2).slice(0, 600));
    return r2.result.result.value;
  };
  const load = async () => {
    await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
    for (let i = 0; i < 160; i++) { try { if (await evaljs('!!(window.app && window.app.wm && window.app.sidebar)')) return true; } catch {} await sleep(250); }
    return false;
  };
  return { cdp, evaljs, load };
}
const p1 = await newPage();
ok(await p1.load(), 'page 1 loaded the app');
const until = async (expr, ms = 20000) => { const end = Date.now() + ms; let v = null; while (Date.now() < end) { try { v = await p1.evaljs(expr); } catch {} if (v) return v; await sleep(250); } return v; };
const OPEN_PANEL = `(async () => { const sb = window.app.sidebar; if (!sb._railEl) return false; if (!sb.isOpen) sb.toggle(true); if (sb._activeTab !== 'channels') sb._railGo('channels'); for (let i = 0; i < 80; i++) { if (document.querySelector('.rail-panel-channels .chan-groups')) return true; await new Promise((r) => setTimeout(r, 250)); } return false; })()`;
ok(await p1.evaljs(OPEN_PANEL), 'the Channels rail panel renders the GROUP LIST as its first section');
const order = await p1.evaljs(`(() => { const l = document.querySelector('.rail-panel-channels .chan-list'); return [...l.children].map((c) => c.className.split(' ')[0] + (c.dataset.part ? ':' + c.dataset.part : '')); })()`);
ok(order[0] === 'chan-groups' && order.includes('chan-part:accounts') && order.includes('chan-part:watcher') && order.indexOf('chan-part:accounts') > 0, 'FIRST the group list, THEN the secondary sections (Accounts, Message watcher)', JSON.stringify(order));

// ── ① New group ──
const HOSTILE = '<img src=x onerror="window.__pwned=1">lane & co';
const CONTEXT = 'you two split the migration: alpha schema, beta data';
const dlg = await p1.evaljs(`(async () => {
  document.querySelector('.rail-panel-channels [data-new-group]').click();
  // channel-polish (2026-09-27): the members are picked with the ONE principal picker (rows, chips)
  for (let i = 0; i < 80; i++) { if (document.querySelectorAll('#chan-group-new-dialog .chan-gpick .pp-row').length >= 2) break; await new Promise((r) => setTimeout(r, 250)); }
  const d = document.getElementById('chan-group-new-dialog');
  if (!d) return { fail: 'no dialog' };
  const rows = [...d.querySelectorAll('.chan-gpick .pp-row')];
  const out = { names: [...d.querySelectorAll('.chan-gpick .pp-row .pp-name')].map((n) => n.textContent), secs: [...d.querySelectorAll('.chan-gpick .pp-sec')].map((n) => n.textContent), preChecked: rows.filter((b) => b.getAttribute('aria-selected') === 'true').length, wakeOn: d.querySelector('.chan-group-wake input').checked, disabledBefore: d.querySelector('[data-group-submit]').disabled };
  const name = d.querySelector('.chan-group-name'); name.value = ${JSON.stringify(HOSTILE)}; name.dispatchEvent(new Event('input'));
  for (const b of rows) b.click();
  out.chips = [...d.querySelectorAll('.chan-gpick .pp-chip-name')].map((n) => n.textContent);
  const ctx = d.querySelector('.chan-group-context'); ctx.value = ${JSON.stringify(CONTEXT)};
  out.echo = d.querySelector('.chan-group-echo').textContent;
  out.disabledAfter = d.querySelector('[data-group-submit]').disabled;
  d.querySelector('[data-group-submit]').click();
  for (let i = 0; i < 80; i++) { const w = [...window.app.wm.windows.values()].find((x) => x._openSpec && x._openSpec.adapterId === 'groups'); if (w && w.content.querySelector('.chanwin-title-row b')) { out.win = { id: w.id, spec: w._openSpec, title: w.content.querySelector('.chanwin-title-row b').textContent, wm: w.title }; break; } await new Promise((r) => setTimeout(r, 250)); }
  out.toast = [...document.querySelectorAll('.global-toast')].map((t) => t.textContent).pop() || null;
  return out;
})()`);
ok(dlg.names && dlg.names.slice().sort().join(',') === 'alpha,beta' && dlg.preChecked === 0 && dlg.disabledBefore === true, 'the New group dialog lists the live sessions, NOTHING pre-selected, Create disabled until two are picked', JSON.stringify(dlg));
ok(dlg.wakeOn === true && /will wake 2 agent\(s\) \(2 billed turn\(s\)\)/.test(dlg.echo || '') && dlg.disabledAfter === false, `"Wake now" is ON by default and the echo states the cost BEFORE the click ("${dlg.echo}")`);
ok(dlg.win && dlg.win.spec.action === 'openChannel' && /^g-[0-9a-f]{8}$/.test(dlg.win.spec.convId), 'Create opens the group\'s window at once (the same window type, openSpec adapterId = the group namespace)', JSON.stringify(dlg.win));
ok(dlg.toast && /woke 2 agent\(s\) = 2 billed turn\(s\)/.test(dlg.toast), 'the toast says what the SERVER did — woke 2 agents = 2 billed turns', String(dlg.toast));
const gid = dlg.win ? dlg.win.spec.convId : null;

// ── ①b lane channels-fold (the owner, 2026-10-03): VibeSpace internal is FOLDED BY DEFAULT — on a fresh user state the
// new group stands under the folded head, no row of its own; the owner's unfold is an EXPLICIT choice in user state
// (every later leg reads the open block; ⑧ reloads it, ⑪ syncs it to a second client) ──
const IHEAD = `(() => { const P = document.querySelector('.rail-panel-channels'); const ih = P && P.querySelector('.chan-groups .chan-ihead'); if (!ih) return null;
  return { folded: ih.classList.contains('chan-ihead-folded'), expanded: ih.getAttribute('aria-expanded'), groups: P.querySelectorAll('.chan-groups .chan-grow[data-group]').length, count: ih.querySelector('.chan-ihead-count').textContent }; })()`;
const us0 = (await api('GET', '/api/user-state')).body;
const fd0 = await until(IHEAD);
ok(fd0 && fd0.folded === true && fd0.expanded === 'false' && fd0.groups === 0 && /^\([1-9]\d*\)$/.test(fd0.count) && !(us0 && us0.channelsPanelFolds && 'internal' in us0.channelsPanelFolds),
  '①b THE DEFAULT IS FOLDED: on a fresh user state (no `internal` key) the new group stands under the folded "VibeSpace internal (N)" head — no row of its own', JSON.stringify({ fd0, folds: us0 && us0.channelsPanelFolds }));
await p1.evaljs(`(() => { document.querySelector('.rail-panel-channels .chan-groups .chan-ihead').click(); return 1; })()`);
let usU = null;
for (let i = 0; i < 20; i++) { usU = (await api('GET', '/api/user-state')).body; if (usU && usU.channelsPanelFolds && usU.channelsPanelFolds.internal === false) break; await sleep(250); }
const fd1 = await until(`(() => { const v = ${IHEAD}; return v && v.folded === false && v.groups >= 1 ? v : null; })()`);
ok(usU && usU.channelsPanelFolds && usU.channelsPanelFolds.internal === false && fd1 && fd1.expanded === 'true' && fd1.count === fd0.count,
  '①b the owner\'s UNFOLD is an explicit choice — user state `channelsPanelFolds.internal: false` — and the group\'s row stands under the open head', JSON.stringify({ fd1, folds: usU && usU.channelsPanelFolds }));

// ── ② the hostile name is TEXT ──
const xss = await p1.evaljs(`(() => ({ pwned: window.__pwned === 1, rowText: [...document.querySelectorAll('.rail-panel-channels .chan-grow[data-group="${gid}"] .chan-grow-title')].map((n) => n.textContent)[0] || null, imgs: document.querySelectorAll('.rail-panel-channels .chan-groups img, .chanwin img, .taskbar img[src="x"]').length, title: [...window.app.wm.windows.values()].find((w) => w._openSpec && w._openSpec.convId === '${gid}').title }))()`);
ok(xss.rowText === HOSTILE && dlg.win.title === HOSTILE && xss.title === HOSTILE, 'a HOSTILE group name renders as TEXT in the list row, the window bar and the window title', JSON.stringify(xss));
ok(xss.pwned === false && xss.imgs === 0, 'no element was injected and no script ran (the name reached the DOM through textContent only)', JSON.stringify(xss));

// ── ③ each invitee's stub got exactly ONE invite frame, with the context ──
await sleep(800);
const fA0 = frames(AGENTS[0]), fB0 = frames(AGENTS[1]);
ok(fA0.length === 1 && fB0.length === 1, `each invitee's stub CLI recorded exactly ONE frame (the invite wake) — alpha ${fA0.length}, beta ${fB0.length}`);
ok([fA0[0], fB0[0]].every((f) => f && /You were just added to this group/.test(f.message.content) && f.message.content.includes(CONTEXT)), 'the invite frame carries the lead line AND the opening context — the invitee\'s first content', JSON.stringify(fA0[0] && fA0[0].message.content.slice(0, 200)));

// ── ④ alpha → always (the detail dialog), beta stays next-turn; the owner sends ──
const setMode = await p1.evaljs(`(async () => {
  const w = [...window.app.wm.windows.values()].find((x) => x._openSpec && x._openSpec.convId === '${gid}');
  w.content.querySelector('[data-group-members]').click();
  for (let i = 0; i < 40; i++) { if (document.querySelector('#chan-group-dialog .chan-gm-row')) break; await new Promise((r) => setTimeout(r, 150)); }
  const d = document.getElementById('chan-group-dialog');
  const rows = [...d.querySelectorAll('.chan-gm-row')].map((r) => ({ member: r.dataset.member, name: r.querySelector('.chan-gm-name').textContent, notify: r.querySelector('select') ? r.querySelector('select').value : null }));
  const sel = d.querySelector('.chan-gm-row[data-member="${AGENTS[0].cid}"] select');
  sel.value = 'always'; sel.dispatchEvent(new Event('change'));
  for (let i = 0; i < 40; i++) { const r = await fetch('/api/channel-groups').then((x) => x.json()); const g = r.groups.find((x) => x.id === '${gid}'); if (g && g.members.find((m) => m.member === '${AGENTS[0].cid}').notify === 'always') break; await new Promise((r) => setTimeout(r, 150)); }
  d.querySelector('.dialog-close').click();
  return rows;
})()`);
ok(setMode[0].member === 'user' && setMode[0].name === 'You (observer)' && setMode[0].notify === null && setMode.slice(1).every((r) => r.notify === 'next-turn'), 'the detail lists the owner FIRST as "You (observer)" (no mode), every member on the default next-turn', JSON.stringify(setMode));
const g1 = (await api('GET', '/api/channel-groups')).body.groups.find((g) => g.id === gid);
ok(g1.members.find((m) => m.member === AGENTS[0].cid).notify === 'always' && g1.members.find((m) => m.member === AGENTS[1].cid).notify === 'next-turn', 'the owner changed ANOTHER member\'s mode from the select (alpha → always; beta untouched)');
const SEND = (text, { mention = null } = {}) => `(async () => {
  const w = [...window.app.wm.windows.values()].find((x) => x._openSpec && x._openSpec.convId === '${gid}');
  const ta = w.content.querySelector('.chan-group-composer textarea');
  const out = {};
  ta.focus();
  ${mention ? `ta.value = ${JSON.stringify(mention)}; ta.setSelectionRange(ta.value.length, ta.value.length); ta.dispatchEvent(new Event('input'));
  out.pop = [...w.content.querySelectorAll('.chan-mention-item')].map((x) => x.textContent);
  ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  out.afterPick = ta.value;
  ta.value = ta.value + ${JSON.stringify(text)}; ta.dispatchEvent(new Event('input'));` : `ta.value = ${JSON.stringify(text)}; ta.dispatchEvent(new Event('input'));`}
  out.preview = w.content.querySelector('.chan-group-composer .chanwin-note').textContent;
  const before = w.content.querySelectorAll('.chanmsg:not(.chanmsg-sys)').length;
  w.content.querySelector('[data-group-send]').click();
  for (let i = 0; i < 60; i++) { if (w.content.querySelectorAll('.chanmsg:not(.chanmsg-sys)').length > before) break; await new Promise((r) => setTimeout(r, 100)); }
  const last = [...w.content.querySelectorAll('.chanmsg:not(.chanmsg-sys)')].pop();
  out.drawnAs = last ? (last.querySelector('.chanmsg-head b') || {}).textContent || null : null;
  out.body = last ? last.querySelector('.chanmsg-body').textContent : null;
  await new Promise((r) => setTimeout(r, 400));
  out.toast = [...document.querySelectorAll('.global-toast')].map((t) => t.textContent).pop() || null;
  return out;
})()`;
// auth is ON (a cookie proved the owner) ⇒ the owner's post is NOT paced:
// alpha, woken by its invite a moment ago, is woken again AT ONCE (r3 — the
// 30 s real sleep this leg used to take under auth off is gone)
const s1 = await p1.evaljs(SEND('hello team — status please'));
await sleep(800);
const fA1 = frames(AGENTS[0]), fB1 = frames(AGENTS[1]);
ok(/Will wake alpha — 1 billed turn/.test(s1.preview || ''), `the preview under the box names who THIS text wakes before the click ("${s1.preview}")`);
ok(fA1.length === 2 && /notify mode in this group is "always"/.test(fA1[1].message.content) && fA1[1].message.content.includes('hello team'), 'the member on `always` IS WOKEN: its stub recorded the wake frame carrying the message', JSON.stringify(fA1.map((f) => f.message.content.slice(0, 80))));
ok(fB1.length === 1, 'the member on `next-turn` is NOT woken: its stub recorded nothing new (the message waits for its next report)', `beta frames ${fB1.length}`);
ok(s1.drawnAs === 'You' && s1.body === 'hello team — status please' && /woke 1 agent\(s\) = 1 billed turn\(s\)/.test(s1.toast || '') && /1 will read it on their next turn/.test(s1.toast || ''), 'the owner\'s message is drawn at once as "You", and the toast states the wake count and who reads it next turn', JSON.stringify(s1));

// ── ④b WHERE THE MESSAGE STANDS (lane group-pending; the owner 2026-10-01: a message to a next-turn member was
//      drawn exactly like a delivered one) — the line under the owner's message: alpha (always, woken) read it,
//      beta (next-turn) waits; beta's TURN START (its UserPromptSubmit hook on a typed turn) hands the report over
//      and the SAME node flips to read with no reload; a muted member is said; a mode change repaints in place;
//      the zh / ja lines whole on a second page ──
const DLV = (body) => `(() => {
  const w = [...window.app.wm.windows.values()].find((x) => x._openSpec && x._openSpec.convId === '${gid}');
  if (!w) return null;
  const row = [...w.content.querySelectorAll('.chanmsg:not(.chanmsg-sys)')].find((r) => r.querySelector('.chanmsg-body').textContent === ${JSON.stringify(body)});
  if (!row) return null;
  const line = row.querySelector(':scope > .chanmsg-dlv');
  if (!line) return { noLine: true };
  if (!line.__mark) line.__mark = 'm' + Math.random().toString(36).slice(2);
  const dot = getComputedStyle(line.querySelector('.chanmsg-dlv-dot'));
  return { text: line.querySelector('.chanmsg-dlv-text').textContent, tone: line.dataset.tone, title: line.title, hidden: line.hidden, mark: line.__mark, whole: line.scrollWidth <= line.clientWidth + 1, dotFilled: dot.backgroundColor !== 'rgba(0, 0, 0, 0)' && dot.backgroundColor !== 'transparent' };
})()`;
const HELLO = 'hello team — status please';
const d1 = await p1.evaljs(DLV(HELLO));
ok(d1 && !d1.noLine && d1.text === '1 waiting · 1 read' && d1.tone === 'waiting' && d1.dotFilled === false && d1.whole && d1.hidden === false, '④b the owner\'s message carries its line: "1 waiting · 1 read" (alpha woken, beta waits), a HOLLOW dot, whole in its row', JSON.stringify(d1));
ok(d1 && d1.title.split('\n').length === 2 && d1.title.split('\n').includes("Waiting for beta's next turn") && d1.title.split('\n').some((l) => /^Read by alpha · \d{2}:\d{2}$/.test(l)), '④b …its title names each recipient\'s state (alpha, woken, with its hand-over clock)', d1 && d1.title);
// beta's next turn: one typed character into its session makes the next hook call a USER turn (the §22 gate — the
// invite wake stamped a machine turn), the hook hands the report over (an HTTP answer: the stub records nothing),
// the marker moves, the broadcast carries it, the line flips
await p1.evaljs(`(() => { window.app.ws.send({ type: 'input', sessionId: 'sess-grp-${AGENTS[1].key}', data: ' ' }); return 1; })()`);
await sleep(300);
const pc = await api('GET', '/api/agent/prompt-context', undefined, { Authorization: 'Bearer ' + AGENTS[1].token });
ok(pc.status === 200 && /hello team/.test(JSON.stringify(pc.body)), '④b beta\'s UserPromptSubmit hook (a typed turn) is handed the report carrying the owner\'s message', JSON.stringify(pc.body).slice(0, 300));
const d2 = await until(`(() => { const d = ${DLV(HELLO)}; return d && d.text === '2 read' ? d : null; })()`);
ok(d2 && d2.tone === 'handed' && d2.dotFilled === true && d2.mark === d1.mark, '④b …and the line under the owner\'s message flips to "2 read" with a FILLED dot — the SAME node, patched in place, no reload', JSON.stringify(d2));
ok(d2 && /^Read by beta · \d{2}:\d{2}$/m.test(d2.title) && /^Read by alpha · \d{2}:\d{2}$/m.test(d2.title), '④b …its title says WHEN each was read (the hand-over clock, HH:MM like the message head)', d2 && d2.title);
ok(frames(AGENTS[1]).length === fB1.length, 'CONTROL: the hand-over was the hook\'s answer — beta\'s stub recorded no frame for it (nobody was woken, nothing billed)', `beta frames ${frames(AGENTS[1]).length}`);
// a muted member is said; a mode change repaints the line in place
const mute = await api('POST', `/api/channel-groups/${gid}/notify`, { member: AGENTS[1].cid, notify: 'mute' });
ok(mute.status === 200 && mute.body.ok, '④b FIXTURE: beta → mute (the owner may set anyone\'s mode)');
const MUTED = 'a note while beta is muted';
await p1.evaljs(SEND(MUTED));
const d3 = await until(`(() => { const d = ${DLV(MUTED)}; return d && /muted/.test(d.text) ? d : null; })()`);
ok(d3 && d3.text === '1 read · 1 muted' && d3.tone === 'handed' && /beta is muted and will not read it/.test(d3.title), `④b a muted member is SAID under the message ("${d3 && d3.text}"); alpha (always) read it`, JSON.stringify(d3));
const unmute = await api('POST', `/api/channel-groups/${gid}/notify`, { member: AGENTS[1].cid, notify: 'next-turn' });
const d4 = await until(`(() => { const d = ${DLV(MUTED)}; return d && d.text === '1 waiting · 1 read' ? d : null; })()`);
ok(unmute.status === 200 && d4 && d4.mark === d3.mark && d4.tone === 'waiting', '④b beta back on next-turn ⇒ the SAME line now reads "1 waiting · 1 read" (a mode change repaints in place — the line is a live fact)', JSON.stringify(d4));
// zh / ja: the same line whole on a second page in each language (the width budget lives in the words)
for (const lang of ['zh', 'ja']) {
  const p = await newPage();
  await p.cdp('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('vibespace.lang', ${JSON.stringify(lang)}); } catch {}` });
  ok(await p.load(), `④b ${lang}: a second page in ${lang} loaded`);
  const want = lang === 'zh' ? '1 人待读 · 1 人已读' : '1 人が未読 · 1 人が既読';
  await p.evaljs(`(() => { window.app.openChannel('groups', '${gid}'); return 1; })()`);
  let dl = null;
  for (const end = Date.now() + 20000; Date.now() < end && !dl;) { try { dl = await p.evaljs(`(() => { const d = ${DLV(MUTED)}; return d && d.text === ${JSON.stringify(want)} ? d : null; })()`); } catch {} if (!dl) await sleep(250); }
  ok(dl && dl.whole && (lang === 'zh' ? /等待 beta 的下一回合/ : /beta の次のターンを待っています/).test(dl.title), `④b ${lang}: the line reads "${want}", whole in its row, its title in ${lang}`, JSON.stringify(dl));
  const dlh = await p.evaljs(DLV(HELLO));
  ok(dlh && (lang === 'zh' ? /beta 已在 \d{2}:\d{2} 读到/ : /beta が \d{2}:\d{2} に読みました/).test(dlh.title), `④b ${lang}: a read row says WHEN in ${lang}`, dlh && dlh.title);
  await p.evaljs(`localStorage.removeItem('vibespace.lang'), 1`);
}

// ── ⑤ the @-autocomplete + a mention wakes a next-turn member ──
const s2 = await p1.evaljs(SEND('can you take the data half?', { mention: '@be' }));
await sleep(800);
const fB2 = frames(AGENTS[1]);
ok(JSON.stringify(s2.pop) === '["beta"]' && s2.afterPick === '@beta ', 'the @-autocomplete offers the member list ("@be" ⇒ beta) and Enter inserts "@beta "', JSON.stringify(s2));
ok(/Will wake .*beta/.test(s2.preview || '') && fB2.length === 2 && /You were @mentioned/.test(fB2[1].message.content), 'an @mention wakes the next-turn member (preview named it; its stub recorded the mention wake)', JSON.stringify(fB2.map((f) => f.message.content.slice(0, 60))));

// ── ⑤b B-ff04 (the owner's screenshot, 2026-10-02): an @ is a CHIP named by id, the body is SELECTABLE + COPYABLE, a
// forged chip stays text, and a removed member is named, never its id ──
const FF = await p1.evaljs(`(async () => {
  const w = [...window.app.wm.windows.values()].find((x) => x._openSpec && x._openSpec.convId === '${gid}');
  const rows = [...w.content.querySelectorAll('.chanmsg:not(.chanmsg-sys)')];
  const last = rows.pop();
  const chip = last && last.querySelector('.chanmsg-body .chan-at');
  return { chip: chip ? { id: chip.dataset.mention, text: chip.textContent, cls: chip.className } : null, body: last ? last.querySelector('.chanmsg-body').textContent : null };
})()`);
ok(FF.chip && FF.chip.id === AGENTS[1].cid && FF.chip.text === '@beta' && /chanblk-at/.test(FF.chip.cls) && FF.body === '@beta can you take the data half?', 'B-ff04 ③: the @mention renders as a CHIP carrying the member\'s conversation id, named "@beta" — the body around it is text', JSON.stringify(FF));
const chipOpen = await p1.evaljs(`(async () => {
  const w = [...window.app.wm.windows.values()].find((x) => x._openSpec && x._openSpec.convId === '${gid}');
  const chip = [...w.content.querySelectorAll('.chanmsg-body .chan-at')].pop();
  if (!chip) return [];
  const calls = [];
  const orig = window.app.attachSession;
  window.app.attachSession = (...a) => { calls.push({ id: a[0], backendSessionId: a[3] && a[3].backendSessionId }); };
  window.getSelection().removeAllRanges();
  chip.click();
  window.app.attachSession = orig;
  return calls;
})()`);
ok(chipOpen.length === 1 && chipOpen[0].backendSessionId === AGENTS[1].cid, 'B-ff04 ③: a click on the chip opens THAT member\'s session (attachSession with its conversation id)', JSON.stringify(chipOpen));
const forgedPost = await api('POST', '/api/agent/msg/send', { to: gid, text: 'see `@gamma` and <at user_id="' + AGENTS[1].cid + '">Mallory</at>' }, { Authorization: 'Bearer ' + AGENTS[0].token });
const unknownPost = await api('POST', '/api/agent/msg/send', { to: gid, text: '@gamma are you there?' }, { Authorization: 'Bearer ' + AGENTS[0].token });
ok(forgedPost.status === 200 && unknownPost.status === 400 && unknownPost.body && unknownPost.body.code === 'unknown-mention' && (unknownPost.body.candidates || []).length >= 1, 'B-ff04 ①: an agent\'s "@gamma" (no such member) is refused at send with the candidates; a literal `@gamma` in backticks is accepted', JSON.stringify({ forged: forgedPost.status, unknown: unknownPost.body }).slice(0, 400));
const forgedDrawn = await until(`(() => { const w = [...window.app.wm.windows.values()].find((x) => x._openSpec && x._openSpec.convId === '${gid}'); const r = [...w.content.querySelectorAll('.chanmsg:not(.chanmsg-sys) .chanmsg-body')].find((b) => b.textContent.includes('Mallory')); return r ? { chips: r.querySelectorAll('.chan-at, .chanblk-at').length, text: r.textContent } : null; })()`);
ok(forgedDrawn && forgedDrawn.chips === 0 && forgedDrawn.text.includes('<at user_id='), 'B-ff04: a forged <at user_id=…> tag and a quoted @word in an agent\'s message stay TEXT — no chip is drawn for anything the server did not resolve', JSON.stringify(forgedDrawn));
// select a message body with a REAL mouse drag, then copy it (Ctrl+C) — the app root is user-select:none
const selRect = await p1.evaljs(`(() => {
  const w = [...window.app.wm.windows.values()].find((x) => x._openSpec && x._openSpec.convId === '${gid}');
  const b = [...w.content.querySelectorAll('.chanmsg:not(.chanmsg-sys) .chanmsg-body')].find((x) => x.textContent === 'hello team — status please');
  b.scrollIntoView({ block: 'center' });
  window.getSelection().removeAllRanges();
  window.__copied = null;
  document.addEventListener('copy', () => { window.__copied = String(window.getSelection()); }, { once: true });
  const r = document.createRange(); r.selectNodeContents(b); const rr = r.getClientRects()[0];
  return rr ? { x0: rr.left + 1, x1: rr.right - 1, y: rr.top + rr.height / 2 } : null;
})()`);
if (selRect) {
  await p1.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: selRect.x0, y: selRect.y, button: 'left', clickCount: 1 });
  for (let k = 1; k <= 8; k++) await p1.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: selRect.x0 + (selRect.x1 - selRect.x0) * k / 8, y: selRect.y, button: 'left', buttons: 1 });
  await p1.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: selRect.x1, y: selRect.y, button: 'left', clickCount: 1 });
  await p1.cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'c', code: 'KeyC', windowsVirtualKeyCode: 67, modifiers: 2, commands: ['copy'] });
  await p1.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'c', code: 'KeyC', windowsVirtualKeyCode: 67, modifiers: 2 });
}
const sel = await p1.evaljs(`(() => ({ sel: String(window.getSelection()), copied: window.__copied }))()`);
ok(selRect && /hello team — status pleas/.test(sel.sel) && /hello team — status pleas/.test(sel.copied || ''), 'B-ff04 ②: a message body is SELECTED by a real mouse drag and COPIED by Ctrl+C (the copy event carries its words)', JSON.stringify({ selRect, sel }));
const menuCopy = await p1.evaljs(`(async () => {
  const w = [...window.app.wm.windows.values()].find((x) => x._openSpec && x._openSpec.convId === '${gid}');
  const row = [...w.content.querySelectorAll('.chanmsg:not(.chanmsg-sys)')].find((x) => (x.querySelector('.chanmsg-body') || {}).textContent === 'hello team — status please');
  window.__clip = [];
  if (navigator.clipboard) navigator.clipboard.writeText = (s) => { window.__clip.push(s); return Promise.resolve(); };
  const r = row.getBoundingClientRect();
  row.querySelector('.chanmsg-body').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 10, clientY: r.top + 10 }));
  await new Promise((res) => setTimeout(res, 150));
  const items = [...document.querySelectorAll('.context-menu .context-menu-item, .ctx-menu-item, [class*="menu-item"]')].filter((x) => x.offsetParent !== null);
  const labels = items.map((x) => x.textContent.trim());
  const it = items.find((x) => x.textContent.trim() === 'Copy text');
  if (it) it.click();
  await new Promise((res) => setTimeout(res, 150));
  return { labels: labels.slice(0, 6), clip: window.__clip };
})()`);
ok(menuCopy.labels.indexOf('Copy text') >= 0 && menuCopy.labels.indexOf('Copy text') < menuCopy.labels.findIndex((l) => /Clear content/.test(l)) && menuCopy.clip[0] === 'hello team — status please', 'B-ff04 ②: the message menu (right-click; a long-press on touch synthesizes it) offers Copy text — it copies the message\'s words', JSON.stringify(menuCopy));
// a removed member is NAMED in the system line, never its id
const kg = await api('POST', '/api/channel-groups', { name: 'kick lane', members: AGENTS.map((a) => a.cid), quiet: true });
const kgid = kg.body && kg.body.group && kg.body.group.id;
const kicked = kgid ? await api('POST', `/api/channel-groups/${kgid}/kick`, { member: AGENTS[1].cid }) : null;
ok(kicked && kicked.status === 200, 'FIXTURE: the owner removed beta from a fresh quiet group', JSON.stringify(kicked && kicked.body).slice(0, 200));
await p1.evaljs(`(() => { window.app.openChannel('groups', '${kgid}'); return 1; })()`);
const sysLine = await until(`(() => { const w = [...window.app.wm.windows.values()].find((x) => x._openSpec && x._openSpec.convId === '${kgid}'); const l = w && [...w.content.querySelectorAll('.chanmsg-sys .chanmsg-sys-line')].map((x) => x.textContent).find((x) => /removed/.test(x)); return l || null; })()`);
ok(sysLine && /removed beta/.test(sysLine) && !sysLine.includes(AGENTS[1].cid.slice(0, 8)), `B-ff04 ③: the removed member is named by its last known name — "${sysLine}" (never its id)`);

// ── ⑥ the list orders by ACTIVITY, repainted in place ──
// 2026-09-26 (aggregated IM): every conversation of a linked account is listed — no track step
await sleep(1500);
const second = await api('POST', '/api/channel-groups', { name: 'second lane', members: AGENTS.map((a) => a.cid), quiet: true });
ok(second.status === 200 && second.body.ok && second.body.woke.length === 0, 'CONTROL: a QUIET create wakes nobody (woke 0)', JSON.stringify(second.body && second.body.woke));
const armFetch = await p1.evaljs(`(() => { window.__gf = 0; const of = window.fetch; window.__of = of; window.fetch = function (u, ...r) { if (/^\\/api\\/channel-groups(\\?|$)/.test(String(u)) || /^\\/api\\/channels(\\?|$)/.test(String(u))) window.__gf++; return of.call(this, u, ...r); }; return 1; })()`);
// R3 (§23): the first screen is the ATTENTION list — an untouched conversation is under ALL, one switch away
// (the switch redraws from the digest in hand: it is inside the zero-fetch window below)
await p1.evaljs(`(() => { document.querySelector('.rail-panel-channels .chan-view-btn[data-view="all"]').click(); return 1; })()`);
const ORDER = `(() => [...document.querySelectorAll('.rail-panel-channels .chan-groups .chan-grow')].map((r) => ({ key: r.dataset.grow, at: Number(r.dataset.at) })))()`;
const A2 = `groups/${second.body.group.id}`, A1 = `groups/${gid}`, CONV = 'fake-poll/fake-poll-ops';
const sortedByActivity = (o) => o.every((x, i) => i === 0 || o[i - 1].at >= x.at);
const idx = (o, k) => o.findIndex((x) => x.key === k);
const o1 = await until(`(() => { const o = ${ORDER}; const k = o.map((x) => x.key); return k.includes('${A2}') && k.includes('${CONV}') ? o : null; })()`);
ok(o1 && sortedByActivity(o1) && idx(o1, A2) < idx(o1, A1) && idx(o1, CONV) >= 0, 'THE LIST ORDERS BY ACTIVITY: groups and the account\'s conversation in ONE list, newest first — the later group ahead of the earlier one (the fake conversation sits by its own records\' instants)', JSON.stringify(o1));
const bump = await api('POST', `/api/channel-groups/${gid}/post`, { text: 'bumping the first group', expectWakes: 1 });   // alpha is on always: the echo says 1 (r2 consent)
ok(bump.status === 200 && bump.body && bump.body.ok, 'the owner\'s post with its consent echo (expectWakes = the always member) is accepted', JSON.stringify(bump));
const noEcho = await api('POST', `/api/channel-groups/${gid}/post`, { text: 'no echo this time' });
ok(noEcho.status === 409 && noEcho.body && noEcho.body.code === 'wake-count-mismatch' && noEcho.body.wakes === 1, 'CONTROL: the same route with no echo is refused wake-count-mismatch (wakes:1) — a caller that never saw the preview cannot wake', JSON.stringify(noEcho));
const o2 = await until(`(() => { const o = ${ORDER}; const i1 = o.findIndex((x) => x.key === '${A1}'), i2 = o.findIndex((x) => x.key === '${A2}'); return i1 >= 0 && i1 < i2 ? o : null; })()`);
ok(o2 && sortedByActivity(o2) && idx(o2, A1) < idx(o2, A2), 'a message in the first group moves it AHEAD of the later one — the order follows activity, live', JSON.stringify(o2));
const gf = await p1.evaljs(`(() => { const n = window.__gf; window.fetch = window.__of; return n; })()`);
ok(armFetch === 1 && gf === 0, `…repainted IN PLACE from the broadcasts — ZERO /api/channels or /api/channel-groups fetches (${gf})`);

// ── ⑦ an agent posts: unread on the row; opening the window marks it read ──
await p1.evaljs(`(() => { for (const w of [...window.app.wm.windows.values()].filter((x) => x._openSpec && x._openSpec.convId === '${gid}')) window.app.wm.closeWindow(w.id); return 1; })()`);
await sleep(300);
const agentPost = await api('POST', '/api/agent/msg/send', { to: gid, text: 'schema half is done' }, { Authorization: 'Bearer ' + AGENTS[0].token });
ok(agentPost.status === 200 && agentPost.body && agentPost.body.ok !== false, 'FIXTURE: the agent posted through its own session token (the CLI\'s route)', JSON.stringify(agentPost));
const unread = await until(`(() => { const u = document.querySelector('.rail-panel-channels .chan-grow[data-group="${gid}"] .chan-grow-unread'); return u ? u.textContent : null; })()`);
const lastLine = await p1.evaljs(`(() => document.querySelector('.rail-panel-channels .chan-grow[data-group="${gid}"] .chan-grow-last').textContent)()`);
ok(unread === '1' && lastLine === 'schema half is done', 'the row shows 1 UNREAD and the message as its last line', JSON.stringify({ unread, lastLine }));
const RAIL = `(() => Number((document.querySelector('.rail-item[data-rail="channels"] .rail-badge') || {}).textContent || 0))()`;
const railBefore = await p1.evaljs(RAIL);
await p1.evaljs(`(() => { document.querySelector('.rail-panel-channels .chan-grow[data-group="${gid}"]').click(); return 1; })()`);
const read = await until(`(() => !document.querySelector('.rail-panel-channels .chan-grow[data-group="${gid}"] .chan-grow-unread') ? 'read' : null)()`);
ok(read === 'read', 'opening the group\'s window (the owner\'s act) marks it read — the unread badge goes');
const railAfter = await until(`(() => { const n = ${RAIL}; return n === ${railBefore} - 1 ? n + 1e-9 : null; })()`, 8000);
ok(railBefore >= 1 && railAfter !== null, `the RAIL's Channels badge counts the group's unread too (${railBefore} → ${railBefore - 1} as the group is read)`, JSON.stringify({ railBefore, railAfter }));

// ── ⑧ the Accounts fold is persisted ──
await p1.evaljs(`(() => { const h = document.querySelector('.rail-panel-channels .chan-part[data-part="accounts"] .chan-part-head'); h.click(); return 1; })()`);
let us = null;
for (let i = 0; i < 20; i++) { us = (await api('GET', '/api/user-state')).body; if (us && us.channelsPanelFolds && us.channelsPanelFolds.accounts === true) break; await sleep(250); }
ok(us && us.channelsPanelFolds && us.channelsPanelFolds.accounts === true, 'folding Accounts PATCHes user state (`channelsPanelFolds.accounts: true`)', JSON.stringify(us && us.channelsPanelFolds));
ok(await p1.load(), 'page reloaded');
ok(await p1.evaljs(OPEN_PANEL), 'the panel renders again after the reload');
const persisted = await until(`(() => { const p = document.querySelector('.rail-panel-channels .chan-part[data-part="accounts"]'); return p ? { folded: p.classList.contains('chan-part-collapsed'), bodyShown: getComputedStyle(p.querySelector('.chan-part-body')).display !== 'none' } : null; })()`);
ok(persisted && persisted.folded === true && persisted.bodyShown === false, 'after the reload the Accounts section is STILL folded (its body hidden)', JSON.stringify(persisted));
const keptOpen = await until(`(() => { const v = ${IHEAD}; return v && v.folded === false && v.groups >= 1 ? v : null; })()`);
ok(keptOpen && keptOpen.expanded === 'true', '⑧ lane channels-fold: the owner\'s explicit UNFOLD (①b) survives the reload — VibeSpace internal stays open, though the default folds it', JSON.stringify(keptOpen));
const watcher = await p1.evaljs(`(() => document.querySelector('.rail-panel-channels .chan-part[data-part="watcher"]').classList.contains('chan-part-collapsed'))()`);
ok(watcher === false, 'CONTROL: the Message watcher section (never folded) is open — the fold is per section');

// ── ⑨ R3 (2026-09-26, the owner: "开头不要把所有消息都放进来 … 只放重要消息/conversation … 并展示一个小tag表示状态"):
//    THE FIRST SCREEN IS THE ATTENTION LIST. After the reload the panel opens on it: the two agent groups and NO
//    untouched conversation; then the owner hands 5 conversations to alpha, beta READS 3 through its own agent
//    route (a real `vibespace-channels read`), and a draft of the owner's waits for approval on 1 — exactly those
//    9 join the groups, each with ONE tag, repainted from the broadcasts; "All" is the whole list; the filter
//    works in both views ("{n} more in All"); at 375 px the tag sits UNDER the title in one column. ──
{
  const FOCUS = `(() => { const rows = [...document.querySelectorAll('.rail-panel-channels .chan-groups .chan-grow')]; const segs = [...document.querySelectorAll('.rail-panel-channels .chan-view-btn')].map((b) => ({ view: b.dataset.view, text: b.textContent, on: b.classList.contains('chan-seg-on') })); return { view: (document.querySelector('.rail-panel-channels .chan-groups') || {}).dataset?.view, segs, rows: rows.map((r) => ({ key: r.dataset.grow, group: !!r.dataset.group, tag: r.querySelector('.chan-grow-tag') ? r.querySelector('.chan-grow-tag').dataset.tag : null, tagText: r.querySelector('.chan-grow-tag') ? r.querySelector('.chan-grow-tag').textContent : null, who: r.querySelector('.chan-tag-who') ? r.querySelector('.chan-tag-who').textContent : null })) }; })()`;
  const d0 = await api('GET', '/api/channels');
  const convs = (d0.body.conversations || []).filter((c) => !c.unlisted && !(d0.body.adapters || []).find((a) => a.id === c.adapterId && a.builtin));
  const groupsNow = (await api('GET', '/api/channel-groups')).body.groups.filter((g) => !g.archivedAt);
  const ALL = convs.length + groupsNow.length;
  ok(convs.length >= 45, `FIXTURE: the fake accounts hold ${convs.length} conversations (the attention list is judged among ~50)`);
  // the .197 integration (lane lark-search-poll, owner decision 1): a SINGLE chat with new messages whose newest is
  // inside 24 h is on the attention list too — the `direct` tag (after held, before replied). The fixture's DMs (every
  // fifth room) carry unread messages, so they open the list beside the groups; an untouched GROUP conversation never
  // does. The set is read off the API's own rows (kind / unread / lastAt), never a count written here
  const DAY = 24 * 3600e3;
  const directsOf = (list) => new Set(list.filter((c) => c.kind === 'dm' && Number(c.unread) > 0 && Date.now() - Number(c.lastAt) < DAY).map((c) => `${c.adapterId}/${c.id}`));
  const directs0 = directsOf(convs);
  ok(directs0.size >= 3 && [...directs0].every((k) => /-room-\d+$/.test(k) && Number(k.split('-').pop()) % 5 === 0), `FIXTURE: ${directs0.size} single chats carry new messages inside 24 h (the \`direct\` rows — the fixture's every-fifth-room DMs)`, JSON.stringify([...directs0]));
  const f0 = await p1.evaljs(FOCUS);
  const f0conv = f0.rows.filter((r) => !r.group);
  ok(f0.view === 'focus' && f0.segs.find((x) => x.view === 'focus').on && f0.rows.filter((r) => r.group).length === groupsNow.length && f0conv.length === directs0.size && f0conv.every((r) => directs0.has(r.key) && r.tag === 'direct'), `the panel OPENS on the attention list: the ${groupsNow.length} agent groups and the ${directs0.size} single chats with new messages (tag \`direct\`) — NO untouched group conversation (${f0.rows.length} rows)`, JSON.stringify(f0.rows.map((r) => `${r.key}=${r.tag}`)));
  ok(f0.segs.map((x) => x.text).join(' | ') === `${groupsNow.length + directs0.size} need attention | All ${ALL}`, `the header is the switch: "${f0.segs.map((x) => x.text).join(' | ')}"`);
  const ids = convs.filter((c) => c.adapterId === 'fake-poll' && /-room-\d+$/.test(c.id)).map((c) => c.id).sort((a, b) => Number(a.split('-').pop()) - Number(b.split('-').pop()));
  const assigned = ids.slice(0, 5), readByBeta = ids.slice(5, 8), awaitingId = ids[8];
  // each PUT is the CONVERSATION grain (its own route) — listed on its own; a rule / account grain would list a row only once a wake was delivered or held (D4, 2026-09-27; test-channels-focus ①②⑤, test-channels-aggregate-ui ⑤)
  for (const id of assigned) { const r = await api('PUT', `/api/channels/fake-poll/${id}/assignment`, { assignment: { principal: { kind: 'agent', id: AGENTS[0].cid, name: 'alpha' }, mode: 'all', notify: 'digest', digestMinutes: 60 } }); ok(r.status === 200, `FIXTURE: ${id} handed to alpha`, JSON.stringify(r.body).slice(0, 200)); }
  for (const id of readByBeta) {
    await api('PUT', `/api/channels/fake-poll/${id}/reach`, { principal: { kind: 'agent', id: AGENTS[1].cid, name: 'beta' }, level: 'visible' });
    const rd = await api('GET', `/api/agent/channels/read?conv=${encodeURIComponent('fake-poll/' + id)}`, undefined, { Authorization: 'Bearer ' + AGENTS[1].token });
    ok(rd.status === 200 && rd.body.ok && rd.body.records.length > 0, `FIXTURE: beta READS fake-poll/${id} through its own agent route (vibespace-channels read)`, JSON.stringify(rd.body).slice(0, 200));
  }
  const prop = await api('POST', `/api/channels/fake-poll/${awaitingId}/propose`, { text: 'a draft that waits for approval' });
  ok(prop.status === 200 && prop.body && (prop.body.proposal || {}).state === 'awaiting-approval', `FIXTURE: a draft waits for approval on ${awaitingId}`, JSON.stringify(prop.body).slice(0, 200));
  const want9 = { ...Object.fromEntries(assigned.map((id) => [`fake-poll/${id}`, 'assigned'])), ...Object.fromEntries(readByBeta.map((id) => [`fake-poll/${id}`, 'read'])), [`fake-poll/${awaitingId}`]: 'awaiting' };
  // the single chats stay beside them (`direct`); a DM among the 9 wears the stronger tag (assigned › direct, TAG_ORDER)
  const directs1 = directsOf(((await api('GET', '/api/channels')).body.conversations || []).filter((c) => !c.unlisted));
  const want = { ...Object.fromEntries([...directs1].map((k) => [k, 'direct'])), ...want9 };
  const N1 = Object.keys(want).length;
  const f1 = await until(`(() => { const f = ${FOCUS}; return f.rows.filter((r) => !r.group).length === ${N1} ? f : null; })()`, 20000);
  const convRows = f1 ? f1.rows.filter((r) => !r.group) : [];
  ok(f1 && convRows.length === N1 && convRows.every((r) => want[r.key] === r.tag) && Object.keys(want9).every((k) => convRows.some((r) => r.key === k)), `EXACTLY the 9 join the attention list beside the ${N1 - 9} single chats, each with its ONE tag — repainted from the broadcasts (${convRows.map((r) => `${r.key.split('-').pop()}=${r.tag}`).join(' ')})`, JSON.stringify(f1 && f1.rows));
  ok(convRows.filter((r) => r.tag === 'assigned').every((r) => r.tagText === '→ alpha' && r.who === 'alpha') && convRows.filter((r) => r.tag === 'read').every((r) => /^beta read /.test(r.tagText) && r.who === 'beta') && convRows.filter((r) => r.tag === 'awaiting').every((r) => r.tagText === '1 to approve'), 'the tags say it: "→ alpha", "beta read …" (the name its own part), "1 to approve"', JSON.stringify(convRows.map((r) => r.tagText)));
  ok(f1 && f1.segs.map((x) => x.text).join(' | ') === `${groupsNow.length + N1} need attention | All ${ALL}`, `the header counts: "${f1 && f1.segs.map((x) => x.text).join(' | ')}"`);
  // ALL: the whole list, one switch away
  await p1.evaljs(`(() => { document.querySelector('.rail-panel-channels .chan-view-btn[data-view="all"]').click(); return 1; })()`);
  // design 008: All is the server's pages (60 a read) — read on the switch, so it is awaited, never assumed in hand
  const fa = (await until(`(() => { const f = ${FOCUS}; return f.view === 'all' && f.rows.length === ${ALL} ? f : null; })()`, 10000)) || (await p1.evaljs(FOCUS));
  ok(fa.view === 'all' && fa.rows.length === ALL && fa.segs.find((x) => x.view === 'all').on, `"All" shows the whole list (${fa.rows.length} of ${ALL}); a tagged row keeps its tag there`, JSON.stringify(fa.rows.length));
  // THE FILTER, in both views
  const typeQ = (q) => p1.evaljs(`(() => { const i = document.querySelector('.rail-panel-channels .chan-find-input'); i.value = ${JSON.stringify(q)}; i.dispatchEvent(new Event('input')); return 1; })()`);
  const one = readByBeta[0];
  const oneTitle = convs.find((c) => c.id === one).title;
  await typeQ(oneTitle);
  // design 008: in All the filter is the SERVER's (250 ms after the last keystroke, then a page)
  const fq = (await until(`(() => { const f = ${FOCUS}; return f.rows.some((r) => r.key === ${JSON.stringify(`fake-poll/${one}`)}) ? f : null; })()`, 10000)) || (await p1.evaljs(FOCUS));
  ok(fq.rows.some((r) => r.key === `fake-poll/${one}`) && fq.rows.every((r) => r.key.endsWith(one) || /Room/.test(oneTitle)), `the filter narrows ALL to "${oneTitle}" (${fq.rows.length} rows)`, JSON.stringify(fq.rows.map((r) => r.key)));
  await p1.evaljs(`(() => { document.querySelector('.rail-panel-channels .chan-view-btn[data-view="focus"]').click(); return 1; })()`);
  const untouched = ids[12];
  const untouchedTitle = convs.find((c) => c.id === untouched).title;
  await typeQ(untouchedTitle);
  // design 008: "{n} more in All" is the server's count of the matches (250 ms after the last keystroke)
  const fmExpr = `(() => { const f = ${FOCUS}; const more = document.querySelector('.rail-panel-channels [data-more-in-all]'); const sm = document.querySelector('.rail-panel-channels [data-search-messages]'); return { ...f, more: more ? { n: more.dataset.moreInAll, text: more.textContent } : null, search: sm ? sm.textContent : null }; })()`;
  const fm = (await until(`(() => { const x = ${fmExpr}; return x.more ? x : null; })()`, 10000)) || (await p1.evaljs(fmExpr));
  ok(fm.view === 'focus' && !fm.rows.some((r) => r.key === `fake-poll/${untouched}`) && fm.more && Number(fm.more.n) >= 1 && /more in All/.test(fm.more.text), `in the attention view a match OUTSIDE it is offered, never hidden: "${fm.more && fm.more.text}"`, JSON.stringify(fm));
  ok(fm.search && /Search messages for "/.test(fm.search), `…and the words are a message search too ("${fm.search}")`);
  await p1.evaljs(`(() => { document.querySelector('.rail-panel-channels [data-more-in-all]').click(); return 1; })()`);
  const fm2 = (await until(`(() => { const f = ${FOCUS}; return f.view === 'all' && f.rows.some((r) => r.key === ${JSON.stringify(`fake-poll/${untouched}`)}) ? f : null; })()`, 10000)) || (await p1.evaljs(FOCUS));
  ok(fm2.view === 'all' && fm2.rows.some((r) => r.key === `fake-poll/${untouched}`), '"more in All" switches to All with the words kept — the row is there');
  await typeQ('');
  // AT 375 px: one column, the tag UNDER the title
  await p1.cdp('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
  ok(await p1.load(), 'page reloaded at 375 × 667 (a phone)');
  const phone = await until(`(async () => {
    if (!document.querySelector('.chan-window .chan-groups')) { window.app.openChannels(); await new Promise((r) => setTimeout(r, 300)); }
    const rows = [...document.querySelectorAll('.chan-window .chan-groups .chan-grow')].filter((r) => r.querySelector('.chan-grow-tag'));
    if (rows.length < ${N1}) return null;
    const list = document.querySelector('.chan-window .chan-groups').getBoundingClientRect();
    return rows.map((r) => { const ti = r.querySelector('.chan-grow-title').getBoundingClientRect(), tg = r.querySelector('.chan-grow-tag').getBoundingClientRect(), rr = r.getBoundingClientRect(); const words = [...r.querySelectorAll('.chan-tag-words')]; const who = r.querySelector('.chan-tag-who'); return { key: r.dataset.grow, under: tg.top >= ti.bottom - 0.5, tagW: Math.round(tg.width), wordsWhole: words.every((w) => w.scrollWidth <= w.clientWidth + 0.5), whoWhole: !who || who.scrollWidth <= who.clientWidth + 0.5, rowW: Math.round(rr.width), listW: Math.round(list.width) }; });
  })()`, 20000);
  ok(Array.isArray(phone) && phone.length === N1 && phone.every((x) => x.under && x.wordsWhole && x.whoWhole && Math.abs(x.rowW - x.listW) <= 2), `at 375 px every tagged row is ONE column with its tag UNDER the title, its words AND the agent's name whole (tags ${Array.isArray(phone) ? phone.map((x) => x.tagW).join(',') : phone} px)`, JSON.stringify(phone));
  await p1.cdp('Emulation.clearDeviceMetricsOverride');

  // ── ⑩ 2026-09-27 (lane channel-withdraw): THE AGENT TAKES A DRAFT BACK; HOW IT HEARS OF A DECISION IS
  // CHOSEN ON THE BUTTON; THE CARD SAYS WHETHER IT KNOWS YET. beta proposes through its own agent route,
  // the Outbox window and the For-you popup show it; beta WITHDRAWS it (its route) ⇒ without a reload the
  // card reads "Withdrawn by beta · wrong thread" with no buttons and the For-you row resolves. Then the
  // split button: "Approve ▾" offers the two deliveries + "Approve with edits…"; "wake the agent now" is
  // REMEMBERED as the primary of the next card; the woken receipt reaches beta's stub and the fate line says
  // "Handed to beta at HH:MM — it was woken for it"; a next-message approve reads "Waiting for beta's next
  // message" until beta's next prompt drains the stash — the SAME card's fate line is patched in place.
  ok(await p1.load(), '⑩ page reloaded at desktop size');
  await p1.evaljs(`(() => { localStorage.removeItem('vibespace.channels.receiptDeliver'); return 1; })()`);
  const BETA = AGENTS[1];
  const asBeta = (method, p, body) => api(method, p, body, { Authorization: 'Bearer ' + BETA.token });
  const [wId, aId, nId] = readByBeta;
  const wTitle = convs.find((c) => c.id === wId).title;
  const pw = await asBeta('POST', '/api/agent/channels/reply', { conv: `fake-poll/${wId}`, text: 'a draft beta will take back' });
  ok(pw.status === 200 && pw.body.proposal && pw.body.proposal.state === 'awaiting-approval', '⑩ FIXTURE: beta proposes through its own agent route (vibespace-channels reply) — awaiting approval', JSON.stringify(pw.body).slice(0, 200));
  const pid = pw.body.proposal.id;
  const ptr = ((await api('GET', '/api/user-todos')).body.todos.open || []).find((x) => x.sessionKey === 'channels' && x.text === `Proposals awaiting approval in ${wTitle}`);
  ok(!!ptr, `⑩ FIXTURE: its For-you pointer is open ("Proposals awaiting approval in ${wTitle}")`);
  const shown = await p1.evaljs(`(async () => {
    window.app.openChannelOutbox();
    // B-f467: the Outbox lists one ROW per proposal; these legs act on its full card — open each row as it appears
    window.__obRows = window.__obRows || setInterval(() => { for (const r of document.querySelectorAll('.chan-outbox-list .chan-orow[aria-expanded="false"]')) r.click(); }, 100);
    const b = document.getElementById('taskbar-user-todos'); const pop = document.getElementById('user-todos-popup');
    if (b && pop && pop.classList.contains('hidden')) b.click();
    for (let i = 0; i < 80; i++) {
      const card = document.querySelector('.chan-outbox-list .chan-prop[data-proposal="${pid}"]');
      const row = document.querySelector('#user-todos-popup .ut-item[data-id="${ptr && ptr.id}"]');
      if (card && row) return { card: card.className, approve: card.querySelector('button[data-approve]')?.textContent || null, deliver: card.querySelector('button[data-approve]')?.dataset.deliver || null, splitA: !!card.querySelector('.chan-split button[data-more="approve"]'), splitR: !!card.querySelector('.chan-split button[data-more="reject"]'), row: row.className };
      await new Promise((r) => setTimeout(r, 250));
    }
    return { fail: 'no outbox card / for-you row', card: !!document.querySelector('.chan-outbox-list .chan-prop[data-proposal="${pid}"]') };
  })()`);
  ok(!shown.fail && /chan-prop-awaiting-approval/.test(shown.card) && shown.splitA && shown.splitR && shown.approve === 'Approve — tell the agent with your next message' && shown.deliver === 'next-turn' && !/ut-item-resolved/.test(shown.row), `⑩ the Outbox card awaits with the SPLIT buttons (Approve ▾ / Reject ▾), the primary says the free choice ("${shown.approve}"), and the For-you row is open`, JSON.stringify(shown));
  // the Outbox shows ALL (another draft from ⑨ still awaits, so it opened on the Awaiting queue)
  await p1.evaljs(`(() => { const b = document.querySelector('.chan-outbox .chan-seg button[data-view="all"]'); if (b) b.click(); return !!b; })()`);
  const wd = await asBeta('POST', `/api/agent/channels/proposals/${pid}/withdraw`, { why: 'wrong thread' });
  ok(wd.status === 200 && wd.body.proposal.state === 'withdrawn', '⑩ beta WITHDRAWS it through its own agent route (vibespace-channels withdraw)', JSON.stringify(wd.body).slice(0, 200));
  const gone = await p1.evaljs(`(async () => {
    for (let i = 0; i < 80; i++) {
      const card = document.querySelector('.chan-outbox-list .chan-prop[data-proposal="${pid}"]');
      const row = document.querySelector('#user-todos-popup .ut-item[data-id="${ptr && ptr.id}"]');
      if (card && /chan-prop-withdrawn/.test(card.className) && (!row || /ut-item-resolved/.test(row.className))) return { reason: card.querySelector('.chan-prop-reason')?.textContent || null, state: card.querySelector('.chan-prop-state')?.textContent || null, buttons: card.querySelectorAll('button').length, row: row ? row.className : null, head: [...document.querySelectorAll('.chan-outbox-list .chan-outbox-sec')].map((h) => h.textContent) };
      await new Promise((r) => setTimeout(r, 250));
    }
    return { fail: 'never withdrawn on the page', cls: document.querySelector('.chan-outbox-list .chan-prop[data-proposal="${pid}"]')?.className || null };
  })()`);
  ok(!gone.fail && gone.reason === 'Withdrawn by beta · wrong thread' && gone.state === 'withdrawn' && gone.buttons === 0 && gone.head.some((h) => /^withdrawn · \d+$/.test(h)), `⑩ WITHOUT A RELOAD the card reads "${gone.reason}", settled under "withdrawn", with NO buttons`, JSON.stringify(gone));
  ok(!gone.fail && (gone.row === null || /ut-item-resolved/.test(gone.row)), '⑩ …and the For-you row resolved live (retracted by the engine, never by a reload)', JSON.stringify(gone.row));
  const reopened = await p1.evaljs(`(async () => {
    const b = document.getElementById('taskbar-user-todos'); const pop = document.getElementById('user-todos-popup');
    if (!pop.classList.contains('hidden')) b.click();
    await new Promise((r) => setTimeout(r, 150)); b.click(); await new Promise((r) => setTimeout(r, 300));
    const row = pop.querySelector('.ut-groups .ut-item[data-id="${ptr && ptr.id}"]');
    const open = !!row && !row.classList.contains('ut-item-resolved');
    b.click();
    return { open };
  })()`);
  const todosW = (await api('GET', '/api/user-todos')).body.todos;
  ok(!reopened.open && !(todosW.open || []).some((x) => ptr && x.id === ptr.id), '⑩ reopened, the For-you popup lists no open row for it; the store has it resolved', JSON.stringify(reopened));

  // the split button: the menu, "wake the agent now", the fate line
  const pa = await asBeta('POST', '/api/agent/channels/reply', { conv: `fake-poll/${aId}`, text: 'approve me and wake me' });
  const paId = pa.body && pa.body.proposal && pa.body.proposal.id;
  const fr0 = frames(BETA).length;
  const menu = await p1.evaljs(`(async () => {
    let more = null;
    for (let i = 0; i < 80 && !(more = document.querySelector('.chan-outbox-list .chan-prop[data-proposal="${paId}"] button[data-more="approve"]')); i++) await new Promise((r) => setTimeout(r, 250));
    if (!more) return { fail: 'no split button' };
    const primary = document.querySelector('.chan-outbox-list .chan-prop[data-proposal="${paId}"] button[data-approve]');
    const before = { text: primary.textContent, deliver: primary.dataset.deliver };
    more.click();
    await new Promise((r) => setTimeout(r, 150));
    const items = [...document.querySelectorAll('.chan-split-menu .context-menu-item')];
    const texts = items.map((x) => x.textContent);
    const wake = items.find((x) => /wake the agent now/.test(x.textContent));
    if (!wake) return { fail: 'no wake item', texts };
    wake.click();
    return { before, texts, remembered: localStorage.getItem('vibespace.channels.receiptDeliver') };
  })()`);
  ok(!menu.fail && JSON.stringify(menu.texts) === JSON.stringify(['Approve — tell the agent with your next message', 'Approve and wake the agent now (starts a turn)', 'Approve with edits…']), `⑩ "Approve ▾" offers the two deliveries in plain words (the cost named) + "Approve with edits…": ${JSON.stringify(menu.texts)}`, JSON.stringify(menu));
  ok(!menu.fail && menu.remembered === 'wake-now', '⑩ the choice is remembered on this device (the next primary)');
  const woke = await p1.evaljs(`(async () => {
    for (let i = 0; i < 80; i++) {
      const card = document.querySelector('.chan-outbox-list .chan-prop[data-proposal="${paId}"]');
      const f = card && card.querySelector('.chan-prop-fate');
      if (card && /chan-prop-sent/.test(card.className) && f) return { fate: f.textContent, kind: f.dataset.fate };
      await new Promise((r) => setTimeout(r, 250));
    }
    return { fail: 'never sent with a fate line' };
  })()`);
  ok(!woke.fail && /^Handed to beta at (\d\d-\d\d )?\d\d:\d\d — it was woken for it$/.test(woke.fate), `⑩ "wake the agent now" ⇒ sent, and the fate line: "${woke.fate}"`, JSON.stringify(woke));
  let rcFrames = [];
  for (let i = 0; i < 40 && !(rcFrames = frames(BETA).slice(fr0).filter((f) => /Channel receipt/.test(JSON.stringify(f)))).length; i++) await sleep(250);
  ok(rcFrames.length === 1, `⑩ the woken receipt reached beta's stub through the REAL ladder, ONCE (${rcFrames.length})`);
  // the remembered primary, then a next-message approve: "Waiting…" until beta's next prompt drains it
  const pn = await asBeta('POST', '/api/agent/channels/reply', { conv: `fake-poll/${nId}`, text: 'tell me with my next message' });
  const pnId = pn.body && pn.body.proposal && pn.body.proposal.id;
  const later = await p1.evaljs(`(async () => {
    let primary = null;
    for (let i = 0; i < 80 && !(primary = document.querySelector('.chan-outbox-list .chan-prop[data-proposal="${pnId}"] button[data-approve]')); i++) await new Promise((r) => setTimeout(r, 250));
    if (!primary) return { fail: 'no card' };
    const before = { text: primary.textContent, deliver: primary.dataset.deliver };
    document.querySelector('.chan-outbox-list .chan-prop[data-proposal="${pnId}"] button[data-more="approve"]').click();
    await new Promise((r) => setTimeout(r, 150));
    const next = [...document.querySelectorAll('.chan-split-menu .context-menu-item')].find((x) => /tell the agent with your next message/.test(x.textContent));
    if (!next) return { fail: 'no next-message item', before };
    next.click();
    for (let i = 0; i < 80; i++) {
      const card = document.querySelector('.chan-outbox-list .chan-prop[data-proposal="${pnId}"]');
      const f = card && card.querySelector('.chan-prop-fate');
      if (card && /chan-prop-sent/.test(card.className) && f) { card.__vsMark = 'card'; f.__vsMark = 'fate'; return { before, fate: f.textContent, kind: f.dataset.fate, remembered: localStorage.getItem('vibespace.channels.receiptDeliver') }; }
      await new Promise((r) => setTimeout(r, 250));
    }
    return { fail: 'never sent', before };
  })()`);
  ok(!later.fail && later.before.deliver === 'wake-now' && later.before.text === 'Approve and wake the agent now (starts a turn)', `⑩ the NEXT card's primary is the remembered choice ("${later.before && later.before.text}")`, JSON.stringify(later));
  ok(!later.fail && later.fate === "Waiting for beta's next message" && later.remembered === 'next-turn', `⑩ "tell the agent with your next message" ⇒ sent, the fate line: "${later.fate}" (the receipt waits in the stash)`, JSON.stringify(later));
  const drained = await api('GET', '/api/agent/prompt-context', undefined, { Authorization: 'Bearer ' + BETA.token });
  ok(drained.status === 200, '⑩ beta\'s next prompt (its UserPromptSubmit hook route) drains the stash');
  const handed = await p1.evaljs(`(async () => {
    for (let i = 0; i < 80; i++) {
      const card = document.querySelector('.chan-outbox-list .chan-prop[data-proposal="${pnId}"]');
      const f = card && card.querySelector('.chan-prop-fate');
      if (f && /^Handed to beta at/.test(f.textContent)) return { fate: f.textContent, sameCard: card.__vsMark === 'card', sameLine: f.__vsMark === 'fate' };
      await new Promise((r) => setTimeout(r, 250));
    }
    return { fail: 'the fate never moved' };
  })()`);
  ok(!handed.fail && /^Handed to beta at (\d\d-\d\d )?\d\d:\d\d$/.test(handed.fate) && handed.sameCard && handed.sameLine, `⑩ WITHOUT A RELOAD the fate line reads "${handed.fate}" — the SAME card and the SAME line, patched in place`, JSON.stringify(handed));
  // verify r3 (2026-09-27): THE PRESS DOES WHAT THE BUTTON SAYS. Two drafts await; on card X the owner picks
  // "Reject with a reason and wake now" (the box opens, nothing is posted, no broadcast) — card Y's primary
  // must now READ the wake words, and its press must post exactly what it reads (a billed turn the words said
  // was free was the reproduced defect: the label came from render time, the click from the remembered choice)
  const px = await asBeta('POST', '/api/agent/channels/reply', { conv: `fake-poll/${aId}`, text: 'card X — its reject box stays open' });
  const py = await asBeta('POST', '/api/agent/channels/reply', { conv: `fake-poll/${nId}`, text: 'card Y — pressed after the pick' });
  const pxId = px.body && px.body.proposal && px.body.proposal.id, pyId = py.body && py.body.proposal && py.body.proposal.id;
  const fr1 = frames(BETA).length;
  const said = await p1.evaljs(`(async () => {
    const X = () => document.querySelector('.chan-outbox-list .chan-prop[data-proposal="${pxId}"]'), Y = () => document.querySelector('.chan-outbox-list .chan-prop[data-proposal="${pyId}"]');
    for (let i = 0; i < 80 && !(X() && Y() && Y().querySelector('button[data-approve]')); i++) await new Promise((r) => setTimeout(r, 250));
    if (!X() || !Y()) return { fail: 'no cards' };
    const before = { text: Y().querySelector('button[data-approve]').textContent, deliver: Y().querySelector('button[data-approve]').dataset.deliver };
    X().querySelector('button[data-more="reject"]').click();
    await new Promise((r) => setTimeout(r, 150));
    const item = [...document.querySelectorAll('.chan-split-menu .context-menu-item')].find((x) => /wake now/.test(x.textContent));
    if (!item) return { fail: 'no reject-and-wake item' };
    item.click();
    await new Promise((r) => setTimeout(r, 150));
    const boxOpen = !!X().querySelector('.chan-prop-rejectbox');
    const primary = Y().querySelector('button[data-approve]');
    const after = { text: primary.textContent, deliver: primary.dataset.deliver };
    primary.click();
    for (let i = 0; i < 80; i++) {
      const c = Y(); const f = c && c.querySelector('.chan-prop-fate');
      if (c && /chan-prop-sent/.test(c.className) && f) return { before, boxOpen, after, fate: f.textContent, xState: X().querySelector('.chan-prop-state').textContent };
      await new Promise((r) => setTimeout(r, 250));
    }
    return { fail: 'Y never sent', before, boxOpen, after };
  })()`);
  ok(!said.fail && said.before.deliver === 'next-turn' && said.boxOpen && said.after.deliver === 'wake-now' && said.after.text === 'Approve and wake the agent now (starts a turn)', `⑩ r3: after "Reject … and wake now" is picked on card X (box open, nothing posted), card Y's primary READS the wake words at once ("${said.after && said.after.text}")`, JSON.stringify(said));
  ok(!said.fail && /^Handed to beta at (\d\d-\d\d )?\d\d:\d\d — it was woken for it$/.test(said.fate) && said.xState === 'awaiting your approval', `⑩ r3: …and its press does what it says: woken ("${said.fate}"); card X still awaits`, JSON.stringify(said));
  let fr2 = [];
  for (let i = 0; i < 40 && !(fr2 = frames(BETA).slice(fr1).filter((f) => /Channel receipt/.test(JSON.stringify(f)))).length; i++) await sleep(250);
  ok(fr2.length === 1, `⑩ r3: ONE woken receipt reached beta's stub for the press (${fr2.length})`);
}

// ── ⑪ lane channels-badges: ONE badge per account (each account card's icon = its conversations' corner badge), the
// VibeSpace badge on VibeSpace's own talk, the internal fold PERSISTED and SYNCED to a second client (no reload) ──
{
  const fg = await api('POST', '/api/channel-groups', { name: 'fold lane', members: AGENTS.map((a) => a.cid), quiet: true });
  const fgid = fg.body && fg.body.group && fg.body.group.id;
  const p2 = await newPage();
  ok(!!fgid && (await p2.load()) && (await p2.evaljs(OPEN_PANEL)) && (await p1.evaljs(OPEN_PANEL)), '⑪ FIXTURE: a fresh agent group + a SECOND client with the panel open');
  const CENSUS = `(() => {
    const P = document.querySelector('.rail-panel-channels'); if (!P) return null;
    const sig = (b) => (b ? [b.dataset.hue || '', b.dataset.vs || '', (b.querySelector('svg') || {}).innerHTML || ''].join('|') : null);
    const rows = [...P.querySelectorAll('.chan-groups .chan-grow')];
    const conv = rows.filter((r) => !r.dataset.group).map((r) => ({ key: r.dataset.grow, b: sig(r.querySelector('.chan-av-badge')), t: (r.querySelector('.chan-av-badge') || {}).title || '' }));
    const groups = rows.filter((r) => r.dataset.group).map((r) => { const av = r.querySelector('.chan-av'); return { id: r.dataset.group, b: sig(r.querySelector('.chan-av-badge')), vs: !!(av && av.classList.contains('chan-av-vs')), hue: av ? av.dataset.hue || null : null, mark: av ? ((av.querySelector(':scope > .chan-ic svg') || {}).innerHTML || '') : '' }; });
    const heads = {};
    for (const s of P.querySelectorAll('.chan-sec[data-adapter]')) { const b = s.querySelector('.chan-sec-head .chan-av-badge'); heads[s.dataset.adapter] = { b: sig(b), t: b ? b.title : '', kindTile: !!s.querySelector('.chan-sec-head .chan-av.chan-sec-kind') }; }
    const ih = P.querySelector('.chan-groups .chan-ihead');
    if (!conv.length || !groups.some((g) => g.id === ${JSON.stringify(fgid)}) || !ih) return null;
    return { conv, groups, heads, ihead: sig(ih.querySelector('.chan-av-badge')) };
  })()`;
  const cs = await until(CENSUS);
  const adapterOf = (k) => { const i = k.lastIndexOf('/'); return k.slice(0, i); };
  ok(cs && cs.conv.every((c) => { const h = cs.heads[adapterOf(c.key)]; return h && h.b && h.b === c.b && h.t && c.t === h.t; }) && Object.values(cs.heads).every((h) => h.b && !h.kindTile),
    `⑪ BADGE CENSUS: every conversation row's badge (glyph + hue) is EXACTLY its account card's icon, and both hovers name the account (${cs ? cs.conv.length : 0} rows, ${cs ? Object.keys(cs.heads).length : 0} cards)`, JSON.stringify(cs));
  // lane internal-rows-look (the owner, 2026-10-09: the 8 px corner badge did not tell agent rows from a Lark group): the
  //  group row's avatar IS the VibeSpace mark on a muted disc — no hue, no corner badge; the internal head wears that mark
  ok(cs && cs.groups.length >= 1 && cs.ihead && cs.ihead.split('|')[1] === '1' && cs.groups.every((g) => !g.b && g.vs && g.hue === null && g.mark && g.mark === cs.ihead.split('|')[2]) && Object.values(cs.heads).some((h) => h.b === cs.ihead),
    '⑪ every agent group row wears the VibeSpace mark AS its avatar (muted, no hue, no corner badge) — the mark the internal head and the built-in agents card wear', JSON.stringify(cs && { groups: cs.groups, ihead: cs.ihead }));
  const shots = process.env.VS_SHOTS_DIR || '';
  // the account cards folded for this page only (their heads — icon · name — in one view with the internal block)
  const shoot = async (name) => {
    if (!shots) return;
    const r = await p2.evaljs(`(() => { for (const h of document.querySelectorAll('.rail-panel-channels .chan-sec[data-adapter]:not(.chan-collapsed) > .chan-sec-head')) h.click(); const e = document.querySelector('.sidebar'); const ih = document.querySelector('.rail-panel-channels .chan-ihead'); if (ih) ih.scrollIntoView({ block: 'start' }); const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: Math.min(b.height, 1400) }; })()`);
    const png = await p2.cdp('Page.captureScreenshot', { format: 'png', clip: { ...r, scale: 1 } });
    fs.writeFileSync(path.join(shots, name), Buffer.from(png.result.data, 'base64'));
  };
  if (shots) {
    await p2.evaljs(`(() => { localStorage.setItem('vibespace.lang', 'zh'); return 1; })()`);
    await p2.cdp('Emulation.setDeviceMetricsOverride', { width: 1100, height: 1300, deviceScaleFactor: 1, mobile: false });
    await p2.load(); await p2.evaljs(OPEN_PANEL);
    await p2.evaljs(`(() => { const s = document.querySelector('.sidebar'); s.style.width = '440px'; const a = document.querySelector('.rail-panel-channels .chan-part[data-part="accounts"]'); if (a && a.classList.contains('chan-part-collapsed')) a.querySelector('.chan-part-head').click(); return 1; })()`);
    await sleep(1500);
  }
  const FOLDED = `(() => { const P = document.querySelector('.rail-panel-channels'); const ih = P && P.querySelector('.chan-groups .chan-ihead'); if (!ih) return null;
    return { folded: ih.classList.contains('chan-ihead-folded'), expanded: ih.getAttribute('aria-expanded'), groups: P.querySelectorAll('.chan-groups .chan-grow[data-group]').length, convs: P.querySelectorAll('.chan-groups .chan-grow:not([data-group])').length, count: ih.querySelector('.chan-ihead-count').textContent }; })()`;
  const on = (pg, want, ms = 15000) => (async () => { const end = Date.now() + ms; let v = null; while (Date.now() < end) { try { v = await pg.evaljs(FOLDED); } catch {} if (v && v.folded === want) return v; await sleep(250); } return v; })();
  const before = await p1.evaljs(FOLDED), before2 = await on(p2, false);
  ok(before && before.folded === false && before.expanded === 'true' && before.groups >= 1 && before2 && before2.folded === false && before2.groups >= 1,
    '⑪ lane channels-fold: the owner\'s explicit UNFOLD (①b) holds here AND on the SECOND client\'s fresh load (user state, not this page)', JSON.stringify({ before, before2 }));
  await shoot('after-unfolded-zh.png');
  await p1.evaljs(`(() => { document.querySelector('.rail-panel-channels .chan-groups .chan-ihead').click(); return 1; })()`);
  let us2 = null;
  for (let i = 0; i < 20; i++) { us2 = (await api('GET', '/api/user-state')).body; if (us2 && us2.channelsPanelFolds && us2.channelsPanelFolds.internal === true) break; await sleep(250); }
  ok(us2 && us2.channelsPanelFolds && us2.channelsPanelFolds.internal === true, '⑪ folding VibeSpace internal PATCHes user state (`channelsPanelFolds.internal: true`)', JSON.stringify(us2 && us2.channelsPanelFolds));
  const f1 = await on(p1, true), f2 = await on(p2, true);
  ok(f1 && f1.folded && f1.groups === 0 && f1.convs >= 1 && f1.count === before.count, '⑪ folded: the head ALONE stands for the internal rows (its count kept); the people\'s conversations stay', JSON.stringify(f1));
  ok(f2 && f2.folded && f2.groups === 0, '⑪ …and the SECOND client folds too — the user-state broadcast, no reload', JSON.stringify(f2));
  await shoot('after-zh.png');
  await p2.evaljs(`(() => { document.querySelector('.rail-panel-channels .chan-groups .chan-ihead').click(); return 1; })()`);
  const u1 = await on(p1, false);
  let us3 = null;
  for (let i = 0; i < 20; i++) { us3 = (await api('GET', '/api/user-state')).body; if (us3 && us3.channelsPanelFolds && us3.channelsPanelFolds.internal === false) break; await sleep(250); }
  ok(u1 && u1.folded === false && u1.groups >= 1 && us3 && us3.channelsPanelFolds && us3.channelsPanelFolds.internal === false,
    '⑪ unfolding on the second client unfolds the first (synced both ways) — and it is the explicit `internal: false` again', JSON.stringify({ u1, folds: us3 && us3.channelsPanelFolds }));
}

// ── ⑫ lane stash-any-turn (the owner 2026-10-05: "outbox 发的消息也是一个计费回合啊，也应该直接唤醒把"): a group message
// parked for beta's NEXT TURN rides the next BILLED WAKE, whoever starts it — here alpha's @beta in another group (a
// group wake through THE ladder into beta's stub; nobody typed): the woken turn's prompt-context (its UserPromptSubmit
// hook route) carries the parked report under the echo guard's words, the strip above beta's composer empties, and
// beta's chat draws the report's card at that injection point ──
{
  const BETA = AGENTS[1], ALPHA = AGENTS[0];
  const pk = await api('POST', '/api/channel-groups', { name: 'parked lane', members: AGENTS.map((a) => a.cid), quiet: true });
  const pkid = pk.body && pk.body.group && pk.body.group.id;
  const PARKED = 'parked for beta: the schema review is ready';
  const fr0 = frames(BETA).length;
  const posted = await api('POST', '/api/agent/msg/send', { to: pkid, text: PARKED }, { Authorization: 'Bearer ' + ALPHA.token });
  ok(!!pkid && posted.status === 200 && frames(BETA).length === fr0, '⑫ FIXTURE: alpha posts into a fresh group with nobody named — beta (next-turn) is woken by NOTHING, the message is parked', JSON.stringify(posted.body));
  const BV = `[...app.sessions.values()].find((v) => v && v.sessionId === 'sess-grp-b')`;
  await p1.evaljs(`app.attachSession('sess-grp-b', 'beta', ${JSON.stringify(wt)}, { mode: 'chat', backend: 'claude' }); true`);
  const VIEWB = `(() => { const v = ${BV}; if (!v || !v._messageList) return null; const st = v._stashFact && v._stashFact.stash; const items = (st && st.items) || [];
    return { group: items.filter((i) => i && i.kind === 'group').reduce((a, i) => a + (Number(i.n) || 0), 0), cards: [...v._messageList.querySelectorAll('.chat-group-message')].map((e) => e.textContent) }; })()`;
  const viewUntil = async (pred, ms = 20000) => { const end = Date.now() + ms; let v = null; while (Date.now() < end) { try { v = await p1.evaljs(VIEWB); } catch {} if (v && pred(v)) return v; await sleep(250); } return v; };
  const pre = await viewUntil((v) => v.group >= 1);
  ok(pre && pre.group >= 1 && !pre.cards.some((t) => t.includes(PARKED)), '⑫ beta\'s strip counts the parked group message (waiting for the next turn) and its chat has no card for it yet', JSON.stringify(pre));
  // the wake: alpha @mentions beta in a SECOND group (a group wake through THE ladder — the fixture sessions share no
  // Task Group, so a direct `send beta` is out of reach here); the parked group is not the woken one
  const wk = await api('POST', '/api/channel-groups', { name: 'wake lane', members: AGENTS.map((a) => a.cid), quiet: true });
  const wkid = wk.body && wk.body.group && wk.body.group.id;
  const woke = await api('POST', '/api/agent/msg/send', { to: wkid, text: '@beta one quick question' }, { Authorization: 'Bearer ' + ALPHA.token });
  for (let i = 0; i < 40 && frames(BETA).length === fr0; i++) await sleep(250);
  ok(woke.status === 200 && frames(BETA).length === fr0 + 1, `⑫ alpha's @beta in another group wakes beta's stub ONCE through the REAL ladder — a billed turn nobody typed (${frames(BETA).length - fr0})`, JSON.stringify(woke.body));
  const ctx = await api('GET', '/api/agent/prompt-context', undefined, { Authorization: 'Bearer ' + BETA.token });
  const c = String((ctx.body && ctx.body.context) || '');
  ok(c.includes(PARKED) && c.includes('### Group messages since your last turn') && c.split('(these arrived while you were handling something else').length === 2,
    '⑫ the WOKEN turn\'s prompt-context carries the parked report — under the echo guard\'s words, said once', c.slice(-1200));
  ok(!c.includes('one quick question') && frames(BETA).slice(fr0).some((f) => JSON.stringify(f).includes('one quick question')), '⑫ …and not the wake\'s own message again (its frame carried it)', c.slice(-1200));
  const post = await viewUntil((v) => v.group === 0 && v.cards.some((t) => t.includes(PARKED)));
  ok(post && post.group === 0, '⑫ the strip EMPTIES — nothing waits for a keystroke', JSON.stringify(post));
  ok(post && post.cards.some((t) => t.includes(PARKED)), '⑫ beta\'s chat draws the report\'s card at the injection point (the group-report-card rule)', JSON.stringify(post));
  const again = await api('GET', '/api/agent/prompt-context', undefined, { Authorization: 'Bearer ' + BETA.token });
  ok(!String((again.body && again.body.context) || '').includes(PARKED), '⑫ …exactly once: the next turn carries it no more');
}

// ── ⑬ lane pair-group-fate (+ r2): a message to a conversation that ENDED — alpha `send beta` makes their pair, the
// sidebar archives beta (THE user-state write), the pair CLOSES; a zh page draws the line under alpha's message as not
// delivered (archived, with when), never 等待, and lists the pair under the archived groups ──
{
  const ALPHA = AGENTS[0], BETA = AGENTS[1];
  const tg = await api('POST', '/api/tasks', { title: 'pair fate', sessions: AGENTS.map((a) => 'claude:' + a.cid) });
  const FATE = 'for beta: the pair-fate note';
  const sent = await api('POST', '/api/agent/msg/send', { to: BETA.cid, text: FATE }, { Authorization: 'Bearer ' + ALPHA.token });
  const pid = sent.body && sent.body.group && sent.body.group.id;
  ok(tg.status === 200 && sent.status === 200 && !!pid, '⑬ FIXTURE: one Task Group; alpha `send beta` makes their pair group', JSON.stringify([tg.status, sent.status, sent.body]).slice(0, 400));
  const us = (await api('GET', '/api/user-state')).body || {};
  const ar = await api('PATCH', '/api/user-state', { archivedSessions: [...(us.archivedSessions || []), 'claude:' + BETA.cid] });
  let closed = null;
  for (let i = 0; i < 40 && !closed; i++) { const l = await api('GET', '/api/channel-groups'); closed = ((l.body && l.body.groups) || []).find((g) => g.id === pid && g.archivedAt) || null; if (!closed) await sleep(250); }
  ok(ar.status === 200 && closed && closed.closed && closed.closed.why === 'archived', '⑬ the sidebar archive of beta (THE user-state write) CLOSES the pair (archived)', JSON.stringify(closed).slice(0, 400));
  const again = await api('POST', '/api/agent/msg/send', { to: BETA.cid, text: 'still there?' }, { Authorization: 'Bearer ' + ALPHA.token });
  ok(again.body && again.body.code === 'ended', '⑬ send beta is now refused `ended`, by name', JSON.stringify(again.body).slice(0, 300));
  const p = await newPage();
  await p.cdp('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('vibespace.lang', 'zh'); } catch {}` });
  ok(await p.load(), '⑬ zh: a page in zh loaded');
  await p.evaljs(`(() => { window.app.openChannel('groups', '${pid}'); return 1; })()`);
  const DLVP = DLV(FATE).replace(`=== '${gid}'`, `=== '${pid}'`);
  let dz = null;
  for (const end = Date.now() + 20000; Date.now() < end && !dz;) { try { dz = await p.evaljs(`(() => { const d = ${DLVP}; return d && /未送达/.test(d.text || '') ? d : null; })()`); } catch {} if (!dz) await sleep(250); }
  ok(dz && /^未送达——beta 的对话已于 .+ 归档$/.test(dz.text) && dz.whole && dz.tone !== 'waiting' && !/等待/.test(dz.title), '⑬ zh: the line under alpha\'s message reads "未送达——beta 的对话已于 … 归档", whole in its row — never 等待', JSON.stringify(dz));
  await p.evaljs(OPEN_PANEL);
  let li = null;
  for (const end = Date.now() + 20000; Date.now() < end && !(li && li.row);) {
    try { li = await p.evaljs(`(() => { const P = document.querySelector('.rail-panel-channels'); const tog = P && P.querySelector('.chan-archived-toggle'); if (!tog) return null;
      if (!tog.classList.contains('chan-archived-open')) { tog.click(); return { label: tog.textContent }; }
      const row = P.querySelector('.chan-grow.chan-grow-archived[data-group="${pid}"]'); const live = P.querySelector('.chan-grow:not(.chan-grow-archived)[data-group="${pid}"]');
      return { label: P.querySelector('.chan-archived-toggle').textContent, row: row ? row.textContent : null, live: !!live }; })()`); } catch {}
    if (!(li && li.row)) await sleep(250);
  }
  ok(li && li.row && !li.live && /归档/.test(li.label), '⑬ zh: the closed pair is listed under the archived groups (not among the live rows)', JSON.stringify(li));
}

console.log(`\n${fail ? 'FAILED' : 'ALL PASS'} (${pass} passed, ${fail} failed)`);
process.exit(fail ? 1 : 0);
