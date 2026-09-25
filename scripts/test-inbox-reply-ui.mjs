#!/usr/bin/env node
// test-inbox-reply-ui — the For-you inbox's REPLY on a real page (docs/design-user-inbox-reply.md
// chunks 2–3): keyed rows, the reply box, option chips, the running dot, the phone sheet, the title-bar mini inbox.
//
// A THROWAWAY server in a git worktree (own data/, a scratch HOME) + headless
// chrome over raw CDP (test-mobile-gaps' skeleton). A stub `claude` runs behind
// the REAL chat-wrapper through the REAL create path: it answers the boot
// probes, announces an init frame, appends every stdin line to a file, dumps
// its env (the session's own vsst_ token, used to file items through the REAL
// agent route) and answers each user turn after 2.5 s (assistant + result), so
// the payload's `turn` column really flips running → idle.
//   ① hostile item strings (title / option label / detail) render as TEXT — no
//      handler runs, textContent equals the raw string
//   ② the live session's dot is `idle`, its reply button enabled; typing + Enter
//      ⇒ the stub's stdin gets `[For you reply #<id>] … <reply>`, a toast says
//      so, the row resolves IN PLACE with "You replied", the chat shows the
//      reply card with its quote folded
//   ③ a stopped session's item: the reply button is disabled, its title the
//      verdict's sentence
//   ④ a reply box being typed into survives a broadcast (another item filed by
//      the agent): the SAME textarea, its text, its focus; the new row appended
//      at its group's end
//   ⑤ an option chip sends its label as the whole reply, the row resolves
//   ⑧ the dot flips to `running` after a chat-input and back to `idle` after
//      the result — through the active-sessions broadcast, no row rebuilt
//   ⑦ NEGATIVE CONTROL: the same hostile title through a raw innerHTML copy
//      DOES set window.__xss (so ① can go red)
//   ⑥ 390×844 phone: the nav inbox opens the sheet with the same reply box,
//      every reply control ≥ 36 px, Esc folds the box then closes the sheet
// chunk 3 — THE TITLE-BAR MINI INBOX:
//   ⑨ each window's .win-inbox-badge = its session's open ACTION items (worst
//      urgency; a view-only window of the stopped fixture its own; a session
//      with only notices none)
//   ⑩ a real click opens .ut-mini-popover[data-popover] with exactly that
//      session's rows; replying there ⇒ the stub's stdin, the row resolves in
//      place, the badge counts down and is gone at 0
//   ⑪ Escape closes the popover first, the panel on the next press
//   ⑪b the same with a MODAL above the panel (the ⤢ viewer, createModalShell): one real
//      Escape closes the viewer only, the next the panel
//   ⑫ in a tab chain the badge rides the tab; un-tabbed it is back on the bar
//   ⑬ a hostile session name stays text (popover head, title bar, aria-label)
//   ⑭ NEGATIVE CONTROL: a patched miniInboxEntries without its key filter
//      lists another session's row
// chunk 4 — THE USAGE SET:
//   ⑮ a seeded 30-ask group renders 5 rows + "25 more…"; the expander opens all
//      30 without moving the first 5 rows; "Mark all seen" ⇒ ONE POST, every row
//      struck IN PLACE (same nodes), the taskbar count drops by 30, the window's
//      title-bar badge is gone, and a second client sees exactly ONE
//      user-todos-updated broadcast
//   ⑯ the board chip: the agent's `needs-input` (vibespace-status's route, its
//      own token) paints "needs input" beside the group name without touching a
//      row — a reply box being typed into keeps its node, text and focus; a
//      clear removes the chip
// B-328d — NOTICES BY ORIGIN + THE TAB COUNTS:
//   ⑰ the Notices area = a chip strip (all + one chip per origin with its open
//      count) over one group per ORIGIN in the set's order (a legacy item with
//      no origin under its read-time rung, a forged origin as text under
//      Agents); a real click on a chip HIDES the other groups — every ask row,
//      every chip and the half-typed reply box keep their node (and the text);
//      a notice filed while filtered lands hidden in its group, its chip and
//      the Inbox tab's grey count tick in place
//   ⑱ the tab counts: Inbox = the open asks (the taskbar badge's sentence) +
//      the grey notices; Notifications = toasts since the last look — a real
//      toast ticks it in place, showing the page clears it (the tabs node never
//      rebuilt), a switch back keeps the typed reply as a draft; the filter is
//      per device (survives a close/open)
//   ⑱c (r2) the HELD filter: Login expiry chosen, its only notice dismissed
//      elsewhere, the popup reopened ⇒ All shown AND stored; the notice
//      reopened elsewhere (it ARRIVES by broadcast) ⇒ every group stays shown,
//      All still active (r1 re-applied the stored login: every other group hid)
//   ⑲ NEGATIVE CONTROL: a patched noticeGroups that ignores the filter shows
//      every group (so ⑰ can go red)
// Requires google-chrome (SKIP without). Run: node scripts/test-inbox-reply-ui.mjs
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, ONBOARDED_SOURCE } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }

const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('inbox-reply-ui-wt');
const fakeHome = scratchHome('inbox-reply-ui-home', fs);
const stubDir = scratch('inbox-reply-ui-stub');
fs.mkdirSync(stubDir, { recursive: true });
const CWD = path.join(fakeHome, 'proj');
const STOPPED_SID = 'f01d0000-0000-4000-8000-0000000ab2e1'; // a view-only fixture conversation (not running)
const LIVE_SID = 'f01d0000-0000-4000-8000-0000000ab2fe';
const FLOOD_SID = 'f01d0000-0000-4000-8000-0000000ab30f'; // a second stopped fixture whose agent flooded the inbox (chunk 4)
const FLOOD_N = 30;
let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── fixtures: a stopped conversation + its HOSTILE item, seeded in the store's own shape ──
fs.mkdirSync(CWD, { recursive: true });
{
  const lines = [];
  let ts0 = Date.now() - 3600e3; let n = 0;
  const ts = () => new Date((ts0 += 5e3)).toISOString();
  const proj = path.join(fakeHome, '.claude', 'projects', CWD.replace(/[/._]/g, '-'));
  fs.mkdirSync(proj, { recursive: true });
  for (const SID of [STOPPED_SID, FLOOD_SID]) {
    lines.length = 0;
    for (let k = 0; k < 3; k++) {
      lines.push(JSON.stringify({ type: 'user', message: { role: 'user', content: `question ${k}` }, uuid: `u-${n++}`, timestamp: ts(), cwd: CWD, sessionId: SID }));
      lines.push(JSON.stringify({ type: 'assistant', message: { id: `msg_${n}`, role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text: `answer ${k}` }], usage: { input_tokens: 1, output_tokens: 1 } }, uuid: `a-${n++}`, timestamp: ts(), cwd: CWD, sessionId: SID }));
    }
    fs.writeFileSync(path.join(proj, `${SID}.jsonl`), lines.join('\n') + '\n');
  }
}
const HOSTILE_ID = 'ut-00000000a1';
const HOSTILE_TITLE = '<img src=x onerror=window.__xss=1>';
const HOSTILE_OPT = '"><svg onload=window.__xss=2>';
const HOSTILE_DETAIL = '</div><img src=y onerror=window.__xss=3><script>window.__xss=4</script>';
// B-328d: notices from four producers, in the store's own shape — two declared
// spend notices + one LEGACY spend notice (no origin: the read-time rung puts it
// under Spending by its frozen sessionName), a login notice, a channels notice,
// and a FORGED origin (a hostile string no add() would accept) that must read
// as an agent's notice and paint as text
const NOTICE_SEEDS = [
  ['ut-5bed000001', 'accounts', { origin: 'spend', sessionName: 'Spending', text: 'Account A has used 10 of its 12 unattended turns this hour (83%).' }],
  ['ut-5bed000002', 'accounts', { origin: 'spend', sessionName: 'Spending', text: 'Account B has used 48 of its 60 unattended turns today (80%).' }],
  ['ut-5bed000003', 'accounts', { sessionName: 'Spending', text: 'VibeSpace refused the Stop bookkeeping mini-turn in "legacy"' }],
  ['ut-10910000a1', 'accounts', { origin: 'login', sessionName: 'Manage Agents', text: 'Account C: login session ends in 20 h' }],
  ['ut-c4a0000001', 'channels', { origin: 'channels', sessionName: 'Channels', text: 'Channel fixture: backfill finished' }],
  ['ut-f0e6000001', 'claude:f01d0000-0000-4000-8000-0000000ab3a0', { origin: '"><img src=z onerror=window.__xss=7>', sessionName: 'forged fixture', text: 'A notice with a forged origin' }],
];

// ── throwaway server in a worktree (overlays the built public/ + the working src/) ──
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
// the FLOOD (chunk 4): 30 low-urgency asks from one agent, seeded in the store's
// own shape (the agent route caps a session at 20 open — the file the store
// loads does not), newest first: flood-00 is the newest
const FLOOD_IDS = Array.from({ length: FLOOD_N }, (_, k) => 'ut-f100d' + String(k).padStart(5, '0'));
fs.writeFileSync(path.join(wt, 'data', 'user-todos.json'), JSON.stringify({ items: [{
  id: HOSTILE_ID, sessionKey: 'claude:' + STOPPED_SID, text: HOSTILE_TITLE, detail: HOSTILE_DETAIL, urgency: 'high', kind: 'action',
  options: [HOSTILE_OPT, 'fine'], reply: null,
  status: 'open', by: 'agent', sessionName: 'stopped fixture', jobId: null, createdAt: Date.now() - 60e3, resolvedAt: null, resolvedBy: null,
}, ...FLOOD_IDS.map((id, k) => ({
  id, sessionKey: 'claude:' + FLOOD_SID, text: `flood ask ${String(k).padStart(2, '0')}`, detail: null, urgency: 'low', kind: 'action',
  options: null, reply: null, status: 'open', by: 'agent', sessionName: 'flood fixture', jobId: null,
  createdAt: Date.now() - 120e3 - k * 1000, resolvedAt: null, resolvedBy: null,
})), ...NOTICE_SEEDS.map(([id, sessionKey, x], k) => ({
  id, sessionKey, detail: null, urgency: 'normal', kind: 'notice', options: null, reply: null,
  status: 'open', by: 'agent', jobId: null, createdAt: Date.now() - 90e3 - k * 1000, resolvedAt: null, resolvedBy: null, ...x,
}))] }, null, 2));

