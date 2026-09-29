#!/usr/bin/env node
// A NAVIGATION THE PAGE HOLDS, MEASURED (lane browser-stuck, 2026-09-28 — userW's "jarvis-work 卡死": every
// `navigate` answered after the 30 s timeout, the live view froze, Chrome's /json/list showed the NEW url over
// the OLD title). NOT a test-*.mjs, no tier (the measure-anchor-grace.mjs shape): the REAL keeper launches ONE
// headless profile browser in a scratch HOME (never ~/.agent-browser), a lease session drives it through the
// installed agent-browser, and a raw CDP page socket + the daemon's stream server record what each side sees.
//
//   1. a page with `onbeforeunload` + a field the agent CLICKED and TYPED into (sticky user activation — Chrome
//      shows no beforeunload dialog without it), then `navigate` elsewhere: duration, exit, output;
//   2. while it hangs: /json/list (url vs title), `dialog status`, the raw socket's Page.javascriptDialogOpening,
//      a LATE CDP client's Page.enable (does Chrome re-announce an open dialog to a newcomer?), the stream
//      server's records;
//   3. `dialog accept` (the navigation completes?) and, on a second round, `dialog dismiss` (the page stays?);
//   4. the same page with a plain `alert()` from a click (the auto-dialog baseline).
//
// `WT=<checkout> node scripts/measure-dialog-hold.mjs [out.json]`; zero vendor calls; the scratch root, the
// daemons and the Chrome it started are ended on exit (by this run's own root, never a name).
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
const BASE_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('AGENT_BROWSER_')));

const ROOT = scratch('bstuck');
fs.rmSync(ROOT, { recursive: true, force: true });
const KH = path.join(ROOT, 'h'), KXD = path.join(ROOT, 'x');
for (const d of [path.join(KH, '.agent-browser'), KXD]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
const kenv = { ...BASE_ENV, HOME: KH, XDG_RUNTIME_DIR: KXD };
let cleaned = false;
function cleanup() {
  if (cleaned) return; cleaned = true;
  try { endRootedProcesses(ROOT); } catch { /* none */ }
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { /* next run */ }
}
process.on('exit', cleanup);
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { cleanup(); process.exit(130); });

let ver = null; try { ver = execFileSync('agent-browser', ['--version'], { encoding: 'utf8', timeout: 8000, env: BASE_ENV }).trim(); } catch { /* none */ }
if (!ver) { console.log('SKIP: agent-browser is not runnable here'); process.exit(0); }
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
console.log(`agent-browser ${ver}; chrome ${CHROME || '(the binary\'s own)'}; root ${ROOT}`);

// ── the pages (loopback) ──
const PORT = await freePort();
const FORM = `<!doctype html><title>COMPOSE-DRAFT</title><input id=f autofocus><button id=b onclick="alert('hello from alert')">alert</button>
<script>window.addEventListener('beforeunload', (e) => { e.preventDefault(); e.returnValue = 'unsaved'; return 'unsaved'; });</script>`;
const srv = http.createServer((req, res) => {
  res.setHeader('content-type', 'text/html; charset=utf-8');
  if (req.url.startsWith('/form')) return res.end(FORM);
  if (req.url.startsWith('/plain')) return res.end('<!doctype html><title>PLAIN</title><button id=b onclick="alert(\'hello from alert\')">alert</button>');
  if (req.url.startsWith('/confirm')) return res.end('<!doctype html><title>CONFIRM-PAGE</title><button id=b onclick="document.title = confirm(\'Discard this draft?\') ? \'SAID-YES\' : \'SAID-NO\'">confirm</button>');
  if (req.url.startsWith('/selfconfirm')) return res.end('<!doctype html><title>SELF-CONFIRM</title><script>setTimeout(() => { document.title = confirm(\'Page asks by itself\') ? \'SELF-YES\' : \'SELF-NO\'; }, 1500);</script>');
  return res.end(`<!doctype html><title>OTHER ${req.url}</title><p>other`);
}).listen(PORT, '127.0.0.1');
const U = (p) => `http://127.0.0.1:${PORT}${p}`;

