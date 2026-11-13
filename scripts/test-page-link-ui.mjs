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
//   ⑦ lane agy-links-file-url (the owner 2026-10-21, an Antigravity conversation:
//      «文件链接怎么都点不了»): Antigravity's `[SKILL.md](file:///…)` links through
//      the REAL sanitizer are path spans (decoded, no file: href in the DOM); a
//      REAL click copies the decoded path, a REAL Cmd+click asks the file probe
//      and opens it (a :12 at its line); a CJK-first relative path in a code span
//      opens against the session's cwd; a markup / javascript: link never becomes
//      one; the conversation:// link pinned as today (lane agy-subagent-cards);
//      CONTROL the base (the two steps off on the live renderer): the anchor has
//      no href and a click does nothing — what the owner saw
//   ⑧ lane file-preview-mount (userW inc-mvq7sdky-j0ed, 2.369.358: «窗口内打开 HTML 的时候，默认不展示 preview，总是
//      展示这个 raw，应该展示 preview»): a REAL Cmd+click on an .html path in an assistant message (the REAL chat
//      link-open: the file probe, app.openFile) opens the code editor's VIEW door — the PREVIEW shown (the frame host's
//      opaque frame: sandbox="allow-scripts", the host's address, the page handed in — never a srcdoc), the source
//      hidden, the toggle saying «Source»; a REAL press on «Source» shows the source; closed and opened again from the
//      link it opens as Source (the last mode chosen for the file); «Preview» pressed, it opens as the preview again;
//      the Edit door (app.openEditor) opens the source. RED on 6428c67e: the link opened the source.
//   ⑨ lane file-preview-mount (userW inc-mvq4hn9x, 2.369.358: «command 加点击打开 Excel 的时候会报错»): a REAL Cmd+click on
//      an .xlsx path draws the sheet viewer (both tabs, the cells — the route's rows now come from the SafeFs pool); a
//      refusal the hub SAYS (storage_sync_refused, the answer's shape pinned in test-file-preview-mount) reaches the
//      viewer in the reader's words — the storage's name, the release, the way on — never the `error` text kept for
//      agents. RED on 6428c67e: the viewer printed the `error` text (what userW saw, raw).
//      r2: a 60-sheet workbook's viewer SAYS the cuts the server made (the first 50 of 60 sheets, a long cell's first
//      2000 characters; another sheet: its first 256 columns) — RED on 19e1f74c: no word of a cut
//   ⑧ r2 (DECIDED by 主开发: an .html the agent wrote opens running, in the sandbox the Preview press used; the sandbox,
//      not a press, is the fence): pinned — sandbox="allow-scripts", no srcdoc, the folder door = the file's OWN folder
//   ⑩ r2 the line rule holds for an OPEN window too: page.html open as its preview in the chat's chain, a REAL Cmd+click
//      on `page.html:120` from the same chat shows the source in THAT window, line 120 the active line, the toggle
//      «Preview»; reopened from the plain link it opens as Source (the act kept the mode, as a press would). RED on
//      19e1f74c: the hidden editor moved, the preview stayed
//   ⑪ r2 the code editor says a refusal in the reader's words: a load the hub refused (storage_sync_refused) shows
//      fsErrorText's sentence, never the `error` kept for agents (RED on 19e1f74c: the raw `error`); a save the guard
//      refused keeps the write route's own words
// Requires google-chrome (SKIP without). Run: node scripts/test-page-link-ui.mjs
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv, realClicker } from './scratch.mjs';
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
  const THROTTLE = Number(process.env.VS_CPU_THROTTLE) || 0; // the hosted runner's shape (with FONTCONFIG_FILE = scratch.mjs runnerFontEnv)
  if (THROTTLE > 1) { await cdp('Emulation.setCPUThrottlingRate', { rate: THROTTLE }); console.log(`  (the page's CPU throttled ×${THROTTLE} — VS_CPU_THROTTLE)`); }
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

  console.log('⑦ Antigravity\'s file: links are paths (lane agy-links-file-url, the owner 2026-10-21: «文件链接怎么都点不了»)');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await sleep(800);
  const AGY_DIR = path.join(CWD, '标书研究');
  fs.mkdirSync(AGY_DIR, { recursive: true });
  const SKILL = path.join(AGY_DIR, 'SKILL.md'), PLAN = path.join(AGY_DIR, '方案.md'), AJS = path.join(CWD, 'a.js');
  for (const f of [SKILL, PLAN]) fs.writeFileSync(f, '# x\n');
  fs.writeFileSync(AJS, Array.from({ length: 20 }, (_, i) => `// line ${i + 1}`).join('\n') + '\n');
  const UUID = '49120000-0000-4000-8000-0000000000b1';
  const enc = (p) => p.split('/').map(encodeURIComponent).join('/');
  const XSS_PATH = '/tmp/a"><img src=x onerror=__xss=1>.md';
  // as Antigravity writes them (raw UTF-8), percent-encoded, a host part + :12, its subagent link, a CJK-first relative path, two hostile links
  const TEXT7 = `已完成 Skill（含[SKILL.md](file://${SKILL})、[方案](file://${enc(PLAN)})、[a.js](file://localhost${AJS}:12)）；子任务 [\`${UUID}\`](conversation://${UUID})；方案见 \`标书研究/方案.md\`。坏的：[x](file://${enc(XSS_PATH)}) [y](javascript:__xss=1)`;
  const render7 = (cls, base) => evalJs(`(() => { document.getElementById('global-toasts')?.remove(); const v = ${VIEW}; const r = v._renderers;
    if (${base}) { r._fileHrefs = (h) => h; r._pathAnchor = (a) => a; }
    const div = document.createElement('div'); div.className = 'chat-msg chat-msg-assistant ${cls}'; div.innerHTML = r.renderMarkdown(${JSON.stringify(TEXT7)});
    delete r._fileHrefs; delete r._pathAnchor; v._messageList.appendChild(div); return true; })()`);
  await render7('vs-agy', false);
  // the open road, recorded (not drawn — a viewer window would cover the next link): the file probe + app.openFile
  await evalJs(`(() => { window.__of = []; app.openFile = (p, n, o) => { window.__of.push([p, n, o && o.line]); }; window.__copied.length = 0; window.__probes.length = 0; return true; })()`);
  const d7 = await evalJs(`(() => { const l = (${VIEW})._messageList, box = l.querySelector('.vs-agy');
    return { ps: [...box.querySelectorAll('.chat-link-path:not(.chat-link-rel)')].map((e) => [e.dataset.path, e.textContent, e.title, e.children.length]),
      rel: [...box.querySelectorAll('.chat-link-rel')].map((e) => [e.dataset.rel, e.textContent]), anchors: [...box.querySelectorAll('a')].map((a) => a.outerHTML), subLinks: [...box.querySelectorAll('.chat-sub-link')].map((e) => [e.tagName, e.dataset.sub, e.classList.contains('chat-sub-unknown'), (e.querySelector('code') || {}).textContent, !!e.querySelector('.chat-sub-chip')]),
      fileHrefs: l.querySelectorAll('[href^="file:" i]').length, js: l.querySelectorAll('[href^="javascript:" i]').length, imgs: box.querySelectorAll('img').length, xss: typeof window.__xss }; })()`);
  const T7 = 'Click to copy, Ctrl+Click to open';
  check('through the REAL sanitizer each file: link is ONE path span: the decoded path, the link\'s text, «Click to copy, Ctrl+Click to open» (raw UTF-8, percent-encoded, file://localhost/…:12)',
    JSON.stringify(d7.ps.slice(0, 3)) === JSON.stringify([[SKILL, 'SKILL.md', T7, 0], [PLAN, '方案', T7, 0], [AJS + ':12', 'a.js', T7, 0]]), d7.ps);
  check('…no file: href anywhere in the chat\'s DOM', d7.fileHrefs === 0, d7);
  check('…the CJK-first relative path in a code span is a .chat-link-rel', JSON.stringify(d7.rel) === JSON.stringify([['标书研究/方案.md', '标书研究/方案.md']]), d7.rel);
  check('…a link whose decoded path carries markup is a path span holding it as TEXT (no <img>, nothing ran); a javascript: link keeps no href',
    JSON.stringify(d7.ps[3]) === JSON.stringify([XSS_PATH, 'x', T7, 0]) && d7.imgs === 0 && d7.xss === 'undefined' && d7.js === 0 && d7.anchors.includes('<a>y</a>'), d7);
  check(`PIN (lane agy-subagent-cards owns conversation://): [x](conversation://id) is a .chat-sub-link SPAN (data-sub, <code> inner), not an <a>; this id names no card in this page ⇒ chat-sub-unknown + the «unknown subagent» chip`, d7.subLinks.length === 1 && d7.subLinks[0][0] === 'SPAN' && d7.subLinks[0][1] === UUID && d7.subLinks[0][2] === true && d7.subLinks[0][3] === UUID && d7.subLinks[0][4] === true && !d7.anchors.some((a) => a.includes(UUID)), { subLinks: d7.subLinks, anchors: d7.anchors });
  const SKILL_LINK = `(${VIEW})._messageList.querySelector('.vs-agy .chat-link-path[data-path=' + JSON.stringify(${JSON.stringify(SKILL)}) + ']')`;
  const a7 = await aim(SKILL_LINK);
  check('the element under the pointer is the SKILL.md path span', a7?.own === true, a7);
  await click(a7.x, a7.y);
  await waitFor('window.__copied.length > 0', 3000);
  const c7 = await evalJs('window.__copied.slice()');
  check('a REAL click copies the DECODED path (as a bare path\'s click does)', c7.length === 1 && c7[0] === SKILL, c7);
  await click(a7.x, a7.y, 4);
  await waitFor('window.__of.length > 0', 5000);
  const o7 = await evalJs('({ of: window.__of.slice(), probes: window.__probes.slice() })');
  check('a REAL Cmd+click asks the file probe for the decoded path and opens it in the viewer', o7.probes.some((u) => u.includes('path=' + encodeURIComponent(SKILL))) && JSON.stringify(o7.of) === JSON.stringify([[SKILL, 'SKILL.md', null]]), o7);
  await evalJs('window.__of.length = 0; true');
  const a7b = await aim(`(${VIEW})._messageList.querySelector('.vs-agy .chat-link-path[data-path$="a.js:12"]')`);
  await click(a7b.x, a7b.y, 4);
  await waitFor('window.__of.length > 0', 5000);
  const o7b = await evalJs('window.__of.slice()');
  check('…file://localhost/…/a.js:12 opens a.js at line 12', JSON.stringify(o7b) === JSON.stringify([[AJS, 'a.js', 12]]), o7b);
  await evalJs('window.__of.length = 0; true');
  const a7c = await aim(`(${VIEW})._messageList.querySelector('.vs-agy .chat-link-rel')`);
  await click(a7c.x, a7c.y, 4);
  await waitFor('window.__of.length > 0', 5000);
  const o7c = await evalJs('window.__of.slice()');
  check('…a REAL Cmd+click on 标书研究/方案.md opens it against the session\'s cwd', JSON.stringify(o7c) === JSON.stringify([[PLAN, '方案.md', null]]), o7c);
  await render7('vs-agy-base', true);
  await evalJs('window.__of.length = 0; window.__copied.length = 0; window.__probes.length = 0; true');
  const b7 = await evalJs(`(() => { const box = (${VIEW})._messageList.querySelector('.vs-agy-base'); return { anchors: [...box.querySelectorAll('a')].map((a) => a.outerHTML), paths: box.querySelectorAll('.chat-link-path:not(.chat-link-rel)').length }; })()`);
  check('CONTROL (the base: the two steps off on the live renderer): the real sanitizer leaves each file: link a bare <a> with no href, no path span', b7.paths === 0 && ['<a>SKILL.md</a>', '<a>方案</a>', '<a>a.js</a>'].every((x) => b7.anchors.includes(x)), b7);
  const a7d = await aim(`[...(${VIEW})._messageList.querySelectorAll('.vs-agy-base a')].find((a) => a.textContent === 'SKILL.md')`);
  await click(a7d.x, a7d.y);
  await click(a7d.x, a7d.y, 4);
  await sleep(1200);
  const n7 = await evalJs('({ copied: window.__copied.length, probes: window.__probes.length, of: window.__of.length })');
  check('…a REAL click and a REAL Cmd+click on it do nothing — nothing copied, nothing asked, nothing opened («点不了»)', n7.copied === 0 && n7.probes === 0 && n7.of === 0, n7);

  console.log('⑧ an HTML page opened from a chat path link shows its PREVIEW first (lane file-preview-mount, userW inc-mvq7sdky-j0ed)');
  const HTML = path.join(CWD, 'report', '季度看板.html');
  fs.mkdirSync(path.dirname(HTML), { recursive: true });
  fs.writeFileSync(HTML, '<!doctype html><html><body><h1 id="fpm-mark">看板 preview</h1><script>document.body.dataset.ran = "1"</script></body></html>\n');
  await evalJs(`(() => { delete app.openFile; document.getElementById('global-toasts')?.remove(); const v = ${VIEW};
    const div = document.createElement('div'); div.className = 'chat-msg chat-msg-assistant vs-fpm'; div.innerHTML = v._renderers.renderMarkdown(${JSON.stringify(`看板已生成：${HTML}`)}); v._messageList.appendChild(div); return true; })()`);
  const RC = realClicker({ evalJs, cdp });
  const HWIN = `[...app.wm.windows.values()].filter((w) => w._filePath === ${JSON.stringify(HTML)}).pop()`;
  const htmlView = () => evalJs(`(() => { const w = ${HWIN}; if (!w) return null; const R = w.content || w.element; R.dataset.fpm = '1';
    const pb = R.querySelector('.markdown-preview'), eb = R.querySelector('.cm-editor')?.closest('.editor-body'), f = pb?.querySelector('iframe'), b = R.querySelector('.editor-preview-toggle') || [...R.querySelectorAll('button')].find((x) => ['Preview', 'Edit', 'Source'].includes(x.textContent));
    const shown = (e) => !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0;
    return { type: w.type, action: w._openSpec?.action || null, preview: shown(pb), editor: shown(eb), cm: !!R.querySelector('.cm-content'), btn: b ? b.textContent : null,
      frame: f ? { sandbox: f.getAttribute('sandbox'), src: f.getAttribute('src'), srcdoc: f.hasAttribute('srcdoc'), doc: typeof f.__frameDoc === 'string' && f.__frameDoc.includes('fpm-mark') } : null }; })()`);
  const closeHtml = () => evalJs(`(() => { for (const w of [...app.wm.windows.values()]) if (w._filePath === ${JSON.stringify(HTML)}) app.wm.closeWindow(w.id); return true; })()`);
  const openFromLink = async () => {
    await closeHtml(); await sleep(400);
    const a8 = await aim(`(${VIEW})._messageList.querySelector('.vs-fpm .chat-link-path[data-path=' + JSON.stringify(${JSON.stringify(HTML)}) + ']')`);
    if (!a8?.own) return { aimed: a8 };
    await click(a8.x, a8.y, 4);
    await waitFor(`(() => { const w = ${HWIN}; return !!(w && (w.content || w.element).querySelector('.cm-content')); })()`, 15000);
    await sleep(800);
    return htmlView();
  };
  const v1 = await openFromLink();
  check('a REAL Cmd+click on the .html path opens it (the real chat link-open + app.openFile) — and it shows the PREVIEW, the source hidden, the toggle saying «Source»',
    v1 && v1.type === 'editor' && v1.action === 'openFile' && v1.preview === true && v1.editor === false && v1.btn === 'Source', v1);
  check('…the preview is the frame host\'s opaque frame: sandbox="allow-scripts", the host\'s preview address, the page handed in — never a srcdoc',
    v1?.frame?.sandbox === 'allow-scripts' && /^\/frame-host\?kind=preview&base=/.test(v1.frame.src || '') && v1.frame.srcdoc === false && v1.frame.doc === true, v1?.frame);
  const base1 = v1?.frame?.src ? new URLSearchParams(v1.frame.src.split('?')[1] || '').get('base') : null;
  check('…its folder door is the page\'s OWN folder, never a parent — the sandbox, not a press, is the fence (DECIDED, r2)', base1 === path.dirname(HTML), { base1, want: path.dirname(HTML) });
  const pressed1 = await RC('[data-fpm="1"] .editor-preview-toggle');
  await sleep(500);
  const v2 = await htmlView();
  check('a REAL press on «Source» shows the source (the preview hidden, the toggle saying «Preview»)', pressed1 && v2?.editor === true && v2.preview === false && v2.btn === 'Preview', { pressed1, miss: RC.lastMiss, v2 });
  const v3 = await openFromLink();
  check('closed and opened again from the link: it opens as SOURCE — the last mode chosen for the file', v3?.editor === true && v3.preview === false && v3.btn === 'Preview', v3);
  const pressed3 = await RC('[data-fpm="1"] .editor-preview-toggle');
  await sleep(500);
  const v4 = await openFromLink();
  check('«Preview» pressed, then opened again: the preview again', pressed3 && v4?.preview === true && v4.editor === false && v4.btn === 'Source', { pressed3, v4 });
  await closeHtml(); await sleep(300);
  await evalJs(`(() => { app.openEditor(${JSON.stringify(HTML)}, '季度看板.html'); return true; })()`);
  await waitFor(`(() => { const w = ${HWIN}; return !!(w && (w.content || w.element).querySelector('.cm-content')); })()`, 15000);
  await sleep(600);
  const v5 = await htmlView();
  check('the Edit door (app.openEditor) opens the SOURCE, its toggle «Preview»', v5?.editor === true && v5.preview === false && v5.btn === 'Preview' && v5.action === 'openEditor', v5);
  await closeHtml();

  console.log('⑨ an .xlsx opened from a chat path link draws its sheets; a refusal reaches the viewer SAID (lane file-preview-mount, userW inc-mvq4hn9x)');
  const XLSX = require('xlsx');
  const BOOK = path.join(CWD, 'report', '季度报表.xlsx');
  const wb9 = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb9, XLSX.utils.aoa_to_sheet([['项目', 'Q1', 'Q2'], ['收入', 120, 135.5]]), '汇总');
  XLSX.utils.book_append_sheet(wb9, XLSX.utils.aoa_to_sheet([['id', 'name'], [2, 'ベータ']]), 'Rows');
  fs.writeFileSync(BOOK, XLSX.write(wb9, { type: 'buffer', bookType: 'xlsx' }));
  await evalJs(`(() => { const v = ${VIEW}; const div = document.createElement('div'); div.className = 'chat-msg chat-msg-assistant vs-fpm9'; div.innerHTML = v._renderers.renderMarkdown(${JSON.stringify(`报表：${BOOK}`)}); v._messageList.appendChild(div); return true; })()`);
  const XWIN = `[...app.wm.windows.values()].filter((w) => w._filePath === ${JSON.stringify(BOOK)}).pop()`;
  const openBook = async () => {
    await evalJs(`(() => { for (const w of [...app.wm.windows.values()]) if (w._filePath === ${JSON.stringify(BOOK)}) app.wm.closeWindow(w.id); return true; })()`); await sleep(400);
    const a9 = await aim(`(${VIEW})._messageList.querySelector('.vs-fpm9 .chat-link-path[data-path=' + JSON.stringify(${JSON.stringify(BOOK)}) + ']')`);
    if (!a9?.own) return { aimed: a9 };
    await click(a9.x, a9.y, 4);
    await waitFor(`(() => { const w = ${XWIN}; return !!(w && (w.content || w.element).querySelector('.sheet-viewer, .empty-hint')); })()`, 15000);
    return evalJs(`(() => { const w = ${XWIN}; if (!w) return null; const R = w.content || w.element; return { type: w.type, tabs: [...R.querySelectorAll('.sheet-tab')].map((e) => e.textContent), cells: [...R.querySelectorAll('.file-viewer-table tr')].map((tr) => [...tr.children].map((c) => c.textContent)), hint: R.querySelector('.empty-hint')?.textContent || null }; })()`);
  };
  const x1 = await openBook();
  check('a REAL Cmd+click on the .xlsx path draws the sheet viewer — both tabs, the first sheet\'s cells', x1?.type === 'viewer' && JSON.stringify(x1.tabs) === JSON.stringify(['汇总', 'Rows']) && JSON.stringify(x1.cells) === JSON.stringify([['项目', 'Q1', 'Q2'], ['收入', '120', '135.5']]) && !x1.hint, x1);
  await evalJs(`(() => { window.__fetch0 = window.fetch; window.fetch = (u, o) => String(u).startsWith('/api/file/excel') ? Promise.resolve(new Response(JSON.stringify({ error: 'the hub’s English for agents', code: 'storage_sync_refused', params: { mount: 'NAS', release: '2.369.360' } }), { status: 400, headers: { 'content-type': 'application/json' } })) : window.__fetch0(u, o); return true; })()`);
  const x2 = await openBook();
  await evalJs('(() => { window.fetch = window.__fetch0; return true; })()');
  check('a refusal the hub SAID (storage_sync_refused) reaches the viewer in the reader\'s words — «NAS», the release, the way on — never the `error` kept for agents',
    x2?.hint === 'Error: this file is on the storage mount «NAS»; VibeSpace does not read mounts from its main thread — the preview road is being fixed (2.369.360); open the file from the Files window or copy it to a local folder', x2);
  await evalJs(`(() => { for (const w of [...app.wm.windows.values()]) if (w._filePath === ${JSON.stringify(BOOK)}) app.wm.closeWindow(w.id); return true; })()`);
  const BOOK60 = path.join(CWD, 'report', '六十张.xlsx');
  const wb60 = XLSX.utils.book_new();
  for (let i = 0; i < 60; i++) XLSX.utils.book_append_sheet(wb60, XLSX.utils.aoa_to_sheet(i === 0 ? [['k', 'v'], ['long', 'x'.repeat(2500)]] : i === 1 ? [Array.from({ length: 300 }, (_, c) => c)] : [['n'], [i]]), 'S' + i);
  fs.writeFileSync(BOOK60, XLSX.write(wb60, { type: 'buffer', bookType: 'xlsx' }));
  await evalJs(`(() => { const v = ${VIEW}; const div = document.createElement('div'); div.className = 'chat-msg chat-msg-assistant vs-fpm9b'; div.innerHTML = v._renderers.renderMarkdown(${JSON.stringify(`六十张：${BOOK60}`)}); v._messageList.appendChild(div); return true; })()`);
  const X60 = `[...app.wm.windows.values()].filter((w) => w._filePath === ${JSON.stringify(BOOK60)}).pop()`;
  const cutView = () => evalJs(`(() => { const w = ${X60}; if (!w) return null; const R = w.content || w.element; R.dataset.fpm9b = '1'; const n = R.querySelector('.sheet-cut');
    return { tabs: R.querySelectorAll('.sheet-tab').length, active: R.querySelector('.sheet-tab.active')?.textContent || null, note: n && getComputedStyle(n).display !== 'none' ? n.textContent : null, cols: R.querySelector('.file-viewer-table tr')?.children.length || 0 }; })()`);
  const a9b = await aim(`(${VIEW})._messageList.querySelector('.vs-fpm9b .chat-link-path[data-path=' + JSON.stringify(${JSON.stringify(BOOK60)}) + ']')`);
  if (a9b?.own) await click(a9b.x, a9b.y, 4);
  await waitFor(`(() => { const w = ${X60}; return !!(w && (w.content || w.element).querySelector('.sheet-viewer, .empty-hint')); })()`, 15000);
  const k60a = await cutView();
  check('r2: a 60-sheet workbook\'s viewer SAYS the cuts the server made — the first 50 of 60 sheets, a long cell\'s first 2000 characters',
    k60a?.tabs === 50 && k60a.note === 'Showing part of this workbook: the first 50 of 60 sheets · the first 2000 characters of a long cell', { aimed: a9b, k60a });
  const pressed9b = await RC('[data-fpm9b="1"] .sheet-tab:nth-child(2)');
  await sleep(400);
  const k60b = await cutView();
  check('…a REAL press on the second sheet\'s tab: its own cut said — the first 256 columns (of 300)',
    pressed9b && k60b?.active === 'S1' && k60b.cols === 256 && k60b.note === 'Showing part of this workbook: the first 256 columns · the first 50 of 60 sheets', { pressed9b, miss: RC.lastMiss, k60b });
  await evalJs(`(() => { for (const w of [...app.wm.windows.values()]) if (w._filePath === ${JSON.stringify(BOOK60)}) app.wm.closeWindow(w.id); return true; })()`);

  console.log('⑩ a path:line link to a page OPEN as its preview leaves the preview, then jumps (r2 — the line rule holds for an open window too)');
  const LONG = path.join(CWD, 'report', '长页.html');
  fs.writeFileSync(LONG, '<!doctype html><html><body>\n' + Array.from({ length: 200 }, (_, i) => `<p>line ${i + 2}</p>`).join('\n') + '\n</body></html>\n');
  await evalJs(`(() => { const v = ${VIEW}; const div = document.createElement('div'); div.className = 'chat-msg chat-msg-assistant vs-fpm10'; div.innerHTML = v._renderers.renderMarkdown(${JSON.stringify(`长页：${LONG}

第 120 行：${LONG}:120`)}); v._messageList.appendChild(div); return true; })()`);
  const LWINS = `[...app.wm.windows.values()].filter((w) => w._filePath === ${JSON.stringify(LONG)})`;
  const longView = () => evalJs(`(() => { const ws = ${LWINS}; const w = ws[ws.length - 1]; if (!w) return null; const R = w.content || w.element;
    const pb = R.querySelector('.markdown-preview'), eb = R.querySelector('.cm-editor')?.closest('.editor-body'), b = R.querySelector('.editor-preview-toggle');
    const shown = (e) => !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0;
    return { n: ws.length, id: w.id, preview: shown(pb), editor: shown(eb), btn: b ? b.textContent : null, gutter: R.querySelector('.cm-activeLineGutter')?.textContent || null, line: R.querySelector('.cm-activeLine')?.textContent || null }; })()`);
  const closeLong = () => evalJs(`(() => { for (const w of ${LWINS}) app.wm.closeWindow(w.id); return true; })()`);
  const linkTo = async (dp) => {
    const a = await aim(`(${VIEW})._messageList.querySelector('.vs-fpm10 .chat-link-path[data-path=' + JSON.stringify(${JSON.stringify(dp)}) + ']')`);
    if (!a?.own) return a;
    await click(a.x, a.y, 4);
    return true;
  };
  const l0 = await linkTo(LONG);
  await waitFor(`(() => { const w = ${LWINS}.pop(); return !!(w && (w.content || w.element).querySelector('.cm-content')); })()`, 15000);
  await sleep(800);
  const L1 = await longView();
  check('the page opened from its plain link shows its PREVIEW (the view door)', l0 === true && L1?.n === 1 && L1.preview === true && L1.editor === false && L1.btn === 'Source', { l0, L1 });
  const l1 = await linkTo(`${LONG}:120`);
  await waitFor(`(() => { const w = ${LWINS}.pop(); const R = w && (w.content || w.element); return !!R && R.querySelector('.cm-activeLineGutter')?.textContent === '120' && getComputedStyle(R.querySelector('.cm-editor').closest('.editor-body')).display !== 'none'; })()`, 6000);
  await sleep(300);
  const L2 = await longView();
  check('a REAL Cmd+click on `长页.html:120` from the same chat shows the SOURCE in that same window — line 120 the active line, the preview hidden, the toggle «Preview»',
    l1 === true && L2?.n === 1 && L2.id === L1?.id && L2.editor === true && L2.preview === false && L2.btn === 'Preview' && L2.gutter === '120' && L2.line === '<p>line 120</p>', { l1, L2 });
  await closeLong(); await sleep(400);
  const l2 = await linkTo(LONG);
  await waitFor(`(() => { const w = ${LWINS}.pop(); return !!(w && (w.content || w.element).querySelector('.cm-content')); })()`, 15000);
  await sleep(800);
  const L3 = await longView();
  check('…closed and opened again from the plain link: it opens as SOURCE — the jump kept the mode for the file, as a press would', l2 === true && L3?.editor === true && L3.preview === false && L3.btn === 'Preview', { l2, L3 });
  await closeLong();

  console.log('⑪ the code editor says a refusal in the reader\'s words — a load refused (storage_sync_refused); a save keeps the write route\'s own words (r2)');
  const TXT = path.join(CWD, 'report', 'notes.txt');
  fs.writeFileSync(TXT, 'hello\n');
  const TWIN = `[...app.wm.windows.values()].filter((w) => w._filePath === ${JSON.stringify(TXT)}).pop()`;
  const closeTxt = () => evalJs(`(() => { for (const w of [...app.wm.windows.values()]) if (w._filePath === ${JSON.stringify(TXT)}) app.wm.closeWindow(w.id); return true; })()`);
  const stub = (prefix, body) => evalJs(`(() => { window.__fetch1 = window.__fetch1 || window.fetch; window.fetch = (u, o) => String(u).startsWith(${JSON.stringify(prefix)}) ? Promise.resolve(new Response(JSON.stringify(${JSON.stringify(body)}), { status: 400, headers: { 'content-type': 'application/json' } })) : window.__fetch1(u, o); return true; })()`);
  const unstub = () => evalJs('(() => { if (window.__fetch1) window.fetch = window.__fetch1; delete window.__fetch1; return true; })()');
  await stub('/api/file/content', { error: 'the hub’s English for agents', code: 'storage_sync_refused', params: { mount: 'NAS', release: '2.369.360' } });
  await evalJs(`(() => { app.openEditor(${JSON.stringify(TXT)}, 'notes.txt'); return true; })()`);
  await waitFor(`(() => { const w = ${TWIN}; return !!(w && (w.content || w.element).querySelector('.empty-hint, .cm-content')); })()`, 15000);
  const e1 = await evalJs(`(() => { const w = ${TWIN}; const R = w && (w.content || w.element); return R ? { hint: R.querySelector('.empty-hint')?.textContent || null, cm: !!R.querySelector('.cm-content') } : null; })()`);
  await unstub();
  check('a load the hub refused (storage_sync_refused) says fsErrorText\'s sentence — «NAS», the release, the way on — never the `error` kept for agents',
    e1?.hint === 'this file is on the storage mount «NAS»; VibeSpace does not read mounts from its main thread — the preview road is being fixed (2.369.360); open the file from the Files window or copy it to a local folder' && !e1.cm, e1);
  await closeTxt(); await sleep(300);
  await evalJs(`(() => { app.openEditor(${JSON.stringify(TXT)}, 'notes.txt'); return true; })()`);
  await waitFor(`(() => { const w = ${TWIN}; const R = w && (w.content || w.element); if (R) R.dataset.fpm11 = '1'; return !!(R && R.querySelector('.cm-content')); })()`, 15000);
  await sleep(400);
  await stub('/api/file/write', { error: 'refused: a synchronous fs call on a storage mount from the main thread' });
  const pressed11 = await RC('[data-fpm11="1"] button[title="Save (Ctrl+S)"]');
  await waitFor(`(() => { const w = ${TWIN}; return /✕/.test((w.content || w.element).querySelector('.save-indicator')?.textContent || ''); })()`, 5000);
  const e2 = await evalJs(`(() => { const w = ${TWIN}; return (w.content || w.element).querySelector('.save-indicator')?.textContent || null; })()`);
  await unstub();
  check('a REAL press on Save the guard refused: the write route\'s own words, never the preview\'s sentence', pressed11 && e2 === '✕ refused: a synchronous fs call on a storage mount from the main thread', { pressed11, miss: RC.lastMiss, e2 });
  await closeTxt();
  check('no page errors', pageErrors.length === 0, pageErrors);
} catch (e) {
  failed++; console.error('  ✗ the leg threw: ' + (e.stack || e.message));
}
console.log(failed ? `\n${failed} FAILED (${passed} passed)` : `\nALL PASS (${passed})`);
process.exit(failed ? 1 : 0);
