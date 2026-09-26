#!/usr/bin/env node
// Run-fold UX (2.369.37, owner report on a claude window): the fold summary
// read "9 条 Bash · 1 次 MCP · 1 ✗" over a run whose only non-Bash card was a
// ToolSearch — the classifier lumped tool-schema lookups into 'mcp' and the
// label CLAIMED an MCP call that never happened; and an expanded run taller
// than a screen was indistinguishable from loose cards, with re-collapsing a
// scroll-up hunt for the summary line.
//   Part 1 (node, DOM-free): the PURE classifier + summary composer in
//     src/lib/chat-run-summary.js — ToolSearch is 'lookup' (folds under the
//     MCP toggle, labelled "N tool lookups"), the MCP count + "(server)"
//     suffix cover only mcp__server__tool calls, every kind the classifier
//     returns has a summary line (the 2.369.34 NaN class, now structural).
//   Part 2 (headless chrome, SKIPs without chrome): a throwaway worktree
//     server + a synthetic transcript with one long tool run. Expanding marks
//     members with the rail classes + inserts the footer; scrolling past the
//     header shows the floating bar with the run's label; clicking it
//     collapses WITHOUT a scroll jump (header lands within ±8px of the
//     viewport top); the footer collapses and lands the header the same way;
//     the footer exists only while expanded; the bar hides while the header
//     is on screen (negative control) and "jump to top" keeps the run open.
// Run: node scripts/test-fold-ux.mjs
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, ONBOARDED_SOURCE, vncEnv } from './scratch.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port for every server this suite boots (never the machine-global :7/5901 — test-architecture §57)
const require = createRequire(import.meta.url);

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0, passed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 400) : ''}`); } };
const read = (f) => fs.readFileSync(path.join(repo, f), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Part 1: pure classifier + summary composer ──────────────────────────────
const S = await import(path.join(repo, 'src/lib/chat-run-summary.js'));
const t = (k, p) => k.replace(/\{(\w+)\}/g, (m, x) => (p && p[x] !== undefined ? String(p[x]) : m));
const tool = (toolName, input = {}, extra = {}, block = {}) => ({ role: 'assistant', content: [{ type: 'tool_use', toolName, input, ...block }], ...extra });
const kindOf = (m, opts = {}) => S.messageKind(m, { toolCard: true, ...opts });

check('ToolSearch classifies as lookup (NOT mcp)', kindOf(tool('ToolSearch', { query: 'select:Read' })) === 'lookup');
check('mcp__server__tool classifies as mcp', kindOf(tool('mcp__chrome-devtools__click')) === 'mcp');
check('lookup folds under the MCP toggle (no new checkbox; customised kind lists keep folding what they fold today)', S.foldToggleFor('lookup') === 'mcp' && S.foldToggleFor('bash') === 'bash' && S.foldToggleFor('mcp') === 'mcp');
check('claude name map: Bash/Grep/Read/Edit/WebSearch/Skill/Agent', kindOf(tool('Bash')) === 'bash' && kindOf(tool('Grep')) === 'read' && kindOf(tool('Read', { file_path: '/a/b.js' })) === 'read'
  && kindOf(tool('Edit', { file_path: '/a/b.js' })) === 'write' && kindOf(tool('WebSearch')) === 'search' && kindOf(tool('Skill')) === 'skill' && kindOf(tool('Agent')) === 'agent');
// EVIDENCE, NEVER THE EXTENSION (image-card review round 2, 2026-09-06): a Read is an image view only when
// its RESULT carried lifted image blocks — a claude `Read *.svg` comes back as
// numbered TEXT (12/12 real fleet reads), and the extension rule both counted
// those as "image reads" and (since image members are fold-exempt) let a plain
// text card escape its run.
check("a Read is 'image' only with lifted image blocks; a text result of any image extension is a plain read",
  kindOf(tool('Read', { file_path: '/shots/x.PNG' }, {}, { images: [{ mediaType: 'image/png', bytes: 12 }] })) === 'image'
  && kindOf(tool('Read', { file_path: '/shots/x.PNG' })) === 'read'
  && kindOf(tool('Read', { file_path: '/w/logo.svg' })) === 'read'
  && kindOf(tool('Read', { file_path: '/w/no-ext' }, {}, { images: [{ mediaType: 'image/png', bytes: 12 }] })) === 'image');
check("codex/ACP still decide by the stamped collapseKind (view_image → image)", kindOf(tool('view_image', { path: '/w/a.png' }, { collapseKind: 'image' })) === 'image');
check('semantic collapseKind hint wins (codex exec → bash) and memory paths override read/write hints', kindOf(tool('exec', {}, { collapseKind: 'bash' })) === 'bash'
  && kindOf(tool('Patch', { file_path: '/home/u/.claude/projects/x/memory/MEMORY.md' }, { collapseKind: 'write' }), { isMemoryPath: (fp) => /\/memory\//.test(fp) }) === 'memory');
check('unknown tool → null (breaks the run — every new tool name needs a kind); pure thinking → thinking; text → null',
  kindOf(tool('SomethingNew')) === null && S.messageKind({ role: 'assistant', content: [{ type: 'thinking', thinking: 'hm' }] }, { toolCard: false }) === 'thinking'
  && S.messageKind({ role: 'assistant', content: [{ type: 'text', text: 'hi' }] }, { toolCard: false }) === null);

// the owner's run: 9 Bash (one failed) + 1 ToolSearch
const ownerKinds = [...Array(9).fill('bash'), 'lookup'];
const ownerLabel = S.runSummaryLabel({ byKind: S.countKinds(ownerKinds), mcpServers: new Set(), nErr: 1 }, t);
check('owner run label = "9 Bash · 1 tool lookups · 1 ✗" (no MCP claimed)', ownerLabel === '9 Bash · 1 tool lookups · 1 ✗', ownerLabel);
check('the MCP line + "(server)" suffix cover ONLY real MCP calls', S.runSummaryParts(S.countKinds(['mcp', 'mcp']), new Set(['chrome-devtools']), t).join(' · ') === '2 MCP (chrome-devtools)'
  && S.runSummaryParts(S.countKinds(['mcp', 'mcp']), new Set(['a', 'b']), t).join(' · ') === '2 MCP'
  && S.runSummaryParts(S.countKinds(['mcp', 'lookup']), new Set(['x']), t).join(' · ') === '1 MCP (x) · 1 tool lookups');
check('every kind the classifier can return has a summary line entry (the 2.369.34 NaN class, structural)', S.RUN_KINDS.every((k) => S.SUMMARY_ORDER.some(([kk]) => kk === k)));
check('countKinds zero-fills every kind and still counts an unlisted one (never NaN)', (() => {
  const c = S.countKinds(['lookup', 'bash', 'bash', null, 'brandnew']);
  return S.RUN_KINDS.every((k) => Number.isFinite(c[k])) && c.lookup === 1 && c.bash === 2 && c.brandnew === 1 && c.mcp === 0;
})());
check('files/errors/running composition', S.runSummaryLabel({ byKind: S.countKinds(['read', 'read']), files: ['a.js', 'b.js', 'c.js', 'd.js', 'e.js'], running: true }, t) === '2 file reads — a.js, b.js, c.js, d.js, +1 · running…');
check('mcpParts splits mcp__server__tool and rejects the rest', JSON.stringify(S.mcpParts('mcp__a__b_c')) === '{"server":"a","tool":"b_c"}' && S.mcpParts('Bash') === null && S.mcpParts('') === null);
check('the pure module imports nothing (DOM-free by construction)', !/^\s*import /m.test(read('src/lib/chat-run-summary.js')));

// ── inc-mudv05ja-n5rv: WHEN THE FOLD PASS RUNS — the PURE classifier ─────────
{
  const N = (n) => ({ length: n });
  const rec = (a, d, { prev = {}, next = null } = {}) => ({ type: 'childList', addedNodes: N(a), removedNodes: N(d), previousSibling: prev, nextSibling: next });
  const tail = rec(1, 0), replace = rec(1, 1, { next: {} }), replaceLast = rec(1, 1), head = rec(0, 1, { prev: null, next: {} });
  const rows = [
    ['a live tail append', [tail], 'raf'],
    ['three tail appends in one batch', [tail, tail, tail], 'raf'],
    ['a 1:1 replace in the middle (a tool completion\'s replaceWith)', [replace], 'raf'],
    ['a 1:1 replace of the LAST card', [replaceLast], 'raf'],
    ['a tail append + the live trim of the first children', [tail, head, head], 'raf'],
    ['a replace + a head trim', [replace, head], 'raf'],
    ['a head trim ALONE (nothing new to fold)', [head, head], 'debounce'],
    ['a non-tail insert (prepend / page-up slab)', [rec(5, 0, { next: {} })], 'debounce'],
    ['a multi-node replace', [rec(3, 2, { next: {} })], 'debounce'],
    ['a removal in the middle', [rec(0, 1, { prev: {}, next: {} })], 'debounce'],
    ['a bulk insert mixed with a tail append', [tail, rec(4, 0, { next: {} })], 'debounce'],
    ['no records', [], 'debounce'],
    ['an attribute record', [{ type: 'attributes' }], 'debounce'],
  ];
  const bad = rows.filter(([, r, want]) => S.foldPassMode(r) !== want).map(([n, r]) => n + ' → ' + S.foldPassMode(r));
  check(`foldPassMode table (${rows.length} rows): tail append / 1:1 replace / append+first-child trim ⇒ raf; bulk / non-tail / head-trim-only ⇒ debounce`, bad.length === 0, bad);
  // CONTROL: the pre-fix rule `every(tailAppend)` sends the swap and the trim-cap append to the debounce
  const preFix = (records) => (records.length && records.every((r) => r.type === 'childList' && r.removedNodes.length === 0 && r.addedNodes.length > 0 && r.nextSibling === null) ? 'raf' : 'debounce');
  check('CONTROL: the pre-fix every(tailAppend) rule debounces a 1:1 replace and an append at the trim cap (the 180 ms unfolded paint)', preFix([replace]) === 'debounce' && preFix([tail, head]) === 'debounce' && preFix([tail]) === 'raf');
}

// ── wiring pins (a pure fix with an unstaged call site is dead: the 2.355.0 lesson) ──
const cv = read('src/lib/chat-view.js');
check('chat-view imports the classifier + composer from chat-run-summary.js', /import \{ mcpParts, messageKind, foldToggleFor, countKinds, runSummaryLabel, foldPassMode \} from '\.\/chat-run-summary\.js';/.test(cv));
// …and the ONE composer also positions the collab traffic segment (2026-09-07):
// chat-view hands it a PRE-COMPOSED string from the pure collab module, so this
// module still imports nothing and the order never forks between the header,
// the floating bar and the footer.
check('chat-view builds the label ONLY through runSummaryLabel (no inline per-kind t() lines left)', /runSummaryLabel\(\{\s*\n?\s*byKind, mcpServers, files, nErr, running,\s*\n?\s*collabPart: collabRunPart\(collabStats, \{ now, live, t \}\),\s*\n?\s*\}, t\)/.test(cv) && !cv.includes("t('{n} MCP'") && !cv.includes("t('{n} Bash'"));
check('memberKind delegates to messageKind; folding gates on foldToggleFor', /messageKind\(el\._rawMsg, \{ toolCard: el\.classList\.contains\('chat-msg-tool-result'\), isMemoryPath \}\)/.test(cv) && /kinds\.has\(foldToggleFor\(mk\)\)/.test(cv));
check('chat-renderers re-exports the ONE mcpParts from the pure module', /import \{ mcpParts \} from '\.\/chat-run-summary\.js';/.test(read('src/lib/chat-renderers.js')) && /export \{ mcpParts \};/.test(read('src/lib/chat-renderers.js')));
// legibility affordances
check('expanded members carry the rail classes; collapsed runs carry none (one _setRunOpen writer)', /el\.classList\.toggle\('chat-run-member', run\.open\);/.test(cv) && /el\.classList\.toggle\('chat-run-first', run\.open && i === 0\);/.test(cv) && /el\.classList\.toggle\('chat-run-last', run\.open && i === n - 1\);/.test(cv));
check('the footer is a non-.chat-msg list child removed by every runs pass with the headers', /querySelectorAll\(':scope > \.chat-run-header, :scope > \.chat-run-footer'\)\.forEach\(\(h\) => h\.remove\(\)\);/.test(cv) && /f\.className = 'chat-run-footer';/.test(cv));
check('trims still count .chat-msg only (header/footer invisible to the window accounting) — ONE trim (_trimEdge, inc-mubvu3a4-x8sb) that both edges route through, selecting direct .chat-msg children', /querySelectorAll\(':scope > \.chat-msg:not\(\.chat-gap-msg\)'\)/.test(cv) && /_trimBottom\(\) \{ return this\._trimEdge\('bottom'\); \}/.test(cv) && /_trimTop\(\) \{ return this\._trimEdge\('top'\); \}/.test(cv));
check('the floating bar lives on the .chat-view container, never in the list', /bar\.className = 'chat-run-bar hidden';[\s\S]{0,900}this\._container\.appendChild\(bar\);/.test(cv) && !/_messageList\.appendChild\(bar\)/.test(cv));
check('bar state is computed in the scroll rAF with the frame\'s already-read scrollTop, BEFORE the programmatic-scroll early return', /const \{ scrollTop, scrollHeight, clientHeight \} = this\._messageList;\n[^\n]*\n\s*this\._updateRunBar\(scrollTop\);\n\s*if \(this\._programmaticScroll\) return;/.test(cv));
const barBody = cv.slice(cv.indexOf('  _updateRunBar(scrollTop) {'), cv.indexOf('  dispose() {'));
check('_updateRunBar never pages/trims/pins (no _extendTop/_extendBottom/_trim*/_pinned writes)', barBody.length > 100 && !/_extendTop|_extendBottom|_trimTop|_trimBottom|_pinned =/.test(barBody));
check('_setRunOpen hides its OWN footer mutation from the observer when called outside a pass (a user click is not a pass — the record used to schedule the pass that closed the run)',
  /const outsidePass = !this\._runsMutating;/.test(cv) && /if \(outsidePass\) this\._runsMutating = true;/.test(cv) && /if \(mutated\) this\._runsObserver\?\.takeRecords\(\);/.test(cv));
check('the sticky (user-opened) mark rides EVERY element swap — ONE helper, and no site replaces an element behind its back (2026-09-07: a third, hand-rolled site carried none of it)',
  (cv.match(/if \(this\._runStickyOpen\?\.has\(oldEl\)\) this\._runStickyOpen\.add\(newEl\);/g) || []).length === 1
  && (cv.match(/if \(this\._runExpanded\?\.has\(oldEl\)\) this\._runExpanded\.add\(newEl\);/g) || []).length === 1
  && /_swapMessageEl\(oldEl, newEl, id\) \{/.test(cv)
  && (cv.match(/this\._swapMessageEl\(/g) || []).length === 4 // the 4th site (2.369.118): a live Workflow card — since inc-mudv05ja only the in-place patch's structural fallback
  && (cv.match(/\.replaceWith\(/g) || []).length === 1);
check('inc-mudv05ja WIRING: the runs observer classifies through foldPassMode; the swap carries the four run classes, re-points the run records and reserves a rendered card\'s height; a live append reserves too',
  /if \(list && foldPassMode\(records\) === 'raf'\) \{/.test(cv) && !/records\.every\(\(r\) =>\s*r\.type === 'childList' && r\.removedNodes\.length === 0/.test(cv)
  && /for \(const c of RUN_CLASSES\) if \(oldEl\.classList\?\.contains\(c\)\) newEl\.classList\.add\(c\);/.test(cv)
  && /if \(i >= 0\) run\.members\[i\] = newEl;/.test(cv)
  && /const wasRendered = oldEl\.offsetParent != null;[\s\S]{0,120}oldEl\.replaceWith\(newEl\);\n\s*if \(wasRendered\) this\._reserveFreshHeights\(\[newEl\], \{ live: true \}\);/.test(cv)
  && /if \(!this\._loadingHistory\) \{[\s\S]{0,700}this\._reserveFreshHeights\(\[el\], \{ live: true \}\);\n\s*this\._total\+\+;/.test(cv));
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

// ── Part 2: headless chrome over a real view-only ChatView ──────────────────
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) {
  console.log(`  SKIP: no chrome/chromium — browser half not run`);
  console.log(failed ? `\n${failed} FAILED (${passed} passed)` : `\nALL PASS (${passed})`);
  process.exit(failed ? 1 : 0);
}
const [PORT, CDP_PORT] = await freePorts(2); // per-process (scripts/scratch.mjs) — a pid-modulo port was a 1-in-20 collision
const wt = `/tmp/vs-foldux-${process.pid}`;
const fakeHome = `${wt}-home`;
const CWD = `${wt}-cwd`;
const SID = 'f01d0000-0000-4000-8000-00000000ffee';
const IMG_SID = 'f01d0000-0000-4000-8000-00000000f11e';
const IMG_PATH = `${CWD}/shot.png`;
// a real 8×8 opaque PNG — the thumbnail must actually decode (naturalWidth > 0)
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGMwnnkGK2IYWhIAtNFmAVCW3mYAAAAASUVORK5CYII=';
// 28 Bash + 1 ToolSearch = a run taller than the window; 8 tall text turns
// AFTER it so the header can land at the viewport top once the run collapses
// (with nothing below, scrollTop just clamps to 0), then a SHORT mcp run after
// the last text turn. TWO runs is not decoration: the pinned auto-refold only
// exists when built.length > 1 and its `built.slice(0, -1)` shape closes every
// run except the LAST — with a single-run fixture the whole branch (and the
// 2026-09-06 open-then-refold bug under it) was unreachable while 51 asserts
// stayed green. Total 50 = exactly the initial tail window, so the whole
// transcript renders without paging.
const NBASH = 28, NTAIL = 8, NMCP = 2;
{
  const lines = [];
  let ts0 = Date.now() - 3600e3;
  const ts = () => new Date((ts0 += 5e3)).toISOString();
  let n = 0;
  const push = (o) => lines.push(JSON.stringify(o));
  const FAT = 'a fat line of tool output that adds real rendered height 0123456789\n';
  push({ type: 'user', message: { role: 'user', content: 'please do the thing' }, uuid: `u-${n++}`, timestamp: ts() });
  push({ type: 'assistant', message: { id: `msg_${n}`, role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text: 'On it.' }], usage: { input_tokens: 1, output_tokens: 1 } }, uuid: `a-${n++}`, timestamp: ts() });
  for (let b = 0; b < NBASH; b++) {
    const tid = `toolu_b${b}`;
    push({ type: 'assistant', message: { id: `msg_${n}`, role: 'assistant', model: 'claude-fable-5', content: [{ type: 'tool_use', id: tid, name: 'Bash', input: { command: `echo step ${b}` } }], usage: {} }, uuid: `tu-${n++}`, timestamp: ts() });
    push({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: tid, is_error: b === 3, content: `output ${b}\n` + FAT.repeat(12) }] }, uuid: `tr-${n++}`, timestamp: ts() });
  }
  push({ type: 'assistant', message: { id: `msg_${n}`, role: 'assistant', model: 'claude-fable-5', content: [{ type: 'tool_use', id: 'toolu_ts', name: 'ToolSearch', input: { query: 'select:Read', max_results: 1 } }], usage: {} }, uuid: `tu-${n++}`, timestamp: ts() });
  push({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_ts', content: '<functions>…</functions>' }] }, uuid: `tr-${n++}`, timestamp: ts() });
  push({ type: 'assistant', message: { id: `msg_${n}`, role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text: 'All done.' }], usage: { input_tokens: 1, output_tokens: 1 } }, uuid: `af-${n++}`, timestamp: ts() });
  const PROSE = 'line of explanatory prose that wraps around and adds real rendered height\n'.repeat(14);
  for (let k = 0; k < NTAIL; k++) {
    push({ type: 'user', message: { role: 'user', content: `follow-up ${k}` }, uuid: `u-${n++}`, timestamp: ts() });
    push({ type: 'assistant', message: { id: `msg_${n}`, role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text: `reply ${k}:\n${PROSE}` }], usage: { input_tokens: 1, output_tokens: 1 } }, uuid: `af-${n++}`, timestamp: ts() });
  }
  // run 2 — a short mcp run after the last text turn (the LAST run: the one
  // the pinned auto-refold deliberately spares)
  for (let m = 0; m < NMCP; m++) {
    const tid = `toolu_m${m}`;
    push({ type: 'assistant', message: { id: `msg_${n}`, role: 'assistant', model: 'claude-fable-5', content: [{ type: 'tool_use', id: tid, name: 'mcp__chrome-devtools__click', input: { uid: `e${m}` } }], usage: {} }, uuid: `tu-${n++}`, timestamp: ts() });
    push({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: tid, content: `clicked ${m}\n` }] }, uuid: `tr-${n++}`, timestamp: ts() });
  }
  const proj = path.join(fakeHome, '.claude', 'projects', CWD.replace(/[/._]/g, '-'));
  fs.mkdirSync(proj, { recursive: true });
  fs.mkdirSync(CWD, { recursive: true });
  fs.writeFileSync(path.join(proj, `${SID}.jsonl`), lines.join('\n') + '\n');

  // ── the MIXED run (image-card review round 2, 2026-09-06): Bash → Read(png) → Bash, the shape a media
  // card really lands in. A run-level exemption left this card display:none
  // inside "2 Bash · 1 image reads" (browser ground truth) — the image MEMBER
  // must stay visible while the run folds around it, and its lazy thumbnail
  // must actually FETCH, so the fixture writes a REAL png the server can serve
  // through /api/file/raw.
  fs.writeFileSync(IMG_PATH, Buffer.from(PNG_B64, 'base64'));
  const il = [];
  let its0 = Date.now() - 1800e3;
  const its = () => new Date((its0 += 5e3)).toISOString();
  let m = 0;
  const ipush = (o) => il.push(JSON.stringify(o));
  ipush({ type: 'user', message: { role: 'user', content: 'look at the screenshot' }, uuid: `iu-${m++}`, timestamp: its() });
  ipush({ type: 'assistant', message: { id: `imsg_${m}`, role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text: 'Checking.' }], usage: { input_tokens: 1, output_tokens: 1 } }, uuid: `ia-${m++}`, timestamp: its() });
  for (const [i, name] of [[0, 'Bash'], [1, 'Read'], [2, 'Bash']]) {
    const tid = `toolu_i${i}`;
    const input = name === 'Bash' ? { command: `ls -l ${i}` } : { file_path: IMG_PATH };
    ipush({ type: 'assistant', message: { id: `imsg_${m}`, role: 'assistant', model: 'claude-fable-5', content: [{ type: 'tool_use', id: tid, name, input }], usage: {} }, uuid: `itu-${m++}`, timestamp: its() });
    const content = name === 'Bash'
      ? `listing ${i}\n`
      : [{ type: 'text', text: 'Read the image.' }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG_B64 } }];
    ipush({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: tid, content }] }, uuid: `itr-${m++}`, timestamp: its() });
  }
  ipush({ type: 'assistant', message: { id: `imsg_${m}`, role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text: 'Looks right.' }], usage: { input_tokens: 1, output_tokens: 1 } }, uuid: `iaf-${m++}`, timestamp: its() });
  fs.writeFileSync(path.join(proj, `${IMG_SID}.jsonl`), il.join('\n') + '\n');
}
// ── F5 fixture (2026-09-26): workflow RUN DIRS in the real files' KEY shapes (values synthetic) under
// the view's own session — the owner's shape: 5 phases (1/7/1/1/1), 11 started, 10 results, no
// terminal snapshot, every file 2 days old (stalled); and a twin written "now" (running).
const WF_AGENTS = [['survey:map', 'survey'], ...Array.from({ length: 7 }, (_, i) => [`lane:${i}`, 'lanes']), ['merge:all', 'merge'], ['qa:gate', 'qa'], ['ship:it', 'ship']]
  .map(([label, phase], i) => ({ id: 'b' + (i + 1).toString(16).padStart(16, '0'), label, phase, result: i < 10 }));
const WF_PHASES = ['survey', 'lanes', 'merge', 'qa', 'ship'];
const wfRunDir = (runId) => path.join(fakeHome, '.claude', 'projects', CWD.replace(/[/._]/g, '-'), SID, 'subagents', 'workflows', runId);
const writeWfRun = (runId, mtimeMs) => {
  const dir = wfRunDir(runId);
  fs.mkdirSync(dir, { recursive: true });
  const key = (a) => ('k:' + a.label + ':').padEnd(67, '0');
  const lines = [{ type: 'launched' }, ...WF_AGENTS.map((a) => ({ type: 'started', key: key(a), agentId: a.id, label: a.label, phase: a.phase })),
    ...WF_AGENTS.filter((a) => a.result).map((a) => ({ type: 'result', key: key(a), agentId: a.id, result: { ok: true } }))];
  fs.writeFileSync(path.join(dir, 'journal.jsonl'), lines.map((o) => JSON.stringify(o)).join('\n') + '\n');
  for (const a of WF_AGENTS) {
    fs.writeFileSync(path.join(dir, `agent-${a.id}.jsonl`), JSON.stringify({ type: 'user', message: { role: 'user', content: 'synthetic prompt' } }) + '\n');
    fs.writeFileSync(path.join(dir, `agent-${a.id}.meta.json`), JSON.stringify({ agentType: 'workflow-subagent', description: a.label, workflowPhase: a.phase, spawnDepth: 1, requestShape: 'subagent-x', requestNonInteractive: true, model: 'opus' }));
  }
  const at = new Date(mtimeMs);
  for (const f of fs.readdirSync(dir)) fs.utimesSync(path.join(dir, f), at, at);
};
writeWfRun('wf_e2e0foldstall', Date.now() - 2 * 24 * 3600e3);
writeWfRun('wf_e2e0foldstall2', Date.now() - 2 * 24 * 3600e3); // the card-comes-back leg's control twin (lane Q verify)
writeWfRun('wf_e2e0foldlive', Date.now());

try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
// NO rebuild (the gate-admission diet): overlay the ALREADY-BUILT public/ —
// the gate's step 1 built it; standalone runs test the last `npm run build`.
for (const f of ['src', 'public', 'server.js', 'package.json']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' }, stdio: 'ignore' });
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--window-size=1400,1000',
  '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-timer-throttling', `--user-data-dir=${wt}-chrome`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv.kill('SIGKILL'); } catch {}
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  for (const d of [`${wt}-chrome`, fakeHome, CWD]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
};
process.on('exit', cleanup);
for (let i = 0; i < 60; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); break; } catch { await sleep(250); } }

const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 120 && !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((x) => x.type === 'page'); } catch {}
  if (!target) await sleep(250);
}
if (!target) { console.error('✗ chrome never exposed a CDP page target'); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => ws.on('open', r));
let seq = 0; const pend = new Map(); const pageErrors = [];
ws.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') { try { pageErrors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'unknown'); } catch {} }
});
const cdp = (method, params = {}) => new Promise((res) => { const id = ++seq; pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const evaljs = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 600));
  return r.result?.result?.value;
};
await cdp('Runtime.enable'); await cdp('Page.enable');
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
for (let i = 0; i < 100; i++) { if (await evaljs('!!(window.app && window.app.ready && window.app.wm)').catch(() => false)) break; await sleep(300); }
await evaljs('window.app.ready.then(() => true)').catch(() => {});
await sleep(1200);

// open the view-only chat and wait for the fold header
const opened = await evaljs(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  window.app.viewSession('${SID}', '${CWD}', 'fold ux');
  let list = null, header = null;
  for (let i = 0; i < 80; i++) {
    list = document.querySelector('.chat-message-list');
    header = list && list.querySelector(':scope > .chat-run-header');
    if (header) break;
    await sleep(250);
  }
  for (let i = 0; i < 40 && list.querySelectorAll(':scope > .chat-run-header').length < 2; i++) await sleep(150);
  if (!header) return { ok: false, n: list ? list.querySelectorAll('.chat-msg').length : -1 };
  await sleep(900); // fold settle + initial pin
  window.__list = list;
  const view = document.querySelector('.chat-view');
  return { ok: true, n: list.querySelectorAll(':scope > .chat-msg').length, headers: list.querySelectorAll(':scope > .chat-run-header').length,
    label: header.textContent.trim(), ch: list.clientHeight, sh: list.scrollHeight, cv: !!view };
})()`);
check('view-only chat rendered with TWO fold headers (the long tool run + the short mcp run)', opened?.ok && opened.headers === 2, JSON.stringify(opened));
check(`header label = "${NBASH} Bash · 1 tool lookups · 1 ✗" — the ToolSearch is a tool lookup, never MCP (got: ${opened?.label})`, (opened?.label || '').replace(/^▸\s*/, '') === `${NBASH} Bash · 1 tool lookups · 1 ✗`);

