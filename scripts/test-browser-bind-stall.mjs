#!/usr/bin/env node
// B-19a9 — THE TAB BIND UNDER ANOTHER HOLDER'S CHURN, MEASURED ON THE REAL DRIVER (heavy, run ALONE; the coordinator's r194 / r720).
// The row: on a shared profile the keeper binds a new tab to its holder's session with the driver's own `--pin-tab tab <id>`
// (src/server/browser-keeper.js openOwnTab, a 30 s exec bound); under ANOTHER holder's `tab new` + `tab close` the bind answered
// after ~30 s in 1–4 of 10 (the browser-windows lane's own scripts, never a tree leg), and the keeper refuses window_busy
// (bind_failed). THIS SUITE MEASURES — it changes no product file and JUDGES NOTHING of the stall (printed, judged nowhere):
//   each TRIAL makes three background tabs on the browser's own socket and binds each with session A's `--cdp <the browser> --pin-tab
//   tab <id> --json` (the keeper's call on the attach road), while session B churns:
//     (a) as the keeper does today — one bind, bounded at 35 s;
//     (b) the bind ABANDONED at 5 s and asked ONCE more — both times;
//     (c) the tab ACTIVATED first on the browser socket (Target.activateTarget), then the bind.
//   Printed a trial: the three times and their answers, B's churn count, and — around a bind over 5 s — the driver's own lines
//   (session A runs with AGENT_BROWSER_DEBUG=1: its stderr, and the log files its world holds). THE CAUSE matters more than the
//   fastest of three: the lines say what the driver waits on, where they say it.
// THE THREE BOUNDS (r194, it runs on the hub's own box):
//   1. B's churn runs ONLY while a bind is out: it starts with the bind and stops with it, never a free loop. Ten trials at most;
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
const world = (name) => { const d = path.join(ROOT, name); const w = { name, home: path.join(d, 'home'), tmp: path.join(d, 'tmp'), xdg: path.join(d, 'xdg'), cwd: path.join(d, 'cwd') }; for (const x of [w.home, w.tmp, w.xdg, w.cwd]) fs.mkdirSync(x, { recursive: true, mode: 0o700 }); return w; };
const A = world('A'), Bw = world('B');
const drive = (w, args, timeout, { debug = false } = {}) => new Promise((resolve) => {
  const t0 = Date.now();
  execFile(REAL_AB, ['--cdp', BROWSER_WS, ...args], { encoding: 'utf8', timeout, killSignal: 'SIGKILL', cwd: w.cwd, maxBuffer: 8 * 1024 * 1024,
    env: { ...BASE_ENV, HOME: w.home, TMPDIR: w.tmp, XDG_RUNTIME_DIR: w.xdg, AGENT_BROWSER_NAMESPACE: 'b19a9', AGENT_BROWSER_SESSION: `vs-${w.name}`, AGENT_BROWSER_JSON: '1', ...(debug ? { AGENT_BROWSER_DEBUG: '1' } : {}) } },
    (err, stdout, stderr) => resolve({ ms: Date.now() - t0, code: err ? (err.killed ? 'timeout' : (err.code || 1)) : 0, out: String(stdout || '').slice(-1500), err: String(stderr || '').slice(-4000) }));
});
const filesOf = (w) => { const out = []; const walk = (d, depth) => { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { const p = path.join(d, e.name); if (e.isDirectory() && depth < 4) walk(p, depth + 1); else if (e.isFile() && /log|debug|daemon/i.test(e.name)) out.push(p); } }; for (const r of [w.home, w.tmp, w.xdg, w.cwd]) walk(r, 0); return out; };
const tailOf = (f, n = 40) => { try { return fs.readFileSync(f, 'utf8').split('\n').slice(-n).join('\n'); } catch { return ''; } };

// warm both sessions: each opens a page through the suite's Chrome (its daemon attached)
const wa = await drive(A, ['open', PAGE('a0'), '--json'], 30000), wb = await drive(Bw, ['open', PAGE('b0'), '--json'], 30000);
if (!ok(wa.code === 0 && wb.code === 0, 'both sessions answer through the suite\'s Chrome (`--cdp`, one namespace, two sessions — a shared profile\'s two holders)', { a: wa.code, b: wb.code, aerr: wa.err.slice(-300), berr: wb.err.slice(-300) })) { report(); }

