#!/usr/bin/env node
// 「刷新所有活着的会话」 WITH A REAL CHROME (lane refresh-live-sessions, userW's ask inc-mv8jk9wy-35s1; the owner
// 2026-10-15: manual only). HEAVY: a scratch worktree server (private HOME, a fake claude that answers init with the
// conversation it resumes, writes its pid and idles) + headless Chrome clients over raw CDP.
//   desk 1100 (zh) · three conversations resumed live; the third's CLI dies (its window stays: "Session ended.") ⇒ the
//     session list's ⋯ ⇒ the ONE entry ⇒ the confirm names 2 live + 1 open stopped, the note pre-filled in Chinese ⇒
//     确定 ⇒ the toast 「已排给 2 个，跳过 1 个已停止的」; the strip above the composer shows the note on the 2 live
//     windows (Details = its words), none on the stopped one; the stash file holds ONE note each under the 2 live
//     conversations and nothing under the stopped one; no create / input / kill frame left the page, no ledger row
//   phone 390 (zh) · a second client: the same strip on its own view of a live conversation (the existing broadcast);
//     the ⋯ from the drawer ⇒ the confirm (its buttons ≥ 44 px, inside the viewport) ⇒ an edited note ⇒ it REPLACES
//     the waiting one (one per conversation, the new words) — the desk strip still counts one
// PNGs: $VIBESPACE_RLS_PNG_DIR/{desk-menu,desk-dialog,desk-strip,desk-toast,phone-menu,phone-dialog,phone-strip}.png
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { freePorts, scratch, scratchHome, fixtureSid, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const WebSocket = require(path.join(repo, 'node_modules', 'ws'));
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome for the client'); process.exit(0); }
let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 1400) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 30000, step = 250) => { const t = Date.now() + ms; while (Date.now() < t) { let v = null; try { v = await fn(); } catch { } if (v) return v; await sleep(step); } return null; };
const PNG_DIR = process.env.VIBESPACE_RLS_PNG_DIR || null;
const [PORT, CDP_PORT] = await freePorts(2);
const VNC_ENV = await vncEnv();
const wt = scratch('rls-chrome');
const fakeHome = scratchHome('rls-home', fs);
const RUNTIME = path.join(fakeHome, 'run'); fs.mkdirSync(RUNTIME, { recursive: true }); fs.chmodSync(RUNTIME, 0o700);
const { fixtureLitter } = require(path.join(repo, 'src/fixture-guard.js'));
const REAL_PROJECTS = path.join(os.homedir(), '.claude', 'projects');
const realBefore = (() => { try { return new Set(fs.readdirSync(REAL_PROJECTS)); } catch { return new Set(); } })();
const NOW = Date.now(), DAY = 86400e3;
const SIDS = [fixtureSid('afe001'), fixtureSid('afe002'), fixtureSid('afe003')]; // minted before the worktree: a bad id must not strand it
const NAMES = ['Planner', 'Writer', 'Reviewer'];
const NOTE_ZH = '共享的 skills / 上下文已更新：请重新读取你用到的 skill 和 CLAUDE.md，再继续。';

try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
execSync('npm run build', { cwd: wt, stdio: 'ignore' });

// THE FAKE CLAUDE: answers init with the id it was asked to resume, writes its pid (the test ends ONE of them), idles
const FAKE_BIN = path.join(fakeHome, 'fake-bin'); fs.mkdirSync(FAKE_BIN, { recursive: true });
const FAKE_CLAUDE = path.join(FAKE_BIN, 'claude');
const PIDS = path.join(fakeHome, 'fake-pids'); fs.mkdirSync(PIDS, { recursive: true });
fs.writeFileSync(FAKE_CLAUDE, `#!/bin/sh
sid=""; prev=""
for a in "$@"; do [ "$prev" = "--resume" ] && sid="$a"; prev="$a"; done
[ -n "$sid" ] && echo $$ > ${JSON.stringify(PIDS)}/"$sid"
case " $* " in *" --output-format "*) sleep 1; printf '{"type":"system","subtype":"init","session_id":"%s","cwd":"%s","model":"claude-fable-5","apiKeySource":"none","tools":[],"mcp_servers":[]}\\n' "$sid" "$PWD";; esac
exec sleep 600
`, { mode: 0o755 });

