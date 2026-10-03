#!/usr/bin/env node
// HEADED IS A PREFERENCE, THE DISPLAY IS A FACT — THE REAL BINARY (lane headless-fallback, 2026-09-28; HEAVY: the
// installed agent-browser 0.38.1 + the system Google Chrome, real launches). The owner's box sat at the GDM login screen
// after a reboot; ~/.agent-browser/config.json asks `headed: true` + `--ozone-platform=wayland`; every agent browser
// launch failed "Failed to connect to Wayland display … The platform failed to initialize".
//
// Everything runs through the REAL keeper, the REAL routes and the SHIPPED vibespace-browser, under a scratch HOME
// carrying the owner's config SHAPE (no profile), a scratch XDG_RUNTIME_DIR with no Wayland socket, WAYLAND_DISPLAY and
// DISPLAY unset, a scratch TMPDIR / socket dir / daemon cwd — nothing reaches the owner's ~/.agent-browser, the
// owner's display or the network (the page is served on 127.0.0.1 by this suite).
//
//   ① a conversation's own browser (rung N): `vibespace-browser open <page>` WORKS — the Chrome it launched runs
//      --headless with no --ozone-platform=wayland, `get title` reads the page, a second verb reuses the SAME daemon
//      (its view equals the launch's — never a relaunch), the agent is told once, the fact is on the record, the
//      user's file is byte-identical;
//   ② a named profile with browser.headed = "Show the window": `use` + `get title` work, headless, on ONE Chrome;
//   ③ (Xvfb present) another display: a private Xvfb (-displayfd, never a fixed number) as DISPLAY, the config
//      pinning Wayland ⇒ the pin becomes x11 and Chrome runs HEADED on that Xvfb (no --headless);
//   ⑤ (addendum) the HIDDEN-WINDOW rung: a private dir holding only an Xvfb symlink on the launch PATH (every other
//      leg runs with a PATH farm WITHOUT Xvfb ⇒ headless), a stale DISPLAY + XDG_SESSION_TYPE=wayland in the env: the
//      Chrome runs a window (no --headless, --ozone-platform=x11) on the Xvfb the browser CLI started itself,
//      navigator.userAgent through the keeper says Chrome/154 (not HeadlessChrome), the same daemon serves the next
//      verb, Stop ends its Xvfb;
//   ④ CONTROL: a keeper copy (scripts/mutant-copy.mjs) whose launch records no fact — the pre-fix keeper — answers
//      `open` with launch_failed on the real binary, and no Chrome ever came up for it: the incident, reproduced.
// SKIPs with evidence without the real agent-browser (only the shim resolves) or a system Chrome / Chromium.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, endRootedProcesses, freeDisplay } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = new URL('..', import.meta.url).pathname;
const F = require('../src/browser-facts.js');
const B = require('../src/browser-profiles.js');
const S = require('../src/browser-stream.js');

let pass = 0, fail = 0, skipped = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } return !!c; };
const skip = (n) => { skipped++; console.log('  ⊘ SKIP ' + n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const done = () => { console.log(`\n${pass} passed, ${fail} failed${skipped ? `, ${skipped} skipped` : ''}`); process.exit(fail ? 1 : 0); };

// ── the real binary + a Chrome, or a SKIP with the evidence ──
const BASE_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(AGENT_BROWSER_|VIBESPACE_|WAYLAND_DISPLAY$|DISPLAY$)/.test(k)));
const REAL = (() => { try { return F.binaryResolver('agent-browser', BASE_ENV)(); } catch { return null; } })();
let VER = null; try { VER = REAL ? execFileSync(REAL, ['--version'], { encoding: 'utf8', timeout: 10000, env: { PATH: BASE_ENV.PATH || '/usr/bin:/bin', HOME: '/nonexistent' } }).trim() : null; } catch { VER = null; }
// lane fleet-image-2: the browser the CLI LAUNCHES is the gate — with no browser installed under its home, agent-browser
// 0.38.1 takes the system one it finds by name (google-chrome, google-chrome-stable, …, chromium, chromium-browser):
// Google Chrome on the dev box, the Debian chromium 154 on the fleet image. Either runs every leg; the version the legs
// read (Chrome/154) is the CDP census's.
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => { try { fs.accessSync(p, fs.constants.X_OK); return true; } catch { return false; } }) || null;
console.log(`— the installed browser CLI: ${REAL || 'none'} (${VER || '?'}), chrome: ${CHROME || 'none'}`);
if (!REAL || !VER) { skip(`no real agent-browser resolves on PATH past the shim (PATH=${BASE_ENV.PATH || ''})`); done(); }
if (!CHROME) { skip('no system Chrome or Chromium (/usr/bin/google-chrome, /usr/bin/chromium) — the launch needs one'); done(); }

