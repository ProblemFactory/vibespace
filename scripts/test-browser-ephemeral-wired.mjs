#!/usr/bin/env node
// B-346d (second leg) — AN EPHEMERAL BROWSER'S DAEMON, WATCHED FOR 130 s ON THE REAL DRIVER, ON THE HIDDEN-WINDOW RUNG, WITH THE
// SERVER'S WIRING AROUND THE KEEPER (heavy, run ALONE). The owner's incident (2026-11-09, the row's journal lines): a conversation's
// ephemeral browser launched 13:29:24 IN A HIDDEN WINDOW (no desktop session); 13:30:33 «daemon gone (pid …, seen by its stream
// closing) — recorded stopped (idle)», 69 s after its start; started again at the next verb; then «[browser-dialog] the watch's socket
// failed — connect ECONNREFUSED». The first leg (test-browser-ephemeral-life) ruled out the driver's idle and the keeper's own reapers,
// with the keeper's browsers HEADLESS and nothing around the keeper. THIS LEG HOLDS WHAT THAT ONE DID NOT:
//   (1) the HIDDEN-WINDOW rung — browser.headed yes, no DISPLAY, Xvfb on PATH: the CLI's own Xvfb (src/browser-display.js);
//   (2) the SERVER'S WIRING, built as src/server/mounts-plugins-wiring.js builds it: the dialog watch (its own CDP socket,
//       setStuckSource, setPaintWatch — the idle-paint freeze ON by default, 30 s after the last verb or viewer), the routes and
//       the SHIPPED CLI (data/bin/vibespace-browser → /resolve → the agent's verb), the live view's bridge (a viewer ATTACHED,
//       then LEAVING) and the action-trace recorder's tap (armed at the browser's ready).
// ONE hub (one keeper, as in production), three conversations — each its own ephemeral browser — side by side, and the bare driver:
//   view  production idle — a live view attaches VIEW_AT after the verb and LEAVES at LEAVE_AT; the recorder's tap rides its relay.
//         THE LAW: its daemon (pid + start time) lives ≥ 120 s after its verb, and the keeper still holds it ready.
//   tap   production idle — no viewer ever: the recorder's tap alone (the freeze comes 30 s after the verb). THE LAW: the same.
//   ctl   THE CONTROL — the same wiring, its conversation's idle 20 s (its spawn pairs), a viewer attached to the end: gone 18–40 s
//         after its verb, and the hub SEES it (the keeper records it stopped) — the observation can go red.
//   bare  THE BARE DRIVER (the first leg's): the same composer's pairs, the CLI's own Xvfb, no keeper, no wiring: ≥ 120 s.
// Printed for every arm, green or red — THE VIEWER'S LEAVING AND THE STREAM'S CLOSING FIRST (its socket's open, first and last frame,
// leave and close, every bridge line), then FOR EACH END WHO SAW IT FIRST, as offsets from the verb: this suite's 250 ms pid watch,
// the viewer's socket, the bridge, the keeper's «daemon gone (seen by …)», the dialog watch's socket, the recorder; the freeze and
// thaw lines; the idle each daemon was REALLY launched with (its /proc environ); every driver call the keeper made. An arm whose
// daemon ended gets ONE more verb after the watch (a MEASURE: does the watch follow its browser across the restart — the row's law 1).
// ONLY WHAT IT STARTED (the first leg's fence): every folder under this run's stamped scratch root; every pid it prints or ends is one
// of this root's, judged by pid + start time. Without the real agent-browser or Xvfb it SKIPS BY NAME (its closing line «SKIP: …»,
// never a green). Zero vendor calls. QUIET: every Chrome carries scripts/scratch.mjs CHROME_QUIET (each HOME's own user config).
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, freePort, CHROME_QUIET, driverArgs } from './scratch.mjs';
import { DRIVER } from './scratch.mjs';   // the ONE sentence a driver-less skip begins with (主开发 r2095)
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const express = require('express');
const { WebSocket } = require('ws');
const K = require('../src/server/browser-keeper.js'), BE = require('../src/server/browser-env.js');
const Ff = require('../src/browser-facts.js'), B = require('../src/browser-profiles.js'), O = require('../src/browser-orphans.js');
const V = require('../src/browser-verbs.js'), S = require('../src/browser-stream.js');
const D = require('../src/server/browser-dialogs.js'), R = require('../src/routes/browser.js');

