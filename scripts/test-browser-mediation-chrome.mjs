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
//   ③ r1/r2 (takeover): the real binary's own answers the router and the CLI stand
//      on — every `get … cdp-url` spelling run for real (a boolean flag's optional
//      true/false included) with the router held to it, `get attr #e cdp-url`
//      a read; the env twins; the socket root (another SOCKET_DIR = another
//      daemon; through vibespace-browser the answer's root wins, the decoys stay
//      empty). r3: the router's global-flag tables re-MEASURED on the installed
//      binary (scripts/browser-flag-census.mjs) and every measured flag fuzzed
//      between `get` and `cdp-url` (the verifier's `--idle-timeout 5m`
//      included); the CONFIG-FILE twin (a project `agent-browser.json` in the
//      agent's directory never reaches a sanctioned command); the suite's own
//      base env carries no AGENT_BROWSER_* of the shell it runs in. r4: the
//      navigation road — bare, `open chrome://version` + `open file://…/Dev
//      ToolsActivePort` (and a crafted `state load`) print what `get cdp-url`
//      is refused for (the control); through vibespace-browser each is refused
//      locally; the stdin batch (bare plain lines are the binary's own `Invalid
//      JSON input`; through the CLI both forms run).
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
const REPO = new URL('..', import.meta.url).pathname;
const M = require('../src/browser-mediation.js');
const MED = require('../src/server/cdp-mediator.js');
const { WebSocket } = require('ws');

let pass = 0, fail = 0, skipped = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + String(extra).slice(0, 600) : '')); } return !!c; };
const skip = (n) => { skipped++; console.log('  ⊘ SKIP ' + n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// r3: the suite's OWN base environment carries no AGENT_BROWSER_* — a VibeSpace session shell (where this
// gate is run from, and where the pre-push hook launches the heavy tier) exports its spawn pairs, including
// AGENT_BROWSER_CONFIG, which REPLACES the binary's config search: every run below read the live instance's
// generated config until this line
const BASE_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('AGENT_BROWSER_')));
const ROOT = scratch('browser-mediation-chrome');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const HOME = path.join(ROOT, 'home'); fs.mkdirSync(HOME, { recursive: true });
// r4 (takeover finding 2): vibespace-browser reads the ACCOUNT's home off its passwd entry, never $HOME — a
// run whose scratch HOME stands in for the account's injects the passwd answer with a preload (the path baked
// in, read from no environment); the CLI never sees the developer's real home
const cliUnder = (home) => { const f = path.join(ROOT, `passwd-${path.basename(home)}.cjs`); fs.writeFileSync(f, `const os = require('os'); const real = os.userInfo; os.userInfo = (o) => ({ ...real(o), homedir: ${JSON.stringify(home)} });\n`); return ['--require', f, path.join(REPO, 'data/bin/vibespace-browser')]; };
const SOCK3 = scratch('mc3'); // r3 ③: a short socket root for the config legs' daemons (removed in cleanup)
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
/** r2: the daemons' own directories under the machine's socket root — `<XDG>/agent-browser/namespaces/
 *  <this run's prefix>*` (the HOME root is inside ROOT) — were left behind by every run (127 of them
 *  on the dev box); only this pid's minted prefix is ever removed. */