const ROOT = scratch('bdisp-chrome'); // short: the daemon's socket path lives under it
fs.rmSync(ROOT, { recursive: true, force: true });
const HOME = path.join(ROOT, 'h'), XDG = path.join(ROOT, 'x'), TMP = path.join(ROOT, 't'), SOCK = path.join(ROOT, 's'), DATA = path.join(ROOT, 'd'), DCWD = path.join(ROOT, 'c');
for (const d of [path.join(HOME, '.agent-browser'), path.join(HOME, '.vibespace'), XDG, TMP, SOCK, DATA, DCWD]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
let srv = null, pageSrv = null, xvfb = null;
function cleanup() {
  try { srv?.close(); } catch { /* */ } try { pageSrv?.close(); } catch { /* */ }
  try { xvfb?.kill('SIGKILL'); } catch { /* */ }
  try { endRootedProcesses(ROOT); } catch { /* */ }
  fs.rmSync(ROOT, { recursive: true, force: true });
}
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(130); });

// THE PATH the browser launches with decides the no-display RUNG (addendum): NOX = every tool of the shell's PATH but
// Xvfb (a symlink farm — Chrome's wrapper script needs coreutils) ⇒ the headless rung; XV = a PRIVATE dir holding only
// an Xvfb symlink, put first ⇒ the hidden-window rung (0.38.1 starts its own Xvfb, -displayfd — no fixed number)
// THE FARM IS BUILT FROM RESOLVED BINARIES (2.369.198, the .197 heavy red): "the first dir on PATH wins" linked whatever
// name came first — a DANGLING target too (symlinkSync checks nothing) and, on a box whose PATH puts the VibeSpace shim
// before the real CLI (the push shell's: data/bin first), the SHIM as `agent-browser` ⇒ the product answered
// binary_absent on every leg while this suite had resolved the real CLI a few lines up. Now `agent-browser` is REAL
// (the resolver's own answer, whatever the PATH order), every other name links its first EXISTING regular file on
// PATH, and the header prints what was linked — the farm is the same on every PATH order.
const NOX = path.join(ROOT, 'nox'), XV = path.join(ROOT, 'xv');
fs.mkdirSync(NOX, { recursive: true }); fs.mkdirSync(XV, { recursive: true });
let XVFB_BIN = null;
const linked = new Map();
fs.symlinkSync(REAL, path.join(NOX, 'agent-browser')); linked.set('agent-browser', REAL);
const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } }; // stat follows links: a dangling one is NOT a file
for (const d of String(BASE_ENV.PATH || '').split(':').filter((x) => x.startsWith('/'))) {
  let names = []; try { names = fs.readdirSync(d); } catch { continue; }
  for (const n of names) {
    const t = path.join(d, n);
    if (/^(Xvfb|xvfb-run)$/.test(n)) { if (n === 'Xvfb' && !XVFB_BIN && isFile(t)) XVFB_BIN = t; continue; }
    if (linked.has(n) || !isFile(t)) continue;
    try { fs.symlinkSync(t, path.join(NOX, n)); linked.set(n, t); } catch { /* a name that cannot be linked is left out, never linked dangling */ }
  }
}
if (XVFB_BIN) fs.symlinkSync(XVFB_BIN, path.join(XV, 'Xvfb'));
console.log(`— the launch PATH farm: ${linked.size} names linked to their resolved targets — agent-browser → ${REAL}; Xvfb kept out of it (${XVFB_BIN || 'none on PATH'})`);

// the owner's config SHAPE (the args and headed of the incident; no profile)
const OWNER_ARGS = '--no-sandbox,--disable-blink-features=AutomationControlled,--ozone-platform=wayland';
const UCFG = path.join(HOME, '.agent-browser', 'config.json');
fs.writeFileSync(UCFG, JSON.stringify({ args: OWNER_ARGS, headed: true }, null, 2));
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const USER_SHA = sha(UCFG);

// a page on the loopback (zero network)
pageSrv = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><title>headless-ok</title><h1>ok</h1>'); });
await new Promise((r) => pageSrv.listen(0, '127.0.0.1', r));
const PAGE = `http://127.0.0.1:${pageSrv.address().port}/`;

