// WINDOW TYPE REGISTRY (Plugin Ph1, docs/design-harness-plugins.md §3.2
// `windows[]` — "TYPE_ICONS + replayOpenSpec: switch → 注册表, 加 default 响亮").
//
// Before this module a window KIND existed in three compile-time places at
// once: the TYPE_ICONS literal in tab-group.js, a `case` in the 17-way
// `switch (spec.action)` of session-lifecycle's replayOpenSpec (which had NO
// default — an unknown action fell through and the window silently vanished
// on refresh / on every other client), and a TRANSIENT_WINDOW_TYPES set in
// layout.js. Now the module that OWNS a window registers it once and the
// three readers are views over this registry:
//   • windowTypeIcon(type) / TYPE_ICONS      ← title bar, tab bar, taskbar, switcher
//   • replayOpenSpec(app, spec, opts)        ← layout restore, cross-client sync, desktops, stage
//   • isTransientWindowType(type)            ← layout.js captureState breadcrumb exemption
//
// DOM-FREE AT IMPORT (node-importable — scripts/test-window-types.mjs imports
// it directly): no document/window access outside functions, and the only
// import is telemetry-client (itself DOM-free at import). Core dogfoods the
// API at module load: every one of the 15 shipped window kinds and 17 openSpec
// actions is a registration in its owning module — the test pins the exact
// sets so a kind added without registering is red, not silent.
import { track } from './telemetry-client.js';

const TYPES = new Map();   // type   → { type, icon, label, persist, singleton }
const ACTIONS = new Map(); // action → { action, type, replay }

/** Compatibility VIEW for pre-registry importers (tab-group.js re-exports it):
 *  a live plain object mirroring `type → icon`. Registration writes it; never
 *  write it directly. Null-prototype so a stray type name can't read
 *  Object.prototype members as an "icon". */
export const TYPE_ICONS = Object.create(null);

/** The 16×16 stroke-icon wrapper every core window icon used (the former `_i`
 *  helper in tab-group.js) — byte-identical markup, exported so owning modules
 *  register their icon with the same chrome. */
export const svgIcon16 = (d) => `<svg style="width:1em;height:1em;vertical-align:-0.1em" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

/**
 * Register a window kind.
 *   type       — the `type` passed to wm.createWindow (unique; the TYPE_ICONS key)
 *   icon       — inline SVG string ('' = no icon, e.g. usage/jobs today)
 *   label      — English display name (NOT wrapped in t() here — wrap at render time;
 *                nothing renders it yet, it is manifest metadata for the Ph2 loader)
 *   persist    — default true: the window is recreated from its openSpec (layout
 *                restore / cross-client sync) and captureState breadcrumbs a
 *                missing spec. false = NOT restored from a spec: chat/terminal
 *                restore by session identity and receive their spec async after
 *                'created'; stage-placeholder never enters a desktop record.
 *                (This is layout.js's former TRANSIENT_WINDOW_TYPES set.)
 *   singleton  — declared: at most one window of this kind per client (the core
 *                openers implement their own focus-existing guard; the Ph2
 *                loader applies one generically to plugin windows)
 *   action + replay(app, spec, opts) — single-action shorthand: the openSpec
 *                action this kind replays and the function that recreates the
 *                window from a serialized spec (opts = { syncId }); returns what
 *                the opener returns (usually winInfo) or null/undefined
 *   actions    — multi-action form: { [action]: replay } for kinds that host
 *                several openSpec actions (chat: attachSession/viewSession/
 *                viewSubagent). Actions owned by ANOTHER module go through
 *                registerOpenAction (task: openTaskLog, openSessionProps).
 * Throws on a duplicate type or a malformed record — a registration bug must
 * fail at module load (caught by every gate), never at replay time.
 */
export function registerWindowType({ type, icon = '', label = '', persist = true, singleton = false, action, actions, replay } = {}) {
  if (typeof type !== 'string' || !type) throw new Error('registerWindowType: `type` (non-empty string) is required');
  if (TYPES.has(type)) throw new Error(`registerWindowType: duplicate window type '${type}'`);
  if (typeof icon !== 'string') throw new Error(`registerWindowType ${type}: \`icon\` must be an SVG string`);
  if (replay !== undefined && !action) throw new Error(`registerWindowType ${type}: \`replay\` needs an \`action\` name`);
  if (action !== undefined && typeof replay !== 'function') throw new Error(`registerWindowType ${type}: \`action\` needs a \`replay\` function`);
  const rec = { type, icon, label: String(label || ''), persist: persist !== false, singleton: !!singleton };
  TYPES.set(type, rec);
  TYPE_ICONS[type] = icon;
  try {
    if (action) registerOpenAction({ action, type, replay });
    for (const [a, fn] of Object.entries(actions || {})) registerOpenAction({ action: a, type, replay: fn });
  } catch (e) {
    TYPES.delete(type); delete TYPE_ICONS[type]; // atomic: a bad action list leaves no half-registered type
    throw e;
  }
  return getWindowType(type);
}

