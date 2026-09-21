'use strict';
/**
 * WINDOW DESKTOP — TIER 3 OF THE ACCESS LADDER, THE USER'S REAL DESKTOP AS A
 * WINDOW TARGET (docs/design-agent-browser-v2 §7.6 / §7.1's `local-window`
 * row / §4.9 columns 1-2 / §6.6 / D27 (b) / D31; phase P10, 2026-09-21).
 * PURE: imports nothing, so the suite, the engine, the CLI's wording and the
 * browser registry all read ONE model of the second window class.
 *
 * THE TWO CLASSES (§6.6). Windows VibeSpace started (`origin:'vibespace'`,
 * the desktop-app keeper's records, D27 (a)) are the default class. Windows
 * on the USER'S OWN desktop (`origin:'desktop'`) are the other class: by
 * default they are neither listed nor addressable; the D27 (b) SWITCH
 * (`window.realDesktopTargets`, a setting with its own confirmation — a
 * user act, never an agent's: agents cannot write settings) opens the
 * class, every such row is marked "your desktop", and turning the switch
 * OFF drops every lease on that class at once — the user's decision always
 * wins, before any takeover is even asked for.
 *
 * WHAT THIS CLASS IS (tier 3, §7.6): NO CDP, NO automation flag, NO process
 * of ours — the application is whatever the user has open, addressed through
 * the AT-SPI accessibility tree the desktop already exports (§4.9: the ONE
 * road that holds in every column). `snapshot` / `click @ref` / `type @ref`
 * are that road and go through NO input injection (`Action.do_action` /
 * `EditableText` act on a node). The two verbs that exist only as INJECTION
 * (`key`, `click --at`) are REFUSED BY NAME on this class in this version —
 * a chord or a point on the real desktop lands in whatever window has focus,
 * including the one the user is typing in (§6.6's last bullet) — whatever
 * injection backend the display happens to have. That is the tier-3 safety
 * surface, and it is a rule about the CLASS, not a probe result.
 *
 * THE MEASUREMENTS §10's P10 row said to take FIRST are a RECORD here
 * (`TIER3_MEASUREMENTS`, the local-oracles discipline: date, tool, box, a
 * named outcome per column, a refusal by name where nothing was measured),
 * and `measurementVerdict` fails any `WIRED` claim whose evidence cell is not
 * `ok` — a rung somebody wires without re-measuring goes red.
 */

const ORIGINS = Object.freeze(['vibespace', 'desktop']);
const SETTING_KEY = 'window.realDesktopTargets';
const SETTING_LABEL = 'Let agents address windows on your real desktop (tier 3)';
const HANDLE_RE = /^dw-(\d{1,9})$/;
const desktopHandle = (pid) => `dw-${Number(pid)}`;
const isDesktopHandle = (h) => HANDLE_RE.test(String(h || ''));
const pidOfHandle = (h) => { const m = HANDLE_RE.exec(String(h || '')); return m ? Number(m[1]) : null; };

/** Every code this class adds to the window-target vocabulary (routes map
 *  them; the CLI spells them; the suite's census covers them). */
const REFUSALS = Object.freeze([
  'desktop_consent_off', 'desktop_injection_refused', 'no_live_view', 'capture_needs_portal', 'capture_unavailable', 'desktop_window_gone', 'tier3_is_a_window_target', 'provider_needs_consent', 'escalation_needs_user',
]);
const refuse = (code, why, extra = {}) => {
  if (!REFUSALS.includes(code)) throw new Error(`window-desktop: unknown refusal code ${code}`);
  return { ok: false, code, why, ...extra };
};

/** The D27 (b) switch, as a verdict. `enabled` is the setting's value as the
 *  server reads it (`serverSetting(SETTING_KEY) === true`); anything else —
 *  undefined, a string, a stale client copy — is OFF. */
function consentVerdict({ enabled } = {}) {
  if (enabled === true) return { ok: true };
  return refuse('desktop_consent_off', `windows on your real desktop are OFF — the user turns them on in Settings → Browser → "${SETTING_LABEL}" (a switch with its own confirmation; until then nothing on the desktop is listed or addressable, and turning it off again drops every lease on that class at once)`);
}

