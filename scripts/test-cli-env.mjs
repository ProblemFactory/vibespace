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
// THE CLI LOCATION LAW (lane cli-shell-truth, B-fb02; the owner 2026-11-03: codex under nvm's v24.12.0, the hub's PATH
// with v24.22.1 only — every codex spawn died in silence while `command -v codex` in the owner's zsh found it). The
// person's LOGIN SHELL is the truth (cli-cmd.js askShell), driven here over SCRATCH SHELLS (sh scripts installed as the
// shell, honouring -l -i -c, printing a banner and a decoy sentinel pair first) — never the machine's own zsh:
//   ⑤ the rung: the four answer kinds (path / none / alias / unanswered: exit, spawn, no shell, timeout — the child and
//      its rc's leftover dead, the event loop never held), the decoy never wins, the three flags spelled apart, the
//      sanitized env (planted tokens ABSENT from the shell's env), the ladder SHELL › account › zsh/bash › /bin/sh and
//      the dial road's S0 spelling agreeing with it on the same inputs;
//   ⑥ the registry on the REAL default road (process.env.SHELL = a scratch shell): the shell's path REPLACES a working
//      provisional one at the first spawn (+ its PATH rides the spawn), a cached shell path costs no ask, a person's
//      Re-check re-asks (a newer install adopted), a gone path re-asks, a timeout keeps the provisional path AND names
//      it, found-nothing / an alias REFUSE by name (CliMissing: cli, shell, looked, hint), the route's census fields;
// real-cli-env: NO agent CLI runs here — `command -v codex` above is prose; every shell is a scratch sh script, every CLI a
// scratch `exit 0` file, and the vendor keys planted in ⑤ exist to prove the shell ask strips them.
//   ⑦ MUTANTS: fail-closed removed ⇒ the refusal legs RED; the sentinel parse removed ⇒ the banner becomes the answer
//      (RED); the env unsanitized ⇒ the token leg RED; the bound removed ⇒ the timeout leg RED.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
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

// SCRATCH LOGIN SHELLS: sh scripts that take `-l -i -c <line>` the way a login shell does, after an "rc" that prints a
// 3-line banner and a whole DECOY sentinel triple (the last pair must win), may dump its env, may move PATH.
const SHD = path.join(DIR, 'shells');
fs.mkdirSync(SHD, { recursive: true });
const RUN_C = (pre = '') => `while [ $# -gt 0 ]; do case "$1" in -c) shift; exec /bin/sh -c "${pre}$1";; *) shift;; esac; done; exit 9`;
const mkShell = (name, body) => { const p = path.join(SHD, name); fs.writeFileSync(p, `#!/bin/sh\n${body}\n`, { mode: 0o755 }); return p; };
const F = (n) => path.join(DIR, n);
const BANNER = ['echo "Welcome to the scratch login shell"', 'echo "  an rc banner, three lines"', 'echo "Last login: never"',
  "printf '__VS_CV_BEGIN__\\n/decoy/printed/by/the/rc\\n__VS_CV_END__\\n/decoy/path\\n__VS_PATH_END__\\n'"];
const NOISY = mkShell('noisy-shell', [`printf '%s|' "$@" > '${F('argv.log')}'`, ...BANNER, RUN_C()].join('\n'));
// the registry's shell (⑥): counts its asks; its "rc" may move PATH (an nvm dir first) or drop the hub's dirs
const REGSH = mkShell('reg-shell', [`echo x >> '${F('asks.log')}'`, ...BANNER,
  `[ -f '${F('restrict')}' ] && PATH=/usr/bin:/bin && export PATH`,
  `[ -f '${F('prefix')}' ] && PATH="$(cat '${F('prefix')}'):$PATH" && export PATH`,
  RUN_C()].join('\n'));
