#!/usr/bin/env node
// THE OWNER'S CASE IN A REAL CHROME (lane ui-phone-and-fit pick 0 — the owner 2026-11-13, a ~500 px chat window, zh: the strip
// «等你操作 · 9 个问题» drew «回复：保留 ag» and nothing else of the options — «这样我都看不到推荐回复选项，你这个走查过了吗？考虑不同窗口
// 尺寸了吗？»; a minute later: «而且这个下面没法展开看详情，每次都要点击跳回对话位置才能看»). A throwaway server in a git worktree (the
// tree under test's src/ + built public/), ONE stub `claude` conversation behind the real chat-wrapper (its asks filed through
// the agent route with its own session token — what `vibespace-ask` does), headless Chrome over raw CDP.
//   ① THE OPTIONS LAW, EVERY DOOR, THE WIDTH LADDER (scripts/lib/fit-ladder.mjs — 280 / 320 / 360 / 420 / 500 / 640 / 800 / 1100 /
//      1440, on the door's own container): an item with 1, 3 and 5 options (one 40+ characters), zh and en, in the chat strip
//      (the chat window that wide), the tray and the mini inbox (the popup that wide), the For-you window (the window that
//      wide) and the phone sheet (a compact page that wide, its row opened) — every option drawn (6 = one a 120-character URL
//      with no space), its box inside the row and
//      the door, its words not cut, no sideways scroll; «Reply:» said once, each pill its own words
//   ② THE ROW OPENS IN PLACE: the strip at 500 px, an item with a 600-character detail and three options — a press on its
//      question opens it over the chat: the whole question, the detail's last line and every option inside the window (and
//      the strip at most half the view), the chat's scrollTop unchanged; a newer ask filed meanwhile keeps it open; the same
//      press closes it; «Show it in the conversation» is its own door
// RED: the same file on the release (`--tree <a 935960b7e checkout, built>`) — ① and ② red by name; its pictures are BEFORE.
// Requires google-chrome (SKIP without) and a fresh `npm run build` of the tree.
// Run: node scripts/test-foryou-fit-chrome.mjs [--tree <dir>] [--shots <dir>] [--legs 1,2]
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
import { armWatchdog } from './suite-watchdog.mjs';
import { LADDER, PHONE_LADDER, fitVerdictSource, fits, runLadder, ladderFaults } from './lib/fit-ladder.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port (test-architecture §57)
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const TREE = path.resolve(arg('--tree', repo));
const LEGS = new Set(String(arg('--legs', '1,2')).split(','));
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
if (!fs.existsSync(path.join(TREE, 'public', 'bundle.js'))) { console.log(`✗ no ${TREE}/public/bundle.js — run \`npm run build\` first`); process.exit(1); }

const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('foryou-fit-wt');
const fakeHome = scratchHome('foryou-fit-home', fs);
const chromeDir = scratch('foryou-fit-chrome');
const stubDir = scratch('foryou-fit-stub');
const CWD = path.join(stubDir, 'work');
const ENVF = path.join(stubDir, 'stub-env.json');
const SHOTS = arg('--shots') ? path.resolve(arg('--shots')) : scratch('foryou-fit-shots');
for (const d of [stubDir, CWD, SHOTS]) fs.mkdirSync(d, { recursive: true });
const ORIGIN = `http://127.0.0.1:${PORT}`;
let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 1500) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = (x) => JSON.stringify(x);
console.log(`tree: ${TREE === repo ? 'this tree' : TREE}`);

// ── the stub CLI: an init, one answer per user turn; it leaves its route and token for the suite (what vibespace-ask uses) ──
fs.writeFileSync(path.join(stubDir, 'claude'), `#!${process.execPath}
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('2.1.308 (Claude Code) stub'); process.exit(0); }
if (process.env.VIBESPACE_SESSION_TOKEN && process.env.VIBESPACE_API) require('fs').writeFileSync(${J(ENVF)}, JSON.stringify({ api: process.env.VIBESPACE_API, token: process.env.VIBESPACE_SESSION_TOKEN })); // only the conversation's own run (the hub's probes of the CLI carry no session)
const SID = 'fy-' + process.pid;
const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
out({ type: 'system', subtype: 'init', session_id: SID, model: 'claude-fable-5-1', cwd: process.cwd(), tools: [], permissionMode: 'default', claude_code_version: '2.1.308' });
let n = 0, buf = '';
process.stdin.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); let m = null; try { m = JSON.parse(line); } catch {} if (!m || m.type !== 'user') continue; const k = n++;
  setTimeout(() => {
    for (let r = 0; r < 30; r++) out({ type: 'assistant', session_id: SID, uuid: 'a-' + k + '-' + r, message: { id: 'm' + k + '-' + r, type: 'message', role: 'assistant', model: 'claude-fable-5-1', content: [{ type: 'text', text: 'Line ' + r + ' of a long answer, so the transcript scrolls and a reader can be in history.' }], stop_reason: r === 29 ? 'end_turn' : null, usage: { input_tokens: 1, output_tokens: 1 } } });
    out({ type: 'result', subtype: 'success', is_error: false, duration_ms: 100, num_turns: 1, result: 'done', session_id: SID, total_cost_usd: 0, usage: { input_tokens: 1, output_tokens: 1 } });
  }, 100); } });
process.stdin.on('end', () => process.exit(0));
`, { mode: 0o755 });

