'use strict';
// THE RESET CLAIM (lane account-reset-door, the owner 2026-11-11: «我手动reset过帐号之后没法通知vibespace…»). The vendor
// resets a lane early on the owner's own press on its site; nothing in a reading says so until a reading of THAT lane
// lands. A person may say «I reset this» — for one lane where it is drawn, or for the whole account — and this module is
// the ONE writer of that word: a CLAIM with its own provenance («person-reset»), never a reading — the usage cache is never
// written here. What the claim changes is the VIEW (src/quota-model.js withResetClaim): a claimed lane whose own reading is
// older than the claim is viewed as reset at the claim, so every surface draws «reset — unconfirmed» and the pool may place.
// A LANE is quota-model's own limit id ('plan:5h' · 'plan:7d' · 'model:<family>'), dated by ITS window (lanesOfReading).
// THE SETTLE (r3): only what a WRITE says about the lane — the write path's statement of the lanes it measured
// (usage-cache-write onLanesRead: every lane a producer stated, at whatever number) — ends a claim, never a stored age: a
// lane stated after its claim is CONFIRMED (its spend dropped by RESET_SEEN_MIN_DROP points or more) or CONTRADICTED (the
// same number again, or more: said once — the row's note and one journal line — and the claim ends, so the wall is back at
// once). A REFUSAL of the lane after the claim (a wall, a banner, a rejected event, the stream wall) contradicts it at once,
// by the refusal's own time and lane — and a stored refusal newer than the claim (the record's `refusedAt`) ends it at a
// read too. A claim nothing settles ends after 7 days. A RESET A READING SHOWS (noteResetSeen) is said ONCE per
// (account, lane, reset instant ± 60 s), and that memory survives a restart.
// THE FILE (data/usage-reset-claims.json, 0600): read once at start and SHAPE-CHECKED — an entry that is not a claim (a
// null, a string «lanes», a lane that is no lane, a claim stamped in the future, a removed account's) is dropped and said
// once; the rest stands. Written off the loop by the atomic-persistence law (tmp opened `wx` 0600, fsync, rename), and
// flushed on the hub's stop path (stopAll at the process's exit — shutdownNow's process.exit, the conversation-index way).
const fs = require('fs');
const path = require('path');
const quotaModel = require('./quota-model.js');

const MAX_AGE_MS = 7 * 86400e3;
const OUTCOME_KEEP_MS = 24 * 3600e3;
const FUTURE_SLACK_MS = 60e3;
const SEEN_SAME_S = 60;
const SEEN_KEEP = 64;                 // the said-once memory per account, newest kept
const SEEN_SPAN_S = 8 * 86400;        // a reset instant outside now ± this is junk (the longest window is a week)
const KEY_RE = /^(?:__global__|[\w-]{1,80})$/;
const OUTCOME_STATES = new Set(['confirmed', 'contradicted', 'reset-seen']);
const _byFile = new Map();
let _exitHooked = false;

/** The hub's one store for a data dir (the usage routes and the pool engine read the same claims). `known(key)` = is this
 *  account still one that takes a claim (a removed account's claims are dropped) — set by the first caller that knows. */
