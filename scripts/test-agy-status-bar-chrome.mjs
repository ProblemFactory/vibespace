#!/usr/bin/env node
// AN ANTIGRAVITY CONVERSATION'S STATUS BAR, ON A REAL PAGE (lane agy-status-bar-facts, heavy; the owner 2026-10-21: «agy 的
// chatview 缺少很多信息啊 什么 context 啊，cache rate，产物啊啥的下面都没有了»). A THROWAWAY server in a git worktree (own data/,
// a scratch HOME) + headless chrome over raw CDP (test-artifacts-chrome's skeleton). The agy is the FAKE agy
// (scripts/fixtures/antigravity-agy) behind the REAL agy-wrapper — the measured usage semantics and agy's own transcript
// under the scratch HOME; the claude is a stub behind the real chat-wrapper. No vendor, no real login.
//   ① an Antigravity chat (gemini-4-argon-high) created the way a user does; ONE turn that WRITES reports/summary.md ⇒ the
//     bar shows the context % against the model's documented window, ⚡ the cache hit rate, Σ the token total, the model,
//     the turn's time — and the Artifacts chip lists the file; no «not reported» chip (agy reports all five);
//   ② a RELOAD shows the same facts (the attach's chatStatus replays the journal's `usage` record);
//   ③ a claude chat on the same page: its context + cache, and ONE «not reported» chip naming what claude's stream does
//     not give the bar (the token total, the turn time) — never a blank, never a Σ it does not have.
// PNG: $VS_AGY_BAR_PNG (the bar after ①). Run: node scripts/test-agy-status-bar-chrome.mjs   (SKIPs without chrome)
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
const wt = scratch('agy-bar-chrome-wt');
const fakeHome = scratchHome('agy-bar-chrome-home', fs);
const stubDir = scratch('agy-bar-chrome-stub');
fs.mkdirSync(stubDir, { recursive: true });
const CWD = path.join(fakeHome, 'proj');
fs.mkdirSync(CWD, { recursive: true });
const SUMMARY = path.join(CWD, 'reports', 'summary.md');
let failed = 0, passed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin', 'scripts/fixtures/antigravity-agy', 'scripts/fixtures/antigravity-cli-1.4.3.json']) execSync(`rm -rf ${wt}/${f} && mkdir -p ${path.dirname(path.join(wt, f))} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });

// the agy: the FAKE agy itself (the measured stream + usage semantics + agy's own transcript under its HOME)
const agyPath = path.join(stubDir, 'agy');
fs.writeFileSync(agyPath, `#!${process.execPath}\nrequire(${JSON.stringify(path.join(wt, 'scripts/fixtures/antigravity-agy'))});\n`, { mode: 0o755 });
// the claude: one turn of the real stream-json shapes — an assistant message with its usage, a result naming the window
const CLAUDE_SID = '5c3a0000-0000-4000-8000-0000000ab001';
const claudePath = path.join(stubDir, 'claude');
fs.writeFileSync(claudePath, `#!${process.execPath}
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('2.1.274 (Claude Code) stub'); process.exit(0); }
if (args.includes('--help')) { console.log('Usage: claude [options]'); process.exit(0); }
const SID = ${JSON.stringify(CLAUDE_SID)};
const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
out({ type: 'system', subtype: 'init', session_id: SID, model: 'claude-fable-5', cwd: ${JSON.stringify(CWD)}, tools: [], permissionMode: 'default', claude_code_version: '2.1.274' });
let buf = '';
process.stdin.on('data', (d) => {
  buf += d; let i;
  while ((i = buf.indexOf('\\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    let m = null; try { m = JSON.parse(line); } catch {}
    if (!m || m.type !== 'user') continue;
    setTimeout(() => {
      out({ type: 'assistant', session_id: SID, uuid: 'cl-a1', message: { id: 'msg_cl1', type: 'message', role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text: 'Claude answered.' }], usage: { input_tokens: 2000, cache_read_input_tokens: 48000, cache_creation_input_tokens: 0, output_tokens: 40 } } });
      out({ type: 'result', subtype: 'success', is_error: false, duration_ms: 900, num_turns: 1, result: 'done', session_id: SID, total_cost_usd: 0, usage: { input_tokens: 2000, output_tokens: 40 }, modelUsage: { 'claude-fable-5': { inputTokens: 2000, outputTokens: 40, cacheReadInputTokens: 48000, cacheCreationInputTokens: 0, contextWindow: 200000, costUSD: 0 } } });
    }, 120);
  }
});
process.stdin.on('end', () => process.exit(0));
`, { mode: 0o755 });

