#!/usr/bin/env node
// ci-remote.mjs — run (a slice of) the HEAVY tier on a second machine (lane heavy-runner-aidev, 2026-10-13; the
// owner: "你可以先扔到AIDev里跑？那边内存还有不少吧"). An integration splits its affected heavy across the hub and
// the test box: `--shard 1/2` locally (its --list fed to ci.mjs --only), `--shard 2/2` here, both logs in the report.
//
//   node /abs/path/scripts/ci-remote.mjs --host aidev --snapshot <tree> [--range <base>..<head>] [--shard k/n]
//        [--only a,b] [--lanes N] [--log <file>] [--exit <file>] [--keep] [--dirty-ok]
//   node /abs/path/scripts/ci-remote.mjs --snapshot <tree> --range <base>..<head> --shard 1/2 --list
//        ← the slice's names, comma-joined on stdout (the LOCAL half: ci.mjs --heavy --only=$(…))
//
// STANDALONE ON PURPOSE: it is run by absolute path from a tree that may not contain it, against a <tree> that may
// predate it. The selection is the TREE's own ci.mjs (its SUITES, affectedSuites over its git, shardPlan's FNV split,
// previousTimings for longest-first), so the hub's half and this half cut the same list. The box runs the tree's
// ci.mjs with --only=<slice> --sha=<head>: a PARTIAL marker (never the tier's verdict) under its own marker dir.
//
// On the box (provisioned by scripts/ci-remote-provision.sh) everything lives under /var/tmp/vibespace-ci:
//   snap-<sha9>-<k>of<n>/tree   a git worktree of repo/ at the tree's HEAD (its commits shipped as a bundle) + node_modules → repo's
//                      /home /run   a private HOME and XDG_RUNTIME_DIR (0700); a private session bus. TMPDIR stays
//                      /tmp: scratch roots ARE /tmp/vs-* (endDaemonsOf refuses any other root, the reaper judges only
//                      those — measured: TMPDIR under the snap red test-agentd-dial + test-ci-heavy-launch, 2026-10-13)
//                      /markers /ci.log /rc   the run's marker, its whole log, its exit code
// The LOAD RULE is the box's own (MemAvailable ≥ 40 GB ⇒ 4 lanes, ≥ 25 ⇒ 2, else 1; --lanes overrides), printed.
// The log STREAMS back (every line also to --log); the marker + log are copied to <tree>/data/ci-heavy/remote/.
// TEARDOWN: every process of the run carries VIBESPACE_CI_REMOTE_RUN=<id>; after the run — and when this process
// is interrupted — each one still alive (by that env or a cwd / argv under the snap) is TERMed, then KILLed, and named.
// Exit: the remote ci.mjs's code (0 green · 1 red · 3/4 no verdict) · 2 refused here · 5 the box unreachable /
// not provisioned. Gate: scripts/test-ci-remote.mjs.
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const CI_ROOT = '/var/tmp/vibespace-ci';
const HERE = path.dirname(new URL(import.meta.url).pathname);

// PURE: the box's own LOAD RULE (the hub's, scaled to what the box has free).
export function loadRule(availGb) { return availGb >= 40 ? 4 : availGb >= 25 ? 2 : 1; }

