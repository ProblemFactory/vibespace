'use strict';
/**
 * weekly-lanes-unfold.js — the one-shot REPAIR for inc-mubu23bd-5vxi
 * (2026-09-21), run by migration `2026-09-weekly-lanes-unfold` through
 * src/migration-runner.js.
 *
 * WHAT IT REPAIRS. Since 2.361.2 `parseRateLimitEvent` mapped claude's
 * overage-included weekly type — the 2.1.274 binary's own "overage-included
 * weekly (per-model bucket)" — onto the PLAN weekly lane and never read the
 * record's `unifiedWindows`, so every account with a model cap had its plan
 * week overwritten by the bucket's number whenever the representative claim
 * was the bucket (measured on this instance: the owner's plan 7d cache read
 * 86 % beside a verified panel that said 43 %). The parse is fixed; the caches
 * still hold the bucket's number in the plan lane until the next event lands.
 *
 * WHAT IT DOES, BOUNDED. For every claude usage-cache key whose PLAN limit
 * was last written by source `rate-limit-event` — the only producer that
 * states ONE plan window; every other producer (panel, statusline, get_usage)
 * states both and would already have corrected the week — find the newest
 * NON-rejected `rate_limit_event` carrying `unifiedWindows` in the live
 * session buffers linked to that credential slot (the per-session pool link,
 * else the pool default, else the session's own subscription; the last
 * 512 KiB of each buffer), require its plan weekly reset to agree with the
 * account's own established window (`.window-<key>`, ±120 s — the
 * readings-by-window doctrine; no sidecar ⇒ no verdict ⇒ left alone), archive
 * the pre-repair object, and write the event's WEEKLY lanes back through the
 * ONE write path (`captureRateLimitEvent`, so the plan 7d, the model cap and
 * the fold rule all apply; the 5-hour lane is left out — a tail line has no
 * clock of its own and the 5-hour lane was never written by the bucket). A
 * panel-sourced plan week is NEVER touched; a key with no linked windowed
 * event is left for the next panel or event to correct; the report says what
 * happened per key. Content-idempotent: a plan week already equal to the
 * event's window is `already`.
 *
 * THE CLOCK. A buffer line carries no timestamp, so the reading's clock is the
 * buffer's mtime — an upper bound on when the event landed — and never below
 * the file's own `fetchedAt` + 1: `fetchedAt` is "promoted to freshest at t"
 * and three readers rank on it (the anchors sweep dedups on `fetchedAt <=
 * seen`, the `__global__` ↔ usage-cache.json and the global ↔ named-account
 * merges are newest-wins), so a repair that regressed it would lose to the
 * number it just corrected.
 *
 * CENSUSES. Its usage-cache writes go through `captureRateLimitEvent` (the
 * write path); its own `writeFileSync` calls are the archive-never-destroy
 * copy under data/archive/ (test-quota-model ⑩ names it for that reason).
 */
const fs = require('fs');
const path = require('path');
const usageWrite = require('./usage-cache-write.js');
const quotaModel = require('./quota-model.js');
const readingLag = require('./reading-lag.js');
const { parseRateLimitEvent, captureRateLimitEvent } = require('./rate-limit-capture.js');
const { familyOfScopedBucket } = require('./model-family.js');

const TAIL_BYTES = 512 * 1024;

/** The last `bytes` of a file as whole lines (the first, possibly partial,
 *  line is dropped when the file is longer than the tail). */
function tailLines(file, bytes) {
  let fd = null;
  try {
    const st = fs.statSync(file);
    const len = Math.min(st.size, bytes);
    if (!len) return [];
    fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, st.size - len);
    const lines = buf.toString('utf8').split('\n');
    if (st.size > len) lines.shift();
    return lines;
  } catch { return []; }
  finally { if (fd != null) { try { fs.closeSync(fd); } catch { } } }
}

/** Which usage-cache KEY a live session's readings belong to, off disk (this
 *  runs before any AccountManager exists): the session-meta's `accountId`,
 *  resolved through the pool's per-session link / default link when it is a
 *  pool. `{key, why}`; key null = cannot say. */
function slotKeyForSession(dataDir, sid) {
  const tail = String(sid).replace(/^sess-/, '');
  let meta = null;
  try { meta = JSON.parse(fs.readFileSync(path.join(dataDir, 'session-meta', 'cw-' + tail + '.json'), 'utf8')); } catch { return { key: null, why: 'no session-meta' }; }
  if (!meta || typeof meta !== 'object') return { key: null, why: 'unreadable session-meta' };
  if ((meta.backend || 'claude') !== 'claude') return { key: null, why: 'not a claude session' };
  if (meta.host) return { key: null, why: 'remote session (host-keyed caches are out of scope)' };
  const acct = meta.accountId ? String(meta.accountId) : null;
  if (!acct) return { key: '__global__', why: 'machine login' };
  const subsDir = path.join(dataDir, 'subs');
  let isPool = false;
  try { isPool = fs.lstatSync(path.join(subsDir, acct)).isSymbolicLink(); } catch { isPool = false; }
  if (!isPool) return { key: acct, why: 'own subscription' };
  const linkTarget = (p) => { try { return path.basename(fs.readlinkSync(p)); } catch { return null; } };
  const own = linkTarget(path.join(dataDir, 'pool-links', acct.replace(/[^\w-]/g, ''), String(sid).replace(/[^\w.-]/g, '')));
  if (own) return { key: own, why: 'per-session pool link' };
  const dflt = linkTarget(path.join(subsDir, acct));
  return dflt ? { key: dflt, why: 'pool default link' } : { key: null, why: 'pool link unreadable' };
}

