#!/usr/bin/env node
// test-inbox-window-ui — THE For-you WINDOW on a real page (docs/design-user-inbox-reply.md §9,
// 2026-09-27; the owner: "有时候agent给我发好几条很长的消息，在这么小的面板很难review … 可以打开一个
// 独立窗口来查看和处理这个inbox里的消息").
//
// The test-inbox-reply-ui idiom: a THROWAWAY server in a git worktree (own data/, a scratch
// HOME, per-run ports / names — scripts/scratch.mjs) + headless chrome over raw CDP + a stub
// `claude` behind the REAL chat-wrapper through the REAL create path (it records every stdin
// line and answers each user turn after 2.5 s). Seeded items in the store's own shape — one
// with a 3 000-char markdown detail (the store caps an agent's detail at 2 000; the file it
// loads does not, and the window must never cut whatever the store holds).
//   ① the popup row's ⤢ opens the window ON that item: its FULL detail readable (the whole
//      text, rendered markdown, wraps, scrolls inside the pane — the last line reachable)
//      while the popup's row is cut (behind a collapsed expander, 120 px when opened)
//   ② hostile title / detail / option / session name render as TEXT (+ ⑫ the control)
//   ③ Mark done moves the selection to the next open item (the mail-client rule); the
//      resolved row stays IN PLACE, dimmed, the same node
//   ④ a half-typed reply survives a user-todos-updated broadcast (same node, text, focus)
//   ⑤ …and Enter sends it: the stub's stdin gets `[For you reply #<id>] … <text>`, the row
//      resolves, the selection moves on
//   ⑥ keyboard: ↓ / k move the selection, Enter focuses the reply box, Esc returns to the list
//   ⑦ the mini inbox's ⤢ opens the window SCOPED to that session; "All sessions" widens it
//   ⑧ ⚙ Communication ▸ For you… opens it
//   ⑨ a second page gets the window replayed through its openSpec
//   ⑩ at 480 px the window shows ONE pane: the list, a row ⇒ the item with ‹ back
//   ⑪ the phone: one pane, every row and control ≥ 36 px
//   ⑫ NEGATIVE CONTROL: the hostile title through a raw innerHTML copy DOES run
// the verify round (2026-09-27):
//   ⑬ the wire: an OPEN item rides whole, a RESOLVED one as a 300-char preview + detailTruncated;
//      GET /api/user-todos/:id serves it whole, an agent token 403, an unknown id 404
//   ⑭ a resolved ~6 000-char item selected from the tail: the pane loads the rest (ONE GET) and
//      shows the end marker; the cut sentence goes
//   ⑮ THE READER'S TEXT NEVER SHRINKS: another client resolves the long OPEN item being read —
//      the row dims in place, the selection stays, the pane keeps the whole text with NO fetch
//   ⑯ the resolved tail's head closes even while one of its rows is selected (it was dead)
//   ⑰ under a session scope the empty hint names the scope; an account-level notice offers no
//      per-session scope button
//   ⑱ javascript: / data: / vbscript: links never survive; https gets _blank + noopener noreferrer
//   ⑲ the REAL vibespace-ask: a 9 000-char --detail is cut at 8 000 and the CLI says so; a 600-char
//      question at 500; 7 999 chars whole and silent
// lane inbox-reply-dead-session (userW inc-mvfuzlom-nwav 2026-10-19 — ten presses on this window's disabled box):
//   ② the ended conversation's box is TYPEABLE (a real click focuses it, typing lands), its note says the send reopens
//      it, its send reads 「Reopen and send」
//   ⑳ RED CONTROL first: a second page served a client bundle built with a PATCHED COPY of src/lib/inbox-window.js —
//      the lane's `c.ta.disabled = false` swapped back to the pre-lane `c.ta.disabled = !v.reply.enabled`
//      (pairing-ui-harness buildPatchedBundle, the copy outside the checkout) — the same item, the same real press:
//      the box is disabled, document.activeElement never the box, the typing lost (the incident). Then, last, on the
//      desktop: a REAL press on 「Reopen and send」 ⇒ the conversation resumes behind the real create path, the reply is
//      its FIRST input, it is live under one session, its window opens showing the reply, the item resolved
// lane inbox-fyi-mark-all (the owner 2026-10-22: 「inbox 里仅供知晓部分应该加一个一键已读的按钮」):
//   ㉑ «Mark all read» beside the Notices tab's count: a REAL press = ONE POST, ONE broadcast, the tab's count and the
//      taskbar badge's grey count at 0 in that same tick, every notice row resolved in place, a 5 s Undo (a REAL press ⇒
//      ONE POST, every one back open), disabled with its reason when nothing is open; the popup's notices head carries
//      the same button; a notice that asks nothing is read by reading it (1.5 s in the pane with the person in the
//      window — not before, not with focus elsewhere; one with chips never), and by ‹ back at once
// VS_SHOT_DIR=<dir> saves the screenshots (the window with a long item, the 480 px window,
// the popup with its new ⤢). Requires google-chrome (SKIP without).
import { execSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv, endRootedProcesses, takeCspReports } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs'; // ⑳'s RED CONTROL: the patched copy lives outside the checkout
import { buildPatchedBundle } from './pairing-ui-harness.mjs'; // …built into a client bundle the control page is served
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port (never the machine-global :7/5901 — test-architecture §57)
const require = createRequire(import.meta.url);

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }

const T0 = Date.now();
const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('inbox-window-ui-wt');
const fakeHome = scratchHome('inbox-window-ui-home', fs);
const stubDir = scratch('inbox-window-ui-stub');
fs.mkdirSync(stubDir, { recursive: true });
const CWD = path.join(fakeHome, 'proj');
const STOPPED_SID = 'f01d0000-0000-4000-8000-0000000c0de1'; // a stopped fixture conversation (the hostile item's)
const OTHER_SID = 'f01d0000-0000-4000-8000-0000000c0de2';   // another stopped conversation (the scope legs)
const LIVE_SID = 'f01d0000-0000-4000-8000-0000000c0dfe';    // the stub's own session id
const LIVE_KEY = 'claude:' + LIVE_SID;
let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── fixtures: two stopped conversations on disk ──
fs.mkdirSync(CWD, { recursive: true });
{
  const proj = path.join(fakeHome, '.claude', 'projects', CWD.replace(/[/._]/g, '-'));
  fs.mkdirSync(proj, { recursive: true });
  let ts0 = Date.now() - 3600e3; let n = 0;
  const ts = () => new Date((ts0 += 5e3)).toISOString();
  for (const SID of [STOPPED_SID, OTHER_SID]) {
    const lines = [];
    for (let k = 0; k < 2; k++) {
      lines.push(JSON.stringify({ type: 'user', message: { role: 'user', content: `question ${k}` }, uuid: `u-${n++}`, timestamp: ts(), cwd: CWD, sessionId: SID }));
      lines.push(JSON.stringify({ type: 'assistant', message: { id: `msg_${n}`, role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text: `answer ${k}` }], usage: { input_tokens: 1, output_tokens: 1 } }, uuid: `a-${n++}`, timestamp: ts(), cwd: CWD, sessionId: SID }));
    }
    fs.writeFileSync(path.join(proj, `${SID}.jsonl`), lines.join('\n') + '\n');
  }
}
// THE LONG ITEM: ~3 000 chars of real markdown (paragraphs, a list, bold, a code block), three
// markers spread through it — the window must show every one of them, the popup row none
const MARK_START = 'MARK-START-of-the-long-detail', MARK_MID = 'MARK-MIDDLE-of-the-long-detail', MARK_END = 'MARK-END-of-the-long-detail';
const para = (k) => `Paragraph ${k}: the migration moves every tenant's ledger to the new schema in three passes; each pass is idempotent, resumable and bounded by the window the operator sets, and a pass that fails leaves the old rows untouched so a rerun converges.`;
const LONG_DETAIL = [
  `${MARK_START} — **please review before Friday.**`, '',
  para(1), '', para(2), '',
  '- first, the dry run on staging', '- then the canary tenants', '- finally the long tail, in batches of 500', '',
  para(3), '', `${MARK_MID} — the rollback plan follows.`, '',
  '```sql', 'UPDATE ledger SET schema_version = 7 WHERE tenant_id IN (SELECT id FROM tenants WHERE canary);', '```', '',
  para(4), '', para(5), '', para(6), '', para(7), '', para(8), '', para(9), '', para(10), '', para(11), '',
  `Last line: ${MARK_END}.`,
].join('\n');
if (LONG_DETAIL.length < 3000) throw new Error(`the long fixture is ${LONG_DETAIL.length} chars — the leg promises 3 000`);
const HOSTILE_ID = 'ut-00000000c1';
const HOSTILE_TITLE = '<img src=x onerror=window.__xss=1>';
const HOSTILE_OPT = '"><svg onload=window.__xss=2>';
const HOSTILE_DETAIL = '</div><img src=y onerror=window.__xss=3><script>window.__xss=4</script>';
const HOSTILE_NAME = '<b onmouseover=window.__xss=5>stopped</b>';
const LONG_ID = 'ut-10a9000001', A2_ID = 'ut-10a9000002', A3_ID = 'ut-10a9000003', OTHER_ID = 'ut-0ther00001', NOTICE_ID = 'ut-5bed0000c1';
// the verify round (2026-09-27): a ~6 000-char RESOLVED item (the wire carries 300 chars of it — the window
// loads the rest), a ~6 000-char OPEN item another client resolves while it is read, and the link vectors
const BIG_RESOLVED_ID = 'ut-b19000000a', BIG_OPEN_ID = 'ut-b19000000b', LINKS_ID = 'ut-11nk0000001';
// lane browser-probe-transient (B-0b8c): the browser keeper's could-not-read-the-version notice — the product's own words
// (PURE floorNotice / floorNoticeDetail over an exhausted ladder), its Check again door (⑭)
const FLOOR_ID = 'ut-f100r00001';
// lane inbox-fyi-mark-all (㉑): three notices that ask nothing + one that offers choices (never read by being shown)
const RA1_ID = 'ut-4ead000001', RA2_ID = 'ut-4ead000002', RA3_ID = 'ut-4ead000003', RA_OPT_ID = 'ut-4ead0000c0';
const BPF = require('../src/browser-profiles.js'), BFF = require('../src/browser-facts.js');
const FLOOR_V = BPF.floorVerdict('', BPF.FLOOR_VERSION, { ok: false, exhausted: true, attempts: 6, at: 834e3, since: 1e3, why: 'timed out after 8 s' });
const MARK_BIG_R = 'MARK-END-of-the-big-resolved', MARK_BIG_O = 'MARK-END-of-the-big-open';
const BIG = (mark) => Array.from({ length: 24 }, (_, k) => para(k + 1)).join('\n\n') + '\n\n' + mark;
if (BIG('x').length < 5000 || BIG('x').length > 8000) throw new Error(`the big fixture is ${BIG('x').length} chars — the legs want 5 000–8 000`);
const LINKS_DETAIL = ['[js](javascript:window.__xss=6)', '[data](data:text/html;base64,PHNjcmlwdD53aW5kb3cuX194c3M9Nzwvc2NyaXB0Pg==)', '[vb](vbscript:msgbox)', '![img](javascript:window.__xss=8)', '<a href="javascript:window.__xss=9">raw</a>', '[ok](https://example.com/x)', 'https://example.com/auto'].join('\n\n');
const now = Date.now();
const seed = (id, sessionKey, x) => ({ id, sessionKey, detail: null, urgency: 'normal', kind: 'action', options: null, reply: null, status: 'open', by: 'agent', origin: 'agent', jobId: null, createdAt: now - 60e3, resolvedAt: null, resolvedBy: null, sessionName: null, ...x });
const SEEDED = [
  seed(LONG_ID, LIVE_KEY, { text: 'Review the ledger migration plan (long)', detail: LONG_DETAIL, urgency: 'high', createdAt: now - 20e3 }),
  seed(A2_ID, LIVE_KEY, { text: 'Second ask for the live session', createdAt: now - 40e3 }),
  seed(A3_ID, LIVE_KEY, { text: 'Third ask for the live session', createdAt: now - 30e3 }),
  seed(HOSTILE_ID, 'claude:' + STOPPED_SID, { text: HOSTILE_TITLE, detail: HOSTILE_DETAIL, urgency: 'high', options: [HOSTILE_OPT, 'fine'], sessionName: HOSTILE_NAME, createdAt: now - 90e3, cwd: CWD }), // cwd: the asker's folder — ⑳'s reopen locates the transcript there
  seed(OTHER_ID, 'claude:' + OTHER_SID, { text: 'An ask from another session', createdAt: now - 80e3 }),
  seed(NOTICE_ID, 'accounts', { kind: 'notice', origin: 'spend', sessionName: 'Spending', text: 'Account A has used 10 of its 12 unattended turns this hour (83%).', createdAt: now - 70e3 }),
  seed(BIG_RESOLVED_ID, 'claude:' + OTHER_SID, { text: 'A long item handled yesterday', detail: BIG(MARK_BIG_R), status: 'done', resolvedBy: 'user', resolvedAt: now - 86400e3, createdAt: now - 90000e3 }),
  seed(BIG_OPEN_ID, LIVE_KEY, { text: 'A long open item that gets resolved elsewhere', detail: BIG(MARK_BIG_O), createdAt: now - 50e3 }),
  seed(LINKS_ID, 'claude:' + OTHER_SID, { text: 'Links in an item', detail: LINKS_DETAIL, createdAt: now - 85e3 }),
  seed(RA1_ID, 'accounts', { kind: 'notice', origin: 'spend', sessionName: 'Spending', text: 'Account B has used 6 of its 12 unattended turns this hour (50%).', createdAt: now - 71e3 }),
  seed(RA2_ID, 'accounts', { kind: 'notice', origin: 'spend', sessionName: 'Spending', text: 'Account C has used 7 of its 12 unattended turns this hour (58%).', createdAt: now - 72e3 }),
  seed(RA3_ID, 'accounts', { kind: 'notice', origin: 'spend', sessionName: 'Spending', text: 'Account D has used 8 of its 12 unattended turns this hour (66%).', createdAt: now - 73e3 }),
  seed(RA_OPT_ID, 'accounts', { kind: 'notice', origin: 'spend', sessionName: 'Spending', text: 'Account E crossed its daily budget — keep the cap?', options: ['Keep it', 'Raise it'], createdAt: now - 74e3 }),
  seed(FLOOR_ID, 'browser', { kind: 'notice', origin: 'browser', sessionName: 'Agent browser', text: BPF.floorNotice(FLOOR_V), detail: BPF.floorNoticeDetail(FLOOR_V, { retryMs: BFF.PROBE_RETRY_MS, timeoutMs: BFF.PROBE_TIMEOUT_MS }), action: { type: 'browser-floor-check' }, createdAt: now - 75e3 }),
];
// ⑭'s browser CLI: its --version fails while <state>/fail exists (so the keeper's boot probe misses and the seeded notice
// stands), then answers 0.38.1 — paths baked in (agentEnv strips unknown env), first on the server's PATH
const AB_DIR = path.join(stubDir, 'ab'), AB_STATE = path.join(stubDir, 'ab-state');
fs.mkdirSync(AB_DIR, { recursive: true }); fs.mkdirSync(AB_STATE, { recursive: true });
fs.writeFileSync(path.join(AB_STATE, 'fail'), '');
fs.writeFileSync(path.join(AB_DIR, 'agent-browser'), `#!${process.execPath}
const fs = require('fs');
if (process.argv[2] === '--version' && !fs.existsSync(${JSON.stringify(path.join(AB_STATE, 'fail'))})) { console.log('agent-browser 0.38.1'); process.exit(0); }
process.stderr.write('fake: no answer\\n'); process.exit(1);
`, { mode: 0o755 });

