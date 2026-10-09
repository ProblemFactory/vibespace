'use strict';
/**
 * proc-identity — A PID IS NEVER AN IDENTITY (B-1cc6, lane pid-identity-census).
 *
 * This box's pid_max is 4 194 304 and its pids wrapped ≥ 3 times between the
 * 09-17 boot and 2026-10 (about once a day under the gate's churn); a fleet
 * pod's pid_max is smaller. A pid recorded hours ago can name a STRANGER by the
 * time it is signalled: `process.kill(pid)` on a recycled pid kills someone
 * else's process, and `kill -0` reads "alive" for a dead one (a zombie answers
 * kill -0 / tail --pid too). So every signal to a RECORDED pid goes through
 * here and proves the record first:
 *
 *   identity = { pid, starttime, bootId }   starttime = /proc/<pid>/stat field 22
 *                                           (clock ticks since boot, counted from
 *                                           the LAST ')' — comm may hold ") ");
 *                                           bootId = /proc/sys/kernel/random/boot_id
 *   no /proc (macOS)  → { pid, starttime: null, lstart, bootId: '' }   (`ps -o lstart=`)
 *
 * Verdicts (judge): same | zombie | pid-recycled | gone | unknown-identity | unknown.
 *   · a record WITHOUT a starttime (an older build wrote it) is `unknown-identity`:
 *     never signalled, REPORTED once — "a process this build cannot prove is ours";
 *   · a verdict that cannot be reached (no /proc and no ps) is a SAID `unknown`,
 *     never "alive" (the S9 round-11 lesson).
 * A pid this process spawned and still holds the ChildProcess handle for needs
 * none of this — the handle IS the identity (`child.kill`, or `child.pid` read
 * from the handle in the same tick). A pid read back from disk never is.
 *
 * SHARED: node builtins only (the agentd bundle carries it to paired machines).
 */
const fs = require('fs');
const { spawnSync } = require('child_process');

const PROC_ROOT = '/proc';
const UNPROVABLE = 'a process this build cannot prove is ours — restart it to re-record';

const rootOf = (opts) => (opts && opts.procRoot) || PROC_ROOT;
const pidOk = (pid) => Number.isInteger(Number(pid)) && Number(pid) > 1;

/** The fields after comm (rest[0] = state, field 3; rest[19] = starttime, field 22), or null. */
function statRest(pid, opts) {
  if (!pidOk(pid)) return null;
  try {
    const s = fs.readFileSync(`${rootOf(opts)}/${Number(pid)}/stat`, 'utf8');
    return s.slice(s.lastIndexOf(')') + 2).split(' ');
  } catch { return null; }
}
/** Does this machine read process identities from a procfs at all? */
function hasProc(opts) {
  const root = rootOf(opts);
  return fs.existsSync(`${root}/self/stat`) || fs.existsSync(`${root}/sys/kernel/random/boot_id`);
}
let _bootId = null;
function bootIdOf(opts) {
  if (rootOf(opts) === PROC_ROOT && _bootId != null) return _bootId;
  let v = '';
  try { v = fs.readFileSync(`${rootOf(opts)}/sys/kernel/random/boot_id`, 'utf8').trim(); } catch { }
  if (rootOf(opts) === PROC_ROOT) _bootId = v;
  return v;
}
/** /proc/<pid>/stat field 22 as a Number, or null (gone / no /proc / unreadable). */
function starttimeOf(pid, opts) {
  const r = statRest(pid, opts);
  const v = r ? Number(r[19]) : NaN;
  return Number.isFinite(v) && r[19] !== '' ? v : null;
}
/** /proc/<pid>/stat field 3 ('R', 'S', 'Z' …) or null. */
function stateOf(pid, opts) { const r = statRest(pid, opts); return r ? r[0] : null; }
/** The no-/proc rung: `ps -o stat= -o lstart= -p <pid>` → { ran, state, lstart } (lstart null = no such pid). */
function psOf(pid, opts) {
  if (opts && typeof opts.ps === 'function') return opts.ps(Number(pid));
  const r = spawnSync('ps', ['-o', 'stat=', '-o', 'lstart=', '-p', String(Number(pid))], { encoding: 'utf8', timeout: 3000 });
  if (r.error) return { ran: false, state: null, lstart: null };
  const out = String(r.stdout || '').trim();
  if (!out) return { ran: true, state: null, lstart: null };
  const sp = out.indexOf(' ');
  return { ran: true, state: out.slice(0, sp), lstart: out.slice(sp + 1).trim().replace(/\s+/g, ' ') };
}

