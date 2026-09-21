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
//      replaceable pane, the bind pair by side, the one grid-columns spelling;
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
//      anti-ping-pong guards are UNTOUCHED (the chunk's exit condition).
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
  ok(s.layout === 'split' && J(s.split) === J({ pair: ['a', 'b'], ratio: 0.3, dir: 'row' }), 'a valid split is kept: pair in tabs, ratio, dir row');
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
  ok(C.splitAnchor(s) === 'chat' && C.splitReplaceable(s) === 'live', 'the host in the pair is the ANCHOR; D19 (a) replaces the other pane');
  const hostless = { tabs: ['h', 'a', 'b'], active: 1, layout: 'split', split: { pair: ['a', 'b'], ratio: 0.5 } };
  ok(C.splitAnchor(hostless) === 'a' && C.splitReplaceable(hostless) === 'b', 'host not in the pair ⇒ the left member anchors, the right is replaceable');
  const hostless2 = { ...hostless, split: { pair: ['b', 'a'], ratio: 0.5 } };
  ok(C.splitAnchor(hostless2) === 'b' && C.splitReplaceable(hostless2) === 'a', '…and with the pair reversed the anchor follows the left member');
  ok(C.splitReplaceable({ tabs: ['a', 'b'], active: 0 }) === null, 'a tabs chain has nothing to replace');
  ok(J(C.pairFor({ anchorId: 'chat', guestId: 'live', side: 'right' })) === J(['chat', 'live']) && J(C.pairFor({ anchorId: 'chat', guestId: 'live', side: 'left' })) === J(['live', 'chat']), 'pairFor puts the guest on the side it was dropped on');
  ok(C.splitColumns(0.3) === 'minmax(0, 0.3fr) 6px minmax(0, 0.7fr)' && C.splitColumns(2) === 'minmax(0, 0.85fr) 6px minmax(0, 0.15fr)', 'splitColumns is the ONE spelling of the host grid (clamped)');
  ok(C.dropSide({ clientX: 10, left: 0, width: 100 }) === 'left' && C.dropSide({ clientX: 60, left: 0, width: 100 }) === 'right' && C.dropSide({ clientX: 5, left: 0, width: 0 }) === 'right', 'dropSide halves the title bar');
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
  for (const m of ['createTabChain', 'addToTabChain', '_detachFromChain', 'restoreTabChain', 'switchTab', 'bindSplit', 'unbindSplit']) ok(/this\._normalizeChain\(chain\)/.test(fnBody(m)), `tab-group.js ${m} runs _normalizeChain (the ONE validation at every chain mutation)`);
  ok(/_normalizeChain\(chain\) \{ return normalizeChain\(chain\); \}/.test(tg), '_normalizeChain IS the PURE normalizeChain (no second spelling)');
  ok(/splitReplaceable\(chain\)/.test(fnBody('switchTab')), 'switchTab applies D19 (a) through the PURE splitReplaceable');
  const div = fnBody('_setupSplitDivider');
  ok(/new AbortController\(\)/.test(div) && /requestAnimationFrame/.test(div) && /getBoundingClientRect\(\)/.test(div) && !/clientWidth|uiScale/.test(div), 'the divider drag: a PER-DRAG AbortController, rAF-coalesced, ONE kind of pixel (the host rect + clientX, never clientWidth / uiScale)');
  ok(/restoreTabChain\(tabIds, activeIndex, \{ layout, split \} = \{\}\)/.test(tg), 'restoreTabChain takes { layout, split }');
  ok(/_applyChainLayout\(chain\)/.test(fnBody('_detachFromChain')) && /_clearSplitDom\(win\)/.test(fnBody('_detachFromChain')), '_detachFromChain sheds the split marks and re-applies the layout on the survivor');
  ok(/_detectSplitDropTarget\(/.test(fnBody('_setupTabDrag')) && /this\.bindSplit\(anchor, win, \{ side \}\)/.test(fnBody('_setupTabDrag')), 'a tab dragged onto the half of another title bar binds beside it');
  const wj = read('src/lib/window.js');
  ok(/createWindow\(\{ title, type, x, y, width, height, syncId, openSpec, titleMeta, intoChain \}\)/.test(wj) && /this\.bindSplit\(born, winInfo, \{ side: intoChain\.side \|\| 'right' \}\)/.test(wj) && /\$\{born \? ';display:none' : ''\}/.test(wj), 'createWindow accepts intoChain and a born window is never painted standalone');
  ok(/_detectSplitDropTarget\(e\.clientX, e\.clientY, win\.id, \[element\]\)/.test(wj) && /this\.bindSplit\(anchor, win, \{ side \}\)/.test(wj), 'the title-bar drag has the left/right drop zone and binds on drop');
  ok(/displayedPanes\(w\._tabChain, \{ narrow: true \}\)/.test(wj) && /tabHidden: !!w\.content\?\.classList\?\.contains\('tab-hidden'\) \|\| narrowHidden/.test(wj), 'syncHiddenViews derives the narrow-split hider from the PURE displayedPanes (every hider suspends)');
  ok(/^  setOwnerBadge\(id, badge\) \{/m.test(wj), 'WindowManager.setOwnerBadge exists');
  const lj = read('src/lib/layout.js');
  ok((lj.match(/chainSyncKey\(/g) || []).length >= 3 && !/tabChain\.tabs\.join\(','\)/.test(lj), 'layout.js keys chains by chainSyncKey at every site and the pre-fix `tabs.join(\',\')` key is GONE');
  ok(/winState\.tabChain = \{ tabs: \[\.\.\.c\.tabs\], active: c\.active, layout: c\.layout === 'split' \? 'split' : 'tabs' \}/.test(lj) && /winState\.tabChain\.split = \{ pair: \[\.\.\.c\.split\.pair\], ratio: c\.split\.ratio, dir: 'row' \}/.test(lj), 'captureState persists layout + split through the one writeLayouts choke point');
  ok((lj.match(/restoreTabChain\(validTabs, [^)]*\{ layout: [^}]+split: [^}]+\}\)/g) || []).length === 2, 'both restore sites hand restoreTabChain the layout + split');
  ok(/ratioDiffers\(rc, w\._tabChain\)/.test(lj) && /setSplitRatio\(w\._tabChain, rc\.split\.ratio, \{ notify: false \}\)/.test(lj), 'a remote ratio on a structural match is applied IN PLACE without a notify (no echo)');
  // kb-design-lessons §6b: the four anti-ping-pong guards UNTOUCHED (the chunk's exit condition)
  ok(/if \(msg\.seq <= this\._lastRemoteSeq\)|_lastRemoteSeq/.test(lj) && /this\._userDirty = false;\n    setTimeout\(\(\) => \{ this\._restoring = false; \}, 1000\);/.test(lj), '§6b guard 1+2: the seq gate and the user-dirty clear at the end of _applyRemoteState are in place');
  ok(/if \(this\._pointerDown\) \{ this\._pendingRemote = msg; return; \}/.test(lj), '§6b guard 3: defer-while-interacting is in place');
  ok(/Date\.now\(\) - this\._lastUserInputAt > 60000/.test(lj) && /if \(json === this\._lastSentJson\) return;/.test(lj), '§6b guard 2 (60 s expiry) + 4 (no-op guard) are in place');
  const css = read('public/style.css');
  ok(/\.window\.tab-split \{ display: grid;/.test(css) && /\.window\.tab-split > \.tab-split-divider \{/.test(css), 'the split renders as the host grid with a divider (stylesheet)');
  ok(/@media \(max-width: 768px\) \{\n  \.window\.tab-split \{ display: flex !important; \}\n  \.window\.tab-split > \.window-content\.tab-split-pane:not\(\.tab-split-focus\) \{ display: none !important; \}/.test(css), '≤768px: the phone shows only the focused pane (tabs only) — by stylesheet, the model untouched');
  ok(!/\.win-owner-dot \{[^}]*#[0-9a-f]{3,6}/i.test(css), 'the badge dot rule carries no literal colour (the per-session colour is data, set inline)');
}

console.log(`\n${fail ? 'FAIL' : 'ALL PASS'} (${pass} passed, ${fail} failed)`);
process.exit(fail ? 1 : 0);
