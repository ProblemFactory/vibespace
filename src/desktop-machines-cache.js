'use strict';
/**
 * THE MACHINE ROWS' LAST KNOWN STATE (lane desktop-picker-instant; owner 2026-10-19 「这个界面的加载时间怎么越来越长了」 —
 * the Desktop picker and the Apps dialog's 「运行于」 sat on 「正在查看机器…」 while GET /api/desktop/machines awaited every
 * machine's LIVE probe: a bounded 3 s dial, the agent's tcp-connect to its VNC port, up to 3 s for the RFB greeting).
 * PURE — imports only the PURE model; the access layer (src/server/desktop-access.js) keeps the entries, the page reads
 * the probe's words.
 *
 *   THE LAW (kb-design-lessons): a dialog's first paint never awaits a device probe — it draws the last known state and
 *   the probe's result arrives as a broadcast (`desktop-machines-updated`).
 *
 * An entry = { row, at, ms }: the machine's last probed row (src/desktop-apps.js machinePickRow's verdict included), when
 * it landed (this hub's clock) and how long the probe took. The route answers every paired machine at once — its entry
 * (+ `probedAt`, `ageMs`, `probeMs`, `stale` past STALE_MS) or, with no history, a 「检查中…」 row (`code: 'checking'`, that
 * row only, never the whole list).
 */
const { DESKTOP_PLATFORMS } = require('./machine-desktop-model.js');

const STALE_MS = 60 * 1000;          // an entry older than this is answered `stale: true` (its refresh is under way)
const REFRESH_FLOOR_MS = 10 * 1000;  // an open this soon after the last probe does not probe again (Check again always does)
const SLOW_PROBE_MS = 2000;          // a probe over this logs a second (warn) line naming its slowest step
const PROBE_STEPS = Object.freeze(['dial', 'forward', 'greeting']);
const FILE_NAME = 'desktop-machines.json';
const FILE_VERSION = 1;
const FILE_MAX_ROWS = 64;

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const entryOf = (known, id) => (known && typeof known.get === 'function' ? known.get(id) : known && typeof known === 'object' ? known[id] : null) || null;

/** How old an entry's probe is: 'none' (never probed) | 'fresh' | 'stale' (older than STALE_MS). */
function freshness(entry, now) {
  const at = entry ? num(entry.at) : null;
  if (at == null) return 'none';
  return now - at > STALE_MS ? 'stale' : 'fresh';
}

/**
 * Does an answer probe this machine again? Never while a probe is in flight (`inFlight` — a second asker JOINS it: one
 * probe per machine at a time); always with no history or on `force` (Check again, the daemon's hello); at once when the
 * link the hub sees NOW (`linkNow`, 'unknown' = no evidence) is not the one the row was probed on — a dropped link is
 * said without waiting for the floor; else only REFRESH_FLOOR_MS after the last probe.
 */
function refreshDue(entry, { now = 0, inFlight = false, force = false, linkNow = null } = {}) {
  if (inFlight) return false;
  if (force) return true;
  const at = entry ? num(entry.at) : null;
  if (at == null) return true;
  const was = entry.row && typeof entry.row.link === 'string' ? entry.row.link : null;
  if (linkNow && linkNow !== 'unknown' && was && linkNow !== was) return true;
  return now - at >= REFRESH_FLOOR_MS;
}

/** The 「检查中…」 row of a machine with NO history: what the hub knows without asking it (its record, its link, the
 *  platform a connected handle reported — a Windows / macOS one is a desktop row already), never pressable until its
 *  probe lands. */
function checkingRow(rec) {
  const r = rec && typeof rec === 'object' ? rec : {};
  const platform = typeof r.platform === 'string' && r.platform ? r.platform : null;
  return {
    hostId: String(r.hostId || ''), label: r.label == null ? null : String(r.label), transport: r.transport === 'dial' ? 'dial' : 'ssh',
    link: typeof r.link === 'string' ? r.link : 'unknown', connected: !!r.connected, capabilities: null, platform,
    selectable: false, code: 'checking', ...(platform && DESKTOP_PLATFORMS.includes(platform) ? { desktop: 'vnc-native', setup: platform } : {}),
    probedAt: null, ageMs: null, probeMs: null, stale: true,
  };
}

/**
 * THE ROUTE'S ROWS, AT ONCE: every paired machine (`recs` = the host records NOW — {hostId, label, transport, link,
 * connected, platform}) from its last probe (`known`: Map hostId → entry), its label as the record says it now; a machine
 * with no entry is a checkingRow. A machine no longer paired is never answered (its entry is not asked).
 */
