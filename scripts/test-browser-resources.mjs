#!/usr/bin/env node
// AGENT BROWSER P0 — THE REAL BINARY (docs/design-agent-browser-v2.zh.md §1.2,
// §3.2.3, §12.10). HEAVY tier: it launches real Chromium instances.
//
// TWO THINGS ONLY THE BINARY CAN ANSWER, and both are P0 deliverables:
//
//   ⓐ ZERO INTERFERENCE (§2's I1/I2, the reported harm). Two sessions driven
//     through the REAL resolver's environment must not see each other's tabs,
//     and one's `close --all` must not close the other's browser. Driven
//     beside a PRE-FIX CONTROL that reproduces today's shape.
//   ⓑ THE RESOURCE ENVELOPE at k = 1 / 4 / 12 (§12.10 calls this a P0 task and
//     says D13's ceiling is a proposal until it is done). §1.2's numbers were
//     measured on four IDLE HEADLESS leftovers from another suite; these are
//     measured with P0's exact environment, on a loaded page.
//   ⓔ (r3) a PROJECT-level `./agent-browser.json` fence survives the generated
//     config: today's arm, the product's arm, and round 2's user-only resolver
//     as the pre-fix control (which SUCCEEDS where it must be refused).
//   ⓕ (r3) the REMOTE composition on a host whose config names a profile: two
//     sessions both launch on per-key dirs the host chose; round 2's line (no
//     host decision) is the pre-fix control and reproduces the SingletonLock
//     collision; today's shape and a no-profile host are the bounds.
//   ⓖ (r4) a FENCED config never lands on rung C: with the generated config
//     unwritable (injected) the product lands on N and the fenced session
//     browses; round 3's patched copy lands on C and the CLI refuses the
//     command — `--allowed-domains is not supported with --profile`.
//   ⓗ (r4) a PIN reaches the running browser by REPLACING it: the pin leaves
//     chromium alone until the next command, which relaunches it on the pinned
//     directory with the page gone (`about:blank`, new pid); the no-pin control
//     keeps page and pid. Rounds 1-3 stated the opposite sentence.
//   ⓘ (r4) the HOME 38/39 pair: at 38 the CLI's own socket root fits; at 39 the
//     product's AGENT_BROWSER_SOCKET_DIR launches where round 3's environment
//     (the same pairs minus that one) is refused as "too long", and the bare
//     CLI's `default` name still works — the bound round 3 regressed from.
//
// THE PRE-FIX CONTROL DOES NOT TOUCH THE MACHINE'S OWN DEFAULT DAEMON. There is
// (routinely) a live headed chromium on the shared `default-profile` belonging
// to somebody else's agent, and `close --all` there is precisely the incident
// this work prevents. The control therefore gives BOTH arms the same PRIVATE
// namespace and no session name — byte-for-byte today's "two agents, one
// daemon, one default session" shape, with the shared user-data-dir held
// constant so the only variable is the two names.
//
// CHILD LIFETIME IS OWNED (§9's suite-hygiene rule): every chromium this file
// starts is found by its own resolved `--user-data-dir` and killed on exit AND
// on the watchdog, because a browser suite is the easiest way to make the
// 2,089-leaked-fixture-process sweep worse.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, vncEnv, endRootedProcesses } from './scratch.mjs';
import { mutantCopies, copiesCensus, sweepLegacy } from './mutant-copy.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port for every server this suite boots (never the machine-global :7/5901 — test-architecture §57)
const require = createRequire(import.meta.url);
const BE = require('../src/server/browser-env.js');
const B = require('../src/browser-profiles.js');

let pass = 0, fail = 0, skipped = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n); } return !!c; };
const skip = (n) => { skipped++; console.log('  ⊘ SKIP ' + n); };
const done = () => {
  console.log(`\n${fail ? fail + ' FAILED (' + pass + ' passed' + (skipped ? ', ' + skipped + ' skipped' : '') + ')' : 'ALL PASS (' + pass + (skipped ? ', ' + skipped + ' skipped' : '') + ')'}`);
  process.exit(fail ? 1 : 0);
};

// ── is the tool here at all? SKIP WITH EVIDENCE, never a silent pass ────────
const v = spawnSync('agent-browser', ['--version'], { encoding: 'utf8', timeout: 15000 });
if (v.error || v.status !== 0) {
  console.log('\nagent-browser (real binary)');
  skip(`agent-browser is not runnable here — \`agent-browser --version\` ${v.error ? 'failed: ' + (v.error.code || v.error.message) : 'exited ' + v.status}. `
    + 'The environment half (which variables, which resolved directory, the ladder, the floor) is asserted without it in test-browser-profiles; '
    + 'what CANNOT be checked without it is whether two real browsers actually stop seeing each other, and what k=1/4/12 cost on this box.');
  done();
}
const INSTALLED = String(v.stdout || '').trim();

// ── ownership: everything we start, and nothing else ───────────────────────
const OWNED = new Set();                   // resolved --user-data-dir values WE created
// THE TAG IS SHORT ON PURPOSE (r3). The CLI's daemon socket lives at
// `$HOME/.agent-browser/namespaces/<ns>/run/<session>.sock` and refuses any path
// over 103 bytes (measured: "Socket path would be 104 bytes (max 103)"). Round
// 2's `'vsres' + pid` made a 27-char name the day this box's pids reached seven
// digits and every leg went red at once. `'r' + pid.toString(36)` is ≤ 6 chars,
// so `vs-bk-<8 hex>-<tag>` is ≤ 21 and the path stays ≤ 92 from a 14-char HOME.
const TAG = 'r' + process.pid.toString(36);
const ROOT = scratch('browser-res');
// Fixture HOMEs must be SHORT for the same reason (`/tmp/vs-browser-res-<pid>/home-e`
// alone is 33 bytes and pushes the socket path past 103): a second scratch root
// with two-letter names, removed with everything else on exit.
const HB = scratch('bh');
const REPO_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(path.join(ROOT, 'data', 'session-meta'), { recursive: true });
const DATA = path.join(ROOT, 'data');

// OWNERSHIP IS DECIDED BY THE FACT THAT IDENTIFIES THE PROCESS (r2). An
// agent-browser DAEMON's cmdline is the bare binary path with NO arguments —
// measured, `/…/agent-browser/bin/agent-browser-linux-x64` and nothing else —
// so its session and namespace live ONLY in its environment. A cmdline-only
// rule therefore leaked one daemon per run: round 1 left 13 of them behind on a
// clean pass while printing "reaped 168 process(es) this suite started", and
// the leg-ⓐ control daemon (whose env carried no idle timeout) never expired at
// all — 22 orphans from 10 earlier runs were sitting on this box, up to 3,190 s
// old, each pointing at a scratch dir that had already been deleted.
//
// Reading `environ` for EVERY process is affordable and is measured rather than
// assumed: 3,677 processes cost 37 ms for environ against 29 ms for cmdline
// (median of 3 on this box), so there is no heuristic scope to get wrong.
function allProcs() {
  const out = [];
  for (const d of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue;
    let c; try { c = fs.readFileSync(`/proc/${d}/cmdline`); } catch { continue; }
    let e = ''; try { e = fs.readFileSync(`/proc/${d}/environ`, 'utf8'); } catch { }
    // ppid off /proc/<pid>/stat (the comm is parenthesised and may hold spaces — split after the last ')')
    let ppid = 0; try { const st = fs.readFileSync(`/proc/${d}/stat`, 'utf8'); ppid = Number(st.slice(st.lastIndexOf(')') + 2).split(' ')[1]) || 0; } catch { }
    out.push({ pid: Number(d), ppid, s: c.toString('utf8').split('\0').join(' '), e });
  }
  return out;
}
/** The RETIRED rule, kept as a live negative control for leg ⓓ. */
const cmdlineOurs = (s) => s.includes(TAG) || [...OWNED].some((u) => u && s.includes('--user-data-dir=' + u));
/** The half only the environment can answer. */
function envNamesTag(e) {
  if (!e) return false;
  for (const kv of e.split('\0')) {
    if (!kv.startsWith('AGENT_BROWSER_NAMESPACE=') && !kv.startsWith('AGENT_BROWSER_SESSION=')) continue;
    if (kv.includes(TAG)) return true;
  }
  return false;
}
/** A process whose HOME is one of THIS run's fixture homes (r4): the 38/39
 *  and bare-CLI arms must run UNTAGGED names (the tag would change the very
 *  byte count under test), so ownership there is the fixture HOME, which is
 *  per-pid unique; the trailing slash keeps `vs-bh-123` from claiming `vs-bh-1234`. */
