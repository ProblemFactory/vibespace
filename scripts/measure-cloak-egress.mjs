#!/usr/bin/env node
// THE §7.2.1 MEASUREMENT (docs/design-agent-browser-v2.md, agent browser P4):
// does CloakBrowser phone home, and how much? Modelled on the
// src/local-oracles.js measurement — `env -i HOME=<empty dir> PATH=… strace -f
// -qq`, every `connect(` with AF_INET/AF_INET6 counted (a DNS `connect(…:53)`
// counts as INET: resolving a vendor host is already the decision to talk to
// it). Four runs, as the design names them: first launch (the ~200 MB
// download is EXPECTED to connect — the number is the point), a second launch
// from cache, a launch with a license key present, and a 10-minute idle
// browser.
//
// WHAT THE REAL PACKAGE TAUGHT THIS SCRIPT (cloakbrowser 0.5.10, measured
// 2026-09-28 — the first version of this script assumed a shape the package
// does not have):
//   1. the npm package's `bin` (dist/cli.js) is a MANAGEMENT CLI
//      (`install | info | update | login | logout | clear-cache`), not a
//      browser. `cloakbrowser --headless about:blank` is "Unknown command".
//      The download is `cloakbrowser install` (it prints the executable), and
//      the browser is the Chromium it unpacks: `<cache>/chromium-<v>/chrome`.
//   2. the cache is `CLOAKBROWSER_CACHE_DIR` (default `~/.cloakbrowser`), so a
//      fresh HOME per run (the old shape) re-downloaded 200 MB on every run —
//      the cache dir is now ONE VibeSpace-owned dir carried across the runs.
//   3. the wrapper's launch path schedules a background update check (the
//      GitHub releases API + the npm registry, at most hourly) that silently
//      DOWNLOADS a newer Chromium and uses it next time — the very "unpinned
//      auto-download" that invalidates a measurement. The runs therefore pin
//      `CLOAKBROWSER_VERSION=<the Chromium the record names>` and set
//      `CLOAKBROWSER_AUTO_UPDATE=false`, exactly as the product's install does.
//   4. `require.resolve('cloakbrowser/package.json')` never resolved: the
//      package is ESM with an `exports` map that does not export package.json.
//      The package is read from an explicit install prefix.
//   5. VibeSpace launches the binary through agent-browser
//      (`--executable-path <chrome> --args <…> open about:blank`), so the runs
//      launch it the same way — the counts describe the product's flag set —
//      and the trace adds `execve`/`clone` so every connect is attributed to
//      the program that made it (wrapper / agent-browser / chrome).
//   6. a Chromium at a path without an AppArmor profile has no usable
//      namespace sandbox on Ubuntu 23.10+ ("No usable sandbox!"); the vendor's
//      own default launch arguments carry `--no-sandbox`, and so do these runs.
//   7. glibc resolves through the 127.0.0.53 stub, so the connect list alone
//      names no host: the DNS queries/answers in the send/recv buffers
//      (`-s 1024 -xx`) name every address. getaddrinfo's source-address probes
//      (a UDP connect to port 0 that sends nothing) are counted in
//      `inetConnects` (the literal method) and listed apart (`addrProbes`).
//
// This script downloads ONLY when told to (`--first-launch`): run 1 IS the
// download, and a run that nobody authorized must not fetch 200 MB. Without
// the package at the prefix it prints the refusal record (`binary_absent`).
//
// Usage:  node scripts/measure-cloak-egress.mjs --prefix <npm prefix> --cache-dir <dir> --work <dir>
//           [--first-launch] [--agent-browser <path>] [--idle-ms 600000] [--hold-ms 30000]
//           [--seed 12345] [--license-key <value>] [--resume]
// Output: the proof record (JSON) on stdout and in <work>/record.json.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const B = require('../src/browser-profiles.js');
const SW = require('../src/browser-switch.js');

