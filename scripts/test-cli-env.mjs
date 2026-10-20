#!/usr/bin/env node
// A CLI INSTALLED AFTER VIBESPACE STARTED IS SEEN WITHOUT A RESTART (lane antigravity-card-fixes, the owner 2026-10-20:
// Manage agents › 「Antigravity CLI 未安装 [安装]」 with ~/.local/bin/agy 1.4.3 installed five minutes after the hub booted).
// The agent CLIs are resolved at BOOT (src/server/cli-env.js) and the boot answer was the only one a READ ever got:
// /api/backend-status handed antigravity's descriptor `cliCmds.current()` — the bare name — so the card said «not
// installed» until a restart, and its own Install button could not change that. `cliCmds.check` (src/server/cli-cmd.js)
// is the read-time twin of the spawn-time re-resolve (B-a18e):
//   ① the REAL resolver over a SCRATCH PATH dir: unresolved → the binary appears → the next read past the bound (or a
//      person's forced read) says installed and the path is ADOPTED (apply + one log line); installed → removed → not
//      installed; the lookup is BOUNDED (100 reads in 60 s of clock = 2 lookups);
//   ② the REAL status route (src/server/backend-status-route.js) with the REAL harness registry: the antigravity row
//      flips installed / not installed on the scratch binary, `?recheck=1` = the forced read;
//   ③ wiring pins: the route checks every registered CLI and hands a descriptor the CHECKED path; forSpawn and check
//      share one single-flight lookup; nothing checks on a timer; Manage agents' Install / Re-check force the next read;
//   ④ NEGATIVE CONTROLS (scripts/mutant-copy.mjs): the bound removed ⇒ the 100-read leg RED by call count; the pre-fix
//      route (current(), no check) ⇒ the "appears" leg RED; the route reading current() after a check ⇒ the uninstall
//      leg RED.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } return !!c; };