const envHomeOurs = (e) => !!e && e.includes(`HOME=${HB}/`);
const isOurs = (p) => cmdlineOurs(p.s) || envNamesTag(p.e) || envHomeOurs(p.e);
/** The chromium MAIN process of a namespace: the lowest pid whose environ
 *  names it and whose cmdline carries `--user-data-dir=` (the launcher's argv
 *  survives its exec, so the main process reads `/usr/bin/google-chrome …`). */
function mainChrome(ns) {
  const ps = allProcs().filter((p) => p.e.includes(`AGENT_BROWSER_NAMESPACE=${ns}\0`) || p.e.endsWith(`AGENT_BROWSER_NAMESPACE=${ns}`)).filter((p) => /--user-data-dir=/.test(p.s)).sort((a, b) => a.pid - b.pid);
  if (!ps.length) return null;
  const m = ps[0].s.match(/--user-data-dir=(\S+)/);
  return { pid: ps[0].pid, dir: m ? m[1] : null };
}
// PATCHED COPIES of the ORCH module — the branch's pre-fix-control idiom, as
// in test-browser-profiles: written OUTSIDE the tree (scripts/mutant-copy.mjs:
// this process's scratch dir, `require` re-bound on line 1 to the real
// module's path, so relative requires resolve as a sibling's); ⓙ measures that
// while they exist. They used to be gitignored siblings (src/server/vs-browser-mut-*).
const MUTBR = mutantCopies('bres', REPO_DIR);
sweepLegacy(REPO_DIR, ['src/server'], /^vs-browser-mut-(\d+)-/);   // what a pre-fix run stranded (dead PIDs only)
const beSrc0 = fs.readFileSync(path.join(REPO_DIR, 'src/server/browser-env.js'), 'utf8');
function mutantBE(edits) {
  let src = beSrc0, hits = 0;
  for (const [from, to] of edits) {
    if (src.split(from).length !== 2) return { err: 'needle not exactly once: ' + from.slice(0, 70) };
    src = src.split(from).join(to); hits++;
  }
  return { mod: MUTBR.load('src/server/browser-env.js', src), hits };
}
/** Every socket-dir root the CLI writes under, INCLUDING the per-namespace
 *  subdirectory. Round 1 read only the top level while the CLI keeps namespaced
 *  state one level down in `namespaces/` — 180 stale `vs-bk-*-vsres*` dirs
 *  (1.5 MB) from 12 earlier runs were still there. */
function sockDirs() {
  // the binary's own root precedence (SOCKET_DIR > $XDG_RUNTIME_DIR/agent-browser > $HOME/.agent-browser): the
  // runtime dir this suite actually runs under — a literal /run/user/<uid> missed every daemon of a run given a
  // scratch XDG_RUNTIME_DIR (takeover r3: the positive control below read 0 there)
  const xdg = process.env.XDG_RUNTIME_DIR || `/run/user/${process.getuid?.() ?? 1000}`;
  const roots = [path.join(os.homedir(), '.agent-browser'), path.join(xdg, 'agent-browser')];
  return roots.flatMap((r) => [r, path.join(r, 'namespaces')]);
}
function strayNamespaceDirs() {
  const out = [];
  for (const d of sockDirs()) {
    let names = []; try { names = fs.readdirSync(d); } catch { continue; }
    for (const f of names) if (f.includes(TAG)) out.push(path.join(d, f));
  }
  return out;
}
function reap() {
  let n = 0;
  for (const p of allProcs()) if (isOurs(p)) { try { process.kill(p.pid, 'SIGKILL'); n++; } catch { } }
  n += endRootedProcesses(ROOT).length + endRootedProcesses(HB).length; // …and whatever the ⓒ server started (its dtach sessions: real HOME, root only in argv)
  for (const f of strayNamespaceDirs()) { try { fs.rmSync(f, { recursive: true, force: true }); } catch { } }
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { }
  try { fs.rmSync(HB, { recursive: true, force: true }); } catch { }
  return n;
}
process.on('exit', reap);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { reap(); process.exit(1); });
const WATCHDOG = setTimeout(() => { console.error('  ✗ WATCHDOG: this suite owns its children and is killing them now'); reap(); process.exit(1); }, 25 * 60 * 1000);
WATCHDOG.unref?.();

// ── the environment under test comes from the REAL resolver ────────────────
// HEADLESS THROUGH THE PRODUCT'S OWN KNOB, not through a flag. This machine's
// user config is `headed: true`, and a `--headed false` on `open` alone makes
// the LAUNCH headless while every later command still resolves headed — the
// daemon then answers about a browser that is not the one we opened (measured:
// `get title` came back empty for a session that was demonstrably alive). The
// generated config is the one place that settles it for every verb, which is
// also why `browser.headed` is a setting rather than a spawn flag.
const resolver = BE.create({
  dataDir: DATA,
  serverSetting: (k) => (k === 'browser.headed' ? false : undefined),
  // The socket base is this run's own (r4): a long HOME on the box running
  // this would otherwise make the product create the production per-uid dir.
  socketDirBase: path.join(HB, 'sb'),
  log: { warn() { }, log() { } },
});
function envFor(key, extra = {}) {
  const r = resolver.envFor({ browserKey: key, integrationOn: true });
  const e = { ...process.env, ...extra };
  // Strip anything ambient so the only names in play are the ones under test.
  for (const k of ['AGENT_BROWSER_SESSION', 'AGENT_BROWSER_NAMESPACE', 'AGENT_BROWSER_CONFIG', 'AGENT_BROWSER_PROFILE', 'AGENT_BROWSER_IDLE_TIMEOUT_MS']) delete e[k];
  for (const p of r.pairs) { const i = p.indexOf('='); e[p.slice(0, i)] = p.slice(i + 1); }
  // Name our own processes so `reap` can find them even before a user-data-dir
  // is known (variant D mints a random /tmp one).
  e.AGENT_BROWSER_SESSION = `${e.AGENT_BROWSER_SESSION}-${TAG}`;
  e.AGENT_BROWSER_NAMESPACE = `${e.AGENT_BROWSER_NAMESPACE}-${TAG}`;
  return { env: e, variant: r.variant };
}
const ab = (env, args, ms = 120000) => spawnSync('agent-browser', args, { env, encoding: 'utf8', timeout: ms });
function learnDirs(before) {
  // OWNERSHIP IS THE ENVIRONMENT, NEVER "IT IS NEW" (r5, heavy RED on e0108c05):
  // the heavy tier runs four lanes, and a chromium another suite started between
  // our before-snapshot and this scan (vs-roster-eta-chrome-<pid>) was claimed
  // as ours — the dirs leg counted three and, with its ~20 processes wearing our
  // label, k=1 read 41 and the per-browser slope failed. A chromium we started
  // inherits the daemon's tagged AGENT_BROWSER_* env (or the fixture HOME of the
  // untagged arms) — that is the only rule that survives a busy machine.
  // The chromium's OWN environ does not carry the names (the daemon spawns it
  // clean — measured: k=1 read 3 processes with an environ-only rule), so the
  // ownership walks UP: a chromium is ours when it, or an ancestor still alive,
  // carries our tagged names or our fixture HOME (the daemon does).
  const procs = allProcs();
  const byPid = new Map(procs.map((p) => [p.pid, p]));
  const lineageOurs = (p) => { let cur = p; for (let i = 0; cur && i < 12; i++) { if (envNamesTag(cur.e) || envHomeOurs(cur.e)) return true; cur = byPid.get(cur.ppid); } return false; };
  for (const p of procs) {
    if (before.has(p.pid)) continue;
    const m = p.s.match(/--user-data-dir=(\S+)/);
    if (m && p.s.includes('/chrome') && lineageOurs(p)) OWNED.add(m[1]);
  }
}
function open(env, url) {
  const before = new Set(allProcs().map((p) => p.pid));
  const r = ab(env, ['open', url]);
  learnDirs(before);
  return r;
}

