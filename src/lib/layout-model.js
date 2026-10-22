'use strict';
// THE DEFERRED RECORDS — PURE (imports nothing; CJS so the fast suite requires it and esbuild bundles it into the
// client). docs/kb-design-lessons.md §6b guard 3 (defer-while-interacting) + guard 10 (arrangement is the viewport's).
//
// A layout-sync that lands while this page's pointer is down, or inside an apply's / the boot's `_restoring`, WAITS
// (LayoutManager._pendingRemote) and is applied once the gate opens — never dropped. A desktop's record is WHOLE, so
// the newest record of a desktop supersedes an older one — of the SAME writer class only: a `phone` record (guard 10)
// is applied to a desktop as membership + content, never as arrangement, so it cannot stand in for a desktop record.
// B-4767 (phone-arrangement-verify r2 F5): the slot kept ONE record per desktop, so a phone record that landed after
// a deferred desktop record REPLACED it — the drag that record carried (another desktop's window move) never landed.
//
//   writerClass(msg)   'phone' | 'desktop' — the layout-sync's `viewport` stamp, else its record's; a re-read (resync)
//                      is the record on disk taken whole ⇒ 'desktop'; an unstamped record (a pre-.264 sender) or an
//                      unknown stamp ⇒ 'desktop'. THE ONE predicate: the slot and the apply's layer law agree.
//   deferKey(msg)      the slot: the desktop's id ('' = the legacy single record) for the desktop class — the key the
//                      map always had — and 'phone:' + id for the phone class. Newest per key wins.
//   deferKeysOf(id)    both slots of a desktop (a deleted desktop forgets both)
//   releaseNext(pending, applied)  → { next: [key, msg] | null, drop: [keys] } — the next record to apply: the lowest
//                      seq first (the server's seq = the arrival order, so a desktop record and the phone record after
//                      it apply in that order, each under its own law); a re-read's record carries no seq and goes
//                      first. A record whose seq is not newer than the newest one already APPLIED for its desktop
//                      (`applied`, a Map desktop → seq) is dropped — never applied backwards.
//   noteApplied(applied, msg)  after an apply: the newest applied seq of the record's desktop
//   recordStamp(msg)   the SERVER's stamp of a record on the wire (lane layout-stale-record-sync): the layout-sync's
//                      `updatedAt`, else the record's own (a re-read takes the stored record whole); 0 = none (an older
//                      server). The seq restarts with the socket and the server; the stamp does not.
//   behindStamp(stamps, msg)  the record is OLDER than the newest one this page applied for its desktop — never applied
//                      (a record never goes backwards: a deferred broadcast from before a sleep after the wake's re-read)
//   noteStamp(stamps, desktopId, at)  the newest stamp of a desktop (a Map desktop → stamp; never lowered)

//   (THE READ HALF of guard 10 — which of a record's layers a page applies — is desktop-record.js applyForViewport, asked
//   with this writerClass: THE LAYER LAW, design q-039 P0; lane phone-sidebar-chrome's chromeToApply is its chrome column.)

const desktopOf = (msg) => (msg && msg.desktopId) || '';
const seqOf = (msg) => Number(msg && msg.seq) || 0;

function writerClass(msg) {
  if (!msg || msg.resync) return 'desktop';
  const stamp = msg.viewport != null ? msg.viewport : msg.state && msg.state.viewport;
  return stamp === 'phone' ? 'phone' : 'desktop';
}

const PHONE_SLOT = 'phone:';
const deferKey = (msg) => (writerClass(msg) === 'phone' ? PHONE_SLOT : '') + desktopOf(msg);
const deferKeysOf = (desktopId) => [desktopId || '', PHONE_SLOT + (desktopId || '')];

function releaseNext(pending, applied = null) {
  const entries = pending instanceof Map ? [...pending.entries()] : Object.entries(pending || {});
  const drop = [];
  let next = null;
  for (const e of entries) {
    const seq = seqOf(e[1]);
    if (seq > 0 && applied && seq <= (Number(applied.get(desktopOf(e[1]))) || 0)) { drop.push(e[0]); continue; }
    if (!next || seq < seqOf(next[1])) next = e; // the first of equal seqs (the map's order) — as the stable sort was
  }
  return { next, drop };
}

function noteApplied(applied, msg) {
  const seq = seqOf(msg);
  if (!applied || !(seq > 0)) return;
  const d = desktopOf(msg);
  if (seq > (Number(applied.get(d)) || 0)) applied.set(d, seq);
}

function recordStamp(msg) {
  const t = Number(msg && (msg.updatedAt != null ? msg.updatedAt : msg.state && msg.state.updatedAt));
  return Number.isFinite(t) && t > 0 ? t : 0;
}

function behindStamp(stamps, msg) {
  const t = recordStamp(msg);
  return !!(t && stamps && t < (Number(stamps.get(desktopOf(msg))) || 0));
}

function noteStamp(stamps, desktopId, at) {
  const t = Number(at);
  if (!stamps || !(Number.isFinite(t) && t > 0)) return;
  const d = desktopId || '';
  if (t > (Number(stamps.get(d)) || 0)) stamps.set(d, t);
}

module.exports = { writerClass, deferKey, deferKeysOf, releaseNext, noteApplied, PHONE_SLOT, recordStamp, behindStamp, noteStamp };
