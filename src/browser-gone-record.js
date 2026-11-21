'use strict';
// B-346d's RECORDER (the coordinator's r1228): THE ONE JOURNAL RECORD AT «DAEMON GONE» — what the next occurrence of a daemon that
// ends early must leave, so it is placed from the record and never by sampling a hub again. PURE: the facts in, one line out.
// NAMES AND NUMBERS ONLY: a profile id, a namespace, pids, times, the keeper's own fixed words and the hub's own site names — never
// a page address, a site name or a title.
//   (a) the last time a tick saw it alive, beside the time it was found gone — a bound on both sides;
//   (b) its Chrome's state when the daemon was found gone, said in every case (alive — the hub ends it now / already gone / none);
//   (c) the hub's own signals to that daemon or its Chrome during its run (src/server/signal-ledger.js): none, or which site;
//   (d) the hub unit's out-of-memory kill counter (its cgroup's memory.events `oom_kill`) at its first tick alive and when it
//       was found gone — a rise says the box's OOM killer ended a process of the hub's unit during its run.
// (The daemon's own last lines are not here: whether the driver hands its error stream to the daemon is a measure on the real
// driver, owed to a box run — B-346d (e).)

const iso = (ms) => (Number(ms) > 0 ? new Date(Number(ms)).toISOString() : 'not recorded');
const int = (v) => (Number.isInteger(v) && v >= 0 ? v : null);

/** The Chrome's state in words — every case said. */
function chromeWords(c) {
  if (c && c.state === 'alive') return `alive (pid ${int(c.pid)}) when its daemon was found gone — the hub ends it now`;
  if (c && c.state === 'gone') return `already gone (pid ${int(c.pid)})`;
  if (c && c.state === 'other') return `pid ${int(c.pid)} is another process now — left alone`;
  return 'none recorded for this run';
}

/** The hub's own signals in words: none, or each — what was signalled, by which site, when. */
function signalWords(signals) {
  const rows = Array.isArray(signals) ? signals : [];
  if (!rows.length) return 'none';
  return rows.map((s) => `${String(s.sig || '?')} to its ${s.of === 'chrome' ? 'Chrome' : 'daemon'} (pid ${int(s.pid)}) by ${String(s.site || '?')} at ${iso(s.at)}`).join('; ');
}

/** The OOM counter in words: both readings and what they say, or which one is missing. */
function oomWords(start, end) {
  const a = int(start), b = int(end);
  if (a === null && b === null) return 'not read (the counter is unreadable here)';
  if (a === null) return `${b} when found gone (no reading at its first tick alive)`;
  if (b === null) return `${a} at its first tick alive, unreadable when found gone`;
  return b > a ? `${a} → ${b}: ROSE by ${b - a} during its run` : `${a} → ${b}: no change`;
}

/** THE LINE. `f` = { profileId, ns, pid, startedAt, seenAliveAt, foundGoneAt, seenBy, chrome, signals, oomStart, oomEnd }. */
function goneRecordLine(f = {}) {
  const seen = Number(f.seenAliveAt) > 0 ? `${iso(f.seenAliveAt)} (${Math.max(0, Math.round((Number(f.foundGoneAt) - Number(f.seenAliveAt)) / 1000))} s before it was found gone)` : 'never by a tick';
  return `[browser] gone record ${String(f.profileId || '?')}${f.ns ? ` (${String(f.ns)})` : ''}: its daemon pid ${int(f.pid)} · started ${iso(f.startedAt)}`
    + ` · last seen alive ${seen} · found gone ${iso(f.foundGoneAt)} by ${String(f.seenBy || 'the tick')}`
    + ` · its Chrome: ${chromeWords(f.chrome)} · the hub's own signals: ${signalWords(f.signals)} · the hub unit's OOM kills: ${oomWords(f.oomStart, f.oomEnd)}`;
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
