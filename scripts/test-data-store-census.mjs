#!/usr/bin/env node
// test-data-store-census — EVERY STORE FILE OF THE DATA FOLDER, ITS READ JUDGED (主开发 r3007, lane bl-machines-b). FAST, PURE
// (a text scan of server.js and src/). THE LAW (src/store-read.js, B-f276): a store's read tells MISSING (ENOENT, the only
// «empty») from UNREADABLE, CORRUPT and DATA. A store whose failed or torn read is taken as «empty» is WRITTEN OVER by its next
// ordinary save, and what it held is gone. Each store file is ONE ROW (a family of one file per item: one row): its module, the
// ANCHOR of its read (the read's line, and the line that answers its failure when that is another line, within ANSWER_WITHIN
// lines below it), a FINGERPRINT of the read's block for a held, derived or written-over row, and its verdict today:
//   UNDER THE LAW  the read goes through storeAnswer (src/store-read.js) or a store hold (src/store-hold.js)
//   ITS OWN HOLD   its own code holds the store on a failed read and never writes over it (torn bytes may be kept aside and
//                  started fresh, as the law does); a `gap`, where it has one, is named with the lane that holds its cure
//   DERIVED        rebuilt from another source: nothing a person made is lost
//   WRITTEN OVER   a failed or torn read reads as empty and the next save writes the file over; the row names the lane that holds
//                  its cure («not routed yet» until the coordinator routes it)
//   NOT A STORE    never read back to decide anything and never written over from a read (a report, an audit trail, a lock, a
//                  pid, a marker): named so the net does not ask again
//   GONE           the tree no longer has the store: no anchor, and no file of server.js or src/ names it
//   ① every row's anchor is in its module EXACTLY ONCE, and a fingerprinted row's `fp` (the read's BLOCK — its line through the
//      end of the statement that answers its failure, braces counted from that catch or answer — sha256, 12 hex) is the
//      block's today. A read that changed reds its row, the lines between them too (r3006 rewrote browser-kept's catch body under
//      unchanged read and catch lines), so each cure moves its own row: its anchor, its verdict, its fp. A row that shares its
//      read with others (one reader for a family) also pins the line that BINDS its name to that reader (`bound`)
//   ② the verdicts: a known word and a why; an UNDER THE LAW anchor reads through the law and no other row's does; a written-over
//      row or a gap names its lane, a row with nothing to cure names none; one row a store
//   ③ THE NET: every file the data folder's code joins has a row (a NEW store file without one is red, by name): a join whose
//      first part is a data folder (`<…dataDir>`), whose later part is a `'data'` folder, or whose first part is a name kept
//      from such a join (`const dir = path.join(dataDir, 'channels')`, within VAR_REACH lines below it); its parts quoted, the last one quoted or a constant
//      (its own module's, or the module `const X = require('…')` names). A file = a name with an extension, or a dot file
//   ④ THE RATCHET: the stores written over at the census's birth (WRITTEN_OVER_AT_BIRTH: each with its read and fp, signed) are
//      the only ones that may be written over. A store outside it is never WRITTEN OVER (red: hold its read before it lands); a
//      cured one keeps `was: 'WRITTEN OVER'` and is never written over again; and a birth store moves off WRITTEN OVER only with
//      its cure — its birth read still there with the birth's fp is red. The count only falls, and no cure edits a line another
//      cure edits (no shared number)
//   ⑤ RED CONTROLS, on PLANTED modules and rows (they never depend on a real row still being written over): a store on each road
//      of the net, a read that moved, found twice, its answer changed, a change inside its block, a binding gone, an unknown
//      verdict, a written-over row with no lane or fp, a law row off the law, a held row on it, a new written-over store, a
//      cured one back, a cure without its mark, a verdict moved by an edit, a birth row gone, a GONE row still named
//   ⑥ THE REMOVER CENSUS (主开发 r3086): every .js file of server.js and src/ (the device agent's own side out) with a file
//      deletion call (a sync form, any `.rm|unlink|rmdir(` — an alias of fs.promises, a require() result included — or a call of the tree's own
//      deleting helpers) is a row with its exact count — a new call, or a file with its first, is red by name until it is judged
//      (the count asks for the judgement, it cannot make it; the count is of text, a quoted call counts); and every
//      remover whose keep list is a store is a row (its anchor, its fp, the stores it keeps, its verdict today: READS EMPTY — a
//      failed or torn read answers its empty memory and the remover deletes on it, the lane that holds its cure named — or ASKS —
//      told «unknown», or its keep never reads empty). The READS EMPTY rows are a ratchet as ④ is: a signed birth, a was mark, a
//      move only with its cure. Removers are keyed by name, each name once in the census (a row may move to the module where
//      its cure asks: the keep list's maker, not the file call's). Its limit: a remover that deletes rows or revokes tokens
//      without a file call, a removal by a child process (the mounts module runs one) or by renaming aside is a row by its
//      anchor, but a NEW one of those kinds is not seen by the count
// ITS LIMITS, stated: a name built from parts (a template, a helper like `file(n)`, a `this.x` folder, a join whose arguments
// hold a call — `path.join(this.dirOf(id), 'x.json')`, the accounts' per-account folder), a file with no extension
// that is no dot file, and a kept name re-bound by anything but a join are not in the net (their stores are rows by hand).
// data/bin/ is out of the net: git tracks it (programs, never a store). One row a store: its own reader; a second reader of
// the same file is that row's why. A hold kept outside the read's block (a caller that catches, a writer that refuses
// elsewhere) is its row's why, not pinned. The ratchet lives in this file: an edit of the birth needs its signature edited too
// — deliberate, never silent; a store written over at the birth and found later joins the birth with its read and fp in the
// commit that finds it, re-signed, its row saying so (found later); a cured row's way back needs its was mark taken off.
// THE RATCHET's LIMIT (主开发 r3202): a text scan cannot see behaviour. The ratchet catches a verdict moved over an UNCHANGED
// birth read; a changed block or a row anchored again is taken on its word, and the cure's own review reads the move. A law
// row's anchor is meant as the live call of the law's answer or a store hold, never a comment — not checked here (the law's
// words also match a comment): the review reads it.
// Run: node scripts/test-data-store-census.mjs
import './scratch.mjs';   // FIRST (B-ba47 B2): the re-home comes before any other code
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { wholeDetail } from './lib/check.mjs';   // r3928: a failing line's list printed whole, one item a line

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (typeof c !== 'boolean') throw new TypeError(`ok() was handed a ${typeof c} as its condition (arguments swapped, or not a verdict): ${n}`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? wholeDetail(d) : '')); } };

const U = 'UNDER THE LAW', H = 'ITS OWN HOLD', D = 'DERIVED', X = 'WRITTEN OVER', N = 'NOT A STORE', G = 'GONE';
const VERDICTS = Object.freeze([U, H, D, X, N, G]);
const ANSWER_WITHIN = 25;   // the failure's answer is at most this many lines below the read
const BLOCK_MAX = 60;       // a block never closed within this many lines ends there
const NOT_ROUTED = 'not routed yet';
const VAR_REACH = 40;       // a name kept from a data join resolves at most this many lines below it

