#!/usr/bin/env node
// A PICTURE A MESSAGE SHOWED OUTLIVES ITS TEMP FILE — READ FROM ITS RECORD, in a real page (lane chat-attachments-persist,
// the cut — 主开发 2026-11-13: «the record is the store»). A THROWAWAY hub in a git worktree + headless chrome over raw CDP;
// a fake HOME holds a claude transcript whose agent READ a screenshot under a temporary folder (the transcript keeps its
// bytes, as the CLI does).
//   ① the view draws the picture from its file (/api/file/raw); the card carries its record's URL (data-record-src =
//      /api/chat-picture/<transcript id>/<record uuid>/<n>) — and NOTHING is copied (no data/chat-attachments at all)
//   ② the temp file is CLEANED and the hub RESTARTED ⇒ the old message still draws its picture — read from the record by the
//      hub's transcript worker, swapped in by the view's error delegate
//   ③ a record that never carried the bytes (and its temp file gone) ⇒ the card says «This picture was stored in a temporary
//      folder and is gone» (a true word, not a broken image)
// Run: node scripts/test-chat-attachments-chrome.mjs   (SKIPs without chrome)
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { scratch, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
const VNC_ENV = await vncEnv();
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
const freePort = () => new Promise((res) => { const s = require('net').createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const PORT = await freePort(), CDP_PORT = await freePort();
const wt = scratch('cap-chrome-wt'), fakeHome = scratch('cap-chrome-home'), profile = scratch('cap-chrome-profile'), tmpDir = scratch('cap-chrome-tmp');
let failed = 0, passed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 600) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'data/bin']) execSync(`rm -rf ${wt}/${f} && mkdir -p ${path.dirname(`${wt}/${f}`)} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
execSync('npm run build', { cwd: wt, stdio: 'ignore' });

// a REAL picture (1×1 PNG) under a temporary folder, read by the agent; the transcript keeps its bytes (the CLI's own shape)
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4c10000000049454e44ae426082', 'hex');
fs.mkdirSync(tmpDir, { recursive: true });
const SHOT = path.join(tmpDir, 'screen-1.png'), SHOT2 = path.join(tmpDir, 'screen-2-never-kept.png');   // SHOT2: a record without bytes, its file gone
fs.writeFileSync(SHOT, PNG);
const SID = '5a5a5a5a-1111-4222-8333-944444444444';
const cwd = scratch('cap-chrome-proj'); fs.mkdirSync(cwd, { recursive: true });
const ts = (i) => new Date(1700000000000 + i * 60000).toISOString();
const recs = [
  { type: 'user', uuid: 'u-1', timestamp: ts(1), sessionId: SID, cwd, message: { role: 'user', content: [{ type: 'text', text: 'PIC-MARKER take a screenshot' }] } },
  { type: 'assistant', uuid: 'a-2', timestamp: ts(2), sessionId: SID, cwd, message: { role: 'assistant', id: 'msg-2', model: 'claude-fable-5', content: [{ type: 'tool_use', id: 'toolu_pic1', name: 'Read', input: { file_path: SHOT } }], usage: { input_tokens: 10, output_tokens: 5 } } },
  { type: 'user', uuid: 'u-3', timestamp: ts(3), sessionId: SID, cwd, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_pic1', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG.toString('base64') } }] }] } },
  { type: 'assistant', uuid: 'a-4', timestamp: ts(4), sessionId: SID, cwd, message: { role: 'assistant', id: 'msg-4', model: 'claude-fable-5', content: [{ type: 'tool_use', id: 'toolu_pic2', name: 'Read', input: { file_path: SHOT2 } }], usage: { input_tokens: 10, output_tokens: 5 } } },
  { type: 'user', uuid: 'u-5', timestamp: ts(5), sessionId: SID, cwd, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_pic2', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: '' } }] }] } },
  { type: 'assistant', uuid: 'a-6', timestamp: ts(6), sessionId: SID, cwd, message: { role: 'assistant', id: 'msg-6', model: 'claude-fable-5', content: [{ type: 'text', text: 'PIC-MARKER done' }], usage: { input_tokens: 10, output_tokens: 5 } } },
];
const projDir = path.join(fakeHome, '.claude', 'projects', cwd.replace(/[/._]/g, '-'));
fs.mkdirSync(projDir, { recursive: true });
fs.writeFileSync(path.join(projDir, `${SID}.jsonl`), recs.map((r) => JSON.stringify(r)).join('\n') + '\n');
const RECORD_URL = `/api/chat-picture/${SID}/u-3/0?b=claude`;   // the place: the transcript, the record's uuid, the picture's ordinal

let srv = null;
const startServer = () => { srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VS_NO_REAL_CLI: '1' }, stdio: 'ignore' }); };
const stopServer = async () => { const p = srv; srv = null; if (!p) return; p.kill('SIGTERM'); await new Promise((r) => { const t = setTimeout(() => { try { p.kill('SIGKILL'); } catch { } r(); }, 8000); p.once('exit', () => { clearTimeout(t); r(); }); }); };
const ready = async () => { for (let i = 0; i < 120; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/api/home`); if (r.status < 500) return true; } catch { } await sleep(250); } return false; };
startServer();
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-timer-throttling', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch { }
  try { srv && srv.kill('SIGKILL'); } catch { }
  for (const r of [wt, fakeHome]) { try { endRootedProcesses(r); } catch { } }   // whatever the hub started under its roots
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
};
process.on('exit', cleanup);

