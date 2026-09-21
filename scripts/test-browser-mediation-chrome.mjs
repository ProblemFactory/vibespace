#!/usr/bin/env node
// AGENT BROWSER P6 — HARD MEDIATION, THE REAL CHROME (design §6.2 / §6.5 / D6;
// the §10 P6 row's exit: "a second session cannot reach a tab outside its
// target scope through the mediated URL"). Heavy tier: one headless chrome
// (+ the real agent-browser when installed), per-pid scratch paths, free ports.
//
//   ① a REAL headless chrome behind the real proxy, two grants (A holds tab A,
//      B holds tab B), raw CDP clients: through B's url `Target.getTargets`
//      lists only B, `attachToTarget(A)` / `closeTarget(A)` are
//      target_out_of_scope, B navigates its own tab, a takeover turns B's
//      navigate / Input.* into browser_paused while `Runtime.evaluate` still
//      answers, B creates a tab and sees it, `Browser.close` is method_refused,
//      A's page endpoint for B's tab is 403 — and the browser's OWN target
//      list shows A's tab untouched throughout; revoke closes B's tabs and
//      leaves A's;
//   ② the REAL agent-browser (≥ 0.32) as two SESSIONS on that chrome, each
//      through its own mediated url in its own namespace: A opens a page, B
//      opens two; B's `tab list` shows only B's, A's only A's, the browser
//      holds all three; a takeover of B makes B's `open` and `click` fail
//      with the typed `browser_paused` INSIDE agent-browser's own JSON while
//      `get title` still answers; after the handback B works again.
// SKIPs with evidence when no chrome / no agent-browser / a launch fails.
// cdp-protocol-under-test — every 'Page.navigate' here is a CDP message judged
// by the proxy against a real chrome, never a navigation of VibeSpace's page.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn, execFile, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, freePort } from './scratch.mjs';
const require = createRequire(import.meta.url);
const M = require('../src/browser-mediation.js');
const MED = require('../src/server/cdp-mediator.js');
const { WebSocket } = require('ws');

let pass = 0, fail = 0, skipped = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + String(extra).slice(0, 600) : '')); } return !!c; };
const skip = (n) => { skipped++; console.log('  ⊘ SKIP ' + n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ROOT = scratch('browser-mediation-chrome');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const HOME = path.join(ROOT, 'home'); fs.mkdirSync(HOME, { recursive: true });
const NS_PREFIX = `vs-mediation-${process.pid}-`;
const procs = new Set();
/** The daemons THIS run spawned: found by the namespace this pid minted,
 *  read off our own children's environ — never anybody else's. */
function reapDaemons() {
  for (const d of fs.readdirSync('/proc').filter((x) => /^\d+$/.test(x))) {
    try {
      const env = fs.readFileSync(`/proc/${d}/environ`, 'utf8');
      if (!env.includes(`AGENT_BROWSER_NAMESPACE=${NS_PREFIX}`)) continue;
      if (!fs.readFileSync(`/proc/${d}/cmdline`, 'utf8').includes('agent-browser')) continue;
      process.kill(Number(d), 'SIGKILL');
    } catch { /* not ours / gone */ }
  }
}
/** Chrome is spawned in its OWN process group and killed as a group: a
 *  SIGKILLed browser process leaves its network utility child alive for a
 *  moment, and that child re-creates `Network Persistent State` under the
 *  user-data-dir AFTER the rm (measured: four scratch dirs left behind). So:
 *  kill the group, wait synchronously (cleanup runs on 'exit'), then remove
 *  with retries. */
const sleepSync = (ms) => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch { /* none */ } };
function cleanup() {
  reapDaemons();
  for (const p of procs) { try { process.kill(-p.pid, 'SIGKILL'); } catch { try { p.kill('SIGKILL'); } catch { /* gone */ } } }
  for (let i = 0; i < 5; i++) { sleepSync(i ? 250 : 400); try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { /* retry */ } if (!fs.existsSync(ROOT)) break; }
  if (fs.existsSync(ROOT)) console.error(`  ! scratch ${ROOT} could not be removed`);
}
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(130); });

