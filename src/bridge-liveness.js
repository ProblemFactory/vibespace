'use strict';
/**
 * PURE (imports nothing; CJS) — A RESTORED SESSION'S SILENCE IS JUDGED AGAINST
 * THE CLI'S OWN WITNESSES (lane-dead-bridge, 2026-09-30).
 *
 * THE INCIDENT. The server died at 12:03:17 (a relayed EMFILE in a timer). One
 * restored session — the busiest — delivered NOTHING for three hours while its
 * CLI kept calling the API (an OTel `api_request` row a minute). At 15:05:14 the
 * owner typed, "Broken pty stdin detected" re-attached the pty, and the whole
 * backlog arrived at once as if live.
 *
 * WHY (reproduced on raw dtach, 4/4): node-pty's forkpty master has no
 * FD_CLOEXEC, so every process the server spawned after an attach (rclone
 * mounts, Background Work jobs, agent browsers, the next attach clients)
 * inherited every attach's pty master. The crash path killed no attach pty
 * (the clean shutdown does), and with the masters held elsewhere the kernel
 * never hung the ptys up: the old `dtach -a` clients SURVIVED, reparented,
 * blocked writing to a pty nobody reads. dtach's master then waits in
 * pty_activity() for ANY attached client to become writable; the new
 * server's `dtach -a` connects, the master accepts it and — the pty being
 * readable in the same pass — re-enters pty_activity BEFORE reading the new
 * client's attach packet. The new client is never attached; its own
 * clear-screen preamble reads as "alive" to the 09-09 attach probe.
 *
 * THE RULES HERE:
 *   orphanAttachVerdict — a /proc row is an ORPHANED attach client of one of
 *     OUR sockets (a `dtach -a <sockets>/cw-*` whose parent is gone:
 *     reparented to init or a subreaper). Never a master (`-c`/`-n`), never a
 *     client whose parent lives (a person's own attach, the daemon's), never
 *     this server's own child.
 *   bridgeVerdict — silent ≥ N minutes AND a witness says the CLI worked after
 *     the last byte (the wrapper's buffer FILE written, or an OTel
 *     api_request) ⇒ `dead`; silent with no witness ⇒ `quiet` (an idle CLI is
 *     not a dead bridge — never healed); a spent heal budget ⇒ `budget`.
 *   catchUp* — the backlog a heal releases, counted through the late-record
 *     rule (src/record-lateness.js — its verdicts are the input here), and the
 *     card that says what happened.
 */

const DEAD_BRIDGE_DEFAULT_MIN = 3;          // the setting's default (session.deadBridgeMinutes)
const WITNESS_SLACK_MS = 20e3;              // the wrapper persists its .buf 2 s after data; OTel exports every 5 s and an api_request is logged after its last output byte
const HEAL_MAX = 3;                         // at most this many heals…
const HEAL_WINDOW_MS = 3600e3;              // …per session per hour
const CATCHUP_QUIET_MS = 15e3;              // a catch-up with no record for this long is over
const CURRENT_MS = 10e3;                    // …and so is one that delivered a record stamped this close to NOW (the backlog drained)
const CARD_MIN_GAP_MS = 60e3;               // a card only when the output was lost for at least a minute
const TICK_MIN_MS = 2e3, TICK_MAX_MS = 30e3;

/** The minutes setting → ms (0 / negative / junk = OFF → null). */
function silenceMsOf(minutes) {
  const m = minutes === undefined || minutes === null || minutes === '' ? DEAD_BRIDGE_DEFAULT_MIN : Number(minutes);
  return Number.isFinite(m) && m > 0 ? Math.round(m * 60e3) : null;
}
/** How often the watch looks: a quarter of the silence, 2 s..30 s. */
function tickMsOf(silenceMs) {
  if (!(silenceMs > 0)) return TICK_MAX_MS;
  return Math.max(TICK_MIN_MS, Math.min(TICK_MAX_MS, Math.round(silenceMs / 4)));
}

