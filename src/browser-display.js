'use strict';
/**
 * HEADED IS A PREFERENCE, THE DISPLAY IS A FACT — PURE (imports nothing; CJS so
 * the keeper, the `browser-serve` op table the daemon bundles and the client
 * bundle carry the same rule). Lane headless-fallback, 2026-09-28: the dev box
 * sat at the GDM login screen after a reboot, no Wayland socket in
 * /run/user/<uid>, no DISPLAY; the owner's ~/.agent-browser/config.json asks
 * `headed: true` + `--ozone-platform=wayland`, and every agent browser launch
 * failed "Failed to connect to Wayland display … The platform failed to
 * initialize" — a PREFERENCE (a window) failed a launch a FACT (no display,
 * headless works) could satisfy.
 *
 * MEASURED (agent-browser 0.38.1 + Google Chrome 154.0.8037.57, scratch HOME,
 * WAYLAND_DISPLAY / DISPLAY unset, no wayland-* in XDG_RUNTIME_DIR):
 *   headed:true  + --ozone-platform=wayland      ⇒ exit 1 "Failed to connect to Wayland display" (the incident)
 *   headed:false + --ozone-platform=wayland      ⇒ launches (`--headless=new` ignores the pinned platform)
 *   headed:false + the ozone arg dropped         ⇒ launches
 *   headed:false + --ozone-platform=headless     ⇒ launches
 *   headed:true  + no ozone arg, Xvfb on PATH    ⇒ launches on the CLI's OWN Xvfb (`-displayfd`, invisible)
 *   headed:true  + no ozone arg, no Xvfb         ⇒ exit 1 "Missing X server or $DISPLAY"
 * So headless needs no ozone arg at all: the headless rung DROPS the display-
 * pinning `--ozone-platform=<wayland|x11>` (a config never names a display
 * that is not there) and says `headed:false` — but headless Chrome 154 reports
 * `HeadlessChrome/154`, which sign-in pages read as automation.
 *
 * THE HIDDEN-WINDOW RUNG (the coordinator's addendum, default `auto`): where
 * Xvfb is installed, 0.38.1 starts its OWN invisible Xvfb for a headed launch
 * and Chrome runs a normal window there (UA `Chrome/154`). Measured further:
 *   DISPLAY unset (WAYLAND_DISPLAY set or not)   ⇒ its Xvfb starts
 *   DISPLAY='' and WAYLAND_DISPLAY=''            ⇒ its Xvfb starts
 *   DISPLAY=:97 (stale), or DISPLAY='' beside a non-empty WAYLAND_DISPLAY ⇒ no Xvfb, "Missing X server or $DISPLAY"
 *   XDG_SESSION_TYPE=wayland, no pin             ⇒ Chrome picks Wayland and fails; with --ozone-platform=x11 it runs on the Xvfb
 * So the rung pins `--ozone-platform=x11` (the Xvfb is X11) and, when the process env names a display at all, clears
 * BOTH (`DISPLAY=''`, `WAYLAND_DISPLAY=''`) for the launch. `browser.noDisplayMode` = `headless` keeps the headless rung.
 *
 * THE RULE (`launchPlan`): a launch that does not want a window is untouched.
 * One that does:
 *   · no display, Xvfb here, mode auto   ⇒ headed on the CLI's own Xvfb: the display pins replaced by x11, a named
 *                                          display cleared, fallback {why:'no-display', wanted:'headed', rung:'hidden-window'}
 *   · no display otherwise               ⇒ headed:false, the display-pinning ozone arg dropped,
 *                                          fallback {why:'no-display', wanted:'headed', rung:'headless'}
 *   · the ozone arg pins a platform this machine does not have now, another one is here
 *                                        ⇒ that arg replaced by the one that is, fallback
 *                                          {why:'ozone-unavailable', wanted, used}
 *   · otherwise                          ⇒ untouched (+ WAYLAND_DISPLAY in the launch env when the socket was
 *                                          found in the runtime dir but the process env does not name it — a
 *                                          server started before the owner logged in)
 * The user's file is NEVER edited: the keeper writes the planned config beside
 * its own files and names it on every call of THAT browser (a call whose view
 * differs from the launch relaunches the browser — measured), and the fact rides
 * the browser record until its next launch, which probes again.
 *
 * THE FACT (`displayVerdict`) is never guessed: Wayland = the socket
 * WAYLAND_DISPLAY names (absolute, or under XDG_RUNTIME_DIR), else the lowest
 * `wayland-N` socket in XDG_RUNTIME_DIR; X11 = DISPLAY `:N` / `unix:N` AND its
 * socket /tmp/.X11-unix/X<N> (or the abstract one Linux X servers also hold); a
 * TCP DISPLAY cannot be proven by a file and is not counted. The SHARED probe
 * (src/browser-facts.js `probeDisplay`) stats and CONNECTS to exactly the paths
 * `displayCandidates` names — a socket file left by a dead compositor is not a
 * display. An entry with `alive: null` (not connect-tested) counts on existence.
 */

