#!/usr/bin/env node
// HOW LONG A FRESH WATCH'S Page.enable TAKES ON A LOADED BROWSER, MEASURED (lane browser-held-not-hung, owner 2026-10-08:
// his .231 update restarted VibeSpace, which ADOPTED the daemon that outlived it; the dialog watch re-attached to a 4 GB,
// 16-tab browser, one tab's Page.enable went unanswered for ENABLE_TIMEOUT_MS = 5 s ⇒ "held" ⇒ the whole conversation read
// "not responding" while every verb answered). NOT a test-*.mjs, no tier (the measure-navigation-loop.mjs shape): the REAL
// keeper launches ONE profile browser in a scratch HOME (never ~/.agent-browser), its lease opens TABS synthetic pages
// through the installed agent-browser (each page busy: a big DOM, a CSS animation, a rAF loop burning BURN_MS per frame),
// then — THE ADOPTED SHAPE — a FRESH browser-level socket (the watch's own: setDiscoverTargets + attachToTarget {flatten}
// + Page.enable, every tab AT ONCE like `arm`) attaches to the daemon that was already running. Per round: each tab's
// Page.enable answer time. Rounds: `idle` (the pages only), `busy` (the lease's own `open` loop runs meanwhile). Then a tab
// whose ALERT opened before the fresh socket: does its Page.enable ever answer (30 s), and after `dialog accept`?
// `WT=<checkout> node scripts/measure-held-enable.mjs [out.json]` (TABS=16 ROUNDS=5 BURN_MS=6); zero vendor calls; the
// scratch root, the daemons and the Chrome it started are ended on exit (by this run's own root).
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
const TABS = Number(process.env.TABS) || 16, ROUNDS = process.env.ROUNDS ? Number(process.env.ROUNDS) : 5, BURN_MS = Number(process.env.BURN_MS) || 6;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('AGENT_BROWSER_') && !k.startsWith('VIBESPACE_')));

const ROOT = scratch('heldenable');
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
console.log(`agent-browser ${REAL_AB} (${ver}); root ${ROOT}; ${TABS} tabs × ${ROUNDS} rounds, ${BURN_MS} ms burnt per frame`);

// ── the pages (loopback) ──
const PORT = await freePort();
const SYN = (i) => `<!doctype html><title>Synthetic ${i}</title><style>.c{display:inline-block;width:18px;height:18px;margin:1px;background:#8ab;animation:s 1.3s linear infinite}@keyframes s{to{transform:rotate(360deg)}}</style>
<div id=g></div><script>const g=document.getElementById('g');for(let k=0;k<1500;k++){const d=document.createElement('div');d.className='c';d.textContent=k%10;g.appendChild(d);}
const burn=()=>{const t=performance.now();let x=0;while(performance.now()-t<${BURN_MS})x+=Math.sqrt(x+1);g.firstChild.textContent=x%10|0;requestAnimationFrame(burn);};requestAnimationFrame(burn);</script>`;
const srv = http.createServer((req, res) => {
  res.setHeader('content-type', 'text/html; charset=utf-8');
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/syn') return res.end(SYN(Number(u.searchParams.get('i')) || 0));
  if (u.pathname === '/alert') return res.end('<!doctype html><title>Alert page</title><p>an alert opens 400 ms after load<script>setTimeout(() => alert("held before the watch"), 400);</script>');
  return res.end('<!doctype html><title>Other</title>');
}).listen(PORT, '127.0.0.1');
const U = (p) => `http://127.0.0.1:${PORT}${p}`;

const quiet = { log() { }, warn() { }, error() { } };
const KA = 'bk-0000be1d';
const kk = Kk.create({ dataDir: path.join(ROOT, 'data'), homeDir: KH, env: () => kenv, serverSetting: () => undefined, liveKeys: () => new Set([KA]), runtime: Ff.createBrowserRuntime({ env: kenv }), facts: Ff.createBrowserFacts({ env: kenv }), log: quiet, install: false, tickMs: 3600e3 });
const report = { version: ver, at: new Date().toISOString(), tabs: TABS, rounds: ROUNDS, burnMs: BURN_MS, enableTimeoutMsToday: 5000 };
const cfg = kk.configFileFor({ ephemeral: false });
function run(pairs, args, { timeout = 60000 } = {}) {
  const t0 = Date.now();
  return new Promise((resolve) => execFile(REAL_AB, args, { env: { ...kenv, ...Ss.pairsToEnv(pairs), AGENT_BROWSER_CONFIG: cfg }, encoding: 'utf8', timeout }, (err, so, se) => resolve({ ok: !err, code: err ? (err.code ?? err.signal) : 0, ms: Date.now() - t0, out: (String(so || '') + String(se || '')).trim().slice(0, 600) })));
}
/** THE WATCH'S ARM, fresh: one browser-level socket; every page target attached (flat) and Page.enable'd AT ONCE
 *  (browser-dialogs `arm`: Promise.all over getTargets). Each tab: attach ms, enable ms (null = no answer in `enableMs`). */
