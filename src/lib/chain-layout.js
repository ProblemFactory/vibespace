'use strict';
// THE TAB CHAIN'S LAYOUT — PURE (imports only the shared colour sequence; CJS
// so the fast suite requires it and esbuild bundles it into the client).
// Agent browser P7 (docs/design-agent-browser-v2.md §4.6 / §3.7, D19 / D24).
//
// A chain is `{ tabs: [hostId, ...guestIds], active }` (src/lib/tab-group.js)
// and it GAINS two fields here, while `tabs` and `active` keep their meanings
// to the byte — every existing path reads them:
//   layout: 'tabs' | 'split'            a MISSING field reads as 'tabs' (old records need no migration)
//   split:  { pair: [leftId, rightId], ratio, dir: 'row' }   meaningful only while layout === 'split'
// A split is another RENDERING of the same chain, not a second kind of chain:
// the pair is shown side by side inside the host's element, the rest stay tabs.
//
// `split` is a REFERENCE into `tabs`, so it owes an invariant — enforced in
// ONE place (`normalizeChain`, called by every chain mutation in tab-group.js):
// a pair member not in `tabs` ⇒ layout collapses to 'tabs' and split is DROPPED
// (never a dangling id, never a guessed substitute — the guessed pane is the very
// thing "whose browser is that" has to answer).
//
// The multi-client sync key (§4.6's named trap): layout.js used to key
// remote-vs-local chains by `tabs.join(',')`, which does not carry the layout —
// a remote client flipping the same tabs to a split read locally as "unchanged".
// `chainSyncKey` carries the layout and the pair; the RATIO is deliberately NOT
// in the key (a divider drag is applied in place on a structural match — a
// rebuild would re-parent two live views for a 1 % change).
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

/** Normalize IN PLACE (the chain object is shared by reference across every
 *  member window — a copy would fork the state) and return it. */
function normalizeChain(chain) {
  if (!chain || !Array.isArray(chain.tabs)) return chain;
  chain.tabs = chain.tabs.map((x) => String(x));
  if (!Number.isInteger(chain.active) || chain.active < 0 || chain.active >= chain.tabs.length) chain.active = chain.tabs.length ? Math.max(0, Math.min(chain.tabs.length - 1, Number(chain.active) || 0)) : 0;
  if (chain.layout === 'split' && splitValid(chain.split, chain.tabs)) {
    chain.layout = 'split';
    chain.split = { pair: [String(chain.split.pair[0]), String(chain.split.pair[1])], ratio: clampRatio(chain.split.ratio), dir: 'row' };
  } else {
    chain.layout = 'tabs';
    delete chain.split;
  }
  return chain;
}

/** The layouts / multi-client key for a chain: tabs + layout + pair (the ratio rides in place). */
function chainSyncKey(chain) {
  if (!chain || !Array.isArray(chain.tabs)) return '';
  const layout = chain.layout === 'split' && splitValid(chain.split, chain.tabs.map(String)) ? 'split' : 'tabs';
  return chain.tabs.join(',') + '|' + layout + '|' + (layout === 'split' ? chain.split.pair.join('+') : '');
}

/** Do two chains with the SAME structural key differ in the ratio enough to apply? */
function ratioDiffers(a, b, eps = 0.005) {
  const ra = a && a.split ? clampRatio(a.split.ratio) : null, rb = b && b.split ? clampRatio(b.split.ratio) : null;
  if (ra === null || rb === null) return false;
  return Math.abs(ra - rb) > eps;
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
 *  chain), else the left member. */
function splitAnchor(chain) {
  if (!chain || chain.layout !== 'split' || !splitValid(chain.split, chain.tabs)) return null;
  const host = String(chain.tabs[0]);
  return chain.split.pair.includes(host) ? host : String(chain.split.pair[0]);
}

/** D19 (a): clicking a THIRD tab of a split chain replaces the NON-ANCHOR pane
 *  — the binding survives (the chat pane stays put) and the pane changes is
 *  the one that was not the anchor. Returns the id to replace. */
function splitReplaceable(chain) {
  const anchor = splitAnchor(chain);
  if (!anchor) return null;
  return chain.split.pair[0] === anchor ? String(chain.split.pair[1]) : String(chain.split.pair[0]);
}

/** The pair in VISUAL order for a bind: `side` is where the GUEST lands —
 *  it comes from the CALLER's verb (R2), never from a pointer position. */
function pairFor({ anchorId, guestId, side = 'right' } = {}) {
  return side === 'left' ? [String(guestId), String(anchorId)] : [String(anchorId), String(guestId)];
}

/** The ONE spelling of the host's grid columns for a ratio (left pane, divider, right pane). */
function splitColumns(ratio) {
  const r = clampRatio(ratio);
  const l = Math.round(r * 10000) / 10000, rr = Math.round((1 - r) * 10000) / 10000;
  return `minmax(0, ${l}fr) ${SPLIT_DIVIDER_PX}px minmax(0, ${rr}fr)`;
}

// ── split UX (docs/design-split-ux.zh.md §4, 2026-09-23) ──
// No POINTER POSITION ever picks a side any more (the title-bar half drop zone
// and its `dropSide` are gone — the owner dragged left and landed right): a
// split is entered by an explicit verb that names the side, and the strip is
// drawn in the order the panes are SHOWN.

/** The tab strip in VISUAL order: a split draws [left pane, right pane,
 *  …the rest in chain order] so the left pane's tab is on the left (R3); a
 *  tabs chain (or an invalid split) keeps the chain order. A rendering only —
 *  `tabs` / `active` never change. */
function visualTabOrder(chain) {
  if (!chain || !Array.isArray(chain.tabs)) return [];
  const tabs = chain.tabs.map(String);
  if (chain.layout !== 'split' || !splitValid(chain.split, tabs)) return tabs;
  const pair = [String(chain.split.pair[0]), String(chain.split.pair[1])];
  return [...pair, ...tabs.filter((id) => !pair.includes(id))];
}

/** "Swap left and right": the valid pair reversed, else null. */
function swappedPair(chain) {
  if (!chain || chain.layout !== 'split' || !Array.isArray(chain.tabs) || !splitValid(chain.split, chain.tabs.map(String))) return null;
  return [String(chain.split.pair[1]), String(chain.split.pair[0])];
}

/** The DEFAULT partner when the active tab is put side by side (the button):
 *  the most recently active OTHER tab still in the chain (`recent` = ids,
 *  most recent first — local state, never persisted, never in the sync key),
 *  else the next neighbour, else the previous one; a one-tab chain has none. */
function splitPartner(chain, recent = chain && chain.recent) {
  if (!chain || !Array.isArray(chain.tabs) || chain.tabs.length < 2) return null;
  const tabs = chain.tabs.map(String);
  const ai = Number.isInteger(chain.active) && chain.active >= 0 && chain.active < tabs.length ? chain.active : 0;
  const active = tabs[ai];
  for (const r of Array.isArray(recent) ? recent : []) {
    const id = String(r);
    if (id !== active && tabs.includes(id)) return id;
  }
  return tabs[ai + 1] ?? tabs[ai - 1] ?? null;
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
  SPLIT_RATIO_MIN, SPLIT_RATIO_MAX, SPLIT_RATIO_DEFAULT, SPLIT_DIVIDER_PX, SPLIT_SIDES, LAYOUTS,
  clampRatio, splitValid, normalizeChain, chainSyncKey, ratioDiffers, displayedPanes, splitAnchor, splitReplaceable, pairFor, splitColumns, visualTabOrder, swappedPair, splitPartner,
  ownerSeq, ownerColor, ownerBadge, ownerDots,
};
