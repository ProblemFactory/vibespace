// THE START CENSUS — WHAT FIRES EACH DIRECT START (B-323e's ratchet, lane bl-keys-misc, 主开发 r1351). Every child the hub's MAIN
// process starts itself (an async site of the spawn census, scripts/spawn-env-census.mjs scan, and every SYNCHRONOUS form, read
// here) forks the whole hub: its page tables copied — 45–54 ms per GB of the hub's RSS (four in-tree readings), 0.2–0.25 s a
// start at the owner's 4.5–5 GB; a synchronous one holds the loop for the child's whole run too. The hub's starter
// (src/server/child-starter.js) starts the timer-fired ones instead. A ROW names what fires the sites of one (file, first argument
// as written) key:
//   press    a person's press or an agent's verb (a route, a ws message, a CLI verb)
//   start    the hub's boot, a conversation's create / attach, a first use, once per X
//   long     a LONG-LIVED child (a session, a daemon, a mount, a browser, a display) — lane bl-machines-b's kind
//   timer    a timer or a sweep fires it (a page's poll included) — A DEBT: its count is a ceiling, the sum of every timer row
//            is TIMER_DEBT_SUM and only shrinks (a new direct start on a timer is red BY NAME)
//   not-hub  the site's file runs only in another process (the device agent, the starter itself, a child the hub forked)
// THE LAWS (judge): a hub file's (file, cmd) key with no row is RED by name; a row whose sites are gone is DEAD (RED) — except a
// timer row (a debt paid: said, «lower the row»); a key's sites must number at least its non-timer rows and at most those plus
// its timer ceiling; the timer rows' sum never passes TIMER_DEBT_SUM; A SYNCHRONOUS START ON A TIMER IS RED WITH NO ROW POSSIBLE
// — save the three that run ONLY OFF LINUX (主开发 r1363, (B): a change measurable only on a Mac or a hub without /proc is not
// built): such a row names its platform GUARD — a PLATFORM FACT (process.platform, /proc), never a setting, a flag or an env word —
// whose text must stand within the site's own lines (GUARD_BEFORE before it, GUARD_AFTER after), and WHAT IT COSTS THERE, read
// from the code (how often, on which caller, loop or worker): the day a Mac measure exists, the row is the brief.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

