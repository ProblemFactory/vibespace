#!/usr/bin/env node
// test-peer-card-fold-ui — lane peer-card-fold SEEN in a real page (heavy). The owner's screenshot: five worker
// reports, each a 10-line report under an H1, filled the whole chat window. The node half is
// scripts/test-peer-card-fold.mjs (the PURE verdict, the preview rule, the wiring pins, the controls).
//
// A THROWAWAY server in a git worktree (own data/, a scratch HOME) + headless chrome over raw CDP (the
// test-chat-hygiene-ui skeleton). A stub `claude` behind the REAL chat-wrapper plays, on its first user turn,
// three 12-line worker reports (each under an H1, the CLI's own peer frame around them) and one one-line peer reply.
//   ① at 1280 px and at 375 px (phone): each report is ONE head + ONE preview line + Show — the preview is the
//      heading as plain words, the body is not displayed, the card is ≤ 3 text lines tall (+ the 44 px phone
//      target); the one-liner is whole; the control's aria-label names the sender
//   ② a real mouse press on Show expands that card IN PLACE: the same node, the other cards' nodes identical by
//      reference; the headings inside are bold text (.chat-peer-h), never h1–h6
//   ③ a live patch (the ONE swap path, _swapMessageEl via _rerenderVisible) builds a NEW node for the card and it
//      is STILL open; the label says Hide
//   ④ chat.foldPeerMessages off ⇒ every card whole (the ≤ 3-line census now FAILS — it is not vacuous); back on ⇒
//      folded again, the opened card still open (the state is the view's, by message id)
// Requires google-chrome (SKIP without). Scratch: /tmp/vs-pcf-* only. Run: node scripts/test-peer-card-fold-ui.mjs
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
const report = (n) => [`# lane-w${n} verify r1 — report`, '', `lane-w${n} DONE — final sha abc12${n}`, 'Gates: 171 pass, 1 skip.', '## Findings', '- W1 built', '- W2 built', '- W3 built', '', 'Deviations: none.', `Report: /var/tmp/x/report-${n}.md`, `End of report ${n}.`].join('\n');
const peerRec = (n, name, body) => ({ type: 'user', isMeta: true, origin: { kind: 'peer', from: `uds:/tmp/vs-pcf/${n}.sock`, name, msg_id: `pm-pcf-${n}` }, message: { role: 'user', content: `Another Claude session sent a message:\n<cross-session-message from="uds:/tmp/vs-pcf/${n}.sock" from-name="${name}" from-mode="default">\n${body}\n</cross-session-message>\n\nThis came from another Claude session — not typed by your user.` } });
const NAMES = ['worker one', 'worker two', 'worker three'];

const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('pcf-ui-wt');
const fakeHome = scratchHome('pcf-ui-home', fs);
const stubDir = scratch('pcf-ui-stub');
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