// ── throwaway server in a worktree (the tree under test's src/ + built public/) ──
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) execSync(`rm -rf ${wt}/${f} && cp -r ${TREE}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
const srvLog = fs.openSync(path.join(SHOTS, 'server.log'), 'a');
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOST: '127.0.0.1', HOME: fakeHome, CLAUDE_CMD: path.join(stubDir, 'claude'), VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', NO_AUTO_UPDATE: '1', VS_NO_REAL_CLI: '1' }, stdio: ['ignore', srvLog, srvLog] });
const chromeEnv = { ...process.env }; delete chromeEnv.DBUS_SESSION_BUS_ADDRESS; delete chromeEnv.DISPLAY;
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--password-store=basic',
  '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--disable-background-timer-throttling', `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore', env: chromeEnv });
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch { }
  try { srv.kill('SIGKILL'); } catch { }
  for (const root of [wt, fakeHome, stubDir, chromeDir]) { try { endRootedProcesses(root); } catch { } } // the server, dtach, the wrapper, the stub (§57b)
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
  for (const d of [chromeDir, fakeHome, stubDir]) { try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { } }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });
const PENDS = new Map();
armWatchdog({ capMs: 840e3, exit: (code) => process.exit(code), pending: () => [...PENDS.values()].map((x) => `CDP ${x.method} (${((Date.now() - x.at) / 1000).toFixed(1)} s)`) });
for (let i = 0; i < 160; i++) { try { await fetch(`${ORIGIN}/api/home`); break; } catch { await sleep(250); } }

// ── raw CDP ──
const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 120 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((x) => x.type === 'page'); } catch { } if (!target) await sleep(250); }
if (!target) { console.log('✗ chrome never exposed a CDP page target'); process.exit(1); }
const sock = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => sock.on('open', r));
let seq = 0; const pend = new Map(); const pageErrors = [];
sock.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); PENDS.delete(m.id); return; } if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'unknown'); });
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; PENDS.set(id, { method, at: Date.now() }); pend.set(id, (m) => (m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result))); sock.send(JSON.stringify({ id, method, params })); });
const evalJs = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; };
const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await evalJs(expr)) return true; } catch { } await sleep(150); } try { return await evalJs(expr); } catch { return false; } };
const shot = async (name) => { try { const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, name), Buffer.from(r.data, 'base64')); } catch { } };
await cdp('Runtime.enable'); await cdp('Page.enable');
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); // §47: a returning user — no first-run wizard
let LANG = 'zh';
const page = async ({ w = 1440, h = 900, phone = false, lang = LANG } = {}) => {
  LANG = lang;
  await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: phone ? 2 : 1, mobile: phone });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: phone, maxTouchPoints: phone ? 5 : 1 });
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: phone ? 'none' : 'hover' }, { name: 'pointer', value: phone ? 'coarse' : 'fine' }] });
  await evalJs(`(() => { try { localStorage.setItem('vibespace.lang', ${J(lang)}); } catch {} return true; })()`).catch(() => {});
  await cdp('Page.navigate', { url: ORIGIN + '/' });
  await waitFor('!!(window.app && app.ready)', 60000); await evalJs('app.ready.then(() => true)');
  await waitFor(`!document.getElementById('loading-screen')`, 30000); await sleep(1200);
  if (!phone) SID = await ensureChat();
};
const press = async (sel) => { const p = await evalJs(`(() => { const e = ${sel.startsWith('(') ? sel : `document.querySelector(${J(sel)})`}; if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + Math.min(r.width / 2, 40), y: r.top + r.height / 2 }; })()`); if (!p) return false; await evalJs(`(() => { const e = document.elementFromPoint(${p.x}, ${p.y}); e && e.click(); return !!e; })()`); await sleep(400); return true; };