const DISPLAY_KINDS = Object.freeze(['wayland', 'x11', 'none']);
const X11_DIR = '/tmp/.X11-unix';
const OZONE_PREFIX = '--ozone-platform=';
/** The ozone platforms that NAME a display (the ones the plan may drop or replace). */
const DISPLAY_PLATFORMS = Object.freeze(['wayland', 'x11']);
const WAYLAND_SOCKET_RE = /^wayland-(\d{1,4})$/;
const KIND_NAME = Object.freeze({ wayland: 'Wayland', x11: 'X11', none: 'no display' });

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (typeof v === 'string' ? v : '');
const joinPath = (dir, name) => (String(dir).endsWith('/') ? String(dir) + name : String(dir) + '/' + name);

/** The runtime dir a process would look for a Wayland socket in: an ABSOLUTE XDG_RUNTIME_DIR, else none (never a guessed /run/user/<uid>). */
function runtimeDirOf(env) {
  const v = isObj(env) ? str(env.XDG_RUNTIME_DIR) : '';
  return v.startsWith('/') ? v : null;
}

/** DISPLAY → `{n, path, abstract}` for a LOCAL display (`:0`, `:0.1`, `unix:3`), `{tcp:true}` for a host form, null when unset. */
function parseX11Display(v, x11Dir = X11_DIR) {
  const s = str(v).trim();
  if (!s) return null;
  const m = /^(?:unix)?:(\d{1,5})(?:\.\d+)?$/.exec(s);
  if (!m) return { tcp: true, name: s };
  const p = joinPath(x11Dir, 'X' + m[1]);
  return { n: Number(m[1]), name: s, path: p, abstract: '@' + p };
}

/** The Wayland socket WAYLAND_DISPLAY names → `{name, path}` (absolute value, or under the runtime dir), null when unset/unplaceable. */
function namedWayland(env, runtimeDir) {
  const wd = isObj(env) ? str(env.WAYLAND_DISPLAY).trim() : '';
  if (!wd) return null;
  if (wd.startsWith('/')) return { name: wd, path: wd };
  if (!runtimeDir || wd.includes('/')) return { name: wd, path: null };
  return { name: wd, path: joinPath(runtimeDir, wd) };
}

/**
 * The paths the probe must look at (stat + connect) — and nothing else. `listing` = the runtime dir's entry
 * names. An abstract X11 name is spelled `@<path>` (the probe connects to `\0<path>`).
 */
