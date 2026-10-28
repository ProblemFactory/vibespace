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
//   lane run-fold-channel-compact (the owner, 2026-10-20: 「这个地方展开和收起是完全一样的，这是对的吗」 — a run of
//     channel-search Bash cards drew the same open and closed): the owner's shape (5 Bash, 4 with conversation rows
//     from the channel witness + 1 plain failed grep) ⇒ closed: the 4 are ONE line each (head + the command's first
//     words + their rows as chips, the bodies hidden, < 1/3 of their open height), the plain one hidden, the header
//     says 「· 4 条带会话入口」; open ⇒ whole; closed again ⇒ the SAME row elements, a REAL click on one still jumps;
//     a run of ONLY touched cards gets no header (whole); RED CONTROL: the pre-lane rule on a patched bundle
//     (pairing-ui-harness buildPatchedBundle) ⇒ closed height == open height.
//   lane touch-chip-cause (the owner, 2026-10-28: 「这个展开方式对吗？」 — a closed run 「VibeSpace 把任务背景交给了助手 ·
//     4 条 Bash · 3 条带会话入口」 whose `vibespace-status` row held 17 conversations, and «另有 14 个» pressed ⇒ ten chips
//     squeezed to «Lar…» / «Gm…»): a row hangs on the act that caused it — the 17 touched while vibespace-status ran
//     hang on the turn's VibeSpace note row, a chained command's head opens at its vibespace-channels segment, a parallel
//     batch's unnamed reads are the CLI loop's; at 1280 and at 390 every visible chip keeps its readable minimum (the
//     account + 12 characters of the title, measured by an independent probe), the rest fold into «另有 N 个», and a
//     REAL press expands into ROWS (one per conversation, stacked, full width, with a time); RED CONTROL: a patched
//     view without the cause / the fit ⇒ the 17 on vibespace-status, the chips below their readable minimum.
//     Round 2: the head opens only at the CLI's COMMAND WORD (never inside a quoted `--reason`); at UI scale 60 / 80 /
//     125 % the strip keeps the minimum in CSS px (the same min-width at every scale, every chip readable, no chip
//     folded that would fit); a LONG account label at 390 never clips the fold control (chip 0 gives its name first).
// Run: node scripts/test-fold-ux.mjs
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs'; // lane run-fold-channel-compact: the RED CONTROL's patched copy lives outside the checkout
import { buildPatchedBundle } from './pairing-ui-harness.mjs'; // …built into a client bundle the control page is served
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
// lane run-fold-channel-compact: the members a closed fold keeps on screen are SAID ("· N with a conversation link"),
// and a compact card's one-line head names the first words of its command
{
  const ZH = (await import(path.join(repo, 'src/lib/i18n-zh.js'))).default, JA = (await import(path.join(repo, 'src/lib/i18n-ja.js'))).default;
  const tr = (d) => (k, p) => t(d[k] || k, p);
  const owner = { byKind: S.countKinds(['bash', 'bash', 'bash', 'bash', 'bash']), mcpServers: new Set(), nErr: 1, linked: 4 };
  const words = [S.runSummaryLabel(owner, t), S.runSummaryLabel(owner, tr(ZH)), S.runSummaryLabel(owner, tr(JA))];
  check('linked part: the owner\'s run reads "5 Bash · 1 ✗ · 4 with a conversation link" / 「5 条 Bash · 1 ✗ · 4 条带会话入口」 / 「Bash 5 件 · 1 ✗ · 会話リンク付き 4 件」',
    JSON.stringify(words) === JSON.stringify(['5 Bash · 1 ✗ · 4 with a conversation link', '5 条 Bash · 1 ✗ · 4 条带会话入口', 'Bash 5 件 · 1 ✗ · 会話リンク付き 4 件']), words);
  check('…no linked member ⇒ no part (every other run\'s label byte-identical)', S.runSummaryLabel({ ...owner, linked: 0 }, t) === '5 Bash · 1 ✗' && S.runSummaryLabel({ ...owner, linked: undefined }, t) === '5 Bash · 1 ✗');
  // lane chat-proposal-card (the owner, 2026-10-23: 「最下面那个是 outbox 请求吗？」): the proposals the run's calls filed are
  // counted BESIDE the conversation links — the cards the closed fold keeps on screen; decided, the count stays, the wait goes
  const filed = (n, awaiting) => [S.runSummaryLabel({ ...owner, proposals: { n, awaiting } }, t), S.runSummaryLabel({ ...owner, proposals: { n, awaiting } }, tr(ZH)), S.runSummaryLabel({ ...owner, proposals: { n, awaiting } }, tr(JA))];
  const waits = filed(1, 1), done = filed(1, 0), two = filed(3, 2);
  check('proposals part: «5 Bash · 1 ✗ · 4 with a conversation link · 1 proposal awaiting approval» / 「… · 4 条带会话入口 · 1 条提案待批准」 / ja; decided ⇒ «1 proposal» / 「1 条提案」; several waiting ⇒ «2 proposals awaiting approval»',
    JSON.stringify(waits) === JSON.stringify(['5 Bash · 1 ✗ · 4 with a conversation link · 1 proposal awaiting approval', '5 条 Bash · 1 ✗ · 4 条带会话入口 · 1 条提案待批准', 'Bash 5 件 · 1 ✗ · 会話リンク付き 4 件 · 承認待ちの提案 1 件'])
    && JSON.stringify(done) === JSON.stringify(['5 Bash · 1 ✗ · 4 with a conversation link · 1 proposal', '5 条 Bash · 1 ✗ · 4 条带会话入口 · 1 条提案', 'Bash 5 件 · 1 ✗ · 会話リンク付き 4 件 · 提案 1 件'])
    && two[0] === '5 Bash · 1 ✗ · 4 with a conversation link · 2 proposals awaiting approval' && two[1].endsWith('· 2 条提案待批准'), { waits, done, two });
  check('…no proposal ⇒ no part (every other run\'s label byte-identical)', S.runSummaryLabel({ ...owner, proposals: { n: 0, awaiting: 0 } }, t) === '5 Bash · 1 ✗ · 4 with a conversation link' && S.runSummaryLabel({ ...owner, proposals: null }, t) === '5 Bash · 1 ✗ · 4 with a conversation link');
  check('commandHeadWords: the first non-blank line, whitespace folded, capped at HEAD_WORDS_MAX code points with "…"; "" for no command',
    S.commandHeadWords('\n  vibespace-channels   search "季度"\t--all\nsecond line') === 'vibespace-channels search "季度" --all'
    && [...S.commandHeadWords('词'.repeat(300))].length === S.HEAD_WORDS_MAX && S.commandHeadWords('词'.repeat(300)).endsWith('…')
    && S.commandHeadWords('ls -la') === 'ls -la' && S.commandHeadWords('') === '' && S.commandHeadWords(undefined) === '' && S.commandHeadWords('\n \n') === '');
  check('lane touch-chip-cause: a CHAINED command opens at its vibespace-channels segment after "… " (its rows are what that segment touched — the head that read `vibespace-status working…` named an act that touched nothing); a path to the CLI belongs to the segment; a lone CLI call and a word that merely contains the name keep their words',
    S.commandHeadWords('vibespace-status working --reason "pairing review" && vibespace-channels search "pairing review" --full') === '… vibespace-channels search "pairing review" --full'
    && S.commandHeadWords('vibespace-status working\nvibespace-channels read lark/oc_1') === '… vibespace-channels read lark/oc_1'
    && S.commandHeadWords('/opt/x/bin/vibespace-channels read a/b') === '/opt/x/bin/vibespace-channels read a/b' && S.commandHeadWords('vibespace-status x && /opt/x/bin/vibespace-channels read a/b') === '… /opt/x/bin/vibespace-channels read a/b'
    && S.commandHeadWords('echo vibespace-channelsX') === 'echo vibespace-channelsX' && S.commandHeadWords('  vibespace-channels list') === 'vibespace-channels list');
  check('commandHeadWords (touch-chip-cause r2): the CLI\'s name inside QUOTED prose or another command\'s argument never opens the head — the whole command reads; a `bash -c` string opens at its shell',
    S.commandHeadWords('vibespace-status working --reason "triage the inbox with vibespace-channels read next"') === 'vibespace-status working --reason "triage the inbox with vibespace-channels read next"'
    && S.commandHeadWords('cd repo && grep -rn vibespace-channels docs/ | head') === 'cd repo && grep -rn vibespace-channels docs/ | head'
    && S.commandHeadWords('git commit -m "fix vibespace-channels search paging"') === 'git commit -m "fix vibespace-channels search paging"'
    && S.commandHeadWords(`cd x && bash -c 'vibespace-channels read "$X"'`) === `… bash -c 'vibespace-channels read "$X"'`);
}
check('mcpParts splits mcp__server__tool and rejects the rest', JSON.stringify(S.mcpParts('mcp__a__b_c')) === '{"server":"a","tool":"b_c"}' && S.mcpParts('Bash') === null && S.mcpParts('') === null);
check('the pure module imports nothing but PURE rules (DOM-free by construction; B-40f8: src/assistant-note.js; lane exit-calls-in-history: src/exit-call.js; lane touch-chip-cause r2: src/channel-touch.js — where a command line runs the channels CLI)', (read('src/lib/chat-run-summary.js').match(/^\s*import .*$/gm) || []).every((l) => /from '\.\.\/(?:assistant-note|exit-call|channel-touch)\.js';/.test(l)));

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
check('bar state is computed in the scroll rAF with the frame\'s already-read scrollTop, BEFORE the programmatic-scroll early return', /const \{ scrollTop, scrollHeight, clientHeight \} = this\._messageList;\n[^\n]*\n\s*this\._updateRunBar\(scrollTop\);\n\s*if \(this\._programmaticScroll\) return;/.test(cv));
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
const CH_SID = 'f01d0000-0000-4000-8000-00000000c0c7'; // lane run-fold-channel-compact: the owner's run of channel searches
const CH_PLAIN = 2; // the plain (failed) card of that run — the one card without conversation rows
const TC_SID = 'f01d0000-0000-4000-8000-00000000cc17'; // lane touch-chip-cause: the owner's turn + the chained command + the parallel batch
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

  // ── lane run-fold-channel-compact: THE OWNER'S RUN — 5 Bash, four of them `vibespace-channels search` (the channel
  // witness binds conversation rows to those cards) and one plain grep that failed (「5 条 Bash · 1 ✕」); a text turn;
  // then a run of ONLY two searches (every member exempt ⇒ no header); a text turn closes it
  const cl = [];
  let cts0 = Date.now() - 1200e3;
  const cts = () => new Date((cts0 += 5e3)).toISOString();
  let q = 0;
  const cpush = (o) => cl.push(JSON.stringify(o));
  const HITS = 'oc_7f3a Orrin · 2026-10-19 ·「季度汇报的数字我放在表里了」\n'.repeat(10);
  const bash = (k, command, out, isErr) => {
    cpush({ type: 'assistant', message: { id: `cmsg_${q}`, role: 'assistant', model: 'claude-fable-5', content: [{ type: 'tool_use', id: `toolu_c${k}`, name: 'Bash', input: { command, description: 'search the chats' } }], usage: {} }, uuid: `ctu-${q++}`, timestamp: cts() });
    cpush({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `toolu_c${k}`, is_error: !!isErr, content: out }] }, uuid: `ctr-${q++}`, timestamp: cts() });
  };
  const say = (text) => cpush({ type: 'assistant', message: { id: `cmsg_${q}`, role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text }], usage: { input_tokens: 1, output_tokens: 1 } }, uuid: `ca-${q++}`, timestamp: cts() });
  cpush({ type: 'user', message: { role: 'user', content: 'find the quarterly report thread' }, uuid: `cu-${q++}`, timestamp: cts() });
  say('Searching the chats.');
  for (let k = 0; k < 5; k++) {
    if (k === CH_PLAIN) bash(k, 'grep -c 季度 notes.txt', 'grep: notes.txt: No such file or directory\n', true);
    else bash(k, `vibespace-channels search "季度汇报 ${k}" --adapter lark --limit 20`, `4 conversations\n${HITS}`);
  }
  say("Found it in Orrin's chat.");
  for (const k of [5, 6]) bash(k, `vibespace-channels search "季度汇报 ${k}" --adapter lark`, `1 conversation\n${HITS}`);
  say('Both checked.');
  fs.writeFileSync(path.join(proj, `${CH_SID}.jsonl`), cl.join('\n') + '\n');

  // ── lane touch-chip-cause: THE OWNER'S TURN — VibeSpace's task-context note, then 4 Bash (vibespace-status, a read of
  // one Lark chat, two more); then H1 (a CHAINED `vibespace-status … && vibespace-channels search …`); then H2 (a
  // PARALLEL batch: a read loop beside vibespace-status, 40 ms apart). Every name and id is invented.
  const tl = [];
  let tts0 = Date.now() - 900e3, tq = 0;
  const tts = (d = 5e3) => new Date((tts0 += d)).toISOString();
  const tpush = (o) => tl.push(JSON.stringify(o));
  const tuse = (k, command, d) => tpush({ type: 'assistant', message: { id: `tmsg_${k}`, role: 'assistant', model: 'claude-fable-5', content: [{ type: 'tool_use', id: `toolu_t${k}`, name: 'Bash', input: { command, description: 'x' } }], usage: {} }, uuid: `ttu-${tq++}`, timestamp: tts(d) });
  const tres = (k, out, d) => tpush({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `toolu_t${k}`, is_error: false, content: out }] }, uuid: `ttr-${tq++}`, timestamp: tts(d) });
  const tsay = (text) => tpush({ type: 'assistant', message: { id: `tmsg_s${tq}`, role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text }], usage: { input_tokens: 1, output_tokens: 1 } }, uuid: `tts-${tq++}`, timestamp: tts() });
  const tuser = (text) => tpush({ type: 'user', message: { role: 'user', content: text }, uuid: `tum-${tq++}`, timestamp: tts() });
  const tnote = (text) => tpush({ type: 'attachment', attachment: { type: 'hook_additional_context', content: [text] }, uuid: `ttn-${tq++}`, timestamp: tts(800) });
  const tbash = (k, cmd, out) => { tuse(k, cmd); tres(k, out, 3e3); };
  tuser('follow up on the pairing review thread');
  tnote('<vibespace-task-context>\n# Fixture group\n- Task ID: T-fixture\n</vibespace-task-context>');
  tbash(0, 'vibespace-status working --reason "pairing review follow-up"', 'status: working');
  tbash(1, 'vibespace-channels read lark/oc_f1x7ure0 --limit 60', '60 messages');
  tbash(2, 'vibespace-task progress "pairing review: read the thread"', 'logged');
  tbash(3, 'git status --short', '');
  tsay('Read the thread.');
  tuser('search for it');
  tnote('<vibespace-reminder>update your status</vibespace-reminder>');
  tbash(4, 'vibespace-status working --reason "pairing review" && vibespace-channels search "pairing review" --full', '17 conversations');
  tbash(5, 'git log -1 --oneline', 'abc1234 fixture');
  tsay('Found it.');
  tuser('read the queue');
  tnote('<vibespace-reminder>update your status</vibespace-reminder>');
  tuse(6, 'for c in $(cat queue.txt); do vibespace-channels read "$c" --limit 20; done'); tuse(7, 'vibespace-status working --reason "reading the queue"', 40);
  tres(6, '3 conversations read', 4e3); tres(7, 'status: working', 40);
  tbash(8, 'ls', 'queue.txt');
  tsay('Queue read.');
  fs.writeFileSync(path.join(proj, `${TC_SID}.jsonl`), tl.join('\n') + '\n');
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
  for (const r of [wt, fakeHome, CWD, `${wt}-chrome`]) { try { endRootedProcesses(r); } catch {} } // §57b: whatever the server started (its detached device daemon) ends with it
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
// ── lane run-fold-channel-compact (the owner, 2026-10-20 01:4xZ, two screenshots of one run 「▸ 5 条 Bash · 1 ✕」 closed
// and 「▾」 open — identical: 「这个地方展开和收起是完全一样的，这是对的吗」). The run's channel-search cards carry
// conversation rows, the §26 exemption kept them WHOLE inside the fold, and the fold hid one small card. The witness's
// touches arrive through the view's OWN door (the channel-touch view's onTouch — the 'channel-touch' ws frame's
// receiver) and bind to the cards by time like every real touch. The page is zh here (the F5 legs).
const CH_KIT = `(() => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const findCv = () => [...window.app.sessions.values()].find((s) => s && s._messageList && s._messageList.querySelector(':scope > .chat-msg[data-tool-id="toolu_c0"]'));
  const NAMES = { A: 'Orrin', B: 'Quella', C: '季度汇报群', D: 'Ops room' };
  window.__ch = {
    async open() {
      let cv = findCv();
      if (!cv) window.app.viewSession(${JSON.stringify(CH_SID)}, ${JSON.stringify(CWD)}, 'channel fold');
      for (let i = 0; i < 80 && !(cv = findCv()); i++) await sleep(250);
      if (!cv) return { err: 'no channel ChatView', ids: [...window.app.sessions.values()].map((s) => s && s.sessionId).slice(0, 8) };
      this.cv = cv; this.list = cv._messageList;
      for (let i = 0; i < 40 && !(this.card(0) && this.card(6)); i++) await sleep(150);
      await sleep(600);
      const touches = [];
      const T = (k, c, op, extra) => touches.push({ id: 'tch-' + k + c + op, op, adapterId: 'lark', convId: 'oc_' + c, title: NAMES[c], account: '飞书', kind: 'p2p', count: op === 'read' ? 400 : 1, at: Number(this.card(k).dataset.ts) + 2000, ...(extra || {}) });
      T(0, 'A', 'read'); T(0, 'A', 'search', { query: '季度汇报 0' });
      T(1, 'B', 'read');
      for (const c of 'ABCD') T(3, c, 'read');   // four conversations ⇒ three rows + "+1 more"
      T(4, 'C', 'read'); T(4, 'C', 'search', { query: '季度汇报 4' });
      T(5, 'A', 'read'); T(6, 'B', 'read');
      cv._channelTouches.onTouch({ sessionId: cv.sessionId, touches });
      const want = [0, 1, 3, 4, 5, 6];
      for (let i = 0; i < 60 && !want.every((k) => this.card(k).classList.contains('chat-channel-touched')); i++) await sleep(100);
      await sleep(500);
      return { ok: want.every((k) => this.card(k).classList.contains('chat-channel-touched')), plainTouched: this.card(${CH_PLAIN}).classList.contains('chat-channel-touched') };
    },
    card(k) { return this.list && this.list.querySelector(':scope > .chat-msg[data-tool-id="toolu_c' + k + '"]'); },
    run(k) { return (this.cv._runs || []).find((r) => r.members.includes(this.card(k))) || null; },
    async toggle() { this.run(0).header.click(); await sleep(450); return this.state(); },
    state() {
      const vis = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
      const r1 = this.run(0);
      const cards = [0, 1, 2, 3, 4, 5, 6].map((k) => {
        const el = this.card(k);
        const head = el.querySelector('.chat-tool-use > .chat-tool-label');
        const box = el.querySelector('.chat-channel-touches');
        const rows = [...el.querySelectorAll('.chat-channel-touch')];
        const hr = head && head.getBoundingClientRect(), br = box && box.getBoundingClientRect();
        const shown = rows.filter(vis);
        const cmd = el.querySelector('.chat-channel-compact-cmd');
        return { k, h: Math.round(el.getBoundingClientRect().height * 10) / 10, display: getComputedStyle(el).display,
          compact: el.classList.contains('chat-channel-compact'), collapsed: el.classList.contains('chat-run-collapsed'),
          headVis: vis(head), cmd: vis(cmd) ? cmd.textContent : '', rows: rows.length, rowsVis: shown.length,
          rowsClipped: br ? shown.filter((r) => { const rr = r.getBoundingClientRect(); return rr.right > br.right + 1 || rr.width < 24; }).length : -1,
          oneLine: !!hr && shown.length > 0 && shown.every((r) => { const rr = r.getBoundingClientRect(); const mid = (rr.top + rr.bottom) / 2; return mid > hr.top - 4 && mid < hr.bottom + 4; }),
          more: vis(el.querySelector('.chat-channel-touches-more')),
          bodies: el.querySelectorAll('.chat-tool-use > details').length, bodiesVis: [...el.querySelectorAll('.chat-tool-use > details')].filter(vis).length,
          overflowX: Math.round(el.scrollWidth - el.clientWidth) };
      });
      const top = r1 && r1.header ? r1.header.getBoundingClientRect().top : 0;
      const lastEl = r1 ? (r1.footer && r1.footer.isConnected ? r1.footer : r1.members[r1.members.length - 1]) : null;
      return { heads: this.list.querySelectorAll(':scope > .chat-run-header').length, header: !!(r1 && r1.header), open: !!(r1 && r1.open),
        label: (r1 && r1.header ? r1.header.querySelector('.chat-run-label').textContent : '').trim(), run2: !!this.run(5),
        runH: lastEl ? Math.round(lastEl.getBoundingClientRect().bottom - top) : 0, cards };
    },
  };
  return true;
})()`;
const TOUCHED = [0, 1, 3, 4];
// VS_SHOT_DIR=<dir> saves the owner's run closed / open (and closed on the pre-lane control page)
const chShot = async (call, ev, name) => {
  if (!process.env.VS_SHOT_DIR) return;
  await ev(`(() => { window.__ch.run(0).header.scrollIntoView({ block: 'start' }); return true; })()`); await sleep(250);
  const r = await call('Page.captureScreenshot', { format: 'png' });
  fs.mkdirSync(process.env.VS_SHOT_DIR, { recursive: true }); fs.writeFileSync(path.join(process.env.VS_SHOT_DIR, name), Buffer.from(r.result.data, 'base64'));
};
await evaljs(CH_KIT);
const ch0 = await evaljs(`window.__ch.open()`);
check('channel run fixture: the witness bound conversation rows to the 4 searches + the 2 of the second run (through the view\'s own onTouch door), never to the plain grep', ch0?.ok && ch0.plainTouched === false, JSON.stringify(ch0));
const chC = await evaljs(`window.__ch.state()`);
await chShot(cdp, evaljs, 'channel-run-closed.png');
const cardsOf = (st, ks) => ks.map((k) => st?.cards?.[k]).filter(Boolean);
check(`CLOSED (the default): ONE header over the owner's run, and it says what stays — 「${chC?.label}」 names 「4 条带会话入口」 beside 「5 条 Bash · 1 ✗」`,
  chC?.header && !chC.open && chC.label === '5 条 Bash · 1 ✗ · 4 条带会话入口', JSON.stringify({ label: chC?.label, header: chC?.header, open: chC?.open }));
