#!/usr/bin/env node
// B-346d (first half) — AN EPHEMERAL BROWSER'S DAEMON, WATCHED FOR 130 s ON THE REAL DRIVER (heavy, run ALONE). The owner's
// incident: a conversation's ephemeral browser launched 13:29:24 and its daemon was found gone 13:30:33 (69 s), its idle
// timeout 15 min. THIS SUITE MEASURES: it changes no product file and judges one law, with a control that can go red.
//   law   THE LAW — the REAL keeper (its own tick and orphan census, production bounds) starts a stand-in conversation's
//         ephemeral browser from the pairs the REAL spawn composer gives it (src/server/browser-env.js envFor, production
//         settings), on the box's no-desktop road (no DISPLAY, a private HOME / XDG_RUNTIME_DIR, the CLI's own Xvfb); ONE
//         verb — `open` of a loopback page with the env the shipped CLI builds from /resolve's answer (V.childEnv); then
//         NO command for 130 s ⇒ its daemon (pid + start time) is alive ≥ 120 s after its verb, and the keeper still
//         holds it ready.
//   ctl   THE CONTROL — the same road with browser.idleTimeoutMs = 20 s ⇒ the daemon is gone 18–40 s after its verb with
//         no keeper act before it: the driver's own idle-out, seen and timed by the same watch (the leg can go red).
//   bare  THE BARE DRIVER — the same composer's pairs (production idle), the same no-desktop window (AGENT_BROWSER_HEADED=1,
//         Xvfb on PATH), NO keeper: the CLI starts its own daemon on the verb ⇒ alive ≥ 120 s. law red with bare green
//         places the cause in the keeper (its lines say which act); both red places it in the driver.
// Printed in every run, green or red: the idle value each daemon was REALLY launched with (its /proc environ) and its
// config; the census every 5 s (daemon / Chrome / Xvfb by pid + start time, a new daemon in its root); each loss at
// 250 ms with which process went first; the keeper's journal and every driver call it made, as offsets from the verb;
// at a loss, the files its world holds (logs, crash dumps, sockets).
// NOT held here, so a green law places the cause outside: the server's wiring around the keeper — the routes, the
// dialog watch, the live-view bridge, the recorder's tap.
// ONLY WHAT IT STARTED: every folder under this run's stamped scratch root (HOME, XDG_RUNTIME_DIR, TMPDIR, the data
// dirs, the socket base); the page on a free port; the X display by the CLI's own -displayfd; every pid it prints or
// ends is one of this root's, judged by pid + start time. Without the real agent-browser or Xvfb it SKIPS BY NAME (its
// closing line «SKIP: …», never a green). Zero vendor calls. QUIET (line 107, B-9dd0 unit 2): every Chrome its driver
// launches carries scripts/scratch.mjs CHROME_QUIET — each world's own user config names it as the driver's `args`, and a
// check proves every daemon's launch config carries it (the product's launch is not touched).
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFile, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, freePort, CHROME_QUIET, driverArgs } from './scratch.mjs';
import { DRIVER } from './scratch.mjs';   // the ONE sentence a driver-less skip begins with (主开发 r2095)
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const K = require('../src/server/browser-keeper.js'), BE = require('../src/server/browser-env.js');
const Ff = require('../src/browser-facts.js'), B = require('../src/browser-profiles.js'), O = require('../src/browser-orphans.js');
const V = require('../src/browser-verbs.js'), S = require('../src/browser-stream.js');

const { ok, report } = checker();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WATCH_MS = 130000, LAW_MS = 120000, CENSUS_MS = 5000, FAST_MS = 250;
const CTL_IDLE_MS = 20000; // the control's idle: gone no earlier than 2 s before it (the driver may start its clock at the command's start), no later than twice it (its own check)
const CTL_FROM_MS = CTL_IDLE_MS - 2000, CTL_BY_MS = 2 * CTL_IDLE_MS;

// ── this run's root: every folder of every world lies under it ──
const ROOT = scratch('ephlife');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true, mode: 0o700 });
const under = (v, d) => { const s = String(v == null ? '' : v); return s === d || s.startsWith(d + '/'); };
// the session bus, the display and every VibeSpace / agent-browser setting of the shell this runs in are never handed on
const BASE_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('AGENT_BROWSER_') && !k.startsWith('VIBESPACE_')
  && !['DISPLAY', 'WAYLAND_DISPLAY', 'XDG_SESSION_TYPE', 'DBUS_SESSION_BUS_ADDRESS', 'XAUTHORITY', 'TMPDIR', 'XDG_RUNTIME_DIR'].includes(k)));
