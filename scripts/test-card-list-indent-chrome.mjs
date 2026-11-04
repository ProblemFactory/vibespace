#!/usr/bin/env node
// test-card-list-indent-chrome — A MARKDOWN LIST INDENTS BY ITS CONTAINER, MEASURED THROUGH THE PAGE (hotfix .377; the owner,
// 2026-11-04: «好几处这类卡片都有这个布局问题（点跑到左边界了）» — the sub-agent report card and the VibeSpace hand-over notice drew
// their bullets on the card's left border). The PURE half (the renderMarkdown census, the stylesheet rules) is
// test-card-list-indent (fast). Here: a copy of this tree (bundle built by esbuild) on its own scratch hub, bare Chrome under a
// 4 GiB data limit, 1000 × 760 in zh; one conversation fed, through the page's own ChatView, a message of each kind carrying a
// 3-item bullet list and a 12-item ordered list — the assistant's reply, the sub-agent report card (FINAL_ANSWER), the
// VibeSpace hand-over notice (its fold open), a job notice shown whole, the away recap, a For-you reply, the user's own
// message — plus a `.markdown-preview` box (the file viewer's / jobs panel's markdown). For every list item: its box starts
// ≥ 8 px inside the text column (the `.chat-text`'s content box); its ::marker (CDP box model) starts inside that column (a
// 2-digit «12.» included), stands ≥ 8 px off the card's left border, and no overflow-clipping ancestor cuts it.
// On 27a0bf89e (the base — run this file on a `git archive` copy) 34 rows are RED by name: the report / hand-over / job / recap
// legs (6 each), the `.markdown-preview` box (4), the «10.»–«12.» overhang of the compact assistant / reply / user legs (2 each).
// PNGs: CARD_LIST_PNG_DIR (default: the scratch root) <prefix>-<card>.png, prefix = CARD_LIST_SHOT_PREFIX (default 'run').
// This box's own fonts (the zh words need a CJK face). Requires google-chrome (SKIP without).
// Run: node scripts/test-card-list-indent-chrome.mjs
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
import { armWatchdog } from './suite-watchdog.mjs';

const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = JSON.stringify;

const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
const VNC_ENV = await vncEnv();
const ROOT = scratch('card-list-indent');
const SHOTS = process.env.CARD_LIST_PNG_DIR || ROOT;
const PREFIX = process.env.CARD_LIST_SHOT_PREFIX || 'run';
const BIN = path.join(ROOT, 'bin');
for (const d of [BIN, SHOTS]) fs.mkdirSync(d, { recursive: true });
const chromeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'card-list-h-')), chromeRun = fs.mkdtempSync(path.join(os.tmpdir(), 'card-list-run-'));
fs.chmodSync(chromeRun, 0o700);
const homes = [];
let chrome = null, srv = null;
const cleanup = () => {
  try { chrome && chrome.kill('SIGKILL'); } catch { }
  try { srv && srv.kill('SIGKILL'); } catch { }
  for (const r of [ROOT, chromeHome, chromeRun, ...homes]) { try { endRootedProcesses(r); } catch { } }
  for (const d of [ROOT, chromeHome, chromeRun, ...homes]) { if (d === SHOTS) continue; try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { } }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });
const PENDS = new Map();
armWatchdog({ capMs: 180e3, exit: (code) => process.exit(code), pending: () => [...PENDS.values()].map((x) => `CDP ${x.method} (${((Date.now() - x.at) / 1000).toFixed(1)} s)`) });

fs.writeFileSync(path.join(BIN, 'claude'), `#!${process.execPath}\nif (process.argv.includes('--version')) console.log('2.1.308 (Claude Code) stub');\n`, { mode: 0o755 });
const wt = path.join(ROOT, 'tree');
for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin']) fs.cpSync(path.join(repo, f), path.join(wt, f), { recursive: true });
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.writeFileSync(path.join(wt, 'src/lib/build-version.js'), `export const BUILD_VERSION = ${J(require(path.join(repo, 'package.json')).version)};\n`);
execSync('npx esbuild src/client.js --bundle --outfile=public/bundle.js --format=iife --platform=browser --target=es2020 --loader:.css=css', { cwd: wt, stdio: 'ignore' });

