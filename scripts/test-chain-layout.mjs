#!/usr/bin/env node
// SPLIT TABS v2 — THE PURE MODEL GATE (fast; docs/design-split-ux.zh.md §8,
// inc-muhfb5al-jzk6, 2026-09-25). The owner: "首先并排之后tab列表都在左侧，比较难看出来
// 哪边是哪个tab。其次我没法拖动tab重排序，最后我只能调整右侧展示的tab而无法调整左侧的。"
// src/lib/chain-layout.js gains the model those three answers stand on, and this
// suite pins every rule of it — no DOM, no ports:
//   ① the SIDE LISTS: in a split every tab belongs to a side (`split.left` /
//      `split.right`, ordered), their union is `tabs`, each id once, pair[0] ∈
//      left, pair[1] ∈ right, the strip order = left ++ right — held after EVERY
//      verb of a seeded random walk (the fuzz leg);
//   ② the CREATION rule (enterSplit): the guest alone on its side, every other
//      tab with the anchor in strip order; on an already-split chain the anchor
//      keeps its side and the guest goes to the OTHER side, both shown;
//   ③ an emptied side ENDS the split (moveTab / removeTab), the strip keeps
//      "left then right";
//   ④ the OLD-RECORD repair (no side lists): the non-anchor pane alone, the rest
//      with the anchor — written once, both orientations, host in / not in the pair;
//   ⑤ moveTab: a reorder within a side / the tabs strip; a DISPLAYED tab moved
//      across carries its display (the side it left shows its neighbour), a
//      hidden one stays hidden; never a new split;
//   ⑥ showTab: BOTH sides are switchable (the retired D19 (a) only ever replaced
//      the non-anchor pane — the owner's third complaint);
//   ⑦ removeTab keeps `active` on the same WINDOW (the bare splice shifted it);
//   ⑧ swapSides swaps the side lists with the pair;
//   ⑨ chainSyncKey carries membership + the strip ORDER + the cut + the pair,
//      never the ratio, and an old record keys like its repaired form;
//   ⑩ NEGATIVE CONTROLS — patched COPIES (scripts/mutant-copy.mjs): the model
//      with the pair∈side check removed, with the "a displayed tab carries its
//      display" line removed, with removeTab reverted to a bare splice, and with
//      the order dropped from the sync key; each copy must turn its own leg red;
//   ⑫ MULTIVIEW (docs/design-browser-multiview.zh.md §3 (b) + D3/D5): `partnerFor` (the other
//      side's tab of the same session, chat ↔ live view), `followFor` (other side / same side /
//      no partner / session ended / a user-placed chat ⇒ no follow), `livePlacement` (split only
//      while the chat is not yet split, else a quiet tab — never a third pane), `foldBackTarget`;
//      two more patched-copy controls (the follow blind to the other side, the partner on either side).
//   ⑬ NAMING vs PRESSING (inc-muiq348r-jwb5, the owner on a phone: "我在手机上怎么切换不到 vibespace
//      大开发这个 session？"): `revealTab` — the user NAMED a window ⇒ its own tab, the HOST included
//      (the pre-fix door switched a GUEST only); `pressTab` — a press on the frame ⇒ the tab ON SHOW,
//      never a hidden one (the pre-fix press named the hidden host). Two patched-copy controls: the
//      reveal that skips the host, the press that names the host.
//   ⑭ REMOVE-THEN-RESTORE (inc-mukeyzpt-lpou, the closed side-by-side viewer that came back): `withoutMembers`
//      — a chain RECORD read without the windows this client closed arrives at the chain the local close left
//      (removeTab, the same key: the owner's [A | B, E] minus E is [A | B] still split, the host promoted, one
//      tab ⇒ no chain, non-members change nothing, the record never mutated). Control: the record rebuilt by
//      filtering the members (the pre-fix reconcile) flattens the split.
//   ⑮ THE TAB DRAG'S CLASSIFICATION (inc-muly2izg-cks3, userW on the Stage: "Browser 拖不出来"): `tabDragMode` —
//      the first 8 px pick reorder / detach, and a REORDER whose pointer leaves the strip's band by > 30 px TEARS
//      OFF (the reporter's own pull from the ring, Δ −451/+351, was a reorder for the whole drag on b970f16d);
//      a wobble within the margin stays a reorder. Controls: the pre-fix "never tears", a tear that only looks
//      down. + a wiring pin: tab-group.js asks it every move with the host's title bar as the band.
//   ⑪ (v2 verify r1, finding ①) THE HELD RATIO: a user's divider act holds its
//      ratio (holdRatio) until a save carries it (releaseRatio); heldRatio
//      answers only while the chain still shows that value and for at most
//      RATIO_HOLD_MS (§6b's 60 s dirty expiry); the stamp is local — never in
//      the key, never in a clone. Controls: the hold without the expiry, and
//      the hold that ignores a ratio since moved away.
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const MODEL = 'src/lib/chain-layout.js';
const SRC = fs.readFileSync(path.join(REPO, MODEL), 'utf8');

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + String(extra).slice(0, 600) : '')); } return !!c; };
const J = (x) => JSON.stringify(x);

/** Every invariant a normalized chain owes (null = holds, else the broken one). */
function invariantBroken(c) {
  if (!Array.isArray(c.tabs) || !Array.isArray(c.order)) return 'tabs/order not arrays';
  if (new Set(c.tabs).size !== c.tabs.length) return 'a tab twice';
  if (c.order.length !== c.tabs.length || !c.order.every((id) => c.tabs.includes(id))) return 'order is not a permutation of tabs';
  if (!(Number.isInteger(c.active) && c.active >= 0 && (c.tabs.length === 0 || c.active < c.tabs.length))) return 'active out of range';
  if (c.layout === 'split') {
    const s = c.split;
    if (!s || !Array.isArray(s.left) || !Array.isArray(s.right)) return 'split without side lists';
    if (!s.left.length || !s.right.length) return 'an empty side';
    const all = [...s.left, ...s.right];
    if (new Set(all).size !== all.length) return 'an id on both sides / twice';
    if (all.length !== c.tabs.length || !all.every((id) => c.tabs.includes(id))) return 'the union of the sides is not tabs';
    if (!s.left.includes(s.pair[0]) || !s.right.includes(s.pair[1])) return 'a pair member on the wrong side';
    if (J(c.order) !== J(all)) return 'the strip order is not left ++ right';
  } else if (c.layout !== 'tabs' || 'split' in c) return 'a tabs chain carries a split';
  return null;
}

