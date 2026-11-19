#!/usr/bin/env node
// test-may-use-chrome.mjs — unit «what it may use» (the owner, 2026-11-17: «话说现在似乎没办法根据对话看到它到底有什么channel之类的
// 权限？»), IN A REAL PAGE: a throwaway hub (THE boot helper — scripts/hub-boot.mjs), headless Chrome (raw CDP, no keyring:
// --password-store=basic, the session bus dropped), a LIVE claude conversation behind the real wrapper (a stub CLI), the fake
// channel accounts (VIBESPACE_CHANNELS_FAKE=1). The fast twin is scripts/test-may-use.mjs (the doors, the cost, the route).
//   ① the conversation's card menu has «What it may use…»; it opens Session Properties AT that section (scrolled into view)
//   ② the section in THE OWNER'S ORDER (sessions, channels first among the resources, browser, vault, keys, exits, windows, the
//      built-ins last); its Task Group named; an account the group grants ticked and LOCKED, «through Task Group …»
//   ③ the channel tick is the form's own: ticking an account writes THIS conversation's access row (the same PUT the New
//      Session form writes — read back from the hub), unticking takes it back
//   ④ LIVE: a grant changed elsewhere (every agent given a third account, through the API) redraws the section — no reopen
//   ⑤ ITS OWN CONTAINER decides: the form's accordion below 400 px, the cards above — at 280 / 360 / 440 / 900 / 1440 px the
//      section never overflows its window; no greyed control except the locked ticks a Task Group gives
//   ⑥ every name escaped: a Task Group titled with markup is drawn as text
//   ⑦ the route refuses an agent's own session token (human_only) — the real hub, the stub's own vsst_
// Heavy (a hub + a browser). Written and READ by the lane; run by the integrator at lining (the train's heavy pre-check).
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, ONBOARDED_SOURCE, vncEnv, withoutVendorKeys } from './scratch.mjs';
import { mintRoot, startHub } from './hub-boot.mjs';

