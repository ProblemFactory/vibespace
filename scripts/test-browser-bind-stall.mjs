#!/usr/bin/env node
// B-19a9 — THE TAB BIND UNDER ANOTHER HOLDER'S CHURN, ON THE REAL DRIVER, ON BOTH ROADS (heavy, run ALONE; the coordinator's r194 / r720).
// The row: on a shared profile the keeper binds a new tab to its holder's session with the driver's own `--pin-tab tab <id>`
// (src/server/browser-keeper.js openOwnTab, a 30 s exec bound); under ANOTHER holder's `tab new` + `tab close` the bind answered
// after ~30 s in 1–4 of 10 (the browser-windows lane's own scripts on 2.369.202, never a tree leg), and the keeper refuses
// window_busy (bind_failed).
// r3 — THE CAUSE, READ (the second box run at c6addc507 caught three ~30.1 s binds; the driver's published source at its tag
// v0.38.2, github.com/vercel-labs/agent-browser): its daemon drains the browser's target events every 100 ms HOLDING its one state
// lock (cli/src/native/daemon.rs), attaches each NEW target one at a time (actions.rs apply_drained_events — the «failed to prepare
// new page session» lines its log held at every slow call), and each CDP call waits up to 30 s with nothing failing a call whose
// target went away (cdp/client.rs). A tab of B's that dies while A's drain prepares it holds A's lock 30 s: every command of A
// waits behind it (the bind, the navigate, a second ask — r2's abandoned bind gained nothing, its activated one moved the wait to
// the navigate). The product's road for an agent's lease on a LOCAL shared profile is THE SCOPE ROAD (lane
// browser-shared-profile-freeze, 2.369.346 — after the row's own measure: keeper leaseUrlFor → cdp-mediator grantFor, mode scope):
// a lease's connection discovers only its own tabs. So each TRIAL runs the keeper's bind + navigate on BOTH roads, in this order:
//   SCOPED (judged): sessions SA and SB, each handed a scope grant of the tree's own cdp-mediator over the suite's Chrome. The
//     trial's tab is made on the browser socket and ADMITTED to SA (the keeper's mediator.admitTarget before its bind); SB's
//     churn tabs are SB's own (admitted by their own create). THE LAW: no bind and no navigate of SA over 5 s, and SA's daemon
//     log holds no «failed to prepare new page session»; the scope's own control: SA's tab list holds none of SB's tabs, where
//     the BROWSER's own page list holds them all — BY TARGET ID (r4, box row 124: a bare holder's `open` drives a tab it
//     discovered, so a url names no holder; each answer is read whole; r5: the reference is the browser's own list, the bare A's
//     printed — its drain can still be held at the end).
//   BARE (printed — the CONTROL): sessions A and B `--cdp` to the suite's Chrome itself, as both box runs measured (the stall 3 of
//     8 binds there). Its daemons see every tab of the browser, the scoped phase's too: a wait they meet is the same cause.
//   In both: B's loop WARMED first (up to 3 cycles, ≤ 6 s — r5: a B whose own first `tab new` is held by the stall has 0 there,
//   printed, never judged) and the bind started only while B's `tab new` is IN FLIGHT (r2, the
//   coordinator's r856: a leg proves the overlap or goes red by name); the navigate is the CLI's `--pin-tab open` (the keeper's
//   fallback; its own road is Page.navigate on the tab's socket) — a command of A's daemon after the bind. A failed call's WHY is
//   its stderr AND its --json answer (the driver answers its errors on stdout: r2 printed stderr only). Around a call over 5 s
//   the driver's own lines are printed (A and SA run every call with AGENT_BROWSER_DEBUG=1; the log files their worlds hold).
// THE THREE BOUNDS (r194, it runs on the hub's own box):
//   1. B's churn runs ONLY inside a way: it starts with it and stops with it, never a free loop. Ten trials at most; the whole
//      leg is capped at FOUR MINUTES by its own clock (a way starts only with room for its worst case and the end's reads), and
//      says so when it stops at the cap.
//   2. ONE Chrome, the suite's own (headless, CHROME_QUIET + CHROME_STORE, scripts/scratch.mjs): every driver call ATTACHES to it
//      (`--cdp`: the browser's endpoint or a grant of the in-process mediator on loopback), none launches one. A loopback page.
//   3. Each way prints its line «B-19a9 MEASURE <road> n {…}»; the closing summary counts, per road, the calls over 5 s and the
//      calls that failed, apart.
// ONLY WHAT IT STARTED: every folder under this run's stamped scratch root (each session's HOME, TMPDIR, XDG_RUNTIME_DIR, its
// cwd); the page, the mediator and Chrome on free ports; at the end (and at exit) this root's processes — Chrome, the sessions'
// daemons — are ended by pid + start time, never another. Without the real agent-browser (the tree's fence: src/browser-facts.js
// binaryResolver) or a Chrome it SKIPS BY NAME («SKIP: …», never a green). Zero vendor calls.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn, execFile, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, freePort, CHROME_QUIET, CHROME_STORE } from './scratch.mjs';
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const Ff = require('../src/browser-facts.js');
const MED = require('../src/server/cdp-mediator.js');
const M = require('../src/browser-mediation.js');
const { WebSocket } = require('ws');

