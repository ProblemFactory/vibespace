'use strict';
/**
 * THE TASK GROUP FAN-OUT (lane task-group-fanout, 2026-10-24) — the ONE broadcaster of `tasks-updated`. Measured on the
 * owner's instance before it: every store write (an Activity line, a Backlog item, a bind) sent EVERY group whole — 1.57 MB
 * of JSON to every connected client, 267 times a day — and each client repainted the board and every open Task Group
 * window for it.
 *
 * The store's write stays synchronous (it names the groups it touched: `onChange({ ids })`); what reaches the clients is a
 * DELTA (PURE src/task-delta.js): per changed group only the fields that moved, the Activity entries added since the last
 * broadcast, the Backlog items changed by id, the members added / removed — coalesced over FLUSH_MS (a burst of writes is
 * ONE frame; a steady stream still flushes every FLUSH_MS). Each frame carries `{ epoch (this boot), base, seq }`: a client
 * whose mirror is not exactly at `base` (a reconnect, a missed frame, another boot) re-fetches — never a stale mirror (the
 * StateSync reconnect law). A frame over BYTE_CAP (an import) says `refetch` instead. The whole list travels ONLY on a
 * client's own GET /api/tasks, which flushes first and answers `{ tasks, epoch, seq }` (the seq it is exactly at).
 *
 *   create({ list, send, flushMs, byteCap, now, setTimer, clearTimer }) → { note(ids|null), flush(), mark(), snapshot(), stats() }
 */
const TD = require('../task-delta.js');

const FLUSH_MS = 400;
const BYTE_CAP = 256 * 1024;

function create({ list, send, flushMs = FLUSH_MS, byteCap = BYTE_CAP, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const epoch = now();
  let seq = 0;
  let sent = null;            // id → what every client holds of that group (null until the first ask: the baseline)
  let dirty = null;           // Set of the group ids written since the last frame | 'all' | null
  let timer = null;
  const counts = { frames: 0, bytes: 0, refetch: 0, coalesced: 0 };

  // the baseline: what a client that asks now holds — taken at the first GET (or the first write nobody had asked about)
  function baseline(views) { sent = new Map(views.map((v) => [v.id, TD.sentOf(v)])); }

  function note(ids) {
    if (ids == null) dirty = 'all';
    else if (dirty !== 'all') { dirty = dirty || new Set(); for (const id of [].concat(ids)) if (id) dirty.add(String(id)); }
    if (timer) { counts.coalesced++; return; }
    timer = setTimer(flush, flushMs);
    if (timer && typeof timer.unref === 'function') timer.unref();
  }

  /** Send what moved since the last frame (now) → the frame sent, or null (nothing moved / nobody asked yet). */
  function flush() {
    if (timer) { clearTimer(timer); timer = null; }
    if (!dirty) return null;
    const wrote = dirty;
    dirty = null;
    const views = list();
    if (!sent) { baseline(views); return null; }   // no client holds an older copy: nothing to tell
    const changed = [], seen = new Set();
    for (const v of views) {
      seen.add(v.id);
      const r = TD.groupChange(sent.get(v.id), v, { deep: wrote === 'all' || wrote.has(v.id) || !sent.has(v.id) });
      sent.set(v.id, r.sent);
      if (r.change) changed.push(r.change);
    }
    const removed = [...sent.keys()].filter((id) => !seen.has(id));
    for (const id of removed) sent.delete(id);
    if (!changed.length && !removed.length) return null;
    const head = { type: 'tasks-updated', epoch, base: seq, seq: seq + 1 };
    seq += 1;
    let json = JSON.stringify({ ...head, changed, removed });
    if (json.length > byteCap) { counts.refetch++; json = JSON.stringify({ ...head, refetch: true, changed: changed.map((c) => ({ id: c.id })), removed }); }
    counts.frames++; counts.bytes += json.length;
    try { send(json); } catch { }
    return json;
  }

  /** GET /api/tasks: where the whole list it answers NEXT sits in the order — pending writes are flushed first, so the
   *  list read right after is exactly at `seq` (synchronously: nothing can write between) → { epoch, seq } */
  function mark() {
    flush();
    if (!sent) baseline(list());
    return { epoch, seq };
  }
  /** the whole list at its place ({ tasks, epoch, seq }) — mark() + list() in one */
  function snapshot() { const at = mark(); return { tasks: list(), ...at }; }

  return { note, flush, mark, snapshot, stats: () => ({ epoch, seq, pending: !!dirty, ...counts }) };
}

module.exports = { create, FLUSH_MS, BYTE_CAP };
