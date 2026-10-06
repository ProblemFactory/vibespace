#!/usr/bin/env node
// SEARCH EVERYTHING — the chrome leg (lane global-search-chrome, 2026-10-05; heavy; the leg lane global-search cut at
// budget). A worktree server on a free port over a scratch HOME seeded with the builder's fixtures
// (scripts/fixtures/global-search: the claude JSONL — padded with 60 later turns so its first message sits far above
// the fold — and the codex rollout), and one
// fake-claude live session whose Write record files note.md as an artifact (the registry's own door into the index).
// The index is built by the REAL backfill (60 s after boot) — the suite waits on GET /api/search/status, never a sleep.
//   ① ⚙ Tools ▸ Search everything… opens the `search` window; a second open focuses the same one (singleton)
//   ⑦ before the index is built the window says so from /status and PATCHES that line in place (Indexing N of M… —
//      one /status answer held at `running` through CDP Fetch: the real 2-conversation walk takes milliseconds — →
//      the real counts) — never a line that stays for ever; a query of only operators says "No matches", never an error
//   ② a 2-character Chinese query lists BOTH conversations, grouped under their names, snippets whose <mark>s are the
//      hit; the list is built from text nodes only (a peer's `<img onerror>` stays text)
//   ⑥ the scope chips filter IN PLACE: the rows that stay are the same nodes (keyed), Files lists the artifact only
//   ③ ↓ + Enter on the padded conversation's first-message hit opens it (dead ⇒ read-only history) and the message is
//      IN the chat viewport (a rect probe); the codex conversation's hit lands too
//   ④ the artifact hit opens the Doc window on note.md
//   ⑤ Ctrl+K: nothing named like the text ⇒ the "Search conversations and files for '…'" row is the only row; Enter
//      on it opens the window with the query
//   ⑨ Ctrl+Shift+F opens the window from a chat composer (the composer keeps its text); inside a terminal the terminal
//      owns its keys (the core rule): no window, no double action
//   ⑧ zh and ja words in the window; a 390 px phone page: the list fills, the chips wrap, nothing clipped (rect census)
// SKIPs with evidence without chrome / dtach. Free ports, scratch dirs only; no real vendor CLI is ever run.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, scratchHome, freePort, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port for every server this suite boots (test-architecture §57)
const require = createRequire(import.meta.url);
const { WebSocket } = require('ws');

let pass = 0, fail = 0, skipped = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + String(extra).slice(0, 1200) : '')); } return !!c; };
const skip = (n) => { skipped++; console.log('  ⊘ SKIP ' + n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms, every = 100) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await pred()) return true; await sleep(every); } return !!(await pred()); };
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FIX = path.join(repo, 'scripts/fixtures/global-search');
const ROOT = scratch('global-search-ui');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const procs = new Set(); const worktrees = new Set(); let fakeHome = null;
function cleanup() {
  for (const p of procs) { try { p.kill('SIGKILL'); } catch { } }
  try { endRootedProcesses(ROOT); } catch { }
  for (const wt of worktrees) { try { execFileSync('git', ['-C', repo, 'worktree', 'remove', '--force', wt], { stdio: 'ignore' }); } catch { } }
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { }
  if (fakeHome) { try { fs.rmSync(fakeHome, { recursive: true, force: true }); } catch { } }
}
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });

const SID = '0f5e1a00-0000-4000-8000-00000000a001', TA = '0199aaaa-0000-7000-8000-00000000c0a1';
const HIT = 'Gmail 的限额什么时候刷新', XSS = '限额 <img src=x onerror="window.__gsXss=1"> 与 <b>粗体</b>';
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
let dtachOk = false; try { execFileSync('/usr/bin/which', ['dtach'], { stdio: 'ignore' }); dtachOk = true; } catch { }
if (!CHROME) skip('no chrome/chromium on this box — every leg needs one');
else if (!dtachOk) skip('dtach is not installed — the live session (the artifact door) cannot be created here');
else await (async () => {
  fakeHome = scratchHome('global-search-ui-home', fs);
  // ── the fixtures (scratch HOME only): the builder's claude JSONL + 60 later turns (one carries a peer's markup) ──
  const rec = (role, uuid, ts, text) => JSON.stringify(role === 'user'
    ? { type: 'user', uuid, sessionId: SID, timestamp: ts, cwd: '/w/proj', message: { role: 'user', content: text } }
    : { type: 'assistant', uuid, sessionId: SID, timestamp: ts, message: { id: 'msg_' + uuid, role: 'assistant', model: 'claude-fixture', content: [{ type: 'text', text }] } });
  const pad = [];
  for (let i = 0; i < 60; i++) {
    const ts = new Date(Date.UTC(2026, 9, 5, 9, 1 + i)).toISOString();
    pad.push(rec('user', `p-u${i}`, ts, `Padding question ${i}: walk the next step of the plan.`));
    pad.push(rec('assistant', `p-a${i}`, ts, i === 30 ? XSS : `Padding answer ${i}.\n\nThe plan moves one step: read, check, write.\n\n- a line\n- another line\n- a third line`));
  }
  const proj = path.join(fakeHome, '.claude/projects/-w-proj'); fs.mkdirSync(proj, { recursive: true });
  fs.writeFileSync(path.join(proj, SID + '.jsonl'), fs.readFileSync(path.join(FIX, `claude-${SID}.jsonl`), 'utf-8').trimEnd() + '\n' + pad.join('\n') + '\n');
  const cdir = path.join(fakeHome, '.codex/sessions/2026/10/05'); fs.mkdirSync(cdir, { recursive: true });
  fs.copyFileSync(path.join(FIX, 'codex-rollout-a.jsonl'), path.join(cdir, `rollout-2026-10-05T10-00-00-${TA}.jsonl`));


  // ── the fake claude (the live session): files note.md through a Write record on its stream, then idles ──
  const wt = path.join(ROOT, 'wt'), BIN = path.join(ROOT, 'bin'), LIVE = path.join(ROOT, 'live');
  for (const d of [BIN, LIVE]) fs.mkdirSync(d, { recursive: true });
  const NOTE = path.join(LIVE, 'note.md'); fs.copyFileSync(path.join(FIX, 'note.md'), NOTE);
  const lines = [
    { type: 'system', subtype: 'init', session_id: '5e551000-0000-4000-8000-0000000a0001', cwd: LIVE, model: 'claude-fable-5', apiKeySource: 'none', tools: [], mcp_servers: [] },
    { type: 'assistant', session_id: '5e551000-0000-4000-8000-0000000a0001', message: { id: 'msg_live_1', role: 'assistant', model: 'claude-fable-5', content: [{ type: 'tool_use', id: 'tu_live_1', name: 'Write', input: { file_path: NOTE, content: fs.readFileSync(NOTE, 'utf-8') } }] } },
  ];
  fs.writeFileSync(path.join(ROOT, 'live.jsonl'), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  fs.writeFileSync(path.join(BIN, 'claude'), `#!/bin/sh\ncase " $* " in *" --output-format "*) ;; *) exec sleep 600;; esac\nsleep 1; cat '${path.join(ROOT, 'live.jsonl')}'\nexec sleep 600\n`, { mode: 0o755 });
  fs.writeFileSync(path.join(BIN, 'codex'), `#!/bin/sh\ncase " $* " in *" --version "*) echo 'codex-cli 0.0.0-fake'; exit 0;; esac\nexec sleep 600\n`, { mode: 0o755 });

  const PORT = await freePort(), CDP = await freePort();
  execFileSync('git', ['-C', repo, 'worktree', 'add', '--detach', wt, 'HEAD'], { stdio: 'ignore' }); worktrees.add(wt);
  // the WORKING tree is what is judged (a pre-commit run tests what is about to ship)
  for (const f of ['src', 'public', 'server.js', 'package.json']) { execFileSync('rm', ['-rf', path.join(wt, f)]); execFileSync('cp', ['-r', path.join(repo, f), path.join(wt, f)]); }
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
  const esbuild = require(path.join(repo, 'node_modules', 'esbuild'));
  await esbuild.build({ entryPoints: [path.join(wt, 'src/client.js')], bundle: true, outfile: path.join(wt, 'public/bundle.js'), format: 'iife', platform: 'browser', target: 'es2020', loader: { '.css': 'css' }, logLevel: 'silent' });
  const env = { ...process.env, ...VNC_ENV, PATH: BIN + ':' + (process.env.PATH || ''), CLAUDE_CMD: path.join(BIN, 'claude'), CODEX_CMD: path.join(BIN, 'codex'), PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' };
  let journal = '';
  const srv = spawn('node', ['server.js'], { cwd: wt, env, stdio: ['ignore', 'pipe', 'pipe'] });
  procs.add(srv); srv.stdout.on('data', (d) => { journal += d; }); srv.stderr.on('data', (d) => { journal += d; });
  if (!ok(await until(() => journal.includes('Ready.'), 40000), 'the worktree server booted', journal.slice(-800))) return;
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`); const msgs = []; ws.on('message', (d) => { try { msgs.push(JSON.parse(d)); } catch { } });
  await new Promise((r, e) => { ws.on('open', r); ws.on('error', e); });
  const create = async (reqId, o) => { ws.send(JSON.stringify({ type: 'create', cols: 80, rows: 24, reqId, ...o })); await until(() => msgs.some((m) => m.type === 'created' && m.reqId === reqId), 15000); return msgs.find((m) => m.type === 'created' && m.reqId === reqId)?.sessionId || null; };
  const live = await create('live', { backend: 'claude', mode: 'chat', cwd: LIVE });
  const term = await create('term', { backend: 'shell', mode: 'terminal', cwd: ROOT });
  const status = async () => { try { return await (await fetch(`http://127.0.0.1:${PORT}/api/search/status`)).json(); } catch { return null; } };
  let chrome = null, cdp = null;
  try {
  ok(!!live && !!term, 'a fake-claude chat session and a shell terminal were created', journal.slice(-600));

  chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', `--user-data-dir=${path.join(ROOT, 'chrome')}`, '--window-size=1280,900', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  procs.add(chrome);
  let target = null; for (let i = 0; i < 120 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find((t) => t.type === 'page'); } catch { } if (!target) await sleep(250); }
  if (!ok(!!target, 'chrome exposed a CDP page target')) return;
  cdp = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r, e) => { cdp.on('open', r); cdp.on('error', e); });
  let seq = 0; const pend = new Map(); const pageErrors = [];
  cdp.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } if (m.method === 'Runtime.exceptionThrown') pageErrors.push(String(m.params?.exceptionDetails?.exception?.description || m.params?.exceptionDetails?.text || '').slice(0, 300)); });
  const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); cdp.send(JSON.stringify({ id, method, params })); });
  const S = JSON.stringify;
  let holdRunning = false; // ⑦: while set, a /status answer the page asks for is the real one with the walk shown RUNNING
  cdp.on('message', async (d) => {
    const m = JSON.parse(d); if (m.method !== 'Fetch.requestPaused') return;
    const real = (await status()) || {};
    const body = holdRunning ? { ...real, backfill: { ...(real.backfill || {}), running: true, done: 1, total: 2 }, index: real.index ? { ...real.index, lastBuild: null } : real.index } : real;
    send('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify(body)).toString('base64') });
  });
  const ev = async (js) => {
    const r = await send('Runtime.evaluate', { expression: `(async () => { const app = window.app, wm = app.wm; const sw = () => [...wm.windows.values()].find((w) => w.type === 'search') || null; const q = (s) => sw()?.content.querySelector(s) || null; const qa = (s) => [...(sw()?.content.querySelectorAll(s) || [])]; ${js} })()`, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval threw');
    return r.result?.result?.value;
  };
  const key = (key, code, vk, modifiers = 0, text) => send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, modifiers, ...(text ? { text } : {}) }).then(() => send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, modifiers }));
  const DOWN = () => key('ArrowDown', 'ArrowDown', 40), ENTER = () => key('Enter', 'Enter', 13, 0, '\r');
  const typeQuery = async (text) => { await ev(`const b = q('.search-input'); b.focus(); b.select(); return true;`); await send('Input.insertText', { text }); };
  const listState = () => ev(`const st = q('.search-status'); return { status: st ? st.textContent : null, groups: qa('.search-group').map((g) => ({ name: g.querySelector('.search-group-name')?.textContent || '', hits: [...g.querySelectorAll('.search-hit')].map((h) => h.querySelector('.search-snippet')?.textContent || '') })), marks: qa('.search-hit mark').map((m) => m.textContent) };`);
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true }); // a headless page is never focused: the search box must really hold the focus
  await send('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); // §47: the first-run wizard would cover the chrome on an empty runner
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  const boot = async () => {
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
    for (let i = 0; i < 120; i++) { try { if (await ev('if (!window.app || !window.app.ready) return false; return await Promise.race([window.app.ready.then(() => true), new Promise((r) => setTimeout(() => r(false), 100))]);')) return true; } catch { } await sleep(250); }
    return false;
  };
  if (!ok(await boot(), 'the app booted in headless chrome (desktop, 1280×900)')) return;
  const pre = await status();
  ok(pre && !pre.backfill?.finishedAt, 'the index is not built yet (the backfill waits a minute after boot)', S(pre));

  console.log('\n① ⚙ Tools ▸ Search everything… opens the window; a second open focuses it');
  await ev(`document.querySelector('.global-settings-popover')?.remove(); document.getElementById('btn-global-settings').click(); return true;`);
  await until(() => ev(`return !!document.querySelector('.global-settings-popover .gs-menu-item[data-id="tools"]');`), 3000);
  await sleep(300); // the popover is placed on the next frame (test-gear-menu's own wait)
  await ev(`document.querySelector('.global-settings-popover .gs-menu-item[data-id="tools"]').click(); return true;`);
  const toolsRow = await until(() => ev(`return [...document.querySelectorAll('.global-settings-popover .gs-menu-item')].some((r) => /^Search everything…/.test(r.textContent.trim()));`), 3000);
  ok(toolsRow, 'the Tools flyout lists "Search everything…"', await ev(`return [...document.querySelectorAll('.global-settings-popover .gs-menu-item')].map((r) => r.textContent.trim()).join(' | ');`));
  await ev(`[...document.querySelectorAll('.global-settings-popover .gs-menu-item')].find((r) => /^Search everything…/.test(r.textContent.trim()))?.click(); return true;`);
  ok(await until(() => ev(`return !!sw();`), 4000), 'the row opened a window of type `search`');
  const box0 = await until(() => ev(`return document.activeElement === q('.search-input');`), 3000);
  ok(box0, 'the search box holds the focus');
  await ev(`window.__gsStatusNode = q('.search-status'); window.__gsTexts = []; new MutationObserver(() => window.__gsTexts.push(window.__gsStatusNode.textContent)).observe(window.__gsStatusNode, { childList: true, characterData: true, subtree: true }); window.__gsTexts.push(window.__gsStatusNode.textContent); app.wm.focusWindow && null; return true;`);
  await ev(`app.openSearch({}); return true;`);
  const single = await ev(`return { n: [...wm.windows.values()].filter((w) => w.type === 'search').length, active: wm.windows.get(wm.activeWindowId)?.type || null };`);
  ok(single.n === 1 && single.active === 'search', 'a second open keeps ONE search window and it is the active one', S(single));

  console.log('\n⑦ the index state: said from /status, patched in place until it is built');
  const t0 = await ev(`return window.__gsTexts[0];`);
  ok(/minute|^Indexing/.test(t0 || ''), `before the backfill the window says the index is not built ("${t0}") — never counts of a half-filled index`, t0);
  holdRunning = true; await send('Fetch.enable', { patterns: [{ urlPattern: '*/api/search/status*', requestStage: 'Request' }] });
  ok(await until(() => ev(`return window.__gsStatusNode.textContent === 'Indexing 1 of 2 conversations…';`), 6000), 'a running walk on /status is drawn as "Indexing 1 of 2 conversations…" on the same line', S(await ev(`return window.__gsTexts;`)));
  holdRunning = false; await send('Fetch.disable');
  const built = await until(async () => { const s = await status(); return !!(s && s.backfill && s.backfill.finishedAt && !s.backfill.running && s.index && s.index.rows > 0); }, 150000, 250);
  ok(built, 'the real backfill built the index (GET /api/search/status)', S(await status()));
  console.log('    ' + ((journal.match(/\[search-index\] backfill[^\n]*/) || ['(no backfill line in the journal)'])[0]));
  ok(await until(() => ev(`return /messages and \\d+ files indexed/.test(window.__gsStatusNode.textContent);`), 8000), 'the SAME status line now reads the counts (patched in place, no reload, no reopen)', S(await ev(`return { now: window.__gsStatusNode.textContent, connected: window.__gsStatusNode.isConnected, seen: window.__gsTexts };`)));
  const seen = await ev(`return window.__gsTexts;`);
  ok(seen.length >= 3 && seen.every((x, i) => i === 0 || x !== seen[i - 1]) && /files indexed$/.test(seen[seen.length - 1]), `the line changed only when its words did (${seen.length - 1} changes, a poll per second while unbuilt), ending at the counts`, S(seen));
  ok(await ev(`return window.__gsStatusNode.isConnected && q('.search-status') === window.__gsStatusNode;`), 'the status node was never replaced');
  ok(await until(async () => (await (await fetch(`http://127.0.0.1:${PORT}/api/search?q=${encodeURIComponent('设计笔记')}&scope=artifacts`)).json()).total >= 1, 15000), 'the live session\'s Write filed note.md and the index holds it (the registry\'s door)');

  console.log('\n② a 2-character Chinese query lists both conversations, grouped, marked');
  await typeQuery('限额');
  ok(await until(async () => (await listState()).groups.length >= 3, 8000), 'results are drawn', S(await listState()));
  let ls = await listState();
  const names = ls.groups.map((g) => g.name);
  const cl = ls.groups.find((g) => g.hits.some((h) => h.includes('Gmail'))), cx = ls.groups.find((g) => g.hits.some((h) => h.includes('codex 线程')));
  ok(!!cl && !!cx && cl !== cx, 'the claude conversation and the codex conversation are each a group', S(ls));
  ok(names.every((n) => n && !/^[0-9a-f]{8}$/.test(n)) && new Set(names).size === names.length, `groups carry names (${names.join(' · ')})`, S(names));
  ok(ls.groups.some((g) => g.name === 'Files' && g.hits.some((h) => h.includes('发现页'))), 'the artifact is listed under Files', S(ls));
  ok(ls.marks.length >= 3 && ls.marks.every((m) => m === '限额'), `every <mark> is the hit (${ls.marks.length} marks)`, S(ls.marks));
  const census = await ev(`const bad = qa('.search-list *').filter((e) => !['DIV', 'SPAN', 'MARK', 'BUTTON'].includes(e.tagName) || [...e.attributes].some((a) => !['class', 'role', 'title', 'aria-selected', 'data-key'].includes(a.name))).map((e) => e.outerHTML.slice(0, 80)); const x = qa('.search-snippet').find((s) => s.textContent.includes('onerror')); return { bad, xss: x ? x.textContent : null, fired: !!window.__gsXss };`);
  ok(census.bad.length === 0 && census.xss && census.xss.includes('<img src=x') && !census.fired, 'textContent census: a peer\'s <img onerror> is drawn as text — the list holds only div/span/mark/button', S(census));

  console.log('\n⑥ the scope chips filter in place (keyed rows)');
  await ev(`qa('.search-hit').forEach((r, i) => { r.__gsMark = 'k' + i; }); qa('.search-group').forEach((g) => { g.__gsMark = g.querySelector('.search-group-name').textContent; }); return true;`);
  const before = await ev(`return qa('.search-hit').map((r) => ({ m: r.__gsMark, t: r.querySelector('.search-snippet').textContent, art: r.closest('.search-group').querySelector('.search-group-name').textContent === 'Files' }));`);
  await ev(`qa('.search-chip')[1].click(); return true;`);
  ok(await until(async () => !(await listState()).groups.some((g) => g.name === 'Files'), 6000), 'Conversations: the Files group leaves', S(await listState()));
  const chats = await ev(`return qa('.search-hit').map((r) => ({ m: r.__gsMark || null, t: r.querySelector('.search-snippet').textContent }));`);
  const kept = chats.filter((r) => before.some((b) => b.m === r.m && b.t === r.t));
  ok(chats.length > 0 && kept.length === chats.length, `every message row that stayed is the SAME node (${kept.length} of ${chats.length})`, S({ before, chats }));
  ok(await ev(`return qa('.search-group').every((g) => !!g.__gsMark);`), '…and so is every group head');
  await ev(`qa('.search-chip')[2].click(); return true;`);
  ok(await until(async () => { const s = await listState(); return s.groups.length === 1 && s.groups[0].name === 'Files'; }, 6000), 'Files: the artifact group only', S(await listState()));
  await ev(`qa('.search-chip')[0].click(); return true;`);
  ok(await until(async () => (await listState()).groups.length >= 3, 6000), 'All: everything is back', S(await listState()));
  ok(await ev(`return qa('.search-chip').map((c) => c.classList.contains('on')).join() === 'true,false,false';`), 'the chip that is on is All');

  console.log('\n⑦ a query of only operators');
  await ev(`window.__gsToasts = 0; new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && /error/.test(n.className || '')) window.__gsToasts++; }).observe(document.body, { childList: true, subtree: true }); return true;`);
  await typeQuery('AND OR NOT');
  ok(await until(() => ev(`return q('.search-status').textContent === 'No matches' && qa('.search-hit').length === 0;`), 6000), 'it says "No matches" and lists nothing', S(await listState()));
  await sleep(500);
  ok(await ev(`return window.__gsToasts === 0;`), 'no error toast');

  console.log('\n③ ↓ + Enter lands on the hit, in the chat viewport');
  await typeQuery('限额');
  await until(async () => (await listState()).groups.length >= 3, 8000);
  const idx = await ev(`return qa('.search-hit').findIndex((r) => r.textContent.includes('Gmail'));`);
  for (let i = 0; i <= idx; i++) await DOWN();
  ok(await ev(`const r = qa('.search-hit'); return r[${idx}].classList.contains('active') && r.filter((x) => x.classList.contains('active')).length === 1;`), `↓ ×${idx + 1} selects the first-message hit`);
  await ENTER();
  const probe = (sid, needle) => ev(`const cv = [...app.sessions.values()].find((v) => v && v._search && typeof v._getSessionIds === 'function' && (v._getSessionIds() || {}).backendSessionId === ${S(sid)});
    if (!cv || !cv._messageList) return { cv: !!cv };
    const msg = [...cv._messageList.querySelectorAll('.chat-msg')].find((m) => m.textContent.includes(${S(needle)}));
    let sc = cv._messageList; while (sc && !(sc.scrollHeight > sc.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
    const cs = cv._search, dbg = { res: (cs._serverSearchResults || []).slice(0, 4).map((m) => [m.index, m.id]), at: cs._searchResultIdx, wb: cs._getWindowBounds ? cs._getWindowBounds() : null, full: cs._fullFileMode, q: cs._input && cs._input.value };
    if (!msg || !sc) return { cv: true, msg: !!msg, sc: !!sc, n: cv._messageList.querySelectorAll('.chat-msg').length, dbg };
    const a = msg.getBoundingClientRect(), b = sc.getBoundingClientRect();
    const vis = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return { cv: true, msg: true, sc: true, vis, h: Math.round(a.height), tall: sc.scrollHeight / sc.clientHeight, top: Math.round(sc.scrollTop), atBottom: sc.scrollHeight - sc.scrollTop - sc.clientHeight < 4 };`);
  let landed = null;
  const land = await until(async () => { landed = await probe(SID, HIT); return !!(landed && landed.vis >= Math.min(20, landed.h)); }, 20000, 250);
  ok(land, 'the padded conversation opened and the first-message hit is IN the chat viewport', S(landed));
  ok(landed && landed.tall > 3 && !landed.atBottom, 'it is a long conversation and the view left its bottom (the jump moved it)', S(landed));
  ok(await ev(`return !(app.sidebar._webuiSessions || []).some((r) => r.backendSessionId === ${S(SID)} || r.claudeSessionId === ${S(SID)});`), 'it opened as history (no live session was started for it)');
  await ev(`app.openSearch({}); return true;`);
  await until(() => ev(`return wm.windows.get(wm.activeWindowId)?.type === 'search';`), 3000);
  const cidx = await ev(`return qa('.search-hit').findIndex((r) => r.textContent.includes('codex 线程'));`);
  await ev(`qa('.search-hit')[${cidx}].click(); return true;`);
  let cl2 = null;
  ok(await until(async () => { cl2 = await probe(TA, 'codex 线程里也问了限额'); return !!(cl2 && cl2.msg && (cl2.vis >= Math.min(20, cl2.h) || !cl2.sc)); }, 20000, 250), 'the codex conversation (dead) opened and its hit is in view', S(cl2));

  console.log('\n④ the artifact hit opens the Doc window on the file');
  await ev(`app.openSearch({}); return true;`);
  await until(() => ev(`return wm.windows.get(wm.activeWindowId)?.type === 'search';`), 3000);
  await ev(`qa('.search-hit').find((r) => r.closest('.search-group').querySelector('.search-group-name').textContent === 'Files').click(); return true;`);
  let doc = null;
  ok(await until(async () => { doc = await ev(`const w = [...wm.windows.values()].find((w) => w.type === 'doc'); return w ? { title: w.title, text: (w.content.textContent || '').slice(0, 400) } : null;`); return !!(doc && /设计笔记/.test(doc.text)); }, 15000), 'a Doc window opened on note.md and shows its words', S(doc));

  console.log('\n⑤ Ctrl+K: the last row hands the words to Search everything');
  await ev(`for (const w of [...wm.windows.values()]) if (w.type === 'search') wm.closeWindow(w.id); document.activeElement?.blur?.(); return true;`);
  await key('k', 'KeyK', 75, 2);
  ok(await until(() => ev(`const i = document.querySelector('.session-palette input, .palette-input'); return !!i && document.activeElement === i;`), 4000), 'Ctrl+K opened the palette with its input focused');
  await send('Input.insertText', { text: '发现页' });
  let pal = null;
  ok(await until(async () => { pal = await ev(`const rows = [...document.querySelectorAll('.palette-row, .palette-item')].filter((r) => r.offsetParent); return rows.map((r) => ({ t: r.textContent.trim(), all: r.classList.contains('palette-search-all') }));`); return !!(pal && pal.length && pal[pal.length - 1].all); }, 5000), 'the last row is the "search everything" row', S(pal));
  ok(pal && pal.length === 1 && pal[0].t === "Search conversations and files for '发现页'", 'nothing is named like the text ⇒ it is the only row, and it names the words', S(pal));
  await ENTER();
  ok(await until(() => ev(`return !!sw() && q('.search-input').value === '发现页';`), 5000), 'Enter opened the window WITH the query');
  ok(await until(async () => (await listState()).groups.some((g) => g.name === 'Files'), 6000), '…and it ran (the artifact is listed)', S(await listState()));

  console.log('\n⑨ Ctrl+Shift+F from a chat composer and from a terminal');
  await ev(`for (const w of [...wm.windows.values()]) if (w.type === 'search') wm.closeWindow(w.id); return true;`);
  await ev(`app.attachSession(${S(live)}, '', ${S(LIVE)}, { mode: 'chat', backend: 'claude' }); return true;`);
  const composer = `[...wm.windows.values()].map((w) => app.sessions.get(w.id)).find((v) => v && v.sessionId === ${S(live)})?.container?.querySelector('textarea') || [...document.querySelectorAll('.window textarea')].find((t) => t.offsetParent)`;
  ok(await until(() => ev(`return !!(${composer});`), 10000), 'the live chat window shows its composer');
  await ev(`const t = ${composer}; t.focus(); return true;`);
  await send('Input.insertText', { text: 'draft' });
  await key('F', 'KeyF', 70, 10);
  ok(await until(() => ev(`return !!sw() && wm.windows.get(wm.activeWindowId)?.type === 'search';`), 4000), 'from the composer: the search window opened and is active');
  ok(await ev(`return (${composer}).value === 'draft';`), 'the composer kept its text (no F typed into it)', await ev(`return (${composer}).value;`));
  await ev(`for (const w of [...wm.windows.values()]) if (w.type === 'search') wm.closeWindow(w.id); return true;`);
  await ev(`app.attachSession(${S(term)}, '', ${S(ROOT)}, { mode: 'terminal', backend: 'shell' }); return true;`);
  ok(await until(() => ev(`return !!document.querySelector('.xterm-helper-textarea');`), 10000), 'the terminal window is drawn');
  await ev(`window.__gsSent = []; const o = WebSocket.prototype.send; WebSocket.prototype.send = function (d) { try { window.__gsSent.push(String(d)); } catch { } return o.call(this, d); }; const t = [...document.querySelectorAll('.xterm-helper-textarea')].pop(); t.focus(); return document.activeElement === t;`);
  await key('F', 'KeyF', 70, 10);
  await sleep(600);
  const tk = await ev(`return { win: !!sw(), sent: window.__gsSent.length };`);
  await key('f', 'KeyF', 70, 2); // CONTROL: plain Ctrl+F reaches the pty as ^F (the probe can see a key the terminal sends)
  await until(() => ev(`return window.__gsSent.some((d) => (d.includes('\\\\u0006') || d.includes('\\u0006')));`), 3000);
  const tc = await ev(`return window.__gsSent.filter((d) => (d.includes('\\\\u0006') || d.includes('\\u0006'))).length;`);
  ok(!tk.win, 'inside the terminal the terminal owns its keys (the core rule): Ctrl+Shift+F opens no window', S(tk));
  ok(tc === 1, 'CONTROL: the probe sees the terminal\'s keys (Ctrl+F went to the pty as ^F once)', S({ tk, tc }));

  console.log('\n⑧ zh + ja words; a 390 px phone page');
  for (const lang of ['zh', 'ja']) {
    await ev(`localStorage.setItem('vibespace.lang', ${S(lang)}); return true;`);
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    if (!ok(await boot(), `${lang}: the app re-booted at 390×844`)) continue;
    await ev(`app.openSearch({ q: '限额' }); return true;`);
    await until(async () => (await listState()).groups.length >= 3, 8000);
    const w = await ev(`const r = q('.search-win').getBoundingClientRect(), L = q('.search-list').getBoundingClientRect(), chips = qa('.search-chip').map((c) => { const b = c.getBoundingClientRect(); return { t: c.textContent, l: b.left, r: b.right, top: b.top }; });
      const lim = { l: Math.max(0, r.left), r: Math.min(innerWidth, r.right) };
      const clipped = qa('.search-win *').filter((e) => e.offsetParent && e.getClientRects().length).map((e) => ({ e, b: e.getBoundingClientRect() })).filter(({ b }) => b.width > 0 && (b.left < lim.l - 1 || b.right > lim.r + 1)).map(({ e, b }) => e.className + ' ' + Math.round(b.left) + '..' + Math.round(b.right));
      const overflow = qa('.search-win *').filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== 'visible' && !/search-list|search-input/.test(e.className)).map((e) => e.className);
      return { win: [Math.round(r.left), Math.round(r.right)], list: Math.round(L.width), chips, clipped, overflow, words: { ph: q('.search-input').placeholder, chips: chips.map((c) => c.t), status: q('.search-status').textContent, files: qa('.search-group-name').map((n) => n.textContent) }, vw: innerWidth };`);
    ok(w.vw === 390 && w.win[1] - w.win[0] >= 360, `${lang}: the window spans the phone width (${w.win.join('..')})`, S(w));
    ok(w.list >= (w.win[1] - w.win[0]) - 40, `${lang}: the list fills it (${w.list} px)`, S(w));
    ok(w.clipped.length === 0 && w.overflow.length === 0, `${lang}: nothing clipped (rect census over the window)`, S(w));
    ok(w.chips.every((c) => c.r <= w.win[1] + 1), `${lang}: the chips stay inside (wrap if they must)`, S(w.chips));
    const en = ['All', 'Conversations', 'Files', 'Search conversations and files…'];
    ok(!w.words.chips.some((c) => en.includes(c)) && !en.includes(w.words.ph) && !/matches/.test(w.words.status) && !w.words.files.includes('Files'), `${lang}: the window speaks ${lang} (${w.words.chips.join(' / ')} · ${w.words.status})`, S(w.words));
  }
  ok(pageErrors.length === 0, 'no page exceptions', S(pageErrors));
  } finally {
    try { cdp?.close(); } catch { }
    try { chrome?.kill('SIGKILL'); } catch { }
    for (const sid of [live, term]) { try { ws.send(JSON.stringify({ type: 'kill', sessionId: sid })); } catch { } }
    await until(() => [live, term].every((sid) => !sid || msgs.some((m) => (m.type === 'killed' || m.type === 'exited') && m.sessionId === sid)), 8000);
    try { ws.close(); } catch { }
  }
})();

console.log(`${fail ? `\n${fail} FAILED (${pass} passed${skipped ? `, ${skipped} skipped` : ''})` : `\nALL PASS (${pass}${skipped ? `, ${skipped} skipped` : ''})`}`);
cleanup();
process.exit(fail ? 1 : 0);