check('CLOSED: the 4 touched cards are COMPACT and on screen — the head drawn with the first words of the command, every row visible and inside its card (lane touch-chip-cause: or folded into "+N more" by the readable-minimum fit), the input/output bodies hidden',
  cardsOf(chC, TOUCHED).length === 4 && cardsOf(chC, TOUCHED).every((c) => c.compact && !c.collapsed && c.display !== 'none' && c.headVis && /^vibespace-channels search "季度汇报 \d" --adapter lark/.test(c.cmd)
    && c.rows > 0 && c.rowsVis >= 1 && (c.rowsVis === c.rows || c.more) && c.rowsClipped === 0 && c.bodies === 2 && c.bodiesVis === 0),
  JSON.stringify(cardsOf(chC, TOUCHED).map((c) => ({ k: c.k, compact: c.compact, collapsed: c.collapsed, head: c.headVis, rows: c.rows, vis: c.rowsVis, clip: c.rowsClipped, more: c.more, bodies: `${c.bodiesVis}/${c.bodies}`, cmd: c.cmd.slice(0, 24) }))));
check('CLOSED: each compact card is ONE line (its rows ride the head\'s line; the card with four conversations keeps its "+1 more"), never wider than its card',
  cardsOf(chC, TOUCHED).every((c) => c.oneLine && c.overflowX <= 1) && chC.cards[3].rows === 3 && chC.cards[3].more, JSON.stringify(cardsOf(chC, TOUCHED).map((c) => ({ k: c.k, oneLine: c.oneLine, ox: c.overflowX, rows: c.rows, more: c.more }))));