export const KINDS = Object.freeze(['press', 'start', 'long', 'timer', 'not-hub']);
/** a hub file: what the hub's process loads — never the device agent's own, the wrappers / CLIs, the page's code */
export const hubFile = (f) => !/^(src\/agentd\/|data\/bin\/|src\/lib\/)/.test(f);
const LINK = 'only while a machine\'s device link is down: an ssh road on the shared master — a NAMED DEBT, not moved (主开发 r1351 (b))';
const MOUNT = 'the mount sweep\'s auto-reconnect (60 s, backed off 1/2/5/10 min) and its teardown — lane bl-machines-b\'s line 141 moves them';
const PULL = 'the pull mount\'s own timers (src/device-mount.js is lane bl-machines-b\'s, r1351 (a))';
const PANEL = 'the System panel\'s 5 s poll per open panel + the 45 s memory watch — my line 70 moves them behind the starter';
/** [file, cmd (the first argument as the scan writes it), kind, count, what fires it] — the hub's ASYNC direct starts */
export const ROWS = Object.freeze([
  ['src/agy-discover.js', 'bin', 'timer', 1, 'the sessions list\'s poll: ≤1 per 15 s per agy root, when its database changed'],
  ['src/app-secrets.js', 'bin', 'press', 1, 'a launch of an app window with a portal'],
  ['src/app-serve.js', 'cmd', 'press', 1, 'the launcher opened, an app planned / installed / removed'],
  ['src/claude-oat-probe.js', "'setpriv'", 'not-hub', 1, 'the self-measure\'s forked child'],
  ['src/claude-oat-trampoline.js', 'bin', 'not-hub', 1, 'the trampoline strace starts inside the self-measure\'s child'],
  ['src/cli-identity.js', "'pgrep'", 'press', 1, 'Terminate / a conversation\'s end, on a hub without /proc'],
  ['src/codex-reset-helper.js', 'cmd', 'press', 1, 'a person\'s reset-credit press'],
  ['src/codex-thread-read.js', 'cmd', 'press', 1, 'opening a local codex conversation whose rollout file is missing'],
  ['src/ctx-sync.js', "'rsync'", 'timer', 1, 'ctx-sync\'s 60 s tick — ' + LINK],
  ['src/desktop-display.js', 'bin', 'long', 1, 'a display\'s parts (X, xpra, x11vnc, the WM, an app) at a launch'],
  ['src/desktop-display.js', 'bin', 'press', 1, 'run(): launch probes, install facts, unmount at stop, an agent\'s locale probe (belt calls ride the starter)'],
  ['src/desktop-display.js', 'binPath', 'press', 3, 'a RemoteApp client\'s facts, xrdb at a launch (its 5 s poll after the launch)'],
  ['src/desktop-display.js', 'exec', 'press', 1, 'RemoteApp «first connection» trust'],
  ['src/desktop-mic.js', 'file', 'not-hub', 1, 'the device agent'], ['src/desktop-mic.js', 'ff', 'not-hub', 1, 'the device agent'], ['src/desktop-mic.js', 'sp.file', 'not-hub', 1, 'the device agent'],
  ['src/desktop-sound.js', 'ff', 'not-hub', 1, 'the device agent'], ['src/desktop-sound.js', 'h.exe', 'not-hub', 1, 'the device agent'],
  ['src/device-mount.js', "'fusermount3'", 'timer', 1, 'releaseStale at every pull attempt (the 90 s sweep\'s retry) — ' + PULL],
  ['src/device-mount.js', "'fusermount'", 'timer', 1, 'the same, without fusermount3 — ' + PULL],
  ['src/device-mount.js', 'rcloneBin', 'long', 1, 'the pull mount\'s rclone daemon (the detach unit)'],
  ['src/device-mount.js', "'sh'", 'timer', 1, 'the held-file read loop, 5 s per live pull mount — ' + PULL],
  ['src/device-mount.js', "'ls'", 'timer', 1, 'waitMounted\'s 250 ms poll at a pull mount\'s start — ' + PULL],
  ['src/exit-shell.js', 'p.file', 'not-hub', 1, 'the Windows device agent'],
  ['src/hosts.js', "'ssh'", 'press', 6, 'add a machine, its tools, keys, OpenCode on a host, bootstrap'],
  ['src/hosts.js', "'ssh'", 'start', 1, 'the agent\'s install at a machine\'s first connect'],
  ['src/hosts.js', "'ssh'", 'timer', 2, '_ssh from ctx-sync / goal-sync, the usage harvest — ' + LINK],
  ['src/hosts.js', "'tar'", 'timer', 1, 'the agent bundle\'s tar (ASYNC since B-323e; its bytes cannot cross the starter\'s line pipe) — redone on every connect while an install keeps failing'],
  ['src/hosts.js', "'ssh-keygen'", 'press', 3, 'a machine added with a key, the public key shown, the hub\'s key made'],
  ['src/hosts.js', "'head'", 'press', 1, 'the public key shown'],
  ['src/incident.js', 'cmd', 'press', 1, 'the panic button, a page\'s freeze capture (a worker of the hub)'],
  ['src/installed-apps.js', 'argv[0]', 'not-hub', 1, 'the device agent'],
  ['src/job-logs-sweep.js', 'workerPath', 'timer', 1, 'the hourly job-log clean-up — lane bl-jobs\'s line 140 moves it'],
  ['src/jobs.js', 'argv[0]', 'long', 1, 'a job\'s wrapper (a run; a cron\'s 30 s tick)'],
  ['src/machine-mounts.js', "'ls'", 'timer', 1, 'the pull sweep (90 s) — line 141 moves it'],
  ['src/machine-mounts.js', "'realpath'", 'timer', 1, 'the pull sweep while held pairs exist — line 141'],
  ['src/machine-mounts.js', "'ssh'", 'press', 1, 'a push mount added / remounted / removed'],
  ['src/machine-mounts.js', "'sh'", 'press', 1, 'a push mount added'],
  ['src/machine-probes.js', 'cmd', 'timer', 1, 'the machine facts\' probes (the credentials\' read with GET /api/backend-status, polled 3 s while a setup dialog is open); its --version asks ride the starter since B-323e'],
  ['src/machine-window.js', 'how.argv[0]', 'not-hub', 2, 'the device agent'], ['src/machine-window.js', 'argv[0]', 'not-hub', 1, 'the device agent'],
  ['src/mounts.js', "'sh'", 'start', 1, 'the rclone binary\'s local copy, once per binary (a failed one is remembered since B-323e)'],
  ['src/mounts.js', "'sh'", 'timer', 1, 'a CephFS connect — ' + MOUNT],
  ['src/mounts.js', "'curl'", 'start', 1, 'the pinned rclone\'s download at a restore'], ['src/mounts.js', "'curl'", 'press', 2, 'the Drive sign-in'],
  ['src/mounts.js', "'unzip'", 'start', 1, 'the pinned rclone\'s unpack'],
  ['src/mounts.js', 'local', 'start', 1, '`rclone version` at every restore (boot, each vault unlock)'],
  ['src/mounts.js', 'this.rcloneBin()', 'timer', 3, 'a connect\'s probes — ' + MOUNT],
  ['src/mounts.js', 'this.rcloneBin()', 'long', 2, 'the rclone mount daemon, `rclone authorize`'],
  ['src/mounts.js', 'this.rcloneBin()', 'press', 1, 'the Shared-Drive picker'],
  ['src/mounts.js', "'find'", 'timer', 1, 'the watch\'s file count at every mount start — ' + MOUNT],
  ['src/mounts.js', "'fusermount3'", 'timer', 2, MOUNT], ['src/mounts.js', "'fusermount'", 'timer', 2, MOUNT],
  ['src/mounts.js', "'sudo'", 'timer', 2, 'a CephFS mount / unmount — ' + MOUNT],
  ['src/mounts.js', "'rm'", 'timer', 1, 'a moved cache\'s removal after a connect — ' + MOUNT],
  ['src/mounts.js', "'rmdir'", 'press', 1, 'Unmount / remove / a path edit'],
  ['src/mounts.js', 'cmd', 'timer', 1, 'the mount point\'s checks at every connect — ' + MOUNT],
  ['src/mounts.js', 'process.execPath', 'timer', 1, 'the cache\'s placement at a connect — ' + MOUNT],
  ['src/mounts.js', "'umount'", 'timer', 1, MOUNT],
  ['src/mounts.js', "'mc'", 'press', 4, 'a share minted / revoked'],
  ['src/node-runtime.js', 'cmd', 'not-hub', 1, 'scripts/runtime-check.mjs (a child the hub starts) and the device agent'],
  ['src/opslog.js', "'sudo'", 'start', 2, 'the ops log\'s CephFS mount at boot (opt-in)'],
  ['src/plugins/frp.js', "'tar'", 'start', 1, 'frpc\'s install (boot replay, a press)'], ['src/plugins/frp.js', 'bin', 'long', 1, 'frpc'],
  ['src/plugins/tailscale.js', 'run[0]', 'press', 1, 'the DNS setting at a start'],
  ['src/plugins/tailscale.js', 'cli', 'timer', 1, 'the tailnet lookup, ≤1 per 60 s, asked by ssh dials and the tailnet door'],
  ['src/plugins/tailscale.js', 'cmd', 'long', 1, 'tailscaled'], ['src/plugins/tailscale.js', "useSudo ? 'sudo' : cli", 'long', 1, '`tailscale up` (the sign-in)'],
  ['src/remote-fs.js', "'ssh'", 'press', 3, 'Files on an ssh machine (list, read, save, download)'],
  ['src/remoteapp-facts.js', 'how.argv[0]', 'not-hub', 1, 'the device agent'],
  ['src/routes/files.js', "'find'", 'press', 1, 'an unresolved link in chat, Search by name'],
  ['src/routes/files.js', "'bash'", 'long', 1, 'the clipboard holder of a pasted picture'],
  ['src/routes/files.js', 'cmd', 'press', 3, 'an archive made, an entry / an archive extracted'],
  ['src/routes/files.js', "'unzip'", 'press', 1, 'an archive listed'],
  ['src/routes/files.js', "'tar'", 'press', 4, 'an archive listed, a folder copied or moved'],
  ['src/routes/files.js', "type === 'zip' ? 'unzip' : 'tar'", 'press', 2, 'an archive extracted with progress'],
  ['src/routes/files.js', "'sh'", 'timer', 1, '`du` ×2 every 1.2 s while a person\'s local folder copy runs (a timer the press starts)'],
  ['src/routes/files.js', "'ssh'", 'press', 3, 'a copy / move to or from a machine'],
  ['src/routes/files.js', "'zip'", 'press', 1, 'a folder downloaded as zip'], ['src/routes/files.js', "'du'", 'press', 1, 'a folder\'s Properties'],
  ['src/server/account-usage-routes.js', "'ssh'", 'press', 2, 'an account deleted, its long-lived token removed / rebound'],
  ['src/server/boot-restore.js', "'ssh'", 'start', 1, 'the boot\'s re-adopt of an orphaned keeper session'],
  ['src/server/boot-restore.js', 'DTACH_CMD', 'long', 1, 'the re-adopted session\'s transport'],
  ['src/server/browser-attach-launch.js', 'exe', 'long', 1, 'Chrome (a start; a heal from the keeper\'s 5 s tick, ≤3 per 10 min)'],
  ['src/server/browser-builds-keeper.js', 'cmd', 'press', 1, 'a Chrome build\'s install'],
  ['src/server/browser-cli-install.js', 'npm', 'long', 1, 'the browser CLI\'s npm install'], ['src/server/browser-cli-install.js', 'i.path', 'press', 1, 'its --version after the install'],
  ['src/server/browser-installs.js', 'cmd', 'press', 1, 'a Chrome build\'s unpack'],
  ['src/server/child-starter-proc.js', 'cmd', 'not-hub', 1, 'the starter\'s own small process'],
  ['src/server/child-starter.js', 'process.execPath', 'long', 1, 'the starter itself (once per boot; one replacement after a fault)'],
  ['src/server/child-starter.js', 'cmd', 'timer', 1, 'the OLD ROAD after two faults (≤ an hour a re-arm): every starter request'],
  ['src/server/claude-signin.js', 'file', 'press', 1, 'an account\'s sign-in (a PTY)'],
  ['src/server/cli-cmd.js', "'/usr/bin/which'", 'timer', 1, 'a MISSING CLI\'s login-shell ask, ≤1 per 30 s while backend-status is polled'],
  ['src/server/cli-cmd.js', 'shell', 'timer', 1, 'the same (the login shell)'],
  ['src/server/cli-env.js', 'CODEX_CMD', 'start', 1, 'the boot\'s codex sandbox probe'],
  ['src/server/cli-registration.js', 'process.execPath', 'press', 1, 'a CLI registration draft'],
  ['src/server/cli-self-measure.js', 'probePath', 'long', 1, 'the measurement of a new Claude Code build (once per build; the pool\'s 60 s tick decides)'],
  ['src/server/desktop-access.js', 'launch[0]', 'long', 1, 'a desktop install'],
  ['src/server/engine-distribution.js', 'exe', 'start', 1, 'a browser kernel\'s --version, once per kernel file'],
  ['src/server/git-identity.js', "'git'", 'start', 1, 'a local create, ≤1 per 60 s until settled'],
  ['src/server/mount-health-watch.js', 'process.execPath', 'timer', 1, 'a wedge episode of the 10 s canary'],
  ['src/server/mounts-plugins-wiring.js', "'ssh'", 'start', 2, 'the auto-graduation after an ssh connect (≤1 per machine per 6 h), a press'],
  ['src/server/mounts-plugins-wiring.js', "'ssh'", 'press', 1, 'a graduation removed'],
  ['src/server/oat-mint.js', 'file', 'press', 1, 'a long-lived token minted (a PTY)'],
  ['src/server/ops-routes.js', "'bash'", 'long', 1, 'the self-update'],
  ['src/server/permission-rules.js', 'cmd', 'press', 1, 'a local oracle asked'],
  ['src/server/plugin-install.js', 'cmd', 'press', 1, 'a plugin\'s unzip'], ['src/server/plugin-install.js', 'gitBin', 'press', 1, 'a plugin\'s git install / Test'],
  ['src/server/plugin-loader.js', "path.join(rec.dir, 'server.js')", 'long', 1, 'an enabled plugin\'s process'],
  ['src/server/session-stdout.js', 'DTACH_CMD', 'long', 2, 'a conversation\'s attach / heal (bridge-watch\'s tick, ≤3 per hour)'],
  ['src/server/stdout/claude-stream-json.js', "'git'", 'start', 1, 'a local claude chat\'s init with the worktree flag'],
  ['src/server/tls.js', 'bin', 'timer', 1, 'runChild: the boot\'s liveness probes and their re-probe timer (≤5 per socket); the hourly pass rides the starter since B-323e'],
  ['src/server/window-targets-engine.js', 'bin', 'press', 1, 'an agent\'s screenshot of a desktop window'],
  ['src/session-store.js', 'cmd', 'timer', 1, '`ps` per lock on a hub WITHOUT /proc (the sweep); tmux list-panes rides the starter since B-323e'],
  ['src/ssh-key.js', 'cmd', 'press', 1, 'a machine added with a passphrase key'],
  ['src/sysinfo.js', "'sysctl'", 'timer', 1, PANEL], ['src/sysinfo.js', "'vm_stat'", 'timer', 1, PANEL],
  ['src/sysinfo.js', "'ps'", 'timer', 3, PANEL], ['src/sysinfo.js', "'df'", 'timer', 1, PANEL],
  ['src/usage-routes.js', 'bin', 'timer', 1, 'auto-cli\'s 60 s tick (opt-in)'],
  ['src/vnc.js', 'xvnc', 'long', 1, 'the Desktop\'s Xvnc'], ['src/vnc.js', 'c', 'long', 1, 'the Desktop\'s session'],
  ['src/window-targets.js', 'python', 'press', 2, 'an agent\'s window verbs'], ['src/window-targets.js', 'bin', 'press', 2, 'an agent\'s window verbs'],
  ['src/ws-create.js', "'test'", 'start', 1, 'a local create with an explicit folder'], ['src/ws-create.js', "'mkdir'", 'press', 1, 'a create that remakes a missing folder'],
  ['src/ws-create.js', "'git'", 'start', 1, 'a local create with a worktree'], ['src/ws-create.js', 'DTACH_CMD', 'long', 1, 'a local conversation\'s dtach master'],
  ['src/ws-handler.js', 'cmd', 'start', 1, 'a create on an ssh machine (its tools shipped)'], ['src/ws-handler.js', "'ssh'", 'press', 1, 'Terminate of a remote chat'],
  ['src/ws-handler.js', "'tmux'", 'long', 1, 'a tmux attach'],
]);
/** the SYNCHRONOUS ones: [file, cmd, kind, count, what fires it, guard?, cost?] — a timer row only with its PLATFORM guard and its cost */
export const SYNC_ROWS = Object.freeze([
  ['src/claude-oat-probe.js', 'strace', 'not-hub', 2, 'the self-measure\'s child preflight'], ['src/claude-oat-probe.js', 'setpriv', 'not-hub', 1, 'the same'],
  ['src/claude-oat-probe.js', "'ip'", 'not-hub', 2, 'the release script\'s netns rung'],
  ['src/discovery-facts.js', "'lsof'", 'timer', 1, 'the codex open-threads walk off Linux, while the sessions list polls', "process.platform === 'linux' && fs.existsSync('/proc/self')",
    'macOS / BSD only: ≤1 per 10 s while a page lists the sessions (codex-session-store\'s 10 s cache), up to 45 s (LSOF_BUDGET_MS) — in the transcript WORKER thread: the main loop runs on, the fork still copies the hub\'s page tables'],
  ['src/hosts.js', "'tar'", 'press', 1, 'an agent tools install'],
  ['src/node-runtime.js', 'n', 'start', 1, 'the boot, a newer verified node only'],
  ['src/proc-identity.js', "'ps'", 'timer', 2, 'a recorded pid\'s identity on a hub WITHOUT /proc, read by the sweeps', 'hasProc(opts)|if (_procfs) return',
    'a hub without /proc only: one `ps` (≤3 s) per recorded pid checked, ON THE MAIN LOOP, from four sweeps (the writer sweep, jobs, mounts, the browser keeper) and the start tokens of a spawn'],
  ['src/routes/files.js', "'fc-list'", 'start', 1, 'the first GET /api/fonts'], ['src/routes/files.js', "'osascript'", 'press', 1, 'a picture pasted (macOS)'],
  ['src/routes/files.js', "'xclip'", 'press', 1, 'a picture pasted (its 200 ms chain) — line 74 moves it'], ['src/routes/files.js', "cmd === 'ruff' ? 'ruff' : cmd", 'press', 1, 'Format in the code editor'],
  ['src/server/cli-cmd.js', "'/usr/bin/which'", 'start', 1, 'the boot\'s CLI lookups'],
  ['src/server/cli-env.js', 'xsetCmd', 'start', 1, 'the boot\'s display probe (and a paste\'s retry)'], ['src/server/cli-env.js', "resolveCmd('xauth')", 'start', 1, 'the same'],
  ['src/server/cli-env.js', "resolveCmd('xset')", 'start', 1, 'the same'], ['src/server/cli-env.js', 'CLAUDE_CMD', 'start', 1, 'the boot\'s claude --help'],
  ['src/server/ops-routes.js', "'git'", 'start', 1, 'the first GET /api/version'],
  ['src/transcript-service.js', "'fuser'", 'press', 1, 'a session rescue'],
  ['src/usage-routes.js', "'security'", 'timer', 1, 'the macOS Keychain read in the opt-in 90 s usage poll', "process.platform === 'darwin'",
    'macOS only, with active usage polling on (opt-in): ≤1 per 5 min (the 90 s timer under the global login floor) + a ⟳ press, ≤3 s, ON THE MAIN LOOP'],
]);
/** THE DEBT: the sum of every timer row's count — it only shrinks (lower it when a row is lowered) */
export const TIMER_DEBT_SUM = 47;
export const GUARD_BEFORE = 80, GUARD_AFTER = 30;
/** a guard is a PLATFORM FACT — the OS, or /proc — never a setting, a flag, an env word */
export const PLATFORM_GUARD = /^(?:[^|]*(?:process\.platform\s*===?\s*'[a-z0-9]+'|\/proc\b|hasProc\(|_procfs)[^|]*)(?:\|[^|]*(?:process\.platform\s*===?\s*'[a-z0-9]+'|\/proc\b|hasProc\(|_procfs)[^|]*)*$/;
const NOT_PLATFORM = /setting|serverSetting|process\.env|\bflag\b|VS_[A-Z_]+|VIBESPACE_[A-Z_]+/i;
const SYNC = new Set(['spawnSync', 'execFileSync', 'execSync']);

/** the SYNCHRONOUS start sites of the hub's files: [{file, line, cmd}] (a name or a member `x.execFileSync(…)`) */
export function syncScan(repo, files, { patch = {} } = {}) {
  const acorn = createRequire(path.join(repo, 'package.json'))('acorn');
  const out = [];
  for (const f of files) {
    if (!hubFile(f)) continue;
    const src = Object.prototype.hasOwnProperty.call(patch, f) ? patch[f] : fs.readFileSync(path.join(repo, f), 'utf8');
    if (!/\b(?:spawnSync|execFileSync|execSync)\s*\(/.test(src)) continue;
    let ast = null;
    for (const sourceType of ['script', 'module']) { try { ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType, allowHashBang: true, allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true, locations: true }); break; } catch { } }
    if (!ast) { out.push({ file: f, line: 0, cmd: '(unparsed)' }); continue; }
    const walk = (n) => {
      if (!n || typeof n.type !== 'string') return;
      if (n.type === 'CallExpression') {
        const c = n.callee, name = c.type === 'Identifier' ? c.name : c.type === 'MemberExpression' && !c.computed && c.property.type === 'Identifier' ? c.property.name : null;
        if (name && SYNC.has(name) && n.arguments[0]) out.push({ file: f, line: n.loc.start.line, cmd: src.slice(n.arguments[0].start, n.arguments[0].end).replace(/\s+/g, ' ').trim().slice(0, 48) });
      }
      for (const k in n) { if (k === 'loc') continue; const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === 'string') walk(v); }
    };
    walk(ast);
  }
  return out;
}

