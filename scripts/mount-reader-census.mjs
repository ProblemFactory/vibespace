// THE MOUNT READER CENSUS (B-afc4, lane mount-readers-blocked — test-architecture §86). A blocked mount path is ANSWERED,
// never read: the liveness sweep (src/mount-liveness.js) blocks a cloud mount's root from strike 1, and every server-side
// reader of a path a user or agent can point at a mount asks the ONE door — mounts.pathBlocked(p), through
// src/mount-door.js for a reader with no handle on the manager — BEFORE the read. Every file under src/, src/server/ and
// src/routes/ that reads / stats / walks a path (fs.readdir/stat/lstat/readFile/opendir/access/exists/realpath/
// createReadStream/open, sync or promise, and SafeFs calls) is a ROW: [file, kind, sites, guard, why]
//   user-path — a path a user or agent names (a cwd, a context / design / share folder, a file to publish or move):
//               `guard` (the door) must be on the page
//   own-tree  — the server's own store (data/, the checkout), the CLIs' own trees under ~, or procfs / sysfs: exempt by
//               what it reads (`why`)
//   exempt    — reads a mount on purpose, or behind a door elsewhere (`why`)
// An unlisted reader file is RED; a row whose site count moved is RED (a new read: classify it, then move the count); a
// user-path row without its door is RED; a row naming no live reader is DEAD. SafeFs.call refuses a blocked path at the
// pool's door BEFORE it picks a worker (DOOR_PIN).
import fs from 'fs';
import path from 'path';

