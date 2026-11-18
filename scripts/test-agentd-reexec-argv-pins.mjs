#!/usr/bin/env node
// THE AGENT'S SELF-UPGRADE RE-EXEC — SOURCE PINS (fast, text only — lane lg-text-legs-2, B-94d3 part two). MOVED VERBATIM from the heavy
// scripts/test-agentd-reexec-argv.mjs (its real-fs / real net.Server / bundle legs and every mutant CONTROL stay there): (b) the re-exec
// spawn goes through reExecArgv, (d) the daemon lands the repoint through repointCurrent and says a failed landing, (f) the hand-over and
// the listen wiring — all pins of src/agentd/agentd.js. The file is read BY NAME, so ci.mjs's affected rule selects this suite on a change of it.
// Run: node scripts/test-agentd-reexec-argv-pins.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(dir, '..');
let failed = 0;
const check = (n, c, e) => { if (typeof n !== 'string') throw new TypeError('check(): the leg name is not a string — a swapped call (scripts/lib/check.mjs)'); if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? '\n    ' + e : ''}`); } };
// ── (b) beginUpgrade WIRES reExecArgv into the re-exec spawn ──
{
  const src = fs.readFileSync(path.join(repo, 'src/agentd/agentd.js'), 'utf-8');
  // the spawn must go through reExecArgv, NOT a bare `[path.join(dir, ...)]`
  // lane win-device-boot-hidden: the ONE spawn lives in startSuccessor(argv, env); every caller hands it reExecArgv(…)
  const succCalls = src.split('\n').filter((l) => l.includes('startSuccessor(') && !l.includes('function startSuccessor(') && !/^\s*\/\//.test(l));
  const reExecLine = succCalls.length === 2 && succCalls.every((l) => l.includes('startSuccessor(reExecArgv(')) && src.includes('function startSuccessor(argv, env) {') && src.split('\n').some((l) => l.includes('spawn(process.execPath, argv, {'));
  check('agentd.js re-exec spawns via reExecArgv', !!reExecLine, 'the upgrade spawn no longer preserves argv');
  check('agentd.js imports reExecArgv from the side-effect-free module', /require\(['"]\.\/reexec['"]\)/.test(src));
  // the old bare-array form must be GONE from the upgrade spawn
  check('no bare-array spawn in the upgrade path', !/spawn\(process\.execPath,\s*\[path\.join\(dir,/.test(src));   // stale-pins: kept (an absence check on agentd.js, not on src/jobs.js)
}

console.log('(d) the daemon lands the repoint and says a failure (source pins)');
{
  // the daemon WIRES it and SAYS a failure; the re-exec's console is hidden
  const src = fs.readFileSync(path.join(repo, 'src/agentd/agentd.js'), 'utf-8');
  check('agentd.js lands the repoint through repointCurrent (no inline symlink swap left)', src.includes('repointCurrent(fs, { root: ROOT, dir });') && !src.includes('fs.symlinkSync(dir, curTmp)'));
  check('agentd.js says a failed landing: its log + `upgrade-failed` to the hub', /log\(`upgrade to \$\{version\} FAILED/.test(src) && src.includes("mux.control({ op: 'upgrade-failed', version, error: why })"));
  check('the re-exec spawn hides its console on Windows (windowsHide)', src.includes("detached: true, stdio: 'ignore', windowsHide: true,"));
}

console.log('(f) agentd.js wires the hand-over and the listen (source pins)');
{
  // agentd.js WIRES both halves (and nothing else listens/exits around them)
  const src = fs.readFileSync(path.join(repo, 'src/agentd/agentd.js'), 'utf-8');
  // lane win-device-boot-hidden: THE re-exec spawn lives in startSuccessor (one site); the self-upgrade calls it INSIDE
  // handOver, the console self-heal calls it before any listener exists (the console step precedes the singleton)
  const ho = src.indexOf('handOver({ server, log, exit: exitDaemon, spawnNext: () => {'), sp = src.indexOf("startSuccessor(reExecArgv(path.join(dir, path.basename(process.argv[1] || 'agentd.js')))", ho), ho2 = src.indexOf('          } });', ho);
  const def = src.indexOf('function startSuccessor(argv, env) {'), heal = src.indexOf('reExec: () => { startSuccessor(reExecArgv('), listen = src.indexOf('listenWithRetry(server, SOCK');
  check('agentd.js: the self-upgrade starts its successor INSIDE handOver (close first) through startSuccessor — the ONE re-exec spawn; the console self-heal starts its successor before any listener exists; no bare exitDaemon(0) after a spawn', ho > 0 && sp > ho && sp < ho2 && (src.match(/spawn\(process\.execPath, argv, \{/g) || []).length === 1 && src.indexOf('spawn(process.execPath, argv, {') > def && def > 0 && heal > 0 && heal < listen && !/child\.unref\(\);\n\s*exitDaemon\(0\);/.test(src));
  check('agentd.js: the listen goes through listenWithRetry gated by the singleton lock; the exit-on-any-error handler is gone', src.includes('listenWithRetry(server, SOCK, { log, lockIsOurs,') && /const lockIsOurs = \(\) => \{ try \{ return fs\.readFileSync\(LOCK/.test(src) && !src.includes("server.on('error', (e) => { log('server error: ' + e.message); process.exit(1); });") && !src.includes('server.listen(SOCK'));
}

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