const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
const VNC_ENV = await vncEnv();
const [PORT, CDP_PORT] = await freePorts(2);
const BASE = `http://127.0.0.1:${PORT}`;
const root = mintRoot('may-use-chrome');
const wt = path.join(root, 't'), fakeHome = path.join(root, 'home'), stubDir = path.join(root, 'stub'), CWD = path.join(root, 'cwd'), chromeDir = path.join(root, 'chrome');
const SHOTS = process.env.MU_SHOTS ? path.resolve(process.env.MU_SHOTS) : '';
for (const d of [fakeHome, stubDir, CWD, chromeDir, ...(SHOTS ? [SHOTS] : [])]) fs.mkdirSync(d, { recursive: true });
let failed = 0, passed = 0;
const check = (n, c, e) => { if (typeof n !== 'string') throw new TypeError(`check(name, cond): the name is a ${typeof n} — the arguments are swapped`); if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LIVE_SID = crypto.randomUUID();

// ── the hub: the committed tree + this tree's src / public / data/bin, in the helper's root ──
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
execSync(`rm -rf ${wt}/data/bin && mkdir -p ${wt}/data && cp -r ${repo}/data/bin ${wt}/data/bin`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
const stubPath = path.join(stubDir, 'claude');
fs.writeFileSync(stubPath, `#!${process.execPath}
const fs = require('fs');
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('2.1.274 (Claude Code) stub'); process.exit(0); }
if (args.includes('--help')) { console.log('Usage: claude [options]'); process.exit(0); }
fs.writeFileSync(${JSON.stringify(stubDir)} + '/env-' + process.pid + '.json', JSON.stringify(process.env));
process.stdout.write(JSON.stringify({ type: 'system', subtype: 'init', session_id: ${JSON.stringify(LIVE_SID)}, model: 'claude-fable-5', cwd: ${JSON.stringify(CWD)}, tools: [], permissionMode: 'default', claude_code_version: '2.1.274' }) + '\\n');
process.stdin.on('data', () => {});
process.stdin.on('end', () => process.exit(0));
`, { mode: 0o755 });
const hub = startHub({ root, tree: wt, port: PORT, env: { ...withoutVendorKeys(process.env), ...VNC_ENV, HOME: fakeHome, CLAUDE_CMD: stubPath, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', VIBESPACE_CHANNELS_FAKE: '1' } });
const booted = await hub.ready();
check(`the hub answered within the boot budget (${booted ? 'yes' : 'NO'})`, booted);
if (!booted) { console.log(hub.log().slice(-2000)); console.log('FAILED'); process.exit(1); }
// the suite's own Chrome: no keyring (--password-store=basic), no session bus (a locked keyring hangs a headless navigation)
const { DBUS_SESSION_BUS_ADDRESS: _bus, ...chromeEnv } = process.env;
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--password-store=basic', '--disable-background-timer-throttling', '--window-size=1600,1000', `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore', env: chromeEnv });
process.on('exit', () => { try { chrome.kill('SIGKILL'); } catch { } });   // the helper leaves a suite's own Chrome alone (it is not rooted by HOME)

// ── raw CDP ──
const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 120 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((x) => x.type === 'page'); } catch { } if (!target) await sleep(250); }
if (!target) { console.error('✗ chrome never exposed a CDP page target'); process.exit(1); }
const sock = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => sock.on('open', r));
let seq = 0; const pend = new Map();
sock.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); sock.send(JSON.stringify({ id, method, params })); });
const evalJs = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; };
const until = async (expr, ms = 15000) => { const t0 = Date.now(); let v = null; while (Date.now() - t0 < ms) { try { v = await evalJs(expr); } catch { v = null; } if (v) return v; await sleep(150); } return v; };
const j = async (method, p, body, headers = {}) => { const r = await fetch(BASE + p, { method, headers: { 'Content-Type': 'application/json', ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) }); let json = null; try { json = await r.json(); } catch { } return { status: r.status, json }; };
const shot = async (name) => { if (!SHOTS) return; const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, name), Buffer.from(r.data, 'base64')); };
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
await cdp('Page.navigate', { url: `${BASE}/` });
check('the page booted', !!(await until(`!!(window.app && window.app.ready)`, 30000)) && (await evalJs('app.ready.then(() => true)')) && !!(await until(`!document.getElementById('loading-screen')`, 30000)));