const [port, CDP_PORT] = await freePorts(2);
const home = scratchHome('card-list-home', fs); homes.push(home);
const CWD = path.join(home, 'proj');
const SID = '5c3a0000-0000-4000-8000-0000000c11d0';
fs.mkdirSync(CWD, { recursive: true });
const pdir = path.join(home, '.claude', 'projects', CWD.replace(/[/._]/g, '-'));
fs.mkdirSync(pdir, { recursive: true });
const T0 = Date.now() - 120e3;
fs.writeFileSync(path.join(pdir, SID + '.jsonl'), [
  { type: 'user', uuid: 'cli-u0', sessionId: SID, cwd: CWD, timestamp: new Date(T0).toISOString(), message: { role: 'user', content: 'Audit the remaining weeks.' } },
  { type: 'assistant', uuid: 'cli-a0', sessionId: SID, cwd: CWD, timestamp: new Date(T0 + 5e3).toISOString(), message: { id: 'msg_cli0', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text: 'On it.' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } } },
].map((r) => J(r)).join('\n') + '\n');

const srvLog = path.join(ROOT, 'server.log'), srvFd = fs.openSync(srvLog, 'a');
srv = spawn(process.execPath, ['server.js'], { cwd: wt, stdio: ['ignore', srvFd, srvFd],
  env: { ...process.env, ...VNC_ENV, PORT: String(port), HOME: home, PATH: `${BIN}:${path.join(wt, 'data/bin')}:${process.env.PATH}`, CLAUDE_CMD: path.join(BIN, 'claude'), VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' } });
const origin = `http://127.0.0.1:${port}`;
let up = false;
for (let i = 0; i < 160 && !up; i++) { try { await fetch(`${origin}/api/home`); up = true; } catch { await sleep(250); } }
check('③ the tree\'s server answers', up, up ? undefined : fs.readFileSync(srvLog, 'utf8').split('\n').slice(-12).join(' | '));
if (!up) process.exit(1);

// bare Chrome under a 4 GiB data limit (its own — the hub's workers need more address space than that)
chrome = spawn('/bin/sh', ['-c', 'ulimit -d 4194304 && exec "$0" "$@"', CHROME, '--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars',
  '--password-store=basic', '--disable-background-timer-throttling', `--user-data-dir=${path.join(ROOT, 'chrome')}`, 'about:blank'],
{ stdio: 'ignore', env: { ...process.env, HOME: chromeHome, XDG_RUNTIME_DIR: chromeRun, DISPLAY: '' } });
const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 120 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((x) => x.type === 'page'); } catch { } if (!target) await sleep(250); }
if (!target) { console.log('✗ chrome never exposed a CDP page target'); process.exit(1); }
const sock = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
await new Promise((r) => sock.on('open', r));
let seq = 0; const pend = new Map(); const pageErrors = [];
sock.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); PENDS.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'unknown');
});
const cdp = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq; PENDS.set(id, { method, at: Date.now() }); pend.set(id, (m) => (m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result)));
  sock.send(J({ id, method, params }));
});
const evalJs = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true });
  if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await evalJs(expr)) return true; } catch { } await sleep(150); } try { return !!(await evalJs(expr)); } catch { return false; } };
const step = async (name, fn) => { try { await fn(); } catch (e) { check(`${name}: the leg ran to its end`, false, String((e && e.stack) || e).split('\n').slice(0, 4).join(' | ')); } };

await cdp('Runtime.enable'); await cdp('Page.enable'); await cdp('DOM.enable');
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); // §47: a returning user — no first-run wizard
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "try { localStorage.setItem('vibespace.lang', 'zh'); localStorage.setItem('vibespace.uiScale', '100'); } catch {}" });
await cdp('Emulation.setDeviceMetricsOverride', { width: 1000, height: 760, deviceScaleFactor: 1, mobile: false });
await cdp('Page.navigate', { url: origin + '/' });
await evalJs('new Promise((res, rej) => { const t0 = Date.now(); (function w() { if (window.app) return res(app.ready); if (Date.now() - t0 > 40000) return rej(new Error("no app after 40s")); setTimeout(w, 200); })(); })');
await waitFor(`!document.getElementById('loading-screen')`, 30000);
await sleep(600);

