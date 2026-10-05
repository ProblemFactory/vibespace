#!/usr/bin/env node
// AGENT BROWSER P7 — WINDOW BINDING, the fast half (docs/design-agent-browser-v2.md
// §4.6 / §3.7, D19 / D24; §9's `test-window-binding` row, "fast"):
//   ① the PURE chain model (src/lib/chain-layout.js): a missing `layout` reads
//      as 'tabs', the ratio clamps, `split` is validated against `tabs` in ONE
//      place (a dangling pair collapses to tabs — with the pre-fix shape that
//      LEAVES the dangling pair as the negative control), the multi-client sync
//      key changes when ONLY the layout changes (the pre-fix `tabs.join(',')`
//      key as the negative control) while a ratio-only change keeps the key and
//      is applied in place, the displayed panes on a wide vs a NARROW layout
//      (the phone renders tabs, the model keeps the split), D19 (a)'s
//      replaceable pane, the bind pair by side, the one grid-columns spelling (lane I verify r1: + the panes' own
//      floors as the tracks' minimums, capped at the window floor minus the divider; every write carries them);
//      and (split UX chunk 1, docs/design-split-ux.zh.md) dropSide GONE, the
//      strip's visual order, the swap, the default partner;
//   ② the OWNERSHIP badge: two sessions in one task group produce
//      distinguishable badges (the colour is per SESSION, the group never
//      enters), a session bound to no group produces a badge at all, an
//      off-shape id still gets a colour, the dots list every owner once with the
//      viewer first;
//   ③ WIRING PINS over the tree: every chain mutation in tab-group.js runs
//      `_normalizeChain`, layout.js keys chains by `chainSyncKey` at every site
//      and the pre-fix key is gone, captureState persists layout + split,
//      restoreTabChain is handed them, the divider computes its ratio in ONE
//      kind of pixel, syncHiddenViews derives the narrow-split hider, the
//      ≤768px stylesheet rule exists — and kb-design-lessons §6b's four
//      anti-ping-pong guards are UNTOUCHED (the chunk's exit condition);
//      split UX chunk 1 FLIPPED the drop-zone pins to NEGATIVE ones (no drag
//      ever splits; the three user merge drops call _afterUserMerge once;
//      restore / remote paths never do; the button, the glyph, the undo).
//   ④ SPLIT TABS v2 (docs/design-split-ux.zh.md §8, inc-muhfb5al-jzk6, 2026-09-25):
//      the wiring of the side lists — the strip halves, the tab drag's one-time
//      reorder/detach decision and its ONE mutation path, the in-place remote
//      apply, the pending chain for an async replay, the two settings read AT
//      THE ACT (window.mergeDropLayout / window.openLinkPlacement), the chat's
//      own window as the open source, D19 (a) retired. The PURE model itself is
//      scripts/test-chain-layout.mjs.
//   ⑤ v2 VERIFY r1 (2026-09-25): a local divider drag the remote record could
//      not know is KEPT on both in-place paths and re-sent once (heldRatio,
//      _resendHeldRatio, released at the save); the right half's tail is a
//      margin + the badge steps aside on a tight column; the three merge drops
//      share ONE body (_mergeDrop) and a drop onto an already-split chain says
//      so with Undo; the merge-as-split toast's Unsplit keeps the drop slot;
//      the restore's re-key carries activeWindowId.
//   ⑥ THE ONE RETIREMENT (inc-mukeyzpt-lpou): a census — every window-ending delete runs wm._retireWindow
//      first (the stage, every cached desktop record, the held close); the tab ✕ goes through requestClose;
//      the remote apply never re-creates a held close and reads a record's chain without it (withoutMembers),
//      re-sends the close once, every save releases it; a remote record for a hidden desktop goes through
//      cacheRemoteState. The chrome half is scripts/test-split-close-resurrect.mjs.
// Fast: no DOM, no ports, no chrome. The chrome half is test-window-binding.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const C = require(path.join(REPO, 'src/lib/chain-layout.js'));

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + String(extra).slice(0, 500) : '')); } return !!c; };
const J = (x) => JSON.stringify(x);
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');

console.log('— ① the PURE chain model');
{
  const c = C.normalizeChain({ tabs: ['a', 'b'], active: 1 });
  ok(c.layout === 'tabs' && c.split === undefined, 'a missing `layout` reads as tabs and no split is invented (old records need no migration)');
  const s = C.normalizeChain({ tabs: ['a', 'b', 'c'], active: 0, layout: 'split', split: { pair: ['a', 'b'], ratio: 0.3 } });
  ok(s.layout === 'split' && J(s.split) === J({ pair: ['a', 'b'], ratio: 0.3, dir: 'row', left: ['a', 'c'], right: ['b'] }), 'a valid split is kept: pair in tabs, ratio, dir row — and (split tabs v2) its SIDES, a pre-v2 record repaired by rule (the non-anchor pane b alone, c with the anchor a)', J(s.split));
  ok(C.normalizeChain({ tabs: ['a', 'b'], active: 0, layout: 'split', split: { pair: ['a', 'b'], ratio: 0.02 } }).split.ratio === 0.15 && C.normalizeChain({ tabs: ['a', 'b'], active: 0, layout: 'split', split: { pair: ['a', 'b'], ratio: 0.99 } }).split.ratio === 0.85, 'the ratio clamps to [0.15, 0.85] through normalize');
  ok(C.clampRatio(NaN) === 0.5 && C.clampRatio('abc') === 0.5 && C.clampRatio(0.05) === 0.15 && C.clampRatio(0.95) === 0.85 && C.clampRatio(0.4) === 0.4, 'clampRatio: NaN / junk → 0.5, below → 0.15, above → 0.85, inside untouched');
  const d = C.normalizeChain({ tabs: ['b', 'c'], active: 0, layout: 'split', split: { pair: ['a', 'b'], ratio: 0.5 } });
  ok(d.layout === 'tabs' && !('split' in d), 'a pair member NOT in tabs ⇒ layout collapses to tabs and split is DROPPED (never a dangling id, never a substitute)');
  ok(C.normalizeChain({ tabs: ['a', 'b'], active: 0, layout: 'split', split: { pair: ['a', 'a'] } }).layout === 'tabs', 'a pair of one id twice is not a split');
  ok(C.normalizeChain({ tabs: ['a', 'b'], active: 0, layout: 'split' }).layout === 'tabs', 'layout split without a split record ⇒ tabs');
  ok(C.normalizeChain({ tabs: ['a', 'b'], active: 7 }).active === 1 && C.normalizeChain({ tabs: ['a', 'b'], active: -2 }).active === 0, 'an out-of-range active clamps');
  const shared = { tabs: ['a', 'b'], active: 0, layout: 'split', split: { pair: ['b', 'a'], ratio: 0.5 } };
  ok(C.normalizeChain(shared) === shared, 'normalize mutates IN PLACE and returns the same object (the chain is shared by reference across its windows)');
  // the §4.6 invariant with its NEGATIVE CONTROL: the pre-fix shape (a splice and nothing else) leaves a dangling pair
  const three = { tabs: ['chat', 'live', 'files'], active: 1, layout: 'split', split: { pair: ['chat', 'live'], ratio: 0.5, dir: 'row' } };
  const preFix = JSON.parse(J(three)); preFix.tabs.splice(0, 1); // "close the chat tab" the old way: tabs spliced, split untouched
  ok(preFix.layout === 'split' && preFix.split.pair.includes('chat') && !preFix.tabs.includes('chat'), 'NEGATIVE CONTROL: a splice with no normalize leaves `pair` naming a window that is gone (the pre-fix shape)');
  const fixed = JSON.parse(J(three)); fixed.tabs.splice(0, 1); C.normalizeChain(fixed);
  ok(fixed.layout === 'tabs' && !fixed.split && J(fixed.tabs) === J(['live', 'files']), 'closing the HOST tab of a three-tab split chain ⇒ layout tabs, no dangling id, the other two stay grouped');
}

console.log('— ① the multi-client sync key (§4.6\'s named trap)');
{
  const tabs = { tabs: ['a', 'b'], active: 0 };
  const split = { tabs: ['a', 'b'], active: 0, layout: 'split', split: { pair: ['a', 'b'], ratio: 0.5 } };
  ok(C.chainSyncKey(tabs) !== C.chainSyncKey(split), 'the key CHANGES when only the layout changes (same tabs, tabs → split)');
  const preFixKey = (c) => c.tabs.join(',');
  ok(preFixKey(tabs) === preFixKey(split), 'NEGATIVE CONTROL: the pre-fix key `tabs.join(\',\')` is IDENTICAL for the two — the silent fork');
  const flipped = { ...split, split: { pair: ['b', 'a'], ratio: 0.5 } };
  ok(C.chainSyncKey(split) !== C.chainSyncKey(flipped), 'the key carries the pair ORDER (left/right swapped is a different layout)');
  const r2 = { ...split, split: { pair: ['a', 'b'], ratio: 0.3 } };
  ok(C.chainSyncKey(split) === C.chainSyncKey(r2), 'a RATIO-only change keeps the structural key (applied in place, never a rebuild)');
  ok(C.ratioDiffers(split, r2) === true && C.ratioDiffers(split, { ...split, split: { pair: ['a', 'b'], ratio: 0.502 } }) === false && C.ratioDiffers(tabs, split) === false, 'ratioDiffers: 0.5 vs 0.3 applies, 0.5 vs 0.502 does not (epsilon), a tabs chain never');
  ok(C.chainSyncKey({ tabs: ['a', 'b'], layout: 'split', split: { pair: ['a', 'z'] } }) === C.chainSyncKey(tabs), 'an INVALID split keys like tabs (what normalize would make of it)');
  ok(C.chainSyncKey(null) === '' && C.chainSyncKey({}) === '', 'no chain, no key');
}

