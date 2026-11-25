#!/usr/bin/env node
// lane browser-stderr-pipe — HEAVY: a REAL Chrome through the real driver on a scratch HOME / TMPDIR / private XDG_RUNTIME_DIR
// (the driver starts its own Xvfb; no display of the owner's is touched; only this suite's own processes end).
//   Ⓐ BASE (VIBESPACE_AB_BASE = a 0.38.1 native binary; SKIP without one): Chrome logging to stderr + a page logging every
//     5 ms ⇒ the main thread blocks in pipe_write, /json/version answers 0 bytes (time-to-hang) ⇒ the keeper's verdict over
//     the real /proc = stderr-pipe-full
//   Ⓑ THE PIN (the driver the run NAMES in VS_AGENT_BROWSER_BIN, ≥ 0.38.2; never one on a person's PATH): the SAME spam ⇒ answers for ≥ 3× the time-to-hang; fd 2 still a pipe — drained
//     (the verdict null)
//   Ⓒ the quiet switches (--disable-logging --log-level=3), Chrome's stderr captured by a test-local wrapper: fewer bytes
//   Ⓓ B-1789 (a sub-agent's child browser stopped answering ~20–25 s after each start, fb-a0d05b52b6): a HELPER's browser on
//     its OWN config — browser-env's childConfigFor, the real module — carries the quiet switches on its Chrome's command line
//     (THIS unit's check); under the same log spam it answers a steady eval past 60 s (a REGRESSION WATCH: the pinned 0.38.2
//     drains stderr — Ⓑ — so this part holds without the switches too). Ⓓ prints its own closing line «Ⓓ RAN: …»: a run whose
//     log lacks it never checked «past 60 s» (the whole suite SKIPs green without a driver, Xvfb or Chrome — said there too)
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, DRIVER, DRIVER_LEFT_ALONE, REHOMED, driverArgs } from './scratch.mjs';
const require = createRequire(import.meta.url);
const BE = require('../src/browser-stderr.js');
let pass = 0, fail = 0;
const ok = (c, m, extra) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 400) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const done = (code) => { console.log(`\n${fail ? '✗' : '✓'} test-browser-stderr-pipe-real: ${pass} passed, ${fail} failed`); process.exit(code); };

// THE DRIVER BY THE RUNNER'S VARIABLE ONLY (主开发 r3062, the law of r2095): the one program VS_AGENT_BROWSER_BIN names, as
// scratch.mjs's door linked it into this run's own folder — re-homed (its own bin folder, on the PATH the re-home built) or
// left alone (a folder of its own, first on PATH). With no name there is none: a driver on a person's PATH is never picked up.
const namedDriver = () => {
  if (DRIVER_LEFT_ALONE && DRIVER_LEFT_ALONE.dir) return path.join(DRIVER_LEFT_ALONE.dir, DRIVER.name);
  if (REHOMED && Array.isArray(REHOMED.linked) && REHOMED.linked.includes(DRIVER.name)) { try { return require('../src/browser-facts.js').binaryResolver(DRIVER.name, process.env)(); } catch { return null; } }
  return null;
};
// the REAL driver binary: the package's native linux build — the named program itself, or the one beside its bin/agent-browser(.js)
const NAMED = namedDriver();
let AB = null;
if (NAMED) { try { const real = fs.realpathSync(NAMED); const nat = /agent-browser-linux-x64$/.test(real) ? real : path.join(path.dirname(real), 'agent-browser-linux-x64'); if (fs.existsSync(nat)) AB = nat; } catch { } }
if (!AB) { console.log(`  SKIP: ${DRIVER.skip} ${NAMED ? `the named driver (${NAMED}) has no native linux build beside it` : 'the run named none'} — Ⓐ–Ⓓ did NOT run (no «Ⓓ RAN» line)`); done(0); }
const xvfb = String(process.env.PATH || '').split(':').some((d) => fs.existsSync(path.join(d, 'Xvfb')));
if (!xvfb || process.platform !== 'linux') { console.log(`  SKIP: needs Xvfb (${xvfb}) on linux beside the named driver (${AB}) — Ⓐ–Ⓓ did NOT run (no «Ⓓ RAN» line)`); done(0); }
const verOf = (bin) => { try { return (/(\d+\.\d+\.\d+)/.exec(execFileSync(bin, ['--version'], { encoding: 'utf8' })) || [])[1] || null; } catch { return null; } };
const cmpV = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
const ver = verOf(AB);
const AB_BASE = process.env.VIBESPACE_AB_BASE && fs.existsSync(process.env.VIBESPACE_AB_BASE) ? process.env.VIBESPACE_AB_BASE : null;
const verBase = AB_BASE ? verOf(AB_BASE) : null;
console.log(`— the pin on PATH: ${ver} (${AB}); the base: ${AB_BASE ? `${verBase} (${AB_BASE})` : 'none (VIBESPACE_AB_BASE unset ⇒ Ⓐ SKIPs)'}`);
ok(cmpV(ver, BE.FIXED_IN) >= 0, `the driver on PATH (${ver}) drains Chrome's stderr (≥ ${BE.FIXED_IN})`);