const { ok, report } = checker();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CAP_MS = 4 * 60000, TRIALS = 10, BIND_MS = 35000, SLOW_MS = 5000;
const T0 = Date.now(), left = () => CAP_MS - (Date.now() - T0);

// ── this run's root: every folder of every session lies under it ──
const ROOT = scratch('bindstall');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true, mode: 0o700 });
const under = (v, d) => { const s = String(v == null ? '' : v); return s === d || s.startsWith(d + '/'); };
const BASE_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('AGENT_BROWSER_') && !k.startsWith('VIBESPACE_')
  && !['DISPLAY', 'WAYLAND_DISPLAY', 'XDG_SESSION_TYPE', 'DBUS_SESSION_BUS_ADDRESS', 'XAUTHORITY', 'TMPDIR', 'XDG_RUNTIME_DIR'].includes(k)));
const skipWhole = (why) => { console.log(`\nSKIP: ${why} — no leg ran on this machine`); process.exit(0); };

// ── identity: a pid is a process only with its start time; this root's processes are ended by it (the model: test-browser-ephemeral-life) ──
const statOf = (pid) => { try { const s = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'); const f = s.slice(s.lastIndexOf(')') + 2).split(' '); const st = Number(f[19]); return { ppid: Number(f[1]), st: Number.isFinite(st) ? st : null }; } catch { return null; } };
const MY_START = (statOf(process.pid) || {}).st;
function endMine() {
  const skip = new Set(); for (let q = process.pid; q > 1 && !skip.has(q);) { skip.add(q); const s = statOf(q); if (!s) break; q = s.ppid; }
  const hit = []; let pids = []; try { pids = fs.readdirSync('/proc').filter((d) => /^\d+$/.test(d)).map(Number); } catch { return hit; }
  for (const pid of pids) {
    if (skip.has(pid)) continue;
    const s1 = statOf(pid); if (!s1 || s1.st == null || MY_START == null || s1.st < MY_START) continue;
    let rooted = false;
    try { rooted = under(fs.readlinkSync(`/proc/${pid}/cwd`), ROOT); } catch { /* not ours to read */ }
    if (!rooted) try { rooted = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split(/[\0\s]+/).some((t) => under(t, ROOT) || t.split('=').slice(1).some((v) => under(v, ROOT))); } catch { /* gone */ }
    if (!rooted) try { const env = fs.readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0'); rooted = ['HOME', 'XDG_RUNTIME_DIR', 'TMPDIR'].some((k) => under((env.find((kv) => kv.startsWith(k + '=')) || '').slice(k.length + 1), ROOT)); } catch { /* gone */ }
    if (!rooted) continue;
    const s2 = statOf(pid); if (!s2 || s2.st !== s1.st) continue;
    try { process.kill(pid, 'SIGKILL'); hit.push(`${pid}:${s1.st}`); } catch { /* gone */ }
  }
  return hit;
}
process.on('exit', () => { try { endMine(); } catch { /* best effort at exit */ } });
for (const sg of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sg, () => process.exit(130));

// ── the fence: the real driver, a Chrome ──
const REAL_AB = (() => { try { return Ff.binaryResolver('agent-browser', BASE_ENV)(); } catch { return null; } })();
let ver = null;
try { const h0 = path.join(ROOT, 'v'); fs.mkdirSync(h0, { mode: 0o700 }); ver = REAL_AB ? execFileSync(REAL_AB, ['--version'], { encoding: 'utf8', timeout: 8000, env: { ...BASE_ENV, HOME: h0, TMPDIR: h0 } }).trim() : null; } catch { ver = null; }
if (!ver) skipWhole(`no real agent-browser resolves on PATH past the shim (the tree's real-driver fence, src/browser-facts.js binaryResolver; PATH=${BASE_ENV.PATH || ''})`);
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) skipWhole('no Chrome on this machine');
console.log(`agent-browser: ${REAL_AB} (${ver}) · Chrome ${CHROME} · root ${ROOT} · ≤ ${TRIALS} trials, the leg capped at ${CAP_MS / 60000} min`);

// ── the loopback page ──
const PAGE_PORT = await freePort();
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(`<!doctype html><title>bind ${q.url}</title><h1>stand-in ${q.url}</h1>`); });
await new Promise((r) => srv.listen(PAGE_PORT, '127.0.0.1', r));
const PAGE = (n) => `http://127.0.0.1:${PAGE_PORT}/p${n}`;

