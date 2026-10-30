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
//   IDENTITY IS NEVER FORGOTTEN (lane layout-stale-record-sync, the owner 2026-10-22 «我的工作桌面里的窗口怎么突然都没了»): a
//   chat / terminal window built from a record knows WHO it is only when its attach answers (`app.sessions` has it then) —
//   a capture in between carried no serverSessionId / backendSessionId and took the record's place WHOLE: a phone that
//   woke and saved within a second wrote 工作's five windows nameless, and every desktop that booted on that record built
//   none of them. keepIdentity(prev, next): a captured entry keeps each IDENTITY field it lacks (and its openSpec's
//   backendSessionId) from the record's entry of the same session; a capture that names ANOTHER session keeps its own.
//   keepIdentities(prevList, nextList) does it per id (the server's write, ws-handler layout-sync).
//   A WINDOW NEVER LOSES ITS NAME (lane layout-stopped-window, the owner 2026-10-30 «我的个人桌面丢了很多窗口»): the resume-all
//   after a hub restart opened each stopped conversation in a NEW window (a new winId), titled with the bare name and with no
//   identity until its create answered; resume placement captured it into its desktop's record IN PLACE of the named entry it
//   replaced, and the per-id carry above had nothing to match — 个人 was written with seven of its eleven windows nameless
//   (09:18:22) and the next page dropped them as 'unbuilt' (09:19:35, 11 → 4). keepNames({prev, next, evidence}) → {windows,
//   carried, withheld} is the writer's rule for a NEW entry (an id `prev` does not hold) that names no conversation and no
//   server session (isNameless): it takes the name of the named entry this write drops that it replaced — the evidence entry
//   whose `by` names it, else the ONE dropped entry of its name (namesOf: the title without its " — <cwd>" tail, and the
//   openSpec's name; one-to-one, two windows of one name are never guessed) — and with none it is left out of THIS write
//   (`withheld`, said by the writer). carryName(from, next) copies the conversation (backend, the id, claudeSessionId, cwd),
//   never the old window's server session or openSpec. mergeDesktopRecord's `replaced` ([[newId, oldId]]) is the client's
//   twin: a moved window that `replaces` an entry takes that entry's name in the held record.
//
//   shrinkVerdict({prev, next, evidence, alive, min, recent}) — the SERVER BELT (ws-handler layout-sync): a sync
//     that drops ≥ `min` (2) windows of the stored record that nothing explains is refused for that desktop. A drop
//     is explained by the client's own evidence (a close / a move / a replace / a window it tried to build and could
//     not, listed in the sync's `evidence`) or by the window's session being gone (a chat/terminal window whose
//     `serverSessionId` is no longer alive). The count is of windows LOST, not the net size: 3 windows replaced by 3
//     others still loses 3. `recent` = the ids ANOTHER client added to the record lately: an unexplained drop of ONE
//     of them is refused (verify r1 — the client wrote from a base older than the arrival); named in `arrived`.
//     A PAGE'S FAILURE IS NOT THE WORKSPACE'S TRUTH (lane layout-stale-record-sync): 'unbuilt' explains no window whose
//     session is ALIVE (sessionOf: its serverSessionId, else the server session its openSpec attaches to) unless another
//     window of the record still shows that session — such a drop is refused at ANY count and named in `unexplained`
//     (`live` lists them): the woken desktops of 00:17 / 00:19 sent 工作 with its five live windows dropped as 'unbuilt'.
//     UNBUILT IS NOT DROPPED (lane layout-stopped-window): nor a SESSION window whose session is stopped, unknown or nameless —
//     a page that cannot build it shows it as a placeholder until the person closes it; dropped as 'unbuilt' it is refused at
//     ANY count and named in `unbuilt` (09:19:35: 个人 11 → 4 with seven 'unbuilt'). A duplicate (another entry still shows
//     its session) still leaves; a window that is no session stays explained by 'unbuilt'.
//
//   staleVerdict({writes, who, storedAt, base}) — THE STALENESS GATE (lane layout-stale-record-sync, §6b guard 11): a
//     record never goes backwards. Every write names `base` — the server stamp (`updatedAt`) of the newest record of that
//     desktop its writer had seen; the server refuses ('stale') a write whose base is older than the newest record
//     ANOTHER writer stored (foreignStamp: the stored record unless this writer wrote it, then the newest write before it
//     that is not this writer's — `writes` = [{who, at, replaced}], oldest first) and answers the record kept; the
//     writer adopts it (onSyncRefused) and re-sends from it. A write naming no base (an older bundle) is not judged.
//
//   captureForViewport({held, built, viewport}) — ARRANGEMENT IS THE VIEWPORT'S, MEMBERSHIP IS THE WORKSPACE'S (lane
//     phone-arrangement-local, owner 2026-10-13 "不能根治吗"): a phone's switcher tap raised the tapped window's z on the
//     phone, its save carried that z (and a phone-born window's full-screen box) into the desktop's record and every
//     desktop restacked. A `phone` client's capture keeps the ARRANGEMENT fields of each window it built exactly as the
//     held record has them (a window the record does not hold — born on the phone — gets no box: every desktop that
//     builds it places it by its own default, on top: z = max(held z) + 1, neither maximized nor minimized); everything
//     else (openSpec, title, chain…) is the page's. A `desktop` client's capture is returned as it is. Its record-level
//     twin is PHONE_KEEPS (every record field outside the workspace — the grid, the chrome, the preference, derived from
//     LAYERS): recordFor / presetState carry them from the held record verbatim on a phone (lane layout-layers-p1 — before
//     it a phone wrote its own theme / fonts / bars, which the server half below now refuses).
//
//   desktopChanges(prev, next) — the rollback point's "what changed next" (routes/persistence.js LAYOUT ROLLBACK
//     POINTS): per desktop whose window set changed, [name, before, after] — "HR 3 → 1".
//
//   THE LAYER LAW (design q-039 P0, the owner 2026-10-14 「彻底根治这类问题」; docs/kb-design-lessons.md §6b item 10) — ONE
//     layout document, every field of it owned by exactly ONE layer. Each bug of the .264 / .268 / .273 class was "whose
//     field is this?" answered by a per-field special case; LAYERS answers it once, as data, and a field no row names is
//     RED (test-desktop-record §8's census of the real document shape and of every key layout.js captures).
//       workspace    the one truth every viewport reads and writes: which windows, their identity and content (openSpec,
//                    title, paths, the tab chain — one unit, see below), the document's desktops / presets / current
//       arrangement  the DESKTOP viewport's, synced between desktops: z, box, maximize / minimize / snap, the grid
//       chrome       a device's own furniture, applied by the desktop class only: the sidebar, the bars (taskbarHeight and
//                    the toolbar scale are one class since 2.252.2 — both broadcast live, before the desktop gate)
//       preference   legacy per-user settings riding the record (settings one day): theme, fonts — a desktop reads them at
//                    the boot only; customGrids (a document field) is read by the grid dialog, never by a record's apply
//       meta         protocol stamps, never state: the writer's viewport, the server's updatedAt / seq, the sync's evidence
//     A phone's own arrangement (its window on show, its switcher order) is local — sessionStorage / memory — and never in
//     the document; the desktop's `_activeId` is not synced either (§6c). The tab chain is applied as ONE record by the
//     chain machinery (§6b guard 6: `active` stays this page's on an in-place apply) and a phone carries the split it
//     cannot display by applying it, because its capture writes the chain it holds (captureForViewport carries top-level
//     keys only) — so the chain's active / layout / split stay with its members until the write half carries them.
//     layerOf(field) → the layer's name, or null. A chain key is spelled 'tabChain.<key>'.
//
//   applyForViewport(viewportClass, record, {source, writer}) → {membership, arrangement, chrome, preference} — THE READ
//     HALF: what of a record THIS page applies, taken by every read site of src/lib/layout.js BEFORE it touches the page
//     (the live record / the reconnect's re-read, the boot's restore and a desktop switch's, a preset the person loads).
//     `source` 'remote' | 'boot' | 'preset'; `writer` = layout-model.js writerClass(msg) for a remote record (a re-read is
//     the record on disk taken whole ⇒ 'desktop'), else the record's own stamp.
//         reader   source                          membership  arrangement               chrome  preference
//         phone    remote · boot · preset          ✓           the minimize only (guard 5)  —       —
//         desktop  remote, a desktop-class writer  ✓           ✓                         ✓       —
//         desktop  remote, a phone writer (live)   ✓           —                         —       —
//         desktop  boot (taken whole)              ✓           ✓                         ✓       ✓
//         desktop  preset                          ✓           ✓                         —       —
//     A phone shows a desktop's minimize (guard 5: a state a client cannot display it still carries — the window hidden,
//     listed under Minimized) and nothing else of the arrangement; a desktop never takes a live phone record's arrangement
//     or chrome (guard 10 — the retired `membershipOnly`); a preset never opens a sidebar nor changes a theme.
//       membership   {windows: [each entry's workspace fields]} — always; an arrangement field is not in it
//       arrangement  null | {grid, windows: {id → fields}} — a desktop's carries EVERY arrangement key (undefined when the
//                    entry lacks it), a phone's the minimize keys only and no grid: `'k' in a` reads "this page applies k"
//       chrome / preference  null | the record's fields of that layer it holds (a present key stays present: an explicit
//                    `toolbarScale: null` is the sender's reset)
//     arrangementFor(layers, entry) → the arrangement fields of one entry this page applies, or null.
//
//   layerGate(stamp, held, next) → {ok: true} | {ok: false, reason: 'cross-layer', fields, windows} — THE SERVER HALF (design
//     q-039 P1, lane layout-layers-p1; ws-handler layout-sync asks it right after the shrink belt): a `phone`-stamped record
//     may change the WORKSPACE only. Every arrangement / chrome / preference field it carries must equal the held record's —
//     each window the held record holds (ARRANGEMENT) and each record field (PHONE_KEEPS); else the server refuses it whatever
//     bundle sent it (an old phone tab, a new bug) and the sender reconciles by the shrink belt's protocol. Compared as the
//     readers read them: a legacy spelling is its canonical's (z/zIndex, min/isMinimized, snap/isSnapped,
//     snapBounds/preSnapBounds), an absent flag is false and an absent value null, a toolbar scale within 0.02 of 1 is the
//     null the capture writes, numbers within guard 4's apply epsilon (0.002 — the gridBounds fractions) are equal. Not
//     judged: a `desktop` stamp, NO stamp (a pre-.264 sender = a desktop's, as before), no held record (a first write), a
//     window the held record does not hold (the workspace's news — a window born on the phone, a move's arrival), a field
//     no layer names (test-desktop-record §8's census reds it first). `fields` = the canonical names that moved, in table
//     order; `windows` = the ids whose arrangement moved.
'use strict';

