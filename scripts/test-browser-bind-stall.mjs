#!/usr/bin/env node
// B-19a9 — THE TAB BIND UNDER ANOTHER HOLDER'S CHURN, MEASURED ON THE REAL DRIVER (heavy, run ALONE; the coordinator's r194 / r720).
// The row: on a shared profile the keeper binds a new tab to its holder's session with the driver's own `--pin-tab tab <id>`
// (src/server/browser-keeper.js openOwnTab, a 30 s exec bound); under ANOTHER holder's `tab new` + `tab close` the bind answered
// after ~30 s in 1–4 of 10 (the browser-windows lane's own scripts, never a tree leg), and the keeper refuses window_busy
// (bind_failed). THIS SUITE MEASURES — it changes no product file and JUDGES NOTHING of the stall (printed, judged nowhere):
//   each TRIAL makes three background tabs on the browser's own socket and binds each with session A's `--cdp <the browser> --pin-tab
//   tab <id> --json` (the keeper's call on the attach road), then navigates it (`--pin-tab open <url>`: the keeper's bind + navigate),
//   while session B churns — its loop WARMED first (3 cycles, ≤ 6 s) and the bind started only while B's `tab new` is IN FLIGHT
//   (r2, the coordinator's r856: the first box run started the churn WITH the bind; a bind answered in ~50 ms, before B's first
//   command reached Chrome — nothing overlapped, nothing measured; a leg now proves the overlap or goes red by name):
//     (a) as the keeper does today — one bind, bounded at 35 s;
//     (b) the bind ABANDONED at 5 s and asked ONCE more — both times;
//     (c) the tab ACTIVATED first on the browser socket (Target.activateTarget), then the bind.
//   Printed a trial: the three times and their answers, B's churn count, and — around a bind over 5 s — the driver's own lines
//   (session A runs EVERY call with AGENT_BROWSER_DEBUG=1, its daemon born with it: its stderr, and the log files its world holds;
//   a sample of them is printed once whatever the times). THE CAUSE matters more than the
//   fastest of three: the lines say what the driver waits on, where they say it.
// THE THREE BOUNDS (r194, it runs on the hub's own box):
//   1. B's churn runs ONLY inside a trial's way: it starts with it and stops with it, never a free loop. Ten trials at most;
//      the whole leg is capped at FOUR MINUTES by its own clock, and says so when it stops at the cap.
//   2. ONE Chrome, the suite's own (headless, CHROME_QUIET + CHROME_STORE, scripts/scratch.mjs): every driver call ATTACHES to it
//      (`--cdp`), none launches one. A loopback page. Nothing else is started.
//   3. Each trial prints its line «B-19a9 MEASURE trial n {…}»; the closing summary counts the binds over 5 s per way.
// ONLY WHAT IT STARTED: every folder under this run's stamped scratch root (each session's HOME, TMPDIR, XDG_RUNTIME_DIR, its
// cwd); the page and Chrome on free ports; at the end (and at exit) this root's processes — Chrome, the sessions' daemons — are
// ended by pid + start time, never another. Without the real agent-browser (the tree's fence: src/browser-facts.js
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
const { WebSocket } = require('ws');

const { ok, report } = checker();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CAP_MS = 4 * 60000, TRIALS = 10, BIND_MS = 35000, ABANDON_MS = 5000, SLOW_MS = 5000;
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

// ── the two sessions: one namespace (a shared profile's holders), each its own world ──
const world = (name, { debug = false } = {}) => { const d = path.join(ROOT, name); const w = { name, debug, home: path.join(d, 'home'), tmp: path.join(d, 'tmp'), xdg: path.join(d, 'xdg'), cwd: path.join(d, 'cwd') }; for (const x of [w.home, w.tmp, w.xdg, w.cwd]) fs.mkdirSync(x, { recursive: true, mode: 0o700 }); return w; };
// session A runs EVERY call with AGENT_BROWSER_DEBUG=1, its first included: its daemon is born with it (a call with another view
// could restart that daemon — the keeper's leaseCliOpts note), so the bind meets the same daemon the warm-up made
const A = world('A', { debug: true }), Bw = world('B');
const drive = (w, args, timeout) => new Promise((resolve) => {
  const t0 = Date.now();
  execFile(REAL_AB, ['--cdp', BROWSER_WS, ...args], { encoding: 'utf8', timeout, killSignal: 'SIGKILL', cwd: w.cwd, maxBuffer: 8 * 1024 * 1024,
    env: { ...BASE_ENV, HOME: w.home, TMPDIR: w.tmp, XDG_RUNTIME_DIR: w.xdg, AGENT_BROWSER_NAMESPACE: 'b19a9', AGENT_BROWSER_SESSION: `vs-${w.name}`, AGENT_BROWSER_JSON: '1', ...(w.debug ? { AGENT_BROWSER_DEBUG: '1' } : {}) } },
    (err, stdout, stderr) => resolve({ ms: Date.now() - t0, code: err ? (err.killed ? 'timeout' : (err.code || 1)) : 0, out: String(stdout || '').slice(-1500), err: String(stderr || '').slice(-4000) }));
});
const filesOf = (w) => { const out = []; const walk = (d, depth) => { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { const p = path.join(d, e.name); if (e.isDirectory() && depth < 4) walk(p, depth + 1); else if (e.isFile() && /log|debug|daemon/i.test(e.name)) out.push(p); } }; for (const r of [w.home, w.tmp, w.xdg, w.cwd]) walk(r, 0); return out; };
const tailOf = (f, n = 40) => { try { return fs.readFileSync(f, 'utf8').split('\n').slice(-n).join('\n'); } catch { return ''; } };

