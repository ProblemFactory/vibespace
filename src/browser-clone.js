'use strict';
/**
 * NEW PROFILE… COPIED FROM <profile> (lane browser-profile-clone, B-9669 — the owner 2026-10-08: "复制登录建新 profile 其实是
 * 可以做的，可能有点用"). PURE, imports nothing: the closed tables of what a copy leaves behind, the clone verdict and the
 * dialog's source rows. The copy itself runs in src/server/browser-clone-run.js (off the event loop); the keeper decides
 * (its `cloneProfile`), the dialog words it (src/lib/browser-new-profile-model.js).
 *
 * MEASURED 2026-10-08 (agent-browser 0.38.1 + Chrome 154.0.8037.57 on the dev box, a scratch HOME + private runtime dir, a
 * loopback login form; headless AND the hidden window): the CLI launches every Chrome with `--password-store=basic
 * --use-mock-keychain`, so its cookies are `v10` (Chrome's fixed Linux key) — also with an unlocked gnome-keyring on the
 * session bus and XDG_CURRENT_DESKTOP=GNOME. A stopped profile's directory copied whole (minus the tables below) signs the
 * copy in; the source stays signed in; both start. So no launch flag is ours to add, and no profile ever written through
 * the CLI holds keyring-encrypted cookies. macOS / Windows (a keychain / DPAPI key) were not measurable here ⇒ refused by name.
 */

/** The files a running Chrome (and the keeper reading its launch stamp) owns in a profile directory — never copied: a
 *  copied SingletonLock names the SOURCE's process, so the copy's first start would judge its own directory held. */
const CLONE_RUNTIME_NAMES = Object.freeze(['SingletonLock', 'SingletonSocket', 'SingletonCookie', 'DevToolsActivePort', 'lockfile', 'RunningChromeVersion']);
const CLONE_RUNTIME_SUFFIXES = Object.freeze(['.lock']);
/** Pure caches — Chrome rebuilds them; copying them is only bytes. `Service Worker` and `IndexedDB` are NOT here: sites
 *  keep sessions there. */
const CLONE_CACHE_NAMES = Object.freeze(['Cache', 'Code Cache', 'GPUCache', 'GPUPersistentCache', 'ShaderCache', 'GrShaderCache', 'DawnCache', 'DawnGraphiteCache', 'DawnWebGPUCache', 'component_crx_cache']);
const CLONE_CACHE_PREFIXES = Object.freeze(['optimization_guide_']);
/** What a site keeps a login in — copied (named here so a later table edit cannot drop one unseen). */
const CLONE_KEPT_NAMES = Object.freeze(['Cookies', 'Local State', 'Login Data', 'Local Storage', 'Session Storage', 'IndexedDB', 'Service Worker', 'Preferences']);
const CLONE_MAX_BYTES = 2 * 1024 * 1024 * 1024;
/** How long a just-stopped source's browser may take to exit before the copy is refused `source_still_running`. */
const CLONE_EXIT_WAIT_MS = 10000;
/** The platforms whose profile directories decrypt when copied (measured above); a paired machine on another one is said. */
const CLONE_PLATFORMS = Object.freeze(['linux']);

/** One directory entry's verdict: 'runtime' | 'cache' (left behind) | null (copied). A name at ANY depth. */
function cloneSkip(name) {
  const n = String(name || '');
  if (CLONE_KEPT_NAMES.includes(n)) return null;
  if (CLONE_RUNTIME_NAMES.includes(n) || CLONE_RUNTIME_SUFFIXES.some((s) => n.endsWith(s))) return 'runtime';
  if (CLONE_CACHE_NAMES.includes(n) || CLONE_CACHE_PREFIXES.some((p) => n.startsWith(p))) return 'cache';
  return null;
}

/** The STATE of one named profile as a copy source, for a new profile that will run on `host` (null = this machine):
 *  'stopped' | 'running' (no lease — stopped first) | 'leased' (an agent holds it) | 'other-machine' | 'no-folder' (a
 *  browser VibeSpace only connects to / runs at a vendor — it keeps no logins here). */
