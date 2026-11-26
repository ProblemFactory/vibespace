'use strict';
// ONE-SHOT MIGRATION RUNNER (2.328.0, owner-decided plan B: local AND device).
// SHARED tier — the daemon bundles it, so an instance updating old→new AND a
// device daemon self-upgrading both converge their on-disk state through the
// same mechanism: an ordered registry of idempotent one-shots + a ledger that
// records what already ran. Rules:
//   · a migration runs AT MOST once per root (ledger keyed by id)
//   · a FAILED migration is logged loudly, NOT recorded, and re-attempted on
//     the next boot — it never blocks startup (availability first)
//   · migrations never DESTROY data: archive, then strip (the dormant-plan
//     pattern) — an operator can always recover from data/archive/
//   · pre-framework one-shots (home-rename, store migrations with their own
//     .migrated markers) STAY where they are with their own guards; this
//     registry is for NEW migrations only. Do not re-register them here.
//   · a FAILED migration is SAID WHERE THE OWNER LOOKS (lane job-secrets-retire r3, review F2b): the hub runs its registry
//     inside hub.listen's callback, before any client connected, so the warn line and the host's notice reached nobody —
//     a failed boot migration was a journal line. With `todos` (the hub's For-you store or a getter; a device daemon passes
//     none) a failed row files ONE notice keyed by its id (`itemKey`: one item across boots, re-worded with the latest
//     error's first line — `failedLine`: the secret-shapes belt over the WHOLE line, THEN the cut, r4) and the run that
//     succeeds resolves it. A migration that said its failure in its own For-you words throws with `told: true` — no second
//     item. A notice that cannot be filed is a warn line. The hub's `migration-failed:` toast carries the same `failedLine`
//   · THE LEDGER UNREAD (r2999 / r3244): nothing runs at that start, nothing is rewritten, and it is said ONCE — on the hub as ONE
//     For-you item with a fixed key (`migrations-ledger`: its words name the file and the person's way out), closed by the first
//     start whose ledger reads; on a device as its journal line
//   · a STEPPED migration (lane ledger-dedup-law, 2026-10-27 — a 23.8 GiB
//     ledger shard cannot be rewritten inside one boot tick): its run()
//     returns a PROMISE; the boot goes on at once (results say `started`),
//     the migration works on the loop in slices and is recorded only when it
//     ENDS (`onLate` hears it) — a restart mid-way records nothing, so it runs
//     again from its start at the next boot; a rejection is a failure like
//     any other (said, not recorded, retried next boot), never a block. A
//     synchronous run() is exactly what it always was.
const fs = require('fs');
const path = require('path');
const { redactSecrets } = require('./secret-shapes.js'); // PURE (the device bundle carries it already)
const DFILE = require('./agentd/durable-file.js'); // B-574d (lane bl-machines-b): THE device's one door — the ledger is a RECORD (the device bundles this module)