// warm both sessions: each opens a page through the suite's Chrome (its daemon attached)
const wa = await drive(A, ['open', PAGE('a0'), '--json'], 30000), wb = await drive(Bw, ['open', PAGE('b0'), '--json'], 30000);
if (!ok(wa.code === 0 && wb.code === 0, 'both sessions answer through the suite\'s Chrome (`--cdp`, one namespace, two sessions — a shared profile\'s two holders)', { a: wa.code, b: wb.code, aerr: wa.err.slice(-300), berr: wb.err.slice(-300) })) { report(); }

// B's churn: ONLY inside a trial's way — started with it, stopped with it, never a free loop. Its state is kept: how many cycles,
// which of B's commands is IN FLIGHT right now and for how long (the condition the row names: the other holder's command in Chrome while the
// bind runs — r2 of this leg: the first box run started the churn WITH the bind, a bind answered in ~50 ms before B's first command
// reached Chrome, and nothing overlapped)
const churn = () => {
  let on = true, cycles = 0, k = 0, cur = null; const calls = [];
  const step = async (args, t) => { cur = { what: args[1], since: Date.now() }; const r = await drive(Bw, args, t); cur = null; calls.push(r.ms); return r; };
  const done = (async () => { while (on) { const t = await step(['tab', 'new', PAGE(`c${k++}`), '--json'], 15000); if (t.code === 0) await step(['tab', 'close', '--json'], 10000); else await sleep(200); cycles++; } })();
  return { cycles: () => cycles, now: () => (cur ? { what: cur.what, inFlightMs: Date.now() - cur.since } : null), stop: async () => { on = false; await done; return { cycles, maxCallMs: calls.length ? Math.max(...calls) : 0, calls: calls.length }; } };
};
const until = async (fn, ms, step = 25) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(step); } return !!fn(); };
// a way starts only with room for its worst case by its own bounds: the warm-up, the wait for B's command, the abandoned bind and
// its second ask, the navigate, and B's last command at the stop (tab new 15 s + tab close 10 s) — so the cap holds by construction
const WARM_CYCLES = 3, WARM_MS = 6000, INFLIGHT_MS = 2000, NAV_MS = 25000, B_LAST_MS = 25000, WAY_MS = WARM_MS + INFLIGHT_MS + ABANDON_MS + BIND_MS + NAV_MS + B_LAST_MS;
let debugSample = null;
const slowLines = (r) => (r.ms > SLOW_MS ? { stderr: r.err.split('\n').filter(Boolean).slice(-30), files: Object.fromEntries(filesOf(A).map((f) => [path.relative(ROOT, f), tailOf(f, 30).split('\n').filter(Boolean)])) } : null);
const brief = (r) => (r ? { ms: r.ms, code: r.code, ...(r.code !== 0 ? { why: r.err.split('\n').filter(Boolean).slice(-2) } : {}) } : null);
/** ONE way of a trial: the churn warmed (the other holder's loop running), the tab made (and activated for (c)), the bind started
 *  while B's `tab new` is in flight, then the navigate (the keeper's bind + navigate) — the churn stopped at the end */