/** Is this /proc row an ORPHANED attach client of one of our sockets?
 *  {argv, ppid, parentComm, ttyNr, socketsDir, selfPid} → {orphan, socket, why}.
 *
 *  CLIENT vs MASTER — measured on the production box (2026-09-30): a session the
 *  server CREATED is attached by the `dtach -c <sock> …` process itself (it
 *  forks the master and stays as the client), so `-c` is not "the master". The
 *  one fact that tells them apart: the CLIENT has a controlling terminal (its
 *  node-pty; stat tty_nr ≠ 0, fd 1 = /dev/pts/N) and the MASTER never does
 *  (daemonized: tty_nr 0, fd 1 = /dev/null). A process with no controlling
 *  terminal is NEVER a candidate — ending a master ends the session. */
function orphanAttachVerdict({ argv, ppid, parentComm = '', ttyNr = 0, socketsDir, selfPid } = {}) {
  const a = Array.isArray(argv) ? argv : [];
  const bin = String(a[0] || '');
  if (!(bin === 'dtach' || bin.endsWith('/dtach'))) return { orphan: false, socket: null, why: 'not-dtach' };
  if (!['-a', '-c', '-A'].includes(a[1])) return { orphan: false, socket: null, why: 'not-an-attach' };   // `-n` creates detached: only a master
  if (!(Number(ttyNr) > 0)) return { orphan: false, socket: null, why: 'a-master' };                     // no controlling terminal ⇒ the session itself
  const sock = String(a[2] || '');
  const dir = String(socketsDir || '').replace(/\/+$/, '');
  if (!dir || !sock.startsWith(dir + '/')) return { orphan: false, socket: null, why: 'not-our-socket' };
  const base = sock.slice(dir.length + 1);
  if (!/^cw-[^/]+$/.test(base)) return { orphan: false, socket: null, why: 'not-our-socket' };
  const pp = Number(ppid);
  if (Number.isFinite(pp) && pp === Number(selfPid)) return { orphan: false, socket: sock, why: 'ours' };
  if (pp === 1) return { orphan: true, socket: sock, why: 'reparented-to-init' };
  if (String(parentComm) === 'systemd') return { orphan: true, socket: sock, why: 'reparented-to-subreaper' };
  return { orphan: false, socket: sock, why: 'parent-alive' };
}

/** The heals of the last hour (a pruned copy) and whether one more fits. */
function healBudget(heals, now) {
  const kept = (Array.isArray(heals) ? heals : []).filter((t) => Number(now) - Number(t) < HEAL_WINDOW_MS);
  return { heals: kept, allowed: kept.length < HEAL_MAX };
}

/** THE VERDICT. {now, silenceMs, lastByteAt, attachedAt, bufMtimeMs, lastApiAt, heals}
 *  → {verdict: 'alive'|'quiet'|'dead'|'budget'|'off', witness, silentMs, since, seenAt}. */
function bridgeVerdict({ now, silenceMs, lastByteAt = 0, attachedAt = 0, bufMtimeMs = null, lastApiAt = null, heals = [] } = {}) {
  if (!(silenceMs > 0)) return { verdict: 'off', witness: null, silentMs: null, since: null, seenAt: null };
  const since = Math.max(Number(lastByteAt) || 0, Number(attachedAt) || 0);
  const silentMs = Number(now) - since;
  if (!since || silentMs < silenceMs) return { verdict: 'alive', witness: null, silentMs, since, seenAt: null };
  const after = since + WITNESS_SLACK_MS;
  let witness = null, seenAt = null;
  if (Number(bufMtimeMs) > after) { witness = 'buffer-file'; seenAt = Number(bufMtimeMs); }
  if (Number(lastApiAt) > after && (!seenAt || Number(lastApiAt) > seenAt)) { witness = 'api-request'; seenAt = Number(lastApiAt); }
  if (!witness) return { verdict: 'quiet', witness: null, silentMs, since, seenAt: null };
  if (!healBudget(heals, now).allowed) return { verdict: 'budget', witness, silentMs, since, seenAt };
  return { verdict: 'dead', witness, silentMs, since, seenAt };
}