console.log(`\nagent-browser ${INSTALLED} — floor ${B.FLOOR_VERSION} (${B.floorVerdict(INSTALLED).state})`);
const page = (t) => `data:text/html,<title>${t}</title><h1>${t}</h1>`;

// ═══ ⓐ zero interference, with a PRE-FIX control ═══════════════════════════
console.log('\nⓐ two sessions, one machine (I1 + I2)');
{
  const A = envFor('bk-11110001'), Bv = envFor('bk-11110002');
  ok(A.variant === 'D' && Bv.variant === 'D', `the resolver landed both on variant D (the ephemeral one) — got ${A.variant}/${Bv.variant}`);
  ok(A.env.AGENT_BROWSER_NAMESPACE !== Bv.env.AGENT_BROWSER_NAMESPACE, 'setup: two namespaces');

  const tA = `VSA${TAG}`, tB = `VSB${TAG}`;
  const oA = open(A.env, page(tA)), oB = open(Bv.env, page(tB));
  if (!ok(oA.status === 0 && oB.status === 0, `both browsers opened (A ${oA.status}, B ${oB.status})`)) {
    console.error('      A stderr: ' + String(oA.stderr || '').slice(0, 300));
    console.error('      B stderr: ' + String(oB.stderr || '').slice(0, 300));
  } else {
    // THE RESOLVED DIRECTORIES, off the live chromium children — the gate §9
    // asks for, here against the real process rather than our own file.
    const dirs = [...OWNED];
    ok(dirs.length === 2, `two sessions resolved TWO user-data-dirs (${dirs.length}): ${dirs.map((d) => path.basename(d)).join(' , ')}`);
    ok(!dirs.some((d) => d.includes('default-profile')), 'and neither is the machine\'s shared default-profile (variant B is what that would be)');

    const listA = String(ab(A.env, ['tab', 'list']).stdout || '');
    const listB = String(ab(Bv.env, ['tab', 'list']).stdout || '');
    ok(!listB.includes(tA), 'B does not see A\'s tab (I2: a tab has exactly one owner)');
    ok(!listA.includes(tB), 'A does not see B\'s tab');

    ab(Bv.env, ['close', '--all']);
    const after = String(ab(A.env, ['get', 'title']).stdout || '').trim();
    ok(after.includes(tA), `A survives B's \`close --all\` (the command a tidying agent reaches for first) — A still on "${after}"`);
  }

  // PRE-FIX CONTROL — today's shape, reproduced inside our OWN namespace so it
  // can never reach the machine's real default daemon.
  const ctlNs = `vs-ctl-${TAG}`;
  const ctlEnv = () => {
    const e = { ...process.env };
    delete e.AGENT_BROWSER_SESSION;            // ← THE MISSING NAME, the whole point
    e.AGENT_BROWSER_NAMESPACE = ctlNs;         // ← shared, as today: one daemon
    e.AGENT_BROWSER_CONFIG = A.env.AGENT_BROWSER_CONFIG; // user-data-dir held constant
    // …but the MISSING NAME is the only variable under test. Round 1 copied
    // `process.env` and set nothing else, so the control daemon inherited NO
    // idle timeout and a missed reap became a PERMANENT orphan (measured: one
    // per run, 14 of them alive on this box). Every daemon this file starts
    // carries the same bound the product gives a real session — leg ⓓ asserts
    // it, and the reap is still what actually collects them.
    e.AGENT_BROWSER_IDLE_TIMEOUT_MS = String(B.DEFAULT_IDLE_TIMEOUT_MS);
    return e;
  };
  const cA = ctlEnv(), cB = ctlEnv();
  const uA = `VSCA${TAG}`, uB = `VSCB${TAG}`;
  open(cA, page(uA)); open(cB, page(uB));
  const cListA = String(ab(cA, ['tab', 'list']).stdout || '');
  ok(cListA.includes(uB) && !cListA.includes(uA),
    'PRE-FIX CONTROL: with no session name, the second agent TOOK OVER the first\'s tab (the reported symptom)');
  ab(cB, ['close', '--all']);
  const cAfter = String(ab(cA, ['get', 'title']).stdout || '').trim();
  ok(!cAfter.includes(uA), `PRE-FIX CONTROL: and its \`close --all\` killed the other agent's browser too (A now "${cAfter || '<gone>'}")`);
}

// ═══ ⓑ the resource envelope, k = 1 / 4 / 12 ══════════════════════════════
console.log('\nⓑ k = 1 / 4 / 12 concurrent isolated browsers (§12.10)');
{
  // LEG ⓐ'S BROWSERS ARE NOT PART OF THIS MEASUREMENT. Round 1 left them
  // running and k=1 read 41 processes / 4.3 GB — four browsers wearing one
  // browser's label, which makes every per-k delta below a fiction.
  const carried = reap();
  OWNED.clear();
  ok(carried > 0 && allProcs().filter((p) => isOurs(p)).length === 0,
    `leg ⓐ's ${carried} processes are reaped before k is measured (a polluted k=1 makes every row below a fiction)`);
  const memOf = (pid) => {
    let rss = 0, pss = 0;
    try {
      for (const line of fs.readFileSync(`/proc/${pid}/smaps_rollup`, 'utf8').split('\n')) {
        const m = line.match(/^(Rss|Pss):\s+(\d+) kB/);
        if (m) { if (m[1] === 'Rss') rss = +m[2]; else pss = +m[2]; }
      }
    } catch { }
    return { rss, pss };
  };
  const fdOf = (pid) => {
    let fds = 0, ino = 0, wd = 0, names = [];
    try { names = fs.readdirSync(`/proc/${pid}/fd`); } catch { return { fds, ino, wd }; }
    fds = names.length;
    for (const n of names) {
      let fi = ''; try { fi = fs.readFileSync(`/proc/${pid}/fdinfo/${n}`, 'utf8'); } catch { }
      if (/^inotify wd:/m.test(fi)) { ino++; wd += (fi.match(/^inotify wd:/gm) || []).length; }
    }
    return { fds, ino, wd };
  };
  const sample = () => {
    const ps = allProcs().filter((p) => isOurs(p));
    let rss = 0, pss = 0, fds = 0, ino = 0, wd = 0;
    for (const p of ps) {
      const m = memOf(p.pid); rss += m.rss; pss += m.pss;
      const f = fdOf(p.pid); fds += f.fds; ino += f.ino; wd += f.wd;
    }
    return { procs: ps.length, rssMB: +(rss / 1024).toFixed(1), pssMB: +(pss / 1024).toFixed(1), fds, inotify: ino, watches: wd };
  };

  const KS = [1, 4, 12];
  const rows = [];
  const fails = [];
  const t0 = Date.now();
  for (let i = 0; i < Math.max(...KS); i++) {
    const { env } = envFor(`bk-2222${String(i).padStart(4, '0')}`);
    const r = open(env, 'https://example.com');
    if (r.status !== 0) fails.push({ i, status: r.status, err: String(r.stderr || '').slice(0, 160) });
    const k = i + 1;
    if (KS.includes(k)) {
      const s = sample(); s.k = k; s.elapsedS = Math.round((Date.now() - t0) / 1000); rows.push(s);
    }
  }
  const k1 = rows.find((r) => r.k === 1);
  // A ZERO THAT COMES FROM DOING NO WORK PROVES NOTHING: round 1 of this
  // measurement grepped for the session tag, which chromium's cmdline never
  // carries (variant D's dir is a random /tmp uuid), found 0 processes and
  // reported a clean sheet.
  ok(fails.length === 0, `all 12 browsers opened (${fails.length} failed${fails.length ? ': ' + JSON.stringify(fails[0]) : ''})`);
  if (ok(!!k1 && k1.procs > 0, `POSITIVE CONTROL: k=1 found ${k1 ? k1.procs : 0} OS processes (a zero here would make every number below meaningless)`)) {
    const box = {
      cpus: os.cpus().length, model: (os.cpus()[0] || {}).model,
      totalMemGB: +(os.totalmem() / 1024 ** 3).toFixed(1), kernel: os.release(),
      inotifyMaxUserInstances: (() => { try { return +fs.readFileSync('/proc/sys/fs/inotify/max_user_instances', 'utf8').trim(); } catch { return null; } })(),
      agentBrowser: INSTALLED, variant: 'D', headed: false, page: 'https://example.com',
    };
    console.log('  · box: ' + JSON.stringify(box));
    for (const r of rows) console.log(`  · k=${r.k}: procs ${r.procs} · RSS ${r.rssMB} MB · PSS ${r.pssMB} MB · fds ${r.fds} · inotify instances ${r.inotify} (${r.watches} watches) · +${r.elapsedS}s`);
    const k12 = rows.find((r) => r.k === 12);
    const perBrowser = (k12.procs - k1.procs) / 11;
    ok(perBrowser >= k1.procs * 0.5,
      `each extra browser really costs a browser (${perBrowser.toFixed(1)} processes each between k=1 and k=12, against ${k1.procs} for the first)`);
    // THE CEILING D13 ASKS ABOUT is inotify INSTANCES against a per-uid limit
    // this box has already hit (122/128 reddened suites once). Reported, not
    // asserted as a bound: what it is HERE is the measurement P0 owes.
    ok(box.inotifyMaxUserInstances === null || k12.inotify <= box.inotifyMaxUserInstances,
      `k=12 holds ${k12.inotify} inotify instance(s) against this uid's limit of ${box.inotifyMaxUserInstances}`);
  }
}

