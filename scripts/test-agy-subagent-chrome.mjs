#!/usr/bin/env node
// AN ANTIGRAVITY SUBAGENT ON A REAL PAGE (lane agy-subagent-cards, 2026-10-21 — the owner, in an Antigravity conversation:
// «使用子代理的时候怎么没有子代理卡片查看细节» / «子代理细节不在你设计的harness框架里吗？»). A worktree server, a STUB agy (scripts/
// fixtures/antigravity-agy: the invoke_subagent row + subagent_info the owner's journal recorded) behind the REAL
// data/bin/agy-wrapper.js, the server's HOME holding a FIXTURE agy store (scripts/fixtures/agy-store — copied in SHAPE
// from the owner's, names/texts replaced) whose subagent has answered and written report.md, and headless Chrome over
// raw CDP. No vendor call.
//   K1 THE CARD in the parent chat: the subagent's role and type, its state, how long it ran, the task the parent gave
//      (folded), its answer, the file it wrote — every store string escaped (a <b> in the role stays text)
//   K2 a REAL click on «Open timeline» opens the sub's own timeline — the virtual session sub-<id>: the task as a bubble
//      from the parent, its tool cards (read_file, run_command, write_file, send_message), its last words
//   K3 the agent's text links its subagent as [`<id>`](conversation://<id>): the link is ours (.chat-link, data-sub) and
//      a real click opens THAT sub's timeline; a link to a sub this conversation does not know carries the chip that
//      says so; the same click on the link WRAPPED across two lines (the runner's DejaVu breaks the id at a hyphen —
//      forced here by narrowing its paragraph) still opens it, and the CONTROL shows the old aim (the centre of the
//      link's union box, on the paragraph between its two pieces) pressing nothing
//   K4 the Artifacts chip counts the file the SUB wrote (the helper door read its transcript in the store), and its
//      card names it
//   K5 CONTROL: the same page on the PRE-LANE normalizer (its `subagent` case removed in the scratch worktree, the
//      server restarted): no card, no timeline button — the row is a plain tool row (the owner's state); the legs above
//      can go red
// Requires google-chrome + dtach (SKIP without). Run: node scripts/test-agy-subagent-chrome.mjs
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
const VNC_ENV = await vncEnv();
const require = createRequire(import.meta.url);

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
try { execSync('command -v dtach', { stdio: 'ignore', shell: '/bin/bash' }); } catch { console.log('SKIP: dtach is not installed — a chat session cannot be created here'); process.exit(0); }

