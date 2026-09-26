'use strict';
// THE TAB CHAIN'S LAYOUT — PURE (imports only the shared colour sequence; CJS
// so the fast suite requires it and esbuild bundles it into the client).
// Agent browser P7 (docs/design-agent-browser-v2.md §4.6 / §3.7, D19 / D24).
//
// A chain is `{ tabs: [hostId, ...guestIds], active }` (src/lib/tab-group.js)
// and it GAINS fields here, while `tabs` and `active` keep their meanings to
// the byte — every existing path reads them (`tabs` = MEMBERSHIP, `tabs[0]` =
// the host that owns the element; `active` = an index into `tabs`):
//   layout: 'tabs' | 'split'            a MISSING field reads as 'tabs' (old records need no migration)
//   order:  [ids]                       the STRIP order, a permutation of `tabs` (split tabs v2, 2026-09-25) —
//                                       a reorder never re-hosts (re-hosting re-parents every content); missing ⇒ `tabs` order
//   split:  { pair: [leftShown, rightShown], ratio, dir: 'row', left: [ids], right: [ids] }
//                                       meaningful only while layout === 'split'. EVERY tab belongs to a SIDE:
//                                       `left` / `right` are ORDERED lists whose union is `tabs`; `pair` = the tab
//                                       each side shows (pair[0] ∈ left, pair[1] ∈ right); the strip order is
//                                       `left ++ right` (so leaving the split keeps "left then right")
// A split is another RENDERING of the same chain, not a second kind of chain:
// each side's shown tab is drawn side by side inside the host's element, the
// rest wait in their side's half of the strip (docs/design-split-ux.zh.md §8).
//
// `split` is a REFERENCE into `tabs`, so it owes an invariant — enforced in
// ONE place (`normalizeChain`, called by every chain mutation in tab-group.js):
// a pair member not in `tabs`, a pair member on the wrong side or an EMPTY side
// ⇒ layout collapses to 'tabs' and split is DROPPED (never a dangling id, never
// a guessed substitute — the guessed pane is the very thing "whose browser is
// that" has to answer). The VERBS below pick a substitute BEFORE normalizing
// (removeTab / moveTab: the side shows its neighbour, an emptied side ends the
// split); the validator never guesses. A record written before the sides
// existed is REPAIRED by one rule (`sidesFor`): the non-anchor pane alone on
// its side, every other tab with the anchor.
//
// The multi-client sync key (§4.6's named trap): layout.js used to key
// remote-vs-local chains by `tabs.join(',')`, which does not carry the layout —
// a remote client flipping the same tabs to a split read locally as "unchanged".
// `chainSyncKey` carries every STRUCTURAL fact — membership, the strip order,
// the layout, where the sides are cut and the pair — computed over a
// normalized CLONE (an old record keys like its repaired form); the RATIO is
// deliberately NOT in the key (a divider drag is applied in place on a
// structural match — a rebuild would re-parent two live views for a 1 % change).
const { seqTaskColor } = require('../task-color-seq.js');

const SPLIT_RATIO_MIN = 0.15;
const SPLIT_RATIO_MAX = 0.85;
const SPLIT_RATIO_DEFAULT = 0.5;
const SPLIT_DIVIDER_PX = 6;
const SPLIT_SIDES = Object.freeze(['left', 'right']);
const LAYOUTS = Object.freeze(['tabs', 'split']);

function clampRatio(r) {
  const n = Number(r);
  if (!Number.isFinite(n)) return SPLIT_RATIO_DEFAULT;
  return Math.min(SPLIT_RATIO_MAX, Math.max(SPLIT_RATIO_MIN, n));
}

/** Is this split record valid against this tab list? (two DISTINCT ids, both present) */
function splitValid(split, tabs) {
  if (!split || !Array.isArray(split.pair) || split.pair.length !== 2) return false;
  const [a, b] = split.pair.map((x) => String(x ?? ''));
  if (!a || !b || a === b) return false;
  return tabs.includes(a) && tabs.includes(b);
}

/** The strip order for `tabs`: `order`'s ids that are members (first
 *  occurrence), then every member it missed, in `tabs` order. */
