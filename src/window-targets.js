'use strict';
/**
 * WINDOW TARGETS — the machine FACTS and ACTS behind `vibespace-window`
 * (docs/design-agent-browser-v2 §4.9 / §5.1.1 / §6.6; phase P9, first half,
 * 2026-09-21). SHARED tier: node builtins + src/desktop-display.js, so the
 * daemon can bundle it; `hostId` stays a PARAMETER (every entry point that
 * touches a display goes through desktop-display's `assertLocal` — v1 is
 * local-only and REFUSES another host by name, never a silent fallback).
 *
 * THE ONE DESIGN RULE THIS FILE ENCODES: an agent talks to the TREE, and to
 * pixels only when the tree cannot answer (D28). AT-SPI2 is the native
 * window's DOM: `snapshot` mints `@eN` refs from it exactly as agent-browser
 * mints `@e3`, `click @ref` is `Action.do_action` on THAT node — never a
 * coordinate click in disguise (a node without `Action` is REFUSED by name,
 * `node_has_no_action`, whatever injection backend exists — that degrade
 * would let the refused channel back in while the agent believes it is on
 * the tree) — and the two verbs that only exist as INJECTION (`key`, `click
 * --at`) are gated per verb by a RUNTIME probe of the backends, never by a
 * platform name (§5.1.1's table: the box this was measured on is a Wayland
 * session where XTEST works on Xwayland clients, the portal is present and
 * uinput is not).
 *
 * THE TRAVERSAL NEVER RUNS ON THIS PROCESS'S EVENT LOOP. Every AT-SPI call is
 * one D-Bus round trip and an application that stops answering its a11y bus
 * hangs each call to libdbus's default 25 s — the exact shape of the
 * incidents behind "never block the event loop". `runHelper` spawns
 * src/window-targets-helper.py (python3 + GObject introspection = libatspi)
 * with the request on stdin, a WALL deadline enforced here with SIGKILL, and
 * inside it a PER-CALL timeout (`Atspi.set_timeout`) + a NODE BUDGET; a node
 * that does not answer is reported as an unreadable subtree, not a stall.
 *
 * WHY THIS BINDING (§12.33, measured 2026-09-21 on this box — Ubuntu, GNOME
 * Shell 50.1, at-spi2 2.60.4, python 3.14, node 24): no maintained node
 * AT-SPI binding exists (npm: `@girs/atspi-2.0` / `@gi-types/atspi*` are
 * GJS typings, `@girs/node-atspi-2.0` typings for the native node-gtk,
 * `dbus-next` untouched since 2022-04); the per-node cost is NOT what decides
 * it — a cold walk costs the same order both ways (libatspi via GI: 600
 * gnome-shell nodes in 111–248 ms = 2,400–5,400 nodes/s, an Electron tree of
 * 357 nodes in 78–81 ms; raw D-Bus with no cache, up to 6 calls per node
 * through Gio: 0.34–0.51 ms/node = 1,970–2,900 nodes/s) — what decides it is that the
 * subprocess boundary is REQUIRED anyway, so the helper's fork tax is paid
 * once per traversal (62–70 ms spawn→reply from a 47 MB node, plus the
 * parent's RSS-proportional fork cost, §1.6), never per node.
 *
 * Refusals are TYPED `{ok:false, code, why}` from a closed set (REFUSALS).
 */
const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');
const display = require('./desktop-display');

const HELPER_FILE = 'window-targets-helper.py';
const HELPER_PATH = path.join(__dirname, HELPER_FILE);

/** The traversal's numbers — ONE home. `NODE_BUDGET` is the per-snapshot
 *  ceiling an agent gets by default (§4.9 measured 600 nodes ≈ 0.1–0.33 s),
 *  `SNAPSHOT_MAX_BUDGET` the most it may ask for, `CALL_TIMEOUT_MS` libatspi's
 *  per-method-call timeout inside the helper, `WALL_MS` the parent's SIGKILL
 *  deadline for a snapshot (an unresponsive app costs CALL_TIMEOUT_MS per node
 *  it owns — 600 × 0.8 s would be 8 minutes, so the wall is what bounds it),
 *  `ACT_WALL_MS` the same for one action, `PROBE_MEMO_MS` how long a YES from
 *  the a11y / input-backend probes is remembered. */
