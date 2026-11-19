'use strict';
/**
 * THE USAGE READINGS' WRITE OFF THE MAIN THREAD (lane lg-store-writes, B-0248 U6.5 — 主开发's R1 + R2, 02:59Z; 03:26Z: a
 * hand-off and a synchronous flush drop the run's memo, the pending copy is consulted before the memo every time). ORCH,
 * HUB-ONLY: src/usage-cache-write.js (shared with the device agent) holds only a hook this module fills (useHub) — the
 * device agent never carries this code and keeps its synchronous write.
 *
 * Injected by THE SERVER'S BOOT (src/store-writer.js bootKeeper — server.js's one call): useStoreWriter(writer, {dropRun}).
 * A rate_limit_event's write was a synchronous read + mkdir + temp + rename of data/usage-cache/<key>.json on the hub's loop
 * (15.6 s of holds in five hours on the production mount, 4.5 s the longest; the `.window-` sidecar's 11.3 s). Injected:
 * · R1 — the merged reading is kept here (_pending) until its write lands; readCacheJson answers it first, so the next event
 * merges over it and every hub reader sees it (the pool's run-reads memo included: consulted after, never before);
 * · the hand-off is PACED with those bytes (the exit writes whatever is dirty — nothing handed is lost at a stop) and drops
 * the run's memo (the file under it is about to change); a landing drops it again (a synchronous flush inside a run);
 * · R2 — a turn later the FILE is read off the loop (fs.promises) and every pending call is REPLAYED over it (the pure
 * merge, quiet): a write another process made meanwhile (the shipped statusline's read-merge-write of the same file) is
 * the base of the hub's write, never overwritten by it; the merged bytes go to the writer as an ACT (urgent).
 * · a sidecar (`.window-<key>`, a whole value only the hub writes) is handed as is (R1 for its reader, no replay).
 */
const fs = require('fs');
const path = require('path');
const quotaModel = require('../quota-model.js');
const UW = require('../usage-cache-write.js');

let _W = null, _dropRun = null;
const HUB = { pendingText: (f) => pendingText(f), pendingIn: (d) => pendingIn(d), handOff: (...a) => handOff(...a), ride: (f, step, o) => ride(f, step, o) };   // what the cache module's hook calls
const _pending = new Map();   // file → { bytes, gen, v, bytesV, calls: [{v, at, args}] | null (a sidecar), reading, again, producedGen, producedV, landedGen, epoch }
const REPLAY_CAP = 16;        // the cure 2: a re-merge replays at most this many calls — past it the pending bytes (which hold every call's effect) stand alone until the NEWEST bytes land (up to 60 s per write cycle, longer while events keep arriving during writes in flight — another process's write landing meanwhile is overwritten; the statusline's next tick writes again). 16 is ARBITRARY: a burst a few times the ordinary one (an account's events come a few a minute; a write lands in seconds), small enough that one re-merge stays a few ms of merges
const PACED_MS = 60000;       // the R1 hand-off's pace: only the exit's net (the exit writes whatever is dirty) and a re-merge that never came — R2's urgent bytes come first
const cloneData = (x) => (x == null || typeof x !== 'object' ? x : JSON.parse(JSON.stringify(x)));
const readFileOffLoop = (f) => fs.promises.readFile(f, 'utf-8');
const nextTurn = (fn) => setImmediate(fn);
let _readFile = readFileOffLoop, _schedule = nextTurn, _cap = REPLAY_CAP;
/** THE HUB'S INJECTION: its store writer (src/store-writer.js) and run-reads' dropRun. null ⇒ synchronous again (and nothing kept).
 *  A suite's seams only — `readFile` (a read it can hold open), `schedule` (when a re-merge starts: an event it releases),
 *  `replayCap` (a smaller bound, so a walk reaches it in a few steps); the hub's: fs.promises, the next turn, REPLAY_CAP. */
