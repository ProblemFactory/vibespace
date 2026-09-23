#!/usr/bin/env node
// Fold-dominated trim guard (inc-mtajy6wr "上翻的时候出现大量白屏", 2.368.29):
// with semantic collapse folding whole tool/agent runs, a 150-message window
// can render shorter than the viewport — trimBottom then removes the only
// VISIBLE content and every wheel-tick teleports the window 50 messages
// through fold-space on a white screen (captured: extendTop:done sh=787=ch
// every ~0.5s, ws 4572→4036). The guard: while the rendered window is
// shorter than ~2 viewports, the cap grows to 600 instead of trimming.
// DOM-heavy machinery has no functional harness — these pins keep the guard
// (and its symmetry) from being refactored away silently.
import fs from 'node:fs';
import path from 'node:path';
import { judgeGesture, PAGE_UP_BAND_PX, DELIVERY_MIN_FRACTION } from './paging-gesture-rules.mjs';
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
const cv = fs.readFileSync(path.join(REPO, 'src/lib/chat-view.js'), 'utf8');
// chat-view imports telemetry-client → build-version.js, which `npm run build`
// GENERATES (gitignored); ci.mjs builds before any suite runs.
if (!fs.existsSync(path.join(REPO, 'src/lib/build-version.js'))) {
  console.error('src/lib/build-version.js is missing — run `npm run build` first (it is a generated file)');
  process.exit(1);
}