const rtEnv = { ...BASE_ENV, PATH: NOX, HOME, XDG_RUNTIME_DIR: XDG, TMPDIR: TMP }; // no Xvfb ⇒ the headless rung
const K = require('../src/server/browser-keeper.js');
const express = require('express');
const Rt = require('../src/routes/browser.js');
const settings = { 'browser.idleTimeoutMs': 600000 };
const live = new Set();
const journal = [];
const jlog = { log(m) { journal.push(String(m)); }, warn(m) { journal.push(String(m)); }, error(m) { journal.push(String(m)); } };
const mkKeeper = (KM, dataDir = DATA) => KM.create({ dataDir, homeDir: HOME, env: () => rtEnv, broadcast: null, serverSetting: (x) => settings[x], serverNotice: () => 1, getTelemetry: () => null,
  liveKeys: () => live, runtime: F.createBrowserRuntime({ env: rtEnv, daemonCwd: () => ({ ok: true, dir: DCWD }) }), facts: F.createBrowserFacts({ env: rtEnv }), log: jlog, install: false });
const sessions = new Map();
const TOKEN = (n) => 'vsst_' + String(n).repeat(24).slice(0, 24);
const pairsN = (key) => [...B.browserEnvFor({ browserKey: key, variant: B.VARIANTS.N, idleMs: 600000 }), `AGENT_BROWSER_SOCKET_DIR=${SOCK}`];
const mkSession = (id, key, n) => { live.add(key); const s = { agentToken: TOKEN(n), _browserKey: key, _browserVariant: 'N', _browserEnv: pairsN(key), name: `session ${id}` }; sessions.set(id, s); return s; };
const k = mkKeeper(K);
const setupRoutes = (kk) => Rt.setup({ keeper: kk, activeSessions: sessions, browserEnv: () => null, adoptRoots: { homeDir: HOME, dataDir: DATA }, tasksForSession: () => [] });
setupRoutes(k);
const app = express(); app.use(express.json()); app.use(Rt.router);
srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
const API = `http://127.0.0.1:${srv.address().port}`;
const CLI = path.join(REPO, 'data/bin/vibespace-browser');
const cliEnvFor = (s, extra = {}) => ({ ...BASE_ENV, PATH: NOX, HOME, TMPDIR: TMP, XDG_RUNTIME_DIR: XDG, VIBESPACE_API: API, VIBESPACE_SESSION_TOKEN: s.agentToken, VIBESPACE_SKIP_AGENT_HOOKS: '1', ...S.pairsToEnv(s._browserEnv), ...extra });
const cli = (args, env) => new Promise((resolve) => execFile(process.execPath, [CLI, ...args], { env, encoding: 'utf8', timeout: 120000 }, (err, stdout, stderr) => resolve({ status: err ? (typeof err.code === 'number' ? err.code : null) : 0, stdout: String(stdout || ''), stderr: String(stderr || '') })));
/** The Chrome browser processes (never a renderer) a daemon pid launched: its descendants (≤ 3 deep, by PPid — the
 *  daemon spawns from a worker thread, so a thread's `children` file can miss it) whose argv[0] names chrome. */
function chromesOf(daemonPid) {
  const ppid = new Map();
  for (const d of fs.readdirSync('/proc').filter((x) => /^\d+$/.test(x))) {
    try { const st = fs.readFileSync(`/proc/${d}/stat`, 'latin1'); ppid.set(Number(d), Number(st.slice(st.lastIndexOf(')') + 2).split(' ')[1])); } catch { /* gone */ }
  }
  const out = [];
  let frontier = [daemonPid];
  for (let depth = 0; depth < 3 && frontier.length; depth++) {
    const next = [...ppid.entries()].filter(([, pp]) => frontier.includes(pp)).map(([c]) => c);
    for (const c of next) {
      let cmd = ''; try { cmd = fs.readFileSync(`/proc/${c}/cmdline`, 'utf8'); } catch { continue; }
      let argv = cmd.split('\0').filter(Boolean);
      if (argv.length === 1) argv = argv[0].split(/\s+/).filter(Boolean); // a title-rewritten Chrome cmdline is ONE space-joined string (measured, lane H r3)
      if (/chrom(e|ium)/i.test(argv[0] || '') && !argv.some((a) => a.startsWith('--type='))) out.push({ pid: c, argv }); // Debian's /usr/bin/chromium execs /usr/lib/chromium/chromium
    }
    frontier = next;
  }
  return out;
}

