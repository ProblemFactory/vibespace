'use strict';
// THE DEFERRED RECORDS + THE CHROME A RECORD MAY SET HERE — PURE (imports only desktop-record's VIEWPORT_CHROME, PURE →
// PURE; CJS so the fast suite requires it and esbuild bundles it into the client). docs/kb-design-lessons.md §6b guard 3
// (defer-while-interacting) + guard 10 (arrangement is the viewport's).
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
//                      unknown stamp ⇒ 'desktop'. THE ONE predicate: the slot and the apply's membership-only law agree.
//   deferKey(msg)      the slot: the desktop's id ('' = the legacy single record) for the desktop class — the key the
//                      map always had — and 'phone:' + id for the phone class. Newest per key wins.
//   deferKeysOf(id)    both slots of a desktop (a deleted desktop forgets both)
//   releaseNext(pending, applied)  → { next: [key, msg] | null, drop: [keys] } — the next record to apply: the lowest
//                      seq first (the server's seq = the arrival order, so a desktop record and the phone record after
//                      it apply in that order, each under its own law); a re-read's record carries no seq and goes
//                      first. A record whose seq is not newer than the newest one already APPLIED for its desktop
//                      (`applied`, a Map desktop → seq) is dropped — never applied backwards.
//   noteApplied(applied, msg)  after an apply: the newest applied seq of the record's desktop
//
//   chromeToApply(viewport, msg) → { sidebarOpen, grid } — THE READ HALF OF GUARD 10 (owner inc-mv8l2frb-xkqm,
//                      2026-10-14: "every reopen of the page on the phone pops the sidebar"): which of a record's
//                      VIEWPORT_CHROME this page applies. Since .264 the phone no longer writes its own `sidebarOpen`
//                      (it carries the held record's, verbatim), so the record keeps the DESK's open sidebar — and the
//                      phone's apply still opened its full-screen overlay at every boot and every reconnect re-read.
//                      A `phone` page applies NONE of it from any record (its sidebar is a modal it opens itself; it
//                      never sets a grid). A `desktop` page applies a record of the desktop class only (writerClass: a
//                      phone record is membership + content here — the apply's membershipOnly law, by class, not by
//                      trust); a re-read is the record on disk taken whole ⇒ desktop.
//   TAKEN_WHOLE        the record a boot restores and a preset the person loads — the record on disk taken whole, like
//                      the reconnect's re-read (a desktop booting on a record the phone wrote last keeps its own grid
//                      and sidebar: belt 1 carried them verbatim)

const { VIEWPORT_CHROME } = require('./desktop-record.js');
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

const TAKEN_WHOLE = Object.freeze({ resync: true });

function chromeToApply(viewport, msg) {
  const on = viewport !== 'phone' && writerClass(msg) === 'desktop';
  return Object.fromEntries(VIEWPORT_CHROME.map((k) => [k, on]));
}

module.exports = { writerClass, deferKey, deferKeysOf, releaseNext, noteApplied, chromeToApply, TAKEN_WHOLE, PHONE_SLOT };
