#!/usr/bin/env node
// test-temp-rename-census — B-9275 unit 2 (lane lg-store-writes, the coordinator's r1153 / r1200; round wl2wglpsq's cure, r1346).
// FAST, PURE (acorn over the tracked src/ files and server.js that name a rename). THE LAW: A STORE'S NEW BYTES ARE ON DISK
// BEFORE ITS NAME POINTS AT THEM. WHAT IT READS: every MEMBER call `X.rename(` / `X.renameSync(` of tracked src/ and server.js
// on a file-system object (FS_OBJ), and every call through a BARE name `rename(` / `renameSync(` (red as unknown unless judged
// by file). THE TWO REGIONS, JUDGED (row B-bcb8's first unit, lane bl-scratch, 主开发 r5170; counted by file before it):
// (1) every rename under data/bin (the wrappers' records the hub reads, the tools' own files) is a ROW like src/'s, its class READ
// the same way (BIN_ROWS); (2) a `mv` inside a command string a child runs (src/: an install step, a device's state over ssh, a
// person's copy on another machine) is a ROW by its scope and its own words (SHELL_ROWS), its SYNC READ by text position (a `sync`
// before it in its command) and the rest of its class judged by reading. Their owed sites are REGION_OWED_MAX, beside OWED_MAX.
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
  spend: { verdict: 'owed', row: 'B-ef83', classes: ['unsynced'], why: 'the spend ledger (data/spend-budget.json): onto the store writer in row B-ef83' },
  'device-door': { verdict: 'named', classes: ['synced'], door: 'src/agentd/durable-file.js', why: 'THE DEVICE\'S ONE DOOR (B-93e7, 主开发 r4381 / r4387): a record the device agent writes for itself takes its name only after ONE sync of its temp; a refused sync is SAID in the agent\'s own log (once a file) and the record still lands — the record law, kept on BOTH sides by 主开发 r4834 for every module the device bundles (B-574d); a failed write, close or rename throws, the old file whole — and its bundle\'s landing (landBundle): the verdict, ONE sync, the name, `current`, where a sync that FAILS refuses the landing. It is a DEVICE INPUT (every change of it rides a signed agent release), so it is a door of its own: the hub\'s wrapper helper in src/fd-close.js (B-bcb8) changes with any hub release — the class\'s TWO doors, a third is red' },
  'synced-in-place': { verdict: 'named', classes: ['synced'], why: 'B-574d (主开发 r4761, the third shape): a write that already runs OFF the hub\'s loop (the promises road, or a worker thread) synced IN PLACE — its temp opened, written, synced, closed, then renamed on the road it already takes; the door\'s laws: a sync or a close that fails is a failed write (said by name, the old file whole, no temp left), and only a file system that does no sync at all lands it, said once a site' },
  derived: { verdict: 'named', classes: ['unsynced', 'move', 'synced'], why: 'bytes MADE AGAIN from a source that stays (a tool copied at every start, a download checked by its digest, an unpacked build, a generated wrapper or shim; a cache of a source still on disk — a torn cached copy may be served until it is pruned; B-574d, 主开发 r4761: a DIAGNOSTIC nobody reads back after a power loss — a torn copy is skipped or handed on as it is, nothing is held as damaged): no person\'s data and no source is lost' },
  'ruled-sync': { verdict: 'named', classes: ['unsynced'], why: 'kept SYNCHRONOUS ON THE LOOP BY THE COORDINATOR\'s RULING (r3455, B-574d unit 1): a grant is a person\'s rare press — its all-or-nothing answer before the reply and the use marks\' order after the grants\' landing are worth more than the move; opened again only if a measure shows a grant\'s write holding the loop or a torn grants file met in use' },
  'not-production': { verdict: 'named', classes: ['unsynced'], why: 'a road the hub never takes (B-574d unit 1, 主开发 r3455 line 3): a suite\'s stand-in, or a fallback for a caller that hands no live store; the production road is named in the row' },
  aside: { verdict: 'named', classes: ['unsynced', 'move'], why: 'a file SET ASIDE, not new bytes put in place (a stale lock moved out of the way)' },
  move: { verdict: 'named', classes: ['move'], why: 'no bytes written before it in its scope: an existing file or folder moved (a rotation, an aside of a damaged copy, a folder swap, a symlink swap) — its bytes were written and closed long before' },
  sample: { verdict: 'named', classes: ['unsynced'], why: 'a READING of a live run, written again every 2 s while the job is over half its memory bound (data/bin/job-wrapper.js pressure.json; B-bcb8\'s first unit): read only to judge how a run that left no exit record ended (src/jobs.js _ctlJson reads a torn one as none) — after a power loss no sample is the environment\'s end, which the run\'s end then is' },
  region: { verdict: 'owed', row: 'B-bcb8', classes: ['unsynced'], why: 'a file written by a command string the hub hands a child, or by a tool under data/bin, through its own temp + rename with no sync (judged in B-bcb8\'s first unit): after a power loss its name can point at an empty file, and each row says what that costs. Unit C of the row: the person\'s copies on another machine and the design file there (the command\'s own copy; the «person» family\'s cross-machine copy is the hub\'s local road), agy\'s conversation modes and the link beside its pictures' },
};

