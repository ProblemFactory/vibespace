#!/usr/bin/env node
// "WHO CAN USE IT", SEEN (2026-09-27 — the owner's report, a Chinese UI: the Agent browser panel's "谁能使用" was a native
// dropdown of every live session, no Task Group, ONE choice). The cell is now a LIST (chips + 更改…) and the dialog is the
// principal picker. This suite drives both on a real page over a scratch server:
//
//   · a scratch COPY of the working tree (its own data/ and HOME, its own bundle), a stub `claude` behind the REAL
//     chat-wrapper for four live sessions, a fake agent-browser 0.38.1 on the server's PATH (the lease the "will lose it"
//     sentence counts is real), three Task Groups made through the real route; 36 more roster rows ride the page's
//     `active-sessions` frames (display-only: 40 sessions — three under 运维管理, four under Studio大开发, two on
//     another machine, one shell, the rest loose) — every row the suite PICKS is a real live session;
//   · zh at 1280×800 (the panel window 860 px), DejaVu Sans (the Actions runner's face), `vs-onboarded` pre-set:
//     ① the row reads 所有 agent (lane everyone-principal: the All chip — the old 我的所有会话), has NO <select>, and 更改…
//        is the house text button;
//     ② mirror-193's recipe: a write lands while the panel's copy is HELD stale (its housekeeping answers replayed) — the
//        dialog still draws the SERVER's list (a fresh GET …/use);
//     ③ type "Studio" ⇒ the Task Group row comes first; two groups picked with the keyboard (↓ Enter), one session with the
//        mouse, a chip removed with the mouse ⇒ the "will lose it" sentence for the seeded lease outside the draft;
//     ④ Save ⇒ ONE PATCH carrying `session:<webui id>` rows + the `base` it read; the toast 谁能使用 work：…; the lease gone;
//     ⑤ a SECOND page (≤ 768 px) had the row open: its unchanged chip is the SAME node after the broadcast (keyed in place),
//        the rest fold into "+N more" (the dictionary's zh word — 2.369.195's 另有 N 个, one key, one word);
//     ⑥ the 409 leg: a write between open and Save ⇒ the sentence, the dialog re-opened on the list as it is now;
//     ⑦ the empty list refused in place (no request); the remote sessions absent, the sentence present;
//     ⑨ (2026-09-28, the naive-user verifier) the phone at 360 px in zh / ja / en with BOTH notes shown (a lease the
//        empty list would take + the empty list refused): each a real line (glyph drawn, sentence in its own span, inside
//        the dialog, never over the other / the remote line / the footer); an in-page control puts the sentence back in
//        the glyph's span and the judge fails it;
//     ⑩ (lane everyone-principal, 2026-10-02) ALL AGENTS picked, zh: the dialog's FIRST row (no radios any more) picked with
//        a real mouse beside a list ⇒ its chip first, the kept sentence, ONE PATCH {mode:'all', who:[the list]}, the row
//        reads 所有 agent（另有 1 行）; re-opened with All + the kept row picked; its chip's ✕ ⇒ {mode:'only'} = the list restored;
//     ⑧ ja and en once each; the RECT CENSUS at 860 px (the panel) and 360 px (the dialog on a phone: picker rows ≥ 40 px,
//        chips ≥ 36 px, nothing past its cell or the viewport, no sideways scroll).
// Artifacts: PNG + JSON per leg under <tmpdir>/vibespace-who-shots/run-<pid>-<time>/ (the newest three kept;
// VIBESPACE_WHO_SHOTS names another root). SKIPs without chrome, dtach or DejaVu Sans. Run: node scripts/test-browser-who-ui.mjs
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

const ROOT = scratch('who-ui');
fs.mkdirSync(ROOT, { recursive: true });
const SHOTS_ROOT = process.env.VIBESPACE_WHO_SHOTS ? path.resolve(process.env.VIBESPACE_WHO_SHOTS) : path.join(os.tmpdir(), 'vibespace-who-shots');
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

// ── in the page: the roster's extra rows ride every active-sessions frame; every fetch is recorded; the panel's copy can be HELD ──
function PAGE_WRAPPERS() {
  const S = (window.__who = { calls: [], holdHK: false, lastHK: null, stubs: [] });
  const realFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const url = String((input && input.url) || input);
    const method = String((init && init.method) || 'GET').toUpperCase();
    let body = null; try { body = init && typeof init.body === 'string' ? JSON.parse(init.body) : null; } catch { body = null; }
    S.calls.push({ url, method, body, at: Date.now() });
    if (/\/api\/browser\/housekeeping(\?|$)/.test(url) && method === 'GET') {
      // mirror-193's recipe: the panel's copy HELD a frame (many frames) behind the server
      if (S.holdHK && S.lastHK) return new Response(S.lastHK, { status: 200, headers: { 'Content-Type': 'application/json' } });
      const r = await realFetch(input, init);
      try { S.lastHK = await r.clone().text(); } catch { }
      return r;
    }
    return realFetch(input, init);
  };
  const Real = window.WebSocket;
  const rewrite = (e) => {
    if (typeof e.data !== 'string' || !e.data.startsWith('{"type":"active-sessions"')) return e;
    try { const d = JSON.parse(e.data); d.sessions = [...(d.sessions || []), ...S.stubs]; return new MessageEvent('message', { data: JSON.stringify(d) }); } catch { return e; }
  };
  window.WebSocket = class extends Real {
    set onmessage(fn) { super.onmessage = fn ? (e) => fn.call(this, rewrite(e)) : null; }
    get onmessage() { return super.onmessage; }
  };
}
const FONT_SOURCE = "document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.id = 'vs-who-face'; st.textContent = \"html, body, button, input, select, textarea { font-family: 'DejaVu Sans', sans-serif !important; }\"; document.head.appendChild(st); });";

// ── THE RECT CENSUS (in the page): every chip, row and button inside its cell and the viewport; no sideways overflow ──
function RECTS(o) {
  const out = { problems: [], n: 0 };
  const R = (b) => ({ x: Math.round(b.left), y: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom), w: Math.round(b.width), h: Math.round(b.height) });
  const shown = (el) => { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return false; const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
  const inside = (a, c, slack = 1, h = false) => a.left >= c.left - slack && a.right <= c.right + slack && (h || (a.top >= c.top - slack && a.bottom <= c.bottom + slack));
  const vp = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
  // a pair's third element {h:true}: HORIZONTAL containment only — rows inside a vertical scroller are clipped by design
  for (const [cellSel, partSel, opt] of o.pairs) {
    const h = !!(opt && opt.h);
    for (const cell of document.querySelectorAll(cellSel)) {
      if (!shown(cell)) continue;
      const cb = cell.getBoundingClientRect();
      if (o.viewport && !inside(cb, vp)) out.problems.push(`${cellSel} past the viewport ${J2(R(cb))} (vw ${innerWidth})`);
      if (cell.scrollWidth > cell.clientWidth + 1) out.problems.push(`${cellSel} overflows sideways (${cell.scrollWidth} > ${cell.clientWidth})`);
      for (const el of cell.querySelectorAll(partSel)) {
        if (!shown(el)) continue;
        out.n++;
        const b = el.getBoundingClientRect();
        if (!inside(b, cb, 1, h)) out.problems.push(`${partSel} "${(el.textContent || '').trim().slice(0, 30)}" past its cell ${cellSel} ${J2(R(b))} ⊄ ${J2(R(cb))}`);
        if (o.viewport && !inside(b, vp, 1, h)) out.problems.push(`${partSel} "${(el.textContent || '').trim().slice(0, 30)}" past the viewport ${J2(R(b))}`);
        if (el.scrollWidth > el.clientWidth + 1 && el.tagName === 'BUTTON') out.problems.push(`button clipped: "${(el.textContent || '').trim()}" (${el.scrollWidth} > ${el.clientWidth})`);
      }
    }
  }
  for (const [sel, min] of o.minHeights || []) for (const el of document.querySelectorAll(sel)) { if (!shown(el)) continue; const h = el.getBoundingClientRect().height; if (h < min - 0.5) out.problems.push(`${sel} "${(el.textContent || '').trim().slice(0, 24)}" is ${Math.round(h)} px < ${min}`); }
  if (document.documentElement.scrollWidth > innerWidth + 1) out.problems.push(`the page scrolls sideways (${document.documentElement.scrollWidth} > ${innerWidth})`);
  return out;
  function J2(x) { return JSON.stringify(x); }
}