const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] != null ? args[i + 1] : d; };
const has = (k) => args.includes(k);
const CHECKOUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PREFIX = path.resolve(flag('--prefix', path.join(CHECKOUT, 'data', 'browser-tools')));
const CACHE = path.resolve(flag('--cache-dir', path.join(PREFIX, 'cloak-cache')));
const WORK = path.resolve(flag('--work', path.join(PREFIX, 'measure')));
const IDLE_MS = Number(flag('--idle-ms', 600000)) || 600000;
const HOLD_MS = Number(flag('--hold-ms', 30000)) || 30000;
const SEED = Number(flag('--seed', 12345)) || 12345;
// run 3's key: NOT a license (no CloakBrowser account exists for this
// measurement) — a value in the vendor's variable, so the run shows whether
// the installed binary READS a key at launch and where it would send one
const LICENSE = flag('--license-key', 'cb_vibespace_measurement_dummy_not_a_license');
const LICENSE_KIND = has('--license-key') ? 'given on the command line' : 'a dummy value (not a license — no CloakBrowser account exists)';
const today = new Date().toISOString().slice(0, 10);
const TOOL = 'strace -f -qq -e trace=%network,execve,clone,clone3,fork,vfork -s 1024 -xx';

function which(bin) { const r = spawnSync('sh', ['-c', `command -v ${bin}`], { encoding: 'utf8' }); return r.status === 0 ? r.stdout.trim() : null; }
const refusal = (why, detail) => ({
  provider: 'cloak', tool: TOOL, date: today, version: null,
  status: 'refused', refusal: why, detail, blocks: 'cloak.wired', runs: [], expectedRuns: B.CLOAK_EGRESS_RUNS,
});
function done(rec) { try { fs.mkdirSync(WORK, { recursive: true }); fs.writeFileSync(path.join(WORK, 'record.json'), JSON.stringify(rec, null, 2) + '\n'); } catch { /* stdout still carries it */ } console.log(JSON.stringify(rec, null, 2)); process.exit(0); }