// THE ROWS — { store, module, read: [the read's line, (its failure's answer)], verdict, fp?, bound?: [module, line], lane?, gap?,
// was?, why }. A store in a fixed subfolder carries it (channels/…); a family carries its item as <id>.
const ROWS = Object.freeze([
  // ── UNDER THE LAW ──
  { store: 'jobs.json', module: 'src/jobs.js', read: ['this._loadAnswer(SR.storeAnswer(read, { valid: STORE_SHAPE }))'], verdict: U, why: 'held: every write refused by name until a read again lands' },
  { store: 'jobs-archive.json', module: 'src/jobs.js', read: ['this._archiveAnswer(SR.storeAnswer(read, { valid: Array.isArray }))'], verdict: U, why: 'held with the jobs store' },
  { store: 'job-notifications.json', module: 'src/jobs.js', read: ['this._notifsAnswer(SR.storeAnswer(read, { valid: NOTIFS_SHAPE }));'], verdict: U, why: 'held: no notice written over it' },
  { store: 'hosts.json', module: 'src/hosts.js', read: ['const a = SR.storeAnswer(read, { valid: HOSTS_SHAPE });'], verdict: U, why: 'held (2b: on the family helper): the person-facing writes refuse by name' },
  { store: 'machine-mounts.json', module: 'src/machine-mounts.js', read: ['const a0 = SR.storeAnswer(read, { valid: STORE_SHAPE });'], verdict: U, why: 'held (2b: on the family helper): no write over a store not read' },
  { store: 'task-groups.json', module: 'src/task-groups.js', read: ['const a = SR.storeAnswer(read(this._file), { valid: STORE_SHAPE });'], verdict: U, why: 'held unread: no write until it reads' },
  { store: 'tasks.json', module: 'src/task-groups.js', read: ['const l = SR.storeAnswer(read(this._legacyFile), { valid: STORE_SHAPE });'], verdict: U, why: 'the legacy file, held' },
  { store: 'user-todos.json', module: 'src/user-todos.js', read: ['const a0 = SR.storeAnswer(this._readNow(), { valid: STORE_SHAPE });'], verdict: U, why: 'held unread; every write refused by name' },
  { store: 'reset-credit-tries.json', module: 'src/server/usage-pool-engine.js', read: ['let a = SR.storeAnswer(read, { valid: TRIES_VALID });'], verdict: U, why: 'held: no credit is used on a guess' },
  { store: 'browser-profiles.json', module: 'src/server/browser-keeper.js', read: ['const a = SR.storeAnswer(read, { valid: REG_VALID });', 'if (a.state === \'data\') { rawDoc = a.value; reg = B.normalizeRegistry(rawDoc); }'], verdict: U, why: 'held: an empty registry would delete folders' },
  { store: 'device-alerts.json', module: 'src/server/device-alerts.js', read: ['let read; try { read = { text: fs.readFileSync(ledgerFile, \'utf-8\') }; } catch (error) { read = { error }; }', 'const a = SR.storeAnswer(read, { valid: LEDGER_VALID });'], verdict: U, why: 'held: a missing file is the first run, anything else holds' },
  { store: 'desktop-apps.json', module: 'src/desktop-serve.js', read: ['let read; try { read = { text: fs.readFileSync(storeFile, \'utf8\') }; } catch (error) { read = { error }; }', 'const a = SR.storeAnswer(read, { valid: STORE_VALID });'], verdict: U, why: 'held: never started empty over it' },
  { store: 'vault-grant-ends.json', module: 'src/server/vault-run-door.js', read: ['const a = SR.storeAnswer(read, { valid: ENDS_VALID });'], verdict: U, why: 'held: no grant end lost' },
  { store: 'job-secrets.leftover.json', module: 'src/server/job-secrets-door.js', read: ['let a = SR.storeAnswer(read, { valid: REC_VALID });'], verdict: U, why: 'held: the leftover record kept' },
  { store: 'layouts.json', module: 'src/routes/persistence.js', read: ['const layoutsHold = SH.create({'], verdict: U, why: 'store-hold' },
  { store: 'bookmarks.json', module: 'src/routes/persistence.js', read: ['const bookmarksHold = SH.create({'], verdict: U, why: 'store-hold' },
  { store: 'custom-themes.json', module: 'src/routes/persistence.js', read: ['const themesHold = SH.create({'], verdict: U, why: 'store-hold' },
  { store: 'user-state.json', module: 'src/routes/persistence.js', read: ['const userStateHold = SH.create({'], verdict: U, why: 'store-hold (the conversation list)' },
  { store: 'settings.json', module: 'src/routes/persistence.js', read: ['const settingsHold = SH.create({'], verdict: U, why: 'store-hold' },
  { store: 'channels/index.json', module: 'src/channel-store.js', read: ['try { st = fam.H.readAtStart(); } finally { startRead = true; }'], verdict: U, bound: ['src/channel-store.js', '\'index.json\': () => ixLoad'], why: 'store-hold (the channel families)' },
  { store: 'channels/poll-stamps.json', module: 'src/channel-store.js', read: ['try { st = fam.H.readAtStart(); } finally { startRead = true; }'], verdict: U, bound: ['src/channel-store.js', '\'poll-stamps.json\': () => psLoad'], why: 'store-hold (the channel families)' },
  { store: 'channels/adapters.json', module: 'src/channel-store.js', read: ['try { st = fam.H.readAtStart(); } finally { startRead = true; }'], verdict: U, bound: ['src/channel-store.js', '\'adapters.json\': () => adLoad'], why: 'store-hold (the channel families)' },
  { store: 'channels/outbox.json', module: 'src/channel-store.js', read: ['try { st = fam.H.readAtStart(); } finally { startRead = true; }'], verdict: U, bound: ['src/channel-store.js', '\'outbox.json\': () => obLoad'], why: 'store-hold (the channel families)' },
  { store: 'channels/groups.json', module: 'src/channel-store.js', read: ['try { st = fam.H.readAtStart(); } finally { startRead = true; }'], verdict: U, bound: ['src/channel-store.js', '\'groups.json\': () => grLoad'], why: 'store-hold (the channel families)' },
  { store: 'channels/aliases.json', module: 'src/channel-store.js', read: ['try { st = fam.H.readAtStart(); } finally { startRead = true; }'], verdict: U, bound: ['src/channel-store.js', '\'aliases.json\': () => alLoad'], why: 'store-hold (the channel families)' },
  { store: 'channels/wake-pace.json', module: 'src/channel-store.js', read: ['try { st = fam.H.readAtStart(); } finally { startRead = true; }'], verdict: U, bound: ['src/channel-store.js', '\'wake-pace.json\': () => pcLoad'], why: 'store-hold (the channel families)' },
  { store: 'channels/dispatch-ledger.json', module: 'src/channel-store.js', read: ['try { st = fam.H.readAtStart(); } finally { startRead = true; }'], verdict: U, bound: ['src/channel-store.js', '\'dispatch-ledger.json\': () => dlLoad'], why: 'store-hold (the channel families)' },
  // ── ITS OWN HOLD ──
  { store: 'auth.json', module: 'src/auth.js', read: ['try { text = fs.readFileSync(this._file, \'utf-8\'); } catch (e) { error = e || Object.assign(new Error(\'an error\'), { code: \'an error\' }); }'], verdict: H, fp: '157a2ff0b739', why: '_held: every page refused, the sign-in page says held' },
  { store: 'grants.json', module: 'src/server/grants-store.js', read: ['const raw = JSON.parse(fs.readFileSync(file, \'utf-8\'));', '} catch (e) {'], verdict: H, fp: '300e00ed65cd', why: 'unreadable: every write refused store_unreadable' },
  { store: 'integrations.json', module: 'src/server/integration-store.js', read: ['try { raw = fs.readFileSync(file, \'utf-8\'); }', 'catch (e) {'], verdict: H, fp: '764861d58a66', why: 'loadError: assertWritable; corrupt archived aside' },
  { store: 'spend-budget.json', module: 'src/server/spend-guard.js', read: ['const loaded = parseLedger(readText());', 'if (loaded.error) {'], verdict: H, fp: '03190409ff17', why: 'unreadable: unattended turns refused; a For-you item' },
  { store: 'vault.json', module: 'src/server/vault-engine.js', read: ['recordHold.start(SR.storeAnswer({ error: e }));'], verdict: U, was: H, why: 'held through the store-read law (2.369.419, r3002 (b): src/store-read-hold.js): a failed read is held, nothing written over it, read again off the loop and said «could not be read»; bytes read that are not a record stay damaged for the life (recordBad); before: its own hold, never read again in the same life, and «restore from a backup» for a read that only failed' },
  { store: 'msg-queued.json', module: 'src/server/queued-wakes.js', read: ['const readHeld = () => parseHeld(typeof readFile === \'function\' ? readFile(file) : require(\'fs\').readFileSync(file, \'utf8\'));', '} catch (err) {'], verdict: H, fp: '68777c5d636b', why: 'unread (B-e3fe): a For-you item with «Set it aside»' },
  { store: 'layouts.owed.json', module: 'src/routes/persistence.js', read: ['const _markAtStart = fs.promises.readFile(OWED_MARK, \'utf8\').then((t) => {', '(e) => (e && e.code === \'ENOENT\' ? { state: \'absent\' }'], verdict: H, fp: '7f4a55f441d2', why: '«unknown»: unlinked at the run\'s first layouts landing' },
  { store: 'writes-lost.json', module: 'src/server/writes-lost.js', read: ['try { text = fs.readFileSync(file, \'utf8\'); } catch (e) { if (e.code !== \'ENOENT\') return readFailed(`not read (${e.code || e.message})`); }'], verdict: H, fp: 'c4b08def2c3f', why: 'readFailed: never written; read again' },
  { store: 'sent-record.json', module: 'src/server/sent-record.js', read: ['raw = typeof readFile === \'function\' ? readFile(file) : require(\'fs\').readFileSync(file, \'utf8\');', '} catch (e) {'], verdict: H, fp: 'a8274ec8f41c', why: 'unread for the run' },
  { store: 'cli-level-reported.json', module: 'src/server/cli-level-reported.js', read: ['try { text = fs.readFileSync(path.join(st.dataDir, FILE), \'utf8\'); } catch (e) { return e && e.code === \'ENOENT\' ? null : { failed: (e && e.code) || \'read-failed\' }; }'], verdict: H, fp: '3c10b7385c6e', why: 'held; the save reads again and merges' },
  { store: 'jobs-logs-sweep.json', module: 'src/job-logs-sweep-worker.js', read: ['try { raw = fs.readFileSync(stateFile, \'utf8\'); } catch (e) { if (!e || e.code !== \'ENOENT\') return { error: `the catch-up record could not be read: ${(e && (e.code || e.message)) || e}`, code: String((e && (e.code || e.message)) || e).slice(0, 60) }; }'], verdict: H, fp: '16a743981e2a', why: 'the pass waits; a For-you item' },
  { store: 'spend-budget.born.json', module: 'src/server/spend-guard.js', read: ['let t; try { t = syncRead(markerFile); } catch (e) { return e && e.code === \'ENOENT\' ? { missing: true } : { error: String((e && e.code) || \'read failed\') }; }'], verdict: H, fp: '92b5958c9ae2', why: 'markerUnreadable: every write reads the file again first and refuses while it fails' },
  { store: 'job-secrets.retired.json', module: 'src/server/job-secrets-door.js', read: ['try { doc = JSON.parse(await fsp.readFile(file, \'utf8\')); } catch (e) { return gone(e, by) || named(\'job_secrets_unreadable\'); }'], verdict: H, fp: 'c1ec6f774f4e', why: 'the Move is refused by name (job_secrets_unreadable); the hub never writes it' },
  { store: 'relay-token.json', module: 'src/plugins/frp.js', read: ['try { raw = fs.readFileSync(f, \'utf-8\'); } catch (e) { return { rec: null, state: e && e.code === \'ENOENT\' ? \'none\' : \'unreadable\' }; }'], verdict: H, fp: '263089cd318f', why: 'unreadable: no new identity is minted over it (relay_unreadable, «move it aside first»)' },
  { store: 'host-mounts.json', module: 'src/machine-mounts.js', read: ['const st = JSON.parse(fs.readFileSync(file, \'utf-8\'));', '} catch (e) { this.log(`legacy store unreadable — kept in place (fix or remove it, then delete machine-mounts.json to re-migrate): ${file}: ${e.message}`); return -1; }'], verdict: H, fp: '9eae7a4e5656', bound: ['src/machine-mounts.js', 'const hmF = path.join(this.dataDir, \'host-mounts.json\');'], lane: NOT_ROUTED, gap: 'an EIO is not told from torn bytes and is never read again; machine-mounts.json is saved without those records, so the ingest never runs again', why: 'the legacy file: kept in place on a failed read, never written' },
  { store: 'device-mounts.json', module: 'src/machine-mounts.js', read: ['const st = JSON.parse(fs.readFileSync(file, \'utf-8\'));', '} catch (e) { this.log(`legacy store unreadable — kept in place (fix or remove it, then delete machine-mounts.json to re-migrate): ${file}: ${e.message}`); return -1; }'], verdict: H, fp: '9eae7a4e5656', bound: ['src/machine-mounts.js', 'const dvF = path.join(this.dataDir, \'device-mounts.json\');'], lane: NOT_ROUTED, gap: 'an EIO is not told from torn bytes and is never read again; machine-mounts.json is saved without those records, so the ingest never runs again', why: 'the legacy file: kept in place on a failed read, never written' },
  { store: 'slot-transitions.jsonl', module: 'src/slot-transitions.js', read: ['let buf; try { buf = fs.readFileSync(fp); } catch (e) { MR.absentOr(e, fp); return; }'], verdict: H, fp: '3050a9b691d4', lane: NOT_ROUTED, gap: 'a failed read gives no live rows in memory: attribution runs on «no move recorded» and a duplicate row can be appended', why: 'appends only; the trim reads the file itself and does nothing if that read fails (r3857, the moved MG1 chain: inside a migration\'s run a read that failed is not «no rows» — the migration is not run, src/migration-reads.js absentOr; every other reader keeps this gap)' },
  { store: '.accounts-key', module: 'src/key-file.js', read: ['try { raw = readKey(); }', 'if (errno !== \'ENOENT\') return { ok: false, code: `key-unreadable:${errno}` };'], verdict: H, fp: 'ff7f7ca19e06', bound: ['src/accounts.js', 'this._keyFile = path.join(dataDir, \'.accounts-key\');'], why: 'a key: EIO answers key-unreadable, torn bytes key-malformed; minted only on ENOENT with no ciphertext, by exclusive create (the key file\'s own road, until the vault is set up; then lawfulKey answers from vault.json)' },
  { store: '.mounts-key', module: 'src/key-file.js', read: ['try { raw = readKey(); }', 'if (errno !== \'ENOENT\') return { ok: false, code: `key-unreadable:${errno}` };'], verdict: H, fp: 'ff7f7ca19e06', bound: ['src/mounts.js', 'this._keyFile = path.join(dataDir, \'.mounts-key\');'], why: 'a key: EIO answers key-unreadable, torn bytes key-malformed; minted only on ENOENT with no ciphertext, by exclusive create (the key file\'s own road, until the vault is set up; then lawfulKey answers from vault.json)' },
  { store: '.integrations-key', module: 'src/key-file.js', read: ['try { raw = readKey(); }', 'if (errno !== \'ENOENT\') return { ok: false, code: `key-unreadable:${errno}` };'], verdict: H, fp: 'ff7f7ca19e06', bound: ['src/server/integration-store.js', 'const KEY_FILE = \'.integrations-key\';'], why: 'a key: EIO answers key-unreadable, torn bytes key-malformed; minted only on ENOENT with no ciphertext, by exclusive create (the key file\'s own road, until the vault is set up; then lawfulKey answers from vault.json)' },
  { store: '.channels-key', module: 'src/key-file.js', read: ['try { raw = readKey(); }', 'if (errno !== \'ENOENT\') return { ok: false, code: `key-unreadable:${errno}` };'], verdict: H, fp: 'ff7f7ca19e06', bound: ['src/server/channels-engine.js', 'const KEY_FILE = \'.channels-key\';'], why: 'a key: EIO answers key-unreadable, torn bytes key-malformed; minted only on ENOENT with no ciphertext, by exclusive create (the key file\'s own road, until the vault is set up; then lawfulKey answers from vault.json)' },
  { store: '.app-secrets-key', module: 'src/key-file.js', read: ['try { raw = readKey(); }', 'if (errno !== \'ENOENT\') return { ok: false, code: `key-unreadable:${errno}` };'], verdict: H, fp: 'ff7f7ca19e06', bound: ['src/app-secrets.js', 'const APP_SECRETS_KEY_FILE = \'.app-secrets-key\';'], why: 'a key: EIO answers key-unreadable, torn bytes key-malformed; minted only on ENOENT with no ciphertext, by exclusive create (the key file\'s own road, until the vault is set up; then lawfulKey answers from vault.json)' },
  { store: 'browser-passkeys.key', module: 'src/key-file.js', read: ['try { raw = readKey(); }', 'if (errno !== \'ENOENT\') return { ok: false, code: `key-unreadable:${errno}` };'], verdict: H, fp: 'ff7f7ca19e06', bound: ['src/server/browser-passkey-file.js', 'const file = path.join(dataDir, \'browser-passkeys.json\'), keyFile = path.join(dataDir, \'browser-passkeys.key\');'] /* line 792: the wiring's store moved into its own file */, why: 'a key: EIO answers key-unreadable, torn bytes key-malformed; minted only on ENOENT with no ciphertext, by exclusive create (the key file\'s own road, until the vault is set up; then lawfulKey answers from vault.json)' },
  { store: 'agentd/dial-tokens.json', module: 'src/hosts.js', read: ['const all = JSON.parse(fs.readFileSync(file, \'utf-8\'));'], verdict: H, fp: 'a28ca1a92520', why: 'a one-shot migration\'s input: a failed read throws, the file stays' },
  { store: 'channels/index-acts.ndjson', module: 'src/channel-store.js', read: ['try { text = timedSync(\'channels-acts.read\', () => fs.readFileSync(actsFile, \'utf8\')); actsAtStart = true; } catch (e) { text = null; if (e && e.code !== \'ENOENT\') holdCompanion(ixLoad, \'index-acts.ndjson\', e); }'], verdict: H, fp: 'df8456a1442c', why: 'EIO holds the whole index; torn lines dropped and counted' },
  { store: 'layout-history/<point>', module: 'src/routes/persistence.js', read: ['try { text = fs.readFileSync(path.join(HISTORY_DIR, id), \'utf-8\'); }', 'catch (e) { const why = (e && e.code) || \'unreadable\'; return res.status(why === \'ENOENT\' ? 404 : 503).json({ error: `this rollback point could not be read (${why}) — nothing was restored; pick another`, code: \'point_unread\', why }); }'], verdict: H, fp: 'e3dfe648d639', why: 'EIO 503 point_unread, torn 409 damaged; each point a new name' },
  { store: 'pool-pins/<pool>/<sock>', module: 'src/pool-pin-record.js', read: ['const text = timedSync(\'pool-pin.read\', () => fs.readlinkSync(path.join(dir, k)));', '} catch (e) { return e && e.code === \'ENOENT\' ? { rec: null, error: null } : { rec: null, error: (e && e.code) || \'EIO\' }; }'], verdict: H, fp: 'f0e8e70727cc', why: 'a symlink: EIO said by name, the meta\'s copy used (its sweep removes by session-meta\'s silence: the remover column)' },
  { store: 'subs/<account>/', module: 'src/harnesses/claude.js', read: ['const raw = typeof rd.json === \'function\' ? rd.json(cp) : JSON.parse(rd.facts(cp).text);', '} catch { }'], verdict: H, fp: 'd7a7c82a8e3b', why: 'a read answers logged out and writes nothing; the long-lived-token sync refuses read-failed by name' },
  { store: 'codex-subs/<account>/', module: 'src/harnesses/codex.js', read: ['const raw = rd && typeof rd.json === \'function\' ? rd.json(file) : JSON.parse(rd ? rd.readText(file) : fs.readFileSync(file, \'utf-8\'));', '} catch { return { loggedIn: false }; }'], verdict: H, fp: '9eb1801d9cab', why: 'read only for the hub' },
  { store: 'desktop-apps/<id>/portal/secrets.json', module: 'src/app-secrets-seal.js', read: ['try { raw = fs.readFileSync(file, \'utf8\'); } catch (e) { if (e && e.code === \'ENOENT\') { process.stdout.write(\'[]\'); process.exit(0); } fail(1, `cannot read the store (${(e && e.code) || \'error\'})`); }'], verdict: H, fp: '0319ba8a20bc', why: 'EIO: the service refuses to start; torn: set aside, exit 3; no seal without a clean open' },
  { store: 'rewind-kept/<press>/', module: 'src/server/rewind-keep-worker.js', read: ['const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(d, f), \'utf8\')); } catch { return null; } };'], verdict: H, fp: '398121eb4451', why: 'the sweep never touches an unmarked folder; a second seal fails EEXIST' },
  { store: 'plugins-state/<id>/seeds.json', module: 'src/server/migrations.js', read: ['const T = readJson(seedsFile, `data/plugins-state/${CLOAK_PLUGIN_ID}/seeds.json`);'], verdict: H, fp: 'c617244aea5e', why: 'the migration throws on anything but ENOENT and retries next boot' },
  { store: 'usage-history/attribution.ndjson', module: 'src/usage-history.js', read: ['let data = \'\'; try { data = fs.readFileSync(this.attribFile, \'utf-8\'); } catch {}'], verdict: H, fp: '5ec073677869', why: 'append-only; its rewriters return on a failed read and keep unparsed lines' },
  { store: 'usage-history/otel-truth.ndjson', module: 'src/server/otel-ingest.js', read: ['try { fh = await fs.promises.open(file, \'r\'); } catch (e) { if (e.code !== \'ENOENT\') console.warn(\'[otel] truth stash load failed:\', e.message); }'], verdict: H, fp: '98af570267aa', why: 'EIO: no trim this start; a trim only after a whole read' },
  { store: 'usage-history/otel-truth.pending.ndjson', module: 'src/server/otel-ingest.js', read: ['const recs = [], lines = [], fh = await fs.promises.open(spill, \'r\');', 'await eachLine(fh, (buf, a, nl) => { const l = buf.toString(\'utf8\', a, nl); try { const r = JSON.parse(l); if (r && typeof r === \'object\') { spillOf.set(r, l + \'\\n\'); recs.push(r); lines.push(l + \'\\n\'); } } catch { } }, STASH_READ);'], verdict: H, fp: 'c2c4ba82a62a', why: 'EIO: this boot never writes the spill' },
  { store: 'usage-history/events-<YYYY-MM>.ndjson', module: 'src/usage-history.js', read: ['let data = \'\'; try { data = fs.readFileSync(fp, \'utf-8\'); } catch { continue; }'], verdict: H, fp: '4e0f7ce2ee13', why: 'the usage ledger: appends; a rewrite skips a shard it cannot read and keeps torn lines word for word' },
  { store: 'usage-history/_held/<host>/', module: 'src/usage-hold-road.js', read: ['r = await LD.eachLineAsync(this._holdFile(h, seq), 0, (buf, a, b) => {', '} catch (e) { unread.push({ seq, e }); continue; }'], verdict: H, fp: '07c25e45d056', why: 'an EIO fails the hold and is read again; a refused set is moved aside unread' },
  { store: 'usage-anchors/anchors-<key>.ndjson', module: 'src/usage-estimator.js', read: ['try { const buf = this._readAll(fp); const text = buf.toString(\'utf-8\'); endsNl = !text.length || text.endsWith(\'\\n\'); lines = text.split(\'\\n\').filter(Boolean).map(parse).filter(Boolean); wins = proofWindows(buf, 0, buf.length, PROOF_SAMPLES); } catch { wins = null; }'], verdict: H, fp: '6b3b3530cfb0', why: 'append-only; the estimator never writes it' },
  { store: 'agentd/hub-id', module: 'src/server/dial-pairing.js', read: ['const read = () => { try { return DF.hubIdOf(fs.readFileSync(f, \'utf8\')); } catch { return \'\'; } };'], verdict: H, fp: 'cba02b5fa1bf', why: 'minted only by an exclusive create' },
  { store: 'ssh/id_ed25519', module: 'src/hosts.js', read: ['try { v = { exists: true, path: priv, publicKey: fs.readFileSync(priv + \'.pub\', \'utf-8\').trim() }; } catch { v = { exists: false, path: priv, publicKey: null }; }'], verdict: H, fp: '5292058d7427', why: 'the person\'s Generate asks before overwriting' },
  { store: '<key>.sealed markers', module: 'src/secret-box.js', read: ['const sealedHere = (keyFile) => fs.existsSync(path.join(path.dirname(keyFile), \'vault.json\')) || fs.existsSync(keyFile + \'.sealed\');'], verdict: H, fp: '6f9bbe7027ed', why: 'only the vault\'s seal writes one; an EIO falls back to the key-file law' },
  // ── DERIVED ──
  { store: 'agentd-tokens.json', module: 'src/agentd/client.js', read: ['try { this._tokens = JSON.parse(fs.readFileSync(this._tokFile, \'utf-8\')); } catch { this._tokens = {}; }'], verdict: D, fp: '8393a4e67c2d', why: 'from the device\'s own token file' },
  { store: 'channels/api-cards.json', module: 'src/server/channel-api-cards.js', read: ['const state = (() => { try { const j = JSON.parse(fs.readFileSync(stateFile, \'utf8\')); return { items: j.items || {} }; } catch { return { items: {} }; } })();'], verdict: D, fp: '048747498970', why: 'from api-proposals (a duplicate For-you item for each pending one)' },
  { store: 'conversation-index.json', module: 'src/conversation-index.js', read: ['try { this._state = JSON.parse(fs.readFileSync(this.file, \'utf-8\')) || this._state; } catch { }'], verdict: D, fp: '4fd34734ef41', why: 'from the machines\' listings' },
  { store: 'remote-sessions-cache.json', module: 'src/hosts.js', read: ['try { this._persistedDisc = JSON.parse(fs.readFileSync(this._discFile, \'utf-8\')) || {}; } catch { }'], verdict: D, fp: 'f93bfe99e913', why: 're-probed' },
  { store: 'desktop-apps-hosts.json', module: 'src/server/desktop-app-keeper.js', read: ['try { read = { text: fs.readFileSync(remoteFile, \'utf8\') }; } catch (e) { read = { error: e }; }', 'const a = SR.storeAnswer(read, { valid: REMOTE_VALID });'], verdict: U, why: 'held through the store-read law (bl-windows, line 494, on the train); before: the devices hold the records (DERIVED)' },
  { store: 'browser-engines.json', module: 'src/server/engine-distribution.js', read: ['const ready = (async () => { try { const j = JSON.parse(await fsp.readFile(recordFile, \'utf8\')); if (j && typeof j === \'object\' && j.engines && typeof j.engines === \'object\') record = { v: 1, engines: j.engines }; } catch { /* none yet */ } })();'], verdict: D, fp: '53755a2b7209', why: 'a re-measure' },
  { store: 'tailnet-door.json', module: 'src/server/tailnet-door.js', read: ['const kept = () => { try { const j = JSON.parse(fs.readFileSync(stateFile, \'utf8\')); const p = Number(j.port); return { port: Number.isInteger(p) && p > 0 && p < 65536 ? p : 0, token: TR.pacPath(j.token) ? String(j.token) : \'\' }; } catch { return { port: 0, token: \'\' }; } };'], verdict: D, fp: '05ec55f6bd2d', why: 'a new port and token' },
  { store: 'vnc.json', module: 'src/vnc.js', read: ['const j = JSON.parse(fs.readFileSync(file, \'utf8\'));', '} catch { return null; }'], verdict: D, fp: '54ec95c015de', why: 'the machine\'s own state' },
  { store: 'cli-models.json', module: 'src/server/cli-models-door.js', read: ['try { raw = JSON.parse(await fsx.promises.readFile(file, \'utf8\')); } catch { raw = undefined; }'], verdict: D, fp: '04db754c2041', why: 're-listed from the CLI (its persisted floors are lost)' },
  { store: 'codex-models-seen.json', module: 'src/harnesses/codex-models.js', read: ['try { for (const m of JSON.parse(fs.readFileSync(seenFile, \'utf-8\'))) if (m && m.id) SEEN.set(m.id, m); } catch {}'], verdict: D, fp: '67e7573138f7', why: 'mostly from the CLI\'s models cache' },
  { store: 'usage-cache.json', module: 'src/usage-routes.js', read: ['const cached = JSON.parse(fs.readFileSync(USAGE_CACHE_FILE, \'utf-8\'));', '} catch {'], verdict: D, fp: '78b468701313', why: 'from usage-cache/__global__.json; a newer reading replaces it (the last active poll\'s reading waits for the next)' },
  { store: 'desktop-machines.json', module: 'src/server/desktop-access.js', read: ['if (knownFile) { try { for (const [id, e] of MC.fromFile(JSON.parse(fs.readFileSync(knownFile, \'utf8\')))) known.set(id, e); } catch { /* none yet (or unreadable): each row says 「检查中…」 until its probe lands */ } }'], verdict: D, fp: 'b164e38894e0', why: 'each machine\'s last probe: its row says checking until the next probe lands' },
  { store: 'browser-tools/cli-pin.json', module: 'src/browser-facts.js', read: ['try { pin = VERBS.cliPinVerdict(JSON.parse(require(\'fs\').readFileSync(path.join(toolsDir, \'cli-pin.json\'), \'utf8\')), { toolsDir }); } catch { pin = null; }'], verdict: D, fp: 'ea406755102a', why: 'the keeper writes it from the setting and verified.json' },
  { store: 'usage-anchors/rates.json', module: 'src/usage-estimator.js', read: ['if (!this._ratesAll) { let all = {}; try { all = JSON.parse(this._readAll(fp).toString(\'utf-8\')) || {}; } catch { } this._ratesAll = all; fs.mkdirSync(this.dir, { recursive: true }); }'], verdict: D, fp: 'ef107f32906e', why: 'relearned from the anchors («still learning» after a restart)' },
  { store: 'usage-history/_cursors.json', module: 'src/usage-history.js', read: ['try { text = fs.readFileSync(this.cursorsFile, \'utf-8\'); obj = JSON.parse(text) || {}; } catch { text = null; obj = {}; }'], verdict: D, fp: 'dd637220bb59', why: 'every transcript walked again; rid dedup hides the duplicates (the ledger grows)' },
  { store: 'session-buffers/<sock>', module: 'src/server/boot-restore.js', read: ['try { const raw = fs.readFileSync(wrapperFiles.buf); savedBuffer = raw.toString(\'utf-8\'); restoreBuf = restoreBufOf(wrapperFiles.buf, raw); } catch {}'], verdict: D, fp: 'de919afdbe01', why: 'the live wrapper writes it; a blank replay at worst' },
  { store: 'pool-links/<pool>/<sid>', module: 'src/accounts.js', read: ['const sub = path.basename(RR.readlink(this.sessionPoolLinkPath(poolId, sessKey)));', '} catch { if (this.unplacedOf(poolId, sessKey)) return answer(null); } // (q-055 M2) UNPLACED: it bills nobody — never "the default"'], verdict: D, fp: '0745d876666d', why: 'a symlink the engine repoints; an EIO answers the pool default' },
  { store: 'remote-jsonl/<host>/', module: 'src/hosts.js', read: ['try { meta = JSON.parse(fs.readFileSync(metaPath, \'utf-8\')); } catch {}'], verdict: D, fp: '5f6c6b807725', why: 'fetched again from the host' },
  { store: 'usage-history/_host-cursors/<host>.json', module: 'src/usage-hold-road.js', read: ['try { const j = JSON.parse(fs.readFileSync(this._hostCursorFile(hostId), \'utf-8\')); if (j && j.v === 1 && j.cursors && typeof j.cursors === \'object\') rec = j; } catch { }'], verdict: D, fp: '564597a9ab6a', why: 'the device walks again from no cursor; the ingest drops rows the ledger holds' },
  { store: 'usage-history/.attrib-rebake-v1', module: 'src/usage-history.js', read: ['try { if (fs.existsSync(marker)) return; } catch {}'], verdict: D, fp: '8e4df2ee9a51', why: 'a one-shot flag: a misread is one more re-bake from the same sources' },
  { store: 'ssh/<host>.pin', module: 'src/host-keys.js', read: ['let now = null; try { now = fs.readFileSync(f, \'utf8\'); } catch { /* absent */ }'], verdict: D, fp: '6296eceaaa20', why: 'rewritten from the hosts.json record' },
  { store: 'tls/<domain>.crt|.key', module: 'src/server/tls.js', read: ['try { cert = await fs.promises.readFile(certFile); out.cert = true; } catch { }'], verdict: D, fp: '35861e253259', why: 'tailscale issues them again' },
  { store: 'browser-env/<key>.json|.profile|.cwd', module: 'src/server/browser-env.js', read: ['try { const r = JSON.parse(fs.readFileSync(cwdPathFor(key), \'utf8\')); return r && typeof r === \'object\' ? { cwd: typeof r.cwd === \'string\' ? r.cwd : null } : null; }', 'catch { return null; }'], verdict: D, fp: '2af9e512bbb8', why: 'composed fresh at each spawn' },
  { store: 'browser-env/display/<key>', module: 'src/server/browser-display-config.js', read: ['const readCfg = (file) => { try { const v = JSON.parse(fs.readFileSync(file, \'utf8\')); return v && typeof v === \'object\' && !Array.isArray(v) ? v : null; } catch { return null; } };'], verdict: D, fp: '5d08d5158c77', why: 'rewritten when its content changes' },
  { store: 'claude-cli-dumps/<version>.json', module: 'src/server/cli-registration.js', read: ['let d = null; try { d = JSON.parse(fs.readFileSync(file, \'utf8\')); } catch { return null; }'], verdict: D, fp: '6254f045fab7', why: 'a dump of the installed binary' },
  // ── WRITTEN OVER (the lane that holds its cure) ──
  { store: 'vault-grants.json', module: 'src/server/vault-totp.js', read: ['hold.start(SR.storeAnswer(read, { valid: GRANTS_SHAPE }))'], verdict: U, was: X, why: 'held through the store-read law (2.369.417, the store-read family: src/store-read-hold.js or its own hold); before: a failed read grants no code and writes nothing; a valid JSON of the wrong shape reads as empty and is written over' },
  { store: 'cli-self-measure.json', module: 'src/server/cli-self-measure.js', read: ['const a = SR.storeAnswer({ text: txt }, { valid: isLedger });'], verdict: U, was: X, why: 'held through the store-read law (B-f276, lane bl-scratch, slice hub-own-ledgers: src/store-read-hold.js — torn bytes kept aside off the loop before the ledger is read as empty, the decision run again at the lift; a failed read held as before); before: the verdicts of every CLI build measured before' },
  { store: 'browser-kept.json', module: 'src/server/browser-kept.js', read: ['const a0 = SR.storeAnswer(read, { valid: KEPT_SHAPE });', 'store = K.normalizeKeptStore(hold.start(a0) === \'data\' ? a0.value : null);'], verdict: U, was: X, why: 'r3006 (2.369.416) kept an unread file as it is; r3585 / r3786 (card-door-in-chat, line 821): UNDER THE LAW — a failed read or a wrong shape HOLDS the list (kept_unread: nothing written over it, nothing removed), read again off the loop and lifted with no restart; torn bytes kept aside once and the rows rebuilt from the folders and their notes; every start and lift reconciles from the notes. Its second readers judge it by the same shape and write nothing: browser-env\'s boot sweep when no live store is in the process, and the notes migration' },
  { store: 'browser-profiles/<key>/.vibespace-kept.json', module: 'src/server/browser-kept-note.js', read: ['fh = await fsp.open(path.join(dir, NOTE_NAME), fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0));', "out = c === 'ENOENT' ? { state: 'none' }"], verdict: H, fp: '9d0cd1be605f', why: 'r3786 (card-door-in-chat, line 821\'s second form), a row by hand (a name built from parts — the net cannot see it): a kept folder\'s NOTE. A note that cannot be read: the start is NOT kept and nothing is written over it (the reconcile does not finish: nothing removed). A note NOT TRUE to its folder (another folder\'s, a fourth field, bytes that do not parse) is that folder\'s no note, and its start writes the folder\'s own; a TRUE note is never written over (one naming no conversation may get one joined; one naming a conversation keeps it)' },
  { store: 'msg-stash.json', module: 'src/server/conversation-deliver.js', read: ['const a0 = SR.storeAnswer(read0, { valid: STASH_SHAPE });'], verdict: U, was: X, why: 'held through the store-read law (2.369.419, lane hub-loop-stalls: src/store-read-hold.js; while held what comes is kept in memory only, each producer told «not on disk»); before: every waiting message and job result — the hub\'s own stop wrote it' },
  { store: 'providers.json', module: 'src/server/provider-store.js', read: ['const a0 = SR.storeAnswer(read0, { valid: PROVIDERS_SHAPE });'], verdict: U, was: X, why: 'held through the store-read law (2.369.417, the store-read family: src/store-read-hold.js or its own hold); before: every third-party provider record' },
  { store: 'setting-holds.json', module: 'src/server/setting-holds.js', read: ['const a0 = SR.storeAnswer(read, { valid: HOLDS_SHAPE });'], verdict: U, was: X, why: 'held through the store-read law (2.369.417, the store-read family: src/store-read-hold.js or its own hold); before: every raised spending ceiling\'s way back' },
  { store: 'migrations.json', module: 'src/migration-runner.js', read: ['try { text = fs.readFileSync(ledgerPath, \'utf-8\'); } catch (e) { if (e && e.code === \'ENOENT\') return { applied: {} }; return { unread: (e && e.code) || \'error\', torn: false }; }'], verdict: H, was: X, fp: 'b5e19d2eb36e', why: 'the run-at-most-once ledger, cured by MG1 (r2999 / r3244, lane lg-group-parents): only «not there» is «nothing ran»; a read that failed or bytes that do not parse (or hold no list of what ran) are HELD — no migration runs, nothing is written over the ledger, ONE For-you item says why, and the next start reads it again' },
  { store: 'automation-keys.json', module: 'src/server/automation-engine.js', read: ['try { raw = JSON.parse(fs.readFileSync(FILE, \'utf8\')); } catch (e) { if (!(e && e.code === \'ENOENT\')) log(`automation-keys.json could not be read (${e.code || e.message}) — no key is usable until it is fixed`); return { keys: [], grants: [], opened: [], bad: !(e && e.code === \'ENOENT\') }; }'], verdict: X, fp: 'e574fea80550', lane: 'login-request-card', why: 'its own hold (db.bad) with a RACE: a concurrent use\'s failed re-read lets the key stamp write an empty key list' },
  { store: 'vault-use-marks.json', module: 'src/server/vault-use-grants.js', read: ['const st = marksHold.start(SR.storeAnswer(read, { valid: MARKS_SHAPE }));'], verdict: U, was: X, why: 'held through the store-read law (2.369.417, the store-read family: src/store-read-hold.js or its own hold); before: every no-card grant on the other vault entries' },
  { store: 'vault-run-tools.json', module: 'src/server/vault-run-door.js', read: ['const toolsLoad = () => { if (toolsCache) return toolsCache; let o = null; try { o = JSON.parse(readBounded(TOOLS_FILE, STORE_MAX).toString(\'utf8\')); } catch { o = null; } toolsCache = (o && o.tools && typeof o.tools === \'object\') ? { v: 1, tools: o.tools } : { v: 1, tools: {} }; return toolsCache; };'], verdict: X, fp: 'e22eaa658792', lane: 'lg-vault-env', why: 'every sealed tool\'s first-seen digest' },
  { store: 'vault-run.json', module: 'src/server/vault-run-door.js', read: ['const a = lawOf(SR.storeAnswer(read, { valid: STORE_VALID }));'], verdict: U, was: X, why: 'held through the store-read law (2.369.417, the store-read family: src/store-read-hold.js or its own hold); before: the owner\'s switches, policies and approvals (VR1)' },
  { store: 'accounts.json', module: 'src/accounts.js', read: ['const a = SR.storeAnswer(read, { valid: (v) => this._accountsValid(v) });'], verdict: U, was: X, why: 'held through the store-read law (2.369.417, the store-read family: src/store-read-hold.js or its own hold); before: every account and pool (the hotfix)' },
  { store: 'mounts.json', module: 'src/mounts.js', read: ['const a = SR.storeAnswer(read, { valid: MOUNTS_SHAPE });'], verdict: U, was: X, why: 'held through the store-read law (2.369.417, the store-read family: src/store-read-hold.js or its own hold); before: every storage row' },
  { store: 'mount-tokens.json', module: 'src/webdav.js', read: ['const a = SR.storeAnswer(read, { valid: TOKENS_SHAPE });'], verdict: U, was: X, why: 'held through the store-read law (2.369.417, the store-read family: src/store-read-hold.js or its own hold); before: every mount token' },
  { store: 'plugins.json', module: 'src/plugins.js', read: ['const a0 = SR.storeAnswer(read, { valid: PLUGINS_SHAPE });'], verdict: U, was: X, why: 'held through the store-read law (2.369.417, the store-read family: src/store-read-hold.js or its own hold); before: every plugin\'s state and settings' },
  { store: 'published-pages.json', module: 'src/server/published-pages.js', read: ['const a0 = SR.storeAnswer(read, { valid: PAGES_SHAPE });'], verdict: U, was: X, why: 'held through the store-read law (2.369.417, the store-read family: src/store-read-hold.js or its own hold); before: every share link (404)' },
  { store: 'auto-resume.json', module: 'src/server/auto-resume.js', read: ['const a0 = SR.storeAnswer(read, { valid: AR_SHAPE });'], verdict: U, was: X, why: 'held through the store-read law (2.369.417, the store-read family: src/store-read-hold.js or its own hold); before: promised continues and the loop-breaker\'s memory' },
  { store: 'session-status.json', module: 'src/session-status.js', read: ['const a0 = SR.storeAnswer(read, { valid: STATUS_SHAPE });'], verdict: U, was: X, why: 'held through the store-read law (2.369.417, the store-read family: src/store-read-hold.js or its own hold); before: every task\'s state and history' },
  { store: 'channels/api-proposals.json', module: 'src/server/channel-api.js', read: ['const a0 = SR.storeAnswer(read, { valid: PROPOSALS_SHAPE });'], verdict: U, was: X, why: 'held through the store-read law (2.369.417, the store-read family: src/store-read-hold.js or its own hold); before: pending proposals and «always allow» shapes' },
  { store: 'designs.json', module: 'src/server/design-engine.js', read: ['const a0 = SR.storeAnswer(read, { valid: DESIGNS_SHAPE });'], verdict: U, was: X, why: 'held through the store-read law (2.369.417, the store-read family: src/store-read-hold.js or its own hold); before: the design list and its names' },
  { store: 'decision-examples.json', module: 'src/server/channels-attention.js', read: ['const a0 = SR.storeAnswer(read, { valid: EX_SHAPE });'], verdict: U, was: X, why: 'held through the store-read law (2.369.417, the store-read family: src/store-read-hold.js or its own hold); before: every label the person taught' },
  { store: 'feedback.json', module: 'src/server/feedback-store.js', read: ['const a0 = SR.storeAnswer(read, { valid: FB_SHAPE });'], verdict: U, was: X, why: 'held through the store-read law (2.369.417, the store-read family: src/store-read-hold.js or its own hold); before: every feedback report' },
  { store: 'app-proposals.json', module: 'src/server/apps-engine.js', read: ['const a0 = SR.storeAnswer(read, { valid: APPS_SHAPE });'], verdict: U, was: X, why: 'held through the store-read law (2.369.417, the store-read family: src/store-read-hold.js or its own hold); before: pending app installs' },
  { store: 'feedback-outbox.json', module: 'src/server/feedback-forward.js', read: ['const a0 = SR.storeAnswer(read, { valid: OUTBOX_SHAPE });'], verdict: U, was: X, why: 'held through the store-read law (2.369.417, the store-read family: src/store-read-hold.js or its own hold); before: the origin key; open reports sent again' },
  { store: 'msg-retry.json', module: 'src/server/conversation-deliver.js', read: ['return SR.storeAnswer(read, { valid: RETRY_VALID });'], verdict: U, was: X, why: 'held through the store-read law (bl-windows, line 494, on the train); before: parked retries and owed wakes (a failed read was «absent»)' },
  { store: 'port-forwards.json', module: 'src/port-forward.js', read: ['const a = SR.storeAnswer(read, { valid: PF_SHAPE });'], verdict: U, was: X, why: 'held through the store-read law (2.369.420, the store-read family: src/store-read-hold.js — lane bl-machines-a, lines 702 + 749); before: every forward and the kept public subdomain' },
  { store: 'instance-url.json', module: 'src/server/instance-url.js', read: ['const a = SR.storeAnswer(read, { valid: SHAPE }); if (hold.start(a) === \'data\') Object.assign(state, a.value || {});'], verdict: U, was: X, why: 'held through the store-read law (2.369.420, the store-read family: src/store-read-hold.js — lane bl-machines-a, line 646); before: the person\'s «Publish this VibeSpace»' },
  { store: 'browser-forgotten.json', module: 'src/server/browser-trace.js', read: ['const a = SR.storeAnswer(read, { valid: FORGOTTEN_SHAPE });'], verdict: U, was: X, why: 'held through the store-read law (2.369.417, the store-read family: src/store-read-hold.js or its own hold); before: the forgotten folders\' rows (their logins left on disk, unfound)' },
  { store: 'usage-reset-claims.json', module: 'src/usage-reset-claim.js', read: ['const a = read ? SR.storeAnswer(read, { valid: isObj }) : { state: \'missing\' };'], verdict: U, was: X, why: 'held through the store-read law (2.369.417, the store-read family: src/store-read-hold.js or its own hold); before: the person\'s «I reset it» claims' },
  { store: 'stash-handover.json', module: 'src/server/stash-handover.js', read: ['const a = SR.storeAnswer(read, { valid: isObj });'], verdict: U, was: X, why: 'held through the store-read law (2.369.419, lane hub-loop-stalls, lines 835 + 886: src/store-read-hold.js, code handover_memory_unread; while held nothing is written over it, a frame handed back for a hand-over it cannot see is kept as itself); before: the originals of hand-overs (24 h) — the next hand-over\'s write replaced the file with its one record' },
  { store: 'login-expiry.json', module: 'src/server/login-expiry-watch.js', read: ['const a = SR.storeAnswer(read, { valid: isObj });'], verdict: U, was: X, why: 'held through the store-read law (2.369.419, lane hub-loop-stalls: src/store-read-hold.js; the sweep files nothing while held, torn bytes kept aside and the inbox adopted as the second witness); before: the filed warnings\' ids — warnings filed twice' },
  { store: 'auto-cli-state.json', module: 'src/server/auto-cli-loop.js', read: ['let text = null; try { text = fs.readFileSync(fp, \'utf-8\'); } catch (e) { return e && e.code === \'ENOENT\' ? st : unknown(e.message); }'], verdict: H, fp: '362b667fb86e', lane: 'hub-loop-stalls', gap: 'the unknown wait ends after UNKNOWN_WAIT_MS (5.3 h) with no read again, and the next save writes the fresh memory over the unread file (the backoff\'s counts)', was: X, why: 'an unread state is «unknown»: the backoff waits the longest, no ask at minute zero (2.369.417, ban-safety)' },
  { store: 'device-upgrades.json', module: 'src/server/device-upgrade-watch.js', read: ['try { const j = JSON.parse(fs.readFileSync(file, \'utf-8\')); if (j && j.devices && typeof j.devices === \'object\') ledger = j.devices; if (j && j.gone && typeof j.gone === \'object\') gone = j.gone; } catch { /* first run */ }'], verdict: X, fp: '2bcbeea600b9', lane: NOT_ROUTED, why: 'the open items never retracted; the deadlines' },
  { store: 'window-leases.json', module: 'src/server/window-targets-engine.js', read: ['const j = JSON.parse(fs.readFileSync(leaseFile, \'utf8\'));', '} catch (e) { if (e && e.code !== \'ENOENT\') log.warn?.(`[window] ${LEASE_FILE} unreadable — starting with no leases: ${e.message}`); }'], verdict: X, fp: '319854ffbe68', lane: NOT_ROUTED, why: 'agents\' window holds' },
  { store: 'window-reach.json', module: 'src/server/window-targets-engine.js', read: ['const j = JSON.parse(fs.readFileSync(reachFile, \'utf8\'));', '} catch (e) { if (e && e.code !== \'ENOENT\') log.warn?.(`[window] ${REACH_FILE} unreadable — every window starts in auto mode: ${e.message}`); }'], verdict: X, fp: 'e6f0d8456d4a', lane: NOT_ROUTED, why: 'each window\'s tree or pixels mode' },
  { store: 'dial-health.json', module: 'src/server/dial-health-watch.js', read: ['try { const j = JSON.parse(fs.readFileSync(file, \'utf-8\')); if (j && j.hosts && typeof j.hosts === \'object\') ledger = j.hosts; } catch { /* first run */ }'], verdict: X, fp: '33ca3ecb290a', lane: NOT_ROUTED, why: 'a dismissed item comes back' },
  { store: 'browser-login-reminders.json', module: 'src/server/browser-logins.js', read: ['const a = SR.storeAnswer(read, { valid: isLedger });'], verdict: U, was: X, why: 'held through the store-read law (B-f276, lane hub-loop-stalls, r4719: src/store-read-hold.js; the pass reminds nothing and writes nothing while held, then runs at the lift); before: a second reminder' },
  { store: 'turn-carry-outstanding.json', module: 'src/turn-carry.js', read: ['else { const a = SR.storeAnswer(read, { valid: isTable }); if (hold.start(a) === \'data\') loadRows(a.value); }'], verdict: U, was: X, why: 'held through the store-read law (B-f276, lane bl-scratch, slice hub-own-ledgers: src/store-read-hold.js — an unread table held, save() writes nothing and a mark stays in memory; torn bytes kept aside; a file past its bound never read and never written over in the run); before: the restart line for conversations caught mid-delivery' },
  { store: 'sysinfo-history.json', module: 'src/sysinfo.js', read: ['const d = JSON.parse(fs.readFileSync(_histFile, \'utf8\'));', '} catch { }'], verdict: X, fp: '19e45f88498d', lane: NOT_ROUTED, why: 'the 24 h and 7 d charts' },
  { store: 'cli-registration.json', module: 'src/server/cli-registration.js', read: ['const a = SR.storeAnswer(read, { valid: isRecord });'], verdict: U, was: X, why: 'held through the store-read law (B-f276, lane hub-loop-stalls, r4719: src/store-read-hold.js; a build seen while held is kept in memory and judged against the record at the lift, the older first-seen wins); before: first-seen dates' },
  { store: 'hook-root-notice.json', module: 'src/server/hook-root-watch.js', read: ['const a = SR.storeAnswer(read, { valid: isMemo });'], verdict: U, was: X, why: 'held through the store-read law (B-f276, lane hub-loop-stalls, r4719: src/store-read-hold.js; read once at the first judgement, the notice said once a hold in memory, nothing written over it); before: one repeated toast' },
  { store: 'browser-takeovers.json', module: 'src/server/browser-keeper.js', read: ['const a = SR.storeAnswer(read, { valid: TQ_SHAPE });'], verdict: U, was: X, why: 'held through the store-read law (2.369.419, r3261\'s second unit: src/store-read-hold.js — the queue, a request by id, an ask, a Done and a page verb answer the hold by name, nothing written over); before: every open request waiting for a person, and the closed tail the CLI reads' },
  { store: 'opencode-serve.json', module: 'src/opencode-serve.js', read: ['const a = SR.storeAnswer(read, { valid: REC_SHAPE });'], verdict: U, was: X, why: 'held through the store-read law (r3334 unit 1, line 812 and its cure, lane bl-chat-b — the family\'s helper src/store-read-hold.js): a read that failed starts no serve and refuses a Start and a Disable by name; torn bytes kept aside once and never lifted as empty by themselves (a record mended or removed by hand is read again); before: the record of a serve still running became an orphan nobody adopts or stops' },
  { store: 'doc-owners.json', module: 'src/server/doc-engine.js', read: ['const a0 = SR.storeAnswer(read, { valid: memoShape });'], verdict: U, was: X, why: 'held through the store-read law (2.369.419, line 791 — r3332; read again by reading at the train\'s tip 725162b8a): ONE read at the owner memo\'s start, its answer by SR.storeAnswer handed to the family\'s helper src/store-read-hold.js (code doc_owners_unread). Held: nothing is written over the file (save asks writable()), no note reaches the memo, it is read again off the loop and lifted with no restart; torn bytes are kept aside once (doc-owners.json.corrupt-<mark>), then it starts empty and says so. Before: who owned each document window — a failed or torn read was an empty map, written over by the next note, and a comment on a stopped chat\'s window was refused no_owner' },
  { store: 'agent-door.json', module: 'src/server/agent-listener.js', read: ['return SR.storeAnswer(read, { valid: recordValid });'], verdict: U, was: X, why: 'held through the store-read law (r3333 unit 1, lane lg-group-parents): an unread record is never «no port kept» — a fresh port this run with nothing written, read again off the loop, the kept port listened on too at its read; torn bytes kept aside once' },
  { store: 'browser-passkeys.json', module: 'src/server/browser-dialogs.js', read: ['const a = SR().storeAnswer(read, { valid: PK_SHAPE });'], verdict: U, was: X, why: 'held through the store-read law (2.369.419, line 792: src/store-read-hold.js — a removal and every writer refused by name, the ceremonies refused before the site is answered); before: every passkey a person registered in an agent browser (the store\'s read threw; pkRead cached an empty store for the life)' },
  { store: 'cli-model-catalog.json', module: 'src/server/cli-model-catalog.js', read: ['const a = SR.storeAnswer(read, { valid: ledgerValid });'], verdict: U, was: X, why: 'held through the store-read law (r3333 unit 3 + r3770, lane lg-group-parents): this run\'s reads stay in memory, nothing is written over the ledger; at its read the file\'s rows come back (the builds no longer installed), this run\'s go over them, and the readers (the price layer) are handed the merged ledger; a file a newer build wrote is kept aside once' },
  { store: 'cli-unmeasured-notice.json', module: 'src/server/cli-unmeasured-notice.js', read: ['const a = SR.storeAnswer(read, { valid: memoryValid });'], verdict: U, was: X, why: 'held through the store-read law (r3333 unit 3, lane lg-group-parents): while unread the tick files, resolves and writes nothing (a notice the owner dismissed is never filed again); torn bytes kept aside once, then the damaged road (rebuilt from the For-you ledger)' },
  { store: 'drafts.json', module: 'src/sync-store.js', read: ['const a = SR.storeAnswer(read, { valid: STORE_SHAPE });'], verdict: U, was: X, bound: ['server.js', 'syncStores.drafts = new SyncStore(\'drafts\', path.join(__dirname, \'data\', \'drafts.json\'), wss);'], why: 'unsent chat and document drafts and queued messages (a SyncStore: every stop flushes it); held while unread (lane lg-recovery, r3262 / r3654): the hub takes nothing for it and nothing is written over the file' },
  { store: 'stage-sync.json', module: 'src/sync-store.js', read: ['const a = SR.storeAnswer(read, { valid: STORE_SHAPE });'], verdict: U, was: X, bound: ['server.js', 'syncStores.stage = new SyncStore(\'stage\', path.join(__dirname, \'data\', \'stage-sync.json\'), wss); // dynamic desktop (docs/design-dynamic-desktop.md)'], why: 'the Stage layout: workspace sets, the grid, the shared hero, the recent order (a SyncStore); held while unread (lane lg-recovery, r3262 / r3654): the hub takes nothing for it and nothing is written over the file' },
  { store: 'uploads-sync.json', module: 'src/sync-store.js', read: ['const a = SR.storeAnswer(read, { valid: STORE_SHAPE });'], verdict: U, was: X, bound: ['server.js', 'syncStores.uploads = new SyncStore(\'uploads\', path.join(__dirname, \'data\', \'uploads-sync.json\'), wss); const grants = require(\'./src/server/grants-store.js\').install(require(\'./src/server/grants-store'], why: 'the upload history list (a SyncStore); held while unread (lane lg-recovery, r3262 / r3654): the hub takes nothing for it and nothing is written over the file' },
  { store: 'settings-sync.json', module: 'src/sync-store.js', read: ['const a = SR.storeAnswer(read, { valid: STORE_SHAPE });'], verdict: U, was: X, bound: ['server.js', 'syncStores.settings = new SyncStore(\'settings\', path.join(__dirname, \'data\', \'settings-sync.json\'), wss);'], why: 'a dormant SyncStore: its contents are used by nothing, yet a failed read is {} and every stop flushes it (cured with the SyncStore read); held while unread (lane lg-recovery, r3262 / r3654): the hub takes nothing for it and nothing is written over the file' },
  { store: 'dropline-oauth.json', module: 'src/server/sealed-json.js', read: ['if (H) { try { text = readRaw(); } catch (error) { H.start(SR.storeAnswer({ error })); throw H.refusal(`reading ${base}`); } }'], verdict: U, was: X, why: 'held through the store-read law (r3334 unit 2, lane bl-chat-b: the sealed file names its hold): a read that failed refuses every act by name; torn bytes kept aside once (0600), then read as absent with the damage said; before: the voice sign-in pair and the registered client id, at the owner\'s next Connect' },
  { store: 'extract-journal.json', module: 'src/routes/files.js', read: ['const a = SR.storeAnswer(read, { valid: journalValid });'], verdict: U, was: X, why: 'held through the store-read law (r3333 unit 2, lane lg-group-parents): an unread journal refuses a local extraction by name, nothing written over; torn bytes kept aside once, then only a new or empty folder' },
  { store: 'instance.json', module: 'src/signin-witness.js', read: ['const instanceAnswer = SR.storeAnswer(read, { valid: instanceValid });'], verdict: U, was: X, why: 'held through the store-read law (B-dc3f (1), 主开发 r3336 / r3340, line 729 with its cure): its one read is answered by src/store-read.js — data is the id, missing (ENOENT) is no id, unreadable or torn is NO ANSWER: src/auth.js holds it by the family helper (src/store-read-hold.js, _idHoldStart, code signin-id-held), nothing is minted over it, torn bytes kept aside once, read again off the loop and its lift judges the start again; before: a failed or torn read was no id and the same start minted a new id over it' },
  { store: 'maintenance.json', module: 'src/server/ops-routes.js', read: ['const a = require(\'../store-read.js\').storeAnswer(read, { valid: maintValid });'], verdict: U, was: X, why: 'held through the store-read law (r3333 unit 3, lane lg-group-parents): no banner while unread, every POST refused by name before anything changes; at its read the banner is back and broadcast; torn bytes kept aside once' },
  { store: 'plugin-registry.json', module: 'src/server/plugin-loader.js', read: ['const a0 = SR.storeAnswer(read, { valid: REGISTRY_SHAPE });'], verdict: U, was: X, why: 'held through the store-read law (line 740, B-f276, 主开发 r3305 (c) / r3634: src/store-read-hold.js): a failed read is held — nothing written over it, every writer refused by name (503 plugin_registry_unread), no plugin started, no consent asked or recorded, no shim removed, an install refused with its upload removed; read again off the loop; torn bytes kept aside once, then it starts empty; before: which plugins were on, their consent records and install sources, written over' },
  { store: 'voice-suggestions.json', module: 'src/server/voice-teach-engine.js', read: ['const a = SR.storeAnswer(read, { valid: ledgerValid });'], verdict: U, was: X, why: 'held through the store-read law (r3333 unit 3 + r3770, lane lg-group-parents): no word is proposed while unread; a person\'s adds and dismissals wait in memory and are replayed at the read (a restart before it loses them, said in the journal at the hold); nothing written over; torn bytes kept aside once' },
  { store: 'browser-env/bindings.json', module: 'src/server/browser-bindings.js', read: ['try { text = fs.readFileSync(file, \'utf8\'); } catch (e) {', 'heldOf(file, opts).hold.start(SR.storeAnswer({ error: e }, { valid: BINDINGS_SHAPE }));'], verdict: U, was: X, why: 'unknown is never empty (2.369.416); r3585 / r3786 (card-door-in-chat, line 821): UNDER THE LAW — a failed read or torn bytes engage ONE hold for the file (every instance\'s): nothing ends, nothing is written over it, read again off the loop; torn bytes kept aside and the map rebuilt from the conversations\' records by a bounded child; a binding the records cannot give is made again from the kept folders\' notes, only into an empty place (restoreFromNotes). The notes migration reads it too (the same shape; it writes nothing here)' },
  { store: 'tls/state.json', module: 'src/server/tls.js', read: ['const a = SR.storeAnswer(read, { valid: isState });'], verdict: U, was: X, why: 'held through the store-read law (B-f276, lane hub-loop-stalls, r4719: src/store-read-hold.js; the HTTPS item is neither filed nor resolved while held and nothing is written over it); before: the open HTTPS For-you item\'s link: filed twice, the old one never closed' },
  { store: 'job-notifications-read/<conversation>.md', module: 'src/jobs.js', read: ['try { prev = fs.readFileSync(file, \'utf-8\'); } catch { }'], verdict: X, fp: '097b82b3accd', lane: NOT_ROUTED, why: 'the conversation\'s history of drained job notifications (a bare write of the new block)' },
  { store: 'usage-cache/__models__.json', module: 'src/server/cli-env.js', read: ['try { list = require(\'../usage-cache-write.js\').readCacheJson(fp) || []; } catch { }'], verdict: X, fp: '4ff57e925cd2', lane: NOT_ROUTED, why: 'learned model ids leave the list until each model serves again' },
  { store: 'usage-history/otel-token', module: 'src/server/otel-ingest.js', read: ['const a = SR.storeAnswer(read, { parse: parseToken, valid: TOKEN_SHAPE });'], verdict: U, was: X, why: 'held through the store-read law (B-f276 family unit 2, lane bl-loop-a): a failed read holds the file (nothing written over it; sessions meanwhile carry this run\'s own value), read again off the loop; torn bytes kept aside once; before: a new token is minted over it: every surviving session\'s exporter is refused, its attribution lost until it restarts' },
  { store: 'usage-history/pricing.json', module: 'src/usage-history.js', read: ['const a0 = SR.storeAnswer(read, { valid: PRICING_SHAPE });'], verdict: U, was: X, why: 'held through the store-read law (lane bl-ci, B-f276 family unit 2, line 828: src/store-read-hold.js, prices_unread); before: the person\'s edited prices, discounts and tier overrides reverted to the defaults' },
  { store: 'decision-memo.json', module: 'src/server/decision-engine.js', read: ['{ const a = SR.storeAnswer(readOf(F.memo), { valid: MEMO_SHAPE }); if (memoHold.start(a) === \'data\') memoLoad(a.value); }'], verdict: U, was: X, why: 'held through the store-read law (B-f276 family, lane bl-loop-a, 2.369.419: src/store-read-hold.js): a memo not read refuses every paid judgment (memo-unread), nothing written over it; before: every remembered judge answer: the paid judge is asked again' },
  { store: 'decision-usage.json', module: 'src/server/decision-engine.js', read: ['{ const a = SR.storeAnswer(readOf(F.usage), { valid: USAGE_SHAPE }); if (usageHold.start(a) === \'data\') usage = a.value; }'], verdict: U, was: X, why: 'held through the store-read law (B-f276 family, lane bl-loop-a, 2.369.419: src/store-read-hold.js): a counter (or a journal) not read refuses every paid judgment (spend-unread), nothing written over it; before: the learned rate and today\'s hits; with the journal unread too, today\'s spend started at 0' },
  { store: 'decision-journal.jsonl', module: 'src/server/decision-engine.js', read: ['try { fd = fs.openSync(F.journal, \'r\'); } catch (e) {', '} catch (e) { return { unread: SR.codeOf(e) }; } finally {'], verdict: H, fp: '5f1e65b7c2da', was: X, why: 'an unread journal is «not known»: no trim this start, the writes are appends through the store writer (B-0248, on the train); a line that does not parse is kept by every trim as it is, outside its count of rows (r3739, 2.369.419: the gap closed); since B-f276 (lane bl-loop-a) it also makes the day\'s spend unknown: every paid judgment refused (spend-unread), nothing appended, read again off the loop' },
  { store: 'channels/<account>/people.json', module: 'src/channel-store.js', read: ['const a = SR.storeAnswer(read, { valid: PEOPLE_OK });'], verdict: U, was: X, why: 'held through the store-read law (bl-mail, line 698, on the train); before: the account\'s own id and every learned author name' },
  { store: 'channels/attachments/<account>/lru.json', module: 'src/channel-store.js', read: ['try { read = { text: fs.readFileSync(lruFile(adapterId), \'utf-8\') }; } catch (error) { read = { error }; }', 'return lruAnswer(adapterId, read);'], verdict: D, fp: '011a58f7dd23', was: X, why: 'a failed or torn ledger starts empty and is REBUILT from the account\'s folder walk (lruStartRebuild; bl-mail, line 698, on the train): nothing lost' },
  { store: 'channels/webhook/callers.json', module: 'src/channels/webhook.js', read: ['const a = SR.storeAnswer(read, { valid: CALLERS_SHAPE });'], verdict: U, was: X, why: 'held through the store-read law (2.369.417, the store-read family: src/store-read-hold.js or its own hold); before: every webhook path and caller (token hashes, sealed tokens, pairings): every integration registered again' },
  { store: 'channels/webhook/pair-pending.json', module: 'src/channels/webhook.js', read: ['const a = SR.storeAnswer(read, { valid: PENDING_SHAPE });'], verdict: U, was: X, why: 'held through the store-read law (2.369.417, the store-read family: src/store-read-hold.js or its own hold); before: the last ten minutes\' pairing codes stop working' },
  { store: 'session-meta/<id>.json', module: 'src/server/session-stdout.js', read: ['const a = require(\'../store-read.js\').storeAnswer(read, { valid: metaValid });'], verdict: U, was: X, why: 'held through the store-read law (2.369.417, the store-read family: src/store-read-hold.js or its own hold); before: the conversation\'s record (name, cwd, account, groups, model lock, browser key, resume id) becomes a stub or is deleted; five removers read it' },
  { store: 'usage-cache/<account>.json', module: 'src/usage-cache-write.js', read: ['return { ...SR.storeAnswer(read), buf: read.buf || null };'], verdict: U, was: X, why: 'held through the store-read law (2.369.417, the store-read family: src/store-read-hold.js or its own hold); before: the lanes a reading did not state (caps, stamps, reset credits, overage): unattended turns can flip from refuse to allow' },
  { store: 'telemetry/.instance-id', module: 'src/telemetry.js', read: ['const a = SR.storeAnswer(read, { parse: IID_PARSE, valid: IID_SHAPE });'], verdict: U, was: X, why: 'held through the store-read law (r4721, lane lg-vault-stages: src/store-read-hold.js with its own parse — this life answers its own id from memory while held, the file read again off the loop; torn bytes kept aside, then this life\'s id is the file\'s); before: an EIO minted a new id over it' },
  { store: 'archive/task-plans-legacy.json', module: 'src/server/migrations.js', read: ['const prev = MR.readJson(out, \'archive/\' + path.basename(out)) || {};', 'JSON.stringify({ ...prev, ...archived }, null, 2)'], verdict: H, was: X, fp: '4e36ab09db53', why: 'its migration\'s own hold since MG1 (r2929, lane lg-group-parents): an earlier archive there and unread or torn is never written over with this run\'s alone — the migration is not run, nothing recorded, the next start tries again' },
  { store: 'archive/task-group-archived-members.json', module: 'src/server/migrations.js', read: ['const prev = MR.readJson(out, \'archive/\' + path.basename(out)) || {};', 'const merged = { ...prev };'], verdict: H, was: X, fp: '2a511ecece3e', why: 'its migration\'s own hold since MG1 (r2929, lane lg-group-parents): an earlier archive there and unread or torn is never written over with this run\'s alone — the migration is not run, nothing recorded, the next start tries again' },
  { store: 'channels/<account>/search-memo.json', module: 'src/channel-store.js', read: ['try { return JSON.parse(fs.readFileSync(file, \'utf-8\')); } catch { return null; }'], verdict: X, fp: '00c77a250bbc', bound: ['src/channel-store.js', 'const searchMemoFile = (adapterId) => path.join(dir, safeSeg(adapterId), \'search-memo.json\');'], lane: NOT_ROUTED, why: 'the remembered vendor search answers, asked of the vendor again' },
  { store: 'channels/<account>/feed-misses.json', module: 'src/channel-store.js', read: ['try { return JSON.parse(fs.readFileSync(file, \'utf-8\')); } catch { return null; }'], verdict: X, fp: '00c77a250bbc', bound: ['src/channel-store.js', 'const feedMissFile = (adapterId) => path.join(dir, safeSeg(adapterId), \'feed-misses.json\');'], lane: NOT_ROUTED, why: 'the named misses and the learned index-lag margin' },
  { store: 'agy-subs/<account>/', module: 'src/harnesses/antigravity.js', read: ['let st = null; try { st = rd ? rd.stat(path.join(dir, TOKEN_REL)) : fs.statSync(path.join(dir, TOKEN_REL)); } catch { st = null; }'], verdict: X, fp: '1c4d68b9cca0', lane: NOT_ROUTED, why: 'the token is a stat only, never written; seedHomeRoot writes the account folder\'s settings.json over it when existsSync is false, an EIO included (create, sign-in again, import)' },
  { store: '.agent-hooks-optout', module: 'src/server/agent-tool-generators.js', read: ['if (auto && fs.existsSync(HOOK_OPTOUT_FILE)) return (typeof homeRead === \'function\' ? homeRead(ourRowsOnDisk, undefined, { cls: \'opted-out-look\' }) : ourRowsOnDisk().then((value) => ({ value }))).then((r) => (r.value ? (r.value.some((x) => x.ours) ? stripAgentHookEntries({ ifOptedOut: true }).then((removed) => ({ optedOut: true, removed })) : { optedOut: true }) : optedOutUnread(r)));', 'if (!auto) { try { fs.rmSync(HOOK_OPTOUT_FILE, { force: true }); } catch {} }'], verdict: X, fp: '626960cfc84c', lane: NOT_ROUTED, why: 'a marker read back to decide: existsSync is false on an EIO, so the automatic road writes the hook entries over the person\'s opt-out (stillOptedOut already tells unreadable apart)' },
  { store: 'jobs.lock', module: 'src/jobs.js', read: ['const cur = JSON.parse(fs.readFileSync(this.lockFile, \'utf-8\'));', '} catch { }'], verdict: X, fp: '434e47b1e99d', lane: NOT_ROUTED, why: 'a failed read while a live engine holds the lock takes it and writes over it: two engines on one jobs.json' },
  { store: 'job-logs/<run>/', module: 'src/jobs.js', read: ['const f = path.join(this._ctlDir(job, run.startedAt), name);', 'try { return JSON.parse(fs.readFileSync(f, \'utf-8\')); } catch { return null; }'], verdict: X, fp: '4c9735f3f1da', lane: NOT_ROUTED, why: 'its exit.json is written once by the job\'s wrapper; a failed or torn read is «no exit record», and that answer is saved into the job record: the run\'s real end is lost, a finished task may run twice' },
  { store: 'usage-history/.attrib-emptied.json', module: 'src/reading-repair.js', read: ['const prev = _readJson(f);', 'try { _writeAtomic(f, JSON.stringify(merged)); } catch { }'], verdict: X, fp: 'bc289f4c873e', lane: NOT_ROUTED, why: 'the earlier list of emptied conversations: a later re-bake leaves their spend on the refuted account' },
  { store: 'channels/msgs/<account>/<conv>.ndjson', module: 'src/channel-store.js', read: ['try { lines = fs.readFileSync(fp, \'utf-8\').split(\'\\n\').filter(Boolean); } catch (e) { if (e.code !== \'ENOENT\') throw e; }'], verdict: X, fp: '9530d8669b28', lane: NOT_ROUTED, why: 'torn lines only (an EIO is held): a message or reaction line that no longer parses is deleted, nothing kept aside' },
  { store: 'agentd/host-<id>.token', module: 'src/server/host-tokens.js', read: ['const a = SR.storeAnswer(read, { parse: TOKEN_PARSE, valid: TOKEN_SHAPE });'], verdict: U, was: X, why: 'held through the store-read law (r4721, lane lg-vault-stages: src/store-read-hold.js with its own parse — the link refused by name while held, nothing written over the token; torn bytes kept aside, then a fresh token: the machine paired again); before: a machine\'s link token minted over it while the vault is not set up, and the hub\'s hello refused until the machine was paired again' },
  // ── NOT A STORE ──
  { store: 'job-secrets.json', module: 'src/server/migrations.js', read: ['st = MR.lstat(from, JOB_SECRETS_FILE);'], verdict: N, why: 'retired: only the one-time migration renames it (MG1: a stat that fails but «not there» means the migration has not run)' },
  { store: 'boot-trace.json', module: 'src/server/boot-trace.js', read: ['fs.promises.writeFile(file + \'.tmp\', JSON.stringify(rep, null, 1)).then(() => fs.promises.rename(file + \'.tmp\', file)).catch(() => { }).finally(() => resolveDone(rep));'], verdict: N, why: 'a report written once a boot; GET /api/boot-trace answers from memory' },
  { store: 'grants-audit.jsonl', module: 'src/server/grants-store.js', read: ['fs.appendFileSync(auditFile, JSON.stringify(line) + \'\\n\', { mode: 0o600 });'], verdict: N, why: 'an append-only audit trail; nothing reads it back' },
  { store: 'browser-audit.jsonl', module: 'src/server/browser-keeper.js', read: ['try { fs.mkdirSync(dataDir, { recursive: true }); fs.appendFileSync(path.join(dataDir, AUDIT_FILE), line + \'\\n\', { mode: FILE_MODE }); }'], verdict: N, why: 'appended only; nothing reads it back' },
  { store: 'browser-lineage-journal.ndjson', module: 'src/server/browser-keeper.js', read: ['if (size > LEDGER_MAX) { const txt = fs.readFileSync(f, \'utf8\'); const cut = txt.indexOf(\'\\n\', txt.length - (LEDGER_MAX >> 1)); const tail = cut >= 0 ? txt.slice(cut + 1) : \'\'; const tmp = f + \'.tmp\'; fs.writeFileSync(tmp, tail, { mode: 0o600 }); fs.renameSync(tmp, f); }'], verdict: N, why: 'a ring read only by its own trim, never read back' },
  { store: 'window-audit.jsonl', module: 'src/server/window-targets-engine.js', read: ['try { fs.appendFileSync(path.join(dataDir, AUDIT_FILE), JSON.stringify({ at: now(), origin: ORIGIN, ...line }) + \'\\n\'); }'], verdict: N, why: 'appended only; nothing reads it back' },
  { store: 'automation-audit.jsonl', module: 'src/server/automation-engine.js', read: ['try { text = fs.readFileSync(AUDIT, \'utf8\'); } catch { return []; }'], verdict: N, why: 'an audit ring read only to show it; never written over from a read' },
  { store: 'csp-reports.jsonl', module: 'src/server/csp-reports.js', read: ['const textOf = (f) => { try { return fs.readFileSync(f, \'utf8\'); } catch { return null; } }; // the line file (or its .1), or null'], verdict: N, why: 'appended; its rewrite reads first and skips on a failed read (a duplicate line at worst)' },
  { store: 'device-audit.jsonl', module: 'src/device-audit.js', read: ['const b = Buffer.alloc(len); fs.readSync(fd, b, 0, len, pos);'], verdict: N, why: 'an audit ring read only to show it; never written over from a read' },
  { store: 'exit-audit.jsonl', module: 'src/exit-proxy.js', read: ['const b = Buffer.alloc(len); fs.readSync(fd, b, 0, len, pos);'], verdict: N, why: 'an audit ring read only to show it; never written over from a read' },
  { store: 'usage-probe-log.ndjson', module: 'src/server/usage-probe-log.js', read: ['let txt = \'\'; try { txt = fs.readFileSync(path.join(dataDir, name), \'utf8\'); } catch { continue; }'], verdict: N, why: 'an append ring read only to show it' },
  { store: 'vault-audit.jsonl', module: 'src/server/vault-engine.js', read: ['function usesOf(conv, { limit = VU.USES_MAX } = {}) {', 'fd = fs.openSync(path.join(dataDir, AUDIT_FILE), fs.constants.O_RDONLY'], verdict: N, why: 'an audit log read only to show it; appends only' },
  { store: '.no-home', module: 'src/ledger-slot-backfill.js', read: ['const uh = new UsageHistory({ dataDir, homeDir: path.join(dataDir, \'.no-home\') });'], verdict: N, why: 'a stand-in path, never made' },
  { store: 'archive/readings-foreign-usage-cache.ndjson', module: 'src/reading-repair.js', read: ['fs.appendFileSync(path.join(archiveDir, name), rows.map((r) => JSON.stringify(r)).join(\'\\n\') + \'\\n\');'], verdict: N, why: 'append-only, never read' },
  { store: 'archive/readings-window-mismatch.ndjson', module: 'src/reading-repair.js', read: ['let txt = \'\'; try { txt = fs.readFileSync(f, \'utf-8\'); } catch (e) { MR.absentOr(e, f); return out; }'], verdict: N, why: 'append-only evidence, rolled by rename (MG1: inside a migration\'s run an unread file means the migration has not run)' },
  { store: 'browser-tools/install-running.json', module: 'src/server/browser-installs.js', read: ['let m = null; try { m = JSON.parse(fs.readFileSync(installMarker(), \'utf8\')); } catch { return null; }'], verdict: N, why: 'a child\'s pid marker' },
  { store: 'spend-budget.lock', module: 'src/server/spend-guard.js', read: ['try { text = fs.readFileSync(lockFile, \'utf-8\'); mt = fs.statSync(lockFile).mtimeMs; }'], verdict: N, why: 'a lock: unreadable is held, never stale' },
  { store: 'server.pid', module: 'server.js', read: ['try { fs.writeFileSync(path.join(__dirname, \'data\', \'server.pid\'), String(process.pid)); } catch {}'], verdict: N, why: 'written, never read by the hub' },
  { store: 'vnc.pid', module: 'src/vnc.js', read: ['try { if (parseInt(fs.readFileSync(this._pidFile, \'utf-8\'), 10) === own.pid) fs.unlinkSync(this._pidFile); } catch {}'], verdict: N, why: 'read only to unlink its own' },
  { store: 'update.log', module: 'src/server/ops-routes.js', read: ['if (Date.now() - st.mtimeMs < 10 * 60 * 1000) {', 'const fd = fs.openSync(_updateLogPath, \'r\');'], verdict: N, why: 'a log read for its tail' },
  { store: 'pool-journal.log', module: 'src/server/migrations.js', read: ['if (jf) journalText = MR.readText(jf, path.basename(jf));'], verdict: N, why: 'an operator\'s input, never written (MG1: a journal found and then unread means the migration has not run)' },
  { store: 'opencode-serve/README.txt', module: 'src/opencode-serve.js', read: ['try { fs.writeFileSync(path.join(dataDir, \'opencode-serve\', \'README.txt\'), SERVE_CWD_README); } catch { }'], verdict: N, why: 'written from source, never read' },
  { store: 'channels/audit.ndjson', module: 'src/channel-store.js', read: ['const fd = fs.openSync(auditFile, \'r\');'], verdict: N, why: 'append-only; the roll copies before it unlinks' },
  { store: 'exit-tombs/<sock>', module: 'src/server/session-stdout.js', read: ['fs.writeFileSync(path.join(tombDir, `${id}.tail`), tail);'], verdict: N, why: 'written once an exit, never read' },
  { store: 'chat-frames/<id>', module: 'src/server/user-input.js', read: ['fs.writeFileSync(fp, stdinPayload);'], verdict: N, why: 'one-shot hand-off files' },
  { store: 'published-pages/<id>', module: 'src/server/published-pages.js', read: ['try { shimCache = { key, buf: injectShim(fs.readFileSync(fp)) }; }'], verdict: N, why: 'served copies' },
  { store: 'cli-self-measure/run-<n>', module: 'src/server/cli-self-measure.js', read: ['let names = []; try { names = await fs.promises.readdir(scratchRoot); } catch { names = []; }'], verdict: N, why: 'leftover scratch' },
  { store: 'incidents/<id>/bundle.json', module: 'src/server/incident-wiring.js', read: ['try { const b = JSON.parse(fs.readFileSync(path.join(INCIDENTS_DIR, d, \'bundle.json\'), \'utf8\')); out.push({ id: b.id, at: b.at, note: b.note }); } catch {}'], verdict: N, why: 'crash reports, read only to list them' },
  { store: 'telemetry/<shard>', module: 'src/telemetry-summary-worker.js', read: ['for (const fn of files) { try { texts.push(fs.readFileSync(path.join(dir, fn), \'utf-8\')); } catch { } }'], verdict: N, why: 'append-only shards' },
  { store: 'mount-logs/<id>.log', module: 'src/mounts.js', read: ['const fd = fs.openSync(path.join(this._logDir, `${id}.log`), \'r\');'], verdict: N, why: 'append-only logs' },
  { store: 'channels/archive/audit-<day>.ndjson', module: 'src/channel-store.js', read: ['fs.appendFileSync(path.join(archiveDir, `audit-${auditDay}.ndjson`), fs.readFileSync(auditFile));'], verdict: N, why: 'append-only, never read back' },
  { store: 'ssh/<host>.key', module: 'src/hosts.js', read: ['fs.writeFileSync(kp, body, { mode: 0o600 });'], verdict: N, why: 'written from a person\'s paste or import; the hub never reads it' },
]);

