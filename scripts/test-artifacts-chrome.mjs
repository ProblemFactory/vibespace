#!/usr/bin/env node
// DELIVERABLES ON A REAL PAGE (lane artifacts-model, heavy; docs/design-artifacts.zh.md). A THROWAWAY server in a git
// worktree (own data/, a scratch HOME) + headless chrome over raw CDP (test-chat-hygiene-ui's skeleton); a stub
// `claude` behind the real chat-wrapper plays three turns of the REAL stream-json shapes:
//   ① turn 1 Writes docs/BRIEF.md ⇒ ONE card, the chip reads "Artifacts · 1", and (artifacts.autoOpenDocs on, the
//     default) the document opens beside the chat by itself;
//   ② turn 2 Edits it ⇒ the SAME card element patched in place (a mark set on it survives; still one card node; its
//     words say the change), and no second window (an edit never re-opens);
//   ③ the setting OFF, turn 3 Writes docs/NOTES.md ⇒ a second card, nothing opens; one CLICK on the card opens it;
//   ④ a reload shows the same two cards (the server's messages; the replay itself is test-artifacts ⑤);
//   ⑤ lane artifacts-registries: turn 4 Writes site.html and runs the REAL vibespace-page publish + vibespace-design new
//     ⇒ ONE page card (its write and its publish are one row) + a design card; the composer attaches a file ⇒ an
//     upload card; each card opens its own door (/p/ link · Design window · the file); a reload replays all three.
//   ⑥ lane artifacts-services: turn 5 starts a REAL Background Work job (vibespace-job run) that serves a page on an
//     ephemeral port ⇒ a `service` card + the chip's Services head (after the documents); zh at 390 px: the card says
//     服务, one click opens the page in the Web view (its frame shows the served text).
// Run: node scripts/test-artifacts-chrome.mjs   (SKIPs without chrome)
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const VNC_ENV = await vncEnv();
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome'); process.exit(0); }
const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('artifacts-chrome-wt');
const fakeHome = scratchHome('artifacts-chrome-home', fs);
const stubDir = scratch('artifacts-chrome-stub');
fs.mkdirSync(stubDir, { recursive: true });
const CWD = path.join(fakeHome, 'proj');
fs.mkdirSync(path.join(CWD, 'docs'), { recursive: true });
const BRIEF = path.join(CWD, 'docs/BRIEF.md'), NOTES = path.join(CWD, 'docs/NOTES.md');
const SITE = path.join(CWD, 'site.html'), LANDING = path.join(CWD, 'designs/landing'), ATT = path.join(CWD, 'attach.pdf'); // lane artifacts-registries
const LIVE_SID = '5c3a0000-0000-4000-8000-0000000af001';
let failed = 0, passed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });

