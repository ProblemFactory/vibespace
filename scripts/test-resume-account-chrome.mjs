#!/usr/bin/env node
// THE RESUME BAR SAYS WHY THE PINNED ACCOUNT CANNOT SERVE, WITH ITS TWO DOORS — WITH A REAL CHROME (lane
// resume-account-door, owner 2026-10-15 「无法 resume 一个对话」).
// HEAVY: a scratch worktree server (private HOME, fake claude that records its resume argv + account env) + headless
// Chrome clients over raw CDP. Fixtures through the real routes, shaped like the real data: "Account B" (sub-<12hex>
// minted by the server) logged in and then WIPED three days ago (the CLI's wiped shape, the file's mtime), "Account C"
// healthy inside "Pool P", "Account K" an API key and the default. A stopped conversation's per-session config pins B.
//   desk 1100 · the Resume press ⇒ the refusal IN THE BAR (sentence names B and the day it stopped, two buttons), no
//     create sent, no toast; 「重新登录」 opens Manage agents and runs that account's own re-login door (spied — no login
//     terminal, no CLI); the login finishing (accounts-updated) turns the bar back into Resume; B wiped again ⇒ the
//     press re-reads the list and refuses again; 「改用别的账号」 ⇒ the picker PRE-FILLED with the pool ⇒ confirm ⇒ the
//     create carries Pool P, the fake claude resumes the conversation on the pool's credentials dir, the window is live,
//     the on-resume account is saved as Pool P only once the server confirmed the spawn
//   phone 390 · the same refusal, its buttons ≥ 44 px and inside the viewport, the picker open (zh)
//   RED control · the old path (resumeSession without the verdict, as the base's press did) ⇒ the create is refused ⇒
//     a red toast and the bar unchanged — and that last-resort toast now names both doors
// PNGs: $VIBESPACE_RAD_PNG_DIR/{desk,desk-picker,phone,phone-picker,red-toast}.png
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
const PNG_DIR = process.env.VIBESPACE_RAD_PNG_DIR || null;
const [PORT, CDP_PORT] = await freePorts(2);
const VNC_ENV = await vncEnv();
const wt = scratch('rad-chrome');
const fakeHome = scratchHome('rad-home', fs);
const RUNTIME = path.join(fakeHome, 'run'); fs.mkdirSync(RUNTIME, { recursive: true }); fs.chmodSync(RUNTIME, 0o700);
const { fixtureLitter } = require(path.join(repo, 'src/fixture-guard.js'));
const REAL_PROJECTS = path.join(os.homedir(), '.claude', 'projects');
const realBefore = (() => { try { return new Set(fs.readdirSync(REAL_PROJECTS)); } catch { return new Set(); } })();
const NOW = Date.now(), DAY = 86400e3;
const SID_DESK = fixtureSid('ad0001'), SID_PHONE = fixtureSid('ad0002'), SID_RED = fixtureSid('ad0003'); // minted before the worktree: a bad id must not strand it

try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
execSync('npm run build', { cwd: wt, stdio: 'ignore' });

// THE FAKE CLAUDE: answers init with the id it was asked to resume, records argv + which account env it got, then idles
const FAKE_BIN = path.join(fakeHome, 'fake-bin'); fs.mkdirSync(FAKE_BIN, { recursive: true });
const FAKE_CLAUDE = path.join(FAKE_BIN, 'claude');
const FAKE_LOG = path.join(fakeHome, 'fake-claude.log');
fs.writeFileSync(FAKE_CLAUDE, `#!/bin/sh
sid=""; prev=""
for a in "$@"; do [ "$prev" = "--resume" ] && sid="$a"; prev="$a"; done
printf '%s|%s|%s\\n' "$sid" "\${CLAUDE_SECURESTORAGE_CONFIG_DIR:-}" "\${ANTHROPIC_API_KEY:+api-key}" >> ${JSON.stringify(FAKE_LOG)}
case " $* " in *" --output-format "*) sleep 1; printf '{"type":"system","subtype":"init","session_id":"%s","cwd":"%s","model":"claude-fable-5","apiKeySource":"none","tools":[],"mcp_servers":[]}\\n' "$sid" "$PWD";; esac
exec sleep 600
`, { mode: 0o755 });