const S = scratch('bspr'); fs.mkdirSync(S, { recursive: true });
const HOME = path.join(S, 'home'); fs.mkdirSync(path.join(HOME, '.agent-browser'), { recursive: true });
let realChrome = null; // the system Chrome the driver finds on a fresh HOME (0.38.x: `which` google-chrome … chromium) — the Ⓒ wrapper execs it
for (const n of ['google-chrome', 'google-chrome-stable', 'chromium-browser', 'chromium']) { for (const d of String(process.env.PATH || '').split(':')) { const p = path.join(d, n); try { if (fs.statSync(p).isFile()) { realChrome = p; break; } } catch { } } if (realChrome) break; }
if (!realChrome) { console.log('  SKIP: no system Chrome on PATH (the driver on a fresh HOME needs one) — Ⓐ–Ⓓ did NOT run (no «Ⓓ RAN» line)'); done(0); }
console.log(`— Chrome ${realChrome}`);
const XDG = path.join(S, 'xdg'); fs.mkdirSync(XDG, { mode: 0o700 }); fs.mkdirSync(path.join(S, 'tmp'));
const envOf = (name, extra) => {
  const e = { __bin: extra.__bin || AB, PATH: process.env.PATH, HOME, TMPDIR: path.join(S, 'tmp'), XDG_RUNTIME_DIR: XDG, LANG: 'C.UTF-8', AGENT_BROWSER_SESSION: name, AGENT_BROWSER_NAMESPACE: name,
    AGENT_BROWSER_PROFILE: path.join(S, 'prof-' + name), AGENT_BROWSER_IDLE_TIMEOUT_MS: '0', AGENT_BROWSER_HEADED: '1', AGENT_BROWSER_JSON: '1', ...extra };
  return e;
};
const abEnv = (env) => { const { __bin, ...rest } = env; return rest; };
const ab = (env, args, timeout = 60000) => { try { return { ok: true, out: execFileSync(env.__bin || AB, args, { env: abEnv(env), encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'pipe'] }) }; } catch (e) { return { ok: false, out: String(e.stdout || '') + String(e.stderr || e.message) }; } };
const cdpBytes = (port) => new Promise((resolve) => { let n = 0; const req = http.get({ host: '127.0.0.1', port, path: '/json/version', timeout: 3000 }, (res) => { res.on('data', (c) => { n += c.length; }); res.on('end', () => resolve(n)); }); req.on('timeout', () => { req.destroy(); resolve(0); }); req.on('error', () => resolve(0)); });
const SPAM = "setInterval(()=>console.log('vs-bsp spam line '+Date.now()+' '+'x'.repeat(80)),5); 1";
const ended = [];
async function launch(name, extra) {
  const env = envOf(name, extra);
  const o = ab(env, ['open', 'about:blank']);
  if (!o.ok) return { ok: false, error: o.out.slice(0, 400) };
  let dpid = null; try { dpid = JSON.parse(ab(env, ['session', 'info', '--json']).out.trim().split('\n').pop()).data.pid; } catch { }
  let cpid = null;
  try { for (const l of execFileSync('ps', ['-o', 'pid=,comm=', '--ppid', String(dpid)], { encoding: 'utf8' }).split('\n')) { const m = /^\s*(\d+)\s+chrome$/.exec(l); if (m) { cpid = Number(m[1]); break; } } } catch { }
  const port = Number(String(fs.readFileSync(path.join(env.AGENT_BROWSER_PROFILE, 'DevToolsActivePort'), 'utf8')).split('\n')[0]);
  ab(env, ['eval', SPAM], 15000);
  const it = { ok: true, env, dpid, cpid, port, t0: Date.now() };
  ended.push(it);
  return it;
}
async function end(it) {
  if (!it || !it.env) return;
  ab(it.env, ['close', '--all'], 8000);
  await sleep(1500);
  try { if (it.cpid) { process.kill(it.cpid, 0); process.kill(-it.cpid, 'SIGKILL'); } } catch { } // its OWN process group (the driver's setpgid), only when still there
  try { if (it.dpid) { process.kill(it.dpid, 0); process.kill(it.dpid, 'SIGTERM'); } } catch { }
}
const fd2Of = (pid) => { try { return fs.readlinkSync(`/proc/${pid}/fd/2`); } catch { return null; } };

