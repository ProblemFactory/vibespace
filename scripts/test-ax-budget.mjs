#!/usr/bin/env node
// THE ACCESSIBILITY-TREE MEASUREMENT LEG (docs/design-accessibility-tree.zh.md
// §3 row 0 in its §8 lean form; §4 the counting rules). 2.369.144's root cause:
// a UIA client had Chrome's accessibility mode on, the VibeSpace tab carried
// 50,150 accessible nodes and the browser UI thread spent 39.5 s in
// HandleAXEvents. This suite counts what CHROME ITSELF serialises — CDP
// `Accessibility.enable` (the same renderer AX mode a UIA client switches on)
// → `Accessibility.getFullAXTree({depth:-1})` — never `getElementsByTagName('*')`
// (that is DOM size, not exposure; measured 2.2–2.5× apart).
//
// Two numbers per scope: TOTAL (every node Blink serialised, ignored ones
// included — the payload HandleAXEvents deserialises, the number
// chrome://accessibility reports) and NON-IGNORED (the platform tree). A scope
// is joined by `DOM.querySelectorAll` → each match's backendNodeId → the AX node
// carrying that backendDOMNodeId, and summed over childIds.
//
// The fixture is the §1c huge compact-mode transcript (scripts/huge-transcript-
// fixture.mjs — the measured shape of the owner's conversation: Bash 97 %,
// closed tool-card shells, folded runs, status lines) opened in ONE chat window
// in the LIVE window's rendering mode (content-visibility:auto — §0: off-screen
// c-v:auto subtrees are IN the tree, which is where 82 % of the owner's nodes
// came from).
//
// Legs (a0 = the measurement ①–③; a1 = the reader's band ④–⑥):
//   ① POSITIVE CONTROL: total > 0 and the message list's subtree > 200 (a zero
//     would make every other number vacuous). MEASURED 2026-09-22 on Chrome 153:
//     449 total / 130 non-ignored for the 50 tail cards — ≈ 9 AX nodes per
//     rendered card, not the design's 60–130, because the §1c tail is
//     fold-dominated and a folded run member is display:none (out of the tree
//     by §0); the design's estimate is for UNFOLDED cards. The pin is measured
//     ×0.45, never a guess.
//   ② OQ1: aria-hidden on the list — NON-IGNORED must fall by ≥ 80 % of the
//     list's non-ignored subtree; whether TOTAL falls too is PRINTED as the
//     verdict, because it decides what attribute the reader's band writes
//     (aria-hidden if it prunes the serialised payload, content-visibility:hidden
//     if it only prunes the platform tree). The attribute is removed after. The
//     two forms the band would actually write — aria-hidden PER CARD and
//     content-visibility:hidden PER CARD — are measured on the same baseline and
//     printed beside it, with a role / ignoredReason histogram of what remains,
//     so the verdict names the attribute instead of saying "partly".
//   ③ PAGE-UPS: four page-ups (the top-edge wheel idiom of test-chat-paging
//     §4b), settle, re-measure, PRINT the delta. MEASURED (a0): 50 → 336 cards,
//     sh 767 → 2574 at ch 658 — the paged window is ~4 viewports, the trim's
//     keep zone filling up; a ±2-viewport band holds it WHOLE, so the growth
//     over the 50-card baseline (1.2 viewports) is the trim's business, not the
//     band's — it is printed, and the band's invariant lives where the DOM
//     outgrows the band (④).
//   ④ THE READER'S BAND (a1, design §3 row 1 / §8): a teleport into the elided
//     middle (a 600-line slab) and TWO gap page-ups (2,000 lines each — the §1
//     worst case, "gap slab … 单窗 50–71k") — cards in view and within 2
//     viewports carry no aria-hidden, cards beyond 2 viewports (the band's own
//     edge, spans by the product's own rule) do; the GROWTH INVARIANT: the second slab moves NON-IGNORED by
//     ≤ 10 % (the platform tree is bounded by the band; the serialised TOTAL
//     keeps ≈ 5 ignored nodes per hidden card — a0's OQ1 floor, the DOM's
//     business, 5b's); the per-window pin at measured ×1.25.
//   ⑤ THE SETTING'S TWO MEANINGS: false ⇒ the LIST is aria-hidden (2.369.144);
//     true ⇒ the band, re-derived on the flip (stale per-card state repaired),
//     with the view taken OUT of app.sessions for the flip (a sub-agent viewer
//     is never in that map; the flip reaches it through the list's `_axView`).
//   ⑥ NEGATIVE CONTROL: the band neutered at SOURCE in the scratch worktree
//     (string-exact marker, the test-desktop-resume-paging idiom), the bundle
//     rebuilt, the same window / teleport / slabs — TOTAL and NON-IGNORED must
//     GROW by > 30 %, every card beyond the band must be exposed, and a card
//     added outside the band must cost < half of its exposed serialisation.
//   ⑦ FOCUS (verifier finding on a1): a focus landing inside a band-hidden card
//     exposes that card in the focus event's OWN task (the list's focusin), not
//     on the next ≥ 150 ms pass — an in-page control (the handler blocked: the
//     pre-fix code), `.focus()`, and the Shift+Tab path from after the list;
//     Chrome's own "Blocked aria-hidden …" warning counted beside the attribute.
// Every number is printed (`· total N · non-ignored M · list L / l …`).
// Run: node scripts/test-ax-budget.mjs   (SKIPs without chrome; VS_AX_FIXTURE_MB=36)
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, fixtureSid, ONBOARDED_SOURCE } from './scratch.mjs';
import { writeHugeTranscript } from './huge-transcript-fixture.mjs';
const require = createRequire(import.meta.url);
const { fixtureLitter } = require('../src/fixture-guard.js');

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }

// EVERY name here comes from scripts/scratch.mjs (per-process paths + free
// ports): a fixed name is a machine-wide collision with the heavy tier's lanes.
const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('axbudget');
const fakeHome = scratchHome('axbudget-home', fs);
const chromeDir = scratch('axbudget-chrome');
const CWD = scratch('axbudget-cwd');
const SID = fixtureSid('a0');
const PROJ = path.join(fakeHome, '.claude', 'projects', CWD.replace(/[/._]/g, '-'));
const REAL_PROJECTS = path.join(os.homedir(), '.claude', 'projects');
const realBefore = (() => { try { return new Set(fs.readdirSync(REAL_PROJECTS)); } catch { return new Set(); } })();
let failed = 0, passed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e ? '\n    ' + e : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (d, of) => (of > 0 ? `${(100 * d / of).toFixed(1)} %` : 'n/a');

// ── 1. the §1c fixture, above the 34 MB gap threshold (JSONL_HEAD 2 MB +
//      JSONL_TAIL 32 MB) so the window opens in the owner's tail mode ──
const FIXTURE_MB = Number(process.env.VS_AX_FIXTURE_MB || 36);
{
  fs.mkdirSync(PROJ, { recursive: true });
  fs.mkdirSync(CWD, { recursive: true });
  const h = await writeHugeTranscript({ file: path.join(PROJ, `${SID}.jsonl`), sid: SID, cwd: CWD, targetBytes: FIXTURE_MB * 1048576 });
  console.log(`  fixture: ${h.lines} lines, ${h.turns} turns, ${h.images} images, ${(h.bytes / 1048576).toFixed(1)} MB (${h.kbPerLine.toFixed(2)} KB/line) in ${h.ms} ms`);
}

// ── 2. throwaway worktree + WORKING-TREE overlay (a pre-commit run tests what
//      is about to ship), an UNMINIFIED bundle so a red run is debuggable ──
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) {
  execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
}
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.writeFileSync(path.join(wt, 'src/lib/build-version.js'), "export const BUILD_VERSION = 'test';\n");
execSync('npx esbuild src/client.js --bundle --outfile=public/bundle.js --format=iife --platform=browser --target=es2020 --loader:.css=css',
  { cwd: wt, stdio: 'ignore' });