function at(dataDir, { known = null, nameOf = null } = {}) {
  const file = path.join(dataDir, 'usage-reset-claims.json');
  if (!_byFile.has(file)) {
    const st = create({ file });
    _byFile.set(file, st);
    // THE WRITE PATH'S STATEMENTS REACH THE STORE OF THEIR OWN DATA DIR (r3): the lanes a write stated settle a claim on
    // them; a reset a write showed is said once — heard here, whoever wired the hub (the routes, the engine, a harness)
    const mine = (e) => !!e && !!e.cacheDir && path.resolve(path.dirname(String(e.cacheDir))) === path.resolve(dataDir);
    try {
      const W = require('./usage-cache-write.js');
      W.onLanesRead((e) => { if (mine(e)) { try { st.noteLanesRead(e.key, e.lanes); } catch { } } });
      W.onVendorReset((e) => { if (mine(e)) { try { st.noteResetSeen(e.key, e.resets, { name: st.nameOf(e.key) }); } catch { } } });
    } catch { }
  }
  if (!_exitHooked) { _exitHooked = true; process.once('exit', () => { try { stopAll(); } catch { } }); }   // THE STOP PATH: what no async save landed is written as the hub exits
  const s = _byFile.get(file);
  if (typeof known === 'function') s.setKnown(known);
  if (typeof nameOf === 'function') s.setNameOf(nameOf);
  return s;
}
/** The hub's stop path: every store's unsaved word lands now (synchronously). */
function stopAll() { let ok = true; for (const s of _byFile.values()) { try { if (!s.flushSync()) ok = false; } catch { ok = false; } } return ok; }

const finite = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const short = (v, n = 60) => (typeof v === 'string' && v ? v.slice(0, n) : null);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
/** ONE shape check for whatever the file holds → { state, dropped: [why…] } */
function sanitize(j, t) {
  const dropped = [];
  const state = { v: 1, claims: {}, outcomes: {}, seen: {} };
  if (!isObj(j)) { if (j !== null && j !== undefined) dropped.push('the file is not an object'); return { state, dropped }; }
  if (j.claims !== undefined && !isObj(j.claims)) dropped.push('`claims` is not an object');
  for (const [k, c] of Object.entries(isObj(j.claims) ? j.claims : {})) {
    if (!KEY_RE.test(k) || !isObj(c) || !isObj(c.lanes)) { dropped.push(`claim ${String(k).slice(0, 40)}: not a claim`); continue; }
    const lanes = {};
    for (const [l, e] of Object.entries(c.lanes)) {
      const a = isObj(e) ? finite(e.at) : null;
      if (!quotaModel.isLaneKey(l) || !(a > 0)) { dropped.push(`claim ${k}/${String(l).slice(0, 40)}: not a lane claim`); continue; }
      if (a > t + FUTURE_SLACK_MS) { dropped.push(`claim ${k}/${l}: stamped in the future`); continue; }
      lanes[l] = { at: a, by: 'person', before: finite(e.before), ...(short(e.name) ? { name: short(e.name) } : {}) };
    }
    if (Object.keys(lanes).length) state.claims[k] = { lanes };
  }
  for (const [k, list] of Object.entries(isObj(j.outcomes) ? j.outcomes : {})) {
    if (!KEY_RE.test(k) || !Array.isArray(list)) { dropped.push(`outcomes ${String(k).slice(0, 40)}: not a list`); continue; }
    const keep = list.filter((o) => isObj(o) && quotaModel.isLaneKey(o.lane) && OUTCOME_STATES.has(o.state) && finite(o.readAt) > 0).map((o) => ({
      lane: o.lane, state: o.state, readAt: o.readAt, usedPct: finite(o.usedPct), ...(finite(o.before) != null ? { before: o.before } : {}),
      ...(finite(o.claimedAt) ? { claimedAt: o.claimedAt } : {}), ...(o.refused === true ? { refused: true } : {}), ...(short(o.name) ? { name: short(o.name) } : {}) }));
    if (keep.length < list.length) dropped.push(`outcomes ${k}: ${list.length - keep.length} not an outcome`);
    if (keep.length) state.outcomes[k] = keep;
  }
  if (j.seen !== undefined && !isObj(j.seen)) dropped.push('`seen` is not an object');
  const nowS = Math.floor(t / 1000);
  for (const [k, list] of Object.entries(isObj(j.seen) ? j.seen : {})) {
    if (!KEY_RE.test(k) || !Array.isArray(list)) { dropped.push(`seen ${String(k).slice(0, 40)}: not a list`); continue; }
    const keep = list.filter((x) => isObj(x) && quotaModel.isLaneKey(x.lane) && finite(x.resetsAt) > 0 && Math.abs(x.resetsAt - nowS) <= SEEN_SPAN_S).map((x) => ({ lane: x.lane, resetsAt: x.resetsAt }));
    if (keep.length < list.length) dropped.push(`seen ${k}: ${list.length - keep.length} not a reset instant`);
    if (keep.length) state.seen[k] = keep.slice(-SEEN_KEEP);
  }
  return { state, dropped };
}