const idOf = (w) => {
  if (!w || typeof w !== 'object') return null;
  const id = w.winId != null ? w.winId : w.id;
  return id == null || id === '' ? null : String(id);
};

const listOf = (x) => (Array.isArray(x) ? x : []);

/** The server session a chat / terminal entry names: its live attach, else the one its openSpec attaches to; null for
 *  any other window. */
const sessionOf = (w) => {
  if (!w || typeof w !== 'object' || (w.type !== 'chat' && w.type !== 'terminal')) return null;
  const spec = w.openSpec && typeof w.openSpec === 'object' && w.openSpec.action === 'attachSession' ? w.openSpec : null;
  const sid = w.serverSessionId || (spec && spec.serverId);
  return sid ? String(sid) : null;
};

/** What names a session window's conversation — kept from the record by a capture that does not know it (yet). */
const IDENTITY = ['serverSessionId', 'backend', 'backendSessionId', 'claudeSessionId', 'cwd'];
const blank = (v) => v == null || v === '';

function keepIdentity(prev, next) {
  if (!prev || !next || typeof prev !== 'object' || typeof next !== 'object' || prev === next) return next;
  if ((prev.type !== 'chat' && prev.type !== 'terminal') || prev.type !== next.type) return next;
  const a = sessionOf(prev), b = sessionOf(next);
  if (a && b && a !== b) return next; // another session now (a resume, a re-attach): the identity is the capture's own
  let out = null;
  const put = (k, v) => { if (!out) out = { ...next }; out[k] = v; };
  for (const k of IDENTITY) if (blank(next[k]) && !blank(prev[k])) put(k, prev[k]);
  const ps = prev.openSpec, ns = next.openSpec;
  if (ns && typeof ns === 'object' && ns.action === 'attachSession' && blank(ns.backendSessionId)
    && ps && typeof ps === 'object' && ps.action === 'attachSession' && !blank(ps.backendSessionId)) {
    const spec = { ...ns, backendSessionId: ps.backendSessionId };
    if (blank(ns.sessionKey) && !blank(ps.sessionKey)) spec.sessionKey = ps.sessionKey;
    put('openSpec', spec);
  }
  return out || next;
}

