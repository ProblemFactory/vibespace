#!/usr/bin/env node
// SIX PHONE-TIER REPORTS IN A REAL CHROME (lane phone-six, 2026-10-26 — a fleet user, userW, relayed by the owner). A
// throwaway server in a git worktree (the tree under test's src/ + built public/), stub `claude` conversations behind the
// real chat-wrapper (one files three questions — urgent, high, normal — and a notice through the agent route), headless
// Chrome over raw CDP as a phone (touch, pointer: coarse, hover: none, DPR 3) under THE RUNNER'S SHAPE: the hosted
// runner's DejaVu Sans (a scratch fontconfig — scripts/scratch.mjs runnerFontEnv) and Emulation.setCPUThrottlingRate 4
// before the first measure; every press that follows a measure is ONE act (scratch.mjs realClicker); a leg waits for the
// CONTENT it reads. The arrangement is a DESKTOP's (a phone never writes one, §6b guard 10): «Desktop 1» = two chats + a
// two-tab group, «Desk B» = a file explorer, «Desk C» = empty.
//   ① EVERY FIELD AT 16 PX (「在任意 session 的地方点击输入框，就会让整个屏幕放大一点」): 390 × 844 — the window on show,
//     then every phone door's surface (src/phone-doors.js PHONE_TWINS — a door with no opener here is red) + the For-you
//     tray, the vault, a rename prompt and the channel composer: every focusable field's computed font-size ≥ 16 px (iOS
//     zooms to a smaller one and never zooms back); ①b the composer focused, the page zoomed ×1.6 (iOS's own zoom), the
//     keyboard up and down (a visual-viewport shrink and grow): the send button whole inside the visual viewport after
//   ② THE TITLE AFTER A DESKTOP SWITCH (「每次切完桌面就会变成空白」): 669 × 867 (the regular class beside its list column)
//     and 390 × 844 — the Desktops door (on the compact class it may stand in «⋯» — the fold), a row: in the FIRST frame on the new desktop the title names its window (its
//     name, drawn ≥ 40 px wide — the base drew 4 px) or «No window» on an empty one; a switch queued behind another
//     (inside its second) still shows the new desktop's window and names it
//   ③ ONE NUMBER ON THE TRAY BUTTON (「非常多的数字围绕在周围」): 390 × 844 with room in the bar — exactly ONE, the honest count in the
//     urgent colour (主开发's ruling 2026-11-13: the compact class, always); 669 × 867 beside the list — the regular class's five
//     fold into it before the name gives way (YIELD_LADDER 'badges'); the 844 × 390 landscape column keeps five
//   ④ A ROTATION KEEPS THE LIST (「每次旋转完屏幕之后都会把侧边栏默认打开」): 390 × 844 → 844 × 390 (landscapePrimary, the
//     same screen) → back, with the list closed (stays closed) and open (stays open)
//   ⑤ THE TABS IN LANDSCAPE (「横屏之后 tab 就不见了」): 844 × 390 and 390 × 844 — the two-tab group's strip is drawn, each
//     tab ≥ 44 px tall, a press on the other tab shows it
//     ⑤b six tabs at 390 and 669 (the recovery's reader): every name keeps ≥ 4 em and the strip scrolls (four clones of the real tab)
//   ⑥d THE ROW YIELDS (主开发 2026-11-17, ruling B on the row): both chips, a long name, zh / en, 320–430 + the column beside the
//     list at 700 × 390 — the centre is the NAME, the ⋯ and ✕ whole inside the screen; at 320 the ⋯ menu holds what yielded
//   ⑥ SIDE BY SIDE: 390 × 844 — the switcher's «Split» door SAYS why («Rotate to split») and its press says it again;
//     844 × 390 — «Split» opens two panes (left | right, each ≥ MIN_PANE, both transcripts drawn, each composer 16 px,
//     each head naming its window with a 44 px ✕), a pane's tap makes it the one on show, the back closes a layer opened
//     over the split and leaves both panes; a rotation to portrait shows one pane (the pair kept), the rotation back and a
//     reload restore it; a pane's ✕ ends it
//   ⑦ ROUND 2 (the acceptance's findings on 6f4f858c): ⑦a the backlog chip's base rule (.bl-prio 9 px / 0 5 px — the
//     round-1 block cut the comment above it); ⑦b 844 × 390, the split standing, ☰ shows the list column ⇒ the split
//     collapses to the pane on show (the pair kept, the other in the switcher), ☰ again ⇒ it returns; ⑦c the first tap on
//     the head of the pane not on show only makes it the one on show, the head of the pane on show opens the switcher;
//     ⑦d «Split» on a minimized window's row restores it beside the window on show, and a pane's window minimized ends
//     the split, said, the pair dropped; ⑦e 669 × 867 beside the list column: a files window titled by a long path shows
//     its folder's own name (the path in the title attribute), drawn whole or ≥ 8 em, a conversation's name too; a name
//     that needs the room folds ⚙ into ⋯ (its row opens the settings), a short one («home») folds nothing
// RED: the same file run on the base tree (`--tree <a 91bf7e18 checkout, built>`) — every leg red, printed in the lane
// report. Requires google-chrome (SKIP without) and a fresh `npm run build` of the tree.
// Run: node scripts/test-phone-six-chrome.mjs [--tree <dir>] [--font dejavu|box] [--legs 1,2,3,4,5,6,7] [--shots <dir>]
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, ONBOARDED_SOURCE, vncEnv, runnerFontEnv, realClicker, stillPresser } from './scratch.mjs';
import { mintRoot, startHub, DAEMON_ROOT_ENV } from './hub-boot.mjs';   // THE SUITES' ONE HUB BOOT (test-architecture §57c)
import { armWatchdog } from './suite-watchdog.mjs';
import { navTitleMinText } from '../src/lib/title-chips.js'; // the release's readable minimum (lane phone-titlebar-title) — the ladder's since 主开发 09:33Z
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port (test-architecture §57)
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const TREE = path.resolve(arg('--tree', repo));
const FONT = arg('--font', 'dejavu');
const LEGS = new Set(String(arg('--legs', '1,2,3,4,5,6,7')).split(','));
const leg = (n) => LEGS.has(String(n));
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
if (!fs.existsSync(path.join(TREE, 'public', 'bundle.js'))) { console.log(`✗ no ${TREE}/public/bundle.js — run \`npm run build\` first`); process.exit(1); }

const [PORT, CDP_PORT] = await freePorts(2);
// the tree and the home live in ONE root the boot helper minted: at exit it ends the hub and everything rooted there, removes the
// worktree through git, then the root (test-architecture §57c — no hub boot outside scripts/hub-boot.mjs)
const root = mintRoot('phone-six');
const wt = path.join(root, 't');
const fakeHome = path.join(root, 'home');
const chromeHome = path.join(root, 'chrome-home'); fs.mkdirSync(chromeHome, { recursive: true });   // rule nine (hub-boot.mjs): the suite's own browser carries a HOME in the root, so the helper ends it before the root goes
for (const d of ['.claude/projects', '.claude/sessions', '.config', '.vibespace']) fs.mkdirSync(path.join(fakeHome, d), { recursive: true });
// ⑦e's files window shows a folder NAMED AT LENGTH (the 2.369.411 checkpoint's red): the boot helper's home is «home» — four
// letters that fit beside the list column with nothing yielded, so ⚙ never folded and ⋯ held no row to read. Before §57c the
// suite's home was /tmp/vs-phone-six-home-<pid>, whose readable minimum «vs-phone-six…» (114 px) made the ladder reach ⚙
// (the 11-17 hosted run); this folder keeps that minimum wherever the helper mints the root
const FILES_DIR = path.join(fakeHome, 'vs-phone-six-home-folder');
fs.mkdirSync(FILES_DIR, { recursive: true });
const chromeDir = scratch('phone-six-chrome');
const stubDir = path.join(root, 'stub');
const fontsDir = scratch('phone-six-fonts');
const CWD = path.join(stubDir, 'work');
const SHOTS = arg('--shots') ? path.resolve(arg('--shots')) : scratch('phone-six-shots');
for (const d of [stubDir, CWD, SHOTS, fontsDir]) fs.mkdirSync(d, { recursive: true });
const FONT_ENV = FONT === 'dejavu' ? runnerFontEnv(fontsDir) : {};
const ORIGIN = `http://127.0.0.1:${PORT}`;
let pass = 0, fail = 0;
const check = (n, c, e) => { if (typeof n !== 'string') throw new Error(`check: the name goes FIRST (got a ${typeof n})`); if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 1200) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
console.log(`tree: ${TREE === repo ? 'this tree' : TREE} · font leg: ${FONT}${FONT === 'dejavu' ? " (the hosted runner's sans-serif)" : ''} · CPU ×4`);

