#!/usr/bin/env node
// A WINDOW PER HOLDER, MEASURED (lane browser-windows U1, 2026-10-01 — the owner: "多agent可以同时用同一个profile，只是
// 每个agent开的是个独立窗口"; userW's D-payments was refused for the whole of a takeover of ANOTHER conversation's
// view). NOT a test-*.mjs, no tier (the measure-dialog-hold.mjs shape): the REAL keeper launches ONE profile browser
// (MODE=headless | hidden — the hidden window = headed Chrome on the CLI's own invisible Xvfb) in a scratch HOME under
// /tmp/vs-bwn-<pid> (never ~/.agent-browser), two lease sessions (A, B) drive it through the installed agent-browser,
// and a raw CDP browser socket + page sockets record what each side sees:
//
//   0. Chrome's own /json/protocol: Target.createTarget's parameters (can a tab be put into a GIVEN window?);
//   1. topology: how many daemon processes two leases on one profile run (the cooperative namespace AND two mediated
//      grants), and which window each lease's first tab lands in today;
//   2. serialization: A runs `wait 5000`, B runs `get title` 500 ms later — B's latency (one daemon or two?);
//   3. windows: `Target.createTarget {newWindow:true}` → a second window; does B's session switch to that target by its
//      CDP id (`tab <targetId>`), what does B's `tab list` list, where does B's `tab new` land (and `window new`), where
//      does a raw `createTarget {newWindow:false}` land after the second window was activated;
//   4. frames per window state: Page.startScreencast frames in 3 s + document.visibilityState + rAF ticks for: A's tab
//      (window 1, active), B's first tab (window 1, background), W2 (window 2, active), the same with window 2
//      MINIMIZED and window 1 placed UNDER window 2; Page.captureScreenshot's time on a background tab; the daemon's
//      own stream server (session B) — frames in 3 s while B's active tab is in window 2;
//   5. activateTarget across windows: visibility of every tab before / after activating window 2's tab and after
//      activating window 1's background tab (raises a window? hides the other window's tab?).
//
// `WT=<checkout> MODE=headless|hidden node scripts/measure-browser-windows.mjs [out.json]`; zero vendor calls; the
// scratch root, the daemons and the Chrome it started are ended on exit (by this run's own root, never a name).
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFile, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, freePort, endRootedProcesses } from './scratch.mjs';
const require = createRequire(import.meta.url);
const WT = process.env.WT || new URL('..', import.meta.url).pathname;
const Kk = require(path.join(WT, 'src/server/browser-keeper.js'));
const Ff = require(path.join(WT, 'src/browser-facts.js'));
const Ss = require(path.join(WT, 'src/browser-stream.js'));
const MED = require(path.join(WT, 'src/server/cdp-mediator.js'));
const { WebSocket } = require(path.join(WT, 'node_modules/ws'));
const OUT = process.argv[2] || null;
const MODE = process.env.MODE === 'hidden' ? 'hidden' : 'headless';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('AGENT_BROWSER_')));
// the CLI itself, past the VibeSpace shim (data/bin first on a session's PATH) — the product's own resolver
{
  const real = (() => { try { return Ff.binaryResolver('agent-browser', process.env)(); } catch { return null; } })();
  if (real) BASE_ENV.PATH = `${path.dirname(real)}:${BASE_ENV.PATH || ''}`;
}

const ROOT = scratch('bwn');
fs.rmSync(ROOT, { recursive: true, force: true });
const KH = path.join(ROOT, 'h'), KXD = path.join(ROOT, 'x');
for (const d of [path.join(KH, '.agent-browser'), KXD]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
const kenv = { ...BASE_ENV, HOME: KH, XDG_RUNTIME_DIR: KXD };
if (MODE === 'hidden') { delete kenv.DISPLAY; delete kenv.WAYLAND_DISPLAY; }
let cleaned = false;
let mediator = null;
function cleanup() {
  if (cleaned) return; cleaned = true;
  try { mediator && mediator.shutdown(); } catch { /* none */ }
  try { endRootedProcesses(ROOT); } catch { /* none */ }
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { /* next run */ }
}
process.on('exit', cleanup);
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { cleanup(); process.exit(130); });

let ver = null; try { ver = execFileSync('agent-browser', ['--version'], { encoding: 'utf8', timeout: 8000, env: BASE_ENV }).trim(); } catch { /* none */ }
if (!ver || /driven by VibeSpace/.test(ver)) { console.log('SKIP: agent-browser is not runnable here'); process.exit(0); }
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
let chromeVer = null; try { chromeVer = CHROME ? execFileSync(CHROME, ['--version'], { encoding: 'utf8', timeout: 8000 }).trim() : null; } catch { /* none */ }
console.log(`agent-browser ${ver}; ${chromeVer || '(no chrome on PATH)'}; mode ${MODE}; root ${ROOT}`);