function keepIdentities(prevList, nextList) {
  const byId = new Map();
  for (const w of listOf(prevList)) { const id = idOf(w); if (id && !byId.has(id)) byId.set(id, w); }
  return listOf(nextList).map((w) => { const id = idOf(w); return id && byId.has(id) ? keepIdentity(byId.get(id), w) : w; });
}

/** A session window's entry (chat / terminal) — the windows a conversation names. */
const isSession = (w) => !!w && typeof w === 'object' && (w.type === 'chat' || w.type === 'terminal');
/** The conversation a session entry names (its id, else the one its openSpec names), or null. */
const conversationOf = (w) => {
  if (!isSession(w)) return null;
  const spec = w.openSpec && typeof w.openSpec === 'object' ? w.openSpec : {};
  const id = !blank(w.backendSessionId) ? w.backendSessionId : !blank(w.claudeSessionId) ? w.claudeSessionId : spec.backendSessionId;
  return blank(id) ? null : String(id);
};
/** A session entry nothing can rebuild: no conversation and no server session (the restore matches by one of them). */
const isNameless = (w) => isSession(w) && !conversationOf(w) && !sessionOf(w);
/** What the person reads as the window's name: its title without the " — <cwd>" tail (layout.js savedWindowName's rule)
 *  and its openSpec's name — both (the title carries a custom name, the openSpec the first message's). */
