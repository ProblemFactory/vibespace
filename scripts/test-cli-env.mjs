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
//   ⑥b THE HARNESS FILTER'S FACT (B-544d: /api/home `cli`, the Settings window's `when: { harness }`): the login shell's
//      verdict once asked (no program ⇒ absent, though the boot path is absolute), the boot fact before; a read never asks;
// real-cli-env: NO agent CLI runs here — `command -v codex` above is prose; every shell is a scratch sh script, every CLI a
// scratch `exit 0` file, and the vendor keys planted in ⑤ exist to prove the shell ask strips them.
//   ⑦ MUTANTS: fail-closed removed ⇒ the refusal legs RED; the sentinel parse removed ⇒ the banner becomes the answer
//      (RED); the env unsanitized ⇒ the token leg RED; the bound removed ⇒ the timeout leg RED; the filter reading the
//      boot path only (the shell's verdict ignored, B-544d) ⇒ ⑥b's after-none leg RED.
//   ⑪ (batch 63 cure) THE VIBESPACE TOOLS STAY FIRST: after the spawn's real prelude the program line of a CLI installed beside
//     the real browser driver reaches the SHIM (RED: the CLI's directory first); ONE PRELUDE FOR THE ASK AND THE SPAWN: the
//     ask's fallback rung is the spawn's own composition (RED: the base prelude only — a create the spawn would run is refused);
//     a look that never said VS_X_ASKED could not look.
//   ⑪ THE REMOTE TWIN (B-69ec): a paired machine's OWN login shell says where its CLI is — PARITY: the remote ask (src/login-shell.js
//      remoteAskScript run under sh, as a machine runs it) over ⑧'s planted homes in REAL zsh + REAL bash reaches the SAME program
//      or the same refusal as the local road; the module (src/server/remote-cli.js) over a stubbed remote exec: path ⇒ that
//      program (kept), none ⇒ refused by name (the machine and its shell), unanswered ⇒ the prelude's name (kept, named once);
//      wiring pins (ws-create's two remote branches, both ladders, the host status census); the words; MUTANT the answer
//      ignored ⇒ the parity and path legs RED.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, execFile, spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, anchored } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } return !!c; };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(`ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`, false); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}

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
// a login shell with no POSIX `command` builtin (tcsh / csh / xonsh): `command` answers an error on stderr, nothing on stdout
const NOCMD = mkShell('nocmd-shell', RUN_C("command() { echo 'command: Command not found.' >&2; return 127; }; "));
const ZSH = ['/usr/bin/zsh', '/bin/zsh'].find((p) => fs.existsSync(p)) || null;
const ZALIAS = ZSH ? mkShell('zalias-shell', `while [ $# -gt 0 ]; do case "$1" in -c) shift; exec ${ZSH} -f -c "alias vs-al-cli=ls; $1";; *) shift;; esac; done`) : null;
const asks = () => { try { return fs.readFileSync(F('asks.log'), 'utf8').split('\n').filter(Boolean).length; } catch { return 0; } };
const alive = (pid) => { if (!(pid > 1)) return false; try { const st = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'); return !/^\d+ \(.*\) Z /.test(st); } catch { return false; } };
const readPid = (n) => { try { return Number(fs.readFileSync(F(n), 'utf8').trim()) || 0; } catch { return 0; } };
// THE DEATH, MEASURED (主开发 2026-11-20 08:58Z — the .413 cut's box-zone red: «…the shell AND its rc's leftover child are dead» judged
// through ~1 s of 5 ms looks (the deadSoon it replaces), at load 5–6, and both were dead a moment later): the WALL CLOCK bounds the wait
// (DEATH_MS), and
// the answer is how many ms after `t0` the process was gone (a zombie counts gone) — null = still alive at the bound
const DEATH_MS = 5000;
// r1649 (the load row — B-1217's class; seen red at 4861f5e5c-20261121204803-both, the box zone, machine 1: «child … ALIVE 5000 ms
// after the bound answered», the shell dead at 0 ms): a SIGKILLed task dies when the kernel next RUNS it, and on a loaded test
// machine a task in uninterruptible sleep can stay past any bound with the kill already delivered. The PRODUCT's act is the
// kill (the shell, then its session's group); the kernel's scheduling is not. So a death is judged GONE, or SIGKILL PENDING (its
// /proc status holds signal 9 in SigPnd or ShdPnd: the kill reached it), waited for under the same bound; a task that is neither
// is said with its state, its process group and its session — a group other than the probe's own is the product's fault, named
const KILL_BIT = 1n << 8n;   // signal 9 (SIGKILL) in a /proc pending mask
const killPending = (pid) => { try { const st = fs.readFileSync(`/proc/${pid}/status`, 'utf8'); return ['SigPnd', 'ShdPnd'].some((k) => { const m = st.match(new RegExp('^' + k + ':\\s*([0-9a-f]+)', 'm')); return !!m && (BigInt('0x' + m[1]) & KILL_BIT) !== 0n; }); } catch { return false; } };
const taskFacts = (pid) => { try { const st = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'); const f = st.slice(st.lastIndexOf(')') + 2).split(' '); return { state: f[0], pgrp: Number(f[2]), session: Number(f[3]), killPending: killPending(pid) }; } catch { return { state: 'gone' }; } };
const KILLED_NOT_RUN = new Set();   // the pids whose wait ended on a pending SIGKILL (the kill delivered, the kernel had not run them yet)
// r5613 (主开发 2026-11-28 — the fourth candidate's once-red at LOW load, machine 1's box zone: «child … ALIVE 5000 ms after the bound
// answered … (state gone …)»: not gone and no SIGKILL pending through the whole wait, GONE a moment later): THE WAIT SAYS ITS OWN LOOKS.
// Each look of a pid's wait is kept (the first twenty, then the last): ms after the bound's answer, the task's state, whether the
// kernel marks it EXITING (PF_EXITING, 0x4 in /proc/<pid>/stat's flags: the task took a fatal signal and is on its exit path — a
// state the old words read as «never signalled»), a pending SIGKILL, its process group and session — said at a red, the verdict
// and the bound unchanged
const PF_EXITING = 0x4;
const lookAt = (pid, t0) => { try { const st = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'); const f = st.slice(st.lastIndexOf(')') + 2).split(' '); const fl = Number(f[6]); return `+${Date.now() - t0} ${f[0]}${(fl & PF_EXITING) ? ' EXITING' : ''}${killPending(pid) ? ' KILL-PENDING' : ''} pg ${f[2]} sid ${f[3]}`; } catch { return `+${Date.now() - t0} gone`; } };
const LOOKS = new Map();   // pid → { first: [the first twenty looks], last, n }
const looksOf = (pid) => { const l = LOOKS.get(pid); return l ? `${l.n} looks; the first ${l.first.length}: ${l.first.join(' · ')}${l.n > l.first.length ? ` … the last: ${l.last}` : ''}` : 'no looks'; };
const diedWithin = async (pid, t0, bound = DEATH_MS) => {
  if (!(pid > 1)) return null;
  const ended = () => !alive(pid) || killPending(pid);
  const L = { first: [], last: '', n: 0 }; LOOKS.set(pid, L);
  const look = () => { const x = lookAt(pid, t0); L.n++; L.last = x; if (L.first.length < 20) L.first.push(x); };
  look();
  while (!ended() && Date.now() - t0 < bound) { await new Promise((r) => setTimeout(r, 10)); look(); }
  if (!ended()) return null;
  if (alive(pid)) KILLED_NOT_RUN.add(pid);
  return Date.now() - t0;
};
// a try's leftovers BY ITS OWN GROUP (the read: a try whose child pid was never written left its `sleep 60` to outlive the suite): every
// process whose process group is that try's sleepy shell — its pid read from the file the try's own shell just wrote — AND whose command
// line is the sleepy rc's (its script, or `sleep 60`): /proc evidence, never a name alone
const reapGroup = (pg) => { if (!(pg > 1)) return; for (const d of fs.readdirSync('/proc')) { if (!/^\d+$/.test(d)) continue; try { const st = fs.readFileSync(`/proc/${d}/stat`, 'utf8'); if (Number(st.slice(st.lastIndexOf(')') + 2).split(' ')[2]) !== pg) continue; const cmd = fs.readFileSync(`/proc/${d}/cmdline`, 'utf8'); if (cmd.includes(SLEEPY) || cmd.startsWith('sleep\u000060')) process.kill(Number(d), 'SIGKILL'); } catch { } } };
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
    const r3 = await c.check('antigravity', { reask: true });
    leg('a PERSON\'S read (reask: Install / Re-check) looks now and says INSTALLED at the scratch path', r3 === EXE && calls.lookups === 2, `r=${r3} lookups=${calls.lookups}`);
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
    const r8 = await c.check('antigravity', { reask: true });
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
    const rs = await Promise.all([1, 2, 3].map(() => c.check('antigravity', { reask: true })));
    leg('three person\'s reads in flight share ONE lookup (single-flight with forSpawn\'s)', rs.every((r) => r === null) && calls.lookups === 1, `lookups=${calls.lookups}`);
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

const CLI = require(path.join(REPO, 'src/server/cli-cmd.js'));
// ⑧'s real shells (round 2) start HERE — independent of every other leg, so their wall time hides behind ①–⑦
const REAL8 = await (async () => {
  // planted homes (never the owner's rc): .zshenv skip_global_compinit=1 (a person's own switch — the real road, -l -i,
  // without Ubuntu's global compinit), the shape in .zshrc / .bash_profile. ROUND 5 (final): the shell says WHERE the
  // program is; the spawn is ALWAYS that program (each shape: the REAL registry's answer, then SPAWNED directly — its
  // marker says which program ran). One narrow wrapper rule: the installer's one-word absolute alias.
  const RN = `vsreal${process.pid}`, RB = path.join(DIR, 'realbin'), MK = path.join(DIR, 'markers');
  for (const d of [RB, MK]) fs.mkdirSync(d, { recursive: true });
  const fake = (file, tag) => fs.writeFileSync(file, `#!/bin/sh\nprintf '{"tag":"${tag}","args":"%s"}\\n' "$*" >> "$VS_MARK"\nexit 0\n`, { mode: 0o755 });
  const PROG = path.join(RB, RN); fake(PROG, 'path-program');
  fake(path.join(RB, 'fakenpx'), 'npx');
  const home = (shape, rc, { target = 'none', reset = false, rcPath = true } = {}) => {
    const h = path.join(DIR, 'homes', shape); fs.mkdirSync(h, { recursive: true });
    fs.writeFileSync(path.join(h, '.zshenv'), 'skip_global_compinit=1\n');
    // B-7f97 (lane bl-tests-e): the program's folder reaches the shell as a PERSON's does — the person's rc puts it on PATH. A login
    // bash on Debian sources /etc/profile, which RESETS PATH (the second test machine: every «on PATH» shape read «bash refused»);
    // the inherited PATH alone judged the machine's profile, not the product. The rc line reads its folder from ~/.vs-on-path
    // (planted once for an «on PATH» shape, before any ask — see below): the shell is asked under serviceEnv's ALLOWLIST (src/server/cli-cmd.js),
    // which keeps HOME and drops any other name. `reset` = a profile that resets PATH before the rc (Debian's /etc/profile);
    // `rcPath: false` = no such rc line (the leg as it was — the CONTROL shape). ~/.profile carries the same head (the checkpoint's
    // meeting with B-69ec ⑪, 2026-11-18): the remote twin's fallback rung asks a LOGIN sh (src/server/remote-cli.js `sh -lc`, the
    // spawn's own road), which reads /etc/profile and ~/.profile — Debian's profile resets PATH for that shell too, so the planted
    // reset is in ~/.profile as well and the remote road judges the same home on every machine (else a machine whose /etc/profile
    // keeps PATH lets the fallback reach the program the person's shell no longer holds — the fallback rung's own law, pinned by
    // ⑪'s «THE FALLBACK RUNG» leg (the module's law, on every machine) and the batch 63 cure's «a CLI only ~/.profile puts on
    // PATH» leg (a real login sh, judged where the machine allows))
    const head = (reset ? 'PATH=/usr/bin:/bin\n' : '') + (rcPath ? '[ -r "$HOME/.vs-on-path" ] && PATH="$(cat "$HOME/.vs-on-path"):$PATH" && export PATH\n' : '');
    for (const f of ['.zshrc', '.bash_profile']) fs.writeFileSync(path.join(h, f), head + rc + '\n');
    fs.writeFileSync(path.join(h, '.profile'), head);   // the login sh's own profile: the reset and the rc line, never the person's aliases
    if (target !== 'none') { fs.mkdirSync(path.join(h, '.local-cli'), { recursive: true }); if (target === 'exec') fake(path.join(h, '.local-cli', RN), 'alias-target'); else fs.writeFileSync(path.join(h, '.local-cli', RN), 'not a program\n', { mode: 0o644 }); }
    return h;
  };
  const SHELLS = [['zsh', ['/usr/bin/zsh', '/bin/zsh'].find((p) => fs.existsSync(p))], ['bash', ['/bin/bash', '/usr/bin/bash'].find((p) => fs.existsSync(p))]].filter(([, p]) => p);
  // envOf WRITES NOTHING (主开发 r205): a planted home is never changed while any shell can read it — ~/.vs-on-path is planted once,
  // below, before any ask of any run set starts
  const envOf = (h, onPath) => ({ HOME: h, PATH: `${onPath ? RB + ':' : ''}/usr/bin:/bin`, USER: process.env.USER || 'u', LOGNAME: process.env.LOGNAME || 'u', LANG: 'C.UTF-8' });
  const INST = `alias ${RN}="~/.local-cli/${RN}"`;
  // [label, home, PATH has the program dir, the want: { target | prog | refused: 'wrapper' | 'missing' | 'not-executable' | 'none' }]
  const SHAPES = [
    ['the installer alias (alias x="~/.local-cli/x"), no program on PATH ⇒ its target', home('inst', INST, { target: 'exec' }), false, { target: true }],
    ['the installer alias AND a stale program on PATH ⇒ its target (the person\'s shell would run it)', home('inst-stale', INST, { target: 'exec' }), true, { target: true }],
    ['a flags alias (alias x=\'x --yolo\') over a PATH program ⇒ the PATH program, the alias NAMED', home('flags', `alias ${RN}='${RN} --yolo'`), true, { prog: 'alias' }],
    ['an npx alias (alias x=\'fakenpx -y @scope/pkg\') over a PATH program ⇒ the PATH program, the alias NAMED (npx is never run)', home('npx', `alias ${RN}='fakenpx -y @scope/pkg@latest'`), true, { prog: 'alias' }],
    ['an npx alias with NO program on PATH ⇒ refused, the alias named, the two doors', home('npx-none', `alias ${RN}='fakenpx -y @scope/pkg@latest'`), false, { refused: 'wrapper', kind: 'alias' }],
    ['a FUNCTION over a PATH program ⇒ the PATH program, the function NAMED', home('fn', `${RN}() { VSX=1 command ${RN} "$@"; }`), true, { prog: 'function' }],
    ['a FUNCTION with NO program on PATH ⇒ refused, the function named, the two doors', home('fn-none', `${RN}() { echo hi; }`), false, { refused: 'wrapper', kind: 'function' }],
    ['the DANGLING installer alias (its target missing) ⇒ refused by its cause', home('dangle', INST), false, { refused: 'missing' }],
    ['the installer alias naming a file that is NOT executable ⇒ refused by its cause', home('noexec', INST, { target: 'noexec' }), false, { refused: 'not-executable' }],
    ['r3 C: the person aliases the lookup words (alias type=\'type -a\', whence, command, unalias), no program ⇒ none — never «could not be asked»', home('builtin-alias', "alias type='type -a'\nalias whence='whence -a'\nalias command='command -p'\nalias unalias='echo'"), false, { refused: 'none' }],
    ['a plain program, no wrapper ⇒ that program', home('plain', ''), true, { prog: null }],
    ['B-7f97: a plain program on PATH under a profile that RESETS PATH first (Debian\'s /etc/profile in a login bash) ⇒ that program — the person\'s rc line puts its folder back', home('reset', '', { reset: true }), true, { prog: null }],
    ['B-7f97 CONTROL: the same reset with NO rc line (the leg as it was: the inherited PATH alone) ⇒ refused, none — the machine\'s profile decided it (red)', home('reset-as-was', '', { reset: true, rcPath: false }), true, { refused: 'none' }],
  ];
  // THE LAW (主开发 r205): every file a planted shell sources or reads is written WHOLE, ONCE, when its home is planted — here, before
  // any ask of any run set starts. B-7f97's folder (the one the person's rc line puts on PATH: ~/.vs-on-path, read back with `cat`)
  // was rewritten by envOf at EVERY call: the three run sets are built in one synchronous chain with some 78 shells already started,
  // so a shell's `cat` could land between a later call's truncate and its write, read an empty file and hold no program (the leg's
  // flake — always this home, the only shape whose answer hangs on that file's content)
  // Then EVERY file a planted shell sources or reads is made read-only and kept as planted (its text and mtime): a later write by
  // this suite fails BY NAME (EACCES), and a write that got through (a root runner) is seen by the leg below
  for (const [, h, onPath] of SHAPES) if (onPath) fs.writeFileSync(path.join(h, '.vs-on-path'), RB);
  const HOME_FILES = ['.zshenv', '.zshrc', '.bash_profile', '.profile', '.vs-on-path', path.join('.local-cli', RN)];
  const plantOne = (f) => { fs.chmodSync(f, fs.statSync(f).mode & 0o555); return { f, text: fs.readFileSync(f, 'utf8'), mtimeMs: fs.statSync(f).mtimeMs }; };
  const planted = SHAPES.flatMap(([, h]) => HOME_FILES.map((n) => path.join(h, n)).filter((f) => fs.existsSync(f)).map(plantOne));
  const plantedChanged = (list = planted) => list.filter((x) => { try { return fs.readFileSync(x.f, 'utf8') !== x.text || fs.statSync(x.f).mtimeMs !== x.mtimeMs; } catch { return true; } }).map((x) => x.f);
  const runCli = (cmd, mark) => new Promise((res) => {
    const c = spawn(cmd, ['--stream', 'a b'], { env: { PATH: '/usr/bin:/bin', VS_MARK: mark }, stdio: 'ignore' });
    c.on('error', (e) => res({ err: e.message })); c.on('close', (code) => res({ code }));
  });
  const runs = Promise.all(SHAPES.flatMap(([label, h, onPath, want], si) => SHELLS.map(async ([sn, sp]) => {
    const reg = CLI.createCliCmds({ ask: (n) => CLI.askShell(n, { shell: sp, env: envOf(h, onPath) }), log: () => {} });
    reg.register('claude', { name: RN, current: RN });
    const got = await reg.forSpawn('claude', RN).then((c) => ({ cmd: c }), (e) => ({ err: e }));
    const cs = reg.census?.('claude');
    let marks = [];
    if (got.cmd) {
      const mark = path.join(MK, `${si}-${sn}.jsonl`);
      await runCli(got.cmd, mark);
      try { marks = fs.readFileSync(mark, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { }
    }
    return { label, sn, sp, h, want, got, cs, marks };
  })));
  return { RN, RB, PROG, SHAPES, SHELLS, envOf, runs, planted, plantedChanged, plantOne };
})();
// B-69ec ⑪: the remote twin's runs, started here beside ⑧ (the same planted homes, the machine's road: `sh -c <the script>`)
const REM11 = (() => {
  let RC = null, LSM = null;
  try { RC = require(path.join(REPO, 'src/server/remote-cli.js')); LSM = require(path.join(REPO, 'src/login-shell.js')); } catch { RC = null; }
  if (!RC || !LSM || typeof LSM.remoteAskScript !== 'function') return null;
  const shOf = (env, outer = '/bin/sh') => (h, script) => new Promise((res, rej) => execFile(outer, ['-c', script], { env, encoding: 'utf8', timeout: 10000 }, (err, out) => (err && !out ? rej(err) : res(String(out || '')))));
  const runsOf = (mod, outerOf = () => '/bin/sh') => Promise.all(REAL8.SHAPES.flatMap(([label, h, onPath]) => REAL8.SHELLS.map(async ([sn, sp]) => {
    const rc = mod.createRemoteCli({ hostShell: shOf({ ...REAL8.envOf(h, onPath), SHELL: sp }, outerOf(sp)), log: () => { } });
    const got = await rc.forSpawn({ id: 'dev-11', name: 'DEV-11' }, 'claude', REAL8.RN).then((c) => ({ cmd: c }), (e) => ({ err: e }));
    // the run's OWN facts (主开发 r205): the reply's kind, the prelude, why — printed by the parity leg green or red, so a red names
    // its branch (an empty read of the home and a timed-out ask read alike from the outside)
    let f = null; try { f = (rc.census('dev-11') || {}).claude || null; } catch { f = null; }
    return { label, sn, got, facts: f ? { kind: f.answer, prelude: f.prelude || null, why: f.why || null } : null };
  })));
  const zsh = (REAL8.SHELLS.find(([n]) => n === 'zsh') || [])[1] || null;
  return { RC, LSM, runsOf, runs: runsOf(RC), zshRuns: zsh ? runsOf(RC, () => zsh) : Promise.resolve([]), zsh };
})();

// ⑨'s version-gate leg (round 2) starts with the early batch too
const GATE9 = (async () => {
  const VB = path.join(DIR, 'versions'), HUBV = path.join(VB, 'hub'), SHV = path.join(VB, 'shell');
  for (const d of [HUBV, SHV]) fs.mkdirSync(d, { recursive: true });
  const fake = (d, v) => { const p = path.join(d, 'claude'); fs.writeFileSync(p, `#!/bin/sh\n[ "$1" = --version ] && echo "${v} (Claude Code)"\nexit 0\n`, { mode: 0o755 }); return p; };
  const HUBC = fake(HUBV, '2.1.281'), SHC = fake(SHV, '2.1.300');
  const reg = CLI.createCliCmds({ ask: async () => ({ kind: 'path', path: SHC, via: 'program', wrapper: null, shell: REGSH, shellPath: `${SHV}:/usr/bin:/bin` }), log: () => {} });
  reg.register('claude', { name: 'claude', current: HUBC });
  const gate = [], told = [];
  const accounts = { noteCliVersion: (v) => { gate.push(v); return { cli: v, ok: true, changed: false }; }, oatFileCaps: () => ({ cli: null, ok: false }), syncOatFiles: async () => { }, oatFileSettled: async () => { } };
  const OFS = require(path.join(REPO, 'src/server/oat-file-sync.js'));
  const MP = require(path.join(REPO, 'src/machine-probes.js'));
  // B-ec25: under VS_NO_REAL_CLI=1 machine-probes starts only THE stand-in CLAUDE_CMD names — each fake here IS this leg's
  // stand-in, named for its own --version read (the real machine-probes reads it; nothing else reads CLAUDE_CMD at run time)
  const MPS = { ...MP, cliVersion: async (cmd, o) => { const was = process.env.CLAUDE_CMD; process.env.CLAUDE_CMD = cmd; try { return await MP.cliVersion(cmd, o); } finally { if (was === undefined) delete process.env.CLAUDE_CMD; else process.env.CLAUDE_CMD = was; } } };
  const sync = OFS.start({ accounts, machineProbes: MPS, claudeCmd: () => reg.current('claude'), onCliVersion: (v) => told.push(v), log: () => { }, bootDelayMs: 1e9, recheckMs: 1e9 });
  let adoptTick = null;
  if (typeof reg.onAdopt === 'function') reg.onAdopt((b) => { if (b === 'claude') adoptTick = sync.tick(); });
  await sync.tick();
  const before = gate[gate.length - 1];
  const spawned = await reg.forSpawn('claude', HUBC).catch(() => null);
  if (adoptTick) await adoptTick;
  sync.stop();
  return { spawned, before, gate, told, SHC };
})();

console.log('① cliCmds.check over the real resolver and a scratch PATH dir');
for (const r of await helperLegs(CLI)) ok(r.name, r.pass, r.detail);

console.log('② the real /api/backend-status handler');
const ROUTE = require(path.join(REPO, 'src/server/backend-status-route.js'));
for (const r of await routeLegs(ROUTE, CLI)) ok(r.name, r.pass, r.detail);

console.log('③ wiring');
{
  const cc = read('src/server/cli-cmd.js'), rt = read('src/server/backend-status-route.js'), ce = read('src/server/cli-env.js'), ma = read('src/lib/manage-agents.js');
  ok('the route checks EVERY registered CLI at each read, forced only by `?recheck=1`', /const force = String\(req\.query\?\.recheck \|\| ''\) === '1';/.test(rt) && /cliCmds\.ids\(\)\.map\(async \(id\) => \{ live\[id\] = await cliCmds\.check\(id, \{ reask: force \}\); \}\)/.test(rt));
  ok('…and hands a descriptor\'s machineStatus the CHECKED path (never the boot answer)', /machineStatus\(\{ cmd: cmdOf\(h\.id\) \}\)/.test(rt) && !/machineStatus\(\{ cmd: cliCmds\?\.current/.test(rt));
  ok('forSpawn and check share ONE single-flight lookup (`lookup`: one shell ask, one hub walk)', (cc.match(/await lookup\(backend, e\)/g) || []).length === 1 && (cc.match(/return lookup\(backend, e\)/g) || []).length >= 1 && (cc.match(/await askOf\(e\.name\)/g) || []).length === 1 && (cc.match(/await resolve\(e\.name\)/g) || []).length === 1);
  ok('nothing checks on a timer (no setInterval, no setTimeout: since B-323e\'s remainder the shell ask\'s bound is the STARTER\'s — its run asked with the ask\'s timeoutMs, which ENDS an ask, never starts one; the route is the only caller of check)', !/setInterval/.test(cc) && (cc.match(/setTimeout\(/g) || []).length === 0 && /const req = \{ timeoutMs, capture: true, maxBuffer: 4 \* 1024 \* 1024, wholeEnv: true,/.test(cc) && (rt.match(/cliCmds\.check\(/g) || []).length === 1);
  ok('B-544d: /api/home\'s harness filter (`cli`) reads THE ONE fact (cliCmds.resolvedHere — the shell\'s verdict, never an ask), not the boot path / ACP_COMMANDS', /row\.cli = cliCmds\.resolvedHere\(h\.id, \{ unaskedBare: !!\(h\.acp \|\| h\.exe\) \}\);/.test(ce) && /installed: \(h\.acp \|\| h\.exe\) \? !!ACP_COMMANDS\[h\.id\] && !\(cliCmds\.census\(h\.id\) \|\| \{\}\)\.missing : true/.test(ce) && !/row\.cli = \(h\.acp \|\| h\.exe\) \? !!ACP_COMMANDS/.test(ce) && /const missing = missingOf\(e\);/.test(cc));
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
  // the refusal's branches, as a chain: a cli-missing refusal opens the DIALOG; a mount that is down (named) is its toast with its
  // door (B-ce65's smalls, «Show in Remote»); every other refusal is its toast — each branch named, none optional; read over the
  // source with its whole-line comments taken out (a comment between two branches is no branch)
  const slCode = sl.replace(/^[ \t]*\/\/[^\n]*\n/gm, '');
  ok('the client draws a cli-missing refusal as a DIALOG (never a toast alone), a mount that is down (named) as its toast with its door, every other refusal as its toast; the failed-RESUME rescue stays', /if \(msg\.code === 'cli-missing'\) \{ try \{ openCliMissingDialog\(this, msg\); \} catch \{ showToast\(text, \{ type: 'error' \}\); \} \}\n\s*else if \(msg\.code === 'mount_down' && msg\.waitsFor && !msg\.held\) showToast\(text, \{ type: 'error', action: \{ label: t\('Show in Remote'\), run: \(\) => this\._openMountsAt\(msg\.waitsFor\) \} \}\);\n\s*else showToast\(text, \{ type: 'error' \}\);/.test(slCode) && /const rescueViewOnly = \(\) => \{/.test(sl));
  ok('the route overlays the census on every registered CLI and says a shell-missing CLI is not installed', /const c = cliCmds\.census\(id\);/.test(rt) && /if \(missing && live\[id\] == null\) \{ out\[id\]\.installed = false; out\[id\]\.cmdPath = null; out\[id\]\.version = null; \}/.test(rt));
  ok('Manage agents: the census line under the version chip (this machine\'s census; a paired machine\'s row its OWN shell\'s answer — B-69ec; textContent) and Re-check on an installed row', /const where = !selectedHost \? cliWhereWords\(info\) : remoteCliWhereWords\(st\.cliWhere && st\.cliWhere\[b\.key\], hostLabel\);/.test(ma) && /el\.textContent = where\.text;/.test(ma) && /if \(!selectedHost && \(!info\.installed && b\.installCmd \|\| info\.answer\)\) \{/.test(ma));
  ok('the shell ask is ONE row of the spawn-env census (held to serviceEnv, its env named — since B-323e\'s remainder a WHOLE_ROWS row: its whole env handed to the starter)', /\['src\/server\/cli-cmd\.js', 'runShell', 1, "B-323e's remainder \(lane bl-chat-b, 主开发 r2689 \(a\)\): the person's LOGIN SHELL asked where an agent CLI is/.test(census) && (cc.match(/env: serviceEnv\(env, \{ keep: \['USER', 'LOGNAME'\], add: \{ SHELL: shell, TERM: 'dumb', VIBESPACE_SHELL_PROBE: '1' \} \}\)/g) || []).length === 1);
}

console.log('④ negative controls (patched copies outside the tree)');
const M = mutantCopies('cli-env', REPO); // ONE copy set for ④ and ⑦ — its tree-litter census (a `git status`) runs once, at ⑦'s end
{
  const ccSrc = read('src/server/cli-cmd.js'), rtSrc = read('src/server/backend-status-route.js');
  const BOUND = '        if (!force && now() - e.lookedAt < recheckMs) return null;\n';
  ok('control unbounded: the bound line exists in cli-cmd.js', ccSrc.includes(BOUND));
  const unbounded = M.load('src/server/cli-cmd.js', editAnchor(ccSrc, BOUND, '', "src/server/cli-cmd.js"), 'unbounded');
  const redU = (await helperLegs(unbounded)).filter((r) => !r.pass).map((r) => r.name);
  ok(`control unbounded (a lookup on EVERY read): THE BOUND leg is RED by call count (${redU.length} red)`, redU.some((n) => /^THE BOUND/.test(n)), redU.join(' | ').slice(0, 300));
  const PRE = [
    ["      try { await Promise.all(cliCmds.ids().map(async (id) => { live[id] = await cliCmds.check(id, { reask: force }); })); } catch { } // ?recheck=1 = a PERSON's press: the shell asked now\n", ''],
    ['machineStatus({ cmd: cmdOf(h.id) })', 'machineStatus({ cmd: cliCmds?.current?.(h.id) ?? null })'],
  ];
  ok('control pre-fix: the patched lines exist in the route', PRE.every(([a]) => rtSrc.includes(a)));
  const preRoute = M.load('src/server/backend-status-route.js', PRE.reduce((s, [a, b]) => editAnchor(s, a, b, "src/server/backend-status-route.js"), rtSrc), 'pre-fix');
  const redP = (await routeLegs(preRoute, CLI)).filter((r) => !r.pass).map((r) => r.name);
  ok(`control pre-fix (the boot answer, no check — the owner's card): the "appears" leg is RED (${redP.length} red)`, redP.some((n) => /says INSTALLED/.test(n)), redP.join(' | ').slice(0, 300));
  const staleRoute = M.load('src/server/backend-status-route.js', editAnchor(rtSrc, 'machineStatus({ cmd: cmdOf(h.id) })', 'machineStatus({ cmd: cliCmds?.current?.(h.id) ?? null })', "src/server/backend-status-route.js"), 'current-not-checked');
  const redS = (await routeLegs(staleRoute, CLI)).filter((r) => !r.pass).map((r) => r.name);
  ok(`control current-not-checked (a check runs, the row reads the registry): the uninstall leg is RED (${redS.length} red)`, redS.some((n) => /removed/.test(n)), redS.join(' | ').slice(0, 300));
}


/** ⑤ THE SHELL RUNG — rows over a module (the real one or a mutant copy). The groups touch disjoint scratch state (each its
 *  own shell and files), so they run SIDE BY SIDE; rows come back in a fixed order. */
async function rungLegs(mod, { groups = ['noisy', 'kinds', 'env', 'sleepy'], boundGuardMs = 0, printDeaths = false, deathMs = DEATH_MS } = {}) {
  if (typeof mod.askShell !== 'function') return [{ name: 'THE SHELL RUNG exists: cli-cmd.js exports askShell (the person\'s login shell asked where a CLI is)', pass: false, detail: 'no askShell' }];
  const S = require(path.join(REPO, 'src/login-shell.js'));
  const G = {
    async noisy(leg) {
      install();
      const a = await mod.askShell(NAME, { shell: NOISY });
      leg('a scratch login shell with a noisy rc (a 3-line banner + a DECOY sentinel triple first) answers kind:path at the real executable — the LAST pair wins', a.kind === 'path' && a.path === EXE, JSON.stringify(a));
      leg('…its exported PATH rides the answer (shellPath, printenv\'s colon form)', typeof a.shellPath === 'string' && a.shellPath.split(':').includes(BIN), String(a.shellPath).slice(0, 120));
      let argv = []; try { argv = fs.readFileSync(F('argv.log'), 'utf8').split('|'); } catch { }
      leg('…asked as `-l -i -c <line>` (the three flags spelled apart) with the line the law names', argv[0] === '-l' && argv[1] === '-i' && argv[2] === '-c' && argv[3] === S.shellLine(NAME, NOISY), argv.slice(0, 3).join(' '));
      uninstall();
      const b = await mod.askShell(NAME, { shell: NOISY });
      leg('the CLI absent: kind:none (the shell answered, nothing between the sentinels — the decoy path did not count)', b.kind === 'none', JSON.stringify(b));
    },
    async kinds(leg) {
      const [a, z, e3, en, e0, nc] = await Promise.all([
        mod.askShell('vsfn_cli', { shell: FN }), ZALIAS ? mod.askShell('vs-al-cli', { shell: ZALIAS }) : null,
        mod.askShell(NAME, { shell: EXIT3 }), mod.askShell(NAME, { shell: path.join(SHD, 'no-such-shell') }), mod.askShell(NAME, { shell: '' }),
        mod.askShell(NAME, { shell: NOCMD })]);
      leg('a shell FUNCTION with no program behind it: kind:none, the function NAMED (never run, never read)', a.kind === 'none' && a.wrapper && a.wrapper.kind === 'function' && a.wrapper.text === 'vsfn_cli', JSON.stringify(a));
      if (z) leg('a zsh ALIAS whose body is no absolute path (alias x=ls), no program: kind:none, the alias NAMED — never followed', z.kind === 'none' && z.wrapper && z.wrapper.kind === 'alias' && /alias/.test(z.wrapper.text || '') && !('followed' in z), JSON.stringify(z));
      leg('D: a shell WITHOUT the `command` builtin (both sentinel pairs, nothing between, the control word unnamed) ⇒ unanswered:no-command-builtin — never «none»', nc.kind === 'unanswered' && nc.why === 'no-command-builtin', JSON.stringify(nc));
      leg('the shell could not be asked: an rc that exits 3 ⇒ unanswered exit:3; a missing shell ⇒ spawn:ENOENT; none ⇒ no-shell', e3.kind === 'unanswered' && e3.why === 'exit:3' && en.kind === 'unanswered' && en.why === 'spawn:ENOENT' && e0.kind === 'unanswered' && e0.why === 'no-shell', JSON.stringify([e3.why, en.why, e0.why]));
    },
    async env(leg) {
      // the planted values are BUILT (a token shape never sits in the source — the secret scan's rule)
      const mk = (...p) => p.join('-');
      // (B-323e's remainder: the shell is now asked through the hub's starter, whose own belt drops the hub's prefixes — VIBESPACE_, CLAUDE_,
      // ANTHROPIC_, NPM_ … — from any whole env; GITHUB_TOKEN carries none of them, so only the ask's own allowlist keeps it out: ⑦'s mutant still bites)
      const planted = { VIBESPACE_SESSION_TOKEN: mk('vs', 'planted', 'session'), CLAUDE_CODE_OAUTH_TOKEN: mk('sk', 'ant', 'oat01', 'planted'), VIBESPACE_API: 'http://127.0.0.1:9/planted', npm_config_planted: mk('npm', 'planted', 'value'), ANTHROPIC_API_KEY: mk('sk', 'ant', 'api', 'planted'), GITHUB_TOKEN: mk('gh', 'planted', 'token') };
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
      // 40 ms, then 320 ms on a box too loaded for the shell to have written its pids inside the first bound
      for (const bound of [40, 320]) {
        fs.rmSync(F('sleepy.pid'), { force: true }); fs.rmSync(F('sleepy-child.pid'), { force: true });
        let ticks = 0; const tick = setInterval(() => { ticks++; }, 5);
        const guard = new Promise((res) => setTimeout(() => res({ kind: 'GUARD', why: `no answer by the guard` }), boundGuardMs || bound * 3));
        const a = await Promise.race([mod.askShell(NAME, { shell: SLEEPY, timeoutMs: bound }), guard]);
        clearInterval(tick);
        r = { a, ticks, at: Date.now() };   // the bound's answer: the product killed both just before it resolved
        if (a.kind === 'GUARD' || (readPid('sleepy.pid') > 1 && readPid('sleepy-child.pid') > 1)) break;
        reapGroup(readPid('sleepy.pid'));   // a try that wrote no child pid is retried: what it started goes first (its group, just written)
      }
      const { a, ticks, at } = r;
      leg(`an rc that never returns (sleep 60): unanswered:timeout — ended by the bound, not the guard; the hub's loop ran meanwhile (${ticks} ticks)`, a.kind === 'unanswered' && a.why === 'timeout' && ticks >= 1, JSON.stringify(a));
      const sp = readPid('sleepy.pid'), sc = readPid('sleepy-child.pid');
      // the product SIGKILLs the shell AND the probe's own session at the bound (B-323e's remainder: the hub's starter does it — its session
      // option: the shell started detached, its own group, then child.kill + process.kill(-pid, 'SIGKILL') by the starter's own handle); it promises no time: a killed task dies when the
      // kernel next runs it, on a loaded box later than deadSoon's ~1 s. Each death is WAITED for on the wall clock (DEATH_MS, both at
      // once) and its time is the leg's own fact; a process the product never signalled stays alive past the bound: red (⑦'s mutant)
      const [dS, dC] = a.kind !== 'GUARD' ? await Promise.all([diedWithin(sp, at, deathMs), diedWithin(sc, at, deathMs)]) : [null, null]; // the guard ended it ⇒ nobody killed them: red, reaped below
      const dead = dS !== null && dC !== null;
      const said = (pid, d) => (a.kind === 'GUARD' ? `${pid > 1 ? pid : '(no pid written)'} not waited for (the guard answered, not the bound)` : !(pid > 1) ? 'no pid written' : `${pid} ${d === null ? (() => { const f = taskFacts(pid); return `ALIVE ${deathMs} ms after the bound answered: not gone and no SIGKILL pending at the last look (read after the wait: state ${f.state}, process group ${f.pgrp}, session ${f.session}${f.pgrp > 1 && sp > 1 && f.pgrp !== sp ? ` — NOT the probe's own group ${sp}: the product's group kill cannot reach it` : ''}) — THE PRODUCT'S KILL at the bound (the starter answered ${a.kind}:${a.why}): SIGKILL to the shell ${sp} by its own handle and to its group −${sp} (child-starter-proc.js, the session's group); the child's group at its first look: ${(() => { const m = /pg (\d+)/.exec((LOOKS.get(pid) || { first: [''] }).first[0] || ''); return m ? m[1] + (Number(m[1]) === sp ? ' (IN the signalled group)' : ' (NOT in the signalled group)') : 'not read'; })()} — ITS LOOKS: ${looksOf(pid)}`; })() : KILLED_NOT_RUN.has(pid) ? `killed ${d} ms after the bound answered (SIGKILL delivered, pending: the kernel had not run it yet — state ${taskFacts(pid).state})` : `died ${d} ms after the bound answered`}`);
      leg('…the shell (its pid) AND its rc\'s leftover child (its own session) are dead — or KILLED, the product\'s SIGKILL delivered and pending (a loaded kernel had not run them yet)', sp > 1 && sc > 1 && dead, `shell ${said(sp, dS)} · child ${said(sc, dC)}`);
      if (printDeaths) console.log(`    [the rc that never returns] the shell died ${dS === null ? 'NOT' : dS + ' ms'} and its leftover child ${dC === null ? 'NOT' : dC + ' ms'} after the bound answered (waited up to ${deathMs} ms)`);
      if (!dead) {   // nobody's kill ended them (a mutant, the guard): reaped here — after the shell had a bounded moment to write its pids
        for (const t0r = Date.now(); Date.now() - t0r < 1000 && !(readPid('sleepy.pid') > 1 && readPid('sleepy-child.pid') > 1);) await new Promise((res) => setTimeout(res, 20));
        reapSleepy(); reapGroup(readPid('sleepy.pid'));
      }
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
    const cu = mod.createCliCmds({ ask: (n) => mod.askShell(n, { shell: SLEEPY, timeoutMs: 40 }), log: (l) => ulogs.push(l) });
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
    const r3 = await c.check('codex', { reask: true });
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
    leg('…it names what was asked and where it looked, and the hub\'s path as a HINT', !!thrown && Array.isArray(thrown.looked) && thrown.looked.includes(HUBD) && thrown.hubPath === HUBX && /add that directory to your shell's PATH/.test(thrown.hint || '') && /not found as a program by your reg-shell \(login shell\)/.test(thrown.message), thrown && JSON.stringify({ looked: thrown.looked.length, hubPath: thrown.hubPath, hint: thrown.hint }));
    leg('…ONE journal line says the create is refused (cli-missing)', logs.filter((l) => /refused \(cli-missing\)/.test(l)).length === 1, logs.slice(-2).join(' | '));
    leg('…and a read says missing too (null; census missing)', (await c.check('codex', { reask: true })) === null && c.census?.('codex')?.missing === true && c.census?.('codex')?.answer === 'none');
    // an alias / a function is refused BY THAT WORD; unanswered with the hub's PATH empty too is refused, saying both
    const ca = mod.createCliCmds({ ask: (n) => mod.askShell(n, { shell: FN }), log: () => {} });
    ca.register('opencode', { name: 'vsfn_cli', current: 'vsfn_cli' });
    const cn = mod.createCliCmds({ ask: (n) => mod.askShell(n, { shell: EXIT3 }), log: () => {} });
    cn.register('codex', { name: `${N2}-nowhere`, current: `${N2}-nowhere` });
    const [ta, tn] = await Promise.all([ca.forSpawn('opencode', 'vsfn_cli').then(() => null, (e) => e), cn.forSpawn('codex', `${N2}-nowhere`).then(() => null, (e) => e)]);
    leg('a shell function with NO program behind it is refused in honest words — the function named, never run; the two doors «set OPENCODE_CMD … or put the program on your PATH»', !!ta && ta.code === 'cli-missing' && ta.answer === 'none' && ta.wrapper && ta.wrapper.kind === 'function' && ta.envName === 'OPENCODE_CMD' && /wraps the name in a function \(vsfn_cli\), which VibeSpace does not run/.test(ta.message) && /set OPENCODE_CMD to the program the function runs, or put the program on your PATH/.test(ta.message), ta && ta.message);
    leg('unanswered AND the hub\'s PATH has none ⇒ refused too, saying both', !!tn && tn.code === 'cli-missing' && tn.answer === 'unanswered' && tn.why === 'exit:3' && /could not be asked \(exit:3\)/.test(tn.message), tn && tn.message);
  } finally { fs.rmSync(F('prefix'), { force: true }); fs.rmSync(F('restrict'), { force: true }); }
  if (unanswered) { for (const [n, p, d] of await unanswered) leg(n, p, d); reapSleepy(); }
  {
    const dl = [];
    const cd = mod.createCliCmds({ ask: (n) => mod.askShell(n, { shell: NOCMD }), log: (l) => dl.push(l) });
    cd.register('codex', { name: N2, current: HUBX });
    const rd = await cd.forSpawn('codex', HUBX).catch((e) => e);
    const c0 = cd.census?.('codex');
    leg('D: a shell without `command` ⇒ the provisional path is KEPT (the spawn proceeds) and NAMED — census unanswered:no-command-builtin, the shell said', rd === HUBX && !!c0 && c0.unanswered === 'no-command-builtin' && c0.shell === 'nocmd-shell' && dl.some((l) => /nocmd-shell could not be asked .*no-command-builtin/.test(l)), JSON.stringify({ rd: String(rd && rd.message || rd), c0, dl }));
  }
  return out;
}

console.log('⑤ the login-shell rung over scratch shells');
for (const r of await rungLegs(CLI, { printDeaths: true })) ok(r.name, r.pass, r.detail);
let LSmod = null; try { LSmod = require(path.join(REPO, 'src/login-shell.js')); } catch (e) { ok('THE LADDER is spelled once: src/login-shell.js loads (the dial road\'s S0 and the local ask read it)', false, e.message.split('\n')[0]); }
if (LSmod && typeof CLI.loginShellOf === 'function') {
  const LS = LSmod;
  const userShell = (() => { try { return os.userInfo().shell || ''; } catch { return ''; } })();
  const run = (cmd, args, o = {}) => new Promise((res) => execFile(cmd, args, { encoding: 'utf8', ...o }, (err, out) => res(err ? 'ERR ' + err.message : String(out))));
  const getentP = run('getent', ['passwd', os.userInfo().username]);
  const isX = (p) => { try { fs.accessSync(p, fs.constants.X_OK); return p.startsWith('/'); } catch { return false; } };
  const onPath = (n) => { for (const d of String(process.env.PATH).split(':')) { if (d && isX(path.join(d, n))) return path.join(d, n); } return null; };
  const norm = (x) => (x === 'sh' ? '/bin/sh' : x);
  const rows = (await Promise.all([['SHELL set', NOISY], ['SHELL empty', ''], ['SHELL not executable', path.join(SHD, 'no-such-shell')]].map(async ([label, envShell]) => {
    const env = { PATH: process.env.PATH, HOME: process.env.HOME || '/tmp' };
    if (envShell) env.SHELL = envShell;
    const s0 = await run('/bin/sh', ['-c', LS.S0_SH + 'printf %s "$S0"'], { env });
    const js = LS.pickLoginShell({ envShell, accountShell: userShell, executable: isX, onPath }).shell;
    const real = await CLI.loginShellOf({ env, userInfo: () => ({ shell: userShell }) });
    return [[label, norm(s0), js], [label + ' (loginShellOf)', norm(s0), real.shell]];
  }))).flat();
  const ge = await getentP; const getent = ge.startsWith('ERR') ? '' : ge.trim().split(':').pop();
  ok('the account rung reads the passwd record (os.userInfo().shell = `getent passwd`\'s, the record the dial road reads)', !getent || userShell === getent, `${userShell} vs ${getent}`);
  ok(`THE LADDER: the dial road's S0 (sh) and the local road (pickLoginShell / loginShellOf) agree on the same inputs (${rows.map((r) => `${r[0]}: ${r[1]}`).join('; ')})`, rows.every((r) => r[1] === r[2]), JSON.stringify(rows));
}

console.log('⑥ the registry on the real default road (SHELL = a scratch shell)');
for (const r of await registryLegs(CLI)) ok(r.name, r.pass, r.detail);

/** ⑥b THE HARNESS FILTER'S FACT (B-544d) — rows over a module (the real one or a mutant copy); no file, no shell: the ask,
 *  the hub's walk and the access are stubs, so a copy runs beside ⑦'s others on no shared state. */
async function filterLegs(mod) {
  const out = [];
  const leg = (name, pass, detail) => out.push({ name, pass: !!pass, detail });
  const HUBP = '/hub/bin/codex', NVMP = '/u/.nvm/bin/opencode';
  let asked = 0;
  const c = mod.createCliCmds({ ask: async () => { asked++; return { kind: 'none', shell: '/bin/zsh', shellPath: '/u/bin' }; }, resolve: async () => HUBP, usable: async (p) => p === HUBP, looked: () => ['/hub/bin'], log: () => {} });
  c.register('codex', { name: 'codex', current: HUBP }); // the boot walk found it on the hub's PATH
  c.register('opencode', { name: 'opencode', current: 'opencode' }); // the boot walk found nothing (the bare name)
  c.register('claude', { name: '/opt/x/claude', current: '/opt/x/claude' }); // an operator's absolute command
  c.register('antigravity', { name: 'agy', current: 'agy' }); // its program `agy`: the boot walk found nothing either (the bare name)
  const before = ['codex', 'opencode', 'claude', 'antigravity', 'shell'].map((id) => (typeof c.resolvedHere === 'function' ? c.resolvedHere(id) : 'no resolvedHere'));
  leg('THE FILTER before any ask = the boot fact: an absolute path here, the bare name not (opencode, antigravity\'s agy), an operator\'s path here, a harness with no CLI (shell) here — and the reads ask nothing', JSON.stringify(before) === '[true,false,true,false,true]' && asked === 0, JSON.stringify(before));
  const acpBare = typeof c.resolvedHere === 'function' ? c.resolvedHere('opencode', { unaskedBare: true }) : 'no resolvedHere';
  leg('…an ACP / exe harness\'s bare name NOT ASKED YET stays here (unaskedBare — its section shown until its shell says; a program only the person\'s shell finds is the case the law is for)', acpBare === true && asked === 0, String(acpBare));
  let refused = null;
  try { await c.forSpawn('codex', HUBP); } catch (e) { refused = e; }
  const after = typeof c.resolvedHere === 'function' ? c.resolvedHere('codex') : 'no resolvedHere';
  leg('THE FILTER after the login shell found NO program: absent — though the boot path is absolute and still runs (the create was refused the same way; the census says missing)', !!refused && refused.code === 'cli-missing' && c.current('codex') === HUBP && after === false && c.census('codex').missing === true, `after=${after} refused=${refused && refused.code}`);
  const n = asked;
  for (let i = 0; i < 5; i++) { if (typeof c.resolvedHere === 'function') c.resolvedHere('codex'); }
  leg('…a read NEVER asks the shell (five reads, no ask — a page load is not a person\'s press)', asked === n && n === 1, `asks ${n} → ${asked}`);
  try { await c.forSpawn('opencode', 'opencode'); } catch { /* refused: the shell holds none */ }
  const acpAfter = typeof c.resolvedHere === 'function' ? c.resolvedHere('opencode', { unaskedBare: true }) : 'no resolvedHere';
  leg('…and once ITS shell found no program, the ACP harness is not here either (unaskedBare applies only before the ask)', acpAfter === false && c.census('opencode').missing === true, String(acpAfter));
  const cu = mod.createCliCmds({ ask: async () => ({ kind: 'unanswered', why: 'timeout', shell: '/bin/zsh' }), resolve: async () => null, usable: async () => false, log: () => {} });
  cu.register('opencode', { name: 'opencode', current: 'opencode' });
  try { await cu.forSpawn('opencode', 'opencode'); } catch { /* refused: neither the shell nor the hub has it */ }
  const un = typeof cu.resolvedHere === 'function' ? cu.resolvedHere('opencode', { unaskedBare: true }) : 'no resolvedHere';
  leg('…ASKED AND NOT ANSWERED (the shell timed out, failed to start) is unknown like not asked: the ACP harness stays here — only a real «none» says absent', un === true && cu.census('opencode').missing === false && cu.census('opencode').answer === 'unanswered', String(un));
  const c2 = mod.createCliCmds({ ask: async () => ({ kind: 'path', path: NVMP, via: 'program', shell: '/bin/zsh', shellPath: '/u/.nvm/bin' }), resolve: async () => null, usable: async () => true, log: () => {} });
  c2.register('opencode', { name: 'opencode', current: 'opencode' });
  const got = await c2.forSpawn('opencode', 'opencode');
  leg('THE FILTER after the shell FOUND it (the hub\'s walk had not): here', got === NVMP && typeof c2.resolvedHere === 'function' && c2.resolvedHere('opencode') === true);
  return out;
}
console.log('⑥b the harness filter\'s fact (B-544d): the shell\'s verdict, read, never asked');
for (const r of await filterLegs(CLI)) ok(r.name, r.pass, r.detail);

/** ⑪ B-69ec: the remote module over a STUBBED remote exec — rows over a module (the real one or a mutant copy). */
async function remoteLegs(RC, LSM) {
  const out = [];
  const leg = (name, pass, detail) => out.push({ name, pass: !!pass, detail });
  const say = (body, rc = 0) => `\n__VS_RSHELL__=/bin/zsh\n__VS_RHOME__=/home/u\n${body}\n__VS_RRC__=${rc}\n`;
  const line = (cv, al = '', ctl = '/usr/bin/printenv') => ['', LSM.BEGIN, cv, LSM.END, '', LSM.AL_BEGIN, al, LSM.AL_END, '', LSM.CTL_BEGIN, ctl, LSM.CTL_END, '/usr/bin:/bin', LSM.PATH_END].join('\n');
  let asks = 0, clock = 1000, reply = () => say(line('/home/u/.nvm/v24/bin/codex'));
  const logs = [], H = { id: 'dev-1', name: 'MAC-1' }, seen = [];
  const rc = RC.createRemoteCli({ hostShell: async (h, sc, o) => { asks++; seen.push({ sc, o }); return reply(); }, log: (l) => logs.push(l), now: () => clock });
  const p1 = await rc.forSpawn(H, 'codex', 'codex');
  leg('THE REMOTE TWIN: the machine\'s login shell found it ⇒ the create runs THAT program — one sh word, its own directory ahead of the rest of PATH (a node CLI runs on the node beside it; the tools dir in front when integrated); ONE journal line names the machine\'s shell and the path', p1 === 'env PATH=/home/u/.nvm/v24/bin:"$PATH" /home/u/.nvm/v24/bin/codex' && asks === 1 && logs.length === 1 && /MAC-1's zsh \(login shell\) found 'codex' at '\/home\/u\/\.nvm\/v24\/bin\/codex'/.test(logs[0]), { p1, logs });
  leg('…the ask is ONE `sh -c` word (an ssh login shell — zsh, fish — runs it as written), carries the person\'s create as its consent (never a held Hub-automation ask) and its bound', !!seen[0] && /^sh -c '/.test(seen[0].sc) && seen[0].o && seen[0].o.consent === true && seen[0].o.timeoutMs === RC.ASK_MS, seen[0] && { head: seen[0].sc.slice(0, 20), o: seen[0].o });
  leg('…a path with a space or a quote stays ONE word', RC.programLine('/opt/my tools/it\'s/codex') === `env PATH='/opt/my tools/it'\\''s':"$PATH" '/opt/my tools/it'\\''s/codex'` && RC.programLine('/opt/x/codex', { tools: true }) === 'env PATH="$HOME/.vibespace/bin":/opt/x:"$PATH" /opt/x/codex', RC.programLine('/opt/my tools/it\'s/codex'));
  const p2 = await rc.forSpawn(H, 'codex', 'codex');
  clock += RC.PATH_KEEP_MS + 1;
  const p3 = await rc.forSpawn(H, 'codex', 'codex');
  leg('…the path is KEPT (the next create asks nothing) until PATH_KEEP_MS, then asked again; the census row says where', p2 === p1 && p3 === p1 && asks === 2 && logs.length === 1 && rc.census('dev-1').codex && rc.census('dev-1').codex.answer === 'path' && rc.census('dev-1').codex.shell === 'zsh', { asks, census: rc.census('dev-1') });
  reply = () => say(line(''));
  let e1 = null; try { await rc.forSpawn({ ...H }, 'claude', 'claude'); } catch (e) { e1 = e; }
  const w = e1 && RC.remoteRefusal(e1, 'r-1');
  leg('…its shell holds NO program ⇒ the create is REFUSED by name before anything starts (cli-missing, the machine and its shell named, remote)', !!e1 && e1.code === 'cli-missing' && e1.remote === true && e1.machine === 'MAC-1' && e1.shell === 'zsh' && /not found as a program by the zsh of MAC-1/.test(e1.message) && w.type === 'error' && w.code === 'cli-missing' && w.reqId === 'r-1' && w.remote === true && w.machine === 'MAC-1', w);
  reply = () => say(line('')) + '\n__VS_RPRE__=/home/u/.local/bin/claude\n';
  const pr = await rc.forSpawn({ id: 'dev-2', name: 'MAC-2' }, 'claude', 'claude');
  leg('THE FALLBACK RUNG: its shell holds none but the remote prelude\'s PATH has it ⇒ the name runs as before (said once, the census names the prelude\'s path)', pr === 'claude' && logs.some((l) => /MAC-2's zsh \(login shell\) holds no program for 'claude' — the remote prelude's PATH has '\/home\/u\/\.local\/bin\/claude', which runs as before/.test(l)) && rc.census('dev-2').claude.prelude === '/home/u/.local/bin/claude', rc.census('dev-2').claude);
  reply = () => say(line(''));
  const a0 = asks; let e2 = null; try { await rc.forSpawn(H, 'claude', 'claude'); } catch (e) { e2 = e; }
  leg('…a «none» is never kept: the next create asks again (an install in between is seen)', !!e2 && asks === a0 + 1, { asks, a0 });
  reply = () => { throw Object.assign(new Error('link down'), { code: 'host_unavailable' }); };
  const u1 = await rc.forSpawn(H, 'agy', 'agy'), a1 = asks, u2 = await rc.forSpawn(H, 'agy', 'agy');
  leg('…it could not be ASKED ⇒ the prelude decides (the configured name, as before), named once, and KEPT for RECHECK_MS (a hung shell never taxes every create)', u1 === 'agy' && u2 === 'agy' && asks === a1 && logs.some((l) => /could not be asked where 'agy' is \(exec:host_unavailable\) — the remote PATH decides/.test(l)) && rc.census('dev-1').agy.why === 'exec:host_unavailable', { logs: logs.slice(-2), census: rc.census('dev-1').agy });
  reply = () => say(line('', `alias codex='~/.local/bin/codex'`));
  const rd = RC.createRemoteCli({ hostShell: async (h, sc) => (sc.includes('VS_X_RUNS') ? 'VS_X_ASKED\n' : reply()), log: () => { } });
  let e3 = null; try { await rd.forSpawn(H, 'codex', 'codex'); } catch (e) { e3 = e; }
  // batch 63 cure: a look that came back EMPTY (no VS_X_ASKED — a dial run that timed out on a hung mount) could not look: as answered
  const re = RC.createRemoteCli({ hostShell: async (h, sc) => (sc.includes('VS_X_RUNS') ? '' : reply()), log: () => { } });
  const pe = await re.forSpawn(H, 'codex', 'codex').then((c) => c, (e) => e && e.code);
  leg('…a look that came back EMPTY (it never said VS_X_ASKED) could not look — as answered: the alias\'s path runs, never «missing»', typeof pe === 'string' && pe.endsWith(' /home/u/.local/bin/codex'), pe);
  leg('…the installer alias\'s one word is checked THERE (the one path no PATH lookup vetted): missing ⇒ refused by its cause', !!e3 && e3.code === 'cli-missing' && e3.dangling === 'missing' && e3.notExecutable === '/home/u/.local/bin/codex', e3 && { d: e3.dangling, n: e3.notExecutable });
  leg('…an operator\'s absolute command and a machine with no remote exec are as configured (null — nothing asked)', (await RC.remoteCmdFor({ hosts: { _hostShell: async () => { asks++; return ''; } }, h: H, backend: 'claude', name: '/opt/claude' })) === null && (await RC.remoteCmdFor({ hosts: null, h: H, backend: 'claude', name: 'claude' })) === null);
  return out;
}
console.log('⑪ THE REMOTE TWIN (B-69ec): a paired machine\'s own login shell says where its CLI is');
if (!REM11) ok('the remote twin exists (src/server/remote-cli.js + src/login-shell.js remoteAskScript / remoteAnswer)', false);
else {
  for (const r of await remoteLegs(REM11.RC, REM11.LSM)) ok(r.name, r.pass, r.detail);
  const [loc, rem] = await Promise.all([REAL8.runs, REM11.runs]);
  const same = (l, m, RCm = REM11.RC) => (l.got.cmd ? m.got.cmd === RCm.programLine(l.got.cmd)
    : !!m.got.err && m.got.err.code === 'cli-missing' && m.got.err.remote === true && !!l.got.err && (l.got.err.wrapper ? !!m.got.err.wrapper && m.got.err.wrapper.kind === l.got.err.wrapper.kind : !m.got.err.wrapper) && (l.got.err.dangling || null) === (m.got.err.dangling || null));
  for (const [label] of REAL8.SHAPES) {
    const ls = loc.filter((r) => r.label === label), ms = rem.filter((r) => r.label === label);
    const factsOf = (m) => (m.facts ? ` [${m.facts.kind}${m.facts.prelude ? `, prelude ${m.facts.prelude}` : ''}${m.facts.why ? `, why ${m.facts.why}` : ''}]` : ' [no facts]');
    ok(`PARITY: ${label} — the remote ask reaches what the local road reaches (${ms.map((m) => `${m.sn} ${m.got.cmd ? 'the program' : `refused${m.got.err && m.got.err.dangling ? ` (${m.got.err.dangling})` : ''}`}${factsOf(m)}`).join(' · ')})`, ls.length === REAL8.SHELLS.length && ms.length === ls.length && ls.every((l) => { const m = ms.find((x) => x.sn === l.sn); return !!m && same(l, m); }),
      JSON.stringify(ms.map((m) => ({ sh: m.sn, cmd: m.got.cmd, err: m.got.err && m.got.err.message, local: (ls.find((l) => l.sn === m.sn) || { got: {} }).got.cmd || 'refused' }))).slice(0, 900));
  }
  const zr = await REM11.zshRuns;
  ok(`THE SSH ROAD's login shell: the same ask handed to REAL zsh -c (as an ssh login shell runs it) reaches the same answers (${zr.length} runs)`, !REM11.zsh || (zr.length === loc.length && zr.every((m) => { const l = loc.find((x) => x.label === m.label && x.sn === m.sn); return !!l && same(l, m); })), zr.filter((m) => { const l = loc.find((x) => x.label === m.label && x.sn === m.sn); return !l || !same(l, m); }).map((m) => ({ shape: m.label.slice(0, 40), sh: m.sn, cmd: m.got.cmd, err: m.got.err && m.got.err.message })).slice(0, 4));
  const wc = read('src/ws-create.js'), ssh = read('src/spawn/ssh.js'), dial = read('src/spawn/dial.js'), xr = read('src/server/exit-routes.js');
  ok('wiring: ws-create\'s remote terminal AND chat branches ask through remoteCmdFor for a registered CLI only (the shell harness never), refuse by name, and hand the answer to the ladder as `rcmd`', (wc.match(/remoteCmdFor\(\{ hosts, h, backend, /g) || []).length === 2 && (wc.match(/if \(cliCmds\?\.current\?\.\(backend\) != null\) \{/g) || []).length === 2 && (wc.match(/ws\.send\(JSON\.stringify\(remoteRefusal\(e, data\.reqId\)\)\); return;/g) || []).length === 2 && wc.includes('ladderCtx({ h, shq, rcmd: rcmdR, rargs })') && wc.includes('ladderCtx({ h, shq, ...(rcmdT ? { rcmd: rcmdT } : {}) })')
    && (wc.match(/remoteCmdFor\(\{ hosts, h, backend, name: [^\n]*, integrationOn \}\)/g) || []).length === 2);   // the ask's prelude flavor = the spawn's (batch 63 cure)
  ok('wiring: the ssh ladder\'s terminal and the dial ladder run that program (else the configured name); the host status carries the census', ssh.includes('const rcmdT = c.rcmd || rcmd;') && ssh.includes('...spawnEnvPairs.map(shq), rcmdT, ...spawnArgs.map(shq)]') && dial.includes('const rcmd1 = SP.loginShell ? rcmd0 : (rcmd || rcmd0);') && dial.includes('...spawnEnvPairs.map(shq), rcmd1, ') && xr.includes('cliWhere: rc.census(req.params.id)'));
  const rsrc = read('src/server/remote-cli.js'), RA = "    if (a.kind === 'path') return programLine(a.path, { tools: integration });\n";
  ok('the remote mutant\'s anchor is in remote-cli.js', rsrc.split(RA).length === 2);
  const RM = rsrc.includes(RA) ? M.load('src/server/remote-cli.js', editAnchor(rsrc, RA, "    if (a.kind === 'path') return name;\n", "src/server/remote-cli.js"), 'remote-name') : null;
  const redR = RM ? (await remoteLegs(RM, REM11.LSM)).filter((r) => !r.pass).map((r) => r.name) : [];
  const parR = RM ? (await REM11.runsOf(RM)).filter((m) => { const l = loc.find((x) => x.label === m.label && x.sn === m.sn); return l && !same(l, m); }).length : 0;
  ok(`MUTANT the answer ignored (the configured name, the pre-twin road) ⇒ the path leg RED (${redR.length}) and the parity RED on ${parR} runs`, redR.some((n) => /^THE REMOTE TWIN/.test(n)) && parR > 0, redR.join(' | ').slice(0, 300));
  // THE LAW's own leg (主开发 r205), after the FOURTH run set (the mutant's) ended: no planted home changed while its shells read it
  const changed = REAL8.plantedChanged(), onPathN = REAL8.SHAPES.filter(([, , o]) => o).length;
  ok(`the planted homes were written ONCE, before any ask: every file their shells read is as planted after the four run sets (${REAL8.planted.length} files, ${REAL8.planted.filter((x) => x.f.endsWith('.vs-on-path')).length} ~/.vs-on-path of ${onPathN} «on PATH» homes)`,
    REAL8.planted.filter((x) => x.f.endsWith('.vs-on-path')).length === onPathN && REAL8.planted.length >= REAL8.SHAPES.length * 4 && !changed.length, changed);
  { // CONTROL (a real one): a file planted the same way, then written again with the SAME bytes and then truncated — refused by name
    // (read-only), or, on a root runner where a chmod cannot refuse, seen by the leg's own judge
    const cf = path.join(DIR, 'planted-control'); fs.writeFileSync(cf, REAL8.RB); const c = REAL8.plantOne(cf);
    const tryIt = (fn) => { try { fn(); return 'written'; } catch (e) { return (e && e.code) || 'error'; } };
    const asRoot = typeof process.getuid === 'function' && process.getuid() === 0;
    const same = tryIt(() => fs.writeFileSync(cf, c.text)), cut = tryIt(() => fs.truncateSync(cf, 0));
    ok(`CONTROL: a planted file written again (the same bytes: ${same}) or truncated (${cut}) is refused by name${asRoot ? ' — as root the truncate is seen by the judge instead' : ''}`,
      asRoot ? (cut === 'written' && REAL8.plantedChanged([c]).length === 1) : (same === 'EACCES' && cut === 'EACCES'));
  }
  // batch 63's cure — the program line and the ask's prelude, run in a REAL sh over a planted home: a CLI and the real browser
  // driver installed under ONE prefix (an nvm node's bin, no default alias, no nvm.sh), the VibeSpace shim in ~/.vibespace/bin,
  // a PATH of plain tools only (no node: the spawn's node finder is what reaches the nvm bin). The machine's LOGIN shell is a
  // planted one that drops -l (it never reads this test machine's /etc/profile); the fallback rung and the spawn are login
  // sh's, as on a paired machine — so a test machine whose login sh already reaches a node or a CLI cannot judge them (said).
  const RS = require(path.join(REPO, 'src/remote-shell.js'));
  const PH = path.join(DIR, 'b63-home'), PB = path.join(PH, '.nvm', 'versions', 'node', 'v22.1.0', 'bin'), PT = path.join(PH, '.vibespace', 'bin'), PP = path.join(DIR, 'b63-tools');
  for (const d of [PB, PT, PP, path.join(PH, 'bin')]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(PB, 'node'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  fs.writeFileSync(path.join(PB, 'agent-browser'), '#!/bin/sh\necho DRIVER-REAL\n', { mode: 0o755 });
  fs.writeFileSync(path.join(PT, 'agent-browser'), '#!/bin/sh\necho DRIVER-SHIM\n', { mode: 0o755 });
  fs.writeFileSync(path.join(PB, 'b63cli'), '#!/bin/sh\nexec agent-browser\n', { mode: 0o755 });   // the planted CLI's name is no real program's (the tier rule reads a `command -v` of one as a run of it)
  fs.writeFileSync(path.join(PH, 'bin', 'mycli'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  fs.writeFileSync(path.join(PH, '.profile'), 'PATH="$HOME/bin:$PATH"; export PATH\n');   // only a LOGIN sh reads it (Debian's stock ~/.profile shape)
  const NLSH = path.join(DIR, 'b63-nlsh'); fs.writeFileSync(NLSH, '#!/bin/sh\n[ "$1" = -l ] && shift\n[ "$1" = -i ] && shift\nexec /bin/sh "$@"\n', { mode: 0o755 });
  for (const t of ['sh', 'printenv', 'ls', 'sort', 'tail', 'head', 'dirname', 'cat', 'env', 'id', 'awk', 'cut', 'getent', 'timeout']) {
    const at = spawnSync('/bin/sh', ['-c', `command -v ${t}`], { encoding: 'utf8' }).stdout.trim();
    if (at.startsWith('/')) { try { fs.symlinkSync(at, path.join(PP, t)); } catch { } }
  }
  const PENV = { HOME: PH, PATH: PP, SHELL: NLSH, USER: 'u', LOGNAME: 'u' };
  const q1 = (x) => `'${String(x).replace(/'/g, `'\\''`)}'`;
  const shRun = (script, env = PENV) => spawnSync('/bin/sh', ['-c', script], { env, encoding: 'utf8', timeout: 10000 });
  const loginReach = shRun(`sh -lc ${q1('command -v node; command -v b63cli; command -v mycli')} </dev/null`).stdout.trim().split('\n').filter((l) => l.startsWith('/') && !l.startsWith(PH));
  // MUST 1 — THE VIBESPACE TOOLS STAY FIRST: the spawn's prelude, then the program line; which driver answers
  const driverBy = (RCm, integ, env = PENV) => shRun(`${RS.buildRemoteShellPrelude({ toolsOnPath: integ, withNodeFinder: integ })}exec ${RCm.programLine(path.join(PB, 'b63cli'), { tools: integ })}`, env).stdout.trim();
  const d1 = driverBy(REM11.RC, true), d0 = driverBy(REM11.RC, false), dLeft = driverBy(REM11.RC, false, { ...PENV, PATH: `${PT}:${PP}` });
  ok(`THE VIBESPACE TOOLS STAY FIRST: after the spawn's integrated prelude, the program line of a CLI installed beside the real browser driver reaches the SHIM (${d1}); a pristine spawn gets no tools dir from the line (${d0}), even when the machine's own PATH holds it (${dLeft})`, d1 === 'DRIVER-SHIM' && d0 === 'DRIVER-REAL' && dLeft === 'DRIVER-REAL', { d1, d0, dLeft });
  const PLA = "const programLine = (p, { tools = false } = {}) => `env PATH=${tools ? '\"$HOME/.vibespace/bin\":' : ''}${shWord(p.replace(/\\/[^/]*$/, '') || '/')}:\"$PATH\" ${shWord(p)}`;";
  ok('the anchor of the control «the CLI\'s dir first» is in remote-cli.js once', rsrc.split(PLA).length === 2);
  const RP = rsrc.includes(PLA) ? M.load('src/server/remote-cli.js', editAnchor(rsrc, PLA, "const programLine = (p, { tools = false } = {}) => `env PATH=${shWord(p.replace(/\\/[^/]*$/, '') || '/')}:\"$PATH\" ${shWord(p)}`;", "src/server/remote-cli.js"), 'cli-dir-first') : null;   // the tip before this, on purpose — stale-pins: kept
  const dR = RP ? driverBy(RP, true) : null;
  ok(`RED CONTROL: the line with the CLI's directory first (the tip before this) — the REAL driver answers, the mediation bypassed without a sign (${dR})`, dR === 'DRIVER-REAL', dR);
  // MUST 2 — ONE PRELUDE FOR THE ASK AND THE SPAWN, and the fallback rung is a LOGIN sh as the spawn's: the machine's login
  // shell holds neither CLI; the spawn's prelude (the node finder) reaches the planted CLI, its login sh reaches mycli (~/.profile)
  const spawnFinds = (name, integ) => shRun(`sh -lc ${q1(`${RS.buildRemoteShellPrelude({ toolsOnPath: integ, withNodeFinder: integ })}command -v ${name}`)} </dev/null`).stdout.trim();
  const askBy = (RCm, name, integ) => RCm.createRemoteCli({ hostShell: async (h, sc) => String(shRun(sc).stdout || ''), log: () => { } })
    .forSpawn({ id: 'dev-63', name: 'DEV-63' }, name, name, { integration: integ }).then((c) => ({ cmd: c }), (e) => ({ err: e && e.code }));
  const PAA = "const preludeAsk = (name, integration) => `sh -lc ${sq(`${askPrelude(integration)}printf '\\\\n${R_PRE}%s\\\\n' \"$(command -v ${name} 2>/dev/null | head -n 1)\"`)} </dev/null 2>/dev/null`;";
  ok('the anchor of the controls «a shorter ask prelude» and «a non-login fallback» is in remote-cli.js once', rsrc.split(PAA).length === 2);
  if (loginReach.length) console.log(`  · NOT JUDGED HERE (by name): this machine's login sh already reaches ${loginReach.join(', ')} — the one-prelude legs need a login sh that reaches no node and no CLI`);
  else {
    const [a1, a0, am] = await Promise.all([askBy(REM11.RC, 'b63cli', true), askBy(REM11.RC, 'b63cli', false), askBy(REM11.RC, 'mycli', false)]);
    const s1 = spawnFinds('b63cli', true), s0 = spawnFinds('b63cli', false), sm = spawnFinds('mycli', false);
    ok(`ONE PRELUDE FOR THE ASK AND THE SPAWN: with integration on the spawn's prelude reaches the CLI (${s1 ? 'found' : 'none'}) and the ask agrees — the name runs (${JSON.stringify(a1)}); with it off neither has it — refused (${JSON.stringify(a0)})`,
      s1 === path.join(PB, 'b63cli') && a1.cmd === 'b63cli' && s0 === '' && a0.err === 'cli-missing', { s1, s0, a1, a0 });
    ok(`…and the fallback rung is a LOGIN sh as the spawn's: a CLI only ~/.profile puts on PATH — the spawn's login sh reaches it (${sm ? 'found' : 'none'}), the ask agrees, the name runs (${JSON.stringify(am)})`, sm === path.join(PH, 'bin', 'mycli') && am.cmd === 'mycli', { sm, am });
    const RA2 = rsrc.includes(PAA) ? M.load('src/server/remote-cli.js', editAnchor(rsrc, PAA, "const preludeAsk = (name, integration) => `sh -lc ${sq(`${buildRemoteShellPrelude({})}printf '\\\\n${R_PRE}%s\\\\n' \"$(command -v ${name} 2>/dev/null | head -n 1)\"`)} </dev/null 2>/dev/null`;", "src/server/remote-cli.js"), 'short-ask-prelude') : null;
    const aR = RA2 ? await askBy(RA2, 'b63cli', true) : null;
    ok(`RED CONTROL: the ask with the base prelude only (the first tip: no node finder) — a create the spawn would run is REFUSED (${JSON.stringify(aR)})`, !!aR && aR.err === 'cli-missing', aR);
    const RA3 = rsrc.includes(PAA) ? M.load('src/server/remote-cli.js', editAnchor(rsrc, PAA, "const preludeAsk = (name, integration) => `printf '\\\\n${R_PRE}%s\\\\n' \"$( ${askPrelude(integration)} command -v ${name} 2>/dev/null | head -n 1 )\"`;", "src/server/remote-cli.js"), 'non-login-fallback') : null;   // the cure's first cut, on purpose — stale-pins: kept
    const aN = RA3 ? await askBy(RA3, 'mycli', false) : null;
    ok(`RED CONTROL: a non-login fallback (the cure's first cut) — the CLI only ~/.profile reaches is REFUSED though the spawn would run it (${JSON.stringify(aN)})`, !!aN && aN.err === 'cli-missing', aN);
  }
  ok('wiring: the ssh ladder\'s prelude flavor follows the integration switch whatever the ship\'s outcome (the ask asks the same composition)', ssh.includes('let prelude = integrationOn ? buildRemoteShellPrelude({ toolsOnPath: true, withNodeFinder: true }) : REMOTE_PRELUDE;'));
}

// ⑦'s mutants START here and run beside ⑧–⑩ (disjoint scratch state); their rows print after ⑩
let sleepyChain = Promise.resolve();
const sleepyTurn = (f) => (sleepyChain = sleepyChain.then(f, f));   // the sleepy rc writes ONE pair of pid files: its mutants take turns
const SEVEN = (() => {
  const cc = read('src/server/cli-cmd.js');
  const MUT = [
    ['fail-closed removed (found nothing ⇒ spawn the old path)', '      if (p) return p;\n      const r = refusal(backend, e);', '      if (p || true) return p || cmd;\n      const r = refusal(backend, e);', (m) => registryLegs(m, { slow: false }), /FAIL CLOSED|REFUSED by that word|refused too/],
    ['sentinel parse removed (the first printed line is the answer)', '      const p = LS.parseShellAnswer(out);', "      const p = { complete: true, pathDone: true, cv: out.split('\\n').map((l) => l.trim()).filter(Boolean)[0] || '', path: null };", (m) => rungLegs(m, { groups: ['noisy'] }), /LAST pair wins|kind:none/],
    ['env unsanitized (the hub\'s process.env handed to the shell)', "env: serviceEnv(env, { keep: ['USER', 'LOGNAME'], add: { SHELL: shell, TERM: 'dumb', VIBESPACE_SHELL_PROBE: '1' } })", "env: { ...env, SHELL: shell }", (m) => rungLegs(m, { groups: ['env'] }), /SANITIZED ENV/],
    ['filter boot-only (B-544d: the shell\'s verdict ignored — the pre-fix /api/home)', '      if (missingOf(e)) return false;\n      // asked and NOT answered (the shell failed to start, timed out) is unknown, like not asked — only a real «none» says absent\n      return isAbs(e.current) || ((!e.answer || e.answer.kind === \'unanswered\') && !!unaskedBare);', '      return isAbs(e.current) || !!unaskedBare;', (m) => filterLegs(m), /^THE FILTER after the login shell found NO program/],
    ['the bound removed (the starter\'s run asked with no bound)', '  const req = { timeoutMs, capture: true, maxBuffer: 4 * 1024 * 1024, wholeEnv: true,', '  const req = { timeoutMs: 0, capture: true, maxBuffer: 4 * 1024 * 1024, wholeEnv: true,', (m) => sleepyTurn(() => rungLegs(m, { groups: ['sleepy'], boundGuardMs: 40 })), /unanswered:timeout/],
    // 主开发 08:58Z: the death leg keeps its meaning — a leftover child the product did NOT signal (its session never killed) stays alive: red
    ['session not signalled (the starter\'s session option dropped: only the shell is killed at the bound — the probe\'s own group never)', " session: { cwd: home } };\n", ' };\n', (m) => sleepyTurn(() => rungLegs(m, { groups: ['sleepy'], deathMs: 1500 })), /leftover child/],   // 1.5 s: the shell is gone at once, a child nobody signalled lives on (sleep 60) — the real leg keeps DEATH_MS
  ];
  const runs = MUT.map(([label, from, to, legs]) => cc.includes(from)
    ? legs(M.load('src/server/cli-cmd.js', editAnchor(cc, from, to, "src/server/cli-cmd.js"), label.split(' ')[0].replace(/[^a-z]/g, ''))).then((rs) => rs.filter((r) => !r.pass).map((r) => r.name))
    : Promise.resolve(null));
  return { MUT, reds: Promise.all(runs) };
})();

console.log('⑧ round 5 (final) — THE SHELL SAYS WHERE; THE SPAWN IS ALWAYS A PROGRAM: the shapes in REAL zsh + REAL bash under planted homes');
{
  const runs = await REAL8.runs;
  ok(`${REAL8.SHELLS.length} real shells measured (${REAL8.SHELLS.map(([n, p]) => `${n} ${p}`).join(', ')})`, REAL8.SHELLS.length === 2, 'zsh and bash are both required here');
  const judge = (r) => {
    const w = r.want, e = r.got.err, cs = r.cs || {};
    if (w.refused) {
      if (!e || e.code !== 'cli-missing' || e.answer !== 'none') return false;
      if (w.refused === 'wrapper') return !!e.wrapper && e.wrapper.kind === w.kind && /which VibeSpace does not run/.test(e.message) && /set CLAUDE_CMD to the program the (alias|function) runs, or put the program on your PATH/.test(e.message) && !e.hint;
      if (w.refused === 'none') return !e.wrapper && !e.dangling;
      return e.dangling === w.refused && e.via === 'alias' && new RegExp(`its alias names .*, which is ${w.refused === 'missing' ? 'missing' : 'not executable'}`).test(e.message) && cs.dangling === w.refused;
    }
    if (!r.got.cmd || r.got.cmd === r.sp) return false; // THE SPAWN IS NEVER A SHELL
    const m = r.marks[0] || {};
    if (w.target) return r.got.cmd === path.join(r.h, '.local-cli', REAL8.RN) && cs.via === 'alias' && m.tag === 'alias-target' && m.args === '--stream a b';
    if (w.prog) return r.got.cmd === REAL8.PROG && cs.via === 'program' && cs.wrapper && cs.wrapper.kind === w.prog && m.tag === 'path-program' && m.args === '--stream a b';
    return r.got.cmd === REAL8.PROG && !cs.wrapper && m.tag === 'path-program';
  };
  for (const [label] of REAL8.SHAPES) {
    const rs = runs.filter((r) => r.label === label);
    ok(`A: ${label} ⇒ ${rs.map((r) => `${r.sn} ${r.got.cmd ? (r.cs && r.cs.via === 'alias' ? 'its alias target' : r.cs && r.cs.wrapper ? 'the PATH program (wrapper named)' : 'the program') : 'refused'}`).join(' · ')}`, rs.length === REAL8.SHELLS.length && rs.every(judge),
      JSON.stringify(rs.map((r) => ({ sh: r.sn, cmd: r.got.cmd, err: r.got.err && r.got.err.message, cs: r.cs, marks: r.marks }))).slice(0, 1400));
  }
  const spawned = runs.filter((r) => r.got.cmd);
  ok(`A: THE SPAWN IS ALWAYS A PROGRAM — every adopted command (${spawned.length}) is a planted program file, never the shell, never a script that execs one`, spawned.length > 0 && spawned.every((r) => r.got.cmd !== r.sp && (r.got.cmd === REAL8.PROG || r.got.cmd.endsWith(`/.local-cli/${REAL8.RN}`)) && !/-l -i -c/.test(fs.readFileSync(r.got.cmd, 'utf8'))));
  const LSsrc = read('src/login-shell.js'), CCsrc = read('src/server/cli-cmd.js');
  ok('A: no shim road is left — login-shell.js has no shimScript / versionLine, cli-cmd.js no writeShim / probeVersion / cli-shims', !/shimScript|versionLine|parseVersion/.test(LSsrc) && !/writeShim|probeVersion|cli-shims/.test(CCsrc));
}
{
  // the words, in-process: the REAL src/lib/cli-missing-dialog.js bundled over stubbed utils / i18n + a lean DOM
  const esbuild = require('esbuild');
  const stubs = {
    'utils.js': "export const escHtml = (s) => String(s ?? '').replace(/[&<>\"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', \"'\": '&#39;' })[c]); export function createModalShell(o) { const d = document.createElement('div'), b = document.createElement('div'); d.appendChild(b); globalThis.__shell = { o, dialog: d, body: b }; return { dialog: d, body: b, close() { globalThis.__closed = true; } }; }",
    'i18n.js': "export const t = (s, p) => String(s).replace(/\\{(\\w+)\\}/g, (m, k) => (p && p[k] !== undefined ? String(p[k]) : m));",
  };
  let mod = null, buildErr = null;
  try {
    const out = await esbuild.build({ entryPoints: [path.join(REPO, 'src/lib/cli-missing-dialog.js')], bundle: true, format: 'cjs', platform: 'node', write: false, logLevel: 'silent',
      plugins: [{ name: 'stubs', setup(b) { b.onResolve({ filter: /^\.\/(utils|i18n)\.js$/ }, (a) => ({ path: path.basename(a.path), namespace: 'stub' })); b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: stubs[a.path], loader: 'js' })); } }] });
    const f = path.join(DIR, 'cli-missing-dialog.cjs'); fs.writeFileSync(f, out.outputFiles[0].text); mod = require(f);
  } catch (e) { buildErr = e.message; }
  // lane ui-plain-words first-run-16: the dialog's shell / PATH lines fold (techFold) — the fake element carries dataset, classList and a
  // class query, and the reader walks the fold's lines too
  const el = () => { const e = { className: '', textContent: '', title: '', children: [], dataset: {}, appendChild(c) { this.children.push(c); }, append(...cs) { this.children.push(...cs); },
    querySelectorAll(sel) { const cls = String(sel).replace(/^\./, ''), out = []; const walk = (n) => { for (const c of n.children || []) { if (String(c.className).split(/\s+/).includes(cls)) out.push(c); walk(c); } }; walk(this); return out; } };
    e.classList = { add: (c) => { e.className = (e.className + ' ' + c).trim(); } }; return e; };
  globalThis.document = { createElement: el };
  const runs = await REAL8.runs;
  const pick = (start) => runs.find((r) => r.label.startsWith(start) && r.sn === 'bash') || runs.find((r) => r.label.startsWith(start));
  const dom = (r) => { const e = r && r.got.err; if (!mod || !e) return ''; mod.openCliMissingDialog({ _showAgentsDialog() { } }, { cli: e.cli, shell: e.shell, answer: e.answer, wrapper: e.wrapper, envName: e.envName, notExecutable: e.notExecutable, dangling: e.dangling, via: e.via, looked: e.looked, hubPath: e.hubPath }); const flat = (c) => [c.textContent, ...(c.children || []).map(flat)].filter(Boolean).join(' | '); return globalThis.__shell.body.children.map(flat).join(' | '); };
  const line = (r, extra = {}) => (mod && r && r.cs ? (mod.cliWhereWords({ ...r.cs, ...extra }) || {}).text || '' : '');
  const fl = pick('a flags alias'), nn = pick('an npx alias with NO'), dg = pick('the DANGLING');
  const flLine = line(fl, { installed: true, cmdPath: fl && fl.got.cmd });
  ok(`A: a wrapper over a PATH program is NAMED in Manage agents («${flLine.slice(0, 150)}»)`, /^your bash wraps it in an alias — VibeSpace runs the program at .*, without the alias; to run what the alias runs, set CLAUDE_CMD to that program$/.test(flLine), JSON.stringify({ buildErr, flLine }));
  const nnDom = dom(nn);
  ok(`A: a wrapper with no program is refused in honest words with the two doors («${nnDom.slice(0, 160)}…»)`, /wraps vsreal\d+ in an alias \(alias .*\), which VibeSpace does not run, and has no vsreal\d+ program on its PATH\. Set CLAUDE_CMD to the program the alias runs, or put the program on your PATH\./.test(nnDom) && !/add that directory/.test(nnDom), nnDom);
  const dgDom = dom(dg), dgLine = line(dg, { installed: false });
  ok(`A: a dangling target is said by its CAUSE — the dialog's DOM and the Manage agents line («${dgLine.slice(0, 120)}»)`, /alias for vsreal\d+ names .*, which is missing\./.test(dgDom) && /^your bash’s alias names .*, which is missing$/.test(dgLine), JSON.stringify({ dgDom, dgLine }));
  if (mod && typeof mod.remoteCliWhereWords === 'function') {
    const rw = mod.cliMissingWords({ remote: true, machine: 'MAC-1', cli: 'codex', shell: 'zsh', answer: 'none' }), rwr = mod.cliMissingWords({ remote: true, machine: 'MAC-1', cli: 'codex', shell: 'zsh', answer: 'none', wrapper: { kind: 'function', text: 'codex' } }), rwd = mod.cliMissingWords({ remote: true, machine: 'MAC-1', cli: 'codex', shell: 'zsh', answer: 'none', notExecutable: '/home/u/.local/bin/codex', dangling: 'missing' });
    ok('B-69ec: a remote refusal names THAT machine\'s shell — never «your shell» nor the hub\'s PATH', rw.asked === 'Asked: the zsh of MAC-1, as a login shell' && rw.what === 'Nothing was started. The zsh of MAC-1 has no codex program on its PATH.' && rw.hint === null && /wraps codex in an alias or a function, which VibeSpace does not run/.test(rwr.what) && rwd.what === 'Nothing was started. The alias for codex in the zsh of MAC-1 names /home/u/.local/bin/codex, which is missing.' && ![rw, rwr, rwd].some((x) => /your |hub’s/.test(x.what + x.asked)), { rw, rwr, rwd });
    const W1 = mod.remoteCliWhereWords({ answer: 'path', path: '/home/u/.nvm/v24/bin/codex', shell: 'zsh' }, 'MAC-1'), W2 = mod.remoteCliWhereWords({ answer: 'none', shell: 'bash' }, 'MAC-1'), W3 = mod.remoteCliWhereWords({ answer: 'unanswered', shell: 'zsh', why: 'timeout' }, 'MAC-1');
    ok('B-69ec: a remote host\'s Manage agents line says where THAT machine\'s shell found it (or not, or could not be asked); never asked yet ⇒ no line', W1.text === 'found by the zsh of MAC-1 at /home/u/.nvm/v24/bin/codex' && W1.tone === 'dim' && W2.text === 'not found by the bash of MAC-1 (login shell)' && W2.tone === 'warn' && /^the zsh of MAC-1 could not be asked \(.+\) · its own PATH decides$/.test(W3.text) && mod.remoteCliWhereWords(null, 'MAC-1') === null, { W1, W2, W3 });
  } else ok('B-69ec: the dialog module carries the remote words (remoteCliWhereWords)', false);
  // B-3d6a: a PAIRED machine's refusal — «Open Manage agents» opens Machines › THAT machine (by its id), its title naming the machine
  // and its shell; this machine's refusal opens Manage agents as before. RED CONTROL: the dialog with the release's two lines back
  const opened = [];
  const appStub = { _showAgentsDialog(o) { opened.push(['dialog', o || null]); }, _showAgentsFor(id) { opened.push(['for', id]); } };
  const doorOf = (m, msg) => {
    opened.length = 0; if (!m) return { title: '', opened: [] };
    m.openCliMissingDialog(appStub, msg);
    const foot = ((globalThis.__shell && globalThis.__shell.dialog && globalThis.__shell.dialog.children) || []).find((c) => /dialog-footer/.test(c.className || ''));
    const b = foot && (foot.children || []).find((c) => /cli-missing-manage/.test(c.className || ''));
    if (b && typeof b.onclick === 'function') b.onclick();
    return { title: b ? String(b.title || '') : '', opened: opened.slice() };
  };
  const REMOTE = { code: 'cli-missing', remote: true, machine: 'MAC-1', hostId: 'h-mac1', cli: 'codex', shell: 'zsh', answer: 'none' }, LOCAL = { code: 'cli-missing', cli: 'claude', shell: 'bash', answer: 'none' };
  const rd = doorOf(mod, REMOTE), ld = doorOf(mod, LOCAL);
  ok('B-3d6a: a REMOTE refusal\'s «Open Manage agents» calls the Manage agents door FOR that machine (_showAgentsFor by its id) — its title names the machine and its shell; this machine\'s calls it with none (the Accounts tab)',
    rd.opened.length === 1 && rd.opened[0][0] === 'for' && rd.opened[0][1] === 'h-mac1' && rd.title === 'Opens MAC-1 in Manage agents › Machines — the next create asks the zsh of MAC-1 again once codex is installed there'
    && ld.opened.length === 1 && ld.opened[0][0] === 'for' && ld.opened[0][1] === null && ld.title === 'Re-check there asks your shell again once claude is installed', JSON.stringify({ rd, ld }));
  const NEW_DOOR = /  \/\/ B-3d6a: a PAIRED machine's refusal[\s\S]*?\n  \};\n/;
  const RELEASE_DOOR = "  manage.title = t('Re-check there asks your shell again once {cli} is installed', { cli: w.cli });\n  manage.onclick = () => { close(); try { app?._showAgentsDialog?.(); } catch { } };\n";   // stale-pins: kept — the control's copy of the release's door
  const dsrc = fs.readFileSync(path.join(REPO, 'src/lib/cli-missing-dialog.js'), 'utf8');
  let ctl = null;
  if (NEW_DOOR.test(dsrc)) {
    try {
      const out = await esbuild.build({ stdin: { contents: anchored(dsrc, NEW_DOOR, RELEASE_DOOR, 'B-3d6a: the release\'s door in place of the machine door'), resolveDir: path.join(REPO, 'src/lib'), sourcefile: 'cli-missing-dialog.release.js', loader: 'js' }, bundle: true, format: 'cjs', platform: 'node', write: false, logLevel: 'silent',
        plugins: [{ name: 'stubs', setup(b) { b.onResolve({ filter: /^\.\/(utils|i18n)\.js$/ }, (a) => ({ path: path.basename(a.path), namespace: 'stub' })); b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: stubs[a.path], loader: 'js' })); } }] });
      const f = path.join(DIR, 'cli-missing-dialog.release.cjs'); fs.writeFileSync(f, out.outputFiles[0].text); ctl = require(f);
    } catch { ctl = null; }
  }
  const rc = doorOf(ctl, REMOTE);
  ok('CONTROL B-3d6a proves its plant first: the copy carries the release\'s door (its title is this machine\'s «asks your shell again»)', !!ctl && rc.title === 'Re-check there asks your shell again once codex is installed', rc.title);
  ok('CONTROL B-3d6a (the release\'s door): a REMOTE refusal opens Manage agents on its last tab — no machine (red)', !!ctl && rc.opened.length === 1 && rc.opened[0][0] === 'dialog', JSON.stringify(rc.opened));
  const MA = fs.readFileSync(path.join(REPO, 'src/lib/manage-agents.js'), 'utf8');
  ok('B-3d6a: Manage agents\' door to a machine — the Machines tab, the machine\'s card in the remembered open set, focused once drawn (open + scrolled into view)',
    /_showAgentsFor\(hostId = null, opts = \{\}\) \{[\s\S]{0,200}setItem\('vibespace\.agentsTab', hostId \? 'machines' : 'accounts'\)[\s\S]{0,400}open\.add\(String\(hostId\)\)[\s\S]{0,200}this\._agentsFocusHost = String\(hostId\);/.test(MA)
    && /if \(this\._agentsFocusHost === h\.id\) \{ this\._agentsFocusHost = null; det\.open = true; setTimeout\(\(\) => \{ try \{ det\.scrollIntoView\(\{ block: 'nearest' \}\); \} catch \{ \} \}, 0\); \}/.test(MA)
    && /const shown = [^\n]*this\.sidebar\?\._activeTab === 'agents';\n\s*const r = this\._showAgentsDialog\(opts\);\n\s*if \(shown\) \{ try \{ this\._agentsRefreshHook\?\.\(\); \} catch \{ \} \}/.test(MA));
  // lane ui-plain-words closure (A1): what is IN VIEW (not the fold) — the face follows the state, and the cause + recipe line stays
  // on the face when it names a variable to set or a path to fix (mutant: delete the face line, or fold the what line ⇒ red)
  const inView = (r) => { dom(r); return globalThis.__shell.body.children.filter((c) => !/\btech-fold\b/.test(c.className)).map((c) => `${c.className}=${c.textContent}`).join(' | '); };
  const nnView = inView(nn), nnTitle = globalThis.__shell && globalThis.__shell.o && globalThis.__shell.o.title, dgView = inView(dg), dgTitle = globalThis.__shell && globalThis.__shell.o && globalThis.__shell.o.title;
  ok(`6a: the dialog's OWN title follows the state — wrapped «${nnTitle}», dangling «${dgTitle}»`, /^vsreal\d+ is wrapped in an alias or a function$/.test(nnTitle || '') && /^vsreal\d+ cannot run$/.test(dgTitle || ''), { nnTitle, dgTitle });
  ok(`A1: a wrapper's face says it is WRAPPED, and the recipe line is in view («${nnView.slice(0, 200)}»)`, /cli-missing-face=Your shell wraps vsreal\d+ in an alias or a function VibeSpace does not run/.test(nnView) && /cli-missing-what=.*Set CLAUDE_CMD|cli-missing-what=.*set [A-Z_]+/i.test(nnView) && !/could not find/.test(nnView), nnView);
  ok(`A1: a dangling alias's face says the shell names something that cannot run, and its cause is in view («${dgView.slice(0, 200)}»)`, /cli-missing-face=Your shell names a vsreal\d+ that cannot run/.test(dgView) && /cli-missing-what=.*which is missing\./.test(dgView) && !/could not find/.test(dgView), dgView);
  // closure 2 (5d / 6a): every STATE's face and title, run through the module — configured, broken, wrapped, unanswered, none
  const ST = mod && mod.cliMissingState ? ['configured', 'broken', 'wrapped', 'unanswered', 'none'].map((st) => [st, mod.cliMissingFace(st, 'claude'), (typeof mod.cliMissingTitle === 'function' ? mod.cliMissingTitle(st, 'claude') : '(no title per state)')]) : []; // a sha without the title door is RED here, never a crash
  const stOf = mod && mod.cliMissingState ? [mod.cliMissingState({ answer: 'configured' }), mod.cliMissingState({ notExecutable: '/x' }), mod.cliMissingState({ wrapper: { kind: 'alias' } }), mod.cliMissingState({ answer: 'unanswered' }), mod.cliMissingState({ answer: 'none' })] : [];
  ok(`5d / 6a: each state has its own face and title — «not found» only when nothing was found («${ST.map((x) => x[2]).join(' | ')}»)`, ST.length === 5 && JSON.stringify(stOf) === JSON.stringify(['configured', 'broken', 'wrapped', 'unanswered', 'none'])
    && /path set for claude is not a program/.test(ST[0][1]) && ST[0][2] === 'claude cannot run' && /names a claude that cannot run/.test(ST[1][1]) && /wraps claude in an alias or a function/.test(ST[2][1]) && /could not be asked/.test(ST[3][1]) && /could not find claude/.test(ST[4][1]) && ST[4][2] === 'claude was not found'
    && ST.slice(0, 4).every((x) => !/not found|could not find/.test(x[1] + x[2])), JSON.stringify(ST));
  delete globalThis.document;
}
{
  // THE VERSION CHIP STAYS (round 5): the census never overwrites what cliFacts measured for a plain program
  const reg = CLI.createCliCmds({ ask: async () => ({ kind: 'path', path: REAL8.PROG, via: 'program', wrapper: null, shell: REGSH, shellPath: null }), log: () => { } });
  reg.register('claude', { name: REAL8.RN, current: REAL8.PROG });
  let handler = null;
  ROUTE.create({ app: { get: (p, h) => { if (p === '/api/backend-status') handler = h; } }, machineProbes: { cliFacts: async () => ({ claude: { installed: true, cmdPath: REAL8.PROG, version: '2.1.281 (Claude Code)' }, codex: {} }) }, accounts: { list: () => ({ accounts: [] }) }, cliCmds: reg });
  let body = null; await handler({ query: {} }, { json: (b) => { body = b; } });
  const c = (body && body.claude) || {};
  ok(`A: a plain program keeps its measured version in /api/backend-status («${c.version}»), the census beside it`, c.version === '2.1.281 (Claude Code)' && c.installed === true && c.via === 'program' && c.provenance === 'shell', JSON.stringify(c));
}

console.log('⑨ round 2 — ONE CLI, ONE BINARY: every measurement reads the binary the sessions spawn');
{
  const { spawned, before, gate, told, SHC } = await GATE9;
  ok(`B: the hub's 2.1.281 vs the shell's 2.1.300 — sessions spawn the shell's (${spawned === SHC ? '2.1.300' : spawned}); the version GATE measures it (boot ${before} → ${gate[gate.length - 1]}) and the REGISTRATION is told it (${told[told.length - 1]})`, spawned === SHC && /^2\.1\.281\b/.test(before || '') && /^2\.1\.300\b/.test(gate[gate.length - 1] || '') && /^2\.1\.300\b/.test(told[told.length - 1] || ''), JSON.stringify({ gate, told }));
  // THE READERS CENSUS: every CLAUDE_CMD / CODEX_CMD READ outside the boot registration (src/server/cli-env.js) — per
  // OCCURRENCE (round 3: a forbidden read beside an allowed one on the same line reds by name), process.env reads counted
  const ALLOWED = [
    ['server.js', "const CLAUDE_CMD_RAW = process.env.CLAUDE_CMD || 'claude';", 'the env override\'s NAME, read once at boot (the raw the registry asks for)'],
    ['server.js', "const CODEX_CMD_RAW = process.env.CODEX_CMD || 'codex';", 'the env override\'s NAME, read once at boot'],
    ['server.js', 'CLAUDE_CMD, CODEX_CMD, CODEX_LINUX_SANDBOX_CMD, CODEX_SANDBOX_SUPPORTED,', 'the boot registration\'s exports (the destructure)'],
    ['server.js', 'app, rootDir: __dirname, HOST, CLAUDE_CMD, cliCmds, NODE_CMD,', 'account-usage-routes gets the accessor beside the boot constant (its fallback before the registry exists)'],
    ['server.js', "claudeCmd: CLAUDE_CMD, codexCmd: CODEX_CMD, cliCmds });", 'backend-status-route reads the checked path / cliCmds.current first — these are its last fallback'],
    ['server.js', 'onMemberReadingFresh, CLAUDE_CMD, cliCmds });', 'usage-routes gets the accessor beside the boot constant'],
    ['server.js', 'NODE_CMD, DTACH_CMD, CLAUDE_CMD, EDITOR_CMD, AGENT_BIN_DIR, PORT, X_ENV, cliCmds,', 'the ws ctx hands both (ws-create reads cliCmds first)'],
    ['server.js', 'claude: ${CLAUDE_CMD}, codex: ${CODEX_CMD}', 'the boot log line (what boot resolved)'],
    ['src/ws-handler.js', "'NODE_CMD', 'DTACH_CMD', 'CLAUDE_CMD',", 'WS_CTX_CONTRACT names the ctx key'],
    ['src/ws-handler.js', 'NODE_CMD, DTACH_CMD, CLAUDE_CMD, EDITOR_CMD, AGENT_BIN_DIR, PORT, X_ENV,', 'the ctx destructure'],
    ['src/ws-create.js', 'NODE_CMD, DTACH_CMD, CLAUDE_CMD, EDITOR_CMD, AGENT_BIN_DIR, PORT, X_ENV, cliCmds,', 'the ctx destructure'],
    ['src/usage-routes.js', 'probeUsageForAccountKey, onMemberReadingFresh, CLAUDE_CMD, cliCmds = null }) {', 'the setup parameter'],
    ['src/server/account-usage-routes.js', 'function create({ app, rootDir, HOST, CLAUDE_CMD, cliCmds = null, NODE_CMD,', 'the create parameter'],
  ];
  const FALLBACK = /current\??\.?\('(claude|codex)'\)\)? \|\| (CLAUDE_CMD|CODEX_CMD)\b/g; // THE accessor first, the boot constant its fallback
  const READ = /\b(CLAUDE_CMD|CODEX_CMD)\b/g;
  /** {file → [[line no, text]]} → { stray, unused } — every OCCURRENCE must sit inside a named row's text or the fallback */
  function readersCensus(byFile) {
    const stray = [], used = new Set();
    for (const [f, rows] of byFile) {
      for (const [ln, raw] of rows) {
        if (/^\s*(\/\/|\*|\/\*)/.test(raw)) continue;
        const code = raw.replace(/\/\/.*$/, '');
        const spans = [];
        for (const row of ALLOWED) { if (row[0] !== f) continue; let i = code.indexOf(row[1]); while (i >= 0) { spans.push([i, i + row[1].length, row]); i = code.indexOf(row[1], i + 1); } }
        for (const m of code.matchAll(FALLBACK)) spans.push([m.index, m.index + m[0].length, null]);
        for (const m of code.matchAll(READ)) {
          const hit = spans.find(([a, b]) => a <= m.index && m.index < b);
          if (!hit) { stray.push(`${f}:${ln} «${code.slice(Math.max(0, m.index - 40), m.index + 30).trim()}»`); continue; }
          if (hit[2]) used.add(hit[2]);
        }
      }
    }
    return { stray, unused: ALLOWED.filter((r) => !used.has(r)) };
  }
  // the tracked tree's lines that name either constant (`git grep -w`: the census reads no file that does not)
  let hits = '';
  try { hits = execFileSync('git', ['-C', REPO, 'grep', '-n', '-w', '-E', 'CLAUDE_CMD|CODEX_CMD', '--', 'server.js', 'src'], { encoding: 'utf8' }); } catch (e) { hits = String(e.stdout || ''); }
  const byFile = new Map();
  for (const h of hits.split('\n').filter(Boolean)) { const m = /^([^:]+):(\d+):([\s\S]*)$/.exec(h); if (!m || m[1] === 'src/server/cli-env.js' || !/\.js$/.test(m[1])) continue; if (!byFile.has(m[1])) byFile.set(m[1], []); byFile.get(m[1]).push([Number(m[2]), m[3]]); }
  ok('B: the census scope is the tracked server tree (git grep found the known readers — non-vacuous)', byFile.has('server.js') && byFile.has('src/ws-create.js') && byFile.has('src/server/account-usage-routes.js'), [...byFile.keys()].join(', '));
  const real = readersCensus(byFile);
  ok(`B: THE READERS CENSUS — every CLAUDE_CMD / CODEX_CMD READ (per occurrence, process.env counted) outside the boot registration is a named row (${ALLOWED.length}) or THE accessor's fallback`, real.stray.length === 0, real.stray.join(' | '));
  ok('B: …and every named row still names a live read (a dead row would hide a new reader)', real.unused.length === 0, real.unused.map((r) => r[0] + ': ' + r[1]).join(' | '));
  // E MUTANTS: the gate's base spelling put back BESIDE the allowed backend-status row (same line) / a process.env read
  const patched = (f, from, to) => new Map([...byFile].map(([k, rows]) => [k, k === f ? rows.map(([n, l]) => [n, l.includes(from) ? l.replace(from, to) : l]) : rows]));
  const gateFrom = "claudeCmd: () => cliCmds.current('claude') || CLAUDE_CMD, onCliVersion";
  ok('E mutant: the gate\'s accessor exists on the line beside the allowed backend-status row', (byFile.get('server.js') || []).some(([, l]) => l.includes(gateFrom) && l.includes("codexCmd: CODEX_CMD, cliCmds });")));
  const m1 = readersCensus(patched('server.js', gateFrom, 'claudeCmd: CLAUDE_CMD, onCliVersion'));
  ok(`E mutant «the gate reads the boot CLAUDE_CMD again, on the line an allowed row shares» ⇒ RED by name (${m1.stray.join(' | ').slice(0, 140)})`, m1.stray.some((x) => /^server\.js:\d+ .*claudeCmd: CLAUDE_CMD, onCliVersion/.test(x)), m1.stray.join(' | '));
  const binFrom = "const bin = (cliCmds && typeof cliCmds.current === 'function' && cliCmds.current('claude')) || CLAUDE_CMD || 'claude';";
  const usageRows = [...(byFile.get('src/usage-routes.js') || [])];
  const m2map = new Map(byFile); m2map.set('src/usage-routes.js', [...usageRows.map(([n, l]) => [n, l.includes(binFrom) ? l.replace(binFrom, "const bin = process.env.CLAUDE_CMD || 'claude';") : l])]);
  const m2 = readersCensus(m2map);
  ok(`E mutant «the /usage probe reads process.env.CLAUDE_CMD» ⇒ RED by name (${m2.stray.join(' | ').slice(0, 140)})`, usageRows.some(([, l]) => l.includes(binFrom)) && m2.stray.some((x) => /^src\/usage-routes\.js:\d+ .*process\.env\.CLAUDE_CMD/.test(x)), m2.stray.join(' | '));
  // E: the onAdopt re-tick is WIRED (deleted ⇒ the gate never re-measures an adoption) — the pin + its mutant
  const srv = read('server.js');
  const adoptPin = (t) => /const oatFileSync = require\('\.\/src\/server\/oat-file-sync\.js'\)\.start\(\{[^\n]*\}\); cliCmds\.onAdopt\(\(\) => oatFileSync\.tick\(\)\);/.test(t);
  ok('E: server.js wires the version gate\'s re-tick on an adoption (cliCmds.onAdopt(() => oatFileSync.tick()))', adoptPin(srv));
  ok('E mutant «the onAdopt re-tick deleted» ⇒ the pin is RED', srv.includes(' cliCmds.onAdopt(() => oatFileSync.tick());') && !adoptPin(srv.replace(' cliCmds.onAdopt(() => oatFileSync.tick());', '')));
}

console.log('⑨b round 3 — THE LOCAL SHELL\'S ANSWER IS LOCAL: a remote road runs the CLI\'s configured NAME');
{
  const RB2 = path.join(DIR, 'musl'); fs.mkdirSync(RB2, { recursive: true });
  const MUSL = path.join(RB2, 'codex-x86_64-unknown-linux-musl'); fs.writeFileSync(MUSL, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  const remoteLegs = async (mod) => {
    // a local installer-shape alias (one absolute word) — its adopted command is a LOCAL path with another basename
    const reg = mod.createCliCmds({ ask: async () => ({ kind: 'path', path: MUSL, via: 'alias', wrapper: { kind: 'alias', text: "alias codex='~/bin/codex-x86_64-unknown-linux-musl'" }, shell: REGSH, shellPath: null }), log: () => { } });
    reg.register('codex', { name: 'codex', current: 'codex' });
    const local = await reg.forSpawn('codex', 'codex').catch(() => null);
    const rn = typeof reg.remoteName === 'function' ? reg.remoteName('codex', local) : null;
    const ov = typeof reg.remoteName === 'function' ? reg.remoteName('codex', '/opt/custom/codex-wrap') : null;
    return { local, rn, ov, pass: local === MUSL && rn === 'codex' && ov === 'codex-wrap' };
  };
  const r = await remoteLegs(CLI);
  ok(`B r3: a LOCAL alias target with another basename (${path.basename(String(r.local))}) — the ssh / dial command still runs «${r.rn}»; a spec override keeps its own name («${r.ov}»)`, r.pass, JSON.stringify(r));
  const wc = read('src/ws-create.js'), ssh = read('src/spawn/ssh.js'), dial = read('src/spawn/dial.js');
  ok('B r3: all three remote command sites read cliCmds.remoteName(backend, spawnCmd) — ws-create\'s ssh chat, the ssh ladder, the dial ladder', /const rcmd = cliCmds\?\.remoteName \? cliCmds\.remoteName\(backend, spawnCmd\)/.test(wc) && /const rcmd = ctx\.cliCmds\?\.remoteName \? ctx\.cliCmds\.remoteName\(backend, spawnCmd\)/.test(ssh) && /const rcmd0 = SP\.loginShell \? '"\$S0"' : \(ctx\.cliCmds\?\.remoteName \? ctx\.cliCmds\.remoteName\(backend, spawnCmd\)/.test(dial));
  const cc = read('src/server/cli-cmd.js');
  const RFROM = '      return e && cmd && cmd === e.current ? base(e.name) : base(cmd);';
  if (ok('B r3 mutant: the remoteName line exists', cc.includes(RFROM))) {
    const mm = M.load('src/server/cli-cmd.js', editAnchor(cc, RFROM, '      return base(cmd);', "src/server/cli-cmd.js"), 'remotebase');
    const rm = await remoteLegs(mm);
    ok(`B r3 mutant «the remote command = basename of the adopted path» ⇒ RED («${rm.rn}»)`, !rm.pass && rm.rn !== 'codex', JSON.stringify(rm));
  }
}

console.log('⑩ round 2 — THE SHELL RUNS FOR A PERSON\'S PRESS ONLY: the usage door\'s wall read spawns no shell');
{
  const AGX = path.join(DIR, 'agy-door'); fs.writeFileSync(AGX, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  let asks = 0;
  const reg = CLI.createCliCmds({ ask: async () => { asks++; return { kind: 'path', path: AGX, via: 'program', wrapper: null, shell: REGSH, shellPath: null }; }, log: () => { } });
  reg.register('antigravity', { name: 'agy-door', current: AGX });
  const DOOR = require(path.join(REPO, 'src/server/cli-usage-door.js'));
  const door = DOOR.createCliUsageDoor({
    accounts: { get: (id) => ({ id, backend: 'antigravity' }), resolveForSpawn: () => { throw new Error('stub: no login in this leg'); } },
    harnessOf: () => ({ label: 'Antigravity', quota: { onDemand: { judge: () => ({ verdict: 'reading' }), argv: ['-p', '/usage'], onWallSignal: true, cwdOf: () => DIR } }, settings: { prefix: 'antigravity', rows: [{ key: 'autoUsageReads', default: 'on' }] } }),   // its own row for automatic reads (a harness without one is refused by name)
    cliCmds: reg, cacheDir: DIR, setting: () => 'manual', log: () => { }, paceMs: 0,
  });
  const w0 = await door.read('acct-wall', { wall: true });
  ok(`C: a wall read on a never-asked CLI with a usable path: ${asks} shell runs (the door read on, ${w0 && w0.code})`, asks === 0 && w0 && w0.code === 'login-needed', JSON.stringify(w0));
  await reg.forSpawn('antigravity', AGX);
  const n1 = asks;
  const w1 = await door.read('acct-wall-2', { wall: true });
  const p1 = await door.read('acct-press', { person: true });
  ok(`C: after the session's spawn asked once (${n1}), a wall read and a person's usage press run NO shell (${asks - n1}) — only Re-check / Install (reask) does`, n1 === 1 && asks === 1 && w1.code === 'login-needed' && p1.code === 'login-needed', JSON.stringify({ n1, asks, w1: w1.code, p1: p1.code }));
  await reg.check('antigravity', { reask: true });
  ok('C: …and a person\'s Re-check (reask) asks the shell now', asks === 2, `asks=${asks}`);
}

console.log('⑦ mutants of the shell rung (patched copies outside the tree, judged side by side)');
{
  const { MUT } = SEVEN;
  const reds = await SEVEN.reds;
  reapSleepy();
  MUT.forEach(([label, , , , want], i) => {
    if (!ok(`mutant «${label}»: its line exists in cli-cmd.js`, reds[i] !== null)) return;
    const red = reds[i];
    ok(`mutant «${label}» ⇒ RED (${red.length} red: ${red.slice(0, 2).join(' | ').slice(0, 160)})`, red.some((n) => want.test(n)), red.join(' | ').slice(0, 300));
  });
  for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 12 })) ok(r.name, r.pass, r.detail); // a FLOOR: ④'s 3 + ⑦'s 6 + ⑪'s 3 (⑪'s fourth and ⑨b's one write more) (batch 63 cure: + the CLI's dir first, + a shorter ask prelude)
}

// ⑫ NO SELF-FOUND AGENT CLI AT A HUB'S BOOT UNDER THE FLAG (B-ec25, lane bl-tests-e): a scratch hub booted with no stand-in
// commands ran the binaries it FOUND (claude --help at boot, codex sandbox -- true) whatever VS_NO_REAL_CLI said. The real
// cli-env create() runs in a child over a stub-only resolver (argv-recording `exit 0` stubs; the child env is built from
// nothing); the CONTROL first: the flag unset, the same self-found stubs ARE started — so a silent record under the flag is
// the guard (src/machine-probes.js realCliRefusal), not a stub the resolver never found.
console.log('⑫ B-ec25: the boot probes start no agent CLI the hub found by itself under VS_NO_REAL_CLI=1 (the real cli-env create, in a child)');
{
  const BD = path.join(DIR, 'ec25'), BIN = path.join(BD, 'bin'), REC = path.join(BD, 'argv.log');
  for (const d of [BIN, path.join(BD, 'home'), path.join(BD, 'root')]) fs.mkdirSync(d, { recursive: true });
  const stub = (name, out) => fs.writeFileSync(path.join(BIN, name), `#!/bin/sh\nprintf '%s %s\\n' '${name}' "$*" >> '${REC}'\n${out}exit 0\n`, { mode: 0o755 });
  stub('claude', "printf '  --name <name>  a name for the session\\n'\n");
  stub('codex', 'exit 1\n');   // its sandbox probe FAILS: an answer read (false) is told from the default (true)
  const CHILD = path.join(BD, 'boot.cjs');
  fs.writeFileSync(CHILD, [
    "const fs = require('fs'), path = require('path');",
    "const [repo, bin, root, rec] = process.argv.slice(2);",
    "const said = []; const log0 = console.log; console.log = (...a) => { said.push(a.join(' ')); };",
    "const resolveCmd = (n) => { const p = path.join(bin, n); try { fs.accessSync(p, fs.constants.X_OK); return p; } catch { return null; } };",
    "const E = require(path.join(repo, 'src/server/cli-env.js')).create({ rootDir: root, CLAUDE_CMD_RAW: process.env.CLAUDE_CMD || 'claude', CODEX_CMD_RAW: process.env.CODEX_CMD || 'codex', resolveCmd, getOAuthToken: (cb) => cb(null), usagePollingEnabled: () => false, refreshHarnessModels: () => {} });",
    "const runs = () => { try { return fs.readFileSync(rec, 'utf8'); } catch { return ''; } };",
    "const guarded = said.some((l) => l.startsWith('[cli-probe] codex sandbox -- true not run'));",
    "const t0 = Date.now();",
    "const done = () => { const cx = E.adapterRegistry.get('codex'); log0('RESULT ' + JSON.stringify({ said, supportsName: !!E.adapterRegistry.get('claude').config.supportsName, sandbox: cx && cx.config ? cx.config.codexSandboxSupported : null })); process.exit(0); };",
    "(function wait() { if (process.platform !== 'linux' || /codex sandbox/.test(runs()) || (guarded && Date.now() - t0 > 300) || Date.now() - t0 > 15000) return setTimeout(done, 50); setTimeout(wait, 25); })();",
  ].join('\n') + '\n');
  const boot = (extra) => {
    fs.rmSync(REC, { force: true });
    const r = spawnSync(process.execPath, [CHILD, REPO, BIN, path.join(BD, 'root'), REC], { encoding: 'utf8', timeout: 30000, env: { PATH: `${BIN}:/usr/bin:/bin`, HOME: path.join(BD, 'home'), LANG: 'C.UTF-8', ...extra } });
    const line = String(r.stdout || '').split('\n').find((l) => l.startsWith('RESULT '));
    let out = null; try { out = JSON.parse(line.slice(7)); } catch { }
    let runs = ''; try { runs = fs.readFileSync(REC, 'utf8'); } catch { }
    return { out, runs: runs.trim().split('\n').filter(Boolean).sort(), err: String(r.stderr || '').slice(-300) };
  };
  const LINUX = process.platform === 'linux';
  const BOTH = LINUX ? ['claude --help', 'codex sandbox -- true'] : ['claude --help'];
  const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  const C = boot({});
  ok(`RED CONTROL (first): the flag unset, no stand-in named — the boot STARTS the self-found stubs (${C.runs.join(' · ') || 'none'}) and reads their answers (--name support; the failed sandbox)`, !!C.out && same(C.runs, BOTH) && C.out.supportsName === true && C.out.sandbox === !LINUX, C.err || JSON.stringify(C.out));
  const A = boot({ VS_NO_REAL_CLI: '1' });
  ok(`under VS_NO_REAL_CLI=1 with no stand-in named, the boot starts NO agent CLI it found (argv record: ${A.runs.length} lines)`, !!A.out && A.runs.length === 0, A.err || A.runs.join(' | '));
  ok('…each probe says so by name in the journal', !!A.out && A.out.said.includes('[cli-probe] claude --help not run: VS_NO_REAL_CLI=1 and no CLAUDE_CMD names a stand-in (permission modes, effort levels and --name support keep their defaults)') && (!LINUX || A.out.said.includes('[cli-probe] codex sandbox -- true not run: VS_NO_REAL_CLI=1 and no CODEX_CMD names a stand-in (the sandbox is assumed supported)')), JSON.stringify(A.out && A.out.said));
  ok('…and the defaults stand: no --name support read, the sandbox assumed supported', !!A.out && A.out.supportsName === false && A.out.sandbox === true, JSON.stringify(A.out));
  const B = boot({ VS_NO_REAL_CLI: '1', CLAUDE_CMD: path.join(BIN, 'claude'), CODEX_CMD: path.join(BIN, 'codex') });
  ok(`the stand-ins the env NAMES still run under the flag, each once (${B.runs.join(' · ') || 'none'}), and their answers are read (--name support; the failed sandbox)`, !!B.out && same(B.runs, BOTH) && B.out.supportsName === true && B.out.sandbox === !LINUX, B.err || JSON.stringify(B.out));
}

console.log(`\n${fail ? fail + ' FAILED (' + pass + ' passed)' : 'ALL PASS (' + pass + ')'}`);
process.exit(fail ? 1 : 0);
