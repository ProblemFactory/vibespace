#!/usr/bin/env node
// THE LIVE-VIEW BAR, SEEN — a screenshot + rect census (lane I, 2026-09-25). The owner, zh, a ~1400 px live view of
// an ephemeral browser: "观看" / "接管" stacked one glyph per line over "并排到 VibeSpace 主开发 旁" and the URL, the
// word "undefined" before "0 个观看者", "标签页 (1)" / "控制台 (0)" / "操作 (0)" squeezed into vertical stacks, and no
// "Agent browser — live view" on the chat window's own menu — "你这些UI都检查过吗？". The honest answer was no: the
// live view was gated for BEHAVIOUR in English (state() / textContent), never LOOKED at in zh / ja at real widths.
// This suite looks — every judgement is taken from rendered rects (and a PNG per state is kept as the artifact):
//
//   ① the live view (the owner's path: the agent's `vibespace-browser open <url>` = the ephemeral browser) at zh / ja /
//      en × 600 / 900 / 1400 × dark / light × free / bound beside its chat × Watch / Take over (a REAL takeover through
//      the bridge); per state, over every rendered child of `.browser-live-bar`: no two paint rects overlap; no label
//      wraps (a text taller than 1.7 × its font size, or more than one line); every visible button's words fit
//      (scrollWidth ≤ clientWidth); nothing paints outside the bar; no "undefined" / "null" / "NaN" / "[object" in the
//      bar or the title; and THE FOLD: the page's verdict re-derived by the PURE barLayout from the page's own inputs,
//      the ⋯ shown exactly when something is folded, never folding when everything fits (an independent max-content
//      measurement), the ⋯ menu listing exactly the folded items with their live counts;
//   ② two profiles attached (the switcher strip + the backend chip) — the same census;
//   ③ the WINDOW menu: the chat window of a session that HAS a browser offers "Agent browser — live view" (the zh
//      words), one that never used one does not; the row opens the live view BOUND beside that window (the split pair
//      [chat, live]); again ⇒ still ONE live window (open-or-focus, never a second viewer); unbound + again ⇒ bound
//      again; a bound live pane's menu says Unsplit ONCE (its own Unbind retired — the audit's D7); the sidebar card
//      keeps its entry;
//   ④ the desktop-app strip (`.desktop-bar`, xterm on the machine's display rung) with no lease, an AGENT lease
//      (POST /api/agent/window/attach with the session's own token) and the user's takeover — the same census + the
//      strip's fold (the ⋯ kept for the xpra rung); SKIPs with evidence without a display backend;
//   ⑤ CONTROLS, on the real page: (a) the stylesheet swapped for an identical copy stays green (the swap is neutral);
//      (b) a PATCHED COPY of public/style.css without the bar rules (nowrap / no-shrink / the (0,2,0) width) —
//      written by scripts/mutant-copy.mjs's scratch dir, loaded in place of /style.css — brings the owner's picture
//      back and the census goes RED (vertical wrapping, overlaps); (c) the nowrap rule ALONE removed with the fold's
//      verdict undone (every item unfolded) ⇒ the labels wrap vertically, while (c') the same unfolded bar under the
//      REAL stylesheet wraps nothing (the nowrap rule is what holds a label on one line).
//   ⑥ THE SPLIT FLOOR (lane I verify r1): the live view opened BOUND by the window menu's act, the split divider DRAGGED
//      to its clamp (ratio 0.85 ⇒ the live pane at 0.15 of a 900 / 600 / 320 px host) at zh / ja / en × Watch / Take
//      over (ja on the light theme): the toggle and the ⋯ inside the bar, the bar never overflowing, the whole census, the pane never narrower
//      than the bar's published floor, the folded badge's sentence the ⋯'s first row and its colour the ⋯'s; CONTROL —
//      the floor removed at runtime ⇒ the toggle / the ⋯ outside the bar again (the verifier's red).
// Artifacts: one PNG + one JSON per state under /tmp/vibespace-live-ui-shots/run-<pid>-<time>/ (named in the log;
// the newest three runs are kept). SKIPs without chrome / dtach. Run: node scripts/test-browser-live-ui.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, scratchHome, freePort, ONBOARDED_SOURCE, vncEnv } from './scratch.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port for every server this suite boots (never the machine-global :7/5901 — test-architecture §57)
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const { WebSocket, WebSocketServer } = require('ws');
const L = await import('../src/lib/live-bar-layout.js');

let pass = 0, fail = 0, skipped = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 1600) : '')); } return !!c; };
const skip = (n) => { skipped++; console.log('  ⊘ SKIP ' + n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms, every = 100) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await pred(); if (v) return v; } catch { } await sleep(every); } try { return await pred(); } catch { return null; } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FIX = JSON.parse(fs.readFileSync(path.join(repo, 'scripts/fixtures/browser-stream/session-0.32.0.json'), 'utf8'));
const FRAME = FIX.server_to_client.frame;
const zhDict = (await import('../src/lib/i18n-zh.js')).default;
const jaDict = (await import('../src/lib/i18n-ja.js')).default;
const tr = (lang, k) => (lang === 'zh' ? zhDict[k] : lang === 'ja' ? jaDict[k] : null) || k;
const ROOT = scratch('live-ui');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const MUT = mutantCopies('live-ui', repo);
// THE ARTIFACTS: per run, outside the scratch root (the reaper's /tmp/vs-* shape) so they outlive the run; the newest three kept
const SHOTS_ROOT = path.join(os.tmpdir(), 'vibespace-live-ui-shots');
const SHOTS = path.join(SHOTS_ROOT, `run-${process.pid}-${Date.now()}`);
fs.mkdirSync(SHOTS, { recursive: true });
try { const runs = fs.readdirSync(SHOTS_ROOT).filter((d) => /^run-\d+-\d+$/.test(d)).sort((a, b) => Number(b.split('-')[2]) - Number(a.split('-')[2])); for (const d of runs.slice(3)) fs.rmSync(path.join(SHOTS_ROOT, d), { recursive: true, force: true }); } catch { }
console.log(`artifacts: ${SHOTS}`);

const procs = new Set();
const worktrees = new Set();
let fakeHome = null, wtData = null;
function cleanup() {
  for (const p of procs) { try { p.kill('SIGKILL'); } catch { } }
  // the dtach session (wrapper + fake CLI) outlives a server kill BY DESIGN — end every process that names this run
  for (const d of (() => { try { return fs.readdirSync('/proc'); } catch { return []; } })().filter((x) => /^\d+$/.test(x) && Number(x) !== process.pid)) {
    let s = ''; try { s = fs.readFileSync(`/proc/${d}/cmdline`, 'utf8') + '\0' + fs.readFileSync(`/proc/${d}/environ`, 'utf8'); } catch { continue; }
    if ((wtData && s.includes(wtData + '/')) || s.includes(ROOT) || (fakeHome && s.includes(fakeHome))) { try { process.kill(Number(d), 'SIGKILL'); } catch { } }
  }
  for (const wt of worktrees) { try { execFileSync('git', ['-C', repo, 'worktree', 'remove', '--force', wt], { stdio: 'ignore' }); } catch { } }
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { }
  if (fakeHome) { try { fs.rmSync(fakeHome, { recursive: true, force: true }); } catch { } }
}
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(1); });

/** The fake upstream stream server (the real 0.32.0 shapes), its tab count controllable. */
const URL0 = 'https://www.larksuite.com/en_sg/';
async function fakeUpstream({ fps = 2 } = {}) {
  const port = await freePort();
  const clients = new Set();
  const wss = new WebSocketServer({ port, host: '127.0.0.1' });
  await new Promise((r) => wss.on('listening', r));
  const state = { tabs: 1 };
  const tabsMsg = () => JSON.stringify({ type: 'tabs', timestamp: Date.now(), tabs: Array.from({ length: state.tabs }, (_, i) => ({ tabId: 't' + (i + 1), title: i === 0 ? 'Lark | 飞书 — Sign in' : `Tab ${i + 1} — docs.example.com/a/very/long/path/${i}`, url: i === 0 ? URL0 : `https://docs.example.com/a/very/long/path/${i}`, active: i === 0, type: 'page', label: null })) });
  const frameMsg = () => JSON.stringify({ ...FRAME, metadata: { ...FRAME.metadata, timestamp: Date.now() } });
  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.send(JSON.stringify(FIX.server_to_client.status)); ws.send(tabsMsg());
    ws.send(JSON.stringify({ type: 'url', url: URL0, timestamp: Date.now() }));
    ws.on('close', () => clients.delete(ws));
  });
  const timer = setInterval(() => { for (const c of clients) if (c.readyState === 1) c.send(frameMsg()); }, 1000 / fps);
  return { port, clients, setTabs(n) { state.tabs = n; for (const c of clients) if (c.readyState === 1) c.send(tabsMsg()); }, close() { clearInterval(timer); for (const c of clients) { try { c.terminate(); } catch { } } return new Promise((r) => wss.close(() => r())); } };
}