// NOAUTO_USER_CONFIG=1: `noAutoDialog: true` in the machine's user file BEFORE the keeper composes its configs, so the
// keeper's own launch AND every lease session carry it (a launch-view key: set from the start, never flipped live)
if (process.env.NOAUTO_USER_CONFIG === '1') fs.writeFileSync(path.join(KH, '.agent-browser', 'config.json'), JSON.stringify({ noAutoDialog: true }));
const quiet = { log() { }, warn() { }, error() { } };
const KA = 'bk-0000d1a1';
const kk = Kk.create({ dataDir: path.join(ROOT, 'data'), homeDir: KH, env: () => kenv, serverSetting: () => undefined, liveKeys: () => new Set([KA]), runtime: Ff.createBrowserRuntime({ env: kenv }), facts: Ff.createBrowserFacts({ env: kenv }), log: quiet, install: false });
const report = { version: ver, chrome: CHROME || null, at: new Date().toISOString(), rounds: {} };
const cfg = kk.configFileFor({ ephemeral: false });
function run(pairs, args, { timeout = 90000 } = {}) {
  const t0 = Date.now();
  return new Promise((resolve) => execFile('agent-browser', args, { env: { ...kenv, ...Ss.pairsToEnv(pairs), AGENT_BROWSER_CONFIG: cfg }, encoding: 'utf8', timeout }, (err, so, se) => resolve({ ok: !err, code: err ? (err.code ?? err.signal) : 0, ms: Date.now() - t0, out: (String(so || '') + String(se || '')).trim() })));
}
const getJson = (url) => new Promise((resolve) => http.get(url, (res) => { let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve(null); } }); }).on('error', () => resolve(null)));
/** a raw CDP page socket: Page.enable, every dialog event stamped */
function pageSocket(wsUrl, label) {
  const ws = new WebSocket(wsUrl, { perMessageDeflate: false });
  const events = []; let id = 0; const waiting = new Map(); const t0 = Date.now();
  ws.on('message', (d) => {
    let m; try { m = JSON.parse(String(d)); } catch { return; }
    if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); return; }
    if (m.method && /Dialog|frameRequestedNavigation|frameStartedNavigating|navigatedWithinDocument|frameNavigated|loadEventFired|frameStartedLoading/.test(m.method)) events.push({ at: Date.now() - t0, method: m.method, params: m.params });
  });
  const call = (method, params = {}) => new Promise((resolve) => { const i = ++id; waiting.set(i, resolve); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (waiting.has(i)) { waiting.delete(i); resolve({ timeout: true }); } }, 5000); });
  const opened = new Promise((resolve) => { ws.once('open', () => resolve(true)); ws.once('error', () => resolve(false)); });
  return { ws, events, call, opened, label, close: () => { try { ws.close(); } catch { /* */ } } };
}
/** the daemon's stream server: every non-frame record type */
function streamSocket(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { Origin: Ss.originHeaderFor(port) } });
  const recs = []; const t0 = Date.now();
  ws.on('message', (d) => { let m; try { m = JSON.parse(String(d)); } catch { return; } if (m.type === 'frame') return; recs.push({ at: Date.now() - t0, type: m.type, keys: Object.keys(m), m: JSON.stringify(m).slice(0, 400) }); });
  return { ws, recs, close: () => { try { ws.close(); } catch { /* */ } } };
}