// THE RATCHET'S BIRTH (r3007, at the census's base d458fc27d): every store written over that day, its read and fp. NEVER EDITED.
const WRITTEN_OVER_AT_BIRTH = Object.freeze([
  { store: 'vault-grants.json', module: 'src/server/vault-totp.js', read: ['try { raw = JSON.parse(fs.readFileSync(FILE, \'utf8\')); }', 'return { grants: (raw && Array.isArray(raw.grants) ? raw.grants : []).map(T.grantOf).filter(Boolean), bad: false };'], fp: 'ce99edf92a58' },
  { store: 'cli-self-measure.json', module: 'src/server/cli-self-measure.js', read: ['loading = fs.promises.readFile(file, \'utf8\').then((txt) => {', '(e) => {'], fp: 'd97cff5edefd' },
  { store: 'browser-kept.json', module: 'src/server/browser-kept.js', read: ['try { raw = JSON.parse(fs.readFileSync(file, \'utf8\')); }', 'catch (e) {'], fp: 'a43267a70dd8' },
  { store: 'msg-stash.json', module: 'src/server/conversation-deliver.js', read: ['try { stash = JSON.parse(fs.readFileSync(stashFile, \'utf-8\')) || {}; } catch { }'], fp: '7304833a7f79' },   // stale-pins: kept — the store's read as it was born (the census's birth record)
  { store: 'providers.json', module: 'src/server/provider-store.js', read: ['const raw = JSON.parse(fs.readFileSync(file, \'utf-8\'));', '} catch (e) { if (e && e.code !== \'ENOENT\') log(`[providers] ${file} unreadable (${e.code || e.message}) — no third-party providers`); }'], fp: 'ef397b4d8cfa' },
  { store: 'setting-holds.json', module: 'src/server/setting-holds.js', read: ['try { raw = await fs.promises.readFile(file, \'utf8\'); } catch (e) { if (e && e.code !== \'ENOENT\') unread(e.message); return list(); }'], fp: '98060ad6ebad' },
  { store: 'migrations.json', module: 'src/migration-runner.js', read: ['try { ledger = JSON.parse(fs.readFileSync(ledgerPath, \'utf-8\')); } catch { }'], fp: '81e4e8e68af9' },
  { store: 'automation-keys.json', module: 'src/server/automation-engine.js', read: ['try { raw = JSON.parse(fs.readFileSync(FILE, \'utf8\')); } catch (e) { if (!(e && e.code === \'ENOENT\')) log(`automation-keys.json could not be read (${e.code || e.message}) — no key is usable until it is fixed`); return { keys: [], grants: [], opened: [], bad: !(e && e.code === \'ENOENT\') }; }'], fp: 'e574fea80550' },
  { store: 'vault-use-marks.json', module: 'src/server/vault-use-grants.js', read: ['let raw = null; try { raw = JSON.parse(fs.readFileSync(MARK_FILE, \'utf-8\')); } catch { return; }'], fp: '17879237ff20' },
  { store: 'vault-run-tools.json', module: 'src/server/vault-run-door.js', read: ['const toolsLoad = () => { if (toolsCache) return toolsCache; let o = null; try { o = JSON.parse(readBounded(TOOLS_FILE, STORE_MAX).toString(\'utf8\')); } catch { o = null; } toolsCache = (o && o.tools && typeof o.tools === \'object\') ? { v: 1, tools: o.tools } : { v: 1, tools: {} }; return toolsCache; };'], fp: 'e22eaa658792' },
  { store: 'vault-run.json', module: 'src/server/vault-run-door.js', read: ['try { raw = JSON.parse(readBounded(FILE, STORE_MAX).toString(\'utf8\')); } catch (e) { if (!(e && e.code === \'ENOENT\')) why = `unreadable (${e.code || \'not JSON\'})`; }'], fp: '305134ee7825' },
  { store: 'accounts.json', module: 'src/accounts.js', read: ['const parsed = JSON.parse(fs.readFileSync(this._file, \'utf-8\'));', '} catch { /* fresh install */ }'], fp: '009273459266' },   // stale-pins: kept — the store's read as it was born (the same words left login-expiry-watch.js, r3003 (d))
  { store: 'mounts.json', module: 'src/mounts.js', read: ['try { this._state = JSON.parse(fs.readFileSync(this._file, \'utf-8\')); } catch { /* fresh */ }'], fp: '8d72e0402fc8' },
  { store: 'mount-tokens.json', module: 'src/webdav.js', read: ['try { this._state = JSON.parse(fs.readFileSync(this._file, \'utf-8\')); } catch { /* fresh */ }'], fp: '8d72e0402fc8' },
  { store: 'plugins.json', module: 'src/plugins.js', read: ['try { this._state = JSON.parse(fs.readFileSync(this._file, \'utf-8\')); } catch { this._state = { plugins: {} }; }'], fp: 'aeb04fdb225a' },
  { store: 'published-pages.json', module: 'src/server/published-pages.js', read: ['try { store = JSON.parse(fs.readFileSync(storeFile, \'utf-8\')) || { pages: [] }; } catch { }'], fp: '46a324be451f' },
  { store: 'auto-resume.json', module: 'src/server/auto-resume.js', read: ['const raw = JSON.parse(fs.readFileSync(file, \'utf-8\'));', '} catch { }'], fp: '60dcc39e5b86' },
  { store: 'session-status.json', module: 'src/session-status.js', read: ['this._state = timedSync(\'session-status.read\', () => JSON.parse(fs.readFileSync(this._file, \'utf-8\')));', '} catch { /* fresh */ }'], fp: 'bef7bb77bc0b' },
  { store: 'channels/api-proposals.json', module: 'src/server/channel-api.js', read: ['const state = (() => { try { const j = JSON.parse(fs.readFileSync(stateFile, \'utf8\')); return { proposals: j.proposals || {}, shapes: Array.isArray(j.shapes) ? j.shapes : [] }; } catch { return { proposals: {}, shapes: [] }; } })();'], fp: 'b4da80cc0f58' },
  { store: 'designs.json', module: 'src/server/design-engine.js', read: ['try { store = JSON.parse(fs.readFileSync(storeFile, \'utf8\')) || { designs: [] }; } catch { /* first boot */ }'], fp: 'b0ea0a935547' },
  { store: 'decision-examples.json', module: 'src/server/channels-attention.js', read: ['const j = JSON.parse(fs.readFileSync(FILE, \'utf8\'));', '} catch { return []; }'], fp: 'c0f7fcea5a4c' },
  { store: 'feedback.json', module: 'src/server/feedback-store.js', read: ['const raw = JSON.parse(fs.readFileSync(file, \'utf-8\'));', '} catch { /* none yet (ENOENT) or unreadable: an empty ring — the next report writes a whole file */ }'], fp: 'c9590c6332a6' },
  { store: 'app-proposals.json', module: 'src/server/apps-engine.js', read: ['if (file) { try { const j = JSON.parse(fs.readFileSync(file, \'utf8\')); if (j && Array.isArray(j.proposals)) store = { proposals: j.proposals, helpers: Array.isArray(j.helpers) ? j.helpers : [] }; } catch (e) { if (e.code !== \'ENOENT\') log.warn?.(`[apps] ${STORE_FILE} unreadable (${e.message}) — starting empty, the file left in place`); } }'], fp: '373107071a88' },
  { store: 'feedback-outbox.json', module: 'src/server/feedback-forward.js', read: ['const raw = JSON.parse(fs.readFileSync(file, \'utf-8\'));', '} catch { /* none yet (ENOENT) or unreadable: an empty outbox — the next report writes a whole file */ }'], fp: '9fda48d17ede' },
  { store: 'msg-retry.json', module: 'src/server/conversation-deliver.js', read: ['try { rawText = fs.readFileSync(retryFile, \'utf-8\'); } catch { rawText = null; }'], fp: '928bf522204d' },
  { store: 'port-forwards.json', module: 'src/port-forward.js', read: ['try { this._state = JSON.parse(fs.readFileSync(this.file, \'utf-8\')); } catch { this._state = { forwards: [] }; }'], fp: 'df4726e788cf' },
  { store: 'instance-url.json', module: 'src/server/instance-url.js', read: ['try { Object.assign(state, JSON.parse(fs.readFileSync(file, \'utf-8\')) || {}); } catch { }'], fp: '02788fb91f46' },
  { store: 'browser-forgotten.json', module: 'src/server/browser-trace.js', read: ['function loadForgotten() { if (forgotten) return forgotten; try { const j = JSON.parse(fs.readFileSync(forgottenFile, \'utf8\')); forgotten = Array.isArray(j.forgotten) ? j.forgotten : []; } catch { forgotten = []; } return forgotten; }'], fp: 'e0f15973f84c' },
  { store: 'usage-reset-claims.json', module: 'src/usage-reset-claim.js', read: ['try { j = file ? JSON.parse(fs.readFileSync(file, \'utf8\')) : null; } catch (e) { if (e && e.code !== \'ENOENT\') unreadable = e.code || \'not JSON\'; }'], fp: '4261c869ec3c' },
  { store: 'stash-handover.json', module: 'src/server/stash-handover.js', read: ['try { raw = fs.readFileSync(file, \'utf-8\'); } catch { raw = null; }'], fp: 'bf68daae1de2' },
  { store: 'login-expiry.json', module: 'src/server/login-expiry-watch.js', read: ['const parsed = JSON.parse(fs.readFileSync(file, \'utf-8\'));', '} catch { /* fresh install */ }'], fp: 'eaff1cce21d5' },   // stale-pins: kept — the store's read as it was born (the census's birth record)
  { store: 'auto-cli-state.json', module: 'src/server/auto-cli-loop.js', read: ['let text = null; try { text = fs.readFileSync(fp, \'utf-8\'); } catch (e) { if (e && e.code !== \'ENOENT\') warn(`[auto-cli] pacing state unreadable, starting empty: ${e.message}`); return st; }'], fp: '2d71db184a61' },
  { store: 'device-upgrades.json', module: 'src/server/device-upgrade-watch.js', read: ['try { const j = JSON.parse(fs.readFileSync(file, \'utf-8\')); if (j && j.devices && typeof j.devices === \'object\') ledger = j.devices; if (j && j.gone && typeof j.gone === \'object\') gone = j.gone; } catch { /* first run */ }'], fp: '2bcbeea600b9' },
  { store: 'window-leases.json', module: 'src/server/window-targets-engine.js', read: ['const j = JSON.parse(fs.readFileSync(leaseFile, \'utf8\'));', '} catch (e) { if (e && e.code !== \'ENOENT\') log.warn?.(`[window] ${LEASE_FILE} unreadable — starting with no leases: ${e.message}`); }'], fp: '319854ffbe68' },
  { store: 'window-reach.json', module: 'src/server/window-targets-engine.js', read: ['const j = JSON.parse(fs.readFileSync(reachFile, \'utf8\'));', '} catch (e) { if (e && e.code !== \'ENOENT\') log.warn?.(`[window] ${REACH_FILE} unreadable — every window starts in auto mode: ${e.message}`); }'], fp: 'e6f0d8456d4a' },
  { store: 'dial-health.json', module: 'src/server/dial-health-watch.js', read: ['try { const j = JSON.parse(fs.readFileSync(file, \'utf-8\')); if (j && j.hosts && typeof j.hosts === \'object\') ledger = j.hosts; } catch { /* first run */ }'], fp: '33ca3ecb290a' },
  { store: 'browser-login-reminders.json', module: 'src/server/browser-logins.js', read: ['try { raw = fs.readFileSync(remindFile, \'utf8\'); } catch { return; }'], fp: 'ce732e02d454' },   // stale-pins: kept — the store's read as it was born (the census's birth record)
  { store: 'turn-carry-outstanding.json', module: 'src/turn-carry.js', read: ['else raw = fs.readFileSync(fd, \'utf8\');', '} catch (e) { if (e && e.code !== \'ENOENT\') sayOnce(\'read\', `could not be read (${e.code || e.message}) — started empty; the restart line cannot be said for what it held`); }'], fp: '10c0bb510d8f' },   // stale-pins: kept — the store's read as it was born (the census's birth record)
  { store: 'sysinfo-history.json', module: 'src/sysinfo.js', read: ['const d = JSON.parse(fs.readFileSync(_histFile, \'utf8\'));', '} catch { }'], fp: '19e45f88498d' },
  { store: 'cli-registration.json', module: 'src/server/cli-registration.js', read: ['try { const j = JSON.parse(fs.readFileSync(stateFile, \'utf8\')); if (j && j.seen && typeof j.seen === \'object\') seen = j.seen; } catch { }'], fp: '02a37732d728' },   // stale-pins: kept — the store's read as it was born (the census's birth record)
  { store: 'hook-root-notice.json', module: 'src/server/hook-root-watch.js', read: ['let memo = null; try { memo = JSON.parse(fs.readFileSync(memoFile, \'utf-8\')); } catch { memo = null; }'], fp: '47eeb2155443' },   // stale-pins: kept — the store's read as it was born (the census's birth record)
  { store: 'browser-takeovers.json', module: 'src/server/browser-keeper.js', read: ['try { j = JSON.parse(fs.readFileSync(REQUESTS_FILE, \'utf8\')); } catch (e) { if (e && e.code !== \'ENOENT\') log.warn?.(`[browser] ${path.basename(REQUESTS_FILE)} unreadable — no takeover requests loaded: ${e && e.message}`); }'], fp: '16376f4b94b3' },
  { store: 'opencode-serve.json', module: 'src/opencode-serve.js', read: ['function readRecord() { try { const r = JSON.parse(fs.readFileSync(recordPath, \'utf8\')); return r && Number.isInteger(r.port) && r.port > 0 ? r : null; } catch { return null; } }'], fp: '1d27c559cbaf' },
  { store: 'doc-owners.json', module: 'src/server/doc-engine.js', read: ['if (file) try { const j = JSON.parse(fs.readFileSync(file, \'utf-8\')); if (j && typeof j === \'object\') m = { s: j.s && typeof j.s === \'object\' ? j.s : {}, d: j.d && typeof j.d === \'object\' ? j.d : {}, h: j.h && typeof j.h === \'object\' ? j.h : {} }; } catch (e) { if (e.code !== \'ENOENT\') log(\'[doc] doc-owners.json unreadable:\', e.message); }'], fp: 'f0349b5bd33d' },
  { store: 'agent-door.json', module: 'src/server/agent-listener.js', read: ['try { const j = JSON.parse(await fsp.readFile(stateFile, \'utf8\')); const n = Number(j && j.port); return inRange(n, avoid) ? n : 0; } catch { return 0; }'], fp: '1f80f8ab0f79' },
  { store: 'browser-passkeys.json', module: 'src/server/browser-dialogs.js', read: ['const pkRead = () => { if (!pkCache) { let raw = null; try { raw = pks.read(); } catch (e) { say(\'pk-read:\' + (e && e.message), `the passkey store could not be read — ${e && e.message}`); } pkCache = PS.normalizeStore(raw); } return pkCache; };'], fp: 'a6ddc81ceb9d' },
  { store: 'cli-model-catalog.json', module: 'src/server/cli-model-catalog.js', read: ['if (dataDir) { try { l = JSON.parse(fs.readFileSync(path.join(dataDir, LEDGER), \'utf8\')); } catch { l = null; } }'], fp: '8d2d8c8155bf' },
  { store: 'cli-unmeasured-notice.json', module: 'src/server/cli-unmeasured-notice.js', read: ['try { raw = fs.readFileSync(file, \'utf8\'); } catch (e) { if (!e || e.code !== \'ENOENT\') damage = `unreadable (${(e && e.code) || \'error\'})`; }'], fp: '1c999fcd481d' },
  { store: 'drafts.json', module: 'src/sync-store.js', read: ['const raw = JSON.parse(fs.readFileSync(this.filePath, \'utf-8\'));', '} catch { this.data = {}; this.version = 0; }'], fp: '2b0c81114372' },
  { store: 'stage-sync.json', module: 'src/sync-store.js', read: ['const raw = JSON.parse(fs.readFileSync(this.filePath, \'utf-8\'));', '} catch { this.data = {}; this.version = 0; }'], fp: '2b0c81114372' },
  { store: 'uploads-sync.json', module: 'src/sync-store.js', read: ['const raw = JSON.parse(fs.readFileSync(this.filePath, \'utf-8\'));', '} catch { this.data = {}; this.version = 0; }'], fp: '2b0c81114372' },
  { store: 'settings-sync.json', module: 'src/sync-store.js', read: ['const raw = JSON.parse(fs.readFileSync(this.filePath, \'utf-8\'));', '} catch { this.data = {}; this.version = 0; }'], fp: '2b0c81114372' },
  { store: 'dropline-oauth.json', module: 'src/server/sealed-json.js', read: ['if (text !== null) { try { j = JSON.parse(text); } catch { j = null; } }'], fp: '75547af48ab5' },
  { store: 'extract-journal.json', module: 'src/routes/files.js', read: ['try { return JSON.parse(fs.readFileSync(EXTRACT_JOURNAL, \'utf-8\')) || {}; } catch { return {}; }'], fp: 'c697656e7965' },
  { store: 'instance.json', module: 'src/signin-witness.js', read: ['try { instance = instanceOf(fs.readFileSync(path.join(dataDir, INSTANCE_FILE), \'utf-8\')); } catch { instance = null; }'], fp: 'd8a4e88f1009' },
  { store: 'maintenance.json', module: 'src/server/ops-routes.js', read: ['try { _maintenance = JSON.parse(fs.readFileSync(MAINT_FILE, \'utf-8\')); } catch {}'], fp: 'cda8adbd687e' },
  { store: 'plugin-registry.json', module: 'src/server/plugin-loader.js', read: ['try { registry = { ...registry, ...(JSON.parse(fs.readFileSync(registryFile, \'utf-8\')) || {}) }; } catch { }'], fp: '6af410b1e1d3' },
  { store: 'voice-suggestions.json', module: 'src/server/voice-teach-engine.js', read: ['if (ledgerFile) { try { raw = JSON.parse(fs.readFileSync(ledgerFile, \'utf8\')); } catch (e) { if (e.code !== \'ENOENT\') log.warn?.(`[voice] the suggestion ledger was not read: ${e && e.message}`); } }'], fp: '1c3a4b740dd7' },
  { store: 'browser-env/bindings.json', module: 'src/server/browser-bindings.js', read: ['const raw = JSON.parse(fs.readFileSync(file, \'utf8\'));', '} catch { }'], fp: 'fcda5fb78a48' },
  { store: 'tls/state.json', module: 'src/server/tls.js', read: ['try { Object.assign(state, JSON.parse(fs.readFileSync(stateFile, \'utf8\')) || {}); } catch { }'], fp: '76baa0b08877' },   // stale-pins: kept — the store's read as it was born (the census's birth record)
  { store: 'job-notifications-read/<conversation>.md', module: 'src/jobs.js', read: ['try { prev = fs.readFileSync(file, \'utf-8\'); } catch { }'], fp: '097b82b3accd' },
  { store: 'usage-cache/__models__.json', module: 'src/server/cli-env.js', read: ['try { list = require(\'../usage-cache-write.js\').readCacheJson(fp) || []; } catch { }'], fp: '4ff57e925cd2' },
  { store: 'usage-history/otel-token', module: 'src/server/otel-ingest.js', read: ['try { token = fs.readFileSync(tokenFile, \'utf-8\').trim(); } catch { }'], fp: '40edc4c31851' },
  { store: 'usage-history/pricing.json', module: 'src/usage-history.js', read: ['let p = this._loadJson(this.pricingFile, null);', 'try { this._writeAtomic(this.pricingFile, JSON.stringify(p, null, 2)); } catch {}'], fp: '1008199ec755' },
  { store: 'decision-memo.json', module: 'src/server/decision-engine.js', read: ['const memo = new Map((readJson(F.memo, {}).entries || []).filter((e) => Array.isArray(e) && e.length === 2).slice(-M.MEMO_MAX));'], fp: 'c602eb378c79' },
  { store: 'decision-usage.json', module: 'src/server/decision-engine.js', read: ['let usage = readJson(F.usage, null) || { day: null, byUse: {} };'], fp: 'c48788275e64' },
  { store: 'decision-journal.jsonl', module: 'src/server/decision-engine.js', read: ['const keep = fs.readFileSync(F.journal, \'utf8\').split(\'\\n\').filter(Boolean).filter((l) => { try { return JSON.parse(l).at >= cut; } catch { return false; } }).slice(-JOURNAL_MAX);'], fp: '57628baf1053' },
  { store: 'channels/<account>/people.json', module: 'src/channel-store.js', read: ['try { v = JSON.parse(fs.readFileSync(path.join(dir, safeSeg(adapterId), \'people.json\'), \'utf-8\')); } catch { v = null; }'], fp: '0824a706a07a' },
  { store: 'channels/attachments/<account>/lru.json', module: 'src/channel-store.js', read: ['try { l = JSON.parse(fs.readFileSync(lruFile(adapterId), \'utf-8\')); } catch { l = null; }'], fp: '0d66494ae5f0' },
  { store: 'channels/webhook/callers.json', module: 'src/channels/webhook.js', read: ['try { const d = JSON.parse(fs.readFileSync(file, \'utf-8\')); doc = d && typeof d === \'object\' && d.paths && typeof d.paths === \'object\' ? d : { v: 1, paths: {} }; } catch { doc = { v: 1, paths: {} }; }'], fp: '2ec7cfebdf3b' },
  { store: 'channels/webhook/pair-pending.json', module: 'src/channels/webhook.js', read: ['let d; try { d = JSON.parse(fs.readFileSync(file, \'utf-8\')); } catch { return []; }'], fp: '449a696b3454' },
  { store: 'session-meta/<id>.json', module: 'src/server/session-stdout.js', read: ['try { return timedSync(\'session-meta.read\', () => JSON.parse(fs.readFileSync(fp, \'utf-8\'))); } catch { return {}; }'], fp: '8a8d1040eace' },
  { store: 'usage-cache/<account>.json', module: 'src/usage-cache-write.js', read: ['try { storedObj = JSON.parse(fs.readFileSync(file, \'utf-8\')) || null; } catch { storedObj = null; }'], fp: 'b9c1a69ceb50' },
  { store: 'telemetry/.instance-id', module: 'src/telemetry.js', read: ['try { this._iid = timedSync(\'telemetry.read\', () => fs.readFileSync(f, \'utf-8\')).trim(); } catch {}'], fp: '83cff6d45a17' },   // stale-pins: kept — the store's read as it was born (the census's birth record; r4721 cured it)
  { store: 'archive/task-plans-legacy.json', module: 'src/server/migrations.js', read: ['let prev = {}; try { prev = JSON.parse(fs.readFileSync(out, \'utf-8\')); } catch { }', 'JSON.stringify({ ...prev, ...archived }, null, 2)'], fp: 'd9bffbdb6c83' },
  { store: 'archive/task-group-archived-members.json', module: 'src/server/migrations.js', read: ['let prev = {}; try { prev = JSON.parse(fs.readFileSync(out, \'utf-8\')); } catch { }', 'const merged = { ...prev };'], fp: '762a1c44db44' },
  { store: 'channels/<account>/search-memo.json', module: 'src/channel-store.js', read: ['try { return JSON.parse(fs.readFileSync(file, \'utf-8\')); } catch { return null; }'], fp: '00c77a250bbc' },
  { store: 'channels/<account>/feed-misses.json', module: 'src/channel-store.js', read: ['try { return JSON.parse(fs.readFileSync(file, \'utf-8\')); } catch { return null; }'], fp: '00c77a250bbc' },
  { store: 'agy-subs/<account>/', module: 'src/harnesses/antigravity.js', read: ['let st = null; try { st = rd ? rd.stat(path.join(dir, TOKEN_REL)) : fs.statSync(path.join(dir, TOKEN_REL)); } catch { st = null; }'], fp: '1c4d68b9cca0' },
  { store: '.agent-hooks-optout', module: 'src/server/agent-tool-generators.js', read: ['if (auto && fs.existsSync(HOOK_OPTOUT_FILE)) return (typeof homeRead === \'function\' ? homeRead(ourRowsOnDisk, undefined, { cls: \'opted-out-look\' }) : ourRowsOnDisk().then((value) => ({ value }))).then((r) => (r.value ? (r.value.some((x) => x.ours) ? stripAgentHookEntries({ ifOptedOut: true }).then((removed) => ({ optedOut: true, removed })) : { optedOut: true }) : optedOutUnread(r)));', 'if (!auto) { try { fs.rmSync(HOOK_OPTOUT_FILE, { force: true }); } catch {} }'], fp: '626960cfc84c' },
  { store: 'jobs.lock', module: 'src/jobs.js', read: ['const cur = JSON.parse(fs.readFileSync(this.lockFile, \'utf-8\'));', '} catch { }'], fp: '434e47b1e99d' },
  { store: 'job-logs/<run>/', module: 'src/jobs.js', read: ['const f = path.join(this._ctlDir(job, run.startedAt), name);', 'try { return JSON.parse(fs.readFileSync(f, \'utf-8\')); } catch { return null; }'], fp: '4c9735f3f1da' },
  { store: 'usage-history/.attrib-emptied.json', module: 'src/reading-repair.js', read: ['const prev = _readJson(f);', 'try { _writeAtomic(f, JSON.stringify(merged)); } catch { }'], fp: 'bc289f4c873e' },
  { store: 'channels/msgs/<account>/<conv>.ndjson', module: 'src/channel-store.js', read: ['try { lines = fs.readFileSync(fp, \'utf-8\').split(\'\\n\').filter(Boolean); } catch (e) { if (e.code !== \'ENOENT\') throw e; }'], fp: '9530d8669b28' },
  { store: 'agentd/host-<id>.token', module: 'src/server/host-tokens.js', read: ['try { return fs.readFileSync(f, \'utf-8\').trim(); } catch { }'], fp: '81ffbf2c4efa' },   // stale-pins: kept — the store's read as it was born (the census's birth record; r4721 cured it)
]);
const BIRTH_SIGNATURE = '9939a2825ef4';   // sha256 (12 hex) of JSON.stringify(WRITTEN_OVER_AT_BIRTH): an edit of the birth is red