const state = () => evaljs(`(() => {
  const list = window.__list; const view = document.querySelector('.chat-view');
  const header = list.querySelector(':scope > .chat-run-header');
  const bar = view.querySelector('.chat-run-bar');
  const members = [...list.querySelectorAll(':scope > .chat-msg.chat-run-member')];
  return {
    open: header?.classList.contains('open') || false,
    members: members.length,
    first: members[0]?.classList.contains('chat-run-first') || false,
    last: members[members.length - 1]?.classList.contains('chat-run-last') || false,
    firstIsCard: members[0]?.classList.contains('chat-msg-tool-result') || false,
    collapsed: list.querySelectorAll(':scope > .chat-msg.chat-run-collapsed').length,
    footers: list.querySelectorAll(':scope > .chat-run-footer').length,
    footerText: list.querySelector(':scope > .chat-run-footer')?.textContent.trim() || '',
    footerIsMsg: !!list.querySelector(':scope > .chat-run-footer.chat-msg'),
    barShown: !!bar && !bar.classList.contains('hidden'),
    barLabel: bar?.querySelector('.chat-run-bar-label')?.textContent || '',
    barInList: !!list.querySelector('.chat-run-bar'),
    barTop: bar ? bar.offsetTop : -1, listTop: list.offsetTop,
    headerTop: header ? header.offsetTop : -1, st: list.scrollTop, sh: list.scrollHeight, ch: list.clientHeight,
    label: header?.textContent.trim() || '',
    msgs: list.querySelectorAll(':scope > .chat-msg').length,
  };
})()`);
const scrollTo = async (expr, waitMs = 120) => evaljs(`(async () => {
  const list = window.__list; const header = list.querySelector(':scope > .chat-run-header');
  list.scrollTop = ${expr}; list.dispatchEvent(new Event('scroll'));
  await new Promise((r) => setTimeout(r, ${waitMs}));
  return list.scrollTop;
})()`);
const click = async (sel, waitMs = 120) => evaljs(`(async () => {
  const el = document.querySelector('.chat-view ' + ${JSON.stringify(sel)});
  if (!el) return false;
  el.click();
  await new Promise((r) => setTimeout(r, ${waitMs}));
  return true;
})()`);

