'use strict';
/**
 * codex-fork-ledger-purge.js — THE ONE-SHOT ARCHIVE of forked-rollout replay
 * rows from the permanent usage ledger (2.369.203, migration
 * `2026-10-archive-codex-fork-replays`).
 *
 * WHAT IT REPAIRS. A forked codex rollout (session_meta.forked_from_id) opens
 * by replaying its ancestors' token_count records, all stamped at the fork
 * instant. The walk keyed each one `cx:<fork thread>:<cumulative total>`, so
 * the per-thread rid never met the ancestor's `cx:<ancestor>:<same total>` and
 * the same API request was counted twice — 1,661 rows on the author's
 * instance (1,557 gpt-5.6-sol + 104 with a null model, because the replay
 * precedes the fork's first turn_context), ≈ $177 at ledger rates, all
 * 2026-08-24..25 (price check wf_d2b3907b-2c5, 2026-10-02). From this release
 * both walkers skip the replay (src/usage-walker.js FORK REPLAY); this cleans
 * the rows written before that.
 *
 * WHICH ROWS. A row is archived only when ALL of these hold:
 *   · it is a LOCAL codex row (rid `cx:<thread>:<total>`, no `host`) and the
 *     thread's rollout on this machine is a fork — a host's rollouts are not
 *     readable here, so its rows stay;
 *   · its ts is within 2 s of the fork instant (the walker's replay rule);
 *   · the ledger holds its ORIGINAL: an EARLIER codex row of ANOTHER thread
 *     with the same cumulative total and identical i / cr / o.
 * The last clause keeps a replay whose ancestor was never ingested (then it is
 * the request's only record) and a coincidental total match (different
 * tokens — a real request; the check found one).
 *
 * RULES (the migration-runner contract): archive, never destroy — every row
 * goes to data/archive/ with a reason BEFORE its shard is rewritten (atomic
 * tmp + rename); idempotent (the originals have no earlier twin, so a second
 * run finds nothing); a crash between a shard's archive append and its rename
 * leaves the rows in BOTH places — the rerun (the runner records nothing until
 * run() returns) archives only what this migration's archive files do not
 * already hold (verify r1); local files only.
 *
 * THE ESTIMATOR needs nothing voided: learnRates recomputes every pair's cost
 * from the live ledger through the interval memo, whose key carries the
 * ledger's event count — which this changes (usage-anchors.js).
 */
const fs = require('fs');
const path = require('path');

const REPLAY_WINDOW_MS = 2000; // = the walkers' FORK REPLAY window

function _writeAtomic(fp, text) { fs.writeFileSync(fp + '.tmp', text); fs.renameSync(fp + '.tmp', fp); }
function _day(ms) { return new Date(ms).toISOString().slice(0, 10); }

// The rollout's first line (session_meta) → its fork instant, 0 = not a fork,
// null = unreadable (a compressed rollout, a torn line).
function _forkInstant(fp) {
  if (!/\.jsonl$/.test(fp)) return null;
  let fd; try { fd = fs.openSync(fp, 'r'); } catch { return null; }
  try {
    let buf = Buffer.alloc(0);
    const chunk = Buffer.alloc(256 * 1024);
    while (buf.length < 8 * 1024 * 1024) {
      const n = fs.readSync(fd, chunk, 0, chunk.length, buf.length);
      if (n <= 0) break;
      buf = Buffer.concat([buf, chunk.subarray(0, n)]);
      const nl = buf.indexOf(10);
      if (nl >= 0) { buf = buf.subarray(0, nl); break; }
    }
    const r = JSON.parse(buf.toString('utf-8'));
    if (r?.type !== 'session_meta') return 0;
    return r.payload?.forked_from_id ? (Date.parse(r.payload.timestamp || r.timestamp) || null) : 0;
  } catch { return null; } finally { try { fs.closeSync(fd); } catch { } }
}

/**
 * @param {object} o
 * @param {string} o.dataDir           the instance's data/
 * @param {string} o.codexSessionsDir  this machine's codex sessions dir
 * @param {string} o.id                the migration id (stamped on every archive line)
 */
