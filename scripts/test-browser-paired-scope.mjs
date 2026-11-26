#!/usr/bin/env node
// B-19a9 — THE PAIRED-MACHINE ROAD, MEASURED AND JUDGED THROUGH A REAL DEVICE AGENT (heavy, run ALONE; the coordinator's r1840 /
// r1846 / r2043). A paired machine's browser is reached by the hub through its OWN loopback listener piping into the device agent's
// mux (src/server/browser-access.js forwardCdp → DeviceManager.tcpForward), so the leases' drivers run on the HUB — the 30 s bind
// under another holder's tabs (agent-browser 0.38.2: its daemon drains every new target one at a time under its one state lock, each
// CDP call waiting up to 30 s) is the hub's, and its cure is the local road's twin: the SAME cdp-mediator in scope mode with the
// forward as its upstream (leaseRoadVerdict: a paired machine is a PARAMETER of the scope road). This suite stands it up whole:
//   · THE SUITE's OWN PAIRING: the device agent built as it ships (scripts/agentd-bundle.mjs), booted on loopback under this run's
//     scratch root (DeviceManager.installLocal + connect), handed to the tree's own browser-access through a stand-in registry;
//   · ONE Chrome, the suite's own (headless, CHROME_QUIET + CHROME_STORE), on the "machine": the forward names its port;
//   · the real driver through the tree's fence (src/browser-facts.js binaryResolver), its sessions under the suite's OWN label
//     (AGENT_BROWSER_NAMESPACE = a name of this suite with its run's mark — they never meet another conversation's sessions),
//     their sockets in a SHORT folder of the suite's own (AGENT_BROWSER_SOCKET_DIR = a second stamped scratch root, r4773);
//     no operating-system namespace of any kind (no unshare, no netns, no user or mount namespace).
// THE LEGS:
//   ① each trial binds on BOTH roads through the forward while the other session churns `tab new` + `tab close`:
//      SCOPED (scope grants of the tree's cdp-mediator, upstream = the forward; the trial's tab admitted to SA as openOwnTab does) —
//      JUDGED: no bind and no navigate over 5 s, SA's daemon log without «failed to prepare new page session», the scope held by
//      target id (SA lists none of SB's tabs; the browser's own page list holds them); BARE (`--cdp` = the forward) — printed, the control;
//   ② THE FORWARD's FAULTS behind the proxy (r1846 (c)): the machine DROPS while SA is bound ⇒ SA's next command answers a refusal
//      within a bound, never a hang; the machine RE-DIALS ⇒ SA reaches its tab again through the SAME grant url; the forward's url
//      CHANGES ⇒ the grant REPOINTED reaches the browser through the new url — CONTROL: a grant left on the closed url refuses by name.
// ONLY WHAT IT STARTED: every folder under this run's stamped scratch roots (the suite's and its socket folder); Chrome, the page and the mediator on free ports; the
// device agent's daemon(s) ended by endDaemonsAndWait on its own root, every other process of this root by pid + start time, at the
// end and at exit. Without the real agent-browser or a Chrome it SKIPS BY NAME («SKIP: …», never a green). Zero vendor calls.
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn, execFile, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, freePort, CHROME_QUIET, CHROME_STORE, endDaemonsAndWait, DRIVER, driverHome } from './scratch.mjs';
import { agentdBundle } from './agentd-bundle.mjs';
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const Ff = require('../src/browser-facts.js');
const MED = require('../src/server/cdp-mediator.js');
const M = require('../src/browser-mediation.js');
const BA = require('../src/server/browser-access.js');
const { WebSocket } = require('ws');

const { ok, report } = checker();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CAP_MS = 6 * 60000, TRIALS = 4, BIND_MS = 35000, SLOW_MS = 5000, FAULT_MS = 20000, ANSWER_BOUND_MS = 15000;
const T0 = Date.now(), left = () => CAP_MS - (Date.now() - T0);

