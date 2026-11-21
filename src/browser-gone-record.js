'use strict';
// B-346d's RECORDER (the coordinator's r1228): THE ONE JOURNAL RECORD AT «DAEMON GONE» — what the next occurrence of a daemon that
// ends early must leave, so it is placed from the record and never by sampling a hub again. PURE: the facts in, one line out.
// NAMES AND NUMBERS ONLY: a profile id, a namespace, pids, times, the keeper's own fixed words and the hub's own site names — never
// a page address, a site name or a title.
//   (a) the last time a tick saw it alive, beside the time it was found gone — a bound on both sides;
//   (b) its Chrome's state when the daemon was found gone, said in every case (alive — the reap decides / already gone / none);
//   (c) the hub's own signals to that daemon or its Chrome during its run (src/server/signal-ledger.js): none (and since when the
//       ledger holds notes), or each — what was sent, by which site, to which process (a pid that was another process by then
//       is named as such);
//   (d) the hub unit's out-of-memory kill counter (its cgroup's memory.events `oom_kill`): the first value read during its run
//       and the last one read when it was found gone, each with its time — the counter is read in its OWN flight, never
//       waited on by the tick (r1311): a value that never came back is «not read».
// (The daemon's own last lines are not here: whether the driver hands its error stream to the daemon is a measure on the real
// driver, owed to a box run — B-346d (e).)

const iso = (ms) => (Number(ms) > 0 ? new Date(Number(ms)).toISOString() : 'not recorded');
const int = (v) => (Number.isInteger(v) && v >= 0 ? v : null);

/** The Chrome's state in words — every case said. */
function chromeWords(c) {
  if (c && c.state === 'alive') return `alive (pid ${int(c.pid)}) when its daemon was found gone (the reap decides)`;
  if (c && c.state === 'gone') return `already gone (pid ${int(c.pid)})`;
  if (c && c.state === 'other') return `pid ${int(c.pid)} is another process now — left alone`;
  return 'none recorded for this run';
}

/** The hub's own signals in words: none (and since when the ledger holds notes), or each — what was sent, to which process, by
 *  which site, when. `other` = the row's process start differs from this run's: that pid was another process by then. */
function signalWords(signals, { heldSince = null, max = null } = {}) {
  const rows = Array.isArray(signals) ? signals : [];
  if (!rows.length) return `none (the ledger holds this hub process's notes since ${iso(heldSince)}${int(max) != null ? `, the newest ${int(max)} pids` : ''})`;
  return rows.map((s) => `${String(s.sig || '?')} to ${s.other ? `pid ${int(s.pid)} (another process by then, not its ${s.of === 'chrome' ? 'Chrome' : 'daemon'})` : `its ${s.of === 'chrome' ? 'Chrome' : 'daemon'} (pid ${int(s.pid)})`} by ${String(s.site || '?')} at ${iso(s.at)}`).join('; ');
}

/** The OOM counter in words: `start` = the first value read during the run, `end` = the last value read when it was found gone,
 *  each { n, at } (the time the value came back) or null — both, what they say, or which one was not read. */
function oomWords(start, end) {
  const a = start && int(start.n), b = end && int(end.n);
  const at = (r) => ` (read ${iso(r.at)})`;
  if (a == null && b == null) return 'not read (no value came back during its run)';
  if (a == null) return `${b}${at(end)} when found gone; not read during its run before that`;
  if (b == null) return `${a}${at(start)} during its run; not read when found gone`;
  if (end.at === start.at) return `${a}${at(start)}: the one value read during its run (no later one came back)`;
  return b > a ? `${a}${at(start)} → ${b}${at(end)}: ROSE by ${b - a} during its run` : `${a}${at(start)} → ${b}${at(end)}: no change`;
}

/** THE LINE. `f` = { profileId, ns, pid, startedAt, seenAliveAt, foundGoneAt, seenBy, chrome, signals, ledgerSince, ledgerMax,
 *  oomStart: {n, at} | null, oomEnd: {n, at} | null }. */
function goneRecordLine(f = {}) {
  const seen = Number(f.seenAliveAt) > 0 ? `${iso(f.seenAliveAt)} (${Math.max(0, Math.round((Number(f.foundGoneAt) - Number(f.seenAliveAt)) / 1000))} s before it was found gone)` : 'never by a tick';
  return `[browser] gone record ${String(f.profileId || '?')}${f.ns ? ` (${String(f.ns)})` : ''}: its daemon pid ${int(f.pid)} · started ${iso(f.startedAt)}`
    + ` · last seen alive ${seen} · found gone ${iso(f.foundGoneAt)} by ${String(f.seenBy || 'the tick')}`
    + ` · its Chrome: ${chromeWords(f.chrome)} · the hub's own signals: ${signalWords(f.signals, { heldSince: f.ledgerSince, max: f.ledgerMax })} · the hub unit's OOM kills: ${oomWords(f.oomStart, f.oomEnd)}`;
}

/** The hub unit's cgroup memory.events path from /proc/self/cgroup's text (cgroup v2: the `0::<path>` line) — null when none. */
function memoryEventsPathFrom(cgroupText, root = '/sys/fs/cgroup') {
  const line = String(cgroupText || '').split('\n').find((l) => l.startsWith('0::'));
  if (!line) return null;
  const p = line.slice(3).trim();
  if (!p.startsWith('/')) return null;
  return `${root}${p === '/' ? '' : p}/memory.events`;
}

/** `oom_kill N` out of memory.events' text — null when absent. */
function oomKillsFrom(eventsText) {
  const m = /^oom_kill (\d+)$/m.exec(String(eventsText || ''));
  return m ? Number(m[1]) : null;
}

module.exports = { goneRecordLine, chromeWords, signalWords, oomWords, memoryEventsPathFrom, oomKillsFrom };