// ── ONE Chrome, the suite's own ──
const CDP_PORT = await freePort();
const chrome = spawn(CHROME, [...CHROME_QUIET, ...CHROME_STORE, '--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', `--user-data-dir=${path.join(ROOT, 'chrome')}`, 'about:blank'], { stdio: 'ignore', env: { ...BASE_ENV, HOME: path.join(ROOT, 'chrome-home') } });
let BROWSER_WS = null;
for (let i = 0; i < 100 && !BROWSER_WS; i++) { try { BROWSER_WS = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json()).webSocketDebuggerUrl || null; } catch { await sleep(150); } }
if (!ok(!!BROWSER_WS, 'the suite\'s ONE Chrome answers its DevTools endpoint (headless, CHROME_QUIET + CHROME_STORE, its own profile dir)', String(BROWSER_WS))) { report(); }

// the browser socket: make, activate and close the trials' tabs (never through the driver)
const bws = new WebSocket(BROWSER_WS, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r, e) => { bws.once('open', r); bws.once('error', e); });
let seq = 0; const pend = new Map();
bws.on('message', (d) => { let m = null; try { m = JSON.parse(d); } catch { return; } if (m && m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); bws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (pend.has(id)) { pend.delete(id); r({ error: { message: 'no answer in 10 s' } }); } }, 10000); });
const newTab = async (n) => { const r = await cdp('Target.createTarget', { url: PAGE(n), background: true }); return r && r.result ? String(r.result.targetId) : null; };

// ── the mediator: the tree's own, in this process (the hub makes ONE a run) — a scope grant per scoped session, one profile ──
const medLog = [];
const med = MED.create({ log: { log: (s) => medLog.push(String(s)), warn: (s) => medLog.push('W ' + String(s)) } });
const SCOPE_PROFILE = 'bp-0019a9s0', SA_KEY = 'bk-0019a9sa', SB_KEY = 'bk-0019a9sb';
let gSA = null, gSB = null, grantErr = null;
try {
  gSA = await med.grantFor({ profileId: SCOPE_PROFILE, browserKey: SA_KEY, upstream: BROWSER_WS, mode: M.SCOPE_MODE, paused: () => false });
  gSB = await med.grantFor({ profileId: SCOPE_PROFILE, browserKey: SB_KEY, upstream: BROWSER_WS, mode: M.SCOPE_MODE, paused: () => false });
} catch (e) { grantErr = String(e && e.message); }
if (!ok(!!(gSA && gSB && gSA.url && gSB.url && gSA.url !== gSB.url), 'the scoped road: the tree\'s cdp-mediator hands SA and SB a scope grant each over the suite\'s Chrome (mode scope — the keeper\'s leaseUrlFor road)', grantErr || medLog.slice(-4))) { try { med.shutdown(); } catch { /* */ } report(); }

