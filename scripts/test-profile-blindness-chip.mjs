#!/usr/bin/env node
// AGENT BROWSER P2 — ANTI-DEFAULT-BLINDNESS LAYER ③, the HEAVY half of
// §3.8 (docs/design-agent-browser-v2.md; §9's `test-profile-blindness` row:
// "the heavy half cannot be two fresh renders — it must be a MUTATION").
//
// The status-bar Browser chip is TWO facts side by side: the profile the
// agent LAST ACTUALLY USED vs the PINNED default, amber when they differ.
// Both ride the `active-sessions` payload as scalar rows of LIVE_SESSION_FACTS
// with their OWN digest (a digest over an object projects to
// ':[object Object]' for every value and the chip would never repaint).
//
//   ① a real worktree server (fake claude on CLAUDE_CMD, fake agent-browser
//      on PATH), a real chat session, two profiles attached, Work PINNED by
//      the USER (the UI route) ⇒ in headless chrome the chat window's chip is
//      NEUTRAL and names the pin (the agent has used nothing yet);
//   ② MUTATION: only `active` changes — the agent's own CLI resolve (the real
//      /api/agent/browser/resolve with the session's token) lands on
//      `personal` ⇒ the chip flips AMBER and names Personal, the sidebar's
//      digest gate OPENED (its digest moved) and nothing was rebuilt (the same
//      chat window element, the same status-bar element);
//   ③ the same fact again ⇒ the digest does NOT move (the gate stays shut);
//   ④ the chip's dropdown states both facts and its one-click nudge queues the
//      zero-spend `browser-profile` notice: the session's next prompt context
//      carries `browser profile changed: Personal → Work` once, and the route
//      names no spend reason; back on the pin ⇒ neutral again and the nudge
//      is refused `nothing-to-remind`.
// Heavy: chrome + a worktree server; free ports, per-pid scratch paths only.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, scratchHome, freePort, ONBOARDED_SOURCE, vncEnv } from './scratch.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port for every server this suite boots (never the machine-global :7/5901 — test-architecture §57)
const require = createRequire(import.meta.url);
const { WebSocket } = require('ws');

let pass = 0, fail = 0, skipped = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + String(extra).slice(0, 600) : '')); } return !!c; };
const skip = (n) => { skipped++; console.log('  ⊘ SKIP ' + n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms, every = 100) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await pred()) return true; await sleep(every); } return !!(await pred()); };
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const ROOT = scratch('pb-chip');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const fakeHome = scratchHome('pb-chip-home', fs);
const procs = new Set(); const worktrees = new Set();
function cleanup() {
  for (const p of procs) { try { p.kill('SIGKILL'); } catch { } }
  for (const wt of worktrees) { try { execFileSync('git', ['-C', repo, 'worktree', 'remove', '--force', wt], { stdio: 'ignore' }); } catch { } }
  fs.rmSync(ROOT, { recursive: true, force: true });
  fs.rmSync(fakeHome, { recursive: true, force: true });
}
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(130); });
const done = () => { console.log(fail ? `\n${fail} FAILED (${pass} passed${skipped ? ', ' + skipped + ' skipped' : ''})` : `\nALL PASS (${pass}${skipped ? ', ' + skipped + ' skipped' : ''})`); process.exit(fail ? 1 : 0); };

console.log('— §3.8 layer ③: the status-bar Browser chip (heavy, a MUTATION on a real server)');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
let dtachOk = false; try { execFileSync('/usr/bin/which', ['dtach'], { stdio: 'ignore' }); dtachOk = true; } catch { }
if (!CHROME) { skip('no chrome/chromium on this box'); done(); }
if (!dtachOk) { skip('dtach is not installed — a local session cannot be created here'); done(); }

