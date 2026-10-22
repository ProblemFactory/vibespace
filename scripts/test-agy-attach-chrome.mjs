#!/usr/bin/env node
// AN ATTACHMENT IN AN ANTIGRAVITY CONVERSATION IS SENT, NOT REFUSED AS A SLASH COMMAND (lane agy-slash-guard-paths, heavy).
// The owner 2026-10-21, in an Antigravity chat: he attached a zip, typed a line, and the chat answered «Error: /home was not
// sent: Antigravity answers its slash commands itself …» — the upload writes the file's absolute PATH first, and the
// wrapper's guard read every line that starts with "/" + a letter as a command. A THROWAWAY server in a git worktree (own
// data/, a scratch HOME; the working tree's src/ public/ server.js data/bin/ — the wrapper is the code under test) +
// headless chrome over raw CDP (test-artifacts-chrome's skeleton). agy is the FAKE (scripts/fixtures/antigravity-agy as
// ANTIGRAVITY_CMD: it ends its stream on agy's measured commands only) behind the REAL data/bin/agy-wrapper.js, and every
// stdin line it reads is logged:
//   ① the page's own createSession makes an Antigravity chat; the composer's REAL upload (ChatInput.uploadFiles →
//     /api/upload → _insertUploadedPaths) writes `<cwd>/brief.zip ` into the box, the owner's words are typed after it and
//     Enter sends ⇒ agy reads that line with the path FIRST, its reply is drawn, and the chat shows NO error card;
//   ② /model typed and sent in the same chat ⇒ the error card names /model (a real command is still held back), agy never
//     reads it, and the next line is answered (the conversation lives on).
// RED CONTROL = the 2.369.340 guard: the scratch tree's agy-wrapper.js given the base's first-character rule (a wrapper is
// read at each start) — a second chat, the same attachment ⇒ the error card «/<first segment> was not sent …», and agy never
// reads the line.
// Run: node scripts/test-agy-attach-chrome.mjs   (SKIPs without chrome)
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
const wt = scratch('agy-attach-wt');
const fakeHome = scratchHome('agy-attach-home', fs);
const stubDir = scratch('agy-attach-stub');
fs.mkdirSync(stubDir, { recursive: true });
const CWD = path.join(fakeHome, 'proj');
fs.mkdirSync(CWD, { recursive: true });
let failed = 0, passed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
// THE STUB agy = the fake, its stdin log named by the session (CLAUDE_WEBUI_SESSION_ID rides every session's env)
const stubPath = path.join(stubDir, 'agy');
fs.writeFileSync(stubPath, `#!${process.execPath}
process.env.AGY_STUB_LOG = ${JSON.stringify(stubDir)} + '/stdin-' + (process.env.CLAUDE_WEBUI_SESSION_ID || 'none') + '.jsonl';
require(${JSON.stringify(path.join(repo, 'scripts/fixtures/antigravity-agy'))});
`, { mode: 0o755 });
const stubLog = (sid) => { try { return fs.readFileSync(path.join(stubDir, `stdin-${sid}.jsonl`), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
// what agy READ as the user's text (a <vibespace-context> block the wrapper puts in front of a turn is not the user's text)
const agyRead = (sid) => stubLog(sid).filter((x) => x.stdin).map((x) => { try { return String(JSON.parse(x.stdin).message.content).replace(/^<vibespace-context>\n[\s\S]*?\n<\/vibespace-context>\n/, ''); } catch { return null; } });
const agyStarted = (sid) => stubLog(sid).some((x) => Array.isArray(x.argv) && x.argv.includes('--input-format'));

const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, ANTIGRAVITY_CMD: stubPath, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' }, stdio: 'ignore' });
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu',
  '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-timer-throttling', `--user-data-dir=${wt}-chrome`, 'about:blank'], { stdio: 'ignore' });
let cleaned = false;
const cleanup = () => {
  if (cleaned) return; cleaned = true;
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv.kill('SIGKILL'); } catch {}
  for (const root of [wt, fakeHome, stubDir]) { try { endRootedProcesses(root); } catch {} } // dtach, the wrapper, the fake agy carry one of these roots
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
const until = async (fn, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(150); } return fn(); };
const waitApp = () => evalJs('new Promise((res, rej) => { const t0 = Date.now(); (function w() { if (window.app) return res(app.ready); if (Date.now() - t0 > 20000) return rej(new Error("no app after 20s")); setTimeout(w, 200); })(); })');
const V = (sid) => `([...(window.app.sessions?.values?.() || [])].find((v) => v && v._messageList && v.sessionId === ${JSON.stringify(sid)}))`;
const SENT_NOT = 'was not sent: Antigravity answers its slash commands itself';
const chatText = (sid) => evalJs(`(${V(sid)})?._messageList?.textContent || ''`);
// a chat THE WAY A USER MAKES ONE: the page's own createSession (its creator never attaches — the live path)
async function openChat(name, not = '') {
  await evalJs(`app.createSession({ cwd: ${JSON.stringify(CWD)}, name: ${JSON.stringify(name)}, mode: 'chat', backend: 'antigravity' }); true`);
  let sid = null;
  for (let i = 0; i < 80 && !sid; i++) { sid = await evalJs(`([...app.sessions.values()].find((v) => v && v._messageList && v.sessionId !== ${JSON.stringify(not)})?.sessionId) || null`); if (!sid) await sleep(250); }
  await until(() => sid && agyStarted(sid), 15000);
  await waitFor(`!!(${V(sid)})?._chatInput?._textarea`, 15000);
  await sleep(400);
  return sid;
}
const enter = async () => {
  for (const type of ['keyDown', 'keyUp']) await cdp('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, ...(type === 'keyDown' ? { text: '\r' } : {}) });
};
const dropdownOpen = (sid) => evalJs(`!(${V(sid)})._chatInput._slashDropdown.classList.contains('hidden')`);
// the composer's REAL upload, then the owner's words typed after the path, then Enter
async function attachAndSend(sid, words) {
  const box = await evalJs(`(async () => { const v = ${V(sid)}; await v._chatInput.uploadFiles([new File(['PK\\u0003\\u0004 stub archive\\n'], 'brief.zip', { type: 'application/zip' })]); return v._chatInput._textarea.value; })()`);
  await evalJs(`(${V(sid)})._chatInput._textarea.focus(); true`);
  await cdp('Input.insertText', { text: words });
  const typed = await evalJs(`(${V(sid)})._chatInput._textarea.value`);
  const dropdown = await dropdownOpen(sid);
  await enter();
  const cleared = await waitFor(`(${V(sid)})._chatInput._textarea.value === ''`, 5000);
  return { box, typed, dropdown, cleared };
}

try {
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1400, height: 860, deviceScaleFactor: 1, mobile: false });
  await cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await waitApp();
  await sleep(800);

  console.log('① an Antigravity chat: the composer attaches a file and the message — its path first — is SENT');
  const sid = await openChat('agy-attach');
  check('an Antigravity chat is created through the page\'s own createSession and the fake agy started behind the real wrapper', !!sid && agyStarted(sid), { sid, log: sid && stubLog(sid).slice(0, 2) });
  const WORDS = '这里是标书，请看看';
  const MSG = `${CWD}/brief.zip ${WORDS}`;
  const a = await attachAndSend(sid, WORDS);
  check('the composer\'s REAL upload wrote the file\'s absolute path FIRST in the box (`<cwd>/brief.zip `), the file is in the working dir', a.box === `${CWD}/brief.zip ` && fs.existsSync(path.join(CWD, 'brief.zip')), a);
  check('…the owner\'s words typed after it, Enter sent it (the box emptied, no slash dropdown in the way)', a.typed === MSG && a.cleared && !a.dropdown, a);
  const read = await until(() => agyRead(sid).includes(MSG), 15000);
  check('agy READ the message with the attachment\'s path first — exactly the line the box held', !!read, { want: MSG, read: agyRead(sid) });
  const replies = (sid) => evalJs(`((${V(sid)})?._messageList?.textContent || '').split('Antigravity (').length - 1`);   // the fake's reply = "Antigravity (<model>, <mode>): <what it read>"
  const replied = await waitFor(`(() => { const t = (${V(sid)})?._messageList?.textContent || ''; return t.includes('Antigravity (') && t.indexOf(${JSON.stringify(MSG)}) !== t.lastIndexOf(${JSON.stringify(MSG)}); })()`, 15000);
  const t1 = await chatText(sid);
  check('agy\'s reply (it names the line it read) is drawn under the user\'s bubble, and there is NO error card («… was not sent: Antigravity answers its slash commands itself»)', replied && !t1.includes(SENT_NOT), t1.slice(-400));

  console.log('② a REAL agy command in the same chat is still held back, by name');
  await evalJs(`(${V(sid)})._chatInput._textarea.focus(); true`);
  await cdp('Input.insertText', { text: '/model' });
  if (await dropdownOpen(sid)) for (const type of ['keyDown', 'keyUp']) await cdp('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await enter();
  const card = await waitFor(`((${V(sid)})?._messageList?.textContent || '').includes('/model ${SENT_NOT}')`, 15000);
  check('/model ⇒ the error card names it in the product\'s sentence, and agy never read it', card && !agyRead(sid).includes('/model'), { read: agyRead(sid), tail: (await chatText(sid)).slice(-300) });
  await cdp('Input.insertText', { text: 'still here' });
  await enter();
  check('…the conversation lives on: the next line is read and answered (no «Antigravity ended this session»)',
    !!(await until(() => agyRead(sid).includes('still here'), 15000)) && await waitFor(`((${V(sid)})?._messageList?.textContent || '').split('Antigravity (').length - 1 >= 2`, 15000) && !(await chatText(sid)).includes('Antigravity ended this session'), { replies: await replies(sid), read: agyRead(sid) });

  console.log('RED CONTROL — the 2.369.340 guard (its first-character rule) in the scratch tree\'s wrapper: the same attachment is refused');
  const WRAP = path.join(wt, 'data/bin/agy-wrapper.js');
  const W_SRC = fs.readFileSync(WRAP, 'utf8');
  const GUARD = "  const word = agySlashCommand(text);\n  if (!word) return false;\n";
  const BASE_GUARD = "  const t = String(text || '').trimStart();\n  if (!/^\\/[A-Za-z]/.test(t)) return false;\n  const word = (t.match(/^\\/[\\w:-]+/) || ['/'])[0];\n";
  fs.writeFileSync(WRAP, W_SRC.replace(GUARD, BASE_GUARD));
  const sid2 = await openChat('agy-attach-base', sid);
  const b = await attachAndSend(sid2, WORDS);
  const first = '/' + CWD.split('/')[1];
  const refused = await waitFor(`((${V(sid2)})?._messageList?.textContent || '').includes(${JSON.stringify(first + ' ' + SENT_NOT)})`, 15000);
  await sleep(1200);
  check(`RED CONTROL: the base guard refuses the attachment's message as the command «${first}» (the owner's «/home was not sent»), and agy never reads it`,
    W_SRC.includes(GUARD) && !!sid2 && sid2 !== sid && b.box === `${CWD}/brief.zip ` && refused && !agyRead(sid2).includes(MSG), { b, read: agyRead(sid2), tail: (await chatText(sid2)).slice(-300) });
  check('no page error', pageErrors.length === 0, pageErrors.slice(0, 3));
} catch (e) {
  failed++; console.error('✗ threw: ' + (e && e.stack || e));
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
