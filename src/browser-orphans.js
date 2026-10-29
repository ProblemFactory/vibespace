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
 *
 * THE OTHER HALF (lane browser-daemon-survives-update, B-1574 — userW, profile jarvis-work, four freezes 10-05..10-18 after
 * server auto-updates): a daemon whose BROWSER ENDED is ended too, whoever holds it. MEASURED on agent-browser 0.38.2 +
 * Chrome 154 (the lane's probe): its Chrome SIGKILLed ⇒ the daemon reaps it and lives on idle (1–3 CPU ticks a minute) with
 * `session info` answering active:true for as long as anyone asks; it has no watch of its own — only its NEXT command
 * relaunches Chrome (in place, at about:blank, 174–222 ms); the whole Chrome SIGSTOPped ⇒ `session info` still answers.
 * So the check lives HERE, in the keeper's census: a daemon of ours that no LIVE record keeps (a live one is the tick's —
 * healed in place while a lease holds it, or closed by name) whose Chrome has been gone — or whose DevTools endpoint has
 * not answered — for BROWSER_ENDED_MS is ENDED by identity, with its Xvfb and its Chrome, and the journal and its row say
 * so; its holders' next command starts a fresh one. And at a SERVER RESTART (the update path IS one: scripts/update.sh →
 * systemd) each daemon of ours is RE-OWNED when its page answers and ended when it does not (reownVerdict) — never left.
 */
const GRACE_MS = 10 * 60 * 1000;
const IDLE_CAP_MS = 6 * 60 * 60 * 1000;
const SCAN_MS = 60 * 1000;
/** lane browser-daemon-survives-update: a daemon nobody keeps whose browser ENDED (gone, or its endpoint silent) this long
 *  is ended. The tick (5 s) heals a KEPT daemon's Chrome in place within one tick, and a relaunch takes ~0.2 s (measured);
 *  60 s is twelve ticks — a daemon still without an answering browser after that is waiting for nobody the keeper knows.
 *  With the census every SCAN_MS it is ended within 2 min of its browser's end. */