const getJson = (url) => new Promise((res) => http.get(url, (r) => { let b = ''; r.on('data', (c) => b += c); r.on('end', () => { let j = null; try { j = JSON.parse(b); } catch { j = null; } res({ status: r.statusCode, json: j, raw: b }); }); }).on('error', (e) => res({ status: 0, error: e.message })));
function cdpClient(url) {
  const ws = new WebSocket(url); let id = 0; const waits = new Map(); const events = [];
  ws.on('message', (d) => { const m = JSON.parse(String(d)); if (m.id != null && waits.has(m.id)) { waits.get(m.id)(m); waits.delete(m.id); } else if (m.id == null) events.push(m); });
  const call = (method, params = {}, sessionId) => new Promise((res) => { const i = ++id; waits.set(i, res); ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) })); });
  const closed = new Promise((r) => ws.on('close', (c, reason) => r({ code: c, reason: String(reason) })));
  return { ws, call, events, closed, open: new Promise((r, j) => { ws.once('open', r); ws.once('error', j); }) };
}
const upgradeStatus = (url) => new Promise((res) => { const w = new WebSocket(url); w.on('unexpected-response', (_, r) => { res(r.statusCode); w.terminate(); }); w.on('open', () => { res('open'); w.close(); }); w.on('error', (e) => res('err ' + e.message)); });

const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
async function launchChrome() {
  const port = await freePort();
  const dir = path.join(ROOT, 'chrome'); fs.mkdirSync(dir, { recursive: true });
  const c = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', `--user-data-dir=${dir}`, '--window-size=1024,768', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'], detached: true });
  procs.add(c);
  let err = ''; c.stderr.on('data', (d) => { if (err.length < 4000) err += d; });
  let ver = null;
  for (let i = 0; i < 150 && !ver; i++) { const r = await getJson(`http://127.0.0.1:${port}/json/version`); if (r.status === 200 && r.json && r.json.webSocketDebuggerUrl) ver = r.json; else await sleep(100); }
  return { chrome: c, port, ver, err };
}