/** A duration in words for the journal: "45s", "2m32s", "3h02m". */
function spanWords(ms) {
  const s = Math.max(0, Math.round(Number(ms) / 1000) || 0);
  if (s < 90) return `${s}s`;
  if (s < 600) return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`;
  const m = Math.round(s / 60);
  return m < 90 ? `${m}m` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`;
}
/** The journal's words for a verdict. */
function verdictWords(v, fmtAgo = spanWords) {
  const w = v.witness === 'api-request' ? 'the CLI made an API request' : 'the wrapper wrote its buffer file';
  return `no output for ${fmtAgo(v.silentMs)} while ${w} ${fmtAgo(Math.max(0, v.seenAt - v.since))} after the last byte`;
}

// ── the catch-up a heal releases ─────────────────────────────────────────────
/** Start counting. `silentSince` = the last byte before the silence. */
function catchUpStart({ restoredAt, silentSince = null, why = '' } = {}) {
  return { restoredAt: Number(restoredAt), silentSince: Number(silentSince) || null, why, n: 0, late: 0, firstLateStamp: null, lastAt: Number(restoredAt), liveSeen: false };
}
/** One record of the burst: `judged` = record-lateness `judge(...)`'s verdict for it, `stamp` = its own stamp or null. */
function catchUpNote(st, judged, stamp, now) {
  if (!st) return st;
  st.n++;
  st.lastAt = Number(now);
  if (judged && judged.verdict === 'late') {
    st.late++;
    if (Number.isFinite(stamp) && (st.firstLateStamp == null || stamp < st.firstLateStamp)) st.firstLateStamp = stamp;
  } else if (judged && judged.verdict === 'live' && judged.by === 'own-stamp' && Number(judged.lateMs) <= CURRENT_MS) {
    st.liveSeen = true;   // the backlog has drained: a record stamped NOW arrived behind it (a < 2 min old one is still backlog — counted, just not late)
  }
  return st;
}
/** Is the catch-up over? */
function catchUpSettled(st, now, { quietMs = CATCHUP_QUIET_MS } = {}) {
  if (!st) return true;
  return st.liveSeen || Number(now) - st.lastAt >= quietMs;
}
/** When the output stopped reaching us: the oldest record we missed, else the last byte. */
function catchUpLostAt(st) {
  if (!st) return null;
  const c = [st.firstLateStamp, st.silentSince].filter((x) => Number.isFinite(x) && x > 0);
  return c.length ? Math.min(...c) : st.restoredAt;
}
/** HH:MM in the server's local time (the default formatter). */
function hhmm(ms) { const d = new Date(ms); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
/** THE CARD — or null when there is nothing to say (no record came, or the gap was under a minute). */
function catchUpCard(st, { fmt = hhmm } = {}) {
  if (!st || !(st.n > 0)) return null;
  const lostAt = catchUpLostAt(st);
  if (!(st.restoredAt - lostAt >= CARD_MIN_GAP_MS)) return null;
  const recs = st.n === 1 ? '1 record' : `${st.n} records`;
  return `The connection to this conversation's output was lost at ${fmt(lostAt)} and restored at ${fmt(st.restoredAt)} — ${recs} caught up (they are shown, not re-run).`;
}

module.exports = {
  DEAD_BRIDGE_DEFAULT_MIN, WITNESS_SLACK_MS, HEAL_MAX, HEAL_WINDOW_MS, CATCHUP_QUIET_MS, CURRENT_MS, CARD_MIN_GAP_MS, TICK_MIN_MS, TICK_MAX_MS,
  silenceMsOf, tickMsOf, orphanAttachVerdict, healBudget, bridgeVerdict, verdictWords, spanWords,
  catchUpStart, catchUpNote, catchUpSettled, catchUpLostAt, catchUpCard, hhmm,
};