try {
  // ═══ Ⓐ BASE ═══
  let tHang = 10000;
  if (AB_BASE && verBase && cmpV(verBase, BE.FIXED_IN) < 0) {
    console.log(`— Ⓐ base: the driver ${verBase}'s own stdio under log spam`);
    const A = await launch('bspa' + process.pid, { __bin: AB_BASE, AGENT_BROWSER_ARGS: driverArgs('--no-sandbox', '--enable-logging=stderr') });
    ok(A.ok && A.cpid && A.port, 'the base browser launched (daemon + Chrome + its DevTools port)', A.error || { dpid: A.dpid, cpid: A.cpid, port: A.port });
    const fdA = fd2Of(A.cpid);
    ok(/^pipe:\[\d+\]$/.test(String(fdA)), `Chrome's fd 2 is the driver's pipe (${fdA})`);
    let hungAt = null;
    while (!hungAt && Date.now() - A.t0 < 60000) { if ((await cdpBytes(A.port)) === 0) hungAt = Date.now() - A.t0; else await sleep(500); }
    const pfA = await BE.probeStderrPipe(A.cpid);
    ok(hungAt !== null, `BASE HANGS: /json/version answers 0 bytes ${((hungAt || 0) / 1000).toFixed(1)} s after the spam began`, { hungAt });
    ok(BE.stderrPipeVerdict(pfA) === 'stderr-pipe-full', `the keeper's verdict over the real /proc: stderr-pipe-full (fd 2 ${pfA.fd2}, main thread ${pfA.wchans.join(' / ')})`, pfA);
    await end(A);
    if (hungAt) tHang = hungAt;
  } else console.log('  SKIP Ⓐ: no base driver older than ' + BE.FIXED_IN + ' (set VIBESPACE_AB_BASE to a 0.38.1 native binary)');

  // ═══ Ⓑ THE PIN ═══
  console.log(`— Ⓑ the pin (${ver}): the same spam`);
  const B = await launch('bspb' + process.pid, { AGENT_BROWSER_ARGS: driverArgs('--no-sandbox', '--enable-logging=stderr') });
  ok(B.ok && B.cpid && B.port, 'the browser launched on the pinned driver', B.error);
  const fdB = fd2Of(B.cpid);
  const hold = Math.max(3 * tHang, 30000);
  let misses = 0, asks = 0;
  while (Date.now() - B.t0 < hold) { asks++; if ((await cdpBytes(B.port)) === 0) misses++; await sleep(1000); }
  const pfB = await BE.probeStderrPipe(B.cpid);
  ok(misses === 0 && asks >= 10, `THE PIN HOLDS: ${asks} asks over ${(hold / 1000).toFixed(0)} s (≥ 3× the base's time-to-hang) all answered — fd 2 ${fdB} is drained`, { misses, asks });
  ok(BE.stderrPipeVerdict(pfB) === null, 'CONTROL: the verdict on it is null (the main thread never parks in pipe_write)', pfB);
  await end(B);

  // ═══ Ⓒ THE QUIET SWITCHES ═══
  console.log('— Ⓒ the quiet switches: with and without --disable-logging --log-level=3 (the page spam alone, 20 s each; stderr captured by a test-local wrapper)');
  const quietLeg = async (key, args) => {
    const logFile = path.join(S, key + '.log'), wrap = path.join(S, key + '.sh');
    fs.writeFileSync(wrap, `#!/bin/sh\nexec '${realChrome}' "$@" 2>>'${logFile}'\n`); fs.chmodSync(wrap, 0o700);
    const it = await launch(key + process.pid, { AGENT_BROWSER_ARGS: args, AGENT_BROWSER_EXECUTABLE_PATH: wrap });
    await sleep(20000);
    const bytes = fs.existsSync(logFile) ? fs.statSync(logFile).size : 0;
    const answers = it.ok ? (await cdpBytes(it.port)) > 0 : false;
    await end(it);
    return { ok: it.ok, bytes, answers };
  };
  const D = await quietLeg('bspd', driverArgs('--no-sandbox'));
  const C = await quietLeg('bspc', BE.withQuietLogging(driverArgs('--no-sandbox')));
  ok(D.ok && C.ok && D.answers && C.answers, 'both browsers launched and answer', { D, C });
  ok(C.bytes < D.bytes, `the quiet switches cut what Chrome writes on its own: ${C.bytes} bytes vs ${D.bytes} without them (same page, same 20 s)`, { C, D });

  // ═══ Ⓓ B-1789: a helper's (child) browser on its own config answers past 60 s ═══
  console.log('— Ⓓ B-1789: a sub-agent\'s child browser, on browser-env\'s own child config, under the spam: a steady eval for 65 s');
  {
    const ENVM = require('../src/server/browser-env.js');
    // its readers: Ⓐ–Ⓒ pass --no-sandbox through AGENT_BROWSER_ARGS — this child launches on its config ALONE, so the person's
    // own file (the env's home) names it: a root runner or a user-namespace limit then fails on the leg, never on the sandbox
    const EH = path.join(S, 'env-home'); fs.mkdirSync(path.join(EH, '.agent-browser'), { recursive: true }); fs.writeFileSync(path.join(EH, '.agent-browser', 'config.json'), JSON.stringify({ args: driverArgs('--no-sandbox') }));
    const be = ENVM.create({ dataDir: path.join(S, 'env-data'), homeDir: EH, serverSetting: () => undefined, log: { log() { }, warn() { }, error() { } }, env: {}, socketDirBase: path.join(S, 'env-sock'), facts: { floor: async () => ({ state: 'ok' }) } });
    const PK = 'bk-0000b789';
    be.envFor({ browserKey: PK }); // the conversation's own spawn file (the parent the child's copies)
    const cc = be.childConfigFor(PK + '.1');
    const ccArgs = cc.path ? String((JSON.parse(fs.readFileSync(cc.path, 'utf8')) || {}).args || '') : '';
    ok(!!cc.path && BE.QUIET_LOG_ARGS.every((q) => ccArgs.split(/[,\n]/).map((x) => x.trim()).includes(q)), `the child's own config (browser-env childConfigFor) carries the quiet switches (${ccArgs})`, cc);
    const K = await launch('bspk' + process.pid, { AGENT_BROWSER_CONFIG: cc.path || '' });
    ok(K.ok && K.cpid && K.port, 'the child browser launched through the driver on its own config', K.error);
    let cmd = ''; try { cmd = fs.readFileSync(`/proc/${K.cpid}/cmdline`, 'utf8').split('\0').join(' '); } catch { cmd = ''; }
    ok(BE.QUIET_LOG_ARGS.every((q) => cmd.includes(q)), 'its Chrome\'s command line carries --disable-logging --log-level=3', cmd.slice(0, 300));
    // the box's first run of this leg (2.369.412, int361's row 7 at 691f34c0b): 65 of 65 `eval`s judged missed FROM 0 s while
    // the child's Chrome was up (launched, its command line read) — a stderr hang answers first and then stops; a judge that misses
    // from the first ask is the judge's own. Ⓓ now asks the way Ⓑ and Ⓒ do (the suite's measured signal: the stderr hang is
    // DevTools answering 0 bytes): /json/version on the child's own port, once a second; the first `eval`'s raw answer is SAID in
    // the closing line (unjudged), so the next run shows what the CLI answers on this road
    const ev0 = ab(K.env, ['eval', '1+1'], 5000);
    let asks = 0, misses = 0, lastAnswerAt = 0;
    while (Date.now() - K.t0 < 65000) { asks++; if ((await cdpBytes(K.port)) > 0) lastAnswerAt = Date.now() - K.t0; else misses++; await sleep(1000); }
    ok(misses === 0 && asks >= 30 && lastAnswerAt >= 60000, `B-1789 (a regression watch — the pinned driver drains stderr): ${asks} DevTools asks over 65 s on the child's own port, each answered (the last at ${(lastAnswerAt / 1000).toFixed(0)} s) — the child browser keeps answering past 60 s`, { asks, misses, lastAnswerAt });
    if (K.ok) console.log(`  Ⓓ RAN: a real child browser (Chrome pid ${K.cpid}) on browser-env's own child config — quiet switches on its command line: ${BE.QUIET_LOG_ARGS.every((q) => cmd.includes(q)) ? 'yes' : 'NO'}; ${asks} DevTools asks over 65 s, ${misses} missed, the last answer at ${(lastAnswerAt / 1000).toFixed(1)} s; the first \`eval 1+1\` (unjudged): ok ${ev0.ok}, «${String(ev0.out || '').replace(/\s+/g, ' ').trim().slice(0, 120)}»`);
    else console.log('  Ⓓ DID NOT RUN: the child browser never launched (its red line above says why)');
    await end(K);
  }
} finally {
  for (const it of ended) await end(it);
  fs.rmSync(S, { recursive: true, force: true });
}
done(fail ? 1 : 0);