// ═══ ① raw CDP through two grants on a real chrome ═══════════════════════════
console.log('— ① a real headless chrome behind the proxy: B cannot reach A\'s tab through its url');
let world = null;
if (!CHROME) skip('no chrome/chromium on this box — the real-chrome legs need one');
else {
  world = await launchChrome();
  if (!world.ver) { skip(`chrome did not answer /json/version here: ${world.err.slice(0, 300)}`); world = null; }
}
let med = null, gA = null, gB = null, raw = null, A = null, Bt = null;
const paused = { a: false, b: false };
if (world) {
  const { ver } = world;
  console.log(`  (chrome: ${ver.Browser})`);
  raw = cdpClient(ver.webSocketDebuggerUrl); await raw.open;
  A = (await raw.call('Target.createTarget', { url: 'data:text/html,<title>alpha</title>' })).result.targetId;
  Bt = (await raw.call('Target.createTarget', { url: 'data:text/html,<title>bravo</title>' })).result.targetId;
  const logs = [];
  med = MED.create({ log: { log: (s) => logs.push(String(s)), warn: (s) => logs.push('W ' + String(s)) } });
  gA = await med.grantFor({ profileId: 'bp-0000000a', browserKey: 'bk-0000000a', upstream: ver.webSocketDebuggerUrl, targetIds: [A], paused: () => paused.a });
  gB = await med.grantFor({ profileId: 'bp-0000000a', browserKey: 'bk-0000000b', upstream: ver.webSocketDebuggerUrl, targetIds: [Bt], paused: () => paused.b });
  ok(gA.url !== gB.url && !logs.some((l) => l.includes(gA.token) || l.includes(gB.token) || l.includes(String(world.port))), 'two leases, two urls; no log line carries a token or the raw port');
  const v = await getJson(gB.httpBase + '/json/version');
  ok(v.status === 200 && v.json.Browser === ver.Browser && v.json.webSocketDebuggerUrl === gB.url && !v.raw.includes(`:${world.port}/`), '/json/version through B\'s url names the real browser and B\'s endpoint, never the raw one');
  const l = await getJson(gB.httpBase + '/json/list');
  ok(l.status === 200 && Array.isArray(l.json) && l.json.length === 1 && l.json[0].id === Bt && l.json[0].webSocketDebuggerUrl === gB.url.replace('/devtools/browser', '/devtools/page/' + Bt), '/json/list through B\'s url: only B\'s tab, its endpoint re-pointed', l.raw);
  const cB = cdpClient(gB.url); await cB.open;
  const seen = (await cB.call('Target.getTargets')).result.targetInfos.map((t) => t.targetId);
  ok(seen.join() === Bt, `B's Target.getTargets lists only B's tab (chrome itself holds ${(await raw.call('Target.getTargets')).result.targetInfos.filter((t) => t.type === 'page').length} pages)`);
  ok(M.refusalCodeOf(await cB.call('Target.attachToTarget', { targetId: A, flatten: true })) === 'target_out_of_scope' && M.refusalCodeOf(await cB.call('Target.closeTarget', { targetId: A })) === 'target_out_of_scope' && M.refusalCodeOf(await cB.call('Target.activateTarget', { targetId: A })) === 'target_out_of_scope', 'B cannot attach / close / activate A\'s tab: target_out_of_scope');
  const att = await cB.call('Target.attachToTarget', { targetId: Bt, flatten: true });
  const sid = att.result && att.result.sessionId;
  ok(!!sid, 'B attaches its own tab');
  const nav = await cB.call('Page.navigate', { url: 'data:text/html,<title>bravo-2</title>' }, sid);
  ok(!!(nav.result && nav.result.frameId), 'B navigates its own tab');
  await sleep(150);
  ok((await cB.call('Runtime.evaluate', { expression: 'document.title' }, sid)).result.result.value === 'bravo-2', '…and reads the new title');
  paused.b = true;
  ok(M.refusalCodeOf(await cB.call('Page.navigate', { url: 'data:text/html,<title>x</title>' }, sid)) === 'browser_paused' && M.refusalCodeOf(await cB.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 }, sid)) === 'browser_paused' && M.refusalCodeOf(await cB.call('Input.insertText', { text: 'x' }, sid)) === 'browser_paused', 'while the user holds B: navigate and Input.* are browser_paused');
  ok((await cB.call('Runtime.evaluate', { expression: 'document.title' }, sid)).result.result.value === 'bravo-2', '…a read still answers, and the page did not move');
  paused.b = false;
  ok((await cB.call('Target.setDiscoverTargets', { discover: true })).result !== undefined && !cB.events.some((e) => e.method === 'Target.targetCreated' && e.params.targetInfo.targetId === A), 'B turns discovery on and the burst of announcements never names A\'s tab');
  const created = await cB.call('Target.createTarget', { url: 'data:text/html,<title>bravo-new</title>' });
  const C = created.result && created.result.targetId;
  ok(!!C && cB.events.some((e) => e.method === 'Target.targetCreated' && e.params.targetInfo.targetId === C), 'B creates a tab and sees its targetCreated (replayed — Chrome announced it before the reply)');
  ok((await cB.call('Target.getTargets')).result.targetInfos.map((t) => t.targetId).sort().join() === [Bt, C].sort().join(), 'B now sees exactly its two tabs');
  ok(M.refusalCodeOf(await cB.call('Browser.close')) === 'method_refused', 'Browser.close through B\'s url is method_refused (the browser lives)');
  ok((await upgradeStatus(gA.url.replace('/devtools/browser', '/devtools/page/' + Bt))) === 403 && (await upgradeStatus(gA.url.replace('/devtools/browser', '/devtools/page/' + A))) === 'open', 'A\'s page endpoint for B\'s tab is 403; for its own it opens');
  const cA = cdpClient(gA.url); await cA.open;
  ok(M.refusalCodeOf(await cA.call('Target.closeTarget', { targetId: Bt })) === 'target_out_of_scope' && M.refusalCodeOf(await cA.call('Target.closeTarget', { targetId: C })) === 'target_out_of_scope', 'A cannot close B\'s tabs either (symmetry)');
  const rawPages = (await raw.call('Target.getTargets')).result.targetInfos.filter((t) => t.type === 'page');
  ok(rawPages.find((t) => t.targetId === A).title === 'alpha' && rawPages.find((t) => t.targetId === Bt).title === 'bravo-2' && rawPages.some((t) => t.targetId === C), 'the browser\'s own list: A untouched (alpha), B moved by B only, B\'s new tab present');
  const rv = med.revoke({ profileId: 'bp-0000000a', browserKey: 'bk-0000000b' });
  const c2 = await cB.closed;
  const closing = await rv.closing;
  await sleep(200);
  const after = (await raw.call('Target.getTargets')).result.targetInfos.filter((t) => t.type === 'page').map((t) => t.targetId);
  ok(c2.code === 1008 && closing.closed === 2 && !after.includes(Bt) && !after.includes(C) && after.includes(A), 'revoking B closes its connection 1008 and its TWO tabs in the browser; A\'s tab stays');
  cA.ws.close();
}

