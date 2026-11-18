#!/usr/bin/env node
// THE WALL'S MARK AND THE TWO BULK ACTS, WITH A REAL CHROME (lane auto-resume-bulk, .349 — a fleet power user: dozens of
// conversations stopped on usage walls the same day with auto-resume off; one click to turn it on for all, one click to
// resume them all, a mark on each card). HEAVY: a scratch worktree server (private HOME) + a FAKE claude that answers a
// prompt the way the real CLI does — «WALL» ⇒ a rejected rate_limit_event + the synthetic «You've hit your limit» record
// + an error result; «OVERLOAD» ⇒ the synthetic `error: "overloaded"` record (the CLI's 529 enum) + an error result;
// anything else ⇒ a normal turn. Before a wall / an overload the fake does a little real work first (one main-thread
// record whose usage is a 400 k context on opus 5.5 — the conversation's live context the cost estimate reads). The
// REAL stdout consumer + wall machine write the fact; nothing is injected into the page. The wall's stated reset has
// passed, so the engine opens a NEW 5 h window and the pool reads blocked; the suite then writes the fresh reading a
// real instance gets when that window rolls (75 % used, resets in 2 h) — the batch is resumable. The product keeps
// fixture conversations OUT of its usage ledger (the walk skips fixture transcripts, the reader hides fixture rows), so
// this world has no measured ratio: the confirm must still show the dollars and SAY the share cannot be estimated —
// the measured share and the «只恢复前 K 个» cut are driven against the real gather in test-bulk-resume-cost §6 /
// test-auto-resume-loop §8.
//   desk 1100 (zh) · four conversations; three hit the wall / the overload ⇒ each card wears its mark
//     («因用量上限停止 · 上限已重置» / «模型过载 · 停于 HH:MM») with «自动继续：关» beside it; the normal one none;
//     the filter row's «因用量上限/过载停止 (3)» narrows the list to them and back; a press on one toggle ⇒ «自动继续：开»
//     (the server + the resume carrier agree); Settings → the auto-resume row: «将开启 3 个会话；已开启 1 个» ⇒
//     «对所有会话开启自动继续» ⇒ «将开启 0 个会话；已开启 4 个» (every card's toggle on, every carrier written) ⇒
//     «全部关闭»; the passive cost line; «恢复所有因用量上限/过载停止的会话 (3)» ⇒ the confirm says the cost FIRST
//     («≈ $6.12（按 opus-5-5 缓存写入价 $5/M，冷读 1.20 M tokens）» — a cold read is priced as cache WRITES, U2's cost cure, «本机自己的登录：无法估算：本窗口还没有实测比例» —
//     never a made-up percent) beside «全部恢复 (3)»
//   desk 1100 (en) · the same confirm in English, from the session list's ⋯
//   phone 390 (zh) · the marks + the filter pill in the drawer; the confirm inside the viewport
//   desk (zh) · «全部恢复 (3)» ⇒ «恢复了 3 个 · 跳过 0 个 · 拒绝 0»: the fake CLI received each continue (the overload with
//     ITS words), the spend ledger holds 3 bulk-resume stamps, every mark and the pill are gone
//   an agent bearer is refused by name on the four routes (cookie only)
// PNGs: $VIBESPACE_ARB_PNG_DIR/{desk-marks,desk-filter,desk-settings,desk-dialog,en-dialog,phone-marks,phone-dialog,desk-done}.png
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { freePorts, scratch, fixtureSid, ONBOARDED_SOURCE, vncEnv, stillPresser } from './scratch.mjs';
import { mintRoot, startHub } from './hub-boot.mjs';   // THE SUITES' ONE HUB BOOT (§57c): the tree and the home live in its root
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const WebSocket = require(path.join(repo, 'node_modules', 'ws'));
const { CONTINUE_PROMPT_OVERLOAD, bulkPromptFor } = require(path.join(repo, 'src/server/auto-resume.js'));
const QUOTA_WORDS = bulkPromptFor('quota', null);   // one login: the wall on its own account lifted (the release's continue words)
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome for the client'); process.exit(0); }
let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 1400) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 30000, step = 250) => { const t = Date.now() + ms; while (Date.now() < t) { let v = null; try { v = await fn(); } catch { } if (v) return v; await sleep(step); } return null; };
const PNG_DIR = process.env.VIBESPACE_ARB_PNG_DIR || null;
const [PORT, CDP_PORT] = await freePorts(2);
const VNC_ENV = await vncEnv();
const root = mintRoot('arb-chrome');   // at exit the helper ends the hub and everything rooted here, removes the worktree, then the root
const wt = path.join(root, 't');
const fakeHome = path.join(root, 'home');
for (const d of ['.claude/projects', '.claude/sessions', '.config', '.vibespace']) fs.mkdirSync(path.join(fakeHome, d), { recursive: true });
const RUNTIME = path.join(fakeHome, 'run'); fs.mkdirSync(RUNTIME, { recursive: true }); fs.chmodSync(RUNTIME, 0o700);
const { fixtureLitter } = require(path.join(repo, 'src/fixture-guard.js'));
const REAL_PROJECTS = path.join(os.homedir(), '.claude', 'projects');
const realBefore = (() => { try { return new Set(fs.readdirSync(REAL_PROJECTS)); } catch { return new Set(); } })();
const NOW = Date.now(), DAY = 86400e3;
const SIDS = [fixtureSid('a7b001'), fixtureSid('a7b002'), fixtureSid('a7b003'), fixtureSid('a7b004')]; // minted before the worktree
const NAMES = ['Wall A', 'Wall B', 'Overload C', 'Normal D'];
const ASK = ['WALL: go on', 'WALL: go on', 'OVERLOAD: go on', 'hello'];

execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
execSync('npm run build', { cwd: wt, stdio: 'ignore' });

// THE FAKE CLAUDE — the real CLI's words at a wall / an overload (2.1.308 shapes), every prompt it got logged per conversation
const FAKE_BIN = path.join(fakeHome, 'fake-bin'); fs.mkdirSync(FAKE_BIN, { recursive: true });
const FAKE_CLAUDE = path.join(FAKE_BIN, 'claude');
const TURNS = path.join(fakeHome, 'turns'); fs.mkdirSync(TURNS, { recursive: true });
fs.writeFileSync(FAKE_CLAUDE, `#!${process.execPath}
const fs = require('fs'); const a = process.argv.slice(2);
if ((a.includes('-p') || a.includes('--print')) && !a.includes('--input-format')) process.exit(1);   // a usage probe (claude -p /usage): nothing to say, at once
if (!a.includes('--output-format')) { setInterval(() => {}, 1e9); return; }                             // a terminal spawn: idle
const i = a.indexOf('--resume'); const sid = i >= 0 ? a[i + 1] : 'fresh';
const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
out({ type: 'system', subtype: 'init', session_id: sid, cwd: process.cwd(), model: 'claude-opus-5-5', apiKeySource: 'none', tools: [], mcp_servers: [] });
let buf = '';
process.stdin.on('data', (d) => { buf += d; let k; while ((k = buf.indexOf('\\n')) >= 0) { const line = buf.slice(0, k); buf = buf.slice(k + 1); turn(line); } });
process.stdin.on('end', () => process.exit(0));
function turn(line) {
  let m; try { m = JSON.parse(line); } catch { return; }
  if (!m || m.type !== 'user') return;
  const c = m.message && m.message.content; const text = typeof c === 'string' ? c : (Array.isArray(c) ? c.filter((b) => b && b.type === 'text').map((b) => b.text).join('') : '');
  fs.appendFileSync(${JSON.stringify(TURNS)} + '/' + sid, JSON.stringify(text) + '\\n');
  setTimeout(() => {
    const work = () => out({ type: 'assistant', message: { id: 'w-' + Date.now(), role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text: 'Migrating the next module.' }], usage: { input_tokens: 5000, cache_creation_input_tokens: 395000, cache_read_input_tokens: 0, output_tokens: 300 } }, session_id: sid });
    if (/^WALL/.test(text)) {
      work();
      const said = "You've hit your limit · resets 2pm (UTC)";
      out({ type: 'rate_limit_event', rate_limit_info: { status: 'rejected', rateLimitType: 'five_hour', resetsAt: Math.floor(Date.now() / 1000) - 120 }, session_id: sid });
      out({ type: 'assistant', message: { id: 'm-' + Date.now(), role: 'assistant', model: '<synthetic>', content: [{ type: 'text', text: said }], usage: { input_tokens: 0, output_tokens: 0 } }, error: 'rate_limit', session_id: sid });
      out({ type: 'result', subtype: 'success', is_error: true, result: said, session_id: sid });
    } else if (/^OVERLOAD/.test(text)) {
      work();
      const said = 'API Error: Repeated 529 Overloaded errors';
      out({ type: 'assistant', message: { id: 'm-' + Date.now(), role: 'assistant', model: '<synthetic>', content: [{ type: 'text', text: said }], usage: { input_tokens: 0, output_tokens: 0 } }, error: 'overloaded', session_id: sid });
      out({ type: 'result', subtype: 'success', is_error: true, result: said, session_id: sid });
    } else {
      out({ type: 'assistant', message: { id: 'm-' + Date.now(), role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text: 'Continuing where I stopped.' }], usage: { input_tokens: 10, output_tokens: 5 } }, session_id: sid });
      out({ type: 'result', subtype: 'success', is_error: false, result: 'Continuing where I stopped.', session_id: sid });
    }
  }, 150);
}
`, { mode: 0o755 });

