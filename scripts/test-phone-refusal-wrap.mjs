#!/usr/bin/env node
// LANE PHONE-REFUSAL-WRAP (2.369.355, the duo walk's P1-5 / P2-1 / P2-2 / P2-15 / P2-17) — the fast gate; the real-Chrome
// gate is scripts/test-phone-refusal-wrap-chrome.mjs (three phone sizes, a head tree and a base control tree).
//   ① PURE utils.js `toastSpot`: the phone / touch tier never puts the toast stack on the composer (its bottom edge 8 px
//      above the composer's top) and, with a modal open, in the ROOM the dialog makes; the desktop tier and the stack
//      anchored at the inbox button keep their place (null); CONTROL: the base's one place — `bottom: taskbar + 14 px` —
//      stands ON the composer the walk measured at 382×580
//   ② PURE taskbar.js `closeKeepsWord`: a running conversation's (or shell's) window close says it keeps running; an
//      ended one / a non-session window says nothing; the window menu's Close of a running session reads apart from its
//      Terminate (its own words, not red)
//   ③ what you typed keeps its line breaks through CSS, never a <br> (ci-355-red): the user bubble + a For-you reply take the
//      ONE markdown road (renderMarkdown — «a⏎b⏎c» stays `<p>a\nb\nc</p>`) and chat.css pre-wraps the USER's paragraphs only;
//      CONTROL: marked `breaks: true` (P2-15's first cut) writes two <br> — 4 accessibility nodes per break, test-ax-budget's fence
//   ④ PURE chat-status-bar.js `dropdownRoom`: the room above a status-bar chip under the container / the phone's top bar;
//      CONTROL: the walk's 621 px picker over a 529 px chip top stands at y −96 unbounded
//   ⑤ the wiring: the stylesheet rules (no sideways door in the New Session footer, the 44 px ✕, --dd-room), the port
//      notice's plain words + the plug SVG (no emoji), requestClose speaking AFTER the close, every new word in zh + ja
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(import.meta.url);
const U = await import(path.join(REPO, 'src/lib/utils.js'));
const TB = await import(path.join(REPO, 'src/lib/taskbar.js'));
const SB = await import(path.join(REPO, 'src/lib/chat-status-bar.js'));
const { marked } = require(path.join(REPO, 'node_modules/marked'));
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 500) : '')); } };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');

console.log('① where the toast stack stands (toastSpot)');
const { toastSpot } = U;
ok(toastSpot({ tier: false, composerTop: 488, vh: 580 }) === null, 'the desktop tier: null — the stylesheet\'s own place, as before');
ok(toastSpot({ tier: true, anchored: true, composerTop: 488, vh: 580 }) === null, 'a stack anchored at the inbox button: null (its own place)');
ok(JSON.stringify(toastSpot({ tier: true, modal: true, composerTop: 488, vh: 580 })) === '{"room":true}', 'a modal open: the ROOM under the dialog\'s head (the composer under the overlay does not matter)');
const s1 = toastSpot({ tier: true, composerTop: 488, vh: 580 });
ok(s1 && s1.bottom === 100, 'the walk\'s 382×580 composer (top 488): the stack\'s bottom edge 8 px above it — bottom 100 px', s1);
const s2 = toastSpot({ tier: true, composerTop: 274, vh: 368, scale: 1.25 });
ok(s2 && Math.abs(s2.bottom - 81.6) < 1e-9, 'a 1.25 UI scale: layout px (viewport px ÷ scale)', s2);
ok([null, NaN, 0, -5, 900].every((t) => toastSpot({ tier: true, composerTop: t, vh: 580 }) === null), 'no composer on screen (none, NaN, 0, above, below the viewport): null');
// CONTROL: the base's one place — `bottom: calc(var(--taskbar-height) + 14px)`; the walk measured the toast at y457–528 over
// the composer y488–532 (382×580). Our spot keeps the stack's bottom edge at 580 − 100 = 480 < 488.
const tbH = Number((read('public/style.css').match(/--taskbar-height: (\d+)px;/) || [])[1]);
const baseBottom = 580 - (tbH + 14), spotBottom = 580 - s1.bottom;
ok(tbH > 0 && baseBottom > 488 && spotBottom < 488, `CONTROL: the base's bottom edge (--taskbar-height ${tbH} + 14 px ⇒ y ${baseBottom}) stands ON the composer (top 488); the spot's (y ${spotBottom}) does not`, { tbH, baseBottom, spotBottom });

