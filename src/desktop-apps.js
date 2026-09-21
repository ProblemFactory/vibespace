'use strict';
/**
 * DESKTOP APPS — the PURE model (docs/design-desktop-apps.zh.md §2 row 1;
 * P8-1, 2026-09-13). Imports nothing but the shared keeper constants
 * (src/keeper-limits.js), touches no file system, starts no process.
 *
 * What lives here and nowhere else:
 *   • the registry ROW shape + `validateAppRow` / `validateLaunchRequest`
 *     (an `exec` comes from the registry or from the human in the launch
 *     dialog — never from an agent, §5)
 *   • `DISPLAY_BACKENDS` — the picture-backend CAPABILITY TABLE (§3): one row
 *     per rung, each declaring `perWindow`, `adaptive`, `needs` (alternative
 *     binary groups), `recipes` (needs-group `via` → the NAME of its bring-up
 *     recipe in desktop-display.js's `RECIPES` table) and `stream` ('rfb' |
 *     'xpra'). A NEW rung is one row here + one recipe in desktop-display.js
 *     + one relay in desktop-stream.js — the rule §2 states in bold, and
 *     since r2 a rule the keeper cannot break: it looks the recipe UP and
 *     names no rung.
 *   • `resolveBackend(hostFacts, prefs)` — the ladder: first rung whose
 *     `needs` are all present wins; every rung it fell past is reported with
 *     its reason, spelled exactly as §3's log line states it
 *     (`backend fallback: xpra→vnc-display (xpra not on PATH)`), so the
 *     record's `fallbackWhy` and the window's status chip say the same words.
 *   • the app-session STATE MACHINE `launching → ready → exited | failed`
 *     (§2) and the idle / runaway / cap / adoption VERDICTS the keeper acts
 *     on — decisions here, acts in the keeper.
 *
 * `hostFacts` is whatever desktop-display.js measured: `{ bins: { name:
 * path|null }, singletonRunning }`. Nothing in this file asks the machine.
 */
const LIMITS = require('./keeper-limits');

/** The fixed stream id of the pre-existing in-container desktop (src/vnc.js)
 *  on the ONE ws bridge — `/api/vnc` is an alias for `/api/desktop/<this>/stream`. */
const DESKTOP_SINGLETON_ID = 'desktop-singleton';

const APP_STATES = Object.freeze(['launching', 'ready', 'exited', 'failed']);
const LIVE_STATES = Object.freeze(['launching', 'ready']);
/** Default idle timeout (DA3): 30 min without INPUT ⇒ stop; 0 = never. */
const DEFAULT_IDLE_TIMEOUT_MIN = 30;

// ── §3 the backend ladder ───────────────────────────────────────────────────
// `needs` = ANY of these groups fully present. `via` is the group that
// matched, joined with '+', and `recipes[via]` NAMES the bring-up recipe
// desktop-display.js runs for it (`RECIPES[name]`) — the keeper looks the name
// up and never spells a rung (r2: it used to be a string switch on `via`, so
// a fourth rung added here resolved, was chosen, and died at bring-up with
// "unknown bring-up"). The record stores `via` as a fact beside `backend`.
const DISPLAY_BACKENDS = Object.freeze([
  Object.freeze({
    id: 'xpra', label: 'xpra', perWindow: true, adaptive: true, stream: 'xpra',
    needs: Object.freeze([Object.freeze(['xpra'])]),
    recipes: Object.freeze({ xpra: 'xpra-seamless' }),
    // P8-1: probed + recorded only; the relay is a named refusal in
    // desktop-stream.js until P8-2 lands the HTML5 client (D21 (c)).
    wired: false,
  }),
  Object.freeze({
    id: 'vnc-display', label: 'vnc-display', perWindow: false, adaptive: false, stream: 'rfb',
    needs: Object.freeze([Object.freeze(['Xvnc']), Object.freeze(['Xvfb', 'x11vnc'])]),
    // one pid serves both X and RFB / an X server, then a picture server on it
    recipes: Object.freeze({ Xvnc: 'x-serves-rfb', 'Xvfb+x11vnc': 'x-then-server' }),
    wired: true,
  }),
  Object.freeze({
    id: 'desktop-singleton', label: 'desktop-singleton', perWindow: false, adaptive: false, stream: 'rfb',
    // the existing src/vnc.js stack: an Xvnc-style binary, or a port that
    // already listens (bring-your-own / adopted) — desktop-display reports
    // the latter as the pseudo-binary `desktop-singleton:running`
    needs: Object.freeze([Object.freeze(['Xtigervnc']), Object.freeze(['Xvnc']), Object.freeze(['desktop-singleton:running'])]),
    recipes: Object.freeze({ Xtigervnc: 'shared', Xvnc: 'shared', 'desktop-singleton:running': 'shared' }),
    wired: true,
  }),
]);
const BACKEND_IDS = Object.freeze(DISPLAY_BACKENDS.map((b) => b.id));
const backendById = (id, table = DISPLAY_BACKENDS) => table.find((b) => b.id === id) || null;
/** The bring-up recipe name for a (backend, via) pair, or null when the table
 *  names none — the keeper refuses such a pair BY NAME instead of guessing. */
