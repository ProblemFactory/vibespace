#!/usr/bin/env node
// A TAB THAT NEVER SETTLES, MEASURED (lane site-reset, 2026-09-30 — userW's pod: a bank's login page read "Log In | …"
// for a few seconds, then the app's own title, then EVERY verb timed out and screenshots failed; the plausible cause an
// expired login cookie: the login page sends a signed-in-looking visitor to the app, the app fails auth and sends it
// back). NOT a test-*.mjs, no tier (the measure-dialog-hold.mjs shape): the REAL keeper launches ONE headless profile
// browser in a scratch HOME (never ~/.agent-browser), a lease session drives it through the installed agent-browser, and
// a raw BROWSER-level CDP socket (the dialog watch's own shape: setDiscoverTargets + attachToTarget {flatten} +
// Page.enable) records every main-frame navigation event with its instant. LOCAL fixture pages only — never a vendor site:
//   bank  — /bank/login (title "Log In | Fixture Bank") with the stale cookie → JS to /bank/app after 400 ms; /bank/app
//           fetches /bank/api/me → 401 → location.replace('/bank/login?next=…#top') (the incident's plausible shape);
//   meta  — /two/a ↔ /two/b by <meta http-equiv=refresh content=0>;
//   reload — /reload reloads itself every 250 ms (one URL, N hops);
//   slow  — /slow answers after 3 s (a slow site: 2 hops at most — never a loop).
// For each: `open` (duration, exit, words), then on the looping tab: snapshot / get title / screenshot / eval / tab list /
// tab new / tab <ref> / tab close, the raw Page.stopLoading (and a snapshot after it), Target.closeTarget, and
// Page.captureScreenshot with no wait. `WT=<checkout> node scripts/measure-navigation-loop.mjs [out.json]`; zero vendor
// calls; the scratch root, the daemons and the Chrome it started are ended on exit (by this run's own root).
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
const { WebSocket } = require(path.join(WT, 'node_modules/ws'));
const OUT = process.argv[2] || null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('AGENT_BROWSER_') && !k.startsWith('VIBESPACE_')));

const ROOT = scratch('sreset');
fs.rmSync(ROOT, { recursive: true, force: true });
const KH = path.join(ROOT, 'h'), KXD = path.join(ROOT, 'x');
for (const d of [path.join(KH, '.agent-browser'), KXD]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
const kenv = { ...BASE_ENV, HOME: KH, XDG_RUNTIME_DIR: KXD };
let cleaned = false;
function cleanup() { if (cleaned) return; cleaned = true; try { endRootedProcesses(ROOT); } catch { /* none */ } try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { /* next run */ } }
process.on('exit', cleanup);
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { cleanup(); process.exit(130); });

const REAL_AB = (() => { try { return Ff.binaryResolver('agent-browser', BASE_ENV)(); } catch { return null; } })();
let ver = null; try { ver = REAL_AB ? execFileSync(REAL_AB, ['--version'], { encoding: 'utf8', timeout: 8000, env: BASE_ENV }).trim() : null; } catch { /* none */ }
if (!ver) { console.log('SKIP: agent-browser is not runnable here'); process.exit(0); }
console.log(`agent-browser ${REAL_AB} (${ver}); root ${ROOT}`);

