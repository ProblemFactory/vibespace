#!/usr/bin/env node
// AGENT FEEDBACK — THE OWNER'S SHEET in a real Chrome (lane agent-feedback, the owner 2026-10-18: "当然也要在界面里有一个
// 地方能让我看到这些被 report 的结果"). HEAVY: a scratch server (its own data/, HOME, XDG root, a fake claude) seeded with
// three reports, headless Chrome over raw CDP with TWO clients (two tabs) of the same instance, and the REAL CLI run with a
// real session's token.
//   ① ⚙ System ▸ "Agent feedback…" sits right after Diagnostics report… and wears the OPEN count (2 — the handled one
//      is not counted); a click opens the sheet (createModalShell, data-popover): the Open filter's rows newest first,
//      the conversation + its Task Group, the kind / about chips, ×3 on the repeated one
//   ② THE XSS PLANT: a report whose text is `<img src=x onerror=…>` and whose about is `<b>…</b>` is drawn as TEXT —
//      no <img>, no <b> in the sheet, the onerror never ran
//   ③ a long text is two lines until a click opens the rest
//   ④ Mark handled on client A: the row leaves A's Open list at once (the answer applied, never the echo awaited), the
//      tabs recount; client B's sheet drops it LIVE (the `feedback` StateSync store); the server says handled
//   ⑤ a NEW report from an agent (a real session created over the WebSocket, the real data/bin/vibespace-feedback with its
//      token) lands on top of BOTH open sheets live, named by the session; the Handled filter shows the handled one
//      with Reopen; Esc closes the sheet; the gear row's count follows (2)
//   ⑥ zh: 系统 ▸ 「Agent 反馈…」 and the sheet's words; PNGs of the gear row and the sheet (VS_UI_SHOTS_DIR keeps them)
// Run: node scripts/test-feedback-ui.mjs   (SKIPs without chrome)
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { scratch, freePorts, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
const require = createRequire(import.meta.url);
const WebSocket = require('ws');
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }

let pass = 0, fail = 0;
const ok = (c, m, e) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (e !== undefined ? '\n    ' + String(typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 700) : '')); } return !!c; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000, step = 50) => { const t0 = Date.now(); for (;;) { let v = null; try { v = await fn(); } catch { } if (v) return v; if (Date.now() - t0 > ms) return v; await sleep(step); } };

const ROOT = scratch('feedback-ui');
const INST = path.join(ROOT, 'i'), HOME = path.join(ROOT, 'h'), XDG = path.join(ROOT, 'x'), BIN = path.join(ROOT, 'b'), ENVS = path.join(ROOT, 'e'), CWD = path.join(ROOT, 'c'), PROFILE = path.join(ROOT, 'p');
const SHOTS = process.env.VS_UI_SHOTS_DIR || scratch('feedback-ui-shots');
for (const d of [INST, HOME, BIN, ENVS, CWD, PROFILE, SHOTS, path.join(INST, 'data')]) fs.mkdirSync(d, { recursive: true });
fs.mkdirSync(XDG, { recursive: true, mode: 0o700 });
const procs = new Set();
const cleanup = () => { for (const p of [...procs].reverse()) { try { p.kill('SIGKILL'); } catch { } } try { endRootedProcesses(ROOT); } catch { } };
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });

// ── the instance: the tree as it is, its own data/ seeded with three reports ──
for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin']) fs.cpSync(path.join(REPO, f), path.join(INST, f), { recursive: true });
fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(INST, 'node_modules'));
const NOW = Date.now();
const XSS = '<img src=x onerror="window.__xss = 1">the sheet must show this as text';
const LONG = ['line one of a long report: vibespace-task backlog-add said "parked" for an item it never stored', 'line two: the For you tray showed the old count until a reload', 'line three: the manual never says --group is needed with two groups', 'line four: the end'].join('\n');
const seed = (id, o) => ({ id, at: o.at, lastAt: o.lastAt || o.at, text: o.text, about: o.about || '', kind: o.kind || 'other', session: { id: 'cid-' + id, name: o.name }, group: o.group || null, harness: 'claude', instance: { name: 'box', version: '2.369.301' }, status: o.status || 'open', handledAt: o.status === 'handled' ? o.at + 1 : null, handledBy: o.status === 'handled' ? 'owner' : null, count: o.count || 1, reporters: ['cid-' + id] });
fs.writeFileSync(path.join(INST, 'data', 'feedback.json'), JSON.stringify({ v: 1, dropped: 0, syncVersion: 0, records: [
  seed('fb-0000000001', { at: NOW - 3 * 3600e3, lastAt: NOW - 600e3, text: LONG, about: 'vibespace-task', kind: 'cli', name: 'lane alpha', group: { id: 'T-1', name: 'VibeSpace 车道' }, count: 3 }),
  seed('fb-0000000002', { at: NOW - 2 * 3600e3, text: 'the phone sheet hides the Send button behind the keyboard', kind: 'ui', name: 'lane beta', status: 'handled' }),
  seed('fb-0000000003', { at: NOW - 60e3, text: XSS, about: '<b>bold</b>', kind: 'docs', name: 'lane gamma' }),
] }));
// a fake claude: dumps the spawn env (the session token) and idles — the chat session stays live
const SID = '00000000-0000-4000-8000-0000000fb001';
const hook = JSON.stringify({ type: 'system', subtype: 'hook_started', session_id: SID, hook_name: 'SessionStart' });
const init = JSON.stringify({ type: 'system', subtype: 'init', session_id: SID, cwd: CWD, model: 'claude-fable-5', apiKeySource: 'none', tools: [], mcp_servers: [] });
fs.writeFileSync(path.join(BIN, 'claude'), `#!/bin/sh\ncase " $* " in *" --output-format "*) env > "${ENVS}/$$.env"; sleep 1; printf '%s\\n%s\\n' '${hook}' '${init}'; exec cat > "${ENVS}/$$.stdin";; esac\necho '2.1.281 (Claude Code)'\n`, { mode: 0o755 });
fs.symlinkSync(process.execPath, path.join(BIN, 'node'));

const [PORT, CDP] = await freePorts(2);
const env = {}; for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('AGENT_BROWSER_') && !k.startsWith('VIBESPACE_') && !['WAYLAND_DISPLAY', 'DISPLAY', 'XDG_RUNTIME_DIR'].includes(k)) env[k] = v;
Object.assign(env, { PATH: `${BIN}:/usr/bin:/bin`, CLAUDE_CMD: path.join(BIN, 'claude'), HOME, XDG_RUNTIME_DIR: XDG, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', DBUS_SESSION_BUS_ADDRESS: 'disabled:' });
let journal = '';
const srv = spawn(process.execPath, ['server.js'], { cwd: INST, env: { ...env, ...(await vncEnv()), PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
procs.add(srv);
srv.stdout.on('data', (d) => { journal += d; }); srv.stderr.on('data', (d) => { journal += d; });
const BASE = `http://127.0.0.1:${PORT}`;
if (!ok(await until(() => journal.includes('Ready.'), 60000, 100), 'the scratch server booted (its own data/ with three seeded reports)', journal.slice(-800))) process.exit(1);

// ── Chrome: one browser, two page targets (client A, client B) ──
const REAL_MOUSE = '--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4';
const ch = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1280,800', REAL_MOUSE,
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--lang=en-US', `--user-data-dir=${PROFILE}`, 'about:blank'], { stdio: 'ignore' });
procs.add(ch);
await until(async () => (await fetch(`http://127.0.0.1:${CDP}/json/version`)).ok, 20000, 100);
// each client in its OWN window (a background tab runs no animation frame: its popover never opens)
const bver = await (await fetch(`http://127.0.0.1:${CDP}/json/version`)).json();
const bws = new WebSocket(bver.webSocketDebuggerUrl); await new Promise((r, e) => { bws.on('open', r); bws.on('error', e); });
let bseq = 0; const bpend = new Map(); bws.on('message', (d) => { const m = JSON.parse(d); if (m.id && bpend.has(m.id)) { bpend.get(m.id)(m); bpend.delete(m.id); } });
const bcall = (method, params = {}) => new Promise((r) => { const i = ++bseq; bpend.set(i, r); bws.send(JSON.stringify({ id: i, method, params })); });
async function page(name, { lang = null } = {}) {
  const made = await bcall('Target.createTarget', { url: 'about:blank', newWindow: true });
  const targetId = made.result && made.result.targetId;
  const t = await until(async () => (await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json()).find((x) => x.id === targetId), 5000);
  const ws = new WebSocket(t.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r, e) => { ws.on('open', r); ws.on('error', e); });
  let seq = 0; const pend = new Map();
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); ws.send(JSON.stringify({ id, method, params })); });
  const js = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; };
  const center = async (sel) => { const r = await js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`); if (!r) throw new Error(name + ': no element ' + sel); return r; };
  const click = async (sel) => { const c = await center(sel); await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c.x, y: c.y }); await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', buttons: 1, clickCount: 1 }); await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: c.y, button: 'left', buttons: 0, clickCount: 1 }); await sleep(120); };
  const hover = async (sel) => { const c = await center(sel); await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c.x, y: c.y }); };
  const key = async (k, code) => { await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k, windowsVirtualKeyCode: code }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: code }); await sleep(100); };
  const shot = async (file) => { const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, file), Buffer.from(r.data, 'base64')); };
  await cdp('Page.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  if (lang) await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('vibespace.lang', ${JSON.stringify(lang)}); } catch {}` });
  await cdp('Page.navigate', { url: BASE + '/' });
  await js('new Promise((res, rej) => { const t0 = Date.now(); (function w() { if (window.app) return res(app.ready); if (Date.now() - t0 > 30000) return rej(new Error("no app after 30s")); setTimeout(w, 200); })(); })');
  return { name, cdp, js, click, hover, key, shot, front: () => cdp('Page.bringToFront'), close: () => ws.close() };
}
const POP = '.global-settings-popover';
const SYS_ROWS = `[...document.querySelectorAll('${POP} [data-id="system"] .gs-flyout .gs-menu-item')].map((x) => x.textContent.trim())`;
async function openSystem(P) {
  await P.front();
  await P.js(`document.querySelector('${POP}')?.remove(); document.getElementById('btn-global-settings').click(); true`);
  await until(() => P.js(`!!document.querySelector('${POP} .gs-menu')`), 3000);
  await P.click(`${POP} .gs-menu > .gs-menu-item[data-id="system"]`);
  return until(() => P.js(`(() => { const h = document.querySelector('${POP} .gs-menu-item[data-id="system"]'); return !!h && h.getAttribute('aria-expanded') === 'true'; })()`), 3000);
}
const ROW_TEXTS = `[...document.querySelectorAll('#feedback-sheet .fb-row')].map((r) => ({ id: r.dataset.id, status: r.dataset.status, text: r.querySelector('.fb-text').textContent, who: r.querySelector('.fb-who').textContent, group: r.querySelector('.fb-group')?.textContent || null, chips: [...r.querySelectorAll('.fb-chip')].map((c) => c.textContent), count: r.querySelector('.fb-count')?.textContent || null, act: r.querySelector('.fb-act').textContent }))`;
const TABS = `[...document.querySelectorAll('#feedback-sheet .fb-tab')].map((b) => b.textContent + (b.classList.contains('active') ? '*' : '')).join(' | ')`;