/** The census's verdict over its sites: rows matched by (file, class, scope), one scope per site. */
export function judge(sites, rows, families = FAMILIES, { stated = false } = {}) {   // stated: the class is the ROW's (a «mv» in a command string), its sync read
  const left = rows.map((r) => { const m = new Map(); for (const sc of r.slice(4)) m.set(sc, (m.get(sc) || 0) + 1); return m; });
  const noRow = [], extra = [], badFamily = [];
  let owed = 0;
  for (const s of sites) {
    const cands = rows.map((r, i) => i).filter((i) => rows[i][0] === s.file && (stated ? rows[i][1] === 'move' || (rows[i][1] === 'synced') === !!s.synced : rows[i][1] === s.cls) && left[i].has(s.scope));
    if (!cands.length) { noRow.push(s); continue; }
    const i = cands.find((k) => left[k].get(s.scope) > 0);
    if (i === undefined) { extra.push(s); continue; }
    left[i].set(s.scope, left[i].get(s.scope) - 1);
    const fam = families[rows[i][2]];
    const cls = stated ? rows[i][1] : s.cls;
    if (!fam || !fam.classes.includes(cls)) badFamily.push({ ...s, cls, family: rows[i][2] });
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
  ["src/agentd/agentd.js", "synced", "device-door", "its signed bundle landed: the verdict FIRST, then ONE sync of the temp, its name, then `current` — a sync that FAILS refuses the landing (主开发 r4387: a bundle is not a record)", "landBundle"],
  ["src/agentd/agentd.js", "move", "move", "the ssh road's staged bundle moved to its temp (no bytes written in its scope: they are synced in landBundle before any name is taken)", "<module>"],
  ["src/agentd/client.js", "unsynced", "store", "the local device's upgrade proof, written by the HUB's DeviceManager (its cure is the hub's, not a device release)", "DeviceManager._writeLocalProof"],
  ["src/agentd/client.js", "move", "move", "", "DeviceManager.installLocal"],
  ["src/agentd/durable-file.js", "synced", "device-door", "THE device's one door (B-93e7): every RECORD the device agent writes for itself — agentd.js 10 (its dial file twice, dial status, allow list, trust / floor / hub pins, orders, a secret file it is handed, its socket witness), self-retire 1, stream-mac 2: 13 records; and B-574d (r4806) four records of SHARED modules the device bundles — the migrations' ledger, the OpenCode serve's record, the kept default microphone, the apps' index", "writeDurable"],
  ["src/agentd/agentd.js", "unsynced", "derived", "a usage cursor: a CACHE of a source still on disk (主开发 r4671: an old, lost or torn cursor only walks again, and the hub drops every row it holds by its own id — it asks no sync on any road)", "serveConnection > onControl > st.commit"],
  ["src/agentd/reexec.js", "move", "move", "the `current` symlink swapped (metadata, no file bytes)", "repointCurrent", "repointCurrent"],
  ["src/agentd/stream-mac.js", "synced", "derived", "the helper binary built or pushed (made again) — synced before its name (B-93e7: the version file written after it vouches for whole bytes)", "createMacHelper > build", "createMacHelper > ensure"],
  ["src/app-secrets-seal.js", "synced", "self-synced", "", "<module>"],
  ["src/app-serve.js", "unsynced", "derived", "the apps' last scan (state.json) and the desktop's witness list, each made again by the next scan (B-574d: the index, manifest.json, is a record and goes through the device's door)", "writeJsonAtomic"],
  ["src/app-serve.js", "move", "move", "", "create > writeManifest"],
  ["src/app-serve.js", "move", "derived", "a downloaded installer / app image, checked and installed again", "create > fetchInstaller", "create > installAppImage", "create > installAppImage"],
  ["src/app-system-serve.js", "unsynced", "derived", "the shims, synced again at each start", "create > syncShims"],
  ["src/archive-roll.js", "move", "move", "the reading archive's roll (B-360d part 3 U2): the live append-only file renamed to its day's shard — a rotation, a shard never written over", "rollIfOver"],
  ["src/browser-serve.js", "unsynced", "derived", "NOT the person's file (B-ddf3 unit 3, lane bl-vault, r4361): a PLANNED COPY of the person's ~/.agent-browser/config.json (read, never written) with the display plan applied, made again at every start and deleted when nothing changes; the profile's own Preferences is the keeper's, synced (src/server/browser-keeper.js)", "planLaunch"],
  ["src/browser-serve.js", "unsynced", "derived", "the build pointer, written again at each launch", "writeBuildView"],
  ["src/channel-outbox-files.js", "move", "store", "an approved attachment's folder: its files staged moments before in the same request (stage(), no sync), then renamed into place (round wl2wglpsq's must)", "commit"],
  ["src/channel-store.js", "unsynced", "store", "", "writeJsonAtomic", "createChannelStore > rewriteRecords", "createChannelStore > trim", "createChannelStore > prependRecords", "createChannelStore > trimSide", "createChannelStore > avatarPut", "createChannelStore > attachmentPut"],
  ["src/channel-store.js", "move", "move", "the damaged door (B-f276 1b): a family's companion files set aside at «Start it empty», put back if the press cannot finish", "createChannelStore > startDamagedEmpty", "createChannelStore > startDamagedEmpty > back"],
  ["src/channels/webhook.js", "synced", "self-synced", "", "writeJsonAtomic"],
  ["src/channels/webhook.js", "unsynced", "store", "", "queueAppend"],
  ["src/claude-oat-probe.js", "move", "derived", "the probe's own scratch (a symlink, a variant folder)", "measure > repoint", "measure > runVariant", "measure > runVariant"],
  ["src/design-fs.js", "synced", "self-synced", "a design file of the person's (its tweak values): its handle synced before its close and rename, a failed sync a failed write said by name (B-ddf3 unit 3, lane bl-vault, r4361)", "writeUser"],
  ["src/desktop-display.js", "unsynced", "derived", "the X authority file, made at each display start", "writeXauthority"],
  ["src/desktop-serve.js", "unsynced", "device", "the desktop apps' store — a SHARED module the device runs: its site is the device family's (主开发 r5171: row B-93e7, the device's own door)", "writeJsonAtomic"],
  ["src/desktop-serve.js", "unsynced", "derived", "a RemoteApp client's own log rewritten scrubbed at its session's end: a diagnostic, a power cut loses only log lines (B-574d)", "install > scrubRdpLogFile"],
  ["src/desktop-serve.js", "unsynced", "derived", "a seeded profile frame, made again when missing", "install > seedChromiumFrame"],
  ["src/desktop-serve.js", "move", "move", "", "install > stop"],
  ["src/exit-proxy.js", "synced", "self-synced", "", "ExitProxyManager._transferHeld"],
  ["src/fd-close.js", "synced", "self-synced", "the wrappers' records the hub reads (B-bcb8 unit B, 主开发 r4367: the job's pid / exit / bound records, the conversations' meta sidecar, buffer and handed records) and, since B-574d «hub-migrations» (lane nl-migrations), the hub's run-once migrations' stores and archives (src/server/migrations.js replaceSynced, src/server/home-rename.js rewriteStores) and, since «usage-ledger-repairs», the usage ledger's run-once repairs, the hourly sidecar repair's witness and the prices file: a sync that FAILS fails the write (r4474: thrown, the temp removed, the old record stands); only a sync the file system does not do (EINVAL, ENOTSUP, EOPNOTSUPP, ENOSYS) is said and lands; the two buffers ask none on any road (sync: false — r4563 + r4578: a buffer is not a durable record), their write and close judged", "renameSynced"],
  ["src/gmail-sync.js", "unsynced", "store", "", "GmailSync._saveState"],
  ["src/gmail-sync.js", "synced", "self-synced", "the person's local mail copy: the folder's file NAMES are the seen index (a torn copy would never be fetched again) — written, synced and renamed off the loop since B-ddf3 unit 1", "GmailSync._writeMessage"],
  ["src/harness-config.js", "synced", "self-synced", "a CLI's own settings file (the person's): the shipped helper syncs its temp before the rename (or the link), a failed sync fails the write, since B-ddf3 unit 2 line 2", "commitWrite", "commitCreate"],
  ["src/harnesses/claude-home.js", "move", "move", "", "moveUser", "moveUser", "relinkLegacy"],
  ["src/harnesses/codex-models.js", "unsynced", "derived", "a cache of the CLI's model list", "models"],
  ["src/host-keys.js", "unsynced", "store", "", "writePinFile"],
  ["src/hosts.js", "unsynced", "store", "", "HostManager._persistDiscovery"],
  ["src/hosts.js", "move", "move", "", "HostManager.migrateDialTokenFile > later", "HostManager.migrateDialTokenFile", "HostManager._migrateDialTokensAtRead > later"],
  ["src/job-logs-sweep-worker.js", "unsynced", "derived", "B-574d ruling (c) (r4811, lane bl-jobs): the remover CHILD's count of what it removed (B-323e) is a TALLY nobody needs after a power loss — its name over a half record or an empty file reads «unknown» (not a count) at the hub and «not counted — forgotten» at the next start, never «nothing removed» (test-job-logs-remover-start); the run folders it counted are gone either way; no sync asked (as the derived family's diagnostic clause, r4761)", "countWrite"],
  ["src/job-logs-sweep-worker.js", "move", "move", "", "stateOf"],
  ["src/job-logs-sweep.js", "unsynced", "derived", "a batch's request file (B-323e), handed to its child by name at once and swept by the next pass: a torn one is never read again", "createRemover > writeRequest"],
  ["src/jobs.js", "unsynced", "store", "", "writeJsonAtomic", "JobManager._rewriteSpills"],
  ["src/jobs.js", "move", "move", "", "JobManager._unreadPrefetch", "JobManager._noteDone", "JobManager._logsHeldFile"],
  ["src/machine-mounts.js", "unsynced", "store", "", "MachineMounts._migrateLegacy", "MachineMounts._save"],
  ["src/machine-mounts.js", "move", "move", "", "MachineMounts._migrateLegacy", "MachineMounts._migrateLegacy"],
  ["src/mounts.js", "unsynced", "store", "", "MountManager._save"],
  ["src/mounts.js", "move", "move", "", "MountManager._openMountLog"],
  ["src/node-runtime.js", "unsynced", "derived", "a downloaded Node runtime (checked by its digest), fetched again", "fetchFile", "flip", "flip"],
  ["src/node-runtime.js", "move", "derived", "a downloaded Node runtime (checked by its digest), fetched again", "provision", "provision"],
  ["src/plugins.js", "unsynced", "store", "", "PluginManager._save"],
  ["src/pool-pin-record.js", "move", "move", "the person's pool pin record (B-526c unit 2): a symlink whose target text is the pin, renamed over its name — a symlink swap, no file bytes written", "write"],
  ["src/port-forward.js", "unsynced", "store", "", "writeJsonAtomic"],
  ["src/routes/files.js", "move", "move", "", "crossHostTransfer"],
  ["src/routes/files.js", "synced", "self-synced", "a file copied from another machine into the person's folder: its partial synced once at its end through the thread pool before the rename, a failed sync a failed copy said by name (B-ddf3 unit 3, lane bl-vault, r4361)", "crossHostTransfer"],
  ["src/routes/persistence.js", "synced", "synced-in-place", "the layouts' owed mark (data/layouts.owed.json, B-225b: an episode's mark) — its temp synced before the rename on its own chain, off the loop, since B-574d (主开发 r4761); the layouts and settings themselves are the store writer's since B-0248 step 2", "setup > writeMark"],
  ["src/safe-fs-worker.js", "move", "move", "", "rename", "move"],
  ["src/safe-fs-worker.js", "synced", "self-synced", "the person's file copied or moved across devices (its .part): every file of it synced once at the end of the copy on the pool's thread before the rename, a failed sync a failed copy said by name — ONE staged road for copy() and move()'s cross-device fallback (B-ddf3 unit 3, lane bl-vault, r4361)", "stageCopy"],
  ["src/secret-file.js", "synced", "secret", "the secret-bearing replace (synced since the hotfix 2.369.415): the sync one, and its async twin the interface's sign-in table writes through (the separation's B3b-1, line 306: the temp synced, then renamed, its folder synced)", "replaceShredding", "replaceShreddingAsync"],
  ["src/server/agent-listener.js", "unsynced", "store", "", "keepPort"],
  ["src/server/agent-tool-generators.js", "unsynced", "derived", "an agent tool copied from the checkout at every start", "create > createBrowserVerbsCopy", "create > createBrowserStuckCopy", "create > createBrowserPasskeyCopy", "create > createBrowserReadBackCopy", "create > createCliTextCopy", "create > createCliCallCopy", "create > createFdCloseCopy", "create > createLocalIndexCopy"],
  ["src/server/apps-engine.js", "unsynced", "store", "", "writeJsonAtomic"],
  ["src/server/auto-cli-loop.js", "unsynced", "store", "", "saveState"],
  ["src/server/auto-resume.js", "unsynced", "store", "", "writeJsonAtomic"],
  ["src/server/automation-engine.js", "synced", "self-synced-best-effort", "", "writeJsonAtomic"],
  ["src/server/boot-restore.js", "move", "move", "", "create > retireDeadSocket"],
  ["src/server/boot-trace.js", "unsynced", "derived", "the boot's own trace (data/boot-trace.json): a DIAGNOSTIC nobody reads back — GET /api/boot-trace and Diagnostics answer from memory, no hub code reads the file, the next boot writes it again whole (B-574d, 主开发 r4761: no sync on any road; ④ shows its reader)", "start > close"],
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
  ["src/server/browser-trace.js", "unsynced", "store", "", "writeJsonAtomic", "create > rewriteIndexAsync"],   // row B-360d (r4522): the sweep's index rewrite, async now (a temp file, then the rename) — still unsynced, the same family
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
  ["src/server/design-engine.js", "unsynced", "store", "", "writeJsonAtomic"],
  ["src/server/desktop-app-keeper.js", "move", "move", "", "create > asideRemote"],
  ["src/server/doc-engine.js", "unsynced", "store", "", "ownerMemo > save"],
  ["src/server/dropline-oauth.js", "unsynced", "not-production", "tokenFile: the voice suites' tokens stand-in; the hub keeps the pair through src/server/sealed-json.js (the secret family's synced replace)", "tokenFile > write"],
  ["src/server/engine-distribution.js", "move", "derived", "an engine build's folders swapped (downloaded and unpacked again)", "create > rename", "create > landDir", "create > landDir", "create > landDir", "create > landDir", "create > stageNext", "create > stageNext", "create > stageNext > back", "create > healAside", "create > putBack"],
  ["src/server/engine-distribution.js", "unsynced", "store", "", "create > save"],
  ["src/server/feedback-forward.js", "unsynced", "store", "", "writeJsonAtomic"],
  ["src/server/feedback-store.js", "unsynced", "store", "", "writeJsonAtomic"],
  ["src/server/grants-migration.js", "unsynced", "not-production", "the hosts.json reshape with no live HostManager handed (a suite); the hub hands one: hosts.reshapeStore, on the store writer", "migrate"],
  ["src/server/grants-store.js", "unsynced", "ruled-sync", "a grant's land: all or nothing, on disk before the person's reply (主开发 r3455)", "writeJsonAtomic"],
  ["src/server/grants-store.js", "move", "move", "", "create > audit"],
  ["src/server/home-rename.js", "synced", "self-synced", "B-574d (lane nl-migrations): the HOME move's tries beside its marker, and (follow 3, 主开发 r5068) the HOME marker itself — the temp written, synced (a sync or close that fails fails the write; a file system with no sync is said), then renamed, off the boot's synchronous road; the recorded-path rewrite goes through src/fd-close.js renameSynced (no rename here)", "replaceSyncedAsync"],
  ["src/server/host-tokens.js", "unsynced", "store", "", "create > writeIdentity"],
  ["src/server/instance-url.js", "unsynced", "store", "", "writeJsonAtomic"],
  ["src/server/integration-store.js", "move", "move", "", "create > load"],
  ["src/server/job-secrets-door.js", "move", "move", "", "create > setAside"],
  ["src/server/local-index.js", "unsynced", "derived", "the person CLI's index and copy, written again from the hub's state", "write", "write", "stop", "installPersonCli"],
  ["src/server/migrations.js", "move", "move", "", "create > run"],
  ["src/server/plugin-install.js", "move", "move", "", "moveDir"],
  ["src/server/plugin-loader.js", "unsynced", "store", "", "writeJsonAtomic"],
  ["src/server/published-pages.js", "unsynced", "store", "", "writeJsonAtomic"],
  ["src/server/published-pages.js", "synced", "self-synced", "a page's published content: written, synced and renamed through the thread pool (never the hub's loop), a failed sync a failed publish said by name (B-ddf3 unit 3, lane bl-vault, r4361)", "create > publishContentNow"],
  ["src/server/published-pages.js", "synced", "self-synced", "a page's content ADOPTED by the row of its source that appeared while it was written (the person's own Publish): the file just written and SYNCED renamed onto that row's file — one source, one page (line 1044's cure, lane bl-vault, r4634)", "create > publishContentNow"],
  ["src/server/queued-wakes.js", "move", "move", "", "create"],
  ["src/server/rewind-keep-worker.js", "synced", "self-synced", "the kept copy (row B-437e): its press's manifest, a person's file put back from its kept copy, and the conversation's kept lines (U3) — the temp synced before the rename; a sync that fails fails the act", "seal", "putOne", "writeLines"],
  ["src/signin-witness-worker.js", "synced", "self-synced", "B-dc3f (1) H1 (主开发 r3030 (a)): the network home's sign-in witness copy — a temp opened wx 0600, written, SYNCED, renamed over the copy; a sync that fails fails the write (the temp removed, the failure said once by the hub)", "netWrite"],
  ["src/server/session-stdout.js", "unsynced", "store", "", "create > writeSessionMeta"],   // B-574d (lane bl-jobs): − finishTeardown's exit tomb (the store writer's: keepTomb)
  ["src/server/spend-guard.js", "unsynced", "spend", "data/spend-budget.json", "writeJsonAtomic"],
  ["src/server/spend-guard.js", "unsynced", "aside", "a stale lock set aside", "create > takeLock"],
  ["src/server/stash-handover.js", "unsynced", "store", "", "create > persistDelivered"],
  ["src/server/sync-fs-witness-worker.js", "unsynced", "derived", "a CPU capture (data/cpu-profiles/*.cpuprofile, the newest kept): a DIAGNOSTIC — the hub lists the folder by NAME only and hands a file's bytes to the owner's download as they are; a torn one is never parsed and nothing is held as damaged (B-574d, 主开发 r4761: no sync on any road; ④ shows its reader)", "finishCapture"],
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
  ["src/server/writes-lost.js", "synced", "synced-in-place", "the lost writes' record (data/writes-lost.json): its own write OFF the loop since B-574d (主开发 r4761) — its temp synced before the rename on the promises road; only the exit's write is synchronous, through the door (src/fd-close.js renameSynced), once a process", "writeAtomicAsync"],
  ["src/server/writes-lost.js", "move", "move", "", "create > load"],
  ["src/slot-transitions.js", "unsynced", "store", "", "SlotTransitions._maybeTrim"],
  ["src/store-hold.js", "synced", "self-synced", "THE DIRECT WRITE DOOR of every store a hold keeps (主开发 r5179 / r5185): its temp SYNCED before the rename, a sync that fails a failed write (the hub's one set of «no sync on this file system» codes said once) — a store's first exclusive create, the ladder's retry, a start read's own rewrite and the settings store's every save; THE ONE ROAD LEFT UNSYNCED, by the coordinator's ruling r5185: a MACHINE caller's config call (a bearer on the plugins' old config door: src/routes/persistence.js asMachineCall) keeps the release's unsynced write — the rate rule: a sync on the loop is for a person's press, the start or a save the code bounds rare, and nothing bounds how often a machine calls that door", "create > write", "create > write"],
  ["src/store-hold.js", "move", "move", "a DAMAGED copy set aside under its dated name, its bytes untouched: setAside, and its off-the-loop twin setAsideAsync (line 349, B-f276 1c — r1143 (3): the rename through fs.promises, a person's press)", "create > setAside", "create > setAsideAsync"],
  ["src/store-writer-worker.js", "move", "move", "a ring's rotation (the live log to .1; each append was synced)", "writeJob"],
  ["src/store-writer-worker.js", "synced", "writer", "the store writer's thread: every store the writer holds (a whole write in pieces too: pieceJob)", "writeJob", "pieceJob"],
  ["src/store-writer-worker.js", "synced", "writer", "the store writer's thread: the REWRITE of an append store from its own bytes (row B-360d — the OTel stash's trim), synced, then renamed over the file", "rewriteJob"],
  ["src/task-groups.js", "move", "move", "", "TaskGroupManager._mirrorIo > rename"],
  ["src/task-groups.js", "unsynced", "derived", "a Task Group's mirror file, written again from the group's state", "TaskGroupManager._runMirror"],
  ["src/task-groups.js", "unsynced", "store", "", "TaskGroupManager._archiveClear", "TaskGroupManager._importArchive"],
  ["src/task-groups.js", "synced", "self-synced", "an export the person asked for: written, synced and renamed through the thread pool (never the hub's loop), a failed sync a failed export said by name (B-ddf3 unit 3, lane bl-vault, r4361)", "TaskGroupManager.exportToFile"],
  ["src/transcript-service.js", "synced", "self-synced", "a conversation transcript rescued in place: it and its backup synced before the swap since B-ddf3 unit 1", "createTranscriptService > rescue"],
  ["src/usage-cache-write.js", "unsynced", "store", "", "atomicWrite", "setAsideReading"],   // r3200: + the person's set-aside puts a file that STARTED AGAIN in place (its own temp, as the writer's)
  ["src/usage-cache-write.js", "move", "aside", "r3200: the person's set-aside of an account's reading file that cannot be read — the old file renamed beside itself, and put back if the new one cannot be put in place", "setAsideReading", "setAsideReading"],
  ["src/usage-hold-road.js", "move", "move", "", "UsageHoldRoad._setAsideFile"],
  ["src/usage-hold-road.js", "unsynced", "store", "", "UsageHoldRoad._setAsideLive", "UsageHoldRoad._dropCompact"],
  ["src/usage-ledger-dedup.js", "move", "move", "", "appendFile"],
  ["src/usage-ledger-dedup.js", "synced", "self-synced", "", "dedupSteps"],
  ["src/user-todos.js", "move", "move", "", "UserTodoManager._setAside", "UserTodoManager._setAsideOff"],
  ["src/vnc.js", "unsynced", "store", "", "VncManager._record"],
  ["src/webdav.js", "unsynced", "store", "", "MountTokens._save"],
  ["src/webdav.js", "synced", "self-synced", "a DAV upload (PUT): its temp synced once at its end through the thread pool before the rename, a failed sync a 500 whose body names it — its landing its own function, so the MOVE verb's rename stays a move (B-ddf3 unit 3, lane bl-vault, r4361)", "landUpload"],
  ["src/webdav.js", "move", "move", "", "registerWebdav > route:USE /dav"]
];
const OWED_MAX = 64;   // B-574d slice «journals-and-diagnostics» (lane nl-journals, 主开发 r4749 / r4761): 132 → 126 in all — 132 → 131 — the extraction journal's mark (src/routes/files.js writeExtractJournal) goes through src/fd-close.js renameSynced (synced before the rename; its row gone); 131 → 130 — the CSP re-judge's rewrite (src/server/csp-reports.js create > rejudge) the same way; 130 → 129 — the lost writes' record (src/server/writes-lost.js writeAtomic) the same way; 129 → 128 — the layouts' owed mark synced in place («synced-in-place»); 128 → 126 — the boot trace and a CPU capture judged «derived» (diagnostics nobody reads back, ④).  B-574d slice «usage-ledger-repairs» (lane nl-migrations, 主开发 r4881): 114 → 108 — the six helpers of the usage ledger's run-once repairs and the prices file go through src/fd-close.js renameSynced (codex-fork-ledger-purge, fixture-ledger-purge, ledger-slot-backfill, usage-origin-backfill, reading-repair, UsageHistory._writeAtomic).  B-574d slice «hub-migrations» (lane nl-migrations, 主开发 r4750): 132 → 114 — the 16 migration writes of src/server/migrations.js and the recorded-path rewrite of src/server/home-rename.js go through src/fd-close.js renameSynced (synced, synchronous as before), the HOME tries through its own synced replace (row self-synced).  B-574d (lane lg-remote-hardening, 主开发 r4760): 132 → 130 — device-upgrades.json and dial-health.json are the store writer's (synced on its thread; their two unsynced rows gone).  r5185 (lane hub-loop-stalls, row B-574d): 132 → 130 — the store hold's direct write door is synced (its two sites to self-synced; a machine caller's config call stays unsynced by ruling, named in the row).  B-0248's remainder (lane hub-loop-stalls, 主开发 r5171 / r5179; the row closed at the 2.369.420 push): 132 → 132 — the store hold's two sites to the store family (owed, row B-574d: the settings store's ordinary road, named in its row), the desktop serve module's site to the device family (owed, row B-93e7); the b0248 family gone; no site leaves the owed families.  B-ddf3 unit 3 (lane bl-vault, r4361; formed again on the release 2.369.420 by r5147): 132 → 124 (141 → 133 on its base) — the last eight «person» sites (the family is gone: row B-ddf3's census sites all cured) — seven synced (a copy across machines, a copy or move across devices, a DAV upload, a design file, an export, a published page) and the browser serve's planned copy read «derived».  B-0248 unit 2 (lane bl-loop-b, 主开发 r4232; formed again on 7f83d9203 by r4472): 133 → 132 — browser-kept.json is the store writer's (synced on its thread; its unsynced row gone).  lane lg-recovery (主开发 r3321): 141 → 140 — the synced stores' flush (src/sync-store.js SyncStore.flush, an unsynced temp + rename) goes through the store writer (synced, off the loop): its row dropped. lane lg-store-writes (B-574d unit 1 (a), 主开发 r3455 / r3486): 141 → 136 on the train (146 → 141 at its base) — accounts.json onto the store writer (its row gone), the grants store and the use marks named «ruled-sync» (r3455), the voice suites' token helper and the grants migration's no-manager road named «not-production» (4 rows restated). Before: B-0248 unit 5 (lane bl-loop-b, 主开发 r4147): 141 → 139 — login-expiry.json and sysinfo-history.json are the store writer's (synced on its thread; their unsynced rows gone).  B-574d slice «device-bundle-inputs» (lane bl-machines-b, r4806): 125 → 120 — the migrations' ledger, the OpenCode serve's record and the kept default microphone through the device's one door (three rows gone); the apps' writeJsonAtomic (now only its last scan and witness list: the index goes through the door) and the RemoteApp log's scrub moved to «derived».  B-93e7 (lane bl-machines-b, r4381): 141 → 125 — the device agent's 16 own writes through its one door (src/agentd/durable-file.js) and its bundle's landing, each synced (the family «device» gone).  B-574d slice «session-and-job-records» (lane bl-jobs, r4811): 141 → 136 — the exit tomb, the conversation index and boot-restore's kept copies (a dead socket's stopped copy, an end's record) are the store writer's; the sweep's count asks no sync (ruling (c): the derived family) (paced, synced on its thread; its own unsynced flush gone).  B-0248 unit 3 (lane bl-loop-b, r3320 / r3651): 143 → 142 — desktop-apps-hosts.json is the store writer's (synced on its thread; the keeper's unsynced row gone).  B-ddf3 unit 2 line 2 (lane bl-scratch): 145 → 143 — a CLI's own settings file synced before its rename / link (the shipped helper's commitWrite, commitCreate). Before: lane lg-vault-env (r3002 (d)): the grant ends' set-aside rename is gone into the store-read hold (its row dropped) — a «move» row, not an owed family: the owed count is not moved by it. B-0248 (lane bl-loop-b, r3320): 146 → 145 — the For-you list's write is the store writer's (synced).  lane bl-windows (r3154 (4)): 146 → 145 — the reset-credit attempts' save syncs its copy before the rename (self-synced). r3200 (lane login-request-card): 146 → 147 — the reading file's set-aside puts its new file in place by its own temp + rename (the writer's own family, B-574d). B-0248's next part (lane lg-vault-env, r2417): 146 → 145 — the decision journal's trim through the store writer (its temp + rename on the loop gone). Before: B-360d part 3 U2 (lane lg-group-parents): 147 → 146 — data/usage-cache.json through the store writer (writeUsageCache's own temp + rename gone). Before: the live-tip census cure (lane lg-store-writes, r1790): 147 stays, each step by name — −1 the layouts and settings (src/routes/persistence.js writeJsonAtomic: the store writer's since B-0248 step 2), +1 the layouts' owed mark (setup > writeMark: new, unsynced, B-574d owes it); the remover's count is the old site renamed (orphaned → countWrite). Before: row B-360d (lane hub-loop-stalls, its move onto the .416 root): 148 → 147 — the OTel stash's trim rename (otel-ingest's replayEnd) is the store writer's REWRITE job now (src/store-writer-worker.js rewriteJob: fsync'd, renamed on the writer's thread). B-ddf3 unit 1 (lane bl-scratch): 150 → 148 — the Gmail copy and the rescued transcript synced. The sites of the OWED families (store B-574d, device B-93e7, person B-ddf3, b0248 B-0248, spend B-ef83): may only fall: an EQUALITY with the census — a cure lowers it in its own commit; a rise above OWED_BASELINE is red unless RISES names it
// THE RATCHET (round wl2wglpsq): OWED_MAX is an EQUALITY with the census (a cure lowers it in the cure's own commit). A commit
// could raise it and stay green here, so a rise above the KEPT baseline is red by name unless RISES names it with its row
const OWED_BASELINE = 150;   // kept at the census's acceptance (round wl2wglpsq's cure: 148 + the Gmail copy + the outbox folder)
const RISES = [];            // [n, row, why] — a named rise of the owed count (none)

// ── THE TWO REGIONS, JUDGED (row B-bcb8's first unit, lane bl-scratch, 主开发 r5170; counted by file since round wl2wglpsq) ──────
// (1) data/bin — every member rename on a file-system object of its tracked JavaScript tools (a bare call or an unknown object:
// red by name): [file, class READ, family, note, ...one scope per site], judged as src/'s rows are
const BIN_ROWS = [
  ["data/bin/acp-wrapper.js", "synced", "self-synced", "the helper's one-line fallback (the same bytes as src/fd-close.js renameSynced, one spelling: test-fd-close-census ⑥), taken only when the helper cannot be loaded: synced, a failed sync a failed write", "<module>"],
  ["data/bin/acp-wrapper.js", "move", "move", "the wrapper's log, rotated at 5 MB (appended, never written whole)", "log"],
  ["data/bin/agy-wrapper.js", "synced", "self-synced", "the helper's one-line fallback (the same bytes as src/fd-close.js renameSynced, one spelling: test-fd-close-census ⑥), taken only when the helper cannot be loaded: synced, a failed sync a failed write", "<module>"],
  ["data/bin/agy-wrapper.js", "synced", "self-synced", "the account's settings.json with an allow rule added (B-bcb8 unit A): synced, a failed sync a failed write, the file as it was", "addAllowRule"],
  ["data/bin/agy-wrapper.js", "move", "move", "the wrapper's log, rotated at 5 MB (appended, never written whole)", "log"],
  ["data/bin/agy-wrapper.js", "unsynced", "region", "UNIT C: the mode the person chose for the conversation (an empty one starts it again in the default mode), and the link beside its pictures that says whose they are", "recordConversationMode", "savePicture"],
  ["data/bin/chat-wrapper.js", "synced", "self-synced", "the helper's one-line fallback (the same bytes as src/fd-close.js renameSynced, one spelling: test-fd-close-census ⑥), taken only when the helper cannot be loaded: synced, a failed sync a failed write", "<module>"],
  ["data/bin/chat-wrapper.js", "move", "move", "the wrapper's log, rotated at 5 MB (appended, never written whole)", "log"],
  ["data/bin/codex-chat-wrapper.js", "synced", "self-synced", "the helper's one-line fallback (the same bytes as src/fd-close.js renameSynced, one spelling: test-fd-close-census ⑥), taken only when the helper cannot be loaded: synced, a failed sync a failed write", "<module>"],
  ["data/bin/codex-chat-wrapper.js", "move", "move", "the wrapper's log, rotated at 5 MB (appended, never written whole)", "log"],
  ["data/bin/job-wrapper.js", "synced", "self-synced", "the helper's one-line fallback (the same bytes as src/fd-close.js renameSynced, one spelling: test-fd-close-census ⑥), taken only when the helper cannot be loaded: synced, a failed sync a failed write", "<module>"],
  ["data/bin/job-wrapper.js", "move", "move", "the job's log, rotated at its cap (one generation kept, its descriptor closed first)", "writeLog"],
  ["data/bin/job-wrapper.js", "unsynced", "sample", "pressure.json: the job's memory pressure, written again every sample while it is over half its bound", "startSampler"],
  ["data/bin/pty-wrapper.js", "move", "move", "the wrapper's log, rotated at 5 MB (appended, never written whole)", "log"],
  ["data/bin/vibespace-browser", "unsynced", "derived", "the sanctioned browser configuration, named by the digest of its bytes, written again whenever the file under that name differs", "composeConfig"],
  ["data/bin/vibespace-channels", "unsynced", "region", "an attachment fetched (its declared size checked) into the attachment cache, or with --out to a path the agent names: that one is the person's file, empty after a power loss", "<module>"],
  ["data/bin/vibespace-claude-subscription-login.mjs", "synced", "self-synced", "the isolated OAuth credential file of a subscription login: synced, a failed write said by name (credential-write), its temp removed", "atomicWritePrivate"],
  ["data/bin/vibespace-design", "unsynced", "region", "a file of the person's design folder the design tool writes (design.json, a page): empty after a power loss", "writeInside"],
  ["data/bin/vibespace-hook-register.mjs", "synced", "self-synced", "a CLI's own settings file with VibeSpace's hooks (B-ddf3): synced, a failed sync a failed write said by name", "commitWrite", "commitCreate"],
  ["data/bin/vibespace-opencode-op", "unsynced", "region", "the record of the OpenCode serve on a machine (~/.vibespace/opencode-serve.json): an empty one refuses the next start or stop, its words naming the way out (r3675)", "writeRecord"],
  ["data/bin/vibespace-usage", "unsynced", "store", "the account's usage reading (data/usage-cache/<key>.json, its windows with what it carries forward: other producers' limits, spend, the tombstones): the same file src/usage-cache-write.js writes, rowed «store» — a torn one is held unread by the hub, the account's automatic turns wait and the person is told; one cure with its twin (on a paired machine the same tool writes that machine's own cache)", "writeUsage"],
  ["data/bin/vibespace-usage", "unsynced", "region", "the statusline's slot state, the lag-shadow guard's memory of the account a conversation's slot pointed at: a torn one skips the guard once, and a reading of the slot before can be filed on the account it points at now", "writeSlotState"],
  ["data/bin/vibespace-usage", "unsynced", "derived", "the model ids the statusline has seen (at most 50, for the model menu): a torn list starts again, each id learned again when it is used", "learnModel"],
  ["data/bin/vibespace-usage-scan", "unsynced", "derived", "the usage scan's cursor on a machine, written after its events are flushed: a torn one reads as none, and the next harvest sends from the start again, which the hub's dedup by event id absorbs", "<module>"],
];
// (2) shell — every `mv` a src/ file hands a child: [file, class, family, note, ...one «scope | its words» per site] (its words:
// the command from the `mv` on — a template's ${…} as written, a program's argv by its source — white space folded, its first
// MV_WORDS characters). ITS SYNC IS READ BY TEXT POSITION, as src/'s classifier reads a sync call: a `sync` command word anywhere
// BEFORE it in its command — its own string, the pieces before it in a + chain, the ONE step before it in an array of steps (a
// module const by its text), the command a template named by a const is interpolated into — reads «synced». A «synced» row takes
// only a synced site, an «unsynced» row only an unsynced one, a «move» row either (no bytes are written before a move). So a sync
// put in front of an unchanged `mv` — one sync for several too — is red on ITS row, and so is a sync taken away. ITS LIMITS, said:
// the word is not tied to the file (a sync of another file, or the word in an echo, reads too); a sync in a helper the command
// calls, or two steps before it in an array, is not seen; a sync put in front of the first of several unsynced `mv` reads for the
// later ones too — red on their rows, never silent: their curing unit judges them
const SHELL_ROWS = [
  ["src/app-manifest.js", "unsynced", "region", "the app system's own records, written by root with no sync — the package list at a run's end (empty, the Desktop apps dialog names every package as installed outside VibeSpace), the base's dpkg status, an app's entries (.list, .desktop, .pin: what it brought) — and a .deb apt fetched in the same command renamed to its canonical name (torn, its stanza takes the torn bytes' digest and the local repository serves a broken package)", "<module> | mv -f \"$V/last-dpkg.list.tmp\" \"${LAST_LI", "<module> | mv -f \"$R/base/status.tmp\" \"$R/base/stat", "<module> | mv -f \"$R/entries/$ID.list.tmp\" \"$R/entr", "<module> | mv -f \"$R/entries/$ID.desktop.tmp\" \"$R/e", "<module> | mv -f \"$R/entries/$ID.pin.tmp\" \"$R/entri", "<module> | mv -f \"$f\" \"$D/$n\"; f=$D/$n; fi"],
  ["src/app-manifest.js", "unsynced", "derived", "the local repository's index: a .deb's stanza (made again when it is empty or older than its .deb) and Packages (made again at every index)", "<module> | mv -f \"$s.tmp\" \"$s\"", "<module> | mv -f \"$D/Packages.tmp\" \"$D/Packages\""],
  ["src/app-system.js", "unsynced", "region", "a new root filesystem moved into place (create's rootfs.new, unpacked by tar or debootstrap; a rebase's rootfs.next with the apps installed again): its sources and its identity file are synced (put()), its tree is not — sysok reads only the identity, so a torn system is used as it is until the person's rebase or rollback", "<module> | mv \"$S/rootfs.new\" \"$R\"", "<module> | mv \"$NX\" \"$R\"; say rebased \"$bad\"; say o"],
  ["src/app-system.js", "synced", "self-synced", "put(), the helper and the sudoers file: each installed beside its name, synced (sync --), then moved; a failed sync refuses and removes the temp", "<module> | mv -fT \"./.$3.vs\" \"./$3\" ) || { r=$?; [ ", "<module> | mv -f \"$H.new\" \"$H\" || { rm -f \"$H.new\";", "<module> | mv -f \"$SD.new\" \"$SD\" || { rm -f \"$SD.ne"],
  ["src/app-system.js", "move", "move", "a whole app system swapped as a folder (a rebase's old one set aside, the rollback's three moves), and the rollback's words shown to the person", "<module> | mv \"$R\" \"$P\"; mv \"$NX\" \"$R\"; say rebased", "<module> | mv \"$R\" \"$S/rootfs.swap\"; fi", "<module> | mv \"$P\" \"$R\"; if [ -e \"$S/rootfs.swap\" ]", "<module> | mv \"$S/rootfs.swap\" \"$P\"; fi", "sysCommands | mv ~/.vibespace/sysroot/rootfs ~/.vibesp"],
  ["src/desktop-apps.js", "synced", "self-synced", "the xpra repository key: fetched, checked against its pin, synced by the step before it (XPRA_KEY_SYNC, B-bcb8 unit A), then moved; a failed sync exits 3 and nothing changes", "xpraRepoSteps | mv -f /usr/share/keyrings/xpra.asc.new /"],
  ["src/hosts.js", "unsynced", "region", "the device agent's install over ssh, the hub's own script: its token and its agentd.js unpacked by tar and moved into place with no sync — a torn one can leave the machine unable to dial (its cure is in this text, not a device release)", "installAgentdScript | mv -f \"$S/token\" \"$D/state/token\" && chm", "installAgentdScript | mv -f \"$S/agentd.js\" \"$D/$V/agentd.js\" &", "installAgentdScript | mv -f \"$S/agentd.js\" \"$D/$V/agentd.js\" &"],
  ["src/hosts.js", "move", "move", "a subscription's folder renamed on a machine (its files written before)", "HostManager.renameHostSubDir | mv \"$HOME/.vibespace/subs/${fromAcct}\" \""],
  ["src/install-slot.js", "unsynced", "region", "the install runner's exit and pid records, read by its next start, by desktop-display's installState (an empty one reads as none) and by a follow WITHOUT the lock: an empty exit record makes the follow answer 2 (exit \"\"), an install reported failed instead of unrecorded", "<module> | mv -f \"$X.tmp\" \"$X\"; [ -z \"$w\" ] || rm -", "<module> | mv -f \"$P.tmp\" \"$P\"; w=1"],
  ["src/mounts.js", "unsynced", "region", "the rclone binary copied to a local cache under a NEW name and used whenever that name exists: a torn copy is never made again (the prune runs only after a new copy lands), and every mount of the person's fails until the file is removed or rclone changes", "MountManager._fastBin | mv \"${tmp}\" \"${cached}\""],
  ["src/mounts.js", "move", "move", "a mount point's folder moved aside (by mv, then by sudo mv)", "MountManager._ensureMountpointDir | mv mp dest", "MountManager._ensureMountpointDir | mv mp dest"],
  ["src/remote-fs.js", "move", "move", "a person's file renamed or moved on another machine (mv -n: no bytes written)", "RemoteFs.rename | mv -n ${shqp(from)} ${shqp(to)}", "RemoteFs.move | mv -n ${shqp(from)} ${shqp(to)}"],
  ["src/routes/files.js", "unsynced", "region", "UNIT C (it meets lane bl-vault's unit 3): a person's file copied to another machine, unpacked by tar or written by cat, then moved into place with no sync on that machine", "crossHostTransfer | mv ${shq(destParent + '/' + base)} ${shq", "crossHostTransfer | mv ${shq(stage + '/' + base)} ${shq(dest", "crossHostTransfer | mv -f ${shq(part)} ${shq(destPath)}; } |"],
  ["src/server/design-engine.js", "unsynced", "region", "UNIT C: a person's design file written on another machine (base64 into a temp, then mv), no sync there", "remoteUserWriteScript | mv -f -- \"$t\" ${M.USER_FILE}; then print"],
  ["src/spawn/ssh.js", "unsynced", "derived", "the editor's command-line tool moved out of the tool bundle just unpacked (the bundle is shipped again at every remote start)", "sshLadder > remoteAgentSetup | mv -f \"$HOME/.vibespace/bin/code\" \"$HOME"],
];
// THE REGIONS' OWED SITES: an EQUALITY like OWED_MAX and kept beside it (a src/ cure lowers OWED_MAX, a region's cure this one);
// a rise above the kept baseline is red by name unless REGION_RISES names it with its row
const REGION_OWED_MAX = 25;
const REGION_OWED_BASELINE = 25;   // kept at the regions' judging (B-bcb8's first unit)
const REGION_RISES = [];           // [n, row, why] — a named rise of the regions' owed count (none)

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
ok([...ROWS, ...BIN_ROWS, ...SHELL_ROWS].every((r) => !!FAMILIES[r[2]]) && Object.values(FAMILIES).every((f) => ['through the writer', 'named', 'cured', 'owed'].includes(f.verdict) && ((f.verdict !== 'owed' && f.verdict !== 'cured') || /^B-[0-9a-f]{4}$/.test(f.row))), 'every row names a family, and every family goes through the writer, is named, or is a cure (owed or done elsewhere) WITH its row');
ok(J.owed === OWED_MAX, `OWED_MAX: ${J.owed} sites of the owed families (stated ${OWED_MAX}) — ${J.owed < OWED_MAX ? `LOWER OWED_MAX to ${J.owed} (a cure: the ratchet falls)` : J.owed > OWED_MAX ? 'a NEW owed site: the ratchet only falls (cure it, or name its family with its reason)' : 'held'}`);
ok(Object.keys(FAMILIES).every((k) => [...ROWS, ...BIN_ROWS, ...SHELL_ROWS].some((r) => r[2] === k)), `every family has its rows (${Object.keys(FAMILIES).filter((k) => ![...ROWS, ...BIN_ROWS, ...SHELL_ROWS].some((r) => r[2] === k)).join(', ') || 'none empty'})`);
// THE CLASS's TWO DOORS (主开发 r4387): a door is a family that holds a writer for OTHERS (the `door` field names its file). The
// device's (src/agentd/durable-file.js, a device input) and the hub's wrappers' (src/fd-close.js, row B-bcb8 — its family joins
// here when it lands) stay TWO: one shared file would make every wrapper change a device release. A third door is red, and a
// door's rows sit only in its own file or at a landing it names
const DOOR_FILES = Object.freeze(['src/agentd/durable-file.js', 'src/fd-close.js']);
function doorsVerdict(families, rows) {
  const doors = Object.entries(families).filter(([, f]) => f.door);
  const bad = doors.filter(([, f]) => !DOOR_FILES.includes(f.door));
  const strays = rows.filter((r) => families[r[2]] && families[r[2]].door && r[0] !== families[r[2]].door && !(r[0] === 'src/agentd/agentd.js' && r[4] === 'landBundle'));
  return { ok: doors.length >= 1 && doors.length <= 2 && bad.length === 0 && strays.length === 0, doors: doors.map(([k, f]) => `${k}: ${f.door}`), bad: bad.map(([k]) => k), strays };
}
{
  const v = doorsVerdict(FAMILIES, ROWS);
  ok(v.ok, `the class has at most TWO doors, each in its own file (${v.doors.join(' · ')}) — a third door, or a door's row outside its file, is red`, v);
  const third = doorsVerdict({ ...FAMILIES, 'third-door': { verdict: 'named', classes: ['synced'], door: 'src/agentd/another-door.js', why: 'a planted third door' } }, [...ROWS, ['src/agentd/another-door.js', 'synced', 'third-door', '', 'write']]);
  const stray = doorsVerdict(FAMILIES, [...ROWS, ['src/agentd/agentd.js', 'synced', 'device-door', '', 'someOtherWriter']]);
  ok(!third.ok && !stray.ok, 'RED CONTROLS (planted): a THIRD door is red; a row of the device\'s door outside its file (but the landing) is red', { third: third.bad, stray: stray.strays.length });
}
// THE TWO DOORS BY MODULE (主开发 r4814 (1) / r4834 M1, B-574d): a module the device agent BUNDLES takes the device's door wherever it
// runs (the hub runs some of them too); a module only the hub loads takes the hub's (src/fd-close.js); src/fd-close.js is never an
// input of the bundle. The device door's takers are NAMED here (a new one is red until named); the hub door's takers are judged by
// module (each named in the leg: hub slices add them). The bundle's inputs are esbuild's own (build:agentd's flags, nothing
// written); a SECOND build with the hub's helper planted into a bundled module shows the leg can see it carried.
const DEVICE_DOOR = 'src/agentd/durable-file.js', HUB_DOOR = 'src/fd-close.js';
const DEVICE_DOOR_TAKERS = Object.freeze(['src/agentd/agentd.js', 'src/agentd/self-retire.js', 'src/agentd/stream-mac.js', 'src/app-serve.js', 'src/desktop-mic.js', 'src/migration-runner.js', 'src/opencode-serve.js']);
async function bundleInputs(plant = null) {
  const script = (JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')).scripts || {})['build:agentd'] || '';
  const m = /esbuild src\/agentd\/agentd\.js ([^&]*?)--outfile=/.exec(script), flags = m ? m[1] : '';
  const plugins = plant ? [{ name: 'plant', setup(b) { b.onLoad({ filter: plant.filter }, (args) => ({ contents: fs.readFileSync(args.path, 'utf8') + plant.add, loader: 'js' })); } }] : [];
  const r = await require('esbuild').build({ entryPoints: ['src/agentd/agentd.js'], absWorkingDir: REPO, bundle: true, platform: 'node', external: [...flags.matchAll(/--external:(\S+)/g)].map((x) => x[1]), preserveSymlinks: /--preserve-symlinks/.test(flags), write: false, metafile: true, logLevel: 'silent', plugins });
  return new Set(Object.keys(r.metafile.inputs).filter((f) => !f.startsWith('node_modules/')));
}
const DOOR_REQ = /(?:^|[^\w$.])require\(\s*(['"])(\.{1,2}\/[^'"]+)\1\s*\)/g;
/** [file, 'device' | 'hub'] for every file whose CODE requires one of the two doors (a comment line never counts) */
function doorTakers(texts) {
  const out = [];
  for (const [rel, text] of texts) {
    for (const line of text.split('\n')) {
      if (/^\s*(?:\/\/|\*|\/\*)/.test(line)) continue;
      for (const m of line.matchAll(DOOR_REQ)) {
        let p = path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[2]));
        if (!p.endsWith('.js')) p += '.js';
        if (p === DEVICE_DOOR && rel !== DEVICE_DOOR) out.push([rel, 'device']);
        if (p === HUB_DOOR && rel !== HUB_DOOR) out.push([rel, 'hub']);
      }
    }
  }
  return out;
}
function doorsByModule(inputs, takers, named = DEVICE_DOOR_TAKERS) {
  const bad = [];
  for (const [f, d] of takers) {
    if (d === 'device' && !inputs.has(f)) bad.push(`${f}: a module only the hub loads takes the device's door`);
    if (d === 'device' && !named.includes(f)) bad.push(`${f}: takes the device's door and is not named in DEVICE_DOOR_TAKERS`);
    if (d === 'hub' && inputs.has(f)) bad.push(`${f}: a module the device bundles takes the hub's door`);
  }
  for (const f of named) if (!takers.some((x) => x[0] === f && x[1] === 'device')) bad.push(`${f}: named a taker of the device's door and takes it no more (drop its name)`);
  if (inputs.has(HUB_DOOR)) bad.push(`${HUB_DOOR} is an input of the device bundle`);
  return { ok: bad.length === 0, bad, hub: takers.filter((x) => x[1] === 'hub').map((x) => x[0]) };
}
{
  const inputs = await bundleInputs();
  const texts = trackedFiles(REPO, 'src', 'server.js').filter((f) => /\.(?:c|m)?js$/.test(f)).map((f) => [f, fs.readFileSync(path.join(REPO, f), 'utf8')]);
  const takers = doorTakers(texts), v = doorsByModule(inputs, takers);
  ok(v.ok && inputs.has(DEVICE_DOOR), `the two doors BY MODULE (r4834 M1): the device's door is taken by the ${DEVICE_DOOR_TAKERS.length} modules named, each a device bundle input; the hub's door by ${v.hub.length} modules only the hub loads (${v.hub.join(', ')}); src/fd-close.js is no input of the bundle (${inputs.size} inputs)`, v.bad);
  const hubOnly = texts.map(([f]) => f).find((f) => f.startsWith('src/server/') && !inputs.has(f));
  const bundled = 'src/desktop-serve.js';
  const planted = await bundleInputs({ filter: /[\\/]src[\\/]desktop-serve\.js$/, add: "\nrequire('./fd-close.js');\n" });
  const p1 = doorsByModule(inputs, [...takers, [hubOnly, 'device']]), p2 = doorsByModule(planted, [...takers, [bundled, 'hub']]), p3 = doorsByModule(inputs, takers.filter((x) => x[0] !== 'src/desktop-mic.js'));
  ok(!!hubOnly && inputs.has(bundled) && planted.has(HUB_DOOR) && !inputs.has(HUB_DOOR) && !p1.ok && !p2.ok && !p3.ok,
    `RED CONTROLS: a module only the hub loads taking the device's door (${hubOnly}, planted); a SECOND BUILD with the hub's helper planted into a bundled module (${bundled}) carries src/fd-close.js — red; a named taker that takes it no more — red`, { p1: p1.bad, p2: p2.bad, p3: p3.bad, plantedCarries: planted.has(HUB_DOOR) });
  const seen = doorTakers([['src/server/x.js', "const D = require('../agentd/durable-file.js');\n// const H = require('../fd-close.js');\nconst H2 = require('../fd-close');\n"]]);
  ok(seen.length === 2 && seen[0][1] === 'device' && seen[1][1] === 'hub', 'CONTROL: a door required in code is read (with or without «.js»), one in a comment is not', seen);
}
ok(OWED_MAX <= OWED_BASELINE + RISES.reduce((a, r) => a + r[0], 0) && RISES.every((r) => Number.isInteger(r[0]) && r[0] > 0 && /^B-[0-9a-f]{4}$/.test(r[1]) && !!r[2]), `the owed count rises only BY NAME: ${OWED_MAX} against the kept baseline ${OWED_BASELINE}${RISES.length ? ` + ${RISES.map((r) => `${r[0]} (${r[1]})`).join(' + ')}` : ''}`, { OWED_MAX, OWED_BASELINE, RISES });

/** the `mv` a src/ file hands a child: in a string or a template piece, with its operands or at a piece's END before ${…} (the
 *  round's B-bcb8 read: «&& mv ${a} ${b}»), and 'mv' alone AS A PROGRAM — a call's first argument followed by its argv array
 *  (execFile('mv', [a, b])), or an argv element after flags only (['-n', 'mv', a, b]); never 'mv' as a word (a pointer event's
 *  type, a command-word table, an allow list). Each SITE is { file, line, scope: «its scope | its words» } (SHELL_ROWS). */
const MV = /(?:^|[\s;&|(])mv(?=\s|$)/g;
const MV_WORDS = 40;
const SYNC_WORD = /(?:^|[\s;&|({])sync(?=[\s;&|)]|$)/;   // the `sync` command, never srcsync / fsync / rsync / a const's NAME
export function mvSites(rel, src) {
  const code = src.replace(/^#!.*/, ''), opts = { ecmaVersion: 'latest', allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true, allowHashBang: true, locations: true };
  let ast; try { ast = AC.parse(code, { ...opts, sourceType: 'script' }); } catch { ast = AC.parse(code, { ...opts, sourceType: 'module', allowReturnOutsideFunction: false }); }
  const out = [], words = (t) => t.replace(/\s+/g, ' ').trim().slice(0, MV_WORDS);
  // a template's text, its ${…} as written; a module const's text by its name (a step handed as a name: XPRA_KEY_SYNC)
  const shapeOf = (tl) => tl.quasis.map((q, k) => String(q.value.cooked ?? q.value.raw) + (k < tl.expressions.length ? '${' + code.slice(tl.expressions[k].start, tl.expressions[k].end) + '}' : '')).join('');
  const consts = new Map();
  for (const st of ast.body) if (st.type === 'VariableDeclaration' && st.kind === 'const') for (const d of st.declarations) if (d.id.type === 'Identifier' && d.init && ((d.init.type === 'Literal' && typeof d.init.value === 'string') || d.init.type === 'TemplateLiteral')) consts.set(d.id.name, d.init.type === 'Literal' ? d.init.value : shapeOf(d.init));
  const textOf = (n) => (!n ? '' : n.type === 'Literal' && typeof n.value === 'string' ? n.value : n.type === 'TemplateLiteral' ? shapeOf(n) : n.type === 'Identifier' ? consts.get(n.name) || '' : n.type === 'BinaryExpression' && n.operator === '+' ? textOf(n.left) + textOf(n.right) : '');
  // what runs BEFORE a piece in its command: the pieces before it in a + chain, else the step before it in an array of steps
  const before = (node, parents) => {
    let k = parents.length - 1, cur = node;
    while (k >= 0 && parents[k].type === 'BinaryExpression' && parents[k].operator === '+') { cur = parents[k]; k--; }
    if (cur !== node) { const leaves = []; const flat = (n) => (n.type === 'BinaryExpression' && n.operator === '+' ? (flat(n.left), flat(n.right)) : leaves.push(n)); flat(cur); const i = leaves.indexOf(node); return leaves.slice(0, i).map(textOf).join(''); }
    const up = parents[parents.length - 1];
    if (up && up.type === 'ArrayExpression') { const i = up.elements.indexOf(node); return i > 0 ? textOf(up.elements[i - 1]) : ''; }
    // a piece held by a const (through ?: / ||): the command a template of its function interpolates it into, up to ${name}
    let j = parents.length - 1, held = node;
    while (j >= 0 && (parents[j].type === 'ConditionalExpression' || parents[j].type === 'LogicalExpression')) { held = parents[j]; j--; }
    const decl = parents[j];
    if (decl && decl.type === 'VariableDeclarator' && decl.init === held && decl.id.type === 'Identifier') {
      const name = decl.id.name, fnNode = parents.slice(0, j).reverse().find(isFn) || ast;
      let into = '';
      walk(fnNode, (t) => { if (into || t.type !== 'TemplateLiteral') return; const k = t.expressions.findIndex((e) => e.type === 'Identifier' && e.name === name); if (k >= 0) into = shapeOf({ quasis: t.quasis.slice(0, k + 1), expressions: t.expressions.slice(0, k) }); });
      return into;
    }
    return '';
  };
  // a sync READ: a `sync` command word anywhere before this `mv` in its command (by text position)
  const syncedAt = (head) => SYNC_WORD.test(head);
  const site = (x, parents, w, head) => out.push({ file: rel, line: x.loc.start.line, scope: `${scopeOf(parents)} | ${words(w)}`, synced: syncedAt(head) });
  // 'mv' AS A PROGRAM: the argv after it, or null
  const argvAfter = (x, parents) => {
    const up = parents[parents.length - 1], up2 = parents[parents.length - 2];
    if (up && up.type === 'CallExpression' && up.arguments[0] === x) return up.arguments[1] && up.arguments[1].type === 'ArrayExpression' ? up.arguments[1].elements : null;
    if (up && up.type === 'ArrayExpression' && up2 && up2.type === 'CallExpression' && up2.arguments.includes(up)) { const i = up.elements.indexOf(x); return up.elements.slice(0, i).every((e) => e && e.type === 'Literal' && typeof e.value === 'string' && e.value.startsWith('-')) ? up.elements.slice(i + 1) : null; }
    return null;
  };
  walk(ast, (x, parents) => {
    if (x.type === 'Literal' && typeof x.value === 'string') {
      if (x.value === 'mv') { const argv = argvAfter(x, parents); if (argv) site(x, parents, ['mv', ...argv.map((e) => (e ? code.slice(e.start, e.end) : ''))].join(' '), ''); return; }
      const pre = before(x, parents);
      for (const m of x.value.matchAll(MV)) { const at = m.index + m[0].length - 2; site(x, parents, x.value.slice(at), pre + '\n' + x.value.slice(0, at)); }
    } else if (x.type === 'TemplateElement') {
      const tl = parents[parents.length - 1], i = tl.quasis.indexOf(x), shape = shapeOf(tl);
      let at0 = 0; for (let k = 0; k < i; k++) at0 += String(tl.quasis[k].value.cooked ?? tl.quasis[k].value.raw).length + '${'.length + (tl.expressions[k].end - tl.expressions[k].start) + 1;
      const pre = before(tl, parents.slice(0, -1));
      for (const m of String(x.value.cooked ?? x.value.raw).matchAll(MV)) { const at = at0 + m.index + m[0].length - 2; site(x, parents, shape.slice(at), pre + '\n' + shape.slice(0, at)); }
    }
  });
  return out;
}
const mvCount = (src) => mvSites('src/zz-plant.js', src).length;
/** a data/bin file's renames: null when it is no JavaScript tool (a shell script has none of these calls) or names no rename */
export function binSitesOf(rel, src) {
  if (!/^#!.*\bnode\b/.test(src) && !/\.(?:c|m)?js$/.test(rel)) return null;
  if (!NAMES.test(src)) return null;
  return renameSites(rel, src, AC);
}
const regionSites = () => {
  const bin = { sites: [], unknown: [], unparsed: [] }, shell = [];
  for (const rel of trackedFiles(REPO, 'data/bin')) {
    let src = ''; try { src = fs.readFileSync(path.join(REPO, rel), 'utf8'); } catch { continue; }
    let r; try { r = binSitesOf(rel, src); } catch (e) { bin.unparsed.push(`${rel}: ${e.message}`.slice(0, 160)); continue; }
    if (r) { bin.sites.push(...r.sites); bin.unknown.push(...r.unknown); }
  }
  for (const rel of trackedFiles(REPO, 'src', 'server.js').filter((f) => /\.(?:c|m)?js$/.test(f))) {
    const src = fs.readFileSync(path.join(REPO, rel), 'utf8');
    if (/\bmv\b/.test(src)) shell.push(...mvSites(rel, src));
  }
  return { bin, shell };
};
const REG = regionSites();
const JB = judge(REG.bin.sites, BIN_ROWS), JS = judge(REG.shell, SHELL_ROWS, FAMILIES, { stated: true });
{
  const files = (xs) => new Set(xs.map((x) => x.file)).size, sayMv = (x) => `${x.file}:${x.line} ${JSON.stringify(x.scope)} (${x.synced ? 'reads synced' : 'no sync before it'})`;
  console.log(`①b the two regions, judged (row B-bcb8): data/bin ${REG.bin.sites.length} renames in ${files(REG.bin.sites)} tools (${['synced', 'unsynced', 'move'].map((c) => `${REG.bin.sites.filter((x) => x.cls === c).length} ${c}`).join(', ')}); ${REG.shell.length} «mv» in command strings of ${files(REG.shell)} src/ files (${REG.shell.filter((x) => x.synced).length} read synced)`);
  ok(REG.bin.unparsed.length === 0 && REG.bin.unknown.length === 0, 'every data/bin tool parses, and each of its renames is on the file system (an unknown object or a bare call is red by name)', REG.bin);
  for (const x of JB.noRow) console.error(`  ✗ NO ROW (a rename under data/bin: give it its family): ${say(x)}`);
  for (const x of JB.extra) console.error(`  ✗ ONE MORE SITE than its row says (data/bin): ${say(x)}`);
  for (const x of JS.noRow) console.error(`  ✗ NO ROW (a «mv» in a command string: give it its class by reading and its family): ${sayMv(x)}`);
  for (const x of JS.extra) console.error(`  ✗ ONE MORE SITE than its row says (a «mv»): ${sayMv(x)}`);
  for (const g of [...JB.gone, ...JS.gone]) console.error(`  ✗ GONE (drop it from its row; an owed site's cure lowers REGION_OWED_MAX): ${g.file} ${JSON.stringify(g.scope)} (${g.cls}, ${g.family}) ×${g.missing}`);
  for (const x of [...JB.badFamily, ...JS.badFamily]) console.error(`  ✗ ITS FAMILY «${x.family}» DOES NOT ADMIT ${x.cls}: ${x.file}:${x.line} ${x.scope}`);
  const off = [JB, JS].reduce((n, j) => n + j.noRow.length + j.extra.length + j.gone.length, 0);
  ok(off === 0, `every region site has its row, and every row its sites (data/bin: ${JB.noRow.length} new, ${JB.extra.length} more, ${JB.gone.length} gone; shell: ${JS.noRow.length} new, ${JS.extra.length} more, ${JS.gone.length} gone)`);
  ok(JB.badFamily.length === 0 && JS.badFamily.length === 0, 'every region site\'s class (read under data/bin, judged by reading in a command string) is one its family admits');
  ok(JB.owed + JS.owed === REGION_OWED_MAX, `REGION_OWED_MAX: ${JB.owed + JS.owed} sites of the owed families in the two regions (stated ${REGION_OWED_MAX}) — ${JB.owed + JS.owed < REGION_OWED_MAX ? `LOWER REGION_OWED_MAX to ${JB.owed + JS.owed} (a cure: the ratchet falls)` : JB.owed + JS.owed > REGION_OWED_MAX ? 'a NEW owed site: the ratchet only falls (cure it, or name its family with its reason)' : 'held'}`);
  ok(REGION_OWED_MAX <= REGION_OWED_BASELINE + REGION_RISES.reduce((a, r) => a + r[0], 0) && REGION_RISES.every((r) => Number.isInteger(r[0]) && r[0] > 0 && /^B-[0-9a-f]{4}$/.test(r[1]) && !!r[2]), `the regions' owed count rises only BY NAME: ${REGION_OWED_MAX} against the kept baseline ${REGION_OWED_BASELINE}`, { REGION_OWED_MAX, REGION_OWED_BASELINE, REGION_RISES });
}
console.log('② the families:');
for (const [k, f] of Object.entries(FAMILIES)) {
  const rs = [...ROWS, ...BIN_ROWS, ...SHELL_ROWS].filter((r) => r[2] === k), n = rs.reduce((a, r) => a + r.length - 4, 0);
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
  const words = mvSites('src/zz-plant.js', "function f(a, b, t, d) { run('sudo', ['-n', 'mv', a, b]); const c = `cp x ${t} && mv -f ${t} ${d}; sync`; const e = 'rm -f z; mv  -T  \"$q\"\\n \"$r\"'; }\nfunction g() { return 'cat > \"$R.t\" && mv \"$R.t\" \"$R\"; sync -f \"$R\"; mv \"$NX\" \"$R\"; srcsync x; mv \"$P\" \"$Q/a-folder-name-long-enough-to-be-cut\"'; }\nconst K_SYNC = 'sync -- \"$K\"';\nconst STEPS = ['curl -o \"$K\"', K_SYNC, 'mv -f \"$K\" \"$KEY\"', `mv ${a} b`];\nconst CHAIN = 'tar x; sync&&' + 'mv u w';\nfunction h(a, x) { const post = a ? ` && mv ${a} z` : ''; const tail = `a${x};mv b c`; return `sync -f y && tar x${post}`; }\n").map((x) => `${x.scope}${x.synced ? ' (synced)' : ''}`);
  ok(words.join(' · ') === "f | mv a b · f | mv -f ${t} ${d}; sync · f | mv -T \"$q\" \"$r\" · g | mv \"$R.t\" \"$R\"; sync -f \"$R\"; mv \"$NX\" \" · g | mv \"$NX\" \"$R\"; srcsync x; mv \"$P\" \"$Q/a- (synced) · g | mv \"$P\" \"$Q/a-folder-name-long-enough-to (synced) · <module> | mv -f \"$K\" \"$KEY\" (synced) · <module> | mv ${a} b · <module> | mv u w (synced) · h | mv ${a} z (synced) · h | mv b c", 'a «mv» is known by its scope and its words (a program by its argv, a template\'s ${…} as written, white space folded, cut at MV_WORDS, a template piece after ${…} at its own place), and a sync is READ only BEFORE it in its command: in its string (never after it, nor srcsync), in the step before it named by a const (not a template two steps on), in the pieces before it in a + chain (sync&&), in the command a const template is interpolated into', words);
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
// ── ④ THE TWO DIAGNOSTICS JUDGED «derived» (B-574d, lane nl-journals, 主开发 r4761): THEIR READERS, SHOWN — a torn file is read as none ─
// data/boot-trace.json: no hub code but its writer names it (the window's close writes it; GET /api/boot-trace and Diagnostics answer
// from memory) and its writer reads no file. data/cpu-profiles: the hub's ONE reader (src/server/loop-holds.js) lists the folder by
// NAME (readdir) and streams a file's bytes as they are to the owner's download — it never parses one; the watchdog thread that writes
// them reads none back. RED: a reader planted in a copy's text (never the tree) is named.
console.log('④ the two diagnostics judged «derived»: their readers — a torn file is read as none');
{
  const PARSE = { ecmaVersion: 'latest', allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true, allowHashBang: true };
  const astOf = (src) => { const code = src.replace(/^#!.*/, ''); try { return AC.parse(code, { ...PARSE, sourceType: 'script' }); } catch { return AC.parse(code, { ...PARSE, sourceType: 'module', allowReturnOutsideFunction: false }); } };
  const pieces = (src) => { const out = []; walk(astOf(src), (n) => { if (n.type === 'Literal' && typeof n.value === 'string') out.push(n.value); else if (n.type === 'TemplateElement') out.push(n.value.cooked || ''); }); return out; };
  const READS = new Set(['readFile', 'readFileSync', 'createReadStream', 'open', 'openSync', 'readSync', 'read']);
  /** the fs calls of a text whose arguments name `ident` → «callee» each */
  const fsCallsOn = (src, ident) => { const out = []; const code = src.replace(/^#!.*/, ''); walk(astOf(src), (n) => { if (n.type !== 'CallExpression' || n.callee.type !== 'MemberExpression') return; const callee = code.slice(n.callee.start, n.callee.end); if (!/^(?:fs|fsp)\./.test(callee)) return; if (n.arguments.some((a) => new RegExp(`\\b${ident.replace('.', '\\.')}\\b`).test(code.slice(a.start, a.end)))) out.push(callee); }); return out; };
  const readsIn = (src) => { const out = []; walk(astOf(src), (n) => { if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && !n.callee.computed && READS.has(n.callee.property.name)) out.push(n.callee.property.name); }); return out; };
  const texts = trackedFiles(REPO, 'src', 'server.js').filter((f) => /\.(?:c|m)?js$/.test(f)).map((f) => [f, fs.readFileSync(path.join(REPO, f), 'utf8')]);
  const namers = (name, ts) => ts.filter(([, t]) => t.includes(name)).filter(([, t]) => pieces(t).some((p) => p.includes(name))).map(([f]) => f).sort();
  const BT = 'src/server/boot-trace.js', LH = 'src/server/loop-holds.js', WK = 'src/server/sync-fs-witness-worker.js';
  const textOf = (rel, ts = texts) => (ts.find(([f]) => f === rel) || [null, ''])[1];
  const bootFacts = (ts) => ({ namers: namers('boot-trace.json', ts), writerReads: readsIn(textOf(BT, ts)), fromMemory: textOf(BT, ts).includes("res.json(report({ cpu: !!(req.query && req.query.cpu === '1') }))") });
  const capFacts = (ts) => ({ reader: fsCallsOn(textOf(LH, ts), 'profileDir'), raw: textOf(LH, ts).includes('st.pipe(res)'), writerReads: [...fsCallsOn(textOf(WK, ts), 'c.dir'), ...fsCallsOn(textOf(WK, ts), 'tmp')].filter((c) => READS.has(c.split('.').pop())) });
  const b = bootFacts(texts), c = capFacts(texts);
  ok(b.namers.join() === BT && b.writerReads.length === 0 && b.fromMemory, '④ data/boot-trace.json: NO hub code but its writer names it, its writer reads no file, and GET /api/boot-trace answers from memory — a torn file there is read by nobody (the next boot writes it whole)', b);
  ok(c.reader.join() === 'fs.promises.readdir,fs.createReadStream' && c.raw && c.writerReads.length === 0, '④ data/cpu-profiles: the hub lists the folder by NAME (readdir) and streams a file\'s bytes AS THEY ARE to the owner\'s download — never parsed; the watchdog thread that writes them reads none back — a torn capture is read as none (nothing is held as damaged)', c);
  const CC = require(path.join(REPO, 'src/cpu-capture.js')), torn = CC.fileName(Date.parse('2026-11-26T00:00:00Z'), true);
  ok(CC.keptFiles([torn]).keep.map((f) => f.name).join() === torn, '④ …the kept list takes NAMES, never bytes: a torn capture is kept and dropped by its name like any other', { torn });
  const plantB = texts.map(([f, t]) => [f, f === 'server.js' ? t + "\nJSON.parse(require('fs').readFileSync(require('path').join(__dirname, 'data', 'boot-trace.json'), 'utf8'));\n" : t]);
  const plantC = texts.map(([f, t]) => [f, f === LH ? t + "\nconst kept = JSON.parse(fs.readFileSync(path.join(profileDir, 'x.cpuprofile'), 'utf8'));\n" : t]);
  const plantW = texts.map(([f, t]) => [f, f === WK ? t + "\nconst back = fs.readFileSync(tmp, 'utf8');\n" : t]);
  const rb = bootFacts(plantB), rc = capFacts(plantC), rw = capFacts(plantW);
  ok(rb.namers.includes('server.js') && rc.reader.includes('fs.readFileSync') && rw.writerReads.includes('fs.readFileSync'), 'RED ④ a reader planted in a copy\'s text (server.js reads the boot trace back; loop-holds parses a kept capture; the watchdog reads its temp back) is named — the «derived» judgment would no longer hold', { boot: rb.namers, cap: rc.reader, writer: rw.writerReads });
}
console.log('④b the regions\' judging, controlled (PURE, planted texts through the census\'s own readers; each control names what it planted)');
  const P = 'src/zz-plant.js', plant = (body) => mvSites(P, `function k() { return '${body}'; }`);
  const rows = [[P, 'unsynced', 'region', 'planted', 'k | mv -f "$t" "$d"; mv "$a" "$b"'], [P, 'move', 'move', 'planted', 'k | mv "$a" "$b"']];
  const torn = plant('cat > "$t" && mv -f "$t" "$d"; mv "$a" "$b"'), J0 = judge(torn, rows, FAMILIES, { stated: true });
  const cured = plant('cat > "$t" && sync -- "$t" && mv -f "$t" "$d"; mv "$a" "$b"'), J1 = judge(cured, rows, FAMILIES, { stated: true });
  const witness = cured.find((x) => x.scope === rows[0][4]);
  ok(J0.noRow.length + J0.extra.length + J0.gone.length === 0 && J0.owed === 1 && !!witness && witness.synced === true && J1.noRow.length === 1 && J1.noRow[0] === witness && J1.gone.length === 1 && J1.gone[0].family === 'region' && J1.owed === 0,
    'CONTROL (the natural cure): a sync put in front of an UNCHANGED «mv» — the same words, its sync read — is red on ITS row (no row takes a synced site, its unsynced row is gone), the «move» beside it untouched, the owed count 1 → 0', { J0, J1, witness });
  const two = [[P, 'unsynced', 'region', 'planted', 'k | mv -f "$S/a" "$D/a" && mv -f "$S/b" "$D/', 'k | mv -f "$S/b" "$D/b"']];
  const oneSync = plant('tar -x -C "$S" && sync -f "$S" && mv -f "$S/a" "$D/a" && mv -f "$S/b" "$D/b"'), J1b = judge(oneSync, two, FAMILIES, { stated: true });
  ok(judge(plant('tar -x -C "$S" && mv -f "$S/a" "$D/a" && mv -f "$S/b" "$D/b"'), two, FAMILIES, { stated: true }).owed === 2 && oneSync.length === 2 && oneSync.every((x) => x.synced) && J1b.noRow.length === 2 && J1b.gone.length === 2 && J1b.gone.every((g) => g.family === 'region' && g.missing === 1) && J1b.owed === 0,
    'CONTROL (one sync for several): a sync put once in front of two unchanged «mv» reads for both — both are red on their row, the owed count 2 → 0', { oneSync, J1b });
  const synced = [[P, 'synced', 'self-synced', 'planted', 'k | mv -f "$t" "$d"']];
  const kept = judge(plant('install x "$t" && sync -- "$t" && mv -f "$t" "$d"'), synced, FAMILIES, { stated: true });
  const lost = plant('install x "$t" && mv -f "$t" "$d"'), J2 = judge(lost, synced, FAMILIES, { stated: true });
  ok(kept.noRow.length + kept.gone.length === 0 && lost.length === 1 && lost[0].synced === false && J2.noRow.length === 1 && J2.noRow[0] === lost[0] && J2.gone.length === 1 && J2.gone[0].family === 'self-synced',
    'CONTROL (a sync taken away): a self-synced «mv» whose sync is gone reads unsynced and is red on its row', { kept, J2 });
  const J3 = judge(torn, [[P, 'unsynced', 'self-synced', 'planted', rows[0][4]], rows[1]], FAMILIES, { stated: true });
  ok(J3.badFamily.length === 1 && J3.badFamily[0].scope === rows[0][4] && J3.badFamily[0].cls === 'unsynced', 'CONTROL: an unsynced «mv» put in a self-synced family is red (that family admits synced only)', J3.badFamily);
  const more = mvSites(P, `function k() { const n = 'cp y "$u" && mv "$u" "$v"'; return 'cat > "$t" && mv -f "$t" "$d"; mv "$a" "$b"'; }`), J4 = judge(more, rows, FAMILIES, { stated: true });
  ok(J4.noRow.length === 1 && J4.noRow[0].scope === 'k | mv "$u" "$v"' && J4.gone.length === 0, 'CONTROL: a new «mv» in a judged scope, with its own words, has no row (the judged ones beside it keep theirs)', J4);
  // data/bin, planted through the census's own reader (binSitesOf): a node tool's unsynced rename has no row; a shell script's
  // text is no JavaScript tool (read as none)
  const tool = binSitesOf('data/bin/zz-new', "#!/usr/bin/env node\nconst fs = require('fs');\nfunction keep(f, d) { fs.writeFileSync(f + '.tmp', d); fs.renameSync(f + '.tmp', f); }\n");
  let sh; try { sh = binSitesOf('data/bin/zz-new.sh', '#!/bin/sh\nmv "$a.tmp" "$a"; node -e "fs.renameSync(a, b)"\n'); } catch (e) { sh = `threw: ${e.message}`; }
  const J5 = tool ? judge(tool.sites, BIN_ROWS) : null;
  ok(!!J5 && tool.sites.length === 1 && tool.sites[0].cls === 'unsynced' && tool.sites[0].scope === 'keep' && J5.noRow.length === 1 && J5.noRow[0] === tool.sites[0] && sh === null,
    'CONTROL: a data/bin tool planted through the census\'s reader — its unsynced rename (scope keep) has no row; a shell script\'s text is read as none', { tool, sh });
report();