/** {pid, starttime, bootId} of a LIVE pid now (record it at spawn), or null. */
function identityOf(pid, opts) {
  if (!pidOk(pid)) return null;
  if (hasProc(opts)) {
    const starttime = starttimeOf(pid, opts);
    return starttime == null ? null : { pid: Number(pid), starttime, bootId: bootIdOf(opts) };
  }
  const p = psOf(pid, opts);
  return p.lstart ? { pid: Number(pid), starttime: null, lstart: p.lstart, bootId: '' } : null;
}

/** The verdict on a recorded identity: { verdict, cur } — see the header. */
function judge(identity, opts) {
  const rec = identity || {};
  if (!pidOk(rec.pid)) return { verdict: 'unknown-identity', cur: null };
  if (hasProc(opts)) {
    if (rec.starttime == null || rec.starttime === '' || !Number.isFinite(Number(rec.starttime))) return { verdict: 'unknown-identity', cur: null };
    const boot = bootIdOf(opts);
    if (rec.bootId && boot && rec.bootId !== boot) return { verdict: 'gone', cur: null }; // the box rebooted: that process is gone
    const r = statRest(rec.pid, opts);
    const cur = r ? Number(r[19]) : null;
    if (cur == null || !Number.isFinite(cur)) return { verdict: 'gone', cur: null };
    if (cur !== Number(rec.starttime)) return { verdict: 'pid-recycled', cur };
    return { verdict: r[0] === 'Z' ? 'zombie' : 'same', cur };
  }
  if (!rec.lstart) return { verdict: rec.starttime == null ? 'unknown-identity' : 'unknown', cur: null };
  const p = psOf(rec.pid, opts);
  if (!p.ran) return { verdict: 'unknown', cur: null };
  if (!p.lstart) return { verdict: 'gone', cur: null };
  if (p.lstart !== String(rec.lstart).replace(/\s+/g, ' ')) return { verdict: 'pid-recycled', cur: p.lstart };
  return { verdict: /^Z/.test(p.state || '') ? 'zombie' : 'same', cur: p.lstart };
}

/** Is `pid` still the process `identity` recorded (a zombie still is — it is just not alive)? */
function sameProcess(pid, identity, opts) {
  const v = judge({ ...(identity || {}), pid }, opts).verdict;
  return v === 'same' || v === 'zombie';
}
/** true = that very process runs · false = gone / recycled / a zombie · null = cannot be proven either way. */
function aliveIdentity(identity, opts) {
  const v = judge(identity, opts).verdict;
  if (v === 'same') return true;
  return v === 'unknown' || v === 'unknown-identity' ? null : false;
}

const _reported = new Set();
/** ONE line per (why, pid, start) — the journal hears a refusal once, not every tick. */
function reportOnce(why, identity, opts, cur) {
  const rec = identity || {};
  const key = `${why}:${rec.pid}:${rec.starttime != null ? rec.starttime : rec.lstart || ''}`;
  if (_reported.has(key)) return null;
  _reported.add(key);
  const what = (opts && opts.what) || 'a recorded process';
  const line = why === 'pid-recycled'
    ? `[proc-identity] pid ${rec.pid} (${what}) now names ANOTHER process (start ${cur} ≠ recorded ${rec.starttime != null ? rec.starttime : rec.lstart}) — pid-recycled, not signalled`
    : `[proc-identity] pid ${rec.pid} (${what}): ${UNPROVABLE} — not signalled`;
  const say = (opts && opts.say) || ((l) => console.warn(l));
  try { say(line); } catch { }
  return line;
}

/**
 * Signal the RECORDED process — only when judge() says it is still that very
 * process. → { ok: true, target } | { ok: false, why: 'pid-recycled' | 'gone' |
 * 'unknown-identity' | 'unknown' | 'not-ours' }. opts.group: the process group
 * first (-pid), its leader alone when it leads none. opts.kill: injectable.
 */