// ⑥ THE REMOVERS — { remover, module, read, verdict: READS EMPTY | ASKS, fp, keeps, lane?, was?, why }
const RE = 'READS EMPTY', AS = 'ASKS';
const REMOVERS = Object.freeze([
  { remover: 'the kept browsers\' sweep', module: 'src/server/browser-kept.js', read: ['let bound = null; try { const bb = bindingsOf(); bound = typeof bb.boundKeys === \'function\' ? bb.boundKeys() : bb.keys(); }'], verdict: AS, fp: '972b384a4826', keeps: 'browser-env/bindings.json (and live keys, the registry)', was: RE, why: 'the bindings answer unknown, never empty: nothing ends that pass (2.369.416); before: removes every kept browser\'s profile folder (its sign-ins) no live session carries, an hour after it stopped: the bindings\' failed or torn read is an empty map and keys() never throws' },
  { remover: 'the browser boot sweep', module: 'src/server/browser-env.js', read: ['catch (e) { return e && e.code === \'ENOENT\' ? { keys, known: true, why: null } : { keys, known: false,'], verdict: AS, fp: 'd435a472902d', keeps: 'session-meta/<id>.json', was: RE, why: 'a failed listing of the conversations\' records is «not known»: the sweep spares (2.369.417); before: removes every live session\'s browser indirection and scratch folder over an hour old: a failed listing is an empty set, a torn meta is skipped' },
  { remover: 'the browser keeper\'s job-handle release (its keep, jobRunning)', module: 'src/server/mounts-plugins-wiring.js', read: ["return P.jobRunningIn(jm, jobId); } catch { say('jobs_ask_threw'); return 'unknown'; }"], verdict: AS, fp: 'b3238a31b75b', keeps: 'jobs.json (through jobRunning)', was: RE, why: 'its keep asks jobRunningIn (src/browser-job-principal.js): a held jobs store, a job it cannot verify (2.369.417), an engine that cannot say — absent, not loaded yet, its start failed — or an ask that throws (r3571, said once by its code) is «unknown», its handle kept; before: releases every job\'s browser handle, leases and left tabs, closes its tabs: the held store\'s memory is empty and jobRunning never asks the hold' },
  { remover: 'the window reconcile', module: 'src/server/window-targets-engine.js', read: ['if (!liveAny(h) && storeHeld) continue;'], verdict: AS, fp: '8a0f2c29a3b4', keeps: 'desktop-apps.json (a live record)', was: RE, why: 'a lease or share is kept while desktop-apps.json is held (2.369.417); before: drops every window lease and share (grants.json window rows, the window-reach mode): the held store\'s apps are empty and the reconcile never asks the hold' },
  { remover: 'the staged installers\' sweep', module: 'src/server/apps-engine.js', read: ['if (isHeld()) { owedListen.add(host || \'local\');'], verdict: AS, fp: '148ee629d0c4', keeps: 'app-proposals.json', was: RE, why: 'its keep list is made here: while the list is held the replay and the sweep wait, nothing is unstaged (r3193, 2.369.417); the files go in src/app-serve.js; before: removes the staged installers and icons of open proposals over an hour old: the store\'s failed read is empty' },
  { remover: 'the engines\' leftover sweep', module: 'src/server/engine-distribution.js', read: ['if (!(/^\\.next-/.test(n) || /^\\.unpack-/.test(n) || /\\.part$/.test(n)) || keep.includes(n)) continue;'], verdict: RE, fp: 'c6d230910121', keeps: 'browser-engines.json', lane: NOT_ROUTED, why: 'removes a waiting kernel and partial downloads (downloaded again): the record\'s failed read is empty' },
  { remover: 'the agent tool shims\' sweep', module: 'src/server/plugin-loader.js', read: ['for (const f of existing) if (!wanted.has(f)) { try { fs.unlinkSync(path.join(shimDir, f)); } catch { } }'], verdict: RE, fp: '87d937af40ad', keeps: 'plugin-registry.json', lane: NOT_ROUTED, why: 'removes every agent tool shim (written again later): the registry\'s failed read is empty; after a torn lift the sweep removes derived shims only, written again at enable (主开发 r4004)' },
  { remover: 'the launcher shims\' sweep', module: 'src/app-system-serve.js', read: ['for (const n of plan.remove) await fsp.rm(path.join(shimDir, n), { force: true });'], verdict: RE, fp: 'ab323acd7836', keeps: 'the userland\'s entry lists (not a data-folder file)', lane: NOT_ROUTED, why: 'removes every launcher shim (written again later): a failed listing is no rows' },
  { remover: 'the orphan mount-token sweep', module: 'src/machine-mounts.js', read: ['const tornAt = Number(this._state.tornAt) || 0;'], verdict: AS, fp: 'a01a393607b6', keeps: 'machine-mounts.json', was: RE, why: 'a list lifted from torn bytes keeps the tokens it cannot tell (2.369.417); before: revokes every reverse-mount token after TORN bytes: copied aside, lifted as missing, the hold off (an EIO spares)' },
  { remover: 'the machine transcript-cache sweep', module: 'src/hosts.js', read: ['sweepJsonlCache() {', 'const live = new Set(this._state.hosts.map((h) => h.id));'], verdict: RE, fp: '25c26522967c', keeps: 'hosts.json', lane: NOT_ROUTED, why: 'removes every machine\'s cached transcripts after TORN bytes (an EIO spares); fetched again' },
  { remover: 'the reset claims\' prune', module: 'src/usage-reset-claim.js', read: ['const gone = [...new Set([...Object.keys(state.claims), ...Object.keys(state.outcomes), ...Object.keys(state.seen)])].filter((k) => !safeKnown(k));', 'for (const k of gone) { delete state.claims[k];'], verdict: RE, fp: '093e6ac3b413', keeps: 'accounts.json (through claimable)', lane: 'bl-accounts', why: 'deletes every account\'s «I reset it» claims on every client read: the list\'s failed read is empty and only a throw counts as unknown' },
  { remover: 'the pool-link sweep', module: 'src/accounts.js', read: ['if (SMV.anyUnreadable()) {'], verdict: AS, fp: 'b533e026d9b5', keeps: 'session-meta/<id>.json (live keys)', was: RE, why: 'while any conversation\'s record is unread the sweep removes nothing (2.369.417); before: unlinks a conversation\'s pool link when its torn meta re-adopts it under a new id' },
  { remover: 'the pool-pin sweep', module: 'src/accounts.js', read: ['try { PinRecord.sweep(this.dataDir, (key) => { try { fs.statSync(path.join(this.dataDir, \'session-meta\', key + \'.json\')); return true; } catch (e) { return !(e && e.code === \'ENOENT\'); } }); } catch { }'], verdict: AS, fp: 'ad54b7355d55', keeps: 'session-meta/<id>.json (statSync: only ENOENT is gone)', was: RE, why: 'only ENOENT counts as gone: a record that cannot be looked at keeps its pin (2.369.417); before: unlinks a pin whose meta cannot be looked at: existsSync is false on any error (new in the block, B-526c unit 2)' },
  { remover: 'retireDeadSocket', module: 'src/server/boot-restore.js', read: ['if (require(\'./session-meta-verdict.js\').isUnread(dm)) { deadTally.kept.push(sockFile);'], verdict: AS, fp: 'ff2b4a4896d1', keeps: 'session-meta/<id>.json (the meta itself)', was: RE, why: 'an unread record is kept as it is (2.369.417); before: deletes a dead socket\'s meta when its read failed or was torn: neither keep branch matches an empty record' },
  { remover: 'the attach-config sweep', module: 'server.js', read: ['if (!m || activeSessions.has(m[1]) || require(\'./src/server/session-meta-verdict.js\').keeps(m[1])) continue;'], verdict: AS, fp: '45f2631c58c5', keeps: 'session-meta/<id>.json (live ids)', was: RE, why: 'an unread record keeps its id (2.369.417); before: unlinks a session\'s attach config once seven days old when a failed meta read gave it a new id' },
  { remover: 'the aged wrapper files\' sweep', module: 'server.js', read: ['isActive: (id) => activeSessions.has(id) || require(\'./src/server/session-meta-verdict.js\').keeps(id) });'], verdict: AS, fp: 'aca8045c75ee', keeps: 'session-meta/<id>.json (live ids)', was: RE, why: 'an unread record keeps its id (2.369.417); before: removes a session\'s wrapper files once seven days old when a failed meta read gave it a new id (the attach configs\' twin)' },
  { remover: 'a removed machine\'s app rows', module: 'src/server/desktop-app-keeper.js', read: ['if (e && (e.code === \'unsupported-host\')) {', 'delete remote.hosts[hostId]; saveRemote(); notify(); return false;'], verdict: RE, fp: '92cfa06b3978', keeps: 'hosts.json', lane: NOT_ROUTED, why: 'after TORN hosts.json bytes (set aside, the list empty, no hold) every machine answers unsupported-host and its desktop-app rows are dropped (an EIO holds: host_unavailable)' },
  { remover: 'the slot backfill\'s archive', module: 'src/ledger-slot-backfill.js', read: ['const refused = rec.why ? rec : refusalFor(r, rec, markers);'], verdict: RE, fp: '5c9079bc56d1', keeps: 'slot-transitions.jsonl', lane: NOT_ROUTED, why: 'archives pooled rows as no-slot-record when the transitions\' read failed (recoverable; reruns only if migrations.json loses its row)' },
  { remover: 'the channel stash gate (its wall)', module: 'src/server/channels-outbound.js', read: ['if (store.wallHeld && store.wallHeld(\'stashGate\')) return { keep: true };'], verdict: RE, fp: '59a42753d61a', keeps: 'grants.json (reach), channels/index.json, channels/adapters.json', lane: NOT_ROUTED, why: 'drops every agent\'s waiting channel messages when grants.json cannot be read (it answers no one granted; the walls list only the channel families)' },
  { remover: 'the api cards\' verdict sweep', module: 'src/server/channel-api-cards.js', read: ['const ends = C.sweepVerdicts(recs, { now: now(), live: liveness(a, credIds, !!view.mountsHeld) });'], verdict: RE, fp: 'e87f03a9ee45', keeps: 'mounts.json, grants.json (api rows), channels/adapters.json', lane: NOT_ROUTED, why: 'a mount credential is unknown while mounts.json is held (2.369.417); grants.json unreadable still answers no reach: every pending agent proposal withdrawn' },
  { remover: 'the api cards\' rows', module: 'src/server/channel-api-cards.js', read: ['if (typeof a.isHeldUnread === \'function\' && a.isHeldUnread()) return;'], verdict: AS, fp: '03c26d7b527b', keeps: 'channels/api-proposals.json', was: RE, why: 'the sync returns while the proposals are held, before any row is deleted (2.369.417); before: deletes every api card row (its For-you item never answered) when the proposals\' read failed' },
  { remover: 'the migration ledger', module: 'src/migration-runner.js', read: ['try { text = fs.readFileSync(ledgerPath, \'utf-8\'); } catch (e) { if (e && e.code === \'ENOENT\') return { applied: {} }; return { unread: (e && e.code) || \'error\', torn: false }; }'], verdict: AS, was: RE, fp: 'b5e19d2eb36e', keeps: 'migrations.json', why: 'ASKS since MG1 (r2999 / r3244, lane lg-group-parents): a ledger that could not be read or is torn is HELD, never applied: {} — no migration runs and nothing is written over it. Before: a failed or torn ledger was applied: {} — every migration runs again, its removers among them' },
  { remover: 'the attachments\' Remove door (its verdict)', module: 'src/server/chat-attachments.js', read: ['if (l && l.unreadable) return \'unchecked\';', 'if (here === false) return \'gone\';'], verdict: AS, fp: '99a1034f385e', keeps: 'session-meta, live sessions, the folder\'s link, the transcripts', why: 'a read error is thrown, an unreadable link unchecked, an unknown transcript kept' },
  { remover: 'the keeper\'s lease reconcile', module: 'src/server/browser-keeper.js', read: ['const r = B.reconcileLeases({ leases: reg.leases, liveKeys: live, now: now(), graceMs });'], verdict: AS, fp: '8ddadb4367b6', keeps: 'live session keys (sockets, session-meta)', why: 'a failed sockets listing throws before the keeper boots; a held registry skips' },
  { remover: 'the job-log sweep', module: 'src/jobs.js', read: ['if (!this.ready) return Promise.resolve({ skipped: this.initError ? \'init-failed\' : \'not-ready\' });'], verdict: AS, fp: '2bf0346e002e', keeps: 'jobs.json, jobs-archive.json', why: 'the pass refuses unread or not ready; the worker stops on anything but ENOENT; a .corrupt- copy holds it' },
  { remover: 'the outbox files\' sweep', module: 'src/server/channels-outbound.js', read: ['if (store.wallHeld && store.wallHeld(\'filesSweep\')) return [];'], verdict: AS, fp: '5edec067afe8', keeps: 'channels/outbox.json', why: 'the wall: a held outbox removes nothing' },
  { remover: 'an account\'s purge', module: 'src/server/channels-auth.js', read: ['if (store.wallHeld && store.wallHeld(\'removeAccount\')) throw httpErr(503, \'store-blocked\','], verdict: AS, fp: '16e70a2864d8', keeps: 'channels/index.json, adapters.json, outbox.json, grants.json', why: 'the wall, and an unreadable grants.json refuses the removal' },
  { remover: 'the held deliveries\' pass', module: 'src/server/channels-engine.js', read: ['if (store.wallHeld(\'heldPass\')) return 0;'], verdict: AS, fp: '0b6081ecab8b', keeps: 'channels/index.json, adapters.json', why: 'the wall' },
  { remover: 'the owed deliveries\' pass', module: 'src/server/channels-engine.js', read: ['if (store.wallHeld(\'owedPass\')) return 0;'], verdict: AS, fp: '97a51a3ad534', keeps: 'channels/index.json, adapters.json', why: 'the wall' },
  { remover: 'the client-swap check', module: 'src/server/channels-engine.js', read: ['if (store.wallHeld(\'clientSwapCheck\')) return;'], verdict: AS, fp: '43485eea04f4', keeps: 'channels/adapters.json', why: 'the wall' },
  { remover: 'the held and pending hits\' prune', module: 'src/server/channels-access.js', read: ['async function pruneHeld(adapterId) {'], verdict: AS, fp: 'e72c44a35e73', keeps: 'channels/index.json watchers, grants.json watch rows', why: 'runs only after a grants write lands' },
  { remover: 'the side log trim', module: 'src/channel-store.js', read: ['its message log could not be read (${(e && e.code) || (e && e.message)}) — nothing trimmed'], verdict: AS, fp: '4f52e13f7f01', keeps: 'channels/msgs/<account>/<conv>.ndjson', why: 'an EIO trims nothing (a missing log drops the side lines by design)' },
  { remover: 'the group members\' liveness', module: 'src/server/channels-wiring.js', read: ['const archivedCids = () => { try { const st = readUserState() || {};'], verdict: AS, fp: 'd0e4729356ad', keeps: 'user-state.json, session-meta, the transcripts', why: 'a failed read is «stopped», never ended' },
  { remover: 'the vault runs\' boot sweep', module: 'src/server/vault-run-door.js', read: ['let owner = null; try { owner = JSON.parse(readBounded(path.join(p, OWNER_FILE), 4096).toString(\'utf8\')); } catch { owner = null; }'], verdict: AS, fp: '37b360cfe069', keeps: 'each run folder\'s .owner', why: 'an unreadable mark is never swept' },
  { remover: 'the vault\'s «Always» cards', module: 'src/server/vault-run-door.js', read: ['if (!p || p.unknown) return \'held\';'], verdict: AS, fp: 'c3814aedbc2d', keeps: 'grants.json vault-use rows, user-todos.json', why: 'an unreadable row reads unknown, held' },
  { remover: 'the temp sweepers\' marks', module: 'src/owner-mark.js', read: ['try { fs.lstatSync(path.join(dir, OWNER_FILE)); return false; } catch (e) { if (!e || e.code !== \'ENOENT\') return false; }'], verdict: AS, fp: 'd215f673bc7b', keeps: 'each folder\'s .owner', why: 'a mark that cannot be looked at keeps its folder' },
  { remover: 'other hubs\' local index files', module: 'src/server/local-index.js', read: ['let doc; try { const r = LI.parseIndex(await fsp.readFile(path.join(place.dir, name), \'utf8\')); if (!r.ok) continue; doc = r.doc; } catch { continue; }'], verdict: AS, fp: '10f5549af0c7', keeps: 'the file\'s own doc', why: 'an unreadable file is skipped' },
  { remover: 'the stale spend lock', module: 'src/server/spend-guard.js', read: ['catch (e2) { if (e2 && e2.code === \'ENOENT\') { if (cannot) return { took: false, error: cannot }; continue; } return { took: false, holder: { unreadable:'], verdict: AS, fp: 'c688cc624a10', keeps: 'the lock\'s holder', why: 'unreadable is held, never stale' },
  { remover: 'the setting holds\' settle', module: 'src/server/setting-holds.js', read: ['if (isHeld()) { arm(k); continue; }'], verdict: AS, fp: 'eb0124ce5a43', keeps: 'settings.json', why: 'held settings are judged at the lift, never against the defaults' },
  { remover: 'the archived members\' unbind', module: 'src/server/migrations.js', read: ['const st = require(\'../store-hold.js\').readNow(path.join(dataDir, \'user-state.json\'),'], verdict: AS, fp: '015a0c3c2a8f', keeps: 'user-state.json, task-groups.json', why: 'held stores throw; an empty list removes nothing' },
  { remover: 'the attachments\' eviction', module: 'src/channel-store.js', read: ['if (total <= budgetBytes) break;'], verdict: AS, fp: '7b7f964da14f', keeps: 'channels/attachments/<account>/lru.json', why: 'evicts only names the ledger holds (a failed read evicts less)' },
  { remover: 'the sign-in witness\'s home copy', module: 'src/signin-witness-worker.js', read: ['netRemove({ path: dir, root }) {', 'if (m.unknown) throw unknownError(m.unknown);'], verdict: AS, fp: '6ceb740e0e12', keeps: 'the sign-in witness (auth.json\'s state)', why: 'netRemove removes the home folder\'s witness copy only on auth\'s own act, held while auth is unread (_held); a machine it cannot tell refuses' },
  { remover: 'the handed records\' age sweep', module: 'src/server/handed-sweep.js', read: ['if (verdict.anyUnreadable()) return keepAll('], verdict: AS, fp: '6553d024c359', keeps: 'session-meta/<id>.json (every form: .json, .json.stopped, .json.orphan)', why: 'B-5a4d root, line 820 (r3249 / r3714): ONE boot pass removes <buffers>/handed/<conversation>.json (its torn copy, a killed write\'s temp) only on a proof that covers where its transcript lives — the record verdict is ASKED first (any record that could not be read keeps EVERY file, and a record it holds unread is never read here; a record this pass cannot read or parse keeps every file too), no live session and no record in any form names the conversation, every frame names a CLI (a remote conversation\'s file is kept), its transcript is gone from every place the hub looks (the index read whole), and it is past the wrapper files\' seven days; looked at again before its one unlink' },
]);
// the removers reading an empty answer at the census's birth, each with its read and fp. NEVER EDITED.
const READING_EMPTY_AT_BIRTH = Object.freeze([
  { remover: 'the kept browsers\' sweep', module: 'src/server/browser-kept.js', read: ['let bound = null; try { bound = bindingsOf().keys(); }'], fp: '10b775602813' },
  { remover: 'the browser boot sweep', module: 'src/server/browser-env.js', read: ['let names = []; try { names = fs.readdirSync(path.join(dataDir, \'session-meta\')); } catch { return out; }'], fp: 'd591faa36191' },
  { remover: 'the browser keeper\'s job-handle release (its keep, jobRunning)', module: 'src/server/mounts-plugins-wiring.js', read: ['jobRunning: (jobId) => { try { const jm = getJobs ? getJobs() : null;'], fp: '2b56a0213d54' },
  { remover: 'the window reconcile', module: 'src/server/window-targets-engine.js', read: ['dropLease(h, \'the window is gone (no live record)\');', 'else dropShare(h);'], fp: '113604d6f20e' },
  { remover: 'the staged installers\' sweep', module: 'src/app-serve.js', read: ['const keep = new Set(p.keep.map(String));'], fp: '685537544b57' },
  { remover: 'the engines\' leftover sweep', module: 'src/server/engine-distribution.js', read: ['if (!(/^\\.next-/.test(n) || /^\\.unpack-/.test(n) || /\\.part$/.test(n)) || keep.includes(n)) continue;'], fp: 'c6d230910121' },
  { remover: 'the agent tool shims\' sweep', module: 'src/server/plugin-loader.js', read: ['for (const f of existing) if (!wanted.has(f)) { try { fs.unlinkSync(path.join(shimDir, f)); } catch { } }'], fp: '87d937af40ad' },
  { remover: 'the launcher shims\' sweep', module: 'src/app-system-serve.js', read: ['for (const n of plan.remove) await fsp.rm(path.join(shimDir, n), { force: true });'], fp: 'ab323acd7836' },
  { remover: 'the orphan mount-token sweep', module: 'src/machine-mounts.js', read: ['gcOrphanTokens() {', 'if (t.kind === \'reverse-mount\' && !referenced.has(t.id)) {'], fp: 'a7ee22f7282c' },
  { remover: 'the machine transcript-cache sweep', module: 'src/hosts.js', read: ['sweepJsonlCache() {', 'const live = new Set(this._state.hosts.map((h) => h.id));'], fp: '25c26522967c' },
  { remover: 'the reset claims\' prune', module: 'src/usage-reset-claim.js', read: ['const gone = [...new Set([...Object.keys(state.claims), ...Object.keys(state.outcomes), ...Object.keys(state.seen)])].filter((k) => !safeKnown(k));', 'for (const k of gone) { delete state.claims[k];'], fp: '093e6ac3b413' },
  { remover: 'the pool-link sweep', module: 'src/accounts.js', read: ['for (const k of entries) if (!liveKeys.has(k)) { try { fs.unlinkSync(path.join(dir, k)); dropped++; } catch { } }'], fp: 'ab00a9203c3a' },
  { remover: 'the pool-pin sweep', module: 'src/accounts.js', read: ['try { PinRecord.sweep(this.dataDir, (key) => fs.existsSync(path.join(this.dataDir, \'session-meta\', key + \'.json\'))); } catch { }'], fp: 'b0d5e9c5fbc9' },
  { remover: 'retireDeadSocket', module: 'src/server/boot-restore.js', read: ['const dm = readSessionMeta(sockFile) || {};', 'if ((dm.host || dm.dialDeviceId) && !dm.orphanedAt) {'], fp: '3dd8d3617e1d' },
  { remover: 'the attach-config sweep', module: 'server.js', read: ['if (!m || activeSessions.has(m[1])) continue;'], fp: 'f169e42182c4' },
  { remover: 'the aged wrapper files\' sweep', module: 'server.js', read: ['let swept = require(\'./src/server/wrapper-files.js\').sweepAgedWrapperFiles(BUFFERS_DIR, { cutoff, isActive: (id) => activeSessions.has(id) });'], fp: '9ba90ec64123' },
  { remover: 'a removed machine\'s app rows', module: 'src/server/desktop-app-keeper.js', read: ['if (e && (e.code === \'unsupported-host\')) {', 'delete remote.hosts[hostId]; saveRemote(); notify(); return false;'], fp: '92cfa06b3978' },
  { remover: 'the slot backfill\'s archive', module: 'src/ledger-slot-backfill.js', read: ['const refused = rec.why ? rec : refusalFor(r, rec, markers);'], fp: '5c9079bc56d1' },
  { remover: 'the channel stash gate (its wall)', module: 'src/server/channels-outbound.js', read: ['if (store.wallHeld && store.wallHeld(\'stashGate\')) return { keep: true };'], fp: '59a42753d61a' },
  { remover: 'the api cards\' verdict sweep', module: 'src/server/channel-api-cards.js', read: ['const ends = C.sweepVerdicts(recs, { now: now(), live: liveness(a, credIds) });'], fp: '4682cccddf2e' },
  { remover: 'the api cards\' rows', module: 'src/server/channel-api-cards.js', read: ['for (const id of Object.keys(state.items)) if (!held.has(id)) { delete state.items[id]; dirty = true; }'], fp: '522dbdacea83' },
  { remover: 'the migration ledger', module: 'src/migration-runner.js', read: ['try { ledger = JSON.parse(fs.readFileSync(ledgerPath, \'utf-8\')); } catch { }'], fp: '81e4e8e68af9' },
]);
const RBIRTH_SIGNATURE = '5c9b32cab017';
// every file with a file deletion call, its exact count (server.js and src/, the device agent's own side out)
const DELETION_CALLS = Object.freeze({
  'server.js': 3, 'src/account-material.js': 8, 'src/accounts.js': 17, 'src/adapters/codex.js': 2,
  'src/agent-routes.js': 1, 'src/agentd/client.js': 3, 'src/app-kinds/deb.js': 3, 'src/app-secrets-seal.js': 1,
  'src/app-secrets.js': 1, 'src/app-serve.js': 8, 'src/app-system-serve.js': 1, 'src/browser-facts.js': 1,
  'src/browser-serve.js': 4, 'src/channel-outbox-files.js': 1, 'src/channel-store.js': 9, 'src/claude-oat-probe.js': 8,
  'src/design-fs.js': 1, 'src/desktop-display.js': 1, 'src/desktop-mic.js': 3, 'src/desktop-serve.js': 7,
  'src/exit-proxy.js': 2, 'src/fd-close.js': 1, 'src/fixture-ledger-purge.js': 1, 'src/gmail-sync.js': 1, 'src/harness-config.js': 2,   // fd-close (B-bcb8 unit B, r4474): renameSynced removes ITS OWN temp after a failed write — no store's remover
  'src/harnesses/antigravity.js': 3, 'src/harnesses/claude-home.js': 1, 'src/harnesses/codex.js': 1, 'src/host-keys.js': 1,
  'src/hosts.js': 8, 'src/interface/main.js': 2, 'src/job-logs-sweep-worker.js': 11, 'src/jobs.js': 3,
  'src/kept-copies.js': 2, 'src/machine-probes.js': 2, 'src/mounts.js': 5, 'src/node-runtime.js': 3,
  'src/opencode-serve.js': 2, 'src/opslog.js': 1, 'src/owner-mark.js': 5, 'src/plugins/frp.js': 6,
  'src/plugins/tailscale.js': 3, 'src/pool-pin-record.js': 3, 'src/reading-repair.js': 4, 'src/routes/files.js': 18,   /* r4828 (lane nl-journals): + the extraction journal's temp removed on a failed write */
  'src/routes/persistence.js': 6, 'src/routes/window-targets.js': 1, 'src/safe-fs-worker.js': 9, 'src/search-index-worker.js': 1,
  'src/secret-box.js': 1, 'src/secret-file.js': 4, 'src/server/agent-listener.js': 1, 'src/server/agent-tool-generators.js': 2,
  'src/server/apps-ops-door.js': 2, 'src/server/automation-engine.js': 1, 'src/server/boot-restore.js': 14, 'src/server/browser-attach-launch.js': 1,
  'src/server/browser-builds-keeper.js': 8, 'src/server/browser-cli-install.js': 3, 'src/server/browser-clone-run.js': 2, 'src/server/browser-display-config.js': 2,
  'src/server/browser-env.js': 1, 'src/server/browser-installs.js': 1, 'src/server/browser-keeper.js': 5, 'src/server/browser-kept.js': 7,
  // r3786 (card-door-in-chat): browser-kept.js +1 — adopted() takes the note out of a folder a profile adopted (no keep list: the registry rules
  // that folder); browser-kept-note.js 5 — the temps of the note's and of a session config's write, a note taken back past its bound (only the
  // file that write put there: its inode), and a crash's leftover temp reaped at the folder's next write (r3961); r4094 +1 — that take-back when
  // the temp's inode could not be read (only a note still holding this write's own three fields) — none keeps a list
  'src/server/browser-kept-note.js': 6,
  'src/server/browser-trace.js': 4, 'src/server/chat-attachments.js': 4, 'src/server/claude-signin.js': 3, 'src/server/cli-model-catalog.js': 1,
  'src/server/cli-models-door.js': 1, 'src/server/cli-self-measure.js': 3, 'src/server/csp-reports.js': 1 /* r4828: the re-judge's temp removed on a failed rewrite */, 'src/server/dial-pairing.js': 1, 'src/server/dropline-oauth.js': 1,
  'src/server/engine-distribution.js': 15, 'src/server/handed-sweep.js': 1, 'src/server/home-rename.js': 2, 'src/server/hook-root-watch.js': 1, 'src/server/host-tokens.js': 3,
  'src/server/hub-tmp.js': 1, 'src/server/incident-wiring.js': 2, 'src/server/job-secrets-door.js': 2, 'src/server/jobs-wiring.js': 1,
  'src/server/local-index.js': 1, 'src/server/migrations.js': 5, 'src/server/oat-mint.js': 3, 'src/server/otel-ingest.js': 1, 'src/server/ops-routes.js': 1,
  'src/server/plugin-install.js': 6, 'src/server/plugin-loader.js': 2, 'src/server/provider-spawn.js': 2, 'src/server/provider-test.js': 1,
  'src/server/published-pages.js': 2, 'src/server/rewind-keep-worker.js': 7, 'src/server/rewind-kept-door.js': 2, 'src/server/sealed-json.js': 1,
  'src/server/session-stdout.js': 5, 'src/server/spend-guard.js': 3, 'src/server/sync-fs-witness-worker.js': 2, 'src/server/usage-index-retire.js': 1,
  'src/server/usage-pool-engine.js': 2, 'src/server/vault-engine.js': 7, 'src/server/vault-run-door.js': 6, 'src/server/vault-totp.js': 1,
  'src/server/window-targets-engine.js': 1, 'src/server/wrapper-files.js': 6, 'src/server/writes-lost.js': 3,   /* B-574d (lane nl-journals): + the off-loop write's temp removed on a failed write; + the exit's removal of a write's temp still in flight */ 'src/signin-witness-worker.js': 2,
  'src/signin-witness.js': 2, 'src/spawn/ssh.js': 1, 'src/ssh-key.js': 1, 'src/store-hold.js': 3,
  'src/store-read-hold.js': 6, 'src/store-writer-worker.js': 6, 'src/store-writer.js': 2, 'src/task-groups.js': 1,
  'src/transcript-service.js': 3, 'src/usage-cache-write.js': 1, 'src/usage-hold-road.js': 1, 'src/usage-ledger-dedup.js': 4,
  'src/user-todos.js': 1, 'src/vnc.js': 1, 'src/webdav.js': 5, 'src/ws-create.js': 2,
  'src/ws-handler.js': 4,
});