check('CLOSED: the plain card (no conversation rows) is folded away (display:none)', chC?.cards?.[CH_PLAIN]?.collapsed && chC.cards[CH_PLAIN].display === 'none', JSON.stringify(chC?.cards?.[CH_PLAIN]));
check('a run of ONLY touched cards gets NO header — the dead-control law, pinned (its two cards whole: not compact, bodies drawn)',
  chC?.heads === 1 && !chC.run2 && cardsOf(chC, [5, 6]).every((c) => !c.compact && !c.collapsed && c.display !== 'none' && c.bodiesVis === 2 && c.cmd === ''), JSON.stringify({ heads: chC?.heads, run2: chC?.run2, c: cardsOf(chC, [5, 6]) }));
const chO = await evaljs(`(async () => { window.__chRows = [...window.__ch.list.querySelectorAll(':scope > .chat-msg .chat-channel-touch')]; return window.__ch.toggle(); })()`);
check('OPEN: all five whole — no card compact or folded, every body drawn, the command words gone from the head',
  chO?.open && cardsOf(chO, [0, 1, 2, 3, 4]).every((c) => !c.compact && !c.collapsed && c.display !== 'none' && c.bodiesVis === 2 && c.cmd === ''), JSON.stringify(cardsOf(chO, [0, 1, 2, 3, 4])));