function recipeFor(backend, via, table = DISPLAY_BACKENDS) {
  const b = backendById(backend, table);
  if (!b || !b.recipes || typeof via !== 'string') return null;
  return Object.prototype.hasOwnProperty.call(b.recipes, via) ? b.recipes[via] : null;
}

/** Which of a rung's alternative groups is satisfied by `bins`, or the
 *  missing-list text for each group when none is. */
function needsVerdict(rung, bins) {
  const missing = [];
  for (const group of rung.needs) {
    const gone = group.filter((b) => !bins[b]);
    if (!gone.length) return { ok: true, via: group.join('+'), missing: [] };
    missing.push(`${group.join('+')} not on PATH`);
  }
  return { ok: false, via: null, missing };
}

/**
 * The ladder. `hostFacts.bins` maps binary name → path|null (desktop-display
 * fills it); `prefs.backendPrefs` (a registry row's) may REORDER or RESTRICT
 * the rungs but can never name one the table does not have; `table` defaults
 * to DISPLAY_BACKENDS (a suite hands a copy with a fourth rung to prove that
 * a rung IS one row). Returns
 *   { backend, via, recipe, stream, fallbackWhy, ladder: [{ backend, ok, via, recipe, why }] }
 * `fallbackWhy` is null when the FIRST rung won; otherwise the reasons of
 * every rung fallen past, joined with '; ' — the exact text the log line and
 * the status chip print. `backend` is null (and `fallbackWhy` says why) when
 * no rung can run.
 */
function resolveBackend(hostFacts = {}, prefs = {}, table = DISPLAY_BACKENDS) {
  const bins = (hostFacts && hostFacts.bins) || {};
  const effBins = { ...bins };
  if (hostFacts && hostFacts.singletonRunning) effBins['desktop-singleton:running'] = true;
  let order = table;
  const ids = table.map((b) => b.id);
  const pref = Array.isArray(prefs && prefs.backendPrefs) ? prefs.backendPrefs.filter((id) => ids.includes(id)) : null;
  if (pref && pref.length) order = pref.map((id) => backendById(id, table));
  // EVERY rung is judged (the route reports each one's availability with its
  // reason — a user choosing an install sees what each would need); the FIRST
  // rung that can run wins, and the reasons of the rungs above it are its
  // fallbackWhy.
  // A rung whose binary is present but whose relay is NOT WIRED (xpra until P8-2) is
  // reported as present and passed over — it cannot run. 2.369.131: the day xpra was
  // installed on this box the ladder chose it and the keeper refused every desktop-app
  // launch with backend-not-wired (a named 409, but a refusal where vnc-display had
  // been working). DA1 ("installed ⇒ preferred") applies to a WIRED rung.
  const ladder = order.map((rung) => { const v = needsVerdict(rung, effBins); const wired = rung.wired !== false; const ok = v.ok && wired; return { backend: rung.id, ok, present: v.ok, via: v.via, recipe: v.ok ? recipeFor(rung.id, v.via, table) : null, why: ok ? null : (v.ok ? `${rung.id} present (${v.via}) but not wired until P8-2` : v.missing.join('; ')) }; }); // a present rung reports the recipe it WOULD use even when unwired (the launcher names it)
  const winner = ladder.findIndex((r) => r.ok);
  if (winner < 0) return { backend: null, via: null, recipe: null, stream: null, fallbackWhy: ladder.map((r) => r.why).join('; ') || 'no display backend', ladder };
  const fell = ladder.slice(0, winner).map((r) => r.why);
  return { backend: ladder[winner].backend, via: ladder[winner].via, recipe: ladder[winner].recipe, stream: backendById(ladder[winner].backend, table).stream, fallbackWhy: fell.length ? fell.join('; ') : null, ladder };
}