console.log('— ① displayed panes, the anchor, D19 (a), the bind pair, the columns');
{
  const s = { tabs: ['chat', 'live', 'files'], active: 1, layout: 'split', split: { pair: ['chat', 'live'], ratio: 0.5 } };
  ok(J(C.displayedPanes(s)) === J(['chat', 'live']), 'a split on a wide layout displays its pair, in visual order');
  ok(J(C.displayedPanes(s, { narrow: true })) === J(['live']), 'a split on a NARROW layout displays only the focused pane (tabs only — the model is untouched)');
  ok(J(C.displayedPanes({ tabs: ['a', 'b'], active: 1 })) === J(['b']) && J(C.displayedPanes({ tabs: ['a', 'b'] })) === J(['a']), 'tabs mode displays the active tab (the host when active is missing)');
  ok(J(C.displayedPanes({ tabs: [] })) === J([]) && J(C.displayedPanes(null)) === J([]), 'nothing to display for an empty / missing chain');
  ok(C.splitAnchor(s) === 'chat' && !('splitReplaceable' in C), 'the host in the pair is the ANCHOR (the repair rule\'s); D19 (a)\'s splitReplaceable is RETIRED (split tabs v2: both sides switchable — test-chain-layout ⑥)');
  const hostless = { tabs: ['h', 'a', 'b'], active: 1, layout: 'split', split: { pair: ['a', 'b'], ratio: 0.5 } };
  ok(C.splitAnchor(hostless) === 'a', 'host not in the pair ⇒ the left member anchors');
  const hostless2 = { ...hostless, split: { pair: ['b', 'a'], ratio: 0.5 } };
  ok(C.splitAnchor(hostless2) === 'b', '…and with the pair reversed the anchor follows the left member');
  ok(C.splitAnchor({ tabs: ['a', 'b'], active: 0 }) === null, 'a tabs chain has no anchor');
  ok(J(C.pairFor({ anchorId: 'chat', guestId: 'live', side: 'right' })) === J(['chat', 'live']) && J(C.pairFor({ anchorId: 'chat', guestId: 'live', side: 'left' })) === J(['live', 'chat']), 'pairFor puts the guest on the side it was dropped on');
  const TAIL = 'min(calc(var(--split-ctl, 89px) + 56px), 45%)'; // split tabs v2 verify r1 ②: the right column carries the window controls
  ok(C.splitColumns(0.3) === `minmax(0, 0.3fr) 6px minmax(${TAIL}, 0.7fr)` && C.splitColumns(2) === `minmax(0, 0.85fr) 6px minmax(${TAIL}, 0.15fr)`, 'splitColumns is the ONE spelling of the host grid (clamped); the RIGHT column keeps a floor = the controls + a tab\'s room, ≤ 45 % (v2 verify r1 ②: it also carries the window controls)');
  // lane I verify r1 (2026-09-25): a pane's OWN floor — a bound live view dragged to the clamp was narrower than its bar
  ok(C.splitColumns(0.85, [0, 112.2]) === `minmax(0, 0.85fr) 6px minmax(max(113px, ${TAIL}), 0.15fr)` && C.splitColumns(0.15, [112.2, 0]) === `minmax(113px, 0.15fr) 6px minmax(${TAIL}, 0.85fr)` && C.splitColumns(0.3, null) === C.splitColumns(0.3) && C.splitColumns(0.3, [0, 0]) === C.splitColumns(0.3), 'splitColumns(ratio, mins): a pane floor is its track\'s minimum (rounded UP; the right one beside the controls\' floor — both hold); no floor = the spelling without it byte for byte');
  ok(C.SPLIT_PANE_MIN_MAX === 320 - C.SPLIT_DIVIDER_PX && C.paneMinPx(9999) === C.SPLIT_PANE_MIN_MAX && C.paneMinPx(-4) === 0 && C.paneMinPx('x') === 0 && C.paneMinPx(NaN) === 0 && C.splitColumns(0.5, [9999, 'junk']) === `minmax(314px, 0.5fr) 6px minmax(${TAIL}, 0.5fr)`, 'a pane floor is capped at the window floor minus the divider (a host at its own minimum still holds it); junk / ≤ 0 = none');
}

console.log('— ① split UX chunk 1 (docs/design-split-ux.zh.md §4): no pointer half, the visual order, swap, the default partner');
{
  const F = (n) => (typeof C[n] === 'function' ? C[n] : () => undefined); // a missing export reds its legs instead of crashing the suite
  ok(!('dropSide' in C), 'dropSide is GONE from the model (R1/R2: no pointer position ever picks a side — the verb names it)');
  const s = { tabs: ['A', 'B', 'C'], active: 1, layout: 'split', split: { pair: ['B', 'A'], ratio: 0.5 } };
  ok(J(F('visualTabOrder')(s)) === J(['B', 'A', 'C']), 'visualTabOrder: a split strip reads [left pane, right pane, …the rest in chain order] (R3 — the left pane\'s tab is on the left)');
  ok(J(F('visualTabOrder')({ tabs: ['A', 'B', 'C'], active: 0, layout: 'split', split: { pair: ['A', 'C'], ratio: 0.5 } })) === J(['A', 'B', 'C']), '…split tabs v2: a hidden tab sits in its SIDE\'s half (a pre-v2 record: with the anchor A, left of the boundary) — the strip is left ++ right');
  ok(J(F('visualTabOrder')({ tabs: ['A', 'B', 'C'], active: 2 })) === J(['A', 'B', 'C']) && J(F('visualTabOrder')({ tabs: ['A', 'B'], layout: 'split', split: { pair: ['A', 'Z'] } })) === J(['A', 'B']), 'visualTabOrder: a tabs chain (or an invalid split) keeps the chain order');
  ok(J(F('visualTabOrder')(null)) === J([]), 'no chain, no strip');
  ok(F('visualTabOrder')(s) !== s.tabs && J(s.tabs) === J(['A', 'B', 'C']), 'visualTabOrder never mutates `tabs` (a rendering, not a model change)');
  ok(J(F('swappedPair')(s)) === J(['A', 'B']) && F('swappedPair')({ tabs: ['A', 'B'], active: 0 }) === null, 'swappedPair reverses a valid pair; a tabs chain has none');
  ok(C.chainSyncKey({ ...s, split: { ...s.split, pair: F('swappedPair')(s) } }) !== C.chainSyncKey(s), 'a swap changes the structural key (the other clients rebuild the pair order)');
  const t3 = { tabs: ['A', 'B', 'C'], active: 0 };
  ok(F('splitPartner')(t3, ['A', 'C', 'B']) === 'C', 'splitPartner: the most RECENT other tab (the active one skipped)');
  ok(F('splitPartner')(t3, ['Z', 'A']) === 'B', '…a recent id no longer in the chain is skipped, then the NEXT neighbour');
  ok(F('splitPartner')(t3, []) === 'B' && F('splitPartner')({ tabs: ['A', 'B', 'C'], active: 2 }) === 'B', 'splitPartner with no record: the next neighbour, else the previous one');
  ok(F('splitPartner')({ tabs: ['A'], active: 0 }) === null && F('splitPartner')(null) === null, 'a one-tab chain has no partner');
}