/** The newest non-rejected windowed event in one buffer's tail, or null. */
function newestWindowedEvent(file, tailBytes) {
  const lines = tailLines(file, tailBytes);
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    if (!l.includes('"rate_limit_event"') || !l.includes('unifiedWindows')) continue;
    let msg; try { msg = JSON.parse(l); } catch { continue; }
    const ev = parseRateLimitEvent(msg);
    if (!ev || ev.status === 'rejected' || !ev.windows || !ev.windows.sevenDay || ev.windows.sevenDay.utilization == null || !ev.windows.sevenDay.resetsAt) continue;
    return ev;
  }
  return null;
}

/** The event's WEEKLY lanes only: the 5-hour window is dropped, and when the
 *  representative was the 5-hour bucket the plan week becomes the
 *  representative (its status from its own number). */
function weeklyOnly(ev) {
  const w7 = ev.windows.sevenDay;
  const out = { ...ev, windows: { ...ev.windows, fiveHour: null } };
  if (ev.kind === 'fiveHour') {
    Object.assign(out, { kind: 'sevenDay', modelCap: false, scopedName: null, status: w7.utilization >= 1 ? 'limited' : 'allowed', utilization: w7.utilization, resetsAt: w7.resetsAt });
  }
  return out;
}

/** The account's established weekly reset, from its `.window-<key>` sidecar:
 *  the plan week, else its first scoped window (the two share a reset on
 *  every account measured). null = no established window. */
function establishedWeekly(cacheDir, key) {
  let sc = null;
  try { sc = JSON.parse(fs.readFileSync(path.join(cacheDir, readingLag.windowSidecarName(key)), 'utf8')); } catch { return null; }
  if (!sc || typeof sc !== 'object') return null;
  if (Number(sc.sevenDay) > 0) return Number(sc.sevenDay);
  const first = Object.values(sc.scoped && typeof sc.scoped === 'object' ? sc.scoped : {}).map(Number).find((n) => n > 0);
  return first || null;
}