// ═══ ② the real agent-browser as two sessions through two mediated urls ═════
console.log('— ② the real agent-browser: two sessions, two urls, one chrome — each sees only its own tabs; a takeover is a typed refusal in the CLI\'s own JSON');
let AB = null;
try { const v = execFileSync('agent-browser', ['--version'], { encoding: 'utf8', timeout: 8000, env: { ...process.env, HOME } }).trim(); const m = /(\d+)\.(\d+)\.(\d+)/.exec(v); if (m && (Number(m[1]) > 0 || Number(m[2]) >= 32)) AB = v; else skip(`agent-browser ${v} is below the 0.32 floor`); } catch (e) { skip(`no agent-browser on PATH (${String(e.message).slice(0, 80)})`); }
if (!world) skip('no chrome for the agent-browser legs');
else if (AB) {
  const { ver } = world;
  console.log(`  (${AB})`);
  const g1 = await med.grantFor({ profileId: 'bp-0000000c', browserKey: 'bk-0000000c', upstream: ver.webSocketDebuggerUrl, paused: () => paused.a });
  const g2 = await med.grantFor({ profileId: 'bp-0000000c', browserKey: 'bk-0000000d', upstream: ver.webSocketDebuggerUrl, paused: () => paused.b });
  paused.a = false; paused.b = false;
  const envFor = (k, g) => ({ ...process.env, HOME, AGENT_BROWSER_SESSION: 'vs-bk-0000000' + k, AGENT_BROWSER_NAMESPACE: NS_PREFIX + k, AGENT_BROWSER_CDP: g.url, AGENT_BROWSER_IDLE_TIMEOUT_MS: '120000', AGENT_BROWSER_JSON: '1' });
  const ab = (k, g, args) => new Promise((res) => execFile('agent-browser', args, { env: envFor(k, g), encoding: 'utf8', timeout: 45000 }, (e, so, se) => { let j = null; try { j = JSON.parse(String(so).trim().split('\n').filter(Boolean).pop()); } catch { j = null; } res({ ok: !e, json: j, out: String(so).slice(0, 400), err: String(se || (e && e.message) || '').slice(0, 400) }); }));
  const titles = (r) => (r.json && r.json.data && Array.isArray(r.json.data.tabs) ? r.json.data.tabs.map((t) => t.title) : null);
  const o1 = await ab('c', g1, ['open', 'data:text/html,<title>charlie</title>']);
  if (!o1.ok) skip(`the real agent-browser did not open through the mediated url: ${o1.err || o1.out}`);
  else {
    ok(o1.json && o1.json.success === true && o1.json.data && o1.json.data.title === 'charlie', 'session C opens a page through its mediated url (the real daemon, the real chrome)');
    const o2 = await ab('d', g2, ['open', 'data:text/html,<title>delta</title>']);
    const o3 = await ab('d', g2, ['tab', 'new', 'data:text/html,<title>delta-2</title>']);
    ok(o2.ok && o3.ok, 'session D opens a page and a second tab through ITS url');
    const tC = titles(await ab('c', g1, ['tab', 'list'])), tD = titles(await ab('d', g2, ['tab', 'list']));
    ok(Array.isArray(tC) && tC.length === 1 && /charlie/.test(tC[0]) && !tC.some((t) => /delta/.test(t)), `C's tab list is C's alone (${JSON.stringify(tC)})`);
    ok(Array.isArray(tD) && tD.length === 2 && tD.every((t) => /delta/.test(t)) && !tD.some((t) => /charlie/.test(t)), `D's tab list is D's alone (${JSON.stringify(tD)})`);
    const pages = (await raw.call('Target.getTargets')).result.targetInfos.filter((t) => t.type === 'page').map((t) => t.title);
    ok(pages.includes('charlie') && pages.includes('delta') && pages.includes('delta-2'), `the browser holds all three (${JSON.stringify(pages)})`);
    paused.b = true;
    const po = await ab('d', g2, ['open', 'data:text/html,<title>nope</title>']);
    const pc = await ab('d', g2, ['click', 'body']);
    const pt = await ab('d', g2, ['get', 'title']);
    ok(!po.ok && po.json && po.json.success === false && /browser_paused/.test(po.json.error) && /Page\.navigate/.test(po.json.error), 'a takeover of D: `open` fails with the typed browser_paused inside agent-browser\'s own JSON');
    ok(!pc.ok && pc.json && /browser_paused/.test(pc.json.error) && /Input\./.test(pc.json.error), '`click` too (Input.* refused)');
    ok(pt.ok && pt.json && pt.json.success === true, '…while `get title` still answers (a read)');
    paused.b = false;
    const after = await ab('d', g2, ['open', 'data:text/html,<title>delta-3</title>']);
    ok(after.ok && after.json && after.json.data && after.json.data.title === 'delta-3', 'handed back: D drives again');
    const cpages = (await raw.call('Target.getTargets')).result.targetInfos.filter((t) => t.type === 'page').map((t) => t.title);
    ok(cpages.includes('charlie') && !cpages.includes('nope'), 'C\'s page was never touched and the refused navigation never happened');
    const ca = await ab('d', g2, ['close', '--all']);
    await sleep(300);
    const kept = (await raw.call('Target.getTargets')).result.targetInfos.filter((t) => t.type === 'page').map((t) => t.title);
    ok(ca.ok && kept.includes('charlie'), `D's close --all never reaches Browser.close: C's page survives (${JSON.stringify(kept)})`);
    const rv = med.revoke({ profileId: 'bp-0000000c', browserKey: 'bk-0000000d' });
    const closing = await rv.closing;
    await sleep(300);
    const final = (await raw.call('Target.getTargets')).result.targetInfos.filter((t) => t.type === 'page').map((t) => t.title);
    ok(closing.closed >= 1 && !final.some((t) => /delta/.test(t)) && final.includes('charlie'), `revoking D's lease closes D's tabs in the browser and leaves C's (${JSON.stringify(final)})`);
  }
  reapDaemons();
}

if (med) med.shutdown();
if (raw) raw.ws.close();
cleanup();
console.log(fail ? `\n${fail} FAILED (${pass} passed${skipped ? ', ' + skipped + ' skipped' : ''})` : `\nALL PASS (${pass}${skipped ? ', ' + skipped + ' skipped' : ''})`);
process.exit(fail ? 1 : 0);