/** The §3 log line for a resolved ladder, or null when nothing fell. */
function fallbackLogLine(resolved) {
  if (!resolved || !resolved.backend || !resolved.fallbackWhy) return null;
  const first = resolved.ladder[0];
  if (!first || first.backend === resolved.backend) return null;
  return `[desktop] backend fallback: ${first.backend}→${resolved.backend} (${resolved.fallbackWhy})`;
}

// ── registry rows + launch requests ─────────────────────────────────────────
const ID_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const ENV_KEY_RE = /^[A-Z_][A-Z0-9_]*$/;
/** Env the KEEPER owns for every app it starts — a row may not set them. */
const KEEPER_ENV = Object.freeze(['DISPLAY', 'XAUTHORITY', 'WAYLAND_DISPLAY', 'XDG_SESSION_TYPE', 'VIBESPACE_DESKTOP_APP']);
const cleanStr = (s, max) => typeof s === 'string' && s.length > 0 && s.length <= max && !/[\0\r\n]/.test(s);

function validateAppRow(row) {
  if (!row || typeof row !== 'object') return { ok: false, error: 'row must be an object' };
  if (!ID_RE.test(String(row.id || ''))) return { ok: false, error: `id must match ${ID_RE}` };
  if (!cleanStr(row.label, 80)) return { ok: false, error: 'label must be a non-empty string ≤ 80 chars' };
  if (!cleanStr(row.exec, 512)) return { ok: false, error: 'exec must be a non-empty string' };
  if (row.args !== undefined && !(Array.isArray(row.args) && row.args.every((a) => typeof a === 'string' && !/\0/.test(a)))) return { ok: false, error: 'args must be an array of strings' };
  if (row.cwd !== undefined && row.cwd !== null && !cleanStr(row.cwd, 4096)) return { ok: false, error: 'cwd must be a non-empty string' };
  if (row.env !== undefined && row.env !== null) {
    if (typeof row.env !== 'object' || Array.isArray(row.env)) return { ok: false, error: 'env must be an object' };
    for (const [k, v] of Object.entries(row.env)) {
      if (!ENV_KEY_RE.test(k)) return { ok: false, error: `env key ${JSON.stringify(k)} is not a valid name` };
      if (KEEPER_ENV.includes(k)) return { ok: false, error: `env ${k} is set by the keeper, not by a row` };
      if (typeof v !== 'string' || /\0/.test(v)) return { ok: false, error: `env ${k} must be a string` };
    }
  }
  if (row.category !== undefined && row.category !== null && !cleanStr(row.category, 40)) return { ok: false, error: 'category must be a short string' };
  if (row.backendPrefs !== undefined && row.backendPrefs !== null) {
    if (!Array.isArray(row.backendPrefs) || row.backendPrefs.some((b) => !BACKEND_IDS.includes(b))) return { ok: false, error: `backendPrefs may only name ${BACKEND_IDS.join('/')}` };
  }
  if (row.needsWayland !== undefined && typeof row.needsWayland !== 'boolean') return { ok: false, error: 'needsWayland must be a boolean' };
  return { ok: true, error: null };
}

/**
 * The launch dialog's two shapes (§2 routes): `{appId}` or `{exec, args, cwd}`.
 * Returns { ok, error, launch } where launch is
 *   { source:'registry', row }  |  { source:'adhoc', row:{ id:null, label, exec, args, cwd } }
 * `registry` is the array of rows the keeper serves. Nothing here checks PATH
 * or the file system — the keeper does (exec resolved on PATH, cwd must exist).
 */
function validateLaunchRequest(body, registry = []) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'expected a JSON object' };
  if (body.appId !== undefined) {
    if (!ID_RE.test(String(body.appId))) return { ok: false, error: 'appId is not a valid id' };
    const row = registry.find((r) => r.id === body.appId);
    if (!row) return { ok: false, error: `unknown appId ${JSON.stringify(body.appId)}` };
    return { ok: true, error: null, launch: { source: 'registry', row } };
  }
  const row = { id: null, label: cleanStr(body.label, 80) ? body.label : null, exec: body.exec, args: body.args === undefined ? [] : body.args, cwd: body.cwd === undefined || body.cwd === '' ? null : body.cwd };
  if (!row.label) row.label = typeof row.exec === 'string' ? row.exec.split('/').pop().slice(0, 80) : null;
  const v = validateAppRow({ ...row, id: 'adhoc' });
  if (!v.ok) return { ok: false, error: v.error };
  return { ok: true, error: null, launch: { source: 'adhoc', row } };
}