// collapsed: nothing of the expanded chrome
const s0 = await state();
check('collapsed run: no rail classes, no footer, no bar', !s0.open && s0.members === 0 && s0.footers === 0 && !s0.barShown && s0.collapsed === NBASH + 1 + NMCP, JSON.stringify(s0));
check('the list stays FLAT (members are direct .chat-msg children; footer/bar are not .chat-msg)', s0.msgs > NBASH && !s0.footerIsMsg && !s0.barInList);

// expand via the header
await click('.chat-run-header', 400);
const s1 = await state();
check(`expanded: every member carries .chat-run-member (${s1.members}/${NBASH + 1}), first/last marked`, s1.open && s1.members === NBASH + 1 && s1.first && s1.last && s1.firstIsCard && s1.collapsed === NMCP, JSON.stringify(s1));
check('expanded: the footer exists (non-.chat-msg) and reads "Collapse · <label>"', s1.footers === 1 && !s1.footerIsMsg && /^Collapse · /.test(s1.footerText) && s1.footerText.includes('tool lookups'), s1.footerText);
check('expanded run is taller than the viewport (the reported situation)', s1.sh > s1.ch * 1.5, `sh=${s1.sh} ch=${s1.ch}`);
check('header on screen ⇒ no floating bar (negative control)', (() => { const headerVisible = s1.headerTop >= s1.st && s1.headerTop < s1.st + s1.ch; return !headerVisible || !s1.barShown; })(), JSON.stringify(s1));