export function parseArgs(argv) {
  const o = { host: null, snapshot: null, range: null, shard: null, only: null, lanes: null, log: null, exit: null, keep: false, list: false, dirtyOk: false };
  const val = (i, a) => (a.includes('=') ? a.slice(a.indexOf('=') + 1) : argv[i + 1]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], k = a.replace(/^--/, '').split('=')[0];
    if (['keep', 'list', 'dirty-ok'].includes(k)) { o[k === 'dirty-ok' ? 'dirtyOk' : k] = true; continue; }
    if (!['host', 'snapshot', 'range', 'shard', 'only', 'lanes', 'log', 'exit'].includes(k)) throw new Error(`unknown argument '${a}'`);
    const v = val(i, a); if (!a.includes('=')) i++;
    if (v === undefined || v === '') throw new Error(`--${k} needs a value`);
    o[k] = v;
  }
  if (o.shard !== null) {
    const m = /^(\d+)\/(\d+)$/.exec(o.shard); const i = m && Number(m[1]), n = m && Number(m[2]);
    if (!m || n < 1 || i < 1 || i > n) throw new Error(`--shard wants <k>/<n> with 1 ≤ k ≤ n (got '${o.shard}')`);
    o.shard = { i, n };
  }
  if (o.only !== null) o.only = o.only.split(',').map((x) => x.trim()).filter(Boolean);
  if (o.only && o.range) throw new Error('--only and --range do not combine (--only IS the selection)');
  if (o.lanes !== null && !(Number.isInteger(Number(o.lanes)) && Number(o.lanes) >= 1)) throw new Error(`--lanes wants an integer ≥ 1 (got '${o.lanes}')`);
  if (!o.snapshot) throw new Error('--snapshot <tree> is required');
  if (!o.list && !o.host) throw new Error('--host <ssh alias> is required (or --list)');
  return o;
}

// The slice, cut by the TREE's ci.mjs. `mod` = that module (an import of <tree>/scripts/ci.mjs). Unknown --only
// names are refused loudly (ci.mjs would exit 2 on the box after a whole rsync). Order: longest-first by the
// newest timings in `timingDirs` (heavyGate's --only keeps the order it is given), unmeasured suites late-in-table first.
export function selectSlice(mod, { tree, range = null, shard = null, only = null, timingDirs = [], changed } = {}) {
  const all = mod.SUITES.filter((s) => s.tier === 'heavy');
  let picked = all, summary = `[ci-remote] the full heavy tier: ${all.length} suites`;
  if (only) {
    const bad = only.filter((n) => !all.some((s) => s.name === n));
    if (bad.length) throw new Error(`--only: not a heavy suite in this tree: ${bad.join(', ')}`);
    picked = only.map((n) => all.find((s) => s.name === n));
    summary = `[ci-remote] --only: ${picked.length} suites`;
  } else if (range) {
    const a = mod.affectedSuites({ range, suites: all, root: tree, changed });
    picked = a.selected; summary = a.summary;
  }
  let serial = [];
  if (shard) {
    const sourceOf = (name) => { try { return fs.readFileSync(path.join(tree, 'scripts', name + '.mjs'), 'utf-8'); } catch { return ''; } };
    const plan = mod.shardPlan(picked, shard.n, { sourceOf });
    serial = plan.serial.filter((n) => plan.shards[shard.i - 1].some((s) => s.name === n));
    summary += `\n[ci-remote] shard ${shard.i}/${shard.n}: ${plan.shards[shard.i - 1].length} of ${picked.length}` + (plan.serial.length ? ` (the serial group ${plan.serial.join(', ')} is shard 1's)` : '');
    picked = plan.shards[shard.i - 1];
  }
  const timings = {};
  for (const d of timingDirs) { const t = mod.previousTimings(d); for (const k of Object.keys(t)) if (!(k in timings)) timings[k] = t[k]; }
  const idx = new Map(all.map((s, i) => [s.name, i]));
  const names = picked.map((s) => s.name).sort((a, b) => ((timings[b] ?? -1) - (timings[a] ?? -1)) || (idx.get(b) - idx.get(a)));
  return { names, summary, serial, total: all.length, measured: names.filter((n) => n in timings).length };
}

const git = (tree, args) => { const r = spawnSync('git', ['-C', tree, ...args], { encoding: 'utf-8' }); return r.status === 0 ? r.stdout.trim() : null; };
const sh = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
const SSH = (host) => ['-o', 'BatchMode=yes', '-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=6', host];