await chShot(cdp, evaljs, 'channel-run-open.png');
const ratio = TOUCHED.map((k) => (chO?.cards?.[k]?.h ? chC.cards[k].h / chO.cards[k].h : 1));
check(`the fold changes the height it governs: each touched card closed < 1/3 of its open height (${TOUCHED.map((k, i) => `${chC?.cards?.[k]?.h}/${chO?.cards?.[k]?.h}=${ratio[i].toFixed(2)}`).join(', ')})`,
  ratio.every((r) => r < 1 / 3), JSON.stringify(ratio));
console.log(`    the owner's run (5 Bash · 4 touched): ${chC?.runH} px closed vs ${chO?.runH} px open (header → last member / footer)`);
const chC2 = await evaljs(`(async () => { const st = await window.__ch.toggle(); const now = [...window.__ch.list.querySelectorAll(':scope > .chat-msg .chat-channel-touch')];
  return { ...st, same: now.length === window.__chRows.length && now.every((e, i) => e === window.__chRows[i]) }; })()`);
check('CLOSED AGAIN: compact again with the SAME row elements (CSS only — nothing re-rendered, the rows keep their listeners)',
  !chC2?.open && chC2.same && cardsOf(chC2, TOUCHED).every((c) => c.compact && c.rowsVis === chC.cards[c.k].rowsVis) && TOUCHED.every((k) => Math.abs(chC2.cards[k].h - chC.cards[k].h) <= 1), JSON.stringify({ same: chC2?.same, open: chC2?.open }));
// THE JUMP from a compact row: a REAL press at the row's centre (what is under the pointer is that row) reaches the
// row's own door — a read row opens the conversation, a search row the search; the run stays closed
const jumpAt = async (k) => {
  const at = await evaljs(`(async () => {
    const app = window.__ch.cv.app || window.app;
    if (!window.__chDoors) { window.__chDoors = [app.openChannel, app.openChannelSearch]; window.__jumps = [];
      app.openChannel = (a, c) => { window.__jumps.push(['channel', a, c]); }; app.openChannelSearch = (o) => { window.__jumps.push(['search', o.adapterIds && o.adapterIds[0], o.convId, o.q]); }; }
    const row = window.__ch.card(${k}).querySelector('.chat-channel-touch');
    row.scrollIntoView({ block: 'center' }); await new Promise((r) => setTimeout(r, 250));
    const b = row.getBoundingClientRect(); const x = b.left + Math.min(40, b.width / 2), y = b.top + b.height / 2;
    const hit = document.elementFromPoint(x, y);
    return { x, y, hit: !!hit && row.contains(hit) };
  })()`);
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y });
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: at.x, y: at.y, button: 'left', clickCount: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at.x, y: at.y, button: 'left', clickCount: 1 });
  await sleep(250);
  return at;
};
const hit1 = await jumpAt(1), hit0 = await jumpAt(0);
const jumped = await evaljs(`(() => { const app = window.__ch.cv.app || window.app; [app.openChannel, app.openChannelSearch] = window.__chDoors; delete window.__chDoors;
  return { jumps: window.__jumps, st: window.__ch.state() }; })()`);
check('a REAL press on a compact row still jumps — the read row opens its conversation (lark · oc_B), the search row the search (lark · oc_A · 「季度汇报 0」); the run stays closed and the cards compact',
  hit1.hit && hit0.hit && JSON.stringify(jumped?.jumps) === JSON.stringify([['channel', 'lark', 'oc_B'], ['search', 'lark', 'oc_A', '季度汇报 0']]) && !jumped.st.open && cardsOf(jumped.st, TOUCHED).every((c) => c.compact),
  JSON.stringify({ hit1, hit0, jumps: jumped?.jumps, open: jumped?.st?.open }));