try {
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await waitApp();
  await sleep(800);

  console.log('setup: a live stub session behind the real chat-wrapper');
  const liveWs = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  await new Promise((r) => liveWs.on('open', r));
  const frames = [];
  liveWs.on('message', (d) => { try { frames.push(JSON.parse(String(d))); } catch {} });
  liveWs.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: CWD, reqId: 'pcf1' }));
  let sid = null;
  for (let i = 0; i < 80 && !sid; i++) { const f = frames.find((m) => m?.type === 'created'); if (f) sid = f.sessionId; else await sleep(250); }
  check('a live claude chat session is created through the real spawn path', !!sid);
  await evalJs(`window.__sid = ${JSON.stringify(sid)}; app.attachSession(${JSON.stringify(sid)}, 'peer-fold', ${JSON.stringify(CWD)}, { mode: 'chat', backend: 'claude' }); true`);
  check('the live chat window attaches', await waitFor(`!!document.querySelector('.chat-view .chat-input')`, 20000));
  await sleep(600);
  liveWs.send(JSON.stringify({ type: 'chat-input', sessionId: sid, text: 'Collect the worker reports' }));
  const played = await waitFor(`(() => { const v = ${VIEW}; return !!v && v._messageList.querySelectorAll(':scope > .chat-peer-message').length >= 4 && /Read all four/.test(v._messageList.textContent); })()`, 25000);
  check('three worker reports + one one-line reply arrived as peer cards (live)', played, await evalJs(`(() => { const v = ${VIEW}; return v ? v._messageList.innerText.slice(-500) : 'no view'; })()`));
  await sleep(700);

  // ── ① folded at 1280 and at 375 ──
  for (const [width, phone] of [[1280, false], [375, true]]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height: phone ? 780 : 800, deviceScaleFactor: phone ? 2 : 1, mobile: phone });
    await sleep(900);
    const rows = await evalJs(CENSUS);
    const reps = reports(rows);
    console.log(`① ${width} px: ` + reps.map((c) => `${Math.round(c.h)}/${Math.round(c.pad + 3 * c.lh + (phone ? Math.max(0, 44 - c.lh) : 0) + 6)} px`).join(' · '));
    check(`${width} px: each report is folded — head + ONE preview line (the H1 as plain words) + Show, the body not displayed`,
      reps.length === 3 && reps.every((c, i) => c.folded && !c.open && c.preview === `lane-w${i + 1} verify r1 — report` && c.pvRects === 1 && c.pvH <= c.lh * 1.6 && !c.bodyShown), reps.map(({ text, ...c }) => c));
    check(`${width} px: each report card is ≤ 3 text lines tall${phone ? ' (+ the 44 px target)' : ''}`, reps.every((c) => fits(c, phone)), reps.map((c) => [c.h, c.lh, c.pad]));
    if (phone) check('375 px: the Show control is a ≥ 44 px target', reps.every((c) => c.sumH >= 44), reps.map((c) => c.sumH));
  }
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await sleep(700);
  {
    const rows = await evalJs(CENSUS);
    const one = rows.find((c) => c.title.includes('desk-7'));
    check('the one-line reply is whole (never folded)', one && !one.folded && one.bodyShown && /PONG from desk 7\./.test(one.text), one);
    check('the fold control\'s accessible name says whose message it opens', reports(rows).every((c, i) => c.aria === `Show the message from ${NAMES[i]}`), reports(rows).map((c) => c.aria));
  }

  // ── ② a real press on Show: in place ──
  console.log('② Show expands in place');
  await evalJs(`(() => { const v = ${VIEW}; window.__refs = [...v._messageList.querySelectorAll(':scope > .chat-peer-message')]; const s = window.__refs[1].querySelector('.chat-peer-fold-summary'); s.scrollIntoView({ block: 'center' }); return true; })()`);
  await sleep(300);
  const pt = await evalJs(`(() => { const r = window.__refs[1].querySelector('.chat-peer-fold-btn').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  for (const type of ['mousePressed', 'mouseReleased']) await cdp('Input.dispatchMouseEvent', { type, x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  await sleep(400);
  const s2 = await evalJs(`(() => { const v = ${VIEW}; const now = [...v._messageList.querySelectorAll(':scope > .chat-peer-message')];
    return { same: now.length === window.__refs.length && now.every((el, i) => el === window.__refs[i]), open: !!window.__refs[1].querySelector('details.chat-peer-fold[open]'),
      othersClosed: [0, 2].every((i) => !window.__refs[i].querySelector('details.chat-peer-fold[open]')), opened: [...v._peerOpen] }; })()`);
  const rows2 = await evalJs(CENSUS);
  const r2 = reports(rows2)[1];
  check('the pressed card opened IN PLACE — every peer card node identical by reference, the others still folded', s2.same && s2.open && s2.othersClosed, s2);
  check('…its whole report is displayed (the last line on screen), the preview hidden', r2.bodyShown && /End of report 2\./.test(r2.text) && /Deviations: none\./.test(r2.text), r2.text.slice(0, 400));
  check('…its headings are bold text (.chat-peer-h), never h1–h6', r2.hTags === 0 && r2.peerH.length === 2 && r2.peerH.every((w) => Number(w) >= 600), { hTags: r2.hTags, peerH: r2.peerH });
  check('…the view recorded it by message id', s2.opened.length === 1);

  // ── ③ a live patch keeps it open ──
  console.log('③ a live patch (the swap path) keeps the card open');
  const s3 = await evalJs(`(() => { const v = ${VIEW}; v._rerenderVisible(); const now = [...v._messageList.querySelectorAll(':scope > .chat-peer-message')];
    return { replaced: now[1] !== window.__refs[1], open: !!now[1].querySelector('details.chat-peer-fold[open]'), othersClosed: [0, 2].every((i) => !now[i].querySelector('details.chat-peer-fold[open]')),
      aria: now[1].querySelector('.chat-peer-fold-summary')?.getAttribute('aria-label') }; })()`);
  check('the patched card is a NEW node and still open; the others still folded; the label says Hide', s3.replaced && s3.open && s3.othersClosed && s3.aria === 'Hide the message from worker two', s3);

  // ── ④ the setting ──
  console.log('④ chat.foldPeerMessages off ⇒ whole; on ⇒ folded, the opened card still open');
  await evalJs(`app.settings.set('chat.foldPeerMessages', false); true`);
  await sleep(700);
  const off = reports(await evalJs(CENSUS));
  check('setting off ⇒ every report whole (no fold, the last line on screen), headings still bold text', off.length === 3 && off.every((c, i) => !c.folded && c.bodyShown && c.text.includes(`End of report ${i + 1}.`) && c.hTags === 0), off.map(({ text, ...c }) => c));
  check('…and the ≤ 3-line census FAILS on a whole report (the census is not vacuous)', off.every((c) => !fits(c, false)), off.map((c) => c.h));
  await evalJs(`app.settings.set('chat.foldPeerMessages', true); true`);
  await sleep(700);
  const on = reports(await evalJs(CENSUS));
  check('setting back on ⇒ folded again; the card the user opened is still open', on.length === 3 && on.every((c) => c.folded) && on[1].open && !on[0].open && !on[2].open, on.map(({ text, ...c }) => c));
  check('no page exception', pageErrors.length === 0, pageErrors.slice(0, 3));
  liveWs.close();
} catch (e) {
  failed++;
  console.error('  ✗ the suite threw: ' + (e.stack || e.message));
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