// scroll past the header → the bar shows with the run's label, pinned to the list's top edge
await scrollTo('header.offsetTop + Math.round(list.clientHeight * 0.8)', 150);
const s2 = await state();
check('header scrolled above the viewport ⇒ floating bar shown with the run label', s2.barShown && s2.barLabel === s2.label.replace(/^▸\s*/, '') && s2.headerTop < s2.st, JSON.stringify({ shown: s2.barShown, barLabel: s2.barLabel, label: s2.label, headerTop: s2.headerTop, st: s2.st }));
check('the bar sits on the container at the message list\'s top edge', !s2.barInList && Math.abs(s2.barTop - s2.listTop) <= 1, `barTop=${s2.barTop} listTop=${s2.listTop}`);

// "jump to top of run" keeps the run open and lands the header at the top
await click('.chat-run-bar-top', 150);
const s3 = await state();
check('jump-to-top: run stays expanded, header lands within ±8px of the viewport top, bar hides', s3.open && s3.members === NBASH + 1 && Math.abs(s3.headerTop - s3.st) <= 8 && !s3.barShown, JSON.stringify({ open: s3.open, d: s3.headerTop - s3.st, bar: s3.barShown }));

// scroll past again, then collapse FROM THE BAR — no scroll jump beyond ±8px of the header
await scrollTo('header.offsetTop + Math.round(list.clientHeight * 1.2)', 150);
const s4 = await state();
check('bar shown again after scrolling past the header', s4.barShown, JSON.stringify(s4));
await click('.chat-run-bar', 80);
const s5 = await state();
check('bar click collapses the run: rail classes gone, footer gone, header closed', !s5.open && s5.members === 0 && s5.footers === 0 && s5.collapsed === NBASH + 1 + NMCP, JSON.stringify(s5));
check('fixture sanity: after the collapse the list can still scroll far enough to put the header at the top (else the landing would be unobservable)', s5.sh - s5.ch >= s5.headerTop, `sh=${s5.sh} ch=${s5.ch} headerTop=${s5.headerTop}`);
check('…and the viewport lands on the header (within ±8px), bar hidden', Math.abs(s5.headerTop - s5.st) <= 8 && !s5.barShown, `headerTop=${s5.headerTop} st=${s5.st}`);
await sleep(500); // the footer removal is a childList mutation → a debounced runs pass rebuilds the header
const s6 = await state();
check('after the observer pass: still collapsed, header still within ±8px (no late jump)', !s6.open && s6.footers === 0 && Math.abs(s6.headerTop - s6.st) <= 8, `headerTop=${s6.headerTop} st=${s6.st} open=${s6.open}`);

// expand again → scroll to the footer → collapse from the footer line
await click('.chat-run-header', 400);
const s7 = await state();
check('re-expanded: footer back, rail back', s7.open && s7.footers === 1 && s7.members === NBASH + 1, JSON.stringify(s7));
await scrollTo('list.scrollHeight', 150);
await click('.chat-run-footer', 80);
const s8 = await state();
check('footer click collapses and scrolls the header into view (±8px); footer gone', !s8.open && s8.footers === 0 && Math.abs(s8.headerTop - s8.st) <= 8, `headerTop=${s8.headerTop} st=${s8.st} open=${s8.open}`);
await sleep(400);
const s9 = await state();
check('footer exists ONLY while expanded (still absent after the rebuild pass)', s9.footers === 0 && !s9.open && s9.members === 0);
// ── PINNED + TWO runs: a user-opened run must survive the pass its own toggle
//    causes (2026-09-06 refutation, measured on this fixture's parent: clicking
//    any run header except the last, while pinned, opened the run and closed it
//    again ~180ms later — _setRunOpen's footer insert is a childList mutation
//    OUTSIDE a pass, so the observer scheduled one, and the pinned auto-refold
//    (`built.slice(0, -1)`) closed exactly the run the click had opened). ──
const chatView = (body) => evaljs(`(async () => {
  const list = window.__list;
  const cv = [...window.app.sessions.values()].find((s) => s && s._messageList === list);
  if (!cv) return { err: 'no ChatView for the list' };
  ${body}
})()`);
const runsState = () => chatView(`
  const heads = [...list.querySelectorAll(':scope > .chat-run-header')];
  return { pinned: !!cv._pinned, runs: cv._runs?.length || 0, heads: heads.length,
    open: heads.map((h) => h.classList.contains('open')),
    footers: list.querySelectorAll(':scope > .chat-run-footer').length,
    members: list.querySelectorAll(':scope > .chat-msg.chat-run-member').length };`);

// pin at the live tail (bottom-follow owns the scroll there — the state the
// auto-refold exists for)
await chatView(`list.scrollTop = list.scrollHeight; list.dispatchEvent(new Event('scroll'));
  await new Promise((r) => setTimeout(r, 300)); return 1;`);
const p0 = await runsState();
check('fixture: TWO runs built and the view is PINNED at the tail (the auto-refold branch is now reachable)', p0.runs === 2 && p0.heads === 2 && p0.pinned && !p0.open[0] && !p0.open[1], JSON.stringify(p0));

// expand the FIRST (non-last) run — the case the auto-refold used to eat
await click('.chat-run-header', 600);
const p1 = await runsState();
check('PINNED: expanding the FIRST run is still open 600ms later (past the 180ms observer debounce) with its footer', p1.open[0] && p1.footers === 1 && p1.members === NBASH + 1, JSON.stringify(p1));
// …and through an explicit pass (what a live append/trim would trigger)
const p2 = await chatView(`cv._updateRuns(); await new Promise((r) => setTimeout(r, 250));
  const heads = [...list.querySelectorAll(':scope > .chat-run-header')];
  return { pinned: !!cv._pinned, open: heads.map((h) => h.classList.contains('open')), footers: list.querySelectorAll(':scope > .chat-run-footer').length, runs: cv._runs.length };`);
check('PINNED: a full runs pass does NOT re-collapse the run the user opened (the deliberate toggle beats the heuristic)', p2.pinned && p2.open[0] && p2.footers === 1 && p2.runs === 2, JSON.stringify(p2));

// the LAST run's behaviour is unchanged (it was always excluded by slice(0,-1))
await chatView(`list.querySelectorAll(':scope > .chat-run-header')[1].click(); await new Promise((r) => setTimeout(r, 600)); return 1;`);
const p3 = await runsState();
check('PINNED: the LAST run still expands and stays open (unchanged), both runs open at once', p3.open[0] && p3.open[1] && p3.footers === 2 && p3.members === NBASH + 1 + NMCP, JSON.stringify(p3));
const p4 = await chatView(`cv._updateRuns(); await new Promise((r) => setTimeout(r, 250));
  const heads = [...list.querySelectorAll(':scope > .chat-run-header')];
  return { open: heads.map((h) => h.classList.contains('open')), footers: list.querySelectorAll(':scope > .chat-run-footer').length };`);
check('PINNED: both survive the next pass', p4.open[0] && p4.open[1] && p4.footers === 2, JSON.stringify(p4));

// NEGATIVE CONTROL — the 2.227.x invariant the auto-refold exists for: an
// INHERITED open flag (a run that was the live tail when it was opened and
// then stopped being last) is still re-folded while pinned. Dropping the
// user-intent mark leaves exactly that state.
const p5 = await chatView(`
  list.scrollTop = list.scrollHeight; list.dispatchEvent(new Event('scroll'));
  await new Promise((r) => setTimeout(r, 250));
  const pinnedBefore = !!cv._pinned;             // the flag the branch reads
  cv._runStickyOpen = new WeakSet();             // …leaving only the inherited flag
  cv._updateRuns();
  await new Promise((r) => setTimeout(r, 250));
  const heads = [...list.querySelectorAll(':scope > .chat-run-header')];
  return { pinnedBefore, open: heads.map((h) => h.classList.contains('open')), footers: list.querySelectorAll(':scope > .chat-run-footer').length };`);
check('negative control: without the user-intent mark the pinned auto-refold still folds every non-last run (2.227.x "一部分没折叠" holds)', p5.pinnedBefore && !p5.open[0] && p5.open[1] && p5.footers === 1, JSON.stringify(p5));