/** The Xvfb processes a daemon started (its descendants by PPid whose argv[0] is Xvfb). */
function xvfbsOf(daemonPid) {
  const out = [];
  for (const d of fs.readdirSync('/proc').filter((x) => /^\d+$/.test(x))) {
    try { const st = fs.readFileSync(`/proc/${d}/stat`, 'latin1'); if (Number(st.slice(st.lastIndexOf(')') + 2).split(' ')[1]) !== daemonPid) continue; } catch { continue; }
    let cmd = ''; try { cmd = fs.readFileSync(`/proc/${d}/cmdline`, 'utf8'); } catch { continue; }
    if (/(^|\/)Xvfb$/.test(cmd.split('\0')[0] || '')) out.push(Number(d));
  }
  return out;
}

const KEY_E = 'bk-0000e0a1', KEY_W = 'bk-0000e0a2', KEY_X = 'bk-0000e0a3', KEY_C = 'bk-0000e0c1';
const ephOf = (kk, key) => kk._reg().profiles.find((p) => B.isEphemeralProfile(p) && p.owner.id === key) || null;

// ═══ ① the conversation's own browser ═══════════════════════════════════
console.log('— ① a conversation\'s own browser, no display, the owner\'s config: headless, and it works');
{
  const s = mkSession('sess-e', KEY_E, 'e');
  let c = await cli(['open', PAGE], cliEnvFor(s));
  const p = ephOf(k, KEY_E);
  const rec = p ? k.browserOf(p.id) : null;
  ok(c.status === 0 && rec && rec.state === 'ready', '`vibespace-browser open <page>` WORKS with no desktop session (it answered launch_failed before)', { status: c.status, stderr: c.stderr.slice(-600), rec: rec && { state: rec.state, lastError: rec.lastError } });
  const ch = rec && rec.pid ? chromesOf(rec.pid) : [];
  const argv = ch[0] ? ch[0].argv : [];
  ok(ch.length === 1 && argv.some((a) => /^--headless/.test(a)) && !argv.some((a) => /^--ozone-platform=wayland$/.test(a)) && argv.includes('--vibespace-keeper=' + KEY_E), 'the Chrome it launched runs --headless, without the Wayland pin, carrying the keeper\'s mark', argv.filter((a) => /headless|ozone|keeper|no-sandbox/.test(a)));
  ok(/\[browser_headless\]/.test(c.stderr) && rec && rec.display && rec.display.fallback && rec.display.fallback.why === 'no-display', 'the agent is told (the note) and the record carries the fact', { stderr: c.stderr.slice(-400), display: rec && rec.display });
  const pid0 = rec && rec.pid;
  c = await cli(['get', 'title'], cliEnvFor(s));
  const rec2 = p ? k.browserOf(p.id) : null;
  const ch2 = rec2 && rec2.pid ? chromesOf(rec2.pid) : [];
  ok(c.status === 0 && /headless-ok/.test(c.stdout) && !/\[browser_headless\]/.test(c.stderr), '`get title` reads the page — no second note', { status: c.status, stdout: c.stdout.slice(0, 300), stderr: c.stderr.slice(-300) });
  ok(rec2 && rec2.pid === pid0 && ch2.length === 1 && ch[0] && ch2[0].pid === ch[0].pid, 'the SAME daemon and the SAME Chrome served it — its view equals the launch\'s (the planned file reached the agent\'s command; never a relaunch)', { pid0, pid: rec2 && rec2.pid, chrome0: ch[0] && ch[0].pid, chrome: ch2.map((x) => x.pid) });
  ok(journal.some((j) => /no desktop session on this machine .*launched headless instead of the window its config asks for; dropped --ozone-platform=wayland/.test(j)), 'the journal says what happened, once', journal.filter((j) => /desktop/.test(j)));
  const ua = await cli(['eval', 'navigator.userAgent'], cliEnvFor(s));
  ok(ua.status === 0 && /HeadlessChrome\/154\./.test(ua.stdout), 'no Xvfb on the launch PATH ⇒ the headless rung: navigator.userAgent through the keeper says HeadlessChrome/154', ua.stdout.slice(0, 300));
  ok(sha(UCFG) === USER_SHA, 'the user\'s ~/.agent-browser/config.json is byte-identical');
  if (p) await k.stop(p.id, { why: 'user' });
}

