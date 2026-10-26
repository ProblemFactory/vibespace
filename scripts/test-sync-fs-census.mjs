#!/usr/bin/env node
// test-sync-fs-census — lane hub-fuse-sync-guard. THE MAIN THREAD NEVER WAITS ON A STORAGE MOUNT, and the proof is a
// census over every synchronous fs call site, not a memory. 2026-10-23 21:56 PT the production hub answered nothing for
// 6.5 min: its main thread sat in the kernel's FUSE wait inside a sync fs call on an rclone storage mount (the journal at
// 21:44 had named one such call: statSync of a OneDrive Task Group row, src/task-groups.js _kindOf, 1209 ms).
//   ① every `fs.<x>Sync(` site of server.js, src/*.js, src/server/*.js, src/routes/*.js (scripts/sync-fs-census.mjs: acorn,
//      the enclosing scope, the path arguments) whose path is not a constant — a literal, the checkout, the data dir,
//      os.homedir(), /proc, or a file constant built only of those — is claimed by EXACTLY ONE row
//      [file, scope ('*' = the file's other scopes), n, proof, why, match?] (first row of the file whose scope — and match,
//      over «fn(paths)» — fits). n is EXACT: a new site in a covered scope reds its row. The proofs:
//        local-only  the path can never be on a mount — the why names its root
//        via-safefs  the call never runs on the main thread — a worker / child / device script (⑤ names its launcher)
//        guarded     a user / session / mount path: the guard refuses it on a storage mount before the syscall
//                    (src/server/sync-fs-witness.js), and the hot ones read a storage path off the loop (④)
//   ② no dead row, no unknown proof, every why says something
//   ③ RED CONTROLS over scratch sources: a site in a new file, one more site in a covered scope and a site in a scope no
//      row names are each RED; a CONSTANT path site needs no row (green)
//   ④ THE CONVERSIONS, run: a Task Group whose Context rows sit on a storage root makes NO main-thread sync call there
//      (the loop-blame hook counts them) and answers from SafeFs facts (reading → dir / the file's text); the SafeFs
//      worker's contextFiles / textHead answer exactly what task-groups' own walk / read answer on one local folder; the
//      project-dir decode never probes below a storage root; the other hot sites ask storageRootOf before their sync call
//   ⑤ every via-safefs file is started by its launcher (the launcher names it)
// Run: node scripts/test-sync-fs-census.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { filesOf, sitesOf } from './sync-fs-census.mjs';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (c, n, detail) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (detail === undefined ? '' : ' — ' + JSON.stringify(detail).slice(0, 1500))); } };