function displayCandidates({ env = {}, runtimeDir = undefined, listing = [], x11Dir = X11_DIR } = {}) {
  const out = [];
  const add = (p) => { if (p && !out.includes(p)) out.push(p); };
  const rd = runtimeDir === undefined ? runtimeDirOf(env) : (typeof runtimeDir === 'string' && runtimeDir.startsWith('/') ? runtimeDir : null);
  const nw = namedWayland(env, rd);
  if (nw && nw.path) add(nw.path);
  if (rd) for (const n of (Array.isArray(listing) ? listing : []).map(String).filter((x) => WAYLAND_SOCKET_RE.test(x)).sort(byWaylandN)) add(joinPath(rd, n));
  const x = parseX11Display(isObj(env) ? env.DISPLAY : '', x11Dir);
  if (x && !x.tcp) { add(x.path); add(x.abstract); }
  return out;
}
function byWaylandN(a, b) { return Number(WAYLAND_SOCKET_RE.exec(a)[1]) - Number(WAYLAND_SOCKET_RE.exec(b)[1]); }

/**
 * THE FACT. `entries` = the probe's findings for `displayCandidates` — `{path, type:'socket'|'missing'|'other',
 * alive: true|false|null}`. → `{kind, socket, name, available, wayland, x11, env, why}`:
 *   kind      'wayland' | 'x11' | 'none' (Wayland first when both are here)
 *   socket    the chosen display's socket path (null for none)
 *   name      what a process names it by (`wayland-0` / `:0`)
 *   available every kind that is here
 *   env       what the LAUNCH must add so the browser finds the chosen display ({} or {WAYLAND_DISPLAY})
 *   why       one short line per thing looked at and not counted (the Settings line's detail)
 */
function displayVerdict({ env = {}, runtimeDir = undefined, entries = [], x11Dir = X11_DIR, xvfb = null } = {}) {
  const rd = runtimeDir === undefined ? runtimeDirOf(env) : (typeof runtimeDir === 'string' && runtimeDir.startsWith('/') ? runtimeDir : null);
  const byPath = new Map();
  for (const e of Array.isArray(entries) ? entries : []) if (isObj(e) && typeof e.path === 'string') byPath.set(e.path, e);
  const live = (p) => { const e = p ? byPath.get(p) : null; return !!e && e.type === 'socket' && e.alive !== false; };
  const why = [];
  let wayland = null;
  const nw = namedWayland(env, rd);
  if (nw) {
    if (nw.path && live(nw.path)) wayland = { name: nw.name, socket: nw.path, via: 'WAYLAND_DISPLAY' };
    else why.push(nw.path ? `WAYLAND_DISPLAY=${nw.name} names ${nw.path}, which is not a live socket` : `WAYLAND_DISPLAY=${nw.name} cannot be placed (no XDG_RUNTIME_DIR)`);
  }
  if (!wayland && rd) {
    const found = [...byPath.values()].filter((e) => e.path.startsWith(rd.endsWith('/') ? rd : rd + '/') && WAYLAND_SOCKET_RE.test(e.path.slice(e.path.lastIndexOf('/') + 1)))
      .sort((a, b) => byWaylandN(a.path.slice(a.path.lastIndexOf('/') + 1), b.path.slice(b.path.lastIndexOf('/') + 1)));
    const first = found.find((e) => live(e.path));
    if (first) { const name = first.path.slice(first.path.lastIndexOf('/') + 1); wayland = { name, socket: first.path, via: 'runtime-dir' }; }
    else if (found.length) why.push(`${found.map((e) => e.path).join(', ')}: not a live socket`);
    else why.push(`no wayland-* socket in ${rd}`);
  } else if (!wayland && !nw) why.push('no XDG_RUNTIME_DIR, so no Wayland socket can be found');
  let x11 = null;
  const x = parseX11Display(isObj(env) ? env.DISPLAY : '', x11Dir);
  if (!x) why.push('DISPLAY is not set');
  else if (x.tcp) why.push(`DISPLAY=${x.name} is not a local display — it cannot be proven by a socket here`);
  else if (live(x.path)) x11 = { name: x.name, socket: x.path, via: 'DISPLAY' };
  else if (live(x.abstract)) x11 = { name: x.name, socket: x.abstract, via: 'DISPLAY (abstract socket)' };
  else why.push(`DISPLAY=${x.name}: no live X socket at ${x.path}`);
  const available = [wayland ? 'wayland' : null, x11 ? 'x11' : null].filter(Boolean);
  const kind = wayland ? 'wayland' : x11 ? 'x11' : 'none';
  const chosen = kind === 'wayland' ? wayland : kind === 'x11' ? x11 : null;
  // the launch env: a Wayland socket found in the runtime dir but not named by the process env (a server started before
  // the owner logged in) is named for the launch — libwayland falls back to `wayland-0` only
  const launchEnv = wayland && wayland.via === 'runtime-dir' ? { WAYLAND_DISPLAY: wayland.name } : {};
  // the hidden-window rung's two inputs: is an Xvfb binary on the PATH the browser launches with (the probe's), and does
  // the process env name a display at all (a stale one keeps the CLI from starting its own Xvfb — measured)
  const envNamesDisplay = (isObj(env) && (str(env.DISPLAY).trim() !== '' || str(env.WAYLAND_DISPLAY).trim() !== '')) || false;
  return { kind, socket: chosen ? chosen.socket : null, name: chosen ? chosen.name : null, available, wayland, x11, env: launchEnv, why,
    xvfb: xvfb === true ? true : xvfb === false ? false : null, envNamesDisplay };
}