console.log('— a LIVE conversation (the stub CLI behind the real wrapper), a Task Group, three fake channel accounts');
const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
await new Promise((r) => ws.on('open', r));
const frames = [];
ws.on('message', (d) => { try { frames.push(JSON.parse(String(d))); } catch { } });
ws.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: CWD, reqId: 'mu1' }));
let wid = null;
for (let i = 0; i < 80 && !wid; i++) { const f = frames.find((m) => m && m.type === 'created'); if (f) wid = f.sessionId; else await sleep(250); }
let token = null;
for (let i = 0; i < 80 && !token; i++) { for (const f of fs.readdirSync(stubDir).filter((x) => x.startsWith('env-'))) { try { const e = JSON.parse(fs.readFileSync(path.join(stubDir, f), 'utf8')); if (e.VIBESPACE_SESSION_TOKEN) token = e.VIBESPACE_SESSION_TOKEN; } catch { } } if (!token) await sleep(250); }
const KEY = `claude:${LIVE_SID}`;
const knows = await until(`!!(app.sidebar?._allSessions || []).find((s) => s.webuiId === ${JSON.stringify(wid)} && (s.backendSessionId === ${JSON.stringify(LIVE_SID)} || s.claudeSessionId === ${JSON.stringify(LIVE_SID)}))`, 30000);
check('a live claude conversation, its own id known to the page, its own vsst_ in its env', !!wid && !!knows && !!token && token.startsWith('vsst_'), { wid, knows, token: !!token });
const TITLE = 'Ledger <b>lane</b>';
const tk = await j('POST', '/api/tasks', { title: TITLE });
const TID = tk.json && (tk.json.id || (tk.json.task && tk.json.task.id));
const bd = TID ? await j('POST', `/api/tasks/${encodeURIComponent(TID)}/bind`, { sessionKey: KEY }) : { status: 0 };
const accts = await j('GET', '/api/channels?scope=accounts');
const ACC = ((accts.json && accts.json.adapters) || []).filter((a) => a && a.id && !a.builtin && a.listed !== false && (a.reach || 'grants') === 'grants');
check('a Task Group (titled with markup) holds the conversation; three fake channel accounts to judge', !!TID && bd.status === 200 && ACC.length >= 3, { TID, bind: bd.status, accounts: ACC.map((a) => a.id) });
const [A1, A2, A3] = ACC;
// the hosted run (主开发 00:53Z): a fresh stand-in account sends under REVIEW, where a Task Group's «send» is capped (409
// authority-capped, rightly) — the account's own policy route sets direct first, as the owner's Edit dialog would
const pol = await j('PUT', `/api/channels/adapters/${encodeURIComponent(A1.id)}`, { policy: 'direct' });
check(`«${A1.label}»'s sending policy set to direct through the account's own route (under review a group's «send» is capped)`, pol.status === 200, pol);
const g1 = await j('PUT', `/api/channels/adapters/${encodeURIComponent(A1.id)}/access`, { access: [{ principal: { kind: 'group', id: TID }, authority: 'send' }] });
check(`«${A1.label}» shared with the Task Group (can send) through the account's own access route`, g1.status === 200, g1);

console.log('— ① the card menu\'s «What it may use…» opens Properties AT the section');
const menu = await until(`(() => { const c = [...document.querySelectorAll('.session-item-card')].find((x) => x._webuiId === ${JSON.stringify(wid)}); if (!c) return null; c.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 200 })); const m = document.querySelector('.context-menu'); return m ? [...m.children].map((e) => (e.textContent || '').trim()).filter(Boolean) : null; })()`, 15000);
check('the conversation\'s menu lists «What it may use…» right after «Properties…»', Array.isArray(menu) && menu.indexOf('What it may use…') === menu.indexOf('Properties…') + 1, menu);
await evalJs(`(() => { const m = document.querySelector('.context-menu'); const it = m && [...m.children].find((e) => (e.textContent || '').trim() === 'What it may use…'); if (it) it.click(); return !!it; })()`);
const SEC = '.session-props-may-use .mu-section';
const drawn = await until(`!!document.querySelector(${JSON.stringify(SEC + ' [data-row="chan"]')})`, 20000);
const SCROLL = `(() => { const s = document.querySelector('.session-props-may-use'); const b = s && s.closest('.task-detail-body'); if (!s || !b) return null; const top = s.getBoundingClientRect().top - b.getBoundingClientRect().top; return { top: Math.round(top), scrollTop: Math.round(b.scrollTop) }; })()`;
// WAIT for the scroll to land (the hosted run measured once, before the frame: top 795, scrollTop 0), never one reading
const scrolled = (await until(`(() => { const m = ${SCROLL}; return m && m.top >= -2 && m.top <= 40 && m.scrollTop > 0 ? m : null; })()`, 10000)) || (await evalJs(SCROLL));
check('Properties opened with «What it may use» drawn and SCROLLED INTO VIEW (the section at the body\'s top)', !!drawn && scrolled && scrolled.top >= -2 && scrolled.top <= 40 && scrolled.scrollTop > 0, scrolled);
await shot('may-use-440.png');

