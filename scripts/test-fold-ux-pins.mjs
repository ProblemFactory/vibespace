#!/usr/bin/env node
// THE RUN FOLD's SOURCE PINS (fast, text only — lane text-legs, B-94d3). MOVED VERBATIM from the heavy scripts/test-fold-ux.mjs (its
// pure classifier legs and its Chrome legs over a real ChatView, with every mutant CONTROL, stay there): the pure module imports
// nothing but PURE rules (src/lib/chat-run-summary.js), and the wiring pins — a pure fix with an unstaged call site is dead (the
// 2.355.0 lesson): src/lib/chat-view.js, src/lib/workflow-detail.js, the dictionaries src/lib/i18n-zh.js / src/lib/i18n-ja.js. Each
// reads the file BY NAME, so ci.mjs's affected rule selects this suite on a change of one of them.
// Run: node scripts/test-fold-ux-pins.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0, passed = 0;
const check = (n, c, e) => { if (typeof n !== 'string') throw new TypeError('a leg\'s name is not a string — its arguments are swapped (test-ci-gate-tiers §7b)'); if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 400) : ''}`); } };
const read = (f) => fs.readFileSync(path.join(repo, f), 'utf8');

console.log('— the pure module\'s imports (source)');
check('the pure module imports nothing but PURE rules (DOM-free by construction; B-40f8: src/assistant-note.js; lane exit-calls-in-history: src/exit-call.js; lane touch-chip-cause r2: where a command line runs the channels CLI — src/shell-words.js, the PURE scanner, never src/channel-touch.js)', (read('src/lib/chat-run-summary.js').match(/^\s*import .*$/gm) || []).every((l) => /from '\.\.\/(?:assistant-note|exit-call|shell-words)\.js';/.test(l)));

// ── wiring pins (a pure fix with an unstaged call site is dead: the 2.355.0 lesson) ──
const cv = read('src/lib/chat-view.js');
// the names chat-view takes from the pure module (any import line, any order — later lanes add names: machine-card-fold's
// machineRunPart / splitRuns, machine-card-compact's machineCompact)
const fromSummary = new Set([...cv.matchAll(/^import \{([^}]*)\} from '\.\/chat-run-summary\.js';/gm)].flatMap((m) => m[1].split(',').map((x) => x.trim()).filter(Boolean)));
check('chat-view imports the classifier + composer from chat-run-summary.js', ['mcpParts', 'messageKind', 'foldToggleFor', 'countKinds', 'runSummaryLabel', 'foldPassMode'].every((n) => fromSummary.has(n)));
// …and the ONE composer also positions the collab traffic segment (2026-09-07):
// chat-view hands it a PRE-COMPOSED string from the pure collab module, so this
// module still imports nothing and the order never forks between the header,
// the floating bar and the footer.
// the ONE call hands over the run's counts + the pre-composed collab part (extra parts — notes, machinePart — may ride along)
const labelCalls = [...cv.matchAll(/runSummaryLabel\(\{([\s\S]*?)\}, t\)/g)].map((m) => m[1]);
check('chat-view hands the run\'s filed proposals to the ONE composer (each call row\'s keyed box counts its own — lane chat-proposal-card)', /\n\s*proposals, \/\/ lane chat-proposal-card/.test(labelCalls[0] || '') && /const pb = el\.querySelector\('\.chat-chan-props'\); if \(pb\) \{ proposals\.n \+= Number\(pb\.dataset\.n\) \|\| 0; proposals\.awaiting \+= Number\(pb\.dataset\.awaiting\) \|\| 0; \}/.test(cv));
check('chat-view builds the label ONLY through runSummaryLabel (no inline per-kind t() lines left)', labelCalls.length === 1
  && /^\s*byKind, mcpServers, files, nErr, running,/.test(labelCalls[0])
  && /\bcollabPart: collabRunPart\(collabStats, \{ now, live, t \}\),\s*$/.test(labelCalls[0])
  && !cv.includes("t('{n} MCP'") && !cv.includes("t('{n} Bash'"));
check('memberKind delegates to messageKind; folding gates on foldToggleFor', /messageKind\(el\._rawMsg, \{ toolCard: el\.classList\.contains\('chat-msg-tool-result'\), isMemoryPath \}\)/.test(cv) && /kinds\.has\(foldToggleFor\(mk\)\)/.test(cv));
check('chat-renderers re-exports the ONE mcpParts from the pure module', /import \{ mcpParts \} from '\.\/chat-run-summary\.js';/.test(read('src/lib/chat-renderers.js')) && /export \{ mcpParts \};/.test(read('src/lib/chat-renderers.js')));
// legibility affordances
check('expanded members carry the rail classes; collapsed runs carry none (one _setRunOpen writer)', /el\.classList\.toggle\('chat-run-member', run\.open\);/.test(cv) && /el\.classList\.toggle\('chat-run-first', run\.open && i === 0\);/.test(cv) && /el\.classList\.toggle\('chat-run-last', run\.open && i === n - 1\);/.test(cv));
check('lane run-fold-channel-compact WIRING: a LINKED member (channel rows — never a peer card, a machine card or an image) is compact exactly while its run is closed; every pass strips the class first; a swap carries it (fold-neutral, inc-mudv05ja); the all-exempt run still returns BEFORE any header is built (the dead-control law)',
  /const cc = !run\.open && !!run\.linked\?\.has\(el\);\n\s*if \(cc\) this\._compactHead\(el\);\n\s*el\.classList\.toggle\('chat-channel-compact', cc\);/.test(cv)
  && /list\.querySelectorAll\(':scope > \.chat-channel-compact'\)\.forEach\(\(el\) => el\.classList\.remove\('chat-channel-compact'\)\);/.test(cv)
  && /else if \(mc\) inline\.delete\(el\); \}\);\n\s*if \(inline\.size === members\.length\) \{ run = \[\]; runKind = null; return; \}\n[\s\S]{0,1400}?const linked = new Set\(members\.filter\(\(el, i\) => inline\.has\(el\) && el\.classList\.contains\('chat-channel-touched'\)\n\s*&& !el\.classList\.contains\('chat-peer-folded'\) && !machineCards\[i\] && memberKind\(el\) !== 'image'\)\);\n\s*if \(members\.length >= /.test(cv)
  && /linked: linked\.size,/.test(cv) && /\n\s*rec\.linked = linked;/.test(cv)
  && /const RUN_CLASSES = \['chat-run-collapsed', 'chat-channel-compact',/.test(cv) && /if \(run\.linked\?\.has\(oldEl\)\) \{ run\.linked\.delete\(oldEl\); run\.linked\.add\(newEl\); \}/.test(cv)
  && /_compactHead\(el\) \{[\s\S]{0,300}if \(!head \|\| head\.querySelector\(':scope > \.chat-channel-compact-cmd'\)\) return;[\s\S]{0,400}s\.textContent = words;/.test(cv));
check('the footer is a non-.chat-msg list child removed by every runs pass with the headers', /querySelectorAll\(':scope > \.chat-run-header, :scope > \.chat-run-footer'\)\.forEach\(\(h\) => h\.remove\(\)\);/.test(cv) && /f\.className = 'chat-run-footer';/.test(cv));
check('trims still count .chat-msg only (header/footer invisible to the window accounting) — ONE trim (_trimEdge, inc-mubvu3a4-x8sb) that both edges route through, selecting direct .chat-msg children', /querySelectorAll\(':scope > \.chat-msg:not\(\.chat-gap-msg\)'\)/.test(cv) && /_trimBottom\(\) \{ return this\._trimEdge\('bottom'\); \}/.test(cv) && /_trimTop\(\) \{ return this\._trimEdge\('top'\); \}/.test(cv));
check('the floating bar lives on the .chat-view container, never in the list', /bar\.className = 'chat-run-bar hidden';[\s\S]{0,900}this\._container\.appendChild\(bar\);/.test(cv) && !/_messageList\.appendChild\(bar\)/.test(cv));
check('bar state is computed in the scroll rAF with the frame\'s already-read scrollTop, BEFORE the programmatic-scroll early return', /const \{ scrollTop, scrollHeight, clientHeight \} = this\._messageList;\n(?:\s*this\._geomSeen = \{ st: Math\.round\(scrollTop\), sh: scrollHeight, ch: clientHeight, t: Date\.now\(\) \};[^\n]*\n)?[^\n]*\n\s*this\._updateRunBar\(scrollTop\);\n\s*if \(this\._programmaticScroll\) return;/.test(cv));
const barBody = cv.slice(cv.indexOf('  _updateRunBar(scrollTop) {'), cv.indexOf('  dispose() {'));
check('_updateRunBar never pages/trims/pins (no _extendTop/_extendBottom/_trim*/_pinned writes)', barBody.length > 100 && !/_extendTop|_extendBottom|_trimTop|_trimBottom|_pinned =/.test(barBody));
check('_setRunOpen hides its OWN footer mutation from the observer when called outside a pass (a user click is not a pass — the record used to schedule the pass that closed the run)',
  /const outsidePass = !this\._runsMutating;/.test(cv) && /if \(outsidePass\) this\._runsMutating = true;/.test(cv) && /if \(mutated\) this\._runsObserver\?\.takeRecords\(\);/.test(cv));
// 2.369.191 (lane S1): the census NAMES every `.replaceWith(` in chat-view — the ONE message-element swap
// (oldEl → newEl inside _swapMessageEl) and _patchAgentChip's chip, which replaces the lifecycle chip INSIDE a
// helper card's label (never a message element, so no run record or sticky mark can point at it). A third
// site of either spelling, or any other replaceWith, still reddens.
check('the sticky (user-opened) mark rides EVERY element swap — ONE helper, and no site replaces an element behind its back (2026-09-07: a third, hand-rolled site carried none of it; 2.369.191: the only other replaceWith is lane S1\'s agent-chip patch, a chip inside a card\'s label)',
  (cv.match(/if \(this\._runStickyOpen\?\.has\(oldEl\)\) this\._runStickyOpen\.add\(newEl\);/g) || []).length === 1
  && (cv.match(/if \(this\._runExpanded\?\.has\(oldEl\)\) this\._runExpanded\.add\(newEl\);/g) || []).length === 1
  && /_swapMessageEl\(oldEl, newEl, id\) \{/.test(cv)
  && (cv.match(/this\._swapMessageEl\(/g) || []).length === 5 // the 5th (lane exit-calls-in-history): the live Machines card upgrading a pending Bash call (an `exitCard` edit); the 4th site (2.369.118): a live Workflow card — since inc-mudv05ja only the in-place patch's structural fallback
  && (cv.match(/\.replaceWith\(/g) || []).length === 2
  && (cv.match(/oldEl\.replaceWith\(newEl\);/g) || []).length === 1
  && (cv.match(/old\.replaceWith\(chip\);/g) || []).length === 1
  && /_patchAgentChip\(id\) \{[\s\S]{0,1600}const old = label\.querySelector\(':scope > \.chat-task-status-chip'\);[\s\S]{0,400}old\.replaceWith\(chip\);/.test(cv));
check('inc-mudv05ja WIRING: the runs observer classifies through foldPassMode; the swap carries the four run classes, re-points the run records and reserves a rendered card\'s height; a live append reserves too',
  /if \(list && foldPassMode\(records\) === 'raf'\) \{/.test(cv) && !/records\.every\(\(r\) =>\s*r\.type === 'childList' && r\.removedNodes\.length === 0/.test(cv)
  && /for \(const c of RUN_CLASSES\) if \(oldEl\.classList\?\.contains\(c\)\) newEl\.classList\.add\(c\);/.test(cv)
  && /if \(i >= 0\) run\.members\[i\] = newEl;/.test(cv)
  && /const wasRendered = oldEl\.offsetParent != null;[\s\S]{0,120}oldEl\.replaceWith\(newEl\);[\s\S]{0,240}?if \(wasRendered\) this\._reserveFreshHeights\(\[newEl\], \{ live: true \}\);/.test(cv)   // int360: the needs-you focus hand-back (chat-needs-you-card) sits between the swap and the reserve — the ORDER stays pinned
  // THE LAW (.388, the train's seam): a LIVE append reserves the card's real height BEFORE the card is counted. midturn-order's
  // delivery order (r2 F4) put the window's growth — `const tail = this._windowEnd >= this._total;` — between the reserve and
  // the count, inside the same block; the order the law needs holds
  && /if \(!this\._loadingHistory\) \{[\s\S]{0,700}this\._reserveFreshHeights\(\[el\], \{ live: true \}\);(?:\n\s*\/\/[^\n]*|\n\s*const tail = this\._windowEnd >= this\._total;)*\n\s*this\._total\+\+;/.test(cv));
check('inc-mudv05ja WIRING: the pin writes only with somewhere to go and ends on convergence or an A-B-A height; a Workflow taskInfo edit schedules the in-place patch (no swap on the heartbeat)',
  /if \(sh - list\.scrollTop - list\.clientHeight > 1\) \{\n\s*this\._traceExpect\('fsb'\);\n\s*list\.scrollTop = sh;/.test(cv)
  && /if \(\+\+this\._fsbFrames < 10 && this\._fsbStable < 2 && !flicker\) requestAnimationFrame\(step\);/.test(cv)
  && /msg\.role === 'tool'\) \{\n\s*this\._scheduleWorkflowPatch\(id\);\n\s*\}/.test(cv)
  && /this\._renderers\.renderTaskChip\(ti, this\._workflowVerdict\(runId\)\)/.test(cv) && /this\._renderers\.renderWorkflowLive\(ti\)/.test(cv)
  && /this\.renderTaskChip\(tiW, runId \? this\._getWorkflowVerdict\?\.\(runId\) : null\)/.test(read('src/lib/chat-renderers.js')) && /this\.renderWorkflowLive\(tiW\)/.test(read('src/lib/chat-renderers.js')));
check('inc-mudv05ja WIRING: the workflow detail window is digest-gated with a persistent head, keyed rows and preserved expanders',
  (() => { const wd = read('src/lib/workflow-detail.js'); return /if \(digest === lastDigest\) return;/.test(wd) && /const rows = new Map\(\);/.test(wd) && /if \(openBoxes\.has\('result'\)\) box\.open = true;/.test(wd) && !/const render = \(wf\) => \{[\s\S]{0,400}root\.innerHTML = '';\n\n/.test(wd) && /class="workflow-agent-state" aria-hidden="true"/.test(wd); })());
check('the pinned auto-refold still folds every non-last run EXCEPT one the user opened deliberately (_runStickyOpen, keyed by member like _runExpanded)',
  /this\._runStickyOpen = new WeakSet\(\);/.test(cv) && /for \(const r of built\.slice\(0, -1\)\) \{/.test(cv)
  && /if \(r\.members\.some\(\(el\) => this\._runStickyOpen\.has\(el\)\)\) continue;/.test(cv)
  && /const isLast = this\._runs\?\.length \? this\._runs\[this\._runs\.length - 1\] === run : false;/.test(cv));
check('collapse-from-bar/footer lands ABSOLUTELY on the header under the programmatic-scroll mute', /_landOnHeader\(run\) \{[\s\S]{0,700}this\._programmaticScroll = true;[\s\S]{0,400}list\.scrollTop = run\.header\.offsetTop;/.test(cv) && /_collapseRunTo\(run\) \{[\s\S]{0,200}this\._setRunOpen\(run, false\);\s*this\._landOnHeader\(run\);/.test(cv));
const suspendBody = cv.slice(cv.indexOf('  setSuspended(on) {'), cv.indexOf('  async _extendTop('));
check('suspend hides the bar; resume + every runs pass re-schedule it; dispose cancels the rAF', /if \(on\) this\._updateRunBar\(0\);/.test(suspendBody) && /this\._lastStructuralAt = Date\.now\(\);\n\s*this\._scheduleRunBar\(\);/.test(suspendBody) && /this\._runsObserver\?\.takeRecords\(\);\n\s*this\._scheduleRunBar\(\);/.test(cv) && /cancelAnimationFrame\(this\._runBarRaf\)/.test(cv));
check('_withViewportAnchor + the seek gap anchor skip run chrome (header/footer are rebuilt by the pass = dead anchors)', /const runChrome = \(c\) => c\.classList\.contains\('chat-run-header'\) \|\| c\.classList\.contains\('chat-run-footer'\);/.test(cv)
  && /chat-run-header'\) \|\| gapA\.classList\?\.contains\('chat-run-footer'\)/.test(read('src/lib/chat-view-seek.js')));
check('no Esc binding for the run chrome (data-popover owns Esc)', !/Escape/.test(barBody) && !/key === 'Escape'[\s\S]{0,200}chat-run/.test(cv));
const css = read('public/chat.css');
check('chat.css (lane run-fold-channel-compact): a compact card hides every body but its head, its rows, an API card and a proposal the call filed (lane chat-proposal-card — a card awaiting the person is never folded away); the command words draw only while compact',
  /\.chat-msg\.chat-channel-compact \.chat-tool-use > :not\(\.chat-tool-label\):not\(\.chat-channel-touches\):not\(\.chat-api-cards\):not\(\.chat-chan-props\) \{ display: none; \}/.test(css)
  && /\.chat-msg\.chat-channel-compact \.chat-tool-use > \.chat-api-cards, \.chat-msg\.chat-channel-compact \.chat-tool-use > \.chat-chan-props \{ flex: 1 1 100%; \}/.test(css)
  && /\.chat-channel-compact-cmd \{ display: none; \}/.test(css) && /\.chat-msg\.chat-channel-compact \.chat-channel-compact-cmd \{ display: inline;/.test(css));
check('chat.css: rail on members in BOTH role-indicator families, footer + bar styled with theme vars only', /\.chat-msg\.chat-run-member \{/.test(css) && /\[data-role-indicator="border"\] \.chat-msg\.chat-run-member \{/.test(css)
  && /\.chat-run-footer \{/.test(css) && /\.chat-run-bar \{/.test(css) && /\.chat-run-bar\.hidden \{ display: none; \}/.test(css)
  && !/chat-run-(member|footer|bar)[^}]*#[0-9a-f]{3,6}/i.test(css.slice(css.indexOf('Expanded-run legibility'))));
check('the history-load pill is positioned by the STYLESHEET (an inline top beats every selector) and drops below the bar with the position pill',
  !/chat-history-status';\n\s*el\.style\.cssText/.test(cv) && /\.chat-history-status \{\n\s*position: absolute; top: 6px;/.test(css)
  && /\.chat-view\.chat-run-bar-on \.chat-pos-indicator,\n\.chat-view\.chat-run-bar-on \.chat-history-status \{ top: 34px; \}/.test(css));
check('icons: SVG chevron + arrow-up-to-line in icons.js (no emoji)', /chevronUp:\s+_s\(/.test(read('src/lib/icons.js')) && /arrowUpToLine:\s+_s\(/.test(read('src/lib/icons.js')));
for (const f of ['src/lib/i18n-zh.js', 'src/lib/i18n-ja.js']) {
  const d = read(f);
  check(`${path.basename(f)} carries the new keys`, ['"{n} tool lookups":', '"Collapse":', '"Collapse run":', '"Jump to top of run":'].every((k) => d.includes(k)));
}

console.log(failed ? `\n${failed} FAILED (${passed} passed)` : `\nALL PASS (${passed})`);
process.exit(failed ? 1 : 0);