function namesOf(w) {
  const out = new Set();
  if (!w || typeof w !== 'object') return out;
  const spec = w.openSpec && typeof w.openSpec === 'object' ? w.openSpec : {};
  const cwd = String(w.cwd || spec.cwd || '');
  const tail = cwd ? ' — ' + cwd : '';
  let t = String(w.title || '');
  while (tail && t.length > tail.length && t.endsWith(tail)) t = t.slice(0, -tail.length);
  if (t.trim()) out.add(t.trim());
  if (typeof spec.name === 'string' && spec.name.trim()) out.add(spec.name.trim());
  return out;
}
/** `next` takes `from`'s conversation — never its server session (the attach was the old window's) nor its openSpec. */
function carryName(from, next) {
  const cid = conversationOf(from);
  if (!cid || !isSession(next) || from.type !== next.type || conversationOf(next)) return next;
  const spec = from.openSpec && typeof from.openSpec === 'object' ? from.openSpec : {};
  const out = { ...next, backendSessionId: cid };
  const pick = (k, v) => { if (blank(out[k]) && !blank(v)) out[k] = v; };
  pick('backend', from.backend); pick('backend', spec.backend);
  pick('claudeSessionId', from.claudeSessionId);
  pick('cwd', from.cwd); pick('cwd', spec.cwd);
  return out;
}