// ── the tree ───────────────────────────────────────────────────────────────────────────────────────────────────────
function sourceFiles(root) {
  const out = [{ rel: 'server.js', text: fs.readFileSync(path.join(root, 'server.js'), 'utf8') }];
  const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
      const r = rel + '/' + e.name;
      if (e.isDirectory()) walk(r);
      else if (e.isFile() && e.name.endsWith('.js')) out.push({ rel: r, text: fs.readFileSync(path.join(root, r), 'utf8') });
    }
  };
  walk('src');
  return out;
}
const sha12 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 12);

// ── ③ THE NET ─────────────────────────────────────────────────────────────────────────────────────────────────────
const JOIN = /\b(?:path|nodePath)\.(?:join|resolve)\(([^()]{1,240})\)/g;
const DATA_DIR = /^(?:[A-Za-z_$][\w$]*\.)*[A-Za-z_$]*[dD][aA][tT][aA]_?[dD][iI][rR]$/;
const QSEG = /^(['"`])([A-Za-z0-9._-]+)\1$/;
const CONST_REF = /^(?:([A-Za-z_$][\w$]*)\.)?([A-Z][A-Z0-9_]*)$/;
const CONST_NAME = /\bconst\s+([A-Z][A-Z0-9_]*)\s*=\s*['"`]([A-Za-z0-9._-]+)['"`]/g;
const REQUIRE = /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*require\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g;
const DECL = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:[A-Za-z_$][\w$.]*\s*\?\s*)?$/;
const FILEY = (name) => { const last = name.split('/').pop(); return last.startsWith('.') || /\.[A-Za-z0-9]+$/.test(last); };
/** every file the data folder's code joins (its path under the data folder) → the files that join it */
function netOf(files) {
  const byRel = new Map(files.map((f) => [f.rel, f.text]));
  const consts = new Map();
  const constsOf = (rel) => {
    if (!consts.has(rel)) { const m = new Map(); for (const x of (byRel.get(rel) || '').matchAll(CONST_NAME)) if (!m.has(x[1])) m.set(x[1], x[2]); consts.set(rel, m); }
    return consts.get(rel);
  };
  const requiredBy = (rel, id) => {
    for (const x of (byRel.get(rel) || '').matchAll(REQUIRE)) {
      if (x[1] !== id) continue;
      const base = path.posix.normalize(path.posix.join(path.posix.dirname(rel), x[2]));
      for (const c of [base, base + '.js', base + '/index.js']) if (byRel.has(c)) return c;
    }
    return null;
  };
  const segment = (rel, a, last) => {
    const q = QSEG.exec(a);
    if (q) return q[2];
    if (!last) return null;
    const c = CONST_REF.exec(a);
    if (!c) return null;
    const from = c[1] ? requiredBy(rel, c[1]) : rel;
    return (from && constsOf(from).get(c[2])) || null;
  };
  /** the path under the data folder a join names ('' = the folder itself), or null */
  const pathOf = (rel, args, prefix, line) => {
    let base = null, from = 0;
    if (DATA_DIR.test(args[0])) { base = ''; from = 1; }
    else if (prefix.has(args[0]) && line - prefix.get(args[0]).line <= VAR_REACH) { base = prefix.get(args[0]).p; from = 1; }
    else { const k = args.findIndex((a, i) => i >= 1 && (a === "'data'" || a === '"data"')); if (k >= 1) { base = ''; from = k + 1; } }
    if (base === null) return null;
    const segs = [];
    for (let i = from; i < args.length; i++) { const s = segment(rel, args[i], i === args.length - 1); if (s === null) return null; segs.push(s); }
    return [base, ...segs].filter((s) => s !== '').join('/');
  };
  const found = new Map();
  for (const { rel, text } of files) {
    if (!text.includes('ath.join(') && !text.includes('ath.resolve(')) continue;
    const prefix = new Map();
    let line = 0, last = 0;
    for (const m of text.matchAll(JOIN)) {
      for (let nl = text.indexOf('\n', last); nl !== -1 && nl < m.index; nl = text.indexOf('\n', nl + 1)) line++;
      last = m.index;
      const args = m[1].split(',').map((s) => s.trim());
      const p = pathOf(rel, args, prefix, line);
      const d = DECL.exec(text.slice(Math.max(0, m.index - 100), m.index));
      if (d) { if (p === null) prefix.delete(d[1]); else prefix.set(d[1], { p, line }); }
      if (p && FILEY(p) && !p.startsWith('bin/')) { if (!found.has(p)) found.set(p, new Set()); found.get(p).add(rel); }
    }
  }
  return found;
}
function netFindings(found, rows) {
  const named = new Map(rows.map((r) => [r.store, r]));
  const out = [];
  for (const [name, at] of found) {
    const r = named.get(name);
    if (!r) out.push(`${name} (joined in ${[...at].sort().join(', ')}): a store file of the data folder with no row — judge its read, add its row`);
    else if (r.verdict === G) out.push(`${name}: a GONE row, but ${[...at].sort().join(', ')} still joins it`);
  }
  return out;
}
function goneFindings(rows, files) {
  const out = [];
  for (const r of rows.filter((x) => x.verdict === G)) {
    const base = r.store.split('/').pop();
    const at = files.filter((f) => ["'", '"', '`'].some((q) => f.text.includes(q + base + q))).map((f) => f.rel);
    if (at.length) out.push(`${r.store}: a GONE row, but ${at.join(', ')} still names ${base}`);
  }
  return out;
}

// ── ① THE ANCHORS ────────────────────────────────────────────────────────────────────────────────────────────────
const EDGE = /^[ \t\r]+|[ \t\r]+$/g;
/** the lines where an anchor [read, answer?] holds: the read's line, its answer within ANSWER_WITHIN lines below */
function anchorHits(lines, [read, answer]) {
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes(read)) continue;
    if (answer === undefined || lines.slice(i + 1, i + 1 + ANSWER_WITHIN).some((l) => l.includes(answer))) hits.push(i);
  }
  return hits;
}
/** the read's BLOCK at line i: from it through the end of the statement that answers its failure — braces counted from the
 *  answer line below it when the row names one (from its catch, or from the answer itself: a promise's second handler, an if),
 *  else from the catch on the read's own line; a read with no catch and no answer is its own line */
