import { SETTINGS_SCHEMA } from './settings-schema.js';

/**
 * SettingsManager — centralized settings with server persistence and live change events.
 *
 * Only non-default values are stored (sparse). get() falls back to schema defaults.
 * Changes are debounce-saved to server and broadcast to other clients via WebSocket.
 */
class SettingsManager {
  constructor() {
    this._values = {};       // sparse: only overrides
    this._listeners = {};    // path → Set<callback>
    this._saveTimer = null;
    this._loaded = false;
    // A TYPED VALUE IS NOT LIVE UNTIL THE SERVER HAS IT — AND THE ROW SAYS SO (lane owner-press-attended: userW typed 200
    // at 00:40, his 00:47 press was refused, the file was written at 00:48:01; nothing on the panel said "not saved").
    // Per path: `_dirty` = changed since the last save went out (the 500 ms debounce), `_inflight` = carried by the POST
    // on its way, `_failed` = that POST did not land. `_server` = the values the SERVER last confirmed (load / refetch /
    // a broadcast / a save it answered) — what it USES, before any echo. `_live` = the server's own echo of its last
    // save (`{spend: budgetLimits}` — the numbers its spend guard reads, a clamp included).
    this._dirty = new Set();
    this._inflight = new Set();
    this._failed = new Set();
    this._saved = new Set();
    this._saveListeners = new Set();
    this._server = {};
    this._live = null;
  }

  /** lane owner-press-attended: a path's save state — 'pending' (typed, the debounce has not fired) | 'saving' (the POST
   *  is on its way) | 'failed' (it did not land) | 'saved' (the server has it — said once, then 'idle') | 'idle'. */
  saveStateOf(path) {
    if (this._dirty.has(path)) return 'pending';
    if (this._inflight.has(path)) return 'saving';
    if (this._failed.has(path)) return 'failed';
    if (this._saved.has(path)) return 'saved';
    return 'idle';
  }
  /** Subscribe to save-state changes: fn(path, state). Returns the unsubscribe. */
  onSaveState(fn) { if (typeof fn !== 'function') return () => {}; this._saveListeners.add(fn); return () => this._saveListeners.delete(fn); }
  _emitSave(paths) { for (const p of paths) { const st = this.saveStateOf(p); for (const fn of [...this._saveListeners]) { try { fn(p, st); } catch (e) { console.error(`Settings save listener error [${p}]:`, e); } } } }
  /** The value the SERVER holds for a path (its last confirmed snapshot; the schema default when it holds none). */
  serverValue(path) { return path in this._server ? this._server[path] : SETTINGS_SCHEMA[path]?.default; }
  /** The server's echo of its last save (`{spend}`), or null before one. */
  liveEcho() { return this._live; }