// ── the four sessions: per road one namespace (a shared profile's two holders), each session its own world ──
// A and SA run EVERY call with AGENT_BROWSER_DEBUG=1, the first included: a daemon is born with it (a call with another view
// could restart that daemon — the keeper's leaseCliOpts note), so the bind meets the same daemon the warm-up made
const world = (name, cdpUrl, ns, { debug = false } = {}) => { const d = path.join(ROOT, name); const w = { name, cdpUrl, ns, debug, home: path.join(d, 'home'), tmp: path.join(d, 'tmp'), xdg: path.join(d, 'xdg'), cwd: path.join(d, 'cwd') }; for (const x of [w.home, w.tmp, w.xdg, w.cwd]) fs.mkdirSync(x, { recursive: true, mode: 0o700 }); return w; };
const SA = world('SA', gSA.url, 'b19a9s', { debug: true }), SB = world('SB', gSB.url, 'b19a9s');
const A = world('A', BROWSER_WS, 'b19a9', { debug: true }), Bw = world('B', BROWSER_WS, 'b19a9');
const drive = (w, args, timeout) => new Promise((resolve) => {
  const t0 = Date.now();
  execFile(REAL_AB, ['--cdp', w.cdpUrl, ...args], { encoding: 'utf8', timeout, killSignal: 'SIGKILL', cwd: w.cwd, maxBuffer: 8 * 1024 * 1024,
    env: { ...BASE_ENV, HOME: w.home, TMPDIR: w.tmp, XDG_RUNTIME_DIR: w.xdg, AGENT_BROWSER_NAMESPACE: w.ns, AGENT_BROWSER_SESSION: `vs-${w.name}`, AGENT_BROWSER_JSON: '1', ...(w.debug ? { AGENT_BROWSER_DEBUG: '1' } : {}) } },
    (err, stdout, stderr) => resolve({ ms: Date.now() - t0, code: err ? (err.killed ? 'timeout' : (err.code || 1)) : 0, out: String(stdout || '').slice(-262144) /* r4: the WHOLE answer — a bare holder's tab list (every tab of the browser) outgrew a 1500-char tail and its JSON was cut (box row 124) */, err: String(stderr || '').slice(-4000) }));
});
// the driver's --json answer (its last stdout line): its error is said THERE, not on stderr
const answerOf = (r) => { try { return JSON.parse(String(r.out || '').trim().split('\n').filter(Boolean).pop()); } catch { return null; } };
const filesOf = (w) => { const out = []; const walk = (d, depth) => { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { const p = path.join(d, e.name); if (e.isDirectory() && depth < 4) walk(p, depth + 1); else if (e.isFile() && /log|debug|daemon/i.test(e.name)) out.push(p); } }; for (const r of [w.home, w.tmp, w.xdg, w.cwd]) walk(r, 0); return out; };
const tailOf = (f, n = 40) => { try { return fs.readFileSync(f, 'utf8').split('\n').slice(-n).join('\n'); } catch { return ''; } };
const PREPARE_FAIL = 'failed to prepare new page session';
const prepareFailsOf = (w) => filesOf(w).reduce((n, f) => { let s = ''; try { s = fs.readFileSync(f, 'utf8'); } catch { return n; } return n + s.split('\n').filter((l) => l.includes(PREPARE_FAIL)).length; }, 0);

// warm the four sessions: each opens a page through its road (its daemon attached) — the scoped two through their grants
const warmed = {};
// (r5, the whole suite read for timing and for the bare road: the four warm-ups run before any churn — no tab dies under a drain
// yet, so the stall's cause is absent and the bare two answer here like the scoped two)
for (const w of [SA, SB, A, Bw]) warmed[w.name] = await drive(w, ['open', PAGE(`${w.name.toLowerCase()}0`), '--json'], 30000);
if (!ok(Object.values(warmed).every((r) => r.code === 0), 'the four sessions answer through the suite\'s Chrome — SA and SB through their scope grants, A and B `--cdp` to the browser itself (each road: one namespace, two sessions — a shared profile\'s two holders)', Object.fromEntries(Object.entries(warmed).map(([k, r]) => [k, r.code === 0 ? 0 : { code: r.code, err: r.err.slice(-300), answer: answerOf(r) }])))) { try { med.shutdown(); } catch { /* */ } report(); }

