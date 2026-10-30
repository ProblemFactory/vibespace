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
//     error's first line, belted by the secret-shapes rule) and the run that succeeds resolves it. A migration that said its
//     failure in its own For-you words throws with `told: true` — no second item. A notice that cannot be filed is a warn line
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

const i18nKey = (s) => s; // extraction marker (scripts/i18n-extract.mjs)
const FAILED_INBOX_KEY = 'migrations';
const FAILED_WORDS = Object.freeze({
  text: i18nKey('A data migration failed at startup: {id}'),
  error: i18nKey('Its error: {error}'),
  retry: i18nKey('Nothing was recorded — it retries at the next start; the server log has the whole line.'),
  source: i18nKey('Migrations'), // the tray group's name (zh / ja)
});
function inboxOf(todos) { try { const t = typeof todos === 'function' ? todos() : todos; return t && typeof t.add === 'function' ? t : null; } catch { return null; } }
function sayFailed(todos, id, e, warn) {
  const store = inboxOf(todos);
  if (!store || (e && e.told)) return;
  try {
    const error = redactSecrets(String((e && e.message) || e).split('\n')[0].slice(0, 300), { runs: true }).text;
    const head = { key: FAILED_WORDS.text, params: { id } }, lines = [{ key: FAILED_WORDS.error, params: { error } }, { key: FAILED_WORDS.retry }];
    const fill = (l) => l.key.replace(/\{(\w+)\}/g, (m, k) => (l.params && l.params[k] != null ? String(l.params[k]) : m));
    store.add(FAILED_INBOX_KEY, { origin: 'server', kind: 'notice', urgency: 'high', by: 'system', sessionName: 'Migrations', itemKey: id, text: fill(head), detail: lines.map(fill).join('\n'), i18n: { text: head, detail: lines, source: { key: FAILED_WORDS.source } } });
  } catch (x) { warn(`[migrate] ${id}: its For-you notice was not filed — ${(x && x.message) || x}`); }
}
function sayRan(todos, id) {
  const store = inboxOf(todos);
  try { for (const x of store?.idsWhere?.((i) => i.sessionKey === FAILED_INBOX_KEY && i.itemKey === id && i.status === 'open') || []) store.setStatus(x, 'done', 'system'); } catch { }
}

function readLedger(ledgerPath) {
  let ledger = { applied: {} };
  try { ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf-8')); } catch { }
  if (!ledger || typeof ledger !== 'object') ledger = { applied: {} };
  if (!ledger.applied || typeof ledger.applied !== 'object') ledger.applied = {};
  return ledger;
}
function writeLedger(ledgerPath, ledger, warn) {
  try {
    fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
    fs.writeFileSync(ledgerPath + '.tmp', JSON.stringify(ledger, null, 2));
    fs.renameSync(ledgerPath + '.tmp', ledgerPath);
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

function runMigrations({ ledgerPath, migrations, log = console.log, warn = console.warn, onLate = null, todos = null }) {
  const ledger = readLedger(ledgerPath);
  const results = [];
  for (const m of migrations) {
    if (!m || !m.id || typeof m.run !== 'function') continue;
    if (ledger.applied[m.id]) { results.push({ id: m.id, status: 'already' }); continue; }
    try {
      const report = m.run();
      if (report && typeof report.then === 'function') {
        // a STEPPED migration: recorded when it ENDS (the ledger re-read then — another one may have ended meanwhile)
        results.push({ id: m.id, status: 'started' });
        log(`[migrate] ${m.id} started (stepped — recorded when it ends)${m.note ? ' — ' + m.note : ''}`);
        report.then((rep) => {
          const late = readLedger(ledgerPath);
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
          try { onLate?.({ id: m.id, status: 'failed', error: (e && e.message) || String(e) }); } catch { }
        });
        continue;
      }
      ledger.applied[m.id] = Date.now();
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
      results.push({ id: m.id, status: 'failed', error: e.message });
      sayFailed(todos, m.id, e, warn);
    }
  }
  writeLedger(ledgerPath, ledger, warn);
  return results;
}

module.exports = { runMigrations, FAILED_INBOX_KEY, FAILED_WORDS };