const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('agy-sub-chrome-wt');
const fakeHome = scratchHome('agy-sub-chrome-home', fs);
const stubDir = scratch('agy-sub-chrome-stub');
fs.rmSync(stubDir, { recursive: true, force: true });
fs.mkdirSync(stubDir, { recursive: true });
const CWD = path.join(fakeHome, 'proj');
fs.mkdirSync(CWD, { recursive: true });
let failed = 0, passed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 700) : ''}`); } return !!c; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── the fixture store in the server's HOME (the machine's own Antigravity login = HOME) ──
const P = '9c0f0000-0000-4000-8000-0000000000a1', S = '49120000-0000-4000-8000-0000000000b1', UNKNOWN = 'dead0000-0000-4000-8000-00000000beef', SG = '.system_generated';
const FIXS = path.join(repo, 'scripts/fixtures/agy-store');
const store = path.join(fakeHome, '.gemini', 'antigravity-cli');
fs.mkdirSync(store, { recursive: true });
fs.cpSync(path.join(FIXS, 'brain'), path.join(store, 'brain'), { recursive: true });
fs.copyFileSync(path.join(FIXS, 'answer.json'), path.join(store, 'brain', P, SG, 'messages', 'c0000000-0000-4000-8000-0000000000c3.json'));
// the role carries markup: a store string is the AGENT's, so the card must show it as text
const ROLE = '示例评审专家 <b>bold</b>';
const subJson = path.join(store, 'brain', P, SG, 'subagents', `${S}.json`);
fs.writeFileSync(subJson, fs.readFileSync(subJson, 'utf8').replace('"role": "示例评审专家"', `"role": ${JSON.stringify(ROLE)}`));

// ── the stub agy: the fixture's fake agy on THIS conversation (its store), the spawn at the task's step ──
const stubPath = path.join(stubDir, 'agy');
fs.writeFileSync(stubPath, `#!${process.execPath}
process.env.AGY_STUB_CID = ${JSON.stringify(P)}; process.env.AGY_STUB_SPAWN_STEP = '6'; process.env.AGY_STUB_SUB_ROLE = ${JSON.stringify(ROLE)};
require(${JSON.stringify(path.join(repo, 'scripts/fixtures/antigravity-agy'))});
`, { mode: 0o755 });

// ── throwaway server in a scratch worktree (overlays the working src/ + the built public/) ──
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin']) execSync(`rm -rf ${wt}/${f} && mkdir -p ${path.dirname(`${wt}/${f}`)} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
let srv = null;
const SRV_LOG = path.join(stubDir, 'server.log');
const startServer = () => { const fd = fs.openSync(SRV_LOG, 'a'); srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, ANTIGRAVITY_CMD: stubPath, CLAUDE_CMD: '/bin/false', VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' }, stdio: ['ignore', fd, fd] }); fs.closeSync(fd); };
const waitServer = async () => { for (let i = 0; i < 120; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); return true; } catch { await sleep(250); } } return false; };
startServer();
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu',
  '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-timer-throttling', `--user-data-dir=${wt}-chrome`, 'about:blank'], { stdio: 'ignore' });
let cleaned = false;
const cleanup = () => {
  if (cleaned) return; cleaned = true;
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv && srv.kill('SIGKILL'); } catch {}
  for (const root of [wt, fakeHome, stubDir]) { try { endRootedProcesses(root); } catch { } } // dtach, the wrapper, the stub agy — every process this suite caused runs under one of these roots
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  for (const d of [wt, `${wt}-chrome`, fakeHome, stubDir]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });
await waitServer();

// ── raw CDP ──
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
const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await evalJs(expr)) return true; } catch {} await sleep(150); } try { return await evalJs(expr); } catch { return false; } };
const waitApp = () => evalJs('new Promise((res, rej) => { const t0 = Date.now(); (function w() { if (window.app) return res(app.ready); if (Date.now() - t0 > 20000) return rej(new Error("no app after 20s")); setTimeout(w, 200); })(); })');
/** A REAL click at the element's centre that the ELEMENT received (a layout that moves between the measure and the press —
 *  an auto-opened document tiling beside the chat — is measured again, up to 4 times). The centre is that of one of the
 *  element's OWN boxes (getClientRects): an inline link that wraps has two, and the centre of their union box is the
 *  paragraph between them — the 2.369.341 runner red, where the id broke at a hyphen in DejaVu (ci-341-reds). */
const realClickEl = async (expr) => {
  for (let i = 0; i < 4; i++) {
    if (!(await evalJs(`(() => { const e = ${expr}; if (!e) return false; e.scrollIntoView({ block: 'center' }); return true; })()`))) return false;
    await sleep(350); // the chat re-pins / re-folds after a scroll — press where the element IS, not where it was
    const r = await evalJs(`(() => { const e = ${expr}; if (!e) return null; window.__vsHit = false; e.addEventListener('click', () => { window.__vsHit = true; }, { once: true, capture: true }); const on = (h) => !!h && (h === e || e.contains(h)); const boxes = [...e.getClientRects()].filter((q) => q.width > 0 && q.height > 0); if (!boxes.length) boxes.push(e.getBoundingClientRect()); for (const q of boxes) { const x = q.left + q.width / 2, y = q.top + q.height / 2; if (on(document.elementFromPoint(x, y))) return { x, y, hits: true }; } const q = boxes[0]; return { x: q.left + q.width / 2, y: q.top + q.height / 2, hits: false }; })()`);
    if (!r) return false;
    if (r.hits) {
      await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
      await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
      await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
      if (await evalJs('window.__vsHit === true')) return true;
    }
    await sleep(400);
  }
  return false;
};