const PROOFS = new Set(['local-only', 'via-safefs', 'guarded']);
// [file, scope, n, proof, why, match?]
const ROWS = [
  ["server.js", "<module>", 8, "local-only", "GET / reads <checkout>/public/index.html + its asset stats; the 30 s boot sweep walks data/session-buffers, data/agentd, data/chat-frames."],
  ["server.js", "migrateHomeRename", 7, "local-only", "marker <checkout>/data/.home-migrated-*; stores = data/{mounts,layouts,task-groups,machine-mounts}.json + data/session-meta/*."],
  ["server.js", "ensureDir", 2, "local-only", "callers pass only data dirs: USAGE_CACHE_FILE's dir (usage-routes), SOCKETS_DIR/BUFFERS_DIR (ws-create), AGENTD_DIR (spawn/ssh, spawn/dial)."],
  ["server.js", "refreshWebuiPids", 1, "local-only", "metaPath = BUFFERS_DIR/<session id>.json; BUFFERS_DIR = <checkout>/data/session-buffers."],
  ["server.js", "checkAgentHookHealth", 2, "local-only", "HOOK_OPTOUT_FILE = <checkout>/data/.agent-hooks-optout, HOOK_CMD = <checkout>/data/bin/vibespace-hook.mjs (agent-tool-generators.js)."],
  ["src/account-material.js", "repointPoolSymlink", 4, "local-only", "linkPath/creds under <dataDir>/subs (accounts.js pool/session links) or data/browser-env/<key>.profile; targetDir is only symlink text."],
  ["src/account-material.js", "writePrivateFile", 4, "local-only", "dest = files of an account dir <dataDir>/<subsDirName>/<id> (accounts.js L678/L753/L760 _acctDir/subCredsPath)."],
  ["src/account-material.js", "moveCredentialArchives", 3, "local-only", "fromDir/intoDir = two account dirs under <dataDir>/subs (accounts.mergeSubscription, accounts.js:765)."],
  ["src/accounts.js", "*", 37, "local-only", "every path is under <dataDir> = <checkout>/data (server.js): subs/, codex-subs/, agy-subs/, pool-links/ — or the checkout's scripts/fixtures/oat-in-file.json"],
  ["src/acp-message-manager.js", "*", 1, "local-only", "this._buffersDir = BUFFERS_DIR <checkout>/data/session-buffers (mounts-plugins-wiring / cli-env); file named by the session id"],
  ["src/agent-routes.js", "*", 1, "local-only", "<checkout>/docs/agent/<f>, f from the fixed AGENT_DOC_TOPICS table"],
  ["src/agy-backfill.js", "*", 1, "local-only", "dir = <dataDir>/agy-subs/<id> (id must match ^agy-[0-9a-f]{6,32}$)"],
  ["src/agy-store-fs.js", "*", 5, "local-only", "root = <home>/.gemini/antigravity-cli, home = os.homedir() or data/agy-subs/<id> (agy-backfill homeOf, its only hub caller): the vendor CLI's own store"],
  ["src/app-secrets-seal.js", "*", 6, "via-safefs", "a child-process CLI (argv open|seal <file>) run by src/secret-service.py subprocess.run([node, sealer, mode, STORE]); never required by the hub"],
  ["src/app-secrets.js", "*", 5, "local-only", "every path is <dataDir>/desktop-apps/<id>/portal/{secrets store, bus} — dir = machine.logRoot/<id> (desktop-app-keeper.js:778-779)."],
  ["src/app-system-serve.js", "*", 3, "local-only", "shimDir = <home>/.vibespace/sysroot/bin (HOME dot-dir); shim must have dirname === shimDir, opened O_NOFOLLOW"],
  ["src/browser-facts.js", "isShimFile", 1, "local-only", "p = <dir>/agent-browser for each hub-env PATH dir, or the CLI pin confined under <dataDir>/browser-tools (resolveRealBinary)"],
  ["src/browser-facts.js", "isExecFile", 1, "local-only", "p = <dir>/agent-browser for each hub-env PATH dir, or the CLI pin confined under <dataDir>/browser-tools (resolveRealBinary)"],
  ["src/browser-facts.js", "cliPinReader", 1, "local-only", "<dataDir>/browser-tools/cli-pin.json"],
  ["src/browser-facts.js", "treeUsage", 1, "local-only", "/proc/<pid>/cmdline (procRoot defaults to /proc)"],
  ["src/browser-facts.js", "readSingletonLock", 1, "local-only", "dir = a Chrome user-data dir: profile dirs under ~/.agent-browser or <dataDir>/browser-profiles, or the hub-minted ephemeral dir"],
  ["src/browser-facts.js", "removeSingletonFiles", 2, "local-only", "dir = a Chrome user-data dir: profile dirs under ~/.agent-browser or <dataDir>/browser-profiles, or the hub-minted ephemeral dir"],
  ["src/browser-facts.js", "singletonLeft", 1, "local-only", "dir = a Chrome user-data dir: profile dirs under ~/.agent-browser or <dataDir>/browser-profiles, or the hub-minted ephemeral dir"],
  ["src/browser-facts.js", "readDevToolsPort", 1, "local-only", "dir = a Chrome user-data dir: profile dirs under ~/.agent-browser or <dataDir>/browser-profiles, or the hub-minted ephemeral dir"],
  ["src/browser-facts.js", "dirLaunchStamp > m", 2, "local-only", "f = <profile dir>/DevToolsActivePort|SingletonLock; profile dirs under ~/.agent-browser or <dataDir>/browser-profiles"],
  ["src/browser-facts.js", "<module>", 2, "local-only", "CHECKOUT probe: __dirname and its two parents (server.js / package.json)"],
  ["src/browser-facts.js", "runDir", 2, "local-only", "got.dir = ensureDaemonCwd's private dir under os.tmpdir() or /tmp; CHECKOUT = the checkout"],
  ["src/browser-facts.js", "makeBrowserTmpDir", 4, "local-only", "v.dir = browserTmpDir: <dataDir>/browser-env/tmp, else /var/tmp/vibespace-<uid>/browser-tmp or os.tmpdir()"],
  ["src/browser-serve.js", "exists", 1, "local-only", "FSX.exists probes for the machine-ready facts: PATH dirs (+ %APPDATA%\\npm) and system Chrome installs (/Applications, Program Files)"],
  ["src/browser-serve.js", "list", 1, "local-only", "FSX.list reads ~/.agent-browser/browsers and the Playwright / Puppeteer caches (~/.cache or their env-named dirs)"],
  ["src/browser-serve.js", "*", 16, "local-only", "every path is under homeDir (os.homedir()): ~/.vibespace/browser-serve/<ns>[.build].json, ~/.agent-browser/config.json, placeOf's ~/.agent-browser/vs-bp-<id>"],
  ["src/browser-verbs.js", "*", 4, "local-only", "<os.tmpdir()|/tmp>/vibespace-browser-cwd-<uid> and the checkout realpath (its only caller, browser-facts.js)"],
  ["src/channel-outbox-files.js", "*", 9, "local-only", "root = store.dir = <dataDir>/channels (channels-outbound.js / channels-auth.js); folders named by the engine's own proposal ids (ID_RE), never an agent's name"],
  ["src/channel-store.js", "writeJsonAtomic", 3, "local-only", "tmp beside `file`; every caller passes a data/ file: this store's <dataDir>/channels, integration-store, provider-store, voice ledger, hook-root memo, desktop machines, passkeys"],
  ["src/channel-store.js", "writeBuffersAtomic", 2, "local-only", "indexFile / poll-stamps.json under this store's dir = <dataDir>/channels (channels-engine createChannelStore, dataDir = server.js <checkout>/data)"],
  ["src/channel-store.js", "createChannelStore > writeIndex", 1, "local-only", "verifyTo = env VIBESPACE_CHANNELS_INDEX_VERIFY, an operator/test drift-log path set on the hub's own env, never a user, session or mount path"],
  ["src/channel-store.js", "*", 52, "local-only", "every path is under dir = <dataDir>/channels (createChannelStore opts.dir from channels-engine; dataDir = server.js <checkout>/data); account/conv ids safeSeg-encoded"],
  ["src/claude-lock-capture.js", "*", 3, "local-only", "lock dir = ~/.claude/sessions (session-store SESSIONS_DIR); sidecar = <BUFFERS_DIR>/<id>.json in data/buffers (boot-restore / ws-create)"],
  ["src/cli-identity.js", "procStartTicks", 1, "local-only", "`${procRoot || '/proc'}/<pid>/stat` — /proc."],
  ["src/codex-fork-ledger-purge.js", "_writeAtomic", 2, "local-only", "only caller writes <dataDir>/usage-history/events-*.ndjson; dataDir from the boot migration (migrations.js:644)."],
  ["src/codex-fork-ledger-purge.js", "_forkInstant", 1, "local-only", "fp = a rollout under codexSessionsDir = $CODEX_HOME|~/.codex /sessions (migrations.js:644), the vendor CLI's own dir."],
  ["src/codex-fork-ledger-purge.js", "purgeCodexForkReplays", 4, "local-only", "<dataDir>/usage-history, <dataDir>/archive and $CODEX_HOME|~/.codex/sessions (one-shot boot migration, migrations.js:644)."],
  ["src/codex-session-store.js", "*", 3, "local-only", "the ~/.codex/sessions tree (CODEX_SESSIONS_DIR walk) and <dataDir>/session-buffers/<id>.json"],
  ["src/desktop-display.js", "binOnPath", 1, "local-only", "p = <PATH dir>/<bare name> (names with / refused): the hub process env's PATH bin dirs, never a session/user folder."],
  ["src/desktop-display.js", "assertExecutable", 1, "local-only", "callers pass binaries resolved by binOnPath/hostFacts (ctx.bins.*, plan.busArgv[0] from portalBins): PATH / /usr/libexec."],
  ["src/desktop-display.js", "browserConfinement", 3, "guarded", "binPath at launch = desktop-serve resolveExec(row.exec): a registered app's exec can be ANY absolute path an agent/person declared (app-kinds/registered.js)."],
  ["src/desktop-display.js", "writeXauthority", 2, "local-only", "file = authFile = <dataDir>/desktop-apps/<id>/Xauthority (desktop-serve bringUp appDir; logRoot under data)."],
  ["src/desktop-display.js", "xpraWwwDir", 1, "local-only", "candidates: operator env XPRA_WWW_DIR, <xpra PATH prefix>/share/xpra/www, /usr/share|/usr/local/share xpra dirs."],
  ["src/desktop-display.js", "rdpBuildFacts", 1, "local-only", "binPath = f.bins[rdp client] from hostFacts' binOnPath (desktop-serve L805/L868): a PATH binary."],
  ["src/desktop-display.js", "xpra-seamless", 1, "local-only", "ctx.authFile = <dataDir>/desktop-apps/<id>/Xauthority (desktop-serve bringUp L1129)."],
  ["src/desktop-display.js", "portalBins", 1, "local-only", "p = /usr/libexec | /usr/lib/xdg-desktop-portal | /usr/lib + a fixed portal binary name."],
  ["src/desktop-display.js", "notifySinkFacts", 1, "local-only", "sink = NOTIFY_SINK_FILE = <checkout>/src/notify-sink.py (no caller overrides it)."],
  ["src/desktop-display.js", "startPortalBus", 5, "local-only", "plan from desktop-apps portalPlan: dirs/files/sock under <dataDir>/desktop-apps/<id>/portal (desktop-serve appDir)."],
  ["src/desktop-display.js", "unmountUnder", 1, "local-only", "mountinfo = /proc/self/mountinfo (default; the only caller desktop-serve L1441 passes none)."],
  ["src/desktop-serve.js", "install > registry > execHere", 1, "guarded", "an app's program path on every catalog GET: on a STORAGE mount it is listed as it reads (never a stat from the loop; its launch says by name if it is not there); a local one is checked"],
  ["src/desktop-serve.js", "install > resolveExec", 1, "guarded", "statSync of the launch exec: a registered variant or an ad-hoc POST /api/desktop/apps body.exec (person/agent named path)"],
  ["src/desktop-serve.js", "install > resolveCwd", 1, "guarded", "statSync of the launch cwd: body.cwd / a registered variant cwd (any folder a person/agent names)"],
  ["src/desktop-serve.js", "*", 7, "local-only", "store <checkout>/data/desktop-apps.json and per-app dirs data/desktop-apps/<da-id>/ (logRoot; app.log, portal/notify.jsonl, portal/run/secrets.key)"],
  ["src/device-audit.js", "*", 5, "local-only", "f = <dataDir>/device-audit.jsonl(.1), dataDir = HostManager dataDir = <checkout>/data (server.js new HostManager)"],
  ["src/device-mount.js", "*", 1, "local-only", "statfs runs only when vfsCacheDir is passed — the one caller (machine-mounts _up) never passes it"],
  ["src/discovery-facts.js", "*", 2, "local-only", "readHeadText fp = a codex rollout under ~/.codex/sessions (adapters/codex extractCodexThreadMeta via codex-session-store / harness forkChain); agentd's call runs on the device"],
  ["src/exit-proxy.js", "ExitProxyManager.audit", 3, "local-only", "f = <dataDir>/AUDIT_FILE (+ .1); dataDir = <checkout>/data (new ExitProxyManager at server.js:1419)."],
  ["src/exit-proxy.js", "ExitProxyManager.auditTail", 2, "local-only", "f = <dataDir>/AUDIT_FILE or its .1; dataDir = <checkout>/data (server.js:1419)."],
  ["src/exit-proxy.js", "ExitProxyManager._localTarget > lstat", 1, "guarded", "physicalPath walks the agent-named pull target (POST /api/agent/exit/pull body.local) and the session's cwd component by component."],
  ["src/exit-proxy.js", "ExitProxyManager._localTarget > readlink", 1, "guarded", "physicalPath readlinks components of the agent-named local path (body.local) and of session.cwd — may sit under a storage mount."],
  ["src/exit-proxy.js", "ExitProxyManager._localTarget > spell", 1, "local-only", "d is one of the fixed allow roots: os.tmpdir(), ~/Downloads, os.homedir(), this.dataDir (<checkout>/data)."],
  ["src/exit-proxy.js", "ExitProxyManager._transferHeld > dirIdOf", 1, "guarded", "d = dirname of the agent-named pull target (body.local, fenced to project cwd / tmp / ~/Downloads — the cwd can be a mount)."],
  ["src/exit-proxy.js", "ExitProxyManager._transferHeld", 6, "guarded", "target/part/dir/now = the agent-named pull destination (body.local) in the session's project dir; DOOR.blocked(target) precedes only the L849 stat."],
  ["src/exit-proxy.js", "ExitProxyManager._transferHeld > mine", 1, "guarded", "p = `${target}.<hex>.vs-part` or its /proc/self/fd name — next to the agent-named pull target (body.local)."],
  ["src/fixture-ledger-purge.js", "*", 9, "local-only", "every path is under dataDir (migrations.js one-shot passes <checkout>/data): usage-history/, usage-anchors/, archive/"],
  ["src/gmail-sync.js", "GmailSync._seenIds > scan", 1, "guarded", "a gmail storage's folder: the sync worker's own LOCAL folder (its provider row is filesystem:false — never a storage root); a custom path under a FUSE mount is refused by the guard and the sync says its error"],
  ["src/gmail-sync.js", "GmailSync._syncOnce", 2, "guarded", "the gmail folder's state file (a LOCAL folder: filesystem:false row); under a FUSE mount the guard refuses it"],
  ["src/gmail-sync.js", "GmailSync._saveState", 2, "guarded", "the gmail folder's state file (a LOCAL folder: filesystem:false row); under a FUSE mount the guard refuses it"],
  ["src/gmail-sync.js", "GmailSync._writeMessage", 3, "guarded", "a gmail message file in its folder (a LOCAL folder: filesystem:false row); under a FUSE mount the guard refuses it"],
  ["src/harness-config.js", "*", 18, "local-only", "the vendor CLI's own config files: path.join(home||os.homedir(), ...rel) (~/.claude/settings.json, ~/.codex/config.toml, hooks.json), rel = bare segments; a symlink's target = the user's dotfile"],
  ["src/hosts.js", "HostManager.constructor", 1, "local-only", "this._cmDir = os.tmpdir()/vs-cm-<uid>, the hub's own ssh ControlPath scratch dir (fixed in the constructor)."],
  ["src/hosts.js", "HostManager._persistDiscovery", 2, "local-only", "tmp/this._discFile = <dataDir>/remote-sessions-cache.json(.tmp); dataDir = <checkout>/data (new HostManager at server.js:1164)."],
  ["src/hosts.js", "HostManager._load", 1, "local-only", "this._file = <dataDir>/hosts.json (+ .corrupt-<ts> backup); dataDir = <checkout>/data from server.js:1164."],
  ["src/hosts.js", "HostManager._save", 2, "local-only", "tmp/this._file = <dataDir>/hosts.json(.tmp); dataDir = <checkout>/data from server.js:1164."],
  ["src/hosts.js", "HostManager.migrateDialTokenFile", 3, "local-only", "only caller server.js:1170 passes path.join(AGENTD_DIR, 'dial-tokens.json'); AGENTD_DIR = <checkout>/data/agentd."],
  ["src/hosts.js", "HostManager.add", 1, "local-only", "kp = this._sshDir/<host-id>.key with _sshDir = <dataDir>/ssh and id minted as host-<8 hex> here."],
  ["src/hosts.js", "HostManager.remove", 2, "local-only", "unlink only when h.keyPath startsWith this._sshDir (<dataDir>/ssh); rmSync is <dataDir>/remote-jsonl/<id>."],
  ["src/hosts.js", "HostManager.sweepJsonlCache", 5, "local-only", "base = <dataDir>/remote-jsonl and its host subdirs/files (boot sweep from exit-routes.js:227); the hub's own transcript cache."],
  ["src/hosts.js", "HostManager.exportBundle", 1, "local-only", "reads h.keyPath only when it startsWith this._sshDir = <dataDir>/ssh (uploaded per-host keys)."],
  ["src/hosts.js", "HostManager.importBundle", 1, "local-only", "kp = path.join(this._sshDir, h.id + '.key') — rebased under <dataDir>/ssh (id from the imported config bundle, never a folder)."],
  ["src/hosts.js", "HostManager.installAgentTools", 1, "local-only", "toolDir = AGENT_BIN_DIR = <checkout>/data/bin (exit-routes.js:353 route passes it)."],
  ["src/hosts.js", "HostManager.installAgentd", 7, "local-only", "bundlePath = <checkout>/data/bin/vibespace-agentd.js (dial-pairing.js:358); stage = mkdtemp under os.tmpdir() vs-agentd-stage-."],
  ["src/hosts.js", "HostManager.harvestUsage", 1, "local-only", "scannerPath = <checkout>/data/bin/vibespace-usage-scan (server.js:275 USAGE_SCANNER_PATH; usage-routes.js:475 same file)."],
  ["src/hosts.js", "*", 25, "local-only", "cachePath = <dataDir>/remote-jsonl/<hostId>/<cacheRel> (+ .meta/.tmp, its dirname); ids regex-checked; _appendDeltaAt/_healGapIsStillOurs get it only from here."],
  ["src/incident.js", "*", 23, "via-safefs", "captureLocal + its copy/hash helpers run only in src/server/incident-freeze-worker.js, a one-worker SafeFs pool incident-wiring.js freezeOffLoop opens per POST /api/incident"],
  ["src/input-inject.js", "*", 4, "via-safefs", "createInjector is only called by src/agentd/agentd.js (the device daemon process, never the hub); stubFile = env VIBESPACE_INPUT_STUB_FILE test stub"],
  ["src/jobs.js", "*", 45, "local-only", "every path is under deps.dataDir = <checkout>/data (jobs-wiring create, server.js): jobs*.json, jobs.lock, job-logs/<jb-hex>/<runTs>/, job-notifications-read/, job-secrets.json, bin/"],
  ["src/ledger-slot-backfill.js", "*", 16, "local-only", "boot migration over dataDir = <checkout>/data (migrations.js): usage-history/, archive/, subs/, accounts.json, usage-anchors/"],
  ["src/login-state.js", "*", 2, "local-only", "credsPath = a CLI login file: <dataDir>/subs/<id>/.credentials.json (accounts.subCredsPath), ~/.claude/.credentials.json or <CODEX_HOME>/auth.json"],
  ["src/machine-mounts.js", "*", 7, "local-only", "only the store files under dataDir = <checkout>/data (server.js new MachineMounts): machine-mounts.json, host-mounts.json, device-mounts.json"],
  ["src/machine-probes.js", "*", 5, "local-only", "HOME dot-files (~/.claude, ~/.claude.json, ~/.codex, ~/.vibespace/subs), PATH dirs, the boot-resolved claude/codex binaries"],
  ["src/migration-runner.js", "*", 4, "local-only", "ledgerPath = <dataDir>/migrations.json (server/migrations.js, vault-engine); the agentd caller is the device daemon's own process"],
  ["src/mounts.js", "MountManager._fastBin", 5, "local-only", "binPath = <dataDir>/bin/rclone (rcloneBin, this.dataDir from the constructor); the copy cache is ~/.cache/vibespace"],
  ["src/mounts.js", "MountManager._onNetworkFs", 2, "local-only", "instance: realpath of data/bin/rclone (only caller _fastBin); static: statfs of rc socket dir candidates $XDG_RUNTIME_DIR/<rc dir>, /tmp/vs-mounts-<uid> (rcSocketPath)"],
  ["src/mounts.js", "MountManager._save", 2, "local-only", "this._file = <dataDir>/mounts.json (constructor)"],
  ["src/mounts.js", "MountManager.update", 1, "guarded", "rmSync of <pathOf(m)>/<row.syncStateFile>: pathOf = the storage's mountpoint (m.customPath or <mountBase>/<Name>), a path inside the storage folder"],
  ["src/mounts.js", "MountManager._rcSocketReady", 1, "local-only", "pick.path = rcSocketPath: $XDG_RUNTIME_DIR/<rc dir>/<id>.sock or /tmp/vs-mounts-<uid>/<id>.sock, refused when under the data dir or on a network fs"],
  ["src/mounts.js", "MountManager._openMountLog", 3, "local-only", "this._logDir = <dataDir>/mount-logs (constructor): <id>.log and its .1 rotation"],
  ["src/mounts.js", "MountManager.tailMountLog", 1, "local-only", "this._logDir = <dataDir>/mount-logs (constructor): <id>.log"],
  ["src/mounts.js", "MountManager._statfsType", 1, "guarded", "statfs of the vfs cache dirs (data/ or ~/.cache, or the owner's override): an override on a storage mount is refused by the guard"],
  ["src/mounts.js", "MountManager._cacheCandidates", 3, "guarded", "the cache root probe at a remount (~/.cache/vibespace/vfs-cache, or the owner's override): an override on a storage mount is refused by the guard"],
  ["src/mounts.js", "MountManager._placeCache", 2, "guarded", "mkdir of the placed vfs cache dir (data/, ~/.cache or the override): an override on a storage mount is refused by the guard"],
  ["src/mounts.js", "MountManager._mountGmail", 1, "guarded", "mkdir of a gmail row's folder (filesystem:false: a LOCAL folder, never a storage root); under a FUSE mount the guard refuses it"],
  ["src/mounts.js", "MountManager._mintViaMc", 2, "local-only", "policyFile = os.tmpdir()/vs-policy-<rand>.json, written and removed by the hub itself"],
  ["src/node-runtime.js", "*", 7, "local-only", "root = the instance data dir (data/runtime, runtime-boot.js) or the agentd device root; provision runs in runtime-check.mjs / agentd"],
  ["src/opencode-serve.js", "writeJsonAtomic", 3, "local-only", "only caller writeRecord passes recordPath = <dataDir>/opencode-serve.json; dataDir = <checkout>/data (cli-env.js:234)."],
  ["src/opencode-serve.js", "ensureServeCwd", 4, "local-only", "dir = <dataDir>/opencode-serve/cwd (+ .git); dataDir = <checkout>/data (cli-env.js:234)."],
  ["src/opslog.js", "_activate", 1, "guarded", "appendFileSync to $VIBESPACE_OPSLOG_DIR/server-<day>.log at process exit — a deployment dir that is typically a kernel-mounted CephFS (network storage)"],
  ["src/peer-messaging.js", "*", 4, "local-only", "REGISTRY_DIR = ~/.claude/sessions (<pid>.json + .key beside) and the CLI's own messagingSocketPath socket"],
  ["src/port-forward.js", "*", 2, "local-only", "its only writeJsonAtomic caller (_persist) writes this.file = <dataDir>/port-forwards.json"],
  ["src/proc-identity.js", "*", 4, "local-only", "/proc (PROC_ROOT; opts.procRoot is only a test override): <pid>/stat, self/stat, sys/kernel/random/boot_id"],
  ["src/quota-model-migrate.js", "*", 4, "local-only", "cacheDir = <dataDir>/usage-cache, archiveDir = <dataDir>/archive (migrations.js one-shot backfill)"],
  ["src/rate-limit-capture.js", "captureRateLimitEvent", 2, "local-only", "fileFor(id) = usage-write cacheFileFor(cacheDir, id); every caller's cacheDir = <dataDir>/usage-cache (USAGE_CACHE_DIR)."],
  ["src/reading-repair.js", "*", 17, "local-only", "every dir derives from dataDir = <checkout>/data (migrations.js, usage-pool-engine repairIdentityAnchors, server.js prefetch): usage-cache, usage-anchors, usage-history, archive"],
  ["src/remote-fs.js", "*", 1, "local-only", "outPath = a fresh mkdtemp dir under os.tmpdir() (routes/files.js remoteToLocalTmp); the remote side is read over the device link"],
  ["src/routes/browser-trace.js", "*", 2, "local-only", "fp = framePath (data/browser-trace/<scope>/<entry file>) or recordingPath (data/browser-recordings/<bp-id>/<validated name>)"],
  ["src/routes/channels.js", "route:GET /api/channels/avatar", 1, "local-only", "r.file = channel-store avatarGet: <dataDir>/channels/<account>/avatars/<sha1(author)> (channels-engine.js:519)."],
  ["src/routes/editor.js", "registerEditorRoutes > route:POST /api/editor/signal", 2, "guarded", "filePath / signalPath come straight from the POST body (normally the CLI's Ctrl+G temp file, but unchecked — any path)"],
  ["src/routes/files.js", "remoteToLocalTmp", 3, "local-only", "hit.tmp / v0.tmp sit in a mkdtemp dir under os.tmpdir() ('webui-remote-') this function made for a remote preview pull"],
  ["src/routes/files.js", "route:POST /api/upload", 5, "local-only", "file.path / f.path are multer temp files under /tmp/claude-webui-uploads/ (multer dest); the dest-side ops already go through SafeFs"],
  ["src/routes/files.js", "route:POST /api/paste-image", 1, "local-only", "tmpPath = os.tmpdir()/claude-paste-<ts>.<ext>, a scratch file this route makes"],
  ["src/routes/files.js", "route:POST /api/archive/extract-entry", 3, "local-only", "rTmp / tmpDir are mkdtemp dirs under os.tmpdir() ('webui-archive-') made by this route"],
  ["src/routes/files.js", "writeExtractJournal", 2, "local-only", "EXTRACT_JOURNAL = <checkout>/data/extract-journal.json (+ .tmp)"],
  ["src/routes/files.js", "crossHostTransfer > isDir", 1, "guarded", "safePath(src) = the local source a person picked in a cross-host copy/move (POST body)"],
  ["src/routes/files.js", "crossHostTransfer > exists", 1, "guarded", "safePath(dest) = the local destination a person picked in a cross-host copy/move (POST body)"],
  ["src/routes/files.js", "crossHostTransfer", 12, "guarded", "dParent / stageLocal / dPath / part / src all derive from the request body's src/dest (safePath) — a person's chosen local folder, mounts included"],
  ["src/routes/persistence.js", "*", 10, "local-only", "every path is under dataDir = <checkout>/data (setupPersistence, server.js): layouts, layout-history/, settings, user-state — or ~/.claude, ~/.codex creds"],
  ["src/routes/sessions.js", "realCwdOf", 1, "guarded", "a session cwd's realpath on every /api/sessions rebuild (cached): never on a STORAGE mount (storageRootOf ⇒ null) nor a blocked one; a local / home cwd once"],
  ["src/routes/sessions.js", "setup > route:GET /api/subagent-messages", 4, "local-only", "under ~/.claude/projects (os.homedir()); cwd only via cwdToProjectDir (dashed name); query ids pick entries (claudeSessionId/agentId not regex-checked)"],
  ["src/routes/sessions.js", "setup > findWorkflowSnapshot > tryPath", 1, "local-only", "p = ~/.claude/projects/<projDir>/<sid>/workflows/<runId>.json (cwd only via cwdToProjectDir)"],
  ["src/routes/sessions.js", "setup > findWorkflowSnapshot", 1, "local-only", "base = ~/.claude/projects/<dir> (the CLI's transcript tree)"],
  ["src/routes/sessions.js", "setup > findWorkflowRunDir > tryDir", 2, "local-only", "p = ~/.claude/projects/<dir>/<sid>/subagents/workflows/<runId> (cwd only via cwdToProjectDir)"],
  ["src/routes/sessions.js", "setup > findWorkflowRunDir", 1, "local-only", "base = ~/.claude/projects/<dir> (the CLI's transcript tree)"],
  ["src/routes/sessions.js", "setup > journalAttempts", 1, "local-only", "runDir from findWorkflowRunDir — under ~/.claude/projects"],
  ["src/routes/sessions.js", "setup > route:GET /api/workflow", 5, "local-only", "fp / runDir from findWorkflowSnapshot / findWorkflowRunDir — under ~/.claude/projects (runId regex-checked)"],
  ["src/routes/sessions.js", "setup > _runSessionsSweep", 1, "local-only", "BUFFERS_DIR = <checkout>/data/session-buffers (server.js ctx)"],
  ["src/routes/window-targets.js", "*", 1, "local-only", "r.file = the engine's screenshot under data/window-shots/ (window-targets-engine screenshot())"],
  ["src/safe-fs-worker.js", "contextFiles > walk", 2, "via-safefs", "the SafeFs worker's contextFiles op (lane hub-fuse-sync-guard): the Task Group context walk of a row on a storage mount, run in the pool's worker thread"],
  ["src/safe-fs-worker.js", "textHead", 2, "via-safefs", "the SafeFs worker's textHead op (lane hub-fuse-sync-guard): a told context file's read, run in the pool's worker thread"],
  ["src/safe-fs-worker.js", "*", 56, "via-safefs", "runOp's OPS execute on SafeFs worker_threads (src/safe-fs.js spawns new Worker(safe-fs-worker.js); pool built in server.js); in-main runOp only as the pool-down fallback"],
  ["src/search-index-worker.js", "*", 9, "via-safefs", "a worker_threads script: src/server/search-index.js starts it with new Worker(workerFile); it throws when isMainThread, so never runs on the hub main thread"],
  ["src/secret-box.js", "*", 17, "local-only", "every keyFile is a store key under the hub dataDir (data/.mounts-key, .accounts-key, integrations/channels keys, browser-passkeys.key, app-secrets) + the store files beside it"],
  ["src/secret-file.js", "*", 5, "local-only", "callers replace data/auth.json, data/agentd attach configs, data/dropline-oauth.json, the frp relay file in data/ and ~/.vibespace/plugins/frp/frpc.toml"],
  ["src/server/account-usage-routes.js", "create > route:PATCH /api/accounts/pool/:id > ownLink", 1, "local-only", "accounts.sessionPoolLinkPath = <dataDir>/pool-links/<pool>/<sid> (both sanitized)"],
  ["src/server/account-usage-routes.js", "create > route:POST /api/accounts/:id/relogin", 1, "local-only", "accounts.subDir(id) = <dataDir>/subs/<id> (the member's credential dir)"],
  ["src/server/agent-tool-generators.js", "create > ensureDir", 2, "local-only", "called only for <checkout>/data/bin, data/bin/editor and data/usage-cache (rootDir from server.js)"],
  ["src/server/agent-tool-generators.js", "create > agentHooksStatus", 4, "local-only", "HOOK_FILES = the harness hook files (~/.claude/settings.json, ~/.codex/hooks.json: vendor CLI config, inject.hookFile) and their dirs"],
  ["src/server/agent-tool-generators.js", "create > realOr", 1, "local-only", "realpath of rootDir (the checkout), its .git / gitdir / commondir, os.tmpdir(), TMP_ROOTS and os.homedir()"],
  ["src/server/agent-tool-generators.js", "create > readRootFacts", 4, "local-only", "only caller rootVerdict passes rootDir (the checkout): its .git, the gitdir it names and that dir's commondir (the checkout's own git store)"],
  ["src/server/apps-engine.js", "*", 3, "local-only", "file = <dataDir>/app-proposals.json (apps-wiring passes <checkout>/data)"],
  ["src/server/apps-ops-door.js", "create > close", 2, "local-only", "sock = os.homedir()/.vibespace/apps/operator/ops.sock (socketPath; apps-wiring.js:33 passes no home)."],
  ["src/server/auto-cli-loop.js", "*", 1, "local-only", "d.USAGE_CACHE_DIR = <checkout>/data/usage-cache/<accountId>.json (server.js)"],
  ["src/server/auto-resume.js", "*", 3, "local-only", "file = <dataDir>/auto-resume.json (server.js passes <checkout>/data)"],
  ["src/server/auto-update.js", "*", 2, "local-only", "repoDir = the checkout: copies a tracked file into <checkout>/data/auto-update/<name>.pre-reset"],
  ["src/server/automation-engine.js", "*", 7, "local-only", "FILE/AUDIT = <checkout>/data/automation-keys.json + automation-audit.jsonl (mounts-plugins-wiring dataDir)"],
  ["src/server/boot-restore.js", "*", 18, "local-only", "SOCKETS_DIR / META_DIR / BUFFERS_DIR = <checkout>/data/{sockets,session-meta,session-buffers} (server.js); /proc-resolved wrapper files are dtach .buf there"],
  ["src/server/browser-attach-launch.js", "chromeExecutable", 2, "local-only", "PATH dirs of the keeper's sanitised base env + the Chrome binary names"],
  ["src/server/browser-attach-launch.js", "ownedDir", 4, "local-only", "socket dirs /tmp/vs-ab-<uid>[/<profileId>] (AT.attachSocketDir over B.SOCKET_DIR_BASE = \"/tmp\")"],
  ["src/server/browser-attach-launch.js", "readPortFile", 2, "local-only", "DevToolsActivePort in the profile's dir (keeper p.dir: ~/.agent-browser/vs-bp-*)"],
  ["src/server/browser-attach-launch.js", "spawnChrome", 4, "local-only", "portFile in p.dir (~/.agent-browser/vs-bp-*); logFile = <dataDir>/browser-env/attach/<id>.log (browser-keeper launch)"],
  ["src/server/browser-bindings.js", "*", 2, "local-only", "<dataDir>/browser-env/bindings.json (+ .tmp)"],
  ["src/server/browser-builds-keeper.js", "create > dirWritten", 1, "local-only", "p.dir = a local profile's Chrome dir: made under ~/.agent-browser/ (createProfile) or adopted only inside ~/.agent-browser | <dataDir>/browser-profiles; p.host skipped"],
  ["src/server/browser-builds-keeper.js", "*", 22, "local-only", "every path is under buildsRoot() = ~/.agent-browser/browsers (homeDir = os.homedir()) or installDir / installMarker() = <dataDir>/browser-tools"],
  ["src/server/browser-cli-install.js", "*", 7, "local-only", "<dataDir>/browser-tools: cliPrefix(version), its verified.json, install-running.json marker, install.log in installDir"],
  ["src/server/browser-cloak-install.js", "*", 11, "local-only", "installDir = <dataDir>/browser-tools (browser-keeper.js:5818): package.json, stamp, unpack marker, cloak-cache vdir; installMarker() = data/browser-tools/install-running.json."],
  ["src/server/browser-display-config.js", "*", 4, "local-only", "dir = <dataDir>/browser-env/display; base files = keeper configs in <dataDir>/browser-env (browser-keeper create)"],
  ["src/server/browser-env.js", "create > effectiveConfig", 1, "guarded", "the session folder's agent-browser.json at spawn: on a STORAGE mount it is reported not read (never a read from the loop); a local / home folder is read"],
  ["src/server/browser-env.js", "*", 26, "local-only", "under data/browser-env, data/browser-profiles/<key>, data/session-meta, data/browser-kept.json; ~/.agent-browser/config.json; /tmp/vs-ab-<uid>; production always passes pinnedDir: null"],
  ["src/server/browser-installs.js", "*", 4, "local-only", "installState.log = installDir/install.log, installDir = <dataDir>/browser-tools (browser-keeper.js)"],
  ["src/server/browser-keeper.js", "writeJsonAtomic", 2, "local-only", "callers pass <dataDir>/browser-profiles.json, <dataDir>/browser-env/machine-*.json + display/*.json, <dataDir>/browser-tools/cli-pin.json (create's dataDir)"],
  ["src/server/browser-keeper.js", "create > load", 4, "local-only", "registry dirs: profile dirs ~/.agent-browser/vs-bp-* (createProfile / adopt fence), <dataDir>/browser-profiles/<key>, or the keeper's own Chrome --user-data-dir"],
  ["src/server/browser-keeper.js", "create > pairsConfigFacts", 1, "local-only", "AGENT_BROWSER_CONFIG of the hub-made spawn pairs = <dataDir>/browser-env/<key>.json (browser-env.js configPathFor)"],
  ["src/server/browser-keeper.js", "create > onKeptDir", 1, "local-only", "readlink of an ephemeral p.dir = <dataDir>/browser-env/<key>.profile link or <dataDir>/browser-profiles/<key> (ephemeralDirOf over hub-made pairs)"],
  ["src/server/browser-keeper.js", "create > userConfig", 1, "local-only", "~/.agent-browser/config.json (homeDir + B.USER_CONFIG_REL) — the vendor CLI's own config"],
  ["src/server/browser-keeper.js", "create > machineConfigFile", 2, "local-only", "src = ~/.agent-browser/config.json; file = <dataDir>/browser-env/machine-<mark>.json (CONFIG_DIR)"],
  ["src/server/browser-keeper.js", "create > machineConfigFile > own", 2, "local-only", "file = <dataDir>/browser-env/machine-<mark>.json (CONFIG_DIR = dataDir/browser-env)"],
  ["src/server/browser-keeper.js", "create > createProfile", 1, "local-only", "mkdir only when no dir is handed in: d = ~/.agent-browser/<profileDirName(id)>"],
  ["src/server/browser-keeper.js", "create > adoptDirectory", 1, "guarded", "dir: the --adopt route is realpath-fenced to ~/.agent-browser|<dataDir>/browser-profiles, trace to ~/.agent-browser, but migrations.js passes ~/.agent-browser/config.json's profile unfenced"],
  ["src/server/browser-keeper.js", "create > removeProfile", 1, "local-only", "<dataDir>/browser-env/machine-*.json (CONFIG_DIR + markFileName)"],
  ["src/server/browser-keeper.js", "create > dirInoOf", 1, "local-only", "profile dirs (p.dir / reg.dirHosts keys): ~/.agent-browser/vs-bp-* or <dataDir>/browser-profiles/<key>"],
  ["src/server/browser-keeper.js", "create > dirTokOf", 1, "local-only", "the .vibespace-lineage marker inside a profile dir (~/.agent-browser/vs-bp-* or <dataDir>/browser-profiles/<key>)"],
  ["src/server/browser-keeper.js", "create > dirBearerOf", 1, "local-only", "reg.dirHosts keys = remembered profile dirs (~/.agent-browser/vs-bp-* or <dataDir>/browser-profiles/<key>)"],
  ["src/server/browser-keeper.js", "create > mintDirTok", 1, "local-only", "the .vibespace-lineage marker inside a profile dir (~/.agent-browser/vs-bp-* or <dataDir>/browser-profiles/<key>)"],
  ["src/server/browser-keeper.js", "create > lineageLedger", 8, "local-only", "<dataDir>/browser-lineage-journal.ndjson (+ its .tmp beside it)"],
  ["src/server/browser-keeper.js", "create > rememberDir", 1, "local-only", "a record's p.dir: ~/.agent-browser/vs-bp-* or <dataDir>/browser-profiles/<key> (stampLaunchHost / removeProfile)"],
  ["src/server/browser-keeper.js", "create > endpointOfDaemon", 1, "local-only", "DevToolsActivePort in the --user-data-dir (/proc argv) of a keeper-marked daemon's Chrome: a profile dir or <dataDir>/browser-env/tmp"],
  ["src/server/browser-keeper.js", "create > adoptScratch", 4, "local-only", "scratchDir = the conversation's kept dir <dataDir>/browser-profiles/<key> (routes/browser.js keptOwn / resolvedProfileDir); target ~/.agent-browser/vs-bp-*"],
  ["src/server/browser-keeper.js", "create > usableExe", 2, "guarded", "f can be the browser.cloak.executablePath setting (a path a person typed); other callers pass <dataDir>/browser-tools CLI files, PATH dirs, /proc exe"],
  ["src/server/browser-keeper.js", "create > cliWitnessRead", 1, "local-only", "<dataDir>/browser-tools/<install dir>/verified.json (cliPrefix)"],
  ["src/server/browser-keeper.js", "create > cliFolderOf", 1, "local-only", "<dataDir>/browser-tools/<install dir>/node_modules/agent-browser/package.json (cliPrefix)"],
  ["src/server/browser-keeper.js", "create > cliIdOf", 1, "local-only", "a CLI binary: the pin under <dataDir>/browser-tools, the hub PATH's agent-browser, or /proc/<pid>/exe of an adopted daemon"],
  ["src/server/browser-keeper.js", "create > readDirMajor", 1, "local-only", "\"Last Version\" in a profile dir (~/.agent-browser/vs-bp-* or <dataDir>/browser-profiles/<key>)"],
  ["src/server/browser-keeper.js", "create > pairsHoldDialogs", 1, "local-only", "AGENT_BROWSER_CONFIG of the hub-made spawn pairs = <dataDir>/browser-env/<key>.json"],
  ["src/server/browser-keeper.js", "create > pairsAutomationFlag", 1, "local-only", "AGENT_BROWSER_CONFIG of the hub-made spawn pairs = <dataDir>/browser-env/<key>.json"],
  ["src/server/browser-keeper.js", "create > holdsDialogsFor", 1, "local-only", "AGENT_BROWSER_CONFIG of an ephemeral record's hub-made pairs = <dataDir>/browser-env/<key>.json"],
  ["src/server/browser-kept.js", "*", 5, "local-only", "<dataDir>/browser-kept.json (+ .corrupt aside) and <dataDir>/browser-profiles/<key> (dirOf)"],
  ["src/server/browser-trace.js", "*", 33, "local-only", "traceRoot/recRoot/forgotten ledger under <checkout>/data (mounts-plugins-wiring rootDir); scope = bp-hex|ephemeral; profile dirs + orphans = top-level dirs under ~/.agent-browser"],
  ["src/server/channel-api.js", "*", 5, "local-only", "f = <dataDir>/channels/<cred>/api.ndjson (cred sanitized); dataDir from channels-wiring = server.js <checkout>/data"],
  ["src/server/channels-attention.js", "*", 2, "local-only", "FILE = <dataDir>/decision-examples.json; dataDir from channels-engine = server.js <checkout>/data"],
  ["src/server/channels-wiring.js", "livenessReader > dirReadable", 1, "local-only", "dirs = [~/.claude/projects] (no caller passes transcriptDirs; channels-wiring.js:97)."],
  ["src/server/channels-wiring.js", "livenessReader > metaOf", 2, "local-only", "metaDir = <dataDir>/session-meta (channels-wiring.js:97) and its *.json."],
  ["src/server/claude-signin.js", "*", 11, "local-only", "accounts.subDir(id) = data/subs/<id> (CLI config dir) and the 0700 scratch vs-signin-* the hub mkdtemps under tmpRoot = os.tmpdir()"],
  ["src/server/cli-cmd.js", "*", 1, "local-only", "boot-only: fixed bin dirs + PATH entries + a command name (xset/xauth/claude/codex)"],
  ["src/server/cli-env.js", "*", 2, "local-only", "rd = /run/user/<uid>; p = $XAUTHORITY, /run/user/<uid>/*auth*, ~/.Xauthority"],
  ["src/server/cli-registration.js", "*", 3, "local-only", "stateFile = data/cli-registration.json and data/claude-cli-dumps/<semver>.json under dataDir=<checkout>/data"],
  ["src/server/cluster-presets.js", "*", 4, "local-only", "the presets directory the cluster projects (the reader's own; set by the deployment) — deploy config, never a person-named or storage-mount path"],
  ["src/server/conversation-deliver.js", "*", 1, "local-only", "retryFile = <dataDir>/msg-retry.json and its .corrupt- aside; dataDir = server.js <checkout>/data"],
  ["src/server/csp-reports.js", "*", 5, "local-only", "file = <checkout>/data/csp-reports.jsonl (+ .1) or VIBESPACE_CSP_REPORTS_FILE, a chrome suite's scratch file (server.js create)"],
  ["src/server/decision-engine.js", "*", 9, "local-only", "F.memo / F.usage / F.journal = <dataDir>/decision-memo.json, decision-usage.json, decision-journal.jsonl"],
  ["src/server/desktop-access.js", "*", 1, "local-only", "knownFile = <dataDir>/desktop-machines.json (server.js passes <checkout>/data)"],
  ["src/server/desktop-app-keeper.js", "*", 2, "local-only", "remoteFile = <dataDir>/desktop-apps-hosts.json (server.js passes <checkout>/data)"],
  ["src/server/desktop-webrtc.js", "pushMacHelper", 2, "local-only", "bin = helpersDir/vibespace-screen; helpersDir = HELPERS_DIR = <checkout>/data/bin/helpers."],
  ["src/server/device-alerts.js", "*", 3, "local-only", "ledgerFile = <dataDir>/device-alerts.json (+ .tmp)"],
  ["src/server/device-upgrade-watch.js", "*", 2, "local-only", "file = <checkout>/data/device-upgrades.json (server.js create dataDir)"],
  ["src/server/dial-health-watch.js", "*", 2, "local-only", "<dataDir>/dial-health.json (+ .tmp)"],
  ["src/server/dial-pairing.js", "*", 5, "local-only", "AGENTD_DIR = <checkout>/data/agentd (server.js): host-<id>.token, hub-id and the dir itself"],
  ["src/server/doc-engine.js", "*", 4, "local-only", "file = <dataDir>/doc-owners.json (server.js docEngine dataDir = <checkout>/data)"],
  ["src/server/exit-routes.js", "*", 1, "local-only", "toolDir = AGENT_BIN_DIR = <checkout>/data/bin; n = a tool name from HostManager.agentTools() echoed back by the host probe"],
  ["src/server/fd-gauge.js", "*", 3, "local-only", "procSelf = /proc/self: fd dir, limits, mountinfo (server.js passes no override)"],
  ["src/server/feedback-forward.js", "*", 3, "local-only", "file = <dataDir>/feedback-outbox.json (mounts-plugins-wiring passes <rootDir>/data)"],
  ["src/server/feedback-store.js", "*", 3, "local-only", "file = <dataDir>/feedback.json (mounts-plugins-wiring passes <checkout>/data)"],
  ["src/server/goal-sync.js", "create > checkClaudeGoalStatus", 3, "local-only", "fp = findSessionJsonlPath: ~/.claude/projects/*/<id>.jsonl or <checkout>/data/remote-jsonl/<host>/<id>.jsonl (cwd only encodes the projdir name)."],
  ["src/server/grants-migration.js", "readStore", 1, "local-only", "file = <dataDir>/<store rel>; dataDir = the boot migration's data dir (migrations.js:700)."],
  ["src/server/grants-migration.js", "migrate", 4, "local-only", "file = <dataDir>/hosts.json (+ .tmp) in the one-shot boot migration (migrations.js:700)."],
  ["src/server/grants-store.js", "*", 8, "local-only", "file / auditFile = <dataDir>/grants.json, grants-audit.jsonl (server.js create({dataDir: <checkout>/data}); forDir(dataDir) in migrations)"],
  ["src/server/host-tokens.js", "*", 10, "local-only", "agentdDir = AGENTD_DIR <checkout>/data/agentd (server.js) or the default <dataDir>/agentd (mounts-plugins-wiring.js)"],
  ["src/server/incident-freeze-worker.js", "runOp", 1, "local-only", "dir = <checkout>/data/incidents/<inc-id>; runs in the SafeFs incident-freeze worker, but its inlineRun fallback can run it on main."],
  ["src/server/incident-wiring.js", "*", 4, "local-only", "dir = INCIDENTS_DIR/<inc-id> (id regex-checked); INCIDENTS_DIR = <checkout>/data/incidents."],
  ["src/server/instance-url.js", "*", 3, "local-only", "file = <checkout>/data/instance-url.json (server.js create dataDir)"],
  ["src/server/integration-store.js", "*", 1, "local-only", "file = <checkout>/data/integrations.json (integrations-wiring dataDir from server.js)"],
  ["src/server/migrations.js", "create > run", 29, "local-only", "dataDir = <checkout>/data (rootDir: __dirname, server.js): settings.json, subs/, accounts.json, the pool journal, user-state.json + task-groups.json + archive/ (lane task-group-fanout: 2026-10-task-group-archived-members); L281 = ~/.agent-browser/config.json (vendor CLI config)", "^(?:lstatSync\\(path\\.join\\(subsDir,\\ d\\)\\)|readFileSync\\(f\\)|readFileSync\\(file\\)|readFileSync\\(jf\\)|readFileSync\\(out\\)|readFileSync\\(path\\.join\\(homeDir,\\ B\\.USER_CONFIG_REL\\)\\)|renameSync\\(f\\ \\+\\ '\\.tmp',\\ f\\)|renameSync\\(out\\ \\+\\ '\\.tmp',\\ out\\)|renameSync\\(tmp,\\ file\\)|statSync\\(file\\)|writeFileSync\\(f\\ \\+\\ '\\.tmp'\\)|writeFileSync\\(out\\ \\+\\ '\\.tmp'\\)|writeFileSync\\(tmp\\))$"],
  ["src/server/migrations.js", "create > run", 1, "guarded", "stat of the legacy profile dir = cfg.profile read from ~/.agent-browser/config.json: a path the user wrote into the vendor config, may be anywhere (default ~/.agent-browser/default-profile)"],
  ["src/server/migrations.js", "*", 32, "local-only", "each helper is called only with a dataDir path: task-groups.json, settings/plugins/integrations.json, channel-socks/, the kit folder the 2026-10 migration removes, hosts.json + archive/, desktop-apps/browser-profiles.json"],
  ["src/server/mount-health-watch.js", "*", 1, "local-only", "file = <checkout>/package.json (server.js create)"],
  ["src/server/mounts-plugins-wiring.js", "*", 2, "local-only", "<rootDir>/data/node-cache/<version>/<file>, version + file regex-allowlisted by node-runtime VERSION_RE/FILE_RE"],
  ["src/server/oat-mint.js", "*", 8, "local-only", "per-mint 0700 scratch dirs vs-oat-mint-* made by mkdtemp under tmpRoot = os.tmpdir() (create default; account-usage-routes passes none) + their boot sweep"],
  ["src/server/ops-routes.js", "*", 1, "local-only", "CI_HEAVY_DIR = <rootDir>/data/ci-heavy; entry names regex-filtered (<sha>.green|red|pid|skipped)"],
  ["src/server/plugin-install.js", "stageFromPath", 1, "guarded", "existsSync of <src>/vibespace-plugin.json where src = the directory a person names for Install plugin… (source=path) or its recorded value on Update"],
  ["src/server/plugin-install.js", "*", 22, "local-only", "data/plugins, plugins-state, plugins-staging/st-*, plugins-trash under rootDir=<checkout>; the .vsp upload is multer temp under os.tmpdir()/vibespace-plugin-uploads"],
  ["src/server/plugin-loader.js", "*", 18, "local-only", "data/plugins/<dir> (Dirent.isDirectory: symlinks skipped), data/plugin-registry.json, shims in data/bin; route/theme paths confined inside rec.dir; lane engine-distribution: D2 reads the just-installed data/plugins/<id>/vibespace-plugin.json"],
  ["src/server/published-pages.js", "create > publish", 2, "guarded", "abs = path.resolve(b.path) from the POST body — the file a person/agent publishes, any folder, possibly under a storage mount"],
  ["src/server/published-pages.js", "*", 9, "local-only", "storeFile / pagesDir under <dataDir> (published-pages.json, published-pages/<id>.html|.bin)"],
  ["src/server/sealed-json.js", "*", 3, "local-only", "file = <checkout>/data/dropline-oauth.json (the only caller, mounts-plugins-wiring.js)"],
  ["src/server/search-index.js", "*", 3, "local-only", "localDiskVerdict walks up ~/.vibespace/db/<hash> (indexDirFor, os.homedir()); listConversations stats <dataDir>/remote-jsonl/<host>/<sid>.jsonl"],
  ["src/server/session-stdout.js", "*", 20, "local-only", "META_DIR data/session-meta, BUFFERS_DIR data/session-buffers, data/exit-tombs and the dtach socket data/sockets/<name> — all <checkout>/data from server.js"],
  ["src/server/spend-guard.js", "*", 3, "local-only", "file = <dataDir>/spend-budget.json (usage-pool-engine passes <rootDir>/data)"],
  ["src/server/stash-handover.js", "*", 3, "local-only", "file = <dataDir>/stash-handover.json (server.js passes <checkout>/data)"],
  ["src/server/tls.js", "*", 2, "local-only", "pair = <dataDir>/tls/<domain>.crt|.key or the operator's VIBESPACE_TLS_CERT/KEY env (boot, before listen)"],
  ["src/server/unexpected-exit.js", "*", 1, "local-only", "deps.buffersDir = BUFFERS_DIR = <checkout>/data/session-buffers (server.js install)"],
  ["src/server/usage-pool-engine.js", "*", 27, "local-only", "USAGE_CACHE_DIR = <checkout>/data/usage-cache (server.js); READING_ARCHIVE, reset-credit-tries, session-buffers under rootDir/data; accounts' data/subs + data/pool-links"],
  ["src/server/usage-probe-log.js", "machineOauthAccount", 1, "local-only", "<home>/.claude.json, home = $HOME, data/subs/<id> or its .probe-config, or an oat-mint scratch dir: vendor CLI config / hub stores"],
  ["src/server/usage-probe-log.js", "readProbeLog", 1, "local-only", "dataDir = dirname(data/usage-cache) = <checkout>/data: usage-probe-log.ndjson and .1"],
  ["src/server/user-input.js", "createUserInputSender > send", 2, "local-only", "framesDir = <checkout>/data/chat-frames (default; server.js:1498 passes none); fp = framesDir/<sessionId>-<ts>.json."],
  ["src/server/vault-engine.js", "writeAtomic", 4, "local-only", "only caller writeRecord passes FILE = <dataDir>/vault.json; dataDir = <checkout>/data (mounts-plugins-wiring.js:84)."],
  ["src/server/vault-engine.js", "shred", 4, "local-only", "callers pass a store key file <dataDir>/<STORE_KEYS name> (sealOne) or <checkout>/data/agentd/host-<id>.token (secretAdopt via host-tokens.js)."],
  ["src/server/vault-engine.js", "create > keyRead", 2, "local-only", "file = keyFile from secret-box lawfulKey (vaultOf matches only when dirname(keyFile) = this vault's dataDir) or <dataDir>/<name>."],
  ["src/server/vault-engine.js", "create > peek", 1, "local-only", "keyFile from secret-box refusal() (a key file in this vault's dataDir = <checkout>/data) or <dataDir>/<name>."],
  ["src/server/vault-engine.js", "create > secretAdopt", 2, "local-only", "only caller host-tokens.js (L81/L111) passes <agentdDir>/host-<id>.token, agentdDir = <checkout>/data/agentd."],
  ["src/server/vault-engine.js", "*", 11, "local-only", "FILE = <dataDir>/vault.json, key files <dataDir>/<STORE_KEYS name> (+ .sealed) and <dataDir>/agentd; dataDir = <checkout>/data."],
  ["src/server/vault-run-door.js", "writeJsonAtomic", 3, "local-only", "its only caller writes FILE = <dataDir>/vault-run.json (the door's switch store; dataDir = <checkout>/data from mounts-plugins-wiring)"],
  ["src/server/vault-run-door.js", "shredFile", 3, "local-only", "called only by shredDir over the door's own vs-vault-run-* dirs under runRoot() = $XDG_RUNTIME_DIR or os.tmpdir()"],
  ["src/server/vault-run-door.js", "readBounded", 1, "guarded", "reads data/vault-run.json and a run dir's .owner, AND a --file NAME=@path template the agent names (resolved in its cwd fence; DOOR.blocked asked first)"],
  ["src/server/vault-run-door.js", "shredDir", 2, "local-only", "the door's own 0700 run dirs (mkdtemp under $XDG_RUNTIME_DIR or os.tmpdir()): spawnRun, lock, boot sweep, closeAll"],
  ["src/server/vault-run-door.js", "create > lstat", 1, "guarded", "physOps for browser-verbs physicalPath over the run's cwd, the session cwd and template paths: folders the agent names"],
  ["src/server/vault-run-door.js", "create > readlink", 1, "guarded", "physOps for browser-verbs physicalPath over the run's cwd, the session cwd and template paths: folders the agent names"],
  ["src/server/vault-run-door.js", "create > spell", 1, "guarded", "realpath of the fence roots os.tmpdir(), ~/Downloads, os.homedir(), dataDir: ~/Downloads is a user folder that may be a link into a mount (unknown)"],
  ["src/server/vault-run-door.js", "create > resolveTool > isExe", 2, "guarded", "stat/access of argv[0] resolved against the run's cwd (inside the conversation's folder) or each PATH entry of agentEnv()"],
  ["src/server/vault-run-door.js", "create > resolveTool", 1, "guarded", "realpath of the argv[0] hit: cwd-relative (inside the conversation's folder) or a PATH entry"],
  ["src/server/vault-run-door.js", "create > run > writable", 1, "guarded", "access W_OK of the resolved program and its folder (cwd-relative or a PATH entry)"],
  ["src/server/vault-run-door.js", "create > spawnRun", 4, "local-only", "mkdtemp under runRoot() = $XDG_RUNTIME_DIR or os.tmpdir() (create's default; the wiring passes none), then .owner and f<slot> inside that 0700 dir"],
  ["src/server/vault-run-door.js", "create > sweep", 2, "local-only", "boot readdir/lstat of runRoot() ($XDG_RUNTIME_DIR or os.tmpdir()) for the door's own vs-vault-run-* dirs"],
  ["src/server/vault-totp.js", "writeJsonAtomic", 3, "local-only", "only caller writeGrants passes FILE = <dataDir>/vault-grants.json (the vault's data dir)."],
  ["src/server/voice-teach-engine.js", "*", 1, "local-only", "ledgerFile = <checkout>/data/voice-suggestions.json (mounts-plugins-wiring)"],
  ["src/server/window-targets-engine.js", "*", 5, "local-only", "lease/reach stores and screenshots under dataDir=<checkout>/data (window-live-wiring): window-shots/<handle>-<ts>-<pid>.png"],
  ["src/server/wrapper-files.js", "*", 3, "local-only", "BUFFERS_DIR (data/buffers) sidecar/buf pair, or the buf path a dtach master wrapper argv names, read from /proc/<pid>/cmdline"],
  ["src/session-store.js", "probeCandidate", 1, "guarded", "the project-dir decode's ONE probe: a storage path never reaches the existsSync (storageRootOf answers: a mount point is there, below it is not probed); a home / network path is witnessed"],
  ["src/session-store.js", "tmuxOnPath", 1, "local-only", "the hub process's PATH dirs + \"tmux\" (TTL-memoized)"],
  ["src/session-store.js", "*", 18, "local-only", "transcripts under ~/.claude/projects (cwd only names the projDir), ~/.claude/sessions, <checkout>/data/remote-jsonl, <dataDir>/session-buffers"],
  ["src/slot-transitions.js", "*", 2, "local-only", "<dataDir>/slot-transitions.jsonl and <dataDir>/archive/slot-transitions-*.jsonl"],
  ["src/sock-path.js", "ensureSocketDir", 3, "local-only", "dir = a socket dir pick: mounts rcSocketPath (XDG_RUNTIME_DIR or data dir, network fs refused) / agentd's own socket dir."],
  ["src/sock-path.js", "witnessOrRule", 2, "local-only", "root = VIBESPACE_AGENTD_ROOT or ~/.vibespace/agentd (agentd/client.js:120); p = the daemon's own socket path it wrote."],
  ["src/ssh-key.js", "*", 4, "local-only", "a 0700 scratch dir mkdtemp(os.tmpdir()/vs-key-) per imported key (exit-routes key import): the key body is the request's, every path is the hub's own scratch"],
  ["src/sync-store.js", "*", 5, "local-only", "filePath = <checkout>/data/{drafts,settings-sync,uploads-sync,stage-sync}.json (server.js new SyncStore, the only constructions)"],
  ["src/sysinfo.js", "memStat", 1, "local-only", "callers pass /sys/fs/cgroup/memory.stat, /sys/fs/cgroup/memory/memory.stat or /proc/meminfo."],
  ["src/sysinfo.js", "loadHistory", 1, "local-only", "_histFile = <dataDir>/sysinfo-history.json; dataDir = <checkout>/data (server.js:731 startWatch)."],
  ["src/sysinfo.js", "persistHistory", 2, "local-only", "tmp/_histFile = <checkout>/data/sysinfo-history.json (set by loadHistory from server.js:731)."],
  ["src/task-groups.js", "TaskGroupManager._listContextFiles > walk", 2, "guarded", "the Context-table folder walk (a person/agent-named folder): a row on a STORAGE mount takes the SafeFs road (contextFiles, src/storage-facts.js) — this walk runs for a local / home folder only"],
  ["src/task-groups.js", "TaskGroupManager._kindOf", 1, "guarded", "a Context row's stat: a STORAGE row answers from its SafeFs fact (stat, src/storage-facts.js; never read yet = reading) — this stat runs for a local / home row only"],
  ["src/task-groups.js", "TaskGroupManager._stat", 1, "guarded", "a Context row's stat (size / mtime): a STORAGE row answers from its SafeFs fact — this stat runs for a local / home row only"],
  ["src/task-groups.js", "TaskGroupManager._readText", 1, "guarded", "a told Context file's read: a STORAGE file answers from its SafeFs fact (textHead) — this read runs for a local / home file only"],
  ["src/task-groups.js", "TaskGroupManager.groupsForSession", 1, "guarded", "a session cwd's realpath (per prompt, cached): never on a STORAGE mount (storageRootOf ⇒ the cwd itself matches) nor a blocked one; a local / home cwd once"],
  ["src/task-groups.js", "TaskGroupManager.exportToFile", 3, "guarded", "mkdir/write/rename at req.body.path — any absolute path the person/agent names (server.js export route)"],
  ["src/task-groups.js", "TaskGroupManager.importFromFile", 1, "guarded", "readFileSync of req.body.path — any absolute file the person/agent names (server.js import route)"],
  ["src/task-groups.js", "*", 16, "local-only", "store + Activity-log archive under dataDir = <checkout>/data (server.js new TaskGroupManager): task-groups.json, tasks.json, task-groups-archive/<id>/<month>.ndjson"],
  ["src/telemetry.js", "*", 6, "local-only", "this.dir = <dataDir>/telemetry (server.js new Telemetry({dataDir: <checkout>/data})): events-/central- shards and .instance-id"],
  ["src/transcript-service.js", "createTranscriptService > gapInfo", 1, "local-only", "fp = harness store.locate: ~/.claude/projects/*/<id>.jsonl, ~/.codex/sessions, or <checkout>/data/remote-jsonl cache (cwd only names the projdir)."],
  ["src/transcript-service.js", "createTranscriptService > rescue", 8, "local-only", "fp = localTranscriptPath (~/.claude/projects, ~/.codex/sessions, data/remote-jsonl) and its .pre-rescue-/.rescue-tmp siblings."],
  ["src/usage-anchors.js", "*", 2, "local-only", "this._file(key) under this.dir = <rootDir>/data/usage-anchors (usage-pool-engine new UsageAnchors)"],
  ["src/usage-cache-write.js", "*", 6, "local-only", "cacheDir is always USAGE_CACHE_DIR = <checkout>/data/usage-cache (usage-routes, usage-pool-engine, cli-usage-door, migrations, reading-repair, weekly-lanes-unfold)"],
  ["src/usage-cold-walk.js", "*", 2, "local-only", "fp = a ledger shard under <dataDir>/usage-history (usage-history this.dir; coldRows also runs in usage-cold-worker.js)"],
  ["src/usage-estimator.js", "*", 6, "local-only", "this.dir = anchorsDir = <rootDir>/data/usage-anchors (usage-pool-engine; ledger-slot-backfill passes <dataDir>/usage-anchors)"],
  ["src/usage-history.js", "*", 15, "local-only", "this.dir = <dataDir>/usage-history, metaDir = <dataDir>/session-meta; cursor keys under ~/.claude/projects and $CODEX_HOME|~/.codex/sessions"],
  ["src/usage-index-worker.js", "*", 9, "via-safefs", "worker_threads script: throws if isMainThread; launched by src/server/usage-index.js new Worker(workerFile) (paths = workerData dbDir/ledgerDir)"],
  ["src/usage-origin-backfill.js", "*", 14, "local-only", "projectsDir = ~/.claude/projects (migrations.js homeDir; the vendor CLI's tree) for the transcript walk; data/usage-history shards + data/archive (one-shot boot migration)"],
  ["src/usage-routes.js", "spawnPanelProbe", 1, "local-only", "probeCwd = <root>/cwd; root = <dataDir>/subs/<acct>/.probe-config (refreshViaCliPanel) or the oat-mint scratch os.tmpdir()/vs-oat-mint-*/config."],
  ["src/usage-routes.js", "setupUsage > readUsageCache", 1, "local-only", "USAGE_CACHE_FILE = <checkout>/data/usage-cache.json (server.js:268 → setupUsage)."],
  ["src/usage-routes.js", "setupUsage > writeUsageCache", 2, "local-only", "USAGE_CACHE_FILE(.tmp) = <checkout>/data/usage-cache.json (server.js:268)."],
  ["src/usage-routes.js", "setupUsage > ingestPassiveUsage", 2, "local-only", "USAGE_CACHE_DIR = <checkout>/data/usage-cache (server.js:274) and its *.json entries."],
  ["src/usage-routes.js", "setupUsage > ingestPassiveModels", 1, "local-only", "a file name listed from USAGE_CACHE_DIR = <checkout>/data/usage-cache (server.js:274)."],
  ["src/usage-routes.js", "setupUsage", 3, "local-only", "boot load of USAGE_CACHE_DIR = <checkout>/data/usage-cache host-*.json files (server.js:274)."],
  ["src/usage-routes.js", "setupUsage > seedProbeConfigDir", 3, "local-only", "credsDir = accounts.subDir(key) = <dataDir>/subs/<id>; probeConfigDir = credsDir/.probe-config (caller L638-642)."],
  ["src/usage-routes.js", "setupUsage > refreshViaCliPanel", 6, "local-only", "READING_ARCHIVE / archive ndjson under <checkout>/data/archive and f = USAGE_CACHE_DIR/<key>.json (data/usage-cache)."],
  ["src/usage-routes.js", "setupUsage > route:POST /api/usage/refresh > deviceLegG", 1, "local-only", "mkdir USAGE_CACHE_DIR = <checkout>/data/usage-cache (server.js:274)."],
  ["src/usage-routes.js", "setupUsage > readCodexWrapperRateLimit", 1, "local-only", "BUFFERS_DIR/<sessionId>.json; BUFFERS_DIR = <checkout>/data/session-buffers (server.js:213)."],
  ["src/usage-routes.js", "setupUsage > readLatestCodexRateLimitFromJsonl", 3, "local-only", "filePath comes only from listRecentCodexJsonlFiles: rollouts under CODEX_SESSIONS_DIR = ~/.codex/sessions (adapters/codex.js:20)."],
  ["src/usage-routes.js", "setupUsage > listRecentCodexJsonlFiles", 2, "local-only", "walk rooted at CODEX_SESSIONS_DIR = os.homedir()/.codex/sessions (adapters/codex.js:20), the vendor CLI's own dir."],
  ["src/usage-routes.js", "setupUsage > codexThreadAccountMap", 2, "local-only", "META_DIR = <checkout>/data/session-meta (server.js:212) and its *.json."],
  ["src/usage-routes.js", "setupUsage > summarizeCodexRateLimits", 2, "local-only", "USAGE_CACHE_DIR = <checkout>/data/usage-cache (server.js:274) and its *.json."],
  ["src/usage-walker.js", "*", 12, "local-only", "vendor CLI trees ~/.claude/projects + $CODEX_HOME|~/.codex/sessions (UsageHistory), cursor ~/.vibespace/usage-cursor.json; caveat: B-afc4 census calls it user-path (DOOR.blocked skip)"],
  ["src/vnc.js", "*", 3, "local-only", "this._stateFile / recordedDisplay file = <checkout>/data/vnc.json (server.js new VncManager({dataDir}))"],
  ["src/webdav.js", "MountTokens._save", 2, "local-only", "this._file = <dataDir>/mount-tokens.json (+ .tmp)"],
  ["src/webdav.js", "MountTokens.mint", 2, "guarded", "root = a folder a person shares (POST /api/mount-tokens body) or machine-mounts push-mount folder — may be a storage mount"],
  ["src/weekly-lanes-unfold.js", "*", 11, "local-only", "one-shot boot migration (migrations.js) over dataDir = <checkout>/data: usage-cache, session-buffers, session-meta, subs, pool-links, archive"],
  ["src/window-stamp.js", "*", 1, "local-only", "cacheDir = <dataDir>/usage-cache at every caller (USAGE_CACHE_DIR / path.join(dataDir, 'usage-cache'))"],
  ["src/window-targets.js", "*", 1, "local-only", "helper = HELPER_PATH, src/window-targets-helper.py in the checkout"],
  ["src/workflow-usage-tailer.js", "*", 4, "local-only", "dir = ~/.claude/projects/<cwd slug, no slash>/<sid>/subagents/workflows/<wf_[\\w-]+> (usage-pool-engine armWorkflowUsageWatcher, local sessions only)"],
  ["src/ws-create.js", "createWsCreateHandler > createBody", 1, "local-only", "cacheRoot = <checkout>/data/remote-jsonl; hd from its listing; cacheRel from the harness remoteFind (resumeId regex-checked)."],
  ["src/ws-handler.js", "registerWsHandler > handleMessage", 6, "local-only", "a pending Ctrl+G edit's file at attach: on a STORAGE mount best-effort like a remote one (never a stat); a local / home file is checked", "^(?:existsSync\\(fp\\)|readFileSync\\(fp\\)|readFileSync\\(fp\\.replace\\('\\.jsonl',\\ '\\.meta\\.json'\\)\\)|readFileSync\\(wf\\.sidecar\\)|readdirSync\\(path\\.join\\(subDir,\\ 'workflows'\\)\\)|statSync\\(wf\\.sidecar\\))$"],
  ["src/ws-handler.js", "registerWsHandler > endSessionBody", 4, "local-only", "session.socketPath (dtach socket), <checkout>/data/session-buffers/<id>.json|.buf, cfgF under AGENTD_DIR = <checkout>/data/agentd"],
  ["src/ws-handler.js", "registerWsHandler > handleMessage", 1, "guarded", "a pending Ctrl+G edit's file at attach: on a STORAGE mount best-effort like a remote one (never a stat); a local / home file is checked"],
];
// the via-safefs files and the file that starts each (⑤)
const LAUNCHERS = {
  "src/app-secrets-seal.js": "src/secret-service.py",
  "src/incident.js": "src/server/incident-freeze-worker.js",
  "src/input-inject.js": "src/agentd/agentd.js",
  "src/safe-fs-worker.js": "src/safe-fs.js",
  "src/search-index-worker.js": "src/server/search-index.js",
  "src/usage-index-worker.js": "src/server/usage-index.js",
};

