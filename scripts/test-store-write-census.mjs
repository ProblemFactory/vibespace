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
// Run: node scripts/test-store-write-census.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import os from 'node:os';
import { filesOf, sitesOf, walk, scopeOf } from './sync-fs-census.mjs';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? ' — ' + JSON.stringify(d).slice(0, process.env.CENSUS_ALL ? 1e9 : 1500) : '')); } };

// channel-store-off-loop (commit 1): THE CENSUS LEARNS WHAT IT MISSED — a directory made (mkdirSync), a file opened for
// write or append (openSync whose flags are not a read's), a tree or a file removed (rmSync, unlinkSync) hold the loop on a
// slow mount as a write does (the owner's hub: an account directory's mkdir, 19 holds and 75 s in a day, was never a row)
const PERSIST = new Set(['writeFileSync', 'appendFileSync', 'renameSync', 'copyFileSync', 'truncateSync', 'ftruncateSync', 'fsyncSync', 'fdatasyncSync', 'writeSync', 'writevSync', 'mkdirSync', 'rmSync', 'unlinkSync', 'openSync']);
/** an openSync's flags: absent or a read's literal ('r', 'rs') ⇒ not a write; a write / append / '+' literal, or flags not
 *  written as a literal (a constant, a variable) ⇒ counted */