/** The small default registry (§2 "a small default registry"): every row is
 *  PRESENCE-CHECKED by the keeper against PATH before it is offered — a row
 *  whose exec is absent is served with `available:false` and the reason, never
 *  hidden and never assumed. Order = what a first user most likely wants. */
const DEFAULT_REGISTRY = Object.freeze([
  Object.freeze({ id: 'xterm', label: 'xterm', exec: 'xterm', args: Object.freeze([]), category: 'terminal' }),
  Object.freeze({ id: 'gnome-calculator', label: 'Calculator (GNOME)', exec: 'gnome-calculator', args: Object.freeze([]), category: 'utility' }),
  Object.freeze({ id: 'gedit', label: 'gedit', exec: 'gedit', args: Object.freeze([]), category: 'editor' }),
  Object.freeze({ id: 'firefox', label: 'Firefox', exec: 'firefox', args: Object.freeze(['--new-instance']), category: 'browser' }),
  Object.freeze({ id: 'chromium', label: 'Chromium', exec: 'chromium', args: Object.freeze([]), category: 'browser' }),
  Object.freeze({ id: 'code', label: 'VS Code', exec: 'code', args: Object.freeze(['--new-window', '--wait']), category: 'editor' }),
]);

// ── the app-session state machine (§2) ──────────────────────────────────────
/** state × event → next state, or null when the event is not legal there.
 *  Events: 'server-listening' (the picture server answered its banner),
 *  'app-exit' (the application process ended), 'stop' (a human / idle /
 *  runaway stop that completed), 'spawn-error' (a process failed to start),
 *  'runaway' (the guard tripped), 'display-gone' (X died under the app). */
const TRANSITIONS = Object.freeze({
  launching: Object.freeze({ 'server-listening': 'ready', 'app-exit': 'exited', stop: 'exited', 'spawn-error': 'failed', 'display-gone': 'failed', runaway: 'failed' }),
  ready: Object.freeze({ 'app-exit': 'exited', stop: 'exited', runaway: 'failed', 'display-gone': 'failed' }),
  exited: Object.freeze({}),
  failed: Object.freeze({}),
});
function transition(state, event) {
  const row = TRANSITIONS[state];
  if (!row) return null;
  return row[event] || null;
}
const isLiveState = (s) => LIVE_STATES.includes(s);
const isTerminalState = (s) => s === 'exited' || s === 'failed';

// ── verdicts the keeper acts on ─────────────────────────────────────────────
/** Idle arithmetic for one record: `lastInputAt` is the last INPUT the bridge
 *  reported (falls back to startedAt), `idleTimeoutMs` 0 ⇒ never expires. */
function idleState(rec, now, idleTimeoutMs) {
  const since = Number(rec && (rec.lastInputAt || rec.startedAt)) || now;
  const idleMs = Math.max(0, now - since);
  const limit = Number(idleTimeoutMs) > 0 ? Number(idleTimeoutMs) : 0;
  return { idleMs, limit, remainingMs: limit ? Math.max(0, limit - idleMs) : null, expired: !!limit && idleMs >= limit };
}

/** The concurrency ceiling: `live` = the records in a live state. Returns
 *  null when a launch may proceed, else a refusal naming the holders. */
function capVerdict(live, limits = LIMITS) {
  const cap = Number(limits.CONCURRENT_CAP) || LIMITS.CONCURRENT_CAP;
  if (live.length < cap) return null;
  const names = live.map((r) => `${r.label || r.exec || r.id} (${r.id})`);
  return { code: 'cap', cap, holders: live.map((r) => r.id), error: `desktop app ceiling reached (${live.length}/${cap} running: ${names.join(', ')}) — stop one first` };
}

/**
 * ONE runaway sample (the opencode-serve guard shape, verbatim logic):
 * `sample` = { cpuTicks, rssBytes } read now, `prev` = { at, cpuTicks } from the
 * previous tick (or null), `hotSince` = when sustained-hot began (0 = not hot).
 * Returns { cpuPct, hotSince, why } — `why` non-null ⇒ stop + park.
 */