// ── throwaway server in a worktree (overlays the built public/ + the working src/) ──
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
fs.writeFileSync(path.join(wt, 'data', 'user-todos.json'), JSON.stringify({ items: SEEDED }, null, 2));

// The stub CLI (node, absolute shebang — agentEnv() strips unknown env, so its paths are baked in).
const stubPath = path.join(stubDir, 'claude');
const STDIN_LOG = path.join(stubDir, 'stdin.ndjson');
fs.writeFileSync(stubPath, `#!${process.execPath}
const fs = require('fs');
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('2.1.274 (Claude Code) stub'); process.exit(0); }
if (args.includes('--help')) { console.log('Usage: claude [options]'); process.exit(0); }
fs.writeFileSync(${JSON.stringify(stubDir)} + '/env-' + process.pid + '.json', JSON.stringify(process.env));
// a RESUMED run (lane inbox-reply-dead-session ⑳) is that conversation: it echoes --resume's id and logs its stdin apart
const RESUME = args.includes('--resume') ? args[args.indexOf('--resume') + 1] : null;
const SID = RESUME || ${JSON.stringify(LIVE_SID)};
const STDIN_TO = RESUME ? ${JSON.stringify(stubDir)} + '/stdin-' + RESUME + '.ndjson' : ${JSON.stringify(STDIN_LOG)};
const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
out({ type: 'system', subtype: 'init', session_id: SID, model: 'claude-fable-5', cwd: ${JSON.stringify(CWD)}, tools: [], permissionMode: 'default', claude_code_version: '2.1.274' });
let n = 0, buf = '';
process.stdin.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    fs.appendFileSync(STDIN_TO, line + '\\n');
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
const SRV_PATH = AB_DIR + ':' + (process.env.PATH || ''); // ⑭'s browser CLI first
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PATH: SRV_PATH, PORT: String(PORT), HOME: fakeHome, CLAUDE_CMD: stubPath, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' }, stdio: 'ignore' });
const chromeDir = `${wt}-chrome`;
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu',
  '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-timer-throttling', `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore' });
let cleaned = false;
const cleanup = () => {
  if (cleaned) return; cleaned = true;
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv.kill('SIGKILL'); } catch {}
  // every process this suite caused — the dtach session, the wrapper, the stub, the worktree's
  // device daemon, chrome's helpers — judged by /proc EVIDENCE (cwd, HOME or an argv token under
  // one of this run's scratch roots), never by a name
  for (const root of [wt, chromeDir, fakeHome, stubDir]) { try { endRootedProcesses(root); } catch {} }
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  for (const d of [wt, chromeDir, fakeHome, stubDir]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });
for (let i = 0; i < 60; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); break; } catch { await sleep(250); } }