// ── the pages (loopback) ──
const PORT = await freePort();
const html = (title, body = '') => `<!doctype html><title>${title}</title>${body}`;
const cookieOf = (req, k) => { const m = new RegExp(`(?:^|;\\s*)${k}=([^;]*)`).exec(String(req.headers.cookie || '')); return m ? m[1] : null; };
const hits = [];
const PEND_MS = Number(process.env.PEND_MS) || 300;
const srv = http.createServer((req, res) => {
  hits.push({ at: Date.now(), url: req.url });
  res.setHeader('content-type', 'text/html; charset=utf-8');
  const u = req.url;
  if (u.startsWith('/set-stale')) { res.setHeader('set-cookie', ['fx_sess=stale; Path=/; Max-Age=3600', 'fx_pref=1; Path=/bank; Max-Age=3600']); return res.end(html('Stale cookie set', '<script>localStorage.setItem("fx_token","expired");</script><p>set')); }
  if (u.startsWith('/bank/api/me')) { res.setHeader('content-type', 'application/json'); res.statusCode = cookieOf(req, 'fx_sess') === 'stale' ? 401 : 200; return res.end(res.statusCode === 401 ? '{"error":"expired"}' : '{"user":null}'); }
  if (u.startsWith('/bank/login')) return res.end(html('Log In | Fixture Bank', `<form><input id=u name=u><input id=p type=password></form><script>if (document.cookie.includes('fx_sess=stale')) setTimeout(() => { location.href = '/bank/app'; }, 400);</script>`));
  if (u.startsWith('/bank/app')) return res.end(html('Fixture Bank — Dashboard', `<p>loading…<script>fetch('/bank/api/me').then((r) => { if (r.status === 401) location.replace('/bank/login?next=%2Fbank%2Fapp&t=' + Date.now() + '#top'); });</script>`));
  if (u.startsWith('/two/a')) return res.end(html('Two A', '<meta http-equiv=refresh content="0;url=/two/b"><p>a'));
  if (u.startsWith('/two/b')) return res.end(html('Two B', '<meta http-equiv=refresh content="0;url=/two/a"><p>b'));
  if (u.startsWith('/reload')) return res.end(html('Reloading', '<script>setTimeout(() => location.reload(), 250);</script><p>r'));
  // the SLOW loop: every page answers after 1.2 s and moves on at once — the tab is almost always mid-navigation
  if (u.startsWith('/sb/api/me')) { res.setHeader('content-type', 'application/json'); res.statusCode = cookieOf(req, 'fx_sess') === 'stale' ? 401 : 200; return res.end('{}'); }
  if (u.startsWith('/sb/login')) { setTimeout(() => res.end(html('Log In | Slow Bank', `<form><input id=u></form><script>if (document.cookie.includes('fx_sess=stale')) location.href = '/sb/app';</script>`)), 1200); return; }
  if (u.startsWith('/sb/app')) { setTimeout(() => res.end(html('Slow Bank — Dashboard', `<script>fetch('/sb/api/me').then((r) => { if (r.status === 401) location.replace('/sb/login?next=%2Fsb%2Fapp'); });</script>`)), 1200); return; }
  // THE ALWAYS-PENDING loop (the incident's plausible shape): every page answers after PEND_MS and its INLINE script moves on
  // before its load event — the tab is never settled, so a verb that waits for load never answers
  if (u.startsWith('/pd/login')) { const stale = cookieOf(req, 'fx_sess') === 'stale'; setTimeout(() => res.end(html('Log In | Pending Bank', `<form><input id=u></form>${stale ? `<script>location.replace('/pd/app');</script>` : ''}`)), PEND_MS); return; }
  if (u.startsWith('/pd/app')) { if (cookieOf(req, 'fx_sess') !== 'stale') { res.statusCode = 302; res.setHeader('location', '/pd/login'); return res.end(); } setTimeout(() => res.end(html('Pending Bank — Dashboard', `<script>location.replace('/pd/login?next=%2Fpd%2Fapp&state=' + Math.random().toString(36).slice(2) + '#s');</script>`)), PEND_MS); return; }
  if (u.startsWith('/sreload')) { setTimeout(() => res.end(html('Slow reload', '<script>location.reload();</script>')), 1500); return; }
  if (u.startsWith('/slow')) { setTimeout(() => res.end(html('Slow page', '<p>slow')), 3000); return; }
  return res.end(html('Other ' + u, '<p>other'));
}).listen(PORT, '127.0.0.1');
const U = (p) => `http://127.0.0.1:${PORT}${p}`;
const P = (s) => String(s == null ? '' : s).split(String(PORT)).join('<P>');