const CWD = path.join(fakeHome, 'work', 'skills-demo'); fs.mkdirSync(CWD, { recursive: true });
const projDir = path.join(fakeHome, '.claude', 'projects', CWD.replace(/[/._]/g, '-')); fs.mkdirSync(projDir, { recursive: true });
const rec = (sid, i, role, text) => JSON.stringify(role === 'user'
  ? { type: 'user', uuid: `u-${sid.slice(-4)}-${i}`, timestamp: new Date(NOW - DAY + i * 60000).toISOString(), sessionId: sid, cwd: CWD, message: { role: 'user', content: [{ type: 'text', text }] } }
  : { type: 'assistant', uuid: `a-${sid.slice(-4)}-${i}`, timestamp: new Date(NOW - DAY + i * 60000).toISOString(), sessionId: sid, cwd: CWD, message: { role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text }], usage: { input_tokens: 10, output_tokens: 5 } } });
SIDS.forEach((sid, k) => fs.writeFileSync(path.join(projDir, sid + '.jsonl'), [rec(sid, 1, 'user', `${NAMES[k]}: use the release-notes skill on this week's changes`), rec(sid, 2, 'assistant', 'Drafted the notes with the skill as it was this morning.')].join('\n') + '\n'));

const baseEnv = { ...process.env }; delete baseEnv.DISPLAY; delete baseEnv.WAYLAND_DISPLAY; delete baseEnv.DBUS_SESSION_BUS_ADDRESS; delete baseEnv.ANTHROPIC_API_KEY;
const srvEnv = { ...baseEnv, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, XDG_RUNTIME_DIR: RUNTIME, VIBESPACE_SKIP_AGENT_HOOKS: '1', CLAUDE_CMD: FAKE_CLAUDE, PATH: FAKE_BIN + ':' + (process.env.PATH || '') };
const srvLog = [];
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: srvEnv, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
srv.stdout.on('data', (d) => srvLog.push(String(d))); srv.stderr.on('data', (d) => srvLog.push(String(d)));
const client = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--window-size=1100,800', `--user-data-dir=${scratch('rls-client')}`, 'about:blank'], { stdio: 'ignore', detached: true });
let cleaned = false;
const cleanup = () => {
  if (cleaned) return; cleaned = true;
  try { process.kill(-client.pid, 'SIGKILL'); } catch { }
  try { process.kill(-srv.pid, 'SIGKILL'); } catch { }
  for (const root of [wt, fakeHome]) { try { endRootedProcesses(root); } catch { } }
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
  try { fs.rmSync(fakeHome, { recursive: true, force: true }); } catch { }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(1); });
const stashFile = path.join(wt, 'data', 'msg-stash.json');
const refreshNotes = () => { let j = {}; try { j = JSON.parse(fs.readFileSync(stashFile, 'utf8')); } catch { } const q = j.stash || j; const out = {}; for (const sid of SIDS) out[sid] = (Array.isArray(q[sid]) ? q[sid] : []).filter((e) => e && e.fromName === 'VibeSpace refresh').map((e) => e.text); return out; };