const i18nKey = (s) => s; // extraction marker (scripts/i18n-extract.mjs)
const FAILED_INBOX_KEY = 'migrations';
const FAILED_WORDS = Object.freeze({
  text: i18nKey('A data migration failed at startup: {id}'),
  error: i18nKey('Its error: {error}'),
  retry: i18nKey('Nothing was recorded — it retries at the next start; the server log has the whole line.'),
  source: i18nKey('Migrations'), // the tray group's name (zh / ja)
});
// r3244 — THE LEDGER UNREAD IS SAID WHERE THE OWNER LOOKS: ONE For-you item, a FIXED key (one item across boots), through the
// same road as a failed migration; its words name the file and say what a person can do; the first start whose ledger reads
// closes it
const LEDGER_ITEM = 'migrations-ledger';
const LEDGER_WORDS = Object.freeze({
  text: i18nKey('Data migrations did not run at startup: {file} could not be read'),
  torn: i18nKey('Its bytes do not hold a migration ledger, and it does not mend by itself: restore it from a copy, or move it aside — every migration then runs again at the next start.'),
  read: i18nKey('Reading it failed ({error}); it is read again at the next start.'),
  closes: i18nKey('This notice closes by itself at the first start whose ledger reads.'),
  stays: i18nKey('It does not read at a second start either: check that {file} is a file the server can read, or move it aside — every migration then runs again at the next start.'),
});
/** r3288 (5): the ledger's PLAIN name — «data/migrations.json» (its folder's own name and its own), ONE source for the item and the vault */
const ledgerFileOf = (ledgerPath) => path.join(path.basename(path.dirname(ledgerPath)), path.basename(ledgerPath));
const fillWords = (l) => l.key.replace(/\{(\w+)\}/g, (m, k) => (l.params && l.params[k] != null ? String(l.params[k]) : m));
// an error's FIRST line as a screen may carry it (the For-you item, the hub's toast): the belt sees the WHOLE line, THEN the
// cut (r4, review R3-F1: a token cut at 300 first is no longer a shape the belt knows — secret-shapes: never cut inside a value)
function failedLine(e) { return redactSecrets(String((e && e.message) || e).split('\n')[0], { runs: true }).text.slice(0, 300); }
function inboxOf(todos) { try { const t = typeof todos === 'function' ? todos() : todos; return t && typeof t.add === 'function' ? t : null; } catch { return null; } }
function sayFailed(todos, id, e, warn) {
  const store = inboxOf(todos);
  if (!store || (e && e.told)) return;
  try {
    const error = failedLine(e);
    const head = { key: FAILED_WORDS.text, params: { id } }, lines = [{ key: FAILED_WORDS.error, params: { error } }, { key: FAILED_WORDS.retry }];
    store.add(FAILED_INBOX_KEY, { origin: 'server', kind: 'notice', urgency: 'high', by: 'system', sessionName: 'Migrations', itemKey: id, text: fillWords(head), detail: lines.map(fillWords).join('\n'), i18n: { text: head, detail: lines, source: { key: FAILED_WORDS.source } } });
  } catch (x) { warn(`[migrate] ${id}: its For-you notice was not filed — ${(x && x.message) || x}`); }
}
/** r3244: the ledger there and unread → its ONE For-you item (the fixed key): the file by its plain name and what a person can do */
function sayLedgerUnread(todos, ledgerPath, ledger, warn) {
  const store = inboxOf(todos);
  if (!store) return;
  // r3288 (1): For you itself held unread at this start (two unread files at once) — its add would be refused: the item waits
  // for the store's own «when it reads» door, as the «ran» close does
  if (typeof store.isHeldUnread === 'function' && store.isHeldUnread()) { try { store.whenRead(() => sayLedgerUnread(todos, ledgerPath, ledger, warn), 'the unread migration ledger\'s notice'); } catch { } return; }
  try {
    const file = ledgerFileOf(ledgerPath);   // «data/migrations.json» — never the whole path
    // r3288 (3): a read error that does not mend by itself (the ledger's name is a folder; a permission that stays) gets the way out
    // too — at once for a folder, else from the SECOND start that cannot read it (its item is open from the first)
    const again = !ledger.torn && (String(ledger.unread) === 'EISDIR' || ((typeof store.idsWhere === 'function' && store.idsWhere((i) => i.sessionKey === FAILED_INBOX_KEY && i.itemKey === LEDGER_ITEM && i.status === 'open')) || []).length > 0);
    const head = { key: LEDGER_WORDS.text, params: { file } };
    const lines = [ledger.torn ? { key: LEDGER_WORDS.torn } : { key: LEDGER_WORDS.read, params: { error: String(ledger.unread) } }, ...(again ? [{ key: LEDGER_WORDS.stays, params: { file } }] : []), { key: LEDGER_WORDS.closes }];
    store.add(FAILED_INBOX_KEY, { origin: 'server', kind: 'notice', urgency: 'high', by: 'system', sessionName: 'Migrations', itemKey: LEDGER_ITEM, text: fillWords(head), detail: lines.map(fillWords).join('\n'), i18n: { text: head, detail: lines, source: { key: FAILED_WORDS.source } } });
  } catch (x) { warn(`[migrate] the unread ledger's For-you notice was not filed — ${(x && x.message) || x}`); }
}
function sayRan(todos, id) {
  const store = inboxOf(todos);
  if (store && typeof store.isHeldUnread === 'function' && store.isHeldUnread()) { try { store.whenRead(() => sayRan(todos, id), `migration ${id}'s failed notice`); } catch { } return; }   // B-44f3: For you held unread — its failed notice is closed at the read (never «none open» over an unread list)
  try { for (const x of store?.idsWhere?.((i) => i.sessionKey === FAILED_INBOX_KEY && i.itemKey === id && i.status === 'open') || []) store.setStatus(x, 'done', 'system'); } catch { }
}