console.log('— ② the ownership badge');
{
  // two sessions in ONE task group: the badge is keyed on the SESSION's own counter, the group never enters
  const inGroupA = 'sess-3-1758000000000', inGroupB = 'sess-4-1758000000001';
  const ca = C.ownerColor(inGroupA), cb = C.ownerColor(inGroupB);
  ok(/^hsl\(/.test(ca) && /^hsl\(/.test(cb) && ca !== cb, `two sessions in one task group produce DISTINGUISHABLE badges (${ca} vs ${cb})`);
  ok(C.ownerColor(inGroupA) === ca, 'the colour is deterministic for a session id');
  // a session bound to NO group: nothing but its own id is needed for a badge
  const b = C.ownerBadge({ sessionId: 'sess-9-1758000000009' });
  ok(b && /^hsl\(/.test(b.color) && b.name === 'sess-9-1758000000009', 'a session bound to no group produces a badge at all (colour from its own counter, name falls back to the id)');
  ok(/^hsl\(/.test(C.ownerColor('not-a-webui-id')) && C.ownerColor('not-a-webui-id') === C.ownerColor('not-a-webui-id') && C.ownerSeq('not-a-webui-id') >= 1000, 'an off-shape id still gets a stable colour (hashed into a slot beyond the counter range)');
  ok(C.ownerSeq('sess-12-1') === 12 && C.ownerSeq('sess-0-1') === 0, 'the counter is parsed from sess-<seq>-<ms>');
  const leases = [
    { profileId: 'bp-1', sessionId: 'sess-1-1', browserKey: 'bk-a' },
    { profileId: 'bp-1', sessionId: 'sess-2-2', browserKey: 'bk-b' },
    { profileId: 'bp-1', sessionId: 'sess-2-2', browserKey: 'bk-b-child' },
    { profileId: 'bp-2', sessionId: 'sess-5-5', browserKey: 'bk-e' },
    { profileId: 'bp-1', sessionId: null, browserKey: 'bk-x' },
  ];
  const dots = C.ownerDots({ leases, profileId: 'bp-1', sessionId: 'sess-2-2', nameOf: (id) => ({ 'sess-1-1': 'one', 'sess-2-2': 'two' })[id] });
  ok(J(dots.map((d) => [d.sessionId, d.name])) === J([['sess-2-2', 'two'], ['sess-1-1', 'one']]), 'ownerDots: the viewing session FIRST, every other owner of the profile ONCE (a child lease does not repeat its session), another profile\'s lease and a null session ignored');
  ok(dots[0].color !== dots[1].color, 'the two owners\' dots differ');
  ok(J(C.ownerDots({ leases, profileId: null, sessionId: 'sess-7-7' }).map((d) => d.sessionId)) === J(['sess-7-7']), 'an ephemeral browser (no profile) is owned by the viewing session alone');
  ok(C.ownerDots({ leases: null, profileId: 'bp-1', sessionId: null }).length === 0, 'no session, no leases ⇒ no dots');
}

console.log('— ③ wiring pins');
{
  const tg = read('src/lib/tab-group.js');
  const fnBody = (name) => { const i = tg.indexOf('\n  ' + name + '('); if (i < 0) return ''; const j = tg.indexOf('\n  },', i); return tg.slice(i, j); };
  for (const m of ['createTabChain', 'addToTabChain', '_detachFromChain', 'restoreTabChain', 'switchTab', 'bindSplit', 'unbindSplit', 'swapSplit', 'undoSplit', 'moveTabInChain', 'applyChainRecord']) ok(/this\._normalizeChain\(chain\)/.test(fnBody(m)), `tab-group.js ${m} runs _normalizeChain (the ONE validation at every chain mutation)`);
  ok(/_normalizeChain\(chain\) \{ return normalizeChain\(chain\); \}/.test(tg), '_normalizeChain IS the PURE normalizeChain (no second spelling)');
  // lane I verify r1: EVERY write of the host's grid columns carries the pair's own pane floors
  const colWrites = tg.match(/gridTemplateColumns = splitColumns\([^)]*\)/g) || [];
  ok(colWrites.length === 3 && colWrites.every((w) => /this\._paneMins\(/.test(w)), `every splitColumns write in tab-group.js passes the pair's pane floors (_applyChainLayout, setSplitRatio, setPaneMinWidth — ${colWrites.length}: ${colWrites.join(' | ')})`);
  ok(/w && w\.paneMinWidth/.test(fnBody('_paneMins')) && /const v = paneMinPx\(px\) \|\| null;/.test(fnBody('setPaneMinWidth')) && /chain\.split\.pair\.includes\(id\)/.test(fnBody('setPaneMinWidth')) && /paneMinWidth: null/.test(read('src/lib/window.js')), 'setPaneMinWidth stores the floor on the window (window.js declares it), re-spells the grid only while the window IS a pane of a split; _paneMins reads it per pane');
  ok(/showTab\(chain, targetId\)/.test(fnBody('switchTab')) && !/splitReplaceable/.test(tg), 'switchTab shows the tab on ITS OWN side through the PURE showTab — D19 (a) (only the non-anchor pane) is gone from tab-group.js');
  const div = fnBody('_setupSplitDivider');
  ok(/new AbortController\(\)/.test(div) && /requestAnimationFrame/.test(div) && /getBoundingClientRect\(\)/.test(div) && !/clientWidth|uiScale/.test(div), 'the divider drag: a PER-DRAG AbortController, rAF-coalesced, ONE kind of pixel (the host rect + clientX, never clientWidth / uiScale)');
  ok(/restoreTabChain\(tabIds, activeIndex, \{ layout, split, order \} = \{\}\)/.test(tg) && /left: list\(split\.left\), right: list\(split\.right\)/.test(fnBody('restoreTabChain')), 'restoreTabChain takes { layout, split, order } and copies the side lists (split tabs v2)');
  ok(/_applyChainLayout\(chain\)/.test(fnBody('_detachFromChain')) && /_clearSplitDom\(win\)/.test(fnBody('_detachFromChain')), '_detachFromChain sheds the split marks and re-applies the layout on the survivor');
  // split UX chunk 1 (R1): NO drag ever splits — the tab merge is the only drag exception
  const wj = read('src/lib/window.js');
  const css0 = read('public/style.css');
  const classBody = (src, name) => { const i = src.indexOf('\n  ' + name + '('); if (i < 0) return ''; const j = src.indexOf('\n  }\n', i); return src.slice(i, j); };
  for (const [f, src] of [['tab-group.js', tg], ['window.js', wj], ['style.css', css0]]) {
    const hits = (src.match(/_detectSplitDropTarget|_markSplitDrop|tab-split-drop|dropSide/g) || []).length;
    ok(hits === 0, `${f}: zero hits of _detectSplitDropTarget / _markSplitDrop / tab-split-drop / dropSide (the title-bar half drop zone is deleted, no body zone added) — ${hits}`);
  }
  const tabDrag = fnBody('_setupTabDrag'), barDrag = classBody(wj, '_setupDrag'), iconDrag = fnBody('_setupIconDrag');
  ok(tabDrag.length > 500 && barDrag.length > 500 && iconDrag.length > 200, 'the three drag bodies were found (control for the negative pins below)');
  ok(!/bindSplit\(/.test(tabDrag) && !/bindSplit\(/.test(barDrag) && !/bindSplit\(/.test(iconDrag), 'no drag (tab drag / title-bar drag / icon drag) ever calls bindSplit');
  const cnt = (src, re) => (src.match(re) || []).length;
  const md = fnBody('_mergeDrop');
  ok(cnt(iconDrag, /_mergeDrop\(/g) === 1 && cnt(tabDrag, /_mergeDrop\(/g) === 1 && cnt(barDrag, /_mergeDrop\(/g) === 1 && cnt(iconDrag + tabDrag + barDrag, /_afterUserMerge\(/g) === 0 && cnt(md, /_afterUserMerge\(/g) === 1 && /this\._chainLayoutSnap\(tc\)/.test(md) && /this\.addToTabChain\(tc, win, this\._dropSlot\(targetWin, x, y\)\)/.test(md), 'the three USER merge drops (icon drag, tab drag, title-bar drag) each go through the ONE merge-drop body (_mergeDrop), which snapshots the target chain BEFORE the drop and calls _afterUserMerge exactly once (the bridge to the second step)');
  const lj0 = read('src/lib/layout.js');
  ok(cnt(fnBody('restoreTabChain'), /_afterUserMerge/g) === 0 && cnt(fnBody('createTabChain'), /_afterUserMerge/g) === 0 && cnt(fnBody('addToTabChain'), /_afterUserMerge/g) === 0 && cnt(lj0, /_afterUserMerge/g) === 0 && cnt(classBody(wj, 'createWindow'), /_afterUserMerge/g) === 0, 'restore / remote sync / programmatic chain paths never call _afterUserMerge (no pulse, no toast for what the user did not do)');
  ok(/\.tab-split-btn/.test(barDrag.slice(0, barDrag.indexOf('processMove'))), 'the title-bar drag\'s mousedown excludes .tab-split-btn (the button is not a drag handle)');
  ok(/visualTabOrder\(chain\)/.test(fnBody('_renderTabBar')) && /tab-split-glyph/.test(fnBody('_renderTabBar')) && /tab-split-btn/.test(fnBody('_renderTabBar')), '_renderTabBar lays the strip out through the PURE visualTabOrder, with the glyph and the one split button');
  const bs = fnBody('bindSplit');
  ok(/announce/.test(bs) && /showToast\([^;]*\{ action/.test(bs) && /guestWasFree/.test(bs) && /chainBefore/.test(bs), 'bindSplit: the announce path snapshots (guestWasFree / rects / chainBefore) BEFORE the mutation and offers Undo through showToast(…, { action })');
  ok(/splitPartner\(/.test(fnBody('splitActive')) && /swapSides\(chain\)/.test(fnBody('swapSplit')), 'splitActive picks the partner through PURE splitPartner; swapSplit through swapSides (split tabs v2: the side LISTS swap with the pair)');
  const ud = fnBody('undoSplit');
  ok(/chain\.layout !== 'split'/.test(ud) && /this\.windows\.has\(/.test(ud) && /Nothing to undo any more/.test(ud), 'undoSplit guards chain identity + layout + pair + both windows alive, and SAYS so when it cannot');
  ok(/this\._markStrip\(chain, /.test(fnBody('switchTab')) && /const id = tab\.dataset\.winId;/.test(fnBody('_markStrip')) && !/this\._renderTabBar\(chain\)/.test(fnBody('switchTab')), 'switchTab re-marks the strip IN PLACE by window id (_markStrip) — never a rebuild under the pointer, never by strip index');
  ok(/chain\.recent/.test(fnBody('switchTab')), 'switchTab records the recent tabs (the default partner)');
  ok(/createWindow\(\{ title, type, x, y, width, height, syncId, openSpec, titleMeta, intoChain \}\)/.test(wj) && /this\.bindSplit\(born, winInfo, \{ side: intoChain\.side \|\| 'right' \}\)/.test(wj) && /\$\{born \? ';display:none' : ''\}/.test(wj), 'createWindow accepts intoChain and a born window is never painted standalone');
  ok(/displayedPanes\(w\._tabChain, \{ narrow: true \}\)/.test(wj) && /tabHidden: !!w\.content\?\.classList\?\.contains\('tab-hidden'\) \|\| narrowHidden/.test(wj), 'syncHiddenViews derives the narrow-split hider from the PURE displayedPanes (every hider suspends)');
  ok(/^  setOwnerBadge\(id, badge\) \{/m.test(wj), 'WindowManager.setOwnerBadge exists');
  const lj = read('src/lib/layout.js');
  ok((lj.match(/chainSyncKey\(/g) || []).length >= 3 && !/tabChain\.tabs\.join\(','\)/.test(lj), 'layout.js keys chains by chainSyncKey at every site and the pre-fix `tabs.join(\',\')` key is GONE');
  ok(/winState\.tabChain = \{ tabs: \[\.\.\.c\.tabs\], active: c\.active, layout: c\.layout === 'split' \? 'split' : 'tabs', order: \[\.\.\.\(c\.order \|\| c\.tabs\)\] \}/.test(lj) && /winState\.tabChain\.split = \{ pair: \[\.\.\.c\.split\.pair\], ratio: c\.split\.ratio, dir: 'row', left: \[\.\.\.\(c\.split\.left \|\| \[\]\)\], right: \[\.\.\.\(c\.split\.right \|\| \[\]\)\] \}/.test(lj), 'captureState persists layout + split + (split tabs v2) the strip order and the side lists, through the one writeLayouts choke point');
  ok((lj.match(/wm\.restoreTabChain\(tc\.tabs, tc\.active, \{ layout: tc\.layout, split: tc\.split, order: tc\.order \}\)/g) || []).length === 1 && (lj.match(/this\._queueChain\(key, /g) || []).length === 2 && (lj.match(/this\.queueRecordChains\(/g) || []).length === 1 && /layoutManager\?\.queueRecordChains\?\.\(desktopId, state, \{ naming: building \}\)/.test(fs.readFileSync(path.join(REPO, 'src/lib/desktop-manager.js'), 'utf8')) && !/restoreTabChain\(validTabs/.test(lj), 'ONE chain reconcile (_reconcileChain) hands restoreTabChain layout + split + order, and EVERY restore site (the remote apply; the boot restore and a desktop\'s first visit through queueRecordChains — inc-muundq37-cjay) goes through _queueChain');
  ok(/ratioDiffers\(rc, w\._tabChain\)/.test(lj) && /setSplitRatio\(w\._tabChain, rc\.split\.ratio, \{ notify: false \}\)/.test(lj), 'a remote ratio on a structural match is applied IN PLACE without a notify (no echo)');
  // split tabs v2: a same-member remote change is applied IN PLACE; an async member keeps the chain pending
  ok(/const sameMembers = !remoteChains\.has\(key\) && remoteByMembers\.get\(membersOf\(w\._tabChain\)\);/.test(lj) && /this\.app\.wm\.applyChainRecord\(w\._tabChain, remoteChains\.get\(sameMembers\)\);/.test(lj), 'layout.js: a remote key that differs over the SAME members + host (reorder / cross-side move / per-side switch / swap / split) is applied IN PLACE — only a membership or host change rebuilds');
  const acr = fnBody('applyChainRecord');
  ok(acr.length > 200 && !/_notify\(/.test(acr) && !/appendChild|removeChild/.test(acr), 'applyChainRecord never notifies and never re-parents a content (no echo, no iframe reload)');
  ok(/const v = restoreVerdict\(entry\.tc, \(id\) => wm\.windows\.has\(id\), entry\.gone\);/.test(lj) && /if \(v\.act !== 'restore'\) return v\.act === 'drop';/.test(lj) && /const pc = this\.pendingChainOf\(id\);/.test(lj) && !/waitMs|deadline/.test(lj.slice(lj.indexOf('  _queueChain('), lj.indexOf('  queueRecordChains('))), 'a member still being replayed (an async openSpec) keeps the remote chain PENDING until it appears — no deadline (inc-muundq37-cjay), its capture carries the record\'s chain (F2\'s race: a free viewer here broke the other client\'s chain on the next save)');
  // kb-design-lessons §6b: the four anti-ping-pong guards UNTOUCHED (the chunk's exit condition)
  ok(/if \(msg\.seq <= this\._lastRemoteSeq\)|_lastRemoteSeq/.test(lj) && /this\._userDirty = false;\n    setTimeout\(\(\) => \{ this\._restoring = false; \}, 1000\);/.test(lj), '§6b guard 1+2: the seq gate and the user-dirty clear at the end of _applyRemoteState are in place');
  ok(/if \(this\._restoring \|\| this\._pointerDown\) \{ this\._deferRemote\(msg\); return; \}/.test(lj) && /this\._pendingRemote\.set\(msg\.desktopId \|\| '', msg\);/.test(lj), '§6b guard 3: defer-while-interacting is in place (per desktop since lane desktop-move verify r1 — the record deferred under the pointer or the apply gate, never dropped)');
  ok(/const members = \[\.\.\.w\._tabChain\.tabs\];[\s\S]{0,600}for \(const id of members\) \{\n\s+const rw = recorded\.get\(id\), win = this\.app\.wm\.windows\.get\(id\);\n\s+if \(rw && rw\.gridBounds && win && !win\._onStage\) \{ win\.gridBounds = \{ \.\.\.rw\.gridBounds \}; this\.app\.wm\._applyGridBounds\(win\); \}/.test(lj) && /const recorded = new Map\(state\.windows\.map\(\(rw\) => \[rw\.winId \|\| rw\.id, rw\]\)\);/.test(lj), 'layout.js: a chain the record no longer holds is broken AND its members go back to the RECORD\'s boxes (stage-blank verify r4: the detach copied the host\'s box over the record\'s — a tab torn off on another device landed on its old host here; heavy test-stage-dragout-ui § 7)');
  ok(/Date\.now\(\) - this\._lastUserInputAt > 60000/.test(lj) && /if \(json === this\._lastSentJson && !this\._unacked\.some\(\(s\) => s\.desks\.includes\(desktopId \|\| ''\)\)\) \{/.test(lj), '§6b guard 2 (60 s expiry) + 4 (no-op guard — since lane desktop-move verify r5 ⑤ a text identical to the last sent is a no-op only when the server READ that send) are in place');
  // ── ④ split tabs v2: the strip halves, the tab drag, the settings read at the act, the open source ──
  const rtb = fnBody('_renderTabBar');
  ok(/tabBar\.classList\.add\('tab-bar-split'\)/.test(rtb) && /half\.className = 'tab-strip-half';/.test(rtb) && /for \(const id of chain\.split\[side\]\)/.test(rtb) && /for \(const id of visualTabOrder\(chain\)\)/.test(rtb), '④ _renderTabBar: a split draws TWO HALVES, each ITS side\'s list in order (the glyph between); tabs keeps one strip in visualTabOrder');
  ok(/for \(const tab of bar\.querySelectorAll\('\.tab-item'\)\)/.test(fnBody('refreshTabWaiting')), '④ refreshTabWaiting finds the tabs INSIDE the halves (bar.children would have lost every waiting blink)');
  const td = fnBody('_setupTabDrag');
  ok(/const next = tabDragMode\(\{ mode, dx: e\.clientX - startX, dy: e\.clientY - startY, y: e\.clientY, band, reorderable: this\._stripReorderable\(\) \}\);/.test(td) && /if \(!next\) return;/.test(td) && /if \(mode === 'reorder'\) \{ reorderMove\(e\); return; \}/.test(td) && !/Math\.abs\(dx0\) > Math\.abs\(dy0\)/.test(td), '④ the tab drag asks the ONE rule (PURE chain-layout tabDragMode): the first 8 px decide reorder (horizontal) / detach (vertical, the pre-v2 path), and a reorder that leaves the bar by > 30 px TEARS OFF (inc-muly2izg-cks3 — v2 kept it a reorder for the whole drag; the rule itself: test-chain-layout ⑮)');
  ok(/document\.addEventListener\('keydown', onKey, \{ signal: dragCtl\.signal, capture: true \}\)/.test(td) && /e\.key !== 'Escape'/.test(td) && /dragCtl = new AbortController\(\);/.test(td) && /requestAnimationFrame/.test(td), '④ the reorder: a per-drag AbortController (the Esc listener too), rAF-coalesced moves');
  ok(/this\.moveTabInChain\(chain, winId, \{ side: slot\.side, index: slot\.index \}\)/.test(td) && !/bindSplit\(|enterSplit\(/.test(td), '④ the reorder drop goes through the ONE mutation path (moveTabInChain) and never enters a split');
  const mt = fnBody('moveTabInChain');
  ok(/moveTab\(chain, id, \{ side, index \}\);/.test(mt) && /this\._applyChainLayout\(chain\);/.test(mt) && /this\._renderTabBar\(chain\);/.test(mt) && /this\._notify\(\);/.test(mt) && /chainSyncKey\(chain\) === before/.test(mt), '④ moveTabInChain = PURE moveTab → normalize → re-derive → notify (persist + the structural key), a no-op when nothing moved');
  const aum = fnBody('_afterUserMerge');
  ok(/this\._settings\?\.get\('window\.mergeDropLayout'\)/.test(aum) && /this\.bindSplit\(anchor, draggedWin, \{ side: 'right', announce: true, focus: 'guest', freeRect: from \|\| null, unsplitAction: true, unsplitOrder: \[\.\.\.chain\.order\] \}\)/.test(aum), '④ F3: window.mergeDropLayout is read AT THE DROP; split lands the dragged window on the RIGHT with Undo (back where it stood) + Unsplit (back to the drop slot — verify r1 ③)');
  const ap = read('src/lib/app.js'), cr = read('src/lib/chat-renderers.js'), cv = read('src/lib/chat-view.js'), fv = read('src/lib/file-viewer.js');
  ok(/linkPlacement\(fromId\) \{\n    const mode = this\.settings\?\.get\('window\.openLinkPlacement'\) \?\? 'split';/.test(ap) && /return \{ hostId: src\.id, split: mode === 'split', side: 'right' \};/.test(ap), '④ F2: app.linkPlacement reads window.openLinkPlacement AT THE ACT (split default) and returns the intoChain for the SOURCE window');
  ok((cr.match(/from: this\._sourceWinId\(\)|const from = this\._sourceWinId\(\);/g) || []).length === 4 && /getSourceWinId: \(\) => this\.winInfo\?\.id \|\| null/.test(cv), '④ F2: every open-from-chat site (the rel-path probe, the picker, the path link, its folder branch) passes the chat\'s OWN window (ChatView winInfo — never the active window)');
  ok((fv.match(/intoChain: opts\.intoChain \}\)/g) || []).length === 4 && /opts = \{ \.\.\.rest, intoChain: this\.linkPlacement\(from\) \};/.test(ap) && /type: 'editor', syncId: opts\.syncId, openSpec, intoChain: opts\.intoChain \}\);/.test(ap), '④ F2: the placement rides FileViewer.open\'s four createWindow calls and openEditor');
  const rv = (/RENDERED_VIEWERS = new Set\(\[([^\]]+)\]\)/.exec(fv) || [])[1] || '';
  const listed = rv.split(',').map((x) => x.trim().replace(/'/g, '')).sort();
  const chainLits = [...fv.slice(fv.indexOf('static async renderInto(')).matchAll(/viewerType === '([a-z-]+)'/g)].map((m) => m[1]).sort();
  ok(listed.length >= 10 && J(listed) === J(chainLits), '④ RENDERED_VIEWERS (the text short-circuit — no throwaway viewer born into a chain) equals renderInto\'s own if-chain', J({ listed, chainLits }));
  ok(/this\._focusOpenInChain\(opts\.from, \{ path: filePath, host: opts\.host, line: opts\.line \}\)/.test(ap) && /this\._focusOpenInChain\(from, \{ path: startPath, host, dir: true \}\)/.test(ap) && /this\.winInfo\._gotoLine = gotoLine;/.test(read('src/lib/code-editor.js')), '④ F2: the same path already in the source\'s chain is shown instead of opened twice; a :line link moves the editor');
  ok(/tabMergeTarget = win\._tabChain \? null : this\._detectTabMergeTarget\(/.test(wj), '④ a tab GROUP dragged by its title bar never merges into another window (the orphan: its other tabs stayed inside the hidden host)');
  ok(/el\.addEventListener\('mousedown', \(e\) => this\._focusFromPointer\(winInfo, e\)\);/.test(wj) && /closest\('\.window-content\.tab-split-pane'\)/.test(classBody(wj, '_focusFromPointer')), '④ a press in a split pane focuses THAT pane (chain.active + activeWindowId) — the keyboard / menus act on the tab under the user\'s hand');
  const ss = read('src/lib/settings-schema.js');
  ok(/'window\.mergeDropLayout': \{\n    type: 'enum', default: 'tabs',/.test(ss) && /'window\.openLinkPlacement': \{\n    type: 'enum', default: 'split',/.test(ss), '④ the two settings exist in Settings → Window (merge: tabs by default; open: split by default — the owner\'s choice)');
  ok(/registerKeybinding\(\{ key: 'ctrl\+shift\+pageup', command: 'chain\.moveTabLeft', when: inGroup, inTerminal: true/.test(ap) && /registerKeybinding\(\{ key: 'ctrl\+shift\+pagedown', command: 'chain\.moveTabRight', when: inGroup, inTerminal: true/.test(ap) && /\(e\.key === 'PageUp' \|\| e\.key === 'PageDown'\) && this\.winInfo\?\._tabChain/.test(read('src/lib/terminal.js')), '④ Ctrl+Shift+PageUp / PageDown move the active tab (registry chords, inert outside a group; a terminal lets them through only in a group)');
  const css = read('public/style.css');
  ok(/\.window\.tab-split \{ display: grid;/.test(css) && /\.window\.tab-split > \.tab-split-divider \{/.test(css), 'the split renders as the host grid with a divider (stylesheet)');
  ok(/@media \(max-width: 768px\) \{\n  \.window\.tab-split\.window-active \{ display: flex !important; \}\n  \.window\.tab-split > \.window-content\.tab-split-pane:not\(\.tab-split-focus\) \{ display: none !important; \}/.test(css) && !/\n  \.window\.tab-split \{ display: flex !important; \}/.test(css), '≤768px: the phone shows only the focused pane (tabs only) — by stylesheet, the model untouched; and only the ACTIVE split host is displayed (S4 verify r1: unscoped, every split host was, and the active window flowed below them)');
  ok(!/\.win-owner-dot \{[^}]*#[0-9a-f]{3,6}/i.test(css), 'the badge dot rule carries no literal colour (the per-session colour is data, set inline)');
  ok(/\.tab-split-btn \{/.test(css) && /\.tab-split-btn\.on \{/.test(css) && /\.tab-split-btn\.pulse \{/.test(css) && /@media \(prefers-reduced-motion: reduce\) \{[^}]*\.tab-split-btn\.pulse/.test(css), 'the ONE split button: resting / .on (the badge state) / .pulse, and no motion under prefers-reduced-motion');
  ok(/\.tab-split-glyph \{/.test(css) && /\.tab-item\.tab-pane::before \{[^}]*var\(--pane-color/.test(css), 'the glyph between the pane tabs + the pane tab underline in the pane\'s owner colour');
  ok(/\.window\.tab-split > \.tab-split-divider \{[^}]*background: color-mix\(in srgb, var\(--accent\) 35%, var\(--border\)\)/.test(css), 'the divider at rest is brighter than the window border (never var(--border) alone — P3)');
  ok(/\.window\.tab-split > \.window-titlebar \{ display: grid; grid-template-columns: subgrid;/.test(css) && /tab-strip-half\[data-side="left"\] \{ grid-column: 1; \}/.test(css) && /tab-strip-half\[data-side="right"\] \{ grid-column: 3;/.test(css) && /> \.tab-split-glyph \{ grid-column: 2;/.test(css), '④ the strip halves sit ON the panes\' columns: the title bar is a SUBGRID of the host (splitColumns stays the ONE spelling — the halves follow a divider drag with no JS), the glyph over the divider');
  ok(/@media \(max-width: 768px\) \{[^@]*\.tab-strip-half \{ display: contents; \}/.test(css), '④ ≤768px the halves dissolve into ONE strip, left then right (R6)');
  ok(!/content: '⫿ '/.test(css), 'the tofu pseudo-glyph is gone (a real element + SVG now)');
  ok(/@media \(max-width: 768px\) \{[^@]*\.tab-split-btn, \.tab-split-glyph \{ display: none !important; \}/.test(css), '≤768px: the button and the glyph hide (R6 — the phone shows one pane)');
  ok(/\.window-titlebar\.split-btn-hidden \.tab-split-btn|\.tab-split-btn\.narrow-host/.test(css), 'a very narrow host (< 260 px) hides the button');
  // ── ⑤ v2 verify r1 (2026-09-25) ──
  const acr1 = fnBody('applyChainRecord');
  ok(/const held = chain\.layout === 'split' && rec\.layout === 'split' \? heldRatio\(chain, Date\.now\(\)\) : null;/.test(acr1) && /ratio: held !== null \? held : rec\.split\.ratio/.test(acr1) && /return kept;/.test(acr1) && /releaseRatio\(chain\)/.test(acr1), '⑤ ① applyChainRecord keeps a HELD local divider ratio over the record (PURE heldRatio) and reports it; any other local ratio yields to the record\'s');
  ok(/if \(heldRatio\(w\._tabChain, Date\.now\(\)\) !== null\) heldKept = true;\n\s+else this\.app\.wm\.setSplitRatio\(w\._tabChain, rc\.split\.ratio, \{ notify: false \}\);/.test(lj) && /const kept = this\.app\.wm\.applyChainRecord\(w\._tabChain, remoteChains\.get\(sameMembers\)\);\n\s+if \(kept\) heldKept = true;/.test(lj), '⑤ ① BOTH in-place paths of the remote apply (the key-match ratio, the same-member record) keep a held local divider ratio');
  ok(/this\._userDirty = false;\n    setTimeout\(\(\) => \{ this\._restoring = false; \}, 1000\);\n(?:    \/\/[^\n]*\n)*    if \(heldKept\) setTimeout\(\(\) => this\._resendHeldRatio\(\), 1000\);/.test(lj), '⑤ ① the apply still clears the dirty bit (§6b guard 2 untouched) and a KEPT drag is re-sent ONCE, after the 1 s gate opens');
  const rhr = (() => { const i = lj.indexOf('\n  _resendHeldRatio('); return i < 0 ? '' : lj.slice(i, lj.indexOf('\n  }\n', i)); })();
  ok(/heldRatio\(ch, now\) !== null/.test(rhr) && /this\._lastUserInputAt = Math\.max\(this\._lastUserInputAt \|\| 0, at\);/.test(rhr) && /this\.scheduleAutoSave\(\);/.test(rhr) && !/Date\.now\(\) - |_lastUserInputAt = Date\.now\(\)/.test(rhr), '⑤ ① the re-send re-arms the dirty bit with the drag\'s REAL release time (never a fabricated "now" — §6b\'s 60 s expiry keeps its meaning) through the ordinary autosave');
  ok(/const json = JSON\.stringify\(\{ state, desktopId \}\);/.test(lj) && /releaseRatio\(w\._tabChain\);/.test(lj) && lj.indexOf('releaseRatio(w._tabChain);') > lj.indexOf('  _markCarried(desk, sentAt) {') && lj.indexOf('releaseRatio(w._tabChain);') < lj.indexOf('  _armAckWatch() {') && !/_releaseHeldRatios/.test(lj), '⑤ ① the held ratios are released when the server READ the save that carried them (_markCarried at the layout-sync ack — lane desktop-move verify r5 ⑤; it used to be the send, and a save on a socket the server never read released them for nothing); the no-op guard (§6b guard 4) is still the one guard');
  ok(/if \(chain\.layout === 'split' && chain\.split && Math\.abs\(chain\.split\.ratio - startRatio\) > 0\.005\) this\._holdSplitRatio\(chain\);/.test(div) && /_holdSplitRatio\(chain\) \{ holdRatio\(chain, Date\.now\(\)\); \}/.test(tg), '⑤ ① only a USER divider act that MOVED the ratio holds it (the drag\'s release, the double-click)');
  ok(/tab-strip-half\[data-side="right"\] \{ grid-column: 3; margin-right: calc\(var\(--split-ctl, 89px\) \+ var\(--split-btn, 30px\)\); \}/.test(css) && !/tab-strip-half\[data-side="right"\] \{[^}]*padding-right/.test(css), '⑤ ② the right half reserves the tail with a MARGIN (a padding lets a scroll box paint its tabs under the controls)');
  const fst = fnBody('_fitSplitTail');
  ok(/requestAnimationFrame\(/.test(fst) && /tb\.classList\.toggle\('split-btn-hidden', !!tb\._vsNarrow \|\| tight\)/.test(fst) && /this\._titleRO\.observe\(right\)/.test(fnBody('_renderTabBar')), '⑤ ② the badge steps aside on a right column too narrow for it + a tab (the right half observed — its width follows the divider; decided on the next frame, never inside the observer\'s delivery)');
  ok(/if \(chain\.layout === 'split'\) \{ this\._announceSplitJoin\(chain, \{ dragged: draggedWin, from, before \}\); return; \}/.test(aum) && /t\('Undo'\)/.test(fnBody('_announceSplitJoin')) && /this\._restoreChainLayout\(chain, b\)/.test(fnBody('undoSplit')), '⑤ ④ a merge onto a chain ALREADY split says so with Undo (the window back where it stood, the split back to its layout before the drop)');
  ok(/this\.unbindSplit\(chain, \{ order: Array\.isArray\(unsplitOrder\) && untouched\(\) \? unsplitOrder : null \}\)/.test(fnBody('bindSplit')), '⑤ ③ the merge-as-split toast\'s Unsplit returns the tabs to the drop slot (only while the strip is still the one the bind made)');
  ok(/if \(wm\.activeWindowId === oldId\) wm\.activeWindowId = winState\.winId;/.test(lj), '⑤ ⑦ the restore\'s re-key carries wm.activeWindowId (it named a window that no longer existed)');
}

console.log('— ⑥ THE ONE RETIREMENT + the held close (inc-mukeyzpt-lpou: a closed side-by-side viewer came back as a window after two desktop switches)');
{
  // THE CENSUS: every place a window's life ENDS (a `this.windows.delete(` / `wm.windows.delete(` that is not a re-key —
  // a re-key sets the same window back under its new id within five lines) sits in a method that runs the ONE
  // retirement BEFORE the delete. The pre-fix tab ✕ reached removeFromTabChain, whose delete had none: the closed
  // window stayed in switchTo's cached desktop record and the next round trip replayed it.
  const files = fs.readdirSync(path.join(REPO, 'src/lib')).filter((f) => f.endsWith('.js')).map((f) => 'src/lib/' + f);
  const census = (srcOf) => {
    const sites = [], bad = [];
    for (const f of files) {
      const lines = srcOf(f).split('\n').map((x) => x.replace(/(^|\s)\/\/.*$/, '$1')); // code only: a call after a line comment is no call
      lines.forEach((ln, i) => {
        if (!/\b(?:this|wm)\.windows\.delete\(/.test(ln)) return;
        if (lines.slice(i, i + 6).some((x) => /\.windows\.set\(/.test(x))) return; // a re-key: the window lives on under its new id
        let h = i; while (h > 0 && !/^  (?:async )?[_a-zA-Z$][\w$]*\([^)]*\) \{/.test(lines[h])) h--;
        sites.push(f + ':' + (i + 1));
        if (!/this\._retireWindow\(/.test(lines.slice(h, i + 1).join('\n'))) bad.push(f + ':' + (i + 1) + ' in ' + (lines[h] || '').trim().slice(0, 60));
      });
    }
    return { sites, bad };
  };
  const cs = census(read);
  ok(cs.sites.length >= 2 && cs.bad.length === 0, `⑥ CENSUS: every window-ending delete (${cs.sites.length}: ${cs.sites.join(', ')}) runs this._retireWindow() before it in the same method`, J(cs.bad));
  // CONTROL: the pre-fix removeFromTabChain (the retirement line gone — or only in a comment) reddens the census
  const tgSrc = read('src/lib/tab-group.js'), RET = '    this._retireWindow(winId); // THE ONE RETIREMENT';
  const ctlA = census((f) => (f === 'src/lib/tab-group.js' ? tgSrc.replace(RET, '    //') : read(f)));
  const ctlB = census((f) => (f === 'src/lib/tab-group.js' ? tgSrc.replace(RET, '    // this._retireWindow(winId); THE ONE RETIREMENT') : read(f)));
  ok(tgSrc.includes(RET) && ctlA.bad.some((b) => b.startsWith('src/lib/tab-group.js')) && ctlB.bad.some((b) => b.startsWith('src/lib/tab-group.js')), '⑥ CONTROL: the census reds on the pre-fix removeFromTabChain (the retirement removed, or left only in a comment)', J({ a: ctlA.bad, b: ctlB.bad }));
  const wj6 = read('src/lib/window.js'), tg6 = read('src/lib/tab-group.js'), lj6 = read('src/lib/layout.js'), dm6 = read('src/lib/desktop-manager.js');
  const rw = (() => { const i = wj6.indexOf('\n  _retireWindow('); return i < 0 ? '' : wj6.slice(i, wj6.indexOf('\n  }\n', i)); })();
  ok(/this\._app\?\.stage\?\.onWindowClosed\(id\);/.test(rw) && /this\._app\?\.desktopManager\?\.purgeClosedWindow\(id\);/.test(rw) && /layoutManager\?\.noteClosed\?\.\(id,/.test(rw), '⑥ the retirement reaches every register: the stage, every cached desktop record (purgeClosedWindow), the layout manager\'s held close');
  ok(/closeBtn\.addEventListener\('click', \(e\) => \{ e\.stopPropagation\(\); this\.requestClose\(tabWinId\); \}\)/.test(tg6) && !/this\.removeFromTabChain\(chain, tabWinId\)/.test(tg6), '⑥ the tab ✕ is a user close through the ONE door (requestClose → closeWindow), never removeFromTabChain directly');
  ok(/if \(heldIds\.includes\(winId\)\) \{ heldClosed = true; continue; \}\n(?:\s*\/\/[^\n]*\n)*\s*this\._createRemoteWindow\(rw\);/.test(lj6), '⑥ the remote apply never re-creates a HELD close (checked before _createRemoteWindow)');
  ok(/const tc = heldIds\.length \? withoutMembers\(rw\.tabChain, heldIds\) : rw\.tabChain;/.test(lj6) && /remoteChains\.set\(key, tc\);/.test(lj6), '⑥ …and reads a record\'s chain WITHOUT the held members (PURE withoutMembers — the local close\'s arithmetic), never a rebuild that flattens the split');
  ok(/if \(heldClosed\) setTimeout\(\(\) => this\._resendHeldClose\(\), 1000\);/.test(lj6) && /this\._releaseHeldCloses\(key \|\| null, sentAt\);/.test(lj6) && /this\.app\.layoutManager\?\.noteLayoutSent\?\.\(\[desktopId\], sentAt\);/.test(dm6) && !/_releaseHeldCloses\?\.\(desktopId\)/.test(dm6), '⑥ a refused re-creation re-sends the close ONCE; every save that leaves (the autosave, a switch\'s broadcast) owes an answer, and the closes made on its desktop are released when the server READ it (lane desktop-move verify r5 ⑤)');
  const rhc = (() => { const i = lj6.indexOf('\n  _resendHeldClose('); return i < 0 ? '' : lj6.slice(i, lj6.indexOf('\n  }\n', i)); })();
  ok(/this\._lastUserInputAt = Math\.max\(this\._lastUserInputAt \|\| 0, at\);/.test(rhc) && !/_lastUserInputAt = Date\.now\(\)/.test(rhc), '⑥ the close re-send keeps §6b\'s expiry meaningful (the close\'s REAL time, never a fabricated now)');
  ok(/dm\.cacheRemoteState\(msg\.desktopId, msg\.state, \{ receivedAt \}\);/.test(lj6) && !/dm\._savedStates\.set\(msg\.desktopId/.test(lj6) && /base\.has\(String\(w\.id\)\) && !now\.has\(String\(w\.id\)\)/.test(dm6), '⑥ a remote record for a desktop not on show goes through cacheRemoteState: a hidden window the last record on the wire listed and this one drops is closed then (the parked second client)');
}

console.log('— ⑦ THE HELD CHAIN ACT (stage-blank verify r5: a record that predated a tab tear-off re-formed the group at the drop, fleet-wide)');
{
  // THE SCENE: the real WindowManager + tab-group mixin + the real LayoutManager over fake elements (test-stage-visibility's
  // recipe) — the REAL _applyRemoteState, _detachFromChain, restoreTabChain, createTabChain, _resendHeldClose run; only
  // the DOM-only bookkeeping is stubbed. A record is built the way captureState writes it (a tabChain on the host row,
  // isTabGuest on the guests).
  globalThis.requestAnimationFrame ||= (fn) => setTimeout(fn, 0);
  globalThis.document ||= { addEventListener() { }, removeEventListener() { }, createElement: () => ({ style: {}, classList: { add() { }, remove() { }, toggle() { }, contains: () => false }, setAttribute() { }, removeAttribute() { }, appendChild() { }, remove() { }, querySelector: () => null, querySelectorAll: () => [] }), body: { appendChild() { }, classList: { add() { }, remove() { }, toggle() { }, contains: () => false } }, documentElement: { style: { setProperty() { } } }, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] };
  globalThis.window ||= { addEventListener() { }, removeEventListener() { }, matchMedia: () => ({ matches: false, addEventListener() { } }), localStorage: { getItem: () => null, setItem() { }, removeItem() { } }, getComputedStyle: () => ({ getPropertyValue: () => '' }), innerWidth: 1571, innerHeight: 854 };
  globalThis.localStorage ||= globalThis.window.localStorage; globalThis.getComputedStyle ||= globalThis.window.getComputedStyle;
  const { WindowManager } = await import(path.join(REPO, 'src/lib/window.js'));
  const { installTabGroupMixin } = await import(path.join(REPO, 'src/lib/tab-group.js'));
  const { LayoutManager } = await import(path.join(REPO, 'src/lib/layout.js'));
  const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
  const cls = () => { const s = new Set(); return { contains: (n) => s.has(n), add: (...n) => n.forEach((x) => s.add(x)), remove: (...n) => n.forEach((x) => s.delete(x)), toggle: (n, on) => { if (on === undefined ? !s.has(n) : on) s.add(n); else s.delete(n); } }; };
  const fakeEl = () => { const kids = new Set(); return { style: { zIndex: '', display: '', left: '', top: '', width: '', height: '', visibility: '', pointerEvents: '', contentVisibility: '' }, box: null, classList: cls(), getAttribute: () => null, setAttribute() { }, removeAttribute() { }, appendChild: (c) => kids.add(c), removeChild: (c) => kids.delete(c), contains: (c) => kids.has(c), remove() { }, querySelector: () => null, querySelectorAll: () => [] }; };
  const near = (a, b, eps = 0.005) => !!a && !!b && ['left', 'top', 'width', 'height'].every((k) => Math.abs((a[k] ?? 0) - (b[k] ?? 0)) < eps);
  const members = (w) => (w._tabChain ? [...w._tabChain.tabs].sort().join(',') : '');
  const HOME_A = { left: 0.05, top: 0.1, width: 0.4, height: 0.5 }, HOME_B = { left: 0.5, top: 0.12, width: 0.36, height: 0.45 }, HOME_C = { left: 0.55, top: 0.5, width: 0.3, height: 0.4 };
  const X = { left: 0.3, top: 0.48, width: 0.4, height: 0.5 }, Y = { left: 0.18, top: 0.64, width: 0.4, height: 0.5 };
  function scene(LM, { onlyMine = false } = {}) {
    const wm = Object.create(WindowManager.prototype);
    Object.assign(wm, { windows: new Map(), zIndex: 100, activeWindowId: null, grid: null, _settings: { get: () => undefined }, _hideMq: { matches: false }, windowCounter: 0 });
    installTabGroupMixin(wm);
    for (const k of ['_notify', '_mobileYieldSidebar', 'setGrid', '_reflowWindows', '_scheduleOverlapUpdate', '_renderTabBar', '_applyChainLayout', '_clearSplitDom', '_notifyChainChange', '_placeInboxBadge', 'setAuthBadge', '_markStrip', '_labelSplitBtn', '_resizePanes', '_fitChipsSoon', '_focusMostRecent', 'toggleMaximize', 'minimize', 'restore', 'closeWindow', 'setSplitRatio', '_captureGridBounds', '_withdrawMergeToast', '_afterUserMerge']) wm[k] = () => { };
    if (onlyMine && typeof wm.witnessChain === 'function') wm.witnessChain = () => { }; // a CONTROL judges this lane's hold alone: lane desktop-move's own chain witness (its r5 ②, the same act held by its ack'd-save rule on the merged tree) is neutered in control scenes
    wm._followPartner = () => null;
    wm._applyGridBounds = (w) => { if (w && w.gridBounds) w.element.box = { ...w.gridBounds }; };
    const app = { wm, sessions: new Map(), isMobile: false, settings: { get: () => undefined, on() { } }, desktopManager: { activeDesktopId: 'scra', cacheRemoteState() { }, noteWire() { }, _renderSwitcher() { } }, sidebar: { isOpen: true, toggle() { } }, ws: { send() { }, onStateChange() { }, onGlobal() { } }, updateTaskbar() { } };
    wm._app = app;
    const lm = new LM(app); // the REAL constructor: every field either lane's constructor sets exists (a fake built by Object.create broke on lane desktop-move's `_unacked`)
    Object.assign(lm, { _userDirty: false, _lastUserInputAt: Date.now(), _restoring: false, _pointerDown: false, _pendingChains: [], saves: 0, created: 0 });
    lm._applyToolbarState = () => { }; lm._applyTaskbarHeight = () => { }; lm.scheduleAutoSave = () => { lm.saves++; }; lm._createRemoteWindow = () => { lm.created++; };
    app.layoutManager = lm;
    const mk = (id, gb) => { const w = { id, type: 'chat', element: fakeEl(), content: { classList: cls(), id: id + '-content' }, titleBar: { querySelector: () => null }, titleSpan: { style: {} }, _desktopId: 'scra', gridBounds: { ...gb }, _openSpec: { action: 'viewSession', backend: 'claude', backendSessionId: 'e2e00000-0000-4000-8000-00000000f' + id } }; wm.windows.set(id, w); wm._applyGridBounds(w); return w; };
    const A = mk('A', HOME_A), B = mk('B', HOME_B), C = mk('C', HOME_C);
    /** a record as captureState writes it: `chains` = [[host, ...guests]] */
    const record = (boxes, chains = []) => ({ windows: ['A', 'B', 'C'].filter((id) => wm.windows.has(id)).map((id) => { const w = wm.windows.get(id); const row = { winId: id, gridBounds: { ...(boxes[id] || w.gridBounds) }, openSpec: w._openSpec }; const ch = chains.find((c) => c.includes(id)); if (ch) { row.tabChain = { tabs: [...ch], active: 0, layout: 'tabs' }; row.isTabGuest = ch[0] !== id; } return row; }) });
    return { wm, lm, app, A, B, C, record };
  }
  /** the legs over a LayoutManager class (the real one, or a patched copy for the control); returns the failed names */
  async function heldChainLegs(LM, { quiet = false } = {}) {
    const failed = [];
    const leg = (c, n, extra) => { if (quiet) { if (!c) failed.push(n); } else ok(c, n, extra); return !!c; };
    const waitResend = async () => { if (!quiet) await tick(1250); }; // the re-send's 1 s timer is judged once, in the full run (the TIER RULE's 10 s: a control judges the holds)
    // ── the tear-off (the measured class): [A host, B] grouped earlier; the user tears B off and drops it at X ──
    {
      const { wm, lm, A, B, C, record } = scene(LM, { onlyMine: quiet });
      wm.createTabChain(A, B); await tick();
      const stale = record({ A: HOME_A, B: HOME_A, C: HOME_C }, [['A', 'B']]); // the record the other page still holds
      wm._detachFromChain(A._tabChain, 'B'); B.gridBounds = { ...X }; wm._applyGridBounds(B); wm._noteChainAct(['B', 'A']); // the drag's tear-off door
      leg(!B._tabChain && !A._tabChain && lm._heldChainActs && lm._heldChainActs.has('B') && lm._heldChainActs.has('A'), '⑦ the tear-off door holds the torn tab and its old host (noteChainAct via the strip\'s _noteChainAct)', J({ held: [...(lm._heldChainActs || new Map()).keys()] }));
      lm._applyRemoteState(stale); await tick();
      leg(!B._tabChain && !A._tabChain, '⑦ a record that still names the group — deferred under the drag or captured before the tear\'s save reached its sender — does NOT re-form it', J({ b: members(B), a: members(A) }));
      leg(near(B.gridBounds, X) && near(B.element.box, X), `⑦ …and B stays where the user dropped it ${J(X)} (its entry in the record — its old host's box — is older than the act)`, J({ gb: B.gridBounds, box: B.element.box }));
      leg(near(C.gridBounds, HOME_C) && lm.created === 0, '⑦ …the rest of the record applies as usual (C\'s box; nothing re-created)');
      leg(lm._heldChainActs.has('B') && lm._heldChainActs.has('A'), '⑦ …the hold STAYS after the apply (a record that disagrees releases nothing)');
      await waitResend();
      leg(quiet || (lm._userDirty === true && lm.saves >= 1 && lm._lastUserInputAt > 0), '⑦ …the act is re-sent ONCE as the user\'s own (the held close\'s re-send: dirty at the act\'s real time, the autosave scheduled)', J({ dirty: lm._userDirty, saves: lm.saves }));
      // a record that AGREES (the other page received the tear: B alone at Y) releases the hold and applies in full
      lm._applyRemoteState(record({ A: HOME_A, B: Y, C: HOME_C }, [])); await tick();
      leg(!B._tabChain && near(B.gridBounds, Y) && lm._heldChainActs.size === 0, `⑦ a record that AGREES with the act (B alone) is applied whole (B at its ${J(Y)}) and releases the hold`, J({ gb: B.gridBounds, held: [...lm._heldChainActs.keys()] }));
      // …after which a stale record would win (the last-arrival class — accepted, as for the box). This leg judges THIS lane's
      // release alone: lane desktop-move's own chain witness (`_chainAt`, its r5 ②: released by its ack'd save) is cleared first —
      // on the merged tree both holds stand on one act, and theirs would still hold here
      for (const w of wm.windows.values()) delete w._chainAt;
      lm._applyRemoteState(stale); await tick(300);
      leg(!!B._tabChain && members(B) === 'A,B', '⑦ …and once released, a later record naming the group re-forms it (no hold without a fresh act: the last-arrival class, as for a box)', J({ b: members(B) }));
    }
    // ── the twin: the user MERGES C onto A; a stale record (A and C apart) must not break it ──
    {
      const { wm, lm, A, B, C, record } = scene(LM, { onlyMine: quiet });
      const stale = record({ A: HOME_A, B: HOME_B, C: HOME_C }, []);
      wm.createTabChain(A, C); wm._noteChainAct(['A', 'C']); await tick(); // the merge drop's door
      lm._applyRemoteState(stale); await tick();
      leg(!!C._tabChain && members(C) === 'A,C' && near(A.gridBounds, HOME_A), '⑦ the merge\'s twin: a record from before the user\'s merge does not break the group (and A keeps its box)', J({ c: members(C), a: A.gridBounds }));
      leg(near(B.gridBounds, HOME_B) && !B._tabChain, '⑦ …a window of no held act (B) takes the record as usual');
      leg(lm._heldChainActs.has('A') && lm._heldChainActs.has('C'), '⑦ …the merge stays held (its re-send is the same timer the tear-off leg judged)');
    }
    // ── the strip's own layout: a reorder the user made (same members, another key) is not undone in place ──
    {
      const { wm, lm, A, B, record } = scene(LM, { onlyMine: quiet });
      wm.createTabChain(A, B); await tick();
      const stale = record({ A: HOME_A, B: HOME_A }, [['A', 'B']]);
      A._tabChain.order = ['B', 'A']; wm._noteChainAct(['A', 'B']); // moveTabInChain's door
      lm._applyRemoteState(stale); await tick();
      leg(!!A._tabChain && A._tabChain.order && A._tabChain.order.join(',') === 'B,A', '⑦ the user\'s own reorder of the strip is kept against the record\'s older order (the in-place path is held too)', J({ order: A._tabChain && A._tabChain.order }));
    }
    // ── the bounds: an act by an idle user, under an apply, or past a minute holds nothing ──
    {
      const { wm, lm, A, B, record } = scene(LM, { onlyMine: quiet });
      wm.createTabChain(A, B); await tick();
      const stale = record({ A: HOME_A, B: HOME_A }, [['A', 'B']]);
      lm._lastUserInputAt = Date.now() - 120000; wm._detachFromChain(A._tabChain, 'B'); wm._noteChainAct(['B', 'A']);
      leg(!lm._heldChainActs || lm._heldChainActs.size === 0, '⑦ an act while the user is IDLE (no input for 2 min) is not held (§6b\'s expiry: an idle page holds nothing)');
      lm._lastUserInputAt = Date.now(); lm._restoring = true; lm._applying = true; wm._noteChainAct(['B', 'A']); lm._restoring = false; lm._applying = false; // under an apply: both flags (lane desktop-move's `_applying` is the gate once merged; `_restoring` here)
      leg(!lm._heldChainActs || lm._heldChainActs.size === 0, '⑦ a chain mutation under an apply / the boot restore is the RECORD\'s, never held');
      wm._noteChainAct(['B', 'A']); for (const h of lm._heldChainActs.values()) h.at = Date.now() - 61000;
      for (const w of wm.windows.values()) delete w._chainAt; // lane desktop-move's own witness (see above): this leg judges THIS lane's expiry
      lm._applyRemoteState(stale); await tick(300);
      leg(!!B._tabChain && members(B) === 'A,B' && lm._heldChainActs.size === 0, '⑦ a hold past CLOSE_HOLD_MS is gone: the record applies (the group re-forms)', J({ b: members(B) }));
      wm._detachFromChain(A._tabChain, 'B'); wm._noteChainAct(['B', 'A']); wm.windows.delete('B');
      lm._applyRemoteState(record({ A: HOME_A }, [])); await tick();
      leg(!lm._heldChainActs.has('B'), '⑦ a hold on a window that is gone is void');
    }
    return failed;
  }
  await heldChainLegs(LayoutManager);
  // CONTROLS (scripts/mutant-copy.mjs): the hold never consulted ⇒ the tear-off leg RED (the group re-forms, B on its old host);
  // the release-by-save variant (the hold dropped by the save, as the held close is) ⇒ the deferred-record leg RED too
  const { mutantCopies } = await import(path.join(REPO, 'scripts/mutant-copy.mjs'));
  const M = mutantCopies('winbind', REPO);
  const LJ = read('src/lib/layout.js');
  const holdFind = "    const heldChain = new Set(this._heldChainIds(state));\n";
  ok(LJ.includes(holdFind), '⑦ control: the patched line exists in layout.js');
  if (LJ.includes(holdFind)) {
    const f = M.write('src/lib/layout.js', LJ.replace(holdFind, "    const heldChain = new Set();\n"), 'no-chain-hold');
    const failed = await heldChainLegs((await import(f)).LayoutManager, { quiet: true });
    ok(failed.some((n) => /does NOT re-form it/.test(n)) && failed.some((n) => /stays where the user dropped it/.test(n)) && failed.some((n) => /merge's twin/.test(n)), `⑦ CONTROL: the hold never consulted turns the tear-off, the box and the merge legs RED (${failed.length}: ${failed.slice(0, 2).join(' | ').slice(0, 160)})`, J(failed));
  }
  const relHead = /(\n  _releaseHeldCloses\([^)]*\) \{\n)/; // the method's head, whatever its parameter list (lane desktop-move adds `upTo`)
  ok(relHead.test(LJ), '⑦ control: _releaseHeldCloses exists in layout.js');
  if (relHead.test(LJ)) {
    // release-by-SAVE: the save (here: the re-send's scheduleAutoSave → the release, as the real _doAutoSave does) drops the hold —
    // then the agreeing-record leg still passes but a record deferred under the drag and applied after the save re-forms the group
    const mut = LJ.replace(relHead, '$1    if (this._heldChainActs) this._heldChainActs.clear();\n');
    ok(mut !== LJ, '⑦ control: the release-by-save copy differs (the clear sits first, before any early return)');
    const f = M.write('src/lib/layout.js', mut, 'release-by-save');
    const { LayoutManager: LM2 } = await import(f);
    const { wm, lm, A, B, record } = scene(LM2, { onlyMine: true });
    wm.createTabChain(A, B); await tick();
    const stale = record({ A: HOME_A, B: HOME_A }, [['A', 'B']]);
    wm._detachFromChain(A._tabChain, 'B'); B.gridBounds = { ...X }; wm._applyGridBounds(B); wm._noteChainAct(['B', 'A']);
    lm._releaseHeldCloses('scra'); // the tear's save left (measured: 675 ms after the tear, the pointer still down)
    lm._applyRemoteState(stale); await tick(300); // the record deferred under the drag, applied at the pointerup (1742 ms)
    ok(!!B._tabChain && members(B) === 'A,B', '⑦ CONTROL: a hold released by the SAVE lets the record deferred under the drag re-form the group after the save left (why the release is by AGREEMENT)', J({ b: members(B) }));
  }
  // WIRING PINS: the doors and the apply's three sites
  const TG7 = read('src/lib/tab-group.js');
  const body7 = (name) => { const i = TG7.indexOf('\n  ' + name + '('); if (i < 0) return ''; const j = TG7.indexOf('\n  },', i); return TG7.slice(i, j); };
  ok(/this\._detachFromChain\(chain, winId\);\n(?:\s*this\.witnessChain\([^\n]*\n)?\s+const win = this\.windows\.get\(winId\);\n\s+if \(!win\) \{ mouseDown = false;[^\n]*return; \}\n(?:\s*\/\/[^\n]*\n)*\s+try \{ this\._app\?\.stage\?\.onTornOff\?\.\(win, frame\); \} catch \(err\) \{[^\n]*\}\n(?:\s*this\.witnessChain\([^\n]*\n)?\s+this\._noteChainAct\(\[winId, frame && frame\.id\]\);/.test(body7('_setupTabDrag')), '⑦ the tab drag\'s tear-off tells the layout manager (the torn tab + its frame\'s host) right after the detach and the Stage\'s hook (lane desktop-move\'s own witnessChain line may sit between — since its verify r5 final, right after the Stage hand-over)');
  ok(/this\._noteChainAct\(win\._tabChain \? \[\.\.\.win\._tabChain\.tabs\] : \[win\.id\]\);/.test(body7('_mergeDrop')), '⑦ the ONE merge-drop body (the title / icon / tab drags) tells it after the add');
  for (const v of ['moveTabInChain', 'bindSplit', 'unbindSplit', 'swapSplit', 'undoSplit']) ok(/this\._noteChainAct\(/.test(body7(v)), `⑦ the strip verb ${v} tells it`);
  for (const v of ['restoreTabChain', 'applyChainRecord', '_detachFromChain', 'createTabChain', 'addToTabChain', 'removeFromTabChain', '_ungroupLast']) ok(!/_noteChainAct\(/.test(body7(v)), `⑦ …${v} (a restore / an apply / a plain detach / a programmatic join / a close) never does`);
  ok(/noteChainAct\(ids, desktopId\) \{\n\s+if \(!Array\.isArray\(ids\) \|\| !ids\.length \|\| \(this\._applying \?\? this\._restoring\) \|\| this\._booting\) return;/.test(LJ) && /if \(!this\._lastUserInputAt \|\| now - this\._lastUserInputAt > CLOSE_HOLD_MS\) return;\n\s+for \(const id of ids\) if \(id\) \(this\._heldChainActs \|\|= new Map\(\)\)/.test(LJ), '⑦ layout.js noteChainAct: refused under an apply / the boot (lane desktop-move\'s _applying once merged, else _restoring) and for an idle user; keyed per window');
  ok(/if \(win && heldChain\.has\(String\(winId\)\)\) \{ heldClosed = true; continue; \}\n\n\s+if \(!win\) \{/.test(LJ), '⑦ the windows loop skips a held window\'s entry BEFORE the held-close / create branch');
  ok(/if \(sameMembers && !localChainKeys\.has\(sameMembers\)\) \{\n\s+\/\/[^\n]*\n\s+if \(chainHeld\(w\._tabChain\.tabs\)\) \{ heldClosed = true; localChainKeys\.add\(sameMembers\); continue; \}/.test(LJ) && /if \(!remoteChains\.has\(key\)\) \{\n\s+\/\/[^\n]*\n\s+if \(chainHeld\(w\._tabChain\.tabs\)\) \{ heldClosed = true; continue; \}/.test(LJ) && /if \(localChainKeys\.has\(key\)\) continue;\n(?:\s*\/\/[^\n]*\n)+\s+if \(chainHeld\(tc\.tabs\)\) \{ heldClosed = true; continue; \}\n[\s\S]{0,700}?this\._queueChain\(key, tc/.test(LJ), '⑦ the three chain sites (in place / break / create) ask chainHeld first');
  const rel7 = (() => { const i = LJ.indexOf('\n  _releaseHeldCloses('); return i < 0 ? '' : LJ.slice(i, LJ.indexOf('\n  }\n', i)); })();
  ok(rel7 && !/_heldChainActs/.test(rel7), '⑦ the save releases NO chain act (the release is by agreement — _heldChainIds; a hold released by the save let the deferred record through)');
  ok(/_resendHeldClose\(tries = 0\) \{[\s\S]{0,700}for \(const \[id, h\] of this\._heldChainActs \|\| \[\]\) if \(Date\.now\(\) - h\.at <= CLOSE_HOLD_MS && this\.app\.wm\.windows\.has\(id\)\) at = Math\.max\(at, h\.at\);/.test(LJ), '⑦ the held chain act rides the close\'s re-send (the act\'s real time, once)');
}

console.log('— ⑧ A SAVE WAITS FOR THE DROP (stage-blank verify r5: a tab torn off and held past the debounce went out on its old host\'s box)');
{
  const { LayoutManager } = await import(path.join(REPO, 'src/lib/layout.js'));
  const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
  const mkLm = (LM) => {
    const sent = [];
    const lm = new LM({ stage: null, wm: { windows: new Map() }, desktopManager: { activeDesktopId: 'scra', _restoring: false, noteWire() { } }, ws: { send: (m) => sent.push({ t: Date.now(), m }), onStateChange() { }, onGlobal() { } } }); // the real constructor (see ⑦)
    Object.assign(lm, { _userDirty: true, _lastUserInputAt: Date.now(), _restoring: false, _pointerDown: false, _lastSentJson: null, _autoSaveTimer: null, sent });
    lm.captureState = () => ({ windows: [] });
    return lm;
  };
  async function dropLegs(LM, { quiet = false } = {}) {
    const failed = [];
    const leg = (c, n, extra) => { if (quiet) { if (!c) failed.push(n); } else ok(c, n, extra); return !!c; };
    // the pointer is up: a save goes at once (the ordinary autosave)
    { const lm = mkLm(LM); await lm._doAutoSave(); leg(lm.sent.length === 1, '⑧ with the pointer up a scheduled save leaves at once'); }
    // the pointer is DOWN (a tab torn off and held): no save leaves while it is held, none in the 250 ms the drop's capture takes, one soon after
    {
      const lm = mkLm(LM); lm._pointerDown = true;
      const t0 = Date.now();
      await lm._doAutoSave(); await tick(450);
      leg(lm.sent.length === 0, '⑧ no save leaves while the pointer is down (the act is unfinished: the torn tab still carries its old host\'s box)', J(lm.sent.length));
      lm._pointerDown = false; const tUp = Date.now();
      await tick(260);
      leg(lm.sent.length === 0, '⑧ …nor in the 250 ms after the release (the drop\'s own capture runs then)', J({ sent: lm.sent.length }));
      await tick(700);
      leg(lm.sent.length === 1 && lm.sent[0].t - tUp >= 250 && lm.sent[0].t - tUp < 1200, `⑧ …one save leaves after the drop's capture (${lm.sent.length ? lm.sent[0].t - tUp : '—'} ms after the release) — the dirty bit untouched by the wait`, J({ sent: lm.sent.length, dirty: lm._userDirty, since: t0 }));
      leg(!lm._saveWaitsForDrop, '⑧ …and the wait is spent');
    }
    // the pointer RELEASED just before the debounce fired (the T3 shape: the detach at 189 ms, the release at ~540 ms, the save at
    // 689 ms, the drop's capture at ~790 ms): the drop itself tells the save to wait
    {
      const lm = mkLm(LM); lm.noteDrop(); const tDrop = Date.now();
      await lm._doAutoSave(); await tick(260);
      leg(lm.sent.length === 0, '⑧ a save armed before a drop released < 250 ms ago waits (the drop told it: noteDrop)', J(lm.sent.length));
      await tick(700);
      leg(lm.sent.length === 1 && lm.sent[0].t - tDrop >= 390, `⑧ …and leaves after the drop's capture (${lm.sent.length ? lm.sent[0].t - tDrop : '—'} ms after the drop)`, J({ sent: lm.sent.length }));
      const lm2 = mkLm(LM); lm2._dropAt = Date.now() - 5000; await lm2._doAutoSave();
      leg(lm2.sent.length === 1, '⑧ a drop older than the window holds nothing (the save leaves at once)');
    }
    return failed;
  }
  await dropLegs(LayoutManager);
  // CONTROL: the two gate lines removed ⇒ the save leaves while the pointer is down
  const { mutantCopies } = await import(path.join(REPO, 'scripts/mutant-copy.mjs'));
  const M8 = mutantCopies('winbind8', REPO);
  const LJ8 = read('src/lib/layout.js');
  const gate = "    if (this._pointerDown) { this._saveWaitsForDrop = true; this._autoSaveTimer = setTimeout(() => this._doAutoSave(), 300); return; }\n    if (this._saveWaitsForDrop || (this._dropAt && Date.now() - this._dropAt < 400)) { this._saveWaitsForDrop = false; this._autoSaveTimer = setTimeout(() => this._doAutoSave(), 400); return; }";
  ok(LJ8.includes(gate), '⑧ control: the gate lines exist in layout.js');
  if (LJ8.includes(gate)) {
    const f = M8.write('src/lib/layout.js', LJ8.replace(gate, ''), 'no-drop-wait');
    const failed = await dropLegs((await import(f)).LayoutManager, { quiet: true });
    ok(failed.some((n) => /no save leaves while the pointer is down/.test(n)) && failed.some((n) => /released < 250 ms ago waits/.test(n)), `⑧ CONTROL: without the gate the save leaves under the held pointer and in the release…capture gap (${failed.length}: ${failed[0] || ''})`.slice(0, 220), J(failed));
  }
  const dab = (() => { const i = LJ8.indexOf('\n  async _doAutoSave('); return i < 0 ? '' : LJ8.slice(i, LJ8.indexOf('\n  }\n', i)); })();
  ok(/if \(!this\._userDirty\) return;\n(?:\s*\/\/[^\n]*\n)+\s+if \(this\._pointerDown\) \{ this\._saveWaitsForDrop = true;/.test(dab) && /if \(this\._saveWaitsForDrop \|\| \(this\._dropAt && Date\.now\(\) - this\._dropAt < 400\)\) \{ this\._saveWaitsForDrop = false; this\._autoSaveTimer = setTimeout\(\(\) => this\._doAutoSave\(\), 400\); return; \}/.test(dab), '⑧ the gate sits in _doAutoSave after the dirty check and before the expiry (the act\'s time is never touched), and reads the drop');
  ok(/if \(!win\) return;\n\s+this\._app\?\.layoutManager\?\.noteDrop\?\.\(\);/.test(read('src/lib/tab-group.js')) && /noteDrop\(\) \{ this\._dropAt = Date\.now\(\); \}/.test(LJ8), '⑧ the tab drag\'s detached drop tells the layout manager (noteDrop) before its own 250 ms capture');
}

console.log(`\n${fail ? 'FAIL' : 'ALL PASS'} (${pass} passed, ${fail} failed)`);
process.exit(fail ? 1 : 0);