// ── the pages (loopback): an animated page that counts its own rAF ticks ──
const PORT = await freePort();
const ANIM = (tag) => `<!doctype html><title>ANIM-${tag}</title><style>#b{width:60px;height:60px;background:#c33;position:absolute;animation:m 1s linear infinite}@keyframes m{from{left:0}to{left:300px}}</style><div id=b></div><p id=n>0</p>
<script>window.__raf=0;(function f(){window.__raf++;requestAnimationFrame(f)})();</script>`;
const srv = http.createServer((req, res) => {
  res.setHeader('content-type', 'text/html; charset=utf-8');
  const m = /^\/anim\?(\w+)/.exec(req.url || '');
  return res.end(ANIM(m ? m[1] : 'x'));
}).listen(PORT, '127.0.0.1');
const U = (tag) => `http://127.0.0.1:${PORT}/anim?${tag}`;

const quiet = { log() { }, warn() { }, error() { } };
const KA = 'bk-0000a1a1', KB = 'bk-0000b2b2', KC = 'bk-0000c3c3', KD = 'bk-0000d4d4';
mediator = MED.create({ log: quiet });
await mediator.listen();
const setting = (k) => (MODE === 'hidden' && k === 'browser.headed' ? 'yes' : undefined);
const kk = Kk.create({ dataDir: path.join(ROOT, 'data'), homeDir: KH, env: () => kenv, serverSetting: setting, liveKeys: () => new Set([KA, KB, KC, KD]), runtime: Ff.createBrowserRuntime({ env: kenv }), facts: Ff.createBrowserFacts({ env: kenv }), log: quiet, install: false, mediator });
const report = { measured: new Date().toISOString(), agentBrowser: ver, chrome: chromeVer, mode: MODE, steps: {} };
const cfg = kk.configFileFor({ ephemeral: false });
function run(pairs, args, { timeout = 90000 } = {}) {
  const t0 = Date.now();
  return new Promise((resolve) => execFile('agent-browser', args, { env: { ...kenv, ...Ss.pairsToEnv(pairs), AGENT_BROWSER_CONFIG: cfg }, encoding: 'utf8', timeout }, (err, so, se) => resolve({ ok: !err, code: err ? (err.code ?? err.signal) : 0, ms: Date.now() - t0, out: (String(so || '') + String(se || '')).trim() })));
}
const getJson = (url) => new Promise((resolve) => http.get(url, (res) => { let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve(null); } }); }).on('error', () => resolve(null)));
/** a raw CDP socket (browser or page endpoint) */
function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl, { perMessageDeflate: false, maxPayload: 64 * 1024 * 1024 });
  let id = 0; const waiting = new Map(); const handlers = [];
  ws.on('message', (d) => {
    let m; try { m = JSON.parse(String(d)); } catch { return; }
    if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); return; }
    for (const h of handlers) { try { h(m); } catch { /* none */ } }
  });
  const call = (method, params = {}, sessionId = null, ms = 8000) => new Promise((resolve) => { const i = ++id; waiting.set(i, resolve); ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) })); setTimeout(() => { if (waiting.has(i)) { waiting.delete(i); resolve({ timeout: true }); } }, ms); });
  const opened = new Promise((resolve) => { ws.once('open', () => resolve(true)); ws.once('error', () => resolve(false)); });
  return { ws, call, opened, on: (h) => handlers.push(h), close: () => { try { ws.close(); } catch { /* */ } } };
}
const P = (s) => String(s || '').replace(new RegExp(String(PORT), 'g'), '<P>');
const daemonsOf = (key) => fs.readdirSync('/proc').filter((x) => /^\d+$/.test(x)).map(Number).filter((pid) => { try { const env = fs.readFileSync(`/proc/${pid}/environ`, 'utf8'); return env.includes(`AGENT_BROWSER_SESSION=vs-${key}\0`) && env.includes(`HOME=${KH}`) && /agent-browser/.test(fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8')) && !/\0(open|get|wait|tab|window|stream)\0/.test(fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8')); } catch { return false; } });
const tabsJson = (out) => { try { const j = JSON.parse(String(out).trim().split('\n').pop()); return (j.data && (j.data.tabs || j.data)) || j; } catch { return null; } };