// 2.369.129 (inc-mub8xwrb-z57x): the 2.368.29 residual ("a single fold run longer than
// 600 re-enters the slide regime") was SEEN — at the bound every extend trimmed the
// visible bottom and the reader landed on the top of the previous slab; 2.369.129
// refused any trim under three viewports and made _extendTop grow by height.
// inc-mubvu3a4-x8sb (the 976 MB compact-mode session, 2026-09-21) then showed that
// gate measuring the WHOLE window — including the content it was about to remove —
// and trimming BY COUNT to 150: `trimBottom n:400 removed:250 sh:2851 sh2:972` took
// the anchor with it, the delta fallback clamped scrollTop to 0 and the grow loop
// refilled and trimmed again (750–1,300 messages walked per wheel notch). THE TRIM IS
// BY HEIGHT NOW: one implementation for both edges, a KEEP ZONE around the viewport
// nothing inside is ever removed from, a soft card target, and the fold ceiling as
// the one hard bound.
const sk = fs.readFileSync(path.join(REPO, 'src/lib/chat-view-seek.js'), 'utf8');
const rulesSrc = fs.readFileSync(path.join(REPO, 'scripts/paging-gesture-rules.mjs'), 'utf8');
const pagingSrc = fs.readFileSync(path.join(REPO, 'scripts/test-chat-paging.mjs'), 'utf8');
const dbgSrc = fs.readFileSync(path.join(REPO, 'scripts/dbg-huge-paging.mjs'), 'utf8');
const hugeSrc = fs.readFileSync(path.join(REPO, 'scripts/huge-transcript-fixture.mjs'), 'utf8'); // the §1c generator's home since it is shared with test-ax-budget
ok('ONE trim implementation for both edges (_trimEdge) — _trimBottom / _trimTop are its two spellings', /_trimEdge\(side\) \{/.test(cv) && /_trimBottom\(\) \{ return this\._trimEdge\('bottom'\); \}/.test(cv) && /_trimTop\(\) \{ return this\._trimEdge\('top'\); \}/.test(cv));
ok('the keep zone is ONE named number of viewports on each side of the viewport, read through _keepZone — and the seek trim (chat-view-seek _trimGapDom) reads the same one', /const TRIM_KEEP_VIEWPORTS = 1;/.test(cv) && /_keepZone\(\) \{/.test(cv) && /top: st - ch \* TRIM_KEEP_VIEWPORTS, bottom: st \+ ch \* \(1 \+ TRIM_KEEP_VIEWPORTS\)/.test(cv) && /const zone = this\._keepZone\(\);\s*const pos = this\._cardPositions\(els\);/.test(sk));
ok('the card target is SOFT (TRIM_SOFT_CARDS) and the zone wins: the bottom loop stops at the first card whose top is inside the zone, the top loop at the first card whose bottom is', /const TRIM_SOFT_CARDS = 150;/.test(cv) && /if \(n >= must && pos\[i\]\.top < zone\.bottom\) break;/.test(cv) && /if \(n >= must && pos\[i\]\.bottom > zone\.top\) break;/.test(cv));
ok('the ceiling is ONE named number ≥ 2000 (fold members are display:none — cheap) and the only thing that removes INSIDE the zone (`must`)', /const FOLD_DOM_CEILING = (\d+);/.test(cv) && Number(cv.match(/const FOLD_DOM_CEILING = (\d+);/)[1]) >= 2000 && /const must = Math\.max\(0, els\.length - FOLD_DOM_CEILING\);/.test(cv));
ok('the pre-fix COUNT trim is gone: no `maxRendered` parameter, no three-viewport gate, no bare `.chat-msg` selector (a nested card could match)', !/_trimBottom\(maxRendered/.test(cv) && !/_trimTop\(maxRendered/.test(cv) && !/scrollHeight < list\.clientHeight \* 3/.test(cv) && /querySelectorAll\(':scope > \.chat-msg:not\(\.chat-gap-msg\)'\)/.test(cv));
ok('folded cards take the span of the nearest VISIBLE thing above them — _cardPositions, one layout pass, reads only', /_cardPositions\(els\) \{/.test(cv) && /if \(h > 0 && c\.offsetParent !== null\) \{ lastTop = c\.offsetTop; lastBottom = lastTop \+ h; \}/.test(cv));
ok('_extendTop grows by the history ABOVE THE VIEWPORT (the restored scrollTop), not the whole window\'s height: a bounded loop (never while pinned, never past the top), doubling the slab, naming the landing once', /let slab = count, passes = 0;\s*for \(;;\) \{/.test(cv) && /const short = above < this\._messageList\.clientHeight;/.test(cv) && /if \(!short \|\| this\._pinned \|\| this\._windowStart <= 0 \|\| passes >= FOLD_GROW_PASSES \|\| !msgs\.length\)/.test(cv) && /slab = Math\.min\(200, slab \* 2\);/.test(cv) && /_trace\('extendTop:grown'/.test(cv));
ok('_extendBottom grows by the content BELOW THE VIEWPORT — the mirror loop under the same bound', /const short = below < list\.clientHeight;/.test(cv) && /if \(!short \|\| this\._windowEnd >= this\._total \|\| passes >= FOLD_GROW_PASSES \|\| !msgs\.length\)/.test(cv) && /_trace\('extendBottom:grown'/.test(cv));
ok('all three incidents are named at the trim (future readers find the bundles)', /inc-mtajy6wr/.test(cv) && /inc-mub8xwrb-z57x/.test(cv) && /inc-mubvu3a4-x8sb/.test(cv));
ok('_extendTop measures the fresh slab and folds INSIDE the anchored landing, and trims AFTER it (a trim that reads the restored scrollTop cannot take the anchor with it), re-folding after a trim', /this\._reserveFreshHeights\(fresh\);[\s\S]{0,400}this\._updateRuns\(\);\s*\}\);[\s\S]{0,1600}if \(this\._pinned\) this\._trace\('trimSkipPinned'[\s\S]{0,200}this\._trimBottom\(\); if \(this\._windowEnd !== before\) this\._updateRuns\(\);/.test(cv));
ok('_extendBottom folds BEFORE its trim and re-folds after one (the downward mirror of the 2.369.129 order defect — the owner\'s `trimTop removed:351 anchored:false`)', /this\._reserveFreshHeights\(fresh\);[\s\S]{0,500}this\._updateRuns\(\);\s*\{ const before = this\._windowStart; this\._trimTop\(\); if \(this\._windowStart !== before\) this\._updateRuns\(\); \}/.test(cv));
ok('the trim trace tags survive with their decision inputs (the capture channel that caught all three)', cv.includes("'trimBottom' : 'trimTop'") && /zone: \[Math\.round\(zone\.top\), Math\.round\(zone\.bottom\)\]/.test(cv) && cv.includes("_trace('extendTop:done'") && cv.includes("_trace('trimSkipZone'"));
ok('a fresh slab is rendered ONCE at insert so the landing and the zone read MEASURED heights (content-visibility placeholders are estimates) — the override comes off two frames later, after the remembered size is recorded', /_reserveFreshHeights\(els(, \{ live = false \} = \{\})?\) \{/.test(cv) && /el\.style\.contentVisibility = 'visible';/.test(cv) && /requestAnimationFrame\(\(\) => requestAnimationFrame\(\(\) => \{/.test(cv));
ok('PINNED ⇔ AT THE LIVE TAIL: the pin predicate carries windowEnd ≥ total and not-teleported, and every pin site reads it (scroll handler, run-bar landing, the read-only scroll button)', /_atLiveTail\(scrollTop, scrollHeight, clientHeight\) \{\s*return !this\._teleported && this\._windowEnd >= this\._total && scrollHeight - scrollTop - clientHeight < 50;/.test(cv) && /const atTail = atBottom && this\._atLiveTail\(scrollTop, scrollHeight, clientHeight\);\s*if \(atTail && !this\._pinned\) \{/.test(cv) && /const atBottom = this\._atLiveTail\(list\.scrollTop, list\.scrollHeight, list\.clientHeight\);/.test(cv) && /\(this\._readOnly \|\| !this\.sessionId\) && !\(this\._windowEnd < this\._total && this\._canPaginate\)/.test(cv));
ok('the viewport anchor never picks the seek sentinel (a huge session\'s first child) — at the top edge it is the first VISIBLE card, delta included', /const skip = \(c\) => runChrome\(c\) \|\| c\._isSeekSentinel;/.test(cv) && !/\} else if \(list\.children\.length\) \{/.test(cv) && /if \(!el && list\.children\.length\) \{ el = list\.children\[0\]; delta = 0; \}/.test(cv));
// ── SHORT-VIEW RESCUE after attach (2.369.43) ───────────────────────────────
// The 2.369.36 gate `_windowStart > 0 && rendered < 30 && sh <= ch` was
// UNSATISFIABLE: every attach path ships tail(50) (ws-handler `_normalizer
// .tail(50)`, transcripts.page), `_windowStart > 0` holds EXACTLY when those
// 50 arrived, and the semantic fold HIDES members (`.chat-run-collapsed`,
// display:none) instead of removing them — measured over 33 real production
// transcripts with total>50: 50 of 50 tail messages render a `.chat-msg`
// child, min 50. So the rescue never fired for anyone, and the case it exists
// for — a fold-dominated slab shorter than the viewport, with NO scrollable
// range and therefore no scroll events (and no wheel path at all on touch) —
// was a dead end. Re-derived: corroborate the geometry across the settle
// window (the transient collapsed-geometry artifact resolves inside ~1.5s,
// the same premise collapsedGeomSkip runs on) and keep only the harm bound.
ok('the unsatisfiable `rendered < 30` gate is gone from the code (it made the rescue dead code)', !/rendered < 30 &&/.test(cv) && !/this\._windowStart > 0 && rendered/.test(cv));
ok('the rescue is a named predicate + a two-reading schedule', /_shortViewNeedsFill\(list\) \{/.test(cv) && /_scheduleAttachFill\(\) \{/.test(cv) && /this\._scheduleAttachFill\(\);/.test(cv));
const disposeBody = cv.slice(cv.indexOf('\n  dispose() {'));
ok('…both timers are cleared on dispose (no rescue against a torn-down view)', /clearTimeout\(this\._autoFillT1\)/.test(disposeBody) && /clearTimeout\(this\._autoFillT2\)/.test(disposeBody));

// FUNCTIONAL: chat-view.js is DOM-free at import, so the decision runs here
// against fake geometry (the whole point — the pre-fix gate looked plausible
// in review and was arithmetically impossible in production).
const { ChatView } = await import(path.join(REPO, 'src/lib/chat-view.js'));
const mkList = (rendered, sh, ch) => ({ scrollHeight: sh, clientHeight: ch, querySelectorAll: () => ({ length: rendered }) });
const decide = (state, list) => ChatView.prototype._shortViewNeedsFill.call(state, list);
const attached = { _windowStart: 4550, _suspended: false, _disposed: false, _teleported: false };
ok('THE CASE: a fold-dominated attach slab (50 cards collapsed into run headers, 240px in a 700px viewport) asks for one page', decide(attached, mkList(50, 240, 700)));
ok('…and the OLD gate refused exactly that (rendered 50 ≥ 30) — the regression this pins', !(attached._windowStart > 0 && 50 < 30 && 240 <= 700));
ok('a normal attach that already fills the viewport asks for nothing', !decide(attached, mkList(50, 6000, 700)));
ok('a window with no history above it asks for nothing', !decide({ ...attached, _windowStart: 0 }, mkList(50, 240, 700)));
ok('a desktop-hidden (suspended) window decides nothing — its geometry is meaningless (inc-mtd1d0ft)', !decide({ ...attached, _suspended: true }, mkList(50, 240, 700)));
ok('a disposed view decides nothing', !decide({ ...attached, _disposed: true }, mkList(50, 240, 700)));
ok('teleport mode is left to its own seek paths (window indices are stale there)', !decide({ ...attached, _teleported: true }, mkList(50, 240, 700)));
ok('the harm bound holds: never extend where the extra page could trip a trim and eat the live tail (inc-mtox23xw)', !decide(attached, mkList(120, 240, 700)));

// FUNCTIONAL: the two-reading corroboration (the artifact the 2.369.36 fix saw
// was a TALL pinned window reading sh<=ch while heights were unresolved).
const runFill = async (frames, mutate) => {
  let extended = 0;
  const state = Object.assign(Object.create(ChatView.prototype), {
    _windowStart: 4550, _suspended: false, _disposed: false, _teleported: false,
    _lastStructuralAt: 1000, _messageList: frames[0], _trace: () => {},
    _extendTop: () => { extended++; },
  });
  ChatView.prototype._scheduleAttachFill.call(state);
  await new Promise((r) => setTimeout(r, 800));
  state._messageList = frames[1];
  if (mutate) mutate(state);
  await new Promise((r) => setTimeout(r, 1100));
  return extended;
};
const short = mkList(50, 240, 700), tall = mkList(50, 6000, 700);
const [genuine, artifact, mutated] = await Promise.all([
  runFill([short, short]),
  runFill([short, tall]),                                       // heights resolved between the readings
  runFill([short, short], (s) => { s._lastStructuralAt = 99999; }), // paging/trim ran in between
]);
ok('a view still short at BOTH readings extends exactly once', genuine === 1);
ok('a view whose heights resolve between the readings (the 2.369.36 artifact) never extends', artifact === 0);
ok('a structural change between the readings hands the decision back to the paging machinery', mutated === 0);

// ── suspend gate (inc-mtd1d0ft "桌面切换卡死30-60s"): a desktop-hidden chat
// window's geometry is meaningless — the paging machinery must make no
// decisions off it, and a switch re-measures 4-6 windows at once.
ok('ChatView.setSuspended exists and arms the structural settle window on resume', /setSuspended\(on\) \{/.test(cv) && /this\._lastStructuralAt = Date\.now\(\);/.test(cv.slice(cv.indexOf('setSuspended'))));
ok('resume returns a pinned view to the LIVE tail — behind-the-tail windows take the full jumpToBottom (inc-mtfi6034 mobile old-position), and it does NOT stamp a user navigation over its own series',
  /this\._windowEnd < this\._total\) this\.jumpToBottom\(\{ user: false \}\);/.test(cv.slice(cv.indexOf('setSuspended'))));
// four paging entries: extendTop / extendBottom / the scroll handler's
// decisions / the short-view rescue (which answers `false`, not `return`)
ok('all four paging entries gate on _suspended (extendTop/extendBottom/scroll decisions/short-view rescue)',
  (cv.match(/this\._suspended(?: \|\| this\._disposed)?\) return(?: false)?;/g) || []).length >= 4);
const dm = fs.readFileSync(path.join(REPO, 'src/lib/desktop-manager.js'), 'utf8');
ok('desktop hide/show wires the suspend flag', (dm.match(/setSuspended\?\.\((true|false)\)/g) || []).length === 2);
ok("hidden chat windows get content-visibility:hidden (state-preserving render skip — the switch-jank render leg, inc-mtd54h45)", /contentVisibility = 'hidden'/.test(dm) && /win\.type === 'chat'/.test(dm));
ok('stage un-hide paths resume too (direct _hiddenByDesktop writers)', (fs.readFileSync(path.join(REPO, 'src/lib/stage-manager.js'), 'utf8').match(/setSuspended\?\.\(false\)/g) || []).length === 2);
const ap = fs.readFileSync(path.join(REPO, 'src/lib/app.js'), 'utf8');
ok('the legacy dialog overlay closes only when the interaction STARTED on it (inc-mtd1c2sd select-drag)', /_downOnOverlay = e\.target === overlay/.test(ap) && /e\.target === overlay && _downOnOverlay/.test(ap));

// ── reconnect no-op (inc-mtd2pg6x "刚刚又卡死了": ws reconnect re-attaches
// every session; identical slabs must not rebuild N windows' DOM)
ok('loadHistory skips the rebuild for an IDENTICAL slab (same epoch/total/tail ids, tail-anchored)', /loadHistory:identical-skip/.test(cv) && /lastCur\.id === lastNew\.id/.test(cv) && /this\._windowEnd === this\._total/.test(cv));
ok('…the skip still applies meta/status/live state and the typing indicator', /identical-skip[\s\S]{0,900}applyStatus\(meta\.chatStatus\)[\s\S]{0,600}_applyLiveMeta\?\.\(meta\)/.test(cv));

// ── the RESUME transition (inc-mtq5bpjt-0o0n "切换桌面后，新桌面的窗口内容跳到
// 历史消息了"): suspending covered the HIDDEN state; the un-hide TRANSITION was
// unguarded, and the ONE upward-paging entry point with no gate at all — the
// gap sentinel's IntersectionObserver → _loadEarlierGap's tail-mode branch —
// paged three PINNED windows into history with zero user input. The end-to-end
// reproduction (with the negative control that proves the path is exercised)
// lives in scripts/test-desktop-resume-paging.mjs; these pin the mechanism.
ok('the gap path has ONE gate predicate, _autoPagingBlocked (never re-invented per entry point)',
  /_autoPagingBlocked\(\) \{/.test(cv));
ok('…and it names every law the scroll handler obeys (suspend / resume-settle / pin / settle / no-input)',
  ["'suspended'", "'resume-settle'", "'pinned'", "'settling'", "'no-input'"].every((r) => cv.includes(r)));
ok('_loadEarlierGap applies the gate BEFORE its tail-mode _extendTop branch (the guard sits on the path that is alive in the failure state)',
  /if \(auto\) \{[\s\S]{0,220}_autoPagingBlocked\(\)[\s\S]{0,220}\}[\s\S]{0,400}this\._windowStart > 0\) \{ await this\._extendTop\(\); return; \}/.test(sk));
ok('…and traces WHY it refused (gapSkip + reason, so the tracer shows the refusal)', /_trace\?\.\('gapSkip', \{ why, via \}\)/.test(sk));
ok('the sentinel IntersectionObserver goes through _loadEarlierGap as an AUTOMATIC caller (never a bare _extendTop)',
  /isIntersecting\) continue;[\s\S]{0,900}this\._loadEarlierGap\(entry\.target, null, \{ via: 'io' \}\)/.test(cv));
ok('an explicit RETRY click bypasses the gate (auto: false — a click is intent)', /_loadEarlierGap\(markerEl, btn, \{ auto: false \}\)/.test(sk));
ok('the scroll/wheel-driven _maybeSeekEarlier is an automatic caller too', /_maybeSeekEarlier\(\) \{[\s\S]{0,700}_loadEarlierGap\(s, null\);\s*\/\/ AUTOMATIC/.test(sk));
ok('setSuspended(false) arms the resume settle window — WITH the re-tail timer\'s slack, so nothing can decide in the gap between the window expiring and the re-tail running',
  /_applySuspend\(on\) \{[\s\S]{0,900}this\._resumeAt = Date\.now\(\);\s*this\._resumeSettleUntil = this\._resumeAt \+ RESUME_SETTLE_MS \+ RESUME_RETAIL_SLACK_MS;/.test(cv) // 2.369.112: the body lives in _applySuspend (setSuspended = the desktop reason of the hidden set, test-hidden-view-suspend)
  && /const RESUME_RETAIL_SLACK_MS = 40;/.test(cv));
ok('…and the pinned re-tail is a BOUNDED SERIES, not a one-shot cliff (round-2: an input-less displacement at resume+1400ms still stranded the window 3/3 — +1240/+1280 only survived on _forceScrollToBottom\'s 10-frame chain)',
  /const RESUME_RETAIL_AT_MS = \[RESUME_SETTLE_MS \+ RESUME_RETAIL_SLACK_MS, 2000\];/.test(cv)
  && /this\._resumeRetailTimers = RESUME_RETAIL_AT_MS\.map\(\(ms\) => setTimeout\(reTail, ms\)\);/.test(cv)
  && /_clearResumeRetail\(\) \{[\s\S]{0,160}clearTimeout\(tm\)/.test(cv)
  && /this\._clearResumeRetail\(\);/.test(cv.slice(cv.indexOf('\n  dispose() {'))));
ok('…and the pin SNAPSHOT outlives the last re-tail, so the unpin gate keeps its evidence for the whole displacement horizon',
  /const RESUME_DISPLACEMENT_MS = 2800;/.test(cv)
  && /setTimeout\(\(\) => \{ this\._pinnedAtSuspend = false; \}, RESUME_DISPLACEMENT_MS\)/.test(cv));
ok('…and it asserts off the pin SNAPSHOT taken when the window was HIDDEN (a transitional unpin during the resume must not strand the window in history)',
  /this\._pinnedAtSuspend = this\._pinned;/.test(cv)
  && /if \(!this\._pinned && !this\._pinnedAtSuspend\) return;/.test(cv)
  && /if \(this\._pinned \|\| this\._pinnedAtSuspend\) \{/.test(cv));
// ORDER pin. The settle return moved BELOW the run-bar readout (round-2
// minor: returning above it froze the 2.369.45 floating bar for the whole
// 1.24s settle) and stays ABOVE every pin/paging decision; round 3 puts the
// scrollbar-drag stamp between the programmatic return and the settle (the
// drag must be able to end the very settle it starts inside). Budgets per
// segment: suspend→runBar ≤400 (was one 700 hop to the settle),
// runBar→programmatic ≤200, programmatic→drag ≤700 (round 4 explains the
// gutter re-key there), drag→settle ≤1400 (the comment block that explains why
// the readout comes first), settle→atBottom ≤2400. The budgets bound DISTANCE,
// not prose — raise one when a comment legitimately grows; what is pinned is
// the ORDER.
ok('the scroll handler updates the run-bar READOUT first, stamps a scrollbar DRAG, then no-ops for the settle BEFORE it touches the pin (transitional geometry must not unpin)',
  /this\._suspended\) return;[\s\S]{0,400}this\._updateRunBar\(scrollTop\);[\s\S]{0,200}this\._programmaticScroll\) return;[\s\S]{0,700}this\._pointerDragScroll\(scrollTop\)\)[\s\S]{0,1400}Date\.now\(\) < \(this\._resumeSettleUntil \|\| 0\)\) return;[\s\S]{0,2400}const atBottom =/.test(cv));
ok('…and the UNPIN itself is gated on positive evidence for the rest of the horizon (the settle alone was a one-shot cliff)',
  /if \(this\._pinned && this\._resumeDisplacement\(\)\) \{[\s\S]{0,260}_scrollToBottom\(\);\s*return;\s*\}[\s\S]{0,200}this\._pinned = false;/.test(cv)
  && /_resumeDisplacement\(\) \{/.test(cv));
ok('the loadHistory auto-fill DEFERS through the settle instead of deciding on transitional geometry',
  /const tryAutoFill = \(retries\) => \{[\s\S]{0,400}this\._resumeSettleUntil \|\| 0\) - Date\.now\(\)[\s\S]{0,200}tryAutoFill\(retries - 1\)/.test(cv));
ok('a POSITIONING act clears the settle AND the pin snapshot (the settle only suppresses input-LESS displacement, it never fights a reader who MOVED the view)',
  /_notePositioning\(via\) \{[\s\S]{0,320}this\._lastPositionAt = now;[\s\S]{0,600}this\._endResumeSettle\(\);/.test(cv)
  && /_endResumeSettle\(\) \{ this\._resumeSettleUntil = 0; this\._pinnedAtSuspend = false; this\._clearResumeRetail\(\); \}/.test(cv));

// ── ROUND 3, THE MAJOR (reproduced with TRUSTED CDP input): a plain
// left-click/tap in the message list during the 1.24s settle ran the FULL
// _endResumeSettle() — window + pin snapshot + re-tail series — so the
// resume's own input-LESS displacement, arriving a beat later behind the
// click, reproduced the incident. A click is not a positioning act: it says
// where the reader IS, not that the view moved.
ok('a bare CLICK / non-navigation key only stamps input and ends the settle WINDOW — the pin snapshot and the re-tail series survive it',
  /_noteUserInput\(\) \{\s*this\._lastUserScrollAt = Date\.now\(\);\s*this\._resumeSettleUntil = 0;/.test(cv)
  && !/_noteUserInput\(\) \{[\s\S]{0,200}_pinnedAtSuspend|_noteUserInput\(\) \{[\s\S]{0,200}_clearResumeRetail/.test(cv));
ok('…and the message-list listeners route by GRADE: wheel/touchmove/navigation keys position, pointerdown and other keys merely input',
  /addEventListener\('wheel', \(e\) => \{[\s\S]{0,400}this\._notePositioning\('wheel'\);/.test(cv)
  && /addEventListener\('touchmove', \(\) => this\._notePositioning\('touch'\)/.test(cv)
  && /addEventListener\('pointerdown', \(e\) => \{\s*this\._noteUserInput\(\);\s*this\._pointerDownOnScrollbar = this\._pointerOnScrollbar\(e\);\s*this\._pointerDownScrollTop = this\._messageList\.scrollTop;/.test(cv)
  && /if \(NAV_KEYS\.includes\(e\.key\)\) this\._notePositioning\('key'\);\s*else this\._noteUserInput\(\);/.test(cv)
  && /const NAV_KEYS = \['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'PageDown', 'PageUp', 'Home', 'End', ' '\];/.test(cv));
// ── ROUND 4: the drag signature is WHERE the press landed, never WHEN a
// scroll follows it. The 400ms window had two MAJORs: the resume's OWN
// input-less displacement (the incident's re-measure bounces at +366…+602ms)
// landing inside a plain content click's window was read as a drag — the click
// then disarmed the snapshot + series and the incident reproduced behind it —
// and a real drag whose first move came later than the window was never
// positioning at all, so the re-tail series yanked that reader back (a NEW harm
// vs master). The press now carries a gutter FLAG for its whole lifetime.
ok('…and a SCROLLBAR DRAG is keyed on the GUTTER the press landed in (position), not on a time window after any pointerdown',
  /_pointerDragScroll\(scrollTop\) \{\s*if \(!this\._pointerDownOnScrollbar\) return false;\s*return Math\.abs\(scrollTop - \(this\._pointerDownScrollTop \|\| 0\)\) > POINTER_DRAG_PX;/.test(cv)
  && /_pointerOnScrollbar\(e\) \{/.test(cv)
  && /this\._pointerDragScroll\(scrollTop\)\) this\._notePositioning\('scrollbar-drag'\);/.test(cv));
ok('…the time-window signature is GONE (POINTER_DRAG_MS / _pointerDownAt cannot come back by accident)',
  !/POINTER_DRAG_MS/.test(cv) && !/_pointerDownAt/.test(cv));
ok('…the gutter hit-test measures the strip the CONTENT box does not reach, in LAYOUT px (uiScale zoom scales the rect, not clientWidth — the 2.369.5 VNC-pointer class), and handles RTL + a horizontal gutter',
  /const scale = list\.offsetWidth \? \(r\.width \/ list\.offsetWidth\) : 1;/.test(cv)
  && /const vGutter = list\.offsetWidth - list\.clientWidth - bl - br;/.test(cv)
  && /const hGutter = list\.offsetHeight - list\.clientHeight - bt - bb;/.test(cv)
  && /rtl = cs\.direction === 'rtl';/.test(cv));
ok('…and the press is CLEARED on pointerup/pointercancel, window-scoped on the winInfo AbortController (a drag routinely releases outside the list) and removed on dispose',
  /window\.addEventListener\('pointerup', this\._endPointerPress, \{ passive: true, signal: pressSignal \}\);/.test(cv)
  && /window\.addEventListener\('pointercancel', this\._endPointerPress, \{ passive: true, signal: pressSignal \}\);/.test(cv)
  && /const pressSignal = winInfo\?\._listenerCtl\?\.signal;/.test(cv)
  && /this\._endPointerPress = \(\) => \{ this\._pointerDownOnScrollbar = false; \};/.test(cv)
  && /window\.removeEventListener\('pointerup', this\._endPointerPress\);/.test(cv.slice(cv.indexOf('\n  dispose() {'))));

// ── ROUND 2, THE MAJOR: only the four message-list listeners ended the settle,
// so a reader who navigated through a surface that is NOT the list — the
// minimap (its pointer events live on the container), a search reveal, the
// floating run bar (this._container), jumpToIndex — was YANKED back to the
// live tail by the 1240ms re-tail (measured: jump at +400ms → pinned at the
// tail at +2600ms). Every such entry point stamps and ends the settle, and the
// re-tail compares nav-vs-resume: the chat-view-seek `userScrolled` idiom.
ok('there is ONE navigation stamp (_noteUserNav) and it ends the settle like a wheel does',
  /_noteUserNav\(via\) \{[\s\S]{0,220}this\._lastNavAt = Date\.now\(\);[\s\S]{0,220}this\._endResumeSettle\(\);/.test(cv));
ok('…and the reader-position test generalises the seek idiom over every POSITIONING stamp (positioning act, nav, jump landing, search reveal) — and reads _lastUserScrollAt NOWHERE, because a click is not one (round 3)',
  /_navigatedSince\(since\) \{[\s\S]{0,500}this\._lastNavAt \|\| 0[\s\S]{0,120}this\._lastPositionAt \|\| 0[\s\S]{0,160}this\._lastJumpAt \|\| 0[\s\S]{0,160}this\._search\?\._lastRevealAt \|\| 0[\s\S]{0,60}> since;/.test(cv)
  && !/_navigatedSince\(since\) \{[\s\S]{0,500}_lastUserScrollAt/.test(cv));
ok('the resume re-tail BAILS when the reader navigated after the resume (never yank a reader back to the tail)',
  /const resumeAt = this\._resumeAt;[\s\S]{0,400}if \(this\._navigatedSince\(resumeAt\)\) return;/.test(cv));
ok('every off-list navigation surface stamps: minimap (index + time), search reveal, run-bar landing, jumpToIndex, user jumpToBottom',
  /_noteUserNav\('minimap'\); return this\.jumpToIndex/.test(cv)
  && /_noteUserNav\('minimap-time'\); return this\._jumpToFileTime/.test(cv)
  && /onNav: \(\) => this\._noteUserNav\('search-reveal'\)/.test(cv)
  && /_landOnHeader\(run\) \{[\s\S]{0,400}this\._noteUserNav\('runBar'\);/.test(cv)
  && /async jumpToIndex\(targetIdx\) \{\s*this\._noteUserNav\('jumpToIndex'\);/.test(cv)
  && /async jumpToBottom\(\{ user = true \} = \{\}\) \{\s*if \(user\) this\._noteUserNav\('jumpToBottom'\);/.test(cv));
{
  const sch = fs.readFileSync(path.join(REPO, 'src/lib/chat-search.js'), 'utf8');
  ok('…and ChatSearch actually calls it on a REVEAL (the reveal scrolls the list from outside its own listeners)',
    /this\._onNav = onNav \|\| null;/.test(sch) && /this\._lastRevealAt = Date\.now\(\);\s*this\._onNav\?\.\(\);/.test(sch));
  ok('…and the minimap time landing stamps in the seek module too', /_jumpToFileTime\(ts, line\) \{\s*this\._noteUserNav\('jumpToFileTime'\);/.test(sk));
}
ok('INVARIANT a pinned view never loses its tail: _extendTop skips trimBottom while pinned',
  /if \(this\._pinned\) this\._trace\('trimSkipPinned'[\s\S]{0,200}else \{ const before = this\._windowEnd; this\._trimBottom\(\);/.test(cv));
ok('…and re-asserts the tail after the prepend (the anchor restore fails under transitional geometry: anchored:false, scrollTop 0)',
  /if \(this\._pinned\) \{ this\._trace\('pinnedRetail'[\s\S]{0,80}this\._scrollToBottom\(\); \}/.test(cv));
ok('the incident is named at the fix (future readers find the bundle)', /inc-mtq5bpjt-0o0n/.test(cv) && /inc-mtq5bpjt-0o0n/.test(sk));

// ── B-9702 (round 5): OUR OWN SCROLL CHAIN IS AUTOMATIC REPOSITIONING ───────
// `_forceScrollToBottom` writes `scrollTop = scrollHeight` for up to 10 frames
// (~166ms). Round 2 cancelled the re-tail TIMERS on a positioning act and left
// that chain running, so a rung armed at resume+1240ms was still writing when
// the reader wheeled up at +1400ms: one of its frames landed 3ms AFTER the
// reader's own scroll, the pin re-engaged off that position (trace `repin
// st:1760 sh:2468 ch:708 … posAgo:3` — ordinary geometry, sh-ch = 2.5
// viewports, no collapsedGeomSkip) and `_extendTop`'s pinned-tail invariant
// re-asserted the bottom. Measured 5/20 on the pre-fix build, 0/20 after.
// The end-to-end reproduction + its per-mechanism control live in
// test-desktop-resume-paging.mjs; these are the DOM-free semantics, which is
// where the two ways of getting this wrong (a cancel that kills auto-follow
// for good, a mute that lifts before its own last write is delivered) are
// cheap to pin.
ok('a POSITIONING act and an off-list NAVIGATION both cancel the chain — a bare CLICK does not (it moved nothing)',
  /_notePositioning\(via\) \{[\s\S]{0,600}this\._cancelForcedScroll\(via\);/.test(cv)
  && /_noteUserNav\(via\) \{[\s\S]{0,300}this\._cancelForcedScroll\(via\);/.test(cv)
  && !/_noteUserInput\(\) \{[\s\S]{0,200}_cancelForcedScroll/.test(cv));
{
  const realRaf = globalThis.requestAnimationFrame;
  let frames = [];
  globalThis.requestAnimationFrame = (cb) => { frames.push(cb); return frames.length; };
  const drain = (n) => { for (let i = 0; i < n && frames.length; i++) frames.shift()(); };
  const mkList = () => ({ scrollTop: 0, scrollHeight: 5000, clientHeight: 700 });
  const mkView = (list) => Object.assign(Object.create(ChatView.prototype), {
    _messageList: list, _disposed: false, _trace: () => {},
  });
  try {
    // ① the chain writes and mutes
    let list = mkList(), v = mkView(list);
    v._forceScrollToBottom();
    drain(1);
    ok('unit: the force-scroll chain writes scrollTop each frame and mutes the boundary decision while it runs',
      list.scrollTop === 5000 && v._programmaticScroll === true && v._fsbActive === true);
    // ② a reader cancels it: no further write, mute released, flag down
    v._cancelForcedScroll?.('wheel');
    list.scrollTop = 123;                       // the reader's own position
    drain(20);
    ok('unit: a cancelled chain writes NOTHING more — the reader\'s position stands (the queued frames find themselves orphaned)',
      list.scrollTop === 123 && v._fsbActive === false && v._programmaticScroll === false);
    // ③ …and auto-follow is not dead afterwards (the regression an epoch-less
    //    cancel would cause: a pinned view that never follows the stream again)
    v._forceScrollToBottom();
    drain(1);
    ok('unit: auto-follow still works after a cancel — the next _forceScrollToBottom starts a fresh chain',
      list.scrollTop === 5000 && v._fsbActive === true);
    // ④ the mute outlives the LAST write by one frame (a scroll event is
    //    delivered after the callback that wrote scrollTop)
    // (since inc-mudv05ja-n5rv a steady scrollHeight CONVERGES the chain after
    // three frames — write, then two unchanged reads — instead of ten writes)
    list = mkList(); v = mkView(list); frames = [];
    v._forceScrollToBottom();
    drain(3);                                    // write · steady · steady ⇒ converged
    ok('unit: after the final write the chain is over but the mute is STILL up — its own scroll event has not been delivered yet',
      v._fsbActive === false && v._programmaticScroll === true && frames.length === 1);
    drain(1);
    ok('unit: …and one frame later the mute lifts (no permanent mute, ever)', v._programmaticScroll === false);
    // ⑤ a chain restarted inside that trailing frame keeps ITS mute
    list = mkList(); v = mkView(list); frames = [];
    v._forceScrollToBottom();
    drain(3);
    v._forceScrollToBottom();                    // a live append while pinned, in the gap
    drain(2);
    ok('unit: a chain restarted in that trailing frame keeps its own mute (the release is guarded on _fsbActive)',
      v._programmaticScroll === true && v._fsbActive === true);
    // ⑦ THE PIN NEVER WRITES WHEN ALREADY AT THE BOTTOM, AND STOPS ONCE
    //    CONVERGED (inc-mudv05ja-n5rv): the ten-frame rewrite re-followed a
    //    scrollHeight that content-visibility alternated every frame — the
    //    owner's ring shows 12 writes in 197 ms, ±678–836 px. A counting list:
    {
      const mkCounting = (shSeq) => { let st = 0, i = 0; const l = { clientHeight: 700, writes: 0 };
        Object.defineProperty(l, 'scrollHeight', { get: () => shSeq[Math.min(i, shSeq.length - 1)] });
        // the browser's clamp: a shrinking scrollHeight pulls scrollTop down with it
        Object.defineProperty(l, 'scrollTop', { get: () => Math.min(st, Math.max(0, l.scrollHeight - l.clientHeight)), set: (x) => { l.writes++; st = Math.min(x, l.scrollHeight - l.clientHeight); } });
        l.tick = () => { i++; }; return l; };
      // a) already at the bottom: zero writes, chain ends after two steady reads
      let cl = mkCounting([5000]); cl.scrollTop = 4300; cl.writes = 0; frames = [];
      v = mkView(cl); v._forceScrollToBottom(); drain(12);
      ok('unit: a chain step at the bottom writes NOTHING and the chain ends once scrollHeight held still for two frames (3 frames, not 10)',
        cl.writes === 0 && v._fsbActive === false && v._fsbFrames === 3, { writes: cl.writes, frames: v._fsbFrames });
      // b) an A-B-A scrollHeight (a card resolving and re-locking): the old
      //    chain wrote on every frame; the new one ends at the first A-B-A
      const seq = [5000, 5060, 5000, 5060, 5000, 5060, 5000, 5060, 5000, 5060];
      cl = mkCounting(seq); frames = []; v = mkView(cl);
      v._forceScrollToBottom();
      for (let k = 0; k < 12 && frames.length; k++) { frames.shift()(); cl.tick(); }
      const newWrites = cl.writes;
      // CONTROL: the pre-fix step, verbatim semantics (`scrollTop = scrollHeight` every frame for 10)
      const old = mkCounting(seq); for (let k = 0; k < 10; k++) { old.scrollTop = old.scrollHeight; old.tick(); }
      ok(`unit: an alternating scrollHeight is not re-followed every frame — ${newWrites} write(s) vs the pre-fix chain's ${old.writes} (the control reproduces the per-frame chase)`,
        old.writes === 10 && newWrites <= 2 && v._fsbActive === false, { newWrites, old: old.writes });
      // c) a GROWING scrollHeight keeps the chain alive (convergence is its purpose)
      cl = mkCounting([5000, 5200, 5400, 5600, 5800, 6000, 6000, 6000]); frames = []; v = mkView(cl);
      v._forceScrollToBottom();
      for (let k = 0; k < 12 && frames.length; k++) { frames.shift()(); cl.tick(); }
      ok('unit: a growing scrollHeight is followed to the end (every growth frame written, the landing is the real bottom)',
        cl.writes === 6 && cl.scrollTop === 6000 - 700, { writes: cl.writes, st: cl.scrollTop });
    }
    // ⑥ cancelling when no chain of OURS is running touches nothing: a jump
    //    landing (_scrollElStable / _landOnHeader) owns _programmaticScroll
    v = mkView(mkList()); v._programmaticScroll = true;   // a jump landing's mute
    v._cancelForcedScroll?.('wheel');
    ok('unit: with no chain of ours running the cancel touches nothing — a jump landing keeps its own mute',
      v._programmaticScroll === true);
  } finally {
    globalThis.requestAnimationFrame = realRaf;
  }
}

// ── DOM-free UNIT: the decision table itself. The method reads only `this`
// fields and `window`, so the SHIPPED source is lifted out and exercised
// directly — no jsdom, no bundle, and a rewrite that changes the ORDER of the
// reasons (which is the diagnostic value of the trace) fails here.
{
  const start = cv.indexOf('  _autoPagingBlocked() {');
  const end = cv.indexOf('\n  }\n', start);
  ok('the _autoPagingBlocked source is extractable for the unit below', start > 0 && end > start);
  if (start > 0 && end > start) {
    const body = cv.slice(cv.indexOf('{', start) + 1, end);
    const win = {};
    const decide = new Function('window', `return function () {${body}\n}`)(win);
    const NOW = Date.now();
    const clear = () => ({ _pinned: false, _lastStructuralAt: NOW - 9e5, _lastUserScrollAt: NOW - 100, _resumeSettleUntil: 0 });
    const call = (over) => { win.__vsInputResizeAt = 0; win.__vsViewportResizeAt = 0; return decide.call({ ...clear(), ...over }); };
    ok('unit: a clean, recently-scrolled, unpinned view may page', call({}) === null);
    ok('unit: disposed blocks', call({ _disposed: true }) === 'disposed');
    ok('unit: a desktop-HIDDEN view blocks (geometry is meaningless)', call({ _suspended: true }) === 'suspended');
    ok('unit: a just-RESUMED view blocks for the settle window', call({ _resumeSettleUntil: NOW + 500 }) === 'resume-settle');
    ok('unit: a PINNED view blocks — it is at the live tail by definition (THE inc-mtq5bpjt-0o0n case)', call({ _pinned: true }) === 'pinned');
    ok('unit: our own recent structural mutation blocks (it is still moving scrollTop)', call({ _lastStructuralAt: NOW - 200 }) === 'settling');
    ok('unit: no recent user input blocks — displacement is not intent', call({ _lastUserScrollAt: NOW - 5000 }) === 'no-input');
    ok('unit: …and a view that NEVER saw user input blocks too (undefined, not just stale)', call({ _lastUserScrollAt: undefined }) === 'no-input');
    ok('unit: input-box / viewport resize blocks (the 2.338/2.339 displacement doors)',
      (() => { win.__vsInputResizeAt = NOW - 50; win.__vsViewportResizeAt = 0; return decide.call(clear()) === 'input-resize'; })());
    ok('unit: suspend outranks pin outranks no-input (reason ORDER is the diagnostic)',
      call({ _suspended: true, _pinned: true, _lastUserScrollAt: 0 }) === 'suspended'
      && call({ _pinned: true, _lastUserScrollAt: 0 }) === 'pinned');
  }
}

// ── FUNCTIONAL: the resume RE-TAIL and its pin SNAPSHOT. The settle expires
// and the pinned re-tail runs a beat later; an input-LESS displacement landing
// in that gap reached the scroll handler, unpinned the window, and the re-tail
// — which asserted off the LIVE flag — then refused, stranding the window in
// history for good (repro: scrollTop=0 injected at resume+1210ms). setSuspended
// is DOM-free enough to run right here, so the two behaviours are pinned by
// EXECUTION, not by regex: a transitional unpin still returns to the tail, and
// a real reader who scrolled away is left exactly where they are.
if (typeof globalThis.requestAnimationFrame !== 'function') globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);
{
  const nap = (ms) => new Promise((r) => setTimeout(r, ms));
  const mkView = (over = {}) => Object.assign(Object.create(ChatView.prototype), {
    _suspended: false, _disposed: false, _pinned: true, _teleported: false,
    _windowEnd: 100, _total: 100, _newMsgCount: 3,
    _scrollBtn: { classList: { add() {}, remove() {} } },
    _updateRunBar() {}, _scheduleRunBar() {},
    jumpToBottom() { this._jumps = (this._jumps || 0) + 1; this._pinned = true; },
    _scrollToBottom() { this._scrolls = (this._scrolls || 0) + 1; },
    ...over,
  });
  const retails = (v) => (v._scrolls || 0) + (v._jumps || 0);
  const resumeThen = async (mutate, over) => {
    const v = mkView(over);
    v.setSuspended(true);                            // desktop hidden
    v.setSuspended(false);                           // …and shown again
    await nap(60);                                   // the immediate rAF re-tail
    const baseline = retails(v);
    mutate?.(v);
    await nap(1500);                                 // past RESUME_SETTLE_MS + the slack
    return { v, retailed: retails(v) > baseline };
  };
  const snap = mkView(); snap.setSuspended(true);
  ok('setSuspended(true) SNAPSHOTS the pin — the last honest reading before the geometry starts lying', snap._pinnedAtSuspend === true);
  const snapOff = mkView({ _pinned: false }); snapOff.setSuspended(true);
  ok('…and an unpinned window snapshots FALSE (a reader in history is not dragged anywhere)', snapOff._pinnedAtSuspend === false);
  const [gap, reader, never] = await Promise.all([
    resumeThen((v) => { v._pinned = false; }),                        // input-LESS transitional unpin (THE hole)
    resumeThen((v) => { v._pinned = false; v._endResumeSettle(); }),  // a real reader scrolled away
    resumeThen(null, { _pinned: false }),                             // was never pinned to begin with
  ]);
  ok('a transitional (input-LESS) unpin during the resume still ends at the LIVE tail — the re-tail asserts off the snapshot', gap.retailed && gap.v._pinned === true);
  ok('…and a REAL reader who scrolled away during the settle is left alone (input drops the snapshot)', !reader.retailed && reader.v._pinned === false);
  ok('a window that was NOT pinned when it was hidden is never dragged to the tail', !never.retailed && retails(never.v) === 0);

  // ROUND 2 (a): a reader who NAVIGATED (minimap / search reveal / run bar /
  // jumpToIndex) during the settle is left where they landed. The four
  // message-list listeners were the only thing that ended the settle, so this
  // reader used to be yanked to the live tail by the 1240ms re-tail.
  const navs = await Promise.all([
    resumeThen((v) => { v._pinned = false; v._noteUserNav('minimap'); }),
    resumeThen((v) => { v._pinned = false; v._lastJumpAt = Date.now(); }),         // a jump LANDING (_scrollElStable) with no other stamp
    resumeThen((v) => { v._pinned = false; v._search = { _lastRevealAt: Date.now() }; }), // a search reveal
  ]);
  ok('a reader who navigates during the settle (minimap/run-bar/jumpToIndex → _noteUserNav) is NEVER yanked back to the tail',
    !navs[0].retailed && navs[0].v._pinned === false);
  ok('…and a bare jump LANDING counts as navigation too (the seek idiom generalised: _lastJumpAt)',
    !navs[1].retailed && navs[1].v._pinned === false);
  ok('…as does a search reveal (it scrolls the list from outside the list\'s own listeners)',
    !navs[2].retailed && navs[2].v._pinned === false);

  // ROUND 3: a CLICK during the settle must NOT disarm the repair, while a
  // real positioning act still owns the position. This is the verifier's
  // MAJOR in unit form — the pre-fix listener ran _endResumeSettle() for both.
  const [clicked, positioned] = await Promise.all([
    resumeThen((v) => { v._noteUserInput(); v._pinned = false; }),      // click, then the resume's own displacement
    resumeThen((v) => { v._notePositioning('wheel'); v._pinned = false; }), // a reader who actually moved the view
  ]);
  ok('a CLICK during the settle leaves the repair armed — the input-LESS displacement behind it is still repaired (round-3 MAJOR)',
    clicked.retailed && clicked.v._pinned === true);
  ok('…while a real POSITIONING act during the settle still hands the position to the reader (nothing yanks them back)',
    !positioned.retailed && positioned.v._pinned === false);
  ok('…and the click did end the settle WINDOW (a reader who touched the view is never left with a frozen one)',
    clicked.v._resumeSettleUntil === 0);

  // ROUND 2 (b): the re-assert SERIES — the transitional unpin is repaired at
  // every rung while the snapshot holds, not once at a cliff edge.
  const late = await (async () => {
    const v = mkView();
    v.setSuspended(true); v.setSuspended(false);
    await nap(1400);                       // past the settle AND the first re-tail
    const baseline = retails(v);
    v._pinned = false;                     // input-LESS displacement, the 1400ms repro
    await nap(900);                        // the 2000ms rung
    return { v, repaired: retails(v) > baseline };
  })();
  ok('an input-LESS unpin AFTER the settle expires is still repaired by the bounded series (the +1400ms strand, 3/3 sessions)',
    late.repaired && late.v._pinned === true);

  // ROUND 2 (c): the UNPIN gate itself — positive evidence, DOM-free, run
  // against the SHIPPED predicate.
  const disp = (over) => ChatView.prototype._resumeDisplacement.call(Object.assign(
    Object.create(ChatView.prototype),
    { _resumeAt: Date.now() - 1400, _pinnedAtSuspend: true, _lastUserScrollAt: Date.now() - 9e5, _lastPositionAt: 0, _lastNavAt: 0, _lastJumpAt: 0 },
    over));
  ok('unit: an input-less unpin 1.4s after a resume, off a pinned snapshot, is DISPLACEMENT', disp({}) === true);
  ok('unit: …but a reader who MOVED the view since the resume is INTENT', disp({ _lastPositionAt: Date.now() }) === false);
  ok('unit: …and a bare CLICK since the resume is NOT (round-3 MAJOR: it stamps input, it positions nothing)',
    disp({ _lastUserScrollAt: Date.now() }) === true);
  ok('unit: …and so is a reader who navigated since the resume', disp({ _lastNavAt: Date.now() }) === false);
  ok('unit: a window that was reading history when it was hidden is never re-pinned', disp({ _pinnedAtSuspend: false }) === false);
  ok('unit: past the horizon the gate is off — a normal unpin must always be possible', disp({ _resumeAt: Date.now() - 4000 }) === false);
  ok('unit: a view that never resumed is unaffected (the gate is scoped to the resume)', disp({ _resumeAt: 0 }) === false);

  // ROUND 3 (b) / ROUND 4: the scrollbar-drag predicate — the only way a drag
  // can be told from a click, and the reason a click can stay non-positioning.
  // Round 4 re-keyed it from WHEN (a 400ms window after any pointerdown, which
  // the resume's own displacement walked straight through) to WHERE the press
  // landed, held for the whole press.
  const drag = (over, st) => ChatView.prototype._pointerDragScroll.call(Object.assign(
    Object.create(ChatView.prototype),
    { _pointerDownOnScrollbar: true, _pointerDownScrollTop: 900 }, over), st);
  ok('unit: a scroll while a GUTTER press is held, that MOVED the view, is a drag', drag({}, 400) === true);
  ok('unit: …in either direction', drag({}, 1400) === true);
  ok('unit: …and however LATE it comes — the press is held, so it is still the reader dragging (round-4 MAJOR ②: the 400ms window dropped this reader and the re-tail yanked them back)',
    drag({}, 1400) === true && drag({}, 400) === true);
  ok('unit: a gutter press with no displacement positions nothing', drag({}, 901) === false);
  ok('unit: a press in the CONTENT area is never a drag, however large the displacement that follows (round-4 MAJOR ①: the resume\'s own re-measure behind a click)',
    drag({ _pointerDownOnScrollbar: false }, 0) === false);
  ok('unit: …and with no press at all it is never a drag', drag({ _pointerDownOnScrollbar: undefined }, 0) === false);

  // ROUND 4: the gutter hit-test itself. DOM-free (injected geometry), so the
  // SHIPPED predicate runs right here — content click false, gutter press true.
  const mkList = (over = {}) => ({
    offsetWidth: 800, clientWidth: 785, offsetHeight: 600, clientHeight: 600,
    getBoundingClientRect: () => ({ left: 100, top: 50, width: 800, height: 600 }),
    ...over,
  });
  const onSb = (x, y, list) => ChatView.prototype._pointerOnScrollbar.call(
    Object.assign(Object.create(ChatView.prototype), { _messageList: list || mkList() }), { clientX: x, clientY: y });
  ok('unit: a click in the CONTENT area is not on the scrollbar', onSb(400, 300) === false);
  ok('unit: …not even at the last content pixel before the gutter', onSb(884, 300) === false);
  ok('unit: a press in the vertical GUTTER is (x = rect.left + clientWidth …+ gutter)', onSb(893, 300) === true);
  ok('unit: a list with NO scrollbar (the semantic minimap sets scrollbar-width:none) has no gutter to press',
    onSb(899, 300, mkList({ clientWidth: 800 })) === false);
  // uiScale body zoom 1.5×: the rect and clientX are scaled, clientWidth is
  // not. A CONTENT press at layout x=600 reads (clientX - left) = 900 in
  // viewport px — which the un-converted comparison would call a gutter press
  // (900 >= 785). The 2.369.5 VNC-pointer class, in miniature.
  {
    const zoomed = () => mkList({ getBoundingClientRect: () => ({ left: 100, top: 50, width: 1200, height: 900 }) });
    ok('unit: under uiScale zoom the rect is scaled and clientWidth is not — the hit-test converts to layout px first (2.369.5 class)',
      onSb(100 + 793 * 1.5, 300, zoomed()) === true
      && onSb(100 + 600 * 1.5, 300, zoomed()) === false);
  }
  ok('unit: a HORIZONTAL gutter along the bottom counts too', onSb(400, 50 + 595, mkList({ clientHeight: 585 })) === true);
  ok('unit: a detached / unmeasurable list answers false rather than throwing',
    onSb(400, 300, mkList({ getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }) })) === false);
  // …and with a computed style available (the browser case): RTL puts the
  // vertical gutter on the LEFT, and a border is part of neither box.
  {
    const prev = globalThis.getComputedStyle;
    globalThis.getComputedStyle = (el) => ({
      direction: el.__dir || 'ltr', borderLeftWidth: (el.__b || 0) + 'px', borderRightWidth: (el.__b || 0) + 'px',
      borderTopWidth: (el.__b || 0) + 'px', borderBottomWidth: (el.__b || 0) + 'px',
    });
    try {
      const rtl = mkList({ __dir: 'rtl' });
      ok('unit: RTL — the vertical gutter is on the LEFT', onSb(103, 300, rtl) === true && onSb(893, 300, rtl) === false);
      // 4px borders: gutter = offsetWidth - clientWidth - 8 = 7px, at [789, 796)
      const bordered = mkList({ clientWidth: 785, __b: 4 });
      ok('unit: a BORDER is not a scrollbar — the gutter is measured inside it', onSb(100 + 792, 300, bordered) === true && onSb(100 + 700, 300, bordered) === false);
    } finally { globalThis.getComputedStyle = prev; }
  }
}

// ── WIRING PIN: the desktop show/hide path must keep flowing the flag (a new
// hide/show writer that forgets it re-opens the whole class)
ok('desktop _showWin resumes the ChatView (the resume settle is armed from there)',
  /_showWin\(win\) \{[\s\S]{0,500}setSuspended\?\.\(false\)/.test(dm));

// ── THE KEEP ZONE, EXECUTED (inc-mubvu3a4-x8sb). _trimEdge reads only the list's
// geometry (children, offsetTop/offsetHeight/offsetParent, scrollTop/Height,
// clientHeight) and the view's own bookkeeping, so the SHIPPED method runs here
// against injected geometry — the owner's numbers first (list 790 px, compact
// rows, three of four cards folded), then the tall window, then the folded far
// end, then the ceiling. The pre-fix count trim is the control: it is computed
// beside every case and must differ where the incident said it did.
{
  const CH = 790;
  // cards: [{ id, h, hidden }] in document order (hidden = a folded run member,
  // display:none). offsetTop is a GETTER over the current children, as in a
  // browser after a removal; the sentinel and run chrome are skipped by the
  // same predicates the real list children answer.
  const fakeList = ({ ch = CH, st = 0, cards }) => {
    const list = { children: [], clientHeight: ch, scrollTop: st };
    for (const c of cards) {
      const el = {
        dataset: c.id ? { msgId: c.id } : {}, _isSeekSentinel: !!c.sentinel, _chrome: !!c.chrome, isConnected: true,
        classList: { contains: (k) => (k === 'chat-msg' && !c.sentinel && !c.chrome) || (k === 'chat-run-header' && !!c.chrome) },
        get offsetParent() { return c.hidden ? null : {}; },
        get offsetHeight() { return c.hidden ? 0 : c.h; },
        get offsetTop() { let y = 0; for (const x of list.children) { if (x === this) return y; if (x.offsetParent) y += x.offsetHeight; } return 0; },
        remove() { this.isConnected = false; const i = list.children.indexOf(this); if (i >= 0) list.children.splice(i, 1); },
      };
      list.children.push(el);
    }
    Object.defineProperty(list, 'scrollHeight', { get() { let h = 0; for (const x of list.children) if (x.offsetParent) h += x.offsetHeight; return Math.max(h, ch); } });
    list.querySelectorAll = () => list.children.filter((x) => !x._isSeekSentinel && !x._chrome);
    return list;
  };
  const mkView = (list, over = {}) => Object.assign(Object.create(ChatView.prototype), {
    _messageList: list, _elements: new Map(), _renderedMsgIds: new Set(), _messages: [], _windowStart: 1000, _windowEnd: 1400, _total: 3201, _pinned: false, _traces: [],
    _trace(tag, d) { this._traces.push({ tag, ...d }); }, _traceExpect() {}, ...over,
  });
  const ids = (list) => list.children.filter((x) => x.dataset.msgId).map((x) => x.dataset.msgId);
  const preFixCount = (n, max = 150) => Math.max(0, n - max);   // the 2.369.129 trim: by COUNT to 150 (when ≥ 3 viewports)

  // ① THE OWNER'S WINDOW: 400 cards after a 200-card prepend, one visible 28 px
  //    row per four cards → 2,800 px ≈ 3.5 viewports (the trace: n:400 sh:2851).
  //    The reader's anchor (the old first card) landed at st≈1400.
  {
    const cards = []; for (let i = 0; i < 400; i++) cards.push({ id: 'c' + i, h: 28, hidden: i % 4 !== 0 });
    const list = fakeList({ st: 1400, cards });
    const v = mkView(list);
    const before = ids(list);
    const removed = v._trimBottom();
    ok(`THE OWNER'S SHAPE: 400 compact cards, viewport at 1400 of 2800 px — the zone (1400…${1400 + 2 * CH}) reaches past the window's end, so the trim removes NOTHING (pre-fix: ${preFixCount(400)} by count, the anchor among them)`,
      removed === 0 && ids(list).length === before.length && v._windowEnd === 1400 && list.scrollTop === 1400 && v._traces.some((t) => t.tag === 'trimSkipZone'), JSON.stringify({ removed, traces: v._traces }));
    ok('…and the pre-fix count trim would have differed exactly there (the control computes what 2.369.129 removed: 250)', preFixCount(400) === 250);
  }
  // ② A TALL WINDOW (unfolded 100 px cards, reader mid-window): the trim removes
  //    only what lies beyond one viewport below the viewport, and stops there
  //    even though the count target would allow more.
  {
    const cards = []; for (let i = 0; i < 400; i++) cards.push({ id: 'c' + i, h: 100 });
    const list = fakeList({ st: 20000, cards });
    const v = mkView(list);
    const removed = v._trimBottom();
    // zone.bottom = 20000 + 2·790 = 21580 → the first removable card starts at 21600 (index 216)
    ok(`a tall window: bottom trim removes only cards beyond the zone (${removed} of the 250 the count would allow), the viewport does not move, windowEnd follows`,
      removed === 184 && ids(list).length === 216 && ids(list)[215] === 'c215' && list.scrollTop === 20000 && v._windowEnd === 1400 - 184 && v._pinned === false, JSON.stringify({ removed, n: ids(list).length, last: ids(list)[215] }));
  }
  {
    const cards = []; for (let i = 0; i < 400; i++) cards.push({ id: 'c' + i, h: 100 });
    const list = fakeList({ st: 20000, cards });
    const v = mkView(list);
    const removed = v._trimTop();
    // zone.top = 20000 − 790 = 19210 → cards whose bottom ≤ 19210 = indices 0…191; the anchor
    // (c200, at 20000) sits at 800 after 192 removals and the restore puts scrollTop there
    ok(`…top trim: removes only cards above the zone (${removed}), and the ANCHORED restore lands the viewport on the same card (scrollTop 20000 → 800), windowStart follows`,
      removed === 192 && ids(list)[0] === 'c192' && list.scrollTop === 800 && v._windowStart === 1000 + 192, JSON.stringify({ removed, first: ids(list)[0], st: list.scrollTop }));
  }
  // ③ A FOLDED FAR END: 100 visible cards then 300 folded members of one run.
  //    Folded cards sit at their header (the nearest visible thing above), so
  //    they are beyond the zone and removable at no pixel cost; the visible
  //    cards inside the zone stay.
  {
    const cards = []; for (let i = 0; i < 100; i++) cards.push({ id: 'v' + i, h: 100 }); for (let i = 0; i < 300; i++) cards.push({ id: 'f' + i, h: 0, hidden: true });
    const list = fakeList({ st: 0, cards });
    const v = mkView(list);
    const sh0 = list.scrollHeight;
    const removed = v._trimBottom();
    ok(`a folded far end: the trim removes ${removed} folded members (count target 150 → 250 of the 300 folded), NO visible card, and the height does not change (${sh0} → ${list.scrollHeight})`,
      removed === 250 && ids(list).filter((x) => x.startsWith('v')).length === 100 && list.scrollHeight === sh0 && list.scrollTop === 0, JSON.stringify({ removed, n: ids(list).length }));
  }
  // ④ THE CEILING: more cards than FOLD_DOM_CEILING, all inside the zone (folded)
  //    — the hard bound removes past the zone, and says so.
  {
    const CEIL = Number(cv.match(/const FOLD_DOM_CEILING = (\d+);/)[1]);
    const cards = [{ id: 'head', h: 100 }]; for (let i = 0; i < CEIL + 199; i++) cards.push({ id: 'f' + i, h: 0, hidden: true });
    const list = fakeList({ st: 0, cards });
    const v = mkView(list);
    const removed = v._trimBottom();
    ok(`the ceiling: ${CEIL + 200} cards all inside the zone → exactly the excess over FOLD_DOM_CEILING is removed (${removed}) and the foldCeiling trace names it`,
      removed === 200 && ids(list).length === CEIL && v._traces.some((t) => t.tag === 'foldCeiling' && t.forced === 200), JSON.stringify({ removed, traces: v._traces.slice(0, 2) }));
  }
  // ⑤ A WINDOW UNDER THE SOFT TARGET is never touched, whatever its height.
  {
    const cards = []; for (let i = 0; i < 150; i++) cards.push({ id: 'c' + i, h: 400 });
    const list = fakeList({ st: 0, cards });
    const v = mkView(list);
    ok('a window at the soft target (150 cards, 60,000 px) is not trimmed', v._trimBottom() === 0 && v._trimTop() === 0 && ids(list).length === 150);
  }
  // ⑥ THE PIN PREDICATE: the DOM edge is not the tail.
  {
    const at = (over) => ChatView.prototype._atLiveTail.call(Object.assign(Object.create(ChatView.prototype), { _teleported: false, _windowEnd: 3201, _total: 3201, ...over }), 1418, 2095, 677);
    ok('unit: at the DOM bottom with windowEnd = total → the live tail (a pin)', at({}) === true);
    ok('unit: at the DOM bottom with windowEnd < total → NOT the tail (the owner\'s `repin we:1851 total:3201` can no longer happen)', at({ _windowEnd: 1851 }) === false);
    ok('unit: a teleported view is never at the live tail', at({ _teleported: true }) === false);
    ok('unit: away from the DOM bottom → not the tail', ChatView.prototype._atLiveTail.call(Object.assign(Object.create(ChatView.prototype), { _teleported: false, _windowEnd: 3201, _total: 3201 }), 100, 2095, 677) === false);
  }
  // ⑦ THE ANCHOR SKIPS THE SEEK SENTINEL: a huge session's list starts with the
  //    1 px sentinel; at the top edge the anchor is the first visible CARD, and a
  //    500 px prepend lands the viewport back on it — not at scrollTop 0.
  {
    const list = fakeList({ st: 0, cards: [{ sentinel: true, h: 1 }, { chrome: true, h: 24 }, { id: 'a', h: 30 }, { id: 'b', h: 30 }] });
    const v = mkView(list);
    const ok1 = v._withViewportAnchor(() => {
      // prepend a 500 px card after the sentinel (where _extendTop inserts the fresh slab)
      const fresh = fakeList({ cards: [{ id: 'fresh', h: 500 }] }).children[0];
      Object.defineProperty(fresh, 'offsetTop', { get() { let y = 0; for (const x of list.children) { if (x === fresh) return y; if (x.offsetParent) y += x.offsetHeight; } return 0; } });
      list.children.splice(1, 0, fresh);
    });
    ok(`the top-edge anchor is card "a" (sentinel + header skipped, delta 25): after a 500 px prepend the viewport is restored to it (scrollTop ${list.scrollTop}, pre-fix: 0 = the top of the fresh slab)`,
      ok1 === true && list.scrollTop === 500, JSON.stringify({ ok1, st: list.scrollTop }));
  }
}


// ── VERIFIER r1 ON THE HUGE-PAGING FIX (inc-mubvu3a4-x8sb, 2026-09-21): five
// reproduced findings, each pinned at the source AND executed against the
// shipped methods. (1) the carry captured only a notch that STARTED at the top
// edge — a 700 px notch beginning 232 px from it lost 468 px and a 4×700 fling
// parked at scrollTop 43 with 2,178 messages above; (2) inside a loaded gap
// slab with content-visibility on, wheels in BOTH directions were absorbed
// (native anchoring against the slab's placeholder flips — the gap cards got
// no measured heights); (3) a gap slab survived the walk back to the tail and
// the next prepend landed the fresh slab ABOVE the ancient cards; (4) ring
// reads by INDEX went blind after the 600→400 splice; (5) a carried notch
// survived a jump. The judge (scripts/paging-gesture-rules.mjs) gained the
// pageUp BAND with history above (window OR gap) and the dead-wheel rule.
{
  ok('the wheel handler carries the OVERSHOOT of a notch that CROSSES an edge (px − room), not only a notch that starts there — both directions',
    /const roomUp = list\.scrollTop;/.test(cv) && /if \(e\.deltaY < 0 && \(roomUp < 10 \|\| px > roomUp\)\) \{/.test(cv) && /this\._addWheelCarry\('up', px - roomUp\);/.test(cv)
    && /\(roomDown < 10 \|\| px > roomDown\)\) \{/.test(cv) && /this\._addWheelCarry\('down', px - roomDown\);/.test(cv));
  ok('a notch eaten by the load lock leaves its trace BEFORE the early return (wheelTop / wheelBottom {eaten:1})',
    /this\._wheelPending = 'up'; this\._trace\('wheelTop', \{ st: Math\.round\(roomUp\), eaten: 1/.test(cv) && /this\._wheelPending = 'down'; this\._trace\('wheelBottom', \{[^}]*eaten: 1/.test(cv));
  ok('ONE carry accounting (_addWheelCarry / _applyWheelCarry / _clearWheelCarry): both extends AND both gap slabs consume it; nothing else assigns _wheelCarry',
    /_applyWheelCarry\('up', 'extendTop:carry'\)/.test(cv) && /_applyWheelCarry\('down', 'extendBottom:carry'\)/.test(cv)
    && /_applyWheelCarry\?\.\('up', 'gapUp:carry'\)/.test(sk) && /_applyWheelCarry\?\.\('down', 'gapDown:carry'\)/.test(sk)
    && (cv.match(/this\._wheelCarry = /g) || []).length === 3 && !/_wheelCarry = /.test(sk), `assignments in chat-view.js: ${(cv.match(/this\._wheelCarry = /g) || []).length} (want 3: add / apply / clear)`);
  ok('a chosen destination clears a carried notch: _noteUserNav (jumps, minimap, search reveal, run bar), _resetGapAfterJump (both jumps), _seekTeleport',
    /_noteUserNav\(via\) \{[\s\S]{0,400}this\._clearWheelCarry\?\.\(via\);/.test(cv) && /_resetGapAfterJump\(\) \{[\s\S]{0,300}this\._clearWheelCarry\?\.\('gapReset'\);/.test(sk) && /this\._clearWheelCarry\?\.\('teleport'\);[^\n]*\n\s*this\._teleported = true;/.test(sk));
  ok('_extendTop prepends before the first NON-GAP card, and the top trim drops the gap slab when the window leaves message 0 — inside the same anchored removal',
    cv.includes("querySelector(':scope > .chat-msg:not(.chat-gap-msg)');\n        this._loadingHistory = true;") && /const leavesZero = !this\._teleported && this\._windowStart === 0;/.test(cv) && /if \(leavesZero\) this\._dropGapSlab\('trimTop', zone\); \}\);/.test(cv));
  ok('a TAIL-MODE gap slab runs with STABLE HEIGHTS from its anchored insert (content-visibility on made its cards flip size on alternate frames and the wheel was absorbed; the reserve alone did not stop it) — teleport keeps its own regime',
    /if \(!this\._teleported\) this\._setStableHeights\(true, \{ why: 'gapSlab' \}\);/.test(sk) && /_setStableHeights\(stable, \{ recenter = true, why = '' \} = \{\}\) \{/.test(sk) && /if \(!recenter\) \{ this\._trace\?\.\('stableHeights'/.test(sk));
  ok('a gap slab is rendered once at insert like a window slab (both gap loaders reserve measured heights), and a slab landing on a bumped sentinel epoch is discarded',
    /this\._reserveFreshHeights\?\.\(inserted\);/.test(sk) && /this\._reserveFreshHeights\?\.\(appended\);/.test(sk) && /const epoch = markerEl\._gapEpoch \|\| 0;/.test(sk) && /if \(\(markerEl\._gapEpoch \|\| 0\) !== epoch\) \{ this\._trace\?\.\('gapUp:stale'/.test(sk) && /s\._gapEpoch = \(s\._gapEpoch \|\| 0\) \+ 1;/.test(cv));
  ok('every ring entry carries a monotonic seq (the ring splices 600→400; an index mark goes blind) and the shared reader slices by it',
    /const seq = this\._traceSeq = \(this\._traceSeq \|\| 0\) \+ 1;/.test(cv) && /r\.push\(data \? \{ t: Date\.now\(\), seq, tag, \.\.\.data \}/.test(cv)
    && /ringSeq: v\._traceSeq \|\| 0/.test(rulesSrc) && /\(e\.seq \|\| 0\) > \$\{Number\(mark\) \|\| 0\}/.test(rulesSrc)
    && /const ringSince = \(mark\) => evaljs\(RING_SINCE_SOURCE\(mark\)\);/.test(pagingSrc) && /const ringSince = \(mark\) => evaljs\(RING_SINCE_SOURCE\(mark\)\);/.test(dbgSrc) && !/before\.ring\b/.test(pagingSrc) && !/before\.ring\b/.test(dbgSrc));
  ok('the §1c fixture MINTS every record id through fixtureSid (test-fixture-isolation refuses a hand-spelled member of the family) — in its shared home, scripts/huge-transcript-fixture.mjs, which test-chat-paging is WIRED to (imports + calls it with SID3)',
    /const uuid = \(\) => fixtureSid\(\(n\+\+\)\.toString\(16\)\);/.test(hugeSrc) && /import \{ fixtureSid \} from '\.\/scratch\.mjs';/.test(hugeSrc) && !/['"`]e2e00000-0000-4000-8000-/i.test(hugeSrc)
    && /import \{ writeHugeTranscript \} from '\.\/huge-transcript-fixture\.mjs';/.test(pagingSrc) && /await writeHugeTranscript\(\{ file: path\.join\(PROJ, `\$\{SID3\}\.jsonl`\), sid: SID3, cwd: CWD, targetBytes: HUGE_TARGET_BYTES \}\)/.test(pagingSrc) && !/['"`]e2e00000-0000-4000-8000-/i.test(pagingSrc));
  ok('the by-hand driver re-tails after emulating content-visibility (a live window opens pinned at the tail, never at scrollTop 0 unpinned) and walks the gap legs',
    /v\._pinned = true; v\._forceScrollToBottom\(\); await sleep\(600\);/.test(dbgSrc) && /gesture\(`gap-up-hold-\$\{i \+ 1\}`, 'up', 'hold'\)/.test(dbgSrc));
  ok('both drivers wheel over a PLAIN point of the viewport (WHEEL_POINT_SOURCE — a card\'s own scroll box under the pointer takes the notches), never a fixed centre',
    /export const WHEEL_POINT_SOURCE = \(dir, px\) => `/.test(rulesSrc) && /if \(!\/\(auto\|scroll\)\/\.test\(cs\.overflowY\)\) continue;/.test(rulesSrc) && /if \(!paged && after\.topDev != null && !row\.wheelFallback\) \{/.test(rulesSrc)
    && /const pt = \(await evaljs\(WHEEL_POINT_SOURCE\(dir, /.test(pagingSrc) && /x: pt\.x, y: pt\.y/.test(pagingSrc) && /const pt = \(await evaljs\(WHEEL_POINT_SOURCE\(deltaY < 0 \? 'up' : 'down', /.test(dbgSrc) && /x: pt\.x, y: pt\.y/.test(dbgSrc));

  // (b) THE WHEEL HANDLER, EXECUTED: the listener body lifted out of the shipped source
  const wStart = cv.indexOf("this._messageList.addEventListener('wheel', (e) => {\n      if (!this._canPaginate) return;"); // the PAGING wheel listener (the first one is the positioning stamp)
  const wEnd = cv.indexOf('}, { passive: true });', wStart);
  ok('the wheel handler source is extractable for the unit below', wStart > 0 && wEnd > wStart);
  if (wStart > 0 && wEnd > wStart) {
    const body = cv.slice(cv.indexOf('{', wStart) + 1, wEnd);
    const handler = new Function('e', body);
    const mk = (over) => Object.assign(Object.create(ChatView.prototype), {
      _canPaginate: true, _loading: false, _pinned: true, _teleported: false, _windowStart: 1000, _windowEnd: 1400, _total: 3201,
      _messageList: { scrollTop: 232, scrollHeight: 5000, clientHeight: 700 }, _traces: [], calls: [],
      _trace(tag, d) { this._traces.push({ tag, ...d }); }, _extendTop() { this.calls.push('extendTop'); }, _extendBottom() { this.calls.push('extendBottom'); },
      _maybeSeekEarlier() { this.calls.push('seekEarlier'); }, _maybeSeekLater() { this.calls.push('seekLater'); }, ...over });
    const wheel = (v, deltaY) => handler.call(v, { deltaY, deltaMode: 0 });
    let v = mk({}); wheel(v, -700);
    ok(`unit: the verifier's notch — 700 px beginning 232 px from the top — carries the OVERSHOOT (${v._wheelCarry}, want 468), unpins, fires _extendTop (${v.calls})`,
      v._wheelCarry === 468 && v._wheelCarryDir === 'up' && v._pinned === false && v.calls.join() === 'extendTop' && v._traces.some((t) => t.tag === 'wheelTop' && t.carry === 468));
    v = mk({ _messageList: { scrollTop: 5, scrollHeight: 5000, clientHeight: 700 } }); wheel(v, -120);
    ok('unit: at the edge (st 5) a 120 px notch carries 115 (px − room)', v._wheelCarry === 115 && v.calls.join() === 'extendTop');
    v = mk({ _messageList: { scrollTop: 900, scrollHeight: 5000, clientHeight: 700 } }); wheel(v, -120);
    ok('unit: a notch the browser delivers whole (st 900, 120 px) carries nothing, pages nothing, keeps the pin', !v._wheelCarry && !v._wheelCarryDir && v.calls.length === 0 && v._pinned === true);
    v = mk({ _loading: true }); wheel(v, -700);
    ok('unit: a crossing notch during the load lock is carried, marked pending, traced {eaten:1} — and fires nothing', v._wheelCarry === 468 && v._wheelPending === 'up' && v.calls.length === 0 && v._traces.some((t) => t.tag === 'wheelTop' && t.eaten === 1 && t.carry === 468));
    v = mk({}); wheel(v, -700); wheel(v, -700); wheel(v, -700);
    ok('unit: the carry is bounded to ONE VIEWPORT per landing (three 700 px notches from st 232 → 700, not 1404)', v._wheelCarry === 700);
    v = mk({}); wheel(v, -700); wheel(v, 120);
    ok('unit: a reversal clears the carry and says so', !v._wheelCarry && v._wheelCarryDir === null && v._traces.some((t) => t.tag === 'wheelCarry:clear' && t.why === 'reversal'));
    v = mk({ _pinned: false, _messageList: { scrollTop: 4200, scrollHeight: 5000, clientHeight: 700 } }); wheel(v, 700);
    ok('unit: the down mirror — a 700 px wheel-down with 100 px of room below carries 600 and fires _extendBottom', v._wheelCarry === 600 && v._wheelCarryDir === 'down' && v.calls.join() === 'extendBottom');
    v = mk({ _pinned: false, _windowEnd: 3201, _messageList: { scrollTop: 4200, scrollHeight: 5000, clientHeight: 700 } }); wheel(v, 700);
    ok('unit: …and at the live tail (windowEnd = total) the down branch fires nothing', v.calls.length === 0);
    v = mk({ _windowStart: 0 }); wheel(v, -700);
    ok('unit: with the registered tail exhausted the crossing notch is carried into the SEEK path (_maybeSeekEarlier consumes it at the slab landing)', v._wheelCarry === 468 && v.calls.join() === 'seekEarlier');
  }
  // (c) _applyWheelCarry, EXECUTED
  {
    const mk = (over) => Object.assign(Object.create(ChatView.prototype), { _messageList: { scrollTop: 720, scrollHeight: 5000, clientHeight: 700 }, _pinned: false, _wheelCarry: 468, _wheelCarryDir: 'up', _traces: [], _trace(tag, d) { this._traces.push({ tag, ...d }); }, _by: null, _traceExpect(by) { this._by = by; }, ...over });
    let v = mk({}); let r = v._applyWheelCarry('up', 'extendTop:carry');
    ok(`unit: the landing applies the carried 468 px upward (st 720 → ${v._messageList.scrollTop}), stamps the author, traces wheelCarry, consumes the carry`,
      r === 468 && v._messageList.scrollTop === 252 && v._by === 'extendTop:carry' && v._wheelCarry === 0 && v._traces.some((t) => t.tag === 'wheelCarry' && t.dir === 'up' && t.px === 468 && t.by === 'extendTop:carry'));
    v = mk({ _messageList: { scrollTop: 100, scrollHeight: 5000, clientHeight: 700 } }); r = v._applyWheelCarry('up', 'x');
    ok('unit: bounded by the room the landing produced (100 px above → 100 applied)', r === 100 && v._messageList.scrollTop === 0);
    v = mk({ _pinned: true }); r = v._applyWheelCarry('up', 'x');
    ok('unit: never upward while pinned — the carry is consumed anyway', r === 0 && v._messageList.scrollTop === 720 && v._wheelCarry === 0);
    v = mk({ _wheelCarryDir: 'down', _wheelCarry: 300 }); r = v._applyWheelCarry('down', 'gapDown:carry');
    ok('unit: the down mirror scrolls further down, bounded by the room below', r === 300 && v._messageList.scrollTop === 1020);
    v = mk({}); r = v._applyWheelCarry('down', 'x');
    ok('unit: a carry in the OTHER direction applies nothing and is consumed', r === 0 && v._wheelCarry === 0 && v._messageList.scrollTop === 720);
  }
  // (d) the stale carry: a chosen destination clears it
  {
    const v = Object.assign(Object.create(ChatView.prototype), { _wheelCarry: 300, _wheelCarryDir: 'up', _wheelPending: 'up', _traces: [], _trace(tag, d) { this._traces.push({ tag, ...d }); }, _cancelForcedScroll() {}, _endResumeSettle() {} });
    v._noteUserNav('jumpToBottom');
    ok('unit: _noteUserNav clears the carry, its direction and the pending arm (the stale probe {c:0, d:"up"} survived the scroll-to-bottom button before)',
      v._wheelCarry === 0 && v._wheelCarryDir === null && v._wheelPending === null && v._traces.some((t) => t.tag === 'wheelCarry:clear' && t.why === 'jumpToBottom' && t.px === 300));
    v._noteUserNav('minimap');
    ok('unit: …and clearing nothing traces nothing', v._traces.filter((t) => t.tag === 'wheelCarry:clear').length === 1);
  }
  // (e) the ring's seq across the splice
  {
    const v = Object.assign(Object.create(ChatView.prototype), {});
    for (let i = 0; i < 650; i++) v._trace('x', { i });
    const r = v._traceRing, mark = 500; // an INDEX mark taken at entry 500, before the splice at 601 (600→400, then 49 more)
    ok(`unit: after 650 entries the ring holds ${r.length} (449) with seq 202…650; the index mark 500 reads ${r.slice(mark).length} entries (blind), the seq mark reads ${r.filter((e) => e.seq > mark).length} (150)`,
      r.length === 449 && r[0].seq === 202 && r[r.length - 1].seq === 650 && r.slice(mark).length === 0 && r.filter((e) => e.seq > mark).length === 150 && v._traceSeq === 650);
  }
  // (f) THE GAP SLAB IS DROPPED BY THE TOP TRIM when the window leaves message 0
  {
    const CH = 790;
    const fakeList = ({ ch = CH, st = 0, cards }) => {
      const list = { children: [], clientHeight: ch, scrollTop: st };
      for (const c of cards) {
        const el = {
          dataset: c.id ? { msgId: c.id } : {}, _isSeekSentinel: !!c.sentinel, _gap: !!c.gap, isConnected: true,
          classList: { contains: (k) => (k === 'chat-msg' && !c.sentinel) || (k === 'chat-gap-msg' && !!c.gap) },
          get offsetParent() { return {}; }, get offsetHeight() { return c.h; },
          get offsetTop() { let y = 0; for (const x of list.children) { if (x === this) return y; y += x.offsetHeight; } return 0; },
          remove() { this.isConnected = false; const i = list.children.indexOf(this); if (i >= 0) list.children.splice(i, 1); },
        };
        list.children.push(el);
      }
      Object.defineProperty(list, 'scrollHeight', { get() { let h = 0; for (const x of list.children) h += x.offsetHeight; return Math.max(h, ch); } });
      // selector-aware: the trim asks for non-gap cards, the drop for gap cards
      list.querySelectorAll = (sel = '') => list.children.filter((x) => !x._isSeekSentinel && (/:not\(\.chat-gap-msg\)/.test(sel) ? !x._gap : /\.chat-gap-msg/.test(sel) ? x._gap : true));
      return list;
    };
    const build = () => { const cards = [{ sentinel: true, h: 1 }]; for (let i = 0; i < 30; i++) cards.push({ id: 'g' + i, h: 100, gap: true }); for (let i = 0; i < 400; i++) cards.push({ id: 'c' + i, h: 100 }); return cards; };
    const mkView = (list, over = {}) => Object.assign(Object.create(ChatView.prototype), {
      _messageList: list, _elements: new Map(), _renderedMsgIds: new Set(), _messages: [], _windowStart: 0, _windowEnd: 400, _total: 3785, _pinned: false, _teleported: false, _traces: [],
      _seekSentinel: { _gapCursor: 5000, _gapAnchor: {}, _gapRetryAt: 0, _gapEpoch: 0 }, _stable: null,
      _setStableHeights(on, opts) { this._stable = [on, opts]; },   // the seek mixin's toggle, recorded
      _trace(tag, d) { this._traces.push({ tag, ...d }); }, _traceExpect() {}, ...over });
    const gaps = (list) => list.children.filter((x) => x._gap).length;
    {
      const list = fakeList({ st: 30000, cards: build() }), v = mkView(list);
      const removed = v._trimTop();
      // zone.top = 29210 → the soft target stops the tail removal at 250 (c0…c249); the 30 gap cards go with them; the
      // anchor c269 (top 29901, delta −99) lands at 1 + 19·100 + 99 = 2000
      ok(`the top trim leaving message 0 removes ${removed} tail cards AND the 30 gap cards, rewinds the sentinel (cursor null, epoch 1), traces gapDrop, keeps the viewport on its card (st 30000 → ${list.scrollTop})`,
        removed === 250 && gaps(list) === 0 && v._windowStart === 250 && v._seekSentinel._gapCursor === null && v._seekSentinel._gapAnchor === null && v._seekSentinel._gapEpoch === 1
        && list.scrollTop === 2000 && v._traces.some((t) => t.tag === 'gapDrop' && t.why === 'trimTop' && t.n === 30), JSON.stringify({ removed, gaps: gaps(list), ws: v._windowStart, st: list.scrollTop, traces: v._traces.map((t) => t.tag) }));
      ok('…and the slab\'s stable-heights regime ends with it: _setStableHeights(false, {recenter:false}) — no jump-target replay from inside the trim', Array.isArray(v._stable) && v._stable[0] === false && v._stable[1]?.recenter === false && v._stable[1]?.why === 'gapDrop', JSON.stringify(v._stable));
    }
    {
      const list = fakeList({ st: 30000, cards: build() }), v = mkView(list, { _windowStart: 1000, _windowEnd: 1400 });
      v._trimTop();
      ok('control: a window that was NOT at message 0 does not run the sweep (the gate is leaving zero, not the trim itself)', gaps(list) === 30 && v._seekSentinel._gapEpoch === 0);
    }
    {
      const list = fakeList({ st: 30000, cards: build() }), v = mkView(list, { _teleported: true });
      v._trimTop();
      ok('control: a teleported view keeps its gap slab (there is no registered tail to leave)', gaps(list) === 30);
    }
    {
      const list = fakeList({ st: 500, cards: build() }), v = mkView(list);
      const n = v._dropGapSlab('probe', { top: 1000, bottom: 3000 });
      ok('_dropGapSlab refuses when a gap card still touches the keep zone, and says so (gapDrop:skip)', n === 0 && gaps(list) === 30 && v._traces.some((t) => t.tag === 'gapDrop:skip'));
    }
  }
  // (g) THE JUDGE's new rules (scripts/paging-gesture-rules.mjs is PURE — the heavy gate feeds it real rows)
  {
    const base = { st: 1500, sh: 6000, ch: 700, ws: 2000, we: 2200, total: 3785, pin: 0, tp: 0, topId: 'a', topOff: 0, blankPct: 0, emptyBelow: 0, gapCursor: null, gapAbove: 0, gapCards: 0, gapBelowTail: 0, loading: 0 };
    const row = (dir, wheelPx, before, after, ring = [{ tag: 'x' }]) => judgeGesture({ name: 't', dir, wheelPx, before: { ...base, ...before }, after: { ...base, ...after }, ring });
    let j = row('up', -2800, { st: 876, ws: 2328 }, { st: 43, ws: 2178, topDev: 1765 });
    ok('judge: the verifier\'s landing — st 43 with 2,178 messages above — is inside the pageUp band → violation (was one pixel from red at `<= 0`)', !j.ok && j.reasons.some((x) => /pageUp band/.test(x)), j.reasons.join('; '));
    j = row('up', -2800, { st: 876, ws: 0, gapAbove: 1, gapCursor: 5000 }, { st: 43, ws: 0, gapAbove: 1, gapCursor: 5000, topDev: 1765 });
    ok('judge: ws 0 with the GAP still above counts as history above', !j.ok && j.reasons.some((x) => /pageUp band/.test(x) && /and the gap/.test(x)), j.reasons.join('; '));
    j = row('up', -2800, { st: 876, ws: 0, gapAbove: 0, gapCursor: 0 }, { st: 43, ws: 0, gapAbove: 0, gapCursor: 0, topDev: 833 });
    ok('judge: ws 0 and no gap above → the top is the top, no violation', j.ok, j.reasons.join('; '));
    j = row('up', -2800, { st: 876, ws: 2328 }, { st: 43, ws: 2178, topDev: 1765, loading: 1 });
    ok('judge: a slab still in flight at the sample is not judged on its scrollTop', j.ok, j.reasons.join('; '));
    j = row('down', 720, { st: 1554, sh: 4284, gapCards: 540, gapCursor: 3000 }, { st: 1671, sh: 4447, gapCards: 540, gapCursor: 3000, topDev: -80 });
    ok('judge: a mid-list 720 px wheel-down that moved the card 80 px is a DEAD WHEEL → violation (the gap-slab absorption was "OK" before)', !j.ok && j.reasons.some((x) => /moved the reader's card only 80 px/.test(x)), j.reasons.join('; '));
    j = row('up', -720, { st: 3000, sh: 4284, gapCards: 540, gapCursor: 3000 }, { st: 2900, sh: 4300, gapCards: 540, gapCursor: 3000, topDev: 60 });
    ok('judge: …and the same dead wheel upward', !j.ok && j.reasons.some((x) => /mid-list up wheel of 720 px moved the reader's card only 60 px/.test(x)), j.reasons.join('; '));
    j = row('down', 720, { st: 1554, sh: 4284 }, { st: 2274, sh: 4284, topDev: -717 });
    ok('judge: a wheel delivered whole is fine', j.ok, j.reasons.join('; '));
    j = row('up', -2800, { st: 1000 }, { st: 0, ws: 2000, topDev: 900, loading: 1 });
    ok('judge: a wheel that reaches an edge is not held to the delivery rule (a page is expected there instead)', !j.reasons.some((x) => /moved the reader's card only/.test(x)), j.reasons.join('; '));
    j = row('down', 720, { st: 1554, sh: 4284, gapCursor: 3000 }, { st: 1600, sh: 8284, gapCursor: 1000, topDev: -80 });
    ok('judge: a gap slab load counts as a page (the window indices do not move for it) — the delivery rule steps aside, the evidence rule applies', j.paged === true && !j.reasons.some((x) => /moved the reader's card only/.test(x)), j.reasons.join('; '));
    ok('judge: the band and the delivery fraction are the exported constants the gate prints', PAGE_UP_BAND_PX === 100 && DELIVERY_MIN_FRACTION === 0.5);
    // ② DURING the gesture (2.369.155, the Actions runner's control rows): the pre-fix copy re-pinned mid-history on
    // every mirror run and a later scroll event unpinned it before the settle sample — the rule reads the ring's own
    // repin record, so the verdict no longer depends on when the sample landed
    j = row('down', 120, { st: 1208, sh: 2002 }, { st: 0, sh: 1828, ws: 2150, we: 2300, pin: 0, topDev: -500 }, [{ tag: 'wheelBottom' }, { tag: 'repin', we: 2200, total: 3785 }, { tag: 'extendBottom' }, { tag: 'unpin' }]);
    ok('judge: a repin with a PARTIAL window in the gesture\'s ring is a ② violation even when the settle sample is unpinned', !j.ok && j.reasons.some((x) => /re-pinned mid-history during the gesture \(repin at window end 2200 of 3785\)/.test(x)), j.reasons.join('; '));
    j = row('down', 120, { st: 1208, sh: 2002, we: 3700 }, { st: 1300, sh: 2102, we: 3785, ws: 3600, pin: 1, topDev: -120 }, [{ tag: 'wheelBottom' }, { tag: 'extendBottom' }, { tag: 'repin', we: 3785, total: 3785 }]);
    ok('judge: …a repin AT the live tail (we = total) is the designed pin — no violation (control)', !j.reasons.some((x) => /re-pinned mid-history|pinned with the window/.test(x)), j.reasons.join('; '));
    j = row('down', 120, { st: 1208, sh: 2002 }, { st: 1300, sh: 2102, ws: 2150, we: 2300, pin: 1, topDev: -120 }, [{ tag: 'repin', we: 2300, total: 3785 }]);
    ok('judge: …a pin that is still there at the settle is reported ONCE, by the sample (the ring clause is its else)', j.reasons.filter((x) => /pinned/.test(x)).length === 1 && j.reasons.some((x) => /^pinned with the window ending at 2300 of 3785/.test(x)), j.reasons.join('; '));
  }
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
