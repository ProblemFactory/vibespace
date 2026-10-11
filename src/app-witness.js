'use strict';
/**
 * WHAT IS INSTALLED, BY WITNESS (lane apps-launcher-witness, owner 2026-10-11: "我让 agent 装了 jasp 但是列表里没有" —
 * an agent's `flatpak install --user org.jaspstats.JASP` went around the apps door, and the launcher's catalog knows only
 * the engine's own root-owned files). SHARED + PURE — imports nothing (the .desktop reader, app-manifest's parseDesktopFile, is handed in): the hub's machine half
 * (src/app-serve.js refreshWitness) reads the OS's own records with them, the launcher renders their rows, the door's
 * result card and the helper's outcome say where an install landed with THE place words below.
 *   parseFlatpakList(text, {scope})  `flatpak list --app --<scope> --columns=application,name,version` → [{appId, name, version, scope}]
 *   desktopWitness(text, {path, scope, validate, parse})  a .desktop file → {ok, row} | {ok:false, skip|error} (never a throw)
 *   witnessRows({flatpaks, desktops, catalog, validate, parse})  → the rows of the "Installed outside VibeSpace" group
 *   refreshVerdict({listedAt, sig, sigNow, now, reason})  → {due, why} — the refresh rule
 *   installPlace({hostId, label, localName}, tr)  → "this VibeSpace machine (linux-box-hub)" | "<machine>"
 * THE SECURITY RULE STAYS (app-serve's catalog is "never from the user-writable index"): a witnessed row lives in its OWN
 * namespace `seen.<…>` and carries `witnessed: true` — it is never merged into the engine's rows, can never shadow an
 * engine app of the same name (a different id, a different group), and its Exec is SHOWN (the card's sub line) — it is
 * the user's own program, run as the user, through the same launch door as any row.
 */
const i18nKey = (s) => s; // a DECLARED human-visible string the client renders through t() (scripts/i18n-extract.mjs)
const WITNESS_PREFIX = 'seen.';
const WITNESS_MAX = 300; // rows in the group (a machine with thousands of entries is listed by its first 300 names)
const DESKTOP_FILES_MAX = 600; // .desktop files read per directory
const WITNESS_BUDGET_MS = 5000; // one refresh, every child and read included
const WITNESS_REFRESH_MS = 10 * 60 * 1000; // a quiet launcher open re-lists at most this often (a changed directory: at once)
const WITNESS_FILE = 'desktop-apps-witness.json';
const FLATPAK_COLUMNS = 'application,name,version';
const FLATPAK_ID_RE = /^[A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+){2,}$/;
const WITNESS_SOURCES = Object.freeze(['flatpak-user', 'flatpak-system', 'desktop-user', 'desktop-system']);
const FORCED = new Set(['install', 'helper', 'recheck']);

const clip = (s, max) => String(s == null ? '' : s).replace(/[\0\r\n\t]+/g, ' ').trim().slice(0, max);
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[^a-z0-9]+/, '').replace(/-+$/, '');

/** `flatpak list` (tab-separated; a header line on a terminal) → its apps. A line that is not `<id>\t…` is skipped. */
function parseFlatpakList(text, { scope = 'user' } = {}) {
  const out = [];
  const seen = new Set();
  for (const raw of String(text || '').split('\n')) {
    const cols = raw.replace(/\r$/, '').split('\t').map((c) => c.trim());
    const appId = cols[0] || '';
    if (!FLATPAK_ID_RE.test(appId) || appId.length > 255 || seen.has(appId)) continue;
    seen.add(appId);
    out.push({ appId, name: clip(cols[1], 80) || appId.split('.').pop(), version: clip(cols[2], 40) || null, scope: scope === 'system' ? 'system' : 'user' });
  }
  return out;
}

/** The flatpak app a desktop entry starts (`flatpak run [--opts] <id>`), or null. */
function flatpakOf(row) {
  if (!row || String(row.exec || '').split('/').pop() !== 'flatpak' || (row.args || [])[0] !== 'run') return null;
  return (row.args || []).slice(1).find((a) => !a.startsWith('-') && FLATPAK_ID_RE.test(a)) || null;
}

/** A .desktop file → a witnessed row (`parse` = the engine's own reader, app-manifest parseDesktopFile — handed in, this
 *  file imports nothing — then this group's id + source). */
function desktopWitness(text, { path: p = '', scope = 'user', validate = null, parse = null } = {}) {
  const stem = slug(String(p).split('/').pop().replace(/\.desktop$/, ''));
  if (!stem) return { ok: false, error: 'no file name' };
  if (typeof parse !== 'function') return { ok: false, error: 'no desktop-file reader' };
  let r;
  try { r = parse(text, { entry: 'seen', path: p || null, primary: true }); } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  if (!r.ok) return r;
  const row = { ...r.row, id: `${WITNESS_PREFIX}d.${stem}`.slice(0, 64), witnessed: true, source: scope === 'system' ? 'desktop-system' : 'desktop-user' };
  delete row.package;
  const fp = flatpakOf(row);
  if (fp) row.flatpak = fp;
  if (typeof validate === 'function') { const v = validate(row); if (!v || !v.ok) return { ok: false, error: `${p || 'the desktop file'}: ${(v && v.error) || 'refused'}` }; }
  return { ok: true, row };
}