/**
 * The rows the other class shows: every application on the accessibility
 * bus that is NOT one of ours (a pid of a keeper-launched app, or this
 * process) — the AT-SPI desktop is the ONE enumeration road that holds in
 * every column of §4.9 (measured 2026-09-21: an Xwayland client and a native
 * Wayland client are both on the bus; only the first has an X window).
 * Every row is `origin:'desktop'` + `yourDesktop:true` (§6.6: marked).
 */
function desktopRows(a11yApps, { ourPids = [], selfPid = null } = {}) {
  const ours = new Set((ourPids || []).map(Number).filter(Number.isFinite));
  const rows = [];
  for (const a of a11yApps || []) {
    if (!a || !Number.isInteger(a.pid) || a.pid <= 0) continue;
    if (ours.has(a.pid) || (selfPid != null && a.pid === Number(selfPid))) continue;
    rows.push({ handle: desktopHandle(a.pid), label: String(a.name || '').trim() || `pid ${a.pid}`, pid: a.pid, pids: [a.pid], origin: 'desktop', yourDesktop: true, state: 'ready', display: 'your desktop', a11y: { pid: a.pid, name: a.name || '', children: a.children == null ? null : a.children } });
  }
  rows.sort((x, y) => x.label.localeCompare(y.label) || x.pid - y.pid);
  return rows;
}
/** The synthetic record a desktop handle resolves to (the shape the engine's
 *  vibespace records have where it matters: id, label, pids, origin). */
function desktopRecord(row) {
  if (!row) return null;
  return { id: row.handle, label: row.label, pids: row.pids || [row.pid], pid: row.pid, origin: 'desktop', yourDesktop: true, state: 'ready', display: 'your desktop', exec: null, appId: null, backend: null };
}

const INJECTION_WHY = 'a chord or a point click on your real desktop is injected into whatever window has keyboard focus or lies under the pointer — not necessarily the window the agent is looking at, and possibly the one you are typing in — so on this class no injection backend is wired at all (§6.6): the tree road (click @ref through the node\'s own Action, type @ref through EditableText) goes through no injection and is the only channel';
/** §5.1.1's per-verb law on the desktop class (the same shape as
 *  window-targets.verbVerdicts so the CLI prints both with one loop). */
function desktopVerbVerdicts({ a11y = { ok: true }, capture = null } = {}) {
  const tree = { ok: !!a11y.ok, why: a11y.ok ? null : `accessibility tree unreachable: ${a11y.why}` };
  return {
    snapshot: { via: 'tree', ...tree, note: 'the application\'s whole tree — it contains the text on screen' },
    screenshot: capture && capture.ok ? { via: 'pixels', ok: true, why: null, backend: capture.via, note: 'the window\'s own X pixmap (an Xwayland client), never the screen' } : { via: 'pixels', ok: false, why: capture ? `${capture.code}: ${capture.why}` : 'decided per window at screenshot time (an Xwayland client\'s own pixmap, or refused by name)', code: capture ? capture.code : null },
    click: { via: 'tree', ...tree, note: 'per node — only a node that exports Action; a node without one is refused, never degraded to a coordinate click' },
    type: { via: 'tree', ...tree, note: 'per node — only a node that exports EditableText' },
    key: { via: 'inject', ok: false, backend: null, code: 'desktop_injection_refused', why: INJECTION_WHY },
    'click-at': { via: 'inject', ok: false, backend: null, code: 'desktop_injection_refused', why: INJECTION_WHY },
    watch: { via: 'none', ok: false, code: 'no_live_view', why: 'you are looking at this window on your own desktop; VibeSpace draws no live pane for it in this version (a native Wayland window needs the ScreenCast portal\'s consent click + a PipeWire consumer, not wired)' },
    probe: 'desktop class: injection refused by rule (no probe is consulted)',
  };
}
/** The act gate for the desktop class: the two injection verbs are refused
 *  by NAME before any backend is probed; the tree verbs pass (the engine's
 *  per-node rules — node_has_no_action / node_not_editable — still apply). */
function desktopActGate({ verb, at = null } = {}) {
  const v = String(verb || '');
  if (v === 'key' || (v === 'click' && at)) return refuse('desktop_injection_refused', INJECTION_WHY, { verb: v === 'key' ? 'key' : 'click-at' });
  return { ok: true };
}