// ── the conversation and its asks ──
const ITEMS = {
  zh: { text: '界面里的 agent 中文统一叫什么？要不要保留英文这个词，还是统一成别的说法？', long: '保留英文 agent 这个词，因为它和命令行、文档、所有日志里的叫法完全一致', more: ['统一叫「助手」', '统一叫「代理」', '两个都写，先英文后中文', '以后再定'] },
  en: { text: 'What should the interface call an agent? Keep the English word, or one name everywhere?', long: 'Keep the word agent, as the CLI says it', more: ['Call it Assistant', 'Call it Proxy', 'Write both, English first', 'Decide later'] }, // a FILED option is ≤ 40 characters (src/inbox-reply.js OPTION_MAX_CHARS — the route refuses a longer one)
};
// the reader's fixtures: six options (a FILED option is ≤ 40 characters — the route refuses a longer one), and a 120-character
// option with no space (a URL — it must break INSIDE its pill), which only the PARSED road carries (src/ask-options.js: a
// lettered detail «A …；B …», each label ≤ 120)
const SIXTH = { zh: '先问问团队，明天再定', en: 'Ask the team, decide tomorrow' };
const optsOf = (lang, n) => [ITEMS[lang].long, ...ITEMS[lang].more, SIXTH[lang]].slice(0, n);
const URL_LABEL = 'A https://example.invalid/' + 'a1b2c3d4e5'.repeat(10).slice(0, 94);   // 120 characters, no space after the letter's
const urlAsk = async (lang) => { const r = await post({ add: { text: ITEMS[lang].text + ' #url' + (++fileAsk.k), detail: `${URL_LABEL}；B ${ITEMS[lang].more[0]}；C ${ITEMS[lang].more[1]}`, urgency: 'high' } }); await sleep(900); return r && r.item ? r.item.id : null; };
let SID = null, AG = null, WEBUI = null;
/** The conversation's window on this page (attached when a reload left none) → its window id. */
const ensureChat = async () => {
  if (!WEBUI) return null;
  const have = await evalJs(`(() => { const w = [...app.wm.windows.values()].find((x) => x.type === 'chat'); return w ? w.id : null; })()`).catch(() => null);
  if (!have) {
    await waitFor(`!!(app.sidebar?._allSessions || []).find((s) => s.webuiId === ${J(WEBUI)})`, 20000);
    await evalJs(`(() => { app.attachSession(${J(WEBUI)}, 'fit', ${J(CWD)}, { mode: 'chat', backend: 'claude' }); return true; })()`);
    await waitFor(`(() => { const i = document.querySelector('.chat-view textarea.chat-input'); return !!i && i.getClientRects().length > 0; })()`, 30000);
  }
  return evalJs(`(() => { const w = [...app.wm.windows.values()].find((x) => x.type === 'chat'); return w ? w.id : null; })()`);
};
const post = async (body) => { const r = await fetch(AG.api + '/api/agent/user-todo', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + AG.token }, body: JSON.stringify(body) }); return r.json(); };
const resolveAll = async () => { const all = await post({ list: true }).catch(() => ({})); for (const it of (all.items || [])) if (it.status === 'open') await post({ resolve: it.id }).catch(() => {}); await sleep(600); };
const fileAsk = async (lang, n, detail = '') => { const r = await post({ add: { text: ITEMS[lang].text + ' #' + (++fileAsk.k), options: optsOf(lang, n), detail: detail || undefined, urgency: 'high' } }); await sleep(900); return r && r.item ? r.item.id : null; };
fileAsk.k = 0;
const CHATWIN = `[...app.wm.windows.values()].find((w) => w.type === 'chat')`;