// B's churn: ONLY while a bind is out — started with it, stopped with it
const churn = () => { let on = true, n = 0, k = 0; const done = (async () => { while (on) { const t = await drive(Bw, ['tab', 'new', PAGE(`c${k++}`), '--json'], 15000); if (!on) { if (t.code === 0) await drive(Bw, ['tab', 'close', '--json'], 10000); break; } await drive(Bw, ['tab', 'close', '--json'], 10000); n++; } return n; })(); return { stop: async () => { on = false; return done; } }; };
const bind = async (id, timeout) => { const c = churn(); const r = await drive(A, ['--pin-tab', 'tab', id, '--json'], timeout, { debug: true }); const n = await c.stop(); return { ...r, churn: n }; };
const lines = (r) => (r.ms > SLOW_MS ? { stderr: r.err.split('\n').filter(Boolean).slice(-30), files: Object.fromEntries(filesOf(A).map((f) => [path.relative(ROOT, f), tailOf(f, 30).split('\n').filter(Boolean)])) } : null);
const brief = (r) => ({ ms: r.ms, code: r.code, churn: r.churn, ...(r.code !== 0 ? { why: r.err.split('\n').filter(Boolean).slice(-2) } : {}) });

const rows = []; let capped = false;
for (let i = 1; i <= TRIALS; i++) {
  if (left() < 3 * BIND_MS) { capped = true; break; }
  const T = {};
  // (a) as the keeper does today
  const ia = await newTab(`t${i}a`); const ra = ia ? await bind(ia, BIND_MS) : { ms: 0, code: 'no tab', churn: 0, err: '' }; T.a = brief(ra); T.aLines = lines(ra); if (ia) await cdp('Target.closeTarget', { targetId: ia });
  // (b) abandoned at 5 s, asked once more
  const ib = await newTab(`t${i}b`);
  const rb1 = ib ? await bind(ib, ABANDON_MS) : { ms: 0, code: 'no tab', churn: 0, err: '' };
  const rb2 = ib && rb1.code !== 0 ? await bind(ib, BIND_MS) : null;
  T.b = { first: brief(rb1), ...(rb2 ? { second: brief(rb2) } : {}) }; T.bLines = lines(rb2 || rb1); if (ib) await cdp('Target.closeTarget', { targetId: ib });
  // (c) activated first on the browser socket
  const ic = await newTab(`t${i}c`); const act = ic ? await cdp('Target.activateTarget', { targetId: ic }) : null;
  const rc = ic ? await bind(ic, BIND_MS) : { ms: 0, code: 'no tab', churn: 0, err: '' }; T.c = { ...brief(rc), activated: !!(act && !act.error) }; T.cLines = lines(rc); if (ic) await cdp('Target.closeTarget', { targetId: ic });
  rows.push(T);
  console.log(`B-19a9 MEASURE trial ${i} ${JSON.stringify(T)}`);
}
if (capped) console.log(`B-19a9 MEASURE: stopped at the cap — ${rows.length} trial(s) in ${Math.round((Date.now() - T0) / 1000)} s (the leg's own clock, ${CAP_MS / 60000} min)`);
const slow = (pick) => rows.filter((t) => { const r = pick(t); return r && (r.ms > SLOW_MS || r.code !== 0); }).length;
console.log(`B-19a9 MEASURE summary ${JSON.stringify({ trials: rows.length, capped, overFiveSeconds: { a: slow((t) => t.a), bSecond: slow((t) => t.b.second || t.b.first), c: slow((t) => t.c) }, bAbandoned: rows.filter((t) => t.b.first.code !== 0).length, seconds: Math.round((Date.now() - T0) / 1000) })}`);
ok(rows.length >= 1, `the measure ran (${rows.length} trial(s)${capped ? ', stopped at the cap' : ''}) — printed above, judged nowhere`);

try { bws.close(); } catch { /* */ }
try { srv.close(); } catch { /* */ }
const left2 = endMine();
console.log(`the end: ${left2.length} process(es) of this root ended by pid + start time (Chrome, the sessions' daemons): ${JSON.stringify(left2)}`);
report();