function sourceState({ profile = null, host = null, live = false, holders = [] } = {}) {
  const p = profile || {};
  if ((p.host || null) !== (host || null)) return 'other-machine';
  if (!p.dir && !p.host) return 'no-folder';
  if (Array.isArray(holders) && holders.length) return 'leased';
  return live ? 'running' : 'stopped';
}
const PICKABLE_SOURCE = Object.freeze(['stopped', 'running']);

/**
 * THE CLONE VERDICT, before anything is written. `platform` = the machine's (process.platform / the paired machine's);
 * `cloneOp` = may that machine copy (this machine: true; a paired machine: its agent's capability); `bytes` = the size
 * to copy (the tables' entries not counted), null = not measured yet. → `{ok: true, stopFirst}` | `{ok: false, code,
 * error, holders?, bytes?}`.
 */
function cloneVerdict({ source = null, host = null, live = false, holders = [], platform = 'linux', cloneOp = true, bytes = null, maxBytes = CLONE_MAX_BYTES } = {}) {
  if (!source) return { ok: false, code: 'source_not_found', error: 'the profile to copy from does not exist any more' };
  const label = JSON.stringify(String(source.label || source.id || ''));
  if (!CLONE_PLATFORMS.includes(String(platform || ''))) return { ok: false, code: 'clone_unsupported_platform', error: `logins can be copied only on Linux — ${host || 'this machine'} runs ${platform}` };
  const st = sourceState({ profile: source, host, live, holders });
  if (st === 'other-machine') return { ok: false, code: 'source_same_machine_only', error: `${label} runs on ${source.host || 'this computer'} — a copy is made on the machine the profile runs on` };
  if (!cloneOp) return { ok: false, code: 'clone_agent_too_old', error: `the VibeSpace agent on ${host} cannot copy a profile — update it` };
  if (st === 'no-folder') return { ok: false, code: 'source_no_folder', error: `${label} keeps no browser folder here — nothing to copy` };
  if (st === 'leased') return { ok: false, code: 'source_leased', error: `${label} is in use by ${holders.map((h) => (h && (h.name || h.sessionId || h.browserKey)) || '?').join(', ')} — end that use first`, holders: holders.slice() };
  if (bytes != null && Number(bytes) > maxBytes) return { ok: false, code: 'clone_too_big', error: `${label} holds ${Number(bytes)} bytes to copy — more than the ${maxBytes} a copy may be`, bytes: Number(bytes) };
  return { ok: true, stopFirst: st === 'running' };
}

/** The dialog's source rows: every NAMED profile on `host`'s machine, with its state (never hidden). `liveOf(id)` /
 *  `holdersOf(id)` = the keeper's facts. → `[{id, label, state, pickable, holders, provider}]`. */
function sourceRows({ profiles = [], host = null, liveOf = () => false, holdersOf = () => [] } = {}) {
  const out = [];
  for (const p of Array.isArray(profiles) ? profiles : []) {
    if (!p || !p.id || (p.host || null) !== (host || null)) continue;
    const holders = holdersOf(p.id) || [];
    const state = sourceState({ profile: p, host, live: !!liveOf(p.id), holders });
    out.push({ id: p.id, label: String(p.label || p.id), state, pickable: PICKABLE_SOURCE.includes(state), holders, provider: p.provider || 'chromium' });
  }
  return out;
}

/** What the NEW record carries: the source's provider and build (a directory is bound to the Chrome that wrote it) — never
 *  its who-may-use list, pins, leases or notes (the dialog's own rows apply) — and `clonedFrom`. */
function cloneInput(input = {}, source = {}, at = 0) {
  const out = { ...input, provider: source.provider || 'chromium' };
  delete out.cloneFrom; delete out.host;
  if (source.browser && input.browser == null) out.browser = { ...source.browser };
  if (source.host) out.host = source.host;
  return { input: out, clonedFrom: { id: String(source.id), label: String(source.label || source.id), at: Number(at) || 0 } };
}

module.exports = {
  CLONE_RUNTIME_NAMES, CLONE_RUNTIME_SUFFIXES, CLONE_CACHE_NAMES, CLONE_CACHE_PREFIXES, CLONE_KEPT_NAMES, CLONE_MAX_BYTES, CLONE_EXIT_WAIT_MS,
  CLONE_PLATFORMS, PICKABLE_SOURCE, cloneSkip, sourceState, cloneVerdict, sourceRows, cloneInput,
};