  /** Load settings from server, fall back to localStorage. Returns a promise. */
  async load() {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        this._values = await res.json();
        this._server = { ...this._values };
      } else {
        this._loadFromLocalStorage();
      }
    } catch {
      this._loadFromLocalStorage();
    }
    this._loaded = true;
    // Notify all listeners for loaded values (they may differ from defaults)
    for (const path of Object.keys(this._values)) {
      const schema = SETTINGS_SCHEMA[path];
      if (schema) this._notify(path, this._values[path], schema.default);
    }
  }

  /** Reconnect refetch (2.219.0): broadcast-only sync misses changes made
   * while this tab was offline. Skips while a local save is in flight (the
   * 2.177.0 stale-echo class — a refetch mid-debounce would revert it). */
  async refetch() {
    if (this._saveTimer) return;
    try {
      const res = await fetch('/api/settings');
      if (!res.ok) return;
      const fresh = await res.json();
      this._server = { ...fresh };
      for (const [path, val] of Object.entries(fresh)) {
        if (JSON.stringify(this._values[path]) !== JSON.stringify(val)) {
          const old = this._values[path];
          this._values[path] = val;
          this._notify(path, val, old);
        }
      }
    } catch { }
  }

  _loadFromLocalStorage() {
    try {
      const stored = localStorage.getItem('webui-settings');
      if (stored) this._values = JSON.parse(stored);
    } catch {}
  }

  /** Get a setting value. Returns the stored override or the schema default. */
  get(path) {
    if (path in this._values) return this._values[path];
    const schema = SETTINGS_SCHEMA[path];
    if (schema) return schema.default;
    return undefined;
  }

  /** Set a setting value. Pass undefined to reset to default. */
  set(path, value) {
    const schema = SETTINGS_SCHEMA[path];
    if (!schema) return;

    const old = this.get(path);

    // If value equals default, remove the override (sparse storage)
    if (value === undefined || JSON.stringify(value) === JSON.stringify(schema.default)) {
      delete this._values[path];
    } else {
      this._values[path] = value;
    }

    const now = this.get(path);
    if (JSON.stringify(old) !== JSON.stringify(now)) {
      this._notify(path, now, old);
    }
    this._dirty.add(path); this._failed.delete(path); this._saved.delete(path);
    this._scheduleSave();
    this._emitSave([path]);
  }

  /** Reset a single setting to its default. */
  reset(path) {
    this.set(path, undefined);
  }

  /** Reset all settings to defaults. */
  resetAll() {
    const oldValues = { ...this._values };
    this._values = {};
    // Notify all previously overridden settings
    for (const path of Object.keys(oldValues)) {
      const schema = SETTINGS_SCHEMA[path];
      if (schema) this._notify(path, schema.default, oldValues[path]);
    }
    this._scheduleSave();
  }

  /** Check if a setting has been modified from its default. */
  isModified(path) {
    return path in this._values;
  }

  /** Subscribe to changes on a specific setting path. */
  on(path, callback) {
    if (!this._listeners[path]) this._listeners[path] = new Set();
    this._listeners[path].add(callback);
  }

  /** Unsubscribe from changes. */
  off(path, callback) {
    if (this._listeners[path]) this._listeners[path].delete(callback);
  }

  /** Apply state from server (WebSocket broadcast). */
  applyRemote(data) {
    // Echo-revert guard: the server broadcasts settings-updated to ALL clients
    // including the SENDER (HTTP POST — no ws to exclude). With a local edit
    // still pending save, applying the incoming (stale) snapshot reverts it —
    // real repro: set(false) then set(true) within the 500ms debounce came back
    // as false forever (rail smoke caught it). Our pending _save() will push
    // the authoritative state; skip the echo while dirty.
    if (this._saveTimer) return;
    const old = { ...this._values };
    this._values = data;
    this._server = { ...(data || {}) };
    // localStorage backup
    try { localStorage.setItem('webui-settings', JSON.stringify(this._values)); } catch {}
    // Notify changed paths
    const allPaths = new Set([...Object.keys(old), ...Object.keys(data)]);
    for (const path of allPaths) {
      const oldVal = path in old ? old[path] : SETTINGS_SCHEMA[path]?.default;
      const newVal = this.get(path);
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        this._notify(path, newVal, oldVal);
      }
    }
  }

  /** Get all non-default values (for persistence). */
  toJSON() {
    return { ...this._values };
  }

  /** Export all settings as merged (defaults + overrides) for display. */
  getAll() {
    const result = {};
    for (const [path, schema] of Object.entries(SETTINGS_SCHEMA)) {
      result[path] = this.get(path);
    }
    return result;
  }

  _notify(path, newVal, oldVal) {
    const listeners = this._listeners[path];
    if (listeners) {
      // a SNAPSHOT of the listeners (lane guards-door): the Set is live, so a listener that re-subscribes while it runs
      // (a row that redraws itself) was visited again, forever — test-settings-view §8
      for (const cb of [...listeners]) {
        try { cb(newVal, oldVal); } catch (e) { console.error(`Settings listener error [${path}]:`, e); }
      }
    }
  }

  _scheduleSave() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._save(), 500);
  }

  async _save() {
    // B-b87b CRITICAL: this never nulled _saveTimer, so after the FIRST local
    // settings change the echo-revert guard (applyRemote/refetch check
    // `this._saveTimer`) stayed armed FOREVER — the tab silently stopped
    // receiving every other client's settings changes until reload. Release
    // the guard when the save completes, but only if no NEWER save was
    // scheduled while the POST was in flight (that save's own finally
    // releases; the guard must cover the whole in-flight window — the
    // 2.177.0 stale-echo class).
    const myTimer = this._saveTimer;
    const data = this.toJSON();
    // Always write to localStorage as backup
    try { localStorage.setItem('webui-settings', JSON.stringify(data)); } catch {}
    // lane owner-press-attended: what this POST carries is 'saving' until the server answers
    const carried = [...this._dirty];
    this._dirty.clear();
    for (const p of carried) this._inflight.add(p);
    this._emitSave(carried);
    let landed = false;
    // Write to server
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      landed = !!(res && res.ok);
      if (landed) {
        this._server = { ...data };
        let j = null;
        try { j = await res.json(); } catch { j = null; }
        if (j && j.spend && typeof j.spend === 'object') this._live = { spend: j.spend };
      }
    } catch {} finally {
      if (this._saveTimer === myTimer) this._saveTimer = null;
      for (const p of carried) { this._inflight.delete(p); if (landed) this._saved.add(p); else this._failed.add(p); }
      this._emitSave(carried);
    }
  }
}

export { SettingsManager };