try {
  const up = await until(async () => { if (srv.exitCode !== null) return 'dead'; await fetch(`http://127.0.0.1:${PORT}/api/home`); return 'up'; }, 120000, 250);
  check('the scratch server answers (private HOME + runtime dir)', up === 'up', srvLog.join('').slice(-600));
  if (up !== 'up') throw new Error('no server');

  const ver = await until(async () => (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json(), 30000);
  const cdp = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((r, e) => { cdp.on('open', r); cdp.on('error', e); });
  let seq = 0; const pend = new Map();
  const pageErrors = [];
  cdp.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } else if (m.method === 'Runtime.exceptionThrown') pageErrors.push(JSON.stringify(m.params.exceptionDetails).slice(0, 400)); });
  const send = (method, params = {}, sessionId) => new Promise((r) => { const id = ++seq; pend.set(id, r); cdp.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
  // the page's ws frames that could start / feed / end a turn, and every toast as it appears
  const SPY = `(() => { window.__frames = []; window.__toasts = []; window.__clicks = []; document.addEventListener('click', (e) => { const t = e.target; window.__clicks.push((t && (t.id || t.className || t.tagName)) + ''); }, true); window.__toastTexts = () => [...window.__toasts, ...document.querySelectorAll('.global-toast')].map((n) => ((n.querySelector && n.querySelector('.global-toast-body')) || n).textContent || '');
    const iv = setInterval(() => { if (!window.app || !app.ws || !app.ws.send || app.ws.__spied) return; app.ws.__spied = true; clearInterval(iv);
      const s = app.ws.send.bind(app.ws); app.ws.send = (m) => { try { const o = typeof m === 'string' ? JSON.parse(m) : m; if (o && /^(create|input|chat-input|send|kill|interrupt)$/.test(o.type)) window.__frames.push(o.type); } catch {} return s(m); }; }, 50);
    new MutationObserver((ms) => { for (const r of ms) for (const n of r.addedNodes) if (n.nodeType === 1 && /toast/.test(n.className || '')) window.__toasts.push(n); }).observe(document.documentElement, { childList: true, subtree: true }); })();`;
  async function newPage(w, h, mobile, lang) {
    const tg = await send('Target.createTarget', { url: 'about:blank', newWindow: true });
    const a = await send('Target.attachToTarget', { targetId: tg.result.targetId, flatten: true });
    const s = a.result.sessionId; const S = (m, p) => send(m, p, s);
    await S('Page.enable'); await S('Runtime.enable');
    await S('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
    if (mobile) await S('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await S('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
    await S('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('vibespace.lang', ${JSON.stringify(lang)}); } catch {}` });
    await S('Page.addScriptToEvaluateOnNewDocument', { source: SPY });
    await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
    const ev = async (expr) => { const r = await S('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result && r.result.exceptionDetails) return { __err: JSON.stringify(r.result.exceptionDetails).slice(0, 500) }; return r.result && r.result.result ? r.result.result.value : undefined; };
    const ready = await until(() => ev("!!(window.app && window.app.wm && app.ws && app.ws.__spied && app.sidebar) && !document.getElementById('loading-screen')"), 60000, 300);
    return { S, ev, ready };
  }
  const shot = async (S, f, clip) => { if (!PNG_DIR) return null; const r = await S('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) }); if (!r.result) return null; fs.mkdirSync(PNG_DIR, { recursive: true }); const out = path.join(PNG_DIR, f); fs.writeFileSync(out, Buffer.from(r.result.data, 'base64')); return out; };
  const centre = (ev, sel) => ev(`(() => { const e = ${sel.startsWith('JS:') ? sel.slice(3) : `document.querySelector(${JSON.stringify(sel)})`}; if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const q = e.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2, w: q.width, h: q.height }; })()`);
  const press = async (S, ev, sel) => { const r = await centre(ev, sel); if (!r || r.__err) return false; for (const type of ['mousePressed', 'mouseReleased']) await S('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button: 'left', clickCount: 1 }); return true; };
  const tap = async (S, ev, sel) => { const r = await centre(ev, sel); if (!r || r.__err) return false; await S('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x, y: r.y }] }); await S('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); return true; };
  const MENU_ITEM = "JS:[...document.querySelectorAll('.context-menu-item')].find((n) => /刷新所有活着的会话/.test(n.textContent))";
  const winOf = (sid) => `[...app.wm.windows.values()].find((w) => w._openSpec && w._openSpec.backendSessionId === ${JSON.stringify(sid)})`;
  const stripOf = (sid) => `(() => { const w = ${winOf(sid)}; if (!w) return { win: false }; const el = w.element.querySelector('.chat-stash-strip'); const v = app.sessions.get(w.id);
    return { win: true, readOnly: !!(v && v._readOnly), shown: !!el && !el.hidden, head: el ? (el.querySelector('.chat-stash-head') || {}).textContent || '' : '', parts: el ? (el.querySelector('.chat-stash-parts') || {}).textContent || '' : '',
      rows: el ? [...el.querySelectorAll('.chat-stash-row')].map((r) => r.textContent) : [], detailsOpen: !!el && !!el.querySelector('.chat-stash-list') && !el.querySelector('.chat-stash-list').hidden }; })()`;
  const dialogFacts = `(() => { const o = document.getElementById('refresh-live-dialog'); if (!o) return null; const d = o.querySelector('.dialog'); const q = d.getBoundingClientRect();
    const btns = [...o.querySelectorAll('.dialog-footer button')].map((b) => { const r = b.getBoundingClientRect(); return { text: b.textContent, disabled: b.disabled, h: Math.round(r.height), l: Math.round(r.left), r: Math.round(r.right) }; });
    return { title: (o.querySelector('.dialog-header h3') || {}).textContent, count: (o.querySelector('.refresh-live-count') || {}).textContent || '', skip: (o.querySelector('.refresh-live-skip') || {}).textContent || '', note: (o.querySelector('textarea') || {}).value, chars: (o.querySelector('.refresh-live-chars') || {}).textContent || '', btns, rect: { x: Math.max(0, q.left), y: Math.max(0, q.top), width: Math.min(innerWidth, q.width), height: Math.min(innerHeight, q.height) }, vw: innerWidth }; })()`;

  // ════ desk 1100 ════
  console.log('── desk 1100 (zh) ──');
  const D = await newPage(1100, 800, false, 'zh');
  check('desk: the app is up', !!D.ready);
  for (let k = 0; k < 3; k++) await D.ev(`(app.createSession({ cwd: ${JSON.stringify(CWD)}, name: ${JSON.stringify(NAMES[k])}, resumeId: ${JSON.stringify(SIDS[k])}, mode: 'chat', backend: 'claude' }), true)`);
  const live3 = await until(() => D.ev(`(() => { const ids = (app.sidebar._webuiSessions || []).map((s) => s.backendSessionId); return ${JSON.stringify(SIDS)}.every((x) => ids.includes(x)) ? ids : null; })()`), 60000, 300);
  check('desk: three conversations resumed — all three live on the server', !!live3, live3);
  const pid3 = await until(() => { try { return Number(fs.readFileSync(path.join(PIDS, SIDS[2]), 'utf8').trim()) || null; } catch { return null; } }, 10000, 100);
  try { process.kill(pid3, 'SIGTERM'); } catch { }
  const stopped = await until(() => D.ev(`(() => { const f = ${stripOf(SIDS[2])}; const ids = (app.sidebar._webuiSessions || []).map((s) => s.backendSessionId); return f.win && f.readOnly && !ids.includes(${JSON.stringify(SIDS[2])}) ? f : null; })()`), 30000, 250);
  check('desk: the third conversation\'s CLI died — its window stays, read-only ("Session ended."), gone from the live list', !!stopped, await D.ev(stripOf(SIDS[2])));
  await D.ev('(window.__frames.length = 0, window.__toasts.length = 0, true)');
  // the door: the session list's ⋯ (its list-wide actions) — ONE entry; the list is folded on the rail after the
  // windows opened, so its rail button (Folders) unfolds it first, as a person would
  await D.ev('(app.sidebar.toggle(true), true)');
  await until(() => D.ev("document.getElementById('session-list-menu')?.offsetParent ? true : null"), 5000, 100);
  const btn = await D.ev(`(() => { const b = document.getElementById('session-list-menu'); if (!b) return null; const q = b.getBoundingClientRect(); return { shown: b.offsetParent !== null, svg: !!b.querySelector('svg'), title: b.title, w: Math.round(q.width), row: b.parentElement.id }; })()`);
  check(`desk: the ⋯ sits in the session list's own header row, an SVG icon, titled 「${btn?.title}」`, !!btn && btn.shown && btn.svg && btn.row === 'session-filter-row' && btn.title === '会话列表操作', btn);
  await press(D.S, D.ev, '#session-list-menu');
  const menu = await until(() => D.ev(`(() => { const m = [...document.querySelectorAll('.context-menu')].pop(); if (!m) return null; return [...m.querySelectorAll('.context-menu-item')].map((n) => ({ text: n.textContent.trim(), svg: !!n.querySelector('svg') })); })()`), 5000, 100);
  check(`desk: the menu holds the ONE entry 「${menu?.[0]?.text}」 with its SVG icon`, !!menu && menu.length === 1 && menu[0].text === '刷新所有活着的会话…' && menu[0].svg, menu);
  const sideRect = await D.ev(`(() => { const m = [...document.querySelectorAll('.context-menu')].pop(); const s = document.getElementById('sidebar').getBoundingClientRect(); const q = m.getBoundingClientRect(); return { x: 0, y: 0, width: Math.min(innerWidth, Math.max(s.right, q.right) + 12), height: Math.min(innerHeight, Math.max(q.bottom + 40, 260)) }; })()`);
  const pMenu = await shot(D.S, 'desk-menu.png', sideRect);
  await press(D.S, D.ev, MENU_ITEM);
  const dlg = await until(() => D.ev(dialogFacts), 5000, 100);
  check(`desk: the confirm — 「${dlg?.count}」`, !!dlg && dlg.title === '刷新所有活着的会话' && dlg.count === '将提醒 2 个活着的会话（下一轮生效，不唤醒、不计费）', dlg);
  check(`desk: …the stopped one named — 「${dlg?.skip}」; the note pre-filled in Chinese, editable (${dlg?.chars})`, !!dlg && dlg.skip === '打开着的 1 个已停止 / 只读的会话会跳过' && dlg.note === NOTE_ZH && dlg.chars === `${[...NOTE_ZH].length} / 2000` && dlg.btns.map((b) => b.text).join('|') === '取消|确定' && !dlg.btns[1].disabled, dlg);
  const pDialog = await shot(D.S, 'desk-dialog.png', dlg && { x: Math.max(0, dlg.rect.x - 16), y: Math.max(0, dlg.rect.y - 16), width: Math.min(1100, dlg.rect.width + 32), height: Math.min(800, dlg.rect.height + 32) });
  // an emptied note cannot be confirmed (said inline); the words back ⇒ 确定
  await D.ev(`(() => { const t = document.querySelector('#refresh-live-dialog textarea'); t.value = '  '; t.dispatchEvent(new Event('input')); return true; })()`);
  const emptied = await D.ev(`(() => { const o = document.getElementById('refresh-live-dialog'); return { ok: o.querySelector('.btn-create').disabled, err: o.querySelector('.refresh-live-error').textContent }; })()`);
  check(`desk: an emptied note — 确定 disabled, said inline 「${emptied?.err}」`, !!emptied && emptied.ok === true && emptied.err === '请先写提醒内容', emptied);
  await D.ev(`(() => { const t = document.querySelector('#refresh-live-dialog textarea'); t.value = ${JSON.stringify(NOTE_ZH)}; t.dispatchEvent(new Event('input')); return true; })()`);
  await press(D.S, D.ev, '#refresh-live-dialog .btn-create');
  const toast = await until(() => D.ev(`(() => { const t = window.__toastTexts().find((x) => /已排给/.test(x)); return t && !document.getElementById('refresh-live-dialog') ? t : null; })()`), 10000, 150);
  check(`desk: 确定 ⇒ the dialog closes, the toast 「${toast}」`, toast === '已排给 2 个，跳过 1 个已停止的', { toast, all: await D.ev('window.__toastTexts()'), pageErrors });
  const pToast = await shot(D.S, 'desk-toast.png');
  const notes1 = refreshNotes();
  check('desk: the stash holds ONE note each under the 2 live conversations, none under the stopped one', notes1[SIDS[0]].length === 1 && notes1[SIDS[1]].length === 1 && notes1[SIDS[0]][0] === NOTE_ZH && notes1[SIDS[2]].length === 0, notes1);
  check('desk: no create / input / kill frame left the page (never a wake — the note waits for the next turn)', (await D.ev('window.__frames.length')) === 0, await D.ev('window.__frames'));
  check('desk: the server says it: 2 queued, 1 skipped, no spend path', srvLog.join('').includes('[stash] refresh note queued for 2 live conversation(s) (0 replaced, 1 skipped, 0 failed)') && !/\[spend\][^\n]*refresh/i.test(srvLog.join('')), srvLog.join('').split('\n').filter((l) => /refresh|spend/.test(l)).slice(-6));
  const strips = await until(() => D.ev(`(() => { const a = ${stripOf(SIDS[0])}, b = ${stripOf(SIDS[1])}, c = ${stripOf(SIDS[2])}; return a.shown && b.shown ? { a, b, c } : null; })()`), 10000, 150);
  check(`desk: the strip above the composer on BOTH live windows — 「${strips?.a?.head}${strips?.a?.parts}」`, !!strips && strips.a.head === '有 1 条通知在等这个 agent 的下一轮' && /VibeSpace 通知/.test(strips.a.parts) && strips.b.shown, strips);
  check('desk: …and none on the stopped window', !!strips && strips.c.win && !strips.c.shown, strips?.c);
  const winRect = (sid) => D.ev(`(() => { const q = ${winOf(sid)}.element.getBoundingClientRect(); const x = Math.max(0, q.left), y = Math.max(0, q.top); return { x, y, width: Math.min(innerWidth - x, q.width), height: Math.min(innerHeight - y, q.height) }; })()`);
  await D.ev(`(() => { const w = ${winOf(SIDS[0])}; app.wm.focusWindow ? app.wm.focusWindow(w.id) : null; const b = w.element.querySelector('.chat-stash-more'); b && b.click(); return true; })()`);
  const det = await until(() => D.ev(`(() => { const f = ${stripOf(SIDS[0])}; return f.detailsOpen && f.rows.length ? f : null; })()`), 5000, 100);
  check(`desk: Details — the note as the session will read it: 「${det?.rows?.[0]}」`, !!det && det.rows.length === 1 && det.rows[0] === `一条 VibeSpace 通知 · ${NOTE_ZH}`, det);
  const pStrip = await shot(D.S, 'desk-strip.png', await winRect(SIDS[0]));

  // ════ phone 390 — a second client ════
  console.log('── phone 390 (zh), a second client ──');
  const Ph = await newPage(390, 844, true, 'zh');
  check('phone: the app is up', !!Ph.ready);
  const w1 = await Ph.ev(`((app.sidebar._webuiSessions || []).find((s) => s.backendSessionId === ${JSON.stringify(SIDS[0])}) || {}).id || null`);
  await Ph.ev(`(app.attachSession(${JSON.stringify(w1)}, ${JSON.stringify(NAMES[0])}, ${JSON.stringify(CWD)}, { mode: 'chat', backend: 'claude', backendSessionId: ${JSON.stringify(SIDS[0])} }), true)`);
  const pstrip = await until(() => Ph.ev(`(() => { const f = ${stripOf(SIDS[0])}; return f.shown ? f : null; })()`), 20000, 200);
  check(`phone: its own view of the live conversation shows the SAME note waiting — 「${pstrip?.head}」 (the existing broadcast)`, !!pstrip && pstrip.head === '有 1 条通知在等这个 agent 的下一轮', pstrip);
  await Ph.ev(`(() => { const w = ${winOf(SIDS[0])}; const b = w.element.querySelector('.chat-stash-more'); b && b.click(); return true; })()`);
  await until(() => Ph.ev(`(${stripOf(SIDS[0])}).detailsOpen`), 3000, 100);
  const pPhoneStrip = await shot(Ph.S, 'phone-strip.png');
  await Ph.ev('(app.sidebar.toggle(true), true)');
  const pbtn = await until(() => Ph.ev(`(() => { const b = document.getElementById('session-list-menu'); if (!b || b.offsetParent === null) return null; const q = b.getBoundingClientRect(); return q.width > 0 && q.right <= innerWidth ? { w: Math.round(q.width), h: Math.round(q.height) } : null; })()`), 5000, 150);
  check('phone: the ⋯ is in the drawer\'s list header, inside the viewport', !!pbtn, pbtn);
  // the drawer slides in: tap once its header stops moving (a tap mid-slide lands where the button WAS)
  let lastX = null;
  await until(async () => { const x = await Ph.ev("Math.round(document.getElementById('session-list-menu').getBoundingClientRect().left)"); const still = x === lastX; lastX = x; return still; }, 5000, 120);
  await tap(Ph.S, Ph.ev, '#session-list-menu');
  const pmenu = await until(() => Ph.ev(`(() => { const m = [...document.querySelectorAll('.context-menu')].pop(); return m ? [...m.querySelectorAll('.context-menu-item')].map((n) => n.textContent.trim()) : null; })()`), 5000, 100);
  check('phone: the same ONE entry', !!pmenu && pmenu.length === 1 && pmenu[0] === '刷新所有活着的会话…', { pmenu, clicks: await Ph.ev('window.__clicks.slice(-5)'), at: await Ph.ev(`(() => { const b = document.getElementById('session-list-menu').getBoundingClientRect(); const e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return e ? (e.id || e.className || e.tagName) + '' : null; })()`) });
  const pPhoneMenu = await shot(Ph.S, 'phone-menu.png');
  await tap(Ph.S, Ph.ev, MENU_ITEM);
  const pdlg = await until(() => Ph.ev(dialogFacts), 5000, 100);
  check(`phone: the confirm — 「${pdlg?.count}」, no stopped window open here so nothing named as skipped`, !!pdlg && pdlg.count === '将提醒 2 个活着的会话（下一轮生效，不唤醒、不计费）' && pdlg.skip === '' && pdlg.note === NOTE_ZH, pdlg);
  check('phone: 取消 / 确定 ≥ 44 px tall and inside the viewport', !!pdlg && pdlg.btns.length === 2 && pdlg.btns.every((b) => b.h >= 44 && b.l >= 0 && b.r <= pdlg.vw), pdlg?.btns);
  const NOTE2 = NOTE_ZH + '（第二次：release-notes skill 改了模板）';
  await Ph.ev(`(() => { const t = document.querySelector('#refresh-live-dialog textarea'); t.value = ${JSON.stringify(NOTE2)}; t.dispatchEvent(new Event('input')); return true; })()`);
  const pPhoneDialog = await shot(Ph.S, 'phone-dialog.png');
  await tap(Ph.S, Ph.ev, '#refresh-live-dialog .btn-create');
  const ptoast = await until(() => Ph.ev(`window.__toastTexts().find((x) => /已排给/.test(x)) || null`), 10000, 150);
  check(`phone: the toast 「${ptoast}」`, ptoast === '已排给 2 个活着的会话——下一轮生效', ptoast);
  const notes2 = refreshNotes();
  check('a second press REPLACES the waiting note — still ONE per live conversation, the edited words', notes2[SIDS[0]].length === 1 && notes2[SIDS[1]].length === 1 && notes2[SIDS[0]][0] === NOTE2 && notes2[SIDS[2]].length === 0 && srvLog.join('').includes('(2 replaced, 0 skipped, 0 failed)'), notes2);
  const deskAfter = await until(() => D.ev(`(() => { const f = ${stripOf(SIDS[0])}; return f.rows.some((r) => r.includes('第二次')) ? f : null; })()`), 10000, 150);
  check('desk (the first client): its strip still counts ONE, now the edited note', !!deskAfter && deskAfter.head === '有 1 条通知在等这个 agent 的下一轮' && deskAfter.rows.length === 1, deskAfter || await D.ev(stripOf(SIDS[0])));
  if (PNG_DIR) console.log('  PNGs:', [pMenu, pDialog, pToast, pStrip, pPhoneStrip, pPhoneMenu, pPhoneDialog].filter(Boolean).join(' '));
} catch (e) {
  failed++; console.error('  ✗ the suite threw: ' + (e && e.stack || e));
} finally {
  if (failed) console.error(srvLog.join('').slice(-1500));
  cleanup();
}
{
  const after = (() => { try { return fs.readdirSync(REAL_PROJECTS, { withFileTypes: true }); } catch { return []; } })();
  const added = after.filter((d) => !realBefore.has(d.name)).map((d) => ({ name: d.name, mtimeMs: (() => { try { return fs.statSync(path.join(REAL_PROJECTS, d.name)).mtimeMs; } catch { return Date.now(); } })() }));
  const lit = fixtureLitter(added);
  check(`the real ~/.claude/projects gained no fixture entry (${added.length} new from concurrent real sessions, 0 fixtures)`, lit.offenders.length === 0, JSON.stringify(lit.offenders.slice(0, 3)));
}
console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