// ── args (a string joined by `,` or newlines, or a list — the representation is kept) ──
function argsList(args) {
  if (Array.isArray(args)) return args.map((x) => String(x).trim()).filter(Boolean);
  if (typeof args !== 'string') return [];
  return args.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
}
function argsLike(orig, list) {
  if (Array.isArray(orig)) return list;
  if (typeof orig !== 'string') return list.length ? list.join(',') : orig;
  return list.join(orig.includes('\n') ? '\n' : ',');
}
/** Every `--ozone-platform=<v>` value, in order (Chrome takes the LAST). */
function ozonePlatformsOf(args) {
  return argsList(args).filter((a) => a.startsWith(OZONE_PREFIX)).map((a) => a.slice(OZONE_PREFIX.length).trim().toLowerCase());
}
/** The platform the launch pins (the last one), or null. */
function ozoneOf(args) { const v = ozonePlatformsOf(args); return v.length ? v[v.length - 1] : null; }
/** `args` without the display-pinning ozone switches (headless keeps nothing a missing display could fail on). */
function withoutDisplayOzone(args) {
  const list = argsList(args);
  const kept = list.filter((a) => !(a.startsWith(OZONE_PREFIX) && DISPLAY_PLATFORMS.includes(a.slice(OZONE_PREFIX.length).trim().toLowerCase())));
  return { args: kept.length === list.length ? args : argsLike(args, kept), dropped: list.filter((a) => !kept.includes(a)) };
}
/** `args` with every ozone switch replaced by `--ozone-platform=<platform>` (in the place of the first one). */
function withOzone(args, platform) {
  const list = argsList(args);
  const out = [];
  let placed = false;
  for (const a of list) {
    if (a.startsWith(OZONE_PREFIX)) { if (!placed) { out.push(OZONE_PREFIX + platform); placed = true; } continue; }
    out.push(a);
  }
  if (!placed) out.push(OZONE_PREFIX + platform);
  return argsLike(args, out);
}

/** What a launch WANTS, from the config it would run with (+ an AGENT_BROWSER_HEADED env value, which wins over it). */
function wantedOf(cfg, { headedEnv = null } = {}) {
  const c = isObj(cfg) ? cfg : {};
  const headed = headedEnv === true || headedEnv === false ? headedEnv : c.headed === true;
  return { headed, args: c.args === undefined ? null : c.args };
}