const VIEW = (sid) => `[...app.sessions.values()].find((v) => v && v.sessionId === ${JSON.stringify(sid)})`;
const LIST = (sid) => `(${VIEW(sid)})?._messageList`;
const CARD = (sid) => `(${LIST(sid)})?.querySelector('.chat-sub-card[data-sub-id="${S}"]')`;
const SUBWIN = `[...app.wm.windows.values()].find((w) => w._openSpec && w._openSpec.virtualId === 'sub-${S}')`;
let liveWs = null; const frames = [];
const openWs = async () => { liveWs = new WebSocket(`ws://127.0.0.1:${PORT}/ws`); await new Promise((r) => liveWs.on('open', r)); liveWs.on('message', (d) => { try { frames.push(JSON.parse(String(d))); } catch {} }); };
const create = async (reqId) => {
  const before = frames.filter((m) => m?.type === 'created').length;
  liveWs.send(JSON.stringify({ type: 'create', backend: 'antigravity', mode: 'chat', cwd: CWD, reqId }));
  for (let i = 0; i < 80; i++) { const made = frames.filter((m) => m?.type === 'created'); if (made.length > before) return made[made.length - 1].sessionId; await sleep(250); }
  return null;
};
const attach = async (sid, name) => {
  await evalJs(`app.attachSession(${JSON.stringify(sid)}, ${JSON.stringify(name)}, ${JSON.stringify(CWD)}, { mode: 'chat', backend: 'antigravity' }); true`);
  return waitFor(`!!(${VIEW(sid)})?._messageList`, 20000);
};
const TURN = `please start a subagent — its timeline is [\`${S}\`](conversation://${S}); this one is not ours: [\`${UNKNOWN.slice(0, 8)}\`](conversation://${UNKNOWN})`;

