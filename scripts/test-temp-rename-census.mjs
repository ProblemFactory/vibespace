#!/usr/bin/env node
// test-temp-rename-census — B-9275 unit 2 (lane lg-store-writes, the coordinator's r1153 / r1200; round wl2wglpsq's cure, r1346).
// FAST, PURE (acorn over the tracked src/ files and server.js that name a rename). THE LAW: A STORE'S NEW BYTES ARE ON DISK
// BEFORE ITS NAME POINTS AT THEM. WHAT IT READS: every MEMBER call `X.rename(` / `X.renameSync(` of tracked src/ and server.js
// on a file-system object (FS_OBJ), and every call through a BARE name `rename(` / `renameSync(` (red as unknown unless judged
// by file). WHAT IT DOES NOT JUDGE, by name — two REGIONS, COUNTED BY FILE (a new one is red by name), judged in row B-bcb8:
// (1) a `mv` inside a command string a child runs (src/: an install step, a device's state over ssh); (2) every rename under
// data/bin (the wrappers' sidecar, buffer, pid and exit files the hub reads; the CLIs' own files).
// Every judged rename is a ROW: its file, its CLASS (read here), its FAMILY (judged), one scope per site —
//   synced    a file written, SYNCED, then renamed over its name (a sync before the rename in the same scope)
//   unsynced  a file written in its scope, then renamed with no sync between
//   move      no file written before it in its scope: an existing file or folder moved
// (the scope read = the enclosing functions out to the one the site's scope names, never another function's text; a write is a
// writeFile / createWriteStream / an open for writing / a copy INTO the source; an open to append — its flag a literal, or a const of its function — is a log's rotation, not a
// write). Each FAMILY goes through the store writer, or is named with its reason, or is A CURE OWED with its row (FAMILIES).
// A NEW site without a row is red by name, a rowed site that is gone is red, a class its family does not admit is red, a family
// with no row is red; OWED_MAX (the sites of the owed families) is an EQUALITY here — the unit that cures a site lowers it, and
// a rise above OWED_BASELINE is red by name unless RISES names it. The CLASS is read by TEXT POSITION in the scope, not by data
// flow: any sync call after the source's last write reads «synced» (a sync of another descriptor, or one whose failure is
// swallowed, too — the families say which: «self-synced-best-effort»).
//
// WHAT A SYNC COSTS ON A NETWORK SHARE (the owner's hub keeps its data folder on one today) — from the filesystem's own words,
// not a run: nfs(5) «The sync mount option»: the NFS client delays an application's writes and sends them to the server when
// «an application flushes file data explicitly with sync(2), msync(2), or fsync(3)» or when «an application closes a file with
// close(2)»; «Close-to-open cache consistency»: «When the application closes the file, the NFS client writes back any pending
// changes to the file». So the writer's close already wrote the temp back; the sync placed BEFORE the close (B-9275 unit 1) takes
// that same write-back ahead of it, and the close then has nothing pending: no second write of the bytes. On a share mounted
// `nocto` the close does not write back, and there the sync is what puts the bytes on the server before the rename.
// Run: node scripts/test-temp-rename-census.mjs
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { walk, scopeOf } from './sync-fs-census.mjs';
import { trackedFiles } from './tracked-files.mjs';
import { checker } from './lib/check.mjs';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(import.meta.url);
const { ok, report } = checker();