async function freshArm(wsUrl, { enableMs = 30000, only = null } = {}) {
  const ws = new WebSocket(wsUrl, { perMessageDeflate: false });
  let id = 0; const waiting = new Map();
  const call = (method, params = {}, sessionId = null, ms = 5000) => new Promise((resolve) => { const i = ++id; const t = setTimeout(() => { if (waiting.delete(i)) resolve({ timeout: true }); }, ms); waiting.set(i, (m) => { clearTimeout(t); resolve(m); }); ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) })); });
  ws.on('message', (d) => { let m; try { m = JSON.parse(String(d)); } catch { return; } if (m.id && waiting.has(m.id)) { const fn = waiting.get(m.id); waiting.delete(m.id); fn(m); } });
  await new Promise((r, j) => { ws.once('open', r); ws.once('error', j); });
  await call('Target.setDiscoverTargets', { discover: true });
  const r = await call('Target.getTargets');
  const pages = ((r.result && r.result.targetInfos) || []).filter((t) => t.type === 'page' && (!only || only.test(t.url)));
  const t0 = Date.now();
  const rows = await Promise.all(pages.map(async (t) => {
    const a0 = Date.now(); const a = await call('Target.attachToTarget', { targetId: t.targetId, flatten: true });
    const attachMs = Date.now() - a0;
    const sid = a && a.result && a.result.sessionId;
    if (!sid) return { title: t.title, attachMs, enableMs: null, attachFailed: true };
    const e0 = Date.now(); const en = await call('Page.enable', {}, sid, enableMs);
    return { title: t.title, url: t.url, attachMs, enableMs: en && !en.timeout && !en.error ? Date.now() - e0 : null, sinceArmMs: Date.now() - t0, sid };
  }));
  return { rows, call, close: () => { try { ws.close(); } catch { /* */ } } };
}
const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] : null; };
const stats = (xs) => ({ n: xs.length, p50: pct(xs, 50), p95: pct(xs, 95), max: xs.length ? Math.max(...xs) : null });