// ── raw CDP, one connection per page ──
const WebSocket = require('ws');
async function connect(wsUrl) {
  const sock = new WebSocket(wsUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r) => sock.on('open', r));
  let seq = 0; const pend = new Map(); const errors = [];
  sock.on('message', (d) => {
    const m = JSON.parse(d);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') { try { errors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'unknown'); } catch {} }
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
  return { sock, cdp, evalJs, waitFor, waitApp, errors };
}
let target = null;
for (let i = 0; i < 120 && !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((x) => x.type === 'page'); } catch {}
  if (!target) await sleep(250);
}
if (!target) { console.error('✗ chrome never exposed a CDP page target'); process.exit(1); }
const P1 = await connect(target.webSocketDebuggerUrl);
const { cdp, evalJs, waitFor, waitApp } = P1;
const key = async (k, { code = k, vk = 0, text } = {}) => {
  await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  if (text) await cdp('Input.dispatchKeyEvent', { type: 'char', key: k, code, text, unmodifiedText: text, windowsVirtualKeyCode: vk });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  await sleep(120);
};
const pressEnter = () => key('Enter', { vk: 13, text: '\r' });
const stdinFrames = () => {
  if (!fs.existsSync(STDIN_LOG)) return [];
  return fs.readFileSync(STDIN_LOG, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((m) => m && m.type === 'user')
    .map((m) => { const c = m.message && m.message.content; return typeof c === 'string' ? c : Array.isArray(c) ? c.map((b) => b.text || '').join('') : ''; });
};
const waitFrames = async (n, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (stdinFrames().length >= n) return true; await sleep(100); } return stdinFrames().length >= n; };
const stubToken = () => {
  for (const f of fs.readdirSync(stubDir).filter((x) => x.startsWith('env-'))) {
    try { const e = JSON.parse(fs.readFileSync(path.join(stubDir, f), 'utf8')); if (e.VIBESPACE_SESSION_TOKEN) return e.VIBESPACE_SESSION_TOKEN; } catch {}
  }
  return null;
};
const fileItem = async (token, add) => (await fetch(`http://127.0.0.1:${PORT}/api/agent/user-todo`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ add }) })).json();
const storeNow = async () => (await (await fetch(`http://127.0.0.1:${PORT}/api/user-todos`)).json()).todos;
// a leg's PREMISE (lane inbox-fyi-mark-all): these items open — an earlier leg may have READ a notice by showing it 1.5 s
const ensureOpen = async (ids) => { const st = await storeNow(); for (const id of ids) if (!st.open.some((i) => i.id === id)) await fetch(`http://127.0.0.1:${PORT}/api/user-todos/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'open' }) }); };
const shot = async (P, name, sel) => {
  const dir = process.env.VS_SHOT_DIR;
  if (!dir) return;
  try {
    const r = sel ? await P.evalJs(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const q = e.getBoundingClientRect(); return { x: Math.max(0, q.left - 4), y: Math.max(0, q.top - 4), width: q.width + 8, height: q.height + 8, scale: 1 }; })()`) : null;
    const img = await P.cdp('Page.captureScreenshot', { format: 'png', ...(r ? { clip: r } : {}), captureBeyondViewport: false });
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name + '.png'), Buffer.from(img.data, 'base64'));
    console.log(`    (screenshot ${name}.png)`);
  } catch (e) { console.log(`    (screenshot ${name} failed: ${e.message})`); }
};
// A REAL click on the element `sel` names: scrolled into view, the point PROVEN to hit it
// (a toast over it clears once and retries — a covered point would be an outside click).
const realClick = async (P, sel) => {
  for (let k = 0; k < 2; k++) {
    const r = await P.evalJs(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const q = e.getBoundingClientRect(); const x = q.left + Math.min(q.width / 2, 40), y = q.top + q.height / 2; const hit = document.elementFromPoint(x, y); return { x, y, hits: !!hit && (hit === e || e.contains(hit)) }; })()`);
    if (!r) return false;
    if (!r.hits) { await P.evalJs(`document.querySelectorAll('#global-toasts > .global-toast').forEach((el) => el.remove()); true`); continue; }
    await P.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
    await P.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', buttons: 1, clickCount: 1 });
    await P.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(120);
    return true;
  }
  return false;
};
const WIN = `[...app.wm.windows.values()].find((w) => w.type === 'inbox')`;
const ST = `(${WIN})?._inbox?.state`;
const IW = '.window .iw';
const rowSel = (id) => `${IW} .iw-row[data-id=${JSON.stringify(id)}]`;
const popRow = (id) => `#user-todos-popup .ut-item[data-id=${JSON.stringify(id)}]`;
const displayRows = `[...document.querySelectorAll('${IW} .iw-list .iw-row')].map((r) => ({ id: r.dataset.id, resolved: r.classList.contains('iw-row-resolved') }))`;

try {
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await waitApp();
  await sleep(800);

  console.log('setup: a live stub session (its id = the seeded items\' key) + an item filed through the REAL agent route');
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
  check('the stub received its session token (vsst_)', !!token && token.startsWith('vsst_'), token);
  let a4 = null;
  for (let i = 0; i < 20; i++) { a4 = await fileItem(token, { text: 'Fourth ask, filed by the agent route', urgency: 'normal' }); if (a4?.item?.sessionKey === LIVE_KEY) break; await sleep(300); }
  check(`the agent route files under the live session's key ${LIVE_KEY} — the seeded items belong to it`, a4?.success && a4.item.sessionKey === LIVE_KEY, a4);
  // the live session reaches the page's live facts (the reply verdict) before any leg replies
  check('the page knows the live session (its reply verdict is "enabled")', await waitFor(`!!app._inboxModel && app._inboxModel.replyState(app._inboxModel.byId(${JSON.stringify(LONG_ID)}) || { sessionKey: ${JSON.stringify(LIVE_KEY)} }).enabled === true`, 15000));

  // ── ① the popup row's ⤢ → the window ON that item, the full detail vs the cut row ──
  console.log('① the popup row\'s ⤢ opens the window on that item — the FULL long detail, while the popup row is cut');
  const popupCut = `(() => { const r = document.querySelector(${JSON.stringify(popRow(LONG_ID))}); if (!r) return null; const d = r.querySelector('.ut-detail-exp'); const vis = r.innerText; const was = d.open; d.open = true; const det = r.querySelector('.ut-detail'); const clip = { sh: det.scrollHeight, ch: det.clientHeight }; d.open = was; return { hasEnd: vis.includes(${JSON.stringify(MARK_END)}), hasStart: vis.includes(${JSON.stringify(MARK_START)}), detailOpen: was, clip }; })()`;
  await evalJs(`document.getElementById('taskbar-user-todos').click(); true`);
  check('the popup opens listing the long item', await waitFor(`!!document.querySelector(${JSON.stringify(popRow(LONG_ID))})`));
  const cut1 = await evalJs(popupCut);
  check('the popup row is CUT: its visible text holds none of the detail (a collapsed expander), and opened, the detail is clipped at its 120 px box', cut1 && !cut1.hasStart && !cut1.hasEnd && !cut1.detailOpen && cut1.clip.sh > cut1.clip.ch + 20 && cut1.clip.ch <= 121, cut1);
  check('the popup\'s tab strip carries the new ⤢ (labelled, a sibling of the tabs)', await evalJs(`(() => { const b = document.querySelector('#user-todos-popup .ut-tabs > .ut-open-win'); return !!b && b.getAttribute('aria-label') === 'Open as a window' && !b.classList.contains('ut-tab'); })()`));
  await shot(P1, 'popup-open-as-window', '#user-todos-popup');
  check('a REAL click on the row\'s ⤢', await realClick(P1, popRow(LONG_ID) + ' .ut-view'));
  check('the For-you window opens (type inbox) with the long item SELECTED; the popup stepped aside', await waitFor(`(() => { const s = ${ST}; return !!s && s.selected === ${JSON.stringify(LONG_ID)} && s.tab === 'actions' && !s.scopeKey && document.getElementById('user-todos-popup').classList.contains('hidden'); })()`, 6000), await evalJs(`${ST} || null`));
  const pane1 = await evalJs(`(() => { const it = document.querySelector('${IW} .iw-item[data-id=${JSON.stringify(LONG_ID)}]'); if (!it) return null; const det = it.querySelector('.iw-detail'); const cs = getComputedStyle(det); const txt = det.textContent; return { title: it.querySelector('.iw-title').textContent, len: txt.length, marks: [${JSON.stringify(MARK_START)}, ${JSON.stringify(MARK_MID)}, ${JSON.stringify(MARK_END)}].map((m) => txt.includes(m)), clipped: det.scrollHeight > det.clientHeight + 1 || det.scrollWidth > det.clientWidth + 1, maxH: cs.maxHeight, overflowY: cs.overflowY, lis: det.querySelectorAll('li').length, code: det.querySelector('pre code')?.textContent || '', strong: det.querySelectorAll('strong').length, expander: it.querySelectorAll('details').length, ws: cs.whiteSpace, verbatim: txt.includes('**') && txt.includes('\x60\x60\x60') && txt.includes('UPDATE ledger SET schema_version = 7') }; })()`);
  check(`the pane shows the WHOLE ${LONG_DETAIL.length}-char detail (${pane1 && pane1.len} chars rendered — drawn as written — all three markers: start, middle, end)`, !!pane1 && pane1.marks.every(Boolean) && pane1.len >= LONG_DETAIL.length - 200 && pane1.title === 'Review the ledger migration plan (long)', pane1);
  check('…at full width and never cut: no max-height, no clipping of its own, no expander', !!pane1 && !pane1.clipped && pane1.maxH === 'none' && pane1.overflowY === 'visible' && pane1.expander === 0, pane1);
  // lane foryou-honest (the stress evaluation's P1-2): ONE renderer with the tray — the agent's words AS WRITTEN (markdown turned `__tests__/` into a bold «tests/»)
  check('…drawn AS WRITTEN, the tray\'s renderer: its list marks, its ** and its ``` fence are the agent\'s own characters, the line breaks kept (pre-wrap) — no <li>, no <strong>, no <pre>', !!pane1 && pane1.lis === 0 && pane1.strong === 0 && pane1.code === '' && pane1.verbatim && pane1.ws === 'pre-wrap', pane1);
  const scroll1 = await evalJs(`(() => { const pane = document.querySelector('${IW} .iw-pane'); const before = { sh: pane.scrollHeight, ch: pane.clientHeight }; pane.scrollTop = pane.scrollHeight; const det = pane.querySelector('.iw-detail'); const w = document.createTreeWalker(det, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) if (n.data.includes(${JSON.stringify(MARK_END)})) break; if (!n) return { before, found: false }; const rg = document.createRange(); const at = n.data.indexOf(${JSON.stringify(MARK_END)}); rg.setStart(n, at); rg.setEnd(n, at + ${MARK_END.length}); const r = rg.getBoundingClientRect(); const pr = pane.getBoundingClientRect(); const win = pane.closest('.window').getBoundingClientRect(); return { before, found: true, inPane: r.top >= pr.top - 1 && r.bottom <= pr.bottom + 1 && r.left >= pr.left - 1 && r.right <= pr.right + 1, inWindow: r.bottom <= win.bottom + 1 }; })()`);
  check('…the pane SCROLLS inside the window (the text is taller than the pane) and the last line is reachable: scrolled down, it sits inside the pane', scroll1.before.sh > scroll1.before.ch && scroll1.found && scroll1.inPane && scroll1.inWindow, scroll1);
  await evalJs(`document.querySelector('${IW} .iw-pane').scrollTop = 0; true`);
  await shot(P1, 'inbox-window-desktop-long-item', '.window:has(.iw)');
  // both at once: the popup (reopened) still cuts the row while the window shows it all
  await evalJs(`document.getElementById('taskbar-user-todos').click(); true`);
  await waitFor(`!document.getElementById('user-todos-popup').classList.contains('hidden') && !!document.querySelector(${JSON.stringify(popRow(LONG_ID))})`, 4000);
  const cut2 = await evalJs(popupCut);
  const stillFull = await evalJs(`(document.querySelector('${IW} .iw-item[data-id=${JSON.stringify(LONG_ID)}] .iw-detail')?.textContent || '').includes(${JSON.stringify(MARK_END)})`);
  check('BOTH AT ONCE: the reopened popup row is cut (no detail text, 120 px box) while the window still shows the last line', cut2 && !cut2.hasEnd && cut2.clip.sh > cut2.clip.ch + 20 && stillFull, { cut2, stillFull });
  await evalJs(`document.getElementById('taskbar-user-todos').click(); true`);
  await sleep(200);

  // ── ② hostile strings render as TEXT ──
  console.log('② hostile title / detail / option / session name render as text');
  await evalJs(`window.__xss = undefined; app.sidebar.setCustomName(${JSON.stringify('claude:' + STOPPED_SID)}, ${JSON.stringify(HOSTILE_NAME)}); true`);
  await sleep(300);
  check('a REAL click on the hostile row selects it', await realClick(P1, rowSel(HOSTILE_ID)) && await waitFor(`${ST}?.selected === ${JSON.stringify(HOSTILE_ID)} && !!document.querySelector('${IW} .iw-item[data-id=${JSON.stringify(HOSTILE_ID)}]')`, 4000));
  await sleep(500);
  // (lane voice-everywhere: the reply box's microphone carries our own constant SVG icon — chrome, never a peer string)
  const x2 = await evalJs(`(() => { const root = document.querySelector('${IW}'); const it = root.querySelector('.iw-item'); for (const el of root.querySelectorAll('*')) el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); const g = [...root.querySelectorAll('.iw-group')].find((x) => x.dataset.key === ${JSON.stringify('claude:' + STOPPED_SID)}); return { xss: window.__xss, title: it.querySelector('.iw-title').textContent, detail: it.querySelector('.iw-detail').textContent.trim(), opts: [...it.querySelectorAll('.iw-opt')].map((o) => o.textContent), name: it.querySelector('.iw-sess-name').textContent, groupName: g ? g.querySelector('.iw-group-name').textContent : null, rowTitle: root.querySelector('.iw-row[data-id=${JSON.stringify(HOSTILE_ID)}] .iw-row-title').textContent, scope: root.querySelector('.iw-scope-one').textContent, bad: [...root.querySelectorAll('img, script, b, svg')].filter((e) => !e.closest('.iw-actions, .chat-voice-btn')).length }; })()`);
  check('window.__xss stays undefined after the hostile item painted and every element was hovered', x2.xss === undefined, x2);
  check('the pane title / detail / option chips are the RAW strings (TEXT, no element made of them; a chip reads as the reply it sends — «Reply: <label>», lane controls-that-lie)', x2.title === HOSTILE_TITLE && x2.detail === HOSTILE_DETAIL && x2.opts[0] === 'Reply: ' + HOSTILE_OPT && x2.opts[1] === 'Reply: fine' && x2.bad === 0, x2);
  check('the hostile SESSION NAME is text in the pane head, the list\'s group head and the scope button; the row title raw', x2.name === HOSTILE_NAME && x2.groupName === HOSTILE_NAME && x2.scope === HOSTILE_NAME && x2.rowTitle === HOSTILE_TITLE, x2);
  // lane inbox-reply-dead-session: the ended conversation's box is NEVER disabled — the fact said, the send reopens it
  const IT2 = `${IW} .iw-item[data-id=${JSON.stringify(HOSTILE_ID)}]`;
  const x2b = await evalJs(`(() => { const it = document.querySelector(${JSON.stringify(IT2)}); const ta = it.querySelector('.iw-reply-input'); const w = it.querySelector('.iw-reply-why'); const b = it.querySelector('.iw-act[data-act="reply"]'); return { ta: ta.disabled, why: w.textContent, whyShown: w.style.display !== 'none', above: w.getBoundingClientRect().bottom <= ta.getBoundingClientRect().top + 1, label: b && b.querySelector('.iw-act-label').textContent, btn: b && b.disabled, chips: [...it.querySelectorAll('.iw-opt')].map((o) => o.disabled) }; })()`);
  check('…its reply box is TYPEABLE (never disabled), the note ABOVE it says the conversation ended and the send reopens it, the send reads 「Reopen and send」, the chips pressable', x2b.ta === false && x2b.why === 'This conversation has ended — sending reopens it with this reply as its first message' && x2b.whyShown && x2b.above && x2b.label === 'Reopen and send' && x2b.btn === false && x2b.chips.length === 2 && x2b.chips.every((d) => d === false), x2b);
  const TA2 = IT2 + ' .iw-reply-input';
  check('a REAL click into that box focuses it (document.activeElement IS the box)', await realClick(P1, TA2) && await waitFor(`document.activeElement === document.querySelector(${JSON.stringify(TA2)})`, 2000));
  await cdp('Input.insertText', { text: 'typed on an ended conversation' });
  check('…and real typing lands in it', (await evalJs(`document.querySelector(${JSON.stringify(TA2)}).value`)) === 'typed on an ended conversation');
  await evalJs(`(() => { const ta = document.querySelector(${JSON.stringify(TA2)}); ta.value = ''; ta.blur(); return true; })()`); // (the RED CONTROL on a patched bundle is ⑳'s first half)

  // ── ③ Mark done: the mail-client rule + the in-place row ──
  console.log('③ Mark done moves the selection to the next open item; the resolved row stays in place, dimmed');
  check('(the long item is selected again by a real click)', await realClick(P1, rowSel(LONG_ID)) && await waitFor(`${ST}?.selected === ${JSON.stringify(LONG_ID)}`, 3000));
  const order3 = await evalJs(displayRows);
  const at3 = order3.findIndex((r) => r.id === LONG_ID);
  const want3 = (order3.slice(at3 + 1).find((r) => !r.resolved) || order3.slice(0, at3).reverse().find((r) => !r.resolved) || {}).id || null;
  await evalJs(`window.__row3 = document.querySelector(${JSON.stringify(rowSel(LONG_ID))}); true`);
  check(`(there is an open row after it to move to: ${want3})`, !!want3 && at3 >= 0, order3);
  check('a REAL click on Mark done', await realClick(P1, `${IW} .iw-item[data-id=${JSON.stringify(LONG_ID)}] .iw-act[data-act="done"]`));
  check(`the selection moves to the NEXT open item (${want3}) and the pane shows it`, await waitFor(`${ST}?.selected === ${JSON.stringify(want3)} && !!document.querySelector('${IW} .iw-item[data-id=${JSON.stringify(want3)}]')`, 5000), await evalJs(`${ST}`));
  const x3 = await evalJs(`(() => { const r = document.querySelector(${JSON.stringify(rowSel(LONG_ID))}); const rows = [...document.querySelectorAll('${IW} .iw-list .iw-row')]; return { same: r === window.__row3, connected: !!r && r.isConnected, resolved: !!r && r.classList.contains('iw-row-resolved'), opacity: r ? Number(getComputedStyle(r).opacity) : 1, index: rows.indexOf(r), on: !!r && r.classList.contains('on') }; })()`);
  check(`the resolved row stays IN PLACE — the same node at the same index (${at3}), dimmed (opacity ${x3.opacity}), struck, no longer selected`, await waitFor(`document.querySelector(${JSON.stringify(rowSel(LONG_ID))})?.classList.contains('iw-row-resolved')`, 5000) && x3.same && x3.index === at3 && x3.opacity < 1 && !x3.on, x3);
  check('the store says done (the popup\'s own route)', (await storeNow()).resolved.some((i) => i.id === LONG_ID && i.status === 'done'));

  // ── ④ + ⑤ the reply box: survives a broadcast, then Enter sends it ──
  console.log('④ a half-typed reply survives a broadcast (same node, text, focus)');
  const openLive = (await evalJs(displayRows)).filter((r) => !r.resolved).map((r) => r.id).filter((id) => [A2_ID, A3_ID, a4.item.id].includes(id));
  const Z = openLive[0];
  check(`(an open item of the live session to answer: ${Z})`, !!Z, openLive);
  await realClick(P1, rowSel(Z));
  check('…selected, its reply box enabled', await waitFor(`${ST}?.selected === ${JSON.stringify(Z)} && document.querySelector('${IW} .iw-item[data-id=${JSON.stringify(Z)}] .iw-reply-input')?.disabled === false`, 4000));
  check('a REAL click into the reply box focuses it', await realClick(P1, `${IW} .iw-item[data-id=${JSON.stringify(Z)}] .iw-reply-input`) && await waitFor(`document.activeElement === document.querySelector('${IW} .iw-reply-input')`, 2000));
  const TYPED = 'half-typed in the window';
  await cdp('Input.insertText', { text: TYPED });
  await evalJs(`window.__ta = document.querySelector('${IW} .iw-reply-input'); true`);
  const arrived = await fileItem(token, { text: 'An ask that arrives while you type', urgency: 'low' });
  check('an item is filed through the agent route meanwhile (a user-todos-updated broadcast)', arrived?.success, arrived);
  check('…its row appears in the window\'s list', await waitFor(`!!document.querySelector(${JSON.stringify(rowSel(arrived.item.id))})`, 5000));
  const x4 = await evalJs(`(() => { const ta = document.querySelector('${IW} .iw-reply-input'); return { same: ta === window.__ta, connected: window.__ta.isConnected, value: window.__ta.value, focused: document.activeElement === window.__ta }; })()`);
  check('the SAME textarea is still in the pane, with its text and its focus', x4.same && x4.connected && x4.value === TYPED && x4.focused, x4);

  console.log('⑤ Enter sends it: quoted on the stub\'s stdin, the row resolves, the selection moves on');
  const before5 = stdinFrames().length;
  await pressEnter();
  const got5 = await waitFrames(before5 + 1, 6000);
  const f5 = stdinFrames()[before5] || '';
  check(`within 6 s the stub's stdin holds ONE user frame opening with [For you reply #${Z}] and ending with the typed text`, got5 && f5.startsWith(`[For you reply #${Z}]`) && f5.endsWith(TYPED), f5.slice(0, 300));
  check('a toast says "Reply sent"', await waitFor(`[...document.querySelectorAll('.global-toast')].some((e) => e.textContent.includes('Reply sent'))`, 4000));
  check('the row resolves in place (struck, dimmed) and the selection moved to another open item', await waitFor(`document.querySelector(${JSON.stringify(rowSel(Z))})?.classList.contains('iw-row-resolved') && ${ST}?.selected !== ${JSON.stringify(Z)}`, 6000), await evalJs(`${ST}`));
  check('the store says done by your reply', (await storeNow()).resolved.some((i) => i.id === Z && i.resolvedBy === 'reply' && i.reply?.text === TYPED));

  // ── ⑥ keyboard ──
  console.log('⑥ keyboard: ↓ / k move the selection, Enter focuses the reply box, Esc returns to the list');
  await realClick(P1, rowSel(arrived.item.id));
  check('(a click on a row leaves focus on the list)', await waitFor(`document.activeElement === document.querySelector('${IW} .iw-list') && ${ST}?.selected === ${JSON.stringify(arrived.item.id)}`, 3000));
  const ids6 = (await evalJs(displayRows)).map((r) => r.id);
  const i6 = ids6.indexOf(arrived.item.id);
  const down = ids6[Math.min(ids6.length - 1, i6 + 1)], up = ids6[Math.max(0, i6 - 1)];
  await key('ArrowDown', { vk: 40 });
  check(`↓ selects the next row (${down})`, await waitFor(`${ST}?.selected === ${JSON.stringify(down)}`, 2000), await evalJs(`${ST}?.selected`));
  await key('k', { vk: 75, code: 'KeyK', text: 'k' });
  check(`k selects the previous row again (${arrived.item.id})`, await waitFor(`${ST}?.selected === ${JSON.stringify(arrived.item.id)}`, 2000), await evalJs(`${ST}?.selected`));
  await key('ArrowUp', { vk: 38 });
  check(`↑ selects the row above (${up})`, await waitFor(`${ST}?.selected === ${JSON.stringify(up)}`, 2000), await evalJs(`${ST}?.selected`));
  await key('j', { vk: 74, code: 'KeyJ', text: 'j' });
  check('j moves back down', await waitFor(`${ST}?.selected === ${JSON.stringify(arrived.item.id)}`, 2000));
  await pressEnter();
  check('Enter focuses the reply box of the selected item (a live session\'s)', await waitFor(`document.activeElement === document.querySelector('${IW} .iw-item[data-id=${JSON.stringify(arrived.item.id)}] .iw-reply-input')`, 2000), await evalJs(`document.activeElement?.className`));
  await cdp('Input.insertText', { text: 'kept' });
  await key('Escape', { vk: 27 });
  check('Esc in the box returns focus to the list, and the box keeps its text', await waitFor(`document.activeElement === document.querySelector('${IW} .iw-list') && document.querySelector('${IW} .iw-reply-input')?.value === 'kept'`, 2000), await evalJs(`({ a: document.activeElement?.className, v: document.querySelector('${IW} .iw-reply-input')?.value })`));
  check('…the window is still open (Esc in the box closes nothing)', await evalJs(`!!(${WIN})`));

  // ── ⑦ the mini inbox's ⤢: scoped to that session ──
  console.log('⑦ the title-bar mini inbox\'s ⤢ opens the window scoped to that session');
  await evalJs(`app.attachSession(${JSON.stringify(sid)}, 'live stub', ${JSON.stringify(CWD)}, { mode: 'chat', backend: 'claude' }); true`);
  check('the live chat window attaches', await waitFor(`!!document.querySelector('.chat-view .chat-input')`, 20000));
  const liveWin = await evalJs(`[...app.sessions.entries()].find(([w, v]) => v.sessionId === ${JSON.stringify(sid)})?.[0] || null`);
  await evalJs(`app.wm.focusWindow(${JSON.stringify(liveWin)}); true`);
  // lane foryou-folds: a title-bar badge counts that conversation's rows in bands 1–4 — its asks so far are band 5, so the
  // agent files a DECISION (option chips, band 4) for the badge to count
  const dec7 = await fileItem(token, { text: 'A decision for the title bar', urgency: 'normal', options: ['Yes', 'No'] });
  check('(a band-4 decision is filed for the live session)', !!dec7?.success, dec7);
  await waitFor(`!!app.wm.windows.get(${JSON.stringify(liveWin)})?.titleBar.querySelector(':scope > .win-inbox-badge')`, 8000);
  const badgeAt = await evalJs(`(() => { const b = app.wm.windows.get(${JSON.stringify(liveWin)}).titleBar.querySelector(':scope > .win-inbox-badge'); const q = b.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; })()`);
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await cdp('Input.dispatchMouseEvent', { type, x: badgeAt.x, y: badgeAt.y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
  check('its title-bar badge opens the mini inbox, whose head carries the ⤢ (labelled)', await waitFor(`(() => { const b = document.querySelector('.ut-mini-popover .ut-mini-head > .ut-open-win'); return !!b && b.getAttribute('aria-label') === "Open this session's inbox as a window" && getComputedStyle(document.querySelector('.ut-mini-popover')).visibility === 'visible'; })()`, 4000));
  check('a REAL click on the mini inbox\'s ⤢', await realClick(P1, '.ut-mini-popover .ut-mini-head > .ut-open-win'));
  check('the window is revealed SCOPED to that session (the popover closed)', await waitFor(`(() => { const s = ${ST}; return !!s && s.scopeKey === ${JSON.stringify(LIVE_KEY)} && !document.querySelector('.ut-mini-popover'); })()`, 4000), await evalJs(`${ST}`));
  const x7 = await evalJs(`(() => { const rows = [...document.querySelectorAll('${IW} .iw-list .iw-row')].map((r) => r.dataset.id); const m = app._inboxModel; return { rows, keys: rows.map((id) => m.byId(id)?.sessionKey), one: document.querySelector('${IW} .iw-scope-one')?.classList.contains('on'), all: document.querySelector('${IW} .iw-scope-btn[data-scope="all"]')?.classList.contains('on') }; })()`);
  check(`it lists ONLY that session's rows (${x7.rows.length}): no other session's, the "this session" scope pressed`, x7.rows.length >= 3 && x7.keys.every((k) => k === LIVE_KEY || k === `webui:${sid}`) && !x7.rows.includes(OTHER_ID) && !x7.rows.includes(HOSTILE_ID) && x7.one && !x7.all, x7);
  check('"All sessions" widens it again (the other session\'s row returns)', await realClick(P1, `${IW} .iw-scope-btn[data-scope="all"]`) && await waitFor(`!!document.querySelector(${JSON.stringify(rowSel(OTHER_ID))}) && !${ST}.scopeKey`, 3000));
  // the text filter narrows the list (every term)
  await realClick(P1, `${IW} .iw-filter`);
  await cdp('Input.insertText', { text: 'another session' });
  check('the filter box narrows the list to the rows matching every term', await waitFor(`(() => { const ids = [...document.querySelectorAll('${IW} .iw-list .iw-row')].map((r) => r.dataset.id); return ids.length === 1 && ids[0] === ${JSON.stringify(OTHER_ID)}; })()`, 3000), await evalJs(`[...document.querySelectorAll('${IW} .iw-list .iw-row')].map((r) => r.dataset.id)`));
  await key('Escape', { vk: 27 });
  check('Esc in the filter clears it (the whole list returns)', await waitFor(`document.querySelector('${IW} .iw-filter').value === '' && document.querySelectorAll('${IW} .iw-list .iw-row').length > 3`, 3000));
  // the Notices tab: the notice is there, with its count
  check('the Notices tab lists the notice (a real click), the Actions tab carries the open asks\' count', await realClick(P1, `${IW} .iw-tab[data-tab="notices"]`) && await waitFor(`${ST}?.tab === 'notices' && !!document.querySelector(${JSON.stringify(rowSel(NOTICE_ID))}) && Number(document.querySelector('${IW} .iw-tab[data-tab="actions"] .iw-tab-n').textContent) >= 3`, 3000));
  await realClick(P1, `${IW} .iw-tab[data-tab="actions"]`);

  // ── ⑬–⑲ the verify round (2026-09-27): long text on the wire and in the pane, the reader's text, the tail head, the scoped hint, links, the CLI's cut ──
  console.log('⑬ the wire: an OPEN item rides whole, a RESOLVED one as a 300-char preview; GET /api/user-todos/:id serves it whole, cookie-only');
  const wire = await storeNow();
  const wr = wire.resolved.find((i) => i.id === BIG_RESOLVED_ID), wo = wire.open.find((i) => i.id === BIG_OPEN_ID);
  check(`the resolved ~6 000-char item rides as 300 chars + detailTruncated (${wr && wr.detail.length}); the open one whole (${wo && wo.detail.length})`, !!wr && wr.detail.length === 300 && wr.detailTruncated === true && !!wo && wo.detail.length > 5000 && wo.detailTruncated === undefined, { r: wr && [wr.detail.length, wr.detailTruncated], o: wo && [wo.detail.length, wo.detailTruncated] });
  const one = await (await fetch(`http://127.0.0.1:${PORT}/api/user-todos/${BIG_RESOLVED_ID}`)).json();
  check('GET /api/user-todos/:id serves the resolved item WHOLE (the end marker present, no flag)', !!one.item && one.item.detail.endsWith(MARK_BIG_R) && one.item.detailTruncated === undefined, one.item && [one.item.detail.length, one.item.detailTruncated]);
  const forb = await fetch(`http://127.0.0.1:${PORT}/api/user-todos/${BIG_RESOLVED_ID}`, { headers: { Authorization: `Bearer ${token}` } });
  check('…an agent token is refused 403 agent_forbidden; an unknown id 404', forb.status === 403 && (await forb.json()).code === 'agent_forbidden' && (await fetch(`http://127.0.0.1:${PORT}/api/user-todos/ut-nope`)).status === 404, forb.status);

  console.log('⑭ a resolved long item in the window: the pane loads the rest and shows it whole');
  await evalJs(`window.__fetches = []; const of = window.fetch; window.fetch = function (u, ...a) { window.__fetches.push(String(u)); return of.call(this, u, ...a); }; true`);
  if (!(await evalJs(`${ST}.tailOpen`))) await realClick(P1, `${IW} .iw-tail-head`);
  check('the resolved tail opens and lists the long resolved item (its row a ≤ 160-char preview)', await waitFor(`!!document.querySelector(${JSON.stringify(rowSel(BIG_RESOLVED_ID))})`, 3000) && await evalJs(`(document.querySelector(${JSON.stringify(rowSel(BIG_RESOLVED_ID))}).querySelector('.iw-row-sub')?.textContent || '').length <= 161`));
  check('a REAL click on it', await realClick(P1, rowSel(BIG_RESOLVED_ID)));
  check('the pane shows the WHOLE item within 3 s — the end marker present, the cut sentence gone — through ONE GET of the item', await waitFor(`(() => { const it = document.querySelector('${IW} .iw-item[data-id=${JSON.stringify(BIG_RESOLVED_ID)}]'); return !!it && it.querySelector('.iw-detail').textContent.includes(${JSON.stringify(MARK_BIG_R)}) && getComputedStyle(it.querySelector('.iw-detail-cut')).display === 'none'; })()`, 3000) && await evalJs(`window.__fetches.filter((u) => u.includes('/api/user-todos/${BIG_RESOLVED_ID}')).length === 1`), await evalJs(`({ f: window.__fetches, cut: document.querySelector('${IW} .iw-detail-cut')?.textContent, len: document.querySelector('${IW} .iw-item .iw-detail')?.textContent.length })`));
  check('the model now holds it whole (detailTruncated gone)', await evalJs(`!app._inboxModel.byId(${JSON.stringify(BIG_RESOLVED_ID)}).detailTruncated`));

  console.log('⑮ the reader\'s text never shrinks: another client resolves the long OPEN item being read');
  await realClick(P1, `${IW} .iw-tail-head`); // fold the tail (its selected row: the selection moves off it — ⑯ proves the rule)
  await realClick(P1, rowSel(BIG_OPEN_ID));
  check('the long open item is selected and read whole', await waitFor(`${ST}?.selected === ${JSON.stringify(BIG_OPEN_ID)} && (document.querySelector('${IW} .iw-item .iw-detail')?.textContent || '').includes(${JSON.stringify(MARK_BIG_O)})`, 3000), await evalJs(`${ST}`));
  await evalJs(`window.__fetches = []; true`);
  const done15 = await (await fetch(`http://127.0.0.1:${PORT}/api/user-todos/${BIG_OPEN_ID}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'done' }) })).json();
  check('(another client marks it done through the route)', done15.success === true, done15);
  check('the row resolves in place, the selection stays, and the pane STILL holds the whole text — restored from what this client saw, no fetch', await waitFor(`document.querySelector(${JSON.stringify(rowSel(BIG_OPEN_ID))})?.classList.contains('iw-row-resolved')`, 5000) && await evalJs(`(() => { const it = document.querySelector('${IW} .iw-item[data-id=${JSON.stringify(BIG_OPEN_ID)}]'); const m = app._inboxModel.byId(${JSON.stringify(BIG_OPEN_ID)}); return !!it && it.querySelector('.iw-detail').textContent.includes(${JSON.stringify(MARK_BIG_O)}) && !m.detailTruncated && m.detail.length > 5000 && window.__fetches.filter((u) => u.includes('/api/user-todos/${BIG_OPEN_ID}')).length === 0 && ${ST}.selected === ${JSON.stringify(BIG_OPEN_ID)}; })()`), await evalJs(`({ f: window.__fetches, sel: ${ST}.selected, len: app._inboxModel.byId(${JSON.stringify(BIG_OPEN_ID)})?.detail?.length, tr: app._inboxModel.byId(${JSON.stringify(BIG_OPEN_ID)})?.detailTruncated })`));
  check('…while the wire carried it as a 300-char preview', (await storeNow()).resolved.find((i) => i.id === BIG_OPEN_ID)?.detailTruncated === true);

  console.log('⑯ the resolved tail\'s head closes even while one of its rows is selected');
  await realClick(P1, `${IW} .iw-tail-head`);
  await realClick(P1, rowSel(BIG_RESOLVED_ID));
  check('(a tail row is selected, the tail open)', await waitFor(`${ST}?.selected === ${JSON.stringify(BIG_RESOLVED_ID)} && ${ST}.tailOpen === true`, 3000), await evalJs(`${ST}`));
  check('a REAL click on the tail head', await realClick(P1, `${IW} .iw-tail-head`));
  check('the tail closes and the selection moves to the first open row (the head was a dead control before: render re-opened the tail around its selected row)', await waitFor(`(() => { const s = ${ST}; return s.tailOpen === false && !!s.selected && s.selected !== ${JSON.stringify(BIG_RESOLVED_ID)} && !document.querySelector(${JSON.stringify(rowSel(BIG_RESOLVED_ID))}); })()`, 3000), await evalJs(`${ST}`));

  console.log('⑰ under a session scope the empty hint names the scope; an account-level notice offers no session scope');
  await evalJs(`app.openInbox({ sessionKey: 'claude:00000000-dead-4000-8000-000000000000' }); true`);
  check('a scope on a session with no items says "No open items for this session." — never "Nothing needs you right now"', await waitFor(`(() => { const e = document.querySelector('${IW} .iw-list-empty'); return ${ST}?.scopeKey === 'claude:00000000-dead-4000-8000-000000000000' && document.querySelectorAll('${IW} .iw-list .iw-row').length === 0 && e.textContent === 'No open items for this session.'; })()`, 3000), await evalJs(`document.querySelector('${IW} .iw-list-empty')?.textContent`));
  await realClick(P1, `${IW} .iw-tab[data-tab="notices"]`);
  check('…and on the Notices tab "No notices for this session."', await waitFor(`document.querySelector('${IW} .iw-list-empty')?.textContent === 'No notices for this session.'`, 2000), await evalJs(`document.querySelector('${IW} .iw-list-empty')?.textContent`));
  await realClick(P1, `${IW} .iw-tab[data-tab="actions"]`);
  await realClick(P1, `${IW} .iw-scope-btn[data-scope="all"]`);
  check('All sessions widens it again', await waitFor(`!${ST}.scopeKey && document.querySelectorAll('${IW} .iw-list .iw-row').length >= 3`, 3000));
  await ensureOpen([NOTICE_ID]); // ⑦'s Notices tab showed it (lane inbox-fyi-mark-all: a notice on screen 1.5 s is read)
  await realClick(P1, `${IW} .iw-tab[data-tab="notices"]`);
  await realClick(P1, rowSel(NOTICE_ID));
  check('with an account-level notice selected no per-session scope button is offered (its first item\'s name would label a button scoping every account notice)', await waitFor(`${ST}?.selected === ${JSON.stringify(NOTICE_ID)} && document.querySelector('${IW} .iw-scope-one').style.display === 'none'`, 3000), await evalJs(`({ sel: ${ST}.selected, one: document.querySelector('${IW} .iw-scope-one').style.display, txt: document.querySelector('${IW} .iw-scope-one').textContent })`));
  await realClick(P1, `${IW} .iw-tab[data-tab="actions"]`);

  console.log('⑱ links in an item: javascript: / data: / vbscript: never survive; an https link opens beside the workspace');
  await evalJs(`window.__xss = undefined; true`);
  check('a REAL click on the links item', await realClick(P1, rowSel(LINKS_ID)) && await waitFor(`${ST}?.selected === ${JSON.stringify(LINKS_ID)}`, 3000));
  const x18 = await evalJs(`(() => { const det = document.querySelector('${IW} .iw-item[data-id=${JSON.stringify(LINKS_ID)}] .iw-detail'); const as = [...det.querySelectorAll('a')].map((a) => ({ href: a.getAttribute('href'), target: a.target, rel: a.rel, text: a.textContent })); const imgs = [...det.querySelectorAll('img')].map((i) => i.getAttribute('src')); const fy = [...det.querySelectorAll('.fy-link')].map((s) => ({ kind: s.dataset.fy, ref: s.dataset.ref })); return { xss: window.__xss, as, imgs, fy, raw: det.textContent.includes('<a href="javascript:window.__xss=9">raw</a>') }; })()`);
  check('no anchor carries a javascript: / data: / vbscript: href; the raw <a> is text; nothing ran', x18.xss === undefined && x18.as.every((a) => !/^\s*(javascript|data|vbscript):/i.test(String(a.href || ''))) && x18.raw, x18);
  // lane foryou-honest: the pane draws no markup at all — an https URL is a .fy-link span (THE model's openLink opens it in a new tab, noopener); nothing else links
  check('the https link is a .fy-link span (a press opens it beside the workspace — openLink, _blank + noopener); no <a>, no <img> at all; javascript: / data: / vbscript: never link', x18.as.length === 0 && x18.imgs.length === 0 && x18.fy.some((f) => f.kind === 'url' && /^https:\/\/example\.com\/x/.test(f.ref)) && x18.fy.every((f) => !/^\s*(javascript|data|vbscript):/i.test(String(f.ref || ''))), x18);

  console.log('⑲ the real CLI: a 9 000-char --detail is cut at 8 000 and SAYS so; a 600-char question at 500; 7 999 chars whole');
  const ask = (args) => { const r = spawnSync(process.execPath, [path.join(repo, 'data/bin/vibespace-ask'), ...args], { env: { ...process.env, VIBESPACE_API: `http://127.0.0.1:${PORT}`, VIBESPACE_SESSION_TOKEN: token }, encoding: 'utf8' }); return { code: r.status, out: String(r.stdout) + String(r.stderr) }; };
  const r19 = ask(['Question with a huge detail', '--detail', 'D'.repeat(9000)]);
  const it19 = (await storeNow()).open.find((i) => i.text === 'Question with a huge detail');
  check('exit 0, the store holds 8 000 chars, stdout names the cut ("NOTE: your --detail was CUT at 8000 characters")', r19.code === 0 && !!it19 && it19.detail.length === 8000 && /NOTE: your --detail was CUT at 8000 characters/.test(r19.out), { code: r19.code, len: it19 && it19.detail.length, out: r19.out.slice(0, 200) });
  const r19b = ask(['Q'.repeat(600)]);
  const it19b = (await storeNow()).open.find((i) => i.text.startsWith('QQQQ'));
  check('a 600-char question is kept to 500 and the CLI says the question was cut at 500', r19b.code === 0 && !!it19b && it19b.text.length === 500 && /NOTE: the question itself was CUT at 500 characters/.test(r19b.out), { code: r19b.code, len: it19b && it19b.text.length, out: r19b.out.slice(0, 200) });
  const r19c = ask(['A fitting question', '--detail', 'E'.repeat(7999)]);
  const it19c = (await storeNow()).open.find((i) => i.text === 'A fitting question');
  check('a 7 999-char detail is stored whole and no NOTE is printed', r19c.code === 0 && !!it19c && it19c.detail.length === 7999 && !/CUT at/.test(r19c.out), { code: r19c.code, len: it19c && it19c.detail.length, out: r19c.out.slice(0, 200) });
  for (const x of [it19, it19b, it19c]) if (x) await fetch(`http://127.0.0.1:${PORT}/api/agent/user-todo`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ resolve: x.id }) });

  // ── ⑧ ⚙ Communication ▸ For you… ──
  console.log('⑧ ⚙ Communication ▸ For you… opens the window');
  await evalJs(`app.wm.closeWindow((${WIN}).id); true`);
  check('(the window is closed)', await waitFor(`!(${WIN})`, 3000));
  await evalJs(`document.querySelector('.global-settings-popover')?.remove(); document.getElementById('btn-global-settings').click(); true`);
  await waitFor(`!!document.querySelector('.global-settings-popover .gs-menu-item[data-id="comm"]')`, 3000);
  await sleep(300); // the popover is placed on the next frame (test-gear-menu's own wait)
  const COMM_ROWS = `(() => { const h = document.querySelector('.global-settings-popover .gs-menu-item[data-id="comm"]'); const f = h && (h.querySelector(':scope > .gs-flyout') || h.nextElementSibling); return f && f.classList.contains('open') ? [...f.querySelectorAll('.gs-menu-item')] : []; })()`;
  // a click on a head opens its flyout (never toggles it closed — gear-menu.js); the hover path is test-gear-menu's
  check('a REAL click on the Communication head', await realClick(P1, '.global-settings-popover .gs-menu-item[data-id="comm"]'));
  // int265 seam: lane integrations-menu-home moved Integrations… to ⚙ System ▸ — Communication holds For you… / Channels… / Outbox…
  check('Communication opens its flyout, "For you…" first', await waitFor(`(() => { const rows = ${COMM_ROWS}.map((r) => r.textContent.trim()); return rows.length >= 3 && /^For you…/.test(rows[0]); })()`, 4000), await evalJs(`({ rows: ${COMM_ROWS}.map((r) => r.textContent.trim()), pop: !!document.querySelector('.global-settings-popover'), comm: document.querySelector('.global-settings-popover .gs-menu-item[data-id="comm"]')?.outerHTML.slice(0, 300) })`));
  await evalJs(`(() => { const r = ${COMM_ROWS}.find((x) => /^For you…/.test(x.textContent.trim())); if (r) r.setAttribute('data-test-for-you', '1'); return true; })()`);
  check('a REAL click on "For you…"', await realClick(P1, '.global-settings-popover [data-test-for-you="1"]'));
  check('the For-you window opens (all sessions, the first open item selected)', await waitFor(`(() => { const s = ${ST}; return !!s && !s.scopeKey && !!s.selected && !!document.querySelector('${IW} .iw-item'); })()`, 4000), await evalJs(`${ST} || null`));

  // ── ⑨ a second page: the window replays from its openSpec ──
  console.log('⑨ a second page gets the window replayed through its openSpec');
  await sleep(3500); // the layout autosave (2 s debounce) carries the window to the server
  const t2 = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const P2 = await connect(t2.webSocketDebuggerUrl);
  await P2.cdp('Runtime.enable'); await P2.cdp('Page.enable');
  await P2.cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await P2.cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await P2.cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await P2.waitApp();
  check('page 2 holds an inbox window replayed from the openSpec (action openInbox) with the list painted', await P2.waitFor(`(() => { const w = ${WIN}; return !!w && w._openSpec?.action === 'openInbox' && !!w._inbox && document.querySelectorAll('${IW} .iw-row').length >= 3; })()`, 15000),
    await P2.evalJs(`[...app.wm.windows.values()].map((w) => [w.type, w._openSpec?.action])`));
  check('…one window of the kind (a singleton)', await P2.evalJs(`[...app.wm.windows.values()].filter((w) => w.type === 'inbox').length === 1`));
  check('no uncaught page exceptions on page 2', P2.errors.length === 0, P2.errors.slice(0, 3));
  try { P2.sock.close(); await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${t2.id}`, { method: 'PUT' }); } catch {}

  // ── ⑩ 480 px: one pane at a time ──
  console.log('⑩ at 480 px the window shows one pane + back');
  await evalJs(`(() => { const w = ${WIN}; w.element.style.width = '480px'; w.element.style.height = '600px'; w.onResize && w.onResize(); return true; })()`);
  check('the window is narrow ⇒ ONE pane: the list shown, the item pane hidden', await waitFor(`(() => { const s = ${ST}; const root = document.querySelector('${IW}'); return s.mode === 'single' && root.classList.contains('iw-single') && root.dataset.view === 'list' && getComputedStyle(root.querySelector('.iw-pane')).display === 'none' && getComputedStyle(root.querySelector('.iw-list')).display !== 'none'; })()`, 3000), await evalJs(`${ST}`));
  await shot(P1, 'inbox-window-480-list', '.window:has(.iw)');
  const tap10 = (await evalJs(displayRows)).find((r) => !r.resolved)?.id;
  check('a REAL click on a row shows the ITEM with a ‹ back, the list hidden', await realClick(P1, rowSel(tap10)) && await waitFor(`(() => { const root = document.querySelector('${IW}'); return root.dataset.view === 'item' && getComputedStyle(root.querySelector('.iw-list')).display === 'none' && getComputedStyle(root.querySelector('.iw-pane')).display !== 'none' && getComputedStyle(root.querySelector('.iw-back')).display !== 'none' && !!root.querySelector('.iw-item[data-id=${JSON.stringify(tap10)}]'); })()`, 3000));
  await shot(P1, 'inbox-window-480-item', '.window:has(.iw)');
  check('‹ back returns to the list', await realClick(P1, `${IW} .iw-back`) && await waitFor(`document.querySelector('${IW}').dataset.view === 'list' && getComputedStyle(document.querySelector('${IW} .iw-list')).display !== 'none'`, 3000));
  await evalJs(`(() => { const w = ${WIN}; w.element.style.width = '920px'; w.element.style.height = '640px'; w.onResize && w.onResize(); return true; })()`);
  check('widened again ⇒ two panes', await waitFor(`${ST}?.mode === 'split' && getComputedStyle(document.querySelector('${IW} .iw-pane')).display !== 'none' && getComputedStyle(document.querySelector('${IW} .iw-list')).display !== 'none'`, 3000));

  // ── ⑭ lane browser-probe-transient (B-0b8c): the browser-version notice — Check again, first; an answer withdraws it ──
  console.log('⑭ the browser-version notice (filed when the probe ladder gave up): Check again, first — the answer withdraws it');
  check('a REAL click on the Notices tab, then on the notice', await realClick(P1, `${IW} .iw-tab[data-tab="notices"]`) && await waitFor(`${ST}?.tab === 'notices' && !!document.querySelector(${JSON.stringify(rowSel(FLOOR_ID))})`, 4000)
    && await realClick(P1, rowSel(FLOOR_ID)) && await waitFor(`${ST}?.selected === ${JSON.stringify(FLOOR_ID)} && !!document.querySelector('${IW} .iw-item[data-id=${JSON.stringify(FLOOR_ID)}]')`, 3000));
  const x13 = await evalJs(`(() => { const it = document.querySelector('${IW} .iw-item[data-id=${JSON.stringify(FLOOR_ID)}]'); return { acts: [...it.querySelectorAll('.iw-act')].map((b) => ({ act: b.dataset.act, text: b.textContent.trim(), title: b.title || b.getAttribute('aria-label') || '' })), text: it.textContent }; })()`);
  check(`Check again is its FIRST action (${x13.acts.map((a) => a.act).join(', ')}), titled with what it does`, x13.acts[0]?.act === 'browser-floor-check' && x13.acts[0].text === 'Check again' && /once more now/.test(x13.acts[0].title), x13.acts);
  check('the pane carries the notice\'s words: the tries, the span, why — and the ladder in its detail', /after 6 tries over 14 minutes \(timed out after 8 s\)/.test(x13.text) && /5 s, 15 s, 45 s, 2 min and 10 min/.test(x13.text), x13.text.slice(0, 400));
  await shot(P1, 'inbox-window-floor-notice', '.window:has(.iw)');
  // the press is timed off the keeper's OWN facts (GET /api/browser/floor): never within 2.5 s of a waiting rung, so the
  // answer the toast reports is the press's own probe (a rung would withdraw the notice by itself — also right, not this leg)
  let floor13 = null, clear13 = false;
  for (let i = 0; i < 100 && !clear13; i++) { floor13 = await (await fetch(`http://127.0.0.1:${PORT}/api/browser/floor`)).json(); const n = floor13 && floor13.lastProbe && floor13.lastProbe.nextAt; clear13 = !!floor13 && floor13.floor?.state === 'unknown' && (!n || n - Date.now() > 2500); if (!clear13) await sleep(250); }
  check('(the keeper\'s facts API: the CLI still does not answer — unknown, NOT settled — and no rung is due within 2.5 s)', clear13 && floor13.floor.settled === false && floor13.lastProbe.ok === false, floor13);
  fs.rmSync(path.join(AB_STATE, 'fail'), { force: true });
  check('a REAL click on Check again', await realClick(P1, `${IW} .iw-item[data-id=${JSON.stringify(FLOOR_ID)}] .iw-act[data-act="browser-floor-check"]`));
  check('a toast says the version reads again (0.38.1)', await waitFor(`[...document.querySelectorAll('.global-toast')].some((e) => e.textContent.includes('The browser version reads again: 0.38.1'))`, 6000));
  check('the store says the notice is done — WITHDRAWN by the answer (resolved by the keeper, not by a Mark done)', await (async () => { for (let i = 0; i < 20; i++) { const it = ((await storeNow()).resolved || []).find((x) => x.id === FLOOR_ID); if (it) return it.status === 'done' && it.resolvedBy === 'agent'; await sleep(200); } return false; })());
  await shot(P1, 'inbox-window-floor-checked', '.window:has(.iw)');
  await realClick(P1, `${IW} .iw-tab[data-tab="actions"]`);

  // ── ⑫ negative control for ② ──
  // ── ㉑ lane inbox-fyi-mark-all: «Mark all read» + a notice read by reading it ──
  console.log('㉑ «Mark all read» on the Notices tab: ONE request, ONE broadcast, every count drops in that tick, a 5 s Undo; a notice is read by reading it');
  {
    const RA = [NOTICE_ID, RA1_ID, RA2_ID, RA3_ID, RA_OPT_ID];
    await ensureOpen(RA);
    const ups = () => frames.filter((f) => f && f.type === 'user-todos-updated').length;
    const openNotices = async () => (await storeNow()).open.filter((i) => i.kind === 'notice').map((i) => i.id).sort();
    // the person is NOT in the window while the leg sets up (no notice is being read): focus out, a synthetic tab click
    await evalJs(`document.activeElement && document.activeElement.blur(); document.querySelector('${IW} .iw-scope-btn[data-scope="all"]').click(); document.querySelector('${IW} .iw-tab[data-tab="notices"]').click(); true`);
    check('the Notices tab (All sessions) lists the leg\'s five open notices', await waitFor(`${ST}?.tab === 'notices' && ${JSON.stringify(RA)}.every((id) => !!document.querySelector('${IW} .iw-row[data-id="' + id + '"]:not(.iw-row-resolved)'))`, 4000), await evalJs(displayRows));
    const n0 = (await openNotices()).length;
    const geo = await evalJs(`(() => { const b = document.querySelector('${IW} .iw-read-all'), tab = document.querySelector('${IW} .iw-tab[data-tab="notices"]'); if (!b) return null; const q = b.getBoundingClientRect(), r = tab.getBoundingClientRect();
      return { shown: getComputedStyle(b).display !== 'none', disabled: b.disabled, text: b.textContent, title: b.title, inBar: b.parentElement.classList.contains('iw-bar'), afterTabs: b.previousElementSibling?.classList.contains('iw-tabs'), inTab: !!b.closest('.iw-tab'),
        sameRow: q.top < r.bottom && q.bottom > r.top, beside: q.left >= r.right - 1, tabN: tab.querySelector('.iw-tab-n').textContent, bar: document.querySelector('#taskbar-user-todos .ut-seg-notice')?.textContent || '' }; })()`);
    check(`the button «Mark all read» sits right after the tabs, on the Notices tab's row, beside its count (never inside the tab button), enabled; its title counts the ${n0} it covers`,
      n0 >= 5 && !!geo && geo.shown && !geo.disabled && geo.text === 'Mark all read' && geo.inBar && geo.afterTabs && !geo.inTab && geo.sameRow && geo.beside && geo.title === `Mark the ${n0} notices listed here read (Undo for 5 s)`, { n0, geo });
    check(`before: the tab's count and the taskbar badge's grey count both say ${n0}`, !!geo && geo.tabN === String(n0) && geo.bar === String(n0), geo);
    await shot(P1, 'inbox-window-notices-mark-all-read', '.window:has(.iw)');
    // the probes: every POST the page makes to the For-you routes, and the first moment the tab's count changes —
    // what the taskbar's grey count says AT THAT MOMENT (one broadcast ⇒ both in the same task)
    await evalJs(`(() => { window.__raPosts = []; if (!window.__raOf) { window.__raOf = window.fetch; window.fetch = (u, o) => { if (o && o.method === 'POST' && String(u).startsWith('/api/user-todos/')) window.__raPosts.push(String(u)); return window.__raOf(u, o); }; }
      const tabN = document.querySelector('${IW} .iw-tab[data-tab="notices"] .iw-tab-n'); window.__raTick = null;
      const mo = new MutationObserver(() => { if (window.__raTick || tabN.textContent === ${JSON.stringify(String(n0))}) return; window.__raTick = { tab: tabN.textContent, bar: document.querySelector('#taskbar-user-todos .ut-seg-notice')?.textContent || '' }; mo.disconnect(); });
      mo.observe(tabN, { childList: true, characterData: true, subtree: true }); return true; })()`);
    const u0 = ups();
    check('a REAL press on «Mark all read»', await realClick(P1, `${IW} .iw-read-all`));
    check('the store: every one of the notices done, by the user', await (async () => { for (let i = 0; i < 40; i++) { const st = await storeNow(); if (RA.every((id) => st.resolved.some((x) => x.id === id && x.status === 'done' && x.resolvedBy === 'user'))) return true; await sleep(150); } return false; })(), await openNotices());
    await sleep(700); // anything else the press caused would have arrived by now
    const posts1 = await evalJs('window.__raPosts.slice()');
    check(`ONE request for the ${n0} (never ${n0} round-trips): POST /api/user-todos/notices/read-all and no per-item status write`, posts1.length === 1 && posts1[0] === '/api/user-todos/notices/read-all', posts1);
    check(`ONE broadcast for the ${n0} (a live socket counted user-todos-updated: ${ups() - u0})`, ups() - u0 === 1, ups() - u0);
    const tick = await evalJs('window.__raTick');
    check('THE SAME TICK: the moment the Notices tab\'s count changed, the taskbar\'s grey count was already gone — both read 0 from the one broadcast', !!tick && tick.tab === '' && tick.bar === '', tick);
    const after = await evalJs(`(() => { const b = document.querySelector('${IW} .iw-read-all') || {}; return { rows: ${JSON.stringify(RA)}.map((id) => document.querySelector('${IW} .iw-row[data-id="' + id + '"]')?.classList.contains('iw-row-resolved')), disabled: b.disabled, title: b.title, tabNShown: getComputedStyle(document.querySelector('${IW} .iw-tab[data-tab="notices"] .iw-tab-n')).display !== 'none', toast: [...document.querySelectorAll('#global-toasts .global-toast')].map((t) => ({ body: t.querySelector('.global-toast-body')?.textContent, acts: [...t.querySelectorAll('.global-toast-action')].map((a) => a.textContent) })) }; })()`);
    check('every notice row is resolved IN PLACE (dimmed, struck — the slot law); the button is disabled, its title says why', after.rows.every(Boolean) && after.disabled && after.title === 'No unread notices here' && !after.tabNShown, after);
    check(`a toast says "${n0} notices marked read" with an Undo`, after.toast.some((t) => t.body === `${n0} notices marked read` && t.acts.includes('Undo')), after.toast);
    const u1 = ups();
    check('a REAL press on Undo', await realClick(P1, '#global-toasts .global-toast .global-toast-action'));
    check('Undo: every one of them is open again in the store', await (async () => { for (let i = 0; i < 40; i++) { const o = await openNotices(); if (RA.every((id) => o.includes(id))) return true; await sleep(150); } return false; })(), await openNotices());
    await sleep(500);
    const posts2 = await evalJs('window.__raPosts.slice()');
    check('…in ONE request (POST …/notices/unread) and ONE broadcast', posts2.length === 2 && posts2[1] === '/api/user-todos/notices/unread' && ups() - u1 === 1, { posts2, ups: ups() - u1 });
    check(`…and the counts are back: the tab ${n0}, the taskbar ${n0}, the button enabled`, await waitFor(`document.querySelector('${IW} .iw-tab[data-tab="notices"] .iw-tab-n').textContent === ${JSON.stringify(String(n0))} && document.querySelector('#taskbar-user-todos .ut-seg-notice')?.textContent === ${JSON.stringify(String(n0))} && document.querySelector('${IW} .iw-read-all')?.disabled === false`, 3000));
    // THE POPUP (and the phone page — one noticesEl): the same button beside its notices head
    await evalJs(`document.querySelectorAll('#global-toasts > .global-toast').forEach((el) => el.remove()); document.getElementById('taskbar-user-todos').click(); true`);
    check('the popup\'s notices head carries «Mark all read» beside it (a sibling, the same line), enabled', await waitFor(`(() => { const h = document.querySelector('#user-todos-popup .ut-notices > .ut-notice-head'), b = document.querySelector('#user-todos-popup .ut-notices > .ut-read-all'); if (!h || !b || !h.offsetParent) return false; const q = b.getBoundingClientRect(), r = h.getBoundingClientRect(); return b.previousElementSibling === h && !b.disabled && q.top < r.bottom && q.bottom > r.top && q.left >= r.right - 1 && b.textContent === 'Mark all read'; })()`, 4000),
      await evalJs(`(() => { const b = document.querySelector('#user-todos-popup .ut-read-all'); return b ? { t: b.textContent, d: b.disabled, title: b.title } : null; })()`));
    await shot(P1, 'popup-notices-mark-all-read', '#user-todos-popup');
    check('a REAL press there reads them all too (ONE request)', await realClick(P1, '#user-todos-popup .ut-read-all') && await (async () => { for (let i = 0; i < 40; i++) { if (!(await openNotices()).length) return true; await sleep(150); } return false; })() && (await evalJs('window.__raPosts.length')) === 3);
    check('…the popup\'s button disabled with its reason', await waitFor(`(() => { const b = document.querySelector('#user-todos-popup .ut-read-all'); return !!b && b.disabled && b.title === 'No unread notices here'; })()`, 3000));
    await realClick(P1, '#global-toasts .global-toast .global-toast-action'); // its Undo: the read-on-sight legs need them open
    await (async () => { for (let i = 0; i < 40; i++) { if ((await openNotices()).length === n0) return; await sleep(150); } })();
    await evalJs(`document.getElementById('user-todos-popup').classList.contains('hidden') || document.getElementById('taskbar-user-todos').click(); true`);
    await ensureOpen(RA);
    // A NOTICE IS READ BY READING IT
    const stat = async (id) => { const st = await storeNow(); const o = st.open.find((i) => i.id === id); if (o) return 'open'; const r = st.resolved.find((i) => i.id === id); return r ? r.status + ':' + r.resolvedBy : 'gone'; };
    check('a REAL click on a notice that asks nothing (the person in the window)', await realClick(P1, rowSel(RA1_ID)) && await waitFor(`${ST}?.selected === ${JSON.stringify(RA1_ID)}`, 3000));
    await sleep(600);
    check('…0.6 s on screen: still open (the clock waits — arrowing past reads nothing)', (await stat(RA1_ID)) === 'open', await stat(RA1_ID));
    check('…by 1.5 s it is READ: done, by the user — no button pressed', await (async () => { for (let i = 0; i < 30; i++) { if ((await stat(RA1_ID)) === 'done:user') return true; await sleep(150); } return false; })(), await stat(RA1_ID));
    check('…the selection stays where the reader is (no jump to the next)', await waitFor(`${ST}?.selected === ${JSON.stringify(RA1_ID)} && document.querySelector(${JSON.stringify(rowSel(RA1_ID))}).classList.contains('iw-row-resolved')`, 2000), await evalJs(ST));
    check('a REAL click on the notice that offers choices', await realClick(P1, rowSel(RA_OPT_ID)) && await waitFor(`${ST}?.selected === ${JSON.stringify(RA_OPT_ID)}`, 3000));
    await sleep(2500);
    check('…2.5 s on screen: still OPEN — it asks something, so only a press resolves it', (await stat(RA_OPT_ID)) === 'open', await stat(RA_OPT_ID));
    check('a REAL click on another notice, then the person leaves the window at once (focus elsewhere)', await realClick(P1, rowSel(RA2_ID)) && await evalJs(`(() => { document.activeElement && document.activeElement.blur(); return ${ST}.selected === ${JSON.stringify(RA2_ID)}; })()`));
    await sleep(2500);
    check('…2.5 s later it is still open — a window nobody is in reads nothing', (await stat(RA2_ID)) === 'open', await stat(RA2_ID));
    check('…back in the window (a REAL click on its row): read once its 1.5 s have passed', await realClick(P1, rowSel(RA2_ID)) && await (async () => { for (let i = 0; i < 30; i++) { if ((await stat(RA2_ID)) === 'done:user') return true; await sleep(150); } return false; })(), await stat(RA2_ID));
    // ‹ back (one pane): left before its 1.5 s, the notice was read
    await evalJs(`(() => { const w = ${WIN}; w.element.style.width = '480px'; w.element.style.height = '600px'; w.onResize && w.onResize(); return true; })()`);
    await waitFor(`${ST}?.mode === 'single'`, 3000);
    check('at 480 px a REAL tap on a notice shows it with ‹ back', await realClick(P1, rowSel(RA3_ID)) && await waitFor(`document.querySelector('${IW}').dataset.view === 'item' && ${ST}.selected === ${JSON.stringify(RA3_ID)}`, 3000));
    await evalJs(`document.activeElement && document.activeElement.blur(); true`); // the clock stops (nobody in the window)…
    await sleep(2000);
    check('…the person leaves the window: 2 s later it is still open (no clock runs)', (await stat(RA3_ID)) === 'open', await stat(RA3_ID));
    const tBack = Date.now();
    check('…a REAL press on ‹ back ⇒ READ at once (done, by the user) — the back, not a clock: resolved < 1.5 s after the press', await realClick(P1, `${IW} .iw-back`) && await (async () => { for (let i = 0; i < 20; i++) { const r = (await storeNow()).resolved.find((x) => x.id === RA3_ID); if (r && r.status === 'done' && r.resolvedBy === 'user' && r.resolvedAt - tBack < 1500) return true; await sleep(100); } return false; })(), { st: await stat(RA3_ID), ms: ((await storeNow()).resolved.find((x) => x.id === RA3_ID)?.resolvedAt || 0) - tBack });
    await evalJs(`(() => { const w = ${WIN}; w.element.style.width = '920px'; w.element.style.height = '640px'; w.onResize && w.onResize(); return true; })()`);
    await waitFor(`${ST}?.mode === 'split'`, 3000);
    await evalJs(`(() => { if (window.__raOf) { window.fetch = window.__raOf; delete window.__raOf; } return true; })()`);
    await realClick(P1, `${IW} .iw-tab[data-tab="actions"]`);
  }

  console.log('⑫ negative control');
  const x12 = await evalJs(`new Promise((res) => { const d = document.createElement('div'); d.className = 'iw-title'; d.innerHTML = ${JSON.stringify(HOSTILE_TITLE)}; document.body.appendChild(d); setTimeout(() => { const v = window.__xss; d.remove(); window.__xss = undefined; res(v); }, 800); })`);
  check('the hostile title through a raw innerHTML copy DOES run (window.__xss === 1) — ② can go red', x12 === 1, x12);
  // ⑫ is a NEGATIVE CONTROL: the raw-innerHTML copy ran `<img src=x onerror=…>` on the app page, so the report-only CSP (lane app-page-csp) noted ONE script-src-attr/inline — TAKE it (scratch.mjs), it is the policy doing its job, not a leak the teardown should fail on (int331 seam).
  await takeCspReports((r) => r.directive === 'script-src-attr' && String(r.blocked) === 'inline', { want: 1 });
  check('no uncaught page exceptions on the desktop page', P1.errors.length === 0, P1.errors.slice(0, 3));

  // ── ⑪ the phone ──
  console.log('⑪ the phone: one pane, every row and control ≥ 36 px');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', platform: 'iPhone' });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await waitApp();
  await sleep(1200);
  check('the page is a phone', await evalJs(`app.isMobile && app.isTouch`));
  await evalJs(`app.openInbox(); true`);
  check('the window opens in ONE-pane mode on the phone (the list first)', await waitFor(`(() => { const s = ${ST}; return !!s && s.mode === 'single' && document.querySelector('${IW}')?.dataset.view === 'list' && document.querySelectorAll('${IW} .iw-row').length >= 3; })()`, 8000), await evalJs(`${ST} || null`));
  const sizes = await evalJs(`[...document.querySelectorAll('${IW} .iw-row, ${IW} .iw-tab, ${IW} .iw-scope-btn, ${IW} .iw-filter')].filter((el) => el.getClientRects().length).map((el) => ({ c: el.className.split(' ')[0], h: Math.round(el.getBoundingClientRect().height) }))`);
  check(`every list row, tab, scope button and the filter is ≥ 36 px tall (${sizes.length} targets)`, sizes.length >= 6 && sizes.every((s) => s.h >= 36), sizes);
  const phoneRow = (await evalJs(displayRows)).find((r) => !r.resolved)?.id;
  await evalJs(`document.querySelector(${JSON.stringify(rowSel(phoneRow))}).click(); true`);
  check('a tap shows the item with ‹ back', await waitFor(`document.querySelector('${IW}').dataset.view === 'item' && getComputedStyle(document.querySelector('${IW} .iw-back')).display !== 'none'`, 3000));
  const actSizes = await evalJs(`[...document.querySelectorAll('${IW} .iw-act, ${IW} .iw-back')].filter((el) => el.getClientRects().length).map((el) => Math.round(el.getBoundingClientRect().height))`);
  check(`…its action buttons and ‹ back are ≥ 36 px (${actSizes.join(',')})`, actSizes.length >= 3 && actSizes.every((h) => h >= 36), actSizes);
  await shot(P1, 'inbox-window-phone');
  check('no uncaught page exceptions on the phone', P1.errors.length === 0, P1.errors.slice(0, 3));

  // ── ⑳ A REPLY FROM THE WINDOW TO A CONVERSATION THAT ENDED REOPENS IT (lane inbox-reply-dead-session) ──
  // the incident's own surface (userW inc-mvfuzlom-nwav: ten presses on `textarea.iw-reply-input`), last, on the desktop
  // again: a REAL click into the box, real typing, a REAL press on 「Reopen and send」 — the conversation resumes behind
  // the real create path (the stub echoes --resume's id, its stdin logged apart) and the reply is its FIRST input
  console.log('⑳ RED CONTROL (the pre-lane window on a patched bundle), then the window\'s 「Reopen and send」 on an ended conversation');
  {
    const wsrc = fs.readFileSync(path.join(repo, 'src/lib/inbox-window.js'), 'utf8');
    const LANE = '    c.ta.disabled = false;', PRE = '    c.ta.disabled = !v.reply.enabled;';
    check('control: the lane\'s line is in the window module exactly once (the patched copy swaps it back to the pre-lane line)', wsrc.split(LANE).length === 2 && !wsrc.includes(PRE));
    check('vault-run-ask (the run card) renders VERBATIM, never markdown — its type is in the isCmd command list so a `*` or `#` in the command line shows as typed (SEAM int330, q-043 P0-f)', /const isCmd = [^;]*vault-run-ask/.test(wsrc), (wsrc.match(/const isCmd = [^;]*;/) || [])[0]);
    check('vault-grant-ask (the agent\'s request card) renders VERBATIM, never markdown — its type is in the `plain` list so the entry ref and the agent\'s OWN words (a `*`, a `# y`, two lines) show as typed, escaped (SEAM int331, q-043 P0-c / vault-scrub-forms §8)', /const plain = [^;]*vault-grant-ask/.test(wsrc), (wsrc.match(/const plain = [^;]*;/) || [])[0]);
    const MUT = mutantCopies('inbox-window-ui-dead', repo);
    const bundleText = await buildPatchedBundle(MUT, 'src/lib/inbox-window.js', wsrc.split(LANE).join(PRE), 'pre-lane');
    for (const row of copiesCensus(MUT.files, MUT.dir, repo, { minCopies: 1, label: '⑳ ' })) check(row.name, row.pass, row.detail);
    const t2 = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
    const P2 = await connect(t2.webSocketDebuggerUrl);
    const body = Buffer.from(bundleText).toString('base64');
    let served = 0;
    P2.sock.on('message', (d) => {
      let m = null; try { m = JSON.parse(d); } catch { return; }
      if (m.method !== 'Fetch.requestPaused') return;
      const id = m.params.requestId;
      if (/\/bundle\.js(\?|$)/.test(m.params.request.url)) { served++; P2.cdp('Fetch.fulfillRequest', { requestId: id, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/javascript' }], body }).catch(() => {}); }
      else P2.cdp('Fetch.continueRequest', { requestId: id }).catch(() => {});
    });
    await P2.cdp('Runtime.enable'); await P2.cdp('Page.enable');
    await P2.cdp('Fetch.enable', { patterns: [{ urlPattern: '*bundle.js*', requestStage: 'Request' }] });
    await P2.cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await P2.cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
    await P2.cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
    await P2.cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
    await P2.waitApp();
    await sleep(900);
    await P2.evalJs(`app.openInbox({ itemId: ${JSON.stringify(HOSTILE_ID)} }); true`);
    const cTa = `${IW} .iw-item[data-id=${JSON.stringify(HOSTILE_ID)}] .iw-reply-input`;
    const shown = await P2.waitFor(`!!document.querySelector(${JSON.stringify(cTa)})`, 8000);
    const cDisabled = await P2.evalJs(`document.querySelector(${JSON.stringify(cTa)})?.disabled === true`);
    await realClick(P2, cTa);
    await P2.cdp('Input.insertText', { text: 'lost' });
    const cr = await P2.evalJs(`(() => { const ta = document.querySelector(${JSON.stringify(cTa)}); return { focused: document.activeElement === ta, value: ta ? ta.value : null, active: document.activeElement && document.activeElement.className }; })()`);
    check(`RED CONTROL: the page served the PATCHED bundle (${served}×) shows the ended conversation's box DISABLED, and the same real press lands on it without focusing it — document.activeElement never the box, the typing lost (the incident's ten presses)`, served >= 1 && shown && cDisabled && cr.focused === false && cr.value === '', { served, shown, cDisabled, cr });
    // the probe is not vacuous on this page: the same box enabled by hand, the same real press focuses it
    await P2.evalJs(`(() => { const ta = document.querySelector(${JSON.stringify(cTa)}); ta.disabled = false; return true; })()`);
    await realClick(P2, cTa);
    check('…and on that SAME control page the same press focuses the box once it is enabled (the probe can read green there)', await P2.waitFor(`document.activeElement === document.querySelector(${JSON.stringify(cTa)})`, 2000));
    await P2.evalJs(`(() => { const ta = document.querySelector(${JSON.stringify(cTa)}); ta.value = ''; ta.blur(); return true; })()`);
    try { P2.sock.close(); } catch { }
    try { await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${t2.id}`); } catch { }
    try { await fetch(`http://127.0.0.1:${CDP_PORT}/json/activate/${target.id}`); } catch { }
    await sleep(300);
  }
  {
    const UA0 = (await cdp('Browser.getVersion')).userAgent;
    await cdp('Emulation.setTouchEmulationEnabled', { enabled: false });
    await cdp('Emulation.setEmulatedMedia', { features: [] });
    await cdp('Emulation.setUserAgentOverride', { userAgent: UA0 });
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
    await waitApp();
    await sleep(1200);
    const was = [...(await storeNow()).resolved, ...(await storeNow()).open].find((i) => i.id === HOSTILE_ID);
    if (was && was.status !== 'open') await fetch(`http://127.0.0.1:${PORT}/api/user-todos/${HOSTILE_ID}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'open' }) });
    check(`(the stopped fixture's item is OPEN — it was ${was ? was.status : 'missing'}; the owner's ↺ if needed)`, (await storeNow()).open.some((i) => i.id === HOSTILE_ID));
    await evalJs(`app.openInbox({ itemId: ${JSON.stringify(HOSTILE_ID)} }); true`);
    const paneTa = `${IW} .iw-item[data-id=${JSON.stringify(HOSTILE_ID)}] .iw-reply-input`;
    const paneSend = `${IW} .iw-item[data-id=${JSON.stringify(HOSTILE_ID)}] .iw-act[data-act="reply"]`;
    check('the window opens ON the ended conversation\'s item', await waitFor(`${ST}?.selected === ${JSON.stringify(HOSTILE_ID)} && !!document.querySelector(${JSON.stringify(paneTa)})`, 8000));
    check('a REAL click into its box focuses it', await realClick(P1, paneTa) && await waitFor(`document.activeElement === document.querySelector(${JSON.stringify(paneTa)})`, 2000));
    const REPLY20 = 'reopened from the For-you window';
    await evalJs(`(() => { const ta = document.querySelector(${JSON.stringify(paneTa)}); ta.value = ''; return true; })()`);
    await cdp('Input.insertText', { text: REPLY20 });
    check(`the press target reads 「Reopen and send」 (${await evalJs(`document.querySelector(${JSON.stringify(paneSend)})?.textContent`)})`, (await evalJs(`document.querySelector(${JSON.stringify(paneSend + ' .iw-act-label')})?.textContent`)) === 'Reopen and send');
    const resumedLog = path.join(stubDir, `stdin-${STOPPED_SID}.ndjson`);
    check('a REAL press on 「Reopen and send」', await realClick(P1, paneSend));
    const t0 = Date.now();
    let firstUser = null;
    while (Date.now() - t0 < 30000 && !firstUser) {
      if (fs.existsSync(resumedLog)) { for (const l of fs.readFileSync(resumedLog, 'utf8').split('\n').filter(Boolean)) { let m = null; try { m = JSON.parse(l); } catch { } if (m && m.type === 'user') { const c = m.message && m.message.content; firstUser = typeof c === 'string' ? c : Array.isArray(c) ? c.map((x) => x.text || '').join('') : ''; break; } } }
      if (!firstUser) await sleep(200);
    }
    check(`within 30 s the RESUMED conversation reads the reply as its FIRST user input: [For you reply #${HOSTILE_ID}] … ${REPLY20}`, !!firstUser && firstUser.startsWith(`[For you reply #${HOSTILE_ID}]`) && firstUser.endsWith('\n\n' + REPLY20), (firstUser || '(none)').slice(0, 300));
    const live20 = await evalJs(`fetch('/api/active').then((r) => r.json()).then((j) => (Array.isArray(j) ? j : j.sessions || []).filter((s) => s.backendSessionId === ${JSON.stringify(STOPPED_SID)}).map((s) => s.id))`);
    check('the SAME conversation is live again (one session, its own id resumed)', Array.isArray(live20) && live20.length === 1, live20);
    check('its conversation window opens and shows the reply', await waitFor(`(() => { const v = [...app.sessions.values()].find((x) => x && x.sessionId === ${JSON.stringify(live20 && live20[0])}); return !!v && [...document.querySelectorAll('.chat-view')].some((cv) => (cv.textContent || '').includes(${JSON.stringify(REPLY20)})); })()`, 15000));
    check('the item is resolved by the reply', (await storeNow()).resolved.some((i) => i.id === HOSTILE_ID && i.resolvedBy === 'reply' && i.reply && i.reply.text === REPLY20));
    check('no uncaught page exceptions through the reopen', P1.errors.length === 0, P1.errors.slice(0, 3));
    try { if (live20 && live20[0]) liveWs.send(JSON.stringify({ type: 'kill', sessionId: live20[0] })); } catch {}
  }

  try { liveWs.send(JSON.stringify({ type: 'kill', sessionId: sid })); await sleep(500); liveWs.close(); } catch {}
} catch (e) {
  failed++;
  console.error('  ✗ battery crashed: ' + (e.stack || e.message));
}

console.log(`${failed ? `FAILED (${failed})` : 'ALL PASS'} — ${Math.round((Date.now() - T0) / 1000)} s`);
cleanup();
process.exit(failed ? 1 : 0);