const CWD = path.join(fakeHome, 'work', 'fleet'); fs.mkdirSync(CWD, { recursive: true });
const projDir = path.join(fakeHome, '.claude', 'projects', CWD.replace(/[/._]/g, '-')); fs.mkdirSync(projDir, { recursive: true });
const rec = (sid, i, role, text) => JSON.stringify(role === 'user'
  ? { type: 'user', uuid: `u-${sid.slice(-4)}-${i}`, timestamp: new Date(NOW - DAY + i * 60000).toISOString(), sessionId: sid, cwd: CWD, message: { role: 'user', content: [{ type: 'text', text }] } }
  : { type: 'assistant', uuid: `a-${sid.slice(-4)}-${i}`, timestamp: new Date(NOW - DAY + i * 60000).toISOString(), sessionId: sid, cwd: CWD, message: { role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text }], usage: { input_tokens: 10, output_tokens: 5 } } });
SIDS.forEach((sid, k) => fs.writeFileSync(path.join(projDir, sid + '.jsonl'), [rec(sid, 1, 'user', `${NAMES[k]}: migrate the billing module`), rec(sid, 2, 'assistant', 'Working through the migration.')].join('\n') + '\n'));
/** the fresh reading of the login's 5 h window a real instance holds once the window rolls (75 % used, resets in 2 h) */
const freshReading = () => {
  const at = Date.now(), rs = Math.floor(at / 1000) + 7200;
  fs.writeFileSync(path.join(wt, 'data', 'usage-cache', '__global__.json'), JSON.stringify({ fiveHour: { utilization: 0.75, resetsAt: rs, status: 'allowed' }, fetchedAt: at, source: 'rate-limit-event',
    limits: [{ limitId: 'plan', name: null, scope: 'plan', model: null, family: null, windows: [{ kind: '5h', minutes: 300, minutesStated: false, usedPct: 75, resetsAt: rs, measuredAt: at, state: 'running', status: 'allowed' }], flags: {}, source: 'rate-limit-event', fetchedAt: at }] }));
};

