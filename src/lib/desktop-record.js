// A DESKTOP'S RECORD — PURE (imports nothing; CJS so the server's layout-sync belt and the fast suite require it and
// esbuild bundles it into the client). inc-mun7qjmw-iksh (userW, 2026-09-29): a page builds a desktop's windows
// only the first time it is switched to, so for a desktop never visited since the page loaded the page holds NONE of
// its windows — its record lives only in the desktop manager's cache (`_savedStates`, a copy of the server's record).
// A drag onto that desktop rebuilt the cached record from the windows the page had built there (the moved one) and
// the next autosave sent it: the server replaced the desktop's record and its other windows were gone (HR 3 → 1).
//
// THE RULE this module owns: a desktop's cached record is a VIEW of the server's record plus what this page has
// built; a write to it MERGES — the windows the page has not built stay exactly as the record holds them; a move
// adds the moved window to its target and removes it from its source, and touches nothing else.
//
//   mergeDesktopRecord({record, built, add, remove}) → a NEW record (inputs never mutated)
//     record  the held record ({windows, grid, …}); every non-window field is carried as it is
//     built   the page's captures of the windows it holds on that desktop — a window present in the record AND here
//             takes the page's capture WHOLE, in the record's place (the capture is complete: a field it lacks, e.g.
//             a tab chain the window left, is gone on purpose); one only here is appended, in `built` order
//     add     entries to add (a move's window); appended after `built`, or replace an entry with the same id
//     remove  window ids to drop (a move's source, a closed window, a window the page tried to build and could not)
//   Order: the record's order is kept; new windows go at the end. An entry with no id is kept as it is.
//
//   shrinkVerdict({prev, next, evidence, alive, min, recent}) — the SERVER BELT (ws-handler layout-sync): a sync
//     that drops ≥ `min` (2) windows of the stored record that nothing explains is refused for that desktop. A drop
//     is explained by the client's own evidence (a close / a move / a replace / a window it tried to build and could
//     not, listed in the sync's `evidence`) or by the window's session being gone (a chat/terminal window whose
//     `serverSessionId` is no longer alive). The count is of windows LOST, not the net size: 3 windows replaced by 3
//     others still loses 3. `recent` = the ids ANOTHER client added to the record lately: an unexplained drop of ONE
//     of them is refused (verify r1 — the client wrote from a base older than the arrival); named in `arrived`.
//
//   desktopChanges(prev, next) — the rollback point's "what changed next" (routes/persistence.js LAYOUT ROLLBACK
//     POINTS): per desktop whose window set changed, [name, before, after] — "HR 3 → 1".
'use strict';

const idOf = (w) => {
  if (!w || typeof w !== 'object') return null;
  const id = w.winId != null ? w.winId : w.id;
  return id == null || id === '' ? null : String(id);
};

const listOf = (x) => (Array.isArray(x) ? x : []);

function mergeDesktopRecord({ record = null, built = [], add = [], remove = [] } = {}) {
  const base = record && typeof record === 'object' ? record : {};
  const gone = new Set(listOf(remove).map((x) => (typeof x === 'object' ? idOf(x) : (x == null ? null : String(x)))).filter(Boolean));
  const page = new Map();
  for (const w of [...listOf(built), ...listOf(add)]) {
    const id = idOf(w);
    if (id && !gone.has(id)) page.set(id, w); // a later entry (add) wins over an earlier one (built)
  }
  const windows = [];
  const seen = new Set();
  for (const w of listOf(base.windows)) {
    const id = idOf(w);
    if (!id) { windows.push(w); continue; }
    if (gone.has(id) || seen.has(id)) continue;
    seen.add(id);
    windows.push(page.has(id) ? page.get(id) : w);
  }
  for (const [id, w] of page) {
    if (seen.has(id)) continue;
    seen.add(id);
    windows.push(w);
  }
  return { ...base, windows };
}

/** The ids of a record's windows (a record or a bare list). */
function windowIds(recordOrList) {
  const list = Array.isArray(recordOrList) ? recordOrList : listOf(recordOrList && recordOrList.windows);
  return list.map(idOf).filter(Boolean);
}

const evidenceIds = (evidence) => new Set(listOf(evidence).map((e) => (e && typeof e === 'object' ? idOf(e) : (e == null ? null : String(e)))).filter(Boolean));

function shrinkVerdict({ prev = [], next = [], evidence = [], alive = () => true, min = 2, recent = [] } = {}) {
  const prevList = Array.isArray(prev) ? prev : listOf(prev && prev.windows);
  const nextIds = new Set(windowIds(Array.isArray(next) ? next : listOf(next && next.windows)));
  const ev = evidenceIds(evidence);
  const rec = recent instanceof Set ? recent : new Set(listOf(recent).map((x) => (x == null ? null : String(x))).filter(Boolean));
  const dropped = [];
  const unexplained = [];
  for (const w of prevList) {
    const id = idOf(w);
    if (!id || nextIds.has(id)) continue;
    dropped.push(id);
    if (ev.has(id)) continue;
    const sid = (w.type === 'chat' || w.type === 'terminal') && w.serverSessionId ? String(w.serverSessionId) : null;
    if (sid && !alive(sid)) continue; // its session is gone (killed / exited) — the window leaving is its session's end
    unexplained.push(id);
  }
  // a window ANOTHER client added lately (`recent`) leaves only with evidence — a record dropping it was written from
  // a base older than its arrival (lane desktop-move verify r1: the moved window, dropped by a client that had missed
  // the broadcast); one of them is enough, the ≥ `min` rule is for the rest
  const arrived = unexplained.filter((id) => rec.has(id));
  if (unexplained.length >= min || arrived.length) return { ok: false, reason: 'shrink-without-close', dropped, unexplained, arrived };
  return { ok: true, dropped, unexplained, arrived };
}

/** Per desktop whose window SET differs between two layouts.json documents: [name, before, after] (a desktop only in
 *  one of them counts 0 on the other side). Names come from `desktopMeta` (next's first, a deleted one from prev's). */
function desktopChanges(prev, next) {
  const recs = (d) => { const m = new Map(); for (const [k, v] of Object.entries((d && d.desktops) || {})) m.set(k, windowIds((v && v.autoSave) || null)); return m; };
  const a = recs(prev), b = recs(next);
  const nameOf = (id) => {
    for (const d of [next, prev]) { const m = listOf(d && d.desktopMeta).find((x) => x && x.id === id); if (m && m.name) return String(m.name); }
    return String(id).slice(-4);
  };
  const out = [];
  const keys = [...new Set([...a.keys(), ...b.keys()])];
  for (const k of keys) {
    const x = a.get(k) || [], y = b.get(k) || [];
    const same = x.length === y.length && x.every((id) => y.includes(id));
    if (!same) out.push([nameOf(k), x.length, y.length]);
  }
  const topA = windowIds((prev && prev.autoSave) || null), topB = windowIds((next && next.autoSave) || null);
  if ((topA.length || topB.length) && !(topA.length === topB.length && topA.every((id) => topB.includes(id)))) out.push(['', topA.length, topB.length]);
  return out;
}

module.exports = { mergeDesktopRecord, shrinkVerdict, desktopChanges, windowIds, idOf };