/**
 * Register one openSpec action → replay for a window kind, from a module that
 * does not own the kind's registration (task-log/session-props both open a
 * 'task'-kind window). `type` is which window kind the action opens (checked
 * lazily — module evaluation order between owners is not a contract).
 */
export function registerOpenAction({ action, type, replay } = {}) {
  if (typeof action !== 'string' || !action) throw new Error('registerOpenAction: `action` (non-empty string) is required');
  if (typeof type !== 'string' || !type) throw new Error(`registerOpenAction ${action}: \`type\` is required`);
  if (typeof replay !== 'function') throw new Error(`registerOpenAction ${action}: \`replay\` must be a function`);
  if (ACTIONS.has(action)) throw new Error(`registerOpenAction: duplicate openSpec action '${action}' (already registered for type '${ACTIONS.get(action).type}')`);
  ACTIONS.set(action, { action, type, replay });
  return { action, type };
}

/** Registered record for a window kind (+ the actions that open it), or null. */
export function getWindowType(type) {
  const rec = TYPES.get(type);
  if (!rec) return null;
  const actions = [];
  for (const a of ACTIONS.values()) if (a.type === type) actions.push(a.action);
  return { ...rec, actions };
}

/** The action record { action, type, replay } or null. */
export function getOpenAction(action) { return ACTIONS.get(action) || null; }

/** Icon SVG for a window kind ('' when unregistered or icon-less — the exact
 *  value the pre-registry `TYPE_ICONS[type] || ''` reads produced). */
export function windowTypeIcon(type) { return TYPES.get(type)?.icon || ''; }

/** layout.js captureState exemption: kinds that legitimately carry no openSpec. */
export function isTransientWindowType(type) { return TYPES.get(type)?.persist === false; }

export function listWindowTypes() { return [...TYPES.keys()]; }
export function listOpenActions() { return [...ACTIONS.keys()]; }

/**
 * Recreate a window from a serialized openSpec by dispatching on spec.action.
 * Returns the owning replay's result (winInfo for most openers) or null when
 * nothing was replayed. An UNKNOWN action is LOUD — console.warn + an
 * 'openspec-unknown' telemetry event (Diagnostics) — and returns null; the
 * pre-registry switch had no default, so a spec nobody could replay simply
 * vanished (the window was gone on refresh and on every other client, with
 * no trace anywhere). Peer-controlled string (layout-sync from another
 * client): names only, capped, never rendered as HTML.
 */
export function replayOpenSpec(app, spec, opts = {}) {
  const action = spec?.action;
  const entry = typeof action === 'string' ? ACTIONS.get(action) : null;
  if (!entry) {
    const what = action == null ? '(missing)' : String(action).slice(0, 60);
    try { console.warn(`[window-types] unknown openSpec action ${what} — window not replayed; registered: ${listOpenActions().join(', ')}`, spec); } catch {}
    try { track('event', 'openspec-unknown', what); } catch {}
    return null;
  }
  const r = entry.replay(app, spec, opts || {});
  return r === undefined ? null : r;
}
