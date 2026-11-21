'use strict';
// B-346d's recorder (the coordinator's r1228), part (c): THE HUB'S OWN SIGNALS, ONE small ledger a pid. Every hub site that
// signals a process a browser record names — the keeper's endProcess and its stop, the person's process-panel kill — notes it
// here, so a «daemon gone» record (src/browser-gone-record.js) says whether the hub itself signalled that daemon or its Chrome
// during its run: none, or which site. In memory only, bounded: the newest LEDGER_MAX pids, each with its last ROWS_MAX rows.
// A pid is never an identity: a reader asks with `since` (the run's start), so a row from before the run (a reused pid) is
// never read as this run's.

const LEDGER_MAX = 256;
const ROWS_MAX = 8;
const ledger = new Map(); // pid → [{ site, sig, at }] — Map order = the least recently noted first

/** A hub site signalled `pid` with `sig` (SIGTERM / SIGKILL / …) — `site` is the site's fixed name, never a path or a title. */
function noteSignal(pid, site, sig, at = Date.now()) {
  const p = Number(pid);
  if (!Number.isInteger(p) || p <= 0) return;
  const rows = ledger.get(p) || [];
  ledger.delete(p);
  rows.push({ site: String(site || '?').slice(0, 60), sig: String(sig || '?').slice(0, 16), at: Number(at) || 0 });
  ledger.set(p, rows.slice(-ROWS_MAX));
  while (ledger.size > LEDGER_MAX) ledger.delete(ledger.keys().next().value);
}

/** The hub's own signals to `pid` at or after `since` — copies, oldest first. */
function signalsTo(pid, { since = 0 } = {}) {
  const rows = ledger.get(Number(pid)) || [];
  return rows.filter((r) => r.at >= Number(since || 0)).map((r) => ({ ...r, pid: Number(pid) }));
}

module.exports = { noteSignal, signalsTo, LEDGER_MAX, ROWS_MAX };