// B's churn: ONLY inside a way — started with it, stopped with it, never a free loop. Its state is kept: how many cycles,
// which of B's commands is IN FLIGHT right now and for how long (the condition the row names: the other holder's command in
// Chrome while the bind runs — r2: the first box run started the churn WITH the bind, and nothing overlapped)
const churn = (b) => {
  let on = true, cycles = 0, k = 0, cur = null; const calls = [];
  const step = async (args, t) => { cur = { what: args[1], since: Date.now() }; const r = await drive(b, args, t); cur = null; calls.push(r.ms); return r; };
  const done = (async () => { while (on) { const t = await step(['tab', 'new', PAGE(`c${b.name}${k++}`), '--json'], 15000); if (t.code === 0) await step(['tab', 'close', '--json'], 10000); else await sleep(200); cycles++; } })();
  return { cycles: () => cycles, now: () => (cur ? { what: cur.what, inFlightMs: Date.now() - cur.since } : null), stop: async () => { on = false; await done; return { cycles, maxCallMs: calls.length ? Math.max(...calls) : 0, calls: calls.length }; } };
};
const until = async (fn, ms, step = 25) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(step); } return !!fn(); };
// a way starts only with room for its worst case by its own bounds: the warm-up, the wait for B's command, the bind, the
// navigate, and B's last command at the stop (tab new 15 s + tab close 10 s); the end's three tab lists and the browser's own page
// list keep END_MS — so the
// cap holds by construction
const WARM_CYCLES = 3, WARM_MS = 6000, INFLIGHT_MS = 2000, NAV_MS = 25000, B_LAST_MS = 25000, END_MS = 55000, WAY_MS = WARM_MS + INFLIGHT_MS + BIND_MS + NAV_MS + B_LAST_MS;
const slowLines = (w, r) => (r.ms > SLOW_MS ? { stderr: r.err.split('\n').filter(Boolean).slice(-30), files: Object.fromEntries(filesOf(w).map((f) => [path.relative(ROOT, f), tailOf(f, 30).split('\n').filter(Boolean)])) } : null);
const brief = (r) => { if (!r) return null; const j = r.code !== 0 ? answerOf(r) : null; return { ms: r.ms, code: r.code, ...(r.code !== 0 ? { why: r.err.split('\n').filter(Boolean).slice(-2), answer: j && j.error != null ? String(j.error).slice(0, 300) : null } : {}) }; };
/** ONE way of a trial on ONE road: the churn warmed (the other holder's loop running), the tab made on the browser socket (and
 *  admitted to the holder's grant on the scoped road, as the keeper's openOwnTab does), the bind started while B's `tab new` is
 *  in flight, then the navigate — the churn stopped at the end */
async function way(n, road) {
  const c = churn(road.b);
  await until(() => c.cycles() >= WARM_CYCLES, WARM_MS);
  const id = await newTab(`${n}${road.tag}`);
  if (!id) { await c.stop(); return { road: road.name, error: 'no tab made' }; }
  if (road.admit) road.admit(id);
  // the bind starts while B's `tab new` has been out ≥ 10 ms (its CLI past its start, its daemon making the target)
  await until(() => { const b = c.now(); return !!(b && b.what === 'new' && b.inFlightMs >= 10); }, INFLIGHT_MS, 2);
  const bAtBind = c.now(), inFlightAtBind = !!bAtBind, cyclesAtBind = c.cycles();
  const bind = await drive(road.a, ['--pin-tab', 'tab', id, '--json'], BIND_MS);
  const nav = bind.code === 0 ? await drive(road.a, ['--pin-tab', 'open', PAGE(`${n}${road.tag}-nav`), '--json'], NAV_MS) : null;
  const ch = await c.stop();
  await cdp('Target.closeTarget', { targetId: id });
  return { road: road.name, n, inFlightAtBind, bAtBind, cyclesAtBind, bind: brief(bind), nav: brief(nav), churn: ch, lines: slowLines(road.a, bind) || (nav ? slowLines(road.a, nav) : null) };
}