// ── 3. server + headless chrome at the design's 1400×1000 ──
const srv = spawn(process.execPath, ['server.js'], {
  cwd: wt, stdio: 'ignore',
  env: { ...process.env, PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' },
});
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu',
  '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1400,1000', '--disable-background-timer-throttling',
  `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv.kill('SIGKILL'); } catch {}
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  for (const d of [chromeDir, fakeHome, CWD]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
};
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });

for (let i = 0; i < 80; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); break; } catch { await sleep(250); } }

const WebSocket = require('ws');
let target = null, browser = '?';
for (let i = 0; i < 80 && !target; i++) {
  try {
    target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((x) => x.type === 'page');
    browser = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json()).Browser || browser;
  } catch {}
  if (!target) await sleep(250);
}
if (!target) { console.error('✗ chrome never exposed a CDP page target'); process.exit(1); }
// a full AX tree of a many-card page is megabytes of JSON — never let the socket cap it
const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 512 * 1024 * 1024 });
await new Promise((r) => ws.on('open', r));
let seq = 0; const pend = new Map();
ws.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
});
const cdp = (method, params = {}) => new Promise((res) => { const id = ++seq; pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const evaljs = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 500));
  return r.result?.result?.value;
};
await cdp('Runtime.enable');
await cdp('Page.enable');
console.log(`  renderer: ${browser} at 1400×1000`);

// ── 4. boot the client, open ONE chat window on the fixture, settle ──
// A function: the negative-control leg (⑥) re-navigates onto a rebuilt bundle
// and opens the same window again. Any window the restored layout brings back
// is closed first, so every scope counts exactly ONE list.
const openFixtureWindow = async (label) => {
  let booted = false;
  for (let attempt = 0; attempt < 3 && !booted; attempt++) {
    await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/?cb=${Date.now()}` });
    for (let i = 0; i < 90 && !booted; i++) {
      booted = !!await evaljs('!!(window.app && window.app.ready && window.app.wm && window.app.desktopManager)').catch(() => false);
      if (!booted) await sleep(400);
    }
  }
  if (!booted) return { ok: false, why: 'the client never booted' };
  await evaljs('window.app.ready').catch(() => {});
  await sleep(1500);
  const o = await evaljs(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (const w of [...window.app.wm.windows.values()]) { try { window.app.wm.closeWindow(w.id); } catch {} }
  await sleep(300);
  const win = window.app.viewSession(${JSON.stringify(SID)}, ${JSON.stringify(CWD)}, 'ax budget');
  window.app.wm.toggleMaximize(win.id);   // a real reading viewport, not a 380px pane
  let view = null;
  for (let i = 0; i < 150; i++) {
    view = window.app.sessions.get(win.id);
    if (view && view._messageList && view._messageList.querySelectorAll('.chat-msg').length > 10) break;
    await sleep(400);
  }
  if (!view || !view._messageList) return { ok: false, why: 'chat never loaded' };
  // the LIVE window's rendering mode: a read-only viewer runs with
  // content-visibility OFF; the owner's windows were live ones, and §0's rule
  // ("c-v:auto off-screen subtrees are IN the tree") is what is being measured
  view._readOnly = false; view._container.classList.remove('chat-no-content-visibility');
  for (let i = 0; i < 40 && !view._gapMinimapActive; i++) await sleep(300);   // the whole-file turn map = tail mode armed
  await sleep(3000);                                                          // initial render + fold + attach fill + heights
  win.element.dataset.axProbe = 'win';                                        // the per-window scope's DOM handle
  window.__v = view;
  const list = view._messageList;
  return { ok: true, rendered: list.querySelectorAll('.chat-msg').length, ws: view._windowStart, we: view._windowEnd, total: view._total,
    ch: list.clientHeight, sh: list.scrollHeight, cv: !view._container.classList.contains('chat-no-content-visibility'),
    compact: view._container.classList.contains('chat-compact'), tail: !!view._gapMinimapActive, markers: document.querySelectorAll('.chat-minimap-marker').length };
})()`).catch((e) => ({ ok: false, why: String(e.message || e).slice(0, 300) }));
  console.log(`  opened [${label}]: ${JSON.stringify(o)}`);
  return o;
};
const opened = await openFixtureWindow('measure');
if (!opened?.ok) { console.error(`✗ the fixture window never opened: ${JSON.stringify(opened)}`); process.exit(1); }

// ── 5. THE COUNT (§4): Chrome's own tree, two numbers per scope ──
// RECORDED (Chrome 153, 1400×1000, the §1c fixture): a0 — 50 tail cards 1001 TOTAL / 516 NON-IGNORED,
// list 449 / 130, window 724, minimap 201 for 199 markers; after 4 page-ups 3214 (window 2918).
// a1 — teleport + 2 slabs (1,310 cards) 5,788 / 1,096, window 5,448 / 916; neutered 20,158 / 12,260.
// a2 (icons / gutters / diff prefixes / run arrows / spinners / resize handles / generated glyphs /
// the minimap strip aria-hidden at the source) — 50 cards 733 / 260, list 400 / 93, window 462 / 149,
// minimap 0 / 0 (the strip's own node out); after 4 page-ups 2769 (window 2498); teleport + 2 slabs
// 4,847 / 627, window 4,576 / 516; neutered 14,871 / 8,065.
// a4 (the close — the status bar's keyed chips a3 + docs, no exposure change; re-measured, three runs identical):
// the a2 line to the node — 733 / 260, window 462 / 149, page-ups 2769 (2498), slabs 4,847 / 627
// (window 4,576 / 516), neutered 14,871 / 8,065. A chip re-render was churn, never size.
await cdp('Accessibility.enable');
await cdp('DOM.enable');
const SCOPES = { list: '.chat-message-list', window: '[data-ax-probe="win"]', minimap: '.chat-minimap', sidebar: '#sidebar' };
const backendIdsOf = async (selector) => {
  const doc = await cdp('DOM.getDocument', { depth: -1 });
  const root = doc.result?.root?.nodeId;
  if (!root) throw new Error('DOM.getDocument gave no root: ' + JSON.stringify(doc).slice(0, 200));
  const q = await cdp('DOM.querySelectorAll', { nodeId: root, selector });
  const ids = [];
  for (const nodeId of q.result?.nodeIds || []) {
    const d = await cdp('DOM.describeNode', { nodeId });
    if (d.result?.node?.backendNodeId) ids.push(d.result.node.backendNodeId);
  }
  return ids;
};
const domTag = new Map(); // backendNodeId → element name (DOM nodes persist across the states)
const measure = async (label, { detail = false } = {}) => {
  const t0 = Date.now();
  const scopeIds = {};
  for (const [name, sel] of Object.entries(SCOPES)) scopeIds[name] = await backendIdsOf(sel);
  const r = await cdp('Accessibility.getFullAXTree', { depth: -1 });
  const nodes = r.result?.nodes;
  if (!Array.isArray(nodes)) throw new Error('getFullAXTree: ' + JSON.stringify(r).slice(0, 300));
  const byId = new Map(nodes.map((n) => [n.nodeId, n]));
  // the FIRST AX node carrying a backend id is the element's own (inline text
  // boxes reuse their text node's id — never an element's)
  const byBackend = new Map();
  for (const n of nodes) if (n.backendDOMNodeId != null && !byBackend.has(n.backendDOMNodeId)) byBackend.set(n.backendDOMNodeId, n);
  const subtree = (root) => {
    let total = 0, live = 0; const seen = new Set(); const stack = [root];
    while (stack.length) {
      const n = stack.pop(); if (seen.has(n.nodeId)) continue; seen.add(n.nodeId);
      total++; if (n.ignored !== true) live++;
      for (const c of n.childIds || []) { const ch = byId.get(c); if (ch) stack.push(ch); }
    }
    return { total, live };
  };
  const out = { label, total: nodes.length, live: nodes.filter((n) => n.ignored !== true).length, scopes: {}, ms: Date.now() - t0 };
  for (const [name, ids] of Object.entries(scopeIds)) {
    let total = 0, live = 0, found = 0;
    for (const id of ids) { const ax = byBackend.get(id); if (!ax) continue; found++; const s = subtree(ax); total += s.total; live += s.live; }
    out.scopes[name] = { total, live, found, of: ids.length };
  }
  // what REMAINS under the window: roles (ignored ones marked) and the ignoredReasons Chrome gives — the OQ1 answer by name
  const histo = (root, key) => {
    const h = {}; const seen = new Set(); const stack = [root];
    while (stack.length) {
      const n = stack.pop(); if (seen.has(n.nodeId)) continue; seen.add(n.nodeId);
      const k = key(n); if (k) h[k] = (h[k] || 0) + 1;
      for (const c of n.childIds || []) { const ch = byId.get(c); if (ch) stack.push(ch); }
    }
    return Object.entries(h).sort((a, b) => b[1] - a[1]);
  };
  const winAx = (scopeIds.window || []).map((id) => byBackend.get(id)).find(Boolean);
  out.roles = winAx ? histo(winAx, (n) => `${n.role?.value || '?'}${n.ignored ? '·ign' : ''}`) : [];
  out.reasons = winAx ? histo(winAx, (n) => (n.ignored ? ((n.ignoredReasons || []).map((r) => r.name).join('+') || 'ignored(no reason)') : null)) : [];
  const page = await evaljs(`(() => { const v = window.__v, l = v._messageList; return { rendered: l.querySelectorAll('.chat-msg').length, folded: [...l.querySelectorAll('.chat-msg')].filter((e) => getComputedStyle(e).display === 'none').length, closedDetails: l.querySelectorAll('details:not([open])').length, ws: v._windowStart, we: v._windowEnd, total: v._total, sh: l.scrollHeight, st: Math.round(l.scrollTop), markers: document.querySelectorAll('.chat-minimap-marker').length }; })()`);
  out.page = page;
  // WHICH DOM elements the ignored nodes are (a describeNode sample, ≤ 600): the answer
  // to "is a display:none / closed-details subtree serialised?" by element name
  if (detail && winAx) {
    const sample = {}; let seen = 0;
    const stack = [winAx]; const done = new Set();
    while (stack.length && seen < 600) {
      const n = stack.pop(); if (done.has(n.nodeId)) continue; done.add(n.nodeId);
      for (const c of n.childIds || []) { const ch = byId.get(c); if (ch) stack.push(ch); }
      if (!n.ignored || n.backendDOMNodeId == null) continue;
      seen++;
      let tag = domTag.get(n.backendDOMNodeId);
      if (!tag) {
        const d = await cdp('DOM.describeNode', { backendNodeId: n.backendDOMNodeId });
        const nd = d.result?.node; const attrs = nd?.attributes || []; const ci = attrs.indexOf('class');
        tag = nd ? (nd.nodeType === 3 ? '#text' : nd.nodeName.toLowerCase() + (ci >= 0 ? '.' + String(attrs[ci + 1]).split(/\s+/)[0] : '')) : '?';
        domTag.set(n.backendDOMNodeId, tag);
      }
      const k = ((n.ignoredReasons || []).map((r) => r.name).join('+') || 'ignored') + ':' + tag;
      sample[k] = (sample[k] || 0) + 1;
    }
    out.ignoredSample = Object.entries(sample).sort((a, b) => b[1] - a[1]);
  }
  const sc = (n) => { const s = out.scopes[n]; return `${s.total} / ${s.live}${s.found !== s.of ? ` (${s.found} of ${s.of} in the tree)` : ''}`; };
  console.log(`  [${label}] · total ${out.total} · non-ignored ${out.live} · list subtree ${sc('list')} · window ${sc('window')} · minimap ${sc('minimap')} (${page.markers} markers) · sidebar ${sc('sidebar')} · ${page.rendered} rendered cards (ws ${page.ws}..${page.we} of ${page.total}, sh ${page.sh}) · ${out.ms} ms`);
  if (detail) console.log(`    window roles: ${out.roles.slice(0, 12).map(([k, v]) => k + ' ' + v).join(' · ')}\n    window ignored reasons: ${out.reasons.slice(0, 8).map(([k, v]) => k + ' ' + v).join(' · ') || '(none)'} — ${page.folded} folded (display:none) cards + ${page.closedDetails} closed <details> in the list\n    ignored nodes by element: ${(out.ignoredSample || []).slice(0, 12).map(([k, v]) => k + ' ' + v).join(' · ') || '(none)'}`);
  return out;
};

// ① POSITIVE CONTROL
const base = await measure('baseline', { detail: true });
// > 200: measured 449 on the 50 fold-dominated tail cards at a0 (400 / 93 after a2's paint-only layer:
// icons, gutters, generated glyphs and the strip out) — a pin at the design's unfolded-card estimate
// (≥ 500) was red on the first run; a pin nobody measured is an empty leg
check(`① positive control: the tree is non-empty (total ${base.total}) and the message list's subtree is > 200 (${base.scopes.list.total} / ${base.scopes.list.live} on ${base.page.rendered} rendered cards)`,
  base.total > 0 && base.scopes.list.total > 200, JSON.stringify(base.scopes));