/** `browser.noDisplayMode`: 'auto' (the hidden window where Xvfb is installed, else headless — the default) | 'headless'. */
const NO_DISPLAY_MODES = Object.freeze(['auto', 'headless']);
function noDisplayModeOf(v) { return v === 'headless' ? 'headless' : 'auto'; }

/** Does a display verdict / fact say this machine has NO desktop session (no live Wayland or X socket)? */
function noDesktop(d) { return !isObj(d) || d.kind === 'none' || !(Array.isArray(d.available) && d.available.length); }
/**
 * THE WINDOW PREFERENCE, RESOLVED (lane hooks-create H5 — the owner's decision 2026-10-01: on a fleet pod every agent
 * browser was headless Chrome and Google sign-in refused it). `setting` = `browser.headed` as stored ('yes' | 'no' |
 * true | false | '' | null). An explicit value wins. UNSET, on a machine with NO desktop session where Xvfb is
 * installed and `browser.noDisplayMode` is auto ⇒ a window is asked for ⇒ the hidden-window rung (the CLI's own
 * invisible Xvfb, UA Chrome/154); otherwise unset keeps today's meaning (inherit the CLI's own config). Resolved where
 * the display is PROBED — at a launch, on the machine that launches — never at a spawn (a config composed then would
 * carry the display of that moment). → `{headed: true | false | null, why: 'setting' | 'no-desktop' | 'inherit'}`.
 */
/**
 * THE SWITCH of H5's rule (the 2.369.200 integration): OFF in 2.369.200 — an UNSET preference keeps .199's meaning
 * everywhere (inherit; headless on a machine with no desktop, said by the display fact), while an explicit
 * `browser.headed = yes` still runs the hidden-window rung. Reason: the dialog / navigation-loop watch is not yet verified
 * on that rung (test-browser-dialog-chrome / -site-reset-chrome were red there); the rule ships ON with lane
 * browser-windows (one window per holder) in .201, where those suites run on that rung. Callers never pass it; gates do.
 */
const NO_DESKTOP_WINDOW_DEFAULT = false;
function resolveHeaded({ setting = null, display = null, mode = 'auto', noDesktopWindow = NO_DESKTOP_WINDOW_DEFAULT } = {}) {
  if (setting === true || setting === 'yes') return { headed: true, why: 'setting' };
  if (setting === false || setting === 'no') return { headed: false, why: 'setting' };
  if (noDesktopWindow === true && noDisplayModeOf(mode) === 'auto' && isObj(display) && noDesktop(display) && display.xvfb === true) return { headed: true, why: 'no-desktop' };
  return { headed: null, why: 'inherit' };
}

/**
 * THE PLAN for one launch. `wanted` = `{headed, args}` (the effective preference and the config's args),
 * `display` = a verdict (or a recorded fact — same fields), `mode` = `browser.noDisplayMode`.
 * → `{headed, args, changed, fallback, env}`.
 */
function launchPlan({ wanted = {}, display = null, mode = 'auto' } = {}) {
  const w = isObj(wanted) ? wanted : {};
  const d = isObj(display) ? display : { kind: 'none', available: [], env: {} };
  const args = w.args === undefined ? null : w.args;
  const env = isObj(d.env) ? { ...d.env } : {};
  if (w.headed !== true) return { headed: w.headed === false ? false : w.headed ?? null, args, changed: false, fallback: null, env: {} };
  const available = Array.isArray(d.available) ? d.available : [];
  if (d.kind === 'none' || !available.length) {
    const cut = withoutDisplayOzone(args);
    if (noDisplayModeOf(mode) === 'auto' && d.xvfb === true) {
      // rung 1: a normal window on the CLI's own invisible Xvfb — X11 pinned, a named display cleared (measured above)
      return { headed: true, args: withOzone(cut.args, 'x11'), changed: true, fallback: { why: 'no-display', wanted: 'headed', rung: 'hidden-window', dropped: cut.dropped }, env: d.envNamesDisplay ? { DISPLAY: '', WAYLAND_DISPLAY: '' } : {} };
    }
    return { headed: false, args: cut.args, changed: true, fallback: { why: 'no-display', wanted: 'headed', rung: 'headless', dropped: cut.dropped }, env: {} };
  }
  const pinned = ozoneOf(args);
  if (pinned && DISPLAY_PLATFORMS.includes(pinned) && !available.includes(pinned)) {
    const used = available.includes(d.kind) ? d.kind : available[0];
    return { headed: true, args: withOzone(args, used), changed: true, fallback: { why: 'ozone-unavailable', wanted: pinned, used }, env: used === 'wayland' ? env : {} };
  }
  // untouched — a Wayland launch (pinned, or the machine's only display) names the socket it found
  const drawsOnWayland = pinned === 'wayland' || (!pinned && d.kind === 'wayland' && !available.includes('x11'));
  return { headed: true, args, changed: false, fallback: null, env: drawsOnWayland ? env : {} };
}

