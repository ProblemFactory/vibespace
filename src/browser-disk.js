'use strict';
/**
 * lane browser-disk-sample (B-5fab): THE BROWSER DISK BUDGET'S MEASURING HALF — PURE (imports keeper-limits +
 * runaway-guard only, touches no fs, spawns nothing). rel236 shipped BROWSER_DISK_BYTES and runaway-guard's
 * diskVerdict, but nothing sampled a profile directory, so the budget never fired (a fleet user's pod disk filled with
 * profiles nobody saw). src/server/browser-disk-run.js is the ORCH half: the minute clock, ONE `du -sk` child at a time,
 * the report through reportTransition / reportDelivery, the For-you notice. REPORTED, never a stop (the keepers' law).
 *
 *   diskSampleStep(state, event, now) — WHEN to sample: every DISK_SAMPLE_EVERY_MS per profile, plus one at its
 *       browser's start / stop (debounced to one per DISK_SLOT_MS); never two profiles in the same minute (the slot is
 *       the start of the last sample, whoever it was), never a second child while one runs.
 *   parseDu / duVerdict — the `du -sk` answer (GNU and BSD print `<KiB><TAB><path>`), REAL blocks: `--apparent-size`
 *       is GNU-only, and a sparse file only costs the blocks it holds.
 *   growthOf / topDirs / expandNames — what is NAMED in the notice: the top 3 subdirectories (one `du -sk` child over
 *       the profile's entries, only when a notice is being filed).
 */
const LIMITS = require('./keeper-limits');
const RG = require('./runaway-guard');

const DISK_SAMPLE_EVERY_MS = 15 * 60 * 1000;
const DISK_SLOT_MS = 60 * 1000;
const DISK_DU_TIMEOUT_MS = 60 * 1000;
const DISK_UNKNOWN_LOG_MS = 60 * 60 * 1000;
const DISK_TOP_N = 3;
/** Chrome's own profile folders inside a user-data-dir: listed by their children (Default/Cache, not "Default"). */
const PROFILE_SUBDIR = /^(?:Default|Profile \d+)$/;

/**
 * The cadence as a step function. state = { profiles: {id: {lastAt, kickAt, lastKickAt}}, slotAt, running: {id, at} }.
 * event = {type:'tick', ids} (the minute clock, with the profiles to keep) | {type:'start'|'stop', id} (its browser) |
 * {type:'done', id} (the child ended, measured or not — a timeout keeps the 15-min schedule from the sample's start).
 * → { state, sample: {id, why: 'start'|'stop'|'due'} | null }. Never mutates its input.
 */
function diskSampleStep(state, event, now) {
  const src = state && state.profiles ? state.profiles : {};
  const profiles = {};
  for (const [id, p] of Object.entries(src)) profiles[id] = { ...p };
  const s = { profiles, slotAt: state && Number.isFinite(state.slotAt) ? state.slotAt : null, running: state && state.running ? { ...state.running } : null };
  const ev = event || {};
  const add = (id) => { if (!profiles[id]) profiles[id] = { lastAt: null, kickAt: null, kickWhy: null, lastKickAt: null }; return profiles[id]; };
  if (ev.type === 'tick' && Array.isArray(ev.ids)) {
    const keep = new Set(ev.ids.map(String));
    for (const id of Object.keys(profiles)) if (!keep.has(id)) delete profiles[id];
    for (const id of keep) add(id);
  } else if ((ev.type === 'start' || ev.type === 'stop') && ev.id) {
    const p = add(String(ev.id));
    if (p.lastKickAt === null || now - p.lastKickAt >= DISK_SLOT_MS) { p.kickAt = now; p.kickWhy = ev.type; p.lastKickAt = now; }
  } else if (ev.type === 'done' && s.running && s.running.id === String(ev.id)) s.running = null;
  // a child is killed at DISK_DU_TIMEOUT_MS; a `done` that never came is forgotten after twice that (never a wedged clock)
  if (s.running && now - s.running.at < 2 * DISK_DU_TIMEOUT_MS + DISK_SLOT_MS) return { state: s, sample: null };
  s.running = null;
  if (s.slotAt !== null && now - s.slotAt < DISK_SLOT_MS) return { state: s, sample: null };
  // first wanted, first served: a profile is wanted from its due time (never measured = at once) or its start/stop,
  // whichever is earlier — busy start/stops never starve a profile that is due (each holds at most ONE want)
  const dueAt = (p) => (p.lastAt === null ? -Infinity : p.lastAt + DISK_SAMPLE_EVERY_MS);
  const wantAt = (p) => Math.min(dueAt(p), p.kickAt !== null ? p.kickAt : Infinity);
  const id = Object.keys(profiles).filter((k) => wantAt(profiles[k]) <= now).sort((a, b) => wantAt(profiles[a]) - wantAt(profiles[b]))[0];
  if (!id) return { state: s, sample: null };
  const p = profiles[id], why = dueAt(p) <= now ? 'due' : p.kickWhy;
  p.lastAt = now; p.kickAt = null; p.kickWhy = null;
  s.slotAt = now; s.running = { id, at: now };
  return { state: s, sample: { id, why } };
}