function signalIdentity(identity, signal, opts = {}) {
  const { verdict, cur } = judge(identity, opts);
  if (verdict !== 'same') {
    const why = verdict === 'zombie' ? 'gone' : verdict;
    if (why === 'pid-recycled' || why === 'unknown-identity' || why === 'unknown') reportOnce(why, identity, opts, cur);
    return { ok: false, why };
  }
  const kill = opts.kill || ((p, s) => process.kill(p, s));
  const pid = Number(identity.pid);
  const one = (target) => { try { kill(target, signal); return { ok: true, target }; } catch (e) { return { ok: false, why: e && e.code === 'EPERM' ? 'not-ours' : 'gone' }; } };
  if (opts.group) { const g = one(-pid); if (g.ok) return g; }
  return one(pid);
}

// ── SHIPPED TWIN BEGIN — data/bin/vibespace-remote-keeper carries these lines byte-for-byte: it ships to a host as ONE
// file and cannot require src/ (the vibespace-usage-scan precedent). test-pid-identity pins the copy to this source. ──
/** agentd's spawn-proof token (moved verbatim from src/agentd/agentd.js pidStartTime): 'l' + field 22 on a
 *  procfs, else 'p' + the `ps -o lstart=` string, else ''. Kept because session metas persist it as `startTime`. */