function orderOf(tabs, order) {
  const members = new Set(tabs);
  const seen = new Set();
  const out = [];
  for (const x of Array.isArray(order) ? order : []) {
    const id = String(x);
    if (members.has(id) && !seen.has(id)) { seen.add(id); out.push(id); }
  }
  for (const id of tabs) if (!seen.has(id)) { seen.add(id); out.push(id); }
  return out;
}

/** The SIDES of a split whose pair is already valid against `tabs`, or null
 *  when the record cannot be a split (a pair member on the wrong side, an
 *  empty side). Written ONCE: a record WITH side lists keeps them (members
 *  only, each id once — left wins — and a member in neither joins the
 *  ANCHOR's side); a record WITHOUT them (written before split tabs v2) is
 *  repaired: the non-anchor pane alone on its side, every other tab — in
 *  strip order — with the anchor. The anchor is `splitAnchor`'s: the host
 *  when it is in the pair, else the left member. */
function sidesFor(tabs, order, split, pair) {
  const anchor = pair.includes(tabs[0]) ? tabs[0] : pair[0];
  const anchorSide = pair.indexOf(anchor); // 0 = left, 1 = right
  let left, right;
  if (Array.isArray(split.left) && Array.isArray(split.right)) {
    const members = new Set(tabs);
    const seen = new Set();
    const keep = (arr) => arr.map(String).filter((id) => members.has(id) && !seen.has(id) && !!seen.add(id));
    left = keep(split.left);
    right = keep(split.right);
    const strays = order.filter((id) => !seen.has(id));
    (anchorSide === 0 ? left : right).push(...strays);
  } else {
    const other = pair[1 - anchorSide];
    const rest = order.filter((id) => id !== other);
    if (anchorSide === 0) { left = rest; right = [other]; } else { left = [other]; right = rest; }
  }
  if (!left.length || !right.length || !left.includes(pair[0]) || !right.includes(pair[1])) return null;
  return { left, right };
}

/** Normalize IN PLACE (the chain object is shared by reference across every
 *  member window — a copy would fork the state) and return it. */
function normalizeChain(chain) {
  if (!chain || !Array.isArray(chain.tabs)) return chain;
  chain.tabs = chain.tabs.map((x) => String(x));
  if (!Number.isInteger(chain.active) || chain.active < 0 || chain.active >= chain.tabs.length) chain.active = chain.tabs.length ? Math.max(0, Math.min(chain.tabs.length - 1, Number(chain.active) || 0)) : 0;
  chain.order = orderOf(chain.tabs, chain.order);
  if (chain.layout === 'split' && splitValid(chain.split, chain.tabs)) {
    const pair = [String(chain.split.pair[0]), String(chain.split.pair[1])];
    const sides = sidesFor(chain.tabs, chain.order, chain.split, pair);
    if (sides) {
      chain.layout = 'split';
      chain.split = { pair, ratio: clampRatio(chain.split.ratio), dir: 'row', left: sides.left, right: sides.right };
      chain.order = [...sides.left, ...sides.right];
      return chain;
    }
  }
  chain.layout = 'tabs';
  delete chain.split;
  return chain;
}

/** A deep copy of a chain's persisted fields (never the local ones — `recent`,
 *  the toast, the pulse), for the PURE readers that must not mutate. */
function cloneChain(chain) {
  if (!chain || !Array.isArray(chain.tabs)) return chain;
  const s = chain.split;
  return {
    tabs: [...chain.tabs], active: chain.active, layout: chain.layout,
    order: Array.isArray(chain.order) ? [...chain.order] : undefined,
    split: s ? { pair: Array.isArray(s.pair) ? [...s.pair] : s.pair, ratio: s.ratio, dir: s.dir, left: Array.isArray(s.left) ? [...s.left] : undefined, right: Array.isArray(s.right) ? [...s.right] : undefined } : undefined,
  };
}

/** The layouts / multi-client key for a chain: membership + the strip order +
 *  layout + (split) where the sides are cut + the pair. Computed over a
 *  normalized clone (an old record keys like its repaired form). The ratio
 *  rides in place. */