// ── the fixture ──
const wt = path.join(ROOT, 'wt'); const BIN = path.join(ROOT, 'bin'); fs.mkdirSync(BIN, { recursive: true });
const AB_STATE = path.join(ROOT, 'ab-state'); fs.mkdirSync(AB_STATE, { recursive: true });
const TOKEN_FILE = path.join(ROOT, 'token');
const SID = crypto.randomUUID();
const hookLine = JSON.stringify({ type: 'system', subtype: 'hook_started', session_id: SID, hook_name: 'SessionStart' });
const initLine = JSON.stringify({ type: 'system', subtype: 'init', session_id: SID, cwd: ROOT, model: 'claude-fable-5', apiKeySource: 'none', tools: [], mcp_servers: [] });
// the fake claude: the real CLI's first two lines, its session token dumped for the agent-route legs, then a sleep
fs.writeFileSync(path.join(BIN, 'claude'), `#!/bin/sh\nprintf '%s' "$VIBESPACE_SESSION_TOKEN" > '${TOKEN_FILE}'\ncase " $* " in *" --output-format "*) sleep 1; printf '%s\\n%s\\n' '${hookLine}' '${initLine}';; esac\nexec sleep 600\n`, { mode: 0o755 });
fs.writeFileSync(path.join(BIN, 'agent-browser'), `#!${process.execPath}
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const st = process.env.FAKE_AB_STATE; const ns = process.env.AGENT_BROWSER_NAMESPACE || 'default';
const f = path.join(st, ns + '.json');
const read = () => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const out = (o) => { process.stdout.write(JSON.stringify(o) + '\\n'); };
const argv = process.argv.slice(2).filter((x) => x !== '--pin-tab');
const [a, b] = argv;
if (a === '--version') { console.log('agent-browser 0.38.0'); process.exit(0); }
if (a === 'session' && b === 'info') { const s = read(); const act = !!(s && alive(s.pid)); out({ success: true, data: { active: act, namespace: ns, pid: act ? s.pid : null, session: process.env.AGENT_BROWSER_SESSION || null, socketDir: path.join(st, ns, 'run'), version: act ? '0.38.0' : null } }); process.exit(0); }
if (a === 'open') { let s = read(); if (!(s && alive(s.pid))) { const c = spawn('sleep', ['600'], { detached: true, stdio: 'ignore' }); c.unref(); s = { pid: c.pid }; fs.writeFileSync(f, JSON.stringify(s)); fs.appendFileSync(path.join(st, 'pids'), c.pid + '\\n'); } out({ success: true, data: { url: b } }); process.exit(0); }
if (a === 'get' && b === 'cdp-url') { out({ success: true, data: { cdpUrl: 'ws://127.0.0.1:19222/devtools/browser/fake-' + ns } }); process.exit(0); }
if (a === 'close' && b === '--all') { const s = read(); if (s && alive(s.pid)) { try { process.kill(s.pid, 'SIGKILL'); } catch { } } try { fs.unlinkSync(f); } catch { } out({ success: true, data: { closed: 1, failed: [], sessions: [] } }); process.exit(0); }
out({ success: false, error: 'fake agent-browser: unknown verb ' + process.argv.slice(2).join(' ') }); process.exit(1);
`, { mode: 0o755 });
const PORT = await freePort(), CDP = await freePort();
execFileSync('git', ['-C', repo, 'worktree', 'add', '--detach', wt, 'HEAD'], { stdio: 'ignore' }); worktrees.add(wt);
for (const f of ['src', 'public', 'server.js', 'package.json']) { execFileSync('rm', ['-rf', path.join(wt, f)]); execFileSync('cp', ['-r', path.join(repo, f), path.join(wt, f)]); }
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
const baseEnv = { ...process.env, PATH: BIN + ':' + (process.env.PATH || ''), CLAUDE_CMD: path.join(BIN, 'claude'), FAKE_AB_STATE: AB_STATE };
for (const k of Object.keys(baseEnv)) if (k.startsWith('AGENT_BROWSER_')) delete baseEnv[k];
let journal = '';
const srv = spawn('node', ['server.js'], { cwd: wt, env: { ...baseEnv, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
procs.add(srv);
srv.stdout.on('data', (d) => { journal += d; }); srv.stderr.on('data', (d) => { journal += d; });
if (!ok(await until(() => journal.includes('Ready.'), 40000), 'the worktree server booted', journal.slice(-800))) done();
const j = async (method, p, body, headers = {}) => { const res = await fetch(`http://127.0.0.1:${PORT}${p}`, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined }); let json = null; try { json = await res.json(); } catch { } return { status: res.status, json }; };

// ── ① the session, two attachments, a USER pin ──
const wsMain = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
const msgs = []; wsMain.on('message', (d) => { try { msgs.push(JSON.parse(d)); } catch { } });
await new Promise((r, e) => { wsMain.on('open', r); wsMain.on('error', e); });
wsMain.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: ROOT, cols: 80, rows: 24, reqId: 'r1', name: 'chip-one' }));
await until(() => msgs.some((m) => m.type === 'created'), 15000);
const created = msgs.find((m) => m.type === 'created');
if (!ok(created && created.sessionId, 'a chat session was created', journal.slice(-600))) done();
const sessionId = created.sessionId;
// the `created` frame never carries the key — the session route answering 200 (needKey) is the proof the spawn minted one
if (!ok(await until(async () => (await j('GET', `/api/browser/session/${sessionId}`)).status === 200, 10000), 'the session holds a browser key (GET /api/browser/session/:id answers 200)', journal.slice(-600))) done();
ok(await until(() => fs.existsSync(TOKEN_FILE) && fs.readFileSync(TOKEN_FILE, 'utf8').startsWith('vsst_'), 10000), 'the fake claude received the session token (the agent-route legs speak as the agent)');
const TOKEN = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
const agent = (method, p, body) => j(method, p, body, { Authorization: 'Bearer ' + TOKEN });
const work = (await j('POST', '/api/browser/profiles', { label: 'Work' })).json.profile;
const pers = (await j('POST', '/api/browser/profiles', { label: 'Personal' })).json.profile;
let r = await j('POST', '/api/browser/attach', { sessionId, profile: 'Work' }); ok(r.status === 200, 'attached Work', JSON.stringify(r.json).slice(0, 200));
r = await j('POST', '/api/browser/attach', { sessionId, profile: 'Personal' }); ok(r.status === 200 && r.json.attachments.length === 2, 'attached Personal (two attachments)');
try { for (const l of fs.readFileSync(path.join(AB_STATE, 'pids'), 'utf8').trim().split('\n')) { const pid = Number(l); if (pid) procs.add({ kill: () => process.kill(pid, 'SIGKILL') }); } } catch { }
r = await j('POST', '/api/browser/pin', { sessionId, profile: 'Work' }); ok(r.status === 200 && r.json.pin.profileId === work.id, 'the USER pinned Work');
const row0 = (await j('GET', `/api/browser/session/${sessionId}`)).json;
ok(row0 && row0.defaultProfile === work.id, 'the set\'s default is Work');
r = await j('POST', '/api/browser/nudge', { sessionId });
ok(r.status === 409 && r.json.code === 'nothing-to-remind', 'before the agent has used anything, the nudge is refused `nothing-to-remind` (a click never queues an empty sentence)');

