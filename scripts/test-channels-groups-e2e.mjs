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
//   ⑥ THE LIST ORDERS BY ACTIVITY: groups and a tracked fake conversation in
//      ONE list, newest first (the fake's records carry their own instants —
//      the fixture includes future-dated ones, so it is placed by them, never
//      by a guess); a second group (created later) is ahead of the first, a
//      message in the first moves it ahead again — repainted in place from
//      `channel-groups-updated`, zero fetches
//   ⑦ an AGENT posts into the group (its session token, the CLI's route): the
//      row shows 1 unread and the rail's Channels badge counts it; opening the
//      window marks it read (the owner's act) and the rail badge drops by one
//   ⑧ the Accounts section's fold is PERSISTED: folded, reloaded, still folded
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
import { freePort, scratch, scratchHome, ONBOARDED_SOURCE } from './scratch.mjs';
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
  env: { ...process.env, PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: PASSWORD, VIBESPACE_CHANNELS_FAKE: '1' },
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
  for (let i = 0; i < 80; i++) { if (document.querySelectorAll('#chan-group-new-dialog .chan-gpick-item input').length >= 2) break; await new Promise((r) => setTimeout(r, 250)); }
  const d = document.getElementById('chan-group-new-dialog');
  if (!d) return { fail: 'no dialog' };
  const boxes = [...d.querySelectorAll('.chan-gpick-item input')];
  const out = { names: [...d.querySelectorAll('.chan-gpick-name')].map((n) => n.textContent), secs: [...d.querySelectorAll('.chan-gpick-sec')].map((n) => n.textContent), preChecked: boxes.filter((b) => b.checked).length, wakeOn: d.querySelector('.chan-group-wake input').checked, disabledBefore: d.querySelector('[data-group-submit]').disabled };
  const name = d.querySelector('.chan-group-name'); name.value = ${JSON.stringify(HOSTILE)}; name.dispatchEvent(new Event('input'));
  for (const b of boxes) { b.checked = true; b.dispatchEvent(new Event('change')); }
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

// ── ⑤ the @-autocomplete + a mention wakes a next-turn member ──
const s2 = await p1.evaljs(SEND('can you take the data half?', { mention: '@be' }));
await sleep(800);
const fB2 = frames(AGENTS[1]);
ok(JSON.stringify(s2.pop) === '["beta"]' && s2.afterPick === '@beta ', 'the @-autocomplete offers the member list ("@be" ⇒ beta) and Enter inserts "@beta "', JSON.stringify(s2));
ok(/Will wake .*beta/.test(s2.preview || '') && fB2.length === 2 && /You were @mentioned/.test(fB2[1].message.content), 'an @mention wakes the next-turn member (preview named it; its stub recorded the mention wake)', JSON.stringify(fB2.map((f) => f.message.content.slice(0, 60))));

// ── ⑥ the list orders by ACTIVITY, repainted in place ──
await api('POST', '/api/channels/fake-poll/fake-poll-ops/track', { tracked: true });
await sleep(1500);
const second = await api('POST', '/api/channel-groups', { name: 'second lane', members: AGENTS.map((a) => a.cid), quiet: true });
ok(second.status === 200 && second.body.ok && second.body.woke.length === 0, 'CONTROL: a QUIET create wakes nobody (woke 0)', JSON.stringify(second.body && second.body.woke));
const armFetch = await p1.evaljs(`(() => { window.__gf = 0; const of = window.fetch; window.__of = of; window.fetch = function (u, ...r) { if (/^\\/api\\/channel-groups(\\?|$)/.test(String(u)) || /^\\/api\\/channels(\\?|$)/.test(String(u))) window.__gf++; return of.call(this, u, ...r); }; return 1; })()`);
const ORDER = `(() => [...document.querySelectorAll('.rail-panel-channels .chan-groups > .chan-grow')].map((r) => ({ key: r.dataset.grow, at: Number(r.dataset.at) })))()`;
const A2 = `groups/${second.body.group.id}`, A1 = `groups/${gid}`, CONV = 'fake-poll/fake-poll-ops';
const sortedByActivity = (o) => o.every((x, i) => i === 0 || o[i - 1].at >= x.at);
const idx = (o, k) => o.findIndex((x) => x.key === k);
const o1 = await until(`(() => { const o = ${ORDER}; const k = o.map((x) => x.key); return k.includes('${A2}') && k.includes('${CONV}') ? o : null; })()`);
ok(o1 && sortedByActivity(o1) && idx(o1, A2) < idx(o1, A1) && idx(o1, CONV) >= 0, 'THE LIST ORDERS BY ACTIVITY: groups and the tracked conversation in ONE list, newest first — the later group ahead of the earlier one (the fake conversation sits by its own records\' instants)', JSON.stringify(o1));
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
const watcher = await p1.evaljs(`(() => document.querySelector('.rail-panel-channels .chan-part[data-part="watcher"]').classList.contains('chan-part-collapsed'))()`);
ok(watcher === false, 'CONTROL: the Message watcher section (never folded) is open — the fold is per section');

console.log(`\n${fail ? 'FAILED' : 'ALL PASS'} (${pass} passed, ${fail} failed)`);
process.exit(fail ? 1 : 0);
