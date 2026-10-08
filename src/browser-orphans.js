'use strict';
/**
 * AN AGENT-BROWSER DAEMON NOBODY HOLDS — THE ONE VERDICT (lane daemon-orphan-end, 2026-10-08). PURE: imports nothing.
 *
 * THE FACT (a fleet pod, 2026-10-07): 13 `agent-browser` daemons + 7 `Xvfb -auth …/agent-browser-xauth-*` with NO
 * Chrome child, up to 2.6 days old, each from a conversation that had ended or a temporary browser recorded "stopped
 * (idle)". The keeper ended a daemon only on Stop / Forget / the idle ceiling of a LEASED browser, so a daemon whose
 * browser and conversation were both gone was nobody's.
 *
 * THE RULE: a daemon THE KEEPER STARTED (its record names the pid + starttime, or its env names one of the keeper's
 * launch configs — the `--vibespace-keeper=<mark>` lineage) is ENDED, by identity, when it has had no Chrome child for
 * GRACE_MS, no lease names it, no verb / viewer came within GRACE_MS, and its conversation is gone (archived, killed)
 * or its record says stopped-idle for GRACE_MS. A stopped-idle daemon of a RUNNING conversation is kept for the next
 * verb (today's restart path) unless it has been idle past IDLE_CAP_MS — then it is ended and the next verb restarts it.
 * An Xvfb goes WITH its daemon (its child, or the one whose -auth file the daemon's env names), never alone. A daemon
 * the keeper did not start is REPORTED, never ended (lane H: ownership is a mark, never a directory).
 */
const GRACE_MS = 10 * 60 * 1000;
const IDLE_CAP_MS = 6 * 60 * 60 * 1000;
const SCAN_MS = 60 * 1000;