function chainSyncKey(chain) {
  if (!chain || !Array.isArray(chain.tabs)) return '';
  const c = normalizeChain(cloneChain(chain));
  const base = c.tabs.join(',') + '|' + c.order.join(',') + '|' + c.layout + '|';
  return c.layout === 'split' ? base + c.split.left.length + ':' + c.split.pair.join('+') : base;
}

/** Do two chains with the SAME structural key differ in the ratio enough to apply? */
function ratioDiffers(a, b, eps = 0.005) {
  const ra = a && a.split ? clampRatio(a.split.ratio) : null, rb = b && b.split ? clampRatio(b.split.ratio) : null;
  if (ra === null || rb === null) return false;
  return Math.abs(ra - rb) > eps;
}

// ── A LOCAL DIVIDER CHANGE NOT YET SENT (split tabs v2 verify r1, finding ①) ──
// The ratio reaches another client two ways — in place on a structural match
// (layout.js, `ratioDiffers`) and inside a same-member record (tab-group.js
// `applyChainRecord`) — and both OVERWROTE this client's ratio with the
// record's. A record that arrived while the user dragged the divider HERE
// (§6b guard 3 holds it until the pointerup) was written by a client that
// never saw that drag, and the apply's user-dirty clear then dropped the
// drag's own save: the divider snapped back and nothing reached anyone. So a
// USER's divider act stamps the chain (`holdRatio`; `_ratioHeld` is local —
// never persisted, never in the key, cloneChain drops it), the next save that
// leaves this client releases it, and while it stands the local ratio WINS
// over a record and the apply re-arms ONE save. Bounded twice: past
// RATIO_HOLD_MS (§6b's own 60 s dirty expiry) the stamp holds nothing, and a
// stamp the ratio has since moved away from (a later remote apply, a
// programmatic set) holds nothing — only the value the user left there.
const RATIO_HOLD_MS = 60000;
function holdRatio(chain, now) {
  if (!chain || chain.layout !== 'split' || !chain.split) return chain;
  chain._ratioHeld = { ratio: clampRatio(chain.split.ratio), at: Number(now) };
  return chain;
}
/** The held ratio when this chain still shows the value a local user act left
 *  there and the save carrying it has not left (≤ RATIO_HOLD_MS), else null. */
function heldRatio(chain, now) {
  const h = chain && chain._ratioHeld;
  if (!h || chain.layout !== 'split' || !chain.split) return null;
  const age = Number(now) - Number(h.at);
  if (!(age >= 0 && age <= RATIO_HOLD_MS)) return null;
  const r = clampRatio(h.ratio);
  return Math.abs(clampRatio(chain.split.ratio) - r) <= 0.005 ? r : null;
}
/** The save carrying it left (or the split it belonged to is gone). */
function releaseRatio(chain) {
  if (chain) delete chain._ratioHeld;
  return chain;
}

/** The pane ids DISPLAYED for this chain: a split shows its pair side by side
 *  on a wide layout; on a NARROW one (≤768px, D19's measurement) only the
 *  focused pane — tabs only. The model is untouched either way: a phone never
 *  writes its own flattening back (§4.6's mobile rule). */
function displayedPanes(chain, { narrow = false } = {}) {
  if (!chain || !Array.isArray(chain.tabs) || !chain.tabs.length) return [];
  const active = chain.tabs[Number.isInteger(chain.active) ? chain.active : 0] ?? chain.tabs[0];
  if (chain.layout === 'split' && !narrow && splitValid(chain.split, chain.tabs)) return [String(chain.split.pair[0]), String(chain.split.pair[1])];
  return [String(active)];
}

/** The ANCHOR of a split = the window the other one was bound TO: the chain
 *  host when it is in the pair (the bind merges the browser INTO the chat's
 *  chain), else the left member. (The repair rule's anchor.) */
function splitAnchor(chain) {
  if (!chain || chain.layout !== 'split' || !splitValid(chain.split, chain.tabs)) return null;
  const host = String(chain.tabs[0]);
  return chain.split.pair.includes(host) ? host : String(chain.split.pair[0]);
}

/** The pair in VISUAL order for a bind: `side` is where the GUEST lands —
 *  it comes from the CALLER's verb (R2), never from a pointer position. */
function pairFor({ anchorId, guestId, side = 'right' } = {}) {
  return side === 'left' ? [String(guestId), String(anchorId)] : [String(anchorId), String(guestId)];
}