console.log('② the close says what keeps running (closeKeepsWord)');
const { closeKeepsWord } = TB;
ok(closeKeepsWord({ status: 'live', backend: 'claude' }) === 'Closed the window — the conversation keeps running', 'a live conversation: «Closed the window — the conversation keeps running»');
ok(closeKeepsWord({ status: 'tmux', backend: 'codex' }) === 'Closed the window — the conversation keeps running', 'a tmux one runs on too');
ok(closeKeepsWord({ status: 'live', backend: 'shell' }) === 'Closed the window — the terminal keeps running', 'a plain shell: «… the terminal keeps running» (the harness table\'s terminalOnly, no id branch)');
ok(['stopped', 'external', undefined].every((st) => closeKeepsWord({ status: st, backend: 'claude' }) === null) && closeKeepsWord(null) === null, 'ended, external, unknown or not a session window: nothing to say');
const tb = read('src/lib/taskbar.js');
ok(/const closeKeeps = !closeLabel && !group && !!closeKeepsWord\(sess\);/.test(tb) && /closeLabel = closeLabel \|\| '✕ ' \+ \(closeKeeps \? t\('Close window — it keeps running'\) : t\('Close'\)\);/.test(tb), 'the window menu: a running session\'s Close reads «✕ Close window — it keeps running» (a group\'s «Close group» and any other window keep theirs)');
ok(/const closeStyle = \(c\) => \(c\.closeKeeps \? '' : 'color:var\(--red, #e55\)'\);/.test(tb) && /command: 'window\.close', kind: 'close', (?:when: wmVerbs, )?label: \(c\) => c\.closeLabel, style: closeStyle \}/.test(tb), '…and it is not red — only Terminate session is (Close and Terminate never read alike)');
ok(/registerMenuItem\(\{ menu: M, group: '2_session', order: 20, command: 'window\.terminateSession', kind: 'terminate', when: live, style: 'color:var\(--red, #e55\)' \}\);/.test(tb), '…Terminate session keeps its red');
const win = read('src/lib/window.js');
ok(/const said = this\._app \? closeKeepsWord\(sessionForWin\(this\._app, win\)\) : null;[^\n]*\n\s*this\.closeWindow\(id\);\n\s*if \(said\) sayClosedKeepsRunning\(said\);/.test(win), 'requestClose (every user close door: the phone ✕, the frame ✕, a tab ✕, the menu, Ctrl+\\ x) reads the session BEFORE the close and speaks AFTER it — no ask, one tap');
ok(/_closedSaid\.el\.isConnected && now - _closedSaid\.at < 1500/.test(tb) && /t\('Closed \{n\} windows — what ran in them keeps running', \{ n: _closedSaid\.n \}\)/.test(tb), 'ONE toast per close burst: a group\'s Close re-words the toast already up («Closed {n} windows — …»)');

console.log('③ what you typed is what the bubble shows');
const cr = read('src/lib/chat-renderers.js'), chatCss = read('public/chat.css');
ok(/if \(b\.type === 'text'\) return `<div class="chat-text">\$\{this\.renderMarkdown\(b\.text\)\}<\/div>`;/.test(cr) && /<div class="chat-text">\$\{this\.renderMarkdown\(r\.reply \|\| ''\)\}<\/div>/.test(cr), 'the user bubble\'s text blocks and a For-you reply\'s body take the ONE markdown road (renderMarkdown)');
ok(!/renderUserMarkdown|breaks: true/.test(cr), 'no second markdown road and no `breaks: true` in chat-renderers.js (a <br> per line grew the accessibility tree)');
const rules = chatCss.split('\n').filter((l) => /white-space: pre-wrap/.test(l) && /\.chat-text/.test(l));
ok(rules.length === 1 && rules[0] === '.chat-msg-user .chat-text p { white-space: pre-wrap; }', 'chat.css: ONE pre-wrap rule over a .chat-text, scoped to the USER\'s paragraphs (the agent\'s markdown, lists, code untouched)', rules);
const para = marked.parse('a\nb\nc');
ok(!/<br>/.test(para) && /<p>a\nb\nc<\/p>/.test(para), '«a⏎b⏎c» on the ONE road: `<p>a\\nb\\nc</p>` — the two newlines stay in the paragraph\'s text for pre-wrap to show (no node per line)', para);
ok(/<ul>\n<li>a<\/li>\n<li>b<\/li>\n<\/ul>/.test(marked.parse('- a\n- b')) && /<pre><code>x\ny\n<\/code><\/pre>/.test(marked.parse('```\nx\ny\n```')), 'a list is still a list and a fence still a <pre> (no paragraph — the rule never reaches them)');
ok((marked.parse('a\nb\nc', { breaks: true }).match(/<br>/g) || []).length === 2, 'CONTROL: marked `breaks: true` (P2-15\'s first cut, 2.369.355) writes two <br> for the same words');