const A = (id, content) => ({ type: 'assistant', message: { id, type: 'message', role: 'assistant', model: 'claude-fable-5', content, usage: { input_tokens: 1, output_tokens: 1 } } });
const R = (tid) => ({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: tid, content: 'ok' }] } });
const TURNS = [
  [A('msg_a1', [{ type: 'text', text: 'Writing the brief.' }]), A('msg_a2', [{ type: 'tool_use', id: 'toolu_af1', name: 'Write', input: { file_path: BRIEF, content: '# Brief\n\nfirst draft\n' } }]), R('toolu_af1'), A('msg_a3', [{ type: 'text', text: 'Brief written.' }])],
  [A('msg_b1', [{ type: 'tool_use', id: 'toolu_af2', name: 'Edit', input: { file_path: BRIEF, old_string: 'first draft', new_string: 'second draft' } }]), R('toolu_af2'), A('msg_b2', [{ type: 'text', text: 'Brief edited.' }])],
  [A('msg_c1', [{ type: 'tool_use', id: 'toolu_af3', name: 'Write', input: { file_path: NOTES, content: '# Notes\n' } }]), R('toolu_af3'), A('msg_c2', [{ type: 'text', text: 'Notes written.' }])],
  [A('msg_d1', [{ type: 'tool_use', id: 'toolu_af4', name: 'Write', input: { file_path: SITE, content: '<!doctype html><title>Site</title><h1>Site</h1>' } }]), R('toolu_af4'), A('msg_d2', [{ type: 'text', text: 'Published and designed.' }])],
  [A('msg_e1', [{ type: 'text', text: 'Site served.' }])], // lane artifacts-services: turn 5 = the stub's REAL vibespace-job run (below)
];
const SERVE = path.join(CWD, 'serve.js'); // a static page on an EPHEMERAL port (bound, then known — never a fixed port)
fs.writeFileSync(SERVE, "require('http').createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end('<!doctype html><title>House 3D</title><h1>House 3D viewer</h1>'); }).listen(0, '127.0.0.1');\n");
const DISK = [[BRIEF, '# Brief\n\nfirst draft\n'], [BRIEF, '# Brief\n\nsecond draft\n'], [NOTES, '# Notes\n'], [SITE, '<!doctype html><title>Site</title><h1>Site</h1>']];
const stubPath = path.join(stubDir, 'claude');
fs.writeFileSync(stubPath, `#!${process.execPath}
const fs = require('fs');
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('2.1.274 (Claude Code) stub'); process.exit(0); }
if (args.includes('--help')) { console.log('Usage: claude [options]'); process.exit(0); }
const SID = ${JSON.stringify(LIVE_SID)};
const TURNS = ${JSON.stringify(TURNS)};
const DISK = ${JSON.stringify(DISK)};
const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
out({ type: 'system', subtype: 'init', session_id: SID, model: 'claude-fable-5', cwd: ${JSON.stringify(CWD)}, tools: [], permissionMode: 'default', claude_code_version: '2.1.274' });
let n = 0, buf = '';
process.stdin.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    let m = null; try { m = JSON.parse(line); } catch {}
    if (!m || m.type !== 'user') continue;
    const k = n++;
    const P = TURNS[k] || [];
    if (DISK[k]) fs.writeFileSync(DISK[k][0], DISK[k][1]); // the tool's own write, on disk before its record (the viewer reads it)
    if (k === 3) { // lane artifacts-registries: the agent's REAL CLIs over its session env (VIBESPACE_API + its token)
      const cp = require('child_process'), BIN = ${JSON.stringify(path.join(wt, 'data/bin'))};
      for (const a of [['vibespace-page', 'publish', ${JSON.stringify(SITE)}, '--title', 'Site'], ['vibespace-design', 'new', 'landing', '--title', 'Landing']]) {
        try { fs.appendFileSync(${JSON.stringify(path.join(stubDir, 'cli.log'))}, cp.execFileSync(process.execPath, [BIN + '/' + a[0], ...a.slice(1)], { cwd: ${JSON.stringify(CWD)}, encoding: 'utf8' })); }
        catch (e) { fs.appendFileSync(${JSON.stringify(path.join(stubDir, 'cli.log'))}, 'FAIL ' + a[0] + ': ' + (e.stderr || e.message) + '\\n'); }
      }
    }
    if (k === 4) { // lane artifacts-services: the agent RUNS its site as a Background Work job (the owner's house3d shape)
      const cp = require('child_process'), BIN = ${JSON.stringify(path.join(wt, 'data/bin'))};
      try { fs.appendFileSync(${JSON.stringify(path.join(stubDir, 'cli.log'))}, cp.execFileSync(process.execPath, [BIN + '/vibespace-job', 'run', ${JSON.stringify(process.execPath + ' ' + path.join(CWD, 'serve.js'))}, '--name', 'house-web', '--keep-up'], { cwd: ${JSON.stringify(CWD)}, encoding: 'utf8' })); }
      catch (e) { fs.appendFileSync(${JSON.stringify(path.join(stubDir, 'cli.log'))}, 'FAIL vibespace-job: ' + (e.stderr || e.message) + '\\n'); }
    }
    let j = 0;
    const next = () => {
      if (j < P.length) { out({ ...P[j], session_id: SID, uuid: 'af-' + k + '-' + j }); j++; setTimeout(next, 60); return; }
      out({ type: 'result', subtype: 'success', is_error: false, duration_ms: 500, num_turns: 1, result: 'done', session_id: SID, total_cost_usd: 0, usage: { input_tokens: 1, output_tokens: 1 } });
    };
    setTimeout(next, 150);
  }
});
process.stdin.on('end', () => process.exit(0));
`, { mode: 0o755 });