const quiet = { log() { }, warn() { }, error() { } };
const KA = 'bk-00005e7a';
const kk = Kk.create({ dataDir: path.join(ROOT, 'data'), homeDir: KH, env: () => kenv, serverSetting: () => undefined, liveKeys: () => new Set([KA]), runtime: Ff.createBrowserRuntime({ env: kenv }), facts: Ff.createBrowserFacts({ env: kenv }), log: quiet, install: false, tickMs: 3600e3 });
const report = { version: ver, at: new Date().toISOString(), fixtures: {} };
const cfg = kk.configFileFor({ ephemeral: false });
function run(pairs, args, { timeout = 60000 } = {}) {
  const t0 = Date.now();
  return new Promise((resolve) => execFile(REAL_AB, args, { env: { ...kenv, ...Ss.pairsToEnv(pairs), AGENT_BROWSER_CONFIG: cfg }, encoding: 'utf8', timeout }, (err, so, se) => resolve({ ok: !err, code: err ? (err.code ?? err.signal) : 0, ms: Date.now() - t0, out: P((String(so || '') + String(se || '')).trim()).slice(0, 600) })));
}
/** THE WATCH'S SHAPE: a browser-level socket, every page target attached (flat) + Page.enable; main-frame events stamped. */
function browserWatch(wsUrl) {
  const ws = new WebSocket(wsUrl, { perMessageDeflate: false });
  let id = 0; const waiting = new Map(); const sessions = new Map(); const events = []; const t0 = Date.now();
  const call = (method, params = {}, sessionId = null, ms = 5000) => new Promise((resolve) => { const i = ++id; waiting.set(i, resolve); ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) })); setTimeout(() => { if (waiting.has(i)) { waiting.delete(i); resolve({ timeout: true }); } }, ms); });
  const seen = new Set();
  const track = async (info) => {
    if (!info || info.type !== 'page' || seen.has(info.targetId)) return;
    seen.add(info.targetId);
    const a = await call('Target.attachToTarget', { targetId: info.targetId, flatten: true });
    if (a && a.result && a.result.sessionId) { sessions.set(a.result.sessionId, info.targetId); await call('Page.enable', {}, a.result.sessionId); }
  };
  ws.on('message', (d) => {
    let m; try { m = JSON.parse(String(d)); } catch { return; }
    if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); return; }
    if (m.method === 'Target.targetCreated' || m.method === 'Target.targetInfoChanged') { track(m.params.targetInfo); return; }
    const tid = sessions.get(String(m.sessionId || ''));
    if (!tid || !m.method || !/^Page\.(frameStartedNavigating|frameNavigated|navigatedWithinDocument|frameStoppedLoading|frameRequestedNavigation|frameScheduledNavigation|frameClearedScheduledNavigation|loadEventFired|domContentEventFired)$/.test(m.method)) return;
    const p = m.params || {};
    const fid = String(p.frameId || (p.frame && p.frame.id) || '');
    if (fid && fid !== tid) return; // the main frame only (its id = the target id)
    events.push({ at: Date.now() - t0, tab: tid.slice(0, 6), method: m.method.slice(5), url: P((p.frame && p.frame.url) || p.url || ''), type: p.navigationType || p.reason || p.disposition || null });
  });
  const ready = new Promise((resolve) => ws.once('open', async () => { await call('Target.setDiscoverTargets', { discover: true }); const r = await call('Target.getTargets'); for (const t of (r.result && r.result.targetInfos) || []) await track(t); resolve(true); }));
  return { ws, events, call, ready, sessionOf: (tid) => { for (const [s, t] of sessions) if (t === tid) return s; return null; }, t0, close: () => { try { ws.close(); } catch { /* */ } } };
}
const getJson = (url) => new Promise((resolve) => http.get(url, (res) => { let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve(null); } }); }).on('error', () => resolve(null)));

