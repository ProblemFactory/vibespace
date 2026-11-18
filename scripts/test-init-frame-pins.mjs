#!/usr/bin/env node
// THE INIT FRAME — THE SOURCE-TEXT LEGS (fast, text only — lane lg-text-legs-3, B-94d3 part three). MOVED VERBATIM from the
// heavy scripts/test-init-frame.mjs, whose PURE rows, the real ChatView feeder and the browser legs stay there: the push/init
// position pin, the wiring pins (the composer, the renderer, every meta source, the history hoist, the fork handler, the one
// dropdown width writer — each checker with its NEGATIVE CONTROL), and round 4/5's health-chip wiring. Each reads the file it
// pins BY NAME, so ci.mjs's affected rule selects this suite on a change of that file.
// Run: node scripts/test-init-frame-pins.mjs
import fs from 'node:fs';
import path from 'node:path';
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0, skipped = 0;
const ok = (n, c, e) => { if (typeof n !== 'string') throw new TypeError(`ok(): the name is a ${typeof n} — swapped arguments (B-1747: a swap is a crash, never a green leg)`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 500) : '')); } };

console.log('— chatStatus twin (attach path)');
{
  // WIRING PIN (the 2.331.0 lesson): the fix is an index comparison in the
  // shipped reader, not a local re-implementation in this file.
  const ss = fs.readFileSync(path.join(REPO, 'src/session-store.js'), 'utf8');
  ok('chatStatus compares the POSITIONS of the push and the init (never applies the push unconditionally)',
    /pushedIdx > initIdx/.test(ss) && !/if \(pushedCommands\) initFrame\.slashCommands = pushedCommands;/.test(ss));
}