const skipWhole = (why) => { console.log(`\nSKIP: ${why} — no leg ran on this machine`); process.exit(0); };
const REAL_AB = (() => { try { return Ff.binaryResolver('agent-browser', BASE_ENV)(); } catch { return null; } })();
let ver = null;
try { const h0 = path.join(ROOT, 'v'); fs.mkdirSync(h0, { mode: 0o700 }); ver = REAL_AB ? execFileSync(REAL_AB, ['--version'], { encoding: 'utf8', timeout: 8000, env: { ...BASE_ENV, HOME: h0, TMPDIR: h0 } }).trim() : null; } catch { ver = null; }
if (!ver) skipWhole(`${DRIVER.skip} no real agent-browser resolves on PATH past the shim (the tree's real-driver fence, src/browser-facts.js binaryResolver; PATH=${BASE_ENV.PATH || ''})`);
if (!String(BASE_ENV.PATH || '').split(':').some((d) => d && fs.existsSync(path.join(d, 'Xvfb')))) skipWhole('no Xvfb on PATH — the no-desktop road is the browser CLI\'s own Xvfb');
console.log(`agent-browser: ${REAL_AB} (${ver}) · root ${ROOT} · watch ${WATCH_MS / 1000} s, law ≥ ${LAW_MS / 1000} s, census every ${CENSUS_MS / 1000} s, losses at ${FAST_MS} ms`);