/** The largest floor a PANE may claim (layout px): the `.window` CSS floor (320, window-min-size.js WINDOW_FLOOR)
 *  minus the divider — a split host at its own minimum still holds a pane at its floor. */
const SPLIT_PANE_MIN_MAX = 320 - SPLIT_DIVIDER_PX;

/** A pane's own floor as the grid spells it: a positive finite px, rounded UP, capped at SPLIT_PANE_MIN_MAX; else 0 (none). */
function paneMinPx(px) {
  const n = Number(px);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(SPLIT_PANE_MIN_MAX, Math.ceil(n));
}

/** The ONE spelling of the host's grid columns for a ratio (left pane, divider, right pane).
 *  The RIGHT column keeps a FLOOR (v2 verify r1 ②): it also carries the window controls (the title bar is a
 *  subgrid of this grid), so it never renders narrower than the controls + a tab's room — `--split-ctl` (the
 *  controls' width, published on the host by tab-group.js) + SPLIT_TAIL_FLOOR_PX, at most 45 % of the host.
 *  `mins` = the panes' OWN floors [left, right] in layout px (lane I verify r1, 2026-09-25 — a bound live view
 *  dragged to the clamp was narrower than its own bar): a pane with a floor is a `minmax(<floor>px, …fr)` track
 *  (the right one `max(<floor>px, <the controls' floor>)` — both floors hold), so the grid never renders it
 *  narrower — the divider stops there (the cursor may overshoot, as a window's resize drag does) and the partner
 *  takes the rest; no floor = the spelling without it, byte for byte. The RATIO is untouched (it stays the user's
 *  intent — a narrow client renders it as near as its width allows, a wider one exactly). */
const SPLIT_TAIL_FLOOR_PX = 56; // the title bar's right padding 8 + the half's padding 4 + a tab's 40 + 4
function splitColumns(ratio, mins = null) {
  const r = clampRatio(ratio);
  const l = Math.round(r * 10000) / 10000, rr = Math.round((1 - r) * 10000) / 10000;
  const a = paneMinPx(mins && mins[0]), b = paneMinPx(mins && mins[1]);
  const tail = `min(calc(var(--split-ctl, 89px) + ${SPLIT_TAIL_FLOOR_PX}px), 45%)`;
  return `minmax(${a ? a + 'px' : 0}, ${l}fr) ${SPLIT_DIVIDER_PX}px minmax(${b ? `max(${b}px, ${tail})` : tail}, ${rr}fr)`;
}

// ── split UX (docs/design-split-ux.zh.md §4, 2026-09-23) ──
// No POINTER POSITION ever picks a side of a NEW split (the title-bar half drop
// zone and its `dropSide` are gone — the owner dragged left and landed right):
// a split is entered by an explicit verb that names the side. Split tabs v2
// (§8, 2026-09-25, inc-muhfb5al-jzk6): the strip is TWO halves, one per side,
// and a tab dragged across the boundary MOVES between the sides it already has.

/** The strip in VISUAL order (a new array — a rendering, `tabs` / `active`
 *  never change): a split draws `left ++ right`, a tabs chain its `order`
 *  (both missing ⇒ `tabs` order). */
function visualTabOrder(chain) {
  if (!chain || !Array.isArray(chain.tabs)) return [];
  return normalizeChain(cloneChain(chain)).order;
}

/** The two sides of a split as `{ left, right }` (new arrays), else null. */
function sidesOf(chain) {
  if (!chain || !Array.isArray(chain.tabs)) return null;
  const c = normalizeChain(cloneChain(chain));
  return c.layout === 'split' ? { left: c.split.left, right: c.split.right } : null;
}

/** Which side `id` belongs to in a split ('left' | 'right'), else null. */
function sideOf(chain, id) {
  const s = sidesOf(chain);
  if (!s) return null;
  const k = String(id);
  return s.left.includes(k) ? 'left' : s.right.includes(k) ? 'right' : null;
}

/** "Swap left and right": the valid pair reversed, else null. */
function swappedPair(chain) {
  if (!chain || chain.layout !== 'split' || !Array.isArray(chain.tabs) || !splitValid(chain.split, chain.tabs.map(String))) return null;
  return [String(chain.split.pair[1]), String(chain.split.pair[0])];
}