const TRAVERSAL_LIMITS = Object.freeze({
  NODE_BUDGET: 600, SNAPSHOT_MAX_BUDGET: 3000, CALL_TIMEOUT_MS: 800, WALL_MS: 20000, ACT_WALL_MS: 8000, PROBE_MEMO_MS: 60000,
  HELPER_STDOUT_MAX: 16 * 1024 * 1024, MAX_DEPTH: 40,
});

/** Every code this module can answer with (routes map them to statuses; the
 *  CLI spells them). A code outside this set is a bug the suite catches. */
const REFUSALS = Object.freeze([
  'helper_missing', 'python3_missing', 'helper_timeout', 'helper_error', 'a11y_unavailable',
  'node_has_no_action', 'node_not_editable', 'action_unknown', 'action_failed', 'action_refused', 'ref_stale', 'ref_unreadable', 'ref_unknown', 'app_gone',
  'no_injection_backend', 'bad_chord', 'bad-request', 'screenshot_unavailable', 'screenshot_failed', 'inject_failed',
]);
const refuse = (code, why, extra = {}) => {
  if (!REFUSALS.includes(code)) throw new Error(`window-targets: unknown refusal code ${code}`);
  return { ok: false, code, why, ...extra };
};

// ── the bounded subprocess ───────────────────────────────────────────────────
/**
 * Run ONE helper request in a child process. Resolves to the helper's reply
 * (always an object with `ok`), or a typed refusal when the child could not be
 * run, answered nothing parseable, or outlived `wallMs` (SIGKILLed — the reply
 * says how long it ran). `env` is the caller's sanitised env (never
 * process.env by default in production: the engine hands agentEnv + x11Env);
 * `python` and `helper` are injectable for the suite.
 */