console.log(`  per-window: ${base.scopes.window.total} total / ${base.scopes.window.live} non-ignored; per rendered card ≈ ${(base.scopes.list.total / Math.max(1, base.page.rendered)).toFixed(1)} total / ${(base.scopes.list.live / Math.max(1, base.page.rendered)).toFixed(1)} non-ignored`);
// ①b THE MINIMAP STRIP (design §3 row 3 in its §8 lean form, a2): one marker div per user turn of the
// WHOLE conversation — the one subtree that grew with the conversation's length, not the rendered
// window (a0 measured 201 nodes for 199 markers). aria-hidden on the strip; MEASURED (a2): the strip's
// own node leaves the tree ("0 of 1 in the tree") and nothing under it is serialised — an empty div
// under aria-hidden costs 0, unlike a card's ≈ 5 (a card carries text and closed details). The pin is
// the design's ≤ 10, on BOTH numbers; the in-page control strips the attribute and the strip must
// come back at least as large as its marker count, then the attribute is restored and re-measured.
{
  const mm = base.scopes.minimap;
  check(`①b the minimap strip is out of the tree: ${mm.total} TOTAL / ${mm.live} NON-IGNORED ≤ 10 for ${base.page.markers} markers (${mm.found} of ${mm.of} strip nodes serialised)`,
    base.page.markers >= 100 && mm.total <= 10 && mm.live <= 10, JSON.stringify(mm));
  await evaljs(`(() => { document.querySelector('.chat-minimap').removeAttribute('aria-hidden'); void document.body.offsetHeight; return true; })()`);
  await sleep(1200);
  const exposed = await measure('minimap attribute removed');
  await evaljs(`(() => { document.querySelector('.chat-minimap').setAttribute('aria-hidden', 'true'); void document.body.offsetHeight; return true; })()`);
  await sleep(1200);
  const back = await measure('minimap attribute restored');
  check(`①b NEGATIVE CONTROL: without the attribute the strip serialises ≥ its ${base.page.markers} markers (${exposed.scopes.minimap.total} TOTAL / ${exposed.scopes.minimap.live} NON-IGNORED) and restoring it empties the scope again (${back.scopes.minimap.total} / ${back.scopes.minimap.live}); the page TOTAL ${base.total} → ${exposed.total} → ${back.total}`,
    exposed.scopes.minimap.total >= base.page.markers && back.scopes.minimap.total <= 10 && back.scopes.minimap.live <= 10 && back.total === base.total, JSON.stringify({ exposed: exposed.scopes.minimap, back: back.scopes.minimap }));
}