function answerRows(recs, known, now) {
  return (Array.isArray(recs) ? recs : []).filter((r) => r && r.hostId).map((r) => {
    const e = entryOf(known, r.hostId);
    if (!e || !e.row || typeof e.row !== 'object' || num(e.at) == null) return checkingRow(r);
    return { ...e.row, hostId: r.hostId, label: r.label == null ? (e.row.label == null ? null : e.row.label) : String(r.label), probedAt: e.at, ageMs: Math.max(0, now - e.at), probeMs: num(e.ms), stale: freshness(e, now) !== 'fresh' };
  });
}

/** THE BROADCAST (the cache-invalidation-must-NOTIFY law): every row as the route would answer it now, and which machine's
 *  probe just landed — an open picker / Apps dialog patches its rows in place by hostId. */
function machinesPayload(rows, hostId = null) {
  return { type: 'desktop-machines-updated', hostId: hostId == null ? null : String(hostId), machines: Array.isArray(rows) ? rows : [] };
}

/** A machine's installed-apps list landed (or failed) — the NOTICE only (the list is hundreds of rows): an open machine
 *  dialog whose list is older re-reads it (GET …/machine-desktop/apps — answered from the store, nothing asked again). */
function installedPayload(hostId, answer) {
  const a = answer && typeof answer === 'object' ? answer : {};
  return { type: 'desktop-installed-updated', hostId: String(hostId || ''), listedAt: num(a.listedAt), total: num(a.total), code: typeof a.code === 'string' ? a.code : null };
}

/** THE LOG LINE, one per probe: `[desktop] <host> probed in <ms> ms → <code> (<why>)` — why: picker | recheck | hello |
 *  open | install. */
function probeLine(hostId, ms, code, why) {
  return `[desktop] ${hostId} probed in ${Math.max(0, Math.round(num(ms) || 0))} ms → ${code || 'unknown'} (${why || 'picker'})`;
}

/** A probe over SLOW_PROBE_MS: ONE more (warn) line naming its slowest step — the dial (reaching the machine's agent), the
 *  forward (the agent's tcp-connect to the VNC port) or the greeting (the VNC server's first bytes). → the line | null */
function slowLine(hostId, ms, steps) {
  const total = num(ms);
  if (total == null || total <= SLOW_PROBE_MS) return null;
  const s = steps && typeof steps === 'object' ? steps : {};
  const have = PROBE_STEPS.filter((k) => num(s[k]) != null);
  const worst = have.reduce((a, k) => (a == null || s[k] > s[a] ? k : a), null);
  const parts = have.map((k) => `${k} ${Math.round(s[k])} ms`).join(' · ');
  return `[desktop] ${hostId} probe slow: ${Math.round(total)} ms — ${worst ? `the ${worst} took ${Math.round(s[worst])} ms` : 'no step was timed'}${parts ? ` (${parts})` : ''}`;
}

/** data/desktop-machines.json — a restart paints from it too: { version, rows: { [hostId]: {row, at, ms} } }, at most
 *  FILE_MAX_ROWS, only the machines in `keep` (the ones still paired) when given. */
function toFile(known, keep = null) {
  const rows = {};
  let n = 0;
  const all = known instanceof Map ? [...known.entries()] : Object.entries(known || {});
  for (const [id, e] of all) {
    if (n >= FILE_MAX_ROWS) break;
    if (keep && !keep.has(id)) continue;
    if (!e || !e.row || typeof e.row !== 'object' || num(e.at) == null) continue;
    rows[id] = { row: e.row, at: e.at, ms: num(e.ms) };
    n++;
  }
  return { version: FILE_VERSION, rows };
}

/** The file read back: a malformed entry is dropped, never trusted (this machine's own row is never kept). → Map */
function fromFile(json) {
  const out = new Map();
  const rows = json && typeof json === 'object' && json.version === FILE_VERSION && json.rows && typeof json.rows === 'object' ? json.rows : null;
  if (!rows) return out;
  for (const [id, e] of Object.entries(rows)) {
    if (out.size >= FILE_MAX_ROWS) break;
    if (!id || id.length > 200 || id === 'local' || !e || typeof e !== 'object' || !e.row || typeof e.row !== 'object' || typeof e.row.code !== 'string' || num(e.at) == null) continue;
    out.set(id, { row: { ...e.row, hostId: id }, at: e.at, ms: num(e.ms) });
  }
  return out;
}

/** The page's 技术细节 of a row: { s: seconds since its probe (by the hub's own clock — `ageMs`), ms: how long the probe
 *  took } | null (never probed). */
function probeAge(row) {
  const age = row ? num(row.ageMs) : null;
  if (age == null) return null;
  return { s: Math.max(0, Math.round(age / 1000)), ms: num(row.probeMs) };
}

module.exports = { STALE_MS, REFRESH_FLOOR_MS, SLOW_PROBE_MS, PROBE_STEPS, FILE_NAME, FILE_VERSION, FILE_MAX_ROWS, freshness, refreshDue, checkingRow, answerRows, machinesPayload, installedPayload, probeLine, slowLine, toFile, fromFile, probeAge };