/**
 * §4.9 columns 1/2 as a decision per WINDOW: an Xwayland client whose X
 * window we found (by `_NET_WM_PID`) is read through `x11grab -window_id` —
 * its own redirected pixmap, measured readable on this box while the ROOT
 * grabs black — and needs ffmpeg; a native Wayland client has no X window,
 * so the only road is the ScreenCast portal (present ⇒ a consent click per
 * session, `persist_mode=2` remembers it, and a PipeWire consumer none of
 * which is wired) — refused BY NAME; an X11 session with no window for the
 * pid is `capture_unavailable`.
 */
function captureVerdict({ sessionType = null, xWindow = null, ffmpeg = null, portal = null, display = null } = {}) {
  if (!display) return refuse('capture_unavailable', 'the server has no DISPLAY in its environment — it cannot reach the user\'s X server (an Xwayland client\'s pixmap is read there); the session bus still carries the accessibility tree, so snapshot works');
  if (xWindow) {
    if (!ffmpeg) return refuse('capture_unavailable', `the window has an X window (${xWindow}) but ffmpeg is not on PATH (x11grab -window_id reads its pixmap)`);
    return { ok: true, via: 'x11grab', windowId: xWindow, display };
  }
  if (String(sessionType || '') === 'wayland') {
    if (portal && portal.screenCast) return refuse('capture_needs_portal', `this window is a native Wayland client — it has no X window, so x11grab cannot see it; the ScreenCast portal (v${portal.version || '?'}, window sources ${portal.windowSources ? 'available' : 'unavailable'}) is the only road and needs the user's consent click per session (persist_mode=2 remembers it) plus a PipeWire consumer — not wired in this version`);
    return refuse('capture_needs_portal', 'this window is a native Wayland client with no X window, and no ScreenCast portal answers on the session bus — no capture road exists here');
  }
  return refuse('capture_unavailable', 'no X window carries this pid (_NET_WM_PID) on the user\'s display — the application may draw no window, or it belongs to another session');
}

/** Which rungs this version WIRES on the desktop class — each one's evidence
 *  cell in TIER3_MEASUREMENTS must read `ok`, or measurementVerdict is red. */
const WIRED = Object.freeze({ x11grabWindow: true, portalScreenCast: false, injection: false, enumerateA11y: true });
/**
 * THE RECORD (scripts/measure-tier3.mjs reproduces it). Every cell names its
 * outcome; a refusal names itself; nothing here is a promise about another
 * desktop. `columns` are §4.9's rows re-verified on the USER'S OWN session;
 * `sites` is §12.36; `latency` is §12.39.
 */
