#!/usr/bin/env node
// test-page-link-ui — B-2dbc SEEN (userW inc-murolahg-3rtv, 2.369.199): a
// `/p/<id>` page link in an assistant message OPENS the page. The path
// linkifier used to wrap the page link's own text again, so the pointer landed
// on the INNER path span: a click copied the bare "/p/…", Cmd+click probed it
// as a FILE and flashed "Not found". The node half is scripts/test-path-linkify ④⑤.
//
// A THROWAWAY server in a git worktree (own data/, a scratch HOME) + headless
// chrome over raw CDP (test-chat-hygiene-ui's skeleton). A stub `claude` runs
// behind the REAL chat-wrapper through the REAL create path; on the first user
// turn it answers with the incident's message plus a URL in a code span (the
// same defect's sibling: "//github.com/…" was a path span inside the URL).
//   ① the rendered message (the real sanitizer + renderer): no .chat-link
//      inside a .chat-link anywhere in the chat
//   ② a REAL click on the page link: the element under the pointer belongs to
//      the page link and the clipboard gets <origin>/p/<id>
//   ③ a REAL Cmd+click (Meta): a new tab opens on <origin>/p/<id>, no "Not
//      found" flash, the file probe (/api/file/info) is never asked
//   ④ a REAL click on the URL in the code span copies the whole URL
//   ⑤ CONTROL: the pre-fix rule re-installed on the live renderer
//      (_linkifyBareText = the old tag split), the same message rendered into
//      the same list ⇒ the click copies "/p/pg…" and Cmd+click flashes "Not
//      found" with no tab — the leg sees the incident (since lane
//      path-link-not-found the not-found end is a toast naming the path)
//   ⑥ lane path-link-not-found (userW inc-mv1tlrix-eklc): a REAL Cmd+click on
//      a path that does not exist ⇒ a toast with the full path + the machine,
//      on screen ≥ 6 s, one op-ring row (never the path); Copy path copies;
//      Open the nearest folder opens the explorer at the first existing
//      folder; the phone width keeps the words and puts the actions under them
//      (VS_PNG_DIR=<dir> writes desk.png / phone.png)
// Requires google-chrome (SKIP without). Run: node scripts/test-page-link-ui.mjs
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv } from './scratch.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port (never the machine-global :7/5901 — test-architecture §57)
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
const PAGE_ID = 'pg5vex1gylcn';
const GH = 'https://github.com/ProblemFactory/vibespace/pull/12';
const TEXT = `原型：VibeSpace 私有页 /p/${PAGE_ID}（文件 /home/userW/x/D-userWpay-dev/ap-system-prototype.html）\n\nThe change: \`${GH}\``;
const [PORT, CDP_PORT] = await freePorts(2);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const wt = scratch('page-link-ui-wt');
const fakeHome = scratchHome('page-link-ui-home', fs);
const stubDir = scratch('page-link-ui-stub');
fs.mkdirSync(stubDir, { recursive: true });
const CWD = path.join(fakeHome, 'proj');
fs.mkdirSync(CWD, { recursive: true });
const LIVE_SID = '5c3a0000-0000-4000-8000-00000000b2db';
let failed = 0, passed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── throwaway server in a worktree (overlays the built public/ + the working src/) ──
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
// The stub CLI (node, absolute shebang — agentEnv() strips unknown env, so every record it plays is baked into its text).
const stubPath = path.join(stubDir, 'claude');
const ANSWER = { type: 'assistant', message: { id: 'msg_pl1', type: 'message', role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text: TEXT }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } } };
fs.writeFileSync(stubPath, `#!${process.execPath}
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('2.1.274 (Claude Code) stub'); process.exit(0); }
if (args.includes('--help')) { console.log('Usage: claude [options]'); process.exit(0); }
const SID = ${JSON.stringify(LIVE_SID)};
const ANSWER = ${JSON.stringify(ANSWER)};
const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
out({ type: 'system', subtype: 'init', session_id: SID, model: 'claude-fable-5', cwd: ${JSON.stringify(CWD)}, tools: [], permissionMode: 'default', claude_code_version: '2.1.274' });
let buf = '';
process.stdin.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    let m = null; try { m = JSON.parse(line); } catch {}
    if (!m || m.type !== 'user') continue;
    setTimeout(() => {
      out({ ...ANSWER, session_id: SID, uuid: 'pl-1' });
      out({ type: 'result', subtype: 'success', is_error: false, duration_ms: 300, num_turns: 1, result: 'done', session_id: SID, total_cost_usd: 0, usage: { input_tokens: 1, output_tokens: 1 } });
    }, 200);
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
  // every process this suite caused carries one of these scratch paths (dtach, the wrapper, the stub, the worktree's daemon)
  for (const pat of [wt, fakeHome, stubDir]) { try { execSync(`pkill -9 -f ${JSON.stringify(pat)}`, { stdio: 'ignore' }); } catch {} }
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  for (const d of [wt, `${wt}-chrome`, fakeHome, stubDir]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });
for (let i = 0; i < 60; i++) { try { await fetch(`${ORIGIN}/api/home`); break; } catch { await sleep(250); } }

// ── raw CDP ─────────────────────────────────────────────────────────────────
const WebSocket = require('ws');
const pages = async () => { try { return (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).filter((x) => x.type === 'page'); } catch { return []; } };
let target = null;
for (let i = 0; i < 120 && !target; i++) { target = (await pages())[0] || null; if (!target) await sleep(250); }
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
  const id = ++seq; pend.set(id, (m) => m.error ? rej(new Error(m.error.message)) : res(m.result));
  sock.send(JSON.stringify({ id, method, params }));
});
const evalJs = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await evalJs(expr)) return true; await sleep(150); } return evalJs(expr); };
const waitApp = () => evalJs('new Promise((res, rej) => { const t0 = Date.now(); (function w() { if (window.app) return res(app.ready); if (Date.now() - t0 > 20000) return rej(new Error("no app after 20s")); setTimeout(w, 200); })(); })');
// the chat view of the live session (the page's own ChatView)
const VIEW = `([...(window.app.sessions?.values?.() || [])].find((v) => v && v._messageList && v.sessionId === window.__sid) || [...(window.app.sessions?.values?.() || [])].filter((v) => v && v._messageList).pop())`;
// A REAL pointer click (CDP input = a trusted event); modifiers 4 = Meta (Cmd)
const click = async (x, y, modifiers = 0) => {
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, modifiers });
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, modifiers });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, modifiers });
};
// Scroll a link into view, wait until its rect is STABLE, and say what the pointer would hit at the centre of its WIDEST line box (a link wraps in a narrow chat window)
const aim = async (sel) => {
  let last = null;
  for (let i = 0; i < 20; i++) {
    const r = await evalJs(`(() => { const el = ${sel}; if (!el) return null; if (!el.__aimed) { el.scrollIntoView({ block: 'center' }); el.__aimed = 1; } const b = [...el.getClientRects()].sort((p, q) => q.width - p.width)[0]; const x = Math.round(b.left + b.width / 2), y = Math.round(b.top + b.height / 2); const hit = document.elementFromPoint(x, y); return { x, y, w: Math.round(b.width), own: hit?.closest('.chat-link') === el, hit: hit ? hit.tagName + '.' + hit.className + ' ' + JSON.stringify(hit.dataset) : null }; })()`);
    if (r && last && r.x === last.x && r.y === last.y) return r;
    last = r; await sleep(120);
  }
  return last;
};
const flashes = (scope) => evalJs(`[...(${scope}).querySelectorAll('.chat-link-tooltip')].map((e) => e.textContent)`);
const pageTabs = async () => (await pages()).filter((p) => p.url.includes('/p/' + PAGE_ID));

try {
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.navigate', { url: `${ORIGIN}/` });
  await waitApp();
  await sleep(800);

  console.log('setup: a live stub session behind the real chat-wrapper answers with the incident\'s message');
  const liveWs = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  await new Promise((r) => liveWs.on('open', r));
  const frames = [];
  liveWs.on('message', (d) => { try { frames.push(JSON.parse(String(d))); } catch {} });
  liveWs.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: CWD, reqId: 'pl1' }));
  let sid = null;
  for (let i = 0; i < 80 && !sid; i++) { const f = frames.find((m) => m?.type === 'created'); if (f) sid = f.sessionId; else await sleep(250); }
  check('a live claude chat session is created through the real spawn path (stub CLI behind the real wrapper)', !!sid, frames.slice(-3).map((f) => JSON.stringify(f).slice(0, 200)).join('\n'));
  await evalJs(`window.__sid = ${JSON.stringify(sid)}; app.attachSession(${JSON.stringify(sid)}, 'page-link', ${JSON.stringify(CWD)}, { mode: 'chat', backend: 'claude' }); true`);
  check('the live chat window attaches', await waitFor(`!!document.querySelector('.chat-view .chat-input')`, 20000));
  await sleep(600);
  liveWs.send(JSON.stringify({ type: 'chat-input', sessionId: sid, text: 'Where is the prototype page?' }));
  const PAGE_LINK = `(${VIEW})._messageList.querySelector('.chat-msg .chat-link[data-href$="/p/${PAGE_ID}"]')`;
  check('the stub\'s answer rendered live with a page link in it', await waitFor(`!!${PAGE_LINK}`, 20000), await evalJs(`(() => { const v = ${VIEW}; return v ? v._messageList.innerHTML.slice(-900) : 'no view'; })()`));
  await sleep(500);
  // record what the handlers do: the clipboard, the file probe; window.open is the REAL one (a tab must appear)
  await evalJs(`(() => { window.__copied = []; navigator.clipboard.writeText = (s) => { window.__copied.push(s); return Promise.resolve(); };
    window.__probes = []; const f0 = window.fetch; window.fetch = (u, o) => { if (String(u).includes('/api/file/info')) window.__probes.push(String(u)); return f0(u, o); }; return true; })()`);

  console.log('① the rendered message: no link inside a link');
  const n1 = await evalJs(`(() => { const l = (${VIEW})._messageList; const p = ${PAGE_LINK};
    return { nested: l.querySelectorAll('.chat-link .chat-link, .chat-link a[href], a[href] .chat-link').length, links: l.querySelectorAll('.chat-link').length,
      href: p.dataset.href, path: p.dataset.path || null, kids: p.children.length, text: p.textContent }; })()`);
  check(`no .chat-link inside a .chat-link anywhere in the chat (${n1.links} links rendered)`, n1.nested === 0 && n1.links >= 3, n1);
  check('the page link is ONE span: data-href = <origin>/p/<id>, its text the bare path, no child element', n1.href === `${ORIGIN}/p/${PAGE_ID}` && !n1.path && n1.kids === 0 && n1.text === `/p/${PAGE_ID}`, n1);

  console.log('② a REAL click on the page link copies its URL');
  const a2 = await aim(PAGE_LINK);
  check('the element under the pointer belongs to the page link (not an inner path span)', a2?.own === true, a2);
  await click(a2.x, a2.y);
  await waitFor('window.__copied.length > 0', 3000);
  const c2 = await evalJs('window.__copied.slice()');
  check(`the clipboard gets the page URL ${ORIGIN}/p/${PAGE_ID} (it got the bare "/p/…")`, c2.length === 1 && c2[0] === `${ORIGIN}/p/${PAGE_ID}`, c2);

  console.log('③ a REAL Cmd+click opens the page');
  const tabs0 = (await pageTabs()).length;
  const a3 = await aim(PAGE_LINK);
  await click(a3.x, a3.y, 4);
  let tabs3 = [];
  for (let i = 0; i < 40 && tabs3.length <= tabs0; i++) { tabs3 = await pageTabs(); if (tabs3.length <= tabs0) await sleep(150); }
  await sleep(400);
  const f3 = await flashes(PAGE_LINK);
  const p3 = await evalJs('window.__probes.slice()');
  check(`a new tab opens on ${ORIGIN}/p/${PAGE_ID}`, tabs3.length === tabs0 + 1 && tabs3.some((t) => t.url === `${ORIGIN}/p/${PAGE_ID}`), tabs3.map((t) => t.url));
  check('no "Not found" flash, and the file probe was never asked', !f3.some((x) => /Not found/.test(x)) && p3.length === 0, { f3, p3 });
  for (const t of tabs3) { try { await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${t.id}`); } catch {} }

  console.log('④ the URL in a code span copies the whole URL');
  const URL_LINK = `(${VIEW})._messageList.querySelector('.chat-msg code .chat-link[data-href="${GH}"]')`;
  await evalJs('window.__copied.length = 0; true');
  const a4 = await aim(URL_LINK);
  check('the element under the pointer belongs to the URL link (it was a "//github.com/…" path span)', a4?.own === true, a4);
  if (a4) { await click(a4.x, a4.y); await waitFor('window.__copied.length > 0', 3000); }
  const c4 = await evalJs('window.__copied.slice()');
  check('the clipboard gets the whole URL', c4.length === 1 && c4[0] === GH, c4);

  console.log('⑤ CONTROL: the pre-fix rule on the live renderer');
  await evalJs(`(() => { const v = ${VIEW}; const r = v._renderers;
    r._linkifyBareText = (html, fn) => html.replace(/(<[^>]*>)|([^<]+)/g, (m, tag, txt) => (tag || !txt) ? m : fn(txt));
    const div = document.createElement('div'); div.className = 'chat-msg chat-msg-assistant vs-control'; div.innerHTML = r.renderMarkdown(${JSON.stringify(TEXT)});
    delete r._linkifyBareText; v._messageList.appendChild(div); window.__copied.length = 0; window.__probes.length = 0; return true; })()`);
  const CTRL = `(${VIEW})._messageList.querySelector('.vs-control .chat-link[data-href$="/p/${PAGE_ID}"]')`;
  const n5 = await evalJs(`(${VIEW})._messageList.querySelectorAll('.vs-control .chat-link .chat-link').length`);
  check(`the pre-fix rule nests links again (${n5} inner spans)`, n5 >= 2, n5);
  const a5 = await aim(CTRL);
  check('…the pointer lands on the INNER path span', a5?.own === false && /chat-link-path/.test(a5?.hit || ''), a5);
  await click(a5.x, a5.y);
  await waitFor('window.__copied.length > 0', 3000);
  const c5 = await evalJs('window.__copied.slice()');
  check('…a click copies the bare "/p/<id>" (the incident)', c5.length === 1 && c5[0] === `/p/${PAGE_ID}`, c5);
  const tabs5a = (await pageTabs()).length;
  await click(a5.x, a5.y, 4);
  const sawNotFound = await waitFor(`[...(${CTRL}).querySelectorAll('.chat-link-tooltip')].some((e) => /Not found/.test(e.textContent)) || [...document.querySelectorAll('#global-toasts .global-toast-body')].some((e) => e.textContent.includes('/p/${PAGE_ID}'))`, 4000);
  const tabs5 = (await pageTabs()).length;
  const p5 = await evalJs('window.__probes.slice()');
  check('…Cmd+click asks the file probe, says "not found" (the 1.2 s flash then, a toast naming /p/<id> now) and opens no tab (the incident)', sawNotFound && p5.some((u) => u.includes(encodeURIComponent(`/p/${PAGE_ID}`))) && tabs5 === tabs5a, { sawNotFound, p5, tabs5, tabs5a });
  console.log('⑥ a path that does not exist is SAID (lane path-link-not-found, userW inc-mv1tlrix-eklc)');
  const OUT = path.join(CWD, 'out');
  fs.mkdirSync(OUT, { recursive: true });
  const MISSING = path.join(OUT, 'gone', 'report.md');
  await evalJs(`(() => { document.getElementById('global-toasts')?.remove(); const v = ${VIEW}; const r = v._renderers;
    const div = document.createElement('div'); div.className = 'chat-msg chat-msg-assistant vs-missing'; div.innerHTML = r.renderMarkdown(${JSON.stringify('The report is at ' + MISSING + ' now.')});
    v._messageList.appendChild(div);
    window.__ops = []; const op0 = window.__vsOp; window.__vsOp = (n, d) => { window.__ops.push({ n, ...(d || {}) }); return op0 && op0(n, d); };
    window.__fe = []; const fe0 = app.openFileExplorer.bind(app); app.openFileExplorer = (p, o) => { window.__fe.push(p); return fe0(p, o); };
    window.__copied.length = 0; return true; })()`);
  const MISS_LINK = `(${VIEW})._messageList.querySelector('.vs-missing .chat-link-path')`;
  const TOAST = `[...document.querySelectorAll('#global-toasts .global-toast')].find((e) => e.textContent.includes(${JSON.stringify(MISSING)}))`;
  const btn = (label) => evalJs(`(() => { const e = ${TOAST}; const b = e && [...e.querySelectorAll('.global-toast-action')].find((x) => x.textContent === ${JSON.stringify(label)}); if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  const a6 = await aim(MISS_LINK);
  check('the missing path renders as ONE path link under the pointer', a6?.own === true, a6);
  await click(a6.x, a6.y, 4);
  check('a REAL Cmd+click on it ⇒ a toast naming the full path', await waitFor(`!!${TOAST}`, 5000));
  const tSeen = Date.now();
  const t6 = await evalJs(`(() => { const e = ${TOAST}; const acts = [...e.querySelectorAll('.global-toast-action')]; const r = e.getBoundingClientRect(); const a = acts[0].getBoundingClientRect(); const hit = document.elementFromPoint(a.left + a.width / 2, a.top + a.height / 2);
    return { body: e.querySelector('.global-toast-body').textContent, acts: acts.map((x) => x.textContent), cls: e.className, r: [r.left, r.top, r.right, r.bottom].map(Math.round), vw: innerWidth, vh: innerHeight, hitOwn: !!hit && e.contains(hit), flash: document.querySelectorAll('.vs-missing .chat-link-tooltip').length }; })()`);
  check('…in words: "No such file on this machine: <path> — the agent may have written it elsewhere or removed it"', t6.body === `No such file on this machine: ${MISSING} — the agent may have written it elsewhere or removed it`, t6);
  check('…with Copy path · Search by name · Open the nearest folder', JSON.stringify(t6.acts) === JSON.stringify(['Copy path', 'Search by name', 'Open the nearest folder']), t6.acts);
  check('…on screen and on top (its first action takes the pointer), no 1.2 s flash instead', t6.r[0] >= 0 && t6.r[2] <= t6.vw && t6.r[1] >= 0 && t6.r[3] <= t6.vh && t6.hitOwn && t6.flash === 0, t6);
  const ops6 = await evalJs('window.__ops.filter((o) => o.n === "link-open")');
  check('…and ONE op-ring row: path · not-found · the basename + the length, never the path', ops6.length === 1 && ops6[0].kind === 'path' && ops6[0].outcome === 'not-found' && ops6[0].base === 'report.md' && ops6[0].len === MISSING.length && !JSON.stringify(ops6).includes('/'), ops6);
  if (process.env.VS_PNG_DIR) fs.writeFileSync(path.join(process.env.VS_PNG_DIR, 'desk.png'), Buffer.from((await cdp('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await sleep(Math.max(0, 6200 - (Date.now() - tSeen)));
  check('…still showing after 6 s', await evalJs(`(() => { const e = ${TOAST}; return !!e && !e.classList.contains('global-toast-out') && getComputedStyle(e).opacity === '1'; })()`));
  const b1 = await btn('Copy path');
  await click(b1.x, b1.y);
  await waitFor('window.__copied.length > 0', 3000);
  const c6 = await evalJs('window.__copied.slice()');
  check('Copy path (a REAL click) copies the full path and closes the toast', c6.length === 1 && c6[0] === MISSING && !(await evalJs(`!!${TOAST}`)), c6);
  const nFe = await evalJs(`document.querySelectorAll('.file-explorer').length`);
  const a6b = await aim(MISS_LINK);
  await click(a6b.x, a6b.y, 4);
  await waitFor(`!!${TOAST}`, 5000);
  const b3 = await btn('Open the nearest folder');
  await click(b3.x, b3.y);
  const feOk = await waitFor(`window.__fe.length > 0 && document.querySelectorAll('.file-explorer').length > ${nFe}`, 8000);
  const fe6 = await evalJs('window.__fe.slice()');
  check('Open the nearest folder walks up (gone/ is missing too) and opens the explorer at the first folder that exists', feOk && fe6.length === 1 && fe6[0] === OUT, { feOk, fe6, OUT });
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(800);
  await evalJs(`(() => { document.getElementById('global-toasts')?.remove(); const v = ${VIEW}; return v._renderers._openLinkTarget(${MISS_LINK}, null, ${JSON.stringify(MISSING)}).then(() => true); })()`);
  await waitFor(`!!${TOAST}`, 5000);
  const t7 = await evalJs(`(() => { const e = ${TOAST}; const r = e.getBoundingClientRect(); const b = e.querySelector('.global-toast-body').getBoundingClientRect(); const acts = [...e.querySelectorAll('.global-toast-action')].map((x) => x.getBoundingClientRect());
    const x = e.querySelector('.global-toast-x').getBoundingClientRect(); return { r: [r.left, r.right].map(Math.round), bw: Math.round(b.width), vw: innerWidth, actsIn: acts.every((a) => a.left >= 0 && a.right <= innerWidth), below: acts.every((a) => a.top >= b.bottom - 1), xBeside: x.top < b.bottom && x.left >= b.right - 1 }; })()`);
  check('the phone (390 px): the toast fits, the words keep their width with the ✕ beside them, the actions sit under them', t7.r[0] >= 0 && t7.r[1] <= t7.vw && t7.bw >= 250 && t7.actsIn && t7.below && t7.xBeside, t7);
  await sleep(400); // past the toast's fade-in
  if (process.env.VS_PNG_DIR) fs.writeFileSync(path.join(process.env.VS_PNG_DIR, 'phone.png'), Buffer.from((await cdp('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  check('no page errors', pageErrors.length === 0, pageErrors);
} catch (e) {
  failed++; console.error('  ✗ the leg threw: ' + (e.stack || e.message));
}
console.log(failed ? `\n${failed} FAILED (${passed} passed)` : `\nALL PASS (${passed})`);
process.exit(failed ? 1 : 0);