const base = (p) => String(p || '').split('/').pop();
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** The keeper's lineage of a daemon, read from its env: `AGENT_BROWSER_CONFIG` = a keeper launch config
 *  (`<configDir>/machine-ephemeral-<mark>.json` — configDirs: the keeper's dir and its realpath → the conversation key, `machine-<mark>.json` → the profile id).
 *  → `{kind: 'ephemeral'|'profile', mark}` | null (unmarked: not ours to end). */
function daemonMark(env, configDirs) {
  const cfg = env && typeof env.AGENT_BROWSER_CONFIG === 'string' ? env.AGENT_BROWSER_CONFIG : '';
  const dirs = (Array.isArray(configDirs) ? configDirs : [configDirs]).map((d) => String(d || '').replace(/\/+$/, '')).filter(Boolean);
  if (!cfg || !dirs.includes(cfg.slice(0, cfg.lastIndexOf('/')))) return null;
  const m = /^machine-(ephemeral-)?([a-z0-9][a-z0-9.-]{0,80})\.json$/i.exec(base(cfg));
  return m ? { kind: m[1] ? 'ephemeral' : 'profile', mark: m[2] } : null;
}

/** One /proc walk's rows (`{pid, ppid, starttime, startedAt, argv, env?}`) → the daemons with their Chrome children
 *  and their Xvfb. A daemon = an `agent-browser*` argv[0] started with AGENT_BROWSER_DAEMON=1 (a client verb is not one). */
function daemonsFromRows(rows) {
  const all = (Array.isArray(rows) ? rows : []).filter((r) => r && Number.isInteger(r.pid));
  const byPid = new Map(all.map((r) => [r.pid, r]));
  const kids = (pid) => all.filter((r) => r.ppid === pid);
  const isXvfb = (r) => /^Xvfb$/.test(base((r.argv || [])[0]));
  const authOf = (r) => { const a = r.argv || []; const i = a.indexOf('-auth'); return i >= 0 ? String(a[i + 1] || '') : ''; };
  const isChrome = (r) => !isXvfb(r) && !/agent-browser/.test(base((r.argv || [])[0])) && !(r.argv || []).some((x) => /^--type=/.test(String(x)));
  const daemons = all.filter((r) => /agent-browser/.test(base((r.argv || [])[0])) && r.env && r.env.AGENT_BROWSER_DAEMON === '1');
  return daemons.map((d) => {
    const near = [...kids(d.pid), ...kids(d.pid).flatMap((k) => kids(k.pid))];
    const xa = d.env && d.env.XAUTHORITY ? String(d.env.XAUTHORITY) : '';
    const xvfb = all.filter((r) => isXvfb(r) && (near.includes(r) || (xa && authOf(r) === xa)));
    return {
      pid: d.pid, ppid: d.ppid, cdp: !!(d.env && d.env.AGENT_BROWSER_CDP), starttime: d.starttime == null ? null : d.starttime, startedAt: num(d.startedAt), env: d.env || {},
      chrome: near.filter(isChrome).map((r) => ({ pid: r.pid, starttime: r.starttime })),
      xvfb: [...new Set(xvfb)].map((r) => ({ pid: r.pid, starttime: r.starttime, auth: authOf(r) || null })),
      parentAlive: byPid.has(d.ppid),
    };
  });
}

/**
 * THE VERDICT for one daemon → `{act: 'end'|'keep'|'report', why}`.
 *   daemon            {pid, starttime, owned, stoppedIdleAt|null, noBrowserSince}
 *   browserAlive      a Chrome child is alive now
 *   leases            how many leases / holders name its browser
 *   conversationAlive 'running' | 'gone' | null (a named profile's daemon has no conversation)
 */
function daemonVerdict({ daemon, browserAlive = false, leases = 0, conversationAlive = null, lastVerbAt = 0, lastViewerAt = 0, now, graceMs = GRACE_MS, idleCapMs = IDLE_CAP_MS } = {}) {
  const d = daemon || {};
  if (!d.owned) return { act: 'report', why: d.cdp ? 'a session attached to a browser over CDP (not started by this keeper)' : 'not started by this keeper (no launch mark, no record)' };
  if (browserAlive) return { act: 'keep', why: 'its browser is alive' };
  if (num(leases) > 0) return { act: 'keep', why: 'a lease holds it' };
  if (d.starttime == null) return { act: 'keep', why: 'its identity is unproven (no starttime)' };
  const t = num(now);
  if (t - num(d.noBrowserSince) < graceMs) return { act: 'keep', why: 'within the grace since its browser went' };
  if (t - num(lastVerbAt) < graceMs) return { act: 'keep', why: 'a command came within the grace' };
  if (t - num(lastViewerAt) < graceMs) return { act: 'keep', why: 'a viewer came within the grace' };
  if (conversationAlive === 'gone') return { act: 'end', why: 'its conversation is gone' };
  const idleSince = Math.max(num(lastVerbAt), num(d.stoppedIdleAt));
  if (d.stoppedIdleAt == null) return { act: 'keep', why: 'its record is live' };
  if (t - num(d.stoppedIdleAt) < graceMs) return { act: 'keep', why: 'stopped-idle within the grace' };
  if (conversationAlive === 'running') return t - idleSince > idleCapMs ? { act: 'end', why: `idle past ${durText(idleCapMs)} (its conversation is running: the next command restarts it)` } : { act: 'keep', why: 'its conversation is running (kept for the next command)' };
  return { act: 'end', why: 'recorded stopped (idle) with no browser' };
}

function durText(ms) {
  const m = Math.max(0, Math.round(num(ms) / 60000));
  if (m < 60) return `${m} min`;
  const h = m / 60;
  return h < 48 ? `${Math.round(h * 10) / 10} h` : `${Math.round(h / 24 * 10) / 10} d`;
}
/** The profile row's words after an ending. */
function rowNote(idleMs) { return `stopped — the daemon was ended after ${durText(idleMs)} idle (restarts on the next command)`; }
/** ONE journal line per ending. */
function endedLine({ pid, why, conversation = null, idleMs = 0, result = 'ended', xvfb = [] } = {}) {
  const x = xvfb.length ? `; its Xvfb ${xvfb.map((v) => `pid ${v.pid} ${v.result}`).join(', ')}` : '';
  return `ended the browser daemon pid ${pid} (${why}; no browser for ${durText(idleMs)}${conversation ? `; conversation ${conversation}` : ''}): ${result}${x}`;
}
function reportLine({ pid, startedAt = 0, now = 0 } = {}) {
  return `the browser daemon pid ${pid} (up ${durText(num(now) - num(startedAt))}) has no browser and was not started by this keeper (no launch mark, no record) — reported, left running`;
}

module.exports = { GRACE_MS, IDLE_CAP_MS, SCAN_MS, daemonMark, daemonsFromRows, daemonVerdict, durText, rowNote, endedLine, reportLine };
