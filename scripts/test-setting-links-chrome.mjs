#!/usr/bin/env node
// lane setting-doors pick 1 (2026-11-14) — A DOOR TO ONE SETTING, pressed in the real product: a scratch hub of THIS tree (sign-in
// off, its own data/ and HOME, a stub claude), headless Chrome. `vibespace://settings/<key>` in a For-you item (question and detail),
// in an agent's chat message and in a server notice is a link; a press opens Settings ON THAT ROW — its section in view, an advanced
// row revealed (the per-device switch untouched), the row marked; an open window moves there; on a phone the one-section view —
// and THE SETTINGS FILE'S BYTES ARE THE SAME AFTER EVERY PRESS (a link opens, it never writes). zh pictures under the lane's shots.
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, ONBOARDED_SOURCE, vncEnv, stillPresser, CHROME_STORE, relayBroadcastJs, CHROME_QUIET } from './scratch.mjs';
import { mintRoot, startHub, strippedEnv } from './hub-boot.mjs';   // THE SUITES' ONE HUB BOOT (test-architecture §57c)
import { waitPageTarget } from './cdp-page-target.mjs';
import { markTimedOut, never } from './lib/timed-out.mjs';   // a wait that runs out says so: THE ONE MARK (test-ci-gate §2p)
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = [process.env.VS_CHROME, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => p && fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
const SHOTS = process.env.VS_SETTING_LINK_SHOTS || '';   // a folder for the pictures (the lane's); unset = none taken
const VNC_ENV = await vncEnv();
const [PORT, CDP_PORT] = await freePorts(2);
const BASE = `http://127.0.0.1:${PORT}`;
// the tree, the HOME and the stub live in ONE root the boot helper minted: at exit it ends the hub and every process carrying the
// root's HOME (Chrome's too — rule nine), removes the worktree through git, then the root. Chrome's profile stays a scratch folder.
const root = mintRoot('setlinks'), wt = path.join(root, 't'), PROFILE = scratch('setlinks-chrome'), fakeHome = path.join(root, 'home'), stubDir = path.join(root, 'stub');
const chromeHome = path.join(root, 'chrome-home');
for (const d of [fakeHome, stubDir, chromeHome]) fs.mkdirSync(d, { recursive: true });
const CWD = path.join(fakeHome, 'project'); fs.mkdirSync(CWD, { recursive: true });
let failed = 0, passed = 0;
const check = (n, c, e) => { if (typeof c !== 'boolean') throw new TypeError(`check: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : ''}`); if (typeof PAGE_ERRORS !== 'undefined' && PAGE_ERRORS.length) console.error('    the page said:', PAGE_ERRORS.splice(0).slice(-4).join(' | ')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SID = crypto.randomUUID();
const K1 = 'spend.unattendedPerInstanceDay', K2 = 'spend.allowOverageTurns' /* tier advanced */, K3 = 'chat.uploadDir';
const REPLY = `Change it here: vibespace://settings/${K3}.`;

execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin', 'docs/agent']) execSync(`rm -rf ${wt}/${f} && mkdir -p ${path.dirname(`${wt}/${f}`)} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
// a stub claude: a live conversation; the FIRST user line is answered with one assistant message that carries a setting link
const stubPath = path.join(stubDir, 'claude');
fs.writeFileSync(stubPath, `#!${process.execPath}
const fs = require('fs');
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('2.1.281 (Claude Code) stub'); process.exit(0); }
if (args.includes('--help')) { console.log('Usage: claude [options]'); process.exit(0); }
fs.writeFileSync(${JSON.stringify(stubDir)} + '/env-' + process.pid + '.json', JSON.stringify({ token: process.env.VIBESPACE_SESSION_TOKEN || null }));
const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
out({ type: 'system', subtype: 'init', model: 'claude-fable-5', cwd: ${JSON.stringify(CWD)}, tools: ['Bash'], permissionMode: 'default', claude_code_version: '2.1.281', session_id: ${JSON.stringify(SID)}, uuid: 'u-' + process.pid });
let answered = false, buf = '';
process.stdin.on('data', (d) => { buf += d; if (answered || !/"type":"user"/.test(buf)) return; answered = true;
  out({ type: 'assistant', message: { id: 'msg_sl1', type: 'message', role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text: ${JSON.stringify(REPLY)} }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }, session_id: ${JSON.stringify(SID)}, uuid: 'a-1' });
  out({ type: 'result', subtype: 'success', is_error: false, result: ${JSON.stringify(REPLY)}, session_id: ${JSON.stringify(SID)}, duration_ms: 1, num_turns: 1, usage: { input_tokens: 1, output_tokens: 1 } });
});
process.stdin.on('end', () => process.exit(0));
`, { mode: 0o755 });
const hub = startHub({ root, tree: wt, port: PORT, env: { ...strippedEnv(), ...VNC_ENV, HOME: fakeHome, CLAUDE_CMD: stubPath, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' } });   // its output: <root>/hub.log
const chrome = spawn(CHROME, [...CHROME_QUIET, ...CHROME_STORE, '--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
  '--window-size=1280,800', '--disable-background-timer-throttling', `--user-data-dir=${PROFILE}`, 'about:blank'], { stdio: 'ignore', env: { ...process.env, HOME: chromeHome } });   // HOME: rule nine
let cleaned = false;
const cleanup = () => {
  if (cleaned) return; cleaned = true;
  // the helper's end ran first (registered at the mint): the hub, every process carrying the root's HOME, the worktree through git,
  // then the root — the kill by handle is a no-op by then; a signal is the helper's (each ends in exit, so this runs)
  try { chrome.kill('SIGKILL'); } catch { }
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch { }
};
process.on('exit', cleanup);
const homeUp = await hub.ready({ ms: 60000 }) && await (async () => { for (const until = Date.now() + 60000; Date.now() < until; await sleep(250)) { try { if ((await fetch(`${BASE}/api/home`)).status < 500) return true; } catch { } } return false; })();
if (!homeUp) { console.error(`  ✗ boot: the hub's home route did not answer below 500 within its bound — its log:\n${hub.log().slice(-2000)}`); process.exit(1); }

const WebSocket = require('ws');
let target = null;
target = await waitPageTarget(CDP_PORT, { polls: 80, everyMs: 250, child: chrome }); // B-fcae: the one waiter (a miss always waits)
if (!target) { console.error('  ✗ boot: no chrome page'); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => ws.on('open', r));
let seq = 0; const pend = new Map();
const PAGE_ERRORS = [];   // what the page threw or logged as an error — printed beside a red (a miss says why)
ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') PAGE_ERRORS.push(String((m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description) || m.params.exceptionDetails.text).slice(0, 600));
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') PAGE_ERRORS.push(m.params.args.map((x) => x.value || x.description || '').join(' ').slice(0, 600)); });
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); ws.send(JSON.stringify({ id, method, params })); });
const evalJs = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; };
const until = async (expr, { timeout = 15000, step = 120 } = {}) => { const t0 = Date.now(); for (;;) { let v = null; try { v = await evalJs(expr); } catch { } if (v) return v; if (Date.now() - t0 > timeout) return v; await sleep(step); } };
// THE still door (scripts/scratch.mjs stillPresser — test-still-press's law: no suite presses by coordinates outside it): the last
// VISIBLE match, scrolled into view, pressed only while still and under its point; the landing is checked
const still = stillPresser({ evalJs, cdp, log: (l) => console.error(l) });
const VISIBLE = `(e) => (e.checkVisibility ? e.checkVisibility({ checkVisibilityCSS: true }) : true)`;
const press = async (sel, { touch = false } = {}) => {
  await evalJs(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(sel)})].filter(${VISIBLE}).pop(); if (e) e.scrollIntoView({ block: 'center' }); return !!e; })()`);
  await sleep(150);
  const ok = await still(`JS:[...document.querySelectorAll(${JSON.stringify(sel)})].filter(${VISIBLE}).pop()`, { touch });
  await sleep(300); return ok;
};
const settingsBytes = () => { try { return fs.readFileSync(path.join(wt, 'data', 'settings.json')); } catch { return Buffer.from(''); } };
const sameBytes = (a, b) => Buffer.compare(a, b) === 0;
/** the row the Settings window is focused on: in view inside its scroller, marked, its section */
const focusOf = (key) => evalJs(`(() => { const rows = [...document.querySelectorAll('.settings-row[data-path=${JSON.stringify(key)}]')]; const row = rows[rows.length - 1]; if (!row) return { found: false, windows: document.querySelectorAll('.settings-content').length };
  const sc = row.closest('.settings-content'); const r = row.getBoundingClientRect(), s = sc ? sc.getBoundingClientRect() : { top: 0, bottom: innerHeight };
  const sec = row.closest('.settings-section'); const others = sc ? [...sc.querySelectorAll('.settings-section')].filter((x) => x.getBoundingClientRect().height > 0).map((x) => x.dataset.category) : [];
  return { found: true, inView: r.height > 0 && r.top >= s.top - 1 && r.bottom <= s.bottom + 1, marked: row.classList.contains('settings-row-focus'), section: sec ? sec.dataset.category : null, sections: others, windows: document.querySelectorAll('.settings-content').length, advSwitch: localStorage.getItem('vibespace.settingsAdvanced') }; })()`);
// A WAIT THAT RUNS OUT SAYS SO (主开发 r1141; test-ci-gate §2p): the row's focus facts, MARKED when its row never came into view — the
// judge says that by name, never «the row is not marked» as a verdict on the product
const focusWhenIn = async (key) => { for (let i = 0; i < 40; i++) { const f = await focusOf(key); if (f.found && f.inView) return f; await sleep(150); } return markTimedOut(await focusOf(key), 40 * 150, 'focusWhenIn (its row found in view)'); };
const shot = async (name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, `${name}.png`), Buffer.from(r.data, 'base64')); console.log(`    · picture ${path.join(SHOTS, name + '.png')}`); };
const ask = (args, token) => new Promise((resolve) => { const c = spawn(process.execPath, [path.join(wt, 'data', 'bin', 'vibespace-ask'), ...args], { env: { PATH: process.env.PATH, HOME: fakeHome, VIBESPACE_API: BASE, VIBESPACE_SESSION_TOKEN: token } }); let out = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; }); c.on('close', (code) => resolve({ code, out })); });

try {
  console.log('① a scratch hub of this tree (sign-in off), a live conversation, the page in zh');
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "try { localStorage.setItem('vibespace.lang', 'zh'); } catch { }" });   // the pictures are zh
  await cdp('Page.navigate', { url: BASE });
  check('the app loads', !!(await until(`!!(window.app && app.wm && document.getElementById('taskbar-user-todos') && typeof app.openSettingAt === 'function')`, { timeout: 40000 })));
  await until(`!document.getElementById('loading-screen')`, { timeout: 30000 });
  const ws0 = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { headers: { Origin: BASE } });
  await new Promise((r, j) => { ws0.on('open', r); ws0.on('error', j); });
  const frames0 = []; ws0.on('message', (d) => { try { frames0.push(JSON.parse(String(d))); } catch { } });
  ws0.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: CWD, reqId: 'sl1', sessionName: 'Setting links' }));
  let TOKEN = null;
  for (let i = 0; i < 120 && !TOKEN; i++) { for (const f of fs.readdirSync(stubDir).filter((x) => x.startsWith('env-'))) { try { TOKEN = JSON.parse(fs.readFileSync(path.join(stubDir, f), 'utf8')).token || TOKEN; } catch { } } if (!TOKEN) await sleep(250); }
  const created = frames0.find((m) => m && m.type === 'created' && m.reqId === 'sl1');
  check('a live conversation through the real spawn path, with its own token', !!TOKEN && !!created, frames0.slice(-3).map((m) => m.type));
  const HUB_SID = created && created.sessionId;

  console.log('② For you: the question\'s link opens Settings on the row; the detail\'s link (an ADVANCED row) moves the open window there');
  const a = await ask([`Raise the day ceiling: vibespace://settings/${K1}.`, '--detail', `The ceiling: vibespace://settings/${K1} — or let unattended turns spend paid overage: vibespace://settings/${K2}; vibespace://settings/spend.nope is no row.`], TOKEN);
  check('the agent writes the links in plain text (vibespace-ask, no new tool)', a.code === 0, a.out);
  await press('#taskbar-user-todos');
  const qLink = `#user-todos-popup .ut-item .ut-text .fy-link[data-fy="setting"][data-ref="${K1}"]`;
  check('the tray draws the question\'s link as a link', !!(await until(`!!document.querySelector(${JSON.stringify(qLink)})`, { timeout: 10000 })));
  check('an unknown key is words, not a link', (await evalJs(`[...document.querySelectorAll('#user-todos-popup .fy-link[data-fy="setting"]')].every((e) => e.dataset.ref !== 'spend.nope')`)) === true);
  await shot('zh-tray-1280');
  // the tray's ROW clamps its question to the row's width (a long link runs on behind an ellipsis — its box's centre is hidden, and
  // the still door presses only a centre that is the link); its DETAIL fold draws the words whole: the presses are made there,
  // the question's own link is pressed on the phone below, where a tap opens the row
  await evalJs(`(() => { const d = [...document.querySelectorAll('#user-todos-popup .ut-item details.ut-detail-exp')].find((x) => x.querySelector('.fy-link[data-ref="${K1}"]')); if (d) d.open = true; return !!d; })()`);
  const d1Link = `#user-todos-popup .ut-item .ut-detail .fy-link[data-fy="setting"][data-ref="${K1}"]`;
  check('the detail draws its links too', !!(await until(`!!document.querySelector(${JSON.stringify(d1Link)})`, { timeout: 8000 })));
  const b0 = settingsBytes();
  check('a real press on the ceiling\'s link', (await press(d1Link)) === true);
  const fo1 = await focusWhenIn(K1);
  check('Settings opens ON THAT ROW: its section in view, the row in view and marked' + never(fo1), gateOf(fo1.found) && gateOf(fo1.inView) && gateOf(fo1.marked) && fo1.windows === 1, fo1);
  await shot('zh-settings-row');
  check('THE SETTINGS FILE IS BYTE FOR BYTE THE SAME after the press (a link opens, it never writes)', verdictOf(sameBytes(b0, settingsBytes())));
  await evalJs(`(() => { const p = document.getElementById('user-todos-popup'); if (!p || p.classList.contains('hidden')) document.getElementById('taskbar-user-todos').click(); return true; })()`);
  await evalJs(`(() => { const d = [...document.querySelectorAll('#user-todos-popup .ut-item details.ut-detail-exp')].find((x) => x.querySelector('.fy-link[data-ref="${K2}"]')); if (d) d.open = true; return !!d; })()`);
  const dLink = `#user-todos-popup .ut-item .ut-detail .fy-link[data-fy="setting"][data-ref="${K2}"]`;
  check('the detail\'s second link is a link too', !!(await until(`!!document.querySelector(${JSON.stringify(dLink)})`, { timeout: 8000 })));
  check('a real press on it', (await press(dLink)) === true);
  const fo2 = await focusWhenIn(K2);
  check('with Settings already open it MOVES there (one window): an ADVANCED row revealed for this open, the per-device switch untouched' + never(fo2), gateOf(fo2.found) && gateOf(fo2.inView) && gateOf(fo2.marked) && fo2.windows === 1 && fo2.advSwitch === null, fo2);
  check('still not a byte written', verdictOf(sameBytes(b0, settingsBytes())));

  console.log('③ the chat: an agent\'s message carries the link; a press opens the row of ANOTHER section');
  await evalJs(`(() => { app.attachSession(${JSON.stringify(HUB_SID)}, 'Setting links', ${JSON.stringify(CWD)}, { mode: 'chat', backend: 'claude' }); return true; })()`);
  ws0.send(JSON.stringify({ type: 'chat-input', sessionId: HUB_SID, text: 'which setting?', msgId: 'm-sl-1' }));
  const cLink = `.chat-setting-link[data-setting="${K3}"]`;
  check('the agent\'s answer draws `vibespace://settings/chat.uploadDir` as a link (its full stop outside)', !!(await until(`!!document.querySelector(${JSON.stringify(cLink)})`, { timeout: 20000 })));
  await shot('zh-chat-link');
  check('a real press on it', (await press(cLink)) === true);
  const fo3 = await focusWhenIn(K3);
  check('Settings moves to the Chat section\'s row' + never(fo3), gateOf(fo3.found) && gateOf(fo3.inView) && gateOf(fo3.marked) && fo3.windows === 1, fo3);
  check('not a byte written', verdictOf(sameBytes(b0, settingsBytes())));

  console.log('④ a notice: the server\'s notice frame, fed to the page\'s own handler, draws the link as a button');
  await evalJs(`(() => { ${relayBroadcastJs(`{ type: 'server-notice', key: 'sl-' + Date.now(), level: 1, text: 'The instance ceiling is near — vibespace://settings/${K1}' }`, "app.ws.globalHandlers")} return true; })()`);
  const tLink = `.global-toast-setting[data-setting="${K1}"]`;
  check('the toast carries the link as a button', !!(await until(`!!document.querySelector(${JSON.stringify(tLink)})`, { timeout: 8000 })));
  check('a real press on it', (await press(tLink)) === true);
  const fo4 = await focusWhenIn(K1);
  check('Settings moves back to the ceiling\'s row' + never(fo4), gateOf(fo4.found) && gateOf(fo4.inView) && gateOf(fo4.marked) && fo4.windows === 1, fo4);
  check('not a byte written', verdictOf(sameBytes(b0, settingsBytes())));

  console.log('⑤ the phone (390 px): the tray sheet\'s link opens the one-section view on the row');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36', platform: 'Linux armv8l' });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp('Page.reload');
  check('the phone page loads', !!(await until(`!!(window.app && app.isMobile && typeof app.openSettingAt === 'function')`, { timeout: 40000 })));
  await until(`!document.getElementById('loading-screen')`, { timeout: 30000 });
  // the phone's tray sheet is the same #user-todos-popup; its taskbar button is not on the phone's screen — opened as the vault-paste suite does
  await until(`(() => { const p = document.getElementById('user-todos-popup'); if (!p || p.classList.contains('hidden')) document.getElementById('taskbar-user-todos').click(); return !!p && !p.classList.contains('hidden') && p.getBoundingClientRect().height > 0; })()`, { timeout: 10000 });
  check('the phone\'s tray sheet draws the link', !!(await until(`!!document.querySelector(${JSON.stringify(qLink)})`, { timeout: 10000 })));
  await shot('zh-phone-tray');
  // the phone draws a row's question on one line until the row is tapped open (the product's touch rule) — the link is inside
  check('a tap opens the row (the question whole, its link on screen)', (await press(`#user-todos-popup .ut-item .ut-body`, { touch: true })) === true && !!(await until(`(() => { const l = [...document.querySelectorAll(${JSON.stringify(qLink)})].pop(); if (!l) return false; const r = l.getClientRects()[0]; const h = r && document.elementFromPoint(r.left + 8, r.top + r.height / 2); return !!h && (h === l || l.contains(h)); })()`, { timeout: 5000 })));
  // the UI train's hosted mirror (prep408c, both tries): «NOT pressed — covered … under its point: div.ut-text» — this long link WRAPS
  // on the phone, and the still presser aimed at its bounding box's centre (its paragraph). scripts/scratch.mjs stillLookSource now
  // aims at a wrapped target's FIRST line fragment; the press waits for the state the page shows — that point on the link — never a sleep
  const firstLine = (sel) => `(() => { const l = [...document.querySelectorAll(${JSON.stringify(sel)})].filter(${VISIBLE}).pop(); if (!l) return false; const r = l.getClientRects()[0]; if (!r || !(r.width > 0)) return false; const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!h && (h === l || l.contains(h)); })()`;
  check('the link\'s first line is on screen and under its press point (the state the press waits for)', !!(await until(firstLine(qLink), { timeout: 8000 })), await evalJs(`(() => { const l = [...document.querySelectorAll(${JSON.stringify(qLink)})].pop(); return l ? { rects: l.getClientRects().length } : null; })()`));
  check('a tap on the link', (await press(qLink, { touch: true })) === true);
  const fo5 = await focusWhenIn(K1);
  check('on the phone: the row in view, marked, its section ALONE (the one-section view)' + never(fo5), gateOf(fo5.found) && gateOf(fo5.inView) && gateOf(fo5.marked) && fo5.sections.length === 1 && fo5.sections[0] === fo5.section, fo5);
  await shot('zh-phone-settings-row');
  check('not a byte written, after every press', verdictOf(sameBytes(b0, settingsBytes())));
  // RED CONTROL: the same press on a link that is truly absent (no row carries it) presses nothing — the leg above fails without its link
  check('RED CONTROL: a tap on a link no row draws presses nothing (the leg would fail without the link)', (await press(`#user-todos-popup .ut-item .ut-text .fy-link[data-fy="setting"][data-ref="chat.nope"]`, { touch: true })) === false);

  console.log('⑥ f1 (主开发 2026-11-15, REQUIRED): the «Sign-in is off» line is true while shown — a password set through its own button and the line goes, Settings still open (LAST: the hub signs in from here on)');
  await cdp('Emulation.clearDeviceMetricsOverride'); await cdp('Emulation.setTouchEmulationEnabled', { enabled: false });
  await cdp('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36' });
  await cdp('Page.reload');
  check('the desktop page again', !!(await until(`!!(window.app && !app.isMobile && app._authEnabled === false && typeof app.openSettingAt === 'function')`, { timeout: 40000 })));
  await until(`!document.getElementById('loading-screen')`, { timeout: 30000 });
  await evalJs(`app.openSettingAt(${JSON.stringify(K1)}); true`);
  const line = '.settings-row.settings-spend-signin';
  check('Settings › Spending says sign-in is off, with its «Set password…» door', !!(await until(`!!document.querySelector(${JSON.stringify(line)})`, { timeout: 10000 })));
  await shot('zh-signin-off-line');
  check('a real press on «Set password…»', (await press(`${line} .settings-link-btn`)) === true);
  check('the password dialog opens', !!(await until(`!!document.querySelector('.cfg-pass-form #pw-new')`, { timeout: 8000 })));
  await evalJs(`(() => { const f = document.querySelector('.cfg-pass-form'); f.querySelector('#pw-new').value = 'setting-doors-leg-1'; f.querySelector('#pw-conf').value = 'setting-doors-leg-1'; return true; })()`);
  check('a real press on «Set password»', (await press('.cfg-pass-form button[type=submit]')) === true);
  check('sign-in is ON now, and the line is GONE from the Settings window that stayed open (redrawn when the flag changed)', !!(await until(`app._authEnabled === true && document.querySelectorAll('.settings-content').length === 1 && !document.querySelector(${JSON.stringify(line)})`, { timeout: 10000 })));
} catch (e) { failed++; console.error('  ✗ threw:', e && e.stack || e); }
console.log(failed ? `✗ test-setting-links-chrome: ${passed} passed, ${failed} failed` : `ALL PASS (${passed})`);
cleanup();
process.exit(failed ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