/**
 * The group's rows: the flatpaks (user before system) + the desktop entries (the user's before the system's — the XDG
 * rule: a user file of the same name hides the system one, a NoDisplay one included), minus what the engine's catalog
 * already lists (its .desktop paths, its flatpaks) and minus an entry that only starts a listed flatpak. The user's own
 * first (an agent installs as the user), then by name; ≤ WITNESS_MAX. `desktops` = [{path, text, scope}]; `catalog` = the engine's rows (app-serve catalogRows).
 */
function witnessRows({ flatpaks = [], desktops = [], catalog = [], validate = null, parse = null } = {}) {
  const engineDesktops = new Set(), engineFlatpaks = new Set();
  for (const r of catalog || []) { if (r && r.desktop) engineDesktops.add(String(r.desktop)); const fp = flatpakOf(r); if (fp) engineFlatpaks.add(fp); }
  const rows = [], ids = new Set(), fps = new Set();
  const take = (row) => { if (ids.has(row.id) || rows.length >= WITNESS_MAX) return; ids.add(row.id); rows.push(row); };
  for (const f of [...(flatpaks || [])].sort((a, b) => (a.scope === 'user' ? 0 : 1) - (b.scope === 'user' ? 0 : 1))) {
    if (!f || !FLATPAK_ID_RE.test(String(f.appId || '')) || engineFlatpaks.has(f.appId) || fps.has(f.appId)) continue;
    fps.add(f.appId);
    const row = { id: `${WITNESS_PREFIX}f.${slug(f.appId)}`.slice(0, 64), label: clip(f.name, 80) || f.appId, exec: 'flatpak', args: ['run', f.appId], category: 'app', witnessed: true, source: f.scope === 'system' ? 'flatpak-system' : 'flatpak-user', flatpak: f.appId, ...(f.version ? { version: f.version } : {}) };
    if (typeof validate === 'function' && !(validate(row) || {}).ok) continue;
    take(row);
  }
  const stems = new Set();
  for (const d of [...(desktops || [])].sort((a, b) => (a.scope === 'system' ? 1 : 0) - (b.scope === 'system' ? 1 : 0))) {
    if (!d || typeof d.path !== 'string') continue;
    const stem = d.path.split('/').pop();
    if (stems.has(stem)) continue; // the user's file of that name decided (shown, hidden or broken)
    stems.add(stem);
    if (engineDesktops.has(d.path)) continue;
    const w = desktopWitness(d.text, { path: d.path, scope: d.scope, validate, parse });
    if (!w.ok || (w.row.flatpak && (fps.has(w.row.flatpak) || engineFlatpaks.has(w.row.flatpak)))) continue;
    take(w.row);
  }
  const rank = (r) => (/-user$/.test(r.source) ? 0 : 1); // what you (or an agent as you) installed first, then the system's
  return rows.sort((a, b) => rank(a) - rank(b) || a.label.toLowerCase().localeCompare(b.label.toLowerCase()) || (a.id < b.id ? -1 : 1));
}

/** The refresh rule: an install through the door, the helper's turn end and "Check again" re-list at once; a launcher
 *  open re-lists when nothing was listed yet, when a witnessed directory changed (`sig` ≠ `sigNow`), or every 10 min. */
function refreshVerdict({ listedAt = null, sig = null, sigNow = null, now = Date.now(), reason = 'open' } = {}) {
  if (FORCED.has(reason)) return { due: true, why: reason };
  if (!Number.isFinite(listedAt)) return { due: true, why: 'never-listed' };
  if (sigNow != null && sigNow !== sig) return { due: true, why: 'changed' };
  if (now - listedAt >= WITNESS_REFRESH_MS) return { due: true, why: 'stale' };
  return { due: false, why: 'fresh' };
}

const fill = (s, vars = {}) => String(s).replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
const PLACE_HERE = i18nKey('this VibeSpace machine ({name})');
const PLACE_HERE_BARE = i18nKey('this VibeSpace machine');
/** THE place an install landed, in words (the door's result + the helper's outcome): this hub by its own name, a paired
 *  machine by its label. `tr` = the client's t (the keys above are its dictionary's); absent ⇒ English (the agent's). */
function installPlace({ hostId = 'local', label = '', localName = '' } = {}, tr = fill) {
  if (!hostId || hostId === 'local') return localName ? tr(PLACE_HERE, { name: clip(localName, 64) }) : tr(PLACE_HERE_BARE);
  return clip(label || hostId, 80);
}

module.exports = { parseFlatpakList, desktopWitness, witnessRows, refreshVerdict, installPlace, flatpakOf, WITNESS_PREFIX, WITNESS_MAX, DESKTOP_FILES_MAX, WITNESS_BUDGET_MS, WITNESS_REFRESH_MS, WITNESS_FILE, FLATPAK_COLUMNS, WITNESS_SOURCES };