/** The config the plan produces (a copy; the input is never mutated). Unchanged ⇒ the same object. */
function applyPlan(cfg, plan) {
  if (!isObj(cfg) || !isObj(plan) || !plan.changed) return cfg;
  const out = { ...cfg, headed: plan.headed === true };
  if (plan.args === null || plan.args === undefined || (typeof plan.args === 'string' && !plan.args) || (Array.isArray(plan.args) && !plan.args.length)) delete out.args;
  else out.args = plan.args;
  return out;
}

/**
 * THE FACT a launch records on its browser record (`rec.display`): the verdict's display fields, what was wanted,
 * what the plan did, and — when the previous launch of this record fell back and this one did not — `recovered`
 * (the row says the window is back). Plain JSON (persisted with the registry, broadcast with the digest).
 */
function displayFact({ display = null, plan = null, wanted = null, prev = null, at = 0, mode = 'auto', byDefault = false } = {}) {
  const d = isObj(display) ? display : displayVerdict({});
  const p = isObj(plan) ? plan : launchPlan({ wanted, display: d, mode });
  const prevFb = isObj(prev) && isObj(prev.fallback) ? prev.fallback.why : null;
  return {
    kind: DISPLAY_KINDS.includes(d.kind) ? d.kind : 'none', socket: d.socket || null, name: d.name || null,
    available: Array.isArray(d.available) ? d.available.slice() : [],
    wayland: isObj(d.wayland) ? { ...d.wayland } : null, x11: isObj(d.x11) ? { ...d.x11 } : null,
    // `byDefault` (lane hooks-create H5): the window was asked for by resolveHeaded's no-desktop rule, not by a setting or
    // the config — every later call re-derives the same plan from this fact (planForFact)
    wanted: { headed: !!(isObj(wanted) && wanted.headed === true), ozone: isObj(wanted) ? ozoneOf(wanted.args) : null, ...(byDefault === true ? { byDefault: true } : {}) },
    headed: p.headed === true, fallback: isObj(p.fallback) ? { ...p.fallback, ...(Array.isArray(p.fallback.dropped) ? { dropped: p.fallback.dropped.slice() } : {}) } : null,
    env: isObj(p.env) ? { ...p.env } : {},
    recovered: prevFb && !p.fallback && p.headed === true ? prevFb : null,
    why: Array.isArray(d.why) ? d.why.slice(0, 6) : [],
    xvfb: d.xvfb === true ? true : d.xvfb === false ? false : null, envNamesDisplay: !!d.envNamesDisplay, mode: noDisplayModeOf(mode),
    at: Number(at) || 0,
  };
}
/** Does a recorded fact change the config a browser's calls must name? */
function planApplies(fact) { return isObj(fact) && isObj(fact.fallback); }
/** The plan a recorded fact makes of a base config (every later call of that browser re-derives the same file). */
function planForFact(cfg, fact, { headedEnv = null } = {}) {
  // a launch whose window the no-desktop default asked for (fact.wanted.byDefault): every later call asks the same
  const h = headedEnv === true || headedEnv === false ? headedEnv : (isObj(fact) && isObj(fact.wanted) && fact.wanted.byDefault === true ? true : null);
  return launchPlan({ wanted: wantedOf(cfg, { headedEnv: h }), display: fact, mode: isObj(fact) ? fact.mode : 'auto' });
}