// the history-load pill must not land ON the floating bar (both are absolutely
// positioned .chat-view children; the pill used to carry an inline top:6px that
// no stylesheet rule could push aside)
const p6 = await chatView(`
  cv._runStickyOpen = new WeakSet();
  const h0 = list.querySelector(':scope > .chat-run-header');
  if (!h0.classList.contains('open')) h0.click();
  await new Promise((r) => setTimeout(r, 400));
  list.scrollTop = h0.offsetTop + Math.round(list.clientHeight * 0.8); list.dispatchEvent(new Event('scroll'));
  await new Promise((r) => setTimeout(r, 200));
  cv._showHistoryStatus('Loading history…', { spinner: true, kind: 'loading' });
  await new Promise((r) => setTimeout(r, 120));
  const view = document.querySelector('.chat-view');
  const bar = view.querySelector('.chat-run-bar'), pill = view.querySelector('.chat-history-status');
  const r = { barShown: !!bar && !bar.classList.contains('hidden'), barBottom: bar ? bar.offsetTop + bar.offsetHeight : -1,
    pillTop: pill ? pill.offsetTop : -1, pillInline: pill ? (pill.style.top || '') : 'none' };
  cv._hideHistoryStatus();
  return r;`);
check('the history-load pill sits BELOW the floating run bar (no inline top left to beat the stylesheet)', p6.barShown && p6.pillTop >= p6.barBottom && p6.pillInline === '', JSON.stringify(p6));

// ── THE MIXED RUN (image-card review round 2, 2026-09-06): Bash → Read(png) → Bash ────────────────
// The owner's ask was "展开直接看到图像内容". The first cut exempted only runs
// made ONLY of image views — but a media card almost always sits BETWEEN other
// foldable cards, and there it was still display:none inside "2 Bash · 1 image
// reads", its loading="lazy" thumbnail never fetching. GROUND TRUTH here: with
// the run COLLAPSED (the shipped default), the Bash cards are display:none, the
// media card is not, and its <img> really decodes off /api/file/raw.
const img0 = await evaljs(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  window.app.viewSession('${IMG_SID}', '${CWD}', 'image fold');
  let cv = null;
  // the view-only ChatView may be keyed by a synthesized id — identify it by
  // its OWN message list (never the first fixture's)
  for (let i = 0; i < 80; i++) {
    cv = [...window.app.sessions.values()].find((s) => s && s._messageList && s._messageList !== window.__list);
    if (cv && cv._messageList.querySelector(':scope > .chat-run-header')) break;
    await sleep(250);
  }
  if (!cv || !cv._messageList) return { err: 'no image ChatView', keys: [...window.app.sessions.keys()].slice(0, 6), ids: [...window.app.sessions.values()].map((s) => s && s.sessionId).slice(0, 6) };
  await sleep(900); // fold settle
  window.__imgCv = cv;
  const list = cv._messageList;
  const header = list.querySelector(':scope > .chat-run-header');
  const cards = [...list.querySelectorAll(':scope > .chat-msg.chat-msg-tool-result')];
  const media = cards.find((el) => el.querySelector('img.chat-tool-img'));
  const img = media?.querySelector('img.chat-tool-img');
  if (img && !img.complete) await new Promise((r) => { img.addEventListener('load', r, { once: true }); img.addEventListener('error', r, { once: true }); setTimeout(r, 4000); });
  const disp = (el) => (el ? getComputedStyle(el).display : 'missing');
  return {
    header: !!header, label: (header?.textContent || '').replace(/^▸\\s*/, '').trim(),
    open: header?.classList.contains('open') || false,
    cards: cards.length,
    mediaFound: !!media,
    mediaDisplay: disp(media),
    mediaCollapsed: media?.classList.contains('chat-run-collapsed') || false,
    bashDisplays: cards.filter((el) => el !== media).map(disp),
    bashCollapsed: cards.filter((el) => el !== media && el.classList.contains('chat-run-collapsed')).length,
    imgSrc: img?.getAttribute('src') || '',
    naturalWidth: img?.naturalWidth || 0,
    broken: !!media?.querySelector('.chat-media.chat-media-broken'),
    inlineSize: cv._runs?.[0]?.inline?.size ?? -1,
    members: cv._runs?.[0]?.members?.length ?? -1,
  };
})()`);
check('mixed run: the header exists and still counts every member ("2 Bash · 1 image reads")', img0?.header && /2 Bash/.test(img0.label) && /1 image reads/.test(img0.label), JSON.stringify(img0));
check('mixed run COLLAPSED: the two Bash cards are display:none…', !img0?.open && img0?.bashCollapsed === 2 && img0.bashDisplays.every((d) => d === 'none'), JSON.stringify({ open: img0?.open, bashCollapsed: img0?.bashCollapsed, d: img0?.bashDisplays }));
check('…while the IMAGE card is NOT hidden (the owner\'s ask: 展开直接看到图像内容)', img0?.mediaFound && !img0.mediaCollapsed && img0.mediaDisplay !== 'none', JSON.stringify({ found: img0?.mediaFound, collapsed: img0?.mediaCollapsed, display: img0?.mediaDisplay }));
check('…and its lazy thumbnail really FETCHED and decoded from /api/file/raw (naturalWidth > 0)', img0?.naturalWidth > 0 && /\/api\/file\/raw\?path=/.test(img0.imgSrc) && !img0.broken, JSON.stringify({ nw: img0?.naturalWidth, src: img0?.imgSrc, broken: img0?.broken }));
check('…bookkeeping: the image is a MEMBER of the run, only listed as inline (not a separate run)', img0?.members === 3 && img0?.inlineSize === 1, JSON.stringify({ members: img0?.members, inline: img0?.inlineSize }));
const img1 = img0?.err ? { err: img0.err } : await evaljs(`(async () => {
  const cv = window.__imgCv, list = cv._messageList;
  list.querySelector(':scope > .chat-run-header').click();
  await new Promise((r) => setTimeout(r, 400));
  const cards = [...list.querySelectorAll(':scope > .chat-msg.chat-msg-tool-result')];
  const media = cards.find((el) => el.querySelector('img.chat-tool-img'));
  return { open: list.querySelector(':scope > .chat-run-header').classList.contains('open'),
    collapsed: list.querySelectorAll(':scope > .chat-msg.chat-run-collapsed').length,
    members: list.querySelectorAll(':scope > .chat-msg.chat-run-member').length,
    mediaIsMember: media?.classList.contains('chat-run-member') || false,
    footers: list.querySelectorAll(':scope > .chat-run-footer').length,
    displays: cards.map((el) => getComputedStyle(el).display) };
})()`);
check('mixed run EXPANDED: everything visible, the image carries the grouping rail like any member', img1?.open && img1.collapsed === 0 && img1.members === 3 && img1.mediaIsMember && img1.footers === 1 && img1.displays.every((d) => d !== 'none'), JSON.stringify(img1));

// ── inc-mudv05ja-n5rv: THE FLICKER — a swap is geometry- and fold-neutral, the
// live Workflow card is patched in place, the pin never re-follows a transient.
// The owner's five pinned compact windows jumped by up to 1.5 viewports for 1–3
// frames on every tool completion / workflow heartbeat / live append. The legs
// run on THIS view turned into a live-shaped one (content-visibility on, not
// read-only, compact, pinned) and drive the REAL `_onEditMessage` /
// `_onCreateMessage`; every leg carries a CONTROL that reverts exactly the new
// layer IN THE PAGE (the pre-fix code, verbatim semantics) and must reproduce
// the defect — else the leg proves nothing (the layered-guard rule).
const liveShape = await chatView(`
  const view = list.closest('.chat-view');
  cv._readOnly = false; view.classList.remove('chat-no-content-visibility'); view.classList.add('chat-compact');
  cv._runStickyOpen = new WeakSet(); cv._runExpanded = new WeakSet();
  for (const r of cv._runs || []) cv._setRunOpen(r, false);
  for (let i = 0; i < 4 && !cv._pinned; i++) { list.scrollTop = list.scrollHeight; list.dispatchEvent(new Event('scroll')); await new Promise((r) => setTimeout(r, 300)); }
  return { cv: getComputedStyle(list.querySelector(':scope > .chat-msg')).contentVisibility, pinned: !!cv._pinned, runs: cv._runs.length };`);
check('inc-mudv05ja fixture: the view is live-shaped (content-visibility:auto on its cards, pinned, runs built)', liveShape?.cv === 'auto' && liveShape.pinned && liveShape.runs === 2, JSON.stringify(liveShape));
// the per-frame sampler (the repro's probe-osc idiom): a card's height every rAF,
// scrollHeight/scrollTop A-B-A frames, scrollTop writes (setter interceptor)
const SAMPLER = `
  const sample = async (frames, getEl, act) => {
    const desc = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
    let writes = 0, atBottomWrites = 0;
    Object.defineProperty(list, 'scrollTop', { configurable: true, get() { return desc.get.call(this); },
      set(x) { writes++; if (this.scrollHeight - desc.get.call(this) - this.clientHeight <= 1) atBottomWrites++; desc.set.call(this, x); } });
    const hs = [], shs = [], sts = [];
    try {
      act && act();
      const el0 = getEl && getEl();
      if (el0) hs.push(Math.round(el0.getBoundingClientRect().height));
      for (let f = 0; f < frames; f++) {
        await new Promise((r) => requestAnimationFrame(r));
        const el = getEl && getEl();
        if (el) hs.push(el.isConnected ? Math.round(el.getBoundingClientRect().height) : -1);
        shs.push(list.scrollHeight); sts.push(Math.round(desc.get.call(list)));
      }
    } finally { delete list.scrollTop; }
    let aba = 0;
    for (let i = 2; i < shs.length; i++) if ((shs[i] === shs[i - 2] && shs[i] !== shs[i - 1]) || (sts[i] === sts[i - 2] && sts[i] !== sts[i - 1])) aba++;
    return { hs, shs: shs.slice(0, 12), sts: sts.slice(0, 12), aba, writes, atBottomWrites };
  };`;
// F1(a)+(c): a FOLDED member's completion edit keeps it folded in the very next frame
const RUN_CLS = `['chat-run-collapsed', 'chat-run-member', 'chat-run-first', 'chat-run-last']`;
const PRE_FIX_OBSERVER = `
  cv._runsObserver.disconnect();
  cv._runsObserver = new MutationObserver((records) => {
    if (cv._runsMutating) return;
    const tailAppend = records.length && records.every((r) => r.type === 'childList' && r.removedNodes.length === 0 && r.addedNodes.length > 0 && r.nextSibling === null);
    if (tailAppend) { clearTimeout(cv._runsTimer); cv._runsTimer = null; if (!cv._runsRaf) cv._runsRaf = requestAnimationFrame(() => { cv._runsRaf = null; cv._updateRuns(); }); return; }
    clearTimeout(cv._runsTimer); cv._runsTimer = setTimeout(() => cv._updateRuns(), 180);
  });
  cv._runsObserver.observe(list, { childList: true });`;
const foldLeg = (control) => chatView(`${SAMPLER}
  const saved = { swap: cv._swapMessageEl, reserve: cv._reserveFreshHeights, obs: cv._runsObserver };
  if (${control}) {
    const orig = Object.getPrototypeOf(cv)._swapMessageEl;
    cv._swapMessageEl = function (o, n, id) { const r = orig.call(this, o, n, id); for (const c of ${RUN_CLS}) n.classList.remove(c); return r; };
    cv._reserveFreshHeights = () => {};
    ${PRE_FIX_OBSERVER}
  }
  try {
    const folded = [...list.querySelectorAll(':scope > .chat-msg.chat-msg-tool-result.chat-run-collapsed')][5];
    if (!folded) return { err: 'no folded member' };
    const id = folded.dataset.msgId;
    // the fold state per frame is its computed DISPLAY (an off-screen card is 0 px
    // either way under content-visibility — height cannot see an unfolded paint)
    cv._onEditMessage(id, { status: 'complete' });
    const syncDisplay = getComputedStyle(cv._elements.get(id)).display;
    const frameDisplays = [];
    for (let f = 0; f < 6; f++) { await new Promise((res) => requestAnimationFrame(res)); frameDisplays.push(getComputedStyle(cv._elements.get(id)).display); }
    await new Promise((res) => setTimeout(res, 400));
    const el = cv._elements.get(id);
    return { swapped: el !== folded, syncDisplay, frameDisplays, displayAfter: getComputedStyle(el).display,
      inRun: (cv._runs || []).some((run) => run.members.includes(el)), staleInRun: (cv._runs || []).some((run) => run.members.includes(folded)) };
  } finally {
    if (${control}) { cv._swapMessageEl = saved.swap; cv._reserveFreshHeights = saved.reserve; cv._runsObserver.disconnect(); cv._runsObserver = saved.obs; cv._runsObserver.observe(list, { childList: true }); delete cv._swapMessageEl; delete cv._reserveFreshHeights; }
  }`);
const fl = await foldLeg(false);
check('inc-mudv05ja F1: a FOLDED member\'s completion edit swaps the card and the replacement is display:none synchronously AND in every sampled frame (the run classes ride the swap)',
  fl?.swapped && fl.syncDisplay === 'none' && fl.frameDisplays.every((d) => d === 'none') && fl.displayAfter === 'none', JSON.stringify(fl));
check('…and the run record names the NEW element, never the detached one (no pass needed)', fl?.inRun && !fl.staleInRun, JSON.stringify({ inRun: fl?.inRun, stale: fl?.staleInRun }));
const flc = await foldLeg(true);
check(`CONTROL (swap without the run classes + the pre-fix every(tailAppend) observer): the replacement is UNFOLDED for ≥ 1 frame (${(flc?.frameDisplays || []).filter((d) => d !== 'none').length} frame(s) not display:none) — the leg sees the defect`,
  flc?.syncDisplay !== 'none' && (flc?.frameDisplays || []).filter((d) => d !== 'none').length >= 1, JSON.stringify(flc));
// F1(b): a RENDERED card's swap is laid out at its real height in its first frame
const popLeg = (control) => chatView(`${SAMPLER}
  if (${control}) cv._reserveFreshHeights = () => {};
  try {
    list.scrollTop = list.scrollHeight; await new Promise((r) => setTimeout(r, 300));
    const lb = list.getBoundingClientRect();
    const vis = [...list.querySelectorAll(':scope > .chat-msg.chat-msg-assistant:not(.chat-msg-tool-result)')].filter((e) => { const r = e.getBoundingClientRect(); return r.height > 120 && r.top >= lb.top && r.bottom <= lb.bottom + 400; }).pop();
    if (!vis) return { err: 'no visible tall assistant card' };
    const id = vis.dataset.msgId, before = Math.round(vis.getBoundingClientRect().height);
    const r = await sample(6, () => cv._elements.get(id), () => cv._onEditMessage(id, { status: 'complete' }));
    await new Promise((res) => setTimeout(res, 400));
    const settled = Math.round(cv._elements.get(id).getBoundingClientRect().height);
    return { before, settled, hs: r.hs, pops: r.hs.filter((h) => Math.abs(h - settled) > 1).length, aba: r.aba, swapped: cv._elements.get(id) !== vis };
  } finally { if (${control}) delete cv._reserveFreshHeights; }`);
const pl = await popLeg(false);
check(`inc-mudv05ja F1: a visible card\'s completion swap never paints at the content-visibility placeholder — ZERO frames off its settled height (${pl?.settled}px), zero A-B-A frames`,
  pl?.swapped && pl.pops === 0 && pl.aba === 0 && pl.hs.length >= 6, JSON.stringify(pl));