/** THE LEDGER's OWN READ (主开发 r2999, row B-f276): only «not there» (ENOENT) is a first start. A ledger that is THERE and could
 *  not be read (an I/O error, a timeout on the share), or whose bytes do not parse as a ledger, is NOT an empty ledger: it answers
 *  `{ unread: why }` and runMigrations runs NOTHING at that start, rewrites no ledger and says so once — the next start reads it
 *  again (before: «nothing was ever applied», every migration ran again and the ledger was rewritten). */
function readLedger(ledgerPath) {
  let text;
  try { text = fs.readFileSync(ledgerPath, 'utf-8'); } catch (e) { if (e && e.code === 'ENOENT') return { applied: {} }; return { unread: (e && e.code) || 'error', torn: false }; }
  let ledger;
  try { ledger = JSON.parse(text); } catch { return { unread: 'its bytes do not parse', torn: true }; }
  if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger)) return { unread: 'it holds no ledger', torn: true };
  // r3244: an object with no usable list of what ran (none, a string, a list) is TORN too — never «nothing applied» (the writer
  // always writes `applied` as a map; any other shape is bytes this release did not write)
  if (!ledger.applied || typeof ledger.applied !== 'object' || Array.isArray(ledger.applied)) return { unread: 'it holds no list of what ran', torn: true };
  return ledger;
}
/** B-574d (lane bl-machines-b, 主开发 r4806): the ledger is a RECORD — after a power cut a torn ledger holds EVERY migration at every
 *  start until a person restores it (readLedger above) — so it takes its name only after ONE sync of its temp, through THE
 *  device's one door (src/agentd/durable-file.js: a refused sync is said once and the ledger still lands). */
function writeLedger(ledgerPath, ledger, warn) {
  try {
    fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
    DFILE.writeDurable({ file: ledgerPath, tmp: ledgerPath + '.tmp', data: JSON.stringify(ledger, null, 2), log: (l) => warn(`[migrate] ${l}`), what: 'the migrations\' ledger' });
  } catch (e) { warn(`[migrate] ledger write failed: ${e.message}`); }
}
function noteReport(ledger, id, report) {
  if (report && typeof report === 'object' && !Array.isArray(report)) {
    if (!ledger.reports || typeof ledger.reports !== 'object') ledger.reports = {};
    ledger.reports[id] = { at: ledger.applied[id], ...report };
    return true;
  }
  return false;
}