/** The census over a set of sites: { unclaimed, stale: [{row, got}], claimed: Map(row → n) }. */
function census(sites, rows = ROWS) {
  const byFile = new Map();
  for (const r of rows) { if (!byFile.has(r[0])) byFile.set(r[0], []); byFile.get(r[0]).push(r); }
  const got = new Map(rows.map((r) => [r, 0]));
  const unclaimed = [];
  for (const s of sites) {
    const text = `${s.fn}(${s.paths.join(', ')})`;
    const r = (byFile.get(s.file) || []).find((x) => (x[1] === s.scope || x[1] === '*') && (!x[5] || new RegExp(x[5]).test(text)));
    if (!r) { unclaimed.push(`${s.file}:${s.line} «${s.scope}» ${text}`); continue; }
    got.set(r, got.get(r) + 1);
  }
  const stale = rows.filter((r) => got.get(r) !== r[2]).map((r) => ({ row: `${r[0]} «${r[1]}»${r[5] ? ' /' + r[5] + '/' : ''}`, want: r[2], got: got.get(r) }));
  return { unclaimed, stale, got };
}

const t0 = Date.now();
const FILES = filesOf(REPO);
const ALL = FILES.flatMap((f) => sitesOf(REPO, f));
const VAR = ALL.filter((s) => s.kind === 'var');