// the messages: each kind carries the same two lists
const LISTS = '- first bullet item\n- second bullet item\n- third bullet item\n\n' + Array.from({ length: 12 }, (_, i) => `${i + 1}. ordered item ${i + 1}`).join('\n');
const { vibespaceNoticeText } = require(path.join(repo, 'src/notification-senders.js'));
const { handoverCardText } = require(path.join(repo, 'src/stash-summary.js'));
const { composeReply } = require(path.join(repo, 'src/inbox-reply.js'));
const at = (k) => T0 + 10e3 + k * 1000;
const CARDS = [
  { key: 'assistant', what: 'the assistant\'s reply', sel: '.chat-text',
    msg: { id: 'cli-asst', role: 'assistant', status: 'complete', ts: at(1), content: [{ type: 'text', text: 'Here is the list:\n\n' + LISTS }] } },
  { key: 'report', what: 'the sub-agent report card (FINAL_ANSWER)', sel: '.chat-agent-report-body',
    msg: { id: 'cli-report', role: 'tool', status: 'complete', ts: at(2), toolName: 'collab', toolCallId: 'call_cli_report',
      collab: { report: true, agentName: 'remaining_weeks_audit', agentPath: '/root/remaining_weeks_audit', msgType: 'FINAL_ANSWER', rows: [{ agentName: 'remaining_weeks_audit', agentPath: '/root/remaining_weeks_audit', msgType: 'FINAL_ANSWER', report: true }] },
      content: [{ type: 'tool_result', output: 'Audit complete.\n\n' + LISTS }] } },
  { key: 'handover', what: 'the VibeSpace hand-over notice (its fold open)', sel: '.chat-vs-notice-told .chat-text',
    msg: { id: 'cli-handover', role: 'user', status: 'complete', ts: at(3), originKind: 'peer-message', peerFrom: 'VibeSpace', peerVia: 'notification',
      content: [{ type: 'text', text: vibespaceNoticeText(handoverCardText(1, '### Messages that arrived while this conversation was unreachable\n\n' + LISTS)) }] } },
  { key: 'job', what: 'a VibeSpace job notice shown whole', sel: '.chat-vs-notice .chat-text',
    msg: { id: 'cli-job', role: 'user', status: 'complete', ts: at(4), originKind: 'peer-message', peerFrom: 'VibeSpace', peerVia: 'notification',
      content: [{ type: 'text', text: vibespaceNoticeText('Background job nightly finished.\n\n' + LISTS) }] } },
  { key: 'recap', what: 'the away recap', sel: '.chat-away-summary-body',
    msg: { id: 'cli-recap', role: 'system', status: 'complete', ts: at(5), noticeKind: 'away-summary', content: [{ type: 'text', text: LISTS }] } },
  { key: 'reply', what: 'a For-you reply', sel: '.chat-text',
    msg: { id: 'cli-reply', role: 'user', status: 'complete', ts: at(6), content: [{ type: 'text', text: composeReply({ id: 'ut-0123456789', createdAt: at(0), text: 'Pick the weeks to keep', urgency: 'normal' }, 'My answer:\n\n' + LISTS, { now: at(6) }) }] } },
  { key: 'user', what: 'the user\'s own message', sel: '.chat-text',
    msg: { id: 'cli-user', role: 'user', status: 'complete', ts: at(7), content: [{ type: 'text', text: 'My notes:\n\n' + LISTS }] } },
];
const VIEW = `([...(window.app.sessions?.values?.() || [])].find((v) => v && v._messageList && v.sessionId === ${J(SID)}) || [...(window.app.sessions?.values?.() || [])].filter((v) => v && v._messageList).pop())`;