const baseEnv = { ...process.env }; delete baseEnv.DISPLAY; delete baseEnv.WAYLAND_DISPLAY; delete baseEnv.DBUS_SESSION_BUS_ADDRESS; delete baseEnv.ANTHROPIC_API_KEY;
const srvEnv = { ...baseEnv, ...VNC_ENV, HOME: fakeHome, XDG_RUNTIME_DIR: RUNTIME, VIBESPACE_SKIP_AGENT_HOOKS: '1', CLAUDE_CMD: FAKE_CLAUDE, PATH: FAKE_BIN + ':' + (process.env.PATH || '') };
const hub = startHub({ root, tree: wt, port: PORT, env: srvEnv, log: 'arb-hub' });
const client = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--window-size=1100,800', `--user-data-dir=${scratch('arb-client')}`, 'about:blank'], { stdio: 'ignore', detached: true });
let cleaned = false;
const cleanup = () => {
  if (cleaned) return; cleaned = true;
  try { process.kill(-client.pid, 'SIGKILL'); } catch { }
  try { hub.stop(); } catch { }   // the root itself (tree, home, worktree) goes with the helper's own exit hook
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(1); });
const turnsOf = (sid) => { try { return fs.readFileSync(path.join(TURNS, sid), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const stamps = () => { try { const j = JSON.parse(fs.readFileSync(path.join(wt, 'data', 'spend-budget.json'), 'utf8')); const b = j.budget || j; return Object.values(b.identities || {}).flat().filter((x) => x && x.reason === 'bulk-resume').length; } catch { return -1; } };

try {
  const up = await until(async () => { if (hub.child.exitCode !== null) return 'dead'; await fetch(`http://127.0.0.1:${PORT}/api/home`); return 'up'; }, 120000, 250);
  check('the scratch server answers (private HOME + runtime dir)', up === 'up', hub.log().slice(-600));
  if (up !== 'up') throw new Error('no server');
  // COOKIE ONLY: an agent bearer is refused by name on all five doors (U2 cure: the Stop door is one)
  const bearer = { Authorization: 'Bearer vsst_not-the-owner', 'Content-Type': 'application/json' };
  const codes = [];
  for (const [m, u, b] of [['GET', '/api/sessions/stopped'], ['POST', '/api/sessions/auto-resume-all', { enabled: true }], ['POST', '/api/sessions/resume-stopped', {}], ['GET', '/api/sessions/resume-stopped/rb-x'], ['POST', '/api/sessions/resume-stopped/rb-x/stop', {}]]) {
    const r = await fetch(`http://127.0.0.1:${PORT}${u}`, { method: m, headers: bearer, body: b ? JSON.stringify(b) : undefined });
    codes.push(r.status + ':' + ((await r.json().catch(() => ({}))).code || ''));
  }
  check('an agent bearer is refused BY NAME on the five bulk doors (owner cookie only)', codes.length === 5 && codes.every((c) => c === '403:agent_forbidden'), codes);

  const ver = await until(async () => (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json(), 30000);
  const cdp = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((r, e) => { cdp.on('open', r); cdp.on('error', e); });
  let seq = 0; const pend = new Map();
  const pageErrors = [];
  cdp.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } else if (m.method === 'Runtime.exceptionThrown') pageErrors.push(JSON.stringify(m.params.exceptionDetails).slice(0, 400)); });
  const send = (method, params = {}, sessionId) => new Promise((r) => { const id = ++seq; pend.set(id, r); cdp.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
  const TOASTS = `(() => { window.__toasts = []; new MutationObserver((ms) => { for (const r of ms) for (const n of r.addedNodes) if (n.nodeType === 1 && /toast/.test(n.className || '')) window.__toasts.push(n); }).observe(document, { childList: true, subtree: true }); window.__toastTexts = () => window.__toasts.map((n) => (n.querySelector('.toast-body, .global-toast-text') || n).textContent.trim()); })();`;
  async function newPage(w, h, mobile, lang) {
    const tg = await send('Target.createTarget', { url: 'about:blank', newWindow: true });
    const a = await send('Target.attachToTarget', { targetId: tg.result.targetId, flatten: true });
    const s = a.result.sessionId; const S = (m, p) => send(m, p, s);
    await S('Page.enable'); await S('Runtime.enable');
    await S('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
    if (mobile) await S('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await S('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
    await S('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('vibespace.lang', ${JSON.stringify(lang)}); } catch {}` });
    await S('Page.addScriptToEvaluateOnNewDocument', { source: TOASTS });
    await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
    const ev = async (expr) => { const r = await S('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result && r.result.exceptionDetails) return { __err: JSON.stringify(r.result.exceptionDetails).slice(0, 500) }; return r.result && r.result.result ? r.result.result.value : null; };
    const ready = await until(() => ev("!!(window.app && window.app.wm && app.ws && app.sidebar) && !document.getElementById('loading-screen')"), 60000, 300);
    return { S, ev, ready };
  }
  const shot = async (S, f) => { if (!PNG_DIR) return null; const r = await S('Page.captureScreenshot', { format: 'png' }); if (!r.result) return null; fs.mkdirSync(PNG_DIR, { recursive: true }); const out = path.join(PNG_DIR, f); fs.writeFileSync(out, Buffer.from(r.result.data, 'base64')); return out; };
  const centre = (ev, sel) => ev(`(() => { const e = ${sel.startsWith('JS:') ? sel.slice(3) : `document.querySelector(${JSON.stringify(sel)})`}; if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const q = e.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; })()`);
  // every press goes through THE still door (scripts/scratch.mjs stillPresser — test-still-press ⑤: the target at its own point,
  // enabled, still on two looks, and the press LANDED on it)
  const doorOf = (S, ev) => stillPresser({ evalJs: ev, cdp: S });
  const press = async (S, ev, sel) => { await centre(ev, sel); return doorOf(S, ev)(sel); };
  const tap = async (S, ev, sel) => { await centre(ev, sel); return doorOf(S, ev)(sel, { touch: true }); };   // centre() scrolls it into view first
  const cardOf = (name) => `[...document.querySelectorAll('#sidebar .session-item-card')].find((c) => (c.querySelector('.session-card-name') || {}).textContent === ${JSON.stringify(name)})`;
  const marks = `(() => Object.fromEntries(${JSON.stringify(NAMES)}.map((n) => { const c = ${cardOf('__N__').replace('"__N__"', 'n')}; if (!c) return [n, null]; const m = c.querySelector('.sess-stopped-chip'); const t = c.querySelector('.sess-stopped-autoresume'); const tx = m && m.querySelector('.chip-text'); const cr = c.getBoundingClientRect(), xr = tx ? tx.getBoundingClientRect() : null; return [n, { card: true, mark: tx ? tx.textContent : '', tip: m ? m.dataset.tip || '' : '', toggle: t ? t.querySelector('.chip-text').textContent : '', visible: !!xr && xr.width > 20 && getComputedStyle(tx).display !== 'none' && tx.scrollWidth <= tx.clientWidth + 1, inside: !!xr && xr.left >= cr.left && xr.right <= cr.right + 1, toggleIn: !!t && t.getBoundingClientRect().right <= cr.right + 1 }]; })))()`;
  const pill = `(() => { const b = document.querySelector('#stopped-quick-tabs .stopped-quick-tab'); return b ? { text: b.textContent, active: b.classList.contains('active'), w: Math.round(b.getBoundingClientRect().width) } : null; })()`;
  const listed = `[...document.querySelectorAll('#sidebar .session-item-card .session-card-name')].map((n) => n.textContent).filter((n) => ${JSON.stringify(NAMES)}.includes(n)).sort()`;
  const dialogFacts = `(() => { const o = document.getElementById('resume-stopped-dialog'); if (!o) return null; const d = o.querySelector('.dialog').getBoundingClientRect();
    const t = (s) => [...o.querySelectorAll(s)].map((n) => n.textContent);
    const btns = [...o.querySelectorAll('.dialog-footer button')].map((b) => { const r = b.getBoundingClientRect(); return { text: b.textContent, h: Math.round(r.height), l: Math.round(r.left), r: Math.round(r.right), b: Math.round(r.bottom) }; });
    return { title: (o.querySelector('.dialog-header h3') || {}).textContent, lead: t('.resume-stopped-lead')[0] || '', dollars: t('.resume-stopped-dollars')[0] || '', basis: t('.resume-stopped-basis'), member: t('.resume-stopped-member'), status: t('.resume-stopped-status')[0] || '', empty: t('.resume-stopped-empty')[0] || '', btns, vw: innerWidth, vh: innerHeight, rect: { l: Math.round(d.left), r: Math.round(d.right), t: Math.round(d.top), b: Math.round(d.bottom) } }; })()`;

  // ════ desk 1100 (zh) ════
  console.log('── desk 1100 (zh) ──');
  const D = await newPage(1100, 800, false, 'zh');
  check('desk: the app is up', !!D.ready);
  for (let k = 0; k < 4; k++) await D.ev(`(app.createSession({ cwd: ${JSON.stringify(CWD)}, name: ${JSON.stringify(NAMES[k])}, resumeId: ${JSON.stringify(SIDS[k])}, mode: 'chat', backend: 'claude' }), true)`);
  const live = await until(() => D.ev(`(() => { const rows = app.sidebar._webuiSessions || []; const m = Object.fromEntries(rows.map((s) => [s.backendSessionId, s.id])); return ${JSON.stringify(SIDS)}.every((x) => m[x]) ? m : null; })()`), 60000, 300);
  check('desk: four conversations resumed — all four live on the server', !!live, live);
  if (!live) throw new Error('no live sessions');
  for (let k = 0; k < 4; k++) { await D.ev(`(app.ws.send({ type: 'chat-input', sessionId: ${JSON.stringify(live[SIDS[k]])}, text: ${JSON.stringify(ASK[k])} }), true)`); await sleep(400); } // one after the other: the stops have an order
  const facts = await until(() => D.ev(`(() => { const rows = app.sidebar._webuiSessions || []; const f = (sid) => (rows.find((s) => s.backendSessionId === sid) || {}).stoppedBy || null; const out = ${JSON.stringify(SIDS)}.map(f); return out[0] && out[1] && out[2] ? out : null; })()`), 30000, 250);
  check('desk: the REAL stream consumer + wall machine wrote the fact: two quota stops (their stated reset), one overload, the normal turn none', !!facts && facts[0].kind === 'quota' && facts[1].kind === 'quota' && facts[2].kind === 'overload' && facts[3] === null && facts[0].autoResume === false && /hit your limit/.test(facts[0].said) && /529/.test(facts[2].said), { facts, log: hub.log().split('\n').filter((l) => /stopped-by|\[wall\]/.test(l)).slice(-8) });
  await D.ev('(app.sidebar.toggle(true), true)');
  const m1 = await until(() => D.ev(`(() => { const m = ${marks}; return Object.values(m).every(Boolean) && m[${JSON.stringify(NAMES[2])}].mark ? m : null; })()`), 15000, 200);
  const clock = (ms) => { const d = new Date(ms); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  check(`desk: the walled cards wear «${m1?.[NAMES[0]]?.mark}» with «${m1?.[NAMES[0]]?.toggle}» beside it — the WHOLE words (never ellipsized) on the default sidebar width, inside the card`, !!m1 && m1[NAMES[0]].mark === '因用量上限停止 · 上限已重置' && m1[NAMES[1]].mark === '因用量上限停止 · 上限已重置' && m1[NAMES[0]].toggle === '自动继续：关' && m1[NAMES[0]].visible && m1[NAMES[0]].inside && m1[NAMES[0]].toggleIn, m1);
  check(`desk: the overloaded card wears «${m1?.[NAMES[2]]?.mark}»; the normal one wears nothing`, !!m1 && m1[NAMES[2]].mark === `模型过载 · 停于 ${clock(facts[2].at)}` && m1[NAMES[3]].mark === '' && m1[NAMES[3]].toggle === '', m1);
  check('desk: the walls\' order is the order they happened (A before B before C)', !!facts && facts[0].at < facts[1].at && facts[1].at < facts[2].at, facts && facts.slice(0, 3).map((f) => f.at));
  freshReading();
  check('desk: the mark\'s tip carries the CLI\'s own line and how long the mark stays', !!m1 && /原话：You've hit your limit/.test(m1[NAMES[0]].tip) && /再次运行前，这个标记一直保留/.test(m1[NAMES[0]].tip), m1 && m1[NAMES[0]].tip);
  const pMarks = await shot(D.S, 'desk-marks.png');
  // the filter row's pill
  const p1 = await until(() => D.ev(pill), 5000, 150);
  check(`desk: the filter row gains «${p1?.text}»`, !!p1 && p1.text === '因用量上限/过载停止 (3)' && !p1.active, p1);
  await press(D.S, D.ev, '#stopped-quick-tabs .stopped-quick-tab');
  const only = await until(() => D.ev(`(() => { const l = ${listed}; return l.length === 3 ? l : null; })()`), 5000, 150);
  check('desk: a press shows ONLY the three the wall / the overload stopped', !!only && !only.includes(NAMES[3]), only || await D.ev(listed));
  const pFilter = await shot(D.S, 'desk-filter.png');
  await press(D.S, D.ev, '#stopped-quick-tabs .stopped-quick-tab');
  const all4 = await until(() => D.ev(`(() => { const l = ${listed}; return l.length === 4 ? l : null; })()`), 5000, 150);
  check('desk: …a second press shows everything again', !!all4, await D.ev(listed));
  // one card's toggle
  await press(D.S, D.ev, `JS:${cardOf(NAMES[0])}.querySelector('.sess-stopped-autoresume')`);
  const tg1 = await until(() => D.ev(`(() => { const m = ${marks}; return m[${JSON.stringify(NAMES[0])}].toggle === '自动继续：开' ? m[${JSON.stringify(NAMES[0])}] : null; })()`), 5000, 150);
  const srvOn = await until(() => D.ev(`fetch('/api/sessions/stopped').then((r) => r.json()).then((j) => j.counts && j.counts.on === 1 ? j.counts : null)`), 8000, 250);
  const carrierA = await D.ev(`(app.sidebar.getSessionConfig((app.sidebar._allSessions || []).find((s) => s.backendSessionId === ${JSON.stringify(SIDS[0])})) || {}).autoResume === true`);
  check('desk: a press on «自动继续：关» ⇒ «自动继续：开» — the server agrees (1 on) and the resume carrier is written', !!tg1 && !!srvOn && srvOn.total === 4 && carrierA === true, { tg1, srvOn, carrierA });

  // Settings → the auto-resume row
  await D.ev(`(app._settingsUI.open({ category: 'Spending' }), true)`);
  const row = await until(() => D.ev(`(() => { const b = document.querySelector('.auto-resume-bulk'); if (!b) return null; const btn = [...b.querySelectorAll('button')].map((x) => x.textContent); const counts = (b.querySelector('.auto-resume-bulk-counts') || {}).textContent || ''; if (!btn.length) return null; b.scrollIntoView({ block: 'center' }); return { counts, btn, passive: (b.querySelector('.auto-resume-bulk-passive') || {}).textContent || '', note: (b.querySelector('.auto-resume-bulk-note') || {}).textContent || '' }; })()`), 15000, 250);
  check(`desk: Settings — the auto-resume row says «${row?.counts}» with its three buttons`, !!row && row.counts === '将开启 3 个会话；已开启 1 个' && row.btn.join('|') === '对所有会话开启自动继续|全部关闭|恢复所有因用量上限/过载停止的会话 (3)', row);
  check(`desk: …the passive cost line «${row?.passive}» (the dollars; the share SAID to be unknown — no measured ratio)`, !!row && row.passive === '若现在全部恢复：≈ $6.12 · 5 h 窗口占比暂无法估算', row);
  check('desk: …and it says the default above still decides for NEW sessions', !!row && /新会话仍按上面的默认值/.test(row.note), row);
  const pSettings = await shot(D.S, 'desk-settings.png');
  await press(D.S, D.ev, '.auto-resume-bulk .auto-resume-all-on');
  const afterOn = await until(() => D.ev(`(() => { const c = (document.querySelector('.auto-resume-bulk-counts') || {}).textContent; return c === '将开启 0 个会话；已开启 4 个' ? c : null; })()`), 10000, 200);
  const toastOn = await until(() => D.ev(`window.__toastTexts().find((x) => /开启了自动继续/.test(x)) || null`), 5000, 150);
  check(`desk: «对所有会话开启自动继续» ⇒ «${afterOn}», the toast «${toastOn}»`, afterOn === '将开启 0 个会话；已开启 4 个' && /^又为 3 个会话开启了自动继续✕?$/.test(String(toastOn)), { afterOn, toastOn, toasts: await D.ev('window.__toastTexts()') });
  const togglesOn = await until(() => D.ev(`(() => { const m = ${marks}; return [0, 1, 2].every((k) => m[${JSON.stringify(NAMES)}[k]].toggle === '自动继续：开') ? m : null; })()`), 8000, 200);
  const carriers = await D.ev(`${JSON.stringify(SIDS)}.map((sid) => (app.sidebar.getSessionConfig((app.sidebar._allSessions || []).find((s) => s.backendSessionId === sid)) || {}).autoResume)`);
  check('desk: every mark\'s toggle now reads «自动继续：开» (one broadcast) and every resume carrier says on', !!togglesOn && carriers.every((x) => x === true), { carriers, m: togglesOn || await D.ev(marks) });
  await press(D.S, D.ev, '.auto-resume-bulk .auto-resume-all-off');
  const afterOff = await until(() => D.ev(`(() => { const c = (document.querySelector('.auto-resume-bulk-counts') || {}).textContent; return c === '将开启 4 个会话；已开启 0 个' ? c : null; })()`), 10000, 200);
  check(`desk: «全部关闭» ⇒ «${afterOff}»`, afterOff === '将开启 4 个会话；已开启 0 个');
  // the confirm, opened from the row: the cost FIRST
  await press(D.S, D.ev, '.auto-resume-bulk .resume-stopped-open');
  const dlg = await until(() => D.ev(dialogFacts), 8000, 150);
  check(`desk: the confirm — «${dlg?.lead?.slice(0, 40)}…»`, !!dlg && dlg.title === '恢复因用量上限/过载停止的会话' && dlg.lead.startsWith('将继续 3 个会话（最早停止的优先）'), dlg);
  if (!dlg || !/6\.12/.test(dlg.dollars)) console.error('    (the plan the server answered:', JSON.stringify(await D.ev(`fetch('/api/sessions/stopped').then((r) => r.json())`)).slice(0, 1500) + ')');
  check(`desk: …the cost said BEFORE anything runs: «${dlg?.dollars}»`, !!dlg && dlg.dollars === '≈ $6.12（按 opus-5-5 缓存写入价 $5/M，冷读 1.20 M tokens）' && dlg.basis.includes('含每个会话名义上 2000 个输出 tokens'), dlg);
  check(`desk: …the login's share is NOT made up — «${dlg?.member?.[0]}» (named in the person's words, never its ledger key)`, !!dlg && dlg.member.length === 1 && dlg.member[0] === '本机自己的登录：无法估算：本窗口还没有实测比例' && !dlg.basis.some((b) => /未知/.test(b)), dlg && { member: dlg.member, basis: dlg.basis });
  check('desk: …«全部恢复 (3)» + 关闭 (no «只恢复前 K 个»: nothing measured, nothing to cut)', !!dlg && dlg.btns.map((b) => b.text).join('|') === '全部恢复 (3)|关闭', dlg && dlg.btns);
  const pDialog = await shot(D.S, 'desk-dialog.png');
  await press(D.S, D.ev, '#resume-stopped-dialog .btn-cancel');
  check('desk: 关闭 ⇒ nothing ran (no continue reached any CLI, no ledger stamp)', (await until(() => D.ev("!document.getElementById('resume-stopped-dialog')"), 3000, 100)) && SIDS.slice(0, 3).every((sid) => turnsOf(sid).length === 1) && stamps() <= 0, { turns: SIDS.map(turnsOf), stamps: stamps() });

  // ════ desk 1100 (en) — the confirm in English, from the ⋯ ════
  console.log('── desk 1100 (en) ──');
  const E = await newPage(1100, 800, false, 'en');
  check('en: the app is up', !!E.ready);
  await E.ev('(app.sidebar.toggle(true), true)');
  await until(() => E.ev("document.getElementById('session-list-menu')?.offsetParent ? true : null"), 8000, 100);
  await press(E.S, E.ev, '#session-list-menu');
  const emenu = await until(() => E.ev(`(() => { const m = [...document.querySelectorAll('.context-menu')].pop(); return m ? [...m.querySelectorAll('.context-menu-item')].map((n) => ({ text: n.textContent.trim(), svg: !!n.querySelector('svg') })) : null; })()`), 5000, 100);
  check('en: the session list\'s ⋯ holds the two bulk acts (with SVG icons) beside its refresh entry', !!emenu && emenu.map((x) => x.text).join('|') === 'Refresh all live sessions…|Turn auto-continue on for every session|Turn auto-continue off for every session|Resume every session a usage limit or overload stopped (3)…' && emenu.every((x) => x.svg), emenu);
  await press(E.S, E.ev, "JS:[...document.querySelectorAll('.context-menu-item')].find((n) => /Resume every session/.test(n.textContent))");
  const edlg = await until(() => E.ev(dialogFacts), 8000, 150);
  check(`en: the confirm's numbers — «${edlg?.dollars}» / «${edlg?.member?.[0]}»`, !!edlg && edlg.dollars === '≈ $6.12 at opus-5-5 cache-write $5/M, 1.20 M cold tokens' && edlg.member[0] === 'This machine’s own login: cannot estimate — this window has no measured ratio yet' && edlg.btns.map((b) => b.text).join('|') === 'Resume all (3)|Close', edlg);
  const pEn = await shot(E.S, 'en-dialog.png');
  await press(E.S, E.ev, '#resume-stopped-dialog .btn-cancel');

  // ════ phone 390 (zh) ════
  console.log('── phone 390 (zh) ──');
  const Ph = await newPage(390, 844, true, 'zh');
  check('phone: the app is up', !!Ph.ready);
  await Ph.ev('(app.sidebar.toggle(true), true)');
  const pm = await until(() => Ph.ev(`(() => { const m = ${marks}; const p = ${pill}; return m[${JSON.stringify(NAMES[0])}] && m[${JSON.stringify(NAMES[0])}].mark && p ? { m, p } : null; })()`), 15000, 200);
  check(`phone: the drawer's cards wear the same marks and the pill «${pm?.p?.text}» sits in the filter row`, !!pm && pm.m[NAMES[0]].mark === '因用量上限停止 · 上限已重置' && pm.m[NAMES[0]].visible && pm.m[NAMES[0]].inside && pm.m[NAMES[0]].toggleIn && pm.m[NAMES[2]].mark.startsWith('模型过载 · 停于 ') && pm.p.text === '因用量上限/过载停止 (3)' && pm.p.w > 0, pm);
  { let lx = null; await until(async () => { const x = await Ph.ev(`Math.round((${cardOf(NAMES[0])} || document.body).getBoundingClientRect().left)`); const still = x === lx; lx = x; return still; }, 5000, 120); } // the drawer stops sliding first
  const pPhoneMarks = await shot(Ph.S, 'phone-marks.png');
  let lastX = null;
  await until(async () => { const x = await Ph.ev("Math.round(document.getElementById('session-list-menu').getBoundingClientRect().left)"); const still = x === lastX; lastX = x; return still; }, 5000, 120);
  await tap(Ph.S, Ph.ev, '#session-list-menu');
  await until(() => Ph.ev("document.querySelectorAll('.context-menu-item').length >= 4 || null"), 5000, 100);
  await tap(Ph.S, Ph.ev, "JS:[...document.querySelectorAll('.context-menu-item')].find((n) => /恢复所有因用量/.test(n.textContent))");
  const pdlg = await until(() => Ph.ev(dialogFacts), 8000, 150);
  check('phone: the confirm sits inside the viewport, its buttons inside it too', !!pdlg && pdlg.rect.l >= 0 && pdlg.rect.r <= pdlg.vw && pdlg.btns.length === 2 && pdlg.btns.every((b) => b.l >= 0 && b.r <= pdlg.vw && b.b <= pdlg.vh), pdlg);
  const pPhoneDialog = await shot(Ph.S, 'phone-dialog.png');
  await tap(Ph.S, Ph.ev, '#resume-stopped-dialog .btn-cancel');

  // ════ desk (zh): RESUME ALL ════
  console.log('── desk (zh): resume all ──');
  await D.ev(`(document.getElementById('resume-stopped-dialog')?.remove(), true)`);
  await press(D.S, D.ev, '.auto-resume-bulk .resume-stopped-open');
  await until(() => D.ev(dialogFacts), 8000, 150);
  await press(D.S, D.ev, '#resume-stopped-dialog .resume-stopped-all');
  const progress = await until(() => D.ev(`(() => { const f = ${dialogFacts}; return f && /^正在恢复… 已继续 \\d\\/3$/.test(f.status) ? f.status : null; })()`), 8000, 100);
  check(`desk: while it runs the dialog says how far it got — «${progress}»`, !!progress, progress);
  const done = await until(() => D.ev(`(() => { const f = ${dialogFacts}; return f && /^恢复了/.test(f.status) ? f : null; })()`), 45000, 250);
  check(`desk: «全部恢复 (3)» ⇒ «${done?.status}»`, !!done && done.status === '恢复了 3 个 · 跳过 0 个 · 拒绝 0' && done.btns.map((b) => b.text).join('|') === '已完成', done || await D.ev(dialogFacts));
  const turns = SIDS.map(turnsOf);
  check('desk: each stopped CLI received ONE continue — the walls the usage-limit words, the overload ITS words; the normal one nothing', turns[0].length === 2 && turns[0][1] === QUOTA_WORDS && turns[1][1] === QUOTA_WORDS && turns[2].length === 2 && turns[2][1] === CONTINUE_PROMPT_OVERLOAD && turns[3].length === 1, turns);
  const gaps = (() => { const at = hub.log().split('\n').filter((l) => /continued by the bulk resume/.test(l)); return at.length; })();
  check('desk: the server says it: ONE batch authorization for the three, 3 continues, done', /bulk resume rb-[^:]+: 3 authorized as one batch, 0 skipped/.test(hub.log()) && gaps === 3 && /done: resumed 3 · skipped 0 · not delivered 0/.test(hub.log()), hub.log().split('\n').filter((l) => /bulk/.test(l)));
  const st3 = await until(() => (stamps() === 3 ? 3 : null), 5000, 200); // the ledger is written on a 500 ms debounce
  check('desk: the spend ledger holds 3 bulk-resume stamps (charged what was delivered)', st3 === 3, String(stamps()));
  const gone = await until(() => D.ev(`(() => { const m = ${marks}; const p = ${pill}; return Object.values(m).every((x) => x && !x.mark) && !p ? m : null; })()`), 15000, 200);
  check('desk: every mark is gone (the sessions ran again) and so is the filter pill', !!gone, { m: await D.ev(marks), p: await D.ev(pill) });
  const pDone = await shot(D.S, 'desk-done.png');
  check('no page threw', pageErrors.length === 0, pageErrors.slice(0, 3));
  if (PNG_DIR) console.log('  PNGs:', [pMarks, pFilter, pSettings, pDialog, pEn, pPhoneMarks, pPhoneDialog, pDone].filter(Boolean).join(' '));
} catch (e) {
  failed++; console.error('  ✗ the suite threw: ' + (e && e.stack || e));
} finally {
  if (failed) console.error(hub.log().slice(-2500));
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