// ── THE MEASURER (runs in the page): every rendered child of a bar — its box, its TEXT's paint extent, the flags ──
function MEASURE(bar, { moreSel = null, keepMore = false } = {}) {
  if (!bar) return { missing: true };
  const R = (b) => ({ x: Math.round(b.x * 10) / 10, y: Math.round(b.y * 10) / 10, w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10, r: Math.round((b.x + b.width) * 10) / 10, b: Math.round((b.y + b.height) * 10) / 10 });
  const br = bar.getBoundingClientRect();
  const bcs = getComputedStyle(bar);
  const name = (el) => (typeof el.className === 'string' && el.className ? el.className.trim().split(/\s+/).filter((c) => c !== 'file-tool-btn' && c !== 'bar-icon-btn').join('.') : el.tagName.toLowerCase());
  const items = [];
  for (const el of bar.children) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const b = el.getBoundingClientRect();
    if (!b.width && !b.height) continue;
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    let tx = null, lines = 0;
    if (text) {
      const range = document.createRange(); range.selectNodeContents(el);
      const rects = [...range.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5);
      if (rects.length) {
        const u = rects.reduce((a, r) => ({ l: Math.min(a.l, r.left), t: Math.min(a.t, r.top), r: Math.max(a.r, r.right), b: Math.max(a.b, r.bottom) }), { l: 1e9, t: 1e9, r: -1e9, b: -1e9 });
        tx = { x: u.l, y: u.t, width: u.r - u.l, height: u.b - u.t };
        lines = new Set(rects.map((r) => Math.round((r.top + r.bottom) / 2 / 6))).size;
      }
    }
    const clipped = cs.overflow !== 'visible' || cs.overflowX !== 'visible';
    const box = R(b);
    const txt = tx ? R(tx) : null;
    const paint = txt && !clipped ? { x: Math.min(box.x, txt.x), y: Math.min(box.y, txt.y), r: Math.max(box.r, txt.r), b: Math.max(box.b, txt.b) } : { x: box.x, y: box.y, r: box.r, b: box.b };
    const fs = parseFloat(cs.fontSize) || 11;
    const isButton = el.tagName === 'BUTTON';
    items.push({
      el: name(el), tag: el.tagName.toLowerCase(), text: text.slice(0, 140), box, textRect: txt, lines, fs, paint,
      scroll: { sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight },
      flags: {
        wraps: !!txt && (lines > 1 || txt.h > 1.7 * fs),
        cut: isButton && !!text && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1),
        textEscapes: !!txt && !clipped && (txt.x < box.x - 0.5 || txt.r > box.r + 0.5),
        outside: paint.x < br.left - 0.5 || paint.r > br.right + 0.5 || paint.y < br.top - 0.5 || paint.b > br.bottom + 0.5,
        badText: /\bundefined\b|\bnull\b|\bNaN\b|\[object/.test(text),
      },
    });
  }
  const overlaps = [];
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i].paint, c = items[j].paint;
    const w = Math.min(a.r, c.r) - Math.max(a.x, c.x), h = Math.min(a.b, c.b) - Math.max(a.y, c.y);
    if (w > 0.5 && h > 0.5) overlaps.push({ a: items[i].el, b: items[j].el, w: Math.round(w * 10) / 10, h: Math.round(h * 10) / 10 });
  }
  // an INDEPENDENT natural width: a max-content clone with every present item unfolded (the flexible one at its CSS minimum)
  const clone = bar.cloneNode(true);
  clone.style.cssText += ';position:absolute;left:-99999px;top:0;width:max-content;visibility:hidden';
  bar.parentElement.appendChild(clone);
  let natural = 0, n = 0;
  const gap = parseFloat(bcs.columnGap) || 0;
  for (const el of [...clone.children]) {
    if (el.style.display === 'none' || (moreSel && !keepMore && el.matches(moreSel))) { el.remove(); continue; } // a ⋯ shown ANYWAY (keepMore: the xpra strip's own menu) is part of the natural width
    el.classList.remove('bar-folded');
  }
  for (const el of clone.children) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none') continue;
    if (parseFloat(cs.flexGrow) > 0) { el.style.flex = '0 0 auto'; el.style.width = cs.minWidth; }
    natural += el.getBoundingClientRect().width; n++;
  }
  clone.remove();
  natural += gap * Math.max(0, n - 1);
  const contentW = bar.clientWidth - (parseFloat(bcs.paddingLeft) || 0) - (parseFloat(bcs.paddingRight) || 0);
  const more = moreSel ? bar.querySelector(moreSel) : null;
  return { bar: R(br), contentW, natural: Math.round(natural * 10) / 10, nPresent: n, moreShown: !!more && getComputedStyle(more).display !== 'none', items, overlaps };
}
/** The node-side verdict over one measurement: every problem, named. */
function problemsOf(m) {
  if (!m || m.missing) return ['the bar is missing'];
  const out = [];
  for (const o of m.overlaps) out.push(`overlap ${o.a} × ${o.b} (${o.w}×${o.h})`);
  for (const it of m.items) {
    if (it.flags.wraps) out.push(`wrap ${it.el} "${it.text}" (${it.lines} line(s), text ${it.textRect.h}px at ${it.fs}px)`);
    if (it.flags.cut) out.push(`cut ${it.el} "${it.text}" (scroll ${it.scroll.sw}×${it.scroll.sh} > client ${it.scroll.cw}×${it.scroll.ch})`);
    if (it.flags.textEscapes) out.push(`text escapes ${it.el} "${it.text}"`);
    if (it.flags.outside) out.push(`outside the bar ${it.el}`);
    if (it.flags.badText) out.push(`bad text ${it.el} "${it.text}"`);
  }
  return out;
}
/** The fold's own judgement: the page's verdict = barLayout on the page's own inputs; the ⋯ ⇔ something folded (or `moreAlways`); no fold when all fits. */
function foldProblems(m, v, { moreAlways = false } = {}) {
  if (!v) return ['no fold verdict published'];
  const out = [];
  const re = L.barLayout({ widthPx: v.widthPx, gapPx: v.gapPx, overflowPx: v.overflowPx, items: v.items });
  if (!same(re.shown, v.shown) || !same(re.overflow, v.overflow)) out.push(`the page's verdict ≠ barLayout(its inputs): ${JSON.stringify({ page: [v.shown, v.overflow], pure: [re.shown, re.overflow] })}`);
  const wantMore = v.overflow.length > 0 || moreAlways;
  if (m.moreShown !== wantMore) out.push(`the ⋯ is ${m.moreShown ? 'shown' : 'hidden'} with ${v.overflow.length} folded (moreAlways ${moreAlways})`);
  // independent: folding is never gratuitous (the rounding slack the product adds: ≤ 1.5 px per item)
  if (v.overflow.length && m.natural <= m.contentW - (1.5 * m.nPresent + 2)) out.push(`folded ${v.overflow.join(',')} although everything fits (natural ${m.natural} ≤ content ${m.contentW})`);
  if (!v.overflow.length && m.natural > m.contentW + 1) out.push(`nothing folded although the natural width ${m.natural} exceeds ${m.contentW}`);
  return out;
}