const plc = await popLeg(true);
check(`CONTROL (no fresh-height reservation): the same swap paints at the placeholder for ≥ 1 frame (${plc?.pops} pop frame(s), heights ${JSON.stringify(plc?.hs)}) — the leg sees the defect`,
  plc?.swapped && plc.pops >= 1, JSON.stringify(plc));
// F3 (+F1 on appends): a pinned compact window under steady live appends — the
// pin never writes at the bottom and never re-follows an A-B-A height
const PRE_FIX_FSB = `function () {
    this._programmaticScroll = true; this._fsbFrames = 0;
    if (this._fsbActive) return;
    this._fsbActive = true;
    const epoch = this._fsbEpoch = (this._fsbEpoch || 0) + 1;
    const list = this._messageList;
    const step = () => {
      if (this._disposed) { this._fsbActive = false; this._programmaticScroll = false; return; }
      if (epoch !== this._fsbEpoch) return;
      list.scrollTop = list.scrollHeight;
      if (++this._fsbFrames < 10) requestAnimationFrame(step);
      else { this._fsbActive = false; requestAnimationFrame(() => { if (!this._fsbActive) this._programmaticScroll = false; }); }
    };
    requestAnimationFrame(step);
  }`;
const appendLeg = (control, n0) => chatView(`${SAMPLER}
  if (${control}) { cv._forceScrollToBottom = ${PRE_FIX_FSB}; cv._reserveFreshHeights = () => {}; }
  try {
    list.scrollTop = list.scrollHeight; await new Promise((r) => setTimeout(r, 300));
    const PROSE = 'a synthetic live line that wraps and gives the card real height\\n'.repeat(6);
    let k = ${n0};
    const timer = setInterval(() => {
      const i = k++;
      cv._onCreateMessage({ id: 'e2e00000-live-' + i, role: 'assistant', status: 'complete', ts: Date.now(), content: [{ type: 'text', text: 'live ' + i + ':\\n' + PROSE }] });
    }, 700);
    let r;
    try { r = await sample(360, null, null); } finally { clearInterval(timer); }
    return { appended: k - ${n0}, aba: r.aba, writes: r.writes, atBottomWrites: r.atBottomWrites, pinned: !!cv._pinned };
  } finally { if (${control}) { delete cv._forceScrollToBottom; delete cv._reserveFreshHeights; } }`);
const al = await appendLeg(false, 0);
check(`inc-mudv05ja F3: ~6 s of live appends at 1.4 msg/s into a pinned compact window — zero A-B-A frames and ZERO scrollTop writes while already at the bottom (${al?.appended} appends, ${al?.writes} writes)`,
  al?.appended >= 7 && al.aba === 0 && al.atBottomWrites === 0 && al.pinned, JSON.stringify(al));
const alc = await appendLeg(true, 1000);
check(`CONTROL (the pre-fix ten-frame chain + no fresh-height reservation): the same stream rewrites scrollTop while already at the bottom (${alc?.atBottomWrites} such writes) — the per-frame re-follow the fix removes`,
  alc?.atBottomWrites >= 10, JSON.stringify(alc));
// F2: the live Workflow card is patched IN PLACE — five task_progress edits
const wfLeg = (control) => chatView(`${SAMPLER}
  const id = 'e2e00000-wf-card-' + (${control} ? 'c' : 'f');
  const ack = 'Workflow "synthetic" started in the background.\\nRun ID: wf_e2e00000synth\\nSummary: a synthetic run';
  cv._onCreateMessage({ id, role: 'tool', toolName: 'Workflow', toolCallId: 'toolu_e2e00000wf', status: 'complete', ts: Date.now(),
    content: [{ type: 'tool_result', toolName: 'Workflow', toolCallId: 'toolu_e2e00000wf', input: { script: 'export const meta = {}' }, output: ack }] });
  await new Promise((r) => setTimeout(r, 400));
  // the CLI's OWN words for a working agent (start / progress — production never says 'running'; the card draws both as running)
  const agents = (states) => states.map((st, i) => ({ index: i, label: 'lane:' + i, phaseIndex: i < 2 ? 0 : 1, agentId: 'e2e00000ag' + i, state: st, lastToolName: st === 'progress' || st === 'start' ? 'Bash' : undefined }));
  const trees = [['start', 'queued', 'queued', 'queued'], ['progress', 'start', 'queued', 'queued'], ['done', 'progress', 'start', 'queued'], ['done', 'done', 'progress', 'start'], ['done', 'done', 'done', 'progress']];
  const before = cv._elements.get(id);
  const card = () => cv._elements.get(id);
  const chipsOf = (el) => Object.fromEntries([...el.querySelectorAll('.chat-wf-agent')].map((c) => [c.dataset.agentKey, c]));
  let firstChips = null, chipsKept = true, sameEl = true, maxH = 0, minH = 1e9, hsAll = [], dotsKept = true;
  for (let e = 0; e < trees.length; e++) {
    const ti = { id: 'e2e00000task', runId: 'wf_e2e00000synth', type: 'workflow', status: 'running', usage: { totalTokens: 1000 * (e + 1), toolUses: e + 1 },
      workflow: { phases: [{ index: 0, title: 'Scan' }, { index: 1, title: 'Repair' }], agents: agents(trees[e]) } };
    if (${control}) { const m = cv._messages.find((x) => x.id === id); m.taskInfo = ti; const nx = cv._renderers.renderToolMsg(m); cv._swapMessageEl(card(), nx, id); }
    else cv._onEditMessage(id, { taskInfo: ti });
    const r = await sample(14, card, null);
    if (e >= 1) hsAll.push(...r.hs);   // edit 0 ADDS the live section (a real growth); from then on the tree's shape is fixed
    const el = card();
    if (el !== before) sameEl = false;
    const chips = chipsOf(el);
    if (!firstChips) firstChips = chips;
    else for (const k of Object.keys(firstChips)) { if (chips[k] !== firstChips[k]) chipsKept = false; else if (chips[k].querySelector('.chat-wf-dot') !== firstChips[k].__dot) dotsKept = false; }
    if (e === 0) for (const k of Object.keys(chips)) chips[k].__dot = chips[k].querySelector('.chat-wf-dot');
  }
  await new Promise((r) => setTimeout(r, 300));
  const el = card();
  const settled = Math.round(el.getBoundingClientRect().height);
  const out = { sameEl, chipsKept, dotsKept, settled, off: hsAll.filter((h) => h > 0 && h < settled - 30).length, hsMin: Math.min(...hsAll), states: [...el.querySelectorAll('.chat-wf-agent')].map((c) => c.dataset.state).join(','),
    tally: el.querySelector('.chat-wf-tally')?.textContent || '', btnKept: !!el.querySelector('.chat-workflow-view-btn'), dotAria: el.querySelector('.chat-wf-dot')?.getAttribute('aria-hidden'),
    pulse: (el.querySelector('.chat-wf-agent[data-state="running"] .chat-wf-dot')?.getAnimations?.() || []).map((a) => a.animationName).join(',') };
  return out;`);
