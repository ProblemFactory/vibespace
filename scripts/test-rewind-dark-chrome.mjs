#!/usr/bin/env node
// test-rewind-dark-chrome — row B-437e, lane lg-rewind 2026-11-24 (主开发 r2366): TODAY's «Rewind to here» IN A REAL PAGE, with the
// files tier DARK as it ships (nothing sets a conversation's files fact until U1). U3 and its follow add a page, a strip row above
// the message list and move what floats over the list's top edge by the strip's height; with the tier dark NONE of it may show.
// A THROWAWAY server in a git worktree (own data/, a scratch HOME) + headless chrome over raw CDP (test-chat-scroll's skeleton). A
// stub `claude` 2.1.322 behind the REAL chat-wrapper through the REAL create path answers each message with one line, and answers
// the CLI's `rewind_conversation` the way the CLI does (rewound, the target, its words back).
//   ① two messages typed in the composer, each answered; the wrapper stamps them, so each carries «Rewind to here»
//   ② the floats at the RELEASE's tops (the left-behind line 40px, the history-load pill 6px, the position pill 8px, the run bar
//      0, the pill under an open run's bar 34px); no kept-lines strip, no strip height on the view
//   ③ a REAL press on the first message's «Rewind to here»: the confirm opens with the release's words and buttons — its title, its
//      one sentence (the turns it takes back, «Files on disk are not rolled back …»), «Rewind» (danger) and «Cancel»; no files
//      choice, no radio; the message list and the composer exactly where they were
//   ④ a REAL press on «Rewind»: ONE rewind_conversation to the CLI naming that message's uuid, and no files request at all; the
//      CLI's answer takes the turns back as today's rewind does (its notice; the messages stay, struck) and puts the first message's words into the empty box; the list and the composer
//      still where they were; no strip; the floats still at the release's tops; no page exception
//   CONTROL: a strip row put above the list by hand ⇒ the geometry read sees the list and the composer move (the read is not blind)
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, ONBOARDED_SOURCE, vncEnv, CHROME_QUIET, realClicker } from './scratch.mjs';
import { mintRoot, startHub, strippedEnv } from './hub-boot.mjs';
import { armWatchdog } from './suite-watchdog.mjs';

const VNC_ENV = await vncEnv();
const require = createRequire(import.meta.url);
const ti = process.argv.indexOf('--tree');
const repo = ti > 0 ? path.resolve(process.argv[ti + 1]) : path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }

const [PORT, CDP_PORT] = await freePorts(2);
const root = mintRoot('rewind-dark-wt'), wt = path.join(root, 't');
const chromeHome = path.join(root, 'chrome-home'); fs.mkdirSync(chromeHome, { recursive: true });   // rule nine (hub-boot.mjs): the browser's HOME in the root
const fakeHome = path.join(root, 'home'); for (const d of ['.claude/projects', '.claude/sessions', '.config', '.vibespace']) fs.mkdirSync(path.join(fakeHome, d), { recursive: true });
const stubDir = path.join(root, 'stub');
fs.mkdirSync(stubDir, { recursive: true });
const CWD = path.join(fakeHome, 'work');
fs.mkdirSync(CWD, { recursive: true });
const SID = '7e3d0000-0000-4000-8000-0000000c5d01';
const STDIN_LOG = path.join(stubDir, 'stdin.ndjson');
let failed = 0, passed = 0;
const check = (n, c, e) => { if (typeof c !== 'boolean') throw new TypeError(`check «${n}»: a boolean verdict, not ${typeof c}`); if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── the stub CLI: one line a message; the CLI's own answer to a rewind ──
fs.writeFileSync(path.join(stubDir, 'claude'), `#!${process.execPath}
const fs = require('fs');
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('2.1.322 (Claude Code)'); process.exit(0); }
if (args.includes('--help')) { console.log('Usage: claude [options]'); process.exit(0); }
const SID = ${JSON.stringify(SID)};
const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
out({ type: 'system', subtype: 'init', session_id: SID, model: 'claude-sonnet-5-5', cwd: ${JSON.stringify(CWD)}, tools: ['Bash'], permissionMode: 'default', claude_code_version: '2.1.322', apiKeySource: 'none' });
let buf = '', n = 0, words = {};
process.stdin.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1);
  if (!line.trim()) continue;
  fs.appendFileSync(${JSON.stringify(STDIN_LOG)}, line + '\\n');
  let m = null; try { m = JSON.parse(line); } catch {} if (!m) continue;
  if (m.type === 'user') {
    n++; const k = n; const c = m.message && m.message.content; const text = typeof c === 'string' ? c : Array.isArray(c) ? c.map((x) => (x && x.text) || '').join('') : '';
    if (m.uuid) words[m.uuid] = text;
    setTimeout(() => { out({ type: 'assistant', uuid: 'as-' + k, session_id: SID, message: { id: 'msg_a' + k, type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [{ type: 'text', text: 'ANSWER-' + k }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } } });
      out({ type: 'result', subtype: 'success', is_error: false, duration_ms: 50, num_turns: 1, result: 'done', session_id: SID, total_cost_usd: 0.01, usage: { input_tokens: 1, output_tokens: 1 } }); }, 150);
    continue;
  }
  if (m.type === 'control_request' && m.request && m.request.subtype === 'rewind_conversation') {
    const target = m.request.target_message_uuid;
    setTimeout(() => out({ type: 'control_response', response: { subtype: 'success', request_id: m.request_id, response: { rewound: true, targetMessageUuid: target, prefillText: words[target] || null, precedingAssistantUuid: null } } }), 150);
  }
} });
process.stdin.on('end', () => process.exit(0));
`, { mode: 0o755 });

// ── throwaway server in a worktree (the tree's src/ + built public/) ──
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
const hub = startHub({ root, tree: wt, port: PORT, env: { ...strippedEnv(), ...VNC_ENV, HOME: fakeHome, CLAUDE_CMD: path.join(stubDir, 'claude'), VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', NO_AUTO_UPDATE: '1' } });
const chrome = spawn(CHROME, [...CHROME_QUIET, '--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--password-store=basic',
  '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-timer-throttling', `--user-data-dir=${wt}-chrome`, 'about:blank'], { stdio: 'ignore', env: { ...process.env, HOME: chromeHome } });
let cleaned = false;
const cleanup = () => { if (cleaned) return; cleaned = true; try { chrome.kill('SIGKILL'); } catch {} };
process.on('exit', cleanup);
armWatchdog({ capMs: 240e3, exit: () => { cleanup(); process.exit(1); }, pending: () => [...pend.keys()].map((id) => `CDP call #${id}`) });
await hub.ready();

// ── raw CDP ──
const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 120 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((x) => x.type === 'page'); } catch {} if (!target) await sleep(250); }
if (!target) { console.error('✗ chrome never exposed a CDP page target'); process.exit(1); }
const sock = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => sock.on('open', r));
let seq = 0; const pend = new Map(); const pageErrors = [];
sock.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') { try { pageErrors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'unknown'); } catch {} }
});
const cdp = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq; const tm = setTimeout(() => { pend.delete(id); rej(new Error('cdp timeout: ' + method)); }, 20000);
  pend.set(id, (m) => { clearTimeout(tm); m.error ? rej(new Error(m.error.message)) : res(m.result); });
  sock.send(JSON.stringify({ id, method, params }));
});
const evalJs = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await evalJs(expr)) return true; } catch {} await sleep(150); } try { return await evalJs(expr); } catch { return false; } };
const VIEW = `([...(window.app.sessions?.values?.() || [])].find((v) => v && v._messageList && v.sessionId === window.__sid))`;
const RCK = realClicker({ evalJs, cdp });   // THE still door: a real press, waited on while its target moves, checked where it landed
/** the rewind confirm itself — found by its own title among the page's dialogs (others, hidden, stand in the page too) */
const DLG = `([...document.querySelectorAll('.dialog-footer')].map((f) => f.parentElement).find((d) => d && d.getClientRects().length > 0 && /Rewind to before this message\\?/.test(d.innerText)) || null)`;
const enter = async () => { await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); await sleep(200); };
const stdinLines = () => { try { return fs.readFileSync(STDIN_LOG, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { return []; } };
const listText = () => evalJs(`${VIEW}._messageList.textContent`);
/** where the list and the composer stand, and whether a kept-lines strip (or its height) is on the view */
const geo = () => evalJs(`(() => { const v = ${VIEW}; const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.top), Math.round(b.height)]; };
  return { list: r(v._messageList), input: r(v._container.querySelector('textarea.chat-input')), strip: !!v._container.querySelector('.chat-rewind-kept'), keptH: v._container.style.getPropertyValue('--chat-kept-h') || '' }; })()`);
const sameGeo = (a, b) => !!a && !!b && JSON.stringify(a.list) === JSON.stringify(b.list) && JSON.stringify(a.input) === JSON.stringify(b.input);
/** the computed top of what floats over the list's top edge (a probe of each class put in the view and taken out again) */
const floats = () => evalJs(`(() => { const c = ${VIEW}._container, out = {};
  const probe = (cls) => { const e = document.createElement('div'); e.className = cls; c.appendChild(e); const top = getComputedStyle(e).top; e.remove(); return top; };
  for (const cls of ['chat-left-behind', 'chat-history-status', 'chat-pos-indicator', 'chat-run-bar']) out[cls] = probe(cls);
  c.classList.add('chat-run-bar-on'); out['chat-history-status under an open run'] = probe('chat-history-status'); c.classList.remove('chat-run-bar-on');
  return out; })()`);
const RELEASE_TOPS = { 'chat-left-behind': '40px', 'chat-history-status': '6px', 'chat-pos-indicator': '8px', 'chat-run-bar': '0px', 'chat-history-status under an open run': '34px' };
const typeAndSend = async (text) => {
  await evalJs(`(() => { const ta = ${VIEW}._container.querySelector('textarea.chat-input'); ta.focus(); return true; })()`);
  await cdp('Input.insertText', { text });
  await enter();
};

try {
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await evalJs('new Promise((res, rej) => { const t0 = Date.now(); (function w() { if (window.app) return res(app.ready); if (Date.now() - t0 > 20000) return rej(new Error("no app after 20s")); setTimeout(w, 200); })(); })');
  await sleep(800);

  console.log('setup: a live stub claude 2.1.322 behind the real chat-wrapper');
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  await new Promise((r) => ws.on('open', r));
  const frames = []; ws.on('message', (d) => { try { frames.push(JSON.parse(String(d))); } catch {} });
  ws.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: CWD, reqId: 'rd1' }));
  let sid = null;
  for (let i = 0; i < 80 && !sid; i++) { const f = frames.find((m) => m?.type === 'created'); if (f) sid = f.sessionId; else await sleep(250); }
  check('a live claude chat session is created through the real spawn path', !!sid);
  await evalJs(`window.__sid = ${JSON.stringify(sid)}; app.attachSession(${JSON.stringify(sid)}, 'rewind', ${JSON.stringify(CWD)}, { mode: 'chat', backend: 'claude' }); true`);
  check('the live chat window attaches', await waitFor(`!!(${VIEW}) && !!${VIEW}._container.querySelector('textarea.chat-input')`, 20000));
  await sleep(800);

  console.log('① two messages typed in the composer, each answered and stamped');
  await typeAndSend('FIRST-ASK');
  const a1 = await waitFor(`/ANSWER-1/.test(${VIEW}._messageList.textContent) && !${VIEW}._chatInput?.isStreaming`, 20000);
  await sleep(500);
  await typeAndSend('SECOND-ASK');
  const a2 = await waitFor(`/ANSWER-2/.test(${VIEW}._messageList.textContent) && !${VIEW}._chatInput?.isStreaming`, 20000);
  const doors = await waitFor(`${VIEW}._container.querySelectorAll('.chat-msg > .chat-rewind-btn').length === 2`, 15000);
  const uuids = await evalJs(`${VIEW}._messages.filter((m) => m && m.role === 'user').map((m) => m.uuid || null)`);
  check('① both messages answered; the wrapper stamped each (its uuid), so each carries «Rewind to here»', a1 && a2 && doors && uuids.length === 2 && uuids.every(Boolean), { a1, a2, doors, uuids });
  await sleep(600);

  console.log('② the floats at the release\'s tops; no strip');
  const before = await geo(), f0 = await floats();
  check('② what floats over the list\'s top edge stands at the RELEASE\'s tops (the strip\'s height is nothing while the tier is dark)', JSON.stringify(f0) === JSON.stringify(RELEASE_TOPS), f0);
  check('② no kept-lines strip and no strip height on the view', before.strip === false && (before.keptH === '' || before.keptH === '0px'), before);

  console.log('③ a real press on the first message\'s «Rewind to here»');
  // a person's pointer over the first message (a move, not a press): its buttons show as they do for a person
  const over = await evalJs(`(() => { const b = ${VIEW}._container.querySelector('.chat-msg > .chat-rewind-btn'); const m = b && b.closest('.chat-msg'); if (!m) return null; m.scrollIntoView({ block: 'center' }); const r = m.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
  if (over) { await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: over.x, y: over.y }); await sleep(400); }
  const atDialog = await geo();
  const pressed1 = await RCK('.chat-view .chat-msg > .chat-rewind-btn', { scroll: 'center' });   // the first message's (the first in the page)
  const miss1 = RCK.lastMiss;
  const opened = await waitFor(`!!${DLG}`, 10000);
  const dlg = await evalJs(`(() => { const d = ${DLG}; if (!d) return { none: true, dialogs: [...document.querySelectorAll('.dialog-footer')].map((f) => ({ shown: !!(f.parentElement && f.parentElement.getClientRects().length), text: (f.parentElement && f.parentElement.innerText || '').slice(0, 60) })) }; const f = d.querySelector('.dialog-footer'); const ok = f.querySelector('.btn-create'), no = f.querySelector('.btn-cancel');
    return { text: d.innerText, hints: [...d.querySelectorAll('.dialog-hint')].map((p) => p.textContent), ok: ok && ok.textContent, danger: !!ok && ok.classList.contains('danger'), cancel: no && no.textContent, radios: d.querySelectorAll('input[type="radio"]').length, files: !!d.querySelector('.rewind-files') }; })()`);
  const SENTENCE = /^This message and everything after it are taken back — (?:1 turn\. The agent will no longer remember it|\d+ turns\. The agent will no longer remember them)\. Files on disk are not rolled back: whatever the agent changed stays as it is now\.$/;
  check('③ the confirm opens with the RELEASE\'s words: «Rewind to before this message?», one sentence naming the turns and that files on disk are not rolled back', pressed1 === true && opened === true && !!dlg && !dlg.none && dlg.text.includes('Rewind to before this message?') && dlg.hints.length === 1 && SENTENCE.test(dlg.hints[0]), { pressed1, miss1, over, dlg });
  check('③ …and its buttons: «Rewind» (danger) and «Cancel»; no files choice, no radio', !!dlg && dlg.ok === 'Rewind' && dlg.danger === true && dlg.cancel === 'Cancel' && dlg.radios === 0 && dlg.files === false, dlg);
  const open = await geo();
  check('③ the message list and the composer stand exactly where they were', sameGeo(before, atDialog) && sameGeo(before, open) && open.strip === false, { before, open });

  console.log('④ a real press on «Rewind»');
  const pressed2 = await RCK(`(${DLG} && ${DLG}.querySelector('.dialog-footer .btn-create'))`);
  const miss2 = RCK.lastMiss;
  const asked = await (async () => { for (let i = 0; i < 60; i++) { if (stdinLines().some((m) => m.type === 'control_request' && m.request && m.request.subtype === 'rewind_conversation')) return true; await sleep(200); } return false; })();
  const reqs = stdinLines().filter((m) => m.type === 'control_request' && m.request);
  const rewinds = reqs.filter((m) => m.request.subtype === 'rewind_conversation'), filesAsks = reqs.filter((m) => /files/.test(String(m.request.subtype)));
  check('④ ONE rewind_conversation to the CLI, naming the first message\'s uuid — and no files request at all (the tier is dark)', pressed2 === true && asked && rewinds.length === 1 && rewinds[0].request.target_message_uuid === uuids[0] && filesAsks.length === 0, { pressed2, miss2, asks: reqs.map((m) => m.request.subtype) });
  const NOTICE = /↶ Rewound to before your message — \d+ messages taken back\. Files were not rewound\./;   // today's notice; the messages stay, struck «rewound»
  const cut = await waitFor(`${NOTICE}.test(${VIEW}._messageList.textContent) && ${VIEW}._container.querySelector('textarea.chat-input').value === 'FIRST-ASK'`, 15000);
  check('④ the CLI\'s answer takes the turns back as today\'s rewind does: its notice «↶ Rewound to before your message — N messages taken back. Files were not rewound.» and the first message\'s words back in the empty box', cut, { list: (await listText()).slice(0, 300), box: await evalJs(`${VIEW}._container.querySelector('textarea.chat-input').value`) });
  await sleep(500);
  const after = await geo(), f1 = await floats();
  check('④ after it the list and the composer stand where they were; no strip; the floats at the release\'s tops', sameGeo(before, after) && after.strip === false && (after.keptH === '' || after.keptH === '0px') && JSON.stringify(f1) === JSON.stringify(RELEASE_TOPS), { before, after, f1 });

  { // CONTROL: a strip row put above the list by hand — the geometry read sees the list and the composer move
    await evalJs(`(() => { const v = ${VIEW}; const s = document.createElement('div'); s.className = 'chat-rewind-kept'; s.id = 'rd-ctl'; s.innerHTML = '<div class="chat-rewind-kept-lines"><div class="chat-system chat-rewind-kept-line"><span>a line</span></div></div>'; v._container.insertBefore(s, v._messageList); return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))); })()`);
    const planted = await geo();
    await evalJs(`(() => { document.getElementById('rd-ctl')?.remove(); return true; })()`);
    check('CONTROL: a strip row above the list ⇒ the read sees the list move and the strip there (the geometry legs are not blind)', !sameGeo(before, planted) && planted.strip === true, { before, planted });
  }
  check('no page exception in the whole run', pageErrors.length === 0, pageErrors.slice(0, 3));
} catch (e) {
  failed++;
  console.error('✗ the suite threw: ' + (e && e.stack || e));
}
console.log(`\n${failed ? `${failed} FAILED (${passed} passed)` : `ALL PASS (${passed})`}`);
process.exit(failed ? 1 : 0);