function unfoldWeeklyLanes({ dataDir, id = 'weekly-lanes-unfold', now = Date.now(), tailBytes = TAIL_BYTES } = {}) {
  const cacheDir = path.join(dataDir, 'usage-cache');
  const bufDir = path.join(dataDir, 'session-buffers');
  // per-key verbs: rederived (rewritten from an event) · already (the event
  // agrees with the file) · left (a candidate with no usable evidence) ·
  // kept (not a candidate: the plan week's last producer stated the week) ·
  // refused (the REPAIR ITSELF failed — the archive could not be written or
  // the write path refused; the migration FAILS on any, so the runner
  // retries next boot instead of recording a refusal as applied — r2).
  // `unreadable` = the cache dir exists but could not be listed (a missing
  // dir is a fresh instance: nothing to repair, a success).
  const report = { id, scanned: 0, candidates: 0, buffers: 0, rederived: 0, already: 0, left: 0, kept: 0, refused: 0, unreadable: null, keys: [] };
  const say = (key, action, why, extra = {}) => { report.keys.push({ key, action, why, ...extra }); report[action]++; };
  let files = [];
  try { files = fs.readdirSync(cacheDir).filter(usageWrite.isCacheFileName); } catch (e) { if (e && e.code !== 'ENOENT') report.unreadable = `${cacheDir}: ${e.message}`; return report; }
  // ① the candidates: claude caches whose PLAN limit was last written by an event
  const cands = new Map();
  for (const fn of files) {
    report.scanned++;
    const key = fn.replace(/\.json$/, '');
    const obj = usageWrite.readCacheObject(cacheDir, key);
    if (!obj) continue;
    if (usageWrite.backendOfCacheObject(obj) === 'codex') continue;
    let set; try { set = usageWrite.limitsOfCache(obj, { identity: key, backend: 'claude', familyOf: familyOfScopedBucket }); } catch { continue; }
    const plan = quotaModel.planLimit(set);
    const w7 = plan ? quotaModel.windowOfKind(plan, '7d') : null;
    if (!w7 || w7.usedPct == null) continue; // states no plan week: nothing to unfold
    const src = (plan && plan.source) || obj.source || null;
    if (src !== 'rate-limit-event') { say(key, 'kept', `plan week last written by ${src || 'an unknown producer'}, which states the week itself — never touched`, { plan7d: w7.usedPct }); continue; }
    cands.set(key, { obj, w7 });
    report.candidates++;
  }
  if (!cands.size) return report;
  // ② the newest windowed event per key, from the buffers linked to that slot
  const newest = new Map();
  let bufs = [];
  try { bufs = fs.readdirSync(bufDir).filter((f) => /^sess-.*\.buf$/.test(f)); } catch { bufs = []; }
  for (const bf of bufs) {
    const sid = bf.replace(/\.buf$/, '');
    const slot = slotKeyForSession(dataDir, sid);
    if (!slot.key || !cands.has(slot.key)) continue;
    const file = path.join(bufDir, bf);
    let st; try { st = fs.statSync(file); } catch { continue; }
    const ev = newestWindowedEvent(file, tailBytes);
    if (!ev) continue;
    report.buffers++;
    const prev = newest.get(slot.key);
    if (!prev || st.mtimeMs > prev.mtime) newest.set(slot.key, { ev, sid, mtime: st.mtimeMs, via: slot.why });
  }
  // ③ re-derive, judged by the account's own established window
  const archiveDir = path.join(dataDir, 'archive', `weekly-lanes-unfold-${new Date(now).toISOString().slice(0, 10)}`);
  for (const [key, c] of cands) {
    const hit = newest.get(key);
    if (!hit) { say(key, 'left', 'no live buffer with a windowed event is linked to this slot — the next panel or event corrects it', { plan7d: c.w7.usedPct }); continue; }
    const own = establishedWeekly(cacheDir, key);
    const w7 = hit.ev.windows.sevenDay;
    if (!own) { say(key, 'left', `no established window to judge ${hit.sid}'s event by`, { plan7d: c.w7.usedPct, sid: hit.sid }); continue; }
    if (readingLag.weeklyNear(own, w7.resetsAt) !== true) { say(key, 'left', `${hit.sid}'s weekly reset ${w7.resetsAt} is not this account's ${own}`, { plan7d: c.w7.usedPct, sid: hit.sid }); continue; }
    const target = Math.round(w7.utilization * 100);
    if (Math.abs((c.w7.usedPct || 0) - target) < 0.5 && (!c.w7.resetsAt || Math.abs(c.w7.resetsAt - w7.resetsAt) <= readingLag.JITTER_SEC)) { say(key, 'already', 'the plan week already reads the event\'s plan window', { plan7d: c.w7.usedPct, sid: hit.sid }); continue; }
    // archive, then rewrite through the ONE write path
    try {
      fs.mkdirSync(archiveDir, { recursive: true });
      fs.writeFileSync(path.join(archiveDir, key.replace(/[^\w.-]/g, '_') + '.json'), JSON.stringify(c.obj));
      const man = path.join(archiveDir, '_migration.json');
      let m = { migration: id, at: now, keys: [] };
      try { m = JSON.parse(fs.readFileSync(man, 'utf8')); } catch { }
      if (!m.keys.includes(key)) m.keys.push(key);
      fs.writeFileSync(man, JSON.stringify(m, null, 2));
    } catch (e) { say(key, 'refused', `archive failed: ${e.message}`, { plan7d: c.w7.usedPct, sid: hit.sid }); continue; }
    // the reading's clock: the buffer's mtime, never below the file's own
    // freshness stamp or the window it replaces (see THE CLOCK above)
    const at = Math.max(Math.floor(hit.mtime), (Number(c.w7.measuredAt) || 0) + 1, (Number(c.obj.fetchedAt) || 0) + 1);
    const r = captureRateLimitEvent({ cacheDir, key, identityIds: [key], ev: weeklyOnly(hit.ev), now: at, familyOf: familyOfScopedBucket });
    if (!r.ok) { say(key, 'refused', `write refused: ${r.error || 'unknown'}`, { plan7d: c.w7.usedPct, sid: hit.sid }); continue; }
    const after = usageWrite.readCacheObject(cacheDir, key);
    const cap = (after && Array.isArray(after.scopedWeekly)) ? after.scopedWeekly.map((s) => `${s.name} ${Math.round((s.utilization || 0) * 100)}%`).join(', ') : '';
    const lane = r.modelCapLane;
    say(key, 'rederived', `plan 7d ${c.w7.usedPct}% → ${target}% from ${hit.sid}'s newest windowed event (${hit.via}); model cap ${lane ? (lane.named ? lane.name : 'un-named (placeholder)') : 'none'}`, { from: c.w7.usedPct, to: target, sid: hit.sid, via: hit.via, at, lanes: r.lanes, scoped: cap });
  }
  return report;
}

module.exports = { unfoldWeeklyLanes, slotKeyForSession, newestWindowedEvent, tailLines, weeklyOnly, establishedWeekly, TAIL_BYTES };