try {
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await waitApp();
  await sleep(500);
  await openWs();

  console.log('K1 THE CARD in the parent chat');
  const sid = await create('agy-sub-1');
  check('an Antigravity chat is created (the stub agy behind the real agy-wrapper)', !!sid);
  check('the chat window attaches', await attach(sid, 'agy subagents'));
  liveWs.send(JSON.stringify({ type: 'chat-input', sessionId: sid, text: TURN }));
  check('the invoke_subagent row becomes a SUBAGENT CARD (read from the agy store by the wrapper)', await waitFor(`!!(${CARD(sid)})`, 25000), await evalJs(`(${LIST(sid)})?.innerText?.slice(-600) || ''`));
  await waitFor(`!(${CARD(sid)})?.querySelector('.chat-tool-output-pending')`, 15000);
  const k1 = await evalJs(`(() => { const c = ${CARD(sid)}; const lbl = c.querySelector('.chat-tool-label'); return { label: lbl.textContent, html: lbl.innerHTML, type: c.querySelector('.chat-agent-model')?.textContent, elapsed: c.querySelector('.chat-sub-elapsed')?.textContent, since: c.querySelector('.chat-sub-elapsed')?.dataset.subSince || null, btn: c.querySelector('.chat-agent-view-btn')?.textContent, sums: [...c.querySelectorAll('summary')].map((s) => s.textContent), files: c.querySelector('.chat-sub-files')?.textContent || '', task: c.querySelector('details pre')?.textContent || '', answerHtml: c.querySelector('.chat-text')?.innerHTML || '', bTags: c.querySelectorAll('b').length }; })()`);
  check('its head: «Subagent: <role>», the type chip, how long it ran (0:54), «Open timeline» — finished (no spinner)', /Subagent: 示例评审专家 <b>bold<\/b>/.test(k1.label) && k1.type === 'self' && k1.elapsed === '0:54' && !k1.since && k1.btn === 'Open timeline', k1);
  check('a store string is TEXT: the role\'s <b> is escaped (no <b> element in the card)', k1.bTags === 0 && /&lt;b&gt;bold&lt;\/b&gt;/.test(k1.html), k1.html.slice(0, 200));
  check('the task the parent gave (folded, its title), its answer (folded, the first line as its summary), the file it wrote', k1.sums[0].startsWith('Task') && /Message from Parent Agent/.test(k1.sums[0]) && /按 100 分制打分/.test(k1.task) && k1.sums.some((s) => /✓ 评审完成：88\/100/.test(s)) && /88\/100/.test(k1.answerHtml) && /Files it wrote: \/home\/u\/workspace\/示例项目\/report\.md/.test(k1.files), k1);

  // the sub's report.md is a deliverable: the Artifacts auto-open tiles it beside the chat (artifacts.autoOpenDocs) — let it land
  await waitFor(`[...app.wm.windows.values()].some((w) => w._openSpec && w._openSpec.action === 'openDoc')`, 8000); await sleep(600);
  console.log('K2 «Open timeline» opens the sub\'s own timeline (the virtual session sub-<id>)');
  // the card folds with its run of tool rows exactly like claude's Agent card (chat.collapseKinds 'agent' — the default);
  // the run's header opens it, as a person does
  const MSG = `(${CARD(sid)}).closest('.chat-msg')`;
  const HEAD = `(() => { let x = (${MSG}).previousElementSibling; while (x && !x.classList.contains('chat-run-header')) x = x.previousElementSibling; return x; })()`;
  if (await evalJs(`(${MSG}).classList.contains('chat-run-collapsed')`)) {
    let opened = false;
    for (let i = 0; i < 4 && !opened; i++) { await realClickEl(HEAD); opened = await waitFor(`!(${MSG}).classList.contains('chat-run-collapsed') && (${CARD(sid)}).getBoundingClientRect().height > 0`, 2500); } // a fold pass may rebuild the header under the pointer
    check('the card folds with its run like claude\'s Agent card; a REAL click on the run\'s header opens it', opened);
  }
  check('a REAL click on «Open timeline» lands on the button', await realClickEl(`(${CARD(sid)}).querySelector('.chat-agent-view-btn')`));
  check('a window opens for sub-<id>', await waitFor(`!!(${SUBWIN})`, 10000), await evalJs(`[...app.wm.windows.values()].map((w) => w.title)`));
  check('…and draws the sub\'s timeline', await waitFor(`(${SUBWIN})?.content?.querySelectorAll('.chat-msg').length >= 6`, 15000), await evalJs(`(${SUBWIN})?.content?.innerText?.slice(0, 400) || ''`));
  const k2 = await evalJs(`(() => { const w = ${SUBWIN}; const msgs = [...w.content.querySelectorAll('.chat-msg')]; return { title: w.title, n: msgs.length, seen: w.content.innerText, all: w.content.textContent, titles: msgs.map((m) => m._rawMsg && m._rawMsg.backendMeta && m._rawMsg.backendMeta.title).filter(Boolean) }; })()`);
  check('the task as a bubble from «Parent Agent», its tool rows in the order it ran them (read_file, run_command, write_file, send_message — folded into runs like any chat), its last words',
    /Message from “Parent Agent”/.test(k2.seen) && /按 100 分制打分/.test(k2.seen) && k2.titles.join() === 'read_file,run_command,write_file,send_message' && /wc -l/.test(k2.all) && /Created file \/home\/u\/workspace\/示例项目\/report\.md/.test(k2.seen) && /I sent my evaluation to the Parent Agent/.test(k2.seen),
    { title: k2.title, n: k2.n, titles: k2.titles, seen: k2.seen.slice(0, 500) });
  await evalJs(`(() => { const w = ${SUBWIN}; app.wm.closeWindow ? app.wm.closeWindow(w.id) : w.onClose?.(); return true; })()`);
  await waitFor(`!(${SUBWIN})`, 5000);

  console.log('K3 the conversation:// links in the agent\'s text');
  // the AGENT's text (its reply echoes the turn — the user's own bubble renders the same links, clipped when long)
  const LINK = `[...((${LIST(sid)})?.querySelectorAll('.chat-msg-assistant .chat-sub-link[data-sub="${S}"]') || [])].pop()`, ULINK = `[...((${LIST(sid)})?.querySelectorAll('.chat-msg-assistant .chat-sub-link[data-sub="${UNKNOWN}"]') || [])].pop()`;
  check('the agent\'s [`<id>`](conversation://<id>) is OUR link (.chat-link, data-sub) — not inert text', await waitFor(`!!(${LINK}) && (${LINK}).classList.contains('chat-link')`, 10000), await evalJs(`(${LIST(sid)})?.querySelector('.chat-msg-assistant:last-of-type')?.innerHTML?.slice(0, 600) || ''`));
  const u = await evalJs(`(() => { const l = ${ULINK}; return l ? { unknown: l.classList.contains('chat-sub-unknown'), chip: l.querySelector('.chat-sub-chip')?.textContent || '' } : null; })()`);
  check('a link to a sub this conversation does not know carries the chip that says so', !!u && u.unknown && u.chip === 'unknown subagent', u);
  check('a REAL click on the known link…', await realClickEl(LINK));
  check('…opens THAT sub\'s timeline (the same window the card opens)', await waitFor(`!!(${SUBWIN}) && (${SUBWIN}).content.querySelectorAll('.chat-msg').length >= 6`, 15000));
  // THE RUNNER'S WRAP on every box (ci-341-reds): the runner's DejaVu broke the id at a hyphen across two lines, so the
  // centre of the link's union box was the paragraph between its pieces and the old aim never pressed. Narrow the
  // agent's paragraph until the link breaks the same way — the premise asserted (two line boxes, the union centre OFF
  // the link) — then the CONTROL presses that centre (the pre-fix aim: it lands on the paragraph and opens nothing) and
  // the leg's aim (inside one of the link's own boxes) opens THAT sub's timeline.
  await evalJs(`(() => { const w = ${SUBWIN}; app.wm.closeWindow(w.id); return true; })()`);
  await waitFor(`!(${SUBWIN})`, 5000);
  const WRAP = `(() => { const e = ${LINK}; const p = e.closest('p') || e.parentElement; const on = (h) => !!h && (h === e || e.contains(h)); const full = Math.floor(p.getBoundingClientRect().width); for (let w = full; w >= 60; w -= 4) { p.style.width = w + 'px'; e.scrollIntoView({ block: 'center' }); const rs = e.getClientRects(); if (rs.length < 2) continue; const q = e.getBoundingClientRect(); if (!on(document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2))) return { width: w, boxes: rs.length }; } p.style.width = ''; return null; })()`;
  const wrap = await evalJs(WRAP);
  check('the runner\'s premise holds here: the link breaks across two lines and the centre of its union box is OFF it', !!wrap, wrap);
  if (wrap) {
    await sleep(350); // the chat re-pins after the scroll (as realClickEl allows) — the press below re-reads the box
    const pre = await evalJs(`(() => { const e = ${LINK}; window.__vsWrapClicks = []; document.addEventListener('click', (ev) => { window.__vsWrapClicks.push({ target: ev.target.tagName + '.' + [...ev.target.classList].join('.'), onLink: !!ev.target.closest?.('.chat-sub-link[data-sub]') }); }, { capture: true, once: true }); const q = e.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2, boxes: e.getClientRects().length }; })()`);
    await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pre.x, y: pre.y });
    await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: pre.x, y: pre.y, button: 'left', clickCount: 1 });
    await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pre.x, y: pre.y, button: 'left', clickCount: 1 });
    await waitFor('window.__vsWrapClicks.length > 0', 5000); // the click's own record: the sub's window opens inside the handler, synchronously
    const ctl = await evalJs(`({ clicks: window.__vsWrapClicks, opened: !!(${SUBWIN}) })`);
    check('CONTROL (the pre-fix aim): a press at the wrapped link\'s union-box centre lands on the paragraph and opens nothing — the runner\'s red', pre.boxes >= 2 && ctl.clicks.length === 1 && !ctl.clicks[0].onLink && !ctl.opened, { pre, ...ctl });
    check('a REAL click on the WRAPPED link (inside one of its own line boxes)…', await realClickEl(LINK));
    check('…opens THAT sub\'s timeline', await waitFor(`!!(${SUBWIN}) && (${SUBWIN}).content.querySelectorAll('.chat-msg').length >= 6`, 15000), await evalJs(`[...app.wm.windows.values()].map((w) => w._openSpec?.virtualId || w._openSpec?.action)`));
    await evalJs(`(() => { const p = (${LINK}).closest('p') || (${LINK}).parentElement; p.style.width = ''; return true; })()`);
  }

  console.log('K4 the Artifacts chip counts the file the SUB wrote');
  check('the chip reads «Artifacts · 1»', await waitFor(`/Artifacts · 1/.test(document.querySelector('.chat-status-artifacts')?.textContent || '')`, 10000), await evalJs(`document.querySelector('.chat-status-artifacts')?.textContent || '(no chip)'`));
  const card = await evalJs(`(() => { const c = (${LIST(sid)})?.querySelector('.chat-artifact-card'); return c ? { name: c.querySelector('.chat-artifact-name')?.textContent || '', text: c.textContent } : null; })()`);
  check('…and its card names report.md', !!card && /report\.md/.test(card.name), card);
  check('no page error on the way', pageErrors.length === 0, pageErrors);

  console.log('K5 CONTROL: the pre-lane normalizer (no `subagent` case) — the owner\'s state');
  const NORM = path.join(wt, 'src/acp-message-manager.js');
  const ns = fs.readFileSync(NORM, 'utf8'), CASE = "      case 'subagent': return this._processSubagent(record, emit);\n";
  check('CONTROL needle present', ns.includes(CASE));
  fs.writeFileSync(NORM, ns.replace(CASE, ''));
  try { srv.kill('SIGKILL'); } catch {}
  await sleep(500);
  startServer(); await waitServer();
  await cdp('Page.reload', { ignoreCache: true }); await waitApp(); await sleep(500);
  try { liveWs.close(); } catch {}
  await openWs();
  check('the chat re-attaches on the restarted server', await attach(sid, 'agy subagents'));
  await waitFor(`(${LIST(sid)})?.querySelectorAll('.chat-msg').length >= 3`, 15000);
  const ctl = await evalJs(`(() => { const l = ${LIST(sid)}; return { cards: l.querySelectorAll('.chat-sub-card').length, btns: l.querySelectorAll('.chat-agent-view-btn').length, row: [...l.querySelectorAll('.chat-msg-tool-result')].some((el) => el._rawMsg && el._rawMsg.backendMeta && el._rawMsg.backendMeta.title === 'invoke_subagent' && el._rawMsg.toolName === 'Tool') }; })()`);
  check('CONTROL: no card and no timeline button — the row is a plain tool row (the legs above can go red)', ctl.cards === 0 && ctl.btns === 0 && ctl.row, ctl);
  try { liveWs.send(JSON.stringify({ type: 'kill', sessionId: sid })); liveWs.close(); } catch {}
} catch (e) {
  failed++;
  console.error('✗ suite threw: ' + (e && e.stack || e));
}
console.log(`\n${failed ? `${failed} FAILED (${passed} passed)` : `ALL PASS (${passed})`}`);
cleanup();
process.exit(failed ? 1 : 0);