// lane artifacts-services-url: the frp relay is the ONE fake (a scratch server has none) — the forward, the publish route, the
// forwards broadcast, the registry and the card are real
const RELAY = path.join(stubDir, 'relay-stub.cjs');
fs.writeFileSync(RELAY, "const { PluginManager } = require(process.cwd() + '/src/plugins.js');\nPluginManager.prototype.frpPublish = async (name, lp, o) => ({ url: 'https://house-web.relay.example.test/', name: 'house-web', proto: (o && o.proto) || 'http', subdomain: 'house-web' });\nPluginManager.prototype.frpUnpublish = async () => ({ ok: true });\n");
const srv = spawn(process.execPath, ['-r', RELAY, 'server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, CLAUDE_CMD: stubPath, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' }, stdio: 'ignore' });
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu',
  '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-timer-throttling', `--user-data-dir=${wt}-chrome`, 'about:blank'], { stdio: 'ignore' });
let cleaned = false;
const cleanup = () => {
  if (cleaned) return; cleaned = true;
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv.kill('SIGKILL'); } catch {}
  for (const root of [wt, fakeHome, stubDir]) { try { endRootedProcesses(root); } catch {} } // every process this suite caused carries one of these roots (dtach, the wrapper, the stub, the worktree's daemon)
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  for (const d of [wt, `${wt}-chrome`, fakeHome, stubDir]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });
for (let i = 0; i < 60; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); break; } catch { await sleep(250); } }