console.log('④ the room above a status-bar chip (dropdownRoom)');
const { dropdownRoom } = SB;
ok(dropdownRoom({ anchorTop: 529, containerTop: 44, barBottom: 44 }) === 473, '385×571: chip top 529 under a 44 px top bar ⇒ 473 px (529 − 4 − 44 − 8)', dropdownRoom({ anchorTop: 529, containerTop: 44, barBottom: 44 }));
ok(dropdownRoom({ anchorTop: 330, containerTop: 30, barBottom: 44 }) === 274, '594×368: the higher of the container top and the top bar is the ceiling ⇒ 274 px');
ok(dropdownRoom({ anchorTop: 529, containerTop: 44, barBottom: 0, scale: 2 }) === 232, 'a 2× UI scale: layout px');
ok(dropdownRoom({ anchorTop: 90, containerTop: 44, barBottom: 44 }) === 120, 'a chip at a tiny window\'s top still opens a 120 px panel that scrolls');
ok(529 - 4 - 621 < 0 && 529 - 4 - dropdownRoom({ anchorTop: 529, containerTop: 44, barBottom: 44 }) >= 44, 'CONTROL: the walk\'s 621 px picker over that chip stood at y −96 unbounded; bounded its top is under the top bar');

console.log('⑤ the wiring');
const css = read('public/style.css'), chat = read('public/chat.css');
const phone = css.slice(css.indexOf('#dialog-new-session .ns-foot { flex-wrap: wrap;'), css.indexOf('/* Recent working-directory chips in the New Session dialog */'));
ok(phone.length > 0 && !/overflow-x: auto/.test(phone.split('\n').filter((l) => /ns-foot-info|ns-refuse|ns-chip /.test(l)).join('\n')) && !/ns-foot-info::-webkit-scrollbar/.test(css), 'the New Session footer has no sideways door left: no overflow-x / hidden scrollbar on .ns-foot-info');
ok(/#dialog-new-session \.ns-refuse \{ white-space: normal;/.test(css) && /@media \(max-width: 480px\) \{\n  #dialog-new-session \.ns-foot-info \{ flex: 1 1 100%; \}\n\}/.test(css), 'the refusal wraps; ≤ 480 px it takes the footer\'s whole first row (above Cancel / Create)');
ok(/@media \(hover: none\) and \(pointer: coarse\) \{\n  \.global-toast-x \{ min-width: 44px; min-height: 44px;/.test(css) && /\.gt-room \{ flex: none; \}/.test(css), 'touch: the toast\'s ✕ is 44 × 44; the dialog\'s room is a fixed-height row');
ok(/max-height: var\(--dd-room, none\); overflow-y: auto; overscroll-behavior: contain;/.test(chat) && /min-width: 130px; overflow-x: hidden;/.test(chat), 'chat.css: the status-bar panel is bounded by --dd-room and scrolls (width still wraps, never clips)');
ok(/dropdown\.style\.setProperty\('--dd-room', dropdownRoom\(\{ anchorTop: rect\.top, containerTop: containerRect\.top, barBottom: navR \? navR\.bottom : 0, scale \}\) \+ 'px'\);/.test(read('src/lib/chat-status-bar.js')) && /const nav = typeof document\.getElementById === 'function' \? document\.getElementById\('mobile-nav'\) : null;/.test(read('src/lib/chat-status-bar.js')), 'showDropdown (THE ONE place a status-bar panel gets its size) sets --dd-room for every panel');
const sm = read('src/lib/sidebar-mounts.js');
ok(!/🔌/.test(sm.split('\n').filter((l) => /showToast\(/.test(l)).join('\n')) && /showToast\(said \+ ' — ' \+ tr\('to open it here, use the plug button on its row under Remote'\), \{ icon: MI\.ports \}\);/.test(sm), 'the port notice: plain words, the Forward button\'s own plug SVG — no emoji');
ok(/if \(icon\) \{ const ic = document\.createElement\('span'\); ic\.className = 'global-toast-icon'; ic\.innerHTML = String\(icon\); el\.append\(ic\); \}/.test(read('src/lib/utils.js')), 'showToast draws an `icon` (an SVG constant of ours) before the words');
const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
const KEYS = ['A program on this machine started listening on port {ports}', 'Programs on this machine started listening on ports {ports}', 'A program on \\"{name}\\" started listening on port {ports}', 'Programs on \\"{name}\\" started listening on ports {ports}', 'to open it here, use the plug button on its row under Remote', 'Closed the window — the conversation keeps running', 'Closed the window — the terminal keeps running', 'Closed {n} windows — what ran in them keeps running', 'Close window — it keeps running'];
const miss = KEYS.flatMap((k) => [zh.includes(`  "${k}": `) ? null : 'zh ' + k, ja.includes(`  "${k}": `) ? null : 'ja ' + k]).filter(Boolean);
ok(miss.length === 0, `every new word in zh + ja (${KEYS.length} keys)`, miss);
ok(!zh.includes('🔌 on its machine row forwards it') && !ja.includes('🔌 on its machine row forwards it'), 'the old emoji sentence left both dictionaries');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