const TIER3_MEASUREMENTS = Object.freeze({
  date: '2026-09-21',
  tool: 'scripts/measure-tier3.mjs',
  box: 'Ubuntu, GNOME Shell 50.1 on Wayland with Xwayland on :1, xdg-desktop-portal ScreenCast v5 / RemoteDesktop v2, at-spi2 2.60.4, ffmpeg 8.0.1, agent-browser 0.32.0 with its Chrome 151.0.7922.34',
  columns: Object.freeze({
    enumerateA11y: Object.freeze({ status: 'ok', detail: 'the AT-SPI desktop lists every application with a tree: an Xwayland client AND a native Wayland client (the GTK fixture mapped under each backend) both appeared on the bus — the one enumeration road that holds in both columns' }),
    enumerateX11: Object.freeze({ status: 'partial', why: '_NET_CLIENT_LIST on :1 named 0 managed windows while the session had no Xwayland client open (xwininfo saw 14 one-pixel helpers: mutter-x11-frames, ibus, the guard window; wmctrl -lp printed nothing); the fixture mapped as an Xwayland client appeared (1) and a native Wayland client never did — X11 enumerates only X11 clients' }),
    captureX11Root: Object.freeze({ status: 'failed', why: 'x11grab of the Xwayland ROOT (64×64 at 0,0) returned 0 of 4096 bytes non-zero — all black; the Xwayland root is not the screen under mutter' }),
    captureX11Window: Object.freeze({ status: 'ok', detail: 'x11grab -window_id of the Xwayland client\'s own window (found by xdotool search --pid, _NET_WM_PID set) returned 151200 of 151200 bytes non-zero — the redirected pixmap is readable; XGetImage of the same window through Gdk read 300000/300000 non-zero bytes' }),
    nativeWaylandOnX11: Object.freeze({ status: 'failed', why: 'the fixture mapped as a native Wayland client: xdotool search --pid found no X window, _NET_CLIENT_LIST stayed 0, wmctrl 0 — invisible to every X11 road while fully present on the a11y bus' }),
    portalScreenCast: Object.freeze({ status: 'consent', why: 'ScreenCast v5, AvailableSourceTypes 7 (monitor|window|virtual): CreateSession response 0 in 2.2 ms and SelectSources(types=2 window, persist_mode=2) response 0 in 0.7 ms from THIS shell and identically from a `systemd-run --user` transient unit (the server\'s own context); Start raised the consent dialog and answered nothing within a 2 s wait (the session was Closed; nobody clicks it) — a grant is the user\'s click, then persist_mode=2 + restore_token' }),
    gnomeIntrospect: Object.freeze({ status: 'failed', why: 'org.gnome.Shell.Introspect.GetWindows: AccessDenied ("GetWindows is not allowed") — the Shell allows only its D-Bus sender allowlist' }),
    gnomeScreenshotWindow: Object.freeze({ status: 'failed', why: 'org.gnome.Shell.Screenshot.ScreenshotWindow: AccessDenied ("ScreenshotWindow is not allowed")' }),
    injection: Object.freeze({ status: 'not-measured', why: 'no injection was attempted on the user\'s desktop — refused by rule on this class (§6.6), so there is nothing to measure until D29 wires the portal' }),
  }),
  sites: Object.freeze({
    tier1: Object.freeze({ status: 'measured', launch: 'agent-browser 0.32.0 + its Chrome 151.0.7922.34, headless, scratch HOME (the user\'s config.json and its AutomationControlled flag not read), the one launch arg --no-sandbox (a launch precondition on this box per the CLI\'s own hint, not a detection flag)', runs: Object.freeze([
      Object.freeze({ site: 'bot.sannysoft.com', outcome: 'fingerprint table 3 passed / 1 failed cells (8.8 s to read)' }),
      Object.freeze({ site: 'nowsecure.nl', outcome: 'no Cloudflare challenge marker (title "nowsecure.nl", 7.4 s)' }),
      Object.freeze({ site: 'browserscan.net/bot-detection', outcome: 'FLAGGED — the page\'s verdict reads "Robot" (6.2 s)' }),
    ]) }),
    tier2: Object.freeze({ status: 'refused', refusal: 'binary_absent', why: 'cloakbrowser is not installed (CLOAK_EGRESS_PROOF) and no cloud:* key is configured — the reading is the refusal' }),
    tier3: Object.freeze({ status: 'refused', refusal: 'needs_user', why: 'the user\'s own browser window is addressed only after the D27 (b) switch; a script driving it would be the user\'s act, not a measurement' }),
    banks: Object.freeze({ status: 'refused', refusal: 'owner_act', why: 'a real login page driven by an automated browser from the owner\'s address is the owner\'s act — D31 "measure first" stands as owed, with the public demo pages above as the only tier-1 reading this round' }),
  }),
  latency: Object.freeze({
    ourXvfb: Object.freeze({ medianMs: 1.7, p95Ms: 15.5, maxMs: 15.5, n: 10, pollMs: 0.2 }),
    userXwayland: Object.freeze({ medianMs: 3.3, p95Ms: 15.5, maxMs: 15.5, n: 10, pollMs: 0.4 }),
    treeVisibleMedianMs: 0.29,
    detail: 'one Action.do_action on the GTK fixture\'s button → the first XGetImage of the window whose pixels differ; the fixture mapped on our own Xvfb and, for the second row, on the user\'s Xwayland :1 (GDK_BACKEND=x11) — the p95 is one 60 Hz frame',
  }),
});
const COLUMN_STATUSES = Object.freeze(['ok', 'partial', 'failed', 'consent', 'not-measured']);
/** The local-oracles discipline over the record + the WIRED claims:
 *  `{ok:true}` or `{ok:false, error}`. */