export const SITE = /\b(?:fs|fsp|fsP|fsPromises)\.(?:promises\.)?(?:readdir|stat|lstat|readFile|opendir|access|exists|realpath|createReadStream|open)(?:Sync)?\(|\bsfs\(req\)\.call\(|safeFs\.call\(/g;
const COMMENT = /^\s*(\/\/|\*|\/\*)/;
export const DIRS = ['src', 'src/server', 'src/routes'];
const PROC = 'procfs / sysfs + its own record files';
const CLI = 'the CLIs’ own trees under ~ (~/.claude, ~/.codex) + data/';
const DATA = 'data/ or the checkout (its own store)';
export const ROWS = [
  ['src/account-material.js', 'own-tree', 13, null, `${CLI}; lane oat-census-closure +2: the rename-aside's check of what moved (lstat of the aside) + the link-in's symlink question on EEXIST, both inside the member dir; lane pool-oat-materialize +2: writePrivateFile's O_EXCL tmp open + the archive-name probe, both inside a member dir under data/subs; its verify r1 fix +8 (fs.promises, off the loop): the oat's one read (dir lstat + open), the async writer's O_EXCL tmp open, the F7 fresh-stat guard + the post-rename check, the F8 dir lstat, the merge's archive move (readdir + name probe) — every one inside a member dir under data/subs`],
  ['src/accounts.js', 'own-tree', 22, null, `${CLI}; lane oat-census-closure +2: the key-file law asks accounts.json (data/) whether it holds ciphertext before a key is minted, and the merge reads the survivor's own file once (F3, a member dir under data/subs); lane pool-oat-materialize +2 −1: a member's .credentials.json read for the materialize verdict + the oat-in-file fixture (the checkout); the merge's tmp open moved to account-material; its verify r1 fix: the verdict's read moved to account-material (−1), the merge reads the folded dir's file once (ours is never copied, +1), the F5 link scan (data/pool-links readdir ×2 + readlink — the store's own tree, async); lane pool-provider-latents (q-055 M2) +1: unplacedOf lstat()s a conversation's own data/pool-links entry — a mark holds only while its link is absent`], // lane key-file-law-stores: −1 — _key() reads through secret-box lawfulKey (int268: 22 → 21 on e709d1f74's count)
  ['src/acp-message-manager.js', 'own-tree', 1, null, CLI],
  ['src/agy-backfill.js', 'own-tree', 1, null, 'lane agy-subagent-cards\' addendum: the stat of a named Antigravity account\'s root (data/agy-subs/<id>, the server\'s own store) — every store read goes through src/agy-store-fs.js'],
  ['src/agy-store-fs.js', 'own-tree', 8, null, 'lane agy-subagent-cards\' addendum: THE ONE gate of an agy store — <HOME>/.gemini/antigravity-cli of a named account\'s root (data/agy-subs/<id>) or this machine\'s login (the CLI\'s own tree under ~), only the store\'s own shapes (agy-store storeReadable), realpath-checked + O_NOFOLLOW; lane agy-harness-fixes +3: the SAME gate awaited (linesFrom — two realpaths + the O_NOFOLLOW open of a conversation\'s transcript, the history before the journal\'s ring)'],
  ['src/node-runtime.js', 'own-tree', 10, null, 'lane runtime-floor: the instance\'s own runtime under <root>/runtime (data/runtime on the hub and a pod, the device root for an agent) — the current pointer, the provisioned binary, the sums it downloaded; + its addendum: the record (.vibespace-runtime.json) and the binary hashed against it before the switch; nothing a person names'],
  ['src/app-serve.js', 'own-tree', 38, null, `${DATA}; lane apps-launcher-witness +3: the witness file (data/) + the XDG application dirs (~/.local/share/applications, /usr/share/applications — the OS's own records at fixed paths, opened O_NONBLOCK|O_NOFOLLOW, never a path anyone names); lane app-register-model +5: a Flatpak's exported desktop file (×2, a fixed path under the user's own ~/.local/share/flatpak), a declared exec's access/stat (resolving it as the user would run it) and a declared icon's size (validated under the home or /usr/share); rel254-verify-fixes +1: realpath of this machine's flatpak and a Flatpak row's exec (F8 — the binary the PATH names, never a mount path anyone types)`],
  ['src/app-squashfs.js', 'own-tree', 2, null, DATA],
  ['src/app-system-serve.js', 'own-tree', 13, null, DATA],
  ['src/auth.js', 'own-tree', 1, null, DATA],
  ['src/browser-facts.js', 'own-tree', 26, null, PROC], // + makeBrowserTmpDir: /proc/self/mountinfo + the per-uid dir's lstat (lane browser-tmpdir-socket-length)
  ['src/browser-serve.js', 'own-tree', 7, null, DATA],
  ['src/browser-verbs.js', 'own-tree', 2, null, DATA],
  ['src/channel-outbox-files.js', 'own-tree', 5, null, DATA],
  ['src/channel-store.js', 'own-tree', 32, null, DATA],   // lane webhook-l1-server: + rewriteRecords (record-clear's channel-webhook door); lane lark-search-miss: + feedMissRead (<account>/feed-misses.json)
  ['src/claude-lock-capture.js', 'own-tree', 3, null, CLI],
  ['src/cli-identity.js', 'own-tree', 18, null, PROC],
  ['src/codex-fork-ledger-purge.js', 'own-tree', 6, null, CLI],
  ['src/codex-session-store.js', 'own-tree', 3, null, CLI],
  ['src/conversation-index.js', 'own-tree', 1, null, DATA],
  ['src/ctx-sync.js', 'user-path', 4, 'DOOR\\.blocked\\(', 'the group context folder walk: refused by name before the device is dialled'],
  ['src/design-fs.js', 'user-path', 7, 'DOOR\\.blocked\\(', 'the design folder read: storage_blocked by name'],
  ['src/desktop-display.js', 'own-tree', 27, null, PROC], // +2 lane remoteapp-r1b: the first connection's OWN fresh config dir (readdir + the one stored certificate, read for its sha256); +3 lane app-display-portal: portal binaries stat'd in /usr/libexec, the app dir's bus socket, /proc/self/mountinfo; +1 lane app-display-notify-sink: the sink file; +1 lane remoteapp-r1a: the RDP client binary stat'd (its build facts' memo key) beside the module; +1 lane app-launch-singleton: the holder of a browser's default profile (/proc/<pid>/stat — its SingletonLock is a readlink in the browser's own tree under ~)
  ['src/desktop-serve.js', 'own-tree', 14, null, DATA], // lane hub-fuse-sync-guard −1: the catalog's two program-path checks are ONE (execHere: a storage-mount path is listed as it reads) // +2 lane remoteapp-r1b: a RemoteApp session's own app.log re-read at its teardown (stat + read) for the password-shape scrub; +2 lane app-display-notify-sink: the app's notification journal (stat + read) in its own 0700 portal dir; +1 lane remoteapp-r1a: the tail of a RemoteApp session's own app.log (why it ended)
  ['src/device-audit.js', 'own-tree', 3, null, `${DATA} — lane device-act-audit: the hub's device-act audit ring (data/device-audit.jsonl: the size before an append, the backwards tail read)`],
  ['src/device-mount.js', 'exempt', 5, null, 'the device pull mount: /proc scans + its own mount point (its owner’s liveness)'],
  ['src/discovery-facts.js', 'own-tree', 5, null, PROC],
  ['src/exit-proxy.js', 'user-path', 10, 'DOOR\\.blocked\\(', 'an exit-run transfer’s local side: refused by name (transfer_failed)'],
  ['src/fixture-ledger-purge.js', 'own-tree', 6, null, CLI],
  ['src/gmail-sync.js', 'own-tree', 2, null, DATA],
  ['src/harness-config.js', 'own-tree', 9, null, CLI],
  ['src/hosts.js', 'own-tree', 29, null, DATA],
  ['src/incident.js', 'own-tree', 19, null, DATA],
  ['src/jobs.js', 'own-tree', 24, null, `${DATA}; lane job-spec-off-argv +1: the run's spec file, opened O_WRONLY|O_CREAT|O_EXCL 0600 inside its own ctl dir (data/job-logs) — a write, never a read; lane job-wrapper-update-window +1: a stat of data/bin/job-wrapper.js (its mtime: is a protocol mismatch the update's window?) — the server's own tree`],
  ['src/ledger-slot-backfill.js', 'own-tree', 13, null, CLI],
  ['src/login-state.js', 'own-tree', 2, null, CLI],
  ['src/machine-mounts.js', 'own-tree', 7, null, DATA],
  ['src/machine-probes.js', 'own-tree', 7, null, CLI],
  ['src/migration-runner.js', 'own-tree', 1, null, DATA],
  ['src/mounts.js', 'exempt', 26, null, 'the manager itself: /proc, its config, its own mount points only through probe CHILDREN (ls -d) — the sweep that sets the block; lane vfs-cache-local +4: the local cache root probe (accessSync, ~/.cache) + the vfsMeta walk\'s text run in a CHILD node (statSync/readdirSync/readFileSync inside CACHE_META_CHILD); r2 +2: the override root\'s statSync (a non-dir is refused) + the child\'s root stat (an absent root is unknown, not absence)'],
  ['src/opencode-serve.js', 'own-tree', 3, null, CLI],
  ['src/opslog.js', 'exempt', 2, null, '/proc/mounts + the ops log folder'],
  ['src/peer-messaging.js', 'own-tree', 4, null, `${CLI}; lane peer-registry-identity +1: the registration's inbox socket (statSync isSocket — the CLI's own runtime-dir socket, never a mount)`],
  ['src/plugins.js', 'own-tree', 1, null, DATA],
  ['src/port-forward.js', 'own-tree', 4, null, PROC],
  ['src/proc-identity.js', 'own-tree', 7, null, PROC],
  ['src/proc-listen.js', 'own-tree', 4, null, PROC],
  ['src/quota-model-migrate.js', 'own-tree', 2, null, CLI],
  ['src/rate-limit-capture.js', 'own-tree', 2, null, CLI], // lane oat-identity-fix-r3 −1: the `.window-` sidecar read moved to its ONE reader (src/window-stamp.js)
  ['src/reading-repair.js', 'own-tree', 14, null, CLI], // B-1319: +4 = prefetchAnchorRows (readdir / stat / readFile through fs.promises) + the size+mtime check before its rows are taken
  ['src/remote-fs.js', 'own-tree', 1, null, DATA],
  ['src/routes/apps.js', 'own-tree', 4, null, DATA],
  ['src/routes/browser-trace.js', 'own-tree', 2, null, DATA],
  ['src/routes/channels.js', 'own-tree', 5, null, DATA],
  ['src/routes/files.js', 'user-path', 43, 'mounts\\.pathBlocked\\(p\\)', 'the explorer + every file op: the route middleware 503 by name, then SafeFs.call refuses at the pool door'],
  ['src/routes/persistence.js', 'own-tree', 15, null, DATA],
  ['src/routes/sessions.js', 'user-path', 27, 'DOOR\\.blocked\\(', 'a session cwd realpath (sync, main thread): null, not cached'],
  ['src/routes/window-targets.js', 'own-tree', 1, null, DATA],
  ['src/safe-fs-worker.js', 'exempt', 43, null, 'the SafeFs worker: it runs a path SafeFs.call already asked the door about (src/safe-fs.js _blocked); lane hub-fuse-sync-guard +4: the Task Group context table\'s walk + text read of a row on a storage mount (contextFiles / textHead)'],
  ['src/search-index-worker.js', 'own-tree', 5, null, CLI],
  ['src/secret-box.js', 'own-tree', 13, null, DATA], // lane key-file-law-stores: +3 — THE KEY-FILE LAW's reads (the key file raw/hex, each store's ciphertext files + their dirs); lane vault-e2e-password: +4 — data/vault.json and the `.sealed` markers beside a key file (is this dir's vault set up?); lane vault-e2e-password-fix-r2: +1 — sealedDir (data/vault.json's presence, for a process with no engine)
  ['src/app-secrets.js', 'own-tree', 7, null, DATA], // lane app-display-secrets: the service/sealer files beside it, the key file (secret-box), the app dir's sealed store + bus socket; lane vault-contents-window +3 — the Vault window lists data/desktop-apps/*, asks each app dir for its sealed store and reads it (own data dir)
  ['src/app-secrets-seal.js', 'own-tree', 3, null, DATA], // lane app-display-secrets: the app dir's sealed store + its stdin; lane display-secret-fd +1: the per-display key off the inherited pipe fd (never a path anyone names)
  ['src/server/account-usage-routes.js', 'own-tree', 1, null, CLI],
  ['src/server/agent-tool-generators.js', 'user-path', 25, 'DOOR\\.blocked\\(', 'a session root’s git facts: the sentence as facts.error'], // lane cli-one-text-arg: +2 — src/agent-cli-text.js read and its copy beside the CLIs compared (own tree, every boot) // lane cli-call-timeouts: +2 — src/cli-call.js read for its boot-time copy beside the CLIs (own tree, the agent-cli-text.js shape)
  ['src/server/apps-engine.js', 'own-tree', 1, null, DATA],
  ['src/server/apps-ops-door.js', 'own-tree', 4, null, 'its own socket under ~/.vibespace/apps/operator (lane app-persist-layer1: lstat of that directory, of the socket path before listen + after it, and at close) — VibeSpace’s own state, never a path anyone names'],
  ['src/server/automation-engine.js', 'user-path', 5, 'realpathAsync\\(p\\), bound', `2.369.359 (userW's agent, fb-ac40a458d8): the folder judge's real path of a cwd / a key root is read OFF the main thread and BOUNDED (the wiring hands the SafeFs worker's realpath; fs.promises by default) before the PURE judge — a path that does not answer is the named refusal realpath_unreadable, never «does not exist»; the other 4 reads are ${DATA}`],
  ['src/server/cli-registration.js', 'own-tree', 2, null, DATA + ' (lane cli-2-1-308-records: data/cli-registration.json — the builds said once — and a record draft under data/claude-cli-dumps/)'],
  ['src/server/vault-totp.js', 'own-tree', 2, null, DATA], // design q-047 L1 (lane vault-totp): data/vault-grants.json — who may have a two-step CODE (read, and its tmp opened `wx`); never a seed
  ['src/server/vault-run-door.js', 'user-path', 17, 'DOOR\\.blocked\\(', 'vibespace-vault run (lane vault-run-door): the run’s folder, its program’s path and a template the agent names — storage_blocked by name before any stat or read; + its own run folder under $XDG_RUNTIME_DIR (made, shredded, swept) and data/vault-run.json; + the run’s MARK scan (/proc and each process’s environ — procfs) and the program’s write check (access W_OK)'],
  ['src/server/voice-teach-engine.js', 'own-tree', 1, null, DATA], // lane voice-dictionary-nag: data/voice-suggestions.json (the suggestion ledger — the plugin's own store file, read once)
  ['src/server/vault-engine.js', 'own-tree', 18, null, DATA], // lane vault-use-grants: +1 — useCounts reads the same audit tail (O_NOFOLLOW | O_NONBLOCK, ≤ 512 KiB, memoised by size / mtime) for the Vault window's «used N× by M conversations» // lane door-day-one-landing: +2 — the boot's «a secret is waiting» question (the store key files' presence + data/agentd's token names) // lane vault-e2e-password: data/vault.json, the key files it seals (read, overwrite, unlink) and their `.sealed` markers; lane vault-e2e-password-fix-r2: +1 — secretAdopt reads a plaintext secret file (a host token) it seals; verify r2 +2: shred's and secretAdopt's lstat (a SYMLINK is never followed — its target neither read nor overwritten) — lane vault-manual-and-lock: +1 — usesOf reads the tail of its own data/vault-audit.jsonl (O_NOFOLLOW | O_NONBLOCK, ≤ 512 KiB) for `vibespace-vault uses`
  ['src/server/csp-reports.js', 'own-tree', 4, null, DATA], // lane app-page-csp: data/csp-reports.jsonl (+ its .1) read at boot for the keys on disk, its size before an append — or the chrome suites' VIBESPACE_CSP_REPORTS_FILE under /tmp; never a user path. Lane chrome-156-followups +2: the checkout's own public/bundle.js — its stat (the build a report names) and its text once per build (the sanitizer's parse sites), async
  ['src/secret-file.js', 'own-tree', 5, null, DATA], // lane engine-distribution +3: shredFile's lstat / open (r+) / lstat of a git credential file in data/plugins-staging/<stage>/.cred-* // lane vault-e2e-password-fix-r2: replaceShredding opens the file it replaces (r+), to overwrite its old bytes (a data/ secret file); verify r2 +1: its lstat (a symlink is refused before the open — the overwrite would reach the target)
  ['src/server/host-tokens.js', 'own-tree', 7, null, DATA], // lane vault-e2e-password-fix-r2: data/agentd — the pre-vault host-<id>.token files (read / exists), the attach configs it strips, the dir listings, vault.json's presence (via secret-box)
  ['src/server/sealed-json.js', 'own-tree', 1, null, DATA], // lane vault-e2e-password-fix-r2: the sealed JSON file itself (data/dropline-oauth.json)
  ['src/server/auto-cli-loop.js', 'own-tree', 2, null, CLI],
  ['src/server/auto-resume.js', 'own-tree', 1, null, CLI],
  ['src/server/boot-restore.js', 'own-tree', 14, null, DATA], // B-1319: +1 = probeSockets' readdir of the sockets folder (the restore's probes, before listen)
  ['src/server/bridge-watch.js', 'own-tree', 6, null, PROC],
  ['src/server/browser-attach-launch.js', 'own-tree', 8, null, DATA], // lane one-browser-b1: the attach launch — Chrome on PATH (access/stat), the per-config socket dirs (lstat), the profile's DevToolsActivePort (stat/read) + its log tail
  ['src/server/browser-bindings.js', 'own-tree', 2, null, DATA],
  ['src/server/browser-builds-keeper.js', 'own-tree', 8, null, DATA],
  ['src/server/browser-cli-install.js', 'own-tree', 2, null, DATA],
  ['src/server/browser-cloak-install.js', 'own-tree', 4, null, DATA],
  ['src/server/browser-clone-run.js', 'own-tree', 2, null, DATA],
  ['src/server/browser-disk-run.js', 'own-tree', 3, null, DATA],
  ['src/server/browser-display-config.js', 'own-tree', 3, null, DATA],
  ['src/server/browser-env.js', 'own-tree', 22, null, DATA],
  ['src/server/browser-installs.js', 'own-tree', 5, null, DATA],
  ['src/server/browser-keeper.js', 'own-tree', 35, null, DATA], // lane browser-daemon-survives-update: + its own launch's Chrome DevToolsActivePort (the boot's re-own); lane browser-takeover-queue: + data/browser-takeovers.json (the request records)
  ['src/server/browser-kept.js', 'own-tree', 3, null, DATA],
  ['src/server/browser-trace.js', 'own-tree', 13, null, DATA],
  ['src/server/channel-api-cards.js', 'own-tree', 2, null, DATA],
  ['src/server/channel-api.js', 'own-tree', 3, null, DATA],
  ['src/server/channels-wiring.js', 'own-tree', 3, null, DATA],
  ['src/server/cli-cmd.js', 'own-tree', 3, null, CLI],
  ['src/server/cli-env.js', 'own-tree', 4, null, PROC],
  ['src/server/cluster-presets.js', 'own-tree', 7, null, DATA],
  ['src/server/conversation-deliver.js', 'own-tree', 2, null, DATA],
  ['src/server/decision-engine.js', 'own-tree', 4, null, DATA],   // lane decision-core: data/decision-{memo,usage}.json + the journal; lane decision-spend-readout: the journal's bounded tail (the month so far)
  ['src/server/channels-attention.js', 'own-tree', 1, null, DATA],   // lane decision-attention: data/decision-examples.json (its ONE writer)
  ['src/server/doc-engine.js', 'own-tree', 1, null, DATA], // lane doc-comments-stopped-owner: data/doc-owners.json (the owner memo)
  ['src/server/design-engine.js', 'user-path', 6, 'DOOR\\.blocked\\(', 'the design watch relist: refused by name, never read'],
  ['src/server/desktop-access.js', 'own-tree', 1, null, 'lane desktop-picker-instant: data/desktop-machines.json (the machine rows\' last known state), read once at boot — the server\'s own store'],
  ['src/server/desktop-app-keeper.js', 'own-tree', 1, null, DATA],
  ['src/server/desktop-webrtc.js', 'own-tree', 3, null, 'lane stream-p3m-build: the prebuilt Mac screen helper the hub pushes to a Mac with no compiler — data/bin/helpers/vibespace-screen (+ .version) in the checkout: its version, its size, its bytes'],
  ['src/server/device-upgrade-watch.js', 'own-tree', 1, null, DATA],
  ['src/server/device-alerts.js', 'own-tree', 1, null, DATA], // lane device-act-audit: the three urgent items' dedup ledger (data/device-alerts.json)
  ['src/server/dial-health-watch.js', 'own-tree', 1, null, DATA], // lane host-stale-dialer: data/dial-health.json (the For-you ledger)
  ['src/server/dial-pairing.js', 'own-tree', 2, null, DATA], // lane mac-repair-retires-stale +1: data/agentd/hub-id (this hub's id, read once)
  ['src/server/exit-hook.js', 'own-tree', 2, null, PROC], // lane usage-fold-worker-exit-hook: /proc/self/task (a worker's thread named at spawn, listed at the join)
  ['src/server/exit-routes.js', 'own-tree', 1, null, DATA],
  ['src/server/fd-gauge.js', 'own-tree', 4, null, PROC],
  ['src/server/feedback-store.js', 'own-tree', 1, null, `${DATA}; lane agent-feedback: data/feedback.json read once at create`],
  ['src/server/feedback-forward.js', 'own-tree', 1, null, `${DATA}; lane feedback-forward: data/feedback-outbox.json read once at create`],
  ['src/server/provider-store.js', 'own-tree', 1, null, `${DATA}; lane provider-record (q-053 P0a): data/providers.json read once at create`],
  ['src/server/fs-canary-worker.js', 'exempt', 1, null, 'the canary probes the server’s own tree in its own worker'],
  ['src/server/goal-sync.js', 'own-tree', 3, null, CLI],
  ['src/server/grants-store.js', 'own-tree', 3, null, 'lane grants-unify: THE grants store reads data/grants.json once at create (the server\'s own store), stats its own data/grants-audit.jsonl before rotating it, and asks whether data/grants.json is on disk (the boot\'s rollback check — verify F2)'],
  ['src/server/grants-migration.js', 'own-tree', 3, null, 'lane grants-unify: 2026-10-grants-unify reads the server\'s own stores under data/ (hosts.json, browser-profiles.json, automation-keys.json, window-reach.json, task-groups.json, channels/index.json) once, at the migration, and data/hosts.json again to carry the asks'],
  ['src/server/hook-root-watch.js', 'own-tree', 2, null, CLI],
  ['src/server/incident-wiring.js', 'own-tree', 6, null, DATA],
  ['src/server/instance-url.js', 'own-tree', 1, null, DATA],
  ['src/server/integration-store.js', 'own-tree', 1, null, DATA],
  ['src/server/jobs-wiring.js', 'own-tree', 2, null, DATA],
  ['src/server/login-expiry-watch.js', 'own-tree', 1, null, DATA],
  ['src/server/memory-pressure-watch.js', 'own-tree', 3, null, PROC],
  ['src/server/memory-sampler.js', 'own-tree', 1, null, PROC],
  ['src/server/migrations.js', 'own-tree', 44, null, DATA], // lane vault-use-grants: +2 — 2026-10-vault-always-to-grants stats and reads data/vault-run.json (own data dir, ≤ 1 MiB) to count the «always» rows that wait for the door's verified carry // lane task-group-fanout: +3 — 2026-10-task-group-archived-members reads user-state.json, task-groups.json (the file road) and its own archive file (own data dir); lane llm-plugin-rename: +1 — 2026-10-llm-rename reads settings / plugins / integrations.json (own data dir) to know which live store it needs; lane task-group-context: +1 — 2026-10-task-group-context-rows reads task-groups.json (own data dir) when no live store was handed in
  ['src/server/mount-health-watch.js', 'exempt', 6, null, 'the server-tree watch: /proc + mountinfo, never a user path (the judge’s P4)'],
  ['src/server/sync-fs-witness.js', 'own-tree', 1, null, 'lane hub-fuse-sync-guard: /proc/self/mountinfo (procfs — the storage roots, every 30 s)'],
  ['src/server/sync-fs-witness-worker.js', 'own-tree', 2, null, 'lane hub-fuse-sync-guard: the watchdog thread reads the main thread\'s /proc/self/task/<pid>/wchan + syscall (procfs)'],
  ['src/server/mounts-plugins-wiring.js', 'own-tree', 8, null, DATA], // lane passkey-store-core: +3 — data/browser-passkeys.json + its key file (own data dir); lane key-file-law-stores: −2 — the key file reads through secret-box lawfulKey
  ['src/server/oat-mint.js', 'own-tree', 3, null, 'its own 0700 scratch dir per mint (the $BROWSER URL file) + the boot sweep of its own orphaned vs-oat-mint-* dirs (readdir + lstat of tmpRoot)'],
  ['src/server/claude-signin.js', 'own-tree', 4, null, 'lane door-signin-card: the account\'s own pre-seeded creds dir (ensureSeed existsSync + the helper\'s .vibespace-login-status.json read — a member dir under data/subs) + the boot sweep of its own orphaned vs-signin-* scratch dirs (readdir + lstat of tmpRoot); nothing a person names'],
  ['src/server/ops-routes.js', 'own-tree', 10, null, DATA],
  ['src/server/otel-ingest.js', 'own-tree', 5, null, CLI], // B-1319: +1 = the stash replay's fs.promises read (the sync read stays, for a reader before the replay is done)
  ['src/server/permission-rules.js', 'own-tree', 3, null, CLI],
  ['src/server/plugin-install.js', 'own-tree', 17, null, DATA], // lane engine-distribution +1: the credential folder's mkdtemp inside the stage (data/plugins-staging)
  ['src/server/engine-distribution.js', 'own-tree', 10, null, DATA], // lane engine-distribution: the kernel's place data/plugins-state/<id>/kernel/ (the archive, its unpack folder, the receipt, statfs of its filesystem; round 2: the aside copy + the place stat'd before a landing restores one; round 3: each file written stat'd after its close — its size on disk against the bytes written; round 4: the put-back's stats — the aside copy, the place, its binary — ride the io seam, whose default fsp.stat is ONE site, so a transient EIO is injectable: 11 → 10), data/plugins/<id>/kernel.json, data/browser-engines.json
  ['src/server/plugin-loader.js', 'own-tree', 17, null, DATA], // lane engine-distribution +1: D2 reads the just-installed data/plugins/<id>/vibespace-plugin.json for the fleet trust's capabilities hash
  ['src/server/frame-host.js', 'user-path', 4, 'DOOR\\.blocked\\(', 'the code editor preview\'s folder (lane frame-host-preview): the base on the signed-in navigation and each file under a folder token — the door first, then SafeFs realpath + stat'],
  ['src/server/published-pages.js', 'user-path', 6, 'DOOR\\.blocked\\(', 'publish a user file: the sentence, never a stat'],
  ['src/server/search-index.js', 'own-tree', 5, null, CLI],
  ['src/server/session-stdout.js', 'own-tree', 13, null, PROC],
  ['src/server/spend-guard.js', 'own-tree', 1, null, DATA],
  ['src/server/stash-handover.js', 'own-tree', 1, null, DATA],
  ['src/server/tls.js', 'exempt', 5, null, 'data/tls (its own store: state.json, the Tailscale certificate) + the operator’s VIBESPACE_TLS_CERT / _KEY files — boot config, never a mount'],
  ['src/server/unexpected-exit.js', 'own-tree', 1, null, CLI],
  ['src/server/usage-index.js', 'own-tree', 1, null, CLI],
  ['src/server/usage-pool-engine.js', 'own-tree', 25, null, CLI], // lane oat-identity-fix-r3 −1: the `.window-` sidecar read moved to its ONE reader (src/window-stamp.js)
  ['src/server/usage-probe-log.js', 'own-tree', 3, null, CLI],
  ['src/server/git-identity.js', 'own-tree', 1, null, `${CLI} — lane door-day-one-landing: ~/.claude.json's oauthAccount (the sign-in's email + name, git's default identity)`],
  ['src/server/window-targets-engine.js', 'own-tree', 4, null, DATA],
  ['src/server/wrapper-files.js', 'own-tree', 6, null, PROC], // ci358-reds round 2 +2: the boot's age sweep (readdir + stat of BUFFERS_DIR), moved out of server.js
  ['src/session-status.js', 'own-tree', 1, null, DATA],
  ['src/session-store.js', 'own-tree', 27, null, `${CLI}; lane hub-fuse-sync-guard −2: the project-dir decode's three probes are ONE (probeCandidate: never below a storage mount)`],
  ['src/slot-transitions.js', 'own-tree', 4, null, DATA],
  ['src/sock-path.js', 'own-tree', 4, null, DATA],
  ['src/ssh-key.js', 'own-tree', 1, null, DATA],
  ['src/sync-store.js', 'own-tree', 2, null, DATA],
  ['src/input-inject.js', 'exempt', 2, null, 'lane stream-p1a-transport: the Linux input stub\'s own record (VIBESPACE_INPUT_STUB_FILE — the suites\' witness, unset = no file), read back only to trim it; never a hub path'],
  ['src/installed-apps.js', 'exempt', 2, null, 'lane machine-desktop-apps: runs on a paired Mac (the daemon\'s `desktop-apps-list` op) over its /Applications + ~/Applications — never a hub path, bounded by its budget'],
  ['src/sysinfo.js', 'own-tree', 9, null, PROC],
  ['src/task-groups.js', 'user-path', 14, 'DOOR\\.blocked\\(', 'the TASK.md writer (contextDir) + a session cwd realpath: skipped / not cached, said once; lane task-group-context: the Context table — a row\'s stat (_kindOf / _stat), a told file\'s read (_readText behind _stat) and a listed folder\'s walk (_walk) each ask the door first: a blocked row is told as "its storage is not answering"'],
  ['src/telemetry.js', 'own-tree', 5, null, DATA],
  ['src/transcript-service.js', 'own-tree', 5, null, CLI],
  ['src/usage-anchors.js', 'own-tree', 1, null, CLI],
  ['src/usage-cache-write.js', 'own-tree', 2, null, CLI],
  ['src/usage-estimator.js', 'own-tree', 3, null, CLI],
  ['src/usage-history.js', 'own-tree', 18, null, CLI], // B-1319: +1 = readBytesSync (a stepped slice's append-proof bytes before the slice) // r3: +1 = the append-only proof (probeHolds: the old tail at its old offset) // B-9428 r2: the cold rows are read by usage-cold-walk.js (its own row)
  ['src/usage-cold-walk.js', 'own-tree', 3, null, CLI], // r3: + the sync one-line read (a hash hit's string compare) // B-9428 r2: the ledger's cold rows at their (shard, offset) — the worker's fold, aggregate()/rows(), the popup's one line
  ['src/usage-index-worker.js', 'own-tree', 6, null, CLI],
  ['src/usage-origin-backfill.js', 'own-tree', 10, null, CLI],
  ['src/usage-routes.js', 'own-tree', 23, null, CLI], // lane oat-identity-fix-r3 −1: the `.window-` sidecar read moved to its ONE reader (src/window-stamp.js)
  ['src/usage-walker.js', 'user-path', 12, 'DOOR\\.blocked\\(', 'the usage walk: a blocked project folder skipped this pass, said once'],
  ['src/user-todos.js', 'own-tree', 1, null, DATA],
  ['src/vnc.js', 'own-tree', 3, null, PROC],
  ['src/webdav.js', 'user-path', 11, 'DOOR\\.blocked\\(', 'a WebDAV share root: 503 by name; lane hub-fuse-sync-guard: the /dav verbs are async fs (exists() = one fsp.access) — −5 sites'],
  ['src/weekly-lanes-unfold.js', 'own-tree', 8, null, CLI], // lane oat-identity-fix-r3 −1: the `.window-` sidecar read moved to its ONE reader (src/window-stamp.js)
  ['src/window-stamp.js', 'own-tree', 1, null, DATA], // lane oat-identity-fix-r3: the `.window-` sidecar's ONE reader (data/usage-cache)
  ['src/window-targets.js', 'own-tree', 2, null, PROC],
  ['src/workflow-usage-tailer.js', 'own-tree', 4, null, CLI],
  ['src/ws-create.js', 'own-tree', 4, null, CLI],
  ['src/ws-handler.js', 'own-tree', 8, null, CLI],
];
// SafeFs: the pool's door is asked before a worker is picked (a blocked path is never queued)
export const DOOR_PIN = { file: 'src/safe-fs.js', door: 'const mp = this._blocked(payload);', before: 'const rec = this._pick();' };

export function sitesOf(src) {
  let n = 0;
  for (const line of String(src).split('\n')) { if (COMMENT.test(line)) continue; n += (line.match(SITE) || []).length; }
  return n;
}
export function censusFiles(repo) {
  const out = [];
  for (const d of DIRS) {
    let names = []; try { names = fs.readdirSync(path.join(repo, d)); } catch { continue; }
    for (const n of names.sort()) if (n.endsWith('.js')) out.push([d + '/' + n, fs.readFileSync(path.join(repo, d, n), 'utf8')]);
  }
  return out;
}
export function judgeCensus(files, rows = ROWS) {
  const byFile = new Map(rows.map((r) => [r[0], r])), seen = new Set(), red = [], dead = [], lines = [], counts = {};
  for (const [f, src] of files) {
    const n = sitesOf(src);
    if (!n) continue;
    const r = byFile.get(f);
    if (!r) { red.push(`${f}: ${n} unlisted reader site(s) — a row: user-path (ask the door first) / own-tree / exempt`); continue; }
    seen.add(f);
    const [, kind, sites, guard, why] = r;
    counts[kind] = (counts[kind] || 0) + 1;
    if (n !== sites) red.push(`${f}: ${sites} → ${n} reader sites — classify the new read, then move the count`);
    if (kind === 'user-path' && !(guard && new RegExp(guard).test(src))) red.push(`${f}: a user-path reader with no door on the page (${guard})`);
    if (!['user-path', 'own-tree', 'exempt'].includes(kind) || !why) red.push(`${f}: kind ${kind} needs a why`);
    if (kind !== 'own-tree') lines.push(`${kind.padEnd(9)} ${f} ×${n} — ${why}`);
  }
  const live = new Set(files.map(([f]) => f));
  for (const [f] of rows) if (!seen.has(f) && live.has(f)) dead.push(`${f}: no reader site left`);
  for (const [f] of rows) if (!live.has(f) && files.length > 1) dead.push(`${f}: no such file`);
  return { red, dead, lines, counts };
}
export function doorPinned(src) {
  const a = String(src).indexOf(DOOR_PIN.door), b = String(src).indexOf(DOOR_PIN.before);
  return a >= 0 && b > a;
}