// lane lg-store-writes (B-0248 U5): `landStores` (the hub's boot passes it — src/server/migrations.js runLocalMigrations) lands
// what the migrations that ran handed the store writer BEFORE the ledger is stamped, and answers the writes that did NOT land
// ([] = all landed); a reshape not on disk is not recorded — it runs again next boot (each migration is idempotent), said in
// For you. Without it (a script, a suite, the vault's seal — none of them hands bytes to the writer) nothing waits.
function runMigrations({ ledgerPath, migrations, log = console.log, warn = console.warn, onLate = null, todos = null, landStores = null }) {
  const ledger = readLedger(ledgerPath);
  if (ledger.unread) {   // r2999: a ledger there and unread — nothing runs, nothing is rewritten, said ONCE (each migration answers failed by that one cause)
    const why = `${path.basename(ledgerPath)} is there and could not be read (${ledger.unread}) — no migration ran and the ledger was not rewritten; ${ledger.torn ? 'it does not mend by itself: restore it from a copy or move it aside' : 'the next start reads it again'}`;
    warn(`[migrate] ${why}`);
    sayLedgerUnread(todos, ledgerPath, ledger, warn);   // r3244: the ONE For-you item (the boot's notice reaches no page: none is connected yet)
    const held = migrations.filter((m) => m && m.id).map((m) => ({ id: m.id, status: 'failed', error: why, code: 'ledger-unread', unread: ledger.unread }));
    held.ledgerUnread = why;
    return held;
  }
  sayRan(todos, LEDGER_ITEM);   // r3244: a ledger that reads closes the unread ledger's item (none open: nothing)
  const results = [];
  const ranNow = [];
  // THE ORDER LAW (lane lg-store-writes U5b cure's readers): a migration that threw EVSNOTONDISK left a store reshaped in memory
  // and NOT on disk — a later migration may read that store's FILE (2026-10-grants-unify reads browser-profiles.json) and be
  // recorded over the older bytes. So the pass HOLDS there: nothing after it runs this boot (unrecorded: the next boot runs them,
  // in order, the reshape first)
  let held = null;
  for (const m of migrations) {
    if (!m || !m.id || typeof m.run !== 'function') continue;
    if (ledger.applied[m.id]) { results.push({ id: m.id, status: 'already' }); continue; }
    if (held) { results.push({ id: m.id, status: 'held', why: held }); continue; }
    try {
      const report = m.run();
      if (report && typeof report.then === 'function') {
        // a STEPPED migration: recorded when it ENDS (the ledger re-read then — another one may have ended meanwhile)
        results.push({ id: m.id, status: 'started' });
        log(`[migrate] ${m.id} started (stepped — recorded when it ends)${m.note ? ' — ' + m.note : ''}`);
        report.then((rep) => {
          const late = readLedger(ledgerPath);
          if (late.unread) {   // r2999: the ledger there and unread when the step ENDS — not recorded, not rewritten: it runs again next start
            const why = `${path.basename(ledgerPath)} is there and could not be read (${late.unread}) — ${m.id} ended but is not recorded and the ledger was not rewritten; it runs again at the next start`;
            warn(`[migrate] ${why}`);
            sayFailed(todos, m.id, Object.assign(new Error(why), { code: 'ledger-unread' }), warn);
            try { onLate?.({ id: m.id, status: 'failed', error: why, code: 'ledger-unread' }); } catch { }
            return;
          }
          late.applied[m.id] = Date.now();
          const rec = { id: m.id, status: 'ran' };
          if (noteReport(late, m.id, rep)) rec.report = rep;
          writeLedger(ledgerPath, late, warn);
          log(`[migrate] ${m.id} ✓ (stepped)`);
          sayRan(todos, m.id);
          try { onLate?.(rec); } catch { }
        }, (e) => {
          warn(`[migrate] ${m.id} FAILED (will retry next boot): ${(e && e.message) || e}`);
          sayFailed(todos, m.id, e, warn);
          try { onLate?.({ id: m.id, status: 'failed', error: (e && e.message) || String(e), ...(e && e.code ? { code: String(e.code) } : {}) }); } catch { }   // B-44f3: + the refusal's code (a store held unread: its rows run again at the read)
        });
        continue;
      }
      ledger.applied[m.id] = Date.now(); ranNow.push(m.id);
      // A migration MAY return a plain object of counts (2.369.152): it rides
      // the ledger beside the timestamp (`reports[id]`), so "what did the
      // upgrade boot do" is answerable from the file after the journal rolled.
      // `applied[id]` stays a number — every reader tests it for truth.
      const rec = { id: m.id, status: 'ran' };
      if (noteReport(ledger, m.id, report)) rec.report = report;
      results.push(rec);
      log(`[migrate] ${m.id} ✓${m.note ? ' — ' + m.note : ''}`);
      sayRan(todos, m.id);
    } catch (e) {
      // VERBATIM message (the loud-catch rule): a silent migration failure
      // re-manifests as mystery state drift releases later.
      warn(`[migrate] ${m.id} FAILED (will retry next boot): ${e.message}`);
      results.push({ id: m.id, status: 'failed', error: e.message, ...(e && e.code ? { code: String(e.code) } : {}) });   // B-44f3: + the code
      sayFailed(todos, m.id, e, warn);
      if (e && e.code === 'EVSNOTONDISK') { held = `${m.id}'s write is not on disk yet`; warn(`[migrate] the migrations after ${m.id} are HELD until the next boot (a later one may read the store it reshaped)`); }
    }
  }
  if (ranNow.length && typeof landStores === 'function') {
    let left = []; try { left = landStores() || []; } catch (e) { left = [{ name: 'the store writer', why: e.message }]; }
    if (left.length) {   // a reshape not on disk is not recorded: the migration runs again at the next boot (each is idempotent)
      const why = `${left.map((x) => x.name).join(', ')} not on disk yet (${left[0].why})`;
      warn(`[migrate] ${why} — ${ranNow.join(', ')} not recorded, they run again next boot`);
      for (const id of ranNow) {
        delete ledger.applied[id]; if (ledger.reports) delete ledger.reports[id];
        const r = results.find((x) => x.id === id); if (r) { r.status = 'failed'; r.error = why; delete r.report; }
        sayFailed(todos, id, new Error(why), warn);   // the For-you row the run had closed is opened again (the runner's no-silent-failure law)
      }
    }
  }
  writeLedger(ledgerPath, ledger, warn);
  return results;
}

module.exports = { runMigrations, failedLine, FAILED_INBOX_KEY, FAILED_WORDS, LEDGER_ITEM, LEDGER_WORDS, ledgerFileOf };