console.log('① every non-constant sync fs site of the main thread is a row');
{
  const c = census(VAR);
  ok(ALL.length > 1500 && VAR.length > 1000, `scanned ${FILES.length} files: ${ALL.length} sync sites — ${ALL.filter((s) => s.kind === 'const').length} constant, ${ALL.filter((s) => s.kind === 'fd').length} descriptor, ${VAR.length} rowed (${Date.now() - t0} ms)`);
  ok(!c.unclaimed.length, `every one of the ${VAR.length} sites is claimed by a row — an unclaimed site: classify it (local-only / via-safefs / guarded) and add its row`, c.unclaimed.slice(0, 20));
  ok(!c.stale.length, `every row's count is exact (${ROWS.length} rows) — a moved count: classify the new or gone site, then move the count`, c.stale.slice(0, 20));
  const by = (p) => ROWS.filter((r) => r[3] === p).reduce((n, r) => n + r[2], 0);
  console.log(`  COUNTS: local-only ${by('local-only')} · via-safefs ${by('via-safefs')} · guarded ${by('guarded')} sites over ${new Set(ROWS.map((r) => r[0])).size} files`);
}

console.log('② the rows');
{
  ok(ROWS.every((r) => PROOFS.has(r[3])), 'every proof is local-only / via-safefs / guarded', ROWS.filter((r) => !PROOFS.has(r[3])).map((r) => r[0]));
  ok(ROWS.every((r) => typeof r[4] === 'string' && r[4].length >= 24), 'every row says WHY (≥ 24 chars: the root, the launcher or the user source)', ROWS.filter((r) => !(typeof r[4] === 'string' && r[4].length >= 24)).map((r) => r[0] + ' ' + r[1]));
  ok(ROWS.every((r) => r[2] > 0 && FILES.includes(r[0])), 'no dead row: each names a scanned file and claims ≥ 1 site', ROWS.filter((r) => !(r[2] > 0 && FILES.includes(r[0]))).map((r) => r[0]));
  const stars = new Map(); for (const r of ROWS) if (r[1] === '*') stars.set(r[0], (stars.get(r[0]) || 0) + 1);
  ok([...stars.values()].every((n) => n === 1) && ROWS.every((r, i) => r[1] !== '*' || !ROWS.slice(i + 1).some((x) => x[0] === r[0])), 'a file has at most ONE \'*\' row and it is that file\'s last');
}

