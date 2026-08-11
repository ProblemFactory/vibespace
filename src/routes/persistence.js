/**
 * Persistence API routes — layouts, bookmarks, custom themes, user state,
 * settings. All are file-backed JSON stores with WS broadcast.
 * (Session groups live inside user-state; the old /api/session-groups CRUD
 * routes were removed — they were unreachable and used a conflicting data
 * shape that normalizeUserState would have flattened to [].)
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { listCodexThreads } = require('../codex-session-store');

const router = express.Router();

function ensureDir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }

// Atomic JSON write: tmp + rename. layouts.json/user-state.json are rewritten
// constantly; a crash mid-writeFileSync truncates the file, the next read's
// catch silently resets to defaults, and the next autosave makes the loss
// permanent. rename() is atomic on POSIX so readers see old-or-new, never torn.
function writeJsonAtomic(file, data) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

/** Setup persistence routes. Requires { dataDir, wss, WS_OPEN, getSyncStore, activeSessions, auth } context. */
function setup({ dataDir, wss, WS_OPEN, getSyncStore, activeSessions, auth, getHosts, getMounts, getTasks, getAccounts, getUsageHistory, onSettingsWrite }) {
  const broadcast = (msg) => {
    const json = JSON.stringify(msg);
    wss.clients.forEach(client => {
      if (client.readyState === WS_OPEN) { try { client.send(json); } catch {} }
    });
  };

  // ── Layout/Preset Persistence (cached in memory) ──
  const LAYOUTS_FILE = path.join(dataDir, 'layouts.json');
  let _layoutsCache = null;

  function readLayouts() {
    if (_layoutsCache) return _layoutsCache;
    ensureDir(dataDir);
    try { _layoutsCache = JSON.parse(fs.readFileSync(LAYOUTS_FILE, 'utf-8')); }
    catch { _layoutsCache = { current: null, autoSave: null, saved: {}, customGrids: [] }; }
    return _layoutsCache;
  }

  // Disk write is debounced: layout-sync WS messages arrive on every window
  // change from every client — a sync full-file write per message was a steady
  // event-loop hot path. The in-memory cache is authoritative between flushes.
  let _layoutsSaveTimer = null;
  function flushLayouts() {
    if (_layoutsSaveTimer) { clearTimeout(_layoutsSaveTimer); _layoutsSaveTimer = null; }
    if (_layoutsCache) { try { ensureDir(dataDir); writeJsonAtomic(LAYOUTS_FILE, _layoutsCache); } catch {} }
  }
  // ── LAYOUT HISTORY (2.296.0, after a bug flattened a user's whole desktop
  // layout and the only good copy was gone). Layouts are the one piece of
  // state a bug can destroy in a way no transcript recovers: sessions survive,
  // but WHERE they lived is unrecoverable. Every write passes through here, so
  // this is the one place a rollback point can exist.
  //
  // Snapshot the PREVIOUS state (the about-to-be-replaced one) whenever the
  // desktop→window SHAPE changes — geometry drags and z-order churn are
  // deliberately ignored, or a drag would evict every useful restore point in
  // seconds. A destructive write therefore always leaves the last good shape
  // on disk. Bounded: 40 files, newest kept, tiny JSON.
  const HISTORY_DIR = path.join(dataDir, 'layout-history');
  const HISTORY_MAX = 40;
  // shape = per-desktop sorted window ids. Catches windows moving between
  // desktops, disappearing, or a desktop being emptied — the damage classes.
  // CRITICAL (adversarial review, verified against a real production
  // layouts.json): PERSISTED windows carry `winId`, not `id` — `id` exists
  // only on in-memory window objects. Reading `w.id` made every shape
  // signature EMPTY, so NO rollback point would ever be written for a window
  // change: the feature would have been silently dead in production while its
  // tests passed on a fixture that used `id`. Same tolerant read the restore
  // path already uses (src/lib/layout.js:108, :229).
  const winKey = (w) => w?.winId || w?.id;
  function layoutShape(data) {
    if (!data) return '';
    const parts = [];
    for (const [dk, v] of Object.entries(data.desktops || {})) {
      const ids = ((v?.autoSave || {}).windows || []).map(winKey).filter(Boolean).sort();
      parts.push(dk + ':' + ids.join(','));
    }
    const top = ((data.autoSave || {}).windows || []).map(winKey).filter(Boolean).sort();
    if (top.length) parts.push('_top:' + top.join(','));
    return parts.sort().join('|');
  }
  function layoutSummary(data) {
    const perDesktop = {};
    for (const [dk, v] of Object.entries(data?.desktops || {})) {
      // Desktop names are NOT unique (both creation sites use `Desktop N` with
      // no uniqueness check after a delete, and rename accepts anything), so
      // keying by name alone dropped a whole desktop's row AND under-counted
      // totalWindows in the picker and in incident bundles.
      let key = (data.desktopMeta || []).find((m) => m.id === dk)?.name || dk;
      if (key in perDesktop) key += ` (${dk.slice(-4)})`;
      perDesktop[key] = ((v?.autoSave || {}).windows || []).length;
    }
    // Instances that never created a virtual desktop keep their windows in the
    // LEGACY top-level autoSave — summarizing only `desktops` reported "0
    // windows" for them, which makes every rollback point look worthless
    // exactly where the user has no desktops to reason about (caught live).
    const top = ((data?.autoSave || {}).windows || []).length;
    if (top) perDesktop[''] = top;
    return perDesktop;
  }
  let _lastShape = null;
  let _histSeq = 0;
  let _histWarned = false;
  // CRITICAL (adversarial review): readLayouts() hands out the LIVE cache
  // object and EVERY production caller mutates it in place before calling
  // writeLayouts (ws layout-sync, desktop create/delete/rename/reorder,
  // /api/layouts-autosave …). Snapshotting `_layoutsCache` therefore captured
  // the ALREADY-DAMAGED state — the feature would have stored exactly the
  // thing it exists to undo. Keep a DETACHED copy of the last written state
  // instead. (The first test passed only because it always handed writeLayouts
  // a fresh object — a shape production never uses; the test now mirrors the
  // real read-modify-write pattern.)
  let _lastGood = null;
  function snapshotLayout(prev, nextShape) {
    try {
      // No detached copy yet (first write after boot, or a restore issued
      // before anything read layouts): fall back to what is ON DISK — that IS
      // the previous state, and skipping here silently drops the very first
      // change after every restart, which is when a layout bug is most likely
      // to strike (a restart is the usual remedy someone tries first).
      if (!prev) {
        try { prev = JSON.parse(fs.readFileSync(LAYOUTS_FILE, 'utf-8')); } catch { return; }
      }
      const prevShape = layoutShape(prev);
      if (prevShape === nextShape) return;         // shape unchanged — nothing to preserve
      if (!prevShape) return;                      // nothing meaningful yet (boot)
      // Persist OFF the write path: writeLayouts runs per layout-sync message
      // per client — the 500ms debounce right above exists precisely because a
      // sync write there was a hot path. Only the shape compare (µs) stays
      // inline; mkdir/stringify/write/prune ride a setImmediate over a
      // DETACHED copy, so a later mutation of the caller's object cannot reach
      // the snapshot either.
      const snap = detach(prev);
      if (!snap) return;
      setImmediate(() => {
        try {
          fs.mkdirSync(HISTORY_DIR, { recursive: true });
          const before = layoutSummary(snap);
          // UNIQUE filename: ISO stamps have millisecond resolution and a burst
          // of shape changes (what a mass-resume storm produces) lands inside
          // one millisecond — a bare timestamp silently OVERWROTE the older
          // entry, destroying the pre-damage state precisely in the incident
          // this feature exists for.
          const stamp = new Date().toISOString().replace(/[:.]/g, '-') + '-' + (_histSeq++).toString(36);
          const total = Object.values(before).reduce((a, b) => a + b, 0);
          const at = Date.now();
          // atomic like layouts.json next door — a torn rollback point fails
          // exactly when it is finally needed
          writeJsonAtomic(path.join(HISTORY_DIR, `layout-${stamp}.json`), { at, summary: before, totalWindows: total, layouts: snap });
          // tiny sidecar header: listing must not parse 40 whole layouts on the
          // panic-button path
          writeJsonAtomic(path.join(HISTORY_DIR, `layout-${stamp}.meta.json`), { at, summary: before, totalWindows: total });
          pruneHistory();
        } catch (e) {
          // never silent: the UI asserts this protection exists
          if (!_histWarned) { _histWarned = true; console.warn('[layout-history] snapshot FAILED — rollback points are not being written:', e.message); }
        }
      });
    } catch {}
  }
  // TIERED retention (adversarial review): a flat newest-40 ring is exactly
  // wrong for this feature's motivating case — a mass-resume storm produces
  // dozens of shape changes in seconds and would evict every PRE-storm point,
  // i.e. the only ones worth having. Keep the newest N *and* the oldest few,
  // so the state from before a burst always survives it.
  const KEEP_OLDEST = 10;
  function pruneHistory() {
    const files = fs.readdirSync(HISTORY_DIR).filter((f) => /^layout-.*\.json$/.test(f) && !f.endsWith('.meta.json')).sort();
    if (files.length <= HISTORY_MAX) return;
    const keep = new Set([...files.slice(0, KEEP_OLDEST), ...files.slice(-(HISTORY_MAX - KEEP_OLDEST))]);
    for (const f of files) {
      if (keep.has(f)) continue;
      try { fs.unlinkSync(path.join(HISTORY_DIR, f)); } catch {}
      try { fs.unlinkSync(path.join(HISTORY_DIR, f.replace(/\.json$/, '.meta.json'))); } catch {}
    }
  }
  const detach = (o) => { try { return structuredClone(o); } catch { try { return JSON.parse(JSON.stringify(o)); } catch { return null; } } };
  function writeLayouts(data) {
    try {
      const nextShape = layoutShape(data);
      snapshotLayout(_lastGood, nextShape);   // the DETACHED previous state, never the live cache
      _lastShape = nextShape;
      _lastGood = detach(data);
    } catch {}
    _layoutsCache = data;
    if (_layoutsSaveTimer) clearTimeout(_layoutsSaveTimer);
    _layoutsSaveTimer = setTimeout(flushLayouts, 500);
  }
  function listLayoutHistory() {
    try {
      return fs.readdirSync(HISTORY_DIR)
        .filter((f) => /^layout-.*\.json$/.test(f) && !f.endsWith('.meta.json')).sort().reverse()
        .map((f) => {
          // header from the tiny sidecar; the full snapshot (a whole
          // layouts.json each) is read only when actually restoring
          try {
            const m = JSON.parse(fs.readFileSync(path.join(HISTORY_DIR, f.replace(/\.json$/, '.meta.json')), 'utf-8'));
            return { id: f, at: m.at, summary: m.summary, totalWindows: m.totalWindows };
          } catch {}
          try {
            const j = JSON.parse(fs.readFileSync(path.join(HISTORY_DIR, f), 'utf-8'));
            return { id: f, at: j.at, summary: j.summary, totalWindows: j.totalWindows };
          } catch { return null; } // unparseable → omit, never a 1970/0-window row
        }).filter(Boolean);
    } catch { return []; }
  }

  router.get('/api/layouts', (req, res) => res.json(readLayouts()));

  router.post('/api/layouts/:name', (req, res) => {
    const data = readLayouts();
    data.saved[req.params.name] = { ...req.body, updatedAt: Date.now() };
    writeLayouts(data);
    res.json({ success: true });
  });

  router.delete('/api/layouts/:name', (req, res) => {
    const data = readLayouts();
    delete data.saved[req.params.name];
    if (data.current === req.params.name) data.current = null;
    writeLayouts(data);
    res.json({ success: true });
  });

  router.post('/api/layouts-active', (req, res) => {
    const data = readLayouts();
    data.current = req.body.name || null;
    writeLayouts(data);
    res.json({ success: true });
  });

  router.post('/api/custom-grids', (req, res) => {
    const { rows, cols } = req.body;
    if (!rows || !cols) return res.status(400).json({ error: 'rows and cols required' });
    const data = readLayouts();
    if (!data.customGrids) data.customGrids = [];
    if (!data.customGrids.some(g => g.rows === rows && g.cols === cols)) {
      data.customGrids.push({ rows, cols });
      writeLayouts(data);
    }
    res.json({ success: true, customGrids: data.customGrids });
  });

  router.delete('/api/custom-grids', (req, res) => {
    const { rows, cols } = req.body;
    const data = readLayouts();
    if (!data.customGrids) data.customGrids = [];
    data.customGrids = data.customGrids.filter(g => !(g.rows === rows && g.cols === cols));
    writeLayouts(data);
    res.json({ success: true, customGrids: data.customGrids });
  });

  router.post('/api/layouts-autosave', (req, res) => {
    const data = readLayouts();
    const deviceType = req.body.deviceType || 'desktop';
    if (deviceType === 'mobile') {
      data.autoSaveMobile = { ...req.body, updatedAt: Date.now() };
    } else {
      data.autoSave = { ...req.body, updatedAt: Date.now() };
    }
    writeLayouts(data);
    res.json({ success: true });
  });

  // Layout rollback points. A layout-destroying bug is otherwise
  // unrecoverable (see LAYOUT HISTORY above) — this is what turns a support
  // incident into one click.
  router.get('/api/layout-history', (req, res) => res.json({ entries: listLayoutHistory() }));
  router.post('/api/layout-history/:id/restore', (req, res) => {
    const id = String(req.params.id || '');
    if (!/^layout-[\w.-]+\.json$/.test(id)) return res.status(400).json({ error: 'bad id' });
    let saved;
    try { saved = JSON.parse(fs.readFileSync(path.join(HISTORY_DIR, id), 'utf-8')); }
    catch { return res.status(404).json({ error: 'not found' }); }
    if (!saved?.layouts) return res.status(400).json({ error: 'entry has no layout' });
    // Warm the cache first: a restore issued before anything else read layouts
    // (server restarted while the tab stayed open — the usual sequence right
    // after a layout bug) left _lastGood null, so no rollback point was
    // written and the pre-restore layout was destroyed. The dialog PROMISES
    // this is undoable; make that true. (snapshotLayout also reads from disk
    // as a belt, so both halves are covered.)
    readLayouts();
    if (!_lastGood) _lastGood = detach(_layoutsCache);
    // FORCE a rollback point: a restore whose window SHAPE happens to match the
    // current one (reachable via a move-and-move-back round trip) would skip
    // the shape gate while still overwriting `saved` presets, customGrids and
    // all geometry — silently, on an action whose dialog promises it is
    // undoable. The restore is the one write that must never be gated.
    snapshotLayout(_lastGood, '\u0000force-' + Date.now());
    // the CURRENT state becomes a rollback point too — restoring is itself
    // undoable, so a mis-click can never be the end of the story
    writeLayouts(saved.layouts);
    flushLayouts();
    // BROADCAST (adversarial review): every other layout mutation broadcasts;
    // this one did not. Another open tab keeps its pre-restore state and the
    // next window change there writes that desktop's OLD window set straight
    // back — the user watches the restore succeed and the layout re-flatten
    // seconds later, with nothing in any log. Tell every client to reload,
    // exactly what the restoring client does.
    try {
      const j = JSON.stringify({ type: 'layout-restored' });
      wss?.clients?.forEach((c) => { if (c.readyState === WS_OPEN) { try { c.send(j); } catch {} } });
    } catch {}
    res.json({ success: true, summary: saved.summary, restoredFrom: saved.at });
  });

  // Expose for server.js to use directly
  router.listLayoutHistory = listLayoutHistory;
  router.readLayouts = readLayouts;
  router.writeLayouts = writeLayouts;
  router.flushLayouts = flushLayouts;
  router.readUserState = () => readUserState(); // TaskGroupManager one-time Groups migration

  // ── Bookmarks ──
  const BOOKMARKS_FILE = path.join(dataDir, 'bookmarks.json');
  function readBookmarks() {
    ensureDir(dataDir);
    try { return JSON.parse(fs.readFileSync(BOOKMARKS_FILE, 'utf-8')); }
    catch {
      const home = os.homedir();
      return [
        { label: 'Home', path: home },
        { label: 'Desktop', path: path.join(home, 'Desktop') },
        { label: 'Downloads', path: path.join(home, 'Downloads') },
        { label: 'Documents', path: path.join(home, 'Documents') },
      ];
    }
  }
  function writeBookmarks(data) {
    ensureDir(dataDir);
    writeJsonAtomic(BOOKMARKS_FILE, data);
  }

  router.get('/api/bookmarks', (req, res) => res.json(readBookmarks()));

  router.post('/api/bookmarks', (req, res) => {
    const bookmarks = req.body;
    if (!Array.isArray(bookmarks)) return res.status(400).json({ error: 'Expected array' });
    writeBookmarks(bookmarks);
    broadcast({ type: 'bookmarks-updated', bookmarks });
    res.json({ success: true });
  });

  // ── Custom Themes ──
  const CUSTOM_THEMES_FILE = path.join(dataDir, 'custom-themes.json');
  let _customThemesCache = null;

  function readCustomThemes() {
    if (_customThemesCache) return _customThemesCache;
    try { _customThemesCache = JSON.parse(fs.readFileSync(CUSTOM_THEMES_FILE, 'utf-8')); }
    catch { _customThemesCache = {}; }
    return _customThemesCache;
  }

  function writeCustomThemes(data) {
    ensureDir(dataDir);
    _customThemesCache = data;
    writeJsonAtomic(CUSTOM_THEMES_FILE, data);
    broadcast({ type: 'custom-themes-updated', themes: data });
  }

  router.get('/api/custom-themes', (req, res) => res.json(readCustomThemes()));

  router.post('/api/custom-themes', (req, res) => {
    const { name, css, terminal } = req.body;
    if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name required' });
    if (!css || typeof css !== 'object') return res.status(400).json({ error: 'css object required' });
    if (name.length > 50) return res.status(400).json({ error: 'Name too long (max 50)' });
    if (!/^[a-zA-Z0-9 _-]+$/.test(name)) return res.status(400).json({ error: 'Name must be alphanumeric' });
    const builtIn = ['dark', 'light', 'dracula', 'nord', 'solarized', 'monokai'];
    if (builtIn.includes(name.toLowerCase())) return res.status(400).json({ error: 'Cannot overwrite built-in theme' });
    if (JSON.stringify(req.body).length > 100000) return res.status(413).json({ error: 'Theme data too large' });
    // Reject non-custom-property keys and values with CSS-breaking chars — a
    // malicious key/value would inject CSS onto every client at load (themes are
    // broadcast). Defense in depth with the client-side sanitizer in themes.js.
    for (const [k, v] of Object.entries(css)) {
      if (!/^--[\w-]+$/.test(k)) return res.status(400).json({ error: `Invalid CSS variable name: ${k}` });
      if (/[{}<;]/.test(String(v))) return res.status(400).json({ error: `Invalid value for ${k}` });
    }
    const data = readCustomThemes();
    data[name] = { css, terminal: terminal || {} };
    writeCustomThemes(data);
    res.json({ success: true });
  });

  router.delete('/api/custom-themes/:name', (req, res) => {
    const data = readCustomThemes();
    if (!data[req.params.name]) return res.status(404).json({ error: 'Theme not found' });
    delete data[req.params.name];
    writeCustomThemes(data);
    res.json({ success: true });
  });

  // ── Sync Store snapshots ──
  router.get('/api/sync/:store', (req, res) => {
    const store = getSyncStore(req.params.store);
    if (!store) return res.status(404).json({ error: 'Unknown store' });
    res.json(store.getSnapshot());
  });

  // ── User State ──
  const USER_STATE_FILE = path.join(dataDir, 'user-state.json');
  let _userStateCache = null;
  const USER_STATE_DEFAULT = {
    stateVersion: 2,
    starredSessions: [],
    archivedSessions: [],
    archivedFolders: [],
    customNames: {},
    sessionModes: {},
    sessionConfigs: {},
    sessionGroups: {},
    groupFolders: {},
  };

  const CLAUDE_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function buildKnownSessionKeyMap() {
    const map = new Map();
    const add = (legacyId, sessionKey) => {
      if (!legacyId || !sessionKey) return;
      if (!map.has(legacyId)) map.set(legacyId, sessionKey);
    };

    for (const [id, session] of activeSessions || []) {
      const backend = session.backend || 'claude';
      const backendSessionId = session.backendSessionId || session.claudeSessionId || null;
      const sessionKey = backendSessionId ? `${backend}:${backendSessionId}` : '';
      const webuiSessionId = id || null;
      add(session.backendSessionId, sessionKey);
      add(session.claudeSessionId, sessionKey);
      add(webuiSessionId, sessionKey);
      add(webuiSessionId ? `${backend}:${webuiSessionId}` : '', sessionKey);
    }

    for (const session of listCodexThreads({ activeSessions })) {
      add(session.sessionId, session.sessionKey || `codex:${session.backendSessionId || session.sessionId}`);
      add(session.backendSessionId, session.sessionKey || `codex:${session.backendSessionId || session.sessionId}`);
    }

    return map;
  }

  function migrateLegacySessionRef(rawKey, knownSessionKeys) {
    const key = String(rawKey || '');
    if (!key) return '';
    if (knownSessionKeys?.has(key)) return knownSessionKeys.get(key);
    if (key.includes(':')) return key;
    if (CLAUDE_UUID_RE.test(key)) return `claude:${key}`;
    return key;
  }

  function migrateStateArray(items, knownSessionKeys) {
    const next = [];
    const seen = new Set();
    for (const raw of Array.isArray(items) ? items : []) {
      const mapped = migrateLegacySessionRef(raw, knownSessionKeys);
      if (!mapped || seen.has(mapped)) continue;
      seen.add(mapped);
      next.push(mapped);
    }
    return next;
  }

  function migrateStateMap(map, knownSessionKeys) {
    const next = {};
    for (const [rawKey, value] of Object.entries(map || {})) {
      const mapped = migrateLegacySessionRef(rawKey, knownSessionKeys);
      if (!mapped || Object.hasOwn(next, mapped)) continue;
      next[mapped] = value;
    }
    return next;
  }

  // True if any session ref still uses a legacy un-prefixed id (no "backend:" prefix)
  function _hasLegacyRefs(source) {
    const refs = [
      ...(Array.isArray(source.starredSessions) ? source.starredSessions : []),
      ...(Array.isArray(source.archivedSessions) ? source.archivedSessions : []),
      ...Object.keys(source.customNames || {}),
      ...Object.keys(source.sessionModes || {}),
      ...Object.keys(source.sessionConfigs || {}),
      ...Object.values(source.sessionGroups || {}).flat(),
    ];
    return refs.some((r) => typeof r === 'string' && r && !r.includes(':'));
  }

  function normalizeUserState(data) {
    const source = data && typeof data === 'object' ? data : {};
    // buildKnownSessionKeyMap walks the entire ~/.codex/sessions tree — only
    // pay that on writes that actually contain legacy refs to migrate.
    // (migrateLegacySessionRef passes prefixed keys through untouched, so an
    // empty map is equivalent when no legacy refs exist.)
    const knownSessionKeys = _hasLegacyRefs(source) ? buildKnownSessionKeyMap() : new Map();
    const sessionGroups = {};
    for (const [groupName, sessionRefs] of Object.entries(source.sessionGroups && typeof source.sessionGroups === 'object' ? source.sessionGroups : {})) {
      sessionGroups[groupName] = migrateStateArray(sessionRefs, knownSessionKeys);
    }
    return {
      stateVersion: 2,
      starredSessions: migrateStateArray(source.starredSessions, knownSessionKeys),
      archivedSessions: migrateStateArray(source.archivedSessions, knownSessionKeys),
      // folder keys, not session refs — no legacy migration needed
      archivedFolders: Array.isArray(source.archivedFolders) ? source.archivedFolders.filter((x) => typeof x === 'string' && x) : [],
      customNames: migrateStateMap(source.customNames && typeof source.customNames === 'object' ? source.customNames : {}, knownSessionKeys),
      sessionModes: migrateStateMap(source.sessionModes && typeof source.sessionModes === 'object' ? source.sessionModes : {}, knownSessionKeys),
      sessionConfigs: migrateStateMap(source.sessionConfigs && typeof source.sessionConfigs === 'object' ? source.sessionConfigs : {}, knownSessionKeys),
      sessionGroups,
      groupFolders: source.groupFolders && typeof source.groupFolders === 'object' ? source.groupFolders : {},
    };
  }

  function readUserState() {
    if (_userStateCache) return _userStateCache;
    ensureDir(dataDir);
    try {
      const rawText = fs.readFileSync(USER_STATE_FILE, 'utf-8');
      const parsed = JSON.parse(rawText);
      _userStateCache = normalizeUserState(parsed);
      const normalizedText = JSON.stringify(_userStateCache, null, 2);
      if (normalizedText !== rawText.trim()) {
        writeJsonAtomic(USER_STATE_FILE, _userStateCache);
      }
    }
    catch { _userStateCache = { ...USER_STATE_DEFAULT }; }
    return _userStateCache;
  }

  function writeUserState(data) {
    ensureDir(dataDir);
    _userStateCache = normalizeUserState(data);
    writeJsonAtomic(USER_STATE_FILE, _userStateCache);
    broadcast({ type: 'user-state-updated', state: _userStateCache });
  }

  router.get('/api/user-state', (req, res) => res.json(readUserState()));

  router.post('/api/user-state', (req, res) => {
    const data = req.body;
    if (!data || typeof data !== 'object') return res.status(400).json({ error: 'Expected object' });
    writeUserState(data);
    res.json({ success: true });
  });

  // Merge-only write (B-b87b clobber belt): user-state is full-doc
  // last-write-wins with 10+ unguarded mutation sites — a tab acting on a
  // STALE mirror (open all day, missed broadcasts) used to clobber every key
  // it never touched (stars, renames, configs from other tabs). The client
  // now sends only the top-level keys its mutation CHANGED; unchanged keys
  // can no longer travel, so a stale tab's damage is bounded to the key it
  // actually edited (same-key races stay last-write-wins, the documented
  // residual until a rev protocol lands).
  router.patch('/api/user-state', (req, res) => {
    const data = req.body;
    if (!data || typeof data !== 'object') return res.status(400).json({ error: 'Expected object' });
    const cur = readUserState();
    writeUserState({ ...cur, ...data });
    res.json({ success: true });
  });

  // ── Settings ──
  const SETTINGS_FILE = path.join(dataDir, 'settings.json');
  let _settingsCache = null;

  function readSettings() {
    if (_settingsCache) return _settingsCache;
    ensureDir(dataDir);
    try { _settingsCache = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8')); }
    catch { _settingsCache = {}; }
    return _settingsCache;
  }

  function writeSettings(data) {
    ensureDir(dataDir);
    const prev = readSettings(); // capture BEFORE the cache swap (for the change callback)
    _settingsCache = data;
    writeJsonAtomic(SETTINGS_FILE, data);
    broadcast({ type: 'settings-updated', settings: data });
    // Server-side change hook (2.190.0): the ONLY settings key with a server
    // side effect is the Integration master switch — everything else is read
    // lazily via readSettings. Never let a callback failure break the write.
    try { onSettingsWrite?.(data, prev); } catch (e) { console.warn('[settings] change callback failed:', e.message); }
  }

  // Server-side settings accessor: /api/settings persists HERE
  // (data/settings.json) — NOT in the 'settings' SyncStore (settings-sync.json,
  // a dormant migration target). Server code must read via this, never via
  // getSyncStore('settings') (that store is empty — a real bug class: 9 server
  // reads silently saw defaults regardless of what the user configured).
  router.readSettings = readSettings;

  router.get('/api/settings', (req, res) => res.json(readSettings()));

  router.post('/api/settings', (req, res) => {
    const data = req.body;
    if (!data || typeof data !== 'object') return res.status(400).json({ error: 'Expected object' });
    writeSettings(data);
    res.json({ success: true });
  });

  router.patch('/api/settings', (req, res) => {
    const current = readSettings();
    const patch = req.body;
    if (!patch || typeof patch !== 'object') return res.status(400).json({ error: 'Expected object' });
    const merged = { ...current, ...patch };
    for (const [k, v] of Object.entries(merged)) { if (v === null) delete merged[k]; }
    writeSettings(merged);
    res.json({ success: true });
  });

  // ── Config export / import (whole-instance transfer) ──
  // Non-sensitive sections travel as plaintext JSON; sensitive items
  // (VibeSpace password record, agent CLI credentials) are OPT-IN and always
  // AES-256-GCM-encrypted under a user passphrase (scrypt KDF). The sensitive
  // manifest lives OUTSIDE the ciphertext so the import dialog can list what's
  // inside without the passphrase. Login tokens are never exported.
  const crypto = require('crypto');
  const CLAUDE_CREDS = path.join(os.homedir(), '.claude', '.credentials.json');
  const CODEX_CREDS = path.join(os.homedir(), '.codex', 'auth.json');

  function encryptSensitive(obj, passphrase) {
    const salt = crypto.randomBytes(16);
    const key = crypto.scryptSync(String(passphrase), salt, 32);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]);
    return {
      cipher: 'aes-256-gcm', kdf: 'scrypt',
      salt: salt.toString('base64'), iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64'),
    };
  }

  function decryptSensitive(enc, passphrase) {
    const key = crypto.scryptSync(String(passphrase), Buffer.from(enc.salt, 'base64'), 32);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(enc.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(enc.tag, 'base64'));
    const out = Buffer.concat([decipher.update(Buffer.from(enc.data, 'base64')), decipher.final()]);
    return JSON.parse(out.toString('utf8'));
  }

  const readFileJson = (fp) => { try { return JSON.parse(fs.readFileSync(fp, 'utf-8')); } catch { return null; } };

  // What's available to export + entry counts for the dialog
  router.get('/api/config/export-info', (req, res) => {
    const settings = readSettings();
    const themes = readCustomThemes();
    const layouts = readLayouts();
    const state = readUserState();
    const bookmarks = readBookmarks();
    res.json({
      sections: {
        settings: { count: Object.keys(settings).length },
        customThemes: { count: Object.keys(themes || {}).length },
        layouts: { count: Object.keys(layouts?.layouts || {}).length + (layouts?.autoSave ? 1 : 0), desktops: (layouts?.desktopMeta || []).length },
        userState: {
          count: Object.keys(state?.customNames || {}).length + Object.keys(state?.starredSessions || {}).length
            + Object.keys(state?.archivedSessions || {}).length + Object.keys(state?.archivedFolders || {}).length
            + Object.keys(state?.sessionGroups || {}).length + Object.keys(state?.sessionConfigs || {}).length,
          groups: Object.keys(state?.sessionGroups || {}).length,
        },
        bookmarks: { count: (bookmarks || []).length },
        tasks: { count: (getTasks?.()?.list?.() || []).length },
        pricing: (() => {
          const p = getUsageHistory?.()?.pricingTable?.() || {};
          return { count: Object.keys(p.tiers || {}).length + Object.keys(p.accounts || {}).length };
        })(),
      },
      sensitive: {
        vsPassword: !!auth?.enabled,
        claudeCreds: fs.existsSync(CLAUDE_CREDS),
        codexCreds: fs.existsSync(CODEX_CREDS),
        hosts: (getHosts?.()?.list?.() || []).length,
        mounts: (getMounts?.()?.list?.() || []).length,
        accounts: (getAccounts?.()?.list?.()?.accounts || []).length,
      },
    });
  });

  router.post('/api/config/export', (req, res) => {
    const { sections = [], includeSensitive = [], passphrase, clientPrefs } = req.body || {};
    const file = {
      app: 'vibespace-config', version: 1,
      exportedAt: new Date().toISOString(),
      sections: {},
    };
    const take = (name, fn) => { if (sections.includes(name)) file.sections[name] = fn(); };
    take('settings', readSettings);
    take('customThemes', readCustomThemes);
    take('layouts', readLayouts);
    take('userState', readUserState);
    take('bookmarks', readBookmarks);
    take('tasks', () => getTasks?.()?.exportBundle?.() || null);
    take('pricing', () => getUsageHistory?.()?.pricingTable?.() || null);
    if (sections.includes('clientPrefs') && clientPrefs && typeof clientPrefs === 'object') {
      file.sections.clientPrefs = clientPrefs;
    }
    if (includeSensitive.length) {
      if (!passphrase || String(passphrase).length < 4) {
        return res.status(400).json({ error: 'A passphrase (≥4 chars) is required to export sensitive items' });
      }
      const sens = {};
      if (includeSensitive.includes('vsPassword')) {
        const rec = auth?.exportPasswordRecord?.();
        if (rec) sens.vsPassword = rec;
      }
      if (includeSensitive.includes('claudeCreds')) {
        const c = readFileJson(CLAUDE_CREDS);
        if (c) sens.claudeCreds = c;
      }
      if (includeSensitive.includes('codexCreds')) {
        const c = readFileJson(CODEX_CREDS);
        if (c) sens.codexCreds = c;
      }
      if (includeSensitive.includes('hosts')) {
        const b = getHosts?.()?.exportBundle?.();
        if (b?.hosts?.length) sens.hosts = b;
      }
      if (includeSensitive.includes('mounts')) {
        const b = getMounts?.()?.exportBundle?.();
        if (b?.mounts?.length || b?.shares?.length || b?.myStorage) sens.mounts = b;
      }
      if (includeSensitive.includes('accounts')) {
        // Named billing accounts: API keys decrypted out of the machine-local
        // store + each subscription's creds-dir files. Plaintext ONLY inside
        // this passphrase-encrypted blob.
        const b = getAccounts?.()?.exportBundle?.();
        if (b?.accounts?.length) sens.accounts = b;
      }
      if (Object.keys(sens).length) {
        file.sensitive = { manifest: Object.keys(sens), ...encryptSensitive(sens, passphrase) };
      }
    }
    const name = `vibespace-config-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.json(file);
  });

  router.post('/api/config/import', (req, res) => {
    const { file, sections = [], includeSensitive = [], passphrase } = req.body || {};
    if (!file || file.app !== 'vibespace-config' || typeof file.sections !== 'object') {
      return res.status(400).json({ error: 'Not a VibeSpace config file' });
    }
    const applied = [];
    const apply = (name, fn) => {
      if (!sections.includes(name) || file.sections[name] === undefined) return;
      fn(file.sections[name]);
      applied.push(name);
    };
    apply('settings', (d) => { if (d && typeof d === 'object') writeSettings(d); });
    apply('customThemes', (d) => { if (d && typeof d === 'object') { writeCustomThemes(d); } });
    apply('layouts', (d) => { if (d && typeof d === 'object') writeLayouts(d); });
    apply('userState', (d) => { if (d && typeof d === 'object') writeUserState(d); });
    apply('bookmarks', (d) => { if (Array.isArray(d)) { writeBookmarks(d); broadcast({ type: 'bookmarks-updated', bookmarks: d }); } });
    apply('tasks', (d) => { if (d && typeof d === 'object') getTasks?.()?.importBundle?.(d); });
    apply('pricing', (d) => { if (d && typeof d === 'object') getUsageHistory?.()?.setPricing?.(d); });
    // clientPrefs are applied by the CLIENT (localStorage) — echo them back
    const clientPrefs = sections.includes('clientPrefs') ? file.sections.clientPrefs : undefined;
    if (clientPrefs) applied.push('clientPrefs');

    if (includeSensitive.length && file.sensitive) {
      let sens;
      try { sens = decryptSensitive(file.sensitive, passphrase); }
      catch { return res.status(400).json({ error: 'Wrong passphrase (or corrupted file)' }); }
      if (includeSensitive.includes('claudeCreds') && sens.claudeCreds) {
        ensureDir(path.dirname(CLAUDE_CREDS));
        fs.writeFileSync(CLAUDE_CREDS, JSON.stringify(sens.claudeCreds), { mode: 0o600 });
        applied.push('claudeCreds');
      }
      if (includeSensitive.includes('codexCreds') && sens.codexCreds) {
        ensureDir(path.dirname(CODEX_CREDS));
        fs.writeFileSync(CODEX_CREDS, JSON.stringify(sens.codexCreds), { mode: 0o600 });
        applied.push('codexCreds');
      }
      if (includeSensitive.includes('hosts') && sens.hosts) {
        // a passphrase-protected key can't be unlocked unattended — importBundle
        // skips it and says so; `applied` is the user-visible channel (same
        // shape as 'vsPassword: skipped (SSO configured)'), never a silent drop
        const r = getHosts?.()?.importBundle?.(sens.hosts);
        applied.push(r?.warnings?.length ? 'hosts (' + r.warnings.join('; ') + ')' : 'hosts');
      }
      if (includeSensitive.includes('mounts') && sens.mounts) {
        getMounts?.()?.importBundle?.(sens.mounts);
        applied.push('mounts');
      }
      if (includeSensitive.includes('accounts') && sens.accounts) {
        const r = getAccounts?.()?.importBundle?.(sens.accounts);
        applied.push(`accounts (${r?.imported ?? 0} imported, ${r?.skipped ?? 0} skipped)`);
      }
      if (includeSensitive.includes('vsPassword') && sens.vsPassword && auth && auth.ssoEnabled) {
        // SSO configured → a local password is redundant (login goes through
        // the IdP); ignore the imported record instead of silently applying it.
        applied.push('vsPassword: skipped (SSO configured)');
      } else if (includeSensitive.includes('vsPassword') && sens.vsPassword && auth) {
        // enables auth + revokes all tokens; keep THIS caller logged in
        auth.importPasswordRecord(sens.vsPassword);
        const token = auth.issueToken(req.headers['user-agent']);
        const secure = req.secure || req.headers['x-forwarded-proto'] === 'https' ? ' Secure;' : '';
        res.setHeader('Set-Cookie', `vs_token=${token}; HttpOnly; Path=/; Max-Age=${180 * 24 * 3600}; SameSite=Lax;${secure}`);
        applied.push('vsPassword');
      }
    }
    res.json({ success: true, applied, clientPrefs });
  });

  return router;
}

module.exports = { router, setup };