/** THE LEGS, run on a model module `C`; returns the failed leg names. */
function legs(C, { quiet = false } = {}) {
  const failed = [];
  const leg = (c, n, extra) => { if (!quiet) ok(c, n, extra); if (!c) failed.push(n); return !!c; };
  const F = (n) => (typeof C[n] === 'function' ? C[n] : () => { throw new Error('missing export ' + n); });
  const run = (fn) => { try { return fn(); } catch (e) { return e; } };

  // ① the fuzz: a seeded random walk of every verb
  {
    let seed = 20260925;
    const rnd = (n) => { seed = (seed + 0x6D2B79F5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) % n; }; // mulberry32
    let broken = null, steps = 0, splits = 0, sawAcross = 0;
    for (let walk = 0; walk < 60 && !broken; walk++) {
      const n = 2 + rnd(5);
      const ids = Array.from({ length: n }, (_, i) => 'w' + walk + '-' + i);
      const c = F('normalizeChain')({ tabs: [...ids], active: rnd(n) });
      let fresh = 0;
      for (let step = 0; step < 40 && !broken; step++) {
        const pick = () => c.tabs[rnd(Math.max(1, c.tabs.length))];
        const op = rnd(8);
        const r = run(() => {
          if (op === 0 && c.tabs.length >= 2) { const a = pick(); let g = pick(); if (g === a) g = c.tabs.find((x) => x !== a); F('enterSplit')(c, { anchorId: a, guestId: g, side: rnd(2) ? 'left' : 'right' }); }
          else if (op === 1) F('showTab')(c, pick());
          else if (op === 2) { const before = C.sideOf(c, pick()); F('moveTab')(c, pick(), { side: rnd(2) ? 'left' : 'right', index: rnd(6) }); if (before) sawAcross++; }
          else if (op === 3 && c.tabs.length > 2) F('removeTab')(c, pick());
          else if (op === 4) F('insertTab')(c, 'n' + walk + '-' + (fresh++), rnd(2) ? { afterId: pick() } : { side: rnd(2) ? 'left' : 'right', index: rnd(5) });
          else if (op === 5) F('swapSides')(c);
          else if (op === 6 && c.layout === 'split') { c.layout = 'tabs'; delete c.split; F('normalizeChain')(c); }
          else F('normalizeChain')(c);
        });
        if (r instanceof Error) { broken = 'threw: ' + r.message; break; }
        steps++; if (c.layout === 'split') splits++;
        const b = invariantBroken(c);
        if (b) broken = `${b} after op ${op} — ${J(c)}`;
      }
    }
    leg(!broken && steps > 1500 && splits > 300 && sawAcross > 50, `① every invariant holds after each of ${steps} random verb steps (${splits} of them split): sides' union = tabs, each id once, pair[0] ∈ left, pair[1] ∈ right, order = left ++ right, no empty side`, broken);
    leg(invariantBroken(F('normalizeChain')({ tabs: ['a', 'b', 'c'], active: 0, layout: 'split', split: { pair: ['a', 'c'], ratio: 0.5, left: ['a', 'c'], right: ['b'] } })) === null
      && F('normalizeChain')({ tabs: ['a', 'b', 'c'], active: 0, layout: 'split', split: { pair: ['a', 'c'], ratio: 0.5, left: ['a', 'c'], right: ['b'] } }).layout === 'tabs',
    '① a record whose pair member sits on the WRONG side collapses to tabs (the validator never guesses a pane)');
    const dup = F('normalizeChain')({ tabs: ['a', 'b', 'c'], active: 0, layout: 'split', split: { pair: ['a', 'b'], ratio: 0.5, left: ['a', 'c', 'a'], right: ['b', 'c', 'zz'] } });
    leg(invariantBroken(dup) === null && J(dup.split.left) === J(['a', 'c']) && J(dup.split.right) === J(['b']), '① each id once (left wins), a non-member dropped', J(dup));
    const stray = F('normalizeChain')({ tabs: ['a', 'b', 'c', 'd'], active: 0, layout: 'split', split: { pair: ['a', 'b'], ratio: 0.5, left: ['a'], right: ['b'] }, order: ['a', 'd', 'b', 'c'] });
    leg(J(stray.split.left) === J(['a', 'd', 'c']) && J(stray.order) === J(['a', 'd', 'c', 'b']), '① a member in NEITHER list joins the ANCHOR\'s side (the host a), in strip order', J(stray));
  }

  // ② the creation rule
  {
    const c = F('normalizeChain')({ tabs: ['A', 'B', 'C', 'D'], active: 2, order: ['D', 'A', 'B', 'C'] });
    F('enterSplit')(c, { anchorId: 'A', guestId: 'C', side: 'right' });
    leg(c.layout === 'split' && J(c.split.left) === J(['D', 'A', 'B']) && J(c.split.right) === J(['C']) && J(c.split.pair) === J(['A', 'C']), '② from tabs: the guest ALONE on its side (right), every other tab with the anchor in strip order, pair [anchor, guest]', J(c));
    const l = F('normalizeChain')({ tabs: ['A', 'B', 'C'], active: 0 });
    F('enterSplit')(l, { anchorId: 'A', guestId: 'B', side: 'left' });
    leg(J(l.split.left) === J(['B']) && J(l.split.right) === J(['A', 'C']) && J(l.split.pair) === J(['B', 'A']), '② side left: the guest alone on the LEFT, the anchor\'s side is the right', J(l));
    const w = F('normalizeChain')({ tabs: ['A', 'B', 'C'], active: 0, layout: 'split', split: { pair: ['B', 'A'], ratio: 0.3, left: ['B'], right: ['A', 'C'] } });
    F('insertTab')(w, 'N', { afterId: 'A' });
    F('enterSplit')(w, { anchorId: 'A', guestId: 'N', side: 'right' });
    leg(J(w.split.left) === J(['B', 'N']) && J(w.split.right) === J(['A', 'C']) && J(w.split.pair) === J(['N', 'A']) && w.split.ratio === 0.3, '② an ALREADY-split chain: the anchor keeps its side (right), the guest goes to the OTHER side\'s end and both are shown ("beside the source", never a literal right that would cover it); the ratio stays', J(w));
    const same = F('normalizeChain')({ tabs: ['A', 'B', 'C'], active: 0, layout: 'split', split: { pair: ['A', 'C'], ratio: 0.5, left: ['A', 'B'], right: ['C'] } });
    F('enterSplit')(same, { anchorId: 'C', guestId: 'B' });
    leg(J(same.split.left) === J(['A', 'B']) && J(same.split.pair) === J(['B', 'C']), '② a guest already on the other side keeps its place and is shown', J(same));
  }

  // ③ an emptied side ends the split
  {
    const c = F('normalizeChain')({ tabs: ['A', 'B', 'C'], active: 1, layout: 'split', split: { pair: ['A', 'B'], ratio: 0.5, left: ['A'], right: ['B', 'C'] } });
    F('moveTab')(c, 'A', { side: 'right', index: 1 });
    leg(c.layout === 'tabs' && !('split' in c) && J(c.order) === J(['B', 'A', 'C']) && c.tabs[c.active] === 'A', '③ dragging the LAST tab out of a side ends the split: tabs, the strip = that one list (B, A, C), the dragged tab active', J(c));
    const r = F('normalizeChain')({ tabs: ['H', 'L', 'T'], active: 0, layout: 'split', split: { pair: ['H', 'T'], ratio: 0.5, left: ['H'], right: ['L', 'T'] } });
    F('removeTab')(r, 'H');
    leg(r.layout === 'tabs' && J(r.tabs) === J(['L', 'T']) && J(r.order) === J(['L', 'T']) && r.tabs[r.active] === 'T', '③ closing the only tab of a side (the host) ends the split; the strip keeps the other side\'s order; the other pane stays active', J(r));
    const k = F('normalizeChain')({ tabs: ['A', 'B', 'C', 'D'], active: 0, layout: 'split', split: { pair: ['A', 'C'], ratio: 0.5, left: ['A', 'B'], right: ['C', 'D'] } });
    k.layout = 'tabs'; delete k.split; F('normalizeChain')(k);
    leg(J(k.order) === J(['A', 'B', 'C', 'D']), '③ unsplit keeps the strip "left then right"', J(k));
  }

  // ④ the old-record repair
  {
    const a = F('normalizeChain')({ tabs: ['A', 'B', 'C'], active: 0, layout: 'split', split: { pair: ['A', 'C'], ratio: 0.5 } });
    leg(J(a.split.left) === J(['A', 'B']) && J(a.split.right) === J(['C']), '④ no side lists, the host A left in the pair: the non-anchor pane C alone on the right, B with the anchor', J(a));
    const b = F('normalizeChain')({ tabs: ['A', 'B', 'C'], active: 0, layout: 'split', split: { pair: ['B', 'A'], ratio: 0.5 } });
    leg(J(b.split.left) === J(['B']) && J(b.split.right) === J(['A', 'C']), '④ …the host A on the RIGHT: B alone on the left, C with the anchor on the right', J(b));
    const h = F('normalizeChain')({ tabs: ['H', 'X', 'Y', 'Z'], active: 1, layout: 'split', split: { pair: ['X', 'Y'], ratio: 0.5 } });
    leg(J(h.split.left) === J(['H', 'X', 'Z']) && J(h.split.right) === J(['Y']), '④ …the host not in the pair: the LEFT member anchors, the rest (host included) with it', J(h));
    leg(invariantBroken(a) === null && invariantBroken(b) === null && invariantBroken(h) === null, '④ every repaired record satisfies every invariant');
    const two = F('normalizeChain')({ tabs: ['chat', 'live'], active: 1, layout: 'split', split: { pair: ['chat', 'live'], ratio: 0.4, dir: 'row' } });
    leg(J(two.split.left) === J(['chat']) && J(two.split.right) === J(['live']) && two.split.ratio === 0.4, '④ a two-tab record (every split written before v2) repairs to one tab per side, the ratio kept', J(two));
  }

  // ⑤ moveTab
  {
    const t = F('normalizeChain')({ tabs: ['A', 'B', 'C'], active: 0 });
    F('moveTab')(t, 'A', { index: 2 });
    leg(J(t.order) === J(['B', 'C', 'A']) && J(t.tabs) === J(['A', 'B', 'C']) && t.layout === 'tabs', '⑤ tabs: a reorder changes the strip ORDER only — `tabs` (the host = tabs[0]) never re-hosts', J(t));
    const s = F('normalizeChain')({ tabs: ['A', 'B', 'C', 'D'], active: 0, layout: 'split', split: { pair: ['A', 'C'], ratio: 0.5, left: ['A', 'B'], right: ['C', 'D'] } });
    F('moveTab')(s, 'B', { side: 'left', index: 0 });
    leg(J(s.split.left) === J(['B', 'A']) && J(s.split.pair) === J(['A', 'C']), '⑤ within a side: the order changes, the pair does not', J(s));
    F('moveTab')(s, 'B', { side: 'right', index: 2 });
    leg(J(s.split.left) === J(['A']) && J(s.split.right) === J(['C', 'D', 'B']) && J(s.split.pair) === J(['A', 'C']), '⑤ a HIDDEN tab moved across changes side and stays hidden (the pair unchanged)', J(s));
    F('showTab')(s, 'A');
    F('moveTab')(s, 'C', { side: 'left', index: 1 });
    leg(J(s.split.left) === J(['A', 'C']) && J(s.split.right) === J(['D', 'B']) && J(s.split.pair) === J(['C', 'D']), '⑤ a DISPLAYED tab moved across carries its display: shown on the new side; the side it left shows the tab now at its index (D)', J(s));
    F('moveTab')(s, 'B', { side: 'left', index: 0 });
    F('showTab')(s, 'D');
    F('moveTab')(s, 'D', { side: 'left', index: 3 });
    leg(s.layout === 'tabs', '⑤ …and when it was the side\'s last tab the split ends (never a dangling pane)', J(s));
    const s2 = F('normalizeChain')({ tabs: ['A', 'B', 'C', 'D'], active: 0, layout: 'split', split: { pair: ['A', 'D'], ratio: 0.5, left: ['A'], right: ['B', 'C', 'D'] } });
    F('moveTab')(s2, 'D', { side: 'left', index: 1 });
    leg(J(s2.split.pair) === J(['D', 'C']), '⑤ the moved pane was the LAST of its side: its side shows the one before it', J(s2));
    const n = F('normalizeChain')({ tabs: ['A', 'B'], active: 0 });
    F('moveTab')(n, 'B', { side: 'left', index: 0 });
    leg(n.layout === 'tabs' && !n.split, '⑤ a move in a tabs chain never creates a split (R1: no drag splits)', J(n));
  }

  // ⑥ both sides switchable
  {
    const c = F('normalizeChain')({ tabs: ['A', 'B', 'C', 'D'], active: 0, layout: 'split', split: { pair: ['A', 'C'], ratio: 0.5, left: ['A', 'B'], right: ['C', 'D'] } });
    F('showTab')(c, 'B');
    leg(J(c.split.pair) === J(['B', 'C']) && c.tabs[c.active] === 'B', '⑥ a tab of the LEFT half is shown on the LEFT, the right pane untouched (the owner: "I can only change the right side")', J(c));
    F('showTab')(c, 'D');
    leg(J(c.split.pair) === J(['B', 'D']) && c.tabs[c.active] === 'D' && J(c.split.left) === J(['A', 'B']), '⑥ a tab of the RIGHT half is shown on the right, the left pane untouched; the lists do not move', J(c));
    leg(!('splitReplaceable' in C), '⑥ splitReplaceable (D19 (a): only the non-anchor pane) is retired from the model');
  }

  // ⑦ removeTab keeps active on the same window
  {
    const c = F('normalizeChain')({ tabs: ['A', 'B', 'C'], active: 1 });
    F('removeTab')(c, 'A');
    leg(c.tabs[c.active] === 'B', '⑦ removing an EARLIER tab keeps `active` on the same window (a bare splice slid it onto C)', J(c));
    const d = F('normalizeChain')({ tabs: ['A', 'B', 'C'], active: 1, order: ['C', 'B', 'A'] });
    F('removeTab')(d, 'B');
    leg(d.tabs[d.active] === 'A', '⑦ removing the ACTIVE tab passes it to its strip neighbour (the next one)', J(d));
    const e = F('normalizeChain')({ tabs: ['A', 'B', 'C', 'D'], active: 2, layout: 'split', split: { pair: ['A', 'C'], ratio: 0.5, left: ['A', 'B'], right: ['C', 'D'] } });
    F('removeTab')(e, 'C');
    leg(J(e.split.pair) === J(['A', 'D']) && e.tabs[e.active] === 'D', '⑦ a removed PANE is replaced on its own side by the tab now at its index, which takes the focus', J(e));
  }

  // ⑧ swap
  {
    const c = F('normalizeChain')({ tabs: ['A', 'B', 'C'], active: 0, layout: 'split', split: { pair: ['A', 'C'], ratio: 0.3, left: ['A', 'B'], right: ['C'] } });
    F('swapSides')(c);
    leg(J(c.split.left) === J(['C']) && J(c.split.right) === J(['A', 'B']) && J(c.split.pair) === J(['C', 'A']) && J(c.order) === J(['C', 'A', 'B']) && c.split.ratio === 0.3, '⑧ swapSides swaps the side LISTS with the pair; the strip follows; the ratio stays', J(c));
  }

  // ⑨ the sync key
  {
    const base = { tabs: ['A', 'B', 'C'], active: 0, layout: 'split', split: { pair: ['A', 'C'], ratio: 0.5, left: ['A', 'B'], right: ['C'] } };
    const K = (x) => C.chainSyncKey(x);
    const reordered = { ...base, split: { ...base.split, left: ['B', 'A'] } };
    leg(K(base) !== K(reordered), '⑨ the key carries the ORDER within a side (a reorder is structural — the other client rebuilds)');
    const moved = { ...base, split: { ...base.split, left: ['A'], right: ['B', 'C'] } };
    leg(K(base) !== K(moved), '⑨ the key carries WHERE the sides are cut (a cross-side move)');
    leg(K(base) !== K({ ...base, split: { ...base.split, pair: ['B', 'C'] } }), '⑨ the key carries the pair (a per-side switch)');
    leg(K(base) === K({ ...base, split: { ...base.split, ratio: 0.31 } }), '⑨ a RATIO-only change keeps the key (applied in place)');
    leg(K(base) === K({ tabs: ['A', 'B', 'C'], active: 2, layout: 'split', split: { pair: ['A', 'C'], ratio: 0.5 } }), '⑨ an old record (no side lists) keys like its repaired form (and `active` is never in the key — focus is per client)');
    leg(K({ tabs: ['A', 'B', 'C'], order: ['C', 'A', 'B'] }) !== K({ tabs: ['A', 'B', 'C'] }), '⑨ a tabs-layout reorder changes the key');
    leg(K({ tabs: ['A', 'B'], recent: ['B'] }) === K({ tabs: ['A', 'B'], recent: ['A'] }) && K(null) === '' && K({}) === '', '⑨ local state (`recent`) never enters the key; no chain, no key');
    const obj = JSON.parse(J(base));
    K(obj);
    leg(J(obj) === J(base), '⑨ computing the key never mutates the chain (a normalized CLONE)');
  }

  // ⑩ visual order per side
  {
    const c = { tabs: ['A', 'B', 'C', 'D'], active: 0, layout: 'split', split: { pair: ['B', 'C'], ratio: 0.5, left: ['D', 'B'], right: ['A', 'C'] } };
    const v = C.visualTabOrder(c), s = C.sidesOf(c);
    leg(J(v) === J(['D', 'B', 'A', 'C']) && J(s) === J({ left: ['D', 'B'], right: ['A', 'C'] }) && C.sideOf(c, 'A') === 'right' && C.sideOf(c, 'D') === 'left' && C.sideOf({ tabs: ['A'] }, 'A') === null, 'the strip is drawn PER SIDE: sidesOf = the two lists, visualTabOrder = left ++ right, sideOf names a tab\'s side');
    leg(J(c.tabs) === J(['A', 'B', 'C', 'D']) && !('order' in c), 'the readers never mutate the chain');
    const i = F('normalizeChain')({ tabs: ['A', 'B'], active: 0, layout: 'split', split: { pair: ['A', 'B'], ratio: 0.5 } });
    F('insertTab')(i, 'N');
    leg(J(i.split.right) === J(['B', 'N']), 'insertTab on a split defaults to the RIGHT side\'s end (the programmatic add)', J(i));
    F('insertTab')(i, 'M', { afterId: 'A' });
    leg(J(i.split.left) === J(['A', 'M']), 'insertTab afterId = right after that tab, on ITS side (the source\'s side)', J(i));
  }

  // ⑪ the held ratio (v2 verify r1, finding ①)
  {
    const T0 = 1_790_000_000_000;
    const mk = (ratio = 0.5) => F('normalizeChain')({ tabs: ['A', 'B', 'C'], active: 0, layout: 'split', split: { pair: ['A', 'C'], ratio, left: ['A', 'B'], right: ['C'] } });
    const c = mk(0.15);
    leg(F('heldRatio')(c, T0) === null, '⑪ no stamp, nothing held (every ordinary chain yields to a record)');
    F('holdRatio')(c, T0);
    leg(F('heldRatio')(c, T0 + 1000) === 0.15 && F('heldRatio')(c, T0 + C.RATIO_HOLD_MS) === 0.15, '⑪ a user\'s divider act HOLDS the value it left (0.15) — one second later and up to RATIO_HOLD_MS', J(c._ratioHeld));
    leg(C.RATIO_HOLD_MS === 60000 && F('heldRatio')(c, T0 + C.RATIO_HOLD_MS + 1) === null, '⑪ past RATIO_HOLD_MS (= §6b\'s 60 s dirty expiry) the stamp holds nothing — the record wins');
    const moved = mk(0.15); F('holdRatio')(moved, T0); moved.split.ratio = 0.4;
    leg(F('heldRatio')(moved, T0 + 10) === null && F('heldRatio')({ ...mk(0.15), _ratioHeld: { ratio: 0.153, at: T0 } }, T0 + 10) === 0.153, '⑪ a stamp the ratio has since moved away from (a remote apply, a programmatic set) holds nothing; within the ratio epsilon it still holds');
    const u = mk(0.15); F('holdRatio')(u, T0); F('releaseRatio')(u);
    leg(F('heldRatio')(u, T0 + 10) === null && !('_ratioHeld' in u), '⑪ releaseRatio (the save carrying it left) ends the hold');
    const tabsChain = F('normalizeChain')({ tabs: ['A', 'B'], active: 0 }); F('holdRatio')(tabsChain, T0);
    const gone = mk(0.15); F('holdRatio')(gone, T0); gone.layout = 'tabs'; delete gone.split;
    leg(!('_ratioHeld' in tabsChain) && F('heldRatio')(gone, T0 + 10) === null, '⑪ a tabs chain has no ratio to hold; a split that ended holds nothing');
    const k = mk(0.15), k2 = mk(0.15); F('holdRatio')(k, T0);
    leg(C.chainSyncKey(k) === C.chainSyncKey(k2) && !('_ratioHeld' in C.cloneChain(k)), '⑪ the stamp is LOCAL: never in the sync key, never in a clone (so never persisted or sent)');
  }
  // ⑫ MULTIVIEW (docs/design-browser-multiview.zh.md §3 (b) + D5): the partner rule, the follow verdict, the new
  //    live view's place, the fold-back — over window FACTS (chat A/B, live views LA/LB of sessions sA/sB)
  {
    const facts = { A: { sessionId: 'sA', kind: 'chat' }, B: { sessionId: 'sB', kind: 'chat' }, LA: { sessionId: 'sA', kind: 'live' }, LB: { sessionId: 'sB', kind: 'live' }, X: { sessionId: 'sX', kind: 'chat' }, E: { sessionId: 'sE', kind: 'chat', ended: true }, LE: { sessionId: 'sE', kind: 'live', ended: true }, F: { sessionId: null, kind: 'file' } };
    const fo = (id) => facts[id] || {};
    const split = (left, right, pair) => F('normalizeChain')({ tabs: [...left, ...right], active: 0, layout: 'split', split: { pair, ratio: 0.5, left, right } });
    const pf = F('partnerFor'), ff = F('followFor');
    const c1 = split(['A', 'B'], ['LA', 'LB'], ['A', 'LA']);
    leg(pf(c1, 'B', fo) === 'LB' && pf(c1, 'LA', fo) === 'A', '⑫ partnerFor: the tab on the OTHER side with the same session (chat ↔ its live view)');
    leg(run(() => ff(c1, 'B', fo)) === 'LB', '⑫ OTHER SIDE: the left switched to chat B while the right shows a partnered live view ⇒ the right follows to B\'s browser');
    leg(run(() => ff(split(['A', 'B'], ['LA', 'LB'], ['A', 'LA']), 'LB', fo)) === 'B', '⑫ …and the reverse: the right switched to B\'s browser while the left shows a partnered chat ⇒ the left follows to chat B');
    leg(run(() => ff(c1, 'A', fo)) === null, '⑫ the other side already shows the partner ⇒ nothing moves');
    const same = split(['A', 'LA', 'LB'], ['B'], ['A', 'B']);
    leg(pf(same, 'A', fo) === null && run(() => ff(same, 'LA', fo)) === null, '⑫ SAME SIDE: the partner sits on the same side (mergeDropLayout=split put the chats apart) ⇒ no partner, nothing follows — you see what you click');
    const lone = split(['A', 'B'], ['LA'], ['B', 'LA']);
    leg(pf(lone, 'B', fo) === null && run(() => ff(lone, 'B', fo)) === null, '⑫ NO PARTNER: chat B has no live view in the chain ⇒ nothing follows');
    const ended = split(['A', 'E'], ['LA', 'LE'], ['A', 'LA']);
    leg(pf(ended, 'E', fo) === null && run(() => ff(ended, 'E', fo)) === null, '⑫ SESSION ENDED: an ended session has no partner ⇒ nothing follows onto a dead pane');
    const placed = split(['A', 'B'], ['X', 'LA', 'LB'], ['B', 'X']);
    leg(pf(placed, 'B', fo) === 'LB' && run(() => ff(placed, 'B', fo)) === null, '⑫ USER-PLACED CHAT: the other side shows a chat the user put there (two chats side by side) ⇒ it NEVER moves, though B has a partner there');
    const placedLive = split(['A', 'B', 'F'], ['LA', 'LB'], ['F', 'LA']);
    leg(run(() => ff(placedLive, 'LB', fo)) === null, '⑫ …and the reverse: the other side shows something that is not a partnered chat (a file) ⇒ nothing moves');
    leg(pf(F('normalizeChain')({ tabs: ['A', 'LA'], active: 0 }), 'A', fo) === null && run(() => ff(F('normalizeChain')({ tabs: ['A', 'LA'], active: 0 }), 'A', fo)) === null, '⑫ a TABS chain (no sides) has no partner');
    // livePlacement (D5 (a)/(b)): never a third pane
    const lp = F('livePlacement');
    leg(J(lp(null, 'A', fo)) === J({ mode: 'split', side: 'right' }) && J(lp(F('normalizeChain')({ tabs: ['A', 'X'], active: 0 }), 'A', fo)) === J({ mode: 'split', side: 'right' }), '⑫ livePlacement: a chat NOT yet in a split (alone, or a tabs group) ⇒ the auto-bind makes chat | browser');
    leg(J(lp(split(['A', 'B'], ['LA'], ['A', 'LA']), 'B', fo)) === J({ mode: 'tab', side: 'right' }), '⑫ …a chat already in a split with a BROWSER SIDE ⇒ a quiet tab on the browser side');
    leg(J(lp(split(['A'], ['B'], ['A', 'B']), 'B', fo)) === J({ mode: 'tab', side: 'right' }) && J(lp(split(['A'], ['B'], ['A', 'B']), 'A', fo)) === J({ mode: 'tab', side: 'left' }), '⑫ …two chats side by side (no browser side) ⇒ a quiet tab on the chat\'s OWN side — nothing on screen moves');
    // foldBackTarget (D3)
    const fb = F('foldBackTarget');
    leg(fb({ id: 'w2', type: 'browser-live', sessionId: 'sA' }, [{ id: 'w1', type: 'browser-live', sessionId: 'sA' }]) === 'w1', '⑫ foldBackTarget: a drop between two live views of the SAME session folds back');
    leg(fb({ id: 'w2', type: 'browser-live', sessionId: 'sA' }, [{ id: 'c', type: 'chat', sessionId: 'sA' }, { id: 'w1', type: 'browser-live', sessionId: 'sA' }]) === 'w1', '⑫ …also onto a group holding that session\'s live view');
    leg(fb({ id: 'w2', type: 'browser-live', sessionId: 'sA' }, [{ id: 'w1', type: 'browser-live', sessionId: 'sB' }]) === null && fb({ id: 'c', type: 'chat', sessionId: 'sA' }, [{ id: 'w1', type: 'browser-live', sessionId: 'sA' }]) === null && fb({ id: 'w1', type: 'browser-live', sessionId: 'sA' }, [{ id: 'w1', type: 'browser-live', sessionId: 'sA' }]) === null, '⑫ …never between two sessions\' views, never for a chat, never onto itself (an ordinary merge)');
  }
  // ⑬ NAMING vs PRESSING (inc-muiq348r-jwb5): the incident's group = [主开发 (host), Project B (guest)], Project B on show
  {
    const rv = F('revealTab'), pr = F('pressTab');
    const inc = F('normalizeChain')({ tabs: ['HOST', 'GUEST'], active: 1, layout: 'tabs', order: ['GUEST', 'HOST'] });
    leg(run(() => rv(inc, 'HOST')) === 0, '⑬ revealTab: the user NAMES the HOST of a tabs group that shows a guest ⇒ index 0 (the host is a tab like any other — the incident)', J(inc));
    leg(run(() => rv(inc, 'GUEST')) === -1 && run(() => rv(F('normalizeChain')({ tabs: ['HOST', 'GUEST'], active: 0 }), 'HOST')) === -1, '⑬ …the tab already on show ⇒ -1 (nothing to switch; the frame is only raised)');
    leg(run(() => rv(F('normalizeChain')({ tabs: ['HOST', 'GUEST', 'G2'], active: 0 }), 'G2')) === 2, '⑬ …a guest named while the host is on show ⇒ its own index (the guest door, unchanged)');
    leg(run(() => rv(inc, 'STRANGER')) === -1 && run(() => rv(null, 'HOST')) === -1 && run(() => rv({ tabs: [] }, 'HOST')) === -1, '⑬ …a window not in the chain, no chain, an empty chain ⇒ -1');
    leg(run(() => rv({ tabs: ['HOST', 'GUEST'], active: 7 }, 'HOST')) === 0 && run(() => rv({ tabs: ['HOST', 'GUEST'], active: 7 }, 'GUEST')) === -1 && run(() => rv({ tabs: ['HOST', 'GUEST'], active: -2 }, 'GUEST')) === 1, '⑬ …an out-of-range `active` reads as normalizeChain settles it (7 ⇒ the last tab, -2 ⇒ the host) — the index switchTab itself would show, never a stale one');
    leg(run(() => pr({ tabs: ['HOST', 'GUEST'], active: 7 })) === 'GUEST', '⑬ …pressTab reads the same settled `active`');
    const sp = F('normalizeChain')({ tabs: ['A', 'B', 'C'], active: 2, layout: 'split', split: { pair: ['A', 'C'], ratio: 0.5, left: ['A', 'B'], right: ['C'] } });
    leg(run(() => rv(sp, 'A')) === 0 && run(() => rv(sp, 'B')) === 1 && run(() => rv(sp, 'C')) === -1, '⑬ …in a SPLIT: the other displayed pane (the host A) and a waiting tab (B) are switched to; the focused pane is not', J(sp));
    leg(run(() => pr(inc)) === 'GUEST' && run(() => pr(inc, 'HOST')) === 'GUEST', '⑬ pressTab: a press on a TABS group\'s frame focuses the tab ON SHOW (the guest) — never the hidden host, even when the host\'s id is offered as the "pane" (the pre-fix press named the host)');
    leg(run(() => pr(F('normalizeChain')({ tabs: ['HOST', 'GUEST'], active: 0 }))) === 'HOST', '⑬ …the host on show ⇒ the host');
    leg(run(() => pr(sp, 'A')) === 'A' && run(() => pr(sp, 'C')) === 'C' && run(() => pr(sp)) === 'C' && run(() => pr(sp, 'B')) === 'C', '⑬ …a SPLIT: the displayed pane under the pointer (A or C) becomes the focus; the title bar\'s own area (no pane) keeps the focused pane; a waiting tab (B) is never focused by a press');
    leg(run(() => pr(null)) === null && run(() => pr({ tabs: [] })) === null, '⑬ …no chain ⇒ null');
    leg(J(inc) === J(F('normalizeChain')({ tabs: ['HOST', 'GUEST'], active: 1, layout: 'tabs', order: ['GUEST', 'HOST'] })), '⑬ the two verdicts never mutate the chain (the switch is switchTab\'s — persisted and synced as a tab click)');
  }
  // ⑭ REMOVE-THEN-RESTORE (inc-mukeyzpt-lpou): a chain RECORD read without the windows this client closed arrives at the
  // chain the local close left — the same arithmetic (removeTab), the same key — never a rebuild that flattens the split
  {
    const wm_ = F('withoutMembers'), key = F('chainSyncKey'), N = F('normalizeChain'), rm = F('removeTab'), cl = F('cloneChain');
    const local = (rec, ids) => { const c = N(cl(rec)); for (const id of ids) rm(c, id); return c; };
    // the owner's group: [VibeSpace 主开发 | 设备运维大师] split, the Ctrl+click from the LEFT chat put the editor on the RIGHT, shown
    const owner = { tabs: ['A', 'B', 'E'], active: 2, layout: 'split', order: ['A', 'B', 'E'], split: { pair: ['A', 'E'], ratio: 0.55, dir: 'row', left: ['A'], right: ['B', 'E'] } };
    const before = J(owner);
    const o = run(() => wm_(owner, ['E']));
    leg(o && o.layout === 'split' && J(o.tabs) === J(['A', 'B']) && J(o.split.pair) === J(['A', 'B']) && J(o.split.left) === J(['A']) && J(o.split.right) === J(['B']) && o.split.ratio === 0.55, '⑭ the owner\'s record minus the closed editor = [A | B] still SPLIT (the right side shows its neighbour), the ratio kept — the pre-fix reconcile rebuilt it around the gone pane and flattened it to tabs', J(o));
    leg(o && key(o) === key(local(owner, ['E'])) && key(o) === key({ tabs: ['A', 'B'], active: 0, layout: 'split', split: { pair: ['A', 'B'], ratio: 0.5, left: ['A'], right: ['B'] } }), '⑭ …its key IS the key of the chain the local close left (removeTab on the live chain) — the remote apply finds the local chain and changes nothing');
    leg(J(owner) === before, '⑭ …the record itself is never mutated (a clone)');
    const host = { tabs: ['E', 'A', 'B'], active: 0, layout: 'tabs', order: ['E', 'A', 'B'] };
    const h = run(() => wm_(host, ['E']));
    leg(h && J(h.tabs) === J(['A', 'B']) && key(h) === key(local(host, ['E'])) && h.tabs[h.active] === 'A', '⑭ the closed window was the HOST ⇒ the next tab is promoted and shown, exactly as the local close did', J(h));
    leg(run(() => wm_({ tabs: ['A', 'E'], active: 1, layout: 'split', split: { pair: ['A', 'E'], ratio: 0.5, left: ['A'], right: ['E'] } }, ['E'])) === null && run(() => wm_({ tabs: ['A', 'E'], active: 0 }, ['E'])) === null, '⑭ one tab left ⇒ null (no chain — the survivor stands alone, as locally)');
    const three = { tabs: ['A', 'B', 'C'], active: 1, layout: 'tabs', order: ['A', 'B', 'C'] };
    const t3 = run(() => wm_(three, ['C']));
    leg(t3 && t3.tabs[t3.active] === 'B' && key(t3) === key(local(three, ['C'])), '⑭ a tabs chain minus a hidden member ⇒ the same window stays on show', J(t3));
    leg(key(run(() => wm_(owner, ['X', 'Y']))) === key(owner), '⑭ ids that are not members change nothing (same key)');
    const two = run(() => wm_({ tabs: ['A', 'B', 'E', 'F'], active: 3, layout: 'split', split: { pair: ['A', 'F'], ratio: 0.5, left: ['A', 'B'], right: ['E', 'F'] } }, ['F', 'E']));
    leg(two && two.layout === 'tabs' && J(two.tabs) === J(['A', 'B']) && two.tabs[two.active] === 'A', '⑭ two held closes empty the right side ⇒ the split ends, the left side\'s shown pane keeps the focus (removeTab\'s rule, in the order given)', J(two));
    leg(run(() => wm_(null, ['E'])) === null && run(() => wm_({}, ['E'])) === null, '⑭ no record ⇒ null');
  }
  // ⑮ THE TAB DRAG'S CLASSIFICATION (inc-muly2izg-cks3, userW on the Stage: "Browser 拖不出来"): the first 8 px pick
  // reorder / detach; a REORDER that leaves the strip's band by > 30 px TEARS OFF (the reporter's pull from the ring:
  // the live tab at (1246, 104) → the empty workspace at (795, 455), Δ (−451, +351) — more horizontal than vertical)
  {
    const md = F('tabDragMode');
    const band = { top: 92, bottom: 118 }; // a title bar at the reporter's page
    const TEAR = C.TAB_TEAR_PX, DEC = C.TAB_DRAG_DECIDE_PX;
    leg(TEAR === 30 && DEC === 8, '⑮ the constants: decide at 8 px, tear at 30 px (the vertical pull\'s own distance)', J({ TEAR, DEC }));
    leg(run(() => md({ mode: null, dx: 5, dy: -6, y: 98, band })) === null && run(() => md({ mode: null, dx: 0, dy: 0 })) === null, '⑮ under 8 px ⇒ not decided (null)');
    leg(run(() => md({ mode: null, dx: -9, dy: 7, y: 111, band })) === 'reorder', '⑮ the reporter\'s first 8 px (Δ −451/+351 scaled) are HORIZONTAL ⇒ a reorder while near the strip');
    leg(run(() => md({ mode: null, dx: 3, dy: 12, y: 116, band })) === 'detach' && run(() => md({ mode: null, dx: -4, dy: -9, y: 95, band })) === 'detach', '⑮ a vertical start ⇒ the detach path (up or down), unchanged');
    leg(run(() => md({ mode: null, dx: 20, dy: 2, y: 104, band, reorderable: false })) === 'detach', '⑮ a strip that does not reorder (the ≤ 768 px phone) ⇒ detach, as before');
    // walk the reporter's straight pull frame by frame: it starts a reorder and TEARS OFF once the pointer is 30 px below the bar
    let mode = null, toreAt = null; const from = { x: 1246, y: 104 };
    for (let i = 1; i <= 60; i++) { const dx = -451 * i / 60, dy = 351 * i / 60; const was = mode; mode = run(() => md({ mode, dx, dy, y: from.y + dy, band })); if (was === 'reorder' && mode === 'detach' && toreAt === null) toreAt = from.y + dy; }
    leg(mode === 'detach' && toreAt !== null && toreAt > band.bottom + TEAR && toreAt < band.bottom + TEAR + 12, `⑮ the reporter's pull: a reorder that TEARS OFF the frame the pointer is > 30 px below the bar (at y ${toreAt && Math.round(toreAt)}) — b970f16d kept it a reorder for the whole drag`, J({ mode, toreAt }));
    leg(run(() => md({ mode: 'reorder', dx: 300, dy: 25, y: band.bottom + 25, band })) === 'reorder' && run(() => md({ mode: 'reorder', dx: 300, dy: -20, y: band.top - 29, band })) === 'reorder', '⑮ a sideways reorder that wobbles within 30 px of the bar (below or above) stays a reorder — the v2 promise');
    leg(run(() => md({ mode: 'reorder', dx: 40, dy: -45, y: band.top - 31, band })) === 'detach', '⑮ …pulled UP past the margin (toward the desktop previews) it tears off too');
    leg(run(() => md({ mode: 'reorder', dx: 300, dy: 200, y: 400, band: null })) === 'reorder' && run(() => md({ mode: 'reorder', dx: 1, dy: 1, y: 'x', band })) === 'reorder', '⑮ no band known / an unreadable y ⇒ stays a reorder (never a guessed tear)');
    leg(run(() => md({ mode: 'detach', dx: 1, dy: 0, y: 104, band })) === 'detach', '⑮ a detach never goes back to a reorder (the torn tab follows the pointer; the strip is a merge target again)');
  }
  return failed;
}