const DIR = scratch('cli-env');
fs.rmSync(DIR, { recursive: true, force: true });
const BIN = path.join(DIR, 'bin');
fs.mkdirSync(BIN, { recursive: true });
process.env.PATH = `${BIN}${path.delimiter}${process.env.PATH || ''}`; // the scratch PATH dir the real `which` and the fallback walk read
const NAME = `vs-agy-${process.pid}`; // a command no machine has
const EXE = path.join(BIN, NAME);
const install = () => fs.writeFileSync(EXE, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
const uninstall = () => fs.rmSync(EXE, { force: true });

/** A registry over the REAL resolver, counting lookups, on a fake clock. */
function rig(mod, { recheckMs } = {}) {
  const clock = { t: 1_000_000 };
  const calls = { lookups: 0, applied: [], logs: [] };
  const c = mod.createCliCmds({
    resolve: (n) => { calls.lookups++; return mod.resolveCmdAsync(n); },
    log: (l) => calls.logs.push(l),
    now: () => clock.t,
    ...(recheckMs != null ? { recheckMs } : {}),
  });
  c.register('antigravity', { name: NAME, current: mod.resolveCmd(NAME), apply: (p) => calls.applied.push(p) });
  return { c, calls, clock };
}

/** ① as rows over a module (the real one or a mutant copy). */
async function helperLegs(mod) {
  const out = [];
  const leg = (name, pass, detail) => out.push({ name, pass: !!pass, detail });
  uninstall();
  {
    const { c, calls, clock } = rig(mod);
    leg('boot found nothing: the registry holds the bare name', c.current('antigravity') === NAME);
    const r0 = await c.check('antigravity');
    leg('the first read looks it up once and says not installed (null)', r0 === null && calls.lookups === 1, `r=${r0} lookups=${calls.lookups}`);
    clock.t += 5000;
    const r1 = await c.check('antigravity');
    leg('a read inside the bound does NOT look again (bounded: no `which`)', r1 === null && calls.lookups === 1, `lookups=${calls.lookups}`);
    install();
    clock.t += 5000;
    const r2 = await c.check('antigravity');
    leg('the binary appears; a read still inside the bound answers the bound (null, no lookup)', r2 === null && calls.lookups === 1, `r=${r2} lookups=${calls.lookups}`);
    clock.t += 1000;
    const r3 = await c.check('antigravity', { force: true });
    leg('a PERSON\'S read (force: Install / Re-check) looks now and says INSTALLED at the scratch path', r3 === EXE && calls.lookups === 2, `r=${r3} lookups=${calls.lookups}`);
    leg('…the path is ADOPTED: handed to the adapter once, the registry answers it, ONE log line names it', calls.applied.join() === EXE && c.current('antigravity') === EXE && calls.logs.length === 1 && calls.logs[0].includes(EXE), JSON.stringify(calls.logs));
    clock.t += 1000;
    const r4 = await c.check('antigravity');
    leg('a resolved path costs no lookup on the next read (one access)', r4 === EXE && calls.lookups === 2);
    leg('a spawn after the adoption runs the adopted path with no lookup', (await c.forSpawn('antigravity', EXE)) === EXE && calls.lookups === 2);
    uninstall();
    clock.t += 40000;
    const r5 = await c.check('antigravity');
    leg('installed → REMOVED: the next read says not installed (the resolved path is re-validated, no restart)', r5 === null, `r=${r5}`);
    const looked = calls.lookups;
    clock.t += 1000;
    const r6 = await c.check('antigravity');
    leg('…and a read right after it does not look again (the bound covers a gone path too)', r6 === null && calls.lookups === looked, `lookups ${looked}→${calls.lookups}`);
    install();
    const r7 = await c.check('antigravity');
    leg('back at the same path: the very next read says installed (one access, no lookup)', r7 === EXE && calls.lookups === looked, `r=${r7}`);
  }
  uninstall();
  {
    const { c, calls, clock } = rig(mod);
    await c.check('antigravity');
    install();
    clock.t += mod.RECHECK_MS || 30000;
    const r = await c.check('antigravity');
    leg(`with NO press, the first read past the bound (${(mod.RECHECK_MS || 30000) / 1000} s) says installed`, r === EXE && calls.lookups === 2, `r=${r} lookups=${calls.lookups}`);
  }
  uninstall();
  {
    const { c, calls, clock } = rig(mod);
    for (let i = 0; i < 100; i++) { await c.check('antigravity'); clock.t += 600; }
    const bound = Math.ceil(60000 / (mod.RECHECK_MS || 30000));
    leg(`THE BOUND: 100 reads over 60 s of clock with the CLI absent cost ≤ ${bound} lookups (measured ${calls.lookups})`, calls.lookups <= bound, `lookups=${calls.lookups}`);
  }
  {
    const { c, calls } = rig(mod);
    const rs = await Promise.all([1, 2, 3].map(() => c.check('antigravity', { force: true })));
    leg('three forced reads in flight share ONE lookup (single-flight with forSpawn\'s)', rs.every((r) => r === null) && calls.lookups === 1, `lookups=${calls.lookups}`);
    leg('an unregistered backend answers null and looks nothing up', (await c.check('nope')) === null && calls.lookups === 1);
  }
  uninstall();
  return out;
}

/** ② the real route over a cliCmds registry: rows. `routeMod` = the route module (real or a mutant copy). */
async function routeLegs(routeMod, cliMod) {
  const out = [];
  const leg = (name, pass, detail) => out.push({ name, pass: !!pass, detail });
  uninstall();
  const { c, calls, clock } = rig(cliMod);
  let handler = null;
  const app = { get: (p, h) => { if (p === '/api/backend-status') handler = h; } };
  routeMod.create({ app, machineProbes: { cliFacts: async () => ({ claude: {}, codex: {} }) }, accounts: { list: () => ({ accounts: [] }) }, claudeCmd: 'claude', codexCmd: 'codex', cliCmds: c });
  const get = async (query = {}) => { let body = null; await handler({ query }, { json: (b) => { body = b; } }); return body?.antigravity || {}; };
  const a0 = await get();
  leg('GET /api/backend-status: not installed at the start (the real antigravity descriptor row)', a0.installed === false && a0.cmdPath === null, JSON.stringify(a0));
  install();
  clock.t += 1000;
  const a1 = await get();
  leg('the binary appears; a plain read inside the bound still says not installed (the bound, no lookup)', a1.installed === false, `lookups=${calls.lookups}`);
  const a2 = await get({ recheck: '1' });
  leg('`?recheck=1` (Manage agents after Install / Re-check) says INSTALLED with the scratch path — no restart', a2.installed === true && a2.cmdPath === EXE, JSON.stringify(a2));
  uninstall();
  clock.t += 1000;
  const a3 = await get();
  leg('the binary is removed: the next plain read says NOT installed', a3.installed === false && a3.cmdPath === null, JSON.stringify(a3));
  uninstall();
  return out;
}

console.log('① cliCmds.check over the real resolver and a scratch PATH dir');
const CLI = require(path.join(REPO, 'src/server/cli-cmd.js'));
for (const r of await helperLegs(CLI)) ok(r.name, r.pass, r.detail);

console.log('② the real /api/backend-status handler');
const ROUTE = require(path.join(REPO, 'src/server/backend-status-route.js'));
for (const r of await routeLegs(ROUTE, CLI)) ok(r.name, r.pass, r.detail);

console.log('③ wiring');
{
  const cc = read('src/server/cli-cmd.js'), rt = read('src/server/backend-status-route.js'), ce = read('src/server/cli-env.js'), ma = read('src/lib/manage-agents.js');
  ok('the route checks EVERY registered CLI at each read, forced only by `?recheck=1`', /const force = String\(req\.query\?\.recheck \|\| ''\) === '1';/.test(rt) && /cliCmds\.ids\(\)\.map\(async \(id\) => \{ live\[id\] = await cliCmds\.check\(id, \{ force \}\); \}\)/.test(rt));
  ok('…and hands a descriptor\'s machineStatus the CHECKED path (never the boot answer)', /machineStatus\(\{ cmd: cmdOf\(h\.id\) \}\)/.test(rt) && !/machineStatus\(\{ cmd: cliCmds\?\.current/.test(rt));
  ok('forSpawn and check share ONE single-flight lookup (`reresolve`)', (cc.match(/= await reresolve\(backend, e,|return reresolve\(backend, e,/g) || []).length === 2 && (cc.match(/await resolve\(e\.name\)/g) || []).length === 1);
  ok('nothing checks on a timer (no setInterval / setTimeout in cli-cmd.js; the route is the only caller of check)', !/setInterval|setTimeout/.test(cc) && (rt.match(/cliCmds\.check\(/g) || []).length === 1);
  ok('cli-env still registers claude, codex and every ACP / exe harness (the CLIs a read checks)', /cliCmds\.register\('claude'/.test(ce) && /cliCmds\.register\('codex'/.test(ce) && /for \(const id of Object\.keys\(ACP_COMMANDS\)\)[\s\S]{0,40}cliCmds\.register\(id/.test(ce));
  ok('Manage agents: Install and Re-check mark the next local status read as a person\'s (`?recheck=1`), once', /instBtn\.onclick = \(\) => \{ if \(!selectedHost\) this\._cliRecheckDue = true; run\(b\.installCmd\); \};/.test(ma) && /reBtn\.onclick = \(\) => \{ this\._cliRecheckDue = true; refresh\(\); \};/.test(ma) && /if \(recheck\) this\._cliRecheckDue = false;/.test(ma) && /`\/api\/backend-status\$\{recheck \? '\?recheck=1' : ''\}`/.test(ma));
  ok('…and the account ⋯ Re-check of an isolated-home roster forces it too', /this\._cliRecheckDue = true; \/\/ the refresh below also looks for the CLI again/.test(ma));
}

console.log('④ negative controls (patched copies outside the tree)');
{
  const M = mutantCopies('cli-env', REPO);
  const ccSrc = read('src/server/cli-cmd.js'), rtSrc = read('src/server/backend-status-route.js');
  const BOUND = '      if (!force && t - e.lookedAt < recheckMs) return null;\n';
  ok('control unbounded: the bound line exists in cli-cmd.js', ccSrc.includes(BOUND));
  const unbounded = M.load('src/server/cli-cmd.js', ccSrc.replace(BOUND, ''), 'unbounded');
  const redU = (await helperLegs(unbounded)).filter((r) => !r.pass).map((r) => r.name);
  ok(`control unbounded (a lookup on EVERY read): THE BOUND leg is RED by call count (${redU.length} red)`, redU.some((n) => /^THE BOUND/.test(n)), redU.join(' | ').slice(0, 300));
  const PRE = [
    ["      try { await Promise.all(cliCmds.ids().map(async (id) => { live[id] = await cliCmds.check(id, { force }); })); } catch { }\n", ''],
    ['machineStatus({ cmd: cmdOf(h.id) })', 'machineStatus({ cmd: cliCmds?.current?.(h.id) ?? null })'],
  ];
  ok('control pre-fix: the patched lines exist in the route', PRE.every(([a]) => rtSrc.includes(a)));
  const preRoute = M.load('src/server/backend-status-route.js', PRE.reduce((s, [a, b]) => s.replace(a, b), rtSrc), 'pre-fix');
  const redP = (await routeLegs(preRoute, CLI)).filter((r) => !r.pass).map((r) => r.name);
  ok(`control pre-fix (the boot answer, no check — the owner's card): the "appears" leg is RED (${redP.length} red)`, redP.some((n) => /says INSTALLED/.test(n)), redP.join(' | ').slice(0, 300));
  const staleRoute = M.load('src/server/backend-status-route.js', rtSrc.replace('machineStatus({ cmd: cmdOf(h.id) })', 'machineStatus({ cmd: cliCmds?.current?.(h.id) ?? null })'), 'current-not-checked');
  const redS = (await routeLegs(staleRoute, CLI)).filter((r) => !r.pass).map((r) => r.name);
  ok(`control current-not-checked (a check runs, the row reads the registry): the uninstall leg is RED (${redS.length} red)`, redS.some((n) => /removed/.test(n)), redS.join(' | ').slice(0, 300));
  for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 3 })) ok(r.name, r.pass, r.detail);
}

console.log(`\n${fail ? fail + ' FAILED (' + pass + ' passed)' : 'ALL PASS (' + pass + ')'}`);
process.exit(fail ? 1 : 0);