// two stopped conversations (desk, phone) — transcripts under the private HOME
const CWD = path.join(fakeHome, 'work', 'planning'); fs.mkdirSync(CWD, { recursive: true });
const projDir = path.join(fakeHome, '.claude', 'projects', CWD.replace(/[/._]/g, '-')); fs.mkdirSync(projDir, { recursive: true });
const rec = (sid, i, role, text) => JSON.stringify(role === 'user'
  ? { type: 'user', uuid: `u-${sid.slice(-4)}-${i}`, timestamp: new Date(NOW - 5 * DAY + i * 60000).toISOString(), sessionId: sid, cwd: CWD, message: { role: 'user', content: [{ type: 'text', text }] } }
  : { type: 'assistant', uuid: `a-${sid.slice(-4)}-${i}`, timestamp: new Date(NOW - 5 * DAY + i * 60000).toISOString(), sessionId: sid, cwd: CWD, message: { role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text }], usage: { input_tokens: 10, output_tokens: 5 } } });
for (const sid of [SID_DESK, SID_PHONE, SID_RED]) fs.writeFileSync(path.join(projDir, sid + '.jsonl'), [rec(sid, 1, 'user', 'Draft the quarterly plan outline'), rec(sid, 2, 'assistant', 'Here is a first outline with four sections.'), rec(sid, 3, 'user', 'Tighten section two'), rec(sid, 4, 'assistant', 'Section two now has three bullets.')].join('\n') + '\n');

const baseEnv = { ...process.env }; delete baseEnv.DISPLAY; delete baseEnv.WAYLAND_DISPLAY; delete baseEnv.DBUS_SESSION_BUS_ADDRESS; delete baseEnv.ANTHROPIC_API_KEY;
const srvEnv = { ...baseEnv, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, XDG_RUNTIME_DIR: RUNTIME, VIBESPACE_SKIP_AGENT_HOOKS: '1', CLAUDE_CMD: FAKE_CLAUDE, PATH: FAKE_BIN + ':' + (process.env.PATH || '') };
const srvLog = [];
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: srvEnv, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
srv.stdout.on('data', (d) => srvLog.push(String(d))); srv.stderr.on('data', (d) => srvLog.push(String(d)));
const client = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--window-size=1100,800', `--user-data-dir=${scratch('rad-client')}`, 'about:blank'], { stdio: 'ignore', detached: true });
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