// The remote half. TEARDOWN is its own script so a local interrupt can run it on a second connection.
export function teardownScript(snap, id, { graceS = 3 } = {}) {
  // three single passes over /proc (a fork per pid was 40 s on the loaded hub): the run id in an environ, a cwd under
  // the snap, the snap in an argv element — the argv regex is written so its own argv does not match it ("x[/]")
  return String.raw`S=${sh(snap)}; ID=${sh(id)}; SRE=$(printf '%s' "$S" | sed 's/[].[*^$\\]/\\&/g')
scan() {
  grep -lsxzF "VIBESPACE_CI_REMOTE_RUN=$ID" /proc/[0-9]*/environ | sed 's|^/proc/\([0-9]*\)/.*|\1 env|'
  find /proc/[0-9]*/cwd -maxdepth 0 \( -lname "$S" -o -lname "$S/*" \) 2>/dev/null | sed 's|^/proc/\([0-9]*\)/.*|\1 cwd|'
  grep -lsz -e "$SRE[/]" /proc/[0-9]*/cmdline | sed 's|^/proc/\([0-9]*\)/.*|\1 argv|'
}
kill_run() { sig=$1; n=0; list=$(scan | awk '!seen[$1]++')
  while read -r p how; do [ -n "$p" ] && [ "$p" != "$$" ] && [ -O "/proc/$p" ] || continue
    [ "$sig" = TERM ] && echo "[ci-remote] teardown: $p $(tr '\0' ' ' < /proc/$p/cmdline 2>/dev/null | cut -c1-100) (by $how)"
    kill -$sig "$p" 2>/dev/null && n=$((n+1)); done <<< "$list"; echo $n; }
t=$(kill_run TERM); c=$(echo "$t" | tail -n 1); echo "$t" | sed '$d'
if [ "$c" -gt 0 ]; then sleep ${Number(graceS)}; k=$(kill_run KILL | tail -n 1); echo "[ci-remote] teardown: $c process(es) TERMed, $k still alive KILLed"; else echo "[ci-remote] teardown: no process of the run left"; fi
`;
}

export function runScript({ snap, id, names, head, lanes, ciRoot = CI_ROOT, lockWaitMs = 2 * 3600e3 }) {
  return `set -u; S=${sh(snap)}; CI=${sh(ciRoot)}; ID=${sh(id)}
mkdir -p "$S/home" "$S/run" "$S/markers" && chmod 700 "$S/run" || exit 5
ln -sfn "$CI/repo/node_modules" "$S/tree/node_modules"
avail=$(awk '/MemAvailable/{print int($2/1048576)}' /proc/meminfo)
lanes=${lanes ? Number(lanes) : `$(if [ $avail -ge 40 ]; then echo 4; elif [ $avail -ge 25 ]; then echo 2; else echo 1; fi)`}
echo "[ci-remote] $(hostname): LOAD RULE — \${avail} GB available, load $(cut -d' ' -f1 /proc/loadavg), $(nproc) cpus ⇒ VIBESPACE_CI_LANES=$lanes${lanes ? ' (--lanes)' : ''}"
: > "$S/ci.log"; echo running > "$S/rc"
cat > "$S/run.sh" <<RUN
cd "$S/tree" || exit 5
env -i HOME="$S/home" PATH="$S/tree/data/bin:$CI/bin:/usr/local/bin:/usr/bin:/bin" LANG=C.UTF-8 TERM=dumb USER="\\$USER" LOGNAME="\\$USER" SHELL=/bin/bash \\\\
  XDG_RUNTIME_DIR="$S/run" TMPDIR=/tmp VIBESPACE_SKIP_AGENT_HOOKS=1 VIBESPACE_CI_DIR_SWEEP=off VIBESPACE_CI_LANES=$lanes VIBESPACE_CI_REMOTE_RUN="$ID" \\\\
  VIBESPACE_AB_BASE="$CI/tools/ab-0.38.1/node_modules/agent-browser/bin/agent-browser-linux-x64" GDK_BACKEND=x11 QT_QPA_PLATFORM=xcb NO_UPDATE_NOTIFIER=1 npm_config_update_notifier=false \\\\
  dbus-run-session -- node scripts/ci.mjs --heavy --only=${names.join(',')} --sha=${head} --markers="$S/markers" --lock="$CI/heavy.lock" --lock-wait-ms=${lockWaitMs} < /dev/null
echo \\$? > "$S/rc"
RUN
setsid bash "$S/run.sh" >> "$S/ci.log" 2>&1 < /dev/null &
tail -n +1 --pid=$! -F "$S/ci.log" 2>/dev/null
${teardownScript(snap, id)}
echo "[ci-remote] rc=$(cat "$S/rc")"
`;
}