function startToken(pid) {
  try {
    const st = fs.readFileSync('/proc/' + pid + '/stat', 'utf-8');
    const rest = st.slice(st.lastIndexOf(')') + 2).split(' ');
    if (rest[19]) return 'l' + rest[19];
  } catch { }
  try {
    const r = spawnSync('ps', ['-p', String(pid), '-o', 'lstart='], { encoding: 'utf-8' });
    const s = String(r.stdout || '').trim();
    if (s) return 'p' + s;
  } catch { }
  return '';
}
/** This box's boot id ('' with no procfs) — recorded beside a token: a reboot ends every process a record names. */
function bootToken() { try { return fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf-8').trim(); } catch { return ''; } }
/** A RECORDED birth (startToken's form) against the pid now → same | zombie | pid-recycled | gone | unknown-identity
 *  (no birth recorded) | unknown (the recorded rung is not readable here). Only `same` may be signalled. */
function tokenVerdict(pid, token, bootId) {
  if (!(Number(pid) > 1) || !token) return 'unknown-identity';
  if (bootId) { const b = bootToken(); if (b && b !== bootId) return 'gone'; }
  const cur = startToken(pid);
  if (!cur) return 'gone';
  if (cur[0] !== String(token)[0]) return 'unknown';
  if (cur !== String(token)) return 'pid-recycled';
  try { const st = fs.readFileSync('/proc/' + pid + '/stat', 'utf-8'); if (st[st.lastIndexOf(')') + 2] === 'Z') return 'zombie'; } catch { }
  return 'same';
}
// ── SHIPPED TWIN END ──

/** A record's start token (+ bootId) → the identity judge() / signalIdentity() read. No token = a birth-less record
 *  (`unknown-identity`: never signalled by proof — the caller's legacy rung decides, said once). */
function identityFromToken(pid, token, bootId) {
  const t = String(token || '');
  if (t[0] === 'l' && /^\d+$/.test(t.slice(1))) return { pid: Number(pid), starttime: Number(t.slice(1)), bootId: bootId || '' };
  if (t[0] === 'p' && t.length > 1) return { pid: Number(pid), starttime: null, lstart: t.slice(1), bootId: '' };
  return { pid: Number(pid), starttime: null, bootId: '' };
}

/** THE SH TWIN (B-5ee1): `vs_same_proc <pid> <token> [bootId]` returns 0 only while <pid> is still the process whose
 *  start token (startToken's form) was recorded; else 1 with $VS_SAME_WHY = pid-recycled | gone | zombie |
 *  unknown-identity | unknown. Linux: /proc/<pid>/stat field 22 counted from the LAST ') ' (comm may hold one) +
 *  /proc/sys/kernel/random/boot_id; else `ps -o lstart= -p`. Embedded verbatim by the writer sweep and the ssh kill,
 *  exactly as cliIdentityShellFns() is; test-pid-identity drives it against a REAL scratch sleep. */
function procIdentityShellFns() {
  return `vs_same_proc() {
  VS_SAME_WHY=unknown-identity
  case "$1" in ''|*[!0-9]*) return 1;; esac
  [ -n "$2" ] || return 1
  if [ -n "$3" ] && [ -r /proc/sys/kernel/random/boot_id ] && [ "$(cat /proc/sys/kernel/random/boot_id)" != "$3" ]; then VS_SAME_WHY=gone; return 1; fi
  vs_sp_cur=; vs_sp_state=
  if [ -r "/proc/$1/stat" ]; then
    vs_sp_st=$(cat "/proc/$1/stat" 2>/dev/null)
    vs_sp_rest=\${vs_sp_st##*) }
    vs_sp_t=$(printf '%s\\n' "$vs_sp_rest" | cut -d' ' -f20)
    [ -n "$vs_sp_st" ] && [ -n "$vs_sp_t" ] && { vs_sp_cur=l$vs_sp_t; vs_sp_state=$(printf '%s\\n' "$vs_sp_rest" | cut -d' ' -f1); }
  fi
  if [ -z "$vs_sp_cur" ]; then
    vs_sp_ps=$(ps -p "$1" -o lstart= 2>/dev/null | sed 's/^ *//;s/ *$//')
    [ -n "$vs_sp_ps" ] && vs_sp_cur=p$vs_sp_ps
  fi
  [ -n "$vs_sp_cur" ] || { VS_SAME_WHY=gone; return 1; }
  case "$vs_sp_cur" in l*) case "$2" in l*) ;; *) VS_SAME_WHY=unknown; return 1;; esac;; *) case "$2" in p*) ;; *) VS_SAME_WHY=unknown; return 1;; esac;; esac
  [ "$vs_sp_cur" = "$2" ] || { VS_SAME_WHY=pid-recycled; return 1; }
  [ "$vs_sp_state" = Z ] && { VS_SAME_WHY=zombie; return 1; }
  VS_SAME_WHY=same; return 0
}`;
}

/** The words a WITHHELD signal reaches the user with (the no-silent-failures law): the kill answer / exit record / notice
 *  where the stop was asked. i18n = {key, params} for serverNotice; `text` = the English (journal, older clients). */
const i18nKey = (k) => k; // the extraction marker scripts/i18n-extract.mjs reads (zh/ja: src/lib/i18n-zh.js / i18n-ja.js)
const WITHHELD_KEY = i18nKey("{name}'s process was not stopped: pid {pid} now belongs to another process (recorded {when}) — nothing of VibeSpace's is running");
function withheldWords(name, pid, when) {
  const params = { name: String(name || 'VibeSpace'), pid: String(pid), when: String(when || 'earlier') };
  return { text: WITHHELD_KEY.replace(/\{(\w+)\}/g, (m, k) => params[k]), i18n: { key: WITHHELD_KEY, params } };
}
/** The legacy rung's ONE line per record (B-5ee1 rung 3, retire 2026-12-01): a record an older build wrote carries no birth. */
const LEGACY_LINE = 'legacy pid record, cmdline-only — re-recorded at its next start';
const _legacySaid = new Set();
function legacyOnce(door, pid, say) {
  const key = `${door}:${pid}`;
  if (_legacySaid.has(key)) return null;
  _legacySaid.add(key);
  const line = `[proc-identity] ${door}: pid ${pid} — ${LEGACY_LINE}`;
  try { (say || ((l) => console.warn(l)))(line); } catch { }
  return line;
}

module.exports = {
  PROC_ROOT, UNPROVABLE, WITHHELD_KEY, LEGACY_LINE,
  hasProc, bootIdOf, starttimeOf, stateOf, identityOf, judge, sameProcess, aliveIdentity, signalIdentity, reportOnce, startToken,
  bootToken, tokenVerdict, identityFromToken, procIdentityShellFns, withheldWords, legacyOnce,
  _resetReported: () => { _reported.clear(); _legacySaid.clear(); },
};