const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, CLAUDE_CMD: claudePath, ANTIGRAVITY_CMD: agyPath, AGY_STUB_TRANSCRIPT: '1', VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' }, stdio: 'ignore' });
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu',
  '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-timer-throttling', `--user-data-dir=${wt}-chrome`, 'about:blank'], { stdio: 'ignore' });
let cleaned = false;
const cleanup = () => {
  if (cleaned) return; cleaned = true;
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv.kill('SIGKILL'); } catch {}
  for (const root of [wt, fakeHome, stubDir]) { try { endRootedProcesses(root); } catch {} } // dtach, the wrappers, the stubs carry one of these roots
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
const viewOf = (sidVar) => `([...(window.app.sessions?.values?.() || [])].find((v) => v && v._messageList && v.sessionId === window.${sidVar}))`;
// the bar's facts, as a person reads them: each chip's visible text + its title
const facts = (sidVar) => evalJs(`(() => { const v = ${viewOf(sidVar)}; const el = v && v._statusBar && v._statusBar.element; if (!el) return null; const c = (k) => { const e = el.querySelector('[data-chip="' + k + '"]'); return e ? { text: e.textContent.replace(/\\s+/g, ' ').trim(), title: e.getAttribute('title') || '' } : null; }; return { ctx: c('ctx'), unknown: c('ctx-unknown'), cache: c('cache'), odometer: c('odometer'), time: c('turn-time'), model: c('model'), unreported: c('unreported'), artifacts: el.querySelector('.chat-status-artifacts-text')?.textContent || null }; })()`);
let liveWs = null;
const createChat = async (sidVar, opts) => {
  const before = await evalJs(`[...app.sessions.values()].filter((v) => v && v._messageList).map((v) => v.sessionId)`);
  await evalJs(`app.createSession(${JSON.stringify(opts)}); true`);
  let sid = null;
  for (let i = 0; i < 80 && !sid; i++) { sid = await evalJs(`([...app.sessions.values()].find((v) => v && v._messageList && !${JSON.stringify(before)}.includes(v.sessionId))?.sessionId) || null`); if (!sid) await sleep(250); }
  if (sid) await evalJs(`window.${sidVar} = ${JSON.stringify(sid)}; true`);
  return sid;
};
const turn = async (sid, sidVar, text, doneRe) => {
  liveWs.send(JSON.stringify({ type: 'chat-input', sessionId: sid, text }));
  return waitFor(`(() => { const v = ${viewOf(sidVar)}; return !!v && [...v._messageList.querySelectorAll('.chat-msg')].some((e) => ${doneRe}.test(e.textContent)); })()`, 20000);
};
try {
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1500, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await waitApp();
  await sleep(800);
  liveWs = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  await new Promise((r) => liveWs.on('open', r));

  console.log('① an Antigravity chat: one turn that writes a file ⇒ the bar\'s five facts + the Artifacts chip');
  const agySid = await createChat('__agy', { cwd: CWD, name: 'agy-facts', mode: 'chat', backend: 'antigravity', model: 'gemini-4-argon-high' });
  check('an Antigravity chat is created through the page\'s own createSession (the fake agy behind the real agy-wrapper)', !!agySid);
  check('the turn played (the fake agy wrote reports/summary.md)', await turn(agySid, '__agy', 'please write the summary', /Antigravity \(gemini-4-argon-high/) && fs.existsSync(SUMMARY));
  await waitFor(`(() => { const v = ${viewOf('__agy')}; const el = v && v._statusBar && v._statusBar.element; return !!el && !!el.querySelector('[data-chip="odometer"]') && !!el.querySelector('[data-chip="ctx"]') && !!el.querySelector('.chat-status-artifacts-text'); })()`, 15000);
  const a = await facts('__agy');
  check('context: a % of the model\'s DOCUMENTED window (1.0m, gemini-4-argon) — the title names the window\'s source', a?.ctx && /^\S+ \d+%\[\d+\/1\.0m\]$|\d+%\s*\[\d+\/1\.0m\]/.test(a.ctx.text) && /documented window/.test(a.ctx.title) && !a.unknown, a);
  check('⚡ the cache hit rate of the turn\'s last call', a?.cache && /\d+%/.test(a.cache.text) && /Prompt cache hit rate/.test(a.cache.title), a?.cache);
  check('Σ the conversation\'s token total, as agy counts it, with the thinking share', a?.odometer && /^Σ\d+$/.test(a.odometer.text) && /thinking \d+ = \d+% of the total/.test(a.odometer.title), a?.odometer);
  check('the model it ran on + the turn\'s own time', a?.model && /gemini-4-argon-high/.test(a.model.text) && a?.time && /\d+s/.test(a.time.text) && /^The last turn took \d+s · it spent \d+ tokens \(in \d+, cached \d+, out \d+\) over (one model call|\d+ model calls)$/.test(a.time.title), { model: a?.model, time: a?.time });
  check('the Artifacts chip lists the file agy wrote (write_file, its absolute Path)', a?.artifacts === 'Artifacts · 1', a?.artifacts);
  check('…and no «not reported» chip: agy reports all five', !a?.unreported, a?.unreported);
  const listed = await evalJs(`fetch('/api/artifacts?sessionId=' + encodeURIComponent(window.__agy)).then((r) => r.json()).then((j) => JSON.stringify(j)).catch((e) => String(e))`);
  check('the server\'s Artifacts list names reports/summary.md (the ONE registry)', listed.includes('summary.md'), listed.slice(0, 400));
  if (process.env.VS_AGY_BAR_PNG) {
    const r = await evalJs(`(() => { const v = ${viewOf('__agy')}; const b = v._statusBar.element.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; })()`);
    const shot = await cdp('Page.captureScreenshot', { format: 'png', clip: { x: r.x, y: Math.max(0, r.y - 4), width: Math.min(r.w, 1500), height: r.h + 8, scale: 1 } });
    fs.writeFileSync(process.env.VS_AGY_BAR_PNG, Buffer.from(shot.data, 'base64'));
  }

  console.log('② a reload: the same facts from the journal (the attach\'s chatStatus)');
  await cdp('Page.reload', {}); // the onboarded preset added before the first navigate rides every reload
  await waitApp();
  await sleep(1000);
  // this harness restores no window on a reload (test-artifacts-chrome's precedent): the chat is re-attached by hand
  await evalJs(`window.__agy = ${JSON.stringify(agySid)}; if (!${viewOf('__agy')}) app.attachSession(${JSON.stringify(agySid)}, 'agy-facts', ${JSON.stringify(CWD)}, { mode: 'chat', backend: 'antigravity' }); true`);
  await waitFor(`(() => { const v = ${viewOf('__agy')}; const el = v && v._statusBar && v._statusBar.element; return !!el && !!el.querySelector('[data-chip="odometer"]') && !!el.querySelector('[data-chip="ctx"]'); })()`, 20000);
  const b = await facts('__agy');
  check('after the reload: the same context %, cache, Σ and turn time', b?.ctx?.text === a?.ctx?.text && b?.cache?.text === a?.cache?.text && b?.odometer?.text === a?.odometer?.text && b?.time?.text === a?.time?.text, { before: a, after: b });

  console.log('③ a claude chat: its context + cache, and «not reported» for what its stream does not give the bar');
  const clSid = await createChat('__cl', { cwd: CWD, name: 'claude-facts', mode: 'chat', backend: 'claude' });
  check('a claude chat is created (stub CLI behind the real chat-wrapper)', !!clSid);
  check('its turn played', await turn(clSid, '__cl', 'hello', /Claude answered/));
  await waitFor(`(() => { const v = ${viewOf('__cl')}; const el = v && v._statusBar && v._statusBar.element; return !!el && !!el.querySelector('[data-chip="ctx"]') && !!el.querySelector('[data-chip="unreported"]'); })()`, 15000);
  const c = await facts('__cl');
  check('claude: context 25% of the window its result names, ⚡96%', c?.ctx && /25%/.test(c.ctx.text) && c?.cache && /96%/.test(c.cache.text), c);
  check('claude: ONE «not reported» chip naming the token total and the turn time — no Σ, no time chip', c?.unreported?.text === 'not reported' && c.unreported.title === 'Not reported by this harness: token total, turn time' && !c.odometer && !c.time, c);
  check('no page error on the way', pageErrors.length === 0, pageErrors);
} catch (e) {
  failed++; console.error('✗ threw: ' + (e && e.stack || e));
} finally {
  try { liveWs?.close(); } catch {}
}
console.log(failed ? `\n${failed} FAILED (${passed} passed)` : `\nALL PASS (${passed})`);
process.exit(failed ? 1 : 0);