function useStoreWriter(writer, { dropRun = null, readFile = null, schedule = null, replayCap = null } = {}) {
  _W = writer || null; _dropRun = typeof dropRun === 'function' ? dropRun : null;
  _readFile = typeof readFile === 'function' ? readFile : readFileOffLoop; _schedule = typeof schedule === 'function' ? schedule : nextTurn; _cap = Number.isFinite(replayCap) ? replayCap : REPLAY_CAP;
  if (!_W) _pending.clear(); UW.useHub(_W ? HUB : null);
}
/** the hook's two readers (R1): a pending reading's bytes, and the pending files of a folder */
function pendingText(file) { const p = _pending.get(file); return p ? p.bytes : null; }
function pendingIn(dir) { const at = path.resolve(dir), out = []; for (const f of _pending.keys()) if (path.dirname(path.resolve(f)) === at) out.push(path.basename(f)); return out; }
const dropRunNow = () => { if (_dropRun) { try { _dropRun(); } catch { } } };
/** THE LAW (the U6.5 cure — 主开发 13:44Z; three readers' one must: a landing during a re-merge's read left the copy in memory
 *  for good, answered ahead of the file): the pending copy is CLEARED when its NEWEST bytes are on disk and nothing is left to
 *  replay — ONE condition, asked at a landing and at EVERY exit of a re-merge (its early returns, its end, its catch) */
function settle(file, p) {
  if (_pending.get(file) === p && p.landedGen === p.gen && !p.reading && !p.again && (!p.calls || !p.calls.length)) _pending.delete(file);
}
function handTo(file, p, { urgent = false } = {}) {
  _W.dirty(file, { name: 'usage-cache.write', rank: 0, makeDir: true, ...(urgent ? {} : { debounceMs: PACED_MS }),
    produce: () => { p.producedGen = p.gen; p.producedV = p.bytesV; return p.bytes; },
    onWritten: (ok) => {
      dropRunNow();   // a landing inside a run (a synchronous flush): the memo may hold the file's older text
      if (_pending.get(file) !== p) return;
      // A FAILED LANDING (the U6.5 cure 2 — 主开发 14:04Z: the storage refusing writes for an hour made every event replay every
      // call on the main loop): no replay protects anything now — another process's write cannot land on a refusing mount either
      // — and the pending bytes already hold every call's effect: the list goes, the bytes stand alone until the next good landing
      if (!ok) { if (p.calls) { p.calls = []; p.noReplay = true; } return; }
      // the CURE 3 (主开发 14:21Z — both readers, the skeptic twice): the flag ends ONLY when the NEWEST bytes landed — an OLDER
      // landing ending it let the next re-merge replay over the older file without the calls the flag had dropped (readings lost)
      if (p.producedGen === p.gen) p.noReplay = false;
      p.epoch++;   // what the file holds changed: a re-merge whose read began before this is over an older file
      if (p.calls) p.calls = p.calls.filter((c) => c.v > p.producedV);   // the calls these bytes held are on disk now
      p.landedGen = p.producedGen; settle(file, p);   // the NEWEST bytes landed, nothing to replay ⇒ the file is the reading again
    } });
  if (urgent && typeof _W.durable === 'function') _W.durable(file).catch(() => { });   // an ACT: the writer's next writes (nobody awaits it)
}
function handOff(file, call, out, { sidecar = false } = {}) {
  let p = _pending.get(file);
  if (!p) { p = { bytes: null, gen: 0, v: 0, bytesV: 0, calls: sidecar ? null : [], reading: false, again: false, producedGen: 0, producedV: 0, landedGen: 0, epoch: 0 }; _pending.set(file, p); }
  p.v++; p.gen++; p.bytes = sidecar ? out : JSON.stringify(out); p.bytesV = p.v;
  if (!sidecar && p.noReplay) { /* a failed landing or the cap: the bytes carry this call (R1 merged it over them) */ }
  else if (!sidecar) { const a = call.args; p.calls.push({ v: p.v, at: call.at, args: { ...a, obj: cloneData(a.obj), set: cloneData(a.set), absentWindows: cloneData(a.absentWindows), passiveAnswer: cloneData(a.passiveAnswer), refused: cloneData(a.refused), refusalMarks: cloneData(a.refusalMarks) } }); if (p.calls.length > _cap) { p.calls = []; p.noReplay = true; } }   // cloned: a caller may change its objects after the write returns
  dropRunNow();
  if (sidecar) { handTo(file, p, { urgent: true }); return; }
  handTo(file, p);
  if (p.noReplay) return;   // the bytes stand alone until the next good landing: no re-merge (nothing to replay)
  if (!p.reading) { p.reading = true; _schedule(() => remerge(file, p)); } else p.again = true;
}
/** R2: the file's own reading NOW (off the loop), every pending call replayed over it, the bytes handed as an act. A read the
 *  mount refused keeps the R1 bytes (never a reading wiped); a write that landed while the read ran makes it stale (again). */