// ② OQ1 — what aria-hidden does to the SERIALISED payload vs the platform tree
await evaljs(`(() => { document.querySelector('.chat-message-list').setAttribute('aria-hidden', 'true'); void document.body.offsetHeight; return true; })()`);
await sleep(1200);
const hidden = await measure('aria-hidden on the list', { detail: true });
const liveDrop = base.live - hidden.live, totalDrop = base.total - hidden.total;
check(`② OQ1: aria-hidden on the list removes ≥ 80 % of its non-ignored subtree from the platform tree (non-ignored ${base.live} → ${hidden.live}, −${liveDrop} = ${pct(liveDrop, base.scopes.list.live)} of the list's ${base.scopes.list.live})`,
  liveDrop >= 0.8 * base.scopes.list.live);
console.log(`  OQ1 (list-level): total ${base.total} → ${hidden.total}, −${totalDrop} = ${pct(totalDrop, base.scopes.list.total)} of the list's ${base.scopes.list.total}; list subtree now ${hidden.scopes.list.total} / ${hidden.scopes.list.live}${hidden.scopes.list.found ? '' : ' — the list node itself left the tree, its remaining nodes hoisted to an ancestor'}`);
await evaljs(`(() => { document.querySelector('.chat-message-list').removeAttribute('aria-hidden'); void document.body.offsetHeight; return true; })()`);
await sleep(1200);
const restored = await measure('attribute removed');
console.log(`  restored: total ${restored.total} vs baseline ${base.total} (Δ ${restored.total - base.total}), list subtree ${restored.scopes.list.total} vs ${base.scopes.list.total}`);
// the band's two candidate forms, PER CARD, on the same 50-card baseline — what §3 row 1 would write
const perCard = async (label, apply, undo) => {
  await evaljs(`(() => { for (const el of document.querySelector('.chat-message-list').querySelectorAll('.chat-msg')) { ${apply} } void document.body.offsetHeight; return true; })()`);
  await sleep(1200);
  const m = await measure(label, { detail: true });
  await evaljs(`(() => { for (const el of document.querySelector('.chat-message-list').querySelectorAll('.chat-msg')) { ${undo} } void document.body.offsetHeight; return true; })()`);
  await sleep(1200);
  return m;
};
const cardsAria = await perCard('aria-hidden on every card', "el.setAttribute('aria-hidden', 'true');", "el.removeAttribute('aria-hidden');");
const cardsCv = await perCard('content-visibility:hidden on every card', "el.style.contentVisibility = 'hidden';", "el.style.contentVisibility = '';");
const restored2 = await measure('both per-card forms undone');
const listT = base.scopes.list.total, listL = base.scopes.list.live, listI = listT - listL;
const forms = [
  ['aria-hidden on the list', hidden],
  ['aria-hidden per card', cardsAria],
  ['content-visibility:hidden per card', cardsCv],
].map(([name, m]) => ({ name, total: base.total - m.total, live: base.live - m.live, sh: m.page.sh, layoutNeutral: m.page.sh === base.page.sh, ws: m.page.ws }));
console.log(`  OQ1 VERDICT — the list serialises ${listT} nodes: ${listL} non-ignored + ${listI} already ignored (${base.page.folded} folded cards + ${base.page.closedDetails} closed <details> in the list — a closed <details>' UA-shadow slots + content wrapper and the <summary> under a display:none card are serialised as ignored 'notRendered', not pruned: §0's "display:none / closed content is out of the tree" holds for the PLATFORM tree only, while the content BELOW a closed wrapper IS pruned = OQ2 answered)`);
for (const r of forms) console.log(`    ${r.name.padEnd(36)} total −${String(r.total).padStart(4)} (${pct(r.total, listT).padStart(6)} of the list's serialised)  non-ignored −${String(r.live).padStart(4)} (${pct(r.live, listL).padStart(6)} of the list's live)  layout sh ${base.page.sh} → ${r.sh}${r.layoutNeutral ? ' (neutral)' : ' (CHANGED — not layout-neutral)'}`);
console.log(`    undone: total ${restored2.total} vs baseline ${base.total}, ws ${restored2.page.ws} vs ${base.page.ws}${restored2.page.ws !== base.page.ws ? ' — WARNING: a hidden state paged the window' : ''}`);
const perCardAria = forms[1], perCardCv = forms[2];
const bandAttr = perCardAria.live >= 0.8 * listL && perCardAria.layoutNeutral ? 'aria-hidden'
  : perCardCv.live >= 0.8 * listL && perCardCv.layoutNeutral ? 'content-visibility:hidden'
    : perCardAria.live >= 0.8 * listL ? 'aria-hidden (the only layout-neutral form)' : 'NEITHER (no form prunes ≥ 80 % of the live subtree while keeping the layout)';
const payloadNote = perCardAria.total < 0.8 * listT && perCardCv.total < 0.8 * listT
  ? ` — and NO attribute prunes the already-ignored share (${pct(listI, listT)} of the list's payload here: folded members and closed details); only leaving the DOM (the trim) removes those`
  : '';
console.log(`  OQ1 ⇒ the band writes ${bandAttr}: per hidden card it removes its LIVE nodes (${(listL / Math.max(1, base.page.rendered - base.page.folded)).toFixed(1)} per unfolded card here; 60–130 on the design's unfolded shapes)${payloadNote}`);