const ROOT = scratch('pairedscope');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true, mode: 0o700 });
// r4773 (the candidate's box row 953, the first real-driver read): the driver's socket is <root>/namespaces/<label>/run/<session>.sock
// and its root was each world's runtime folder (<world>/xdg/agent-browser) — 118 / 114 bytes against the driver's 103 («Session name
// 'vs-SA' is too long … set AGENT_BROWSER_SOCKET_DIR to a shorter path»). The sockets go to a SHORT folder of the suite's own instead:
// a second stamped scratch root (/tmp/vs-pss-<pid>, a folder a world), ended at exit like the first; the label stays the suite's own
// with its run's mark
const SOCKETS = scratch('pss');
fs.rmSync(SOCKETS, { recursive: true, force: true }); fs.mkdirSync(SOCKETS, { recursive: true, mode: 0o700 });
const AGENTD_ROOT = path.join(ROOT, 'agentd');
process.env.VIBESPACE_AGENTD_ROOT = AGENTD_ROOT;
process.env.VIBESPACE_NODE_MODULES = path.join(new URL('..', import.meta.url).pathname, 'node_modules');
const NS = `vs-pairedscope-${process.pid}-${T0}`;   // the suite's OWN session label, with its run's mark (r2043)
const under = (v, d) => { const s = String(v == null ? '' : v); return s === d || s.startsWith(d + '/'); };
const ours = (v) => under(v, ROOT) || under(v, SOCKETS);   // this run's two stamped roots
const BASE_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('AGENT_BROWSER_') && !k.startsWith('VIBESPACE_')
  && !['DISPLAY', 'WAYLAND_DISPLAY', 'XDG_SESSION_TYPE', 'DBUS_SESSION_BUS_ADDRESS', 'XAUTHORITY', 'TMPDIR', 'XDG_RUNTIME_DIR'].includes(k)));
const skipWhole = (why) => { console.log(`\nSKIP: ${why} — no leg ran on this machine`); process.exit(0); };

// ── identity: this root's processes are ended by pid + start time (the model: test-browser-bind-stall) ──
const statOf = (pid) => { try { const s = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'); const f = s.slice(s.lastIndexOf(')') + 2).split(' '); const st = Number(f[19]); return { ppid: Number(f[1]), st: Number.isFinite(st) ? st : null }; } catch { return null; } };
const MY_START = (statOf(process.pid) || {}).st;
function endMine() {
  const skip = new Set(); for (let q = process.pid; q > 1 && !skip.has(q);) { skip.add(q); const s = statOf(q); if (!s) break; q = s.ppid; }
  const hit = []; let pids = []; try { pids = fs.readdirSync('/proc').filter((d) => /^\d+$/.test(d)).map(Number); } catch { return hit; }
  for (const pid of pids) {
    if (skip.has(pid)) continue;
    const s1 = statOf(pid); if (!s1 || s1.st == null || MY_START == null || s1.st < MY_START) continue;
    let rooted = false;
    try { rooted = ours(fs.readlinkSync(`/proc/${pid}/cwd`)); } catch { /* not ours to read */ }
    if (!rooted) try { rooted = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split(/[\0\s]+/).some((t) => ours(t) || t.split('=').slice(1).some((v) => ours(v))); } catch { /* gone */ }
    if (!rooted) try { const env = fs.readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0'); rooted = ['HOME', 'XDG_RUNTIME_DIR', 'TMPDIR', 'VIBESPACE_AGENTD_ROOT', 'AGENT_BROWSER_SOCKET_DIR'].some((k) => ours((env.find((kv) => kv.startsWith(k + '=')) || '').slice(k.length + 1))); } catch { /* gone */ }
    if (!rooted) continue;
    const s2 = statOf(pid); if (!s2 || s2.st !== s1.st) continue;
    try { process.kill(pid, 'SIGKILL'); hit.push(`${pid}:${s1.st}`); } catch { /* gone */ }
  }
  return hit;
}
let current = null;   // the DeviceManager the stand-in registry answers (null = the machine is offline)
let chromeProc = null;   // the suite's ONE Chrome, ended by its held handle (the root's sweep below is the net)
const endAll = () => { try { if (current) current.stop(); } catch { /* */ } try { endDaemonsAndWait(AGENTD_ROOT); } catch { /* */ } try { if (chromeProc && chromeProc.pid > 1 && chromeProc.exitCode === null) chromeProc.kill('SIGKILL'); } catch { /* */ } return endMine(); };
process.on('exit', () => { try { endAll(); } catch { /* best effort at exit */ } });
for (const sg of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sg, () => process.exit(130));

// ── the fence: the real driver, a Chrome ──
const REAL_AB = (() => { try { return Ff.binaryResolver('agent-browser', BASE_ENV)(); } catch { return null; } })();
let ver = null;
try { const h0 = path.join(ROOT, 'v'); fs.mkdirSync(h0, { mode: 0o700 }); ver = REAL_AB ? execFileSync(REAL_AB, ['--version'], { encoding: 'utf8', timeout: 8000, env: { ...BASE_ENV, HOME: h0, TMPDIR: h0 } }).trim() : null; } catch { ver = null; }
if (!ver) skipWhole(`${DRIVER.skip} no real agent-browser resolves on PATH past the shim (the tree's real-driver fence, src/browser-facts.js binaryResolver — the driver's door: ${DRIVER.env}; PATH=${BASE_ENV.PATH || ''})`);
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) skipWhole('no Chrome on this machine');
console.log(`agent-browser: ${REAL_AB} (${ver}) · Chrome ${CHROME} · root ${ROOT} · sessions under ${NS} · ≤ ${TRIALS} trials, capped at ${CAP_MS / 60000} min`);

// ── the page, ONE Chrome ──
const PAGE_PORT = await freePort();
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(`<!doctype html><title>paired ${q.url}</title><h1>stand-in ${q.url}</h1>`); });
await new Promise((r) => srv.listen(PAGE_PORT, '127.0.0.1', r));
const PAGE = (n) => `http://127.0.0.1:${PAGE_PORT}/p${n}`;
const CDP_PORT = await freePort();
chromeProc = spawn(CHROME, [...CHROME_QUIET, ...CHROME_STORE, '--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', `--user-data-dir=${path.join(ROOT, 'chrome')}`, 'about:blank'], { stdio: 'ignore', env: { ...BASE_ENV, HOME: path.join(ROOT, 'chrome-home') } });
let BROWSER_WS = null;
for (let i = 0; i < 100 && !BROWSER_WS; i++) { try { BROWSER_WS = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json()).webSocketDebuggerUrl || null; } catch { await sleep(150); } }
if (!ok(!!BROWSER_WS, 'the suite\'s ONE Chrome answers its DevTools endpoint on the "machine" (headless, CHROME_QUIET + CHROME_STORE, its own profile dir)', String(BROWSER_WS))) report();