const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 120 && !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((x) => x.type === 'page'); } catch {}
  if (!target) await sleep(250);
}
if (!target) { console.error('✗ chrome never exposed a CDP page target'); process.exit(1); }
const sock = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => sock.on('open', r));
let seq = 0; const pend = new Map(); const pageErrors = [];
sock.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') { try { pageErrors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'unknown'); } catch {} }
});
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => m.error ? rej(new Error(m.error.message)) : res(m.result)); sock.send(JSON.stringify({ id, method, params })); });
const evalJs = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await evalJs(expr)) return true; await sleep(150); } return evalJs(expr); };
const waitApp = () => evalJs('new Promise((res, rej) => { const t0 = Date.now(); (function w() { if (window.app) return res(app.ready); if (Date.now() - t0 > 20000) return rej(new Error("no app after 20s")); setTimeout(w, 200); })(); })');
const VIEW = `([...(window.app.sessions?.values?.() || [])].find((v) => v && v._messageList && v.sessionId === window.__sid) || [...(window.app.sessions?.values?.() || [])].filter((v) => v && v._messageList).pop())`;
const CARDS = `[...(${VIEW})._messageList.querySelectorAll('.chat-artifact-card')]`;
const wins = (p) => `[...app.wm.windows.values()].filter((w) => w._filePath === ${JSON.stringify(p)} || String(w.title || '').includes(${JSON.stringify(path.basename(p))})).length`;
const state = () => evalJs(`(() => { const c = ${CARDS}; return { cards: c.map((e) => ({ key: e.dataset.key, name: e.querySelector('.chat-artifact-name')?.textContent, meta: e.querySelector('.chat-artifact-meta')?.textContent, mark: e.__afMark || null })), chip: document.querySelector('.chat-status-artifacts')?.textContent?.trim() || null, brief: ${wins(BRIEF)}, notes: ${wins(NOTES)} }; })()`);
let liveWs = null, sid = null;
const turn = async (text, doneRe) => {
  liveWs.send(JSON.stringify({ type: 'chat-input', sessionId: sid, text }));
  return waitFor(`(() => { const v = ${VIEW}; return !!v && [...v._messageList.querySelectorAll('.chat-msg')].some((e) => ${doneRe}.test(e.textContent)); })()`, 20000);
};
try {
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1400, height: 860, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await waitApp();
  await sleep(800);
  liveWs = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  await new Promise((r) => liveWs.on('open', r));
  const frames = [];
  liveWs.on('message', (d) => { try { frames.push(JSON.parse(String(d))); } catch {} });
  // lane artifacts-e2e: the chat is created THE WAY A USER DOES (the page's own createSession) — its creator never
  // attaches (2.368.4), so the server's _historyLoaded stays false; a live card must not wait for an attach (the
  // real-Opus e2e found the first deliverable's card, the chip and the auto-open all missing on this path)
  await evalJs(`app.createSession({ cwd: ${JSON.stringify(CWD)}, name: 'artifacts', mode: 'chat', backend: 'claude' }); true`);
  for (let i = 0; i < 80 && !sid; i++) { sid = await evalJs(`([...app.sessions.values()].find((v) => v && v._messageList)?.sessionId) || null`); if (!sid) await sleep(250); }
  check('a live claude chat session is created through the page\'s own createSession (the creator path, never attached; stub CLI behind the real wrapper)', !!sid);
  await evalJs(`window.__sid = ${JSON.stringify(sid)}; true`);
  check('the live chat window attaches', await waitFor(`!!document.querySelector('.chat-view .chat-input')`, 20000));
  await sleep(600);

  console.log('① the Write ⇒ one card, the chip, the document opens beside the chat (setting on)');
  check('turn 1 played', await turn('Write me a brief', /Brief written/));
  await waitFor(`(${CARDS}).length >= 1 && !!document.querySelector('.chat-status-artifacts') && ${wins(BRIEF)} >= 1`, 8000);
  const s1 = await state();
  check('ONE card for docs/BRIEF.md', s1.cards.length === 1 && s1.cards[0].name === 'BRIEF.md' && s1.cards[0].key === ':' + BRIEF, s1);
  check('the chip reads "Artifacts · 1"', s1.chip === 'Artifacts · 1', s1.chip);
  { const p = await evalJs(`(() => { const e = (${CARDS})[0]?.querySelector('.chat-artifact-path'); return e ? { text: e.textContent, lrm: e.textContent.charCodeAt(0) === 0x200e } : null; })()`);
    check('the card\'s path keeps its leading "/" at the START under the rtl front-truncate (an LRM opens the text — lane artifacts-e2e)', !!p && p.lrm && p.text.slice(1) === BRIEF, p); }
  check('the new document opened beside the chat by itself (artifacts.autoOpenDocs default on)', s1.brief === 1, s1);
  await evalJs(`(${CARDS})[0].__afMark = 'born'; true`);

  console.log('② the Edit ⇒ the SAME card patched in place, no second window');
  check('turn 2 played', await turn('Tighten it', /Brief edited/));
  await waitFor(`/Changed 1 times/.test((${CARDS})[0]?.querySelector('.chat-artifact-meta')?.textContent || '')`, 8000);
  const s2 = await state();
  check('still ONE card node and it is the SAME element (the mark set at birth survives — patched, never re-created)', s2.cards.length === 1 && s2.cards[0].mark === 'born', s2.cards);
  check('its words say the change ("Changed 1 times")', /Changed 1 times/.test(s2.cards[0]?.meta || ''), s2.cards[0]?.meta);
  check('an edit never re-opens (still one window for BRIEF.md)', s2.brief === 1, s2);

  console.log('③ the setting OFF ⇒ a new document is a card only; one click opens it');
  await evalJs(`(app.settings.set('artifacts.autoOpenDocs', false), true)`);
  check('turn 3 played', await turn('Write notes', /Notes written/));
  await waitFor(`(${CARDS}).length >= 2 && /Artifacts · 2/.test(document.querySelector('.chat-status-artifacts')?.textContent || '')`, 8000);
  await sleep(800);
  const s3 = await state();
  check('a second card, the chip reads "Artifacts · 2", and nothing opened for NOTES.md', s3.cards.length === 2 && s3.chip === 'Artifacts · 2' && s3.notes === 0, s3);
  await evalJs(`(${CARDS}).find((e) => e.dataset.key === ${JSON.stringify(':' + NOTES)}).click(); true`);
  check('one click on the card opens NOTES.md beside the chat', await waitFor(`${wins(NOTES)} >= 1`, 8000), await state());

  console.log('④ a reload shows the same cards');
  await cdp('Page.reload', {});
  await waitApp();
  await sleep(1000);
  await evalJs(`window.__sid = ${JSON.stringify(sid)}; if (!${VIEW}) app.attachSession(${JSON.stringify(sid)}, 'artifacts', ${JSON.stringify(CWD)}, { mode: 'chat', backend: 'claude' }); true`);
  await waitFor(`!!(${VIEW}) && (${CARDS}).length >= 2`, 20000);
  const s4 = await state();
  check('after a reload the chip reads "Artifacts · 2" (the server\'s registry, read when the view is built — not only on a live birth)', await waitFor(`/Artifacts · 2/.test(document.querySelector('.chat-status-artifacts')?.textContent || '')`, 8000), await state());
  check('after a reload: the same two cards, BRIEF.md still says its change', s4.cards.length === 2 && s4.cards.map((c) => c.key).sort().join() === [':' + BRIEF, ':' + NOTES].sort().join() && /Changed 1 times/.test(s4.cards.find((c) => c.name === 'BRIEF.md')?.meta || ''), s4);
  // lane artifacts-e2e: a zh UI names the kind in zh (the house language — the real-Opus zh run read "Document")
  await evalJs(`localStorage.setItem('vibespace.lang', 'zh'); true`);
  await cdp('Page.reload', {});
  await waitApp();
  await sleep(1000);
  await evalJs(`window.__sid = ${JSON.stringify(sid)}; if (!${VIEW}) app.attachSession(${JSON.stringify(sid)}, 'artifacts', ${JSON.stringify(CWD)}, { mode: 'chat', backend: 'claude' }); true`);
  await waitFor(`!!(${VIEW}) && (${CARDS}).length >= 2`, 20000);
  const kinds = await evalJs(`(${CARDS}).map((e) => e.querySelector('.chat-artifact-kind')?.textContent)`);
  check('a zh UI: each document card names its kind 文档 (never the English word)', kinds.length === 2 && kinds.every((k) => k === '文档'), kinds);
  await evalJs(`localStorage.removeItem('vibespace.lang'); true`);
  console.log('⑤ lane artifacts-registries — a published page, a design, an attached file ⇒ their cards; a reload replays all three');
  await cdp('Page.reload', {});
  await waitApp();
  await sleep(1000);
  await evalJs(`window.__sid = ${JSON.stringify(sid)}; if (!${VIEW}) app.attachSession(${JSON.stringify(sid)}, 'artifacts', ${JSON.stringify(CWD)}, { mode: 'chat', backend: 'claude' }); true`);
  await waitFor(`!!(${VIEW}) && (${CARDS}).length >= 2`, 20000);
  check('turn 4 played (Write site.html, then the real vibespace-page publish + vibespace-design new)', await turn('Publish a site and start a design', /Published and designed/));
  await waitFor(`(${CARDS}).length >= 4`, 10000);
  await evalJs(`(${VIEW})._chatInput.uploadFiles([new File(['attached\\n'], 'attach.pdf', { type: 'application/pdf' })]); true`);
  await waitFor(`(${CARDS}).length >= 5 && /Artifacts · 5/.test(document.querySelector('.chat-status-artifacts')?.textContent || '')`, 10000);
  const five = () => evalJs(`(${CARDS}).map((e) => ({ key: e.dataset.key, kind: e.dataset.kind, name: e.querySelector('.chat-artifact-name')?.textContent, meta: e.querySelector('.chat-artifact-meta')?.textContent }))`);
  const c5 = await five();
  let cli = ''; try { cli = fs.readFileSync(path.join(stubDir, 'cli.log'), 'utf8'); } catch {}
  const pc = c5.filter((c) => c.key === ':' + SITE);
  check('ONE page card on site.html — its Write and its publish are one row — saying "Published"', pc.length === 1 && pc[0].kind === 'page' && /^Published/.test(pc[0].meta || ''), { c5, cli });
  check('a design card on the design folder, named by its title', c5.some((c) => c.key === ':' + LANDING && c.kind === 'design' && c.name === 'Landing'), { c5, cli });
  check('an upload card on the attached file, "Attached by you"', c5.some((c) => c.key === ':' + ATT && c.kind === 'upload' && /^Attached by you/.test(c.meta || '')), c5);
  check('the chip reads "Artifacts · 5"', /Artifacts · 5/.test(await evalJs(`document.querySelector('.chat-status-artifacts')?.textContent || ''`)));
  await evalJs(`window.__af = []; app.openBrowser = (u) => window.__af.push(['browser', u]); app.openDesign = (o) => window.__af.push(['design', o.dir, o.sessionId]); true`); // the doors, spied (the Design window / browser windows have their own suites)
  for (const k of [SITE, LANDING, ATT]) await evalJs(`(${CARDS}).find((e) => e.dataset.key === ${JSON.stringify(':' + k)})?.click(); true`);
  const doors = await evalJs('window.__af');
  check('each card opens its own door: the page its /p/ link, the design the Design window (this chat), the upload the file', doors.length === 2 && doors[0][0] === 'browser' && /\/p\/pg/.test(doors[0][1]) && doors[1][0] === 'design' && doors[1][1] === LANDING && doors[1][2] === sid && await waitFor(`${wins(ATT)} >= 1`, 8000), doors);
  await cdp('Page.reload', {});
  await waitApp();
  await sleep(1000);
  await evalJs(`window.__sid = ${JSON.stringify(sid)}; if (!${VIEW}) app.attachSession(${JSON.stringify(sid)}, 'artifacts', ${JSON.stringify(CWD)}, { mode: 'chat', backend: 'claude' }); true`);
  await waitFor(`!!(${VIEW}) && (${CARDS}).length >= 5`, 20000);
  const r5 = await five();
  check('after a reload all three replay (page · design · upload beside the two documents)', r5.length === 5 && ['page', 'design', 'upload'].every((k) => r5.some((c) => c.kind === k)), r5);

  console.log('⑥ lane artifacts-services — a job the conversation runs that listens ⇒ a service card + the Services head; zh 390 px opens it in the Web view');
  check('turn 5 played (the REAL vibespace-job run of a page server)', await turn('Serve the site', /Site served/));
  const SVC = `(${CARDS}).filter((e) => e.dataset.kind === 'service')`;
  const born6 = await waitFor(`${SVC}.length === 1`, 45000); // the engine's 5 s tick + its ≤ 30 s listen read
  const CARD6 = `(() => { const e = ${SVC}[0]; if (!e) return null; const box = e.querySelector('.chat-artifact-path'), h = e.querySelector('.chat-artifact-href'), tn = h && h.firstChild; let firstLeft = null; if (tn && tn.length > 2) { const r = document.createRange(); r.setStart(tn, 0); r.setEnd(tn, 1); const a = r.getBoundingClientRect().left; r.setStart(tn, tn.length - 1); r.setEnd(tn, tn.length); firstLeft = a < r.getBoundingClientRect().left; } return { name: e.querySelector('.chat-artifact-name')?.textContent, kind: e.querySelector('.chat-artifact-kind')?.textContent, href: h?.textContent, via: e.querySelector('.chat-artifact-via')?.textContent, dir: box && getComputedStyle(box).direction, firstLeft, meta: e.querySelector('.chat-artifact-meta')?.textContent, state: e.dataset.state, w: Math.round(e.getBoundingClientRect().width), vw: innerWidth, n: ${SVC}.length }; })()`;
  const c6 = await evalJs(CARD6);
  const href = String((c6 && c6.href) || '');
  const PROXIED = new RegExp(`^http://127\\.0\\.0\\.1:${PORT}/proxy/http://127\\.0\\.0\\.1:(\\d+)/$`);
  check('ONE service card names the job and links it THROUGH this instance\'s /proxy/ (never a raw host:port), printed LTR — its "h" painted left of its trailing "/"', born6 && c6.name === 'house-web' && PROXIED.test(href) && c6.via === 'Through this VibeSpace' && c6.dir === 'ltr' && c6.firstLeft === true && c6.state === 'running' && /Running/.test(c6.meta), { c6, cli: (() => { try { return fs.readFileSync(path.join(stubDir, 'cli.log'), 'utf8').slice(-600); } catch { return ''; } })() });
  const svcPort = Number((PROXIED.exec(href) || [])[1]) || 0;
  const served = await fetch(href).then((r) => r.text()).catch((e) => 'ERR ' + e.message);
  check('the link answers with the served page (through the instance\'s proxy)', /House 3D viewer/.test(served), served.slice(0, 200));
  await waitFor(`/Artifacts · 6/.test(document.querySelector('.chat-status-artifacts')?.textContent || '')`, 5000); // the chip re-reads on the card's live birth (debounced)
  await evalJs(`document.querySelector('.chat-status-artifacts')?.click(); true`);
  await waitFor(`!!document.querySelector('.chat-artifact-head')`, 5000);
  const list6 = await evalJs(`[...document.querySelectorAll('.chat-artifact-head, .chat-artifact-row')].filter((e) => !e.closest('.chat-artifact-code')).map((e) => e.classList.contains('chat-artifact-head') ? 'HEAD:' + e.textContent : e.dataset.kind)`);
  const hi = list6.indexOf('HEAD:Services');
  check('the chip lists Services under their own head, after the documents and before the page / design / upload', hi > 0 && list6[hi + 1] === 'service' && list6.slice(0, hi).every((k) => k === 'doc') && list6.slice(hi + 2).every((k) => k !== 'doc'), { list6, api: await fetch(`http://127.0.0.1:${PORT}/api/artifacts?sessionId=${encodeURIComponent(sid)}`).then((r) => r.json()).then((v) => v.items.map((b) => b.kind)).catch((e) => e.message) });
  await evalJs(`document.body.click(); localStorage.setItem('vibespace.lang', 'zh'); true`);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp('Page.reload', {});
  await waitApp(); await sleep(1000);
  await evalJs(`window.__sid = ${JSON.stringify(sid)}; if (!${VIEW}) app.attachSession(${JSON.stringify(sid)}, 'artifacts', ${JSON.stringify(CWD)}, { mode: 'chat', backend: 'claude' }); true`);
  await waitFor(`!!(${VIEW}) && ${SVC}.length === 1`, 20000);
  const z6 = await evalJs(CARD6);
  check('zh at 390 px: the service card says 服务 · 运行中 · 经本实例代理, its url LTR, inside the viewport', z6 && z6.kind === '服务' && /运行中/.test(z6.meta) && z6.via === '经本实例代理' && z6.dir === 'ltr' && z6.firstLeft === true && z6.w > 0 && z6.w <= z6.vw, z6);
  await evalJs(`${SVC}[0].scrollIntoView(); ${SVC}[0].click(); true`);
  const webOk = await waitFor(`[...app.wm.windows.values()].some((w) => w.type === 'browser' && w.content?.querySelector('iframe')?.src === ${JSON.stringify(href)})`, 10000);
  const pmode = await evalJs(`[...app.wm.windows.values()].filter((w) => w.type === 'browser').map((w) => ({ input: w.content?.querySelector('input.file-path-input')?.value, proxy: w._openSpec && w._openSpec.proxy }))`);
  check('one click opens the link in the Web view (a browser window, never a new tab) in PROXY mode on the service\'s target', webOk && pmode.some((w) => w.proxy === true && w.input === `http://127.0.0.1:${svcPort}/`), pmode);
  let frameText = '';
  for (let i = 0; i < 40 && !/House 3D viewer/.test(frameText); i++) {
    try {
      const tree = await cdp('Page.getFrameTree');
      const all = []; const walk = (n) => { all.push(n.frame); (n.childFrames || []).forEach(walk); }; walk(tree.frameTree);
      const fr = all.find((f) => f.url === href);
      if (fr) { const w = await cdp('Page.createIsolatedWorld', { frameId: fr.id }); const r = await cdp('Runtime.evaluate', { expression: 'document.body ? document.body.textContent : ""', contextId: w.executionContextId, returnByValue: true }); frameText = String(r.result.value || ''); }
    } catch { }
    if (!/House 3D viewer/.test(frameText)) await sleep(250);
  }
  check('the Web view shows the served page', /House 3D viewer/.test(frameText), frameText.slice(0, 200));
  // lane artifacts-services-url: a (scratch) publish of the port ⇒ the SAME card is patched to the public URL + 已发布; unpublish ⇒ back
  const J6 = { method: 'POST', headers: { 'Content-Type': 'application/json' } };
  const fw6 = await fetch(`http://127.0.0.1:${PORT}/api/hosts/__local__/port-forward`, { ...J6, body: JSON.stringify({ port: svcPort, label: 'service: house-web' }) }).then((r) => r.json()).catch((e) => ({ error: e.message }));
  const pub6 = fw6 && fw6.id ? await fetch(`http://127.0.0.1:${PORT}/api/port-forward/${encodeURIComponent(fw6.id)}/publish`, { ...J6, body: '{}' }).then((r) => r.json()).catch((e) => ({ error: e.message })) : null;
  const pubOk = await waitFor(`(() => { const c = ${CARD6}; return !!c && c.n === 1 && c.href === 'https://house-web.relay.example.test/' && c.via === '已发布'; })()`, 10000);
  check('after a scratch publish the SAME card links the published address + 已发布 (patched in place by the forwards broadcast)', pubOk, { fw6, pub6, card: await evalJs(CARD6) });
  if (fw6 && fw6.id) await fetch(`http://127.0.0.1:${PORT}/api/port-forward/${encodeURIComponent(fw6.id)}/publish`, { method: 'DELETE' }).catch(() => null);
  const backOk = await waitFor(`(() => { const c = ${CARD6}; return !!c && c.n === 1 && c.href === ${JSON.stringify(href)} && c.via === '经本实例代理'; })()`, 10000);
  check('unpublish ⇒ the card is back on the proxy url + 经本实例代理', backOk, await evalJs(CARD6));
  await evalJs(`localStorage.removeItem('vibespace.lang'); true`);
  check('no page error', pageErrors.length === 0, pageErrors.slice(0, 3));
} catch (e) {
  failed++; console.error('✗ threw:', e && e.stack || e);
}
console.log(`\n${passed} passed, ${failed} failed`);
cleanup();
process.exit(failed ? 1 : 0);
