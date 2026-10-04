#!/usr/bin/env node
// BROWSER SESSIONS, SEEN (2026-09-27 — the owner: "最关键是能在聊天界面和浏览器查看界面两个地方都能看到 session 的开始和结束，
// 以及每个浏览器 session 的回放"). A real page over a scratch server drives every surface:
//
//   · a scratch COPY of the working tree (its own data/ and HOME, its own bundle), a stub `claude` behind the REAL
//     chat-wrapper, a fake agent-browser 0.38.1 on the server's PATH — the lease is the REAL keeper's, so the session
//     markers are the real recorder's; the replay's frames are SEEDED fixtures (JPEGs chrome drew) written while the
//     server is down, beside the real markers;
//   ① LIVE: the chat window open, the user's attach ⇒ the start card appears in the chat (a VibeSpace card, never agent
//      text), the detach ⇒ the end card with 回放 — through the live op;
//   ② REBUILT: the server restarts (the conversation survives under dtach); the chat re-attaches ⇒ every card is back,
//      the seeded sessions' too (only the markers on disk can say those), in time order;
//   ③ the replay window FROM THE CARD: the session list (newest first), the chosen session's actions, the after-frame
//      with the click DRAWN where the fixture clicked (±3 px), Before / After, ← → Home End, Space plays one a second
//      and stops at the last;
//   ④ a session whose frames the size limit took: 回放 from its card ⇒ the named empty state, its action list kept;
//   ⑤ from Session properties (浏览器会话（3）→ 回放) and from the Agent browser panel (回放… on the profile row);
//   ⑥ the live view of a STOPPED browser: the Actions pane opens by itself on the Sessions list (each with 回放), the
//      actions carry "第 k 次会话" dividers;
//   ⑦ the phone (390×844): the list above the picture, every target ≥ 44 px, nothing sideways;
//   ⑧ the rect census in zh / ja / en (the chat cards, the replay window); ⑨ no sessions / the trace off.
// Artifacts: PNG + JSON per leg under /tmp/vibespace-lanes/browser-dialog/shots/replay/run-<pid>-<time>/ (VIBESPACE_REPLAY_SHOTS
// names another root; the newest three kept). SKIPs without chrome, dtach or DejaVu Sans.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, scratchHome, freePort, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop names for the server this suite boots (test-architecture §57)
const require = createRequire(import.meta.url);
const { WebSocket } = require('ws');

let pass = 0, fail = 0, skipped = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 1800) : '')); } return !!c; };
const skip = (n) => { skipped++; console.log('  ⊘ SKIP ' + n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms, every = 80) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await pred(); if (v) return v; } catch { } await sleep(every); } try { return await pred(); } catch { return null; } };
const J = (x) => JSON.stringify(x);
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const zhDict = (await import('../src/lib/i18n-zh.js')).default;
const jaDict = (await import('../src/lib/i18n-ja.js')).default;
const tr = (lang, k, p) => { let s = (lang === 'zh' ? zhDict[k] : lang === 'ja' ? jaDict[k] : null) || k; if (p) s = s.replace(/\{(\w+)\}/g, (m, x) => (p[x] !== undefined ? String(p[x]) : m)); return s; };
/** tc(): a contexted key (`ctx::str`), the English string itself when no dictionary has it. */
const trc = (lang, ctx, k, p) => { let s = (lang === 'zh' ? zhDict[ctx + '::' + k] : lang === 'ja' ? jaDict[ctx + '::' + k] : null) || k; if (p) s = s.replace(/\{(\w+)\}/g, (m, x) => (p[x] !== undefined ? String(p[x]) : m)); return s; };
const BS = require('../src/browser-sessions.js');
const T = require('../src/browser-trace.js');

const ROOT = scratch('replay-ui');
fs.mkdirSync(ROOT, { recursive: true });
const SHOTS_ROOT = process.env.VIBESPACE_REPLAY_SHOTS ? path.resolve(process.env.VIBESPACE_REPLAY_SHOTS) : path.join(os.tmpdir(), 'vibespace-lanes', 'browser-dialog', 'shots', 'replay');
const SHOTS = path.join(SHOTS_ROOT, `run-${process.pid}-${Date.now()}`);
fs.mkdirSync(SHOTS, { recursive: true });
try { const runs = fs.readdirSync(SHOTS_ROOT).filter((d) => /^run-\d+-\d+$/.test(d)).sort((a, b) => Number(b.split('-')[2]) - Number(a.split('-')[2])); for (const d of runs.slice(3)) fs.rmSync(path.join(SHOTS_ROOT, d), { recursive: true, force: true }); } catch { }
console.log(`artifacts: ${SHOTS}`);

const procs = new Set();
let HOME_DIR = null;
function cleanup() {
  for (const p of procs) { try { p.kill('SIGKILL'); } catch { } }
  for (const r of [ROOT, HOME_DIR]) if (r) { try { endRootedProcesses(r); } catch { } }
  for (const r of [ROOT, HOME_DIR]) if (r) { try { fs.rmSync(r, { recursive: true, force: true }); } catch { } }
}
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(1); });