/** one list item's ::marker box (CDP) — tagged by `data-cli` in the page; null when Chrome exposes none */
async function markerBoxes(tagged) {
  const { root } = await cdp('DOM.getDocument', { depth: -1, pierce: true });
  const byTag = new Map();
  (function walk(n) {
    if (n.attributes) { const i = n.attributes.indexOf('data-cli'); if (i >= 0) byTag.set(n.attributes[i + 1], n); }
    for (const c of n.children || []) walk(c);
    for (const c of n.pseudoElements || []) walk(c);
    if (n.contentDocument) walk(n.contentDocument);
  })(root);
  const out = {};
  for (const tag of tagged) {
    const n = byTag.get(tag);
    const mk = n && (n.pseudoElements || []).find((p) => p.pseudoType === 'marker');
    if (!mk) { out[tag] = null; continue; }
    try { const { model } = await cdp('DOM.getBoxModel', { nodeId: mk.nodeId }); const xs = model.border.filter((_, i) => i % 2 === 0); out[tag] = { l: Math.min(...xs), r: Math.max(...xs) }; } catch { out[tag] = null; }
  }
  return out;
}
/** the lists of one card as the page lays them out: the text column, each item's box, the clipping ancestors */
const MEASURE = (key, id, sel) => `(() => {
  const v = ${VIEW}; const el = [...v._messageList.querySelectorAll('.chat-msg')].find((e) => e.dataset.msgId === ${J(id)});
  if (!el) return { missing: 'card' };
  el.querySelectorAll('details').forEach((d) => { d.open = true; });
  const box = [...el.querySelectorAll(${J(sel)})].find((b) => b.querySelector('ul, ol'));
  if (!box) return { missing: 'list', cls: el.className, html: el.innerHTML.slice(0, 400) };
  const cs = getComputedStyle(box), R = box.getBoundingClientRect();
  const textL = R.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft);
  let clipL = -Infinity;
  for (let a = box.parentElement; a && a !== document.documentElement; a = a.parentElement) {
    const s = getComputedStyle(a);
    if (s.overflowX !== 'visible' || s.overflow === 'hidden') clipL = Math.max(clipL, a.getBoundingClientRect().left + parseFloat(s.borderLeftWidth));
  }
  const lists = [...box.querySelectorAll('ul, ol')].map((list, li) => ({ tag: list.tagName.toLowerCase(), pl: parseFloat(getComputedStyle(list).paddingLeft),
    items: [...list.children].filter((c) => c.tagName === 'LI').map((item, ii) => { item.dataset.cli = ${J(key)} + '-' + li + '-' + ii; const r = item.getBoundingClientRect(); return { tag: item.dataset.cli, l: r.left, shown: r.width > 0 && r.height > 0 }; }) }));
  const ecs = getComputedStyle(el), cardL = el.getBoundingClientRect().left + parseFloat(ecs.borderLeftWidth);
  return { cls: el.className, boxCls: box.className, textL, clipL, cardL, lists, shown: R.width > 0 && R.height > 0 };
})()`;
const shotOf = async (id, name) => {
  try {
    // the view follows its tail after a layout change (a fold opened): scroll the card in until it stays put
    let r = null;
    for (let i = 0; i < 4; i++) {
      r = await evalJs(`(() => { const v = ${VIEW}; const el = [...v._messageList.querySelectorAll('.chat-msg')].find((e) => e.dataset.msgId === ${J(id)}); if (!el) return null; el.scrollIntoView({ block: 'start' }); return el.getBoundingClientRect().top; })()`);
      if (r == null) return;
      await sleep(250);
      r = await evalJs(`(() => { const v = ${VIEW}; const el = [...v._messageList.querySelectorAll('.chat-msg')].find((e) => e.dataset.msgId === ${J(id)}); const b = el.getBoundingClientRect(); return { top: b.top, x: Math.max(0, b.left - 6), y: Math.max(0, b.top - 6), w: Math.min(b.width + 12, 1000), h: Math.min(b.height + 12, 760 - Math.max(0, b.top - 6)) }; })()`);
      if (r.top >= 0 && r.top < 200) break;
    }
    const { data } = await cdp('Page.captureScreenshot', { format: 'png', clip: { x: r.x, y: r.y, width: r.w, height: r.h, scale: 1 } });
    const f = path.join(SHOTS, `${PREFIX}-${name}.png`); fs.writeFileSync(f, Buffer.from(data, 'base64')); console.log(`    (shot: ${f})`);
  } catch { }
};