// ── THE SUITE's OWN PAIRING: the device agent as it ships, on loopback; the tree's own access layer over a stand-in registry ──
const version = require('../package.json').version;
const bundle = path.join(ROOT, 'agentd.js');
await agentdBundle({ version, outfile: bundle });
const dataDir = path.join(ROOT, 'hubdata'); fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
const { DeviceManager } = require('../src/agentd/client.js');
// r2182 (3): the device agent's OWN environment — the real driver on its PATH (browser-serve's `start` runs it) and its home inside this
// root (its ~/.agent-browser) — handed to its daemon at the FIRST dial only, then this process's own PATH / HOME are put back (a later
// leg never inherits them; a re-dial joins the running daemon, it spawns none)
const DEVICE_HOME = path.join(ROOT, 'device-home'); fs.mkdirSync(DEVICE_HOME, { recursive: true, mode: 0o700 });
driverHome(DEVICE_HOME);   // B-8695 follow (r4974 (1)): the driver's line in this home from its first launch (the device's browser-serve starts the driver here)
const withDeviceEnv = async (fn) => { const keep = { PATH: process.env.PATH, HOME: process.env.HOME }; process.env.PATH = `${path.dirname(REAL_AB)}:${keep.PATH || ''}`; process.env.HOME = DEVICE_HOME; try { return await fn(); } finally { process.env.PATH = keep.PATH; process.env.HOME = keep.HOME; } };
const dial = async () => { const dm = new DeviceManager({ dataDir, bundlePath: bundle, version, log: () => { } }); dm.installLocal(); await dm.connect(); return dm; };
current = await withDeviceEnv(dial);
const HOST_A = 'h-paired-a', HOST_B = 'h-paired-b';   // two names of the same stand-in machine: two forward listeners (the url change)
const hosts = { isLocal: () => false, get: (h) => (h === HOST_A || h === HOST_B ? { id: h } : null), deviceBounded: async () => { if (!current) throw new Error('the machine is offline'); return current; } };
const access = BA.create({ hosts, log: { log() { }, warn() { } }, install: false, connectMs: 3000 });
let fwd = null; try { fwd = await access.forwardCdp(HOST_A, CDP_PORT, { remoteUrl: BROWSER_WS }); } catch (e) { fwd = { error: String(e && e.message) }; }
if (!ok(!!(fwd && fwd.url && /^ws:\/\/127\.0\.0\.1:\d+\//.test(fwd.url) && !fwd.url.includes(`:${CDP_PORT}/`)), 'THE FORWARD: the tree\'s own browser-access forwardCdp puts the machine\'s browser on a HUB-side loopback url (a port of its own, piping into the real agent\'s mux)', fwd && (fwd.url || fwd.error))) report();
const FWD_URL = fwd.url;

// the hub's own view of the paired browser (the keeper's raw reads go through the forward too): make and close the trials' tabs
const sock = (url) => { const ws = new WebSocket(url, { maxPayload: 64 * 1024 * 1024 }); let seq = 0; const pend = new Map(); ws.on('message', (d) => { let m = null; try { m = JSON.parse(d); } catch { return; } if (m && m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const call = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); try { ws.send(JSON.stringify({ id, method, params })); } catch { pend.delete(id); r({ error: { message: 'closed' } }); } setTimeout(() => { if (pend.has(id)) { pend.delete(id); r({ error: { message: 'no answer in 10 s' } }); } }, 10000); });
  return { ws, call, open: new Promise((r, e) => { ws.once('open', r); ws.once('error', e); }) }; };
const hub = sock(FWD_URL); await hub.open;
const newTab = async (n) => { const r = await hub.call('Target.createTarget', { url: PAGE(n), background: true }); return r && r.result ? String(r.result.targetId) : null; };

// ── the mediator in this process (the hub makes ONE a run): a scope grant per scoped session, its upstream THE FORWARD ──
const med = MED.create({ log: { log() { }, warn() { } } });
const PROFILE = 'bp-0000a1a1', SA_KEY = 'bk-0000a5a1', SB_KEY = 'bk-0000b5b1', SC_KEY = 'bk-0000c5c1';
const gSA = await med.grantFor({ profileId: PROFILE, browserKey: SA_KEY, upstream: FWD_URL, mode: M.SCOPE_MODE, paused: () => false });
const gSB = await med.grantFor({ profileId: PROFILE, browserKey: SB_KEY, upstream: FWD_URL, mode: M.SCOPE_MODE, paused: () => false });
const road = M.leaseRoadVerdict({ proxy: true, paired: true, agent: true });
ok(road.mode === M.SCOPE_MODE && road.paired === true && !!gSA.url && gSA.url !== gSB.url, 'the road a paired machine\'s agent lease takes is the SCOPE road (the tree\'s verdict), and the mediator hands SA and SB a grant each over the forward', { road, sa: !!gSA.url });

// ── the sessions: per road one label of the suite's own (two holders of one shared profile), each session its own world ──
const world = (name, cdpUrl, { debug = false } = {}) => { const d = path.join(ROOT, name); const w = { name, cdpUrl, debug, home: path.join(d, 'home'), tmp: path.join(d, 'tmp'), xdg: path.join(d, 'xdg'), cwd: path.join(d, 'cwd'), sock: path.join(SOCKETS, name) }; for (const x of [w.home, w.tmp, w.xdg, w.cwd, w.sock]) fs.mkdirSync(x, { recursive: true, mode: 0o700 }); return w; };   // r4773: each world its OWN short socket folder (its files apart, as its runtime folder kept them)
const SA = world('SA', gSA.url, { debug: true }), SB = world('SB', gSB.url), A = world('A', FWD_URL, { debug: true }), Bw = world('B', FWD_URL);
const labelOf = (w) => `${NS}-${w.name === 'A' || w.name === 'B' ? 'bare' : 'scoped'}`, sessionOf = (w) => `vs-${w.name}`;
// the socket path each session will have (the driver's shape, counted in bytes as the kernel's sun_path is) — over 103 is said
// here by name, before any driver is asked
const SOCKET_MAX = 103, sockBytes = (w) => Buffer.byteLength(`${w.sock}/namespaces/${labelOf(w)}/run/${sessionOf(w)}.sock`, 'utf8');
ok([SA, SB, A, Bw].every((w) => sockBytes(w) <= SOCKET_MAX), `the four sessions' sockets in the suite's own short folders (${SOCKETS}/<world>) stay within the driver's ${SOCKET_MAX} bytes`, Object.fromEntries([SA, SB, A, Bw].map((w) => [w.name, sockBytes(w)])));
const drive = (w, args, timeout) => new Promise((resolve) => {
  const t0 = Date.now();
  execFile(REAL_AB, ['--cdp', w.cdpUrl, ...args], { encoding: 'utf8', timeout, killSignal: 'SIGKILL', cwd: w.cwd, maxBuffer: 8 * 1024 * 1024,
    env: { ...BASE_ENV, HOME: w.home, TMPDIR: w.tmp, XDG_RUNTIME_DIR: w.xdg, AGENT_BROWSER_SOCKET_DIR: w.sock, AGENT_BROWSER_NAMESPACE: labelOf(w), AGENT_BROWSER_SESSION: sessionOf(w), AGENT_BROWSER_JSON: '1', ...(w.debug ? { AGENT_BROWSER_DEBUG: '1' } : {}) } },
    (err, stdout, stderr) => resolve({ ms: Date.now() - t0, code: err ? (err.killed ? 'timeout' : (err.code || 1)) : 0, out: String(stdout || '').slice(-262144), err: String(stderr || '').slice(-4000) }));
});
const answerOf = (r) => { try { return JSON.parse(String(r.out || '').trim().split('\n').filter(Boolean).pop()); } catch { return null; } };
const wordOf = (r) => { const j = answerOf(r); return String((j && j.error) || r.err.split('\n').filter(Boolean).pop() || '').slice(0, 240); };
const filesOf = (w) => { const out = []; const walk = (d, depth) => { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { const p = path.join(d, e.name); if (e.isDirectory() && depth < 4) walk(p, depth + 1); else if (e.isFile() && /log|debug|daemon/i.test(e.name)) out.push(p); } }; for (const r of [w.home, w.tmp, w.xdg, w.cwd, w.sock]) walk(r, 0); return out; };
const PREPARE_FAIL = 'failed to prepare new page session';
const prepareFailsOf = (w) => filesOf(w).reduce((n, f) => { let s = ''; try { s = fs.readFileSync(f, 'utf8'); } catch { return n; } return n + s.split('\n').filter((l) => l.includes(PREPARE_FAIL)).length; }, 0);
const brief = (r) => { if (!r) return null; return { ms: r.ms, code: r.code, ...(r.code !== 0 ? { answer: wordOf(r) } : {}) }; };

// warm the four sessions before any churn (no tab dies under a drain yet: the bare two cannot be held here)
const warmed = {};
for (const w of [SA, SB, A, Bw]) warmed[w.name] = await drive(w, ['open', PAGE(`${w.name.toLowerCase()}0`), '--json'], 30000);
if (!ok(Object.values(warmed).every((r) => r.code === 0), 'the four sessions answer through the forward — SA and SB through their scope grants, A and B `--cdp` to the forward itself (each road: one label of the suite\'s own, two sessions)', Object.fromEntries(Object.entries(warmed).map(([k, r]) => [k, r.code === 0 ? 0 : brief(r)])))) report();

// ── ① the ways: B's churn ONLY while a way is out; the bind started while B's `tab new` is in flight ──
const churn = (b) => {
  let on = true, cycles = 0, k = 0, cur = null; const calls = [];
  const step = async (args, t) => { cur = { what: args[1], since: Date.now() }; const r = await drive(b, args, t); cur = null; calls.push(r.ms); return r; };
  const done = (async () => { while (on) { const t = await step(['tab', 'new', PAGE(`c${b.name}${k++}`), '--json'], 15000); if (t.code === 0) await step(['tab', 'close', '--json'], 10000); else await sleep(200); cycles++; } })();
  return { cycles: () => cycles, now: () => (cur ? { what: cur.what, inFlightMs: Date.now() - cur.since } : null), stop: async () => { on = false; await done; return { cycles, maxCallMs: calls.length ? Math.max(...calls) : 0 }; } };
};
const until = async (fn, ms, step = 25) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(step); } return !!fn(); };
const WARM_CYCLES = 3, WARM_MS = 6000, INFLIGHT_MS = 2000, NAV_MS = 25000, B_LAST_MS = 25000, END_MS = 3 * FAULT_MS + 45000, WAY_MS = WARM_MS + INFLIGHT_MS + BIND_MS + NAV_MS + B_LAST_MS;
async function way(n, rd) {
  const c = churn(rd.b);
  await until(() => c.cycles() >= WARM_CYCLES, WARM_MS);
  const id = await newTab(`${n}${rd.tag}`);
  if (!id) { await c.stop(); return { road: rd.name, n, error: 'no tab made' }; }
  if (rd.admit) rd.admit(id);
  await until(() => { const b = c.now(); return !!(b && b.what === 'new' && b.inFlightMs >= 10); }, INFLIGHT_MS, 2);
  const bAtBind = c.now(), cyclesAtBind = c.cycles();
  const bind = await drive(rd.a, ['--pin-tab', 'tab', id, '--json'], BIND_MS);
  const nav = bind.code === 0 ? await drive(rd.a, ['--pin-tab', 'open', PAGE(`${n}${rd.tag}-nav`), '--json'], NAV_MS) : null;
  const ch = await c.stop();
  await hub.call('Target.closeTarget', { targetId: id });
  return { road: rd.name, n, bAtBind, cyclesAtBind, bind: brief(bind), nav: brief(nav), churn: ch };
}
const ROADS = [
  { name: 'scoped', tag: 's', a: SA, b: SB, admit: (id) => med.admitTarget(PROFILE, SA_KEY, id), ways: [] },
  { name: 'bare', tag: 'b', a: A, b: Bw, admit: null, ways: [] },
];
outer: for (let i = 1; i <= TRIALS; i++) for (const rd of ROADS) { if (left() < WAY_MS + END_MS) break outer; const w = await way(i, rd); rd.ways.push(w); console.log(`B-19a9 PAIRED ${rd.name} ${i} ${JSON.stringify(w)}`); }
const [SCOPED, BARE] = ROADS;
const okWays = (rd) => rd.ways.filter((w) => w && !w.error);
const conditionOf = { scoped: (w) => !!(w.bAtBind && w.bAtBind.what === 'new' && w.bAtBind.inFlightMs >= 10 && w.cyclesAtBind >= 1), bare: (w) => !!(w.bAtBind && w.bAtBind.inFlightMs >= 10) };
const missed = ROADS.flatMap((rd) => okWays(rd).filter((w) => !conditionOf[rd.name](w)).map((w) => ({ road: w.road, n: w.n, bAtBind: w.bAtBind, cyclesAtBind: w.cyclesAtBind })));
ok(okWays(SCOPED).length >= 1 && okWays(BARE).length >= 1 && SCOPED.ways.every((w) => w && !w.error) && missed.length === 0, `① the measure ran on both roads through the forward (scoped ${okWays(SCOPED).length}, bare ${okWays(BARE).length}), and THE CONDITION held per road — scoped: SB's \`tab new\` in flight ≥ 10 ms and its loop warmed at every bind; bare: a command of B's in flight ≥ 10 ms`, { missed, errors: ROADS.map((rd) => rd.ways.filter((w) => !w || w.error).length) });
const sw = okWays(SCOPED);
ok(sw.length > 0 && sw.every((w) => w.bind.code === 0 && w.bind.ms <= SLOW_MS && w.nav && w.nav.ms <= SLOW_MS), `① THE LAW on the paired machine's scoped road: every bind of SA within 5 s and every navigate after it too, under SB's churn (binds ${sw.map((w) => w.bind.ms).join(' ')} ms; navigates ${sw.map((w) => (w.nav ? w.nav.ms : '—')).join(' ')} ms; the bare road beside it: binds ${okWays(BARE).map((w) => w.bind.ms).join(' ')} ms)`, sw.filter((w) => !(w.bind.code === 0 && w.bind.ms <= SLOW_MS && w.nav && w.nav.ms <= SLOW_MS)).slice(0, 3));
const fails = { SA: prepareFailsOf(SA), A: prepareFailsOf(A) };
ok(fails.SA === 0, `…and SA's daemon log holds no «${PREPARE_FAIL}» — SB's tabs never reached its drain (the bare A's log: ${fails.A} such line(s))`, fails);
const listOf = async (w) => { const r = await drive(w, ['tab', 'list', '--json'], 15000); const j = answerOf(r); const tabs = j && j.data && Array.isArray(j.data.tabs) ? j.data.tabs : null; return { code: r.code, n: tabs ? tabs.length : null, ids: tabs ? tabs.map((t) => String(t.targetId || '').toUpperCase()).filter(Boolean) : null }; };
const listSB = await listOf(SB), listSA = await listOf(SA);
const pages = await hub.call('Target.getTargets').then((r) => (r && r.result && Array.isArray(r.result.targetInfos) ? r.result.targetInfos.filter((t) => t.type === 'page').map((t) => String(t.targetId).toUpperCase()) : null));
const SB_IDS = Array.isArray(listSB.ids) ? listSB.ids : [];
ok(listSB.code === 0 && SB_IDS.length >= 1 && listSA.code === 0 && Array.isArray(listSA.ids) && !SB_IDS.some((t) => listSA.ids.includes(t)) && Array.isArray(pages) && SB_IDS.every((t) => pages.includes(t)), `① THE SCOPE HELD through the forward — SA's tab list holds none of SB's tabs (by target id), where the browser's own page list holds them all (SB ${SB_IDS.length}, SA ${listSA.n}, the browser ${pages ? pages.length : 'unread'})`, { SB: listSB, SA: listSA, pages });

// ── ② THE FORWARD's FAULTS behind the proxy (r1846 (c)) — SA bound to a tab of its own first ──
const T2 = await newTab('fault'); med.admitTarget(PROFILE, SA_KEY, T2);
const b2 = await drive(SA, ['--pin-tab', 'tab', T2, '--json'], BIND_MS);
const getUrl = () => drive(SA, ['--pin-tab', 'get', 'url', '--json'], FAULT_MS);
const reach = async () => { let r = await getUrl(); if (r.code !== 0) { await drive(SA, ['--pin-tab', 'tab', T2, '--json'], FAULT_MS); r = await getUrl(); } return r; };
const before = b2.code === 0 ? await getUrl() : null;
ok(b2.code === 0 && before && before.code === 0, '② SA is bound to a tab of its own through its grant, over the forward, and reads its url', { bind: brief(b2), before: brief(before) });
// the machine DROPS: its link ends (the device's daemon keeps running, as a machine that lost its network does)
try { current.stop(); } catch { /* */ } current = null;
const dropped = await getUrl();
ok(dropped.code !== 0 && dropped.code !== 'timeout' && dropped.ms <= ANSWER_BOUND_MS && wordOf(dropped).length > 0, `② the machine DROPS while SA is bound ⇒ SA's next command answers a REFUSAL within ${ANSWER_BOUND_MS / 1000} s, never a hang (${dropped.ms} ms, code ${dropped.code}: «${wordOf(dropped)}»)`, brief(dropped));
// the machine RE-DIALS: a new link to the same daemon (browser-access resolves the device per connection — the forward's url is the same)
current = await dial();
const back = await reach();
ok(back.code === 0 && back.ms <= ANSWER_BOUND_MS, `② the machine RE-DIALS ⇒ SA reaches its tab again through the SAME grant url (${back.ms} ms)`, brief(back));
// the forward's url CHANGES (a second listener of the same machine): the grant REPOINTED follows it; the first listener closes
let fwd2 = null; try { fwd2 = await access.forwardCdp(HOST_B, CDP_PORT, { remoteUrl: BROWSER_WS }); } catch (e) { fwd2 = { error: String(e && e.message) }; }
const gSC = await med.grantFor({ profileId: 'bp-0000c1c1', browserKey: SC_KEY, upstream: FWD_URL, mode: M.SCOPE_MODE, paused: () => false });   // the CONTROL: a grant left on the first url
const SC = world('SC', gSC.url);
med.repoint(PROFILE, fwd2 && fwd2.url);
try { hub.ws.close(); } catch { /* */ } try { fwd.close(); } catch { /* */ }
const repointed = await reach();
const left1 = await drive(SC, ['open', PAGE('sc0'), '--json'], FAULT_MS);
ok(!!(fwd2 && fwd2.url && fwd2.url !== FWD_URL) && repointed.code === 0 && repointed.ms <= ANSWER_BOUND_MS, `② the forward's url CHANGES and the grant is REPOINTED ⇒ SA reaches its tab through the new url (${repointed.ms} ms)`, { fwd2: fwd2 && (fwd2.url || fwd2.error), r: brief(repointed) });
ok(left1.code !== 0 && left1.code !== 'timeout' && left1.ms <= ANSWER_BOUND_MS + 10000 && wordOf(left1).length > 0, `② CONTROL (RED by construction): a grant left on the CLOSED first url refuses by name, never a hang (${left1.ms} ms: «${wordOf(left1)}»)`, brief(left1));
// ── ③ THROUGH THE KEEPER's ROAD (round wpdtugrv1 MUST 1): the REAL keeper starts a shared profile on the suite's paired agent (the
// browser-serve `start` op runs THERE: the real driver launches that machine's Chrome under the agent's home, inside this root), two
// conversations lease it — the scope road, each url a grant of the same mediator over the keeper's own forward. One conversation's
// `tab <the other's target id>` through the keeper's own tab door is REFUSED BY NAME (not_your_tab), as on a local shared profile:
// the fence follows the road, never the machine. CONTROL: the owner's own `tab <id>` through the same door is admitted.
const K = require('../src/server/browser-keeper.js');
const LIMITS = require('../src/keeper-limits.js');
const KHOME = path.join(ROOT, 'khome'); fs.mkdirSync(KHOME, { recursive: true, mode: 0o700 });
driverHome(KHOME);   // B-8695 follow (r4974 (1)): the driver's line in this home from its first launch
const k = K.create({ dataDir: path.join(ROOT, 'kdata'), homeDir: KHOME, env: () => ({ PATH: `${path.dirname(REAL_AB)}:${BASE_ENV.PATH || ''}`, HOME: KHOME }), broadcast: () => { }, serverSetting: () => undefined, serverNotice: () => { },
  getTelemetry: () => null, liveKeys: () => new Set(), limits: { ...LIMITS, CONCURRENT_CAP: 4 }, log: { log() { }, warn() { }, error() { } }, tickMs: 3600e3, install: false, access, hostKnown: (h) => access.hostKnown(h), mediator: med });
const KA = 'bk-0000a7a1', KB = 'bk-0000b7b1';
const tabAct = async (browserKey, argv) => { try { return await k.agentTabAct({ browserKey, argv }); } catch (e) { return { ok: false, code: e && e.code, error: String(e && e.message) }; } };
let kp = null, kErr = null;
try {
  kp = k.createProfile({ label: 'Paired shared', host: HOST_A }, { owner: { kind: 'instance', id: null } });
  await k.attach({ profileId: kp.id, browserKey: KA, sessionId: 'sess-ka' });
  await k.attach({ profileId: kp.id, browserKey: KB, sessionId: 'sess-kb' });
} catch (e) { kErr = `${e && e.code ? e.code + ': ' : ''}${e && e.message}`; }
const kRoad = kp ? k.agentRoadFor(kp.id) : null;
const aNew = kErr ? null : await tabAct(KA, ['tab', 'new', PAGE('ka')]);
const aTid = aNew && aNew.ok && aNew.opened ? aNew.opened.targetId : null;
const bTake = aTid ? await tabAct(KB, ['tab', aTid]) : null;
const aOwn = aTid ? await tabAct(KA, ['tab', aTid]) : null;
ok(!kErr && kRoad && kRoad.mode === M.SCOPE_MODE && !!aTid, `③ the REAL keeper starts a shared profile on the paired agent and two conversations lease it on the SCOPE road (${kRoad ? kRoad.mode + '/' + kRoad.why : 'no road'}); A opens a tab of its own through the keeper's tab door (${aTid ? aTid.slice(0, 8) : 'none'})`, { kErr, kRoad, aNew: aNew && (aNew.ok ? { opened: aNew.opened, note: aNew.noteCode } : aNew) });
ok(!!bTake && bTake.ok === false && bTake.code === 'not_your_tab' && !!aOwn && aOwn.ok === true, `③ THROUGH THE KEEPER's ROAD: B's \`tab <A's target id>\` is REFUSED BY NAME (${bTake ? bTake.code : 'not asked'}), never bound — the same fence as a local shared profile; CONTROL: A's own \`tab <id>\` is admitted (${aOwn ? (aOwn.ok ? 'switched' : aOwn.code) : 'not asked'})`, { bTake, aOwn });
try { await k.shutdown(); } catch { /* */ }

console.log(`B-19a9 PAIRED summary ${JSON.stringify({ seconds: Math.round((Date.now() - T0) / 1000), scoped: okWays(SCOPED).map((w) => [w.bind.ms, w.nav && w.nav.ms]), bare: okWays(BARE).map((w) => [w.bind.ms, w.bind.code, w.nav && w.nav.code]), prepareFailLines: fails, faults: { dropped: brief(dropped), back: brief(back), repointed: brief(repointed), leftOnOld: brief(left1) } })}`);

try { srv.close(); } catch { /* */ }
try { med.shutdown(); } catch { /* */ }
try { access.shutdown && access.shutdown(); } catch { /* */ }
const ended = endAll();
console.log(`the end: the device agent's daemon(s) ended on its own root; ${ended.length} other process(es) of this root ended by pid + start time`);
report();