// ═══ ⓒ END TO END: does the environment reach a REAL spawned session? ══════
// The two legs above prove the resolver's environment isolates two browsers.
// This one proves the PRODUCT puts that environment into a session at all —
// read off `/proc/<pid>/environ` of the process the server actually spawned,
// because a composition that never reaches the spawn is a feature nobody has
// (this repo's own recurring "unstaged wiring" / "lost export" class). It also
// carries an AMBIENT `AGENT_BROWSER_PROFILE` into the server's own env, which
// must NOT come out the other side.
console.log('\nⓒ two real sessions on a real server (the exit criterion)');
{
  const { WebSocket } = await import('ws');
  const { spawn, execFileSync } = await import('node:child_process');
  const net = await import('node:net');
  const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const wt = path.join(ROOT, 'wt');
  const freePort = () => new Promise((res, rej) => { const sv = net.createServer(); sv.once('error', rej); sv.listen(0, '127.0.0.1', () => { const pp = sv.address().port; sv.close(() => res(pp)); }); });
  const PORT = await freePort();
  let srv = null;
  // THE SUITE OWNS WHAT ITS SERVER STARTED (2026-09-25): the two shell sessions run under dtach, DETACHED by
  // design, with the real HOME and cwd /tmp — killing the server ended none of them (140 dtach + pty-wrapper + zsh
  // from 20 runs were alive). Every process rooted in the worktree goes with the server, BEFORE the worktree does.
  const killSrv = () => {
    try { srv?.kill('SIGKILL'); } catch { }
    try { endRootedProcesses(wt); } catch { }
    try { execFileSync('git', ['-C', repo, 'worktree', 'remove', '--force', wt], { stdio: 'ignore' }); } catch { }
  };
  try {
    execFileSync('git', ['-C', repo, 'worktree', 'add', '--detach', wt, 'HEAD'], { stdio: 'ignore' });
    // Overlay the WORKING TREE (a worktree checks out HEAD, so a pre-commit run
    // would otherwise smoke the PREVIOUS release). data/ stays the worktree's
    // own empty dir — the #127 isolation is the whole point.
    for (const f of ['src', 'public', 'server.js', 'package.json']) {
      execFileSync('rm', ['-rf', path.join(wt, f)]);
      execFileSync('cp', ['-r', path.join(repo, f), path.join(wt, f)]);
    }
    fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
    process.on('exit', killSrv);
    srv = spawn('node', ['server.js'], {
      cwd: wt,
      env: {
        ...process.env, ...VNC_ENV, PORT: String(PORT), VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '',
        AGENT_BROWSER_PROFILE: '/tmp/ambient-should-never-appear',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let boot = '';
    await new Promise((res, rej) => {
      srv.stdout.on('data', (d) => { boot += d; if (boot.includes('Ready.')) res(); });
      srv.stderr.on('data', (d) => { boot += d; });
      setTimeout(() => rej(new Error('boot timeout\n' + boot.slice(-800))), 40000);
    });
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
    await new Promise((r) => ws.on('open', r));
    const msgs = []; ws.on('message', (d) => { try { msgs.push(JSON.parse(d)); } catch { } });
    for (const r of ['e1', 'e2']) ws.send(JSON.stringify({ type: 'create', backend: 'shell', mode: 'terminal', cwd: '/tmp', cols: 80, rows: 24, reqId: r }));
    await new Promise((res, rej) => {
      const t = setInterval(() => { if (msgs.filter((m) => m.type === 'created').length >= 2) { clearInterval(t); res(); } }, 200);
      setTimeout(() => { clearInterval(t); rej(new Error('no created replies: ' + JSON.stringify(msgs.map((m) => m.type)))); }, 25000);
    });
    const sids = msgs.filter((m) => m.type === 'created').map((m) => m.sessionId);
    ok(sids.length === 2, `two real sessions created (${sids.join(', ')})`);
    const envOf = (sid) => {
      for (const d of fs.readdirSync('/proc')) {
        if (!/^\d+$/.test(d)) continue;
        let e; try { e = fs.readFileSync(`/proc/${d}/environ`, 'utf8'); } catch { continue; }
        if (!e.includes(`CLAUDE_WEBUI_SESSION_ID=${sid}`)) continue;
        const m = Object.fromEntries(e.split('\0').filter(Boolean).map((kv) => { const i = kv.indexOf('='); return [kv.slice(0, i), kv.slice(i + 1)]; }));
        if (m.AGENT_BROWSER_SESSION || m.SHELL || m.PWD) return m;
      }
      return null;
    };
    await new Promise((r) => setTimeout(r, 3000));
    const e1 = envOf(sids[0]), e2 = envOf(sids[1]);
    if (ok(!!e1 && !!e2, 'both spawned processes are readable in /proc (the control: we are reading the real thing)')) {
      ok(/^vs-bk-[0-9a-f]{8}$/.test(e1.AGENT_BROWSER_SESSION || ''), `session 1 really got AGENT_BROWSER_SESSION=${e1.AGENT_BROWSER_SESSION}`);
      ok(e1.AGENT_BROWSER_NAMESPACE === e1.AGENT_BROWSER_SESSION, 'and the matching namespace (§3.2.4: context AND daemon socket)');
      ok(Number(e1.AGENT_BROWSER_IDLE_TIMEOUT_MS) > 0, `and an EXPLICIT idle timeout (${e1.AGENT_BROWSER_IDLE_TIMEOUT_MS} ms)`);
      ok(!!e1.AGENT_BROWSER_CONFIG && fs.existsSync(e1.AGENT_BROWSER_CONFIG), 'and a generated config that EXISTS on disk');
      ok(!('profile' in JSON.parse(fs.readFileSync(e1.AGENT_BROWSER_CONFIG, 'utf8'))), '…with no user-data-dir in it (ephemeral, variant D)');
      ok(e1.AGENT_BROWSER_SESSION !== e2.AGENT_BROWSER_SESSION,
        `THE EXIT CRITERION: two live sessions on one instance carry DIFFERENT browsers (${e1.AGENT_BROWSER_SESSION} vs ${e2.AGENT_BROWSER_SESSION})`);
      ok(e1.AGENT_BROWSER_PROFILE === undefined && !String(e1.AGENT_BROWSER_CONFIG).includes('ambient-should-never-appear'),
        'and the AMBIENT AGENT_BROWSER_PROFILE the server itself was launched with did NOT reach the session');
      const metaDir = path.join(wt, 'data', 'session-meta');
      const keys = (fs.existsSync(metaDir) ? fs.readdirSync(metaDir) : []).filter((f) => f.endsWith('.json'))
        .map((f) => { try { return JSON.parse(fs.readFileSync(path.join(metaDir, f), 'utf8')).browserKey; } catch { return null; } })
        .filter(Boolean);
      ok(keys.length === 2 && new Set(keys).size === 2, `both browser keys are RECORDED in session-meta (${keys.join(', ')}) — a resume has something to find`);
      ok(keys.every((k) => `vs-${k}` === e1.AGENT_BROWSER_SESSION || `vs-${k}` === e2.AGENT_BROWSER_SESSION),
        'and the recorded keys are the ones the processes actually got');
    }
    try { ws.close(); } catch { }
  } catch (e) {
    ok(false, 'end-to-end server leg: ' + (e && e.message));
  } finally { killSrv(); }
  // the teardown really ended the server's sessions: nothing rooted in the worktree is alive (dtach, pty-wrapper, the
  // device daemon) — endRootedProcesses with signal 0 only LISTS; a survivor would be the 2026-09-25 leak
  await new Promise((r) => setTimeout(r, 300));
  const left = endRootedProcesses(wt, { signal: 0 });
  ok(left.length === 0, `the teardown ends every process the ⓒ server started — its dtach sessions included (${left.length ? 'alive: ' + left.join(' ') : 'none alive'})`);
}

// ═══ ⓔ THE PROJECT-LEVEL FENCE REACHES THE GENERATED CONFIG (r3) ══════════
// The CLI reads `./agent-browser.json` in the invocation directory at HIGHER
// priority than the user file, and AGENT_BROWSER_CONFIG replaces both. Round 2
// layered only the user file, so a project-level fence was deleted from every
// local session with nothing in the journal. Three arms, one local http server,
// one variable each: ARM A is today (no VibeSpace env, cwd = the project) and
// must be REFUSED; ARM B is the product's resolver at the same cwd and must be
// refused too; the PRE-FIX CONTROL is a patched copy of the real resolver with
// the layering call put back to round 2's user-only read, and it must SUCCEED —
// that success is finding ① for this file.
console.log('\nⓔ a project-level agent-browser.json fence survives the generated config (r3)');
{
  const http = await import('node:http');
  const HOME_E = path.join(HB, 'e'), PROJ_E = path.join(ROOT, 'proj-e'), DATA_E = path.join(ROOT, 'data-e');
  fs.mkdirSync(path.join(HOME_E, '.agent-browser'), { recursive: true }); fs.mkdirSync(PROJ_E, { recursive: true }); fs.mkdirSync(DATA_E, { recursive: true });
  fs.writeFileSync(path.join(HOME_E, '.agent-browser', 'config.json'), JSON.stringify({ args: '--no-sandbox', headed: false }));   // NO fence at user level
  fs.writeFileSync(path.join(PROJ_E, 'agent-browser.json'), JSON.stringify({ allowedDomains: ['example.com'] }));                 // the fence, project level
  const srv = http.createServer((q, s) => s.end('<title>FENCE PROBE PAGE</title><h1>FENCE PROBE PAGE</h1>'));
  await new Promise((res) => srv.listen(0, '127.0.0.1', res));
  const url = `http://127.0.0.1:${srv.address().port}/`;
  const REFUSED = /not in the allowed domains list/;
  const baseEnv = (ns) => ({ PATH: process.env.PATH, HOME: HOME_E, AGENT_BROWSER_SESSION: `${ns}-${TAG}`, AGENT_BROWSER_NAMESPACE: `${ns}-${TAG}`, AGENT_BROWSER_IDLE_TIMEOUT_MS: String(B.DEFAULT_IDLE_TIMEOUT_MS) });
  // ASYNC, unlike every other spawn in this file: the probe page is served by
  // THIS process, and a spawnSync would block the loop the server needs to
  // answer — the refused arms never reach the network, so only the control
  // (which does) would time out on Page.navigate and look like a pass-by-error.
  const { execFile } = await import('node:child_process');
  const openAt = (env) => new Promise((res) => {
    const before = new Set(allProcs().map((p) => p.pid));
    execFile('agent-browser', ['open', url], { env, encoding: 'utf8', timeout: 120000, cwd: PROJ_E }, (err, so, se) => { learnDirs(before); res(String(so || '') + String(se || '')); });
  });
  // ARM A — today
  const a = await openAt(baseEnv('vs-arm-a'));
  ok(REFUSED.test(a), `ARM A (today, no VibeSpace env, cwd = the project): the project fence REFUSES the navigation — "${a.trim().split('\n').pop().slice(0, 90)}"`);
  // ARM B — the product's resolver, handed the session's cwd
  const withPairs = (env, pairs) => { const e = { ...env }; for (const p of pairs) { const i = p.indexOf('='); const k = p.slice(0, i); if (k === 'AGENT_BROWSER_SESSION' || k === 'AGENT_BROWSER_NAMESPACE') continue; e[k] = p.slice(i + 1); } return e; };
  const resE = BE.create({ dataDir: DATA_E, homeDir: HOME_E, socketDirBase: path.join(HB, 'sb'), log: { warn() { }, log() { } } });
  const rb = resE.envFor({ browserKey: 'bk-e0e0e001', integrationOn: true, cwd: PROJ_E });
  ok(rb.variant === 'D' && rb.projectConfig && rb.projectConfig.path === path.join(PROJ_E, 'agent-browser.json'), 'setup: the resolver landed on D and reports the project file it layered');
  const b = await openAt(withPairs(baseEnv('vs-arm-b'), rb.pairs));
  ok(REFUSED.test(b), `ARM B (the product resolver at the same cwd): STILL refused — the fence rode into the generated config — "${b.trim().split('\n').pop().slice(0, 90)}"`);
  // PRE-FIX CONTROL — round 2's resolver, one replacement, same cwd, same files
  const pre = mutantBE([[
    '    const eff = effectiveConfig(cwd);\n    const user = eff.config;',
    '    const eff = { config: userConfig(), user: userConfig(), project: { path: null, keys: [], error: null } };\n    const user = eff.config;',
  ]]);
  if (ok(!pre.err && pre.hits === 1, `PRE-FIX CONTROL: the layering call is exactly ONE site in the real module (the replacement hits once) ${pre.err || ''}`)) {
    const preR = pre.mod.create({ dataDir: path.join(ROOT, 'data-e-pre'), homeDir: HOME_E, socketDirBase: path.join(HB, 'sb'), log: { warn() { }, log() { } } });
    const rp = preR.envFor({ browserKey: 'bk-e0e0e002', integrationOn: true, cwd: PROJ_E });
    const c = await openAt(withPairs(baseEnv('vs-arm-pre'), rp.pairs));
    ok(/FENCE PROBE PAGE/.test(c) && !REFUSED.test(c), `PRE-FIX CONTROL (round 2's user-only layering, same cwd): the navigation SUCCEEDS — the project fence was silently gone — "${c.trim().split('\n').pop().slice(0, 60)}"`);
    ok((rp.dropped || []).length === 0, '…and round 2 reported `dropped: []`, so nothing reached the journal about it');
    spawnSync('agent-browser', ['close', '--all'], { env: withPairs(baseEnv('vs-arm-pre'), rp.pairs), encoding: 'utf8', timeout: 60000 });
  }
  srv.close();
}

// ═══ ⓖ A FENCED CONFIG NEVER LANDS ON C — the binary's verdict (r4) ═════════
// Rung C is `AGENT_BROWSER_PROFILE`, and the CLI refuses `--allowed-domains`
// beside a profile at the argument check. With the generated config unwritable
// (injected at the seam the fast suite uses) round 3 landed on C and every
// command in the fenced session was refused; the product now lands on N and
// the fenced session browses. ONE local http server, the fence naming it.
console.log('\nⓖ a fenced session whose generated config cannot be written (r4)');
{
  const http = await import('node:http');
  const { execFile } = await import('node:child_process');
  const HOME_G = path.join(HB, 'g');
  fs.mkdirSync(path.join(HOME_G, '.agent-browser'), { recursive: true });
  fs.writeFileSync(path.join(HOME_G, '.agent-browser', 'config.json'), JSON.stringify({ args: '--no-sandbox', headed: false, allowedDomains: ['127.0.0.1'] }));
  const srv = http.createServer((q, s) => s.end('<title>FENCE C PROBE</title><h1>FENCE C PROBE</h1>'));
  await new Promise((res) => srv.listen(0, '127.0.0.1', res));
  const url = `http://127.0.0.1:${srv.address().port}/`;
  // The CONFIG cannot be written; the C rung's own `.cwd` record still can —
  // the seam the fast suite plants a directory at, injected here at the writer.
  const injected = (f, o) => { if (f.endsWith('.json')) throw new Error('ENOSPC (injected)'); return BE.writeJsonAtomic(f, o); };
  const envOf = (pairs, tag = true) => {
    const env = { PATH: process.env.PATH, HOME: HOME_G, AGENT_BROWSER_IDLE_TIMEOUT_MS: String(B.DEFAULT_IDLE_TIMEOUT_MS) };
    for (const p of pairs) { const i = p.indexOf('='); env[p.slice(0, i)] = p.slice(i + 1); }
    if (tag && env.AGENT_BROWSER_SESSION) { env.AGENT_BROWSER_SESSION += '-' + TAG; env.AGENT_BROWSER_NAMESPACE += '-' + TAG; }
    return env;
  };
  // async like §ⓔ: the probe page is served by THIS process
  const openWith = (env) => new Promise((res) => {
    const before = new Set(allProcs().map((p) => p.pid));
    execFile('agent-browser', ['open', url], { env, encoding: 'utf8', timeout: 120000 }, (err, so, se) => {
      learnDirs(before);
      spawnSync('agent-browser', ['close', '--all'], { env, encoding: 'utf8', timeout: 60000 });
      res(String(so || '') + String(se || ''));
    });
  });
  const mkG = (mod, name) => mod.create({ dataDir: path.join(ROOT, name), homeDir: HOME_G, env: {}, socketDirBase: path.join(HB, 'sb'), writeJson: injected, log: { warn() { }, log() { } } });
  const rg = mkG(BE, 'data-g').envFor({ browserKey: 'bk-e0e0e0f1', integrationOn: true });
  ok(rg.variant === 'N' && !rg.pairs.some((p) => p.startsWith('AGENT_BROWSER_PROFILE=')), `THE FIX: generated config unwritable + a FENCED config ⇒ variant N, no PROFILE pair (got ${rg.variant})`);
  const g = await openWith(envOf(rg.pairs));
  ok(/FENCE C PROBE/.test(g) && !/not supported with --profile/.test(g), `THE FIX: the fenced session's browser WORKS on rung N — "${g.trim().split('\n').pop().slice(0, 70)}"`);
  // PRE-FIX CONTROL: round 3's resolver — the fence not an input of the C rung
  const pre = mutantBE([['    const fenced = !!fence;', '    const fenced = false;']]);
  if (ok(!pre.err && pre.hits === 1, `PRE-FIX CONTROL is a patched copy of the real module with exactly ONE replacement ${pre.err || ''}`)) {
    const rp = mkG(pre.mod, 'data-g-pre').envFor({ browserKey: 'bk-e0e0e0f2', integrationOn: true });
    ok(rp.variant === 'C' && rp.pairs.some((p) => p.startsWith('AGENT_BROWSER_PROFILE=')), 'PRE-FIX CONTROL: round 3 lands on C and exports AGENT_BROWSER_PROFILE beside the fence');
    const c = await openWith(envOf(rp.pairs));
    ok(/not supported with --profile/.test(c), `PRE-FIX CONTROL: …and the CLI refuses the command — "${c.trim().split('\n').pop().slice(0, 100)}"`);
  }
  // BOUND: the bare CLI on the same HOME works (fenced, so the local page is allowed)
  const b = await openWith(envOf([], false));
  ok(/FENCE C PROBE/.test(b), `BOUND (bare CLI, same HOME): "${b.trim().split('\n').pop().slice(0, 60)}"`);
  srv.close();
}

// ═══ ⓗ A PIN REACHES THE RUNNING BROWSER BY REPLACING IT (r4) ═════════════
// Rounds 1-3 stated, in three source comments, the kb and the route's own
// return value, that a re-point "does NOT reach a browser that is already
// running — it takes effect on the NEXT browser launch". Measured on 0.32.0
// through the shipped resolver, the next COMMAND relaunches chromium onto the
// pinned directory and the live page is gone.
console.log('\nⓗ a mid-task pin: the next command relaunches the browser (r4)');
{
  const HOME_H = path.join(HB, 'p');
  fs.mkdirSync(path.join(HOME_H, '.agent-browser'), { recursive: true });
  fs.writeFileSync(path.join(HOME_H, '.agent-browser', 'config.json'), JSON.stringify({ args: '--no-sandbox', headed: false }));
  const resH = BE.create({ dataDir: path.join(ROOT, 'data-h'), homeDir: HOME_H, env: {}, socketDirBase: path.join(HB, 'sb'), log: { warn() { }, log() { } } });
  const arm = (key, pinTo) => {
    const r = resH.envFor({ browserKey: key, integrationOn: true });
    const env = { PATH: process.env.PATH, HOME: HOME_H };
    for (const p of r.pairs) { const i = p.indexOf('='); env[p.slice(0, i)] = p.slice(i + 1); }
    env.AGENT_BROWSER_SESSION += '-' + TAG; env.AGENT_BROWSER_NAMESPACE += '-' + TAG;
    const ns = env.AGENT_BROWSER_NAMESPACE;
    const before = new Set(allProcs().map((p) => p.pid));
    const opened = ab(env, ['open', 'data:text/html,<title>PIN PROBE PAGE</title><h1>PIN PROBE PAGE</h1>']);
    learnDirs(before);
    const chromeBefore = mainChrome(ns);
    let pr = null, chromeMid = null;
    if (pinTo) { pr = resH.repointPin(key, pinTo); chromeMid = mainChrome(ns); }
    const url = String(ab(env, ['get', 'url']).stdout || '').trim();
    const title = String(ab(env, ['get', 'title']).stdout || '').trim();
    learnDirs(before);
    const chromeAfter = mainChrome(ns);
    ab(env, ['close', '--all']);
    return { variant: r.variant, opened: String(opened.stdout || ''), chromeBefore, pr, chromeMid, url, title, chromeAfter };
  };
  const ctl = arm('bk-e0e0e0a1', null);
  ok(ctl.variant === 'D' && ctl.chromeBefore && ctl.chromeAfter && ctl.chromeBefore.pid === ctl.chromeAfter.pid && /PIN PROBE PAGE/.test(ctl.title),
    `CONTROL (no pin): the next command answers the open page on the SAME chromium (pid ${ctl.chromeBefore && ctl.chromeBefore.pid}, title "${ctl.title}")`);
  const pin = arm('bk-e0e0e0a2', path.join(HOME_H, '.agent-browser', 'vs-bp-pinned'));
  ok(pin.pr && pin.pr.ok && pin.pr.appliesFrom === B.PIN_APPLIES_FROM, 'the pin applied, and its answer names the measured moment');
  ok(pin.chromeMid && pin.chromeBefore && pin.chromeMid.pid === pin.chromeBefore.pid && pin.chromeMid.dir === pin.chromeBefore.dir,
    `right after the pin, with no command sent, the running chromium is UNTOUCHED (pid ${pin.chromeBefore && pin.chromeBefore.pid}, ephemeral dir)`);
  ok(pin.url === 'about:blank' && pin.title === '', `the NEXT command answers about:blank with an empty title — the open page is GONE (url "${pin.url}", title "${pin.title}")`);
  ok(pin.chromeAfter && pin.chromeBefore && pin.chromeAfter.pid !== pin.chromeBefore.pid && pin.chromeAfter.dir === pin.pr.target,
    `…because the CLI RELAUNCHED chromium (pid ${pin.chromeBefore && pin.chromeBefore.pid} → ${pin.chromeAfter && pin.chromeAfter.pid}) onto the pinned directory`);
  ok(!/next browser launch/.test(String(pin.pr && pin.pr.appliesFrom)), 'the retired sentence ("next browser launch, never a running browser") is not what the route returns');
}

// ═══ ⓘ THE HOME 38/39 PAIR: the socket-root remedy on the real binary (r4) ══
// Our names put the daemon socket at |HOME| + 65 bytes under the CLI's own
// root, against a 103-byte cap: 38 fits, 39 does not — and round 3's
// environment failed EVERY command at 39 where the bare CLI's `default` name
// still worked. The product now sets AGENT_BROWSER_SOCKET_DIR at an owned 0700
// directory when, and only when, that root is over the limit. UNTAGGED names
// (the tag would change the byte count under test); ownership is the fixture
// HOME, and the env carries NO XDG_RUNTIME_DIR (a bare ssh login's shape).
console.log('\nⓘ HOME 38 vs 39: the fifth variable launches where round 3 was refused (r4)');
{
  const uid = process.getuid();
  const H38 = path.join(HB, 'a'.repeat(38 - HB.length - 1));
  const H39 = H38 + 'b';
  for (const h of [H38, H39]) { fs.mkdirSync(path.join(h, '.agent-browser'), { recursive: true }); fs.writeFileSync(path.join(h, '.agent-browser', 'config.json'), JSON.stringify({ args: '--no-sandbox', headed: false })); }
  ok(H38.length === 38 && H39.length === 39, `setup: HOME lengths ${H38.length} and ${H39.length}`);
  const base = path.join(HB, 'sb');
  const sdir = path.join(base, `vs-ab-${uid}`);
  const mkR = (home) => BE.create({ dataDir: path.join(ROOT, 'data-i-' + home.length), homeDir: home, env: {}, socketDirBase: base, log: { warn() { }, log() { } } });
  const envOf = (home, pairs, drop = []) => {
    const env = { PATH: process.env.PATH, HOME: home, AGENT_BROWSER_IDLE_TIMEOUT_MS: String(B.DEFAULT_IDLE_TIMEOUT_MS) };
    for (const p of pairs) { const i = p.indexOf('='); env[p.slice(0, i)] = p.slice(i + 1); }
    for (const k of drop) delete env[k];
    return env;
  };
  const tabList = (env) => { const before = new Set(allProcs().map((p) => p.pid)); const r = spawnSync('agent-browser', ['tab', 'list'], { env, encoding: 'utf8', timeout: 90000 }); learnDirs(before); return { status: r.status, out: (String(r.stdout || '') + String(r.stderr || '')).trim() }; };
  const closeAll = (env) => spawnSync('agent-browser', ['close', '--all'], { env, encoding: 'utf8', timeout: 60000 });
  const r38 = mkR(H38).envFor({ browserKey: 'bk-e0e0e0b1', integrationOn: true });
  ok(r38.variant === 'D' && !r38.pairs.some((p) => p.startsWith('AGENT_BROWSER_SOCKET_DIR=')), 'a 38-char HOME gets four pairs — the CLI\'s own root fits at exactly 103 bytes');
  const e38 = envOf(H38, r38.pairs);
  const t38 = tabList(e38);
  ok(t38.status === 0 && /\[t1\]/.test(t38.out), `HOME 38: \`tab list\` launches and answers (${t38.out.split('\n').pop().slice(0, 50)})`);
  closeAll(e38);
  const r39 = mkR(H39).envFor({ browserKey: 'bk-e0e0e0b2', integrationOn: true });
  const p39 = Object.fromEntries(r39.pairs.map((p) => [p.slice(0, p.indexOf('=')), p.slice(p.indexOf('=') + 1)]));
  ok(p39.AGENT_BROWSER_SOCKET_DIR === sdir && r39.socket && r39.socket.bytes === 104, `a 39-char HOME gets the FIFTH pair (the CLI's own root would be ${r39.socket && r39.socket.bytes} bytes)`);
  const e39 = envOf(H39, r39.pairs);
  const t39 = tabList(e39);
  ok(t39.status === 0 && /\[t1\]/.test(t39.out), `THE FIX: HOME 39 + AGENT_BROWSER_SOCKET_DIR — \`tab list\` launches and answers (${t39.out.split('\n').pop().slice(0, 50)})`);
  let info = null; try { info = JSON.parse(String(spawnSync('agent-browser', ['session', 'info', '--json'], { env: e39, encoding: 'utf8', timeout: 30000 }).stdout || '')).data; } catch { }
  ok(!!info && info.active === true && String(info.socketDir).startsWith(sdir + '/'), `…and its live daemon's socket really sits under our directory (${info && info.socketDir})`);
  closeAll(e39);
  const pre = tabList(envOf(H39, r39.pairs, ['AGENT_BROWSER_SOCKET_DIR']));
  ok(/is too long/.test(pre.out) && /104 bytes \(max 103\)/.test(pre.out), `PRE-FIX CONTROL: the same session WITHOUT the fifth variable is refused at its first command — "${pre.out.split('\n')[0].slice(0, 90)}" (round 3's regression)`);
  const bare = tabList({ PATH: process.env.PATH, HOME: H39, AGENT_BROWSER_IDLE_TIMEOUT_MS: String(B.DEFAULT_IDLE_TIMEOUT_MS) });
  ok(bare.status === 0 && /\[t1\]/.test(bare.out), `BOUND: the bare CLI's \`default\` name still works at 39 (${bare.out.split('\n').pop().slice(0, 50)}) — the shape round 3 regressed from`);
  closeAll({ PATH: process.env.PATH, HOME: H39 });
}

// ═══ ⓕ THE REMOTE RUNG, DRIVEN THROUGH THE REAL COMPOSITION (r3) ═════════
// A remote session's shell line is `buildRemoteExec(...)`; this leg runs that
// exact line under `sh` with a fixture HOME whose config NAMES a profile — the
// shape on which round 2's three-names-alone remote rung was measured to make
// the SECOND browser fail to launch (chromium's ProcessSingleton). The host
// decides its rung inside the line (`browser:` fragment), so two sessions must
// both launch on two per-key directories; round 2's line (no fragment) is the
// pre-fix control and must reproduce the collision; today's shape (no VibeSpace
// env at all) is the bound that nothing regresses against.
console.log('\nⓕ two remote-shaped sessions on a host whose config names a profile (r3)');
{
  const { buildRemoteExec } = require('../src/remote-shell.js');
  const shq = (x) => `'${String(x).replace(/'/g, `'"'"'`)}'`;
  const HOME_F = path.join(HB, 'f'), PROJ_F = path.join(ROOT, 'proj-f');
  fs.mkdirSync(path.join(HOME_F, '.agent-browser'), { recursive: true }); fs.mkdirSync(PROJ_F, { recursive: true });
  const hostCfg = (o) => fs.writeFileSync(path.join(HOME_F, '.agent-browser', 'config.json'), JSON.stringify(o));
  hostCfg({ args: '--no-sandbox', headed: false, profile: path.join(HOME_F, 'shared-profile') });
  const page = (t) => `data:text/html,<title>${t}</title>`;
  const resF = BE.create({ dataDir: path.join(ROOT, 'data-f'), homeDir: HOME_F, socketDirBase: path.join(HB, 'sb'), log: { warn() { }, log() { } } });
  const lineFor = (key, url, { fragment = true } = {}) => {
    const r = resF.envFor({ browserKey: key, integrationOn: true, remote: true });
    const pairs = r.pairs.map((p) => (p.startsWith('AGENT_BROWSER_SESSION=') || p.startsWith('AGENT_BROWSER_NAMESPACE=')) ? `${p}-${TAG}` : p);
    return { line: buildRemoteExec({ cwd: PROJ_F, shq, browser: fragment ? r.remotePrelude : '', parts: [...pairs.map(shq), 'agent-browser', shq('open'), shq(url)] }), pairs, variant: r.variant, prelude: r.remotePrelude };
  };
  const runLine = (line) => { const before = new Set(allProcs().map((p) => p.pid)); const r = spawnSync('sh', ['-c', line], { env: { PATH: process.env.PATH, HOME: HOME_F }, encoding: 'utf8', timeout: 120000 }); learnDirs(before); return { out: (String(r.stdout || '') + String(r.stderr || '')).trim(), status: r.status }; };
  const closeAll = (pairs) => { const env = { PATH: process.env.PATH, HOME: HOME_F }; for (const p of pairs) { const i = p.indexOf('='); env[p.slice(0, i)] = p.slice(i + 1); } spawnSync('agent-browser', ['close', '--all'], { env, encoding: 'utf8', timeout: 60000 }); };
  const KA = 'bk-f0f0f0a1', KB = 'bk-f0f0f0b2';
  const A = lineFor(KA, page('REMOTE-A')), Bl = lineFor(KB, page('REMOTE-B'));
  ok(A.variant === 'H' && A.prelude.includes('AGENT_BROWSER_PROFILE=') && /-name 'vs-bk-\*'/.test(A.line), 'setup: the resolver answered H and the real composition carries the host-decision fragment');
  const OWNEDbefore = new Set(OWNED);
  const ra = runLine(A.line), rbb = runLine(Bl.line);
  ok(ra.status === 0 && /REMOTE-A/.test(ra.out), `THE FIX: session A launches (${ra.out.split('\n').pop().slice(0, 80)})`);
  ok(rbb.status === 0 && /REMOTE-B/.test(rbb.out) && !/SingletonLock/.test(rbb.out), `THE FIX: session B launches TOO on the same profile-naming host (${rbb.out.split('\n').pop().slice(0, 80)})`);
  const newDirs = [...OWNED].filter((d) => !OWNEDbefore.has(d));
  const scratch = path.join(HOME_F, '.vibespace', 'browser-profiles');
  ok(newDirs.length === 2 && newDirs.every((d) => d.startsWith(scratch + '/vs-bk-')),
    `both chromiums resolved a PER-KEY dir under ~/.vibespace/browser-profiles (${newDirs.map((d) => path.basename(d)).join(', ')}) — rung C, decided on the "host"`);
  ok(fs.existsSync(path.join(scratch, 'vs-' + KA)) && fs.existsSync(path.join(scratch, 'vs-' + KB)), 'and the CLI created those directories itself (nothing of ours pre-created them)');
  const lockA = path.join(scratch, 'vs-' + KA, 'SingletonLock');
  ok(fs.lstatSync(lockA).isSymbolicLink() && !fs.existsSync(lockA), 'while a browser runs its SingletonLock is a DANGLING symlink — the shape the sweep tests with -L');
  closeAll(A.pairs); closeAll(Bl.pairs);
  // PRE-FIX CONTROL — round 2's line: the same composition with no fragment
  const A0 = lineFor('bk-f0f0f0c3', page('R2-A'), { fragment: false }), B0 = lineFor('bk-f0f0f0d4', page('R2-B'), { fragment: false });
  ok(!A0.line.includes('AGENT_BROWSER_PROFILE') && A0.line.includes('AGENT_BROWSER_NAMESPACE='), 'PRE-FIX CONTROL: round 2\'s line — the three names, no host decision');
  const c1 = runLine(A0.line), c2 = runLine(B0.line);
  ok(c1.status === 0 && /R2-A/.test(c1.out), `PRE-FIX CONTROL: the first session launches (${c1.out.split('\n').pop().slice(0, 60)})`);
  ok(c2.status !== 0 && /SingletonLock|ProcessSingleton|exited early/.test(c2.out),
    `PRE-FIX CONTROL: the SECOND fails to launch — ${(c2.out.match(/SingletonLock[^\n]{0,60}|ProcessSingleton[^\n]{0,40}/) || ['<no singleton error>'])[0]}`);
  closeAll(A0.pairs); closeAll(B0.pairs);
  // TODAY'S SHAPE — no VibeSpace env at all: both launch in one shared daemon
  const today = (t) => runLine(`cd ${shq(PROJ_F)}; exec env ${shq('AGENT_BROWSER_NAMESPACE=vs-ctl2-' + TAG)} ${shq('AGENT_BROWSER_IDLE_TIMEOUT_MS=' + B.DEFAULT_IDLE_TIMEOUT_MS)} agent-browser open ${shq(page(t))}`);
  const t1 = today('TODAY-1'), t2 = today('TODAY-2');
  ok(t1.status === 0 && t2.status === 0, 'BOUND (today): with no per-session names both invocations succeed — the shared daemon, the shape round 2 regressed from');
  closeAll(['AGENT_BROWSER_NAMESPACE=vs-ctl2-' + TAG]);
  // BOUND — a host that names NO profile: the fragment exports nothing, both launch ephemeral
  hostCfg({ args: '--no-sandbox', headed: false });
  const N1 = lineFor('bk-f0f0f0e5', page('NOPROF-1')), N2 = lineFor('bk-f0f0f0e6', page('NOPROF-2'));
  const ownedN = new Set(OWNED);
  const n1 = runLine(N1.line), n2 = runLine(N2.line);
  const ephemeral = [...OWNED].filter((d) => !ownedN.has(d));
  ok(n1.status === 0 && n2.status === 0 && ephemeral.length === 2 && ephemeral.every((d) => !d.startsWith(scratch)),
    `BOUND (no profile named): the fragment exports nothing and both browsers launch on the CLI's own ephemeral dirs (${ephemeral.map((d) => d.replace(/^\/tmp\//, '').slice(0, 28)).join(', ')})`);
  closeAll(N1.pairs); closeAll(N2.pairs);
}

// ═══ ⓓ THE SUITE REAPS WHAT IT STARTED (r2) ════════════════════════════════
// Round 1's closing line CLAIMED this and could not check it: ownership matched
// a cmdline, and a daemon's cmdline is the bare binary path. This leg asserts
// the CONSEQUENCE, with the retired rule beside it as a live control — so the
// day the cmdline test alone would suffice, the positive control goes red and
// says so rather than quietly passing.
console.log('\nⓓ ownership: this suite reaps every process it started');
{
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const before = allProcs().filter((p) => isOurs(p));
  const blindToCmdline = before.filter((p) => !cmdlineOurs(p.s) && envNamesTag(p.e));
  ok(before.length > 0, `POSITIVE CONTROL: ${before.length} process(es) of ours are alive to reap (a zero here would make the assert below vacuous)`);
  ok(blindToCmdline.length > 0,
    `NEGATIVE CONTROL: ${blindToCmdline.length} of them are INVISIBLE to round 1's cmdline-only rule — e.g. pid ${blindToCmdline[0]?.pid} `
    + `whose cmdline is "${(blindToCmdline[0]?.s || '').trim().slice(-46)}" and whose identity is only in its environ`);
  // Every daemon we start carries a bound, so even a reap we never reach expires.
  const IDLE = 'AGENT_BROWSER_IDLE_TIMEOUT_MS=';
  const boundOf = (e) => {
    for (const kv of e.split('\0')) if (kv.startsWith(IDLE)) return Number(kv.slice(IDLE.length));
    return null;
  };
  const noBound = before.filter((p) => envNamesTag(p.e) && !(boundOf(p.e) > 0));
  ok(noBound.length === 0,
    `every process this suite started carries a POSITIVE AGENT_BROWSER_IDLE_TIMEOUT_MS (${noBound.length} without one`
    + `${noBound.length ? ': pid ' + noBound.map((p) => p.pid).join(',') : ''}) — a missed reap expires instead of living for ever`);

  const nsBefore = strayNamespaceDirs();
  ok(nsBefore.length > 0, `POSITIVE CONTROL: ${nsBefore.length} socket-dir entr(ies) of ours exist to sweep, ${nsBefore.filter((f) => f.includes('/namespaces/')).length} of them under namespaces/ (round 1 read only the top level)`);

  const killed = reap();
  let left = [];
  for (let i = 0; i < 6; i++) { await sleep(500); left = allProcs().filter((p) => isOurs(p)); if (!left.length) break; }
  ok(left.length === 0,
    `after the reap, NO process whose cmdline OR environ names ${TAG} survives (killed ${killed}${left.length ? '; survivors ' + left.map((p) => p.pid).join(',') : ''})`);
  const nsLeft = strayNamespaceDirs();
  ok(nsLeft.length === 0, `and no socket-dir entry of ours survives either (${nsLeft.length ? nsLeft.join(', ') : 'none'})`);
}

clearTimeout(WATCHDOG);

// ── ⓙ THE TREE IS NEVER WRITTEN (B-0220 generalized, batch r1) ──
// Measured HERE, while every patched copy this run made still exists (the exit
// handlers remove them — a census taken after exit passes on the pre-fix
// placement too). The copies used to be SIBLINGS inside src/ (gitignored, so
// a plain `git status` never saw them) and any suite scanning src/ beside this
// one counted them as product code; they are written to this process's scratch
// dir now (scripts/mutant-copy.mjs).
console.log('\nⓙ the patched copies never touch the tree');
for (const r of copiesCensus(MUTBR.files, MUTBR.dir, REPO_DIR, { minCopies: 2 })) ok(r.pass, 'ⓙ ' + r.name + (r.pass ? '' : ' — ' + r.detail));

console.log(`\n  · reaped ${reap()} further process(es) this suite started`);
done();