// ── THE NOTE LINES (in the page; the naive-user verifier, 2026-09-28): the "will lose it" and the empty-list sentences were
// written into the alert glyph's line-height:0 span — a 0 px line, the two overlapping, the text running off the phone.
// Every shown note: ≥ 12 px tall, its glyph drawn, its sentence in its OWN text span, inside the dialog, nothing clipped;
// no two of the notes / the remote line / the footer intersect ──
function NOTES(dlg) {
  const out = { problems: [], shown: [] };
  const d = document.querySelector(dlg);
  if (!d) return { problems: ['no dialog'], shown: [] };
  const db = d.getBoundingClientRect();
  const vis = (el) => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0;
  const boxes = [];
  for (const cls of ['bwho-lose', 'bwho-refusal']) {
    const n = d.querySelector('.' + cls);
    if (!n || getComputedStyle(n).display === 'none') continue;
    const b = n.getBoundingClientRect();
    const ic = n.querySelector(':scope > .chan-ic'), tx = n.querySelector(':scope > .chan-note-text');
    const ib = ic && ic.querySelector('svg') ? ic.querySelector('svg').getBoundingClientRect() : null;
    out.shown.push({ cls, h: Math.round(b.height), text: tx ? tx.textContent : null });
    if (b.height < 12) out.problems.push(`${cls} is ${Math.round(b.height)} px tall`);
    if (!ib || ib.width < 6 || ib.height < 6) out.problems.push(`${cls}: the alert glyph is not drawn`);
    if (!tx || !tx.textContent.trim()) out.problems.push(`${cls}: no sentence in its own text span`);
    if (ic && ic.textContent.trim()) out.problems.push(`${cls}: a sentence written into the glyph's span`);
    if (b.left < db.left - 1 || b.right > db.right + 1) out.problems.push(`${cls} runs past the dialog (${Math.round(b.left)}–${Math.round(b.right)} ⊄ ${Math.round(db.left)}–${Math.round(db.right)})`);
    if (b.right > innerWidth + 1) out.problems.push(`${cls} runs past the screen`);
    if (tx && tx.scrollWidth > tx.clientWidth + 1) out.problems.push(`${cls}: its sentence is cut (${tx.scrollWidth} > ${tx.clientWidth})`);
    const r = document.createRange(); if (tx) { r.selectNodeContents(tx); for (const x of r.getClientRects()) if (x.right > db.right + 1 || x.bottom > b.bottom + 1 || x.top < b.top - 1) { out.problems.push(`${cls}: a line of its text lies outside its box`); break; } }
    boxes.push([cls, b, n]);
  }
  for (const [cls, sel] of [['bwho-remote', '.bwho-remote'], ['footer', '.bwho-footer']]) { const n = d.querySelector(sel); if (vis(n)) boxes.push([cls, n.getBoundingClientRect(), n]); }
  // what is SEEN: a box clipped by every scrolling ancestor up to the dialog (a line scrolled below the body's fold is not drawn)
  const seen = (el, b) => { let r = { left: b.left, top: b.top, right: b.right, bottom: b.bottom }; for (let a = el && el.parentElement; a && a !== d.parentElement; a = a.parentElement) { const cs = getComputedStyle(a); if (/(auto|scroll|hidden|clip)/.test(cs.overflowY + ' ' + cs.overflowX)) { const q = a.getBoundingClientRect(); r = { left: Math.max(r.left, q.left), top: Math.max(r.top, q.top), right: Math.min(r.right, q.right), bottom: Math.min(r.bottom, q.bottom) }; } } return r; };
  for (const x of boxes) { const el = x[2] || d.querySelector('.' + x[0]); x[1] = seen(el, x[1]); }
  for (const [cls, b] of boxes) if (/^bwho-(lose|refusal)$/.test(cls)) { const full = d.querySelector('.' + cls).getBoundingClientRect(); if (b.bottom - b.top < full.height - 1) out.problems.push(`${cls} is not fully on screen (${Math.round(b.bottom - b.top)} of ${Math.round(full.height)} px drawn)`); }
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const [a, A] = boxes[i], [c, C] = boxes[j];
    const w = Math.min(A.right, C.right) - Math.max(A.left, C.left), h = Math.min(A.bottom, C.bottom) - Math.max(A.top, C.top);
    if (w > 0.5 && h > 0.5) out.problems.push(`${a} × ${c} overlap (${Math.round(w)}×${Math.round(h)})`);
  }
  return out;
}