const ROADS = [
  { name: 'scoped', tag: 's', a: SA, b: SB, admit: (id) => med.admitTarget(SCOPE_PROFILE, SA_KEY, id), ways: [] },
  { name: 'bare', tag: 'b', a: A, b: Bw, admit: null, ways: [] },
];
let capped = false;
outer: for (let i = 1; i <= TRIALS; i++) {
  for (const road of ROADS) {
    if (left() < WAY_MS + END_MS) { capped = true; break outer; }
    const w = await way(i, road);
    road.ways.push(w);
    console.log(`B-19a9 MEASURE ${road.name} ${i} ${JSON.stringify(w)}`);
  }
}
if (capped) console.log(`B-19a9 MEASURE: stopped at the cap — ${ROADS.map((r) => `${r.name} ${r.ways.length}`).join(', ')} way(s) in ${Math.round((Date.now() - T0) / 1000)} s (the leg's own clock, ${CAP_MS / 60000} min)`);

// the end's reads: each road's holder lists its tabs — the scope's own control (SB's warm tab is in the browser all along)
// r4 (box row 124): the lists are compared by TARGET ID, never by url — a bare holder's `open` drives a tab it discovered (the
// bare A's warm-up navigated SA's own tab to A's page), so a url names no holder. SB's tabs are what SB's own scoped list holds.
const listOf = async (w) => { const r = await drive(w, ['tab', 'list', '--json'], 15000); const j = answerOf(r); const tabs = j && j.data && Array.isArray(j.data.tabs) ? j.data.tabs : null; return { code: r.code, n: tabs ? tabs.length : null, ids: tabs ? tabs.map((t) => String(t.targetId || '').toUpperCase()).filter(Boolean) : null, urls: tabs ? tabs.map((t) => String(t.url || '')) : null, ...(tabs ? {} : { unread: String(r.out || '').slice(0, 300), bytes: String(r.out || '').length }) }; };
// r5: the control's reference is the BROWSER's own page list (Target.getTargets on the suite's socket) — the bare A's list is read and
// PRINTED only: at the end its drain can still be held by B's last tab (the very stall), past any list bound
const listSB = await listOf(SB), listSA = await listOf(SA), listA = await listOf(A);
const browserPages = await cdp('Target.getTargets').then((r) => (r && r.result && Array.isArray(r.result.targetInfos) ? r.result.targetInfos.filter((t) => t.type === 'page').map((t) => String(t.targetId).toUpperCase()) : null));
const SB_IDS = Array.isArray(listSB.ids) ? listSB.ids : [];
const fails = { SA: prepareFailsOf(SA), A: prepareFailsOf(A) };