try {
  // ONE conversation through the hub's REAL create (WS `create`, the real chat-wrapper, the stub — the walk recipe's stubChat),
  // then its window attached in the page; every reload re-attaches it (ensureChat)
  const hubWs = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  await new Promise((res, rej) => { hubWs.on('open', res); hubWs.on('error', rej); });
  WEBUI = await new Promise((res) => { const on = (d) => { let m = null; try { m = JSON.parse(String(d)); } catch { } if (m && m.type === 'created' && (!m.reqId || m.reqId === 'fy-1')) { hubWs.off('message', on); res(m.sessionId); } }; hubWs.on('message', on); hubWs.send(J({ type: 'create', backend: 'claude', mode: 'chat', cwd: CWD, name: 'fit', reqId: 'fy-1' })); setTimeout(() => res(null), 20000); });
  hubWs.close();
  await page({ w: 1440, h: 900 });   // attaches the conversation (ensureChat): its CLI runs with its session
  const readAg = () => { try { const x = JSON.parse(fs.readFileSync(ENVF, 'utf8')); return x && x.token && x.api ? x : null; } catch { return null; } };
  for (let i = 0; i < 160 && !readAg(); i++) await sleep(250);
  AG = readAg() || {};
  check(`the stub conversation is up (${WEBUI}, window ${SID}) and its route answers`, !!WEBUI && !!SID && !!AG.token, { WEBUI, SID, AG: !!AG.token });
  await evalJs(`(() => { const v = app.sessions.get(${J(SID)}); v && v.sendMessage ? v.sendMessage('hello') : null; return true; })()`).catch(() => {});

  const winW = async (id, w, h = 760) => evalJs(`(() => { const win = app.wm.windows.get(${J(id)}); if (!win) return null; if (win.isMaximized) app.wm.toggleMaximize(win.id); try { app.wm.resizeWindowTo(win.id, { w: ${w}, h: ${h} }); } catch {} const e = win.element; if (Math.abs(e.getBoundingClientRect().width - ${w}) > 2) { e.style.left = '0px'; e.style.top = '40px'; e.style.width = '${w}px'; e.style.height = '${h}px'; } return Math.round(e.getBoundingClientRect().width); })()`);
  const OPTS_OK = (sel, n) => `(() => { const c = ${sel}; if (!c) return null; const o = [...c.querySelectorAll('.ut-opt, .iw-opt')].filter((e) => e.getClientRects().length); return { n: o.length, words: o.map((e) => e.textContent.trim()), label: [...c.querySelectorAll('.ut-opts-label, .iw-opts-label')].filter((e) => e.getClientRects().length).map((e) => e.textContent.trim()) }; })()`;

  if (LEGS.has('1')) {
    console.log('① THE OPTIONS LAW at every width of every door');
    for (const lang of ['zh', 'en']) {
      await resolveAll();   // each language starts with nothing waiting (claim 3: the zh items' state reached the en legs)
      await page({ w: 1440, h: 900, lang });
      await evalJs(`(() => { const w = ${CHATWIN}; if (w) app.wm.revealWindow?.(w.id); return true; })()`);
      for (const n of [1, 3, 6]) {
        const id = await fileAsk(lang, n);
        const shown = !!id && await waitFor(`!!document.querySelector('.chat-attn-dock:not([hidden]) .cad-rows > .ut-item[data-id="${id}"]')`, 10000);
        check(`① ${lang} · ${n} option(s) · the ask is filed (${id}) and it is the strip's item`, !!id && shown, { id, shown });
        if (!id || !shown) continue;
        // the chat strip: the chat window at each width
        const DOCK = `(document.querySelector('.chat-attn-dock:not([hidden])'))`, ROW = `(document.querySelector('.chat-attn-dock:not([hidden]) .cad-rows > .ut-item'))`;
        const strip = await runLadder({ setWidth: async (w) => { await winW(SID, w); await sleep(250); }, read: async () => {
          const v = await evalJs(fitVerdictSource(DOCK, { row: ROW, controls: 'button', words: '.ut-opt', clampOk: '.ut-text', scrollers: '.chat-attn-dock .cad-rows, .chat-attn-dock .ut-opts' }));
          const o = await evalJs(OPTS_OK(DOCK, n)); return v && o ? { ...v, outside: [...v.outside, ...(o.n === n ? [] : [`${o.n} of ${n} options drawn`])] } : v; } });
        if (n === 3) for (const w of [360, 500, 800]) { await winW(SID, w); await sleep(300); await shot(`strip-${lang}-${w}.png`); }
        const said = await evalJs(OPTS_OK(DOCK, n));
        check(`① ${lang} · ${n} option(s) · the chat strip at ${LADDER.join(' / ')}: every option whole inside its row, nothing cut, no sideways scroll`, ladderFaults(strip).length === 0, ladderFaults(strip));
        check(`① ${lang} · ${n} option(s) · the strip says «${said && said.label[0]}» once and each pill is its own words («${said && said.words[0]}»)`, !!said && said.label.length === 1 && said.words[0] === optsOf(lang, n)[0], said);
        // the tray: the popup that wide
        await evalJs(`(() => { document.getElementById('taskbar-user-todos')?.click(); return true; })()`); await sleep(700);
        const TRAY = `(document.getElementById('user-todos-popup'))`, TROW = `(document.querySelector('#user-todos-popup .ut-item[data-id="${id}"]'))`;
        const tray = await runLadder({ setWidth: async (w) => { await evalJs(`(() => { const p = document.getElementById('user-todos-popup'); if (!p) return false; p.style.left = '0px'; p.style.width = '${w}px'; p.style.maxWidth = 'none'; return true; })()`); await sleep(200); },
          read: async () => evalJs(fitVerdictSource(TRAY, { row: TROW, controls: '.ut-opt, .ut-act', words: '.ut-opt' })) });
        check(`① ${lang} · ${n} option(s) · the tray at the ladder: every option whole inside its row`, ladderFaults(tray).length === 0, ladderFaults(tray));
        await evalJs(`(() => { const p = document.getElementById('user-todos-popup'); if (p) p.style.width = p.style.left = p.style.maxWidth = ''; document.getElementById('taskbar-user-todos')?.click(); return true; })()`); await sleep(400);
        // the mini inbox (the window's own popover)
        await evalJs(`(() => { const w = app.wm.windows.get(${J(SID)}); app.openMiniInbox?.(w.element.querySelector('.window-title') || w.element, w.id); return true; })()`); await sleep(700);
        const MINI = `(document.querySelector('.ut-mini-popover'))`, MROW = `(document.querySelector('.ut-mini-popover .ut-item[data-id="${id}"]'))`;
        const mini = await runLadder({ setWidth: async (w) => { await evalJs(`(() => { const p = document.querySelector('.ut-mini-popover'); if (!p) return false; p.style.left = '0px'; p.style.width = '${w}px'; p.style.maxWidth = 'none'; return true; })()`); await sleep(200); },
          read: async () => evalJs(fitVerdictSource(MINI, { row: MROW, controls: '.ut-opt, .ut-act', words: '.ut-opt' })) });
        check(`① ${lang} · ${n} option(s) · the mini inbox at the ladder: every option whole inside its row`, ladderFaults(mini).length === 0, ladderFaults(mini));
        await evalJs(`document.querySelectorAll('.ut-mini-popover').forEach((p) => p.remove()); true`);
        // the For-you window on this item, that wide
        await evalJs(`(() => { app.openInbox({ itemId: ${J(id)} }); return true; })()`);
        await waitFor(`!!document.querySelector('.iw .iw-opt')`, 8000);
        const IWIN = await evalJs(`(() => { const w = [...app.wm.windows.values()].find((x) => x.element.querySelector('.iw')); return w && w.id; })()`);
        const IW = `(document.querySelector('.iw'))`, IROW = `((document.querySelector('.iw .iw-opts') || {}).parentElement || null)`;
        const iw = await runLadder({ setWidth: async (w) => { await winW(IWIN, w, 700); await sleep(250); }, read: async () => evalJs(fitVerdictSource(IW, { row: IROW, controls: '.iw-opt', words: '.iw-opt' })) });
        check(`① ${lang} · ${n} option(s) · the For-you window at the ladder: every option whole inside its pane`, !!IWIN && ladderFaults(iw).length === 0, ladderFaults(iw));
        await evalJs(`(() => { const w = app.wm.windows.get(${J(IWIN)}); if (w) app.wm.closeWindow(w.id); return true; })()`); await sleep(300);
      }
      // the PARSED road: a 120-character URL option with no space breaks INSIDE its pill — the strip at the ladder
      const uid = await urlAsk(lang);
      const ushown = !!uid && await waitFor(`!!document.querySelector('.chat-attn-dock:not([hidden]) .cad-rows > .ut-item[data-id="${uid}"]')`, 10000);
      const DOCKU = `(document.querySelector('.chat-attn-dock:not([hidden])'))`, ROWU = `(document.querySelector('.chat-attn-dock:not([hidden]) .cad-rows > .ut-item'))`;
      const ul = ushown ? await runLadder({ setWidth: async (w) => { await winW(SID, w); await sleep(250); }, read: async () => evalJs(fitVerdictSource(DOCKU, { row: ROWU, controls: 'button', words: '.ut-opt', clampOk: '.ut-text', scrollers: '.chat-attn-dock .cad-rows, .chat-attn-dock .ut-opts' })) }) : [];
      check(`① ${lang} · a parsed 120-character URL option (no space) · the strip at the ladder: it breaks inside its pill, nothing outside the row, no sideways scroll`, ushown && ladderFaults(ul).length === 0, ushown ? ladderFaults(ul) : { uid });
    }
  }

  if (LEGS.has('1')) {
    // the phone sheet LAST (claim 3: its row taps ran between the languages): a compact page that wide — a width the page
    // does not draw as the compact class has no phone sheet and is said, not measured — its newest row (a fresh ask) opened
    for (const lang of ['zh', 'en']) {
      await resolveAll(); await page({ w: 1440, h: 900, lang });
      const id = await fileAsk(lang, 3);
      const ph = [], notCompact = [];
      for (const w of PHONE_LADDER) {
        await page({ w, h: 844, phone: true, lang });
        if (await evalJs(`document.documentElement.dataset.vc`) !== 'compact') { notCompact.push(w); continue; }
        await waitFor(`!!document.querySelector('#phone-home .ut-item[data-id="${id}"]')`, 8000);
        await press(`(document.querySelector('#phone-home .ut-item[data-id="${id}"] .ut-text'))`); await sleep(500);
        ph.push({ w, v: await evalJs(fitVerdictSource(`(document.getElementById('phone-home'))`, { row: `(document.querySelector('#phone-home .ut-item[data-id="${id}"]'))`, controls: '.ut-opt', words: '.ut-opt' })) });
        if (w === 360) await shot(`phone-sheet-${lang}-360.png`);
      }
      check(`① ${lang} · the phone sheet at ${ph.map((x) => x.w).join(' / ')} (the compact class${notCompact.length ? `; ${notCompact.join(' / ')} is the regular class — no sheet` : ''}), its newest row opened: every option whole inside its row`, !!id && ph.length >= 4 && ladderFaults(ph).length === 0, ladderFaults(ph));
    }
  }

  if (LEGS.has('2')) {
    console.log('② THE ROW OPENS IN PLACE — the strip at 500 px');
    await page({ w: 1440, h: 900, lang: 'zh' });
    const detail = ('这件事影响整个界面里的叫法：命令行里叫 agent，文档里叫 agent，日志也是 agent；如果界面里改成「助手」，搜索和截图对照会对不上。' +
      '另一方面，第一次用的人未必知道 agent 是什么意思，所以要么在第一次出现时解释，要么统一成中文。下面三个选项各有代价，选一个就行，以后还能改。').repeat(5).slice(0, 600);   // 600 characters (the pin names 600: a 145-character text × 3 was 435)
    const id = await fileAsk('zh', 3, detail);
    await winW(SID, 500, 820);
    await waitFor(`!!document.querySelector('.chat-attn-dock:not([hidden]) .cad-rows > .ut-item[data-id="${id}"]')`, 10000); await sleep(600);
    await shot('open-500-closed.png');
    const list0 = await evalJs(`(() => { const v = app.sessions.get(${J(SID)}); return v && v._messageList ? Math.round(v._messageList.scrollTop) : null; })()`);
    // the press and the first reading in ONE task (what a press arm samples at the open), the second 700 ms later
    const top1 = await evalJs(`(() => { const q = document.querySelector('.chat-attn-dock .cad-rows > .ut-item > .ut-body > .ut-text'); if (!q) return null; q.click(); const o = document.querySelector('.chat-attn-dock .ut-opt'); return o ? Math.round(o.getBoundingClientRect().top * 10) / 10 : null; })()`);
    await sleep(700);
    const top2 = await evalJs(`(() => { const o = document.querySelector('.chat-attn-dock .ut-opt'); return o ? Math.round(o.getBoundingClientRect().top * 10) / 10 : null; })()`);
    check(`② the opened strip holds still once drawn — its first option at ${top1} px, then ${top2} px 700 ms later (a press arm samples it at the open: a later move refused the claim's Allow)`, top1 != null && top1 === top2, { top1, top2 });
    const OPEN = `(() => { const d = document.querySelector('.chat-attn-dock:not([hidden])'), w = app.wm.windows.get(${J(SID)}).element, v = app.sessions.get(${J(SID)}); if (!d) return null; d.scrollTop = 0; const R = (e) => e.getBoundingClientRect(), wr = R(w);
      // ONE ORDER (主开发 13:34Z): at the TOP every option is in view; scrolled to the END, the detail's last line is
      const insideNow = (q) => { const dr = R(d); return q && q.top >= Math.max(wr.top, dr.top) - 1 && q.bottom <= Math.min(wr.bottom, dr.bottom) + 1 && q.left >= wr.left - 1 && q.right <= wr.right + 1; };
      const optsTop = [...d.querySelectorAll('.ut-opt')].every((o) => insideNow(R(o)));
      d.scrollTop = d.scrollHeight; const dr = R(d);
      const det = d.querySelector('.ut-detail'), r = det && document.createRange(); if (r) r.selectNodeContents(det); const lines = r ? [...r.getClientRects()] : [], last = lines[lines.length - 1];
      const inside = (q) => q && q.top >= Math.max(wr.top, dr.top) - 1 && q.bottom <= Math.min(wr.bottom, dr.bottom) + 1 && q.left >= wr.left - 1 && q.right <= wr.right + 1;
      const opts = [...d.querySelectorAll('.ut-opt')], order = !!det && opts.length > 0 && R(opts[opts.length - 1]).bottom <= R(det).top + 1; d.scrollTop = 0;
      return { open: d.classList.contains('cad-open'), id: (d.querySelector('.cad-rows > .ut-item') || {}).dataset?.id, h: Math.round(dr.height), viewH: Math.round(wr.height), detail: !!det && (det.textContent || '').length, lastIn: inside(last), opts: opts.length, optsIn: optsTop, order, q: (d.querySelector('.ut-text') || {}).scrollHeight <= (d.querySelector('.ut-text') || {}).clientHeight + 1, scroll: v && v._messageList ? Math.round(v._messageList.scrollTop) : null, jump: !!d.querySelector('.cad-jump:not([hidden])') }; })()`;
    const o1 = await evalJs(OPEN);
    await shot('open-500-opened.png');
    check(`② a press on the question opens it in place — ONE ORDER: the whole question, all ${o1 && o1.opts} options in view at its top, then the detail (${o1 && o1.detail} chars) whose last line is in view at its end; the strip ${o1 && o1.h} px ≤ half the view`, !!o1 && o1.open && o1.id === id && o1.detail >= 500 && o1.lastIn && o1.opts === 3 && o1.optsIn && o1.order && o1.q && o1.h <= o1.viewH / 2 + 40, o1);
    check(`② …the chat's scroll never moved (${list0} → ${o1 && o1.scroll}) and «Show it in the conversation» is a door of its own`, !!o1 && o1.scroll === list0 && o1.jump, { list0, o1 });
    // the message box grows and the window shrinks while it is open (主开发's question a): the strip stays on the box, within half the view
    await evalJs(`(() => { const t = app.wm.windows.get(${J(SID)}).element.querySelector('.chat-input-area textarea'); if (!t) return false; t.focus(); t.value = 'one\\ntwo\\nthree\\nfour\\nfive\\nsix'; t.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`); await sleep(500);
    await winW(SID, 500, 640); await sleep(600);
    const og = await evalJs(`(() => { const w = app.wm.windows.get(${J(SID)}).element, d = w.querySelector('.chat-attn-dock'), c = w.querySelector('.chat-input-area'), R = (e) => e.getBoundingClientRect(); return d && c && { open: d.classList.contains('cad-open'), bottom: Math.round(R(d).bottom), comp: Math.round(R(c).top), h: Math.round(R(d).height), view: Math.round(R(w.querySelector('.chat-view')).height) }; })()`);
    check(`② …the message box grown to six lines and the window cut to 640 px while it is open: the strip still stands on the box (${og && og.bottom} / ${og && og.comp}), ${og && og.h} px ≤ half the view (${og && og.view})`, !!og && og.open && Math.abs(og.bottom - og.comp) <= 2 && og.h <= og.view / 2 + 2, og);
    await evalJs(`(() => { const t = app.wm.windows.get(${J(SID)}).element.querySelector('.chat-input-area textarea'); if (t) { t.value = ''; t.dispatchEvent(new Event('input', { bubbles: true })); t.blur(); } return true; })()`); await winW(SID, 500, 820); await sleep(500);
    await fileAsk('zh', 1); await sleep(800);
    const o2 = await evalJs(OPEN);
    check('② a newer ask filed while it is open: it STAYS open on the same item (the strip redrew around it)', !!o2 && o2.open && o2.id === id, o2);
    await press(`(document.querySelector('.chat-attn-dock .cad-rows > .ut-item > .ut-body > .ut-text'))`); await sleep(500);
    const o3 = await evalJs(`(() => { const d = document.querySelector('.chat-attn-dock:not([hidden])'); return d && { open: d.classList.contains('cad-open'), over: d.classList.contains('cad-over'), spacer: !!document.querySelector('.cad-spacer') }; })()`);
    check('② the same press closes it (no overlay, no spacer left)', !!o3 && !o3.open && !o3.over && !o3.spacer, o3);
    // the owner's item at 360 and 800 too, closed and opened (pictures for 主开发), then five options, one of them 40+ characters
    const top = await evalJs(`(document.querySelector('.chat-attn-dock .cad-rows > .ut-item') || {}).dataset?.id || null`);
    if (top !== id) { const all = await post({ list: true }); for (const it of (all.items || [])) if (it.id !== id && it.status === 'open') await post({ resolve: it.id }); await sleep(900); }
    for (const w of [360, 800]) {
      await winW(SID, w, 820); await sleep(500); await shot(`open-${w}-closed.png`);
      await press(`(document.querySelector('.chat-attn-dock .cad-rows > .ut-item > .ut-body > .ut-text'))`); await sleep(700); await shot(`open-${w}-opened.png`);
      const o4 = await evalJs(OPEN);
      check(`② …at ${w} px too: the owner's item open, its detail's last line and its options inside the window (${o4 && o4.opts})`, !!o4 && o4.open && o4.id === id && o4.optsIn && o4.lastIn, o4);
      await press(`(document.querySelector('.chat-attn-dock .cad-rows > .ut-item > .ut-body > .ut-text'))`); await sleep(400);
    }
    // the reader's list: the CLOSED strip at a short tile (360 × 500, six long options) never takes more than half the view and
    // never pushes the message box out; the OPENED strip stands above the ↓ (a reader scrolled up in history) and Esc closes it
    await resolveAll();
    const sixC = await post({ add: { text: ITEMS.zh.text + ' #short', options: [0, 1, 2, 3, 4, 5].map((k) => `第 ${k + 1} 个：保留英文 agent 这个词，和命令行与文档一致`), urgency: 'high' } });
    const sixCId = sixC && sixC.item ? sixC.item.id : null;
    await winW(SID, 360, 500); await waitFor(`!!document.querySelector('.chat-attn-dock .cad-rows > .ut-item[data-id="${sixCId}"]')`, 8000); await sleep(500);
    const sh = await evalJs(`(() => { const w = app.wm.windows.get(${J(SID)}).element, d = w.querySelector('.chat-attn-dock'), c = w.querySelector('.chat-input-area'), v = w.querySelector('.chat-view'), R = (e) => e.getBoundingClientRect(); return d && c && v && { h: Math.round(R(d).height), view: Math.round(R(v).height), compIn: R(c).bottom <= R(w).bottom + 1 && R(c).top >= R(w).top, scrolls: d.scrollHeight > d.clientHeight + 1 }; })()`);
    await shot('short-360x500-closed.png');
    check(`② a short tile (360 × 500), six long options, CLOSED: the strip ${sh && sh.h} px ≤ half the view (${sh && sh.view}), it scrolls inside (${sh && sh.scrolls}), the message box stays in the window`, !!sixCId && !!sh && sh.h <= sh.view / 2 + 1 && sh.compIn, sh);
    await winW(SID, 500, 820); await sleep(400);
    await evalJs(`(() => { const v = app.sessions.get(${J(SID)}); if (v && v._messageList) { v._messageList.scrollTop = 0; v._messageList.dispatchEvent(new Event('scroll')); } return true; })()`); await sleep(900);
    await press(`(document.querySelector('.chat-attn-dock .cad-rows > .ut-item > .ut-body > .ut-text'))`); await sleep(700);
    const cover = await evalJs(`(() => { const w = app.wm.windows.get(${J(SID)}).element, d = w.querySelector('.chat-attn-dock.cad-open'), down = w.querySelector('.chat-scroll-btn:not(.hidden)'); if (!d) return null; const pills = [...d.querySelectorAll('.ut-opt')]; const R = (e) => e.getBoundingClientRect(), dr = R(d);
      const hits = pills.filter((p) => { const r = R(p); return r.bottom <= dr.bottom && r.top >= dr.top; }).map((p) => { const r = R(p), x = r.right - 6, y = r.top + r.height / 2, h = document.elementFromPoint(x, y); return h === p || p.contains(h); });
      return { downShown: !!down && down.getClientRects().length > 0, pills: hits.length, onPill: hits.every(Boolean) }; })()`);
    await shot('open-500-history.png');
    check(`② opened while the reader is up in history (the ↓ shown: ${cover && cover.downShown}): every option's right end is the option itself — nothing (↓, the minimap) covers it (${cover && cover.pills} pills)`, !!cover && cover.pills > 0 && cover.onPill, cover);
    await evalJs(`(() => { const q = document.querySelector('.chat-attn-dock .cad-rows > .ut-item > .ut-body > .ut-text'); q && q.focus(); return true; })()`);
    await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(400);
    const esc = await evalJs(`(() => { const d = document.querySelector('.chat-attn-dock:not([hidden])'); return d && { open: d.classList.contains('cad-open'), spacer: !!document.querySelector('.cad-spacer') }; })()`);
    check('② Esc on the opened strip closes it (no overlay, no spacer left)', !!esc && !esc.open && !esc.spacer, esc);
    const five = await fileAsk('zh', 5, detail.slice(0, 200));
    await winW(SID, 500, 820); await waitFor(`!!document.querySelector('.chat-attn-dock .cad-rows > .ut-item[data-id="${five}"]')`, 8000); await sleep(500); await shot('five-500-closed.png');
    await press(`(document.querySelector('.chat-attn-dock .cad-rows > .ut-item > .ut-body > .ut-text'))`); await sleep(700); await shot('five-500-opened.png');
    const o5 = await evalJs(OPEN);
    check(`② five options (one 40+ characters) at 500 px, opened: all five whole inside the window (${o5 && o5.opts})`, !!o5 && o5.open && o5.opts === 5 && o5.optsIn, o5);
    await press(`(document.querySelector('.chat-attn-dock .cad-rows > .ut-item > .ut-body > .ut-text'))`); await sleep(400);
    // six LONG options at 360 (主开发 13:34Z): taller than the strip — it scrolls as one, the question and the FIRST option at
    // its top, never the detail first
    const six = await post({ add: { text: ITEMS.zh.text + ' #six', options: [0, 1, 2, 3, 4, 5].map((k) => `第 ${k + 1} 个：保留英文 agent 这个词，和命令行与文档一致`), detail: detail.slice(0, 300), urgency: 'high' } });
    const sixId = six && six.item ? six.item.id : null;
    await winW(SID, 360, 820); await waitFor(`!!document.querySelector('.chat-attn-dock .cad-rows > .ut-item[data-id="${sixId}"]')`, 8000); await sleep(400);
    await press(`(document.querySelector('.chat-attn-dock .cad-rows > .ut-item > .ut-body > .ut-text'))`); await sleep(700);
    const o6 = await evalJs(`(() => { const d = document.querySelector('.chat-attn-dock:not([hidden])'); if (!d) return null; d.scrollTop = 0; const R = (e) => e.getBoundingClientRect(), dr = R(d), first = d.querySelector('.ut-opt'), det = d.querySelector('.ut-detail-exp'), opts = [...d.querySelectorAll('.ut-opt')];
      return { open: d.classList.contains('cad-open'), scrolls: d.scrollHeight > d.clientHeight + 1, firstIn: !!first && R(first).top >= dr.top - 1 && R(first).bottom <= dr.bottom + 1, detailBelow: !!det && R(det).top >= R(opts[opts.length - 1]).bottom - 1, n: opts.length }; })()`);
    await shot('six-360-opened.png');
    check(`② six long options at 360 px, opened: taller than the strip (it scrolls as one: ${o6 && o6.scrolls}), the FIRST option in view at its top, the detail below the last option (${o6 && o6.n})`, !!sixId && !!o6 && o6.open && o6.n === 6 && o6.firstIn && o6.detailBelow, o6);
  }
  check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 5));
} catch (e) {
  check('the suite ran to its end', false, String(e && e.stack || e));
}
console.log(`\n${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass}${fail ? ' passed, ' + fail + ' failed' : ''})`);
process.exit(fail ? 1 : 0);