/** `du -sk` lines → [{kb, path}] (GNU and BSD: `<KiB><TAB><path>`); anything else is skipped. */
function parseDu(stdout) {
  const out = [];
  for (const raw of String(stdout || '').split('\n')) {
    const m = /^(\d+)\s+(.+)$/.exec(raw.replace(/\r$/, ''));
    if (m && m[2].trim()) out.push({ kb: Number(m[1]), path: m[2] });
  }
  return out;
}

/** One `du -sk <dir>` child's answer → {state:'ok', bytes, partial} | {state:'unknown', why}. A timeout or a signal is
 *  unknown; exit ≠ 0 is unknown UNLESS the total was printed and every complaint is a file that vanished mid-walk (a
 *  running Chrome rotates its cache files — the total is then a lower bound by those files, said `partial`). */
function duVerdict(r, dir) {
  const a = r || {};
  if (a.spawnError) return { state: 'unknown', why: `du could not be started (${a.spawnError})` };
  if (a.timedOut || a.signal) return { state: 'unknown', why: `du did not finish within ${Math.round(DISK_DU_TIMEOUT_MS / 1000)} s` };
  const rows = parseDu(a.stdout);
  const total = rows.find((x) => x.path === String(dir)) || (rows.length === 1 ? rows[0] : null);
  const complaints = String(a.stderr || '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (a.code !== 0) {
    if (total && complaints.length && complaints.every((l) => /No such file or directory/.test(l))) return { state: 'ok', bytes: total.kb * 1024, partial: true };
    return { state: 'unknown', why: `du exited ${a.code}${complaints.length ? `: ${complaints[0].slice(0, 160)}` : ''}` };
  }
  if (!total) return { state: 'unknown', why: 'du printed no total' };
  return { state: 'ok', bytes: total.kb * 1024, partial: false };
}

/** Two measured facts → {bytes, ms} (next − prev), or null when either is not a measurement. */
function growthOf(prev, next) {
  if (!prev || !next || !Number.isFinite(prev.bytes) || !Number.isFinite(next.bytes) || !Number.isFinite(prev.at) || !Number.isFinite(next.at) || next.at < prev.at) return null;
  return { bytes: next.bytes - prev.bytes, ms: next.at - prev.at };
}

/** Which top-level entries are listed by their children (Chrome's own profile folders) — the rest are measured whole. */
function expandNames(names) { return (names || []).filter((n) => PROFILE_SUBDIR.test(String(n))); }

/** The second child's rows → the largest `n` as {name (relative to dir), bytes}, the largest first. */
function topDirs(rows, dir, n = DISK_TOP_N) {
  const base = String(dir).replace(/\/+$/, '') + '/';
  return (rows || []).filter((r) => String(r.path).startsWith(base)).map((r) => ({ name: String(r.path).slice(base.length), bytes: r.kb * 1024 }))
    .sort((a, b) => b.bytes - a.bytes || (a.name < b.name ? -1 : 1)).slice(0, n);
}