try {
  const prof = kk.createProfile({ label: 'Stuck' }, { owner: { kind: 'instance', id: null } });
  const ax = await kk.attach({ profileId: prof.id, browserKey: KA, sessionId: 'sess-d1' });
  const pin = ax.pinTab ? ['--pin-tab'] : [];
  const rec = kk.browserOf(prof.id);
  const cdpHttp = String(rec.cdpUrl).replace(/^ws/, 'http').replace(/\/devtools\/browser\/.*$/, '');
  report.cdpHttpShape = 'http://127.0.0.1:<port>';
  const port = await kk.streamPortFor(Ss.streamTargetFor({ browserKey: KA, set: kk.setFor(KA), profiles: kk.list().profiles }));

  async function round(name, { answer }) {
    const R = { name };
    const o = await run(ax.env, [...pin, 'open', U('/form')]);
    R.open = { ok: o.ok, ms: o.ms };
    const list0 = (await getJson(cdpHttp + '/json/list')) || [];
    const page = list0.find((t) => t.type === 'page' && /\/form/.test(t.url));
    if (!page) { R.error = 'no /form tab in /json/list'; return R; }
    const early = pageSocket(page.webSocketDebuggerUrl, 'early');
    await early.opened; await early.call('Page.enable');
    const st = port.ok ? streamSocket(port.port) : null;
    const c = await run(ax.env, [...pin, 'click', '#f']);
    const ty = await run(ax.env, [...pin, 'type', '#f', 'draft text']);
    R.activation = { click: c.ok, type: ty.ok };
    const navP = run(ax.env, [...pin, '--json', 'navigate', U('/other-' + name)]);
    await sleep(3000);
    const listMid = (await getJson(cdpHttp + '/json/list')) || [];
    const pMid = listMid.find((t) => t.id === page.id);
    R.jsonListWhileHeld = pMid ? { url: pMid.url.replace(String(PORT), '<P>'), title: pMid.title } : null;
    const late = pageSocket(page.webSocketDebuggerUrl, 'late');
    await late.opened; const lateEnable = await late.call('Page.enable'); await sleep(300);
    R.lateClientEnable = { answered: !lateEnable.timeout, error: lateEnable.error || null };
    const ds = await run(ax.env, [...pin, 'dialog', 'status']);
    const dsj = await run(ax.env, [...pin, '--json', 'dialog', 'status']);
    R.dialogStatusWhileHeld = { ok: ds.ok, ms: ds.ms, out: ds.out.slice(0, 400), json: dsj.out.slice(0, 600) };
    const gu = await run(ax.env, [...pin, 'get', 'url'], { timeout: 40000 });
    R.getUrlWhileHeld = { ok: gu.ok, ms: gu.ms, out: gu.out.slice(0, 300).replace(String(PORT), '<P>') };
    const nav = await navP;
    R.navigate = { ok: nav.ok, code: nav.code, ms: nav.ms, out: nav.out.slice(0, 800).replace(new RegExp(String(PORT), 'g'), '<P>') };
    const listAfter = (await getJson(cdpHttp + '/json/list')) || [];
    const pAfter = listAfter.find((t) => t.id === page.id);
    R.jsonListAfterNavigateReturned = pAfter ? { url: pAfter.url.replace(String(PORT), '<P>'), title: pAfter.title } : null;
    const ds2 = await run(ax.env, [...pin, '--json', 'dialog', 'status']);
    R.dialogStatusAfterNavigateReturned = ds2.out.slice(0, 600);
    if (answer) {
      const a = await run(ax.env, [...pin, 'dialog', answer]);
      R.answer = { verb: answer, ok: a.ok, ms: a.ms, out: a.out.slice(0, 300) };
      await sleep(1500);
      const listEnd = (await getJson(cdpHttp + '/json/list')) || [];
      const pEnd = listEnd.find((t) => t.id === page.id);
      R.jsonListAfterAnswer = pEnd ? { url: pEnd.url.replace(String(PORT), '<P>'), title: pEnd.title } : null;
    }
    R.earlyClientDialogEvents = early.events.filter((e) => /Dialog/.test(e.method)).map((e) => ({ at: e.at, method: e.method, type: e.params.type, message: e.params.message, hasBrowserHandler: e.params.hasBrowserHandler, url: String(e.params.url || '').replace(String(PORT), '<P>') }));
    R.lateClientDialogEvents = late.events.filter((e) => /Dialog/.test(e.method)).map((e) => ({ at: e.at, method: e.method, type: e.params.type, message: e.params.message, hasBrowserHandler: e.params.hasBrowserHandler }));
    R.earlyNavEvents = early.events.filter((e) => !/Dialog/.test(e.method)).map((e) => ({ at: e.at, method: e.method, url: String((e.params.frame && e.params.frame.url) || e.params.url || '').replace(String(PORT), '<P>') }));
    if (st) { R.streamRecordTypes = [...new Set(st.recs.map((r) => r.type))]; R.streamDialogish = st.recs.filter((r) => /dialog/i.test(r.m)).map((r) => r.m); st.close(); }
    early.close(); late.close();
    return R;
  }
  const ROUNDS = (process.env.ROUNDS || 'all').split(',');
  const want = (n) => ROUNDS.includes('all') || ROUNDS.includes(n);
  if (want('accept')) { report.rounds.accept = await round('accept', { answer: 'accept' }); console.log(JSON.stringify(report.rounds.accept, null, 1)); }
  if (want('dismiss')) { report.rounds.dismiss = await round('dismiss', { answer: 'dismiss' }); console.log(JSON.stringify(report.rounds.dismiss, null, 1)); }

  // the auto-dialog baseline: a plain alert() from a click
  if (want('alert')) {
    const R = {};
    await run(ax.env, [...pin, 'open', U('/plain')]);
    const listP = (await getJson(cdpHttp + '/json/list')) || [];
    const pg = listP.find((t) => t.type === 'page' && /\/plain/.test(t.url));
    const s = pg ? pageSocket(pg.webSocketDebuggerUrl, 'alert') : null;
    if (s) { await s.opened; await s.call('Page.enable'); }
    const cl = await run(ax.env, [...pin, 'click', '#b']);
    await sleep(1500);
    const dst = await run(ax.env, [...pin, '--json', 'dialog', 'status']);
    const ti = await run(ax.env, [...pin, 'get', 'title']);
    R.click = { ok: cl.ok, ms: cl.ms, out: cl.out.slice(0, 300) };
    R.dialogStatus = dst.out.slice(0, 400);
    R.getTitle = { ok: ti.ok, ms: ti.ms, out: ti.out.slice(0, 200) };
    R.events = s ? s.events.filter((e) => /Dialog/.test(e.method)).map((e) => ({ at: e.at, method: e.method, type: e.params.type, message: e.params.message, result: e.params.result })) : null;
    if (s) s.close();
    report.rounds.alert = R;
    console.log(JSON.stringify(R, null, 1));
  }

  // ── a dialog that STAYS: confirm() (the help auto-handles alert/beforeunload only) ──
  const P = (s) => String(s || '').replace(new RegExp(String(PORT), 'g'), '<P>');
  const leaseDaemons = () => fs.readdirSync('/proc').filter((x) => /^\d+$/.test(x)).map(Number).filter((pid) => { try { const env = fs.readFileSync(`/proc/${pid}/environ`, 'utf8'); return env.includes(`AGENT_BROWSER_SESSION=vs-${KA}`) && env.includes(`HOME=${KH}`) && fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes('agent-browser'); } catch { return false; } });
  async function held(name, { path: pth, trigger, restartDaemon = false, rawAnswer = null }) {
    const R = { name };
    await run(ax.env, [...pin, 'open', U(pth)]);
    const list0 = (await getJson(cdpHttp + '/json/list')) || [];
    const page = list0.find((t) => t.type === 'page' && t.url.includes(pth));
    if (!page) { R.error = 'no tab'; return R; }
    const early = pageSocket(page.webSocketDebuggerUrl, 'early'); await early.opened; await early.call('Page.enable');
    const st = port.ok ? streamSocket(port.port) : null;
    if (trigger === 'click') { const c = await run(ax.env, [...pin, 'click', '#b'], { timeout: 45000 }); R.trigger = { ok: c.ok, ms: c.ms, out: P(c.out).slice(0, 300) }; }
    else { await sleep(2500); R.trigger = 'the page itself (setTimeout confirm)'; }
    await sleep(500);
    R.dialogStatusAfterOpen = P((await run(ax.env, [...pin, '--json', 'dialog', 'status'])).out).slice(0, 500);
    if (restartDaemon) {
      const before = leaseDaemons();
      for (const pid of before) { try { process.kill(pid, 'SIGKILL'); } catch { /* */ } }
      await sleep(800);
      R.daemonRestart = { killed: before.length, left: leaseDaemons().length };
      const ds = await run(ax.env, [...pin, '--json', 'dialog', 'status'], { timeout: 45000 });
      R.dialogStatusFromNewDaemon = { ms: ds.ms, out: P(ds.out).slice(0, 500) };
    }
    const late = pageSocket(page.webSocketDebuggerUrl, 'late'); await late.opened; const le = await late.call('Page.enable'); await sleep(400);
    R.lateClient = { enableAnswered: !le.timeout, dialogEvents: late.events.filter((e) => /Dialog/.test(e.method)).map((e) => ({ method: e.method, type: e.params.type, message: e.params.message })) };
    const ev1 = await late.call('Runtime.evaluate', { expression: '1+1', returnByValue: true });
    R.lateClient.runtimeEvaluate = ev1.timeout ? 'no answer in 5 s' : (ev1.error ? ev1.error.message : 'answered');
    const nav = await run(ax.env, [...pin, '--json', 'navigate', U('/after-' + name)], { timeout: 70000 });
    R.navigate = { ok: nav.ok, code: nav.code, ms: nav.ms, out: P(nav.out).slice(0, 700) };
    const lst = (await getJson(cdpHttp + '/json/list')) || [];
    const pg = lst.find((t) => t.id === page.id);
    R.jsonListWhileHeld = pg ? { url: P(pg.url), title: pg.title } : null;
    const gt = await run(ax.env, [...pin, 'get', 'title'], { timeout: 45000 });
    R.getTitleWhileHeld = { ok: gt.ok, ms: gt.ms, out: P(gt.out).slice(0, 300) };
    const ds3 = await run(ax.env, [...pin, '--json', 'dialog', 'status']);
    R.dialogStatusAfterNavigate = P(ds3.out).slice(0, 500);
    if (rawAnswer) {
      const a = await late.call('Page.handleJavaScriptDialog', { accept: rawAnswer === 'accept' });
      R.rawAnswer = { verb: rawAnswer, reply: a.timeout ? 'timeout' : (a.error ? a.error.message : 'ok') };
    } else {
      const a = await run(ax.env, [...pin, 'dialog', 'accept'], { timeout: 45000 });
      R.cliAccept = { ok: a.ok, ms: a.ms, out: P(a.out).slice(0, 300) };
    }
    await sleep(1500);
    const lst2 = (await getJson(cdpHttp + '/json/list')) || [];
    const pg2 = lst2.find((t) => t.id === page.id);
    R.jsonListAfterAnswer = pg2 ? { url: P(pg2.url), title: pg2.title } : null;
    R.earlyDialogEvents = early.events.filter((e) => /Dialog/.test(e.method)).map((e) => ({ at: e.at, method: e.method, type: e.params.type, message: e.params.message, result: e.params.result }));
    if (st) { R.streamRecordTypes = [...new Set(st.recs.map((r) => r.type))]; R.streamStatusRecs = st.recs.filter((r) => r.type === 'status').map((r) => r.m).slice(-3); st.close(); }
    early.close(); late.close();
    return R;
  }
  for (const [name, o] of [['confirm-click', { path: '/confirm', trigger: 'click' }], ['confirm-self', { path: '/selfconfirm', trigger: 'self' }], ['confirm-daemon-restart', { path: '/confirm', trigger: 'click', restartDaemon: true, rawAnswer: 'accept' }]]) {
    if (!want(name)) continue;
    report.rounds[name] = await held(name, o);
    console.log(JSON.stringify(report.rounds[name], null, 1));
  }

  // ── AUTO-DIALOG OFF: does switching it restart the lease's daemon (a launch-view change relaunches Chrome), and
  //    what does a held beforeunload / alert / prompt look like to the verb that provoked it? ──
  if (want('noauto')) {
    const lc = (out) => { try { const j = JSON.parse(out.trim().split('\n').pop()); const l = (j.data && j.data.lifecycle) || {}; return { restartedBackground: l.restartedBackground, relaunchedBrowser: l.relaunchedBrowser, launched: l.launched, launchHash: l.effectiveLaunch && String(l.effectiveLaunch.launchHash) }; } catch { return null; } };
    const R = {};
    const pidsBefore = leaseDaemons();
    const t1 = await run(ax.env, [...pin, '--json', 'get', 'url']);
    R.baseline = { lifecycle: lc(t1.out), daemons: pidsBefore };
    // (a) the env twin
    const envOn = [...ax.env, 'AGENT_BROWSER_NO_AUTO_DIALOG=1'];
    const t2 = await run(envOn, [...pin, '--json', 'get', 'url']);
    R.envTwin = { lifecycle: lc(t2.out), daemonsAfter: leaseDaemons(), sameDaemon: JSON.stringify(leaseDaemons()) === JSON.stringify(pidsBefore) };
    // (b) the config key (a config the keeper composes)
    const cfgNo = path.join(ROOT, 'cfg-noauto.json');
    let base = {}; try { base = JSON.parse(fs.readFileSync(cfg, 'utf8')); } catch { /* none */ }
    fs.writeFileSync(cfgNo, JSON.stringify({ ...base, noAutoDialog: true }, null, 2));
    const runC = (args, o = {}) => { const t0 = Date.now(); return new Promise((resolve) => execFile('agent-browser', args, { env: { ...kenv, ...Ss.pairsToEnv(ax.env), AGENT_BROWSER_CONFIG: cfgNo }, encoding: 'utf8', timeout: o.timeout || 90000 }, (err, so, se) => resolve({ ok: !err, code: err ? (err.code ?? err.signal) : 0, ms: Date.now() - t0, out: (String(so || '') + String(se || '')).trim() }))); };
    const d0 = leaseDaemons();
    const t3 = await runC([...pin, '--json', 'get', 'url']);
    R.configKey = { lifecycle: lc(t3.out), sameDaemon: JSON.stringify(leaseDaemons()) === JSON.stringify(d0), out: P(t3.out).slice(0, 300) };
    // which one decides for the rest: the env twin (every command below carries it AND the config key)
    const runN = (args, o = {}) => { const t0 = Date.now(); return new Promise((resolve) => execFile('agent-browser', args, { env: { ...kenv, ...Ss.pairsToEnv(envOn), AGENT_BROWSER_CONFIG: cfgNo }, encoding: 'utf8', timeout: o.timeout || 90000 }, (err, so, se) => resolve({ ok: !err, code: err ? (err.code ?? err.signal) : 0, ms: Date.now() - t0, out: (String(so || '') + String(se || '')).trim() }))); };
    // beforeunload with auto-dialog off
    await runN([...pin, 'open', U('/form')]);
    const lst = (await getJson(cdpHttp + '/json/list')) || []; const page = lst.find((t) => t.type === 'page' && t.url.includes('/form'));
    const early = page ? pageSocket(page.webSocketDebuggerUrl, 'early') : null; if (early) { await early.opened; await early.call('Page.enable'); }
    await runN([...pin, 'click', '#f']); await runN([...pin, 'type', '#f', 'draft text']);
    const nav = await runN([...pin, '--json', 'navigate', U('/after-noauto')], { timeout: 70000 });
    R.beforeunloadNavigate = { ok: nav.ok, code: nav.code, ms: nav.ms, out: P(nav.out).slice(0, 700) };
    const lst2 = (await getJson(cdpHttp + '/json/list')) || []; const pg2 = page && lst2.find((t) => t.id === page.id);
    R.jsonListWhileHeld = pg2 ? { url: P(pg2.url), title: pg2.title } : null;
    const ds = await runN([...pin, '--json', 'dialog', 'status']); R.dialogStatus = P(ds.out).slice(0, 500);
    const nav2 = await runN([...pin, '--json', 'navigate', U('/after-noauto-2')], { timeout: 70000 });
    R.secondNavigate = { ok: nav2.ok, ms: nav2.ms, out: P(nav2.out).slice(0, 500) };
    const gt = await runN([...pin, 'get', 'title'], { timeout: 45000 }); R.getTitle = { ok: gt.ok, ms: gt.ms, out: P(gt.out).slice(0, 300) };
    const sn = await runN([...pin, 'snapshot'], { timeout: 45000 }); R.snapshot = { ok: sn.ok, ms: sn.ms, out: P(sn.out).slice(0, 300) };
    const dm = await runN([...pin, 'dialog', 'dismiss']); R.dismiss = { ok: dm.ok, ms: dm.ms, out: P(dm.out).slice(0, 200) };
    await sleep(800);
    const lst3 = (await getJson(cdpHttp + '/json/list')) || []; const pg3 = page && lst3.find((t) => t.id === page.id);
    R.afterDismiss = pg3 ? { url: P(pg3.url), title: pg3.title } : null;
    const gv = await runN([...pin, 'get', 'value', '#f'], { timeout: 20000 }); R.fieldAfterDismiss = P(gv.out).slice(0, 100);
    R.earlyEvents = early ? early.events.filter((e) => /Dialog/.test(e.method)).map((e) => ({ at: e.at, method: e.method, type: e.params.type, result: e.params.result })) : null;
    if (early) early.close();
    // alert with auto-dialog off
    await runN([...pin, 'open', U('/plain')]);
    const cl = await runN([...pin, 'click', '#b'], { timeout: 45000 }); R.alertClick = { ok: cl.ok, ms: cl.ms, out: P(cl.out).slice(0, 300) };
    const ds2 = await runN([...pin, '--json', 'dialog', 'status']); R.alertStatus = P(ds2.out).slice(0, 400);
    await runN([...pin, 'dialog', 'accept']);
    report.rounds.noauto = R;
    console.log(JSON.stringify(R, null, 1));
  }

  // ── every client that saw the dialog leaves: does Chrome end the dialog? ──
  if (want('orphan')) {
    const R = {};
    await run(ax.env, [...pin, 'open', U('/confirm')]);
    await run(ax.env, [...pin, 'click', '#b']);
    const ds = await run(ax.env, [...pin, '--json', 'dialog', 'status']); R.statusBefore = P(ds.out).slice(0, 300);
    const lst = (await getJson(cdpHttp + '/json/list')) || []; const page = lst.find((t) => t.type === 'page' && t.url.includes('/confirm'));
    for (const pid of leaseDaemons()) { try { process.kill(pid, 'SIGKILL'); } catch { /* */ } }
    await sleep(2000);
    const lst2 = (await getJson(cdpHttp + '/json/list')) || []; const pg = page && lst2.find((t) => t.id === page.id);
    R.titleAfterAllLeft = pg ? pg.title : null;
    const late = page ? pageSocket(page.webSocketDebuggerUrl, 'late') : null;
    if (late) { await late.opened; const e = await late.call('Page.enable'); R.lateEnable = e.timeout ? 'no answer in 5 s' : 'answered'; const ev = await late.call('Runtime.evaluate', { expression: 'document.title', returnByValue: true }); R.lateEvaluate = ev.timeout ? 'no answer' : (ev.result && ev.result.result && ev.result.result.value); late.close(); }
    report.rounds.orphan = R;
    console.log(JSON.stringify(R, null, 1));
  }

  // ── A WATCH ON THE BROWSER ENDPOINT (the product's candidate): Target.setDiscoverTargets + attachToTarget(flatten) +
  //    Page.enable per page, armed BEFORE the dialog. What a verb in flight looks like, and whether the watch's own
  //    session can answer (also after the lease's daemon is gone — the orphan the daemon cannot recover). ──
  if (want('watch')) {
    const R = {};
    const bws = new WebSocket(rec.cdpUrl, { perMessageDeflate: false });
    await new Promise((r) => bws.once('open', r));
    let bid = 0; const bwait = new Map(); const sessOf = new Map(); const ev = []; const t0 = Date.now();
    const bcall = (method, params = {}, sessionId) => new Promise((resolve) => { const i = ++bid; bwait.set(i, resolve); bws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) })); setTimeout(() => { if (bwait.has(i)) { bwait.delete(i); resolve({ timeout: true }); } }, 5000); });
    const attach = async (t) => { if (t.type !== 'page' || [...sessOf.values()].includes(t.targetId)) return; const a = await bcall('Target.attachToTarget', { targetId: t.targetId, flatten: true }); if (a.result) { sessOf.set(a.result.sessionId, t.targetId); const e = await bcall('Page.enable', {}, a.result.sessionId); ev.push({ at: Date.now() - t0, attach: t.targetId.slice(0, 6), enable: e.timeout ? 'timeout' : 'ok' }); } };
    bws.on('message', (d) => { let m; try { m = JSON.parse(String(d)); } catch { return; } if (m.id && bwait.has(m.id)) { bwait.get(m.id)(m); bwait.delete(m.id); return; } if (m.method === 'Target.targetCreated') attach(m.params.targetInfo); if (/Dialog/.test(m.method || '')) ev.push({ at: Date.now() - t0, method: m.method, target: (sessOf.get(m.sessionId) || '?').slice(0, 6), type: m.params.type, message: m.params.message, result: m.params.result }); if (m.method === 'Page.javascriptDialogOpening' && m.params.type === 'alert') bcall('Page.handleJavaScriptDialog', { accept: true }, m.sessionId).then((a) => ev.push({ at: Date.now() - t0, autoAcceptAlert: a.error ? a.error.message : 'ok' })); });
    await bcall('Target.setDiscoverTargets', { discover: true });
    const tl = await bcall('Target.getTargets'); for (const t of (tl.result && tl.result.targetInfos) || []) await attach(t);
    R.attachedPages = sessOf.size;
    // (1) beforeunload with a verb in flight
    await run(ax.env, [...pin, 'open', U('/form')]);
    await sleep(300);
    await run(ax.env, [...pin, 'click', '#f']); await run(ax.env, [...pin, 'type', '#f', 'draft text']);
    const navP = run(ax.env, [...pin, '--json', 'navigate', U('/after-watch')], { timeout: 70000 });
    const tNav = Date.now();
    let seen = null; for (let i = 0; i < 100 && !(seen = ev.find((e) => e.method === 'Page.javascriptDialogOpening' && e.type === 'beforeunload')); i++) await sleep(20);
    R.watchSawBeforeunloadAfterMs = seen ? (t0 + seen.at) - tNav : null;
    const ds = await run(ax.env, [...pin, '--json', 'dialog', 'status']); R.dialogStatusInFlight = P(ds.out).slice(0, 400);
    const lst = (await getJson(cdpHttp + '/json/list')) || []; const pg = lst.find((t) => t.type === 'page' && /\/form|after-watch/.test(t.url));
    R.jsonListWhileHeld = pg ? { url: P(pg.url), title: pg.title } : null;
    const sessHeld = [...sessOf.entries()].find(([, tid]) => pg && tid === pg.id);
    const tAns = Date.now();
    const stay = sessHeld ? await bcall('Page.handleJavaScriptDialog', { accept: false }, sessHeld[0]) : null;
    R.watchDismiss = stay ? (stay.timeout ? 'timeout' : (stay.error ? stay.error.message : 'ok')) : 'no session';
    const nav = await navP;
    R.navigate = { ok: nav.ok, code: nav.code, ms: nav.ms, returnedAfterAnswerMs: Date.now() - tAns, out: P(nav.out).slice(0, 600) };
    await sleep(800);
    const lst2 = (await getJson(cdpHttp + '/json/list')) || []; const pg2 = pg && lst2.find((t) => t.id === pg.id);
    R.afterWatchDismiss = pg2 ? { url: P(pg2.url), title: pg2.title } : null;
    const gv = await run(ax.env, [...pin, 'get', 'value', '#f'], { timeout: 40000 }); R.fieldKept = { ms: gv.ms, out: P(gv.out).slice(0, 120) };
    // (2) the same hold, then the lease's daemon is killed (the orphan): the watch answers accept = leave
    const navP2 = run(ax.env, [...pin, '--json', 'navigate', U('/after-watch-2')], { timeout: 70000 });
    await sleep(1500);
    for (const pid of leaseDaemons()) { try { process.kill(pid, 'SIGKILL'); } catch { /* */ } }
    const nav2 = await navP2; R.navigateWhoseDaemonDied = { ok: nav2.ok, ms: nav2.ms, out: P(nav2.out).slice(0, 200) };
    await sleep(500);
    const leave = sessHeld ? await bcall('Page.handleJavaScriptDialog', { accept: true }, sessHeld[0]) : null;
    R.watchAcceptOrphan = leave ? (leave.timeout ? 'timeout' : (leave.error ? leave.error.message : 'ok')) : 'no session';
    await sleep(1200);
    const lst3 = (await getJson(cdpHttp + '/json/list')) || []; const pg3 = pg && lst3.find((t) => t.id === pg.id);
    R.afterWatchAcceptOrphan = pg3 ? { url: P(pg3.url), title: pg3.title } : null;
    const gt = await run(ax.env, [...pin, 'get', 'title'], { timeout: 40000 }); R.newDaemonAfterRescue = { ms: gt.ms, out: P(gt.out).slice(0, 120) };
    // (3) alert with the watch: held until someone answers?
    await run(ax.env, [...pin, 'open', U('/plain')]); await sleep(300);
    const cl = await run(ax.env, [...pin, 'click', '#b']); R.alertClick = { ms: cl.ms, out: P(cl.out).slice(0, 200) };
    await sleep(1000);
    const ds3 = await run(ax.env, [...pin, '--json', 'dialog', 'status']); R.alertStatusAfter1s = P(ds3.out).slice(0, 200);
    await run(ax.env, [...pin, 'dialog', 'accept']);
    R.events = ev;
    try { bws.close(); } catch { /* */ }
    report.rounds.watch = R;
    console.log(JSON.stringify(R, null, 1));
  }

  // ── THE UPDATE: a keeper whose browsers run with auto-dialog ON gets `noAutoDialog` in its configs (the user file
  //    changes; the keeper re-composes machine.json + its launch file on its next call). Does the lease's daemon
  //    restart, does the keeper's Chrome relaunch, and does the new behaviour take effect? ──
  if (want('flip')) {
    const R = {};
    const lc = (out) => { try { const j = JSON.parse(out.trim().split('\n').pop()); const l = (j.data && j.data.lifecycle) || {}; return { restartedBackground: l.restartedBackground, relaunchedBrowser: l.relaunchedBrowser }; } catch { return out.slice(0, 200); } };
    const chromeOf = () => { const b = kk.browserOf(prof.id); return b && b.browser ? b.browser.pid : null; };
    await run(ax.env, [...pin, 'open', U('/form')]);
    const d0 = leaseDaemons(), c0 = chromeOf(), k0 = kk.browserOf(prof.id).pid;
    fs.writeFileSync(path.join(KH, '.agent-browser', 'config.json'), JSON.stringify({ noAutoDialog: true }));
    const cfg2 = kk.configFileFor({ ephemeral: false });
    R.leaseConfigNamesKey = (() => { try { return JSON.parse(fs.readFileSync(cfg2, 'utf8')).noAutoDialog === true; } catch { return null; } })();
    const t1 = await run(ax.env, [...pin, '--json', 'get', 'url']);
    R.leaseAfterFlip = { lifecycle: lc(t1.out), sameDaemon: JSON.stringify(leaseDaemons()) === JSON.stringify(d0) };
    let kerr = null; try { await kk.start(prof.id, { why: 'measure: a keeper call after the flip' }); } catch (e) { kerr = e.message; }
    let cdpAgain = null; try { cdpAgain = await kk.leaseCdpUrl?.(prof.id); } catch (e) { cdpAgain = 'err ' + e.message; }
    R.keeperAfterFlip = { err: kerr, sameKeeperDaemon: kk.browserOf(prof.id).pid === k0, sameChrome: chromeOf() === c0, chromeAlive: Ff.pidAlive(c0) };
    await run(ax.env, [...pin, 'click', '#f']); await run(ax.env, [...pin, 'type', '#f', 'x']);
    const nav = await run(ax.env, [...pin, '--json', 'navigate', U('/after-flip')], { timeout: 70000 });
    R.beforeunloadAfterFlip = { ms: nav.ms, out: P(nav.out).slice(0, 300) };
    await run(ax.env, [...pin, 'dialog', 'accept']);
    report.rounds.flip = R;
    console.log(JSON.stringify(R, null, 1));
  }

  // ── prompt: defaultPrompt + an answer with text ──
  if (want('prompt')) {
    const R = {};
    await run(ax.env, [...pin, 'open', `data:text/html,<title>PROMPT</title><button id=b onclick="document.title = 'GOT:' + prompt('Name the file', 'draft.txt')">p</button>`]);
    const cl = await run(ax.env, [...pin, 'click', '#b']); R.click = P(cl.out).slice(0, 300);
    const ds = await run(ax.env, [...pin, '--json', 'dialog', 'status']); R.status = P(ds.out).slice(0, 400);
    const a = await run(ax.env, [...pin, 'dialog', 'accept', 'final.txt']); R.accept = P(a.out).slice(0, 200);
    await sleep(500);
    const t = await run(ax.env, [...pin, 'get', 'title']); R.title = P(t.out).slice(0, 100);
    report.rounds.prompt = R;
    console.log(JSON.stringify(R, null, 1));
  }
} catch (e) {
  report.error = String(e && e.stack || e);
  console.error(report.error);
} finally {
  try { await kk.shutdown?.(); } catch { /* */ }
  srv.close();
}
if (OUT) fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
cleanup();
process.exit(0);