function blockOf(lines, i, answer) {
  let j = i;
  if (answer !== undefined) { for (let k = i + 1; k <= i + ANSWER_WITHIN && k < lines.length; k++) if (lines[k].includes(answer)) { j = k; break; } }
  let at = lines[j].indexOf('catch');
  if (at < 0 && j > i) at = lines[j].indexOf(answer);
  let k = j;
  if (at >= 0) {
    let depth = 0, opened = false, done = false;
    for (k = j; k < lines.length && k < j + BLOCK_MAX; k++) {
      for (const ch of (k === j ? lines[j].slice(at) : lines[k])) {
        if (ch === '{') { depth++; opened = true; } else if (ch === '}') { depth--; if (opened && depth === 0) { done = true; break; } }
      }
      if (done || (k === j && !opened)) { done = true; break; }   // an answer that opens no brace is its own line
    }
    if (!done) k = Math.min(lines.length, j + BLOCK_MAX) - 1;
  }
  return lines.slice(i, k + 1).map((l) => l.replace(EDGE, '')).join('\n');
}
function anchorFindings(rows, textOf) {
  const out = [], linesOf = new Map();
  const lines = (m) => { if (!linesOf.has(m)) { const t = textOf(m); linesOf.set(m, t == null ? null : t.split('\n')); } return linesOf.get(m); };
  for (const r of rows) {
    if (r.verdict === G) continue;
    const L = lines(r.module);
    if (!L) { out.push(`${r.store}: its module ${r.module} is not in the tree`); continue; }
    const hits = anchorHits(L, r.read);
    if (hits.length !== 1) { out.push(`${r.store} (${r.verdict}): its read is ${hits.length === 0 ? 'no longer' : hits.length + ' times'} in ${r.module} — the read changed: set its anchor again (a change that is not a cure keeps the verdict); a fingerprinted row prints its new fingerprint on a second run`); continue; }
    if (r.fp !== undefined) { const now = sha12(blockOf(L, hits[0], r.read[1])); if (now !== r.fp) out.push(`${r.store} (${r.verdict}): its read's block in ${r.module}:${hits[0] + 1} changed (fp ${r.fp} → ${now}) — a change that is not a cure moves the fingerprint ONLY (fp: '${now}'); a cure moves the verdict too, with its was mark`); }
    if (r.bound !== undefined) {
      const B = lines(r.bound[0]);
      const n = B ? B.filter((l) => l.includes(r.bound[1])).length : 0;
      if (n !== 1) out.push(`${r.store}: the line binding it to its shared read is ${n === 0 ? 'no longer' : n + ' times'} in ${r.bound[0]} — the store left (or doubled) its family: judge its read again`);
    }
  }
  return out;
}