// The stub CLI (node, absolute shebang — agentEnv() strips unknown env, so its
// paths are baked into its text).
const stubPath = path.join(stubDir, 'claude');
const STDIN_LOG = path.join(stubDir, 'stdin.ndjson');
fs.writeFileSync(stubPath, `#!${process.execPath}
const fs = require('fs');
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('2.1.274 (Claude Code) stub'); process.exit(0); }
if (args.includes('--help')) { console.log('Usage: claude [options]'); process.exit(0); }
fs.writeFileSync(${JSON.stringify(stubDir)} + '/env-' + process.pid + '.json', JSON.stringify(process.env));
const SID = ${JSON.stringify(LIVE_SID)};
const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
out({ type: 'system', subtype: 'init', session_id: SID, model: 'claude-fable-5', cwd: ${JSON.stringify(CWD)}, tools: [], permissionMode: 'default', claude_code_version: '2.1.274' });
let n = 0, buf = '';
process.stdin.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    fs.appendFileSync(${JSON.stringify(STDIN_LOG)}, line + '\\n');
    let m = null; try { m = JSON.parse(line); } catch {}
    if (!m || m.type !== 'user') continue;
    const k = ++n;
    setTimeout(() => {
      out({ type: 'assistant', message: { id: 'msg_stub_' + k, type: 'message', role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text: 'ack ' + k }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }, session_id: SID, uuid: 'stub-a-' + k });
      out({ type: 'result', subtype: 'success', is_error: false, duration_ms: 2500, num_turns: 1, result: 'ack ' + k, session_id: SID, total_cost_usd: 0, usage: { input_tokens: 1, output_tokens: 1 } });
    }, 2500);
  }
});
process.stdin.on('end', () => process.exit(0));
`, { mode: 0o755 });
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, PORT: String(PORT), HOME: fakeHome, CLAUDE_CMD: stubPath, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' }, stdio: 'ignore' });
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu',
  '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-timer-throttling', `--user-data-dir=${wt}-chrome`, 'about:blank'], { stdio: 'ignore' });
let cleaned = false;
const cleanup = () => {
  if (cleaned) return; cleaned = true;
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv.kill('SIGKILL'); } catch {}
  // every process this suite caused: the dtach session, the wrapper, the stub,
  // the worktree's device daemon — all carry one of these scratch paths
  for (const pat of [wt, fakeHome, stubDir]) { try { execSync(`pkill -9 -f ${JSON.stringify(pat)}`, { stdio: 'ignore' }); } catch {} }
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  for (const d of [wt, `${wt}-chrome`, fakeHome, stubDir]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });
for (let i = 0; i < 60; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); break; } catch { await sleep(250); } }