console.log('— ② the owner\'s order; the Task Group named; a group grant ticked and locked');
// the order is read on the CARDS: Properties opens 440 px wide, where the section (~399 px) is the accordion — the hosted run
// read only ["builtins"]. Give the window its width and wait on the section's own shape, then back to 440 for ③ and ④
const SHAPE = `(() => { const s = document.querySelector(${JSON.stringify(SEC)}); if (!s) return null; return { w: Math.round(s.getBoundingClientRect().width), acc: !!s.querySelector('.ns-res-list'), cards: !!s.querySelector('.ns-card[data-card="vibespace"]') }; })()`;
const sizeTo = async (W) => { const id = await evalJs(`(() => { for (const [id, w] of app.wm.windows) if (w._sessionPropsKey) return id; return null; })()`); await evalJs(`(() => { const w = app.wm.windows.get(${JSON.stringify(id)}); w.element.style.width = '${W}px'; return true; })()`); return until(`(() => { const m = ${SHAPE}; return !!m && (m.w < 400 ? m.acc && !m.cards : m.cards && !m.acc) ? m : null; })()`, 5000); };
const wide = await sizeTo(900);
const order = await evalJs(`[...document.querySelectorAll(${JSON.stringify(SEC + ' .ns-card[data-card="vibespace"] > [data-row], ' + SEC + ' .ns-card[data-card="vibespace"] > [data-fact], ' + SEC + ' .ns-builtin')})].map((e) => e.classList.contains('ns-builtin') ? 'builtins' : (e.dataset.row || e.dataset.fact))`);
check('the kinds in THE OWNER\'S ORDER: sessions, channels, browser, vault, keys, exits, windows — the built-ins last (read on the cards, the window 900 px)', !!wide && wide.cards && JSON.stringify(order) === JSON.stringify(['sessions', 'chan', 'bprof', 'vault', 'keys', 'exits', 'windows', 'builtins']), { order, shape: wide });
await sizeTo(440);
const g1row = await until(`(() => { const r = document.querySelector(${JSON.stringify(SEC + ' .ns-acc.granted[data-acc-row="' + A1.id + '"]')}); if (!r) return null; const i = r.querySelector('input'); return { checked: i && i.checked, disabled: i && i.disabled, text: r.textContent }; })()`, 15000);
check(`«${A1.label}»: ticked and locked, «through Task Group …» naming the group, can send`, g1row && g1row.checked && g1row.disabled && g1row.text.includes('Through Task Group') && g1row.text.includes(TITLE) && g1row.text.includes('can send'), g1row);
const reach = await evalJs(`(document.querySelector(${JSON.stringify(SEC + ' [data-reach]')}) || {}).textContent || ''`);
check('「会话」 says the group it joined (the form\'s words)', reach.includes('Joined') && reach.includes(TITLE), reach);
console.log('— ⑥ every name escaped');
check('the Task Group titled «Ledger <b>lane</b>» is TEXT — no <b> element inside the section', await evalJs(`!document.querySelector(${JSON.stringify(SEC + ' b b')}) && ![...document.querySelectorAll(${JSON.stringify(SEC + ' b')})].some((e) => e.textContent === 'lane' && e.parentElement && e.parentElement.textContent.includes('Ledger'))`));

console.log('— ③ the tick is the form\'s own: written to the account\'s access record, taken back');
const ownRow = async () => { const v = await j('GET', `/api/channels/adapters/${encodeURIComponent(A2.id)}/view`); const g = v.json && v.json.adapter && v.json.adapter.accountGrain; return !!(g && (g.access || []).some((r) => r && r.principal && r.principal.kind === 'agent' && String(r.principal.id) === LIVE_SID)); };
check(`«${A2.label}» starts not given (tickable)`, !(await ownRow()) && !!(await evalJs(`!!document.querySelector(${JSON.stringify(SEC + ' input[data-acc="' + A2.id + '"]:not(:checked):not([disabled])')})`)));
await evalJs(`(() => { const i = document.querySelector(${JSON.stringify(SEC + ' input[data-acc="' + A2.id + '"]')}); i.click(); return true; })()`);
let wrote = false; for (let i = 0; i < 40 && !wrote; i++) { wrote = await ownRow(); if (!wrote) await sleep(250); }
const onRow = await until(`!!document.querySelector(${JSON.stringify(SEC + ' label.ns-acc.on[data-acc-row="' + A2.id + '"] input:checked')})`, 10000);
check('ticking writes THIS conversation\'s own access row (read back from the hub) and the row redraws ticked', wrote && !!onRow, { wrote, onRow });
await evalJs(`(() => { const i = document.querySelector(${JSON.stringify(SEC + ' input[data-acc="' + A2.id + '"]')}); i.click(); return true; })()`);
let gone = false; for (let i = 0; i < 40 && !gone; i++) { gone = !(await ownRow()); if (!gone) await sleep(250); }
check('unticking takes the row back (the same PUT)', gone);