const wl = await wfLeg(false);
check('inc-mudv05ja F2: five task_progress edits patch the Workflow card IN PLACE — the same element, every agent chip the same node (its pulsing dot never re-created), the View Workflow button kept',
  wl?.sameEl && wl.chipsKept && wl.dotsKept && wl.btnKept, JSON.stringify(wl));
check('…the patch really applied the last tree (states + tally) and the card never left its settled height in any sampled frame; the dot is aria-hidden paint',
  wl?.states === 'done,done,done,running' && /^3\/4/.test(wl.tally) && wl.off === 0 && wl.dotAria === 'true', JSON.stringify(wl));
check("…fed the CLI's REAL words (start / progress, never 'running'): the working chip draws `running`, its dot carries the chat-wf-pulse animation and the tally counts it (the pulse and the count never showed in production before)",
  wl?.pulse === 'chat-wf-pulse' && /· 1 running$/.test(wl.tally), JSON.stringify({ pulse: wl?.pulse, tally: wl?.tally }));
const wlc = await wfLeg(true);
check('CONTROL (the pre-fix swap per heartbeat): the card element and its chips are re-created — the leg sees the swap',
  wlc && !wlc.sameEl && !wlc.chipsKept, JSON.stringify(wlc));
// F4: the View Workflow window renders only what changed (fetch stubbed with a synthetic run)
const wd = await evaljs(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const realFetch = window.fetch;
  let tick = 0, mutate = false;
  const run = () => ({ runId: 'wf_e2e00000det', status: 'running', live: true, liveTree: true, workflowName: 'synthetic detail', agentCount: 2, doneCount: 0, totalTokens: 10, totalToolCalls: mutate ? 2 + tick : 1,
    phases: [{ index: 0, title: 'Scan', agents: [{ index: 0, label: 'lane:0', state: 'progress', agentId: 'e2e00000d0', onDisk: true }, { index: 1, label: 'lane:1', state: 'queued', agentId: 'e2e00000d1', onDisk: false }] }] });
  window.fetch = async (u, o) => { if (String(u).startsWith('/api/workflow?')) { tick++; return new Response(JSON.stringify(run()), { status: 200, headers: { 'content-type': 'application/json' } }); } return realFetch(u, o); };
  try {
    window.app.replayOpenSpec({ action: 'openWorkflowDetail', runId: 'wf_e2e00000det', claudeSessionId: '', cwd: '', name: 'synthetic detail' });
    let root = null;
    for (let i = 0; i < 40 && !(root = document.querySelector('.workflow-detail'))?.querySelector('.workflow-status-chip'); i++) await sleep(150);
    if (!root) return { err: 'no detail window' };
    const chip = root.querySelector('.workflow-status-chip'), btn = root.querySelector('.workflow-agent-view-btn');
    let muts = 0; const mo = new MutationObserver((rs) => { for (const r of rs) if (r.type === 'childList') muts++; });
    mo.observe(root, { childList: true, subtree: true });
    const t0 = tick; await sleep(5600);
    const polls = tick - t0, mutsEqual = muts;
    mutate = true; muts = 0; await sleep(2900);
    const mutsChanged = muts;
    mo.disconnect();
    const out = { polls, mutsEqual, mutsChanged, chipKept: root.querySelector('.workflow-status-chip') === chip, live: chip.classList.contains('workflow-status-live'),
      btnKept: root.querySelector('.workflow-agent-view-btn') === btn, stateAria: root.querySelector('.workflow-agent-state')?.getAttribute('aria-hidden') };
    const w = [...window.app.wm.windows.values()].find((x) => x._workflowRunId === 'wf_e2e00000det');
    if (w) window.app.wm.closeWindow(w.id);
    return out;
  } finally { window.fetch = realFetch; }
})()`);
check('inc-mudv05ja F4: two+ live polls with an unchanged run → ZERO childList mutations under the detail root; the status chip is the same node (its pulse never restarts); state dots are aria-hidden',
  wd?.polls >= 2 && wd.mutsEqual === 0 && wd.chipKept && wd.live && wd.stateAria === 'true', JSON.stringify(wd));
check('CONTROL: a CHANGED run does mutate the window (the observer sees renders) while the chip and the keyed row\'s View Log button stay the same nodes',
  wd?.mutsChanged > 0 && wd.chipKept && wd.btnKept, JSON.stringify(wd));

// F5 (2026-09-26, owner: "这个workflow怎么没有细节" — a window reading 运行中 with eleven "(agent)"
// rows for a run stalled two days): the REAL server reads the run DIR (src/workflow-disk.js) —
// labels + phases from the journal/meta files, 已中断 from the mtimes — in the owner's language.
// The page is switched to zh (the per-device language; t() is bound at load ⇒ a reload), the
// window opens with NO fetch stub, and the CARD's chip gets the same verdict through the status
// bar's /api/workflow poll. CONTROL: the pre-fix server answer for the same run (the old
// skeleton, spelled verbatim) fed to the same window fails the same judge.
await evaljs(`localStorage.setItem('vibespace.lang', 'zh'); true`);
await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
for (let i = 0; i < 100; i++) { if (await evaljs('!!(window.app && window.app.ready && window.app.wm)').catch(() => false)) break; await sleep(300); }
await evaljs('window.app.ready.then(() => true)').catch(() => {});
await sleep(800);
const OLD_SKELETON = { runId: 'wf_e2e0foldold', workflowName: 'Workflow', summary: '', status: 'running', live: true, agentCount: 11, doneCount: 10, durationMs: 0, totalTokens: 0, totalToolCalls: 0, error: null, result: null, timestamp: null,
  phases: [{ index: 0, title: 'Agents (live — phase names, labels & tokens appear when the run finishes)', agents: WF_AGENTS.map((a) => a.id).sort().map((id) => ({ index: 0, label: '', model: '', state: WF_AGENTS.find((a) => a.id === id).result ? 'done' : 'progress', agentId: id })) }] };
const readWfWindow = (runId, stub) => evaljs(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const realFetch = window.fetch;
  const stub = ${JSON.stringify(stub || null)};
  if (stub) window.fetch = async (u, o) => (String(u).startsWith('/api/workflow?') && String(u).includes('${runId}') ? new Response(JSON.stringify(stub), { status: 200, headers: { 'content-type': 'application/json' } }) : realFetch(u, o));
  try {
    window.app.replayOpenSpec({ action: 'openWorkflowDetail', runId: '${runId}', claudeSessionId: '${SID}', cwd: '${CWD}', name: 'synthetic run' });
    let w = null, root = null;
    for (let i = 0; i < 60; i++) { w = [...window.app.wm.windows.values()].find((x) => x._workflowRunId === '${runId}'); root = w && w.content.querySelector('.workflow-detail'); if (root && root.querySelector('.workflow-agent-row')) break; await sleep(150); }
    if (!root) return { err: 'no window' };
    const chip = root.querySelector('.workflow-status-chip');
    const noteEl = root.querySelector('.workflow-live-note');
    const firstLabel = root.querySelector('.workflow-agent-label');
    const out = { chip: chip?.textContent || '', pulse: !!chip?.classList.contains('workflow-status-live'), tip: chip?.title || '',
      phases: [...root.querySelectorAll('.workflow-phase-title')].map((e) => e.textContent),
      labels: [...root.querySelectorAll('.workflow-agent-label')].map((e) => e.textContent),
      labelTitles: [...root.querySelectorAll('.workflow-agent-label')].map((e) => e.title),
      firstClipped: !!firstLabel && firstLabel.scrollWidth > firstLabel.clientWidth,
      imgs: root.querySelectorAll('img').length, xss: !!window.__vsXss,
      states: [...root.querySelectorAll('.workflow-agent-state')].map((e) => e.title),
      meta: root.querySelector('.workflow-detail-meta')?.textContent || '', note: noteEl?.textContent || '', noteStalled: !!noteEl?.classList.contains('workflow-live-note-stalled') };
    window.app.wm.closeWindow(w.id);
    return out;
  } finally { window.fetch = realFetch; }
})()`);
const judgeWf = (r) => !!r && !r.err && r.chip === '已中断' && !r.pulse && r.phases.join('|') === WF_PHASES.join('|') && r.labels.join('|') === WF_AGENTS.map((a) => a.label).join('|')
  && !r.labels.includes('(agent)') && /最后活动 2 天前；1 个 agent 未完成/.test(r.meta) && /最后活动 2 天前；1 个 agent 未完成/.test(r.tip) && !/运行中…/.test(r.meta)
  && r.states.filter((x) => x === '未完成——运行在它返回之前就停了').length === 1 && !/在运行结束后显示/.test(r.note) && /超过 10 分钟没有任何变化/.test(r.note);