// ── the stub CLI: one assistant turn per user line; '#ask' files three questions and a notice through the agent route ──
fs.writeFileSync(path.join(stubDir, 'claude'), `#!${process.execPath}
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('2.1.308 (Claude Code) stub'); process.exit(0); }
const SID = 'p6-' + process.pid;
const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
out({ type: 'system', subtype: 'init', session_id: SID, model: 'claude-fable-5-1', cwd: process.cwd(), tools: ['Read'], permissionMode: 'default', claude_code_version: '2.1.308' });
let n = 0, buf = '';
process.stdin.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); let m = null; try { m = JSON.parse(line); } catch {} if (!m || m.type !== 'user') continue; const k = n++;
  setTimeout(() => {
    out({ type: 'assistant', session_id: SID, uuid: 'a-' + k, message: { id: 'm' + k, type: 'message', role: 'assistant', model: 'claude-fable-5-1', content: [{ type: 'text', text: 'The retry waits two seconds and gives up after three tries today; I will change it to back off 1, 2, 4, 8 and 16 seconds and mark the order for a person after the fifth try. Shall I add the tests too?' }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 40 } } });
    out({ type: 'result', subtype: 'success', is_error: false, duration_ms: 300, num_turns: 1, result: 'done', session_id: SID, total_cost_usd: 0.001, usage: { input_tokens: 10, output_tokens: 40 } });
  }, 200); } });
process.stdin.on('data', (d) => { if (String(d).includes('#ask') && !globalThis.__asked) { globalThis.__asked = 1;
  const post = (add) => fetch(process.env.VIBESPACE_API + '/api/agent/user-todo', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.VIBESPACE_SESSION_TOKEN }, body: JSON.stringify({ add }) }).catch(() => { });
  (async () => { for (const [text, urgency] of [['Which deck goes to the Q3 review?', 'urgent'], ['Ship the refund fix tonight?', 'high'], ['Rename the shared folder to Q3?', 'normal']]) await post({ text, options: ['Yes', 'No'], kind: 'action', urgency });
    await post({ text: 'The nightly export finished.', kind: 'notice' }); })(); } });
process.stdin.on('end', () => process.exit(0));
`, { mode: 0o755 });

// ── throwaway server in a worktree (the tree under test's src/ + built public/) ──
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) execSync(`rm -rf ${wt}/${f} && cp -r ${TREE}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
const srvEnv = { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, CLAUDE_CMD: path.join(stubDir, 'claude'), VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', NO_AUTO_UPDATE: '1' };
for (const k of DAEMON_ROOT_ENV) delete srvEnv[k];   // a device root, if the caller's env names one, would lie outside the minted root
const hub = startHub({ root, tree: wt, port: PORT, env: srvEnv });   // its output: <root>/hub.log
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--password-store=basic',
  '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--disable-background-timer-throttling', `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore', env: { ...process.env, ...FONT_ENV, HOME: chromeHome } });   // HOME: rule nine
const cleanup = () => {
  // the helper's end ran first (registered at the mint): the hub, every process carrying the root's HOME (Chrome by rule nine, the
  // stub CLI and the hub's terminals by the hub's HOME), the worktree through git, then the root — the kill by handle is a no-op by then
  try { chrome.kill('SIGKILL'); } catch { }
  for (const d of [chromeDir, fontsDir]) { try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { } }
};
process.on('exit', cleanup);   // a signal is the boot helper's (armed at mintRoot: each ends in exit, so this runs) — no signal line here
const PENDS = new Map();
armWatchdog({ capMs: 840e3, exit: (code) => process.exit(code), pending: () => [...PENDS.values()].map((x) => `CDP ${x.method} (${((Date.now() - x.at) / 1000).toFixed(1)} s)`) });
if (!(await hub.ready({ ms: 40000 }))) console.log(`  (the hub did not answer in 40 s — its log:)\n${hub.log().slice(-2000)}`);   // the log lives in the minted root, gone at exit

// ── raw CDP ──
const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 120 && !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((x) => x.type === 'page'); } catch { }
  if (!target) await sleep(250);
}
if (!target) { console.log('✗ chrome never exposed a CDP page target'); process.exit(1); }
const sock = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => sock.on('open', r));
let seq = 0; const pend = new Map(); const pageErrors = [];
sock.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); PENDS.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'unknown');
});
const cdp = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq; PENDS.set(id, { method, at: Date.now() }); pend.set(id, (m) => (m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result)));
  sock.send(JSON.stringify({ id, method, params }));
});
const evalJs = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await evalJs(expr)) return true; } catch { } await sleep(150); } try { return await evalJs(expr); } catch { return false; } };
const shot = async (name, clip = null) => { try { const r = await cdp('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) }); fs.writeFileSync(path.join(SHOTS, name), Buffer.from(r.data, 'base64')); } catch { } };
const realClick = realClicker({ evalJs, cdp });
const stillPress = stillPresser({ evalJs, cdp }); // THE still door (B-8b8c, test-still-press ⑤): a finger's press only on a target that holds still
await cdp('Runtime.enable'); await cdp('Page.enable');
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); // §47: a returning user — no first-run wizard
await cdp('Emulation.setCPUThrottlingRate', { rate: 4 }); // the runner's shape: ×4 before the first measure
/** The phone: a touch screen (coarse, hover-less) at `w`×`h`; the screen is the same one turned (screen w×h follow the
 *  viewport, the orientation type with them) — a live change of the metrics IS the rotation. */
const phone = async (w, h) => {
  await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 3, mobile: true, screenWidth: w, screenHeight: h, screenOrientation: w > h ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 } });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] });
};
const desktopPage = async () => {
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: false });
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'hover' }, { name: 'pointer', value: 'fine' }] });
};
const load = async () => {
  await cdp('Page.navigate', { url: ORIGIN + '/' });
  await waitFor('!!(window.app && app.ready)', 60000); await evalJs('app.ready.then(() => true)');
  await waitFor(`!document.getElementById('loading-screen')`, 30000); await sleep(1000);
};
/** The phone's window area on show (the For-you page put away when it covers it). */
const windowArea = async () => { if (await evalJs('!!app.phoneHome?.shown?.()')) { await evalJs('app.phoneHome.hide(); true'); await sleep(400); } };
/** Settle a rotation: the class switch (120 ms) and the views' re-measure. */
const settled = async (vc) => { await waitFor(`document.documentElement.dataset.vc === ${JSON.stringify(vc)}`, 6000); await sleep(1200); };
const browserBack = async (wait = 900) => { for (const type of ['rawKeyDown', 'keyUp']) await cdp('Input.dispatchKeyEvent', { type, modifiers: 1, key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37, nativeVirtualKeyCode: 37 }); await sleep(wait); };