function keepNames({ prev = [], next = [], evidence = [] } = {}) {
  const prevList = Array.isArray(prev) ? prev : listOf(prev && prev.windows);
  const nextList = Array.isArray(next) ? next : listOf(next && next.windows);
  const prevIds = new Set(windowIds(prevList)), nextIds = new Set(windowIds(nextList));
  // the NAMED entries this write drops — what a nameless newcomer may have replaced
  const dropped = prevList.filter((w) => { const id = idOf(w); return id && !nextIds.has(id) && conversationOf(w); });
  const droppedBy = new Map(dropped.map((w) => [idOf(w), w]));
  const link = new Map(); // newcomer id → the dropped entry the evidence says it replaced (`by`)
  for (const e of listOf(evidence)) if (e && typeof e === 'object' && e.by != null && droppedBy.has(idOf(e))) link.set(String(e.by), droppedBy.get(idOf(e)));
  const fresh = nextList.filter((w) => { const id = idOf(w); return id && !prevIds.has(id) && isNameless(w); });
  const used = new Set([...link.values()].map(idOf));
  const overlaps = (a, b) => { for (const n of a) if (b.has(n)) return true; return false; };
  const pairs = new Map();
  for (const w of fresh) {
    const id = idOf(w);
    if (link.has(id)) { pairs.set(id, { from: link.get(id), how: 'evidence' }); continue; }
    const mine = namesOf(w);
    if (!mine.size) continue;
    const cands = dropped.filter((p) => !used.has(idOf(p)) && p.type === w.type && overlaps(namesOf(p), mine));
    if (cands.length !== 1) continue;
    const theirs = namesOf(cands[0]);
    if (fresh.some((x) => x !== w && !link.has(idOf(x)) && x.type === w.type && overlaps(namesOf(x), theirs))) continue; // two windows of one name: neither is guessed
    used.add(idOf(cands[0]));
    pairs.set(id, { from: cands[0], how: 'name' });
  }
  const windows = [], carried = [], withheld = [];
  for (const w of nextList) {
    const id = idOf(w);
    const p = id ? pairs.get(id) : null;
    if (p) { windows.push(carryName(p.from, w)); carried.push({ id, from: idOf(p.from), how: p.how }); continue; }
    if (id && !prevIds.has(id) && isNameless(w)) { withheld.push({ id, title: String(w.title || '') }); continue; }
    windows.push(w);
  }
  return { windows, carried, withheld };
}

/** The newest record of a desktop ANOTHER writer stored (see staleVerdict). */
function foreignStamp(writes, who, storedAt) {
  const list = listOf(writes);
  const at = Number(storedAt) || 0;
  const last = list[list.length - 1];
  if (!last || last.who !== who || Number(last.at) !== at) return at; // the stored record is not this writer's own
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].who !== who) return Number(list[i].at) || 0;
    if (i === 0) return Number(list[0].replaced) || 0;
  }
  return 0;
}

function staleVerdict({ writes = [], who = null, storedAt = 0, base = null } = {}) {
  const b = typeof base === 'number' && Number.isFinite(base) && base > 0 ? base : null;
  if (b === null) return { ok: true, judged: false };
  const held = foreignStamp(writes, who, storedAt);
  if (b < held) return { ok: false, reason: 'stale', held, base: b };
  return { ok: true, judged: true, held, base: b };
}

function mergeDesktopRecord({ record = null, built = [], add = [], remove = [], replaced = [] } = {}) {
  const base = record && typeof record === 'object' ? record : {};
  const was = new Map(); // a newcomer → the record's entry it replaces (lane layout-stopped-window: it takes that entry's name)
  for (const pair of listOf(replaced)) {
    const [n, o] = Array.isArray(pair) ? pair : [];
    const p = o == null ? null : listOf(base.windows).find((w) => idOf(w) === String(o));
    if (n != null && p) was.set(String(n), p);
  }
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
    windows.push(page.has(id) ? keepIdentity(w, page.get(id)) : w); // the page's capture, minus nothing it did not know (identity)
  }
  for (const [id, w] of page) {
    if (seen.has(id)) continue;
    seen.add(id);
    windows.push(was.has(id) ? carryName(was.get(id), w) : w);
  }
  return { ...base, windows };
}