let A, B;
try {
  A = await page('A'); B = await page('B');
  console.log('— ① the gear row and the sheet (client A)');
  ok(await openSystem(A), '(setup) ⚙ → System ▸ opens its flyout');
  const sys = await A.js(SYS_ROWS);
  const iFb = sys.findIndex((t) => /^Agent feedback…/.test(t));
  ok(iFb > 0 && /^Diagnostics report…/.test(sys[iFb - 1]), `System holds "Agent feedback…" right after Diagnostics report… (${sys.join(' / ')})`);
  const count = await until(() => A.js(`(() => { const n = document.querySelector('${POP} [data-id="agent-feedback"] .gs-count'); return n && n.textContent; })()`), 4000);
  ok(count === '2', `…wearing the OPEN count: 2 (three reports, one handled) — got ${JSON.stringify(count)}`);
  ok(await A.js(`!!document.querySelector('${POP} [data-id="agent-feedback"] .gs-menu-icon svg')`), '…with an SVG icon like its neighbours');
  await A.shot('gear-system-agent-feedback.png');
  await A.click(`${POP} [data-id="agent-feedback"]`);
  const opened = await until(() => A.js(`document.querySelectorAll('#feedback-sheet .fb-row').length === 2 && !document.querySelector('${POP}')`), 5000);
  ok(opened, 'a click closes the popover and opens the sheet with the 2 OPEN reports');
  ok(await A.js(`document.querySelector('#feedback-sheet').dataset.popover === '1' && !!document.querySelector('#feedback-sheet .dialog.fb-dialog .dialog-header h3') && document.querySelector('#feedback-sheet .dialog-header h3').textContent === 'Agent feedback'`), 'a createModalShell sheet titled "Agent feedback", marked data-popover');
  let rows = await A.js(ROW_TEXTS);
  ok(rows.map((r) => r.id).join(' ') === 'fb-0000000003 fb-0000000001', `newest REPORT first: the plant (1 min ago), then alpha's (last repeated 10 min ago) — ${rows.map((r) => r.id).join(' ')}`);
  const alpha = rows.find((r) => r.id === 'fb-0000000001');
  ok(alpha && alpha.who === 'lane alpha' && alpha.group === 'VibeSpace 车道' && alpha.chips.join(',') === 'cli,vibespace-task' && alpha.count === '×3' && alpha.act === 'Mark handled', `a row: the conversation, its Task Group, kind / about chips, ×3, Mark handled (${JSON.stringify(alpha)})`);
  ok(await A.js(TABS) === 'Open (2)* | Handled (1) | All (3)', `the filter: ${await A.js(TABS)}`);

  console.log('— ② the XSS plant is text');
  const plant = rows.find((r) => r.id === 'fb-0000000003');
  await sleep(300);
  ok(plant && plant.text === XSS && plant.chips.join(',') === 'docs,<b>bold</b>', 'the text and the about chip read back exactly as the agent typed them');
  ok(await A.js(`!document.querySelector('#feedback-sheet img') && !document.querySelector('#feedback-sheet b') && window.__xss === undefined`), 'no <img>, no <b> in the sheet; the onerror never ran (window.__xss undefined)');

  console.log('— ③ two lines until a click');
  const h0 = await A.js(`document.querySelector('#feedback-sheet .fb-row[data-id="fb-0000000001"] .fb-text').getBoundingClientRect().height`);
  await A.click('#feedback-sheet .fb-row[data-id="fb-0000000001"] .fb-text');
  const h1 = await A.js(`document.querySelector('#feedback-sheet .fb-row[data-id="fb-0000000001"] .fb-text').getBoundingClientRect().height`);
  ok(h1 > h0 * 1.8 && await A.js(`document.querySelector('#feedback-sheet .fb-row[data-id="fb-0000000001"]').classList.contains('fb-open')`), `a long report is two lines (${Math.round(h0)} px) until a click opens all four (${Math.round(h1)} px)`);
  await A.shot('sheet-open-filter.png');

  console.log('— ④ Mark handled on A; B sees it live');
  await B.front();
  await B.js(`document.querySelector('${POP}')?.remove(); document.getElementById('btn-global-settings').click(); true`);
  await until(() => B.js(`!!document.querySelector('${POP} [data-id="agent-feedback"]')`), 3000);
  await B.js(`document.querySelector('${POP} [data-id="agent-feedback"]').click(); true`);
  ok(await until(() => B.js(`document.querySelectorAll('#feedback-sheet .fb-row').length === 2`), 5000), '(setup) client B has the sheet open too (2 open rows)');
  await A.front();
  await A.click('#feedback-sheet .fb-row[data-id="fb-0000000001"] .fb-act');
  const goneA = await until(() => A.js(`!document.querySelector('#feedback-sheet .fb-row[data-id="fb-0000000001"]')`), 3000);
  ok(goneA && await A.js(TABS) === 'Open (1)* | Handled (2) | All (3)', `A: the row leaves the Open list, the tabs recount (${await A.js(TABS)})`);
  const t0 = Date.now();
  const goneB = await until(() => B.js(`!document.querySelector('#feedback-sheet .fb-row[data-id="fb-0000000001"]')`), 5000);
  ok(goneB, `B: the same row leaves B's Open list LIVE (${Date.now() - t0} ms after A's answer)`);
  const server = await (await fetch(BASE + '/api/feedback')).json();
  ok(server.reports.find((r) => r.id === 'fb-0000000001').status === 'handled' && server.open === 1, 'the server says handled (open 1)');

  console.log('— ⑤ a new report from a real agent session lands on both sheets');
  const wsMain = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  const msgs = []; wsMain.on('message', (d) => { try { msgs.push(JSON.parse(d)); } catch { } });
  await new Promise((r, e) => { wsMain.on('open', r); wsMain.on('error', e); });
  wsMain.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: CWD, cols: 80, rows: 24, reqId: 'r-fb', sessionName: 'fb-agent' }));
  const envFile = await until(() => fs.readdirSync(ENVS).find((f) => f.endsWith('.env') && /^VIBESPACE_SESSION_TOKEN=vsst_/m.test(fs.readFileSync(path.join(ENVS, f), 'utf8'))), 30000, 100);
  ok(!!envFile, '(setup) a chat session was created; its spawn env carries VIBESPACE_API + a vsst_ token');
  const senv = {}; for (const line of fs.readFileSync(path.join(ENVS, envFile), 'utf8').split('\n')) { const i = line.indexOf('='); if (i > 0) senv[line.slice(0, i)] = line.slice(i + 1); }
  const NEW = 'vibespace-feedback itself: the For you tray is called the inbox in one manual line';
  const cli = await new Promise((resolve) => execFile(process.execPath, [path.join(INST, 'data/bin/vibespace-feedback'), NEW, '--about', 'vibespace-ask', '--kind', 'docs'], { env: { PATH: env.PATH, VIBESPACE_API: senv.VIBESPACE_API, VIBESPACE_SESSION_TOKEN: senv.VIBESPACE_SESSION_TOKEN }, timeout: 20000 }, (err, out, e) => resolve({ code: err ? err.code : 0, out, err: e })));
  ok(cli.code === 0 && /sent to the maintainers \(fb-[0-9a-f]{10}\)/.test(cli.out), `the REAL CLI with that session's token files it (${cli.out.trim().split('\n')[0]})`, cli);
  const newId = (/\((fb-[0-9a-f]{10})\)/.exec(cli.out) || [])[1];
  const t1 = Date.now();
  const onA = await until(() => A.js(`(() => { const r = document.querySelector('#feedback-sheet .fb-list .fb-row'); return r && r.dataset.id === ${JSON.stringify(newId)} ? r.querySelector('.fb-who').textContent : null; })()`), 6000);
  const onB = await until(() => B.js(`(() => { const r = document.querySelector('#feedback-sheet .fb-list .fb-row'); return r && r.dataset.id === ${JSON.stringify(newId)} ? r.querySelector('.fb-text').textContent : null; })()`), 6000);
  ok(onA === 'fb-agent' && onB === NEW, `it lands on TOP of both open sheets live, named by the session (${Date.now() - t1} ms; A "${onA}", B "${onB && onB.slice(0, 40)}…")`);
  ok(await A.js(TABS) === 'Open (2)* | Handled (2) | All (4)' && await B.js(TABS) === 'Open (2)* | Handled (2) | All (4)', `both recount: ${await A.js(TABS)}`);
  await A.click('#feedback-sheet .fb-tab[data-filter="handled"]');
  rows = await A.js(ROW_TEXTS);
  ok(rows.length === 2 && rows.every((r) => r.status === 'handled' && r.act === 'Reopen') && rows[0].id === 'fb-0000000001', `the Handled filter: the two handled, each with Reopen (${rows.map((r) => r.id).join(' ')})`);
  await A.shot('sheet-handled-filter.png');
  await A.click('#feedback-sheet .fb-tab[data-filter="all"]');
  ok((await A.js(ROW_TEXTS)).length === 4, 'All: four rows');
  await A.click('#feedback-sheet .fb-tab[data-filter="open"]');
  await A.shot('sheet-live-new-report.png');
  await A.key('Escape', 27);
  ok(await until(() => A.js(`!document.querySelector('#feedback-sheet')`), 2000), 'Esc closes the sheet');
  ok(await openSystem(A), '(setup) System ▸ again');
  ok(await until(() => A.js(`document.querySelector('${POP} [data-id="agent-feedback"] .gs-count')?.textContent === '2'`), 3000), 'the gear row\'s count follows: 2 open');
  wsMain.close();

  console.log('— ⑥ zh');
  const Z = await page('Z', { lang: 'zh' });
  ok(await openSystem(Z), '(setup) ⚙ → 系统 ▸');
  const zsys = await Z.js(SYS_ROWS);
  ok(zsys.some((t) => /^Agent 反馈…2$/.test(t)), `系统 holds 「Agent 反馈…」 with its count (${zsys.join(' / ')})`);
  await Z.shot('zh-gear-system-agent-feedback.png');
  await Z.click(`${POP} [data-id="agent-feedback"]`);
  await until(() => Z.js(`document.querySelectorAll('#feedback-sheet .fb-row').length === 2`), 5000);
  ok(await Z.js(`document.querySelector('#feedback-sheet .dialog-header h3').textContent === 'Agent 反馈' && /未处理（2）/.test(document.querySelector('#feedback-sheet .fb-tab').textContent) && document.querySelector('#feedback-sheet .fb-act').textContent === '已处理'`), 'the sheet in zh: 「Agent 反馈」, 未处理（2）, 已处理');
  await Z.shot('zh-sheet.png');
  Z.close();
} catch (e) {
  ok(false, 'the suite ran to its end', e && e.stack);
} finally {
  try { A && A.close(); B && B.close(); bws.close(); } catch { }
}
console.log(`  (PNGs: ${SHOTS})`);
console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