const pkgDir = path.join(PREFIX, 'node_modules', SW.CLOAK_PACKAGE);
let pkg = null;
try { pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')); } catch { pkg = null; }
if (!pkg) done(refusal('binary_absent', `the \`${SW.CLOAK_PACKAGE}\` package is not installed under ${PREFIX} — nothing was downloaded; install the PINNED package into a prefix (npm install --prefix <dir> --no-save ${SW.CLOAK_PACKAGE}@<version>) and re-run with --prefix`));
const strace = which('strace');
if (!strace) done(refusal('strace_absent', 'strace is not installed on the measuring machine — the count cannot be taken (the design refuses a record with no counts)'));
const cliRel = SW.binFromPackageJson(pkg);
const CLI = cliRel ? path.join(pkgDir, cliRel) : null;
if (!CLI || !fs.existsSync(CLI)) done(refusal('package_shape', `the installed package names no bin (${JSON.stringify(pkg.bin)})`));
const NODE = process.execPath;
const AB = flag('--agent-browser', null) || (() => {
  for (const d of String(process.env.PATH || '').split(':')) {
    const f = path.join(d, 'agent-browser');
    try { const st = fs.statSync(f); if (st.size > 64 * 1024) return fs.realpathSync(f); } catch { /* next */ } // the VibeSpace shim is a tiny script
  }
  return null;
})();
if (!AB) done(refusal('agent_browser_absent', 'the real agent-browser CLI (not the VibeSpace shim) is not on PATH — the product launches CloakBrowser through it, so the runs do too (--agent-browser <path>)'));
const PATH_RUN = [path.dirname(NODE), '/usr/bin', '/bin'].join(':');

// ── the trace reader ───────────────────────────────────────────────────────
const unesc = (s) => s.replace(/\\x([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\([nrtvf"\\])/g, (_, c) => ({ n: '\n', r: '\r', t: '\t', v: '\v', f: '\f', '"': '"', '\\': '\\' }[c]));
function readName(b, off, depth = 0) {
  const labels = []; let i = off; let jumped = false; let next = -1;
  for (let guard = 0; guard < 128 && i < b.length; guard++) {
    const n = b.charCodeAt(i);
    if (n === 0) { i++; break; }
    if ((n & 0xc0) === 0xc0) { if (depth > 8 || i + 1 >= b.length) return null; const p = ((n & 0x3f) << 8) | b.charCodeAt(i + 1); if (!jumped) next = i + 2; jumped = true; i = p; depth++; continue; }
    if (n > 63) return null;
    labels.push(b.slice(i + 1, i + 1 + n)); i += 1 + n;
  }
  return { name: labels.join('.'), end: jumped ? next : i };
}
/** A DNS message → {qname, answers:[{addr}]} or null. */
function dnsParse(b) {
  if (b.length < 17) return null;
  const qd = (b.charCodeAt(4) << 8) | b.charCodeAt(5), an = (b.charCodeAt(6) << 8) | b.charCodeAt(7);
  if (qd !== 1 || an > 64) return null;
  const q = readName(b, 12);
  if (!q || !/^[a-zA-Z0-9._-]+$/.test(q.name) || !q.name.includes('.')) return null;
  let i = q.end + 4; const answers = [];
  for (let k = 0; k < an && i < b.length; k++) {
    const r = readName(b, i); if (!r) break; i = r.end;
    const type = (b.charCodeAt(i) << 8) | b.charCodeAt(i + 1); const len = (b.charCodeAt(i + 8) << 8) | b.charCodeAt(i + 9); const rd = b.slice(i + 10, i + 10 + len); i += 10 + len;
    if (type === 1 && len === 4) answers.push([...rd].map((c) => c.charCodeAt(0)).join('.'));
    if (type === 28 && len === 16) { const h = [...rd].map((c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join(''); answers.push(h.match(/.{4}/g).map((x) => x.replace(/^0+(?=.)/, '')).join(':').replace(/(^|:)0(:0)+(:|$)/, '::')); }
  }
  return { qname: q.name.toLowerCase(), answers };
}
/** The TLS ClientHello's server_name, when a send buffer carries one. */
function sniOf(b) {
  if (b.length < 50 || b.charCodeAt(0) !== 0x16 || b.charCodeAt(5) !== 0x01) return null;
  let i = 9 + 2 + 32; if (i >= b.length) return null;
  i += 1 + b.charCodeAt(i); if (i + 2 > b.length) return null;
  i += 2 + ((b.charCodeAt(i) << 8) | b.charCodeAt(i + 1)); if (i + 1 > b.length) return null;
  i += 1 + b.charCodeAt(i); if (i + 2 > b.length) return null;
  const end = i + 2 + ((b.charCodeAt(i) << 8) | b.charCodeAt(i + 1)); i += 2;
  while (i + 4 <= end && i + 4 <= b.length) {
    const t = (b.charCodeAt(i) << 8) | b.charCodeAt(i + 1), l = (b.charCodeAt(i + 2) << 8) | b.charCodeAt(i + 3);
    if (t === 0 && i + 9 <= b.length) { const nl = (b.charCodeAt(i + 7) << 8) | b.charCodeAt(i + 8); const n = b.slice(i + 9, i + 9 + nl); return /^[a-zA-Z0-9.-]+$/.test(n) ? n.toLowerCase() : null; }
    i += 4 + l;
  }
  return null;
}
function readTrace(file) {
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'latin1') : '';
  const exe = new Map(), parent = new Map(), ipName = new Map(), dnsNames = new Set(), sni = new Set();
  const connects = [];
  let inet = 0, unix = 0;
  for (const line of text.split('\n')) {
    const pm = /^(\d+) /.exec(line); if (!pm) continue;
    const pid = Number(pm[1]);
    const ex = /execve\("((?:[^"\\]|\\.)*)"/.exec(line); if (ex && !/= -1 /.test(line)) exe.set(pid, unesc(ex[1]));
    const cl = /(?:clone3?|vfork|fork)\b.*\)\s*=\s*(\d+)\s*$/.exec(line); if (cl && Number(cl[1]) > 0) parent.set(Number(cl[1]), pid);
    if (/\bconnect\(/.test(line)) {
      if (/AF_UNIX/.test(line)) unix++;
      else if (/AF_INET6?\b/.test(line)) {
        inet++;
        const port = Number((/sin6?_port=htons\((\d+)\)/.exec(line) || [])[1]);
        const m = /inet_addr\("([^"]+)"\)|inet_pton\(AF_INET6,\s*"([^"]+)"/.exec(line);
        connects.push({ pid, addr: m ? unesc(m[1] || m[2]).toLowerCase() : '?', port });
      }
    }
    if (/(send|recv)(to|from|msg|mmsg)?\(|resumed>/.test(line)) {
      for (const q of line.matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
        const b = unesc(q[1]);
        const d = dnsParse(b);
        if (d) { dnsNames.add(d.qname); for (const a of d.answers) ipName.set(a, d.qname); continue; }
        const s = /\bsend(to|msg)?\(/.test(line) ? sniOf(b) : null; if (s) sni.add(s);
      }
    }
  }
  const exeOf = (pid) => { for (let p = pid, g = 0; p && g < 64; p = parent.get(p), g++) if (exe.has(p)) return exe.get(p); return '?'; };
  const who = (pid) => { const e = exeOf(pid); return /\/chrome$/.test(e) ? 'chrome' : /agent-browser/.test(e) ? 'browser driver' : /\/node$/.test(e) ? 'wrapper' : path.basename(e); };
  const probes = connects.filter((c) => c.port === 0);
  const tmap = new Map();
  for (const c of connects.filter((x) => x.port !== 0)) {
    const host = c.port === 53 ? 'dns resolver' : (/^127\./.test(c.addr) || c.addr === '::1') ? 'loopback' : (ipName.get(c.addr) || '?');
    const k = `${host}|${c.addr}|${c.port}|${who(c.pid)}`;
    tmap.set(k, (tmap.get(k) || 0) + 1);
  }
  const targets = [...tmap].map(([k, n]) => { const [host, addr, port, by] = k.split('|'); return { host, addr, port: Number(port), by, n }; }).sort((a, b) => b.n - a.n);
  return { inetConnects: inet, unixConnects: unix, addrProbes: probes.length, targets, dnsNames: [...dnsNames].sort(), sni: [...sni].sort() };
}
/** The record's PHASE tag on every target (src/browser-profiles EGRESS_PHASES): the
 *  pinned download is `download`, anything a running browser or its driver reached is `launch`. */
const tagged = (counts, phase) => ({ ...counts, targets: counts.targets.map((t) => ({ ...t, phase })) });
function readTraceExecs(file) {
  const text = fs.readFileSync(file, 'latin1');
  return [...text.matchAll(/execve\("((?:[^"\\]|\\.)*)"/g)].map((m) => unesc(m[1]));
}
/** How many times a trace STARTED the browser: an execve of the binary whose
 *  argv carries no `--type=` (a zygote / helper re-exec of the same path does). */
function browserStarts(file, exe) {
  if (!fs.existsSync(file)) return 0;
  let n = 0;
  for (const line of fs.readFileSync(file, 'latin1').split('\n')) {
    if (!/\bexecve\(/.test(line)) continue;
    const u = unesc(line);
    if (u.includes(`execve("${exe}"`) && !/"--type=/.test(u)) n++;
  }
  return n;
}
function mergeCounts(parts) {
  const out = { inetConnects: 0, unixConnects: 0, addrProbes: 0, targets: [], dnsNames: [], sni: [] };
  for (const p of parts) { out.inetConnects += p.inetConnects; out.unixConnects += p.unixConnects; out.addrProbes += p.addrProbes; out.targets.push(...p.targets); out.dnsNames.push(...p.dnsNames); out.sni.push(...p.sni); }
  out.dnsNames = [...new Set(out.dnsNames)].sort(); out.sni = [...new Set(out.sni)].sort();
  return out;
}

// ── the traced phases ──────────────────────────────────────────────────────
const baseEnv = (home, extra = {}) => ({ HOME: home, PATH: PATH_RUN, TERM: 'dumb', CLOAKBROWSER_CACHE_DIR: CACHE, CLOAKBROWSER_AUTO_UPDATE: 'false', ...extra });
function traced(file, env, argv, { onStdout = null } = {}) {
  const envArgs = Object.entries(env).map(([k, v]) => `${k}=${v}`);
  const child = spawn('env', ['-i', ...envArgs, strace, '-f', '-qq', '-e', 'trace=%network,execve,clone,clone3,fork,vfork', '-s', '1024', '-xx', '-o', file, ...argv], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = '';
  child.stdout.on('data', (d) => { out += d; if (onStdout) onStdout(out); });
  child.stderr.on('data', (d) => { if (err.length < 64000) err += d; });
  const exited = new Promise((resolve) => child.on('exit', (code, sig) => resolve({ code, sig })));
  return { child, exited, out: () => out, err: () => err };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Every process whose environment or command line names this run's own dir
 *  — the evidence that it is ours (never a name). */
function processesUnder(dir) {
  const out = [];
  for (const d of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(d) || Number(d) === process.pid) continue;
    let s = '';
    try { s = fs.readFileSync(`/proc/${d}/cmdline`, 'latin1') + '\0' + fs.readFileSync(`/proc/${d}/environ`, 'latin1'); } catch { continue; }
    if (s.includes(dir)) out.push(Number(d));
  }
  return out;
}
async function reapUnder(dir) {
  let pids = processesUnder(dir).filter((p) => { try { return !/strace/.test(fs.readFileSync(`/proc/${p}/comm`, 'utf8')); } catch { return false; } });
  for (const p of pids) { try { process.kill(p, 'SIGTERM'); } catch { /* gone */ } }
  for (let i = 0; i < 20 && pids.length; i++) { await sleep(250); pids = pids.filter((p) => fs.existsSync(`/proc/${p}`)); }
  for (const p of pids) { try { process.kill(p, 'SIGKILL'); } catch { /* gone */ } }
  return pids.length;
}
async function wrapperInstall(runDir, home, { watchDownload = false } = {}) {
  const file = path.join(runDir, 'wrapper.strace');
  let kept = null, watcher = null;
  if (watchDownload) {
    fs.mkdirSync(CACHE, { recursive: true });
    // the wrapper unlinks its archive after unpacking — a HARD LINK taken while
    // it downloads keeps the very bytes it verified, so they can be counted and hashed
    watcher = fs.watch(CACHE, (ev, name) => { if (!kept && name && /^_download_\d+\.(tar\.gz|zip)$/.test(String(name))) { const dst = path.join(runDir, 'archive-' + name); try { fs.linkSync(path.join(CACHE, String(name)), dst); kept = dst; } catch { /* retried on the next event */ } } });
  }
  const t = traced(file, baseEnv(home, { CLOAKBROWSER_VERSION: PIN }), [NODE, CLI, 'install']);
  const ex = await t.exited;
  if (watcher) watcher.close();
  const lines = t.out().trim().split('\n');
  return { phase: 'wrapper: cloakbrowser install', exit: ex, exe: lines[lines.length - 1] || null, stdout: t.out().slice(-4000), stderr: t.err().slice(-4000), counts: tagged(readTrace(file), 'download'), kept };
}
async function browserLaunch(runDir, home, holdMs, extraEnv = {}) {
  const file = path.join(runDir, 'launch.strace');
  const profile = path.join(runDir, 'profile');
  fs.mkdirSync(profile, { recursive: true });
  // a SHORT namespace: 0.38.1 refuses a socket path over 103 bytes, and the
  // socket lives at <HOME>/.agent-browser/namespaces/<ns>/run/<session>.sock
  const ns = 'cm' + path.basename(runDir).replace(/\D/g, '');
  // the product's launch, verbatim: the executable + arguments as agent-browser's own ENV names (src/browser-switch.js
  // launchEnvFor) on EVERY call of the session — a call without them relaunches the browser (measured on 0.38.1)
  const launchEnv = SW.launchEnvFor('cloak', { seed: SEED, executablePath: EXE });
  const abEnv = { AGENT_BROWSER_SESSION: ns, AGENT_BROWSER_NAMESPACE: ns, AGENT_BROWSER_PROFILE: profile, AGENT_BROWSER_IDLE_TIMEOUT_MS: '0', AGENT_BROWSER_JSON: '1', ...launchEnv };
  const launchArgs = SW.launchArgsFor('cloak');
  let opened = false, refused = false;
  const t = traced(file, baseEnv(home, { ...abEnv, ...extraEnv }), [AB, ...launchArgs, 'open', 'about:blank'], { onStdout: (s) => { if (/"success"\s*:\s*true/.test(s)) opened = true; else if (/"success"\s*:\s*false/.test(s)) refused = true; } });
  const t0 = Date.now();
  while (!opened && !refused && Date.now() - t0 < 120000) { if (t.child.exitCode !== null && !opened) { await sleep(500); break; } await sleep(250); }
  const openMs = Date.now() - t0;
  const ctl = (argv) => spawnSync('env', ['-i', ...Object.entries(baseEnv(home, abEnv)).map(([k, v]) => `${k}=${v}`), AB, ...argv], { encoding: 'utf8', timeout: 30000 });
  const info = opened ? ctl(['session', 'info', '--json']) : null;
  const verUrl = opened ? ctl(['get', 'cdp-url']) : null;
  if (opened) await sleep(holdMs);
  const title = opened ? ctl(['get', 'title']) : null;
  const closed = ctl(['close', '--all']);
  const race = await Promise.race([t.exited, sleep(20000).then(() => null)]);
  let reaped = 0;
  if (!race) { reaped = await reapUnder(runDir); await Promise.race([t.exited, sleep(10000)]); }
  const ex = await Promise.race([t.exited, sleep(5000).then(() => ({ code: null, sig: 'still-running' }))]);
  const chromeStarts = browserStarts(file, EXE); // 1 = the one start; more = the session relaunched its browser
  return { phase: 'launch: agent-browser open about:blank (AGENT_BROWSER_EXECUTABLE_PATH=<chrome>)', argv: [...launchArgs, 'open', 'about:blank'], launchEnv: { ...launchEnv, AGENT_BROWSER_EXECUTABLE_PATH: '<chrome>' }, envNames: Object.keys({ ...abEnv, ...extraEnv }), chromeStarts, opened, openMs, heldMs: opened ? holdMs : 0, exit: ex, reaped, stdout: t.out().slice(-2000), stderr: t.err().slice(-3000), info: info ? (info.stdout || '').slice(-600) : null, cdp: verUrl ? (verUrl.stdout || '').trim().slice(-200) : null, title: title ? (title.stdout || '').trim().slice(-300) : null, close: (closed.stdout || closed.stderr || '').trim().slice(-300), counts: tagged(readTrace(file), 'launch') };
}
async function sha256File(f) { const h = crypto.createHash('sha256'); for await (const c of fs.createReadStream(f)) h.update(c); return h.digest('hex'); }
function treeBytes(d) { let n = 0; const st = [d]; while (st.length) { const x = st.pop(); for (const e of fs.readdirSync(x, { withFileTypes: true })) { const p = path.join(x, e.name); if (e.isDirectory()) st.push(p); else if (e.isFile()) n += fs.statSync(p).size; } } return n; }

// ── the runs ───────────────────────────────────────────────────────────────
fs.mkdirSync(WORK, { recursive: true });
// the zero-network probe first: which Chromium, where (`info --quick` is the
// vendor's own "fully network-free" mode) — the pin is what it names
const probeHome = path.join(WORK, 'probe-home'); fs.mkdirSync(probeHome, { recursive: true });
const probeFile = path.join(WORK, 'probe.strace');
const probe = traced(probeFile, { HOME: probeHome, PATH: PATH_RUN, TERM: 'dumb', CLOAKBROWSER_CACHE_DIR: CACHE, CLOAKBROWSER_AUTO_UPDATE: 'false' }, [NODE, CLI, 'info', '--quick', '--json']);
await probe.exited;
let diag = null; try { diag = JSON.parse(probe.out()); } catch { diag = null; }
if (!diag || !diag.binary || !diag.binary.version) done(refusal('package_shape', `\`cloakbrowser info --quick --json\` named no binary: ${probe.out().slice(0, 300)} ${probe.err().slice(0, 300)}`));
const PIN = diag.binary.version;
const EXE = diag.binary.path;
const probeCounts = readTrace(probeFile);
const saved = (n) => { try { return has('--resume') ? JSON.parse(fs.readFileSync(path.join(WORK, `run-${n}.json`), 'utf8')) : null; } catch { return null; } };
const save = (n, r) => fs.writeFileSync(path.join(WORK, `run-${n}.json`), JSON.stringify(r, null, 2) + '\n');
const runDirOf = (n) => { const d = path.join(WORK, `run-${n}`); fs.mkdirSync(path.join(d, 'home'), { recursive: true }); return d; };
const runs = [];
let download = null;

// run 1 — first launch: the wrapper's download + the browser's first start
let r1 = saved(1);
// THE FIRST START OF THE BINARY IS JUDGED BY EVIDENCE — an execve of it in a
// trace (browserStarts), never a flag a record carries:
//   · run 1's own launch trace started it ⇒ run 1 is whole;
//   · it did not (e.g. 0.38.1 refused a socket path over 103 bytes before any
//     browser ran) and `--first-start <trace>` names the trace in which the
//     binary DID start first (an interrupted run took it) ⇒ that trace is run
//     1's launch phase, and the record says so;
//   · neither, and no trace under --work ever started it ⇒ the launch phase is
//     taken now — it is still the binary's first start.
const tracesUnder = (dir) => { const out = []; const st = [dir]; while (st.length) { const x = st.pop(); for (const e of fs.readdirSync(x, { withFileTypes: true })) { const p = path.join(x, e.name); if (e.isDirectory()) st.push(p); else if (/\.strace$/.test(e.name)) out.push(p); } } return out; };
if (r1 && !r1.phases.some((p) => p.chromeStarts > 0) && !browserStarts(path.join(WORK, 'run-1', 'launch.strace'), EXE)) {
  const d = path.join(WORK, 'run-1');
  const prior = path.join(d, 'launch.strace');
  const w = r1.phases.find((p) => /^wrapper/.test(p.phase));
  const refusedLaunch = r1.phases.find((p) => /^launch/.test(p.phase)) || null;
  const firstStart = flag('--first-start', null);
  const elsewhere = tracesUnder(WORK).filter((f) => f !== prior && browserStarts(f, EXE) > 0);
  let l;
  if (firstStart) {
    const f = path.resolve(firstStart);
    if (!browserStarts(f, EXE)) done({ ...refusal('first_start_unproven', `--first-start ${f} holds no start of ${EXE}`), attempted: [r1] });
    if (elsewhere.some((x) => x !== f)) done({ ...refusal('first_start_ambiguous', `the binary also started in ${elsewhere.filter((x) => x !== f).join(', ')} — which start came first is not proven by one trace`), attempted: [r1] });
    const c = tagged(readTrace(f), 'launch');
    l = { phase: 'launch: the binary\'s first start (taken by an interrupted run)', trace: path.relative(WORK, f), chromeStarts: browserStarts(f, EXE), counts: c, inetConnects: c.inetConnects, note: flag('--first-start-note', '') };
  } else {
    if (elsewhere.length) done({ ...refusal('first_start_elsewhere', `the binary already started in ${elsewhere.join(', ')} — name that trace with --first-start (the first start cannot be taken twice)`), attempted: [r1] });
    if (fs.existsSync(prior)) fs.renameSync(prior, path.join(d, 'launch-refused.strace'));
    l = await browserLaunch(d, path.join(d, 'home'), HOLD_MS);
  }
  r1 = { what: B.CLOAK_EGRESS_RUNS[0], ...mergeCounts([w.counts, l.counts]), phases: [w, ...(refusedLaunch ? [{ phase: 'launch refused before any browser ran', why: (refusedLaunch.stdout || '').trim().slice(0, 300), chromeStarts: 0, inetConnects: refusedLaunch.counts ? refusedLaunch.counts.inetConnects : 0, counts: refusedLaunch.counts || null }] : []), l], download: r1.download || null };
  save(1, r1);
}
if (!r1) {
  if (fs.existsSync(EXE)) done(refusal('cache_not_fresh', `${EXE} already exists — a first launch cannot be measured on a cache that holds the binary (point --cache-dir at an empty VibeSpace-owned dir, or --resume a run that took it)`));
  if (!has('--first-launch')) done(refusal('first_launch_not_authorized', `run 1 downloads the ~200 MB binary from the vendor; pass --first-launch to authorize that one download (nothing was fetched)`));
  const d = runDirOf(1); const home = path.join(d, 'home');
  const w = await wrapperInstall(d, home, { watchDownload: true });
  if (w.kept) { download = { file: path.basename(w.kept).replace(/^archive-_download_\d+/, 'cloakbrowser-<platform>'), bytes: fs.statSync(w.kept).size, sha256: await sha256File(w.kept) }; try { fs.unlinkSync(w.kept); } catch { /* the hash is taken */ } }
  const ok = fs.existsSync(EXE);
  const l = ok ? await browserLaunch(d, home, HOLD_MS) : null;
  r1 = { what: B.CLOAK_EGRESS_RUNS[0], ...mergeCounts([w.counts, ...(l ? [l.counts] : [])]), phases: [w, ...(l ? [l] : [])], download };
  save(1, r1);
}
download = r1.download || null;
runs.push(r1);
if (!fs.existsSync(EXE)) done({ ...refusal('first_launch_failed', `the first launch left no binary at ${EXE}: ${(r1.phases[0] && r1.phases[0].stderr || '').slice(-400)}`), attempted: runs });

// run 2 — second launch from cache (the wrapper's cached path + a browser start)
let r2 = saved(2);
if (!r2) { const d = runDirOf(2); const home = path.join(d, 'home'); const w = await wrapperInstall(d, home); const l = await browserLaunch(d, home, HOLD_MS); r2 = { what: B.CLOAK_EGRESS_RUNS[1], ...mergeCounts([w.counts, l.counts]), phases: [w, l] }; save(2, r2); }
runs.push(r2);
// run 3 — a key in the vendor's variable at LAUNCH (where the product puts one)
let r3 = saved(3);
if (!r3) { const d = runDirOf(3); const home = path.join(d, 'home'); const l = await browserLaunch(d, home, HOLD_MS, { CLOAKBROWSER_LICENSE_KEY: LICENSE }); r3 = { what: B.CLOAK_EGRESS_RUNS[2], ...mergeCounts([l.counts]), phases: [l], key: LICENSE_KIND }; save(3, r3); }
runs.push(r3);
// run 4 — the idle browser
let r4 = saved(4);
if (!r4) { const d = runDirOf(4); const home = path.join(d, 'home'); const l = await browserLaunch(d, home, IDLE_MS); r4 = { what: B.CLOAK_EGRESS_RUNS[3], ...mergeCounts([l.counts]), phases: [l], idleMs: IDLE_MS }; save(4, r4); }
runs.push(r4);

const exeSha = await sha256File(EXE);
const record = {
  provider: 'cloak', tool: TOOL, date: today, version: pkg.version, chromium: PIN, platform: (diag.environment && diag.environment.platform_tag) || null, status: 'measured', measuredWith: 'scripts/measure-cloak-egress.mjs',
  package: `${pkg.name}@${pkg.version}`, launchedVia: `the browser driver VibeSpace runs (${((spawnSync(AB, ['--version'], { encoding: 'utf8' }).stdout || '').trim().split(' ').pop()) || '?'}), its executable path set to <chrome> and its browser arguments to --no-sandbox,--fingerprint=<seed>, both in its environment`,
  pins: { CLOAKBROWSER_VERSION: PIN, CLOAKBROWSER_AUTO_UPDATE: 'false' },
  download, binary: { path: path.relative(CACHE, EXE), sha256: exeSha, dirBytes: treeBytes(path.dirname(EXE)) },
  probe: { what: '`cloakbrowser info --quick --json` (the vendor\'s network-free mode)', ...probeCounts },
  runs: runs.map((r) => ({ ...r, phases: r.phases.map((p) => ({ ...p, stdout: undefined, counts: undefined, inetConnects: p.counts ? p.counts.inetConnects : undefined })) })),
  expectedRuns: B.CLOAK_EGRESS_RUNS,
};
const v = B.proofVerdict(record);
if (!v.ok) { record.status = 'refused'; record.refusal = 'incomplete'; record.detail = v.error; record.blocks = 'cloak.wired'; record.attempted = record.runs; record.runs = []; }
done(record);