/** judge({ sites (the spawn census scan's), syncSites, read(file) }) → { red: [why], paid: [what], table: {kind: n}, debt } */
export function judge({ sites = [], syncSites = [], read = () => '' }, { rows = ROWS, syncRows = SYNC_ROWS, debtSum = TIMER_DEBT_SUM } = {}) {
  const red = [], paid = [], table = {};
  const check = (list, rowsOf, sync) => {
    const groups = new Map();
    for (const s of list) { if (!hubFile(s.file)) continue; const k = s.file + '\u0000' + s.cmd; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(s); }
    const byKey = new Map();
    for (const r of rowsOf) {
      if (!KINDS.includes(r[2])) red.push(`${sync ? 'sync ' : ''}row ${r[0]} ${r[1]}: «${r[2]}» is no kind (${KINDS.join(' / ')})`);
      if (sync && r[2] === 'timer' && !r[5]) red.push(`A SYNCHRONOUS START ON A TIMER: ${r[0]} ${r[1]} — red with no row possible (make it asynchronous, through the starter)`);
      else if (sync && r[2] === 'timer' && (!PLATFORM_GUARD.test(String(r[5])) || NOT_PLATFORM.test(String(r[5])))) red.push(`A SYNCHRONOUS START ON A TIMER: ${r[0]} ${r[1]} — its guard «${r[5]}» is no platform fact (a setting, a flag, an env word is no guard): red with no row possible`);
      else if (sync && r[2] === 'timer' && !(r[6] && String(r[6]).length >= 40)) red.push(`${r[0]} ${r[1]}: a platform-guarded synchronous timer row says WHAT IT COSTS THERE (how often, on which caller, loop or worker)`);
      const k = r[0] + '\u0000' + r[1]; if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(r);
      table[r[2]] = (table[r[2]] || 0) + r[3];
    }
    for (const [k, ss] of groups) {
      const rs = byKey.get(k);
      const at = ss.map((s) => `${s.file}:${s.line}`).join(' ');
      if (!rs) { red.push(`a ${sync ? 'SYNCHRONOUS ' : ''}direct start with no row: ${ss[0].file} ${ss[0].cmd} ×${ss.length} (${at}) — name what fires it (scripts/start-triggers.mjs)`); continue; }
      const fixed = rs.filter((r) => r[2] !== 'timer').reduce((n, r) => n + r[3], 0), ceil = rs.filter((r) => r[2] === 'timer').reduce((n, r) => n + r[3], 0);
      if (ss.length < fixed) red.push(`${ss[0].file} ${ss[0].cmd}: ${ss.length} site(s) (${at}) for rows naming ${fixed} that are no timer — a row\'s sites are gone (DEAD): lower or strike it`);
      else if (ss.length > fixed + ceil) red.push(`${ss[0].file} ${ss[0].cmd}: ${ss.length} site(s) (${at}) — more than its rows name (${fixed}${ceil ? ` + a timer ceiling of ${ceil}` : ''}): a new direct start, name what fires it`);
      else if (ceil && ss.length < fixed + ceil) paid.push(`${ss[0].file} ${ss[0].cmd}: ${fixed + ceil - ss.length} of its timer debt paid — lower the row`);
      if (sync) for (const r of rs.filter((x) => x[2] === 'timer' && x[5])) {
        const lines = read(r[0]).split('\n'), guards = String(r[5]).split('|');
        for (const s of ss) { const win = lines.slice(Math.max(0, s.line - 1 - GUARD_BEFORE), s.line + GUARD_AFTER).join('\n'); if (!guards.some((g) => win.includes(g))) red.push(`${s.file}:${s.line} ${s.cmd}: a synchronous start on a timer whose row names the guard «${r[5]}» — not within its own lines`); }
      }
    }
    for (const [k, rs] of byKey) {
      if (groups.has(k)) continue;
      const fixed = rs.filter((r) => r[2] !== 'timer');
      if (fixed.length) red.push(`${sync ? 'sync ' : ''}row ${rs[0][0]} ${rs[0][1]}: its sites are gone (DEAD) — strike the row`);
      else paid.push(`${rs[0][0]} ${rs[0][1]}: its whole timer debt paid — strike the row`);
    }
  };
  check(sites, rows, false);
  check(syncSites, syncRows, true);
  const debt = [...rows, ...syncRows].filter((r) => r[2] === 'timer').reduce((n, r) => n + r[3], 0);
  if (debt > debtSum) red.push(`the timer rows sum ${debt} — past TIMER_DEBT_SUM ${debtSum}: A NEW DIRECT START ON A TIMER (the debt only shrinks)`);
  else if (debt < debtSum) paid.push(`the timer rows sum ${debt} < TIMER_DEBT_SUM ${debtSum} — lower it`);
  return { red, paid, table, debt };
}