// ── ② THE VERDICTS ───────────────────────────────────────────────────────────────────────────────────────────────
const LAW_WORDS = /\bstoreAnswer\(|\bSH\.create\(|\.H\.readAtStart\(/;
function verdictFindings(rows) {
  const out = [], seen = new Set();
  for (const r of rows) {
    if (seen.has(r.store)) out.push(`${r.store}: two rows`);
    seen.add(r.store);
    if (!VERDICTS.includes(r.verdict)) { out.push(`${r.store}: an unknown verdict «${r.verdict}» (${VERDICTS.join(' / ')})`); continue; }
    if (typeof r.why !== 'string' || r.why.trim().length < 8) out.push(`${r.store}: no why`);
    if (r.verdict === G) continue;
    if (!(Array.isArray(r.read) && r.read.length >= 1 && r.read.length <= 2 && r.read.every((s) => typeof s === 'string' && s.trim().length >= 8))) { out.push(`${r.store}: its anchor is not one or two lines of text`); continue; }
    const law = r.read.some((s) => LAW_WORDS.test(s));
    if (r.verdict === U && !law) out.push(`${r.store}: UNDER THE LAW, but its read does not go through storeAnswer or a store hold`);
    if (r.verdict !== U && law) out.push(`${r.store}: ${r.verdict}, but its read goes through the law — its verdict is UNDER THE LAW`);
    const pinned = r.verdict === H || r.verdict === D || r.verdict === X;
    if (pinned && !(typeof r.fp === 'string' && /^[0-9a-f]{12}$/.test(r.fp))) out.push(`${r.store}: ${r.verdict} with no fingerprint of its read's block (fp: 12 hex)`);
    if (!pinned && r.fp !== undefined) out.push(`${r.store}: an fp on a ${r.verdict} row (only a held, derived or written-over read is fingerprinted)`);
    const owes = r.verdict === X || (typeof r.gap === 'string' && r.gap.trim().length > 0);
    if (owes && !(typeof r.lane === 'string' && r.lane.trim().length > 0)) out.push(`${r.store}: ${r.verdict === X ? 'written over' : 'a gap'} with no lane that holds its cure`);
    if (!owes && r.lane !== undefined) out.push(`${r.store}: a lane on a row with nothing to cure`);
  }
  return out;
}

// ── ④ THE RATCHET ────────────────────────────────────────────────────────────────────────────────────────────────
function ratchetFindings(rows, birth, textOf, V = X) {
  const out = [], born = new Map(birth.map((b) => [b.store, b])), by = new Map(rows.map((r) => [r.store, r]));
  for (const r of rows) {
    if (r.verdict === V && !born.has(r.store)) out.push(`${r.store}: a NEW ${V} — the count only falls: ${V === X ? 'hold its read (src/store-read.js storeAnswer)' : 'ask the store\'s hold: «unknown» removes nothing'} before it lands`);
    if (r.verdict === V && r.was === V) out.push(`${r.store}: cured once (was: ${V}) and ${V} again`);
  }
  for (const b of born.values()) {
    const r = by.get(b.store);
    if (!r) { out.push(`${b.store}: a ${V} row of the census's birth has no row — keep its row, with its verdict today`); continue; }
    if (r.verdict === V) continue;
    if (r.was !== V) out.push(`${b.store}: off ${V} without was: '${V}' — the mark that keeps it from coming back`);
    const t = textOf(b.module);
    if (t == null) { out.push(`${b.store}: its birth module ${b.module} left the tree — anchor the birth again`); continue; }
    const L = t.split('\n'), hits = anchorHits(L, b.read);
    if (hits.length === 1 && sha12(blockOf(L, hits[0], b.read[1])) === b.fp && JSON.stringify(r.read) === JSON.stringify(b.read)) out.push(`${b.store}: moved to ${r.verdict}, but its birth read is there unchanged (fp ${b.fp}) and its row still pins it — a verdict moves with its cure (a changed read, or the row moved onto the cure's own line), never by an edit`);
  }
  return out;
}

// ── ⑥ THE REMOVER CENSUS ─────────────────────────────────────────────────────────────────────────────────────────
// a file deletion call: the sync forms, any `<name>.rm|unlink|rmdir(` (fs, fsp, fs.promises, an alias such as `P = fs.promises`,
// `io.rm`), and the tree's own deleting helpers (a remover that only calls one is still counted where it calls it)
const DELETE_HELPERS = ['deleteSessionMeta', 'sweepAgedWrapperFiles', 'removeWrapperFiles', 'removeMarked', 'removeEntry'];
const DELETE_CALL = new RegExp(String.raw`rmSync\(|unlinkSync\(|rmdirSync\(|\.rm\(|\.unlink\(|\.rmdir\(|PinRecord\.sweep\(|(?:${DELETE_HELPERS.join('|')})\(`, 'g');
const DEVICE_SIDE = (rel) => rel.startsWith('src/agentd/') && rel !== 'src/agentd/client.js';
function deletionCounts(files) {
  const out = new Map();
  for (const { rel, text } of files) {
    if (DEVICE_SIDE(rel) || !(text.includes('unlink') || text.includes('rmSync(') || text.includes('.rm(') || text.includes('rmdir') || text.includes('PinRecord.sweep(') || DELETE_HELPERS.some((h) => text.includes(h + '(')))) continue;
    const n = (text.match(DELETE_CALL) || []).length;
    if (n) out.set(rel, n);
  }
  return out;
}
function deletionFindings(counts, table) {
  const out = [];
  for (const [rel, n] of counts) {
    if (!(rel in table)) out.push(`${rel}: ${n} file deletion call(s) and no row — judge each (a remover row if its keep list is a store), then its count`);
    else if (table[rel] !== n) out.push(`${rel}: ${n} file deletion calls, its row says ${table[rel]} — one came or went: judge it (a remover row if its keep list is a store), then its count`);
  }
  for (const rel of Object.keys(table)) if (!counts.has(rel)) out.push(`${rel}: no file deletion call any more — drop its row`);
  return out;
}
const rkey = (r) => `remover «${r.remover}»`;   // by name, each name once in the census: a row may move to the module where its cure asks
const asRow = (r) => ({ ...r, store: rkey(r) });
function removerFindings(removers) {
  const out = [], seen = new Set();
  for (const r of removers) {
    const k = r.remover;
    if (seen.has(k)) out.push(`remover «${r.remover}»: two rows`);
    seen.add(k);
    if (r.verdict !== RE && r.verdict !== AS) out.push(`remover «${r.remover}»: an unknown verdict «${r.verdict}» (${RE} / ${AS})`);
    if (!(Array.isArray(r.read) && r.read.length >= 1 && r.read.length <= 2 && r.read.every((x) => typeof x === 'string' && x.trim().length >= 8))) out.push(`remover «${r.remover}»: its anchor is not one or two lines of text`);
    if (r.was !== undefined && r.was !== RE) out.push(`remover «${r.remover}»: was «${r.was}» (only ${RE} is a mark)`);
    if (typeof r.keeps !== 'string' || r.keeps.trim().length < 4) out.push(`remover «${r.remover}»: no store it keeps`);
    if (typeof r.why !== 'string' || r.why.trim().length < 8) out.push(`remover «${r.remover}»: no why`);
    if (!(typeof r.fp === 'string' && /^[0-9a-f]{12}$/.test(r.fp))) out.push(`remover «${r.remover}»: no fingerprint of its block (fp: 12 hex)`);
    if (r.verdict === RE && !(typeof r.lane === 'string' && r.lane.trim().length > 0)) out.push(`remover «${r.remover}»: reads empty with no lane that holds its cure`);
    if (r.verdict === AS && r.lane !== undefined) out.push(`remover «${r.remover}»: a lane on a remover that asks`);
  }
  return out;
}

// ── the tree's census ─────────────────────────────────────────────────────────────────────────────────────────────
const files = sourceFiles(REPO);
const byRel = new Map(files.map((f) => [f.rel, f.text]));
const textOf = (rel) => (byRel.has(rel) ? byRel.get(rel) : null);
const found = netOf(files);
const count = (v) => ROWS.filter((r) => r.verdict === v).length;
console.log(`the data folder's stores: ${ROWS.length} rows — ${count(U)} under the law, ${count(H)} their own hold (${ROWS.filter((r) => r.gap).length} with a gap), ${count(D)} derived, ${count(X)} WRITTEN OVER (${WRITTEN_OVER_AT_BIRTH.length} at the birth), ${count(N)} not a store, ${count(G)} gone; the net: ${found.size} files over ${files.length} source files`);

console.log('① every row\'s read, exactly once in its module, its block as fingerprinted');
{
  const f = anchorFindings(ROWS, textOf);
  ok(f.length === 0, `every one of the ${ROWS.filter((r) => r.verdict !== G).length} anchors is in its module exactly once; ${ROWS.filter((r) => r.fp).length} blocks as fingerprinted; ${ROWS.filter((r) => r.bound).length} bindings in place`, f);
}
console.log('② the verdicts');
{
  const f = verdictFindings(ROWS);
  ok(f.length === 0, 'every row: a known verdict, a why; the law rows read through the law and no other does; each held, derived and written-over row has its fp; each written-over row and gap names its lane; one row a store', f);
  const lanes = [...new Set(ROWS.filter((r) => r.lane).map((r) => r.lane))].sort();
  console.log(`   the lanes that hold a cure: ${lanes.join(', ')}`);
}
console.log('③ THE NET: a store file of the data folder without a row is red');
{
  const f = netFindings(found, ROWS).concat(goneFindings(ROWS, files));
  ok(f.length === 0, `every one of the ${found.size} files the data folder's code joins has its row; no GONE row is still named`, f);
  for (const [s, road] of [['jobs.json', 'a quoted name'], ['browser-kept.json', 'a constant of a required module'], ['drafts.json', 'a \'data\' folder'], ['relay-token.json', 'a constant of a required module'], ['channels/api-cards.json', 'a name kept from a join'], ['tls/state.json', 'a name kept from a join'], ['browser-tools/cli-pin.json', 'a subfolder in one join']]) ok(found.has(s), `the net finds ${s} (${road})`);
}
console.log('④ THE RATCHET: the written-over count only falls');
{
  const f = ratchetFindings(ROWS, WRITTEN_OVER_AT_BIRTH, textOf);
  ok(f.length === 0, `no written-over store outside the birth's ${WRITTEN_OVER_AT_BIRTH.length}, no cured one back, every cure marked and real (${count(X)} written over today)`, f);
  const sig = sha12(JSON.stringify(WRITTEN_OVER_AT_BIRTH));
  ok(sig === BIRTH_SIGNATURE && new Set(WRITTEN_OVER_AT_BIRTH.map((b) => b.store)).size === WRITTEN_OVER_AT_BIRTH.length, `the birth is as signed (${sig}), each store once`);
}
console.log('⑥ THE REMOVER CENSUS: every file deletion call counted, every remover that keeps a store judged');
const delCounts = deletionCounts(files);
{
  const f = deletionFindings(delCounts, DELETION_CALLS);
  ok(f.length === 0, `every one of the ${[...delCounts.values()].reduce((a, b) => a + b, 0)} file deletion calls in ${delCounts.size} files is in its file's row`, f);
  const rrows = REMOVERS.map(asRow);
  const g = removerFindings(REMOVERS);
  if (!g.length) g.push(...anchorFindings(rrows, textOf));
  ok(g.length === 0, `every one of the ${REMOVERS.length} removers that keep a store: its anchor once, its block as fingerprinted, a known verdict, the stores it keeps; each one that reads empty names its lane (${REMOVERS.filter((r) => r.verdict === RE).length} read empty, ${REMOVERS.filter((r) => r.verdict === AS).length} ask)`, g);
  const rb = READING_EMPTY_AT_BIRTH.map((b) => ({ ...b, store: rkey(b) }));
  const h = ratchetFindings(rrows, rb, textOf, RE);
  const rsig = sha12(JSON.stringify(READING_EMPTY_AT_BIRTH));
  ok(h.length === 0, `no remover reads empty outside the birth's ${READING_EMPTY_AT_BIRTH.length}, none back, every cure marked and real (${REMOVERS.filter((r) => r.verdict === RE).length} read empty today)`, h);
  ok(rsig === RBIRTH_SIGNATURE && new Set(rb.map((b) => b.store)).size === rb.length, `the removers' birth is as signed (${rsig}), each remover once`);
}
console.log('⑤ RED CONTROLS (planted modules and rows)');
{
  // the net, each road
  const planted = [
    { rel: 'src/server/p-quoted.js', text: "const f = path.join(dataDir, 'p-quoted.json');\nconst g = nodePath.resolve(this.dataDir, `p-tick.jsonl`);" },
    { rel: 'src/server/p-const.js', text: "const FILE = 'p-const.ndjson';\nconst p = path.join(deps.dataDir, FILE);" },
    { rel: 'src/p-lib.js', text: "const STORE_FILE = 'p-imported.json';\nmodule.exports = { STORE_FILE };" },
    { rel: 'src/server/p-imported.js', text: "const C = require('../p-lib');\nconst p = path.join(dataDir, C.STORE_FILE);" },
    { rel: 'src/server/p-root.js', text: "const p = path.join(__dirname, '..', \"data\", 'p-root.json');\nconst q = path.join(rootDir, 'data', 'p-sub', '.p-key');" },
    { rel: 'src/server/p-kept.js', text: "const dir = path.join(dataDir, 'p-folder');\nconst f = path.join(dir, 'p-kept.json');\nfunction t() { const dir = path.join(tmpRoot, 'x'); return path.join(dir, 'p-tmp.json'); }" },
    { rel: 'src/server/p-far.js', text: "const dir = path.join(dataDir, 'p-far');\n" + '\n'.repeat(VAR_REACH) + "const g = path.join(dir, 'p-far-away.json');" },
    { rel: 'src/server/p-near.js', text: "const dir = path.join(dataDir, 'p-near');\n" + '\n'.repeat(VAR_REACH - 1) + "const g = path.join(dir, 'p-near.json');" },
    { rel: 'src/server/p-not.js', text: "const p = path.join(someOtherDir, 'p-not-data.json');\nconst q = path.join(dataDir, 'p-folder-only');\nconst r = path.join(dataDir, 'bin', 'p-program.js');" },
  ];
  const nf = netFindings(netOf(planted), []);
  const named = (s) => nf.some((x) => x.startsWith(s + ' '));
  const want = ['p-quoted.json', 'p-tick.jsonl', 'p-const.ndjson', 'p-imported.json', 'p-root.json', 'p-sub/.p-key', 'p-folder/p-kept.json', 'p-near/p-near.json'];
  ok(nf.length === want.length && want.every(named) && nf.every((x) => x.includes('with no row')),
    'RED: a planted store on each road — quoted (path.join, nodePath.resolve, a backtick, .json / .jsonl / .ndjson), its own constant, a required module\'s constant, a \'data\' folder (either quote), a subfolder and a dot file, a name kept from a join (at VAR_REACH lines exactly) — each red by name', nf);
  ok(!named('p-not-data.json') && !named('p-folder-only') && !named('p-program.js') && !named('p-tmp.json') && !named('p-far/p-far-away.json'), 'and none for another folder, a folder, a program of data/bin, a kept name re-bound to another folder, or one used one line beyond VAR_REACH');
  const gone = [{ store: 'p-quoted.json', module: 'src/server/p-quoted.js', verdict: G, why: 'a planted gone row' }];
  ok(netFindings(netOf(planted.slice(0, 1)), gone).filter((x) => x.includes('GONE')).length === 1 && goneFindings(gone, planted).length === 1 && goneFindings(gone, planted.slice(1)).length === 0, 'RED: a GONE row whose name the tree still joins or names; green once no file names it');

  // the anchors and blocks
  const PM = 'src/p-store.js';
  const src = ['function load() {', "  try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); }", '  catch (e) {', "    if (e && e.code !== 'ENOENT') held = e.code;", '  }', '}', "const B = new Store('p', path.join(dataDir, 'p-store.json'));"].join('\n');
  const pl = src.split('\n');
  const read = ["try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); }", 'catch (e) {'];
  const pr = { store: 'p-store.json', module: PM, read, verdict: X, fp: sha12(blockOf(pl, 1, read[1])), bound: [PM, "path.join(dataDir, 'p-store.json')"], lane: NOT_ROUTED, why: 'a planted written-over store' };
  const at = (t) => (m) => (m === PM ? t : null);
  const a = (t, r = pr) => anchorFindings([r], at(t));
  const has = (f, w) => f.length === 1 && f[0].includes(w);
  ok(blockOf(pl, 1, read[1]).split('\n').length === 4 && a(src).length === 0, 'the planted store green: its block is its read through the end of its catch (4 lines)');
  ok(has(a(src.replace('fs.readFileSync(file', 'fs.readFileSync(other')), 'no longer') && has(a(src + '\n' + read[0] + '\n' + read[1]), '2 times') && has(a(src.replace('catch (e) {', 'catch (err) {')), 'no longer'),
    'RED: its read moved, found twice, its failure\'s answer changed');
  ok(has(a(src.replace('held = e.code', 'held = null')), 'block') && a(src.replace('held = e.code', 'held = null'), { ...pr, fp: undefined }).length === 0, 'RED: a change inside its block under unchanged anchor lines — red by its fp alone (the r3006 shape)');
  ok(has(a(src.replace("'p-store.json'", "'p-other.json'")), 'binding'), 'RED: its name no longer bound to the shared read');
  ok(has(anchorFindings([{ ...pr, module: 'src/p-nowhere.js' }], at(src)), 'not in the tree'), 'RED: a row whose module left the tree');
  const hold2 = ['function hold() {', '  const loaded = parse(readText());', '  if (loaded.error) {', '    unreadable = loaded.error;', '  }', '}'];
  ok(blockOf(hold2, 1, 'if (loaded.error) {').split('\n').length === 4, 'a read whose hold is an if below it: its block runs to the end of that if');

  // the verdicts
  const law = { store: 'p-law.json', module: PM, read: ['const a = SR.storeAnswer(read, { valid: V });'], verdict: U, why: 'a planted law store' };
  const held = { ...pr, store: 'p-held.json', verdict: H, lane: undefined, why: 'a planted held store' };
  const one = (r) => verdictFindings([r]);
  ok(has(one({ ...pr, verdict: 'MAYBE' }), 'unknown verdict') && has(one({ ...pr, lane: undefined }), 'no lane') && has(one({ ...law, read: pr.read }), 'does not go through') && has(one({ ...held, read: law.read }), 'goes through the law')
    && has(one({ ...held, lane: 'some-lane' }), 'nothing to cure') && has(verdictFindings([pr, pr]), 'two rows') && has(one({ ...pr, fp: undefined }), 'no fingerprint') && has(one({ ...pr, fp: 'not-hex' }), 'no fingerprint') && has(one({ ...law, fp: pr.fp }), 'an fp on'),
    'RED: an unknown verdict, a written-over row with no lane, a law row off the law, a held row on it, a lane with nothing to cure, two rows of one store, no fp or a malformed one, an fp on a law row');
  ok(verdictFindings([pr, law, held]).length === 0, 'the planted rows themselves are green');

  // the ratchet
  const birth = [{ store: pr.store, module: PM, read, fp: pr.fp }];
  const cured = src.replace('held = e.code', 'held = e.code; refuse()');
  const r = (rows, t = src) => ratchetFindings(rows, birth, at(t));
  ok(r([pr]).length === 0, 'the planted birth green');
  ok(has(r([pr, { ...pr, store: 'p-new.json' }]), 'NEW ' + X), 'RED: a new written-over store outside the birth');
  ok(has(r([{ ...pr, verdict: H, lane: undefined }], cured), 'without was'), 'RED: a cure without its mark (was: WRITTEN OVER)');
  ok(r([{ ...pr, verdict: H, lane: undefined, was: X }], cured).length === 0, 'a real cure with its mark is green — the count fell by one');
  ok(has(r([{ ...pr, verdict: H, lane: undefined, was: X }], src), 'by an edit'), 'RED: a verdict moved off WRITTEN OVER with the birth read unchanged and the row still pinning it');
  ok(r([{ ...pr, verdict: H, lane: undefined, was: X, read: ['function load() {'] }], src).length === 0, 'a cure made elsewhere, its row moved onto the cure\'s own line, is green (the birth read may stay)');
  ok(has(ratchetFindings([{ ...pr, verdict: H, lane: undefined, was: X, read: ['function load() {'] }], birth, () => null), 'left the tree'), 'RED: a moved birth row whose birth module left the tree (never silent)');
  const nob = ['function f() {', "  const v = JSON.parse(fs.readFileSync(p, 'utf8'));", '  if (v) keep(v);', '  else dropAll();', '}', 'function g() {', '  x();', '}'];
  ok(blockOf(nob, 1, 'else dropAll();').split('\n').length === 3, 'an answer line that opens no brace ends the block there (it never runs into the next function)');
  ok(has(r([{ ...pr, was: X }]), X + ' again'), 'RED: a cured store written over again');
  ok(has(r([]), 'no row'), 'RED: a birth row gone from the census');

  // ⑥ the remover census
  const pd = [{ rel: 'src/server/p-del.js', text: "fs.rmSync(a);\nawait fsp.unlink(b);\nfs.promises.rm(c);\nfs.unlink(d, cb);\nconst e = 'rmSync(x)'.length;" },
    { rel: 'src/server/p-del2.js', text: "fs.unlinkSync(a); fs.rmdirSync(b); await fs.promises.unlink(c);\nconst P = fs.promises; await P.rm(d);\nawait io.rm(e);\nPinRecord.sweep(dir, keep);\ndeleteSessionMeta(sock);" },
    { rel: 'src/agentd/agentd.js', text: 'fs.rmSync(z);' }];
  const dc = deletionCounts(pd);
  ok(dc.get('src/server/p-del.js') === 5 && dc.get('src/server/p-del2.js') === 7 && !dc.has('src/agentd/agentd.js'), 'the count: every call form (rmSync, unlinkSync, rmdirSync, fsp.unlink, fs.promises.rm / unlink, fs.unlink, an alias P.rm, io.rm) and the deleting helpers (PinRecord.sweep, deleteSessionMeta) — a quoted one counts too: the count is of text — the device agent\'s own side out', [...dc]);
  const dc1 = new Map([['src/server/p-del.js', dc.get('src/server/p-del.js')]]);
  ok(has(deletionFindings(dc1, {}), 'no row') && has(deletionFindings(dc1, { 'src/server/p-del.js': 4 }), 'its row says 4') && has(deletionFindings(new Map(), { 'src/server/p-del.js': 5 }), 'drop its row') && deletionFindings(dc1, { 'src/server/p-del.js': 5 }).length === 0,
    'RED: a file with deletion calls and no row, a new call in a counted file, a row with no call left; green when the count is the row');
  const prm = { remover: 'p-sweep', module: PM, read, verdict: RE, fp: pr.fp, keeps: 'p-store.json', lane: NOT_ROUTED, why: 'a planted remover' };
  const rf = (x) => removerFindings([x]);
  ok(rf(prm).length === 0 && has(rf({ ...prm, verdict: 'MAYBE' }), 'unknown verdict') && has(rf({ ...prm, lane: undefined }), 'no lane') && has(rf({ ...prm, verdict: AS }), 'a lane on') && has(rf({ ...prm, fp: undefined }), 'fingerprint') && has(rf({ ...prm, keeps: '' }), 'no store') && has(removerFindings([prm, prm]), 'two rows'),
    'RED: a remover with an unknown verdict, one reading empty with no lane, a lane on one that asks, no fp, no store kept, two rows of one remover');
  ok(has(anchorFindings([asRow(prm)], at(src.replace('held = e.code', 'held = null'))), 'block'), 'RED: a change inside a remover\'s block');
  const rbirth = [{ remover: 'p-sweep', module: PM, read, fp: pr.fp }].map((b) => ({ ...b, store: rkey(b) }));
  const rr = (rows, t = src) => ratchetFindings(rows.map(asRow), rbirth, at(t), RE);
  ok(rr([prm]).length === 0 && has(rr([prm, { ...prm, remover: 'p-new' }]), 'NEW READS EMPTY') && has(rr([{ ...prm, verdict: AS, lane: undefined }], cured), 'without was') && rr([{ ...prm, verdict: AS, lane: undefined, was: RE }], cured).length === 0 && has(rr([{ ...prm, verdict: AS, lane: undefined, was: RE }], src), 'by an edit'),
    'RED: a new remover reading empty, a cure without its mark, a verdict moved by an edit; a real cure with its mark green');
  ok(has(removerFindings([prm, { ...prm, module: 'src/p-other.js' }]), 'two rows') && rr([{ ...prm, module: 'src/p-other.js', verdict: AS, lane: undefined, was: RE, read: ['function load() {'] }], src).length === 0 && has(rr([{ ...prm, was: RE }]), RE + ' again') && has(rr([]), 'no row') && has(removerFindings([{ ...prm, was: 'MAYBE' }]), 'only READS EMPTY is a mark') && has(removerFindings([{ ...prm, read: [] }]), 'anchor'),
    'RED: the same remover name twice (in another module too), a cured remover back, a birth remover gone, a mark that is not one, a remover with no anchor; a remover moved to the module where its cure asks is green');
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