const BROWSER_ENDED_MS = 60 * 1000;

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
  // lane ledger-dedup-law r12: the table indexed ONCE — its children by parent, its Xvfbs (each daemon filtered the WHOLE
  // table for its children, its grandchildren and its Xvfb: O(daemons × processes) a call, and the keeper's census called
  // it once more per daemon it had seen — ~100 ms of one loop turn over 18 daemons × 1 169 processes, 272 ms on a busier
  // box: test-boot-loop-hold's law). The same answer, in the table's order.
  const kidsOf = new Map();
  for (const r of all) { let k = kidsOf.get(r.ppid); if (!k) kidsOf.set(r.ppid, (k = [])); k.push(r); }
  const kids = (pid) => kidsOf.get(pid) || [];
  const isXvfb = (r) => /^Xvfb$/.test(base((r.argv || [])[0]));
  const xvfbs = all.filter(isXvfb);
  const authOf = (r) => { const a = r.argv || []; const i = a.indexOf('-auth'); return i >= 0 ? String(a[i + 1] || '') : ''; };
  const isChrome = (r) => !isXvfb(r) && !/agent-browser/.test(base((r.argv || [])[0])) && !(r.argv || []).some((x) => /^--type=/.test(String(x)));
  // lane browser-daemon-survives-update: the Chrome's own endpoint (its DevTools port, its directory) off its argv
  const argOf = (r, k) => { const a = (r.argv || []).find((x) => String(x).startsWith(k + '=')); return a ? String(a).slice(k.length + 1) : null; };
  const daemons = all.filter((r) => /agent-browser/.test(base((r.argv || [])[0])) && r.env && r.env.AGENT_BROWSER_DAEMON === '1');
  return daemons.map((d) => {
    const near = [...kids(d.pid), ...kids(d.pid).flatMap((k) => kids(k.pid))];
    const xa = d.env && d.env.XAUTHORITY ? String(d.env.XAUTHORITY) : '';
    const xvfb = xvfbs.filter((r) => near.includes(r) || (xa && authOf(r) === xa));
    return {
      pid: d.pid, ppid: d.ppid, cdp: !!(d.env && d.env.AGENT_BROWSER_CDP), starttime: d.starttime == null ? null : d.starttime, startedAt: num(d.startedAt), env: d.env || {},
      chrome: near.filter(isChrome).map((r) => ({ pid: r.pid, starttime: r.starttime, port: Number(argOf(r, '--remote-debugging-port')) || null, dir: argOf(r, '--user-data-dir') })),
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
function daemonVerdict({ daemon, browserAlive = false, leases = 0, conversationAlive = null, lastVerbAt = 0, lastViewerAt = 0, now, graceMs = GRACE_MS, idleCapMs = IDLE_CAP_MS, silentSince = null, endedMs = BROWSER_ENDED_MS } = {}) {
  const d = daemon || {};
  if (!d.owned) return { act: 'report', why: d.cdp ? 'a session attached to a browser over CDP (not started by this keeper)' : 'not started by this keeper (no launch mark, no record)' };
  const t = num(now);
  // lane browser-daemon-survives-update — THE OTHER HALF: no LIVE record keeps it (`stoppedIdleAt` set: a stopped record,
  // or none) and its browser ENDED ≥ endedMs ago ⇒ ended, whatever leases it and however recent its last command
  if (d.stoppedIdleAt != null && d.starttime != null && !d.cdp) {
    if (!browserAlive && t - num(d.noBrowserSince) >= endedMs) return { act: 'end', why: `its browser ended ${durText(t - num(d.noBrowserSince))} ago and no live record keeps it`, ended: true };
    if (browserAlive && silentSince != null && t - num(silentSince) >= endedMs) return { act: 'end', why: `its browser has not answered CDP for ${durText(t - num(silentSince))} and no live record keeps it`, ended: true };
  }
  if (browserAlive) return { act: 'keep', why: 'its browser is alive' };
  if (num(leases) > 0) return { act: 'keep', why: 'a lease holds it' };
  if (d.starttime == null) return { act: 'keep', why: 'its identity is unproven (no starttime)' };
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
  if (num(ms) < 60000) return `${Math.max(0, Math.round(num(ms) / 1000))} s`; // lane browser-daemon-survives-update: a bound under a minute
  const m = Math.max(0, Math.round(num(ms) / 60000));
  if (m < 60) return `${m} min`;
  const h = m / 60;
  return h < 48 ? `${Math.round(h * 10) / 10} h` : `${Math.round(h / 24 * 10) / 10} d`;
}
/** The profile row's words after an ending. */
function rowNote(idleMs) { return `stopped — the daemon was ended after ${durText(idleMs)} idle (restarts on the next command)`; }
/** lane browser-daemon-survives-update: the row's words after a daemon whose browser ended was ended (`status` says it). */
function endedNote({ why = '', at = 0 } = {}) { return `stopped — its browser daemon was ended at ${clock(at)} UTC: ${why} (the next command starts a fresh one)`; }
const clock = (ms) => { const d = new Date(num(ms)); return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0'); };

/**
 * lane browser-daemon-survives-update — A SERVER RESTART RE-OWNS OR ENDS, NEVER LEAVES (PURE). A daemon of THIS instance
 * found at boot (its record names it, or the keeper's launch mark of a known profile) → `{act: 're-own' | 'end', why}`,
 * first match wins (`daemonAnswered` = its `session info` answered within the runtime's bound, `active` = it says a browser
 * runs in its namespace, `ask` = browser-viewport pageAnswers over its endpoint, null = no endpoint known):
 *   · the daemon did not answer                       ⇒ end   (its holders' next command starts a fresh one)
 *   · it answered, no browser in its namespace         ⇒ end
 *   · no endpoint to ask                               ⇒ re-own 'unasked' (the tick judges it from there)
 *   · nothing listens at its endpoint (refused)        ⇒ re-own 'gone' (MEASURED: its Chrome SIGKILLed ⇒ the daemon answers and
 *                                                               its next command relaunches Chrome in place in ~0.2 s — the tick's
 *                                                               heal; a live record keeps it, never an orphan)
 *   · its page list silent (no answer in the bound)   ⇒ end   (MEASURED: the whole Chrome SIGSTOPped ⇒ `session info` still
 *                                                               answers active:true — the daemon's answer never proves a browser)
 *   · no page open, the list answered                  ⇒ re-own
 *   · a page REACHED (its tab's browser side answered,  ⇒ re-own (a page held by a dialog or a busy renderer is still a browser
 *     or its renderer)                                            the user may want; the restart verdict judges its renderer)
 *   · no page reached within the bound                 ⇒ end
 */
function reownVerdict({ daemonAnswered = false, active = false, ask = null } = {}) {
  if (!daemonAnswered) return { act: 'end', why: 'its daemon did not answer (session info) within its bound' };
  if (!active) return { act: 'end', why: 'its daemon answered but runs no browser' };
  if (!ask || typeof ask !== 'object') return { act: 're-own', why: 'its daemon answers (no endpoint recorded to ask its page)' };
  const pages = Array.isArray(ask.pages) ? ask.pages.filter((x) => x && typeof x === 'object') : [];
  if (ask.list !== true && ask.refused === true) return { act: 're-own', why: 'its daemon answers and nothing listens at its endpoint (its browser is gone — its next command starts it again in place)' };
  if (ask.list !== true) return { act: 'end', why: `its browser does not answer CDP (the page list: ${String(ask.error || 'no answer').slice(0, 120)})` };
  if (!pages.length) return { act: 're-own', why: 'its browser answers (no page open)' };
  const reached = pages.filter((x) => x.reached === true || x.answered === true).length;
  if (reached) return { act: 're-own', why: `its page answers (${reached} of ${pages.length})` };
  return { act: 'end', why: `none of its ${pages.length} page(s) answered within the bound` };
}
/** The boot's ONE journal line per daemon it judged (re-owned or ended). */
function reownLine({ pid, profileId = '', label = '', act, why, result = null } = {}) {
  return `boot: the browser daemon pid ${pid} of ${profileId}${label ? ` "${label}"` : ''} ${act === 're-own' ? 'RE-OWNED' : 'ENDED'} — ${why}${result ? `: ${result}` : ''}${act === 're-own' ? '' : ' (the next command starts a fresh one)'}`;
}
/** ONE journal line per ending. */
function endedLine({ pid, why, conversation = null, idleMs = 0, result = 'ended', xvfb = [], chrome = [] } = {}) {
  const x = xvfb.length ? `; its Xvfb ${xvfb.map((v) => `pid ${v.pid} ${v.result}`).join(', ')}` : '';
  const c = chrome.length ? `; its browser ${chrome.map((v) => `pid ${v.pid} ${v.result}`).join(', ')}` : ''; // lane browser-daemon-survives-update
  return `ended the browser daemon pid ${pid} (${why}; ${chrome.length ? 'its browser not answering' : `no browser for ${durText(idleMs)}`}${conversation ? `; conversation ${conversation}` : ''}): ${result}${c}${x}`;
}
function reportLine({ pid, startedAt = 0, now = 0 } = {}) {
  return `the browser daemon pid ${pid} (up ${durText(num(now) - num(startedAt))}) has no browser and was not started by this keeper (no launch mark, no record) — reported, left running`;
}

module.exports = { GRACE_MS, IDLE_CAP_MS, SCAN_MS, BROWSER_ENDED_MS, daemonMark, daemonsFromRows, daemonVerdict, durText, rowNote, endedNote, endedLine, reportLine, reownVerdict, reownLine };
