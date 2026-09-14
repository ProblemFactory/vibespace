'use strict';
/**
 * THE ONE HOME for the numbers every process KEEPER counts and bounds by
 * (docs/design-agent-browser-v2 §3.5 / docs/design-desktop-apps §2, 2026-09-13).
 *
 * Three keepers own long-lived third-party processes on this instance — the
 * OpenCode serve (src/opencode-serve.js), the desktop-app keeper
 * (src/server/desktop-app-keeper.js) and, when it lands, the browser keeper —
 * and the browser design's rule is that they SHARE one ceiling and one
 * runaway guard instead of each inventing a set ("它和浏览器共用 §3.5 的那个
 * 上限与 runaway 守卫, 而不是自己再发明一套"). The desktop design names this
 * module as "同一份常量"; it did not exist before P8-1, so it was created here
 * and opencode-serve now READS its guard numbers from it (its own literals
 * were the first copy — the twin class).
 *
 * PURE: imports nothing, so the daemon bundle and the browser can both carry
 * it. Numbers are measured facts, not knobs: the runaway thresholds come from
 * the 2.369.42 incident (157-169 % CPU / 5.0 GB RSS for two hours), the
 * concurrency ceiling from §1.2's per-instance envelope (each app session is
 * an X server + a picture server + the app — ~80 MB RSS and two more
 * processes before the app itself, measured 2026-09-13: Xvfb 1024x768 65 MB,
 * x11vnc 14.5 MB).
 */

/** /proc sample cadence for the runaway guard. */
const GUARD_SAMPLE_MS = 60000;
/** Sustained CPU % (100 = one core) that counts as HOT. */
const GUARD_CPU_PCT = 150;
/** …hot for this long ⇒ runaway. */
const GUARD_CPU_SUSTAIN_MS = 5 * 60 * 1000;
/** RSS above this ⇒ runaway at once. */
const GUARD_RSS_BYTES = 2 * 1024 * 1024 * 1024;
/** A runaway is allowed back at most once an hour. */
const RUNAWAY_COOLDOWN_MS = 60 * 60 * 1000;
/** Concurrent keeper-owned sessions per instance (desktop apps; the browser
 *  keeper will count against the same number). Refused LOUDLY at the ceiling,
 *  naming the sessions that hold the slots — never an OOM on a machine whose
 *  systemd unit exists to survive one. */
const CONCURRENT_CAP = 6;

module.exports = { GUARD_SAMPLE_MS, GUARD_CPU_PCT, GUARD_CPU_SUSTAIN_MS, GUARD_RSS_BYTES, RUNAWAY_COOLDOWN_MS, CONCURRENT_CAP };