/** The ids of a record's windows (a record or a bare list). */
function windowIds(recordOrList) {
  const list = Array.isArray(recordOrList) ? recordOrList : listOf(recordOrList && recordOrList.windows);
  return list.map(idOf).filter(Boolean);
}

const evidenceIds = (evidence) => new Set(listOf(evidence).map((e) => (e && typeof e === 'object' ? idOf(e) : (e == null ? null : String(e)))).filter(Boolean));
/** id → why ('' for a bare id) — the evidence's reasons */
const evidenceWhy = (evidence) => { const m = new Map(); for (const e of listOf(evidence)) { const id = e && typeof e === 'object' ? idOf(e) : (e == null ? null : String(e)); if (id) m.set(id, e && typeof e === 'object' && typeof e.why === 'string' ? e.why : ''); } return m; };

function shrinkVerdict({ prev = [], next = [], evidence = [], alive = () => true, min = 2, recent = [] } = {}) {
  const prevList = Array.isArray(prev) ? prev : listOf(prev && prev.windows);
  const nextList = Array.isArray(next) ? next : listOf(next && next.windows);
  const nextIds = new Set(windowIds(nextList));
  const nextSessions = new Set(nextList.map(sessionOf).filter(Boolean)); // a session another entry of the record still shows
  const ev = evidenceIds(evidence);
  const why = evidenceWhy(evidence);
  const live = [];
  const rec = recent instanceof Set ? recent : new Set(listOf(recent).map((x) => (x == null ? null : String(x))).filter(Boolean));
  const dropped = [];
  const unexplained = [];
  const unbuilt = [];
  for (const w of prevList) {
    const id = idOf(w);
    if (!id || nextIds.has(id)) continue;
    dropped.push(id);
    const sid = sessionOf(w);
    // 'unbuilt' is the page's failure, never the workspace's truth: a window whose session is ALIVE stays (unless another
    // entry still shows that session — a duplicate the page settled at once)
    // UNBUILT IS NOT DROPPED (lane layout-stopped-window): a SESSION window whose session is stopped, unknown or nameless —
    // the page shows a placeholder for it; only the person's close removes it (a duplicate still leaves; a live one: below)
    if (ev.has(id) && why.get(id) === 'unbuilt' && isSession(w) && !(sid && (nextSessions.has(sid) || alive(sid)))) { unexplained.push(id); unbuilt.push(id); continue; }
    if (ev.has(id) && !(why.get(id) === 'unbuilt' && sid && !nextSessions.has(sid) && alive(sid))) continue;
    if (ev.has(id)) { unexplained.push(id); live.push(id); continue; }
    if (sid && !alive(sid)) continue; // its session is gone (killed / exited) — the window leaving is its session's end
    unexplained.push(id);
  }
  // a window ANOTHER client added lately (`recent`) leaves only with evidence — a record dropping it was written from
  // a base older than its arrival (lane desktop-move verify r1: the moved window, dropped by a client that had missed
  // the broadcast); one of them is enough, the ≥ `min` rule is for the rest
  const arrived = unexplained.filter((id) => rec.has(id));
  if (unexplained.length >= min || arrived.length || live.length || unbuilt.length) return { ok: false, reason: 'shrink-without-close', dropped, unexplained, arrived, live, unbuilt };
  return { ok: true, dropped, unexplained, arrived, live, unbuilt };
}

/** Per desktop whose window SET differs between two layouts.json documents: [name, before, after] (a desktop only in
 *  one of them counts 0 on the other side). Names come from `desktopMeta` (next's first, a deleted one from prev's). */
/** The arrangement fields of a window entry (legacy spellings too) — the desktop viewport's, never a phone's. */
const ARRANGEMENT = ['zIndex', 'z', 'gridBounds', 'isMaximized', 'isMinimized', 'min', 'isSnapped', 'snap', 'preSnapBounds', 'snapBounds'];