// ═══ ② a named profile, the setting asking for a window ═══════════════════
console.log('— ② a named profile with browser.headed = "Show the window": headless, one Chrome, commands work');
{
  settings['browser.headed'] = 'yes';
  const prof = k.createProfile({ label: 'Work' }, { owner: { kind: 'instance', id: null } });
  const s = mkSession('sess-w', KEY_W, 'w');
  let c = await cli(['use', 'Work'], cliEnvFor(s));
  const rec = k.browserOf(prof.id);
  const ch = rec && rec.pid ? chromesOf(rec.pid) : [];
  ok(c.status === 0 && rec && rec.state === 'ready' && rec.launchEnv && rec.launchEnv.AGENT_BROWSER_HEADED === '0' && /\[browser_headless\]/.test(c.stderr), '`use Work` launched it headless (HEADED=0 in its launch view) and said so', { status: c.status, stderr: c.stderr.slice(-500), launchEnv: rec && rec.launchEnv });
  ok(ch.length === 1 && ch[0].argv.some((a) => /^--headless/.test(a)) && !ch[0].argv.includes('--ozone-platform=wayland') && ch[0].argv.some((a) => a === '--user-data-dir=' + prof.dir), 'ONE Chrome on the profile directory, headless, no Wayland pin', ch.map((x) => x.argv.filter((a) => /headless|ozone|user-data-dir/.test(a))));
  c = await cli(['open', PAGE], cliEnvFor(s));
  const c2 = await cli(['get', 'title'], cliEnvFor(s));
  const ch2 = rec && rec.pid ? chromesOf(rec.pid) : [];
  ok(c.status === 0 && c2.status === 0 && /headless-ok/.test(c2.stdout) && ch2.length === 1 && ch2[0].pid === ch[0].pid, 'its commands (over CDP) open and read the page on that one Chrome', { open: c.stderr.slice(-300), title: c2.stdout.slice(0, 200), chromes: ch2.map((x) => x.pid) });
  settings['browser.headed'] = '';
  try { await k.detach({ profileId: prof.id, browserKey: KEY_W, by: 'user' }); } catch { /* */ }
  try { await k.stop(prof.id, { why: 'user' }); } catch { /* */ }
}