console.log('— ①–⑩ the PURE model (src/lib/chain-layout.js)');
const C = require(path.join(REPO, MODEL));
const realFailed = legs(C);

console.log('— the negative controls (patched copies, scripts/mutant-copy.mjs)');
const M = mutantCopies('chain-layout', REPO);
const MUTANTS = [
  { tag: 'no-pair-side-check', find: "if (!left.length || !right.length || !left.includes(pair[0]) || !right.includes(pair[1])) return null;", repl: 'if (!left.length || !right.length) return null;', expect: /pair member sits on the WRONG side|every invariant holds/ },
  { tag: 'display-not-carried', find: '    pair[sideIdx(to)] = k;\n', repl: '\n', expect: /carries its display/ },
  { tag: 'bare-splice-remove', find: '  const ai = nextActive === null ? -1 : chain.tabs.indexOf(nextActive);\n  chain.active = ai >= 0 ? ai : 0;', repl: '  if (chain.active >= chain.tabs.length) chain.active = chain.tabs.length - 1;', expect: /same window/ },
  { tag: 'key-without-order', find: "const base = c.tabs.join(',') + '|' + c.order.join(',') + '|' + c.layout + '|';", repl: "const base = c.tabs.join(',') + '|' + c.layout + '|';", expect: /ORDER within a side|tabs-layout reorder/ },
  // v2 verify r1 ①: a hold that never expires would let an idle client re-send a stale ratio forever; a hold blind to a
  // ratio moved since would re-send a value somebody else already replaced
  { tag: 'hold-never-expires', find: '  if (!(age >= 0 && age <= RATIO_HOLD_MS)) return null;\n', repl: '\n', expect: /RATIO_HOLD_MS \(= §6b/ },
  { tag: 'hold-ignores-moved-ratio', find: '  return Math.abs(clampRatio(chain.split.ratio) - r) <= 0.005 ? r : null;', repl: '  return r;', expect: /moved away from/ },
  // MULTIVIEW D5 (c): a follow that ignores WHAT the other side shows would move a chat the user placed there; a partner
  // looked for on BOTH sides would follow onto the same side (a "follow" that is really a switch of the clicked side)
  { tag: 'follow-ignores-the-other-side', find: '  if (sf.kind !== pf.kind || !isPartnered(c, shown, factsOf)) return null;\n', repl: '\n', expect: /USER-PLACED CHAT/ },
  { tag: 'partner-on-either-side', find: "  for (const x of sides[mine === 'left' ? 'right' : 'left']) {", repl: '  for (const x of [...sides.left, ...sides.right].filter((y) => y !== id)) {', expect: /SAME SIDE/ },
  // inc-muiq348r-jwb5: the pre-fix door (focusWindow switched a GUEST's tab only — the host's own id never switched the
  // group) and the pre-fix press (a press on a tabs group's frame named the host element's own window)
  { tag: 'reveal-skips-the-host', find: '  return i === c.active ? -1 : i;\n}', repl: '  return i === c.active || i === 0 ? -1 : i;\n}', expect: /NAMES the HOST of a tabs group/ },
  { tag: 'press-names-the-host', find: '  return String(c.tabs[c.active]);\n}', repl: '  return String(c.tabs[0]);\n}', expect: /focuses the tab ON SHOW/ },
  // inc-mukeyzpt-lpou: the record rebuilt around the members still present (the pre-fix reconcile) — the gone pane
  // leaves a pair naming nobody and normalize flattens the split
  { tag: 'without-members-by-filter', find: '  for (const id of ids || []) removeTab(c, id);\n', repl: '  { const drop = new Set((ids || []).map(String)); c.tabs = c.tabs.filter((x) => !drop.has(x)); normalizeChain(c); }\n', expect: /still SPLIT/ },
  // inc-muly2izg-cks3: the pre-fix rule (a reorder is a reorder for the whole drag — the reporter's pull never left the
  // group) and a tear that only looks down (a tab pulled UP toward the desktop previews would stay in the bar)
  { tag: 'reorder-never-tears', find: "    return py < top - TAB_TEAR_PX || py > bottom + TAB_TEAR_PX ? 'detach' : 'reorder';", repl: "    return 'reorder';", expect: /reporter's pull/ },
  { tag: 'tear-only-downward', find: "    return py < top - TAB_TEAR_PX || py > bottom + TAB_TEAR_PX ? 'detach' : 'reorder';", repl: "    return py > bottom + TAB_TEAR_PX ? 'detach' : 'reorder';", expect: /pulled UP past the margin/ },
];
for (const m of MUTANTS) {
  const found = SRC.includes(m.find);
  ok(found, `control ${m.tag}: the patched line exists in the model (the control judges the current source)`);
  if (!found) continue;
  const Mod = M.load(MODEL, SRC.replace(m.find, m.repl), m.tag);
  const f = legs(Mod, { quiet: true });
  ok(f.some((n) => m.expect.test(n)), `control ${m.tag}: the patched copy turns its leg RED (${f.length} legs failed: ${f.slice(0, 2).join(' | ').slice(0, 160)})`);
}
for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: MUTANTS.length })) ok(r.pass, r.name, r.detail);