console.log('③ RED CONTROLS: a site with no row is RED');
{
  const plant = (rel, src) => sitesOf(REPO, rel, { src }).filter((s) => s.kind === 'var');
  const base = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
  const others = (rel) => VAR.filter((s) => s.file !== rel);
  const NEW = "'use strict';\nconst fs = require('fs');\nfunction peek(p) { return fs.statSync(p); }\nmodule.exports = { peek };\n";
  const a = census([...VAR, ...plant('src/zz-planted.js', NEW)]);
  ok(a.unclaimed.length === 1 && /src\/zz-planted\.js:3 «peek» statSync\(p\)/.test(a.unclaimed[0]), `a site in a NEW file is unclaimed: ${a.unclaimed[0]}`);
  const TG = 'src/task-groups.js';
  const tg = base(TG).replace("    if (DOOR.blocked(abs)) return 'blocked';\n", "    if (DOOR.blocked(abs)) return 'blocked';\n    try { fs.accessSync(abs); } catch { }\n");
  const b = census([...others(TG), ...plant(TG, tg)]);
  ok(tg !== base(TG) && b.stale.some((x) => /_kindOf/.test(x.row) && x.got === x.want + 1), 'one more site in a covered scope (task-groups _kindOf) reds that row\'s count', b.stale);
  const tg2 = base(TG).replace('  _ctxRows(t) {', '  _peek(p) { return fs.existsSync(p); }\n  _ctxRows(t) {');
  const c2 = census([...others(TG), ...plant(TG, tg2)]);
  const star = ROWS.some((r) => r[0] === TG && r[1] === '*');
  ok(tg2 !== base(TG) && (star ? c2.stale.some((x) => x.row === `${TG} «*»` && x.got === x.want + 1) : c2.unclaimed.some((u) => /«TaskGroupManager\._peek» existsSync\(p\)/.test(u))),
    `a site in a scope no row of its file names is RED (${star ? 'its file\'s \'*\' row count moves' : 'unclaimed'})`, { stale: c2.stale, unclaimed: c2.unclaimed });
  const CONST = "'use strict';\nconst fs = require('fs');\nconst path = require('path');\nconst FILE = path.join(__dirname, '..', 'data', 'x.json');\nfunction load() { return fs.readFileSync(FILE, 'utf8') + fs.readFileSync('/proc/self/stat', 'utf8'); }\nmodule.exports = { load };\n";
  ok(sitesOf(REPO, 'src/zz-const.js', { src: CONST }).every((s) => s.kind === 'const'), 'CONTROL: a constant path (a file constant over __dirname, /proc) needs no row');
}