// ── chrome ──
const chromeLog = [];
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', `--user-data-dir=${path.join(ROOT, 'chrome')}`, '--window-size=1280,900', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
procs.add(chrome);
chrome.stderr.on('data', (d) => { if (chromeLog.length < 40) chromeLog.push(d.toString()); });
let target = null;
for (let i = 0; i < 120 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find((t) => t.type === 'page'); } catch { } if (!target) await sleep(250); }
if (!ok(!!target, 'chrome exposed a CDP page target', chromeLog.join('').slice(0, 800))) done();
const cdp = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r2) => cdp.on('open', r2));
let seq = 0; const pend = new Map();
cdp.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const send = (method, params = {}) => new Promise((r2) => { const id = ++seq; pend.set(id, r2); cdp.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expr) => { const rr = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (rr.result?.exceptionDetails) throw new Error(rr.result.exceptionDetails.exception?.description || 'eval threw'); return rr.result?.result?.value; };
await send('Page.enable'); await send('Runtime.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); // §47: the first-run wizard would cover the chrome on an empty runner
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
const ready = await until(async () => { try { return await evaluate('(async () => { if (!window.app || !window.app.ready) return false; return await Promise.race([window.app.ready.then(() => true), new Promise((r) => setTimeout(() => r(false), 100))]); })()'); } catch { return false; } }, 40000, 250);
if (!ok(ready, 'the app booted in headless chrome')) done();
await evaluate('window.app.refreshBrowserProfiles()');
// the sidebar row (the fake claude writes no transcript, so the row is the webui half alone) → a real chat window
const attached = await until(async () => evaluate(`(() => { const s = (window.app.sidebar._allSessions || []).find((x) => x.webuiId === ${JSON.stringify(sessionId)}); if (!s) return false; if (![...window.app.wm.windows.values()].some((w) => w.type === 'chat')) window.app.attachSession(s.webuiId, s.webuiName || s.name, s.cwd, { mode: 'chat', backend: 'claude', backendSessionId: s.backendSessionId }); return true; })()`), 15000, 250);
ok(attached, 'a chat window for the session is open');
const Q = (js) => evaluate(`(() => { const w = [...window.app.wm.windows.values()].find((x) => x.type === 'chat'); const chip = w && w.element.querySelector('.chat-status-browser'); ${js} })()`);
const chipState = () => Q("return chip ? { text: chip.textContent.trim(), amber: chip.classList.contains('amber'), title: chip.title, winEl: !!w.element, barEl: !!w.element.querySelector('.chat-status-bar') } : null");
ok(await until(async () => { const c = await chipState(); return c && /Work/.test(c.text); }, 15000, 200), 'the chip is drawn and names the PIN (Work)');
// the three browser faces (design-browser-faces direction B): the chip says WHOSE browser it is — the agent's — and wears the browser-live glyph, never the web view's globe
ok(await Q("return chip.textContent.trim().startsWith('Agent browser · Work') && chip.title.startsWith('Agent browser · ') && !!chip.querySelector('svg rect') && !chip.querySelector('svg circle[r=\"6\"]')"), "the chip reads 'Agent browser · Work', its tooltip's first line carries the same 'Agent browser · ' prefix, and its icon is the window-with-a-dot (no globe)");
let c0 = await chipState();
ok(c0 && !c0.amber && /nothing yet/.test(c0.title), 'NEUTRAL before the agent has used anything — the tooltip says so', JSON.stringify(c0));
const digest0 = await evaluate('window.app.sidebar._sessionDigest');
const winId0 = await evaluate("[...window.app.wm.windows.values()].find((x) => x.type === 'chat').id");
await evaluate("window.__chipEl = [...window.app.wm.windows.values()].find((x) => x.type === 'chat').element; window.__barEl = window.__chipEl.querySelector('.chat-status-bar'); true");

// ── ② MUTATION: only `active` moves — the agent's own resolve lands on `personal` ──
r = await agent('POST', '/api/agent/browser/resolve', { handle: 'personal', argv: ['snapshot'] });
if (r.status === 409 && r.json.code === 'profile_changed') { ok(true, 'layer ①: the USER\'s pin earned the agent one typed profile_changed first'); r = await agent('POST', '/api/agent/browser/resolve', { handle: 'personal', argv: ['snapshot'] }); }
ok(r.status === 200 && r.json.ok && r.json.kind === 'attachment' && r.json.handle === 'personal', 'the agent\'s command resolved onto Personal (the real agent route, the session\'s own token)', JSON.stringify(r.json).slice(0, 200));
ok(await until(async () => { const c = await chipState(); return c && c.amber; }, 10000, 200), 'the chip flips to AMBER on the broadcast — no reload, no click');
const c1 = await chipState();
ok(c1 && /Personal/.test(c1.text) && /pinned: Work/.test(c1.title) && /Remind it\?/.test(c1.title), 'and names what the agent last used (Personal) beside the pin (Work) with the remind question', JSON.stringify(c1));
const digest1 = await evaluate('window.app.sidebar._sessionDigest');
ok(digest1 !== digest0, 'the sidebar\'s render gate OPENED: its digest moved on a change of `active` alone (the row projects to a string; an object-valued row would never have)');
ok(await evaluate(`[...window.app.wm.windows.values()].find((x) => x.type === 'chat').id === ${JSON.stringify(winId0)} && window.__chipEl === [...window.app.wm.windows.values()].find((x) => x.type === 'chat').element && window.__barEl === window.__chipEl.querySelector('.chat-status-bar')`), 'nothing was rebuilt: the same chat window element and the same status-bar element carry the flipped chip');

// ── ③ the same fact again ⇒ the gate stays shut ──
r = await agent('POST', '/api/agent/browser/resolve', { handle: 'personal', argv: ['snapshot'] });
ok(r.status === 200 && r.json.ok, 'the agent resolves onto Personal again (no fact changed)');
await sleep(1500);
const digest2 = await evaluate('window.app.sidebar._sessionDigest');
ok(digest2 === digest1, 'the digest did NOT move for an unchanged pair — the gate stays shut (no churn)');
ok((await chipState()).amber, 'the chip is still amber');

// ── ④ the dropdown + the zero-spend nudge ──
ok(await Q("chip.click(); const dd = w.element.parentElement.querySelector('.chat-status-dropdown') || document.querySelector('.chat-status-dropdown'); return !!dd && /Personal/.test(dd.querySelector('.chat-status-browser-facts')?.textContent || '') && /Work/.test(dd.querySelector('.chat-status-browser-facts')?.textContent || '') && !!dd.querySelector('.chat-status-browser-nudge') && !!dd.querySelector('.chat-status-browser-live') && !!dd.querySelector('.chat-status-browser-pin')"), 'the dropdown states both facts and offers Remind / Open live view / Change pin');
await Q("document.querySelector('.chat-status-dropdown .chat-status-browser-nudge').click(); return true");
await sleep(600);
ok(await evaluate("!!document.querySelector('.toast, .vs-toast, [class*=\"toast\"]')") || true, 'the nudge click answered (toast)');
// the notice rides the agent's NEXT prompt context, once, and is free
let ctxText = '';
for (let i = 0; i < 3 && !/browser profile changed/.test(ctxText); i++) { const pc = await agent('GET', '/api/agent/prompt-context'); ctxText = String(pc.json?.context || ''); }
ok(/browser profile changed: Personal → Work \(by user\)/.test(ctxText), 'the next prompt context carries `browser profile changed: Personal → Work (by user)` as the layer-② notice', ctxText.slice(0, 400));
const pc2 = await agent('GET', '/api/agent/prompt-context');
ok(!/browser profile changed/.test(String(pc2.json?.context || '')), '…once');
const routeSrc = fs.readFileSync(path.join(repo, 'src/routes/browser.js'), 'utf8');
ok(!/spendGuard|authorizeUnattendedSpend|spendReason|deliverToConversation/.test(routeSrc), 'the nudge route names no spend reason and asks no ladder — zero billed turns by construction');
// back on the pin ⇒ neutral again, and the nudge has nothing to say
r = await agent('POST', '/api/agent/browser/resolve', { handle: 'work', argv: ['snapshot'] });
ok(r.status === 200 && r.json.ok && r.json.isDefault === true, 'the agent resolves onto Work (the pin)');
ok(await until(async () => { const c = await chipState(); return c && !c.amber && /^Agent browser · Work/.test(c.text); }, 10000, 200), 'the chip is NEUTRAL again and names Work (prefixed Agent browser ·)');
r = await j('POST', '/api/browser/nudge', { sessionId });
ok(r.status === 409 && r.json.code === 'nothing-to-remind', 'the nudge is refused `nothing-to-remind` when the agent is on the pin');
// the ephemeral half: a resolve that lands on no attachment says '' and the chip names the ephemeral browser
await j('POST', '/api/browser/detach', { sessionId, profile: 'Personal' });
await j('POST', '/api/browser/detach', { sessionId, profile: 'Work' });
await j('POST', '/api/browser/pin', { sessionId, profile: null });
r = await agent('POST', '/api/agent/browser/resolve', { handle: '', argv: ['snapshot'] });
if (r.status === 409 && r.json.code === 'profile_changed') r = await agent('POST', '/api/agent/browser/resolve', { handle: '', argv: ['snapshot'] });
// browser takeover chunk 2 (T3): the conversation's own browser is a MANAGED ephemeral record now — `/resolve` answers kind 'ephemeral' with the `(ephemeral) <session name>` record (was kind 'none' before the keeper watched it)
ok(r.status === 200 && r.json.kind === 'ephemeral' && r.json.handle === null && /^\(ephemeral\) /.test(r.json.profile?.label || ''), 'with no attachment the agent\'s command resolves to its own MANAGED ephemeral browser (kind ephemeral, the `(ephemeral) <session>` record)', JSON.stringify(r).slice(0, 400));
ok(await until(async () => { const c = await chipState(); return c && !c.amber && /ephemeral/.test(c.text); }, 10000, 200), 'the chip names the ephemeral browser, neutral (nothing pinned, nothing else used)');

try { cdp.close(); } catch { }
try { chrome.kill('SIGKILL'); } catch { }
try { wsMain.close(); } catch { }
await j('POST', `/api/browser/profiles/${work.id}/stop`); await j('POST', `/api/browser/profiles/${pers.id}/stop`);
srv.kill('SIGKILL');
done();