// ── 5. wiring pins (the 2.331.0 lesson: a pure fix with no call site is dead) ──
console.log('— wiring pins');
{
  const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
  const cv = read('src/lib/chat-view.js'), ci = read('src/lib/chat-input.js'), cr = read('src/lib/chat-renderers.js');
  ok("ChatView routes the 'slash-commands' meta op into the composer (an `edit` on the init card can NOT do this: a complete system card is never re-rendered, so its side effects never re-run)",
    /op\.subtype === 'slash-commands'/.test(cv) && /setSlashCommands\(op\.data\?\.commands \|\| \[\], \{ terminal: op\.data\?\.terminal \|\| null \}\)/.test(cv));
  ok('…the init card\'s side effect and the attach path both pass the terminal subset',
    /setSlashCommands\(se\.slashCommands, \{ terminal: se\.terminalSlashCommands \|\| null \}\)/.test(cv) && /setSlashCommands\(status\.slashCommands, \{ terminal: status\.initFrame\?\.terminalSlashCommands \|\| null \}\)/.test(cv));
  ok('…and both feed the frame-declared memory dirs to the classifier', (cv.match(/noteMemoryPaths\(/g) || []).length >= 2);
  ok('setSlashCommands REPLACES through the ONE pure rule (no local filtering twin)', /this\._slashCommands = slashCompletionList\(cmds, terminal\);/.test(ci));
  ok('the renderer builds the card from the frame and returns it (it used to return el:null unconditionally), passing the repeat verdict through',
    /return \{ el: this\.buildInitCard\(f, \{ repeat: !!d\.frameRepeat \}\), sideEffect \};/.test(cr));
  for (const [file, what] of [['src/acp-message-manager.js', 'ACP available_commands_update'], ['src/codex-message-manager.js', 'codex wrapper_meta']]) {
    ok(`${what} emits the SAME meta op (one client path, no local/remote twin)`, /op: 'meta', subtype: 'slash-commands'/.test(read(file)));
  }

  // ORDER PIN (round 2). The frame-declared memory dirs must reach the
  // classifier BEFORE loadHistory renders the slab they classify: applyStatus
  // runs after the render loop, and a system/tool card is not re-rendered on a
  // status change, so a late noteMemoryPaths leaves every memory card in the
  // attached window rendered as an ordinary file card for the life of that
  // window. Positions, not presence — this pin fails on a HOISTED-BACK edit.
  const orderOk = (src) => {
    const loop = src.indexOf('for (const msg of messages) this._onCreateMessage(msg);');
    const hoist = src.indexOf('if (meta?.chatStatus?.initFrame?.memoryPaths) noteMemoryPaths(');
    return loop > 0 && hoist > 0 && hoist < loop;
  };
  ok('loadHistory learns the frame-declared memory dirs BEFORE it renders the history they classify', orderOk(cv));
  ok('…NEGATIVE CONTROL: the same checker FAILS on the pre-fix source (the hoist removed — proof it measures order, not presence)',
    !orderOk(cv.replace(/\n *if \(meta\?\.chatStatus\?\.initFrame\?\.memoryPaths\) noteMemoryPaths\([^\n]*\n/, '\n')));

  // §2.13: BOTH halves of forkAtMessage read the SAME row. The button lives in
  // chat-renderers, the handler in chat-view — round 1 gated only the button,
  // so the first harness to gain the row would have shown a dead control.
  const forkHandler = cv.slice(cv.indexOf('_forkFromMessage(uuid, msg) {'), cv.indexOf('_forkFromMessage(uuid, msg) {') + 600);
  ok('the per-message fork HANDLER gates on caps.forkAtMessage, like the button — no backend id left',
    /backendFeatureCaps\(backend\)\.forkAtMessage/.test(forkHandler) && !/backend !== 'claude'/.test(forkHandler), forkHandler.split('\n').slice(0, 6).join(' / '));
  ok('…and a click that cannot proceed SPEAKS (no-silent-failures) instead of returning silently', /showToast\(t\('Session id not known yet/.test(forkHandler));
  ok('…NEGATIVE CONTROL: the checker catches a planted backend-id gate', /backend !== 'claude'/.test(forkHandler + "\n if (backend !== 'claude') return;"));

  // ROUND 5 r2 — THE CLAMP IS SINGLE, STRUCTURALLY. showDropdown owns width
  // AND placement, because it decides them from the same two numbers; a caller
  // that widens the panel afterwards is invisible to the clamp that already
  // ran (design/goal/set-a-goal did exactly that and landed 162/142/102px off
  // a 375px screen). So the rule is not "remember not to" — the only writes to
  // a dropdown's min/max width in the whole file must live inside showDropdown,
  // and a caller says what it wants as an ARGUMENT.
  const csb = read('src/lib/chat-status-bar.js');
  const sdStart = csb.indexOf('const showDropdown = (anchor,');
  const sdEnd = csb.indexOf('\n    };', sdStart);
  const inShow = (i) => i > sdStart && i < sdEnd && sdStart > 0;
  const widthWrites = [...csb.matchAll(/\.style\.(?:min|max)Width\s*=/g)].map((m) => m.index);
  ok(`showDropdown takes the width INTENT as an argument and is the ONLY writer of a dropdown's min/max width (${widthWrites.length} write(s), all inside it)`,
    sdStart > 0 && sdEnd > sdStart && widthWrites.length > 0 && widthWrites.every(inShow),
    widthWrites.map((i) => csb.slice(csb.lastIndexOf('\n', i) + 1, csb.indexOf('\n', i)).trim()).join(' | '));
  ok('…and the three panels that need a width state it at the CALL (an option, not a style write after the fact)',
    /showDropdown\(designEl, DESIGN_PANEL_W\)/.test(csb) && /showDropdown\(goalEl, GOAL_PANEL_W\)/.test(csb) && /showDropdown\(goalEl, GOAL_SET_PANEL_W\)/.test(csb)
    && /const DESIGN_PANEL_W = \{ minWidth: 300, maxWidth: 440 \}/.test(csb));
  ok('…NEGATIVE CONTROL: the checker catches a planted post-hoc write (the exact pre-fix line)',
    (() => { const planted = csb.slice(0, sdEnd + 200) + "\n      dropdown.style.minWidth = '300px';\n" + csb.slice(sdEnd + 200);
      return [...planted.matchAll(/\.style\.(?:min|max)Width\s*=/g)].map((m) => m.index).some((i) => !(i > sdStart && i < sdEnd)); })());
}

console.log('— health facts on the attach path (round 4)');
{
  // WIRING PINS — the 2.331.0 lesson again: the pure rows are useless without
  // the three call sites that carry them from both paths to the one chip.
  const cvSrc = fs.readFileSync(path.join(REPO, 'src/lib/chat-view.js'), 'utf8');
  const crSrc = fs.readFileSync(path.join(REPO, 'src/lib/chat-renderers.js'), 'utf8');
  const sbSrc = fs.readFileSync(path.join(REPO, 'src/lib/chat-status-bar.js'), 'utf8');
  // ROUND 5 — the FEEDER, not the method. Round 4 pinned the method body for
  // slab independence and then fed it from the RENDER path, which runs for
  // every replayed record; the value therefore did depend on where the reader
  // had scrolled (reproduced below). These pins now name the ONE reader, the
  // ONE application point, and its position relative to the deferral.
  ok('WIRING: where the frame lives on a record is ONE pure reader (agent-meta initFrameOf), used by the renderer AND by ChatView — never two spellings of content[0].initData.frame',
    /export function initFrameOf\(msg\)/.test(fs.readFileSync(path.join(REPO, 'src/lib/agent-meta.js'), 'utf8'))
    && /const f = initFrameOf\(msg\);/.test(crSrc) && /initFrameOf\(msg\)/.test(cvSrc)
    && !/initData\.frame/.test(cvSrc) && !/d\.frame \|\| null/.test(crSrc));
  ok('WIRING: the render path no longer feeds the chip (a renderer runs for replays; that WAS the bug) — sideEffect.initFrame is gone from both sides',
    !/sideEffect\.initFrame/.test(crSrc) && !/se\.initFrame/.test(cvSrc));
  {
    const applyAt = cvSrc.indexOf('this._applyInitHealth(initFrameOf(msg), { replay: this._loadingHistory });');
    const deferAt = cvSrc.indexOf("if (!this._loadingHistory && (this._teleported || (!this._pinned && this._windowEnd < this._total)))");
    ok('WIRING: ChatView applies it ONCE per record and ABOVE the "viewing history" deferral — below it, a mid-session respawn\'s frame is dropped outright for a reader who happens to be scrolled back',
      applyAt > 0 && deferAt > 0 && applyAt < deferAt && (cvSrc.match(/_applyInitHealth\(/g) || []).length === 3, { applyAt, deferAt });
  }
  ok('WIRING: the ONE method is the only caller of setInitHealth, and it refuses BOTH a falsy frame (ABSENT ≠ CLEAN) and a REPLAY (a replayed record is not news) — enforced at the call site, not just in the doc',
    /_applyInitHealth\(frame, \{ replay = false \} = \{\}\) \{\s*\n\s*if \(!frame \|\| replay\) return;\s*\n\s*this\._statusBar\.setInitHealth\(initHealthIssues\(frame\)\);/.test(cvSrc)
    && (cvSrc.match(/setInitHealth\(/g) || []).length === 1);
  ok('WIRING: applyStatus stays the AUTHORITY for replayed records (it carries the server\'s newest-init pick over the whole record list) and passes no replay flag',
    /this\._applyInitHealth\(status\.initFrame\);/.test(cvSrc));
  // Since 2.369.83 the same block ALSO applies the rest of the live meta
  // (`_applyLiveMeta(msg)` — the queue strip's ghost-row incident) between the
  // chatStatus line and the streaming-label sync, so the pin anchors on the
  // ORDER of the three statements inside the block, not on byte adjacency (a
  // byte-adjacent pin turned the .83 heavy tier red on a merge that changed no
  // behaviour — 2.369.84).
  ok('WIRING: the same-epoch reconnect applies the attach payload\'s chatStatus (then the rest of its live meta) — the only attach path that dropped it, which is why its catch-up REPLAY used to be the chip\'s only writer there',
    /if \(msg\.chatStatus\) this\.applyStatus\(msg\.chatStatus\);[\s\S]{0,2000}?this\._applyLiveMeta\(msg\);\s*\n\s*\/\/ Sync streaming label from server/.test(cvSrc));
  ok('WIRING: the card and the chip import the SAME label (no second literal left in chat-renderers)',
    /initHealthLabel/.test(crSrc) && /initHealthLabel/.test(sbSrc) && !/t\('MCP \{name\}', \{ name: i\.name \}\)/.test(crSrc));
  ok('WIRING: the chip is NOT gated on what is in the slab — a guard that depends on where the transcript is scrolled fails while paging (`replay` is the caller\'s provenance claim, not a window bound)',
    !/_windowStart|_messages\.some|_windowEnd/.test(cvSrc.slice(cvSrc.indexOf('_applyInitHealth(frame, {'), cvSrc.indexOf('_applyInitHealth(frame, {') + 220)));
}

console.log(fail ? `\n${fail} FAILED (${pass} passed${skipped ? `, ${skipped} skipped` : ''})` : `\nALL PASS (${pass}${skipped ? `, ${skipped} skipped` : ''})`);
process.exit(fail ? 1 : 0);
