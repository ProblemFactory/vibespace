#!/usr/bin/env node
// lane setting-doors pick 2 (主开发's GO 2026-11-15 14:03Z, seven amendments) — A PROPOSED CHANGE THE OWNER TAKES IN ONE PRESS, in the
// real product: a scratch hub of THIS tree (sign-in off, its own data/ and HOME, a stub claude), headless Chrome. An agent's
// `vibespace-ask --propose <row>=<value> --until 6h` draws ONE box on every For-you surface (the tray at its widths, the phone's sheet,
// the chat's card): the row, its value NOW, the proposal and its moment, ONE button naming them; the press is ONE server act (the
// value written, the hold on disk, the item answered); a value that moved since the ask is SAID; the Settings row says the hold with
// «End now», which returns it (a toast with the row's link); a press that changes nothing writes no byte. zh pictures.
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, ONBOARDED_SOURCE, vncEnv, stillPresser, ownerPageHeaders, CHROME_STORE, CHROME_QUIET } from './scratch.mjs';
import { mintRoot, startHub, strippedEnv } from './hub-boot.mjs';   // THE SUITES' ONE HUB BOOT (test-architecture §57c)
import { waitPageTarget } from './cdp-page-target.mjs';
import { markTimedOut, never } from './lib/timed-out.mjs';   // a wait that runs out says so: THE ONE MARK (test-ci-gate §2p)
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = [process.env.VS_CHROME, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => p && fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
const SHOTS = process.env.VS_SETTING_PROPOSE_SHOTS || '';   // a folder for the pictures (the lane's); unset = none taken
const VNC_ENV = await vncEnv();
const [PORT, CDP_PORT] = await freePorts(2);
const BASE = `http://127.0.0.1:${PORT}`;
// the tree, the HOME and the stub live in ONE root the boot helper minted: at exit it ends the hub and every process carrying the
// root's HOME (Chrome's too — rule nine), removes the worktree through git, then the root. Chrome's profile stays a scratch folder.
const root = mintRoot('propose'), wt = path.join(root, 't'), PROFILE = scratch('propose-chrome'), fakeHome = path.join(root, 'home'), stubDir = path.join(root, 'stub');
const chromeHome = path.join(root, 'chrome-home');
for (const d of [fakeHome, stubDir, chromeHome]) fs.mkdirSync(d, { recursive: true });
const CWD = path.join(fakeHome, 'project'); fs.mkdirSync(CWD, { recursive: true });
let failed = 0, passed = 0;
const check = (n, c, e) => { if (typeof c !== 'boolean') throw new TypeError(`check: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : ''}`); if (typeof PAGE_ERRORS !== 'undefined' && PAGE_ERRORS.length) console.error('    the page said:', PAGE_ERRORS.splice(0).slice(-4).join(' | ')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SID = crypto.randomUUID();
const DAY = 'spend.unattendedPerInstanceDay', IDDAY = 'spend.unattendedPerIdentityDay', HOUR = 'spend.unattendedPerIdentityHour';
const REPLY = 'Noted.';

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
const shot = async (name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, `${name}.png`), Buffer.from(r.data, 'base64')); console.log(`    · picture ${path.join(SHOTS, name + '.png')}`); };
const ask = (args, token) => new Promise((resolve) => { const c = spawn(process.execPath, [path.join(wt, 'data', 'bin', 'vibespace-ask'), ...args], { env: { PATH: process.env.PATH, HOME: fakeHome, VIBESPACE_API: BASE, VIBESPACE_SESSION_TOKEN: token } }); let out = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; }); c.on('close', (code) => resolve({ code, out })); });