// ③ GROWTH BASELINE — four page-ups at the top edge (test-chat-paging §4b's idiom), then re-measure
const PAGE_UPS = 4;
const paged = await evaljs(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const v = window.__v, list = v._messageList;
  const rows = [];
  for (let k = 0; k < ${PAGE_UPS}; k++) {
    const ws0 = v._windowStart, n0 = list.querySelectorAll('.chat-msg').length;
    if (ws0 <= 0) { rows.push({ k, why: 'at message 0' }); break; }
    list.scrollTop = 0;
    list.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true, cancelable: true }));
    const t0 = Date.now();
    while (Date.now() - t0 < 8000 && v._windowStart >= ws0) await sleep(100);
    await sleep(1500);   // the grow passes + fold + heights settle
    rows.push({ k, ws0, ws: v._windowStart, n0, n: list.querySelectorAll('.chat-msg').length, st: Math.round(list.scrollTop), sh: list.scrollHeight, ms: Date.now() - t0 });
  }
  await sleep(2500);
  return { rows, rendered: list.querySelectorAll('.chat-msg').length, ws: v._windowStart, we: v._windowEnd, total: v._total };
})()`);
console.log(`  page-ups: ${JSON.stringify(paged.rows)}`);
const after = await measure(`after ${PAGE_UPS} page-ups`);
const dTotal = after.total - base.total, dList = after.scopes.list.total - base.scopes.list.total, dWin = after.scopes.window.total - base.scopes.window.total;
console.log(`  GROWTH over the 50-card baseline (printed — the paged window is the trim's keep zone filling, inside the band whole; the band's invariant is ④): total ${base.total} → ${after.total} (Δ ${dTotal >= 0 ? '+' : ''}${dTotal}, ${pct(dTotal, base.total)} of the baseline) · list ${base.scopes.list.total} → ${after.scopes.list.total} (Δ ${dList >= 0 ? '+' : ''}${dList}) · window ${base.scopes.window.total} → ${after.scopes.window.total} (Δ ${dWin >= 0 ? '+' : ''}${dWin} = ${pct(dWin, 5000)} of the design's 5,000 per-window ceiling; §4 allows 10 % of it) · rendered ${base.page.rendered} → ${after.page.rendered} cards (ws ${base.page.ws} → ${after.page.ws}, sh ${base.page.sh} → ${after.page.sh})`);
check(`③ the ${PAGE_UPS} page-ups really happened: the rendered-card count grew (${base.page.rendered} → ${after.page.rendered}; ws ${base.page.ws} → ${after.page.ws}; ${paged.rows.filter((r) => r.ws < r.ws0).length} of ${PAGE_UPS} gestures paged)`,
  after.page.rendered > base.page.rendered, JSON.stringify(paged.rows));


// ④ THE READER'S BAND — where the DOM outgrows the band: a teleport into the elided middle,
//    then two 2,000-line gap slabs (the §1 worst case). The (ts, line) is what a minimap click
//    hands _jumpToFileTime: the user turn nearest the file's midpoint.
const midTurn = (() => {
  const lines = fs.readFileSync(path.join(PROJ, `${SID}.jsonl`), 'utf8').split('\n');
  for (let i = Math.floor(lines.length / 2); i < lines.length; i++) {
    try { const r = JSON.parse(lines[i]); if (r.type === 'user' && r.timestamp && typeof r.message?.content === 'string') return { line: i, ts: Date.parse(r.timestamp), of: lines.length }; } catch {}
  }
  return null;
})();
console.log(`  elided middle: ${JSON.stringify(midTurn)}`);
const teleport = () => evaljs(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const v = window.__v, list = v._messageList;
  const gap = () => list.querySelectorAll(':scope > .chat-gap-msg').length;
  const t0 = Date.now();
  const target = await v._jumpToFileTime(${midTurn.ts}, ${midTurn.line});
  while (Date.now() - t0 < 10000 && !(v._teleported && gap() >= 30)) await sleep(100);
  await sleep(3000);   // _scrollElStable's re-centres (≤ 750 ms) + the stable-heights restore (1.6 s) + the band's settle
  return { ok: !!v._teleported && gap() >= 30, target: !!target, gap: gap(), rendered: list.querySelectorAll('.chat-msg').length, st: Math.round(list.scrollTop), sh: list.scrollHeight, ch: list.clientHeight, ms: Date.now() - t0 };
})()`);
const gapPageUp = () => evaljs(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const v = window.__v, list = v._messageList;
  const gap = () => list.querySelectorAll(':scope > .chat-gap-msg').length;
  const g0 = gap();
  list.scrollTop = 0;
  list.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true, cancelable: true }));
  const t0 = Date.now();
  while (Date.now() - t0 < 10000 && gap() < g0 + 30) await sleep(100);
  await sleep(2500);   // the landing + the band's settle
  return { ok: gap() >= g0 + 30, g0, gap: gap(), st: Math.round(list.scrollTop), sh: list.scrollHeight, ms: Date.now() - t0 };
})()`);
// THE BAND AS THE DOM SHOWS IT: every rendered card's gap from the viewport (in viewports) vs its
// attribute. The band's edge is AX_BAND_VIEWPORTS = 2: a card whose whole span lies more than two
// viewports beyond the viewport must be aria-hidden; a card whose span reaches within two viewports
// must not be. The SPAN is the product's own rule (_cardPositions): a zero-height card — a compact
// tool-result row, 742 of the 1,310 here — takes the span of the nearest visible card above it (it
// sits AT that card; a first cut on the cards' own rects found 13 zero-height rows right after a
// visible card straddling the edge "beyond but exposed" — the rule, not a bug). 2 px of slack for
// the integer offsetTop vs the fractional rect. The band's SETTLE pass (+1.2 s) is what makes this
// exact after a landing: the first pass saw a tail card 300 px short of where it settled.
// MEASURED (a1, this fixture): 1,310 gap cards span 5.9 viewports (sh 3865 at ch 658) — nothing
// is ever "3 viewports away" here, so the leg is worded on the band's edge, not on a distance
// the fixture cannot produce.
const bandCensus = () => evaljs(`(() => {
  const v = window.__v, list = v._messageList, lr = list.getBoundingClientRect(), ch = list.clientHeight;
  const out = { cards: 0, folded: 0, hidden: 0, inView: 0, inViewHidden: 0, near: 0, nearHidden: 0, beyond: 0, beyondExposed: 0, dist: {}, heights: {}, sh: list.scrollHeight, st: Math.round(list.scrollTop), ch, band: v._axBand || null, listHidden: list.getAttribute('aria-hidden') };
  let spanTop = lr.top - list.scrollTop, spanBottom = spanTop;   // the nearest visible card's span, carried — seeded at scroll origin 0 like _cardPositions (the list's first zero-height rows sit THERE, not at the viewport)
  for (const c of list.children) {
    const isCard = c.classList.contains('chat-msg');
    const shown = c.offsetParent !== null && c.offsetHeight > 0;
    if (shown) { const rc = c.getBoundingClientRect(); spanTop = rc.top; spanBottom = rc.bottom; }
    if (!isCard) continue;
    const el = c;
    out.cards++;
    if (el.offsetParent === null) { out.folded++; continue; }
    const r = shown ? el.getBoundingClientRect() : { top: spanTop, bottom: spanBottom, height: 0 };
    const hid = el.getAttribute('aria-hidden') === 'true';
    if (hid) out.hidden++;
    const above = lr.top - r.bottom, below = r.top - lr.bottom;   // px beyond the viewport's top / bottom edge (≤ 0 = overlaps)
    const gap = Math.max(above, below);
    const k = above > 0 ? -(Math.floor(above / ch) + 1) : below > 0 ? Math.floor(below / ch) + 1 : 0;   // −1 = 0–1 viewports above … −3 = 2–3 above; 0 = in view
    const dk = String(k) + (hid ? 'h' : 'v'); out.dist[dk] = (out.dist[dk] || 0) + 1;
    const hb = r.height === 0 ? '0' : r.height < 40 ? '<40' : r.height < 100 ? '<100' : '100+'; out.heights[hb] = (out.heights[hb] || 0) + 1;
    if (gap <= 0) { out.inView++; if (hid) out.inViewHidden++; }
    if (gap < 2 * ch - 2) { out.near++; if (hid) out.nearHidden++; }
    if (gap > 2 * ch + 2) { out.beyond++; if (!hid) out.beyondExposed++; }
    if ((gap < 2 * ch - 2 && hid) || (gap > 2 * ch + 2 && !hid)) {
      out.mismatch = out.mismatch || [];
      if (out.mismatch.length < 8) out.mismatch.push({ i: out.cards - 1, cls: el.className.replace('chat-msg ', '').slice(0, 50), h: r.height, shown, top: Math.round(r.top - lr.top + list.scrollTop), bottom: Math.round(r.bottom - lr.top + list.scrollTop), offTop: el.offsetTop, offH: el.offsetHeight, hid, gapV: (gap / ch).toFixed(2) });
    }
  }
  return out;
})()`);
const within = (a, b, frac) => Math.abs(a - b) <= frac * Math.max(1, b);
const ratio = (a, b) => (b > 0 ? (a / b).toFixed(2) + '×' : 'n/a');
let T1 = null, T2 = null, census = null;
if (!midTurn) check('④ the fixture has a user turn past its midpoint', false);
else {
  const tp = await teleport();
  console.log(`  teleport: ${JSON.stringify(tp)}`);
  check(`④ the teleport landed in the elided middle (${tp.gap} gap cards, teleported=${tp.ok})`, tp.ok, JSON.stringify(tp));
  const T0 = await measure('teleport slab');
  const c0 = await bandCensus();
  console.log(`  band after the teleport: ${JSON.stringify(c0)}`);
  const p1 = await gapPageUp();
  console.log(`  gap page-up 1: ${JSON.stringify(p1)}`);
  T1 = await measure('teleport + 1 slab');
  const p2 = await gapPageUp();
  console.log(`  gap page-up 2: ${JSON.stringify(p2)}`);
  T2 = await measure('teleport + 2 slabs');
  census = await bandCensus();
  console.log(`  band after two slabs: ${JSON.stringify(census)}`);
  check(`④a both gap page-ups loaded a slab (${p1.g0} → ${p1.gap} → ${p2.gap} gap cards)`, p1.ok && p2.ok, JSON.stringify([p1, p2]));
  check(`④b THE BAND: every card in view (${census.inView}) and within 2 viewports (${census.near}) is exposed (${census.inViewHidden} / ${census.nearHidden} aria-hidden), every card beyond 2 viewports is out of the tree (${census.beyond} beyond, ${census.beyondExposed} exposed); ${census.hidden} of ${census.cards - census.folded} non-folded cards hidden`,
    census.inView > 0 && census.inViewHidden === 0 && census.nearHidden === 0 && census.beyond > 0 && census.beyondExposed === 0, JSON.stringify(census));
  // THE GROWTH INVARIANT, as measured: the band bounds the PLATFORM tree — NON-IGNORED is flat across a
  // second slab (MEASURED at a1 1094 → 1096 on +576 cards, the neutered copy 12,260; after a2's
  // paint-only layer 650 → 627, the neutered copy 8,065). The serialised TOTAL is NOT flat: Chrome
  // serialises an aria-hidden subtree's elements as ignored nodes (ariaHiddenSubtree — a0's OQ1: no
  // attribute removes the ignored share, only leaving the DOM does), so every hidden card still costs
  // ≈ 5 serialised nodes (MEASURED +3115 on +576 cards at a1; +2689 = 4.7 per card at a2) against
  // ≈ 14 exposed (11.5 at a2) — the TOTAL's growth is the DOM's card count × that floor, bounded by the
  // trim / the gap caps (design §3 row 5b, deliberately not this round). Asserted: the platform tree
  // ≤ 10 %; the marginal serialised cost of a card outside the band < half the neutered copy's (⑥,
  // same run, same gestures).
  check(`④c GROWTH INVARIANT (the platform tree): the second 2,000-line slab (${T1.page.rendered} → ${T2.page.rendered} rendered cards) moves NON-IGNORED by ≤ 10 % (${T1.live} → ${T2.live}); TOTAL ${T1.total} → ${T2.total} = ${((T2.total - T1.total) / Math.max(1, T2.page.rendered - T1.page.rendered)).toFixed(1)} serialised nodes per added card (ignored — see ⑥ for the exposed cost)`,
    within(T2.live, T1.live, 0.10));
  // the design's §4 per-window ceiling (5,000) assumed aria-hidden removes a hidden card's serialisation
  // entirely; it removes ≈ 60–70 % of it (11.5 → 4.7 per card at a2). Pinned at the measured number
  // ×1.25 on THIS deterministic state (the design's rule: measure, then pin; tighten as each step
  // lands): a1 measured 5,448 / 916 (pinned 6,900 / 1,200); a2's paint-only layer measured 4,576 / 516
  // (pinned 5,700 / 650) — the window is now UNDER the design's 5,000 ceiling on the worst slab.
  check(`④d the per-window pin on the ${T2.page.rendered}-card slab: window subtree ${T2.scopes.window.total} TOTAL ≤ 5,700 (measured 4,576 ×1.25 at a2; 5,448 at a1) and ${T2.scopes.window.live} NON-IGNORED ≤ 650 (measured 516 ×1.25 at a2; 916 at a1)`,
    T2.scopes.window.total <= 5700 && T2.scopes.window.live <= 650);
  // a2's minimap pin on the paged state too: the strip is one per window whatever the slab
  check(`④e the minimap strip stays out of the tree on the slab: ${T2.scopes.minimap.total} / ${T2.scopes.minimap.live} for ${T2.page.markers} markers`,
    T2.scopes.minimap.total <= 10 && T2.scopes.minimap.live <= 10);
  console.log(`  band economics: teleport ${T0.total} → +1 slab ${T1.total} (${ratio(T1.total, T0.total)}) → +2 slabs ${T2.total} (${ratio(T2.total, T1.total)}); vs the 4-page-up window ${after.total}: ${ratio(T2.total, after.total)}; vs the 50-card baseline ${base.total}: ${ratio(T2.total, base.total)}; list subtree ${T2.scopes.list.total} / ${T2.scopes.list.live} on ${T2.page.rendered} rendered cards (${(T2.scopes.list.total / Math.max(1, T2.page.rendered)).toFixed(1)} per card — the band's share of them)`);

  // ⑤ THE SETTING'S TWO MEANINGS (boolean, design §8: on = the band, off = the whole list)
  const sw = await evaljs(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const v = window.__v, list = v._messageList;
    const cards = () => [...list.querySelectorAll(':scope > .chat-msg')];
    window.app.settings.set('accessibility.exposeChat', false); await sleep(400);
    const off = { list: list.getAttribute('aria-hidden'), cards: cards().length };
    for (const el of cards()) el.removeAttribute('aria-hidden');   // stale per-card state: the flip back must repair it without a scroll
    // the view flips back OUTSIDE app.sessions — a sub-agent viewer is never in that map, so the ON
    // flip must reach every view through its list (its _axView backref), the same set the OFF flip walks
    const key = [...window.app.sessions.entries()].find(([, x]) => x === v)?.[0];
    if (key != null) window.app.sessions.delete(key);
    window.app.settings.set('accessibility.exposeChat', true); await sleep(700);
    if (key != null) window.app.sessions.set(key, v);
    return { off, outside: key != null, on: { list: list.getAttribute('aria-hidden'), hidden: cards().filter((e) => e.getAttribute('aria-hidden') === 'true').length, cards: cards().length, why: v._axBand?.why } };
  })()`);
  check(`⑤ exposeChat=false ⇒ the LIST is aria-hidden (${sw.off.list}); true ⇒ the list is not (${sw.on.list}) and the band is re-derived on the flip without a scroll, for a view outside app.sessions (${sw.on.hidden} of ${sw.on.cards} cards hidden again, why=${sw.on.why})`,
    sw.off.list === 'true' && sw.on.list == null && sw.outside && sw.on.hidden > 0 && /^setting/.test(sw.on.why || ''), JSON.stringify(sw));

  // ⑦ FOCUS EXPOSES ITS CARD IN THE FOCUS EVENT'S OWN TASK (verifier finding, 2026-09-22): Tab /
  //    Shift+Tab / .focus() can land inside a band-hidden card, and the pass that exempts the
  //    focused card runs ≥ 150 ms later. A RECORDER in the window's CAPTURE phase reads the landing
  //    card's attribute before any product listener ran (`before` — the precondition: focus really
  //    arrived in a hidden card) and again in a setTimeout(0) queued from the same task (`after` —
  //    what the next AX serialisation sees, long before any 150 ms pass). CHROME'S OWN VERDICT beside
  //    it: MEASURED on Chrome 153, a focused element under aria-hidden makes Blink ignore the
  //    attribute on that ancestor and log "Blocked aria-hidden on an element because its descendant
  //    retained focus …" (Log.entryAdded) — so the platform tree already kept the control, but only
  //    through Chrome's repair of our markup (other engines need not repair it); the gate counts
  //    those warnings. ⑦a the CONTROL = the pre-fix code emulated in-page: a second capture listener
  //    stops focusin at the window for targets inside the list (the list's handler never runs) ⇒
  //    `after` stays 'true' and Chrome blocks (≥ 1 warning); ⑦b `.focus()` (the verifier's leg A4,
  //    preventScroll so nothing moves) ⇒ exposed at once, no warning, still exposed after the band's
  //    settle, EXACTLY ONE card fewer hidden (the fix widens nothing); ⑦c the verifier's keyboard
  //    path — Shift+Tab from the first tabbable after the list lands on the list's last tabbable, in a
  //    card beyond the band ⇒ exposed at the focus instant, no warning. Chrome warns ONCE per element:
  //    ⑦b re-focuses ⑦a's element, so its discriminator is the attribute; ⑦c's element is fresh.
  //    MEASURED against the pre-fix chat-view.js (2026-09-22): ⑦b after 'true' and still 'true' at
  //    +1.8 s (a .focus() without a scroll never ran a pass at all), ⑦c after 'true' + 1 warning.
  // a page WITHOUT system focus (headless, no window focus) moves activeElement on .focus() but
  // dispatches no focus / focusin (the first run of this leg: the recorder saw nothing); a real reader's
  // page has it, and Chrome fires focusin on the active element when the window regains it
  await cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
  const blocked = [];   // Chrome's "Blocked aria-hidden …" console warnings, drained per leg
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.method === 'Log.entryAdded' && /^Blocked aria-hidden/.test(m.params?.entry?.text || '')) blocked.push(m.params.entry.text.slice(0, 120)); });
  await cdp('Log.enable');
  const focusSetup = await evaljs(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const v = window.__v, list = v._messageList, win = document.querySelector('[data-ax-probe="win"]');
    for (let i = 0; i < 40 && (v._axSyncTimer || v._axSettleTimer); i++) await sleep(100);   // ⑤'s flip leaves a settle pass armed: let it land first
    await sleep(100);
    const cardOf = (el) => { let c = el; while (c && c.parentElement !== list) c = c.parentElement; return c && c.classList.contains('chat-msg') ? c : null; };
    window.__axCardOf = cardOf;
    window.__axFocus = [];
    window.__axRec = (e) => { const c = cardOf(e.target); const r = { tag: e.target.tagName, cls: String(e.target.className || '').slice(0, 40), inList: list.contains(e.target), before: c ? c.getAttribute('aria-hidden') : 'no-card' }; window.__axFocus.push(r); setTimeout(() => { r.after = c ? c.getAttribute('aria-hidden') : 'no-card'; }, 0); };
    window.addEventListener('focusin', window.__axRec, true);
    const SEL = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]';
    const tabbable = (e) => e.tabIndex >= 0 && e.checkVisibility() && !e.closest('[inert]');
    const inList = [...list.querySelectorAll(SEL)].filter(tabbable);
    const hiddenIn = inList.filter((e) => cardOf(e)?.getAttribute('aria-hidden') === 'true');
    const last = inList[inList.length - 1] || null;
    // the program leg's target: a tabbable in a hidden card BELOW the band (a card above the viewport
    // that resolves its content-visibility:auto height on focus would move the view by anchoring)
    // and OTHER than the keyboard leg's landing card
    const lr = list.getBoundingClientRect();
    const prog = hiddenIn.find((e) => cardOf(e) !== cardOf(last) && cardOf(e).getBoundingClientRect().top > lr.bottom + 2 * list.clientHeight) || null;
    const from = [...win.querySelectorAll(SEL)].filter(tabbable).find((e) => !list.contains(e) && (list.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING)) || null;
    if (prog) prog.dataset.axProbe = 'focus-prog';
    if (last) last.dataset.axProbe = 'focus-last';
    if (from) from.dataset.axProbe = 'focus-from';
    return { tabbables: inList.length, inHiddenCards: hiddenIn.length, prog: prog ? { tag: prog.tagName, cls: String(prog.className).slice(0, 40), hidden: cardOf(prog).getAttribute('aria-hidden') } : null,
      last: last ? { tag: last.tagName, cls: String(last.className).slice(0, 40), hidden: cardOf(last)?.getAttribute('aria-hidden') ?? 'no-card' } : null,
      from: from ? { tag: from.tagName, cls: String(from.className).slice(0, 40) } : null, hidden: list.querySelectorAll(':scope > .chat-msg[aria-hidden="true"]').length, st: Math.round(list.scrollTop), ws: v._windowStart };
  })()`);
  console.log(`  focus setup: ${JSON.stringify(focusSetup)}`);
  // Chrome's own AX node for the focused element, read right after the focus lands (reading it also
  // forces the pending AX update — and with it any "Blocked aria-hidden" warning — before the reply)
  const axOfActive = async () => {
    const r = await cdp('Runtime.evaluate', { expression: 'document.activeElement' });
    const objectId = r.result?.result?.objectId;
    if (!objectId) return { error: 'no activeElement object' };
    const p = await cdp('Accessibility.getPartialAXTree', { objectId, fetchRelatives: false });
    const n = (p.result?.nodes || [])[0];
    return n ? { role: n.role?.value, ignored: !!n.ignored, reasons: (n.ignoredReasons || []).map((x) => x.name) } : { error: JSON.stringify(p).slice(0, 200) };
  };
  const lastFocus = () => evaljs(`(async () => { await new Promise((r) => setTimeout(r, 20)); return window.__axFocus[window.__axFocus.length - 1] || null; })()`);
  if (!focusSetup.prog || !focusSetup.last || !focusSetup.from) {
    check('⑦ the focus legs found their targets (a tabbable in a hidden card below the band, the list\'s last tabbable, a tabbable after the list)', false, JSON.stringify(focusSetup));
  } else {
    // ⑦a CONTROL — the list's focusin handler blocked: the pre-fix code, in-page
    blocked.splice(0);
    await evaljs(`(() => { window.__axBlock = (e) => { if (window.__v._messageList.contains(e.target)) e.stopPropagation(); }; window.addEventListener('focusin', window.__axBlock, true); document.querySelector('[data-ax-probe="focus-prog"]').focus({ preventScroll: true }); return true; })()`);
    const ctlAx = await axOfActive();
    const ctl = await lastFocus();
    const ctlBlocked = blocked.splice(0);
    await evaljs(`(() => { window.removeEventListener('focusin', window.__axBlock, true); document.querySelector('[data-ax-probe="focus-from"]').focus({ preventScroll: true }); return true; })()`);
    console.log(`  ⑦a control: ${JSON.stringify(ctl)} · Chrome's AX node ${JSON.stringify(ctlAx)} · Chrome blocked ${ctlBlocked.length}: ${JSON.stringify(ctlBlocked[0] || '')}`);
    check(`⑦a NEGATIVE CONTROL: with the list's focusin handler blocked (the pre-fix code) a .focus() into a band-hidden card leaves the card aria-hidden at the focus instant (before ${ctl?.before}, after ${ctl?.after}) and Chrome has to block it (${ctlBlocked.length} "Blocked aria-hidden" warning${ctlBlocked.length === 1 ? '' : 's'})`,
      ctl?.inList && ctl.before === 'true' && ctl.after === 'true' && ctlBlocked.length >= 1, JSON.stringify({ ctl, ctlAx, ctlBlocked }));
    // ⑦b .focus() — exposed in the focus event's own task, kept by the band's exemption, nothing widened
    await evaljs(`(() => { document.querySelector('[data-ax-probe="focus-prog"]').focus({ preventScroll: true }); return true; })()`);
    const progAx = await axOfActive();
    const prog = await lastFocus();
    const kept = await evaljs(`(async () => { await new Promise((r) => setTimeout(r, 1800)); const v = window.__v, list = v._messageList, el = document.querySelector('[data-ax-probe="focus-prog"]'); return { active: document.activeElement === el, card: window.__axCardOf(el)?.getAttribute('aria-hidden') ?? null, hidden: list.querySelectorAll(':scope > .chat-msg[aria-hidden="true"]').length, st: Math.round(list.scrollTop), ws: v._windowStart, why: v._axBand?.why }; })()`);
    const progBlocked = blocked.splice(0);
    console.log(`  ⑦b .focus(): ${JSON.stringify(prog)} · Chrome's AX node ${JSON.stringify(progAx)} · Chrome blocked ${progBlocked.length} · +1.8 s ${JSON.stringify(kept)}`);
    check(`⑦b .focus() into a band-hidden card exposes it in the focus event's own task (before ${prog?.before} → after ${prog?.after}; the focused ${prog?.tag} not ignored in Chrome's tree: ${!progAx.ignored}) and Chrome never has to block an aria-hidden (${progBlocked.length} warnings)`,
      prog?.inList && prog.before === 'true' && prog.after == null && progAx.ignored === false && progBlocked.length === 0, JSON.stringify({ prog, progAx, progBlocked }));
    check(`⑦b …the band's next passes keep it exposed (+1.8 s: card ${kept.card}, why=${kept.why}) and widen nothing: exactly ONE card fewer hidden (${focusSetup.hidden} → ${kept.hidden}) with the view unmoved (st ${focusSetup.st} → ${kept.st}, ws ${focusSetup.ws} → ${kept.ws})`,
      kept.active && kept.card == null && kept.hidden === focusSetup.hidden - 1 && kept.st === focusSetup.st && kept.ws === focusSetup.ws, JSON.stringify(kept));
    // ⑦c the verifier's keyboard path: Shift+Tab from the first tabbable after the list
    await evaljs(`(() => { document.querySelector('[data-ax-probe="focus-from"]').focus({ preventScroll: true }); return true; })()`);
    blocked.splice(0);
    for (const type of ['keyDown', 'keyUp']) await cdp('Input.dispatchKeyEvent', { type, key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9, modifiers: 8 });
    const keyAx = await axOfActive();
    const kb = await lastFocus();
    const keyBlocked = blocked.splice(0);
    const landed = await evaljs(`document.activeElement === document.querySelector('[data-ax-probe="focus-last"]')`);
    console.log(`  ⑦c Shift+Tab: ${JSON.stringify(kb)} · on the predicted last tabbable ${landed} · Chrome's AX node ${JSON.stringify(keyAx)} · Chrome blocked ${keyBlocked.length}`);
    check(`⑦c Shift+Tab from the first tabbable after the list (${focusSetup.from.cls}) lands inside the list in a band-hidden card (${kb?.tag}.${kb?.cls}, before ${kb?.before}) and that card is exposed at the focus instant (after ${kb?.after}; ${keyBlocked.length} "Blocked aria-hidden" warnings)`,
      kb?.inList && kb.before === 'true' && kb.after == null && keyAx.ignored === false && keyBlocked.length === 0, JSON.stringify({ kb, keyAx, keyBlocked, landed }));
    await evaljs(`(() => { window.removeEventListener('focusin', window.__axRec, true); document.activeElement?.blur?.(); return true; })()`);
  }
  await cdp('Log.disable');
  await cdp('Emulation.setFocusEmulationEnabled', { enabled: false });
}