function runHelper(req, { env = process.env, wallMs = TRAVERSAL_LIMITS.WALL_MS, python = 'python3', helper = HELPER_PATH, now = Date.now } = {}) {
  return new Promise((resolve) => {
    if (!helper || !fs.existsSync(helper)) return resolve(refuse('helper_missing', `${helper || HELPER_FILE} is not on disk — window targets are local to a checkout that ships it`));
    const t0 = now();
    let child;
    try { child = spawn(python, [helper], { env, stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch (e) { return resolve(refuse('python3_missing', `${python} could not be spawned: ${e.message}`)); }
    let out = '', err = '', done = false, killed = false;
    const finish = (v) => { if (done) return; done = true; clearTimeout(timer); resolve(v); };
    const timer = setTimeout(() => { killed = true; try { child.kill('SIGKILL'); } catch { /* gone */ } }, wallMs);
    child.on('error', (e) => { // for LIFE (desktop-display's r2 rule): a later error is a refusal or a log line, never a crash
      if (e && e.code === 'ENOENT') finish(refuse('python3_missing', `${python} is not on PATH — the AT-SPI helper needs python3 with GObject introspection (python3-gi + gir1.2-atspi-2.0)`));
      else finish(refuse('helper_error', `helper process error: ${e && e.message}`));
    });
    child.stdout.on('data', (d) => { if (out.length < TRAVERSAL_LIMITS.HELPER_STDOUT_MAX) out += d; });
    child.stderr.on('data', (d) => { err = (err + d).slice(-4000); });
    child.on('close', (code, signal) => {
      const ms = now() - t0;
      if (killed) return finish(refuse('helper_timeout', `the traversal did not finish within ${wallMs} ms (killed after ${ms} ms) — an application on this display is not answering its accessibility bus`, { ms }));
      const line = out.trim().split('\n').filter(Boolean).pop() || '';
      let reply = null;
      try { reply = JSON.parse(line); } catch { reply = null; }
      if (!reply || typeof reply !== 'object' || typeof reply.ok !== 'boolean') {
        return finish(refuse('helper_error', `the helper answered nothing parseable (exit ${signal || code})${err ? ': ' + err.trim().split('\n').slice(-3).join(' | ') : ''}`, { ms }));
      }
      if (reply.ok === false && reply.code && !REFUSALS.includes(reply.code)) reply = { ...reply, code: 'helper_error', helperCode: reply.code };
      finish({ ...reply, ms: reply.ms ?? ms, wallMs: ms });
    });
    child.stdin.on('error', () => { /* the child exited before reading — its close handler answers */ });
    child.stdin.end(JSON.stringify(req));
  });
}

// ── probes (runtime, memoised YES) ───────────────────────────────────────────
const _memo = new Map();
function memoGet(key, now) { const m = _memo.get(key); return m && m.until > now() ? m.value : null; }
function memoSet(key, value, ms, now) { _memo.set(key, { value, until: now() + ms }); return value; }
function resetProbeMemo() { _memo.clear(); }

/** Is AT-SPI reachable from here (the helper + its binding + the a11y bus)?
 *  `{ok, apps, why}`; a YES is remembered PROBE_MEMO_MS, a NO is re-asked. */
async function probeA11y({ env = process.env, now = Date.now, ...rest } = {}) {
  const hit = memoGet('a11y', now);
  if (hit) return hit;
  const r = await runHelper({ op: 'probe' }, { env, wallMs: 8000, now, ...rest });
  if (!r.ok) return { ok: false, apps: 0, why: `${r.code}: ${r.why}`, code: r.code };
  return memoSet('a11y', { ok: true, apps: r.apps, why: null, sessionBus: r.sessionBus, ms: r.ms }, TRAVERSAL_LIMITS.PROBE_MEMO_MS, now);
}

function run(bin, args, { env, timeout = 3000 } = {}) {
  return new Promise((resolve) => execFile(bin, args, { env, timeout, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8' }, (err, stdout) => resolve({ err, stdout: String(stdout || '') })));
}

/**
 * The INPUT-BACKEND ladder, probed at runtime (§4.9 conclusion 2: availability
 * is never inferred from a platform name). Rows: xtest (xdotool on OUR
 * display — the only rung wired in this version), portal (the RemoteDesktop
 * portal on the session bus: present ⇒ `available:'consent'` — the user's
 * click, D29 (a), NOT wired yet), uinput (/dev/uinput writable — D29 (b),
 * explicitly not recommended, not wired). `injection` is the first row that is
 * both available AND wired, or null. `ours` says whether the display is one
 * VibeSpace started (D27 (a)); a foreign display gets no injection at all.
 */
async function probeInputBackends({ env = process.env, bins = null, ours = true, now = Date.now, procRoot = '', hostId = null } = {}) {
  display.assertLocal(hostId, 'probeInputBackends');
  const b = bins || { xdotool: display.binOnPath('xdotool', { env, now }), gdbus: display.binOnPath('gdbus', { env, now }) };
  const rows = [];
  rows.push(!b.xdotool ? { backend: 'xtest', available: false, wired: true, why: 'xdotool not on PATH' }
    : !ours ? { backend: 'xtest', available: false, wired: true, why: 'the display is not one VibeSpace started — only our own windows are addressable (D27 (a))' }
      : { backend: 'xtest', available: true, wired: true, why: null, bin: b.xdotool });
  // portal: present on the session bus?
  let portal = memoGet('portal', now);
  if (!portal) {
    if (!env.DBUS_SESSION_BUS_ADDRESS) portal = { backend: 'portal', available: false, wired: false, why: 'no session bus in the environment (DBUS_SESSION_BUS_ADDRESS unset)' };
    else if (!b.gdbus) portal = { backend: 'portal', available: false, wired: false, why: 'gdbus not on PATH (cannot ask the session bus for org.freedesktop.portal.Desktop)' };
    else {
      const r = await run(b.gdbus, ['introspect', '--session', '--dest', 'org.freedesktop.portal.Desktop', '--object-path', '/org/freedesktop/portal/desktop'], { env, timeout: 4000 });
      portal = r.err ? { backend: 'portal', available: false, wired: false, why: `the desktop portal did not answer: ${r.err.message.split('\n')[0]}` }
        : !/org\.freedesktop\.portal\.RemoteDesktop/.test(r.stdout) ? { backend: 'portal', available: false, wired: false, why: 'the desktop portal has no RemoteDesktop interface' }
          : { backend: 'portal', available: 'consent', wired: false, why: 'RemoteDesktop portal present — every session needs the user\'s consent click (persist_mode=2 + restore_token remembers it); not wired in this version (D29 (a))' };
    }
    if (portal.available) memoSet('portal', portal, TRAVERSAL_LIMITS.PROBE_MEMO_MS, now);
  }
  rows.push(portal);
  // uinput: a writable device node
  let uinput;
  try { fs.accessSync(`${procRoot}/dev/uinput`, fs.constants.W_OK); uinput = { backend: 'uinput', available: true, wired: false, why: '/dev/uinput is writable but ydotool/uinput is not wired (D29 (b): a device that synthesises global input is a larger grant than this feature)' }; }
  catch (e) { uinput = { backend: 'uinput', available: false, wired: false, why: e && e.code === 'ENOENT' ? '/dev/uinput absent (module not loaded)' : '/dev/uinput not writable by this user' }; }
  rows.push(uinput);
  const injection = rows.find((r) => r.available === true && r.wired) || null;
  return { rows, injection, ours };
}

/** P10 (§4.9 column 2): is the ScreenCast portal on the session bus, and does
 *  it offer WINDOW sources? Read-only (two property Gets); a YES is memoised
 *  PROBE_MEMO_MS. `{screenCast, version, windowSources, why}`. Nothing here
 *  starts a session or raises the consent dialog — that is the user's click. */
async function probeScreenCastPortal({ env = process.env, bins = null, now = Date.now } = {}) {
  const hit = memoGet('screencast', now);
  if (hit) return hit;
  const gdbus = bins && bins.gdbus !== undefined ? bins.gdbus : display.binOnPath('gdbus', { env, now });
  if (!env.DBUS_SESSION_BUS_ADDRESS) return { screenCast: false, version: null, windowSources: false, why: 'no session bus in the environment (DBUS_SESSION_BUS_ADDRESS unset)' };
  if (!gdbus) return { screenCast: false, version: null, windowSources: false, why: 'gdbus not on PATH' };
  const get = (prop) => run(gdbus, ['call', '--session', '--dest', 'org.freedesktop.portal.Desktop', '--object-path', '/org/freedesktop/portal/desktop', '--method', 'org.freedesktop.DBus.Properties.Get', 'org.freedesktop.portal.ScreenCast', prop], { env, timeout: 4000 });
  const v = await get('version');
  if (v.err) return { screenCast: false, version: null, windowSources: false, why: `the desktop portal has no ScreenCast interface: ${v.err.message.split('\n')[0]}` };
  const st = await get('AvailableSourceTypes');
  const version = Number((/uint32 (\d+)/.exec(v.stdout) || [])[1]) || null;
  const types = Number((/uint32 (\d+)/.exec(st.stdout) || [])[1]) || 0;
  return memoSet('screencast', { screenCast: true, version, windowSources: !!(types & 2), types, why: null }, TRAVERSAL_LIMITS.PROBE_MEMO_MS, now);
}

// ── PURE verdicts ────────────────────────────────────────────────────────────
/** §5.1.1's capability table, per VERB. `click`/`type` ride the tree and are
 *  decided per NODE at act time (never here); `key` and `click-at` exist only
 *  as injection and are refused with the probe when no wired backend is
 *  available; `snapshot` needs the a11y probe, `screenshot` our display. */
function verbVerdicts({ a11y = { ok: true }, backends = { rows: [], injection: null, ours: true } } = {}) {
  const inj = backends.injection;
  const probeText = (backends.rows || []).map((r) => `${r.backend}: ${r.available === true ? (r.wired ? 'available' : 'present, not wired') : r.available === 'consent' ? 'needs the user\'s consent, not wired' : 'unavailable'}${r.why ? ' — ' + r.why : ''}`).join('; ');
  const injectWhy = inj ? null : `no injection backend on this display (${probeText || 'no rows'})`;
  return {
    snapshot: { via: 'tree', ok: !!a11y.ok, why: a11y.ok ? null : `accessibility tree unreachable: ${a11y.why}` },
    screenshot: { via: 'pixels', ok: !!backends.ours, why: backends.ours ? null : 'pixels are read only from a display VibeSpace started (D27 (a))' },
    click: { via: 'tree', ok: !!a11y.ok, why: a11y.ok ? null : `accessibility tree unreachable: ${a11y.why}`, note: 'per node — only a node that exports Action; a node without one is refused, never degraded to a coordinate click' },
    type: { via: 'tree', ok: !!a11y.ok, why: a11y.ok ? null : `accessibility tree unreachable: ${a11y.why}`, note: 'per node — only a node that exports EditableText' },
    key: { via: 'inject', ok: !!inj, backend: inj ? inj.backend : null, why: injectWhy, note: 'a chord has no road on the tree (AT-SPI names no chord); injection only' },
    'click-at': { via: 'inject', ok: !!inj, backend: inj ? inj.backend : null, why: injectWhy, note: 'a point is injection by definition; audited by:point' },
    probe: probeText,
  };
}

/** The chord vocabulary is CLOSED: modifiers + one key, spelled for xdotool.
 *  Anything else is `bad_chord` (the string reaches an argv, so it is never
 *  passed through). */
const MODS = Object.freeze({ ctrl: 'ctrl', control: 'ctrl', alt: 'alt', shift: 'shift', super: 'super', meta: 'meta', cmd: 'super', win: 'super' });
const NAMED_KEYS = Object.freeze({
  return: 'Return', enter: 'Return', tab: 'Tab', escape: 'Escape', esc: 'Escape', space: 'space', backspace: 'BackSpace', delete: 'Delete', del: 'Delete',
  up: 'Up', down: 'Down', left: 'Left', right: 'Right', home: 'Home', end: 'End', pageup: 'Page_Up', page_up: 'Page_Up', pagedown: 'Page_Down', page_down: 'Page_Down',
  insert: 'Insert', minus: 'minus', plus: 'plus', equal: 'equal', comma: 'comma', period: 'period', slash: 'slash', f1: 'F1', f2: 'F2', f3: 'F3', f4: 'F4', f5: 'F5', f6: 'F6', f7: 'F7', f8: 'F8', f9: 'F9', f10: 'F10', f11: 'F11', f12: 'F12',
});
function parseChord(input) {
  const s = String(input || '').trim();
  if (!s || s.length > 40) return refuse('bad_chord', 'a chord is `[mod+…]key`, e.g. ctrl+s, alt+F4, Return');
  // "ctrl++" = ctrl and the plus key; a trailing single '+' ("ctrl+") is an empty key and refused
  const parts = (s.endsWith('++') ? [...s.slice(0, -2).split('+'), 'plus'] : s.split('+')).map((p) => p.trim());
  if (parts.some((p) => !p)) return refuse('bad_chord', `${JSON.stringify(s)}: an empty token — a chord is \`[mod+…]key\``);
  if (!parts.length || parts.length > 4) return refuse('bad_chord', `${JSON.stringify(s)}: one key with up to three modifiers`);
  const mods = [];
  for (const m of parts.slice(0, -1)) {
    const k = MODS[m.toLowerCase()];
    if (!k) return refuse('bad_chord', `${JSON.stringify(m)} is not a modifier (ctrl, alt, shift, super, meta)`);
    if (!mods.includes(k)) mods.push(k);
  }
  const last = parts[parts.length - 1];
  let key = null;
  if (/^[a-zA-Z0-9]$/.test(last)) key = last.toLowerCase();
  else if (NAMED_KEYS[last.toLowerCase()]) key = NAMED_KEYS[last.toLowerCase()];
  if (!key) return refuse('bad_chord', `${JSON.stringify(last)} is not a key: a letter, a digit or one of ${Object.keys(NAMED_KEYS).join(' ')}`);
  return { ok: true, xdotool: [...mods, key].join('+'), mods, key, hasModifier: mods.length > 0 };
}

/** Which of a node's self-declared actions a bare `click` means. The order is
 *  a preference over the names measured on GTK / Chromium / gnome-shell
 *  (`click`, `press`, `activate`, `doDefault`, …); `showContextMenu` and
 *  `clickAncestor` (Chromium puts both on EVERY node) are never picked unless
 *  named. Returns `{index, name}` or a `action_unknown` refusal. */
const ACTION_PREFERENCE = Object.freeze(['click', 'press', 'activate', 'doDefault', 'jump', 'open', 'toggle', 'check', 'uncheck', 'expand or contract', 'expand', 'collapse', 'select', 'menu', 'edit']);
const NEVER_BY_DEFAULT = new Set(['showContextMenu', 'clickAncestor', 'scrollBackward', 'scrollForward', 'scrollUp', 'scrollDown', 'scrollLeft', 'scrollRight']);
function pickAction(actions, want = null) {
  const list = Array.isArray(actions) ? actions.map((a) => String(a ?? '')) : [];
  if (!list.length) return refuse('node_has_no_action', 'the node declares no actions');
  if (want != null && want !== '') {
    if (/^\d+$/.test(String(want))) { const i = Number(want); return i < list.length ? { ok: true, index: i, name: list[i] } : refuse('action_unknown', `the node has ${list.length} action(s) — index ${i} does not exist`); }
    const i = list.indexOf(String(want));
    return i >= 0 ? { ok: true, index: i, name: list[i] } : refuse('action_unknown', `the node has actions ${JSON.stringify(list)}, not ${JSON.stringify(String(want))}`);
  }
  for (const pref of ACTION_PREFERENCE) { const i = list.indexOf(pref); if (i >= 0) return { ok: true, index: i, name: pref }; }
  const i = list.findIndex((a) => a && !NEVER_BY_DEFAULT.has(a));
  if (i >= 0) return { ok: true, index: i, name: list[i] };
  return refuse('action_unknown', `the node's only actions are ${JSON.stringify(list)} — name one with --action`);
}

/** `@ref` → the node's identity as the helper needs it back. */
function refTableOf(snapshot) {
  const t = new Map();
  for (const n of (snapshot && snapshot.nodes) || []) t.set(n.ref, { ref: n.ref, pid: n.pid, path: n.path, role: n.role, name: n.name, bounds: n.bounds || null, actions: n.actions || null, editable: !!n.editable, iface: n.iface || [] });
  return t;
}
function resolveRef(table, ref) {
  const r = String(ref || '').trim();
  if (!/^@e\d+$/.test(r)) return refuse('ref_unknown', `${JSON.stringify(r)} is not a ref — refs look like @e7 and come from the last snapshot`);
  const e = table && table.get(r);
  return e ? { ok: true, entry: e } : refuse('ref_unknown', `${r} is not in the last snapshot of this window — take a new snapshot`);
}

/** The rows `list` shows (D27 (a): VibeSpace-launched windows only — the
 *  keeper's live records ARE the set; nothing on the user's desktop is
 *  enumerated). `a11yPids` = the pids on the a11y bus, so a row can say
 *  whether its tree is readable before anybody attaches. */
function targetRows(apps, { a11yApps = [], sessionPids = null } = {}) {
  const byPid = new Map((a11yApps || []).filter((a) => a && a.pid != null).map((a) => [a.pid, a]));
  const rows = [];
  for (const rec of apps || []) {
    if (!rec || !['launching', 'ready'].includes(rec.state)) continue;
    const pids = sessionPids ? sessionPids(rec) : Object.values(rec.pids || {}).filter(Boolean);
    const a11y = pids.map((p) => byPid.get(p)).find(Boolean) || null;
    rows.push({ handle: rec.id, label: rec.label, appId: rec.appId || null, exec: rec.exec, state: rec.state, display: rec.display, backend: rec.backend, origin: 'vibespace', startedAt: rec.startedAt,
      pids, a11y: a11y ? { pid: a11y.pid, name: a11y.name, children: a11y.children } : null });
  }
  return rows;
}

// ── acts (each bounded, each typed) ──────────────────────────────────────────
/** THE snapshot: the a11y tree of the applications whose pid ∈ `pids`, with
 *  `@eN` refs minted in visit order, the interface CENSUS the design asks every
 *  snapshot to report (§12.30: 66/503 and 6/43 are one desktop's numbers),
 *  the unreadable subtrees and the timing. */
async function snapshotTarget({ pids, budget = TRAVERSAL_LIMITS.NODE_BUDGET, callTimeoutMs = TRAVERSAL_LIMITS.CALL_TIMEOUT_MS, wallMs = TRAVERSAL_LIMITS.WALL_MS, text = true, maxDepth = TRAVERSAL_LIMITS.MAX_DEPTH, env = process.env, ...rest } = {}) {
  const b = Math.max(1, Math.min(TRAVERSAL_LIMITS.SNAPSHOT_MAX_BUDGET, Number(budget) || TRAVERSAL_LIMITS.NODE_BUDGET));
  const r = await runHelper({ op: 'snapshot', pids: (pids || []).map(Number), budget: b, callTimeoutMs, wallMs: Math.max(1000, wallMs - 500), maxDepth, text: !!text }, { env, wallMs, ...rest });
  if (!r.ok) return r;
  return { ok: true, snapshot: r, refs: refTableOf(r) };
}

/** Act on ONE node the last snapshot named. `verb` ∈ do_action | set_text |
 *  insert_text | read; the helper re-resolves the recorded path and refuses
 *  `ref_stale` when the node there is no longer the one the ref named. */
async function actOnNode({ entry, verb, action = null, text = '', callTimeoutMs = TRAVERSAL_LIMITS.CALL_TIMEOUT_MS, wallMs = TRAVERSAL_LIMITS.ACT_WALL_MS, env = process.env, ...rest } = {}) {
  if (!entry || !Number.isInteger(entry.pid) || !Array.isArray(entry.path)) return refuse('bad-request', 'actOnNode needs a ref entry (pid + path)');
  const req = { op: 'act', pid: entry.pid, path: entry.path, expect: { role: entry.role, name: entry.name }, verb, callTimeoutMs };
  if (verb === 'do_action') req.action = action == null ? 0 : action;
  if (verb === 'set_text' || verb === 'insert_text') req.text = String(text);
  return runHelper(req, { env, wallMs, ...rest });
}

/** The node holding keyboard focus in `pids` (the `type` verb's target when no
 *  ref was named) — `{ok, node|null}`. */
async function focusedNode({ pids, env = process.env, wallMs = TRAVERSAL_LIMITS.WALL_MS, ...rest } = {}) {
  return runHelper({ op: 'focused', pids: (pids || []).map(Number), budget: TRAVERSAL_LIMITS.NODE_BUDGET, callTimeoutMs: TRAVERSAL_LIMITS.CALL_TIMEOUT_MS, wallMs: Math.max(1000, wallMs - 500) }, { env, wallMs, ...rest });
}

/** Pixels of `bounds` (or the whole display) on the display named by `xenv`
 *  (desktop-display.x11Env) — the FALLBACK read. Writes `out` (PNG). */
async function screenshotDisplay({ xenv, out, bounds = null, wallMs = TRAVERSAL_LIMITS.ACT_WALL_MS, ...rest } = {}) {
  if (!xenv || !xenv.DISPLAY) return refuse('bad-request', 'screenshotDisplay needs an x11 env naming the display');
  return runHelper({ op: 'screenshot', out, bounds }, { env: xenv, wallMs, ...rest });
}

/** XTEST through xdotool on OUR display: the pointer is first moved to
 *  `focus` (a point inside the target window — a bare Xvfb has PointerRoot
 *  focus, so the key lands on the window under the pointer), then the chord.
 *  `chord` must come from parseChord (its argv is never the agent's string). */
async function injectKey({ bins, xenv, chord, focus = null, timeout = 5000 } = {}) {
  if (!bins || !bins.xdotool) return refuse('no_injection_backend', 'xdotool not on PATH');
  if (!chord || !chord.ok) return refuse('bad_chord', 'injectKey needs a parsed chord');
  const args = [];
  if (focus && Number.isFinite(focus.x) && Number.isFinite(focus.y)) args.push('mousemove', '--sync', String(Math.round(focus.x)), String(Math.round(focus.y)));
  args.push('key', '--clearmodifiers', chord.xdotool);
  const r = await run(bins.xdotool, args, { env: xenv, timeout });
  return r.err ? refuse('inject_failed', `xdotool key failed: ${r.err.message.split('\n')[0]}`) : { ok: true, did: { verb: 'key', chord: chord.xdotool, backend: 'xtest' } };
}
/** A coordinate click on OUR display (audited `by:'point'` by the caller). */
async function injectClick({ bins, xenv, x, y, button = 1, timeout = 5000 } = {}) {
  if (!bins || !bins.xdotool) return refuse('no_injection_backend', 'xdotool not on PATH');
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) return refuse('bad-request', '--at needs two non-negative integers x,y');
  const b = [1, 2, 3].includes(Number(button)) ? Number(button) : 1;
  const r = await run(bins.xdotool, ['mousemove', '--sync', String(Math.round(x)), String(Math.round(y)), 'click', String(b)], { env: xenv, timeout });
  return r.err ? refuse('inject_failed', `xdotool click failed: ${r.err.message.split('\n')[0]}`) : { ok: true, did: { verb: 'click', by: 'point', x: Math.round(x), y: Math.round(y), button: b, backend: 'xtest' } };
}

/** A snapshot's node list trimmed to what an agent reads (the path stays
 *  server-side with the ref table). */
function nodeView(n) {
  const v = { ref: n.ref, role: n.role, name: n.name, depth: n.depth };
  if (n.parent) v.parent = n.parent;
  if (n.bounds) v.bounds = n.bounds;
  if (n.actions) v.actions = n.actions;
  if (n.editable) v.editable = true;
  if (n.text != null && n.text !== '' && n.text !== n.name) v.text = n.text;
  const st = (n.states || []).filter((s) => ['focused', 'checked', 'selected', 'expanded', 'pressed', 'editable', 'focusable', 'visible', 'showing'].includes(s));
  if (st.length) v.states = st;
  return v;
}

module.exports = {
  HELPER_PATH, HELPER_FILE, TRAVERSAL_LIMITS, REFUSALS, refuse,
  runHelper, probeA11y, probeInputBackends, probeScreenCastPortal, resetProbeMemo,
  verbVerdicts, parseChord, pickAction, ACTION_PREFERENCE, NEVER_BY_DEFAULT, NAMED_KEYS, refTableOf, resolveRef, targetRows, nodeView,
  snapshotTarget, actOnNode, focusedNode, screenshotDisplay, injectKey, injectClick,
};
