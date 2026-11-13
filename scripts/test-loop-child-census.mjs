#!/usr/bin/env node
// lane hub-sync-holds — THE LOOP-CHILD CENSUS (scripts/loop-child-census.mjs; the owner's hub, 2026-11-11: each a named hold of
// the main loop). Every synchronous child (execSync / execFileSync / spawnSync — bare, through child_process, or through a
// destructured alias — and a sync child function HANDED ON as a value, whose calls run under another name) and every
// synchronous directory-tree walk in src/ and server.js (tracked files) is a ROW: off the loop or
// a fallback (with its WHY), or DEBT on the hub's loop (with HOW OFTEN it runs) under a ratchet that only shrinks. A new site, a
// moved count, a dead row or a binding the scanner cannot follow is red — never skipped. FAST, pure: reads the tree, runs nothing.
// FOLLOWED since round 2: fs under another name, a destructured readdirSync, a BOUND call (`ex.call(…)`, `cp.execFileSync.apply(…)`)
// and an ITERATIVE walk (a loop that reads a directory and pushes to / pops a stack). NOT FOLLOWED — said, so the next gap is
// named, never assumed covered: a recursive fs.cpSync / fs.rmSync (68 such calls in src/ today, mostly one record's dir — the
// next census, not this one); a walk through a helper defined in ANOTHER file; mutual recursion; a computed require
// (`require('child_' + 'process')`) or process.binding; ESM import forms (src/ is CommonJS); a `recursive:` given by a variable
// or an options object held in a variable.
// NOT SCOPE-AWARE (said): the alias table is per FILE — a destructured alias's name (`const { spawnSync: s } = …`) flags an unrelated
// variable of the same name elsewhere in that file as a site: a FALSE site (a row to argue), never a missed one.
// Run: node scripts/test-loop-child-census.mjs
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 1500) : ''}`); }
};
console.log('the loop-child census — every synchronous child / tree walk in src/ + server.js is a row');
{
  const C = await import(path.join(REPO, 'scripts/loop-child-census.mjs'));
  const OFF = 'off-loop', FALLBACK = 'fallback', DEBT = 'debt';
  // [file, scope, kind, count, class, why (off-loop / fallback) | how often it runs on the hub's loop (debt: timer / boot / per …)]
  const ROWS = [
    ['src/agentd/agentd.js', 'acquireSingleton', 'child:execFileSync', 1, OFF, 'the device agent — its OWN process (agentd), never the hub\'s loop'],
    ['src/agentd/agentd.js', 'computeDiscoverySnapshot > walk', 'walk', 1, OFF, 'the device agent — its OWN process'],
    ['src/agentd/agentd.js', 'open', 'child:spawnSync', 1, OFF, 'the device agent — its OWN process'],
    ['src/agentd/agentd.js', 'psOnceSync', 'child:execFileSync', 1, OFF, 'the device agent — its OWN process'],
    ['src/agentd/setup-mode.js', 'setupNeeds', 'child:spawnSync', 1, OFF, 'lane machine-needs-at-pairing pick 3: the installer\'s one-shot `--setup ffmpeg` (the agent bundle run by the pairing command, its own process) — never the hub\'s loop'],
    ['src/agentd/attach-cli.js', 'main', 'child:execFileSync', 1, OFF, 'the person\'s `vibespace attach` CLI — its own process'],
    ['src/claude-oat-probe.js', 'measure', 'child:execFileSync', 2, OFF, 'the measurement runs only in the FORKED child (the hub requires the module for its constants alone)'],
    ['src/claude-oat-probe.js', 'preflight', 'child:execFileSync', 3, OFF, 'the forked measurement child (preflight runs inside measure)'],
    ['src/claude-oat-probe.js', 'preflight > walk', 'walk', 1, OFF, 'the forked measurement child: the walk of its own new scratch'],
    ['src/safe-fs-worker.js', 'contextFiles > walk', 'walk', 1, DEBT, 'per act — a context listing; a WORKER thread, EXCEPT the inline road: while the safe-fs pool backs off after a worker timeout, SafeFs.call runs it on the MAIN thread (src/safe-fs.js — test-sync-fs-census rows the same site)'],
    ['src/safe-fs-worker.js', 'folderCensus > walk', 'walk', 1, DEBT, 'per act — a folder census; a WORKER thread, EXCEPT the inline road: while the safe-fs pool backs off after a worker timeout, SafeFs.call runs it on the MAIN thread (src/safe-fs.js)'],
    ['src/proc-identity.js', 'psOf', 'child:spawnSync', 1, FALLBACK, 'NO-/proc fallback only (macOS / BSD): /proc is the rung above it (test-architecture\'s process-table allowlist)'],
    ['src/proc-identity.js', 'startToken', 'child:spawnSync', 1, DEBT, 'per spawn — opencode-serve\'s spawn tick — and per verdict on a RECORDED pid (tokenVerdict), whenever /proc/<pid>/stat cannot be read (macOS / BSD, and on Linux an exited pid): ps -o lstart= with NO timeout (named, not bounded here: data/bin/vibespace-remote-keeper carries this code byte for byte — a bound changes both, test-pid-identity)'],
    ['src/discovery-facts.js', 'listOpenRolloutPathsViaLsof', 'child:spawnSync', 1, FALLBACK, 'NO-/proc fallback only (macOS / BSD codex liveness), ONE per scan'],
    ['src/cli-identity.js', 'readPsIdentity', 'child-ref:execFileSync', 1, FALLBACK, 'the default of its `execImpl` (a suite injects one): `ps -p <pid> -o uid=,args=` whenever /proc has no answer — macOS / BSD, and on Linux an EXITED pid; no hub caller of procCmdline / procUid today (the acceptance panel read it), memoised 1 s'],
    ['src/cli-identity.js', 'parentIndex', 'child-ref:execFileSync', 1, FALLBACK, 'the default of its `execImpl`: ONE `ps -eo pid=,ppid=` per sweep for the whole table — NO-/proc fallback only'],
    ['src/usage-routes.js', 'setupUsage > _readOAuthCreds', 'child:execFileSync', 1, FALLBACK, 'macOS only (the keychain\'s `security`): never runs on Linux'],
    ['src/routes/files.js', 'route:POST /api/paste-image', 'child:execFileSync', 1, FALLBACK, 'macOS only (osascript) — a person\'s paste'],
    // DEBT — on the hub's loop; the conversions follow in this order (主开发 23:0xZ): timer / boot / per spawn-attach first, then a person's act
    ['src/usage-walker.js', 'walkSteps', 'walk', 1, DEBT, 'timer — the usage walk\'s poll on the hub\'s thread (usage-history runUsageWalk; the daemon runs it in its own process)'],
    ['src/task-groups.js', 'TaskGroupManager._listContextFiles > walk', 'walk', 1, DEBT, 'per prompt — for every belonged group (contextDirSignature, a 4 s cache) and per context listing'],
    ['src/server/stdout/claude-stream-json.js', 'create > attach > startSubagentWatcher', 'walk', 1, DEBT, 'per attach — each subagent tool use of a live session (its retries re-arm it)'],
    ['src/cli-identity.js', 'procArgv', 'child:execFileSync', 1, DEBT, 'per walk — a machine-wide process walk, per pid whose /proc read failed (an exited pid on Linux too)'],
    ['src/usage-history.js', 'UsageHistory._loadSteps', 'walk', 1, DEBT, 'boot — stepped (it yields the loop each slice) + a shard rebuild; the usage-ledger-walk lane\'s ground'],
    ['src/node-runtime.js', 'reexecOnOwnRuntime', 'child:execFileSync', 1, DEBT, 'boot — server.js\'s first line: a node probe, 10 s timeout'],
    ['src/server/cli-env.js', 'create', 'child:execFileSync', 1, DEBT, 'boot — module load: `claude --help`, 5 s timeout'],
    ['src/server/cli-env.js', 'create > detectXDisplay', 'child:execFileSync', 1, DEBT, 'boot + per refreshXEnv — `xset q` per display × xauth candidate'],
    ['src/server/cli-env.js', 'create > stabilizeXAuth', 'child:execFileSync', 2, DEBT, 'boot + per refreshXEnv — xauth merge + xset q'],
    ['src/server/cli-cmd.js', 'resolveCmd', 'child:execFileSync', 1, DEBT, 'boot — module constants (dtach, xset, xauth) + per refreshXEnv: /usr/bin/which, 2 s'],
    ['src/codex-fork-ledger-purge.js', 'purgeCodexForkReplays', 'walk', 1, DEBT, 'boot, once — a migration (the run-at-most-once ledger)'],
    ['src/server/migrations.js', 'create > removeDesignKit > walk', 'walk', 1, DEBT, 'boot, once — a migration (the run-at-most-once ledger)'],
    ['src/mounts.js', 'MountManager._rcloneHasFlag', 'child:execFileSync', 1, DEBT, 'per mount start (the boot\'s remounts too) — rclone --help, 10 s'],
    ['src/mounts.js', 'MountManager.rcloneAvailable', 'child:execFileSync', 1, DEBT, 'per GET /api/mounts — every mounts-panel read (mounts-plugins-wiring), and the pinned-rclone upgrade check (maybeUpgradePinnedRclone): rclone version, 5 s'],
    ['src/vnc.js', 'which', 'child:execFileSync', 1, DEBT, 'per act — a display start looks up the X server and dbus-launch on PATH, 2 s each'],
    ['src/routes/files.js', 'route:GET /api/fonts', 'child:execFileSync', 1, DEBT, 'per act — the fonts list (fc-list), 3 s'],
    ['src/routes/files.js', 'route:POST /api/format > tryFormat', 'child:execFileSync', 1, DEBT, 'per act — format a file (prettier / ruff …)'],
    ['src/routes/files.js', 'route:POST /api/paste-image > attempt > poll', 'child:execFileSync', 1, DEBT, 'per act — paste an image (xclip TARGETS)'],
    ['src/server/ops-routes.js', 'create > route:GET /api/version', 'child:execFileSync', 1, DEBT, 'per process, ONCE — the first GET /api/version (the commit is memoised): git rev-parse, 3 s'],
    ['src/transcript-service.js', 'createTranscriptService > rescue', 'child:execFileSync', 1, DEBT, 'per act — a transcript rescue (fuser), 3 s'],
    ['src/hosts.js', 'HostManager.installAgentTools', 'child:execFileSync', 1, DEBT, 'per act — a machine\'s tool install (tar, 15 s)'],
    ['src/hosts.js', 'HostManager.installAgentd', 'child:execFileSync', 1, DEBT, 'per act — a device agent install / upgrade (tar, 15 s)'],
    // round 2 — the four walks the census SEES now (the iterative shape)
    ['src/agentd/agentd.js', 'du', 'walk', 1, OFF, 'the device agent — its OWN process (agentd), never the hub\'s loop'],
    ['src/adapters/codex.js', '_walkJsonlFiles', 'walk', 1, DEBT, 'per find — a codex session\'s rollout lookup (findCodexSessionJsonlPath: an open, a resume, a transcript read) walks the WHOLE sessions tree'],
    ['src/server/browser-builds-keeper.js', 'create > treeOf', 'walk', 1, DEBT, 'per second while a build downloads — the builds picker reads its facts every second during a download (each build\'s size, up to 20 000 entries, an lstat each) — and per act (a picker read, an unpacked download\'s file count)'],
    ['src/usage-routes.js', 'setupUsage > listRecentCodexJsonlFiles', 'walk', 1, DEBT, 'per GET /api/usage — the usage snapshot\'s refresh (about every 30 s while a page shows it), pruned to 14 days of date dirs'],
    // lane job-logs-sweep (.398): the job-logs remover's CHILD — never the hub's process, never its loop
    ['src/job-logs-sweep-worker.js', 'scan', 'walk', 1, OFF, 'the job-logs remover\'s CHILD process (src/job-logs-sweep.js createRemover forks it since round 2; the file throws without its IPC channel, so it never runs in the hub\'s process): scan walks ONE run dir under data/job-logs (lstat only, a link never followed) to age it — bounded by the batch timeout (120 s, then the child is SIGKILLed and the hub starts no second one beside it) and by the pass (at most 500 run dirs)'],
  ];
  // THE RATCHET: the debt rows only SHRINK — a conversion deletes its row and lowers this number in the same commit. Round 2: 22 → 28
  // — NOT six new holds: the census now SEES three walks it missed (the iterative shape: codex, the builds picker, usage) and its
  // rows tell the truth on every road (safe-fs's inline road ×2, startToken's unbounded ps on Linux for an exited pid)
  const DEBT_MAX = 28;
  const key = (f, sc, k) => `${f}|${sc}|${k}`;
  const judge = (r) => {
    const by = new Map(); for (const st of r.sites) by.set(key(st.file, st.scope, st.kind), (by.get(key(st.file, st.scope, st.kind)) || 0) + 1);
    const rows = new Map(ROWS.map((x) => [key(x[0], x[1], x[2]), x]));
    return { unrowed: [...by].filter(([k]) => !rows.has(k)).map(([k, n]) => `${k} ×${n}`), moved: [...rows].filter(([k, x]) => by.has(k) && by.get(k) !== x[3]).map(([k, x]) => `${k} ${x[3]} → ${by.get(k)}`), dead: [...rows.keys()].filter((k) => !by.has(k)), unclassified: r.unclassified };
  };
  const now = C.census(REPO);
  const j = judge(now);
  ok(`every one of the ${now.sites.length} sites (${new Set(now.sites.map((x) => key(x.file, x.scope, x.kind))).size} rows) is a row with its exact count; no dead row; nothing the scanner cannot follow`, !j.unrowed.length && !j.moved.length && !j.dead.length && !j.unclassified.length, j);
  ok('every off-loop / fallback row says WHY it never holds the loop; every debt row says HOW OFTEN it runs (timer / boot / per …) — the conversion order is checkable', ROWS.every((x) => [OFF, FALLBACK, DEBT].includes(x[4]) && (x[4] === DEBT ? /^(?:timer|boot|per )/.test(x[5]) : x[5].length >= 20)), ROWS.filter((x) => !(x[4] === DEBT ? /^(?:timer|boot|per )/.test(x[5]) : x[5].length >= 20)));
  // round 2: a class is not free text — OFF only where the code runs OUTSIDE the hub's process (the device agent, its CLI, the
  // forked measurement), a FALLBACK names the guard that keeps it off the hub's road. A DEBT row moved to OFF in a hub file is red.
  const OFF_HOMES = /^(?:src\/agentd\/|src\/claude-oat-probe\.js$|src\/job-logs-sweep-worker\.js$)/;   // lane job-logs-sweep: the remover's child (forked; throws without IPC)
  const badOff = ROWS.filter((x) => x[4] === OFF && !OFF_HOMES.test(x[0])), badFallback = ROWS.filter((x) => x[4] === FALLBACK && !/\/proc|macOS|BSD|darwin/.test(x[5]));
  ok('every OFF-LOOP row lives in a file that runs outside the hub\'s process (the device agent, its CLI, the forked measurement, the job-logs remover\'s child); every FALLBACK row names its guard (/proc, macOS / BSD)', !badOff.length && !badFallback.length, { badOff: badOff.map((x) => x[0] + '|' + x[1]), badFallback: badFallback.map((x) => x[0] + '|' + x[1]) });
  const debt = ROWS.filter((x) => x[4] === DEBT).length;
  ok(`THE RATCHET: ${debt} debt rows — exactly DEBT_MAX (${DEBT_MAX}); a conversion deletes its row and lowers it, a new hold raises it (which a reviewer refuses)`, debt === DEBT_MAX, { debt, DEBT_MAX });
  // CONTROLS — the same census over planted text (a scratch copy of one file's source; nothing written)
  const vnc = fs.readFileSync(path.join(REPO, 'src/vnc.js'), 'utf8');
  const c1 = judge(C.census(REPO, { patch: { 'src/vnc.js': vnc.replace(/function which\(cmd\) \{/, "function which(cmd) { require('child_process').execFileSync('true');") } }));
  const c2 = judge(C.census(REPO, { patch: { 'src/new-walker.js': "const fs = require('fs');\nfunction scan(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) if (e.isDirectory()) scan(d + '/' + e.name); }\nmodule.exports = { scan };\n" } }));
  const c3 = judge(C.census(REPO, { patch: { 'src/new-alias.js': "const { execSync: run } = require('child_process');\nfunction go() { return run('true'); }\nmodule.exports = { go };\n" } }));
  const c4 = judge(C.census(REPO, { patch: { 'src/new-computed.js': "const cp = require('child_process');\nfunction go() { return cp['exec' + 'Sync']('true'); }\nmodule.exports = { go };\n" } }));
  const c5 = judge(C.census(REPO, { patch: { 'src/new-recursive.js': "const fs = require('fs');\nmodule.exports = (d) => fs.readdirSync(d, { recursive: true });\n" } }));
  const c6 = judge(C.census(REPO, { patch: { 'src/new-iter.js': "const fs = require('fs');\nfunction tree(root) { const st = [root]; while (st.length) { const d = st.pop(); for (const e of fs.readdirSync(d, { withFileTypes: true })) if (e.isDirectory()) st.push(d + '/' + e.name); } }\nmodule.exports = { tree };\n" } }));
  const c7 = judge(C.census(REPO, { patch: { 'src/new-renamed.js': "const fsx = require('fs');\nfunction walkx(d) { for (const n of fsx.readdirSync(d)) walkx(d + '/' + n); }\nmodule.exports = { walkx };\n" } }));
  const c8 = judge(C.census(REPO, { patch: { 'src/new-rd.js': "const { readdirSync: rd } = require('fs');\nfunction walkr(d) { for (const n of rd(d)) walkr(d + '/' + n); }\nmodule.exports = { walkr };\n" } }));
  const c9 = judge(C.census(REPO, { patch: { 'src/new-bound.js': "const { execSync: ex2 } = require('child_process');\nconst cp2 = require('child_process');\nfunction b1() { return ex2.call(null, 'true'); }\nfunction b2() { return cp2.execFileSync.apply(cp2, ['true']); }\nmodule.exports = { b1, b2 };\n" } }));
  const offRows = ROWS.map((x) => (x[0] === 'src/vnc.js' && x[1] === 'which' ? [...x.slice(0, 4), OFF, 'a WORKER thread (a 20-character why)'] : x));
  const c10 = offRows.filter((x) => x[4] === OFF && !OFF_HOMES.test(x[0])).map((x) => x[0]);
  ok('CONTROLS (round 2, the shapes followed now): an ITERATIVE stack walk RED; a walk through fs under another name RED; through a destructured readdirSync RED; execSync.call / cp.execFileSync.apply RED (two sites); a hub file\'s DEBT row moved to OFF-LOOP with a short why RED', c6.unrowed.some((u) => /new-iter\.js\|tree\|walk/.test(u)) && c7.unrowed.some((u) => /new-renamed\.js\|walkx\|walk/.test(u)) && c8.unrowed.some((u) => /new-rd\.js\|walkr\|walk/.test(u)) && c9.unrowed.some((u) => /new-bound\.js\|b1\|child:execSync/.test(u)) && c9.unrowed.some((u) => /new-bound\.js\|b2\|child:execFileSync/.test(u)) && c10.includes('src/vnc.js'), { c6: c6.unrowed, c7: c7.unrowed, c8: c8.unrowed, c9: c9.unrowed, c10 });
  ok('CONTROLS: one more sync child in a rowed scope moves its count (RED); a new recursive readdirSync walk (RED); a sync child through a destructured alias (RED); a computed call of child_process the scanner cannot follow (RED, unclassified); readdirSync(…, {recursive: true}) (RED)',
    c1.moved.some((m) => /src\/vnc\.js\|which\|child:execFileSync 1 → 2/.test(m)) && c2.unrowed.some((u) => /src\/new-walker\.js\|scan\|walk/.test(u)) && c3.unrowed.some((u) => /src\/new-alias\.js\|go\|child:execSync/.test(u)) && c4.unclassified.length >= 1 && c5.unrowed.some((u) => /src\/new-recursive\.js/.test(u)), { c1: c1.moved, c2: c2.unrowed, c3: c3.unrowed, c4: c4.unclassified, c5: c5.unrowed });
}


console.log(fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