const api = async (p, opts = {}) => { const r = await fetch(`${BASE}${p}`, opts); let j = null; try { j = await r.json(); } catch { } return { status: r.status, json: j }; };
const ownerPatch = (patch) => api('/api/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...ownerPageHeaders(BASE) }, body: JSON.stringify(patch) });
const stored = () => { try { return JSON.parse(fs.readFileSync(path.join(wt, 'data', 'settings.json'), 'utf8')); } catch { return {}; } };
const holdsNow = async () => ((await api('/api/setting-holds')).json || {}).holds || [];
const items = async () => { const d = ((await api('/api/user-todos')).json || {}).todos || {}; return [...(d.open || []), ...(d.resolved || [])].filter((x) => x.action && x.action.type === 'setting-change'); };   // GET /api/user-todos = { todos: { open, resolved, now } }   // the proposals only (a fresh hub files notices of its own)
const openTray = () => until(`(() => { const p = document.getElementById('user-todos-popup'); if (!p || p.classList.contains('hidden')) document.getElementById('taskbar-user-todos').click(); return !!p && !p.classList.contains('hidden') && p.getBoundingClientRect().height > 0; })()`, { timeout: 10000 });
const TOASTS_SRC = "(() => { if (window.__toasts) return; window.__toasts = []; new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && n.classList && n.classList.contains('global-toast')) window.__toasts.push(n.textContent); }).observe(document.body, { childList: true, subtree: true }); })()";
const toasts = async () => { try { return await evalJs('(window.__toasts || []).slice(-4)'); } catch { return []; } };
/** a picture of ONE element (a box, a row) — clipped to its rect, scrolled into view first */
const shotOf = async (name, sel) => { if (!SHOTS) return; await evalJs(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(sel)})].pop(); if (e) e.scrollIntoView({ block: 'center' }); return !!e; })()`); await sleep(250);
  const r = await evalJs(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(sel)})].pop(); if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.max(0, b.left - 6), y: Math.max(0, b.top - 6), width: Math.min(innerWidth, b.width + 12), height: Math.min(innerHeight, b.height + 12) }; })()`);
  if (!r) return; fs.mkdirSync(SHOTS, { recursive: true }); const o = await cdp('Page.captureScreenshot', { format: 'png', clip: { ...r, scale: 1 } }); fs.writeFileSync(path.join(SHOTS, `${name}.png`), Buffer.from(o.data, 'base64')); console.log(`    · picture ${path.join(SHOTS, name + '.png')}`); };
