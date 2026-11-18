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
const SCOPED = { 'src/server/session-stdout.js': ['writeSessionMeta'], 'src/jobs.js': ['JobManager._logsHeldFile', 'JobManager._logsNoteAtExit'],
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
const DEBT_MAX = 870;   // lane lg-providers U1 cure (restack on int411): −1 — src/server/provider-store.js's write moved onto the store writer (its debt row gone) ⇒ 871 − 1 = 870; int411 seam (2026-11-18, both falls kept by arithmetic: 881 − 8 − 2 = 871) — the two lines above: −8; B-3767 unit 2 (restack 2.369.411): −2 — the codex zst cache's and HostManager's ssh control folder's own mkdirSync left their files (the one ensureSocketDir site is src/sock-path.js's row); was 881. Before: int410 seam (rule 2, 2026-11-18): both falls kept (893 − 10 − 2 = 881) — lane bl-windows batch-4 cure: −2 — the layout-history prune's two unlinks went async (persistence.js 28 → 26); then lane lg-store-writes U3 (B-0248): −2 — src/channel-store.js's wake-pace and dispatch ledgers through owe() (paceFlush / dispatchFlush rows gone); U2: −2 — src/turn-carry.js's outstanding table handed to the writer (its row gone); U1: −6 — src/server/decision-engine.js's memo and day's counter handed to the writer (its writeJsonAtomic ×4 + the helper's write and rename); was 893. Was 516 — lane job-logs-sweep r3: −2 — jobs.js's two load-failure set-aside renames moved into JobManager._logsHeldFile, a durable row (the failed load's fact on disk); on .397's 518 (hub-sync-holds −2) ⇒ 516
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
  ["src/desktop-serve.js","*",14,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
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
  ["src/routes/files.js","*",19,"not-a-store","—","—","a person's own files (the file explorer)"],
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
  ["src/server/device-alerts.js","*",2,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
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
  ["src/server/otel-ingest.js","*",5,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/plugin-install.js","*",14,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/plugin-loader.js","*",8,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/provider-spawn.js","*",2,"durable","—","NOT idempotent: authority / a credential — a login file left in the child's home is a sign-in it could spend","lane lg-providers U2: a third-party provider's own home (data/provider-homes/<id>/<harness>, 0700) made and its login file removed BEFORE the child spawns — the spawn reads it at once"],
  ["src/server/published-pages.js","*",11,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/session-stdout.js","*",7,"debt","—","—","a store's synchronous write on the main thread — onto the store writer when its store is next touched"],
  ["src/server/session-stdout.js","writeSessionMeta",3,"durable","boot-restore, browser-env, usage-routes, channels liveness, weekly-lanes-unfold, reading-repair (each reads the files itself)","NOT idempotent: a live socket without its meta is restored as a stranger","a session's FIRST meta (a new socket) — its UPDATES go through the store writer"],
  ["src/server/spend-guard.js","*",3,"durable","—","NOT idempotent: money / authority / a credential","the unattended-spend budget + its journal (money) — must be on disk before the answer"],
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
function scan(repo) {
  const out = [], files = censusFiles(repo), parsed = new Map(), helperDefs = new Map();
  for (const f of files) {
    let r; try { r = fileSites(fs.readFileSync(path.join(repo, f), 'utf8'), f); } catch { continue; }
    parsed.set(f, r);
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
  ok(/storeWriter\(\)\.dirty\(fp, \{ name: 'session-meta\.write'/.test(ss) && /if \(!sync && !knownOnDisk\(META_DIR, fp\)\)/.test(ss), 'session-meta: its UPDATES through the writer; only a meta that does not exist ON DISK yet (a socket being born — round 3, law 3) is written synchronously (the durable row)');
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
    ['src/hosts.js', 1, 'flushThrottled() — hosts.json on disk before the shutdown hands over (server.js) and before a suite reads the file (B-48a4: every save of hosts.json goes through the store writer); one small whole-file write (the machines\' records, KBs), the write in flight first'],
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
    [E, 'create > wakeNow', 2, 0, 'MONEY: the wake\'s final row; the carried hits it took'], [E, 'create > flushScopeNow', 1, 1, 'the digest\'s delivery (durable) · its refusal stamp (paced)'],
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
    ['src/server/usage-pool-engine.js', 'create > persistStoppedBy', 0, 1, 'why a session stopped (lane auto-resume-bulk) — a mark the next turn end restates or clears'],
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
      if (!/writeSessionMeta/.test(src)) continue;
      let ast; try { ast = AC2.parse(src.replace(/^#!.*/, ''), { ecmaVersion: 'latest', allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true, locations: true, sourceType: 'script' }); } catch { continue; }
      walk(ast, (n, parents) => {
        if (n.type !== 'CallExpression') return;
        const nm = n.callee.type === 'Identifier' ? n.callee.name : n.callee.type === 'MemberExpression' && !n.callee.computed ? n.callee.property.name : null;
        if (nm !== 'writeSessionMeta') return;
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
  // RIGHT WITHOUT THE HELPER (judged by hand, 2026-11-17): a failed read refuses or answers an error; only unparsable bytes are set aside
  { file: 'src/server/integration-store.js', store: 'integrations.json', state: 'right', why: 'a failed read refuses (unreadable()); only a parse/shape failure is archived', mark: /return unreadable\('exists but cannot be read', e\);/ },
  { file: 'src/app-serve.js', store: 'apps manifest.json', state: 'right', why: 'a failed read is an error; only an unparsable manifest is set aside, at the next write', mark: /catch \(e\) \{ if \(e\.code === 'ENOENT'\) return \{ manifest: A\.emptyManifest\(\), error: null \}; return \{/ },
  { file: 'src/job-logs-sweep-worker.js', store: 'jobs-logs-sweep.json', state: 'right', why: 'a failed read makes the pass wait; only unparsable bytes are set aside', mark: /if \(!e \|\| e\.code !== 'ENOENT'\) return \{ error: `the catch-up record could not be read: / },
  { file: 'src/server/writes-lost.js', store: 'writes-lost.json', state: 'right', why: 'a failed read is no answer (readFailed, read again); only bytes that are no store are set aside (`.unreadable-`)', mark: /if \(e\.code !== 'ENOENT'\) return readFailed\(`not read/ },
  { file: 'src/job-logs-sweep.js', store: '(none)', state: 'names', why: 'names the set-aside and note files the clean-up honours; reads no store', mark: /const NOTE_SUFFIX = '\.corrupt-unread';/ },
  // DEBT (B-f276's census, 2026-11-17) — each is converted by the lane that holds its file; then its row flips to `answer` and READ_DEBT_CAP drops
  { file: 'src/channel-store.js', store: 'channels/*.json (loadJsonFamily)', state: 'debt', why: 'sets the LIVE file aside on a failed read', mark: /return setAside\(`unreadable \(\$\{\(e && e\.code\) \|\| \(e && e\.message\)\}\)`\);/ },
  { file: 'src/user-todos.js', store: 'user-todos.json', state: 'debt', why: 'sets the live file aside on a failed read', mark: /if \(!\(e && e\.code === 'ENOENT'\)\) setAside = this\._setAside\(`unreadable/ },
  { file: 'src/server/browser-kept.js', store: 'browser-kept.json', state: 'debt', why: 'sets the live file aside on any failure but ENOENT', mark: /if \(e && e\.code !== 'ENOENT'\) \{[\s\S]{0,600}?fs\.renameSync\(file, aside\)/ },
  { file: 'src/hosts.js', store: 'hosts.json', state: 'debt', why: 'a failed read starts EMPTY (the copy aside cannot read it either) — the next save writes over hosts.json', mark: /try \{ this\._state = JSON\.parse\(fs\.readFileSync\(this\._file, 'utf-8'\)\); \}\s*catch \{/ },
  { file: 'src/machine-mounts.js', store: 'machine-mounts.json', state: 'debt', why: 'a failed read starts EMPTY — the next save writes over machine-mounts.json', mark: /try \{ this\._state = JSON\.parse\(fs\.readFileSync\(this\._file, 'utf-8'\)\); \}\s*catch \{/ },
  { file: 'src/server/conversation-deliver.js', store: 'msg-retry.json', state: 'debt', why: 'a failed read is «no file»: the park starts empty and its next write overwrites', mark: /try \{ rawText = fs\.readFileSync\(retryFile, 'utf-8'\); \} catch \{ rawText = null; \}/ },
  { file: 'src/server/usage-pool-engine.js', store: 'reset-credit-tries.json', state: 'debt', why: 'a failed read is «no attempts»: the next write overwrites', mark: /try \{ raw = fs\.readFileSync\(RESET_CREDIT_TRIES_FILE, 'utf8'\); \} catch \{ return 0; \}/ },
  // NAMED WITHOUT A SET-ASIDE (the scan cannot see a store that never sets bytes aside — known ones are rows here): torn or
  // unreadable = empty, the next save overwrites → lane bl-jobs batch 12 (B-6721 holds that store)
  { file: 'src/jobs.js', store: 'job-notifications.json', state: 'debt', why: '_loadNotifs: any failure is an empty map (catch { }) — the next save writes over it', mark: /_loadNotifs\(\) \{\s*try \{\s*const obj = JSON\.parse\(fs\.readFileSync\(this\.notifsFile, 'utf-8'\)\);/ },
];
const READ_DEBT_CAP = 8;     // lower it as each debt row flips to `answer` — never raise it
const READ_DEBT_AT_BIRTH = 8;            // the census's first count (2026-11-17): DEBT_CAP never passes it
const STATES = new Set(['answer', 'right', 'names', 'debt']);
const USES_HELPER = /require\(['"](?:\.{1,2}\/)+(?:[\w-]+\/)*store-read(?:\.js)?['"]\)/;

const treeTexts = () => new Map(censusFiles(REPO).map((f) => [f, fs.readFileSync(path.join(REPO, f), 'utf8')]));   // the hub's main-process files (①'s list)
/** the files whose CODE holds a set-aside name (a string or template piece with `.corrupt-` — never a comment) */
const SET_ASIDE = /\.(corrupt|unreadable)-/, SET_ASIDE_G = /\.(corrupt|unreadable)-/g;   // the two names the tree sets bytes aside under
// the set-aside names per file, EXACT — a second store with a set-aside in a file that already has a row is red by its count
const SITES = { 'src/jobs.js': 3, 'src/app-serve.js': 1, 'src/channel-store.js': 1, 'src/hosts.js': 1, 'src/job-logs-sweep-worker.js': 1, 'src/job-logs-sweep.js': 1, 'src/machine-mounts.js': 1, 'src/server/browser-kept.js': 1, 'src/server/conversation-deliver.js': 1, 'src/server/integration-store.js': 1, 'src/server/usage-pool-engine.js': 1, 'src/server/writes-lost.js': 1, 'src/user-todos.js': 1 };
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
const converted = new Map(T); converted.set('src/hosts.js', T.get('src/hosts.js').replace(/try \{ this\._state = JSON\.parse\(fs\.readFileSync\(this\._file, 'utf-8'\)\); \}\s*catch \{/, "const a = SR.storeAnswer(read);\n    if (a.state === 'unreadable') {"));
const c2 = census(converted);
ok(c2.length === 1 && /^src\/hosts\.js hosts\.json: its marked read line is not there — if the line was only REWORDED, re-pin the row's mark to the new text \(nothing else\); only if the store reads through storeAnswer now, flip the row to 'answer'.*lower READ_DEBT_CAP/.test(c2[0]), 'CONTROL: a debt row whose marked line changed is red — its words say RE-PIN first (a reword), flip + lower the cap only for a converted store', c2);
const lost = new Map(T); lost.set('src/jobs.js', T.get('src/jobs.js').replace('this._loadAnswer(SR.storeAnswer(read, { valid: STORE_SHAPE }));', 'this._loadAnswer(JSON.parse(read.text));'));
const c3 = census(lost);
ok(c3.length === 1 && /^src\/jobs\.js jobs\.json: its storeAnswer call is no longer there/.test(c3[0]), 'CONTROL: a converted store that stops reading through storeAnswer is red', c3);
const more = [...STORE_READS, { file: 'src/hosts.js', store: 'hosts-extra.json', state: 'debt', why: 'x', mark: /./ }];
const c4 = census(T, more);
ok(c4.length === 1 && /^DEBT: 9 debt rows against READ_DEBT_CAP 8/.test(c4[0]) && census(T, more, 9).some((p) => /above the census's first count 8/.test(p)), 'CONTROL: a NEW debt row is refused, and so is raising the cap past its first count', c4);
const noReq = new Map(T); noReq.set('src/jobs.js', T.get('src/jobs.js').replace(/require\('\.\/store-read\.js'\)/, "require('./store-reader.js')"));
ok(census(noReq).some((p) => /^src\/jobs\.js jobs\.json: an 'answer' row whose file does not require src\/store-read\.js/.test(p)), 'CONTROL: an answer row\'s file must require the helper');

}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