// RED CONTROL: the pre-lane rule — the same chat-view.js WITHOUT the compact toggle (exempt cards stay whole inside a
// closed run), built into a bundle served to a second page; the same fixture, the same touches, the same probe ⇒
// closed height == open height on every touched card (the owner's screenshots), so the leg above can go red
{
  const CVSRC = read('src/lib/chat-view.js');
  const LANE = `      // lane run-fold-channel-compact: …and a LINKED inline member (channel rows) is one line while the run is closed
      const cc = !run.open && !!run.linked?.has(el);
      if (cc) this._compactHead(el);
      el.classList.toggle('chat-channel-compact', cc);
`;
  check('control: the lane\'s toggle is in chat-view.js exactly once (the patched copy drops it — the pre-lane rule)', CVSRC.split(LANE).length === 2);
  const MUT = mutantCopies('fold-ux-channel-compact', repo);
  const bundleText = await buildPatchedBundle(MUT, 'src/lib/chat-view.js', CVSRC.split(LANE).join(''), 'pre-lane');
  for (const row of copiesCensus(MUT.files, MUT.dir, repo, { minCopies: 1, label: 'channel-compact ' })) check(row.name, row.pass, row.detail);
  const t2 = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const s2 = new WebSocket(t2.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r) => s2.on('open', r));
  let seq2 = 0, served = 0; const pend2 = new Map(); const body = Buffer.from(bundleText).toString('base64');
  const cdp2 = (method, params = {}) => new Promise((res) => { const id = ++seq2; pend2.set(id, res); s2.send(JSON.stringify({ id, method, params })); });
  s2.on('message', (d) => {
    const m = JSON.parse(d);
    if (m.id && pend2.has(m.id)) { pend2.get(m.id)(m); pend2.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') { try { pageErrors.push('[control] ' + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'unknown')); } catch {} }
    if (m.method !== 'Fetch.requestPaused') return;
    const id = m.params.requestId;
    if (/\/bundle\.js(\?|$)/.test(m.params.request.url)) { served++; cdp2('Fetch.fulfillRequest', { requestId: id, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/javascript' }], body }); }
    else cdp2('Fetch.continueRequest', { requestId: id });
  });
  const eval2 = async (expr) => { const r = await cdp2('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 600)); return r.result?.result?.value; };
  await cdp2('Runtime.enable'); await cdp2('Page.enable');
  await cdp2('Fetch.enable', { patterns: [{ urlPattern: '*bundle.js*', requestStage: 'Request' }] });
  await cdp2('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); await cdp2('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  for (let i = 0; i < 100; i++) { if (await eval2('!!(window.app && window.app.ready && window.app.wm)').catch(() => false)) break; await sleep(300); }
  await eval2('window.app.ready.then(() => true)').catch(() => {});
  await sleep(900);
  await eval2(CH_KIT);
  const k0 = await eval2(`window.__ch.open()`);
  const kC = await eval2(`window.__ch.state()`);
  await chShot(cdp2, eval2, 'channel-run-closed-pre-lane.png');
  const kO = await eval2(`window.__ch.toggle()`);
  const same = TOUCHED.map((k) => (kC?.cards?.[k] && kO?.cards?.[k] ? Math.round(kC.cards[k].h - kO.cards[k].h) : null));
  check(`RED CONTROL: the page served the PATCHED bundle (${served}×) — the same closed run keeps the 4 touched cards WHOLE: closed height == open height on every one (${TOUCHED.map((k) => `${kC?.cards?.[k]?.h}/${kO?.cards?.[k]?.h}`).join(', ')}), so the < 1/3 predicate reads RED there`,
    served > 0 && k0?.ok && same.every((d) => d !== null && Math.abs(d) <= 1) && !TOUCHED.every((k) => kC.cards[k].h < kO.cards[k].h / 3), JSON.stringify({ served, k0, same }));
  check('…and the probe is not vacuous there: the closed run has its header, the plain card is folded, every touched card shows its rows (the pre-lane form)',
    kC?.header && !kC.open && kC.cards[CH_PLAIN].display === 'none' && cardsOf(kC, TOUCHED).every((c) => c.rowsVis === c.rows && c.rows > 0 && c.bodiesVis === 2 && !c.compact), JSON.stringify({ header: kC?.header, plain: kC?.cards?.[CH_PLAIN]?.display }));
  console.log(`    pre-lane (patched bundle): the owner's run ${kC?.runH} px closed vs ${kO?.runH} px open`);
  try { s2.close(); } catch {}
  try { await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${t2.id}`); } catch {}
  try { await fetch(`http://127.0.0.1:${CDP_PORT}/json/activate/${target.id}`); } catch {}
  await sleep(300);
}
// ── lane touch-chip-cause (the owner, 2026-10-28 11:4x PT, 「这个展开方式对吗？」 — two screenshots of one chat: the
// closed run 「▸ VibeSpace 把任务背景交给了助手 · 4 条 Bash · 3 条带会话入口」 with a `vibespace-status working --reason …`
// row holding three chips + «另有 14 个», and after «另有 14 个» ten chips squeezed to «Lar…» / «Gm…» on one line).
// The witness's touches arrive through the view's OWN door (onTouch) at instants inside the calls, like real ones.
const TC_KIT = `(() => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const vis = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const findCv = () => [...window.app.sessions.values()].find((s) => s && s._messageList && s._messageList.querySelector(':scope > .chat-msg[data-tool-id="toolu_t0"]'));
  const GM = ['Re: Client onboarding checklist', 'RE: Fixture renewal terms (external)', 'Quarterly numbers for the board pack', 'Invoice 4471 overdue reminder', 'Fwd: Pairing schedule for next week',
    'Re: Support escalation for the dock', 'Shipping window moved to Thursday', 'Re: Re: Contract redlines round two', 'Welcome aboard — first-week plan', 'Fixture survey results are in', 'Re: Office move logistics', 'Training slots open for review'];
  const LK = ['Ops desk', '季度汇报群 · 数字核对', 'Pairing room (night shift)', 'Release train coordination', '客户支持升级处理'];
  window.__tc = {
    async open({ maximize, account } = {}) {
      let cv = findCv();
      if (!cv) window.app.viewSession(${JSON.stringify(TC_SID)}, ${JSON.stringify(CWD)}, 'touch cause');
      for (let i = 0; i < 80 && !(cv = findCv()); i++) await sleep(250);
      if (!cv) return { err: 'no touch-cause ChatView' };
      this.cv = cv; this.list = cv._messageList;
      for (let i = 0; i < 40 && !(this.card(0) && this.card(8) && this.note(2)); i++) await sleep(150);
      if (maximize) { const w = [...window.app.wm.windows.values()].find((x) => x.element && x.element.contains(this.list)); if (w && !w.isMaximized) window.app.wm.toggleMaximize(w.id); }
      await sleep(600);
      const at = (k, d) => Number(this.card(k).dataset.ts) + d;
      const touches = [];
      // the OWNER's shape: 17 conversations (5 Lark, 12 Gmail) touched while vibespace-status ran — no call in view ran the CLI then
      for (let i = 0; i < 17; i++) { const lark = i % 4 === 0 && i < 20 && touches.filter((x) => x.adapterId === 'lark').length < 5;
        touches.push({ id: 'tc-o' + i, op: 'read', adapterId: lark ? 'lark' : 'gmail', convId: 'fx-o' + i, title: lark ? LK[touches.filter((x) => x.adapterId === 'lark').length] : GM[i % GM.length] + (i >= 12 ? ' #' + i : ''), account: account ? account[lark ? 0 : 1] : lark ? 'Lark / 飞书' : 'Gmail', icon: lark ? 'chat' : 'mail', kind: lark ? 'group' : 'gmail', count: 1 + (i % 4), at: at(0, 1500 + i * 10) }); }
      // …and the read the agent ran itself (its read call names it)
      touches.push({ id: 'tc-r', op: 'read', adapterId: 'lark', convId: 'oc_f1x7ure0', title: 'Ops desk', account: 'Lark / 飞书', icon: 'chat', kind: 'group', count: 60, at: at(1, 1500) });
      // H1: the chained command's search — 17 conversations, one instant
      for (let i = 0; i < 17; i++) touches.push({ id: 'tc-s' + i, op: 'search', adapterId: i % 5 ? 'gmail' : 'lark', convId: 'fx-s' + i, title: (i % 5 ? GM[(i + 3) % GM.length] : LK[(i / 5) % LK.length]) + ' · s' + i, account: i % 5 ? 'Gmail' : 'Lark / 飞书', icon: i % 5 ? 'mail' : 'chat', kind: 'gmail', count: 2, query: 'pairing review', at: at(4, 1800) });
      // H2: the read loop's three unnamed reads (the batch's vibespace-status started 40 ms later)
      for (let i = 0; i < 3; i++) touches.push({ id: 'tc-q' + i, op: 'read', adapterId: 'lark', convId: 'fx-q' + i, title: 'Queue item ' + i, account: 'Lark / 飞书', icon: 'chat', kind: 'p2p', count: 20, at: at(6, 1500 + i * 400) });
      cv._channelTouches.onTouch({ sessionId: cv.sessionId, touches });
      for (let i = 0; i < 60 && !(this.total(this.card(1)) && this.total(this.card(4))); i++) await sleep(100);
      await sleep(600);
      return { ok: !!(this.total(this.card(1)) && this.total(this.card(4))) };
    },
    card(k) { return this.list && this.list.querySelector(':scope > .chat-msg[data-tool-id="toolu_t' + k + '"]'); },
    note(i) { return this.list ? [...this.list.querySelectorAll(':scope > .chat-msg.chat-vs-note')][i] || null : null; },
    /** how many conversations a card / note row carries (its rows + what its fold holds) */
    total(el) { const box = el && el.querySelector('.chat-channel-touches'); if (!box || box.hidden) return 0; const more = box.querySelector(':scope > .chat-channel-touches-more'); return more && more._rows ? more._rows.length : box.querySelectorAll(':scope > .chat-channel-touch').length; },
    holder() { const n = this.note(0); return this.total(n) ? n : this.card(0); },   // whichever row carries the owner's 17
    state() {
      const r1 = (this.cv._runs || []).find((r) => r.members.includes(this.card(0)));
      const cmd = this.card(4) && this.card(4).querySelector('.chat-channel-compact-cmd');
      return { cards: [0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) => this.total(this.card(k))), notes: [0, 1, 2].map((i) => this.total(this.note(i))),
        noteIn: !!(r1 && r1.members.includes(this.note(0))), label: r1 && r1.header ? r1.header.querySelector('.chat-run-label').textContent.trim() : '', open: !!(r1 && r1.open),
        holderCompact: this.holder().classList.contains('chat-channel-compact'), head4: vis(cmd) ? cmd.textContent : '' };
    },
    /** the strip as a reader sees it — readable judged by an INDEPENDENT probe: the account + 12 characters of the title laid out
     *  in the name's own font, against the name's drawn width */
    strip(el) {
      const box = el.querySelector('.chat-channel-touches'), br = box.getBoundingClientRect();
      const chips = [...box.querySelectorAll(':scope > .chat-channel-touch')].filter(vis);
      const more = box.querySelector(':scope > .chat-channel-touches-more');
      // the probe lives in the LIST's own tree (r2: the UI scale and the chat's font scale zoom it like the names)
      const probe = document.createElement('span'); probe.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;white-space:pre;pointer-events:none'; this.list.appendChild(probe);
      const facts = chips.map((c) => {
        const name = c.querySelector('.cct-name'), ns = getComputedStyle(name), row = c._row || {};
        probe.style.fontFamily = ns.fontFamily; probe.style.fontSize = ns.fontSize; probe.style.fontWeight = ns.fontWeight; probe.style.fontStyle = ns.fontStyle;
        // the readable part: the account + 12 characters of the title — and the «…» that says a longer one goes on; a name
        // that short is drawn WHOLE (a fractional shrink that puts «…» over its last glyph is not readable)
        const full = String(name.textContent || ''), title = [...String(row.title || row.convId || '')];
        const part = (row.account ? row.account + ' › ' : '') + title.slice(0, 12).join('');
        probe.textContent = title.length > 12 ? part + '…' : full;
        const need = probe.getBoundingClientRect().width, have = name.getBoundingClientRect().width, r = c.getBoundingClientRect();
        // chip 0's TIGHT floor (r2): the first 6 code points of the name + «…»
        probe.textContent = [...full].slice(0, 6).join('') + (full.length > 6 ? '…' : '');
        const tightNeed = probe.getBoundingClientRect().width;
        return { need: Math.round(need * 10) / 10, have: Math.round(have * 10) / 10, readable: have + 0.01 >= need, tight: have + 0.01 >= tightNeed, inside: r.left >= br.left - 1 && r.right <= br.right + 1, top: Math.round(r.top + r.height / 2), w: Math.round(r.width), tw: vis(c.querySelector('.cct-time')), min: parseFloat(c.style.minWidth) || 0 };
      });
      probe.remove();
      const mr = more && vis(more) ? more.getBoundingClientRect() : null;
      // NO CHIP FOLDED THAT WOULD FIT (CSS px, r2): the visible chips' minimums + the first hidden one + the fold control vs the box
      const all = [...box.querySelectorAll(':scope > .chat-channel-touch')], gapPx = parseFloat(getComputedStyle(box).columnGap) || 0;
      const nextHidden = all.find((x) => x.hidden);
      const usedCss = facts.reduce((s, f, i) => s + f.min + (i ? gapPx : 0), 0);
      const underFilled = !!(nextHidden && more && usedCss + gapPx + (parseFloat(nextHidden.style.minWidth) || 0) + (all.indexOf(nextHidden) + 1 < all.length || (more._rows || []).length > all.indexOf(nextHidden) + 1 ? gapPx + more.offsetWidth : 0) <= box.clientWidth - 1);
      return { n: facts.length, facts, total: this.total(el), readable: facts.filter((f) => f.readable).length, inside: facts.every((f) => f.inside), oneLine: new Set(facts.map((f) => Math.round(f.top / 4))).size <= 1,
        stacked: facts.every((f, i) => i === 0 || f.top > facts[i - 1].top + 6), fullWidth: facts.every((f) => f.w >= br.width * 0.9), times: facts.filter((f) => f.tw).length,
        more: mr ? more.textContent : '', moreInside: mr ? mr.right <= br.right + 1 && mr.left >= br.left - 1 : null, moreWhole: mr ? mr.right <= br.right + 1 && mr.left >= br.left - 1 && more.scrollWidth <= more.clientWidth + 1 : null,
        boxW: Math.round(br.width), boxCss: box.clientWidth, underFilled, mins: facts.map((f) => f.min), zoom: Math.round((br.width / (box.offsetWidth || 1)) * 100) / 100, expanded: box.dataset.expanded === '1', compact: el.classList.contains('chat-channel-compact') };
    },
    async moreAt(el) {
      const more = el.querySelector('.chat-channel-touches > .chat-channel-touches-more');
      if (!more) return null;
      more.scrollIntoView({ block: 'center' }); await sleep(250);
      const b = more.getBoundingClientRect(); const x = b.left + b.width / 2, y = b.top + b.height / 2;
      const hit = document.elementFromPoint(x, y);
      return { x, y, hit: !!hit && more.contains(hit), text: more.textContent };
    },
  };
  return true;
})()`;
const tcShot = async (call, ev, name) => {
  if (!process.env.VS_SHOT_DIR) return;
  await ev(`(() => { const h = window.__tc.holder(); h.scrollIntoView({ block: 'start' }); window.__tc.list.scrollTop -= 60; return true; })()`); await sleep(300);
  const r = await call('Page.captureScreenshot', { format: 'png' });
  fs.mkdirSync(process.env.VS_SHOT_DIR, { recursive: true }); fs.writeFileSync(path.join(process.env.VS_SHOT_DIR, name), Buffer.from(r.result.data, 'base64'));
};
const tcPress = async (call, ev, which) => {
  const at = await ev(`window.__tc.moreAt(${which})`);
  if (!at) return null;
  await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y });
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: at.x, y: at.y, button: 'left', clickCount: 1 });
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at.x, y: at.y, button: 'left', clickCount: 1 });
  await sleep(500);
  return at;
};
const tcLoad = async (call, ev, metrics) => {
  await call('Emulation.setDeviceMetricsOverride', metrics);
  await call('Page.reload', {});
  for (let i = 0; i < 100; i++) { if (await ev('!!(window.app && window.app.ready && window.app.wm)').catch(() => false)) break; await sleep(300); }
  await ev('window.app.ready.then(() => true)').catch(() => {});
  await sleep(900);
  await ev(TC_KIT);
};
const D1280 = { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }, P390 = { width: 390, height: 844, deviceScaleFactor: 2, mobile: true };
const tcSize = async (call, ev, tag, size, metrics, shots) => {
  await tcLoad(call, ev, metrics);
  const o = await ev(`window.__tc.open({ maximize: ${size === 1280} })`);
  const st = await ev(`window.__tc.state()`);
  const closed = await ev(`window.__tc.strip(window.__tc.holder())`);
  const h1 = await ev(`window.__tc.strip(window.__tc.card(4))`);
  if (shots) await tcShot(call, ev, `touch-chip-cause-${size}-closed${tag}.png`);
  const p1 = await tcPress(call, ev, 'window.__tc.holder()');
  const open = await ev(`window.__tc.strip(window.__tc.holder())`);
  if (shots) await tcShot(call, ev, `touch-chip-cause-${size}-expanded${tag}.png`);
  const p2 = await tcPress(call, ev, 'window.__tc.holder()');
  const again = await ev(`window.__tc.strip(window.__tc.holder())`);
  return { o, st, closed, h1, p1, open, p2, again };
};
const tcStrip = (s) => JSON.stringify({ n: s?.n, total: s?.total, readable: s?.readable, inside: s?.inside, oneLine: s?.oneLine, more: s?.more, moreInside: s?.moreInside, boxW: s?.boxW, facts: s?.facts?.map((f) => `${f.have}/${f.need}`) });
for (const [size, metrics] of [[1280, D1280], [390, P390]]) {
  const r = await tcSize(cdp, evaljs, '', size, metrics, true);
  const st = r.st;
  if (size === 1280) {
    check('touch-chip-cause fixture: the owner\'s turn, the chained command and the parallel batch are drawn; the witness\'s touches bound', r.o?.ok, JSON.stringify(r.o));
    check(`THE OWNER'S SHAPE: the 17 conversations touched while \`vibespace-status\` ran hang on the turn's VibeSpace NOTE row (「VibeSpace 把任务背景交给了助手」) — vibespace-status carries NONE; the read stays on its read call (1)`,
      st?.notes?.[0] === 17 && st.cards[0] === 0 && st.cards[1] === 1 && st.cards[2] === 0 && st.cards[3] === 0, JSON.stringify({ notes: st?.notes, cards: st?.cards }));
    check(`…the note row is a member of the closed run and COMPACT, and the run's head counts it among its linked rows: 「${st?.label}」`,
      st?.noteIn && !st.open && st.holderCompact && /把任务背景交给了助手/.test(st.label) && /4 条 Bash/.test(st.label) && /2 条带会话入口/.test(st.label), JSON.stringify(st));
    check(`H1 the CHAINED command keeps its 17 search rows, and its compact head opens at the channels segment: 「${st?.head4}」`, st?.cards?.[4] === 17 && st.head4 === '… vibespace-channels search "pairing review" --full', JSON.stringify({ c4: st?.cards?.[4], head4: st?.head4 }));
    check('H2 the PARALLEL batch: the read loop (it runs the CLI) owns its three unnamed reads — not vibespace-status, which started 40 ms later', st?.cards?.[6] === 3 && st.cards[7] === 0, JSON.stringify({ c6: st?.cards?.[6], c7: st?.cards?.[7] }));
  }
  const c = r.closed;
  check(`${size}: the closed strip of the 17 — every visible chip READABLE (the account + 12 characters of its title drawn: ${c?.facts?.map((f) => `${f.have}≥${f.need}`).join(', ')}), inside its box, on one line; the rest fold into 「${c?.more}」`,
    c && c.compact && !c.expanded && c.total === 17 && c.n >= 1 && c.n <= 3 && c.readable === c.n && c.inside && c.oneLine && c.more === `另有 ${17 - c.n} 个` && c.moreInside, tcStrip(c));
  const h = r.h1;
  check(`${size}: the chained command's strip of 17 search rows keeps the same law (${h?.n} readable chip(s) + 「${h?.more}」)`,
    h && h.total === 17 && h.n >= 1 && h.readable === h.n && h.inside && h.oneLine && h.more === `另有 ${17 - h.n} 个`, tcStrip(h));
  const e = r.open;
  check(`${size}: a REAL press on 「${r.p1?.text}」 expands into ROWS — all 17, one per line (stacked), each the box's full width with its time; 「${e?.more}」 folds them back`,
    r.p1?.hit && e && e.expanded && e.n === 17 && e.stacked && e.fullWidth && e.times === 17 && e.more === '收起', JSON.stringify({ p1: r.p1, n: e?.n, stacked: e?.stacked, fullWidth: e?.fullWidth, times: e?.times, more: e?.more, boxW: e?.boxW }));
  const a = r.again;
  check(`${size}: 「收起」 (a real press) gives the strip back — the same readable chips and fold`, r.p2?.hit && a && !a.expanded && a.n === c?.n && a.readable === a.n && a.more === c?.more, tcStrip(a));
}
// ── touch-chip-cause round 2 (the r1 verdict, confirmed 0.93 / 0.88): THE MINIMUM IN ONE UNIT — the readable minimum was
// on-screen px written as a CSS min-width: at UI scale 80 % 129 px for a 156 px minimum, names cut below it; at 125 %
// fewer chips than fit. The real setting (localStorage `vibespace.uiScale`, applied at boot as the body's zoom), 1280.
{
  const z100 = (await (async () => { await tcLoad(cdp, evaljs, D1280); await evaljs('window.__tc.open({ maximize: true })'); return evaljs('window.__tc.strip(window.__tc.holder())'); })());
  for (const pct of [60, 80, 125]) {
    await evaljs(`localStorage.setItem('vibespace.uiScale', '${pct}'); true`);
    await tcLoad(cdp, evaljs, D1280);
    const o = await evaljs('window.__tc.open({ maximize: true })');
    const z = await evaljs('window.__tc.strip(window.__tc.holder())');
    if (pct === 80) await tcShot(cdp, evaljs, `touch-chip-cause-1280-ui${pct}.png`);
    check(`UI SCALE ${pct} % (body zoom ${z?.zoom}): every visible chip of the 17 READABLE (${z?.facts?.map((f) => `${f.have}≥${f.need}`).join(', ')}), its minimum the SAME CSS px as at 100 % (${z?.mins?.[0]} vs ${z100?.mins?.[0]}), inside, one line, the fold whole; no chip folded that would fit`,
      o?.ok && z && z.compact && z.n >= 1 && z.readable === z.n && z.inside && z.oneLine && z.moreWhole && !z.underFilled && z.more === `另有 ${17 - z.n} 个` && Math.abs((z.mins?.[0] || 0) - (z100?.mins?.[0] || -9)) <= 1, tcStrip(z) + ' ' + JSON.stringify({ zoom: z?.zoom, mins: z?.mins, under: z?.underFilled, boxCss: z?.boxCss }));
  }
  await evaljs(`localStorage.removeItem('vibespace.uiScale'); true`);
  // THE FOLD CONTROL IS NEVER CLIPPED (unverified r1 finding, reproduced with this suite: an email-shaped account label at
  // 390 kept chip 0 at its full minimum and pushed «另有 16 个» past the box — one glyph showed)
  await tcLoad(cdp, evaljs, P390);
  const ol = await evaljs(`window.__tc.open({ account: ['team.inbox.overflow@fixture-lark.example', 'team.inbox.overflow@fixture-mail.example'] })`);
  const lg = await evaljs('window.__tc.strip(window.__tc.holder())');
  await tcShot(cdp, evaljs, 'touch-chip-cause-390-long-label.png');
  check(`390 LONG ACCOUNT LABEL: the fold control 「${lg?.more}」 is WHOLE inside the box (${lg?.boxW} px); chip 0 inside it, its name cut to no less than its first 6 characters + «…» (${lg?.facts?.map((f) => f.have).join(', ')} px drawn)`,
    ol?.ok && lg && lg.n >= 1 && lg.inside && lg.oneLine && lg.moreWhole && lg.more === `另有 ${17 - lg.n} 个` && lg.facts.every((f) => f.tight), tcStrip(lg) + ' ' + JSON.stringify({ moreWhole: lg?.moreWhole, tight: lg?.facts?.map((f) => f.tight) }));
  const lp = await tcPress(cdp, evaljs, 'window.__tc.holder()');
  const le = await evaljs('window.__tc.strip(window.__tc.holder())');
  check(`390 LONG ACCOUNT LABEL: a REAL press on the whole control expands into 17 stacked rows`, lp?.hit && le && le.expanded && le.n === 17 && le.stacked, JSON.stringify({ lp, n: le?.n, stacked: le?.stacked }));
}

// RED CONTROL: the pre-lane view — a patched channel-touch-view.js whose calls carry no kind and whose binder sees no note
// rows (the pre-lane binding: time alone) and whose strip is never fitted — served to a second page at 390: the owner's 17
// land on vibespace-status, H2's reads on vibespace-status, and the chips sit below their readable minimum
{
  const TVSRC = read('src/lib/channel-touch-view.js');
  const CUTS = [
    ["      return { id: c.dataset.toolId, start, end, text: callText(c), kind: callKind(c), el: c };", "      return { id: c.dataset.toolId, start, end, text: callText(c), el: c };"],
    ["const { byCall, byNote } = T.bindToCall(st.touches, calls, { tail, notes, turns: turnsOf(list) });", "const { byCall, byNote } = T.bindToCall(st.touches, calls, { tail });"],
    ["const strip = !!card && card.classList.contains('chat-channel-compact') && box.dataset.expanded !== '1';", "const strip = false;"],
  ];
  check('control: each pre-lane cut finds its line exactly once in channel-touch-view.js', CUTS.every(([from]) => TVSRC.split(from).length === 2));
  const MUT = mutantCopies('fold-ux-touch-cause', repo);
  const bundleText = await buildPatchedBundle(MUT, 'src/lib/channel-touch-view.js', CUTS.reduce((s, [from, to]) => s.split(from).join(to), TVSRC), 'pre-cause');
  for (const row of copiesCensus(MUT.files, MUT.dir, repo, { minCopies: 1, label: 'touch-cause ' })) check(row.name, row.pass, row.detail);
  const t3 = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const s3 = new WebSocket(t3.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r) => s3.on('open', r));
  let seq3 = 0, served3 = 0; const pend3 = new Map(); const body3 = Buffer.from(bundleText).toString('base64');
  const cdp3 = (method, params = {}) => new Promise((res) => { const id = ++seq3; pend3.set(id, res); s3.send(JSON.stringify({ id, method, params })); });
  s3.on('message', (d) => {
    const m = JSON.parse(d);
    if (m.id && pend3.has(m.id)) { pend3.get(m.id)(m); pend3.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') { try { pageErrors.push('[tc-control] ' + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'unknown')); } catch {} }
    if (m.method !== 'Fetch.requestPaused') return;
    const id = m.params.requestId;
    if (/\/bundle\.js(\?|$)/.test(m.params.request.url)) { served3++; cdp3('Fetch.fulfillRequest', { requestId: id, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/javascript' }], body: body3 }); }
    else cdp3('Fetch.continueRequest', { requestId: id });
  });
  const eval3 = async (expr) => { const r = await cdp3('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 600)); return r.result?.result?.value; };
  await cdp3('Runtime.enable'); await cdp3('Page.enable');
  await cdp3('Fetch.enable', { patterns: [{ urlPattern: '*bundle.js*', requestStage: 'Request' }] });
  await cdp3('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); await cdp3('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  const k = await tcSize(cdp3, eval3, '-pre-lane-control', 390, P390, true);
  check(`RED CONTROL: the page served the PATCHED view (${served3}×) — the owner's 17 land on \`vibespace-status\` (${k.st?.cards?.[0]}) and its note row carries none (${k.st?.notes?.[0]}); H2's reads land on vibespace-status (${k.st?.cards?.[7]}) — the binding legs above read RED there`,
    served3 > 0 && k.o?.ok && k.st?.cards?.[0] === 17 && k.st.notes[0] === 0 && k.st.cards[7] === 3 && k.st.cards[6] === 0, JSON.stringify({ served3, o: k.o, cards: k.st?.cards, notes: k.st?.notes }));
  check(`RED CONTROL: …and its strip is never fitted — ${k.closed?.n} chips, ${k.closed ? k.closed.n - k.closed.readable : '?'} below the readable minimum (${k.closed?.facts?.map((f) => `${f.have}<${f.need}`).join(', ')}) — the strip leg reads RED there`,
    k.closed && k.closed.n === 3 && k.closed.readable < k.closed.n, tcStrip(k.closed));
  try { s3.close(); } catch {}
  try { await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${t3.id}`); } catch {}
  try { await fetch(`http://127.0.0.1:${CDP_PORT}/json/activate/${target.id}`); } catch {}
  await sleep(300);
}
await cdp('Emulation.clearDeviceMetricsOverride', {});
await evaljs(`localStorage.removeItem('vibespace.lang'); true`);

check('zero uncaught page exceptions during the whole flow', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

ws.close();
console.log(failed ? `\n${failed} FAILED (${passed} passed)` : `\nALL PASS (${passed})`);
process.exit(failed ? 1 : 0);
