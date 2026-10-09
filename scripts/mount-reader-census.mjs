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
  ['src/account-material.js', 'own-tree', 1, null, CLI],
  ['src/accounts.js', 'own-tree', 18, null, CLI],
  ['src/acp-message-manager.js', 'own-tree', 1, null, CLI],
  ['src/app-serve.js', 'own-tree', 29, null, DATA],
  ['src/app-squashfs.js', 'own-tree', 2, null, DATA],
  ['src/app-system-serve.js', 'own-tree', 13, null, DATA],
  ['src/auth.js', 'own-tree', 1, null, DATA],
  ['src/browser-facts.js', 'own-tree', 24, null, PROC],
  ['src/browser-serve.js', 'own-tree', 7, null, DATA],
  ['src/browser-verbs.js', 'own-tree', 2, null, DATA],
  ['src/channel-outbox-files.js', 'own-tree', 5, null, DATA],
  ['src/channel-store.js', 'own-tree', 30, null, DATA],
  ['src/claude-lock-capture.js', 'own-tree', 3, null, CLI],
  ['src/cli-identity.js', 'own-tree', 18, null, PROC],
  ['src/codex-fork-ledger-purge.js', 'own-tree', 6, null, CLI],
  ['src/codex-session-store.js', 'own-tree', 3, null, CLI],
  ['src/conversation-index.js', 'own-tree', 1, null, DATA],
  ['src/ctx-sync.js', 'user-path', 4, 'DOOR\\.blocked\\(', 'the group context folder walk: refused by name before the device is dialled'],
  ['src/design-fs.js', 'user-path', 7, 'DOOR\\.blocked\\(', 'the design folder read: storage_blocked by name'],
  ['src/desktop-display.js', 'own-tree', 19, null, PROC],
  ['src/desktop-serve.js', 'own-tree', 10, null, DATA],
  ['src/device-mount.js', 'exempt', 5, null, 'the device pull mount: /proc scans + its own mount point (its owner’s liveness)'],
  ['src/discovery-facts.js', 'own-tree', 5, null, PROC],
  ['src/exit-proxy.js', 'user-path', 10, 'DOOR\\.blocked\\(', 'an exit-run transfer’s local side: refused by name (transfer_failed)'],
  ['src/fixture-ledger-purge.js', 'own-tree', 6, null, CLI],
  ['src/gmail-sync.js', 'own-tree', 2, null, DATA],
  ['src/harness-config.js', 'own-tree', 9, null, CLI],
  ['src/hosts.js', 'own-tree', 29, null, DATA],
  ['src/incident.js', 'own-tree', 19, null, DATA],
  ['src/jobs.js', 'own-tree', 22, null, DATA],
  ['src/ledger-slot-backfill.js', 'own-tree', 13, null, CLI],
  ['src/login-state.js', 'own-tree', 2, null, CLI],
  ['src/machine-mounts.js', 'own-tree', 7, null, DATA],
  ['src/machine-probes.js', 'own-tree', 7, null, CLI],
  ['src/migration-runner.js', 'own-tree', 1, null, DATA],
  ['src/mounts.js', 'exempt', 26, null, 'the manager itself: /proc, its config, its own mount points only through probe CHILDREN (ls -d) — the sweep that sets the block; lane vfs-cache-local +4: the local cache root probe (accessSync, ~/.cache) + the vfsMeta walk\'s text run in a CHILD node (statSync/readdirSync/readFileSync inside CACHE_META_CHILD); r2 +2: the override root\'s statSync (a non-dir is refused) + the child\'s root stat (an absent root is unknown, not absence)'],
  ['src/opencode-serve.js', 'own-tree', 3, null, CLI],
  ['src/opslog.js', 'exempt', 2, null, '/proc/mounts + the ops log folder'],
  ['src/peer-messaging.js', 'own-tree', 3, null, DATA],
  ['src/plugins.js', 'own-tree', 1, null, DATA],
  ['src/port-forward.js', 'own-tree', 4, null, PROC],
  ['src/proc-identity.js', 'own-tree', 7, null, PROC],
  ['src/proc-listen.js', 'own-tree', 4, null, PROC],
  ['src/quota-model-migrate.js', 'own-tree', 2, null, CLI],
  ['src/rate-limit-capture.js', 'own-tree', 3, null, CLI],
  ['src/reading-repair.js', 'own-tree', 10, null, CLI],
  ['src/remote-fs.js', 'own-tree', 1, null, DATA],
  ['src/routes/apps.js', 'own-tree', 4, null, DATA],
  ['src/routes/browser-trace.js', 'own-tree', 2, null, DATA],
  ['src/routes/channels.js', 'own-tree', 5, null, DATA],
  ['src/routes/files.js', 'user-path', 41, 'mounts\\.pathBlocked\\(p\\)', 'the explorer + every file op: the route middleware 503 by name, then SafeFs.call refuses at the pool door'],
  ['src/routes/persistence.js', 'own-tree', 15, null, DATA],
  ['src/routes/sessions.js', 'user-path', 26, 'DOOR\\.blocked\\(', 'a session cwd realpath (sync, main thread): null, not cached'],
  ['src/routes/window-targets.js', 'own-tree', 1, null, DATA],
  ['src/safe-fs-worker.js', 'exempt', 18, null, 'the SafeFs worker: it runs a path SafeFs.call already asked the door about (src/safe-fs.js _blocked)'],
  ['src/search-index-worker.js', 'own-tree', 5, null, CLI],
  ['src/secret-box.js', 'own-tree', 5, null, DATA],
  ['src/server/account-usage-routes.js', 'own-tree', 1, null, CLI],
  ['src/server/agent-tool-generators.js', 'user-path', 21, 'DOOR\\.blocked\\(', 'a session root’s git facts: the sentence as facts.error'],
  ['src/server/apps-engine.js', 'own-tree', 1, null, DATA],
  ['src/server/auto-cli-loop.js', 'own-tree', 2, null, CLI],
  ['src/server/auto-resume.js', 'own-tree', 1, null, CLI],
  ['src/server/boot-restore.js', 'own-tree', 13, null, DATA],
  ['src/server/bridge-watch.js', 'own-tree', 6, null, PROC],
  ['src/server/browser-bindings.js', 'own-tree', 2, null, DATA],
  ['src/server/browser-builds-keeper.js', 'own-tree', 8, null, DATA],
  ['src/server/browser-cli-install.js', 'own-tree', 2, null, DATA],
  ['src/server/browser-cloak-install.js', 'own-tree', 4, null, DATA],
  ['src/server/browser-clone-run.js', 'own-tree', 2, null, DATA],
  ['src/server/browser-disk-run.js', 'own-tree', 3, null, DATA],
  ['src/server/browser-display-config.js', 'own-tree', 3, null, DATA],
  ['src/server/browser-env.js', 'own-tree', 22, null, DATA],
  ['src/server/browser-installs.js', 'own-tree', 5, null, DATA],
  ['src/server/browser-keeper.js', 'own-tree', 33, null, DATA],
  ['src/server/browser-kept.js', 'own-tree', 3, null, DATA],
  ['src/server/browser-trace.js', 'own-tree', 13, null, DATA],
  ['src/server/channel-api-cards.js', 'own-tree', 2, null, DATA],
  ['src/server/channel-api.js', 'own-tree', 3, null, DATA],
  ['src/server/channels-wiring.js', 'own-tree', 3, null, DATA],
  ['src/server/cli-cmd.js', 'own-tree', 3, null, CLI],
  ['src/server/cli-env.js', 'own-tree', 4, null, PROC],
  ['src/server/cluster-presets.js', 'own-tree', 7, null, DATA],
  ['src/server/conversation-deliver.js', 'own-tree', 2, null, DATA],
  ['src/server/design-engine.js', 'user-path', 6, 'DOOR\\.blocked\\(', 'the design watch relist: refused by name, never read'],
  ['src/server/desktop-app-keeper.js', 'own-tree', 1, null, DATA],
  ['src/server/device-upgrade-watch.js', 'own-tree', 1, null, DATA],
  ['src/server/dial-pairing.js', 'own-tree', 1, null, DATA],
  ['src/server/exit-routes.js', 'own-tree', 1, null, DATA],
  ['src/server/fd-gauge.js', 'own-tree', 4, null, PROC],
  ['src/server/fs-canary-worker.js', 'exempt', 1, null, 'the canary probes the server’s own tree in its own worker'],
  ['src/server/goal-sync.js', 'own-tree', 3, null, CLI],
  ['src/server/hook-root-watch.js', 'own-tree', 2, null, CLI],
  ['src/server/incident-wiring.js', 'own-tree', 6, null, DATA],
  ['src/server/instance-url.js', 'own-tree', 1, null, DATA],
  ['src/server/integration-store.js', 'own-tree', 1, null, DATA],
  ['src/server/jobs-wiring.js', 'own-tree', 2, null, DATA],
  ['src/server/login-expiry-watch.js', 'own-tree', 1, null, DATA],
  ['src/server/memory-pressure-watch.js', 'own-tree', 3, null, PROC],
  ['src/server/memory-sampler.js', 'own-tree', 1, null, PROC],
  ['src/server/migrations.js', 'own-tree', 37, null, DATA],
  ['src/server/mount-health-watch.js', 'exempt', 6, null, 'the server-tree watch: /proc + mountinfo, never a user path (the judge’s P4)'],
  ['src/server/mounts-plugins-wiring.js', 'own-tree', 7, null, DATA],
  ['src/server/ops-routes.js', 'own-tree', 10, null, DATA],
  ['src/server/otel-ingest.js', 'own-tree', 4, null, CLI],
  ['src/server/permission-rules.js', 'own-tree', 3, null, CLI],
  ['src/server/plugin-install.js', 'own-tree', 16, null, DATA],
  ['src/server/plugin-loader.js', 'own-tree', 16, null, DATA],
  ['src/server/published-pages.js', 'user-path', 6, 'DOOR\\.blocked\\(', 'publish a user file: the sentence, never a stat'],
  ['src/server/search-index.js', 'own-tree', 5, null, CLI],
  ['src/server/session-stdout.js', 'own-tree', 13, null, PROC],
  ['src/server/spend-guard.js', 'own-tree', 1, null, DATA],
  ['src/server/stash-handover.js', 'own-tree', 1, null, DATA],
  ['src/server/unexpected-exit.js', 'own-tree', 1, null, CLI],
  ['src/server/usage-index.js', 'own-tree', 1, null, CLI],
  ['src/server/usage-pool-engine.js', 'own-tree', 26, null, CLI],
  ['src/server/usage-probe-log.js', 'own-tree', 3, null, CLI],
  ['src/server/window-targets-engine.js', 'own-tree', 4, null, DATA],
  ['src/server/wrapper-files.js', 'own-tree', 4, null, PROC],
  ['src/session-status.js', 'own-tree', 1, null, DATA],
  ['src/session-store.js', 'own-tree', 29, null, CLI],
  ['src/slot-transitions.js', 'own-tree', 4, null, DATA],
  ['src/sock-path.js', 'own-tree', 4, null, DATA],
  ['src/ssh-key.js', 'own-tree', 1, null, DATA],
  ['src/sync-store.js', 'own-tree', 2, null, DATA],
  ['src/sysinfo.js', 'own-tree', 9, null, PROC],
  ['src/task-groups.js', 'user-path', 11, 'DOOR\\.blocked\\(', 'the TASK.md writer (contextDir) + a session cwd realpath: skipped / not cached, said once'],
  ['src/telemetry.js', 'own-tree', 5, null, DATA],
  ['src/transcript-service.js', 'own-tree', 5, null, CLI],
  ['src/usage-anchors.js', 'own-tree', 1, null, CLI],
  ['src/usage-cache-write.js', 'own-tree', 2, null, CLI],
  ['src/usage-estimator.js', 'own-tree', 3, null, CLI],
  ['src/usage-history.js', 'own-tree', 17, null, CLI], // r3: +1 = the append-only proof (probeHolds: the old tail at its old offset) // B-9428 r2: the cold rows are read by usage-cold-walk.js (its own row)
  ['src/usage-cold-walk.js', 'own-tree', 3, null, CLI], // r3: + the sync one-line read (a hash hit's string compare) // B-9428 r2: the ledger's cold rows at their (shard, offset) — the worker's fold, aggregate()/rows(), the popup's one line
  ['src/usage-index-worker.js', 'own-tree', 6, null, CLI],
  ['src/usage-origin-backfill.js', 'own-tree', 10, null, CLI],
  ['src/usage-routes.js', 'own-tree', 24, null, CLI],
  ['src/usage-walker.js', 'user-path', 12, 'DOOR\\.blocked\\(', 'the usage walk: a blocked project folder skipped this pass, said once'],
  ['src/user-todos.js', 'own-tree', 1, null, DATA],
  ['src/vnc.js', 'own-tree', 3, null, PROC],
  ['src/webdav.js', 'user-path', 16, 'DOOR\\.blocked\\(', 'a WebDAV share root: 503 by name'],
  ['src/weekly-lanes-unfold.js', 'own-tree', 9, null, CLI],
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