const f5 = await readWfWindow('wf_e2e0foldstall', null);
check('F5: the View Workflow window over a REAL stalled run dir (zh): chip 已中断 (no pulse), the five phases and eleven labels from the run\'s files, "最后活动 2 天前；1 个 agent 未完成" in the meta line and the chip\'s tooltip, the one resultless agent 未完成, an honest note',
  judgeWf(f5), JSON.stringify(f5));
const f5c = await readWfWindow('wf_e2e0foldold', OLD_SKELETON);
check(`CONTROL: the PRE-FIX server answer (the old skeleton) in the same window fails the same judge — chip "${f5c?.chip}", labels ${JSON.stringify((f5c?.labels || []).slice(0, 2))}…, one phase "${(f5c?.phases || [])[0] || ''}"`,
  !judgeWf(f5c) && f5c?.chip === '运行中' && (f5c?.labels || []).every((l) => l === '(agent)'), JSON.stringify(f5c));
// lane Q verify (2026-09-26): a STALLED view that still carries a merged stream tree (the stream
// closed the task, or its tree is too old to prove anything) — the route answers `stalled` with
// `liveTree:true` and the tree's tokens. The note must agree with the chip: the stalled sentence and
// the stalled rail, never "Live view — …from the run's own progress records". (The control is the
// PURE liveNoteKind's tree-first copy in test-workflow-disk §7 — the window draws what it returns.)
const realStalled = await (await fetch(`http://127.0.0.1:${PORT}/api/workflow?runId=wf_e2e0foldstall&claudeSessionId=${SID}&cwd=${encodeURIComponent(CWD)}`)).json();
const STALLED_TREE = { ...realStalled, runId: 'wf_e2e0foldtree', liveTree: true, totalTokens: 4321 };
const f5t = await readWfWindow('wf_e2e0foldtree', STALLED_TREE);
check('F5 (lane Q verify): a stalled view WITH a merged tree — chip 已中断, the STALLED note and its rail, never the live-tree sentence; the tree\'s tokens still in the meta line',
  realStalled.status === 'stalled' && f5t?.chip === '已中断' && f5t.noteStalled === true && /超过 10 分钟没有任何变化/.test(f5t.note) && !/来自运行自身的进度记录|progress records/.test(f5t.note) && /4\.3k/.test(f5t.meta), JSON.stringify({ chip: f5t?.chip, noteStalled: f5t?.noteStalled, note: f5t?.note, meta: f5t?.meta }));
// lane Q verify: a 500-char label is clipped to an ellipsis — its full text rides the row's title; a
// label / phase that spells markup renders as TEXT (no element, no handler run)
const LONG = 'L'.repeat(500), XSS = '<img src=x onerror="window.__vsXss=1">lane';
const LONG_VIEW = { ...realStalled, runId: 'wf_e2e0foldlong', phases: realStalled.phases.map((p, pi) => ({ ...p, title: pi === 0 ? 'P<b>1</b>' : p.title, agents: p.agents.map((a, ai) => (pi === 0 && ai === 0 ? { ...a, label: LONG } : pi === 1 && ai === 0 ? { ...a, label: XSS } : a)) })) };
const f5l = await readWfWindow('wf_e2e0foldlong', LONG_VIEW);
check('F5 (lane Q verify): a 500-char label is clipped AND its title is the whole label; a markup label and phase render as text (no img, no handler), zero page errors so far',
  f5l?.firstClipped === true && f5l.labelTitles[0] === LONG && f5l.labels.includes(XSS) && f5l.labelTitles.includes(XSS) && f5l.phases[0] === 'P<b>1</b>' && f5l.imgs === 0 && f5l.xss === false && pageErrors.length === 0, JSON.stringify({ firstClipped: f5l?.firstClipped, titles: (f5l?.labelTitles || []).slice(0, 2).map((x) => x.slice(0, 40)), phase0: f5l?.phases?.[0], imgs: f5l?.imgs, xss: f5l?.xss, pageErrors: pageErrors.length }));
// the CARD: a Workflow card whose taskInfo still says running (the stream never saw the run end)
for (const f of fs.readdirSync(wfRunDir('wf_e2e0foldlive'))) fs.utimesSync(path.join(wfRunDir('wf_e2e0foldlive'), f), new Date(), new Date());
const f5card = await evaljs(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  window.app.viewSession('${SID}', '${CWD}', 'fold ux');
  let cv = null;
  for (let i = 0; i < 80 && !cv; i++) { cv = [...window.app.sessions.values()].find((s) => s && s._messageList && s._messageList.isConnected && s._statusBar); if (!cv) await sleep(200); }
  if (!cv) return { err: 'no chat view' };
  const card = (runId, n) => {
    const id = 'e2e00000-wf-f5-' + n, tcid = 'toolu_e2e00000f5' + n;
    cv._onCreateMessage({ id, role: 'tool', toolName: 'Workflow', toolCallId: tcid, status: 'complete', ts: Date.now(),
      taskInfo: { id: 'e2e00000f5t' + n, runId, type: 'workflow', status: 'running', description: 'synthetic' },
      content: [{ type: 'tool_result', toolName: 'Workflow', toolCallId: tcid, input: { script: 'export const meta = {}' }, output: 'Workflow "synthetic" started in the background.\\nRun ID: ' + runId + '\\nSummary: a synthetic run' }] });
    cv._statusBar.trackWorkflow(runId, 'synthetic');
    return id;
  };
  const a = card('wf_e2e0foldstall', 1), b = card('wf_e2e0foldlive', 2), c = card('wf_e2e0foldstall2', 3);
  const chipOf = (id) => cv._elements.get(id)?.querySelector('.chat-tool-label > .chat-task-status-chip');
  for (let i = 0; i < 40 && !(chipOf(a)?.classList.contains('warn') && chipOf(c)?.classList.contains('warn')); i++) await sleep(200);
  const read = (id) => { const c = chipOf(id); return c ? { text: c.textContent.trim(), cls: c.className, tip: c.title || '' } : null; };
  window.__f5 = { cv, a, b, c };
  const sb = cv._statusBar;
  return { stalled: read(a), live: read(b), wfChip: !!sb._workflows?.has('wf_e2e0foldlive'), stalledTracked: !!sb._workflows?.get('wf_e2e0foldstall')?.stalled,
    running: [...sb._workflows.values()].filter((w) => !w.stalled).map((w) => w.runId), chipRun: [...document.querySelectorAll('.chat-status-wf')].map((e) => e.dataset.wfRun || 'multi') };
})()`);
check('F5 card: the SAME verdict reaches the chat card — the stalled run\'s chip reads 已中断 (warn) with the last-activity sentence as its tooltip; the status bar keeps the stalled run TRACKED (re-asked every 15 s) but its running ⛭ chip names only the live run',
  f5card?.stalled?.text === '已中断' && /\bwarn\b/.test(f5card.stalled.cls) && /最后活动 2 天前；1 个 agent 未完成/.test(f5card.stalled.tip) && f5card.stalledTracked === true
  && JSON.stringify(f5card.running) === '["wf_e2e0foldlive"]' && !f5card.chipRun.includes('wf_e2e0foldstall'), JSON.stringify(f5card));
check('CONTROL (a run written just now): its card keeps ⟳ 运行中 and stays in the status bar\'s running chip — the verdict is the files\', not a blanket rule',
  f5card?.live?.text === '⟳ 运行中' && !/\bwarn\b/.test(f5card.live.cls) && f5card.wfChip === true, JSON.stringify(f5card));
// lane Q verify (2026-09-26): THE CARD COMES BACK. A stalled run writes again (a quiet stretch ended, a
// resume under the same run id) — the window flips to Running within one 15 s re-check, and the card must
// follow. CONTROL twin: the build commit dropped a stalled run from the poll (`this._workflows.delete(runId)`
// on the stalled answer) — the same deletion done by hand on the twin run leaves its card Stalled forever.
await evaljs(`(() => { window.__f5.cv._statusBar._workflows.delete('wf_e2e0foldstall2'); return true; })()`);
for (const id of ['wf_e2e0foldstall', 'wf_e2e0foldstall2']) for (const f of fs.readdirSync(wfRunDir(id))) fs.utimesSync(path.join(wfRunDir(id), f), new Date(), new Date());
const f5back = await evaljs(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const { cv, a, c } = window.__f5, t0 = Date.now();
  const chipOf = (id) => cv._elements.get(id)?.querySelector('.chat-tool-label > .chat-task-status-chip');
  while (Date.now() - t0 < 22000 && !(chipOf(a) && !chipOf(a).classList.contains('warn'))) await sleep(250);
  const backMs = Date.now() - t0;
  const read = (id) => { const x = chipOf(id); return x ? { text: x.textContent.trim(), cls: x.className } : null; };
  const wf = cv._statusBar._workflows.get('wf_e2e0foldstall');
  return { back: read(a), backMs, tracked: !!wf, stalledFlag: wf ? !!wf.stalled : null, inRunning: [...cv._statusBar._workflows.values()].some((w) => w.runId === 'wf_e2e0foldstall' && !w.stalled), twin: read(c), twinTracked: cv._statusBar._workflows.has('wf_e2e0foldstall2') };
})()`);
check(`F5 (lane Q verify): the stalled run WRITES AGAIN ⇒ its card is back to ⟳ 运行中 in ${f5back?.backMs} ms (≤ 22 s — one 15 s re-check), the run tracked, no longer stalled, back in the running ⛭ chip`,
  f5back?.back?.text === '⟳ 运行中' && !/\bwarn\b/.test(f5back.back.cls) && f5back.backMs <= 22000 && f5back.tracked === true && f5back.stalledFlag === false && f5back.inRunning === true, JSON.stringify(f5back));
check('CONTROL (the pre-fix drop, done by hand on the twin run): its files were written at the same instant, but untracked it still reads 已中断 after the same wait — the leg sees the defect',
  f5back?.twin?.text === '已中断' && /\bwarn\b/.test(f5back.twin.cls) && f5back.twinTracked === false, JSON.stringify(f5back));
await evaljs(`localStorage.removeItem('vibespace.lang'); true`);

check('zero uncaught page exceptions during the whole flow', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

ws.close();
console.log(failed ? `\n${failed} FAILED (${passed} passed)` : `\nALL PASS (${passed})`);
process.exit(failed ? 1 : 0);