const { ok, report } = checker();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WATCH_MS = 130000, LAW_MS = 120000, CENSUS_MS = 5000, FAST_MS = 250;
const CTL_IDLE_MS = 20000; // the control's idle: gone no earlier than 2 s before it (the driver may start its clock at the command's start), no later than twice it (its own check)
const CTL_FROM_MS = CTL_IDLE_MS - 2000, CTL_BY_MS = 2 * CTL_IDLE_MS;
const VIEW_AT = 3000, LEAVE_AT = 20000; // the live view attaches 3 s after the verb and leaves at 20 s (the freeze then comes 30 s after it)

// ── this run's root: every folder of every world lies under it ──
const ROOT = scratch('ephwired');
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
    const mine = typeof w.mine === 'function' ? w.mine : (r) => (r.argv || []).some((x) => String(x).split('=').some((v) => under(v, w.D))) || Object.values(r.env || {}).some((x) => under(x, w.D));
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
const KEYS = { view: 'bk-0000e2f1', tap: 'bk-0000e2a2', ctl: 'bk-0000e2c3', bare: 'bk-0000e2b4' };
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

// ── THE HUB: one keeper with the server's wiring around it (src/server/mounts-plugins-wiring.js's order) ──
const HUB = path.join(ROOT, 'hub'), KH = path.join(HUB, 'h'), KXD = path.join(HUB, 'x'), KTMP = path.join(HUB, 't'), DATA = path.join(HUB, 'data'), CWD = path.join(HUB, 'cwd');
for (const d of [path.join(KH, '.agent-browser'), KXD, KTMP, DATA, CWD, path.join(HUB, 's')]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
fs.writeFileSync(path.join(KH, '.agent-browser', 'config.json'), JSON.stringify({ args: driverArgs(...CHROME_QUIET) }), { mode: 0o600 }); // B-9dd0 unit 2: quiet Chrome, the hub's own user config
const kenv = { ...BASE_ENV, HOME: KH, XDG_RUNTIME_DIR: KXD, TMPDIR: KTMP };
const HUB_SET = { 'browser.headed': 'yes' }; // a window asked for on a machine with no desktop ⇒ the hidden-window rung; browser.idlePaintFreeze unset ⇒ its default (ON)
const hubJournal = []; // every line of every wired part: {at, src, lvl, m}
const logOf = (src) => { const l = (lvl) => (...a) => hubJournal.push({ at: Date.now(), src, lvl, m: a.map((x) => (typeof x === 'string' ? x : x && x.message ? x.message : JSON.stringify(x))).join(' ') }); return { log: l('log'), warn: l('warn'), error: l('error'), info: l('info') }; };
const hubCalls = [];
const hubTmp = { tmp: null };
const wired = (tag, SET, viewAt, leaveAt) => ({ tag, key: KEYS[tag], sid: 'sess-' + tag, token: 'vsst_ephw_' + tag, D: HUB, SET, viewAt, leaveAt,
  mine: (r) => [...(r.argv || []), ...Object.values(r.env || {})].some((x) => String(x).includes(KEYS[tag])), // ONE hub: a daemon is this conversation's by its session name
  journal: hubJournal, calls: hubCalls, r: { tag }, T0: null, tStart: null, daemon: null, chrome: null, xvfb: null, gone: {}, newDaemons: new Map(), viewer: null });
const W = { view: wired('view', { 'browser.headed': 'yes' }, VIEW_AT, LEAVE_AT), tap: wired('tap', { 'browser.headed': 'yes' }, null, null), ctl: wired('ctl', { 'browser.headed': 'yes', 'browser.idleTimeoutMs': CTL_IDLE_MS }, VIEW_AT, null), bare: world('bare', {}) };
const KARMS = [W.view, W.tap, W.ctl], ARMS = Object.values(W);
const kk = K.create({ dataDir: DATA, homeDir: KH, env: () => kenv, serverSetting: (k) => HUB_SET[k], liveKeys: () => LIVE, log: logOf('keeper'), install: false,
  runtime: tapRuntime(Ff.createBrowserRuntime({ env: kenv, log: logOf('runtime'), pinned: () => null, tmpDir: () => { if (!hubTmp.tmp) hubTmp.tmp = Ff.makeBrowserTmpDir({ dataDir: DATA, log: logOf('runtime') }); return hubTmp.tmp; } }), hubCalls),
  daemonTable: async () => { const m = await census(KARMS); return [...new Map([...m.values()].flat().map((x) => [x.pid, x])).values()]; } }); // the keeper's own census sees this root's daemons only
for (const w of KARMS) w.kk = kk;
const sessions = new Map();
const holdersOf = D.holdersOfKeeper(() => kk);
const dialogs = D.create({ keeper: kk, holdersOf, log: logOf('dialog'), leaseCountOf: (pid) => new Set(holdersOf(pid).map((h) => h.browserKey)).size });
kk.setStuckSource((bk) => dialogs.stuckForKey(bk));
kk.setPaintWatch(dialogs); // the wiring's own line: idle paint stops on the watch's own socket
R.setup({ keeper: kk, activeSessions: sessions, dialogs, tasksForSession: () => [] });
const bridge = require('../src/server/browser-stream.js').create({ keeper: kk, activeSessions: sessions, requestAuthed: () => true, dialogs, log: logOf('bridge') });
dialogs.setTabsOf((q) => { const out = new Set(); try { for (const t of bridge.activeTargetsFor(q) || []) if (t) out.add(String(t)); } catch { /* no relay */ } try { for (const t of kk.holderTabs(q && q.profileId, q && q.browserKey) || []) out.add(t); } catch { /* none */ } return [...out]; });
const trace = require('../src/server/browser-trace.js').create({ dataDir: DATA, homeDir: KH, keeper: kk, bridge, serverSetting: (k) => HUB_SET[k], broadcast: () => { }, onSession: () => { }, log: logOf('trace') });
trace.install();
if (typeof kk.boot === 'function') await kk.boot();
if (typeof trace.boot === 'function') { try { await trace.boot(); } catch (e) { logOf('trace').warn(`boot: ${e && e.message}`); } }
const app = express(); app.use(express.json()); app.use(R.router);
const srv = http.createServer(app);
srv.on('upgrade', (req, socket, head) => { if (String(req.url || '').startsWith(S.STREAM_PATH)) bridge.handleUpgrade(req, socket, head); else socket.destroy(); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const API = `http://127.0.0.1:${srv.address().port}`;
// the shipped CLI as an agent runs it (its own HOME is the hub's — the passwd home too)
const PASSWD = path.join(ROOT, 'passwd.cjs'); fs.writeFileSync(PASSWD, `const os = require('os'); const real = os.userInfo; os.userInfo = (o) => ({ ...real(o), homedir: ${JSON.stringify(KH)} });\n`);
const cli = (token, args, extra = {}, timeoutMs = 90000) => new Promise((resolve) => {
  const t0 = Date.now(); const c = spawn(process.execPath, ['--require', PASSWD, path.join(REPO, 'data/bin/vibespace-browser'), ...args], { env: { ...kenv, ...extra, VIBESPACE_API: API, VIBESPACE_SESSION_TOKEN: token, VIBESPACE_SESSION_CWD: CWD }, cwd: CWD });
  let out = '', err = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { err += d; });
  const t = setTimeout(() => c.kill('SIGKILL'), timeoutMs);
  c.on('exit', (code) => { clearTimeout(t); resolve({ ok: code === 0, code, ms: Date.now() - t0, out: String(out).trim().slice(-300), err: String(err).trim().slice(-500) }); });
});
/** view / tap / ctl: the conversation's spawn pairs from the REAL composer, its session as the hub keeps it, ONE verb by the CLI. */
async function wiredArm(w) {
  const r = w.r;
  try {
    const be = BE.create({ dataDir: DATA, serverSetting: (k) => w.SET[k], homeDir: KH, env: kenv, log: logOf('compose'), socketDirBase: path.join(HUB, 's'), facts: Ff.createBrowserFacts({ env: kenv, pinned: Ff.cliPinReader(DATA) }) });
    const res = be.envFor({ browserKey: w.key, cwd: CWD });
    r.variant = res.variant; r.pairs = res.pairs.slice();
    sessions.set(w.sid, { agentToken: w.token, _browserKey: w.key, _browserVariant: res.variant, _browserEnv: res.pairs, name: 'Chat ' + w.tag, cwd: CWD });
    w.tStart = Date.now();
    r.verb = await cli(w.token, ['open', U('/' + w.tag)], S.pairsToEnv(res.pairs)); // the agent's shell carries its spawn pairs
    w.T0 = Date.now(); r.verbAtMs = w.T0 - w.tStart;
    const p = (kk._reg().profiles || []).find((x) => x && x.owner && x.owner.id === w.key);
    w.profileId = p ? p.id : null;
    const rec = (w.profileId && kk._reg().browsers[w.profileId]) || {};
    r.state = rec.state; r.recIdleMs = rec.idleMs; r.display = rec.display ? { rung: rec.display.rung || null, fallback: rec.display.fallback || null, envKeys: Object.keys(rec.display.env || {}) } : null;
    w.daemon = Number.isInteger(rec.pid) && rec.starttime != null ? { pid: rec.pid, st: rec.starttime } : null;
    if (w.viewAt != null) viewer(w);
  } catch (e) { r.threw = String((e && e.stack) || e).slice(0, 1400); }
}
/** A live view of the conversation's own browser: attaches `viewAt` after the verb, leaves at `leaveAt` (null = stays). */
function viewer(w) {
  const v = { at: null, openAt: null, firstFrameAt: null, lastFrameAt: null, frames: 0, leftAt: null, closeAt: null, code: null, reason: '', msgs: [], errors: [] };
  w.viewer = v;
  const t = setTimeout(() => {
    v.at = Date.now();
    const ws = new WebSocket(`ws://127.0.0.1:${srv.address().port}${S.STREAM_PATH}?session=${encodeURIComponent(w.sid)}`); v.ws = ws;
    ws.on('open', () => { v.openAt = Date.now(); });
    ws.on('message', (m, isBin) => {
      let j = null; if (!isBin) { try { j = JSON.parse(String(m)); } catch { j = null; } }
      if (isBin || (j && j.type === 'frame')) { v.frames++; v.lastFrameAt = Date.now(); if (!v.firstFrameAt) v.firstFrameAt = v.lastFrameAt; return; }
      if (v.msgs.length < 60) v.msgs.push({ at: Date.now(), type: j && j.type ? String(j.type) : '?', txt: JSON.stringify(j).slice(0, 220) });
    });
    ws.on('close', (code, reason) => { v.closeAt = Date.now(); v.code = code; v.reason = String(reason || '').slice(0, 160); });
    ws.on('error', (e) => { v.errors.push(String(e && e.message).slice(0, 160)); });
    if (w.leaveAt != null) { const t2 = setTimeout(() => { v.leftAt = Date.now(); try { ws.close(1000, 'the viewer leaves'); } catch { /* closed */ } }, w.leaveAt - w.viewAt); if (t2.unref) t2.unref(); }
  }, w.viewAt);
  if (t.unref) t.unref();
}

const runArm = async (w, setup) => { await setup(w); try { await captureLaunch(w); } catch (e) { w.r.captureThrew = String(e && e.message); } printLaunch(w); await watchArm(w); };
console.log(`— ONE hub (one keeper, the dialog watch, the routes + the shipped CLI, the live view's bridge, the recorder) on the hidden-window rung, three conversations (view · tap · ctl) and the bare driver side by side; each watch starts at its own verb: no command for ${WATCH_MS / 1000} s (offsets are from that arm's verb); view: a viewer +${VIEW_AT / 1000} s → leaves +${LEAVE_AT / 1000} s; ctl: a viewer +${VIEW_AT / 1000} s to the end`);
await Promise.all([runArm(W.view, wiredArm), runArm(W.tap, wiredArm), runArm(W.ctl, wiredArm), runArm(W.bare, bareArm)]);

const at = (w, t) => (t ? `+${off(w, t)}` : '—');
const linesOf = (w, src) => hubJournal.filter((j) => (!src || j.src === src) && (j.m.includes(w.key) || (w.profileId && j.m.includes(w.profileId)) || j.m.includes(w.sid)));
// ── THE VIEWER'S LEAVING AND THE STREAM'S CLOSING, FIRST ──
for (const w of KARMS) {
  const v = w.viewer;
  if (v) console.log(`VIEWER [${w.tag}] asked ${at(w, v.at)} · its socket open ${at(w, v.openAt)} · frames ${v.frames} (first ${at(w, v.firstFrameAt)}, last ${at(w, v.lastFrameAt)}) · LEFT ${v.leftAt ? at(w, v.leftAt) : 'never (stays to the end)'} · its socket CLOSED ${at(w, v.closeAt)}${v.closeAt ? ` (code ${v.code}${v.reason ? ', «' + v.reason + '»' : ''})` : ''}${v.errors.length ? ' · errors ' + JSON.stringify(v.errors) : ''}`);
  else console.log(`VIEWER [${w.tag}] none (the recorder's tap alone)`);
  if (v && v.msgs.length) console.log(`VIEWER [${w.tag}]   its messages (not frames): ${JSON.stringify(v.msgs.map((x) => `${at(w, x.at)} ${x.type} ${x.txt}`)).slice(0, 4000)}`);
  console.log(`STREAM [${w.tag}] the bridge's lines: ${JSON.stringify(hubJournal.filter((j) => j.src === 'bridge' && j.at >= (w.tStart || 0)).map((j) => `${at(w, j.at)} ${j.lvl} ${j.m}`)).slice(0, 5000)}`);
  console.log(`STREAM [${w.tag}] the recorder's lines: ${JSON.stringify(hubJournal.filter((j) => j.src === 'trace' && j.at >= (w.tStart || 0)).map((j) => `${at(w, j.at)} ${j.lvl} ${j.m}`)).slice(0, 3000)}`);
}
// ── FOR EACH END, WHO SAW IT FIRST ──
const sawFirst = (w) => {
  const g = w.gone.daemon; if (!g) return null;
  const from = g.at - 10000; const seen = [];
  seen.push({ who: 'this suite\'s pid watch (250 ms)', at: g.at });
  const v = w.viewer; if (v && v.closeAt && v.closeAt >= from && !(v.leftAt && v.closeAt - v.leftAt < 2000)) seen.push({ who: `the viewer's socket closing (code ${v.code})`, at: v.closeAt });
  if (v && v.lastFrameAt && v.lastFrameAt >= from && !v.leftAt) seen.push({ who: 'the viewer\'s last frame', at: v.lastFrameAt });
  const kg = hubJournal.find((j) => j.src === 'keeper' && j.at >= from && /daemon gone/.test(j.m) && w.profileId && j.m.includes(w.profileId)); if (kg) seen.push({ who: `the keeper: «${(/seen by ([^)]+)\)/.exec(kg.m) || [, '?'])[1]}»`, at: kg.at });
  for (const [src, re, who] of [['bridge', /clos|gone|ended|upstream|stopped/i, 'the bridge'], ['dialog', /socket|clos|down|stopped/i, 'the dialog watch'], ['trace', /tap|clos|ended|stopped/i, 'the recorder']]) {
    const j = hubJournal.find((x) => x.src === src && x.at >= from && re.test(x.m) && (x.m.includes(w.key) || (w.profileId && x.m.includes(w.profileId)) || x.m.includes(w.sid))); if (j) seen.push({ who: `${who}: «${j.m.slice(0, 160)}»`, at: j.at });
  }
  return seen.sort((a, b) => a.at - b.at);
};
for (const w of KARMS) {
  const s = sawFirst(w);
  console.log(s ? `WHO SAW THE END FIRST [${w.tag}] (its daemon ${idText(w.daemon)} gone +${(w.gone.daemon.ms / 1000).toFixed(2)} s): ${s.map((x) => `${at(w, x.at)} ${x.who}`).join(' · ')}` : `WHO SAW THE END FIRST [${w.tag}]: no end in the watch (its daemon ${idText(w.daemon)} alive through it)`);
  const fz = linesOf(w, 'keeper').filter((j) => /stop drawing|draw(s|ing)? again|thaw/i.test(j.m));
  console.log(`PAINT [${w.tag}] the freeze / thaw lines: ${JSON.stringify(fz.map((j) => `${at(w, j.at)} ${j.m.slice(0, 200)}`))}`);
  console.log(`DIALOG [${w.tag}] the watch's lines: ${JSON.stringify(linesOf(w, 'dialog').map((j) => `${at(w, j.at)} ${j.lvl} ${j.m.slice(0, 220)}`)).slice(0, 3000)}`);
}
{
  // B-9dd0 unit 2: the Chrome each daemon launches is quiet — its config's `args` carry CHROME_QUIET
  const argsOf = (w) => { const a = w.r.config && w.r.config.args; return Array.isArray(a) ? a.map(String) : String(a || '').split(/[,\n]/).map((x) => x.trim()).filter(Boolean); };
  const q = ARMS.map((w) => ({ arm: w.tag, has: CHROME_QUIET.filter((x) => argsOf(w).includes(x)).length, of: CHROME_QUIET.length }));
  ok(q.every((x) => x.has === x.of), `the quiet switches ride every launch: each daemon's config carries scripts/scratch.mjs CHROME_QUIET (${q.map((x) => `${x.arm} ${x.has}/${x.of}`).join(', ')})`, q);
}
for (const w of KARMS) {
  ok(!!(!w.r.threw && w.r.state === 'ready' && w.r.aliveAtVerb && w.r.verb && w.r.verb.ok), `${w.tag}: the shipped CLI's verb started the conversation's ephemeral browser through /resolve (rung ${w.r.variant}), its daemon ${idText(w.daemon)} recorded`, { r: w.r });
  ok(!!(w.r.display && w.r.display.fallback && w.r.display.fallback.rung === 'hidden-window' && w.xvfb), `${w.tag}: its browser runs on the HIDDEN-WINDOW rung — no desktop, a window asked for, the CLI's own Xvfb ${idText(w.xvfb)}`, w.r.display);
}
ok(!!(W.view.viewer && W.view.viewer.openAt && W.view.viewer.frames > 0 && W.view.viewer.leftAt && W.ctl.viewer && W.ctl.viewer.openAt && W.ctl.viewer.frames > 0),
  `the live views WATCHED: view's drew ${W.view.viewer ? W.view.viewer.frames : 0} frame(s) and left ${W.view.viewer ? at(W.view, W.view.viewer.leftAt) : '—'}; ctl's drew ${W.ctl.viewer ? W.ctl.viewer.frames : 0}`, { view: W.view.viewer && { ...W.view.viewer, ws: undefined, msgs: W.view.viewer.msgs.length }, ctl: W.ctl.viewer && { ...W.ctl.viewer, ws: undefined, msgs: W.ctl.viewer.msgs.length } });
ok(!!(!W.bare.r.threw && W.bare.daemon && W.bare.r.aliveAtVerb && W.bare.r.verb && W.bare.r.verb.ok), `bare: the driver alone started ONE daemon on the verb (${idText(W.bare.daemon)})`, W.bare.r);
ok(String(launched(W.view)) === String(B.DEFAULT_IDLE_TIMEOUT_MS) && String(launched(W.tap)) === String(B.DEFAULT_IDLE_TIMEOUT_MS) && String(launched(W.bare)) === String(B.DEFAULT_IDLE_TIMEOUT_MS) && String(launched(W.ctl)) === String(CTL_IDLE_MS),
  `THE LAUNCHED VALUE, read from each daemon's /proc environ at its verb: view AGENT_BROWSER_IDLE_TIMEOUT_MS=${launched(W.view)}, tap ${launched(W.tap)}, bare ${launched(W.bare)} (the default ${B.DEFAULT_IDLE_TIMEOUT_MS}), ctl ${launched(W.ctl)} (the control's ${CTL_IDLE_MS})`,
  { view: W.view.r.launchEnv, tap: W.tap.r.launchEnv, ctl: W.ctl.r.launchEnv, bare: W.bare.r.launchEnv });
{
  const named = ARMS.filter((w) => w.r.launchEnv).flatMap((w) => ['HOME', 'XDG_RUNTIME_DIR', 'TMPDIR', 'AGENT_BROWSER_CONFIG', 'AGENT_BROWSER_SOCKET_DIR', 'XAUTHORITY'].filter((k) => w.r.launchEnv[k] !== undefined).map((k) => ({ arm: w.tag, k, v: w.r.launchEnv[k], mine: under(w.r.launchEnv[k], w.D) })));
  ok(named.length >= 12 && named.every((x) => x.mine) && ARMS.every((w) => !w.r.chromeDir || under(w.r.chromeDir, w.D)),
    `only what it started: every folder each daemon names (${named.length}) and each Chrome's profile dir lie under its own world in this run's root`, named.filter((x) => !x.mine));
}
console.log(`the hub's driver calls (${hubCalls.length}): ${JSON.stringify(hubCalls.map((c) => ({ at: c.at, m: c.m, argv: c.argv, ok: c.ok, ms: c.ms, threw: c.threw }))).slice(0, 9000)}`);
console.log(`the hub's journal (${hubJournal.length} line(s), the last 160): ${JSON.stringify(hubJournal.slice(-160).map((j) => `${j.at} ${j.src} ${j.lvl} ${j.m.slice(0, 300)}`)).slice(0, 20000)}`);
const recOf = (w) => (w.profileId ? { ...(kk.browserOf(w.profileId) || {}) } : null);
const lived = (w) => !!w.T0 && !!w.daemon && (!w.gone.daemon || w.gone.daemon.ms >= LAW_MS);
const place = (w) => (w.gone.daemon ? `LOST at +${(w.gone.daemon.ms / 1000).toFixed(2)} s — first gone: ${Object.entries(w.gone).sort((a, b) => a[1].at - b[1].at).map(([k, v]) => `${k} +${(v.ms / 1000).toFixed(2)} s`).join(', ')}; a new daemon in its root: ${w.newDaemons.size ? [...w.newDaemons.keys()].join(', ') : 'none'}`
  : `alive through ${w.T0 ? ((Date.now() - w.T0) / 1000).toFixed(1) : '?'} s (daemon ${idText(w.daemon)}); a new daemon in its root: ${w.newDaemons.size ? [...w.newDaemons.keys()].join(', ') : 'none'}`);
for (const w of ARMS) console.log(`PLACE [${w.tag}] launched with AGENT_BROWSER_IDLE_TIMEOUT_MS=${launched(w)} · ${place(w)}`);
for (const w of [W.view, W.tap]) {
  const rec = recOf(w);
  ok(lived(w) && !w.newDaemons.size, `THE LAW (${w.tag}${w === W.view ? ': a viewer attached, then LEFT' : ': the recorder\'s tap alone'}): with the server's wiring on the hidden-window rung, the daemon ${idText(w.daemon)} lives ≥ ${LAW_MS / 1000} s after its verb, never replaced — ${place(w)}`, { gone: w.gone, newDaemons: [...w.newDaemons.keys()], left: w.left, saw: sawFirst(w) });
  ok(!!(rec && rec.state === 'ready' && !rec.endedEarly), `${w.tag}: the keeper still holds it ready at the end of the watch (state ${rec && rec.state}${rec && rec.note ? ', «' + rec.note + '»' : ''})`, rec && { state: rec.state, note: rec.note, endedEarly: rec.endedEarly, stoppedBy: rec.stoppedBy, lastError: rec.lastError });
}
{
  const C = W.ctl, g = C.gone.daemon, rec = recOf(C);
  const closes = g ? hubCalls.filter((c) => c.at >= C.T0 && c.at <= g.at && /^(closeAll|stop|kill)$/i.test(c.m)) : [];
  ok(!!g && g.ms >= CTL_FROM_MS && g.ms <= CTL_BY_MS && !closes.length && !!rec && rec.state === 'stopped',
    `THE CONTROL (ctl): launched with ${launched(C)} ms and watched to the end, its daemon ${idText(C.daemon)} is gone ${g ? '+' + (g.ms / 1000).toFixed(2) + ' s' : 'NEVER (alive through the watch)'} after its verb (bound ${CTL_FROM_MS / 1000}–${CTL_BY_MS / 1000} s), no close asked before it, and the hub SAW it (recorded ${rec && rec.state}${rec && rec.note ? ', «' + rec.note + '»' : ''}) — first: ${(sawFirst(C) || []).slice(0, 3).map((x) => `${at(C, x.at)} ${x.who}`).join(' · ')}`,
    { gone: C.gone, closes, saw: sawFirst(C), rec: rec && { state: rec.state, note: rec.note, stoppedBy: rec.stoppedBy } });
}
ok(lived(W.bare), `THE BARE DRIVER (bare): no keeper, no wiring, the same pairs and the CLI's own Xvfb — its daemon ${idText(W.bare.daemon)} lives ≥ ${LAW_MS / 1000} s after its verb — ${place(W.bare)}`, { gone: W.bare.gone, newDaemons: [...W.bare.newDaemons.keys()], left: W.bare.left });
// MEASURE (not a proof): an arm whose daemon ended gets ONE more verb — the watch follows its browser across the restart (the row's law 1)?
for (const w of KARMS.filter((x) => x.gone.daemon)) {
  const t1 = Date.now(); const again = await cli(w.token, ['open', U('/' + w.tag + '-again')], S.pairsToEnv(w.r.pairs || [])); await sleep(5000);
  const rec = recOf(w);
  console.log(`MEASURE B-346d again [${w.tag}] (not a proof): the next verb ${again.ok ? 'ok' : 'FAILED ' + again.err} in ${again.ms} ms → the keeper ${rec && rec.state} (pid ${rec && rec.pid}); the dialog watch since: ${JSON.stringify(hubJournal.filter((j) => j.src === 'dialog' && j.at >= t1).map((j) => `${j.lvl} ${j.m.slice(0, 200)}`)).slice(0, 2000)}`);
}

// ── the end: the keeper stops each browser, the bare driver closes its own, then this root's leftovers by identity ──
for (const w of KARMS) { try { if (w.profileId) await kk.stop(w.profileId); } catch { /* its daemon is gone already */ } }
for (const x of [() => trace.shutdown && trace.shutdown(), () => bridge.shutdown && bridge.shutdown(), () => dialogs.shutdown && dialogs.shutdown(), () => kk.shutdown()]) { try { x(); } catch { /* best effort */ } }
try { srv.close(); } catch { /* closed */ }
if (W.bare.closeEnv) await ab(['close', '--all'], W.bare.closeEnv, 20000);
pages.close();
await sleep(2000); // the stops settle (Chrome's own exit) before the leftovers are counted
const leftover = endMine();
console.log(`the end: ${leftover.length} process(es) of this root were still running after the stops and the driver's close (ended by pid + start time): ${JSON.stringify(leftover)}`);
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
