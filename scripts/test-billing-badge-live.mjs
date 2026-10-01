#!/usr/bin/env node
// THE TITLE-BAR BILLING CHIP FOLLOWS THE POOL ON A REAL PAGE (lane badge-stale, 2026-09-30 — the owner:
// "你的最新消息显示的是走的 UCI Max，但是右上角写的是 Mat Max": the pool engine had moved the conversation's
// per-session link Mat → UCI at 10:49–10:52 PDT, the server's `active-sessions` frame said UCI, the
// message-meta popup said UCI, and the window's title chip said Mat 30+ minutes later).
//
// THE CAUSE, measured on this harness before the fix: accounts.js `ensureSessionPoolLink` — the ONE writer of a
// per-session pool link — moved the link and notified NOBODY, so no `active-sessions` frame went out (0 frames in
// 16 s); the page's only source of `auth` is that frame (/api/sessions carries none), and every 5 s poll merge
// re-judged the STALE frame and re-applied the OLD member. The pool DEFAULT's writer (setPoolTarget) notifies,
// which is why a default move always repainted. A fake-DOM test cannot see this: it feeds the frame itself.
// THE SECOND FINDING, on this harness once the frame arrived: a grouped window's chip (a tab-group guest, a split pane,
// a layout-restored pair) named the new member on a NEW node every time — setTitleMeta, written for every window on
// every merge, had no no-op guard and re-drew the whole tab strip each poll (test-title-meta-guard has its control).
//
// THE HARNESS: a throwaway server in a git worktree under /tmp/vs-badge-<pid> (own data/, own HOME), a pool of two
// FAKE subscriptions (fake token files — never a real credential, never a vendor call), the pool as the instance
// default, pooled sessions behind a stub claude through the REAL create path (chat-wrapper / pty-wrapper), their
// windows in headless chrome at 1400×900. The ENGINE's writer is driven IN-PROCESS: a `-r` preload hook captures
// the server's AccountManager and runs `accounts.ensureSessionPoolLink(pool, sid, member, {why:
// 'per-session-switch'})` — byte for byte what usage-pool-engine.js does at its per-session switch — from a
// command file (main thread only: the preload also runs in the SafeFs workers).
//
// LEGS — each: mark the chip node, move the member, the SAME node names the new member within 10 s:
//   ① a standalone chat window                         ② the pool DEFAULT move (pool-switch) of a linkless session
//   ③ a terminal-mode window                            ④ a tab-group GUEST (the chip on its tab, the host in front)
//   ⑤ the same pair side by side (a split pane)         ⑥ a window RESTORED by the layout replay after a reload
//   ⑦ the Stage hero                                    QUIET: a merge that changes nothing keeps every chip node
//                                                          (≥ 3 merges + a frame, the split pair's tabs + the terminal)
//   CONTROL: the PRE-FIX writer (scripts/mutant-copy.mjs: ensureSessionPoolLink without its notify, called on the
//   live store) ⇒ the server says the new member, the page re-judges ≥ 2 polls and the chip STAYS on the old one;
//   the fixed writer then brings it over (the page was healthy all along). An attempt during which any unrelated
//   frame reached the page is void (that frame would carry the fact) and runs again, ≤ 3 times.
// Requires google-chrome + dtach (SKIP without). Run: node scripts/test-billing-badge-live.mjs
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
try { execSync('command -v dtach', { stdio: 'ignore' }); } catch { console.log('SKIP: no dtach'); process.exit(0); }
const VNC_ENV = await vncEnv();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0, passed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)) : ''}`); } };
const S = JSON.stringify;

const [PORT, CDP_PORT] = await freePorts(2);
const ROOT = scratch('badge');
const wt = path.join(ROOT, 'wt');
const HOME = path.join(ROOT, 'home');
const CWD = path.join(HOME, 'proj');
fs.mkdirSync(CWD, { recursive: true });
for (const d of ['.claude/projects', '.claude/sessions', '.config', '.vibespace']) fs.mkdirSync(path.join(HOME, d), { recursive: true });

// ── the throwaway server tree (no rebuild: overlays the built public/) ──
if (!fs.existsSync(path.join(repo, 'public', 'bundle.js'))) { console.log('SKIP: public/bundle.js not built (npm run build)'); process.exit(0); }
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });

// ── the pool: two FAKE subscriptions; the pool default = Alpha; the instance default = the pool ──
const { AccountManager } = require(path.join(wt, 'src/accounts.js'));
const am = new AccountManager({ dataDir: path.join(wt, 'data') });
const fake = (name) => {
  const a = am.createSubscription({ name });
  fs.writeFileSync(path.join(am.subDir(a.id), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'fake-' + a.id, refreshToken: 'fake-rt', expiresAt: Date.now() + 30 * 86400e3, refreshTokenExpiresAt: Date.now() + 60 * 86400e3, scopes: ['user:inference'] } }));
  return a.id;
};
const A = fake('Alpha Max'), B = fake('Beta Max');
const NAME = { [A]: 'Alpha Max', [B]: 'Beta Max' };
const SHORT = { [A]: 'Alpha M', [B]: 'Beta Max' }; // what every chip form but the icon shows (title-chips memberShortName, 8 characters)
const other = (m) => (m === A ? B : A);
const POOL = am.createPool({ name: '全部', members: [A, B] }).id;
am.setPoolTarget(POOL, A);
am.setDefault(POOL, 'claude');

// ── the PRE-FIX writer (the control): the same accounts.js with ensureSessionPoolLink's notify removed ──
const M = mutantCopies('badge', wt);
const accSrc = fs.readFileSync(path.join(wt, 'src/accounts.js'), 'utf8');
const NOTIFY_LINE = /\n[ \t]*this\._notifyLinks\(\);[^\n]*(\n[ \t]*return link;)/;
const preSrc = accSrc.replace(NOTIFY_LINE, '$1');
const PRE = M.write('src/accounts.js', preSrc, 'pre-fix');
{
  const body = (src) => (/ensureSessionPoolLink\(poolId, sessKey, memberId[^]*?\n  \}\n/.exec(src) || [''])[0];
  check('the control is the pre-fix writer: ensureSessionPoolLink without its notify, nothing else changed (a patched copy outside the tree)',
    NOTIFY_LINE.test(accSrc) && /_notifyLinks\(\)/.test(body(accSrc)) && !/_notifyLinks\(\)/.test(body(preSrc)) && preSrc.split('\n').length === accSrc.split('\n').length - 1 && !PRE.startsWith(repo), { pre: PRE });
}

// ── the in-process hook: capture the server's AccountManager; a command file drives the ENGINE's writer ──
const CMD = path.join(ROOT, 'cmd.json'), RES = path.join(ROOT, 'res.json');
const HOOK = path.join(ROOT, 'hook.cjs');
fs.writeFileSync(HOOK, `
if (require('worker_threads').isMainThread) {
  const fs = require('fs');
  const Mod = require(${S(path.join(wt, 'src/accounts.js'))});
  const Orig = Mod.AccountManager;
  Mod.AccountManager = class extends Orig { constructor(o) { super(o); global.__vsBadgeAccounts = this; } };
  setInterval(() => {
    let c; try { c = JSON.parse(fs.readFileSync(${S(CMD)}, 'utf8')); fs.unlinkSync(${S(CMD)}); } catch { return; }
    let out;
    try {
      const am = global.__vsBadgeAccounts;
      if (c.op === 'link') { am.ensureSessionPoolLink(c.pool, c.sid, c.member, { why: 'per-session-switch' }); out = { ok: true }; }
      else if (c.op === 'link-pre') { require(${S(PRE)}).AccountManager.prototype.ensureSessionPoolLink.call(am, c.pool, c.sid, c.member, { why: 'per-session-switch' }); out = { ok: true }; }
      else if (c.op === 'unlink') { am.dropSessionPoolLink(c.pool, c.sid); out = { ok: true }; }
      else if (c.op === 'default') { am.setPoolTarget(c.pool, c.member, { why: 'pool-switch' }); out = { ok: true }; }
      else if (c.op === 'cur') out = { ok: true, cur: am.poolCurrentFor(c.pool, c.sid), def: am.poolCurrent(c.pool) };
    } catch (e) { out = { ok: false, error: e.message }; }
    fs.writeFileSync(${S(RES)}, JSON.stringify(out));
  }, 50).unref();
}
`);
const command = async (c) => {
  try { fs.unlinkSync(RES); } catch {}
  fs.writeFileSync(CMD, JSON.stringify(c));
  for (let i = 0; i < 100; i++) { try { const r = JSON.parse(fs.readFileSync(RES, 'utf8')); fs.unlinkSync(RES); return r; } catch {} await sleep(50); }
  return { ok: false, error: 'hook never answered' };
};

// A stub `claude` (the test-mobile-gaps precedent): answers the boot probes, announces a stream-json init frame with
// its OWN synthetic session id (the fixture family — discovery and the usage walk refuse it), then idles on stdin
const STUB = path.join(ROOT, 'claude-stub');
fs.writeFileSync(STUB, `#!/bin/sh
for a in "$@"; do case "$a" in --version) echo "2.1.274 (Claude Code) stub"; exit 0;; --help) echo "Usage: claude [options]"; exit 0;; esac; done
sid=$(printf 'e2e00000-0000-4000-8000-%012x' $$)
printf '{"type":"system","subtype":"init","session_id":"%s","model":"claude-fable-5","cwd":"%s","tools":[],"permissionMode":"default","apiKeySource":"none","claude_code_version":"2.1.274"}\\n' "$sid" "$PWD"
exec cat >/dev/null
`, { mode: 0o755 });

const srvLog = fs.openSync(path.join(ROOT, 'server.log'), 'w');
const srv = spawn(process.execPath, ['-r', HOOK, 'server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME, CLAUDE_CMD: STUB, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' }, stdio: ['ignore', srvLog, srvLog] });
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-timer-throttling', `--user-data-dir=${ROOT}/chrome`, 'about:blank'], { stdio: 'ignore' });
let cleaned = false;
const cleanup = () => {
  if (cleaned) return; cleaned = true;
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv.kill('SIGKILL'); } catch {}
  try { endRootedProcesses(ROOT); } catch {} // the sessions' dtach masters + wrappers + stub CLIs outlive the server by design — the suite ends what its server started
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  if (!process.env.KEEP_BADGE) try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {}
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });
for (let i = 0; i < 120; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); break; } catch { await sleep(250); } }

// ── raw CDP ──
const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 120 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((x) => x.type === 'page'); } catch {} if (!target) await sleep(250); }
if (!target) { console.error('✗ chrome never exposed a CDP page target'); process.exit(1); }
const sock = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => sock.on('open', r));
let seq = 0; const pend = new Map(); const pageErrors = [];
sock.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') { try { pageErrors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'unknown'); } catch {} }
});
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); sock.send(JSON.stringify({ id, method, params })); });
const evalJs = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await evalJs(expr)) return true; await sleep(200); } return evalJs(expr); };
const waitApp = () => evalJs('new Promise((res, rej) => { const t0 = Date.now(); (function w() { if (window.app) return res(app.ready); if (Date.now() - t0 > 20000) return rej(new Error("no app after 20s")); setTimeout(w, 200); })(); })');
const click = async (sel) => {
  const pt = await evalJs(`(() => { const el = document.querySelector(${S(sel)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  if (!pt) throw new Error('click: no element for ' + sel);
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  await sleep(40);
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  await sleep(100);
};

// The page's instrumentation (re-installed after a reload): every `active-sessions` frame and every identity sync
const INSTRUMENT = `(() => {
  if (window.__bb) return true;
  const B = window.__bb = { frames: 0, syncs: 0 };
  app.ws.onGlobal((m) => { if (m.type === 'active-sessions') B.frames++; });
  const o = app.syncSessionIdentity.bind(app);
  app.syncSessionIdentity = (all) => { B.syncs++; return o(all); };
  return true;
})()`;
/** The chip of the window showing session `sid`, wherever it lives: a standalone title bar, or its TAB in its
 *  chain host's strip. `mark` stamps the node (a plain property) so a later read proves it is the SAME node. */
const chipExpr = (sid, mark = null) => `(() => {
  const e = [...app.sessions.entries()].find(([, s]) => s.sessionId === ${S(sid)});
  if (!e) return { none: 'no window holds the session' };
  const wid = e[0], w = app.wm.windows.get(wid);
  if (!w) return { none: 'no window' };
  const host = w._tabChain ? app.wm.windows.get(w._tabChain.tabs[0]) : w;
  const el = w._tabChain ? host.titleBar.querySelector('.tab-item[data-win-id="' + wid + '"] .win-auth-badge') : w.titleBar.querySelector(':scope > .win-auth-badge');
  if (!el) return { none: 'no chip', wid, tabbed: !!w._tabChain };
  ${mark ? `el.__bbMark = ${S(mark)};` : ''}
  const r = el.getBoundingClientRect();
  return { wid, type: w.type, tabbed: !!w._tabChain, split: !!(w._tabChain && w._tabChain.layout === 'split'), hero: !!w._isStageHero,
    words: (el.dataset.words || '').split('\\n')[1] || '', shown: el.innerText, tip: el.dataset.tip || '', mark: el.__bbMark || null,
    visible: r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' };
})()`;
const cur = async (sid) => (await command({ op: 'cur', pool: POOL, sid })).cur;

/** Create a pooled session through the real create path on a side socket; → its webui id. */
const createSession = async (mode = 'chat') => {
  const side = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  await new Promise((r) => side.on('open', r));
  const frames = [];
  side.on('message', (d) => { try { frames.push(JSON.parse(String(d))); } catch {} });
  side.send(JSON.stringify({ type: 'create', backend: 'claude', mode, cwd: CWD, reqId: 'bb-' + Date.now() }));
  let sid = null;
  for (let i = 0; i < 80 && !sid; i++) { const f = frames.find((m) => m?.type === 'created'); if (f) sid = f.sessionId; else await sleep(250); }
  try { side.close(); } catch {}
  return sid;
};
const attach = async (sid, name, mode = 'chat') => {
  await evalJs(`app.attachSession(${S(sid)}, ${S(name)}, ${S(CWD)}, { mode: ${S(mode)}, backend: 'claude' }); true`);
  return waitFor(`(() => { const c = ${chipExpr(sid)}; return !!(c && c.words); })()`, 20000);
};

/** THE LEG: mark the chip, run `move` (which must put `sid` on `to`), the SAME node names `to` within 10 s. */
const leg = async (label, sid, to, move) => {
  const before = await evalJs(chipExpr(sid, label));
  const from = Object.keys(NAME).find((k) => NAME[k] !== NAME[to] && before.words && before.words.includes(NAME[k]));
  const f0 = await evalJs('__bb.frames');
  const r = await move();
  const serverSays = await cur(sid);
  const t0 = Date.now();
  let after = null;
  while (Date.now() - t0 < 10000) { after = await evalJs(chipExpr(sid)); if (after.words && after.words.includes(NAME[to])) break; await sleep(250); }
  const ms = Date.now() - t0;
  const frames = (await evalJs('__bb.frames')) - f0;
  check(`${label}: the server moves the conversation ${from ? NAME[from] + ' → ' : ''}${NAME[to]} (${r && r.ok ? 'writer ok' : S(r)}; the link now resolves to ${NAME[serverSays] || serverSays})`, r && r.ok && serverSays === to && !!from, { r, serverSays, before });
  check(`${label}: the title chip names ${NAME[to]} within 10 s (${ms} ms, ${frames} active-sessions frame(s)) — words "${after && after.words}", shown "${after && after.shown}"`,
    !!after && after.words.includes(NAME[to]) && after.shown.includes(SHORT[to]) && after.tip.includes(NAME[to]) && ms < 10000, { before, after });
  check(`${label}: …on the SAME chip node, visible (patched in place, never a new chip)`, !!after && after.mark === label && after.visible, after);
  return { before, after };
};

try {
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await waitApp();
  await sleep(800);
  await evalJs(INSTRUMENT);

  const S1 = await createSession('chat');
  check('a pooled claude chat session is created through the real spawn path (stub CLI behind the real chat-wrapper), on its own per-session link to Alpha', !!S1 && (await cur(S1)) === A, { S1 });
  check('its window opens with the pooled title chip naming Alpha', await attach(S1, 'badge one') && (await evalJs(chipExpr(S1))).words.includes('Alpha Max'), await evalJs(chipExpr(S1)));

  console.log('① a standalone chat window, the engine\'s per-session switch');
  await leg('① standalone', S1, B, () => command({ op: 'link', pool: POOL, sid: S1, member: B }));

  console.log('② the pool DEFAULT move of a conversation without its own link (pool-switch)');
  // the link and the default agree first (B), so dropping the link changes nothing anyone could see
  await command({ op: 'default', pool: POOL, member: B }); await sleep(600);
  await command({ op: 'unlink', pool: POOL, sid: S1 });
  check('…the conversation now follows the pool default (B), its own link gone', (await cur(S1)) === B && (await command({ op: 'cur', pool: POOL, sid: 'no-such-link' })).cur === B);
  await leg('② default move', S1, A, () => command({ op: 'default', pool: POOL, member: A }));
  // back to a per-session link (the engine's first per-session move creates it)
  await leg('② …then its own link again', S1, B, () => command({ op: 'link', pool: POOL, sid: S1, member: B }));

  console.log('③ a terminal-mode window');
  const S3 = await createSession('terminal');
  check('a pooled TERMINAL session is created (stub CLI behind the real pty-wrapper) and its window shows the chip', !!S3 && await attach(S3, 'badge term', 'terminal'), { S3, chip: S3 && await evalJs(chipExpr(S3)) });
  await leg('③ terminal', S3, other(await cur(S3)), async () => command({ op: 'link', pool: POOL, sid: S3, member: other(await cur(S3)) }));

  console.log('④ a tab-group guest (its chip on its TAB, the host in front)');
  const S2 = await createSession('chat');
  check('a second pooled chat window opens', !!S2 && await attach(S2, 'badge two'));
  const grouped = await evalJs(`(() => {
    const byS = (sid) => app.wm.windows.get([...app.sessions.entries()].find(([, s]) => s.sessionId === sid)[0]);
    const host = byS(${S(S2)}), guest = byS(${S(S1)});
    app.wm.createTabChain(host, guest);
    const ch = host._tabChain; const hi = ch.tabs.indexOf(host.id);
    if (ch.active !== hi) app.wm.switchTab(ch, hi);
    return { tabs: ch.tabs, host: host.id, guest: guest.id, active: ch.tabs[ch.active] };
  })()`);
  await sleep(600);
  const g0 = await evalJs(chipExpr(S1));
  check(`S1 is a GUEST of S2's chain, not the tab in front (its chip rides its tab: ${S(g0.words)})`, grouped.tabs.length === 2 && grouped.active === grouped.host && g0.tabbed && !!g0.words, { grouped, g0 });
  await leg('④ tab-group guest', S1, A, () => command({ op: 'link', pool: POOL, sid: S1, member: A }));
  await leg('④ …and the host tab in front', S2, other(await cur(S2)), async () => command({ op: 'link', pool: POOL, sid: S2, member: other(await cur(S2)) }));

  console.log('⑤ side by side (a split pane)');
  const split = await evalJs(`(() => { const byS = (sid) => app.wm.windows.get([...app.sessions.entries()].find(([, s]) => s.sessionId === sid)[0]); const host = byS(${S(S2)}); app.wm.splitActive(host._tabChain); const ch = host._tabChain; return { layout: ch.layout, pair: ch.split && ch.split.pair }; })()`);
  await sleep(700);
  check(`the pair is side by side (${S(split)})`, split.layout === 'split' && (await evalJs(chipExpr(S1))).split, { split, c: await evalJs(chipExpr(S1)) });
  await leg('⑤ split pane', S1, B, () => command({ op: 'link', pool: POOL, sid: S1, member: B }));

  console.log('…and nothing moves: every chip survives two polls and a frame untouched');
  {
    // every merge (the 5 s poll, every frame) re-judges every window; a merge that changes nothing must change no node
    const marks = await evalJs(`(() => { const out = []; for (const w of app.wm.windows.values()) for (const el of w.titleBar.querySelectorAll('.win-auth-badge')) { el.__bbQuiet = 'q'; out.push(1); } return out.length; })()`);
    const s0 = await evalJs('__bb.syncs'), f0 = await evalJs('__bb.frames');
    await command({ op: 'link', pool: POOL, sid: S3, member: await cur(S3) }); // a same-target re-point: one frame, no fact moved
    await sleep(11000);
    const kept = await evalJs(`(() => { let all = 0, kept = 0; for (const w of app.wm.windows.values()) for (const el of w.titleBar.querySelectorAll('.win-auth-badge')) { all++; if (el.__bbQuiet === 'q') kept++; } return { all, kept }; })()`);
    const syncs = (await evalJs('__bb.syncs')) - s0, frames = (await evalJs('__bb.frames')) - f0;
    check(`${marks} chip(s) on the page (the split pair's two tabs, the terminal) are the SAME nodes after ${syncs} merges (${frames} frame(s)) — a merge that changes nothing re-draws no tab strip`,
      marks >= 3 && kept.all === marks && kept.kept === marks && syncs >= 3 && frames >= 1, { marks, kept, syncs, frames });
  }

  console.log('⑥ a window restored by the layout replay (the page reloaded)');
  // a REAL input marks this client user-dirty (layout.js only saves what a person caused), then one autosave
  await click('#toolbar .toolbar-title').catch(() => click('#taskbar'));
  await evalJs('app.layoutManager._doAutoSave(); true');
  const saved = await (async () => { for (let i = 0; i < 40; i++) { try { const j = JSON.stringify(await (await fetch(`http://127.0.0.1:${PORT}/api/layouts`)).json()); if (j.includes(S1) && j.includes(S2)) return true; } catch {} await sleep(250); } return false; })();
  check('the layout (both chats, their pair) reached the server', saved);
  await cdp('Page.reload', { ignoreCache: false });
  await sleep(500);
  await waitApp();
  await evalJs(INSTRUMENT);
  const restored = await waitFor(`(() => { const c = ${chipExpr(S1)}; return !!(c && c.words && c.words.includes('Beta Max')); })()`, 25000);
  const rc = await evalJs(chipExpr(S1));
  const rs = await evalJs(`(() => { const e = [...app.sessions.entries()].find(([, s]) => s.sessionId === ${S(S1)}); const w = e && app.wm.windows.get(e[0]); return w ? { spec: w._openSpec && { action: w._openSpec.action, serverId: w._openSpec.serverId || null, bsid: w._openSpec.backendSessionId || null }, sessionId: e[1].sessionId } : null; })()`);
  check(`after the reload the layout replay restored S1's window with its chip (${S(rc.words)}; openSpec ${S(rs && rs.spec)})`, restored && !!rs, { rc, rs });
  await leg('⑥ layout-restored', S1, A, () => command({ op: 'link', pool: POOL, sid: S1, member: A }));

  console.log('⑦ the Stage hero');
  await evalJs(`app.settings.set('desktop.dynamicEnabled', true); true`);
  await sleep(600);
  check('the Stage is enabled', await evalJs('!!(app.stage && app.stage.enabled)'));
  await evalJs(`(async () => { app.stage.saveSlot({ left: 0.3, top: 0, width: 0.7, height: 0.8 }); await app.stage.enter(); return true; })()`);
  await sleep(600);
  const S4 = await createSession('chat');
  check('a pooled chat session opened while staged', !!S4 && await attach(S4, 'badge hero'));
  const heroOk = await waitFor(`(() => { const h = app.stage._heroWinId && app.wm.windows.get(app.stage._heroWinId); return !!(h && (app.sessions.get(h.id) || {}).sessionId === ${S(S4)}); })()`, 12000);
  check('…is the Stage hero', heroOk && (await evalJs(chipExpr(S4))).hero, await evalJs(chipExpr(S4)));
  await leg('⑦ Stage hero', S4, other(await cur(S4)), async () => command({ op: 'link', pool: POOL, sid: S4, member: other(await cur(S4)) }));
  await evalJs('(async () => { await app.stage.leave(); return true; })()');
  await sleep(800);

  console.log('CONTROL: the pre-fix writer (no notify) on the same page');
  {
    // Judged only over a window in which NO frame reached the page: a frame the scratch server sends for another
    // reason would carry the moved fact (the bug's own escape hatch — the owner's page waited for exactly such a
    // frame for 30+ min), so such an attempt is VOID and runs once more (never judged either way)
    let judged = null;
    for (let attempt = 1; attempt <= 3 && !judged; attempt++) {
      const c0 = await evalJs(chipExpr(S1, 'control'));
      const from = Object.keys(NAME).find((k) => c0.words && c0.words.includes(NAME[k]));
      const to = other(from);
      const f0 = await evalJs('__bb.frames'), s0 = await evalJs('__bb.syncs');
      const r = await command({ op: 'link-pre', pool: POOL, sid: S1, member: to });
      const serverSays = await cur(S1);
      await sleep(12000);
      const c1 = await evalJs(chipExpr(S1));
      const frames = (await evalJs('__bb.frames')) - f0, syncs = (await evalJs('__bb.syncs')) - s0;
      if (frames > 0) { console.log(`  · control attempt ${attempt} void: ${frames} unrelated frame(s) reached the page`); continue; }
      judged = { from, to, r, serverSays, c0, c1, frames, syncs };
    }
    check('the control ran over a window with no unrelated frame (≤ 3 attempts)', !!judged);
    if (judged) {
      const { from, to, r, serverSays, c0, c1, syncs } = judged;
      check(`the pre-fix writer moves the link too (${NAME[from]} → ${NAME[serverSays]})`, r.ok && serverSays === to, r);
      check(`…and the chip STAYS on ${NAME[from]} for 12 s (no frame; the page re-judged ${syncs} merge(s) of the stale one) — the owner's report, reproduced: "${c1.words}"`,
        c0.words.includes(NAME[from]) && c1.words.includes(NAME[from]) && !c1.words.includes(NAME[to]) && syncs >= 2, { c0, c1, syncs });
      await leg('CONTROL → the fixed writer re-points to the same member', S1, to, () => command({ op: 'link', pool: POOL, sid: S1, member: to }));
    }
  }

  check(`no page exceptions (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3));
} catch (e) {
  failed++;
  console.error('✗ harness error:', e && e.stack || e);
  try { console.error(fs.readFileSync(path.join(ROOT, 'server.log'), 'utf8').split('\n').filter((l) => /error|Error|✗/.test(l)).slice(-15).join('\n')); } catch {}
}
console.log(`\n${failed ? 'FAIL' : 'ALL PASS'} (${passed} passed, ${failed} failed)`);
process.exit(failed ? 1 : 0);