/** THE LAYER LAW's table — every field of the layout document, by layer (legacy spellings beside their canonical one). */
const LAYERS = Object.freeze([
  Object.freeze({ layer: 'workspace', fields: Object.freeze([
    'current', 'autoSave', 'saved', 'desktopMeta', 'desktops', 'windows', // the document + a record's window list
    'winId', 'id', 'type', 'title', 'openSpec', 'serverSessionId', 'backend', 'backendSessionId', 'claudeSessionId', 'cwd',
    'terminalOverrides', 'editorState', 'explorerPath', 'explorerHost', 'filePath', 'fileName', 'browserUrl', 'isTabGuest',
    'tabChain', 'tabChain.tabs', 'tabChain.order', 'tabChain.active', 'tabChain.layout', 'tabChain.split',
  ]) }),
  Object.freeze({ layer: 'arrangement', fields: Object.freeze(['grid', ...ARRANGEMENT]) }),
  Object.freeze({ layer: 'chrome', fields: Object.freeze(['sidebarOpen', 'taskbarHeight', 'toolbarScale', 'toolbarHeight']) }),
  Object.freeze({ layer: 'preference', fields: Object.freeze(['theme', 'globalFontSize', 'globalFontFamily', 'customGrids']) }),
  Object.freeze({ layer: 'meta', fields: Object.freeze(['viewport', 'updatedAt', 'seq', 'evidence']) }),
]);
const LAYER_OF = new Map();
for (const row of LAYERS) for (const f of row.fields) if (!LAYER_OF.has(f)) LAYER_OF.set(f, row.layer);
const layerOf = (field) => LAYER_OF.get(String(field)) || null;
const fieldsOf = (layer) => (LAYERS.find((r) => r.layer === layer) || { fields: [] }).fields;
/** The arrangement a phone DISPLAYS (§6b guard 5): a desktop's minimize — never written back (captureForViewport). */
const PHONE_SHOWS = ['isMinimized', 'min'];
const SOURCES = ['remote', 'boot', 'preset'];
/** Every RECORD field outside the workspace (the grid, the chrome, the preference) — a phone's record carries them from the
 *  held record verbatim (desktop-manager.js recordFor / presetState); layerGate refuses a phone record that moves one. */
const PHONE_KEEPS = Object.freeze(LAYERS.filter((r) => ['arrangement', 'chrome', 'preference'].includes(r.layer)).flatMap((r) => r.fields).filter((f) => !ARRANGEMENT.includes(f)));

function applyForViewport(viewportClass, record, { source = 'remote', writer = null } = {}) {
  const rec = record && typeof record === 'object' ? record : {};
  const phone = viewportClass === 'phone';
  const by = writer || (rec.viewport === 'phone' ? 'phone' : 'desktop');
  const known = SOURCES.includes(source);
  const arranged = known && (phone || source !== 'remote' || by !== 'phone');
  const chromed = known && !phone && source !== 'preset' && (source === 'boot' || by !== 'phone');
  const preferred = known && !phone && source === 'boot';
  const pickOf = (w, keys, all) => { const o = {}; for (const k of keys) if (all || k in w) o[k] = w[k]; return o; };
  const windows = listOf(rec.windows).filter((w) => w && typeof w === 'object');
  const membership = { windows: windows.map((w) => { const o = {}; for (const k of Object.keys(w)) if (layerOf(k) === 'workspace') o[k] = w[k]; return o; }) };
  let arrangement = null;
  if (arranged) {
    arrangement = { windows: Object.create(null) }; // keyed by window id (no prototype: an id is never a builtin's name)
    if (!phone) arrangement.grid = rec.grid;
    for (const w of windows) { const id = idOf(w); if (id && !(id in arrangement.windows)) arrangement.windows[id] = phone ? pickOf(w, PHONE_SHOWS, true) : pickOf(w, ARRANGEMENT, true); }
  }
  const layerPick = (on, layer) => (on ? pickOf(rec, fieldsOf(layer), false) : null);
  return { membership, arrangement, chrome: layerPick(chromed, 'chrome'), preference: layerPick(preferred, 'preference') };
}