console.log('— ④ LIVE: a grant changed elsewhere redraws the section, no reopen');
const g3 = await j('PUT', `/api/channels/adapters/${encodeURIComponent(A3.id)}/access`, { access: [{ principal: { kind: 'everyone', id: '*' }, authority: 'draft' }] });
const live3 = await until(`(() => { const r = document.querySelector(${JSON.stringify(SEC + ' .ns-acc.granted[data-acc-row="' + A3.id + '"]')}); return r ? r.textContent : null; })()`, 15000);
check(`«${A3.label}» given to every agent through the API: the open section redraws it ticked and locked, «All agents»`, g3.status === 200 && !!live3 && live3.includes('All agents'), { status: g3.status, live3 });

console.log('— ⑤ its own container decides; bounded at every width; no greyed control with a hint');
const winId = await evalJs(`(() => { for (const [id, w] of app.wm.windows) if (w._sessionPropsKey) return id; return null; })()`);
for (const W of [280, 360, 440, 900, 1440]) {
  await evalJs(`(() => { const w = app.wm.windows.get(${JSON.stringify(winId)}); w.element.style.width = '${W}px'; return true; })()`);
  // wait on the SECTION'S OWN STATE (its shape follows its width — the ResizeObserver's repaint), never a fixed sleep
  const shapeOf = `(() => { const s = document.querySelector(${JSON.stringify(SEC)}); if (!s) return null; return { w: Math.round(s.getBoundingClientRect().width), acc: !!s.querySelector('.ns-res-list'), cards: !!s.querySelector('.ns-card[data-card="vibespace"]'), over: s.scrollWidth - s.clientWidth, greyed: s.querySelectorAll('input[disabled]:not(:checked)').length }; })()`;
  await until(`(() => { const m = ${shapeOf}; return !!m && (m.w < 400 ? m.acc && !m.cards : m.cards && !m.acc); })()`, 5000);
  const m = await evalJs(shapeOf);
  const narrow = m && m.w < 400;
  check(`${W} px window (section ${m && m.w} px): ${narrow ? 'the accordion' : 'the cards'}, nothing overflows, no greyed control`, m && (narrow ? m.acc && !m.cards : m.cards && !m.acc) && m.over <= 1 && m.greyed === 0, m);
  await shot(`may-use-${W}.png`);
}

console.log('— ⑦ the route refuses an agent\'s own token');
const agent = await j('GET', `/api/may-use?key=${encodeURIComponent(KEY)}`, null, { Authorization: `Bearer ${token}` });
check('GET /api/may-use with the conversation\'s own vsst_: 403 human_only, the token never echoed', agent.status === 403 && agent.json && agent.json.code === 'human_only' && !JSON.stringify(agent.json).includes(token), agent);
const page = await evalJs(`fetch('/api/may-use?key=' + encodeURIComponent(${JSON.stringify(KEY)})).then((r) => r.status)`);
check('the same read from the page itself (the cookie): 200', page === 200, page);

try { ws.close(); } catch { }
console.log(`\n${failed ? 'FAILED' : 'ALL PASS'} (${passed} passed, ${failed} failed)`);
process.exit(failed ? 1 : 0);
