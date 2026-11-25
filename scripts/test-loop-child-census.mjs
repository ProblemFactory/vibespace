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
import './scratch.mjs';
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
    ['src/claude-oat-probe.js', 'measure > filesUnder > walk', 'walk', 1, OFF, 'the forked measurement child (row B-437e U0): the count of the checkpoint files under the checkpoint pair\'s scratch home, bounded (200 names, 6 deep)'],
    ['src/safe-fs-worker.js', 'contextFiles > walk', 'walk', 1, DEBT, 'per act — a context listing; a WORKER thread only since B-3b03 (SafeFs.call never runs it on the main thread — with no live worker it refuses by name); still a row here: OFF is another PROCESS'],
    ['src/safe-fs-worker.js', 'stageCopy', 'walk', 1, DEBT, 'per act — a copy or move across devices: every file of its partial synced before its rename (B-ddf3 unit 3, lane bl-vault, r4361); a WORKER thread only since B-3b03 (never the main thread); still a row here: OFF is another PROCESS'],
    ['src/safe-fs-worker.js', 'folderCensus > walk', 'walk', 1, DEBT, 'per act — a folder census; a WORKER thread only since B-3b03 (never the main thread); still a row here: OFF is another PROCESS'],
    ['src/proc-identity.js', 'psOf', 'child:spawnSync', 1, FALLBACK, 'NO-/proc fallback only (macOS / BSD): /proc is the rung above it (test-architecture\'s process-table allowlist)'],
    ['src/proc-identity.js', 'startToken', 'child:spawnSync', 1, FALLBACK, 'B-f64b: NO-/proc fallback only (macOS / BSD) — where /proc exists an unreadable stat is gone, no ps (it had no timeout): per spawn on the device agent, the chat wrapper\'s child birth at its spawn (B-5ee1) and opencode-serve\'s spawn tick / tokenVerdict only there — NEVER on the hub\'s boot restore (B-03af round w57qbqw4n: birthReading checks the procfs first and starts no program; the wrapper takes no birth of its own without one)'],
    ['src/discovery-facts.js', 'listOpenRolloutPathsViaLsof', 'child:spawnSync', 1, FALLBACK, 'NO-/proc fallback only (macOS / BSD codex liveness), ONE per scan'],
    ['src/cli-identity.js', 'readPsIdentity', 'child-ref:execFileSync', 1, FALLBACK, 'the default of its `execImpl` (a suite injects one): `ps -p <pid> -o uid=,args=` only where there is NO /proc (macOS / BSD) — B-f64b: on Linux an exited pid is gone, no ps; its hub callers (opencode-serve\'s identity reads through procCmdline / procUid) get null where /proc exists, memoised 1 s'],
    ['src/cli-identity.js', 'procArgv', 'child-ref:execFileSync', 1, FALLBACK, 'B-f64b: the default of its `execImpl` (a suite injects one): `ps -p <pid> -o args=` only where there is NO /proc (macOS / BSD) — on Linux a pid /proc cannot read is gone, no second program (the boot\'s walk held 33 s on one ps per exited pid)'],
    ['src/cli-identity.js', 'parentIndex', 'child-ref:execFileSync', 1, FALLBACK, 'the default of its `execImpl`: ONE `ps -eo pid=,ppid=` per sweep for the whole table — NO-/proc fallback only'],
    ['src/usage-routes.js', '_readOAuthCreds', 'child:execFileSync', 1, FALLBACK, 'macOS only (the keychain\'s `security`): never runs on Linux; module scope since r2575 (the machine login\'s kept read), never on its past-life pass'],
    // DEBT — on the hub's loop; the conversions follow in this order (主开发 23:0xZ): timer / boot / per spawn-attach first, then a person's act
    ['src/usage-walker.js', 'walkSteps', 'walk', 1, DEBT, 'timer — the usage walk\'s poll on the hub\'s thread (usage-history runUsageWalk; the daemon runs it in its own process)'],
    ['src/task-groups.js', 'TaskGroupManager._listContextFiles > walk', 'walk', 1, DEBT, 'per prompt — for every belonged group (contextDirSignature, a 4 s cache) and per context listing'],
    ['src/usage-history.js', 'UsageHistory._loadSteps', 'walk', 1, DEBT, 'boot — stepped (it yields the loop each slice) + a shard rebuild; the usage-ledger-walk lane\'s ground'],
    ['src/node-runtime.js', 'reexecOnOwnRuntime', 'child:execFileSync', 1, DEBT, 'boot — server.js\'s first line: a node probe, 10 s timeout'],
    ['src/server/cli-env.js', 'create', 'child:execFileSync', 1, DEBT, 'boot — module load: `claude --help`, 5 s timeout'],
    ['src/server/cli-env.js', 'create > detectXDisplay', 'child:execFileSync', 1, DEBT, 'boot + per refreshXEnv — `xset q` per display × xauth candidate'],
    ['src/server/cli-env.js', 'create > stabilizeXAuth', 'child:execFileSync', 2, DEBT, 'boot + per refreshXEnv — xauth merge + xset q'],
    ['src/server/cli-cmd.js', 'resolveCmd', 'child:execFileSync', 1, DEBT, 'boot — module constants (dtach, xset, xauth) + per refreshXEnv: /usr/bin/which, 2 s'],
    ['src/codex-fork-ledger-purge.js', 'purgeCodexForkReplays', 'walk', 1, DEBT, 'boot, once — a migration (the run-at-most-once ledger)'],
    ['src/server/migrations.js', 'create > removeDesignKit > walk', 'walk', 1, DEBT, 'boot, once — a migration (the run-at-most-once ledger)'],
    ['src/routes/files.js', 'route:POST /api/format > tryFormat', 'child:execFileSync', 1, DEBT, 'per act — format a file (prettier / ruff …)'],
    ['src/transcript-service.js', 'createTranscriptService > rescue', 'child:execFileSync', 1, DEBT, 'per act — a transcript rescue (fuser), 3 s'],
    ['src/hosts.js', 'HostManager.installAgentTools', 'child:execFileSync', 1, DEBT, 'per act — a machine\'s tool install (tar, 15 s)'],
    // round 2 — the four walks the census SEES now (the iterative shape)
    ['src/agentd/agentd.js', 'du', 'walk', 1, OFF, 'the device agent — its OWN process (agentd), never the hub\'s loop'],
    ['src/adapters/codex.js', '_walkJsonlFiles', 'walk', 1, DEBT, 'per find — a codex session\'s rollout lookup (findCodexSessionJsonlPath: an open, a resume, a transcript read) walks the WHOLE sessions tree; since B-a60e once per thread while its LOCAL rollout stays where it was found (the path kept, asked again by an existsSync; a .jsonl.zst walked again after a minute) — a thread with no local rollout yet, or one found in the remote cache, is walked at each find'],
    ['src/server/browser-builds-keeper.js', 'create > treeOf', 'walk', 1, DEBT, 'per second while a build downloads — the builds picker reads its facts every second during a download (each build\'s size, up to 20 000 entries, an lstat each) — and per act (a picker read, an unpacked download\'s file count)'],
    ['src/usage-routes.js', 'setupUsage > listRecentCodexJsonlFiles', 'walk', 1, DEBT, 'per GET /api/usage — the usage snapshot\'s refresh (about every 30 s while a page shows it), pruned to 14 days of date dirs'],
    // lane job-logs-sweep (.398): the job-logs remover's CHILD — never the hub's process, never its loop
    ['src/job-logs-sweep-worker.js', 'parentOf', 'child:spawnSync', 1, OFF, 'the job-logs remover\'s CHILD process (never the hub\'s; B-323e): on a machine with no /proc (macOS) its parent\'s parent by `ps -o ppid=`, ONCE per batch at its start, bounded 3 s'],
    ['src/job-logs-sweep-worker.js', 'scan', 'walk', 1, OFF, 'the job-logs remover\'s CHILD process (src/job-logs-sweep.js createRemover starts it through the starter, ONE batch a child — B-323e; the file throws without --once, so it never runs in the hub\'s process): scan walks ONE run dir under data/job-logs (lstat only, a link never followed) to age it — bounded by the batch timeout (120 s, then the child is SIGKILLed and the hub starts no second one beside it) and by the pass (at most 500 run dirs)'],
  ];
  // THE RATCHET: the debt rows only SHRINK — a conversion deletes its row and lowers this number in the same commit. Round 2: 22 → 28
  // — NOT six new holds: the census now SEES three walks it missed (the iterative shape: codex, the builds picker, usage) and its
  // rows tell the truth on every road (safe-fs's inline road ×2, startToken's unbounded ps on Linux for an exited pid)
  const DEBT_MAX = 19;   // B-ddf3 unit 3 (lane bl-vault, r4361): 18 → 19 — the staged copy's walk (a person's copied tree, each file synced before its rename) on the SafeFs WORKER thread, never the main thread; the census counts a worker's walk as debt (OFF is another process). B-360d part 1 (lane bl-loop-a, 主开发 r2303): the fonts list's fc-list and the version's git run through the hub's starter — 21 → 19. lane lg-recovery (主开发 r2374): the live helper watcher's walk paid (its finder through the hub's one shared listing, off the loop) — 21 → 20; B-323e (lane bl-keys-misc, r1351): vnc's `which` (asynchronous through the starter now) and installAgentd's tar (asynchronous) paid — 23 → 21; r1066 (lane bl-proposals, B-323e's family): the paste route's clipboard poll (xclip TARGETS, every 200 ms for up to 5 s) and macOS's osascript write run through the hub's starter — src/routes/files.js's paste starts no synchronous child (24 → 23; the macOS row was a fallback). B-f64b: cli-identity procArgv's and proc-identity startToken's ps per exited pid are no-/proc fallbacks now (28 → 26); B-323e: rcloneAvailable's and _rcloneHasFlag's execFileSync gone — src/mounts.js starts no synchronous child (26 → 24)
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
  const OFF_HOMES = /^(?:src\/agentd\/|src\/claude-oat-probe\.js$|src\/job-logs-sweep-worker\.js$)/;   // lane job-logs-sweep: the remover's child (one batch a child through the starter since B-323e; throws without --once)
  const badOff = ROWS.filter((x) => x[4] === OFF && !OFF_HOMES.test(x[0])), badFallback = ROWS.filter((x) => x[4] === FALLBACK && !/\/proc|macOS|BSD|darwin/.test(x[5]));
  ok('every OFF-LOOP row lives in a file that runs outside the hub\'s process (the device agent, its CLI, the forked measurement, the job-logs remover\'s child); every FALLBACK row names its guard (/proc, macOS / BSD)', !badOff.length && !badFallback.length, { badOff: badOff.map((x) => x[0] + '|' + x[1]), badFallback: badFallback.map((x) => x[0] + '|' + x[1]) });
  const debt = ROWS.filter((x) => x[4] === DEBT).length;
  ok(`THE RATCHET: ${debt} debt rows — exactly DEBT_MAX (${DEBT_MAX}); a conversion deletes its row and lowers it, a new hold raises it (which a reviewer refuses)`, debt === DEBT_MAX, { debt, DEBT_MAX });
  // CONTROLS — the same census over planted text (a scratch copy of one file's source; nothing written)
  // B-323e (lane bl-keys-misc, 主开发 r1351): vnc's `which` and the agent bundle's tar are no sync children any more (their rows
  // paid) — the control's rowed scope is the transcript rescue's (the same kind of row)
  const ts1 = fs.readFileSync(path.join(REPO, 'src/transcript-service.js'), 'utf8');
  const c1 = judge(C.census(REPO, { patch: { 'src/transcript-service.js': ts1.replace("require('child_process').execFileSync('fuser', [fp]", "require('child_process').execFileSync('true'); require('child_process').execFileSync('fuser', [fp]") } }));
  const c2 = judge(C.census(REPO, { patch: { 'src/new-walker.js': "const fs = require('fs');\nfunction scan(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) if (e.isDirectory()) scan(d + '/' + e.name); }\nmodule.exports = { scan };\n" } }));
  const c3 = judge(C.census(REPO, { patch: { 'src/new-alias.js': "const { execSync: run } = require('child_process');\nfunction go() { return run('true'); }\nmodule.exports = { go };\n" } }));
  const c4 = judge(C.census(REPO, { patch: { 'src/new-computed.js': "const cp = require('child_process');\nfunction go() { return cp['exec' + 'Sync']('true'); }\nmodule.exports = { go };\n" } }));
  const c5 = judge(C.census(REPO, { patch: { 'src/new-recursive.js': "const fs = require('fs');\nmodule.exports = (d) => fs.readdirSync(d, { recursive: true });\n" } }));
  const c6 = judge(C.census(REPO, { patch: { 'src/new-iter.js': "const fs = require('fs');\nfunction tree(root) { const st = [root]; while (st.length) { const d = st.pop(); for (const e of fs.readdirSync(d, { withFileTypes: true })) if (e.isDirectory()) st.push(d + '/' + e.name); } }\nmodule.exports = { tree };\n" } }));
  const c7 = judge(C.census(REPO, { patch: { 'src/new-renamed.js': "const fsx = require('fs');\nfunction walkx(d) { for (const n of fsx.readdirSync(d)) walkx(d + '/' + n); }\nmodule.exports = { walkx };\n" } }));
  const c8 = judge(C.census(REPO, { patch: { 'src/new-rd.js': "const { readdirSync: rd } = require('fs');\nfunction walkr(d) { for (const n of rd(d)) walkr(d + '/' + n); }\nmodule.exports = { walkr };\n" } }));
  const c9 = judge(C.census(REPO, { patch: { 'src/new-bound.js': "const { execSync: ex2 } = require('child_process');\nconst cp2 = require('child_process');\nfunction b1() { return ex2.call(null, 'true'); }\nfunction b2() { return cp2.execFileSync.apply(cp2, ['true']); }\nmodule.exports = { b1, b2 };\n" } }));
  const offRows = ROWS.map((x) => (x[0] === 'src/transcript-service.js' && x[1] === 'createTranscriptService > rescue' ? [...x.slice(0, 4), OFF, 'a WORKER thread (a 20-character why)'] : x));
  const c10 = offRows.filter((x) => x[4] === OFF && !OFF_HOMES.test(x[0])).map((x) => x[0]);
  ok('CONTROLS (round 2, the shapes followed now): an ITERATIVE stack walk RED; a walk through fs under another name RED; through a destructured readdirSync RED; execSync.call / cp.execFileSync.apply RED (two sites); a hub file\'s DEBT row moved to OFF-LOOP with a short why RED', c6.unrowed.some((u) => /new-iter\.js\|tree\|walk/.test(u)) && c7.unrowed.some((u) => /new-renamed\.js\|walkx\|walk/.test(u)) && c8.unrowed.some((u) => /new-rd\.js\|walkr\|walk/.test(u)) && c9.unrowed.some((u) => /new-bound\.js\|b1\|child:execSync/.test(u)) && c9.unrowed.some((u) => /new-bound\.js\|b2\|child:execFileSync/.test(u)) && c10.includes('src/transcript-service.js'), { c6: c6.unrowed, c7: c7.unrowed, c8: c8.unrowed, c9: c9.unrowed, c10 });
  ok('CONTROLS: one more sync child in a rowed scope moves its count (RED); a new recursive readdirSync walk (RED); a sync child through a destructured alias (RED); a computed call of child_process the scanner cannot follow (RED, unclassified); readdirSync(…, {recursive: true}) (RED)',
    c1.moved.some((m) => /src\/transcript-service\.js\|createTranscriptService > rescue\|child:execFileSync 1 → 2/.test(m)) && c2.unrowed.some((u) => /src\/new-walker\.js\|scan\|walk/.test(u)) && c3.unrowed.some((u) => /src\/new-alias\.js\|go\|child:execSync/.test(u)) && c4.unclassified.length >= 1 && c5.unrowed.some((u) => /src\/new-recursive\.js/.test(u)), { c1: c1.moved, c2: c2.unrowed, c3: c3.unrowed, c4: c4.unclassified, c5: c5.unrowed });
}


console.log(fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