const api = async (p, body) => { const r = await fetch(`http://127.0.0.1:${PORT}${p}`, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return r.json(); };
const WIPED = (dl) => ({ claudeAiOauth: { accessToken: '', refreshToken: '', expiresAt: 0, refreshTokenExpiresAt: dl, scopes: ['user:inference', 'user:profile'] } });
const LIVE = (tag) => ({ claudeAiOauth: { accessToken: 'at-' + tag, refreshToken: 'rt-' + tag, expiresAt: NOW + 6 * 3600e3, refreshTokenExpiresAt: NOW + 25 * DAY, scopes: ['user:inference', 'user:profile'], subscriptionType: 'max' } });

try {
  const up = await until(async () => { if (srv.exitCode !== null) return 'dead'; await fetch(`http://127.0.0.1:${PORT}/api/home`); return 'up'; }, 120000, 250);
  check('the scratch server answers (private HOME + runtime dir)', up === 'up', srvLog.join('').slice(-600));
  if (up !== 'up') throw new Error('no server');

  // ── fixtures through the real routes ──
  const credsOf = (id) => path.join(wt, 'data', 'subs', id, '.credentials.json');
  const mkSub = async (name) => (await api('/api/accounts/subscription', { name })).id;
  const B = await mkSub('Account B'), C = await mkSub('Account C');
  fs.writeFileSync(credsOf(C), JSON.stringify(LIVE('c')));
  const WIPED_AT = Math.round((NOW - 3 * DAY) / 1000) * 1000;
  const wipeB = () => { fs.writeFileSync(credsOf(B), JSON.stringify(WIPED(NOW + 17 * DAY))); fs.utimesSync(credsOf(B), new Date(WIPED_AT), new Date(WIPED_AT)); };
  wipeB();
  const K = (await api('/api/accounts', { name: 'Account K', key: 'sk-ant-api03-' + 'k'.repeat(80) })).account?.id;
  const P = (await api('/api/accounts/pool', { name: 'Pool P', members: [C] })).id;
  await api('/api/accounts/default', { id: K });
  const L0 = await api('/api/accounts');
  check('fixtures: B (sub-<12hex>) wiped, C healthy in Pool P, K the default API key', /^sub-[0-9a-f]{12}$/.test(B) && !!K && !!P && L0.defaultAccountId === K
    && L0.accounts.find((a) => a.id === B)?.loggedIn === false && L0.accounts.find((a) => a.id === B)?.loginState?.state === 'logged-out'
    && L0.accounts.find((a) => a.id === P)?.current === C, L0.accounts?.map((a) => ({ id: a.id, name: a.name, loggedIn: a.loggedIn, ls: a.loginState?.state, current: a.current })));

  const ver = await until(async () => (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json(), 30000);
  const cdp = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((r, e) => { cdp.on('open', r); cdp.on('error', e); });
  let seq = 0; const pend = new Map();
  cdp.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const send = (method, params = {}, sessionId) => new Promise((r) => { const id = ++seq; pend.set(id, r); cdp.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
  // the page's ws: every create it sends + every answer it gets (the money path's evidence), toasts as they appear
  const SPY = `(() => { window.__creates = []; window.__answers = []; window.__toasts = []; window.__toastTexts = () => [...window.__toasts, ...document.querySelectorAll('.global-toast')].map((n) => n.textContent || '');
    const iv = setInterval(() => { if (!window.app || !app.ws || !app.ws.send || app.ws.__spied) return; app.ws.__spied = true; clearInterval(iv);
      const s = app.ws.send.bind(app.ws); app.ws.send = (m) => { try { const o = typeof m === 'string' ? JSON.parse(m) : m; if (o && o.type === 'create') window.__creates.push(o); } catch {} return s(m); };
      app.ws.onGlobal((m) => { if (m && (m.type === 'created' || m.type === 'error')) window.__answers.push({ type: m.type, reqId: m.reqId, message: m.message, billing: m.billing || null, sessionId: m.sessionId }); }); }, 50);
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
    const ready = await until(() => ev("!!(window.app && window.app.wm && app.ws && app.ws.__spied) && !document.getElementById('loading-screen') && (app._accounts?.accounts || []).length > 0"), 60000, 300);
    return { S, ev, ready };
  }
  const shot = async (S, f, clip) => { if (!PNG_DIR) return null; const r = await S('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) }); if (!r.result) return null; fs.mkdirSync(PNG_DIR, { recursive: true }); const out = path.join(PNG_DIR, f); fs.writeFileSync(out, Buffer.from(r.result.data, 'base64')); return out; };
  const press = async (S, ev, sel) => { // a REAL pointer press at the element's centre (what a person's click does)
    const r = await ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const q = e.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; })()`);
    if (!r || r.__err) return false;
    for (const type of ['mousePressed', 'mouseReleased']) await S('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button: 'left', clickCount: 1 });
    return true;
  };
  const tap = async (S, ev, sel) => {
    const r = await ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const q = e.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; })()`);
    if (!r || r.__err) return false;
    await S('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x, y: r.y }] });
    await S('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    return true;
  };
  const view = (sid) => `(app.sidebar.setSessionConfig('claude:' + ${JSON.stringify(sid)}, { account: ${JSON.stringify(B)} }), app.viewSession(${JSON.stringify(sid)}, ${JSON.stringify(CWD)}, 'Quarterly plan', { backend: 'claude', backendSessionId: ${JSON.stringify(sid)} }), true)`;
  const winSel = (sid) => `[...app.wm.windows.values()].find((w) => w._openSpec && w._openSpec.backendSessionId === ${JSON.stringify(sid)} && w._openSpec.action === 'viewSession')`;
  const barFacts = (sid) => `(() => { const w = ${winSel(sid)}; const bar = w && w.element.querySelector('.chat-resume-bar'); if (!bar) return null;
    const btns = [...bar.querySelectorAll('button')].filter((b) => b.offsetParent !== null).map((b) => { const q = b.getBoundingClientRect(); return { cls: b.className, text: b.textContent.trim(), h: Math.round(q.height), l: Math.round(q.left), r: Math.round(q.right), disabled: b.disabled }; });
    const sel = bar.querySelector('.chat-account-pick select'); const pick = bar.querySelector('.chat-account-pick');
    return { account: bar.classList.contains('chat-account-bar'), why: bar.dataset.why || null, note: (bar.querySelector('.chat-resume-note') || {}).textContent || '', btns,
      pickOpen: !!pick && !pick.hidden, picked: sel ? sel.value : null, options: sel ? [...sel.options].map((o) => o.textContent) : [], vw: innerWidth, win: !!w }; })()`;

  // ════ desk 1100 ════
  console.log('── desk 1100 ──');
  const D = await newPage(1100, 800, false, 'zh');
  check('desk: the app is up with the accounts list loaded', !!D.ready);
  await D.ev(view(SID_DESK));
  const deskBar0 = await until(() => D.ev(`(() => { const f = ${barFacts(SID_DESK)}; return f && !f.account && f.btns.length ? f : null; })()`), 30000);
  check('desk: the stopped conversation shows its history and the Resume bar', !!deskBar0 && /恢复此会话/.test(deskBar0.btns[0]?.text || ''), deskBar0);
  await D.ev('(window.__creates.length = 0, window.__toasts.length = 0, true)');
  await press(D.S, D.ev, '.chat-resume-btn');
  const refusal = await until(() => D.ev(`(() => { const f = ${barFacts(SID_DESK)}; return f && f.account ? f : null; })()`), 15000, 150);
  const dayZh = await D.ev(`new Date(${WIPED_AT}).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' })`);
  check(`desk: the press is refused IN THE BAR — 「${refusal?.note}」`, !!refusal && refusal.why === 'wiped' && refusal.note.includes('Account B') && refusal.note.includes(dayZh), { refusal, dayZh });
  check('desk: two doors — 「重新登录 Account B」 then 「改用别的账号」', !!refusal && refusal.btns.length === 2 && refusal.btns[0].text === '重新登录 Account B' && refusal.btns[1].text === '改用别的账号', refusal?.btns);
  const quiet = await D.ev('({ creates: window.__creates.length, toasts: window.__toastTexts() })');
  check('desk: no create was sent and no toast shown — the bar is the answer', quiet.creates === 0 && !quiet.toasts.some((x) => /Account error|账号/.test(x)), quiet);
  check('desk: the window is still there (a refusal never closes the conversation)', await D.ev(`!!${winSel(SID_DESK)}`));
  const winRect = () => D.ev(`(() => { const q = ${winSel(SID_DESK)}.element.getBoundingClientRect(); const x = Math.max(0, q.left), y = Math.max(0, q.top); return { x, y, width: Math.min(innerWidth - x, q.width), height: Math.min(innerHeight - y, q.height) }; })()`);
  const pDesk = await shot(D.S, 'desk.png', await winRect());

  // 「重新登录」: Manage agents opens, and that account's own re-login door runs (spied — no terminal, no CLI)
  await D.ev(`(window.__relogin = [], app._reloginSubscription = (id, a) => { window.__relogin.push([id, a && a.name]); }, true)`);
  await press(D.S, D.ev, '.chat-account-relogin');
  const agents = await until(() => D.ev(`(() => { const rail = app.sidebar && app.sidebar._activeTab === 'agents' && !document.querySelector('#sidebar')?.classList.contains('collapsed'); const modal = !!document.getElementById('agents-dialog-overlay'); return (rail || modal) && window.__relogin.length ? { rail, modal, relogin: window.__relogin } : null; })()`), 10000, 150);
  check('desk: 「重新登录」 opens Manage agents and runs Account B\'s own re-login door', !!agents && agents.relogin.length === 1 && agents.relogin[0][0] === B && agents.relogin[0][1] === 'Account B', agents);
  // the login finishes: B's file holds a live login again, the list broadcasts ⇒ the bar is Resume again
  fs.writeFileSync(credsOf(B), JSON.stringify(LIVE('b')));
  await D.ev(`app.refreshAccounts().then(() => { app.ws.globalHandlers.forEach((h) => { try { h({ type: 'accounts-updated', accounts: app._accounts.accounts, defaultAccountId: app._accounts.defaultAccountId, defaultCodexAccountId: app._accounts.defaultCodexAccountId }); } catch (e) {} }); return true; })`);
  const back = await until(() => D.ev(`(() => { const f = ${barFacts(SID_DESK)}; return f && !f.account && /恢复此会话/.test(f.btns[0]?.text || '') ? f : null; })()`), 10000, 150);
  check('desk: the re-login finished (accounts-updated) ⇒ the bar is Resume again', !!back, back);
  // wiped again ⇒ the press re-reads the list (fresh facts) and refuses again
  wipeB();
  await press(D.S, D.ev, '.chat-resume-btn');
  const again = await until(() => D.ev(`(() => { const f = ${barFacts(SID_DESK)}; return f && f.account ? f : null; })()`), 15000, 150);
  check('desk: wiped again ⇒ the press re-reads the accounts list and refuses again (no create)', !!again && again.why === 'wiped' && (await D.ev('window.__creates.length')) === 0, again);

  // 「改用别的账号」 ⇒ the picker, PRE-FILLED with the pool ⇒ confirm ⇒ the resume proceeds on it
  await press(D.S, D.ev, '.chat-account-switch');
  const picker = await until(() => D.ev(`(() => { const f = ${barFacts(SID_DESK)}; return f && f.pickOpen ? f : null; })()`), 5000, 100);
  check(`desk: 「改用别的账号」 opens the picker pre-filled with the pool — ${JSON.stringify(picker?.options)}`, !!picker && picker.picked === P && picker.options[0] === 'Pool P（池）' && picker.options.includes('Account K（默认账号）') && !picker.options.some((o) => /Account B/.test(o)), picker);
  const pDeskPick = await shot(D.S, 'desk-picker.png', await winRect());
  const fakeBefore = fs.existsSync(FAKE_LOG) ? fs.readFileSync(FAKE_LOG, 'utf8') : '';
  await press(D.S, D.ev, '.chat-account-go');
  const created = await until(() => D.ev(`(() => { const c = window.__creates.find((x) => x.resumeId === ${JSON.stringify(SID_DESK)}); const a = c && window.__answers.find((x) => x.reqId === c.reqId); return a ? { create: { accountId: c.accountId, resumeId: c.resumeId }, answer: a } : null; })()`), 30000, 200);
  check('desk: confirm ⇒ the create carries Pool P and the server answers created', !!created && created.create.accountId === P && created.answer.type === 'created', created);
  const fakeLine = await until(() => { const s = fs.existsSync(FAKE_LOG) ? fs.readFileSync(FAKE_LOG, 'utf8').slice(fakeBefore.length) : ''; return s.split('\n').find((l) => l.startsWith(SID_DESK + '|')) || null; }, 20000, 200);
  check(`desk: the fake claude resumed THIS conversation on the pool (its per-session link ${((fakeLine || '').split('|')[1] || '-').replace(wt, '<wt>')})`, !!fakeLine && fakeLine.split('|')[1].includes(path.join('pool-links', P) + path.sep), fakeLine);
  const live = await until(() => D.ev(`(() => { const s = [...app.sessions.values()].find((v) => v && v.sessionId === ${JSON.stringify(created?.answer?.sessionId || '-')}); return s && !s._readOnly ? { live: true, cfg: app.sidebar.getSessionConfig('claude:' + ${JSON.stringify(SID_DESK)}), oldWin: !!${winSel(SID_DESK)} } : null; })()`), 20000, 200);
  check('desk: the conversation is live, the read-only window replaced, the on-resume account saved as Pool P (after the spawn)', !!live && live.cfg?.account === P && live.oldWin === false, live);

  // ════ RED control: the base's page — no verdict anywhere ════
  console.log('── RED control: no verdict (the base\'s press) ──');
  const pressIn = async (sid, sel) => press(D.S, D.ev, `.vs-rad-${sid.slice(-4)} ${sel}`);
  const tagWin = (sid) => D.ev(`(() => { const w = ${winSel(sid)}; if (!w) return false; w.element.classList.add('vs-rad-' + ${JSON.stringify(sid.slice(-4))}); return true; })()`);
  await D.ev(`(window.__creates.length = 0, app.resumeAccountCheck = null, true)`);
  await D.ev(view(SID_RED));
  await until(() => D.ev(`(() => { const f = ${barFacts(SID_RED)}; return f && !f.account && f.btns.length ? f : null; })()`), 30000);
  await until(() => tagWin(SID_RED), 5000, 100);
  await pressIn(SID_RED, '.chat-resume-btn');
  const red = await until(() => D.ev(`(() => { const t = window.__toastTexts().find((x) => /Account error/.test(x)); return t ? { toast: t, creates: window.__creates.length } : null; })()`), 30000, 200);
  await sleep(4000); // longer than the press's bounded re-read: a page with no verdict never draws the refusal
  const redBar = await D.ev(`(() => { const f = ${barFacts(SID_RED)}; return f ? { account: f.account, btns: f.btns.map((b) => b.text) } : null; })()`);
  check(`RED: with no verdict the press goes to the create ⇒ a red toast and the plain Resume bar — "${(red?.toast || '').slice(0, 90)}"`, !!red && red.creates === 1 && /subscription not logged in: Account B/.test(red.toast) && !!redBar && redBar.account === false, { red, redBar });
  check('the last-resort toast now names both doors (Manage agents, Session Properties)', !!red && /Manage agents/.test(red.toast) && /Session Properties/.test(red.toast), red?.toast);
  const pRed = await shot(D.S, 'red-toast.png');
  // the verdict back; a resume that never asks (the sidebar card's resumeSession) ⇒ the create refuses ⇒ the rescued
  // window's bar says it with its doors
  await D.ev(`(delete app.resumeAccountCheck, window.__creates.length = 0, app.resumeSession(${JSON.stringify(SID_RED)}, ${JSON.stringify(CWD)}, 'Quarterly plan', { mode: 'chat', backend: 'claude', backendSessionId: ${JSON.stringify(SID_RED)} }), true)`);
  const cardBar = await until(() => D.ev(`(() => { const f = ${barFacts(SID_RED)}; return f && f.account ? { why: f.why, btns: f.btns.map((b) => b.text), creates: window.__creates.length } : null; })()`), 30000, 200);
  check('the card path (resumeSession, never asked): the create refuses ⇒ the rescued window\'s bar says it with its two doors', !!cardBar && cardBar.why === 'wiped' && cardBar.creates === 1 && cardBar.btns.join('|') === '重新登录 Account B|改用别的账号', cardBar);

  // ════ phone 390 ════
  console.log('── phone 390 ──');
  const Ph = await newPage(390, 844, true, 'zh');
  check('phone: the app is up', !!Ph.ready);
  await Ph.ev(view(SID_PHONE));
  const pbar0 = await until(() => Ph.ev(`(() => { const f = ${barFacts(SID_PHONE)}; return f && !f.account && f.btns.length ? f : null; })()`), 30000);
  check('phone: the Resume bar', !!pbar0, pbar0);
  await tap(Ph.S, Ph.ev, '.chat-resume-btn');
  const pref = await until(() => Ph.ev(`(() => { const f = ${barFacts(SID_PHONE)}; return f && f.account ? f : null; })()`), 15000, 150);
  check(`phone: the refusal in the bar — 「${pref?.note}」`, !!pref && pref.why === 'wiped' && pref.note.includes('Account B'), pref);
  check('phone: both doors ≥ 44 px tall and inside the viewport', !!pref && pref.btns.length === 2 && pref.btns.every((b) => b.h >= 44 && b.l >= 0 && b.r <= pref.vw), pref?.btns);
  const pPhone = await shot(Ph.S, 'phone.png');
  await tap(Ph.S, Ph.ev, '.chat-account-switch');
  const ppick = await until(() => Ph.ev(`(() => { const f = ${barFacts(SID_PHONE)}; return f && f.pickOpen ? f : null; })()`), 5000, 100);
  check('phone: the picker opens pre-filled with the pool, its buttons ≥ 44 px inside the viewport', !!ppick && ppick.picked === P && ppick.btns.filter((b) => /chat-account-(go|cancel)/.test(b.cls)).every((b) => b.h >= 44 && b.r <= ppick.vw), ppick);
  const pPhonePick = await shot(Ph.S, 'phone-picker.png');
  if (PNG_DIR) console.log('  PNGs:', [pDesk, pDeskPick, pRed, pPhone, pPhonePick].filter(Boolean).join(' '));
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