const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
let dtachOk = false; try { execFileSync('/usr/bin/which', ['dtach'], { stdio: 'ignore' }); dtachOk = true; } catch { }
if (!CHROME) skip('no chrome/chromium on this box — every leg needs one');
else if (!dtachOk) skip('dtach is not installed — a local session cannot be created here');
else await (async () => {
  // ── fakes on PATH: a fake claude (a live chat session) and a fake agent-browser whose `stream status` names a fake upstream ──
  const BIN = path.join(ROOT, 'bin'); fs.mkdirSync(BIN, { recursive: true });
  const AB_STATE = path.join(ROOT, 'ab-state'); fs.mkdirSync(AB_STATE, { recursive: true });
  const SID = crypto.randomUUID();
  const hookLine = JSON.stringify({ type: 'system', subtype: 'hook_started', session_id: SID, hook_name: 'SessionStart' });
  const initLine = JSON.stringify({ type: 'system', subtype: 'init', session_id: SID, cwd: ROOT, model: 'claude-fable-5', apiKeySource: 'none', tools: [], mcp_servers: [] });
  fs.writeFileSync(path.join(BIN, 'claude'), `#!/bin/sh\ncase " $* " in *" --output-format "*) sleep 1; printf '%s\\n%s\\n' '${hookLine}' '${initLine}';; esac\nexec sleep 1800\n`, { mode: 0o755 });
  fs.writeFileSync(path.join(BIN, 'agent-browser'), `#!${process.execPath}
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const st = process.env.FAKE_AB_STATE; const ns = process.env.AGENT_BROWSER_NAMESPACE || 'default';
const f = path.join(st, ns + '.json');
const read = () => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const out = (o) => { process.stdout.write(JSON.stringify(o) + '\\n'); };
const argv = process.argv.slice(2).filter((x) => x !== '--pin-tab');
const [a, b] = argv;
let ports = {}; try { ports = JSON.parse(fs.readFileSync(path.join(st, 'ports.json'), 'utf8')); } catch {}
if (a === '--version') { console.log('agent-browser 0.38.0'); process.exit(0); }
if (a === 'session' && b === 'info') { const s = read(); const act = !!(s && alive(s.pid)); out({ success: true, data: { active: act, namespace: ns, pid: act ? s.pid : null, session: process.env.AGENT_BROWSER_SESSION || null, socketDir: path.join(st, ns, 'run'), version: act ? '0.38.0' : null } }); process.exit(0); }
if (a === 'open') { let s = read(); if (!(s && alive(s.pid))) { const c = spawn('sleep', ['1800'], { detached: true, stdio: 'ignore' }); c.unref(); s = { pid: c.pid }; fs.writeFileSync(f, JSON.stringify(s)); fs.appendFileSync(path.join(st, 'pids'), c.pid + '\\n'); } out({ success: true, data: { url: b } }); process.exit(0); }
if (a === 'get' && b === 'cdp-url') { out({ success: true, data: { cdpUrl: 'ws://127.0.0.1:19222/devtools/browser/fake-' + ns } }); process.exit(0); }
if (a === 'stream' && b === 'status') { const port = ports[ns] || ports['*'] || null; if (!port) { out({ success: false, data: null, error: 'fake: no stream for ' + ns }); process.exit(1); } out({ success: true, data: { connected: true, enabled: true, port, screencasting: false } }); process.exit(0); }
if (a === 'stream' && b === 'enable') { out({ success: false, data: null, error: 'Streaming is already enabled for this session' }); process.exit(1); }
if (a === 'close' && b === '--all') { const s = read(); if (s && alive(s.pid)) { try { process.kill(s.pid, 'SIGKILL'); } catch { } } try { fs.unlinkSync(f); } catch { } out({ success: true, data: { closed: 1, failed: [], sessions: [] } }); process.exit(0); }
out({ success: false, error: 'fake agent-browser: unknown verb ' + process.argv.slice(2).join(' ') }); process.exit(1);
`, { mode: 0o755 });
  const rememberPids = () => { try { for (const l of fs.readFileSync(path.join(AB_STATE, 'pids'), 'utf8').trim().split('\n')) { const pid = Number(l); if (pid) procs.add({ kill: () => process.kill(pid, 'SIGKILL') }); } } catch { } };
  const upE = await fakeUpstream(), upW = await fakeUpstream(), upP = await fakeUpstream();
  procs.add({ kill: () => { upE.close(); upW.close(); upP.close(); } });
  fs.writeFileSync(path.join(AB_STATE, 'ports.json'), JSON.stringify({ '*': upE.port }));

  // ── a throwaway worktree server (never the checkout's data/) ──
  fakeHome = scratchHome('live-ui-home', fs);
  const wt = path.join(ROOT, 'wt');
  execFileSync('git', ['-C', repo, 'worktree', 'add', '--detach', wt, 'HEAD'], { stdio: 'ignore' }); worktrees.add(wt);
  for (const f of ['src', 'public', 'server.js', 'package.json']) { execFileSync('rm', ['-rf', path.join(wt, f)]); execFileSync('cp', ['-r', path.join(repo, f), path.join(wt, f)]); }
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
  wtData = path.join(wt, 'data');
  const PORT = await freePort(), CDP = await freePort();
  const baseEnv = { ...process.env, PATH: BIN + ':' + (process.env.PATH || ''), CLAUDE_CMD: path.join(BIN, 'claude'), FAKE_AB_STATE: AB_STATE };
  for (const k of Object.keys(baseEnv)) if (k.startsWith('AGENT_BROWSER_')) delete baseEnv[k];
  let journal = '';
  const srv = spawn('node', ['server.js'], { cwd: wt, env: { ...baseEnv, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  procs.add(srv);
  srv.stdout.on('data', (d) => { journal += d; }); srv.stderr.on('data', (d) => { journal += d; });
  if (!ok(await until(() => journal.includes('Ready.'), 60000, 200), 'the worktree server booted', journal.slice(-800))) return;
  const j = async (method, p, body, headers = {}) => { const res = await fetch(`http://127.0.0.1:${PORT}${p}`, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined }); let json = null; try { json = await res.json(); } catch { } return { status: res.status, json }; };
  await j('PATCH', '/api/settings', { 'browser.autoBindLiveView': false }); // the suite binds / unbinds by hand

  // ── two live chat sessions: one named like the owner's (it WILL browse), one that never browses ──
  const SESSION_NAME = 'VibeSpace 主开发';
  const wsMain = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  const msgs = []; wsMain.on('message', (d) => { try { msgs.push(JSON.parse(d)); } catch { } });
  await new Promise((r, e) => { wsMain.on('open', r); wsMain.on('error', e); });
  procs.add({ kill: () => { try { wsMain.close(); } catch { } } });
  const create = async (reqId, sessionName) => { wsMain.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: ROOT, cols: 80, rows: 24, reqId, sessionName })); return until(() => msgs.find((m) => m.type === 'created' && m.reqId === reqId), 20000); };
  const c1 = await create('r1', SESSION_NAME), c2 = await create('r2', 'no-browser');
  if (!ok(c1 && c1.sessionId && c2 && c2.sessionId, 'two chat sessions were created (one will browse, one never does)', journal.slice(-600))) return;
  const S1 = c1.sessionId, S2 = c2.sessionId;
  await sleep(1500);
  // THE OWNER'S PATH: the agent starts its browser with `vibespace-browser open <url>` from inside the session —
  // the SHIPPED CLI under the session's own environment (read from the fake CLI's /proc environ)
  const sessionEnvOf = (sid) => {
    for (const pid of fs.readdirSync('/proc').filter((d) => /^\d+$/.test(d))) {
      let env = ''; try { env = fs.readFileSync(`/proc/${pid}/environ`, 'utf8'); } catch { continue; }
      if (!env.includes('CLAUDE_WEBUI_SESSION_ID=' + sid) || !env.includes('VIBESPACE_SESSION_TOKEN=')) continue;
      return Object.fromEntries(env.split('\0').filter(Boolean).map((kv) => [kv.slice(0, kv.indexOf('=')), kv.slice(kv.indexOf('=') + 1)]));
    }
    return null;
  };
  const env1 = await until(() => sessionEnvOf(S1), 10000, 250);
  if (!ok(!!env1, "the browsing session's own environment (its token, its browser key) is readable from its process")) return;
  const opened = await new Promise((res) => { const c = spawn(process.execPath, [path.join(wt, 'data/bin/vibespace-browser'), 'open', URL0], { env: { ...env1, FAKE_AB_STATE: AB_STATE }, stdio: ['ignore', 'pipe', 'pipe'] }); let o = ''; c.stdout.on('data', (d) => { o += d; }); c.stderr.on('data', (d) => { o += d; }); const t = setTimeout(() => { try { c.kill('SIGKILL'); } catch { } }, 30000); c.on('close', (code) => { clearTimeout(t); res({ code, o }); }); });
  rememberPids();
  ok(opened.code === 0, `the agent's \`vibespace-browser open ${URL0}\` succeeded (the ephemeral browser — the owner's picture)`, opened.o.slice(0, 400));
  const token = env1.VIBESPACE_SESSION_TOKEN;

  // ── headless chrome, ONE page (3200×1100 CSS px: a bound 1400 px pane fits beside its chat) ──
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--force-device-scale-factor=1', '--disable-background-timer-throttling', `--user-data-dir=${path.join(ROOT, 'chrome')}`, '--window-size=3200,1100', 'about:blank'], { stdio: 'ignore' });
  procs.add(chrome);
  let target = null;
  for (let i = 0; i < 120 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find((t) => t.type === 'page'); } catch { } if (!target) await sleep(250); }
  if (!ok(!!target, 'chrome exposed a CDP page target')) return;
  const cdp = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
  await new Promise((r) => cdp.on('open', r));
  procs.add({ kill: () => { try { cdp.close(); } catch { } } });
  let seq = 0; const pend = new Map();
  cdp.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); cdp.send(JSON.stringify({ id, method, params })); });
  const evaluate = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error((r.result.exceptionDetails.exception?.description || 'eval threw').slice(0, 600)); return r.result?.result?.value; };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); // §47: the first-run wizard would cover the chrome on an empty runner
  const VW = 3200, VH = 1100;
  await send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });

  async function load(lang, theme) {
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/api/home` }); await sleep(250);
    await evaluate(`(() => { localStorage.setItem('vibespace.lang', ${JSON.stringify(lang)}); localStorage.setItem('theme', ${JSON.stringify(theme)}); localStorage.setItem('vs-onboarded', '1'); return 1; })()`);
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
    const up = await until(() => evaluate('(async () => { if (!window.app || !window.app.ready) return false; return await Promise.race([window.app.ready.then(() => true), new Promise((r) => setTimeout(() => r(false), 150))]); })()'), 40000, 250);
    if (!up) throw new Error('the app did not boot');
    await until(() => evaluate(`(() => { const s = document.getElementById('loading-screen'); return !s || getComputedStyle(s).display === 'none' || getComputedStyle(s).opacity === '0'; })()`), 10000);
    await evaluate('window.app.refreshBrowserProfiles && window.app.refreshBrowserProfiles()');
    await until(() => evaluate(`!!(window.app.sidebar._allSessions || []).find((s) => s.webuiId === ${JSON.stringify(S1)})`), 15000);
    await evaluate(`(() => { for (const id of [...window.app.wm.windows.keys()]) { try { window.app.wm.closeWindow(id); } catch {} } document.querySelectorAll('.context-menu,.taskbar-context-menu').forEach((m) => m.remove()); return 1; })()`);
    await sleep(250);
  }
  const setTheme = (theme) => evaluate(`(() => { window.app.themeManager.apply(${JSON.stringify(theme)}); return document.documentElement.getAttribute('data-theme'); })()`);
  const frames = () => evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 60))))');
  async function shot(file, clip) {
    const params = { format: 'png', captureBeyondViewport: false };
    if (clip) params.clip = { x: Math.max(0, clip.x), y: Math.max(0, clip.y), width: Math.max(1, Math.min(clip.width, VW - Math.max(0, clip.x))), height: Math.max(1, clip.height), scale: 1 };
    const r = await send('Page.captureScreenshot', params);
    if (r.result && r.result.data) fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
  }
  const tally = { live: { n: 0, bad: [] }, profile: { n: 0, bad: [] }, desktop: { n: 0, bad: [] }, floor: { n: 0, bad: [] }, fold: { n: 0, bad: [] }, folded: 0, unfolded: 0 };
  /** One state: measure, shoot, judge. `fold()` = the page's published verdict (null = no fold judgement). */
  async function record(section, name, barExpr, clipExpr, { moreSel, fold = null, moreAlways = false, extraBad = [] } = {}) {
    await frames();
    const m = await evaluate(`(${MEASURE.toString()})(${barExpr}, ${JSON.stringify({ moreSel, keepMore: moreAlways })})`);
    const clip = await evaluate(`(() => { const el = ${clipExpr}; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; })()`);
    if (clip) await shot(path.join(SHOTS, name + '.png'), clip);
    const v = fold ? await evaluate(fold) : null;
    fs.writeFileSync(path.join(SHOTS, name + '.json'), JSON.stringify({ name, measure: m, fold: v }, null, 1));
    const probs = [...problemsOf(m), ...extraBad];
    tally[section].n++;
    if (probs.length) tally[section].bad.push(`${name}: ${probs.slice(0, 4).join('; ')}`);
    if (fold) {
      tally.fold.n++;
      const fp = foldProblems(m, v, { moreAlways });
      if (fp.length) tally.fold.bad.push(`${name}: ${fp.join('; ')}`);
      if (v && v.overflow.length) tally.folded++; else tally.unfolded++;
    }
    return { m, v, probs };
  }

  // ── placement ──
  const LIVE = `[...window.app.wm.windows.values()].find((w) => w.type === 'browser-live')`;
  const chatOf = (sid) => `[...window.app.wm.windows.values()].find((w) => w.type === 'chat' && window.app.sessions.get(w.id) && window.app.sessions.get(w.id).sessionId === ${JSON.stringify(sid)})`;
  const CHAT = chatOf(S1);
  async function placeFree(W) {
    await evaluate(`(() => { const w = ${LIVE}; w.gridBounds = null; if (w.isMaximized) window.app.wm.toggleMaximize(w.id); const e = w.element; e.style.left = '20px'; e.style.top = '20px'; e.style.width = '${W}px'; e.style.height = '560px'; window.app.wm.focusWindow(w.id); if (w.onResize) w.onResize(); return true; })()`);
    await frames();
  }
  async function placeBound(W) {
    let hostW = 2 * W + 8;
    for (let i = 0; i < 4; i++) {
      await evaluate(`(() => { const c = ${CHAT}; const host = window.app.wm.windows.get(c._tabChain.tabs[0]); host.gridBounds = null; const e = host.element; e.style.left = '20px'; e.style.top = '20px'; e.style.width = '${hostW}px'; e.style.height = '560px'; for (const id of c._tabChain.tabs) { const x = window.app.wm.windows.get(id); if (x && x.onResize) x.onResize(); } return true; })()`);
      await frames();
      const pw = await evaluate(`(${LIVE})._browserLive.el().getBoundingClientRect().width`);
      if (Math.abs(pw - W) < 1.5) return;
      hostW = Math.round(hostW + (W - pw) * 2);
    }
  }
  const openChat = async (sid, name) => {
    await evaluate(`window.app.attachSession(${JSON.stringify(sid)}, ${JSON.stringify(name)}, ${JSON.stringify(ROOT)}, { mode: 'chat', backend: 'claude' })`);
    return until(() => evaluate(`!!(${chatOf(sid)})`), 15000);
  };
  const liveUp = () => until(() => evaluate(`(() => { const w = ${LIVE}; const Lv = w && w._browserLive; return !!(Lv && Lv.state().frames >= 1 && Lv.state().tabs.length >= 1); })()`), 20000);
  const setBound = async (want) => {
    const is = await evaluate(`(${LIVE})._browserLive.isBound()`);
    if (is !== want) await evaluate(`(${LIVE})._browserLive.toggleBind()`);
    await sleep(200);
    if (!want) await evaluate(`(() => { const l = ${LIVE}; if (l._tabChain) window.app.wm._detachFromChain(l._tabChain, l.id); return !l._tabChain; })()`);
    await sleep(150);
    return evaluate(`(${LIVE})._browserLive.isBound()`);
  };
  // the ONE mode toggle, clicked like a user: Take over while the agent drives, Hand back while a human does
  const setMode = async (mode) => {
    const s = await evaluate(`(() => { const s = (${LIVE})._browserLive.state(); return { mode: s.mode, mine: s.mine }; })()`);
    if (mode === 'takeover' && !(s.mode === 'takeover' && s.mine)) await evaluate(`(${LIVE})._browserLive.el().querySelector('.browser-live-mode-btn').click()`);
    if (mode === 'watch' && s.mode === 'takeover') await evaluate(`(${LIVE})._browserLive.el().querySelector('.browser-live-handback').click()`);
    return until(() => evaluate(`(() => { const s = (${LIVE})._browserLive.state(); return ${mode === 'takeover' ? "s.mode === 'takeover' && s.mine" : "s.mode === 'watch'"}; })()`), 8000);
  };
  const setTabs = async (up, n) => { up.setTabs(n); return until(() => evaluate(`(${LIVE})._browserLive.state().tabs.length === ${n}`), 5000); };
  const liveBar = `(${LIVE})._browserLive.el().querySelector('.browser-live-bar')`;
  const liveFold = `(() => { const Lv = (${LIVE})._browserLive; Lv.layoutBar(); return Lv.state().bar; })()`;
  const liveClip = `(() => { const w = ${LIVE}; const Lv = w._browserLive; const bar = Lv.el().querySelector('.browser-live-bar'); const host = w._tabChain ? window.app.wm.windows.get(w._tabChain.tabs[0]) : w; const hr = host.element.getBoundingClientRect(); const pr = Lv.el().getBoundingClientRect(); const br = bar.getBoundingClientRect(); const split = w._tabChain && w._tabChain.layout === 'split'; const left = split ? pr.left : hr.left; const right = split ? pr.right : hr.right; return { getBoundingClientRect: () => ({ left, top: hr.top, width: right - left, height: br.bottom + 60 - hr.top }) }; })()`;
  const titleBad = async () => { const tt = await evaluate(`(() => { const w = ${LIVE}; const host = w._tabChain ? window.app.wm.windows.get(w._tabChain.tabs[0]) : w; return (host.titleBar.textContent || '') + ' | ' + (w.title || ''); })()`); return /\bundefined\b|\bnull\b|\bNaN\b|\[object/.test(tt) ? [`bad text in the title "${tt}"`] : []; };

  const LANGS = ['zh', 'ja', 'en'], THEMES = ['dark', 'light'], WIDTHS = [600, 900, 1400];
  // ── the CONTROLS' patched copies of public/style.css (scripts/mutant-copy.mjs's scratch dir — never the tree) ──
  const real = fs.readFileSync(path.join(repo, 'public/style.css'), 'utf8');
  const RULES = ['.browser-live-bar > * { flex: 0 0 auto; white-space: nowrap; }', '.browser-live-bar > .file-tool-btn { width: auto; height: 22px; padding: 0 8px; font-size: 10px; }', '.browser-live-bar > .file-tool-btn.bar-icon-btn { padding: 0 5px; font-size: 13px; }'];
  const DRULES = ['.desktop-bar > * { flex: 0 0 auto; white-space: nowrap; }', '.desktop-bar > .file-tool-btn { width: auto; height: 22px; padding: 0 8px; font-size: 10px; }'];
  ok(RULES.every((r) => real.includes(r)) && DRULES.every((r) => real.includes(r)), 'the bar rules the controls remove are in public/style.css verbatim (the anchors exist)');
  const writeCss = (tag, text) => { const f = path.join(MUT.dir, `style-${tag}-${process.pid}.css`); fs.writeFileSync(f, text); MUT.files.push(f); return f; };
  const fNeutral = writeCss('neutral', real), fPre = writeCss('prefix', RULES.reduce((x, r) => x.replace(r, ''), real)), fNo = writeCss('nowrap', real.replace(RULES[0], '')), fDeskPre = writeCss('desk-prefix', DRULES.reduce((x, r) => x.replace(r, ''), real));
  /** Loads a patched copy IN PLACE of /style.css (same cascade position: viewers.css still after it). */
  const swap = (file) => evaluate(`(() => { const old = document.getElementById('vs-live-ui-css') || document.querySelector('link[rel=stylesheet][href*="/style.css"]'); if (!old) return false; const st = document.createElement('style'); st.id = 'vs-live-ui-css'; st.textContent = ${JSON.stringify(fs.readFileSync(file, 'utf8'))}; old.replaceWith(st); return true; })()`);
  try {
    // ═══ ① the live view — the ephemeral browser ═══
    console.log('— ① the live view (the ephemeral browser): zh / ja / en × 600 / 900 / 1400 × dark / light × free / bound × Watch / Take over');
    let menuChecked = false;
    for (const lang of LANGS) {
      await load(lang, 'dark');
      if (!ok(await openChat(S1, SESSION_NAME), `${lang}: the browsing session's chat window is open`)) continue;
      await evaluate(`window.app.openBrowserLive({ sessionId: ${JSON.stringify(S1)} })`);
      if (!ok(await liveUp(), `${lang}: the live view drew a frame of the ephemeral browser`, journal.slice(-600))) continue;
      for (const theme of THEMES) {
        await setTheme(theme);
        for (const bound of [false, true]) {
          if ((await setBound(bound)) !== bound) { ok(false, `${lang} ${theme}: the live view could be ${bound ? 'bound beside' : 'freed from'} its chat`); continue; }
          for (const mode of ['watch', 'takeover']) {
            if (!await setMode(mode)) { ok(false, `${lang} ${theme}: ${mode} was reached through the bar's one toggle`); continue; }
            await setTabs(upE, mode === 'takeover' ? 3 : 1);
            for (const W of WIDTHS) {
              if (bound) await placeBound(W); else await placeFree(W);
              const name = `live-${lang}-${theme}-${bound ? 'bound' : 'free'}-${mode}-w${W}`;
              const r = await record('live', name, liveBar, liveClip, { moreSel: '.browser-live-more', fold: liveFold, extraBad: await titleBad() });
              // the ⋯ MENU at the narrowest state of each language: exactly the folded items, the pane rows with their live counts
              if (!menuChecked || (W === 600 && theme === 'dark' && !bound)) {
                if (r.v && r.v.overflow.length) {
                  await evaluate(`(${LIVE})._browserLive.el().querySelector('.browser-live-more').click()`);
                  await sleep(150);
                  const rows = await evaluate(`[...document.querySelectorAll('.browser-live-more-menu > .context-menu-item')].map((e) => e.textContent)`);
                  const want = await evaluate(`(${LIVE})._browserLive.state().foldedRows.map((r) => r.label)`);
                  await evaluate(`document.querySelectorAll('.context-menu').forEach((m) => m.remove())`);
                  const tabsRow = r.v.overflow.includes('tabs') ? rows.find((x) => x.includes(`(${mode === 'takeover' ? 3 : 1})`)) : true;
                  ok(rows.length === want.length && rows.length >= 1 && same(rows, want) && !!tabsRow, `${name}: the ⋯ menu lists exactly the ${want.length} folded item(s) (${rows.join(' · ')}) — the pane rows with their live counts`, { rows, want, overflow: r.v.overflow });
                  menuChecked = true;
                }
              }
            }
          }
          await setMode('watch');
        }
        await setBound(false);
      }
      await setTabs(upE, 1);
      await evaluate(`(() => { for (const id of [...window.app.wm.windows.keys()]) { try { window.app.wm.closeWindow(id); } catch {} } return 1; })()`);
    }
    ok(tally.live.n === LANGS.length * THEMES.length * 2 * 2 * WIDTHS.length, `① ${tally.live.n} live-view states measured (3 languages × 2 themes × free/bound × Watch/Take over × 3 widths)`);
    ok(tally.live.bad.length === 0, `① every live-view state: no overlap, no wrapped label, every button's words fit, nothing outside the bar, no undefined/null/NaN/[object (${tally.live.bad.length} bad of ${tally.live.n})`, tally.live.bad.slice(0, 6).join('\n    '));
    ok(menuChecked, '① the ⋯ menu was opened on a folded bar (the check above ran)');

    // ═══ ② two profiles: the switcher strip + the backend chip ═══
    console.log('— ② two profiles attached: the strip and the backend chip');
    {
      const wr = await j('POST', '/api/browser/profiles', { label: 'Work' }), pr = await j('POST', '/api/browser/profiles', { label: 'Personal account' });
      const work = wr.json && wr.json.profile, pers = pr.json && pr.json.profile;
      if (ok(work && pers, 'two browser profiles created', JSON.stringify([wr, pr]).slice(0, 300))) {
        fs.writeFileSync(path.join(AB_STATE, 'ports.json'), JSON.stringify({ '*': upE.port, ['vs-' + work.id]: upW.port, ['vs-' + pers.id]: upP.port }));
        const a1 = await j('POST', '/api/browser/attach', { sessionId: S1, profile: 'Work' }), a2 = await j('POST', '/api/browser/attach', { sessionId: S1, profile: 'Personal account' });
        await j('POST', '/api/browser/pin', { sessionId: S1, profile: 'Work' });
        rememberPids();
        ok(a1.status === 200 && a2.status === 200, 'both attached to the browsing session');
        for (const lang of LANGS) {
          await load(lang, 'dark');
          await openChat(S1, SESSION_NAME);
          await evaluate(`window.app.openBrowserLive({ sessionId: ${JSON.stringify(S1)} })`);
          if (!ok(await liveUp(), `${lang}: the profile live view drew a frame`)) continue;
          await until(() => evaluate(`(${LIVE})._browserLive.el().querySelectorAll('.browser-live-strip-tab').length === 2`), 8000);
          for (const mode of ['watch', 'takeover']) {
            await setMode(mode);
            for (const W of WIDTHS) {
              await placeFree(W);
              await record('profile', `profile-${lang}-dark-free-${mode}-w${W}`, liveBar, liveClip, { moreSel: '.browser-live-more', fold: liveFold, extraBad: await titleBad() });
            }
          }
          await setMode('watch');
          await evaluate(`(() => { for (const id of [...window.app.wm.windows.keys()]) { try { window.app.wm.closeWindow(id); } catch {} } return 1; })()`);
        }
        ok(tally.profile.n === LANGS.length * 2 * WIDTHS.length && tally.profile.bad.length === 0, `② ${tally.profile.n} profile states (the backend chip shown): the same census holds (${tally.profile.bad.length} bad)`, tally.profile.bad.slice(0, 6).join('\n    '));
      }
    }
    ok(tally.fold.bad.length === 0 && tally.folded >= 10 && tally.unfolded >= 10, `①② THE FOLD, in every state: the page's verdict = barLayout(its own inputs), the ⋯ shown exactly when something is folded, never a gratuitous fold (${tally.folded} folded states, ${tally.unfolded} unfolded, ${tally.fold.bad.length} bad)`, tally.fold.bad.slice(0, 6).join('\n    '));

    // ═══ ③ the WINDOW menu ═══
    console.log('— ③ the chat WINDOW menu opens the live view (zh, the owner\'s locale)');
    {
      await load('zh', 'dark');
      await openChat(S1, SESSION_NAME); await openChat(S2, 'no-browser');
      const ROW = zhDict['Agent browser — live view'];
      const facts = await evaluate(`(() => { const r = (window.app.sidebar._allSessions || []).find((s) => s.webuiId === ${JSON.stringify(S1)}); return r ? { key: !!r.browserKey, active: r.browserProfileActive, input: r.browserInput } : null; })()`);
      const place = (sid, x) => evaluate(`(() => { const c = ${chatOf(sid)}; c.gridBounds = null; const e = c.element; e.style.left = '${x}px'; e.style.top = '20px'; e.style.width = '900px'; e.style.height = '520px'; window.app.wm.focusWindow(c.id); const r = c.titleBar.getBoundingClientRect(); return { x: r.left + 150, y: r.top + r.height / 2 }; })()`);
      const rightClick = async (pt) => { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y }); await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'right', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'right', clickCount: 1 }); await sleep(300); return evaluate(`(() => { const m = document.querySelector('.taskbar-context-menu'); return m ? [...m.children].map((e) => (e.textContent || '').trim()).filter(Boolean) : null; })()`); };
      const closeMenus = () => evaluate(`document.querySelectorAll('.context-menu,.taskbar-context-menu').forEach((m) => m.remove())`);
      const p1 = await place(S1, 40), m1 = await rightClick(p1);
      if (m1) await shot(path.join(SHOTS, 'menu-zh-chat-window-with-browser.png'), await evaluate(`(() => { const r = document.querySelector('.taskbar-context-menu').getBoundingClientRect(); return { x: r.left - 10, y: r.top - 10, width: r.width + 20, height: r.height + 20 }; })()`));
      ok(Array.isArray(m1) && m1.includes(ROW), `the chat window of a session that HAS a browser (${JSON.stringify(facts)}) offers "${ROW}" on its title-bar menu`, JSON.stringify(m1));
      await closeMenus();
      const p2 = await place(S2, 1000), m2 = await rightClick(p2);
      ok(Array.isArray(m2) && m2.length > 3 && !m2.includes(ROW), 'the chat window of a session that never used a browser does not', JSON.stringify(m2));
      await closeMenus();
      const liveCount = () => evaluate(`[...window.app.wm.windows.values()].filter((w) => w.type === 'browser-live').length`);
      const clickRow = async () => { const m = await rightClick(await place(S1, 40)); if (!m || !m.includes(ROW)) return false; await evaluate(`(() => { const el = [...document.querySelector('.taskbar-context-menu').children].find((e) => (e.textContent || '').trim() === ${JSON.stringify(ROW)}); el.click(); return true; })()`); await sleep(400); return true; };
      const pairState = () => evaluate(`(() => { const l = ${LIVE}; const c = ${CHAT}; if (!l || !c) return null; const ch = l._tabChain; return { bound: l._browserLive.isBound(), pair: ch && ch.split ? ch.split.pair : null, chat: c.id, live: l.id, frames: l._browserLive.state().frames }; })()`);
      ok(await liveCount() === 0 && await clickRow(), 'no live view open; the row is clicked');
      const b1 = await until(async () => { const s = await pairState(); return s && s.bound && s.frames >= 1 ? s : null; }, 15000);
      ok(!!b1 && same(b1.pair, [b1.chat, b1.live]), 'the row opens the live view BOUND beside the chat window (the split pair [chat, live]) and it draws', JSON.stringify(b1));
      if (b1) await shot(path.join(SHOTS, 'menu-zh-opened-bound.png'), await evaluate(`(() => { const c = ${CHAT}; const host = window.app.wm.windows.get(c._tabChain.tabs[0]); const r = host.element.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: Math.min(r.height, 200) }; })()`));
      await clickRow();
      ok(await liveCount() === 1 && (await pairState())?.bound, 'again ⇒ still ONE live window, still bound (open-or-focus — never a second viewer)');
      await evaluate(`(() => { const l = ${LIVE}; window.app.wm.unbindSplit(l._tabChain); window.app.wm._detachFromChain(l._tabChain, l.id); return true; })()`);
      await sleep(250);
      ok((await pairState())?.bound === false, 'the live view freed from the chat (a standalone window)');
      await clickRow();
      const b2 = await until(async () => { const s = await pairState(); return s && s.bound ? s : null; }, 5000);
      ok(!!b2 && same(b2.pair, [b2.chat, b2.live]) && await liveCount() === 1, 'the row on a chat whose live view is elsewhere binds THAT view beside it (never a second one)', JSON.stringify(b2));
      await evaluate(`document.querySelectorAll('.toast').forEach((t) => t.remove())`);
      // the bound live pane's own menu: ONE word for "back to tabs"
      const tab = await evaluate(`(() => { const c = ${CHAT}; const host = window.app.wm.windows.get(c._tabChain.tabs[0]); const t = host.titleBar.querySelector('.tab-item[data-win-id="' + (${LIVE}).id + '"]'); if (!t) return null; const r = t.getBoundingClientRect(); return { x: r.left + Math.min(40, r.width / 2), y: r.top + r.height / 2 }; })()`);
      const m3 = tab ? await rightClick(tab) : null;
      if (m3) await shot(path.join(SHOTS, 'menu-zh-live-tab-bound.png'), await evaluate(`(() => { const r = document.querySelector('.taskbar-context-menu').getBoundingClientRect(); return { x: r.left - 10, y: r.top - 10, width: r.width + 20, height: r.height + 20 }; })()`));
      const unbind = zhDict.Unbind, unsplit = zhDict.Unsplit;
      ok(Array.isArray(m3) && m3.filter((x) => x === unbind || x === unsplit).length === 1 && m3.includes(unsplit), `a BOUND live pane's menu says "${unsplit}" once (its own "${unbind}" retired — one word for one act)`, JSON.stringify(m3));
      await closeMenus();
      const card = await evaluate(`(() => { const c = [...document.querySelectorAll('.session-item-card')].find((x) => (x.textContent || '').includes(${JSON.stringify(SESSION_NAME)})); if (!c) return false; c.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 200 })); return true; })()`);
      await sleep(300);
      const m4 = card ? await evaluate(`(() => { const m = document.querySelector('.context-menu'); return m ? [...m.children].map((e) => (e.textContent || '').trim()).filter(Boolean) : null; })()`) : null;
      ok(Array.isArray(m4) && m4.includes(ROW), 'the sidebar card keeps its own entry', JSON.stringify(m4));
      await closeMenus();
    }

    // ═══ ④ the desktop-app strip ═══
    console.log('— ④ the desktop-app strip (.desktop-bar): no lease / an agent lease / your takeover');
    let deskDone = false;
    {
      const launched = await j('POST', '/api/desktop/apps', { exec: 'xterm', args: ['-geometry', '80x24', '-T', 'vs-live-ui'], label: 'xterm', dpr: 1, uiScale: 1 });
      const appId = launched.json && launched.json.id;
      const rec = appId ? await until(async () => { const r = await j('GET', `/api/desktop/apps/${appId}`); return r.json && (r.json.state === 'ready' || r.json.state === 'failed' || r.json.state === 'exited') ? r.json : null; }, 40000, 300) : null;
      if (!appId || !rec || rec.state !== 'ready') skip(`④ no desktop app could run here (launch ${launched.status} ${JSON.stringify(launched.json).slice(0, 240)}; record ${JSON.stringify(rec && { state: rec.state, why: rec.error || rec.fallbackWhy }).slice(0, 200)}) — the strip legs need a display rung (Xvfb + x11vnc, or xpra) and xterm`);
      else {
        procs.add({ kill: () => { try { execFileSync('curl', ['-s', '-m', '4', '-X', 'POST', `http://127.0.0.1:${PORT}/api/desktop/apps/${appId}/stop`], { timeout: 5000 }); } catch { } } });
        const DESK = `[...window.app.wm.windows.values()].find((w) => w.type === 'desktop-app')`;
        const deskBar = `(${DESK}).content.querySelector('.desktop-bar')`;
        const deskFold = `(() => { const w = ${DESK}; return w._desktopBarLayout || null; })()`;
        const deskClip = `(() => { const w = ${DESK}; const bar = w.content.querySelector('.desktop-bar'); const hr = w.element.getBoundingClientRect(); const br = bar.getBoundingClientRect(); return { getBoundingClientRect: () => ({ left: hr.left, top: hr.top, width: hr.width, height: br.bottom + 40 - hr.top }) }; })()`;
        const placeDesk = async (W) => { await evaluate(`(() => { const w = ${DESK}; w.gridBounds = null; const e = w.element; e.style.left = '20px'; e.style.top = '20px'; e.style.width = '${W}px'; e.style.height = '480px'; window.app.wm.focusWindow(w.id); if (w.onResize) w.onResize(); return true; })()`); await frames(); await sleep(150); };
        const xpra = rec.stream === 'xpra';
        // desktop lane E (D1, 2.369.181): a window is hidden from every agent until the user shares it — share it with the
        // browsing session so the agent-lease legs below can attach; a local app's ⋯ then carries Share with agent… /
        // Ask an agent… on EVERY rung, so it is always shown (bar-fold's moreAlways), not only on xpra
        const shared = await j('POST', `/api/desktop/apps/${appId}/reach`, { principal: { kind: 'session', id: S1 } });
        ok(shared.status === 200, `the user shares the app with the browsing session (POST …/reach ${shared.status})`, JSON.stringify(shared.json).slice(0, 300));
        const deskMoreAlways = xpra || !rec.hostId || rec.hostId === 'local';
        console.log(`  (the app runs on the ${rec.backend} rung, stream ${rec.stream})`);
        for (const lang of LANGS) {
          await load(lang, 'dark');
          await evaluate(`window.app.openDesktopApp(${JSON.stringify(appId)})`);
          await until(() => evaluate(`(() => { const w = ${DESK}; return !!(w && w.content.querySelector('.desktop-bar') && w._desktopAppView && w._desktopAppView.state === 'connected'); })()`), 20000);
          for (const theme of THEMES) {
            await setTheme(theme);
            for (const lease of ['none', 'agent', 'mine']) {
              if (lease === 'agent') {
                const r = await j('POST', '/api/agent/window/attach', { handle: appId }, { Authorization: 'Bearer ' + token });
                if (!(r.status === 200 || (r.json && r.json.code === 'window_leased'))) { ok(false, `${lang}: an agent lease on the app (attach ${r.status})`, JSON.stringify(r.json).slice(0, 300)); break; }
                await until(() => evaluate(`(() => { const b = (${DESK}).content.querySelector('.desktop-bar .browser-live-mode'); return !!b && getComputedStyle(b).display !== 'none'; })()`), 8000);
              }
              if (lease === 'mine') {
                await evaluate(`(${DESK}).content.querySelector('.desktop-bar .browser-live-mode-btn').click()`);
                if (!await until(() => evaluate(`(${DESK}).content.classList.contains('window-live-driving')`), 8000)) { ok(false, `${lang}: Take over on the strip`); continue; }
              }
              for (const W of WIDTHS) {
                await placeDesk(W);
                await record('desktop', `desktop-${lang}-${theme}-${lease}-w${W}`, deskBar, deskClip, { moreSel: '.desktop-app-more', fold: deskFold, moreAlways: deskMoreAlways });
              }
            }
            await evaluate(`(() => { const b = (${DESK}).content.querySelector('.desktop-bar .browser-live-handback'); if (b && getComputedStyle(b).display !== 'none') b.click(); return 1; })()`);
            await sleep(300);
            await j('POST', '/api/agent/window/detach', { handle: appId }, { Authorization: 'Bearer ' + token });
            await until(() => evaluate(`(() => { const b = (${DESK}).content.querySelector('.desktop-bar .browser-live-mode'); return !b || getComputedStyle(b).display === 'none'; })()`), 8000);
          }
          // ⑤(b) on the strip: a patched copy without its bar rules brings the 24 px Take over box back (zh, 900, an agent lease)
          if (lang === 'zh') {
            await j('POST', '/api/agent/window/attach', { handle: appId }, { Authorization: 'Bearer ' + token });
            await until(() => evaluate(`(() => { const b = (${DESK}).content.querySelector('.desktop-bar .browser-live-mode'); return !!b && getComputedStyle(b).display !== 'none'; })()`), 8000);
            await placeDesk(900); await swap(fDeskPre); await frames();
            const m = await evaluate(`(${MEASURE.toString()})(${deskBar}, { moreSel: '.desktop-app-more' })`);
            await shot(path.join(SHOTS, 'control-b-desk-prefix-zh-agent-w900.png'), await evaluate(`(() => { const el = ${deskClip}; const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; })()`));
            const wraps = m.items.filter((i) => i.flags.wraps).map((i) => i.el + ':' + i.text);
            ok(wraps.some((w) => /browser-live-mode-btn/.test(w)), `CONTROL (b) on the strip: a patched copy WITHOUT \`.desktop-bar\`'s rules — the Take over button is a 24 px box again and its words wrap (${wraps.join(', ')})`, problemsOf(m).slice(0, 4).join('; '));
            await j('POST', '/api/agent/window/detach', { handle: appId }, { Authorization: 'Bearer ' + token });
            deskDone = true;
          }
          await evaluate(`(() => { for (const id of [...window.app.wm.windows.keys()]) { try { window.app.wm.closeWindow(id); } catch {} } return 1; })()`);
        }
        ok(tally.desktop.n === LANGS.length * THEMES.length * 3 * WIDTHS.length, `④ ${tally.desktop.n} strip states measured (3 languages × 2 themes × no lease / agent / yours × 3 widths)`);
        ok(tally.desktop.bad.length === 0, `④ every strip state: no overlap, no wrapped label, every button's words fit, nothing outside the strip (${tally.desktop.bad.length} bad of ${tally.desktop.n})`, tally.desktop.bad.slice(0, 6).join('\n    '));
      }
    }
    ok(tally.fold.bad.length === 0, `①②④ THE FOLD across ${tally.fold.n} states: verdict = barLayout(inputs), the ⋯ exactly when folded (or the xpra rung's own menu), never gratuitous (${tally.fold.bad.length} bad)`, tally.fold.bad.slice(0, 6).join('\n    '));

    // ═══ ⑤ CONTROLS ═══
    console.log('— ⑤ controls: the census is a judge (a patched copy of public/style.css loaded in place of /style.css)');
    {
      const stage = async (mode, W) => {
        await load('zh', 'dark'); await openChat(S1, SESSION_NAME);
        await evaluate(`window.app.openBrowserLive({ sessionId: ${JSON.stringify(S1)} })`);
        await liveUp(); await setMode(mode); for (const up of [upW, upP]) up.setTabs(mode === 'takeover' ? 3 : 1); await setTabs(upE, mode === 'takeover' ? 3 : 1); await placeFree(W);
      };
      const census = async (name) => { await frames(); const m = await evaluate(`(${MEASURE.toString()})(${liveBar}, { moreSel: '.browser-live-more' })`); const clip = await evaluate(`(() => { const el = ${liveClip}; const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; })()`); await shot(path.join(SHOTS, name + '.png'), clip); fs.writeFileSync(path.join(SHOTS, name + '.json'), JSON.stringify(m, null, 1)); return { m, probs: problemsOf(m), wraps: m.items.filter((i) => i.flags.wraps).map((i) => i.el + ':' + i.text) }; };
      // (a) the neutral swap
      await stage('takeover', 600);
      const swapped = await swap(fNeutral);
      await evaluate(`(${LIVE})._browserLive.layoutBar()`);
      const a = await census('control-a-neutral-zh-takeover-w600');
      ok(swapped && a.probs.length === 0, 'CONTROL (a): the stylesheet swapped for an IDENTICAL copy — the census stays green (the swap itself is neutral)', a.probs.join('; '));
      // (b) the pre-fix bar rules: the owner's picture
      for (const [mode, W] of [['watch', 1400], ['takeover', 600]]) {
        await stage(mode, W); await swap(fPre); await evaluate(`(${LIVE})._browserLive.layoutBar()`);
        const b = await census(`control-b-prefix-zh-${mode}-w${W}`);
        // 2.369.180 (lanes I + J on one tree): in Take over lane J's "Typing goes to the browser" chip is present (nowrap by
        // its OWN rule) and the fold hides the labels it displaces (Not recording, the backend chip), so the one label left
        // to wrap is the toggle that never folds — the census must still go red, on the Hand back toggle by name
        const red = mode === 'takeover' ? b.wraps.some((w) => /browser-live-handback/.test(w)) && b.probs.length >= 3 : b.wraps.length >= 2 && b.probs.length >= 3;
        ok(red, `CONTROL (b): a patched copy WITHOUT the bar rules (nowrap / no-shrink / the (0,2,0) width) — zh ${mode} at ${W} — the census goes RED: vertical wrapping (${b.wraps.slice(0, 4).join(', ')}), ${b.probs.length} problem(s)`, b.probs.slice(0, 5).join('; '));
      }
      // (c) the nowrap rule alone removed, the fold's verdict undone (every item unfolded) ⇒ labels wrap; (c') the same under the real sheet ⇒ none
      const unfold = () => evaluate(`(() => { const bar = ${liveBar}; for (const el of bar.children) if (!el.classList.contains('browser-live-more')) el.classList.remove('bar-folded'); return [...bar.children].filter((e) => getComputedStyle(e).display !== 'none').length; })()`);
      await stage('takeover', 600); await swap(fNo); await unfold();
      const c = await census('control-c-nowrap-removed-unfolded-zh-takeover-w600');
      ok(c.wraps.length >= 1, `CONTROL (c): only the nowrap rule removed and the fold undone — zh Take over at 600 — labels wrap vertically (${c.wraps.slice(0, 4).join(', ')})`, c.probs.slice(0, 5).join('; '));
      await stage('takeover', 600); await unfold();
      const cr = await census('control-c-real-unfolded-zh-takeover-w600');
      ok(cr.wraps.length === 0 && cr.probs.some((p) => /^outside/.test(p) || /^overlap/.test(p) || /^cut/.test(p)), `CONTROL (c'): the SAME unfolded bar under the real stylesheet wraps nothing (the nowrap rule holds every label on one line) — the overflow is what the fold exists for (${cr.probs.length} outside/overlap problem(s))`, cr.probs.slice(0, 4).join('; '));
      if (!deskDone) skip('CONTROL (b) on the strip — no desktop app ran here (④ skipped)');
    }

    // ═══ ⑥ THE SPLIT FLOOR (lane I verify r1, the minor finding): a BOUND pane dragged to the divider's clamp ═══
    // The verifier's recipe: the chat window's menu row opens the live view BOUND beside the chat, then the split divider
    // is DRAGGED (real CDP pointer events) to the far right — the ratio clamps at 0.85, the live pane at 0.15 of the
    // host. Before the fix a 900 px host left a 134 px pane: the never-fold set (badge + toggle) was 169–222 px, the
    // toggle was cut and the ⋯ — the only way to the folded URL / bind / Tabs / Console / Actions — was clipped OUT of
    // the bar in every language. Per state: the toggle and the ⋯ lie inside the bar's rect, the bar does not overflow
    // (scrollWidth ≤ clientWidth + 1), the whole census (overlap / wrap / cut / outside / bad text / the fold = barLayout)
    // holds, the pane is never narrower than the bar's published floor; the folded badge's sentence is the ⋯'s first
    // row and the ⋯ wears the badge's colour. CONTROL: the floor removed at runtime (setPaneMinWidth neutralised, the
    // recorded floor cleared) on a 320 px host ⇒ the toggle / the ⋯ fall outside the bar again (red).
    console.log('— ⑥ the split floor: a bound live pane dragged to ratio 0.85 on 900 / 600 / 320 px hosts (zh / ja / en × Watch / Take over)');
    {
      const dragDivider = async (frac) => {
        const pts = await evaluate(`(() => { const l = ${LIVE}; const ch = l._tabChain; if (!ch || ch.layout !== 'split') return null; const host = window.app.wm.windows.get(ch.tabs[0]); const d = host.element.querySelector(':scope > .tab-split-divider'); if (!d) return null; const dr = d.getBoundingClientRect(); const hr = host.element.getBoundingClientRect(); return { x: dr.left + dr.width / 2, y: dr.top + dr.height / 2, to: hr.left + hr.width * ${frac} }; })()`);
        if (!pts) return null;
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pts.x, y: pts.y });
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pts.x, y: pts.y, button: 'left', buttons: 1, clickCount: 1 });
        for (let i = 1; i <= 6; i++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pts.x + ((pts.to - pts.x) * i) / 6, y: pts.y, button: 'left', buttons: 1 }); await frames(); }
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pts.to, y: pts.y, button: 'left', buttons: 0, clickCount: 1 });
        await frames(); await sleep(120); await frames();
        return evaluate(`(${LIVE})._tabChain.split.ratio`);
      };
      const placeHost = (hostW) => evaluate(`(() => { const c = ${CHAT}; const host = c._tabChain ? window.app.wm.windows.get(c._tabChain.tabs[0]) : c; host.gridBounds = null; if (host.isMaximized) window.app.wm.toggleMaximize(host.id); const e = host.element; e.style.left = '20px'; e.style.top = '20px'; e.style.width = '${hostW}px'; e.style.height = '560px'; window.app.wm.focusWindow(host.id); for (const id of (c._tabChain ? c._tabChain.tabs : [c.id])) { const x = window.app.wm.windows.get(id); if (x && x.onResize) x.onResize(); } return true; })()`);
      /** Reachability, from rects: the visible toggle and the ⋯ inside the bar; the bar's own overflow; the pane vs its floor. */
      const reach = () => evaluate(`(() => { const w = ${LIVE}; const Lv = w._browserLive; Lv.layoutBar(); const bar = Lv.el().querySelector('.browser-live-bar'); const br = bar.getBoundingClientRect(); const vis = (el) => !!el && getComputedStyle(el).display !== 'none'; const inside = (el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.left >= br.left - 0.5 && b.right <= br.right + 0.5; }; const tog = [...bar.querySelectorAll('.browser-live-mode-btn,.browser-live-handback')].find(vis) || null; const more = bar.querySelector('.browser-live-more'); const badge = bar.querySelector('.browser-live-mode'); const s = Lv.state(); return { pane: Math.round(w.content.getBoundingClientRect().width * 10) / 10, paneMin: w.paneMinWidth || null, toggle: tog ? inside(tog) : null, moreShown: vis(more), more: vis(more) ? inside(more) : null, sw: bar.scrollWidth, cw: bar.clientWidth, fits: s.bar ? s.bar.fits : null, floor: s.bar ? s.bar.floor : null, need: s.bar ? Math.round(s.bar.need) : null, folded: s.folded, badgeFolded: s.folded.includes('badge'), moreColor: getComputedStyle(more).color, badgeColor: getComputedStyle(badge).color, badgeFull: s.badgeFull, ratio: w._tabChain && w._tabChain.split ? w._tabChain.split.ratio : null }; })()`);
      const reachable = (x) => !!x && x.toggle === true && x.moreShown && x.more === true && x.sw <= x.cw + 1;
      const rows = [], bad = [];
      let menuRows = 0, tint = 0, floorOk = 0;
      for (const lang of LANGS) {
        const theme = lang === 'ja' ? 'light' : 'dark'; // the ⋯'s borrowed badge colour seen on both themes
        await load(lang, theme); await setTheme(theme);
        if (!ok(await openChat(S1, SESSION_NAME), `⑥ ${lang}: the browsing session's chat window is open`)) continue;
        await placeHost(900);
        await evaluate(`window.app.openBrowserLiveBeside(${CHAT}, ${JSON.stringify(S1)})`); // the window menu row's own act
        if (!ok(await liveUp() && await until(() => evaluate(`(${LIVE})._browserLive.isBound()`), 5000), `⑥ ${lang}: the window menu's act opened the live view BOUND beside the chat and it draws`)) continue;
        await evaluate(`document.querySelectorAll('.toast').forEach((t) => t.remove())`);
        await setTabs(upE, 3);
        for (const mode of ['watch', 'takeover']) {
          if (!await setMode(mode)) { ok(false, `⑥ ${lang}: ${mode} reached through the bar's one toggle`); continue; }
          for (const hostW of [900, 600, 320]) {
            await placeHost(hostW); await frames();
            const ratio = await dragDivider(0.995);
            const name = `floor-${lang}-${theme}-bound-${mode}-host${hostW}`;
            const r = await record('floor', name, liveBar, liveClip, { moreSel: '.browser-live-more', fold: liveFold, extraBad: await titleBad() });
            const x = await reach();
            rows.push(`${name}: ratio ${ratio} pane ${x.pane}px (floor ${x.floor}, paneMin ${x.paneMin}) need ${x.need} fits=${x.fits} toggle=${x.toggle} ⋯=${x.moreShown ? x.more : 'hidden'} scroll ${x.sw}/${x.cw} folded=[${x.folded.join(',')}]`);
            if (!(ratio >= 0.849)) bad.push(`${name}: the divider drag did not reach the clamp (ratio ${ratio})`);
            if (!reachable(x)) bad.push(`${name}: UNREACHABLE — toggle ${x.toggle}, ⋯ ${x.moreShown ? x.more : 'hidden'}, scroll ${x.sw} > ${x.cw}?`);
            if (x.floor > 0 && x.paneMin >= x.floor && x.pane + 0.6 >= Math.min(x.paneMin, 314)) floorOk++;
            else bad.push(`${name}: the pane (${x.pane}px) is narrower than its floor (the bar's ${x.floor} + its chrome = paneMinWidth ${x.paneMin})`);
            if (x.badgeFolded) {
              if (x.moreColor === x.badgeColor) tint++; else bad.push(`${name}: the ⋯ does not wear the folded badge's colour (${x.moreColor} vs ${x.badgeColor})`);
              if (hostW === 320) {
                await evaluate(`(${LIVE})._browserLive.el().querySelector('.browser-live-more').click()`);
                await sleep(150);
                const m = await evaluate(`[...document.querySelectorAll('.browser-live-more-menu > .context-menu-item')].map((e) => ({ text: (e.textContent || '').trim(), disabled: e.classList.contains('disabled') }))`);
                const mr = await evaluate(`(() => { const m = document.querySelector('.browser-live-more-menu'); if (!m) return null; const r = m.getBoundingClientRect(); const b = (${LIVE})._browserLive.el().querySelector('.browser-live-bar').getBoundingClientRect(); const x = Math.min(r.left, b.left) - 8, y = b.top - 8; return { x, y, width: Math.max(r.right, b.right) - x + 8, height: r.bottom - y + 8 }; })()`);
                if (mr) await shot(path.join(SHOTS, `${name}-more-menu.png`), mr);
                await evaluate(`document.querySelectorAll('.context-menu').forEach((m) => m.remove())`);
                if (m.length && m[0].text === x.badgeFull && m[0].disabled) menuRows++;
                else bad.push(`${name}: the ⋯ menu's first row is not the folded badge's sentence "${x.badgeFull}" (${JSON.stringify(m.slice(0, 2))})`);
              }
            }
          }
        }
        await setMode('watch');
        if (lang === 'zh') await shot(path.join(SHOTS, 'floor-zh-host320-overview.png'), await evaluate(`(() => { const c = ${CHAT}; const host = window.app.wm.windows.get(c._tabChain.tabs[0]); const r = host.element.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: Math.min(r.height, 160) }; })()`));
        // CONTROL (zh Watch, en Take over): the floor removed at runtime on a 320 px host ⇒ the bar is unreachable again
        if (lang === 'zh' || lang === 'en') {
          const cmode = lang === 'zh' ? 'watch' : 'takeover';
          await setMode(cmode);
          await placeHost(320); await dragDivider(0.995);
          await evaluate(`(() => { const wm = window.app.wm; window.__vsPaneMinSave = Object.prototype.hasOwnProperty.call(wm, 'setPaneMinWidth') ? wm.setPaneMinWidth : undefined; wm.setPaneMinWidth = () => {}; const l = ${LIVE}; l.paneMinWidth = null; wm._applyChainLayout(l._tabChain); return true; })()`);
          await frames(); await sleep(100); await frames();
          const c = await reach();
          await shot(path.join(SHOTS, `control-floor-removed-${lang}-${cmode}-host320.png`), await evaluate(`(() => { const el = ${liveClip}; const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; })()`));
          ok(!reachable(c), `CONTROL ⑥ (${lang} ${cmode}, 320 px host): the pane floor removed at runtime ⇒ UNREACHABLE again — pane ${c.pane}px, toggle inside ${c.toggle}, ⋯ ${c.moreShown ? 'inside ' + c.more : 'hidden'}, scroll ${c.sw} > ${c.cw}`, JSON.stringify(c));
          await evaluate(`(() => { const wm = window.app.wm; if (window.__vsPaneMinSave) wm.setPaneMinWidth = window.__vsPaneMinSave; else delete wm.setPaneMinWidth; return true; })()`);
          await setMode('watch');
        }
        await setTabs(upE, 1);
        await evaluate(`(() => { for (const id of [...window.app.wm.windows.keys()]) { try { window.app.wm.closeWindow(id); } catch {} } return 1; })()`);
      }
      for (const r of rows) console.log('    · ' + r);
      ok(tally.floor.n === LANGS.length * 2 * 3, `⑥ ${tally.floor.n} split-floor states measured (3 languages × Watch / Take over × 900 / 600 / 320 px hosts, the divider dragged to the clamp)`);
      ok(bad.length === 0, `⑥ at the split floor the mode toggle and the ⋯ stay INSIDE the bar and the bar never overflows, the pane never narrower than its bar's floor (${bad.length} bad)`, bad.slice(0, 8).join('\n    '));
      ok(tally.floor.bad.length === 0, `⑥ every split-floor state passes the whole census: no overlap, no wrap, no cut words, nothing outside the bar (${tally.floor.bad.length} bad of ${tally.floor.n})`, tally.floor.bad.slice(0, 6).join('\n    '));
      ok(floorOk === tally.floor.n && tint >= 6 && menuRows >= 6, `⑥ the pane floor held in all ${floorOk} states; the folded badge rides the ⋯ — its colour (${tint} states) and its sentence as the menu's first row (${menuRows} states at the 320 px host)`);
    }
  } catch (e) {
    ok(false, 'the suite ran to its end', (e && (e.stack || e.message)) + '\n' + journal.slice(-1200));
  }
  for (const r of copiesCensus(MUT.files, MUT.dir, repo, { minCopies: 3 })) ok(r.pass, 'tree: ' + r.name + (r.pass ? '' : ' — ' + r.detail));
  console.log(`  artifacts: ${fs.readdirSync(SHOTS).filter((f) => f.endsWith('.png')).length} PNG + JSON in ${SHOTS}`);
})();

console.log(`\n${pass} passed, ${fail} failed${skipped ? `, ${skipped} skipped` : ''}`);
process.exit(fail ? 1 : 0);
