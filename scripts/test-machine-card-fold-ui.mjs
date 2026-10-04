#!/usr/bin/env node
// test-machine-card-fold-ui — lane machine-card-fold SEEN in a real page (heavy). The owner's phone (2026-10-04): an agent
// working on WIN-DESK1 put one "VibeSpace · Machines · WIN-DESK1" card per vibespace-exit call into the chat, each
// spelling a 700-character `powershell … -EncodedCommand WwBDAG8A…` line. Here the server's OWN words (exit-reach
// cardText / cardOutput / transferCardText) are fed live into a real ChatView (zh, 390 px and 1280 px): six cards of one
// machine fold to ONE head ("WIN-DESK1 · 4 条命令 · 复制了 2 个文件 · 最后：退出码 0 · 11:39–11:41"); opening it shows the
// six; the encoded command reads as its decoded script with the line one click away; a FAILED card stays on screen
// and turns the head to the alert style; a new card patches the closed group in place (the members are the same
// nodes); another machine's card is not swallowed. MCF_SHOTS=<dir> (+ MCF_TAG) saves the PNGs. SKIPs without chrome.
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port (never the machine-global :7/5901 — test-architecture §57)
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
const report = (n) => [`# lane-w${n} verify r1 — report`, '', `lane-w${n} DONE — final sha abc12${n}`, 'Gates: 171 pass, 1 skip.', '## Findings', '- W1 built', '- W2 built', '- W3 built', '', 'Deviations: none.', `Report: /var/tmp/x/report-${n}.md`, `End of report ${n}.`].join('\n');
const peerRec = (n, name, body) => ({ type: 'user', isMeta: true, origin: { kind: 'peer', from: `uds:/tmp/vs-pcf/${n}.sock`, name, msg_id: `pm-pcf-${n}` }, message: { role: 'user', content: `Another Claude session sent a message:\n<cross-session-message from="uds:/tmp/vs-pcf/${n}.sock" from-name="${name}" from-mode="default">\n${body}\n</cross-session-message>\n\nThis came from another Claude session — not typed by your user.` } });
const NAMES = ['worker one', 'worker two', 'worker three'];

const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('mcf-ui-wt');
const fakeHome = scratchHome('mcf-ui-home', fs);
const stubDir = scratch('mcf-ui-stub');
fs.mkdirSync(stubDir, { recursive: true });
const CWD = path.join(fakeHome, 'proj');
fs.mkdirSync(CWD, { recursive: true });
const LIVE_SID = '5c3a0000-0000-4000-8000-00000000pcf1'.replace('pcf1', 'fcf1');
let failed = 0, passed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });

const stubPath = path.join(stubDir, 'claude');
const PLAY = [
  ...NAMES.map((name, i) => peerRec(i + 1, name, report(i + 1))),
  peerRec(4, 'desk-7', 'PONG from desk 7.'),
  { type: 'assistant', message: { id: 'msg_p1', type: 'message', role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text: 'Read all four.' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } } },
];
fs.writeFileSync(stubPath, `#!${process.execPath}
const fs = require('fs');
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('2.1.274 (Claude Code) stub'); process.exit(0); }
if (args.includes('--help')) { console.log('Usage: claude [options]'); process.exit(0); }
const SID = ${JSON.stringify(LIVE_SID)};
const PLAY = ${JSON.stringify(PLAY)};
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
    let j = 0;
    const next = () => {
      if (j < PLAY.length) { out({ ...PLAY[j], session_id: SID, uuid: 'pcf-' + j }); j++; setTimeout(next, 60); return; }
      out({ type: 'result', subtype: 'success', is_error: false, duration_ms: 900, num_turns: 1, result: 'done', session_id: SID, total_cost_usd: 0, usage: { input_tokens: 1, output_tokens: 1 } });
    };
    setTimeout(next, 200);
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
  for (const r of [wt, fakeHome, stubDir]) { try { endRootedProcesses(r); } catch { } }   // §57b: what the server started ends with it
  // every process this suite caused carries one of these scratch paths (dtach, the wrapper, the stub, the worktree's daemon)
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
// the chat view of the live session (the page's own ChatView)
const VIEW = `([...(window.app.sessions?.values?.() || [])].find((v) => v && v._messageList && v.sessionId === window.__sid) || [...(window.app.sessions?.values?.() || [])].filter((v) => v && v._messageList).pop())`;
// one row per peer card, in list order: geometry, the fold, the label, what is displayed
const CENSUS = `(() => { const v = ${VIEW}; const list = v._messageList;
  return [...list.querySelectorAll(':scope > .chat-peer-message')].map((el) => {
    const cs = getComputedStyle(el);
    const det = el.querySelector(':scope > details.chat-peer-fold'); const sum = det && det.querySelector(':scope > summary');
    const body = det ? det.querySelector(':scope > .chat-text') : el.querySelector(':scope > .chat-text');
    const pv = el.querySelector('.chat-peer-preview');
    const lh = parseFloat(getComputedStyle(body || el).lineHeight) || 18;
    return { title: el.querySelector('.chat-peer-title')?.textContent || '', h: el.getBoundingClientRect().height, lh,
      pad: parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth),
      folded: !!det, open: !!(det && det.open), preview: pv ? pv.textContent : null, pvRects: pv ? pv.getClientRects().length : 0,
      pvH: pv ? pv.getBoundingClientRect().height : 0, sumH: sum ? sum.getBoundingClientRect().height : 0,
      bodyShown: !!(body && body.checkVisibility()), aria: sum ? sum.getAttribute('aria-label') : null,
      hTags: el.querySelectorAll('h1,h2,h3,h4,h5,h6').length, peerH: [...el.querySelectorAll('.chat-peer-h')].map((x) => getComputedStyle(x).fontWeight),
      text: el.innerText };
  }); })()`;
// ≤ 3 text lines: the head + the preview (+ slack), plus on a phone the 44 px target's excess over one line
const fits = (c, phone) => c.h <= c.pad + 3 * c.lh + (phone ? Math.max(0, 44 - c.lh) : 0) + 6;
const reports = (rows) => rows.filter((c) => NAMES.some((n) => c.title.includes(n)));

const SHOTS = process.env.MCF_SHOTS || '';
const TAG = process.env.MCF_TAG || 'after';
const E = require(path.join(repo, 'src/exit-reach.js'));
const enc16 = (s) => Buffer.from(s, 'utf16le').toString('base64');
const SCRIPT = '$ErrorActionPreference = "Stop"\r\nGet-ChildItem E:\\house3d\\jobs | Select-Object -Last 3\r\nWrite-Output "@@STATUS DONE 0 15"';
const ENC = `powershell -NoProfile -NonInteractive -EncodedCommand ${enc16(SCRIPT)}`;
const ENC2 = `powershell -NoProfile -NonInteractive -EncodedCommand ${enc16('Get-Content E:\\house3d\\jobs\\h3d-1\\progress.log -Tail 5')}`;
const M = 'WIN-DESK1';
const T0 = Date.UTC(2026, 9, 4, 11, 39);
let n = 0;
const mcard = (machine, text, extra = {}) => { n++; return { id: `mcf-${n}`, role: 'user', status: 'complete', content: [{ type: 'text', text }], ts: T0 + (n - 1) * 25000, turnIndex: 100 + n, originKind: 'peer-message', peerFrom: `Machines · ${machine}`, peerVia: 'notification', ...extra }; };
const ran = (machine, cmd, code, out) => mcard(machine, E.cardText({ outcome: 'ran', cmd, code, ms: 1400 }, { machine }), { exitRun: E.cardOutput({ cmd, code, ms: 1400, heads: E.outputHeads({ stdout: out, stderr: code ? 'Access is denied.' : '' }) }) });
const xfer = (machine, verb) => mcard(machine, E.transferCardText({ verb, outcome: 'done', remote: 'E:\\house3d\\jobs\\h3d-1\\out.png', local: '/var/tmp/mart/h3d-1/out.png', bytes: 1258291, sha256: 'a'.repeat(64), verified: 'sha256', ms: 420 }, { machine }));
const SIX = [ran(M, ENC, 0, '@@STATUS DONE 0 15\n@@OFF 493199\n@@MORE 0'), xfer(M, 'pull'), ran(M, 'hostname', 0, 'WIN-DESK1'), xfer(M, 'push'), ran(M, ENC2, 0, 'frame 12/40'), ran(M, 'dir E:\\house3d', 0, 'jobs')];
const FAILED = ran(M, 'del E:\\house3d\\locked.tmp', 1, '');
const OTHER = ran('linux-box', 'uname -a', 0, 'Linux');
const hm = (ts) => { const d = new Date(ts); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };   // the page's local time = this process's
const SPAN = `${hm(T0)}–${hm(T0 + 5 * 25000)}`;
const shot = async (name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, `${TAG}-${name}.png`), Buffer.from(r.data, 'base64')); };
const MCENSUS = `(() => { const v = ${VIEW}; const list = v._messageList;
  const hs = [...list.querySelectorAll(':scope > .chat-run-header')].map((h) => { const r = h.getBoundingClientRect(); return { label: h.querySelector('.chat-run-label')?.textContent || '', time: h.querySelector('.chat-run-time')?.textContent || '', timeIn: (() => { const s = h.querySelector('.chat-run-time'); if (!s) return false; const q = s.getBoundingClientRect(); return q.width > 0 && q.right <= r.right + 0.5 && s.scrollWidth <= s.clientWidth + 1; })(), alert: h.classList.contains('chat-run-alert'), open: h.classList.contains('open'), h: Math.round(r.height), cut: h.scrollWidth > h.clientWidth + 1 }; });
  const cards = [...list.querySelectorAll(':scope > .chat-msg')].filter((el) => String(el._rawMsg?.peerFrom || '').startsWith('Machines · ')).map((el) => { const line = el.querySelector(':scope > .chat-mline'), w = line && line.querySelector('.chat-mline-what'), err = el.querySelector(':scope > .chat-mline-err'), vis = (x) => !!x && x.checkVisibility();
    return { id: el._rawMsg.id, shown: el.offsetParent !== null, compact: el.classList.contains('chat-machine-compact'), lineShown: vis(line), what: w ? w.textContent : '', out: line?.querySelector('.chat-mline-out')?.textContent || '',
      alert: !!line && line.classList.contains('chat-mline-alert'), expanded: line ? line.getAttribute('aria-expanded') : null, oneLine: !!w && w.getClientRects().length === 1 && w.getBoundingClientRect().height < parseFloat(getComputedStyle(w).fontSize) * 2, lineH: line ? Math.round(line.getBoundingClientRect().height) : 0,
      h: Math.round(el.getBoundingClientRect().height), top: el.getBoundingClientRect().top, bottom: el.getBoundingClientRect().bottom, bt: parseFloat(getComputedStyle(el).borderTopWidth), bb: parseFloat(getComputedStyle(el).borderBottomWidth), btc: getComputedStyle(el).borderTopColor, brc: getComputedStyle(el).borderRightColor, headShown: vis(el.querySelector(':scope > .chat-vs-notice-head')), wordsShown: vis(el.querySelector(':scope > .chat-text, :scope > details.chat-peer-fold')),
      detailShown: vis(el.querySelector(':scope > .chat-exit-run')), scriptShown: vis(el.querySelector(':scope > .chat-exit-run .chat-exit-cmd-enc')), rawShown: vis(el.querySelector(':scope > .chat-exit-run .chat-exit-cmd-raw > summary')), outShown: vis(el.querySelector(':scope > .chat-exit-run .chat-exit-out')),
      errShown: vis(err), err: err ? err.textContent : '', titled: !!el.querySelector('.chat-mline[title], .chat-mline [title]'), seen: el.innerText }; });
  return { hs, cards }; })()`;
const feed = (msgs) => evalJs(`(async () => { const v = ${VIEW}; for (const m of ${JSON.stringify(msgs)}) v._onCreateMessage(m); await new Promise((r) => setTimeout(r, 500)); return true; })()`);
const clickHead = () => evalJs(`(async () => { const v = ${VIEW}; const h = v._messageList.querySelector(':scope > .chat-run-header'); h.scrollIntoView({ block: 'center' }); h.click(); await new Promise((r) => setTimeout(r, 400)); return true; })()`);
const lineOf = (id) => `[...(${VIEW})._messageList.querySelectorAll(':scope > .chat-msg')].find((e) => e._rawMsg?.id === ${JSON.stringify(id)})?.querySelector(':scope > .chat-mline')`;
const clickLine = (id) => evalJs(`(async () => { const l = ${lineOf(id)}; l.scrollIntoView({ block: 'center' }); l.click(); await new Promise((r) => setTimeout(r, 300)); return true; })()`);
const keyLine = (id) => evalJs(`(async () => { const l = ${lineOf(id)}; l.focus(); l.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await new Promise((r) => setTimeout(r, 300)); return true; })()`);
if (!CHROME) { console.log('SKIP: no chrome'); process.exit(0); }
try {
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 780, deviceScaleFactor: 2, mobile: true });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "try { localStorage.setItem('vibespace.lang', 'zh'); } catch (e) { }" });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await waitApp();
  await sleep(800);
  const H_SID = '5c3a0000-0000-4000-8000-0000000000cf';
  const H_CWD = path.join(fakeHome, 'mcf');
  fs.mkdirSync(H_CWD, { recursive: true });
  const pdir = path.join(fakeHome, '.claude', 'projects', H_CWD.replace(/[/._]/g, '-'));
  fs.mkdirSync(pdir, { recursive: true });
  const ts = (s) => new Date(T0 - 60000 + s * 1000).toISOString();
  fs.writeFileSync(path.join(pdir, H_SID + '.jsonl'), [
    { type: 'user', uuid: 'mcf-u1', sessionId: H_SID, cwd: H_CWD, timestamp: ts(0), message: { role: 'user', content: '在 WIN-DESK1 上渲染 house3d 的第 12 帧' } },
    { type: 'assistant', uuid: 'mcf-a1', sessionId: H_SID, cwd: H_CWD, timestamp: ts(5), message: { id: 'msg_mcf1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text: '好的，我在那台机器上开始渲染。' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } } },
  ].map((r) => JSON.stringify(r)).join('\n') + '\n');
  await evalJs(`(async () => { window.__sid = ${JSON.stringify(H_SID)}; window.app.viewSession(${JSON.stringify(H_SID)}, ${JSON.stringify(H_CWD)}, 'machine fold'); return true; })()`);
  check('the conversation opens', await waitFor(`!!(${VIEW}) && (${VIEW})._messageList.querySelectorAll(':scope > .chat-msg').length >= 2`, 20000));
  await feed(SIX);
  await shot('390-zh-six');
  console.log('① six cards of one machine at 390 px (zh)');
  let c = await evalJs(MCENSUS);
  const mh = c.hs.filter((h) => h.label.startsWith(M));
  check('① ONE head for the six: "WIN-DESK1 · 4 条命令 · 2 个文件 · 最后：退出码 0" + the time span in its own span', mh.length === 1 && mh[0].label === 'WIN-DESK1 · 4 条命令 · 2 个文件 · 最后：退出码 0' && mh[0].time === `· ${SPAN}` && !mh[0].alert, c.hs);
  check('① …closed: none of the six cards is on screen', c.cards.length === 6 && c.cards.every((x) => !x.shown), c.cards);
  check('① …the head is ONE line at 390 px (≤ 32 px tall) and its time span is whole on screen', mh[0] && mh[0].h <= 32 && mh[0].timeIn, mh[0]);
  console.log('② open: the six, the decoded script, the line one click away');
  await clickHead();
  c = await evalJs(MCENSUS);
  check('② open ⇒ the six cards are shown', c.cards.length === 6 && c.cards.every((x) => x.shown) && c.hs.some((h) => h.open), c.cards);
  check('② …each as ONE compact line (a ~40 px row at 390 px): no "VibeSpace · Machines" header, no machine name, no words / script / output', c.cards.length === 6 && c.cards.every((x) => x.compact && x.lineShown && x.oneLine && !x.headShown && !x.wordsShown && !x.detailShown && !x.seen.includes(M) && x.lineH >= 38 && x.lineH <= 42 && x.h <= 44), c.cards);
  const headOf = (m) => /`([^`]*)`/.exec(m.content[0].text)[1];
  const framed = (cs) => cs.every((x, i) => i === 0 || Math.abs(x.top - cs[i - 1].bottom) <= 1) && cs.slice(0, -1).every((x) => x.bb === 0) && cs[cs.length - 1].bb >= 1 && cs.every((x) => x.bt >= 1) && cs.slice(1).every((x) => x.btc !== x.brc);
  check('② …the open group is ONE framed list: the rows touch (no gap), a thin divider between rows, the frame only round the whole', framed(c.cards), c.cards.map((x) => ({ id: x.id, top: x.top, bottom: x.bottom, bt: x.bt, bb: x.bb, btc: x.btc, brc: x.brc })));
  check('② …the line: the verb + the readable command, then the outcome ("PowerShell: … · exit 0 · 1.4 s", "pulled … → … · 1.2 MiB · 0.4 s")', c.cards[0].what === headOf(SIX[0]) && c.cards[0].what.startsWith('PowerShell: $ErrorActionPreference') && c.cards[0].out === '· exit 0 · 1.4 s' && c.cards[1].what === 'pulled E:\\house3d\\jobs\\h3d-1\\out.png → /var/tmp/mart/h3d-1/out.png' && c.cards[1].out === '· 1.2 MiB · 0.4 s' && c.cards[2].what === 'hostname', c.cards.slice(0, 3));
  check('② …the whole text is ON the line (no hover title), each line closed (aria-expanded=false)', c.cards.every((x) => !x.titled && x.expanded === 'false'), c.cards);
  await evalJs(`(() => { const v = ${VIEW}; v._messageList.querySelector(':scope > .chat-run-header').scrollIntoView({ block: 'start' }); return true; })()`);
  await shot('390-zh-compact');
  await clickLine('mcf-1');
  c = await evalJs(MCENSUS);
  check('② a click on the encoded call\'s line opens ITS detail in place (the script, 显示完整命令, the output) — the other five stay one line', c.cards[0].detailShown && c.cards[0].scriptShown && c.cards[0].rawShown && c.cards[0].outShown && c.cards[0].lineShown && !c.cards[0].headShown && c.cards[0].expanded === 'true' && c.cards.slice(1).every((x) => x.lineShown && !x.detailShown), c.cards);
  const encCard = await evalJs(`(() => { const v = ${VIEW}; const el = [...v._messageList.querySelectorAll(':scope > .chat-msg')].find((e) => e._rawMsg?.id === 'mcf-1'); if (!el) return null;
    const raw = el.querySelector('.chat-exit-cmd-raw'); return { head: el.querySelector('.chat-vs-notice-title')?.textContent + ' | ' + (el.querySelector('.chat-text, p')?.textContent || el.innerText.slice(0, 200)), what: el.querySelector('.chat-exit-cmd-what')?.textContent || '', script: el.querySelector('.chat-exit-cmd-enc .chat-exit-cmd')?.textContent || '', raw: raw ? raw.querySelector('summary').textContent : null, rawShown: raw ? raw.open : null }; })()`);
  check('② the encoded card reads "PowerShell: $ErrorActionPreference = …" and shows the decoded script (zh label), the line behind 显示完整命令', encCard && /PowerShell: \$ErrorActionPreference = "Stop"/.test(encCard.head) && /PowerShell 脚本（由 -EncodedCommand 解码）/.test(encCard.what) && encCard.script.startsWith('$ErrorActionPreference = "Stop"\nGet-ChildItem') && encCard.raw === '显示完整命令' && encCard.rawShown === false, encCard);
  await evalJs(`(() => { const v = ${VIEW}; const el = [...v._messageList.querySelectorAll(':scope > .chat-msg')].find((e) => e._rawMsg?.id === 'mcf-1'); el.scrollIntoView({ block: 'start' }); return true; })()`);
  await shot('390-zh-compact-one-open');
  await clickLine('mcf-1');
  c = await evalJs(MCENSUS);
  check('② a second click closes it again (one line)', !c.cards[0].detailShown && c.cards[0].lineShown && c.cards[0].expanded === 'false', c.cards[0]);
  await keyLine('mcf-3');
  c = await evalJs(MCENSUS);
  const k3 = c.cards[2];
  await keyLine('mcf-3');
  c = await evalJs(MCENSUS);
  check('② Enter on a line opens that call too, and Enter again closes it', k3.detailShown && k3.expanded === 'true' && !c.cards[2].detailShown, [k3, c.cards[2]]);
  await clickHead();
  console.log('③ a FAILED card: on screen, the head in the alert style; the closed group patched in place');
  await evalJs(`(() => { const v = ${VIEW}; window.__mcfEls = [...v._messageList.querySelectorAll(':scope > .chat-msg')].filter((e) => String(e._rawMsg?.peerFrom || '').startsWith('Machines · ')); return true; })()`);
  await feed([FAILED]);
  c = await evalJs(MCENSUS);
  const fh = c.hs.filter((h) => h.label.startsWith(M));
  check('③ still ONE head, now "… · 5 条命令 · 2 个文件 · 1 个失败 · 最后：退出码 1" in the alert style, closed, its time whole at 390 px', fh.length === 1 && fh[0].label === 'WIN-DESK1 · 5 条命令 · 2 个文件 · 1 个失败 · 最后：退出码 1' && fh[0].time === `· ${hm(T0)}–${hm(FAILED.ts)}` && fh[0].timeIn && fh[0].alert && !fh[0].open, c.hs);
  check('③ the failed card stays ON SCREEN outside the closed fold; the six stay folded', c.cards.length === 7 && c.cards.filter((x) => x.shown).map((x) => x.id).join() === FAILED.id, c.cards);
  const fc = c.cards.find((x) => x.id === FAILED.id);
  check('③ …as ONE compact line too, in the alert style, its first error line under it ("Access is denied.")', fc && fc.compact && fc.lineShown && fc.alert && fc.out === '· exit 1 · 1.4 s' && fc.errShown && fc.err === 'Access is denied.' && !fc.headShown && !fc.detailShown && !fc.seen.includes(M), fc);
  const same = await evalJs(`(() => { const v = ${VIEW}; const now = [...v._messageList.querySelectorAll(':scope > .chat-msg')].filter((e) => String(e._rawMsg?.peerFrom || '').startsWith('Machines · ')); return window.__mcfEls.every((e, i) => e.isConnected && now[i] === e); })()`);
  check('③ the group was patched in place: the six members are the SAME nodes (no re-creation)', same === true);
  await evalJs(`(() => { const v = ${VIEW}; v._messageList.querySelector(':scope > .chat-run-header').scrollIntoView({ block: 'center' }); return true; })()`);
  await shot('390-zh-failed');
  console.log('④ another machine\'s card is not swallowed; 1280 px');
  await feed([OTHER]);
  c = await evalJs(MCENSUS);
  check('④ linux-box\'s card is its own (on screen), the WIN-DESK1 head unchanged', c.cards.find((x) => x.id === OTHER.id)?.shown && c.hs.filter((h) => h.label.startsWith(M)).length === 1 && !c.hs.some((h) => h.label.startsWith('linux-box')), c);
  const oc = c.cards.find((x) => x.id === OTHER.id);
  check('④ …a LONE card (another machine) stays the full card: its header, its words, its command + output; no compact line', oc && oc.shown && !oc.compact && !oc.lineShown && oc.headShown && oc.wordsShown && oc.detailShown, oc);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await sleep(500);
  c = await evalJs(MCENSUS);
  const wh = c.hs.filter((h) => h.label.startsWith(M));
  check('④ at 1280 px: one WIN-DESK1 head (alert, one line), the failed and the other machine\'s card shown, the six folded', wh.length === 1 && wh[0].alert && wh[0].h <= 32 && c.cards.filter((x) => x.shown).map((x) => x.id).join() === [FAILED.id, OTHER.id].join(), c);
  await shot('1280-zh-failed');
  await clickHead();
  c = await evalJs(MCENSUS);
  check('④ 1280 px open: the seven WIN-DESK1 calls are one ~30 px row each in ONE framed list (the failed one in the alert style), linux-box whole', c.cards.filter((x) => x.id !== OTHER.id).every((x) => x.compact && x.lineShown && x.oneLine && !x.headShown && !x.detailShown && x.h >= 28 && x.h <= (x.errShown ? 56 : 34)) && framed(c.cards.filter((x) => x.id !== OTHER.id)) && c.cards.find((x) => x.id === FAILED.id)?.alert && c.cards.find((x) => x.id === OTHER.id)?.headShown && c.hs.find((h) => h.label.startsWith(M))?.timeIn, c.cards.map((x) => [x.id, x.compact, x.lineShown, x.oneLine, x.headShown, x.detailShown, x.h, x.bt, x.bb, Math.round(x.top), Math.round(x.bottom), x.errShown, x.btc === x.brc]));
  check('no page exception', pageErrors.length === 0, pageErrors.slice(0, 3));
} catch (e) {
  failed++;
  console.error('  ✗ the suite threw: ' + (e.stack || e.message));
}
cleanup();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