// ⑮ WIRING (inc-muly2izg-cks3): the tab drag asks the ONE rule every move, with the host's title bar as the band, and a
// reorder that tears off drops its marker and detaches at once — no second, inline classification left in tab-group.js
console.log('— ⑮ wiring: src/lib/tab-group.js classifies the tab drag through tabDragMode');
{
  const TG = fs.readFileSync(path.join(REPO, 'src/lib/tab-group.js'), 'utf8');
  const body = (() => { const i = TG.indexOf('  _setupTabDrag(tabEl, winId, chain) {'); const j = TG.indexOf('\n  _detachFromChain(', i); return i >= 0 && j > i ? TG.slice(i, j) : ''; })();
  ok(body.length > 2000, `⑮ _setupTabDrag found (${body.length} chars)`);
  ok(/import \{[^}]*\btabDragMode\b[^}]*\} from '\.\/chain-layout\.js';/.test(TG), '⑮ tab-group.js imports tabDragMode from the PURE model');
  ok(/tabDragMode\(\{ mode, dx: e\.clientX - startX, dy: e\.clientY - startY, y: e\.clientY, band, reorderable: this\._stripReorderable\(\) \}\)/.test(body), '⑮ processMove asks tabDragMode with the travel, the pointer y, the band and the phone rule');
  ok(/const band = mode === 'reorder' && hostNow && hostNow\._tabChain === chain \? hostNow\.titleBar\.getBoundingClientRect\(\) : null;/.test(body), '⑮ …the band is the host\'s title bar (the strip), read while a reorder runs');
  ok(/if \(tore\) endReorder\(\);/.test(body) && /if \(!detached && \(tore \|\| Math\.abs\(e\.clientY - startY\) > 30\)\)/.test(body), '⑮ …a tear drops the insertion marker and detaches on that frame');
  ok(!/Math\.abs\(dx0\) > Math\.abs\(dy0\)/.test(body) && !/mode = .*\? 'reorder' : 'detach'/.test(body), '⑮ no inline first-8-px classification left beside it (the rule lives in one place)');
}

console.log(`\n${fail ? 'FAIL' : 'ALL PASS'} (${pass} passed, ${fail} failed)`);
process.exit(fail || realFailed.length ? 1 : 0);