// ═══ ③ another display: a private Xvfb, the config pinning Wayland ═════════
console.log('— ③ a display this machine HAS (a private Xvfb) under a config pinning one it does not: the pin follows the fact');
{
  let xv = null; try { xv = execFileSync('sh', ['-c', 'command -v Xvfb'], { encoding: 'utf8' }).trim(); } catch { xv = null; }
  if (!xv) skip('no Xvfb on PATH — the substituted-display leg needs one');
  else {
    // -displayfd: Xvfb picks a FREE display number and writes it — never a machine-global name claimed by this suite
    const num = await new Promise((resolve) => {
      xvfb = spawn(xv, ['-displayfd', '3', '-screen', '0', '1280x720x24', '-nolisten', 'tcp'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe'], env: { ...BASE_ENV, HOME } });
      let buf = '';
      xvfb.stdio[3].on('data', (d) => { buf += String(d); if (/\n/.test(buf)) resolve(Number(buf.trim())); });
      xvfb.once('exit', () => resolve(null));
      setTimeout(() => resolve(null), 8000);
    });
    if (!Number.isInteger(num)) skip('the private Xvfb did not report a display number');
    else {
      const D = `:${num}`;
      const rtEnv2 = { ...rtEnv, DISPLAY: D };
      const k2 = K.create({ dataDir: path.join(ROOT, 'd2'), homeDir: HOME, env: () => rtEnv2, broadcast: null, serverSetting: (x) => settings[x], serverNotice: () => 1, getTelemetry: () => null,
        liveKeys: () => live, runtime: F.createBrowserRuntime({ env: rtEnv2, daemonCwd: () => ({ ok: true, dir: DCWD }) }), facts: F.createBrowserFacts({ env: rtEnv2 }), log: jlog, install: false });
      setupRoutes(k2);
      const s = mkSession('sess-x', KEY_X, 'x');
      const c = await cli(['open', PAGE], cliEnvFor(s, { DISPLAY: D }));
      const p = ephOf(k2, KEY_X);
      const rec = p ? k2.browserOf(p.id) : null;
      const ch = rec && rec.pid ? chromesOf(rec.pid) : [];
      const argv = ch[0] ? ch[0].argv : [];
      ok(c.status === 0 && rec && rec.display && rec.display.kind === 'x11' && rec.display.fallback && rec.display.fallback.why === 'ozone-unavailable' && rec.display.fallback.used === 'x11', 'the fact: X11 is here, Wayland is not — the pin is substituted', { status: c.status, stderr: c.stderr.slice(-400), display: rec && rec.display });
      ok(ch.length === 1 && !argv.some((a) => /^--headless/.test(a)) && argv.includes('--ozone-platform=x11') && !argv.includes('--ozone-platform=wayland'), 'Chrome runs HEADED (no --headless) on the private X display with --ozone-platform=x11', argv.filter((a) => /headless|ozone/.test(a)));
      const c2 = await cli(['get', 'title'], cliEnvFor(s, { DISPLAY: D }));
      ok(c2.status === 0 && /headless-ok/.test(c2.stdout) && /browser_display_substituted/.test(c.stderr), 'it reads the page; the agent was told which display it runs on', { title: c2.stdout.slice(0, 200), note: c.stderr.slice(-300) });
      if (p) { try { await k2.stop(p.id, { why: 'user' }); } catch { /* */ } }
      setupRoutes(k);
    }
  }
}

// ═══ ⑤ THE HIDDEN-WINDOW RUNG (addendum): a private Xvfb binary on the launch PATH ═══════════
console.log('— ⑤ Xvfb installed (a private dir on the PATH), a stale DISPLAY + XDG_SESSION_TYPE=wayland in the env: a normal window on the CLI\'s own Xvfb');
{
  if (!XVFB_BIN) skip('no Xvfb on the shell PATH — the hidden-window rung needs one to put in the private dir');
  else {
    const stale = `:${freeDisplay(process.pid % 7919)}`; // a display number with no socket and no lock (never claimed)
    const rtEnvH = { ...rtEnv, PATH: `${XV}:${NOX}`, DISPLAY: stale, XDG_SESSION_TYPE: 'wayland' };
    const kH = K.create({ dataDir: path.join(ROOT, 'd4'), homeDir: HOME, env: () => rtEnvH, broadcast: null, serverSetting: (x) => settings[x], serverNotice: () => 1, getTelemetry: () => null,
      liveKeys: () => live, runtime: F.createBrowserRuntime({ env: rtEnvH, daemonCwd: () => ({ ok: true, dir: DCWD }) }), facts: F.createBrowserFacts({ env: rtEnvH }), log: jlog, install: false });
    setupRoutes(kH);
    const s = mkSession('sess-h', 'bk-0000e0a4', 'h');
    const envH = cliEnvFor(s, { PATH: `${XV}:${NOX}`, DISPLAY: stale, XDG_SESSION_TYPE: 'wayland' });
    let c = await cli(['open', PAGE], envH);
    const p = ephOf(kH, 'bk-0000e0a4');
    const rec = p ? kH.browserOf(p.id) : null;
    const ch = rec && rec.pid ? chromesOf(rec.pid) : [];
    const argv = ch[0] ? ch[0].argv : [];
    const xv = rec && rec.pid ? xvfbsOf(rec.pid) : [];
    ok(c.status === 0 && rec && rec.display && rec.display.fallback && rec.display.fallback.rung === 'hidden-window' && rec.display.xvfb === true && /\[browser_hidden_window\]/.test(c.stderr), '`open` WORKS and says the rung: no desktop, Xvfb installed ⇒ a hidden window', { status: c.status, stderr: c.stderr.slice(-500), display: rec && rec.display });
    ok(ch.length === 1 && !argv.some((a) => /^--headless/.test(a)) && argv.includes('--ozone-platform=x11') && !argv.includes('--ozone-platform=wayland') && xv.length >= 1, 'Chrome runs a WINDOW (no --headless, --ozone-platform=x11) on the Xvfb the browser CLI started as its own child (the stale DISPLAY cleared for the launch)', { chrome: argv.filter((a) => /headless|ozone/.test(a)), xvfb: xv });
    c = await cli(['eval', 'navigator.userAgent'], envH);
    ok(c.status === 0 && /Chrome\/154\./.test(c.stdout) && !/HeadlessChrome/.test(c.stdout), 'navigator.userAgent read through the keeper: Chrome/154 — an ordinary browser to a sign-in page (headless says HeadlessChrome/154)', c.stdout.slice(0, 300));
    const c2 = await cli(['get', 'title'], envH);
    const rec2 = p ? kH.browserOf(p.id) : null;
    const ch2 = rec2 && rec2.pid ? chromesOf(rec2.pid) : [];
    ok(c2.status === 0 && /headless-ok/.test(c2.stdout) && rec2.pid === rec.pid && ch2.length === 1 && ch2[0].pid === ch[0].pid, 'it reads the page on the SAME daemon and Chrome (no relaunch)', { title: c2.stdout.slice(0, 200), pid: [rec.pid, rec2.pid], chrome: [ch[0] && ch[0].pid, ch2.map((x) => x.pid)] });
    ok(journal.some((j) => /launched in a HIDDEN WINDOW/.test(j)), 'the journal names the rung');
    if (p) { try { await kH.stop(p.id, { why: 'user' }); } catch { /* */ } }
    await sleep(500);
    ok(xvfbsOf(rec.pid).length === 0 && !((() => { try { process.kill(xv[0], 0); return true; } catch { return false; } })()), 'Stop ends the browser CLI\'s own Xvfb with it', xv);
    setupRoutes(k);
  }
}

// ═══ ④ CONTROL: the pre-fix keeper on the real binary ═══════════════════════
console.log('— ④ CONTROL: a keeper whose launch records no display fact (the pre-fix keeper) — the incident, reproduced');
{
  const MK = mutantCopies('bdisp-chrome-keeper', REPO);
  const src = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  const factLine = '        rec.display = await displays.factFor({ baseFile: env0[VERBS.CONFIG_KEY] || ephemeralConfigFor(env0), prev: prev && prev.display, mode: noDisplayMode(), preference: headedSetting() });'; // + H5's preference (lane hooks-create; the 2.369.200 integration re-anchored)
  const envLine = '        const r = await rt.launch(null, { idleMs: launchIdle, headed: null, extraEnv: { ...env0, ...rec.display.env } });';
  ok(src.includes(factLine) && src.includes(envLine), 'CONTROL setup: the launch\'s fact line is found in the keeper');
  const pre = MK.load('src/server/browser-keeper.js', src.replace(factLine, '        rec.display = null;').replace(envLine, '        const r = await rt.launch(null, { idleMs: launchIdle, headed: null, extraEnv: env0 });'), 'no-fact');
  const kPre = mkKeeper(pre, path.join(ROOT, 'd3'));
  setupRoutes(kPre);
  const s = mkSession('sess-c', KEY_C, 'c');
  const c = await cli(['open', PAGE], cliEnvFor(s));
  const p = ephOf(kPre, KEY_C);
  const rec = p ? kPre.browserOf(p.id) : null;
  ok(c.status !== 0 && /launch_failed/.test(c.stderr) && rec && rec.state === 'failed', 'CONTROL: `open` answers launch_failed on the real binary (the owner\'s incident)', { status: c.status, stderr: c.stderr.slice(-500), rec: rec && { state: rec.state, lastError: rec.lastError } });
  // what the real binary says when asked directly under the same config (the words the keeper's sentence does not carry)
  const direct = await new Promise((r) => execFile(REAL, ['open', 'about:blank'], { env: { ...BASE_ENV, HOME, TMPDIR: TMP, XDG_RUNTIME_DIR: XDG, AGENT_BROWSER_CONFIG: UCFG, AGENT_BROWSER_SESSION: 'vs-ctl', AGENT_BROWSER_NAMESPACE: 'vs-ctl', AGENT_BROWSER_SOCKET_DIR: SOCK, AGENT_BROWSER_IDLE_TIMEOUT_MS: '5000', AGENT_BROWSER_JSON: '1' }, cwd: DCWD, timeout: 60000, encoding: 'utf8' }, (err, so, se) => r({ code: err ? err.code : 0, out: String(so || '') + String(se || '') })));
  ok(direct.code !== 0 && /Failed to connect to Wayland display/.test(direct.out) && /The platform failed to initialize/.test(direct.out), 'the real binary under the owner\'s config with no display: "Failed to connect to Wayland display … The platform failed to initialize" (measured again)', direct.out.slice(0, 400));
  for (const r of copiesCensus(MK.files, MK.dir, REPO, { label: 'control: ' })) ok(r.pass, r.name, r.detail);
  setupRoutes(k);
}
ok(sha(UCFG) === USER_SHA, 'the user file is byte-identical at the end');
done();