const okWays = (road) => road.ways.filter((w) => w && !w.error);
const count = (road) => { const ws = okWays(road); const calls = ws.flatMap((w) => [w.bind, w.nav].filter(Boolean)); return { ways: ws.length, binds: ws.length, overFiveSeconds: calls.filter((r) => r.ms > SLOW_MS).length, failed: calls.filter((r) => r.code !== 0).length, bindsOverFiveSeconds: ws.filter((w) => w.bind.ms > SLOW_MS).length, navsOverFiveSeconds: ws.filter((w) => w.nav && w.nav.ms > SLOW_MS).length, bindsFailed: ws.filter((w) => w.bind.code !== 0).length, navsFailed: ws.filter((w) => w.nav && w.nav.code !== 0).length }; };
const [SCOPED, BARE] = ROADS;
console.log(`B-19a9 MEASURE summary ${JSON.stringify({ capped, seconds: Math.round((Date.now() - T0) / 1000), scoped: { ...count(SCOPED), prepareFailLines: fails.SA }, bare: { ...count(BARE), prepareFailLines: fails.A } })}`);
const allWays = ROADS.flatMap((r) => okWays(r));
ok(okWays(SCOPED).length >= 1 && okWays(BARE).length >= 1 && SCOPED.ways.every((w) => w && !w.error), `the measure ran on both roads (scoped ${okWays(SCOPED).length}, bare ${okWays(BARE).length} way(s); ways with no tab made: scoped ${SCOPED.ways.filter((w) => !w || w.error).length}, bare ${BARE.ways.filter((w) => !w || w.error).length} — a scoped one is red: the law would skip it)${capped ? ', stopped at the cap' : ''}) — printed above`, ROADS.map((r) => r.ways.filter((w) => w && w.error).map((w) => w.error)));
// r5 (box row 134, the coordinator's r1774): THE CONDITION'S LAW, per road, and ONE predicate per road for the verdict AND for the
// ways it names (r4 named the ways by another rule than its verdict, so a red printed []):
//   SCOPED — the law's premise, judged at EVERY bind: SB's `tab new` in flight ≥ 10 ms at the bind's start AND its loop warmed (≥ 1
//     cycle done): SB's daemon sees only its own tabs, nothing can hold it;
//   BARE (the control) — judged by IN-FLIGHT ALONE: a command of B's in flight at the bind's start. Its warm-up cycles are a means,
//     and on this road the very stall can eat them (row 134: B's own first `tab new` held 6016 / 6022 ms, 0 cycles) — printed.
const conditionOf = { scoped: (w) => !!(w.bAtBind && w.bAtBind.what === 'new' && w.bAtBind.inFlightMs >= 10 && w.cyclesAtBind >= 1), bare: (w) => !!(w.inFlightAtBind && w.bAtBind && w.bAtBind.inFlightMs >= 10) };
const missedCondition = ROADS.flatMap((r) => okWays(r).filter((w) => !conditionOf[r.name](w)).map((w) => ({ road: w.road, n: w.n, bAtBind: w.bAtBind, cyclesAtBind: w.cyclesAtBind })));
ok(allWays.length > 0 && missedCondition.length === 0, `THE CONDITION WAS MEASURED — scoped: at every bind SB's \`tab new\` in flight ≥ 10 ms and its loop warmed; bare: a command of B's in flight ≥ 10 ms at every bind (B's cycles at each bind: ${ROADS.map((r) => `${r.name} ${okWays(r).map((w) => w.cyclesAtBind).join(' ')}`).join(' · ')})`, missedCondition.slice(0, 6));
const sw = okWays(SCOPED);
ok(sw.length > 0 && sw.every((w) => w.bind.code === 0 && w.bind.ms <= SLOW_MS && w.nav && w.nav.ms <= SLOW_MS), `THE LAW — the scoped road (the product's, for an agent's lease on a local shared profile): every bind of SA answered within 5 s and every navigate after it too, under SB's churn (binds ${sw.map((w) => w.bind.ms).join(' ')} ms; navigates ${sw.map((w) => (w.nav ? `${w.nav.ms}${w.nav.code === 0 ? '' : '/' + w.nav.code}` : '—')).join(' ')} ms)`, sw.filter((w) => !(w.bind.code === 0 && w.bind.ms <= SLOW_MS && w.nav && w.nav.ms <= SLOW_MS)).slice(0, 3).map((w) => ({ bind: w.bind, nav: w.nav })));
ok(fails.SA === 0, `…and SA's daemon log holds no «${PREPARE_FAIL}» — SB's tabs never reached its drain (the bare A's log: ${fails.A} such line(s))`, fails.SA);
ok(listSB.code === 0 && SB_IDS.length >= 1 && listSA.code === 0 && Array.isArray(listSA.ids) && !SB_IDS.some((t) => listSA.ids.includes(t)) && Array.isArray(browserPages) && SB_IDS.every((t) => browserPages.includes(t)), `THE SCOPE HELD — SA's tab list holds none of SB's tabs (by target id), where the browser's own page list holds them all (the control that this check can fail) — SB ${SB_IDS.length}, SA ${listSA.n}, the browser ${browserPages ? browserPages.length : 'unread'} page(s); the bare A's list (printed): ${listA.code === 0 ? `${listA.n} tab(s), SB's ${SB_IDS.filter((t) => (listA.ids || []).includes(t)).length} of ${SB_IDS.length}` : `code ${listA.code}`}`, { SB: listSB, SA: listSA, browser: browserPages, A: listA });

try { bws.close(); } catch { /* */ }
try { srv.close(); } catch { /* */ }
try { med.shutdown(); } catch { /* */ }
const left2 = endMine();
console.log(`the end: ${left2.length} process(es) of this root ended by pid + start time (Chrome, the sessions' daemons): ${JSON.stringify(left2)}`);
report();