try {
  // ── 0. the protocol ──
  const prof = kk.createProfile({ label: 'Windows' }, { owner: { kind: 'instance', id: null } });
  const ax = await kk.attach({ profileId: prof.id, browserKey: KA, sessionId: 'sess-a' });
  const bx = await kk.attach({ profileId: prof.id, browserKey: KB, sessionId: 'sess-b' });
  const pin = ax.pinTab ? ['--pin-tab'] : [];
  const rec = kk.browserOf(prof.id);
  const cdpHttp = String(rec.cdpUrl).replace(/^ws/, 'http').replace(/\/devtools\/browser\/.*$/, '');
  const proto = await getJson(cdpHttp + '/json/protocol');
  const cmd = (d, m) => { const dd = proto && proto.domains.find((x) => x.domain === d); const c = dd && dd.commands.find((x) => x.name === m); return c ? (c.parameters || []).map((x) => x.name + (x.optional ? '?' : '')) : null; };
  report.steps.protocol = { 'Target.createTarget': cmd('Target', 'createTarget'), 'Target.activateTarget': cmd('Target', 'activateTarget'), 'Browser.getWindowForTarget': cmd('Browser', 'getWindowForTarget'), 'Browser.setWindowBounds': cmd('Browser', 'setWindowBounds'), 'Browser.setContentsSize': cmd('Browser', 'setContentsSize') };
  console.log('protocol', JSON.stringify(report.steps.protocol));
  const bver = await getJson(cdpHttp + '/json/version');
  const bs = cdp(bver.webSocketDebuggerUrl); await bs.opened;
  const winOf = async (targetId) => { const r = await bs.call('Browser.getWindowForTarget', { targetId }); return r.result ? { windowId: r.result.windowId, state: r.result.bounds && r.result.bounds.windowState, bounds: r.result.bounds } : { error: r.error ? r.error.message : 'timeout' }; };

  // ── 1. topology ──
  const S1 = {};
  const oa = await run(ax.env, [...pin, 'open', U('a')]);
  const ob = await run(bx.env, [...pin, 'open', U('b')]);
  S1.open = { a: { ok: oa.ok, ms: oa.ms }, b: { ok: ob.ok, ms: ob.ms, out: ob.ok ? '' : P(ob.out).slice(0, 300) } };
  await sleep(500);
  S1.daemons = { a: daemonsOf(KA).length, b: daemonsOf(KB).length, aPids: daemonsOf(KA), bPids: daemonsOf(KB) };
  S1.namespaces = { a: (ax.env.find((x) => /NAMESPACE/.test(x)) || '').replace(/^.*=/, ''), b: (bx.env.find((x) => /NAMESPACE/.test(x)) || '').replace(/^.*=/, '') };
  const list1 = (await getJson(cdpHttp + '/json/list')) || [];
  const tA = list1.find((t) => t.type === 'page' && /anim\?a/.test(t.url)), tB = list1.find((t) => t.type === 'page' && /anim\?b/.test(t.url));
  S1.pages = list1.filter((t) => t.type === 'page').map((t) => ({ id: t.id.slice(0, 8), url: P(t.url) }));
  S1.windowOfA = tA ? await winOf(tA.id) : null; S1.windowOfB = tB ? await winOf(tB.id) : null;
  S1.sameWindowToday = !!(S1.windowOfA && S1.windowOfB && S1.windowOfA.windowId === S1.windowOfB.windowId);
  report.steps.topology = S1; console.log('1 topology', JSON.stringify(S1));

  // ── 2. serialization (cooperative: one namespace) ──
  const ser = async (ex, ey) => {
    const w = run(ex, [...pin, 'wait', '5000']);
    await sleep(500);
    const g = await run(ey, [...pin, 'get', 'title']);
    const ww = await w;
    return { waitMs: ww.ms, otherGetTitleMs: g.ms, otherOk: g.ok };
  };
  report.steps.serialization = { cooperativeOtherSession: await ser(ax.env, bx.env), cooperativeSameSession: await ser(ax.env, ax.env) };
  // the mediated twin: two grants on a sharing:instance profile
  const mprof = kk.createProfile({ label: 'Mediated', sharing: 'instance' }, { owner: { kind: 'instance', id: null } });
  const mc = await kk.attach({ profileId: mprof.id, browserKey: KC, sessionId: 'sess-c' });
  const md = await kk.attach({ profileId: mprof.id, browserKey: KD, sessionId: 'sess-d' });
  await run(mc.env, [...pin, 'open', U('c')]); await run(md.env, [...pin, 'open', U('d')]);
  report.steps.serialization.mediatedOtherSession = await ser(mc.env, md.env);
  report.steps.serialization.mediatedDaemons = { c: daemonsOf(KC).length, d: daemonsOf(KD).length };
  console.log('2 serialization', JSON.stringify(report.steps.serialization));

  // ── 3. windows ──
  const S3 = {};
  const cw = await bs.call('Target.createTarget', { url: U('w2'), newWindow: true });
  const W2 = cw.result && cw.result.targetId;
  S3.createNewWindow = W2 ? { ok: true, window: await winOf(W2) } : { ok: false, error: cw.error ? cw.error.message : 'timeout' };
  S3.windowOfA = tA ? await winOf(tA.id) : null;
  await sleep(800);
  // B's session switches to W2 by its CDP target id
  const sw = await run(bx.env, [...pin, 'tab', W2]);
  S3.bSwitchToW2 = { ok: sw.ok, ms: sw.ms, out: P(sw.out).slice(0, 300) };
  const gu = await run(bx.env, [...pin, 'get', 'url']);
  S3.bGetUrlAfterSwitch = P(gu.out).slice(0, 120);
  const bl = await run(bx.env, [...pin, '--json', 'tab', 'list']);
  const bt = tabsJson(bl.out);
  S3.bTabList = Array.isArray(bt) ? bt.map((t) => ({ url: P(t.url), active: !!t.active, targetId: String(t.targetId || '').slice(0, 8) })) : P(bl.out).slice(0, 600);
  const al = await run(ax.env, [...pin, '--json', 'tab', 'list']);
  const at = tabsJson(al.out);
  S3.aTabList = Array.isArray(at) ? at.map((t) => ({ url: P(t.url), active: !!t.active, targetId: String(t.targetId || '').slice(0, 8) })) : P(al.out).slice(0, 600);
  // B's `tab new` while its active tab is W2
  const bn = await run(bx.env, [...pin, '--json', 'tab', 'new', U('b2')]);
  await sleep(500);
  const list3 = (await getJson(cdpHttp + '/json/list')) || [];
  const tB2 = list3.find((t) => t.type === 'page' && /anim\?b2/.test(t.url));
  S3.bTabNewWhileOnW2 = { ok: bn.ok, window: tB2 ? await winOf(tB2.id) : null, out: bn.ok ? '' : P(bn.out).slice(0, 300) };
  // a raw createTarget {newWindow:false} after W2 was activated
  await bs.call('Target.activateTarget', { targetId: W2 });
  await sleep(300);
  const cr = await bs.call('Target.createTarget', { url: U('raw') });
  S3.rawCreateAfterActivateW2 = cr.result ? { window: await winOf(cr.result.targetId) } : { error: cr.error ? cr.error.message : 'timeout' };
  // ...and after window 1's tab was activated
  if (tA) { await bs.call('Target.activateTarget', { targetId: tA.id }); await sleep(300); }
  const cr2 = await bs.call('Target.createTarget', { url: U('raw2') });
  S3.rawCreateAfterActivateW1 = cr2.result ? { window: await winOf(cr2.result.targetId) } : { error: cr2.error ? cr2.error.message : 'timeout' };
  // session A (its active tab in window 1) runs `tab new` now that window 2 exists — which window?
  const an = await run(ax.env, [...pin, '--json', 'tab', 'new', U('a2')]);
  await sleep(500);
  const list3a = (await getJson(cdpHttp + '/json/list')) || [];
  const tA2 = list3a.find((t) => t.type === 'page' && /anim\?a2/.test(t.url));
  S3.aTabNewFromWin1 = { ok: an.ok, window: tA2 ? (await winOf(tA2.id)).windowId : null, windowOfAFirstTab: tA ? (await winOf(tA.id)).windowId : null };
  if (tA) await run(ax.env, [...pin, 'tab', tA.id]); // A back on its first tab
  // the CLI's own `window new` (session A)
  const wn = await run(ax.env, [...pin, '--json', 'window', 'new']);
  await sleep(500);
  const list3b = (await getJson(cdpHttp + '/json/list')) || [];
  const fresh = list3b.filter((t) => t.type === 'page' && !list3.some((u) => u.id === t.id) && !(cr.result && t.id === cr.result.targetId) && !(cr2.result && t.id === cr2.result.targetId));
  S3.aWindowNew = { ok: wn.ok, ms: wn.ms, out: P(wn.out).slice(0, 400), newPages: await Promise.all(fresh.map(async (t) => ({ url: P(t.url), window: await winOf(t.id) }))) };
  const agu = await run(ax.env, [...pin, 'get', 'url']);
  S3.aGetUrlAfterWindowNew = P(agu.out).slice(0, 120);
  report.steps.windows = S3; console.log('3 windows', JSON.stringify(S3, null, 1));

  // ── 4. frames per window state ──
  async function frames(targetId, ms = 3000) {
    const pg = cdp(`${cdpHttp.replace(/^http/, 'ws')}/devtools/page/${targetId}`); await pg.opened;
    let n = 0;
    pg.on((m) => { if (m.method === 'Page.screencastFrame') { n++; pg.ws.send(JSON.stringify({ id: 900000 + n, method: 'Page.screencastFrameAck', params: { sessionId: m.params.sessionId } })); } });
    const vis0 = await pg.call('Runtime.evaluate', { expression: 'JSON.stringify([document.visibilityState, document.hasFocus(), window.__raf])', returnByValue: true });
    await pg.call('Page.enable');
    await pg.call('Page.startScreencast', { format: 'jpeg', quality: 40, maxWidth: 400, maxHeight: 300, everyNthFrame: 1 });
    await sleep(ms);
    await pg.call('Page.stopScreencast');
    const vis1 = await pg.call('Runtime.evaluate', { expression: 'JSON.stringify([document.visibilityState, document.hasFocus(), window.__raf])', returnByValue: true });
    const t0 = Date.now(); const shot = await pg.call('Page.captureScreenshot', { format: 'jpeg', quality: 40 }, null, 10000); const shotMs = Date.now() - t0;
    pg.close();
    const v0 = (() => { try { return JSON.parse(vis0.result.result.value); } catch { return null; } })(); const v1 = (() => { try { return JSON.parse(vis1.result.result.value); } catch { return null; } })();
    return { fps: +(n / (ms / 1000)).toFixed(1), visibility: v1 ? v1[0] : null, focus: v1 ? v1[1] : null, rafPerSec: v0 && v1 ? Math.round((v1[2] - v0[2]) / (ms / 1000 + 0.2)) : null, screenshot: shot.result ? { ms: shotMs, bytes: String(shot.result.data || '').length } : { error: shot.timeout ? 'timeout' : (shot.error && shot.error.message) } };
  }
  const S4 = {};
  // THE SHARED-WINDOW SHAPE, made deterministically whatever the keeper does: a tab A's PAGE opens lands in A's window
  // (measured, both modes) and takes the show — A is then a BACKGROUND tab of its window (the class of userW's two incidents)
  async function openFromPage(tid, tag) {
    const before = new Set((((await getJson(cdpHttp + '/json/list')) || [])).map((t) => t.id));
    const pg = cdp(`${cdpHttp.replace(/^http/, 'ws')}/devtools/page/${tid}`); await pg.opened;
    await pg.call('Runtime.evaluate', { expression: `window.open(${JSON.stringify(U(tag))}, '_blank'); 1`, userGesture: true, returnByValue: true });
    pg.close(); await sleep(800);
    return (((await getJson(cdpHttp + '/json/list')) || [])).find((t) => t.type === 'page' && !before.has(t.id) && t.url.includes('anim?' + tag)) || null;
  }
  if (tA) await bs.call('Target.activateTarget', { targetId: tA.id });
  if (W2) await bs.call('Target.activateTarget', { targetId: W2 });
  await sleep(500);
  if (tA) S4.win1Active_A = { window: (await winOf(tA.id)).windowId, ...(await frames(tA.id)) };
  if (tB) S4.conversationB_firstTab = { window: (await winOf(tB.id)).windowId, sameWindowAsA: tA ? (await winOf(tB.id)).windowId === (await winOf(tA.id)).windowId : null, ...(await frames(tB.id)) };
  const tF = tA ? await openFromPage(tA.id, 'f') : null;
  if (tF) S4.sharedWindowBackground_A = { fWindowIsAs: (await winOf(tF.id)).windowId === (await winOf(tA.id)).windowId, ...(await frames(tA.id)) };
  if (tA) await bs.call('Target.activateTarget', { targetId: tA.id });
  if (W2) S4.win2Active_W2 = { window: (await winOf(W2)).windowId, ...(await frames(W2)) };
  // window 2 minimized
  const w2 = W2 ? await winOf(W2) : null;
  if (w2 && w2.windowId) {
    const mn = await bs.call('Browser.setWindowBounds', { windowId: w2.windowId, bounds: { windowState: 'minimized' } });
    await sleep(600);
    S4.win2Minimized_W2 = { set: mn.error ? mn.error.message : 'ok', state: (await winOf(W2)).state, ...(await frames(W2)) };
    await bs.call('Browser.setWindowBounds', { windowId: w2.windowId, bounds: { windowState: 'normal' } });
    await sleep(600);
    // window 1 placed exactly under window 2 (occluded) — then window 2 activated last
    const w1 = tA ? await winOf(tA.id) : null;
    if (w1 && w1.windowId) {
      await bs.call('Browser.setWindowBounds', { windowId: w1.windowId, bounds: { left: 0, top: 0, width: 900, height: 700 } });
      await bs.call('Browser.setWindowBounds', { windowId: w2.windowId, bounds: { left: 0, top: 0, width: 900, height: 700 } });
      await bs.call('Target.activateTarget', { targetId: W2 });
      await sleep(1500);
      S4.win1UnderWin2_A = { ...(await frames(tA.id)) };
      S4.win2OverWin1_W2 = { ...(await frames(W2)) };
    }
  }
  // the daemon's own stream server of session B (its active tab: W2 since `tab <W2>`… then its `tab new` b2)
  const sp = await kk.streamPortFor(Ss.streamTargetFor({ browserKey: KB, set: kk.setFor(KB), profiles: kk.list().profiles }));
  if (sp && sp.ok) {
    const recs = { frame: 0, tabs: null };
    const ws = new WebSocket(`ws://127.0.0.1:${sp.port}`, { headers: { Origin: Ss.originHeaderFor(sp.port) } });
    ws.on('message', (d) => { let m; try { m = JSON.parse(String(d)); } catch { return; } if (m.type === 'frame') recs.frame++; else if (m.type === 'tabs') recs.tabs = (m.tabs || []).map((t) => ({ url: P(t.url), active: !!t.active, targetId: String(t.targetId || '').slice(0, 8) })); });
    await new Promise((r) => ws.once('open', r));
    await sleep(3500);
    ws.close();
    S4.daemonStreamB = { fps: +(recs.frame / 3.5).toFixed(1), tabs: recs.tabs };
  } else S4.daemonStreamB = { error: sp ? sp.error || sp.code : 'no port' };
  // does a command of a session whose tab is HIDDEN (another tab of its window activated) bring that tab to the front?
  if (tA && tB) {
    await run(ax.env, [...pin, 'tab', tA.id]);
    await bs.call('Target.activateTarget', { targetId: (tF || tB).id }); await sleep(400); // A goes behind F in its own window
    const v0 = await (async () => { const pg = cdp(`${cdpHttp.replace(/^http/, 'ws')}/devtools/page/${tA.id}`); await pg.opened; const r = await pg.call('Runtime.evaluate', { expression: 'document.visibilityState', returnByValue: true }); pg.close(); return r.result ? r.result.result.value : null; })();
    const g1 = await run(ax.env, [...pin, 'get', 'title']);
    const v1 = await (async () => { const pg = cdp(`${cdpHttp.replace(/^http/, 'ws')}/devtools/page/${tA.id}`); await pg.opened; const r = await pg.call('Runtime.evaluate', { expression: 'document.visibilityState', returnByValue: true }); pg.close(); return r.result ? r.result.result.value : null; })();
    const c1 = await run(ax.env, [...pin, 'click', '#b']);
    const v2 = await (async () => { const pg = cdp(`${cdpHttp.replace(/^http/, 'ws')}/devtools/page/${tA.id}`); await pg.opened; const r = await pg.call('Runtime.evaluate', { expression: 'document.visibilityState', returnByValue: true }); pg.close(); return r.result ? r.result.result.value : null; })();
    S4.hiddenTabCommand = { before: v0, afterGetTitle: v1, getTitleOk: g1.ok, afterClick: v2, clickOk: c1.ok, clickMs: c1.ms };
    // is a hidden tab's screenshot FRESH? change the page while hidden, compare two png captures
    const pg = cdp(`${cdpHttp.replace(/^http/, 'ws')}/devtools/page/${tA.id}`); await pg.opened;
    const s0 = await pg.call('Page.captureScreenshot', { format: 'png' }, null, 10000);
    await pg.call('Runtime.evaluate', { expression: "document.getElementById('b').remove(); document.body.style.background = 'rgb(0,160,0)'; 1", returnByValue: true });
    await sleep(300);
    const t0 = Date.now(); const s1 = await pg.call('Page.captureScreenshot', { format: 'png' }, null, 10000); const ms1 = Date.now() - t0;
    const vis = await pg.call('Runtime.evaluate', { expression: 'document.visibilityState', returnByValue: true });
    pg.close();
    const crypto = await import('node:crypto');
    const h = (r) => (r && r.result && r.result.data ? crypto.createHash('sha1').update(r.result.data).digest('hex').slice(0, 10) : null);
    S4.hiddenTabScreenshotFresh = { visibility: vis.result ? vis.result.result.value : null, before: h(s0), after: h(s1), changed: !!(h(s0) && h(s1) && h(s0) !== h(s1)), ms: ms1 };
  }
  report.steps.frames = S4; console.log('4 frames', JSON.stringify(S4, null, 1));

  // ── 5. activateTarget across windows ──
  const S5 = {};
  const visOf = async (tid) => { const pg = cdp(`${cdpHttp.replace(/^http/, 'ws')}/devtools/page/${tid}`); await pg.opened; const r = await pg.call('Runtime.evaluate', { expression: 'document.visibilityState', returnByValue: true }); pg.close(); return r.result ? r.result.result.value : null; };
  const snap = async () => ({ A: tA ? await visOf(tA.id) : null, F: tF ? await visOf(tF.id) : null, W2: W2 ? await visOf(W2) : null, W2state: W2 ? (await winOf(W2)).state : null });
  if (tA) { await bs.call('Target.activateTarget', { targetId: tA.id }); await sleep(400); } // window 1 shows A again (the step-4 probe left B on show)
  S5.before = await snap();
  if (W2) { await bs.call('Target.activateTarget', { targetId: W2 }); await sleep(500); S5.afterActivateW2 = await snap(); }
  if (tF) { await bs.call('Target.activateTarget', { targetId: tF.id }); await sleep(500); S5.afterActivateFInAsWindow = await snap(); }
  report.steps.activate = S5; console.log('5 activate', JSON.stringify(S5));

  // ── 6. placement: where does a NEW tab land — the session's own window, or Chrome's last active one? ──
  const S6 = {};
  const desc = (d, m) => { const dd = proto && proto.domains.find((x) => x.domain === d); const c = dd && dd.commands.find((x) => x.name === m); return c ? Object.fromEntries((c.parameters || []).filter((x) => /newWindow|background|forTab|hidden|focus/.test(x.name)).map((x) => [x.name, String(x.description || '').slice(0, 220)])) : null; };
  S6.createTargetParams = desc('Target', 'createTarget');
  const W3r = await bs.call('Target.createTarget', { url: U('w3'), newWindow: true }); const W3 = W3r.result && W3r.result.targetId;
  await sleep(500);
  const landing = async (label, fn) => { const before = new Set(((await getJson(cdpHttp + '/json/list')) || []).map((t) => t.id)); await fn(); await sleep(500); const after = ((await getJson(cdpHttp + '/json/list')) || []).filter((t) => t.type === 'page' && !before.has(t.id)); S6[label] = await Promise.all(after.map(async (t) => (await winOf(t.id)).windowId)); };
  const wid = { win1: tA ? (await winOf(tA.id)).windowId : null, win2: W2 ? (await winOf(W2)).windowId : null, win3: W3 ? (await winOf(W3)).windowId : null };
  S6.windows = wid;
  // B is bound to a tab of window 2 (b2); A to tA in window 1; window 3 was created last
  await landing('aTabNewAfterW3Created', () => run(ax.env, [...pin, 'tab', 'new', U('p1')]));
  if (tA) await run(ax.env, [...pin, 'tab', tA.id]);
  await bs.call('Target.activateTarget', { targetId: W2 }); await sleep(300);
  await landing('aTabNewAfterActivateW2', () => run(ax.env, [...pin, 'tab', 'new', U('p2')]));
  if (tA) await run(ax.env, [...pin, 'tab', tA.id]);
  await landing('bTabNewAfterActivateW2', () => run(bx.env, [...pin, 'tab', 'new', U('p3')]));
  await landing('rawCreateNoWindow', () => bs.call('Target.createTarget', { url: U('p4') }));
  await landing('rawCreateBackground', () => bs.call('Target.createTarget', { url: U('p5'), background: true }));
  // a window created with focus:false / background:true — which one does the NEXT plain create land in?
  const W4r = await bs.call('Target.createTarget', { url: U('w4'), newWindow: true, focus: false }); const W4 = W4r.result && W4r.result.targetId;
  S6.windowFocusFalse = W4 ? { ok: true, windowId: (await winOf(W4)).windowId } : { error: W4r.error ? W4r.error.message : 'timeout' };
  await landing('rawCreateAfterFocusFalseWindow', () => bs.call('Target.createTarget', { url: U('p6') }));
  if (W4) S6.windowFocusFalseFrames = await frames(W4, 2000);
  // Page.bringToFront on window 1's tab: does the NEXT plain create follow it (both modes)?
  if (tA) {
    const pg = cdp(`${cdpHttp.replace(/^http/, 'ws')}/devtools/page/${tA.id}`); await pg.opened;
    const bf = await pg.call('Page.bringToFront');
    S6.bringToFrontAnswer = bf.error ? bf.error.message : (bf.timeout ? 'timeout' : 'ok');
    pg.close(); await sleep(300);
    await landing('rawCreateAfterBringToFrontW1', () => bs.call('Target.createTarget', { url: U('p8') }));
  }
  // window.open from a page of window 3 (a page-opened tab: same window?)
  if (W3) {
    const pg = cdp(`${cdpHttp.replace(/^http/, 'ws')}/devtools/page/${W3}`); await pg.opened;
    await landing('windowOpenFromW3', () => pg.call('Runtime.evaluate', { expression: `window.open(${JSON.stringify(U('p7'))}, '_blank'); 1`, userGesture: true, returnByValue: true }));
    pg.close();
  }
  // the visible-tab click baseline (the hidden one took longer?)
  if (W2) { await run(bx.env, [...pin, 'tab', W2]); await bs.call('Target.activateTarget', { targetId: W2 }); await sleep(300); const c = await run(bx.env, [...pin, 'click', '#b']); S6.visibleTabClickMs = c.ms; }
  report.steps.placement = S6; console.log('6 placement', JSON.stringify(S6, null, 1));

  // ── 7. U0b (userW's inc-muqdohf0-hkjc): input + frames on a BACKGROUND tab vs a non-focused window's FOREGROUND tab ──
  // what the live view's user meets: a CDP mouse press/release (the stream server's own shape) — answered, and does the
  // page see it — on (a) a background tab of a window, (b) the foreground tab of a window that does NOT have the focus
  const S7 = {};
  const clickProbe = async (tid) => {
    const pg = cdp(`${cdpHttp.replace(/^http/, 'ws')}/devtools/page/${tid}`); await pg.opened;
    await pg.call('Runtime.evaluate', { expression: "window.__clicks = 0; document.addEventListener('mousedown', () => { window.__clicks++; }, true); 1", returnByValue: true });
    const t0 = Date.now();
    const d = await pg.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: 30, y: 30, button: 'left', clickCount: 1 }, null, 4000);
    const u = await pg.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 30, y: 30, button: 'left', clickCount: 1 }, null, 4000);
    const ms = Date.now() - t0;
    const c = await pg.call('Runtime.evaluate', { expression: 'JSON.stringify([window.__clicks, document.visibilityState, document.hasFocus()])', returnByValue: true });
    pg.close();
    let v = null; try { v = JSON.parse(c.result.result.value); } catch { v = null; }
    return { pressAnswered: !d.timeout, releaseAnswered: !u.timeout, ms, pageSawClicks: v ? v[0] : null, visibility: v ? v[1] : null, hasFocus: v ? v[2] : null };
  };
  // fresh animated pages (step 4 left A's page static): G1 in a window of its own, G2 opened by G1's page (G1's window — G1
  // now in the background), then G3 in a new FOCUSED window (G1/G2's window is no longer the focused one)
  const g1r = await bs.call('Target.createTarget', { url: U('g1'), newWindow: true }); const G1 = g1r.result && g1r.result.targetId; await sleep(600);
  const g2 = G1 ? await openFromPage(G1, 'g2') : null;
  const g3r = await bs.call('Target.createTarget', { url: U('g3'), newWindow: true }); await sleep(600);
  if (G1 && g2) {
    S7.sameWindow = (await winOf(G1)).windowId === (await winOf(g2.id)).windowId;
    S7.backgroundTab = { ...(await clickProbe(G1)), frames: await frames(G1, 2000) };
    S7.foregroundTabOfNonFocusedWindow = { ...(await clickProbe(g2.id)), frames: await frames(g2.id, 2000) };
  }
  if (W4) S7.focusFalseWindowTab = await clickProbe(W4);
  S7.g3created = !!(g3r.result && g3r.result.targetId);
  report.steps.input = S7; console.log('7 input', JSON.stringify(S7, null, 1));
  bs.close();
} catch (e) {
  report.error = String(e && e.stack || e);
  console.error(report.error);
}
srv.close();
if (OUT) fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
console.log('done');
process.exit(0);