// ── the conversations, then the arrangement a DESKTOP makes ──
const sessions = await (async () => {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`); const frames = [];
  await new Promise((r) => ws.on('open', r)); ws.on('message', (d) => { try { frames.push(JSON.parse(String(d))); } catch { } });
  const ids = [];
  for (const k of [0, 1, 2, 3]) {
    ws.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: CWD, reqId: 'p6' + k }));
    let sid = null; for (let i = 0; i < 120 && !sid; i++) { const f = frames.find((m) => m?.type === 'created' && m.reqId === 'p6' + k); if (f) sid = f.sessionId; else await sleep(150); }
    if (sid) { ids.push(sid); await sleep(600); ws.send(JSON.stringify({ type: 'chat-input', sessionId: sid, text: k === 0 ? 'Compare the decks for Q3 #ask' : 'Make the refund retry back off exponentially' })); await sleep(1200); }
  }
  ws.close(); return ids;
})();
const attach = async (i) => {
  await evalJs(`(() => { app.attachSession(${JSON.stringify(sessions[i])}, 'p6 ' + ${i}, ${JSON.stringify(CWD)}, { mode: 'chat', backend: 'claude' }); return 1; })()`);
  await waitFor(`[...app.wm.windows.values()].some((w) => app.sessions.get(w.id)?.sessionId === ${JSON.stringify(sessions[i])} && w.element.querySelector('.chat-message-list > .chat-msg-assistant'))`, 30000);
};
const winOf = (i) => `[...app.wm.windows.values()].find((w) => app.sessions.get(w.id)?.sessionId === ${JSON.stringify(sessions[i])})`;
let A = null, B = null, C = null, D = null, FILES = null, DESK = {};
try {
  console.log(`setup: ${sessions.length} stub conversations behind the real chat-wrapper`);
  check('setup: four chat conversations are live', sessions.length === 4, sessions);
  await desktopPage(); await load();
  for (const i of [0, 1, 2, 3]) await attach(i);
  [A, B, C, D] = await evalJs(`[${[0, 1, 2, 3].map((i) => winOf(i) + '?.id').join(', ')}]`);
  DESK = await evalJs(`(async () => { const wm = app.wm, dm = app.desktopManager; const one = dm.activeDesktopId;
    wm.createTabChain(wm.windows.get(${JSON.stringify(C)}), wm.windows.get(${JSON.stringify(D)})); await new Promise((r) => setTimeout(r, 800));
    const b = dm.createDesktop('Desk B'); await dm.switchTo(b); await new Promise((r) => setTimeout(r, 1300)); app.openFileExplorer(${JSON.stringify(FILES_DIR)});
    for (let i = 0; i < 40 && ![...wm.windows.values()].some((w) => w.type === 'files'); i++) await new Promise((r) => setTimeout(r, 200));
    await new Promise((r) => setTimeout(r, 1300)); const c = dm.createDesktop('Desk C'); await dm.switchTo(c); await new Promise((r) => setTimeout(r, 1300));
    await dm.switchTo(one); await new Promise((r) => setTimeout(r, 1300)); wm.focusWindow(${JSON.stringify(A)});
    return { one, b, c, files: [...wm.windows.values()].find((w) => w.type === 'files')?.id || null }; })()`);
  FILES = DESK.files;
  // the hub holds it (its layout record names every window and the empty desktop) — the phone legs load THAT
  const saved = await (async () => { for (let i = 0; i < 120; i++) { try { const j = JSON.stringify(await (await fetch(`${ORIGIN}/api/layouts`)).json()); if (j.includes(FILES) && j.includes(D) && j.includes('Desk C')) return true; } catch { } await sleep(250); } return false; })();
  check('setup: a desktop made the arrangement (Desktop 1 = two chats + a two-tab group, Desk B = a file explorer, Desk C = empty) and saved it', !!(A && B && C && D && FILES && DESK.c) && saved, { A, B, C, D, DESK, saved });

  // ═══ ① EVERY FIELD AT 16 PX ═══
  if (leg(1)) {
    console.log('① every focusable field at 16 px on a touch screen (390 × 844)');
    await phone(390, 844); await load(); await windowArea();
    await evalJs(`app.wm.revealWindow(${JSON.stringify(A)}); true`); await waitFor(`!!document.querySelector('.window.window-active .chat-input')`, 10000);
    const FIELDS = (tag) => `(() => { const out = [];
      for (const e of document.querySelectorAll('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) {
        if (e.dataset.p6seen) continue; e.dataset.p6seen = ${JSON.stringify(tag)};
        if (e.tagName === 'INPUT' && /^(checkbox|radio|range|color|file|hidden|button|submit|reset|image)$/.test(e.type)) continue;
        const cls = typeof e.className === 'string' ? e.className.trim().split(/\\s+/).slice(0, 2).join('.') : '';
        out.push({ f: e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (cls ? '.' + cls : '') + (e.getAttribute('type') ? '[' + e.type + ']' : ''), px: parseFloat(getComputedStyle(e).fontSize) }); }
      return out; })()`;
    const DISMISS = `(() => { document.querySelectorAll('[data-popover], .context-menu, .mobile-win-switcher').forEach((e) => e.remove());
      for (const o of [...document.querySelectorAll('.dialog-overlay')].reverse()) { const x = o.querySelector('.dialog-close'); if (x) x.click(); else if (o.id !== 'dialog-overlay') o.remove(); }
      try { app.hideDialogs?.(); } catch { } document.querySelectorAll('.usage-popup, .global-settings-popover').forEach((e) => e.classList.add('hidden'));
      if (app.sidebar?.isOpen) app.sidebar.toggle(false); return true; })()`;
    const seen = [];
    const take = async (surface) => { const got = await evalJs(FIELDS(surface)); for (const g of got) seen.push({ surface, ...g }); return got.length; };
    await take('the chat window on show');
    // the doors census (src/phone-doors.js): every desktop door's surface, opened the way its phone twin opens it
    const { PHONE_TWINS } = require(path.join(TREE, 'src/phone-doors.js'));
    const gear = (labels) => `(async () => { app._pressGlobalSettings(document.getElementById('mobile-nav-gear')); await new Promise((r) => setTimeout(r, 900));
      for (const l of ${JSON.stringify(labels)}) { const it = [...document.querySelectorAll('.gs-menu-item')].find((e) => e.offsetParent && e.textContent.trim().startsWith(l)); if (!it) return 'no row ' + l; it.click(); await new Promise((r) => setTimeout(r, 900)); } return true; })()`;
    const tab = (name) => `(async () => { app.sidebar.toggle(true); await new Promise((r) => setTimeout(r, 600)); const t = document.querySelector('.sidebar-tab[data-tab="${name}"]'); if (!t) return 'no tab'; t.click(); await new Promise((r) => setTimeout(r, 900)); return true; })()`;
    const OPENERS = {
      'btn-new-session': ['the New Session dialog', 'app.showNewSessionDialog(); true'],
      'btn-terminal': ['a terminal', 'app.openShellTerminal(); true'],
      'btn-file-explorer': ['the file explorer', 'app.openFileExplorer(); true'],
      'btn-browser': ['a web view', 'app.openBrowser(); true'],
      'btn-desktop-apps': ['the Apps window', `app._desktopAppsAvailable ? (document.getElementById('btn-desktop-apps').click(), true) : 'not offered on this box (no desktop apps)'`],
      'btn-desktop': ['the desktop picker', `app._vncAvailable ? (document.getElementById('btn-desktop').click(), true) : 'not offered on this box (no VNC)'`],
      'btn-global-settings': ['the ⚙ menu', `(async () => { app._pressGlobalSettings(document.getElementById('mobile-nav-gear')); await new Promise((r) => setTimeout(r, 900)); return true; })()`],
      'rail:folders': ['☰ Folders', tab('folders')], 'rail:tasks': ['☰ Task Groups', tab('tasks')], 'rail:mounts': ['☰ Remote', tab('mounts')],
      'rail:ports': ['⚙ System ▸ Ports…', gear(['System', 'Ports…'])], 'rail:agents': ['⚙ Manage agents…', gear(['Manage agents…'])],
      'rail:plugins': ['⚙ Tools ▸ Plugins…', gear(['Tools', 'Plugins…'])], 'rail:jobs': ['⚙ Tools ▸ Background Work…', gear(['Tools', 'Background Work…'])],
      'rail:channels': ['⚙ Communication ▸ Channels…', gear(['Communication', 'Channels…'])], 'rail:system': ['⚙ System ▸ System monitor…', gear(['System', 'System monitor…'])],
      'rail:browser': ['the Agent browser window', 'app.openBrowserProfiles?.(); true'], 'rail:diagnostics': ['⚙ System ▸ Diagnostics report…', gear(['System', 'Diagnostics report…'])],
      'rail:settings': ['⚙ All Settings...', gear(['All Settings'])],
      'win:split': ['the window switcher', 'app._mobileNav._showWindowSwitcher(); true'], // lane phone-six: its «Split» (no field)
    };
    const doors = PHONE_TWINS.filter((r) => r.twins);
    const noOpener = doors.filter((r) => !OPENERS[r.door]).map((r) => r.door);
    check(`① the census covers every phone door (${doors.length} with a twin, src/phone-doors.js) — each has its opener here`, !noOpener.length, noOpener);
    const notOn = [];
    for (const r of doors) {
      const o = OPENERS[r.door]; if (!o) continue;
      let res; try { res = await evalJs(o[1]); } catch (e) { res = String(e.message || e); }
      if (typeof res === 'string') { notOn.push(`${r.door}: ${res}`); continue; }
      await sleep(1600);
      await take(o[0]);
      await evalJs(DISMISS); await sleep(400);
    }
    // the surfaces no door row names: the For-you tray (a reply box), the vault, a rename prompt, the chat's search, the
    // channel composer (no account here — its stylesheet rule, on its own markup)
    await evalJs(`(async () => { document.getElementById('mobile-nav-todos').click(); await new Promise((r) => setTimeout(r, 1200)); const rb = [...document.querySelectorAll('#phone-home .ut-reply-btn, #phone-home [data-act="reply"], #user-todos-popup [data-act="reply"]')].find((b) => b.offsetParent); rb?.click(); await new Promise((r) => setTimeout(r, 600)); return true; })()`);
    await take('the For-you tray');
    await evalJs(DISMISS); await windowArea();
    await evalJs(`window.dispatchEvent(new Event('vs-vault-door')); true`); await sleep(1500); await take('the vault'); await evalJs(DISMISS); await sleep(300);
    await evalJs(`(() => { const w = ${winOf(1)}; app.wm.revealWindow(w.id); return true; })()`); await sleep(800);
    await evalJs(`(() => { app.desktopManager._startRename(app.desktopManager.desktops[0]); return true; })()`); await sleep(1000); await take('a rename prompt'); await evalJs(DISMISS);
    await evalJs(`(() => { const h = document.createElement('div'); h.id = 'p6-chan'; h.innerHTML = '<div class="chanwin-foot"><div class="chanwin-composer"><textarea></textarea></div></div>'; document.body.appendChild(h); return true; })()`);
    await take('the channel composer (its markup)'); await evalJs(`document.getElementById('p6-chan')?.remove(); true`);
    const under = seen.filter((s) => !(s.px >= 16));
    const bySurface = {}; for (const s of seen) bySurface[s.surface] = (bySurface[s.surface] || 0) + 1;
    console.log(`  (measured ${seen.length} fields on ${Object.keys(bySurface).length} surfaces${notOn.length ? '; not on this box: ' + notOn.join(' · ') : ''})`);
    check(`① the census saw the fields (≥ 20 across ≥ 10 surfaces, the composer among them): ${seen.length} on ${Object.keys(bySurface).length}`, seen.length >= 20 && Object.keys(bySurface).length >= 10 && seen.some((s) => /textarea\.chat-input/.test(s.f)), bySurface);
    check(`① every focusable field renders ≥ 16 px on a touch screen (iOS zooms to a smaller one and never zooms back) — ${under.length} under`, under.length === 0, under.map((s) => `${s.surface}: ${s.f} ${s.px}px`).slice(0, 30));
    // ①b the keyboard folds over a zoomed page: the send button comes back
    await load(); await windowArea();
    await evalJs(`app.wm.revealWindow(${JSON.stringify(A)}); true`); await waitFor(`!!document.querySelector('.window.window-active .chat-send-btn')`, 10000); await sleep(600);
    const VV = `(() => { const vv = visualViewport, b = document.querySelector('.window.window-active .chat-send-btn').getBoundingClientRect(); return { scale: +vv.scale.toFixed(2), vv: [Math.round(vv.offsetLeft), Math.round(vv.offsetTop), Math.round(vv.width), Math.round(vv.height)], send: [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)], inside: b.left >= vv.offsetLeft - 1 && b.top >= vv.offsetTop - 1 && b.right <= vv.offsetLeft + vv.width + 1 && b.bottom <= vv.offsetTop + vv.height + 1 }; })()`;
    await evalJs(`document.querySelector('.window.window-active .chat-input').focus(); true`); await sleep(300);
    await cdp('Emulation.setPageScaleFactor', { pageScaleFactor: 1.6 }); await sleep(700);
    const z = await evalJs(VV);
    await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 500, deviceScaleFactor: 3, mobile: true, screenWidth: 390, screenHeight: 844, screenOrientation: { type: 'portraitPrimary', angle: 0 } }); await sleep(900);
    await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true, screenWidth: 390, screenHeight: 844, screenOrientation: { type: 'portraitPrimary', angle: 0 } });
    await waitFor(`(${VV}).inside`, 3000);
    const k = await evalJs(VV);
    await cdp('Emulation.setPageScaleFactor', { pageScaleFactor: 1 }); await sleep(400);
    check('①b the page zoomed ×1.6 put the send button off the visual viewport (the setup)', z.scale > 1.5 && !z.inside, z);
    check('①b …the keyboard up and down (the visual viewport shrinks and grows): the send button is whole inside the visual viewport', k.inside, k);
  }

  // ═══ ② THE TITLE AFTER A DESKTOP SWITCH ═══
  if (leg(2)) {
    console.log('② the title names the new desktop\'s window in the first frame (669 × 867 beside the list column, 390 × 844)');
    // every frame: the title's words and drawn width, and the NAME of each window of the active desktop in that frame (a
    // window may rename itself later — the explorer's title becomes its folder once listed)
    const SAMPLER = `(() => { window.__tt = []; const t0 = performance.now(), tok = {}; window.__ttTok = tok; const tick = () => { if (window.__ttTok !== tok) return; /* one sampler at a time */ const e = document.getElementById('mobile-nav-title'), r = e.getBoundingClientRect(), desk = app.desktopManager.activeDesktopId;
      const names = {}; for (const w of app.wm.windows.values()) if (w._desktopId === desk) names[w.id] = String(w.title || '').split(' — ')[0].trim();
      window.__tt.push({ ms: Math.round(performance.now() - t0), desk, text: e.textContent, w: Math.round(getComputedStyle(e).display === 'none' ? 0 : r.width), names }); if (performance.now() - t0 < 5000) requestAnimationFrame(tick); }; requestAnimationFrame(tick); return true; })()`;
    const SHOWN = `(() => { const a = app.wm.windows.get(app.wm.activeWindowId); return a && !a._hiddenByDesktop && a._desktopId === app.desktopManager.activeDesktopId ? a.id : null; })()`;
    // the Desktops door: on the bar, or — on the compact class, whose fold yields the chips to the title by measure (lane
    // phone-titlebar-title, .38x) — the «⋯» row that stands for it
    const openDesktops = async () => {
      if (await evalJs(`(() => { const d = document.getElementById('mobile-nav-desktops'); return !!d && getComputedStyle(d).display !== 'none' && d.getBoundingClientRect().width > 0; })()`)) return realClick('#mobile-nav-desktops');
      if (!(await realClick('#mobile-nav-overflow'))) return false;
      await waitFor(`!!document.querySelector('.context-menu-item[data-key="desktops"]')`, 4000);
      return realClick('.context-menu-item[data-key="desktops"]');
    };
    for (const [w, h] of [[669, 867], [390, 844]]) {
      await phone(w, h); await load(); await windowArea();
      for (const [to, label] of [[DESK.b, 'Desk B'], [DESK.c, 'Desk C'], [DESK.one, 'Desktop 1']]) {
        const opened = await openDesktops();
        await waitFor(`!!document.querySelector('.mdesk-menu .context-menu-item')`, 5000);
        await evalJs(`(() => { [...document.querySelectorAll('.mdesk-menu .context-menu-item')].forEach((r, i) => { r.dataset.p6row = (r.querySelector('.mdesk-name')?.textContent || '').trim(); }); return true; })()`);
        await evalJs(SAMPLER);
        const pressed = await realClick(`.mdesk-menu .context-menu-item[data-p6row="${label}"]`);
        await waitFor(`app.desktopManager.activeDesktopId === ${JSON.stringify(to)}`, 6000); await sleep(2500);
        const tt = await evalJs('window.__tt');
        const shownId = await evalJs(SHOWN);
        const first = tt.find((s) => s.desk === to) || null;
        const want = to === DESK.c ? 'No window' : (first && shownId ? first.names[shownId] : null); // the window on show, named as it was in that frame
        await shot(`title-${w}-${label.replace(/\s+/g, '')}.png`, { x: 0, y: 0, width: w, height: 48 });
        check(`② ${w} × ${h} → «${label}» through the Desktops door: the first frame there names its window on show («${want}») and draws it ≥ 40 px wide`, opened && pressed && !!first && !!want && first.text.startsWith(want) && first.w >= 40, { opened, pressed, want, shownId, first: first && { ...first, names: undefined }, last: { ...tt[tt.length - 1], names: undefined } });
      }
    }
    // a switch queued behind another (the second within the first's second): the new desktop's window is shown and named
    await evalJs(`(async () => { app._mobileNav.switchDesktop(${JSON.stringify(DESK.b)}); await new Promise((r) => setTimeout(r, 300)); app._mobileNav.switchDesktop(${JSON.stringify(DESK.one)}); return true; })()`);
    await sleep(3200);
    const q = await evalJs(`(() => { const a = app.wm.windows.get(app.wm.activeWindowId); return { desk: app.desktopManager.activeDesktopId, activeDesk: a?._desktopId || null, hidden: !!a?._hiddenByDesktop, shown: !!document.querySelector('.window.window-active') && getComputedStyle(document.querySelector('.window.window-active')).visibility !== 'hidden', title: document.getElementById('mobile-nav-title').textContent, name: a ? String(a.title || '').split(' — ')[0] : null }; })()`);
    check('② a switch queued behind another lands with its own window on show and named (the title never names the hidden one)', q.desk === DESK.one && q.activeDesk === DESK.one && !q.hidden && q.shown && !!q.name && q.title.startsWith(q.name), q);
  }

  // ═══ ③ ONE NUMBER ON THE TRAY BUTTON — where the name needs the room (the recovery port onto .398) ═══
  // the compact bar's For-you chip collapses its five badges to ONE by measure since .38x (lane phone-titlebar-title —
  // title-chips.js navOneBadge, its own suites pin it); that lane keeps the REGULAR class's five (its ⑤, pinned). Beside the list
  // at 669 px they took the window's name down to its icon: there they yield like the bar's other buttons — _paintHead's
  // YIELD_LADDER step 'badges' shows the same ONE .mnav-one — and in the landscape column (no name in the bar) the five stay
  if (leg(3)) {
    console.log('③ the For-you numbers yield to the name in the regular portrait bar (669 × 867 beside the list); the landscape column keeps five');
    const NUMS = `(() => { const b = document.getElementById('mobile-nav-todos'), t = document.getElementById('mobile-nav-title'); const nums = [...b.querySelectorAll('*')].filter((e) => !e.children.length && /\\d/.test(e.textContent) && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0).map((e) => ({ n: e.textContent.trim(), cls: String(e.className), seg: e.dataset.seg || null })); return { vc: document.documentElement.dataset.vc, yield: document.getElementById('mobile-nav').dataset.yield || '', nums, name: t.textContent, nameW: Math.round(t.getBoundingClientRect().width), whole: t.scrollWidth <= t.clientWidth + 1 }; })()`;
    await phone(390, 844); await load(); await settled('compact'); await sleep(800); // the first screen: the For-you page — a short bar title, room to spare
    await waitFor(`/\\d/.test(document.getElementById('mobile-nav-todos').textContent)`, 20000); await sleep(800);
    const K3 = await evalJs(NUMS);
    await shot('tray-nav-390.png', { x: 0, y: 0, width: 390, height: 48 });
    check(`③ 390 × 844 (compact, room in the bar): the For-you button carries exactly ONE number — the honest count (3), urgent (主开发's ruling; it drew ${K3.nums.length}: ${K3.nums.map((x) => x.n).join(' · ')})`, K3.vc === 'compact' && K3.nums.length === 1 && K3.nums[0].n === '3' && K3.nums[0].seg === 'urgent', K3);
    await phone(669, 867); await load(); await settled('regular'); await windowArea();
    await waitFor(`/\\d/.test(document.getElementById('mobile-nav-todos').textContent)`, 20000); await sleep(800);
    const N = await evalJs(NUMS);
    await shot('tray-nav-669.png', { x: 0, y: 0, width: 669, height: 48 });
    check(`③ 669 × 867 beside the list: the For-you numbers yield to the name — ONE number (the honest count, 3, urgent), the name ${N.nameW} px${N.whole ? ', whole' : ''} («${N.name}», ladder step «${N.yield}»)`, N.vc === 'regular' && ['badges', 'gear'].includes(N.yield) && N.nums.length === 1 && N.nums[0].n === '3' && N.nums[0].seg === 'urgent' && (N.whole || N.nameW >= 100), N); // drawn WHOLE, or ≥ 100 px (claim 2: «Session 1» is whole at 79 px)
    await phone(844, 390); await load(); await settled('regular'); await sleep(800);
    const L3 = await evalJs(NUMS);
    check(`③ 844 × 390 (the landscape column, no name in the bar): the five numbers stay (lane phone-titlebar-title's — ${L3.nums.map((x) => x.n).join(' · ')})`, L3.vc === 'regular' && !L3.yield && L3.nums.length >= 3 && !L3.nums.some((x) => /mnav-one/.test(x.cls)), L3);
  }

  // ═══ ④ A ROTATION KEEPS THE LIST ═══
  if (leg(4)) {
    console.log('④ a rotation keeps the conversation list as the person left it');
    const L = `({ vc: document.documentElement.dataset.vc, shown: document.documentElement.dataset.vc === 'regular' ? !document.documentElement.classList.contains('vs-list-hidden') && document.getElementById('sidebar').getBoundingClientRect().width > 0 : !!app.sidebar.isOpen && document.getElementById('sidebar').getBoundingClientRect().right > 1 })`;
    await phone(390, 844); await load(); await windowArea();
    if (await evalJs('app.sidebar.isOpen')) { await evalJs('app.sidebar.toggle(false); true'); await sleep(400); }
    const c0 = await evalJs(L);
    await phone(844, 390); await settled('regular'); const c1 = await evalJs(L); await shot('rotate-closed-844.png');
    await phone(390, 844); await settled('compact'); const c2 = await evalJs(L);
    check('④ closed → turned to landscape → back: the list stays closed (the base opened the list column on the turn)', c0.shown === false && c1.shown === false && c2.shown === false, { c0, c1, c2 });
    await evalJs('app.sidebar.toggle(true); true'); await sleep(600);
    const o0 = await evalJs(L);
    await phone(844, 390); await settled('regular'); const o1 = await evalJs(L);
    await phone(390, 844); await settled('compact'); const o2 = await evalJs(L);
    check('④ open → turned to landscape → back: the list stays open (the base closed the drawer on the way back)', o0.shown === true && o1.shown === true && o2.shown === true, { o0, o1, o2 });
    await evalJs('app.sidebar.toggle(false); true');
  }

  // ═══ ⑤ THE TABS IN LANDSCAPE ═══
  if (leg(5)) {
    console.log('⑤ a two-tab group\'s strip in landscape and portrait');
    const TABS = `(() => { const win = document.querySelector('.window.window-active'); const vis = (e) => !!e && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden' && e.getBoundingClientRect().width > 0;
      const tabs = [...(win?.querySelectorAll(':scope > .window-titlebar .tab-item') || [])]; return { tabs: tabs.map((t) => ({ id: t.dataset.winId, vis: vis(t), h: Math.round(t.getBoundingClientRect().height), active: t.classList.contains('active') })), shownWin: app.wm.activeWindowId }; })()`;
    for (const [w, h, vc] of [[844, 390, 'regular'], [390, 844, 'compact']]) {
      await phone(w, h); await load(); await windowArea(); await settled(vc);
      await evalJs(`app.wm.revealWindow(${JSON.stringify(C)}); true`); await sleep(1200);
      const t0 = await evalJs(TABS);
      await shot(`tabs-${w}.png`);
      check(`⑤ ${w} × ${h}: the group's strip is drawn — both tabs on screen, each ≥ 44 px tall`, t0.tabs.length === 2 && t0.tabs.every((t) => t.vis && t.h >= 44), t0);
      const other = t0.tabs.find((t) => !t.active)?.id || D;
      const pressed = await realClick(`.window.window-active > .window-titlebar .tab-item[data-win-id="${other}"]`);
      const sw = await waitFor(`app.wm.activeWindowId === ${JSON.stringify(other)}`, 4000);
      check(`⑤ ${w} × ${h}: a press on the other tab shows it`, pressed && sw, { pressed, sw, after: await evalJs(TABS), miss: realClick.lastMiss });
    }
    // ⑤b SIX TABS (the recovery's reader: six icons and no name at 360 / 390 / 669 — the tabs shrank to their icons): the same strip
    // with four clones of its own tab (the real stylesheet; names in zh) — every name keeps 4 em (four CJK / six Latin glyphs) and the
    // strip SCROLLS instead; RED on the release copy: no strip at all, and on 6f4f858c-shaped CSS a 0-px name
    for (const [w, h, vc] of [[390, 844, 'compact'], [669, 867, 'regular']]) {
      await phone(w, h); await load(); await windowArea(); await settled(vc);
      await evalJs(`app.wm.revealWindow(${JSON.stringify(C)}); true`); await sleep(1200);
      const six = await evalJs(`(() => { const strip = document.querySelector('.window.window-active > .window-titlebar .tab-bar-tabs'); if (!strip) return { strip: false };
        const t = strip.querySelector('.tab-item'); const names = ['第三个窗口 export', '第四个窗口 deploy', '第五个窗口 review', '第六个窗口 lark'];
        for (const n of names) { const c = t.cloneNode(true); c.classList.remove('active'); c.dataset.winId = 'p6-clone'; c.querySelector('.tab-label').textContent = n; strip.appendChild(c); }
        const labs = [...strip.querySelectorAll('.tab-item > .tab-label')].map((l) => { const fs = parseFloat(getComputedStyle(l).fontSize) || 14; return { w: Math.round(l.getBoundingClientRect().width), floor: Math.round(4 * fs), text: l.textContent.slice(0, 8) }; });
        const out = { strip: true, n: labs.length, labs, scrolls: strip.scrollWidth > strip.clientWidth + 1 };
        return out; })()`);
      await shot(`tabs-six-${w}.png`, { x: 0, y: 0, width: w, height: 160 });
      await evalJs(`document.querySelectorAll('.tab-item[data-win-id="p6-clone"]').forEach((c) => c.remove()); true`);
      check(`⑤b ${w} × ${h}: six tabs — every name keeps ≥ 4 em (${six.labs ? six.labs.map((l) => l.w).join(' / ') : '?'} px) and the strip scrolls`, six.strip && six.n === 6 && six.labs.every((l) => l.w + 0.5 >= l.floor) && six.scrolls, six);
    }
  }

  // ═══ ⑥ SIDE BY SIDE ═══
  if (leg(6)) {
    console.log('⑥ side by side: two windows, left and right, where they fit');
    const DOOR = `(() => [...document.querySelectorAll('.mobile-win-row')].map((r) => ({ t: r.textContent.slice(0, 30), b: (r.querySelector('.mobile-win-split')?.getAttribute('aria-label') || r.querySelector('.mobile-win-split')?.textContent) || null, /* the refused door is an icon NAMED by its words */ why: r.querySelector('.mobile-win-split')?.dataset.why || null, h: Math.round(r.querySelector('.mobile-win-split')?.getBoundingClientRect().height || 0) })))()`;
    const SPL = `(() => { const vis = (e) => !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0;
      const ps = [...document.querySelectorAll('.window.phone-pane')].filter(vis).sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
      return { on: document.documentElement.classList.contains('vs-split'), drawn: [...document.querySelectorAll('.window')].filter(vis).length, panes: ps.map((p) => { const r = p.getBoundingClientRect(), ta = p.querySelector('.chat-input'), x = p.querySelector('.phone-pane-close'), head = p.querySelector(':scope > .window-titlebar > .window-title');
        return { id: p.dataset.winId || p.id, side: p.dataset.pane, l: Math.round(r.left), w: Math.round(r.width), active: p.classList.contains('window-active'), fs: ta ? parseFloat(getComputedStyle(ta).fontSize) : 0, rows: [...p.querySelectorAll('.chat-message-list > .chat-msg')].filter(vis).length, head: head ? getComputedStyle(head, '::before').content.replace(/^"|"$/g, '') : '', xh: x && vis(x) ? Math.round(x.getBoundingClientRect().height) : 0 }; }) }; })()`;
    const openSwitcher = async () => { await evalJs(`document.querySelector('.mobile-win-switcher') || app._mobileNav._showWindowSwitcher(); true`); await waitFor(`!!document.querySelector('.mobile-win-row')`, 4000); await sleep(300); };
    await phone(390, 844); await load(); await windowArea();
    await evalJs(`app.wm.revealWindow(${JSON.stringify(A)}); true`); await sleep(800);
    await openSwitcher();
    const d390 = await evalJs(DOOR);
    await shot('split-door-390.png');
    const refusedRow = d390.find((r) => r.b);
    check('⑥ 390 × 844 (a portrait phone): the switcher\'s «Split» door is there and SAYS why — «Rotate to split» (never greyed, never absent)', !!refusedRow && refusedRow.why === 'rotate' && refusedRow.b === 'Rotate to split' && refusedRow.h >= 44, d390);
    await realClick('.mobile-win-row .mobile-win-split.refused');
    const toast = await waitFor(`[...document.querySelectorAll('.toast, .gt-toast, [class*="toast"]')].some((t) => t.offsetParent && /Rotate to split/.test(t.textContent))`, 3000);
    check('⑥ …its press says it again (a toast), and nothing splits', toast && !(await evalJs(`document.documentElement.classList.contains('vs-split')`)), { toast });
    await evalJs(`document.querySelector('.mobile-win-switcher')?.remove(); true`);
    // ⑥c THE ROW'S CENTRE IS ITS NAME (主开发's ruling 09:33Z — measured on b1f2ddd61: the refused door's 106 px of words pushed
    // the billing chip under the row's centre, so a thumb on a row opened the chip, not the window): every row of the switcher,
    // a long name, zh and en, 320 / 360 / 390 / 430 — the point at its centre is its NAME
    const LONG = { zh: '一个名字很长的对话：季度报告的数据核对与图表重画', en: 'A conversation with a long name: the quarterly report check' };
    const centres = [];
    for (const lang of ['zh', 'en']) for (const w of [320, 360, 390, 430]) {
      await evalJs(`(() => { localStorage.setItem('vibespace.lang', ${JSON.stringify(lang)}); return true; })()`);
      await phone(w, 844); await load(); await windowArea();
      await evalJs(`(() => { for (const x of app.wm.windows.values()) x.title = ${JSON.stringify(LONG[lang])}; return true; })()`);
      await openSwitcher();
      const rows = await evalJs(`[...document.querySelectorAll('.mobile-win-row')].map((r) => { const b = r.getBoundingClientRect(), h = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2), part = h && h.closest('.mobile-win-row > *'); return { name: !!part && !part.matches('button, .mobile-win-billing, .mobile-win-split') && part.textContent.includes(${JSON.stringify(LONG[lang].slice(0, 6))}), hit: part ? (part.className || part.tagName).toString().slice(0, 24) : null }; })`);
      if (w === 360) await shot(`switcher-row-${lang}-${w}.png`);
      centres.push({ lang, w, rows });
      await evalJs(`document.querySelector('.mobile-win-switcher')?.remove(); true`);
    }
    await evalJs(`(() => { localStorage.removeItem('vibespace.lang'); return true; })()`);
    const offName = centres.filter((c) => !c.rows.length || c.rows.some((r) => !r.name));
    check(`⑥c the row's centre is its NAME — every row, a long name, zh and en, at 320 / 360 / 390 / 430 (${centres.map((c) => c.lang + c.w + ':' + c.rows.length).join(' ')})`, centres.length === 8 && offName.length === 0, offName.slice(0, 3));
    // ⑥d THE ROW YIELDS (主开发 2026-11-17 — the .407 move's meeting: a bill chip, the Split door, the window's ⋯ and the ✕ left a
    // long name 0 px at 320 and cut the ✕ at the screen's edge; the owner's ruling B on the row, PURE phone-head.js
    // ROW_YIELD_LADDER): BOTH chips (pooled + subscription) on two rows, the long name, zh and en, at 320 / 360 / 390 / 430 and in
    // the narrow column beside the list (700 × 390) — every row's centre is its NAME, its ⋯ and ✕ stand whole inside the screen
    // (never yielded, never cut); at 320 the ⋯ menu of a row that yielded holds what it yielded (Split OFF with its why, the
    // billing row). RED CONTROL: phone-six's 522660c2d (the lane's pictures, phone-six/switcher-407-look.md).
    const CHIPS = [{ source: 'pooled', name: 'Team pool', poolTarget: 'Work Max' }, { source: 'subscription', name: 'Work Max' }];
    const yields = []; let menu = null, menuYield = '', menuBox = null;
    for (const lang of ['zh', 'en']) for (const [w, h] of [[320, 844], [360, 844], [390, 844], [430, 932], [700, 390]]) {
      await evalJs(`(() => { localStorage.setItem('vibespace.lang', ${JSON.stringify(lang)}); return true; })()`);
      await phone(w, h); await load(); await windowArea();
      await evalJs(`(() => { const ws = [...app.wm.windows.values()], chips = ${JSON.stringify(CHIPS)}; ws.forEach((x, i) => { x.title = ${JSON.stringify(LONG[lang])}; if (chips[i]) x._authBadge = chips[i]; }); return ws.length; })()`);
      await openSwitcher(); await sleep(300);
      // each row is brought on screen first (the 700 × 390 column shows three of the five rows; a point below the screen hits nothing)
      const rows = await evalJs(`[...document.querySelectorAll('.mobile-win-row')].map((r) => { r.scrollIntoView({ block: 'nearest' }); const b = r.getBoundingClientRect(), h = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2), part = h && h.closest('.mobile-win-row > *');
        const label = [...r.children].find((k) => k.tagName === 'SPAN' && k.style.flex.startsWith('1')), more = r.querySelector('.mobile-win-more'), close = r.lastElementChild;
        const inside = (e) => { if (!e) return false; const q = e.getBoundingClientRect(); return q.width >= 35.5 && q.left >= -0.5 && q.right <= innerWidth + 0.5 && getComputedStyle(e).display !== 'none'; };
        const chip = r.querySelector('.mobile-win-billing');
        return { split: !!r.querySelector('.mobile-win-split'), name: !!part && part === label, nameW: label ? Math.round(label.getBoundingClientRect().width) : 0, more: inside(more), close: inside(close) && close !== more, yield: r.dataset.yield || '', chip: chip ? (getComputedStyle(chip).display === 'none' ? 'menu' : chip.dataset.mode || 'full') : '' }; })`);
      yields.push({ lang, w, h, rows });
      if (w === 320 && lang === 'zh') {
        await shot('switcher-row-chips-zh-320.png');
        // a row that HAD a Split door and yielded it (the window on show has none — its menu has no Split row to hold)
        const yr = rows.findIndex((r) => r.split && (r.yield === 'split' || r.yield === 'chip'));
        if (yr >= 0) {
          menuYield = rows[yr].yield;
          await evalJs(`(() => { const r = document.querySelectorAll('.mobile-win-row')[${yr}]; r.scrollIntoView({ block: 'nearest' }); r.querySelector('.mobile-win-more').click(); return true; })()`); await sleep(500);
          menu = await evalJs(`[...document.querySelectorAll('.taskbar-context-menu > *')].slice(0, 4).map((e) => { const l = e.querySelector('.door-label') || e, g = document.createRange(); g.selectNodeContents(l); return { cls: String(e.className), text: e.textContent.trim(), why: e.querySelector('.door-why')?.textContent || '', labelLines: new Set([...g.getClientRects()].filter((q) => q.width > 0.5).map((q) => Math.round(q.top))).size }; })`);
          menuBox = await evalJs(`(() => { const q = document.querySelector('.taskbar-context-menu')?.getBoundingClientRect(); return q ? { left: Math.round(q.left), right: Math.round(q.right), w: Math.round(q.width) } : null; })()`);
          await shot('switcher-row-menu-zh-320.png');
          await evalJs(`document.querySelectorAll('.taskbar-context-menu').forEach((m) => m.remove()); true`);
        }
      }
      await evalJs(`document.querySelector('.mobile-win-switcher')?.remove(); true`);
    }
    await evalJs(`(() => { localStorage.removeItem('vibespace.lang'); return true; })()`);
    const badRows = yields.filter((y) => !y.rows.length || y.rows.some((r) => !r.name || !r.more || !r.close));
    check(`⑥d with BOTH chips the row yields (ruling B on the row): every row's centre is its NAME, its ⋯ and ✕ whole inside the screen — zh and en, 320 / 360 / 390 / 430 and the column beside the list at 700 × 390 (${yields.map((y) => y.lang + y.w + ':' + y.rows.map((r) => r.yield || '·').join('')).join(' ')})`,
      yields.length === 10 && badRows.length === 0 && yields.some((y) => y.rows.some((r) => r.yield)), badRows.slice(0, 2));
    const splitRow = (menu || []).find((m) => /-off\b/.test(m.cls) && /分屏/.test(m.text) && m.why === '横屏后可分屏'), billRow = (menu || []).find((m) => /^计费：/.test(m.text));
    check(`⑥d …and nothing that yields is lost: at 320 the ⋯ menu of a row that yielded (${menuYield || 'none'}) holds its Split door OFF with its why («横屏后可分屏») and, when the chip yielded too, the billing row («计费：…»)`,
      !!menu && !!splitRow && (menuYield !== 'chip' || !!billRow), menu);
    check('⑥d …and that menu reads: inside the screen, its rows\' words on one line each (it keeps its natural width — it once shrank to the 104 px left of the edge, «分 / 屏»)', !!menuBox && menuBox.left >= 0 && menuBox.right <= 320 && (menu || []).filter((m) => m.text).every((m) => m.labelLines === 1), { menuBox, menu });
    await phone(390, 844); await load(); await windowArea();
    await evalJs(`app.wm.revealWindow(${JSON.stringify(A)}); true`); await sleep(600);
    await phone(844, 390); await settled('regular');
    await openSwitcher();
    const d844 = await evalJs(DOOR);
    const pressed = await realClick('.mobile-win-row .mobile-win-split:not(.refused)');
    await waitFor(`document.querySelectorAll('.window.phone-pane .chat-message-list > .chat-msg-assistant').length >= 2`, 8000); await sleep(1500);
    const s1 = await evalJs(SPL);
    await shot('split-844.png');
    const two = s1.on && s1.panes.length === 2 && s1.drawn === 2;
    check('⑥ 844 × 390: «Split» opens two panes — left | right, each ≥ 350 px (MIN_PANE), both transcripts drawn', pressed && two && s1.panes[0].l === 0 && s1.panes.every((p) => p.w >= 350 && p.rows >= 1) && s1.panes[1].l >= s1.panes[0].w, { d844, pressed, s1 });
    check('⑥ …each pane\'s composer reads 16 px, each head names its window and carries a 44 px ✕', two && s1.panes.every((p) => p.fs >= 16 && p.head && p.xh >= 44), s1.panes);
    // ⑥b (the recovery's reader: a long name was cut mid-phrase with no ellipsis — the name is the head's ::before over a 0 px box):
    // a 60-character name in the LEFT pane ends in a visible ellipsis — the ::before is the box that cuts (display block, hidden,
    // ellipsis) and the name is wider than it
    const ell = await evalJs(`(() => { const p = document.querySelector('.window.phone-pane[data-pane="left"]'); if (!p) return null; const w = [...app.wm.windows.values()].find((x) => x.element === p); const old = w.title;
      app.wm.setTitle(w.id, '检查 W46N43 房间炮塔能量为什么一直不够用并且给出完整的修复方案和下一步的计划安排吧 — /tmp/x');
      const tEl = p.querySelector(':scope > .window-titlebar > .window-title'), cs = getComputedStyle(tEl, '::before');
      const probe = document.createElement('span'); probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font-size:' + cs.fontSize + ';font-weight:' + cs.fontWeight; probe.textContent = tEl.dataset.name; document.body.appendChild(probe);
      const need = probe.getBoundingClientRect().width; probe.remove(); const box = tEl.getBoundingClientRect().width;
      return { old, name: tEl.dataset.name, display: cs.display, overflow: cs.overflow, textOverflow: cs.textOverflow, whiteSpace: cs.whiteSpace, need: Math.round(need), box: Math.round(box), id: w.id }; })()`);
    await shot('split-long-name.png', { x: 0, y: 0, width: 844, height: 60 });
    if (ell) await evalJs(`app.wm.setTitle(${JSON.stringify(ell?.id)}, ${JSON.stringify(ell?.old || '')}); true`);
    check(`⑥b a long name in the left pane's head ends in a visible ellipsis (needs ${ell?.need} px in a ${ell?.box} px head)`, !!ell && ell.need > ell.box && ell.display === 'block' && ell.overflow === 'hidden' && ell.textOverflow === 'ellipsis' && ell.whiteSpace === 'nowrap', ell);
    // a tap in the other pane makes it the one on show; the split stays
    const other = s1.panes.find((p) => !p.active);
    if (other) { await stillPress(`.window.phone-pane[data-pane="${other.side}"] .chat-message-list`, { touch: true, click: 'any' }); await sleep(900); } // a finger on the pane not on show (the recovery port onto .397: through THE still door)
    const s2 = await evalJs(SPL);
    check('⑥ …a tap in the other pane makes it the one on show (the title follows), both panes stay', !!other && s2.on && s2.panes.length === 2 && !!s2.panes.find((p) => p.side === other.side)?.active, { other, s2 });
    // the back: a layer opened over the split closes, the split stays (the panes are the phone's window, each)
    await openSwitcher();
    await browserBack();
    const b1 = await evalJs(`({ switcher: !!document.querySelector('.mobile-win-switcher'), split: document.documentElement.classList.contains('vs-split'), panes: document.querySelectorAll('.window.phone-pane').length, href: location.pathname })`);
    check('⑥ …the back closes the switcher opened over the split, and both panes stay', !b1.switcher && b1.split && b1.panes === 2 && b1.href === '/', b1);
    // the turn: portrait shows one pane (the pair kept), landscape restores it; a reload restores it
    await phone(390, 844); await settled('compact');
    const r1 = await evalJs(SPL), kept = await evalJs(`sessionStorage.getItem('vibespace.phoneSplit')`);
    await shot('split-turned-390.png');
    check('⑥ turned to portrait: one window on show (the split collapses), the pair kept for the turn back', !r1.on && r1.drawn === 1 && /win-/.test(String(kept)), { r1, kept });
    await phone(844, 390); await settled('regular'); await sleep(600);
    const r2 = await evalJs(SPL);
    check('⑥ turned back to landscape: the split is restored', r2.on && r2.panes.length === 2 && r2.drawn === 2, r2);
    await load(); await settled('regular'); await waitFor(`document.querySelectorAll('.window.phone-pane').length === 2`, 12000); await sleep(800);
    const r3 = await evalJs(SPL);
    check('⑥ a reload restores it (this tab\'s own — sessionStorage)', r3.on && r3.panes.length === 2, r3);
    await realClick('.window.phone-pane[data-pane="right"] .phone-pane-close'); await sleep(1200);
    const r4 = await evalJs(SPL);
    check('⑥ a pane\'s ✕ ends it: one window on show', !r4.on && r4.drawn === 1 && (await evalJs(`sessionStorage.getItem('vibespace.phoneSplit')`)) === '{}', r4);
  }
  // ═══ ⑦ ROUND 2 (the acceptance's findings) ═══
  if (leg(7)) {
    console.log('⑦ round 2: the base rule the tab-strip block cut, the split beside the list column, one tap = one act, a minimized window\'s «Split», the name at 669');
    await phone(844, 390); await load(); await windowArea(); await settled('regular');
    // ⑦a the backlog chip's base rule (the comment the round-1 block cut left its tail outside any comment: the rule dropped)
    const blp = await evalJs(`(() => { const e = document.createElement('span'); e.className = 'bl-prio'; e.textContent = 'high'; document.body.appendChild(e); const cs = getComputedStyle(e), o = { fs: cs.fontSize, pl: cs.paddingLeft, lh: cs.lineHeight }; e.remove(); return o; })()`);
    check('⑦a the backlog priority chip keeps its base rule on every client (.bl-prio: 9 px, padding 0 5 px — round 1 left 13 px / 0)', blp.fs === '9px' && blp.pl === '5px' && blp.lh === '14px', blp);
    const SPL = `(() => { const vis = (e) => !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0;
      const idOf = (el) => [...app.wm.windows.values()].find((w) => w.element === el)?.id || '';
      const ps = [...document.querySelectorAll('.window.phone-pane')].filter(vis).sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
      const drawn = [...document.querySelectorAll('.window')].filter(vis);
      return { on: document.documentElement.classList.contains('vs-split'), listShown: !document.documentElement.classList.contains('vs-list-hidden') && document.getElementById('sidebar').getBoundingClientRect().width > 0, drawn: drawn.map(idOf), shown: app.wm.activeWindowId,
        panes: ps.map((p) => ({ id: idOf(p), side: p.dataset.pane, w: Math.round(p.getBoundingClientRect().width), active: p.classList.contains('window-active') })), pairs: JSON.parse(sessionStorage.getItem('vibespace.phoneSplit') || '{}'), switcher: !!document.querySelector('.mobile-win-switcher') }; })()`;
    const openSwitcher = async () => { await evalJs(`document.querySelector('.mobile-win-switcher') || app._mobileNav._showWindowSwitcher(); true`); await waitFor(`!!document.querySelector('.mobile-win-row')`, 4000); await sleep(300); };
    const ROWS = `[...document.querySelectorAll('.mobile-win-row')].map((r) => r.textContent.replace(/\\s+/g, ' ').trim().slice(0, 40))`;
    await evalJs(`app.wm.revealWindow(${JSON.stringify(A)}); true`); await sleep(900);
    await openSwitcher();
    const opened = await realClick('.mobile-win-row .mobile-win-split:not(.refused)');
    await waitFor(`document.querySelectorAll('.window.phone-pane').length === 2`, 8000); await sleep(1200);
    const b0 = await evalJs(SPL);
    // ⑦b ☰ shows the list column: the panes may use what is left — under the bound, the split collapses (the pair kept)
    const listOn = await realClick('#list-column-toggle');
    await waitFor(`!document.documentElement.classList.contains('vs-list-hidden')`, 4000); await sleep(1500);
    const b1 = await evalJs(SPL);
    await shot('r2-split-list-shown.png');
    await openSwitcher(); const rows1 = await evalJs(ROWS); await evalJs(`document.querySelector('.mobile-win-switcher')?.remove(); true`);
    const other = b0.panes.map((p) => p.id).find((id) => id && id !== b1.shown) || null;
    const otherName = other ? await evalJs(`String(app.wm.windows.get(${JSON.stringify(other)})?.title || '').split(' — ')[0]`) : '';
    check('⑦b 844 × 390, the split standing, ☰ shows the list column: the split collapses to the pane on show (one window drawn, the pair kept), the other pane\'s window in the switcher (round 1: two panes squeezed to 230 px)',
      opened && b0.on && b0.panes.length === 2 && b1.listShown && !b1.on && b1.drawn.length === 1 && b1.drawn[0] === b1.shown && Object.values(b1.pairs).some((p) => p.length === 2) && rows1.some((r) => otherName && r.includes(otherName.slice(0, 12))), { opened, b0, b1, rows1, otherName });
    const listOff = await realClick('#list-column-toggle');
    await waitFor(`document.documentElement.classList.contains('vs-list-hidden')`, 4000); await sleep(1500);
    const b2 = await evalJs(SPL);
    check('⑦b …☰ again hides the column: the split returns (two panes, each ≥ 350 px)', listOn && listOff && b2.on && b2.panes.length === 2 && b2.panes.every((p) => p.w >= 350), b2);
    // ⑦c one tap = one act: the first tap on the pane NOT on show only makes it the one on show; the switcher opens from
    // the head of the pane on show
    const aside = b2.panes.find((p) => !p.active);
    const c0 = aside ? await realClick(`.window.phone-pane[data-pane="${aside.side}"] > .window-titlebar > .window-title`) : false;
    await sleep(900);
    const c1 = await evalJs(SPL);
    check('⑦c a tap on the head of the pane not on show makes it the one on show — and opens nothing (round 1 opened the window switcher too)', c0 && !!aside && c1.on && !!c1.panes.find((p) => p.side === aside.side)?.active && !c1.switcher, { aside, c1, miss: realClick.lastMiss });
    const c2 = await realClick(`.window.phone-pane[data-pane="${aside?.side}"] > .window-titlebar > .window-title`);
    await sleep(900);
    const c3 = await evalJs(SPL);
    check('⑦c …a tap on the head of the pane on show opens the window switcher', c2 && c3.switcher && c3.on, c3);
    await evalJs(`document.querySelector('.mobile-win-switcher')?.remove(); true`);
    // ⑦d a minimized window's «Split»: it is restored and stands beside the window on show — never a pair for nothing
    await realClick('.window.phone-pane[data-pane="right"] .phone-pane-close'); await sleep(1000);
    await evalJs(`app.wm.minimize(${JSON.stringify(C)}); true`); await sleep(600); // a window minimized on a desktop client
    await evalJs(`app.wm.revealWindow(${JSON.stringify(A)}); true`); await sleep(900);
    await openSwitcher();
    const minRow = await evalJs(`(() => { const r = document.querySelector('.mobile-win-row.mobile-win-minimized .mobile-win-split'); if (r) r.dataset.p7 = 'min'; return r ? { words: r.textContent, refused: r.classList.contains('refused') } : null; })()`);
    const d0 = await realClick('.mobile-win-split[data-p7="min"]');
    await waitFor(`document.querySelectorAll('.window.phone-pane').length === 2`, 8000); await sleep(1200);
    const d1 = await evalJs(SPL), minNow = await evalJs(`!!app.wm.windows.get(${JSON.stringify(C)})?.isMinimized`);
    await shot('r2-split-minimized.png');
    check('⑦d «Split» on a minimized window\'s row restores it and the two stand side by side (round 1: a silent no-op that kept a dead pair)', !!minRow && d0 && d1.on && d1.panes.length === 2 && d1.panes.some((p) => p.id === C) && !minNow, { minRow, d1, minNow });
    // a pane's window minimized (another client): the split is over, SAID, and no pair is kept for it
    await evalJs(`app.wm.minimize(${JSON.stringify(C)}); true`);
    const said = await waitFor(`[...document.querySelectorAll('.toast, .gt-toast, [class*="toast"]')].some((t) => t.offsetParent && /split ended/i.test(t.textContent))`, 4000);
    await sleep(600);
    const d2 = await evalJs(SPL);
    check('⑦d …a pane\'s window minimized: the split ends, said in a toast, and the pair is dropped (round 1 kept it)', said && !d2.on && !Object.values(d2.pairs).length, { said, d2 });
    await evalJs(`app.wm.revealWindow(${JSON.stringify(C)}); true`); await sleep(600);
    // ⑦e THE NAME AT 669 (the integrator's pass: «/tm…»): beside the list column, a files window titled by a long path
    // shows its folder's own name, drawn ≥ 8 em (or whole); a chat's name too
    await phone(669, 867); await load(); await windowArea(); await settled('regular');
    if (await evalJs(`document.documentElement.classList.contains('vs-list-hidden')`)) { await realClick('#mobile-nav-menu'); await sleep(900); }
    const HEAD = `(() => { const e = document.getElementById('mobile-nav-title'), nav = document.getElementById('mobile-nav'), r = e.getBoundingClientRect(), em = parseFloat(getComputedStyle(e).fontSize);
      const a = app.wm.windows.get(app.wm.activeWindowId), full = String(a?.title || '').split(' — ')[0].trim();
      const probe = document.createElement('span'); probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font:' + getComputedStyle(e).font; probe.textContent = e.textContent; document.body.appendChild(probe); const textW = probe.getBoundingClientRect().width; probe.remove();
      const btns = [...nav.children].filter((k) => k !== e && getComputedStyle(k).display !== 'none' && k.getBoundingClientRect().width > 0 && k.tagName === 'BUTTON').map((k) => (k.id || k.className) + ':' + Math.round(k.getBoundingClientRect().width));
      const ncs = getComputedStyle(nav), sp = document.getElementById('mobile-nav-state');
      return { pad: ncs.paddingLeft + '/' + ncs.paddingRight + ' gap ' + ncs.columnGap, state: sp ? Math.round(sp.getBoundingClientRect().width) : null, navW: Math.round(nav.getBoundingClientRect().width), text: e.textContent, attr: e.title, w: Math.round(r.width), em, textW: Math.round(textW), full, last: full.split(/[\\\\/]+/).filter(Boolean).pop() || full, yield: nav.dataset.yield || '', listShown: !document.documentElement.classList.contains('vs-list-hidden'), col: Math.round(document.getElementById('workspace').getBoundingClientRect().width), btns }; })()`;
    await evalJs(`app._mobileNav.switchDesktop(${JSON.stringify(DESK.b)}); true`); await waitFor(`app.desktopManager.activeDesktopId === ${JSON.stringify(DESK.b)} && app.wm.windows.has(${JSON.stringify(FILES)})`, 8000);
    await evalJs(`app.wm.revealWindow(${JSON.stringify(FILES)}); true`); await waitFor(`app.wm.activeWindowId === ${JSON.stringify(FILES)}`, 4000); await sleep(2500);
    const e0 = await evalJs(HEAD);
    await shot('r2-title-669-files.png', { x: 0, y: 0, width: 669, height: 48 });
    await shot('r2-title-669-files-full.png');
    check('⑦e 669 × 867 beside the list column: a files window titled by a long path shows its folder\'s OWN name (the last segment), the whole path in the title attribute (round 1: «/tm…»)',
      e0.listShown && !!e0.last && e0.text === e0.last && e0.attr === e0.full && e0.full.length > e0.last.length, e0);
    const minW = (text) => evalJs(`(() => { const e = document.getElementById('mobile-nav-title'), p = document.createElement('span'); p.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font:inherit'; p.textContent = ${JSON.stringify(navTitleMinText(String(text || '')))}; e.appendChild(p); const w = p.getBoundingClientRect().width; p.remove(); return w; })()`);
    const mn0 = await minW(e0.text);
    check(`⑦e …drawn whole or ≥ the release's readable minimum (${Math.round(mn0)} px — navTitleMinText, 主开发 09:33Z) — the bar's buttons yield before the name`, e0.w + 0.5 >= Math.min(e0.textW, mn0), { e0, mn0 });
    // what yielded is still one tap away: ⚙ folded into ⋯ («Global settings» opens the settings), the Desktops door stays
    // the leg's premise, said by name (the checkpoint's red read yield '': the name fit, nothing yielded, ⋯ held no row): the
    // folder's readable minimum needs the room only ⚙'s fold gives (phone-head.js: this column leaves 104 px after 'win')
    check(`⑦e …the name needs the room: «${e0.text}» keeps ${Math.round(mn0)} px only once ⚙ folds — the ladder reached 'gear' (it read «${e0.yield}»)`, e0.yield === 'gear', { e0, mn0 });
    const BAR = `({ gear: getComputedStyle(document.getElementById('mobile-nav-gear')).display, desks: getComputedStyle(document.getElementById('mobile-nav-desktops')).display, more: getComputedStyle(document.getElementById('mobile-nav-more')).display })`;
    const g0 = await evalJs(BAR);
    const m0 = await realClick('#mobile-nav-more');
    await waitFor(`!!document.querySelector('.taskbar-context-menu .taskbar-context-menu-item')`, 3000);
    const mRows = await evalJs(`[...document.querySelectorAll('.taskbar-context-menu .taskbar-context-menu-item')].map((x) => x.textContent.trim())`);
    const gRow = await evalJs(`(() => { const r = [...document.querySelectorAll('.taskbar-context-menu .taskbar-context-menu-item')].find((x) => x.textContent.trim() === 'Global settings'); if (r) r.dataset.p7 = 'gear'; return !!r; })()`);
    const g1 = gRow ? await realClick('.taskbar-context-menu .taskbar-context-menu-item[data-p7="gear"]') : false;
    const gs = await waitFor(`[...document.querySelectorAll('.global-settings-popover')].some((p) => getComputedStyle(p).display !== 'none' && p.getBoundingClientRect().width > 0)`, 4000);
    await evalJs(`document.querySelectorAll('.global-settings-popover, .taskbar-context-menu').forEach((e) => e.remove()); true`);
    check('⑦e …what yielded is one tap away: ⚙ folded into ⋯ — its «Global settings» row opens the settings —, the Desktops door and ⋯ stay on the bar', g0.gear === 'none' && g0.desks !== 'none' && g0.more !== 'none' && m0 && gRow && g1 && gs, { g0, m0, mRows, gRow, g1, gs, e0yield: e0.yield });
    // …and the bar yields ONLY for a name that needs the room (the law's other half, read from the checkpoint's red: «home»
    // beside the list column — yield '', ⚙ on the bar): the same window shows the home folder
    const HN = path.basename(fakeHome);
    await evalJs(`app.wm.windows.get(${JSON.stringify(FILES)})?._explorer?.navigate(${JSON.stringify(fakeHome)}); true`);
    await waitFor(`document.getElementById('mobile-nav-title')?.textContent === ${JSON.stringify(HN)}`, 6000); await sleep(1200);
    const e2 = await evalJs(HEAD), g2 = await evalJs(BAR);
    check(`⑦e …a short name («${HN}») needs no room: nothing yields — ⚙, the Desktops door and ⋯ stay on the bar`, e2.text === HN && e2.yield === '' && g2.gear !== 'none' && g2.desks !== 'none' && g2.more !== 'none', { e2, g2 });
    await evalJs(`app._mobileNav.switchDesktop(${JSON.stringify(DESK.one)}); true`); await waitFor(`app.desktopManager.activeDesktopId === ${JSON.stringify(DESK.one)} && app.wm.windows.has(${JSON.stringify(A)})`, 8000);
    await evalJs(`app.wm.revealWindow(${JSON.stringify(A)}); true`); await waitFor(`app.wm.activeWindowId === ${JSON.stringify(A)}`, 4000); await sleep(2500);
    const e1 = await evalJs(HEAD);
    await shot('r2-title-669-chat.png', { x: 0, y: 0, width: 669, height: 48 });
    const mn1 = await minW(e1.text);
    check(`⑦e …a conversation there: its name drawn whole or ≥ the release's readable minimum (${Math.round(mn1)} px)`, e1.listShown && e1.text === e1.full && e1.w + 0.5 >= Math.min(e1.textW, mn1), { e1, mn1 });
  }
  check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 5));
} catch (e) {
  check('the suite ran to its end', false, String(e && e.stack || e));
}
console.log(`\n${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass}${fail ? ' passed, ' + fail + ' failed' : ''})`);
process.exit(fail ? 1 : 0);
