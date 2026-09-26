#!/usr/bin/env node
// THE TITLE WINS — the chrome gate (lane G, 2026-09-25; heavy). The owner, on a tab strip whose titles
// read "V.." / a six-letter stub beside a billing chip "≋ 全部 → UCI Max" and an inbox chip "⌸ 1": "这个全部->UCI
// Max占据了绝大部分空间，都看不到窗口标题了，你有什么好的解决方案吗？"
//
// Scene: a worktree server on a free port, a fake `claude` on CLAUDE_CMD, three chat sessions with real-
// length names; a desktop page 1280×900. The pooled identity is the server's own shape (server.js
// poolAuth: {source:'pooled', name, poolTarget}) fed through the page's own setAuthBadge — a fresh
// server holds no pool — and each window carries a mini inbox count of 1 (the screenshot's "⌸ 1").
//   1  a 3-tab chain in a 640 px window ⇒ every tab's title stays readable — ≥ 6 characters beside a
//      compact chip (the rule's own guarantee), ≥ 5 beside an icon one (the floor; how much the rest holds
//      is the face's business — the message names the px and the platform face) — measured on the
//      rendered text with a Range, not the product's canvas; every billing chip is compact or icon,
//      its tooltip (the instant tooltip on a real hover) reads "全部 → UCI Max", the inbox chip still
//      shows its number; a click on the chip opens the billing switcher, whose pool row names
//      "全部 → UCI Max"
//   2  a 2-tab chain without inbox chips resized 1240 → 400 → 1240 px ⇒ compact → icon → compact, re-decided
//      by the ResizeObserver alone (a 200 px tab cannot hold a 30-character title beside every word)
//   3  one window alone at 1240 px ⇒ the chip is full ("全部 → UCI Max" drawn) and the whole title shows
//   4  the same window at 340 px ⇒ the standalone title bar yields too: the chip not full, the title ≥ 6
//   5  a member switch (the pool broadcast = a new poolTarget) re-decides with the new words
//   6  NEGATIVE CONTROL — a patched copy of src/lib/title-chips.js whose chipMode always answers 'full'
//      (scripts/mutant-copy.mjs, bundled in place of the real module): the same 640 px chain ⇒ every
//      tab's title shrinks to ≤ 3 characters (the owner's "V..")
// Legs 1–5 run TWICE: under this box's own `system-ui` and under 'DejaVu Sans' forced on `html, body` —
// the Actions runner's `system-ui` (this box's is Noto Sans, ~10 % narrower), the tab labels proven drawn
// in it (CSS.getPlatformFontsForNode); that pass SKIPs with a reason without DejaVu Sans. Every check
// of the second pass is prefixed "[DejaVu Sans]".
// SKIPs with evidence without chrome / dtach. Free ports, scratch dirs only.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, scratchHome, freePort, ONBOARDED_SOURCE, vncEnv } from './scratch.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port for every server this suite boots (never the machine-global :7/5901 — test-architecture §57)
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const { WebSocket } = require('ws');

let pass = 0, fail = 0, skipped = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + String(extra).slice(0, 1200) : '')); } return !!c; };
const okBase = (c, n, extra) => ok(c, n, extra); // the module-level check (a face pass shadows `ok` to name its face)
const skip = (n) => { skipped++; console.log('  ⊘ SKIP ' + n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms, every = 50) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await pred()) return true; await sleep(every); } return !!(await pred()); };
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const ROOT = scratch('title-chips-ui');
const MUT = mutantCopies('title-chips-ui', repo);
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const procs = new Set(); const worktrees = new Set(); let fakeHome = null;
function cleanup() {
  for (const p of procs) { try { p.kill('SIGKILL'); } catch { } }
  for (const wt of worktrees) { try { execFileSync('git', ['-C', repo, 'worktree', 'remove', '--force', wt], { stdio: 'ignore' }); } catch { } }
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { }
  if (fakeHome) { try { fs.rmSync(fakeHome, { recursive: true, force: true }); } catch { } }
}
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });

const NAMES = ['VibeSpace lane G billing badge', 'Northwind enterprise contracts', 'Weekly quota review notes'];
const POOL = { source: 'pooled', name: '全部', poolTarget: 'UCI Max' };
const FULL_WORDS = '全部 → UCI Max';

const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
let dtachOk = false; try { execFileSync('/usr/bin/which', ['dtach'], { stdio: 'ignore' }); dtachOk = true; } catch { }
if (!CHROME) skip('no chrome/chromium on this box — every leg needs one');
else if (!dtachOk) skip('dtach is not installed — a local session cannot be created here');
else await (async () => {
  fakeHome = scratchHome('title-chips-ui-home', fs);
  const wt = path.join(ROOT, 'wt'); const BIN = path.join(ROOT, 'bin'); fs.mkdirSync(BIN, { recursive: true });
  // each fake session names its OWN conversation (the fixture family + the shell's pid)
  const hookLine = JSON.stringify({ type: 'system', subtype: 'hook_started', session_id: '%s', hook_name: 'SessionStart' });
  const initLine = JSON.stringify({ type: 'system', subtype: 'init', session_id: '%s', cwd: ROOT, model: 'claude-fable-5', apiKeySource: 'none', tools: [], mcp_servers: [] });
  fs.writeFileSync(path.join(BIN, 'claude'), `#!/bin/sh\nSID="e2e00000-0000-4000-8000-$(printf '%012d' $$)"\ncase " $* " in *" --output-format "*) sleep 1; printf '${hookLine}\\n${initLine}\\n' "$SID" "$SID";; esac\nexec sleep 600\n`, { mode: 0o755 });
  const PORT = await freePort(), CDP = await freePort();
  execFileSync('git', ['-C', repo, 'worktree', 'add', '--detach', wt, 'HEAD'], { stdio: 'ignore' }); worktrees.add(wt);
  // the WORKING tree is what is judged (a pre-commit run tests what is about to ship)
  for (const f of ['src', 'public', 'server.js', 'package.json']) { execFileSync('rm', ['-rf', path.join(wt, f)]); execFileSync('cp', ['-r', path.join(repo, f), path.join(wt, f)]); }
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
  const esbuild = require(path.join(repo, 'node_modules', 'esbuild'));
  /** The page bundle from the scratch worktree's sources (the build's own flags); `titleChips` = the file
   *  every `./title-chips.js` import resolves to (the real module, or a patched copy for the control). */
  const bundle = async (titleChips) => esbuild.build({
    entryPoints: [path.join(wt, 'src/client.js')], bundle: true, outfile: path.join(wt, 'public/bundle.js'), format: 'iife', platform: 'browser', target: 'es2020', loader: { '.css': 'css' }, logLevel: 'silent',
    plugins: titleChips ? [{ name: 'title-chips', setup(b) { b.onResolve({ filter: /(^|\/)title-chips\.js$/ }, () => ({ path: titleChips })); } }] : [],
  });
  await bundle(null);
  const env = { ...process.env, ...VNC_ENV, PATH: BIN + ':' + (process.env.PATH || ''), CLAUDE_CMD: path.join(BIN, 'claude'), PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' };
  let journal = '';
  const srv = spawn('node', ['server.js'], { cwd: wt, env, stdio: ['ignore', 'pipe', 'pipe'] });
  procs.add(srv); srv.stdout.on('data', (d) => { journal += d; }); srv.stderr.on('data', (d) => { journal += d; });
  if (!ok(await until(() => journal.includes('Ready.'), 40000, 100), 'the worktree server booted', journal.slice(-800))) return;
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`); const msgs = []; ws.on('message', (d) => { try { msgs.push(JSON.parse(d)); } catch { } });
  await new Promise((r, e) => { ws.on('open', r); ws.on('error', e); });
  const create = async (reqId, name) => { ws.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: ROOT, cols: 80, rows: 24, reqId, name })); await until(() => msgs.some((m) => m.type === 'created' && m.reqId === reqId), 15000); return msgs.find((m) => m.type === 'created' && m.reqId === reqId)?.sessionId; };
  const sids = [];
  for (let i = 0; i < NAMES.length; i++) sids.push(await create('s' + i, NAMES[i]));
  const killSessions = async () => {
    for (const sid of sids.filter(Boolean)) ws.send(JSON.stringify({ type: 'kill', sessionId: sid }));
    await until(() => sids.filter(Boolean).every((sid) => msgs.some((m) => (m.type === 'killed' || m.type === 'exited') && m.sessionId === sid)), 8000);
  };
  let chrome = null, P = null;
  try {
  if (!ok(sids.every(Boolean), 'three chat sessions were created on the fake claude', journal.slice(-600))) return;
  await sleep(1200);

  chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', `--user-data-dir=${path.join(ROOT, 'chrome')}`, '--window-size=1280,900', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  procs.add(chrome);
  let target = null; for (let i = 0; i < 120 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find((t) => t.type === 'page'); } catch { } if (!target) await sleep(250); }
  if (!ok(!!target, 'chrome exposed a CDP page target')) return;
  const cdp = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r, e) => { cdp.on('open', r); cdp.on('error', e); });
  let seq = 0; const pend = new Map();
  cdp.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); cdp.send(JSON.stringify({ id, method, params })); });
  const S = JSON.stringify;
  const ev = async (js) => {
    const r = await send('Runtime.evaluate', { expression: `(async () => { const app = window.app, wm = app.wm; const rect = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; }; const chats = () => [...wm.windows.values()].filter((w) => w.type === 'chat'); const sidOf = (id) => (app.sessions.get(id) || {}).sessionId || null; const bySid = (sid) => chats().find((w) => sidOf(w.id) === sid) || null; ${js} })()`, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval threw');
    return r.result?.result?.value;
  };
  P = { close: () => { try { cdp.close(); } catch { } } };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); // §47: the first-run wizard would cover the chrome on an empty runner
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  const boot = async () => {
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
    for (let i = 0; i < 120; i++) { try { if (await ev('if (!window.app || !window.app.ready) return false; return await Promise.race([window.app.ready.then(() => true), new Promise((r) => setTimeout(() => r(false), 100))]);')) return true; } catch { } await sleep(250); }
    return false;
  };
  if (!ok(await boot(), 'the app booted in headless chrome (desktop, 1280×900)')) return;
  await sleep(1500);
  const mouse = (type, x, y, extra = {}) => send('Input.dispatchMouseEvent', { type, x, y, ...extra });

  /** Close everything, open the three sessions, dress them as the owner's (pooled + an inbox count of 1 — the
   *  page's own setters, pinned against the broadcasts that would reset them), and group them when `chain`. */
  const scene = async ({ chain, width, n = 3, inbox = 1 }) => {
    await ev(`document.querySelectorAll('.context-menu').forEach((m) => m.remove()); for (const w of [...wm.windows.values()]) wm.closeWindow(w.id); return true;`);
    await until(() => ev('return wm.windows.size === 0;'), 5000);
    for (let i = 0; i < n; i++) {
      await ev(`app.attachSession(${S(sids[i])}, ${S(NAMES[i])}, ${S(ROOT)}, { mode: 'chat', backend: 'claude' }); return true;`);
      await until(() => ev(`return !!bySid(${S(sids[i])});`), 10000);
    }
    return ev(`
      const ids = ${S(sids.slice(0, n))}.map((sid) => bySid(sid).id);
      window.__tcFix = window.__tcFix || { pool: ${S(POOL)} };
      window.__tcFix.inbox = ${inbox};
      window.__tcFix.titles = Object.fromEntries(ids.map((id, i) => [id, ${S(NAMES)}[i]]));
      if (!wm.__tcWrapped) {
        const origAuth = wm.setAuthBadge.bind(wm), origInbox = wm.setInboxBadge.bind(wm), origTitle = wm.setTitle.bind(wm);
        wm.setTitle = (id, t) => origTitle(id, window.__tcFix.titles[id] || t); // the identity sync names a fake session "Session N — <cwd>"; the scene keeps its real-length names
        wm.setAuthBadge = (id, a) => origAuth(id, wm.windows.get(id)?.type === 'chat' ? window.__tcFix.pool : a);
        wm.setInboxBadge = (id, b) => origInbox(id, wm.windows.get(id)?.type === 'chat' ? { count: window.__tcFix.inbox, urgency: 'normal' } : b);
        wm.__tcWrapped = true;
      }
      for (const id of ids) { wm.setTitle(id, ${S(NAMES)}[ids.indexOf(id)]); wm.setAuthBadge(id, window.__tcFix.pool); wm.setInboxBadge(id, { count: window.__tcFix.inbox }); }
      const host = wm.windows.get(ids[0]);
      host.element.style.left = '20px'; host.element.style.top = '20px'; host.element.style.width = ${S(width + 'px')}; host.element.style.height = '420px';
      if (${chain ? 'true' : 'false'}) { const ch = wm.createTabChain(host, wm.windows.get(ids[1])); for (const id of ids.slice(2)) wm.addToTabChain(host._tabChain, wm.windows.get(id)); }
      wm.focusWindow(host.id);
      return new Promise((res) => setTimeout(() => res({ ids, host: host.id }), 700));`);
  };
  /** Per chip on the host's bar: the label's VISIBLE characters (a Range over the rendered text — the
   *  characters whose right edge fits before the ellipsis), the chip's form, what it draws, its tooltip. */
  const measure = (hostId) => ev(`
    const host = wm.windows.get(${S(hostId)});
    const rows = host._tabChain
      ? [...host.titleBar.querySelectorAll(':scope > .tab-bar-tabs .tab-item')].map((tab) => ({ box: tab, label: tab.querySelector(':scope > .tab-label'), chip: tab.querySelector(':scope > .win-auth-badge'), inbox: tab.querySelector(':scope > .win-inbox-badge') }))
      : [{ box: host.titleBar, label: host.titleSpan, chip: host.titleBar.querySelector(':scope > .win-auth-badge'), inbox: host.titleBar.querySelector(':scope > .win-inbox-badge') }];
    const visible = (label) => {
      const node = label.firstChild; if (!node) return { n: 0, of: 0 };
      const text = node.textContent; const cps = Array.from(text); const lr = label.getBoundingClientRect();
      const range = document.createRange();
      const measureTo = (k) => { let off = 0; for (let i = 0; i < k; i++) off += cps[i].length; range.setStart(node, 0); range.setEnd(node, off); return range.getBoundingClientRect().right; };
      if (measureTo(cps.length) <= lr.right + 0.5) return { n: cps.length, of: cps.length, whole: true, labelW: Math.round(lr.width) };
      const ell = (() => { const s = document.createElement('span'); s.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap'; s.style.font = getComputedStyle(label).font; s.textContent = '…'; document.body.appendChild(s); const w = s.getBoundingClientRect().width; s.remove(); return w; })();
      let n = 0; while (n < cps.length && measureTo(n + 1) + ell <= lr.right + 0.5) n++;
      return { n, of: cps.length, whole: false, labelW: Math.round(lr.width) };
    };
    return rows.map((r) => ({
      title: r.label.textContent, vis: visible(r.label), boxW: Math.round(r.box.getBoundingClientRect().width),
      mode: r.chip ? r.chip.dataset.mode || 'full' : null, chipW: r.chip ? Math.round(r.chip.getBoundingClientRect().width) : 0,
      drawn: r.chip ? r.chip.innerText.replace(/\\s+/g, ' ').trim() : null, tip: r.chip ? r.chip.dataset.tip : null,
      chipRect: r.chip ? rect(r.chip) : null, inbox: r.inbox ? r.inbox.innerText.trim() : null, inboxW: r.inbox ? Math.round(r.inbox.getBoundingClientRect().width) : 0,
    }));`);
  // VS_TITLE_CHIPS_SHOTS=<dir> (opt-in, for a human's eyes): a PNG of the host's title bar per leg
  const SHOTS = process.env.VS_TITLE_CHIPS_SHOTS || '';
  // …and every measured line below into <dir>/measurements.txt (ci.mjs prints only a green suite's last line)
  const note = (line) => { console.log(line); if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); fs.appendFileSync(path.join(SHOTS, 'measurements.txt'), line + '\n'); } };
  const shot = async (name, hostId) => {
    if (!SHOTS) return;
    const r = await ev(`return rect(wm.windows.get(${S(hostId)}).titleBar);`);
    const img = await send('Page.captureScreenshot', { format: 'png', clip: { x: r.left, y: r.top, width: r.width, height: r.height, scale: 2 } });
    if (img.result?.data) { fs.mkdirSync(SHOTS, { recursive: true }); fs.writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(img.result.data, 'base64')); }
  };
  const brief = (rows) => rows.map((r) => `${JSON.stringify(r.title.slice(0, 44))} ${r.vis.n}/${r.vis.of} chars in ${r.vis.labelW}px · ${r.mode} "${r.drawn}" ${r.chipW}px · inbox ${r.inbox} · tab ${r.boxW}px`).join(' | ');

  /** The platform face chrome actually rendered `selector`'s text in (CDP CSS.getPlatformFontsForNode) —
   *  the evidence of WHICH font a width was measured under (this box resolves `system-ui` to Noto Sans,
   *  the Actions runner to DejaVu Sans). */
  const platformFont = async (selector) => {
    try {
      await send('DOM.enable'); await send('CSS.enable');
      const doc = await send('DOM.getDocument', { depth: 0 });
      const q = await send('DOM.querySelector', { nodeId: doc.result?.root?.nodeId, selector });
      if (!q.result?.nodeId) return null;
      const f = await send('CSS.getPlatformFontsForNode', { nodeId: q.result.nodeId });
      return (f.result?.fonts || []).map((x) => x.familyName).join(' + ') || null;
    } catch { return null; }
  };
  /** The owner's strip, measured: the 640 px 3-tab chain with inbox chips. THE TITLE-CHARACTER FLOOR IS
   *  FONT-ROBUST BY CONSTRUCTION (lane G integration): the rule itself guarantees ≥ TITLE_MIN_CHARS (6)
   *  characters only where it chose COMPACT (it measures the label's own face on a canvas, so that half
   *  holds under any font); an ICON chip is the floor — the title gets everything else, and how many
   *  characters "everything else" holds is the FACE's business (the product ships no UI face of its own:
   *  `system-ui, sans-serif`). So an icon tab is held to ≥ 5 characters, the message naming the label's
   *  measured px and the face that drew it — and the scene runs twice, under this box's face and under
   *  'DejaVu Sans' (the runner's `system-ui`), so the runner's geometry is proven here before it ships. */
  const stripChecks = (rows, face, tag) => {
    const px = rows.map((r) => `${r.vis.n} chars in a ${r.vis.labelW} px label (${r.mode})`).join(', ');
    ok(rows.length === 3 && rows.every((r) => r.mode), `${tag}three tabs, each with its billing chip`, S(rows));
    ok(rows.every((r) => r.vis.n >= (r.mode === 'compact' ? 6 : 5)), `${tag}every tab's title stays readable — compact ⇒ ≥ 6 characters (the rule's own guarantee), icon ⇒ ≥ 5: ${px} under ${face || 'an unreported face'} — 2.369.177 drew "V.."`, S(rows.map((r) => r.vis)));
    ok(rows.every((r) => r.mode === 'compact' || r.mode === 'icon'), `${tag}every chip yields: compact or icon (${rows.map((r) => r.mode).join(', ')})`);
    ok(rows.every((r) => !r.drawn.includes('全部')), `${tag}no chip draws the pool prefix "全部 →" on the strip`, S(rows.map((r) => r.drawn)));
    ok(rows.every((r) => r.mode !== 'compact' || r.drawn === 'UCI Max'), `${tag}a compact chip draws the member's short name only ("UCI Max")`, S(rows.map((r) => r.drawn)));
    ok(rows.every((r) => r.tip && r.tip.startsWith(FULL_WORDS)), `${tag}every chip's tooltip LEADS with the full words "${FULL_WORDS}"`, S(rows.map((r) => r.tip)));
    ok(rows.every((r) => r.inbox === '1' && r.inboxW <= 32), `${tag}the inbox chip keeps its number at its minimal width (${rows.map((r) => r.inboxW + 'px').join(', ')})`);
  };
  const TAB_LABEL = '.window .tab-bar-tabs .tab-item > .tab-label';

  // THE FACE (lane G integration): legs 1–5 run under this box's own `system-ui` AND under 'DejaVu Sans' —
  // what `system-ui, sans-serif` resolves to on the Actions runner (no Noto / Cantarell there; this box
  // resolves Noto Sans, ~10 % narrower — test-roster-reset-eta's wide-font pass is the precedent). The
  // product's own selector (`html, body`) is forced for the second pass only, and the tab labels are
  // proven drawn in it (CSS.getPlatformFontsForNode). SKIPs that pass with a reason without the face.
  const hasDejaVu = (() => { try { return /DejaVu Sans/.test(execFileSync('fc-list', [':', 'family'], { encoding: 'utf8' })); } catch { return false; } })();
  if (!hasDejaVu) skip("the runner-face pass (legs 1–5 under 'DejaVu Sans') needs DejaVu Sans on this machine (fc-list : family)");
  for (const FACE of hasDejaVu ? [null, 'DejaVu Sans'] : [null]) {
  const tag = FACE ? `[${FACE}] ` : '', shotTag = FACE ? FACE.replace(/\W+/g, '') + '-' : '';
  const ok = (c, n, extra) => okBase(c, tag + n, extra); // every check of this pass names its face
  let reg = null;
  if (FACE) {
    reg = await send('Page.addScriptToEvaluateOnNewDocument', { source: `document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = "html, body { font-family: '${FACE}', sans-serif !important; }"; document.head.appendChild(st); });` });
    if (!ok(await boot(), 'the app re-booted with the face forced on html, body')) return;
    await sleep(1200);
    const face = await ev(`return getComputedStyle(document.body).fontFamily;`);
    ok(String(face).replace(/["']/g, '').startsWith(FACE), `the forced face is in force (body font-family: ${face})`);
  }
  try {
    // ── 1 · the owner's strip ──
    note(tag + '— 1 · a pooled session in a 3-tab chain at 640 px');
    {
      const s = await scene({ chain: true, width: 640 });
      const rows = await measure(s.host);
      const face = await platformFont(TAB_LABEL);
      note(`    [${face}] ` + brief(rows));
      await shot(shotTag + '1-chain-640', s.host);
      if (FACE) ok(new RegExp(FACE).test(face || ''), `the tab labels really are drawn in ${FACE} (platform font: ${S(face)})`);
      stripChecks(rows, face, tag);
      // a real hover shows the tooltip with the full words
      const c = rows[1].chipRect;
      await mouse('mouseMoved', c.left + c.width / 2, c.top + c.height / 2); await sleep(200);
      const tipShown = await ev(`const t = document.querySelector('.instant-tooltip'); return t && t.style.display !== 'none' ? t.textContent : null;`);
      ok(tipShown && tipShown.startsWith(FULL_WORDS), `hovering the chip shows "${FULL_WORDS}" (the instant tooltip: ${S(tipShown)})`);
      // the click target still opens the switcher — its pool row names the pool AND the member
      await ev(`app._accounts = { accounts: [{ id: 'pool-all', name: '全部', pooled: true, type: 'pooled', current: 'acct-uci', currentName: 'UCI Max', backend: 'claude', loggedIn: true }] }; return true;`);
      await mouse('mousePressed', c.left + c.width / 2, c.top + c.height / 2, { button: 'left', clickCount: 1 });
      await mouse('mouseReleased', c.left + c.width / 2, c.top + c.height / 2, { button: 'left', clickCount: 1 });
      await sleep(400);
      const menu = await ev(`const m = document.querySelector('.context-menu'); return m ? [...m.querySelectorAll('.context-menu-item')].map((el) => el.textContent.replace(/\\s+/g, ' ').trim()) : null;`);
      ok(Array.isArray(menu) && menu.length >= 2, 'a click on the chip opens the billing switcher', S(menu));
      ok(Array.isArray(menu) && menu.some((l) => l.includes('全部') && l.includes('→ UCI Max')), `…whose pool row names "${FULL_WORDS}" (the words the chip dropped)`, S(menu));
      await ev(`document.querySelectorAll('.context-menu').forEach((m) => m.remove()); return true;`);
    }

    // ── 2 · the chain re-decides on a resize ──
    note(tag + '— 2 · a 2-tab chain (no inbox chips) resized 1240 → 400 → 1240 px (ResizeObserver, no other trigger)');
    {
      const s = await scene({ chain: true, width: 1240, n: 2, inbox: 0 });
      // a 200 px tab (the strip's max): a 30-character title cannot sit beside every word, six of it can beside "UCI Max"
      const wide = await measure(s.host);
      note('    1240: ' + brief(wide));
      await shot(shotTag + '2-chain2-1240', s.host);
      ok(wide.length === 2 && wide.every((r) => r.mode === 'compact' && r.drawn === 'UCI Max' && r.inbox === null), `1240 px: both chips compact ("UCI Max") — not full: the whole title does not fit a 200 px tab beside every word (${wide.map((r) => r.mode).join(', ')})`, S(wide));
      ok(wide.every((r) => r.vis.n >= 6), `…the titles keep ${wide.map((r) => r.vis.n).join(', ')} characters`);
      await ev(`wm.windows.get(${S(s.host)}).element.style.width = '400px'; return true;`);
      await sleep(500);
      const narrow = await measure(s.host);
      note('    400:  ' + brief(narrow));
      await shot(shotTag + '2-chain2-400', s.host);
      ok(narrow.every((r) => r.mode === 'icon') && narrow.every((r, i) => r.vis.n > 0), `400 px: both chips icon-only, re-decided by the resize alone (${narrow.map((r) => r.mode).join(', ')})`, S(narrow));
      await ev(`wm.windows.get(${S(s.host)}).element.style.width = '1240px'; return true;`);
      await sleep(500);
      const back = await measure(s.host);
      ok(back.every((r, i) => r.mode === wide[i].mode && r.vis.n === wide[i].vis.n), `1240 px again: the same forms and titles as before (${back.map((r) => r.mode).join(', ')}) — the room comes back to the chip`, S(back));
    }

    // ── 3 · one window, wide ──
    note(tag + '— 3 · one window alone at 1240 px');
    let wideHost = null;
    {
      const s = await scene({ chain: false, width: 1240, n: 1 });
      wideHost = s.host;
      const rows = await measure(s.host);
      note('    ' + brief(rows));
      await shot(shotTag + '3-single-1240', s.host);
      ok(rows.length === 1 && rows[0].mode === 'full', `the chip is full (${rows[0]?.mode})`);
      ok(rows[0]?.drawn === FULL_WORDS, `…drawing "${FULL_WORDS}" (${S(rows[0]?.drawn)})`);
      ok(rows[0]?.vis.whole === true, `…and the whole title shows (${rows[0]?.vis.n}/${rows[0]?.vis.of})`);
    }

    // ── 4 · the standalone title bar, narrow ──
    note(tag + '— 4 · the same window at 340 px');
    {
      await ev(`wm.windows.get(${S(wideHost)}).element.style.width = '340px'; return true;`);
      await sleep(500);
      const rows = await measure(wideHost);
      note('    ' + brief(rows));
      await shot(shotTag + '4-single-340', wideHost);
      ok(rows[0]?.mode !== 'full' && rows[0]?.vis.n >= 6, `the standalone title bar yields too: ${rows[0]?.mode}, ${rows[0]?.vis.n} characters of the title`, S(rows));
    }

    // ── 5 · a member switch re-decides with the new words ──
    note(tag + '— 5 · the pool moves the session to another member');
    {
      await ev(`wm.windows.get(${S(wideHost)}).element.style.width = '1240px'; window.__tcFix.pool = { source: 'pooled', name: '全部', poolTarget: 'Northwind Enterprise Max' }; wm.setAuthBadge(${S(wideHost)}, window.__tcFix.pool); return true;`);
      await sleep(500);
      let rows = await measure(wideHost);
      ok(rows[0]?.mode === 'full' && rows[0]?.drawn.startsWith('全部 → Northwind') && rows[0]?.tip.startsWith('全部 → Northwind Enterprise Max'), `wide: the new words, full (${S(rows[0]?.drawn)})`);
      await ev(`wm.windows.get(${S(wideHost)}).element.style.width = '400px'; return true;`);
      await sleep(500);
      rows = await measure(wideHost);
      note('    ' + brief(rows));
      ok(rows[0]?.mode !== 'full' && (rows[0]?.mode === 'icon' || rows[0]?.drawn === 'Northwi…') && rows[0]?.vis.n >= 6, `narrow: the new member's short name ("Northwi…") or the icon, the title ≥ 6 characters (${rows[0]?.mode} ${S(rows[0]?.drawn)}, ${rows[0]?.vis.n})`);
      await ev(`window.__tcFix.pool = ${S(POOL)}; return true;`);
    }
  } finally {
    if (reg?.result?.identifier) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: reg.result.identifier });
  }
  }
  if (hasDejaVu) { if (!okBase(await boot(), 'the app re-booted on this box\'s own face for the control')) return; await sleep(1200); }

  // ── 6 · NEGATIVE CONTROL ──
  note('— 6 · NEGATIVE CONTROL: the rule patched to always answer "full"');
  {
    const src = fs.readFileSync(path.join(wt, 'src/lib/title-chips.js'), 'utf8');
    const head = 'export function chipMode({ availablePx, titlePx, chipFullPx, chipCompactPx, titleMinPx } = {}) {';
    ok(src.split(head).length === 2, 'the rule\'s entry line is spelled once (the control patches exactly it)');
    const mut = MUT.write(path.join(repo, 'src/lib/title-chips.js'), src.replace(head, head + " return 'full'; // NEGATIVE CONTROL: the pre-fix chip"), 'always-full', { esm: true });
    await bundle(mut);
    if (!ok(await boot(), 'the control bundle booted')) return;
    await sleep(1200);
    const s = await scene({ chain: true, width: 640 });
    const rows = await measure(s.host);
    note('    ' + brief(rows));
    await shot('6-control-chain-640', s.host);
    ok(rows.length === 3 && rows.every((r) => r.mode === 'full' && r.drawn === FULL_WORDS), 'CONTROL: every chip draws every word', S(rows.map((r) => [r.mode, r.drawn])));
    ok(rows.every((r) => r.vis.n <= 3), `CONTROL: …and every tab's title shrinks to ≤ 3 characters (${rows.map((r) => r.vis.n).join(', ')} — the owner's "V..")`, S(rows.map((r) => r.vis)));
    await bundle(null); // the worktree's bundle back to the real one (nothing reads it after this)
  }
  } finally {
    try { P?.close(); } catch { }
    try { chrome?.kill('SIGKILL'); } catch { }
    await killSessions();
    try { ws.close(); } catch { }
  }
})();

console.log('\ntree: the patched copy never touches the tree');
if (MUT.files.length) for (const r of copiesCensus(MUT.files, MUT.dir, repo, { minCopies: 1 })) ok(r.pass, 'tree: ' + r.name + (r.pass ? '' : ' — ' + r.detail));
console.log(`${fail ? `\n${fail} FAILED (${pass} passed${skipped ? `, ${skipped} skipped` : ''})` : `\nALL PASS (${pass}${skipped ? `, ${skipped} skipped` : ''})`}`);
cleanup();
process.exit(fail ? 1 : 0);
