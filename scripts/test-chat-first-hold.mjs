#!/usr/bin/env node
// THE FIRST HOLD UP INTO UNLOADED HISTORY, AND THE SETTLE WATCH's LEGS — test-chat-paging's §4h, MOVED TO A SUITE OF ITS OWN
// (主开发 r4333, 2026-11-25: test-chat-paging read 810–900 s a try on the test machine against its 900 s budget and 852 s on the
// hosted runner; one more placed hold would have taken it over). THE SECTION's LINES ARE MOVED VERBATIM (scripts/test-chat-paging.mjs
// at 13ff7060b, its lines 706–1362: the law per notch and its controls, the zooms, the search scenes, the carry with a pending
// change, the runs rebuild, the race, the continuous scroll, the growing row, the card at the edge, the one reader, the stamped
// write, the card replaced above) — nothing loosened, no leg dropped. WHAT THE SECTION STANDS ON is carried beside it: the §1c huge compact-mode fixture (scripts/huge-transcript-fixture.mjs,
// the same call), §4c's gesture driver (LIST_H, CADENCE, OPEN_HUGE, TRIM_WITNESS_SOURCE, runGestures — copied verbatim, §4h's hooks
// in it), the page boot (pageReady, verbatim) and §5's census of the real home (its fixture check reads the §1c file here).
// THE BOOT is the suites' one hub boot (scripts/hub-boot.mjs — test-architecture §57c: a new suite boots no hub outside it, and
// §57b: the helper ends everything the hub started): a minted root holds the worktree and the isolated home with the fixture. The
// hub serves the tree's OWN built client (the heavy tier builds the tree first, ci.mjs --heavy; by hand: `npm run build` first),
// so this suite builds nothing itself (test-ci-gate §2q: no suite builds src/client.js its own way outside its closed list).
// HEAVY: a scratch hub + headless Chrome over raw CDP, the 48 MB fixture, about 30 fresh pages.
// Run: node scripts/test-chat-first-hold.mjs
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, fixtureSid, ONBOARDED_SOURCE, vncEnv, CHROME_STORE, CHROME_QUIET } from './scratch.mjs';
import { mintRoot, startHub, strippedEnv } from './hub-boot.mjs';
import { writeHugeTranscript } from './huge-transcript-fixture.mjs';
import { judgeGesture, formatGesture, SNAP_SOURCE, RING_SINCE_SOURCE, WHEEL_POINT_SOURCE, JUMP_SLACK_VIEWPORTS } from './paging-gesture-rules.mjs';
import { waitPageTarget } from './cdp-page-target.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port (test-architecture §57 — startHub refuses an env without them)
const require = createRequire(import.meta.url);
const { fixtureLitter } = require('../src/fixture-guard.js');

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }

const [PORT, CDP_PORT] = await freePorts(2); // per-process (scripts/scratch.mjs)
const root = mintRoot('chat-first-hold'), wt = path.join(root, 't');
const CWD = scratch('chathold-test'); // the same length as test-chat-paging's scratch cwd: the fixture's records are its records
const SID3 = fixtureSid('3'); // the HUGE COMPACT-MODE transcript (inc-mubvu3a4-x8sb) — test-chat-paging §1c
// ISOLATED $HOME (test-chat-paging's essay, 2026-09-09): the hub discovers only what lives under its own home, so the fixture goes
// there — inside the minted root, which startHub checks and the helper ends — and the census at the end proves the real one untouched.
const fakeHome = path.join(root, 'home'); for (const d of ['.claude/projects', '.claude/sessions', '.config', '.vibespace']) fs.mkdirSync(path.join(fakeHome, d), { recursive: true });
const PROJ = path.join(fakeHome, '.claude', 'projects', CWD.replace(/[/._]/g, '-'));
const REAL_PROJECTS = path.join(os.homedir(), '.claude', 'projects');
const realBefore = (() => { try { return new Set(fs.readdirSync(REAL_PROJECTS)); } catch { return new Set(); } })();
let passed = 0, failed = 0;
const check = (n, c, e) => { if (typeof c !== 'boolean') throw new TypeError(`check(${n}): the condition must be a boolean`); if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e ? '\n    ' + e : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(PROJ, { recursive: true });
fs.mkdirSync(CWD, { recursive: true });

// ── THE HUGE COMPACT-MODE SESSION (test-chat-paging §1c, the same generator and the same call) ──
const HUGE_TARGET_BYTES = Number(process.env.VS_HUGE_FIXTURE_MB || 48) * 1048576;
{
  const h = await writeHugeTranscript({ file: path.join(PROJ, `${SID3}.jsonl`), sid: SID3, cwd: CWD, targetBytes: HUGE_TARGET_BYTES });
  console.log(`  huge fixture: ${h.lines} lines, ${h.turns} turns, ${h.images} images, ${(h.bytes / 1048576).toFixed(1)} MB (${h.kbPerLine.toFixed(2)} KB/line) in ${h.ms} ms`);
}

// ── THE HUB AND CHROME (the hub through scripts/hub-boot.mjs; Chrome as test-chat-paging starts it) ──
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'package.json', 'server.js']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
const hub = startHub({ root, tree: wt, port: PORT, env: { ...strippedEnv(), ...VNC_ENV, HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VS_NO_REAL_CLI: '1' } });
const chromeDir = scratch('chathold-chrome');
const chrome = spawn(CHROME, [...CHROME_QUIET, ...CHROME_STORE, '--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--window-size=1920,1000', // the owner's width (1920×963): a compact row's wrap width decides the px per card, which is what the §1c shape is about
  '--disable-background-timer-throttling', `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore' });
process.on('exit', () => { try { chrome.kill('SIGKILL'); } catch { } try { fs.rmSync(chromeDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { } });
check('the scratch hub answered', await hub.ready({ ms: 90000 }), String(hub.log() || '').slice(-600));

const WebSocket = require('ws');
let target = null;
target = await waitPageTarget(CDP_PORT, { polls: 40, everyMs: 250, child: chrome }); // B-fcae: the one waiter (a miss always waits)
const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => ws.on('open', r));
let seq = 0; const pend = new Map();
ws.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') { try { console.log('[pageEX]', m.params.exceptionDetails?.exception?.description?.slice(0, 250)); } catch {} }
});
const cdp = (method, params = {}) => new Promise((res) => { const id = ++seq; pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const evaljs = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400));
  return r.result?.result?.value;
};
await cdp('Runtime.enable');
await cdp('Page.enable');
// every navigation below (pageReady's included) runs with the wizard pre-dismissed (test-architecture §47)
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
// VS_PAGING_UI_FONT=<family> (a debugging aid, never the gate): the UI's system font forced on every page —
// 'DejaVu Sans' is the Actions runner's fallback for `system-ui` (this box resolves Noto Sans), and with it
// the unfixed §4b reproduces the mirror's `481/1179 1087/629 1391/79 807/0` byte for byte
if (process.env.VS_PAGING_UI_FONT) await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = ${JSON.stringify(`body { font-family: ${JSON.stringify(process.env.VS_PAGING_UI_FONT)} !important; }`)}; document.head.appendChild(st); });` });
const pageReady = async (port, label, ms = 150000) => {
  const end = Date.now() + ms; let navs = 0;
  while (Date.now() < end) {
    await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/` }); navs++;
    const until = Math.min(end, Date.now() + 30000);
    while (Date.now() < until) { if (await evaljs('!!(window.app && window.app.ready && window.app.wm && window.app.viewSession)').catch(() => false)) return true; await sleep(400); }
  }
  check(`${label}: the app booted on the page (${navs} navigation(s) in ${Math.round(ms / 1000)} s)`, false, 'the page never exposed window.app — the legs on it are not run');
  return false;
};
await pageReady(PORT, 'boot');
await sleep(1500);

// ── THE GESTURE DRIVER (test-chat-paging §4c's: its constants, the view's open, the trim witness and runGestures — copied verbatim, §4h's hooks in it) ──
const LIST_H = 650;   // A CEILING the window is shrunk to (OPEN_HUGE shrinks only a taller list; a shorter one stays and the geometry check names it). THE SECTION's OWN GEOMETRY (主开发 r4847): the list stands 650 px tall on every machine — the hosted runner's own height, below the kit's (706) and the box's — so no leg reads a distance its machine happens to give (test-chat-paging's §4c keeps the owner's 790)
const CADENCE = { slow: { notches: 1, deltaY: 120, gap: 0, settle: 1500 }, mid: { notches: 6, deltaY: 120, gap: 70, settle: 1500 }, fast: { notches: 4, deltaY: 700, gap: 30, settle: 2000 }, hold: { notches: 40, deltaY: 300, gap: 100, settle: 2400 }, shortHold: { notches: 10, deltaY: 300, gap: 100, settle: 700 }, tail1: { notches: 1, deltaY: 300, gap: 0, settle: 900 }, tail2: { notches: 2, deltaY: 300, gap: 150, settle: 900 }, tail3: { notches: 3, deltaY: 300, gap: 150, settle: 900 } };
const OPEN_HUGE = (sid, cwd, title) => `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  if (!window.app || typeof window.app.viewSession !== 'function') return { ok: false, why: 'no app on this page (see the boot check)' };
  window.app.viewSession(${JSON.stringify(sid)}, ${JSON.stringify(cwd)}, ${JSON.stringify(title)});
  let v = null, w = null, n = 0, armed = false;
  for (let i = 0; i < 300; i++) {
    // by the view's OWN id — the sidebar renames the window by the first-user-message rule
    const hit = [...window.app.sessions.entries()].find(([, cv]) => cv && cv.sessionId === 'view-' + ${JSON.stringify(sid)});
    v = hit ? hit[1] : null; w = hit ? window.app.wm.windows.get(hit[0]) : null;
    n = v && v._messageList ? v._messageList.querySelectorAll('.chat-msg').length : 0;
    armed = !!(v && v._gapMinimapActive);
    if (n > 10 && armed) break;
    if (n > 10 && i > 100) break;
    await sleep(400);
  }
  if (!v || n <= 10) return { ok: false, n, armed, total: v ? v._total : null };
  const ws = document.getElementById('workspace') || document.querySelector('.workspace');
  const wr = ws.getBoundingClientRect();
  const el = w.element; el.style.left = '0px'; el.style.top = '0px'; el.style.width = wr.width + 'px'; el.style.height = wr.height + 'px';
  if (w.onResize) try { w.onResize(); } catch {}
  await sleep(300);
  const list = v._messageList;
  const d = list.clientHeight - ${LIST_H};
  if (d > 0) { el.style.height = (wr.height - d) + 'px'; if (w.onResize) try { w.onResize(); } catch {} }
  await sleep(300);
  // the LIVE window's content-visibility (a read-only viewer runs with it off)
  v._readOnly = false; v._container.classList.remove('chat-no-content-visibility');
  try { await document.fonts.ready; } catch {} // the self-hosted mono faces (fonts.css, font-display: swap) are in before anything is measured
  await sleep(2500); // initial render + fold + attach fill settle
  window.__v = v; window.__list = list;
  const r = list.getBoundingClientRect();
  return { ok: true, armed, n: list.querySelectorAll('.chat-msg').length, ch: list.clientHeight, sh: list.scrollHeight, st: list.scrollTop, ws: v._windowStart, we: v._windowEnd, total: v._total, gap: v._gapBounds, cv: !v._container.classList.contains('chat-no-content-visibility'), compact: v._container.classList.contains('chat-compact'), rect: { x: r.x, y: r.y, w: r.width, h: r.height } };
})()`;
const TRIM_WITNESS_SOURCE = `(() => {
  const v = window.__v; if (!v || v.__trimWitnessed) return 0;
  const orig = v._trimEdge;
  v._trimEdge = function (side) {
    try {
      const list = this._messageList, id = window.__pgReader;
      const el = id ? list.querySelector(':scope > [data-msg-id="' + CSS.escape(id) + '"]') : null;
      const rec = { side, st: Math.round(list.scrollTop), sh: list.scrollHeight, ch: list.clientHeight, zone: (() => { const z = this._keepZone(); return [Math.round(z.top), Math.round(z.bottom)]; })(), reader: !!el };
      if (el) {
        const els = [...list.querySelectorAll(':scope > .chat-msg:not(.chat-gap-msg)')];
        const i = els.indexOf(el), pos = this._cardPositions(els)[i];
        let zeros = 0; for (let j = Math.max(0, i - 40); j <= i; j++) if (els[j].offsetHeight === 0 && getComputedStyle(els[j]).display !== 'none') zeros++;
        Object.assign(rec, { idx: i, of: els.length, top: el.offsetTop, h: el.offsetHeight, read: pos && [Math.round(pos.top), Math.round(pos.bottom)], cv: el.style.contentVisibility || '-', cis: el.style.containIntrinsicSize || '-', zeroAbove: zeros });
      }
      window.__trimWitness && window.__trimWitness.push(rec);
    } catch (e) { window.__trimWitness && window.__trimWitness.push({ err: String(e).slice(0, 120) }); }
    const n = orig.call(this, side);
    if (window.__trimWitness?.length) window.__trimWitness[window.__trimWitness.length - 1].removed = n;
    return n;
  };
  v.__trimWitnessed = true;
  return 1;
})()`;
const runGestures = async (plan, label) => {
  const opened = await evaljs(OPEN_HUGE(SID3, CWD, 'huge test ' + label));
  console.log(`  [${label}] opened:`, JSON.stringify(opened));
  if (!opened?.ok) return { opened, rows: [] };
  const rect = opened.rect;
  const cx = Math.round(rect.x + rect.w / 2), cy = Math.round(rect.y + rect.h / 2);
  const snap = (topIdBefore = null, topOffBefore = 0) => evaljs(`(${SNAP_SOURCE})(${JSON.stringify(topIdBefore)}, ${topOffBefore})`);
  // by SEQ, never by index: the ring splices 600→400 mid-run and an index mark taken before the splice reads nothing after it (verifier r1)
  const ringSince = (mark) => evaljs(RING_SINCE_SOURCE(mark));
  const rows = [];
  // THE TRIM WITNESS (B-1192): a downward gesture that lost the reader's card
  // failed once per heavy run with nothing but the ring's tag counts to go on.
  // Every trim now records, BEFORE it decides, where the reader's card (the
  // gesture's top card) is and how the trim's own position read places it —
  // printed only on a "gone from the DOM" violation, so the next red carries
  // its geometry. Suite-side, read-only: it never changes a decision.
  await evaljs(TRIM_WITNESS_SOURCE);
  for (const [name, dir, speed] of plan) {
    if (dir === 'eval') { console.log(`    ${name.padEnd(14)} ${JSON.stringify(await evaljs(speed))}`); continue; }   // a SETUP step (§4h's blinded part)
    if (dir === 'jump') {
      // a SETUP step, not a judged gesture: the minimap's own jump (jumpToIndex) to a
      // message index — used to reach the start of the registered tail cheaply
      const before = await snap(); const mark = before.ringSeq;
      await evaljs(`(async () => { await window.__v.jumpToIndex(${Number(speed) || 0}); return true; })()`);
      await sleep(2500);
      const after = await snap(); const ring = await ringSince(mark);
      console.log(`    ${name.padEnd(14)} jump → idx ${speed}: st ${before.st}→${after.st} ws ${before.ws}→${after.ws} we ${before.we}→${after.we} pin ${before.pin}→${after.pin} gapAbove=${after.gapAbove} gapCursor=${after.gapCursor} ring=${ring.length}`);
      continue;
    }
    if (dir === 'btn') {
      const before = await snap(); const mark = before.ringSeq;
      await evaljs(`(() => { const b = window.__v._scrollBtn; if (b) b.click(); return !!b; })()`);
      await sleep(2500);
      const after = await snap(before.topId, before.topOff); const ring = await ringSince(mark);
      const row = { name, dir, wheelPx: 0, before, after, ring }; row.verdict = judgeGesture(row); rows.push(row);
      console.log('    ' + formatGesture(row, row.verdict));
      continue;
    }
    const c = CADENCE[speed];
    const before = await snap(); const mark = before.ringSeq;
    await evaljs(`(() => { window.__pgReader = ${JSON.stringify(before.topId)}; window.__trimWitness = []; return 1; })()`);
    // over a PLAIN point of the viewport (never a card's own scroll box — that box would take the notches)
    const pt = (await evaljs(WHEEL_POINT_SOURCE(dir, c.notches * c.deltaY))) || { x: cx, y: cy, moved: 0 };
    const reads = globalThis.__notchReads && name === 'gap-up-hold-1' ? globalThis.__notchReads : null;   // §4h's law, per notch
    if (reads) reads.push(await evaljs(NOTCH_READ));
    if (reads && globalThis.__firstNotchUntil) await evaljs('(() => { const R = window.__ral; if (R) { R.armed = 1; R.landed = 0; R.runs = 0; R.between = []; } const G = window.__grow; if (G) { G.armed = 1; G.landed = 0; } return 1; })()');   // §4h (r3822 / r3898): armed at the hold's start
    for (let i = 0; i < c.notches; i++) {
      if (reads && i > 0) reads.push(await evaljs(NOTCH_BEFORE));   // §4h (r4518): the read right before the notch — its own baseline, once the page is quiet
      await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: pt.x, y: pt.y, deltaX: 0, deltaY: dir === 'up' ? -c.deltaY : c.deltaY });
      if (c.gap) await sleep(c.gap);
      // §4h (主开发 r3822): THE FIRST NOTCH HELD until a placed condition — the race PLACED, never load (law 2)
      if (reads && i === 0 && globalThis.__firstNotchUntil) { const t = Date.now() + 4000; while (Date.now() < t && !(await evaljs(globalThis.__firstNotchUntil))) await sleep(20); }
      if (reads) reads.push(await evaljs(NOTCH_READ));
    }
    await sleep(c.settle);
    const after = await snap(before.topId, before.topOff); const ring = await ringSince(mark);
    const row = { name, dir, speed, wheelPx: c.notches * c.deltaY * (dir === 'up' ? -1 : 1), before, after, ring, pointerMoved: pt.moved ? 1 : 0, wheelFallback: pt.fallback ? 1 : 0, pt };
    row.verdict = judgeGesture(row); rows.push(row);
    const tags = {}; for (const e of ring) tags[e.tag] = (tags[e.tag] || 0) + 1;
    if (row.verdict.reasons.some((x) => /gone from the DOM/.test(x))) {
      const w = await evaljs('window.__trimWitness || []');
      console.log(`      [evidence] reader ${before.topId} at ${before.topOff}px before the gesture; trims (reader as the trim read it): ${JSON.stringify(w)}`);
      console.log(`      [evidence] ring: ${JSON.stringify(ring.filter((e) => /^(trim|pageDown|pageUp|extend|anchorLost|wheelCarry|gapDrop|scroll$)/.test(e.tag))).slice(0, 3000)}`);
    }
    console.log('    ' + formatGesture(row, row.verdict) + (row.pointerMoved ? '  [pointer moved off a nested scroller]' : '') + (row.wheelFallback ? `  [NO plain point: wheel at the centre over ${pt.under || '?'} — ⑤ not judged; ${pt.boxes} scroll boxes in the list]` : '') + (row.verdict.ok || row.wheelFallback ? '' : `  [wheel at ${pt.x},${pt.y} over ${pt.under || '?'}; scroll boxes in the list: ${pt.boxes ?? '?'}]`) + '  ring: ' + Object.entries(tags).map(([k, v]) => k + (v > 1 ? '×' + v : '')).join(' '));
  }
  return { opened, rows };
};

// ── 4h. THE FIRST HOLD UP INTO UNLOADED HISTORY (主开发 r2251 / r2395; the block's hosted red: gap-up-hold-1 read 1088 px
// against the 1059 px slack). THE LAW: THE CARD A PERSON IS READING STAYS WHERE IT IS WHEN HISTORY ARRIVES OR SETTLES ABOVE
// IT; every notch moves the view exactly its own distance, once. On a FRESH page (no slab row measured yet) the minimap's
// jump to message 0, then the 40-notch hold up into the seek gap, read PER NOTCH: before each notch the card at the viewport's
// top (the reading line) and its offset, after it the same card — in the frame the person saw (after its observers and its
// paint) — moved exactly the notch's distance (NOTCH_TOL_PX). Until the slab lands the notches are carried (the card does
// not move); over those notches and the landing the card moved exactly their sum, once. Rows that grow BELOW the reading line
// move nothing read there and are not counted (the original card's displacement at the hold's end, which counts them, is
// printed and judged by ①'s slack only). Measured before the cure (Chrome 154, the first machine): the range's end at the
// insert +253 px, the slab's rows settling above the reading line +209 / +258 px — some answered by the browser's own scroll
// anchoring, the rest by no one. A CONTROL A PART, on the same build, blinded on the view's instance before the jump:
// (1') no reader read at the insert (_gapReaderCard → null: the carry lands whole); (2) the pair — the settle watch blinded
// (the browser's anchoring alone) and the settle answered beside the browser's anchoring (overflow-anchor left on: answered
// twice): a browser that answers none reddens the first, one that answers all the second; Chrome 154 answers some — both red.
const NOTCH_TOL_PX = 8;   // the law says 0; this is sub-pixel heights and the device pixel scrollTop lands on
// THE LAW's READS (主开发 r4518 / r4599 — kit runs 3ad7e5c76 and e5983338f, try 1 each: −258 px at one notch, a row the notch before
// had brought in taking its real height after the leg's one read, booked against the next notch). THE ONE LAW (r4599), for the landing
// and every notch after it: WHAT THE PERSON HAD ON THE SCREEN BEFORE A NOTCH STANDS STILL while the rows that notch has just brought in
// take their real height; once that is over, the card at the top stands. The product's rule is that law with a clock (the line of
// before the notch for GAP_SETTLE_RECENT_MS, then the view's top), so the leg judges the window AS THE PRODUCT HAS IT:
// · each notch from a read of its own right before it (once the page is QUIET: two frames alike in the list's height and position,
//   every picture in view loaded; bounded, counted when it is not) to its FIRST PAINTED FRAME, on the card read before it;
// · the SETTLE after that, until the read before the next notch, labelled by the time of its height changes from the notch (the leg's
//   own ResizeObserver): inside the window → the card read before the notch stands; after it → the card at the top stands; no change
//   → the card read before the notch stands (a runs rebuild keeps it, r3822); changes on both sides → one of the two stands, said.
const WINDOW_MS = 150, WINDOW_MARGIN_MS = 15;   // the product's GAP_SETTLE_RECENT_MS (chat-view-seek.js), read with a margin
const QUIET = `async (list) => { const t0 = performance.now(); let prev = null;
  for (;;) { await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    const L = list.getBoundingClientRect(); let pend = 0;
    for (const i of list.querySelectorAll('img')) { if (i.complete) continue; const r = i.getBoundingClientRect(); if (r.bottom > L.top && r.top < L.bottom) pend++; }
    const sig = list.scrollHeight + ':' + Math.round(list.scrollTop);
    if (!pend && sig === prev) return Math.round(performance.now() - t0);
    prev = sig; if (performance.now() - t0 > 3000) return -1; } }`;
const TOP_CARD = `(list, lt) => { for (const c of list.children) { const cl = c.classList; if (c._isSeekSentinel || !cl || !cl.contains('chat-msg') || cl.contains('chat-run-header') || cl.contains('chat-run-footer')) continue; const r = c.getBoundingClientRect(); if (r.height > 0 && r.bottom > lt + 0.5) return c; } return null; }`;
// before a notch: the notch before it CLOSED (its card read before it, its settle), then this notch's card read before it and its arm:
// on the notch's own scroll the clock starts; one painted frame later, the notch's own read (that card, and the card now at the top)
const NOTCH_BEFORE = `(async () => {
  const v = window.__v, list = window.__list, waited = await (${QUIET})(list), lt = list.getBoundingClientRect().top;
  const at = (e) => (e && e.isConnected ? e.getBoundingClientRect().top - lt : null);
  const W = window.__law || (window.__law = { last: new WeakMap(), ro: null, period: null, x: null });
  if (!W.ro) W.ro = new ResizeObserver((es) => { const P = W.period; for (const e of es) { const el = e.target, h = el.offsetHeight, was = W.last.get(el); W.last.set(el, h); if (P && P.live && was !== undefined && h !== was) P.dts.push(Math.round(performance.now() - P.notchAt)); } });
  for (const el of list.children) if (!el._isSeekSentinel && !W.last.has(el)) { W.last.set(el, el.offsetHeight); W.ro.observe(el); }
  const X = W.x, P = W.period;
  const prev = X ? { xAt: X.off, xNow: at(X.el), painted: P ? P.painted : 0, pX: P && P.painted ? P.xAtP : null, tAt: P && P.painted ? P.topAtP : null, tNow: P && P.painted ? at(P.top) : null, paintAt: P ? P.paintAt ?? null : null, dts: P ? P.dts.filter((d) => P.paintAt == null || d > P.paintAt) : [] } : null;
  if (P) P.live = 0;
  const top = (${TOP_CARD})(list, lt);
  W.x = top ? { el: top, off: at(top) } : null; W.lineBefore = list.scrollTop;
  window.__notchTop = top;   // the card at the reading line before this notch (the placed legs read it)
  const Q = W.period = { notchAt: 0, painted: 0, live: 0, dts: [], top: null };
  if (W.arm) list.removeEventListener('scroll', W.arm);
  // read AFTER the frame has rendered (its ResizeObserver answers in): a read inside rAF forces a layout before the frame's answers —
  // a state no eye sees (the kit's de5f3e90b: +418 at the read, −418 in the settle, every try)
  const arm = W.arm = () => { list.removeEventListener('scroll', arm); W.arm = null; Q.notchAt = performance.now(); Q.live = 1;
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => { const lt2 = list.getBoundingClientRect().top, t2 = (${TOP_CARD})(list, lt2);
      Q.paintAt = Math.round(performance.now() - Q.notchAt); Q.painted = 1; Q.xAtP = W.x && W.x.el.isConnected ? W.x.el.getBoundingClientRect().top - lt2 : null;
      Q.top = t2; Q.topAtP = t2 ? t2.getBoundingClientRect().top - lt2 : null; }, 0))); };
  list.addEventListener('scroll', arm, { passive: true });
  // THE LATE ROW (r4540 / r4599's first case, on the wheel): armed on the coming notch's own scroll; one painted frame after it, the row
  // between the card then at the top and the card read before the notch takes its real height — both cards read on the screen
  const landedNow = (v._traceRing || []).some((e) => e.tag === 'gapUp:done');
  const K = window.__lateRow;
  if (K && K.p1 != null && K.p2 == null && (K.bAfter = (K.bAfter || 0) + 1) >= 2) { K.p2 = K.held && K.held.isConnected ? Math.round(at(K.held)) : null; K.q2 = K.ck && K.ck.isConnected ? Math.round(at(K.ck)) : null; }   // after the NEXT notch (the second read before a notch since the row grew)
  if (K && landedNow && !K.armed && ++K.n >= K.at && top) {
    K.armed = 1; K.held = top;
    // its starting point is read at the PAINTED frame (rAF, then setTimeout 0 — 主开发 r5080), the growth in the next frame
    const once = () => { list.removeEventListener('scroll', once); const t0 = performance.now(); requestAnimationFrame(() => setTimeout(() => {   // the notch painted once
      const lt2 = list.getBoundingClientRect().top, ck = (${TOP_CARD})(list, lt2); let R = null;
      if (ck && ck !== K.held && K.held.isConnected) for (let el = ck.nextElementSibling; el && el !== K.held; el = el.nextElementSibling) { const cl = el.classList; if (cl && cl.contains('chat-msg') && !cl.contains('chat-run-header') && !cl.contains('chat-run-footer') && el.offsetParent !== null && el.offsetHeight >= 8) { R = el; break; } }
      if (!R) { K.misses = (K.misses || 0) + 1; K.why = 'no row between the card now at the top and the card read before the notch (' + K.misses + ' notch(es) tried)'; K.armed = 0; return; }
      K.why = null;
      const seq0 = (v._traceRing || []).length ? v._traceRing[v._traceRing.length - 1].seq : 0, pos = (e) => Math.round(e.getBoundingClientRect().top - list.getBoundingClientRect().top);
      K.ck = ck; K.p0 = pos(K.held); K.q0 = pos(ck);
      requestAnimationFrame(() => {   // the frame of the growth
        if (!K.held.isConnected || !R.isConnected) { K.detached = (K.detached || 0) + 1; K.why = 'the card read before the notch or the row was detached before the growth (' + K.detached + ' time(s))'; K.armed = 0; return; }
        K.dt = Math.round(performance.now() - t0); const h0 = R.offsetHeight;
        const pad = document.createElement('div'); pad.style.height = K.px + 'px'; R.appendChild(pad); K.g = R.offsetHeight - h0;
        requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => { K.p1 = K.held.isConnected ? pos(K.held) : null; K.q1 = ck.isConnected ? pos(ck) : null;
          K.answered = (v._traceRing || []).filter((e) => e.seq > seq0 && e.tag === 'gapUp:settle').map((e) => Math.round(e.px)); }, 0)));
      });
    }, 0)); };
    list.addEventListener('scroll', once, { passive: true });
  }
  return { kind: 'b', prev, st: Math.round(list.scrollTop), sh: list.scrollHeight, landed: landedNow ? 1 : 0, waited };
})()`;
// after a notch: the page made quiet (the law reads the notch at its first painted frame and the settle at the next read before)
const NOTCH_READ = `(async () => {
  if (!window.__law) return await ${NOTCH_BEFORE};   // the hold's first read: the read before its first notch
  const v = window.__v, list = window.__list, waited = await (${QUIET})(list);
  return { kind: 'a', st: Math.round(list.scrollTop), sh: list.scrollHeight, landed: (v._traceRing || []).some((e) => e.tag === 'gapUp:done') ? 1 : 0, waited };
})()`;
const notchLaw = (reads, notchPx, zoomed = false) => {
  const ns = reads.filter((r) => r.kind === 'b' && r.prev).map((r) => {
    const p = r.prev, notch = p.painted ? (p.pX == null || p.xAt == null ? null : p.pX - p.xAt) : (p.xNow == null || p.xAt == null ? null : p.xNow - p.xAt);
    const held = p.painted && p.xNow != null && p.pX != null ? p.xNow - p.pX : (p.painted ? null : 0), top = p.painted && p.tNow != null && p.tAt != null ? p.tNow - p.tAt : (p.painted ? null : 0);
    const inside = p.dts.filter((d) => d <= WINDOW_MS - WINDOW_MARGIN_MS).length, after = p.dts.filter((d) => d >= WINDOW_MS + WINDOW_MARGIN_MS).length, edge = p.dts.length - inside - after;
    const label = !p.dts.length ? 'none' : edge ? 'edge' : inside && after ? 'both' : inside ? 'inside' : 'after';
    const settle = label === 'after' ? top : label === 'edge' || label === 'both' ? [held, top].filter((x) => x != null).reduce((m, x) => (m == null || Math.abs(x) < Math.abs(m) ? x : m), null) : held;
    return { notch, settle, label, held, top, landed: r.landed, painted: p.painted };
  });
  const L = ns.findIndex((x) => x.landed);
  if (L < 0) return { ok: false, why: 'no slab landed during the hold', ns };
  // THE LANDING's own settle, before the person's first scroll: the product holds the landing reader's line with no clock (r3898 — the
  // seed), so it is judged on the card read before the carried notches whatever its time
  ns[L].label = 'landing'; ns[L].settle = ns[L].held;
  const lost = ns.filter((x) => x.notch == null || (x.painted && x.settle == null)).length;
  // THE NOTCH's OWN DISTANCE ON SCREEN: at a chat font size or a UI scale other than 1 a notch moves the view by its px over
  // the zoom, so there the law reads the median of the notches after the landing (every notch moves alike — a per-notch bias
  // under a zoom is then not seen by `worst`; the wheel's unit is pinned by the landing's `carried`) — at zoom 1, the notch's px
  const after = ns.slice(L + 1).map((x) => x.notch).filter((x) => x != null).sort((a, b) => a - b);
  const med = after.length >= 5 ? after[after.length >> 1] : notchPx;
  const np = zoomed && Math.abs(med - notchPx) <= notchPx / 2 ? med : notchPx;   // the median ONLY under a zoom: at 1 the notch is its own px (a uniform per-notch error stays red there)
  // up to the landing: the carried notches land exactly once — on the card read before them, through the landing's own settle
  const carried = ns.slice(0, L + 1).reduce((m, x) => m + (x.notch || 0) + (x.settle || 0), 0) - np * (L + 1);
  const extras = ns.slice(L + 1).map((x) => (x.notch == null ? null : x.notch - np)), settles = ns.slice(L + 1).map((x) => x.settle);
  const worst = extras.concat(settles).reduce((m, x) => (x != null && Math.abs(x) > Math.abs(m) ? x : m), 0);
  const r1 = (xs) => xs.map((x) => (x == null ? 'gone' : Math.round(x)));
  const labels = {}; for (const x of ns) labels[x.label] = (labels[x.label] || 0) + 1;
  const unquiet = reads.filter((r) => r.waited === -1).length, maxWait = reads.reduce((m, r) => Math.max(m, r.waited || 0), 0);
  return { ok: !lost && Math.abs(carried) <= NOTCH_TOL_PX && Math.abs(worst) <= NOTCH_TOL_PX, L, notch: Math.round(np * 10) / 10, carried: Math.round(carried), worst: Math.round(worst), lost, extras: r1(extras), settles: r1(settles), labels, unquiet, maxWait };
};
// B-3e8b's remainder (主开发 r3822): A RUNS REBUILD WHILE THE SLAB SETTLES, PLACED. The natural scene (probe 8: the rebuild re-drew
// headers on both sides of its anchor) depends on where each run's slab ends (561 rows in one run, 559 in the next: 27 px or 1 px),
// so the leg places it: once the hold's slab has landed (the first notch held), a 27 px run header stands between the topmost
// element in view and the card being read; once the browser has painted it, a REAL runs rebuild runs — its first act takes every
// header away, its last puts its anchor back. Read directly: how far the rebuild moved the card being read, and the topmost
// element. The control blinds the cure (the rebuild keeps the topmost element, as outside a slab's life).
const RUNS_PLANTED = (control) => `(() => { const v = window.__v; const R = window.__ral = { armed: 0, landed: 0, landedAt: 0, natural: 0, forcing: 0, step: 0, at: 0, control: ${control ? 1 : 0} };
  const tr = v._trace.bind(v); v._trace = (tag, d) => { if (tag === 'gapUp:done' && R.armed && !R.landed) { R.landed = 1; R.landedAt = performance.now(); } return tr(tag, d); };
  // the slab's own first rebuild (debounced, ~200 ms after the landing: it re-draws the headers around the new rows — probe 8) is
  // let run first and counted; the placed rebuild comes after it, so it takes away the planted header and nothing else
  const up = v._updateRuns.bind(v); v._updateRuns = function (...a) { if (R.landed && !R.forcing) R.natural++; return up(...a); };
  // THE PASS's OWN ANCHOR (line 960's follow, r4397 (5): each green proves its product line): what the placed rebuild kept — the
  // settle watch's card (\`read\`) or the release's topmost element — read from the pass itself, never inferred from a distance
  const ra = v._runsAnchor.bind(v); v._runsAnchor = function (l) { const o = ra(l); if (R.forcing) { R.read = !!(o && o.read); R.anchorEl = o ? o.el : null; } return o; };
  return { installed: true }; })()`;
const RUNS_UNTIL = `(() => { const R = window.__ral; if (!R) return false; R.armed = 1; if (!R.landed) return false;
  const v = window.__v, list = v._messageList, now = performance.now();
  if (R.step === 0 && !R.natural && now - R.landedAt < 1500) return false;   // the slab's own first rebuild first (bounded)
  if (R.step === 0) { const st = list.scrollTop, c = window.__notchTop; let t = null;
    for (const el of list.children) { if (el.classList.contains('chat-run-header') || el.classList.contains('chat-run-footer')) continue; if (el.offsetTop + el.offsetHeight <= st) continue; t = el; break; }
    if (!t || !c || !c.isConnected || t === c || !(t.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING)) { R.step = -1; return true; }
    const h = document.createElement('div'); h.className = 'chat-run-header'; h.style.flex = 'none'; h.style.height = '27px'; h.style.minHeight = '27px';   /* flex none: kept at its height in the overflowing column list */ t.after(h);
    R.t = t; R.c = c; R.step = 1; R.at = now; return false; }
  if (R.step === 1) { if (now - R.at < 120) return false;
    if (R.control && v._gapSettle) v._gapSettle.card = () => null;
    const lt = list.getBoundingClientRect().top, c0 = R.c.getBoundingClientRect().top - lt, t0 = R.t.getBoundingClientRect().top - lt;
    R.forcing = 1; v._updateRuns(); R.forcing = 0;
    R.anchorIs = R.anchorEl == null ? 'none' : R.anchorEl === R.c ? 'card' : R.anchorEl === R.t ? 'top' : 'other';
    R.cardMoved = Math.round(R.c.getBoundingClientRect().top - lt - c0); R.topMoved = Math.round(R.t.getBoundingClientRect().top - lt - t0); R.alive = !!v._gapSettleRO;
    R.step = 2; R.at = now; return false; }
  return R.step < 0 || now - R.at > 120; })()`;
// B-3e8b's remainder, the second mover (主开发 r3898, placed by probe 10d): A ROW BETWEEN THE VIEWPORT's TOP AND THE CARD BEING READ GROWS
// BEFORE ANY SCROLL (on the hosted runner its picture loaded inside the first notches): once the hold's slab has landed, the first notch
// held, one such row grows 209 px (one picture row, measured); the control starts the watch with no reader card (its line the
// viewport's top, as the release)
const GROW_PLACED = (control) => `(() => { const v = window.__v, list = v._messageList; const G = window.__grow = { armed: 0, landed: 0, row: null, at: 0 };
  const tr = v._trace.bind(v); v._trace = (tag, d) => { if (tag === 'gapUp:done' && G.armed) G.landed = 1; return tr(tag, d); };
  if (${control ? 1 : 0}) { const w = v._watchGapSettle; v._watchGapSettle = function () { return w.call(this, null); }; }
  return { installed: true }; })()`;
const GROW_UNTIL = `(() => { const G = window.__grow; if (!G) return false; G.armed = 1; if (!G.landed) return false;
  if (!G.row) { const list = window.__v._messageList, c = window.__notchTop, st = list.scrollTop;
    if (c && c.isConnected) for (const el of list.children) { if (el === c) break; if (!el.classList.contains('chat-msg') || el.offsetHeight < 20) continue; if (el.offsetTop >= st + 5 && el.offsetTop + el.offsetHeight <= c.offsetTop - 1) { G.row = el; break; } }
    if (!G.row) { G.row = 'none'; return true; }
    const pad = document.createElement('div'); pad.style.height = '209px'; G.row.appendChild(pad); G.at = performance.now(); G.rowAt = Math.round(G.row.offsetTop - st); return false; }
  return G.row === 'none' || performance.now() - G.at > 150; })()`;
// LINE 960's ROUND, its must (主开发 r4273): A CONTINUOUS SCROLL IS ONE BURST, so the watch's card (the one from before it) can lie a
// viewport away when a runs rebuild runs. PLACED: once the hold's slab landed and the slab's own first rebuild ran (the first notch
// held), a drag up of 1200 px (30 steps 16 ms apart: one burst), then — the burst over — a 27 px run header
// painted right under the topmost element in view, and a real rebuild that takes it away. The topmost element in view (what the
// person looks at) must keep its place; the control blinds the in-view test (line 960 as taken: the off-screen card kept).
const FLING_PLANTED = (control) => RUNS_PLANTED(control).replace("return { installed: true }; })()", "R.fling = 1; return { installed: true }; })()");
const FLING_UNTIL = `(() => { const R = window.__ral; if (!R) return false; R.armed = 1; if (!R.landed) return false;
  const v = window.__v, list = v._messageList, now = performance.now();
  if (R.step === 0 && !R.natural && now - R.landedAt < 1500) return false;
  if (R.step === 0) { R.st0 = list.scrollTop; R.lastScroll = now; list.addEventListener('scroll', () => { R.lastScroll = performance.now(); R.scrolls = (R.scrolls || 0) + 1; }, { passive: true });
    // a DRAG of the scroll bar's shape: 30 steps of 40 px, 16 ms apart (a smooth scrollBy was cut short after 277 px by the
    // product's own writes during the settle — measured; a drag is not)
    let k = 0; const step = () => { if (k++ >= 30) return; list.scrollTop = list.scrollTop - 40; setTimeout(step, 16); }; step();
    R.step = 1; R.at = now; return false; }
  if (R.step === 1) { if (now - R.at < 250 || now - R.lastScroll < 150) return false;   // the burst is over (no scroll for 150 ms)
    const st = list.scrollTop, ch = list.clientHeight, c = v._gapSettle && v._gapSettle.card ? v._gapSettle.card() : null; let t = null;
    for (const el of list.children) { if (el.classList.contains('chat-run-header') || el.classList.contains('chat-run-footer')) continue; if (el.offsetTop + el.offsetHeight <= st) continue; t = el; break; }
    R.travelled = Math.round(R.st0 - st); R.cardBelow = c && c.isConnected ? Math.round(c.offsetTop - st - ch) : null; R.alive = !!v._gapSettleRO;
    if (!t || !c || R.cardBelow == null || R.cardBelow <= 0) { R.step = -1; return true; }   // no scene (named by the leg): the card is not out of view
    const h = document.createElement('div'); h.className = 'chat-run-header'; h.style.flex = 'none'; h.style.height = '27px'; h.style.minHeight = '27px'; t.after(h);
    R.t = t; R.c = c; R.step = 2; R.at = now; return false; }
  if (R.step === 2) { if (now - R.at < 120) return false;
    if (R.control) v._readCardInView = () => true;   // the control: line 960 as taken — the off-screen card kept
    const lt = list.getBoundingClientRect().top, t0 = R.t.getBoundingClientRect().top - lt;
    R.forcing = 1; v._updateRuns(); R.forcing = 0;
    R.anchorIs = R.anchorEl == null ? 'none' : R.anchorEl === R.c ? 'card' : R.anchorEl === R.t ? 'top' : 'other';
    R.topMoved = Math.round(R.t.getBoundingClientRect().top - lt - t0); R.step = 3; R.at = now; return false; }
  return R.step < 0 || now - R.at > 120; })()`;
// LINE 960's ROUND, the race its own leg met once (主开发 r4332): A RUNS REBUILD IN THE SAME FRAME AS A NOTCH's SCROLL, BEFORE THE
// WATCH's FRAME HAS RECORDED IT. PLACED: once the hold's slab landed and its own first rebuild ran (the first notch held), a scroll up
// of 200 px (the watch records it: its card is A, the one read before it); a 27 px run header painted between B (the card now at
// the top) and A; then a second scroll up of 200 px and, IN THAT SAME TASK (before any frame), a real rebuild that takes the
// header away. The card read before the latest notch is B: it must keep its place; the control hands the rebuild A (the card from
// before the previous notch — what the watch read before this cure) and B moves by what the rebuild took away.
const RACE_PLANTED = (control) => RUNS_PLANTED(control);
const RACE_UNTIL = `(() => { const R = window.__ral; if (!R) return false; R.armed = 1; if (!R.landed) return false;
  const v = window.__v, list = v._messageList, now = performance.now();
  const topCard = () => { const st = list.scrollTop; for (const el of list.children) { const cl = el.classList; if (el._isSeekSentinel || !cl || !cl.contains('chat-msg') || cl.contains('chat-run-header') || cl.contains('chat-run-footer')) continue; if (el.offsetHeight > 0 && el.offsetTop + el.offsetHeight > st) return el; } return null; };
  if (R.step === 0 && !R.natural && now - R.landedAt < 1500) return false;
  if (R.step === 0) { R.A = topCard(); list.scrollTop = list.scrollTop - Math.round(list.clientHeight / 4); R.step = 1; R.at = now; return false; }   // a quarter of the list (r4847: distances from the list's own height)
  if (R.step === 1) { if (now - R.at < 200) return false;
    const B = topCard(), A = R.A;
    if (!A || !B || A === B || !(B.compareDocumentPosition(A) & Node.DOCUMENT_POSITION_FOLLOWING)) { R.step = -1; return true; }   // no scene (named by the leg)
    const h = document.createElement('div'); h.className = 'chat-run-header'; h.style.flex = 'none'; h.style.height = '27px'; h.style.minHeight = '27px'; B.after(h);
    R.B = B; R.step = 2; R.at = now; return false; }
  if (R.step === 2) { if (now - R.at < 150) return false;
    const lt = list.getBoundingClientRect().top;
    list.scrollTop = list.scrollTop - Math.round(list.clientHeight / 4);   // the second notch's scroll …
    const mid = R.B.getBoundingClientRect().top - lt;
    if (R.control && v._gapSettle) { const A = R.A; v._gapSettle.card = () => A; R.aReadable = v._readCardInView(A, list.scrollTop, list.scrollTop + list.clientHeight); }   // the control: the card from before the previous notch (judged only where the product would read it)
    R.forcing = 1; v._updateRuns(); R.forcing = 0;               // … and a rebuild in the same task, before the watch's frame
    R.anchorIs = R.anchorEl == null ? 'none' : R.anchorEl === R.B ? 'B' : R.anchorEl === R.A ? 'A' : 'other';
    R.bMoved = Math.round(R.B.getBoundingClientRect().top - lt - mid); R.alive = !!v._gapSettleRO; R.step = 3; R.at = now; return false; }
  return R.step < 0 || now - R.at > 120; })()`;
// LINE 960's FOLLOW (主开发 r4397 (1)): «IN VIEW» MEANS THE CARD BEING READ — its top above the view's lower third. PLACED: once the
// hold's slab landed and its own first rebuild ran (the first notch held), ONE BURST (steps of ≤ 40 px, 16 ms apart, each read
// from where that card stands) carries the card at the view's top — the one the watch names after the burst — to its place — a SLIVER at the view's bottom edge (12 px of it
// showing), or WELL IN VIEW (its top at a quarter of the view); then a 27 px run header painted right under the topmost element,
// and a real rebuild that takes it away. A sliver: the release's rule (the topmost element keeps its place); well in view: the card
// is kept. The control: line 960's rule as taken (any overlap) at the sliver — what the person reads at the top moves.
const EDGE_PLANTED = (control) => RUNS_PLANTED(control);
const EDGE_UNTIL = (kind) => `(() => { const R = window.__ral; if (!R) return false; R.armed = 1; if (!R.landed) return false;
  const v = window.__v, list = v._messageList, now = performance.now(), ch = list.clientHeight;
  if (R.step === 0 && !R.natural && now - R.landedAt < 1500) return false;
  // the card at the view's top before the burst — the one the watch names after it (a burst's line is where the view was before it)
  if (R.step === 0) { const g0 = v._gapSettle && v._gapReaderCard ? v._gapReaderCard() : null, c = g0 && g0.el;
    if (!c) { R.step = -1; R.why = 'no card at the view top'; return true; }
    R.c = c; R.lastScroll = now; list.addEventListener('scroll', () => { R.lastScroll = performance.now(); }, { passive: true });
    const want = ${kind === 'sliver' ? 'ch - 12' : 'Math.round(ch / 4)'};
    let k = 0; const step = () => { if (k++ >= 60 || !c.isConnected) return; const need = want - (c.offsetTop - list.scrollTop); if (Math.abs(need) < 2) return; list.scrollTop = list.scrollTop - Math.max(-40, Math.min(40, need)); setTimeout(step, 16); }; step();
    R.step = 1; R.at = now; return false; }
  if (R.step === 1) { if (now - R.at < 250 || now - R.lastScroll < 150) return false;   // the burst is over (no scroll for 150 ms)
    const st = list.scrollTop, c = R.c, cw = v._gapSettle && v._gapSettle.card ? v._gapSettle.card() : null; let t = null;
    for (const el of list.children) { if (el.classList.contains('chat-run-header') || el.classList.contains('chat-run-footer')) continue; if (el.offsetTop + el.offsetHeight <= st) continue; t = el; break; }
    R.cardAt = c.isConnected ? Math.round(c.offsetTop - st) : null; R.ch = ch; R.same = cw === c; R.alive = !!v._gapSettleRO;
    const placed = R.cardAt != null && (${kind === 'sliver' ? 'R.cardAt >= ch - 24 && R.cardAt < ch' : 'R.cardAt > 0 && R.cardAt < ch / 2 - 20'});
    if (!t || !placed || !R.same || t === c || !(t.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING)) { R.step = -1; return true; }   // no scene (named by the leg)
    // the header is planted ABOVE the card, and put back AS A RUNS PASS PUTS ITS ANCHOR BACK — a stamped write by what it pushed
    // (the watch's line moves with it): the card stays where the burst left it, whatever the run's geometry (the second form planted
    // it bare: 27 px pushed a 12 px sliver below the view, so neither rule saw it — box row 871, r4503)
    const h = document.createElement('div'); h.className = 'chat-run-header'; h.style.flex = 'none'; h.style.height = '27px'; h.style.minHeight = '27px';
    const o0 = c.offsetTop; t.after(h); const pushed = c.offsetTop - o0;
    if (pushed) { v._traceExpect('runsRestore'); list.scrollTop = list.scrollTop + pushed; }
    R.pushed = Math.round(pushed); R.t = t; R.step = 2; R.at = now; return false; }
  if (R.step === 2) { if (now - R.at < 120) return false;
    // THE SCENE AT THE REBUILD, read where the product reads it: the card's own place and the watch still naming it
    const g = v._gapSettle; R.cardAtRebuild = Math.round(R.c.offsetTop - list.scrollTop); R.sameAtRebuild = !!(g && g.card && g.card() === R.c);
    if (!R.sameAtRebuild || !(${kind === 'sliver' ? 'R.cardAtRebuild >= ch - 24 && R.cardAtRebuild < ch' : 'R.cardAtRebuild > 0 && R.cardAtRebuild < ch / 2 - 20'})) { R.step = -1; R.why = 'the card left its place before the rebuild'; return true; }
    if (R.control) v._readCardInView = (el, st, end) => el.offsetTop < end && el.offsetTop + el.offsetHeight > st;   // the control: line 960 as taken (any overlap)
    const lt = list.getBoundingClientRect().top, t0 = R.t.getBoundingClientRect().top - lt, c0 = R.c.getBoundingClientRect().top - lt;
    R.forcing = 1; v._updateRuns(); R.forcing = 0;
    R.anchorIs = R.anchorEl == null ? 'none' : R.anchorEl === R.c ? 'card' : R.anchorEl === R.t ? 'top' : 'other';
    R.topMoved = Math.round(R.t.getBoundingClientRect().top - lt - t0); R.cardMoved = Math.round(R.c.getBoundingClientRect().top - lt - c0); R.step = 3; R.at = now; return false; }
  return R.step < 0 || now - R.at > 120; })()`;
// LINE 960's FOLLOW (主开发 r4397 (2)): ONE READER — THE SETTLE's OWN ANSWER READS THE LINE AS THE FRAME WOULD RECORD IT. PLACED BY ITS
// ROWS (主开发 r5098: the scrolls were 200 then 300 px, so where rows fell under them depended on where the content stood — the release's
// mirror started 675 px lower, no whole row came into view and the scene did not form, twice): once the hold's slab landed and its own
// first rebuild ran (the first notch held), the leg takes four rows by identity — A, the card at the top; R2, the row above it; B, the
// row above R2; R1, the row above B — scrolls B to the top (the watch records it, 400 ms), then scrolls R1 just into view and, IN THAT
// SAME TASK (before any frame), R1 (newly in view above the line read before that scroll) grows 150 px and R2 (below that line,
// between B and A) grows 100 px, and the flush a runs pass starts with answers them. A row the leg cannot take, or an identity gone
// between the scrolls (a row detached or drawn again), is a named SKIP read by the leg itself (counted; the leg PARTIAL in that run),
// never a red and never a green. What the PRODUCT can reach is a RED precondition saying what it met (主开发 r5148): the watch ended
// before a scroll (its own end reason, from the trace), or B no longer the card at the top after its wait (B's measured move). The card read before the latest notch (B) keeps its place: only R1 moved it. Before this follow the
// answer read the line from the record (the view's top once the record was old: R1 unanswered, B moved 150; within 150 ms of it,
// the line from before the PREVIOUS notch: R2 answered too, B moved −100). The control hands the answer the view's top.
const LINE_PLANTED = (control) => RUNS_PLANTED(control);
const LINE_UNTIL = `(() => { const R = window.__ral; if (!R) return false; R.armed = 1; if (!R.landed) return false;
  const v = window.__v, list = v._messageList, now = performance.now();
  const topCard = () => { const st = list.scrollTop; for (const el of list.children) { const cl = el.classList; if (el._isSeekSentinel || !cl || !cl.contains('chat-msg') || cl.contains('chat-run-header') || cl.contains('chat-run-footer')) continue; if (el.offsetHeight > 0 && el.offsetTop + el.offsetHeight > st) return el; } return null; };
  const isRow = (el) => { const cl = el && el.classList; return !!cl && !el._isSeekSentinel && cl.contains('chat-msg') && !cl.contains('chat-run-header') && !cl.contains('chat-run-footer') && el.offsetParent !== null && el.offsetHeight >= 8; };
  const above = (el) => { for (let e = el ? el.previousElementSibling : null; e; e = e.previousElementSibling) if (isRow(e)) return e; return null; };
  const skip = (why) => { R.step = -1; R.skip = 1; R.why = why; return true; };
  const red = (why) => { R.step = -1; R.why = why; return true; };   // reachable by the product: a PRECONDITION NOT MET, red, saying what it met (r5148)
  const endWhy = () => { const e = (v._traceRing || []).filter((x) => x.tag === 'gapUp:settleEnd').pop(); return e ? String(e.why) : 'no settleEnd in the trace ring'; };
  // THE WATCH's CHECK STANDS IN FRONT OF EVERY SKIP (主开发 r5223): every way the product tears the slab down (its drop, the reset after a
  // jump, a teleport) also ends the watch, so a row gone with a watch the product ended reads RED with its end reason; the named skip is
  // for a redraw under a live watch only. The watch's ceiling (8 s from the insert) is out of reach here: the leg acts about 1.5 s after
  // the landing and again 400 ms later, and the driver gives up after 4 s, so a watch ended here is the product's own end, by its name
  if (R.step === 0 && !R.natural && now - R.landedAt < 1500) return false;
  if (R.step === 0) { if (!v._gapSettle) return red('the watch had ended before the first scroll (its own end: ' + endWhy() + ')');
    const A = topCard(), r2 = above(A), B = above(r2), r1 = above(B);
    if (!A || !r2 || !B || !r1) return skip('fewer than three rows above the card at the top (' + [r2, B, r1].filter(Boolean).length + ')');
    R.L0 = list.scrollTop; R.A = A; R.r2 = r2; R.B = B; R.r1 = r1;
    list.scrollTop = B.offsetTop + Math.min(8, Math.floor(B.offsetHeight / 2)); R.bAt = B.offsetTop - list.scrollTop; R.step = 1; R.at = now; return false; }   // notch 1: B to the top; the watch records it
  if (R.step === 1) { if (now - R.at < 400) return false;
    if (R.dropSlab && !R.dropped) { R.dropped = 1; v._dropGapSlab('leg: the red copy, the slab dropped between the two scrolls'); }   // THE RED COPY's FAULT (r5223), placed
    if (!v._gapSettle) return red('the watch had ended before the second scroll (its own end: ' + endWhy() + ')');
    const L1 = list.scrollTop, B = topCard();
    const gone = ['A', 'r2', 'B', 'r1'].filter((k) => !R[k].isConnected);
    if (gone.length) return skip('an identity is gone under a live watch: ' + gone.join(', ') + ' detached or drawn again between the two scrolls');   // a row re-rendered: the scene is not there to judge
    if (B !== R.B) {   // read once more at the painted frame before calling it red (a late settle in the gap before a frame is not a move: r5080)
      if (!R.reread) { R.reread = 1; requestAnimationFrame(() => setTimeout(() => { R.rereadDone = 1; }, 0)); return false; }
      if (!R.rereadDone) return false;
      return red('the card B is no longer the card at the top after its wait, read at the painted frame: it moved ' + Math.round(R.B.offsetTop - L1 - R.bAt) + ' px in the view (B ' + (isRow(R.B) ? 'shown' : 'folded or hidden') + '; the card at the top is ' + (B ? 'another' : 'none') + ')'); }
    if (above(B) !== R.r1 || above(R.A) !== R.r2 || above(R.r2) !== B) return skip('a row drawn between the four rows taken, or a taken row folded or hidden, under a live watch (their order no longer A, R2, B, R1)');
    list.scrollTop = R.r1.offsetTop - 1; const L2 = list.scrollTop;                       // the second notch's scroll: R1 just into view …
    R.lines = [Math.round(R.L0), Math.round(L1), Math.round(L2)];
    if (!(L2 < L1 && R.r1.offsetTop >= L2 && R.r1.offsetTop + R.r1.offsetHeight <= Math.min(L1, B.offsetTop) && R.r2.offsetTop >= B.offsetTop + B.offsetHeight && R.r2.offsetTop + R.r2.offsetHeight <= R.A.offsetTop))
      return skip('the scroll did not put R1 newly in view above the line, or R2 is not between B and A (lines ' + JSON.stringify(R.lines) + ')');
    const lt = list.getBoundingClientRect().top, mid = B.getBoundingClientRect().top - lt;
    if (R.control) v._gapSettle.line = () => list.scrollTop;                                  // the control: the view's top as the line
    const p1 = document.createElement('div'); p1.style.height = '150px'; R.r1.appendChild(p1);
    const p2 = document.createElement('div'); p2.style.height = '100px'; R.r2.appendChild(p2);
    v._gapSettle.flush();                                                                     // … and the runs pass's first act, in the same task
    R.bMoved = Math.round(B.getBoundingClientRect().top - lt - mid); R.alive = !!v._gapSettleRO; R.step = 3; R.at = now; return false; }
  return R.step < 0 || now - R.at > 120; })()`;
// LINE 960's FOLLOW (主开发 r4397 (3)): A STAMPED WRITE WHOSE RE-SEED IS STILL QUEUED IS RECORDED. PLACED: once the hold's slab landed
// and its own first rebuild ran, before any scroll (the first notch held), a stamped 27 px write (a runs pass's put-back: two passes
// in one task) and, in that task, the watch's card read again: the same card (the landing's own). The control writes the same 27 px
// unstamped (a person's move): the card read then is another — the leg sees the difference.
const STAMP_PLANTED = (control) => RUNS_PLANTED(control);
const STAMP_UNTIL = `(() => { const R = window.__ral; if (!R) return false; R.armed = 1; if (!R.landed) return false;
  const v = window.__v, list = v._messageList, now = performance.now();
  if (R.step === 0 && (!R.natural || now - R.landedAt < 600) && now - R.landedAt < 1500) return false;
  if (R.step === 0) { const g = v._gapSettle, st0 = list.scrollTop;
    const c0 = g && g.card ? g.card() : null;
    if (!c0 || st0 < 40) { R.step = -1; R.why = !c0 ? 'no watch card' : 'no room above'; return true; }
    const t0 = v._gapReaderCard ? (v._gapReaderCard(st0) || {}).el : null; R.distinct = !!t0 && t0 !== c0;   // the card a person's move would name is another
    if (!R.distinct) { R.step = -1; R.why = 'the card at the view top is the watch card: the scene cannot tell them apart'; return true; }
    if (!R.control) v._traceExpect('runsRestore');                                           // a stamped write (the control: unstamped) …
    list.scrollTop = st0 - 27;
    const c1 = g.card();                                                                      // … and the card read in the same task
    R.same = c1 === c0; R.wrote = Math.round(list.scrollTop - st0); R.alive = !!v._gapSettleRO; R.step = 3; R.at = now; return false; }
  return R.step < 0 || now - R.at > 120; })()`;
// THE CONTROLS' OWN SCENES, PLACED (主开发 r4514: a control's fault is planted where the product reads it and judged on a fact right
// there; the box read the pair green on pages where no slab row happened to settle — «(2) answered []», row 873):
// · (1') — the first notch is HELD until the slab has landed (so the notch at the top is carried into it, once), then the hold goes on;
// · (2), the pair — inside the held first notch, the row nearest above the view's top grows 150 px: wholly above the reading line,
//   the change the watch answers alone (overflow-anchor none) and the browser's own anchoring answers when the watch is blinded; both
//   at once («twice») move the card read by it. Each judged on its own facts, a named PRECONDITION line when the scene did not form.
const LANDED_UNTIL = `(() => { const R = window.__ral; if (!R) return false; R.armed = 1; return !!R.landed && performance.now() - R.landedAt > 300; })()`;
const PAIR_UNTIL = `(() => { const R = window.__ral; if (!R) return false; R.armed = 1; if (!R.landed) return false;
  const v = window.__v, list = v._messageList, now = performance.now();
  if (!R.pair) { if (now - R.landedAt < 300) return false;
    const st = list.scrollTop; let row = null;
    for (const el of list.children) { const cl = el.classList; if (el._isSeekSentinel || !cl || !cl.contains('chat-msg') || cl.contains('chat-run-header') || cl.contains('chat-run-footer') || el.offsetParent === null || el.offsetHeight < 20) continue; if (el.offsetTop + el.offsetHeight <= st - 1) row = el; else break; }
    if (!row) { R.pair = 'none'; return true; }
    const pad = document.createElement('div'); pad.style.height = '150px'; row.appendChild(pad); R.pair = { at: now, rowAt: Math.round(row.offsetTop + row.offsetHeight - 150 - st) }; return false; }
  return R.pair === 'none' || now - R.pair.at > 300; })()`;
// THE STARTING POINT IS THE PAINTED FRAME (row B-3e8b, 主开发 r5080; the proof scratch 35d04565e): every position this scene compares
// is read in a task right after a paint (rAF, then setTimeout 0), as NOTCH_BEFORE reads P, never inside a frame. A read inside the
// frame of the growth forces a layout that already holds a row's late settle landed since the paint, before that frame's
// ResizeObserver answers it: the third hosted run of 2.369.420 read −258 px there once in four tries (the watch answered both rows
// at once, 516) while nothing a person sees moved. kind: 'inside' — the growth one painted frame after the scroll; 'after' — 400 ms
// after it; 'coincide' — as 'inside', and a second row the scroll brought in takes 258 px in the gap between the paint and the frame
// of the growth (that coincidence PLACED, never load); 'stopped' — as 'coincide', the watch stopped at the growth (nothing answers:
// the painted measure's own control). The in-frame starting point of before is kept beside the painted one (hInFrame)
const WINDOW_UNTIL = (kind) => `(() => { const R = window.__ral; if (!R) return false; R.armed = 1; if (!R.landed) return false;
  const v = window.__v, list = v._messageList, now = performance.now(), top = ${TOP_CARD}, pos = (e) => e.getBoundingClientRect().top - list.getBoundingClientRect().top;
  if (R.step === 0 && (!R.natural || now - R.landedAt < 600) && now - R.landedAt < 1500) return false;
  if (R.step === 0) { const held = top(list, list.getBoundingClientRect().top);
    if (!held || !v._gapSettle) { R.step = -1; R.why = !held ? 'no card at the top' : 'the watch has ended'; return true; }
    R.lineOff = list.scrollTop - held.offsetTop; R.plantReads = 0; R.readsAtGrowth = null;
    // THE CONTROL's PLANT (主开发 r5039): the answer handed the OTHER card's line — inside, the view's top; after, the line of before the
    // scroll, kept as a distance from the card read before it, so it moves with the content as the watch's own line does (a number taken
    // before the scroll went stale on the hosted runner, where the landing's own settles came after it: 0 px, four tries of four). Its
    // WITNESS is a COUNT of the product's reads of the planted line (r5054: a counter, never rounded times): the control is judged only
    // when the product read it at or after the growth. A read of the planted line at or after the growth IS the hand-over of the grown
    // row: the watch reads its line only to answer a change (chat-view-seek.js, answer). A card read before the scroll found detached
    // by the plant (its offsetTop then 0) or at the read is a NAMED precondition, never a silent red (r5054)
    const plant = (g) => { if (!R.control || !g) return; g.line = ${kind === 'after' ? "() => { R.plantReads++; if (!held.isConnected) R.heldGone = 1; return held.offsetTop + R.lineOff; }" : "() => { R.plantReads++; return list.scrollTop; }"}; };
    plant(v._gapSettle);
    const ans = [], tr = v._trace; v._trace = function (tag, d) { if (tag === 'gapUp:settle' && R.step === 2) ans.push(Math.round((d && d.px) || 0)); return tr.apply(this, arguments); };
    const t0 = performance.now(); list.scrollTop = list.scrollTop - Math.round(list.clientHeight * 300 / ${LIST_H}); R.step = 1;
    const pad = (el) => { const p = document.createElement('div'); p.style.height = '258px'; el.appendChild(p); };
    let ck = null, row = null, hP = 0, cP = 0;
    const painted = () => {   // THE PAINTED FRAME before the growth: what the person sees, and the rows the scroll brought in
      ck = top(list, list.getBoundingClientRect().top); const rows = [];
      if (ck && ck !== held && held.isConnected) for (let el = ck.nextElementSibling; el && el !== held; el = el.nextElementSibling) { const cl = el.classList; if (cl && cl.contains('chat-msg') && !cl.contains('chat-run-header') && !cl.contains('chat-run-footer') && el.offsetParent !== null && el.offsetHeight >= 8) rows.push(el); }
      if (!rows.length) { v._trace = tr; R.step = -1; R.why = 'no row the scroll brought in between the card at the top and the card read before it'; return; }
      row = rows[0]; R.between = rows.length; hP = pos(held); cP = pos(ck); R.step = 2;
      ${kind === 'coincide' || kind === 'stopped' ? "pad(rows[rows.length > 1 ? 1 : 0]); R.lateAt = Math.round(performance.now() - t0);   // THE COINCIDENCE: in the gap between this paint and the frame of the growth; nothing read after it" : ''}
      requestAnimationFrame(grow);
    };
    const grow = () => {   // the frame of the growth
      if (!held.isConnected || !ck.isConnected || !row.isConnected) { v._trace = tr; R.step = -1; R.why = 'the card read before the scroll, the card at the top or the row was detached before the growth'; return; }
      ${kind === 'stopped' ? "v._stopGapSettle('leg: the painted measure control'); list.style.overflowAnchor = 'none';   // nothing answers" : ''}
      plant(v._gapSettle); R.readsAtGrowth = R.plantReads;   // the plant placed again where the product reads, at the growth
      R.dt = Math.round(performance.now() - t0); const h0 = pos(held), r0 = row.offsetHeight;   // h0: the in-frame starting point of before
      pad(row); R.g = row.offsetHeight - r0;
      requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => { const live = held.isConnected && ck.isConnected && !R.heldGone;
        R.heldLive = live; R.hMoved = live ? Math.round(pos(held) - hP) : null; R.tMoved = live ? Math.round(pos(ck) - cP) : null; R.hInFrame = live ? Math.round(pos(held) - h0) : null;
        R.alive = !!v._gapSettleRO; R.answered = ans.slice(); R.inForce = R.control ? R.plantReads > R.readsAtGrowth : null; v._trace = tr; R.step = 3; }, 0)));
    };
    ${kind === 'after' ? 'setTimeout(() => requestAnimationFrame(() => setTimeout(painted, 0)), 400);   // well after the window' : 'requestAnimationFrame(() => setTimeout(painted, 0));   // one painted frame after the scroll; the growth in the next frame'}
    return false; }
  return R.step < 0 || R.step === 3; })()`;
const withPlant = (blind) => `(${RUNS_PLANTED(false)}, ${blind})`;   // the placed hold's flags (landed, natural) beside the control's own blind
const BLIND = {
  'late row': `(() => { window.__lateRow = { at: 3, px: 258, n: 0 }; return { placed: 'a row taking its height late in the gap of the third notch past the landing' }; })()`,
  'window placed': RUNS_PLANTED(false),
  'window placed, control': RUNS_PLANTED(true),
  'edge placed': EDGE_PLANTED(false),
  'edge placed, control': EDGE_PLANTED(true),
  'line placed': LINE_PLANTED(false),
  'line placed, control': LINE_PLANTED(true),
  'line placed, slab dropped': withPlant(`(() => { window.__ral.dropSlab = 1; return { placed: 'the slab dropped between the two scrolls (the red copy)' }; })()`),
  'stamp placed': STAMP_PLANTED(false),
  'stamp placed, control': STAMP_PLANTED(true),
  'race placed': RACE_PLANTED(false),
  'race placed, control': RACE_PLANTED(true),
  'fling placed': FLING_PLANTED(false),
  'fling placed, control': FLING_PLANTED(true),
  'grow placed': GROW_PLACED(false),
  'grow placed, control': GROW_PLACED(true),
  'runs placed': RUNS_PLANTED(false),
  'runs placed, control': RUNS_PLANTED(true),
  "(1')": withPlant(`(() => { const v = window.__v; v._gapReaderCard = () => null; return { blinded: "(1') no reader read at the insert" }; })()`),
  '(2) off': withPlant(`(() => { const v = window.__v; v._watchGapSettle = () => { }; return { blinded: '(2) the settle watch: the browser anchoring alone' }; })()`),
  '(2) twice': withPlant(`(() => { const v = window.__v, w = v._watchGapSettle; v._watchGapSettle = function (...a) { const r = w.apply(this, a); this._messageList.style.overflowAnchor = ''; return r; }; return { blinded: '(2) answered beside the browser anchoring' }; })()`),
};
const STORE = (o, set) => `(() => { ${Object.keys(o).map((k) => set ? `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(o[k])});` : `localStorage.removeItem(${JSON.stringify(k)});`).join(' ')} return 1; })()`;
const firstHold = async (label, blind, { store = null, after = null, cadence = 'hold' } = {}) => {
  if (store) await evaljs(STORE(store, true));   // a person's own setting, read by the page at its boot (the product's own road)
  try { return await firstHoldOn(label, blind, after, cadence); } finally { if (store) await evaljs(STORE(store, false)).catch(() => 0); }
};
const firstHoldOn = async (label, blind, after, cadence = 'hold') => {
  if (!(await pageReady(PORT, 'first hold ' + label))) return { label, law: { ok: false, why: 'no page' } };
  await sleep(1500);
  globalThis.__notchReads = [];
  const r = await runGestures([...(blind ? [['blind ' + blind, 'eval', BLIND[blind]]] : []), ['gap-jump', 'jump', 0], ['gap-up-hold-1', 'up', cadence]], 'first hold ' + label);
  const reads = globalThis.__notchReads; globalThis.__notchReads = null;
  if (reads && r.opened?.ok) reads.push(await evaljs(NOTCH_BEFORE));   // the hold's last notch closed (its settle, with no input after it)
  const afterOut = after && r.opened?.ok ? await evaljs(after) : null;
  const row = (r.rows || []).find((x) => x.name === 'gap-up-hold-1');
  const ring = row ? row.ring : [];
  const n = (tag, by) => ring.filter((e) => e.tag === tag && (by === undefined || e.by === by)).length;
  const zoomNow = r.opened?.ok ? await evaljs('(() => [Number(window.__list.style.zoom || 1), Number(document.body.style.zoom || 1)])()') : null;
  const law = row ? notchLaw(reads, CADENCE.hold.deltaY, !!zoomNow && zoomNow[0] * zoomNow[1] !== 1) : { ok: false, why: 'no row' };
  const out = { label, row, law, dev: row && row.after.topDev != null ? Math.round(row.after.topDev + row.wheelPx) : null, slabs: n('gapUp:done'), carries: n('wheelCarry', 'gapUp:carry'),
    reader: ring.filter((e) => e.tag === 'gapUp:reader').map((e) => [e.px, e.rest]), settle: ring.filter((e) => e.tag === 'gapUp:settle').map((e) => e.px), less: ring.filter((e) => e.tag === 'wheelCarry' && e.less).map((e) => [e.px, e.less]) };
  console.log(`  [first hold ${label}] per notch: ${law.why || `carried + landing ${law.carried} px (${law.L + 1} notch(es)), then the worst notch or settle ${law.worst} px, ${law.lost} read(s) lost; settles ${JSON.stringify(law.labels)}; ${law.unquiet} read(s) not quiet in 3 s (the longest wait ${law.maxWait} ms)`}; notches ${JSON.stringify(law.extras || [])}; settles ${JSON.stringify(law.settles || [])}`);
  out.after = afterOut; out.zoom = zoomNow; out.ch = r.opened?.ch ?? null;
  if (afterOut) console.log(`  [first hold ${label}] after the hold: ${JSON.stringify(afterOut)}`);
  console.log(`  [first hold ${label}] the original card ${out.dev} px past the wheel at the end (rows growing below the reading line count there); slabs ${out.slabs}, carried landings ${out.carries} ${JSON.stringify(out.less)}; (1') ${JSON.stringify(out.reader)}; (2) answered ${JSON.stringify(out.settle)}`);
  return out;
};
// THE MOVERS WHILE THE WATCH LIVES (主开发 r2922, round wdvne87yg's two musts): every height change above the reading line
// is answered EXACTLY ONCE — by the watch, or by the mover that made it, never both, never neither. Two movers, each measured
// as a distance of the card at the reading line (read in the frame the person saw): (a) SEARCH OPENS (the runs pass unfolds
// every run and puts its own anchor back) after the person scrolled back down into the registered tail, the slab still in
// the page; (b) A CARD ABOVE THE READING LINE IS REPLACED BY A NEWER VERSION OF ITSELF (_swapMessageEl, a tool result
// landing on it), 200 px taller.
const READ_TOP = `const list = window.__list, lt = () => list.getBoundingClientRect().top, paint = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  const topCard = () => { const st = list.scrollTop; for (const c of list.children) { const cl = c.classList; if (c._isSeekSentinel || !cl || !cl.contains('chat-msg') || cl.contains('chat-run-header') || cl.contains('chat-run-footer')) continue; if (c.offsetHeight > 0 && c.offsetTop + c.offsetHeight > st + 0.5) return c; } return null; };`;
const BOTH_RULES = `(async () => { ${READ_TOP}
  const v = window.__v, R = window.__ral, ral = R ? { landed: R.landed, step: R.step, cardMoved: R.cardMoved ?? null, topMoved: R.topMoved ?? null, alive: !!R.alive, read: R.read ?? null, anchorIs: R.anchorIs ?? null } : null; await paint();
  const topEl = () => { const st = list.scrollTop; for (const el of list.children) { if (el.classList.contains('chat-run-header') || el.classList.contains('chat-run-footer')) continue; if (el.offsetTop + el.offsetHeight <= st) continue; return el; } return null; };
  const off = (el) => el && el.isConnected && el.offsetParent !== null ? el.getBoundingClientRect().top - lt() : null;
  const rebuild = async (t, c) => { const h = document.createElement('div'); h.className = 'chat-run-header'; h.style.flex = 'none'; h.style.height = '27px'; h.style.minHeight = '27px';   /* flex none: kept at its height in the overflowing column list */ t.after(h); await paint(); await new Promise((r) => setTimeout(r, 120)); await paint();
    const c0 = off(c), t0 = off(t); if (R) R.forcing = 1; v._updateRuns(); if (R) R.forcing = 0; return { card: Math.round(off(c) - c0), top: Math.round(off(t) - t0), read: R ? !!R.read : null }; };
  if (!v._gapSettleRO || !v._gapSettle || !v._gapSettle.card) return { ral, both: { ok: false, why: 'the watch has ended' } };
  const card = v._gapSettle.card(), t1 = topEl();
  if (!card || !t1 || card === t1 || !(t1.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING)) return { ral, both: { ok: false, why: 'the card being read is not below the topmost element' } };
  const inside = await rebuild(t1, card);
  v._stopGapSettle('leg: the watch has ended'); await paint();
  const t2 = topEl(); if (!t2 || t2 === card) return { ral, both: { ok: false, why: 'after the watch: the card is the topmost element', inside } };
  const after = await rebuild(t2, card);
  return { ral, both: { ok: true, inside, after } };
})()`;
const SWAP_ABOVE = `(async () => { ${READ_TOP}
  const v = window.__v; await paint();
  const st = list.scrollTop, top = topCard(); let above = null;
  for (const c of list.children) { if (c === top) break; if (c.classList && c.classList.contains('chat-msg') && c.offsetHeight > 20 && c.offsetTop + c.offsetHeight < st - 40) above = c; }
  if (!top || !above) return { ok: false, why: 'no card wholly above the reading line' };
  const off0 = top.getBoundingClientRect().top - lt(), h0 = above.offsetHeight, alive = !!v._gapSettleRO;
  const neu = above.cloneNode(true), pad = document.createElement('div'); pad.style.height = '200px'; neu.appendChild(pad);
  v._swapMessageEl(above, neu, above.dataset.msgId);
  await paint(); await new Promise((r) => setTimeout(r, 400)); await paint();
  return { ok: true, alive, grew: Math.round(neu.offsetHeight - h0), moved: Math.round((top.getBoundingClientRect().top - lt()) - off0) };
})()`;
// (c) A RELATIVE WRITE IN THE TASK OF A PENDING CHANGE (round wjyz36f09's should, r3265 item 1): a row wholly above the reading
// line grows 150 px and, in the same task, a carried notch lands (the carry measures nothing itself) — the card at the reading
// line moves exactly the carry, the growth answered by the watch first. Its control blinds the watch's flush for that one carry.
const CARRY_SAME_TASK = (blind) => `(async () => { ${READ_TOP}
  const v = window.__v; await paint();
  const st = list.scrollTop, top = topCard(); let above = null;
  for (const c of list.children) { if (c === top) break; if (c.classList && c.classList.contains('chat-msg') && c.offsetHeight > 20 && c.offsetTop + c.offsetHeight < st - 40) above = c; }
  if (!top || !above || !v._gapSettle) return { ok: false, why: 'no watch or no card above', alive: !!v._gapSettle };
  const off0 = top.getBoundingClientRect().top - lt(), keep = v._gapSettle.flush;
  if (${blind ? 1 : 0}) v._gapSettle.flush = () => { };
  const pad = document.createElement('div'); pad.style.height = '150px'; above.appendChild(pad);
  v._addWheelCarry('up', 60); v._applyWheelCarry('up', 'leg:carry');
  if (${blind ? 1 : 0} && v._gapSettle) v._gapSettle.flush = keep;
  await paint(); await new Promise((r) => setTimeout(r, 300)); await paint();
  return { ok: true, alive: true, moved: Math.round((top.getBoundingClientRect().top - lt()) - off0), carry: Math.round(60 * (v._listZoom?.() || 1)) };
})()`;
// THE SEARCH SCENE, ONE PAGE (主开发 r4843 — the hosted proof a7607418e read the scene at 0 of 3 depths on all four tries: the twin page
// stood elsewhere (30356 against 30133, another kind of card at the reading line), 2 px apart (the scrollTops had to be equal), or the
// scene page dropped its slab before the press (the window left message 0 on the 650 px list); on the kit the scene held only by its
// re-read). THE TWIN IS THE SAME PAGE: the scene reads search open and closed WITH the watch, then stops the watch and reads it again
// in the browser's own world — the same card, from where the first turn left it: comparable by construction. THE SCENE's THREE
// PRECONDITIONS are read right before the press (the watch alive, the slab in the page, a run header folded above the reading line),
// each named when it fails; the never-clause is judged only where they held
const SEARCH_OPEN = `(async () => { ${READ_TOP}
  const v = window.__v; await paint();
  const st = list.scrollTop, top = topCard();
  if (!top || !v._search || !v._search._bar) return { ok: false, why: 'no card or no search bar' };
  const alive = !!v._gapSettleRO, gap = list.querySelectorAll(':scope > .chat-gap-msg').length;
  const headersAbove = [...list.querySelectorAll(':scope > .chat-run-header')].filter((h) => h.offsetTop + h.offsetHeight <= st).length;
  const base = { alive, gap, headersAbove, st0: Math.round(st), ws: v._windowStart, we: v._windowEnd, card: (top.className || '').replace(/chat-/g, '').slice(0, 40) };
  if (!alive || !gap || !headersAbove) return { ok: false, why: 'the scene did not hold: ' + [!alive && 'the watch had ended', !gap && 'the slab had been dropped', !headersAbove && 'no run header folded above the reading line'].filter(Boolean).join(', '), ...base };
  const turn = async () => {
    const off0 = top.getBoundingClientRect().top - lt(), s0 = Math.round(list.scrollTop);
    const seq0 = (v._traceRing || []).length ? v._traceRing[v._traceRing.length - 1].seq : 0;
    v._search.open();
    await new Promise((r) => setTimeout(r, 600)); await paint();
    const off1 = top.isConnected ? top.getBoundingClientRect().top - lt() : null;
    v._search._bar.classList.add('hidden'); v._search._clearSearch();
    await new Promise((r) => setTimeout(r, 600)); await paint();
    const off2 = top.isConnected ? top.getBoundingClientRect().top - lt() : null;
    const ring = (v._traceRing || []).filter((e) => e.seq > seq0 && /^(runsRestore|gapUp:|anchor|wheelCarry|stableHeights|extend|trim)/.test(e.tag)).map((e) => e.tag + JSON.stringify(Object.fromEntries(Object.entries(e).filter(([k]) => !['tag', 'seq', 't'].includes(k)))).slice(0, 90));
    return { s0, open: off1 == null ? null : Math.round(off1 - off0), closed: off2 == null ? null : Math.round(off2 - off0), ring: ring.slice(0, 8) };
  };
  const watch = await turn();                                                      // the scene: the watch alive
  watch.aliveAfter = !!v._gapSettleRO;                                             // … and still alive when its turn ended (round we1056578)
  v._stopGapSettle('scene: the browser anchoring alone');                          // the twin: the same page, the same card
  const twin = { gap: list.querySelectorAll(':scope > .chat-gap-msg').length, headersAbove: [...list.querySelectorAll(':scope > .chat-run-header')].filter((h) => h.offsetTop + h.offsetHeight <= list.scrollTop).length };   // the preconditions read again, named
  const browser = await turn();
  return { ok: true, ...base, watch, twin, browser };
})()`;
// the depths: 1, 2 and 3 SLOW notches (120 px) past the scene's own descent — near the slab's end, so the slab stays in the page
Object.assign(CADENCE, { near1: { notches: 1, deltaY: 120, gap: 0, settle: 900 }, near2: { notches: 2, deltaY: 120, gap: 150, settle: 900 }, near3: { notches: 3, deltaY: 120, gap: 150, settle: 900 } });
const searchScene = async (tail) => {
  if (!(await pageReady(PORT, 'search scene ' + tail))) return { tail, ok: false, why: 'no page' };
  await sleep(1500);
  // a slab lands (a short hold up), the person comes back down through it and a little into the registered tail
  const r = await runGestures([['gap-jump', 'jump', 0], ['scene-up', 'up', 'shortHold'], ['scene-down', 'down', 'shortHold'], ['scene-' + tail, 'down', tail]], 'search scene ' + tail);
  if (!r.opened?.ok) return { tail, ok: false, why: 'not opened' };
  const o = { tail, ch: r.opened?.ch ?? null, ...(await evaljs(SEARCH_OPEN)) };
  console.log(`  [search scene ${tail}] ${JSON.stringify(o)}`);
  return o;
};
{
  console.log(`§4h the first hold up into unloaded history, per notch: the card at the reading line moves exactly each notch (± ${NOTCH_TOL_PX} px), the carried ones exactly once at the landing (a fresh page); a control a part`);
  const fix = await firstHold('fix');
  check(`§4h THE SECTION's OWN GEOMETRY (r4847): the list stands ${LIST_H} px tall (it stood ${fix.ch} px) — every distance of the section read at one height on every machine`, fix.ch === LIST_H, JSON.stringify({ ch: fix.ch }));
  check(`§4h the fresh page's first hold reached the seek gap (a slab landed: gapUp:done) and its notches at scrollTop 0 were carried into it (≥ 1 carried landing, at most one a slab: ${fix.carries} over ${fix.slabs})`, fix.slabs >= 1 && fix.carries >= 1 && fix.carries <= fix.slabs, JSON.stringify({ slabs: fix.slabs, carries: fix.carries }));
  check(`§4h THE CARD AT THE READING LINE STAYS WHERE IT IS WHEN HISTORY ARRIVES OR SETTLES ABOVE IT: every notch moved the card read before it exactly its ${CADENCE.hold.deltaY} px, and every settle after a notch left standing what the person had on the screen before it (inside the product's window) or the card at the top (after it) — worst ${fix.law.worst} px, settles ${JSON.stringify(fix.law.labels)} — the carried notches exactly once at the landing (${fix.law.carried} px over ${fix.law.L + 1})`, fix.law.ok, JSON.stringify(fix.law));
  check(`§4h the hold's end inside ①'s slack (${JUMP_SLACK_VIEWPORTS} viewports): the original card ${fix.dev} px past the wheel`, !!fix.row && !fix.row.verdict.reasons.length, fix.row ? fix.row.verdict.reasons.join('; ') : 'no row');
  const heldOn = async (label, blind, until, after) => { globalThis.__firstNotchUntil = until; try { return await firstHold(label, blind, { after }); } finally { globalThis.__firstNotchUntil = null; } };
  const PAIRF = '(() => { const R = window.__ral; return R ? { landed: R.landed, pair: R.pair || null } : null; })()';
  // THE LATE ROW IN A GAP (主开发 r4540 — the kit's −258 px, placed on the product as it is): during the hold, a notch's own scroll arms it;
  // one painted frame after that notch, the row between the card now at the top and the card read before the notch takes its real
  // height (258 px, one picture row). The card at the top is read on the screen before the row grows, after it grew, after the next
  // notch: with no input in the gap, what a person reads at the top does not move
  const LATE = '(() => { const K = window.__lateRow; return K ? { armed: !!K.armed, why: K.why || null, g: K.g ?? null, dt: K.dt ?? null, p0: K.p0 ?? null, p1: K.p1 ?? null, p2: K.p2 ?? null, q0: K.q0 ?? null, q1: K.q1 ?? null, q2: K.q2 ?? null, answered: K.answered || null } : null; })()';
  const lr = await firstHold('a row taking its height late in a gap', 'late row', { after: LATE });
  const lrScene = !!lr.after && lr.after.p0 != null && lr.after.p1 != null && lr.after.g >= 200 && lr.after.dt != null && lr.after.dt <= WINDOW_MS - WINDOW_MARGIN_MS;
  check(`§4h A ROW THE NOTCH BROUGHT IN TAKES ITS HEIGHT INSIDE THE WINDOW, ON THE WHEEL (r4599, the first case): ${lrScene ? '' : 'PRECONDITION NOT MET (' + (lr.after?.why || 'one painted frame after a notch, ' + (lr.after?.dt ?? '?') + ' ms, a row between the card at the top and the card read before the notch grew') + ') — '}what the person had on the screen before the notch stands — the card read before it: before the row grew ${lr.after?.p0} px, after it grew ${lr.after?.p1} px (the watch answered ${JSON.stringify(lr.after?.answered)}), after the next notch ${lr.after?.p2} px; the card a frame old at the top ${lr.after?.q0} / ${lr.after?.q1} / ${lr.after?.q2} px (± ${NOTCH_TOL_PX})`,
    lrScene && Math.abs(lr.after.p1 - lr.after.p0) <= NOTCH_TOL_PX, JSON.stringify({ after: lr.after, law: lr.law }));
  // THE WINDOW's TWO SIDES, PLACED (r4599 (1)): once the slab landed (the first notch held), a scroll up of 300 px; then a row it brought
  // in (between the card now at the top and the card read before the scroll) grows 258 px — ONE PAINTED FRAME after it (inside the
  // product's window: the card read before the scroll stands) or 400 ms after it (after the window: the card at the top stands). Each
  // with its control: the answer handed the OTHER card's line (the view's top inside; the line before the scroll after) — it goes red
  const WIN = '(() => { const R = window.__ral; return R ? { landed: R.landed, natural: R.natural, step: R.step, why: R.why || null, dt: R.dt ?? null, g: R.g ?? null, hMoved: R.hMoved ?? null, tMoved: R.tMoved ?? null, hInFrame: R.hInFrame ?? null, heldLive: R.heldLive ?? null, between: R.between ?? null, lateAt: R.lateAt ?? null, answered: R.answered || null, alive: !!R.alive, inForce: R.inForce ?? null, plantReads: R.plantReads ?? null, readsAfterGrowth: R.readsAtGrowth != null ? R.plantReads - R.readsAtGrowth : null } : null; })()';
  const winHold = async (label, kind, control) => { globalThis.__firstNotchUntil = WINDOW_UNTIL(kind); try { return await firstHold(label, control ? 'window placed, control' : 'window placed', { after: WIN, cadence: 'shortHold' }); } finally { globalThis.__firstNotchUntil = null; } };
  const wI = await winHold('a row the scroll brought in grows inside the window', 'inside', false), wIc = await winHold('a row the scroll brought in grows inside the window, control', 'inside', true);
  const wX = await winHold('a row the scroll brought in grows inside the window, another took its height in the gap before that frame', 'coincide', false), wXs = await winHold('the same coincidence, the watch stopped at the growth (the painted measure control)', 'stopped', false);
  const wA = await winHold('a row the scroll brought in grows after the window', 'after', false), wAc = await winHold('a row the scroll brought in grows after the window, control', 'after', true);
  const winScene = (h, kind) => !!h.after && h.after.landed === 1 && h.after.step === 3 && h.after.heldLive === true && (kind === 'stopped' ? !h.after.alive : h.after.alive) && h.after.g >= 200 && h.after.dt != null
    && (kind === 'after' ? h.after.dt >= WINDOW_MS + 200 : h.after.dt <= WINDOW_MS - WINDOW_MARGIN_MS) && (kind === 'coincide' || kind === 'stopped' ? h.after.lateAt != null && h.after.lateAt <= h.after.dt : true);
  const wPre = (h, kind) => (winScene(h, kind) ? '' : `PRECONDITION NOT MET (${h.after?.why || (h.after?.heldLive === false ? 'the card read before the scroll or the card at the top was detached before the read' : 'the row grew ' + (h.after?.dt ?? '?') + ' ms after the scroll, the watch alive ' + h.after?.alive)}) — `);
  check(`§4h INSIDE THE WINDOW (r4599): ${wPre(wI, 'inside')}a row the scroll brought in grew ${wI.after?.g} px ${wI.after?.dt} ms after it: the card read before the scroll stands (${wI.after?.hMoved} px as painted; the card at the top ${wI.after?.tMoved} px; read inside the frame of the growth ${wI.after?.hInFrame} px; the watch answered ${JSON.stringify(wI.after?.answered)}; ± ${NOTCH_TOL_PX})`,
    winScene(wI, 'inside') && Math.abs(wI.after.hMoved) <= NOTCH_TOL_PX, JSON.stringify(wI.after));
  // a control is judged on the FACT that its plant was in force at the product's read (its witness); not in force after it was placed
  // again where the product reads = a NAMED SKIP (counted by the gate's skip line) and the leg it guards PARTIAL in this run (r5039)
  const ctlJudge = (h, kind, text, moved, legName) => {
    if (winScene(h, kind) && h.after.inForce === false) { console.log(`  ⊘ SKIP §4h CONTROL (${text}): the plant was never read by the product at or after the growth (${h.after.plantReads} read(s), ${h.after.readsAfterGrowth} after it) — the leg ${legName} is PARTIAL in this run`); return; }
    check(`§4h CONTROL: ${wPre(h, kind)}${text} ⇒ ${moved(h)} — the leg can go red (the plant read ${h.after?.readsAfterGrowth ?? '?'} time(s) at or after the growth)`, winScene(h, kind) && h.after.inForce === true && Math.abs(kind === 'inside' ? h.after.hMoved : h.after.tMoved) > NOTCH_TOL_PX, JSON.stringify(h.after));
  };
  ctlJudge(wIc, 'inside', "the answer handed the view's top as its line", (h) => `the card read before the scroll drops (${h.after?.hMoved} px; more than ${NOTCH_TOL_PX})`, 'INSIDE THE WINDOW');
  // THE COINCIDENCE, PLACED (row B-3e8b, 主开发 r5080 — the third hosted run's −258 once in four tries, Node 22 try 2): a second row the
  // scroll brought in takes 258 px in the gap between the paint and the frame of the growth; the watch answers both in that frame (516)
  check(`§4h INSIDE THE WINDOW, A LATE SETTLE IN THE GAP BEFORE THE FRAME OF THE GROWTH (r5080): ${wPre(wX, 'coincide')}a row the scroll brought in grew ${wX.after?.g} px ${wX.after?.dt} ms after it and another took 258 px at ${wX.after?.lateAt} ms, before that frame: what the person sees of the card read before the scroll stands (${wX.after?.hMoved} px painted; the watch answered ${JSON.stringify(wX.after?.answered)}; ± ${NOTCH_TOL_PX})`,
    winScene(wX, 'coincide') && Math.abs(wX.after.hMoved) <= NOTCH_TOL_PX, JSON.stringify(wX.after));
  check(`§4h CONTROL: ${wPre(wX, 'coincide')}the same card read from the starting point of before, inside the frame of the growth ⇒ it reads the late settle as a move (${wX.after?.hInFrame} px; −258 ± ${NOTCH_TOL_PX}, the hosted reading) — the coincidence fell where the hosted run met it; this control rests on the browser's frame order (rAF callbacks before that frame's ResizeObserver delivery: Chrome 157 and 158), a fact of the browser, not of the product`,
    winScene(wX, 'coincide') && Math.abs(wX.after.hInFrame + 258) <= NOTCH_TOL_PX, JSON.stringify(wX.after));
  check(`§4h CONTROL: ${wPre(wXs, 'stopped')}the same coincidence, the watch stopped at the growth (the browser's anchoring kept off) ⇒ nothing answers and the painted card read moves by both growths (${wXs.after?.hMoved} px; more than ${NOTCH_TOL_PX}) — the painted measure can go red`,
    winScene(wXs, 'stopped') && wXs.after.hMoved > NOTCH_TOL_PX, JSON.stringify(wXs.after));
  check(`§4h AFTER THE WINDOW (r4599, as the product has it): ${wPre(wA, 'after')}a row the scroll brought in grew ${wA.after?.g} px ${wA.after?.dt} ms after it: the card at the top stands (${wA.after?.tMoved} px as painted; the card read before the scroll ${wA.after?.hMoved} px — the limit: a real height later than the window is answered for the card at the top; ± ${NOTCH_TOL_PX})`,
    winScene(wA, 'after') && Math.abs(wA.after.tMoved) <= NOTCH_TOL_PX, JSON.stringify(wA.after));
  ctlJudge(wAc, 'after', 'the answer handed the line of before the scroll', (h) => `the card at the top moves (${h.after?.tMoved} px; more than ${NOTCH_TOL_PX})`, 'AFTER THE WINDOW');
  const c1 = await heldOn("control (1')", "(1')", LANDED_UNTIL, PAIRF);
  const c1Scene = c1.slabs >= 1 && c1.carries >= 1 && c1.reader.length === 0 && !!c1.after && c1.after.landed === 1;
  check(`§4h CONTROL (1'): ${c1Scene ? '' : 'PRECONDITION NOT MET (the first notch held until the slab landed, carried into it, no reader read: slabs ' + c1.slabs + ', carried landings ' + c1.carries + ', reader traces ' + c1.reader.length + ') — '}with no reader read at the insert the carried notch lands whole and the card misses at the landing by more than ${NOTCH_TOL_PX} px (${c1.law.carried} px)`, c1Scene && Math.abs(c1.law.carried ?? 0) > NOTCH_TOL_PX, JSON.stringify({ law: c1.law, after: c1.after }));
  const c2 = await heldOn('control (2) off', '(2) off', PAIR_UNTIL, PAIRF), c3 = await heldOn('control (2) twice', '(2) twice', PAIR_UNTIL, PAIRF);
  const red = (c) => c.slabs >= 1 && !c.law.ok;
  const pairScene = (c) => c.slabs >= 1 && !!c.after && c.after.landed === 1 && !!c.after.pair && typeof c.after.pair === 'object';
  check(`§4h CONTROL (2), the pair: ${pairScene(c2) && pairScene(c3) ? '' : 'PRECONDITION NOT MET (inside the held first notch a row wholly above the view grew 150 px on both pages: ' + JSON.stringify([c2.after?.pair, c3.after?.pair]) + ') — '}the settle watch blinded (no gapUp:settle: ${c2.settle.length === 0}, worst ${c2.law.worst} px) or answered beside the browser's anchoring (its answers ${JSON.stringify(c3.settle)}, worst ${c3.law.worst} px) — at least one misses a notch by more than ${NOTCH_TOL_PX} px (here: ${[red(c2) && 'blinded', red(c3) && 'twice'].filter(Boolean).join(' + ') || 'none'})`, pairScene(c2) && pairScene(c3) && c2.settle.length === 0 && c3.settle.length > 0 && (red(c2) || red(c3)), JSON.stringify({ off: c2.law, twice: c3.law, plant: [c2.after, c3.after] }));
  // MUST 1: A PERSON WITH ANOTHER FONT SIZE OR UI SCALE — the same first hold at a chat font size of 16 (the list's zoom 16/14)
  // and at a UI scale of 125 % (the body's zoom on a desktop): the watch's seed and its compare in one unit
  for (const [label, store] of [['at chat font 16', { termFontSize: '16' }], ['at UI scale 125 %', { 'vibespace.uiScale': '125' }]]) {
    const z = await firstHold(label, null, { store });
    // (1')'s named bound (r2395): a range's shortfall LARGER than the carried notch leaves its rest, as before the cure — read
    // from the landing's own traces (gapUp:reader's rest, wheelCarry's px + less), in layout px, times the zoom on screen
    const zt = z.zoom ? z.zoom[0] * z.zoom[1] : 1, rest = (z.reader[0] || [0, 0])[1] || 0, landed = (z.less[0] || [0, 0]), leftover = Math.max(0, rest - ((landed[0] || 0) + (landed[1] || 0))) * zt;
    const lawZ = !!z.law && !z.law.why && !z.law.lost && Math.abs(z.law.worst) <= NOTCH_TOL_PX && Math.abs(z.law.carried - leftover) <= NOTCH_TOL_PX;
    check(`§4h ${label.toUpperCase()} (the zooms ${JSON.stringify(z.zoom)}): a slab landed and every notch moved the card at the reading line exactly its own distance (${z.law.notch} px on screen; worst ${z.law.worst} px), the carried notches exactly once (${z.law.carried} px; the range's own leftover ${Math.round(leftover)} px)`, z.slabs >= 1 && lawZ && !!z.zoom && (z.zoom[0] !== 1 || z.zoom[1] !== 1), JSON.stringify({ zoom: z.zoom, law: z.law, rest, landed, leftover: Math.round(leftover) }));
  }
  // MUST 2 (a): search opens while the watch lives, tail runs folded above the reading line — each depth ONE page: «exactly once» = the
  // card at the reading line moves with the watch as it moves in the browser's own world on the same page (the runs pass's own restore
  // can move it in both: measured 314 px at one depth, the release's — never the watch's second answer: −4 337 px at the first cure).
  // A depth is read again (a fresh page) only when its scene did not hold, at most SEARCH_TRIES times, each miss named
  const SEARCH_TRIES = 3, scenes = [], tries = [];
  for (const tail of ['near1', 'near2', 'near3']) {
    let x = null, k = 0;
    while (k < SEARCH_TRIES) { k++; x = await searchScene(tail); if (x.ok) break; }
    scenes.push(x); tries.push(k);
  }
  const held = scenes.filter((x) => x && x.ok);
  const once = (x) => x.watch.open != null && x.browser.open != null && Math.abs(x.watch.open - x.browser.open) <= NOTCH_TOL_PX && x.watch.closed != null && x.browser.closed != null && Math.abs(x.watch.closed - x.browser.closed) <= NOTCH_TOL_PX;
  const missed = scenes.filter((x) => !x || !x.ok).map((x) => (x ? x.tail + ': ' + x.why : '?'));
  check(`§4h ONE AUTHORITY, SEARCH OPENS: ${missed.length ? 'PRECONDITION NOT MET at ' + missed.length + ' of ' + scenes.length + ' depths in ' + SEARCH_TRIES + ' tries (' + missed.join('; ') + ') — ' : ''}at ${held.length} of ${scenes.length} depths (tries ${tries.join(' / ')}) the scene held (the watch alive, the slab in the page, run headers folded above the reading line) and the card at the reading line moved with the watch exactly as in the browser's own world on the same page (open / closed — the watch: ${held.map((x) => x.watch.open + ' / ' + x.watch.closed).join(', ') || '-'}; the browser alone: ${held.map((x) => x.browser.open + ' / ' + x.browser.closed).join(', ') || '-'} px; ± ${NOTCH_TOL_PX})`, held.length === scenes.length && held.every(once), JSON.stringify(scenes));   // every depth it names (r4847 (2)): the scene made by construction holds at each, or the depth is a named failing line
  // B-3e8b's search unit (主开发 r3257): THE RUNS PASS's OWN PUT-BACK keeps the card at the reading line when search UNFOLDS
  // the runs above it and when it FOLDS them again — by distance, in both worlds (at 11f016e6c: 314 / 314 px one notch into
  // the tail, the same with the watch stopped: the search bar above the list shifted every row's offsetTop by its height,
  // so the pass anchored on a card already out of sight)
  const stays = (r) => r.open != null && Math.abs(r.open) <= NOTCH_TOL_PX && r.closed != null && Math.abs(r.closed) <= NOTCH_TOL_PX;
  const turns = held.flatMap((x) => [{ tail: x.tail, world: 'watch', ...x.watch }, { tail: x.tail, world: 'alone', ...x.browser }]);
  check(`§4h SEARCH OPENS AND CLOSES WITH RUNS FOLDED ABOVE THE READING LINE: the card at the reading line stays where it was — on open and on close, with the watch and in the browser's own world (${turns.length} turns: ${turns.map((r) => r.tail + (r.world === 'alone' ? '·alone' : '') + ' ' + r.open + ' / ' + r.closed).join(', ')} px; ± ${NOTCH_TOL_PX})`, turns.length >= 2 && turns.every(stays), JSON.stringify(turns));
  // (c): a carry in the task of a pending change, and its control (the watch's flush blinded for that carry)
  const ct = await firstHold('a carry with a pending change', null, { after: CARRY_SAME_TASK(false) }), cc = await firstHold('a carry with a pending change, control', null, { after: CARRY_SAME_TASK(true) });
  check(`§4h ONE AUTHORITY, A CARRY IN THE TASK OF A PENDING CHANGE: ${ct.after?.ok && cc.after?.ok ? '' : 'PRECONDITION NOT MET (' + (ct.after?.why || cc.after?.why || 'no page') + ') — '}a row above the reading line grew 150 px and a ${ct.after?.carry} px carry landed in the same task — the card at the reading line moved exactly the carry (${ct.after?.moved} px; ± ${NOTCH_TOL_PX}); CONTROL, the watch's flush blinded for that carry: it moved ${cc.after?.moved} px (the growth answered by no one)`, !!ct.after?.ok && Math.abs(ct.after.moved - ct.after.carry) <= NOTCH_TOL_PX && !!cc.after?.ok && Math.abs(cc.after.moved - cc.after.carry) > NOTCH_TOL_PX, JSON.stringify({ leg: ct.after, control: cc.after }));
  // MUST 2 (b): a card above the reading line replaced by a newer, taller version of itself while the watch lives
  // B-3e8b's REMAINDER (主开发 r3822, measured by probe 8: the landing is exact; 267 ms later a runs rebuild put ITS anchor, the
  // topmost element, back, and the card being read moved by what the rebuild changed between them — 27 px on the box, 38 px on
  // the hosted runner, where the rebuild ran inside the first notch). THE LAW: while a slab settles above the reader, a runs
  // rebuild keeps THE CARD BEING READ still; outside a slab's life the older rule stands (a fold never moves a scrolled reader:
  // the topmost element keeps its place). THE RACE PLACED: the first notch is held until the slab has landed AND a runs rebuild
  // has run after it; three fresh pages; the control the same with the rebuild's anchor forced to the topmost element.
  const RAL = '(() => { const R = window.__ral; return R ? { landed: R.landed, natural: R.natural, step: R.step, cardMoved: R.cardMoved ?? null, topMoved: R.topMoved ?? null, alive: !!R.alive, read: R.read ?? null, anchorIs: R.anchorIs ?? null } : null; })()';
  const placedHold = async (label, control, after = RAL) => {
    globalThis.__firstNotchUntil = RUNS_UNTIL;
    try { return await firstHold(label, control ? 'runs placed, control' : 'runs placed', { after, cadence: 'shortHold' }); } finally { globalThis.__firstNotchUntil = null; }
  };
  const placed = [], placedCtl = [];
  for (let k = 1; k <= 3; k++) placed.push(await placedHold(`a runs rebuild inside the first notch, ${k} of 3`, false, k === 1 ? BOTH_RULES : RAL));
  placedCtl.push(await placedHold('a runs rebuild inside the first notch, control', true));
  const ralOf = (h) => (h.after && h.after.ral) || h.after || null;
  // the scene held: the slab landed, the header stood between the topmost element and the card, the rebuild ran while the watch lived
  const inScene = (h) => { const R = ralOf(h); return !!R && R.landed === 1 && R.step === 2 && R.alive && R.cardMoved != null && R.topMoved != null; };
  check(`§4h A RUNS REBUILD WHILE THE SLAB SETTLES KEEPS THE CARD BEING READ (主开发 r3822, placed: the first notch held until the slab landed; a 27 px run header between the topmost element and the card, then a real rebuild that takes it away; three fresh pages): ${placed.every(inScene) ? '' : 'PRECONDITION NOT MET (the scene on every page) — '}the card moved ${placed.map((h) => ralOf(h)?.cardMoved).join(' / ')} px, the topmost element ${placed.map((h) => ralOf(h)?.topMoved).join(' / ')} px (± ${NOTCH_TOL_PX}); the pass's anchor ${placed.map((h) => ralOf(h)?.anchorIs).join(' / ')}`,
    placed.every(inScene) && placed.every((h) => Math.abs(ralOf(h).cardMoved) <= NOTCH_TOL_PX && Math.abs(ralOf(h).topMoved - ralOf(h).cardMoved) > NOTCH_TOL_PX && ralOf(h).read === true && ralOf(h).anchorIs === 'card'), JSON.stringify(placed.map((h) => ralOf(h))));
  check(`§4h CONTROL: the rebuild keeps the topmost element (the cure blinded) ⇒ the card being read moves by what the rebuild took away between them (${ralOf(placedCtl[0])?.cardMoved} px; more than ${NOTCH_TOL_PX}; the pass's anchor ${ralOf(placedCtl[0])?.anchorIs}) — the leg can go red`,
    inScene(placedCtl[0]) && Math.abs(ralOf(placedCtl[0]).cardMoved) > NOTCH_TOL_PX && ralOf(placedCtl[0]).read === false, JSON.stringify(ralOf(placedCtl[0])));
  // BOTH RULES ON ONE PAGE (r3822 hold 2): the same placed rebuild inside the slab's life keeps the card being read; a moment after
  // the watch has ended it keeps the topmost element (the older rule, untouched)
  const both = placed[0] && placed[0].after && placed[0].after.both;
  check(`§4h BOTH RULES: ${both && both.ok ? '' : 'PRECONDITION NOT MET (' + ((both && both.why) || 'no scene') + ') — '}a rebuild inside the slab's life keeps the card being read (it moved ${both?.inside?.card} px, the topmost element ${both?.inside?.top} px; the pass's anchor the card: ${both?.inside?.read}); the same rebuild after the watch ended keeps the topmost element (it moved ${both?.after?.top} px, the card ${both?.after?.card} px; the card: ${both?.after?.read}; ± ${NOTCH_TOL_PX})`,
    !!both && both.ok && Math.abs(both.inside.card) <= NOTCH_TOL_PX && Math.abs(both.inside.top) > NOTCH_TOL_PX && Math.abs(both.after.top) <= NOTCH_TOL_PX && Math.abs(both.after.card) > NOTCH_TOL_PX
      && both.inside.read === true && both.after.read === false, JSON.stringify(both || null));   // r4397 (5): the pass's own anchor — the card inside, the topmost element after
  // THE RACE (r4332): a rebuild in the same frame as a notch's scroll, before the watch's frame records it — the card read before
  // the latest notch keeps its place (the watch reads the unrecorded move as its frame would)
  const RACE = '(() => { const R = window.__ral; return R ? { landed: R.landed, natural: R.natural, step: R.step, bMoved: R.bMoved ?? null, alive: !!R.alive, read: R.read ?? null, anchorIs: R.anchorIs ?? null, aReadable: R.aReadable ?? null } : null; })()';
  const raceHold = async (label, control) => {
    globalThis.__firstNotchUntil = RACE_UNTIL;
    try { return await firstHold(label, control ? 'race placed, control' : 'race placed', { after: RACE, cadence: 'shortHold' }); } finally { globalThis.__firstNotchUntil = null; }
  };
  const rc = await raceHold('a rebuild in the frame of a notch, before the watch records it', false), rcc = await raceHold('a rebuild in the frame of a notch, before the watch records it, control', true);
  const rcScene = (h) => !!h.after && h.after.landed === 1 && h.after.step === 3 && h.after.alive && h.after.bMoved != null;
  check(`§4h A RUNS REBUILD IN THE FRAME OF A NOTCH, BEFORE THE WATCH RECORDS IT (line 960's race, r4332): ${rcScene(rc) ? '' : 'PRECONDITION NOT MET (two scrolls up inside the watch, a header painted between the two candidate cards, the rebuild in the second scroll\'s task) — '}the card read before the latest notch keeps its place (it moved ${rc.after?.bMoved} px; ± ${NOTCH_TOL_PX}) — the pass's anchor that card (${rc.after?.anchorIs})`,
    rcScene(rc) && Math.abs(rc.after.bMoved) <= NOTCH_TOL_PX && rc.after.read === true && rc.after.anchorIs === 'B', JSON.stringify(rc.after));
  check(`§4h CONTROL: ${rcScene(rcc) && rcc.after.aReadable === true ? '' : 'PRECONDITION NOT MET (the card from before the previous notch still a card the rebuild reads: ' + rcc.after?.aReadable + ') — '}the rebuild handed the card from before the previous notch (the watch before this cure) ⇒ the card read before the latest notch moves by what the rebuild took away (${rcc.after?.bMoved} px; more than ${NOTCH_TOL_PX}; the pass's anchor ${rcc.after?.anchorIs}) — the leg can go red`,
    rcScene(rcc) && rcc.after.aReadable === true && Math.abs(rcc.after.bMoved) > NOTCH_TOL_PX && rcc.after.anchorIs === 'A', JSON.stringify(rcc.after));
  // LINE 960's FOLLOW (r4397 (1)): AT THE EDGE — the watch's card a sliver at the bottom (the release's rule), well in view (kept); the
  // control: any overlap (line 960 as taken) keeps the sliver and moves what the person reads at the top
  const EDGE = '(() => { const R = window.__ral; return R ? { landed: R.landed, natural: R.natural, step: R.step, why: R.why || null, cardAt: R.cardAt ?? null, ch: R.ch ?? null, same: !!R.same, pushed: R.pushed ?? null, cardAtRebuild: R.cardAtRebuild ?? null, sameAtRebuild: !!R.sameAtRebuild, alive: !!R.alive, read: R.read ?? null, anchorIs: R.anchorIs ?? null, topMoved: R.topMoved ?? null, cardMoved: R.cardMoved ?? null } : null; })()';
  const edgeHold = async (label, kind, control) => {
    globalThis.__firstNotchUntil = EDGE_UNTIL(kind);
    try { return await firstHold(label, control ? 'edge placed, control' : 'edge placed', { after: EDGE, cadence: 'shortHold' }); } finally { globalThis.__firstNotchUntil = null; }
  };
  const eS = await edgeHold('the watch card a sliver at the bottom edge, then a runs rebuild', 'sliver', false), eW = await edgeHold('the watch card well in view, then a runs rebuild', 'well', false), eC = await edgeHold('the watch card a sliver at the bottom edge, then a runs rebuild, control', 'sliver', true);
  const edgeScene = (h) => !!h.after && h.after.landed === 1 && h.after.step === 3 && h.after.alive && h.after.same && h.after.sameAtRebuild;
  const pre = (h, what) => (edgeScene(h) ? '' : `PRECONDITION NOT MET (${what}; ${h.after?.why || 'the card at ' + (h.after?.cardAt ?? '?') + ' px of ' + (h.after?.ch ?? '?')}; at the rebuild ${h.after?.cardAtRebuild ?? '?'} px, the watch's card ${h.after?.sameAtRebuild ? 'it' : 'another'}) — `);
  check(`§4h THE CARD BEING READ, AT THE EDGE (line 960's follow, r4397 (1)): ${pre(eS, 'the watch card a sliver at the bottom')}the watch's card showing ${eS.after?.ch != null && eS.after?.cardAtRebuild != null ? eS.after.ch - eS.after.cardAtRebuild : '?'} px at the bottom when the rebuild runs is not the one read: the rebuild keeps the topmost element (it moved ${eS.after?.topMoved} px; the pass's anchor ${eS.after?.anchorIs}; ± ${NOTCH_TOL_PX})`,
    edgeScene(eS) && Math.abs(eS.after.topMoved) <= NOTCH_TOL_PX && eS.after.read === false, JSON.stringify(eS.after));
  check(`§4h …AND WELL IN VIEW: ${pre(eW, 'the watch card at a quarter of the view')}the watch's card at ${eW.after?.cardAtRebuild} px of ${eW.after?.ch} when the rebuild runs is the one read: the rebuild keeps it (it moved ${eW.after?.cardMoved} px, the topmost element ${eW.after?.topMoved}; the pass's anchor ${eW.after?.anchorIs}; ± ${NOTCH_TOL_PX})`,
    edgeScene(eW) && Math.abs(eW.after.cardMoved) <= NOTCH_TOL_PX && Math.abs(eW.after.topMoved) > NOTCH_TOL_PX && eW.after.read === true && eW.after.anchorIs === 'card', JSON.stringify(eW.after));
  check(`§4h CONTROL: ${pre(eC, 'the watch card a sliver at the bottom')}any overlap counted (line 960 as taken) ⇒ the sliver (${eC.after?.ch != null && eC.after?.cardAtRebuild != null ? eC.after.ch - eC.after.cardAtRebuild : '?'} px showing) is kept and what the person reads at the top moves by what the rebuild took away (${eC.after?.topMoved} px; more than ${NOTCH_TOL_PX}; the pass's anchor ${eC.after?.anchorIs}) — the leg can go red`,
    edgeScene(eC) && Math.abs(eC.after.topMoved) > NOTCH_TOL_PX && eC.after.read === true, JSON.stringify(eC.after));
  // LINE 960's FOLLOW (r4397 (2)): ONE READER — the settle's own answer, in the task of a notch the frame has not recorded
  const LN = '(() => { const R = window.__ral; return R ? { landed: R.landed, natural: R.natural, step: R.step, why: R.why || null, skip: !!R.skip, lines: R.lines || null, bMoved: R.bMoved ?? null, alive: !!R.alive } : null; })()';
  const lineHold = async (label, control, blind) => {
    globalThis.__firstNotchUntil = LINE_UNTIL;
    try { return await firstHold(label, blind || (control ? 'line placed, control' : 'line placed'), { after: LN, cadence: 'shortHold' }); } finally { globalThis.__firstNotchUntil = null; }
  };
  const ln = await lineHold('the settle answers in the task of a notch, before the watch records it', false), lnc = await lineHold('the settle answers in the task of a notch, before the watch records it, control', true);
  const lnScene = (h) => !!h.after && h.after.landed === 1 && h.after.step === 3 && h.after.alive && h.after.bMoved != null;
  // a scene the leg's own reads say did not form (a row it could not take, an identity gone between the scrolls) is a NAMED SKIP, counted
  // by the gate's skip line, the leg PARTIAL in that run (主开发 r5098) — never a red for a scene that did not form, never a green
  const lnJudge = (h, name, text, ok) => {
    if (h.after?.skip) { console.log(`  ⊘ SKIP §4h ${name}: the scene did not form (${h.after.why}) — the leg ONE READER is PARTIAL in this run`); return; }
    check(`§4h ${name}: ${lnScene(h) ? '' : 'PRECONDITION NOT MET (' + (h.after?.why || 'two scrolls inside the watch, a row grown on each side of the line read before the second, the flush in its task') + ') — '}${text}`, lnScene(h) && ok(h.after), JSON.stringify(h.after));
  };
  lnJudge(ln, "ONE READER: THE SETTLE's ANSWER IN THE TASK OF A NOTCH, BEFORE THE WATCH RECORDS IT (line 960's follow, r4397 (2))", `the answer reads the line as the frame would record it: the row above it answered, the row below it not — the card read before the latest notch keeps its place (it moved ${ln.after?.bMoved} px; ± ${NOTCH_TOL_PX}; the lines ${JSON.stringify(ln.after?.lines)})`, (a) => Math.abs(a.bMoved) <= NOTCH_TOL_PX);
  lnJudge(lnc, 'CONTROL', `the answer handed the view's top as its line (the record's line once old) ⇒ the row above the line read before the notch goes unanswered and that card moves by it (${lnc.after?.bMoved} px; more than ${NOTCH_TOL_PX}) — the leg can go red`, (a) => Math.abs(a.bMoved) > NOTCH_TOL_PX);
  // THE RED COPY (主开发 r5223): the slab dropped by the product's own drop between the two scrolls — the leg reads RED by the watch's end,
  // never a skip (the rows are gone with the watch)
  const lnd = await lineHold('the settle answers in the task of a notch, the slab dropped between the scrolls (the red copy)', false, 'line placed, slab dropped');
  check(`§4h RED COPY: the slab dropped between the two scrolls ⇒ ONE READER reads RED by the watch's own end, not a skip (${lnd.after?.skip ? 'a SKIP: ' : ''}${lnd.after?.why})`,
    !!lnd.after && lnd.after.step === -1 && !lnd.after.skip && /the watch had ended before the second scroll \(its own end: gapDrop\)/.test(String(lnd.after.why)), JSON.stringify(lnd.after));
  // LINE 960's FOLLOW (r4397 (3)): a stamped write whose re-seed is still queued is recorded — the watch's card stays the landing's own
  const SP = '(() => { const R = window.__ral; return R ? { landed: R.landed, natural: R.natural, step: R.step, why: R.why || null, same: R.same ?? null, wrote: R.wrote ?? null, alive: !!R.alive } : null; })()';
  const stampHold = async (label, control) => {
    globalThis.__firstNotchUntil = STAMP_UNTIL;
    try { return await firstHold(label, control ? 'stamp placed, control' : 'stamp placed', { after: SP, cadence: 'shortHold' }); } finally { globalThis.__firstNotchUntil = null; }
  };
  const sp = await stampHold('a stamped write in the task of a runs pass, before its re-seed', false), spc = await stampHold('a stamped write in the task of a runs pass, before its re-seed, control', true);
  const spScene = (h) => !!h.after && h.after.landed === 1 && h.after.step === 3 && h.after.alive && h.after.wrote === -27;
  check(`§4h A STAMPED WRITE NOT YET RE-SEEDED IS RECORDED (line 960's follow, r4397 (3)): ${spScene(sp) ? '' : 'PRECONDITION NOT MET (' + (sp.after?.why || 'a 27 px stamped write inside the watch, before any scroll') + ') — '}the watch's card read in the write's own task is the one read before it (${sp.after?.same})`,
    spScene(sp) && sp.after.same === true, JSON.stringify(sp.after));
  check(`§4h CONTROL: the same 27 px unstamped (a person's move) ⇒ the card read then is another (${spc.after?.same === false ? 'another' : String(spc.after?.same)}) — the leg can tell them apart`,
    spScene(spc) && spc.after.same === false, JSON.stringify(spc.after));
  // LINE 960's MUST (r4273): a continuous scroll (one burst) carries the view a viewport and a half away from the watch's card; a runs
  // rebuild then keeps what the person looks at (the topmost element in view), never the off-screen card
  const FL = '(() => { const R = window.__ral; return R ? { landed: R.landed, natural: R.natural, step: R.step, travelled: R.travelled ?? null, cardBelow: R.cardBelow ?? null, scrolls: R.scrolls || 0, topMoved: R.topMoved ?? null, alive: !!R.alive, read: R.read ?? null, anchorIs: R.anchorIs ?? null } : null; })()';
  const flingHold = async (label, control) => {
    globalThis.__firstNotchUntil = FLING_UNTIL;
    try { return await firstHold(label, control ? 'fling placed, control' : 'fling placed', { after: FL, cadence: 'shortHold' }); } finally { globalThis.__firstNotchUntil = null; }
  };
  const fl = await flingHold('a continuous scroll away from the card, then a runs rebuild', false), flc = await flingHold('a continuous scroll away from the card, then a runs rebuild, control', true);
  // the scene: the card OUT OF VIEW (below the view's bottom: more than a viewport from its top) when the rebuild runs — measured on
  // the kit, the drag travels ~520 px of its 1200 (the settle's own writes answer part of it), and the card sits ~460 px below the view
  const flScene = (h) => !!h.after && h.after.landed === 1 && h.after.step === 3 && h.after.alive && h.after.cardBelow > 0;
  check(`§4h A CONTINUOUS SCROLL AWAY FROM THE WATCH's CARD, THEN A RUNS REBUILD (line 960's must, r4273): ${flScene(fl) ? '' : 'PRECONDITION NOT MET (inside the watch, one burst of ' + (fl.after?.scrolls ?? '?') + ' scroll events left the card out of view: ' + (fl.after?.cardBelow ?? '?') + ' px below it) — '}what the person looks at keeps its place: the topmost element moved ${fl.after?.topMoved} px (the view travelled ${fl.after?.travelled} px in ${fl.after?.scrolls} scroll events, the card ${fl.after?.cardBelow} px below the view; ± ${NOTCH_TOL_PX})`,
    flScene(fl) && Math.abs(fl.after.topMoved) <= NOTCH_TOL_PX && fl.after.read === false, JSON.stringify(fl.after));   // r4397 (5): the release's rule ran (the topmost element)
  check(`§4h CONTROL: the in-view test blinded (line 960 as taken: the off-screen card kept) ⇒ what the person looks at moves by what the rebuild took away (${flc.after?.topMoved} px; more than ${NOTCH_TOL_PX}) — the leg can go red`,
    flScene(flc) && Math.abs(flc.after.topMoved) > NOTCH_TOL_PX && flc.after.read === true, JSON.stringify(flc.after));
  // THE SECOND MOVER (主开发 r3898): a row between the viewport's top and the card being read grows inside the held first notch, before
  // any scroll — the watch answers it (its line is the landing reader card's until the first scroll); at the default size and at a
  // chat font of 16; the control (the watch started with no reader card: the viewport's top as its line) misses by the growth
  const GROWN = '(() => { const G = window.__grow; return G ? { landed: G.landed, row: G.row === "none" ? "none" : !!G.row, rowAt: G.rowAt ?? null } : null; })()';
  const growHold = async (label, control, store = null) => {
    globalThis.__firstNotchUntil = GROW_UNTIL;
    try { return await firstHold(label, control ? 'grow placed, control' : 'grow placed', { store, after: GROWN, cadence: 'shortHold' }); } finally { globalThis.__firstNotchUntil = null; }
  };
  const gr = [await growHold('a row grows between the top and the card inside the first notch', false), await growHold('a row grows between the top and the card inside the first notch, at chat font 16', false, { termFontSize: '16' })];
  const grc = await growHold('a row grows between the top and the card inside the first notch, control', true);
  const grew = (h) => !!h.after && h.after.landed === 1 && h.after.row === true && !!h.law && h.law.L === 0;
  check(`§4h A ROW BETWEEN THE TOP AND THE CARD GROWS BEFORE ANY SCROLL (主开发 r3898): ${gr.every(grew) ? '' : 'PRECONDITION NOT MET (the slab landed and a row between the viewport top and the card grew 209 px inside the held first notch, at both sizes) — '}the card at the reading line moved exactly one notch (carried ${gr.map((h) => h.law.carried).join(' / ')} px at the default size / font 16, the row ${gr.map((h) => h.after?.rowAt).join(' / ')} px below the top; ± ${NOTCH_TOL_PX})`,
    gr.every(grew) && gr.every((h) => h.law.ok), JSON.stringify(gr.map((h) => ({ law: h.law, after: h.after }))));
  check(`§4h CONTROL: the watch started with no reader card (its line the viewport top before any scroll) ⇒ the card misses by the row's growth (carried ${grc.law.carried} px; more than ${NOTCH_TOL_PX}) — the leg can go red`,
    grew(grc) && Math.abs(grc.law.carried ?? 0) > NOTCH_TOL_PX, JSON.stringify({ law: grc.law, after: grc.after }));
  const sw = await firstHold('a card above replaced', null, { after: SWAP_ABOVE });
  check(`§4h ONE AUTHORITY, A CARD REPLACED ABOVE THE READING LINE: the scene held (the watch alive ${sw.after?.alive}, the card ${sw.after?.grew} px taller) and the card at the reading line stayed (${sw.after?.moved} px; ± ${NOTCH_TOL_PX})`, !!sw.after?.ok && sw.after.alive && sw.after.grew >= 150 && Math.abs(sw.after.moved) <= NOTCH_TOL_PX, JSON.stringify(sw.after));
}