// the objects whose rename is the file system's (fs, fs.promises, an injected fs: agentd's `f`, engine-distribution's `io`…)
const FS_OBJ = /^(?:fs|fsp|fsx|fsImpl|io|f|P|promises|[A-Za-z_$][\w$]*\.promises|require\((['"])(?:node:)?fs(?:\/promises)?\1\)(?:\.promises)?)$/;
// renames that are not the file system's, judged once
const NOT_FS = new Map([
  ['accounts', 'the accounts store renames an account (its label)'],
  ['c.ge', 'the groups engine renames a group (its label)'],
  ['ge', 'the groups engine renames a group (its label)'],
  ['G', 'the group model renames a group (its label)'],
  ['D()', 'the conversation ops rename a conversation (its label)'],
  ['panes', 'the machine desktop renames a pane key (in memory)'],
  ['design', 'the design engine renames a canvas (its own record)'],
  ['R.fs', 'a PAIRED machine\'s file: the remote file road asks the device agent to move it (not a write of the hub)'],
]);
// bare-name rename calls judged BY THEIR SCOPE (r1365: a whole file is never excused — a real bare file-system rename added in
// another scope of that file is red), counted: [file, scope, n, why]
const BARE_NOT_FS = [
  ['src/routes/files.js', 'route:POST /api/upload', 2, 'rename(name) makes a free file NAME (a string) for an upload: no file-system call'],
  ['src/lib/design-home.js', 'openDesignHome > menu > action', 1, 'the design home\'s menu calls its own rename(d): a dialog that asks the design engine (a client file): no file here'],
];
const bareKey = (file, scope) => `${file} | ${scope}`;
const BARE_JUDGED = new Map(BARE_NOT_FS.map((r) => [bareKey(r[0], r[1]), r]));
// a WRITE of a path (its argument index), a SYNC of a descriptor or a handle
const WRITE = new Map([['writeFileSync', 0], ['writeFile', 0], ['createWriteStream', 0], ['write', 0], ['openSync', 0], ['open', 0], ['copyFileSync', 1], ['copyFile', 1], ['cpSync', 1], ['cp', 1]]);
const SYNC = new Set(['fsyncSync', 'fsync', 'fdatasyncSync', 'fdatasync']);
const isFn = (n) => n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression';
// a function the scope NAMES (scopeOf's): the search for the write stops there — never another function's text
const named = (fnNode, up) => (fnNode.type === 'FunctionDeclaration' && !!fnNode.id) || (!!up && ['MethodDefinition', 'Property', 'VariableDeclarator', 'AssignmentExpression', 'PropertyDefinition'].includes(up.type));

/** Every rename call of one file's source: { file, line, scope, obj, cls, from, to, why } (cls: synced | unsynced | move — read
 *  in the enclosing functions up to the one its scope names, or its top-level statement), plus the renames on other objects
 *  ({ skipped }) and on objects nobody judged ({ unknown }). */
export function renameSites(rel, src, AC) {
  const code = src.replace(/^#!.*/, '');
  const opts = { ecmaVersion: 'latest', allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true, allowHashBang: true, locations: true };
  let ast; try { ast = AC.parse(code, { ...opts, sourceType: 'script' }); } catch { ast = AC.parse(code, { ...opts, sourceType: 'module', allowReturnOutsideFunction: false }); }
  const text = (n) => code.slice(n.start, n.end).replace(/\s+/g, ' ').trim();
  const sites = [], skipped = [], unknown = [];
  walk(ast, (n, parents) => {
    if (n.type !== 'CallExpression') return;
    // a call through a BARE name (a destructured or aliased rename): unknown — red — unless its file is judged in BARE_NOT_FS
    if (n.callee.type === 'Identifier' && (n.callee.name === 'rename' || n.callee.name === 'renameSync')) {
      const scope = scopeOf(parents);
      if (BARE_JUDGED.has(bareKey(rel, scope))) skipped.push({ file: rel, line: n.loc.start.line, obj: '(a bare name)', scope });
      else unknown.push({ file: rel, line: n.loc.start.line, obj: `(a bare ${n.callee.name})`, scope });
      return;
    }
    if (n.callee.type !== 'MemberExpression' || n.callee.computed) return;
    const p = n.callee.property && n.callee.property.name;
    if (p !== 'rename' && p !== 'renameSync') return;
    const obj = text(n.callee.object), line = n.loc.start.line, scope = scopeOf(parents);
    if (NOT_FS.has(obj)) { skipped.push({ file: rel, line, obj }); return; }
    if (!FS_OBJ.test(obj)) { unknown.push({ file: rel, line, obj, scope }); return; }
    const from = n.arguments[0] ? text(n.arguments[0]) : '', to = n.arguments[1] ? text(n.arguments[1]) : '';
    // where to read: the enclosing functions out to the one the scope names (inclusive); at the top level, its statement
    const roots = [];
    for (let i = parents.length - 1; i >= 0; i--) { if (!isFn(parents[i])) continue; roots.push(parents[i]); if (named(parents[i], parents[i - 1])) break; }
    if (!roots.length) roots.push(parents[1] || ast);
    const root = roots[roots.length - 1];
    let wrote = null, synced = [];
    // an open's flags through a CONST of its function (line 349, B-f276 1c: writeJob's `fl` = 'ax' for an own-only store's first
    // append, then O_WRONLY | O_APPEND, else 'a'): an append when EVERY leaf of its value is one — a string that starts with 'a',
    // or an OR-chain of constants that holds O_APPEND (and no O_TRUNC); a flag bound by let / var, or bound twice, reads as a write
    const appendOf = (x) => !!x && ((x.type === 'Literal' && typeof x.value === 'string' && /^a/.test(x.value)) || (x.type === 'ConditionalExpression' && appendOf(x.consequent) && appendOf(x.alternate)) || (x.type === 'BinaryExpression' && x.operator === '|' && /\bO_APPEND\b/.test(text(x)) && !/\bO_TRUNC\b/.test(text(x))));
    const constAppend = (name) => { let init = null, seen = 0; walk(root, (d, ps) => { if (d.type === 'VariableDeclarator' && d.id.type === 'Identifier' && d.id.name === name) { seen++; const decl = ps[ps.length - 1]; init = decl && decl.kind === 'const' ? d.init : null; } }); return seen === 1 && appendOf(init); };
    walk(root, (c) => {
      if (c.type !== 'CallExpression' || c.start >= n.start || c.callee.type !== 'MemberExpression' || c.callee.computed) return;
      const q = c.callee.property && c.callee.property.name;
      if (SYNC.has(q) || ((q === 'sync' || q === 'datasync') && !c.arguments.length)) { synced.push(c.start); return; }
      if (!WRITE.has(q)) return;
      const a = c.arguments[WRITE.get(q)];
      if (!a || text(a) !== from) return;
      if (q === 'open' || q === 'openSync') { const fl = c.arguments[1]; if (!fl || (fl.type === 'Literal' && typeof fl.value === 'string' && /^[ra]/.test(fl.value)) || (fl.type === 'Identifier' && constAppend(fl.name))) return; }   // a read, or an append (a log's rotation)
      if (!wrote || c.start > wrote) wrote = c.start;
    });
    const cls = wrote != null ? (synced.some((x) => x > wrote) ? 'synced' : 'unsynced') : (synced.length ? 'synced' : 'move');
    sites.push({ file: rel, line, scope, obj, cls, from: from.slice(0, 70), to: to.slice(0, 50) });
  });
  return { sites, skipped, unknown };
}

// ── THE FAMILIES: each goes THROUGH THE WRITER, or is NAMED with its reason, or is A CURE OWED with its row ─────────────────────
const FAMILIES = {
  writer: { verdict: 'through the writer', classes: ['synced'], why: 'the store writer\'s thread (src/store-writer-worker.js writeJob): every store the writer holds — the temp synced before the rename since B-9275 unit 1' },
  'self-synced': { verdict: 'named', classes: ['synced'], why: 'its own writer syncs the temp before the rename, and a sync that fails fails the write (since B-ddf3 the person\'s files the hub cures one by one: a mail message\'s copy, a rescued transcript; a private credential file, the device identity, a sealed app secret, a webhook\'s store, the usage ledger\'s rewrite)' },
  'self-synced-best-effort': { verdict: 'named', classes: ['synced'], why: 'its own writer syncs the temp before the rename BEST EFFORT: a sync that FAILS (EIO, ENOSPC) is swallowed and the temp is still renamed — the vault\'s files, its TOTP and run-door stores, the automation store (round wl2wglpsq: rare, said here as it is)' },
  secret: { verdict: 'cured', row: 'B-dc3f', classes: ['synced'], why: 'the secret-bearing replace (src/secret-file.js): CURED in the hotfix 2.369.415 by another lane (row B-dc3f: synced, renamed, its folder synced). The hotfix is under this tree, so the family admits SYNCED only: a regression of the cure is red' },
  store: { verdict: 'owed', row: 'B-574d', classes: ['unsynced', 'move'], why: 'a store or a record of the HUB written by its own temp + rename with no sync: after a power loss its name can point at an empty file, read back as damaged. The cure: through the store writer (synced since B-9275 unit 1) or one shared synced replace' },
  b0248: { verdict: 'owed', row: 'B-0248', classes: ['unsynced'], why: 'a store that moves onto the store writer in row B-0248 (lane bl-loop-b): synced once it is there' },
  spend: { verdict: 'owed', row: 'B-ef83', classes: ['unsynced'], why: 'the spend ledger (data/spend-budget.json): onto the store writer in row B-ef83' },
  person: { verdict: 'owed', row: 'B-ddf3', classes: ['unsynced'], why: 'a file of the PERSON\'s written through the hub (a copy across machines, a DAV upload, a design file, a CLI\'s settings, a rescued transcript, an export, a browser profile\'s preferences): after a power loss its name can point at an empty file — the person\'s own bytes' },
  device: { verdict: 'owed', row: 'B-93e7', classes: ['unsynced', 'move'], why: 'the device agent\'s own state on a paired machine (its dial file, trust / policy / floor pins, orders, cursors, a secret file it is handed, its bundle\'s landing): after a power loss there it can come back unable to dial; its cure changes the device agent (a signed release)' },
  derived: { verdict: 'named', classes: ['unsynced', 'move', 'synced'], why: 'bytes MADE AGAIN from a source that stays (a tool copied at every start, a download checked by its digest, an unpacked build, a generated wrapper or shim; a cache of a source still on disk — a torn cached copy may be served until it is pruned): no person\'s data and no source is lost' },
  'ruled-sync': { verdict: 'named', classes: ['unsynced'], why: 'kept SYNCHRONOUS ON THE LOOP BY THE COORDINATOR\'s RULING (r3455, B-574d unit 1): a grant is a person\'s rare press — its all-or-nothing answer before the reply and the use marks\' order after the grants\' landing are worth more than the move; opened again only if a measure shows a grant\'s write holding the loop or a torn grants file met in use' },
  'not-production': { verdict: 'named', classes: ['unsynced'], why: 'a road the hub never takes (B-574d unit 1, 主开发 r3455 line 3): a suite\'s stand-in, or a fallback for a caller that hands no live store; the production road is named in the row' },
  aside: { verdict: 'named', classes: ['unsynced', 'move'], why: 'a file SET ASIDE, not new bytes put in place (a stale lock moved out of the way)' },
  move: { verdict: 'named', classes: ['move'], why: 'no bytes written before it in its scope: an existing file or folder moved (a rotation, an aside of a damaged copy, a folder swap, a symlink swap) — its bytes were written and closed long before' },
};

/** The census's verdict over its sites: rows matched by (file, class, scope), one scope per site. */
export function judge(sites, rows, families = FAMILIES) {
  const left = rows.map((r) => { const m = new Map(); for (const sc of r.slice(4)) m.set(sc, (m.get(sc) || 0) + 1); return m; });
  const noRow = [], extra = [], badFamily = [];
  let owed = 0;
  for (const s of sites) {
    const cands = rows.map((r, i) => i).filter((i) => rows[i][0] === s.file && rows[i][1] === s.cls && left[i].has(s.scope));
    if (!cands.length) { noRow.push(s); continue; }
    const i = cands.find((k) => left[k].get(s.scope) > 0);
    if (i === undefined) { extra.push(s); continue; }
    left[i].set(s.scope, left[i].get(s.scope) - 1);
    const fam = families[rows[i][2]];
    if (!fam || !fam.classes.includes(s.cls)) badFamily.push({ ...s, family: rows[i][2] });
    else if (fam.verdict === 'owed') owed++;
  }
  const gone = []; rows.forEach((r, i) => { for (const [sc, n] of left[i]) if (n > 0) gone.push({ file: r[0], cls: r[1], family: r[2], scope: sc, missing: n }); });
  return { noRow, extra, gone, badFamily, owed };
}

// ── THE ROWS: [file, class, family, note, ...one scope per site] ─────────────────────────────────────────────────────────────
const ROWS = [
  ["src/account-material.js", "move", "move", "", "repointPoolSymlink", "moveAside", "swapSync", "archiveCredentialFile", "moveCredentialArchives"],   // r2697 (lane bl-loop-b): − linkInto — its no-hard-link fallback is an exclusive copy now, never a check-then-rename
  ["src/account-material.js", "synced", "self-synced", "", "writePrivateFile", "writePrivateFileAsync"],
  ["src/accounts.js", "move", "move", "", "AccountManager._moveLogin", "AccountManager.mergeSubscription"],   // r2822 (lane bl-loop-b): the folded row's file set aside as an archive when the survivor's file stood   // B-87fd identity unit 3: the relogin's moves (out, held, back) through ONE method
  ["src/adapters/codex.js", "unsynced", "derived", "a decompressed copy of a .zst transcript (made again from it)", "plainJsonlPath"],
  ["src/agentd/agentd.js", "move", "move", "", "rename", "move", "noteAct", "log"],
  ["src/agentd/agentd.js", "synced", "self-synced", "", "part-commit", "deviceIdentity", "writeDropped", "dropReportHead"],   // lg-remote-hardening (r1669): the pool report's dropped count and its head's drop, synced before the rename (a sync that fails fails the write)
  ["src/agentd/agentd.js", "unsynced", "device", "", "writeDialStatus", "<module>", "<module>", "pinTrust", "writeFloor", "pinHub", "_persist", "serveConnection > onControl > st.commit", "serveConnection > onControl", "onListening", "learnHub"],
  ["src/agentd/agentd.js", "move", "device", "its signed bundle landed (the temp written by the stream or the ssh road), then `current` repointed", "landBundle"],
  ["src/agentd/agentd.js", "move", "device", "the ssh road's staged bundle moved to its temp", "<module>"],
  ["src/agentd/client.js", "unsynced", "store", "the local device's upgrade proof, written by the HUB's DeviceManager (its cure is the hub's, not a device release)", "DeviceManager._writeLocalProof"],
  ["src/agentd/client.js", "move", "move", "", "DeviceManager.installLocal"],
  ["src/agentd/reexec.js", "move", "move", "the `current` symlink swapped (metadata, no file bytes)", "repointCurrent", "repointCurrent"],
  ["src/agentd/self-retire.js", "unsynced", "device", "", "runRetire"],
  ["src/agentd/stream-mac.js", "unsynced", "device", "the mac stream helper's state and version", "createMacHelper > writeState", "createMacHelper > ensure"],
  ["src/agentd/stream-mac.js", "move", "derived", "the helper binary built or pushed (made again)", "createMacHelper > build", "createMacHelper > ensure"],
  ["src/app-secrets-seal.js", "synced", "self-synced", "", "<module>"],
  ["src/app-serve.js", "unsynced", "store", "", "writeJsonAtomic"],
  ["src/app-serve.js", "move", "move", "", "create > writeManifest"],
  ["src/app-serve.js", "move", "derived", "a downloaded installer / app image, checked and installed again", "create > fetchInstaller", "create > installAppImage", "create > installAppImage"],
  ["src/app-system-serve.js", "unsynced", "derived", "the shims, synced again at each start", "create > syncShims"],
  ["src/archive-roll.js", "move", "move", "the reading archive's roll (B-360d part 3 U2): the live append-only file renamed to its day's shard — a rotation, a shard never written over", "rollIfOver"],
  ["src/browser-serve.js", "unsynced", "person", "a browser profile's own preferences file", "planLaunch"],
  ["src/browser-serve.js", "unsynced", "derived", "the build pointer, written again at each launch", "writeBuildView"],
  ["src/channel-outbox-files.js", "move", "store", "an approved attachment's folder: its files staged moments before in the same request (stage(), no sync), then renamed into place (round wl2wglpsq's must)", "commit"],
  ["src/channel-store.js", "unsynced", "store", "", "writeJsonAtomic", "createChannelStore > rewriteRecords", "createChannelStore > trim", "createChannelStore > prependRecords", "createChannelStore > trimSide", "createChannelStore > avatarPut", "createChannelStore > attachmentPut"],
  ["src/channel-store.js", "move", "move", "the damaged door (B-f276 1b): a family's companion files set aside at «Start it empty», put back if the press cannot finish", "createChannelStore > startDamagedEmpty", "createChannelStore > startDamagedEmpty > back"],
  ["src/channels/webhook.js", "synced", "self-synced", "", "writeJsonAtomic"],
  ["src/channels/webhook.js", "unsynced", "store", "", "queueAppend"],
  ["src/claude-oat-probe.js", "move", "derived", "the probe's own scratch (a symlink, a variant folder)", "measure > repoint", "measure > runVariant", "measure > runVariant"],
  ["src/codex-fork-ledger-purge.js", "unsynced", "store", "", "_writeAtomic"],
  ["src/conversation-index.js", "unsynced", "store", "", "ConversationIndex._flush"],
  ["src/design-fs.js", "unsynced", "person", "a design file of the person's", "writeUser"],
  ["src/desktop-display.js", "unsynced", "derived", "the X authority file, made at each display start", "writeXauthority"],
  ["src/desktop-mic.js", "unsynced", "store", "", "createMic > writeJson"],
  ["src/desktop-serve.js", "unsynced", "b0248", "the desktop apps' store", "writeJsonAtomic"],
  ["src/desktop-serve.js", "unsynced", "store", "", "install > scrubRdpLogFile"],
  ["src/desktop-serve.js", "unsynced", "derived", "a seeded profile frame, made again when missing", "install > seedChromiumFrame"],
  ["src/desktop-serve.js", "move", "move", "", "install > stop"],
  ["src/exit-proxy.js", "synced", "self-synced", "", "ExitProxyManager._transferHeld"],
  ["src/fixture-ledger-purge.js", "unsynced", "store", "", "_writeAtomic"],
  ["src/gmail-sync.js", "unsynced", "store", "", "GmailSync._saveState"],
  ["src/gmail-sync.js", "synced", "self-synced", "the person's local mail copy: the folder's file NAMES are the seen index (a torn copy would never be fetched again) — written, synced and renamed off the loop since B-ddf3 unit 1", "GmailSync._writeMessage"],
  ["src/harness-config.js", "synced", "self-synced", "a CLI's own settings file (the person's): the shipped helper syncs its temp before the rename (or the link), a failed sync fails the write, since B-ddf3 unit 2 line 2", "commitWrite", "commitCreate"],
  ["src/harnesses/claude-home.js", "move", "move", "", "moveUser", "moveUser", "relinkLegacy"],
  ["src/harnesses/codex-models.js", "unsynced", "derived", "a cache of the CLI's model list", "models"],
  ["src/host-keys.js", "unsynced", "store", "", "writePinFile"],
  ["src/hosts.js", "unsynced", "store", "", "HostManager._persistDiscovery"],
  ["src/hosts.js", "move", "move", "", "HostManager.migrateDialTokenFile > later", "HostManager.migrateDialTokenFile", "HostManager._migrateDialTokensAtRead > later"],
  ["src/job-logs-sweep-worker.js", "unsynced", "store", "the remover child's count of what it removed (B-323e), read by the hub", "countWrite"],
  ["src/job-logs-sweep-worker.js", "move", "move", "", "stateOf"],
  ["src/job-logs-sweep.js", "unsynced", "derived", "a batch's request file (B-323e), handed to its child by name at once and swept by the next pass: a torn one is never read again", "createRemover > writeRequest"],
  ["src/jobs.js", "unsynced", "store", "", "writeJsonAtomic", "JobManager._rewriteSpills"],
  ["src/jobs.js", "move", "move", "", "JobManager._unreadPrefetch", "JobManager._noteDone", "JobManager._logsHeldFile"],
  ["src/ledger-slot-backfill.js", "unsynced", "store", "", "_writeAtomic"],
  ["src/machine-mounts.js", "unsynced", "store", "", "MachineMounts._migrateLegacy", "MachineMounts._save"],
  ["src/machine-mounts.js", "move", "move", "", "MachineMounts._migrateLegacy", "MachineMounts._migrateLegacy"],
  ["src/migration-runner.js", "unsynced", "store", "", "writeLedger"],
  ["src/mounts.js", "unsynced", "store", "", "MountManager._save"],
  ["src/mounts.js", "move", "move", "", "MountManager._openMountLog"],
  ["src/node-runtime.js", "unsynced", "derived", "a downloaded Node runtime (checked by its digest), fetched again", "fetchFile", "flip", "flip"],
  ["src/node-runtime.js", "move", "derived", "a downloaded Node runtime (checked by its digest), fetched again", "provision", "provision"],
  ["src/opencode-serve.js", "unsynced", "store", "", "writeJsonAtomic"],
  ["src/plugins.js", "unsynced", "store", "", "PluginManager._save"],
  ["src/pool-pin-record.js", "move", "move", "the person's pool pin record (B-526c unit 2): a symlink whose target text is the pin, renamed over its name — a symlink swap, no file bytes written", "write"],
  ["src/port-forward.js", "unsynced", "store", "", "writeJsonAtomic"],
  ["src/reading-repair.js", "unsynced", "store", "", "_writeAtomic"],
  ["src/routes/files.js", "unsynced", "store", "", "writeExtractJournal"],
  ["src/routes/files.js", "move", "move", "", "crossHostTransfer"],
  ["src/routes/files.js", "unsynced", "person", "a file copied from another machine into the person's folder", "crossHostTransfer"],
  ["src/routes/persistence.js", "unsynced", "store", "the layouts' owed mark (data/layouts.owed.json, B-0248: an episode's mark, its own temp + rename, unsynced) — the layouts and settings themselves are the store writer's since B-0248 step 2", "setup > writeMark"],
  ["src/safe-fs-worker.js", "move", "move", "", "rename", "move"],
  ["src/safe-fs-worker.js", "unsynced", "person", "the person's file copied or moved across devices (its .part)", "copy", "move"],
  ["src/secret-file.js", "synced", "secret", "the secret-bearing replace (synced since the hotfix 2.369.415): the sync one, and its async twin the interface's sign-in table writes through (the separation's B3b-1, line 306: the temp synced, then renamed, its folder synced)", "replaceShredding", "replaceShreddingAsync"],
  ["src/server/agent-listener.js", "unsynced", "store", "", "keepPort"],
  ["src/server/agent-tool-generators.js", "unsynced", "derived", "an agent tool copied from the checkout at every start", "create > createBrowserVerbsCopy", "create > createBrowserStuckCopy", "create > createBrowserPasskeyCopy", "create > createBrowserReadBackCopy", "create > createCliTextCopy", "create > createCliCallCopy", "create > createFdCloseCopy", "create > createLocalIndexCopy"],
  ["src/server/apps-engine.js", "unsynced", "store", "", "writeJsonAtomic"],
  ["src/server/auto-cli-loop.js", "unsynced", "store", "", "saveState"],
  ["src/server/auto-resume.js", "unsynced", "store", "", "writeJsonAtomic"],
  ["src/server/automation-engine.js", "synced", "self-synced-best-effort", "", "writeJsonAtomic"],
  ["src/server/boot-restore.js", "unsynced", "store", "", "writeJsonAtomic", "create > keepEnded"],
  ["src/server/boot-restore.js", "move", "move", "", "create > retireDeadSocket"],
  ["src/server/boot-trace.js", "unsynced", "store", "", "start > close"],
  ["src/server/browser-bindings.js", "unsynced", "store", "", "writeBindingsFile"],   // r3585: the one writer lifted out of create (every instance's record, and the rebuild)
  ["src/server/browser-builds-keeper.js", "move", "derived", "a browser build's folder landed or removed (downloaded again)", "create > landUnpacked", "create > removeChromeBuild"],
  ["src/server/browser-clone-run.js", "unsynced", "derived", "a profile copied for one run", "copyProfileDir"],
  ["src/server/browser-display-config.js", "unsynced", "derived", "a generated wrapper, made again when it differs", "create > engineWrapperFor"],
  ["src/server/browser-env.js", "unsynced", "store", "", "writeJsonAtomic"],
  ["src/server/browser-kept-note.js", "synced", "self-synced", "r3786 (line 821's second form): a kept folder's NOTE, and a session's generated config without its kept folder before a start that is not kept — each temp written whole, synced and closed before its rename, awaited off the loop; a sync that fails fails the write (the start is then not kept, or refused by name)", "writeNote", "unkeepConfig"],
  ["src/server/browser-keeper.js", "unsynced", "store", "", "writeJsonAtomic", "create > lineageLedger"],
  ["src/server/browser-keeper.js", "synced", "self-synced", "a browser profile's own Preferences and the person's kept geolocation values beside it (B-9584 U2c, r1897): each temp synced before its rename, awaited", "create > geoStoreAt > writeAtomic"],
  ["src/server/browser-keeper.js", "move", "move", "", "create > adoptScratch"],
  ["src/server/browser-kept.js", "move", "move", "", "create > moveAside"],   // the sweep's fail-closed law (lane bl-windows, 主开发 r3006): the load renames nothing (a store that could not be read stays where it is)
  ["src/server/browser-trace.js", "unsynced", "store", "", "writeJsonAtomic", "create > rewriteIndex"],
  ["src/server/browser-trace.js", "move", "move", "", "create > forgetProfile > moveAside", "create > forgetOrphan"],
  ["src/server/channel-api-cards.js", "unsynced", "store", "", "create > save"],
  ["src/server/channel-api.js", "unsynced", "store", "", "create > save"],
  ["src/server/channel-api.js", "move", "move", "", "create > audit"],
  ["src/server/channels-attention.js", "unsynced", "store", "", "create > save"],
  ["src/server/cli-model-catalog.js", "unsynced", "store", "", "saveLedger"],
  ["src/server/cli-models-door.js", "unsynced", "store", "", "createCliModelsDoor > save"],
  ["src/server/cli-registration.js", "unsynced", "store", "", "create > save"],
  ["src/server/conversation-deliver.js", "unsynced", "store", "", "create", "create > writeStashNow", "create > writeRetryNow"],
  ["src/server/conversation-deliver.js", "move", "move", "", "create", "create > applyRetryRead"],
  ["src/server/csp-reports.js", "move", "move", "", "create > append"],
  ["src/server/csp-reports.js", "unsynced", "store", "", "create > rejudge"],
  ["src/server/design-engine.js", "unsynced", "store", "", "writeJsonAtomic"],
  ["src/server/desktop-app-keeper.js", "move", "move", "", "create > asideRemote"],
  ["src/server/device-upgrade-watch.js", "unsynced", "store", "", "create > save"],
  ["src/server/dial-health-watch.js", "unsynced", "store", "", "create > save"],
  ["src/server/doc-engine.js", "unsynced", "store", "", "ownerMemo > save"],
  ["src/server/dropline-oauth.js", "unsynced", "not-production", "tokenFile: the voice suites' tokens stand-in; the hub keeps the pair through src/server/sealed-json.js (the secret family's synced replace)", "tokenFile > write"],
  ["src/server/engine-distribution.js", "move", "derived", "an engine build's folders swapped (downloaded and unpacked again)", "create > rename", "create > landDir", "create > landDir", "create > landDir", "create > landDir", "create > stageNext", "create > stageNext", "create > stageNext > back", "create > healAside", "create > putBack"],
  ["src/server/engine-distribution.js", "unsynced", "store", "", "create > save"],
  ["src/server/feedback-forward.js", "unsynced", "store", "", "writeJsonAtomic"],
  ["src/server/feedback-store.js", "unsynced", "store", "", "writeJsonAtomic"],
  ["src/server/grants-migration.js", "unsynced", "not-production", "the hosts.json reshape with no live HostManager handed (a suite); the hub hands one: hosts.reshapeStore, on the store writer", "migrate"],
  ["src/server/grants-store.js", "unsynced", "ruled-sync", "a grant's land: all or nothing, on disk before the person's reply (主开发 r3455)", "writeJsonAtomic"],
  ["src/server/grants-store.js", "move", "move", "", "create > audit"],
  ["src/server/home-rename.js", "unsynced", "store", "", "rewriteStores", "migrateHomeRename"],
  ["src/server/host-tokens.js", "unsynced", "store", "", "create > writeIdentity"],
  ["src/server/instance-url.js", "unsynced", "store", "", "writeJsonAtomic"],
  ["src/server/integration-store.js", "move", "move", "", "create > load"],
  ["src/server/job-secrets-door.js", "move", "move", "", "create > setAside"],
  ["src/server/local-index.js", "unsynced", "derived", "the person CLI's index and copy, written again from the hub's state", "write", "write", "stop", "installPersonCli"],
  ["src/server/migrations.js", "unsynced", "store", "", "create > run", "create > run", "create > run", "create > run", "create > run", "create > run", "create > run", "create > run", "create > migrateContextRowsFile", "create > dropWarmthDerived", "create > cloakMigrateNow > writeAtomic", "create > stripRetiredSettingsFile", "create > migrateExitLists > reshape", "create > migrateExitLists", "create > voidRunaway", "create > stampDesktopHostKey"],
  ["src/server/migrations.js", "move", "move", "", "create > run"],
  ["src/server/plugin-install.js", "move", "move", "", "moveDir"],
  ["src/server/plugin-loader.js", "unsynced", "store", "", "writeJsonAtomic"],
  ["src/server/published-pages.js", "unsynced", "store", "", "writeJsonAtomic"],
  ["src/server/published-pages.js", "unsynced", "person", "a page's published content", "create > publishContent"],
  ["src/server/queued-wakes.js", "move", "move", "", "create"],
  ["src/server/rewind-keep-worker.js", "synced", "self-synced", "the kept copy (row B-437e): its press's manifest, a person's file put back from its kept copy, and the conversation's kept lines (U3) — the temp synced before the rename; a sync that fails fails the act", "seal", "putOne", "writeLines"],
  ["src/signin-witness-worker.js", "synced", "self-synced", "B-dc3f (1) H1 (主开发 r3030 (a)): the network home's sign-in witness copy — a temp opened wx 0600, written, SYNCED, renamed over the copy; a sync that fails fails the write (the temp removed, the failure said once by the hub)", "netWrite"],
  ["src/server/session-stdout.js", "unsynced", "store", "", "create > setupSessionPty > finishTeardown", "create > writeSessionMeta"],
  ["src/server/spend-guard.js", "unsynced", "spend", "data/spend-budget.json", "writeJsonAtomic"],
  ["src/server/spend-guard.js", "unsynced", "aside", "a stale lock set aside", "create > takeLock"],
  ["src/server/stash-handover.js", "unsynced", "store", "", "create > persistDelivered"],
  ["src/server/sync-fs-witness-worker.js", "unsynced", "store", "", "finishCapture"],
  ["src/server/tailnet-door.js", "unsynced", "store", "", "create > keep"],
  ["src/server/tls.js", "unsynced", "store", "", "create > saveState"],
  ["src/server/usage-pool-engine.js", "synced", "self-synced", "", "create > persistResetCreditTries"],   // r3154 (4): the reset-credit attempts' copy is written synced (flush) before the link or the rename
  ["src/server/usage-pool-engine.js", "move", "move", "", "create > applyResetCreditTriesRead"],
  ["src/server/usage-pool-engine.js", "move", "move", "", "create > asideTornTriesAsync"],
  ["src/server/usage-pool-engine.js", "move", "move", "", "create > retireSplitNames"],   // B-87fd identity unit 4: a split name's anchors file archived beside itself (r3022 (1))
  ["src/server/usage-probe-log.js", "move", "move", "", "appendProbeLog"],
  ["src/server/provider-spawn.js", "unsynced", "derived", "a spawn plan's file (B-d578 P1-a: OpenCode's one config under the provider's home), written again from its plan at every spawn", "writePlanFile"],
  ["src/server/vault-engine.js", "synced", "self-synced-best-effort", "", "writeAtomic"],
  ["src/server/vault-run-door.js", "synced", "self-synced-best-effort", "", "writeJsonAtomic"],
  ["src/server/vault-run-door.js", "synced", "self-synced", "the run store's torn bytes kept aside (主开发 r3040 (a), the family's way): written whole under a .part- name, synced (a sync that fails fails the keep — the store stays held), then named", "create > keepTornAside"],
  ["src/server/vault-totp.js", "synced", "self-synced-best-effort", "", "writeJsonAtomic"],
  ["src/server/vault-use-grants.js", "unsynced", "ruled-sync", "the use marks' generation, written only after the grants write landed: the anti-replay order across two files (主开发 r3455)", "writeJsonAtomic"],
  ["src/server/window-targets-engine.js", "unsynced", "store", "", "writeJsonAtomic"],
  ["src/server/writes-lost.js", "unsynced", "store", "", "writeAtomic"],
  ["src/server/writes-lost.js", "move", "move", "", "create > load"],
  ["src/slot-transitions.js", "unsynced", "store", "", "SlotTransitions._maybeTrim"],
  ["src/store-hold.js", "unsynced", "b0248", "the hold's write (the desktops and their rollback points)", "create > write", "create > write"],
  ["src/store-hold.js", "move", "move", "a DAMAGED copy set aside under its dated name, its bytes untouched: setAside, and its off-the-loop twin setAsideAsync (line 349, B-f276 1c — r1143 (3): the rename through fs.promises, a person's press)", "create > setAside", "create > setAsideAsync"],
  ["src/store-writer-worker.js", "move", "move", "a ring's rotation (the live log to .1; each append was synced)", "writeJob"],
  ["src/store-writer-worker.js", "synced", "writer", "the store writer's thread: every store the writer holds (a whole write in pieces too: pieceJob)", "writeJob", "pieceJob"],
  ["src/store-writer-worker.js", "synced", "writer", "the store writer's thread: the REWRITE of an append store from its own bytes (row B-360d — the OTel stash's trim), synced, then renamed over the file", "rewriteJob"],
  ["src/task-groups.js", "move", "move", "", "TaskGroupManager._mirrorIo > rename"],
  ["src/task-groups.js", "unsynced", "derived", "a Task Group's mirror file, written again from the group's state", "TaskGroupManager._runMirror"],
  ["src/task-groups.js", "unsynced", "store", "", "TaskGroupManager._archiveClear", "TaskGroupManager._importArchive"],
  ["src/task-groups.js", "unsynced", "person", "an export the person asked for", "TaskGroupManager.exportToFile"],
  ["src/transcript-service.js", "synced", "self-synced", "a conversation transcript rescued in place: it and its backup synced before the swap since B-ddf3 unit 1", "createTranscriptService > rescue"],
  ["src/usage-cache-write.js", "unsynced", "store", "", "atomicWrite", "setAsideReading"],   // r3200: + the person's set-aside puts a file that STARTED AGAIN in place (its own temp, as the writer's)
  ["src/usage-cache-write.js", "move", "aside", "r3200: the person's set-aside of an account's reading file that cannot be read — the old file renamed beside itself, and put back if the new one cannot be put in place", "setAsideReading", "setAsideReading"],
  ["src/usage-history.js", "unsynced", "store", "", "UsageHistory._writeAtomic"],
  ["src/usage-hold-road.js", "move", "move", "", "UsageHoldRoad._setAsideFile"],
  ["src/usage-hold-road.js", "unsynced", "store", "", "UsageHoldRoad._setAsideLive", "UsageHoldRoad._dropCompact"],
  ["src/usage-ledger-dedup.js", "move", "move", "", "appendFile"],
  ["src/usage-ledger-dedup.js", "synced", "self-synced", "", "dedupSteps"],
  ["src/usage-origin-backfill.js", "unsynced", "store", "", "_writeAtomic"],
  ["src/user-todos.js", "move", "move", "", "UserTodoManager._setAside", "UserTodoManager._setAsideOff"],
  ["src/vnc.js", "unsynced", "store", "", "VncManager._record"],
  ["src/webdav.js", "unsynced", "store", "", "MountTokens._save"],
  ["src/webdav.js", "unsynced", "person", "a DAV upload (PUT)", "registerWebdav > route:USE /dav"],
  ["src/webdav.js", "move", "move", "", "registerWebdav > route:USE /dav"]
];
const OWED_MAX = 132;   // B-0248 unit 2 (lane bl-loop-b, 主开发 r4232; formed again on 7f83d9203 by r4472): 133 → 132 — browser-kept.json is the store writer's (synced on its thread; its unsynced row gone).  lane lg-recovery (主开发 r3321): 141 → 140 — the synced stores' flush (src/sync-store.js SyncStore.flush, an unsynced temp + rename) goes through the store writer (synced, off the loop): its row dropped. lane lg-store-writes (B-574d unit 1 (a), 主开发 r3455 / r3486): 141 → 136 on the train (146 → 141 at its base) — accounts.json onto the store writer (its row gone), the grants store and the use marks named «ruled-sync» (r3455), the voice suites' token helper and the grants migration's no-manager road named «not-production» (4 rows restated). Before: B-0248 unit 5 (lane bl-loop-b, 主开发 r4147): 141 → 139 — login-expiry.json and sysinfo-history.json are the store writer's (synced on its thread; their unsynced rows gone).  B-0248 unit 3 (lane bl-loop-b, r3320 / r3651): 143 → 142 — desktop-apps-hosts.json is the store writer's (synced on its thread; the keeper's unsynced row gone).  B-ddf3 unit 2 line 2 (lane bl-scratch): 145 → 143 — a CLI's own settings file synced before its rename / link (the shipped helper's commitWrite, commitCreate). Before: lane lg-vault-env (r3002 (d)): the grant ends' set-aside rename is gone into the store-read hold (its row dropped) — a «move» row, not an owed family: the owed count is not moved by it. B-0248 (lane bl-loop-b, r3320): 146 → 145 — the For-you list's write is the store writer's (synced).  lane bl-windows (r3154 (4)): 146 → 145 — the reset-credit attempts' save syncs its copy before the rename (self-synced). r3200 (lane login-request-card): 146 → 147 — the reading file's set-aside puts its new file in place by its own temp + rename (the writer's own family, B-574d). B-0248's next part (lane lg-vault-env, r2417): 146 → 145 — the decision journal's trim through the store writer (its temp + rename on the loop gone). Before: B-360d part 3 U2 (lane lg-group-parents): 147 → 146 — data/usage-cache.json through the store writer (writeUsageCache's own temp + rename gone). Before: the live-tip census cure (lane lg-store-writes, r1790): 147 stays, each step by name — −1 the layouts and settings (src/routes/persistence.js writeJsonAtomic: the store writer's since B-0248 step 2), +1 the layouts' owed mark (setup > writeMark: new, unsynced, B-574d owes it); the remover's count is the old site renamed (orphaned → countWrite). Before: row B-360d (lane hub-loop-stalls, its move onto the .416 root): 148 → 147 — the OTel stash's trim rename (otel-ingest's replayEnd) is the store writer's REWRITE job now (src/store-writer-worker.js rewriteJob: fsync'd, renamed on the writer's thread). B-ddf3 unit 1 (lane bl-scratch): 150 → 148 — the Gmail copy and the rescued transcript synced. The sites of the OWED families (store B-574d, device B-93e7, person B-ddf3, b0248 B-0248, spend B-ef83): may only fall: an EQUALITY with the census — a cure lowers it in its own commit; a rise above OWED_BASELINE is red unless RISES names it
// THE RATCHET (round wl2wglpsq): OWED_MAX is an EQUALITY with the census (a cure lowers it in the cure's own commit). A commit
// could raise it and stay green here, so a rise above the KEPT baseline is red by name unless RISES names it with its row
const OWED_BASELINE = 150;   // kept at the census's acceptance (round wl2wglpsq's cure: 148 + the Gmail copy + the outbox folder)
const RISES = [];            // [n, row, why] — a named rise of the owed count (none)

const AC = require(path.join(REPO, 'node_modules/acorn'));
const NAMES = /\brename(?:Sync)?\s*\(/;
const sitesOfTree = (repo) => {
  const all = { sites: [], skipped: [], unknown: [] };
  for (const rel of trackedFiles(repo, 'src', 'server.js').filter((f) => /\.(?:c|m)?js$/.test(f))) {
    const src = fs.readFileSync(path.join(repo, rel), 'utf8');
    if (!NAMES.test(src)) continue;
    const r = renameSites(rel, src, AC);
    for (const k of Object.keys(all)) all[k].push(...r[k]);
  }
  return all;
};
const all = sitesOfTree(REPO);
const say = (s) => `${s.file}:${s.line} ${s.scope} (${s.cls}) ${s.from} → ${s.to}`;
console.log(`① every file-system rename of src/ and server.js: ${all.sites.length} sites in ${new Set(all.sites.map((s) => s.file)).size} files (${['synced', 'unsynced', 'move'].map((c) => `${all.sites.filter((s) => s.cls === c).length} ${c}`).join(', ')}); ${all.skipped.length} renames of other objects`);
ok(all.unknown.length === 0, 'every rename is on a judged object (the file system, NOT_FS by name, or a bare call judged by its scope)', all.unknown);
{
  const seenBare = new Map(); for (const x of all.skipped.filter((k) => k.obj === '(a bare name)')) seenBare.set(bareKey(x.file, x.scope), (seenBare.get(bareKey(x.file, x.scope)) || 0) + 1);
  const offBare = BARE_NOT_FS.filter((r) => (seenBare.get(bareKey(r[0], r[1])) || 0) !== r[2]);
  ok(offBare.length === 0, `every judged bare call's scope holds its stated count (${BARE_NOT_FS.map((r) => `${r[0]} ${r[1]} ×${r[2]}`).join(' · ')})`, offBare.map((r) => ({ row: r, seen: seenBare.get(bareKey(r[0], r[1])) || 0 })));
}
const J = judge(all.sites, ROWS);
for (const s of J.noRow) console.error(`  ✗ NO ROW (a new rename: give it its family): ${say(s)}`);
for (const s of J.extra) console.error(`  ✗ ONE MORE SITE than its row says: ${say(s)}`);
for (const g of J.gone) console.error(`  ✗ GONE (drop it from its row; a cure lowers OWED_MAX): ${g.file} ${g.scope} (${g.cls}, ${g.family}) ×${g.missing}`);
for (const s of J.badFamily) console.error(`  ✗ ITS FAMILY «${s.family}» DOES NOT ADMIT ${s.cls}: ${say(s)}`);
ok(J.noRow.length === 0 && J.extra.length === 0 && J.gone.length === 0, `every rename site has its row, and every row its sites (${J.noRow.length} new, ${J.extra.length} more, ${J.gone.length} gone)`);
ok(J.badFamily.length === 0, 'every site\'s class is one its family admits (the writer\'s and a self-synced family\'s: synced only)');
ok(ROWS.every((r) => !!FAMILIES[r[2]]) && Object.values(FAMILIES).every((f) => ['through the writer', 'named', 'cured', 'owed'].includes(f.verdict) && ((f.verdict !== 'owed' && f.verdict !== 'cured') || /^B-[0-9a-f]{4}$/.test(f.row))), 'every row names a family, and every family goes through the writer, is named, or is a cure (owed or done elsewhere) WITH its row');
ok(J.owed === OWED_MAX, `OWED_MAX: ${J.owed} sites of the owed families (stated ${OWED_MAX}) — ${J.owed < OWED_MAX ? `LOWER OWED_MAX to ${J.owed} (a cure: the ratchet falls)` : J.owed > OWED_MAX ? 'a NEW owed site: the ratchet only falls (cure it, or name its family with its reason)' : 'held'}`);
ok(Object.keys(FAMILIES).every((k) => ROWS.some((r) => r[2] === k)), `every family has its rows (${Object.keys(FAMILIES).filter((k) => !ROWS.some((r) => r[2] === k)).join(', ') || 'none empty'})`);
ok(OWED_MAX <= OWED_BASELINE + RISES.reduce((a, r) => a + r[0], 0) && RISES.every((r) => Number.isInteger(r[0]) && r[0] > 0 && /^B-[0-9a-f]{4}$/.test(r[1]) && !!r[2]), `the owed count rises only BY NAME: ${OWED_MAX} against the kept baseline ${OWED_BASELINE}${RISES.length ? ` + ${RISES.map((r) => `${r[0]} (${r[1]})`).join(' + ')}` : ''}`, { OWED_MAX, OWED_BASELINE, RISES });

// ── THE TWO REGIONS NOT JUDGED HERE (round wl2wglpsq): COUNTED BY FILE — a new one is red by name; judged in row B-bcb8 ──────
// (1) data/bin: every member rename on a file-system object (and every bare-name call) of its tracked files; (2) shell: every
// `mv` inside a string or template a src/ file holds (a command a child runs: an install step, a device's state over ssh)
const REGION_ROWS = [
  ["data/bin", "data/bin/acp-wrapper.js", 2],
  ["data/bin", "data/bin/agy-wrapper.js", 5],
  ["data/bin", "data/bin/chat-wrapper.js", 4],   // + B-5a4d root: the conversation's handed records (<buffers>/handed/<conversation id>.json), temp + rename
  ["data/bin", "data/bin/codex-chat-wrapper.js", 3],   // + B-cd4b's said journal (the wrapper's hold): one more temp + rename
  ["data/bin", "data/bin/job-wrapper.js", 5],
  ["data/bin", "data/bin/pty-wrapper.js", 1],
  ["data/bin", "data/bin/vibespace-browser", 1],
  ["data/bin", "data/bin/vibespace-channels", 1],
  ["data/bin", "data/bin/vibespace-claude-subscription-login.mjs", 1],
  ["data/bin", "data/bin/vibespace-design", 1],
  ["data/bin", "data/bin/vibespace-hook-register.mjs", 2],
  ["data/bin", "data/bin/vibespace-opencode-op", 1],
  ["data/bin", "data/bin/vibespace-usage", 3],
  ["data/bin", "data/bin/vibespace-usage-scan", 1],
  ["shell", "src/app-manifest.js", 8],
  ["shell", "src/app-system.js", 10],
  ["shell", "src/desktop-apps.js", 1],
  ["shell", "src/hosts.js", 4],
  ["shell", "src/install-slot.js", 2],
  ["shell", "src/mounts.js", 3],
  ["shell", "src/remote-fs.js", 2],
  ["shell", "src/routes/files.js", 3],
  ["shell", "src/server/design-engine.js", 1],
  ["shell", "src/spawn/ssh.js", 1],
];   // [region, file, count] — read on the census's base (round wl2wglpsq's cure): data/bin 30 renames in 14 files (B-cd4b's said journal +1 in the codex wrapper, at the live-tip cure), shell 35 «mv» in 10 files (the writer unit's cure: + the two at a template piece's end in src/routes/files.js, + «mv» as a program twice — mvCount)
/** the `mv` a src/ file hands a child: in a string or a template piece, with its operands or at a piece's END before ${…} (the
 *  round's B-bcb8 read: «&& mv ${a} ${b}»), and 'mv' alone AS A PROGRAM — a call's first argument followed by its argv array
 *  (execFile('mv', [a, b])), or an argv element after flags only (['-n', 'mv', a, b]); never 'mv' as a word (a pointer event's
 *  type, a command-word table, an allow list) */
const MV = /(?:^|[\s;&|(])mv(?=\s|$)/g;
function mvCount(src) {
  const code = src.replace(/^#!.*/, ''), opts = { ecmaVersion: 'latest', allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true, allowHashBang: true };
  let ast; try { ast = AC.parse(code, { ...opts, sourceType: 'script' }); } catch { ast = AC.parse(code, { ...opts, sourceType: 'module', allowReturnOutsideFunction: false }); }
  let n = 0;
  const isProgram = (x, parents) => {
    const up = parents[parents.length - 1], up2 = parents[parents.length - 2];
    if (up && up.type === 'CallExpression' && up.arguments[0] === x) return !!(up.arguments[1] && up.arguments[1].type === 'ArrayExpression');
    if (up && up.type === 'ArrayExpression' && up2 && up2.type === 'CallExpression' && up2.arguments.includes(up)) { const i = up.elements.indexOf(x); return up.elements.slice(0, i).every((e) => e && e.type === 'Literal' && typeof e.value === 'string' && e.value.startsWith('-')); }
    return false;
  };
  walk(ast, (x, parents) => {
    if (x.type === 'Literal' && typeof x.value === 'string') n += x.value === 'mv' ? (isProgram(x, parents) ? 1 : 0) : (x.value.match(MV) || []).length;
    else if (x.type === 'TemplateElement') n += (String(x.value.cooked ?? x.value.raw).match(MV) || []).length;
  });
  return n;
}
const regionCount = () => {
  const out = new Map(), add = (k, n) => { if (n) out.set(k, (out.get(k) || 0) + n); };
  for (const rel of trackedFiles(REPO, 'data/bin')) {
    let src = ''; try { src = fs.readFileSync(path.join(REPO, rel), 'utf8'); } catch { continue; }
    if (!/^#!.*\bnode\b/.test(src) && !/\.(?:c|m)?js$/.test(rel)) continue;   // the JavaScript tools (a shell script has none of these calls)
    if (!NAMES.test(src)) continue;
    let r; try { r = renameSites(rel, src, AC); } catch (e) { add(`data/bin | ${rel} | UNPARSED ${e.message}`.slice(0, 160), 1); continue; }
    add(`data/bin | ${rel}`, r.sites.length + r.unknown.length);
  }
  for (const rel of trackedFiles(REPO, 'src', 'server.js').filter((f) => /\.(?:c|m)?js$/.test(f))) {
    const src = fs.readFileSync(path.join(REPO, rel), 'utf8');
    if (!/\bmv\b/.test(src)) continue;
    add(`shell | ${rel}`, mvCount(src));
  }
  return out;
};
{
  const counted = regionCount(), rowed = new Map(REGION_ROWS.map((r) => [`${r[0]} | ${r[1]}`, r[2]]));
  const off = [...new Set([...counted.keys(), ...rowed.keys()])].filter((k) => counted.get(k) !== rowed.get(k)).sort();
  for (const k of off) console.error(`  ✗ REGION ROW: ${JSON.stringify([...k.split(' | '), counted.get(k) || 0])} (the row says ${rowed.get(k) ?? 'nothing'})`);
  const by = (reg) => [...counted].filter(([k]) => k.startsWith(reg + ' |')).reduce((a, [, n]) => a + n, 0);
  ok(off.length === 0, `the two regions not judged here, counted by file (judged in row B-bcb8): data/bin ${by('data/bin')} renames, shell ${by('shell')} «mv» in command strings — every file's count is its row's`);
}
console.log('② the families:');
for (const [k, f] of Object.entries(FAMILIES)) {
  const rs = ROWS.filter((r) => r[2] === k), n = rs.reduce((a, r) => a + r.length - 4, 0);
  console.log(`  · ${k} — ${f.verdict}${f.row ? ' ' + f.row : ''} — ${n} site${n === 1 ? '' : 's'} in ${new Set(rs.map((r) => r[0])).size} file${new Set(rs.map((r) => r[0])).size === 1 ? '' : 's'}: ${f.why}`);
}

// ── ③ THE CLASSIFIER, planted (PURE) ─────────────────────────────────────────────────────────────────────────────────────────
console.log('③ the classifier on planted sources');
{
  const one = (src) => renameSites('src/zz-plant.js', src, AC);
  const cls = (src) => one(src).sites.map((s) => s.cls).join(',');
  ok(cls(`function save(f, d) { const tmp = f + '.tmp'; fs.writeFileSync(tmp, d); fs.renameSync(tmp, f); }`) === 'unsynced', 'a temp written then renamed: unsynced');
  ok(cls(`function save(f, d) { const tmp = f + '.t'; const fd = fs.openSync(tmp, 'w'); fs.writeSync(fd, d); fs.fsyncSync(fd); fs.closeSync(fd); fs.renameSync(tmp, f); }`) === 'synced', 'a temp written, fsynced, renamed: synced');
  ok(cls(`async function save(f, d) { const tmp = f + '.t'; const h = await fsp.open(tmp, 'w'); await h.writeFile(d); await h.sync(); await h.close(); await fsp.rename(tmp, f); }`) === 'synced', 'a handle\'s sync() before the rename: synced');
  ok(cls(`function save(f, d) { const tmp = f + '.t'; fs.writeFileSync(tmp, d); fs.renameSync(tmp, f); const fd = fs.openSync(f, 'r'); fs.fsyncSync(fd); }`) === 'unsynced', 'a sync AFTER the rename is no sync of the temp: unsynced');
  ok(cls(`function rot(f) { fs.renameSync(f, f + '.1'); }`) === 'move', 'a rename with no write before it: move');
  ok(cls(`function rot(f, b) { const fd = fs.openSync(f, 'a'); fs.writeSync(fd, b); fs.closeSync(fd); fs.renameSync(f, f + '.1'); }`) === 'move', 'an append log\'s rotation (opened \'a\'): move');
  ok(cls(`async function c(d) { const tmp = d + '.tmp'; await fs.promises.copyFile(path.join(a, 'b'), tmp); await fs.promises.rename(tmp, d); }`) === 'unsynced', 'a copy INTO the temp (its first argument a call): unsynced');
  ok(cls(`function a(t) { fs.writeFileSync(t, 'x'); }\nfunction b(t, f) { fs.renameSync(t, f); }`) === 'move', 'a write in ANOTHER named function is not this scope\'s: move');
  ok(cls(`function c(t, f) { fs.writeFileSync(t, 'x'); setImmediate(() => fs.renameSync(t, f)); }`) === 'unsynced', 'a callback reads the scope that names it: unsynced');
  const u = one(`function z() { thing.rename(1, 2); accounts.rename('a', 'b'); }`);
  ok(u.unknown.length === 1 && u.unknown[0].obj === 'thing' && u.skipped.length === 1 && u.sites.length === 0, 'an object nobody judged is red by name; a NOT_FS object is skipped by name', u);
  const mvs = [mvCount('const c = `mkdir -p ${d} && mv ${a} ${b}`;'), mvCount("execFile('mv', [a, b]); run('sudo', ['-n', 'mv', a, b]);"), mvCount("const c = 'cat > a.tmp && mv -f a.tmp a';"), mvCount("const t = 'a movie, a move'; const m = `remove ${x}`; const e = { t: 'mv' }; pointerMessage('mv', ev); const ok = Object.freeze(['ls', 'mv']); if (head === 'mv') { }")];
  ok(mvs.join() === '1,2,1,0', `the region's «mv» count: one at a template piece's end before \${…} (${mvs[0]}), «mv» as a program name (${mvs[1]}), one with its operands (${mvs[2]}), none in prose nor as a word (a pointer event's type, a command-word table, an allow list: ${mvs[3]})`, mvs);
  const bare = renameSites('src/zz-plant.js', `function z(a, b) { const { renameSync } = require('fs'); renameSync(a, b); }`, AC), judgedBare = renameSites('src/zz-plant.js', `function n() { return rename('a.txt'); }`, AC);
  ok(bare.unknown.length === 1 && bare.unknown[0].obj === '(a bare renameSync)' && judgedBare.unknown.length === 1 && judgedBare.unknown[0].scope === 'n', 'a call through a BARE name (destructured, aliased) is red as unknown, with its scope — only a judged SCOPE is skipped, never a whole file', { bare, judgedBare });
  // an open's flags through a CONST of its function (line 349's `fl`): every leaf an append — the rotation after it reads «move»;
  // CONTROLS: one leaf that writes ('w'), and a flag bound by let, read as a write before the rename («unsynced»)
  const flagOf = (decl) => renameSites('src/zz-plant.js', `function z(f, g, c) { const fs = require('fs'); ${decl} const fd = fs.openSync(f, fl); fs.closeSync(fd); fs.renameSync(f, g); }`, AC).sites.map((s) => s.cls).join(',');
  const flags = { append: flagOf("const fl = c ? 'ax' : fs.constants.O_WRONLY | fs.constants.O_APPEND;"), write: flagOf("const fl = c ? 'w' : 'a';"), notConst: flagOf("let fl = 'a'; if (c) fl = 'w';") };
  ok(flags.append === 'move' && flags.write === 'unsynced' && flags.notConst === 'unsynced', `an open's flags read through a CONST of its function: every leaf an append — the rotation reads «move» (${flags.append}); CONTROLS: a leaf that writes (${flags.write}), a flag bound by let (${flags.notConst}) — read as a write`, flags);
}

// ── ④ THE WRITER'S LAW, and the census's own controls ───────────────────────────────────────────────────────────────────────
console.log('④ the store writer syncs (B-9275 unit 1) — RED: today\'s writeJob; a new site, a gone site, a fallen count');
{
  const { anchored } = await import('./scratch.mjs');
  const rel = 'src/store-writer-worker.js', real = fs.readFileSync(path.join(REPO, rel), 'utf8');
  const wj = (src) => renameSites(rel, src, AC).sites.filter((s) => s.scope === 'writeJob' && s.from === 'm.tmp').map((s) => s.cls).join(',');
  const today = anchored(real, 'try { writeAll(fs, fd, m.parts); fs.fsyncSync(fd); } catch (e) { err = e; }', 'try { writeAll(fs, fd, m.parts); } catch (e) { err = e; }', 'today: a whole write renamed with no sync');   // stale-pins: kept (today's line, the RED copy)
  ok(wj(real) === 'synced', `the store writer's whole write reads synced (${wj(real)})`);
  const swapped = all.sites.filter((s) => s.file !== rel).concat(renameSites(rel, today, AC).sites);
  const Jt = judge(swapped, ROWS);
  ok(wj(today) === 'unsynced' && Jt.noRow.some((s) => s.file === rel && s.scope === 'writeJob' && s.cls === 'unsynced'), `RED (today's writeJob): it reads ${wj(today)}, and no row takes an unsynced write of the writer (its family admits synced only)`, Jt.noRow);
  const owedRow = ROWS.find((r) => FAMILIES[r[2]].verdict === 'owed');
  const pick = all.sites.find((s) => s.file === owedRow[0] && s.cls === owedRow[1] && s.scope === owedRow[4]);
  const J1 = judge(all.sites.concat([{ ...pick, line: 0 }]), ROWS);
  ok(J1.extra.length === 1, 'CONTROL: one more unsynced site in a rowed scope is red («one more site»)');
  const J2 = judge(all.sites.concat([{ ...pick, file: 'src/zz-new.js' }]), ROWS);
  ok(J2.noRow.length === 1, 'CONTROL: a rename in a file with no row is red («no row»)');
  const J3 = judge(all.sites.filter((s) => s !== pick), ROWS);
  ok(J3.gone.length === 1 && J3.owed === OWED_MAX - 1, `CONTROL: a cured owed site is red until its row drops it and OWED_MAX falls (${J3.owed} of ${OWED_MAX})`);
}
report();