/** "2.4 GB" / "420 MB" / "12 KB" — the notice's size words (binary units, like the rest of the keeper's sizes). */
const sizeWords = RG.diskSizeText;

/** The For-you notice: the TEXT names the profile, the size, the limit, what grew and the remedy (via runaway-guard's
 *  resourceNoticeText, the same words module as the memory report); the DETAIL says how it was measured and when it is
 *  said again. */
function diskNotice({ label, verdict, top = [], growth = null, at = null, limits = LIMITS }) {
  const L = limits || LIMITS;
  const name = String(label || '').slice(0, 80);
  const text = RG.resourceNoticeText({ who: `The agent browser profile "${name}"`, where: 'Agent browser panel', verdict, grew: (top || []).map((d) => `${d.name} ${sizeWords(d.bytes)}`), remedy: `Delete… in the Agent browser panel frees it; New profile… copied from "${name}" keeps its logins` });
  const fr = Number.isFinite(L.REPORT_REARM_FRACTION) ? L.REPORT_REARM_FRACTION : LIMITS.REPORT_REARM_FRACTION;
  const lim = verdict && Number.isFinite(verdict.limit) ? verdict.limit : L.BROWSER_DISK_BYTES;
  const grew = growth && growth.bytes > 0 && growth.ms > 0 ? ` It grew ${sizeWords(growth.bytes)} in the ${Math.max(1, Math.round(growth.ms / 60000))} min before.` : '';
  const when = Number.isFinite(at) ? ` at ${new Date(at).toISOString().slice(11, 16)} UTC` : '';
  const detail = `Measured with du -sk${when} — the blocks the folder really holds (a sparse file counts only what it holds).${grew} Said once; said again only after it falls under ${sizeWords(fr * lim)} and grows past ${sizeWords(lim)} again. Nothing is stopped or deleted by itself.`;
  return { text, detail };
}
/** The notice's opening words for one profile — a restart's open notice is found by them (never filed twice). */
function diskNoticeHead(label) { return `The agent browser profile "${String(label || '').slice(0, 80)}" is `; }

/** The ONE disk fact every surface reads: {bytes, at, state, limit} — state 'ok' | 'over' | 'unknown' (+why) |
 *  'pending' (not measured yet) | 'not-measured' (+code disk_not_measured, why: a paired machine's / no kept folder). */
function diskFact({ measured = null, last = null, hostId = null, dir = null, limits = LIMITS } = {}) {
  const limit = (limits && Number.isFinite(limits.BROWSER_DISK_BYTES)) ? limits.BROWSER_DISK_BYTES : LIMITS.BROWSER_DISK_BYTES;
  if (hostId) return { bytes: null, at: null, state: 'not-measured', code: 'disk_not_measured', reason: 'remote', why: 'its folder is on a paired machine — its size is not measured from this server', limit };
  if (!dir) return { bytes: null, at: null, state: 'not-measured', code: 'disk_not_measured', reason: 'no-folder', why: 'VibeSpace keeps no folder for it', limit };
  if (!measured) return { bytes: last && Number.isFinite(last.bytes) ? last.bytes : null, at: last ? last.at : null, state: 'pending', limit };
  if (measured.state !== 'ok') return { bytes: last && Number.isFinite(last.bytes) ? last.bytes : null, at: measured.at || null, state: 'unknown', why: measured.why || 'not measured', limit };
  const v = RG.diskVerdict(measured.bytes, { limits });
  return { bytes: measured.bytes, at: measured.at || null, state: v.over ? 'over' : 'ok', limit, ...(measured.partial ? { partial: true } : {}) };
}

module.exports = { diskSampleStep, parseDu, duVerdict, growthOf, expandNames, topDirs, sizeWords, diskNotice, diskNoticeHead, diskFact,
  DISK_SAMPLE_EVERY_MS, DISK_SLOT_MS, DISK_DU_TIMEOUT_MS, DISK_UNKNOWN_LOG_MS, DISK_TOP_N };