/** The DEFAULT partner when the active tab is put side by side (the button):
 *  the most recently active OTHER tab still in the chain (`recent` = ids,
 *  most recent first — local state, never persisted, never in the sync key),
 *  else the next neighbour IN THE STRIP, else the previous one; a one-tab
 *  chain has none. */
function splitPartner(chain, recent = chain && chain.recent) {
  if (!chain || !Array.isArray(chain.tabs) || chain.tabs.length < 2) return null;
  const tabs = chain.tabs.map(String);
  const ai = Number.isInteger(chain.active) && chain.active >= 0 && chain.active < tabs.length ? chain.active : 0;
  const active = tabs[ai];
  for (const r of Array.isArray(recent) ? recent : []) {
    const id = String(r);
    if (id !== active && tabs.includes(id)) return id;
  }
  const order = orderOf(tabs, chain.order);
  const oi = order.indexOf(active);
  return order[oi + 1] ?? order[oi - 1] ?? null;
}

// ── THE VERBS (split tabs v2, docs/design-split-ux.zh.md §8) ──
// Each mutates IN PLACE and ends in normalizeChain; each picks its substitute
// pane itself (the validator never guesses). tab-group.js calls them and then
// re-derives the DOM (_applyChainLayout + _renderTabBar) and notifies — the
// ONE chain-mutation path.

const clampIndex = (i, n) => (i === null || i === undefined || !Number.isFinite(Number(i)) ? n : Math.max(0, Math.min(n, Math.trunc(Number(i)))));
const sideIdx = (side) => (side === 'left' ? 0 : 1);

/** SHOW `id`: in a split it is shown on ITS OWN side (the side's previous
 *  pane stays in that side's list — both sides are switchable; the retired
 *  D19 (a) only ever replaced the non-anchor pane); in tabs it becomes the
 *  active tab. Either way `active` points at it. */
function showTab(chain, id) {
  normalizeChain(chain);
  const k = String(id);
  const i = chain.tabs.indexOf(k);
  if (i < 0) return chain;
  if (chain.layout === 'split') chain.split.pair[chain.split.left.includes(k) ? 0 : 1] = k;
  chain.active = i;
  return normalizeChain(chain);
}

/** ENTER (or widen) a split. From tabs: the guest goes ALONE to `side`, every
 *  other tab stays with the anchor on the other side (strip order kept), the
 *  pair = [anchor, guest] ordered by `side`. On a chain that is ALREADY split
 *  the anchor keeps its side and the guest goes to the OTHER side (its end,
 *  unless it is already there) — both shown: "beside the source" is the side
 *  the source is not on, never a literal "right" that could cover it. */
function enterSplit(chain, { anchorId, guestId, side = 'right' } = {}) {
  normalizeChain(chain);
  const a = String(anchorId), g = String(guestId);
  if (a === g || !chain.tabs.includes(a) || !chain.tabs.includes(g)) return chain;
  if (chain.layout === 'split') {
    const aSide = chain.split.left.includes(a) ? 'left' : 'right';
    const gSide = aSide === 'left' ? 'right' : 'left';
    const lists = { left: [...chain.split.left], right: [...chain.split.right] };
    if (!lists[gSide].includes(g)) { lists[aSide] = lists[aSide].filter((x) => x !== g); lists[gSide].push(g); }
    const pair = [...chain.split.pair];
    pair[sideIdx(aSide)] = a;
    pair[sideIdx(gSide)] = g;
    chain.split = { ...chain.split, left: lists.left, right: lists.right, pair };
    return normalizeChain(chain);
  }
  const pair = pairFor({ anchorId: a, guestId: g, side });
  const rest = chain.order.filter((x) => x !== g);
  const ratio = chain.split && Number.isFinite(Number(chain.split.ratio)) ? chain.split.ratio : SPLIT_RATIO_DEFAULT;
  chain.layout = 'split';
  chain.split = { pair, ratio, dir: 'row', left: side === 'left' ? [g] : rest, right: side === 'left' ? rest : [g] };
  return normalizeChain(chain);
}