async function way(n, kind) {
  const c = churn();
  await until(() => c.cycles() >= WARM_CYCLES, WARM_MS);
  const id = await newTab(`${n}${kind}`);
  if (!id) { await c.stop(); return { kind, error: 'no tab made' }; }
  const act = kind === 'c' ? await cdp('Target.activateTarget', { targetId: id }) : null;
  // the bind starts while B's `tab new` has been out ≥ 10 ms (its CLI past its start, its daemon making the target A's daemon meets)
  await until(() => { const b = c.now(); return !!(b && b.what === 'new' && b.inFlightMs >= 10); }, INFLIGHT_MS, 2);
  const bAtBind = c.now(), inFlightAtBind = !!bAtBind, cyclesAtBind = c.cycles();
  const bind1 = await drive(A, ['--pin-tab', 'tab', id, '--json'], kind === 'b' ? ABANDON_MS : BIND_MS);
  const bind2 = kind === 'b' && bind1.code !== 0 ? await drive(A, ['--pin-tab', 'tab', id, '--json'], BIND_MS) : null;
  const bound = bind2 || bind1;
  const nav = bound.code === 0 ? await drive(A, ['--pin-tab', 'open', PAGE(`${n}${kind}-nav`), '--json'], NAV_MS) : null;
  const ch = await c.stop();
  if (!debugSample) debugSample = { stderr: bind1.err.split('\n').filter(Boolean).slice(0, 15), files: Object.fromEntries(filesOf(A).slice(0, 6).map((f) => [path.relative(ROOT, f), tailOf(f, 8).split('\n').filter(Boolean)])) };
  await cdp('Target.closeTarget', { targetId: id });
  return { kind, inFlightAtBind, bAtBind, cyclesAtBind, bind: brief(bind1), ...(bind2 ? { second: brief(bind2) } : {}), nav: brief(nav), ...(kind === 'c' ? { activated: !!(act && !act.error) } : {}), churn: ch,
    lines: slowLines(bound) || (nav ? slowLines(nav) : null) };
}

const rows = []; let capped = false;
outer: for (let i = 1; i <= TRIALS; i++) {
  const T = { trial: i };
  for (const kind of ['a', 'b', 'c']) {
    if (left() < WAY_MS) { capped = true; if (Object.keys(T).length > 1) rows.push(T); break outer; }
    T[kind] = await way(i, kind);
  }
  rows.push(T);
  console.log(`B-19a9 MEASURE trial ${i} ${JSON.stringify(T)}`);
}
console.log(`B-19a9 MEASURE the driver's own debug lines, a sample (session A runs with AGENT_BROWSER_DEBUG=1: the first bind's stderr, and the log files its world holds): ${JSON.stringify(debugSample)}`);
if (capped) console.log(`B-19a9 MEASURE: stopped at the cap — ${rows.length} trial(s) in ${Math.round((Date.now() - T0) / 1000)} s (the leg's own clock, ${CAP_MS / 60000} min)`);
const ways = rows.flatMap((t) => ['a', 'b', 'c'].map((k) => t[k]).filter((w) => w && !w.error));
const slow = (k, pick) => ways.filter((w) => w.kind === k).filter((w) => { const r = pick(w); return r && (r.ms > SLOW_MS || r.code !== 0); }).length;
console.log(`B-19a9 MEASURE summary ${JSON.stringify({ trials: rows.length, capped, binds: ways.length, overFiveSeconds: { aBind: slow('a', (w) => w.bind), bBound: slow('b', (w) => w.second || w.bind), cBind: slow('c', (w) => w.bind), nav: ways.filter((w) => w.nav && (w.nav.ms > SLOW_MS || w.nav.code !== 0)).length }, bAbandoned: ways.filter((w) => w.kind === 'b' && w.bind && w.bind.code !== 0).length, overlapped: ways.filter((w) => w.inFlightAtBind).length, seconds: Math.round((Date.now() - T0) / 1000) })}`);
ok(rows.length >= 1, `the measure ran (${rows.length} trial(s)${capped ? ', stopped at the cap' : ''}) — printed above; the stall itself judged nowhere`);
ok(ways.length > 0 && ways.every((w) => w.inFlightAtBind && w.cyclesAtBind >= 1), 'THE CONDITION WAS MEASURED: at every bind\'s start the other session\'s `tab new` was in flight (≥ 10 ms), its loop already running (a run where nothing overlapped measured nothing — red by name)', ways.filter((w) => !w.inFlightAtBind).map((w) => w.kind).slice(0, 6));

try { bws.close(); } catch { /* */ }
try { srv.close(); } catch { /* */ }
const left2 = endMine();
console.log(`the end: ${left2.length} process(es) of this root ended by pid + start time (Chrome, the sessions' daemons): ${JSON.stringify(left2)}`);
report();