const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 40 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((t) => t.type === 'page'); } catch { await sleep(250); } }
const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => ws.on('open', r));
let seq = 0; const pend = new Map();
ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); ws.send(JSON.stringify({ id, method, params })); });
const evalJs = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; };
const until = async (expr, ms = 15000) => { const t0 = Date.now(); for (;;) { let v = null; try { v = await evalJs(expr); } catch { } if (v) return v; if (Date.now() - t0 > ms) return v; await sleep(150); } };
const view = () => evalJs(`(() => { const before = new Set(app.wm.windows.keys()); app.viewSession(${JSON.stringify(SID)}, ${JSON.stringify(cwd)}, 'pic-view', { backend: 'claude', backendSessionId: ${JSON.stringify(SID)} }); return [...app.wm.windows.keys()].find((id) => !before.has(id)) || null; })()`);
const card = (win, n = 0) => `(() => { const w = app.wm.windows.get(${JSON.stringify(win)}); const img = w && w.element.querySelectorAll('img.chat-tool-img')[${n}]; if (!img || !img.complete) return null; const box = img.closest('.chat-media'); const miss = box && box.querySelector('.chat-media-missing'); return { src: img.getAttribute('src'), rec: img.dataset.recordSrc || '', tried: img.dataset.recordTried || '', w: img.naturalWidth, broken: !!(box && box.classList.contains('chat-media-broken')), missing: miss ? miss.textContent : '' }; })()`;

try {
  check('the hub boots', await ready());
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  const openPage = async () => {
    await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
    await until('!!(window.app && app.wm)', 30000); await evalJs('app.ready'); await until(`!document.getElementById('loading-screen')`, 30000);
  };
  await openPage();
  console.log('① the picture drawn from its file; the card names its record — nothing is copied');
  const w1 = await view();
  const c1 = await until(`(() => { const c = ${card(w1)}; return c && c.w > 0 ? c : null; })()`, 20000);
  check('the old message draws the agent\'s screenshot from its file (/api/file/raw)', !!c1 && /\/api\/file\/raw\?path=/.test(c1.src) && c1.w === 1, c1);
  check('…and the card carries its RECORD\'s URL for later (data-record-src = /api/chat-picture/<transcript id>/<uuid>/<n>)', !!c1 && c1.rec === RECORD_URL, c1);
  await sleep(500);
  check('NOTHING is copied: no data/chat-attachments folder appears for a picture a message showed', !fs.existsSync(path.join(wt, 'data', 'chat-attachments')) || fs.readdirSync(path.join(wt, 'data', 'chat-attachments')).length === 0);

  console.log('② the temp file CLEANED and the hub RESTARTED ⇒ the old message still draws its picture');
  fs.rmSync(SHOT, { force: true });
  await stopServer(); startServer();
  check('the hub is back', await ready());
  await openPage();
  const w2 = await view();
  const c2 = await until(`(() => { const c = ${card(w2)}; return c && c.tried && c.w > 0 ? c : null; })()`, 20000);
  check('the file gone ⇒ the view swapped in the RECORD\'s copy (through .src) and it draws — read from the transcript', !!c2 && c2.src === RECORD_URL && c2.w === 1 && !c2.broken, c2 || await evalJs(card(w2)));
  const direct = await fetch(`http://127.0.0.1:${PORT}${RECORD_URL}`).then(async (r) => ({ s: r.status, b: Buffer.from(await r.arrayBuffer()) })).catch(() => null);
  check('…its bytes are the record\'s, byte for byte (the owner\'s page; no password set on this throwaway hub)', !!direct && direct.s === 200 && direct.b.equals(PNG), direct && direct.s);

  console.log('③ a record that never carried the bytes, its temp file gone ⇒ a true word, not a broken image');
  const c3 = await until(`(() => { const c = ${card(w2, 1)}; return c && c.broken ? c : null; })()`, 20000);
  check('no bytes and no file ⇒ «This picture was stored in a temporary folder and is gone» (the card, not a broken image)', !!c3 && c3.broken && !c3.rec && /stored in a temporary folder and is gone/.test(c3.missing), c3 || await evalJs(card(w2, 1)));
} catch (e) {
  check('the run did not throw', false, e && e.stack);
} finally { await stopServer(); }
console.log(`\n${failed ? '✗' : '✓'} test-chat-attachments-chrome: ${passed} passed, ${failed} failed`);
console.log(failed ? 'FAIL' : `ALL PASS (${passed})`);
process.exit(failed ? 1 : 0);