// ── raw CDP ─────────────────────────────────────────────────────────────────
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
const pressEnter = async () => {
  await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await cdp('Input.dispatchKeyEvent', { type: 'char', key: 'Enter', code: 'Enter', text: '\r', unmodifiedText: '\r', windowsVirtualKeyCode: 13 });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
};
const stdinFrames = () => {
  if (!fs.existsSync(STDIN_LOG)) return [];
  return fs.readFileSync(STDIN_LOG, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((m) => m && m.type === 'user')
    .map((m) => { const c = m.message && m.message.content; return typeof c === 'string' ? c : Array.isArray(c) ? c.map((b) => b.text || '').join('') : ''; });
};
const waitFrames = async (n, ms = 5000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (stdinFrames().length >= n) return true; await sleep(100); } return stdinFrames().length >= n; };
const stubToken = () => {
  for (const f of fs.readdirSync(stubDir).filter((x) => x.startsWith('env-'))) {
    try { const e = JSON.parse(fs.readFileSync(path.join(stubDir, f), 'utf8')); if (e.VIBESPACE_SESSION_TOKEN) return e.VIBESPACE_SESSION_TOKEN; } catch {}
  }
  return null;
};
const fileItem = async (token, add) => {
  const r = await fetch(`http://127.0.0.1:${PORT}/api/agent/user-todo`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ add }) });
  return r.json();
};
const REPLY_WHY_NOT_RUNNING = 'Agent not running — open the session, then reply';
// VS_SHOT_DIR=<dir> saves the B-328d screenshots (the desktop popup, the phone sheet) for a visual check
const shot = async (name, sel) => {
  const dir = process.env.VS_SHOT_DIR;
  if (!dir) return;
  try {
    const r = sel ? await evalJs(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const q = e.getBoundingClientRect(); return { x: Math.max(0, q.left - 4), y: Math.max(0, q.top - 4), width: q.width + 8, height: q.height + 8, scale: 1 }; })()`) : null;
    const img = await cdp('Page.captureScreenshot', { format: 'png', ...(r ? { clip: r } : {}), captureBeyondViewport: false });
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name + '.png'), Buffer.from(img.data, 'base64'));
    console.log(`    (screenshot ${name}.png)`);
  } catch (e) { console.log(`    (screenshot ${name} failed: ${e.message})`); }
};
const rowSel = (id) => `#user-todos-popup .ut-item[data-id=${JSON.stringify(id)}]`;
// A REAL click (CDP mouse events) on the element `sel` names (B-328d legs): the
// element is scrolled to the middle of its scroller and the point is PROVEN to
// hit it (elementFromPoint) — the legs file items, every arrival is a toast, and
// the toast stack sits over the popup's lower edge, where a click is an outside
// click that closes the popup. A covered point clears the stack once and retries.
const realClick = async (sel) => {
  for (let k = 0; k < 2; k++) {
    const r = await evalJs(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'center' }); const q = e.getBoundingClientRect(); const x = q.left + q.width / 2, y = q.top + q.height / 2; const hit = document.elementFromPoint(x, y); return { x, y, hits: !!hit && (hit === e || e.contains(hit)) }; })()`);
    if (!r) return false;
    if (!r.hits) { await evalJs(`document.querySelectorAll('#global-toasts > .global-toast').forEach((el) => el.remove()); true`); continue; }
    await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
    await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
    await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
    return true;
  }
  return false;
};

try {
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await waitApp();
  await sleep(800);

  // a LIVE chat session through the real create path
  console.log('setup: a live stub session + items filed through the REAL agent route');
  const liveWs = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  await new Promise((r) => liveWs.on('open', r));
  const frames = [];
  liveWs.on('message', (d) => { try { frames.push(JSON.parse(String(d))); } catch {} });
  liveWs.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: CWD, reqId: 'live1' }));
  let sid = null;
  for (let i = 0; i < 80 && !sid; i++) { const f = frames.find((m) => m?.type === 'created'); if (f) sid = f.sessionId; else await sleep(250); }
  check('a live claude chat session is created through the real spawn path (stub CLI behind the real wrapper)', !!sid, frames.slice(-3).map((f) => JSON.stringify(f).slice(0, 200)).join('\n'));
  let token = null;
  for (let i = 0; i < 80 && !token; i++) { token = stubToken(); if (!token) await sleep(250); }
  check('the stub received its session token in its env (vsst_)', !!token && token.startsWith('vsst_'), token);
  const plan = await fileItem(token, { text: 'Tell me the plan', urgency: 'high' });
  const third = await fileItem(token, { text: 'Third ask — keep typing here', urgency: 'normal' });
  const choose = await fileItem(token, { text: 'Which way?', urgency: 'normal', options: ['Run now', 'Wait for backup'] });
  check('three items filed by the agent route (one with option chips)', plan?.success && third?.success && choose?.success && Array.isArray(choose.item?.options), { plan, third, choose });
  const liveKey = plan.item.sessionKey;
  await evalJs(`app.attachSession(${JSON.stringify(sid)}, 'live stub', ${JSON.stringify(CWD)}, { mode: 'chat', backend: 'claude' }); true`);
  check('the live chat window attaches (composer present)', await waitFor(`!!document.querySelector('.chat-view .chat-input')`, 20000));
  await sleep(500);

  // ── ① XSS ──
  console.log('① hostile strings render as text');
  await evalJs(`document.getElementById('taskbar-user-todos').click(); true`);
  check('the popup opens with the seeded hostile row', await waitFor(`!!document.querySelector(${JSON.stringify(rowSel(HOSTILE_ID))})`));
  await evalJs(`(() => { const d = document.querySelector(${JSON.stringify(rowSel(HOSTILE_ID) + ' .ut-detail-exp')}); if (d) d.open = true; return true; })()`);
  await sleep(400);
  const x1 = await evalJs(`(() => { const r = document.querySelector(${JSON.stringify(rowSel(HOSTILE_ID))}); return { xss: window.__xss, text: r.querySelector('.ut-text').textContent, chips: [...r.querySelectorAll('.ut-opt')].map((c) => c.textContent), detail: r.querySelector('.ut-detail')?.textContent, imgs: r.querySelectorAll('img, svg:not(.ut-act svg), script').length }; })()`);
  check('window.__xss is undefined after the hostile row painted (title, option label and detail)', x1.xss === undefined, x1);
  check('the row text is the RAW title, the chips the RAW labels, the detail the RAW detail', x1.text === HOSTILE_TITLE && x1.chips[0] === HOSTILE_OPT && x1.chips[1] === 'fine' && x1.detail === HOSTILE_DETAIL, x1);

  // ── ③ stopped ⇒ disabled with the verdict's sentence ──
  console.log('③ a stopped session: disabled, with the reason');
  const x3 = await evalJs(`(() => { const r = document.querySelector(${JSON.stringify(rowSel(HOSTILE_ID))}); const b = r.querySelector('.ut-reply-btn'); const dot = document.querySelector('#user-todos-popup .ut-live-dot[data-key=' + JSON.stringify(${JSON.stringify('claude:' + STOPPED_SID)}) + ']'); return { has: !!b, disabled: b?.disabled, title: b?.title, chipsDisabled: [...r.querySelectorAll('.ut-opt')].every((c) => c.disabled), dot: dot?.dataset.state, dotTitle: dot?.title }; })()`);
  check(`the reply button is drawn DISABLED with title "${x3.title}"`, x3.has && x3.disabled === true && x3.title === REPLY_WHY_NOT_RUNNING, x3);
  check('its option chips are disabled too, and its group dot says not running', x3.chipsDisabled && x3.dot === 'off' && x3.dotTitle === 'not running', x3);

  // ── ② reply to a live item ──
  console.log('② reply from the box: the typing path, quoted, resolved in place');
  const dotSel = `#user-todos-popup .ut-live-dot[data-key=${JSON.stringify(liveKey)}]`;
  check('the live session\'s group dot is idle (hollow green), titled "running, idle"', await waitFor(`document.querySelector(${JSON.stringify(dotSel)})?.dataset.state === 'idle'`, 8000), await evalJs(`(() => { const d = document.querySelector(${JSON.stringify(dotSel)}); return d ? { state: d.dataset.state, title: d.title } : null; })()`));
  const planSel = rowSel(plan.item.id);
  check('its reply button is ENABLED', await evalJs(`(() => { const b = document.querySelector(${JSON.stringify(planSel + ' .ut-reply-btn')}); return !!b && !b.disabled && b.title === 'Reply'; })()`));
  await evalJs(`document.querySelector(${JSON.stringify(planSel + ' .ut-reply-btn')}).click(); true`);
  check('the reply button opens a box under the row with the textarea focused', await waitFor(`document.activeElement === document.querySelector(${JSON.stringify(planSel + ' .ut-reply textarea')})`, 3000));
  const before = stdinFrames().length;
  await cdp('Input.insertText', { text: 'B — wait' });
  await pressEnter();
  const got = await waitFrames(before + 1, 5000);
  const frame = stdinFrames()[before] || '';
  check(`within 5 s the stub's stdin holds ONE user frame opening with [For you reply #${plan.item.id}] and ending with the reply`, got && frame.startsWith(`[For you reply #${plan.item.id}]`) && frame.endsWith('B — wait'), frame.slice(0, 300));
  check('…the quote carries the item\'s own text', frame.includes('> Tell me the plan'), frame.slice(0, 300));
  check('a toast says "Reply sent"', await waitFor(`[...document.querySelectorAll('.global-toast')].some((e) => e.textContent.includes('Reply sent'))`, 4000));
  check('the row resolves IN PLACE (ut-item-inplace) with "You replied" in its meta, the box gone', await waitFor(`(() => { const r = document.querySelector(${JSON.stringify(planSel)}); return !!r && r.classList.contains('ut-item-inplace') && r.querySelector('.ut-meta').textContent.includes('You replied: B — wait') && r.querySelector('.ut-meta').textContent.includes('by your reply') && !r.querySelector('.ut-reply'); })()`, 5000),
    await evalJs(`document.querySelector(${JSON.stringify(planSel)})?.outerHTML.slice(0, 600)`));
  check('the chat window shows the reply card: head naming the item, quote in a COLLAPSED <details>, the reply as body', await waitFor(`(() => { const c = [...document.querySelectorAll('.chat-msg-inbox-reply')].pop(); if (!c) return false; const d = c.querySelector('details.chat-inbox-quote'); return !!d && !d.open && c.textContent.includes(${JSON.stringify('#' + plan.item.id)}) && c.querySelector('.chat-text')?.textContent.trim() === 'B — wait'; })()`, 6000),
    await evalJs(`[...document.querySelectorAll('.chat-msg-inbox-reply')].map((c) => c.outerHTML.slice(0, 300))`));

  // ── ⑧ the dot follows the turn through the broadcast ──
  console.log('⑧ the running dot: running after a chat-input, idle after the result, rows untouched');
  check('(the stub answered the reply turn: the dot is idle again)', await waitFor(`document.querySelector(${JSON.stringify(dotSel)})?.dataset.state === 'idle'`, 8000));
  await evalJs(`window.__rowsBefore = [...document.querySelectorAll('#user-todos-popup .ut-item')]; true`);
  await evalJs(`app.ws.send({ type: 'chat-input', sessionId: ${JSON.stringify(sid)}, text: 'hello there', msgId: 'dot-1' }); true`);
  const t0 = Date.now();
  const ran = await waitFor(`document.querySelector(${JSON.stringify(dotSel)})?.dataset.state === 'running'`, 2000);
  check(`the dot flips to "running" within 2 s (${Date.now() - t0} ms) titled "running (mid-turn)"`, ran && await evalJs(`document.querySelector(${JSON.stringify(dotSel)}).title === 'running (mid-turn)'`));
  check('…and back to "idle" after the stub\'s result', await waitFor(`document.querySelector(${JSON.stringify(dotSel)})?.dataset.state === 'idle'`, 8000));
  check('…with every row the SAME node (a live-fact broadcast patches, never re-renders)', await evalJs(`(() => { const now = [...document.querySelectorAll('#user-todos-popup .ut-item')]; return now.length === window.__rowsBefore.length && now.every((r, i) => r === window.__rowsBefore[i]); })()`));

  // ── ④ a box being typed into survives a broadcast ──
  console.log('④ the reply box survives a broadcast');
  const thirdSel = rowSel(third.item.id);
  await evalJs(`document.querySelector(${JSON.stringify(thirdSel + ' .ut-reply-btn')}).click(); true`);
  await waitFor(`document.activeElement === document.querySelector(${JSON.stringify(thirdSel + ' .ut-reply textarea')})`, 3000);
  await cdp('Input.insertText', { text: 'half-typed draft' });
  await evalJs(`window.__ta = document.querySelector(${JSON.stringify(thirdSel + ' .ut-reply textarea')}); true`);
  const fourth = await fileItem(token, { text: 'A fourth ask arrives', urgency: 'low' });
  check('a fourth item is filed through the agent route meanwhile', fourth?.success, fourth);
  check('the broadcast lands: the new row appears', await waitFor(`!!document.querySelector(${JSON.stringify(rowSel(fourth.item.id))})`, 5000));
  const x4 = await evalJs(`(() => { const ta = document.querySelector(${JSON.stringify(thirdSel + ' .ut-reply textarea')}); const g = document.querySelector(${JSON.stringify(rowSel(fourth.item.id))}).closest('.ut-group'); const rows = [...g.querySelectorAll(':scope > .ut-item')]; return { same: ta === window.__ta, connected: window.__ta.isConnected, value: window.__ta.value, focused: document.activeElement === window.__ta, last: rows[rows.length - 1]?.dataset.id, groupKey: g.dataset.key }; })()`);
  check('the SAME textarea is still in the DOM, with its text and its focus', x4.same && x4.connected && x4.value === 'half-typed draft' && x4.focused, x4);
  check('the new row is the LAST row of its group (appended, nothing moved)', x4.last === fourth.item.id, x4);

  // ── ⑤ an option chip ──
  console.log('⑤ an option chip replies with its label');
  const chooseSel = rowSel(choose.item.id);
  const before5 = stdinFrames().length;
  await evalJs(`[...document.querySelectorAll(${JSON.stringify(chooseSel + ' .ut-opt')})].find((c) => c.textContent === 'Wait for backup').click(); true`);
  await waitFrames(before5 + 1, 5000);
  const f5 = stdinFrames()[before5] || '';
  const reply5 = f5.split('\n\n').pop();
  check('the next frame is a quoted reply to that item whose reply line IS the label', f5.startsWith(`[For you reply #${choose.item.id}]`) && reply5 === 'Wait for backup' && f5.includes('> options: Run now | Wait for backup'), f5.slice(0, 400));
  check('…and the row resolves in place', await waitFor(`document.querySelector(${JSON.stringify(chooseSel)})?.classList.contains('ut-item-inplace')`, 5000));
  check('…while the half-typed box on the other row is still there', await evalJs(`window.__ta.isConnected && window.__ta.value === 'half-typed draft'`));

  // ── ⑨–⑭ THE TITLE-BAR MINI INBOX (chunk 3) ──
  console.log('⑨ the title-bar badge counts THIS session\'s open asks');
  const storeNow = async () => (await (await fetch(`http://127.0.0.1:${PORT}/api/user-todos`)).json()).todos;
  // an item filed before the CLI reported its id is keyed webui:<id> and re-keyed on the next call — the window answers for both
  const LIVE_KEYS = [...new Set([liveKey, `webui:${sid}`, `claude:${LIVE_SID}`])];
  const openActionsOf = async (keys) => (await storeNow()).open.filter((i) => keys.includes(i.sessionKey) && i.kind !== 'notice');
  const WORST = (items) => ['urgent', 'high', 'normal', 'low'].find((u) => items.some((i) => (i.urgency || 'normal') === u)) || '';
  const liveWin = await evalJs(`[...app.sessions.entries()].find(([w, v]) => v.sessionId === ${JSON.stringify(sid)})?.[0] || null`);
  check('the live chat window is found by its view (app.sessions)', !!liveWin, liveWin);
  const badgeOf = (winId) => `(() => { const w = app.wm.windows.get(${JSON.stringify(winId)}); const b = w && w.titleBar.querySelector(':scope > .win-inbox-badge'); return b ? { n: b.textContent.trim(), urgency: b.dataset.urgency, label: b.getAttribute('aria-label'), title: b.title, iconHidden: b.querySelector('svg')?.getAttribute('aria-hidden'), tag: b.tagName, afterTitle: b.previousElementSibling === w.titleSpan || !!(w.titleSpan.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) } : null; })()`;
  const open9 = await openActionsOf(LIVE_KEYS);
  await waitFor(`(${badgeOf(liveWin)})?.n === ${JSON.stringify(String(open9.length))}`, 6000);
  const b9 = await evalJs(badgeOf(liveWin));
  check(`the live window's title bar shows .win-inbox-badge = ${open9.length} (its open action items), data-urgency = the worst (${WORST(open9)})`, open9.length >= 1 && b9 && b9.n === String(open9.length) && b9.urgency === WORST(open9), { b9, open9: open9.map((i) => [i.id, i.urgency]) });
  check('…a <button> after the title, labelled in plain words, its SVG icon aria-hidden', b9 && b9.tag === 'BUTTON' && b9.label === `${open9.length} items from this agent` && b9.title === b9.label && b9.iconHidden === 'true' && b9.afterTitle, b9);
  const viewWin = await evalJs(`app.viewSession(${JSON.stringify(STOPPED_SID)}, ${JSON.stringify(CWD)}, 'stopped fixture', { backend: 'claude' })?.id || null`);
  check('the stopped fixture conversation opens as a view-only window', !!viewWin, viewWin);
  check('…whose title bar shows ITS OWN count (1, high — the hostile item)', await waitFor(`(() => { const b = (${badgeOf(viewWin)}); return !!b && b.n === '1' && b.urgency === 'high'; })()`, 6000), await evalJs(badgeOf(viewWin)));
  await evalJs(`app.wm.focusWindow(${JSON.stringify(liveWin)}); true`);
  await sleep(200);

  console.log('⑩ the badge opens a popover of THIS session\'s rows');
  check('(the For-you panel is still open from ①)', await evalJs(`!document.getElementById('user-todos-popup').classList.contains('hidden')`));
  const clickBadge = async (winId) => {
    const r = await evalJs(`(() => { const w = app.wm.windows.get(${JSON.stringify(winId)}); const b = w && w.titleBar.querySelector(':scope > .win-inbox-badge'); if (!b) return null; const q = b.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; })()`);
    if (!r) return false;
    await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
    await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
    await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
    return true;
  };
  const miniIds = `[...document.querySelectorAll('.ut-mini-popover[data-popover] .ut-item')].map((r) => r.dataset.id)`;
  // ⑩w LAYOUT (owner 2026-09-25 "排版有点问题", a screenshot): an item whose words carry a long
  // unbroken token (a path, an id) must WRAP inside the popover, never run out of its right
  // edge — `.ut-text` wraps anywhere and the popover clips horizontally. Filed BEFORE the
  // popover opens so the append-only-while-open legs below keep their rows.
  // no hyphens: a hyphen is a line-break opportunity even under overflow-wrap: normal — the owner's path had none for 60+ chars
  const longPath = '/tmp/fixturehome/workspace/averylongprojectname/docs/designdesktopappsseamlessandthensome/section/five/six/seven/eight.zh.md';
  const wide = await fileItem(token, { text: 'Decision needed (the design is at ' + longPath + longPath.replace('/tmp', '/again') + ' §5-§6)', urgency: 'normal' });
  check('⑩w a wide item is filed for the live session', !!(wide && wide.item && wide.item.id), wide);
  check('a real click on the badge', await clickBadge(liveWin));
  check('…opens .ut-mini-popover[data-popover]', await waitFor(`!!document.querySelector('.ut-mini-popover[data-popover]')`, 3000));
  const ids10 = await evalJs(miniIds);
  const want10 = (await storeNow()).open.filter((i) => LIVE_KEYS.includes(i.sessionKey)).map((i) => i.id);
  check(`…listing EXACTLY this session's open rows (${want10.length}), nothing from another session`, ids10.length === want10.length && want10.every((id) => ids10.includes(id)) && !ids10.includes(HOSTILE_ID), { ids10, want10 });
  check('…headed "Inbox for this session" with the session\'s running dot', await evalJs(`(() => { const p = document.querySelector('.ut-mini-popover'); return !!p && p.querySelector('.ut-mini-title')?.textContent === 'Inbox for this session' && !!p.querySelector('.ut-live-dot[data-key=' + JSON.stringify(${JSON.stringify(`claude:${LIVE_SID}`)}) + ']'); })()`));
  check('…and the badge\'s mousedown did NOT close the For-you panel or drag the window', await evalJs(`!document.getElementById('user-todos-popup').classList.contains('hidden')`));
  const wideId = wide && wide.item ? wide.item.id : '';
  check('⑩w the wide item is listed in the popover', await waitFor(`!!document.querySelector(${JSON.stringify('.ut-mini-popover .ut-item[data-id="' + wideId + '"]')})`, 4000), { wideId });
  const measure = `(() => { const p = document.querySelector('.ut-mini-popover'); const row = p && p.querySelector(${JSON.stringify('.ut-item[data-id="' + wideId + '"]')}); const t = row && row.querySelector('.ut-text'); const b = row && row.querySelector(':scope > .ut-body'); const a = row && row.querySelector('.ut-actions'); if (!p || !t || !b || !a) return null; const tr = t.getBoundingClientRect(), br = b.getBoundingClientRect(), ar = a.getBoundingClientRect(), rr = row.getBoundingClientRect(); return { popOver: p.scrollWidth - p.clientWidth, textOver: t.scrollWidth - t.clientWidth, lines: Math.round(tr.height / parseFloat(getComputedStyle(t).lineHeight)), textShare: tr.width / br.width, actionsTop: ar.top - rr.top, actionsRight: rr.right - ar.right, textBelowActions: tr.bottom - ar.bottom }; })()`;
  const m10 = await evalJs(measure);
  check('⑩w …its long path WRAPS: the text and the popover have no horizontal overflow, the row spans more than one line', !!m10 && m10.popOver <= 1 && m10.textOver <= 1 && m10.lines >= 2, m10);
  // the buttons FLOAT at the row's top-right and the words use the full width below them (owner 2026-09-25: a sibling
  // column reserved the right third of every tall row); the pre-2.369.175 flex column fails textShare (≈0.65) by construction
  check('⑩w …the words use the FULL row width (textShare ≥ 0.95), the buttons sit at the top-right and the text runs on below them', !!m10 && m10.textShare >= 0.95 && m10.actionsTop < 12 && m10.actionsRight < 12 && m10.textBelowActions > 0, m10);
  // the control is LIVE: the old `overflow-wrap: normal` put back on the same row must overflow, else the assertion proves nothing
  await evalJs(`(() => { const st = document.createElement('style'); st.id = 'x10w-control'; st.textContent = '.ut-mini-popover .ut-text { overflow-wrap: normal !important; }'; document.head.appendChild(st); return true; })()`);
  const m10c = await evalJs(measure);
  await evalJs(`document.getElementById('x10w-control')?.remove(); true`);
  check('⑩w CONTROL: with the old overflow-wrap the same row runs past its text box (the wrap rule is what holds it)', !!m10c && m10c.textOver > 1, m10c);
  await shot('mini-inbox-wide', '.ut-mini-popover');

  console.log('⑪ Escape closes the popover first, then the panel');
  await evalJs(`document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); true`);
  await sleep(150);
  const x11 = await evalJs(`({ mini: !!document.querySelector('.ut-mini-popover'), panel: !document.getElementById('user-todos-popup').classList.contains('hidden') })`);
  check('the first Escape removes the popover and leaves the panel open', !x11.mini && x11.panel, x11);
  await evalJs(`document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); true`);
  await sleep(150);
  check('the second Escape closes the panel', await evalJs(`document.getElementById('user-todos-popup').classList.contains('hidden')`));

  console.log('⑪b a modal above the panel (the ⤢ viewer) takes ONE Escape; the panel the next');
  await evalJs(`document.getElementById('taskbar-user-todos').click(); true`);
  check('(the panel reopens)', await waitFor(`!document.getElementById('user-todos-popup').classList.contains('hidden') && !!document.querySelector('#user-todos-popup .ut-item .ut-view')`, 3000));
  await evalJs(`document.querySelector('#user-todos-popup .ut-item .ut-view').click(); true`);
  check('the row\'s ⤢ opens the viewer modal (createModalShell #ut-viewer, focused)', await waitFor(`document.activeElement === document.getElementById('ut-viewer')`, 3000), await evalJs(`document.activeElement?.id || document.activeElement?.className`));
  const realEsc = async () => {
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await sleep(200);
  };
  await realEsc();
  const x11b = await evalJs(`({ viewer: !!document.getElementById('ut-viewer'), panel: !document.getElementById('user-todos-popup').classList.contains('hidden') })`);
  check('ONE real Escape closes the viewer only — the panel stays open', !x11b.viewer && x11b.panel, x11b);
  if (x11b.panel) {
    await evalJs(`document.getElementById('user-todos-popup').focus?.(); true`);
    await realEsc();
    check('the next Escape closes the panel', await evalJs(`document.getElementById('user-todos-popup').classList.contains('hidden')`));
  }

  console.log('⑩b replying from the popover: the typing path, resolved in place, the badge counts down');
  await clickBadge(liveWin);
  check('(the popover reopens)', await waitFor(`(() => { const p = document.querySelector('.ut-mini-popover[data-popover]'); return !!p && !!p.querySelector('.ut-item') && getComputedStyle(p).visibility === 'visible'; })()`, 3000)); // createPopover reveals on the next frame — a focus() before that lands nowhere
  const target10 = fourth.item.id;
  const miniRow = (id) => `.ut-mini-popover .ut-item[data-id=${JSON.stringify(id)}]`;
  const n10 = Number((await evalJs(badgeOf(liveWin)))?.n || 0);
  await evalJs(`document.querySelector(${JSON.stringify(miniRow(target10) + ' .ut-reply-btn')}).click(); true`);
  check('the row\'s reply button opens the box in the popover, focused', await waitFor(`document.activeElement === document.querySelector(${JSON.stringify(miniRow(target10) + ' .ut-reply textarea')})`, 3000),
    await evalJs(`({ row: document.querySelector(${JSON.stringify(miniRow(target10))})?.outerHTML.slice(0, 900), active: document.activeElement?.className, mini: document.querySelector('.ut-mini-popover .ut-mini-head')?.outerHTML })`));
  const before10 = stdinFrames().length;
  await cdp('Input.insertText', { text: 'from the title bar' });
  await pressEnter();
  await waitFrames(before10 + 1, 5000);
  const f10 = stdinFrames()[before10] || '';
  check(`the stub's stdin gets [For you reply #${target10}] … from the title bar`, f10.startsWith(`[For you reply #${target10}]`) && f10.endsWith('from the title bar'), f10.slice(0, 300));
  check('…the popover row resolves IN PLACE (still listed, struck through)', await waitFor(`document.querySelector(${JSON.stringify(miniRow(target10))})?.classList.contains('ut-item-inplace')`, 5000));
  check(`…and the badge counts down ${n10} → ${n10 - 1}`, await waitFor(`(() => { const b = (${badgeOf(liveWin)}); return ${n10 - 1} === 0 ? !b : (!!b && b.n === ${JSON.stringify(String(n10 - 1))}); })()`, 5000), await evalJs(badgeOf(liveWin)));
  for (const id of await evalJs(`[...document.querySelectorAll('.ut-mini-popover .ut-item:not(.ut-item-resolved)')].map((r) => r.dataset.id)`)) {
    await evalJs(`document.querySelector(${JSON.stringify(miniRow(id) + ' .ut-done')}).click(); true`);
    await waitFor(`document.querySelector(${JSON.stringify(miniRow(id))})?.classList.contains('ut-item-inplace')`, 4000);
  }
  check('marking the rest done from the popover removes the badge at 0', await waitFor(`!(${badgeOf(liveWin)})`, 5000), await evalJs(badgeOf(liveWin)));
  check('…while the popover keeps every row in its slot (append-only while open)', await evalJs(`${miniIds}.length === ${ids10.length}`), await evalJs(miniIds));
  await evalJs(`document.querySelectorAll('.ut-mini-popover').forEach((p) => p.remove()); true`);
  const notice9 = await fileItem(token, { text: 'FYI: nothing to decide', urgency: 'normal', kind: 'notice' });
  check('a NOTICE filed by the same session (kind notice)', notice9?.success && notice9.item?.kind === 'notice', notice9);
  await sleep(1200);
  check('⑨ …a session with only notices shows NO badge', !(await evalJs(badgeOf(liveWin))), await evalJs(badgeOf(liveWin)));

  console.log('⑫ in a tab chain the badge rides the tab');
  const after12 = await fileItem(token, { text: 'After the merge', urgency: 'urgent' });
  check('an urgent ask is filed', after12?.success, after12);
  check('(the live badge is back: 1, urgent)', await waitFor(`(() => { const b = (${badgeOf(liveWin)}); return !!b && b.n === '1' && b.urgency === 'urgent'; })()`, 5000));
  await evalJs(`app.wm.createTabChain(app.wm.windows.get(${JSON.stringify(viewWin)}), app.wm.windows.get(${JSON.stringify(liveWin)})); true`);
  await sleep(300);
  const tabBadge = (hostId, winId) => `(() => { const h = app.wm.windows.get(${JSON.stringify(hostId)}); const b = h && h.titleBar.querySelector('.tab-item[data-win-id=' + JSON.stringify(${JSON.stringify(winId)}) + '] .win-inbox-badge'); return b ? { n: b.textContent.trim(), urgency: b.dataset.urgency, label: b.getAttribute('aria-label') } : null; })()`;
  const x12 = await evalJs(`({ live: ${tabBadge(viewWin, liveWin)}, view: ${tabBadge(viewWin, viewWin)}, hostBar: !!app.wm.windows.get(${JSON.stringify(viewWin)}).titleBar.querySelector(':scope > .win-inbox-badge'), guestBar: !!app.wm.windows.get(${JSON.stringify(liveWin)}).titleBar.querySelector(':scope > .win-inbox-badge') })`);
  check('merged: each window\'s badge is on ITS tab item (live 1 urgent, stopped 1 high) and on no standalone bar', x12.live && x12.live.n === '1' && x12.live.urgency === 'urgent' && x12.view && x12.view.n === '1' && x12.view.urgency === 'high' && !x12.hostBar && !x12.guestBar, x12);
  await evalJs(`(() => { const h = app.wm.windows.get(${JSON.stringify(viewWin)}); h.titleBar.querySelector('.tab-item[data-win-id=' + JSON.stringify(${JSON.stringify(liveWin)}) + '] .win-inbox-badge').click(); return true; })()`);
  check('the tab\'s badge opens the popover of ITS session', await waitFor(`${miniIds}.includes(${JSON.stringify(after12.item.id)}) && !${miniIds}.includes(${JSON.stringify(HOSTILE_ID)})`, 3000), await evalJs(miniIds));
  await evalJs(`document.querySelectorAll('.ut-mini-popover').forEach((p) => p.remove()); true`);
  await evalJs(`(() => { const w = app.wm.windows.get(${JSON.stringify(liveWin)}); app.wm._detachFromChain(w._tabChain, w.id); return true; })()`);
  await sleep(300);
  const x12b = await evalJs(`({ live: ${badgeOf(liveWin)}, view: ${badgeOf(viewWin)}, tabs: document.querySelectorAll('.tab-item .win-inbox-badge').length })`);
  check('un-tabbed: both standalone title bars show their badges again, no tab badge left', x12b.live && x12b.live.n === '1' && x12b.view && x12b.view.n === '1' && x12b.tabs === 0, x12b);

  console.log('⑬ a hostile session name stays text');
  const HOSTILE_NAME = '<b onmouseover=window.__xss=3>';
  await evalJs(`window.__xss = undefined; app.sidebar.setCustomName(${JSON.stringify(`claude:${LIVE_SID}`)}, ${JSON.stringify(HOSTILE_NAME)}); true`);
  await evalJs(`app.wm.focusWindow(${JSON.stringify(liveWin)}); true`); // the detached window sits exactly over the host — bring the live one up
  await sleep(300);
  await clickBadge(liveWin);
  check('the popover head names the session by its (hostile) name, as TEXT', await waitFor(`document.querySelector('.ut-mini-popover .ut-mini-name')?.textContent === ${JSON.stringify(HOSTILE_NAME)}`, 6000), await evalJs(`document.querySelector('.ut-mini-popover .ut-mini-head')?.outerHTML`));
  const x13 = await evalJs(`(() => { const p = document.querySelector('.ut-mini-popover'); const w = app.wm.windows.get(${JSON.stringify(liveWin)}); const b = w.titleBar.querySelector(':scope > .win-inbox-badge'); for (const el of [p, b, w.titleBar, ...(p ? p.querySelectorAll('*') : [])]) el && el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); return { xss: window.__xss, bInPop: p ? p.querySelectorAll('b').length : -1, bInBar: w.titleBar.querySelectorAll('b').length, label: b ? b.getAttribute('aria-label') : null }; })()`);
  check('no <b> element was made from the name (popover or title bar), window.__xss stays undefined after mouseover', x13.xss === undefined && x13.bInPop === 0 && x13.bInBar === 0, x13);
  check('the badge\'s aria-label is plain text (no name, no markup)', x13.label === '1 items from this agent', x13);
  await evalJs(`document.querySelectorAll('.ut-mini-popover').forEach((p) => p.remove()); true`);

  console.log('⑭ negative control: the popover\'s key filter is what isolates it');
  {
    const src = fs.readFileSync(path.join(repo, 'src/lib/user-todos-layout.js'), 'utf8');
    const FILTER = 'ks.has(i.sessionKey)';
    check('the PURE module carries the key filter the panel calls (miniInboxEntries)', src.includes(FILTER) && fs.readFileSync(path.join(repo, 'src/lib/user-todos-panel.js'), 'utf8').includes('miniInboxEntries('));
    // both copies live OUTSIDE the checkout (scripts/mutant-copy.mjs, test-architecture §51); their
    // relative imports (inbox-reply.js, inbox-origin.js) are rewritten to the real files' URLs
    const MUT = mutantCopies('inbox-reply-ui-14', repo);
    const realF = MUT.write('src/lib/user-todos-layout.js', src, 'real');
    const patchedF = MUT.write('src/lib/user-todos-layout.js', src.split(FILTER).join('true'), 'patched');
    for (const row of copiesCensus(MUT.files, MUT.dir, repo, { minCopies: 2, label: '⑭ ' })) check(row.name, row.pass, row.detail);
    {
      const real = await import(realF);
      const patched = await import(patchedF);
      const todos = await storeNow();
      const keys = LIVE_KEYS;
      const r = real.miniInboxEntries(null, todos, keys).entries.map((e) => e.item.id);
      const p = patched.miniInboxEntries(null, todos, keys).entries.map((e) => e.item.id);
      check('the real filter lists only this session\'s rows', r.length >= 1 && !r.includes(HOSTILE_ID), r);
      check('a patched copy WITHOUT the key filter lists another session\'s row (the hostile item) — ⑩ can go red', p.includes(HOSTILE_ID), p);
    }
  }

  // ── ⑮ THE FLOOD FOLD + "Mark all seen" (chunk 4) ──
  console.log('⑮ a flooded group folds to 5 + "25 more…"; the expander opens it in place; "Mark all seen" strikes every row in place');
  {
    const floodKey = 'claude:' + FLOOD_SID;
    const floodWin = await evalJs(`app.viewSession(${JSON.stringify(FLOOD_SID)}, ${JSON.stringify(CWD)}, 'flood fixture', { backend: 'claude' })?.id || null`);
    check('the flood fixture conversation opens as a view-only window', !!floodWin, floodWin);
    check(`…whose title-bar badge counts its ${FLOOD_N} open asks`, await waitFor(`(${badgeOf(floodWin)})?.n === ${JSON.stringify(String(FLOOD_N))}`, 6000), await evalJs(badgeOf(floodWin)));
    const taskbarN = `[...document.querySelectorAll('#taskbar-user-todos .ut-count:not(.ut-seg-notice)')].reduce((a, e) => a + Number(e.textContent || 0), 0)`;
    const tb0 = await evalJs(taskbarN);
    await evalJs(`(() => { const p = document.getElementById('user-todos-popup'); if (!p.classList.contains('hidden')) document.getElementById('taskbar-user-todos').click(); document.getElementById('taskbar-user-todos').click(); return true; })()`);
    const gSel = `#user-todos-popup .ut-group[data-key=${JSON.stringify(floodKey)}]`;
    check('the For-you panel opens with the flood group', await waitFor(`!!document.querySelector(${JSON.stringify(gSel)})`, 5000));
    const rowsOf = `[...document.querySelectorAll(${JSON.stringify(gSel + ' > .ut-item')})]`;
    const x15 = await evalJs(`(() => { const g = document.querySelector(${JSON.stringify(gSel)}); const rows = ${rowsOf}; const f = g.querySelector(':scope > .ut-fold'); return { n: rows.length, ids: rows.map((r) => r.dataset.id), fold: f ? f.textContent : null, foldLast: g.lastElementChild === f, count: g.querySelector('.ut-group-n')?.textContent }; })()`);
    check('the group renders its 5 NEWEST rows and a "25 more…" expander as its last child', x15.n === 5 && JSON.stringify(x15.ids) === JSON.stringify(FLOOD_IDS.slice(0, 5)) && x15.fold === '25 more…' && x15.foldLast, x15);
    check('…while the head still counts all 30 open asks', x15.count === String(FLOOD_N), x15);
    await evalJs(`window.__f5 = ${rowsOf}; window.__f5top = window.__f5.map((r) => r.offsetTop); true`);
    const fb = await evalJs(`(() => { const f = document.querySelector(${JSON.stringify(gSel + ' > .ut-fold')}); f.scrollIntoView({ block: 'nearest' }); const q = f.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; })()`);
    await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: fb.x, y: fb.y, button: 'left', clickCount: 1 });
    await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: fb.x, y: fb.y, button: 'left', clickCount: 1 });
    check('a real click on the expander shows all 30 rows (the panel stays open)', await waitFor(`${rowsOf}.length === ${FLOOD_N} && !document.getElementById('user-todos-popup').classList.contains('hidden')`, 3000), await evalJs(`${rowsOf}.length`));
    const x15b = await evalJs(`(() => { const rows = ${rowsOf}; return { same: window.__f5.every((r, i) => rows[i] === r), tops: window.__f5.map((r) => r.offsetTop), before: window.__f5top, fold: !!document.querySelector(${JSON.stringify(gSel + ' > .ut-fold')}), order: JSON.stringify(rows.map((r) => r.dataset.id)) === ${JSON.stringify(JSON.stringify(FLOOD_IDS))} }; })()`);
    check("…the first 5 rows are the SAME nodes at the SAME offsetTop, the rest appended below in layout order, the expander gone", x15b.same && JSON.stringify(x15b.tops) === JSON.stringify(x15b.before) && !x15b.fold && x15b.order, x15b);
    const saSel = gSel + ' > .ut-group-bar > .ut-seen-all';
    check('the group bar carries "Mark all seen" (≥ 2 open asks) beside — not inside — the head button', await evalJs(`(() => { const b = document.querySelector(${JSON.stringify(saSel)}); return !!b && b.textContent === 'Mark all seen' && getComputedStyle(b).display !== 'none' && !b.closest('.ut-group-head'); })()`));
    await evalJs(`window.__f30 = ${rowsOf}; true`);
    const utu0 = frames.filter((m) => m && m.type === 'user-todos-updated').length;
    await evalJs(`document.querySelector(${JSON.stringify(saSel)}).click(); true`);
    check('every row strikes IN PLACE (.ut-item-inplace, the text line-through)', await waitFor(`(() => { const rows = ${rowsOf}; return rows.length === ${FLOOD_N} && rows.every((r) => r.classList.contains('ut-item-inplace') && getComputedStyle(r.querySelector('.ut-text')).textDecorationLine.includes('line-through')); })()`, 5000),
      await evalJs(`${rowsOf}.map((r) => r.className).slice(0, 3)`));
    check('…the SAME 30 nodes in the same order (nothing moved, nothing re-rendered)', await evalJs(`(() => { const rows = ${rowsOf}; return rows.length === window.__f30.length && rows.every((r, i) => r === window.__f30[i]); })()`));
    const st15 = await storeNow();
    check('the store holds all 30 dismissed by the user', FLOOD_IDS.every((id) => { const i = st15.resolved.find((x) => x.id === id) || st15.open.find((x) => x.id === id); return !i || (i.status === 'dismissed'); }) && !st15.open.some((i) => i.sessionKey === floodKey), st15.open.filter((i) => i.sessionKey === floodKey).length);
    check(`the taskbar count drops by exactly ${FLOOD_N} (${tb0} → ${tb0 - FLOOD_N})`, await waitFor(`${taskbarN} === ${tb0 - FLOOD_N}`, 4000), await evalJs(taskbarN));
    check("the flood window's title-bar badge is gone", await waitFor(`!(${badgeOf(floodWin)})`, 4000), await evalJs(badgeOf(floodWin)));
    check('"Mark all seen" hides itself (no open asks left)', await evalJs(`getComputedStyle(document.querySelector(${JSON.stringify(saSel)})).display === 'none'`));
    await sleep(1200);
    const utu = frames.filter((m) => m && m.type === 'user-todos-updated').length - utu0;
    check('a SECOND client (the node ws) saw exactly ONE user-todos-updated for the whole batch', utu === 1, utu);
    // a refusal reaches the user: the route's own 400 (an unknown status) worded in a toast — driven through the panel's handler with a stubbed fetch
    await evalJs(`(() => { window.__of = window.fetch; window.fetch = (u, o) => String(u).includes('resolve-many') ? Promise.resolve(new Response(JSON.stringify({ error: 'the store is read-only', code: 'failed' }), { status: 500, headers: { 'Content-Type': 'application/json' } })) : window.__of(u, o); return true; })()`);
    const live15 = await fileItem(token, { text: 'Flood check one', urgency: 'low' });
    const live15b = await fileItem(token, { text: 'Flood check two', urgency: 'low' });
    const liveBar = `#user-todos-popup .ut-group[data-key=${JSON.stringify(live15.item.sessionKey)}] > .ut-group-bar > .ut-seen-all`;
    await waitFor(`!!document.querySelector(${JSON.stringify(liveBar)}) && getComputedStyle(document.querySelector(${JSON.stringify(liveBar)})).display !== 'none'`, 5000);
    await evalJs(`document.querySelector(${JSON.stringify(liveBar)}).click(); true`);
    check('a failed "Mark all seen" is a toast naming the count and the reason', await waitFor(`[...document.querySelectorAll('.global-toast')].some((e) => /Could not update \\d+ items: the store is read-only/.test(e.textContent))`, 4000),
      await evalJs(`[...document.querySelectorAll('.global-toast')].map((e) => e.textContent).slice(-3)`));
    await evalJs(`window.fetch = window.__of; true`);
    check('…and nothing was resolved', !!live15?.success && !!live15b?.success && (await storeNow()).open.some((i) => i.id === live15.item.id));
  }

  // ── ⑯ THE BOARD CHIP (chunk 4) ──
  console.log('⑯ the board chip follows vibespace-status, patched in place');
  {
    const key16 = after12.item.sessionKey;
    const headSel = `#user-todos-popup .ut-group[data-key=${JSON.stringify(key16)}] > .ut-group-bar > .ut-group-head`;
    const rowSel16 = rowSel(after12.item.id);
    check('(the live group is in the panel)', await waitFor(`!!document.querySelector(${JSON.stringify(headSel)}) && !!document.querySelector(${JSON.stringify(rowSel16 + ' .ut-reply-btn')})`, 5000));
    check('no chip while the agent reported nothing', await evalJs(`!document.querySelector(${JSON.stringify(headSel + ' > .ut-board')})`));
    await evalJs(`document.querySelector(${JSON.stringify(rowSel16 + ' .ut-reply-btn')}).click(); true`);
    await waitFor(`document.activeElement === document.querySelector(${JSON.stringify(rowSel16 + ' .ut-reply textarea')})`, 3000);
    await cdp('Input.insertText', { text: 'typing while the board moves' });
    await evalJs(`window.__ta16 = document.querySelector(${JSON.stringify(rowSel16 + ' .ut-reply textarea')}); window.__rows16 = [...document.querySelectorAll('#user-todos-popup .ut-item')]; true`);
    const st = async (body) => (await fetch(`http://127.0.0.1:${PORT}/api/agent/session-status`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) })).json();
    const s1 = await st({ state: 'needs-input', reason: 'which region?', detail: 'us-east or eu-west — I recommend eu-west' });
    check('the agent reports needs-input through its own route', s1 && s1.success, s1);
    check('the group head shows the "needs input" chip beside the name, its title the reason', await waitFor(`(() => { const c = document.querySelector(${JSON.stringify(headSel + ' > .ut-board')}); return !!c && c.textContent === 'needs input' && c.dataset.state === 'needs-input' && c.title === 'which region?' && c.previousElementSibling?.classList.contains('ut-group-name'); })()`, 5000),
      await evalJs(`document.querySelector(${JSON.stringify(headSel)})?.outerHTML`));
    const x16 = await evalJs(`(() => { const ta = document.querySelector(${JSON.stringify(rowSel16 + ' .ut-reply textarea')}); const rows = [...document.querySelectorAll('#user-todos-popup .ut-item')]; return { same: ta === window.__ta16, value: ta && ta.value, focused: document.activeElement === ta, rows: rows.length === window.__rows16.length && rows.every((r, i) => r === window.__rows16[i]) }; })()`);
    check('…no row was rebuilt: the SAME reply textarea with its text and focus, every row the same node', x16.same && x16.value === 'typing while the board moves' && x16.focused && x16.rows, x16);
    const s2 = await st({ clear: true });
    check('the agent clears its status', s2 && s2.success, s2);
    check('…and the chip is gone', await waitFor(`!document.querySelector(${JSON.stringify(headSel + ' > .ut-board')})`, 5000));
    check('…the reply box still holds its text', await evalJs(`window.__ta16.isConnected && window.__ta16.value === 'typing while the board moves'`));
  }

  // ── ⑰ NOTICES BY ORIGIN (B-328d) ──
  console.log('⑰ the Notices area groups by ORIGIN behind filter chips; a chip hides the other groups — asks, chips and a typed reply box untouched');
  {
  try { // a leg that throws (a reverted panel has no strip) fails BY NAME and the battery goes on
    const P = '#user-todos-popup';
    check('(the panel is open with the half-typed reply box from ⑯)', await evalJs(`!document.getElementById('user-todos-popup').classList.contains('hidden') && window.__ta16?.isConnected && window.__ta16.value === 'typing while the board moves'`));
    const st = await storeNow();
    const openNotices = st.open.filter((i) => i.kind === 'notice');
    const agentN = openNotices.filter((i) => i.sessionKey !== 'accounts' && i.sessionKey !== 'channels').map((i) => i.id);
    const want = { spend: ['ut-5bed000001', 'ut-5bed000002', 'ut-5bed000003'], login: ['ut-10910000a1'], channels: ['ut-c4a0000001'], agent: agentN };
    check(`(the store holds the six seeded notices + the agent's own — agent group = ${agentN.length}: the ⑨ notice and the forged-origin seed)`, agentN.length >= 2 && agentN.includes('ut-f0e6000001') && openNotices.length === 5 + agentN.length, openNotices.map((i) => [i.id, i.origin]));
    const chipsNow = `[...document.querySelectorAll('${P} .ut-notices > .ut-chips > .ut-chip')].map((c) => ({ o: c.dataset.origin, label: c.querySelector('.ut-chip-label').textContent, n: c.querySelector('.ut-chip-n').textContent, on: c.classList.contains('on'), pressed: c.getAttribute('aria-pressed') }))`;
    const groupsNow = `[...document.querySelectorAll('${P} .ut-notices > .ut-notice-groups > .ut-notice-group')].map((g) => ({ o: g.dataset.origin, name: g.querySelector('.ut-group-name').textContent, n: g.querySelector('.ut-group-n').textContent, shown: getComputedStyle(g).display !== 'none', ids: [...g.querySelectorAll(':scope > .ut-item')].map((r) => r.dataset.id) }))`;
    const x17 = await evalJs(`({ chips: ${chipsNow}, groups: ${groupsNow}, strip: (() => { const e = document.querySelector('${P} .ut-notices > .ut-chips'); return e ? getComputedStyle(e).display : 'absent'; })(), xss: window.__xss })`);
    const total = Object.values(want).reduce((a, v) => a + v.length, 0);
    check(`the chip strip shows: All ${total} · Spending 3 · Login expiry 1 · Channels 1 · Agents ${agentN.length} (in the set's order, All first, "All" active)`,
      x17.strip !== 'none' && JSON.stringify(x17.chips.map((c) => [c.o, c.label, c.n])) === JSON.stringify([['all', 'All', String(total)], ['spend', 'Spending', '3'], ['login', 'Login expiry', '1'], ['channels', 'Channels', '1'], ['agent', 'Agents', String(agentN.length)]]) && x17.chips[0].on && x17.chips[0].pressed === 'true' && x17.chips.slice(1).every((c) => !c.on && c.pressed === 'false'), x17.chips);
    check('one group per origin in the same order, each head naming its producer with its OPEN count, every group shown',
      JSON.stringify(x17.groups.map((g) => [g.o, g.name, g.n, g.shown])) === JSON.stringify([['spend', 'Spending', '3', true], ['login', 'Login expiry', '1', true], ['channels', 'Channels', '1', true], ['agent', 'Agents', String(agentN.length), true]]), x17.groups);
    const byO = Object.fromEntries(x17.groups.map((g) => [g.o, g.ids]));
    check('each group lists exactly its producer\'s notices — the LEGACY spend notice (no origin) under Spending, the forged origin under Agents', Object.entries(want).every(([o, ids]) => (byO[o] || []).length === ids.length && ids.every((id) => byO[o].includes(id))), { byO, want });
    check('the forged origin string painted nothing (window.__xss undefined, no data-origin carries markup)', x17.xss === undefined && await evalJs(`[...document.querySelectorAll('[data-origin]')].every((e) => /^[a-z]+$/.test(e.dataset.origin))`), x17.xss);
    const tabSpan = (tabId, k) => `document.querySelector('${P} > .ut-tabs > .ut-tab[data-tab="${tabId}"] > .ut-tab-n[data-n="${k}"]')`;
    const openActs = st.open.filter((i) => i.kind !== 'notice');
    const WORSTSEG = { urgent: 'ut-seg-urgent', high: 'ut-seg-high', normal: 'ut-seg-norm', low: 'ut-seg-norm' }[WORST(openActs)];
    const t17 = await evalJs(`(() => { const a = ${tabSpan('inbox', 'action')}, n = ${tabSpan('inbox', 'notice')}, b = document.getElementById('taskbar-user-todos'); return { a: a && a.textContent, aShown: a && getComputedStyle(a).display !== 'none', aCls: a && a.className, aTitle: a && a.title, n: n && n.textContent, nCls: n && n.className, nTitle: n && n.title, btnTitle: b.title, label: a && a.parentElement.getAttribute('aria-label') }; })()`);
    check(`the Inbox tab carries the open asks (${openActs.length}, coloured by the worst tier: ${WORSTSEG}) and the grey notice count (${openNotices.length})`,
      t17.aShown && t17.a === String(openActs.length) && t17.aCls.includes(WORSTSEG) && t17.n === String(openNotices.length) && t17.nCls.includes('ut-seg-notice'), t17);
    check('…in the taskbar badge\'s own words (badge title = the ask words · the notice words)', t17.btnTitle === `${t17.aTitle} · ${t17.nTitle}` && t17.label === `Inbox, ${t17.aTitle}, ${t17.nTitle}`, t17);
    await evalJs(`document.querySelector('${P} .ut-notices')?.scrollIntoView({ block: 'start' }); true`);
    await shot('b328d-desktop-all', '#user-todos-popup');

    // a REAL click on the Spending chip
    await evalJs(`window.__act17 = [...document.querySelectorAll('${P} .ut-groups .ut-item')]; window.__chip17 = [...document.querySelectorAll('${P} .ut-chips > .ut-chip')]; window.__nt17 = ${tabSpan('inbox', 'notice')}; window.__tabs17 = document.querySelector('${P} > .ut-tabs'); true`);
    const chipSel = (o) => `${P} .ut-chips > .ut-chip[data-origin="${o}"]`;
    check('a real click on the Spending chip', await realClick(chipSel('spend')));
    check('…only the Spending group is shown; the chip is .on + aria-pressed, All is not', await waitFor(`(() => { const g = ${groupsNow}; const c = ${chipsNow}; return g.every((x) => x.shown === (x.o === 'spend')) && c.find((x) => x.o === 'spend').on && c.find((x) => x.o === 'spend').pressed === 'true' && !c.find((x) => x.o === 'all').on; })()`, 3000), await evalJs(`({ g: ${groupsNow}, c: ${chipsNow} })`));
    const x17b = await evalJs(`(() => { const act = [...document.querySelectorAll('${P} .ut-groups .ut-item')]; const chips = [...document.querySelectorAll('${P} .ut-chips > .ut-chip')]; return { acts: act.length === window.__act17.length && act.every((r, i) => r === window.__act17[i]), actShown: act.filter((r) => r.getClientRects().length).length, chips: chips.length === window.__chip17.length && chips.every((c, i) => c === window.__chip17[i]), ta: window.__ta16.isConnected && window.__ta16.value, tabs: document.querySelector('${P} > .ut-tabs') === window.__tabs17, open: !document.getElementById('user-todos-popup').classList.contains('hidden'), stored: localStorage.getItem('vibespace.ut-notice-filter') }; })()`);
    check('…the ask rows are the SAME nodes and still shown, every chip the same node, the tabs untouched, the panel still open', x17b.acts && x17b.actShown === await evalJs(`window.__act17.length`) && x17b.chips && x17b.tabs && x17b.open, x17b);
    check('…the half-typed reply box on an ask is the SAME node with its text', x17b.ta === 'typing while the board moves', x17b);
    check('…and the filter is stored per device (localStorage vibespace.ut-notice-filter = spend)', x17b.stored === 'spend', x17b);
    await shot('b328d-desktop-spend', '#user-todos-popup');

    // a broadcast while filtered: an agent notice lands HIDDEN in its group
    const filtered = await fileItem(token, { text: 'FYI: filed while the filter is on', urgency: 'low', kind: 'notice' });
    check('an agent notice is filed through the agent route while Spending is the filter', filtered?.success && filtered.item?.origin === 'agent', filtered);
    check('…the Agents chip counts it IN PLACE (same node), still inactive', await waitFor(`(() => { const c = document.querySelector('${chipSel('agent')}'); return !!c && c === window.__chip17.find((x) => x.dataset.origin === 'agent') && c.querySelector('.ut-chip-n').textContent === ${JSON.stringify(String(agentN.length + 1))} && !c.classList.contains('on'); })()`, 5000), await evalJs(chipsNow));
    const x17c = await evalJs(`(() => { const row = document.querySelector('${P} .ut-notice-group[data-origin="agent"] > .ut-item[data-id=${JSON.stringify(filtered.item.id)}]'); const g = ${groupsNow}; const act = [...document.querySelectorAll('${P} .ut-groups .ut-item')]; return { row: !!row, rowHidden: !!row && !row.getClientRects().length, onlySpend: g.every((x) => x.shown === (x.o === 'spend')), acts: act.length === window.__act17.length && act.every((r, i) => r === window.__act17[i]), ta: window.__ta16.isConnected && window.__ta16.value, nt: ${tabSpan('inbox', 'notice')} === window.__nt17 && window.__nt17.textContent }; })()`);
    check('…its row is in the (hidden) Agents group, only Spending still shows', x17c.row && x17c.rowHidden && x17c.onlySpend, x17c);
    check('…the ask rows and the typed reply box survived the broadcast (same nodes, same text)', x17c.acts && x17c.ta === 'typing while the board moves', x17c);
    check(`…and the Inbox tab's grey count ticked to ${openNotices.length + 1} in place (same span)`, x17c.nt === String(openNotices.length + 1), x17c);
    check('a click on the active Spending chip again = All', await realClick(chipSel('spend')) && await waitFor(`(() => { const g = ${groupsNow}; const c = ${chipsNow}; return g.every((x) => x.shown) && c.find((x) => x.o === 'all').on && localStorage.getItem('vibespace.ut-notice-filter') === 'all'; })()`, 3000), await evalJs(`({ g: ${groupsNow}, c: ${chipsNow} })`));
  } catch (e) { check('⑰ ran to its end', false, e.message); }
  }

  // ── ⑱ THE TAB COUNTS (B-328d) ──
  console.log('⑱ the tab counts patch in place: a toast ticks Notifications, showing it clears; the tabs node is never rebuilt');
  {
  try {
    const P = '#user-todos-popup';
    const tabSpan = (tabId, k) => `document.querySelector('${P} > .ut-tabs > .ut-tab[data-tab="${tabId}"] > .ut-tab-n[data-n="${k}"]')`;
    const unread = `(() => { const s = ${tabSpan('history', 'unread')}; return s && getComputedStyle(s).display !== 'none' ? Number(s.textContent) : 0; })()`;
    await evalJs(`window.__tabs18 = document.querySelector('${P} > .ut-tabs'); window.__un18 = ${tabSpan('history', 'unread')}; window.__ac18 = ${tabSpan('inbox', 'action')}; true`);
    const u0 = await evalJs(unread);
    const a0 = Number(await evalJs(`window.__ac18.textContent || 0`));
    const ask18 = await fileItem(token, { text: 'A new ask makes a toast', urgency: 'normal' });
    check('an ask is filed (its arrival is a real toast: "For you · …")', ask18?.success && await waitFor(`[...document.querySelectorAll('.global-toast')].some((e) => e.textContent.includes('A new ask makes a toast'))`, 5000), ask18);
    check(`the Notifications tab's unread count ticks ${u0} → ${u0 + 1} in place (same span, same tabs node)`, await waitFor(`${unread} === ${u0 + 1} && ${tabSpan('history', 'unread')} === window.__un18 && document.querySelector('${P} > .ut-tabs') === window.__tabs18`, 4000), await evalJs(unread));
    check(`…and the Inbox tab's ask count ${a0} → ${a0 + 1} (same span)`, await waitFor(`${tabSpan('inbox', 'action')} === window.__ac18 && window.__ac18.textContent === ${JSON.stringify(String(a0 + 1))}`, 4000), await evalJs(`window.__ac18.textContent`));
    const seen0 = Date.now();
    check('a real click on Notifications shows the history page with the toast on top', await realClick(`${P} > .ut-tabs > .ut-tab[data-tab="history"]`) && await waitFor(`(() => { const h = document.querySelector('${P} > .ut-hist'); return !!h && !document.querySelector('${P} > .ut-inbox') && (h.querySelector('.ut-hist-msg')?.textContent || '').includes('A new ask makes a toast'); })()`, 3000));
    const x18 = await evalJs(`(() => { const tabs = document.querySelector('${P} > .ut-tabs'); const h = tabs.querySelector('.ut-tab[data-tab="history"]'); return { same: tabs === window.__tabs18 && ${tabSpan('history', 'unread')} === window.__un18, unread: ${unread}, on: h.classList.contains('on') && h.getAttribute('aria-pressed') === 'true', inboxOff: !tabs.querySelector('.ut-tab[data-tab="inbox"]').classList.contains('on'), seen: Number(localStorage.getItem('vibespace.ut-history-seen')) }; })()`);
    check('…the unread count is gone, the history tab .on, the tabs node never rebuilt, the last look stamped', x18.same && x18.unread === 0 && x18.on && x18.inboxOff && x18.seen >= seen0 - 2000, x18);
    const ask18b = await fileItem(token, { text: 'A toast while the history is read', urgency: 'low' });
    check('a toast while the page is being read lands on it and never counts as unread', ask18b?.success && await waitFor(`(document.querySelector('${P} > .ut-hist .ut-hist-msg')?.textContent || '').includes('A toast while the history is read')`, 5000) && (await evalJs(unread)) === 0, await evalJs(unread));
    check('back on Inbox: the page returns under the SAME tabs node', await realClick(`${P} > .ut-tabs > .ut-tab[data-tab="inbox"]`) && await waitFor(`!!document.querySelector('${P} > .ut-inbox .ut-notice-group') && document.querySelector('${P} > .ut-tabs') === window.__tabs18 && document.querySelector('${P} > .ut-tabs > .ut-tab[data-tab="inbox"]').classList.contains('on')`, 3000));
    const after12Row = rowSel(after12.item.id);
    await evalJs(`document.querySelector(${JSON.stringify(after12Row + ' .ut-reply-btn')})?.click(); true`);
    check('…and the reply typed before the page switch comes back as the box\'s draft', await waitFor(`document.querySelector(${JSON.stringify(after12Row + ' .ut-reply textarea')})?.value === 'typing while the board moves'`, 3000), await evalJs(`document.querySelector(${JSON.stringify(after12Row + ' .ut-reply textarea')})?.value`));
    console.log('⑱b the filter is per DEVICE: it survives a close and an open');
    const clickChip = (o) => realClick(`${P} .ut-chips > .ut-chip[data-origin="${o}"]`);
    check('a click on the Login expiry chip', await clickChip('login') && await waitFor(`localStorage.getItem('vibespace.ut-notice-filter') === 'login'`, 3000));
    await evalJs(`document.getElementById('taskbar-user-todos').click(); true`);
    await sleep(200);
    await evalJs(`document.getElementById('taskbar-user-todos').click(); true`);
    check('closed and reopened: only the Login expiry group shows, its chip active', await waitFor(`(() => { const p = document.getElementById('user-todos-popup'); if (p.classList.contains('hidden')) return false; const gs = [...p.querySelectorAll('.ut-notice-group')]; return gs.length >= 4 && gs.every((g) => (getComputedStyle(g).display !== 'none') === (g.dataset.origin === 'login')) && p.querySelector('.ut-chip[data-origin="login"]').classList.contains('on'); })()`, 3000),
      await evalJs(`[...document.querySelectorAll('#user-todos-popup .ut-notice-group')].map((g) => [g.dataset.origin, getComputedStyle(g).display])`));
    check('(back to All)', await clickChip('all') && await waitFor(`localStorage.getItem('vibespace.ut-notice-filter') === 'all' && [...document.querySelectorAll('#user-todos-popup .ut-notice-group')].every((g) => getComputedStyle(g).display !== 'none')`, 3000));
  } catch (e) { check('⑱ ran to its end', false, e.message); }
  }

  // ── ⑱c THE HELD FILTER (r2, the verifier's S5) ──
  console.log('⑱c the filter in force is HELD per open: a stored choice absent at open becomes All (stored too), and a notice of that origin ARRIVING keeps every group shown');
  {
  try {
    const P = '#user-todos-popup';
    const LOGIN = 'ut-10910000a1';
    const shownNow = `Object.fromEntries([...document.querySelectorAll('${P} .ut-notices > .ut-notice-groups > .ut-notice-group')].map((g) => [g.dataset.origin, getComputedStyle(g).display !== 'none']))`;
    const orderNow = `[...document.querySelectorAll('${P} .ut-notices > .ut-notice-groups > .ut-notice-group')].map((g) => g.dataset.origin)`;
    const onNow = `[...document.querySelectorAll('${P} .ut-chips > .ut-chip.on')].map((c) => c.dataset.origin)`;
    const state = `({ shown: ${shownNow}, order: ${orderNow}, on: ${onNow}, stored: localStorage.getItem('vibespace.ut-notice-filter') })`;
    // another device's action: the panel's own cookie route (auth off in the scratch server)
    const setStatus = async (id, status) => (await fetch(`http://127.0.0.1:${PORT}/api/user-todos/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })).json();
    check('(the panel is open on All)', await evalJs(`!document.getElementById('user-todos-popup').classList.contains('hidden') && JSON.stringify(${onNow}) === '["all"]'`), await evalJs(state));
    check('a real click on the Login expiry chip: the device stores login', await realClick(`${P} .ut-chips > .ut-chip[data-origin="login"]`) && await waitFor(`localStorage.getItem('vibespace.ut-notice-filter') === 'login'`, 3000), await evalJs(state));
    const d = await setStatus(LOGIN, 'dismissed');
    check('the only login notice is dismissed elsewhere (POST /api/user-todos/:id) — its row resolves in place, the chip at 0', d?.success && d.item?.status === 'dismissed' && await waitFor(`document.querySelector('${P} .ut-chip[data-origin="login"] > .ut-chip-n')?.textContent === '0'`, 4000), d);
    await evalJs(`document.getElementById('taskbar-user-todos').click(); true`);
    await sleep(200);
    await evalJs(`document.getElementById('taskbar-user-todos').click(); true`);
    check('closed and reopened: no login group (a resolved row is not in an open\'s layout), every group shown, All the active chip — and the device now STORES all (the strip and the store agree; r1 left login stored)',
      await waitFor(`(() => { if (document.getElementById('user-todos-popup').classList.contains('hidden')) return false; const s = ${state}; return !('login' in s.shown) && s.order.length >= 3 && Object.values(s.shown).every(Boolean) && JSON.stringify(s.on) === '["all"]' && s.stored === 'all'; })()`, 3000), await evalJs(state));
    await evalJs(`window.__g18c = Object.fromEntries([...document.querySelectorAll('${P} .ut-notice-group')].map((g) => [g.dataset.origin, g])); window.__o18c = ${orderNow}; true`);
    const r = await setStatus(LOGIN, 'open');
    check('the login notice is reopened elsewhere (a notice of the formerly chosen origin ARRIVES by broadcast)', r?.success && r.item?.status === 'open', r);
    check('…its group APPENDS and EVERY group stays shown: All is still the active chip, login is not — nothing was clicked',
      await waitFor(`(() => { const s = ${state}; return s.shown.login === true && Object.values(s.shown).every(Boolean) && JSON.stringify(s.on) === '["all"]' && s.stored === 'all' && !!document.querySelector('${P} .ut-notice-group[data-origin="login"] > .ut-item[data-id="${LOGIN}"]'); })()`, 4000), await evalJs(state));
    const x18c = await evalJs(`(() => { const now = [...document.querySelectorAll('${P} .ut-notice-group')]; return { order: now.map((g) => g.dataset.origin), same: window.__o18c.every((o) => window.__g18c[o] && window.__g18c[o].isConnected && now.includes(window.__g18c[o])) }; })()`);
    check('…the groups already drawn keep their nodes and slots, login joins at the END', x18c.same && JSON.stringify(x18c.order) === JSON.stringify([...await evalJs('window.__o18c'), 'login']), x18c);
  } catch (e) { check('⑱c ran to its end', false, e.message); }
  }

  // ── ⑲ negative control for ⑰ ──
  console.log('⑲ negative control: noticeGroups\' filter is what hides the other groups');
  {
    const src = fs.readFileSync(path.join(repo, 'src/lib/user-todos-layout.js'), 'utf8');
    const FILTER = "shown: f === 'all' || f === origin";
    check('the PURE module carries the filter the panel hides by', src.includes(FILTER) && fs.readFileSync(path.join(repo, 'src/lib/user-todos-panel.js'), 'utf8').includes("const disp = g.shown ? '' : 'none';"));
    const MUT = mutantCopies('inbox-reply-ui-19', repo); // outside the checkout (§51), as ⑭
    const realF = MUT.write('src/lib/user-todos-layout.js', src, 'real');
    const patchedF = MUT.write('src/lib/user-todos-layout.js', src.split(FILTER).join('shown: true'), 'patched');
    for (const row of copiesCensus(MUT.files, MUT.dir, repo, { minCopies: 2, label: '⑲ ' })) check(row.name, row.pass, row.detail);
    {
      const real = await import(realF);
      const patched = await import(patchedF);
      const notices = (await storeNow()).open.filter((i) => i.kind === 'notice').map((item) => ({ item, resolved: false }));
      const shownOf = (m) => m.noticeGroups(notices, 'spend').filter((g) => g.shown).map((g) => g.origin);
      check('the real filter shows the Spending group only', JSON.stringify(shownOf(real)) === JSON.stringify(['spend']), shownOf(real));
      check('a patched copy that ignores the filter shows every group — ⑰ can go red', shownOf(patched).length >= 4, shownOf(patched));
    }
  }

  // ── ⑦ negative control ──
  console.log('⑦ negative control');
  const x7 = await evalJs(`new Promise((res) => { const d = document.createElement('div'); d.className = 'ut-item'; d.innerHTML = '<div class="ut-text">' + ${JSON.stringify(HOSTILE_TITLE)} + '</div>'; document.body.appendChild(d); setTimeout(() => { const v = window.__xss; d.remove(); res(v); }, 800); })`);
  check('a patched renderer copy that assigns innerHTML = the raw title DOES run it (window.__xss === 1) — ① can go red', x7 === 1, x7);
  check('no uncaught page exceptions on the desktop page', pageErrors.length === 0, pageErrors.slice(0, 3));

  // ── ⑥ the phone sheet ──
  console.log('⑥ the phone sheet');
  const phoneAsk = await fileItem(token, { text: 'Phone ask', urgency: 'high', options: ['Yes', 'No'] });
  check('a phone-sized item is filed', phoneAsk?.success, phoneAsk);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', platform: 'iPhone' });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await waitApp();
  await sleep(1200);
  check('the page is a phone (app.isMobile, the nav inbox button present)', await evalJs(`app.isMobile && !!document.getElementById('mobile-nav-todos')`));
  await evalJs(`document.getElementById('mobile-nav-todos').click(); true`);
  const phoneSel = rowSel(phoneAsk.item.id);
  check('the nav inbox opens the sheet listing the phone item', await waitFor(`!document.getElementById('user-todos-popup').classList.contains('hidden') && !!document.querySelector(${JSON.stringify(phoneSel)})`, 6000));
  await waitFor(`!!document.querySelector(${JSON.stringify(phoneSel + ' .ut-reply-btn')}) && !document.querySelector(${JSON.stringify(phoneSel + ' .ut-reply-btn')}).disabled`, 8000);
  await evalJs(`document.querySelector(${JSON.stringify(phoneSel + ' .ut-reply-btn')}).click(); true`);
  check('the same reply box opens on the phone', await waitFor(`!!document.querySelector(${JSON.stringify(phoneSel + ' .ut-reply textarea')})`, 3000));
  const sizes = await evalJs(`[...document.querySelectorAll('#user-todos-popup .ut-opt, #user-todos-popup .ut-reply-btn, #user-todos-popup .ut-act, #user-todos-popup .ut-reply textarea')].filter((el) => el.getClientRects().length).map((el) => { const r = el.getBoundingClientRect(); return { c: el.className.split(' ').pop(), w: Math.round(r.width), h: Math.round(r.height) }; })`);
  check(`every .ut-opt / .ut-reply-btn / .ut-act / the reply textarea is ≥ 36 px tall, the buttons ≥ 36 wide (${sizes.length} targets)`, sizes.length >= 8 && sizes.every((s) => s.h >= 36) && sizes.filter((s) => s.c !== 'ut-opt' && s.c !== 'ut-reply-input').every((s) => s.w >= 36), sizes);
  // B-328d on the phone: the same chip strip + origin groups, the chips ≥ 36 px, the tab counts
  const phone17 = await evalJs(`(() => { const p = document.getElementById('user-todos-popup'); const chips = [...p.querySelectorAll('.ut-chips > .ut-chip')].filter((c) => c.getClientRects().length).map((c) => ({ o: c.dataset.origin, h: Math.round(c.getBoundingClientRect().height) })); const tabs = [...p.querySelectorAll('.ut-tabs > .ut-tab')].map((b) => ({ t: b.dataset.tab, h: Math.round(b.getBoundingClientRect().height), n: [...b.querySelectorAll('.ut-tab-n')].filter((s) => getComputedStyle(s).display !== 'none').map((s) => s.textContent) })); return { chips, groups: [...p.querySelectorAll('.ut-notice-group')].map((g) => g.dataset.origin), tabs }; })()`);
  check(`the phone sheet carries the chip strip (${phone17.chips.length} chips, each ≥ 36 px) and the four origin groups`, phone17.chips.length >= 5 && phone17.chips[0].o === 'all' && phone17.chips.every((c) => c.h >= 36) && ['spend', 'login', 'channels', 'agent'].every((o) => phone17.groups.includes(o)), phone17);
  check('…and both tabs (≥ 36 px) carry their counts', phone17.tabs.length === 2 && phone17.tabs.every((b) => b.h >= 36) && phone17.tabs[0].n.length >= 1, phone17.tabs);
  await evalJs(`document.querySelector('#user-todos-popup .ut-notices')?.scrollIntoView({ block: 'start' }); true`);
  await shot('b328d-phone-sheet');
  await evalJs(`document.querySelector(${JSON.stringify(phoneSel + ' .ut-reply textarea')}).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); true`);
  await sleep(150);
  check('Escape inside the box FOLDS the box and the sheet stays open', await evalJs(`!document.querySelector(${JSON.stringify(phoneSel + ' .ut-reply')}) && !document.getElementById('user-todos-popup').classList.contains('hidden')`));
  await evalJs(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); true`);
  await sleep(150);
  check('the next Escape closes the sheet', await evalJs(`document.getElementById('user-todos-popup').classList.contains('hidden')`));
  check('no uncaught page exceptions on the phone', pageErrors.length === 0, pageErrors.slice(0, 3));

  try { liveWs.send(JSON.stringify({ type: 'kill', sessionId: sid })); await sleep(500); liveWs.close(); } catch {}
} catch (e) {
  failed++;
  console.error('  ✗ battery crashed: ' + (e.stack || e.message));
}

console.log(failed ? `FAILED (${failed})` : 'ALL PASS');
cleanup();
process.exit(failed ? 1 : 0);