// ⑥ NEGATIVE CONTROL — the band neutered at SOURCE, the same run, the exposure must GROW
if (T2 && census) {
  const fp = path.join(wt, 'src/lib/chat-view.js');
  const marker = '  _syncAxExposure(why) {';
  const src = fs.readFileSync(fp, 'utf8');
  if (src.split(marker).length !== 2) check('⑥ NEGATIVE CONTROL marker present exactly once in chat-view.js', false, marker);
  else {
    fs.writeFileSync(fp, src.replace(marker, `${marker} return; // NEGATIVE CONTROL: the reader's band neutered`));
    execSync('npx esbuild src/client.js --bundle --outfile=public/bundle.js --format=iife --platform=browser --target=es2020 --loader:.css=css', { cwd: wt, stdio: 'ignore' });
    const o = await openFixtureWindow('control');
    if (!o?.ok) check('⑥ NEGATIVE CONTROL: the neutered copy opened the fixture window', false, JSON.stringify(o));
    else {
      const tp = await teleport();
      const p1 = await gapPageUp();
      const C1 = await measure('CONTROL: band neutered, teleport + 1 slab');
      const p2 = await gapPageUp();
      console.log(`  control gestures: teleport ${JSON.stringify(tp)} · page-ups ${JSON.stringify([p1, p2])}`);
      const C2 = await measure('CONTROL: band neutered, teleport + 2 slabs');
      const cc = await bandCensus();
      console.log(`  control band: ${JSON.stringify(cc)}`);
      check(`⑥ NEGATIVE CONTROL: the same gestures on the neutered copy really ran (${cc.cards} vs ${census.cards} rendered cards)`, tp.ok && p1.ok && p2.ok && cc.cards >= 0.8 * census.cards, JSON.stringify({ tp, p1, p2 }));
      check(`⑥ NEGATIVE CONTROL: with the band neutered every card beyond 2 viewports is exposed (${cc.beyond} beyond, ${cc.beyondExposed} exposed, ${cc.hidden} hidden)`, cc.beyond > 0 && cc.beyondExposed === cc.beyond && cc.hidden === 0, JSON.stringify(cc));
      check(`⑥ NEGATIVE CONTROL: …and the exposure GROWS by > 30 % — TOTAL ${T2.total} → ${C2.total} (${ratio(C2.total, T2.total)}), NON-IGNORED ${T2.live} → ${C2.live} (${ratio(C2.live, T2.live)})`,
        C2.total > 1.3 * T2.total && C2.live > 1.3 * T2.live);
      const mBand = (T2.total - T1.total) / Math.max(1, T2.page.rendered - T1.page.rendered), mCtrl = (C2.total - C1.total) / Math.max(1, C2.page.rendered - C1.page.rendered);
      check(`⑥ …and a card added OUTSIDE the band costs less than half of what it costs exposed: ${mBand.toFixed(1)} vs ${mCtrl.toFixed(1)} serialised nodes per added card (the second slab, band vs neutered)`,
        mBand < 0.5 * mCtrl);
    }
  }
}

// ── 6. THE REAL HOME IS UNTOUCHED (the fixture lives under the isolated home) ──
{
  const now = (() => { try { return fs.readdirSync(REAL_PROJECTS, { withFileTypes: true }); } catch { return []; } })();
  const added = now.filter((d) => !realBefore.has(d.name))
    .map((d) => ({ name: d.name, mtimeMs: (() => { try { return fs.statSync(path.join(REAL_PROJECTS, d.name)).mtimeMs; } catch { return Date.now(); } })() }));
  const lit = fixtureLitter(added);
  check(`the real ~/.claude/projects gained no fixture entry (${added.length} new entr${added.length === 1 ? 'y' : 'ies'} from concurrent real sessions, 0 of them fixtures)`,
    lit.offenders.length === 0, JSON.stringify(lit.offenders.slice(0, 3)));
  check('…and this suite\'s OWN project dir is not among them (it lives under the isolated home)',
    !now.some((d) => d.name === path.basename(PROJ)), path.basename(PROJ));
}

ws.close();
console.log(failed ? `\n${failed} FAILED (${passed} passed)` : `\nALL PASS (${passed})`);
process.exit(failed ? 1 : 0);