function runawayVerdict(sample, prev, hotSince, now, { clkTck = 100, limits = LIMITS } = {}) {
  if (!sample) return { cpuPct: null, hotSince: 0, why: null };
  let cpuPct = null;
  if (prev && now > prev.at) cpuPct = (sample.cpuTicks - prev.cpuTicks) * 100000 / clkTck / (now - prev.at);
  let why = null;
  let hot = hotSince || 0;
  if (sample.rssBytes > limits.GUARD_RSS_BYTES) {
    why = `RSS ${(sample.rssBytes / 2 ** 30).toFixed(1)} GB (limit ${(limits.GUARD_RSS_BYTES / 2 ** 30).toFixed(1)} GB)`;
  } else if (cpuPct !== null && cpuPct > limits.GUARD_CPU_PCT) {
    if (!hot) hot = now;
    if (now - hot >= limits.GUARD_CPU_SUSTAIN_MS) why = `${cpuPct.toFixed(0)}% CPU sustained for ${Math.round((now - hot) / 60000)} min (limit ${limits.GUARD_CPU_PCT}%)`;
  } else hot = 0;
  return { cpuPct, hotSince: hot, why };
}

/** Is a registry app still parked after a runaway? `parkedUntil` = the map
 *  the keeper persists ({ appId: until }). */
function runawayParkVerdict(appId, parkedUntil, now) {
  const until = appId && parkedUntil ? Number(parkedUntil[appId]) : 0;
  if (!until || until <= now) return null;
  return { code: 'runaway-parked', until, error: `${appId} was stopped as a runaway; not launching it again for ${Math.ceil((until - now) / 60000)} min` };
}

/**
 * Boot ADOPTION (§4): a record is alive only when its X server AND its
 * picture server AND its app are the processes it recorded — pid AND
 * starttime — and the picture port still answers. `alive` = { x, server, app }
 * booleans the keeper measured; `portOk` = the banner probe. Returns either
 * { state:'ready', adopted:true } or { state:'exited'|'failed', lastError }.
 */
function adoptVerdict(rec, alive, portOk) {
  if (!rec || !isLiveState(rec.state)) return null;
  if (!alive.x) return { state: 'exited', lastError: rec.lastError || 'X display gone while VibeSpace was down' };
  if (!alive.app) return { state: 'exited', lastError: rec.lastError || 'application exited while VibeSpace was down' };
  if (!alive.server || !portOk) return { state: 'failed', lastError: rec.lastError || 'picture server not answering after restart' };
  return { state: 'ready', adopted: true };
}

/** The ws bridge target for a record: null until the picture server listens. */
function streamTargetOf(rec) {
  if (!rec || rec.state !== 'ready' || !rec.port) return null;
  const b = backendById(rec.backend);
  return { kind: b ? b.stream : 'rfb', port: rec.port, backend: rec.backend };
}

/** New record shape (§4) — facts only. */
function newRecord({ id, label, exec, args, cwd, env, source, backend, via, fallbackWhy, idleTimeoutMs, now }) {
  return {
    id, label, exec, args: Array.isArray(args) ? args.slice() : [], cwd: cwd || null, env: env && Object.keys(env).length ? { ...env } : undefined,
    source, backend, via: via || null, fallbackWhy: fallbackWhy || null,
    display: null, port: null, pids: { x: null, app: null, server: null, wm: null }, starts: { x: null, app: null, server: null, wm: null },
    startedAt: now, state: 'launching', exitCode: null, lastError: null,
    idleTimeoutMs: Number(idleTimeoutMs) || 0, lastInputAt: now,
  };
}

module.exports = {
  LIMITS, DESKTOP_SINGLETON_ID, APP_STATES, LIVE_STATES, DEFAULT_IDLE_TIMEOUT_MIN, KEEPER_ENV,
  DISPLAY_BACKENDS, BACKEND_IDS, backendById, recipeFor, needsVerdict, resolveBackend, fallbackLogLine,
  validateAppRow, validateLaunchRequest, DEFAULT_REGISTRY,
  TRANSITIONS, transition, isLiveState, isTerminalState,
  idleState, capVerdict, runawayVerdict, runawayParkVerdict, adoptVerdict, streamTargetOf, newRecord,
};