const opensForWrite = (call) => { const fl = call.arguments[1]; if (!fl) return false; return !(fl.type === 'Literal' && typeof fl.value === 'string' && !/[wa+]/.test(fl.value)); };
const HELPER = /\b(writeJsonAtomic|writeBuffersAtomic|_writeAtomic|writePrivateFile)\s*\(/g;
const CLASSES = new Set(['durable', 'not-main', 'not-a-store', 'exit', 'debt']);
// a file whose rows are by SCOPE (its other sites fall to '*')
const SCOPED = { 'src/server/session-stdout.js': ['writeSessionMeta', 'patchSessionMeta'], 'src/desktop-serve.js': ['writeJsonAtomic', 'writeAtCall'], 'src/jobs.js': ['JobManager._logsHeldFile', 'JobManager._logsNoteAtExit'],
  // channel-store-off-loop (commit 1): the channel store's doors BY NAME — the moved ones (adapters, groups, the outbox, the
  // aliases, people, the poll-stamps snapshot) have no synchronous call left (no row); the journal is the named exception;
  // every other door is LISTED as its own row, rows that only fall
  'src/channel-store.js': ['journal', 'foldJournal', 'lruSave', 'lruFlush', 'attachmentPut', 'avatarPut', 'avatarRefuse', 'searchMemoWrite', 'searchMemoDrop', 'feedMissWrite', 'feedMissDrop', 'appendRecords', 'appendLines', 'writeAll', 'prependRecords', 'rewriteRecords', 'trim', 'appendSide', 'trimSide', 'audit', 'outboxPrune', 'dropOutboxFiles'] };   // lane job-logs-sweep r3: the failed load's fact on disk (durable); r4: a note still owed, written by the exit
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
const DEBT_MAX = 862;   // lane lg-store-writes (主开发 2026-11-20 03:10Z, the measured holds after 2.369.412): −4 — desktop-serve's record file onto the store writer on the hub (its device road classed not-main), −2 — device-alerts' ledger onto the writer ⇒ 868 − 6; before: usage-cpu U4 (moved onto 2.369.412's second checkpoint 8f96c01eb): −2 — otel-ingest's per-post stash append (mkdirSync + appendFileSync) moved onto the store writer ⇒ 870 − 2 = 868. Before: lane lg-providers U1 cure (restack on int411): −1 — src/server/provider-store.js's write moved onto the store writer (its debt row gone) ⇒ 871 − 1 = 870; int411 seam (2026-11-18, both falls kept by arithmetic: 881 − 8 − 2 = 871) — the two lines above: −8; B-3767 unit 2 (restack 2.369.412): −2 — the codex zst cache's and HostManager's ssh control folder's own mkdirSync left their files (the one ensureSocketDir site is src/sock-path.js's row); was 881. Before: int410 seam (rule 2, 2026-11-18): both falls kept (893 − 10 − 2 = 881) — lane bl-windows batch-4 cure: −2 — the layout-history prune's two unlinks went async (persistence.js 28 → 26); then lane lg-store-writes U3 (B-0248): −2 — src/channel-store.js's wake-pace and dispatch ledgers through owe() (paceFlush / dispatchFlush rows gone); U2: −2 — src/turn-carry.js's outstanding table handed to the writer (its row gone); U1: −6 — src/server/decision-engine.js's memo and day's counter handed to the writer (its writeJsonAtomic ×4 + the helper's write and rename); was 893. Was 516 — lane job-logs-sweep r3: −2 — jobs.js's two load-failure set-aside renames moved into JobManager._logsHeldFile, a durable row (the failed load's fact on disk); on .397's 518 (hub-sync-holds −2) ⇒ 516
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
  ["src/agentd/client.js","*",11,"durable","—","NOT idempotent: the device agent's local token and proof — a lost write is a device that cannot prove itself","round 2 (newly scanned, required by server.js): the local device's token / proof / install — must be on disk before the answer"],
  ["src/channels/fake.js","*",1,"debt","—","—","round 2 (newly scanned): the FAKE channel adapter (suites and a demo account) — a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/channels/webhook.js","*",10,"debt","—","—","round 2 (newly scanned): the webhook adapter's own atomic writer (writeJsonAtomic ×3 + its 2 callers) and its queue append — a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/harnesses/antigravity.js","*",16,"debt","—","—","round 2 (newly scanned): seeding the CLI's home at a spawn (seedHomeRoot + its 2 callers) — a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
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
  ["src/account-material.js","*",7,"durable","—","NOT idempotent: money / authority / a credential","an account's credential files — must be on disk before the answer"],
  ["src/accounts.js","*",27,"durable","—","NOT idempotent: money / authority / a credential","accounts and their credential links — must be on disk before the answer"],
  ["src/app-secrets-seal.js","*",6,"not-main","—","—","a child CLI src/secret-service.py runs (B-694d +3: the temp file written through its own fd, fsynced, and the folder fsynced after the rename)"],
  ["src/app-serve.js","*",3,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/browser-serve.js","*",11,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/channel-outbox-files.js","*",8,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/channel-store.js","journal",2,"durable","—","a stamp a kill took reads as «never polled» after the restart: a restored window fetches that row at once and a vendor refusal holds every NEW conversation back (the 2.369.203 incident)","channel-store-off-loop: THE NAMED EXCEPTION — the poll-stamps journal's append on its kept descriptor (and its open, once a process) STAYS on the main thread: it survives a process kill in the page cache the moment it returns; the writer's queue would lose it. The field never named it"],
  ["src/channel-store.js","foldJournal",2,"durable","—","a fold lost replays the same stamps over the side file at the next start (idempotent lines); a fold that cut a newer line would lose that stamp — it runs only when no stamp was set since the side file's bytes were made","channel-store-off-loop: the named exception's second call — the journal truncated on its kept descriptor once the side file holding every line is on disk"],
  ["src/channel-store.js","lruSave",2,"debt","—","—","LISTED (channel-store-off-loop, commit 1): a row that only falls — not moved in this unit: an account's attachment LRU ledger — its directory and its write"],
  ["src/channel-store.js","lruFlush",1,"debt","—","—","LISTED (channel-store-off-loop, commit 1): a row that only falls — not moved in this unit: the LRU ledger's coalesced flush (lruSave's caller)"],
  ["src/channel-store.js","attachmentPut",2,"debt","—","—","LISTED (channel-store-off-loop, commit 1): a row that only falls — not moved in this unit: a fetched attachment's meta file"],
  ["src/channel-store.js","avatarPut",1,"debt","—","—","LISTED (channel-store-off-loop, commit 1): a row that only falls — not moved in this unit: an avatar's meta file"],
  ["src/channel-store.js","avatarRefuse",2,"debt","—","—","LISTED (channel-store-off-loop, commit 1): a row that only falls — not moved in this unit: an avatar refusal's meta — its directory and its write"],
  ["src/channel-store.js","searchMemoWrite",2,"debt","—","—","LISTED (channel-store-off-loop, commit 1): a row that only falls — not moved in this unit: the account's vendor-search memo — its directory and its write"],
  ["src/channel-store.js","searchMemoDrop",1,"debt","—","—","LISTED (channel-store-off-loop, commit 1): a row that only falls — not moved in this unit: the vendor-search memo removed with its account"],
  ["src/channel-store.js","feedMissWrite",2,"debt","—","—","LISTED (channel-store-off-loop, commit 1): a row that only falls — not moved in this unit: the change feed's miss memo — its directory and its write"],
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
  ["src/channel-store.js","*",9,"debt","—","—","the store's own directories at its creation, a set-aside of an unreadable file at the load, the index's verify line, an account's purge, and writeJsonAtomic's own body — a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/codex-fork-ledger-purge.js","*",5,"debt","—","—","one-shot migration (once in the data dir's life, in the listen callback — after the first turn, so not «boot»): debt"],
  ["src/conversation-index.js","*",2,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/desktop-display.js","*",5,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/desktop-serve.js","*",10,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched (lane lg-store-writes, 主开发 2026-11-20 03:10Z: the record file's save moved onto the writer on the hub, 14 → 10 — the device road is its own rows)"],
  ["src/desktop-serve.js","writeJsonAtomic",2,"not-main","—","—","the record file written at the call ONLY by a paired device's agent (the daemon bundles this module; the hub's keeper hands its store writer — src/server/desktop-app-keeper.js)"],
  ["src/desktop-serve.js","writeAtCall",2,"not-main","—","—","the device agent's road ONLY (its folder made, the record file written at the call — the hub's save hands the bytes to the writer, makeDir: true)"],
  ["src/exit-proxy.js","*",4,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/fixture-ledger-purge.js","*",14,"debt","—","—","one-shot migration (once in the data dir's life, in the listen callback — after the first turn, so not «boot»): debt"],
  ["src/gmail-sync.js","*",6,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/harness-config.js","*",5,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/hosts.js","*",30,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/claude-oat-probe.js","*",30,"not-main","—","—","lane cli-self-measure (+1, lane readings-attribution-2 P0: the mid-turn variants' scratch note in the run's own scratch; .393; classified at hub-loop-stalls commit 2's rebase): the long-lived-token measurement runs only in its OWN process — the release script, or the hub FORKS it (src/server/cli-self-measure.js) — over a scratch HOME · + lane oat-add-door: the mint variant's own scratch dir (runMint: rmSync before, its mkdir) — the variant's scratch like every variant's, in the measurement's own process"],
  ["src/incident.js","*",13,"not-main","—","—","runs in the incident freeze worker (src/server/incident-freeze-worker.js)"],
  ["src/job-logs-sweep-worker.js","*",10,"not-main","—","—","lane job-logs-sweep round 2 (r3 §8 +1: a catch-up record that does not parse, set aside by rename; r4 +1: a record store's NOTE <store>.corrupt-unread, written O_EXCL here — never on the hub's main thread): the job-logs remover's CHILD process (src/job-logs-sweep.js forks it; it throws without its IPC channel) — a remover whose hub ended leaves its counts in <dataDir>/jobs-remover-orphan-<pid>-<seq>.json (temp + rename), read and forgotten by the next engine"],
  ["src/input-inject.js","*",2,"not-main","—","—","runs inside the device agent (src/agentd/agentd.js)"],
  ["src/jobs.js","*",20,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched (lane job-logs-sweep r3 −2: the two loads' set-aside renames moved into JobManager._logsHeldFile, a durable row)"],
  ["src/jobs.js","JobManager._logsHeldFile",2,"durable","—","NOT idempotent: a job record store whose read FAILED — a lost set-aside (rename, else copy) is the job-logs clean-up removing the runs those records listed","lane job-logs-sweep round 3 §1: a records read that failed leaves its bytes ON DISK before the load returns — renamed or copied aside; must be on disk before any write of that store (the load's failure branch only: one per failed load). Round 4: the NOTE (nothing to set aside) moved to the remover's child — this process holds until it lands"],
  ["src/jobs.js","JobManager._logsNoteAtExit",1,"durable","—","NOT idempotent: a lost note is the next start not knowing those records could not be read — its clean-up may remove the runs they listed","lane job-logs-sweep round 4 §1: a note the remover's child had not written by the hub's EXIT — ONE O_EXCL write, before the exit's own write of that store, on a loop that serves nothing any more"],
  ["src/kept-copies.js","*",6,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/ledger-slot-backfill.js","*",9,"debt","—","—","one-shot migration (once in the data dir's life, in the listen callback — after the first turn, so not «boot»): debt"],
  ["src/machine-mounts.js","*",7,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/migration-runner.js","*",5,"debt","—","—","one-shot migration (once in the data dir's life, in the listen callback — after the first turn, so not «boot»): debt"],
  ["src/mounts.js","*",18,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/opencode-serve.js","*",9,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/opslog.js","*",1,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/plugins.js","*",2,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/port-forward.js","*",3,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/quota-model-migrate.js","*",2,"debt","—","—","one-shot migration (once in the data dir's life, in the listen callback — after the first turn, so not «boot»): debt"],
  ["src/reading-repair.js","*",24,"debt","—","—","one-shot migration (once in the data dir's life, in the listen callback — after the first turn, so not «boot»): debt"],
  ["src/remote-fs.js","*",2,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/routes/editor.js","*",2,"not-a-store","—","—","a person's own file (the editor's save)"],
  ["src/routes/files.js","*",21,"not-a-store","—","—","a person's own files (the file explorer); ckpt61 cure 3: + the archive entry's temp folder removed on its two new refusals (a reader that never started, a write that failed)"],
  ["src/routes/persistence.js","*",26,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched (bl-windows batch-4 cure: the layout-history prune's two unlinks went async, 28 → 26)"],
  ["src/safe-fs-worker.js","*",15,"not-main","—","—","the SafeFs worker thread"],
  ["src/search-index-worker.js","*",3,"not-main","—","—","the search index worker thread"],
  ["src/secret-box.js","*",6,"durable","—","NOT idempotent: money / authority / a credential","a store key file (secrets) — must be on disk before the answer"],
  ["src/secret-file.js","*",6,"durable","—","NOT idempotent: money / authority / a credential","a secret file (secrets) — must be on disk before the answer"],
  ["src/server/agent-tool-generators.js","*",30,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/apps-engine.js","*",3,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/auto-cli-loop.js","*",6,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/auto-resume.js","*",3,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/automation-engine.js","*",7,"durable","—","NOT idempotent: money / authority / a credential","automation keys (authority) — must be on disk before the answer"],
  ["src/server/boot-restore.js","*",14,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched. ROUND 4 (item 7), NAMED DEBT with its measured cost: the .json.stopped copies of dead conversations at a boot — 25 dead = 60 s of main-thread hold at 1.2 s a call (master's code, unchanged here)"],
  ["src/server/browser-bindings.js","*",3,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/browser-builds-keeper.js","*",19,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/browser-cli-install.js","*",10,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/browser-display-config.js","*",6,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/browser-env.js","*",12,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/browser-installs.js","*",5,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/browser-keeper.js","*",24,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/browser-kept.js","*",5,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/browser-logins.js","*",2,"durable","—","a lost reminder mark ⇒ an aged unconfirmed login files its For-you reminder card again at the next unlock","lane vault-login (.399; classified on .398 rebase): data/browser-login-reminders.json — DEK-keyed HMAC marks of aged pending logins already reminded (≤ 4096 × 32-hex, mode 0600), written once when a reminder fires without touching vault.json, small"],
  ["src/server/browser-trace.js","*",25,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/channel-api-cards.js","*",3,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/channel-api.js","*",6,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/channels-attention.js","*",2,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/claude-signin.js","*",6,"durable","—","NOT idempotent: money / authority / a credential","a sign-in's credential files — must be on disk before the answer"],
  ["src/server/cli-env.js","*",1,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/cli-registration.js","*",3,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/cli-unmeasured-notice.js","*",1,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/conversation-deliver.js","*",7,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/csp-reports.js","*",5,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/decision-engine.js","*",3,"debt","—","—","the decision journal (decision-journal.jsonl): a paid call's line appended, and its trim to 30 days / 5 000 lines (temp + rename) — not moved in lane lg-store-writes U1 (B-0248), which moved the memo and the day's counter onto the writer; onto the store writer when its store is next touched"],
  ["src/server/design-engine.js","*",1,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/desktop-access.js","*",1,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/desktop-app-keeper.js","*",4,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/desktop-handover-engine.js","*",1,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/device-upgrade-watch.js","*",2,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/dial-health-watch.js","*",2,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/dial-pairing.js","*",5,"durable","—","NOT idempotent: money / authority / a credential","a pairing secret (authority) — must be on disk before the answer"],
  ["src/server/doc-engine.js","*",3,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/feedback-forward.js","*",3,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/feedback-store.js","*",3,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/grants-migration.js","*",2,"durable","—","NOT idempotent: money / authority / a credential","grants' one-shot reshape (authority) — must be on disk before the answer"],
  ["src/server/grants-store.js","*",7,"durable","—","NOT idempotent: money / authority / a credential","grants — who may use a resource (authority) — must be on disk before the answer"],
  ["src/server/home-rename.js","*",4,"debt","—","—","B-8033 (moved whole from server.js migrateHomeRename — its 4 sites, the debt unchanged): the one-shot home-rename migration at boot — a store's backup, its tmp + rename, the data/ marker; the HOME marker goes async (fs.promises)"],
  ["src/server/hook-root-watch.js","*",2,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/host-tokens.js","*",3,"durable","—","NOT idempotent: money / authority / a credential","a machine's token (authority) — must be on disk before the answer"],
  ["src/server/incident-freeze-worker.js","*",1,"not-main","—","—","the incident freeze worker thread"],
  ["src/server/incident-wiring.js","*",2,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/instance-url.js","*",3,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/integration-store.js","*",3,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/local-index.js","*",4,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/login-expiry-watch.js","*",2,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/migrations.js","*",50,"debt","—","—","one-shot migration (once in the data dir's life, in the listen callback — after the first turn, so not «boot»): debt"],
  ["src/server/mounts-plugins-wiring.js","*",2,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/oat-mint.js","*",5,"durable","—","NOT idempotent: money / authority / a credential","a minted OAuth token (credential) — must be on disk before the answer"],
  ["src/server/ops-routes.js","*",3,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/otel-ingest.js","*",3,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"], // usage-cpu U4: −2 — the stash's per-post mkdirSync + appendFileSync moved onto the store writer (the token's first write and the trim's rename stay)
  ["src/server/plugin-install.js","*",14,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/plugin-loader.js","*",8,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/provider-spawn.js","*",2,"durable","—","NOT idempotent: authority / a credential — a login file left in the child's home is a sign-in it could spend","lane lg-providers U2: a third-party provider's own home (data/provider-homes/<id>/<harness>, 0700) made and its login file removed BEFORE the child spawns — the spawn reads it at once"],
  ["src/server/published-pages.js","*",11,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/session-stdout.js","*",7,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/session-stdout.js","writeSessionMeta",3,"durable","boot-restore, browser-env, usage-routes, channels liveness, weekly-lanes-unfold, reading-repair (each reads the files itself)","NOT idempotent: a live socket without its meta is restored as a stranger","a session's FIRST meta (a new socket) — its UPDATES go through the store writer"],
  ["src/server/spend-guard.js","*",11,"durable","—","NOT idempotent: money / authority / a credential","the unattended-spend budget + its journal (money) + its birth marker (B-23c3: written after every ledger write, so a removed ledger or an older copy is told apart from a first start) — must be on disk before the answer; B-ef83 +7: the ledger's LOCK (data/spend-budget.lock — authority: a lock lost is two processes counting one ledger): its temp linked into place (or created exclusively and written where the folder makes no hard link), a stale lock set aside and removed, and its removal at the process's exit"],
  ["src/server/stash-handover.js","*",2,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/sync-fs-witness-worker.js","*",1,"not-main","—","—","the witness's watchdog thread (its journal line on fd 2)"],
  ["src/store-exit-keeper.js","*",1,"not-main","—","—","round 4 (MUST 2): the writer's exit keeper thread — its ONE line on fd 2 at the exit's bound, then the process ends"],
  ["src/server/tailnet-door.js","*",2,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/tls.js","*",4,"durable","—","NOT idempotent: money / authority / a credential","the TLS certificate + key — must be on disk before the answer"],
  ["src/server/usage-pool-engine.js","*",12,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/usage-probe-log.js","*",3,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/user-input.js","*",2,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/vault-engine.js","*",26,"durable","—","NOT idempotent: money / authority / a credential","the vault (sealed entries, the DEK wrap) — must be on disk before the answer"],
  ["src/server/vault-run-door.js","*",22,"durable","—","NOT idempotent: money / authority / a credential","the vault's run door (a use receipt) — must be on disk before the answer"],
  ["src/server/vault-totp.js","*",6,"durable","—","NOT idempotent: money / authority / a credential","the vault's TOTP seeds — must be on disk before the answer"],
  ["src/server/vault-use-grants.js","*",4,"durable","—","NOT idempotent: money / authority / a credential","the vault's use grants (authority) — must be on disk before the answer"],
  ["src/server/voice-teach-engine.js","*",1,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/window-targets-engine.js","*",13,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/writes-lost.js","*",5,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/slot-transitions.js","*",6,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/ssh-key.js","*",3,"durable","—","NOT idempotent: money / authority / a credential","an ssh key (credential) — must be on disk before the answer"],
  ["src/store-writer-worker.js","*",14,"not-main","—","—","the writer's own thread (src/store-writer.js starts it): temp + every byte + close + rename, an append + fsync, an unlink; B-48a4 +3: a ring's rotation before an append (the rename to .1) and an append store's missing data dir (its mkdir + the open again). ROUND 3 (law 2): the main thread never runs it at the exit (the exit WAITS for the thread, bounded — the «exit» class is empty: no store byte is written on the main thread at the exit); it runs writeJob only in the writer's main-only mode — its thread died past RESTARTS_MAX an hour, said once («from now on every store is written ON THE MAIN THREAD»), each such write saying it held the loop"],
  ["src/sync-store.js","*",4,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/sysinfo.js","*",2,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/task-groups.js","*",13,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/telemetry.js","*",4,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/transcript-service.js","*",4,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/usage-anchors.js","*",2,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/usage-cache-write.js","*",6,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/usage-history.js","*",12,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/usage-hold-road.js","*",2,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/usage-index-worker.js","*",3,"not-main","—","—","the usage index worker thread"],
  ["src/usage-ledger-dedup.js","*",19,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/usage-origin-backfill.js","*",7,"debt","—","—","one-shot migration (once in the data dir's life, in the listen callback — after the first turn, so not «boot»): debt"],
  ["src/usage-routes.js","*",12,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/user-todos.js","*",4,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
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
function censusFiles(repo) {
  const walk = (d) => fs.readdirSync(path.join(repo, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : e.name.endsWith('.js') ? [`${d}/${e.name}`] : []));
  const extra = EXTRA_DIRS.filter((d) => fs.existsSync(path.join(repo, d))).flatMap(walk);
  return [...new Set([...filesOf(repo), ...extra, ...EXTRA_FILES.filter((f) => fs.existsSync(path.join(repo, f)))])].sort();
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
function scan(repo) {
  const out = [], files = censusFiles(repo), parsed = new Map(), helperDefs = new Map();
  for (const f of files) {
    let r, src; try { src = fs.readFileSync(path.join(repo, f), 'utf8'); r = fileSites(src, f); } catch { continue; }
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
const KNOWN_HELPERS = new Set(['writeJsonAtomic', 'writeBuffersAtomic', '_writeAtomic', 'writePrivateFile']);
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
ok(!J.problems.length, `${J.sites} sites in ${ROWS.length} rows — durable ${ROWS.filter((r) => r[3] === 'durable').reduce((a, r) => a + r[2], 0)} · not-main ${ROWS.filter((r) => r[3] === 'not-main').reduce((a, r) => a + r[2], 0)} · not-a-store ${ROWS.filter((r) => r[3] === 'not-a-store').reduce((a, r) => a + r[2], 0)} · exit ${ROWS.filter((r) => r[3] === 'exit').reduce((a, r) => a + r[2], 0)} · DEBT ${J.debt} (≤ ${DEBT_MAX})`, process.env.CENSUS_ALL ? J.problems : J.problems.slice(0, 12));

console.log('② the moved stores hand their bytes to the writer by name; nothing of theirs is written here');
{
  const src = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
  const cs = src('src/channel-store.js'), ss = src('src/server/session-stdout.js'), uh = src('src/usage-history.js'), ue = src('src/usage-estimator.js'), jb = src('src/jobs.js');
  // channel-store-off-loop (commit 1): the field-named doors and their same-bytes twins hand their bytes to the writer BY NAME
  const doors = [['adaptersUpdate', "owe(adaptersFile, { name: 'channels-adapters.write'"], ['outboxUpdate', "owe(outboxFile, { name: 'channels-outbox.write'"], ['groupsUpdate', "owe(groupsFile, { name: 'channels-groups.write'"], ['paceSet', "owe(paceFile, { name: 'channels-wake-pace.write'"], ['dispatchSet', "owe(dispatchFile, { name: 'channels-dispatch.write', act: true"], ['aliasesUpdate', "owe(aliasesFile, { name: 'channels-aliases.write'"], ['peopleWrite', "owe(file, { name: 'channels-people.write'"], ['oweStamps', "owe(stampsFile, { name: 'channels-stamps.write'"]];
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
      && /return W\(\)\.durable\(F\.usage\)/.test(t) && /if \(call\.counted\) await call\.counted;/.test(t) && !/writeJsonAtomic\(/.test(t) && w.length === 3 && w.every((l) => /F\.journal|keep\.join/.test(l)); };
  ok(deMoved(de), 'the decision memo (paced) and the day\'s counter (an act: rank 0 — the CALL that changed it waits for its durable(), the loop never) through the writer — the file\'s only synchronous writes left are the journal\'s three');
  ok(!deMoved(de.replace("W().dirty(F.memo, { name: 'decision-memo.write'", "fs.writeFileSync(F.memo, { name: 'decision-memo.write'")), 'NEGATIVE CONTROL (lg-store-writes U1): the memo written synchronously again is red');
  // lane lg-store-writes U2 (B-0248): the outstanding-deliveries table (src/turn-carry.js) — a mark an act (rank 0 +
  // durable()), the rest paced — hands its bytes to the writer by name; no synchronous write of it is left
  const tc = src('src/turn-carry.js');
  const tcMoved = (t) => /W\(\)\.dirty\(file, \{ name: 'turn-carry-outstanding\.write', \.\.\.\(act \? \{ rank: 0 \} : \{\}\)/.test(t) && /if \(act\) W\(\)\.durable\(file\)/.test(t)
    && /mark\(key, info\) \{ if \(!key\) return true; rows\[key\] = info; return save\(\{ act: true \}\); \}/.test(t) && !/fs\.(writeFileSync|renameSync)\(/.test(t);
  ok(tcMoved(tc), 'the outstanding-deliveries table through the writer (a mark an act, rank 0 + durable(); a clear paced) — no writeFileSync / renameSync left in src/turn-carry.js');
  ok(!tcMoved(tc.replace("return JSON.stringify(rows); },", "return JSON.stringify(rows); }, x: fs.writeFileSync(file + '.tmp', ''),")), 'NEGATIVE CONTROL (lg-store-writes U2): a synchronous write of the table put back is red');
  const TS = require(path.join(REPO, 'src/timed-sync.js'));
  ok(['channels-index.write', 'session-meta.write', 'usage-cursors.write', 'usage-rates.write', 'jobs-logs-sweep.write', 'decision-memo.write', 'decision-usage.write', 'turn-carry-outstanding.write', 'channels-wake-pace.write', 'channels-dispatch.write'].every((n) => TS.STORES[n] && TS.STORES[n].kind === 'write'), 'each moved store keeps its store-timing row (the writer records its write\'s own time under it)');
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
    ['src/usage-estimator.js', 1, 'flushRates() / settleRates() — the learned rates on disk before the boot\'s migrations step and a ledger backfill\'s pass completes'],
    ['src/session-status.js', 1, 'flush() — the session-status map before the shutdown hands over and the set routes answer (persisted())'],
    ['src/server/session-stdout.js', 1, 'writeSessionMeta {sync: true} — a meta its caller renames next (boot-restore retireDeadSocket): the write in flight lands, then this one'],
    ['src/turn-carry.js', 1, 'createOutstanding() — a table made AGAIN in the same process (a suite\'s new hub on the same data dir) lands the write the last one still owed before it reads the file; a hub\'s boot owes nothing (pending() is false: no wait) — lane lg-store-writes U2'],
    ['src/server/decision-engine.js', 1, 'create() — an engine made AGAIN in the same process (a suite\'s restart) lands the memo / counter write the last one still owed before it reads the files; a hub\'s boot owes nothing (pending() is false: no wait) — lane lg-store-writes U1'],
    ['src/server/device-alerts.js', 1, 'create() — a ledger made AGAIN in the same process (a suite\'s restart) lands the write the last one still owed before it reads the file; a hub\'s boot owes nothing (pending() is false: no wait) — lane lg-store-writes, 主开发 2026-11-20 03:10Z'],
    ['src/desktop-serve.js', 2, 'shutdown() — the machine\'s stop lands the record file before the hub hands over (bounded; a held storage said); reshapeStore() — a boot migration\'s reshape on disk before the runner records it (once, at the boot; not landed ⇒ it throws and runs again) — lane lg-store-writes, 主开发 2026-11-20 03:10Z'],
    ['src/hosts.js', 1, 'flushThrottled() — hosts.json on disk before the shutdown hands over (server.js), before the dial-token migration renames its legacy file (its hashes on disk first: a kill between would lose them) and before a suite reads the file (B-48a4: every save of hosts.json goes through the store writer); one small whole-file write (the machines\' records, KBs), the write in flight first'],
  ];
  const got = new Map();
  for (const f of censusFiles(REPO)) { if (f === 'src/store-writer.js') continue; const t = fs.readFileSync(path.join(REPO, f), 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n'); const n = (t.match(/\.flushSync\(/g) || []).length; if (n) got.set(f, n); }
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
    [A, 'create > settleFromItem', 0, 1, 'the person\'s deny from the For-you card: the card\'s close reaches the For-you store at ITS 500 ms debounce (round 3, smaller 6d — not synchronous: a kill inside it loses the close too, the card comes back and the person decides again) and the boot reconcile settles the request from it — re-derived'], [A, 'create > setGrain', 1, 0, 'access / watchers of a grain'],
    [A, 'create > removePattern', 1, 0, 'a rule removed'], [A, 'create > setFilter', 2, 0, 'a conversation\'s filter set or cleared'],
    [A, 'create > dropHeld', 0, 1, 'a held request whose reach went — re-judged at the next pass'], [A, 'create > endHeld', 0, 1, 'a held request ended by the system — re-judged at the boot reconcile'],
    [A, 'create > expireWatchRequests', 0, 1, 'an expiry — re-derived from the request\'s own time'], [A, 'create > migrateAggregated', 0, 1, 'a migration whose readers lift the old shape'],
    [A, 'create > migrateGrants', 0, 1, 'a migration whose readers lift the old shape'], [A, 'create > prunePending', 0, 1, 'a prune — re-derived'],
    [A, 'create > reconcileAsks', 0, 1, 'the boot reconcile — re-runs every boot'], [A, 'create > reconcilePresses', 0, 1, 'the boot reconcile — re-runs every boot'],
    [A, 'create > stampAgentRead', 0, 1, 'the agent\'s read stamp (the list\'s chip) — a SIGKILL inside the pace loses the newest stamp; the agent\'s next read stamps again'],
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
    for (const rel of filesOf(REPO)) {
      const src = over[rel] !== undefined ? over[rel] : fs.readFileSync(path.join(REPO, rel), 'utf8');
      if (!/index\.update\(/.test(src)) continue;
      const ast = AC.parse(src.replace(/^#!.*/, ''), { ecmaVersion: 'latest', allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true, locations: true, sourceType: 'script' });
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
  ok(!pr.length, `${got.size} scopes: ${sum(2)} index updates durable before the answer (acts, decisions, billing / delivery records) · ${sum(3)} paced (re-derived)`, pr.slice(0, 10));
  const esrc = fs.readFileSync(path.join(REPO, E), 'utf8');
  const MR = esrc.match(/async function markRead\([\s\S]*?\n  \}/);
  ok(!!MR && /, \{ durable: true \}\)/.test(MR[0]), 'CONTROL setup: markRead\'s update is spelled durable once');
  const cut = MR ? ixJudge(ixSites({ [E]: esrc.replace(MR[0], MR[0].replace(', { durable: true })', ')')) })) : [];
  ok(cut.some((p) => p.startsWith(`MOVED: ${E}|create > markRead`)), 'CONTROL: markRead without `durable` (the read mark at the index\'s pace — 11 s on a 22 MB index) is red by name', cut.slice(0, 3));
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
    ['server.js', 'persistAskedAt', 0, 2, 'first-seen stamps of an ask (the inbox clock)'], ['server.js', 'persistSessionMeta', 0, 1, 'browser facts — the binding itself is written synchronously to browser-bindings; the meta is its copy'],
    ['server.js', 'persistFlag', 0, 1, 'the per-session auto-continue choice (lane auto-resume-bulk) — its restart copy, through the store\'s patch (lg-recovery U2 cure); the page writes the same choice into its resume carrier in the same act'],
    ['src/server/session-stdout.js', 'create > patchMetaOnce', 0, 2, 'ONE field patched (lg-recovery U1 + U2 cures — the stop fact and the per-session auto-continue choice): its pending copy, else the file read OFF the loop; one chain per file, a give-up\'s keys ride the next patch — paced'],
    ['server.js', 'rebindSessionMeta', 0, 1, 're-runs the binding hook (the bindings store is synchronous)'], ['server.js', 'route:POST /api/sessions/:id/msg-reachability', 1, 0, 'the person\'s reach level — answered after the disk'],
    ['src/agent-routes.js', 'setupAgentRoutes > persistSeenMarks', 0, 1, 'a seen mark — lost, one injection is sent again'],
    ['src/routes/editor.js', 'registerEditorRoutes > route:POST /api/editor/open', 1, 0, 'the only record of an edit in flight — on disk before the editor opens'], ['src/routes/editor.js', 'registerEditorRoutes > route:POST /api/editor/signal', 0, 1, 'the clear — a stale record heals itself at the next attach'],
    ['src/server/artifact-registry.js', 'persistSoon', 0, 1, 'the deliverables\' cache'], ['src/server/boot-restore.js', 'create > armRestoredCapture > onAdopt', 1, 0, 'the restored claude id / a fork — a binding'],
    ['src/server/boot-restore.js', 'create > readoptOrphanKeeperSessions', 0, 1, 'a re-adopted socket\'s FIRST version — written synchronously by construction'], ['src/server/boot-restore.js', 'create > restoreSessions > recaptureIds', 1, 0, 'a codex thread id — a binding'],
    ['src/server/boot-restore.js', 'create > restoreSessions', 0, 1, 'apiKeySource — restated at every init'], ['src/server/boot-restore.js', 'create > retireDeadSocket', 1, 0, '{sync: true} — renamed to .orphan right after (round 2: a paced write landed after the rename and re-created a live-looking meta)'],
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
    ['src/server/usage-pool-engine.js', 'create > persistStoppedBy', 0, 1, 'why a session stopped (lg-recovery U1 + cures) — through the store\'s patch (its owed keys ride the next patch); the next turn end restates or clears it'],
    ['src/server/usage-pool-engine.js', 'create > persistPoolPin', 1, 0, 'the owner\'s pin'], ['src/server/usage-pool-engine.js', 'create > persistRequestStamp', 0, 1, 'request stamps'],
    ['src/ws-create.js', 'createWsCreateHandler > createBody > onAdopt', 1, 0, 'the claude conversation id after new / fork — a binding'], ['src/ws-create.js', 'createWsCreateHandler > createBody > tryCapture', 1, 0, 'a codex thread id — a binding'],
    ['src/ws-create.js', 'createWsCreateHandler > createBody', 0, 1, 'a new socket\'s FIRST version — written synchronously by construction'],
    ['src/ws-handler.js', 'registerWsHandler > handleMessage', 6, 1, 'durable: the model pick, the lock, the lock\'s target, effort, the response style, the goal — the lock, its target and the style answered after the disk; the pick, effort and the goal told to the CLI at once, a failed write said by the not-durable error frame (round 3: the pick\'s promise had been dropped) · paced: a stale editor record\'s clear'],
  ];
  const AC2 = require(path.join(REPO, 'node_modules/acorn'));
  const META_FILES = [...new Set([...censusFiles(REPO), 'src/ws-handler.js', 'src/ws-create.js', 'src/agent-routes.js', ...fs.readdirSync(path.join(REPO, 'src/server/stdout')).map((f) => 'src/server/stdout/' + f), ...['src/agent-routes', 'src/mount-providers'].flatMap((d) => fs.existsSync(path.join(REPO, d)) ? fs.readdirSync(path.join(REPO, d)).filter((f) => f.endsWith('.js')).map((f) => d + '/' + f) : []), ...fs.readdirSync(path.join(REPO, 'src/routes')).filter((f) => f.endsWith('.js')).map((f) => 'src/routes/' + f)])].filter((f) => fs.existsSync(path.join(REPO, f)));
  const metaSites = (over = {}) => {
    const got = new Map();
    for (const rel of META_FILES) {
      const src = over[rel] !== undefined ? over[rel] : fs.readFileSync(path.join(REPO, rel), 'utf8');
      if (!/writeSessionMeta|patchSessionMeta/.test(src)) continue;
      let ast; try { ast = AC2.parse(src.replace(/^#!.*/, ''), { ecmaVersion: 'latest', allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true, locations: true, sourceType: 'script' }); } catch { continue; }
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
    'src/server/usage-pool-engine.js|create > persistPoolPin': [1, 'the pin — returned to its caller, who answers after it'],
    'src/ws-handler.js|registerWsHandler > handleMessage': [6, 'the lock, its target and the response style answered after the disk; the model pick, effort and the goal told to the CLI at once, a failed write said by the not-durable error frame'],
    'src/server/stdout/acp-events.js|create > attach > noteMode': [1, 'the permission mode — the ack after the disk'],
    'src/server/stdout/claude-stream-json.js|create > attach': [1, 'the person\'s permission mode — the ack after the disk; the ids it adopts and the restated mode are bindings no one waits for'],
    'src/server/boot-restore.js|create > armRestoredCapture > onAdopt': [0, 'a binding at boot — no one waits'], 'src/server/boot-restore.js|create > restoreSessions > recaptureIds': [0, 'a binding at boot — no one waits'],
    'src/server/conversation-ops.js|renameSession': [0, 'the person\'s rename — shown at once, NOT waited for (a failed write is said by writeSessionMeta\'s own warning, never to the person — named, not hidden)'],
    'src/ws-create.js|createWsCreateHandler > createBody > onAdopt': [0, 'a binding — no one waits'], 'src/ws-create.js|createWsCreateHandler > createBody > tryCapture': [0, 'a binding — no one waits'],
    'src/server/stdout/acp-events.js|create > attach': [0, 'an ACP session id — a binding'], 'src/server/stdout/codex-events.js|create > attach': [0, 'a codex thread id — a binding'],
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
  ok(!pm.length, `session-meta: ${gm.size} scopes — ${sumM(2)} writes durable before the answer (bindings, a person's acts), ${sumM(3)} paced (stamps, caches, rings, a first version written synchronously)`, pm.slice(0, 8));
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
  { file: 'src/jobs.js', store: 'jobs.json', state: 'answer', mark: /this\._loadAnswer\(SR\.storeAnswer\(read, \{ valid: STORE_SHAPE \}\)\)/ },
  { file: 'src/jobs.js', store: 'jobs-archive.json', state: 'answer', mark: /this\._archiveAnswer\(SR\.storeAnswer\(read, \{ valid: Array\.isArray \}\)\)/ },
  { file: 'src/task-groups.js', store: 'task-groups.json', state: 'answer', mark: /const a = SR\.storeAnswer\(read\(this\._file\), \{ valid: STORE_SHAPE \}\);/ },   // lane bl-windows 2026-11-18: THE STORE HELD UNREAD (⑨ below)
  // RIGHT WITHOUT THE HELPER (judged by hand, 2026-11-17): a failed read refuses or answers an error; only unparsable bytes are set aside
  { file: 'src/server/integration-store.js', store: 'integrations.json', state: 'right', why: 'a failed read refuses (unreadable()); only a parse/shape failure is archived', mark: /return unreadable\('exists but cannot be read', e\);/ },
  { file: 'src/app-serve.js', store: 'apps manifest.json', state: 'right', why: 'a failed read is an error; only an unparsable manifest is set aside, at the next write', mark: /catch \(e\) \{ if \(e\.code === 'ENOENT'\) return \{ manifest: A\.emptyManifest\(\), error: null \}; return \{/ },
  { file: 'src/job-logs-sweep-worker.js', store: 'jobs-logs-sweep.json', state: 'right', why: 'a failed read makes the pass wait; only unparsable bytes are set aside', mark: /if \(!e \|\| e\.code !== 'ENOENT'\) return \{ error: `the catch-up record could not be read: / },
  { file: 'src/server/writes-lost.js', store: 'writes-lost.json', state: 'right', why: 'a failed read is no answer (readFailed, read again); only bytes that are no store are set aside (`.unreadable-`)', mark: /if \(e\.code !== 'ENOENT'\) return readFailed\(`not read/ },
  { file: 'src/server/queued-wakes.js', store: 'msg-queued.json', state: 'right', why: 'a failed read is held (unread: never written over, read again — B-e3fe); the bytes are set aside (`.unreadable-`) only by the person\'s press (setAside, POST /api/queued-wakes/set-aside), after one more read', mark: /if \(readsNow\) \{ joinHeld\(held\); persist\(\); return \{ ok: true, state: 'none' \}; \}/ },
  { file: 'src/job-logs-sweep.js', store: '(none)', state: 'names', why: 'names the set-aside and note files the clean-up honours; reads no store', mark: /const NOTE_SUFFIX = '\.corrupt-unread';/ },
  // DEBT (B-f276's census, 2026-11-17) — each is converted by the lane that holds its file; then its row flips to `answer` and READ_DEBT_CAP drops
  { file: 'src/channel-store.js', store: 'channels/*.json (loadJsonFamily)', state: 'debt', why: 'sets the LIVE file aside on a failed read', mark: /return setAside\(`unreadable \(\$\{\(e && e\.code\) \|\| \(e && e\.message\)\}\)`\);/ },
  { file: 'src/user-todos.js', store: 'user-todos.json', state: 'debt', why: 'sets the live file aside on a failed read', mark: /if \(!\(e && e\.code === 'ENOENT'\)\) setAside = this\._setAside\(`unreadable/ },
  { file: 'src/server/browser-kept.js', store: 'browser-kept.json', state: 'debt', why: 'sets the live file aside on any failure but ENOENT', mark: /if \(e && e\.code !== 'ENOENT'\) \{[\s\S]{0,600}?fs\.renameSync\(file, aside\)/ },
  { file: 'src/hosts.js', store: 'hosts.json', state: 'answer', mark: /this\._loadAnswer\(SR\.storeAnswer\(read, \{ valid: \(v\) => !!v && typeof v === 'object' && !Array\.isArray\(v\) \}\)\)/ },   // remainder of B-f276 (bl-jobs, 2.369.411): held, never written over
  { file: 'src/machine-mounts.js', store: 'machine-mounts.json', state: 'answer', mark: /this\._loadAnswer\(SR\.storeAnswer\(read, \{ valid: STORE_SHAPE \}\)\);/ },   // remainder of B-f276 (bl-jobs, 2.369.411): held — no save, no legacy ingest, no token sweep
  { file: 'src/server/conversation-deliver.js', store: 'msg-retry.json', state: 'debt', why: 'a failed read is «no file»: the park starts empty and its next write overwrites', mark: /try \{ rawText = fs\.readFileSync\(retryFile, 'utf-8'\); \} catch \{ rawText = null; \}/ },
  { file: 'src/server/usage-pool-engine.js', store: 'reset-credit-tries.json', state: 'debt', why: 'a failed read is «no attempts»: the next write overwrites', mark: /try \{ raw = fs\.readFileSync\(RESET_CREDIT_TRIES_FILE, 'utf8'\); \} catch \{ return 0; \}/ },
  // NAMED WITHOUT A SET-ASIDE (the scan cannot see a store that never sets bytes aside — known ones are rows here): torn or
  // unreadable = empty, the next save overwrites → lane bl-jobs batch 12 (B-6721 holds that store)
  // the browser registry (lane bl-jobs, the B-f276 remainder, its read r1 N9): through the store-read law — a failed read and torn bytes HOLD
  { file: 'src/server/browser-keeper.js', store: 'browser-profiles.json', state: 'answer', mark: /if \(a\.state === 'data'\) \{ rawDoc = a\.value; reg = B\.normalizeRegistry\(rawDoc\); \}/ },   // its read r2 (N16): the LOAD's line (the read again's storeAnswer is a second, unrelated match)
  // lane lg-store-writes (主开发 2026-11-20 03:10Z): the desktop app records and the device alerts' ledger — a failed read or torn bytes HOLD (never started empty)
  { file: 'src/server/device-alerts.js', store: 'device-alerts.json', state: 'answer', mark: /const a = SR\.storeAnswer\(read, \{ valid: LEDGER_VALID \}\);\n    if \(a\.state === 'data'\) seen = a\.value\.seen;/ },
  { file: 'src/desktop-serve.js', store: 'desktop-apps.json', state: 'answer', mark: /const a = SR\.storeAnswer\(read, \{ valid: STORE_VALID \}\);\n    if \(a\.state === 'data'\) \{ store = \{ apps: a\.value\.apps \}; return; \}/ },
  { file: 'src/jobs.js', store: 'job-notifications.json', state: 'debt', why: '_loadNotifs: any failure is an empty map (catch { }) — the next save writes over it', mark: /_loadNotifs\(\) \{\s*try \{\s*const obj = JSON\.parse\(fs\.readFileSync\(this\.notifsFile, 'utf-8'\)\);/ },
];
const READ_DEBT_CAP = 6;     // lower it as each debt row flips to `answer` — never raise it (8 → 7: hosts.json, 7 → 6: machine-mounts.json — bl-jobs B-f276's remainder)
const READ_DEBT_AT_BIRTH = 8;            // the census's first count (2026-11-17): DEBT_CAP never passes it
const STATES = new Set(['answer', 'right', 'names', 'debt']);
const USES_HELPER = /require\(['"](?:\.{1,2}\/)+(?:[\w-]+\/)*store-read(?:\.js)?['"]\)/;

const treeTexts = () => new Map(censusFiles(REPO).map((f) => [f, fs.readFileSync(path.join(REPO, f), 'utf8')]));   // the hub's main-process files (①'s list)
/** the files whose CODE holds a set-aside name (a string or template piece with `.corrupt-` — never a comment) */
const SET_ASIDE = /\.(corrupt|unreadable)-/, SET_ASIDE_G = /\.(corrupt|unreadable)-/g;   // the two names the tree sets bytes aside under
// the set-aside names per file, EXACT — a second store with a set-aside in a file that already has a row is red by its count
const SITES = { 'src/jobs.js': 3, 'src/app-serve.js': 1, 'src/channel-store.js': 1, 'src/hosts.js': 1, 'src/job-logs-sweep-worker.js': 1, 'src/job-logs-sweep.js': 1, 'src/machine-mounts.js': 1, 'src/server/browser-kept.js': 1, 'src/server/conversation-deliver.js': 1, 'src/server/integration-store.js': 1, 'src/server/queued-wakes.js': 1, 'src/server/usage-pool-engine.js': 1, 'src/server/writes-lost.js': 1, 'src/user-todos.js': 1 };
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
ok(c0.length === 1 && /^src\/jobs\.js: 4 set-aside name\(s\) in its code, 3 counted/.test(c0[0]), 'CONTROL: a SECOND store with the old shape in a file that already has rows is red by its count', c0);
const commented = new Map(T); commented.set('src/server/notes.js', "// a store's bytes go to <name>.corrupt-<ts>\n/* '.corrupt-' */\nmodule.exports = {};\n");
ok(census(commented).length === 0, 'CONTROL: a set-aside name in a COMMENT is no store');
// the control's store is DERIVED (the last debt row): each conversion of the remainder moves it on by itself (a hard-coded store
// went stale with the first one); its anchor missing fails by name
const LAST_DEBT = STORE_READS.filter((r) => r.state === 'debt').pop(), lastText = LAST_DEBT && T.get(LAST_DEBT.file), lastHit = lastText && lastText.match(LAST_DEBT.mark);
ok(!!lastHit, `control setup: the anchor of the control «converted» (the marked read line of the last debt row${LAST_DEBT ? ', ' + LAST_DEBT.file + ' ' + LAST_DEBT.store : ' — there is none'}) is in the source`);
const converted = new Map(T); if (lastHit) converted.set(LAST_DEBT.file, lastText.replace(lastHit[0], 'const a = SR.storeAnswer(read);'));
const c2 = census(converted), reEsc = (x) => String(x).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
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
      ok(cnt('src/server/channels-access.js', FACT) === 3 && cnt('src/server/channels-engine.js', FACT) === 2 && cnt('src/server/channels-outbound.js', FACT) === 2 && cnt('src/server/conversation-ops.js', FACT) === 5 && cnt('src/server/delivery-wake.js', FACT) === 1 && cnt('src/server/end-proposals.js', FACT) === 1 && cnt('src/agent-routes.js', FACT_AR) === 2
        && /function wakeAdmits\(res, principal, \{ cid, groups = \[\], groupsUnreadable = false \} = \{\}\)/.test(readSrc('src/server/channels-grants.js')),
        '⑨ …the hub\'s doors that judge a live agent from the roster HAND the fact: the channel principals (channelPrincipal ×2, the engine\'s hear / wake ctx ×2, outbound ×2, access ×1), the two watch wakes, the automation reach\'s targets (conversation-ops ×5: the shared reached() — status, rename, bind, end — and the archive\'s, and — login-request-card\'s cure on .413 checkpoint 2 — the list, the resume of a live and of an ended target; the wake grant\'s owner ×1, the proposal card\'s targets ×1)');
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
          ["src/server/channels-access.js", "{ gen, id: ctx.id, groups: g, n, by: new Map() }", 1, "record"],
          ["src/server/channels-access.js", "{ cid: String(x.cid), groups: Array.isArray(x.grou", 1, "roster"],
          ["src/server/channels-access.js", "{ id: String(a.id), kind: a.kind || '', vendor: a.", 1, "answer"],
          ["src/server/channels-auth.js", "{ flowId: st.flowId, mode: st.mode, running: !!st.", 1, "answer"],
          ["src/server/channels-engine.js", "{ groups: routes.join(',') }", 1, "other"],
          ["src/server/channels-engine.js", "{ adapterLabel: label, scopeLabel, groups, windowM", 1, "answer"],
          ["src/server/channels-engine.js", "{ conversationKey: String(x.cid), groupIds: Array.", 1, "narrows"],
          ["src/server/channels-engine.js", "{ conversationKey: String(cid), groupIds: Array.is", 1, "narrows"],
          ["src/server/channels-wiring.js", "{ channels, groups, touches, flushGroupCards, live", 1, "other"],
          ["src/server/conversation-facts.js", "{ key, ...(key ? {} : { keyWhy: 'the conversation ", 1, "roster"],   // conversations.list's row as LISTED: the two judges that read its groups (the list's reach, the proposal card's) hand the hold's fact themselves
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
          ["src/server/mounts-plugins-wiring.js", "{ conversationId: cid, sessionKey, name, groups }", 1, "roster"],
          ["src/server/roster-pass.js", "{ cid, name: s.name || null, groups, webuiId: id, ", 1, "roster"],
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
          ["src/ws-create.js", "{ groupId: spawnGroups[0], groupIds: spawnGroups.s", 1, "record"],
          ["src/ws-create.js", "{ name: session.name, nameExplicit: session._nameE", 1, "record"],
        ];
        const walkB = (d, out = []) => { for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) { const rel = path.posix.join(d, e.name); if (e.isDirectory()) { if (rel !== 'src/lib' && rel !== 'src/agentd') walkB(rel, out); } else if (e.name.endsWith('.js')) out.push(rel); } return out; };
        const bfiles = () => new Map(['server.js', ...walkB('src')].filter((f) => BFILE.test(f) && f !== 'src/server/grants-migration.js').map((f) => [f, readSrc(f)]));   // grants-migration: its probes compare mappings on purpose (kb)
        const bsites = (files) => {
          const seen = new Map();
          for (const [f, t] of files) {
            const c = TREE_AST.get(f), ast = c && c.src === t ? c.ast : parseOf(t), hits = [...t.matchAll(GKEY_AT)].map((m) => m.index);
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
        ok(!bc.problems.length && BROWS.every((r) => WHY[r[3]] && r[2] > 0), `⑨ follow (2) THE PRINCIPAL BUILDERS: ${bc.sites} object literals with Task Group ids in ${BF.size} hub files — ${bc.facts} hand the hold's fact, ${BROWS.reduce((k, r) => k + r[2], 0)} more each a row saying why none is needed (${Object.keys(WHY).map((c) => `${c} ${BROWS.filter((r) => r[3] === c).reduce((k, r) => k + r[2], 0)}`).join(' · ')})${bc.problems.length ? `\n  ${bc.problems.slice(0, 12).join('\n  ')}` : ''}`);
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
          && loses('src/server/channels-outbound.js', "...(!live && a.groupsUnreadable === true ? { groupsUnreadable: true } : {}), ...require('./groups-hold.js').fact(), msgLevelFor: () => 'none' };", "msgLevelFor: () => 'none' };")
          && loses('src/agent-routes.js', "groups: myGroups, ...(require('./server/groups-hold.js').fact()),", 'groups: myGroups,'),
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
        ok(/if \(require\('\.\/groups-hold\.js'\)\.held\(\) \|\| \(p\.principal && p\.principal\.groupsUnreadable === true\)\) return null;   \/\/ Task Groups held unread, or the card filed while they were/.test(readSrc('src/server/channel-api-cards.js')) && /groups: p\.principal\.groups \|\| \[\], \.\.\.\(p\.principal\.groupsUnreadable === true \? \{ groupsUnreadable: true \} : \{\}\), \.\.\.require\('\.\/groups-hold\.js'\)\.fact\(\) \}\);/.test(readSrc('src/server/channel-api-cards.js')),
          '⑨ follow-owed (3): a recorded proposal\'s card never ENDS «withdrawn» on an unread tier — its liveness answers null while held AND for a card filed while held (its principal\'s own mark rides ctxOf too)');
        { const CO = readSrc('src/server/channels-outbound.js'), WT = readSrc('src/server/window-targets-engine.js');
          ok(/const drafterGroupsOf = \(ctx\) => [^\n]*\.\.\.\(ctx\.groupsUnreadable === true \? \{ drafterGroupsUnreadable: true \} : \{\}\)/.test(CO) && /\.\.\.\(!live && p\.drafterGroupsUnreadable === true \? \{ groupsUnreadable: true \} : \{\}\), \.\.\.require\('\.\/groups-hold\.js'\)\.fact\(\)/.test(CO) && !/groupsOfSession\(String\(d\.id\)\)/.test(CO)
            && /const unread = groupsUnreadable === true \|\| \(!Array\.isArray\(g\) && require\('\.\/groups-hold\.js'\)\.held\(\)\);/.test(CO) && /groupsUnreadable: !live && cur\.drafterGroupsUnreadable === true \}\)/.test(CO)
            && /\.\.\.\(!live && a\.groupsUnreadable === true \? \{ groupsUnreadable: true \} : \{\}\), \.\.\.require\('\.\/groups-hold\.js'\)\.fact\(\)/.test(CO) && /if \(!sees && ctx\.groupsUnreadable === true && !\(entry\.source === 'channel-receipt' && entry\.ref\)\) return \{ text: HELD_STASH_TEXT \};/.test(CO) && /const gk = `\$\{ctx\.groupsUnreadable === true \? '\?' : ''\}/.test(CO)
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
            const SG = new Function('STASH_ABOUT_KEYS_MAX', 'liveSessions', 'msgAclAccount', 'stillSees', 'store', 'P', 'HELD_STASH_TEXT', 'require', 'groupsOfSession', `${fnSrc('function stashGate(cid, entry, memo = null) {')}; return stashGate;`)(64, () => LIVE, () => false, stillSeesS, { outbox: { snapshot: () => ({ proposals: {} }) } }, { withheldReceiptLine: () => 'receipt fate' }, 'HELD BACK', req, () => []);
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
      const ARrel = ARtext ? anchored(ARtext, 'grantMemberIds(tasks, { sessionKey: sessionStatusKey(s, id), cwd: s.cwd, hostId: s.host || null, initialGroupId: s._initialGroupId, initialGroupIds: s._initialGroupIds })', 'tasks.groupsForSession({ sessionKey: sessionStatusKey(s, id), cwd: s.cwd, initialGroupId: s._initialGroupId, initialGroupIds: s._initialGroupIds }).map((g) => g.id)', 'the release reader') : null;   // stale-pins: kept — the control writes the release's reader back on purpose
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
      ok(/return GM\.admits\(\[\{ door: DOORS\.watch, resource: String\(res\), to: own, except: exceptFor\(own\[0\], r\.except\) \}\], \{ conversationKey: String\(cid\), groupIds: groups, \.\.\.\(groupsUnreadable === true \? \{ groupsUnreadable: true \} : \{\}\) \}\)\.ok;/.test(readSrc('src/server/channels-grants.js')), '⑨ …channels-grants wakeAdmits puts the hold IN the facts its admits judges (the call site — its store is not cheap to stand up here)');
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

// ── ⑩ THE MEASURED HOLDS AFTER 2.369.412 (主开发 2026-11-20 03:10Z — the owner's hub, the first hour of the new build: 23 holds of
// 1–3 s, the main thread asleep on the storage in a temp + rename): each site off the loop through the store writer, with what the
// family requires — the HOLD of a store that cannot be read (never written over), the FLUSH at the stop, and the READERS of the file
// that must see a write that has not landed yet. Stand-ins for the storage (an fs error thrown for that one file, a writer that
// records), the real modules; bytes compared, no clock.
console.log('⑩ the measured holds after 2.369.412: each site off the loop, with its hold, its flush and its readers');
{
  const { scratchDir, anchored } = await import('./scratch.mjs');
  const { mutantCopies } = await import('./mutant-copy.mjs');
  const readSrc = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
  const roots = [];
  const failingRead = (file, code, fn) => { const rf = fs.readFileSync; fs.readFileSync = function (f, ...a) { if (String(f) === file) throw Object.assign(new Error(`${code}: a stand-in i/o error`), { code }); return rf.call(this, f, ...a); }; try { return fn(); } finally { fs.readFileSync = rf; } };
  const recordingWriter = () => { const st = { dirty: [], flushed: [] }; return { st, W: { dirty: (f, o) => { st.dirty.push({ f, o }); }, flushSync: (files) => { st.flushed.push(files); return { written: [], left: [] }; }, pending: () => false } }; };
  try {
    // (a) src/desktop-serve.js — the desktop app records (data/desktop-apps.json; 3 of the 23)
    {
      const DSRC = readSrc('src/desktop-serve.js'), DD = require(path.join(REPO, 'src/desktop-display.js'));
      const quietDs = { log() { }, warn() { }, error() { } };
      const noApps = { catalogRows: () => [], refreshCatalog: async () => { }, witnessRows: () => [] };
      const SEED = JSON.stringify({ apps: { 'da-1': { id: 'da-1', state: 'stopped', appId: 'x' } } });
      const SAVE_G = "    if (held) { if (!heldSaveSaid) { heldSaveSaid = true; log.warn?.(`[desktop] a ${STORE_FILE} write was refused: ${heldWords()}`); } return false; }\n";
      const PROD_G = "const storeBytes = () => { if (held) throw";
      const HOLD_G = "    holdStore(a);   // unreadable, or bytes that are not the store: HELD (never started empty over it)\n";
      ok([SAVE_G, PROD_G, HOLD_G].every((x) => DSRC.split(x).length === 2), 'control setup: the record file\'s save guard, producer guard and hold are found once each in desktop-serve.js');
      const install = (Mod, d, W) => Mod.install({ dataDir: d, env: () => ({ HOME: d, PATH: process.env.PATH }), display: { ...DD }, registryRows: [], log: quietDs, now: Date.now, tickMs: 3600e3, apps: noApps, writer: W, unreadRetry: { firstMs: 15, maxMs: 30 } });
      const scene = async (Mod, name, { lift = true } = {}) => {
        const d = scratchDir('ds-held-' + name); roots.push(d); const F = path.join(d, 'desktop-apps.json'); fs.writeFileSync(F, SEED);
        const { st, W } = recordingWriter();
        const ds = failingRead(F, 'EIO', () => install(Mod, d, W));
        const out = { held0: ds.held() };
        if (out.held0) { try { await ds.launch({ appId: 'x' }); out.launch = 'ran'; } catch (e) { out.launch = e && e.code; } } else out.launch = 'not asked (not held: a launch would probe the machine)';
        try { ds.reshapeStore(() => 1); out.reshape = 'ran'; } catch (e) { out.reshape = e && e.code; }
        ds.markDirty(); ds.commit();   // a tick's commit while held (the hub marks rows it owns)
        out.queuedWhileHeld = st.dirty.length;
        out.heldBytes = st.dirty.map((x) => { try { return x.o.produce(); } catch (e) { return e.code; } });
        out.bytesKept = fs.readFileSync(F, 'utf8') === SEED;
        if (lift) {
          for (let i = 0; i < 200 && ds.held(); i++) await new Promise((r) => setTimeout(r, 10));
          out.lifted = !ds.held();
          out.records = out.lifted ? ds.reshapeStore((s0) => Object.keys(s0.apps).join(',')) : null;
          const last = st.dirty[st.dirty.length - 1];
          out.queued = last ? { name: last.o.name, rank: last.o.rank, urgent: last.o.urgent, bytes: JSON.parse(last.o.produce()) } : null;
          out.fileAtCall = fs.readFileSync(F, 'utf8') === SEED;   // the writer's, not the call's: nothing written here
        }
        ds.shutdown();
        out.flushed = st.flushed.some((fl) => Array.isArray(fl) && fl.includes(F));
        return out;
      };
      const r = await scene(require(path.join(REPO, 'src/desktop-serve.js')), 'real');
      ok(r.held0 && r.launch === 'desktop_apps_unread' && r.reshape === 'desktop_apps_unread' && r.queuedWhileHeld === 0 && r.bytesKept, '⑩a desktop-apps.json that could not be read (EIO): HELD — a launch and a migration refused BY NAME, a commit writes nothing, the bytes untouched (the release started EMPTY and wrote that over the file)', r);
      ok(r.lifted && r.records === 'da-1' && r.queued && r.queued.name === 'desktop-apps.write' && r.queued.rank === 0 && r.queued.urgent === true && r.queued.bytes.apps && r.queued.bytes.apps['da-1'] && r.fileAtCall && r.flushed, '⑩a …read again off the loop: the hold lifts, its records are back; a commit hands the bytes to the STORE WRITER (rank 0, urgent — nothing written at the call), and the stop lands what is owed', r);
      // the producer ALONE keeps the held file (the save's own guard cut, in a copy): the queued write refuses at its write (EHELD)
      const p1 = await scene(mutantCopies('swc-ds-save-cut', REPO).load('src/desktop-serve.js', anchored(DSRC, SAVE_G, '    /* MUTANT: no save guard */\n', 'ds-save-cut'), 'ds-save-cut'), 'save-cut', { lift: false });
      ok(p1.queuedWhileHeld > 0 && p1.heldBytes.every((b) => b === 'EHELD'), '⑩a the record file\'s PRODUCER refuses while held too: with the save\'s guard cut, a queued write makes no bytes (EHELD) — never the empty store', p1);
      const x1 = await scene(mutantCopies('swc-ds-hold-cut', REPO).load('src/desktop-serve.js', anchored(DSRC, HOLD_G, '    /* MUTANT: the release — an unreadable file starts EMPTY */\n', 'ds-hold-cut'), 'ds-hold-cut'), 'hold-cut', { lift: false });
      ok(!x1.held0 && x1.heldBytes.some((b) => typeof b === 'string' && JSON.parse(b).apps && !Object.keys(JSON.parse(b).apps).length), 'CONTROL (the hold cut, in a copy — the release): the unreadable file starts EMPTY and its first commit hands the EMPTY store to the writer, over the file — RED', x1);
      const x2 = await scene(mutantCopies('swc-ds-guards-cut', REPO).load('src/desktop-serve.js', anchored(anchored(DSRC, SAVE_G, '    /* MUTANT: no save guard */\n', 'ds-save-cut2'), PROD_G, 'const storeBytes = () => { if (false) throw', 'ds-prod-cut'), 'ds-guards-cut'), 'guards-cut', { lift: false });
      ok(x2.held0 && x2.heldBytes.some((b) => typeof b === 'string' && !Object.keys(JSON.parse(b).apps).length), 'CONTROL (both guards cut, in a copy): a commit while held makes the EMPTY store\'s bytes for the writer — RED', x2);
      // the hub's keeper hands its writer in (the device agent hands none: it writes at the call, off the hub's loop)
      ok(/writer: writer === undefined \? require\('\.\.\/store-writer\.js'\)\.storeWriter\(\) : writer,/.test(readSrc('src/server/desktop-app-keeper.js')), '⑩a the hub\'s keeper hands the process\'s store writer to the machine half (a suite may hand its own)');
    }
    // (b) src/server/device-alerts.js — the device alerts' dedup ledger (data/device-alerts.json; 1 of the 23)
    {
      const DASRC = readSrc('src/server/device-alerts.js');
      const HOLD_A = "    else if (a.state !== 'missing') holdLedger(a);   // a missing file is the first run; anything else HOLDS\n";
      const PROD_A = "  const produce = () => { if (held) throw";
      ok([HOLD_A, PROD_A].every((x) => DASRC.split(x).length === 2), 'control setup: the ledger\'s hold and its producer guard are found once each in device-alerts.js');
      const SEEN = JSON.stringify({ version: 1, seen: { 'pair:dev-old:1': 1 } });
      const scene = async (Mod, name, { lift = true } = {}) => {
        const d = scratchDir('da-held-' + name); roots.push(d); const F = path.join(d, 'device-alerts.json'); fs.writeFileSync(F, SEEN);
        const { st, W } = recordingWriter(); const filed = [];
        const todos = { add: (k, it) => { filed.push(it.text); return { id: 'u' + filed.length }; } };
        const da = failingRead(F, 'EIO', () => Mod.create({ userTodos: todos, dataDir: d, log: () => { }, writer: W, unreadRetry: { firstMs: 15, maxMs: 30 } }));
        const out = { held0: da.held ? da.held() : false };
        const r1 = da.file('pairing-minted', { machine: 'm1', deviceId: 'dev-new', generation: 1, by: 'userL', from: '10.0.0.9' });
        out.filedWhileHeld = !!(r1 && r1.filed) && filed.length === 1;
        out.queuedWhileHeld = st.dirty.length;
        out.heldBytes = st.dirty.map((x) => { try { return JSON.parse(x.o.produce()); } catch (e) { return e.code; } });
        out.bytesKept = fs.readFileSync(F, 'utf8') === SEEN;
        if (lift) {
          for (let i = 0; i < 200 && da.held(); i++) await new Promise((r) => setTimeout(r, 10));
          out.lifted = !da.held();
          const last = st.dirty[st.dirty.length - 1];
          out.written = last ? { name: last.o.name, mode: last.o.mode, keys: Object.keys(JSON.parse(last.o.produce()).seen).sort().join(',') } : null;
          out.fileAtCall = fs.readFileSync(F, 'utf8') === SEEN;
        }
        return out;
      };
      const r = await scene(require(path.join(REPO, 'src/server/device-alerts.js')), 'real');
      ok(r.held0 && r.filedWhileHeld && r.queuedWhileHeld === 0 && r.bytesKept, '⑩b device-alerts.json that could not be read (EIO): HELD — an alert is STILL FILED (a security event is never kept from the person), the ledger written over by nothing (the release read it as «first run» and wrote an EMPTY ledger over it)', r);
      ok(r.lifted && r.written && r.written.name === 'device-alerts.write' && r.written.mode === 0o600 && r.written.keys === 'pair:dev-new:1,pair:dev-old:1' && r.fileAtCall, '⑩b …read again off the loop: the file\'s keys and the one filed meanwhile MERGED and handed to the store writer (mode 0600 — nothing written at the call)', r);
      const x = await scene(mutantCopies('swc-da-hold-cut', REPO).load('src/server/device-alerts.js', anchored(DASRC, HOLD_A, '    /* MUTANT: the release — a failed read is the first run */\n', 'da-hold-cut'), 'da-hold-cut'), 'hold-cut', { lift: false });
      ok(!x.held0 && x.heldBytes.some((b) => b && b.seen && !b.seen['pair:dev-old:1']), 'CONTROL (the hold cut, in a copy — the release): the unreadable ledger starts EMPTY and the first filing hands that ledger to the writer, over the file — every alert it told is told again (red)', x);
    }
    // (c) src/server/decision-engine.js — the month's journal tail (Settings › Spending's readout; 1 of the 23): A READ THAT CAN WAIT
    // ON STORAGE IS NOT MADE ON THE MAIN THREAD — after the engine's start (whose day-counter rebuild keeps its read at the call: once,
    // before any call can spend — B-a85f), a status opens NO byte of the journal on the loop; the month arrives off the loop.
    {
      const DESRC = readSrc('src/server/decision-engine.js');
      const OFF_A = "      monthP = journalTailOffLoop()\n";
      ok(DESRC.split(OFF_A).length === 2, 'control setup: the month\'s off-loop read is found once in decision-engine.js');
      const scene = async (Mod, name) => {
        const d = scratchDir('de-tail-' + name); roots.push(d);
        const J = path.join(d, 'decision-journal.jsonl'); fs.writeFileSync(J, JSON.stringify({ at: Date.now(), usd: 0.25, outcome: 'ok', use: 'x' }) + '\n');
        const { W } = recordingWriter();
        let clock = Date.now();
        const eng = Mod.create({ dataDir: d, log: { log() { }, warn() { } }, writer: W, now: () => clock });
        await new Promise((r) => setTimeout(r, 30)); clock += 61000;   // past the start's own read and its 60 s memo: the next status refreshes
        const os0 = fs.openSync; let syncOpens = 0;
        fs.openSync = function (f, ...a) { if (String(f) === J) syncOpens++; return os0.call(this, f, ...a); };
        let month = null;
        try { for (let i = 0; i < 200 && !(month = eng.status().month); i++) await new Promise((r) => setTimeout(r, 10)); }
        finally { fs.openSync = os0; }
        return { syncOpens, usd: month ? month.usd : null };
      };
      const r = await scene(require(path.join(REPO, 'src/server/decision-engine.js')), 'real');
      ok(r.syncOpens === 0 && r.usd === 0.25, '⑩c the month so far: a status opens NO byte of the journal on the loop — the figure (0.25) arrives from a read OFF the loop', r);
      const x = await scene(mutantCopies('swc-de-tail', REPO).load('src/server/decision-engine.js', anchored(DESRC, OFF_A, "      monthP = Promise.resolve(journalTail())   // MUTANT: the release — the tail read at the call\n", 'de-sync-tail'), 'de-sync-tail'), 'sync-tail');
      ok(x.syncOpens >= 1, 'CONTROL (the release\'s read, in a copy): a status reads the journal\'s 2 MB tail ON the loop (red)', x);
    }
  } finally { for (const d of roots) fs.rmSync(d, { recursive: true, force: true }); }
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
