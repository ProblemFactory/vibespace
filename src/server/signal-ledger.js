'use strict';
// B-346d's recorder (the coordinator's r1228 / r1311), part (c): THE HUB'S OWN SIGNALS, ONE small ledger a pid. Every hub site that
// signals a process a browser record names — the keeper's endProcess and its stop, the person's process-panel kill — notes it
// here WHERE THE KILL SUCCEEDED (a failed or skipped kill is not the hub's own signal), with the signalled process's START TIME
// when the site knows it, so a «daemon gone» record (src/browser-gone-record.js) can say whether the hub itself signalled that
// daemon or its Chrome during its run — none, or which site — and name a pid that was another process by then as such.
// In memory only, bounded: the newest LEDGER_MAX pids, each with its last ROWS_MAX rows, for this hub process's life (HELD_SINCE).
// A pid is never an identity: a reader asks with `since` (the run's start), and compares a row's start with the run's process.

const LEDGER_MAX = 256;
const ROWS_MAX = 8;
const HELD_SINCE = Date.now(); // the ledger holds notes from this hub process's start
const ledger = new Map(); // pid → [{ site, sig, at, start }] — Map order = the least recently noted first

/** A hub site's kill of `pid` with `sig` SUCCEEDED — `site` is the site's fixed name, never a path or a title; `start` = the
 *  signalled process's start time as the site read it (null when the site does not know it). */
function noteSignal(pid, site, sig, at = Date.now(), start = null) {
  const p = Number(pid);
  if (!Number.isInteger(p) || p <= 0) return;
  const rows = ledger.get(p) || [];
  ledger.delete(p);
  rows.push({ site: String(site || '?').slice(0, 60), sig: String(sig || '?').slice(0, 16), at: Number(at) || 0, start: start == null ? null : String(start) });
  ledger.set(p, rows.slice(-ROWS_MAX));
  while (ledger.size > LEDGER_MAX) ledger.delete(ledger.keys().next().value);
}

/** The hub's own signals to `pid` at or after `since` — copies, oldest first. */
function signalsTo(pid, { since = 0 } = {}) {
  const rows = ledger.get(Number(pid)) || [];
  return rows.filter((r) => r.at >= Number(since || 0)).map((r) => ({ ...r, pid: Number(pid) }));
}

module.exports = { noteSignal, signalsTo, LEDGER_MAX, ROWS_MAX, HELD_SINCE };