// ── identity: a pid is a process only with its start time (/proc/<pid>/stat field 22); a zombie is not alive ──
const statOf = (pid) => { try { const s = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'); const f = s.slice(s.lastIndexOf(')') + 2).split(' '); const st = Number(f[19]); return { state: f[0], ppid: Number(f[1]), st: Number.isFinite(st) ? st : null }; } catch { return null; } };
const MY_START = (statOf(process.pid) || {}).st;
// a red, a throw, a signal: this root's processes are ended by identity before the root itself is removed (scratch.mjs's
// closer runs after every exit listener)
process.on('exit', () => { try { endMine(); } catch { /* best effort at exit */ } });
for (const sg of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sg, () => process.exit(130));
const isAlive = (id) => { if (!id || !Number.isInteger(id.pid) || id.st == null) return false; const s = statOf(id.pid); return !!s && s.st === id.st && s.state !== 'Z' && s.state !== 'X'; };
const isZombie = (id) => { const s = id ? statOf(id.pid) : null; return !!s && s.st === id.st && s.state === 'Z'; };
const idText = (id) => (id ? `${id.pid}:${id.st}` : 'none');
const ENV_NAMES = ['AGENT_BROWSER_IDLE_TIMEOUT_MS', 'AGENT_BROWSER_SESSION', 'AGENT_BROWSER_NAMESPACE', 'AGENT_BROWSER_CONFIG', 'AGENT_BROWSER_SOCKET_DIR', 'AGENT_BROWSER_HEADED', 'AGENT_BROWSER_DAEMON', 'HOME', 'XDG_RUNTIME_DIR', 'TMPDIR', 'DISPLAY', 'XAUTHORITY'];
const envOfId = (id) => { if (!isAlive(id)) return null; const e = Ff.procEnvOf(id.pid, ENV_NAMES); return isAlive(id) ? e : null; };
const argvOfId = (id) => { if (!isAlive(id)) return null; let a = null; try { a = fs.readFileSync(`/proc/${id.pid}/cmdline`, 'utf8').replace(/\0+$/, '').split('\0'); } catch { a = null; } return isAlive(id) ? a : null; };
const ownDir = (d) => { try { const st = fs.lstatSync(d); return st.isDirectory() && !st.isSymbolicLink() && st.uid === process.getuid(); } catch { return false; } };

// ── the census: this root's processes only (argv or the daemon's env naming a world's folder, and their children) ──
async function census(worlds, rowsP = null) {
  const rows = await (rowsP || Ff.daemonRows()); const out = new Map();
  for (const w of worlds) {
    const mine = (r) => (r.argv || []).some((x) => String(x).split('=').some((v) => under(v, w.D))) || Object.values(r.env || {}).some((x) => under(x, w.D));
    const keep = new Set(rows.filter(mine).map((r) => r.pid));
    for (let n = 0; n < 3; n++) for (const r of rows) if (keep.has(r.ppid)) keep.add(r.pid);
    out.set(w.tag, rows.filter((r) => keep.has(r.pid) && r.starttime != null && MY_START != null && r.starttime >= MY_START));
  }
  return out;
}

// ── a loopback page (no vendor) on a free port ──
const PORT = await freePort();
const pages = http.createServer((req, res) => { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(`<!doctype html><title>EL ${req.url}</title><p>the page at ${req.url}</p>`); }).listen(PORT, '127.0.0.1');
const U = (p) => `http://127.0.0.1:${PORT}${p}`;
const ab = (args, env, timeout = 60000) => new Promise((resolve) => { const t0 = Date.now(); execFile(REAL_AB, args, { env, encoding: 'utf8', timeout }, (err, so, se) => resolve({ ok: !err, ms: Date.now() - t0, out: String(so || '').trim().slice(-300), err: (String(se || '') + (err ? ' ' + String(err.message) : '')).trim().slice(-500) })); });

// ── a world: a private home, runtime dir, temp dir and data dir under the root ──
const KEYS = { law: 'bk-0000e1f1', ctl: 'bk-0000e1c2', bare: 'bk-0000e1b3' };
const LIVE = new Set(Object.values(KEYS)); // every stand-in conversation is running for the whole watch
function world(tag, SET) {
  const D = path.join(ROOT, tag), KH = path.join(D, 'h'), KXD = path.join(D, 'x'), KT = path.join(D, 't');
  for (const d of [path.join(KH, '.agent-browser'), KXD, KT, path.join(D, 'data'), path.join(D, 's')]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
  // B-9dd0 unit 2 (line 107; the coordinator's r624): every Chrome this suite's driver launches carries scripts/scratch.mjs
  // CHROME_QUIET — through THIS world's own user config (the driver's `args`, which the spawn composer layers into every launch
  // config it writes): this run's Chrome never takes the background network roads. The product's launch is not touched.
  fs.writeFileSync(path.join(KH, '.agent-browser', 'config.json'), JSON.stringify({ args: driverArgs(...CHROME_QUIET) }), { mode: 0o600 });
  const journal = [], calls = [];
  const line = (lvl) => (...a) => journal.push({ at: Date.now(), lvl, m: a.map((x) => (typeof x === 'string' ? x : x && x.message ? x.message : JSON.stringify(x))).join(' ') });
  return { tag, key: KEYS[tag], D, KH, KXD, dataDir: path.join(D, 'data'), env: { ...BASE_ENV, HOME: KH, XDG_RUNTIME_DIR: KXD, TMPDIR: KT }, SET, setting: (k) => SET[k], journal, calls,
    log: { log: line('log'), warn: line('warn'), error: line('error'), info: line('info') }, r: { tag }, T0: null, tStart: null, daemon: null, chrome: null, xvfb: null, gone: {}, newDaemons: new Map() };
}
/** Every driver call the keeper makes, as made (method, argv of an exec, its answer's ok) — the runtime itself is the
 *  production one (the daemon's TMPDIR under the data dir, no CLI pin on a fresh data dir). */
function tapRuntime(rt, calls) {
  const proxy = new Proxy(rt, { get(t, k, rcv) {
    const v = Reflect.get(t, k, rcv); if (typeof v !== 'function') return v;
    return function tapped(...a) {
      const c = { at: Date.now(), m: String(k) }; if (k === 'exec' && Array.isArray(a[1])) c.argv = a[1].map(String).slice(0, 6); calls.push(c);
      const out = v.apply(proxy, a);
      if (out && typeof out.then === 'function') out.then((x) => { c.ms = Date.now() - c.at; c.ok = x && typeof x === 'object' ? x.ok : undefined; }, (e) => { c.ms = Date.now() - c.at; c.threw = String(e && e.message).slice(0, 160); });
      return out;
    };
  } });
  return proxy;
}
const tmpOnce = (w) => () => { if (!w.tmp) w.tmp = Ff.makeBrowserTmpDir({ dataDir: w.dataDir, log: w.log }); return w.tmp; };
const composer = (w) => BE.create({ dataDir: w.dataDir, serverSetting: w.setting, homeDir: w.KH, env: w.env, log: w.log, socketDirBase: path.join(w.D, 's'), facts: Ff.createBrowserFacts({ env: w.env, pinned: Ff.cliPinReader(w.dataDir) }) });
const pick = (env, names) => Object.fromEntries(names.filter((k) => env && env[k] !== undefined).map((k) => [k, env[k]]));

/** law / ctl: the keeper's road, as production runs it. */
async function keeperArm(w) {
  const r = w.r;
  try {
    const be = composer(w);
    const res = be.envFor({ browserKey: w.key, cwd: w.D });
    r.variant = res.variant; r.pairs = res.pairs.slice(); r.fallbacks = res.fallbacks || [];
    const kk = K.create({ dataDir: w.dataDir, homeDir: w.KH, env: () => w.env, serverSetting: w.setting, liveKeys: () => LIVE, log: w.log, install: false,
      runtime: tapRuntime(Ff.createBrowserRuntime({ env: w.env, log: w.log, pinned: () => null, tmpDir: tmpOnce(w) }), w.calls),
      daemonTable: async () => (await census([w])).get(w.tag) || [] });
    w.kk = kk;
    if (typeof kk.boot === 'function') await kk.boot();
    w.tStart = Date.now();
    const e = await kk.ensureEphemeral({ browserKey: w.key, sessionId: 'sess-' + w.tag, envPairs: res.pairs, sessionName: 'life ' + w.tag, variant: res.variant });
    r.readyMs = Date.now() - w.tStart; w.profileId = e.profile && e.profile.id;
    const rec = kk._reg().browsers[w.profileId] || {};
    r.state = rec.state; r.recIdleMs = rec.idleMs; r.display = rec.display ? { rung: rec.display.rung || null, fallback: rec.display.fallback || null, envKeys: Object.keys(rec.display.env || {}) } : null;
    w.daemon = Number.isInteger(rec.pid) && rec.starttime != null ? { pid: rec.pid, st: rec.starttime } : null;
    // THE VERB — the agent's command: /resolve's answer for an ephemeral (the route's envBasis: the spawn pairs, the
    // keeper's socket root, the daemon's TMPDIR, the file its browser was launched with), turned into the child's env by
    // the shipped CLI's own PURE builder
    const sr = kk.socketRootOf(res.pairs);
    const answer = { ok: true, kind: 'ephemeral', env: res.pairs, spawnEnv: res.pairs.filter((kv) => /^AGENT_BROWSER_[A-Z_]+=/.test(kv)), socketDir: sr.socketDir, runtimeDir: sr.runtimeDir, tmpDir: be.tmpDir(), config: kk.configFileFor({ ephemeral: true, pairs: res.pairs }) };
    const built = V.childEnv({ ...w.env, ...S.pairsToEnv(res.pairs) }, answer, { home: w.KH, uid: process.getuid(), ownDir });
    r.verbEnv = pick(built.env, ENV_NAMES); r.needsConfig = built.needsConfig;
    r.verb = await ab(['open', U('/' + w.tag)], built.env);
    w.T0 = Date.now(); r.verbAtMs = w.T0 - w.tStart;
  } catch (e) { r.threw = String((e && e.stack) || e).slice(0, 1400); }
}
/** bare: the same composer's pairs and the same no-desktop window, no keeper — the CLI starts its own daemon. */
async function bareArm(w) {
  const r = w.r;
  try {
    const be = composer(w);
    const res = be.envFor({ browserKey: w.key, cwd: w.D });
    r.variant = res.variant; r.pairs = res.pairs.slice();
    const pe = S.pairsToEnv(res.pairs);
    const sr = B.socketRootFor({ home: w.KH, xdgRuntimeDir: w.KXD, socketDir: typeof pe.AGENT_BROWSER_SOCKET_DIR === 'string' ? pe.AGENT_BROWSER_SOCKET_DIR : null });
    const answer = { ok: true, kind: 'none', env: [], spawnEnv: res.pairs.filter((kv) => /^AGENT_BROWSER_[A-Z_]+=/.test(kv)), socketDir: sr.root, runtimeDir: w.KXD, tmpDir: be.tmpDir() };
    const built = V.childEnv({ ...w.env, ...pe }, answer, { home: w.KH, uid: process.getuid(), ownDir });
    built.env.AGENT_BROWSER_HEADED = '1'; // a window asked for, no DISPLAY, Xvfb on PATH ⇒ the CLI's own Xvfb (src/browser-display.js)
    r.verbEnv = pick(built.env, ENV_NAMES); r.needsConfig = built.needsConfig; w.closeEnv = built.env;
    w.tStart = Date.now();
    r.verb = await ab(['open', U('/bare')], built.env);
    w.T0 = Date.now(); r.verbAtMs = w.T0 - w.tStart;
    const ds = O.daemonsFromRows((await census([w])).get(w.tag) || []);
    r.daemonsAfterVerb = ds.map((d) => `${d.pid}:${d.starttime}`);
    w.daemon = ds.length === 1 ? { pid: ds[0].pid, st: ds[0].starttime } : null;
  } catch (e) { r.threw = String((e && e.stack) || e).slice(0, 1400); }
}

const W = { law: world('law', {}), ctl: world('ctl', { 'browser.idleTimeoutMs': CTL_IDLE_MS }), bare: world('bare', {}) };
const ARMS = Object.values(W);
const off = (w, t) => (w.T0 ? `${((t - w.T0) / 1000).toFixed(2)} s` : '?');
const launched = (w) => (w.r.launchEnv || {}).AGENT_BROWSER_IDLE_TIMEOUT_MS;
// the watches' census: ONE /proc walk shared by the three within a second (each keeper's own census walks fresh)
let rowsAt = 0, rowsP = null;
const rowsNow = () => { if (!rowsP || Date.now() - rowsAt > 1000) { rowsAt = Date.now(); rowsP = Ff.daemonRows(); } return rowsP; };
/** What the daemon was REALLY launched with, read at its verb: its /proc environ and argv, the config it names, its
 *  Chrome and Xvfb (by pid + start time). */
async function captureLaunch(w) {
  const r = w.r; if (!w.daemon) return;
  const d = O.daemonsFromRows((await census([w])).get(w.tag) || []).find((x) => x.pid === w.daemon.pid && x.starttime === w.daemon.st);
  const c = d ? (d.chrome.find((x) => x.dir) || d.chrome[0] || null) : null; const x = d ? d.xvfb[0] || null : null;
  w.chrome = c && c.starttime != null ? { pid: c.pid, st: c.starttime } : null; w.xvfb = x && x.starttime != null ? { pid: x.pid, st: x.starttime } : null;
  r.chromeDir = c ? c.dir : null;
  r.launchEnv = envOfId(w.daemon); r.argv = argvOfId(w.daemon); r.aliveAtVerb = isAlive(w.daemon);
  const cfg = r.launchEnv && r.launchEnv.AGENT_BROWSER_CONFIG;
  if (cfg && under(cfg, ROOT)) { try { r.config = JSON.parse(fs.readFileSync(cfg, 'utf8')); } catch (e) { r.config = { unreadable: String(e && e.message) }; } }
}
function printLaunch(w) {
  const r = w.r;
  console.log(`[${w.tag}] ${r.threw ? 'THREW ' + r.threw : `rung ${r.variant || '?'} · pairs ${JSON.stringify(r.pairs || [])} · verb ${r.verb ? (r.verb.ok ? 'ok' : 'FAILED ' + r.verb.err) : '?'} ${r.verb ? r.verb.ms + ' ms' : ''} (at ${r.verbAtMs} ms from its start${r.readyMs != null ? `, the keeper ready at ${r.readyMs} ms` : ''})`}`);
  console.log(`[${w.tag}]   daemon ${idText(w.daemon)} · chrome ${idText(w.chrome)}${r.chromeDir ? ' (' + r.chromeDir + ')' : ''} · xvfb ${idText(w.xvfb)}${r.display ? ` · display ${JSON.stringify(r.display)}` : ''}${r.recIdleMs != null ? ` · record idleMs ${r.recIdleMs}` : ''}`);
  console.log(`[${w.tag}]   LAUNCHED WITH (its /proc environ): ${JSON.stringify(r.launchEnv || null)}`);
  console.log(`[${w.tag}]   argv ${JSON.stringify(r.argv || null)} · config ${JSON.stringify(r.config || null).slice(0, 700)}`);
  console.log(`[${w.tag}]   the verb's env (V.childEnv): ${JSON.stringify(r.verbEnv || null)}${r.needsConfig ? ' · needsConfig (the CLI would compose one)' : ''}`);
}
const leftOf = (w) => {
  const out = []; let n = 0;
  const walk = (d, depth) => { if (depth > 9 || n > 6000) return; let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of es) { n++; const p = path.join(d, e.name); if (e.isDirectory()) { walk(p, depth + 1); continue; }
      const rel = path.relative(w.D, p); const interesting = /\.(log|dmp|pid|sock)$|crash|dump|minidump|\.(stderr|stdout)$/i.test(rel) || /^x\/|^h\/\.agent-browser\//.test(rel) || e.isSocket();
      if (!interesting) continue; let st = null; try { st = fs.lstatSync(p); } catch { st = null; }
      out.push({ f: rel, bytes: st ? st.size : null, mtime: st ? off(w, st.mtimeMs) : null, sock: e.isSocket() || undefined }); } };
  walk(w.D, 0);
  const tails = out.filter((x) => /\.log$|\.(stderr|stdout)$/i.test(x.f)).slice(0, 4).map((x) => { let t = ''; try { t = fs.readFileSync(path.join(w.D, x.f), 'utf8').slice(-700); } catch { t = '(unreadable)'; } return { f: x.f, tail: t }; });
  return { files: out.slice(0, 60), more: Math.max(0, out.length - 60), tails };
};
const sayLoss = (w, what, id, t) => {
  w.gone[what] = { at: t, ms: t - w.T0, id: idText(id), zombie: isZombie(id) };
  console.log(`[${w.tag}] LOSS +${off(w, t)}: its ${what} ${idText(id)} is gone${w.gone[what].zombie ? ' (a zombie its parent has not reaped)' : ''} (${((t - w.tStart) / 1000).toFixed(2)} s after its start)`);
  if (what === 'daemon') {
    const acts = w.calls.filter((c) => c.at >= w.T0 && c.at <= t);
    console.log(`[${w.tag}]   the keeper's driver calls since the verb, up to the loss: ${JSON.stringify(acts.map((c) => ({ at: off(w, c.at), m: c.m, argv: c.argv, ok: c.ok, ms: c.ms, threw: c.threw })))}`);
    console.log(`[${w.tag}]   the keeper's journal since the verb, up to the loss: ${JSON.stringify(w.journal.filter((j) => j.at >= w.T0 && j.at <= t + 300).map((j) => `+${off(w, j.at)} ${j.lvl} ${j.m}`))}`);
    w.left = leftOf(w);
    console.log(`[${w.tag}]   what its world holds now: ${JSON.stringify(w.left).slice(0, 3600)}`);
  }
};
/** ONE arm's watch, from its own verb: no command for 130 s — losses at 250 ms, the census every 5 s. */
async function watchArm(w) {
  if (!w.T0 || !w.daemon) return;
  let nextCensus = 0;
  for (;;) {
    const t = Date.now(); if (t - w.T0 >= WATCH_MS) break;
    for (const [what, id] of [['daemon', w.daemon], ['chrome', w.chrome], ['xvfb', w.xvfb]]) if (id && !w.gone[what] && !isAlive(id)) sayLoss(w, what, id, t);
    if (t >= nextCensus) {
      nextCensus = t + CENSUS_MS;
      const ds = O.daemonsFromRows((await census([w], rowsNow())).get(w.tag) || []);
      for (const d of ds) { const k = `${d.pid}:${d.starttime}`; if (k !== idText(w.daemon) && !w.newDaemons.has(k)) { w.newDaemons.set(k, { at: t, startedAt: d.startedAt }); console.log(`[${w.tag}] NEW DAEMON in its root +${off(w, t)}: ${k} (started ${((d.startedAt - w.T0) / 1000).toFixed(1)} s after the verb) · env ${JSON.stringify(d.env)}`); } }
      const rec = w.kk && w.profileId ? (w.kk._reg().browsers[w.profileId] || {}) : null;
      console.log(`[${w.tag}] +${off(w, t)} daemon ${idText(w.daemon)} ${isAlive(w.daemon) ? 'alive' : 'GONE'} · chrome ${idText(w.chrome)} ${w.chrome ? (isAlive(w.chrome) ? 'alive' : 'GONE') : ''} · xvfb ${idText(w.xvfb)} ${w.xvfb ? (isAlive(w.xvfb) ? 'alive' : 'GONE') : ''} · daemons in its root ${ds.length}${rec ? ` · keeper ${rec.state}${rec.note ? ' «' + rec.note + '»' : ''}` : ''}`);
    }
    await sleep(FAST_MS);
  }
}
const runArm = async (w, setup) => { await setup(w); try { await captureLaunch(w); } catch (e) { w.r.captureThrew = String(e && e.message); } printLaunch(w); await watchArm(w); };
console.log(`— three worlds side by side (law · ctl · bare), each its own home, runtime dir, data dir and stand-in conversation; each watch starts at its own verb: no command for ${WATCH_MS / 1000} s (offsets are from that arm's verb)`);
await Promise.all([runArm(W.law, keeperArm), runArm(W.ctl, keeperArm), runArm(W.bare, bareArm)]);

{
  // B-9dd0 unit 2 (line 107): the Chrome each daemon launches is quiet — its config's `args` carry CHROME_QUIET (this world's own user config)
  const argsOf = (w) => { const a = w.r.config && w.r.config.args; return Array.isArray(a) ? a.map(String) : String(a || '').split(/[,\n]/).map((x) => x.trim()).filter(Boolean); };
  const quiet = ARMS.map((w) => ({ arm: w.tag, has: CHROME_QUIET.filter((q) => argsOf(w).includes(q)).length, of: CHROME_QUIET.length }));
  ok(quiet.every((x) => x.has === x.of), `the quiet switches ride every launch: each daemon's config carries scripts/scratch.mjs CHROME_QUIET (${quiet.map((x) => `${x.arm} ${x.has}/${x.of}`).join(', ')})`, quiet);
}
ok(!!(!W.law.r.threw && W.law.r.state === 'ready' && W.law.r.aliveAtVerb && W.law.r.verb && W.law.r.verb.ok),
  `law: the REAL keeper started the conversation's browser on the production road (rung ${W.law.r.variant}), its daemon ${idText(W.law.daemon)} recorded, the agent's verb ran`, W.law.r);
ok(!!(!W.ctl.r.threw && W.ctl.r.state === 'ready' && W.ctl.r.aliveAtVerb && W.ctl.r.verb && W.ctl.r.verb.ok),
  `ctl: the same road with browser.idleTimeoutMs = ${CTL_IDLE_MS} ms, its daemon ${idText(W.ctl.daemon)} recorded, the verb ran`, W.ctl.r);
ok(!!(!W.bare.r.threw && W.bare.daemon && W.bare.r.aliveAtVerb && W.bare.r.verb && W.bare.r.verb.ok),
  `bare: the driver alone started ONE daemon on the verb (${idText(W.bare.daemon)}; in its root: ${JSON.stringify(W.bare.r.daemonsAfterVerb || [])})`, W.bare.r);
ok(String(launched(W.law)) === String(B.DEFAULT_IDLE_TIMEOUT_MS) && String(launched(W.bare)) === String(B.DEFAULT_IDLE_TIMEOUT_MS) && String(launched(W.ctl)) === String(CTL_IDLE_MS),
  `THE LAUNCHED VALUE, read from each daemon's /proc environ at its verb: law AGENT_BROWSER_IDLE_TIMEOUT_MS=${launched(W.law)}, bare ${launched(W.bare)} (the default ${B.DEFAULT_IDLE_TIMEOUT_MS}), ctl ${launched(W.ctl)} (the control's ${CTL_IDLE_MS})`,
  { law: W.law.r.launchEnv, ctl: W.ctl.r.launchEnv, bare: W.bare.r.launchEnv });
{
  const named = ARMS.filter((w) => w.r.launchEnv).flatMap((w) => ['HOME', 'XDG_RUNTIME_DIR', 'TMPDIR', 'AGENT_BROWSER_CONFIG', 'AGENT_BROWSER_SOCKET_DIR', 'XAUTHORITY'].filter((k) => w.r.launchEnv[k] !== undefined).map((k) => ({ arm: w.tag, k, v: w.r.launchEnv[k], mine: under(w.r.launchEnv[k], w.D) })));
  ok(named.length >= 9 && named.every((x) => x.mine) && ARMS.every((w) => !w.r.chromeDir || under(w.r.chromeDir, w.D)),
    `only what it started: every folder each daemon names (${named.length} — HOME, XDG_RUNTIME_DIR, TMPDIR, its config, its socket dir, its X authority) and each Chrome's profile dir lie under its own world in this run's root`, named.filter((x) => !x.mine));
}

// ── every keeper line and every driver call, as offsets from the verb ──
for (const w of ARMS) {
  if (w.kk) {
    console.log(`[${w.tag}] the keeper's journal (${w.journal.length} line(s)): ${JSON.stringify(w.journal.slice(-80).map((j) => `${w.T0 ? (j.at >= w.T0 ? '+' : '') + off(w, j.at) : '?'} ${j.lvl} ${j.m}`)).slice(0, 9000)}`);
    console.log(`[${w.tag}] the keeper's driver calls (${w.calls.length}): ${JSON.stringify(w.calls.map((c) => ({ at: w.T0 ? off(w, c.at) : '?', m: c.m, argv: c.argv, ok: c.ok, ms: c.ms, threw: c.threw })))}`);
  }
}
const recOf = (w) => (w.kk && w.profileId ? { ...(w.kk.browserOf(w.profileId) || {}) } : null);
const L = W.law, C = W.ctl, Bw = W.bare;
const lawRec = recOf(L), ctlRec = recOf(C);
const lived = (w) => !!w.T0 && !!w.daemon && (!w.gone.daemon || w.gone.daemon.ms >= LAW_MS); // alive at the law's mark (the watch runs on past it)
const place = (w) => (w.gone.daemon ? `LOST at +${(w.gone.daemon.ms / 1000).toFixed(2)} s — first gone: ${Object.entries(w.gone).sort((a, b) => a[1].at - b[1].at).map(([k, v]) => `${k} +${(v.ms / 1000).toFixed(2)} s`).join(', ')}; a new daemon in its root: ${w.newDaemons.size ? [...w.newDaemons.keys()].join(', ') : 'none'}`
  : `alive through ${w.T0 ? ((Date.now() - w.T0) / 1000).toFixed(1) : '?'} s (daemon ${idText(w.daemon)}, chrome ${w.gone.chrome ? 'GONE +' + (w.gone.chrome.ms / 1000).toFixed(2) + ' s' : 'alive'}, xvfb ${w.gone.xvfb ? 'GONE +' + (w.gone.xvfb.ms / 1000).toFixed(2) + ' s' : 'alive'}); a new daemon in its root: ${w.newDaemons.size ? [...w.newDaemons.keys()].join(', ') : 'none'}`);
for (const w of ARMS) console.log(`PLACE [${w.tag}] launched with AGENT_BROWSER_IDLE_TIMEOUT_MS=${launched(w)} · ${place(w)}`);
ok(lived(L), `THE LAW (law): with no command, the keeper's ephemeral daemon ${idText(L.daemon)} lives ≥ ${LAW_MS / 1000} s after its verb (launched with ${launched(L)} ms) — ${place(L)}`, { gone: L.gone, newDaemons: [...L.newDaemons.keys()], left: L.left });
ok(!!(lawRec && lawRec.state === 'ready' && !lawRec.endedEarly), `law: the keeper still holds it ready at the end of the watch (state ${lawRec && lawRec.state}${lawRec && lawRec.note ? ', «' + lawRec.note + '»' : ''})`, lawRec && { state: lawRec.state, note: lawRec.note, endedEarly: lawRec.endedEarly, stoppedBy: lawRec.stoppedBy, lastError: lawRec.lastError });
{
  const g = C.gone.daemon;
  const acts = g ? C.calls.filter((c) => c.at >= C.T0 && c.at <= g.at && /^(close|closeAll|stop|kill|end|exec)/i.test(c.m)) : [];
  const ends = g ? C.journal.filter((j) => j.at >= C.T0 && j.at <= g.at && /ended the browser daemon|\breleased\b/.test(j.m)) : [];
  ok(!!g && g.ms >= CTL_FROM_MS && g.ms <= CTL_BY_MS && !acts.length && !ends.length && !C.newDaemons.size,
    `THE CONTROL (ctl): launched with ${launched(C)} ms, its daemon ${idText(C.daemon)} is gone ${g ? '+' + (g.ms / 1000).toFixed(2) + ' s' : 'NEVER (alive through the watch)'} after its verb (bound ${CTL_FROM_MS / 1000}–${CTL_BY_MS / 1000} s) with no keeper act before it — placed as the driver's own idle-out; the keeper's words after: «${(ctlRec && ctlRec.note) || ''}»`,
    { gone: C.gone, acts, ends: ends.map((j) => j.m), newDaemons: [...C.newDaemons.keys()], left: C.left });
}
ok(lived(Bw), `THE BARE DRIVER (bare): no keeper, the same pairs and window — its daemon ${idText(Bw.daemon)} lives ≥ ${LAW_MS / 1000} s after its verb (launched with ${launched(Bw)} ms) — ${place(Bw)}`, { gone: Bw.gone, newDaemons: [...Bw.newDaemons.keys()], left: Bw.left });

// ── the end: each keeper stops its browser, the bare driver closes its own, then this root's leftovers by identity ──
for (const w of [L, C]) { if (w.kk) { try { if (w.profileId) await w.kk.stop(w.profileId); } catch { /* its daemon is gone already */ } try { w.kk.shutdown(); } catch { /* */ } } }
if (Bw.closeEnv) await ab(['close', '--all'], Bw.closeEnv, 20000);
pages.close();
await sleep(2000); // the stops settle (Chrome's own exit) before the leftovers are counted
const leftover = endMine();
console.log(`the end: ${leftover.length} process(es) of this root were still running after the keepers' stops and the driver's close (ended by pid + start time): ${JSON.stringify(leftover)}`);
report();

/** This root's processes (cwd, an argv token or HOME / XDG_RUNTIME_DIR / TMPDIR under ROOT; never this process or its
 *  ancestors; born after this process started), each SIGKILLed only while its start time still matches — synchronous,
 *  so it also runs at exit. */
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