function reapNamespaceDirs() {
  const xdg = process.env.XDG_RUNTIME_DIR;
  if (!xdg) return;
  const nsRoot = path.join(xdg, 'agent-browser', 'namespaces');
  let names = []; try { names = fs.readdirSync(nsRoot); } catch { return; }
  for (const n of names) if (n.startsWith(NS_PREFIX)) { try { fs.rmSync(path.join(nsRoot, n), { recursive: true, force: true }); } catch { /* next run */ } }
}
function cleanup() {
  reapDaemons();
  reapNamespaceDirs();
  for (const p of procs) { try { process.kill(-p.pid, 'SIGKILL'); } catch { try { p.kill('SIGKILL'); } catch { /* gone */ } } }
  try { fs.rmSync(SOCK3, { recursive: true, force: true }); } catch { /* next run */ }
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
try { const v = execFileSync('agent-browser', ['--version'], { encoding: 'utf8', timeout: 8000, env: { ...BASE_ENV, HOME } }).trim(); const m = /(\d+)\.(\d+)\.(\d+)/.exec(v); if (m && (Number(m[1]) > 0 || Number(m[2]) >= 32)) AB = v; else skip(`agent-browser ${v} is below the 0.32 floor`); } catch (e) { skip(`no agent-browser on PATH (${String(e.message).slice(0, 80)})`); }
// r3 (finding 1): the router's flag tables are a MEASUREMENT of the binary, not of its --help — re-measured
// here on the INSTALLED binary (launch-free: `<flag> zzq9 session list` for every flag-shaped string in it).
// An upgrade that adds or re-types a global flag fails this leg by name until the tables follow it.
if (AB) {
  const V = require('../src/browser-verbs.js');
  const { measureGlobalFlags } = await import('./browser-flag-census.mjs');
  const bin = execFileSync('sh', ['-c', 'command -v agent-browser'], { encoding: 'utf8', env: BASE_ENV }).trim();
  const cdir = path.join(ROOT, 'flag-census'); fs.mkdirSync(cdir, { recursive: true });
  const m = await measureGlobalFlags(bin, { dir: cdir, env: BASE_ENV });
  const GF = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/browser-verbs/global-flags-0.32.0.json'), 'utf8'));
  const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  const cfgValue = (m.other || []).some((o) => o.flag === '--config' && /config file not found: zzq9/.test(o.said));
  const diff = { valueMissing: m.value.filter((f) => !V.VALUE_FLAGS.includes(f)), valueExtra: V.VALUE_FLAGS.filter((f) => !m.value.includes(f) && !(f === '--config' && cfgValue)), boolMissing: m.bool.filter((f) => !V.BOOL_FLAGS.includes(f)), boolExtra: V.BOOL_FLAGS.filter((f) => !m.bool.includes(f)) };
  ok(m.candidates >= 500 && m.value.length >= 30 && Object.values(diff).every((x) => !x.length), `r3: the INSTALLED binary (${m.version}) measured — ${m.candidates} flag-shaped strings, ${m.value.length} value / ${m.bool.length} boolean global flags — equals the router's VALUE_FLAGS / BOOL_FLAGS (${m.ms} ms)`, JSON.stringify(diff));
  if (m.version === GF.version) ok(same(m.value, GF.value) && same(m.bool, GF.bool), `r3: …and the checked-in fixture the fast gate reads (${GF.version}) is this measurement`, JSON.stringify({ value: m.value, bool: m.bool }));
  else skip(`the installed binary is ${m.version}, the checked-in fixture ${GF.version} — the table was compared above; re-run \`node scripts/browser-flag-census.mjs --write scripts/fixtures/browser-verbs/global-flags-${m.version}.json\` to record it`);
  fs.rmSync(cdir, { recursive: true, force: true });
}
if (!world) skip('no chrome for the agent-browser legs');
else if (AB) {
  const { ver } = world;
  console.log(`  (${AB})`);
  const g1 = await med.grantFor({ profileId: 'bp-0000000c', browserKey: 'bk-0000000c', upstream: ver.webSocketDebuggerUrl, paused: () => paused.a });
  const g2 = await med.grantFor({ profileId: 'bp-0000000c', browserKey: 'bk-0000000d', upstream: ver.webSocketDebuggerUrl, paused: () => paused.b });
  paused.a = false; paused.b = false;
  const envFor = (k, g) => ({ ...BASE_ENV, HOME, AGENT_BROWSER_SESSION: 'vs-bk-0000000' + k, AGENT_BROWSER_NAMESPACE: NS_PREFIX + k, AGENT_BROWSER_CDP: g.url, AGENT_BROWSER_IDLE_TIMEOUT_MS: '120000', AGENT_BROWSER_JSON: '1' });
  const envPairsOf = (k, g) => [`AGENT_BROWSER_SESSION=vs-bk-0000000${k}`, `AGENT_BROWSER_NAMESPACE=${NS_PREFIX}${k}`, `AGENT_BROWSER_CDP=${g.url}`, 'AGENT_BROWSER_IDLE_TIMEOUT_MS=120000'];
  const ab = (k, g, args) => new Promise((res) => execFile('agent-browser', args, { env: envFor(k, g), encoding: 'utf8', timeout: 45000 }, (e, so, se) => { let j = null; try { j = JSON.parse(String(so).trim().split('\n').filter(Boolean).pop()); } catch { j = null; } res({ ok: !e, json: j, out: String(so).slice(0, 400), err: String(se || (e && e.message) || '').slice(0, 400) }); }));
  const titles = (r) => (r.json && r.json.data && Array.isArray(r.json.data.tabs) ? r.json.data.tabs.map((t) => t.title) : null);
  const o1 = await ab('c', g1, ['open', 'data:text/html,<title>charlie</title><div id=e cdp-url=zzz>hi</div><cdp-url>tagtext</cdp-url>']);
  if (!o1.ok) skip(`the real agent-browser did not open through the mediated url: ${o1.err || o1.out}`);
  else {
    ok(o1.json && o1.json.success === true && o1.json.data && o1.json.data.title === 'charlie', 'session C opens a page through its mediated url (the real daemon, the real chrome)');
    // ③ r1 (takeover findings 1 + 2) — the REAL-binary controls the fast suite's fake binary stands on:
    // 0.32.0 reads global flags BETWEEN the verb and its noun (so `get --json cdp-url` is the raw
    // endpoint the router must refuse), and it HONOURS an env twin of a refused flag (so the shell's
    // AGENT_BROWSER_* keys must never reach it through vibespace-browser)
    const fj = await ab('c', g1, ['get', '--json', 'cdp-url']);
    const fk = await ab('c', g1, ['get', 'cdp-url', '--json']);
    ok(fj.ok && fj.json && fj.json.success === true && fj.json.data && /^wss?:\/\//.test(String(fj.json.data.cdpUrl || '')) && fk.ok && fk.json && fk.json.data && fk.json.data.cdpUrl, 'CONTROL (r1): the real binary answers `get --json cdp-url` AND `get cdp-url --json` with the raw endpoint — a flag between the verb and its noun hides nothing', JSON.stringify([fj, fk]));
    const V = require('../src/browser-verbs.js');
    ok(['get --json cdp-url', 'get -c cdp-url', 'get cdp-url --json'].every((l) => V.classify(l.split(' ')).code === 'raw_cdp_refused'), '…and the router refuses every one of those spellings');
    // r2 (takeover finding 1) THE ORACLE: every spelling through the REAL binary, the router held to its
    // answer — a spelling that printed an endpoint MUST be refused (a boolean flag's optional `true`/`false`
    // included), and `cdp-url` as an attribute NAME or a SELECTOR is a read the router must pass
    {
      // r3 (finding 1, MAJOR): the verifier's `get --idle-timeout 5m cdp-url` (a global value flag the help
      // documents only as an env var) + EVERY measured global flag the router lets through its flag rules,
      // between `get` and the noun (a value flag with a benign value, a boolean bare and with `true`), + a
      // flag of unknown arity, + nouns that are not `get` reads
      const GF = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/browser-verbs/global-flags-0.32.0.json'), 'utf8'));
      const benign = { '--headers': '{}', '--model': 'x', '--device': 'x', '--max-output': '400', '--screenshot-dir': ROOT, '--screenshot-format': 'png', '--screenshot-quality': '50', '--idle-timeout': '5m' };
      const passesFlags = (f) => !V.IDENTITY_FLAGS.includes(f) && !V.RAW_CDP_FLAGS.includes(f) && !V.LAUNCH_FLAGS.includes(f);
      const FUZZ = [['get', '--idle-timeout', '5m', 'cdp-url'],
        ...GF.value.filter((f) => passesFlags(f) || f === '--idle-timeout').map((f) => ['get', f, benign[f] || 'x', 'cdp-url']),
        ...GF.bool.filter(passesFlags).flatMap((f) => [['get', f, 'cdp-url'], ['get', f, 'true', 'cdp-url']]),
        ['get', '--newglobal', 'text', 'cdp-url'], ['is', 'cdp-url'], ['get', 'cdp_url'], ['get', 'ws-url']];
      const SPELL = [['get', 'cdp-url'], ['get', '--json', 'cdp-url'], ['get', 'cdp-url', '--json'], ['get', '--json', 'true', 'cdp-url'], ['get', '--debug', 'false', 'cdp-url'], ['get', '-v', 'true', 'cdp-url'],
        ['get', '--max-output', '400', 'cdp-url'], ['--json', 'true', 'get', 'cdp-url'], ['get', '-c', 'cdp-url'], ['get', '--json', 'TRUE', 'cdp-url'], ['get', 'attr', '#e', 'cdp-url'], ['get', 'text', 'cdp-url'], ['get', 'count', 'cdp-url'], ['get', 'attr', '#e', '--json', 'cdp-url'], ...FUZZ];
      const rows = [];
      for (const argv of SPELL) { const r = await ab('c', g1, argv); const blob = JSON.stringify(r.json) + r.out + r.err; rows.push({ argv: argv.join(' '), leaked: /wss?:\/\/[^\s"]+\/devtools\//.test(blob), verdict: V.classify(argv).kind, value: r.json && r.json.data ? JSON.stringify({ ...r.json.data, lifecycle: undefined }) : (r.out + r.err).slice(0, 160) }); }
      const unsound = rows.filter((r) => r.leaked && r.verdict !== 'refused');
      ok(rows.filter((r) => r.leaked).length >= 7 && unsound.length === 0, `r2 ORACLE: every spelling the real binary answers with an endpoint is refused by the router (${rows.filter((r) => r.leaked).length} leaking spellings; let through: ${unsound.map((r) => r.argv).join('; ') || 'none'})`, JSON.stringify(rows));
      const fz = rows.filter((r) => FUZZ.some((a) => a.join(' ') === r.argv));
      const idle = rows.find((r) => r.argv === 'get --idle-timeout 5m cdp-url');
      ok(idle && idle.leaked && idle.verdict === 'refused' && fz.length >= 30 && fz.filter((r) => r.leaked).length >= 20 && fz.every((r) => !r.leaked || r.verdict === 'refused'), `r3 ORACLE: \`get --idle-timeout 5m cdp-url\` IS the raw endpoint on the real binary and the router refuses it; so is every one of ${fz.filter((r) => r.leaked).length} measured-flag spellings that leak (of ${fz.length} run)`, JSON.stringify(fz.filter((r) => r.leaked !== (r.verdict === 'refused'))));
      const reads = rows.filter((r) => /^get (attr|text|count)\b/.test(r.argv));
      ok(reads.length === 4 && reads.every((r) => !r.leaked && r.verdict === 'page') && /zzz/.test(reads[0].value) && /tagtext/.test(reads[1].value), 'r2 ORACLE: `get attr #e cdp-url` (the attribute NAMED cdp-url ⇒ zzz), `get text cdp-url` (a <cdp-url> element) and `count` print no endpoint — and the router passes them', JSON.stringify(reads));
    }
    const twinDirect = await new Promise((res) => execFile('agent-browser', ['get', 'title'], { env: { ...envFor('t', g1), AGENT_BROWSER_CDP: 'http://127.0.0.1:1' }, encoding: 'utf8', timeout: 45000 }, (e, so, se) => res({ ok: !e, text: String(so) + String(se || (e && e.message) || '') })));
    ok(!twinDirect.ok && /127\.0\.0\.1:1\b/.test(twinDirect.text), 'CONTROL (r1): run directly, the real binary HONOURS the AGENT_BROWSER_CDP twin (it tries 127.0.0.1:1 — exactly what `--cdp 1` is refused for)', twinDirect.text.slice(0, 300));
    {
      // the same shell through vibespace-browser over a stub /resolve answering an ATTACHMENT (the
      // keeper's mediated pairs): the twins are dropped and SAID, the command lands on the lease's url
      // r2 (takeover finding 2): the SOCKET ROOT is identity. C's daemon root, as the binary itself reports it
      // (`session info --json` is launch-free); the CONTROL: the same session under the agent's own
      // AGENT_BROWSER_SOCKET_DIR is a DIFFERENT daemon (inactive — a command there would start a second one)
      const info = async (extra) => new Promise((res) => execFile('agent-browser', ['session', 'info', '--json'], { env: { ...envFor('c', g1), ...extra }, encoding: 'utf8', timeout: 20000 }, (e, so) => { let jj = null; try { jj = JSON.parse(String(so).trim().split('\n').filter(Boolean).pop()); } catch { jj = null; } res(jj && jj.data ? jj.data : null); }));
      const DECOY = path.join(ROOT, 'decoy-sock'), DECOY_XDG = path.join(ROOT, 'decoy-xdg');
      const iC = await info({}), iD = await info({ AGENT_BROWSER_SOCKET_DIR: DECOY });
      const tail = `/namespaces/${NS_PREFIX}c/run`;
      const rootC = iC && typeof iC.socketDir === 'string' && iC.socketDir.endsWith(tail) ? iC.socketDir.slice(0, -tail.length) : null;
      ok(iC && iC.active === true && rootC && iD && iD.active === false && String(iD.socketDir || '').startsWith(DECOY + '/'), `r2 CONTROL (the real binary): the same session under another SOCKET_DIR is ANOTHER daemon (active under ${rootC}, inactive under the decoy) — the socket root picks the daemon`, JSON.stringify({ iC, iD }));
      const calls = [];
      const answer = { ok: true, kind: 'attachment', handle: 'work', env: envPairsOf('c', g1), spawnEnv: [], socketDir: rootC, runtimeDir: process.env.XDG_RUNTIME_DIR || null, profile: { id: 'bp-0000000c', label: 'Work' }, lease: { since: Date.now() }, others: 0, handles: [], isDefault: true, pinTab: false };
      const stub = http.createServer((req, res) => { let b = ''; req.on('data', (d) => b += d); req.on('end', () => { calls.push(req.url); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(req.url === '/api/agent/browser/resolve' ? answer : { ok: true })); }); });
      await new Promise((r) => stub.listen(0, '127.0.0.1', r));
      const shell = { PATH: process.env.PATH, HOME, XDG_RUNTIME_DIR: DECOY_XDG, VIBESPACE_API: `http://127.0.0.1:${stub.address().port}`, VIBESPACE_SESSION_TOKEN: 'vsst_stub', AGENT_BROWSER_CDP: 'http://127.0.0.1:1', AGENT_BROWSER_PROXY: 'http://127.0.0.1:1', AGENT_BROWSER_ARGS: '--remote-debugging-port=1', AGENT_BROWSER_SESSION: 'vfy-e', AGENT_BROWSER_NAMESPACE: NS_PREFIX + 'e', AGENT_BROWSER_SOCKET_DIR: DECOY, AGENT_BROWSER_JSON: '1' };
      const viaCli = (args) => new Promise((res) => execFile(process.execPath, [...cliUnder(HOME), ...args], { env: shell, encoding: 'utf8', timeout: 45000 }, (e, so, se) => res({ ok: !e, so: String(so), se: String(se || '') })));
      const via = await viaCli(['get', 'title']);
      const attr = await viaCli(['get', 'attr', '#e', 'cdp-url']);
      stub.close();
      let j = null; try { j = JSON.parse(via.so.trim().split('\n').filter(Boolean).pop()); } catch { j = null; }
      ok(via.ok && j && j.success === true && j.data && j.data.title === 'charlie' && !/127\.0\.0\.1:1\b/.test(via.so + via.se) && /\[env_twin_dropped\]/.test(via.se) && calls.includes('/api/agent/browser/resolve'), 'r1: through vibespace-browser the same shell reaches the REAL binary with the twins dropped (said once) and lands on the lease\'s own browser (`charlie`)', JSON.stringify(via).slice(0, 600));
      ok(via.ok && !fs.existsSync(path.join(DECOY, 'namespaces')) && !fs.existsSync(path.join(DECOY_XDG, 'agent-browser')) && /AGENT_BROWSER_SOCKET_DIR/.test(via.se) && /XDG_RUNTIME_DIR/.test(via.se), 'r2: …under the ANSWER\'s socket root — the agent\'s exported SOCKET_DIR / XDG_RUNTIME_DIR got no daemon (nothing under either decoy) and were named as not passed', JSON.stringify({ se: via.se.slice(0, 400), decoy: fs.existsSync(DECOY) ? fs.readdirSync(DECOY) : null }));
      ok(attr.ok && /zzz/.test(attr.so) && !/devtools/.test(attr.so + attr.se) && !/raw_cdp_refused/.test(attr.se), 'r2: `vibespace-browser get attr #e cdp-url` reaches the real binary and prints the attribute (zzz), never an endpoint', JSON.stringify(attr).slice(0, 400));
    }
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

// ═══ ③ r3 (takeover finding 2): THE CONFIG-FILE TWIN, on the real binary ═══════════════════════
// Measured by the verifier: with no AGENT_BROWSER_CONFIG the binary SEARCHES ~/.agent-browser/config.json and
// ./agent-browser.json in the directory it runs from, and their launch keys land on the browser
// (executablePath ran, `args` put --remote-debugging-port on it). Every launch here targets a DUMP script as
// the browser (it records its argv and exits 1: the binary answers "Chrome exited early") — nothing launches.
console.log('— ③ r3: the config-file twin — a project agent-browser.json lands through a bare command, never through vibespace-browser');
if (AB) {
  const H3 = path.join(ROOT, 'home-cfg'); const DIRTY = path.join(ROOT, 'dirty-cwd'); const DUMPS = path.join(ROOT, 'dumps');
  for (const d of [path.join(H3, '.agent-browser'), DIRTY, DUMPS]) fs.mkdirSync(d, { recursive: true });
  const dump = (name) => { const f = path.join(DUMPS, name); fs.writeFileSync(f, `#!/bin/sh\nprintf '%s\\n' "$@" > ${JSON.stringify(path.join(DUMPS, name + '.args'))}\nexit 1\n`, { mode: 0o755 }); return f; };
  const argsOf = (name) => { try { return fs.readFileSync(path.join(DUMPS, name + '.args'), 'utf8').split('\n').filter(Boolean); } catch { return null; } };
  const dProj = dump('project-chrome'), dUser = dump('user-chrome'), dNamed = dump('named-chrome');
  fs.writeFileSync(path.join(H3, '.agent-browser', 'config.json'), JSON.stringify({ executablePath: dUser, args: '--no-sandbox,--remote-debugging-port=41999,--r3-user-arg' }));
  fs.writeFileSync(path.join(DIRTY, 'agent-browser.json'), JSON.stringify({ executablePath: dProj, args: '--remote-debugging-port=42945,--user-data-dir=' + path.join(ROOT, 'stolen'), userAgent: 'R3-UA-LAYERED' }));
  const TMP3 = path.join(ROOT, 'tmp-cfg'); fs.mkdirSync(TMP3, { recursive: true }); // the binary's own temp profile dirs land here, reaped with ROOT
  const cfgEnv = (k) => ({ ...BASE_ENV, HOME: H3, TMPDIR: TMP3, AGENT_BROWSER_SESSION: 'vs-r3cfg-' + k, AGENT_BROWSER_NAMESPACE: NS_PREFIX + 'cfg-' + k, AGENT_BROWSER_IDLE_TIMEOUT_MS: '20000' });
  const reset = () => { for (const n of ['project-chrome', 'user-chrome', 'named-chrome']) fs.rmSync(path.join(DUMPS, n + '.args'), { force: true }); };
  // CONTROL — the binary itself, bare, from the dirty directory: the PROJECT file's executable runs with its raw port
  reset();
  await new Promise((res) => execFile('agent-browser', ['open', 'about:blank'], { env: cfgEnv('a'), cwd: DIRTY, encoding: 'utf8', timeout: 45000 }, () => res()));
  const pa = argsOf('project-chrome');
  ok(pa && pa.includes('--remote-debugging-port=42945') && pa.some((x) => x.startsWith('--user-data-dir=' + path.join(ROOT, 'stolen'))) && !argsOf('user-chrome'), 'r3 CONTROL (the real binary, bare, from the dirty directory): ./agent-browser.json\'s executablePath RAN with its --remote-debugging-port and --user-data-dir — the finding', JSON.stringify(pa));
  // through vibespace-browser over a stub /resolve — (b) an answer naming NO config (a remote session / an older
  // server): the CLI composes one by the rule — the USER file's executable and args (raw port gone), nothing of the directory's
  // (the answer carries the session's OWN pairs under this run's namespace prefix and a scratch socket root:
  // the CLI drops every AGENT_BROWSER_* of its shell, so an answer naming none would drive the machine's
  // DEFAULT daemon — measured on the first cut of this leg, a daemon in namespace `default` nothing reaped)
  // (a SHORT root of its own: under ROOT the socket path passes the CLI's 103-byte bound — measured)
  fs.mkdirSync(SOCK3, { recursive: true, mode: 0o700 });
  const own3 = (k) => [`AGENT_BROWSER_SESSION=vs-r3cfg-${k}`, `AGENT_BROWSER_NAMESPACE=${NS_PREFIX}cfg-${k}`, 'AGENT_BROWSER_IDLE_TIMEOUT_MS=20000'];
  const answers = { b: { ok: true, kind: 'none', shared: false, handle: null, env: [], spawnEnv: own3('b'), socketDir: SOCK3, runtimeDir: null, handles: [], pinTab: false } };
  const namedCfg = path.join(ROOT, 'named-config.json');
  fs.writeFileSync(namedCfg, JSON.stringify({ executablePath: dNamed, args: '--no-sandbox,--r3-named-arg' }));
  answers.c = { ...answers.b, spawnEnv: own3('c'), config: namedCfg };
  let which = 'b';
  const stub = http.createServer((req, res) => { let b = ''; req.on('data', (d) => b += d); req.on('end', () => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(req.url === '/api/agent/browser/resolve' ? answers[which] : { ok: true })); }); });
  await new Promise((r) => stub.listen(0, '127.0.0.1', r));
  const viaCli = (k) => new Promise((res) => execFile(process.execPath, [...cliUnder(H3), 'open', 'about:blank'], { env: { ...cfgEnv(k), VIBESPACE_API: `http://127.0.0.1:${stub.address().port}`, VIBESPACE_SESSION_TOKEN: 'vsst_stub' }, cwd: DIRTY, encoding: 'utf8', timeout: 45000 }, (e, so, se) => res({ so: String(so), se: String(se || '') })));
  reset(); which = 'b';
  const vb = await viaCli('b');
  const ub = argsOf('user-chrome');
  ok(ub && !argsOf('project-chrome') && ub.includes('--r3-user-arg') && ub.includes('--no-sandbox') && !ub.includes('--remote-debugging-port=41999') && !ub.includes('--remote-debugging-port=42945') && !ub.some((x) => x.includes('stolen')) && /\[config_keys_dropped\]/.test(vb.se),
    'r3: through vibespace-browser (no config named) the SAME directory lands nothing — the user file\'s executable ran with its own args, its raw debugging port gone, and the drop is said', JSON.stringify({ ub, se: vb.se.slice(0, 400) }));
  // (c) an answer NAMING the keeper's file: that file, and neither of the two searched ones
  reset(); which = 'c';
  const vc = await viaCli('c');
  const nc = argsOf('named-chrome');
  ok(nc && nc.includes('--r3-named-arg') && !argsOf('user-chrome') && !argsOf('project-chrome'), 'r3: an answer naming a config ⇒ exactly that file runs the launch — neither ~/.agent-browser/config.json nor ./agent-browser.json is read', JSON.stringify({ nc, se: vc.se.slice(0, 300) }));
  stub.close();
  reapDaemons();
} else skip('no agent-browser for the config-file legs');

// ═══ ③ r4 (takeover findings 1 + 3): the NAVIGATION road and the stdin batch, on the real binary + a real chrome ═══
// Measured by the verifier: 0.32.0 launches EVERY browser with --remote-debugging-port=0 (whatever the config
// says), and two sanctioned-looking page verbs print what `get cdp-url` is refused for — `open chrome://version`
// (the command line, the profile directory) and `open file://<that dir>/DevToolsActivePort` (the port + the
// browser GUID). Bare, the binary does it (the CONTROL); through vibespace-browser it is refused. A `state load`
// of a file naming such an origin lands the page there too (measured this round). And the binary reads a stdin
// batch ONLY as JSON: plain lines bare are `Invalid JSON input` (the control); through the CLI both forms run.
console.log('— ③ r4: navigation to the browser\'s own pages / this machine\'s files — bare (the control) vs through vibespace-browser; the stdin batch');
if (AB && CHROME) {
  const H4 = path.join(ROOT, 'home-nav'); const TMP4 = path.join(SOCK3, 't'); const NAVCFG = path.join(ROOT, 'nav-config.json');
  fs.mkdirSync(path.join(H4, '.agent-browser'), { recursive: true }); fs.mkdirSync(TMP4, { recursive: true, mode: 0o700 }); fs.mkdirSync(SOCK3, { recursive: true, mode: 0o700 });
  fs.writeFileSync(NAVCFG, JSON.stringify({ executablePath: CHROME, args: '--no-sandbox,--disable-gpu,--disable-dev-shm-usage' }));
  const navPairs = [`AGENT_BROWSER_SESSION=vs-r4nav`, `AGENT_BROWSER_NAMESPACE=${NS_PREFIX}nav`, 'AGENT_BROWSER_IDLE_TIMEOUT_MS=60000'];
  const navEnv = { ...BASE_ENV, HOME: H4, TMPDIR: TMP4, AGENT_BROWSER_SOCKET_DIR: SOCK3, AGENT_BROWSER_CONFIG: NAVCFG, ...Object.fromEntries(navPairs.map((kv) => [kv.slice(0, kv.indexOf('=')), kv.slice(kv.indexOf('=') + 1)])) };
  delete navEnv.XDG_RUNTIME_DIR;
  const bare = (args, input) => new Promise((res) => { const ch = execFile('agent-browser', args, { env: navEnv, cwd: ROOT, encoding: 'utf8', timeout: 45000 }, (e, so, se) => res({ ok: !e, text: String(so) + String(se || (e && e.message) || '') })); if (input != null) ch.stdin.end(input); });
  const answer = { ok: true, kind: 'none', shared: false, handle: null, env: [], spawnEnv: navPairs, socketDir: SOCK3, runtimeDir: null, config: NAVCFG, handles: [], pinTab: false };
  const calls4 = [];
  const stub = http.createServer((req, res) => { let b = ''; req.on('data', (d) => b += d); req.on('end', () => { calls4.push(req.url); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(req.url === '/api/agent/browser/resolve' ? answer : { ok: true })); }); });
  await new Promise((r) => stub.listen(0, '127.0.0.1', r));
  const shell4 = { ...BASE_ENV, HOME: H4, VIBESPACE_API: `http://127.0.0.1:${stub.address().port}`, VIBESPACE_SESSION_TOKEN: 'vsst_stub' };
  const via = (args, input, cwd = ROOT) => new Promise((res) => { const ch = execFile(process.execPath, [...cliUnder(H4), ...args], { env: shell4, cwd, encoding: 'utf8', timeout: 45000 }, (e, so, se) => res({ ok: !e, code: e ? e.code : 0, so: String(so), se: String(se || '') })); if (input != null) ch.stdin.end(input); });
  const o = await bare(['open', 'data:text/html,<title>web</title>']);
  if (!o.ok) skip(`the real binary could not launch ${CHROME} here: ${o.text.slice(0, 200)}`);
  else {
    // the CONTROL, bare: chrome://version names the profile directory; its DevToolsActivePort is the endpoint
    await bare(['open', 'chrome://version']);
    const ver = (await bare(['get', 'text', 'body'])).text;
    const prof = (/Profile Path\s*(\S+)/.exec(ver) || [])[1] || null;
    const udd = prof ? path.dirname(prof) : null;
    const portFile = udd ? path.join(udd, 'DevToolsActivePort') : null;
    const cdp = (await bare(['get', 'cdp-url'])).text;
    const cdpM = /ws:\/\/127\.0\.0\.1:(\d+)(\/devtools\/browser\/[0-9a-f-]+)/.exec(cdp);
    await bare(['open', `file://${portFile}`]);
    const pf = (await bare(['get', 'text', 'body'])).text;
    ok(prof && /--remote-debugging-port=0/.test(ver) && cdpM && pf.includes(cdpM[1]) && pf.includes(cdpM[2]), `r4 CONTROL (the real binary, bare): \`open chrome://version\` names the profile directory (${udd}) and the launch's --remote-debugging-port=0; \`open file://…/DevToolsActivePort\` prints port ${cdpM && cdpM[1]} + the browser GUID — exactly \`get cdp-url\`'s answer`, JSON.stringify({ prof, cdp: cdp.slice(0, 120), pf: pf.slice(0, 200), ver: ver.slice(0, 300) }));
    // …and a crafted `state load` lands on chrome://version too
    await bare(['open', 'about:blank']);
    const SF = path.join(ROOT, 'nav-state.json');
    fs.writeFileSync(SF, JSON.stringify({ cookies: [], origins: [{ origin: 'chrome://version', localStorage: [{ name: 'a', value: 'b' }] }] }));
    await bare(['state', 'load', SF]);
    const su = (await bare(['get', 'url'])).text;
    ok(/chrome:\/\/version/.test(su), 'r4 CONTROL (bare): `state load <file naming chrome://version as an origin>` leaves the page ON chrome://version', su.slice(0, 200));
    // …and a renderer-initiated navigation from the web cannot follow (the residual `eval` has, measured)
    await bare(['open', 'data:text/html,<title>web</title>']);
    await bare(['eval', `location.href='file://${portFile}'; 1`]);
    await sleep(500);
    const eu = (await bare(['get', 'url'])).text;
    ok(/^data:/m.test(eu.trim()) || eu.includes('data:text/html'), 'r4 (measured residual): an `eval` navigation from a web page to file:// is refused by the browser itself — the page stays on the web', eu.slice(0, 200));
    // THROUGH vibespace-browser: every one refused locally, before /resolve; the page never leaves the web
    const n0 = calls4.length;
    const rows = [];
    for (const args of [['open', 'chrome://version'], ['open', `file://${portFile}`], ['open', `FILE:${portFile}`], ['tab', 'new', `file://${portFile}`], ['--', 'goto', 'about:version'], ['batch', 'open https://x', 'open chrome://version']]) {
      const r = await via(args); rows.push({ args: args.join(' '), code: r.code, se: r.se.trim().split('\n')[0] });
    }
    const sl = await via(['state', 'load', SF]);
    rows.push({ args: 'state load <crafted>', code: sl.code, se: sl.se.trim().split('\n')[0] });
    const js = await via(['batch'], JSON.stringify([['open', 'data:text/html,x'], ['open', `file://${portFile}`]]));
    rows.push({ args: 'batch <stdin JSON>', code: js.code, se: js.se.trim().split('\n')[0] });
    const after = (await bare(['get', 'url'])).text;
    ok(rows.every((r) => r.code === 1 && /\[(local_scheme_refused|batch_line_refused)\]$/.test(r.se)) && calls4.length === n0 && !/chrome:|file:/.test(after), `r4: through vibespace-browser each of ${rows.length} spellings is refused locally (local_scheme_refused), no /resolve made, and the page never left the web (${after.trim().split('\n').pop()})`, JSON.stringify({ rows: rows.map((r) => ({ ...r, se: r.se.slice(-160) })), after: after.slice(0, 200) }));
    const good = await via(['open', 'data:text/html,<title>still-web</title>']);
    ok(good.ok && calls4.includes('/api/agent/browser/resolve') && /still-web/.test((await bare(['get', 'title'])).text), 'r4 CONTROL: `vibespace-browser open data:…` reaches the real binary and navigates', JSON.stringify(good).slice(0, 300));
    // finding 3 — the stdin batch: bare plain lines are the binary's own `Invalid JSON input` (the control); through the CLI both forms run
    const bl = await bare(['batch'], 'get title\nget url\n');
    const bj = await bare(['batch'], '[["get","title"]]');
    ok(!bl.ok && /Invalid JSON input/.test(bl.text) && bj.ok && /still-web/.test(bj.text), 'r4 CONTROL (bare): the binary reads a stdin batch only as a JSON array of string arrays — plain lines are `Invalid JSON input`', JSON.stringify({ bl: bl.text.slice(0, 200), bj: bj.text.slice(0, 200) }));
    const vl = await via(['batch'], 'get title\nget url\n');
    const vj = await via(['batch'], '[["get","title"],["get","url"]]');
    ok(vl.ok && /still-web/.test(vl.so) && /data:text\/html/.test(vl.so) && vj.ok && /still-web/.test(vj.so), 'r4: through vibespace-browser a plain-line stdin batch AND the JSON form both run on the real binary (r3: the JSON form was refused, the plain form was the binary\'s Invalid JSON)', JSON.stringify({ vl: [vl.code, vl.so.slice(0, 200), vl.se.slice(0, 200)], vj: [vj.code, vj.so.slice(0, 200), vj.se.slice(0, 200)] }));
    await bare(['close']);
  }
  stub.close();
  reapDaemons();
} else skip(AB ? 'no chrome for the navigation legs' : 'no agent-browser for the navigation legs');

if (med) med.shutdown();
if (raw) raw.ws.close();
cleanup();
console.log(fail ? `\n${fail} FAILED (${pass} passed${skipped ? ', ' + skipped + ' skipped' : ''})` : `\nALL PASS (${pass}${skipped ? ', ' + skipped + ' skipped' : ''})`);
process.exit(fail ? 1 : 0);