/** ADD a new member (not yet in `tabs`). `afterId` = right after that tab (on
 *  its side, in a split); else `side` + `index` (a position in that side's
 *  list / in the strip, null = the end). A split defaults to the RIGHT side.
 *  The caller shows it (showTab / switchTab). */
function insertTab(chain, id, { side = null, index = null, afterId = null } = {}) {
  normalizeChain(chain);
  const k = String(id);
  if (chain.tabs.includes(k)) return chain;
  const after = afterId === null || afterId === undefined ? null : String(afterId);
  if (chain.layout === 'split') {
    let s = side === 'left' || side === 'right' ? side : null;
    let at = index;
    if (after && chain.tabs.includes(after)) { s = chain.split.left.includes(after) ? 'left' : 'right'; at = chain.split[s].indexOf(after) + 1; }
    s = s || 'right';
    const list = [...chain.split[s]];
    list.splice(clampIndex(at, list.length), 0, k);
    chain.split = { ...chain.split, [s]: list };
  } else {
    const o = [...chain.order];
    let at = index;
    if (after && o.includes(after)) at = o.indexOf(after) + 1;
    o.splice(clampIndex(at, o.length), 0, k);
    chain.order = o;
  }
  chain.tabs.push(k);
  return normalizeChain(chain);
}

/** MOVE a member within the strip — a reorder, never a split: `index` is its
 *  position in the target list AFTER it left its old place. Tabs: the strip
 *  order. Split: `side` (default: its own) — a tab moved ACROSS the boundary
 *  changes side; a DISPLAYED tab carries its display with it (it is shown on
 *  the new side and the side it left shows its neighbour — the one now at its
 *  old index, else the one before); the side it left EMPTY ⇒ the split ends
 *  (layout tabs, the strip = everything in that one list). A hidden tab moved
 *  across stays hidden — the pair changes only when the moved tab was shown. */
function moveTab(chain, id, { side = null, index = null } = {}) {
  normalizeChain(chain);
  const k = String(id);
  if (!chain.tabs.includes(k)) return chain;
  if (chain.layout !== 'split') {
    const o = chain.order.filter((x) => x !== k);
    o.splice(clampIndex(index, o.length), 0, k);
    chain.order = o;
    return normalizeChain(chain);
  }
  const from = chain.split.left.includes(k) ? 'left' : 'right';
  const to = side === 'left' || side === 'right' ? side : from;
  const lists = { left: [...chain.split.left], right: [...chain.split.right] };
  const fi = lists[from].indexOf(k);
  lists[from].splice(fi, 1);
  lists[to].splice(clampIndex(index, lists[to].length), 0, k);
  const pair = [...chain.split.pair];
  if (to !== from && pair[sideIdx(from)] === k) {
    if (!lists[from].length) {
      chain.layout = 'tabs';
      chain.order = [...lists.left, ...lists.right];
      delete chain.split;
      chain.active = chain.tabs.indexOf(k);
      return normalizeChain(chain);
    }
    pair[sideIdx(from)] = lists[from][Math.min(fi, lists[from].length - 1)];
    pair[sideIdx(to)] = k;
  }
  chain.split = { ...chain.split, left: lists.left, right: lists.right, pair };
  return normalizeChain(chain);
}

/** REMOVE a member (it leaves the chain: closed or dragged out). A shown pane
 *  is replaced on ITS side by the tab now at its index, else the one before;
 *  a side left EMPTY ends the split (the strip keeps the other side's order).
 *  `active` keeps pointing at the same window (the index is re-found by id);
 *  when the removed tab was the active one it passes to its side's substitute
 *  (a split) or its strip neighbour (tabs: the next, else the previous). */