function create({ file, now = () => Date.now(), log = (...a) => console.log(...a), known = null } = {}) {
  let isKnown = typeof known === 'function' ? known : null, nameFn = null;
  let state = { v: 1, claims: {}, outcomes: {}, seen: {} };
  {
    let j = null, unreadable = null;
    try { j = file ? JSON.parse(fs.readFileSync(file, 'utf8')) : null; } catch (e) { if (e && e.code !== 'ENOENT') unreadable = e.code || 'not JSON'; }
    const r = sanitize(j, now());
    state = r.state;
    if (unreadable) log(`[reset-claim] ${file}: unreadable (${unreadable}) — no claim is kept from it; it is rewritten now`);
    if (r.dropped.length) log(`[reset-claim] ${file}: dropped ${r.dropped.length} malformed entr${r.dropped.length === 1 ? 'y' : 'ies'} (${r.dropped.slice(0, 4).join('; ')}${r.dropped.length > 4 ? '; …' : ''}) — the rest stands; the file is rewritten without them`);
    var _rewrite = !!(unreadable || r.dropped.length);   // said ONCE: the clean state replaces the bad bytes (below, once `save` exists)
  }
  let writing = null, again = false, dirty = false, seq = 0;
  const tmpName = () => `${file}.${process.pid}.${++seq}.tmp`;
  const save = () => {
    dirty = true;
    if (!file) return Promise.resolve();
    if (writing) { again = true; return writing; }
    writing = (async () => {
      const text = JSON.stringify(state);
      const tmp = tmpName();
      await fs.promises.mkdir(path.dirname(file), { recursive: true });
      const fh = await fs.promises.open(tmp, 'wx', 0o600);
      try { await fh.writeFile(text); await fh.sync(); } finally { await fh.close(); }
      await fs.promises.rename(tmp, file);
      if (!again) dirty = false;
    })().catch((e) => log('[reset-claim] write failed:', (e && e.message) || e)).finally(() => { writing = null; if (again) { again = false; save(); } });
    return writing;
  };
  /** THE STOP PATH (the atomic-persistence law): what the last async save has not landed is written now. */
  function flushSync() {
    if (!file || !dirty) return true;
    try {
      const tmp = tmpName();   // (its dir is the hub's data/ — a dir that is gone keeps nothing, and is never re-made here)
      const fd = fs.openSync(tmp, 'wx', 0o600);
      try { fs.writeSync(fd, JSON.stringify(state)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      fs.renameSync(tmp, file);
      dirty = false;
      return true;
    } catch (e) { if (!(e && e.code === 'ENOENT')) log(`[reset-claim] the hub stops with claims that never reached ${file}: ${(e && e.message) || e}`); return false; }
  }
  const listeners = new Set(), claimListeners = new Set();
  const changed = (key) => { for (const fn of listeners) { try { fn(key); } catch { } } };
  if (_rewrite) save();

  /** A person's claim over the account's reading `raw`: `lanes` = 'all' (every lane the reading draws with a spend) |
   *  [lane…]. → { ok: true, lanes, at } | { ok: false, code: 'bad-key' | 'no-reading' | 'bad-lane', lanes? } */
  function claim(key, lanes, raw, { by = 'person' } = {}) {
    const k = String(key || '');
    if (!KEY_RE.test(k)) return { ok: false, code: 'bad-key' };
    const known = quotaModel.lanesOfReading(raw).filter((x) => x.usedPct != null); // a lane that states no spend can show no reset
    if (!known.length) return { ok: false, code: 'no-reading' };
    const want = lanes === 'all'
      ? known.filter((x) => x.usedPct >= quotaModel.RESET_SEEN_MIN_DROP).map((x) => x.lane)   // the whole account: the lanes a reset could show
      : [...new Set((Array.isArray(lanes) ? lanes : []).map(String))];
    if (lanes === 'all' && !want.length) return { ok: false, code: 'no-reading' };
    const unknown = want.filter((l) => !known.some((x) => x.lane === l));
    if (!want.length || unknown.length) return { ok: false, code: 'bad-lane', lanes: unknown };
    // a lane under RESET_SEEN_MIN_DROP % used can show no reset (its next reading could not confirm one): nothing to claim (r3)
    const low = want.filter((l) => (known.find((x) => x.lane === l) || {}).usedPct < quotaModel.RESET_SEEN_MIN_DROP);
    if (low.length) return { ok: false, code: 'too-low', lanes: low };
    const t = now();
    const c = state.claims[k] || { lanes: {} };
    for (const l of want) { const r = known.find((x) => x.lane === l); c.lanes[l] = { at: t, by, before: r.usedPct, ...(r.name ? { name: r.name } : {}) }; }
    state.claims[k] = c;
    if (state.outcomes[k]) { state.outcomes[k] = state.outcomes[k].filter((o) => !want.includes(o.lane)); if (!state.outcomes[k].length) delete state.outcomes[k]; } // a new claim replaces the lane's last word
    save(); changed(k);
    for (const fn of claimListeners) { try { fn({ key: k, lanes: want.slice(), at: t }); } catch { } }   // the engine lifts that lane's walls (r3)
    return { ok: true, lanes: want, at: t };
  }

  /** Settle what a reading answers, then THE VIEW of `raw` under what is still claimed (the reading itself when nothing is). */
  function viewOf(key, raw) {
    const k = String(key || '');
    if (!raw || typeof raw !== 'object' || !state.claims[k]) return raw;
    if (isKnown && !safeKnown(k)) { forget(k); return raw; }
    settle(k, raw);
    const c = state.claims[k];
    return c ? quotaModel.withResetClaim(raw, c) : raw;
  }
  const safeKnown = (k) => { try { return isKnown(k) !== false; } catch { return true; } };
  function forget(k) { const had = !!(state.claims[k] || state.outcomes[k] || state.seen[k]); delete state.claims[k]; delete state.outcomes[k]; delete state.seen[k]; if (had) { log(`[reset-claim] ${k}: its claims are dropped — the account is gone or takes no reset claim`); save(); changed(k); } }
  /** AT A READ (r3): only what is TRUE IN THE RECORD settles here — 7 days, or a refusal stored after the claim (the
   *  record's own `refusedAt`); a stored age never does (the carry rule keeps an unchanged number's older one, and a
   *  sibling's bucket rides a write unmeasured) — the write path's statements do (noteLanesRead) */
  function settle(key, raw) {
    const c = state.claims[String(key || '')];
    if (!c) return;
    const refusals = quotaModel.lanesOfReading(raw).filter((x) => x.refusedAt != null && c.lanes[x.lane] && x.refusedAt >= (Number(c.lanes[x.lane].at) || 0)).map((x) => ({ ...x, at: x.refusedAt, refused: true }));
    return settleLanes(key, refusals);
  }
  /** THE LANES A WRITE MEASURED (usage-cache-write onLanesRead — a ⟳ that re-read a claimed cap at the same 97 % is the
   *  contradiction, though the carry rule keeps that window's older age in the file) */
  function noteLanesRead(key, lanes) { const k = String(key || ''); if (state.claims[k] && Array.isArray(lanes) && lanes.length) settleLanes(k, lanes); }
  function settleLanes(key, lanes) {
    const k = String(key || '');
    const c = state.claims[k];
    if (!c) return;
    const t = now();
    let moved = false;
    for (const [l, e] of Object.entries(c.lanes || {})) {
      const claimedAt = Number(e && e.at) || 0;
      if (t - claimedAt > MAX_AGE_MS) { delete c.lanes[l]; moved = true; continue; }
      const r = lanes.find((x) => x.lane === l);
      if (!r || !(Number(r.at) >= claimedAt)) continue;          // nothing said of THIS lane since the claim
      if (!r.refused && r.usedPct == null) continue;              // a reading that states no spend confirms nothing
      const before = e.before == null ? NaN : Number(e.before), used = r.refused ? 100 : Number(r.usedPct);
      // a refusal is never a reset; a drop of RESET_SEEN_MIN_DROP points is one — and so is a lane that now reads under it
      // having stood above it (a genuine reset of a lane at 6 % reads 2 %, r4: «not confirmed» was wrong there)
      const confirmed = !r.refused && Number.isFinite(before) && (used <= before - quotaModel.RESET_SEEN_MIN_DROP || (used < quotaModel.RESET_SEEN_MIN_DROP && used < before));
      (state.outcomes[k] = (state.outcomes[k] || []).filter((o) => o.lane !== l)).push({ lane: l, state: confirmed ? 'confirmed' : 'contradicted', readAt: Number(r.at), usedPct: used, claimedAt, ...(r.refused ? { refused: true } : {}), ...(r.name || e.name ? { name: r.name || e.name } : {}) });
      if (!confirmed) log(`[reset-claim] ${k}: the reset claimed for ${quotaModel.laneText(l)} at ${new Date(claimedAt).toISOString()} is not confirmed — ${r.refused ? `Anthropic refused it at ${new Date(Number(r.at)).toISOString()}` : `its reading at ${new Date(Number(r.at)).toISOString()} still says ${Math.round(used)}% used`}; the claim ends`);   // a number a person reads is rounded where it is said (r5)
      delete c.lanes[l]; moved = true;
    }
    if (!Object.keys(c.lanes || {}).length) delete state.claims[k];
    if (moved) { prune(t); save(); changed(k); }
  }
  function prune(t = now()) {
    for (const [k, list] of Object.entries(state.outcomes)) {
      const keep = (Array.isArray(list) ? list : []).filter((o) => o && t - (Number(o.readAt) || 0) < OUTCOME_KEEP_MS);
      if (keep.length) state.outcomes[k] = keep; else delete state.outcomes[k];
    }
    for (const [k, list] of Object.entries(state.seen)) {
      const keep = list.filter((x) => x.resetsAt * 1000 > t - OUTCOME_KEEP_MS); // a window's memory outlives its own reset by a day
      if (keep.length) state.seen[k] = keep; else delete state.seen[k];
    }
    if (isKnown) {
      const gone = [...new Set([...Object.keys(state.claims), ...Object.keys(state.outcomes), ...Object.keys(state.seen)])].filter((k) => !safeKnown(k));
      for (const k of gone) { delete state.claims[k]; delete state.outcomes[k]; delete state.seen[k]; }
      if (gone.length) { log(`[reset-claim] dropped what ${gone.length} account${gone.length === 1 ? '' : 's'} held — gone, or taking no reset claim (${gone.slice(0, 3).join(', ')}${gone.length > 3 ? ', …' : ''})`); save(); }
    }
  }
  /** A RESET SEEN IN A READING (usage-cache-write onVendorReset: a newer measurement of a lane dropped under an unchanged,
   *  still-ahead reset) — said ONCE per (account, lane, reset instant ± 60 s), across restarts: one journal line and one
   *  outcome the account's row draws («X 的 Fable 上限已重置»); a claim on that lane ends. `name` words the account. */
  function noteResetSeen(key, resets, { name = null } = {}) {
    const k = String(key || '');
    if (!KEY_RE.test(k) || !Array.isArray(resets) || !resets.length) return 0;
    let n = 0;
    const c = state.claims[k];
    for (const r of resets) {
      if (!r || !quotaModel.isLaneKey(r.lane) || !(Number(r.resetsAt) > 0)) continue;
      const mem = state.seen[k] || [];
      if (mem.some((x) => x.lane === r.lane && Math.abs(x.resetsAt - Number(r.resetsAt)) <= SEEN_SAME_S)) continue;
      state.seen[k] = [...mem, { lane: r.lane, resetsAt: Number(r.resetsAt) }].slice(-SEEN_KEEP);
      n++;
      // the SAME write may just have settled a claim on this lane CONFIRMED (onLanesRead fires before onVendorReset): that
      // outcome stays — confirmed, its claimedAt kept — and carries the numbers the reset shows (r4)
      const prevOut = (state.outcomes[k] || []).find((o) => o.lane === r.lane && o.state === 'confirmed' && Math.abs((Number(o.readAt) || 0) - (Number(r.readAt) || 0)) <= SEEN_SAME_S * 1000);
      const list = (state.outcomes[k] = (state.outcomes[k] || []).filter((o) => o.lane !== r.lane));
      if (prevOut) list.push({ ...prevOut, before: r.before, usedPct: r.after });
      else list.push({ lane: r.lane, state: 'reset-seen', readAt: Number(r.readAt) || now(), usedPct: r.after, before: r.before, ...(r.name ? { name: String(r.name).slice(0, 60) } : {}), ...(c && c.lanes && c.lanes[r.lane] ? { claimedAt: Number(c.lanes[r.lane].at) || null } : {}) });
      if (c && c.lanes && c.lanes[r.lane]) delete c.lanes[r.lane];
      log(`[usage] ${name || k}: ${quotaModel.laneText(r.lane)} was reset — ${Math.round(r.before)}% → ${Math.round(r.after)}% used, its reset instant unchanged (a reading shows it)`);
    }
    if (c && !Object.keys(c.lanes || {}).length) delete state.claims[k];
    if (n) { prune(); save(); changed(k); }
    return n;
  }
  /** The person read the note: its outcome goes (one lane, or every outcome of the account). */
  function dismiss(key, lane = null) {
    const k = String(key || '');
    if (!state.outcomes[k]) return false;
    state.outcomes[k] = lane ? state.outcomes[k].filter((o) => o.lane !== lane) : [];
    if (!state.outcomes[k].length) delete state.outcomes[k];
    save(); changed(k);
    return true;
  }
  /** What the surfaces draw: per key, the lanes still claimed ({lane: at}) and the outcomes kept for the note. */
  function forClients() {
    prune();
    const out = {};
    for (const [k, c] of Object.entries(state.claims)) out[k] = { lanes: Object.fromEntries(Object.entries(c.lanes || {}).map(([l, e]) => [l, Number(e.at) || 0])), outcomes: [] };
    for (const [k, list] of Object.entries(state.outcomes)) (out[k] = out[k] || { lanes: {}, outcomes: [] }).outcomes = list.slice();
    return out;
  }
  /** Is any of these accounts claimed now? (the pool asks before it weighs whether a claim decided a placement) */
  const anyClaimed = (ids) => (Array.isArray(ids) ? ids : []).some((id) => !!state.claims[String(id)]);
  return {
    claim, viewOf, settle, noteLanesRead, dismiss, forClients, noteResetSeen, flushSync, anyClaimed, file,
    get: (key) => state.claims[String(key)] || null,
    outcomesOf: (key) => (state.outcomes[String(key)] || []).slice(),
    onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    onClaim: (fn) => { claimListeners.add(fn); return () => claimListeners.delete(fn); },
    setKnown: (fn) => { if (typeof fn === 'function') isKnown = fn; },
    setNameOf: (fn) => { if (typeof fn === 'function') nameFn = fn; },
    nameOf: (k) => { try { return nameFn ? nameFn(k) : null; } catch { return null; } },
    flush: async () => { while (writing) await writing; },   // a save chained behind another lands too
  };
}

module.exports = { create, at, stopAll, sanitize, MAX_AGE_MS, OUTCOME_KEEP_MS };
