'use strict';
/**
 * THE ONE HOME for the numbers every process KEEPER counts and bounds by
 * (docs/design-agent-browser-v2 §3.5 / docs/design-desktop-apps §2, 2026-09-13).
 *
 * Three keepers own long-lived third-party processes on this instance — the
 * OpenCode serve (src/opencode-serve.js), the desktop-app keeper
 * (src/server/desktop-app-keeper.js) and the browser keeper
 * (src/server/browser-keeper.js) —
 * and the browser design's rule is that they SHARE one ceiling and one
 * runaway guard instead of each inventing a set ("它和浏览器共用 §3.5 的那个
 * 上限与 runaway 守卫, 而不是自己再发明一套"). The desktop design names this
 * module as "同一份常量"; it did not exist before P8-1, so it was created here
 * and opencode-serve now READS its guard numbers from it (its own literals
 * were the first copy — the twin class).
 *
 * WHAT THE KEEPERS ARE FOR (the owner's 2026-09-25 ruling — "这个keeper到底是干啥
 * 的，没必要别乱加会影响使用的feature"): lifecycle (launch / adopt after a
 * restart / stop on request / app exit), ONE active viewer per app window,
 * the concurrency ceiling below (a refusal AT LAUNCH naming the holders —
 * never a kill), idle-out, and the resource verdict (src/runaway-guard.js)
 * with TWO outcomes: a HEADLESS service the product runs for itself (the
 * OpenCode serve) is stopped and parked; a session a PERSON or an AGENT is
 * using (a desktop app, an agent browser) is only REPORTED.
 *
 * PURE: imports nothing, so the daemon bundle and the browser can both carry
 * it. Numbers are measured facts, not knobs: the resource thresholds come from
 * the 2.369.42 incident (157-169 % CPU / 5.0 GB RSS for two hours — one
 * process, so its RSS was its footprint), the
 * concurrency ceiling from §1.2's per-instance envelope (each app session is
 * an X server + a picture server + the app — ~80 MB RSS and two more
 * processes before the app itself, measured 2026-09-13: Xvfb 1024x768 65 MB,
 * x11vnc 14.5 MB).
 */

/** /proc sample cadence for the resource verdict. */
const GUARD_SAMPLE_MS = 60000;
/** Sustained CPU % (100 = one core) that counts as HOT. */
const GUARD_CPU_PCT = 150;
/** …hot for this long ⇒ OVER (the serve: stopped; an app/browser: reported). */
const GUARD_CPU_SUSTAIN_MS = 5 * 60 * 1000;
/** A MEMORY FOOTPRINT above this ⇒ OVER. The metric is PSS (proportional
 *  set size: every page shared between the processes of a set counted ONCE,
 *  split between its sharers), else RssAnon+RssShmem of ONE process — never a per-process
 *  VmRSS SUM (2026-09-25, the Chrome desktop-app incident: 25 Chrome
 *  processes read 2.0 GB summed-RSS three seconds after `ready`; box-wide 891
 *  chrome pids = 94.67 GB summed RSS vs 15.09 GB PSS). What OVER means is the
 *  keeper's policy (the owner's 2026-09-25 ruling): the STOP threshold for the
 *  headless OpenCode serve, a REPORTING threshold for a desktop app or an
 *  agent browser (a person or an agent is using it — never stopped by a
 *  resource guard). ONE comparison site: src/runaway-guard.js
 *  (test-architecture census). Renamed from GUARD_RSS_BYTES so no reader
 *  keeps comparing an RSS sum by habit. */
const GUARD_MEM_BYTES = 2 * 1024 * 1024 * 1024;
/** A runaway OpenCode serve is allowed back at most once an hour (the only
 *  keeper that parks — desktop apps and browsers are never parked). */
const RUNAWAY_COOLDOWN_MS = 60 * 60 * 1000;
/** THE REPORT LEVEL'S HYSTERESIS (report-only keepers — a desktop app, an
 *  agent browser; src/runaway-guard.js reportTransition, 2026-09-25 r2). A
 *  live Chrome's PSS moves between samples, so a reading parked near the line
 *  crossed it every other sample and a "one notice per crossing" rule toasted
 *  every client every ~2 min (measured: 5 notices in 10 one-minute ticks).
 *  After a notice the level re-arms only once REPORT_REARM_SAMPLES samples in
 *  a row read CLEAR — memory under REPORT_REARM_FRACTION of the threshold (or
 *  not judged) and CPU not hot — and never sooner than REPORT_NOTICE_FLOOR_MS
 *  after the previous notice of the same session. */
const REPORT_REARM_FRACTION = 0.9;
const REPORT_REARM_SAMPLES = 3;
const REPORT_NOTICE_FLOOR_MS = 60 * 60 * 1000;
/** Concurrent keeper-owned sessions per instance (desktop apps; the browser
 *  keeper will count against the same number). Refused LOUDLY at the ceiling,
 *  naming the sessions that hold the slots — never an OOM on a machine whose
 *  systemd unit exists to survive one. */
const CONCURRENT_CAP = 6;

module.exports = { GUARD_SAMPLE_MS, GUARD_CPU_PCT, GUARD_CPU_SUSTAIN_MS, GUARD_MEM_BYTES, RUNAWAY_COOLDOWN_MS, REPORT_REARM_FRACTION, REPORT_REARM_SAMPLES, REPORT_NOTICE_FLOOR_MS, CONCURRENT_CAP };