const FONT_SOURCE = "document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.id = 'vs-replay-face'; st.textContent = \"html, body, button, input, select, textarea { font-family: 'DejaVu Sans', sans-serif !important; }\"; document.head.appendChild(st); });";
// ── THE RECT CENSUS (in the page): every part inside its cell and the viewport; no clipped button; nothing sideways ──
function RECTS(o) {
  const out = { problems: [], n: 0 };
  const shown = (el) => { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return false; const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
  const inside = (a, c, slack = 1, h = false) => a.left >= c.left - slack && a.right <= c.right + slack && (h || (a.top >= c.top - slack && a.bottom <= c.bottom + slack));
  const vp = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
  const R = (b) => `${Math.round(b.left)},${Math.round(b.top)} ${Math.round(b.width)}×${Math.round(b.height)}`;
  for (const [cellSel, partSel, opt] of o.pairs) {
    const h = !!(opt && opt.h);
    for (const cell of document.querySelectorAll(cellSel)) {
      if (!shown(cell)) continue;
      const cb = cell.getBoundingClientRect();
      if (o.viewport && !inside(cb, vp, 1, h)) out.problems.push(`${cellSel} past the viewport ${R(cb)} (vw ${innerWidth})`);
      if (cell.scrollWidth > cell.clientWidth + 1 && !(opt && opt.scrollOk)) out.problems.push(`${cellSel} overflows sideways (${cell.scrollWidth} > ${cell.clientWidth})`);
      for (const el of cell.querySelectorAll(partSel)) {
        if (!shown(el)) continue;
        out.n++;
        const b = el.getBoundingClientRect();
        if (!inside(b, cb, 1, h)) out.problems.push(`${partSel} "${(el.textContent || '').trim().slice(0, 30)}" past its cell ${cellSel} ${R(b)} ⊄ ${R(cb)}`);
        if (el.tagName === 'BUTTON' && el.scrollWidth > el.clientWidth + 1) out.problems.push(`button clipped: "${(el.textContent || '').trim()}" (${el.scrollWidth} > ${el.clientWidth})`);
        const tx = (el.textContent || '');
        if (/undefined|\bnull\b|NaN|\[object/.test(tx)) out.problems.push(`${partSel} says "${tx.slice(0, 60)}"`);
      }
    }
  }
  for (const [sel, min] of o.minHeights || []) for (const el of document.querySelectorAll(sel)) { if (!shown(el)) continue; const hh = el.getBoundingClientRect().height; if (hh < min - 0.5) out.problems.push(`${sel} "${(el.textContent || '').trim().slice(0, 24)}" is ${Math.round(hh)} px < ${min}`); }
  if (document.documentElement.scrollWidth > innerWidth + 1) out.problems.push(`the page scrolls sideways (${document.documentElement.scrollWidth} > ${innerWidth})`);
  return out;
}

const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
const hasDejaVu = (() => { try { return /DejaVu Sans/.test(execFileSync('fc-list', [':', 'family'], { encoding: 'utf8' })); } catch { return false; } })();
const hasDtach = (() => { try { execFileSync('which', ['dtach'], { stdio: 'ignore' }); return true; } catch { return false; } })();
if (!CHROME) skip('no chrome/chromium on this box — every leg needs one');
else if (!hasDejaVu) skip("no 'DejaVu Sans' on this box (fc-list : family) — the cards are judged under the Actions runner's face");
else if (!hasDtach) skip('no dtach on this box — the conversation must survive the server restart under it');
else await (async () => {
  // ── the scratch app: a COPY of the working tree (its own data/ + HOME) and its own bundle ──
  const WT = path.join(ROOT, 'app');
  fs.mkdirSync(WT, { recursive: true });
  for (const f of ['src', 'public']) fs.cpSync(path.join(repo, f), path.join(WT, f), { recursive: true });
  for (const f of ['server.js', 'package.json']) fs.copyFileSync(path.join(repo, f), path.join(WT, f));
  for (const f of execFileSync('git', ['-C', repo, 'ls-files', 'data/bin'], { encoding: 'utf8' }).split('\n').filter(Boolean)) {
    const to = path.join(WT, f); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(path.join(repo, f), to); fs.chmodSync(to, fs.statSync(path.join(repo, f)).mode);
  }
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(WT, 'node_modules'));
  const version = JSON.parse(fs.readFileSync(path.join(WT, 'package.json'), 'utf8')).version;
  fs.writeFileSync(path.join(WT, 'src/lib/build-version.js'), `export const BUILD_VERSION = ${J(version)};\n`);
  await require('esbuild').build({ entryPoints: [path.join(WT, 'src/client.js')], bundle: true, outfile: path.join(WT, 'public/bundle.js'), format: 'iife', platform: 'browser', target: 'es2020', loader: { '.css': 'css' }, minify: true, logLevel: 'silent' });
  ok(fs.statSync(path.join(WT, 'public/bundle.js')).size > 500000, 'the scratch copy built its own bundle');
  HOME_DIR = scratchHome('replay-ui-home', fs);
  const CWD = path.join(ROOT, 'w', 'shop'); fs.mkdirSync(CWD, { recursive: true });
  // ── a stub `claude` (announces its init, idles where the real CLI waits for a turn) ──
  const STUB = path.join(ROOT, 'claude');
  fs.writeFileSync(STUB, `#!${process.execPath}
const a = process.argv.slice(2);
if (a.includes('--version')) { console.log('2.1.281 (Claude Code) stub'); process.exit(0); }
if (a.includes('--help')) { console.log('Usage: claude [options]'); process.exit(0); }
const at = (f) => { const i = a.indexOf(f); return i >= 0 ? a[i + 1] : null; };
const SID = at('--session-id') || at('--resume') || ('0e1a0000-0000-4000-8000-' + String(process.pid).padStart(12, '0'));
process.stdout.write(JSON.stringify({ type: 'system', subtype: 'init', session_id: SID, model: 'claude-fable-5', cwd: process.cwd(), tools: [], permissionMode: 'default', claude_code_version: '2.1.281' }) + '\\n');
process.stdin.on('data', () => {}); process.stdin.on('end', () => process.exit(0));
`, { mode: 0o755 });
  // ── a fake agent-browser 0.38.1 on the server's PATH (a daemon is a real `sleep`; the lease is the keeper's) ──
  const FAKE_BIN = path.join(ROOT, 'fakebin'), FAKE_ST = path.join(ROOT, 'fakeab');
  fs.mkdirSync(FAKE_BIN, { recursive: true }); fs.mkdirSync(FAKE_ST, { recursive: true });
  fs.writeFileSync(path.join(FAKE_BIN, 'agent-browser'), `#!${process.execPath}
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const st = ${J(FAKE_ST)}; const ns = process.env.AGENT_BROWSER_NAMESPACE || 'default'; const sess = process.env.AGENT_BROWSER_SESSION || ns;
const f = path.join(st, ns + '__' + sess + '.json');
const read = () => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const out = (o) => { process.stdout.write(JSON.stringify(o) + '\\n'); };
const argv = process.argv.slice(2).filter((x) => x !== '--pin-tab' && x !== '--json');
const [a, b] = argv;
const daemon = () => { let s = read(); if (s && alive(s.pid)) return s; const c = spawn('sleep', ['900'], { detached: true, stdio: 'ignore' }); c.unref(); s = { pid: c.pid }; fs.writeFileSync(f, JSON.stringify(s)); return s; };
if (a === '--version') { console.log('agent-browser 0.38.1'); process.exit(0); }
if (a === 'session' && b === 'info') { const s = read(); const act = !!(s && alive(s.pid)); out({ success: true, data: { active: act, namespace: ns, pid: act ? s.pid : null, session: sess } }); process.exit(0); }
if (a === 'get' && b === 'cdp-url') { const s = read(); if (!(s && alive(s.pid))) { out({ success: false, error: 'fake: no browser' }); process.exit(1); } out({ success: true, data: { cdpUrl: 'ws://127.0.0.1:19999/devtools/browser/fake-' + ns } }); process.exit(0); }
if (a === 'close') { const s = read(); if (s && alive(s.pid)) { try { process.kill(s.pid, 'SIGKILL'); } catch { } } try { fs.unlinkSync(f); } catch { } out({ success: true, data: { closed: 1 } }); process.exit(0); }
if (a === 'stream' && b === 'status') { const s = read(); if (!(s && alive(s.pid))) { out({ success: false, error: 'fake: no browser' }); process.exit(1); } out({ success: true, data: { enabled: true, connected: false, port: 1, screencasting: false } }); process.exit(0); }
if (['open', 'snapshot', 'get', 'click'].includes(a)) { daemon(); out({ success: true, data: { ok: true } }); process.exit(0); }
out({ success: false, error: 'fake: unknown verb ' + argv.join(' ') }); process.exit(1);
`, { mode: 0o755 });

  // ── the server (booted twice over the same data/: the restart is leg ②) ──
  const PORT = await freePort(), CDP = await freePort();
  const baseEnv = { ...process.env };
  for (const k of Object.keys(baseEnv)) if (k.startsWith('AGENT_BROWSER_')) delete baseEnv[k];
  let srv = null, journal = '';
  async function boot(tag) {
    journal = '';
    srv = spawn(process.execPath, ['server.js'], { cwd: WT, env: { ...baseEnv, ...VNC_ENV, PATH: `${FAKE_BIN}:${baseEnv.PATH || '/usr/bin:/bin'}`, PORT: String(PORT), HOME: HOME_DIR, CLAUDE_CMD: STUB, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
    procs.add(srv);
    srv.stdout.on('data', (d) => { journal = (journal + d).slice(-60000); }); srv.stderr.on('data', (d) => { journal = (journal + d).slice(-60000); });
    return ok(await until(() => journal.includes('Ready.'), 60000, 200), `the scratch server booted (${tag})`, journal.slice(-800));
  }
  async function stop() {
    const s = srv; srv = null;
    const gone = new Promise((r) => s.once('exit', r));
    s.kill('SIGTERM');
    await Promise.race([gone, sleep(15000)]);
    procs.delete(s);
  }
  if (!await boot('first')) return;
  const api = async (method, p, body) => { const res = await fetch(`http://127.0.0.1:${PORT}${p}`, { method, headers: body !== undefined ? { 'Content-Type': 'application/json' } : {}, body: body !== undefined ? J(body) : undefined }); let json = null; try { json = await res.json(); } catch { } return { status: res.status, json }; };

  // ── the conversation (a live chat session through the real create path) + the profile ──
  const ctl = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  const frames = []; ctl.on('message', (d) => { if (d.length > 262144) return; try { frames.push(JSON.parse(String(d))); } catch { } });
  await new Promise((r, e) => { ctl.on('open', r); ctl.on('error', e); });
  const create = async (reqId, name) => {
    ctl.send(J({ type: 'create', backend: 'claude', mode: 'chat', cwd: CWD, reqId, sessionName: name, cols: 80, rows: 24 }));
    await until(() => frames.some((m) => (m.type === 'created' || m.type === 'error') && m.reqId === reqId), 25000, 100);
    const c = frames.find((m) => m.type === 'created' && m.reqId === reqId);
    return c ? c.sessionId : null;
  };
  const SID = await create('c-a', '网店巡检'), SID_B = await create('c-b', 'Empty chat');
  if (!ok(SID && SID_B, 'two live chat sessions created through the real path (stub claude behind the real wrapper)', frames.filter((m) => m.type === 'error').slice(-2))) return;
  const keyOf = async (sid) => until(async () => { const a = frames.filter((m) => m.type === 'active-sessions').pop(); const r = a ? a.sessions.find((s) => s.id === sid) : null; return r && /^bk-[0-9a-f]{8}$/.test(String(r.browserKey || '')) ? r.browserKey : null; }, 20000, 150);
  const KA = await keyOf(SID), KB = await keyOf(SID_B);
  const made = await api('POST', '/api/browser/profiles', { label: 'work' });
  const PW = made.json && made.json.profile && made.json.profile.id;
  if (!ok(KA && KB && PW, 'each conversation carries its browser key; the profile "work" exists', { KA, KB, made: made.json })) return;

  // ── chrome ──
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--force-device-scale-factor=1', '--disable-background-timer-throttling', `--user-data-dir=${path.join(ROOT, 'chrome')}`, '--window-size=1280,800', 'about:blank'], { stdio: 'ignore' });
  procs.add(chrome);
  let first = null;
  for (let i = 0; i < 120 && !first; i++) { try { first = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find((x) => x.type === 'page'); } catch { } if (!first) await sleep(250); }
  if (!ok(!!first, 'chrome exposed a CDP page target')) return;
  async function pageOf(target) {
    const cdp = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
    await new Promise((r) => cdp.on('open', r));
    procs.add({ kill: () => { try { cdp.close(); } catch { } } });
    let seq = 0; const pend = new Map(); const errors = [];
    cdp.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } if (m.method === 'Runtime.exceptionThrown') errors.push(m.params?.exceptionDetails?.exception?.description || m.params?.exceptionDetails?.text || '?'); });
    const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); cdp.send(J({ id, method, params })); });
    const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error((r.result.exceptionDetails.exception?.description || 'eval threw').slice(0, 600)); return r.result?.result?.value; };
    await send('Page.enable'); await send('Runtime.enable');
    await send('Emulation.setFocusEmulationEnabled', { enabled: true });
    let langScript = null, bootScripts = null;
    const P = {
      send, ev, errors,
      async armApp() { if (bootScripts) return; bootScripts = true; await send('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); await send('Page.addScriptToEvaluateOnNewDocument', { source: FONT_SOURCE }); },
      async load(lang, w, h, mobile = false) {
        await P.armApp();
        await send('Page.bringToFront');
        if (langScript) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: langScript });
        langScript = (await send('Page.addScriptToEvaluateOnNewDocument', { source: lang === 'en' ? "try { localStorage.setItem('vibespace.lang', 'en'); } catch {}" : `try { localStorage.setItem('vibespace.lang', ${J(lang)}); } catch {}` })).result.identifier;
        await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
        if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); else await send('Emulation.setTouchEmulationEnabled', { enabled: false });
        await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/?cb=${Date.now()}` });
        const up = await until(() => ev('(async () => { if (!window.app || !window.app.ready) return false; return await Promise.race([window.app.ready.then(() => true), new Promise((r) => setTimeout(() => r(false), 150))]); })()'), 40000, 250);
        if (!up) throw new Error('the app did not boot');
        await until(() => ev(`(() => { const s = document.getElementById('loading-screen'); return !s || getComputedStyle(s).display === 'none' || getComputedStyle(s).opacity === '0'; })()`), 10000);
        await until(() => ev(`!!(window.app._browserProfiles && (window.app.sidebar._allSessions || []).some((s) => s.webuiId === ${J(SID)}))`), 20000, 150);
        await ev(`(() => { for (const id of [...window.app.wm.windows.keys()]) { try { window.app.wm.closeWindow(id); } catch {} } return true; })()`);
      },
      frames: () => ev('new Promise((r) => { const t = setTimeout(r, 400); requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => { clearTimeout(t); r(); }, 40))); })'),
      text: (sel) => ev(`(() => { const el = document.querySelector(${J(sel)}); return el ? el.textContent.replace(/\\s+/g, ' ').trim() : null; })()`),
      async center(sel) { return ev(`(() => { const e = document.querySelector(${J(sel)}); if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const q = e.getBoundingClientRect(); const x = q.left + q.width / 2, y = q.top + q.height / 2; const hit = document.elementFromPoint(x, y); return { x, y, hits: !!hit && (hit === e || e.contains(hit)) }; })()`); },
      async click(sel) {
        const r = await P.center(sel);
        if (!r || !r.hits) return false;
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
        return true;
      },
      async tap(sel) { const r = await P.center(sel); if (!r || !r.hits) return false; await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x, y: r.y }] }); await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); return true; },
      async key(k, code, vk) { await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }); if (k === ' ') await send('Input.dispatchKeyEvent', { type: 'char', text: ' ' }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }); },
      async shot(file, sel = null) {
        let clip;
        if (sel) { const r = await ev(`(() => { const el = document.querySelector(${J(sel)}); if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, width: b.width, height: b.height }; })()`); if (r) clip = { x: Math.max(0, r.x - 4), y: Math.max(0, r.y - 4), width: r.width + 8, height: r.height + 8, scale: 1 }; }
        const img = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip } : {}) });
        if (img.result && img.result.data) fs.writeFileSync(path.join(SHOTS, file + '.png'), Buffer.from(img.result.data, 'base64'));
      },
      note: (file, obj) => fs.writeFileSync(path.join(SHOTS, file + '.json'), J(obj)),
      rects: (o) => ev(`(${RECTS.toString()})(${J(o)})`),
    };
    return P;
  }
  const p1 = await pageOf(first);

  // ── the replay's FRAMES: JPEGs chrome draws (a grid, a number, a target where the fixture clicks) ──
  const FW = 800, FH = 500;
  const CLICKS = [[120, 90], [640, 110], [400, 250], [200, 400], [700, 420], [60, 260]];
  const jpegs = [];
  await p1.send('Emulation.setDeviceMetricsOverride', { width: FW, height: FH, deviceScaleFactor: 1, mobile: false });
  for (let i = 0; i < CLICKS.length; i++) {
    const [x, y] = CLICKS[i];
    const html = `<html><body style="margin:0;width:${FW}px;height:${FH}px;background:repeating-linear-gradient(0deg,#f4f6fa 0 49px,#d8dee9 49px 50px),repeating-linear-gradient(90deg,#f4f6fa 0 49px,#d8dee9 49px 50px);font:bold 120px sans-serif;color:#2e3440;display:flex;align-items:center;justify-content:center">${i + 1}<div style="position:absolute;left:${x - 12}px;top:${y - 12}px;width:24px;height:24px;border-radius:50%;background:#bf616a"></div></body></html>`;
    await p1.send('Page.navigate', { url: 'data:text/html;base64,' + Buffer.from(html).toString('base64') });
    await sleep(250);
    const cap = await p1.send('Page.captureScreenshot', { format: 'jpeg', quality: 70, clip: { x: 0, y: 0, width: FW, height: FH, scale: 1 } });
    jpegs.push(Buffer.from(cap.result.data, 'base64'));
  }
  ok(jpegs.length === 6 && jpegs.every((b) => b[0] === 0xff && b[1] === 0xd8), 'six JPEG frames drawn by chrome (a grid, a number, the click target)');

  const CHAT = (sel = '') => `.window .chat-msg.chat-browser-session${sel}`;
  const cardsNow = (p) => p.ev(`[...document.querySelectorAll('.chat-msg.chat-browser-session')].map((e) => ({ s: e.dataset.browserSession, phase: e.dataset.phase, text: e.querySelector('.chat-browser-session-title').textContent, replay: !!e.querySelector('.chat-browser-session-replay'), btn: (e.querySelector('.chat-browser-session-replay') || {}).className || '' }))`);
  const openChat = async (p) => {
    await p.ev(`window.app.attachSession(${J(SID)}, '网店巡检', ${J(CWD)}, { mode: 'chat', backend: 'claude' })`);
    return until(() => p.ev(`(() => { for (const [, w] of window.app.wm.windows) if (w.type === 'chat' && w.element && w.element.querySelector('.chat-message-list')) return true; return false; })()`), 20000, 150);
  };
  try {
    // ═══ ① LIVE: the user's attach ⇒ the start card; the detach ⇒ the end card with 回放 ═══
    console.log('— ① live: the two cards through the live op');
    await p1.load('zh', 1280, 800);
    ok(await openChat(p1), '① the conversation\'s chat window is open (zh, 1280×800)');
    await sleep(1500); // the attach's rebuild settles (a card fed before it is derived from the marker instead — ② proves that path)
    const at = await api('POST', '/api/browser/attach', { sessionId: SID, profile: 'work' });
    ok(at.status === 200 && at.json.lease && at.json.lease.browserKey === KA, '① the user attaches "work" (the REAL keeper grants the lease)', at.json);
    const live1 = await until(async () => { const c = await cardsNow(p1); return c.length >= 1 ? c : null; }, 10000, 120);
    const S1 = live1 && live1[0] ? live1[0].s : null;
    ok(live1 && live1.length === 1 && live1[0].phase === 'start' && /^VibeSpace · 浏览器会话开始 · work · \d{2}:\d{2}$/.test(live1[0].text) && !live1[0].replay, `① the START card appears in the chat at once, a VibeSpace card: "${live1 && live1[0] && live1[0].text}"`);
    ok(await p1.ev(`!!document.querySelector('.chat-msg.chat-browser-session.chat-vs-notice.chat-msg-system') && !document.querySelector('.chat-msg.chat-browser-session.chat-msg-assistant, .chat-msg.chat-browser-session.chat-msg-user')`), '① …drawn like the takeover / handback cards (chat-vs-notice), never as agent or user text');
    await sleep(1200);
    const dt = await api('POST', '/api/browser/detach', { sessionId: SID, profile: 'work' });
    const live2 = await until(async () => { const c = await cardsNow(p1); return c.length >= 2 ? c : null; }, 10000, 120);
    // 2026-09-28 (the naive-user verifier): the end card says WHY it ended, and a session the agent never acted in offers
    // no Replay (its replay could only say "the agent did not act")
    ok(dt.status === 200 && live2 && live2[1].phase === 'end' && live2[1].s === S1 && /^VibeSpace · 浏览器会话结束 · 用时 \d+ 秒 · 0 步操作 · 对话不再使用这个浏览器$/.test(live2[1].text) && !live2[1].replay, `① the detach ⇒ the END card, same session, its duration, its count and why it ended — 0 actions, so no 回放: "${live2 && live2[1] && live2[1].text}"`);
    await p1.shot('01-zh-live-cards', '.window:has(.chat-browser-session)');
    const markers = () => { try { return fs.readFileSync(path.join(WT, 'data/browser-trace', PW, BS.MARKERS_FILE), 'utf8').trim().split('\n').map((l) => JSON.parse(l)); } catch { return []; } };
    ok(markers().length === 2 && markers()[0].id === S1 && markers()[1].reason === 'released', '① the recorder wrote the start + end markers on the keeper\'s lease seam (released)', markers());

    // ═══ ② REBUILT: the server restarts; seeded sessions beside the real ones ═══
    console.log('— ② a server restart: every card comes back, the seeded sessions\' too');
    await sleep(2500); // the layout autosave
    await stop();
    ok(!srv, '② the first server stopped (SIGTERM) — the conversation lives on under dtach');
    const sd = path.join(WT, 'data/browser-trace', PW);
    const T0 = Date.now() - 3 * 3600000;
    const S2 = 'bs-5e55a002', S3 = 'bs-5e55a003', S4 = 'bs-5e55a004', KC = 'bk-5e55c0de';
    const idx = [], mks = [];
    mks.push(BS.markerFor({ phase: 'start', id: S2, browserKey: KA, profileId: PW, webuiSessionId: SID, label: 'work', at: T0 }));
    CLICKS.forEach(([x, y], i) => {
      const id = T.mintEntryId('5e55a002' + String(i).padStart(4, '0'));
      const atI = T0 + (i + 1) * 20000;
      for (const which of ['before', 'after']) fs.writeFileSync(path.join(sd, `${id}-${which}.jpg`), jpegs[which === 'after' ? i : Math.max(0, i - 1)]);
      const meta = (which) => ({ file: `${id}-${which}.jpg`, bytes: jpegs[i].length, w: FW, h: FH, scale: 1, scrollX: 0, scrollY: 0, seq: i, at: atI });
      const e = T.entryFor({ id, at: atI, sessionId: SID, browserKey: KA, profileId: PW, browserSession: S2, command: { action: 'mouseclick', params: { x, y } }, result: { id, data: {} }, position: { kind: 'point', x, y }, before: meta('before'), after: meta('after'), url: `https://shop.example/step-${i + 1}` });
      fs.writeFileSync(path.join(sd, `${id}.json`), J(e)); idx.push(J(e));
    });
    // lane trace-fits: two RUNS of the live view's own page-size changes inside S2 — after the 3rd click a run of 3 (one
    // entry: n 3, lastAt 5 s later, its first before frame + its last after frame), after the 5th a run of 2 — the shape
    // the recorder leaves on disk; the chat card still says 6 actions, the replay steps 6 and ticks twice
    const FITS = [[3, 3], [5, 2]];
    FITS.forEach(([after, n], k) => {
      const id = T.mintEntryId('5e55a0f1' + String(k).padStart(4, '0'));
      const atF = T0 + after * 20000 + 5000;
      fs.writeFileSync(path.join(sd, `${id}-before.jpg`), jpegs[after - 1]); fs.writeFileSync(path.join(sd, `${id}-after-${n}.jpg`), jpegs[after]);
      const meta = (file, i) => ({ file, bytes: jpegs[i].length, w: FW, h: FH, scale: 1, scrollX: 0, scrollY: 0, seq: 100 + k, at: atF });
      const e = { ...T.entryFor({ id, at: atF, sessionId: SID, browserKey: KA, profileId: PW, browserSession: S2, command: { action: 'viewer-fit', params: { width: 1072, height: 907, why: 'fit' } }, result: { id, success: true, data: { width: 1072, height: 907, why: 'fit' } }, position: { kind: 'viewport', width: 1072, height: 907, why: 'fit' }, before: meta(`${id}-before.jpg`, after - 1), after: meta(`${id}-after-${n}.jpg`, after), url: `https://shop.example/step-${after}` }), n, lastAt: atF + 5000 * (n - 1) };
      fs.writeFileSync(path.join(sd, `${id}.json`), J(e)); idx.push(J(e));
    });
    mks.push(BS.markerFor({ phase: 'end', id: S2, browserKey: KA, profileId: PW, label: 'work', at: T0 + 10 * 60000, count: 6, durationMs: 10 * 60000, reason: 'released' }));
    const T1 = T0 + 3600000;
    mks.push(BS.markerFor({ phase: 'start', id: S3, browserKey: KA, profileId: PW, webuiSessionId: SID, label: 'work', at: T1 }));
    for (let i = 0; i < 3; i++) {
      const id = T.mintEntryId('5e55a003' + String(i).padStart(4, '0'));
      const e = { ...T.entryFor({ id, at: T1 + (i + 1) * 30000, sessionId: SID, browserKey: KA, profileId: PW, browserSession: S3, command: { action: 'click', params: { selector: '#buy' } }, result: { id, data: {} }, position: { kind: 'target', selector: '#buy', box: null, why: 'x' }, url: 'https://shop.example/cart' }), framesRemoved: { at: Date.now() - 60000, why: 'size', limit: 1073741824 } };
      fs.writeFileSync(path.join(sd, `${id}.json`), J(e)); idx.push(J(e));
    }
    mks.push(BS.markerFor({ phase: 'end', id: S3, browserKey: KA, profileId: PW, label: 'work', at: T1 + 5 * 60000, count: 3, durationMs: 5 * 60000, reason: 'stopped' }));
    // ③b (verifier 2026-09-28): a LONG session — 1 200 frame-less actions on a third key nobody is live on (the chat's cards
    // and ⑨'s empty key stay what they are); the answer carries the newest 1 000 and the window must SAY so
    const T4 = T0 - 2 * 3600000; // older than every other session, so the profile's replay still opens on the newest (⑤)
    mks.push(BS.markerFor({ phase: 'start', id: S4, browserKey: KC, profileId: PW, webuiSessionId: null, label: 'work', at: T4 }));
    for (let i = 0; i < 1200; i++) idx.push(J(T.entryFor({ id: T.mintEntryId('5e55a004' + String(i).padStart(4, '0')), at: T4 + (i + 1) * 1000, sessionId: null, browserKey: KC, profileId: PW, browserSession: S4, command: { action: 'click', params: { x: i % 300, y: 7 } }, result: { id: 'c' + i, data: {} }, position: { kind: 'point', x: i % 300, y: 7 } })));
    mks.push(BS.markerFor({ phase: 'end', id: S4, browserKey: KC, profileId: PW, label: 'work', at: T4 + 1300 * 1000, count: 1200, durationMs: 1300 * 1000, reason: 'released' }));
    fs.appendFileSync(path.join(sd, 'index.ndjson'), idx.join('\n') + '\n');
    fs.appendFileSync(path.join(sd, BS.MARKERS_FILE), mks.map(J).join('\n') + '\n');
    if (!await boot('second — the restart')) return;
    await p1.load('zh', 1280, 800);
    ok(await openChat(p1), '② after the restart the chat window re-attaches (the first attach = the rebuild)');
    const rebuilt = await until(async () => { const c = await cardsNow(p1); return c.length >= 6 ? c : null; }, 20000, 200);
    const order = (rebuilt || []).map((c) => `${c.s}:${c.phase}`);
    ok(rebuilt && order.join() === [`${S2}:start`, `${S2}:end`, `${S3}:start`, `${S3}:end`, `${S1}:start`, `${S1}:end`].join(), `② every card is back after the rebuild — the seeded sessions' (only their markers on disk could say them) and the live one, in time order (${order.join(' ')})`);
    ok(rebuilt && /^VibeSpace · 浏览器会话结束 · 用时 10 分钟 · 6 步操作 · 对话不再使用这个浏览器$/.test(rebuilt[1].text) && /^VibeSpace · 浏览器会话结束 · 用时 5 分钟 · 3 步操作 · 浏览器被停止了$/.test(rebuilt[3].text) && rebuilt[1].replay && rebuilt[3].replay && !rebuilt[5].replay && /\bmounts-btn\b/.test(rebuilt[1].btn), `② the rebuilt end cards say the duration, the actions and why each ended; 回放 (the house text button) where the agent acted, none on the 0-action one ("${rebuilt && rebuilt[1].text}")`);
    ok(await p1.text(`.chat-msg.chat-browser-session[data-browser-session="${S2}"][data-phase="end"] .chat-browser-session-replay`) === '回放', '② the button says 回放');
    await p1.shot('02-zh-rebuilt-cards', '.window:has(.chat-browser-session)');

    // ═══ ③ the replay window FROM THE CARD ═══
    console.log('— ③ the replay window from the card: the list, the picture, the keys, the play');
    ok(await p1.click(`.chat-msg.chat-browser-session[data-browser-session="${S2}"][data-phase="end"] .chat-browser-session-replay`), '③ 回放 on the 6-action session\'s end card (a real mouse)');
    const RP = '.window .brp';
    const rs = () => p1.ev(`(() => { for (const [, w] of window.app.wm.windows) if (w.type === 'browser-replay' && w._browserReplay) return { ...w._browserReplay.state(), title: w.title, wins: [...window.app.wm.windows.values()].filter((x) => x.type === 'browser-replay').length }; return null; })()`);
    const r0 = await until(async () => { const s = await rs(); return s && s.chosen === S2 && s.n === 6 ? s : null; }, 10000, 120);
    ok(r0 && r0.sessions === 3 && r0.index === 0 && r0.which === 'after' && r0.empty === null, `③ the replay window opened on THAT session: 3 sessions listed, its 6 actions, the first action's after-frame (${J(r0)})`);
    ok(r0 && /浏览回放 · 网店巡检/.test(String(r0.title || '')), `③ its title: "${r0 && r0.title}"`);
    const rows = await p1.ev(`[...document.querySelectorAll('${RP} .brp-session')].map((e) => ({ s: e.dataset.session, active: e.classList.contains('active'), text: e.textContent }))`);
    ok(rows.map((r) => r.s).join() === [S1, S3, S2].join() && rows.find((r) => r.s === S2).active && /6 步操作/.test(rows.find((r) => r.s === S2).text) && /帮手|自己的临时浏览器|work/.test(rows[0].text), `③ the session list, NEWEST first, the chosen one marked (${rows.map((r) => r.text).join(' | ')})`);
    const acts = await p1.ev(`[...document.querySelectorAll('${RP} .brp-action')].map((e) => ({ id: e.dataset.traceId, img: !!e.querySelector('img'), text: e.textContent }))`);
    ok(acts.length === 6 && acts.every((a) => a.img) && /mouseclick 120,90/.test(acts[0].text), `③ its actions: time · verb · where · the after-frame's thumbnail (${acts.length})`);
    // lane trace-fits (the owner 2026-10-01): the session's 5 page-size changes (2 runs) are thin TICKS between the 6 steps,
    // never steps of their own; the toggle (one per-device preference) makes each run's entry a step, and off again
    const ticks = await p1.ev(`[...document.querySelectorAll('${RP} .brp-tick')].map((e) => ({ id: e.dataset.fitsId, n: e.dataset.fits, text: e.textContent, title: e.title }))`);
    const rT = await rs();
    ok(ticks.length === 2 && ticks[0].n === '3' && ticks[0].text === '实时视图已适配 ×3 · 1072×907（最后一次）' && ticks[1].n === '2' && /3 次页面尺寸变化/.test(ticks[0].title) && rT && rT.n === 6 && rT.ticks === 2 && rT.entries === 8, `③ the 5 page-size changes are 2 thin ticks between the 6 steps (${ticks.map((x) => x.text).join(' | ')}; steps ${rT && rT.n}, entries ${rT && rT.entries})`, { ticks, rT });
    const tickPos = await p1.ev(`[...document.querySelectorAll('${RP} .brp-actions > *')].map((e) => e.classList.contains('brp-tick') ? 'tick' : 'step').join(',')`);
    ok(tickPos === 'step,step,step,tick,step,step,tick,step', `③ each tick sits where its run happened — after the 3rd and the 5th step (${tickPos})`);
    const togVis = await p1.ev(`(() => { const l = document.querySelector('${RP} .brp-fits-bar .browser-trace-fits-toggle'); return l && getComputedStyle(l).display !== 'none' ? { text: l.textContent.trim(), on: l.querySelector('input').checked, h: l.getBoundingClientRect().height } : null; })()`);
    ok(togVis && togVis.text === '显示页面尺寸变化' && togVis.on === false && togVis.h > 0, `③ the toggle is there with its words, off by default (${J(togVis)})`);
    ok(await p1.click(`${RP} .brp-fits-bar .browser-trace-fits-toggle input`), '③ the toggle on (a real mouse)');
    const onS = await until(async () => { const s = await rs(); return s && s.showFits && s.n === 8 && s.ticks === 0 ? s : null; }, 4000, 80);
    const fitRows = await p1.ev(`[...document.querySelectorAll('${RP} .brp-action.fits')].map((e) => e.textContent)`);
    ok(onS && fitRows.length === 2 && /viewer-fit 1072×907 ×3/.test(fitRows[0]) && /×2/.test(fitRows[1]), `③ on: each run's entry is a step of its own saying how many it stands for (8 steps, 0 ticks; "${fitRows[0]}")`, { onS, fitRows });
    ok(await p1.click(`${RP} .brp-fits-bar .browser-trace-fits-toggle input`), '③ …and off again');
    const offS = await until(async () => { const s = await rs(); return s && !s.showFits && s.n === 6 && s.ticks === 2 && s.index === 0 ? s : null; }, 4000, 80);
    ok(!!offS, '③ off: 6 steps and 2 ticks again, the first step still showing (the preference is the device\'s — every surface reads it)', offS);
    const pic = async () => p1.ev(`(() => { const img = document.querySelector('${RP} .brp-img'); const dot = document.querySelector('${RP} .brp-pic .browser-trace-overlay.dot'); if (!img || !img.complete || !img.naturalWidth) return null; const ib = img.getBoundingClientRect(); const db = dot ? dot.getBoundingClientRect() : null; return { src: img.getAttribute('src'), w: ib.width, h: ib.height, dx: db ? db.left + db.width / 2 - ib.left : null, dy: db ? db.top + db.height / 2 - ib.top : null }; })()`);
    const g0 = await until(async () => { const g = await pic(); return g && g.dx !== null ? g : null; }, 8000, 100);
    const within = (g, [x, y]) => g && Math.abs(g.dx - x * g.w / FW) <= 3 && Math.abs(g.dy - y * g.h / FH) <= 3;
    ok(g0 && /\/api\/browser\/actions\/tr-5e55a0020000\/frame\/after$/.test(g0.src) && within(g0, CLICKS[0]), `③ the after-frame at full width with the click DRAWN where the fixture clicked (±3 px): dot at ${g0 && Math.round(g0.dx)},${g0 && Math.round(g0.dy)} of ${g0 && Math.round(g0.w)}×${g0 && Math.round(g0.h)}`);
    await p1.shot('03-zh-replay-first', RP);
    await p1.ev(`document.querySelector('${RP}').focus()`);
    await p1.key('ArrowRight', 'ArrowRight', 39);
    const g1 = await until(async () => { const s = await rs(); const g = await pic(); return s && s.index === 1 && g && /0001\/frame\/after$/.test(g.src) && g.dx !== null ? g : null; }, 4000, 80);
    ok(g1 && within(g1, CLICKS[1]), '③ → = the next action, its click drawn at its own point');
    await p1.key('End', 'End', 35); const sEnd = await rs();
    await p1.key('Home', 'Home', 36); const sHome = await rs();
    await p1.key('ArrowLeft', 'ArrowLeft', 37); const sLeft = await rs();
    ok(sEnd.index === 5 && sHome.index === 0 && sLeft.index === 0, `③ End = the last, Home = the first, ← at the first stays (${sEnd.index} ${sHome.index} ${sLeft.index})`);
    ok(await p1.click(`${RP} .brp-which:not(.active)`) && (await until(async () => { const g = await pic(); return g && /frame\/before$/.test(g.src) ? g : null; }, 3000, 80)), '③ 操作前 shows the before-frame (the toggle)');
    await p1.click(`${RP} .brp-which:not(.active)`);
    await p1.ev(`document.querySelector('${RP}').focus()`);
    const t0 = Date.now();
    await p1.key(' ', 'Space', 32);
    const mid = await until(async () => { const s = await rs(); return s && s.playing && s.index >= 2 ? { ...s, ms: Date.now() - t0 } : null; }, 5000, 60);
    const endp = await until(async () => { const s = await rs(); return s && !s.playing && s.index === 5 ? { ...s, ms: Date.now() - t0 } : null; }, 9000, 60);
    ok(mid && mid.ms >= 1800 && mid.ms <= 3500, `③ Space plays ONE action a second (index 2 after ${mid && mid.ms} ms)`);
    ok(endp && endp.ms >= 4800 && endp.ms <= 7500, `③ …and stops by itself at the last action (${endp && endp.ms} ms for 5 steps)`);
    await p1.shot('03b-zh-replay-played', RP);

    // ═══ ③c a LONG session: the cut is SAID, the rows are KEYED (verifier 2026-09-28) ═══
    console.log('— ③c a 1 200-action session: "last 1 000 of 1 200" said in the head; a reload keeps every row node');
    await p1.ev(`window.app.openBrowserReplay({ browserKey: ${J(KC)}, session: ${J(S4)} })`);
    const rsC = () => p1.ev(`(() => { for (const [, w] of window.app.wm.windows) if (w.type === 'browser-replay' && w._browserReplay && w._browserReplay.target().browserKey === ${J(KC)}) return w._browserReplay.state(); return null; })()`);
    const r3c = await until(async () => { const s = await rsC(); return s && s.chosen === S4 && s.n === 1000 ? s : null; }, 12000, 120);
    ok(r3c && r3c.total === 1200, `③c the window holds the newest 1 000 of 1 200 (n ${r3c && r3c.n}, total ${r3c && r3c.total})`);
    const head3c = await p1.ev(`(() => { for (const [, w] of window.app.wm.windows) if (w.type === 'browser-replay' && w._browserReplay && w._browserReplay.target().browserKey === ${J(KC)}) { const h = w.content.querySelector('.brp-actions-head'); return h ? h.textContent.trim() : null; } return null; })()`);
    ok(head3c === '操作（最近 1000 步，共 1200 步）', `③c the head SAYS the cut in the device's words ("${head3c}") — never "操作 (1000)" under a row that says 1200`);
    ok(/1200 步操作/.test(await p1.text(`.brp-session[data-session="${S4}"]`)), '③c …while the session row keeps saying 1200 actions');
    const k3c = await p1.ev(`(async () => {
      const w = [...window.app.wm.windows.values()].find((x) => x.type === 'browser-replay' && x._browserReplay && x._browserReplay.target().browserKey === ${J(KC)});
      const list = w.content.querySelector('.brp-actions'); const first = list.firstElementChild, last = list.lastElementChild, n0 = list.childElementCount;
      const fetched = () => performance.getEntriesByType('resource').filter((r) => r.name.includes('/api/browser/sessions?')).length;
      const f0 = fetched();
      for (const h of (window.app.ws.globalHandlers || [])) { try { h({ type: 'browser-trace-appended', browserKey: ${J(KC)}, profileId: ${J(PW)}, entry: { id: 'tr-000000000000', at: Date.now() } }); } catch {} }
      const t0 = performance.now(); while (performance.now() - t0 < 4000 && fetched() === f0) await new Promise((r) => setTimeout(r, 50));
      await new Promise((r) => setTimeout(r, 300));
      return { reloaded: fetched() > f0, firstSame: list.firstElementChild === first, lastSame: list.lastElementChild === last, n: list.childElementCount, n0, activeKept: !!list.querySelector('.brp-action.active') };
    })()`);
    ok(k3c && k3c.reloaded && k3c.firstSame && k3c.lastSame && k3c.n === 1000 && k3c.n0 === 1000 && k3c.activeKept, `③c a trace broadcast for this conversation RELOADS the list (${k3c && k3c.reloaded}) and every row keeps its node — first ${k3c && k3c.firstSame}, last ${k3c && k3c.lastSame}, ${k3c && k3c.n} rows, the active row kept`, k3c);
    await p1.shot('03c-zh-replay-long', RP);
    ok(await p1.ev(`(() => { const w = [...window.app.wm.windows.values()].find((x) => x.type === 'browser-replay' && x._browserReplay && x._browserReplay.target().browserKey === ${J(KC)}); if (!w) return false; window.app.wm.closeWindow(w.id); return true; })()`), '③c the long session\'s window closed (its conversation has no chat here; ④ counts windows)');

    // ═══ ④ a session whose frames the size limit took ═══
    console.log('— ④ the swept session: the named empty state, its list kept');
    ok(await p1.ev(`(() => { const w = [...window.app.wm.windows.values()].find((x) => x.type === 'chat'); if (w) window.app.goToWinId(w.id); return true; })()`), '④ back to the chat');
    ok(await p1.click(`.chat-msg.chat-browser-session[data-browser-session="${S3}"][data-phase="end"] .chat-browser-session-replay`), '④ 回放 on the swept session\'s end card');
    const r4 = await until(async () => { const s = await rs(); return s && s.chosen === S3 && s.n === 3 && s.empty ? s : null; }, 8000, 100);
    const emptyTxt = await p1.text(`${RP} .brp-empty`);
    ok(r4 && r4.empty === 'frames-removed' && emptyTxt === tr('zh', 'Frames of this session were removed to stay under the {size} limit; the action list is kept', { size: '1 GB' }) && r4.n === 3 && (await rs()).wins === 1, `④ the SAME window (one per conversation) now on that session: "${emptyTxt}" — and its 3 actions still listed`);
    ok((await p1.ev(`[...window.app.wm.windows.values()].filter((x) => x.type === 'browser-replay').length`)) === 1, '④ one replay window for the conversation, never two');
    await p1.shot('04-zh-replay-frames-removed', RP);

    // ═══ ⑤ from Session properties, and from the Agent browser panel ═══
    console.log('— ⑤ from Session properties and from the panel');
    await p1.ev(`(() => { for (const [id, w] of window.app.wm.windows) if (w.type === 'browser-replay') window.app.wm.closeWindow(id); return true; })()`);
    await p1.ev(`window.app.openSessionProps((window.app.sidebar._allSessions || []).find((s) => s.webuiId === ${J(SID)}))`);
    const propRow = await until(() => p1.ev(`(() => { const r = document.querySelector('.session-props-browser-sessions'); return r ? r.textContent : null; })()`), 10000, 150);
    ok(propRow && propRow.startsWith('浏览器会话（3）') && propRow.endsWith('回放'), `⑤ Session properties: "${propRow}"`);
    await p1.shot('05-zh-props-row', '.window:has(.session-props-browser-sessions)');
    ok(await p1.click('.session-props-browser-sessions .session-props-browser-replay'), '⑤ its 回放 (a real mouse)');
    const r5 = await until(async () => { const s = await rs(); return s && s.sessions === 3 ? s : null; }, 8000, 100);
    ok(r5 && r5.chosen === S1, `⑤ …opens the replay window on the conversation's sessions, the newest chosen (${r5 && r5.chosen})`);
    await p1.ev(`(() => { for (const [id, w] of window.app.wm.windows) if (w.type === 'browser-replay') window.app.wm.closeWindow(id); return true; })()`);
    await p1.ev('window.app.openBrowserProfiles()');
    await until(() => p1.ev(`!!document.querySelector('.bprof-profile[data-profile-id="${PW}"] .bprof-more')`), 10000, 150);
    ok(await p1.click(`.bprof-profile[data-profile-id="${PW}"] .bprof-more`), '⑤ the row\'s ⋯ (design 015: one menu for every act but the primary)');
    const rpBtn = await until(() => p1.ev(`(() => { const b = document.querySelector('.context-menu .bprof-replay'); return b ? { text: b.textContent, item: !!b.closest('.context-menu-item') } : null; })()`), 5000, 100);
    ok(rpBtn && rpBtn.text === '回放…' && rpBtn.item, `⑤ the Agent browser panel's profile row offers "${rpBtn && rpBtn.text}" (a ⋯ menu row)`);
    await p1.ev(`document.querySelectorAll('.context-menu').forEach((m) => m.remove())`);
    await p1.click(`.bprof-profile[data-profile-id="${PW}"] .bprof-chev`); // its fold: the records against the limit
    const usedTxt = await p1.text(`.bprof-profile[data-profile-id="${PW}"] .bprof-trace`);
    const usedLine = await p1.text(`.bprof-profile[data-profile-id="${PW}"] .bprof-fold-item[data-key="records"] .bprof-fold-v`);
    const usedFits = await p1.ev(`(() => { const e = document.querySelector('.bprof-profile[data-profile-id="${PW}"] .bprof-fold-item[data-key="records"] .bprof-fold-v'); return !!e && e.clientWidth > 0 && e.scrollWidth <= e.clientWidth + 1; })()`);
    ok(String(usedTxt).startsWith('1209 个操作') && /* 9 + ③c's 1 200 */ /^1209 个操作 · \d+(\.\d)? (B|KB|MB) \/ 1 GB( · |$)/.test(String(usedLine)) && usedFits, `⑤ the row says its actions; its fold says what its records use against the limit, whole ("${usedTxt}" · "${usedLine}")`);
    const hint = await p1.text('.bprof-hint');
    ok(String(hint).startsWith(tr('zh', 'Each profile keeps its records up to {size}; over it, the oldest sessions\' frames are removed first and every action list stays. Recordings are kept {days} days or {mb} MB. Frames of a logged-in page are secrets. Nothing here deletes a profile by itself: setting one aside moves its directory beside itself, and only your click on a set-aside row deletes it.', { size: '1 GB', days: 7, mb: 200 }).slice(0, 20)) && !/保留 7 天或 200 MB\(以先到者为准\)/.test(String(hint)), '⑤ the panel\'s hint is by size (1 GB), no "7 days or 200 MB, whichever first" for the traces');
    await p1.shot('05b-zh-panel-row', `.bprof-profile[data-profile-id="${PW}"]`);
    await p1.click(`.bprof-profile[data-profile-id="${PW}"] .bprof-chev`);
    ok(await p1.click(`.bprof-profile[data-profile-id="${PW}"] .bprof-more`) && await until(() => p1.ev(`!!document.querySelector('.context-menu .bprof-replay')`), 5000, 80) && await p1.click('.context-menu .bprof-replay'), '⑤ ⋯ → 回放… clicked');
    const r5b = await until(async () => { const s = await rs(); return s && s.sessions === 4 ? s : null; }, 8000, 100); // the three of KA + ③c's long one
    ok(r5b && r5b.chosen === S1, '⑤ …the replay window of the PROFILE: every session on it (4)');

    // ═══ ⑥ the live view of a STOPPED browser ═══
    console.log('— ⑥ the live view of a stopped browser: its Sessions list, the dividers');
    await p1.ev(`(() => { for (const id of [...window.app.wm.windows.keys()]) { try { window.app.wm.closeWindow(id); } catch {} } return true; })()`);
    await api('POST', '/api/browser/attach', { sessionId: SID, profile: 'work' }); // the lease again (S4 opens)
    const stp = await api('POST', `/api/browser/profiles/${PW}/stop`); // a person's Stop: the browser is not running (the lease stays)
    ok(stp.status === 200, '⑥ the lease again, then the user\'s Stop — a STOPPED browser', stp.json);
    await p1.ev(`window.app.openBrowserLive({ sessionId: ${J(SID)} })`);
    const lv = await until(() => p1.ev(`(() => { const w = [...window.app.wm.windows.values()].find((x) => x.type === 'browser-live'); if (!w) return null; const side = w.element.querySelector('.browser-live-side'); const box = w.element.querySelector('.browser-live-sessions'); if (!side || getComputedStyle(side).display === 'none' || !box || getComputedStyle(box).display === 'none') return null; return { rows: [...box.querySelectorAll('.browser-live-session')].map((r) => ({ text: r.textContent, btn: (r.querySelector('button') || {}).className || '' })), head: box.querySelector('.browser-live-sessions-head').textContent, dividers: [...w.element.querySelectorAll('.browser-live-trace-divider')].map((d) => d.textContent), stopped: w._browserLive.state().stopped, status: (w.element.querySelector('.browser-live-status') || {}).textContent, folds: [...w.element.querySelectorAll('.browser-live-trace-row.fold')].map((r) => ({ n: r.dataset.fits, text: (r.querySelector('.browser-live-trace-label') || {}).textContent, dim: getComputedStyle(r).color })), plainRows: w.element.querySelectorAll('.browser-live-trace-row:not(.fits)').length, toggle: (() => { const l = w.element.querySelector('.browser-live-trace-head .browser-trace-fits-toggle'); return l && getComputedStyle(l).display !== 'none' ? { text: l.textContent.trim(), on: l.querySelector('input').checked } : null; })(), count: (w.element.querySelector('.browser-live-trace-count') || {}).textContent, rowColor: getComputedStyle(w.element.querySelector('.browser-live-trace-row:not(.fits)')).color }; })()`), 15000, 200);
    if (!lv) console.log('    [debug ⑥]', J(await p1.ev(`(() => { const w = [...window.app.wm.windows.values()].find((x) => x.type === 'browser-live'); if (!w) return 'no window'; const s = w._browserLive.state(); return { side: getComputedStyle(w.element.querySelector('.browser-live-side')).display, pane: s.sidePane, stopped: s.stopped, error: s.error, status: (w.element.querySelector('.browser-live-status') || {}).textContent, target: s.target, sess: (w.element.querySelector('.browser-live-sessions') || {}).outerHTML?.slice(0, 300) }; })()`)));
    ok(lv && lv.rows.length === 4 && lv.head === '会话 (4)' && lv.rows.every((r) => /回放$/.test(r.text) && /\bmounts-btn\b/.test(r.btn)), `⑥ the view of the stopped browser opens its Actions pane on the Sessions list by itself — 4 sessions, each with 回放 (${lv && lv.head})`, lv);
    ok(lv && lv.dividers.length === 2 && /^第 1 次会话 · .+ 开始$/.test(lv.dividers[0]) && /^第 2 次会话 · .+ 开始$/.test(lv.dividers[1]), `⑥ the actions carry a divider where each session begins (${lv && lv.dividers.join(' | ')})`);
    // lane trace-fits: the pane's 2 runs are 2 dim fold rows among the 9 agent actions, the count line says both, the toggle expands them
    const wantCount = tr('zh', '{n} action(s)', { n: 9 }) + ' · ' + tr('zh', '{n} page-size change(s)', { n: 5 }) + ' · ' + tr('zh', 'newest last');
    ok(lv && lv.folds.length === 2 && lv.folds[0].n === '3' && lv.folds[0].text === '实时视图已适配 ×3 · 1072×907（最后一次）' && lv.folds[1].n === '2' && lv.plainRows === 9 && lv.folds[0].dim !== lv.rowColor, `⑥ the Actions pane folds each run into ONE dim row (${lv && lv.folds.map((f) => f.text).join(' | ')}; ${lv && lv.plainRows} agent rows)`, lv && { folds: lv.folds, plainRows: lv.plainRows, rowColor: lv.rowColor });
    ok(lv && lv.count === wantCount && lv.toggle && lv.toggle.text === '显示页面尺寸变化' && lv.toggle.on === false, `⑥ the count line says the agent's actions with the page-size changes beside ("${lv && lv.count}"), the toggle off`, lv && { count: lv.count, toggle: lv.toggle });
    await p1.shot('06-zh-live-stopped-sessions', '.window:has(.browser-live)');
    ok(await p1.click('.browser-live-trace-head .browser-trace-fits-toggle input'), '⑥ the pane\'s toggle on (a real mouse)');
    const lvOn = await until(() => p1.ev(`(() => { const w = [...window.app.wm.windows.values()].find((x) => x.type === 'browser-live'); if (!w) return null; const folds = w.element.querySelectorAll('.browser-live-trace-row.fold').length, fits = [...w.element.querySelectorAll('.browser-live-trace-row.fits:not(.fold)')].map((r) => r.querySelector('.browser-live-trace-label').textContent); return folds === 0 && fits.length === 2 ? { folds, fits, dividers: w.element.querySelectorAll('.browser-live-trace-divider').length } : null; })()`), 4000, 80);
    ok(lvOn && /viewer-fit 1072×907 ×3/.test(lvOn.fits[0]) && lvOn.dividers === 2, `⑥ on: the runs' entries are rows of their own (${lvOn && lvOn.fits.join(' | ')}), the dividers untouched`, lvOn);
    await p1.shot('06b-zh-live-fits-expanded', '.window:has(.browser-live)');
    ok(await p1.click('.browser-live-trace-head .browser-trace-fits-toggle input'), '⑥ …and off again');
    ok(await until(() => p1.ev(`(() => { const w = [...window.app.wm.windows.values()].find((x) => x.type === 'browser-live'); return w && w.element.querySelectorAll('.browser-live-trace-row.fold').length === 2 && !w.element.querySelector('.browser-live-trace-head .browser-trace-fits-toggle input').checked; })()`), 4000, 80), '⑥ off: the two fold rows again');
    ok(await p1.click('.browser-live-session:nth-child(3) .browser-live-session-replay'), '⑥ a Sessions row\'s 回放');
    const r6 = await until(async () => { const s = await rs(); return s && s.sessions >= 4 ? s : null; }, 8000, 100);
    ok(r6 && r6.chosen === S3, `⑥ …opens the replay on THAT session (${r6 && r6.chosen})`);
    await api('POST', '/api/browser/detach', { sessionId: SID, profile: 'work' });

    // ═══ ⑧ the rect census in zh / ja / en (the chat cards, the replay window) ═══
    console.log('— ⑧ the rect census: zh / ja / en');
    for (const lang of ['zh', 'ja', 'en']) {
      await p1.load(lang, 1280, 800);
      await openChat(p1);
      await until(async () => (await cardsNow(p1)).length >= 8, 15000, 200);
      const c = await cardsNow(p1);
      const want = tr(lang, 'Browser session ended · {duration} · {n} actions', { duration: tr(lang, '{n} min', { n: 10 }), n: 6 }) + ' · ' + tr(lang, 'the conversation stopped using this browser');
      ok(c.some((x) => x.text === tr(lang, 'VibeSpace · {what}', { what: want })), `⑧ ${lang}: the end card in the device's words ("${tr(lang, 'VibeSpace · {what}', { what: want })}")`);
      const rc = await p1.rects({ pairs: [['.chat-msg.chat-browser-session', '.chat-vs-notice-title, .chat-browser-session-replay, .chat-browser-session-note', { h: true }]], viewport: true });
      ok(rc.problems.length === 0 && rc.n >= 8, `⑧ ${lang}: the chat cards — every title and button inside its card, nothing clipped (${rc.n} parts)`, rc.problems);
      await p1.shot(`08-${lang}-chat-cards`, '.window:has(.chat-browser-session)');
      await p1.ev(`window.app.openBrowserReplay({ browserKey: ${J(KA)}, session: ${J(S2)} })`);
      await until(async () => { const s = await rs(); return s && s.chosen === S2 && s.n === 6; }, 8000, 100);
      await p1.frames();
      const rr = await p1.rects({ pairs: [['.brp-bar', '.mounts-btn, .brp-pos'], ['.brp-sessions', '.brp-session', { h: true }], ['.brp-actions', '.brp-action', { h: true }], ['.brp-main', '.brp-bar, .brp-stage, .brp-caption, .brp-note', { h: true }], ['.brp-session', '.brp-session-when, .brp-session-sub', { h: true }]], viewport: true });
      ok(rr.problems.length === 0 && rr.n >= 20, `⑧ ${lang}: the replay window — every button whole, every row inside its list (${rr.n} parts)`, rr.problems);
      const words = await p1.ev(`[...document.querySelectorAll('.brp-bar .mounts-btn')].map((b) => b.textContent.trim())`);
      // the step buttons + the counter say ONE word with their tooltips (zh 上一步 / 下一步 / 第 k / n 步 — the naive-user verifier)
      const pos = await p1.text('.brp-pos');
      ok(words.join('|') === [tr(lang, 'Before'), tr(lang, 'After'), trc(lang, 'replay', 'Previous'), tr(lang, 'Play'), trc(lang, 'replay', 'Next')].join('|') && pos === trc(lang, 'replay', '{i} of {n}', { i: 1, n: 6 }), `⑧ ${lang}: each button says what it does (${words.join(' · ')}; "${pos}")`);
      if (lang === 'zh') ok(words[2] === '上一步' && words[4] === '下一步' && pos === '第 1 / 6 步', `⑧ zh: 上一步 / 下一步 / 第 1 / 6 步 — the tooltips' word (${words[2]} · ${words[4]} · ${pos})`);
      await p1.shot(`08-${lang}-replay`, '.window:has(.brp)');
    }

    // ═══ ⑦ the phone ═══
    console.log('— ⑦ the phone (390×844): stacked, ≥ 44 px targets');
    await p1.load('zh', 390, 844, true);
    await p1.ev(`window.app.openBrowserReplay({ browserKey: ${J(KA)}, session: ${J(S2)} })`);
    await until(async () => { const s = await rs(); return s && s.chosen === S2 && s.n === 6; }, 10000, 100);
    await p1.frames();
    const ph = await p1.ev(`(() => { const r = document.querySelector('.brp'); const side = r.querySelector('.brp-side').getBoundingClientRect(); const main = r.querySelector('.brp-main').getBoundingClientRect(); return { narrow: r.classList.contains('narrow'), sideBottom: side.bottom, mainTop: main.top }; })()`);
    ok(ph.narrow && ph.sideBottom <= ph.mainTop + 1, `⑦ the list ABOVE the picture (list bottom ${Math.round(ph.sideBottom)} ≤ picture top ${Math.round(ph.mainTop)})`);
    const pr = await p1.rects({ pairs: [['.brp-bar', '.mounts-btn'], ['.brp-sessions', '.brp-session', { h: true }], ['.brp-actions', '.brp-action', { h: true }]], minHeights: [['.brp-bar .mounts-btn', 44], ['.brp-session', 44], ['.brp-action', 44]], viewport: true });
    ok(pr.problems.length === 0, `⑦ every target ≥ 44 px, nothing past its list or the screen, nothing sideways (${pr.n} parts)`, pr.problems);
    ok(await p1.tap('.brp-bar .brp-next') && (await until(async () => { const s = await rs(); return s && s.index === 1; }, 3000, 80)), '⑦ a tap on 下一步 steps (a touch, not a click)');
    await p1.shot('07-zh-phone-replay');
    // ⑦b (the naive-user verifier, 2026-09-28): the chosen session's row is IN VIEW of its list — the oldest one opened
    // from its card sat below the newest three, and the actions shown belonged to a row the user could not see
    const seenRow = () => p1.ev(`(() => { const l = document.querySelector('.brp-sessions'); const a = l && l.querySelector('.brp-session.active'); if (!a) return null; const lb = l.getBoundingClientRect(), ab = a.getBoundingClientRect(); return { s: a.dataset.session, inView: ab.top >= lb.top - 1 && ab.bottom <= lb.bottom + 1, scrolled: l.scrollTop, rows: l.querySelectorAll('.brp-session').length, overflows: l.scrollHeight > l.clientHeight + 1 }; })()`);
    await p1.ev(`(() => { for (const [id, w] of window.app.wm.windows) if (w.type === 'browser-replay') window.app.wm.closeWindow(id); return true; })()`);
    await p1.ev(`window.app.openBrowserReplay({ browserKey: ${J(KA)}, session: ${J(S2)} })`); // S2 = the OLDEST of this conversation's sessions: the list's last row
    await until(async () => { const s = await rs(); return s && s.chosen === S2 && s.n === 6; }, 8000, 100);
    await p1.frames();
    const sr = await seenRow();
    ok(sr && sr.s === S2 && sr.inView && sr.overflows && sr.scrolled > 0, `⑦b the OLDEST session opened on the phone: its row is scrolled into view of its own list (${J(sr)})`);
    await p1.ev(`document.querySelector('.brp-sessions').scrollTop = 0`);
    const ctl7 = await seenRow();
    ok(ctl7 && !ctl7.inView, `CONTROL: the same list scrolled back to the top hides that row — the judge sees the difference (${J(ctl7)})`);
    await p1.shot('07b-zh-phone-replay-oldest');
    // ⑦c: the live view of a STOPPED browser on the phone — the Sessions list takes the width, the status sits above it
    await p1.ev(`(() => { for (const id of [...window.app.wm.windows.keys()]) { try { window.app.wm.closeWindow(id); } catch {} } return true; })()`);
    await api('POST', '/api/browser/attach', { sessionId: SID, profile: 'work' });
    await api('POST', `/api/browser/profiles/${PW}/stop`);
    await p1.ev(`window.app.openBrowserLive({ sessionId: ${J(SID)} })`);
    const pastOf = () => p1.ev(`(() => { const w = [...window.app.wm.windows.values()].find((x) => x.type === 'browser-live'); if (!w) return null; const root = w.element.querySelector('.browser-live'); const body = w.element.querySelector('.browser-live-body'); const side = w.element.querySelector('.browser-live-side'); const box = w.element.querySelector('.browser-live-sessions'); const st = w.element.querySelector('.browser-live-status'); if (!side || getComputedStyle(side).display === 'none' || !box) return null; const bb = body.getBoundingClientRect(), sb = side.getBoundingClientRect(), tb = st.getBoundingClientRect(); const texts = [...box.querySelectorAll('.browser-live-session-text')]; const rg = document.createRange(); rg.selectNodeContents(st); const tops = new Set([...rg.getClientRects()].map((x) => Math.round(x.top))); return { past: root.classList.contains('side-past'), sideShare: Math.round(sb.width / bb.width * 100) / 100, statusW: Math.round(tb.width), statusLines: tops.size, statusShown: getComputedStyle(st).display !== 'none' && tb.height > 0, statusAbove: tb.bottom <= sb.top + 1, rows: texts.length, cut: texts.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent) }; })()`);
    const lp = await until(async () => { const x = await pastOf(); return x && x.rows >= 1 ? x : null; }, 15000, 200);
    ok(lp && lp.past && lp.sideShare >= 0.95 && lp.statusShown && lp.statusLines <= 2 && lp.statusAbove && lp.cut.length === 0, `⑦c the phone's view of a stopped browser: the Sessions list takes the width (${lp && lp.sideShare}), the status above it on ${lp && lp.statusLines} line(s), no row cut`, lp);
    await p1.shot('07c-zh-phone-live-stopped');
    const ctl7c = await p1.ev(`(() => { const w = [...window.app.wm.windows.values()].find((x) => x.type === 'browser-live'); const root = w.element.querySelector('.browser-live'); root.classList.remove('side-past'); const bb = w.element.querySelector('.browser-live-body').getBoundingClientRect(), sb = w.element.querySelector('.browser-live-side').getBoundingClientRect(); const st = w.element.querySelector('.browser-live-status'); const rg = document.createRange(); rg.selectNodeContents(st); const lines = new Set([...rg.getClientRects()].map((x) => Math.round(x.top))).size; const cut = [...w.element.querySelectorAll('.browser-live-session-text')].filter((e) => e.scrollWidth > e.clientWidth + 1).length; const out = { share: Math.round(sb.width / bb.width * 100) / 100, lines, cut }; root.classList.add('side-past'); return out; })()`);
    // the .196 mirror (2026-09-28): under the runner's font the squeezed status wrapped to 2 lines, not 3 — the control
    // judges the CHANGE the fix makes (the list narrowed to a column, the status on MORE lines than the fixed layout or a
    // row cut), never a line count that belongs to one font
    ok(ctl7c.share < 0.95 && (ctl7c.lines > (lp && lp.statusLines || 1) || ctl7c.cut > 0), `CONTROL: without the phone's past layout (the pre-fix picture) the judge fails it — the pane ${ctl7c.share} of the width, the status on ${ctl7c.lines} lines (fixed: ${lp && lp.statusLines}), ${ctl7c.cut} row(s) cut`);
    await api('POST', '/api/browser/detach', { sessionId: SID, profile: 'work' });

    // ═══ ⑨ no sessions / the trace off ═══
    console.log('— ⑨ the empty states');
    await p1.load('zh', 1280, 800);
    await p1.ev(`window.app.openBrowserReplay({ browserKey: ${J(KB)} })`);
    const e9 = await until(async () => { const s = await rs(); return s && s.empty ? s : null; }, 8000, 100);
    ok(e9 && e9.empty === 'no-sessions' && (await p1.text('.brp-empty')) === '这个会话还没有浏览记录', `⑨ a conversation with no browser sessions: "${await p1.text('.brp-empty')}"`);
    await p1.shot('09-zh-no-sessions', '.window:has(.brp)');
    await api('PATCH', '/api/settings', { 'browser.actionTrace': false });
    await p1.load('zh', 1280, 800);
    await p1.ev(`window.app.openBrowserReplay({ browserKey: ${J(KB)} })`);
    const e9b = await until(async () => { const s = await rs(); return s && s.empty === 'trace-off' ? s : null; }, 8000, 100);
    ok(e9b && (await p1.text('.brp-empty')) === '操作记录已关闭 — 设置 → Agent 浏览器', `⑨ the trace off: "${await p1.text('.brp-empty')}"`);
    await p1.shot('09b-zh-trace-off', '.window:has(.brp)');
    await api('PATCH', '/api/settings', { 'browser.actionTrace': null });
    ok(p1.errors.length === 0, `no page exception anywhere (${p1.errors.length})`, p1.errors.slice(0, 3));
  } finally {
    try { ctl.close(); } catch { }
    if (srv) await stop();
  }
})();
console.log(`\n${pass} passed, ${fail} failed${skipped ? `, ${skipped} skipped` : ''}`);
process.exit(fail ? 1 : 0);
