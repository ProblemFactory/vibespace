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
//   ⑧ int232: an open Artifacts window survives a reload at its position — the REAL layout restore (real CDP clicks + a
//     title-bar drag ⇒ the ordinary autosave; the boot restore replays its openSpec by itself; no hand replay).
//   lane artifacts-auto-open-quiet: ① is typed INTO the composer — the doc opens beside the chat while the caret stays in
//     the composer and the next keys land there (the chat stays the active window; one toast "… · Turn off", once per
//     device; PNG $VS_AUTO_OPEN_PNG); ③ turns the setting off with the Artifacts chip's checkbox row; ⑨ the phone
//     (390 px): turn 6 Writes docs/PHONE.md ⇒ its card, nothing opens, the screen stays.
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
const BRIEF = path.join(CWD, 'docs/BRIEF.md'), NOTES = path.join(CWD, 'docs/NOTES.md'), PHONE = path.join(CWD, 'docs/PHONE.md');
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
  [A('msg_f1', [{ type: 'tool_use', id: 'toolu_af6', name: 'Write', input: { file_path: PHONE, content: '# Phone\n' } }]), R('toolu_af6'), A('msg_f2', [{ type: 'text', text: 'Phone notes written.' }])], // lane artifacts-auto-open-quiet ⑨
];
const SERVE = path.join(CWD, 'serve.js'); // a static page on an EPHEMERAL port (bound, then known — never a fixed port)
fs.writeFileSync(SERVE, "require('http').createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end('<!doctype html><title>House 3D</title><h1>House 3D viewer</h1>'); }).listen(0, '127.0.0.1');\n");
const DISK = [[BRIEF, '# Brief\n\nfirst draft\n'], [BRIEF, '# Brief\n\nsecond draft\n'], [NOTES, '# Notes\n'], [SITE, '<!doctype html><title>Site</title><h1>Site</h1>'], null, [PHONE, '# Phone\n']];
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

  console.log('① the Write ⇒ one card, the chip, the document opens beside the chat (setting on) — QUIETLY, while the owner types');
  // lane artifacts-auto-open-quiet: the owner is typing in the composer when the doc lands (focus emulation: a headless page is never "focused")
  await cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
  const TA = `document.querySelector('.chat-view textarea.chat-input')`;
  await evalJs(`${TA}.focus(); true`);
  await cdp('Input.insertText', { text: 'hello ' });
  const chatWin = await evalJs(`(${VIEW}).winInfo.id`);
  check('turn 1 played', await turn('Write me a brief', /Brief written/));
  await waitFor(`(${CARDS}).length >= 1 && !!document.querySelector('.chat-status-artifacts') && ${wins(BRIEF)} >= 1`, 8000);
  await waitFor(`[...app.wm.windows.values()].some((w) => w.type === 'doc' && !!w.content.querySelector('.ProseMirror, .doc-window *'))`, 8000); await sleep(600); // the lazy editor mounted
  const q1 = await evalJs(`(() => { const d = [...app.wm.windows.values()].find((w) => w.type === 'doc'); const ch = d && d._tabChain; return { activeIsComposer: document.activeElement === ${TA}, activeTag: document.activeElement && (document.activeElement.className || document.activeElement.tagName), wmActive: app.wm.activeWindowId, split: !!ch && ch.layout === 'split' && ch.tabs.includes(${JSON.stringify(chatWin)}), docShown: !!d && !d.content.classList.contains('tab-hidden') && d.content.getBoundingClientRect().width > 100, chatShown: !(${VIEW}).winInfo.content.classList.contains('tab-hidden'), toasts: [...document.querySelectorAll('#global-toasts .global-toast')].map((t) => t.textContent), taught: localStorage.getItem('vs-auto-open-taught') }; })()`);
  check('the doc opened BESIDE the chat (a split of the two, both shown)', q1.split && q1.docShown && q1.chatShown, q1);
  check('…and took NOTHING: document.activeElement is still the composer, the chat is still the active window', q1.activeIsComposer && q1.wmActive === chatWin, q1);
  await cdp('Input.insertText', { text: 'world' });
  const typed = await evalJs(`${TA}.value`);
  check('the next keys continue INTO the composer ("hello " + "world")', typed === 'hello world', typed);
  check('ONE toast says it and offers "Turn off"; this device is marked taught (vs-auto-open-taught)', q1.toasts.length === 1 && /A document the agent wrote opened beside the chat/.test(q1.toasts[0]) && /Turn off/.test(q1.toasts[0]) && q1.taught === '1', q1.toasts);
  if (process.env.VS_AUTO_OPEN_PNG) { const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(process.env.VS_AUTO_OPEN_PNG, Buffer.from(r.data, 'base64')); }
  await evalJs(`(() => { const ta = ${TA}; ta.value = ''; ta.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
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
  // lane artifacts-auto-open-quiet: the switch where it happens — the Artifacts chip's popover row, the SAME setting
  await evalJs(`document.querySelector('.chat-status-artifacts').click(); true`);
  await waitFor(`!!document.querySelector('.chat-artifacts-panel .af-auto-cb')`, 5000);
  const cb0 = await evalJs(`(() => { const c = document.querySelector('.chat-artifacts-panel .af-auto-cb'); return { checked: c.checked, words: c.parentElement.textContent }; })()`);
  check('the chip\'s popover has the row "Open new documents automatically", checked while the setting is on', cb0.checked === true && cb0.words === 'Open new documents automatically', cb0);
  await evalJs(`document.querySelector('.chat-artifacts-panel .af-auto-cb').click(); true`);
  check('unticking it turns artifacts.autoOpenDocs off (the synced setting)', await waitFor(`app.settings.get('artifacts.autoOpenDocs') === false`, 3000));
  await evalJs(`document.body.click(); document.querySelector('.chat-artifacts-panel')?.remove(); true`);
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
  const hi = list6.findIndex((k) => /^HEAD:Service · 1$/.test(k)); // lane artifacts-list-scale: every kind has its head ("Document · 4" … "Service · 1")
  check('the chip lists Services under their own head, after the documents and before the page / design / upload', hi > 0 && list6[hi + 1] === 'service' && list6.slice(0, hi).every((k) => k === 'doc' || /^HEAD:Document · \d+$/.test(k)) && list6.slice(hi + 2).every((k) => k !== 'doc'), { list6, api: await fetch(`http://127.0.0.1:${PORT}/api/artifacts?sessionId=${encodeURIComponent(sid)}`).then((r) => r.json()).then((v) => v.items.map((b) => b.kind)).catch((e) => e.message) });

  // ── lane artifacts-list-scale: THE LIST AT SCALE over the owner's 217 rows (43 + 174) — bounded at 1280, a filter, a
  //    group switch, 代码 opened, the ⤢ window + a column sort, the window replayed after a reload (ja); the review
  //    walk's shots when VS_AF_SHOTS names a directory ──
  const AF_SHOTS = process.env.VS_AF_SHOTS || '';
  const afShot = async (name) => { if (!AF_SHOTS) return; const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(AF_SHOTS, name + '.png'), Buffer.from(r.data, 'base64')); };
  const AF_FIX = (() => {
    const T = Date.now(), rows = []; let k = 0; const hs = ['pt2:fix', 'pt2:build-core', 'seg:access', 'pt2:judge', 'top:build'];
    const add = (kind, name, dir, i, extra = {}) => rows.push({ key: `af:${k++}`, kind, name, path: `${CWD}/${dir}/${name}`, lastAt: T - i * 37 * 60e3, writes: 1, edits: (i * 7) % 15, by: 'agent', ...(i % 5 === 4 ? {} : { via: { kind: 'subagent', name: hs[i % hs.length] } }), ...extra });
    const docs = ['sec10_tail.md', 'DESIGN2.md', 'design2_B.md', 'status_r2.md', 'todo_wave12.md', 'todo_wave9.md'];
    for (let i = 0; i < 20; i++) add('doc', docs[i] || `wave${i}_notes.md`, 'out', i + 3);
    rows.push({ key: 'af:svc', kind: 'service', name: 'house3d-web2-2', path: '', url: '/proxy/web2/', via: 'proxy', state: 'running', since: T - 30 * 3600e3, lastAt: T - 30 * 3600e3, writes: 0, edits: 0 });
    add('page', 'index.html', 'web', 9);
    for (let i = 0; i < 21; i++) add('other', i === 0 ? 'run.ps1' : i === 1 ? 'mart_remote.ps1' : `asset_${i}.bin`, 'files', i + 30);
    for (let i = 0; i < 174; i++) add('code', i === 0 ? 'render_wave12.py' : i === 1 ? 'lighting.py' : `mod_${i}.py`, `src/pkg${i % 9}`, i < 2 ? i : i + 60);
    const items = rows.filter((r) => r.kind !== 'code'), code = rows.filter((r) => r.kind === 'code');
    return { ok: true, items, code, count: items.length, codeCount: code.length, total: rows.length, full: false };
  })();
  const afStubFetch = `window.__afFetch = window.__afFetch || window.fetch; window.fetch = (u, o) => (String(u).startsWith('/api/artifacts') ? Promise.resolve(new Response(${JSON.stringify(JSON.stringify(AF_FIX))}, { headers: { 'content-type': 'application/json' } })) : window.__afFetch(u, o)); true`;
  const AF_PANEL = `document.querySelector('.chat-artifacts-panel')`;
  const afOpen = async () => {
    await evalJs(afStubFetch); // the chat's own refresh (an attach, a card) answers the fixture too — the open list follows it live
    await evalJs(`${AF_PANEL}?.remove(); (${VIEW})._statusBar.setArtifacts(${JSON.stringify(AF_FIX)}); true`); await sleep(150);
    await evalJs(`document.querySelector('.chat-status-artifacts')?.click(); true`); return waitFor(`!!${AF_PANEL}`, 5000);
  };
  const afRect = () => evalJs(`(() => { const p = ${AF_PANEL}; if (!p) return null; const r = p.getBoundingClientRect(), l = p.querySelector('.af-list'); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), width: Math.round(r.width), h: innerHeight, w: innerWidth, scrolls: l.scrollHeight > l.clientHeight + 4, rows: p.querySelectorAll('.chat-artifact-row').length, count: p.querySelector('.af-count').textContent }; })()`);
  const afType = (q) => evalJs(`(() => { const i = ${AF_PANEL}.querySelector('.af-filter'); i.focus(); i.value = ${JSON.stringify(q)}; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  const afMenu = async (btn, word) => { await evalJs(`${AF_PANEL}.querySelector('${btn}').click(); true`); await sleep(100); return evalJs(`(() => { const it = [...document.querySelectorAll('.context-menu-item')].find((e) => e.textContent.trim() === ${JSON.stringify(word)}); if (it) it.click(); return !!it; })()`); };
  await evalJs(`document.documentElement.setAttribute('data-theme', 'light'); true`);
  await afOpen();
  const a1 = await afRect();
  check('AT SCALE (217 rows, 1280): the popover is BOUNDED — its top and bottom inside the viewport — and its list scrolls', a1 && a1.top >= 0 && a1.bottom <= a1.h && a1.scrolls && a1.rows > 5 && /43 artifacts · 174 code files/.test(a1.count), a1);
  await afShot('A-1280-light-en');
  await evalJs(`document.documentElement.setAttribute('data-theme', 'dark'); true`); await sleep(150); await afShot('A-1280-dark-en');
  await afType('sec10');
  const a2 = await afRect();
  check('a filter typed ("sec10"): one row, the band hidden, the count says the matches', a2 && a2.rows === 1 && /^1 match/.test(a2.count) && !(await evalJs(`!!${AF_PANEL}.querySelector('.af-head-recent')`)), a2);
  await afShot('A-1280-dark-en-filter');
  await afType('');
  const g1 = await afMenu('.af-group', 'By helper');
  const heads1 = await evalJs(`[...${AF_PANEL}.querySelectorAll('.chat-artifact-head')].map((h) => h.dataset.group)`);
  check('group switched to "By helper" through the ▾ menu: every head below the band is a helper', g1 && heads1.length > 2 && heads1.slice(1).every((k) => k.startsWith('h:')), heads1);
  await afShot('A-1280-dark-en-by-helper');
  await afMenu('.af-group', 'By kind');
  await evalJs(`${AF_PANEL}.querySelector('.chat-artifact-head[data-group="k:code"]').click(); true`);
  const codeRows = await evalJs(`${AF_PANEL}.querySelectorAll('.chat-artifact-row[data-kind="code"]').length`);
  check('代码 opened by its head: its 174 rows (+ the band\'s) are in the list', codeRows >= 174, codeRows);
  await evalJs(`${AF_PANEL}.querySelector('.chat-artifact-head[data-group="k:code"]').click(); document.documentElement.setAttribute('data-theme', 'light'); true`);
  await evalJs(afStubFetch);
  await evalJs(`${AF_PANEL}.querySelector('.af-expand').click(); true`);
  await waitFor(`document.querySelectorAll('.af-window .af-trow').length === 217`, 8000);
  await evalJs(`[...document.querySelectorAll('.af-window .af-th')].find((h) => h.dataset.col === 'name').click(); true`);
  const w1 = await evalJs(`(() => { const rows = [...document.querySelectorAll('.af-window .af-trow')].map((r) => r.querySelector('.chat-artifact-name').textContent); const rail = [...document.querySelectorAll('.af-window .af-rail-item')].map((r) => r.dataset.rail + ' ' + r.querySelector('.af-rail-n').textContent); return { n: rows.length, first: rows.slice(0, 3), sorted: rows.every((x, i) => i === 0 || rows[i - 1].localeCompare(x, undefined, { numeric: true, sensitivity: 'base' }) <= 0), rail, panelGone: !${AF_PANEL} }; })()`);
  check('the ⤢ opens the Artifacts WINDOW: the rail (kinds + helpers with counts) and 217 rows; a click on "Name" sorts the table', w1 && w1.n === 217 && w1.sorted && w1.rail.includes('all 217') && w1.rail.includes('k:code 174') && w1.panelGone, w1);
  await afShot('B-1280-light-en');
  await evalJs('app.layoutManager._doAutoSave(); true'); await sleep(800);
  const afSaved = await evalJs(`(() => { try { return JSON.stringify(app.layoutManager.captureState()).includes('openArtifacts'); } catch (e) { return 'ERR ' + e.message; } })()`);
  const afSpec = await evalJs(`([...app.wm.windows.values()].find((w) => w.type === 'artifacts') || {})._openSpec || null`); // the layout record names the window before the reload (the house forced-save precedent)
  await evalJs(`localStorage.setItem('vibespace.lang', 'ja'); true`);
  await cdp('Page.reload', {}); await waitApp(); await sleep(1500);
  // this harness restores no window on a reload (the suite re-attaches its chat by hand), so the layout's captured openSpec is replayed through its action's door
  await evalJs(`app.openArtifacts(${JSON.stringify(afSpec)}); true`);
  const replayed = await waitFor(`document.querySelectorAll('.af-window .af-trow').length > 0`, 15000);
  check('the window REPLAYS after a reload: the layout captured its openSpec {action: openArtifacts, sessionId, name} and the spec alone re-opens it with the conversation\'s rows', afSaved === true && afSpec && afSpec.action === 'openArtifacts' && afSpec.sessionId && replayed, { afSaved, afSpec, rows: await evalJs(`document.querySelectorAll('.af-window .af-trow').length`) });
  await evalJs(`window.__sid = ${JSON.stringify(sid)}; if (!${VIEW}) app.attachSession(${JSON.stringify(sid)}, 'artifacts', ${JSON.stringify(CWD)}, { mode: 'chat', backend: 'claude' }); document.documentElement.setAttribute('data-theme', 'dark'); true`);
  await waitFor(`!!(${VIEW})`, 20000); await sleep(800);
  await evalJs(`for (const w of [...app.wm.windows.values()]) if (w.type === 'artifacts') app.wm.closeWindow(w.id); true`);
  await sleep(300); await afOpen();
  const a3 = await afRect();
  check('ja: the popover\'s words are Japanese (the count line)', a3 && /成果物 43 件/.test(a3.count), a3);
  await afShot('A-1280-dark-ja');
  await evalJs(afStubFetch); await evalJs(`${AF_PANEL}.querySelector('.af-expand').click(); true`);
  await waitFor(`document.querySelectorAll('.af-window .af-trow').length === 217`, 8000); await afShot('B-1280-dark-ja');
  await evalJs(`for (const w of [...app.wm.windows.values()]) if (w.type === 'artifacts') app.wm.closeWindow(w.id); document.documentElement.setAttribute('data-theme', 'light'); true`);
  await evalJs(`document.body.click(); localStorage.setItem('vibespace.lang', 'zh'); true`);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp('Page.reload', {});
  await waitApp(); await sleep(1000);
  await evalJs(`window.__sid = ${JSON.stringify(sid)}; if (!${VIEW}) app.attachSession(${JSON.stringify(sid)}, 'artifacts', ${JSON.stringify(CWD)}, { mode: 'chat', backend: 'claude' }); true`);
  await waitFor(`!!(${VIEW}) && ${SVC}.length === 1`, 20000);

  // lane artifacts-list-scale: the phone (390, zh) — the popover is a bottom sheet over the 217 rows; the window's rail folds into chips
  await evalJs(`document.documentElement.setAttribute('data-theme', 'light'); true`);
  await afOpen();
  const p1 = await afRect();
  check('phone 390 (zh): the Artifacts popover is a bottom SHEET — full width, at the bottom, ≤ 82 vh — and scrolls; the words are Chinese', p1 && p1.left === 0 && p1.width === p1.w && Math.abs(p1.bottom - p1.h) <= 2 && p1.bottom - p1.top <= Math.ceil(p1.h * 0.82) + 2 && p1.scrolls && /43 项产出/.test(p1.count), p1);
  await afShot('A-390-light-zh');
  await evalJs(`document.documentElement.setAttribute('data-theme', 'dark'); true`); await sleep(150); await afShot('A-390-dark-zh');
  await evalJs(afStubFetch); await evalJs(`${AF_PANEL}.querySelector('.af-expand').click(); true`);
  await waitFor(`document.querySelectorAll('.af-window .af-trow').length === 217`, 8000);
  const pw = await evalJs(`(() => { const r = document.querySelector('.af-window .af-win-rail'); return r ? getComputedStyle(r).flexDirection : null; })()`);
  check('phone: the window\'s rail folds into a row of chips above the table', pw === 'row', pw);
  await afShot('B-390-dark-zh');
  await evalJs(`for (const w of [...app.wm.windows.values()]) if (w.type === 'artifacts') app.wm.closeWindow(w.id); document.documentElement.setAttribute('data-theme', 'dark'); (${VIEW})._refreshArtifacts(); true`);
  await sleep(600);
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
  // ── int232 (the integration brief): THE REAL LAYOUT RESTORE of the Artifacts window — the ⑦ replay above re-opens the
  //    window from its captured openSpec by hand, because nothing in this suite is a user's input (the autosave keeps no
  //    layout while `_userDirty` is false). Here the window is opened from the chip's ⤢ by REAL clicks and moved by a REAL
  //    title-bar drag (CDP input ⇒ the user's act ⇒ the ordinary autosave); the reload then brings it back BY ITSELF —
  //    the boot restore's generic openSpec replay — at the position it was dragged to, with the conversation's rows ──
  console.log('⑧ int232: an open Artifacts window survives a reload at its position (the real layout restore, no hand replay)');
  const rmouse = (type, x, y, extra = {}) => cdp('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, ...extra });
  const rclick = async (r) => { await rmouse('mouseMoved', r.x, r.y, { buttons: 0 }); await rmouse('mousePressed', r.x, r.y); await sleep(40); await rmouse('mouseReleased', r.x, r.y); };
  const rcenter = (sel) => evalJs(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; return { x, y, hit: !!document.elementFromPoint(x, y)?.closest(${JSON.stringify(sel)}) }; })()`);
  const AFW = `[...app.wm.windows.values()].filter((w) => w.type === 'artifacts')`;
  const afBox = () => evalJs(`(() => { const ws = ${AFW}; const w = ws[0]; if (!w) return { n: 0 }; const r = w.element.getBoundingClientRect(); return { n: ws.length, sid: w._openSpec && w._openSpec.sessionId, l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), rows: w.content.querySelectorAll('.af-trow').length }; })()`);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1400, height: 860, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.reload', {}); await waitApp(); await sleep(1000);
  await evalJs(`window.__sid = ${JSON.stringify(sid)}; if (!${VIEW}) app.attachSession(${JSON.stringify(sid)}, 'artifacts', ${JSON.stringify(CWD)}, { mode: 'chat', backend: 'claude' }); true`);
  await waitFor(`!!(${VIEW}) && !!document.querySelector('.chat-status-artifacts')`, 20000);
  await evalJs(`for (const w of [...app.wm.windows.values()]) if (w !== (${VIEW}).winInfo && w.type !== 'chat') app.wm.closeWindow(w.id); true`);
  await sleep(6500); // LayoutManager._restoring holds ~5 s after a boot (test-desktop-move's boot wait)
  const chip8 = await rcenter('.chat-status-artifacts');
  if (chip8) await rclick(chip8);
  await waitFor(`!!${AF_PANEL}`, 5000);
  const exp8 = await rcenter('.chat-artifacts-panel .af-expand');
  if (exp8) await rclick(exp8);
  await waitFor(`${AFW}.length === 1 && ${AFW}[0].content.querySelectorAll('.af-trow').length > 0`, 10000);
  const o8 = await afBox();
  const tb8 = await evalJs(`(() => { const w = ${AFW}[0]; const r = w && w.element.querySelector('.window-titlebar')?.getBoundingClientRect(); return r ? { x: r.left + 90, y: r.top + r.height / 2 } : null; })()`);
  if (tb8) {
    await rmouse('mouseMoved', tb8.x, tb8.y, { buttons: 0 }); await rmouse('mousePressed', tb8.x, tb8.y); await sleep(60);
    for (let i = 1; i <= 16; i++) { await rmouse('mouseMoved', tb8.x + 150 * i / 16, tb8.y + 80 * i / 16); await sleep(35); }
    await sleep(120); await rmouse('mouseReleased', tb8.x + 150, tb8.y + 80);
  }
  await sleep(800);
  const d8 = await afBox();
  let saved8 = null;
  for (let i = 0; i < 40 && !saved8; i++) { // the ordinary autosave (500 ms debounce + the drop's 400 ms) reaches the server's layout record
    const L = await fetch(`http://127.0.0.1:${PORT}/api/layouts`).then((r) => r.json()).catch(() => null);
    const all = L ? [L.autoSave, ...Object.values(L.desktops || {}).map((d) => d && d.autoSave)].filter(Boolean) : [];
    saved8 = all.flatMap((s) => s.windows || []).find((w) => w.openSpec && w.openSpec.action === 'openArtifacts' && w.openSpec.sessionId === sid) || null;
    if (!saved8) await sleep(250);
  }
  check('the Artifacts window opened from the chip\'s ⤢ by REAL clicks and moved by a REAL title-bar drag; the ordinary autosave put it in the server\'s layout ({action: openArtifacts, this conversation} + its bounds)', !!(chip8 && chip8.hit && exp8 && exp8.hit) && o8.n === 1 && d8.n === 1 && Math.abs(d8.l - o8.l) >= 60 && Math.abs(d8.t - o8.t) >= 30 && !!saved8 && !!saved8.gridBounds, { chip8, exp8, o8, d8, saved8 });
  await afShot('R-1400-dragged');
  await cdp('Page.reload', {}); await waitApp();
  const back8 = await waitFor(`${AFW}.length > 0 && ${AFW}[0].content.querySelectorAll('.af-trow').length > 0`, 20000);
  await sleep(1500);
  const r8 = await afBox();
  check('after a reload the window comes back BY ITSELF (nothing re-opened by hand): ONE Artifacts window for this conversation, its rows drawn, at the position it was dragged to (±2 px) — not where a fresh one opens', back8 && r8.n === 1 && r8.sid === sid && r8.rows > 0 && Math.abs(r8.l - d8.l) <= 2 && Math.abs(r8.t - d8.t) <= 2 && Math.abs(r8.w - d8.w) <= 2 && Math.abs(r8.h - d8.h) <= 2, { d8, r8 });
  await afShot('R-1400-restored');

  console.log('⑨ lane artifacts-auto-open-quiet — the phone (390 px): an automatic open opens nothing (the card + the chip only); the screen stays');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp('Page.reload', {}); await waitApp(); await sleep(1000);
  await evalJs(`window.__sid = ${JSON.stringify(sid)}; if (!${VIEW}) app.attachSession(${JSON.stringify(sid)}, 'artifacts', ${JSON.stringify(CWD)}, { mode: 'chat', backend: 'claude' }); true`);
  await waitFor(`!!(${VIEW}) && (${CARDS}).length >= 2`, 20000);
  await evalJs(`(app.settings.set('artifacts.autoOpenDocs', true), app.wm.focusWindow((${VIEW}).winInfo.id), true)`); await sleep(400); // the setting back ON after the reload (a set just before a reload can lose its save)
  const b9 = await evalJs(`({ active: app.wm.activeWindowId, n: app.wm.windows.size, on: app.settings.get('artifacts.autoOpenDocs') })`);
  check('turn 6 played (Write docs/PHONE.md)', await turn('Write phone notes', /Phone notes written/));
  await waitFor(`(${CARDS}).some((e) => e.dataset.key === ${JSON.stringify(':' + PHONE)})`, 8000); await sleep(1500);
  const a9 = await evalJs(`({ active: app.wm.activeWindowId, n: app.wm.windows.size, phone: ${wins(PHONE)} })`);
  check('the phone: PHONE.md\'s card is drawn, NO window opened for it, the chat stays the screen (setting on)', b9.on === true && a9.phone === 0 && a9.active === b9.active && a9.n === b9.n, { b9, a9 });
  check('no page error', pageErrors.length === 0, pageErrors.slice(0, 3));
} catch (e) {
  failed++; console.error('✗ threw:', e && e.stack || e);
}
console.log(`\n${passed} passed, ${failed} failed`);
cleanup();
process.exit(failed ? 1 : 0);
