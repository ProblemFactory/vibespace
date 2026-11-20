import { SETTINGS_SCHEMA } from './settings-schema.js';
import { unsetValue } from '../harness-settings.js';

/** B-225b R7: a save refused while the hold is in its SILENT rungs is asked again this far apart, in silence */
const SILENT_RETRY_MS = 3000;
/** B-225b: the hold a refused body names (`store_unread`), or null — store-held.js heldBodyOf's reading, kept here so this module
 *  imports nothing of the page's DOM half (suites load it bare); a hold is handed to the page's strip through `onHeld` */
const heldBodyOf = (b) => (b && typeof b === 'object' && b.code === 'store_unread' && b.held && typeof b.held === 'object' && typeof b.held.file === 'string' && b.held.file ? b.held : null);

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
    // a broadcast / a save it answered) — what it USES, before any echo. `_live` = the server's CONFIRMED `{spend:
    // budgetLimits}` (the numbers its spend guard reads, a clamp included): this tab's POST echo is OPTIMISTIC only until
    // the next server state — a settings-updated broadcast REPLACES it with the `spend` it carries (the 2.309.0 cache
    // law: the invalidation pushes the RESULT), a refetch / load clears it (r2: a tab kept «in force now: 50» after
    // another device raised the cap to 100). `_inflight`: path → the seq of the LATEST POST carrying it — the latest
    // outcome is the row's (r2: a failed save kept «Not saved» after a later save landed).
    this._dirty = new Set();
    this._inflight = new Map();
    this._saveSeq = 0;
    this._failed = new Set();
    this._refused = new Map();   // the exit check (主开发 17:04Z): path → { code } the server set aside (the stored value kept) — said at the row
    this._saved = new Set();
    this._saveListeners = new Set();
    this._server = {};
    this._live = null;
    this._atLoad = null;     // lane ui-needs-a-button (reader follow-up #13): the values this PAGE loaded with (the first load)
    // B-225b R4 — NO WRITE BEFORE A LANDED FETCH: until a read of the SERVER'S settings landed (a 200, or a broadcast of its whole
    // state) this page's copy is not the server's (its localStorage, the defaults) — POSTed whole it would land over the real
    // file (a held one, at its lift). `held` = the hold the last refused read named (store_unread), else null.
    this._landed = false;
    this.held = null;
    this.onHeld = null;      // (held, { refused: [paths] }?) → the page's ONE strip, and «not now» said for a refused save (app.js)
    this._failHeld = new Set();   // the failed paths a HOLD refused (past its silent rungs): their row says «Not now», never «the server did not answer»
    this._landListeners = new Set();
    this._liftListeners = new Set();
  }

  /** a read of the server's settings LANDED on this page (B-225b R4) */
  get landed() { return this._landed; }
  /** fn() once a read lands (the Settings window draws its rows then) → the unsubscribe */
  onLand(fn) { if (typeof fn !== 'function') return () => {}; this._landListeners.add(fn); return () => this._landListeners.delete(fn); }
  /** GET /api/settings → { doc } (landed) | { held } (refused BY NAME: the store is held) | null (no answer) */
  async _ask() {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) return { doc: await res.json() };
      let b = null;
      try { b = await res.json(); } catch { b = null; }
      const h = heldBodyOf(b);
      return h ? { held: h } : null;
    } catch { return null; }
  }
  _noteHeld(h, refused = null) { this.held = h; try { this.onHeld?.(h, refused && refused.length ? { refused } : undefined); } catch { /* the strip's own */ } }
  /** a failed path's save was refused by a HOLD (its row says «Not now») */
  failHeldOf(path) { return this._failHeld.has(path); }
  /** fn(paths) when a hold ends on this page: the rows a hold refused read the stored value again (the Settings window redraws them)
   *  → the unsubscribe */
  onLift(fn) { if (typeof fn !== 'function') return () => {}; this._liftListeners.add(fn); return () => this._liftListeners.delete(fn); }
  /** THE LIFT (主开发 2026-11-20 12:54Z, picture B2): the hold is over, so no row keeps a value that is not stored under «not now
   *  … right now». Each row a hold refused takes the STORED value again and its mark leaves — the person's refused change is not
   *  saved silently; it was said refused, and the row now shows what holds. Called once the server's state is here again. */
  _liftHeld() {
    const had = !!this.held;
    this.held = null;
    // (a hold this page met refused nothing: its window still drew the hold's foot — the listeners redraw it, with no row)
    if (!this._failHeld.size) { if (had) for (const fn of [...this._liftListeners]) { try { fn([]); } catch (e) { console.error('Settings lift listener error:', e); } } return; }
    const paths = [...this._failHeld];
    this._failHeld.clear();
    for (const p of paths) {
      this._failed.delete(p); this._saved.delete(p);
      if (this._dirty.has(p) || this._inflight.has(p)) continue;   // a newer change of the row is on its way: it speaks
      const was = this.get(p);
      if (p in this._server) this._values[p] = this._server[p]; else delete this._values[p];
      const now = this.get(p);
      if (JSON.stringify(was) !== JSON.stringify(now)) this._notify(p, now, was);
    }
    this._emitSave(paths);
    for (const fn of [...this._liftListeners]) { try { fn(paths); } catch (e) { console.error('Settings lift listener error:', e); } }
  }
  /** THE LANDING: the server's state replaces this page's copy — the person's acts the debounce still holds ride on it */
  _landOn(doc, { spend = null } = {}) {
    const fresh = doc && typeof doc === 'object' && !Array.isArray(doc) ? doc : {};
    const mine = [...this._dirty].map((p) => [p, p in this._values, this._values[p]]);
    this._values = { ...fresh };
    for (const [p, has, v] of mine) { if (has) this._values[p] = v; else delete this._values[p]; }
    this._server = { ...fresh };
    this._live = spend && typeof spend === 'object' ? { spend } : null;
    const first = !this._landed;
    this._landed = true;
    this._liftHeld();
    if (first) for (const fn of [...this._landListeners]) { try { fn(); } catch (e) { console.error('Settings land listener error:', e); } }
  }
  /** every path whose value moved since `old` (the copy before a landing) is told */
  _notifyMoved(old) {
    for (const path of new Set([...Object.keys(old), ...Object.keys(this._values)])) {
      const was = path in old ? old[path] : SETTINGS_SCHEMA[path]?.default, now = this.get(path);
      if (SETTINGS_SCHEMA[path] && JSON.stringify(was) !== JSON.stringify(now)) this._notify(path, now, was);
    }
  }

  /** lane owner-press-attended: a path's save state — 'pending' (committed, the debounce has not fired) | 'saving' (the
   *  POST is on its way) | 'failed' (the LATEST POST carrying it did not land) | 'saved' (the server has it — it stays
   *  until the next edit) | 'idle'. */
  saveStateOf(path) {
    if (this._dirty.has(path)) return 'pending';
    if (this._inflight.has(path)) return 'saving';
    if (this._refused.has(path)) return 'refused';
    if (this._failed.has(path)) return 'failed';
    if (this._saved.has(path)) return 'saved';
    return 'idle';
  }
  /** A row the server set aside at its last save → { code } (its words: settings-view saveMarkWords), else null. */
  refusedOf(path) { return this._refused.get(path) || null; }
  /** Subscribe to save-state changes: fn(path, state). Returns the unsubscribe. */
  onSaveState(fn) { if (typeof fn !== 'function') return () => {}; this._saveListeners.add(fn); return () => this._saveListeners.delete(fn); }
  _emitSave(paths) { for (const p of paths) { const st = this.saveStateOf(p); for (const fn of [...this._saveListeners]) { try { fn(p, st); } catch (e) { console.error(`Settings save listener error [${p}]:`, e); } } } }
  /** The value the SERVER holds for a path (its last confirmed snapshot; the schema default when it holds none). */
  serverValue(path) { return path in this._server ? this._server[path] : SETTINGS_SCHEMA[path]?.default; }
  /** The server's confirmed `{spend}` (its POST echo, or the one a broadcast carried), or null when none is current. */
  liveEcho() { return this._live; }
  /** r2: the server's state moved — every number row's mark redraws (the in-force number is the server's, not ours) */
  _emitAllMarks() { this._emitSave(Object.keys(SETTINGS_SCHEMA).filter((p) => SETTINGS_SCHEMA[p] && SETTINGS_SCHEMA[p].type === 'number')); }

  /** Load settings from server, fall back to localStorage. Returns a promise. */
  async load() {
    const r = await this._ask();
    if (r && r.doc) this._landOn(r.doc);
    else {
      if (r && r.held) this._noteHeld(r.held);
      this._loadFromLocalStorage();   // what this page SHOWS meanwhile — never written (B-225b R4: the save asks first)
    }
    this._loaded = true;
    if (!this._atLoad) this._atLoad = { ...this._values };   // a setting that takes effect at the next load compares against THESE
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
      const r = await this._ask();
      if (!r || !r.doc) { if (r && r.held) this._noteHeld(r.held); return; }
      const fresh = r.doc;
      if (!this._landed) { const old = { ...this._values }; this._landOn(fresh); this._emitAllMarks(); this._notifyMoved(old); return; }   // B-225b: the first landing
      this._server = { ...fresh };
      this._liftHeld();   // B-225b: a hold this page met is over — the rows it refused read the stored value again
      this._live = null;   // r2: a refetch is the server's state — our last echo is no longer the source
      this._emitAllMarks();
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

  /** lane ui-needs-a-button (reader follow-up #13): the value this PAGE loaded with (the store's first load — a row that takes effect
   *  at the next load is in force at this one); before the load, the value now. */
  loadedValue(path) {
    if (!this._atLoad) return this.get(path);
    return path in this._atLoad ? this._atLoad[path] : SETTINGS_SCHEMA[path]?.default;
  }

  /** Get a setting value. Returns the stored override or the schema default — for a row nobody set that declares
   *  `unsetFollows` (Antigravity's automatic usage reads), the followed answer first: the value the server reads
   *  (src/harness-settings.js unsetValue, ONE rule for both halves). */
  get(path) {
    if (path in this._values) return this._values[path];
    const schema = SETTINGS_SCHEMA[path];
    if (schema) { const u = schema.unsetFollows ? unsetValue(schema, (p) => this.get(p)) : undefined; return u !== undefined ? u : schema.default; }
    return undefined;
  }

  /** Set a setting value. Pass undefined to reset to default. */
  set(path, value) {
    const schema = SETTINGS_SCHEMA[path];
    if (!schema) return;

    const old = this.get(path);
    // the rows nobody set that follow this one (unsetFollows) redraw with it
    const followers = Object.keys(SETTINGS_SCHEMA).filter((p) => SETTINGS_SCHEMA[p] && SETTINGS_SCHEMA[p].unsetFollows && SETTINGS_SCHEMA[p].unsetFollows.setting === path).map((p) => [p, this.get(p)]);

    // If value equals default, remove the override (sparse storage) — EXCEPT a `storeDefault` row: a person's own pick of
    // its default is kept as a value, told apart from a row nobody set (which may follow another: unsetFollows)
    if (value === undefined || (!schema.storeDefault && JSON.stringify(value) === JSON.stringify(schema.default))) {
      delete this._values[path];
    } else {
      this._values[path] = value;
    }

    const now = this.get(path);
    if (JSON.stringify(old) !== JSON.stringify(now)) {
      this._notify(path, now, old);
    }
    for (const [p, was] of followers) { const is = this.get(p); if (JSON.stringify(was) !== JSON.stringify(is)) this._notify(p, is, was); }
    this._dirty.add(path); this._failed.delete(path); this._failHeld.delete(path); this._saved.delete(path); this._refused.delete(path);
    this._scheduleSave();
    this._emitSave([path]);
  }

  /** Reset a single setting to its default. */
  reset(path) {
    this.set(path, undefined);
  }

  /** Reset all settings to defaults → false when REFUSED (the caller says it at the press — round wyzvr7567's cure 1). */
  resetAll() {
    if (!this._landed) return false;   // B-225b R4: never a write over settings this page has not read (the Settings window shows no rows then)
    if (this.held) return false;       // a hold this page met (said or in its silent rungs): the person's whole reset is refused at once, never left waiting in silence
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

  /** Apply state from server (WebSocket broadcast). `spend` = the server's recomputed in-force numbers the broadcast
   *  carries (r2) — they REPLACE this tab's echo; a broadcast without them clears it (budgetLimits over `data` speaks). */
  applyRemote(data, { spend = null } = {}) {
    // Echo-revert guard: the server broadcasts settings-updated to ALL clients
    // including the SENDER (HTTP POST — no ws to exclude). With a local edit
    // still pending save, applying the incoming (stale) snapshot reverts it —
    // real repro: set(false) then set(true) within the 500ms debounce came back
    // as false forever (rail smoke caught it). Our pending _save() will push
    // the authoritative state; skip the echo while dirty.
    if (this._saveTimer) return;
    const old = { ...this._values };
    // the exit check (主开发 17:56Z): a refused row's mark drops once the STORED value changes from another page
    const stale = [...this._refused.keys()].filter((p) => JSON.stringify((data || {})[p]) !== JSON.stringify((this._server || {})[p]));
    this._values = data;
    this._server = { ...(data || {}) };
    if (!this._landed) { this._landOn(data, { spend }); this._values = data; }   // B-225b R4: a broadcast of the server's WHOLE state is a landing (nothing is dirty: the guard above)
    this._liftHeld();   // B-225b: the server's whole state is here again — the rows a hold refused read it (no «right now» after the hold)
    for (const p of stale) this._refused.delete(p);
    if (stale.length) this._emitSave(stale);
    this._live = spend && typeof spend === 'object' ? { spend } : null;
    this._emitAllMarks();
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
    // B-225b R4 — NO WRITE BEFORE A LANDED FETCH: the server's state is asked first; the person's acts the debounce holds ride on
    // it. Refused BY NAME in the hold's silent rungs: asked again in silence (R7); past them, or no answer: nothing is written and
    // the rows say «Not saved» (the strip names the hold)
    if (!this._landed) {
      const r = await this._ask();
      if (r && r.doc) { const old = { ...this._values }; this._landOn(r.doc); this._emitAllMarks(); this._notifyMoved(old); }
      else {
        if (this._saveTimer === myTimer) this._saveTimer = null;
        if (r && r.held && r.held.rung === 'silent') { this._noteHeld(r.held); if (!this._saveTimer) this._saveTimer = setTimeout(() => this._save(), SILENT_RETRY_MS); return; }
        const carried = [...this._dirty];
        this._dirty.clear();
        for (const p of carried) { this._saved.delete(p); this._failed.add(p); if (r && r.held) this._failHeld.add(p); else this._failHeld.delete(p); }
        if (r && r.held) this._noteHeld(r.held, carried);   // «not now», said — the controls stay as the person left them
        this._emitSave(carried);
        return;
      }
    }
    const data = this.toJSON();
    // B-225b: a change a HOLD refused rides no other row's save — it was said refused at its press, and is never saved in silence
    // (the row takes the stored value at the lift)
    for (const p of this._failHeld) { if (p in this._server) data[p] = this._server[p]; else delete data[p]; }
    // Always write to localStorage as backup
    try { localStorage.setItem('webui-settings', JSON.stringify(data)); } catch {}
    // lane owner-press-attended: what this POST carries is 'saving' until the server answers
    const carried = [...this._dirty];
    const mySeq = ++this._saveSeq;
    this._dirty.clear();
    for (const p of carried) this._inflight.set(p, mySeq);
    this._emitSave(carried);
    let landed = false, silent = false, heldNow = null;
    // Write to server
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      landed = !!(res && res.ok);
      if (!landed && res && res.status === 503) {   // B-225b: refused by a hold — in its silent rungs the write waits, asked again in silence (R7)
        let b = null;
        try { b = await res.json(); } catch { b = null; }
        const h = heldBodyOf(b);
        if (h) { heldNow = h; silent = h.rung === 'silent'; }
      }
      if (landed) {
        const before = this._server || {};
        this._server = { ...data };
        let j = null;
        try { j = await res.json(); } catch { j = null; }
        if (j && j.spend && typeof j.spend === 'object') this._live = { spend: j.spend };
        // a row the server SET ASIDE keeps its stored value there (the server's copy says so); its words wait at the row
        for (const [p, why] of Object.entries((j && j.refused && typeof j.refused === 'object') ? j.refused : {})) { this._server[p] = before[p]; this._refused.set(p, { code: String((why && why.code) || '') }); }
      }
    } catch {} finally {
      if (this._saveTimer === myTimer) this._saveTimer = null;
      // the LATEST POST carrying a path decides its state (r2): an older POST's outcome never overwrites a newer one's
      for (const p of carried) {
        if (this._inflight.get(p) !== mySeq) continue;
        this._inflight.delete(p);
        if (silent) { this._dirty.add(p); continue; }   // B-225b R7: still pending — the save is asked again below
        if (landed && this._refused.has(p)) { this._failed.delete(p); this._saved.delete(p); } else if (landed) { this._failed.delete(p); this._saved.add(p); } else { this._saved.delete(p); this._failed.add(p); }
        if (!landed && heldNow) this._failHeld.add(p); else this._failHeld.delete(p);
      }
      if (heldNow) this._noteHeld(heldNow, silent ? null : carried.filter((p) => this._failHeld.has(p)));
      if (silent && this._dirty.size && !this._saveTimer) this._saveTimer = setTimeout(() => this._save(), SILENT_RETRY_MS);
      this._emitSave(carried);
    }
  }
}

export { SettingsManager };