function remerge(file, p) {
  const epoch0 = p.epoch;
  // every exit: another re-merge if a call came meanwhile, else THE LAW's one question (settle)
  const next = () => { if (p.again) { p.again = false; p.reading = true; _schedule(() => remerge(file, p)); } else settle(file, p); };
  Promise.resolve().then(() => _readFile(file)).then((t) => { try { return { base: JSON.parse(t) || null }; } catch { return { base: null } } }, (e) => (e && e.code === 'ENOENT' ? { base: null } : { refused: true })).then(({ base, refused }) => {
    if (_pending.get(file) !== p) return;
    p.reading = false;
    if (refused || !p.calls.length || p.noReplay) { next(); return; }
    if (p.epoch !== epoch0) { p.again = true; next(); return; }
    const v = p.v;
    let cur = base;
    for (const c of p.calls) {
      try {
        // a lane whose window the file got NEWER than this call's measurement is not this call's to mark
        const newer = new Set(quotaModel.lanesOfReading(cur).filter((x) => Number(x.at) > Number(c.at)).map((x) => x.lane));
        const keep = (l) => (Array.isArray(l) ? l.filter((k) => !newer.has(k)) : l);
        const m = UW.mergeCacheObject(cur, { ...c.args, stated: keep(c.args.stated), refused: keep(c.args.refused), refusalMarks: keep(c.args.refusalMarks) }, { quiet: true });
        if (!m.ok) continue;
        const o = m.out;
        if (cur && Number(cur.fetchedAt) > Number(o.fetchedAt || 0)) { o.fetchedAt = cur.fetchedAt; if (cur.source) o.source = cur.source; }   // never a reading's time backwards
        if (cur && cur.windowChangeUnsaid && !o.windowChangeUnsaid) o.windowChangeUnsaid = cur.windowChangeUnsaid;   // the direct writer's unsaid change: said by the next real write, never dropped by a replay
        cur = o;
      } catch { }
    }
    if (cur) { p.bytes = JSON.stringify(cur); p.bytesV = v; p.gen++; if (_W) handTo(file, p, { urgent: true }); }
    next();
  }).catch(() => { p.reading = false; try { next(); } catch { } });   // a body that threw strands neither the copy nor a queued «again»
}

/** THE STEP RIDES THE LANDING (the moved2 cure 2 — store-writer afterLanding, the ONE helper): `step` once the writer's owed write
 *  of `file` is on disk (no writer ⇒ now). usage-routes: a verified panel clears a lapse; writeSidecar's offLoop road awaits it */
function ride(file, step, opts = {}) { return require('../store-writer.js').ride(_W, file, step, { what: 'a usage reading', ...opts }); }
/** a suite's view of one pending copy (never the bytes): {calls, reading, again, noReplay} | null */
function pendingInfo(file) { const p = _pending.get(file); return p ? { calls: p.calls ? p.calls.length : null, reading: p.reading, again: p.again, noReplay: !!p.noReplay } : null; }

module.exports = { useStoreWriter, pendingText, pendingIn, pendingInfo, ride, REPLAY_CAP };