function removeTab(chain, id) {
  normalizeChain(chain);
  const k = String(id);
  const i = chain.tabs.indexOf(k);
  if (i < 0) return chain;
  const activeId = chain.tabs[chain.active];
  let nextActive = activeId === k ? null : activeId;
  if (chain.layout === 'split') {
    const s = chain.split.left.includes(k) ? 'left' : 'right';
    const si = sideIdx(s);
    const pos = chain.split[s].indexOf(k);
    const list = chain.split[s].filter((x) => x !== k);
    if (!list.length) {
      if (nextActive === null) nextActive = chain.split.pair[1 - si];
      chain.order = [...chain.split[s === 'left' ? 'right' : 'left']];
      chain.layout = 'tabs';
      delete chain.split;
    } else {
      const pair = [...chain.split.pair];
      if (pair[si] === k) pair[si] = list[Math.min(pos, list.length - 1)];
      if (nextActive === null) nextActive = pair[si];
      chain.split = { ...chain.split, [s]: list, pair };
    }
  } else if (nextActive === null) {
    const pos = chain.order.indexOf(k);
    const o = chain.order.filter((x) => x !== k);
    nextActive = o[Math.min(pos, o.length - 1)] ?? null;
  }
  chain.tabs.splice(i, 1);
  chain.order = (chain.order || []).filter((x) => x !== k);
  const ai = nextActive === null ? -1 : chain.tabs.indexOf(nextActive);
  chain.active = ai >= 0 ? ai : 0;
  return normalizeChain(chain);
}

/** "Swap left and right": the SIDE LISTS change places with the pair (the
 *  sync key carries the cut and the pair order — the other clients rebuild). */
function swapSides(chain) {
  normalizeChain(chain);
  if (chain.layout !== 'split') return chain;
  const { left, right, pair } = chain.split;
  chain.split = { ...chain.split, left: right, right: left, pair: [pair[1], pair[0]] };
  return normalizeChain(chain);
}

// ── the ownership badge (§4.6) ──
// The colour is derived PER SESSION and deliberately NOT the task-group colour
// (a session in no group has none to draw; two sessions in one group share
// one — the exact shape the badge disambiguates). The webui id is
// `sess-<seq>-<ms>` (src/ws-create.js) and `seqTaskColor(<seq>)` gives this
// session its own slot; every other id shape hashes to a slot so a badge
// ALWAYS exists. A resume mints a new key ⇒ the colour changes there — the
// badge answers "which window on my screen is which", not a durable identity.
function ownerSeq(sessionId) {
  const s = String(sessionId || '');
  const m = /^sess-(\d+)-/.exec(s);
  if (m) return Number(m[1]);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return 1000 + (h % 144);
}
function ownerColor(sessionId) {
  return seqTaskColor(ownerSeq(sessionId)).color;
}
function ownerBadge({ sessionId, name } = {}) {
  const id = String(sessionId || '');
  return { sessionId: id, color: ownerColor(id), name: String(name || id) };
}
/** Every owner of a profile as badge dots: the viewing session first, then
 *  each DISTINCT other session holding a lease on the profile (from the
 *  digest's `leases` — "who is attached" is a recorded fact; this only draws it). */
function ownerDots({ leases = [], profileId = null, sessionId = null, nameOf = null } = {}) {
  const name = (id) => { try { const n = typeof nameOf === 'function' ? nameOf(id) : null; return n || id; } catch { return id; } };
  const out = [];
  const seen = new Set();
  if (sessionId) { out.push(ownerBadge({ sessionId, name: name(sessionId) })); seen.add(String(sessionId)); }
  if (profileId) {
    for (const l of Array.isArray(leases) ? leases : []) {
      if (!l || l.profileId !== profileId || !l.sessionId) continue;
      const id = String(l.sessionId);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(ownerBadge({ sessionId: id, name: name(id) }));
    }
  }
  return out;
}

module.exports = {
  SPLIT_RATIO_MIN, SPLIT_RATIO_MAX, SPLIT_RATIO_DEFAULT, SPLIT_DIVIDER_PX, SPLIT_TAIL_FLOOR_PX, SPLIT_SIDES, LAYOUTS, SPLIT_PANE_MIN_MAX,
  RATIO_HOLD_MS, holdRatio, heldRatio, releaseRatio,
  clampRatio, splitValid, normalizeChain, cloneChain, chainSyncKey, ratioDiffers, displayedPanes, splitAnchor, pairFor, splitColumns, paneMinPx, visualTabOrder, sidesOf, sideOf, swappedPair, splitPartner,
  showTab, enterSplit, insertTab, moveTab, removeTab, swapSides,
  ownerSeq, ownerColor, ownerBadge, ownerDots,
};
