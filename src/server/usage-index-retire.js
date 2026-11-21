'use strict';
// THE RETIRED SHADOW USAGE INDEX's FILES LEAVE THE HUB's OWN DISK (row B-360d unit 1, lane lg-providers; the design read
// w0r2kz4cb, law 1 — one derived store: the Usage window answers from the ledger's own cells). At EVERY start — never a run-once
// migration: a rollback re-creates the index and a second update must remove it again — usage.db and its -wal / -shm in the
// hub's index folder (~/.vibespace/db/<hash of data/'s real path>/, the search index's indexDirFor) are removed OFF THE LOOP
// (async), and nothing else there is touched: search.db and owner.json stay. A file that will not go is said once and tried
// again at the next start.
const fs = require('fs');
const os = require('os');
const path = require('path');

const FILES = Object.freeze(['usage.db', 'usage.db-wal', 'usage.db-shm']);

async function removeRetiredUsageIndex({ dataDir, homeDir = os.homedir(), log = console } = {}) {
  let dir = null;
  try { dir = require('./search-index.js').indexDirFor(dataDir, homeDir).dir; } catch { return { dir: null, removed: [] }; }
  const removed = [];
  for (const f of FILES) {
    try { await fs.promises.rm(path.join(dir, f)); removed.push(f); }
    catch (e) { if (e && e.code !== 'ENOENT') log.warn?.(`[usage] the retired usage index's ${f} could not be removed (${e.code || e.message}) — tried again at the next start`); }
  }
  if (removed.length) log.log?.(`[usage] the retired usage index's files were removed from ${dir}: ${removed.join(', ')} — the Usage window answers from the ledger's own cells`);
  return { dir, removed };
}

module.exports = { removeRetiredUsageIndex, FILES };