function rsync(args) { return spawnSync('rsync', args, { encoding: 'utf-8' }); }

async function main(argv) {
  let o;
  try { o = parseArgs(argv); } catch (e) { console.error('✗ ' + e.message); return 2; }
  const tree = path.resolve(o.snapshot);
  if (!fs.existsSync(path.join(tree, 'scripts', 'ci.mjs'))) { console.error(`✗ ${tree} has no scripts/ci.mjs`); return 2; }
  const head = git(tree, ['rev-parse', 'HEAD']);
  if (!head) { console.error(`✗ ${tree} is not a git tree (the range and the marker's sha are read from its git)`); return 2; }
  const mod = await import(pathToFileURL(path.join(tree, 'scripts', 'ci.mjs')).href);
  const common = git(tree, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  const timingDirs = [path.join(tree, 'data', 'ci-heavy', 'remote'), path.join(tree, 'data', 'ci-heavy'), ...(common ? [path.join(path.dirname(common), 'data', 'ci-heavy')] : [])];
  let sel;
  try { sel = selectSlice(mod, { tree, range: o.range, shard: o.shard, only: o.only, timingDirs }); } catch (e) { console.error('✗ ' + e.message); return 2; }
  if (o.list) { console.error(sel.summary); process.stdout.write(sel.names.join(',') + '\n'); return 0; }
  const dirty = git(tree, ['status', '--porcelain', '--untracked-files=no']);
  if (dirty && !o.dirtyOk) { console.error(`✗ ${tree} is DIRTY — a marker for ${head.slice(0, 9)} would not describe what ran (commit, or --dirty-ok: no marker is copied back)`); return 2; }
  const t0 = Date.now();
  const logFd = o.log ? fs.openSync(path.resolve(o.log), 'a') : null;
  const out = (s) => { process.stdout.write(s); if (logFd !== null) fs.writeSync(logFd, s); };
  out(sel.summary.split('\n').slice(-2).join('\n') + `\n[ci-remote] ${sel.names.length} suites for ${head.slice(0, 9)} on ${o.host} (${sel.measured} ordered by a measured time, longest first)\n`);
  if (!sel.names.length) { out('[ci-remote] nothing selected — nothing to run\n'); return 0; }
  const tag = o.shard ? `${o.shard.i}of${o.shard.n}` : (o.only ? 'only' : 'all');
  const id = `${head.slice(0, 9)}-${tag}-${crypto.randomBytes(3).toString('hex')}`;
  const snap = `${CI_ROOT}/snap-${head.slice(0, 9)}-${tag}`;
  // 1. the box: provisioned? its lock vs the tree's (a newer lock ⇒ npm ci in the box's repo first)
  const probe = spawnSync('ssh', [...SSH(o.host), `test -x ${CI_ROOT}/bin/node && test -d ${CI_ROOT}/repo/node_modules && cat ${CI_ROOT}/repo/.lock-sha`], { encoding: 'utf-8' });
  if (probe.status !== 0) { out(`✗ ${o.host}: not reachable or not provisioned (${(probe.stderr || '').trim().slice(0, 200) || 'rc ' + probe.status}) — ssh ${o.host} 'bash -s' < ${path.join(HERE, 'ci-remote-provision.sh')}\n`); return 5; }
  const lock = crypto.createHash('sha256').update(fs.readFileSync(path.join(tree, 'package-lock.json'))).digest('hex').slice(0, 16);
  if (probe.stdout.trim() !== lock) {
    out(`[ci-remote] ${o.host}: package-lock ${probe.stdout.trim()} ≠ the tree's ${lock} — npm ci in ${CI_ROOT}/repo first\n`);
    const r1 = rsync(['-a', path.join(tree, 'package.json'), path.join(tree, 'package-lock.json'), `${o.host}:${CI_ROOT}/repo/`]);
    const r2 = r1.status === 0 && spawnSync('ssh', [...SSH(o.host), `cd ${CI_ROOT}/repo && PATH=${CI_ROOT}/bin:$PATH npm ci --no-audit --no-fund > ${CI_ROOT}/logs/npm-ci.log 2>&1 && echo ${lock} > .lock-sha`], { encoding: 'utf-8' });
    if (!r2 || r2.status !== 0) { out(`✗ ${o.host}: npm ci failed (${CI_ROOT}/logs/npm-ci.log)\n`); return 5; }
  }
  // 2. the snapshot = a git WORKTREE of the box's clone at the tree's HEAD — not an rsync of files: the build's
  // censuses read `git ls-files` (measured: test-architecture §52a/id-branch-census die without a .git, 2026-10-13),
  // suites read the sha, old-object reads want history. The commits the box lacks travel as ONE bundle against every
  // ref its clone has that this tree has too (a lane = a few KB; 87 MB of files took 31 s to rsync).
  const ts = Date.now();
  const refs = spawnSync('ssh', [...SSH(o.host), `git -C ${CI_ROOT}/repo cat-file -e ${head}^{commit} 2>/dev/null && echo HAVE; git -C ${CI_ROOT}/repo for-each-ref --format='%(objectname)' refs/remotes refs/heads`], { encoding: 'utf-8' });
  let shipped = 'none (the box has the commit)';
  if (!/^HAVE$/m.test(refs.stdout || '')) {
    const not = [...new Set((refs.stdout || '').split('\n').filter((x) => /^[0-9a-f]{40}$/.test(x)))].filter((x) => git(tree, ['cat-file', '-e', x + '^{commit}']) !== null);
    const bf = path.join(fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'vs-ci-remote-')), 'b.bundle');
    const mk = spawnSync('git', ['-C', tree, 'bundle', 'create', '-q', bf, 'HEAD', ...(not.length ? ['--not', ...not] : [])], { encoding: 'utf-8' });
    const fetch = mk.status === 0 && spawnSync('ssh', [...SSH(o.host), `mkdir -p ${CI_ROOT}/bundles && cat > ${CI_ROOT}/bundles/${id}.bundle && git -C ${CI_ROOT}/repo fetch -q ${CI_ROOT}/bundles/${id}.bundle HEAD && git -C ${CI_ROOT}/repo cat-file -e ${head}^{commit}; rc=$?; rm -f ${CI_ROOT}/bundles/${id}.bundle; exit $rc`], { input: fs.readFileSync(bf), encoding: 'utf-8' });
    shipped = `a bundle of ${mk.status === 0 ? fs.statSync(bf).size : '?'} B`;
    fs.rmSync(path.dirname(bf), { recursive: true, force: true });
    if (!fetch || fetch.status !== 0) { out(`✗ could not ship ${head.slice(0, 9)} to ${o.host}: ${((mk.stderr || '') + ((fetch && fetch.stderr) || '')).trim().slice(0, 300)}\n`); return 5; }
  }
  const wt = spawnSync('ssh', [...SSH(o.host), `mkdir -p ${sh(snap)} && { git -C ${CI_ROOT}/repo worktree remove --force ${sh(snap + '/tree')} 2>/dev/null; rm -rf ${sh(snap + '/tree')}; git -C ${CI_ROOT}/repo worktree prune; git -C ${CI_ROOT}/repo worktree add -q --detach ${sh(snap + '/tree')} ${head}; }`], { encoding: 'utf-8' });
  if (wt.status !== 0) { out(`✗ ${o.host}: git worktree add ${snap}/tree ${head.slice(0, 9)} failed: ${(wt.stderr || '').trim().slice(0, 300)}\n`); return 5; }
  // --dirty-ok: the tree's modified + untracked (not ignored) files on top (no marker comes back for a dirty tree)
  if (dirty) {
    const files = spawnSync('git', ['-C', tree, 'ls-files', '-z', '-m', '-o', '--exclude-standard'], { encoding: 'utf-8' }).stdout || '';
    const rd = files ? spawnSync('rsync', ['-a', '--from0', '--files-from=-', tree + '/', `${o.host}:${snap}/tree/`], { input: files, encoding: 'utf-8' }) : { status: 0 };
    if (rd.status !== 0) { out(`✗ rsync of the dirty files failed: ${(rd.stderr || '').trim().slice(0, 300)}\n`); return 5; }
  }
  out(`[ci-remote] ${o.host}:${snap}/tree = a worktree at ${head.slice(0, 9)} (shipped: ${shipped}${dirty ? ' + the dirty files' : ''}) in ${((Date.now() - ts) / 1000).toFixed(1)}s\n`);
  // 3. run, streaming; an interrupt here tears the run down on the box before this process exits
  const child = spawn('ssh', [...SSH(o.host), 'bash -s'], { stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdin.end(runScript({ snap, id, names: sel.names, head, lanes: o.lanes }));
  let tail = '', stopping = false;
  const onData = (b) => { const s = b.toString(); out(s); tail = (tail + s).slice(-4096); };
  child.stdout.on('data', onData); child.stderr.on('data', onData);
  const stop = (sig) => {
    if (stopping) return; stopping = true;
    out(`\n[ci-remote] ${sig} — tearing the run down on ${o.host}\n`);
    const td = spawnSync('ssh', [...SSH(o.host), 'bash -s'], { input: teardownScript(snap, id), encoding: 'utf-8' });
    out(td.stdout || ''); child.kill('SIGTERM'); process.exit(sig === 'SIGINT' ? 130 : 143);
  };
  process.on('SIGINT', () => stop('SIGINT')); process.on('SIGTERM', () => stop('SIGTERM'));
  const sshRc = await new Promise((res) => child.on('close', (c) => res(c)));
  const m = /\[ci-remote\] rc=(\d+)\s*$/.exec(tail);
  const rc = m ? Number(m[1]) : 5;
  if (!m) out(`✗ the connection to ${o.host} ended without the run's exit code (ssh rc ${sshRc}) — the run may still be going: ${snap}/ci.log\n`);
  // 4. the results beside the tree's own markers (a partial marker for the shard + the whole log)
  const back = path.join(tree, 'data', 'ci-heavy', 'remote');
  fs.mkdirSync(back, { recursive: true });
  const stem = `${head}.${tag}.${o.host}`;
  rsync(['-a', `${o.host}:${snap}/ci.log`, path.join(back, stem + '.log')]);
  if (!dirty) {
    const tmp = fs.mkdtempSync(path.join(back, '.in-'));
    rsync(['-a', `${o.host}:${snap}/markers/`, tmp + '/']);
    for (const f of fs.readdirSync(tmp)) { const x = /^[0-9a-f]{7,40}\.(green|red)$/.exec(f); if (x) fs.renameSync(path.join(tmp, f), path.join(back, `${stem}.${x[1]}`)); }
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  if (!o.keep && m) spawnSync('ssh', [...SSH(o.host), `git -C ${CI_ROOT}/repo worktree remove --force ${sh(snap + '/tree')}; git -C ${CI_ROOT}/repo worktree prune`]);
  const secs = Math.round((Date.now() - t0) / 1000);
  out(`[ci-remote] ${o.host}${o.shard ? ` shard ${o.shard.i}/${o.shard.n}` : ''}: rc=${rc} in ${secs}s — results ${back}/${stem}.*${o.keep ? `, snapshot kept at ${o.host}:${snap}` : ''}\n`);
  if (o.exit) fs.writeFileSync(path.resolve(o.exit), `rc=${rc} secs=${secs} host=${o.host} shard=${o.shard ? `${o.shard.i}/${o.shard.n}` : tag} head=${head.slice(0, 9)} suites=${sel.names.length}\n`);
  return rc;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { console.error('[ci-remote] crashed: ' + (e && e.stack || e)); process.exit(5); });