/** The code a surface words: 'hidden-window' | 'headless' | 'substituted' | 'recovered' | null. */
function factCode(fact) {
  if (!isObj(fact)) return null;
  if (isObj(fact.fallback) && fact.fallback.why === 'no-display') return fact.fallback.rung === 'hidden-window' ? 'hidden-window' : 'headless';
  if (isObj(fact.fallback) && fact.fallback.why === 'ozone-unavailable') return 'substituted';
  if (fact.recovered) return 'recovered';
  return null;
}
/** A kind's display name (Wayland / X11). */
function kindName(kind) { return KIND_NAME[kind] || String(kind || ''); }

/** THE AGENT'S sentence (English, never translated — an agent reads it; the user's surfaces word the code). '' = nothing to say. */
function agentNote(fact) {
  const c = factCode(fact);
  if (c === 'hidden-window') return 'this machine has no desktop session, so this browser runs in a hidden window (an invisible display on this machine; a window was asked for) — pages work the same, and the user can still watch it and take over in the live view [browser_hidden_window]';
  if (c === 'headless') return 'this machine has no desktop session, so this browser runs headless (a window was asked for) — pages work the same, and the user can still watch it and take over in the live view [browser_headless]';
  if (c === 'substituted') return `the browser config asks for ${kindName(fact.fallback.wanted)}, which this machine does not have right now — this browser runs on ${kindName(fact.fallback.used)} instead [browser_display_substituted]`;
  if (c === 'recovered') return 'the desktop session is back — this browser runs in a window again [browser_headed_again]';
  return '';
}
/** One journal line for a launch's fact, or '' (nothing to say). */
function journalLine(fact, what) {
  const c = factCode(fact);
  if (c === 'hidden-window') return `${what}: no desktop session on this machine (${(fact.why || []).join('; ') || 'no display'}) — launched in a HIDDEN WINDOW (the browser CLI's own Xvfb, --ozone-platform=x11${fact.env && Object.keys(fact.env).length ? ', DISPLAY/WAYLAND_DISPLAY cleared' : ''})${fact.fallback.dropped && fact.fallback.dropped.length ? `; replaced ${fact.fallback.dropped.join(' ')}` : ''} (the user's config file is untouched)`;
  if (c === 'headless') return `${what}: no desktop session on this machine (${(fact.why || []).join('; ') || 'no display'}) — launched headless instead of the window its config asks for${fact.fallback.dropped && fact.fallback.dropped.length ? `; dropped ${fact.fallback.dropped.join(' ')}` : ''} (the user's config file is untouched)`;
  if (c === 'substituted') return `${what}: the config pins --ozone-platform=${fact.fallback.wanted}, which this machine does not have now — launched on ${fact.fallback.used} (${fact.socket || '?'})`;
  if (c === 'recovered') return `${what}: the desktop session is back (${kindName(fact.kind)} ${fact.name || ''}) — launched headed again`;
  return '';
}

module.exports = {
  DISPLAY_KINDS, X11_DIR, OZONE_PREFIX, DISPLAY_PLATFORMS,
  runtimeDirOf, parseX11Display, displayCandidates, displayVerdict,
  argsList, ozonePlatformsOf, ozoneOf, withoutDisplayOzone, withOzone,
  NO_DISPLAY_MODES, noDisplayModeOf, noDesktop, resolveHeaded, NO_DESKTOP_WINDOW_DEFAULT,
  wantedOf, launchPlan, applyPlan, displayFact, planApplies, planForFact, factCode, kindName, agentNote, journalLine,
};
