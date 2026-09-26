// THE PER-APP CHOICES IN USER STATE — ONE loader (lane D, 2026-09-25; lane B's `desktopAppFrame` loader generalized, moved
// here out of desktop-app-window.js so the launch dialog shares it): `desktopAppFrame` (Show window frame ▸, lane B) and
// `desktopAppScale` (the app's default scale, lane D) — per-APP maps keyed by the registry app id / `exec:<basename>`.
// Read once per page AND AGAIN ON EVERY RECONNECT (a broadcast sent while this client's socket was down never arrives —
// the rule desktop-app-window.js applies to its record), kept in step by the `user-state-updated` broadcast. A write is an
// EDIT of ONE app's entry, never a whole map: shown locally FIRST (every surface re-reads at once, never waiting for the
// echo), then applied to the map the server holds NOW (a fresh GET) and PATCHed merge-only as that one top-level key — so
// a map this page missed a broadcast of can never travel whole over another client's choices (lane D verify, the minor:
// B dropped its socket, A stored xterm 2×, B stored the calculator 1.5× from its stale copy ⇒ A's xterm gone). A refused
// save rolls the local view back to the server's map and toasts; never silent.
// Residual (documented): two clients editing in the same GET→PATCH window (tens of ms) are last-write-wins for the map.
import { t } from './i18n.js';
import { fetchJson, showToast } from './utils.js';

/** The per-app maps this loader holds. */
export const APP_PREF_KEYS = Object.freeze(['desktopAppFrame', 'desktopAppScale']);
const asMap = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? { ...v } : {});
const okState = (st) => !!st && typeof st === 'object' && !Array.isArray(st) && !st.error;

/** The loader as a factory — the page's singleton is below; a suite builds its own over a fake socket + fetch.
 *  `fetchJson(url, opts)` never throws (null on a network failure, `{error}` bodies as data); `toast(text, opts)`;
 *  `failDefault()` = the refusal's words when the caller named none. */
export function createAppPrefs({ fetchJson: fj, toast, failDefault = () => 'Could not save the choice' }) {
  const base = Object.fromEntries(APP_PREF_KEYS.map((k) => [k, null]));    // the server's map as last heard (null = not yet)
  const pending = Object.fromEntries(APP_PREF_KEYS.map((k) => [k, []]));   // this page's edits in flight, oldest first
  const maps = Object.fromEntries(APP_PREF_KEYS.map((k) => [k, null]));    // what every surface reads = base + pending
  const heard = Object.fromEntries(APP_PREF_KEYS.map((k) => [k, 0]));      // broadcasts heard per key
  const subs = new Set();
  let wired = false, fetching = null, readyResolve = null, chain = Promise.resolve();
  const ready = new Promise((r) => { readyResolve = r; });
  const notify = () => { for (const f of subs) { try { f(); } catch { /* one surface's error never stops the others */ } } };
  // the view = the server's map with this page's own edits in flight laid over it (a broadcast of somebody else's write
  // never hides a choice this page has not finished saving)
  const recompute = (k) => {
    const before = JSON.stringify(maps[k]);
    let m = base[k] === null && !pending[k].length ? null : asMap(base[k]);
    for (const p of pending[k]) m = asMap(p.edit(m));
    maps[k] = m;
    return JSON.stringify(m) !== before;
  };
  // ONE read of the whole user state; a map a broadcast replaced while this GET was in flight keeps the broadcast's
  const refetch = () => {
    if (fetching) return fetching;
    const mark = { ...heard };
    fetching = Promise.resolve(fj('/api/user-state')).then((st) => {
      fetching = null;
      let changed = false;
      if (okState(st)) for (const k of APP_PREF_KEYS) if (heard[k] === mark[k]) { base[k] = asMap(st[k]); if (recompute(k)) changed = true; }
      if (changed) notify();
      readyResolve();
      return okState(st);
    });
    return fetching;
  };
  /** Start listening (idempotent) on a WsManager-shaped socket: the broadcast replaces the maps (it carries the WHOLE
   *  user state — a key it lacks is an empty map), every (re)connect re-reads, and so does this call. */
  function wire(ws) {
    if (wired) return ready;
    wired = true;
    ws.onGlobal((m) => {
      if (m.type !== 'user-state-updated' || !okState(m.state)) return;
      // the broadcast carries the WHOLE user state on every write (a star, a recent…): re-render only when a map really moved
      let changed = false;
      for (const k of APP_PREF_KEYS) { heard[k]++; base[k] = asMap(m.state[k]); if (recompute(k)) changed = true; }
      if (changed) notify();
    });
    ws.onStateChange?.((connected) => { if (connected) refetch(); }); // a broadcast sent while the socket was down never arrives
    refetch();
    return ready;
  }
  /** Edit ONE app's entry of a map: `edit(map) → map` (PURE — setScaleChoice / setFrameChoice bound to one app key). */
  function save(key, edit, failText) {
    if (!APP_PREF_KEYS.includes(key) || typeof edit !== 'function') return Promise.resolve(false);
    const entry = { edit };
    pending[key].push(entry);
    recompute(key);
    notify();
    const run = async () => {
      let done = false, why = null;
      try {
        const st = await fj('/api/user-state'); // the map the server holds NOW — this page's copy may have missed a broadcast
        if (okState(st)) {
          base[key] = asMap(st[key]);
          const next = asMap(edit(base[key]));
          const r = await fj('/api/user-state', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [key]: next }) });
          if (r && !r.error) { base[key] = next; done = true; } else why = r && r.error;
        } else why = st && st.error;
      } catch (e) { why = e && e.message; }
      pending[key].splice(pending[key].indexOf(entry), 1); // settled either way: a refused edit leaves the view (the rollback)
      if (recompute(key)) notify(); // a save that landed as shown re-renders nothing (the keyboard stays where it was)
      if (!done) toast((failText || failDefault()) + (why ? `: ${why}` : ''), { type: 'error' });
      return done;
    };
    // one save at a time per page: the next one reads the map this one wrote
    const p = chain.then(run, run);
    chain = p.catch(() => false);
    return p;
  }
  return {
    wire,
    refetch,
    /** The map under a user-state key ({} until loaded — a choice nobody made reads as 'auto' everywhere). */
    prefs: (key) => maps[key] || {},
    /** Resolves once the first read answered (a launch that must send the stored default waits for it). */
    ready: () => ready,
    /** Subscribe to every change of either map; returns the unsubscribe. */
    on: (fn) => { subs.add(fn); return () => subs.delete(fn); },
    save,
  };
}

// the page's ONE loader
const page = createAppPrefs({ fetchJson, toast: showToast, failDefault: () => t('Could not save the choice') });
/** Start listening (idempotent). */
export const wireAppPrefs = (app) => page.wire(app.ws);
/** The map under a user-state key ({} until loaded). */
export const appPrefs = (key) => page.prefs(key);
/** Resolves once the first read answered. */
export const appPrefsReady = () => page.ready();
/** Subscribe to every change of either map; returns the unsubscribe. */
export const onAppPrefs = (fn) => page.on(fn);
/** Edit ONE app's entry: `saveAppPrefs(key, (map) => setScaleChoice(map, appKey, choice), failText)` — local first, then
 *  the edit applied to the server's current map and PATCHed as that one key; a refusal rolls back and toasts `failText`. */
export const saveAppPrefs = (key, edit, failText) => page.save(key, edit, failText);
