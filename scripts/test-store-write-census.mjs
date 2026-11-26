#!/usr/bin/env node
// test-store-write-census — lane hub-loop-stalls commit 2, «NO STORE WRITE HOLDS THE MAIN THREAD». FAST, PURE (a text scan).
// On the owner's hub, 58 of 64 holds ≥ 1 s in six hours were ONE synchronous store write — the channels index's rename
// (21.7 MB rewritten whole, 1.3 s median on network storage); a scratch hub on a slow stand-in showed EVERY atomic store
// write holding the main loop for its whole rename. The writes that moved go through THE STORE WRITER
// (src/store-writer.js — its own thread, a pace stated for the size); EVERY OTHER synchronous persistence write of
// the main process is a ROW here — the proof is a census, not a memory (the sync-fs census is the model).
//   ① every persistence write call (writeFileSync · appendFileSync · renameSync · copyFileSync · (f)truncateSync ·
//      fsyncSync · fdatasyncSync · writeSync · writevSync — and, since channel-store-off-loop, mkdirSync · openSync for
//      write / append · rmSync · unlinkSync — scripts/sync-fs-census.mjs's scan of server.js, src/*.js,
//      src/server/*.js, src/routes/*.js) and every call of an atomic helper (writeJsonAtomic · writeBuffersAtomic ·
//      _writeAtomic · writePrivateFile) is claimed by EXACTLY ONE row [file, scope ('*' = the file's others), n, class,
//      other readers, what a lost last write costs, why] — n EXACT: a new site reds its row, a site in a new file is red
//      BY NAME. THE CLASSES:
//        durable      money / authority / a credential, and a session's FIRST meta — must be on disk before the answer
//                     (small; stays synchronous in this commit); its row says what a lost write costs
//        not-main     the call runs on another thread or process (a worker, a child, the device agent)
//        not-a-store  a person's own file (the explorer, the editor, /dav)
//        exit         the store writer's own synchronous path: the bounded exit flush, a store's close
//        debt         a store's synchronous write on the main thread NOT moved yet — named, and THE DEBT RATCHET: their
//                     sum may only FALL (DEBT_MAX); a store moved onto the writer lowers it in the same commit
//   ② no dead row, no unknown class, every durable row says its cost; the moved stores have no synchronous write of
//      their own left: the index's write is markDirty → the writer, session-meta's UPDATE path and the usage cursors /
//      rates hand their bytes to the writer by name
//   ③ RED CONTROLS: a site in a new file, one more site in a covered row, a new class, a debt rise — each RED
//   ④ THE PACE (PURE src/store-pace.js): the gap stated for the size, the due rule, the exit line's words
//   ⑤ THE CHANNELS INDEX IN TWO COLUMNS (the coordinator's freeze item 2): every `<x>.index.update(` of the main process
//      is claimed by its SCOPE — a person's act, a decision, a billing / delivery record ⇒ `{ durable: true }` (its
//      promise resolves once the index holding it is on disk: the answer waits for the disk, the loop never does); a
//      field the hub re-derives (a cache, a ledger, a stamp, a migration whose readers lift the old shape) ⇒ paced.
//      Counts EXACT; a new scope is red by name; a live leg: an act is on disk when its promise resolves, a paced change
//      is not yet; RED CONTROL: markRead without `durable` is red
//   ⑦ SESSION-META's CHAIN by scope: a {durable: true} write's promise is CONSUMED (awaited, returned, chained by a
//      .then that READS its value, a .catch / .finally with a body, kept in a binding that is read) or DROPPED —
//      `void`, an argument nobody keeps, an unread binding, an empty or constant .catch / .finally, a .then whose first
//      handler never reads the value (round 6: `.then(() => {})`, `.then(() => {}, h)`, `.catch(() => null)`; its amend:
//      `.then((ok) => ok)` whose own result is dropped, a `.finally` of any body — it never sees the value —, a rest or
//      pattern parameter judged by every name it binds).
//      THE CHAIN RULE'S LIMITS, stated (round 6, smaller 3): an assignment to a property (`o.p = writeSessionMeta(…)`)
//      counts as consumed whoever reads `o.p`; a binding is judged by its NAME read anywhere in its function — an inner
//      declaration that shadows it reads as a use; a handler passed by name (`.then(onSaved)`) is trusted
//   ⑧ THE STORE READ (B-f276): src/store-read.js's three answers + the census of every store's READ as a ratchet (debt only shrinks)
//   §T ⑩'s legs, ⑪'s driven legs and ⑭ RUN the product: moved VERBATIM to the heavy twin scripts/test-store-write-census-scenes.mjs (B-7e49, r2522)
// Run: node scripts/test-store-write-census.mjs
import './scratch.mjs';   // FIRST (B-ba47 B2): it loads scratch.mjs at run time too (a dynamic import) — the re-home comes before any of its code
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import os from 'node:os';
import { wholeDetail } from './lib/check.mjs';   // r3928: a failing line's list printed whole, one item a line
import { filesOf, sitesOf, walk, scopeOf } from './sync-fs-census.mjs';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? wholeDetail(d) : '')); } };

// channel-store-off-loop (commit 1): THE CENSUS LEARNS WHAT IT MISSED — a directory made (mkdirSync), a file opened for
// write or append (openSync whose flags are not a read's), a tree or a file removed (rmSync, unlinkSync) hold the loop on a
// slow mount as a write does (the owner's hub: an account directory's mkdir, 19 holds and 75 s in a day, was never a row)
const PERSIST = new Set(['writeFileSync', 'appendFileSync', 'renameSync', 'copyFileSync', 'truncateSync', 'ftruncateSync', 'fsyncSync', 'fdatasyncSync', 'writeSync', 'writevSync', 'mkdirSync', 'rmSync', 'unlinkSync', 'openSync']);
/** an openSync's flags: absent or a read's literal ('r', 'rs') ⇒ not a write; a write / append / '+' literal, or flags not
 *  written as a literal (a constant, a variable) ⇒ counted */
const opensForWrite = (call) => { const fl = call.arguments[1]; if (!fl) return false; return !(fl.type === 'Literal' && typeof fl.value === 'string' && !/[wa+]/.test(fl.value)); };
const HELPER = /\b(writeJsonAtomic|writeBuffersAtomic|_writeAtomic|writePrivateFile|writeDurable)\s*\(/g;   // + writeDurable (B-574d): the device's one door, called by modules the device bundles that the hub runs too
const CLASSES = new Set(['durable', 'not-main', 'not-a-store', 'exit', 'debt']);
// a file whose rows are by SCOPE (its other sites fall to '*')
const SCOPED = { 'src/fd-close.js': ['renameSynced'], 'src/server/usage-pool-engine.js': ['persistResetCreditTries'], 'src/usage-cache-write.js': ['keepTornAside', 'setAsideReading'], 'src/server/session-stdout.js': ['writeSessionMeta', 'patchSessionMeta'], 'src/desktop-serve.js': ['writeJsonAtomic', 'writeAtCall'], 'src/jobs.js': ['JobManager._logsHeldFile', 'JobManager._logsNoteAtExit'],
  // channel-store-off-loop (commit 1): the channel store's doors BY NAME — the moved ones (adapters, groups, the outbox, the
  // aliases, people, the poll-stamps snapshot) have no synchronous call left (no row); the journal is the named exception;
  // every other door is LISTED as its own row, rows that only fall
  'src/channel-store.js': ['journal', 'foldJournal', 'lruSave', 'lruFlush', 'attachmentPut', 'avatarPut', 'avatarRefuse', 'searchMemoDrop', 'feedMissDrop', 'appendRecords', 'appendLines', 'writeAll', 'prependRecords', 'rewriteRecords', 'trim', 'appendSide', 'trimSide', 'audit', 'outboxPrune', 'dropOutboxFiles'] };   // lane job-logs-sweep r3: the failed load's fact on disk (durable); r4: a note still owed, written by the exit
// THE DEBT RATCHET: the sum of n over the debt rows may only fall (lane hub-loop-stalls commit 2: 453 → 451 with session-status
// moved; + 4 at the .390 rebase — master's new sites, classified here: src/turn-carry.js save ×2 (report-mark-on-ack) and
// src/server/cli-model-catalog.js saveLedger ×2 (cli-update-needs-nothing) — 455; round 2: + 65 the census could NOT
// SEE before — writes through an fs alias or a destructured name, a derived helper's callers, and six main-process
// directories never scanned (src/channels, src/harnesses, src/adapters, src/spawn, src/plugins, src/agentd/client.js) —
// the true count: 520; it falls from here; − 2 with lane hub-sync-holds rank 12a: src/server/auto-update.js DELETED — no boot
// runs an update — 518)
// channel-store-off-loop (commit 1): THE CENSUS LEARNED mkdirSync, openSync for write / append, rmSync and unlinkSync —
// the true count on 2.369.404 (d7f42cc21) with these rows is 904 (516 + 388 newly seen; the poll-stamps journal's two calls
// named a durable exception); the moved doors' 11 sites (adapters, the outbox, groups, aliases, people ×2, the stamps
// snapshot's call, its truncate and writeBuffersAtomic's own three) go to zero ⇒ 893
// B-48a4 (the exit door's cost; restacked on 2.369.410): the two audit rings onto the store writer through ONE appender — device-audit.js's
// 3 and exit-proxy.js audit's 3 go to zero; every save of hosts.json through the store writer — hosts.js _save's 2 go to zero ⇒ 881 − 8 = 873
const DEBT_MAX = 699;   // B-574d's follow (lane nl-journals, 主开发 r4844): +1 — the CSP re-judge removes its temp on a failed rewrite (r4828: no temp left on any road).  B-574d slice «journals-and-diagnostics» (lane nl-journals): −2 — the CSP re-judge's rewrite (its temp's write and rename) is src/fd-close.js renameSynced's; −2 — the lost writes' record (src/server/writes-lost.js writeAtomic) the same way; +1 — its exit removes a write's temp still in flight (r4761: the race closed) — 777 → 774 in all.  B-574d «usage-ledger-repairs» (lane nl-migrations, 主开发 r4881 / r4957): −12 RECOUNTED — each helper's write + rename now at the door (their calls stay counted at their own rows: _writeAtomic is a named helper); −5 — the door's row restated «durable» (r4957: the ruled synchronous form; the debt counts callers, never the door).  B-574d «hub-migrations» follow (主开发 r4866): −1 RECOUNTED — home-rename's data marker goes through src/fd-close.js renameSynced (its call counted at ⑮; still synchronous at boot).  B-574d slice «hub-migrations» (lane nl-migrations, 主开发 r4750): −30 RECOUNTED, no debt paid — the migrations' 17 synchronous writes still run on the main thread (each now synced), counted once at the door: their 32 temp writes + renames, one helper's call (migrateContextRowsFile) and the home rename's 2 leave their rows, and src/fd-close.js renameSynced's row (5) turns from not-main to debt. A later hub caller of renameSynced adds nothing here (a helper's callers are followed in its own file only).  B-574d (lane lg-remote-hardening, 主开发 r4760): −4 — the machines' agent updates record and the extra dialing agents record are the store writer's (each its temp write + rename, 2; both «*» rows gone).  B-f276 (s1126, lane login-request-card): −2 — src/harnesses/antigravity.js «*» 16 → 14, its three existsSync became one presenceOf stat.  B-f276 slice s1126 follow (lane lg-providers, 主开发 r5060 (b)): −1 — the learned models list (usage-cache/__models__.json) is the store writer's (its temp, write and rename; the hub's read takes what it owes first; the «*» row of src/server/cli-env.js gone).  B-ddf3 unit 3 (lane bl-vault, r4361; formed again on the release 2.369.420 by r5147): −7 (777 → 770) — a published page's content (4) and a Task Group export (3) are written off the hub's loop now (through the thread pool, synced).  B-574d «browser-stores» commit 1 (lane nl-migrations, 主开发 r5101): −2 — bindings.json on the store writer (its temp write and rename; the folder stays, once a process).  B-0248 unit 2 (lane bl-loop-b, 主开发 r4232; formed again on 7f83d9203 by r4472): −4 — the kept browsers' list is the store writer's (its temp, write, rename and folder; the «*» row gone).  row B-360d (lane bl-browser-b, 主开发 r4522): −3 — the browser trace's sweep: its index rewrite (the temp write and the rename, 2) and its entry writes (1) went async, off the main thread (the module's «*» row 25 → 22).  B-0248 unit 5 (lane bl-loop-b, 主开发 r4147): −4 — the login warnings' record (its temp + rename, 2) and the resource history (its temp + rename, 2) are the store writer's (their «*» rows gone).  B-574d slice «device-bundle-inputs» (lane bl-machines-b, r4806 / r4814): −2 — the migrations' ledger and the OpenCode serve's record: each temp write + rename one call of the device's door now (the door's calls stay counted by name: writeDurable).  B-574d slice «session-and-job-records» (lane bl-jobs, r4811): −7 — the conversation index and the exit tomb onto the store writer (each its tmp write and rename), boot-restore's kept copies (−3).  B-0248 row 5 (主开发 r3322, lane bl-mail): −4 — the attachment ledger owed to the store writer (lruSave's folder and write, 2; lruFlush, its caller, 1; attachmentPut's call of it, 1); 2b (lane bl-jobs, 主开发 r3790): −2 — the torn bytes' synchronous copy at a start left hosts.js and machine-mounts.js (the family helper keeps them off the loop); lane lg-recovery (主开发 r3321, B-0248's first row): −2 — the synced stores' flush (src/sync-store.js: its write and its rename) through the store writer; B-0248 unit 4 (lane bl-loop-b, r3320 / r3883): −10 — the hold road's host cursors (−2, its row gone) and the remote transcripts' whole copies, their records and the fetch's mkdir (src/hosts.js 30 → 22) are written by the store writer.  B-0248 (lane bl-loop-b, r3320): −2 — the For-you list's write onto the store writer;  B-0248 unit 3 (lane bl-loop-b, r3320 / r3651): −4 — the desktop keeper's paired machines' file is written by the store writer (its temp + rename, mkdir off the loop; the keeper's row gone).  the sweep's fail-closed law (lane bl-windows, 主开发 r3006): −1 — the kept browsers' load sets nothing aside (its rename made the file «not there» to the boot sweep); lane bl-windows (the reset-credit hotfix's follow, r2973): −3 RECLASSIFIED, no debt paid — the attempts' save (persistResetCreditTries) is now its own DURABLE row (money, on disk before the request goes out); lane bl-mail (B-92fc, 主开发 r2819): −3 — the purge's synchronous removals left the loop (fs.promises.rm). lane bl-mail (B-360d r1360): −4 — the vendor-search memo and the feed-miss memo owed to the store writer (its thread makes the account's directory; the 3 loop holds of the owner's digest were that mkdir). B-0248's next part (lane lg-vault-env, r2417): −3 — decision-engine.js «*» 3 → gone (the journal's append, the trim's write and rename: the journal through the store writer). Before: lane lg-group-parents B-360d part 3: −3 — usage-pool-engine.js «*» 12 → 10 (the archive's whole-read roll gone), usage-routes.js «*» 12 → 10 (usage-cache.json through the store writer), + the roll's one rename (src/archive-roll.js). Before: lane lg-vault-env (B-0248 step 3 (c)): −2 — task-groups.js's «*» row 11 → 9 (the Activity log's archive append through the store writer). row B-360d (lane hub-loop-stalls; moved onto the .416 root 0cc12963d: its 835 − 1 = 834): −1 — the OTel stash's trim rename onto the store writer's thread; lane bl-loop-b (B-0248 step 3): −1 — src/jobs.js's «*» row 16 → 15 (the archive's whole write onto the store writer). lane bl-scratch (B-ddf3 unit 2 line 1, r1407): −5 — the CLI's own settings files are written by the shipped helper, a child (src/harness-config.js re-classed not-main, its count kept). lane bl-loop-b (B-0248 (a)+(b)): −6 — persistence.js's «*» row 16 → 10 (the rollback points and the desktops through the store writer). lane bl-loop-b (B-0248 (c)): −4 — persistence.js's «*» row 20 → 16 (the conversation list, the bookmarks and the custom themes written by the store writer: no data-folder make at each write). B-f276 1b (bl-windows): −1 — the channels' torn-file set-aside at the load (held by src/store-hold.js now); lane bl-scratch (B-ddf3 unit 1): −2 — the Gmail message copy is written and renamed on the thread pool (its writeFileSync and renameSync gone). lane bl-keys-misc (B-360d): −1 — the jobs' collection pass removes its old spill files off the loop (fs.promises.unlink: the synchronous unlink gone). lane lg-store-writes (B-225b, the persistence holds — cut 4): −1 — the settings onto src/store-hold.js's one write; cut 3: −3 — the desktops (layouts.json), the bookmarks and the custom themes onto src/store-hold.js's one write; cut 2: −2 — the conversation list (user-state.json) onto src/store-hold.js's one write (its normalizer's write-back and its whole write: the hold refuses a list it could not read); before: lane lg-store-writes (主开发 2026-11-20 03:10Z, the measured holds after 2.369.412): −4 — desktop-serve's record file onto the store writer on the hub (its device road classed not-main), −2 — device-alerts' ledger onto the writer ⇒ 868 − 6; before: usage-cpu U4 (moved onto 2.369.412's second checkpoint 8f96c01eb): −2 — otel-ingest's per-post stash append (mkdirSync + appendFileSync) moved onto the store writer ⇒ 870 − 2 = 868. Before: lane lg-providers U1 cure (restack on int411): −1 — src/server/provider-store.js's write moved onto the store writer (its debt row gone) ⇒ 871 − 1 = 870; int411 seam (2026-11-18, both falls kept by arithmetic: 881 − 8 − 2 = 871) — the two lines above: −8; B-3767 unit 2 (restack 2.369.412): −2 — the codex zst cache's and HostManager's ssh control folder's own mkdirSync left their files (the one ensureSocketDir site is src/sock-path.js's row); was 881. Before: int410 seam (rule 2, 2026-11-18): both falls kept (893 − 10 − 2 = 881) — lane bl-windows batch-4 cure: −2 — the layout-history prune's two unlinks went async (persistence.js 28 → 26); then lane lg-store-writes U3 (B-0248): −2 — src/channel-store.js's wake-pace and dispatch ledgers through owe() (paceFlush / dispatchFlush rows gone); U2: −2 — src/turn-carry.js's outstanding table handed to the writer (its row gone); U1: −6 — src/server/decision-engine.js's memo and day's counter handed to the writer (its writeJsonAtomic ×4 + the helper's write and rename); was 893. Was 516 — lane job-logs-sweep r3: −2 — jobs.js's two load-failure set-aside renames moved into JobManager._logsHeldFile, a durable row (the failed load's fact on disk); on .397's 518 (hub-sync-holds −2) ⇒ 516 [moved onto the .414 train: its own 850 -1 = 849]
// [file, scope, n, class, other readers, what a lost last write costs, why]
const ROWS = [
  ["src/agy-store-fs.js","*",1,"debt","—","—","newly seen (channel-store-off-loop, commit 1: the census counts mkdirSync, openSync for write / append, rmSync and unlinkSync): a directory made, a file opened for write or removed on the main thread — onto the store writer when its store is next touched"],
  ["src/app-secrets.js","*",1,"debt","—","—","newly seen (channel-store-off-loop, commit 1: the census counts mkdirSync, openSync for write / append, rmSync and unlinkSync): a directory made, a file opened for write or removed on the main thread — onto the store writer when its store is next touched"],
  ["src/app-system-serve.js","*",2,"debt","—","—","newly seen (channel-store-off-loop, commit 1: the census counts mkdirSync, openSync for write / append, rmSync and unlinkSync): a directory made, a file opened for write or removed on the main thread — onto the store writer when its store is next touched"],
  ["src/browser-facts.js","*",3,"debt","—","—","newly seen (channel-store-off-loop, commit 1: the census counts mkdirSync, openSync for write / append, rmSync and unlinkSync): a directory made, a file opened for write or removed on the main thread — onto the store writer when its store is next touched"],
  ["src/browser-verbs.js","*",1,"debt","—","—","newly seen (channel-store-off-loop, commit 1: the census counts mkdirSync, openSync for write / append, rmSync and unlinkSync): a directory made, a file opened for write or removed on the main thread — onto the store writer when its store is next touched"],
  ["src/claude-oat-trampoline.js","*",1,"debt","—","—","newly seen (channel-store-off-loop, commit 1: the census counts mkdirSync, openSync for write / append, rmSync and unlinkSync): a directory made, a file opened for write or removed on the main thread — onto the store writer when its store is next touched"],
  ["src/routes/window-targets.js","*",1,"debt","—","—","newly seen (channel-store-off-loop, commit 1: the census counts mkdirSync, openSync for write / append, rmSync and unlinkSync): a directory made, a file opened for write or removed on the main thread — onto the store writer when its store is next touched"],
  ["src/server/account-usage-routes.js","*",1,"debt","—","—","newly seen (channel-store-off-loop, commit 1: the census counts mkdirSync, openSync for write / append, rmSync and unlinkSync): a directory made, a file opened for write or removed on the main thread — onto the store writer when its store is next touched"],
  ["src/server/apps-ops-door.js","*",1,"debt","—","—","newly seen (channel-store-off-loop, commit 1: the census counts mkdirSync, openSync for write / append, rmSync and unlinkSync): a directory made, a file opened for write or removed on the main thread — onto the store writer when its store is next touched"],
  ["src/server/browser-attach-launch.js","*",5,"debt","—","—","newly seen (channel-store-off-loop, commit 1: the census counts mkdirSync, openSync for write / append, rmSync and unlinkSync): a directory made, a file opened for write or removed on the main thread — onto the store writer when its store is next touched"],
  ["src/server/sealed-json.js","*",2,"debt","—","—","newly seen (channel-store-off-loop, commit 1: the census counts mkdirSync, openSync for write / append, rmSync and unlinkSync): a directory made, a file opened for write or removed on the main thread — onto the store writer when its store is next touched"],
  ["src/server/wrapper-files.js","*",3,"debt","—","—","newly seen (channel-store-off-loop, commit 1: the census counts mkdirSync, openSync for write / append, rmSync and unlinkSync): a directory made, a file opened for write or removed on the main thread — onto the store writer when its store is next touched"],
  ["src/sock-path.js","*",1,"debt","—","—","newly seen (channel-store-off-loop, commit 1: the census counts mkdirSync, openSync for write / append, rmSync and unlinkSync): a directory made, a file opened for write or removed on the main thread — onto the store writer when its store is next touched"],
  ["src/usage-estimator.js","*",1,"debt","—","—","newly seen (channel-store-off-loop, commit 1: the census counts mkdirSync, openSync for write / append, rmSync and unlinkSync): a directory made, a file opened for write or removed on the main thread — onto the store writer when its store is next touched"],
  ["src/ws-handler.js","*",2,"debt","—","—","newly seen (channel-store-off-loop, commit 1: the census counts mkdirSync, openSync for write / append, rmSync and unlinkSync): a directory made, a file opened for write or removed on the main thread — onto the store writer when its store is next touched"],
  ["src/store-writer.js","*",4,"exit","—","—","channel-store-off-loop (commit 1, newly seen): the store writer's OWN synchronous road — a failed write's temp removed on the main thread (writeHere) and a forgotten store's file removed when the writer has no thread (postUnlink, its two callers)"],
  ["src/adapters/codex.js","*",4,"debt","—","—","round 2 (newly scanned): the codex adapter's plain copy of a transcript — a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/agentd/client.js","*",12,"durable","—","NOT idempotent: the device agent's local token and proof — a lost write is a device that cannot prove itself","round 2 (newly scanned, required by server.js): the local device's token / proof / install — must be on disk before the answer; +1 lane lg-remote-hardening (unit 5's cure): this box's own road clears a hub pin an ssh road left (state/hub.pub, unlinked once)"],
  ["src/channels/fake.js","*",1,"debt","—","—","round 2 (newly scanned): the FAKE channel adapter (suites and a demo account) — a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/channels/webhook.js","*",10,"debt","—","—","round 2 (newly scanned): the webhook adapter's own atomic writer (writeJsonAtomic ×3 + its 2 callers) and its queue append — a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/harnesses/antigravity.js","*",14,"debt","—","—","round 2 (newly scanned): seeding the CLI's home at a spawn (seedHomeRoot + its 2 callers) — a store's synchronous write on the main thread — onto the store writer when its store is next touched. B-f276 (s1126, lane login-request-card): 16 → 14, its three existsSync became one presenceOf stat (nothing written moved)"],
  ["src/harnesses/claude-home.js","*",3,"debt","—","—","round 2 (newly scanned): a claude home moved / relinked — a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/harnesses/claude.js","*",1,"debt","—","—","round 2 (newly scanned): seeding a claude config dir at a spawn — a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/harnesses/codex.js","*",3,"debt","—","—","round 2 (newly scanned): seeding a codex config dir at a spawn — a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/harnesses/codex-models.js","*",2,"debt","—","—","round 2 (newly scanned): the codex model catalog's cache — a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/plugins/frp.js","*",16,"debt","—","—","round 2 (newly scanned): the frp plugin's install / config / admin password files — a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/plugins/tailscale.js","*",9,"debt","—","—","round 2 (newly scanned): the tailscale plugin's install / state files — a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/cli-self-measure.js","*",4,"durable","—","a lost PASS / FAIL record ⇒ the measurement runs again at the next sight of that build (a token member held meanwhile)","lane cli-self-measure (.393; classified at hub-loop-stalls commit 2's rebase): data/cli-self-measure.json — whether a CLI build may use the long-lived token (authority), written synchronously at every transition by its one writer, small"],
  ["src/server/dropline-oauth.js","*",4,"durable","—","NOT idempotent: an OAuth token — a lost write is a sign-in lost","round 2 (newly seen: a helper-local write): the voice provider's token file — must be on disk before the answer"],
  ["src/spawn/dial.js","*",2,"debt","—","—","round 2 (newly scanned): a spawn's launch script for a dialled host — a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/spawn/ssh.js","*",3,"debt","—","—","round 2 (newly scanned): a spawn's launch script over ssh — a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/cli-model-catalog.js","*",4,"debt","—","—","2.369.390 (cli-update-needs-nothing): the model catalog's ledger, written whole (tmp + rename) — re-read from the installed binary; small — onto the store writer when its store is next touched"],
  ["server.js","*",4,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/account-material.js","*",20,"durable","—","NOT idempotent: money / authority / a credential","an account's credential files — must be on disk before the answer (lane bl-loop-b r2822 / r2928, +13: the merge's guarded swap — its own writes (the aside's rename, the put-back's unlink, the no-hard-link copy and its sync, the settled aside's unlink: 5), the settled aside's rest written (writePrivateFile: 1) and its four derived helpers' calls (swapSync 1, putBackSync 2, copyIntoSync 2, settleAsideSync 2: 7))"],
  ["src/accounts.js","*",28,"durable","—","NOT idempotent: money / authority / a credential","accounts and their credential links — must be on disk before the answer (B-87fd identity unit 3 −1, moved onto the train: the relogin's moves (out, held, back; r2822, lane bl-loop-b, +1: a merge whose survivor's file stood archives the folded row's file — a rename in its own dir; lane lg-store-writes, B-574d unit 1 (a), 主开发 r3455 / r3486: 27 → 25 on the train — accounts.json itself onto the store writer; a person's account act answers after its landing: account-usage-routes.js's /api/accounts door, the config import, the mint's save) (the follow, r3977 (3): +3 — each new member's row created on the synchronous road removes its empty folder when that landing fails)"],
  ["src/app-secrets-seal.js","*",6,"not-main","—","—","a child CLI src/secret-service.py runs (B-694d +3: the temp file written through its own fd, fsynced, and the folder fsynced after the rename)"],
  ["src/app-serve.js","*",3,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched; B-574d: the index (writeManifest) is one call of the device's door now (writeDurable, synced; a person's act or a reconcile that changed it), the last scan and the witness list stay writeJsonAtomic (derived)"],
  ["src/browser-serve.js","*",11,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/channel-outbox-files.js","*",8,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/channel-store.js","journal",2,"durable","—","a stamp a kill took reads as «never polled» after the restart: a restored window fetches that row at once and a vendor refusal holds every NEW conversation back (the 2.369.203 incident)","channel-store-off-loop: THE NAMED EXCEPTION — the poll-stamps journal's append on its kept descriptor (and its open, once a process) STAYS on the main thread: it survives a process kill in the page cache the moment it returns; the writer's queue would lose it. The field never named it"],
  ["src/channel-store.js","foldJournal",2,"durable","—","a fold lost replays the same stamps over the side file at the next start (idempotent lines); a fold that cut a newer line would lose that stamp — it runs only when no stamp was set since the side file's bytes were made","channel-store-off-loop: the named exception's second call — the journal truncated on its kept descriptor once the side file holding every line is on disk"],
  ["src/channel-store.js","attachmentPut",1,"debt","—","—","LISTED (channel-store-off-loop, commit 1): a row that only falls — not moved in this unit: a fetched attachment's meta file (B-0248 row 5: −1, its ledger save owed to the store writer)"],
  ["src/channel-store.js","avatarPut",1,"debt","—","—","LISTED (channel-store-off-loop, commit 1): a row that only falls — not moved in this unit: an avatar's meta file"],
  ["src/channel-store.js","avatarRefuse",2,"debt","—","—","LISTED (channel-store-off-loop, commit 1): a row that only falls — not moved in this unit: an avatar refusal's meta — its directory and its write"],
  ["src/channel-store.js","searchMemoDrop",1,"debt","—","—","LISTED (channel-store-off-loop, commit 1): a row that only falls — not moved in this unit: the vendor-search memo removed with its account"],
  ["src/channel-store.js","feedMissDrop",1,"debt","—","—","LISTED (channel-store-off-loop, commit 1): a row that only falls — not moved in this unit: the feed-miss memo removed with its account"],
  ["src/channel-store.js","appendRecords",2,"debt","—","—","LISTED (channel-store-off-loop, commit 1): a row that only falls — not moved in this unit: a conversation's message log — its directory and the append (appendLines)"],
  ["src/channel-store.js","appendLines",1,"debt","—","—","LISTED (channel-store-off-loop, commit 1): a row that only falls — not moved in this unit: the message log's append (open for append)"],
  ["src/channel-store.js","writeAll",1,"debt","—","—","LISTED (channel-store-off-loop, commit 1): a row that only falls — not moved in this unit: the message log append's every-byte loop"],
  ["src/channel-store.js","prependRecords",3,"debt","—","—","LISTED (channel-store-off-loop, commit 1): a row that only falls — not moved in this unit: a backfill's prepend — the log rewritten (directory, temp, rename)"],
  ["src/channel-store.js","rewriteRecords",2,"debt","—","—","LISTED (channel-store-off-loop, commit 1): a row that only falls — not moved in this unit: a record rewritten in its log (temp, rename)"],
  ["src/channel-store.js","trim",2,"debt","—","—","LISTED (channel-store-off-loop, commit 1): a row that only falls — not moved in this unit: a log trimmed to its retention (temp, rename)"],
  ["src/channel-store.js","appendSide",2,"debt","—","—","LISTED (channel-store-off-loop, commit 1): a row that only falls — not moved in this unit: a conversation's side log — its directory and the append"],
  ["src/channel-store.js","trimSide",2,"debt","—","—","LISTED (channel-store-off-loop, commit 1): a row that only falls — not moved in this unit: a side log compacted (temp, rename)"],
  ["src/channel-store.js","audit",3,"debt","—","—","LISTED (channel-store-off-loop, commit 1): a row that only falls — not moved in this unit: the audit log's appends and its daily roll"],
  ["src/channel-store.js","outboxPrune",1,"debt","—","—","LISTED (channel-store-off-loop, commit 1): a row that only falls — not moved in this unit: a pruned proposal's files removed inside the outbox's door (dropOutboxFiles)"],
  ["src/channel-store.js","dropOutboxFiles",1,"debt","—","—","LISTED (channel-store-off-loop, commit 1): a row that only falls — not moved in this unit: a proposal's attachment folder removed (rmSync)"],
  ["src/channel-store.js","*",5,"debt","—","—","(B-92fc: −3 — an account's purge removes its folders on the thread pool, off the loop) (B-f276 1b: −1 — a torn file is HELD by src/store-hold.js now, its one door's set-aside the hold's own) the store's own directories at its creation, the index's verify line, an account's purge, and writeJsonAtomic's own body — a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/codex-fork-ledger-purge.js","*",3,"debt","—","—","B-574d «usage-ledger-repairs» (lane nl-migrations): −2 — _writeAtomic's write + rename through src/fd-close.js renameSynced (its call still counted: _writeAtomic is one of the four named helpers). one-shot migration (once in the data dir's life, in the listen callback — after the first turn, so not «boot»): debt"],
  ["src/desktop-display.js","*",5,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/desktop-serve.js","*",10,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched (lane lg-store-writes, 主开发 2026-11-20 03:10Z: the record file's save moved onto the writer on the hub, 14 → 10 — the device road is its own rows)"],
  ["src/desktop-serve.js","writeJsonAtomic",2,"not-main","—","—","the record file written at the call ONLY by a paired device's agent (the daemon bundles this module; the hub's keeper hands its store writer — src/server/desktop-app-keeper.js)"],
  ["src/desktop-serve.js","writeAtCall",2,"not-main","—","—","the device agent's road ONLY (its folder made, the record file written at the call — the hub's save hands the bytes to the writer, makeDir: true)"],
  ["src/dir-ops.js","*",4,"not-main","—","—","the folder field's disk ops run on a WORKER only (the hub's SafeFs worker; a paired machine's agent, the collector's own pool — r1636 / r2752): pkgOf's open is a READ (O_RDONLY | O_NONBLOCK — a constant, so counted), and the suites' seams write their markers — the dead path's two, the worker that ends its once-marker (VIBESPACE_DIROPS_TEST=1 only)"],
  ["src/exit-proxy.js","*",4,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/fd-close.js","renameSynced",5,"durable","—","a failed write, sync or close is thrown to its caller and the old file stands (the hub's rare synchronous acts and starts; a wrapper's record the hub reads)","B-574d (主开发 r4957): DURABLE — the RULED synchronous form, a sync paid on purpose; each CALLER's own row carries its judgement by the rate rule (a person's act, the start, a save the code bounds to a rare event: ruled; anything else that caller's debt, counted there), so the debt counts callers, never the door; the hub calls it on its loop since B-574d (src/server/migrations.js replaceSynced, src/server/home-rename.js, the usage ledger's repairs, the prices' save — named at ⑮). B-bcb8 unit B (lane bl-jobs, 主开发 r4367): renameSynced — a WRAPPER's record under data/ (the job's run folder: pid / exit / bound; a conversation's buffers: the meta sidecar, the buffer, the handed records), written by the wrappers under data/bin, off the hub's main thread — the hub itself calls it for its one-shot migrations' writes (B-574d, lane nl-migrations: src/server/migrations.js replaceSynced, src/server/home-rename.js rewriteStores + its data marker), the usage ledger's run-once repairs, the hourly sidecar repair (only on a disagreement) and the prices' save (a person's act) — «usage-ledger-repairs»: the temp opened, written, synced ONCE (the two buffers: none on any road, the caller's named choice — r4563 + r4578), renamed; r4474 +1: the temp removed after a failed write (a failed write, sync or close — the old record stands)"],
  ["src/fixture-ledger-purge.js","*",12,"debt","—","—","B-574d «usage-ledger-repairs» (lane nl-migrations): −2 — _writeAtomic's write + rename through src/fd-close.js renameSynced (its mkdir keeps it a helper). one-shot migration (once in the data dir's life, in the listen callback — after the first turn, so not «boot»): debt"],
  ["src/gmail-sync.js","*",4,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/harness-config.js","*",12,"not-main","—","—","B-ddf3 unit 2 line 2: +7 — each commit opens its temp again (r+), syncs it and closes it (×2: commitWrite, commitCreate), and one unlink removes the temp when the sync fails. B-ddf3 unit 2 line 1 (lane bl-scratch, r1407): the SHIPPED helper's writes (data/bin/vibespace-hook-register.mjs embeds this file) — run as a child through the starter on the hub's own machine (src/server/cli-config-runner.js) and on every paired machine; the hub's process calls none of them"],
  ["src/hosts.js","*",21,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/claude-oat-probe.js","*",35,"not-main","—","—","row B-437e U0 (+5: the checkpoint pair's scratch — its variant dir cleared, its home, its fake member's file and link, its note — in the run's own scratch, the forked child or the release script) · lane cli-self-measure (+1, lane readings-attribution-2 P0: the mid-turn variants' scratch note in the run's own scratch; .393; classified at hub-loop-stalls commit 2's rebase): the long-lived-token measurement runs only in its OWN process — the release script, or the hub FORKS it (src/server/cli-self-measure.js) — over a scratch HOME · + lane oat-add-door: the mint variant's own scratch dir (runMint: rmSync before, its mkdir) — the variant's scratch like every variant's, in the measurement's own process"],
  ["src/incident.js","*",13,"not-main","—","—","runs in the incident freeze worker (src/server/incident-freeze-worker.js)"],
  ["src/job-logs-sweep-worker.js","*",18,"not-main","—","—","lane job-logs-sweep round 2 (B-323e +8 — r1283 (4): the parent check's refusal line, fs.writeSync to fd 1 (synchronous on every platform, the child exits right after); +7: the bounded open's flags are not a literal — a read, O_RDONLY | O_NOFOLLOW | O_NONBLOCK, counted as any non-literal flags are, and bounded() is a DERIVED helper whose three calls (a batch's request file, a cut sweep's count, the boot read's count files) count too; its batch's request file removed once read; a leftover request file removed by the sweep's walk; a count file's cut .tmp removed by forget — and the count file is rewritten by temp + rename after EVERY removal, at the two sites the orphan file had; r3 §8 +1: a catch-up record that does not parse, set aside by rename; r4 +1: a record store's NOTE <store>.corrupt-unread, written O_EXCL here — never on the hub's main thread): the job-logs remover's CHILD process (src/job-logs-sweep.js starts it through the starter, one batch a child — B-323e; it throws without --once) — a remover whose hub ended leaves its counts in <dataDir>/jobs-remover-orphan-<pid>-<seq>.json (temp + rename), read and forgotten by the next engine"],
  ["src/input-inject.js","*",2,"not-main","—","—","runs inside the device agent (src/agentd/agentd.js)"],
  ["src/jobs.js","*",15,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched (lane bl-loop-b, B-0248 step 3: −1 — the archive's whole write (jobs-archive.json) onto the store writer, its records released at its landing; the lock file at the start stays, once a process; lane job-logs-sweep r3 −2: the two loads' set-aside renames moved into JobManager._logsHeldFile, a durable row; lane lg-store-writes U4 (B-0248) −3: _save / _saveNotifs hand jobs.json and job-notifications.json to the writer; the exit's lock removal, moved behind the store's landing, is still ONE call (_unlockNow) — left: the engine lock's write and its removals, a run's stop.json, the spawn's run dir and spec, the spills)"],
  ["src/jobs.js","JobManager._logsHeldFile",2,"durable","—","NOT idempotent: a job record store whose read FAILED — a lost set-aside (rename, else copy) is the job-logs clean-up removing the runs those records listed","lane job-logs-sweep round 3 §1: a records read that failed leaves its bytes ON DISK before the load returns — renamed or copied aside; must be on disk before any write of that store (the load's failure branch only: one per failed load). Round 4: the NOTE (nothing to set aside) moved to the remover's child — this process holds until it lands"],
  ["src/jobs.js","JobManager._logsNoteAtExit",1,"durable","—","NOT idempotent: a lost note is the next start not knowing those records could not be read — its clean-up may remove the runs they listed","lane job-logs-sweep round 4 §1: a note the remover's child had not written by the hub's EXIT — ONE O_EXCL write, before the exit's own write of that store, on a loop that serves nothing any more"],
  ["src/kept-copies.js","*",6,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/said-journal.js","*",2,"not-main","—","—","B-cd4b (the wrapper's hold): runs inside the chat wrappers (data/bin/chat-wrapper.js, codex-chat-wrapper.js — each conversation's own process, never the hub's loop): a said line appended to its own buffer before it is said; the hub uses only its PURE words"],
  ["src/ledger-slot-backfill.js","*",7,"debt","—","—","B-574d «usage-ledger-repairs» (lane nl-migrations): −2 — _writeAtomic's write + rename through src/fd-close.js renameSynced (its mkdir keeps it a helper). one-shot migration (once in the data dir's life, in the listen callback — after the first turn, so not «boot»): debt"],
  ["src/machine-mounts.js","*",6,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/migration-runner.js","*",4,"debt","—","—","one-shot migration (once in the data dir's life, in the listen callback — after the first turn, so not «boot»): debt; B-574d: 5 → 4, the ledger's temp write and rename became ONE call of the device's door (writeDurable, synced)"],
  ["src/mounts.js","*",18,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/child-starter-proc.js","*",1,"not-main","—","—","B-323e (lane bl-machines-b): THE STARTER process (never the hub's main thread): its detached start opens the judged mount log (<dataDir>/mount-logs/<id>.log) for append — the daemon's own output"],
  ["src/server/child-starter.js","*",1,"not-a-store","—","—","B-323e (lane bl-machines-b): the old road's detached start opens the judged mount log for append — the daemon's own output file, never a store's write"],
  ["src/opencode-serve.js","*",8,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched; B-574d: 9 → 8, the serve record's temp write and rename became ONE call of the device's door (writeDurable, synced)"],
  ["src/desktop-mic.js","*",1,"not-main","—","—","the device agent's own process ONLY (required by src/agentd/agentd.js alone): the kept default microphone through the device's door (B-574d)"],
  ["src/opslog.js","*",1,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/plugins.js","*",2,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/port-forward.js","*",3,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/quota-model-migrate.js","*",2,"debt","—","—","one-shot migration (once in the data dir's life, in the listen callback — after the first turn, so not «boot»): debt"],
  ["src/reading-repair.js","*",22,"debt","—","—","B-574d «usage-ledger-repairs» (lane nl-migrations): −2 — _writeAtomic's write + rename through src/fd-close.js renameSynced (its six calls still counted: a named helper); the sidecar repair runs from the hourly identity repair too (only on a disagreement, at most two syncs an account a pass, each one fsync on the main thread). one-shot migration (once in the data dir's life, in the listen callback — after the first turn, so not «boot»): debt"],
  ["src/remote-fs.js","*",2,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/routes/editor.js","*",2,"not-a-store","—","—","a person's own file (the editor's save)"],
  ["src/routes/files.js","*",20,"not-a-store","—","—","a person's own files (the file explorer); ckpt61 cure 3: + the archive entry's temp folder removed on its two new refusals (a reader that never started, a write that failed); B-574d (lane nl-journals): 21 → 19 — the extraction journal's mark goes through src/fd-close.js renameSynced (synced; its write and rename are the door's); r4828 +1 (20): its temp removed when the write failed — the door keeps it on a failed rename"],
  ["src/routes/persistence.js","*",10,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched (bl-windows batch-4 cure: the layout-history prune's two unlinks went async, 28 → 26; lane bl-loop-b, B-0248 (c): the conversation list's, the bookmarks' and the custom themes' writes are the store writer's — they no longer make the data folder at each write, the start read made it: 20 → 16; B-0248 (a)+(b): the rollback points and the desktops are the store writer's too — the module's own atomic writer, its temp, its rename and the points' folder go: 16 → 10)"],
  ["src/safe-fs-worker.js","*",13,"not-main","—","—","the SafeFs worker thread"],
  ["src/search-index-worker.js","*",3,"not-main","—","—","the search index worker thread"],
  ["src/secret-box.js","*",6,"durable","—","NOT idempotent: money / authority / a credential","a store key file (secrets) — must be on disk before the answer"],
  ["src/secret-file.js","*",9,"durable","—","NOT idempotent: money / authority / a credential","a secret file (secrets) — must be on disk before the answer (B-dc3f r1148 +3: the temp file opened for write and synced BEFORE its rename, the folder synced after)"],
  ["src/signin-witness.js","*",2,"durable","—","idempotent: a fact the next start learns again","B-dc3f (1): the sign-in witness's folder (mkdir 0700, in the CLI index's persistent place) and its removal (the sign-in turned off) — at the person's act after the sign-in file is on disk, and at the start; the witness itself is written through replaceShredding (secret-file.js)"],
  ["src/server/agent-tool-generators.js","*",30,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/apps-engine.js","*",3,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/auto-cli-loop.js","*",6,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/auto-resume.js","*",3,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/automation-engine.js","*",7,"durable","—","NOT idempotent: money / authority / a credential","automation keys (authority) — must be on disk before the answer"],
  ["src/server/boot-restore.js","*",11,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched. ROUND 4 (item 7), NAMED DEBT with its measured cost: the .json.stopped copies of dead conversations at a boot — 25 dead = 60 s of main-thread hold at 1.2 s a call (master's code, unchanged here). B-574d (lane bl-jobs) −3: those copies are THE STORE WRITER's now (keepCopy: writeJsonAtomic's temp write, its rename and its one call gone)"],
  ["src/server/browser-bindings.js","*",1,"debt","—","—","B-574d «browser-stores» (lane nl-migrations, 主开发 r5101): −2 — bindings.json on the store writer (one document a file across the instances, every change handed to the writer as an act); left: its folder made once a process (mkdirSync, its mode checked)"],
  ["src/server/browser-builds-keeper.js","*",19,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/browser-cli-install.js","*",10,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/browser-display-config.js","*",6,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/browser-env.js","*",12,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/browser-installs.js","*",5,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/browser-keeper.js","*",22,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched (lane lg-store-writes U5b (B-0248) −2: save hands browser-profiles.json to the writer, its directory's mkdir gone — left: the takeover requests, the audit log, the machine / display configs, the CLI pin, the lineage journal)"],
  ["src/server/browser-passkey-file.js","*",1,"debt","—","—","the passkey store's synchronous write (r3261: moved verbatim out of src/server/mounts-plugins-wiring.js — the read law's unit left the write as it was) — onto the store writer when its store is next touched"],
  ["src/server/browser-logins.js","*",2,"durable","—","a lost reminder mark ⇒ an aged unconfirmed login files its For-you reminder card again at the next unlock","lane vault-login (.399; classified on .398 rebase): data/browser-login-reminders.json — DEK-keyed HMAC marks of aged pending logins already reminded (≤ 4096 × 32-hex, mode 0600), written once when a reminder fires without touching vault.json, small"],
  ["src/server/browser-trace.js","*",22,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched (row B-360d, r4522: 25 → 22 — the sweep's index rewrite and its entry writes went async, off the main thread)"],
  ["src/server/channel-api-cards.js","*",3,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/channel-api.js","*",6,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/channels-attention.js","*",2,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/claude-signin.js","*",3,"durable","—","NOT idempotent: money / authority / a credential","a sign-in's credential files — must be on disk before the answer"],
  ["src/server/cli-registration.js","*",3,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/cli-unmeasured-notice.js","*",1,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/conversation-deliver.js","*",7,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/csp-reports.js","*",4,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched; B-574d (lane nl-journals): 5 → 3 — the re-judge's rewrite goes through src/fd-close.js renameSynced (synced; its write and rename are the door's): the appends and the rotation stay, the debt; r4828 +1: the temp removed on a failed rewrite (no temp left on any road). THE BOUND of the re-judge's synchronous rewrite on the loop: ONCE A PROCESS (rejudging set once, never reset), at most two files, only on a hub that met the sanitizer bug — test-csp-report holds it"],
  ["src/server/design-engine.js","*",1,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/desktop-access.js","*",1,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/desktop-handover-engine.js","*",1,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/host-keys.js","*",4,"durable","ssh (its UserKnownHostsFile)","a lost write = a pinned machine whose ssh refuses every key until the boot heal rewrites the file from hosts.json (fails closed)","lane lg-remote-hardening (B-7f0b): a machine's host-key pin is a TRUST decision the person made — on disk before the next ssh reads it (small, rare: a pin, an unpin, the boot heal)"],
  ["src/server/dial-pairing.js","*",5,"durable","—","NOT idempotent: money / authority / a credential","a pairing secret (authority) — must be on disk before the answer"],
  ["src/server/doc-engine.js","*",3,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/feedback-forward.js","*",3,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/feedback-store.js","*",3,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/grants-migration.js","*",2,"durable","—","NOT idempotent: money / authority / a credential","grants' one-shot reshape (authority) — must be on disk before the answer"],
  ["src/pool-pin-record.js","*",4,"durable","—","a lost write = the person's last choice (a pin, or «automatic») lost to a stop — the pin route refuses by name when it cannot write","lane lg-group-parents B-526c unit 2 (its cure, r1070): the person's pool pin AND its clear, on disk before the answer (symlink + rename into data/pool-pins — a clear writes its mark, never removes —, a failed rename's rollback; the boot sweep's unlink of a gone conversation's record) — tiny, rare (one per press)"],
  ["src/server/grants-store.js","*",7,"durable","—","NOT idempotent: money / authority / a credential","grants — who may use a resource (authority) — must be on disk before the answer; lane lg-group-parents B-526c: + a channel watch entry's watcher SETTINGS, a rule row's account and pattern, a watch row's agent blocks — the Access dialog's act is durable HERE (the channel index's copy is paced, the boot completes it)"],
  ["src/server/home-rename.js","*",1,"debt","—","—","B-574d (lane nl-migrations): −2 — the recorded-path rewrite's temp write + rename go through src/fd-close.js renameSynced (synced; its sites are that row); its follow (主开发 r4866 / r4897): a store whose rewrite failed is tried again at each later start while it is owed; the data marker now through renameSynced too (−1: its bytes say owed or done). B-8033 (moved whole from server.js migrateHomeRename — its 4 sites, the debt unchanged): the one-shot home-rename migration at boot — a store's backup, its tmp + rename, the data/ marker; the HOME marker goes async (fs.promises)"],
  ["src/server/throwaway-root.js","*",4,"not-a-store","—","—","B-ba47 shape H: NO STORE — the throwaway hub's own home made at its boot's first act, once, before the hub listens: <root>/.home (0700), its .ssh folder and its ssh wrapper (sshOnOwnFiles, and its one call)"],
  ["src/home-links.js","*",1,"not-a-store","—","—","B-ba47: NO STORE — a re-homed PATH's own folder (<new home>/.vs-bin) made at a re-home, once: a throwaway hub's first act (src/server/throwaway-root.js) or a suite's import (scripts/scratch.mjs)"],
  ["src/server/hook-root-watch.js","*",2,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/host-tokens.js","*",7,"durable","—","NOT idempotent: money / authority / a credential","a machine's token (authority) — must be on disk before the answer; + lane lg-remote-hardening D3b: THIS hub's own key before the vault (data/agentd/hub-identity.pem: an exclusive first mint, the person's renew)"],
  ["src/server/incident-freeze-worker.js","*",1,"not-main","—","—","the incident freeze worker thread"],
  ["src/server/rewind-keep-worker.js","*",21,"not-main","—","—","the kept copy's keep worker thread (row B-437e; U3 +5: the kept lines written — the folder, the temp, its sync, its rename, the temp removed on a failure; its round wqdnv452s: +1 the manifest's rename over its temp, +1 a put-back's stale temp removed before its copy, +2 the two temps fsynced before their renames): src/server/rewind-kept-door.js's one-worker «rewind-keep» SafeFs pool — the press folder and its mark, each kept copy, the manifest, the sweep's removal, a put-back by a temp name"],
  ["src/signin-witness-worker.js","*",8,"not-main","—","—","B-dc3f (1) H1 (主开发 r3030, round wefspq2j3): the sign-in witness worker thread (its own «signin-witness» SafeFs pool, server.js) — the network home's witness copy: its folder made 0700, the copy written 0600 through a temp opened wx, synced and renamed over it (the temp removed on a failure), the folder opened and synced after the rename (best effort); netRemove unlinks this machine's one name. Never the main thread"],
  ["src/server/incident-wiring.js","*",2,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/instance-url.js","*",3,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/integration-store.js","*",3,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/local-index.js","*",4,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/migrations.js","*",17,"debt","—","—","B-574d (lane nl-migrations): −33 — the 16 migration writes (each a temp write + its rename, 32) go through src/fd-close.js renameSynced (replaceSynced: synced, still synchronous; their sites are that row, now debt), and migrateContextRowsFile's one call is no helper's call any more (it writes through the door). one-shot migration (once in the data dir's life, in the listen callback — after the first turn, so not «boot»): debt"],
  ["src/server/mounts-plugins-wiring.js","*",1,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],   // r3261 (bl-browser-b): 2 → 1 — the passkey store's write moved, verbatim, into src/server/browser-passkey-file.js (its own row; no debt paid)
  ["src/owner-mark.js","*",9,"durable","—","a mark lost: its folder is LEFT by every later sweep (kept, never removed wrongly)","lg-vault-env r1213: a product temp folder's owner mark (its first file, the write checked) and the marked folder's removal (the mark last, only once nothing else is left) — claude-signin's / oat-mint's scratch under os.tmpdir() (r1213: the scratch removal and its helper `wipe` moved here — claude-signin 6→3, oat-mint 5→1; here 9: the mark\'s open + write, ownerOf\'s open (its flags are no literal), sameBytes\' open, the rm, the opener\'s unlink, the mark\'s unlink, and sweepable\'s two calls) — r1275: sweepable's calls of ownerOf and sameBytes (sameBytes opens through one fd, its flags no literal), the opener's unlink second to last; provenDead is gone"],
  ["src/server/oat-mint.js","*",1,"durable","—","NOT idempotent: money / authority / a credential","a minted OAuth token (credential) — must be on disk before the answer"],
  ["src/server/ops-routes.js","*",3,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/otel-ingest.js","*",2,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"], // usage-cpu U4: −2 — the stash's per-post mkdirSync + appendFileSync moved onto the store writer (the token's first write and the trim's rename stay) // row B-360d: −1 — the trim's renameSync went onto the store writer's thread (a rewrite job, in order with the stash's appends)
  ["src/server/plugin-install.js","*",14,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/plugin-loader.js","*",8,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/provider-spawn.js","*",6,"durable","—","NOT idempotent: authority / a credential — a login file left in the child's home is a sign-in it could spend","lane lg-providers U2: a third-party provider's own home (data/provider-homes/<id>/<harness>, 0700) made and its login file removed BEFORE the child spawns — the spawn reads it at once; + B-d578 P1-a (3): a plan's file (OpenCode's one config — the key's NAME, no value) written whole under that home BEFORE the child spawns (its folder made 0700, the file 0600 by tmp + rename) — the child reads it at once, so it is written synchronously, as the home is; + r1159 (1): a failed write removes its temp (nothing left behind)"],
  ["src/server/published-pages.js","*",7,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/session-stdout.js","*",5,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/session-stdout.js","writeSessionMeta",3,"durable","boot-restore, browser-env, usage-routes, channels liveness, weekly-lanes-unfold, reading-repair (each reads the files itself)","NOT idempotent: a live socket without its meta is restored as a stranger","a session's FIRST meta (a new socket) — its UPDATES go through the store writer. Synchronous ON PURPOSE (B-574d, r4818): written in the spawn's own turn it survives a KILL of the hub (it is in the page cache at once), not a power loss before the page cache lands (the socket is then restored as a stranger, never deleted)"],
  ["src/server/spend-guard.js","*",11,"durable","—","NOT idempotent: money / authority / a credential","the unattended-spend budget + its journal (money) + its birth marker (B-23c3: written after every ledger write, so a removed ledger or an older copy is told apart from a first start) — must be on disk before the answer; B-ef83 +7: the ledger's LOCK (data/spend-budget.lock — authority: a lock lost is two processes counting one ledger): its temp linked into place (or created exclusively and written where the folder makes no hard link), a stale lock set aside and removed, and its removal at the process's exit"],
  ["src/store-hold.js","*",11,"durable","—","a person's own store (layouts, the conversation list, bookmarks, themes, settings with the spend caps): a lost write is what the person made","THE STORE HOLD (lane lg-store-writes, B-225b): the ONE write of the persistence stores — whole bytes through a pid temp name, an exclusive create for a store read missing; persistence.js's own rows fall as each store moves onto it (r5185, lane hub-loop-stalls: +3 — the temp opened, written and SYNCED before the rename, a failed write removing it; the plain write gone: one open, one write, one sync, one unlink in, one writeFileSync out)"],
  ["src/server/stash-handover.js","*",2,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/sync-fs-witness-worker.js","*",1,"not-main","—","—","the witness's watchdog thread (its journal line on fd 2)"],
  ["src/store-exit-keeper.js","*",1,"not-main","—","—","round 4 (MUST 2): the writer's exit keeper thread — its ONE line on fd 2 at the exit's bound, then the process ends"],
  ["src/server/tailnet-door.js","*",2,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/tls.js","*",4,"durable","—","NOT idempotent: money / authority / a credential","the TLS certificate + key — must be on disk before the answer"],
  ["src/server/usage-pool-engine.js","persistResetCreditTries",8,"durable","—","NOT idempotent: money — an attempt that may have spent a reset credit","the reset-credit attempts (bl-windows, the hotfix after .416 and its follow, 主开发 r1702 / r2899 / r2973 / r3154): synchronous by ruling, and on disk BEFORE the request can go out — its folder, the written copy (synced: flush), the create-only write after «not there» (where the folder has no hard links: an exclusive open, written whole and synced — open, write, fsync — and removed if that write fails), the copy's removal on every road, the rename"],
  ["src/server/usage-pool-engine.js","*",7,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched (−3 reclassified as durable — the reset-credit attempts' save, r2973; no debt paid)"],
  ["src/server/usage-probe-log.js","*",3,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/user-input.js","*",2,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/vault-engine.js","*",26,"durable","—","NOT idempotent: money / authority / a credential","the vault (sealed entries, the DEK wrap) — must be on disk before the answer"],
  ["src/server/vault-run-door.js","*",25,"durable","—","NOT idempotent: money / authority / a credential","the vault's run door (a use receipt) — must be on disk before the answer; +1 B-a14b (bl-vault, 2026-11-20): the grant ends' set-aside of bytes that did not parse — fs.promises.rename, off the loop, once at the door's start (its saves go through the store writer); r1152 +1: shredDir shreds the door's owner mark LAST, its own call after the other files (a hub ended mid-shred leaves a marked folder the next sweep finishes) — r1275 +1: shredEntry shreds a sub-folder the run's program made one level down (two shredFile calls; the loop's own one moved into it); r3002 (d) + its follow (lane lg-vault-env, 主开发 r3325): the grant ends' rename-aside gone into the store-read hold and no side file (the ends held live in memory) — the tree's count at the follow is 25, the census's own reading (its first gate: «the tree has 25»)"],
  ["src/server/vault-totp.js","*",6,"durable","—","NOT idempotent: money / authority / a credential","the vault's TOTP seeds — must be on disk before the answer"],
  ["src/server/vault-use-grants.js","*",4,"durable","—","NOT idempotent: money / authority / a credential","the vault's use grants (authority) — must be on disk before the answer"],
  ["src/server/voice-teach-engine.js","*",1,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/window-targets-engine.js","*",13,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/writes-lost.js","*",4,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched; B-574d (lane nl-journals): 5 → 3 — its temp's write and rename go through src/fd-close.js renameSynced at the EXIT only (主开发 r4761: the record's own write runs off the loop, synced in place — writeAtomicAsync); left here: the folder made, a failed temp removed, the set-aside, and +1 the exit's removal of a write's temp still in flight (the race closed, r4761)"],
  ["src/slot-transitions.js","*",6,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/ssh-key.js","*",3,"durable","—","NOT idempotent: money / authority / a credential","an ssh key (credential) — must be on disk before the answer"],
  ["src/store-writer-worker.js","*",35,"not-main","—","—","the move onto the train +1 (this census's count): the piece road takes B-f276 1b's linked-temp check and exclusive link at its commit, as writeJob does; the writer's own thread (src/store-writer.js starts it — two since the writer unit: the whole lane and the append lane): temp + every byte + close + rename, an append + fsync, an unlink; the writer unit +8: a whole write IN PIECES (pieceJob: the temp's open, and again after its missing directory is made, the sync, the rename, the temp removed on a failure, an unfinished one dropped); B-9275 +1: the temp's fsync before its close and the rename (a store's new bytes on disk before its name points at them); B-48a4 +3: a ring's rotation before an append (the rename to .1) and an append store's missing data dir (its mkdir + the open again). ROUND 3 (law 2): the main thread never runs it at the exit (the exit WAITS for the thread, bounded — the «exit» class is empty: no store byte is written on the main thread at the exit); it runs writeJob only in the writer's main-only mode — its thread died past RESTARTS_MAX an hour, said once («from now on every store is written ON THE MAIN THREAD»), each such write saying it held the loop; B-f276 1b +4: the exclusive create's link, the temp removed after it (dropTemp, its one door), the inode check that knows our own link, and a second name removed before a temp is opened (a store read missing — on the writer's thread); the writer's own thread (src/store-writer.js starts it): temp + every byte + close + rename, an append + fsync, an unlink; row B-360d +6 (+1 at its move onto the .416 train: the REWRITE road removes a temp still linked to the store before its open — B-f276 1b's law, met there): a REWRITE of an append store from its own bytes (the OTel stash's trim — rewriteJob: the temp opened for write, its pieces written, fsync'd, renamed over the file, the directory fsync'd)"],
  ["src/sync-store.js","*",2,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched (lane lg-recovery, 主开发 r3321 −2: the flush's write and rename went to the store writer; what stays is ensureDir, the folder made once at the store's start)"],
  ["src/task-groups.js","*",6,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched (lane lg-store-writes U5 (B-0248) −2: _save hands task-groups.json to the writer; lane lg-vault-env B-0248 step 3 (c) −2: the Activity log's archive APPEND goes to the writer (no mkdir / append at a note) — left: a clear's and an import's one-month rewrite, a group's removal, the export / import files)"],
  ["src/telemetry.js","*",4,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/transcript-service.js","*",4,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/usage-anchors.js","*",2,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/archive-roll.js","*",1,"debt","—","—","B-360d part 3 U2: the refused-readings archive's roll — ONE rename of the live file to its day's shard on the main thread (it was a whole read, an append and an empty write)"],
  ["src/usage-cache-write.js","*",6,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/usage-cache-write.js","setAsideReading",5,"durable","—","NOT idempotent: a person's press sets an unreadable reading file aside and starts the file again — the press answers «set aside» only once the old file is renamed and the new one is in place (a lost step is a file with no reading or the old bytes moved without a new file)","r3200 (lane login-request-card): the person's way out of a reading file that cannot be read — the new file made beside it, the old one renamed aside (nothing deleted), the new one put in place, the two undo steps; once per press, never on a timer"],
  ["src/usage-cache-write.js","keepTornAside",1,"durable","—","NOT idempotent: the only copy of an account's torn reading bytes — it must be on disk BEFORE the reading writes the name again (a lost copy is the damaged bytes gone)","r3136 (lane login-request-card): torn bytes kept aside once per content (`wx`, 0600, beside the account's reading file), only on torn bytes; the read-merge-write stays synchronous by the readings' rule"],
  ["src/usage-history.js","*",10,"debt","—","—","B-574d «usage-ledger-repairs» (lane nl-migrations): −2 — UsageHistory._writeAtomic's write + rename through src/fd-close.js renameSynced (its calls, a named helper's, still counted). a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/usage-ledger-dedup.js","*",19,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/usage-origin-backfill.js","*",5,"debt","—","—","B-574d «usage-ledger-repairs» (lane nl-migrations): −2 — _writeAtomic's write + rename through src/fd-close.js renameSynced (its mkdir keeps it a helper). one-shot migration (once in the data dir's life, in the listen callback — after the first turn, so not «boot»): debt"],
  ["src/usage-routes.js","*",10,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/user-todos.js","*",2,"debt","—","—","the boot's set-aside of a corrupt list (its rename, else its copy) — once, at a boot that finds one. B-0248 (lane bl-loop-b, 主开发 r3320): the list's own write is ON THE STORE WRITER (4 → 2)"],
  ["src/vnc.js","*",4,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/webdav.js","*",2,"not-a-store","—","—","a person's own files (/dav)"],
  ["src/weekly-lanes-unfold.js","*",3,"debt","—","—","one-shot migration (once in the data dir's life, in the listen callback — after the first turn, so not «boot»): debt"]
];

/** the tree's sites → [{file, scope}] (one per call) */
// ROUND 2 (smaller 4): THE CENSUS'S BLIND SPOTS — every main-process directory (not only src/, src/server/, src/routes/:
// src/channels, src/harnesses, src/adapters, src/spawn, src/plugins, src/lib, src/agentd/client.js — the device daemon's
// own files run in ANOTHER process), every road to an fs write: `fs.x(`, `fs['x'](`, an alias (`const fsx = require('fs')`,
// a parameter defaulting to `fs`), a destructured name (`const { writeFileSync: w } = require('fs')`), and a DERIVED helper
// (a function that writes a path its caller passes) called by name — each caller is a site of its own.
// round 3 (smaller 6c): every MAIN-process directory — the four the round-2 census still skipped (app-kinds, browser-backends,
// mount-providers, agent-routes) hold no synchronous store write today; scanned, a new one is red by name. src/agentd/ beyond
// client.js runs in the device daemon (another process), its own census. THE CENSUS'S LIMITS, stated: an alias of an alias
// (`const a = fs; const b = a;`), fs passed as a plain parameter under another name, and a dynamic import() are not followed.
// round 4 (true words 3): src/server/stdout/ (the stream normalizers the server loads) and src/agentd/mux.js (the device
// link's multiplexer, loaded by the hub) — no synchronous store write in either today; scanned, a new one is red by name
const EXTRA_DIRS = ['src/channels', 'src/harnesses', 'src/adapters', 'src/spawn', 'src/plugins', 'src/lib', 'src/app-kinds', 'src/browser-backends', 'src/mount-providers', 'src/agent-routes', 'src/server/stdout'];
const EXTRA_FILES = ['src/agentd/client.js', 'src/agentd/mux.js'];
// r2052 (B-7e49 slice 3, lane bl-tests-e): THE TREE ONCE A RUN, ITS PARSES ONCE A TEXT — the profile: acorn 5.0 s, the reads
// 2.1 s and the listings of this suite's 28.7 s were the SAME work again: censusFiles(REPO) listed the tree at five sites,
// ixSites() (the census and its 3 controls) and metaSites() (its 6) each read every file from disk and acorn-parsed every
// match again. Now this tree's list is kept (censusFiles.memo, a copy handed out), its texts are kept (repoText: a failed read
// throws as before and is not kept) and each script tree is kept per text (scriptAstOf, the two sites' own options — no visitor
// writes into a tree). A control's overridden text is its own entry; a scratch root is listed and read afresh.
const REPO_TEXT = new Map();
function repoText(rel) { let t = REPO_TEXT.get(rel); if (t === undefined) { t = fs.readFileSync(path.join(REPO, rel), 'utf8'); REPO_TEXT.set(rel, t); } return t; }
const SCRIPT_AST = new Map();
function scriptAstOf(acorn, src) { let r = SCRIPT_AST.get(src); if (r === undefined) { try { r = { ast: acorn.parse(src.replace(/^#!.*/, ''), { ecmaVersion: 'latest', allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true, locations: true, sourceType: 'script' }) }; } catch (e) { r = { e }; } SCRIPT_AST.set(src, r); } if (r.e) throw r.e; return r.ast; }
function censusFiles(repo) {
  if (repo === REPO && censusFiles.memo) return censusFiles.memo.slice();
  const walk = (d) => fs.readdirSync(path.join(repo, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : e.name.endsWith('.js') ? [`${d}/${e.name}`] : []));
  const extra = EXTRA_DIRS.filter((d) => fs.existsSync(path.join(repo, d))).flatMap(walk);
  const list = [...new Set([...filesOf(repo), ...extra, ...EXTRA_FILES.filter((f) => fs.existsSync(path.join(repo, f)))])].sort();
  if (repo === REPO) censusFiles.memo = list.slice();
  return list;
}
const AC = (() => { try { return require(path.join(REPO, 'node_modules/acorn')); } catch { return null; } })();
const parseOf = (src) => { const o = { ecmaVersion: 'latest', allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true, locations: true, allowHashBang: true }; try { return AC.parse(src, { ...o, sourceType: 'script' }); } catch { return AC.parse(src, { ...o, sourceType: 'module', allowReturnOutsideFunction: false }); } };
const isFsReq = (n) => n && n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'require' && n.arguments[0] && n.arguments[0].type === 'Literal' && /^(node:)?fs$/.test(n.arguments[0].value);
const propName = (m) => (m.computed ? (m.property.type === 'Literal' && typeof m.property.value === 'string' ? m.property.value : null) : m.property.name);
/** one file → {sites: [{line, scope, fn, via}], helpers: [{name, line}]} */
function fileSites(src, rel) {
  const ast = parseOf(src);
  const aliases = new Set(['fs']), direct = new Map();   // direct: a destructured local name → its fs method
  walk(ast, (n) => {
    if (n.type === 'VariableDeclarator' && isFsReq(n.init)) {
      if (n.id.type === 'Identifier') aliases.add(n.id.name);
      else if (n.id.type === 'ObjectPattern') for (const p of n.id.properties) if (p.type === 'Property' && p.key && p.value && p.value.type === 'Identifier') direct.set(p.value.name, p.key.name || p.key.value);
    }
    if (n.type === 'ImportDeclaration' && /^(node:)?fs$/.test(n.source.value)) for (const sp of n.specifiers) { if (sp.type !== 'ImportSpecifier') aliases.add(sp.local.name); else direct.set(sp.local.name, sp.imported.name); }
    if (n.type === 'AssignmentPattern' && n.left.type === 'Identifier' && n.right.type === 'Identifier' && aliases.has(n.right.name)) aliases.add(n.left.name);   // (m, F = fs)
  });
  const sites = [], helpers = [];
  const fnParams = (f) => new Set((f.params || []).flatMap((p) => (p.type === 'Identifier' ? [p.name] : p.type === 'AssignmentPattern' && p.left.type === 'Identifier' ? [p.left.name] : [])));
  const fnName = (f, parents) => { if (f.id && f.id.name) return f.id.name; const up = parents[parents.length - 1]; if (up && up.type === 'VariableDeclarator' && up.id.type === 'Identifier') return up.id.name; if (up && (up.type === 'Property' || up.type === 'MethodDefinition') && up.key && (up.key.name || up.key.value)) return up.key.name || up.key.value; return null; };
  walk(ast, (n, parents) => {
    if (n.type !== 'CallExpression') return;
    let fn = null, via = null;
    if (n.callee.type === 'MemberExpression' && ((n.callee.object.type === 'Identifier' && aliases.has(n.callee.object.name)) || isFsReq(n.callee.object))) { fn = propName(n.callee); via = n.callee.computed ? 'computed' : n.callee.object.type === 'Identifier' && n.callee.object.name !== 'fs' ? `alias ${n.callee.object.name}` : null; }
    else if (n.callee.type === 'Identifier' && direct.has(n.callee.name)) { fn = direct.get(n.callee.name); via = `destructured ${n.callee.name}`; }
    if (!fn || !PERSIST.has(fn)) return;
    if (fn === 'openSync' && !opensForWrite(n)) return;
    sites.push({ line: n.loc.start.line, scope: scopeOf(parents), fn, via });
    // a DERIVED helper: the nearest enclosing named function whose parameter reaches this call's first argument
    for (let i = parents.length - 1; i >= 0; i--) {
      const f = parents[i];
      if (!/Function/.test(f.type)) continue;
      const ps = fnParams(f), name = fnName(f, parents.slice(0, i));
      const arg = n.arguments[0];
      const usesParam = (x) => { let hit = false; walk(x, (y) => { if (y.type === 'Identifier' && ps.has(y.name)) hit = true; }); return hit; };
      if (name && arg && usesParam(arg)) helpers.push({ name, line: f.loc.start.line });
      break;
    }
  });
  return { sites, helpers, ast };
}
const TREE_AST = new Map();   // file → { src, ast } of this tree, filled by scan(REPO) (one parse a file a run)
// r2522 (B-7e49, lane bl-tests-e): A PARSE ONLY WHERE A SITE CAN BE. A file whose text names none of the census's write calls
// (PERSIST, the four known helpers) holds no site, so derives no helper (a derived helper is the function around a site): it is
// read, never parsed — about three quarters of the scope's bytes. A SCOPED file is always parsed (its helper calls are read on its
// tree). The census's answers are unchanged: the marks, by the forced-red probe. Its ONE new blind spot (r3655, the reader's
// should): a write call spelled wholly through a unicode escape in its identifier (`fs.\u0077riteFileSync`) names no PERSIST word
// in the text, so it is not parsed — before this cut the parse decoded it; a deliberate shape, never a mistake.
function scan(repo) {
  const out = [], files = censusFiles(repo), parsed = new Map(), helperDefs = new Map(), words = [...PERSIST, ...KNOWN_HELPERS];
  for (const f of files) {
    let r, src; try { src = repo === REPO ? repoText(f) : fs.readFileSync(path.join(repo, f), 'utf8'); if (!SCOPED[f] && !words.some((w) => src.includes(w))) continue; r = fileSites(src, f); } catch { continue; }
    parsed.set(f, r); if (repo === REPO) TREE_AST.set(f, { src, ast: r.ast });   // ⑨ follow (2)'s principal-builder census walks the same trees
    for (const s0 of r.sites) out.push({ file: f, scope: (SCOPED[f] || []).find((x) => s0.scope === x || s0.scope.endsWith(' > ' + x)) || '*', what: `${f}:${s0.line} «${s0.scope}» ${s0.fn}${s0.via ? ` (${s0.via})` : ''}` });
    for (const h of r.helpers) if (!KNOWN_HELPERS.has(h.name) && !GENERIC.has(h.name)) helperDefs.set(`${f}#${h.name}`, h);
  }
  const scoped = (f, parents) => (SCOPED[f] || []).find((x) => { const sc = scopeOf(parents); return sc === x || sc.endsWith(' > ' + x); }) || '*';
  // the four named helpers' callers, anywhere (as before) … — channel-store-off-loop (commit 1): in a file whose rows are by
  // SCOPE, read from its syntax tree, each call claimed by the door it stands in (a listed door is a row of its own)
  for (const f of files) {
    if (SCOPED[f] && parsed.has(f)) {
      walk(parsed.get(f).ast, (n, parents) => { if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && KNOWN_HELPERS.has(n.callee.name)) out.push({ file: f, scope: scoped(f, parents), what: `${f}:${n.loc.start.line} «${scopeOf(parents)}» ${n.callee.name}()` }); });
      continue;
    }
    const t = fs.readFileSync(path.join(repo, f), 'utf8');
    for (const m of t.matchAll(HELPER)) {
      const ls = t.lastIndexOf('\n', m.index) + 1, pre = t.slice(ls, m.index);
      if (/^\s*(\/\/|\*|\/\*)/.test(pre) || /function\s*$/.test(pre)) continue;
      out.push({ file: f, scope: '*', what: `${f}:${t.slice(0, m.index).split('\n').length} ${m[1]}()` });
    }
  }
  // … and a DERIVED helper's callers in its own file (a bare-name call; not its own body)
  for (const [key, h] of helperDefs) {
    const f = key.slice(0, key.indexOf('#')), r = parsed.get(f);
    walk(r.ast, (n, parents) => {
      if (n.type !== 'CallExpression' || n.callee.type !== 'Identifier' || n.callee.name !== h.name) return;
      if (parents.some((p) => /Function/.test(p.type) && p.loc && p.loc.start.line === h.line)) return;
      out.push({ file: f, scope: scoped(f, parents), what: `${f}:${n.loc.start.line} «${scopeOf(parents)}» ${h.name}() — a helper that writes the path it is given` });
    });
  }
  return out;
}
const KNOWN_HELPERS = new Set(['writeJsonAtomic', 'writeBuffersAtomic', '_writeAtomic', 'writePrivateFile', 'writeDurable']);   // writeDurable (B-574d, lane bl-machines-b): src/agentd/durable-file.js — a synchronous synced write; its callers' sites stay counted
// names too general to follow by name (a method of many objects) — their writes are counted at the write itself
const GENERIC = new Set(['save', 'write', 'flush', 'persist', 'set', 'put', 'update', 'append', 'writeJob', 'writeAll', 'writeHere']);
/** sites + rows → {problems, counts} */
function judge(sites, rows, debtMax) {
  const problems = [], got = new Map();
  for (const s of sites) {
    const r = rows.find((x) => x[0] === s.file && x[1] === s.scope) || rows.find((x) => x[0] === s.file && x[1] === '*');
    if (!r) { problems.push(`UNCLAIMED: ${s.what} — a synchronous store write on the main thread: move it to the store writer (src/store-writer.js) or add its row with its class`); continue; }
    got.set(r, (got.get(r) || 0) + 1);
  }
  for (const r of rows) {
    const n = got.get(r) || 0;
    if (!CLASSES.has(r[3])) problems.push(`UNKNOWN CLASS «${r[3]}»: ${r[0]} «${r[1]}»`);
    if (n === 0) problems.push(`DEAD ROW: ${r[0]} «${r[1]}» claims no site`);
    else if (n !== r[2]) problems.push(`MOVED COUNT: ${r[0]} «${r[1]}» says ${r[2]}, the tree has ${n} — classify the new or gone site, then move the count`);
    if (r[3] === 'durable' && (!r[5] || r[5] === '—')) problems.push(`A DURABLE ROW WITHOUT ITS COST: ${r[0]}`);
    if (!r[6] || r[6].length < 10) problems.push(`A ROW WITHOUT ITS WHY: ${r[0]}`);
  }
  const debt = rows.filter((r) => r[3] === 'debt').reduce((a, r) => a + r[2], 0);
  if (debt > debtMax) problems.push(`THE DEBT ROSE: ${debt} > ${debtMax} — a new synchronous store write on the main thread`);
  return { problems, debt, sites: sites.length };
}

console.log('① every synchronous persistence write of the main process is a row');
const sites = scan(REPO);
const J = judge(sites, ROWS, DEBT_MAX);
ok(!J.problems.length, `${J.sites} sites in ${ROWS.length} rows — durable ${ROWS.filter((r) => r[3] === 'durable').reduce((a, r) => a + r[2], 0)} · not-main ${ROWS.filter((r) => r[3] === 'not-main').reduce((a, r) => a + r[2], 0)} · not-a-store ${ROWS.filter((r) => r[3] === 'not-a-store').reduce((a, r) => a + r[2], 0)} · exit ${ROWS.filter((r) => r[3] === 'exit').reduce((a, r) => a + r[2], 0)} · DEBT ${J.debt} (≤ ${DEBT_MAX})`, J.problems);

console.log('② the moved stores hand their bytes to the writer by name; nothing of theirs is written here');
{
  const src = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
  const cs = src('src/channel-store.js'), ss = src('src/server/session-stdout.js'), uh = src('src/usage-history.js'), ue = src('src/usage-estimator.js'), jb = src('src/jobs.js');
  // channel-store-off-loop (commit 1): the field-named doors and their same-bytes twins hand their bytes to the writer BY NAME
  const doors = [['adaptersUpdate', "owe(adaptersFile, { name: 'channels-adapters.write'"], ['outboxUpdate', "owe(outboxFile, { name: 'channels-outbox.write'"], ['groupsUpdate', "owe(groupsFile, { name: 'channels-groups.write'"], ['paceSet', "owe(paceFile, { name: 'channels-wake-pace.write'"], ['lruSave', "owe(file, { name: 'channels-lru.write'"], ['dispatchSet', "owe(dispatchFile, { name: 'channels-dispatch.write', act: true"], ['aliasesUpdate', "owe(aliasesFile, { name: 'channels-aliases.write'"], ['searchMemoWrite', "owe(file, { name: 'channels-search-memo.write'"], ['feedMissWrite', "owe(file, { name: 'channels-feed-miss.write'"], ['peopleWrite', "owe(file, { name: 'channels-people.write'"], ['oweStamps', "owe(stampsFile, { name: 'channels-stamps.write'"]];
  const bodyOf = (name) => { const i = cs.indexOf(`function ${name}(`); return i < 0 ? '' : cs.slice(i, cs.indexOf('\n  }\n', i)); };
  // cure r1 (C3): a door that WAITS holds the loop as surely as one that writes — a writeNow / a flush / an Atomics.wait in a
  // door's body is red by name (the writer thread's create is ~4 s on the field's mount; the stall leg cannot see a wait)
  const WAITS_RE = /writeJsonAtomic\(|fs\.\w+Sync\(|writeNow\(|\w*[fF]lush\w*\(|Atomics\.wait\(/;
  const doorBad = (fn, b) => !b.includes(doors.find((d) => d[0] === fn)[1]) || WAITS_RE.test(b);
  const doorMiss = doors.filter(([fn]) => doorBad(fn, bodyOf(fn))).map(([fn]) => fn);
  {   // the census can go red: a door given a synchronous wait «for durability» (the sequence the verifier named)
    const b = bodyOf('adaptersUpdate'), waited = b.replace('return paced ? run', 'writeNow(adaptersFile);\n    return paced ? run');
    ok(b !== waited && !doorBad('adaptersUpdate', b) && doorBad('adaptersUpdate', waited), 'NEGATIVE CONTROL (cure r1, C3): adaptersUpdate given a synchronous writeNow(adaptersFile) is a door that WAITS — red by name');
    const oweB = bodyOf('owe'), landedB = bodyOf('landed');
    ok((oweB.match(/writeNow\(/g) || []).length === 1 && /\n    if \(closed\) writeNow\(file\);/.test(oweB) && /async function landed\(/.test(cs) && landedB && !WAITS_RE.test(landedB),
      'owe() writes through the writer synchronously ONLY after close() (`if (closed) writeNow(file)` — its one wait), and a durable door\'s landed() is ASYNC (no synchronous wait inside it)', { oweB, landedB: landedB.slice(0, 300) });
  }
  ok(!doorMiss.length && /if \(!e \|\| e\.code !== 'ENOENT' \|\| !m\.makeDir\) throw e;\n\s*fs\.mkdirSync\(path\.dirname\(m\.file\), \{ recursive: true/.test(src('src/store-writer-worker.js')), `the channel store's moved doors (${doors.map(([fn]) => fn).join(', ')}) hand their bytes to the writer by name, with no synchronous call AND no synchronous wait of their own; the writer's thread makes a missing parent directory ONLY for a write that asks (makeDir — the people door)`, doorMiss);
  ok(/W\(\)\.dirty\(indexFile, \{ name: 'channels-index\.write'/.test(cs) && !/writeBuffersAtomic\(indexFile/.test(cs), 'the channels index: markDirty / flush hand it to the store writer — no writeBuffersAtomic(indexFile …) left on the main thread');
  ok(/storeWriter\(\)\.dirty\(fp, \{ name: 'session-meta\.write'/.test(ss) && /const firstVersion = !sync && !knownOnDisk\(META_DIR, fp\);/.test(ss), 'session-meta: its UPDATES through the writer; only a meta that does not exist ON DISK yet (a socket being born — round 3, law 3) is written synchronously (the durable row)');
  ok(/storeWriter\(\)\.dirty\(this\.cursorsFile, \{ name: 'usage-cursors\.write'/.test(uh) && !/timedSync\('usage-cursors\.write', \(\) => this\._writeAtomic/.test(uh), 'the usage cursors through the writer');
  ok(/storeWriter\(\)\.dirty\(fp, \{ name: 'usage-rates\.write'/.test(ue) && !/fs\.renameSync\(fp \+ '\.tmp', fp\)/.test(ue), 'the estimator\'s rates through the writer');
  // lane job-logs-sweep: the job-logs catch-up's record was born on the writer (paced — the hub's bookkeeping; a lost last write
  // costs at most one repeated «catch-up» start line, the next boot counting again what is left)
  ok(/storeWriter\(\)\.dirty\(this\.logsSweepFile, \{ name: 'jobs-logs-sweep\.write'/.test(jb) && !/(writeJsonAtomic|writeFileSync|renameSync)\(this\.logsSweepFile/.test(jb), 'the job-logs catch-up record through the writer — never a synchronous write of it');
  // lane lg-store-writes U1 (B-0248): the decision engine's memo (paced) and day's counter (an act: rank 0; the judge call
  // that changed it answers once its durable() resolves) hand their bytes to the writer by name — no synchronous write of either
  const de = src('src/server/decision-engine.js');
  const deMoved = (t) => { const w = t.split('\n').filter((l) => /fs\.(writeFileSync|renameSync|appendFileSync)\(/.test(l));
    return /W\(\)\.dirty\(F\.memo, \{ name: 'decision-memo\.write'/.test(t) && /W\(\)\.dirty\(F\.usage, \{ name: 'decision-usage\.write', rank: 0/.test(t)
      && /return W\(\)\.durable\(F\.usage\)/.test(t) && /if \(call\.counted\) await call\.counted;/.test(t) && !/writeJsonAtomic\(/.test(t) && w.length === 0
      && /W\(\)\.dirty\(F\.journal, \{ name: 'decision-journal\.write', rank: 0, urgent: true/.test(t); };   // B-0248's next part (r2417): the journal too
  ok(deMoved(de), 'the decision memo (paced), the day\'s counter (an act: rank 0 — the CALL that changed it waits for its durable(), the loop never) and the journal (rank 0, urgent — a call\'s reservation lands before its ask) through the writer — no synchronous write left in the file');
  ok(!deMoved(de.replace("W().dirty(F.memo, { name: 'decision-memo.write'", "fs.writeFileSync(F.memo, { name: 'decision-memo.write'")), 'NEGATIVE CONTROL (lg-store-writes U1): the memo written synchronously again is red');
  // lane lg-store-writes U2 (B-0248): the outstanding-deliveries table (src/turn-carry.js) — a mark an act (rank 0 +
  // durable()), the rest paced — hands its bytes to the writer by name; no synchronous write of it is left
  const tc = src('src/turn-carry.js');
  const tcMoved = (t) => /W\(\)\.dirty\(file, \{ name: 'turn-carry-outstanding\.write', \.\.\.\(act \? \{ rank: 0 \} : \{\}\)/.test(t) && /if \(act\) W\(\)\.durable\(file\)/.test(t)
    && /mark\(key, info\) \{ if \(!key\) return true; rows\[key\] = info; return save\(\{ act: true \}\); \}/.test(t) && !/fs\.(writeFileSync|renameSync)\(/.test(t);
  ok(tcMoved(tc), 'the outstanding-deliveries table through the writer (a mark an act, rank 0 + durable(); a clear paced) — no writeFileSync / renameSync left in src/turn-carry.js');
  ok(!tcMoved(tc.replace("return JSON.stringify(rows); },", "return JSON.stringify(rows); }, x: fs.writeFileSync(file + '.tmp', ''),")), 'NEGATIVE CONTROL (lg-store-writes U2): a synchronous write of the table put back is red');
  // lane lg-store-writes U4 (B-0248): the jobs store's save — jobs.json and job-notifications.json by name; a direct save is an
  // act (rank 0 + durable()), the 2 s tick paced; no writeJsonAtomic of either file left
  const jbMoved = (t) => /W\.dirty\(this\.file, \{ name: 'jobs\.write', \.\.\.\(paced \? \{\} : \{ rank: 0, urgent: true \}\)/.test(t) && /W\.dirty\(this\.notifsFile, \{ name: 'jobs-notifs\.write'/.test(t)
    && /setInterval\(\(\) => \{ if \(this\._dirty\) this\._save\(\{ paced: true \}\); \}, 2000\)/.test(t) && !/writeJsonAtomic\(this\.(file|notifsFile)\b/.test(t);
  ok(jbMoved(jb), 'the jobs store (jobs.json + job-notifications.json) through the writer — a direct save an act, the 2 s tick paced; no synchronous write of either left');
  ok(!jbMoved(jb.replace("W.dirty(this.file, { name: 'jobs.write',", "writeJsonAtomic(this.file, []); W.dirty(this.file, { name: 'jobs.write',")), 'NEGATIVE CONTROL (lg-store-writes U4): a synchronous write of jobs.json put back is red');
  // lane lg-store-writes U5 (B-0248): the Task Groups' store — task-groups.json by name, an act (rank 0 + durable()); no
  // synchronous write of it left
  const tgs = src('src/task-groups.js');
  const tgMoved = (t) => /W\.dirty\(this\._file, \{ name: 'task-groups\.write', rank: 0/.test(t) && !/fs\.(writeFileSync|renameSync)\(tmp, this\._file\)/.test(t) && !/timedSync\('task-groups\.write'/.test(t);   // stale-pins: kept — a deliberate absence check: the old synchronous write of task-groups.json must be gone
  ok(tgMoved(tgs), 'the Task Groups\' store (task-groups.json) through the writer — an act, its routes answer once on disk; no synchronous write of it left');
  ok(!tgMoved(tgs.replace("W.dirty(this._file, { name: 'task-groups.write',", "fs.writeFileSync(tmp, this._file); W.dirty(this._file, { name: 'task-groups.write',")), 'NEGATIVE CONTROL (lg-store-writes U5): a synchronous write of task-groups.json put back is red');
  // lane lg-store-writes, the U4/U5 cure (主开发's as-if-musts): EVERY route that waits on its store's write answers on the
  // writer's SYNCHRONOUS road — persisted(answer), called inside the writer's settle, so an answer still waiting at the hub's
  // stop goes out in the exit's flush (server.js leaves in that run); NO promise road left (`persisted().then(` was never
  // answered when the process left — the agent's command saw a reset and repeated a create). An act that takes access away
  // (a group-admin unbind / update) and a backlog CLAIM wait; an act that only adds (create, bind) answers at once; the record
  // clear's two routes answer from the clear's own answer; a job's announce stays PACED (a watch job announces in a loop)
  const cureT = { ar: src('src/agent-routes.js'), jw: src('src/server/jobs-wiring.js'), tw: src('src/server/task-groups-wiring.js'), rcr: src('src/routes/records-clear.js'), jb };
  const cnt = (t, re) => (t.match(re) || []).length;
  const cureAnswers = (t) => cnt(t.ar, /\ba\.jm\.persisted\(\(saved\) => \{/g) === 4 && cnt(t.jw, /\bjm\.persisted\(\(saved\) => \{/g) === 5
    && /tasks\.persisted\(\(saved\) => \{ try \{ require\('\.\.\/store-writer\.js'\)\.identityAtExit\(res\); res\.json\(saved \? body : \{ \.\.\.body, notOnDisk: true(?:, \.\.\.\(notYet \|\| \{\}\))? \}\); \} catch \{ \} \}\)/.test(t.tw) && cnt(t.tw, /\bonDisk\(res, /g) === 7
    // an answer made while the hub stops goes out UNENCODED (compression's zlib is asynchronous — process.exit comes first):
    // every answer on the synchronous road calls identityAtExit — agent-routes 6 (jobs 4, answerOnDisk, the clear verbs), the
    // jobs panel 5 (the deferred-save census: + the two seen marks), the Task Group panel's helper 1, the record clear's 2
    && cnt(t.ar, /\bidentityAtExit\(res\)/g) === 6 && cnt(t.jw, /\bidentityAtExit\(res\)/g) === 5 && cnt(t.tw, /\bidentityAtExit\(res\)/g) === 1 && cnt(t.rcr, /\bidentityAtExit\(res\)/g) === 2
    && /await rc\.clear\(item, \{ caller: agentClearCaller\(hit\), answer \}\)/.test(t.ar)
    && /return answerOnDisk\(res, \{ success: true, group: brief\(tasks\.view\(update\.id\)\) \}\)/.test(t.ar) && /return answerOnDisk\(res, \{ success: true, group: brief\(tasks\.view\(unbind\.id\)\) \}\)/.test(t.ar)
    && /    answerOnDisk\(res, \{\n      success: true,\n      backlog: sortBacklog\(/.test(t.ar) && /return answerOnDisk\(res, \{ success: true, group: brief\(tasks\.view\(bind\.id\)\) \}\)/.test(t.ar)
    && cnt(t.rcr, /answer: \(r\) => \{ try \{/g) === 2 && /  announce\(job, text\) \{[\s\S]{0,1600}?this\._save\(stashed \? \{\} : \{ paced: true \}\);/.test(t.jb)
    && ![t.ar, t.jw, t.tw, t.rcr].some((x) => /persisted\(\)\.then\(/.test(x));
  ok(cureAnswers(cureT), 'the U4/U5 cure: every waiting route answers on the writer\'s synchronous road (jobs 4 + 5, the Task Group panel\'s 7, the record clear\'s 2); a group-admin unbind / update / create / bind and every writing backlog verb wait (the deferred-save census: create and bind too; the census cure: a backlog add, done, drop, edit and unclaim too); announce paced (urgent only when its owner copy was only stashed — the moved2 cure 2); no persisted().then( left');
  ok(!cureAnswers({ ...cureT, jw: cureT.jw.replace('jm.persisted((saved) => {', 'jm.persisted().then((saved) => {') }), 'NEGATIVE CONTROL (the U4/U5 cure): one jobs route back on the promise road is red');   // stale-pins: kept — a negative control: the route as it was before the cure
  {   // the census cure (主开发 2026-11-19 08:56Z, the hunt's finding 2): EVERY writing backlog verb answers once on disk — RED (anchored): the run's own answer
    const { anchored } = await import('./scratch.mjs');
    const BL = '    answerOnDisk(res, {\n      success: true,\n      backlog: sortBacklog(';
    ok(!cureAnswers({ ...cureT, ar: anchored(cureT.ar, BL, '    ((r0, b0) => r0.json(b0))(res, {\n      success: true,\n      backlog: sortBacklog(', 'the backlog answers on disk') }), 'NEGATIVE CONTROL (the census cure, finding 2): the backlog\'s writing verbs answered in their own run again is red');
  }
  ok(!cureAnswers({ ...cureT, ar: cureT.ar.replace('return answerOnDisk(res, { success: true, group: brief(tasks.view(unbind.id)) })', 'return res.json({ success: true, group: brief(tasks.view(unbind.id)) })') }), 'NEGATIVE CONTROL (the U4/U5 cure): a group-admin unbind answered at once is red');   // stale-pins: kept — a negative control: the route as it was before the cure
  ok(!cureAnswers({ ...cureT, jw: cureT.jw.replace("require('../store-writer.js').identityAtExit(res); ", '') }), 'NEGATIVE CONTROL (the U4/U5 cure): a jobs panel answer that may be gzipped at the stop (no identityAtExit) is red');
  ok(!cureAnswers({ ...cureT, jb: cureT.jb.replace("    this._save(stashed ? {} : { paced: true });", "    this._save();") }), 'NEGATIVE CONTROL (the U4/U5 cure, should 3): announce saving URGENT every time is red (the moved2 cure 2: urgent only when its owner copy was only stashed)');
  // the U4/U5 cure (U5 readers' should): the boot's migrations land every store a migration DIRTIED — told by its change count
  // (a store with an unrelated save queued before the run, then reshaped by a migration, lands too); the old «owed before» set is gone
  const mg = src('src/server/migrations.js');
  const landByVersion = (t) => /before = new Map\(SWm\.stats\(\)\.map\(\(s\) => \[s\.file, s\.version\]\)\)/.test(t) && /\(s\.dirty \|\| s\.inflight\) && s\.file && s\.version !== before\.get\(s\.file\)/.test(t) && !/owedBefore/.test(t);   // stale-pins: kept — a deliberate absence check: the old «owed before» set must not come back
  ok(landByVersion(mg) && /version: s\.version,/.test(src('src/store-writer.js')), 'the U4/U5 cure: the boot\'s migrations land the stores whose change count moved while they ran (the writer\'s stats() carries it)');
  ok(!landByVersion(mg.replace('s.version !== before.get(s.file)', '!before.has(s.file)')), 'NEGATIVE CONTROL (the U4/U5 cure): «not owed before the run» back in place of the change count is red');
  // the U4/U5 cure (as-if-must 3): «not on disk» reaches the PERSON — the page's two fetch doors (fetchJson, api()) and the
  // two helpers that fetch on their own (the Task Groups' _taskApi, the import button) say an answer's notOnDisk in the
  // release's own sentence (zh / ja already beside it); the agent's side is test-cli-call ⑤ (behavioural)
  const pageSays = (u, s2, t2) => /export function sayNotOnDisk\(body\) \{\s*if \(!body \|\| typeof body !== 'object' \|\| body\.notOnDisk !== true\) return false;\s*(?:\/\/[^\n]*\n\s*)*(?:if \(body\.code === 'finishes-on-landing'\) \{ try \{ showToast\(t\('Saved here — it finishes by itself when the storage answers[^\n]*\n\s*)?try \{ showToast\(t\('Saved, but not on disk yet — the storage has not written it/.test(u)
    && /export async function fetchJson\(url, opts\) \{[\s\S]{0,300}?sayNotOnDisk\(body\);/.test(u) && /export async function api\(url, opts\) \{[\s\S]{0,900}?sayNotOnDisk\(body\);\s*return body;/.test(u)
    && /if \(res\.ok\) sayNotOnDisk\(data\);/.test(s2) && /sayNotOnDisk\(d\);/.test(t2);
  const pg = [src('src/lib/utils.js'), src('src/lib/sidebar-tasks.js'), src('src/lib/task-detail.js')];
  ok(pageSays(...pg), 'the U4/U5 cure: the page says an answer\'s notOnDisk — fetchJson, api(), the Task Groups\' _taskApi and the import button, in the release\'s own sentence');
  ok(!pageSays(pg[0].replace('    sayNotOnDisk(body);\n    return body;\n  } catch { return null; }', '    return body;\n  } catch { return null; }'), pg[1], pg[2]), 'NEGATIVE CONTROL (the U4/U5 cure): fetchJson without the saying is red');
  // lane lg-store-writes U5b (B-0248): the browser keeper's registry — browser-profiles.json by name, an act; browser-env's
  // reader of the same file lands the keeper's owed write first; no synchronous write of the registry left
  const bk = src('src/server/browser-keeper.js'), be = src('src/server/browser-env.js');
  const bkMoved = (t, e) => /W\.dirty\(storeKey, \{ name: 'browser-profiles\.write', rank: 0, mode: FILE_MODE, makeDir: true,/.test(t) && /\n\s+W\.durable\(storeKey\)\.catch\(/.test(t) && !/writeJsonAtomic\(storeFile\b/.test(t) && /if \(!saveNow\(\)\) \{ reg\.dirHosts = before;/.test(t)   // stale-pins: kept — a deliberate absence check (no synchronous write of the registry left)
    && /path\.resolve\(dataDir, PROFILE_REGISTRY_FILE\), W = require\('\.\.\/store-writer\.js'\)\.storeWriter\(\); if \(W\.pending\(f\)\) \{ const r = W\.flushSync\(\[f\]\); if \(r\.deferred \|\| \(r\.left \|\| \[\]\)\.some\(\(x\) => x\.file === f\)\) return null; \}/.test(e);
  ok(bkMoved(bk, be), 'the browser keeper\'s registry (browser-profiles.json) through the writer — an ACT (rank 0 + durable()), its folder made by the writer; a lineage move waits for it; browser-env\'s sweep reads it only after the keeper\'s owed write lands, and fails CLOSED when it did not');
  ok(!bkMoved(bk, be.replace('if (W.pending(f)) { const r = W.flushSync([f]); if (r.deferred || (r.left || []).some((x) => x.file === f)) return null; }', '')), 'NEGATIVE CONTROL (lg-store-writes U5b): browser-env reading the registry without landing the owed write first is red');
  ok(!bkMoved(bk, be.replace('if (r.deferred || (r.left || []).some((x) => x.file === f)) return null; ', '')), 'NEGATIVE CONTROL (U5b, the cure): browser-env reading an older registry when the owed write did not land (not failing closed) is red');
  ok(!bkMoved(bk.replace('      W.durable(storeKey).catch(() => { });\n', ''), be), 'NEGATIVE CONTROL (U5b, the cure): the registry no longer an act (no durable() — a paced store, up to 30 s late) is red');
  // the migrations' road (U5b, found at its line): a reshape is ON DISK before the next migration reads the file
  const reshapeLands = (t) => /reshapeStore: \(fn\) => \{ ensureLoaded\(\); (?:refuseIfHeld\('a migration of the profile registry'\); )?const r = fn\(reg\); commit\(\); landedOrThrow\(\); return r; \}/.test(t) && /function saveNow\(\) \{ return save\(\) && landNow\(\); \}/.test(t)
    && /const landedOrThrow = \(\) => \{ if \(!landNow\(\)\) throw /.test(t) && /return !r\.deferred && !r\.left\.some\(\(x\) => x\.file === storeKey\)/.test(t);
  ok(reshapeLands(bk), 'the browser keeper\'s reshapeStore (migrations only) lands the registry before it returns, else THROWS by name — the boot\'s next migration (grants-unify) reads the FILE; an exit-deferred flush is not «landed»');
  ok(!reshapeLands(bk.replace('commit(); landedOrThrow(); return r; }', 'commit(); return r; }')), 'NEGATIVE CONTROL (lg-store-writes U5b): a reshape left owed when the next migration reads the file is red');   // stale-pins: kept — a negative control
  ok(!reshapeLands(bk.replace('return !r.deferred && !r.left.some(', 'return !r.left.some(')), 'NEGATIVE CONTROL (U5b, the cure): a flush DEFERRED by the exit read as landed is red');   // stale-pins: kept — a negative control
  const TS = require(path.join(REPO, 'src/timed-sync.js'));
  ok(['channels-index.write', 'session-meta.write', 'usage-cursors.write', 'usage-rates.write', 'jobs-logs-sweep.write', 'decision-memo.write', 'decision-usage.write', 'turn-carry-outstanding.write', 'channels-wake-pace.write', 'channels-dispatch.write', 'jobs.write', 'jobs-notifs.write', 'task-groups.write', 'browser-profiles.write'].every((n) => TS.STORES[n] && TS.STORES[n].kind === 'write'), 'each moved store keeps its store-timing row (the writer records its write\'s own time under it)');
}

// ── ROUND 4 (item 7): THE WAITS THAT REMAIN — every synchronous FLUSH the main thread waits on while the writer's thread
// writes (no write on the main thread, but the main thread waits: up to the write in flight + its own — 2.4 s at 1.2 s a
// write), named with its caller and its measured cost; a new caller is red by name. The law's title «no store write holds
// the main thread» is about WRITES; these WAITS are its named debt (docs/kb-design-lessons.md §19 says which and why).
console.log('② the synchronous flushes the main thread waits on — named debt');
{
  const WAITS = [
    ['src/channel-store.js', 2, 'the index\'s flush() — a person\'s clear-history waits on it (measured 2.3 s at 1.2 s a write, the verifier) and a caller ordering a cursor after its rows; channel-store-off-loop: writeNow() — close() and a change after close, the stamps\' flush() a suite calls (the moved doors\' bytes through the writer, waited for behind a write in flight — test-channel-store-loop-free (d) measures it)'],
    ['src/usage-history.js', 1, 'flushCursors() — the walk\'s cursors on disk before a caller reads them (a migration, a test, the shutdown hand-over)'],
    ['src/reading-repair.js', 1, 'repairGlobalFile() — data/usage-cache.json flushed before the identity repair judges and removes it (B-360d part 3 U2): no copy owed before the removal lands after it; one small file, at the repair alone'],
    ['src/usage-estimator.js', 1, 'flushRates() / settleRates() — the learned rates on disk before the boot\'s migrations step and a ledger backfill\'s pass completes'],
    ['src/session-status.js', 1, 'flush() — the session-status map before the shutdown hands over and the set routes answer (persisted())'],
    ['src/user-todos.js', 1, '_flush() / flush() — the For-you list before the shutdown hands over, a stop, a migration\'s «flushed», a record clear (clearItems, a person\'s act) and the ledger notice\'s flushed() (src/server/ledger-shape-notice.js) — each synchronous at the release too; it THROWS todos-not-written when the writer could not land it (B-0248, lane bl-loop-b: the list on the store writer; a person\'s act answers through persisted())'],
    ['src/server/session-stdout.js', 1, 'writeSessionMeta {sync: true} — a meta its caller renames next (boot-restore retireDeadSocket): the write in flight lands, then this one'],
    ['src/server/migrations.js', 1, 'runLocalMigrations() landStores — on a boot where a migration RAN, every store a migration DIRTIED lands before the ledger is stamped — told by its change count (the U4/U5 cure: one owed before the run and reshaped by a migration lands too; one owed before and untouched since is never waited on); a reshape not on disk is not recorded: it runs again next boot, said in For you); a boot with nothing to run waits on nothing; the vault\'s seal (runMigrations without landStores) waits on nothing — lane lg-store-writes U5'],
    ['src/server/browser-keeper.js', 2, 'landNow() — the registry on disk before what follows: a MIGRATION\'s reshape before the next migration reads the file, the lineage move\'s saveNow under the writer\'s own bound (the moved2 cure 3: no ten-minute hold); load() — a keeper made again in the same process lands what the last one still owed, and reads the WRITER\'s owed copy when it stays held (the moved2 cure 2\'s hunt (6)). A removal / an adopt waits on nothing: its step rides the landing (afterLanding)'],
    ['src/server/browser-env.js', 1, 'registeredDirs() — the keeper\'s registry write still owed for browser-profiles.json lands before the sweep reads the file (only when one is owed), so a directory is never swept by an older registry; one that did not land ⇒ null, the sweep fails CLOSED; the same cost as the keeper\'s (behind the write in flight, maybe another store\'s, bounded by grace/3) — lane lg-store-writes U5b'],
    ['src/task-groups.js', 4, '_landNow() — a config import\'s groups on disk before its answer, under the writer\'s own bound (the moved2 cure 3: no ten-minute hold; not landed ⇒ EVSNOTONDISK, said); the archived conversations\' unbind waits on NOTHING since B-0248 step 3 (persisted(), its keys out of the baseline until it lands); the boot save and a load in the same process; a group\'s removal waits on nothing (its Activity log and grant ride the landing); the store\'s own flushes at the shutdown and a reload; _archiveSettle() — B-0248 step 3 (c): an archive append still owed to a month file lands before a clear or an import rewrites that file, or a group\'s removal takes its folder (a person\'s act, rare; the main thread waits for that one file)'],
    ['src/jobs.js', 2, 'JobManager._onDisk() — one file\'s write waited for: the run\'s intent before its child, the boot\'s skeletons, a notifications claim / drain (the moved2 cure 2: an answer, a removal, a clear\'s asks, the gc\'s log folders wait on NOTHING — their steps ride the landing); _load() — an engine made again in the same process lands what the last one owed, a write still held holds the store unread (EOWED). The archive\'s load waits on nothing (B-0248 step 3, r1908 (5): an archive write this process still owes holds the archive unread until it lands — never flushed on the loop, never read past)'],
    ['src/turn-carry.js', 1, 'createOutstanding() — a table made AGAIN in the same process (a suite\'s new hub on the same data dir) lands the write the last one still owed before it reads the file; a hub\'s boot owes nothing (pending() is false: no wait) — lane lg-store-writes U2'],
    ['src/server/decision-engine.js', 1, 'create() — an engine made AGAIN in the same process (a suite\'s restart) lands the memo / counter write the last one still owed before it reads the files; a hub\'s boot owes nothing (pending() is false: no wait) — lane lg-store-writes U1'],
    ['src/store-hold.js', 1, 'readAtStart() — a persistence store made AGAIN in the same process (a suite\'s restart) lands the write the last one still owed for its file before it reads; a hub\'s start owes nothing (pending() is false: no wait) — lane bl-loop-b, B-0248 (c), 主开发 r912'],
    ['src/server/device-alerts.js', 1, 'create() — a ledger made AGAIN in the same process (a suite\'s restart) lands the write the last one still owed before it reads the file; a hub\'s boot owes nothing (pending() is false: no wait) — lane lg-store-writes, 主开发 2026-11-20 03:10Z'],
    ['src/desktop-serve.js', 2, 'shutdown() — the machine\'s stop lands the record file before the hub hands over (bounded; a held storage said); reshapeStore() — a boot migration\'s reshape on disk before the runner records it (once, at the boot; not landed ⇒ it throws and runs again) — lane lg-store-writes, 主开发 2026-11-20 03:10Z'],
    ['src/server/desktop-app-keeper.js', 1, 'flushRemote() — the paired machines\' file (desktop-apps-hosts.json) at the keeper\'s shutdown, before the hub hands over: what is owed lands, a write that cannot land is said (B-0248 unit 3, lane bl-loop-b, r3320 / r3651: the file on the store writer)'],
    ['src/accounts.js', 1, '_save({ now: true }) — 主开发 r3782 THE LAW: a save that carries a SIGN-IN (a key added, a long-lived token set, moved, imported, merged or removed, a row with one removed, a new member\'s row that is about to receive a login; and the two boot migrations that reshape the list) is in the file before its call returns, as at the release — a small file, only when a person or a mint changes a sign-in. ITS COST (r3977 (5)): the writer\'s flushSync first settles any store\'s write already in flight, so on a storage that answers slowly one such act can hold the loop up to the writer\'s own bound, a THIRD of the stop\'s grace — 30 s under systemd\'s 90 s, 10 s in a pod\'s 30 s (the release\'s writeFileSync was unbounded); every other save of the list rides the writer off the loop'],
    ['src/hosts.js', 1, 'flushThrottled() — hosts.json on disk before the shutdown hands over (server.js), before the dial-token migration renames its legacy file (its hashes on disk first: a kill between would lose them) and before a suite reads the file (B-48a4: every save of hosts.json goes through the store writer); one small whole-file write (the machines\' records, KBs), the write in flight first'],
    ['src/server/browser-bindings.js', 1, 'landedNow() — bindings.json\'s ONE owed write waited for (the writer\'s bound) when a caller must have the document ON DISK: a suite\'s read of the file after an act; a hub\'s path owes nothing here (pending() false: no wait) — B-574d browser-stores, lane nl-migrations, 主开发 r5101'],
  ];
  const got = new Map();
  for (const f of censusFiles(REPO)) { if (f === 'src/store-writer.js') continue; const t = repoText(f).split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n'); const n = (t.match(/\.flushSync\(/g) || []).length; if (n) got.set(f, n); }
  const bad = [];
  for (const [f, n] of got) { const r = WAITS.find((w) => w[0] === f); if (!r) bad.push(`UNNAMED: ${f} waits on the main thread (${n} synchronous flush${n === 1 ? '' : 'es'}) — name it with its caller and its cost`); else if (r[1] !== n) bad.push(`${f}: ${n} synchronous flushes, the table says ${r[1]}`); }
  for (const w of WAITS) if (!got.has(w[0])) bad.push(`DEAD: ${w[0]} no longer waits — remove its row`);
  ok(!bad.length && WAITS.every((w) => w[2].length >= 40), `the ${WAITS.length} synchronous flushes the main thread still WAITS on are named, each with its caller and its cost (${WAITS.map((w) => w[0].replace(/^src\//, '')).join(', ')})`, bad);
  const planted = new Map(got); planted.set('src/zz-new-wait.js', 1);
  ok([...planted].some(([f]) => !WAITS.find((w) => w[0] === f)), 'CONTROL: a new synchronous flush in a file with no row is red by name (UNNAMED: src/zz-new-wait.js)');
}

console.log('③ red controls');
{
  const base = sites;   // the scan above (one scan a run: the tier rule's seconds)
  const plus = (s) => judge([...base, s], ROWS, DEBT_MAX);
  ok(plus({ file: 'src/zz-new-store.js', scope: '*', what: 'src/zz-new-store.js:1 writeFileSync' }).problems.some((p) => /^UNCLAIMED: src\/zz-new-store\.js:1/.test(p)), 'a synchronous write in a NEW file is red by name');
  // ROUND 4 (true words 3): the two places round 3's plants passed — now scanned, a plant in each is red by name
  for (const rel of ['src/server/stdout/claude-stream-json.js', 'src/agentd/mux.js']) {
    const scanned = censusFiles(REPO).includes(rel);
    const r = fileSites(fs.readFileSync(path.join(REPO, rel), 'utf8') + "\nfunction zzPlant(p) { require('fs').writeFileSync(p, 'x'); }\n", rel);
    const s0 = r.sites.find((x) => /zzPlant/.test(x.scope));
    const j = s0 ? plus({ file: rel, scope: '*', what: `${rel}:${s0.line} «${s0.scope}» ${s0.fn}` }) : null;
    ok(scanned && !!s0 && j.problems.some((p) => p.startsWith(`UNCLAIMED: ${rel}:`)), `true words 3: ${rel} is scanned — a synchronous write planted in it is red by name`, { scanned, site: s0 || null });
  }
  const debtRow = ROWS.find((r) => r[3] === 'debt');
  ok(plus({ file: debtRow[0], scope: debtRow[1], what: 'one more' }).problems.some((p) => p.startsWith(`MOVED COUNT: ${debtRow[0]}`)), 'one more site in a covered row is red (its count is exact)');
  ok(judge(base, ROWS.map((r) => (r === debtRow ? [...r.slice(0, 3), 'later'] .concat(r.slice(4)) : r)), DEBT_MAX).problems.some((p) => p.startsWith('UNKNOWN CLASS')), 'an unknown class is red');
  ok(judge(base, ROWS, DEBT_MAX - 1).problems.some((p) => p.startsWith('THE DEBT ROSE')), 'the debt ratchet: a sum above DEBT_MAX is red');
}

console.log('④ the pace (PURE src/store-pace.js)');
{
  const P = require(path.join(REPO, 'src/store-pace.js')), MB = 1024 * 1024;
  const g = [1024, 2 * MB, 22.3 * MB, 100 * MB].map((b) => P.minGapMs(b));
  ok(JSON.stringify(g) === JSON.stringify([500, 1000, 11150, 30000]), 'the minimum gap stated for the size: 1 KB 0.5 s · 2 MB 1 s · the 22.3 MB index 11.2 s · 100 MB 30 s', g);
  ok(P.dueAt({ dirtySince: 1000, lastEndAt: 900, bytes: 22.3 * MB, debounceMs: 100 }) === 12050 && P.maxAgeMs(22.3 * MB, 1300) === 12450, 'a busy 22.3 MB index: due 11.2 s after its last write ended; its oldest unwritten change ≤ 12.5 s old (with a 1.3 s rename)');
  // ROUND 6 (E1 + smaller 1): THE STOP GRACE is what the service manager allows — the exit's ONLY bound; a stated value that
  // is not a grace is not used, one outside 1 s … 24 h is clamped, either SAID (refused)
  const G = (v, k) => P.stopGraceOf({ ...(v === undefined ? {} : { VIBESPACE_STOP_GRACE_S: v }), ...(k ? { KUBERNETES_SERVICE_HOST: '10.0.0.1' } : {}) });
  const sys = G(), pod = G(undefined, true), stated = G('60', true), tiny = G('0.001'), huge = G('1e9'), bad = ['0', '-5', 'abc', '1e400'].map((v) => G(v)), blank = G('');
  ok(sys.graceMs === 90000 && !sys.refused && pod.graceMs === 30000 && !pod.refused && stated.graceMs === 60000 && !stated.refused && blank.graceMs === 90000 && !blank.refused
    && tiny.graceMs === 1000 && /VIBESPACE_STOP_GRACE_S=0\.001 is outside 1 s … 24 h — 1 s is used/.test(tiny.refused || '') && huge.graceMs === 86400000 && /86400 s is used/.test(huge.refused || '')
    && bad.every((x) => x.graceMs === 90000 && /is not a grace \(a number of seconds above 0\) — systemd \(TimeoutStopSec 90 s\) is used/.test(x.refused || ''))
    && P.keeperStopAtMs(9000) === 8100 && P.keeperStopAtMs(30000) === 28000 && P.keeperStopAtMs(90000) === 88000 && P.keeperCrashMs(90000) === 90000 && P.keeperCrashMs(30000) === 30000 && P.syncBoundMs(90000) === 30000,
    'THE STOP GRACE: systemd\'s 90 s, a pod\'s 30 s, a stated 60 s — the keeper speaks at 88 / 28 s after a stop and, after a crash with no stop asked, ends it ONE FULL GRACE later (90 / 30 s); 0.001 s clamped to 1 s, 1e9 s to 24 h, 0 / -5 / abc / Infinity not used — each SAID', [sys, pod, stated, tiny, huge, bad[0]]);
  const ord = P.exitOrder([{ name: 'a', rank: 1, dirtySince: 1 }, { name: 'b', rank: 0, dirtySince: 9 }, { name: 'c', dirtySince: 5 }, { name: 'd', rank: 0, dirtySince: 2 }]).map((x) => x.name).join('');
  ok(ord === 'dbac', `the exit flush's ORDER: what cannot be re-derived first (rank 0 — a person's act, a decision), then by the oldest change (${ord})`);
  const el = P.exitLine({ written: ['session-meta.write'], left: [{ name: 'channels-index.write', why: 'the write failed (1 attempt)' }], ms: 2001, debtMs: 900, rank0: 1 }), ec = P.exitLine({ written: ['a'], ms: 40, debtMs: 10, rank0: 1, crash: true });
  ok(/^\[store-write\] exit: 1 store written in 2001 ms \(session-meta\.write\); the first 1 before the shutdown's unmoved stores \(census debt\), which took 900 ms; NOT written: channels-index\.write — the write failed \(1 attempt\) — their last changes are lost; the files hold their previous whole version$/.test(el)
    && !/bound/.test(el) && /^\[store-write\] exit after the crash: 1 store written in 40 ms \(a\); the first 1 before the crash road's own unmoved stores \(census debt\), which took 10 ms$/.test(ec) && !/signal|shutdown's/.test(ec),
    'the exit line names what it WROTE and a write that FAILED — never a bound of ours; the crash road says «after the crash», never «the signal» or «the shutdown\'s»', [el, ec]);
}

console.log('⑤ the channels index in two columns: a person\'s act / a decision / a billing record DURABLE before the answer; the re-derived paced');
{
  // [file, scope, durable, paced, what it holds — and what a SIGKILL inside the pace costs for the paced]
  const A = 'src/server/channels-access.js', E = 'src/server/channels-engine.js', O = 'src/server/channels-outbound.js';
  const IX = [
    ['src/routes/webhook.js', 'syncRow', 1, 0, 'a webhook\'s options — the person\'s setting'],
    ['src/server/channels-auth.js', 'create > removeRecord', 1, 0, 'an account removed — its rows leave with it'],
    [A, 'create > setPolicy', 1, 0, 'an account\'s access policy'], [A, 'create > request', 1, 0, 'an agent\'s reach request (its card is filed)'],
    [A, 'create > decideRequest', 1, 0, 'the person\'s decision on a reach request'], [A, 'create > fileWatchRequest', 1, 0, 'a watch request (its card is filed)'],
    [A, 'create > decideOpenWatch', 1, 0, 'the person\'s decision on a watch request (lane bl-msg B-ae13 cure: its body, the mark released around it)'], [A, 'create > holdAside', 1, 0, 'a held digest set aside (its card is filed)'],
    [A, 'create > decideHeld', 1, 0, 'the person\'s decision on a held digest'], [A, 'create > decideHeld > settle', 1, 0, 'the decision\'s settlement'], [A, 'create > withdrawWatchRequest', 1, 0, 'lane bl-msg B-ae13: the asker takes its own wake request back (a decision)'], [A, 'create > decideHeld > sending', 1, 0, 'lane bl-msg B-84b4: the press\'s stamp BEFORE its send (a stop inside the send is then said on the card)'],
    [A, 'create > settleFromItem', 0, 1, 'the person\'s deny from the For-you card: the card\'s close reaches the For-you store at ITS 500 ms debounce (round 3, smaller 6d — not synchronous: a kill inside it loses the close too, the card comes back and the person decides again) and the boot reconcile settles the request from it — re-derived'], [A, 'create > setGrain', 1, 1, 'access / watchers of a grain — lane lg-group-parents B-526c: the act\'s DURABLE half is the grants record (synchronous, before the answer: who, each watcher\'s settings and inline filter body, a rule\'s account and pattern, the agents\' blocks); the index\'s copy is PACED — a SIGKILL inside the pace is completed by the boot from the record (completeGrainActs); durable only when a value is past the record\'s bounds (a filter or a pattern over 16 KB, the bodies\' 256 KB total: that act waits for the disk, as every act did) or — r937 MUST 1 — on a conversation the disk\'s index does not list yet (its row rides the act\'s journal line)'],
    [A, 'create > removePattern', 1, 0, 'a rule removed'], [A, 'create > setFilter', 2, 0, 'a conversation\'s filter set or cleared'],
    [A, 'create > dropHeld', 0, 1, 'a held request whose reach went — re-judged at the next pass'], [A, 'create > endHeld', 0, 1, 'a held request ended by the system — re-judged at the boot reconcile'],
    [A, 'create > expireWatchRequests', 0, 1, 'an expiry — re-derived from the request\'s own time'], [A, 'create > migrateAggregated', 0, 1, 'a migration whose readers lift the old shape'],
    [A, 'create > migrateGrants', 0, 1, 'a migration whose readers lift the old shape'], [A, 'create > prunePending', 0, 1, 'a prune — re-derived'],
    [A, 'create > reconcileAsks', 0, 1, 'the boot reconcile — re-runs every boot'], [A, 'create > completeGrainActs', 0, 1, 'lane lg-group-parents B-526c: the boot completes a grain write the stop cut short, from the grants record — re-runs every boot, idempotent (a second boot finds nothing)'], [A, 'create > reconcilePresses', 0, 1, 'the boot reconcile — re-runs every boot'],
    [A, 'create > healGrainRows', 0, 1, 'r2541 (a) / r2933: the heal at a start says each kept entry once a row version — its ledger (grainSkipsSaid) re-derived every boot; the healed rows go through the grants store\'s one writer in ONE write (r3020: one setMany; a refused row set aside, the rest again)'],
    [A, 'create > stampAgentRead', 0, 1, 'the agent\'s read stamp (the list\'s chip) — a SIGKILL inside the pace loses the newest stamp; the agent\'s next read stamps again'],
    [E, 'create > settleSelf', 0, 1, 'B-f276 family r3188: the rows indexed while the account\'s own id was unknown, settled at its people memo\'s lift — re-derived (the own stamp, the read mark, the count)'],
    [E, 'create > setRefresh', 1, 0, 'a conversation\'s refresh cadence'], [E, 'create > markRead', 1, 0, 'the person\'s read mark'],
    [E, 'create > keepPending', 1, 0, 'held hits — a message that must still be delivered'], [E, 'create > reserveWake', 1, 0, 'MONEY: the wake cap\'s reservation before the billed wake'],
    [E, 'create > wakeNow', 3, 0, 'MONEY: the wake\'s final row; the carried hits it took; the carried rows a watcher was already handed (B-43bc third cure, L1: the mark at the wake site — no wake, the rows done)'], [E, 'create > flushScopeNow', 2, 1, 'the digest\'s delivery (durable) · its refusal stamp (paced) · the rows whose every record this watcher was already handed (durable; B-43bc third cure, L1)'],
    [E, 'create > stashHits', 3, 0, 'the carried hits handed over — a lost clear hands them again · the woken-for ledger of the next-turn road (round 2: a later recall must reach the agent — as in wakeNow)'], [E, 'create > stashPending', 1, 0, 'the carried hits handed over'],
    [E, 'create > noteHandedOver', 1, 0, 'round 2: the handed-over stamp nothing re-derives (a lost one hands the same hits over again)'], [E, 'create > noteRecall', 1, 0, 'round 2: the recall\'s «noted» mark — its note is written at once, so a lost mark is a duplicate note after a kill'],
    ...['convCapsFailed', 'describeFeedBorn', 'feedPage', 'flushPushBatch', 'healSelfAt', 'historyFeed', 'ingest', 'landById', 'markPlaces', 'migrateThreads', 'noteConvRefusal', 'noteRefusal', 'onFresh > ledger', 'refreshConvCaps', 'rejudgeConvCaps', 'releaseStaleReservations', 'revisionsPass', 'stampRecheck', 'threadFeedFetch', 'threadRefresh', 'writeThreadCut']
      .map((f) => [E, `create > ${f}`, 0, 1, 'walked, cached or counted — the next walk re-derives it (a cursor is ordered after the rows by index.durable())']),
    [E, 'create > discover', 0, 2, 'listed rows — the cursor waits for them (index.durable())'], [E, 'create > onPushEvent', 0, 3, 'a push event\'s rows — the feed re-reads the window'],
    [O, 'create > noteSentBy', 1, 0, 'who sent it — the agent\'s message marked as the agent\'s'], [O, 'create > pointerSync', 2, 0, 'the For-you pointer\'s id — a lost one files a second card'],
    [O, 'create > receiptNow', 1, 0, 'a receipt sent'], [O, 'create > sendNow', 0, 1, 'a refused thread reply narrows the cached caps — re-learned at the next refusal'],
  ];
  const AC = require(path.join(REPO, 'node_modules/acorn'));
  let unawaited = [];
  const ixSites = (over = {}) => {
    const got = new Map();
    unawaited = [];
    for (const rel of (ixSites.files || (ixSites.files = filesOf(REPO)))) {
      const src = over[rel] !== undefined ? over[rel] : repoText(rel);
      if (!/index\.update\(/.test(src)) continue;
      const ast = scriptAstOf(AC, src);
      walk(ast, (n, parents) => {
        if (n.type !== 'CallExpression' || n.callee.type !== 'MemberExpression' || n.callee.computed || n.callee.property.name !== 'update') return;
        const o = n.callee.object;
        if (!(o.type === 'MemberExpression' && !o.computed && o.property.name === 'index')) return;
        const a = n.arguments[1], d = !!a && a.type === 'ObjectExpression' && a.properties.some((p) => p.key && p.key.name === 'durable' && p.value.type === 'Literal' && p.value.value === true);
        const k = `${rel}|${scopeOf(parents)}`, r = got.get(k) || [0, 0];
        r[d ? 0 : 1]++; got.set(k, r);
        // round 2 (law F): a durable act is AWAITED — the answer waits for the disk (directly, or through its own .then /
        // .catch chain); a durable call whose promise nobody awaits is a flag, not a law
        if (d) {
          let i = parents.length - 1, cur = n;
          while (i >= 0) {
            const p = parents[i];
            if ((p.type === 'MemberExpression' && p.object === cur) || (p.type === 'CallExpression' && p.callee === cur) || p.type === 'ChainExpression') { cur = p; i--; continue; }
            break;
          }
          if (!(i >= 0 && parents[i].type === 'AwaitExpression')) unawaited.push(`${rel}:${n.loc ? n.loc.start.line : '?'} «${scopeOf(parents)}»`);
        }
      });
    }
    return got;
  };
  const ixJudge = (got) => {
    const problems = [], seen = new Set();
    for (const r of IX) {
      const k = `${r[0]}|${r[1]}`, g = got.get(k);
      seen.add(k);
      if (!g) problems.push(`DEAD ROW: ${k}`);
      else if (g[0] !== r[2] || g[1] !== r[3]) problems.push(`MOVED: ${k} — the row says ${r[2]} durable / ${r[3]} paced, the code has ${g[0]} / ${g[1]}`);
    }
    for (const k of got.keys()) if (!seen.has(k)) problems.push(`UNCLASSED: ${k} — a person's act / a decision / a billing record ⇒ { durable: true }; re-derived ⇒ paced; then its row`);
    return problems;
  };
  const got = ixSites(), pr = ixJudge(got), unawaitedNow = unawaited.slice();
  const sum = (i) => IX.reduce((n, r) => n + r[i], 0);
  function sumOf(g) { let n = 0; for (const [d] of g.values()) n += d; return n; }
  ok(!unawaitedNow.length, `every durable index update is AWAITED (the answer waits for the disk) — ${sumOf(got)} durable sites`, unawaitedNow);
  {   // CONTROL (round 2, law F): markRead's await removed — the flag still says durable, the AWAIT pin is red by name
    const esrc0 = fs.readFileSync(path.join(REPO, E), 'utf8'), AW = 'if (!known(adapterId, convId)) return false;\n    let changed = false, found = false;\n    await store.index.update(';
    const n0 = unawaited.length; if (esrc0.split(AW).length === 2) ixSites({ [E]: esrc0.split(AW).join(AW.replace('await store.index.update(', 'store.index.update(')) });
    const added = unawaited.slice(n0); unawaited.length = n0;
    ok(esrc0.split(AW).length === 2 && added.some((x) => /«create > markRead»/.test(x)), `CONTROL: markRead's update without its await (the flag kept) is red by name (${added.join(', ') || 'nothing flagged'})`);
  }
  ok(!pr.length, `${got.size} scopes: ${sum(2)} index updates durable before the answer (acts, decisions, billing / delivery records) · ${sum(3)} paced (re-derived)`, pr);
  const esrc = fs.readFileSync(path.join(REPO, E), 'utf8');
  const MR = esrc.match(/async function markRead\([\s\S]*?\n  \}/);
  ok(!!MR && /, \{ durable: true \}\)/.test(MR[0]), 'CONTROL setup: markRead\'s update is spelled durable once');
  const cut = MR ? ixJudge(ixSites({ [E]: esrc.replace(MR[0], MR[0].replace(', { durable: true })', ')')) })) : [];
  ok(cut.some((p) => p.startsWith(`MOVED: ${E}|create > markRead`)), 'CONTROL: markRead without `durable` (the read mark at the index\'s pace — 11 s on a 22 MB index) is red by name', cut);
  ok(ixJudge(ixSites({ [O]: fs.readFileSync(path.join(REPO, O), 'utf8') + '\nasync function zzNewAct(store) { await store.index.update(() => {}); }\n' })).some((p) => p.startsWith(`UNCLASSED: ${O}|zzNewAct`)), 'CONTROL: a new update scope is red by name until it is classed');

  // the live leg: a store over its own writer (its own thread) — A PERSON'S ACT LIVES IN A SMALL FILE OF ITS OWN: its
  // promise resolves when its journal line is on disk; the 22 MB index keeps its pace; a store started over the same
  // directory (the process killed before the index was written) replays the act — never the paced change
  const SW = require(path.join(REPO, 'src/store-writer.js')), CS = require(path.join(REPO, 'src/channel-store.js'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-census-ix-'));
  const w = SW.create({ log: { warn() {} } });
  const st = CS.createChannelStore({ dir, log: { warn() {}, log() {} }, writer: w });
  const acts = path.join(dir, 'index-acts.ndjson'), read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
  try {
    await st.index.update(() => { st.index.entry('a', 'c0').title = 'seed'; });
    st.index.flush();   // the index on disk once, as a running hub has it
    const t0 = performance.now();
    await st.index.update(() => { st.index.entry('a', 'c1').title = 'act-one'; }, { durable: true });
    const actMs = performance.now() - t0, inJournal = read(acts).includes('act-one'), inIndex = read(st.indexFile).includes('act-one');
    await st.index.update(() => { st.index.entry('a', 'c2').title = 'paced-two'; });
    const pacedAnywhere = read(acts).includes('paced-two') || read(st.indexFile).includes('paced-two');
    // a SIGKILL now: a second store over the same directory is what the next boot reads
    const w2 = SW.create({ log: { warn() {} } });
    const st2 = CS.createChannelStore({ dir, log: { warn() {}, log() {} }, writer: w2 });
    const back = st2.index.peek('a/c1'), lost = st2.index.peek('a/c2');
    try { st2.close(); } catch { } w2.stop();
    ok(inJournal && !inIndex && !pacedAnywhere && back && back.title === 'act-one' && !lost,
      `an act's promise resolves with its LINE on disk (${actMs.toFixed(0)} ms, the writer's thread) — the index keeps its pace; a store started over the same directory replays it; the paced change is lost to the kill (re-derived)`, { inJournal, inIndex, pacedAnywhere, back: back && back.title, lost: !!lost });
    // the index written: its acts leave the journal, and the load skips a line the index already holds
    st.index.flush();
    const held = JSON.parse(read(st.indexFile)).actsSeq;
    ok(held >= 1 && read(st.indexFile).includes('act-one'), `a written index holds its acts (actsSeq ${held}) — the load replays only the lines past it`);
  } finally { try { st.close(); } catch { } w.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
}

// ⑥ (the writer's own laws, driven on a stand-in thread) lives in scripts/test-store-writer-laws.mjs since round 3 (smaller 6e)

// ── ⑦ ROUND 2 (law B) — SESSION-META IN TWO COLUMNS, by call scope: a BINDING nothing re-derives (the conversation's
// backend session id after a fork / resume, a thread id) or a PERSON'S ACT (a model lock / pick, effort, permission mode,
// response style, a goal, a rename, a reach level, a pin, an editor in flight) ⇒ `{durable: true}` (the writer's NEXT write,
// the ANSWER after it) — or `{sync: true}` (a caller that renames the file next); stamps, caches, rings ⇒ paced ──────────
console.log('⑦ round 2 — session-meta\'s writes in two columns (a binding / a person\'s act durable, the answer after it; the rest paced)');
{
  const M = [
    ['server.js', 'persistAskedAt', 0, 2, 'first-seen stamps of an ask (the inbox clock)'], ['server.js', 'persistSessionMeta', 0, 1, 'browser facts — the binding itself is browser-bindings\' document (the store writer, B-574d browser-stores); the meta is its copy'],
    ['server.js', 'persistFlag', 0, 1, 'the per-session auto-continue choice (lane auto-resume-bulk) — its restart copy, through the store\'s patch (lg-recovery U2 cure); the page writes the same choice into its resume carrier in the same act'],
    ['src/server/session-stdout.js', 'create > liftMeta', 1, 0, 'r3137: the changes that waited for a record that could not be read, saved ONCE merged over it at its read (a person\'s act among them)'],
    ['src/server/session-stdout.js', 'create > writeSessionMeta', 0, 2, 'r3141 / r3199: the write door\'s own re-entries — a torn record restated whole (after its copy), passing its caller\'s own options on, and a change whose record read meanwhile, patched off the loop (patchSessionMeta)'],
    ['src/server/session-stdout.js', 'create > patchMetaOnce', 0, 2, 'ONE field patched (lg-recovery U1 + U2 cures — the stop fact and the per-session auto-continue choice): its pending copy, else the file read OFF the loop; one chain per file, a give-up\'s keys written again by its own tries, the record\'s next write or the stop (r3302) — paced'],
    ['src/server/session-stdout.js', 'create > oweAgain', 0, 1, 'r3302: an OWED patch\'s store entry (a link dropped at its bound): rank 0, so the stop\'s flush writes it and any write of that record carries it; nothing waits on its answer (the dropped link answered false) — paced'],
    ['server.js', 'rebindSessionMeta', 0, 1, 're-runs the binding hook (the bindings store is synchronous)'], ['server.js', 'route:POST /api/sessions/:id/msg-reachability', 1, 0, 'the person\'s reach level — answered after the disk'],
    ['src/agent-routes.js', 'setupAgentRoutes > persistSeenMarks', 0, 1, 'a seen mark — lost, one injection is sent again'],
    ['src/routes/editor.js', 'registerEditorRoutes > route:POST /api/editor/open', 1, 0, 'the only record of an edit in flight — on disk before the editor opens'], ['src/routes/editor.js', 'registerEditorRoutes > route:POST /api/editor/signal', 0, 1, 'the clear — a stale record heals itself at the next attach'],
    ['src/server/artifact-registry.js', 'persistSoon', 0, 1, 'the deliverables\' cache'], ['src/server/boot-restore.js', 'create > armRestoredCapture > onAdopt', 1, 0, 'the restored claude id / a fork — a binding'],
    ['src/server/boot-restore.js', 'create > readoptOrphanKeeperSessions', 0, 1, 'a re-adopted socket\'s FIRST version — written synchronously by construction'], ['src/server/boot-restore.js', 'create > restoreSessions > finish > recaptureIds', 1, 0, 'a codex thread id — a binding (B-cd4b unit 3: the restore\'s tail runs in finish, after its last registration batch)'],
    ['src/server/boot-restore.js', 'create > restoreSessions > finish', 0, 1, 'apiKeySource — restated at every init (B-cd4b unit 3: the backfill is armed in finish, after the last registration batch)'], ['src/pool-pin-record.js', 'writeBack', 0, 1, 'lane lg-group-parents B-526c unit 2 (r1070 / r1094): the pin record\'s decision written back into the meta at a boot — the PIN ONLY over the copy as it stands (a pending sibling write kept), paced, the record stays'], ['src/server/boot-restore.js', 'create > retireDeadSocket', 1, 0, '{sync: true} — renamed to .orphan right after (round 2: a paced write landed after the rename and re-created a live-looking meta)'],
    ['src/server/boot-restore.js', 'persistNoStart', 0, 1, 'a derived marker (no-start)'], ['src/server/channel-touches.js', 'create > persist', 0, 1, 'the witness ring'],
    ['src/server/channels-wiring.js', 'create > flushGroupCards', 0, 1, 'the dedup ring of group cards — a kill inside the pace loses a card (never a double)'], ['src/server/conversation-ops.js', 'renameSession', 1, 0, 'the person\'s rename'],
    ['src/server/model-ask.js', 'persist', 0, 1, 'server facts of the model chip (lane fable-52-cli-321: the ask\'s number, the served fact, the CLI\'s report, a refusal) — the next init, echo or served record restates them; the person\'s pick and lock are ws-handler\'s durable writes'],
    ['src/server/session-brain.js', 'create > persistMeta', 0, 1, 'facts the CLI reports (vcs, its title, PR links)'], ['src/server/stdout/acp-events.js', 'create > attach > noteMode', 1, 0, 'the person\'s permission mode — the ack after the disk'],
    ['src/server/stdout/acp-events.js', 'create > attach', 1, 0, 'an ACP session id — a binding'], ['src/server/stdout/claude-stream-json.js', 'create > attach > applyWorktreeVerdict', 0, 1, 'the worktree verdict — re-derived at the next init'],
    ['src/server/stdout/claude-stream-json.js', 'create > attach > keepCost', 0, 1, 'the conversation\'s cost fold after each result (2.369.402) — paced: the next result rewrites it; a lost write leaves the boot the buffer\'s own fold'],
    ['src/server/stdout/claude-stream-json.js', 'create > attach', 4, 4, 'durable: the first id of a resume (the fork guard), the id adoption (first / fork / implicit fork), the person\'s permission mode (the ack after the disk), the mode the CLI restates at each init (round 3: re-derived only while the CLI runs — a kill in the window resumed the OLD mode) · paced: apiKeySource, a lock latched to the served model, the lock\'s alias refinement, task records'],
    ['src/server/stdout/codex-events.js', 'create > attach', 1, 0, 'a codex thread id — a binding'],
    ['src/server/usage-pool-engine.js', 'create > noteServedModel > writeSessionMeta', 0, 1, 'the served fact handed to model-ask (its persist, paced — above)'],
    ['src/server/usage-pool-engine.js', 'create > persistFallbackStamp', 0, 1, 'derived — the next served record retires it'], ['src/server/usage-pool-engine.js', 'create > persistHeldStamp', 0, 1, 'a held-member stamp the ledger re-derives'],
    ['src/server/usage-pool-engine.js', 'create > clearFallbackRecord', 0, 1, 'B-d578 F2 cure (r2939 (1)): the record of a move that did not happen leaves the conversation — paced (its reader also checks it against where the conversation is held)'],
    ['src/server/usage-pool-engine.js', 'create > stampFallbackDwell', 0, 1, 'B-d578 F3a: when the pool moved a conversation back — a hold re-derived as the next move\'s own (a lost write only shortens the dwell)'],
    ['src/server/usage-pool-engine.js', 'create > writeFallbackRecord', 1, 0, 'B-d578 F2: the record of a move onto the pool\'s fallback provider — on disk BEFORE the restart (the move waits for it; a failed write moves nothing)'],
    ['src/server/usage-pool-engine.js', 'create > stampFallbackRecord', 1, 0, 'B-d578 F2: the same record in the RESUMED conversation\'s meta — the first member and model the move back restores (nothing re-derives it)'],
    ['src/server/usage-pool-engine.js', 'create > persistStoppedBy', 0, 1, 'why a session stopped (lg-recovery U1 + cures) — through the store\'s patch (its owed keys ride the next patch); the next turn end restates or clears it'],
    ['src/server/usage-pool-engine.js', 'create > persistPoolPin', 0, 1, 'the owner\'s pin — lane lg-group-parents B-526c unit 2: its DURABLE half is its own record (src/pool-pin-record.js, synchronous, before the answer); this meta copy is paced, the boot takes the newer'], ['src/server/usage-pool-engine.js', 'create > persistRequestStamp', 0, 1, 'request stamps'],
    ['src/ws-create.js', 'createWsCreateHandler > createBody > onAdopt', 1, 0, 'the claude conversation id after new / fork — a binding'], ['src/ws-create.js', 'createWsCreateHandler > createBody > tryCapture', 1, 0, 'a codex thread id — a binding'],
    ['src/ws-create.js', 'createWsCreateHandler > createBody', 0, 1, 'a new socket\'s FIRST version — written synchronously by construction'],
    ['src/ws-handler.js', 'registerWsHandler > handleMessage', 6, 1, 'durable: the model pick, the lock, the lock\'s target, effort, the response style, the goal — the lock, its target and the style answered after the disk; the pick, effort and the goal told to the CLI at once, a failed write said by the not-durable error frame (round 3: the pick\'s promise had been dropped) · paced: a stale editor record\'s clear'],
  ];
  const AC2 = require(path.join(REPO, 'node_modules/acorn'));
  const META_FILES = [...new Set([...censusFiles(REPO), 'src/ws-handler.js', 'src/ws-create.js', 'src/agent-routes.js', ...fs.readdirSync(path.join(REPO, 'src/server/stdout')).map((f) => 'src/server/stdout/' + f), ...['src/agent-routes', 'src/mount-providers'].flatMap((d) => fs.existsSync(path.join(REPO, d)) ? fs.readdirSync(path.join(REPO, d)).filter((f) => f.endsWith('.js')).map((f) => d + '/' + f) : []), ...fs.readdirSync(path.join(REPO, 'src/routes')).filter((f) => f.endsWith('.js')).map((f) => 'src/routes/' + f)])].filter((f) => fs.existsSync(path.join(REPO, f)));
  const metaSites = (over = {}) => {
    const got = new Map();
    for (const rel of META_FILES) {
      const src = over[rel] !== undefined ? over[rel] : repoText(rel);
      if (!/writeSessionMeta|patchSessionMeta/.test(src)) continue;
      let ast; try { ast = scriptAstOf(AC2, src); } catch { continue; }
      walk(ast, (n, parents) => {
        if (n.type !== 'CallExpression') return;
        const nm = n.callee.type === 'Identifier' ? n.callee.name : n.callee.type === 'MemberExpression' && !n.callee.computed ? n.callee.property.name : null;
        if (nm !== 'writeSessionMeta' && nm !== 'patchSessionMeta') return;   // lg-recovery U2 cure: a patch's caller is a row too (a person's act routed through it is never invisible)
        const a = n.arguments[2], d = !!a && a.type === 'ObjectExpression' && a.properties.some((q) => q.key && (q.key.name === 'durable' || q.key.name === 'sync') && q.value.type === 'Literal' && q.value.value === true);
        const k = `${rel}|${scopeOf(parents)}`, r = got.get(k) || [0, 0];
        r[d ? 0 : 1]++; got.set(k, r);
        // round 3 (smaller 6a): a {durable: true} write's PROMISE is consumed — chained (.then / .catch), awaited, returned,
        // kept in a variable or handed to Promise.resolve — never dropped (a dropped one is a flag, not a durable act)
        const isDurable = !!a && a.type === 'ObjectExpression' && a.properties.some((q) => q.key && q.key.name === 'durable' && q.value.type === 'Literal' && q.value.value === true);
        if (isDurable) {
          // round 4 (true words 2): a value that flows OUTWARD — a conditional's branch, a logical's operand, Promise.resolve's
          // FIRST argument — is consumed only when the OUTER expression is consumed in turn (round 2's own mutant,
          // `Promise.resolve(void 0, writeSessionMeta(…))`, passed the write as an argument nobody kept and was green)
          const consumedAt = (node, k) => {
            let cur = node; while (k >= 0 && parents[k].type === 'ChainExpression') { cur = parents[k]; k--; }   // an optional call's chain (`x?.(…)`)
            const p0 = parents[k];
            if (!p0) return false;
            // round 5 (smaller 1): an EMPTY .catch / .finally swallows the answer — consumed only when its own call is.
            // round 6 (smaller 3): a .catch whose body is a constant (`.catch(() => null)`) is empty too; and a .then whose
            // FIRST handler never reads its value (`.then(() => {})`, `.then(() => {}, h)`, `.then(() => res.json(…))`)
            // drops the answer outright — a failed write resolves false, and nobody hears it
            if (p0.type === 'MemberExpression' && p0.object === cur && /^(then|catch|finally)$/.test(p0.property && p0.property.name)) {
              const call = parents[k - 1], h = call && call.type === 'CallExpression' && call.callee === p0 ? call.arguments[0] : null;
              const isFn = !!h && (h.type === 'ArrowFunctionExpression' || h.type === 'FunctionExpression');
              const constant = (b) => b.type === 'Literal' || (b.type === 'Identifier' && b.name === 'undefined') || (b.type === 'UnaryExpression' && b.operator === 'void' && b.argument.type === 'Literal');
              const empty = isFn && (h.body.type === 'BlockStatement' ? !h.body.body.length : constant(h.body));
              if (p0.property.name === 'catch' && empty) return consumedAt(call, k - 2);
              // round 6's amend (smaller 4): a .finally never sees the value — whatever its body, the answer is consumed
              // only when the .finally's own call is
              if (p0.property.name === 'finally') return consumedAt(call, k - 2);
              if (p0.property.name === 'then' && isFn) {
                const p1 = h.params[0];
                if (!p1) return false;
                // every name the first parameter binds — an identifier, a rest element (`(...ok)`), a pattern's leaves
                const bound = []; walk(p1, (x, ps) => { if (x.type === 'Identifier' && !(ps.length && ps[ps.length - 1].type === 'Property' && ps[ps.length - 1].key === x && ps[ps.length - 1].value !== x)) bound.push(x.name); });
                let reads = 0; walk(h.body, (x) => { if (x.type === 'Identifier' && bound.includes(x.name)) reads++; });
                if (!reads) return false;
                // a handler that only hands the value on (`(ok) => ok`, `(ok) => { return ok; }`) consumes nothing by
                // itself: the .then's own result must be consumed in turn
                const only = h.body.type === 'Identifier' ? h.body : h.body.type === 'BlockStatement' && h.body.body.length === 1 && h.body.body[0].type === 'ReturnStatement' && h.body.body[0].argument && h.body.body[0].argument.type === 'Identifier' ? h.body.body[0].argument : null;
                if (only && bound.includes(only.name)) return consumedAt(call, k - 2);
              }
              return true;
            }
            // round 5 (smaller 1): a binding nobody reads drops the promise — kept only when its name is READ in its scope
            if (p0.type === 'VariableDeclarator') {
              if (!p0.id || p0.id.type !== 'Identifier') return true;
              const nm = p0.id.name;
              let fn = null; for (let q = k - 1; q >= 0; q--) if (/Function|Program/.test(parents[q].type)) { fn = parents[q]; break; }
              let reads = 0; if (fn) walk(fn, (x) => { if (x.type === 'Identifier' && x.name === nm && x !== p0.id) reads++; });
              return reads > 0;
            }
            if (p0.type === 'AwaitExpression' || p0.type === 'ReturnStatement' || p0.type === 'AssignmentExpression') return true;
            if (p0.type === 'ArrowFunctionExpression' && p0.body === cur) return true;
            if (p0.type === 'ConditionalExpression' && (p0.consequent === cur || p0.alternate === cur)) return consumedAt(p0, k - 1);
            if (p0.type === 'LogicalExpression') return consumedAt(p0, k - 1);
            if (p0.type === 'CallExpression' && p0.callee.type === 'MemberExpression' && p0.callee.property && p0.callee.property.name === 'resolve' && p0.arguments[0] === cur) return consumedAt(p0, k - 1);
            return false;
          };
          const used = consumedAt(n, parents.length - 1);
          if (!used) dropped.push(`${rel}:${n.loc ? n.loc.start.line : '?'} «${scopeOf(parents)}»`);
          const c0 = chained.get(k) || [0, 0]; c0[used ? 0 : 1]++; chained.set(k, c0);
        }
      });
    }
    return got;
  };
  let dropped = [], chained = new Map();
  const judgeM = (got) => {
    const problems = [], seen = new Set();
    for (const r of M) { const k = `${r[0]}|${r[1]}`, g = got.get(k); seen.add(k); if (!g) problems.push(`DEAD ROW: ${k}`); else if (g[0] !== r[2] || g[1] !== r[3]) problems.push(`MOVED: ${k} — the row says ${r[2]} durable / ${r[3]} paced, the code has ${g[0]} / ${g[1]}`); }
    for (const k of got.keys()) if (!seen.has(k)) problems.push(`UNCLASSED: ${k} — a binding / a person's act ⇒ {durable: true} and the answer after it; a stamp ⇒ paced; then its row`);
    return problems;
  };
  dropped = []; chained = new Map(); const gm = metaSites(), pm = judgeM(gm), droppedNow = dropped.slice(), chainNow = chained;
  if (process.env.CENSUS_CHAIN) console.log(JSON.stringify([...chainNow]));
  // THE CHAIN, by scope (round 3, smaller 6a): how many durable writes of a scope have their promise CONSUMED (chained /
  // awaited / returned — the person hears a failure, or the answer waits for the disk); the rest are bindings no one waits
  // for (a failed one is said by writeSessionMeta's own warning, rank 0 at a stop)
  const CHAIN = {
    'server.js|route:POST /api/sessions/:id/msg-reachability': [1, 'the reach level — answered after the disk'],
    'src/routes/editor.js|registerEditorRoutes > route:POST /api/editor/open': [1, 'the editor opens after the disk'],
    'src/ws-handler.js|registerWsHandler > handleMessage': [6, 'the lock, its target and the response style answered after the disk; the model pick, effort and the goal told to the CLI at once, a failed write said by the not-durable error frame'],
    'src/server/session-stdout.js|create > liftMeta': [0, 'r3137: the changes that waited, saved at the read — no one waits on it (a failure said by writeSessionMeta)'],
    'src/server/stdout/acp-events.js|create > attach > noteMode': [1, 'the permission mode — the ack after the disk'],
    'src/server/stdout/claude-stream-json.js|create > attach': [1, 'the person\'s permission mode — the ack after the disk; the ids it adopts and the restated mode are bindings no one waits for'],
    'src/server/boot-restore.js|create > armRestoredCapture > onAdopt': [0, 'a binding at boot — no one waits'], 'src/server/boot-restore.js|create > restoreSessions > finish > recaptureIds': [0, 'a binding at boot — no one waits'],
    'src/server/conversation-ops.js|renameSession': [0, 'the person\'s rename — shown at once, NOT waited for (a failed write is said by writeSessionMeta\'s own warning, never to the person — named, not hidden)'],
    'src/ws-create.js|createWsCreateHandler > createBody > onAdopt': [0, 'a binding — no one waits'], 'src/ws-create.js|createWsCreateHandler > createBody > tryCapture': [0, 'a binding — no one waits'],
    'src/server/stdout/acp-events.js|create > attach': [0, 'an ACP session id — a binding'], 'src/server/stdout/codex-events.js|create > attach': [0, 'a codex thread id — a binding'],
    'src/server/usage-pool-engine.js|create > writeFallbackRecord': [1, 'B-d578 F2: the move onto the fallback waits for its record on disk (a failed write moves nothing — said in the conversation)'],
    'src/server/usage-pool-engine.js|create > stampFallbackRecord': [0, 'B-d578 F2: the resumed conversation\'s copy of that record — a binding no one waits for'],
  };
  const chainBad = [];
  for (const [k, [want]] of Object.entries(CHAIN)) { const g = chainNow.get(k); if (!g) chainBad.push(`DEAD: ${k}`); else if (g[0] !== want) chainBad.push(`${k}: ${g[0]} consumed, the table says ${want}`); }
  for (const k of chainNow.keys()) if (!(k in CHAIN)) chainBad.push(`UNCLASSED: ${k} — say how its durable write is answered`);
  ok(!chainBad.length, `session-meta: the CHAIN pinned by scope — ${Object.values(CHAIN).reduce((n, [w]) => n + w, 0)} durable writes answered after the disk or with their failure said to the person, ${droppedNow.length} bindings no one waits for (each named; a failure said by writeSessionMeta)`, chainBad);
  { const WH0 = fs.readFileSync(path.join(REPO, 'src/ws-handler.js'), 'utf8'), PICK = "modelOrigin: s2._modelOrigin || null }, { durable: true }).then(";
    dropped = []; if (WH0.includes(PICK)) metaSites({ 'src/ws-handler.js': WH0.replace(PICK, "modelOrigin: s2._modelOrigin || null }, { durable: true }), void 0, (").replace("\u0000", "") });
    const ctl = dropped.slice(); dropped = [];
    ok(WH0.includes(PICK) && ctl.some((x) => /^src\/ws-handler\.js:/.test(x)), `CONTROL: the model pick's write with its promise dropped is red by name (${ctl.find((x) => /^src\/ws-handler\.js:/.test(x)) || 'nothing flagged'})`);
    // ROUND 4 (true words 2): ROUND 2'S OWN MUTANT — the lock's durable write handed to Promise.resolve as its SECOND
    // argument (never kept): `Promise.resolve(void 0, writeSessionMeta(…))` — green in round 3, red by name now
    const LOCK = "Promise.resolve(session.sockName ? writeSessionMeta(";
    dropped = []; if (WH0.includes(LOCK)) metaSites({ 'src/ws-handler.js': WH0.replace(LOCK, "Promise.resolve(void 0, session.sockName ? writeSessionMeta(") });
    const ctl3 = dropped.slice(); dropped = [];
    ok(WH0.includes(LOCK) && ctl3.some((x) => /^src\/ws-handler\.js:/.test(x)), `CONTROL (round 2's own mutant): the lock's durable write passed as an ARGUMENT nobody keeps is red by name (${ctl3.find((x) => /^src\/ws-handler\.js:/.test(x)) || 'nothing flagged'})`);
    // ROUND 5 (smaller 1): a binding nobody reads, and an EMPTY .catch after the answer was sent, both drop the promise
    dropped = []; metaSites({ 'src/ws-handler.js': WH0 + "\nfunction zzUnusedBinding(sock, m) { const _unused = writeSessionMeta(sock, m, { durable: true }); }\nfunction zzEmptyCatch(sock, m, ws) { ws.send('{}'); writeSessionMeta(sock, m, { durable: true }).catch(() => {}); }\n" });
    const ctl5 = dropped.slice(); dropped = [];
    ok(ctl5.some((x) => /«zzUnusedBinding»/.test(x)) && ctl5.some((x) => /«zzEmptyCatch»/.test(x)), `CONTROL (round 5): \`const _unused = writeSessionMeta(…, {durable: true})\` and \`….catch(() => {})\` after the answer are red by name (${ctl5.filter((x) => /zz/.test(x)).join(', ') || 'nothing flagged'})`);
    // ROUND 6 (smaller 3): the verifier's plants — an empty .then, a .then that answers without reading the value, a
    // .catch(() => null) — and its mutant M1 inside the classed handleMessage scope (the pick's `.then((ok) => {` made
    // `.then(() => {}, (ok) => {`: the person never hears ok === false) are each red by name
    dropped = []; metaSites({ 'src/ws-handler.js': WH0 + "\nfunction zzEmptyThen(sock, m) { writeSessionMeta(sock, m, { durable: true }).then(() => {}); }\nfunction zzThenIgnores(sock, m, res) { writeSessionMeta(sock, m, { durable: true }).then(() => res.json({ ok: true })); }\nfunction zzCatchNull(sock, m, ws) { ws.send('{}'); writeSessionMeta(sock, m, { durable: true }).catch(() => null); }\nfunction zzThenPass(sock, m) { writeSessionMeta(sock, m, { durable: true }).then((ok) => ok); }\nfunction zzFinally(sock, m, ws) { writeSessionMeta(sock, m, { durable: true }).finally(() => { ws.send('{}'); }); }\nfunction zzThenRest(sock, m) { writeSessionMeta(sock, m, { durable: true }).then((...ok) => {}); }\nfunction zzThenReads(sock, m, ws) { writeSessionMeta(sock, m, { durable: true }).then((ok) => { if (!ok) ws.send('{}'); }); }\nfunction zzThenPassKept(sock, m) { return writeSessionMeta(sock, m, { durable: true }).then((ok) => ok); }\n" });
    const ctl6 = dropped.slice(); dropped = [];
    const M1 = "modelOrigin: s2._modelOrigin || null }, { durable: true }).then((ok) => {";
    dropped = []; if (WH0.includes(M1)) metaSites({ 'src/ws-handler.js': WH0.replace(M1, "modelOrigin: s2._modelOrigin || null }, { durable: true }).then(() => {}, (ok) => {") });
    const ctlM1 = dropped.slice(); dropped = [];
    ok(['zzEmptyThen', 'zzThenIgnores', 'zzCatchNull', 'zzThenPass', 'zzFinally', 'zzThenRest'].every((n) => ctl6.some((x) => x.includes(`«${n}»`))) && !ctl6.some((x) => /«zzThenReads»|«zzThenPassKept»/.test(x)) && WH0.includes(M1) && ctlM1.some((x) => /«registerWsHandler > handleMessage»/.test(x)),
      `CONTROL (round 6 + its amend): \`.then(() => {})\`, \`.then(() => res.json(…))\`, \`.catch(() => null)\`, \`.then((ok) => ok);\` dropped, a \`.finally\` with a body, \`.then((...ok) => {})\` and the verifier's M1 in handleMessage (\`.then(() => {}, (ok) => …)\`) are red by name — a .then that READS the value and \`return ….then((ok) => ok)\` are not (${[...ctl6, ...ctlM1].filter((x) => /zz|handleMessage/.test(x)).join(', ') || 'nothing flagged'})`); }
  const sumM = (i) => M.reduce((n, r) => n + r[i], 0);
  ok(!pm.length, `session-meta: ${gm.size} scopes — ${sumM(2)} writes durable before the answer (bindings, a person's acts), ${sumM(3)} paced (stamps, caches, rings, a first version written synchronously)`, pm);
  const WH = fs.readFileSync(path.join(REPO, 'src/ws-handler.js'), 'utf8');
  const lockW = "modelLocked: session._modelLocked, lockedModel: session._lockedModel, lockedContext: session._lockedContext }, { durable: true })";   // B-6c55: the fact rides the same durable write
  ok(WH.includes(lockW) && judgeM(metaSites({ 'src/ws-handler.js': WH.replace(lockW, "modelLocked: session._modelLocked, lockedModel: session._lockedModel, lockedContext: session._lockedContext })") })).some((x) => x.startsWith('MOVED: src/ws-handler.js|registerWsHandler > handleMessage')),
    'CONTROL: the model lock without `durable` (a person\'s act paced) is red by name');
  const SS = fs.readFileSync(path.join(REPO, 'src/agent-routes/status.js'), 'utf8');
  ok((SS.match(/sessionStatus\.persisted\(\)/g) || []).length === 2 && /persisted\(\) \{/.test(fs.readFileSync(path.join(REPO, 'src/session-status.js'), 'utf8')),
    'session-status: the person\'s override / clear and the agent\'s own report are on disk before their routes answer (persisted() — the writer\'s next write); notices, history and rekeys stay paced');
}


// ── ⑧ THE STORE READ (B-f276, lane bl-jobs 2026-11-17): src/store-read.js, PURE — one read's outcome → data | missing |
// unreadable (bytes READ that do not parse are corrupt, and pass through afterSetAside); and THE CENSUS of every store's
// read branch as a RATCHET over ①'s files: a file whose CODE holds a set-aside name (a `.corrupt-` string, never a comment) is
// a row — `answer` (reads through storeAnswer), `right` (judged by hand), `names` (names those files, reads no store) or
// `debt` (a failed read is set aside or read as empty: the next save writes over a file that was never read). Debt only
// SHRINKS: a debt row whose old shape is gone is red until flipped to `answer` with READ_DEBT_CAP lowered; a new file with a
// set-aside and no row is red. Its controls run the same census over patched copies of the texts, in memory.
console.log('⑧ the store read (B-f276): three answers, and the census of every store\'s read as a ratchet');
{
const SR = require(path.join(REPO, 'src/store-read.js'));
const err = (code) => Object.assign(new Error(code + ': stand-in'), { code });
// §1 storeAnswer: three answers, and corrupt only for bytes that were READ
{
  const A = (read, o) => SR.storeAnswer(read, o);
  const m = A({ error: err('ENOENT') });
  ok(m.state === 'missing' && m.writable === true, 'ENOENT ⇒ missing (start empty, writable)', m);
  for (const code of ['EIO', 'EACCES', 'ETIMEDOUT', 'ELOOP', 'EISDIR', 'EBUSY', 'EMFILE']) {
    const u = A({ error: err(code) });
    ok(u.state === 'unreadable' && u.code === code && u.writable === false && u.why === 'the read failed', `a read that FAILED (${code}) ⇒ unreadable, NOT writable — never corrupt, never empty`, u);
  }
  const nameless = A({ error: new TypeError('x') });
  ok(nameless.state === 'unreadable' && nameless.code === 'TypeError', 'a thrown error with no code ⇒ unreadable by its name', nameless);
  const d = A({ text: '[{"id":"a"}]' }, { valid: Array.isArray });
  ok(d.state === 'data' && d.writable === true && d.value[0].id === 'a', 'bytes that parse to the shape ⇒ data', d);
  const torn = A({ text: '[{"id":"a"' }, { valid: Array.isArray });
  ok(torn.state === 'corrupt' && torn.why === 'did not parse' && torn.error instanceof SyntaxError && torn.writable === false, 'bytes READ that do not parse ⇒ corrupt (the caller sets them aside)', torn);
  const shape = A({ text: '{"records":[]}' }, { valid: Array.isArray });
  ok(shape.state === 'corrupt' && shape.why === 'not the expected shape' && shape.error === null, 'bytes that parse to the wrong shape ⇒ corrupt', shape);
  ok(A({ text: '' }).state === 'corrupt', 'zero bytes ⇒ corrupt (a torn write, never «no records»)');
  ok(A({ text: '[]' }, { valid: () => { throw new Error('x'); } }).state === 'corrupt', 'a shape check that throws ⇒ corrupt, never a throw');
  ok(A(null).state === 'unreadable' && A({}).state === 'unreadable' && A(undefined).writable === false, 'no outcome at all ⇒ unreadable');
  ok(A({ text: 'x' }, { parse: (t) => t.toUpperCase() }).value === 'X', 'the parse is the caller\'s (opts.parse)');
}

// ── §2 afterSetAside: torn bytes safe beside the store ⇒ missing; not safe ⇒ unreadable ──
{
  const c = SR.storeAnswer({ text: '[' });
  const s = SR.afterSetAside(c, 'jobs.json.corrupt-17');
  ok(s.state === 'missing' && s.setAside === 'jobs.json.corrupt-17' && s.writable === true && s.why === 'did not parse', 'set aside (a name) ⇒ missing: start empty, the name said', s);
  const n = SR.afterSetAside(c, null);
  ok(n.state === 'unreadable' && n.code === 'not set aside' && n.writable === false && /could not be set aside/.test(n.why), 'NOT set aside ⇒ unreadable: the live file is the bytes\' only copy — never written over', n);
  const d = SR.storeAnswer({ text: '[]' });
  ok(SR.afterSetAside(d, null) === d && SR.afterSetAside(SR.storeAnswer({ error: err('EIO') }), 'x').state === 'unreadable', 'any other answer passes through (a failed read is never «set aside»)');
}

// ── §3 retryDelay ──
ok([1, 2, 3, 4, 5, 9, 1e9].map((n) => SR.retryDelay(n)).join() === '30000,60000,120000,240000,300000,300000,300000', 'the read again: 30 s doubling, never past 5 min');
ok(SR.retryDelay(0) === 30000 && SR.retryDelay('x') === 30000 && SR.retryDelay(3, { firstMs: 40, maxMs: 100 }) === 100, 'a nonsense try is the first; the numbers are the caller\'s');

// ── §3b PURE: the helper reaches nothing ──
{
  const t = fs.readFileSync(path.join(REPO, 'src/store-read.js'), 'utf8').replace(/\/\/.*$/gm, '');
  ok(!/\brequire\(|\bimport\b|\bprocess\.|\bDate\.now|\bsetTimeout|\bfs\./.test(t), 'src/store-read.js is PURE: no require, no fs, no clock, no timer, no process');
}

// ── §4 THE CENSUS — every store's read branch, a ratchet ──
// marks: the store's read as the row says it is (an `answer` row: its storeAnswer call; a `debt` row: the release's shape)
const STORE_READS = [
  // CONVERTED (B-f276): every read goes through src/store-read.js storeAnswer — a failed read is held, never set aside
  { file: 'src/server/otel-ingest.js', store: 'usage-history/otel-token', state: 'answer', mark: /const a = SR\.storeAnswer\(read, \{ parse: parseToken, valid: TOKEN_SHAPE \}\);/ },   // B-f276 family unit 2 (lane bl-loop-a): the OTel sign-in value HELD unread, torn bytes kept aside once
  { file: 'src/telemetry.js', store: 'telemetry/.instance-id', state: 'answer', mark: /const a = SR\.storeAnswer\(read, \{ parse: IID_PARSE, valid: IID_SHAPE \}\);/ },   // B-f276 (r4721, lane lg-vault-stages): the instance id HELD unread (the helper, its own parse), torn bytes kept aside once
  { file: 'src/server/host-tokens.js', store: 'agentd/host-<id>.token', state: 'answer', mark: /const a = SR\.storeAnswer\(read, \{ parse: TOKEN_PARSE, valid: TOKEN_SHAPE \}\);/ },   // B-f276 (r4721): a machine's link token HELD unread (the no-vault window), torn bytes kept aside once, then a fresh one
  { file: 'src/signin-witness.js', store: 'instance.json', state: 'answer', mark: /const instanceAnswer = SR\.storeAnswer\(read, \{ valid: instanceValid \}\);/, why: '主开发 r3336: the data folder own id file — its one read answered here (startFactsSync), held by src/auth.js through src/store-read-hold.js, its torn bytes kept aside (idAsideOf)' },
  { file: 'src/jobs.js', store: 'jobs.json', state: 'answer', mark: /this\._loadAnswer\(SR\.storeAnswer\(read, \{ valid: STORE_SHAPE \}\)\)/ },
  { file: 'src/jobs.js', store: 'jobs-archive.json', state: 'answer', mark: /this\._archiveAnswer\(SR\.storeAnswer\(read, \{ valid: Array\.isArray \}\)\)/ },
  { file: 'src/server/doc-engine.js', store: 'doc-owners.json', state: 'answer', mark: /const a0 = SR\.storeAnswer\(read, \{ valid: memoShape \}\);/ },   // r3332 (lane bl-proposals): the owner memo under the store-read law
  { file: 'src/task-groups.js', store: 'task-groups.json', state: 'answer', mark: /const a = SR\.storeAnswer\(read\(this\._file\), \{ valid: STORE_SHAPE \}\);/ },   // lane bl-windows 2026-11-18: THE STORE HELD UNREAD (⑨ below)
  // RIGHT WITHOUT THE HELPER (judged by hand, 2026-11-17): a failed read refuses or answers an error; only unparsable bytes are set aside
  { file: 'src/server/integration-store.js', store: 'integrations.json', state: 'right', why: 'a failed read refuses (unreadable()); only a parse/shape failure is archived', mark: /return unreadable\('exists but cannot be read', e\);/ },
  { file: 'src/app-serve.js', store: 'apps manifest.json', state: 'right', why: 'a failed read is an error; only an unparsable manifest is set aside, at the next write', mark: /catch \(e\) \{ if \(e\.code === 'ENOENT'\) return \{ manifest: A\.emptyManifest\(\), error: null \}; return \{/ },
  { file: 'src/job-logs-sweep-worker.js', store: 'jobs-logs-sweep.json', state: 'right', why: 'a failed read makes the pass wait; only unparsable bytes are set aside', mark: /if \(!e \|\| e\.code !== 'ENOENT'\) return \{ error: `the catch-up record could not be read: / },
  { file: 'src/server/writes-lost.js', store: 'writes-lost.json', state: 'right', why: 'a failed read is no answer (readFailed, read again); only bytes that are no store are set aside (`.unreadable-`)', mark: /if \(e\.code !== 'ENOENT'\) return readFailed\(`not read/ },
  { file: 'src/server/queued-wakes.js', store: 'msg-queued.json', state: 'right', why: 'a failed read is held (unread: never written over, read again — B-e3fe); the bytes are set aside (`.unreadable-`) only by the person\'s press (setAside, POST /api/queued-wakes/set-aside), after one more read', mark: /if \(readsNow\) \{ joinHeld\(held\); persist\(\); return \{ ok: true, state: 'none' \}; \}/ },
  { file: 'src/server/browser-passkey-file.js', store: '(none)', state: 'names', why: 'names the passkey store\'s set-aside copies for the key-file law (sealed passkeys kept aside count as ciphertext: no new key over them); sets nothing aside — the store is read by src/server/browser-dialogs.js (its answer row)', mark: /\.filter\(\(n\) => n\.startsWith\('browser-passkeys\.json\.corrupt-'\)\)/ },   // r3261 (bl-browser-b)
  { file: 'src/job-logs-sweep.js', store: '(none)', state: 'names', why: 'names the set-aside and note files the clean-up honours; reads no store', mark: /const NOTE_SUFFIX = '\.corrupt-unread';/ },
  // DEBT (B-f276's census, 2026-11-17) — each is converted by the lane that holds its file; then its row flips to `answer` and READ_DEBT_CAP drops
  { file: 'src/channel-store.js', store: 'channels/*.json (loadJsonFamily)', state: 'answer', mark: /try \{ st = fam\.H\.readAtStart\(\); \} finally \{ startRead = true; \}\n    fam\.H\.takeText\(\);[^\n]*\n    if \(st === 'data'\) \{ fam\.value = fam\.H\.answer\(\); return fam; \}/ },   // 主开发 r2542: the start read's text taken at once (the line between)   // B-f276 1b (主开发 r809): each family through its store hold (src/store-hold.js — its read is storeAnswer)   // B-f276 unit 1 (bl-windows, 主开发 r457): a failed read HOLDS the family — no rename; the six small ones adopt on a read again, the index and the poll stamps load at the next start
  { file: 'src/server/session-stdout.js', store: 'session-meta/<sock>.json (a family: one record a conversation)', state: 'answer', mark: /const a = require\('\.\.\/store-read\.js'\)\.storeAnswer\(read, \{ valid: metaValid \}\);/ },   // r3137 (lane bl-chat-c): unread vs not there; nothing written over it, writes wait; torn bytes kept aside once and held (r3141)
  { file: 'src/channel-store.js', store: 'channels/<account>/people.json', state: 'answer', mark: /const a = SR\.storeAnswer\(read, \{ valid: PEOPLE_OK \}\);\n    const out = H\.start\(a\) === 'data'/ },   // B-f276 family r3188 (lane bl-mail): held under src/store-read-hold.js — the own id unknown, nothing written over it, its torn bytes kept aside once
  { file: 'src/user-todos.js', store: 'user-todos.json', state: 'answer', mark: /const a0 = SR\.storeAnswer\(this\._readNow\(\), \{ valid: STORE_SHAPE \}\);/ },   // B-44f3: held unread, every write refused by name
  { file: 'src/server/browser-trace.js', store: 'browser-forgotten.json', state: 'answer', mark: /const a = SR\.storeAnswer\(read, \{ valid: FORGOTTEN_SHAPE \}\);\n      if \(fgHold\.start\(a\) === 'data'\)/ },   // r3008 (bl-browser-b): the ledger of the browsers set aside — HELD on a failed read through src/store-read-hold.js (refused by name, never written over); torn bytes kept aside once, then empty (no remover reads its silence)
  { file: 'src/server/browser-keeper.js', store: 'browser-takeovers.json', state: 'answer', mark: /const a = SR\.storeAnswer\(read, \{ valid: TQ_SHAPE \}\);\n    if \(tqHold\.start\(a\) === 'data'\)/ },   // r3261 (bl-browser-b, its second unit): the takeover requests — HELD on a failed read through src/store-read-hold.js (the queue, a request by id and the agent's open request say the hold by name; every writer refused; a page verb refused: fail closed; never written over); torn bytes kept aside once, then empty with the damaged mark
  { file: 'src/server/browser-dialogs.js', store: 'browser-passkeys.json', state: 'answer', mark: /const a = SR\(\)\.storeAnswer\(read, \{ valid: PK_SHAPE \}\);\n        if \(pkStoreHold\.start\(a\) === 'data'\)/ },   // r3261 (bl-browser-b): the passkey store — HELD on a failed read through src/store-read-hold.js (every writer refused by name, a ceremony refused before it answers the site, never written over); torn bytes kept aside once (sealed keys), then empty with the damaged mark
  { file: 'src/server/browser-kept.js', store: 'browser-kept.json', state: 'answer', mark: /const a0 = SR\.storeAnswer\(read, \{ valid: KEPT_SHAPE \}\);\n    store = K\.normalizeKeptStore\(hold\.start\(a0\) === 'data' \? a0\.value : null\);/ },   // r3585 (lane card-door-in-chat): through src/store-read-hold.js — held, read again off the loop, lifted with no restart; a torn lift rebuilt from the kept folders (r3006's fail-closed law kept: browser-env reads the file itself)
  { file: 'src/server/browser-bindings.js', store: 'bindings.json', state: 'answer', mark: /heldOf\(file, opts\)\.hold\.start\(SR\.storeAnswer\(\{ text \}, \{ valid: BINDINGS_SHAPE \}\)\);/ },   // r3585 (lane card-door-in-chat): a failed or torn read engages ONE hold (shared by every instance); a torn lift rebuilt from the conversations' records
  { file: 'src/hosts.js', store: 'hosts.json', state: 'answer', mark: /const a = SR\.storeAnswer\(read, \{ valid: HOSTS_SHAPE \}\);/ },   // remainder of B-f276 (bl-jobs, 2.369.411): held, never written over — 2b: on the family helper
  { file: 'src/machine-mounts.js', store: 'machine-mounts.json', state: 'answer', mark: /const a0 = SR\.storeAnswer\(read, \{ valid: STORE_SHAPE \}\);/ },
  { file: 'src/machine-mounts.js', store: 'host-mounts.json + device-mounts.json', state: 'answer', mark: /const la = SR\.storeAnswer\(read, \{ valid: STORE_SHAPE \}\);/ },   // r4985 (B-f276 slice legacy-mounts-gap), lane lg-remote-hardening: the legacy mount stores held and owed   // remainder of B-f276 (bl-jobs, 2.369.411): held — no save, no legacy ingest, no token sweep — 2b: on the family helper
  { file: 'src/server/conversation-deliver.js', store: 'msg-retry.json', state: 'answer', mark: /return SR\.storeAnswer\(read, \{ valid: RETRY_VALID \}\);/ },   // B-f276's remainder unit 2 (bl-windows, r1702 / r2407): a failed read HOLDS the park — never written over, read again at its own roads
  { file: 'src/server/desktop-app-keeper.js', store: 'desktop-apps-hosts.json', state: 'answer', mark: /const a = SR\.storeAnswer\(read, \{ valid: REMOTE_VALID \}\);\n    if \(a\.state === 'data'\) remote = remoteDocOf\(a\.value\);/ },   // B-f276's remainder unit 2 (r1702: «enters the census»): a failed read HOLDS the paired machines' file; torn bytes set aside
  { file: 'src/server/usage-pool-engine.js', store: 'reset-credit-tries.json', state: 'answer', mark: /let a = SR\.storeAnswer\(read, \{ valid: TRIES_VALID \}\);/ },   // B-f276's remainder (bl-windows, 主开发 r1694 — the money store): a failed read HOLDS (every use refused by name, read again); a set-aside that fails holds too
  // job-notifications.json: torn bytes are set aside through jobs.js asideOf (its read again, off the loop) and an unreadable file is
  // HELD (the remainder of B-f276 — the row flipped to `answer`; it was named here without a set-aside before)
  // the browser registry (lane bl-jobs, the B-f276 remainder, its read r1 N9): through the store-read law — a failed read and torn bytes HOLD
  { file: 'src/server/browser-keeper.js', store: 'browser-profiles.json', state: 'answer', mark: /if \(a\.state === 'data'\) \{ rawDoc = a\.value; reg = B\.normalizeRegistry\(rawDoc\); \}/ },   // its read r2 (N16): the LOAD's line (the read again's storeAnswer is a second, unrelated match)
  // lane lg-store-writes (主开发 2026-11-20 03:10Z): the desktop app records and the device alerts' ledger — a failed read or torn bytes HOLD (never started empty)
  { file: 'src/server/device-alerts.js', store: 'device-alerts.json', state: 'answer', mark: /const a = SR\.storeAnswer\(read, \{ valid: LEDGER_VALID \}\);\n    if \(a\.state === 'data'\) seen = a\.value\.seen;/ },
  { file: 'src/desktop-serve.js', store: 'desktop-apps.json', state: 'answer', mark: /const a = SR\.storeAnswer\(read, \{ valid: STORE_VALID \}\);\n    if \(a\.state === 'data'\) \{ store = \{ apps: a\.value\.apps \}; return; \}/ },
  { file: 'src/server/vault-run-door.js', store: 'vault-run.json', state: 'answer', mark: /const a = lawOf\(SR\.storeAnswer\(read, \{ valid: STORE_VALID \}\)\);/ },   // lane lg-vault-file (主开发 r2920, the store-read law's own for the run door's store): a failed read HOLDS it — every switch refused by name, read again off the loop, «missing» after «unreadable» read once more; torn bytes kept aside once (by their digest)
  { file: 'src/server/vault-run-door.js', store: 'vault-grant-ends.json', state: 'answer', mark: /const a = SR\.storeAnswer\(read, \{ valid: ENDS_VALID \}\);\n    const st = endsHold\.start\(a\);/ },   // r3002 (d): on src/store-read-hold.js — the held ends kept beside it, folded in at the lift   // bl-vault B-a14b (主开发 r542): the grants that ended, kept across a restart — bytes that do not parse set aside (it starts empty), a failed read HELD (never written over)
  { file: 'src/server/job-secrets-door.js', store: 'job-secrets.leftover.json', state: 'answer', mark: /let a = SR\.storeAnswer\(read, \{ valid: REC_VALID \}\);/ },   // bl-vault B-ef1b (主开发 r333): the record of the copies a move made or left — bytes that do not parse set aside (the move refuses by name until a person looked), a failed read HELD (the move refuses, read again at the next press)
  { file: 'src/accounts.js', store: 'accounts.json', state: 'answer', mark: /const a = SR\.storeAnswer\(read, \{ valid: \(v\) => this\._accountsValid\(v\) \}\);\n    if \(this\._hold\.start\(a\) === 'data'\)/ },   // the B-f276 family's gravest store (lane bl-windows, 主开发 r2947 / r3043): on the helper — a failed read HOLDS the list; torn bytes kept aside once and HELD (removers read its silence)
  { file: 'src/jobs.js', store: 'job-notifications.json', state: 'answer', mark: /this\._notifsAnswer\(SR\.storeAnswer\(read, \{ valid: NOTIFS_SHAPE \}\)\);/ },   // remainder of B-f276 (bl-jobs, 2.369.411): held — the waiting notices never written over
  // B-f276 slice jobs-side-files (lane bl-proposals s1126): the lock and a gone wrapper's exit record, held through src/store-read-hold.js
  // (torn bytes kept beside them: the two set-aside names) — never taken, never «no record»
  { file: 'src/jobs.js', store: 'jobs.lock', state: 'answer', mark: /const lockA = SR\.storeAnswer\(read, \{ valid: LOCK_SHAPE \}\);/ },
  { file: 'src/jobs.js', store: 'job-logs/<run>/exit.json', state: 'answer', mark: /const ctlA = SR\.storeAnswer\(read, \{ valid: \(v\) => !!v && typeof v === 'object' && !Array\.isArray\(v\) \}\);/ },
  // B-f276 family unit 1 (lane bl-jobs, 主开发 r2930): three stores a failed read wrote over — through src/store-read-hold.js: a failed read HOLDS (every change refused by name, nothing written, read again off the loop), torn bytes kept aside once per content
  { file: 'src/opencode-serve.js', store: 'opencode-serve.json', state: 'answer', mark: /const a = SR\.storeAnswer\(read, \{ valid: REC_SHAPE \}\);/ },   // r3334 unit 1 (lane bl-chat-b): the OpenCode serve's record HELD unread; torn bytes kept aside once, never lifted as empty by themselves
  { file: 'src/server/sealed-json.js', store: 'dropline-oauth.json (a sealed file that names its hold)', state: 'answer', mark: /H\.start\(SR\.storeAnswer\(\{ error \}\)\)/ },   // r3334 unit 2 (lane bl-chat-b): the voice sign-in HELD unread; torn bytes kept aside once (0600), then read as absent with the damage said
  { file: 'src/server/decision-engine.js', store: 'decision-memo.json', state: 'answer', mark: /\{ const a = SR\.storeAnswer\(readOf\(F\.memo\), \{ valid: MEMO_SHAPE \}\); if \(memoHold\.start\(a\) === 'data'\) memoLoad\(a\.value\); \}/ },   // B-f276 family (lane bl-loop-a, r3175)
  { file: 'src/server/decision-engine.js', store: 'decision-usage.json', state: 'answer', mark: /\{ const a = SR\.storeAnswer\(readOf\(F\.usage\), \{ valid: USAGE_SHAPE \}\); if \(usageHold\.start\(a\) === 'data'\) usage = a\.value; \}/ },
  { file: 'src/mounts.js', store: 'mounts.json', state: 'answer', mark: /const a = SR\.storeAnswer\(read, \{ valid: MOUNTS_SHAPE \}\);\n    if \(this\._hold\.start\(a\) === 'data'\) this\._state = a\.value;/ },
  // 主开发 r3262 / r3271 (lane lg-recovery): the synced stores' ONE read (drafts, stage-sync, uploads-sync, settings-sync) through src/store-read-hold.js — held: nothing written over (the 2 s save, the stop's, the crash's), the pages told HELD; while held the hub takes nothing for it, each page keeps what it typed and sends it at the store's first snapshot (主开发 r3654 / r3890)
  { file: 'src/sync-store.js', store: 'drafts.json, stage-sync.json, uploads-sync.json, settings-sync.json', state: 'answer', mark: /const a = SR\.storeAnswer\(read, \{ valid: STORE_SHAPE \}\);\n    const st = this\._hold\.start\(a\);/ },
  { file: 'src/webdav.js', store: 'mount-tokens.json', state: 'answer', mark: /const a = SR\.storeAnswer\(read, \{ valid: TOKENS_SHAPE \}\);\n    if \(this\._hold\.start\(a\) === 'data'\) this\._state = a\.value;/ },
  { file: 'src/server/vault-engine.js', store: 'vault.json', state: 'answer', mark: /recordHold\.start\(SR\.storeAnswer\(\{ error: e \}\)\);/ },   // r3002 (b): a failed read HELD and read again (record_unreadable); torn bytes stay damaged, never «not set up»
  { file: 'src/server/vault-totp.js', store: 'vault-grants.json', state: 'answer', mark: /hold\.start\(SR\.storeAnswer\(read, \{ valid: GRANTS_SHAPE \}\)\);/ },   // r3002 (c): held at the start; another shape kept aside once; an unknown row carried
  { file: 'src/server/vault-use-grants.js', store: 'vault-use-marks.json', state: 'answer', mark: /const st = marksHold\.start\(SR\.storeAnswer\(read, \{ valid: MARKS_SHAPE \}\)\);/ },   // r3002 (a): the marks held (src/store-read-hold.js); torn marks leave rows UNDECIDED
  { file: 'src/usage-reset-claim.js', store: 'usage-reset-claims.json', state: 'answer', mark: /const a = read \? SR\.storeAnswer\(read, \{ valid: isObj \}\) : \{ state: 'missing' \};/ },   // r3003 (b), lane hub-loop-stalls: the reset claims held (src/store-read-hold.js)
  { file: 'src/server/conversation-deliver.js', store: 'msg-stash.json', state: 'answer', mark: /const a0 = SR\.storeAnswer\(read0, \{ valid: STASH_SHAPE \}\);\n    if \(stashHold\.start\(a0\) === 'data'\) stash = a0\.value; \}/ },   // r3003 (a), lane hub-loop-stalls: msg-stash.json held (src/store-read-hold.js)
  { file: 'src/server/stash-handover.js', store: 'stash-handover.json', state: 'answer', mark: /const a = SR\.storeAnswer\(read, \{ valid: isObj \}\);\n    if \(memHold\.start\(a\) === 'data'\) loadRecords\(a\.value\);/ }, // r3003 (c), lane hub-loop-stalls: the hand-over memory held (src/store-read-hold.js)
  { file: 'src/server/login-expiry-watch.js', store: 'login-expiry.json', state: 'answer', mark: /const a = SR\.storeAnswer\(read, \{ valid: isObj \}\);\n    if \(hold\.start\(a\) === 'data'\) load\(a\.value\); \}/ },   // r3003 (d), lane hub-loop-stalls: the login warnings' record held (src/store-read-hold.js)
  { file: 'src/server/device-upgrade-watch.js', store: 'device-upgrades.json', state: 'answer', mark: /const a = SR\.storeAnswer\(read, \{ valid: isObj \}\);\n    if \(hold\.start\(a\) === 'data'\) load\(a\.value\); \}/ },   // r4718 (B-f276), lane lg-remote-hardening: the machines' agent updates record held (src/store-read-hold.js)
  { file: 'src/server/dial-health-watch.js', store: 'dial-health.json', state: 'answer', mark: /const a = SR\.storeAnswer\(read, \{ valid: isObj \}\);\n    if \(hold\.start\(a\) === 'data'\) ledger = isObj\(a\.value\.hosts\) \? a\.value\.hosts : \{\}; \}/ },   // r4718 (B-f276), lane lg-remote-hardening: the extra dialing agents record held
  // B-f276 (lane hub-loop-stalls, r4719): four said-once records held through src/store-read-hold.js — a failed read held, nothing written over it
  { file: 'src/server/hook-root-watch.js', store: 'hook-root-notice.json', state: 'answer', mark: /const a = SR\.storeAnswer\(read, \{ valid: isMemo \}\);/ },
  { file: 'src/server/tls.js', store: 'tls/state.json', state: 'answer', mark: /const a = SR\.storeAnswer\(read, \{ valid: isState \}\);/ },
  { file: 'src/server/browser-logins.js', store: 'browser-login-reminders.json', state: 'answer', mark: /const a = SR\.storeAnswer\(read, \{ valid: isLedger \}\);/ },
  { file: 'src/server/cli-registration.js', store: 'cli-registration.json', state: 'answer', mark: /const a = SR\.storeAnswer\(read, \{ valid: isRecord \}\);/ },
  { file: 'src/turn-carry.js', store: 'turn-carry-outstanding.json', state: 'answer', mark: /else \{ const a = SR\.storeAnswer\(read, \{ valid: isTable \}\); if \(hold\.start\(a\) === 'data'\) loadRows\(a\.value\); \}/ },   // B-f276 slice hub-own-ledgers (lane bl-scratch): the restart line's table held (src/store-read-hold.js)
  { file: 'src/server/cli-self-measure.js', store: 'cli-self-measure.json', state: 'answer', mark: /const a = SR\.storeAnswer\(\{ text: txt \}, \{ valid: isLedger \}\);\n      if \(a\.state !== 'data'\) \{ readFail = \{ code: 'torn bytes', at: now\(\) \}; hold\.start\(a\); return false; \}/ },   // B-f276 slice hub-own-ledgers (lane bl-scratch): torn bytes kept aside before the ledger reads empty
  { file: 'src/server/window-targets-engine.js', store: 'window-leases.json', state: 'answer', mark: /const a = SR\.storeAnswer\(read, \{ valid: leasesShape \}\); if \(leaseHold\.start\(a\) === 'data'\) applyLeases\(a\.value\);/ },   // lg-recovery (B-f276 slice window-targets, 主开发 r4720): the agents' window holds held (src/store-read-hold.js)
  { file: 'src/server/window-targets-engine.js', store: 'window-reach.json', state: 'answer', mark: /const a = SR\.storeAnswer\(read, \{ valid: reachShape \}\); if \(reachHold\.start\(a\) === 'data'\) applyReach\(a\.value\);/ },   // …and the windows' share modes
  { file: 'src/server/cli-env.js', store: 'usage-cache/__models__.json', state: 'answer', mark: /const a = SR\.storeAnswer\(read, \{ valid: Array\.isArray \}\);\n    const st = modelsHoldOf\(\)\.start\(a\);/ },   // B-f276 slice s1126, lane lg-providers: the learned models list held through store-read-hold (torn bytes kept aside off the loop, the waiting ids written at the lift)
  { file: 'src/sysinfo.js', store: 'sysinfo-history.json', state: 'answer', mark: /const a = SR\.storeAnswer\(read, \{ valid: HIST_SHAPE \}\);\n  if \(hold && typeof hold\.create === 'function'\) \{\n    _histHold = hold\.create\(/ },   // B-f276 slice resource-history (lane nl-paired, 主开发 r4991): the history's read held — src/store-read.js required (PURE, in the device bundle already), the hold HANDED IN by the hub's start
  { file: 'src/plugins.js', store: 'plugins.json', state: 'answer', mark: /const a0 = SR\.storeAnswer\(read, \{ valid: PLUGINS_SHAPE \}\);\n    this\._state = this\._hold\.start\(a0\) === 'data' \? a0\.value : \{ plugins: \{\} \};/ },
  // r3004 (lane bl-loop-b): the setting holds through src/store-read-hold.js — a failed read HOLDS (no timed raise, nothing written)
  { file: 'src/server/setting-holds.js', store: 'setting-holds.json', state: 'answer', mark: /const a0 = SR\.storeAnswer\(read, \{ valid: HOLDS_SHAPE \}\);\n    if \(hold\.start\(a0\) === 'held'\)/ },
  // r3004 (lane bl-loop-b): the auto-continue waits and the loop-breaker through src/store-read-hold.js — held: no automatic continue
  { file: 'src/server/auto-resume.js', store: 'auto-resume.json', state: 'answer', mark: /const a0 = SR\.storeAnswer\(read, \{ valid: AR_SHAPE \}\); if \(hold\.start\(a0\) === 'data'\) loadInto\(a0\.value\);/ },
  { file: 'src/routes/files.js', store: 'extract-journal.json', state: 'answer', mark: /const a = SR\.storeAnswer\(read, \{ valid: journalValid \}\);\n  const st = journalHold\.start\(a\);/ },   // r3333 unit 2
  { file: 'src/server/agent-listener.js', store: 'agent-door.json', state: 'answer', mark: /const a = stateFile \? await readRecord\(stateFile\) : \{ state: 'missing' \};[\s\S]{0,900}?held = run\.hold\.start\(a\) === 'held';/ },   // r3333 unit 1 (readRecord answers through SR.storeAnswer)
  { file: 'src/server/voice-teach-engine.js', store: 'voice-suggestions.json', state: 'answer', mark: /const a = SR\.storeAnswer\(read, \{ valid: ledgerValid \}\);[\s\S]{0,900}?const st = ledgerHold\.start\(a\);/ }, // r3333 unit 3
  { file: 'src/server/cli-unmeasured-notice.js', store: 'cli-unmeasured-notice.json', state: 'answer', mark: /const a = SR\.storeAnswer\(read, \{ valid: memoryValid \}\);[\s\S]{0,900}?const st = hold\.start\(a\);/ }, // r3333 unit 3
  { file: 'src/server/ops-routes.js', store: 'maintenance.json', state: 'answer', mark: /const a = require\('\.\.\/store-read\.js'\)\.storeAnswer\(read, \{ valid: maintValid \}\);\n  if \(maintHold\.start\(a\) === 'data'\) _maintenance = a\.value; \}/ },   // r3333 unit 3,
  { file: 'src/server/cli-model-catalog.js', store: 'cli-model-catalog.json', state: 'answer', mark: /const a = SR\.storeAnswer\(read, \{ valid: ledgerValid \}\);[\s\S]{0,700}?if \(st\.hold\.start\(a\) === 'data'\) l = a\.value;/ }, // r3333 unit 3
  { file: 'src/server/provider-store.js', store: 'providers.json', state: 'answer', mark: /const a0 = SR\.storeAnswer\(read0, \{ valid: PROVIDERS_SHAPE \}\);\n  if \(hold\.start\(a0\) === 'data'\) records = load\(a0\.value\);/ },   // lane lg-providers (B-f276 family, 主开发 r3000 / r3019): held on a failed read; torn bytes kept aside once (its second set-aside name: the orphaned-key remover reads the kept copies)
  // 主开发 r3005 (the content stores, lane card-door-in-chat): a failed read wrote over the share links — through src/store-read-hold.js
  { file: 'src/server/published-pages.js', store: 'published-pages.json', state: 'answer', mark: /const a0 = SR\.storeAnswer\(read, \{ valid: PAGES_SHAPE \}\);\n    if \(hold\.start\(a0\) === 'data'\) store = a0\.value/ },
  // B-f276's family, its third form, unit 1 (lane bl-ci, 主开发 r3145): the webhook adapter's two files a failed read wrote over (the
  // callers list: every path's callers, their token hashes and sealed tokens; the pending pairing codes) — held through src/store-read-hold.js
  { file: 'src/channels/webhook.js', store: 'channels/webhook/callers.json', state: 'answer', mark: /const a = SR\.storeAnswer\(read, \{ valid: CALLERS_SHAPE \}\);\s+doc = hold\.start\(a\) === 'data' \? a\.value : \{ v: 1, paths: \{\} \};/ },
  { file: 'src/channels/webhook.js', store: 'channels/webhook/pair-pending.json', state: 'answer', mark: /const a = SR\.storeAnswer\(read, \{ valid: PENDING_SHAPE \}\);\s+value = hold\.start\(a\) === 'data' \? a\.value : \{ v: 1, rows: \[\] \};/ },
  { file: 'src/session-status.js', store: 'session-status.json', state: 'answer', mark: /const a0 = SR\.storeAnswer\(read, \{ valid: STATUS_SHAPE \}\);\n    if \(this\._hold\.start\(a0\) === 'data'\) \{ this\._state = a0\.value;/ },   // 主开发 r3005, lane card-door-in-chat
  { file: 'src/server/feedback-store.js', store: 'feedback.json', state: 'answer', mark: /const a0 = SR\.storeAnswer\(read, \{ valid: FB_SHAPE \}\);\n    if \(hold\.start\(a0\) === 'data'\) state = fromRaw\(a0\.value\); \}/ },   // 主开发 r3005, lane card-door-in-chat
  { file: 'src/server/feedback-forward.js', store: 'feedback-outbox.json', state: 'answer', mark: /const a0 = SR\.storeAnswer\(read, \{ valid: OUTBOX_SHAPE \}\);\n    if \(hold\.start\(a0\) === 'data'\) state = fromRaw\(a0\.value\); \}/ },   // 主开发 r3005, lane card-door-in-chat
  { file: 'src/server/design-engine.js', store: 'designs.json', state: 'answer', mark: /const a0 = SR\.storeAnswer\(read, \{ valid: DESIGNS_SHAPE \}\);\n    if \(hold\.start\(a0\) === 'data'\) store = a0\.value; \}/ },   // 主开发 r3005, lane card-door-in-chat
  { file: 'src/server/channels-attention.js', store: 'decision-examples.json', state: 'answer', mark: /const a0 = SR\.storeAnswer\(read, \{ valid: EX_SHAPE \}\);\n    return hold\.start\(a0\) === 'data' \? fromDoc\(a0\.value\) : \[\];/ },   // 主开发 r3005, lane card-door-in-chat
  { file: 'src/server/channel-api.js', store: 'channels/api-proposals.json', state: 'answer', mark: /const a0 = SR\.storeAnswer\(read, \{ valid: PROPOSALS_SHAPE \}\);\n    const j = hold\.start\(a0\) === 'data' \? a0\.value : \{\};/ },   // 主开发 r3005, lane card-door-in-chat
  { file: 'src/server/apps-engine.js', store: 'app-proposals.json', state: 'answer', mark: /const a0 = SR\.storeAnswer\(read, \{ valid: APPS_SHAPE \}\);\n    if \(hold\.start\(a0\) === 'data'\) store = / },   // 主开发 r3005, lane card-door-in-chat
  // r3136 (lane login-request-card, the store census form 3 item 2): an account's usage reading file — its writer's read through
  // the law's answer at EVERY write (a family of files, one an account: a failed read refuses the write and the reading waits in
  // memory; torn bytes kept aside once per content, then the file starts again marked «started again»)
  { file: 'src/usage-cache-write.js', store: 'usage-cache/<account>.json', state: 'answer', mark: /return \{ \.\.\.SR\.storeAnswer\(read\), buf: read\.buf \|\| null \};/ },
  { file: 'src/server/plugin-loader.js', store: 'plugin-registry.json', state: 'answer', mark: /const a0 = SR\.storeAnswer\(read, \{ valid: REGISTRY_SHAPE \}\); if \(hold\.start\(a0\) === 'data'\) registry = normalize\(a0\.value\);/ },   // bl-browser-a (主开发 r3305): held, never empty
  // B-f276's family, its third form, unit 2 (lane bl-ci, 主开发 r3145 + r3181): the person's edited prices, which the START wrote the defaults
  // over after a failed read — held through src/store-read-hold.js
  { file: 'src/usage-history.js', store: 'usage-history/pricing.json', state: 'answer', mark: /const a0 = SR\.storeAnswer\(read, \{ valid: PRICING_SHAPE \}\);\s+const st = this\._pricingHold\.start\(a0\);/ },
  { file: 'src/port-forward.js', store: 'port-forwards.json', state: 'answer', mark: /const a = SR\.storeAnswer\(read, \{ valid: PF_SHAPE \}\);\n    this\._state = this\._hold\.start\(a\) === 'data' \? a\.value : \{ forwards: \[\] \};/ },   // r3009 (lane bl-machines-a): on the store-read hold
  { file: 'src/server/instance-url.js', store: 'instance-url.json', state: 'answer', mark: /const a = SR\.storeAnswer\(read, \{ valid: SHAPE \}\); if \(hold\.start\(a\) === 'data'\) Object\.assign\(state, a\.value \|\| \{\}\);/ },   // r3009 (lane bl-machines-a): on the store-read hold
];
const READ_DEBT_CAP = 0;     // 1 → 0: msg-retry.json — bl-windows B-f276's remainder unit 2 (moved onto the release 2.369.417, r3478); 2 → 1: browser-kept.json — the sweep's fail-closed law (lane bl-windows, 主开发 r3006): never set aside, never written over (a row judged by hand); lower it as each debt row flips to `answer` — never raise it (8 → 7: hosts.json, 7 → 6: machine-mounts.json, 6 → 5: job-notifications.json — bl-jobs B-f276's remainder, 5 → 4: user-todos.json — bl-windows B-44f3, 4 → 3: channels/*.json — bl-windows B-f276 unit 1, 3 → 2: reset-credit-tries.json — bl-windows B-f276's remainder)
const READ_DEBT_AT_BIRTH = 8;            // the census's first count (2026-11-17): DEBT_CAP never passes it
const STATES = new Set(['answer', 'right', 'names', 'debt']);
const USES_HELPER = /require\(['"](?:\.{1,2}\/)+(?:[\w-]+\/)*store-read(?:\.js)?['"]\)/;

const treeTexts = () => new Map(censusFiles(REPO).map((f) => [f, repoText(f)]));   // the hub's main-process files (①'s list)
/** the files whose CODE holds a set-aside name (a string or template piece with `.corrupt-` — never a comment) */
const SET_ASIDE = /\.(corrupt|unreadable)-/, SET_ASIDE_G = /\.(corrupt|unreadable)-/g;   // the two names the tree sets bytes aside under
// the set-aside names per file, EXACT — a second store with a set-aside in a file that already has a row is red by its count
const SITES = { 'src/server/cli-env.js': 1, 'src/server/decision-engine.js': 2, 'src/turn-carry.js': 1, 'src/server/cli-self-measure.js': 1, 'src/server/browser-dialogs.js': 1, 'src/server/browser-passkey-file.js': 1, 'src/server/browser-keeper.js': 1, 'src/opencode-serve.js': 1, 'src/signin-witness.js': 1, 'src/server/doc-engine.js': 1, 'src/accounts.js': 1, 'src/routes/files.js': 1, 'src/server/agent-listener.js': 1, 'src/usage-reset-claim.js': 1, 'src/server/login-expiry-watch.js': 1, 'src/server/device-upgrade-watch.js': 1, 'src/server/dial-health-watch.js': 1, 'src/jobs.js': 5, 'src/app-serve.js': 1, 'src/channel-store.js': 2, 'src/channels/webhook.js': 2, 'src/hosts.js': 1, 'src/server/desktop-app-keeper.js': 1, 'src/job-logs-sweep-worker.js': 1, 'src/job-logs-sweep.js': 1, 'src/machine-mounts.js': 2 /* r4985 (lane lg-remote-hardening): + the legacy stores' torn bytes at a read again, kept aside by the helper */, 'src/mounts.js': 1, 'src/sync-store.js': 1, 'src/plugins.js': 1, 'src/server/published-pages.js': 1, 'src/session-status.js': 1, 'src/server/feedback-store.js': 1, 'src/server/feedback-forward.js': 1, 'src/server/design-engine.js': 1, 'src/server/channels-attention.js': 1, 'src/server/channel-api.js': 1, 'src/server/apps-engine.js': 1, 'src/server/setting-holds.js': 1, 'src/server/auto-resume.js': 1, 'src/webdav.js': 1, 'src/server/browser-trace.js': 1, 'src/server/conversation-deliver.js': 2, 'src/server/integration-store.js': 1, 'src/server/job-secrets-door.js': 2, 'src/server/queued-wakes.js': 1, 'src/server/provider-store.js': 2, 'src/server/session-stdout.js': 1, 'src/server/usage-pool-engine.js': 1, 'src/server/vault-run-door.js': 2, 'src/server/vault-totp.js': 1, 'src/server/vault-use-grants.js': 1, 'src/server/writes-lost.js': 1, 'src/user-todos.js': 1, 'src/usage-cache-write.js': 2, 'src/server/vault-engine.js': 1, 'src/server/voice-teach-engine.js': 1, 'src/server/cli-unmeasured-notice.js': 1, 'src/server/ops-routes.js': 1, 'src/server/cli-model-catalog.js': 1, 'src/server/stash-handover.js': 1, 'src/server/browser-kept.js': 1, 'src/server/browser-bindings.js': 1, 'src/server/hook-root-watch.js': 1, 'src/server/tls.js': 1, 'src/server/browser-logins.js': 1, 'src/server/cli-registration.js': 1 };   // + four: B-f276's said-once records (lane hub-loop-stalls, r4719)
SITES['src/server/otel-ingest.js'] = 1;   // B-f276 family unit 2: the sign-in value's torn bytes, kept aside once
SITES['src/telemetry.js'] = 1;   // B-f276 (r4721): the instance id's torn bytes, kept aside once (the helper's copy, named here)
SITES['src/server/host-tokens.js'] = 1;   // B-f276 (r4721): a link token's torn bytes, kept aside once (the helper's copy, named here)
SITES['src/server/plugin-loader.js'] = 1;   // bl-browser-a (主开发 r3305): plugin-registry.json's torn bytes, kept aside by the helper
SITES['src/usage-history.js'] = 1;   // bl-ci (r3145 unit 2): pricing.json's torn bytes, kept aside by the helper
SITES['src/sysinfo.js'] = 1;   // nl-paired (B-f276, r4991): the CPU and memory history's torn bytes, kept aside once by the hold handed in
SITES['src/server/sealed-json.js'] = 1;   // r3334 unit 2 (lane bl-chat-b): dropline-oauth.json's torn bytes, kept aside by the helper
SITES['src/port-forward.js'] = 1;   // bl-machines-a (r3009, 1 of 2): port-forwards.json's torn bytes, kept aside by the helper
SITES['src/server/instance-url.js'] = 1;   // bl-machines-a (r3009, 2 of 2): instance-url.json's torn bytes, kept aside by the helper
SITES['src/server/window-targets-engine.js'] = 2;   // lg-recovery (B-f276 slice window-targets, 主开发 r4720): window-leases.json's and window-reach.json's torn bytes, kept aside by the helper
const tokenHit = new Map();   // a text's verdict, once (the controls re-run the census over copies that differ in ONE file)
function setAsideFiles(texts) {
  const out = [];
  for (const [f, src] of texts) {
    if (!SET_ASIDE.test(src)) continue;
    if (tokenHit.has(src)) { if (tokenHit.get(src)) out.push([f, tokenHit.get(src)]); continue; }
    let hits = 0;
    try {
      for (const t of AC.tokenizer(src, { ecmaVersion: 'latest', sourceType: /\.mjs$/.test(f) || /^\s*(import|export)\s/m.test(src) ? 'module' : 'script', allowHashBang: true, allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true })) {
        if ((t.type.label === 'string' || t.type.label === 'template') && SET_ASIDE.test(String(t.value))) hits++;
      }
    } catch { hits = (src.match(SET_ASIDE_G) || []).length; }   // a file the tokenizer cannot read is judged by its text (the safe side: it needs a row)
    tokenHit.set(src, hits);
    if (hits) out.push([f, hits]);
  }
  return out.sort((a, b) => (a[0] < b[0] ? -1 : 1));
}
/** THE CENSUS over a set of file texts → its problems (each a sentence naming the file) */
function census(texts, rows = STORE_READS, cap = READ_DEBT_CAP) {
  const problems = [];
  const byFile = new Map();
  for (const r of rows) (byFile.get(r.file) || byFile.set(r.file, []).get(r.file)).push(r);
  for (const [f, n] of setAsideFiles(texts)) {
    if (!byFile.has(f)) problems.push(`${f}: sets bytes aside (\`.corrupt-\` / \`.unreadable-\`) and has NO row — read its store through src/store-read.js storeAnswer (a failed read is held, never set aside or read as empty) and add an 'answer' row`);
    else if (SITES[f] !== n) problems.push(`${f}: ${n} set-aside name(s) in its code, ${SITES[f] || 0} counted — a store read was added or removed: give it its row, then move the count`);
  }
  const seen = new Set();
  for (const r of rows) {
    const key = r.file + ' ' + r.store;
    if (seen.has(key)) problems.push(`${key}: two rows`); seen.add(key);
    if (!STATES.has(r.state)) { problems.push(`${key}: unknown state ${r.state}`); continue; }
    const src = texts.get(r.file);
    if (src == null) { problems.push(`${key}: the row's file is gone — remove the row (and lower READ_DEBT_CAP if it was debt)`); continue; }
    if (!r.mark.test(src)) problems.push(r.state === 'debt' ? `${key}: its marked read line is not there — if the line was only REWORDED, re-pin the row's mark to the new text (nothing else); only if the store reads through storeAnswer now, flip the row to 'answer' (with its call as the mark) and lower READ_DEBT_CAP` : `${key}: its ${r.state === 'answer' ? 'storeAnswer call' : 'judged shape'} is no longer there — read the store again and fix the row`);
    if (r.state === 'answer' && !USES_HELPER.test(src)) problems.push(`${key}: an 'answer' row whose file does not require src/store-read.js`);
  }
  const debt = rows.filter((r) => r.state === 'debt').length;
  if (debt !== cap) problems.push(`DEBT: ${debt} debt rows against READ_DEBT_CAP ${cap} — the cap is the count (lower it when a row flips; a new debt row is refused)`);
  if (cap > READ_DEBT_AT_BIRTH) problems.push(`READ_DEBT_CAP ${cap} is above the census's first count ${READ_DEBT_AT_BIRTH} — the ratchet only shrinks`);
  return problems;
}

const T = treeTexts();
const files = setAsideFiles(T).map(([f]) => f);
console.log('  the table (' + STORE_READS.length + ' rows, ' + STORE_READS.filter((r) => r.state === 'debt').length + ' debt of cap ' + READ_DEBT_CAP + '):');
for (const r of STORE_READS) console.log(`    ${r.state.padEnd(6)} ${r.file} · ${r.store}${r.why ? ' — ' + r.why : ''}`);
ok(files.length === Object.keys(SITES).length && files.includes('src/jobs.js') && files.includes('src/server/writes-lost.js') && !files.includes('src/store-read.js'), `the scan sees the set-aside names in code (${files.length} files, \`.corrupt-\` and \`.unreadable-\`), never a comment`, files);
const now = census(T);
ok(now.length === 0, 'THE CENSUS over the tree: every store with a set-aside has its row, every row\'s mark holds, debt = its cap', now);
// CONTROLS: the same census over patched copies of the texts (in memory)
const withFile = new Map(T); withFile.set('src/server/new-store.js', "'use strict';\nconst fs = require('fs');\nfunction load(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { try { fs.renameSync(f, f + '.corrupt-' + 1); } catch { } return {}; } }\nmodule.exports = { load };\n");
const c1 = census(withFile);
ok(c1.length === 1 && /^src\/server\/new-store\.js: sets bytes aside/.test(c1[0]), 'CONTROL: a NEW store with the old shape (any failure set aside, then empty) is red by its name', c1);
const second = new Map(T); second.set('src/jobs.js', T.get('src/jobs.js') + "\nfunction zzSecondStore(f) { try { return JSON.parse(require('fs').readFileSync(f, 'utf8')); } catch { require('fs').renameSync(f, f + '.corrupt-' + 1); return []; } }\n");
const c0 = census(second);
ok(c0.length === 1 && c0[0].startsWith(`src/jobs.js: ${SITES['src/jobs.js'] + 1} set-aside name(s) in its code, ${SITES['src/jobs.js']} counted`), 'CONTROL: a SECOND store with the old shape in a file that already has rows is red by its count', c0);   // B-f276 s1126: the count from the file's own row (a pinned «4 … 3» went red at every row the file gained)
const commented = new Map(T); commented.set('src/server/notes.js', "// a store's bytes go to <name>.corrupt-<ts>\n/* '.corrupt-' */\nmodule.exports = {};\n");
ok(census(commented).length === 0, 'CONTROL: a set-aside name in a COMMENT is no store');
// the control's store is DERIVED (the last debt row): each conversion of the remainder moves it on by itself (a hard-coded store
// went stale with the first one); its anchor missing fails by name
// …and when NO debt row is left (msg-retry.json was the last, B-f276's remainder unit 2 moved onto 2.369.417), the control PLANTS one in
// memory — a store file of its own and its debt row — so a converted or reworded read line is still red by its row's name
const REAL_DEBT = STORE_READS.filter((r) => r.state === 'debt').pop();
const PLANTED_DEBT = REAL_DEBT ? null : { file: 'src/server/zz-planted-debt-store.js', store: 'zz-planted-debt.json', state: 'debt', why: 'the control\'s own debt row (none is left in the tree)', mark: /let raw = null; try \{ raw = fs\.readFileSync\(F, 'utf8'\); \} catch \{ raw = null; \}/ };
const T_D = PLANTED_DEBT ? new Map([...T, [PLANTED_DEBT.file, "'use strict';\nconst fs = require('fs');\nconst F = 'zz-planted-debt.json';\nfunction load() { let raw = null; try { raw = fs.readFileSync(F, 'utf8'); } catch { raw = null; } return raw; }\nmodule.exports = { load };\n"]]) : T;
const ROWS_D = PLANTED_DEBT ? [...STORE_READS, PLANTED_DEBT] : STORE_READS, CAP_D = PLANTED_DEBT ? 1 : READ_DEBT_CAP;
const LAST_DEBT = REAL_DEBT || PLANTED_DEBT, lastText = LAST_DEBT && T_D.get(LAST_DEBT.file), lastHit = lastText && lastText.match(LAST_DEBT.mark);
ok(!!lastHit, `control setup: the anchor of the control «converted» (the marked read line of the last debt row${LAST_DEBT ? ', ' + LAST_DEBT.file + ' ' + LAST_DEBT.store : ' — there is none'}) is in the source`);
const converted = new Map(T_D); if (lastHit) converted.set(LAST_DEBT.file, lastText.replace(lastHit[0], PLANTED_DEBT ? 'let raw = null;   // reworded' : 'const a = SR.storeAnswer(read);'));
const c2 = census(converted, ROWS_D, CAP_D), reEsc = (x) => String(x).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
ok(c2.length === 1 && !!LAST_DEBT && new RegExp(`^${reEsc(LAST_DEBT.file + ' ' + LAST_DEBT.store)}: its marked read line is not there — if the line was only REWORDED, re-pin the row's mark to the new text \\(nothing else\\); only if the store reads through storeAnswer now, flip the row to 'answer'.*lower READ_DEBT_CAP`).test(c2[0]), 'CONTROL: a debt row whose marked line changed is red — its words say RE-PIN first (a reword), flip + lower the cap only for a converted store', c2);
const lost = new Map(T); lost.set('src/jobs.js', T.get('src/jobs.js').replace('this._loadAnswer(SR.storeAnswer(read, { valid: STORE_SHAPE }));', 'this._loadAnswer(JSON.parse(read.text));'));
const c3 = census(lost);
ok(c3.length === 1 && /^src\/jobs\.js jobs\.json: its storeAnswer call is no longer there/.test(c3[0]), 'CONTROL: a converted store that stops reading through storeAnswer is red', c3);
const more = [...STORE_READS, { file: 'src/hosts.js', store: 'hosts-extra.json', state: 'debt', why: 'x', mark: /./ }];
const c4 = census(T, more);
const DEBT_NOW = STORE_READS.filter((r) => r.state === 'debt').length;   // derived: the remainder lowers the cap row by row
ok(c4.length === 1 && c4[0].startsWith(`DEBT: ${DEBT_NOW + 1} debt rows against READ_DEBT_CAP ${READ_DEBT_CAP}`) && census(T, more, READ_DEBT_AT_BIRTH + 1).some((p) => p.includes(`above the census's first count ${READ_DEBT_AT_BIRTH}`)), 'CONTROL: a NEW debt row is refused, and so is raising the cap past its first count', c4);
const noReq = new Map(T); noReq.set('src/jobs.js', T.get('src/jobs.js').replace(/require\('\.\/store-read\.js'\)/, "require('./store-reader.js')"));
ok(census(noReq).some((p) => /^src\/jobs\.js jobs\.json: an 'answer' row whose file does not require src\/store-read\.js/.test(p)), 'CONTROL: an answer row\'s file must require the helper');

}

// ── ⑨ THE TASK GROUPS STORE HELD UNREAD (lane bl-windows 2026-11-18, 主开发 23:05Z — found by a hunt): the release's _load read ANY
// failure as «no file» and the boot saved the old tasks.json, or an empty store, OVER task-groups.json it could not read. THE LAW
// (B-f276's, for this store): only a truly ABSENT file falls to tasks.json or to an empty store; a read that failed, bytes that do
// not parse, bytes not of the store's shape: HELD — the bytes untouched by the boot and by every save, every recording act refused
// BY NAME, the person told ONCE, the read tried again (its hold lifts when it reads). The REAL TaskGroupManager over a scratch
// store of its own; the failures are stand-ins (an fs error thrown for that one file, bytes written); bytes counted, no clock.
console.log('⑨ the Task Groups store: a store that could not be read is never written over (task-groups.json)');
{
  const { scratchDir } = await import('./scratch.mjs');
  const JS = JSON.stringify, readSrc = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
  const { mutantCopies } = await import('./mutant-copy.mjs');
  const TGP = path.join(REPO, 'src/task-groups.js');
  const fresh = () => { delete require.cache[require.resolve(TGP)]; return require(TGP).TaskGroupManager; };
  const SEED = { version: 1, tasks: { 'T-a1': { id: 'T-a1', title: 'Alpha', sessions: [], backlog: [{ id: 'B-0a01', text: 'kept row', status: 'open', claimedBy: [] }], progress: [{ id: 'P-0a01', at: 1, note: 'kept line' }], createdAt: 1, updatedAt: 1, colorSeq: 0 } } };
  const roots = [];
  const world = (name) => { const dd = scratchDir('tg-unread-' + name); roots.push(dd); return { dd, file: path.join(dd, 'task-groups.json'), legacy: path.join(dd, 'tasks.json') }; };
  const make = (TGM, dd) => { const said = [], lifted = [], closed = []; const m = new TGM({ dataDir: dd, readUserState: () => ({}), unreadNotice: { say: (w) => { said.push(w); return 'n' + said.length; }, lift: (h) => lifted.push(h), closeOpen: () => closed.push(1) }, unreadRetry: { firstMs: 3600000, maxMs: 3600000 } }); return { m, said, lifted, closed }; };
  const failing = (file, code, fn) => { const rf = fs.readFileSync; fs.readFileSync = function (f, ...a) { if (String(f) === file) { const e = new Error(`${code}: a stand-in i/o error`); e.code = code; throw e; } return rf.call(this, f, ...a); }; try { return fn(); } finally { fs.readFileSync = rf; } };
  const tried = (fn) => { try { fn(); return null; } catch (e) { return { code: e.code, message: String(e.message) }; } };
  const bytes = (f) => (fs.existsSync(f) ? fs.readFileSync(f) : null);
  try {
    // (a) a READ THAT THROWS at the boot (EIO, a stand-in): held — the bytes identical after the boot and after every save attempt
    {
      const w = world('eio'); const seed = Buffer.from(JSON.stringify(SEED)); fs.writeFileSync(w.file, seed);
      const TGM = fresh();
      const { m, said, lifted } = failing(w.file, 'EIO', () => make(TGM, w.dd));
      const u = m.unreadState();
      ok(!!u && u.file === 'task-groups.json' && u.code === 'EIO' && m.list().length === 0 && Buffer.compare(bytes(w.file), seed) === 0, '⑨ a read that FAILED at the boot (EIO): the store is HELD — not shown, its bytes IDENTICAL after the boot (the release saved an empty store over it)', { u, groups: m.list().length });
      const refusals = [tried(() => m.addProgress('T-a1', { note: 'lost?' })), tried(() => m.update('T-a1', { backlog: [] })), tried(() => m.create({ title: 'New' })), tried(() => m.unbind('T-a1', 'claude:x')), tried(() => m.remove('T-a1'))];
      const saved = m._save();
      ok(refusals.every((r) => r && r.code === 'TASK_GROUPS_UNREAD' && /task-groups\.json/.test(r.message) && /\(EIO\)/.test(r.message) && /was refused/.test(r.message) && /nothing is recorded/.test(r.message)) && /an activity-log line/.test(refusals[0].message) && /a backlog row/.test(refusals[1].message) && saved === false && Buffer.compare(bytes(w.file), seed) === 0, '⑨ …every act that would record something is REFUSED BY NAME (code TASK_GROUPS_UNREAD: the file, the error, the act — a progress line, a parked row, a new group, an unbind, a delete) and the save writes NOTHING: the bytes identical', refusals.map((r) => r && r.message.slice(0, 90)));
      ok(said.length === 1 && /task-groups\.json/.test(said[0].text) && /\(EIO\)/.test(said[0].text) && said[0].i18n && said[0].i18n.text && said[0].i18n.text.params.file === 'task-groups.json', '⑨ …the person is told ONCE (one For-you notice naming the file and the error, its words through i18n) — not again for each refusal', said.map((x) => x.text));
      ok(JS(m.noteArchived(['claude:gone'])) === '[]' && typeof m.unreadRefusal('this request') === 'string' && /this request was refused/.test(m.unreadRefusal('this request')), '⑨ …a background road (an archive list) consumes nothing while held, and the agent routes\' words are the same refusal');
      // the read again while the storage still fails: STILL HELD — bytes identical, the notice not filed again
      const again = await (async () => { const rp = fs.promises.readFile; fs.promises.readFile = async function (f, ...a) { if (String(f) === w.file) { const e = new Error('EIO: a stand-in'); e.code = 'EIO'; throw e; } return rp.call(this, f, ...a); }; try { return await m.readAgain(); } finally { fs.promises.readFile = rp; } })();
      ok(again === false && !!m.unreadState() && Buffer.compare(bytes(w.file), seed) === 0 && said.length === 1, '⑨ …a read again that still fails: STILL HELD, the bytes identical, the person not told twice', { again, said: said.length });
      // a load that THROWS when the read answers (its migrations, their saves): held again — the hold lifts only after a WHOLE load
      const al = m._afterLoad; m._afterLoad = () => { throw new Error('a stand-in load failure'); };
      const broken = await m.readAgain(); m._afterLoad = al;
      ok(broken === false && !!m.unreadState() && m.list().length === 0 && Buffer.compare(bytes(w.file), seed) === 0 && lifted.length === 0, '⑨ …a read that answers but whose LOAD throws: held again (never an empty store left standing, the notice not lifted)', { broken, lifted });
      const ex = tried(() => m.exportBundle());
      ok(!!ex && ex.code === 'TASK_GROUPS_UNREAD' && /a backup of Task Groups was refused/.test(ex.message), '⑨ …a backup of Task Groups while held is REFUSED BY NAME (never a backup file that silently holds no groups)', ex);
      const back = await m.readAgain();
      ok(back === true && !m.unreadState() && m.list().length === 1 && m.list()[0].title === 'Alpha' && JS(lifted) === JS(['n1']), '⑨ …the read TRIED AGAIN answers: the hold lifts, the groups are back (Alpha, its row and its line), the notice is lifted', { back, groups: m.list().map((g) => g.title), lifted });
      m.addProgress('T-a1', { note: 'after the hold' });
      { const lw = require('../src/store-writer.js').storeWriter().flushSync(); if (lw.left && lw.left.length) throw new Error(`the store writer left owed writes: ${JSON.stringify(lw.left)}`); }   // lane lg-store-writes (U5 met this leg): the act's write is the store writer's — landed before the file is read, LOUDLY
      const doc = JSON.parse(fs.readFileSync(w.file, 'utf8'));
      ok(doc.tasks['T-a1'].progress.some((p) => p.note === 'kept line') && doc.tasks['T-a1'].progress.some((p) => p.note === 'after the hold') && doc.tasks['T-a1'].backlog.some((b) => b.text === 'kept row'), '⑨ …and recording works again ON the store as it was (its old line and row kept, the new line written)', doc.tasks['T-a1'].progress.map((p) => p.note));
    }
    // (b) bytes that do NOT PARSE and (c) bytes NOT OF THE STORE'S SHAPE: held the same way, the bytes untouched
    for (const [name, text, why] of [['torn', '{"version":1,"tasks":{"T-a1":{', 'did not parse'], ['shape', '{"version":1}', 'not the expected shape'], ['array', '[]', 'not the expected shape']]) {
      const w = world(name); const raw = Buffer.from(text); fs.writeFileSync(w.file, raw);
      const { m, said } = make(fresh(), w.dd);
      const r = tried(() => m.addProgress('T-a1', { note: 'x' })), r2 = tried(() => m.create({ title: 'x' }));
      ok(!!m.unreadState() && m.unreadState().why === why && Buffer.compare(bytes(w.file), raw) === 0 && r && r.code === 'TASK_GROUPS_UNREAD' && r2 && r2.code === 'TASK_GROUPS_UNREAD' && said.length === 1, `⑨ bytes that ${why === 'did not parse' ? 'do NOT PARSE' : `are NOT the store's shape (${text})`}: HELD the same way — the bytes untouched by the boot and the refused acts, one notice`, { u: m.unreadState(), said: said.length });
    }
    // (d) an ABSENT file with the old tasks.json beside it still migrates forward; (e) an absent file alone starts empty
    {
      const w = world('legacy'); fs.writeFileSync(w.legacy, JSON.stringify(SEED));
      const { m } = make(fresh(), w.dd);
      const doc = fs.existsSync(w.file) ? JSON.parse(fs.readFileSync(w.file, 'utf8')) : null;
      ok(!m.unreadState() && m.list().length === 1 && !!doc && !!doc.tasks['T-a1'] && fs.existsSync(w.legacy), '⑨ an ABSENT task-groups.json with the old tasks.json beside it: migrated forward (the new file written, the old left in place)', { groups: m.list().length });
      const w2 = world('absent');
      const { m: m2 } = make(fresh(), w2.dd);
      ok(!m2.unreadState() && m2.list().length === 0 && fs.existsSync(w2.file) && JS(Object.keys(JSON.parse(fs.readFileSync(w2.file, 'utf8')).tasks)) === '[]', '⑨ an ABSENT file alone: an empty store, written (nothing was there to keep)');
    }
    // the agent routes ask the hold FIRST (never «no Task Group» for a store that is held, not empty)
    ok(/function resolveAgentGroup\(hit, req, res\) \{[\s\S]{0,400}?tasks\.unreadRefusal\('this request'\)[\s\S]{0,200}?res\.status\(503\)\.json\(\{ error: held, code: 'TASK_GROUPS_UNREAD' \}\); return null; \}/.test(readSrc('src/agent-routes.js')), '⑨ the agent routes\' group resolution answers a held store BY NAME (503, TASK_GROUPS_UNREAD) before it looks for the group');
    // THE MOVED LINE'S MUST 1 (主开发 2026-11-19 22:38Z): a write QUEUED before the hold came back never lands the held, EMPTY store.
    // The legacy hold (task-groups.json absent, tasks.json unreadable at the boot): a read again answers the old file, its migration
    // forward QUEUES a save, then the load throws — the catch restores the hold and empties the state. The writer then lands what
    // it owes: the producer refuses while held (EHELD), so task-groups.json is still ABSENT and the old file is read at the next
    // try (its groups back). RED (anchored, in a copy): the producer's guard cut — the empty store lands, and the next read again
    // lifts with ZERO groups (the old file never read again).
    {
      const { anchored } = await import('./scratch.mjs');
      const GUARD = "produce: () => { if (this._unread) throw Object.assign(new Error('task-groups.json is held";
      ok(readSrc('src/task-groups.js').split(GUARD).length === 2, 'control setup: the producer\'s held guard is found once in task-groups.js');
      const queuedScene = async (TGM, name) => {
        const w = world(name); fs.writeFileSync(w.legacy, JSON.stringify(SEED));
        const { m } = failing(w.legacy, 'EIO', () => make(TGM, w.dd));
        const held0 = !!m.unreadState() && m.unreadState().file === 'tasks.json';
        const al = m._afterLoad; m._afterLoad = () => { throw new Error('a stand-in load failure after the migration\'s save was queued'); };
        const broken = await m.readAgain(); m._afterLoad = al;
        const heldAgain = !!m.unreadState();
        const lw = require('../src/store-writer.js').storeWriter().flushSync();   // what the writer owes is landed NOW (a refused one is left, by name)
        const absent = !fs.existsSync(w.file);
        const refusedByName = (lw.left || []).some((x) => x.file === w.file && /held/.test(x.why || ''));
        const back = await m.readAgain();
        const groups = m.list().map((g) => g.title).join(',');
        require('../src/store-writer.js').storeWriter().flushSync();
        const after = fs.existsSync(w.file) ? Object.keys(JSON.parse(fs.readFileSync(w.file, 'utf8')).tasks || {}).join(',') : null;
        return { held0, broken, heldAgain, absent, refusedByName, back, groups, after };
      };
      const q = await queuedScene(fresh(), 'queued-legacy');
      ok(q.held0 && q.broken === false && q.heldAgain && q.absent && q.refusedByName && q.back === true && q.groups === 'Alpha' && q.after === 'T-a1', '⑨ must 1: a read again of the LEGACY hold whose load throws after its migration QUEUED a save — the writer lands nothing (refused while held, by name): task-groups.json still ABSENT, the old file read at the next try (Alpha back, then written)', q);
      const MTG = mutantCopies('tg-queued-hold', REPO).load('src/task-groups.js', anchored(readSrc('src/task-groups.js'), GUARD, "produce: () => { if (false) throw Object.assign(new Error('task-groups.json is held", 'tg-no-produce-guard'), 'no-produce-guard').TaskGroupManager;
      const qx = await queuedScene(MTG, 'queued-legacy-mut');
      ok(!qx.absent && qx.back === true && qx.groups === '', 'CONTROL (the producer\'s guard cut, in a copy): the queued save lands the EMPTY store over the held file — the next read again lifts with ZERO groups, the old file never read again — RED', qx);
    }
    // GONE SINCE THE HOLD (the reader's must): a held store whose file is then NOT THERE (a detached mount) stays HELD — no empty store
    {
      const w = world('gone'); fs.writeFileSync(w.file, JSON.stringify(SEED));
      const { m } = failing(w.file, 'EIO', () => make(fresh(), w.dd));
      fs.rmSync(w.file);
      const r = await m.readAgain();
      ok(r === false && !!m.unreadState() && m.unreadState().code === 'ENOENT' && !fs.existsSync(w.file) && !!tried(() => m.create({ title: 'x' })), '⑨ a held store whose file is then GONE (a detached mount): STILL HELD — no empty store written, no migration, acts still refused (the next START judges a truly absent file)', m.unreadState());
    }
    // more shapes that are not the store: an ARRAY of tasks, a NULL record — held (never a boot that crashes or a save that drops them)
    for (const [name, doc] of [['arr', { version: 1, tasks: [] }], ['nullrec', { version: 1, tasks: { 'T-a1': null } }]]) {
      const w = world(name); const raw = Buffer.from(JSON.stringify(doc)); fs.writeFileSync(w.file, raw);
      const { m } = make(fresh(), w.dd);
      ok(!!m.unreadState() && m.unreadState().why === 'not the expected shape' && Buffer.compare(bytes(w.file), raw) === 0, `⑨ a store of the wrong inner shape (${name === 'arr' ? 'tasks an array' : 'a null record'}): HELD, the bytes untouched`, m.unreadState());
    }
    // a start that READS closes a notice an earlier held start left (S1)
    {
      const w = world('stale'); fs.writeFileSync(w.file, JSON.stringify(SEED));
      const { m, closed } = make(fresh(), w.dd);
      await new Promise((r) => setImmediate(r));
      ok(!m.unreadState() && closed.length === 1, '⑨ a start that READS closes the For-you notice an earlier held start filed (it never outlives a store that reads)', { closed: closed.length });
      // an archived MONTH that could not be read is never rewritten by an import (strict read refuses by name; a plain read is [])
      const mf = path.join(w.dd, 'task-groups-archive', 'T-a1', '2026-01.ndjson'); fs.mkdirSync(path.dirname(mf), { recursive: true }); fs.writeFileSync(mf, '');
      const sx = failing(mf, 'EIO', () => tried(() => m._monthEntries('T-a1', '2026-01.ndjson', { strict: true })));
      const plain = failing(mf, 'EIO', () => m._monthEntries('T-a1', '2026-01.ndjson'));
      ok(!!sx && sx.code === 'TASK_GROUPS_UNREAD' && /an import was refused/.test(sx.message) && JS(plain) === '[]', '⑨ an archived month that could not be read: the import\'s strict read REFUSES by name (never rewritten); a plain read stays empty', sx);
    }
    // the roads around the store ask the hold FIRST (source pins: the routes, the migrations, the conversation binds, the backup)
    {
      const WR = readSrc('src/server/task-groups-wiring.js'), PS = readSrc('src/routes/persistence.js'), CO = readSrc('src/server/conversation-ops.js'), MG = readSrc('src/server/migrations.js'), AR = readSrc('src/agent-routes.js');
      ok(/app\.use\('\/api\/tasks', \(req, res, next\) => \{[^\n]*tasks\.unreadRefusal\?\.\('this request'\)[^\n]*res\.status\(503\)/.test(WR) && /unread \? \{ unread \} : \{\}/.test(WR), '⑨ every Task Groups route but the list answers a held store BY NAME (503) before it reads a group; the list says `unread`');
      ok((PS.match(/unreadRefusal\?\.\('a backup of Task Groups'\)|unreadRefusal\?\.\('an import of Task Groups'\)/g) || []).length === 2, '⑨ the backup\'s export and import ask the hold before anything (an import refused WHOLE, before any section is applied)');
      ok(/if \(D\(\)\.tasks\.unreadState\?\.\(\)\) return 0;/.test(CO) && /O\(\)\.tasksUnread\('adding a conversation to a Task Group'\)/.test(CO) && /const tasksUnread = \(act\) => \{ const t = D\(\)\.tasks;/.test(CO), '⑨ the birth binds WAIT for the lift (never consumed); the automation bind answers the hold by its name');
      ok((MG.match(/unreadRefusal\('this migration'\) : null; if \(held\) throw new Error\(held\);/g) || []).length === 2, '⑨ the two migrations that touch the store refuse while it is held (never marked done over an empty or held store)');
      ok(/app\.post\('\/api\/agent\/group-admin'[\s\S]{0,200}?tasks\.unreadRefusal\('this request'\)/.test(AR), '⑨ group-admin answers a held store by its name (never an empty list)');
    }
    // ── THE CURE (主开发's verdict «NOT TAKEN YET»: three musts + the smalls) — the readers of a held store answer UNKNOWN ──
    const { anchored } = await import('./scratch.mjs');
    const { createRequire } = await import('node:module');
    const GM = require(path.join(REPO, 'src/grant-model.js')), ACL = require(path.join(REPO, 'src/channel-acl.js')), TD = require(path.join(REPO, 'src/task-delta.js'));
    const CID = 'aaaaaaaa-1111-4000-8000-0000000000a1', KEY = 'claude:' + CID;
    const MEMBER = JSON.stringify({ version: 1, tasks: { 'T-a1': { ...SEED.tasks['T-a1'], sessions: [KEY] } } });
    const heldOver = (name, raw) => { const w = world(name); fs.writeFileSync(w.file, raw); return failing(w.file, 'EIO', () => make(fresh(), w.dd)).m; };
    const readOver = (name, raw) => { const w = world(name); fs.writeFileSync(w.file, raw); return make(fresh(), w.dd).m; };
    // MUST 1 — THE GRANT READERS: every reader that feeds a grant verdict asks groupIdsForGrant (a held store THROWS by name) and
    // maps the throw to UNREADABLE — server.js groupsOf ×2 (exit, window targets), automationGroupsRead, vaultUseFacts, taskIdsForKey,
    // taskIdsFor, tasksForConversation (a job's browser, found beside the row); the channel ACL's one judge asks the hold itself
    {
      const held = heldOver('grant-held', MEMBER), read = readOver('grant-read', MEMBER);
      const reader = (mgr, f) => { try { return { ids: f(mgr), unreadable: false }; } catch (e) { return { ids: [], unreadable: true, code: e.code }; } };
      const cure = (mgr) => reader(mgr, (x) => x.groupIdsForGrant({ sessionKey: KEY }));
      const release = (mgr) => reader(mgr, (x) => (x.groupsForSession({ sessionKey: KEY }) || []).map((g) => g.id));   // the release's road: [] read as «in no group»
      const facts = (r) => ({ conversationKey: CID, groupIds: r.ids, ...(r.unreadable ? { groupsUnreadable: true } : {}) });
      const EXCEPT_G = { door: 'automation-key-use', resource: 'K-1', to: [{ kind: 'everyone' }], except: [{ kind: 'group', id: 'T-a1' }] };
      const ONLY_G = { door: 'browser-profile', resource: 'bp-00000001', to: [{ kind: 'group', id: 'T-a1' }], except: [] };
      const c = cure(held);
      ok(c.unreadable && c.code === 'TASK_GROUPS_UNREAD' && JS(held.groupsForSession({ sessionKey: KEY })) === '[]' && JS(cure(read).ids) === '["T-a1"]', '⑨ cure MUST 1: over a HELD store groupIdsForGrant THROWS by name (TASK_GROUPS_UNREAD) and the reader answers UNREADABLE; groupsForSession itself stays non-throwing; a store that reads answers the groups', c);
      const vEx = GM.admits([EXCEPT_G], facts(c)), vExRead = GM.admits([EXCEPT_G], facts(cure(read))), vExRel = GM.admits([EXCEPT_G], facts(release(held)));
      ok(vEx.ok === false && vEx.code === 'groups_unreadable' && vExRead.ok === false && vExRead.code === 'excepted', '⑨ …a row «All agents, except Task Group G» REFUSES G\'s conversation as unreadable while held (once the store reads: excepted — the row\'s own words)', { held: vEx.code, read: vExRead.code });
      ok(vExRel.ok === true, '⑨ CONTROL — the release\'s reader (the held list\'s [] as «in no group»): the same row ADMITS G\'s conversation, a grant wider than its words', vExRel);
      const vG = GM.admits([ONLY_G], facts(c)), vGRel = GM.admits([ONLY_G], facts(release(held)));
      const keeps = /if \(may\.code === 'groups_unreadable'\) \{ out\.undecided\.push\(l\.browserKey\);/.test(readSrc('src/server/browser-keeper.js'));
      ok(vG.ok === false && vG.code === 'groups_unreadable' && keeps, '⑨ …a lease kept to «only Task Group G» meets a held store: groups_unreadable — the keeper KEEPS it (rejudgeLeases\' undecided rule, read from browser-keeper.js), never detached', { code: vG.code, keeps });
      ok(vGRel.ok === false && vGRel.code === 'not_granted', '⑨ CONTROL — the release\'s reader: not_granted, the lease DETACHED (its tab closed) for a store that only could not be read', vGRel);
      const grant = { principal: { kind: 'everyone', id: '*' }, except: [{ kind: 'group', id: 'T-a1' }], scope: { kind: 'adapter', id: 'a1' }, level: 'visible' };
      // THE HUB'S FACT (src/server/groups-hold.js — 主开发's follow: a pure model holds no settable state): the doors hand it in
      const GH = require(path.join(REPO, 'src/server/groups-hold.js'));
      let ghFacts;
      try { GH.setHeld(() => held.isHeldUnread()); const a = GH.fact(); GH.setHeld(() => read.isHeldUnread()); const b = GH.fact(); GH.setHeld(() => { throw new Error('x'); }); ghFacts = [a, b, GH.fact()]; } finally { GH.setHeld(null); }
      ok(JS(ghFacts) === JS([{ groupsUnreadable: true }, {}, { groupsUnreadable: true }]) && JS(GH.fact()) === '{}', '⑨ the hub\'s fact (groups-hold): { groupsUnreadable: true } while held, nothing once read, a predicate that throws reads as held (fail closed), nothing with none set', ghFacts);
      const chHeld = ACL.principalApplies({ kind: 'agent', id: CID, name: null, groups: [], ...ghFacts[0] }, grant);
      const chRead = ACL.principalApplies({ kind: 'agent', id: CID, name: null, groups: ['T-a1'], ...ghFacts[1] }, grant);
      const chRel = ACL.principalApplies({ kind: 'agent', id: CID, name: null, groups: [] }, grant);
      ok(chHeld === false && chRead === false && chRel === true, '⑨ …a CHANNEL grant «All agents, except Task Group G» (the real channel-acl): not applied to G\'s conversation whose principal carries the hold, nor once read (excepted); CONTROL — a principal without the fact (the release): applied to it', { chHeld, chRead, chRel });
      const SJ = readSrc('server.js'), MP = readSrc('src/server/mounts-plugins-wiring.js'), TW = readSrc('src/server/task-groups-wiring.js');
      // THE SEAM 2.369.411 × .412 (lane bl-windows, 主开发 07:55Z) + THE FOLLOW moved onto it: held ⇒ the release's groupIdsForGrant (throws by
      // name, its first throw of a hold marked per reader), else the train's memberIds (with the machine, B-55dc's flag) — server.js inline ×2
      // (readers 'exit' / 'window'), mounts-plugins-wiring through ONE helper ×4 + the may-use hook + the key-only fifth
      ok((SJ.match(/groupsOf: \(s, id\) => \{ const a = \{ sessionKey: sessionStatusKey\(s, id\), cwd: s\.cwd, hostId: s\.host \|\| null, [^}]*\}; return tasks\.isHeldUnread\(\) \? tasks\.groupIdsForGrant\(a, '(?:exit|window)'\) : tasks\.memberIds\(a\); \}/g) || []).length === 2 && !/groupsOf: \(s, id\) => tasks\.groupsForSession\(/.test(SJ)   // stale-pins: kept — a deliberate absence check (the release's reader must not come back)
        && /^const grantMemberIds = \(tasks, a, reader\) => \(typeof tasks\.isHeldUnread === 'function' && tasks\.isHeldUnread\(\) \? tasks\.groupIdsForGrant\(a, reader\) : tasks\.memberIds\(a\)\);$/m.test(MP) && (MP.match(/grantMemberIds\(tasks, \{/g) || []).length === 4 && (MP.match(/tasks\.groupIdsForGrant\(\{/g) || []).length === 1
        && /groupsOf: \(\{ sessionKey, cwd, hostId = null, initialGroupId, initialGroupIds \} = \{\}\) => \{[^\n]*const ids = grantMemberIds\(tasks, a\); if \(ids\.unread\) throw new Error\([^\n]*return tasks\.groupsForSession\(a\); \}/.test(MP)
        && /require\('\.\/groups-hold\.js'\)\.setHeld\(\(\) => tasks\.isHeldUnread\(\)\);/.test(TW),
        '⑨ …the readers that feed a grant: server.js groupsOf ×2 + the five in mounts-plugins-wiring ask groupIdsForGrant while held (the seam: ×4 through grantMemberIds, the may-use hook, the key-only fifth direct); the store sets the HUB\'s fact at boot (groups-hold)');
      const GMsrc = readSrc('src/grant-model.js'), FACT = /require\('\.\/groups-hold\.js'\)\.fact\(\)/g, FACT_AR = /require\('\.\/server\/groups-hold\.js'\)\.fact\(\)/g;
      const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');   // code only — a comment naming the hub's module is no read of it
      const cnt = (f, re) => (readSrc(f).match(re) || []).length;
      ok(!/\bsetGroupsHeld\b|\bgroupsHeld\b|groups-hold/.test(GMsrc) && !/^let /m.test(GMsrc) && !['src/channel-acl.js', 'src/channel-filter.js', 'src/automation-keys.js'].some((f) => /groupsHeld|groups-hold/.test(code(readSrc(f)))),
        '⑨ the PURE models read only their arguments: src/grant-model.js holds no module-level setter or state (the device bundle\'s module is the release\'s), nor do channel-acl, channel-filter and automation-keys ask any hold');
      ok(cnt('src/server/channels-access.js', FACT) === 3 && cnt('src/server/channels-engine.js', FACT) === 2 && cnt('src/server/channels-outbound.js', FACT) === 2 && cnt('src/server/conversation-ops.js', FACT) === 6 && cnt('src/server/delivery-wake.js', FACT) === 1 && cnt('src/server/end-proposals.js', FACT) === 1 && cnt('src/agent-routes.js', FACT_AR) === 2
        && /function wakeAdmits\(res, principal, \{ cid, groups = \[\], inherited = \[\], groupsUnreadable = false \} = \{\}\)/.test(readSrc('src/server/channels-grants.js')),
        '⑨ …the hub\'s doors that judge a live agent from the roster HAND the fact: the channel principals (channelPrincipal ×2, the engine\'s hear / wake ctx ×2, outbound ×2, access ×1), the two watch wakes, the automation reach\'s targets (conversation-ops ×6: the shared reached() — status, rename, bind, end — and the archive\'s, and — login-request-card\'s cure on .413 checkpoint 2 — the list, the resume of a live and of an ended target, and — piece 6 re-landed — the stop\'s holders; the wake grant\'s owner ×1, the proposal card\'s targets ×1)');
      // (2) THE PRINCIPAL BUILDERS (主开发 05:42Z (2) — the doors were pinned by COUNT, so a future door that builds an agent
      // principal from the roster's groups and forgets the fact stayed green; the follow-owed read: a ONE-LINE regex missed
      // `taskIds:`, `{ cid, groups }`, `reach({ conversationId, groups })`, a principal spread over lines, `groups: caller.groups`):
      // every OBJECT LITERAL in the hub's code with a Task Group key (`groups` / `groupIds` / `taskIds` / `subjectGroups`), read
      // on acorn's tree (the trees the sync-fs census above parsed — a subtree with no such word is skipped), is a site. A site
      // that HANDS the hold's fact — a `groupsUnreadable` / `unreadable` / `held` key, a value or spread naming groups-hold's
      // fact(), groupsUnreadable, unreadable or B-55dc's `.unread`, an Object.assign whose other argument does — needs no row;
      // every other site is a row whose class says why it needs none. A new site with no row is RED; a count that moved is
      // RED; a site that LOST its fact is a site with no row — RED; a row naming nothing (or whose sites all hand the fact
      // now) is DEAD. THE CENSUS'S LIMITS, stated: a context built by assignment (`ctx.groups = g`), under another key name,
      // or in a file outside BFILE is not seen; a class is a reader's word, not proven (the judges are pinned by their own legs).
      // (The first row of the follow-owed unit beside it: the group's browser CAP read for a new conversation — its own leg below.)
      {
        const GKEYS = new Set(['groups', 'groupIds', 'taskIds', 'subjectGroups']), FKEYS = new Set(['groupsUnreadable', 'unreadable', 'subjectGroupsUnreadable', 'held']);
        const FACTV = /groups-hold\.js'\)\.fact\(\)|groupsUnreadable|\bunreadable\b|\.unread\b/, GKEY_AT = /\b(?:groups|groupIds|taskIds|subjectGroups)\b/g;
        const BFILE = /^(server\.js|src\/server\/|src\/routes\/|src\/agent-routes|src\/ws-|src\/exit-|src\/window-|src\/msg-acl\.js$|src\/browser-login\.js$)/;
        const uncomment = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|\s)\/\/[^\n]*/g, '$1');   // a comment naming the hold is no hand of it («https://» stays)
        const keyOf = (p) => (p.type === 'Property' && !p.computed ? p.key.name || p.key.value : null);
        const WHY = {
          roster: 'a roster or target row (a conversation\'s groups as LISTED): the judge that reads it is a site of its own — it hands the fact or only narrows',
          answer: 'an answer, a page\'s listing, a broadcast or its words: the groups SHOWN, never judged',
          record: 'a stored record, a memo or a write: judged, if ever, later — by a live read again, or with its own held mark (recorded while held ⇒ unknown for good) — never «in no group» (a birth bind WAITS while held)',
          other: 'another meaning of «groups» (search hits, memory, spend batches, retention, a count, an option, a module\'s parts): no Task Group ids',
          narrows: 'group visibility or to-group rows with no except judged: an empty (held) list can only narrow — refuse — never widen',
          named: 'the ids are NAMED (a create\'s own pick from the request, a group subject probed by itself): known, never read from the held store',
          user: 'the PERSON\'s own act (by: \'user\') or the person as a caller: no agent judged by its groups',
          fixed: 'a fixed principal (the maintainer): no Task Groups by construction, never read from the store',
          afterHold: 'reached only after the hold\'s own branch returned (the store READ): the groups are the store\'s',
          jobOwner: 'a jobs caller: its groups judge a job\'s group VIEW (only narrows) and become a new job\'s groupsSnapshot — made while held it stays EMPTY for good, only its owner sees it: the STATED remainder of the hold (a refusal blocked every `vibespace-job run`)',
        };
        const BROWS = [
          ["src/agent-routes.js", "{ name: ep.t.name ? agentText(ep.t.name, { kind: '", 1, "answer"],
          ["src/agent-routes.js", "{ success: true, groups: tasks.list().map(brief) }", 1, "answer"],
          ["src/agent-routes.js", "{ conversationId: own.cid, borrowed: own.cid ? nul", 1, "jobOwner"],
          ["src/agent-routes.js", "{ id: tid, t, cid, groups, reachability: t._msgRea", 1, "roster"],
          ["src/agent-routes.js", "{ groups: msgGroupsAnswer(c.ge.listFor(c.cid)) }", 1, "answer"],
          ["src/browser-login.js", "{ conversationKey: BY_WHAT_PROBE, groupIds: [m[1]]", 1, "named"],
          ["src/exit-proxy.js", "{ groups: false }", 1, "other"],
          ["src/msg-acl.js", "{ conversationKeys: target.cid ? [String(target.ci", 1, "narrows"],
          ["src/routes/automation.js", "{ sessions: [], groups: [] }", 1, "answer"],
          ["src/routes/browser-trace.js", "{ key: u.browserKey, sessionId: u.sessionId, name:", 1, "answer"],
          ["src/routes/browser.js", "{ session: s, sessionId: id, browserKey: s._browse", 1, "user"],
          ["src/routes/browser.js", "{ taskIds: String(req.query?.taskIds || '').split(", 1, "named"],
          ["src/routes/browser.js", "{ taskIds }", 1, "named"],
          ["src/routes/browser.js", "{ session: s, sessionId: h.sessionId, browserKey: ", 1, "user"],
          ["src/routes/channels.js", "{ groups: groupsEngine().list() }", 1, "answer"],
          ["src/routes/persistence.js", "{ count: Object.keys(state?.customNames || {}).len", 1, "other"],
          ["src/routes/vault.js", "{ sessions: [], groups: [] }", 1, "answer"],
          ["src/routes/vault.js", "{ conversationId: caller.conversationId, groups: c", 1, "narrows"],
          ["src/server/automation-engine.js", "{ type: 'automation-ask', askId, keyId: key.id, ke", 1, "answer"],
          ["src/server/automation-engine.js", "{ maintainer: true, name: A.MAINTAINER_NAME, conve", 1, "fixed"],
          ["src/server/browser-keeper.js", "{ browserKey: '', taskIds: Array.isArray(taskIds) ", 1, "named"],
          ["src/server/browser-keeper.js", "{ taskIds }", 1, "named"],
          ["src/server/browser-keeper.js", "{ taskIds: formGroups }", 1, "named"],
          ["src/server/browser-logins.js", "{ sessions: (Array.isArray(sj.sessions) ? sj.sessi", 1, "answer"],
          ["src/server/browser-trace.js", "{ groups: [{ key: pid, entries: files }], now: t }", 1, "other"],
          ["src/server/channel-api.js", "{ id: `shape-${crypto.randomBytes(5).toString('hex", 1, "record"],
          ["src/server/channels-access.js", "{ cid: String(x.cid), name: x.name || null, groups", 1, "roster"],
          ["src/server/channels-access.js", "{ gen, id: ctx.id, groups: g, n, inh: ih, inhN: ih", 1, "record"],   // lane lg-group-parents (restack 415): the memo carries the lineage beside the groups
          ["src/server/channels-access.js", "{ cid: String(x.cid), groups: Array.isArray(x.grou", 1, "roster"],
          ["src/server/channels-access.js", "{ id: String(a.id), kind: a.kind || '', vendor: a.", 1, "answer"],
          ["src/server/channels-auth.js", "{ flowId: st.flowId, mode: st.mode, running: !!st.", 1, "answer"],
          ["src/server/channels-engine.js", "{ groups: routes.join(',') }", 1, "other"],
          ["src/server/channels-engine.js", "{ adapterLabel: label, scopeLabel, groups, windowM", 1, "answer"],
          ["src/server/channels-engine.js", "{ conversationKey: String(x.cid), groupIds: Array.", 1, "narrows"],
          ["src/server/channels-wiring.js", "{ channels, groups, touches, flushGroupCards, live", 1, "other"],
          ["src/server/conversation-ops.js", "{ grant: 'through a grant of this key', instance: ", 1, "other"],   // the reach's WORDS by kind (`groups` = the words of a Task Group grant): no ids
          ["src/server/conversation-ops.js", "{ s, id, conversationId: idOf(s), sessionKey: keyO", 1, "roster"],
          ["src/server/conversation-ops.js", "{ s: null, id: null, conversationId: d.conversatio", 1, "roster"],
          ["src/server/exit-routes.js", "{ sessions, groups }", 1, "answer"],
          ["src/server/groups-engine.js", "{ cid: target.cid, groups: target.groups || [], re", 1, "narrows"],
          ["src/server/groups-engine.js", "{ type: 'channel-groups-updated', changed, groups,", 1, "answer"],
          ["src/server/groups-engine.js", "{ groups: [], reads: 0 }", 1, "other"],
          ["src/server/groups-engine.js", "{ groups: w }", 1, "answer"],
          ["src/server/groups-engine.js", "{ groups: out, partial }", 1, "other"],
          ["src/server/groups-engine.js", "{ cid: s.cid, name: s.name ? G.cleanName(s.name) |", 1, "roster"],
          ["src/server/jobs-wiring.js", "{ live: false, conversationId: cid, groups: new Se", 1, "afterHold"],
          ["src/server/jobs-wiring.js", "{ isUser: true, groups: new Set() }", 1, "user"],
          ["src/server/memory-pressure-watch.js", "{ procs, sessions: ids.sessions, groups: MP.attrib", 1, "other"],
          ["src/server/memory-pressure-watch.js", "{ pct, used: mem.used, limit: mem.limit, groups, t", 1, "other"],
          ["src/server/migrations.js", "{ archived: archived.length, groups: 0 }", 1, "other"],
          ["src/server/migrations.js", "{ archived: archived.length, groups: Object.keys(g", 1, "other"],
          ["src/server/migrations.js", "{ groups: 0, rows: 0, folders: 0, notes: 0, merged", 1, "other"],
          ["src/server/mounts-plugins-wiring.js", "{ sessions, groups }", 1, "answer"],
          ["src/server/mounts-plugins-wiring.js", "{ conversationId: cid, sessionKey, name, groups, i", 1, "roster"],   // lane lg-group-parents (restack 415): endedKeyOf carries the record's lineage
          ["src/server/roster-pass.js", "{ cid, name: s.name || null, groups, inherited, we", 1, "roster"],   // lane lg-group-parents (restack 415): the roster row carries the lineage
          ["src/server/search-index.js", "{ groups: copiesOf(null, { cachedOnly: true }), wh", 2, "other"],
          ["src/server/search-index.js", "{ groups: copiesOf(null), whole: true }", 1, "other"],
          ["src/server/search-index.js", "{ groups, whole: !partial.length }", 1, "other"],
          ["src/server/search-index.js", "{ groups: copiesOf(String(gid)) }", 1, "other"],
          ["src/server/search-index.js", "{ hits: r.hits, groups: r.groups, total: r.total, ", 1, "other"],
          ["src/server/spend-guard.js", "{ ok: false, why: list.length ? 'identity-unknown'", 1, "other"],
          ["src/server/spend-guard.js", "{ reason, groups: [...byKey.values()], state, limi", 2, "other"],
          ["src/server/usage-pool-engine.js", "{ at: 0, groups: null }", 1, "other"],
          ["src/server/usage-pool-engine.js", "{ accounts: () => accounts, todos: () => getUserTo", 1, "other"],
          ["src/server/window-targets-engine.js", "{ sessionKeys: [], groupIds: [] }", 1, "narrows"],
          ["src/server/window-targets-engine.js", "{ sessionKeys: keysOf(s, id), conversationKeys: ke", 1, "narrows"],
          ["src/window-reach.js", "{ everyone: { checked: !!allRow, by: allRow ? allR", 1, "answer"],
          ["src/server/session-stdout.js", "{ host: s.host, hostName: s.hostName, keeperSid: s", 1, "record"],   // r3199 (lane bl-chat-c): a torn record restated whole carries the LIVE conversation's own groups (its session's, never read from the held store)
          ["src/ws-create.js", "{ groupId: spawnGroups[0], groupIds: spawnGroups.s", 1, "record"],
          ["src/ws-create.js", "{ name: session.name, nameExplicit: session._nameE", 1, "record"],
        ];
        const walkB = (d, out = []) => { for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) { const rel = path.posix.join(d, e.name); if (e.isDirectory()) { if (rel !== 'src/lib' && rel !== 'src/agentd') walkB(rel, out); } else if (e.name.endsWith('.js')) out.push(rel); } return out; };
        const bfiles = () => new Map(['server.js', ...walkB('src')].filter((f) => BFILE.test(f) && f !== 'src/server/grants-migration.js').map((f) => [f, readSrc(f)]));   // grants-migration: its probes compare mappings on purpose (kb)
        const bsites = (files) => {
          const seen = new Map();
          for (const [f, t] of files) {
            const hits = [...t.matchAll(GKEY_AT)].map((m) => m.index);
            if (!hits.length) continue;   // r2522: no Task Group key in its text — the visit stops at the root, so no tree is needed
            const c = TREE_AST.get(f), ast = c && c.src === t ? c.ast : parseOf(t);
            const holds = (a, b) => { let lo = 0, hi = hits.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (hits[mid] < a) lo = mid + 1; else hi = mid; } return lo < hits.length && hits[lo] < b; };
            const txt = (x) => uncomment(t.slice(x.start, x.end));
            const visit = (n, up) => {
              if (!n || typeof n.type !== 'string' || !holds(n.start, n.end)) return;
              if (n.type === 'ObjectExpression' && n.properties.some((p) => GKEYS.has(keyOf(p)))) {
                const viaAssign = !!up && up.type === 'CallExpression' && up.arguments[0] === n && txt(up.callee).trim() === 'Object.assign';
                const fact = n.properties.some((p) => (FKEYS.has(keyOf(p)) && !(p.value.type === 'Literal' && p.value.value === false)) || FACTV.test(txt(p.type === 'Property' ? p.value : p.argument))) || (viaAssign && up.arguments.slice(1).some((a) => FACTV.test(txt(a))));
                const k = f + '\u0000' + txt(n).replace(/\s+/g, ' ').slice(0, 50), o = seen.get(k) || { n: 0, fact: 0 }; o.n++; if (fact) o.fact++; seen.set(k, o);
              }
              for (const key in n) { if (key === 'loc') continue; const v = n[key]; if (Array.isArray(v)) { for (const x of v) visit(x, n); } else if (v && typeof v === 'object') visit(v, n); }
            };
            visit(ast, null);
          }
          return seen;
        };
        const bcensus = (files, rows) => {
          const seen = bsites(files), problems = [];
          for (const [k, o] of seen) {
            if (o.fact === o.n) continue;
            const [f, at] = k.split('\u0000'), r = rows.find((x) => x[0] === f && x[1] === at);
            if (!r) { problems.push(`${f}: NO ROW «${at}» — a context with Task Group ids: hand the hold's fact (groups-hold), take the groups from a reader that throws to unreadable, or say why it needs none`); continue; }
            if (r[2] !== o.n - o.fact) problems.push(`${f} «${at}»: ${r[2]} → ${o.n - o.fact} — classify the new site(s), then move the count`);
          }
          for (const r of rows) { const o = seen.get(r[0] + '\u0000' + r[1]); if (!o || o.fact === o.n) problems.push(`${r[0]} «${r[1]}»: DEAD row${o ? ' (every site of it hands the fact now)' : ''}`); }
          const all = [...seen.values()];
          return { problems, sites: all.reduce((k, o) => k + o.n, 0), facts: all.reduce((k, o) => k + o.fact, 0) };
        };
        const BF = bfiles(), bc = bcensus(BF, BROWS);
        ok(!bc.problems.length && BROWS.every((r) => WHY[r[3]] && r[2] > 0), `⑨ follow (2) THE PRINCIPAL BUILDERS: ${bc.sites} object literals with Task Group ids in ${BF.size} hub files — ${bc.facts} hand the hold's fact, ${BROWS.reduce((k, r) => k + r[2], 0)} more each a row saying why none is needed (${Object.keys(WHY).map((c) => `${c} ${BROWS.filter((r) => r[3] === c).reduce((k, r) => k + r[2], 0)}`).join(' · ')})${bc.problems.length ? `\n  ${bc.problems.join('\n  ')}` : ''}`);
        // CONTROLS — one per shape the read named (each planted alone in a new file, the fact left out ⇒ a row is owed), the same
        // shapes WITH the fact (no row owed: a spread, a key, an Object.assign — never a comment), and two real doors that LOSE it
        const SHAPES = [
          "const p = { kind: 'agent', id: cid, name: null, groups: g };",
          'const v = B.mayAttach(p, { browserKey, conversationKeys, taskIds: g.ids });',
          'if (!CG.wakeAdmits(res, root, { cid, groups })) return false;',
          'const v = reach({ conversationId: idOf(s), webuiId: id, groups: groupsOfLive(s, id) });',
          "function principalOf(s, cid) {\n  return {\n    kind: 'agent',\n    id: cid,\n    name: s.name || null,\n    groups: myGroups,\n  };\n}",
          'const r = totp.use({ conversationId: caller.conversationId, groups: caller.groups, live: caller.live }, name);',
        ];
        const owed = (src) => bcensus(new Map([['src/server/new-door.js', src + '\n']]), []).problems.filter((p) => p.startsWith('src/server/new-door.js: NO ROW')).length;
        const WITH = [
          "const p = { kind: 'agent', id: cid, name: null, groups: g, ...require('./groups-hold.js').fact() };",
          'const v = B.mayAttach(p, { browserKey, conversationKeys, taskIds: g.ids, groupsUnreadable: !!g.unreadable });',
          "const p = Object.assign({ kind: 'agent', id: cid, name: null, groups: g }, require('./groups-hold.js').fact());",
        ];
        const loses = (f, from, to) => { const t = BF.get(f), t2 = t.replace(from, to); return t2 !== t && bcensus(new Map([[f, t2]]), BROWS.filter((r) => r[0] === f)).problems.some((p) => p.startsWith(`${f}: NO ROW`)); };
        ok(SHAPES.every((s) => owed(s) === 1) && WITH.every((s) => owed(s) === 0) && owed("const p = { kind: 'agent', id: cid, groups: [g /* ...require('./groups-hold.js').fact() */] };") === 1 && owed("const p = { kind: 'agent', id: cid, groups: g, groupsUnreadable: false };") === 1
          && loses('src/server/channels-outbound.js', "...((!live && a.groupsUnreadable === true) || (live && (live.inherited === null || live.groupsUnread === true)) ? { groupsUnreadable: true } : {}), ...require('./groups-hold.js').fact(), msgLevelFor: () => 'none' };", "msgLevelFor: () => 'none' };")
          && loses('src/agent-routes.js', "groups: myGroups, inheritedGroups, ...(require('./server/groups-hold.js').fact()),", 'groups: myGroups, inheritedGroups,'),   // lane lg-group-parents (restack 415): the principal's lineage beside its groups
          `CONTROL: each of the ${SHAPES.length} shapes (a principal, a mayAttach's taskIds, a { cid, groups } watch, a reach target, a principal over seven lines, a caller re-built for a use door) planted with no fact is RED by name; with the fact (a spread, a key, an Object.assign) it owes nothing; a fact named only in a comment, or a literal false, is RED; channels-outbound's stash-gate principal and agent-routes' multi-line one that LOSE the fact are RED`);
      }
      {
        // THE GROUP'S BROWSER CAP of a conversation started while Task Groups were held (主开发 08:04Z: «skipped in silence» — the first
        // row of the census above): the cap read throws by name while held ⇒ UNKNOWN (the keeper's undefined, the witness's 'unread'),
        // never «none in force» (null); the key WAITS and is stamped at the store's read (groups-hold's lift, signalled by the store)
        const GH = require(path.join(REPO, 'src/server/groups-hold.js')), BP = require(path.join(REPO, 'src/browser-profiles.js'));
        let h = true;
        // …and the keeper's WAITING caps are tried again at EVERY store change (onStoreChange — a B-55dc read that lands with no hold
        // lifted is a change too), held or not, until its off(): the stamp itself re-reads, so a still-held read keeps waiting
        let changes = 0; h = true; GH.setHeld(() => h); const offC = GH.onStoreChange(() => { changes++; });
        GH.noteChange(); h = false; GH.noteChange(); GH.noteChange(); const before = changes; offC(); GH.noteChange(); GH.setHeld(null);
        ok(before === 3 && changes === 3, '⑨ follow-owed: groups-hold\'s onStoreChange runs at every store change — while held, at the lift and after it — and never after its off()', { before, changes });
        ok(BP.witnessCap({ cap: 'unread' }) === undefined && BP.witnessCap({ cap: 2 }) === 2 && BP.witnessCap({ cap: 'x' }) === null && BP.witnessCap(null) === null,
          '⑨ follow-owed: a start-time witness of the cap while held is UNKNOWN (\'unread\' ⇒ undefined: the late key reads it live), any other non-integer none');
        // the wait OUTLIVES a restart (the follow-owed read's should 2): the registry keeps a `waiting` cap with the create's facts (bounded)
        { const K = 'bk-000000aa', n = BP.normalizeRegistry({ caps: { [K]: { cap: null, group: null, at: 5, waiting: true, facts: { cwd: '/w', hostId: 'h1', sessionKey: 'claude:x', initialGroupIds: ['T-1', 7], junk: 'x' } }, 'bk-000000bb': { cap: null, group: null } } });
          const kept = n && n.caps && n.caps[K];
          ok(!!kept && kept.waiting === true && JSON.stringify(kept.facts) === '{"sessionKey":"claude:x","cwd":"/w","hostId":"h1","initialGroupIds":["T-1"]}' && Object.keys(n.caps).length === 1, '⑨ follow-owed: a cap WAITING for Task Groups survives a restart — the registry keeps its mark and the create\'s facts (bounded keys only); an entry with nothing in it is still dropped', n && n.caps); }
        const KP = readSrc('src/server/browser-keeper.js'), WC = readSrc('src/ws-create.js'), MPW = readSrc('src/server/mounts-plugins-wiring.js'), TGW = readSrc('src/server/task-groups-wiring.js');
        ok(/catch \(e\) \{ if \(e && e\.code === 'TASK_GROUPS_UNREAD'\) return undefined;/.test(KP) && /if \(e && e\.code === 'TASK_GROUPS_UNREAD'\) \{ capWaiting\.set\(bk, facts \|\| \{\}\);/.test(KP)
          && /const offCapLift = require\('\.\/groups-hold\.js'\)\.onStoreChange\(\(\) => \{ if \(loaded\) retryWaitingCaps\(\); \}\);/.test(KP) && /function retryWaitingCaps\(\) \{ if \(!capWaiting\.size\) return; for \(const \[k, f\] of \[\.\.\.capWaiting\]\) \{ capWaiting\.delete\(k\); try \{ stampGroupCap\(k, f\);/.test(KP) && /loaded = true;\n\s*for \(const \[k, v\] of Object\.entries\(reg\.caps \|\| \{\}\)\) if \(v && v\.waiting === true\) capWaiting\.set\(k, v\.facts \|\| \{\}\);\n\s*if \(capWaiting\.size\) Promise\.resolve\(\)\.then\(\(\) => retryWaitingCaps\(\)\)/.test(KP) && /capWaiting\.set\(bk, facts \|\| \{\}\); if \(!\(v && v\.waiting === true\)\) \{ reg\.caps\[bk\] = \{ cap: v && Number\.isInteger\(v\.cap\) \? v\.cap : null, group: null, at: now\(\), waiting: true, facts: facts \|\| \{\} \}; commit\(\); \}/.test(KP) && /function shutdown\(\) \{ try \{ offCapLift\(\); \} catch \{ \}/.test(KP)
          && /spawnPinWitness\.cap = c0 === undefined \? 'unread' : c0;/.test(WC) && /if \(c === undefined\) c = 'unread';/.test(WC)
          && /const a = \{ sessionKey, cwd, hostId, initialGroupId, initialGroupIds \};\n\s*const ids = grantMemberIds\(tasks, a\);[^\n]*\n\s*if \(ids\.unread\) throw Object\.assign\(new Error\('the Task Group list is still being read'\), \{ code: 'TASK_GROUPS_UNREAD' \}\);/.test(MPW) && /onChange: \(ch\) => \{\n[^\n]*taskFanout\.note\(ch && ch\.ids\);[^\n]*\n\s*try \{ exitProxy\(\)\.rejudgeAll\('task-groups'\); \}[^\n]*\n\s*try \{ require\('\.\/groups-hold\.js'\)\.noteChange\(\); \} catch \{ \}/.test(TGW),
          '⑨ follow-owed: the cap road — the reader throws by name while held (through the seam\'s helper), the keeper answers UNKNOWN and keeps the key WAITING, stamped at the lift (and lets go at its shutdown); ws-create witnesses \'unread\'; the store signals the lift');
        // THE SECOND ROW — the group's DEFAULT browser profile at a create (a REMAINDER, stated in the kb): the real reader (its source)
        // throws by name while held (the keeper's taskGroupDefaultFor answers '' with its one warning — test-browser-handles), and
        // reads the group's default when the store is read
        {
          const L = MPW.split('\n'), i0 = L.findIndex((l) => /^\s*taskGroupDefault: \(\{ cwd = null/.test(l)), i1 = i0 < 0 ? -1 : L.findIndex((l, i) => i > i0 && /^ {6}\},$/.test(l));
          const fn = i1 > i0 && i0 >= 0 ? new Function('getTasks', `return ${L.slice(i0, i1 + 1).join('\n').trim().replace(/^taskGroupDefault: /, '').replace(/,$/, '')};`) : null;
          const G1 = [{ id: 'T-1', browserProfileId: 'bp-0000feed' }];
          let threw = null; try { fn(() => ({ isHeldUnread: () => true, groupsForSession: () => [] }))({ initialGroupId: 'T-1' }); } catch (e) { threw = e && e.code; }
          const readNow = fn ? fn(() => ({ isHeldUnread: () => false, groupsForSession: () => G1 }))({ initialGroupId: 'T-1' }) : null;
          ok(!!fn && threw === 'TASK_GROUPS_UNREAD' && readNow === 'bp-0000feed', '⑨ follow-owed: the group\'s DEFAULT profile at a create while held is UNKNOWN — the real reader throws by name (never «no group default» in silence); read, it answers the group\'s default', { threw, readNow });
        }
        // (1) the lost wake said where the person looks; (4) the create dialog's who refusal in the page's words; (3)/(card) the recorded lists
        const TGS = readSrc('src/task-groups.js'), CLAUSE = ' A channel watch by a Task Group, or one that leaves a Task Group out, wakes nobody until it reads; what arrives meanwhile stays in its channel.';
        const rows = ['zh', 'ja'].map((l) => (readSrc(`src/lib/i18n-${l}.js`).match(/A channel watch by a Task Group, or one that leaves a Task Group out, wakes nobody until it reads; what arrives meanwhile stays in its channel\./g) || []).length);
        ok((TGS.match(/A channel watch by a Task Group, or one that leaves a Task Group out, wakes nobody until it reads; what arrives meanwhile stays in its channel\."/g) || []).length === 2 && TGS.includes(CLAUSE) && JSON.stringify(rows) === '[2,2]',
          '⑨ follow-owed (1): the hold\'s For-you item says the lost wake — both detail sentences, their zh / ja rows', rows);
        ok(/say\(pw \|\| createRefusalWords\(r, t\) \|\| buildRefusalWords\(r, t\) \|\| whoRefusalWords\(r, t\) \|\|/.test(readSrc('src/lib/browser-new-profile.js')) && /case 'TASK_GROUPS_UNREAD': return t\(/.test(readSrc('src/lib/browser-who-model.js')),
          '⑨ follow-owed (4): the create dialog words the who list\'s refusals — the hold among them — in the page\'s words (zh / ja rows), never the server\'s English');
        ok(/if \(require\('\.\/groups-hold\.js'\)\.held\(\) \|\| \(p\.principal && p\.principal\.groupsUnreadable === true\)\) return null;   \/\/ Task Groups held unread, or the card filed while they were/.test(readSrc('src/server/channel-api-cards.js')) && /groups: p\.principal\.groups \|\| \[\], inheritedGroups: p\.principal\.inheritedGroups === null \? null : \(p\.principal\.inheritedGroups \|\| \[\]\), \.\.\.\(p\.principal\.groupsUnreadable === true \? \{ groupsUnreadable: true \} : \{\}\), \.\.\.require\('\.\/groups-hold\.js'\)\.fact\(\) \}\);/.test(readSrc('src/server/channel-api-cards.js')),
          '⑨ follow-owed (3): a recorded proposal\'s card never ENDS «withdrawn» on an unread tier — its liveness answers null while held AND for a card filed while held (its principal\'s own mark rides ctxOf too)');
        { const CO = readSrc('src/server/channels-outbound.js'), WT = readSrc('src/server/window-targets-engine.js');
          ok(/const drafterGroupsOf = \(ctx\) => [^\n]*\.\.\.\(ctx\.groupsUnreadable === true \? \{ drafterGroupsUnreadable: true \} : \{\}\)/.test(CO) && /\.\.\.\(\(!live && p\.drafterGroupsUnreadable === true\) \|\| \(live && \(live\.inherited === null \|\| live\.groupsUnread === true\)\) \? \{ groupsUnreadable: true \} : \{\}\), \.\.\.require\('\.\/groups-hold\.js'\)\.fact\(\)/.test(CO) && !/groupsOfSession\(String\(d\.id\)\)/.test(CO)
            && /const unread = groupsUnreadable === true \|\| \(!Array\.isArray\(g\) && require\('\.\/groups-hold\.js'\)\.held\(\)\);/.test(CO) && /groupsUnreadable: !live && cur\.drafterGroupsUnreadable === true \}\)/.test(CO)
            && /\.\.\.\(\(!live && a\.groupsUnreadable === true\) \|\| \(live && \(live\.inherited === null \|\| live\.groupsUnread === true\)\) \? \{ groupsUnreadable: true \} : \{\}\), \.\.\.require\('\.\/groups-hold\.js'\)\.fact\(\)/.test(CO) && /if \(!sees && ctx\.groupsUnreadable === true && !\(entry\.source === 'channel-receipt' && entry\.ref\)\) return \{ text: HELD_STASH_TEXT \};/.test(CO) && /const gk = `\$\{ctx\.groupsUnreadable === true \? '\?' : ''\}/.test(CO)
            && /const needGroups = row\.principal\.kind === 'group' \|\| one\.except\.some\(\(e\) => e && e\.kind === 'group'\);/.test(WT) && /const c = needGroups \? ctxOf\(\{ sessionId: id, session: s \}\)/.test(WT),
            '⑨ follow-owed (the read\'s MUST + shoulds): a drafter\'s groups and a stash entry\'s `about` read while held carry their OWN mark, judged while the conversation is STOPPED (a stopped one\'s membership cannot be read: groupsOfSession answers [] for it — never «read again» into «no group»); with the groups unknown, a refused stash entry is said as HELD BACK (its words withheld — a receipt keeps its fate line), never dropped in silence; the memo keys the mark; a window share that leaves a Task Group out reads every session\'s groups (a session / everyone row listed G\'s members as reached)'); }
        { // BEHAVIOUR (the delta reads): drafterSees and stashGate RUN from channels-outbound's source over a REAL grant row «All agents,
          // except Task Group G» (grant-model admits), marked / unmarked × stopped / live × held / read
          const GMm = require(path.join(REPO, 'src/grant-model.js')), GHm = require(path.join(REPO, 'src/server/groups-hold.js'));
          const COs = readSrc('src/server/channels-outbound.js');
          const fnSrc = (sig) => { const i = COs.indexOf(sig); if (i < 0) return null; const j = COs.indexOf('{', i + sig.length - 1); let d = 0; for (let k = j; k < COs.length; k++) { if (COs[k] === '{') d++; else if (COs[k] === '}' && --d === 0) return COs.slice(i, k + 1); } return null; };
          const ROW = GMm.prepareRow({ door: 'channel-reach', resource: '-', to: [{ kind: 'everyone' }], except: [{ kind: 'group', id: 'T-G' }] });
          const stillSeesS = (ctx) => GMm.admits([ROW], GMm.prepareFacts({ conversationKey: String(ctx.id), groupIds: ctx.groups || [], ...(ctx.groupsUnreadable === true ? { groupsUnreadable: true } : {}) })).ok;
          let LIVE = [];
          const out = {}, req = (m) => (m === './groups-hold.js' ? GHm : require(m));   // the functions' own relative require, as from src/server
          try {
            const DS = new Function('adapterRecords', 'registry', 'liveSessions', 'stillSees', 'scopeConvOf', 'require', 'groupsOfSession', `${fnSrc('function drafterSees(p) {')}; return drafterSees;`)(() => ({ adapters: [{ id: 'lark-1', kind: 'lark' }] }), { get: () => ({ reach: 'grants' }) }, () => LIVE, stillSeesS, () => null, req, () => []);   // groupsOfSession answers [] for a stopped one (the live rule) — a «read again» would be red here
            const SG = new Function('STASH_ABOUT_KEYS_MAX', 'liveSessions', 'msgAclAccount', 'stillSees', 'store', 'P', 'HELD_STASH_TEXT', 'require', 'groupsOfSession', 'CG', `${fnSrc('function stashGate(cid, entry, memo = null) {')}; return stashGate;`)(64, () => LIVE, () => false, stillSeesS, { outbox: { snapshot: () => ({ proposals: {} }) } }, { withheldReceiptLine: () => 'receipt fate' }, 'HELD BACK', req, () => [], { unread: () => false });   // r3059: the grants reader the gate asks first (readable here: this leg judges the groups)
            const dr = (extra) => ({ draftedBy: { kind: 'agent', id: 'c1' }, adapterId: 'lark-1', ...extra });
            const en = (about) => ({ source: 'channel', about: { keys: ['lark-1/conv1'], ...about } });
            GHm.setHeld(null); LIVE = [];
            out.read = { markedStopped: DS(dr({ drafterGroupsUnreadable: true })), plainStopped: DS(dr({})), stashMarked: SG('c1', en({ groups: [], groupsUnreadable: true })), stashPlain: SG('c1', en({ groups: [] })) };
            LIVE = [{ cid: 'c1', groups: ['T-G'] }];
            out.read.liveInG = DS(dr({ drafterGroupsUnreadable: true })); out.read.stashLiveInG = SG('c1', en({ groups: [], groupsUnreadable: true }));
            LIVE = [{ cid: 'c1', groups: [] }]; out.read.liveMarkedNoGroup = DS(dr({ drafterGroupsUnreadable: true }));   // CONTROL: live, the mark is NOT applied — its live groups judge
            GHm.setHeld(() => true); LIVE = [{ cid: 'c1', groups: [] }];
            out.held = { liveDrafter: DS(dr({})), stashLive: SG('c1', en({ groups: [] })) };
          } catch (e) { out.err = String(e && e.stack || e).slice(0, 300); }
          GHm.setHeld(null);
          ok(!out.err && out.read.markedStopped === false && out.read.plainStopped === true && JSON.stringify(out.read.stashMarked) === '{"text":"HELD BACK"}' && out.read.stashPlain === null
            && out.read.liveInG === false && out.read.liveMarkedNoGroup === true && JSON.stringify(out.read.stashLiveInG) === '{"drop":true}' && out.held.liveDrafter === false && JSON.stringify(out.held.stashLive) === '{"text":"HELD BACK"}',
            '⑨ follow-owed (the delta reads), RUN: once Task Groups read, a STOPPED drafter whose groups were recorded while held is still UNKNOWN under «All agents, except G» (withheld — never admitted as «in no group»; a plain recorded [] is), a marked stash entry is HELD BACK, a live conversation in G is refused for real (dropped); while held a live conversation is unknown too — held back, never dropped in silence', out); }
      }
      // THE REAL READER (automationGroupsRead, evaluated from its source) and the release's spelling of it (anchored) as the control
      const ARline = MP.split('\n').find((l) => l.startsWith('const automationGroupsRead = (s, id) => {'));
      const ARtext = ARline ? ARline.slice('const automationGroupsRead = '.length).replace(/;\s*$/, '') : null;
      const GMIline = MP.split('\n').find((l) => l.startsWith('const grantMemberIds = '));   // the seam's ONE helper, handed in from its own source line
      const GMI = GMIline ? new Function(`return ${GMIline.slice('const grantMemberIds = '.length).replace(/;\s*$/, '')};`)() : null;
      const ARof = (text, mgr) => new Function('getTasks', 'sessionStatusKey', 'grantMemberIds', `return ${text};`)(() => mgr, () => KEY, GMI);
      const sess = { cwd: '/nowhere', claudeSessionId: CID };
      const rHeld = ARtext ? ARof(ARtext, held)(sess, 'w1') : null, rRead = ARtext ? ARof(ARtext, read)(sess, 'w1') : null;
      const ARrel = ARtext ? anchored(anchored(ARtext, 'grantMemberIds(tasks, { sessionKey: sessionStatusKey(s, id), cwd: s.cwd, hostId: s.host || null, initialGroupId: s._initialGroupId, initialGroupIds: s._initialGroupIds })', 'tasks.groupsForSession({ sessionKey: sessionStatusKey(s, id), cwd: s.cwd, initialGroupId: s._initialGroupId, initialGroupIds: s._initialGroupIds }).map((g) => g.id)', 'the release reader'), 'const gg = tasks.grantGroupsOf(ids); return { ids: gg.ids, inherited: gg.inherited, unreadable: !!ids.unread };', 'return { ids: [...ids], unreadable: false };', 'the release reader — without the lineage (B-91a7\'s grantGroupsOf answers the hold too)') : null;   // stale-pins: kept — the control writes the release's reader back on purpose
      const rRel = ARrel ? ARof(ARrel, held)(sess, 'w1') : null;
      const fx = (r) => ({ conversationKey: CID, groupIds: r.ids, ...(r.unreadable ? { groupsUnreadable: true } : {}) });
      ok(!!rHeld && rHeld.unreadable === true && GM.admits([EXCEPT_G], fx(rHeld)).code === 'groups_unreadable' && !!rRead && JS(rRead.ids) === '["T-a1"]' && GM.admits([EXCEPT_G], fx(rRead)).code === 'excepted', '⑨ …the REAL automationGroupsRead (its source) over a held store: unreadable ⇒ the except-G row refuses G\'s conversation as unreadable; over a store that reads: excepted', { rHeld, rRead });
      ok(!!rRel && rRel.unreadable === false && GM.admits([EXCEPT_G], fx(rRel)).ok === true, '⑨ CONTROL — the same reader with the release\'s call (groupsForSession): «in no group», the except-G row ADMITS G\'s conversation', rRel);
      // THE GRANT MODEL'S PREDICATE at the doors judging a live agent from the roster: the automation reach, channel-filter's rowNames
      const AK = require(path.join(REPO, 'src/automation-keys.js')), CF = require(path.join(REPO, 'src/channel-filter.js'));
      const REACH = [{ door: 'automation-key-reach', resource: 'K-1', to: [{ kind: 'everyone' }], except: [{ kind: 'group', id: 'T-a1' }] }];
      const reachOf = (f = {}) => AK.reachVerdict({ keyId: 'K-1', caller: 'aaaaaaaa-1111-4000-8000-0000000000b2', target: { conversationId: CID, groups: [], ...f }, reach: 'instance', reachRows: REACH });
      const ROW = { principal: { kind: 'everyone', id: '*' }, except: [{ kind: 'group', id: 'T-a1' }] };
      const UK = { id: 'ak-000000000001', name: 'dispatch', scopes: ['conversations.rename'], createdAt: 1, createdBy: 'user', revokedAt: null, lastUsedAt: null, digest: 'a'.repeat(64) };
      const UG = { id: 'ag-000000000001', keyId: 'ak-000000000001', subject: 'everyone:*', mode: 'always', at: 1, by: 'user', spentAt: null, use: { door: 'automation-key-use', resource: 'ag-000000000001', to: [{ kind: 'everyone' }], except: [{ kind: 'group', id: 'T-a1' }] } };
      const useOf = (u) => AK.useVerdict({ key: UK, grants: [UG], subject: `session:${CID}`, subjectGroups: [], subjectGroupsUnreadable: u, verb: 'conversations.rename', vaultState: 'unlocked' });
      const akHeld = reachOf(ghFacts[0]), cfHeld = CF.rowNames(ROW, { kind: 'agent', id: CID, groups: [], ...ghFacts[0] }), uHeld = useOf(rHeld ? rHeld.unreadable : false);
      const uRel = useOf(rRel ? rRel.unreadable : false);
      ok(uHeld.ok === false && uHeld.code === 'groups_unreadable' && uRel.ok === true, '⑨ …an automation key\'s USE «All agents, except G» (the real useVerdict, handed what the REAL automationGroupsRead said): refused as groups_unreadable while held; CONTROL — the release\'s reader: admitted', { held: uHeld.code, rel: uRel.ok });
      ok(/return GM\.admits\(\[\{ door: DOORS\.watch, resource: String\(res\), to: own, except: exceptFor\(own\[0\], r\.except\) \}\], \{ conversationKey: String\(cid\), groupIds: groups, inheritedGroupIds: Array\.isArray\(inherited\) \? inherited : \[\], \.\.\.\(groupsUnreadable === true \|\| inherited === null \? \{ groupsUnreadable: true \} : \{\}\) \}\)\.ok;/.test(readSrc('src/server/channels-grants.js')), '⑨ …channels-grants wakeAdmits puts the hold IN the facts its admits judges (the call site — its store is not cheap to stand up here)');
      const akRel = reachOf(), cfRel = CF.rowNames(ROW, { kind: 'agent', id: CID, groups: [] });   // the release: no fact handed
      ok(akHeld.ok === false && cfHeld === false && akRel.ok === true && cfRel === true, '⑨ …an automation key\'s reach «whole VibeSpace except G» and a channel row «All agents except G» (channel-filter rowNames) do not name G\'s conversation while held; CONTROL — no hold handed (the release): both name it', { akHeld: akHeld.code || akHeld.ok, cfHeld, akRel: akRel.ok, cfRel });
    }
    // MUST 2 — jobs-wiring viewerOf answers null while held (UNKNOWN: the line is held for the drain, never refused as «in no group»):
    // the REAL arrow, evaluated from the source over a held real manager and a live session of G's conversation
    {
      const JW = readSrc('src/server/jobs-wiring.js');
      const head = '    viewerOf: (cid) => {', at = JW.indexOf(head), end = at >= 0 ? JW.indexOf('\n    },\n', at) : -1;
      const text = at >= 0 && end > at ? JW.slice(at + '    viewerOf: '.length, end + '\n    }'.length) : null;
      const req = createRequire(path.join(REPO, 'src/server/jobs-wiring.js'));
      const viewer = (src, mgr) => new Function('taskGroups', 'activeSessions', 'sessionStatusKey', 'require', `return ${src};`)(mgr, new Map([['w1', { claudeSessionId: CID, cwd: '/nowhere', createdAt: 1 }]]), () => KEY, req);
      const held = heldOver('viewer-held', MEMBER), read = readOver('viewer-read', MEMBER);
      const vHeld = text ? viewer(text, held)(CID) : 'no slice', vRead = text ? viewer(text, read)(CID) : null;
      ok(!!vHeld && vHeld.held === true && vHeld.live === false && vHeld.conversationId === CID && vHeld.sessionId === 'w1' && vHeld.sessionCreatedAt === 1 && vHeld.groups.size === 0 && !!vRead && vRead.live === true && [...vRead.groups].join() === 'T-a1', '⑨ cure MUST 2: viewerOf over a HELD store answers a view of NO record MARKED held (never a live view «in no group»); over a store that reads, the live view with G', { vHeld: vHeld && { live: vHeld.live, held: vHeld.held }, read: vRead && [...vRead.groups] });
      const rel = text ? anchored(text, /\n *if \(taskGroups && typeof taskGroups\.unreadState === 'function' && taskGroups\.unreadState\(\)\) \{[^\n]*\n[^\n]*\n[^\n]*\n *\}\n/, '\n', 'viewerOf hold') : null;
      const vRel = rel ? viewer(rel, held)(CID) : null;
      ok(!!vRel && vRel.live === true && vRel.groups.size === 0, '⑨ CONTROL — viewerOf without the hold\'s line (the release): a PROVEN view «in no group» for a store that only could not be read', vRel && { live: vRel.live, groups: [...vRel.groups] });
    }
    // MUST 2 — THE DRAIN (the reader's must): JobManager's own peekNotifs / printableNow / addressedNow over the held view — a
    // subscriber's line only a group proves stays QUEUED, unprinted (never dropped, never printed); the owner's line prints
    {
      const { JobManager } = require(path.join(REPO, 'src/jobs.js'));
      const J = { id: 'j-grp', owner: { conversation: { id: 'aaaaaaaa-1111-4000-8000-0000000000b2' }, groupsSnapshot: ['T-a1'] }, access: { view: 'group' }, subscribers: [{ conversationId: CID }] };
      const O = { id: 'j-own', owner: { conversation: { id: CID } }, access: {} };
      const engine = (viewer) => { const e = Object.create(JobManager.prototype); Object.assign(e, { d: { viewerOf: () => viewer, log: () => {}, broadcast: () => {} }, jobs: new Map([[J.id, J], [O.id, O]]), pendingNotifs: new Map([[CID, [{ jobId: J.id, sub: true, ts: 1 }, { jobId: O.id, ts: 2 }]]]), archivedById: () => null, _cronParentOf: () => null, _saveNotifs: () => {} }); return e; };
      const HELDV = { live: false, held: true, conversationId: CID, groups: new Set() };
      const eh = engine(HELDV), peekH = eh.peekNotifs(CID).map((n) => n.jobId), keptH = (eh.pendingNotifs.get(CID) || []).map((n) => n.jobId);
      const er = engine({ live: true, conversationId: CID, groups: new Set(['T-a1']) }), peekR = er.peekNotifs(CID).map((n) => n.jobId);
      ok(JS(peekH) === '["j-own"]' && JS(keptH) === '["j-grp","j-own"]' && JS(peekR) === '["j-grp","j-own"]', '⑨ cure MUST 2 · the drain: while held the owner\'s line prints and the group-proven subscriber line stays QUEUED (neither printed nor dropped); after the lift (the live view with G) both print', { peekH, keptH, peekR });
      const en = engine(null), peekN = en.peekNotifs(CID).map((n) => n.jobId);
      const ev = engine({ live: true, conversationId: CID, groups: new Set() }), peekV = ev.peekNotifs(CID).map((n) => n.jobId), keptV = (ev.pendingNotifs.get(CID) || []).map((n) => n.jobId);
      ok(JS(peekN) === '["j-grp","j-own"]' && JS(peekV) === '["j-own"]' && JS(keptV) === '["j-own"]', '⑨ CONTROLS — a bare null view (the first cut): the subscriber line PRINTED while held; the release\'s live view «in no group»: it is DROPPED for good', { peekN, peekV, keptV });
    }
    // MUST 3 — THE PAGE: a list answer carrying `unread` keeps the mirror HELD; the windows' verdict over it; the lift fetches again.
    // The PURE verdicts (src/task-delta.js) + the REAL _fetchTasks / _onTasksDelta (sidebar-tasks.js, evaluated from the source)
    {
      ok(TD.listVerdict({ tasks: [], unread: { file: 'task-groups.json' } }) === 'held' && TD.listVerdict({ tasks: [] }) === 'load'
        && TD.windowVerdict(null, { loaded: false, unread: { file: 'x' } }) === 'held' && TD.windowVerdict(null, { loaded: true, unread: { file: 'x' } }) === 'held'
        && TD.windowVerdict(null, { loaded: false }) === 'loading' && TD.windowVerdict(null, { loaded: true }) === 'gone' && TD.windowVerdict({ id: 'T-a1' }, { loaded: true }) === 'show',
        '⑨ cure MUST 3: the PURE verdicts — an answer with `unread` is HELD (else loaded); a window over a held mirror says the hold (never «gone»), only a mirror loaded WHOLE without its group closes it');
      const ST = readSrc('src/lib/sidebar-tasks.js');
      const fnOf = (src, head) => { const a = src.indexOf(head), b = a >= 0 ? src.indexOf('\n  };\n', a) : -1; if (a < 0 || b < 0) throw new Error('SLICE GONE ' + head); return src.slice(a + head.length, b + '\n  }'.length); };
      const FETCH = fnOf(ST, 'proto._fetchTasks = '), DELTA = fnOf(ST, 'proto._onTasksDelta = ');
      const mirror = (fetchText) => {
        const answers = [], asked = [];
        const fetch = () => { asked.push(1); return new Promise((res) => answers.push((body) => res({ ok: true, status: 200, json: async () => body }))); };
        const hold = (list, msg) => { list.push(msg); };
        const m = new Function('fetch', 'TD', 'showToast', 'tr', 'hold', `const { frameStep, applyTasksDelta, fetchVerdict, listVerdict } = TD; return { _fetchTasks: ${fetchText}, _onTasksDelta: ${DELTA} };`)(fetch, TD, () => {}, (s) => s, hold);
        const sb = { ...m, _tasks: [{ id: 'T-a1', title: 'Alpha' }], _tasksLoaded: true, _tasksMark: { loaded: true, epoch: 1, seq: 3 }, _tasksGen: 1, said: [], _afterTasksChange(msg) { this.said.push(msg); }, _taskById(id) { return this._tasks.find((t) => t.id === id) || null; } };
        const answer = async (body) => { while (!answers.length) await new Promise((r) => setImmediate(r)); answers.shift()(body); for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); };
        return { sb, asked, answer };
      };
      const UNREAD = { file: 'task-groups.json', code: 'EIO', why: 'unreadable', at: 1, damaged: false };
      const verdictOf = (sb) => TD.windowVerdict(sb._taskById('T-a1'), { loaded: sb._tasksLoaded, unread: sb._tasksUnread });
      const A = mirror(FETCH);
      A.sb._fetchTasks(); await A.answer({ tasks: [], epoch: 2, seq: 0, unread: UNREAD });
      ok(A.sb._tasksLoaded === false && !!A.sb._tasksUnread && A.sb._tasks.length === 0 && verdictOf(A.sb) === 'held' && A.sb.said.length === 1 && A.sb.said[0].refetch === true, '⑨ …the REAL _fetchTasks over a held answer (a mirror that had Alpha): HELD, not loaded-and-empty — the open window\'s verdict says the hold; the windows are told (refetch)', { loaded: A.sb._tasksLoaded, v: verdictOf(A.sb) });
      A.sb._fetchTasks(); A.sb._onTasksDelta({ type: 'tasks-updated', epoch: 2, base: 0, seq: 1, changed: [] });
      ok(A.sb._tasksAskAgain === true && A.asked.length === 2, '⑨ …a frame landing while a fetch is out (it may have been answered before the lift): it asks once MORE after it', { again: A.sb._tasksAskAgain, asked: A.asked.length });
      await A.answer({ tasks: [], epoch: 2, seq: 0, unread: UNREAD });
      await A.answer({ tasks: [{ id: 'T-a1', title: 'Alpha' }], epoch: 3, seq: 0 });
      ok(A.asked.length === 3 && A.sb._tasksLoaded === true && !A.sb._tasksUnread && verdictOf(A.sb) === 'show', '⑨ …the lift: the asked-again fetch answers the whole list — loaded, the hold gone, the window shows its group again', { asked: A.asked.length, v: verdictOf(A.sb) });
      const B = mirror(FETCH);
      B.sb._fetchTasks(); await B.answer({ tasks: [], epoch: 2, seq: 0, unread: UNREAD });
      B.sb._onTasksDelta({ type: 'tasks-updated', epoch: 3, base: 0, seq: 0, changed: [] });
      await B.answer({ tasks: [{ id: 'T-a1', title: 'Alpha' }], epoch: 3, seq: 0 });
      ok(B.asked.length === 2 && B.sb._tasksLoaded === true && verdictOf(B.sb) === 'show', '⑨ …the lift\'s broadcast (a frame while held, no fetch out) fetches the list again at once', { asked: B.asked.length });
      const REL = anchored(FETCH, /\n *if \(listVerdict\(data\) === 'held'\) \{[^\n]*\n *this\._tasksUnread = null;/, '', 'the held branch');
      const C = mirror(REL);
      C.sb._fetchTasks(); await C.answer({ tasks: [], epoch: 2, seq: 0, unread: UNREAD });
      ok(C.sb._tasksLoaded === true && verdictOf(C.sb) === 'gone', '⑨ CONTROL — _fetchTasks without the held branch (the release): loaded-and-EMPTY, the open Task Group window\'s verdict «gone» (closed as «deleted elsewhere»)', { loaded: C.sb._tasksLoaded, v: verdictOf(C.sb) });
      const DT = readSrc('src/lib/task-detail.js'), TL = readSrc('src/lib/task-log.js');
      ok(/const v = windowVerdict\(task, \{ loaded: sidebar\._tasksLoaded, unread: sidebar\._tasksUnread \}\);[^\n]*\n *if \(v !== 'gone'\) \{ body\.innerHTML/.test(DT) && /const v = windowVerdict\(task, \{ loaded: sidebar\._tasksLoaded, unread: sidebar\._tasksUnread \}\);[^\n]*\n *if \(v !== 'gone'\) \{ root\.innerHTML/.test(TL)
        && /if \(!task && sidebar\._tasksLoaded\) \{ showToast\(t\('Task Group not found'\)/.test(DT) && /if \(this\._tasksUnread\) \{ const hold = document\.createElement\('div'\); hold\.className = 'empty-hint task-board-unread';[^\n]*\n *else this\.listEl\.appendChild\(addRow\);/.test(ST)
        && /if \(data && data\.code === 'TASK_GROUPS_UNREAD'\) \{ showToast\(tr\("Task Groups cannot be read right now — nothing was recorded\. For you says why and what to do\."\)/.test(ST),
        '⑨ …the windows draw the verdict (Task Group + Task log); the open refuses «not found» only over a LOADED mirror; the board says the hold in place of the create row; a refusal is worded by the PAGE from its code (zh / ja rows)');
    }
    // (h) THE DEDUPE: the real wiring's notice (createStore) into a real For-you store — a second held start files NO second item
    {
      const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));
      const WR = require(path.join(REPO, 'src/server/task-groups-wiring.js'));
      const w = world('dedupe'); fs.writeFileSync(w.file, JSON.stringify(SEED));
      const ut = new UserTodoManager({ dataDir: w.dd, onChange: () => {}, expirySweepMs: 0 });
      const start = () => WR.createStore({ app: { locals: {} }, wss: { clients: new Set() }, WS_OPEN: 1, activeSessions: new Map(), grants: null, persistenceRouter: { readUserState: () => ({}) }, serverSetting: () => undefined, sessionStatusKey: () => '', dataDir: w.dd, exitProxy: () => null, channelsWiring: () => null, sessionStatus: () => null, mounts: () => null, userTodos: () => ut }).tasks;
      const items = () => ut.snapshot().open.filter((i) => i.sessionKey === 'task-groups-unread');
      try {
        const t1 = failing(w.file, 'EIO', () => start());   // the first held start: an I/O error (its words: «could not be read (EIO)»)
        const one = items().map((i) => i.text);
        fs.writeFileSync(w.file, '{"version":1,"tasks":{"T-');
        const t2 = start();   // the second: damaged bytes — OTHER words (a words-match would file a second item; the producer identity does not)
        const two = items();
        ok(one.length === 1 && /\(EIO\)/.test(one[0]) && !!t1.unreadState() && !!t2.unreadState() && two.length === 1 && two[0].by === 'system' && /is damaged/.test(two[0].text) && !/did not parse/.test(two[0].text) && /move it aside and restart/.test(two[0].detail || ''), '⑨ (h) a second held start files NO second notice: ONE item per (task-groups-unread, store) — the For-you store\'s producer identity (itemKey); filed by the system; a damaged file\'s words name the door, no English why inside', two.map((i) => ({ text: i.text, by: i.by })));
        fs.writeFileSync(w.file, JSON.stringify(SEED));
        const t3 = start();
        await new Promise((r) => setImmediate(r));
        ok(!t3.unreadState() && items().length === 0, '⑨ (h) …a start that reads closes it');
      } finally { require(path.join(REPO, 'src/server/groups-hold.js')).setHeld(null); }   // createStore set the hub's fact
    }
    // (b) the hook's line, (e) the import reads every month first, (f) the row / record-clear words, (g) the two migrations
    {
      const held = heldOver('hook', MEMBER), read = readOver('hook-read', MEMBER);
      const line = held.unreadHookLine();
      ok(typeof line === 'string' && /UNKNOWN, not empty/.test(line) && /task-groups\.json/.test(line) && read.unreadHookLine() === null
        && /let context = \(typeof tasks\.unreadHookLine === 'function' && tasks\.unreadHookLine\(\)\) \|\| '';/.test(readSrc('src/agent-routes.js'))
        && /if \(heldLine\) tailHeld \+= B\(heldLine\) \+ 2;\n *const committed = \(\) => [^\n]*\+ tailHeld;/.test(readSrc('src/agent-routes.js')) && /if \(heldLine\) outParts\.unshift\(heldLine\);[^\n]*\n(?:[^\n]*\n){0,40}?[^\n]*const used = Buffer\.byteLength\(outParts\.join/.test(readSrc('src/agent-routes.js')),
        '⑨ (b) while held the hook injection says ONE line (the groups UNKNOWN, not empty — the file named) and every fit test COUNTS it (the start\'s context begins with it; the prompt holds its room in tailHeld and the report\'s fit includes it); a store that reads says none', line);
      const TWO = JSON.stringify({ version: 1, tasks: { 'T-a1': SEED.tasks['T-a1'], 'T-b2': { ...SEED.tasks['T-a1'], id: 'T-b2', title: 'Beta' } } });
      const w = world('import'); fs.writeFileSync(w.file, TWO);
      const { m } = make(fresh(), w.dd);
      const mf = path.join(w.dd, 'task-groups-archive', 'T-b2', '2026-01.ndjson'); fs.mkdirSync(path.dirname(mf), { recursive: true }); fs.writeFileSync(mf, '');
      const bundle = { version: 1, tasks: [{ ...SEED.tasks['T-a1'], title: 'Alpha IMPORTED' }, { ...SEED.tasks['T-a1'], id: 'T-b2', title: 'Beta IMPORTED' }], archive: { 'T-b2': { '2026-01': '' } } };
      const r = failing(mf, 'EIO', () => tried(() => m.importBundle(bundle)));
      ok(!!r && r.code === 'TASK_GROUPS_UNREAD' && m.get('T-a1').title === 'Alpha' && m.get('T-b2').title === 'Beta', '⑨ (e) importBundle reads EVERY group\'s months strictly before its loop: one month that could not be read refuses the import before ANY group moves', { r, a1: m.get('T-a1').title });
      const TG = readSrc('src/task-groups.js');
      const relSrc = anchored(TG, /\n *for \(const raw of items\) \{ if \(!raw[^\n]*pre\.set\(raw\.id, have\); \}\n/, '\n', 'the pre-pass');   // the read-first loop gone: each group reads its own months as the release did
      const M = mutantCopies('tg-unread-cure', REPO);
      const TGMr = M.load('src/task-groups.js', relSrc, 'import').TaskGroupManager;
      const w2 = world('import-rel'); fs.writeFileSync(w2.file, TWO);
      const { m: m2 } = make(TGMr, w2.dd);
      const mf2 = path.join(w2.dd, 'task-groups-archive', 'T-b2', '2026-01.ndjson'); fs.mkdirSync(path.dirname(mf2), { recursive: true }); fs.writeFileSync(mf2, '');
      const r2 = failing(mf2, 'EIO', () => tried(() => m2.importBundle(bundle)));
      ok(!!r2 && m2.get('T-a1').title === 'Alpha IMPORTED', '⑨ CONTROL — without the pre-pass: the import refused HALF-WAY, the first group already applied', { r2: r2 && r2.code, a1: m2.get('T-a1').title });
      const BK = readSrc('src/server/browser-keeper.js'), RC = readSrc('src/server/record-clear.js'), MP = readSrc('src/server/mounts-plugins-wiring.js');
      ok(/const heldTaskWords = /.test(BK) && (BK.match(/knownTask: knownTaskOrHeld/g) || []).length === 2 && /TASK_GROUPS_UNREAD[^\n]*RC\.refuse\('unavailable'\)[^\n]*why: String\(e\.message\)/.test(RC) && /taskInfo: \(id\) => \{[\s\S]{0,500}?unreadRefusal\('a Task Group row'\)/.test(MP),
        '⑨ (f) a browser profile\'s group row and record-clear answer with the hold\'s words (never «that group no longer exists» / a generic failure)');
      const root = scratchDir('tg-unread-mig'); roots.push(root); const dd = path.join(root, 'data'); fs.mkdirSync(dd, { recursive: true });
      const mh = path.join(dd, 'task-groups.json'); fs.writeFileSync(mh, MEMBER);
      fs.writeFileSync(path.join(dd, 'user-state.json'), JSON.stringify({ archivedSessions: [KEY] }));   // an archive list: archived-members has work to do (with none it answers {archived: 0} — nothing to judge)
      const mg = failing(mh, 'EIO', () => make(fresh(), dd)).m;
      const home = scratchDir('tg-unread-mig-home'); roots.push(home);
      const res = require(path.join(REPO, 'src/server/migrations.js')).create({ rootDir: root, homeDir: home, serverNotice: () => { }, tasks: mg }).runLocalMigrations();
      const two = ['2026-08-archive-dormant-task-plans', '2026-10-task-group-archived-members', '2026-10-task-group-context-rows'].map((id) => res.find((x) => x.id === id));
      const ledger = (() => { try { return JSON.parse(fs.readFileSync(path.join(dd, 'migrations.json'), 'utf8')).applied || {}; } catch { return {}; } })();
      ok(two.slice(0, 2).every((x) => x && x.status === 'failed' && /this migration was refused/.test(x.error)) && !!two[2] && two[2].status === 'failed' && /migration was refused/.test(two[2].error)
        && two.every((x) => !ledger[x.id]) && fs.readFileSync(mh, 'utf8') === MEMBER,
        '⑨ (g) the two migrations the hold guards (dormant plans, archived members — given an archive list) over a HELD real store REFUSE by name — failed, NOT in the ledger (tried again next boot), the store\'s bytes untouched; the Context rows\' migration refuses in its own words', two);
    }
    // (g) the routes' guard over a held real store, on a real express app (in-process, loopback): the list says `unread`, a write 503s
    {
      const express = require(path.join(REPO, 'node_modules/express'));
      const held = heldOver('routes', MEMBER);
      const app = express(); app.use(express.json());
      require(path.join(REPO, 'src/server/task-groups-wiring.js')).mountRoutes({ app, tasks: held, taskFanout: { mark: () => ({ epoch: 1, seq: 0 }) }, activeSessions: new Map(), sameToken: () => false, serverSetting: () => undefined, sessionStatusKey: () => '', spendGuard: null });
      const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
      try {
        const base = `http://127.0.0.1:${srv.address().port}`;
        const list = await (await fetch(base + '/api/tasks')).json();
        const post = await fetch(base + '/api/tasks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"title":"x"}' });
        const pb = await post.json();
        const prog = await fetch(base + '/api/tasks/T-a1/progress');
        ok(JS(list.tasks) === '[]' && !!list.unread && list.unread.code === 'EIO' && post.status === 503 && pb.code === 'TASK_GROUPS_UNREAD' && !!pb.unread && prog.status === 503 && held.list().length === 0,
          '⑨ (g) the routes\' guard over a held real store: the list answers `unread`; a create and a progress read answer 503 TASK_GROUPS_UNREAD (with `unread`, for the page) before any group is read', { unread: list.unread, post: post.status, code: pb.code, prog: prog.status });
      } finally { await new Promise((r) => srv.close(r)); }
    }
    // ── THE FOLLOW (主开发's five points + the hold out of the pure model) ──
    {
      // (3) ONE LOG LINE A HOLD: groupIdsForGrant throws at every call; only the FIRST of a hold is marked for the readers' log
      const held = heldOver('once', MEMBER);
      const flagOf = (mgr, reader) => { try { mgr.groupIdsForGrant({ sessionKey: KEY }, reader); return null; } catch (e) { return e && e.code === 'TASK_GROUPS_UNREAD' ? !!e.firstOfHold : 'other'; } };
      const seq = [flagOf(held), flagOf(held), flagOf(held, 'exit'), flagOf(held, 'exit'), flagOf(held, 'window'), flagOf(held, 'browser-key'), flagOf(held, 'browser'), flagOf(held, 'browser')];
      const w2 = world('once-again'); fs.writeFileSync(w2.file, MEMBER); const h2 = failing(w2.file, 'EIO', () => make(fresh(), w2.dd)).m;
      const firstOfNew = flagOf(h2, 'exit');
      const logs = ['src/exit-proxy.js', 'src/server/window-targets-engine.js', 'src/server/mounts-plugins-wiring.js', 'src/routes/browser.js'].map((f) => (readSrc(f).match(/if \(!\(e && e\.code === 'TASK_GROUPS_UNREAD'\) \|\| e\.firstOfHold\) /g) || []).length);
      const names = (readSrc('server.js').match(/tasks\.groupIdsForGrant\(a, '(exit|window)'\)/g) || []).length === 2 && /initialGroupIds: hit\._initialGroupIds \}, 'browser-key'\)/.test(readSrc('src/server/mounts-plugins-wiring.js')) && /initialGroupIds: s\._initialGroupIds \}, 'browser'\);/.test(readSrc('src/server/mounts-plugins-wiring.js'));
      ok(JS(seq) === '[true,false,true,false,true,true,true,false]' && firstOfNew === true && JS(logs) === '[1,1,1,1]' && names, '⑨ follow (3): the grant refusal is thrown at every call but only the FIRST of a hold is marked firstOfHold, PER READER (a silent reader never takes the exit\'s / window\'s / browser\'s one line; another hold marks its own); the four readers that logged at every call name themselves and log that one', { seq, firstOfNew, logs, names });
      // (4) the who-dialog's pure verdict RETURNS the hold as a refusal value (never a throw out of its callback)
      const B = require(path.join(REPO, 'src/browser-profiles.js'));
      const prof = { id: 'bp-00000001', label: 'Desk', grantUse: { to: [{ kind: 'everyone' }], except: [] } };
      const use = { mode: 'only', who: [{ kind: 'task', id: 'T-a1' }] };
      const vHold = (() => { try { return B.usePatchVerdict({ profile: prof, use, knownTask: () => ({ refusal: { code: 'TASK_GROUPS_UNREAD', error: 'Task Groups: held (test)' } }), knownKey: () => false, conversationOf: () => null }); } catch (e) { return { threw: e.message }; } })();
      const vGone = B.usePatchVerdict({ profile: prof, use, knownTask: () => false, knownKey: () => false, conversationOf: () => null });
      const vObj = B.usePatchVerdict({ profile: prof, use, knownTask: () => ({ something: true }), knownKey: () => false, conversationOf: () => null });
      const vOk = B.usePatchVerdict({ profile: prof, use, knownTask: () => ({ refusal: { ok: true, code: 'TASK_GROUPS_UNREAD', error: 'x' } }), knownKey: () => false, conversationOf: () => null });
      ok(vHold.ok === false && vHold.code === 'TASK_GROUPS_UNREAD' && vHold.error === 'Task Groups: held (test)' && vGone.code === 'unknown_task' && vObj.code === 'unknown_task' && vOk.ok === false && /return \{ refusal: \{ code: 'TASK_GROUPS_UNREAD', error: w \} \}/.test(readSrc('src/server/browser-keeper.js')), '⑨ follow (4): the profile\'s «who may use» verdict answers the hold as a refusal VALUE (the keeper\'s knownTask hands it); a group the store does not list stays unknown_task', { vHold, vGone: vGone.code });
      // (2) a held viewer's line gets its OWN kind and words (journal, strip, tail) — never «a conversation that is not running»
      const JMm = require(path.join(REPO, 'src/job-model.js'));
      const { JobManager } = require(path.join(REPO, 'src/jobs.js'));
      const J = { id: 'j-grp2', name: 'grp', owner: { conversation: { id: 'aaaaaaaa-1111-4000-8000-0000000000b2' }, groupsSnapshot: ['T-a1'] }, access: { view: 'group' }, subscribers: [{ conversationId: CID }] };
      const stashed = [];
      const eng = (viewer) => { const e = Object.create(JobManager.prototype); Object.assign(e, { d: { viewerOf: () => viewer, log: () => {}, broadcast: () => {} }, jobs: new Map([[J.id, J]]), archivedById: () => null, _cronParentOf: () => null, _stashNotif: (cid, job, ev, why, o) => stashed.push({ why, kind: o && o.held && o.held.kind }) }); return e; };
      const entry = { id: 'pk-1', firstAt: 1, meta: { subscriber: true, sub: true, jobId: J.id, jobName: 'grp', ev: { what: 'done', at: 1 } } };
      const eh = eng({ live: false, held: true, conversationId: CID, groups: new Set() });
      const owedH = eh.retryOwed(CID, entry), memoH = eh._retryVerdicts.get('pk-1');
      const en = eng(null); const owedN = en.retryOwed(CID, entry), memoN = en._retryVerdicts.get('pk-1');
      const tail = JMm.notifTailSentence([{ held: { kind: 'groups-unread' } }]);
      ok(owedH === false && memoH === 'groups-unread' && JS(stashed.map((x) => x.kind)) === '["groups-unread","not-running"]' && /Task Groups store cannot be read/.test(stashed[0].why) && owedN === false && memoN === 'unknown'
        && JMm.HELD_KINDS.includes('groups-unread') && /could not read its Task Groups/.test(tail) && /kind === 'groups-unread'\) why = tr\("VibeSpace cannot read its Task Groups right now/.test(readSrc('src/lib/jobs-layout.js')),
        '⑨ follow (2): a held viewer\'s parked line is held under its OWN kind (groups-unread: the journal, the tail, the strip say the Task Groups store); CONTROL — no record of the conversation: still «not-running»', { stashed, memoH, memoN, tail });
      // …and THE PUSH ROAD (where most held lines are born): _notifyOwner's subscriber copy under a held view ⇒ groups-unread;
      // CONTROL: a view of no record that is not held ⇒ not-running, as on the release
      const pushStash = [];
      const engP = (viewer) => { const e = Object.create(JobManager.prototype); Object.assign(e, { d: { viewerOf: () => viewer, log: () => {}, broadcast: () => {} }, jobs: new Map([[J.id, J]]), archivedById: () => null, _cronParentOf: () => null, _stashNotif: (cid, job, ev, why, o) => pushStash.push({ cid, kind: o && o.held && o.held.kind, why }) }); return e; };
      engP({ live: false, held: true, conversationId: CID, groups: new Set() })._notifyOwner({ ...J, kind: 'command', state: 'done' }, { what: 'done' });
      engP({ live: false, conversationId: CID, groups: new Set() })._notifyOwner({ ...J, kind: 'command', state: 'done' }, { what: 'done' });
      const subKinds = pushStash.filter((x) => x.cid === CID).map((x) => x.kind);
      ok(JS(subKinds) === '["groups-unread","not-running"]' && /Task Groups store cannot be read/.test((pushStash.find((x) => x.kind === 'groups-unread') || {}).why || ''), '⑨ follow (2): the PUSH road — a subscriber\'s copy under a held view is stashed under groups-unread; CONTROL: a view of no record that is not held is still not-running', pushStash);
      // (1) the backup dialog: the hold as a LINE with no checkbox (the owner's rule: no greyed control with a hint)
      const APP = readSrc('src/lib/app.js'), heldRow = (APP.split('\n').find((l) => l.includes("s.tasks?.unread ? (() => {")) || '');
      ok(/className = 'cfg-row cfg-row-held'/.test(heldRow) && !/<input|disabled/.test(heldRow) && /so this backup leaves them out/.test(heldRow) && /div\.cfg-row-held \{ display: flex;/.test(readSrc('public/style.css')) && /div\.cfg-row-held:hover \{ background: none; \}/.test(readSrc('public/style.css')), '⑨ follow (1): the backup dialog says the hold as a line (no checkbox, nothing greyed, set with the rows\' text, never pressable) — and the export sends no tasks section (no data-sec box)');
    }
    // RED CONTROL — the release's own _load (its catch read every failure as «no file»), its PLANT PROVEN FIRST
    {
      const src = readSrc('src/task-groups.js');
      const RELEASE_LOAD = "  _load() {\n    for (const [f, legacy] of [[this._file, false], [this._legacyFile, true]]) {\n      let parsed;\n      try { parsed = timedSync('task-groups.read', () => JSON.parse(fs.readFileSync(f, 'utf-8'))); } catch { continue; }\n      if (!parsed || typeof parsed.tasks !== 'object') continue;\n      this._state = parsed;\n      if (legacy) this._save(); // migrate tasks.json → task-groups.json\n      return true;\n    }\n    this._state = { version: 1, tasks: {} };\n    return false;\n  }\n\n";
      const mut = anchored(src, /  _load\(\) \{\n[\s\S]*?(?=  \/\/ ── THE STORE HELD UNREAD \(see STORE_SHAPE above\) ──)/, () => RELEASE_LOAD, 'the release _load');   // B-0d3e's one door: exactly once, by name
      ok(!!mut && mut.includes("} catch { continue; }") && !mut.includes('const a = SR.storeAnswer(read(this._file)'), '⑨ RED CONTROL proves its plant first: the copy carries the release\'s _load (its catch-continue) and not the store read');
      const w = world('red'); const seed = Buffer.from(JSON.stringify(SEED)); fs.writeFileSync(w.file, seed);
      const M = mutantCopies('tg-unread', REPO);
      const TGM0 = mut ? M.load('src/task-groups.js', mut, 'r0').TaskGroupManager : null;
      const after = TGM0 ? (failing(w.file, 'EIO', () => make(TGM0, w.dd)), bytes(w.file)) : null;
      ok(!!after && Buffer.compare(after, seed) !== 0 && JS(Object.keys(JSON.parse(after.toString('utf8')).tasks)) === '[]', '⑨ RED CONTROL — the release\'s own catch: a read that failed at the boot WROTE AN EMPTY STORE OVER task-groups.json (the defect itself; the legs above go red)', after ? after.toString('utf8').slice(0, 80) : null);
    }
  } finally { for (const d of roots) fs.rmSync(d, { recursive: true, force: true }); }
}

// ── ⑩'s PIN OVER THE TREE'S TEXT (B-7e49, lane bl-tests-e, 主开发 r2522): ⑩'s legs — the desktop records, the device alerts and the
// decision journal, each read failing and lifting, with their red copies — moved VERBATIM to the heavy twin scripts/test-store-write-census-scenes.mjs;
// its one pin over the tree's text stays here (a census is in every lane's gate).
console.log('⑩ the measured holds after 2.369.412: the pin over the tree\'s text (its legs run in the heavy twin)');
{
  const readSrc = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
      ok(/writer: writer === undefined \? require\('\.\.\/store-writer\.js'\)\.storeWriter\(\) : writer,/.test(readSrc('src/server/desktop-app-keeper.js')), '⑩a the hub\'s keeper hands the process\'s store writer to the machine half (a suite may hand its own)');
}

// ── ⑤ U6 (lane lg-store-writes, B-0248 — 主开发 02:59Z, R1 + R2): NO READ OF THE READINGS FOLDER BYPASSES THE CACHE MODULE ──
// The usage readings' write moves onto the store writer only when EVERY hub read of data/usage-cache goes through the cache
// module's own read (src/usage-cache-write.js — the one place the pending copy can be consulted first). DERIVED BY SEARCH, per
// file: a path into the folder (USAGE_CACHE_DIR, a `cacheDir` parameter, a local built from them by path.join / cacheFileFor or
// an alias — the nearest earlier definition decides, an arrow helper's body included) reaching a raw read (fs read / stat /
// readdir / open, B-403e's run-reads RR.*, or a same-file helper that reads its own first parameter). Every file with such
// reads is a ROW with its exact count (a move lowers its row in the same commit); a new file or a rise is red BY NAME. The
// cache module itself is the door (exempt by name). Comments and string contents are never code here.
console.log('⑤ U6 — the readings folder: every raw read in the hub outside the cache module is a named row');
{
  const views = (t) => {
    let code = '', keep = '', i = 0, q = null; const n = t.length;
    while (i < n) {
      const c = t[i];
      if (q) {
        if (c === '\\') { keep += t.slice(i, i + 2); i += 2; continue; }
        keep += c;
        if (c === q) { q = null; code += c; } else if (c === '\n') code += c;
        i++; continue;
      }
      if (c === "'" || c === '"' || c === '`') { q = c; code += c; keep += c; i++; continue; }
      if (t.startsWith('//', i)) { const j = t.indexOf('\n', i); i = j < 0 ? n : j; continue; }
      if (t.startsWith('/*', i)) { const j = t.indexOf('*/', i + 2), end = j < 0 ? n : j + 2, nl = '\n'.repeat((t.slice(i, end).match(/\n/g) || []).length); code += nl; keep += nl; i = end; continue; }
      code += c; keep += c; i++;
    }
    return { code, keep };
  };
  const RD_SCOPE = /USAGE_CACHE_DIR|require\('\.\.?\/(?:\.\.\/)?(?:usage-cache-write|window-stamp|rate-limit-capture|reading-lag)\.js'\)/;
  const RD_SEEDS = new Set(['USAGE_CACHE_DIR', 'cacheDir']);
  const RD_BASE = ['fs\\.(?:readFileSync|readdirSync|statSync|existsSync|openSync|lstatSync)', 'RR\\.(?:readText|readdir|stat)', 'fs\\.promises\\.(?:readFile|readdir|stat)'];
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sinkRe = (H) => new RegExp(`\\b(?:${[...RD_BASE, ...H.map((h) => `(?<![\\w$.])${esc(h)}`)].join('|')})\\(`, 'g');
  const firstArg = (s, j) => { let depth = 1, k = j; while (k < s.length && depth) { const ch = s[k]; if ('([{'.includes(ch)) depth++; else if (')]}'.includes(ch)) depth--; else if (ch === ',' && depth === 1) break; k++; } return s.slice(j, k); };
  const PATH_ARG = /(?:path\.(?:join|resolve)|cacheFileFor)\(\s*(?:[\w$]+\.)?([A-Za-z_$][\w$]*)/;
  const helpersOf = (code) => {
    const out = [];
    for (const rx of [/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(\s*([A-Za-z_$][\w$]*)/g, /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(\s*([A-Za-z_$][\w$]*)[^)]*\)\s*=>/g]) {
      for (const m of code.matchAll(rx)) {
        const name = m[1], param = m[2];
        let body = code.slice(m.index + m[0].length, m.index + m[0].length + 1500);
        const cut = /\n(?:function |const [\w$]+ = (?:async )?\(|  [\w$]+\(.*\) \{$)/.exec(body); if (cut) body = body.slice(0, cut.index);
        for (const s0 of body.matchAll(sinkRe([]))) { if (new RegExp(`^\\s*${esc(param)}\\s*(?:\\)|$|,)`).test(firstArg(body, s0.index + s0[0].length))) { if (!out.includes(name)) out.push(name); break; } }
      }
    }
    return out;
  };
  /** one file's text → null (out of scope) | [{line, call, via}] */
  const readsOf = (src) => {
    const { code, keep } = views(src);
    if (!RD_SCOPE.test(keep)) return null;
    const lines = code.split('\n'), defs = new Map(), memo = new Map();
    lines.forEach((l, i) => { for (const m of l.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([^;\n]*)/g)) { if (!defs.has(m[1])) defs.set(m[1], []); defs.get(m[1]).push([i + 1, m[2]]); } });
    const tainted = (name, at, depth = 0) => {
      if (depth > 8) return false;
      const ds = (defs.get(name) || []).filter((d) => d[0] <= at);
      if (!ds.length) return RD_SEEDS.has(name);
      const [ln, rhs] = ds.reduce((a, b) => (b[0] >= a[0] ? b : a)), key = `${name}@${ln}`;
      if (memo.has(key)) return memo.get(key);
      memo.set(key, false);
      const r = rhsTaints(rhs, ln, depth + 1); memo.set(key, r); return r;
    };
    const rhsTaints = (rhs, at, depth) => {
      let m = PATH_ARG.exec(rhs);
      if (m && (RD_SEEDS.has(m[1]) || tainted(m[1], at, depth))) return true;
      m = /^\s*(?:\([^)]*\)|[\w$]+)\s*=>\s*(.*)$/.exec(rhs);
      if (m) return rhsTaints(m[1], at, depth);
      m = /^\s*(?:[\w$]+\.)?([A-Za-z_$][\w$]*)\s*(?:\|\||$)/.exec(rhs);
      return !!(m && (RD_SEEDS.has(m[1]) || tainted(m[1], at, depth)));
    };
    const SK = sinkRe(helpersOf(code)), sites = [];
    lines.forEach((l, i) => {
      for (const m of l.matchAll(SK)) {
        const a = firstArg(l, m.index + m[0].length);
        let via = null; const pm = PATH_ARG.exec(a);
        if (pm && (RD_SEEDS.has(pm[1]) || tainted(pm[1], i + 1))) via = pm[1];
        else { const cm = /^\s*(?:[\w$]+\.)?([A-Za-z_$][\w$]*)\s*(?:\(|\)|$)/.exec(a); if (cm && (RD_SEEDS.has(cm[1]) || tainted(cm[1], i + 1))) via = cm[1]; }
        if (via) sites.push({ line: i + 1, call: m[0].slice(0, -1), via });
      }
    });
    return sites;
  };
  const RD_DOOR = 'src/usage-cache-write.js';   // THE cache module: its own readers ARE the door (readCacheObject / readCacheJson / listCacheDir)
  // file → [count, class, why]; 'debt' = a raw read U6.2–U6.4 move onto the door (a row only falls); 'folder' = the folder itself
  // made / checked, never a reading
  const READINGS_ROWS = {
    'src/server/agent-tool-generators.js': [1, 'folder', 'ensureDir(USAGE_CACHE_DIR) at boot — the folder made, never a reading'],
  };
  const RD_FILES = censusFiles(REPO).filter((f) => f !== RD_DOOR);
  const RD_BASE_SITES = new Map(RD_FILES.map((f) => [f, readsOf(repoText(f))]));   // each file read and judged ONCE; a control re-judges only the file it plants in
  const readingsCensus = (over = {}) => {
    const got = new Map();
    for (const f of RD_FILES) { const r = over[f] !== undefined ? readsOf(over[f]) : RD_BASE_SITES.get(f); if (r && r.length) got.set(f, r); }
    for (const [f, src] of Object.entries(over)) if (!got.has(f) && f !== RD_DOOR && !RD_BASE_SITES.has(f)) { const r = readsOf(src); if (r && r.length) got.set(f, r); }
    const bad = [];
    for (const [f, sites] of got) { const row = READINGS_ROWS[f]; if (!row) bad.push(`UNNAMED: ${f} reads the readings folder outside the cache module (${sites.map((x) => `${x.line} ${x.call}(${x.via}…)`).join(', ')}) — read it through src/usage-cache-write.js`); else if (row[0] !== sites.length) bad.push(`${f}: ${sites.length} raw reads of the readings folder, its row says ${row[0]} (${sites.map((x) => `${x.line} ${x.call}`).join(', ')}) — a move lowers the row; a new read goes through the cache module`); }
    for (const f of Object.keys(READINGS_ROWS)) if (!got.has(f)) bad.push(`${f}: its row says ${READINGS_ROWS[f][0]} raw reads, the tree has none — drop the row`);
    return { got, bad };
  };
  const RC0 = readingsCensus();
  const sumR = [...RC0.got.values()].reduce((n, x) => n + x.length, 0);
  ok(!RC0.bad.length, `the readings folder: ${sumR} raw reads in ${RC0.got.size} files outside the cache module, each file a row with its count (U6.1: usage-routes' nine moved onto the door — readCacheJson / listCacheDir; U6.2: the pool engine's twelve — through B-403e's memo as the door's «via»; U6.3: the reading repair's six, the capture's two, the window stamp's one; U6.4: the quota migration's two, the weekly unfold, the auto-cli loop, the CLI env — the folder's ensureDir alone left)`, RC0.bad);
  ok(!RC0.got.has('src/usage-routes.js'), 'usage-routes reads the readings folder ONLY through the cache module (U6.1)');
  const CE = fs.readFileSync(path.join(REPO, 'src/server/cli-env.js'), 'utf8'), WS = fs.readFileSync(path.join(REPO, 'src/window-stamp.js'), 'utf8'), UR = fs.readFileSync(path.join(REPO, 'src/usage-routes.js'), 'utf8');
  const c1 = readingsCensus({ 'src/zz-readings-plant.js': "const fs = require('fs'); const usageWrite = require('./usage-cache-write.js');\nfunction zz(USAGE_CACHE_DIR) { return fs.readFileSync(path.join(USAGE_CACHE_DIR, 'a.json')); }\n" });
  ok(c1.bad.some((x) => /^UNNAMED: src\/zz-readings-plant\.js /.test(x)), 'NEGATIVE CONTROL: a NEW file reading the folder raw is red by name', c1.bad);
  const c2 = readingsCensus({ 'src/server/cli-env.js': CE + "\nfunction zzLocal() { const f9 = path.join(USAGE_CACHE_DIR, 'y.json'); return fs.readFileSync(f9, 'utf-8'); }\n" });
  ok(c2.bad.some((x) => /src\/server\/cli-env\.js/.test(x)), 'NEGATIVE CONTROL: a raw read through a LOCAL built from the folder path (a plain pattern misses it) is red by name (whether its file has a row or not)', c2.bad);
  const c3 = readingsCensus({ 'src/window-stamp.js': WS + "\nfunction zzRd(p) { return fs.readFileSync(p, 'utf8'); }\nfunction zzUse(cacheDir) { return zzRd(path.join(cacheDir, 'z.json')); }\n" });
  ok(c3.bad.some((x) => /src\/window-stamp\.js/.test(x) && /\bzzRd\b/.test(x)), 'NEGATIVE CONTROL: a raw read through a same-file HELPER that reads its parameter is red by name (the helper named — whether its file has a row or not)', c3.bad);
  const c4 = readingsCensus({ 'src/server/cli-env.js': CE + "\n// fs.readFileSync(path.join(USAGE_CACHE_DIR, 'x.json'))\nconst zzS = \"fs.readFileSync(path.join(USAGE_CACHE_DIR, 'x.json'))\";\n" });
  ok(!c4.bad.length, '…while the same read in a comment and in a string adds nothing', c4.bad);
  const c5 = readingsCensus({ 'src/usage-routes.js': UR + "\nfunction zzBack() { return fs.readFileSync(path.join(USAGE_CACHE_DIR, 'x.json'), 'utf-8'); }\n" });
  ok(c5.bad.some((x) => /^UNNAMED: src\/usage-routes\.js /.test(x)), 'NEGATIVE CONTROL: a raw read put back in usage-routes (U6.1 moved them all) is red by name', c5.bad);
}

// ── ⑫ THE WRITER'S forget IS THE FILE OWNER'S REMOVAL, NEVER A DROP (主开发 r286) ──────────────────────────────────────────────
// A step riding a write runs ONLY once that write LANDED, or when the file's OWNER removes the file (forget, then its unlink — its
// riding steps are told «landed»: the record they waited for is the removal). A suite's crash stand-in that used forget as a drop
// ran half a removal (r284); the census names the product's callers of the writer's forget — THREE files then (B-0248 step 3 (c): + a Task Group's removal, its archive months; B-574d: + boot-restore's kept copies and the exit tomb, named below): the conversation's stdout
// file unlinked next (src/server/session-stdout.js) and the usage cursors' settle (src/usage-history.js, a drop pinned safe below) —
// and a third caller is red by name. WHAT IT CANNOT SEE (a mistake-guard over the product's text, not a proof): a writer handle that
// reaches forget under a spelling it does not bind — a parameter (`(W) => W.forget(…)`), a deps object (`this.d.writer.forget(…)`),
// a destructured or re-aliased name (`const { forget } = storeWriter()`, `const W2 = W`), or a handle stored on an object
console.log('⑫ the writer\'s forget is the file owner\'s removal — a step riding a write runs only once that write landed, or the owner removes the file');
{
  const { scratchDir } = await import('./scratch.mjs');
  const W = require(path.join(REPO, 'src/store-writer.js')).storeWriter();
  const d = scratchDir('swc-forget-law'); const F = path.join(d, 'law.json');
  let v = 1; const ran = [];
  const mark = () => W.dirty(F, { name: 'law.write', rank: 0, urgent: true, produce: () => JSON.stringify({ v }) });
  mark(); W.afterLanding(F, () => { let onDisk = null; try { onDisk = JSON.parse(fs.readFileSync(F, 'utf8')).v; } catch { } ran.push({ step: 'landed', onDisk }); });
  const before = ran.length;
  W.flushSync([F]);
  const afterLanding = ran.slice();
  v = 2; mark(); W.afterLanding(F, () => ran.push({ step: 'removed' }));
  const beforeForget = ran.length;
  W.forget(F);
  ok(before === 0 && afterLanding.length === 1 && afterLanding[0].onDisk === 1 && beforeForget === 1 && ran.length === 2 && ran[1].step === 'removed',
    '⑫ a step riding a write runs ONLY once that write landed (the file holds it when the step runs), or when the file\'s owner removes the file (forget) — never before', ran);
  fs.rmSync(d, { recursive: true, force: true });
  // THE CENSUS: every call of the WRITER's forget in the product — a receiver that IS the writer (storeWriter(), writerOf(),
  // this._writer(), _writer()) or a name bound to one in the same file
  const files = new Map();
  const walkJs = (rel) => { for (const e of fs.readdirSync(path.join(REPO, rel), { withFileTypes: true })) { const r = path.posix.join(rel, e.name); if (e.isDirectory()) walkJs(r); else if (e.name.endsWith('.js')) files.set(r, fs.readFileSync(path.join(REPO, r), 'utf8')); } };
  walkJs('src'); files.set('server.js', fs.readFileSync(path.join(REPO, 'server.js'), 'utf8'));
  const forgetCensus = (map) => {
    const out = {};
    for (const [f, text] of map) {
      const bound = [...text.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:require\([^)]*\)\.)?(?:storeWriter|writerOf|this\._writer|_writer)\(\)/g)].map((m) => m[1]);
      const re = new RegExp(`(?:\\b(?:storeWriter|writerOf|_writer)\\(\\)${bound.length ? `|\\b(?:${[...new Set(bound)].join('|')})` : ''})\\.forget\\(`, 'g');
      const n = (text.match(re) || []).length;
      if (n) out[f] = n;
    }
    return out;
  };
  // the conversation's stdout file: its pending write dropped, then the file unlinked (the owner's removal); and the usage cursors'
  // settle (lane hub-loop-stalls) — a DROP before the boot's migrations read the file, safe ONLY while nothing rides that file's
  // landing (pinned below: its forget would run such a step as «landed» over bytes never written)
  // …and a Task Group's removal (src/task-groups.js _archiveDrop, B-0248 step 3 (c)): its archive months' owed appends dropped, an append
  // on its way let land first, then the group's folder removed (the owner's removal; nothing rides an archive month's landing)
  // …and B-574d's records made ONCE at an end (lane bl-jobs, slice «session-and-job-records»): the writer's entry of a record whose ONE
  // write LANDED with nothing newer owed is released (session-stdout keepTomb, boot-restore keepCopy — nothing rides it then: a step
  // riding that version ran at the landing, before onWritten); a kept copy's removal by its owner (boot-restore unlinkKept: forget,
  // then its unlink); an end's record that did not land, told «kept nothing» to the person (boot-restore keepEnded: a write of it in
  // flight is removed again once it lands) — none is a drop of a write someone waits on
  const FORGET_CALLERS = { 'src/server/boot-restore.js': 3, 'src/server/session-stdout.js': 2, 'src/task-groups.js': 1, 'src/usage-history.js': 1 };
  const fc = forgetCensus(files);
  ok(JSON.stringify(fc) === JSON.stringify(FORGET_CALLERS), `⑫ the census: the product calls the writer's forget ONLY where a file's owner removes the file (${Object.entries(fc).map(([f, n]) => `${f} ${n}`).join(', ') || 'none'}) — never as a drop`, fc);
  const UH = files.get('src/usage-history.js') || '';
  const durables = (UH.match(/\.durable\(this\.cursorsFile\)/g) || []).length, caughtOnly = (UH.match(/\.durable\(this\.cursorsFile\)\.catch\(\(\) => \{ \}\)/g) || []).length;
  ok(!/afterLanding\(|\bride\(|whenDurable\(/.test(UH) && durables === caughtOnly, '⑫ …the usage cursors\' drop (settleCursors) is safe by construction: NOTHING rides _cursors.json\'s landing — no step, no wait whose answer is read (its one durable() is only caught) — a step there would run as «landed» over bytes the drop never wrote', { durables, caughtOnly });
  const SSF = files.get('src/server/session-stdout.js') || '', BRF = files.get('src/server/boot-restore.js') || '';
  ok(SSF.includes('if (ok) { try { if (W.owed(tombPath) === null) W.forget(tombPath); } catch { } return; }') && BRF.includes('if (ok) { try { if (W.owed(file) === null) W.forget(file); } catch { } return; }')
    && /function unlinkKept\(sockFile, file, done = null\) \{\n  try \{ storeWriter\(\)\.forget\(file\); \} catch \{ \}\n  fs\.unlink\(file, /.test(BRF)
    && BRF.includes("if (!landed) { try { storeWriter().forget(file); } catch { } console.warn(`[end] ${sockFile}: its ended record could not be written"),
    '⑫ …B-574d\'s five calls are each of a lawful kind: a record\'s entry released only once its write LANDED with nothing newer owed (keepTomb, keepCopy), a kept copy\'s removal by its owner (unlinkKept: forget, then its unlink), an end\'s record told «kept nothing» (keepEnded)');
  const planted = new Map(files); planted.set('src/server/browser-keeper.js', files.get('src/server/browser-keeper.js') + '\nfunction zzDrop() { const W = writerOf(); W.forget(storeKey); }\n');
  const pc = forgetCensus(planted);
  ok(pc['src/server/browser-keeper.js'] === 1 && JSON.stringify(pc) !== JSON.stringify(FORGET_CALLERS), 'CONTROL (planted in a copy\'s text): a SECOND caller of the writer\'s forget — a drop of the registry\'s owed write — is red by name', pc);
}

// ── ⑬ EVERY REGISTRY SAVE OF THE BROWSER KEEPER HAS ITS SIDE (主开发's round w4izmdrbq, its should 3 — r284's point 3 as a census) ──
// Each function of src/server/browser-keeper.js that saves the registry is named with its side:
//   lands            — its result a later boot must find is ON DISK before the act replies (commitSync / saveNow / landNow / landedOrThrow;
//                      a commit() in it is the owed rest)
//   rides            — owed, and what cannot be undone rides its landing (a crash first brings the record back whole)
//   owed-reply-waits — owed, but the reply that tells a person waits for the landing (whenLanded; a fill types nothing before its fence)
//   owed             — owed, safe at a crash: a boot rebuilds it (leases, tabs, a browser's running state) or nobody needs it after it
//   helper           — the save doors themselves
// A NEW save without a stated side is red by name; a «lands» function that no longer lands is red by name
console.log('⑬ every registry save of the browser keeper has its side (lands / rides / owed with its why)');
{
  const SIDES = {
    ...Object.fromEntries(['ownMarkOf', 'takeBackOwnTab'].map((f) => [f, 'owed'])), // row B-0e4a: the lease's own tab mark and its take-back — lease bookkeeping, owed like ownWindowAtAttach
    ...Object.fromEntries(['batched', 'commit', 'commitSync', 'landNow', 'landedOrThrow', 'save', 'saveNow'].map((f) => [f, 'helper'])),
    ...Object.fromEntries(['addSiteHint', 'attachStart', 'blocked', 'cardOnLanding', 'clearBlocked', 'copyPin', 'dropSiteHint', 'keepEgress', 'moveDirLineage', 'moveProxyPassword', 'newChild', 'proposeSiteReset', 'restorePin', 'setCap', 'setPin', 'start', 'startEphemeral', 'stepProposal', 'switchBackend', 'updateProfileNow', 'userStoppedDisplay', 'watchTabFor'].map((f) => [f, 'lands'])),
    ...Object.fromEntries(['adoptScratch', 'clearPin', 'removeProfile'].map((f) => [f, 'rides'])),
    ...Object.fromEntries(['createProfile', 'saveLoginFenceState'].map((f) => [f, 'owed-reply-waits'])),
    ...Object.fromEntries(['adoptOrphan', 'agentTabAct', 'armGeo', 'onGeoEvent', 'setEnvironment', 'attach', 'boot', 'browse', 'closeHumanTab', 'closeLeaseSession', 'detach', 'dropChild', 'dropLeaseTabs', 'endHuman', 'ensureEphemeral', 'forgetOwnTab', 'noteTabBorn', 'pruneBorn', 'keeperMakes', 'freshDaemon', 'hangCause', 'healBrowser', 'humanRelease', 'humanTake', 'jobHandleFor', 'judgeEphemeral', 'keepTabRoots', 'leaseCdpUrl', 'managerStop', 'mirrorLeaseInput', 'navigateHuman', 'noteAnswer', 'noteBuildMissing', 'noteEngineLive', 'noteOwnTab', 'notePermission', 'noteProposal', 'noteViewport', 'openInLease', 'orphanCensus', 'ownWindowAtAttach', 'pruneOwnTabs', 'rejudgeUnstable', 'releaseJobHandle', 'restartProfile', 'retireInSteps', 'shutdown', 'stampGroupCap', 'stop', 'streamPortFor', 'takeRebound', 'tell', 'tick', 'userTabAct'].map((f) => [f, 'owed'])),
  };
  const savesOf = (text) => {
    const out = {}; let fn = null;
    const DECL = /^  (?:async )?function ([A-Za-z0-9_$]+)\(|^  const ([A-Za-z0-9_$]+) = (?:async )?\(/;
    const KINDS = { commitSync: /\bcommitSync\(\)/, saveNow: /\bsaveNow\(\)/, landNow: /\blandNow\(\)/, landedOrThrow: /\blandedOrThrow\(\)/, commit: /(?<![A-Za-z0-9_.$])commit\(\)/, save: /(?<![A-Za-z0-9_.$])save\(\)/ };
    for (const l of text.split('\n')) {
      const m = DECL.exec(l); if (m) fn = m[1] || m[2];
      if (/^\s*\/\//.test(l)) continue;
      for (const [k, re] of Object.entries(KINDS)) if (re.test(l)) (out[fn] = out[fn] || new Set()).add(k);
    }
    return out;
  };
  const judge = (text) => {
    const found = savesOf(text), unnamed = Object.keys(found).filter((f) => !SIDES[f]).sort(), gone = Object.keys(SIDES).filter((f) => !found[f]).sort();
    const notLanding = Object.keys(found).filter((f) => SIDES[f] === 'lands' && !['commitSync', 'saveNow', 'landNow', 'landedOrThrow'].some((k) => found[f].has(k))).sort();
    return { n: Object.keys(found).length, unnamed, gone, notLanding };
  };
  const KSRC = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  const kj = judge(KSRC);
  ok(!kj.unnamed.length && !kj.gone.length && !kj.notLanding.length && kj.n >= 70, `⑬ every function of the keeper that saves the registry has its side (${kj.n}: ${Object.entries(Object.values(SIDES).reduce((a, v) => ((a[v] = (a[v] || 0) + 1), a), {})).map(([k, v]) => `${k} ${v}`).join(', ')}) — each «lands» one lands`, kj);
  const kx = judge(KSRC + '\n  function zzNewAct(id) { reg.zz = id; commit(); }\n');
  ok(JSON.stringify(kx.unnamed) === JSON.stringify(['zzNewAct']), 'CONTROL (planted in a copy\'s text): a NEW keeper save without a stated side is red by name', kx.unnamed);
  const kl = judge(KSRC.replace(/^(  function setCap\([^\n]*\n)([\s\S]*?)\bcommitSync\(\)/m, '$1$2commit()'));
  ok(kl.notLanding.includes('setCap'), 'CONTROL (planted): a «lands» act whose landing became a plain commit() is red by name', kl.notLanding);
}

// ── ⑪ THE STORE HOLD (lane lg-store-writes, B-225b — 主开发's shape of 2026-11-20 04:37Z, R1–R13): src/store-hold.js, the helper the
// persistence stores read and write through, its own legs ONCE. A held store has NO VALUE and its one write refuses by name; the
// kind (unreadable / damaged / not-allowed); the ladder (silent rungs, then said); the lift; `missing` writes nothing and creates
// EXCLUSIVELY (a file that appeared is adopted, never written over); every temp name carries the pid. Stand-ins for the storage.
console.log('⑪ the store hold: a store that could not be read has no value, and nothing is written over it');
{
  // (B-0248 (a)+(b): the persistence route's stores are the store writer's — these scenes read their files right after a door, as the
  // release's write at the call allowed: each route is handed the writer's contract AT THE CALL, a failure owed — scratch.mjs landingWriter)
  const { scratchDir, anchored, landingWriter } = await import('./scratch.mjs');
  const { mutantCopies } = await import('./mutant-copy.mjs');
  const HSRC = fs.readFileSync(path.join(REPO, 'src/store-hold.js'), 'utf8');
  const HMOD = require(path.join(REPO, 'src/store-hold.js'));
  const roots = [];
  const failing = (file, code, fn) => { const rf = fs.readFileSync; fs.readFileSync = function (f, ...a) { if (String(f) === file) throw Object.assign(new Error(`${code}: a stand-in`), { code }); return rf.call(this, f, ...a); }; try { return fn(); } finally { fs.readFileSync = rf; } };
  const SEED = JSON.stringify({ v: 1, kept: 'the person\'s' });
  const valid = (j) => !!j && typeof j === 'object' && j.v === 1;
  const tried = (fn) => { try { fn(); return null; } catch (e) { return { code: e.code, status: e.status, held: e.held || null }; } };
  try {
    // (B-7e49, r2522) the two pins over the tree's text stay here; (a)–(g), (i) and (m) run in the heavy twin scripts/test-store-write-census-scenes.mjs
      const WSRC = fs.readFileSync(path.join(REPO, 'src/ws-handler.js'), 'utf8');
      ok((WSRC.match(/const layoutData = layoutsOrHeld\(ws, data\); if \(!layoutData\) (?:break|return);/g) || []).length === 5 && !/\n {10}const layoutData = readLayouts\(\);/.test(WSRC) && /type: 'layout-held', op: /.test(WSRC), '⑪ (e) the five ws layout doors (layout-sync, desktop-create / -delete / -rename / -reorder) read the desktops through ONE guard: held ⇒ `layout-held` by name to the sender, nothing applied (a pin)');
      // the judge and the text-model client (pins: their refusal comes BEFORE any reservation)
      const DE = fs.readFileSync(path.join(REPO, 'src/server/decision-engine.js'), 'utf8'), TM = fs.readFileSync(path.join(REPO, 'src/server/text-model-client.js'), 'utf8'), MW = fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf8');
      const jc = DE.slice(DE.indexOf('async function judgeCall('), DE.indexOf('reserve(use,', DE.indexOf('async function judgeCall(')));
      ok(/if \(settingsUnread\(\)\) return quiet\(use, 'settings-unread'\);/.test(jc) && /ledger\.settingsUnread\(\)\) \{ ledger\.journal\(\{ use, model: null, outcome: 'refused', why: 'settings-unread'/.test(TM) && /decision-engine\.js'\)\.create\(\{[^\n]*settingsHeld: \(\) => \(persistenceRouter && typeof persistenceRouter\.settingsHeld === 'function'/.test(MW),
        '⑪ (f) the judge (before its reservation) and the text-model client refuse NOT NOW by name while the settings are held — the owner\'s daily cap is never judged on its default (pins; the hub hands the hold in)');
    // (j) WHILE THE SETTINGS ARE HELD, THE STRICT SIDE (round wyzvr7567's MUST 2, by rule R3 — «never a default acted on»): every row
    // that guards MONEY, a SAFETY ask, a VENDOR CALL or a WRITE TO A PERSON'S OWN FILE takes its strict side in the held view
    // (src/settings-held-strict.js), whatever its default; the census over EVERY row of the settings schema and the harness tables
    // finds no row of these kinds without one. The writers to a person's own files write NOTHING while held: the CLI-config sync
    // (driven) and the hooks (pinned). CONTROLS: a planted new row of these kinds is red by name; the sync's held guard cut (in a
    // copy) writes the CLI configs on values that are not the person's.
    {
      const { pathToFileURL } = await import('node:url');
      const ST = require(path.join(REPO, 'src/settings-held-strict.js'));
      const SCH = (await import(pathToFileURL(path.join(REPO, 'src/lib/settings-schema.js')).href)).SETTINGS_SCHEMA;
      const HS = require(path.join(REPO, 'src/harness-settings.js'));
      const rows = Object.keys(SCH).map((key) => ({ key, cliConfig: false }));
      for (const [h, tab] of Object.entries(HS.HARNESS_SETTINGS)) for (const r of (tab && tab.rows) || []) rows.push({ key: `${h}.${r.key}`, cliConfig: !!(r.apply && r.apply.kind === 'cli-config') });
      const c = ST.census(rows);
      const sv = ST.strictValues();
      const four = sv['permissions.bypassAnswersAsks'] === false && sv['antigravity.autoUsageReads'] === 'off' && sv['pool.avoidOverageMembers'] === true && !!ST.NO_WRITE_WHILE_HELD['agents.vibespaceIntegration'] && sv['agents.vibespaceIntegration'] === false;
      const defaults = { bypass: SCH['permissions.bypassAnswersAsks'] && SCH['permissions.bypassAnswersAsks'].default, avoid: SCH['pool.avoidOverageMembers'] && SCH['pool.avoidOverageMembers'].default };
      ok(c.unnamed.length === 0 && c.caught.length >= 25 && four && Object.keys(ST.STRICT_WHILE_HELD).every((k) => rows.some((r) => r.key === k)) && defaults.bypass === true && defaults.avoid === false,
        `⑪ (j) WHILE THE SETTINGS ARE HELD every row that guards money, a safety ask, a vendor call or a person's own file takes its STRICT side — ${c.caught.length} rows of ${rows.length} caught by the census, every one named (the auto-allow of the CLI's safety asks OFF though its default is on, the vendor's automatic reads OFF, avoid overage ON though its default is off, the hooks never written); every strict row is a real row`, c);
      const pc = ST.census([...rows, { key: 'permissions.autoAllowEverything', cliConfig: false }]);
      ok(JSON.stringify(pc.unnamed) === JSON.stringify(['permissions.autoAllowEverything']), 'CONTROL (planted): a NEW row of these kinds with no strict side is red BY NAME', pc.unnamed);
      // the CLI-config sync writes nothing while held (its lift is a settings change: it runs then)
      const HCREL = 'src/server/harness-config-sync.js', HCSRC = fs.readFileSync(path.join(REPO, HCREL), 'utf8');
      const SYMH = Symbol.for('vibespace.settings-held');
      let cliHomes = 0;
      const syncRun = async (M) => { const lines = []; const m = M.create({ serverSetting: (k) => (k === SYMH ? { kind: 'unreadable', code: 'EIO' } : undefined), harnesses: { list: () => [], get: () => null }, adapterRegistry: new Map(), activeSessions: new Map(), hookRegistrationSafe: () => false, home: (() => { const d = scratchDir('swc-cli-home-' + (++cliHomes)); roots.push(d); return d; })(), log: (l) => lines.push(String(l)), warn: (l) => lines.push(String(l)) }); let r; try { r = await m.syncCliConfig({ reason: 'boot' }); } catch (e) { r = { threw: e.message }; } return { r, lines }; };   // B-ddf3 unit 2 line 1: the sync answers a Promise
      const sr = await syncRun(require(path.join(REPO, HCREL)));
      ok(!!sr.r && sr.r.skipped === true && !!sr.r.settingsHeld && sr.r.settingsHeld.kind === 'unreadable' && sr.lines.some((l) => /no CLI config is written until they read/.test(l)),
        '⑪ (j) the CLI-config sync writes NOTHING while the settings are held (said once in the journal) — the person\'s own CLI files are never written on values that are not theirs', sr);
      const HC_A = "    if (held) { log(`[cli-config] skipped (${reason}): the settings could not be read (${held.kind}${held.code ? ', ' + held.code : ''}) — no CLI config is written until they read`); return Promise.resolve({ skipped: true, settingsHeld: { kind: held.kind, code: held.code || null } }); }";
      const srx = await syncRun(mutantCopies('swc-cli-held', REPO).load(HCREL, anchored(HCSRC, HC_A, '', 'cli-held-cut'), 'cli-held-cut'));
      ok(!!srx.r && !srx.r.settingsHeld && !!srx.r.refused, 'CONTROL (the sync\'s held guard cut, in a copy): the sync goes PAST the hold to its next gate (here the copy\'s own refusal stops it before any file; a hub would write the CLI configs on rows that are not the person\'s) — red', srx.r);
      const AG = fs.readFileSync(path.join(REPO, 'src/server/agent-tool-generators.js'), 'utf8');
      ok(/const held = settingsHeldNow\(\);\n  if \(held\) \{ replayAtLift\(\); return Promise\.resolve\(\{ skipped: true, settingsHeld:/.test(AG) && /function stripAgentHookEntries\(\{ ifOptedOut = false \} = \{\}\) \{\n[^\n]*\n  \{ const r = refuseOwnerWrite\(\); if \(r\) return Promise\.resolve\(\{ ok: false, skipped: true, refused: r,[^\n]*\n  \{ const held = settingsHeldNow\(\); if \(held\) return Promise\.resolve\(\{ ok: false, skipped: true, settingsHeld: \{ kind: held\.kind,/.test(AG),
        '⑪ (j) the hooks: neither registered nor stripped while the settings are held (the person\'s ~/.claude and ~/.codex configs untouched), the registration replayed at the lift by the person\'s own switch (a pin: the writers need a real home)');
      // (k) A PERSON'S REFUSED ACT IS SAID AT THE PRESS (主开发 r552): while the settings are held Manage Agents' «Apply» (POST
      // /api/cli-config/apply, src/server/hooks-late.js — DRIVEN, both readings of the switch) and «Install» (POST
      // /api/agent-hooks/install, server.js — PINNED: the hub file is not loaded here) answer 503 store_unread with the held fact, and
      // the page says the hold's words (fetchJson maps the refusal to storeHeldWords — the Install toast shows it, never «installed»);
      // the hook health check and the root watch read the skip (never «has been repaired», never a recovery); the lift REPLAYS the
      // skipped CLI-config sync whatever its rows say; the integration switch reads OFF in the held view (a person who turned it off
      // is never overridden by the default ON). CONTROLS (in copies): the Apply door's hold answer cut ⇒ 200 «ok» over nothing; the
      // root watch's skip read cut ⇒ a recovery said over a skip; the replay cut ⇒ a lift with every row at its default never syncs;
      // the strict row cut ⇒ the held view reads the switch ON. The pins' controls: each pin over the old line is red.
      {
        const HELD = { kind: 'unreadable', code: 'EIO' };
        const HLREL = 'src/server/hooks-late.js', HLSRC = fs.readFileSync(path.join(REPO, HLREL), 'utf8');
        const applyDoor = async (HL, { on }) => {
          const routes = {}, app = { post: (p, fn) => { routes[p] = fn; } };
          const hc = require(path.join(REPO, HCREL)).create({ serverSetting: (k) => (k === SYMH ? HELD : undefined), harnesses: { list: () => [], get: () => null }, adapterRegistry: new Map(), activeSessions: new Map(), hookRegistrationSafe: () => true, home: (() => { const d = scratchDir('swc-apply-home-' + (++cliHomes)); roots.push(d); return d; })(), log: () => { }, warn: () => { } });
          let hookCalls = 0;
          HL.create({ activeSessions: new Map(), getSessionStatus: () => null, getUserTodos: () => null, sessionStatusKey: () => null, harnesses: { list: () => [] }, log: () => { }, warn: () => { } })
            .registerApplyRoute(app, { ensureAgentHooks: () => { hookCalls++; return { skipped: true, settingsHeld: { ...HELD } }; }, agentHooksStatus: () => ({}), integrationEnabled: () => on, harnessConfig: hc, hookRegistrationSafe: () => true });
          let status = 200, body = null; const res = { status(c) { status = c; return res; }, json(x) { body = x; return res; } };
          await routes['/api/cli-config/apply']({ body: {}, query: {}, headers: {} }, res);
          return { status, body, hookCalls };
        };
        const heldAnswer = (a) => a.status === 503 && !!a.body && a.body.code === 'store_unread' && !!a.body.held && a.body.held.file === 'settings.json' && a.body.held.kind === 'unreadable' && a.body.held.code === 'EIO' && /could not be read \(unreadable, EIO\) — the CLI config was not applied; nothing was written/.test(a.body.error) && a.body.ok !== true;
        const HLM = require(path.join(REPO, HLREL));
        const ap1 = await applyDoor(HLM, { on: true }), ap0 = await applyDoor(HLM, { on: false });
        ok(heldAnswer(ap1) && ap1.hookCalls === 1 && heldAnswer(ap0) && ap0.hookCalls === 0,
          '⑪ (k) «Apply» while the settings are held answers the hold BY NAME — 503 store_unread with the held fact (settings.json, unreadable, EIO), «nothing was written» — with the switch read on (the hooks\' skip) AND off (the strict side: the sync\'s skip); never «applied»', { on: ap1, off: ap0 });
        const XAP = await applyDoor(mutantCopies('swc-apply-held', REPO).load(HLREL, anchored(HLSRC, /^ {6}if \(held\) return res\.status\(503\)\.json\([^\n]*\n/m, '', 'apply-held-cut'), 'apply-held-cut'), { on: true });
        ok(XAP.status === 200 && XAP.body && XAP.body.ok === true && !XAP.body.code, 'CONTROL (the Apply door\'s hold answer cut, in a copy): the route says ok — «applied» over a sync and a registration that wrote nothing (red)', XAP);
        // «Install» (server.js — no line added there; the hold is asked FIRST: its strict side reads the switch off) + the health check
        const SV = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8');
        const inst = SV.slice(SV.indexOf("app.post('/api/agent-hooks/install'"), SV.indexOf("app.post('/api/agent-hooks/install'") + 2400);
        const INST_HOLD = /\{ const sh = typeof persistenceRouter\.settingsHeld === 'function' \? persistenceRouter\.settingsHeld\(\) : null; if \(sh\) return res\.status\(503\)\.json\(\{ error: `the settings could not be read [^\n]*nothing was written`, code: 'store_unread', held: sh \}\); \} if \(!integrationEnabled\(\)\) return res\.status\(400\)/;
        const INST_SKIP = /if \(results\.skipped && results\.settingsHeld\) return res\.status\(503\)\.json\(\{ error: 'the settings could not be read — the hooks were not installed; nothing was written', code: 'store_unread', held: \{ file: 'settings\.json', kind: results\.settingsHeld\.kind/;
        const HEAL = /Promise\.resolve\(ensureAgentHooks\(\{ auto: true \}\)\)\.then\(\(healed\) => \{[^\n]*\n\s*if \(!\(healed && healed\.skipped\) && !\(healed && healed\[key\] && healed\[key\]\.ok === false\) && !hookRootWatch\.saidRecoveryInstead\(info, scriptMissing\)\) serverNotice\(`hook-health-\$\{key\}`,/;   // B-ddf3 unit 2 line 1: the heal lands later (the shipped helper)
        const instPin = (t) => INST_HOLD.test(t) && INST_SKIP.test(t);
        ok(instPin(inst) && inst.search(INST_HOLD) < inst.indexOf('createHookHelper();') && HEAL.test(SV),
          '⑪ (k) «Install» while the settings are held answers the hold BY NAME (503 store_unread, the held fact) BEFORE the switch\'s own refusal and before any write; a skip the writer reports is the same answer; the hook health check reads the skip — no «has been repaired» over a write that never ran (pins: server.js is not loaded here)');
        const oldInst = inst.replace(INST_HOLD, "if (!integrationEnabled()) return res.status(400)");
        const oldHeal = SV.replace(HEAL, "ensureAgentHooks({ auto: true }); // self-heal the registration in place\n        if (!hookRootWatch.saidRecoveryInstead(info, scriptMissing)) serverNotice(`hook-health-${key}`,");   // stale-pins: kept (the OLD line, rebuilt for the pin's red control)
        ok(oldInst !== inst && !instPin(oldInst) && oldHeal !== SV && !HEAL.test(oldHeal), 'CONTROL (the pins over the old lines): the Install route without its hold answer and the health check that ignores the skip are each red', { inst: instPin(oldInst), heal: HEAL.test(oldHeal) });
        // the page says the hold's words (fetchJson's store_unread mapping; the Install toast shows the refusal first)
        const MA = fs.readFileSync(path.join(REPO, 'src/lib/manage-agents.js'), 'utf8'), UT = fs.readFileSync(path.join(REPO, 'src/lib/utils.js'), 'utf8');
        const PAGE_INST = /const r = await fetchJson\('\/api\/agent-hooks\/install', \{ method: 'POST' \}\);\n(?:[^\n]*\n){2} {18}if \(!r \|\| typeof r\.error === 'string'\) showToast\(\[r \? r\.error : t\('Install failed'\), rowsSaid\]\.filter\(Boolean\)\.join\(' — '\), \{ type: 'error' \}\);[^\n]*\n {18}else if \(rowsSaid\)/;   // r3064 (7): the refusal first, a refused row of the same run beside it
        const PAGE_APPLY = /const r = await fetchJson\('\/api\/cli-config\/apply', \{ method: 'POST' \}\);\n {18}if \(!r \|\| r\.error \|\| r\.ok === false\) showToast\(t\('Could not apply the CLI config — \{reason\}', \{ reason: \(r && r\.error\) \|\| t\('server unreachable'\) \}\), \{ type: 'error' \}\);/;
        const MAP = /if \(body && typeof body === 'object' && body\.code === 'store_unread'\) return \{ \.\.\.body, said: body\.error, error: storeHeldWords\(body\.held\) \};/;
        ok(PAGE_INST.test(MA) && PAGE_APPLY.test(MA) && MAP.test(UT) && /return body;\n  \} catch \{ return null; \}/.test(UT.slice(UT.indexOf('export async function fetchJson'), UT.indexOf('export async function fetchJson') + 400)),
          '⑪ (k) the page says the hold\'s words at both doors: fetchJson turns a store_unread answer into storeHeldWords(held); «Apply» shows it in «Could not apply the CLI config — …», «Install» shows the refusal itself (the hold, the switch off, a refused write) — never «installed» (pins)');
        const oldPage = MA.replace(/ {18}if \(!r \|\| typeof r\.error === 'string'\) showToast\([^\n]*\n {18}else if \(rowsSaid\)/, '                  if (rowsSaid)');   // stale-pins: kept (the OLD line, rebuilt for the pin's red control)
        ok(oldPage !== MA && !PAGE_INST.test(oldPage), 'CONTROL (the pin over the old Install toast): the page that reads only the per-CLI results is red (it said «installed» for a refusal)');
        // the root watch reads the skip: no recovery said, the backoff armed again
        const RWREL = 'src/server/hook-root-watch.js', RWSRC = fs.readFileSync(path.join(REPO, RWREL), 'utf8');
        const watchSkip = async (RW) => {
          const d = scratchDir('swc-root-watch-' + (++cliHomes)); roots.push(d);
          const timers = [], memo = path.join(d, RW.MEMO_FILE); fs.writeFileSync(memo, JSON.stringify({ cause: 'an earlier unknown root' }));
          const w = RW.create({ dataDir: d, ensureAgentHooks: () => ({ skipped: true, settingsHeld: { ...HELD } }), rootRecovery: () => ({ registeredAfterError: { at: 0, error: 'EIO' } }), ownerWriteRefusal: () => null, serverNotice: () => 1, setTimer: (fn, ms) => { timers.push(ms); return { unref() { } }; }, log: () => { } });
          w._state.attempt = 3; await w.sync();   // B-ddf3 unit 2 line 1: the watch's sync answers at the registration's landing
          return { memoKept: fs.existsSync(memo), said: w._state.said, armed: timers.length, attempt: w._state.attempt };
        };
        const rw = await watchSkip(require(path.join(REPO, RWREL)));
        ok(rw.memoKept && rw.said === false && rw.armed === 1 && rw.attempt === 4, '⑪ (k) the hook-root watch reads a held skip as NOTHING registered: no recovery (the memo kept, no «registered after an earlier read error»), its backoff armed to read again', rw);
        const RW_A = /^ {6}else if \(r && r\.skipped && \(r\.settingsHeld \|\| r\.optOutUnread\)\) arm\(\);[^\n]*\n/m;   // B-f276 (s1126): the line also reads an unread opt-out mark
        const xrw = await watchSkip(mutantCopies('swc-root-watch-skip', REPO).load(RWREL, anchored(RWSRC, RW_A, '', 'root-watch-skip'), 'root-watch-skip'));
        ok(xrw.armed === 0 && xrw.attempt === 3, 'CONTROL (the watch\'s skip read cut, in a copy): a held skip is never read again — no backoff armed, the attempt never moves (red; since B-ddf3 unit 2 the recovery itself is read by landing-answer notLanded, which never takes a held skip for one)', xrw);
        // the lift REPLAYS the skipped sync whatever its rows say (every row at its default: no row differs from no «before»)
        const replay = async (M) => {
          let held = { ...HELD }; const lines = [];
          const m = M.create({ serverSetting: (k) => (k === SYMH ? held : undefined), harnesses: { list: () => [], get: () => null }, adapterRegistry: new Map(), activeSessions: new Map(), hookRegistrationSafe: () => false, home: (() => { const d = scratchDir('swc-cli-home-' + (++cliHomes)); roots.push(d); return d; })(), log: (l) => lines.push(String(l)), warn: (l) => lines.push(String(l)) });
          const boot = await m.syncCliConfig({ reason: 'boot' }); held = null;
          m.onSettingsWrite({}, {}); m.onSettingsWrite({}, {});
          return { bootSkipped: !!(boot && boot.skipped && boot.settingsHeld), replays: lines.filter((l) => /^\[cli-config\] skipped \(the settings read again\): /.test(l)).length, lines };
        };
        const rp = await replay(require(path.join(REPO, HCREL)));
        ok(rp.bootSkipped && rp.replays === 1, '⑪ (k) THE LIFT REPLAYS the CLI-config sync the hold skipped — with every row at its default (no row differs from an empty «before») it runs ONCE at the lift (here to its own next gate, the copy\'s refusal — never a file), and not again on the next unchanged write', rp);
        const REPLAY_A = /^ {4}if \(heldSkipped\) landing = syncCliConfig\(\{ reason: 'the settings read again' \}\);[^\n]*\n {4}else /m;
        const xrp = await replay(mutantCopies('swc-cli-replay', REPO).load(HCREL, anchored(HCSRC, REPLAY_A, '    ', 'cli-replay-cut'), 'cli-replay-cut'));
        ok(xrp.bootSkipped && xrp.replays === 0, 'CONTROL (the replay cut, in a copy): the lift with every row at its default never syncs — the boot\'s skipped sync is never replayed (red)', xrp);
        // the integration switch: OFF in the held view (the strict table; persistence's heldSettingsView spreads strictValues)
        const SHREL = 'src/settings-held-strict.js', SHSRC = fs.readFileSync(path.join(REPO, SHREL), 'utf8');
        const PV = fs.readFileSync(path.join(REPO, 'src/routes/persistence.js'), 'utf8');
        const ivRow = ST.STRICT_WHILE_HELD['agents.vibespaceIntegration'];
        ok(!!ivRow && ivRow.kind === 'person-file' && ivRow.strict === false && /NEW spawn/.test(ivRow.why) && /running conversations' context deliveries/.test(ivRow.why) && c.caught.includes('agents.vibespaceIntegration')
          && /const heldSettingsView = \(h\) => Object\.freeze\(Object\.defineProperty\(\{ \.\.\.require\('\.\.\/settings-held-strict\.js'\)\.strictValues\(\) \}/.test(PV) && /function integrationEnabled\(\) \{\n  try \{ return serverSetting\('agents\.vibespaceIntegration'\) !== false; \}/.test(SV),
          '⑪ (k) the integration switch reads OFF while the settings are held (the strict table — a person-file row: no NEW spawn gets the context delivery or the agent tools, the running conversations\' deliveries answer as with it off; ONE reading, integrationEnabled) — a person who turned it off is never overridden by the default ON', ivRow);
        const XST = mutantCopies('swc-strict-iv', REPO).load(SHREL, anchored(SHSRC, /^ {2}'agents\.vibespaceIntegration': row\('person-file', false, [^\n]*\n/m, '', 'strict-iv-cut'), 'strict-iv-cut');
        ok(XST.strictValues()['agents.vibespaceIntegration'] === undefined && SCH['agents.vibespaceIntegration'] && SCH['agents.vibespaceIntegration'].default !== false, 'CONTROL (the strict row cut, in a copy): the held view has no value for the switch — it reads the default ON (new spawns get the context and the tools of a person who turned them off) — red', { def: SCH['agents.vibespaceIntegration'] && SCH['agents.vibespaceIntegration'].default });
        // (主开发 r565) THE ARCHIVE VERB WHILE THE LIST IS HELD: the reach verdict FIRST, the held refusal after it — the held refusal's
        // label is the target's NAME (more than the caller's own reference), so a held list never tells a caller about a conversation
        // it may not see: a caller the key does not reach gets the reach refusal and the list is not asked; a caller it reaches gets
        // the hold by name (store_unread, the target named, nothing ended or archived). RED (in a copy): the held check back before the
        // reach — a caller with no reach is answered the held list's refusal under the conversation's name
        const COREL = 'src/server/conversation-ops.js', COSRC = fs.readFileSync(path.join(REPO, COREL), 'utf8');
        const heldArchive = async (OPS) => {
          let listAsked = 0; const archived = [];
          const V = OPS.automationVerbs({ activeSessions: new Map(), groupsOf: () => [], isArchived: () => { listAsked++; return null; }, archive: (k) => { archived.push(k); return { ok: true, already: false }; }, asksOf: () => [],
            deadOf: (t) => (/^(claude:)?gone7$/.test(t) ? { conversationId: 'gone7', sessionKey: 'claude:gone7', name: 'a private name', groups: [] } : null) });
          const caller = { conversationId: 'c0ffee', sessionKey: 'claude:c0ffee', name: 'the caller', live: true, groups: [] };
          const no = await V['conversations.archive']({ target: 'gone7' }, { caller, keyId: 'ak-000000000001', reach: () => ({ ok: false, code: 'not_granted', why: 'the key does not reach that conversation' }) });
          const askedForNo = listAsked;
          const yes = await V['conversations.archive']({ target: 'gone7' }, { caller, keyId: 'ak-000000000001', reach: () => ({ ok: true, by: 'opener' }) });
          return { no: { code: no.code, why: no.why }, askedForNo, yes: { code: yes.code, noticeName: yes.noticeName, why: yes.why }, archived: archived.length };
        };
        const ha = await heldArchive(require(path.join(REPO, COREL)));
        ok(ha.no.code === 'not_granted' && ha.askedForNo === 0 && ha.yes.code === 'store_unread' && ha.yes.noticeName === 'a private name' && /nothing was ended or archived/.test(ha.yes.why) && ha.archived === 0,
          '⑪ (k) (主开发 r565) the archive verb while the conversation list is held: the REACH verdict first — a caller the key does not reach gets the reach refusal and the held list is never asked; a caller it reaches gets the hold BY NAME (store_unread, the target named) — nothing ended or archived', ha);
        const HELD_BLOCK = /^ {6}\/\/ B-225b R3: the archived list HELD[^\n]*\n {6}\/\/[^\n]*\n {6}\/\/[^\n]*\n( {6}if \(isArchived\(f\.sessionKey\) === null\) return \{ ok: false, code: 'store_unread'[^\n]*\n)/m;
        const heldLine = (COSRC.match(HELD_BLOCK) || [])[1] || '';
        const XCO = mutantCopies('swc-archive-held-first', REPO).load(COREL, anchored(anchored(COSRC, HELD_BLOCK, '', 'archive-held-cut'), '      const v = reach(targetOf({ conversationId: f.conversationId,', heldLine + '      const v = reach(targetOf({ conversationId: f.conversationId,', 'archive-held-first'), 'archive-held-first');
        const xha = await heldArchive(XCO);
        ok(xha.no.code === 'store_unread' && xha.askedForNo === 1, 'CONTROL (the held check back BEFORE the reach, in a copy): a caller the key does not reach is answered the held list\'s refusal — the list asked for a conversation it may not see (red)', xha);
      }
    }
    // (h) THE ONE CHOKE (cut 7 — R1): every write site of src/routes/persistence.js, read on acorn's tree. A held store's file is
    // written ONLY through its hold's ONE write (the desktops, the bookmarks, the custom themes, the settings: one site each; the
    // conversation list: its write and its flush) — the exit flush and the read path's own rewrites go through them; a store's bytes
    // move only by the damaged door's ONE setAside. Every direct fs write names what it writes, and none is a store's file: the data
    // folder (ensureDir), the rollback points (writeJsonAtomic under HISTORY_DIR — its pid temp then the rename — their folder, their
    // prune's unlinks), the agent CLIs' credentials of a config import; + B-225b's remainder (lane login-request-card): THE OWED MARK
    // (layouts.owed.json — no store: its pid temp `markTmp`, then the rename, OFF the loop; its removals). CONTROLS (planted, the census over a copy's text): a direct
    // write of a store's file, a second write door of a store, the atomic writer aimed at a store's file — each red by name.
    {
      const ACH = require(path.join(REPO, 'node_modules/acorn'));
      const PREL = 'src/routes/persistence.js', PSRC = fs.readFileSync(path.join(REPO, PREL), 'utf8');
      const HOLD_WRITES = { layoutsHold: 1, bookmarksHold: 1, themesHold: 1, userStateHold: 2, settingsHold: 1 };
      const FS_WRITE = /^(write|append|rename|unlink|rm|copy|cp|truncate|symlink|link|mkdir|chmod|chown|utimes|open|createWriteStream)/;
      const DIRECT_OK = { mkdirSync: [/^dir$/, /^HISTORY_DIR$/], writeFileSync: [/^tmp$/, /^CLAUDE_CREDS$/, /^CODEX_CREDS$/], renameSync: [/^tmp$/], 'promises.unlink': [/^path\.join\(HISTORY_DIR, /, /^OWED_MARK$/, /^markTmp$/], 'promises.open': [/^markTmp$/], 'promises.rename': [/^markTmp$/] };   // B-574d (lane nl-journals): the owed mark's temp OPENED for its synced write (it was a writeFile — that allowance gone with its call)
      const chokeCensus = (src) => {
        const ast = ACH.parse(src, { ecmaVersion: 'latest', sourceType: 'script', allowHashBang: true, allowReturnOutsideFunction: true });
        const text = (n) => src.slice(n.start, n.end);
        const out = { holdWrites: {}, setAside: 0, direct: [], atomic: [], bad: [] };
        const fsName = (c) => {
          if (c.type !== 'MemberExpression' || c.computed || c.property.type !== 'Identifier') return null;
          if (c.object.type === 'Identifier' && c.object.name === 'fs') return c.property.name;
          if (c.object.type === 'MemberExpression' && !c.object.computed && c.object.object.type === 'Identifier' && c.object.object.name === 'fs' && c.object.property.name === 'promises') return 'promises.' + c.property.name;
          return null;
        };
        const walk = (n) => {
          if (!n || typeof n.type !== 'string') return;
          if (n.type === 'CallExpression') {
            const c = n.callee, a0 = n.arguments[0] ? text(n.arguments[0]) : '', f = fsName(c);
            if (f && FS_WRITE.test(f.replace(/^promises\./, ''))) {
              out.direct.push(`${f}(${a0})`);
              if (!(DIRECT_OK[f] || []).some((re) => re.test(a0))) out.bad.push(`fs.${f}(${a0}) — a direct write of ${a0}`);
            }
            if (c.type === 'Identifier' && c.name === 'writeJsonAtomic') { out.atomic.push(a0); if (!/^path\.join\(HISTORY_DIR, /.test(a0)) out.bad.push(`writeJsonAtomic(${a0}) — the atomic writer aimed outside the rollback points`); }
            if (c.type === 'MemberExpression' && !c.computed && (c.property.name === 'write' || c.property.name === 'flush' || c.property.name === 'owe') && c.object.type === 'Identifier' && /Hold$/.test(c.object.name)) out.holdWrites[c.object.name] = (out.holdWrites[c.object.name] || 0) + 1;   // (B-0248 (c): a hold's OWE — the store writer's road — is its write door too; B-225b's second half: a hold's FLUSH is its write door too — the owed write retried behind it)
            if (c.type === 'MemberExpression' && !c.computed && c.property.name === 'setAside') out.setAside++;
          }
          for (const k of Object.keys(n)) { if (k === 'start' || k === 'end') continue; const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object' && typeof v.type === 'string') walk(v); }
        };
        walk(ast);
        for (const [h, want] of Object.entries(HOLD_WRITES)) if ((out.holdWrites[h] || 0) !== want) out.bad.push(`${h}.write × ${out.holdWrites[h] || 0} (want ${want}) — ${(out.holdWrites[h] || 0) > want ? 'a second write door' : 'its write left the hold'}`);
        for (const h of Object.keys(out.holdWrites)) if (!(h in HOLD_WRITES)) out.bad.push(`${h}.write — a hold this census does not know`);
        if (out.setAside !== 1) out.bad.push(`setAside × ${out.setAside} (want 1 — the damaged door's)`);
        return out;
      };
      const real = chokeCensus(PSRC);
      ok(real.bad.length === 0 && real.direct.length === 11 && real.atomic.length === 0,   // (B-225b r1595 (a): the last run's mark has ONE removal now, 12 → 11)
        `⑪ (h) THE ONE CHOKE: every write of a held store's file is its hold's ONE write (${Object.entries(real.holdWrites).map(([h, n]) => `${h} ${n}`).join(', ')}) or the damaged door's setAside; the ${real.direct.length} direct fs writes are the data folder, the rollback points' prune (its two unlinks), the owed mark of the desktops (its pid temp + rename, its removals — B-225b's remainder) and the agent CLIs' credentials — none a store's file (B-0248 (b): the points themselves are the store writer's)`, real);
      const plant = (add, name) => chokeCensus(anchored(PSRC, '  function flushLayouts({ press = false, stop = false } = {}, answer = null) {\n', '  function flushLayouts({ press = false, stop = false } = {}, answer = null) {\n' + add, name)).bad;
      const p1 = plant('    fs.writeFileSync(LAYOUTS_FILE, JSON.stringify(_layoutsCache));\n', 'swc-h-direct');
      const p2 = plant('    layoutsHold.write(_layoutsCache);\n', 'swc-h-second');
      const p3 = plant('    writeJsonAtomic(SETTINGS_FILE, {});\n', 'swc-h-atomic');
      ok(p1.some((b) => /fs\.writeFileSync\(LAYOUTS_FILE\)/.test(b)) && p2.some((b) => /layoutsHold\.write × 2/.test(b)) && p3.some((b) => /writeJsonAtomic\(SETTINGS_FILE\)/.test(b)),
        '⑪ (h) CONTROLS (planted in a copy\'s text): a direct write of layouts.json, a SECOND write door of the desktops, the atomic writer aimed at settings.json — each red by name', { p1, p2, p3 });
    }
  } finally { for (const d of roots) fs.rmSync(d, { recursive: true, force: true }); }
}

// ── §T THE TWIN HOLDS THE MOVED LEGS (B-7e49, lane bl-tests-e, 主开发 r2522: a leg cannot fall between the two files) ─────────────
// ⑩'s legs, ⑪'s driven legs (a)–(g), (i), (m) and ⑭ moved VERBATIM to the heavy twin scripts/test-store-write-census-scenes.mjs: they RUN the product
// (the real store writer's thread, stalls placed in each main-thread rename / fsync, the persistence route's scenes, mutant copies),
// about 13 s of this file's 26. This file keeps every census and pin over the tree's text, and runs none of the moved legs. RED: a
// twin with one moved section's heading gone is no longer the moved legs.
console.log('§T the heavy twin holds the moved legs');
{
  const twinRel = 'scripts/test-store-write-census-scenes.mjs';
  const twin = fs.existsSync(path.join(REPO, twinRel)) ? fs.readFileSync(path.join(REPO, twinRel), 'utf-8') : '';
  const here = fs.readFileSync(new URL(import.meta.url), 'utf-8');
  const MOVED = ['// ── ⑩ THE MEASURED HOLDS AFTER 2.369.412', 'desktop-apps.json that could not be read (EIO): HELD', 'the unreadable journal shows a $0 month', 'const scene = (Mod, name, code, bytes = SEED) =>', 'a conversation list the start could NOT read: every door answers 503', '// (m) B-225b', 'the restore answers SUCCESS over a write the storage refused', '// ⑭ B-0248 (c) (lane bl-loop-b, 主开发 r912)', 'const XE = await stopScene(', 'the stop lands nothing of it — the rename is lost'];
  const holds = (t) => MOVED.every((h) => t.includes(h));
  ok(holds(twin) && MOVED.every((h) => here.split(h).length === 2), `§T the heavy twin holds ⑩'s legs, ⑪'s driven legs and ⑭ — their headings, their first and last marks — and this file runs none of them`);
  ok(/\{ name: 'test-store-write-census-scenes', tier: 'heavy',/.test(fs.readFileSync(path.join(REPO, 'scripts/ci.mjs'), 'utf-8')), '§T the twin is a HEAVY row of the tier');
  ok(!holds(twin.replace(MOVED[7], '// ⑭ (gone)')), 'RED CONTROL — a twin whose ⑭ heading is gone is no longer the moved legs: §T goes red');
}

// ── ⑮ THE SYNCED RENAME'S HUB CALLERS, BY NAME (B-574d «hub-migrations» follow, lane nl-migrations, 主开发 r4866) ──────────────────────
// src/fd-close.js renameSynced is counted at ITS row (its 5 sites; debt since the hub's migrations call it on the main thread). A helper's
// callers are followed in their own file only, so a NEW hub caller of the door in another file would add nothing to DEBT_MAX: every call
// of it in the census's files is named here BY FILE, with its count and its why — a new caller is red by name until it is judged.
console.log('⑮ the synced rename\'s hub callers, by name');
{
  const RENAME_SYNCED_CALLERS = {
    'src/server/home-rename.js': [2, 'rewriteStores and writeDataMarker (the data half\'s marker: owed or done) — the recorded-path rewrite at boot, before the first loop turn: one sync per store that holds the old home, at the rename\'s start and again at each start only for a store whose rewrite failed, while it is owed'],
    'src/server/migrations.js': [1, 'replaceSynced — the run-once migrations\' stores and archives, in the listen callback (the cloak\'s after its hash): once in a data folder\'s life'],
    'src/codex-fork-ledger-purge.js': [1, '_writeAtomic — the codex fork replays\' purge: a run-once migration\'s shard rewrite'],
    'src/fixture-ledger-purge.js': [1, '_writeAtomic — the test-fixture purge: a run-once migration\'s shards, cursors, attribution and anchors'],
    'src/ledger-slot-backfill.js': [1, '_writeAtomic — the by-slot backfill: a run-once migration\'s shards and attribution log'],
    'src/reading-repair.js': [1, '_writeAtomic — the readings\' repairs: run-once migrations, and the hourly sidecar repair\'s witness (only on a disagreement; its caller reads right after)'],
    'src/usage-history.js': [1, 'UsageHistory._writeAtomic — pricing.json (the defaults at a first start; the prices\' save, a person\'s act) and the rebake\'s shards (run-once)'],
    'src/usage-origin-backfill.js': [1, '_writeAtomic — the origin backfill: a run-once migration\'s shards and its archive\'s label'],
  };
  // a USE of the door = every reference to it in the code but its import binding: a call, `.call` / `.apply`, a member (X.renameSynced,
  // X['renameSynced']), an alias (`{ renameSynced: rs }`, `const rs = X.renameSynced`) and its uses, the door handed on as a value
  const isDoorMember = (m) => m.type === 'MemberExpression' && ((!m.computed && m.property.type === 'Identifier' && m.property.name === 'renameSynced') || (m.computed && m.property.type === 'Literal' && m.property.value === 'renameSynced')
    || (m.computed && m.property.type === 'TemplateLiteral' && !m.property.expressions.length && m.property.quasis[0].value.cooked === 'renameSynced'));
  const usesOf = (src) => {
    if (!src.includes('renameSynced')) return 0;
    const ast = parseOf(src), names = new Set(['renameSynced']);
    walk(ast, (x) => {
      if (x.type === 'Property' && !x.computed && ((x.key.type === 'Identifier' && x.key.name === 'renameSynced') || (x.key.type === 'Literal' && x.key.value === 'renameSynced')) && x.value) {
        const v = x.value.type === 'AssignmentPattern' ? x.value.left : x.value;   // `{ renameSynced: rs = fallback }`
        if (v.type === 'Identifier') names.add(v.name);
      }
      if (x.type === 'VariableDeclarator' && x.id.type === 'Identifier' && x.init && isDoorMember(x.init)) names.add(x.id.name);
    });
    let n = 0;
    walk(ast, (x, parents) => {
      const up = parents[parents.length - 1], up2 = parents[parents.length - 2];
      if (isDoorMember(x)) { if (!(up && up.type === 'VariableDeclarator' && up.init === x)) n++; return; }   // an alias's own definition counts at its uses
      if (x.type !== 'Identifier' || !names.has(x.name) || !up) return;
      if (up.type === 'Property' && ((up.key === x && !up.computed) || (up.value === x && up2 && up2.type === 'ObjectPattern'))) return;   // a key, or the import binding
      if ((up.type === 'VariableDeclarator' && up.id === x) || (/Function/.test(up.type) && up.id === x) || (up.type === 'MemberExpression' && up.property === x && !up.computed)) return;
      n++;
    });
    return n;
  };
  const callersOf = (texts) => Object.fromEntries([...texts].map(([f, t]) => [f, usesOf(t)]).filter(([, n]) => n > 0));
  const judgeCallers = (got) => [
    ...Object.entries(got).filter(([f, n]) => !RENAME_SYNCED_CALLERS[f] || RENAME_SYNCED_CALLERS[f][0] !== n).map(([f, n]) => `${f}: ${n} call(s) of renameSynced — ${RENAME_SYNCED_CALLERS[f] ? `the pin says ${RENAME_SYNCED_CALLERS[f][0]}` : 'NOT a named hub caller: judge it (its own debt said) and name it here'}`),
    ...Object.keys(RENAME_SYNCED_CALLERS).filter((f) => !got[f]).map((f) => `${f}: named, and calls renameSynced no more — drop its line`)];
  const texts = new Map(censusFiles(REPO).filter((f) => f !== 'src/fd-close.js').map((f) => [f, repoText(f)]));   // the tree once a run (r2052: repoText)
  const got = callersOf(texts), bad = judgeCallers(got);
  ok(!bad.length, `⑮ every hub caller of src/fd-close.js renameSynced is named: ${Object.entries(got).map(([f, n]) => `${f} ×${n}`).join(', ') || 'none'}`, bad);
  const SHAPES = [
    ['destructured', "const { renameSynced } = require('./fd-close.js');\nfunction save(f, t) { renameSynced(f + '.tmp', f, t); }\n"],
    ['aliased', "const { renameSynced: rs } = require('./fd-close.js');\nfunction save(f, t) { rs(f + '.tmp', f, t); }\n"],
    ['a member through .call', "const FC = require('./fd-close.js');\nfunction save(f, t) { FC.renameSynced.call(null, f + '.tmp', f, t); }\n"],
    ['computed', "const FC = require('./fd-close.js');\nfunction save(f, t) { FC['renameSynced'](f + '.tmp', f, t); }\n"],
    ['an alias of a member, handed on', "const FC = require('./fd-close.js');\nconst rs = FC.renameSynced;\nfunction save(fs2, t) { fs2.forEach((f) => rs(f + '.tmp', f, t)); return [rs]; }\n"],
    ['an alias with a default', "const { renameSynced: rs = null } = require('./fd-close.js');\nfunction save(f, t) { rs(f + '.tmp', f, t); }\n"],
    ['a template key', "const FC = require('./fd-close.js');\nfunction save(f, t) { FC[`renameSynced`](f + '.tmp', f, t); }\n"],
  ];
  const missed = SHAPES.filter(([, code]) => { const p = judgeCallers(callersOf(new Map([...texts, ['src/zz-new.js', code]]))); return !(p.length === 1 && p[0].startsWith('src/zz-new.js: ')); }).map(([shape]) => shape);
  ok(!missed.length, `RED CONTROL — a third hub caller of renameSynced, in a new file, is red by name in every shape (${SHAPES.map(([s]) => s).join(', ')})`, missed);
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