const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
const hasDejaVu = (() => { try { return /DejaVu Sans/.test(execFileSync('fc-list', [':', 'family'], { encoding: 'utf8' })); } catch { return false; } })();
const hasDtach = (() => { try { execFileSync('which', ['dtach'], { stdio: 'ignore' }); return true; } catch { return false; } })();
if (!CHROME) skip('no chrome/chromium on this box — every leg needs one');
else if (!hasDejaVu) skip("no 'DejaVu Sans' on this box (fc-list : family) — the panel is judged under the Actions runner's face");
else if (!hasDtach) skip('no dtach on this box — the live sessions run under it');
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
  HOME_DIR = scratchHome('who-ui-home', fs);
  // the folders the Task Groups own, and the loose ones
  const DIRS = { ops: path.join(ROOT, 'w', 'ops'), studio: path.join(ROOT, 'w', 'studio'), comp: path.join(ROOT, 'w', 'compliance'), loose: path.join(ROOT, 'w', 'loose') };
  for (const d of Object.values(DIRS)) fs.mkdirSync(d, { recursive: true });
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
  // ── a fake agent-browser 0.38.1 on the server's PATH (a daemon is a real `sleep`; the lease is real) ──
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
fs.appendFileSync(path.join(st, 'calls.log'), JSON.stringify({ ns, sess, argv }) + '\\n');
const daemon = () => { let s = read(); if (s && alive(s.pid)) return s; const c = spawn('sleep', ['900'], { detached: true, stdio: 'ignore' }); c.unref(); s = { pid: c.pid }; fs.writeFileSync(f, JSON.stringify(s)); return s; };
if (a === '--version') { console.log('agent-browser 0.38.1'); process.exit(0); }
if (a === 'session' && b === 'info') { const s = read(); const act = !!(s && alive(s.pid)); out({ success: true, data: { active: act, namespace: ns, pid: act ? s.pid : null, session: sess } }); process.exit(0); }
if (a === 'get' && b === 'cdp-url') { const s = read(); if (!(s && alive(s.pid))) { out({ success: false, error: 'fake: no browser' }); process.exit(1); } out({ success: true, data: { cdpUrl: 'ws://127.0.0.1:19999/devtools/browser/fake-' + ns } }); process.exit(0); }
if (a === 'close') { const s = read(); if (s && alive(s.pid)) { try { process.kill(s.pid, 'SIGKILL'); } catch { } } try { fs.unlinkSync(f); } catch { } out({ success: true, data: { closed: 1 } }); process.exit(0); }
if (a === 'stream' && b === 'status') { daemon(); out({ success: true, data: { enabled: true, connected: true, port: 21999, screencasting: false } }); process.exit(0); }
if (['open', 'snapshot', 'get', 'click'].includes(a)) { daemon(); out({ success: true, data: { ok: true } }); process.exit(0); }
out({ success: false, error: 'fake: unknown verb ' + argv.join(' ') }); process.exit(1);
`, { mode: 0o755 });

  // ── the server ──
  const PORT = await freePort(), CDP = await freePort();
  const baseEnv = { ...process.env };
  for (const k of Object.keys(baseEnv)) if (k.startsWith('AGENT_BROWSER_')) delete baseEnv[k];
  let journal = '';
  const srv = spawn(process.execPath, ['server.js'], { cwd: WT, env: { ...baseEnv, ...VNC_ENV, PATH: `${FAKE_BIN}:${baseEnv.PATH || '/usr/bin:/bin'}`, PORT: String(PORT), HOME: HOME_DIR, CLAUDE_CMD: STUB, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  procs.add(srv);
  srv.stdout.on('data', (d) => { journal = (journal + d).slice(-40000); }); srv.stderr.on('data', (d) => { journal = (journal + d).slice(-40000); });
  if (!ok(await until(() => journal.includes('Ready.'), 60000, 200), 'the scratch server booted', journal.slice(-800))) return;
  const api = async (method, p, body) => { const res = await fetch(`http://127.0.0.1:${PORT}${p}`, { method, headers: body !== undefined ? { 'Content-Type': 'application/json' } : {}, body: body !== undefined ? J(body) : undefined }); let json = null; try { json = await res.json(); } catch { } return { status: res.status, json }; };

  // ── the Task Groups (the real route) ──
  const TG = {};
  for (const [k, title, dir] of [['ops', '运维管理', DIRS.ops], ['studio', 'Studio大开发', DIRS.studio], ['comp', '合规助手', DIRS.comp]]) {
    const r = await api('POST', '/api/tasks', { title, folders: [{ path: dir, recursive: true }] });
    TG[k] = r.json && r.json.task ? r.json.task.id : null;
  }
  if (!ok(TG.ops && TG.studio && TG.comp, 'three Task Groups made through the real route (运维管理 / Studio大开发 / 合规助手)', TG)) return;
  // ── four LIVE sessions through the real create path ──
  const ctl = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  const frames = []; ctl.on('message', (d) => { if (d.length > 262144) return; try { frames.push(JSON.parse(String(d))); } catch { } });
  await new Promise((r, e) => { ctl.on('open', r); ctl.on('error', e); });
  const REAL = [['ops', '运维巡检', DIRS.ops], ['kaixu', 'Kaixu 学习', DIRS.studio], ['west', 'Westcliff', DIRS.loose], ['draft', '草稿本', DIRS.loose]];
  const SID = {};
  for (const [k, name, cwd] of REAL) {
    ctl.send(J({ type: 'create', backend: 'claude', mode: 'chat', cwd, reqId: 'c-' + k, sessionName: name, cols: 80, rows: 24 }));
    await until(() => frames.some((m) => (m.type === 'created' || m.type === 'error') && m.reqId === 'c-' + k), 25000, 100);
    const c = frames.find((m) => m.type === 'created' && m.reqId === 'c-' + k);
    SID[k] = c ? c.sessionId : null;
  }
  if (!ok(Object.values(SID).every(Boolean), 'four live chat sessions created through the real path (stub claude behind the real wrapper)', { SID, err: frames.filter((m) => m.type === 'error').slice(-2) })) return;
  const liveRows = await until(async () => { const a = frames.filter((m) => m.type === 'active-sessions').pop(); const rows = a ? a.sessions.filter((s) => Object.values(SID).includes(s.id) && /^bk-[0-9a-f]{8}$/.test(String(s.browserKey || ''))) : []; return rows.length === 4 ? rows : null; }, 20000, 200);
  if (!ok(!!liveRows, 'each live session carries its conversation\'s browser key', frames.filter((m) => m.type === 'active-sessions').pop())) return;
  const KEY = Object.fromEntries(REAL.map(([k]) => [k, liveRows.find((s) => s.id === SID[k]).browserKey]));
  // the profile + the seeded lease (Westcliff, loose — the "will lose it" row)
  const made = await api('POST', '/api/browser/profiles', { label: 'work' });
  const WORK = made.json && made.json.profile && made.json.profile.id;
  const at = await api('POST', '/api/browser/attach', { sessionId: SID.west, profile: 'work' });
  if (!ok(WORK && at.status === 200 && at.json.lease && at.json.lease.browserKey === KEY.west, 'the profile "work" + Westcliff\'s tab in it (a real lease through the UI\'s attach, the fake 0.38.1 as the browser)', { made: made.json, at: at.json })) return;

  // ── the 36 display-only rows (40 sessions in the roster) ──
  const STUBS = [];
  const bk = (n) => 'bk-00ab' + String(n).padStart(4, '0');
  const stubRow = (n, name, cwd, extra = {}) => STUBS.push({ id: 'stub-' + n, name, cwd, host: null, backend: 'claude', backendSessionId: '5b0b0000-0000-4000-8000-' + String(n).padStart(12, '0'), claudeSessionId: '5b0b0000-0000-4000-8000-' + String(n).padStart(12, '0'), createdAt: Date.now() - n * 60000, mode: 'chat', browserKey: bk(n), ...extra });
  stubRow(1, '值班告警', path.join(DIRS.ops, 'a')); stubRow(2, '容量评估', path.join(DIRS.ops, 'b'));
  stubRow(3, 'TTS 调参', path.join(DIRS.studio, 'a')); stubRow(4, 'Voice clone review', path.join(DIRS.studio, 'b')); stubRow(5, 'Studio 发布', path.join(DIRS.studio, 'c'));
  stubRow(6, 'Remote box one', '/srv/one', { host: 'box1', hostName: 'box1' }); stubRow(7, 'Remote box two', '/srv/two', { host: 'box2', hostName: 'box2' });
  stubRow(8, 'A shell', DIRS.loose, { backend: 'shell' });
  const LOOSE = ['客户周报', 'Invoice sync', 'Élodie notes', 'Release notes', '会议纪要', 'Data backfill', 'Pager rota', 'Spec review', '测试清单', 'Bug triage', 'Docs pass', 'Onboarding', '数据看板', 'SQL tuning', 'Log search', 'Design crit', '预算表', 'Hiring loop', 'Vendor call', 'Perf audit', '翻译校对', 'Legal read', 'Kaggle try', 'Roadmap', '备份检查', 'Inbox zero', 'Retro', '周会准备'];
  LOOSE.forEach((name, i) => stubRow(10 + i, name, path.join(DIRS.loose, 'x' + i), { backend: i % 3 === 1 ? 'codex' : 'claude' }));
  ok(STUBS.length === 36 && REAL.length + STUBS.length === 40, `40 sessions in the roster (${REAL.length} live + ${STUBS.length} display-only): 3 under 运维管理, 4 under Studio大开发, 2 on other machines, 1 shell, the rest loose`);

  // ── chrome ──
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--force-device-scale-factor=1', '--disable-background-timer-throttling', `--user-data-dir=${path.join(ROOT, 'chrome')}`, '--window-size=1280,800', 'about:blank'], { stdio: 'ignore' });
  procs.add(chrome);
  let first = null;
  for (let i = 0; i < 120 && !first; i++) { try { first = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find((x) => x.type === 'page'); } catch { } if (!first) await sleep(250); }
  if (!ok(!!first, 'chrome exposed a CDP page target')) return;
  /** One page = one CDP connection with its own helpers. */
  async function pageOf(target) {
    const cdp = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
    await new Promise((r) => cdp.on('open', r));
    procs.add({ kill: () => { try { cdp.close(); } catch { } } });
    let seq = 0; const pend = new Map(); const errors = [];
    cdp.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } if (m.method === 'Runtime.exceptionThrown') errors.push(m.params?.exceptionDetails?.exception?.description || m.params?.exceptionDetails?.text || '?'); });
    const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); cdp.send(J({ id, method, params })); });
    const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error((r.result.exceptionDetails.exception?.description || 'eval threw').slice(0, 600)); return r.result?.result?.value; };
    await send('Page.enable'); await send('Runtime.enable');
    await send('Emulation.setFocusEmulationEnabled', { enabled: true }); // both pages keep their focus (two tabs, one window)
    await send('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); // §47: the first-run wizard never covers the panel
    await send('Page.addScriptToEvaluateOnNewDocument', { source: FONT_SOURCE });
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `(${PAGE_WRAPPERS.toString()})(); window.__who.stubs = ${J(STUBS)};` });
    let langScript = null;
    const P = {
      send, ev, errors,
      /** The tab this leg drives is the visible one (a hidden tab gets no animation frames). */
      front: () => send('Page.bringToFront'),
      async load(lang, w, h, mobile = false) {
        await send('Page.bringToFront');
        if (langScript) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: langScript });
        langScript = (await send('Page.addScriptToEvaluateOnNewDocument', { source: lang === 'en' ? "try { localStorage.removeItem('vibespace.lang'); } catch {}" : `try { localStorage.setItem('vibespace.lang', ${J(lang)}); } catch {}` })).result.identifier;
        await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
        await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/?cb=${Date.now()}` });
        const up = await until(() => ev('(async () => { if (!window.app || !window.app.ready) return false; return await Promise.race([window.app.ready.then(() => true), new Promise((r) => setTimeout(() => r(false), 150))]); })()'), 40000, 250);
        if (!up) throw new Error('the app did not boot');
        await until(() => ev(`(() => { const s = document.getElementById('loading-screen'); return !s || getComputedStyle(s).display === 'none' || getComputedStyle(s).opacity === '0'; })()`), 10000);
        await until(() => ev(`!!(window.app._browserProfiles && (window.app._browserProfiles.profiles || []).length && (window.app.sidebar._webuiSessions || []).length >= 40 && (window.app.sidebar._tasks || []).length >= 3)`), 20000, 150);
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
      async key(k, code, vk) { await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }); },
      async type(text) { await send('Input.insertText', { text }); },
      async shot(file, sel = null) {
        let clip;
        if (sel) { const r = await ev(`(() => { const el = document.querySelector(${J(sel)}); if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, width: b.width, height: b.height }; })()`); if (r) clip = { x: Math.max(0, r.x - 4), y: Math.max(0, r.y - 4), width: r.width + 8, height: r.height + 8, scale: 1 }; }
        const img = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip } : {}) });
        if (img.result && img.result.data) fs.writeFileSync(path.join(SHOTS, file + '.png'), Buffer.from(img.result.data, 'base64'));
      },
      rects: (o) => ev(`(${RECTS.toString()})(${J(o)})`),
      notes: (dlg) => ev(`(${NOTES.toString()})(${J(dlg)})`),
      async openPanel() {
        await ev(`(() => { for (const id of [...window.app.wm.windows.keys()]) { try { window.app.wm.closeWindow(id); } catch {} } window.app.openBrowserProfiles(); return true; })()`);
        return until(() => ev(`!!document.querySelector('.bprof-profile[data-profile-id="${WORK}"] .bprof-who')`), 10000, 80);
      },
    };
    return P;
  }
  const p1 = await pageOf(first);
  const ROW = `.bprof-profile[data-profile-id="${WORK}"]`;
  const DLG = '#browser-who-dialog .dialog';
  const patches = (p) => p.ev(`window.__who.calls.filter((c) => c.method === 'PATCH' && c.url.includes('/api/browser/profiles/${WORK}')).map((c) => c.body)`);
  const gets = (p) => p.ev(`window.__who.calls.filter((c) => c.method === 'GET' && c.url.includes('/api/browser/profiles/${WORK}/use')).length`);
  const chipsOf = (p, sel) => p.ev(`[...document.querySelectorAll(${J(sel)})].filter((e) => getComputedStyle(e).display !== 'none').map((e) => ({ key: e.dataset.key, name: (e.querySelector('.pp-chip-name, .bprof-who-name') || e).textContent.trim() }))`);
  const useNow = async () => (await api('GET', `/api/browser/profiles/${WORK}/use`)).json;
  try {
    // ═══ ① zh at 1280×800: the row reads 所有 agent, NO <select>, 更改… the house text button ═══
    console.log('— ① zh: the panel row');
    await p1.load('zh', 1280, 800);
    ok(await p1.openPanel(), '① the Agent browser panel shows the row "work" with its who cell');
    const who0 = await p1.text(`${ROW} .bprof-who-all`);
    const sel0 = await p1.ev(`document.querySelectorAll('.bprof select').length`);
    const chg = await p1.ev(`(() => { const b = document.querySelector('${ROW} .bprof-who-change'); return b ? { text: b.textContent, cls: b.className } : null; })()`);
    ok(who0 === tr('zh', 'All agents') && sel0 === 0 && chg && chg.text === '更改…' && /\bmounts-btn\b/.test(chg.cls) && !/file-tool-btn/.test(chg.cls), `① the row reads "${who0}", the panel has NO <select> (${sel0}), and "${chg && chg.text}" is the house text button (${chg && chg.cls})`);
    await p1.shot('01-zh-row-all', `${ROW}`);

    // ═══ ② the panel's copy HELD stale while a write lands — the dialog draws the SERVER's list ═══
    console.log('— ② a fresh read: the panel holds a stale copy, the dialog does not');
    await p1.ev('window.__who.holdHK = true');
    const u0 = await useNow();
    const w1 = await api('PATCH', `/api/browser/profiles/${WORK}`, { use: { mode: 'only', who: [{ kind: 'task', id: TG.ops }, { kind: 'session', key: KEY.west }] }, base: u0.base });
    await sleep(2200); // the broadcast lands, the panel reloads — and is answered with its HELD copy
    const stale = await p1.text(`${ROW} .bprof-who-all`);
    ok(w1.status === 200 && stale === tr('zh', 'All agents'), `② a write lands (only 运维管理 + Westcliff) while the panel's copy is held: the row still says "${stale}" (stale on purpose)`, w1.json);
    const g0 = await gets(p1);
    ok(await p1.click(`${ROW} .bprof-who-change`), '② 更改… clicked (a real mouse)');
    const opened = await until(() => p1.ev(`!!document.querySelector('${DLG} .pp-chip')`), 8000, 60);
    const title = await p1.text(`${DLG} .dialog-header h3`);
    const chips1 = await chipsOf(p1, `${DLG} .pp-chip`);
    // lane everyone-principal: no radios — the list's own chips (no All chip) ARE "only these"
    const radios = await p1.ev(`document.querySelectorAll('${DLG} input[type="radio"]').length`);
    ok(opened && title === '谁能使用 work？' && radios === 0 && chips1.map((c) => c.name).join('|') === '运维管理|Westcliff' && (await gets(p1)) === g0 + 1, `② the dialog opens on a FRESH GET: "${title}", no radios (${radios}), chips ${chips1.map((c) => c.name).join(' · ')} — the server's list, not the panel's (no All chip)`, { chips1, title, radios });
    await p1.ev('window.__who.holdHK = false');
    await p1.shot('02-zh-dialog-fresh', DLG);

    // ═══ ③ type "Studio" ⇒ the group first; two groups by keyboard, one session by mouse, a chip removed by mouse ═══
    console.log('— ③ the picker: keyboard and mouse');
    await p1.click(`${DLG} .pp-input`);
    await p1.type('Studio');
    await p1.frames();
    const firstRow = await p1.ev(`(() => { const r = [...document.querySelectorAll('${DLG} .pp-list .pp-row:not(.pp-row-everyone)')].find((e) => e.offsetParent); const head = r ? r.previousElementSibling : null; return r ? { key: r.dataset.key, name: r.querySelector('.pp-name').textContent, head: head && head.classList.contains('pp-sec') ? head.textContent : null } : null; })()`);
    const allTop = await p1.ev(`(() => { const r = [...document.querySelectorAll('${DLG} .pp-list .pp-row')].find((e) => e.offsetParent); return r ? { key: r.dataset.key, name: r.querySelector('.pp-name').textContent } : null; })()`);
    ok(firstRow && firstRow.key === 'task:' + TG.studio && firstRow.name === 'Studio大开发' && firstRow.head === '任务组', `③ type "Studio" ⇒ the first NAMED row is the Task Group "${firstRow && firstRow.name}" under "${firstRow && firstRow.head}"`, firstRow);
    ok(allTop && allTop.key === 'everyone:*' && allTop.name === tr('zh', 'All agents'), `③ …and the search never hides ALL AGENTS: the list's first row is still "${allTop && allTop.name}" (↓ lands past it on the first match)`, allTop);
    await p1.key('ArrowDown', 'ArrowDown', 40); await p1.key('Enter', 'Enter', 13);
    await p1.frames();
    await p1.type('合规');
    await p1.frames();
    await p1.key('ArrowDown', 'ArrowDown', 40); await p1.key('Enter', 'Enter', 13);
    await p1.frames();
    const chips2 = await chipsOf(p1, `${DLG} .pp-chip`);
    ok(chips2.map((c) => c.name).join('|') === '运维管理|Westcliff|Studio大开发|合规助手', `③ two Task Groups picked with the keyboard (↓ Enter): ${chips2.map((c) => c.name).join(' · ')}`, chips2);
    const kaixuRow = `${DLG} .pp-row[data-key="session:${SID.kaixu}"]`;
    ok(await p1.click(kaixuRow), '③ the live session "Kaixu 学习" clicked in the list (a real mouse)');
    await p1.frames();
    const loseBefore = await p1.ev(`(() => { const l = document.querySelector('${DLG} .bwho-lose'); return l && getComputedStyle(l).display !== 'none' ? l.textContent.trim() : ''; })()`);
    ok(await p1.click(`${DLG} .pp-chip[data-key="session:${SID.west}"] .pp-chip-x`), '③ Westcliff\'s chip removed with its × (a real mouse)');
    await p1.frames();
    const chips3 = await chipsOf(p1, `${DLG} .pp-chip`);
    const lose = await p1.ev(`(() => { const l = document.querySelector('${DLG} .bwho-lose'); return l && getComputedStyle(l).display !== 'none' ? l.textContent.trim() : ''; })()`);
    ok(chips3.map((c) => c.name).join('|') === '运维管理|Studio大开发|合规助手|Kaixu 学习' && !loseBefore && lose === tr('zh', '{n} conversation(s) using it now will lose it when you save (their pages in it close).', { n: 1 }), `③ the draft: ${chips3.map((c) => c.name).join(' · ')}; the "will lose it" sentence appears for Westcliff's tab: "${lose}"`, { chips3, loseBefore, lose });
    const n3 = await p1.notes(DLG);
    ok(n3.shown.length === 1 && n3.shown[0].cls === 'bwho-lose' && !n3.problems.length, `③ the "will lose it" line is a real line: ${n3.shown.map((x) => x.h + ' px').join(', ')}, its glyph drawn, its sentence in its own span, inside the dialog`, n3.problems);
    await p1.shot('03-zh-dialog-draft', DLG);

    // ═══ ⑤ (set up before the save) a SECOND page at ≤ 768 px with the row open: mark its unchanged chip ═══
    console.log('— ⑤ a second page (≤ 768 px) holds the row open');
    const t2 = await (await fetch(`http://127.0.0.1:${CDP}/json/new?about:blank`, { method: 'PUT' })).json();
    const p2 = await pageOf(t2);
    await p2.load('zh', 700, 900);
    ok(await p2.openPanel(), '⑤ page 2 (700 px wide) shows the row');
    const p2chips0 = await chipsOf(p2, `${ROW} .bprof-who-chip`);
    const marked = await p2.ev(`(() => { const c = document.querySelector('${ROW} .bprof-who-chip[data-key="task:${TG.ops}"]'); if (!c) return false; c.__who_mark = 'kept'; document.querySelector('${ROW} .bprof-who').__who_mark = 'kept'; return true; })()`);
    ok(marked && p2chips0.map((c) => c.name).join('|') === '运维管理|Westcliff', `⑤ page 2 draws the list as chips (${p2chips0.map((c) => c.name).join(' · ')}); its 运维管理 chip is marked`, p2chips0);

    // ═══ ④ Save ⇒ ONE PATCH (session:<webui id> rows + base), the toast, the lease gone ═══
    console.log('— ④ Save');
    await p1.front();
    const baseRead = (await useNow()).base;
    await p1.ev(`document.querySelectorAll('.global-toast').forEach((t) => t.remove())`);
    ok(await p1.click(`${DLG} .bwho-footer .mounts-btn-primary`), '④ 保存 clicked');
    const toast = await until(() => p1.ev(`(() => { const t = [...document.querySelectorAll('.global-toast .global-toast-body')].pop(); return t ? t.textContent : null; })()`), 8000, 60);
    const sent = await patches(p1);
    const body = sent[sent.length - 1] || {};
    const whoSent = (body.use && body.use.who) || [];
    ok(sent.length === 1 && body.base === baseRead && body.use.mode === 'only' && whoSent.some((w) => w.kind === 'session' && w.session === SID.kaixu) && [TG.ops, TG.studio, TG.comp].every((id) => whoSent.some((w) => w.kind === 'task' && w.id === id)) && !whoSent.some((w) => w.key === KEY.west || w.session === SID.west), `④ ONE PATCH with the picked session as session:<webui id>, the three Task Groups and the base it read (${sent.length} sent)`, body);
    ok(toast && toast.startsWith('谁能使用 work：') && /运维管理/.test(toast) && /Kaixu 学习/.test(toast) && /不再使用 work|1/.test(toast), `④ the toast: "${toast}"`);
    const u1 = await useNow();
    ok(u1.use.mode === 'only' && u1.use.who.some((w) => w.kind === 'session' && w.key === KEY.kaixu) && !u1.usedBy.some((x) => x.key === KEY.west && x.leased), '④ the server holds the list (Kaixu 学习 by its KEY) and Westcliff\'s tab is gone', u1);
    await until(() => p1.ev(`!document.getElementById('browser-who-dialog')`), 4000);

    // ═══ ⑤ page 2: the unchanged chip is the SAME node; the rest fold into the dictionary's "+N more" ═══
    await p2.front();
    const p2done = await until(async () => { const c = await chipsOf(p2, `${ROW} .bprof-who-chip`); return c.length === 2 && c[1].key === 'task:' + TG.studio ? c : null; }, 10000, 150);
    const same = await p2.ev(`(() => { const c = document.querySelector('${ROW} .bprof-who-chip[data-key="task:${TG.ops}"]'); const cell = document.querySelector('${ROW} .bprof-who'); return { chip: !!c && c.__who_mark === 'kept', cell: !!cell && cell.__who_mark === 'kept' }; })()`);
    const more = await p2.text(`${ROW} .bprof-who-more`);
    ok(p2done && same.chip && same.cell && more === tr('zh', '+{n} more', { n: 2 }), `⑤ page 2 after the broadcast: ${p2done && p2done.map((c) => c.name).join(' · ')} + "${more}"; the 运维管理 chip and the cell are the SAME nodes (keyed in place)`, { p2done, same, more });
    await p2.shot('05-zh-page2-700', ROW);

    // ═══ ⑥ the 409 leg: a write between open and Save ⇒ the sentence, re-opened on the list as it is now ═══
    console.log('— ⑥ a write between open and Save');
    await p1.front();
    ok(await p1.click(`${ROW} .bprof-who-change`), '⑥ 更改… again');
    await until(() => p1.ev(`!!document.querySelector('${DLG} .pp-chip')`), 8000, 60);
    const u2 = await useNow();
    const w2 = await api('PATCH', `/api/browser/profiles/${WORK}`, { use: { mode: 'only', who: [{ kind: 'task', id: TG.ops }] }, base: u2.base });
    await p1.ev(`document.querySelectorAll('.global-toast').forEach((t) => t.remove())`);
    const n0 = (await patches(p1)).length;
    await p1.click(`${DLG} .bwho-footer .mounts-btn-primary`);
    const t409 = await until(() => p1.ev(`(() => { const t = [...document.querySelectorAll('.global-toast .global-toast-body')].pop(); return t ? t.textContent : null; })()`), 8000, 60);
    const reopened = await until(async () => { const c = await chipsOf(p1, `${DLG} .pp-chip`); return c.length === 1 && c[0].name === '运维管理' ? c : null; }, 8000, 100);
    ok(w2.status === 200 && t409 === tr('zh', 'The list changed while this dialog was open (another window, or an agent) — here it is as it is now; nothing was saved') && !!reopened && (await patches(p1)).length === n0 + 1, `⑥ Save over a moved list ⇒ "${t409}" and the dialog re-opened on the list as it is now (${reopened && reopened.map((c) => c.name).join(' · ')})`, { t409, reopened });
    const u3 = await useNow();
    ok(u3.use.who.length === 1 && u3.use.who[0].id === TG.ops, '⑥ …nothing of the stale draft was saved');

    // ═══ ⑦ the empty list refused in place; the remote sessions absent, the sentence present ═══
    console.log('— ⑦ the empty list; the remote sessions');
    const listNames = await p1.ev(`[...document.querySelectorAll('${DLG} .pp-list .pp-row .pp-name')].map((e) => e.textContent)`);
    const remoteLine = await p1.ev(`(() => { const l = document.querySelector('${DLG} .bwho-remote'); return l && getComputedStyle(l).display !== 'none' ? l.textContent : ''; })()`);
    ok(!listNames.includes('Remote box one') && !listNames.includes('Remote box two') && !listNames.includes('A shell') && listNames.includes('Westcliff') && remoteLine === tr('zh', 'Conversations on other machines are not listed — the Agent browser runs on this machine only.'), `⑦ the list has no session on another machine and no shell (${listNames.length} rows); the sentence: "${remoteLine}"`);
    await p1.click(`${DLG} .pp-chip[data-key="task:${TG.ops}"] .pp-chip-x`);
    await p1.frames();
    const n1 = (await patches(p1)).length;
    await p1.click(`${DLG} .bwho-footer .mounts-btn-primary`);
    await p1.frames();
    const refusal = await p1.ev(`(() => { const l = document.querySelector('${DLG} .bwho-refusal'); return l && getComputedStyle(l).display !== 'none' ? l.textContent.trim() : ''; })()`);
    ok(refusal === tr('zh', 'Pick All agents, or at least one conversation or Task Group.') && (await patches(p1)).length === n1 && (await p1.ev(`!!document.getElementById('browser-who-dialog')`)), `⑦ Save with no chip (not even All agents) is refused IN PLACE: "${refusal}" — no request, the dialog stays`);
    const n7 = await p1.notes(DLG);
    ok(n7.shown.some((x) => x.cls === 'bwho-refusal') && !n7.problems.length, `⑦ the refusal is a real line (${n7.shown.map((x) => x.cls + ' ' + x.h + ' px').join(', ')}), never over the remote line or the footer`, n7.problems);
    await p1.shot('07-zh-dialog-empty', DLG);

    // ═══ ⑩ ALL AGENTS picked (zh): beside a list, kept, restored ═══
    console.log('— ⑩ All agents picked beside a list (zh)');
    await p1.ev(`document.getElementById('browser-who-dialog')?.remove()`);
    const u10 = await useNow();
    const w10 = await api('PATCH', `/api/browser/profiles/${WORK}`, { use: { mode: 'only', who: [{ kind: 'task', id: TG.ops }] }, base: u10.base });
    ok(w10.status === 200, '⑩ the list is 运维管理 alone (written through the route)', w10.json);
    await p1.front();
    ok(await p1.click(`${ROW} .bprof-who-change`), '⑩ 更改…');
    await until(() => p1.ev(`!!document.querySelector('${DLG} .pp-chip')`), 8000, 60);
    const allRow = `${DLG} .pp-list .pp-row.pp-row-everyone`;
    const allFacts = await p1.ev(`(() => { const r = document.querySelector('${allRow}'); const first = [...document.querySelectorAll('${DLG} .pp-list > *')][0]; return r ? { first: first === r, name: r.querySelector('.pp-name').textContent, hint: (r.querySelector('.pp-hint') || {}).textContent || '', on: r.getAttribute('aria-selected'), disabled: r.getAttribute('aria-disabled') } : null; })()`);
    ok(allFacts && allFacts.first && allFacts.name === tr('zh', 'All agents') && allFacts.hint === tr('zh', 'every conversation, now and later') && allFacts.on === 'false' && allFacts.disabled === null, `⑩ the dialog's FIRST row: "${allFacts && allFacts.name}" · "${allFacts && allFacts.hint}", not picked, never greyed`, allFacts);
    ok(await p1.click(allRow), '⑩ ALL AGENTS clicked (a real mouse)');
    await p1.frames();
    const chips10 = await chipsOf(p1, `${DLG} .pp-chip`);
    const meaning10 = await p1.text(`${DLG} .bwho-meaning:not(.bwho-kept)`);
    const kept10 = await p1.ev(`(() => { const l = document.querySelector('${DLG} .bwho-kept'); return l && getComputedStyle(l).display !== 'none' ? l.textContent : ''; })()`);
    ok(chips10.map((c) => c.name).join('|') === `${tr('zh', 'All agents')}|运维管理` && meaning10 === tr('zh', 'Any of your conversations can use this browser and its logins — one browser, each conversation in its own tab.') && kept10 === tr('zh', 'The others you picked are kept for when you take All agents away.'), `⑩ the chips: ${chips10.map((c) => c.name).join(' · ')} (All first); the sentence "${meaning10}" and, on its own line, "${kept10}"`, { chips10, meaning10, kept10 });
    await p1.shot('11-zh-dialog-all', DLG);
    await p1.ev(`document.querySelectorAll('.global-toast').forEach((t) => t.remove())`);
    const n10 = (await patches(p1)).length;
    await p1.click(`${DLG} .bwho-footer .mounts-btn-primary`);
    const toast10 = await until(() => p1.ev(`(() => { const t = [...document.querySelectorAll('.global-toast .global-toast-body')].pop(); return t ? t.textContent : null; })()`), 8000, 60);
    const sent10 = (await patches(p1)).slice(n10);
    const b10 = sent10[0] || {};
    ok(sent10.length === 1 && b10.use && b10.use.mode === 'all' && J(b10.use.who) === J([{ kind: 'task', id: TG.ops }]) && toast10 === tr('zh', 'Who can use {label}: All agents', { label: 'work' }), `⑩ ONE PATCH {mode:'all', who:[运维管理]} — the list rides along, kept; the toast "${toast10}"`, { b10, toast10 });
    const u10b = await useNow();
    ok(u10b.use.mode === 'all' && u10b.use.who.length === 1 && u10b.use.who[0].id === TG.ops, '⑩ the server: every conversation may (all), 运维管理 KEPT beside it', u10b.use);
    const row10 = await until(async () => { const v = await p1.text(`${ROW} .bprof-who-all`); return v === tr('zh', 'All agents ({n} more rows)', { n: 1 }) ? v : null; }, 8000, 120);
    ok(!!row10, `⑩ the panel row reads "${row10}" — All first, the kept row counted`);
    ok(await p1.click(`${ROW} .bprof-who-change`), '⑩ 更改… again');
    await until(() => p1.ev(`!!document.querySelector('${DLG} .pp-chip')`), 8000, 60);
    const chips10b = await chipsOf(p1, `${DLG} .pp-chip`);
    ok(chips10b.map((c) => c.name).join('|') === `${tr('zh', 'All agents')}|运维管理`, `⑩ re-opened: ${chips10b.map((c) => c.name).join(' · ')} — All and the kept row picked`, chips10b);
    ok(await p1.click(`${DLG} .pp-chip[data-key="everyone:*"] .pp-chip-x`), '⑩ All\'s chip removed with its × (a real mouse)');
    await p1.frames();
    const n10b = (await patches(p1)).length;
    await p1.click(`${DLG} .bwho-footer .mounts-btn-primary`);
    await until(() => p1.ev(`!document.getElementById('browser-who-dialog')`), 8000, 60);
    const b10b = (await patches(p1)).slice(n10b)[0] || {};
    const u10c = await useNow();
    ok(b10b.use && b10b.use.mode === 'only' && u10c.use.mode === 'only' && J(u10c.use.who.map((w) => w.id)) === J([TG.ops]), '⑩ taking All away restores EXACTLY the kept list (only 运维管理) — never a silent loss of the rows', { b10b, use: u10c.use });

    // ═══ ⑧ the RECT CENSUS at 860 px (the panel) + the dialog at 1280 ═══
    console.log('— ⑧ the rect census');
    await p1.ev(`document.getElementById('browser-who-dialog')?.remove()`);
    const u4 = await useNow();
    const w8 = await api('PATCH', `/api/browser/profiles/${WORK}`, { use: { mode: 'only', who: [{ kind: 'task', id: TG.ops }, { kind: 'task', id: TG.studio }, { kind: 'task', id: TG.comp }, { kind: 'session', key: KEY.kaixu }, { kind: 'session', key: KEY.draft }, { kind: 'session', key: KEY.west }] }, base: u4.base });
    ok(w8.status === 200 && w8.json.profile.use.who.length === 6, '⑧ a six-row list written (three Task Groups, three conversations)', w8.json);
    await p1.front();
    await until(async () => (await p1.text(`${ROW} .bprof-who-more`)) === tr('zh', '+{n} more', { n: 2 }), 8000, 150);
    const winW = await p1.ev(`Math.round(document.querySelector('${ROW}').closest('.window').getBoundingClientRect().width)`);
    const r860 = await p1.rects({ pairs: [[`${ROW} .bprof-who`, '.bprof-who-chip, .bprof-who-more, button, .bprof-who-label'], ['.bprof-body', '.bprof-profile, .bprof-who']], viewport: true });
    const more860 = await p1.text(`${ROW} .bprof-who-more`);
    ok(winW >= 850 && winW <= 870 && r860.n >= 6 && !r860.problems.length && more860 === tr('zh', '+{n} more', { n: 2 }), `⑧ 860 px (the panel window ${winW} px): ${r860.n} parts inside their cells and the viewport, no sideways overflow; 4 chips + "${more860}"`, r860.problems);
    await p1.shot('08-zh-row-860', ROW);
    ok(await p1.click(`${ROW} .bprof-who-change`), '⑧ the dialog at 1280');
    await until(() => p1.ev(`!!document.querySelector('${DLG} .pp-chip')`), 8000, 60);
    const rDlg = await p1.rects({ pairs: [[DLG, '.pp-chip, button, .bwho-answer, .pp-input'], [`${DLG} .pp-list`, '.pp-row', { h: true }]], viewport: true });
    ok(!rDlg.problems.length && rDlg.n >= 20, `⑧ the dialog at 1280: ${rDlg.n} parts inside the dialog / the list and the viewport`, rDlg.problems);
    await p1.shot('08-zh-dialog-1280', DLG);
    await p1.ev(`document.getElementById('browser-who-dialog')?.remove()`);

    // ═══ ⑧ the dialog on a phone (360 × 740): picker rows ≥ 40 px, chips ≥ 36 px, nothing past the viewport ═══
    await p2.load('zh', 360, 740, true);
    await p2.ev(`(() => { window.app.openBrowserProfiles(); return true; })()`);
    await until(() => p2.ev(`!!document.querySelector('${ROW} .bprof-who-change')`), 10000, 100);
    await p2.ev(`(() => { const b = document.querySelector('${ROW} .bprof-who-change'); b.scrollIntoView({ block: 'center' }); return true; })()`);
    ok(await p2.click(`${ROW} .bprof-who-change`), '⑧ 更改… on the phone');
    await until(() => p2.ev(`!!document.querySelector('${DLG} .pp-chip')`), 8000, 60);
    const r360 = await p2.rects({ pairs: [[DLG, '.pp-chip, button, .bwho-answer, .pp-input'], [`${DLG} .pp-list`, '.pp-row', { h: true }]], viewport: false, minHeights: [[`${DLG} .pp-row`, 40], [`${DLG} .pp-chip`, 36]] });
    const dW = await p2.ev(`Math.round(document.querySelector('${DLG}').getBoundingClientRect().width)`);
    const docW = await p2.ev('document.documentElement.scrollWidth');
    ok(!r360.problems.length && dW <= 360 && docW <= 360, `⑧ 360 px: the dialog ${dW} px, the page ${docW} px wide; picker rows ≥ 40 px, chips ≥ 36 px, every part inside the dialog`, r360.problems);
    await p2.shot('08-zh-dialog-360', DLG);

    // ═══ ⑧ ja and en once each ═══
    for (const [lang, want] of [['ja', { title: 'work を使える会話', all: 'すべてのエージェント', change: '変更…', ph: '会話やタスクグループを追加…' }], ['en', { title: 'Who can use work?', all: 'All agents', change: 'Change…', ph: 'Add a conversation or Task Group…' }]]) {
      console.log(`— ⑧ ${lang}`);
      await p1.load(lang, 1280, 800);
      await p1.openPanel();
      const c = await p1.text(`${ROW} .bprof-who-change`);
      await p1.click(`${ROW} .bprof-who-change`);
      await until(() => p1.ev(`!!document.querySelector('${DLG} .pp-chip')`), 8000, 60);
      const got = { title: await p1.text(`${DLG} .dialog-header h3`), all: await p1.text(`${DLG} .pp-list .pp-row-everyone .pp-name`), change: c, ph: await p1.ev(`document.querySelector('${DLG} .pp-input').placeholder`) };
      const rL = await p1.rects({ pairs: [[DLG, '.pp-chip, button, .bwho-answer, .pp-input'], [`${DLG} .pp-list`, '.pp-row', { h: true }]], viewport: true });
      ok(J(got) === J(want) && !rL.problems.length, `⑧ ${lang}: ${J(got)}`, { got, want, problems: rL.problems });
      await p1.shot(`09-${lang}-dialog`, DLG);
      await p1.ev(`document.getElementById('browser-who-dialog')?.remove()`);
    }
    // ═══ ⑨ the phone (360 × 740) in zh / ja / en with BOTH notes shown — the verifier's shots: 0 px lines overlapping each
    // other and the remote line, the sentence cut at the screen's edge (zh "会关闭）", en "(th", ja "（その中") ═══
    console.log('— ⑨ the two notes on the phone, zh / ja / en');
    const at9 = await api('POST', '/api/browser/attach', { sessionId: SID.west, profile: 'work' });
    ok(at9.status === 200 && at9.json.lease, '⑨ Westcliff holds a tab in work again (the list admits it) — the lease the empty list would take away', at9.json);
    for (const lang of ['zh', 'ja', 'en']) {
      await p2.load(lang, 360, 740, true);
      await p2.ev(`(() => { window.app.openBrowserProfiles(); return true; })()`);
      await until(() => p2.ev(`!!document.querySelector('${ROW} .bprof-who-change')`), 10000, 100);
      await p2.ev(`(() => { const b = document.querySelector('${ROW} .bprof-who-change'); b.scrollIntoView({ block: 'center' }); return true; })()`);
      await p2.click(`${ROW} .bprof-who-change`);
      await until(() => p2.ev(`!!document.querySelector('${DLG} .pp-chip')`), 8000, 60);
      for (let i = 0; i < 12 && (await p2.ev(`document.querySelectorAll('${DLG} .pp-chip').length`)); i++) { await p2.click(`${DLG} .pp-chip .pp-chip-x`); await p2.frames(); }
      const nPatch = (await patches(p2)).length;
      await p2.click(`${DLG} .bwho-footer .mounts-btn-primary`);
      await p2.frames();
      const n9 = await p2.notes(DLG);
      const cls9 = n9.shown.map((x) => x.cls).join(',');
      ok(cls9 === 'bwho-lose,bwho-refusal' && !n9.problems.length && (await patches(p2)).length === nPatch, `⑨ ${lang} 360 px: both notes are real lines (${n9.shown.map((x) => x.h + ' px').join(' + ')}), wrapped inside the dialog, never over each other, the remote line or the footer — and no request was sent`, { shown: n9.shown, problems: n9.problems });
      await p2.shot(`10-${lang}-dialog-notes-360`, DLG);
      if (lang === 'zh') {
        // CONTROL (in the page): the pre-fix write — the sentence put into the glyph's span — is caught by the same judge
        const ctl9 = await p2.ev(`(() => { const n = document.querySelector('${DLG} .bwho-lose'); const ic = n.querySelector('.chan-ic'), tx = n.querySelector('.chan-note-text'); const keep = { ic: ic.innerHTML, tx: tx.textContent }; ic.textContent = tx.textContent; tx.textContent = ''; const r = (${NOTES.toString()})(${J(DLG)}); ic.innerHTML = keep.ic; tx.textContent = keep.tx; return r.problems; })()`);
        ok(ctl9.some((x) => /bwho-lose/.test(x)), `CONTROL: the pre-fix note (the sentence inside the glyph's span) fails the judge (${ctl9.slice(0, 3).join('; ')})`);
      }
      await p2.ev(`document.getElementById('browser-who-dialog')?.remove()`);
    }
    const errs = [...p1.errors, ...p2.errors].filter((e) => !/ResizeObserver/.test(e));
    ok(!errs.length, `no page exception on either page (${errs.length})`, errs.slice(0, 3));
  } catch (e) { ok(false, 'the legs threw', e && (e.stack || e.message)); }
  finally {
    try { for (const id of Object.values(SID)) if (id) ctl.send(J({ type: 'kill', sessionId: id })); } catch { }
    await sleep(500);
    try { ctl.close(); } catch { }
  }
})();

cleanup();
console.log(fail ? `\n${fail} FAILED (${pass} passed${skipped ? ', ' + skipped + ' skipped' : ''})` : `\nALL PASS (${pass}${skipped ? ', ' + skipped + ' skipped' : ''})`);
process.exit(fail ? 1 : 0);