function purgeCodexForkReplays({ dataDir, codexSessionsDir, id, now = Date.now(), dryRun = false }) {
  const historyDir = path.join(dataDir, 'usage-history');
  const archiveDir = path.join(dataDir, 'archive');
  const report = { shards: 0, rowsIn: 0, codexRows: 0, twins: 0, archived: 0, tokens: 0, keptHost: 0, keptNotFork: 0, keptOutsideWindow: 0, keptUnreadable: 0, alreadyArchived: 0, dryRun: !!dryRun };

  // ① every codex row, first copy of a rid (the loader's dedup)
  let shardNames = [];
  try { shardNames = fs.readdirSync(historyDir).filter((f) => /^events-\d{4}-\d{2}\.ndjson$/.test(f)).sort(); } catch { }
  const rows = [], seen = new Set(), texts = new Map();
  for (const name of shardNames) {
    let text = ''; try { text = fs.readFileSync(path.join(historyDir, name), 'utf-8'); } catch { continue; }
    texts.set(name, text);
    for (const line of text.split('\n')) {
      if (!line) continue;
      report.rowsIn++;
      if (line.indexOf('"cx:') < 0) continue;
      let r; try { r = JSON.parse(line); } catch { continue; }
      const m = /^cx:([0-9a-f-]{36}):(\d+)$/i.exec(String(r?.rid || ''));
      if (!m || seen.has(r.rid)) continue;
      seen.add(r.rid);
      report.codexRows++;
      rows.push({ r, thread: m[1].toLowerCase(), key: `${m[2]}|${r.i}|${r.cr}|${r.o}` });
    }
  }

  // ② rows with an earlier identical twin in another thread
  const byKey = new Map();
  for (const x of rows) { const l = byKey.get(x.key); if (l) l.push(x); else byKey.set(x.key, [x]); }
  const twins = [];
  for (const l of byKey.values()) {
    if (l.length < 2) continue;
    for (const x of l) if (l.some((y) => y.thread !== x.thread && y.r.ts < x.r.ts)) twins.push(x);
  }
  report.twins = twins.length;

  // ③ …that sit in a LOCAL fork's replay window
  let rollouts = [];
  if (twins.length) { try { rollouts = fs.readdirSync(codexSessionsDir, { recursive: true }); } catch { } }
  const fileOf = new Map();
  for (const rel of rollouts) {
    const m = /rollout-.*-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl(\.zst)?$/i.exec(String(rel));
    if (m) fileOf.set(m[1].toLowerCase(), path.join(codexSessionsDir, String(rel)));
  }
  const forkAt = new Map();
  const drop = new Map(); // rid → reason
  for (const x of twins) {
    if (x.r.host) { report.keptHost++; continue; }
    if (!forkAt.has(x.thread)) forkAt.set(x.thread, fileOf.has(x.thread) ? _forkInstant(fileOf.get(x.thread)) : null);
    const at = forkAt.get(x.thread);
    if (at == null) { report.keptUnreadable++; continue; }
    if (!at) { report.keptNotFork++; continue; }
    if (!(x.r.ts <= at + REPLAY_WINDOW_MS)) { report.keptOutsideWindow++; continue; }
    drop.set(x.r.rid, `codex fork replay: thread ${x.thread} is a fork (session_meta ${new Date(at).toISOString()}) and this token_count is its replay of an ancestor's request — the same total and tokens are already counted under another thread, earlier`);
    report.tokens += (Number(x.r.i) || 0) + (Number(x.r.cr) || 0) + (Number(x.r.o) || 0);
  }

  // ④ what an interrupted earlier run of THIS migration already archived
  // (shard + rid): its shard rewrite never landed, so the rows are back in
  // `drop` — they leave the shard again but are not archived a second time
  const archived = new Set();
  if (drop.size && !dryRun) {
    let names = []; try { names = fs.readdirSync(archiveDir).filter((f) => /^codex-fork-replays-.*\.ndjson$/.test(f)); } catch { }
    for (const f of names) {
      let t = ''; try { t = fs.readFileSync(path.join(archiveDir, f), 'utf-8'); } catch { continue; }
      for (const l of t.split('\n')) {
        if (!l) continue;
        try { const a = JSON.parse(l); if (a && a.migration === id && a.entry) archived.add(a.file + '\n' + a.entry.rid); } catch { } // a torn last line = not archived
      }
    }
  }

  // ⑤ archive, then rewrite each touched shard (every copy of a dropped rid)
  for (const [name, text] of texts) {
    const keep = [], out = [];
    for (const line of text.split('\n')) {
      if (!line) continue;
      let rid = null;
      if (line.indexOf('"cx:') >= 0) { try { rid = JSON.parse(line).rid; } catch { } }
      if (rid && drop.has(rid)) out.push(line); else keep.push(line);
    }
    if (!out.length) continue;
    report.shards++; report.archived += out.length;
    if (dryRun) continue;
    const fresh = out.filter((line) => !archived.has(name + '\n' + JSON.parse(line).rid));
    report.alreadyArchived += out.length - fresh.length;
    if (fresh.length) {
      fs.mkdirSync(archiveDir, { recursive: true });
      fs.appendFileSync(path.join(archiveDir, `codex-fork-replays-${_day(now)}.ndjson`), fresh.map((line) => {
        const entry = JSON.parse(line);
        return JSON.stringify({ migration: id, at: now, store: 'usage-history', file: name, reason: drop.get(entry.rid), entry });
      }).join('\n') + '\n');
    }
    _writeAtomic(path.join(historyDir, name), keep.length ? keep.join('\n') + '\n' : '');
  }
  return report;
}

module.exports = { purgeCodexForkReplays, REPLAY_WINDOW_MS };