await step('③ open', async () => {
  await evalJs(`(async () => { window.app.viewSession(${J(SID)}, ${J(CWD)}, 'card lists'); return true; })()`);
  check('③ the conversation opens in a ChatView', await waitFor(`!!(${VIEW}) && (${VIEW})._messageList.querySelectorAll(':scope > .chat-msg').length >= 2`, 20000));
  await evalJs(`(async () => { const v = ${VIEW}; for (const m of ${J(CARDS.map((c) => c.msg))}) v._onCreateMessage(m); await new Promise((r) => setTimeout(r, 600)); return true; })()`);
  // a collapsed tool run hides the report until its head opens it
  await evalJs(`(() => { const v = ${VIEW}; const el = [...v._messageList.querySelectorAll('.chat-msg')].find((e) => e.dataset.msgId === 'cli-report'); if (el && el.getClientRects().length === 0) { let h = el.previousElementSibling; while (h && !h.classList.contains('chat-run-header')) h = h.previousElementSibling; if (h) h.click(); } return true; })()`);
  await sleep(300);
});
for (const c of CARDS) {
  await step(`③ ${c.key}`, async () => {
    const m = await evalJs(MEASURE(c.key, c.msg.id, c.sel));
    if (!m || m.missing || !m.shown) { check(`③ ${c.what}: rendered with its two lists`, false, m); return; }
    const tags = m.lists.flatMap((l) => l.items.map((it) => it.tag));
    const marks = await markerBoxes(tags);
    const ul = m.lists.find((l) => l.tag === 'ul'), ol = m.lists.find((l) => l.tag === 'ol');
    check(`③ ${c.what}: rendered with its two lists (a 3-item <ul>, a 12-item <ol>) in .${m.boxCls.split(' ').join('.')}`, !!ul && ul.items.length === 3 && !!ol && ol.items.length === 12, m.lists.map((l) => [l.tag, l.items.length]));
    for (const l of [ul, ol].filter(Boolean)) {
      const kind = l.tag === 'ul' ? 'bullet' : 'ordered';
      const inset = Math.min(...l.items.map((it) => +(it.l - m.textL).toFixed(1)));
      check(`③ ${c.what}: ${kind} list — every item starts ≥ 8 px inside the text column (${inset} px; padding-left ${l.pl} px)`, l.items.every((it) => it.l - m.textL >= 8), { textL: m.textL, items: l.items.map((it) => it.l) });
      const mk = l.items.map((it) => ({ tag: it.tag, m: marks[it.tag] }));
      const missing = mk.filter((x) => !x.m).map((x) => x.tag);
      const worst = mk.filter((x) => x.m).reduce((a, x) => Math.min(a, +(x.m.l - m.textL).toFixed(1)), Infinity);
      check(`③ ${c.what}: ${kind} list — every marker${l.tag === 'ol' ? ' (to «12.»)' : ''} sits inside the text column, not left of it (worst ${worst} px from the column's edge)`, !missing.length && mk.every((x) => x.m.l >= m.textL - 0.5), { missing, textL: m.textL, marks: mk.map((x) => x.m && x.m.l) });
      check(`③ ${c.what}: ${kind} list — every marker stands ≥ 8 px off the card's left border (worst ${mk.filter((x) => x.m).reduce((a, x) => Math.min(a, +(x.m.l - m.cardL).toFixed(1)), Infinity)} px)`, !missing.length && mk.every((x) => x.m.l >= m.cardL + 8), { cardL: m.cardL, marks: mk.map((x) => x.m && x.m.l) });
      check(`③ ${c.what}: ${kind} list — no clipping ancestor cuts a marker (clip edge ${Number.isFinite(m.clipL) ? m.clipL.toFixed(1) : 'none'})`, !missing.length && mk.every((x) => x.m.l >= m.clipL - 0.5), { clipL: m.clipL, marks: mk.map((x) => x.m && x.m.l) });
    }
    await shotOf(c.msg.id, c.key);
  });
}
await step('③ markdown-preview', async () => {
  // the file viewer's / jobs panel's markdown box — the assistant bubble's own rendered lists, in a `.markdown-preview`
  const m = await evalJs(`(() => {
    const src = [...(${VIEW})._messageList.querySelectorAll('.chat-msg')].find((e) => e.dataset.msgId === 'cli-asst');
    const host = document.createElement('div'); host.id = 'cli-md-host'; host.style.cssText = 'position:fixed;left:40px;top:40px;width:420px;height:640px;z-index:99999;background:var(--bg-root)';
    const md = document.createElement('div'); md.className = 'markdown-preview'; md.innerHTML = src.querySelector('.chat-text').innerHTML; host.appendChild(md); document.body.appendChild(host);
    const cs = getComputedStyle(md), R = md.getBoundingClientRect(), textL = R.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft);
    const lists = [...md.querySelectorAll('ul, ol')].map((list, li) => ({ tag: list.tagName.toLowerCase(), items: [...list.children].map((item, ii) => { item.dataset.cli = 'md-' + li + '-' + ii; return { tag: item.dataset.cli, l: item.getBoundingClientRect().left }; }) }));
    return { textL, padL: R.left + parseFloat(cs.borderLeftWidth), lists };
  })()`);
  const marks = await markerBoxes(m.lists.flatMap((l) => l.items.map((it) => it.tag)));
  for (const l of m.lists) {
    const kind = l.tag === 'ul' ? 'bullet' : 'ordered';
    check(`③ .markdown-preview (file viewer / jobs panel): ${kind} list — every item starts ≥ 8 px inside the text column`, l.items.every((it) => it.l - m.textL >= 8), { textL: m.textL, items: l.items.map((it) => it.l) });
    check(`③ .markdown-preview: ${kind} list — every marker sits inside the text column (not in the box's padding)`, l.items.every((it) => marks[it.tag] && marks[it.tag].l >= m.textL - 0.5), { textL: m.textL, marks: l.items.map((it) => marks[it.tag] && marks[it.tag].l) });
  }
  const { data } = await cdp('Page.captureScreenshot', { format: 'png', clip: { x: 34, y: 34, width: 432, height: 652, scale: 1 } });
  const f = path.join(SHOTS, `${PREFIX}-markdown-preview.png`); fs.writeFileSync(f, Buffer.from(data, 'base64')); console.log(`    (shot: ${f})`);
  await evalJs(`document.getElementById('cli-md-host').remove(); true`);
});
check('③ the page threw nothing', !pageErrors.length, pageErrors.slice(0, 3));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