/** One entry's arrangement this page applies (applyForViewport's subset), or null. */
const arrangementFor = (layers, entry) => {
  const id = idOf(entry);
  return (id && layers && layers.arrangement && layers.arrangement.windows[id]) || null;
};

function captureForViewport({ held = null, built = [], viewport = 'desktop' } = {}) {
  if (viewport !== 'phone') return listOf(built);
  const heldBy = new Map();
  let top = 0;
  for (const w of listOf(held && held.windows)) {
    const id = idOf(w);
    if (id && !heldBy.has(id)) heldBy.set(id, w);
    const z = Number(w && (w.zIndex != null ? w.zIndex : w.z)) || 0;
    if (z > top) top = z;
  }
  return listOf(built).map((w) => {
    const id = idOf(w);
    if (!id) return w;
    const out = {};
    for (const k of Object.keys(w)) if (!ARRANGEMENT.includes(k)) out[k] = w[k];
    const h = heldBy.get(id);
    if (h) { for (const k of ARRANGEMENT) if (k in h) out[k] = h[k]; return out; }
    out.zIndex = ++top; out.isMaximized = false; out.isMinimized = false;
    return out;
  });
}

/** canonical → its legacy spelling (the same layer; read both, the canonical first — as the apply reads them) */
const LEGACY = { zIndex: 'z', isMinimized: 'min', isSnapped: 'snap', preSnapBounds: 'snapBounds' };
const WIN_GATED = ARRANGEMENT.filter((f) => !Object.values(LEGACY).includes(f));
const GATE_EPS = 0.002; // §6b guard 4: the apply epsilon on the gridBounds fractions (a sub-pixel wobble is no change)
const GATE_NORM = { toolbarScale: (v) => (v == null || (typeof v === 'number' && Math.abs(v - 1) <= 0.02) ? null : v) }; // layout.js captureChrome writes null within 0.02 of 1
const gateValue = (o, f) => { const v = o[f] != null ? o[f] : (LEGACY[f] ? o[LEGACY[f]] : undefined); return GATE_NORM[f] ? GATE_NORM[f](v) : v; };
const sameValue = (a, b) => {
  if (a == null || b == null) { const x = a == null ? b : a; return x == null || x === false; } // an absent flag is false, an absent value null
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= GATE_EPS;
  if (typeof a !== 'object' || typeof b !== 'object') return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (!sameValue(a[k], b[k])) return false;
  return true;
};

function layerGate(stamp, held, next) {
  if (stamp !== 'phone' || !held || typeof held !== 'object' || !next || typeof next !== 'object') return { ok: true };
  const moved = new Set(), windows = [];
  for (const f of PHONE_KEEPS) if (!sameValue(gateValue(held, f), gateValue(next, f))) moved.add(f);
  const heldBy = new Map();
  for (const w of listOf(held.windows)) { const id = idOf(w); if (id && !heldBy.has(id)) heldBy.set(id, w); }
  const seen = new Set();
  for (const w of listOf(next.windows)) {
    const id = idOf(w), h = id ? heldBy.get(id) : null;
    if (!h || seen.has(id)) continue; // a window the held record does not hold is the workspace's news (its first write)
    seen.add(id);
    const diff = WIN_GATED.filter((f) => !sameValue(gateValue(h, f), gateValue(w, f)));
    if (diff.length) { windows.push(id); for (const f of diff) moved.add(f); }
  }
  if (!moved.size) return { ok: true };
  return { ok: false, reason: 'cross-layer', fields: [...WIN_GATED, ...PHONE_KEEPS].filter((f) => moved.has(f)), windows };
}

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

module.exports = { mergeDesktopRecord, shrinkVerdict, desktopChanges, windowIds, idOf, captureForViewport, ARRANGEMENT, PHONE_KEEPS, LAYERS, layerOf, PHONE_SHOWS, applyForViewport, arrangementFor, layerGate, sessionOf, IDENTITY, keepIdentity, keepIdentities, foreignStamp, staleVerdict, isSession, conversationOf, isNameless, namesOf, carryName, keepNames };