// ── THE REAL HOME IS UNTOUCHED (test-chat-paging §5's rule, carried with the move): not "no new entry at all" — this box runs
// many real sessions concurrently and a genuine project dir may appear mid-run. What must be impossible is a FIXTURE entry.
// src/fixture-guard.js owns the predicate; the sweep suite runs the same one over the whole dir.
{
  const after = (() => { try { return fs.readdirSync(REAL_PROJECTS, { withFileTypes: true }); } catch { return []; } })();
  const added = after.filter((d) => !realBefore.has(d.name))
    .map((d) => ({ name: d.name, mtimeMs: (() => { try { return fs.statSync(path.join(REAL_PROJECTS, d.name)).mtimeMs; } catch { return Date.now(); } })() }));
  const lit = fixtureLitter(added);
  check(`the real ~/.claude/projects gained no fixture entry (${added.length} new entr${added.length === 1 ? 'y' : 'ies'} from concurrent real sessions, 0 of them fixtures)`,
    lit.offenders.length === 0, JSON.stringify(lit.offenders.slice(0, 3)));
  check('…and this suite\'s OWN project dir is not among them (it lives under the isolated home)',
    !after.some((d) => d.name === path.basename(PROJ)), path.basename(PROJ));
  check('the fixture really was written (the isolation did not just skip the work)',
    fs.existsSync(path.join(PROJ, `${SID3}.jsonl`)) && fs.statSync(path.join(PROJ, `${SID3}.jsonl`)).size > 30e6,
    path.join(PROJ, `${SID3}.jsonl`));
}

ws.close();
console.log(failed === 0 ? `ALL PASS (${passed})` : `${failed} FAILED`);
process.exit(failed ? 1 : 0);