console.log('④ the conversions: a storage path is never read on the main thread');
{
  const LB = require(path.join(REPO, 'src/server/loop-blame.js'));
  const SP = require(path.join(REPO, 'src/storage-path.js'));
  const { SafeFs } = require(path.join(REPO, 'src/safe-fs.js'));
  const { TaskGroupManager } = require(path.join(REPO, 'src/task-groups.js'));
  const { runOp } = require(path.join(REPO, 'src/safe-fs-worker.js'));
  const SS = require(path.join(REPO, 'src/session-store.js'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-sfc-'));
  const store = path.join(dir, 'NAS'), local = path.join(dir, 'local');
  for (const d of [store, local]) {
    fs.mkdirSync(path.join(d, 'ctx', 'sub', '.git'), { recursive: true });
    fs.writeFileSync(path.join(d, 'ctx', 'NOTES.md'), '# the notes\n');
    fs.writeFileSync(path.join(d, 'ctx', 'sub', 'b.txt'), 'bee');
    fs.writeFileSync(path.join(d, 'ctx', 'sub', '.git', 'HEAD'), 'ref');
    fs.writeFileSync(path.join(d, 'ctx', 'bin.dat'), Buffer.from([1, 0, 2]));
    fs.writeFileSync(path.join(d, 'ctx', 'big.txt'), 'x'.repeat(70 * 1024));
  }
  // the SAME answers: the worker's ops vs task-groups' own sync walk / read, over one LOCAL folder (no roots set)
  SP.setRoots([]);
  const proto = Object.create(TaskGroupManager.prototype);
  const lc = path.join(local, 'ctx');
  ok(JSON.stringify(runOp('contextFiles', { path: lc, cap: 100 }).result) === JSON.stringify(proto._listContextFiles(lc, 100)) && proto._listContextFiles(lc, 100).length === 4,
    'SafeFs contextFiles ≡ task-groups _listContextFiles (path order, .git skipped, sizes + mtimes)', proto._listContextFiles(lc, 100));
  const same = ['NOTES.md', 'bin.dat', 'big.txt'].every((f) => JSON.stringify(runOp('textHead', { path: path.join(lc, f), cap: 64 * 1024 }).result) === JSON.stringify(proto._readText(path.join(lc, f))));
  ok(same, 'SafeFs textHead ≡ task-groups _readText (text, binary, past READ_CAP = big)');
  // a Task Group on the STORAGE root: no main-thread sync call lands there, the answers come from SafeFs facts
  SP.setRoots([{ root: store, kind: 'storage', name: 'NAS' }]);
  const onStore = [];
  LB.install({ root: REPO });
  LB.setHook({ before: (fn, args) => { const p = args && args[0]; if (typeof p === 'string' && (p === store || p.startsWith(store + '/'))) onStore.push(`${fn}(${p})`); }, after: () => {} });
  const pool = new SafeFs({ poolSize: 1, name: 'sfc-census' });
  const data = path.join(dir, 'data'); fs.mkdirSync(data);
  const tgm = new TaskGroupManager({ dataDir: data, mirrorFs: () => pool, homeDir: dir });
  const sc = path.join(store, 'ctx');
  const k0 = tgm._kindOf(sc), r0 = tgm._readText(path.join(sc, 'NOTES.md')), w0 = tgm._listContextFiles(sc, 100);
  await tgm._facts.settled();
  const k1 = tgm._kindOf(sc), r1 = tgm._readText(path.join(sc, 'NOTES.md')), w1 = tgm._listContextFiles(sc, 100);
  ok(k0 === 'reading' && r0.reading === true && Array.isArray(w0) && !w0.length, `before the first off-thread answer: the row is 'reading', the file not read, the walk empty (${k0})`);
  ok(k1 === 'dir' && r1.text === '# the notes\n' && w1.length === 4 && tgm._kindOf(path.join(store, 'nope')) === 'reading', `after it lands: dir, the file's text, the 4 files — every answer a SafeFs fact (${k1}, ${w1.length} files)`);
  ok(tgm.groupsForSession({ cwd: path.join(store, 'proj') }).length === 0 && !tgm._realCache?.has(path.join(store, 'proj')), 'a session cwd on the storage root is never realpathed (the cwd itself matches; not cached)');
  ok(SS.recoverCwdFromProjDir(path.join(store, 'ctx', 'sub').replace(/[/._]/g, '-')).startsWith(store), `the project-dir decode takes the mount point as there and never probes below it (${SS.recoverCwdFromProjDir(path.join(store, 'ctx', 'sub').replace(/[/._]/g, '-'))})`);
  ok(!onStore.length, `NO main-thread sync fs call landed on the storage root (${onStore.length})`, onStore.slice(0, 10));
  // CONTROL: the same reads with no roots set take the sync road — the hook counts them (the census of ④ can see a call)
  SP.setRoots([]);
  const t2 = new TaskGroupManager({ dataDir: path.join(dir, 'data2'), mirrorFs: () => pool, homeDir: dir });
  t2._kindOf(sc); t2._readText(path.join(sc, 'NOTES.md'));
  ok(onStore.length >= 2 && onStore.some((x) => x.startsWith('statSync(')), `CONTROL: without the storage root the same rows are stat'd on the main thread (${onStore.length} calls seen)`, onStore);
  LB.setHook(null);
  pool.close();
  fs.rmSync(dir, { recursive: true, force: true });
  // the other hot sites ask the one answer BEFORE their sync call (pins)
  const src = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
  const PINS = [
    ['src/routes/sessions.js', /if \(SP\.storageRootOf\(cwd\)\) return null;[^\n]*\n\s*let rp = null;\n\s*try \{ const r = fs\.realpathSync\(cwd\)/],
    ['src/task-groups.js', /else if \(SP\.storageRootOf\(cwd\)\) real = null;[^\n]*\n\s*else \{\n\s*try \{ real = fs\.realpathSync\(cwd\)/],
    ['src/server/browser-env.js', /if \(SP\.storageRootOf\(p\)\) \{ project\.path = p; project\.error = [^\n]*\n\s*try \{ raw = fs\.readFileSync\(p, 'utf8'\)/],
    ['src/ws-handler.js', /if \(!pe\.host && !SP\.storageRootOf\(pe\.filePath\)\) \{ try \{ live = fs\.existsSync\(pe\.filePath\)/],
    ['src/desktop-serve.js', /const execHere = \(x\) => \(SP\.storageRootOf\(x\) \? x : fs\.existsSync\(x\) \? x : null\);/],
    ['src/session-store.js', /const probeCandidate = \(p\) => \{ const r = SP\.storageRootOf\(p\); return r \? p === r\.root : fs\.existsSync\(p\); \};/],
  ];
  for (const [rel, re] of PINS) ok(re.test(src(rel)), `${rel}: the storage answer comes before the sync call`);
  ok(!/fs\.\w+Sync\(/.test(src('src/ctx-sync.js')), 'ctx-sync: the context folder sync makes no sync fs call (async fs, one per host:group in flight)');
  ok(/function localDuBytes\(p\) \{\n\s*return fs\.promises\.stat\(p\)/.test(src('src/routes/files.js')) && /let busy = false; \/\/ one measurement at a time/.test(src('src/routes/files.js')), 'the explorer\'s copy progress (every 1.2 s): an async stat, one at a time');
  { const dav = src('src/webdav.js'), handler = dav.slice(dav.indexOf("app.use('/dav', async (req, res) =>"));
    ok(dav.includes("app.use('/dav', async (req, res) =>") && !/fs\.\w+Sync\(/.test(handler), '/dav: the route makes no sync fs call — every verb over the share is async fs'); }
  ok(/await fs\.promises\.mkdir\(mountpoint, \{ recursive: true \}\);/.test(src('src/device-mount.js')), 'the device folder mount point: an async mkdir (a stale FUSE path right after the lazy unmount)');
}

console.log('⑤ the via-safefs files are started off the main thread');
{
  const via = [...new Set(ROWS.filter((r) => r[3] === 'via-safefs').map((r) => r[0]))];
  const miss = via.filter((f) => !LAUNCHERS[f] || !fs.existsSync(path.join(REPO, LAUNCHERS[f])) || !fs.readFileSync(path.join(REPO, LAUNCHERS[f]), 'utf8').includes(path.basename(f)));
  ok(via.length >= 6 && !miss.length, `every via-safefs file (${via.length}) is named by its launcher (${via.map((f) => `${path.basename(f)} ← ${LAUNCHERS[f]}`).join(', ')})`, miss);
  ok(ROWS.filter((r) => r[3] === 'via-safefs').every((r) => !ROWS.some((x) => x[0] === r[0] && x[3] !== 'via-safefs')), 'a via-safefs file is via-safefs whole (no main-thread row beside it)');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