function measurementVerdict(rec = TIER3_MEASUREMENTS, wired = WIRED) {
  if (!rec || typeof rec !== 'object') return { ok: false, error: 'no measurement record' };
  for (const k of ['date', 'tool', 'box', 'columns', 'sites', 'latency']) if (!(k in rec)) return { ok: false, error: `record lacks ${k}` };
  for (const [name, c] of Object.entries(rec.columns || {})) {
    if (!c || !COLUMN_STATUSES.includes(c.status)) return { ok: false, error: `column ${name} has no status from ${COLUMN_STATUSES.join('/')}` };
    if (c.status !== 'ok' && !c.why) return { ok: false, error: `column ${name} is ${c.status} without a why` };
    if (c.status === 'ok' && !c.detail) return { ok: false, error: `column ${name} claims ok without its detail` };
  }
  const need = { x11grabWindow: 'captureX11Window', portalScreenCast: 'portalScreenCast', enumerateA11y: 'enumerateA11y', injection: 'injection' };
  for (const [claim, col] of Object.entries(need)) {
    if (wired[claim] === true && !(rec.columns[col] && rec.columns[col].status === 'ok')) return { ok: false, error: `WIRED.${claim} is true but the evidence cell ${col} reads ${rec.columns[col] ? rec.columns[col].status : 'missing'} — a rung wired without its measurement` };
  }
  const s = rec.sites || {};
  if (!s.tier1 || s.tier1.status !== 'measured' || !Array.isArray(s.tier1.runs) || !s.tier1.runs.length || s.tier1.runs.some((r) => !r || !r.site || !r.outcome)) return { ok: false, error: 'sites.tier1 must be a measured list of {site, outcome}' };
  for (const t of ['tier2', 'tier3', 'banks']) if (!s[t] || (s[t].status !== 'measured' && !(s[t].status === 'refused' && s[t].refusal))) return { ok: false, error: `sites.${t} is neither measured nor a refusal by name` };
  for (const k of ['ourXvfb', 'userXwayland']) { const l = rec.latency[k]; if (!l || !Number.isFinite(l.medianMs) || !Number.isFinite(l.p95Ms) || !Number.isInteger(l.n) || l.n < 1) return { ok: false, error: `latency.${k} lacks a finite median/p95 and an n` }; }
  return { ok: true };
}

/** What a §7.6 hint ASKS FOR, and what acting on it means — never a switch
 *  the server performs. `rowOf(id)` is the provider table (the tier is
 *  DERIVED from the row; a hint that names a backend stores no tier). */
function hintAction(hint, { rowOf = () => null } = {}) {
  if (!hint || typeof hint !== 'object') return null;
  if (hint.backend) {
    const row = rowOf(hint.backend) || {};
    const tier = Number.isInteger(row.tier) ? row.tier : null;
    return { kind: 'preference', backend: String(hint.backend), tier, auto: false, act: row.leaseKind === 'window-target' ? 'open-window-target' : 'switch-by-user', by: hint.by || null };
  }
  const t = Number(hint.tier);
  if (![1, 2, 3].includes(t)) return null;
  return { kind: 'suggestion', tier: t, backend: null, auto: false, by: hint.by || null,
    act: t === 3 ? 'open-window-target' : t === 2 ? 'switch-by-user' : 'none',
    text: t === 3 ? `tier 3 = a window on the user's own desktop: the user turns on "${SETTING_LABEL}" (Settings → Browser), then the agent addresses their browser window with vibespace-window — no profile is created or re-pointed, and nothing escalates by itself` : t === 2 ? 'tier 2 = a fingerprint backend (cloak / cloud:*): the user picks it in the backend switcher — nothing escalates by itself' : 'tier 1 needs no act' };
}

module.exports = {
  ORIGINS, SETTING_KEY, SETTING_LABEL, HANDLE_RE, REFUSALS, refuse, desktopHandle, isDesktopHandle, pidOfHandle,
  consentVerdict, desktopRows, desktopRecord, desktopVerbVerdicts, desktopActGate, INJECTION_WHY, captureVerdict,
  WIRED, TIER3_MEASUREMENTS, COLUMN_STATUSES, measurementVerdict, hintAction,
};
