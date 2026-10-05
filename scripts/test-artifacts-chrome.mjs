#!/usr/bin/env node
// DELIVERABLES ON A REAL PAGE (lane artifacts-model, heavy; docs/design-artifacts.zh.md). A THROWAWAY server in a git
// worktree (own data/, a scratch HOME) + headless chrome over raw CDP (test-chat-hygiene-ui's skeleton); a stub
// `claude` behind the real chat-wrapper plays three turns of the REAL stream-json shapes:
//   ① turn 1 Writes docs/BRIEF.md ⇒ ONE card, the chip reads "Artifacts · 1", and (artifacts.autoOpenDocs on, the
//     default) the document opens beside the chat by itself;
//   ② turn 2 Edits it ⇒ the SAME card element patched in place (a mark set on it survives; still one card node; its
//     words say the change), and no second window (an edit never re-opens);
//   ③ the setting OFF, turn 3 Writes docs/NOTES.md ⇒ a second card, nothing opens; one CLICK on the card opens it;
//   ④ a reload shows the same two cards (the server's messages; the replay itself is test-artifacts ⑤).
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
];
const DISK = [[BRIEF, '# Brief\n\nfirst draft\n'], [BRIEF, '# Brief\n\nsecond draft\n'], [NOTES, '# Notes\n']];
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

const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, CLAUDE_CMD: stubPath, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' }, stdio: 'ignore' });
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
  check('no page error', pageErrors.length === 0, pageErrors.slice(0, 3));
} catch (e) {
  failed++; console.error('✗ threw:', e && e.stack || e);
}
console.log(`\n${passed} passed, ${failed} failed`);
cleanup();
process.exit(failed ? 1 : 0);