try {
  const prof = kk.createProfile({ label: 'Loop' }, { owner: { kind: 'instance', id: null } });
  const ax = await kk.attach({ profileId: prof.id, browserKey: KA, sessionId: 'sess-loop' });
  const pin = ax.pinTab ? ['--pin-tab'] : [];
  const rec = kk.browserOf(prof.id);
  const cdpHttp = String(rec.cdpUrl).replace(/^ws/, 'http').replace(/\/devtools\/browser\/.*$/, '');
  const w = browserWatch(rec.cdpUrl);
  await w.ready;
  await run(ax.env, [...pin, 'open', U('/set-stale')]);
  const pageOf = async (re) => ((await getJson(cdpHttp + '/json/list')) || []).find((t) => t.type === 'page' && re.test(t.url)) || null;

  async function fixture(name, start, { re, verbs = true, settleMs = 6000 } = {}) {
    const R = { name, start: P(start) };
    await run(ax.env, [...pin, 'tab', 'new', 'about:blank'], { timeout: 45000 }); // a bound tab for this fixture (the pin)
    const e0 = w.events.length; const at0 = Date.now() - w.t0;
    const o = await run(ax.env, [...pin, 'open', start], { timeout: 45000 });
    R.open = o;
    await sleep(settleMs);
    const tabNow = await pageOf(re);
    const tabId = tabNow ? tabNow.id.slice(0, 6) : null;
    const ev = w.events.slice(e0).filter((e) => !tabId || e.tab === tabId);
    R.events = ev.slice(0, 60).map((e) => ({ ...e, at: e.at - at0 }));
    const nav = ev.filter((e) => e.method === 'frameNavigated');
    R.mainFrameNavigated = { count: nav.length, spanMs: nav.length ? nav[nav.length - 1].at - nav[0].at : 0, urls: [...new Set(nav.map((e) => e.url))].slice(0, 6), types: [...new Set(nav.map((e) => e.type))] };
    R.withinDocument = ev.filter((e) => e.method === 'navigatedWithinDocument').length;
    R.started = ev.filter((e) => e.method === 'frameStartedNavigating').length;
    if (!verbs) return R;
    const pg = await pageOf(re);
    R.tab = pg ? { url: P(pg.url), title: pg.title } : null;
    for (const v of [['snapshot'], ['get', 'title'], ['eval', 'document.title'], ['screenshot', path.join(ROOT, name + '.png')], ['tab', 'list'], ['tab', 'new', U('/other')], ['tab', 't1'], ['click', '#u']]) {
      const r = await run(ax.env, [...pin, ...v], { timeout: 45000 });
      R['verb:' + v.slice(0, 2).join(' ')] = { ok: r.ok, code: r.code, ms: r.ms, out: r.out.slice(0, 240) };
    }
    const pg2 = await pageOf(re);
    const sid = pg2 ? w.sessionOf(pg2.id) : null;
    if (sid) {
      let t = Date.now(); const shot = await w.call('Page.captureScreenshot', { format: 'png' }, sid, 10000);
      R.cdpCaptureScreenshot = { ms: Date.now() - t, ok: !!(shot.result && shot.result.data), bytes: shot.result && shot.result.data ? shot.result.data.length : 0, timeout: !!shot.timeout, error: shot.error ? shot.error.message : null };
      t = Date.now(); const shotF = await w.call('Page.captureScreenshot', { format: 'jpeg', quality: 60, optimizeForSpeed: true, fromSurface: true }, sid, 10000);
      R.cdpCaptureFast = { ms: Date.now() - t, ok: !!(shotF.result && shotF.result.data), timeout: !!shotF.timeout, error: shotF.error ? shotF.error.message : null };
      // the screencast's first frame (what the live view streams)
      t = Date.now();
      const frame = await new Promise((resolve) => {
        const on = (d) => { let m; try { m = JSON.parse(String(d)); } catch { return; } if (m.method === 'Page.screencastFrame' && m.sessionId === sid) { w.ws.off('message', on); resolve({ ok: true, bytes: String(m.params.data || '').length }); } };
        w.ws.on('message', on);
        w.call('Page.startScreencast', { format: 'jpeg', quality: 60, maxWidth: 1280, maxHeight: 720, everyNthFrame: 1 }, sid);
        setTimeout(() => { w.ws.off('message', on); resolve({ ok: false, timeout: true }); }, 10000);
      });
      await w.call('Page.stopScreencast', {}, sid);
      R.cdpScreencastFirstFrame = { ms: Date.now() - t, ...frame };
      t = Date.now(); const st = await w.call('Page.stopLoading', {}, sid, 10000);
      R.cdpStopLoading = { ms: Date.now() - t, ok: !!st.result, timeout: !!st.timeout, error: st.error ? st.error.message : null };
      const e1 = w.events.length;
      await sleep(3000);
      R.navigatedIn3sAfterStop = w.events.slice(e1).filter((e) => e.method === 'frameNavigated' && e.tab === pg2.id.slice(0, 6)).length;
      const t2 = Date.now(); const shot2 = await w.call('Page.captureScreenshot', { format: 'png' }, sid, 10000);
      R.cdpCaptureAfterStop = { ms: Date.now() - t2, ok: !!(shot2.result && shot2.result.data), timeout: !!shot2.timeout };
      const sn = await run(ax.env, [...pin, 'tab', 't1'], { timeout: 45000 });
      const sn2 = await run(ax.env, [...pin, 'snapshot'], { timeout: 45000 });
      R.snapshotAfterStop = { switch: { ok: sn.ok, ms: sn.ms }, ok: sn2.ok, ms: sn2.ms, out: sn2.out.slice(0, 200) };
      const tc = await run(ax.env, [...pin, 'tab', 'close'], { timeout: 45000 });
      R['verb:tab close (after stop)'] = { ok: tc.ok, code: tc.code, ms: tc.ms, out: tc.out.slice(0, 200) };
    }
    const pg3 = await pageOf(re);
    if (pg3) { const t = Date.now(); const c = await w.call('Target.closeTarget', { targetId: pg3.id }, null, 10000); R.cdpCloseTarget = { ms: Date.now() - t, ok: !!(c.result && c.result.success !== false), timeout: !!c.timeout }; }
    const tl = await run(ax.env, [...pin, 'tab', 'list'], { timeout: 45000 });
    R.tabsAfter = tl.out.slice(0, 300);
    return R;
  }
  /** `tab close` on a tab that is STILL looping (no stop first): does the CLI's close wait for it to settle? */
  async function closeWhileLooping(name, start, re) {
    const R = { name };
    await run(ax.env, [...pin, 'tab', 'new', start], { timeout: 45000 });
    await sleep(3000);
    const tl = await run(ax.env, [...pin, 'tab', 'list'], { timeout: 45000 });
    R.tabList = { ok: tl.ok, ms: tl.ms, out: tl.out.slice(0, 300) };
    const tc = await run(ax.env, [...pin, 'tab', 'close'], { timeout: 45000 });
    R.tabClose = { ok: tc.ok, code: tc.code, ms: tc.ms, out: tc.out.slice(0, 240) };
    R.stillThere = !!(await pageOf(re));
    const nt = await run(ax.env, [...pin, 'tab', 'new', U('/other-after')], { timeout: 45000 });
    R.tabNewAfter = { ok: nt.ok, ms: nt.ms };
    return R;
  }
  const only = (process.env.ONLY || 'bank,meta,reload,slow,slowbank,slowreload,close').split(',');
  // the shape of `tab list --json` (what `vibespace-browser stop` / `site-reset` read the session's current tab from)
  if (only.includes('tablist')) { await run(ax.env, [...pin, 'tab', 'new', U('/other-tl')]); const tl = await run(ax.env, [...pin, '--json', 'tab', 'list']); report.tabListJson = { ok: tl.ok, ms: tl.ms, out: tl.out.replace(/[0-9A-F]{32}/g, '<TARGET>') }; console.log(JSON.stringify(report.tabListJson, null, 1)); }
  // THE DAEMON'S QUEUE (heavy-suite finding): a verb whose CLI client is killed mid-wait (the loop cut it) keeps the session's
  // daemon busy until its own timeout — every later verb queues behind it. Does Page.stopLoading (the watch's socket) end
  // the daemon's wait? Does Target.closeTarget? Measured on the always-pending fixture.
  if (only.includes('queue')) {
    const Q = {};
    for (const how of ['none', 'stop', 'close']) {
      await run(ax.env, [...pin, 'tab', 'new', 'about:blank']);
      const t0 = Date.now();
      const openP = run(ax.env, [...pin, 'open', U('/pd/login')], { timeout: 45000 });
      await sleep(2500);
      const pg = await pageOf(/\/pd\//);
      const sid = pg ? w.sessionOf(pg.id) : null;
      let act = null;
      if (how === 'stop' && sid) { const a = Date.now(); const r0 = await w.call('Page.stopLoading', {}, sid, 5000); act = { ms: Date.now() - a, ok: !!r0.result }; }
      if (how === 'close' && pg) { await w.call('Target.createTarget', { url: 'about:blank' }, null, 5000); const a = Date.now(); const r0 = await w.call('Target.closeTarget', { targetId: pg.id }, null, 5000); act = { ms: Date.now() - a, ok: !!r0.result }; }
      const snapP = run(ax.env, [...pin, 'get', 'title'], { timeout: 45000 });
      const o = await openP; const sn = await snapP;
      Q[how] = { act, openEndedAfterMs: o.ms, openOut: o.out.slice(0, 160), nextVerbMs: sn.ms, nextVerbOk: sn.ok, nextVerbOut: sn.out.slice(0, 160), totalMs: Date.now() - t0 };
      console.log(how, JSON.stringify(Q[how]));
      const pg2 = await pageOf(/\/pd\//); if (pg2) await w.call('Target.closeTarget', { targetId: pg2.id }, null, 5000);
      await sleep(500);
    }
    report.queue = Q;
  }
  if (only.includes('bank')) { report.fixtures.bank = await fixture('bank', U('/bank/login'), { re: /\/bank\// }); console.log(JSON.stringify(report.fixtures.bank, null, 1)); }
  if (only.includes('meta')) { report.fixtures.meta = await fixture('meta', U('/two/a'), { re: /\/two\// }); console.log(JSON.stringify(report.fixtures.meta, null, 1)); }
  if (only.includes('reload')) { report.fixtures.reload = await fixture('reload', U('/reload'), { re: /\/reload/ }); console.log(JSON.stringify(report.fixtures.reload, null, 1)); }
  if (only.includes('slow')) { report.fixtures.slow = await fixture('slow', U('/slow'), { re: /\/slow/, verbs: false, settleMs: 5000 }); console.log(JSON.stringify(report.fixtures.slow, null, 1)); }
  if (only.includes('pend')) { report.fixtures.pend = await fixture('pend', U('/pd/login'), { re: /\/pd\//, settleMs: 4000 }); report.fixtures.pend.pendMs = PEND_MS; console.log(JSON.stringify(report.fixtures.pend, null, 1)); }
  if (only.includes('slowbank')) { report.fixtures.slowbank = await fixture('slowbank', U('/sb/login'), { re: /\/sb\//, settleMs: 8000 }); console.log(JSON.stringify(report.fixtures.slowbank, null, 1)); }
  if (only.includes('slowreload')) { report.fixtures.slowreload = await fixture('slowreload', U('/sreload'), { re: /\/sreload/, settleMs: 8000 }); console.log(JSON.stringify(report.fixtures.slowreload, null, 1)); }
  if (only.includes('close')) { report.closeWhileLooping = await closeWhileLooping('bank', U('/bank/login'), /\/bank\//); console.log(JSON.stringify(report.closeWhileLooping, null, 1)); }
  report.serverHits = hits.length;
  w.close();
} catch (e) { report.error = String(e && e.stack || e); console.error(e); }
finally {
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
  try { kk.shutdown(); } catch { /* */ }
  srv.close();
  cleanup();
  process.exit(0);
}