const idOf = async (startsWith) => ((await items()).filter((x) => String(x.text || '').startsWith(startsWith)).pop() || {}).id;
const byId = (id) => `#user-todos-popup .ut-item[data-id="${id}"] .ut-setting-change`;
const box = (key, scope = '#user-todos-popup') => `${scope} .ut-setting-change[data-key="${key}"]`;
/** the box as drawn: its words, its button (words, whole, inside the viewport) */
const boxOf = (sel) => evalJs(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(sel)})].filter((e) => e.getBoundingClientRect().height > 0).pop(); if (!b) return null;
  const go = b.querySelector('.ut-setting-go'); const r = go ? go.getBoundingClientRect() : null;
  const row = b.closest('.ut-item'); const fits = b.scrollWidth <= b.clientWidth + 1 && (!row || b.getBoundingClientRect().right <= row.getBoundingClientRect().right + 1);
  return { fits, text: b.textContent, press: b.dataset.press, now: (b.querySelector('.ut-sc-now') || {}).textContent || '', moved: !!b.querySelector('.ut-sc-moved'), held: (b.querySelector('.ut-sc-held') || {}).textContent || '', why: (b.querySelector('.ut-sc-why') || {}).textContent || '',
    go: go ? { words: go.textContent, shown: go.dataset.shown, whole: go.scrollWidth <= go.clientWidth + 1, inside: r.left >= -1 && r.right <= innerWidth + 1 && r.width > 0 } : null }; })()`);

// A WAIT THAT RUNS OUT SAYS SO (主开发 r1141; test-ci-gate §2p): the box's facts, MARKED when the state it waits for never came — its
// judge says that by name («the state never came»), never a verdict on the product
const boxWhen = async (sel, test, what) => { for (let i = 0; i < 40; i++) { const b = await boxOf(sel); if (b && test(b)) return b; await sleep(150); } return markTimedOut(await boxOf(sel), 40 * 150, what); };
try {
  console.log('① a scratch hub of this tree (sign-in off), a live conversation, the page in zh');
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "try { localStorage.setItem('vibespace.lang', 'zh'); } catch { }" });   // the pictures are zh
  await cdp('Page.navigate', { url: BASE });
  check('the app loads', !!(await until(`!!(window.app && app.wm && document.getElementById('taskbar-user-todos') && typeof app.openSettingAt === 'function')`, { timeout: 40000 })));
  await until(`!document.getElementById('loading-screen')`, { timeout: 30000 });
  await evalJs(TOASTS_SRC);
  const ws0 = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { headers: { Origin: BASE } });
  await new Promise((r, j) => { ws0.on('open', r); ws0.on('error', j); });
  const frames0 = []; ws0.on('message', (d) => { try { frames0.push(JSON.parse(String(d))); } catch { } });
  ws0.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: CWD, reqId: 'sp1', sessionName: 'Ceilings' }));
  let TOKEN = null;
  for (let i = 0; i < 120 && !TOKEN; i++) { for (const f of fs.readdirSync(stubDir).filter((x) => x.startsWith('env-'))) { try { TOKEN = JSON.parse(fs.readFileSync(path.join(stubDir, f), 'utf8')).token || TOKEN; } catch { } } if (!TOKEN) await sleep(250); }
  const created = frames0.find((m) => m && m.type === 'created' && m.reqId === 'sp1');
  check('a live conversation through the real spawn path, with its own token', !!TOKEN && !!created, frames0.slice(-3).map((m) => m.type));
  const HUB_SID = created && created.sessionId;

  console.log('② the agent proposes; the refusals file nothing');
  const r0 = await ask(['Raise the day ceiling so the release can finish?', '--propose', `${DAY}=1600`], TOKEN);
  check('a RAISE with no --until is refused by name, with the row\'s link — nothing filed', r0.code !== 0 && gateOf(/time-boxed/.test(r0.out)) && gateOf(r0.out.includes(`vibespace://settings/${DAY}`)) && (await items()).length === 0, r0.out);   // stale-pins: kept — the scheme's link text as this suite's input — src/setting-links.js was created and folded into src/internal-link.js inside this range; not a pin
  const r1 = await ask(['The judge\'s cap?', '--propose', 'plugin.llm.dailyBudgetUsd=9', '--until', '2h'], TOKEN);
  check('the judge\'s daily cap is not on the list — refused, nothing filed', r1.code !== 0 && (await items()).length === 0, r1.out);
  const a = await ask(['The lanes hit today\'s ceiling — raise it so the release can finish?', '--propose', `${DAY}=1600`, '--until', '6h'], TOKEN);
  const filedA = await items();
  check('a raise with --until 6h is filed (the ONE proposal in the store — the refusals above filed none); the agent reads the hub\'s line', a.code === 0 && filedA.length === 1 && filedA[0].action.key === DAY && verdictOf(/proposed: spend\.unattendedPerInstanceDay → 1600 for 6 h from the owner's press/.test(a.out)), { out: a.out, n: filedA.length });

  console.log('③ the tray draws ONE box: the row, its value now, the proposal, ONE button naming the amount and the moment — at every width');
  await openTray();
  check('the box is drawn in the tray', !!(await until(`!!document.querySelector(${JSON.stringify(box(DAY))})`, { timeout: 10000 })));
  const b1 = await boxOf(box(DAY));
  check('…with the value now (800, the default) and the proposed 1600, and ONE button naming 1600 and the stretch', !!b1 && b1.press === 'yes' && gateOf(/800/.test(b1.now)) && gateOf(/1600/.test(b1.text)) && !!b1.go && gateOf(/1600/.test(b1.go.words)) && b1.go.shown === '800', b1);
  for (const w of [280, 360, 480, 600, 768, 1024, 1280, 1440]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: 800, deviceScaleFactor: 1, mobile: false });
    await sleep(400); await openTray();
    const bw = await boxOf(box(DAY));
    check(`width ${w}: the box fits its row (it never widens the tray) and its button's words are whole and on screen`, !!bw && gateOf(bw.fits) && !!bw.go && gateOf(bw.go.whole) && verdictOf(bw.go.inside), bw && { fits: bw.fits, go: bw.go });
    await shot(`zh-tray-${w}`);
  }
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await sleep(300); await openTray();

  console.log('④ a value that MOVED since the ask is said, and the button follows it; the row\'s link opens Settings and writes nothing');
  check('the owner changes the row by hand (the owner\'s page): 1200', (await ownerPatch({ [DAY]: 1200 })).status === 200 && stored()[DAY] === 1200);
  const b2 = await boxWhen(box(DAY), (b) => b.moved, 'the box never said the value moved');
  check('the box says it is 1200 now and was 800 when asked; the button now carries 1200 as what it saw' + never(b2), !!b2 && gateOf(b2.moved) && gateOf(/1200/.test(b2.now)) && gateOf(/800/.test(b2.now)) && !!b2.go && b2.go.shown === '1200', b2);
  await shot('zh-tray-moved');
  const bytes0 = settingsBytes();
  check('a real press on «Open this setting»', (await press(`${box(DAY)} .ut-sc-link`)) === true);
  check('Settings opens on that row', !!(await until(`!!document.querySelector('.settings-row[data-path="${DAY}"].settings-row-focus')`, { timeout: 10000 })));
  check('A PRESS THAT CHANGES NOTHING WRITES NOTHING: the settings file byte for byte the same', verdictOf(sameBytes(bytes0, settingsBytes())));

  console.log('⑤ ONE PRESS: the value written, the hold on disk, the item answered — and the Settings row says the hold with «End now»');
  await openTray();
  await sleep(900);   // press-arm: a button is pressable once it sat still ARM_MS (700 ms) — a person reads it first
  check('a real press on the button', (await press(`${box(DAY)} .ut-setting-go`)) === true);
  const st = await (async () => { for (let i = 0; i < 40; i++) { if (stored()[DAY] === 1600) break; await sleep(150); } return stored()[DAY]; })();
  const h1 = await holdsNow();
  check('the row holds 1600; ONE hold, returning to 1200 (the value before the press) about 6 h from the press', st === 1600 && h1.length === 1 && h1[0].key === DAY && h1[0].value === 1600 && h1[0].before === 1200 && Math.abs(h1[0].untilAt - Date.now() - 6 * 3600e3) < 120e3, { st, h1, toasts: await toasts() });
  const it1 = (await items()).find((x) => x.action && x.action.key === DAY);
  check('the item is answered (resolved by the press; the agent told on the reply road)', !!it1 && it1.status !== 'open', it1 && { status: it1.status, reply: it1.reply });
  await evalJs(`app.openSettingAt(${JSON.stringify(DAY)}); true`);
  const held = await until(`(() => { const l = document.querySelector('.settings-row[data-path="${DAY}"] .settings-row-held'); return l ? l.textContent : null; })()`, { timeout: 10000 });
  check('the Settings row SAYS the hold: 1600 until the moment, then 1200 — with «End now»', !!held && gateOf(/1600/.test(held)) && gateOf(/1200/.test(held)) && !!(await evalJs(`!!document.querySelector('.settings-row[data-path="${DAY}"] .settings-held-end')`)), held);
  await shot('zh-settings-held-row');

  console.log('⑥ «End now»: the row goes back at once — quietly: a toast with the row\'s link, no For-you item');
  const n0 = (await items()).filter((x) => x.status === 'open').length;
  check('a real press on «End now»', (await press(`.settings-row[data-path="${DAY}"] .settings-held-end`)) === true);
  const back = await (async () => { for (let i = 0; i < 40; i++) { if (stored()[DAY] === 1200) break; await sleep(150); } return stored()[DAY]; })();
  check('the row is back to 1200, no hold stands', back === 1200 && (await holdsNow()).length === 0, { back });
  check('the held line is gone from the open Settings', !!(await until(`!document.querySelector('.settings-row[data-path="${DAY}"] .settings-row-held')`, { timeout: 8000 })));
  check('a toast says it, with the row\'s link', !!(await until(`!!document.querySelector('.global-toast-setting[data-setting="${DAY}"]')`, { timeout: 8000 })));
  await shot('zh-end-now-toast');
  check('no For-you item for the return', (await items()).filter((x) => x.status === 'open').length === n0);

  console.log('⑦ the chat\'s card: a LOWER that lasts, pressed in the conversation');
  const c = await ask(['Lower the per-conversation day ceiling while the loop is looked at?', '--propose', `${IDDAY}=100`], TOKEN);
  check('a lasting lower is filed', c.code === 0, c.out);
  await evalJs(`(() => { const p = document.getElementById('user-todos-popup'); if (p && !p.classList.contains('hidden')) document.getElementById('taskbar-user-todos').click(); app.attachSession(${JSON.stringify(HUB_SID)}, 'Ceilings', ${JSON.stringify(CWD)}, { mode: 'chat', backend: 'claude' }); return true; })()`);
  const cardSel = `.cn-card .ut-setting-change[data-key="${IDDAY}"]`;
  check('the chat\'s card draws the same box', !!(await until(`!!document.querySelector(${JSON.stringify(cardSel)})`, { timeout: 15000 })));
  const b3 = await boxOf(cardSel);
  check('…a lower with no moment: «it stays»; the button names 100', !!b3 && !!b3.go && gateOf(/100/.test(b3.go.words)) && b3.go.shown === '200', b3);
  await shot('zh-chat-card');
  await sleep(900);   // press-arm
  check('a real press in the chat', (await press(`${cardSel} .ut-setting-go`)) === true);
  const v3 = await (async () => { for (let i = 0; i < 40; i++) { if (stored()[IDDAY] === 100) break; await sleep(150); } return stored()[IDDAY]; })();
  check('the row holds 100; no hold (a lasting lower)', v3 === 100 && (await holdsNow()).length === 0, { v3 });

  console.log('⑦b THE CHECK\'S LAWS on a held row (主开发 2026-11-15): A — a lasting change is judged against the hold\'s «before»; B — a hand change ends the hold where it lands; C — nothing said is false');
  await evalJs(`(() => { if (window.app && app.wm) { for (const w of [...(app.wm.windows ? app.wm.windows.values() : [])]) { try { if (w.type === 'chat') app.wm.closeWindow(w.id); } catch { } } } return true; })()`);
  check('the owner has the row at 1500 by hand (no hold)', (await ownerPatch({ [DAY]: 1500 })).status === 200 && (await holdsNow()).length === 0);
  const qa = await ask(['Ease the day ceiling to 1400 for good?', '--propose', `${DAY}=1400`], TOKEN);
  const A = await idOf('Ease the day ceiling to 1400');
  check('a lasting 1400 is filed while the row is 1500 (a lower then)', qa.code === 0 && !!A, qa.out);
  check('…the owner sets the row back to 1200 by hand', (await ownerPatch({ [DAY]: 1200 })).status === 200 && stored()[DAY] === 1200);
  const qb = await ask(['Raise the day ceiling for the release run?', '--propose', `${DAY}=1600`, '--until', '2h'], TOKEN);
  const B = await idOf('Raise the day ceiling for the release run');
  await openTray(); await until(`!!document.querySelector(${JSON.stringify(byId(B) + ' .ut-setting-go')})`, { timeout: 10000 }); await sleep(900);   // press-arm
  check('a timed raise to 1600 for 2 h is pressed', qb.code === 0 && (await press(`${byId(B)} .ut-setting-go`)) === true);
  const hB = await (async () => { for (let i = 0; i < 40; i++) { const h = await holdsNow(); if (h.length === 1) return h[0]; await sleep(150); } return null; })();
  check('a hold stands: 1600, back to 1200', !!hB && hB.value === 1600 && hB.before === 1200 && stored()[DAY] === 1600, hB);
  const qc = await ask(['Settle the day ceiling at 1000?', '--propose', `${DAY}=1000`], TOKEN), qd = await ask(['Raise the day ceiling a little more for an hour?', '--propose', `${DAY}=2000`, '--until', '1h'], TOKEN);
  const q1400 = await ask(['Make it 1400 for good?', '--propose', `${DAY}=1400`], TOKEN);
  check('LAW A at the ASK: on the held row a lasting 1400 (over the «before» 1200) is refused by name, with the row\'s link — nothing filed', q1400.code !== 0 && gateOf(/raise-over-hold|goes back to 1200/.test(q1400.out)) && verdictOf(q1400.out.includes(`vibespace://settings/${DAY}`)), q1400.out);   // stale-pins: kept — the scheme's link text as this suite's input — src/setting-links.js was created and folded into src/internal-link.js inside this range; not a pin
  const C = await idOf('Settle the day ceiling at 1000'), D = await idOf('Raise the day ceiling a little more');
  check('a lasting 1000 (under the «before») and a timed 2000 are filed on the held row', qc.code === 0 && qd.code === 0 && !!C && !!D, { qc: qc.out, qd: qd.out });
  await openTray();
  await until(`!!document.querySelector(${JSON.stringify(byId(D))})`, { timeout: 10000 });
  const bA = await boxOf(byId(A)), bC = await boxOf(byId(C)), bD = await boxOf(byId(D));
  check('LAW A ON THE CARD: the lasting 1400 filed before the hold draws NO button now — the reason names 1400 and the 1200 it would stay above, with the row\'s link', !!bA && !bA.go && bA.press === 'raise-over-hold' && gateOf(/1400/.test(bA.why)) && verdictOf(/1200/.test(bA.why)), bA);
  await shotOf('zh-held-case-lasting-over-before', byId(A));
  check('a lasting 1000 on the held row: ONE button «改为 1000 …» and the held line says the hold ends', !!bC && !!bC.go && gateOf(/改为/.test(bC.go.words)) && gateOf(/1000/.test(bC.go.words)) && verdictOf(/1200/.test(bC.held)), bC);
  await shotOf('zh-held-case-lasting-under-before', byId(C));
  check('a timed 2000 on the held row: the raise button, and the held line says it still goes back to 1200', !!bD && !!bD.go && gateOf(/2000/.test(bD.go.words)) && verdictOf(/1200/.test(bD.held)), bD);
  await shotOf('zh-held-case-timed', byId(D));
  const bytesH = settingsBytes();
  check('LAW B: the owner types 1300 into the held row (the owner\'s page writes it)', (await ownerPatch({ [DAY]: 1300 })).status === 200 && stored()[DAY] === 1300);
  check('…the hold ENDS where the write lands — the hub keeps none, every page is told', !!(await until(`fetch('/api/setting-holds').then((r) => r.json()).then((j) => j.holds.length === 0)`, { timeout: 8000 })));
  check('…no return can write over it: the settings file holds the hand\'s 1300', stored()[DAY] === 1300 && !sameBytes(bytesH, settingsBytes()));
  const bD2 = await boxWhen(byId(D), (b) => !b.held, 'the held line never went');
  check('LAW C ON THE CARD: no held line any more; the timed 2000 now goes back to the hand\'s 1300 — never «then 1200»' + never(bD2), !!bD2 && !bD2.held && gateOf(/1300/.test(bD2.text)) && !/之后回到 1200/.test(bD2.text), bD2 && bD2.text);
  await shotOf('zh-held-case-after-hand-change', byId(D));
  await evalJs(`app.openSettingAt(${JSON.stringify(DAY)}); true`);
  await until(`!!document.querySelector('.settings-row[data-path="${DAY}"]')`, { timeout: 10000 }); await sleep(400);
  check('LAW C IN SETTINGS: after the hand change the row draws no held line and no «End now»', (await evalJs(`!document.querySelector('.settings-row[data-path="${DAY}"] .settings-row-held') && !document.querySelector('.settings-row[data-path="${DAY}"] .settings-held-end')`)) === true);
  await shotOf('zh-settings-row-after-hand-change', `.settings-row[data-path="${DAY}"]`);

  console.log('⑧ the phone (390 px): the sheet\'s box, a tap');
  const d = await ask(['Raise the hourly ceiling for this run?', '--propose', `${HOUR}=60`, '--until', '90m'], TOKEN);
  check('a raise for 90 min is filed', d.code === 0, d.out);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36', platform: 'Linux armv8l' });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp('Page.reload');
  check('the phone page loads', !!(await until(`!!(window.app && app.isMobile)`, { timeout: 40000 })));
  await until(`!document.getElementById('loading-screen')`, { timeout: 30000 });
  await openTray();
  check('the phone\'s sheet draws the box', !!(await until(`!!document.querySelector(${JSON.stringify(box(HOUR))})`, { timeout: 10000 })));
  check('a tap opens THAT row (the phone draws a row on one line until tapped)', (await press(`#user-todos-popup .ut-item:has(.ut-setting-change[data-key="${HOUR}"]) .ut-body`, { touch: true })) === true);
  const b4 = await boxOf(box(HOUR));
  check('…its button whole and on the phone\'s screen', !!b4 && !!b4.go && gateOf(b4.go.whole) && verdictOf(b4.go.inside), b4);
  await shot('zh-phone-sheet');
  await sleep(900);   // press-arm
  check('a tap on the button', (await press(`${box(HOUR)} .ut-setting-go`, { touch: true })) === true);
  const v4 = await (async () => { for (let i = 0; i < 40; i++) { if (stored()[HOUR] === 60) break; await sleep(150); } return stored()[HOUR]; })();
  const h4 = await holdsNow();
  check('the row holds 60; a hold returning to the default (30) in 90 min', v4 === 60 && h4.length === 1 && h4[0].key === HOUR && h4[0].before === null, { v4, h4 });
  await evalJs(`app.openSettingAt(${JSON.stringify(HOUR)}); true`);
  check('the phone\'s Settings row says the hold with «End now»', !!(await until(`!!document.querySelector('.settings-row[data-path="${HOUR}"] .settings-held-end')`, { timeout: 10000 })));
  // the picture: the tray sheet closed and the press's toast dismissed, the held row in view (no press — a tidy frame)
  await evalJs(`(() => { const p = document.getElementById('user-todos-popup'); if (p && !p.classList.contains('hidden')) document.getElementById('taskbar-user-todos').click(); for (const x of document.querySelectorAll('.global-toast-x')) x.click(); const r = document.querySelector('.settings-row[data-path="${HOUR}"] .settings-row-held'); if (r) r.scrollIntoView({ block: 'center' }); return true; })()`);
  await sleep(500);
  await shot('zh-phone-settings-held');
} catch (e) { failed++; console.error('  ✗ threw:', e && e.stack || e); }
console.log(failed ? `✗ test-setting-propose-chrome: ${passed} passed, ${failed} failed` : `ALL PASS (${passed})`);
cleanup();
process.exit(failed ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