try {
  const prof = kk.createProfile({ label: 'Held' }, { owner: { kind: 'instance', id: null } });
  const ax = await kk.attach({ profileId: prof.id, browserKey: KA, sessionId: 'sess-held' });
  const pin = ax.pinTab ? ['--pin-tab'] : [];
  const rec = kk.browserOf(prof.id);
  const o0 = await run(ax.env, [...pin, 'open', U('/syn?i=0')]);
  const opened = [o0.ok];
  for (let i = 1; i < TABS; i++) opened.push((await run(ax.env, [...pin, 'tab', 'new', U('/syn?i=' + i)], { timeout: 45000 })).ok);
  report.tabsOpened = opened.filter(Boolean).length;
  await sleep(3000);
  const rounds = { idle: [], busy: [] };
  for (const kind of ['idle', 'busy']) {
    for (let r = 0; r < ROUNDS; r++) {
      let stop = false; let verbs = 0; const verbMs = [];
      // busy: the lease's own verbs run while the fresh watch arms (the owner's agent was navigating)
      const loop = kind === 'busy' ? (async () => { while (!stop) { const v = await run(ax.env, [...pin, 'open', U('/syn?i=' + (100 + verbs))], { timeout: 45000 }); verbs++; verbMs.push(v.ms); } })() : null;
      if (loop) await sleep(300);
      const w = await freshArm(rec.cdpUrl, { enableMs: 30000, only: /\/syn/ });
      stop = true; if (loop) await loop;
      w.close();
      const ms = w.rows.map((x) => x.enableMs).filter((x) => x != null);
      rounds[kind].push({ tabs: w.rows.length, answered: ms.length, unanswered: w.rows.length - ms.length, enable: stats(ms), attach: stats(w.rows.map((x) => x.attachMs)), over5s: ms.filter((x) => x > 5000).length, verbs, verbMs });
      console.log(kind, r, JSON.stringify(rounds[kind][rounds[kind].length - 1]));
      await sleep(500);
    }
  }
  report.rounds = rounds;
  const all = (k) => rounds[k].flatMap(() => []);
  void all;
  const allMs = { idle: [], busy: [] };
  // per-tab samples for the headline (re-measured from the stored stats is lossy: keep every sample)
  report.headline = {};
  for (const k of ['idle', 'busy']) {
    const flat = []; for (const x of rounds[k]) flat.push(x.enable);
    report.headline[k] = { roundsP50: flat.map((s) => s.p50), roundsP95: flat.map((s) => s.p95), roundsMax: flat.map((s) => s.max), unanswered: rounds[k].reduce((a, x) => a + x.unanswered, 0) };
    allMs[k] = flat;
  }
  // ── a tab whose ALERT opened before the fresh socket ──
  const ta = await run(ax.env, [...pin, 'tab', 'new', U('/alert')], { timeout: 45000 });
  await sleep(1500);
  const ds = await run(ax.env, [...pin, '--json', 'dialog', 'status'], { timeout: 45000 });
  const A = { tabNew: { ok: ta.ok, ms: ta.ms }, dialogStatus: ds.out.slice(0, 300) };
  const wa = await freshArm(rec.cdpUrl, { enableMs: 30000, only: /\/alert/ });
  A.enableWithAlertOpen = wa.rows.map((x) => ({ enableMs: x.enableMs, attachMs: x.attachMs }));
  // THE RULE ON THE REAL BROWSER: the REAL watch (browser-dialogs) arms AFTER the alert opened (the adopted shape) — the
  // alert's tab is held; the lease's verb on ANOTHER tab answers ok ⇒ the conversation's fact is `blind`, never unresponsive
  const D = require(path.join(WT, 'src/server/browser-dialogs.js'));
  const wk = { cdpEndpointFor: async () => ({ ok: true, url: rec.cdpUrl }), onLease: () => () => { }, setFor: () => ({ attachments: [{ profileId: prof.id }] }), ephemeralFor: () => null };
  const dw = D.create({ keeper: wk, log: quiet, tabsOf: () => null, leaseCountOf: () => 1, holdersOf: () => [] });
  const heldP = new Promise((r) => dw.onChange((e) => { if (e.kind === 'held') r(Date.now()); }));
  const a0 = Date.now(); await dw.arm(prof.id);
  const heldAt = await Promise.race([heldP, sleep(15000).then(() => null)]);
  const before = dw.stuckForKey(KA);
  const nav = await run(ax.env, [...pin, 'tab', 'new', U('/syn?i=900')], { timeout: 45000 });
  dw.noteOutcome(prof.id, { state: nav.ok ? 'ok' : 'timeout', browserKey: KA });
  const after = dw.stuckForKey(KA);
  A.realWatch = { heldAfterMs: heldAt ? heldAt - a0 : null, beforeVerb: before ? before.state : null, verb: { ok: nav.ok, ms: nav.ms, out: nav.out.slice(0, 120) }, afterVerb: after ? after.state : null, afterWhy: after ? after.why : null, row: dw.pageStuckMap()[prof.id] || null };
  dw.shutdown();
  // the CLI answers it (the daemon's own view), then the SAME fresh socket asks Page.enable again (the watch's re-ask)
  const acc = await run(ax.env, [...pin, 'dialog', 'accept'], { timeout: 45000 });
  A.accept = { ok: acc.ok, ms: acc.ms, out: acc.out.slice(0, 200) };
  const sid = wa.rows[0] && wa.rows[0].sid;
  if (sid) { const t = Date.now(); const re = await wa.call('Page.enable', {}, sid, 10000); A.reEnableAfterAccept = { ms: Date.now() - t, answered: !!(re && !re.timeout && !re.error) }; }
  wa.close();
  report.alert = A;
  console.log('alert', JSON.stringify(A));
  const idleAll = rounds.idle.map((x) => x.enable), busyAll = rounds.busy.map((x) => x.enable);
  console.log(`HEADLINE idle p50 ${pct(idleAll.map((s) => s.p50), 50)} ms / worst-round p95 ${Math.max(...idleAll.map((s) => s.p95))} ms / max ${Math.max(...idleAll.map((s) => s.max))} ms; busy p50 ${pct(busyAll.map((s) => s.p50), 50)} ms / worst-round p95 ${Math.max(...busyAll.map((s) => s.p95))} ms / max ${Math.max(...busyAll.map((s) => s.max))} ms; alert tab answered: ${A.enableWithAlertOpen.map((x) => x.enableMs).join(',')}; real watch ${JSON.stringify(A.realWatch)}`);
} catch (e) { report.error = String(e && e.stack || e); console.error(e); }
finally {
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
  try { kk.shutdown(); } catch { /* */ }
  srv.close();
  cleanup();
  process.exit(0);
}