const ENVSH = mkShell('env-shell', [`env > '${F('env.txt')}'`, ...BANNER, RUN_C()].join('\n'));
const SLEEPY = mkShell('sleepy-shell', `echo $$ > '${F('sleepy.pid')}'; sleep 60 & echo $! > '${F('sleepy-child.pid')}'; wait`);
const EXIT3 = mkShell('exit3-shell', 'echo "an rc that gives up"; exit 3');
const FN = mkShell('fn-shell', RUN_C('vsfn_cli() { :; }; '));
const ZSH = ['/usr/bin/zsh', '/bin/zsh'].find((p) => fs.existsSync(p)) || null;
const ZALIAS = ZSH ? mkShell('zalias-shell', `while [ $# -gt 0 ]; do case "$1" in -c) shift; exec ${ZSH} -f -c "alias vs-al-cli=ls; $1";; *) shift;; esac; done`) : null;
const asks = () => { try { return fs.readFileSync(F('asks.log'), 'utf8').split('\n').filter(Boolean).length; } catch { return 0; } };
const alive = (pid) => { if (!(pid > 1)) return false; try { const st = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'); return !/^\d+ \(.*\) Z /.test(st); } catch { return false; } };
const readPid = (n) => { try { return Number(fs.readFileSync(F(n), 'utf8').trim()) || 0; } catch { return 0; } };
const deadSoon = async (pid) => { for (let i = 0; i < 200 && alive(pid); i++) await new Promise((r) => setTimeout(r, 5)); return !alive(pid); };
/** the sleepy shell's pids, killed by this suite only when /proc says they are still OUR scratch processes */
const reapSleepy = () => { for (const n of ['sleepy.pid', 'sleepy-child.pid']) { const pid = readPid(n); try { const cmd = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8'); if (cmd.includes('sleepy-shell') || cmd.includes('sleep\u000060')) process.kill(pid, 'SIGKILL'); } catch { } } };
process.env.SHELL = REGSH; // the REAL default road (loginShellOf → process.env.SHELL) asks a scratch shell, never this machine's own

/** A registry over the REAL resolver, counting lookups, on a fake clock. */
/** lane cli-shell-truth: the lookup IS the login-shell ask. ①②④ judge the REGISTRY and the ROUTE (the bound, the
 *  adoption, the rows), so their shell answers from the scratch PATH dir in-process — a scratch shell's own answers are
 *  ⑤–⑦'s; `stubAsk` = an instant «none» for the legs that count lookups. The hub's walk is the real resolver. */
const dirAsk = async (n) => { const p = path.join(BIN, n); try { await fs.promises.access(p, fs.constants.X_OK); return { kind: 'path', path: p, shell: NOISY, shellPath: process.env.PATH }; } catch { return { kind: 'none', shell: NOISY }; } };
function rig(mod, { recheckMs, stubAsk = false } = {}) {
  const clock = { t: 1_000_000 };
  const calls = { lookups: 0, applied: [], logs: [] };
  const c = mod.createCliCmds({
    ask: (n) => { calls.lookups++; return stubAsk ? Promise.resolve({ kind: 'none', shell: NOISY }) : dirAsk(n); },
    ...(stubAsk ? { resolve: async (n) => n } : {}), // …and an instant empty hub walk (no `which` per counted lookup)
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
    leg('back at the same path: a read inside the bound keeps the shell\'s last answer (not installed, no ask) — the shell is the truth', r7 === null && calls.lookups === looked, `r=${r7}`);
    const r8 = await c.check('antigravity', { force: true });
    leg('…and a person\'s Re-check asks the shell again and says installed', r8 === EXE && calls.lookups === looked + 1, `r=${r8}`);
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
    const { c, calls, clock } = rig(mod, { stubAsk: true });
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
  leg('…and the row carries the OBSERVED census: the shell answered none (answer, shell, askedAt, provenance)', a0.answer === 'none' && a0.shell === 'noisy-shell' && typeof a0.askedAt === 'number' && a0.provenance === 'hub-path' && a0.unanswered === null, JSON.stringify(a0));
  const a2 = await get({ recheck: '1' });
  leg('`?recheck=1` (Manage agents after Install / Re-check) says INSTALLED with the scratch path — no restart', a2.installed === true && a2.cmdPath === EXE, JSON.stringify(a2));
  leg('…found BY THE SHELL: provenance shell, answer path, the shell named', a2.provenance === 'shell' && a2.answer === 'path' && a2.shell === 'noisy-shell', JSON.stringify(a2));
  uninstall();
  clock.t += 1000;
  const a3 = await get();
  leg('the binary is removed: the next plain read says NOT installed', a3.installed === false && a3.cmdPath === null, JSON.stringify(a3));
  // THE CLI IS MISSING FOR EVERY PURPOSE: the hub's probe saw a codex (cliFacts says installed), the person's shell did not
  {
    const HUBD = path.join(DIR, 'hubonly'); fs.mkdirSync(HUBD, { recursive: true });
    const HUBX = path.join(HUBD, NAME + '-cx'); fs.writeFileSync(HUBX, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    const savedPath = process.env.PATH; process.env.PATH = `${HUBD}${path.delimiter}${savedPath}`;
    fs.writeFileSync(F('restrict'), '');
    try {
      const c2 = cliMod.createCliCmds({ ask: (n) => cliMod.askShell(n, { shell: REGSH }), log: () => {} });
      c2.register('codex', { name: NAME + '-cx', current: HUBX });
      let h2 = null;
      routeMod.create({ app: { get: (p, h) => { if (p === '/api/backend-status') h2 = h; } }, machineProbes: { cliFacts: async () => ({ claude: {}, codex: { installed: true, cmdPath: HUBX, version: '0.0.1' } }) }, accounts: { list: () => ({ accounts: [] }) }, cliCmds: c2 });
      let body = null; await h2({ query: {} }, { json: (b) => { body = b; } });
      const cx = body?.codex || {};
      leg('the hub\'s own PATH has the CLI but the person\'s shell does not: the row says NOT installed, the hub\'s path a HINT (hubPath), never a spawn', cx.installed === false && cx.cmdPath === null && cx.answer === 'none' && cx.hubPath === HUBX && /add that directory to your shell's PATH/.test(cx.hint || ''), JSON.stringify(cx));
    } finally { process.env.PATH = savedPath; fs.rmSync(F('restrict'), { force: true }); }
  }
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
  ok('forSpawn and check share ONE single-flight lookup (`lookup`: one shell ask, one hub walk)', (cc.match(/await lookup\(backend, e\)|return lookup\(backend, e\)/g) || []).length === 2 && (cc.match(/await askOf\(e\.name\)/g) || []).length === 1 && (cc.match(/await resolve\(e\.name\)/g) || []).length === 1);
  ok('nothing checks on a timer (no setInterval; the ONE setTimeout is the shell ask\'s bound — it ENDS an ask, never starts one; the route is the only caller of check)', !/setInterval/.test(cc) && (cc.match(/setTimeout\(/g) || []).length === 1 && /timer = setTimeout\(\(\) => done\(\{ kind: 'unanswered', why: 'timeout' \}\), timeoutMs\);/.test(cc) && (rt.match(/cliCmds\.check\(/g) || []).length === 1);
  ok('cli-env still registers claude, codex and every ACP / exe harness (the CLIs a read checks)', /cliCmds\.register\('claude'/.test(ce) && /cliCmds\.register\('codex'/.test(ce) && /for \(const id of Object\.keys\(ACP_COMMANDS\)\)[\s\S]{0,40}cliCmds\.register\(id/.test(ce));
  ok('Manage agents: Install and Re-check mark the next local status read as a person\'s (`?recheck=1`), once', /instBtn\.onclick = \(\) => \{ if \(!selectedHost\) this\._cliRecheckDue = true; run\(b\.installCmd\); \};/.test(ma) && /reBtn\.onclick = \(\) => \{ this\._cliRecheckDue = true; refresh\(\); \};/.test(ma) && /if \(recheck\) this\._cliRecheckDue = false;/.test(ma) && /`\/api\/backend-status\$\{recheck \? '\?recheck=1' : ''\}`/.test(ma));
  ok('…and the account ⋯ Re-check of an isolated-home roster forces it too', /this\._cliRecheckDue = true; \/\/ the refresh below also looks for the CLI again/.test(ma));
  // lane cli-shell-truth
  const wc = read('src/ws-create.js'), dl = read('src/spawn/dial.js'), sl = read('src/lib/session-lifecycle.js'), census = read('scripts/spawn-env-census.mjs');
  const at = wc.indexOf('try { spawnCmd = await cliCmds.forSpawn(backend, spawnCmd); } catch (e) {');
  ok('ws-create: ONE forSpawn, BEFORE the local ladder (its writer sweep) and the ONE spawn line; a CliMissing answers `cli-missing` with its facts and returns', at > 0 && (wc.match(/cliCmds\.forSpawn\(/g) || []).length === 1 && wc.indexOf('await spawnFor(null)[sessionMode]', at) > at && wc.indexOf('const r6Line = sessionSpawnLine(') > at && /ws\.send\(JSON\.stringify\(\{ type: 'error', code: 'cli-missing', reqId: data\.reqId, backend, cli: e\.cli, shell: e\.shell \|\| null, [^\n]*looked: e\.looked \|\| \[\], hubPath: e\.hubPath \|\| null, hint: e\.hint \|\| null, message: e\.message \}\)\);\n\s*return;/.test(wc));
  ok('…the ACP «installed === false» branch FOLDED into that verdict (one road, not two)', !/adapter\.installed === false/.test(wc));
  ok('…the shell\'s PATH is the base of the spawn\'s PATH pair when the shell found the CLI (the agent-tools dir stays first)', /cliShellPath = cliCmds\.spawnPath\?\.\(backend\) \|\| null;/.test(wc) && /`PATH=\$\{integrationOn \? AGENT_BIN_DIR \+ ':' : ''\}\$\{cliShellPath \|\| process\.env\.PATH \|\| '\/usr\/local\/bin:\/usr\/bin:\/bin'\}`/.test(wc));
  ok('the dial road\'s shell terminal reads THE ladder (src/login-shell.js S0_SH)', /const \{ S0_SH \} = require\('\.\.\/login-shell'\)/.test(dl) && /const shellResolve = SP\.loginShell \? S0_SH : '';/.test(dl));
  ok('the client draws a cli-missing refusal as a DIALOG (never a toast alone); the failed-RESUME rescue stays', /if \(msg\.code === 'cli-missing'\) \{ try \{ openCliMissingDialog\(this, msg\); \} catch \{ showToast\(text, \{ type: 'error' \}\); \} \}\n\s*else showToast\(text, \{ type: 'error' \}\);/.test(sl) && /const rescueViewOnly = \(\) => \{/.test(sl));
  ok('the route overlays the census on every registered CLI and says a shell-missing CLI is not installed', /const c = cliCmds\.census\(id\);/.test(rt) && /if \(missing && live\[id\] == null\) \{ out\[id\]\.installed = false; out\[id\]\.cmdPath = null; out\[id\]\.version = null; \}/.test(rt));
  ok('Manage agents: the census line under the version chip (this machine only, textContent) and Re-check on an installed row', /const where = cliWhereWords\(info\);/.test(ma) && /el\.textContent = where\.text;/.test(ma) && /if \(!selectedHost && \(!info\.installed && b\.installCmd \|\| info\.answer\)\) \{/.test(ma));
  ok('the shell ask is ONE row of the spawn-env census (held to serviceEnv, its env named)', /\['src\/server\/cli-cmd\.js', 'shell', "the person's LOGIN SHELL asked where an agent CLI is/.test(census) && (cc.match(/env: serviceEnv\(env, \{ keep: \['USER', 'LOGNAME'\], add: \{ SHELL: shell, TERM: 'dumb', VIBESPACE_SHELL_PROBE: '1' \} \}\)/g) || []).length === 1);
}

console.log('④ negative controls (patched copies outside the tree)');
const M = mutantCopies('cli-env', REPO); // ONE copy set for ④ and ⑦ — its tree-litter census (a `git status`) runs once, at ⑦'s end
{
  const ccSrc = read('src/server/cli-cmd.js'), rtSrc = read('src/server/backend-status-route.js');
  const BOUND = '        if (now() - e.lookedAt < recheckMs) return null;\n';
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
}


/** ⑤ THE SHELL RUNG — rows over a module (the real one or a mutant copy). The groups touch disjoint scratch state (each its
 *  own shell and files), so they run SIDE BY SIDE; rows come back in a fixed order. */
async function rungLegs(mod, { groups = ['noisy', 'kinds', 'env', 'sleepy'], boundGuardMs = 0 } = {}) {
  if (typeof mod.askShell !== 'function') return [{ name: 'THE SHELL RUNG exists: cli-cmd.js exports askShell (the person\'s login shell asked where a CLI is)', pass: false, detail: 'no askShell' }];
  const S = require(path.join(REPO, 'src/login-shell.js'));
  const G = {
    async noisy(leg) {
      install();
      const a = await mod.askShell(NAME, { shell: NOISY });
      leg('a scratch login shell with a noisy rc (a 3-line banner + a DECOY sentinel triple first) answers kind:path at the real executable — the LAST pair wins', a.kind === 'path' && a.path === EXE, JSON.stringify(a));
      leg('…its exported PATH rides the answer (shellPath, printenv\'s colon form)', typeof a.shellPath === 'string' && a.shellPath.split(':').includes(BIN), String(a.shellPath).slice(0, 120));
      let argv = []; try { argv = fs.readFileSync(F('argv.log'), 'utf8').split('|'); } catch { }
      leg('…asked as `-l -i -c <line>` (the three flags spelled apart) with the line the law names', argv[0] === '-l' && argv[1] === '-i' && argv[2] === '-c' && argv[3] === S.shellLine(NAME), argv.slice(0, 3).join(' '));
      uninstall();
      const b = await mod.askShell(NAME, { shell: NOISY });
      leg('the CLI absent: kind:none (the shell answered, nothing between the sentinels — the decoy path did not count)', b.kind === 'none', JSON.stringify(b));
    },
    async kinds(leg) {
      const [a, z, e3, en, e0] = await Promise.all([
        mod.askShell('vsfn_cli', { shell: FN }), ZALIAS ? mod.askShell('vs-al-cli', { shell: ZALIAS }) : null,
        mod.askShell(NAME, { shell: EXIT3 }), mod.askShell(NAME, { shell: path.join(SHD, 'no-such-shell') }), mod.askShell(NAME, { shell: '' })]);
      leg('a shell FUNCTION: kind:alias (command -v printed its bare name — VibeSpace runs programs)', a.kind === 'alias' && a.text === 'vsfn_cli', JSON.stringify(a));
      if (z) leg('a zsh ALIAS: kind:alias with what the shell printed', z.kind === 'alias' && /alias/.test(z.text || ''), JSON.stringify(z));
      leg('the shell could not be asked: an rc that exits 3 ⇒ unanswered exit:3; a missing shell ⇒ spawn:ENOENT; none ⇒ no-shell', e3.kind === 'unanswered' && e3.why === 'exit:3' && en.kind === 'unanswered' && en.why === 'spawn:ENOENT' && e0.kind === 'unanswered' && e0.why === 'no-shell', JSON.stringify([e3.why, en.why, e0.why]));
    },
    async env(leg) {
      // the planted values are BUILT (a token shape never sits in the source — the secret scan's rule)
      const mk = (...p) => p.join('-');
      const planted = { VIBESPACE_SESSION_TOKEN: mk('vs', 'planted', 'session'), CLAUDE_CODE_OAUTH_TOKEN: mk('sk', 'ant', 'oat01', 'planted'), VIBESPACE_API: 'http://127.0.0.1:9/planted', npm_config_planted: mk('npm', 'planted', 'value'), ANTHROPIC_API_KEY: mk('sk', 'ant', 'api', 'planted') };
      fs.rmSync(F('env.txt'), { force: true });
      await mod.askShell(NAME, { shell: ENVSH, env: { ...process.env, ...planted } }); // the hub's env with the tokens in it
      let envTxt = ''; try { envTxt = fs.readFileSync(F('env.txt'), 'utf8'); } catch { }
      const names = envTxt.split('\n').map((l) => l.split('=')[0]).filter(Boolean);
      const leaked = Object.keys(planted).filter((k) => names.includes(k) || envTxt.includes(planted[k]));
      leg(`THE SANITIZED ENV: tokens planted in the hub's env are ABSENT from the shell's env (${Object.keys(planted).join(', ')})`, envTxt.length > 0 && leaked.length === 0, leaked.length ? 'LEAKED ' + leaked.join(',') : `${names.length} names`);
      leg('…and it carries the probe mark + TERM=dumb, the hub\'s PATH as its baseline, HOME', /^VIBESPACE_SHELL_PROBE=1$/m.test(envTxt) && /^TERM=dumb$/m.test(envTxt) && /^PATH=.+/m.test(envTxt) && /^HOME=\//m.test(envTxt) && !names.some((n) => /^VIBESPACE_(?!SHELL_PROBE$)/.test(n)), names.filter((n) => /^(VIBESPACE|TERM|PATH|HOME)/.test(n)).join(','));
    },
    async sleepy(leg) {
      let r = null;
      // 80 ms, then 320 ms on a box too loaded for the shell to have written its pids inside the first bound
      for (const bound of [80, 320]) {
        fs.rmSync(F('sleepy.pid'), { force: true }); fs.rmSync(F('sleepy-child.pid'), { force: true });
        let ticks = 0; const tick = setInterval(() => { ticks++; }, 5);
        const guard = new Promise((res) => setTimeout(() => res({ kind: 'GUARD', why: `no answer by the guard` }), boundGuardMs || bound * 3));
        const a = await Promise.race([mod.askShell(NAME, { shell: SLEEPY, timeoutMs: bound }), guard]);
        clearInterval(tick);
        r = { a, ticks };
        if (a.kind === 'GUARD' || (readPid('sleepy.pid') > 1 && readPid('sleepy-child.pid') > 1)) break;
      }
      const { a, ticks } = r;
      leg(`an rc that never returns (sleep 60): unanswered:timeout — ended by the bound, not the guard; the hub's loop ran meanwhile (${ticks} ticks)`, a.kind === 'unanswered' && a.why === 'timeout' && ticks >= 1, JSON.stringify(a));
      const sp = readPid('sleepy.pid'), sc = readPid('sleepy-child.pid');
      const dead = a.kind !== 'GUARD' && (await deadSoon(sp)) && (await deadSoon(sc)); // the guard ended it ⇒ nobody killed them: red, reaped below
      leg('…the shell (its pid) AND its rc\'s leftover child (its own session) are dead', sp > 1 && sc > 1 && dead, `shell ${sp} alive=${alive(sp)} child ${sc} alive=${alive(sc)}`);
      if (!dead) reapSleepy();
    },
  };
  const rows = await Promise.all(groups.map(async (g) => { const out = []; const push = (name, pass, detail) => out.push({ name, pass: !!pass, detail }); try { await G[g](push); } catch (e) { push(`the rung's «${g}» legs ran to their end`, false, e && e.stack); } return out; }));
  return rows.flat();
}

/** ⑥ THE REGISTRY on the real default road — rows over a module. */
async function registryLegs(mod, { slow = true } = {}) {
  const out = [];
  const leg = (name, pass, detail) => out.push({ name, pass: !!pass, detail });
  const N2 = `vs-cdx-${process.pid}`;
  const HUBD = path.join(DIR, 'hub'), SH1 = path.join(DIR, 'nvm-a'), SH2 = path.join(DIR, 'nvm-b');
  for (const d of [HUBD, SH1, SH2]) fs.mkdirSync(d, { recursive: true });
  const put = (d) => { fs.writeFileSync(path.join(d, N2), '#!/bin/sh\nexit 0\n', { mode: 0o755 }); return path.join(d, N2); };
  const HUBX = put(HUBD), SHX1 = put(SH1);
  fs.rmSync(path.join(SH2, N2), { force: true });
  fs.writeFileSync(F('prefix'), SH1);
  // UNANSWERED (its own registry and shell, BESIDE the rest): the provisional path stays, the degradation NAMED
  const unanswered = slow ? (async () => {
    const r = [];
    const ulogs = [];
    const cu = mod.createCliCmds({ ask: (n) => mod.askShell(n, { shell: SLEEPY, timeoutMs: 80 }), log: (l) => ulogs.push(l) });
    cu.register('codex', { name: N2, current: HUBX });
    const ru = await cu.forSpawn('codex', HUBX);
    const cs = cu.census?.('codex');
    r.push(['the shell could not be ASKED (timeout) ⇒ the spawn proceeds on the provisional path (a probe that cannot answer is not a refusal)', ru === HUBX && cu.spawnPath?.('codex') === null, `r=${ru}`]);
    r.push(['…the degradation is NAMED: census unanswered:timeout, provenance hub-path; one journal line «could not be asked … using the hub\'s PATH»', !!cs && cs.unanswered === 'timeout' && cs.answer === 'unanswered' && cs.provenance === 'hub-path' && ulogs.length === 1 && /could not be asked .*\(timeout\) — using the hub's PATH/.test(ulogs[0]), JSON.stringify({ cs, ulogs })]);
    r.push(['…and the next spawn does not ask again (asked ONCE; a person\'s Re-check would)', (await cu.forSpawn('codex', HUBX)) === HUBX && ulogs.length === 1]);
    return r;
  })() : null;
  try {
    const logs = [], applied = [];
    const c = mod.createCliCmds({ log: (l) => logs.push(l) }); // NO injected ask: loginShellOf → process.env.SHELL (the scratch shell)
    c.register('codex', { name: N2, current: HUBX, apply: (p) => applied.push(p) });
    const n0 = asks();
    leg('nothing is asked at registration (boot keeps the cheap provisional answer)', asks() === n0 && c.census?.('codex')?.answer === null && c.census?.('codex')?.provenance === 'hub-path');
    const r1 = await c.forSpawn('codex', HUBX);
    leg('THE FIRST SPAWN asks the login shell ONCE and its path REPLACES the provisional one — even though the provisional path works (their PATH order is their choice)', r1 === SHX1 && asks() === n0 + 1 && applied.join() === SHX1 && c.current('codex') === SHX1, `r=${r1} asks=${asks() - n0}`);
    leg('…provenance shell, the shell named; ONE journal line names both paths', c.census?.('codex')?.provenance === 'shell' && c.census?.('codex')?.shell === 'reg-shell' && logs.length === 1 && logs[0].includes(SHX1) && logs[0].includes(HUBX), JSON.stringify(logs));
    leg('…and the spawn\'s PATH is the shell\'s own (the nvm dir its rc put first)', (c.spawnPath?.('codex') || '').split(':')[0] === SH1, String(c.spawnPath?.('codex')).slice(0, 80));
    const r2 = await c.forSpawn('codex', SHX1);
    leg('the next spawn: a cached shell path still executable costs ONE access — no ask', r2 === SHX1 && asks() === n0 + 1);
    leg('a plain status read: no ask either', (await c.check('codex')) === SHX1 && asks() === n0 + 1);
    const SHX2 = put(SH2); fs.writeFileSync(F('prefix'), `${SH2}:${SH1}`);
    leg('a newer install under another node version: a plain read keeps the cached path (no ask)', (await c.check('codex')) === SHX1 && asks() === n0 + 1);
    const r3 = await c.check('codex', { force: true });
    leg('…a person\'s Re-check (force) asks the shell again and ADOPTS it', r3 === SHX2 && c.current('codex') === SHX2 && asks() === n0 + 2 && applied[applied.length - 1] === SHX2, `r=${r3}`);
    fs.rmSync(SHX2);
    const r4 = await c.forSpawn('codex', SHX2);
    leg('the shell\'s path GONE: the next spawn asks the shell again (and runs what it finds now)', r4 === SHX1 && asks() === n0 + 3, `r=${r4}`);
    // FAIL CLOSED: the shell finds nothing — the hub's own walk does (a hint, never a spawn)
    fs.rmSync(F('prefix'), { force: true });
    fs.rmSync(SHX1, { force: true }); // gone from every dir the shell sees; only the hub's own walk still has one
    fs.writeFileSync(F('restrict'), '');
    const savedPath = process.env.PATH; process.env.PATH = `${HUBD}${path.delimiter}${savedPath}`;
    let thrown = null, ran = null;
    try { ran = await c.forSpawn('codex', SHX1); } catch (e) { thrown = e; }
    finally { process.env.PATH = savedPath; fs.rmSync(F('restrict'), { force: true }); }
    leg('FAIL CLOSED: the shell found NOTHING ⇒ forSpawn REFUSES (a thrown CliMissing, code cli-missing) — never «spawning it as before»', !ran && thrown && thrown.code === 'cli-missing' && thrown.answer === 'none' && thrown.cli === N2 && thrown.shell === 'reg-shell', thrown ? thrown.message : `ran ${ran}`);
    leg('…it names what was asked and where it looked, and the hub\'s path as a HINT', !!thrown && Array.isArray(thrown.looked) && thrown.looked.includes(HUBD) && thrown.hubPath === HUBX && /add that directory to your shell's PATH/.test(thrown.hint || '') && /not found by your reg-shell \(login shell\)/.test(thrown.message), thrown && JSON.stringify({ looked: thrown.looked.length, hubPath: thrown.hubPath, hint: thrown.hint }));
    leg('…ONE journal line says the create is refused (cli-missing)', logs.filter((l) => /refused \(cli-missing\)/.test(l)).length === 1, logs.slice(-2).join(' | '));
    leg('…and a read says missing too (null; census missing)', (await c.check('codex', { force: true })) === null && c.census?.('codex')?.missing === true && c.census?.('codex')?.answer === 'none');
    // an alias / a function is refused BY THAT WORD; unanswered with the hub's PATH empty too is refused, saying both
    const ca = mod.createCliCmds({ ask: (n) => mod.askShell(n, { shell: FN }), log: () => {} });
    ca.register('opencode', { name: 'vsfn_cli', current: 'vsfn_cli' });
    const cn = mod.createCliCmds({ ask: (n) => mod.askShell(n, { shell: EXIT3 }), log: () => {} });
    cn.register('codex', { name: `${N2}-nowhere`, current: `${N2}-nowhere` });
    const [ta, tn] = await Promise.all([ca.forSpawn('opencode', 'vsfn_cli').then(() => null, (e) => e), cn.forSpawn('codex', `${N2}-nowhere`).then(() => null, (e) => e)]);
    leg('a shell function / alias is REFUSED by that word, with the door «make it a program on your PATH»', !!ta && ta.code === 'cli-missing' && ta.answer === 'alias' && /make it a program on your PATH/.test(ta.message), ta && ta.message);
    leg('unanswered AND the hub\'s PATH has none ⇒ refused too, saying both', !!tn && tn.code === 'cli-missing' && tn.answer === 'unanswered' && tn.why === 'exit:3' && /could not be asked \(exit:3\)/.test(tn.message), tn && tn.message);
  } finally { fs.rmSync(F('prefix'), { force: true }); fs.rmSync(F('restrict'), { force: true }); }
  if (unanswered) { for (const [n, p, d] of await unanswered) leg(n, p, d); reapSleepy(); }
  return out;
}

console.log('⑤ the login-shell rung over scratch shells');
for (const r of await rungLegs(CLI)) ok(r.name, r.pass, r.detail);
let LSmod = null; try { LSmod = require(path.join(REPO, 'src/login-shell.js')); } catch (e) { ok('THE LADDER is spelled once: src/login-shell.js loads (the dial road\'s S0 and the local ask read it)', false, e.message.split('\n')[0]); }
if (LSmod && typeof CLI.loginShellOf === 'function') {
  const LS = LSmod;
  const userShell = (() => { try { return os.userInfo().shell || ''; } catch { return ''; } })();
  let getent = ''; try { getent = execFileSync('getent', ['passwd', os.userInfo().username], { encoding: 'utf8' }).trim().split(':').pop(); } catch { }
  ok('the account rung reads the passwd record (os.userInfo().shell = `getent passwd`\'s, the record the dial road reads)', !getent || userShell === getent, `${userShell} vs ${getent}`);
  const isX = (p) => { try { fs.accessSync(p, fs.constants.X_OK); return p.startsWith('/'); } catch { return false; } };
  const onPath = (n) => { for (const d of String(process.env.PATH).split(':')) { if (d && isX(path.join(d, n))) return path.join(d, n); } return null; };
  const norm = (x) => (x === 'sh' ? '/bin/sh' : x);
  const rows = (await Promise.all([['SHELL set', NOISY], ['SHELL empty', ''], ['SHELL not executable', path.join(SHD, 'no-such-shell')]].map(async ([label, envShell]) => {
    const env = { PATH: process.env.PATH, HOME: process.env.HOME || '/tmp' };
    if (envShell) env.SHELL = envShell;
    let s0 = ''; try { s0 = execFileSync('/bin/sh', ['-c', LS.S0_SH + 'printf %s "$S0"'], { env, encoding: 'utf8' }); } catch (e) { s0 = 'ERR ' + e.message; }
    const js = LS.pickLoginShell({ envShell, accountShell: userShell, executable: isX, onPath }).shell;
    const real = await CLI.loginShellOf({ env, userInfo: () => ({ shell: userShell }) });
    return [[label, norm(s0), js], [label + ' (loginShellOf)', norm(s0), real.shell]];
  }))).flat();
  ok(`THE LADDER: the dial road's S0 (sh) and the local road (pickLoginShell / loginShellOf) agree on the same inputs (${rows.map((r) => `${r[0]}: ${r[1]}`).join('; ')})`, rows.every((r) => r[1] === r[2]), JSON.stringify(rows));
}

console.log('⑥ the registry on the real default road (SHELL = a scratch shell)');
for (const r of await registryLegs(CLI)) ok(r.name, r.pass, r.detail);

console.log('⑦ mutants of the shell rung (patched copies outside the tree, judged side by side)');
{
  const cc = read('src/server/cli-cmd.js');
  const MUT = [
    ['fail-closed removed (found nothing ⇒ spawn the old path)', '      if (p) return p;\n      const r = refusal(backend, e);', '      if (p || true) return p || cmd;\n      const r = refusal(backend, e);', (m) => registryLegs(m, { slow: false }), /FAIL CLOSED|REFUSED by that word|refused too/],
    ['sentinel parse removed (the first printed line is the answer)', '      const p = LS.parseShellAnswer(out);', "      const p = { complete: true, pathDone: true, cv: out.split('\\n').map((l) => l.trim()).filter(Boolean)[0] || '', path: null };", (m) => rungLegs(m, { groups: ['noisy'] }), /LAST pair wins|kind:none/],
    ['env unsanitized (the hub\'s process.env handed to the shell)', "env: serviceEnv(env, { keep: ['USER', 'LOGNAME'], add: { SHELL: shell, TERM: 'dumb', VIBESPACE_SHELL_PROBE: '1' } })", "env: { ...env, SHELL: shell }", (m) => rungLegs(m, { groups: ['env'] }), /SANITIZED ENV/],
    ['the bound removed (its timer ends nothing)', "    timer = setTimeout(() => done({ kind: 'unanswered', why: 'timeout' }), timeoutMs);", '    timer = setTimeout(() => { }, timeoutMs);', (m) => rungLegs(m, { groups: ['sleepy'], boundGuardMs: 100 }), /unanswered:timeout/],
  ];
  const runs = MUT.map(([label, from, to, legs]) => cc.includes(from)
    ? legs(M.load('src/server/cli-cmd.js', cc.replace(from, to), label.split(' ')[0].replace(/[^a-z]/g, ''))).then((rs) => rs.filter((r) => !r.pass).map((r) => r.name))
    : Promise.resolve(null));
  const reds = await Promise.all(runs);
  reapSleepy();
  MUT.forEach(([label, , , , want], i) => {
    if (!ok(`mutant «${label}»: its line exists in cli-cmd.js`, reds[i] !== null)) return;
    const red = reds[i];
    ok(`mutant «${label}» ⇒ RED (${red.length} red: ${red.slice(0, 2).join(' | ').slice(0, 160)})`, red.some((n) => want.test(n)), red.join(' | ').slice(0, 300));
  });
  for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 7 })) ok(r.name, r.pass, r.detail); // ④'s 3 + ⑦'s 4
}

console.log(`\n${fail ? fail + ' FAILED (' + pass + ' passed)' : 'ALL PASS (' + pass + ')'}`);
process.exit(fail ? 1 : 0);
