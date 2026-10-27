#!/usr/bin/env node
// test-dialog-yield — A DIALOG WITH FIELDS NEVER BLOCKS THE CHAT (lane dialog-yield; the owner, 2026-10-26: «尽可能减少 blocking
// popup 的使用；带填空的对话框不阻塞聊天；打开别的窗口要让位»). FAST, in-process: the PURE verdicts of a createModalShell
// `kind: 'form'` (src/lib/form-yield.js — where it stands, the window box that holds its dialog, its first place, whether a
// focus may enter it) as tables, each beside a MUTANT copy that is RED on its row; the wiring of the shell, the host, the
// window manager's per-client rules and the shared CSS pinned in their sources. The census of every call is
// test-architecture §103; the rendering (a real Chrome, the base RED) is test-dialog-yield-chrome.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(repo, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${e !== undefined ? '\n    ' + JSON.stringify(e).slice(0, 600) : ''}`); } };
const J = JSON.stringify;

const FY_SRC = read('src/lib/form-yield.js');
const FY = await import(pathToFileURL(path.join(repo, 'src/lib/form-yield.js')).href);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-dialog-yield-'));
process.on('exit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { } });
let mutN = 0;
const mutant = async (from, to) => {
  if (FY_SRC.split(from).length !== 2) throw new Error('mutant anchor not found exactly once: ' + from);
  const f = path.join(tmp, `form-yield-${++mutN}.mjs`);
  fs.writeFileSync(f, FY_SRC.replace(from, to));
  return import(pathToFileURL(f).href);
};

console.log('① where a form stands — formOpenVerdict');
const OPEN = [
  [{ phone: false, blocked: false, activation: true }, 'front', 'the person\'s own act on the desktop tier: a window in front'],
  [{ phone: false, blocked: false, activation: false }, 'behind', 'no user activation (a broadcast, a wake): a window BEHIND the focused one'],
  [{ phone: true, blocked: false, activation: true }, 'sheet', 'the phone tier: the sheet (nothing beside it to block)'],
  [{ phone: false, blocked: true, activation: true }, 'sheet', 'a blocking layer up (a decision, the New Session sheet, the tour): the sheet above it'],
  [{}, 'front', 'a browser without the activation API counts as the person\'s'],
];
const runOpen = (M) => OPEN.filter(([a, want]) => M.formOpenVerdict(a) !== want).map(([a]) => J(a));
ok(runOpen(FY).length === 0, `every row holds (${OPEN.length}): ${OPEN.map(([, w, why]) => `${w} — ${why}`).join('; ')}`, runOpen(FY));
const noBlock = await mutant("if (phone || blocked) return 'sheet';", "if (phone) return 'sheet';");
ok(J(runOpen(noBlock)) === J([J(OPEN[3][0])]), 'MUTANT (no blocking-layer rule — a window under a backdrop): exactly the blocked row is RED', runOpen(noBlock));
const allFront = await mutant("return activation ? 'front' : 'behind';", "return 'front';");
ok(J(runOpen(allFront)) === J([J(OPEN[1][0])]), 'MUTANT (every open in front — the base\'s steal): exactly the no-activation row is RED', runOpen(allFront));

console.log('② the window box that holds its dialog exactly — formBox');
const BOX = [
  [{ dialog: { w: 460, h: 318.4 }, chrome: { w: 2, h: 34 } }, { w: 462, h: 353 }],
  [{ dialog: { w: 440, h: 200 }, chrome: null }, { w: 440, h: 200 }],
  [{ dialog: { w: 0, h: 200 }, chrome: { w: 2, h: 34 } }, null],
  [{}, null],
];
const runBox = (M) => BOX.filter(([a, want]) => J(M.formBox(a)) !== J(want)).map(([a]) => J(a));
ok(runBox(FY).length === 0, 'the dialog\'s box + the window chrome, whole pixels up; a dialog not laid out ⇒ null', runBox(FY));
const noChrome = await mutant('return { w: Math.ceil(dialog.w + cw), h: Math.ceil(dialog.h + ch) };', 'return { w: Math.ceil(dialog.w), h: Math.ceil(dialog.h) };');
ok(runBox(noChrome).length === 1, 'MUTANT (the title bar forgotten — the dialog\'s foot cut): the chrome row is RED', runBox(noChrome));

console.log('③ its first place — formPlace');
const ws = { w: 1020, h: 716 };
const p0 = FY.formPlace({ ws, box: { w: 462, h: 353 }, nth: 0 }), p1 = FY.formPlace({ ws, box: { w: 462, h: 353 }, nth: 1 }), big = FY.formPlace({ ws, box: { w: 1400, h: 900 }, nth: 3 }), edge = FY.formPlace({ ws, box: { w: 900, h: 600 }, nth: 5 });
ok(p0.left === 279 && p0.top === 145, 'centred across, a little above the middle (40 % of the room above)', p0);
ok(p1.left === p0.left + 28 && p1.top === p0.top + 28, 'a second form on show: one step lower and to the right (no title bar buried)', p1);
ok(big.left === 0 && big.top === 0 && edge.left + 900 <= ws.w && edge.top + 600 <= ws.h, 'never outside the workspace (a box larger than it stands at 0,0; a late step is clamped)', { big, edge });
ok(FY.formPlace({ ws: null, box: { w: 1, h: 1 } }) === null, 'no workspace laid out ⇒ no place (the window manager\'s own)');

console.log('③b it stays inside — formInside');
const IN = [
  [{ at: { left: 279, top: 145 }, box: { w: 462, h: 353 }, ws }, null, 'inside already: nothing moves'],
  [{ at: { left: 279, top: 300 }, box: { w: 462, h: 641 }, ws }, { left: 279, top: 75 }, 'its dialog grew past the foot: up by the least it takes'],
  [{ at: { left: 700, top: 10 }, box: { w: 462, h: 300 }, ws }, { left: 558, top: 10 }, 'past the right edge: left by the least it takes'],
  [{ at: { left: 20, top: 40 }, box: { w: 1400, h: 900 }, ws }, { left: 0, top: 0 }, 'larger than the workspace: at its top / left edge'],
  [{ at: { left: 1, top: 1 }, box: null, ws }, null, 'nothing laid out: nothing moves'],
];
const runIn = (M) => IN.filter(([a, want]) => J(M.formInside(a)) !== J(want)).map(([a]) => J(a.at));
ok(runIn(FY).length === 0, `every row holds (${IN.length}): ${IN.map(([, , why]) => why).join('; ')}`, runIn(FY));
const noFoot = await mutant('top = Math.max(0, Math.min(at.top, ws.h - box.h));', 'top = at.top;');
ok(runIn(noFoot).length === 2, 'MUTANT (only the title bar kept inside — the window manager\'s rule): the grown-past-the-foot and the larger rows are RED', runIn(noFoot));

console.log('④ may a focus enter it — formFocusVerdict');
const FOCUS = [[{ active: true }, 'allow'], [{ active: false, byKeyboard: true }, 'raise'], [{ active: false, byKeyboard: false }, 'refuse'], [{}, 'refuse']];
const runFocus = (M) => FOCUS.filter(([a, want]) => M.formFocusVerdict(a) !== want).map(([a]) => J(a));
ok(runFocus(FY).length === 0, 'the active form takes a focus; a Tab the person pressed raises it; a script\'s focus into a form behind is refused', runFocus(FY));
const anyFocus = await mutant("return byKeyboard ? 'raise' : 'refuse';", "return 'allow';");
ok(runFocus(anyFocus).length === 3, 'MUTANT (any focus allowed — a re-render takes the caret from the chat): the three rows behind are RED', runFocus(anyFocus));

console.log('⑤ the wiring');
const U = read('src/lib/utils.js'), FW = read('src/lib/form-window.js'), W = read('src/lib/window.js'), L = read('src/lib/layout.js'), SM = read('src/lib/stage-manager.js'), TG = read('src/lib/tab-group.js'), SL = read('src/lib/session-lifecycle.js'), PU = read('src/lib/plugins-ui.js'), CSS = read('public/style.css');
const shell = U.slice(U.indexOf('export function createModalShell('), U.indexOf('\n}\n', U.indexOf('export function createModalShell(')));
ok(/if \(yieldWin\) overlay\.className = 'dialog-form';\s*else \{ overlay\.className = 'dialog-overlay'; overlay\.style\.zIndex = '99998'; \}/.test(shell) && /\(yieldWin \? yieldWin\.content : document\.body\)\.appendChild\(overlay\)/.test(shell), 'utils: a form\'s root is .dialog-form inside its window — a decision keeps the overlay at z 99998 on <body>');
ok(/if \(closeOnBackdrop && !yieldWin\)/.test(shell) && /if \(yieldWin\) \{[\s\S]*document\.querySelector\('\[data-popover\]'\)[\s\S]*select:open[\s\S]*dismiss\('escape'\)[\s\S]*\} else if \(escapeToClose\) \{[\s\S]*onIdleEscape/.test(shell), 'utils: a form has no backdrop and closes on an Escape from INSIDE it (a popover / an open picker first); the idle-Escape rule is a decision\'s alone');
ok(/overlay\.remove = \(\) => \{ if \(ended\(\)\) yieldWin\.close\(\); \};/.test(shell) && /const ended = \(\) => \{ if \(gone\) return false;/.test(shell) && /closed: \(\) => \{ if \(ended\(\)\) onClose\?\.\(\); \}/.test(shell), 'utils: a form ends ONCE — its close and its window closed by any door run onClose once; a caller\'s overlay.remove() closes it WITHOUT onClose (a decision\'s bare remove)');
ok(/const quiet = where === 'behind';[^\n]*\n\s*const win = wm\.createWindow\(\{ title: String\(title \|\| ''\), type: 'form', width: 480, height: 320, \.\.\.\(quiet \? \{ quiet: true \} : \{\}\) \}\);/.test(FW) && /if \(where === 'behind'\) \{ wm\.placeBehind\(win\.id\); wm\.markArrived\(win\.id\); \}/.test(FW), 'form-window: opened by no act of the person ⇒ quiet, placed BEHIND the active window, its tile pulses');
ok(/win\.onCloseRequest = \(\) => \{ if \(bound\) \{ bound\.dismiss\('close'\); return false; \} return true; \};/.test(FW) && /wm\.setFixedSize\(win\.id, box\)/.test(FW) && /formFocusVerdict\(\{ active: sheet \|\| wm\.activeWindowId === win\.id/.test(FW), 'form-window: the window\'s ✕ is the person\'s dismissal (the unsaved guard asks), its size is its dialog\'s, a focus is judged');
ok(/if \(type !== 'form'\) this\.windowCounter\+\+;/.test(W) && /if \(win\.type === 'form'\) return null;/.test(L) && /if \(win\.type === 'form'\) return; \/\/ lane dialog-yield/.test(SM) && /if \(targetWin\?\.type === 'form' \|\| win\?\.type === 'form'\)/.test(TG) && /if \(anchorWin\.type === 'form' \|\| guestWin\.type === 'form'\) return null;/.test(TG), 'per client: captureWin never records a form, the Stage never binds one, a form never joins a tab group or a split, nor moves the cascade of the next window');
ok(/!document\.activeElement\?\.closest\?\.\('\.dialog-form'\)\) view\.focus\(\);/.test(SL), 'session-lifecycle: a late chat focus never takes the keys from a form the person types in');
ok(/<button class="mounts-btn plugin-install-cancel">[^<]*<\/button><button class="mounts-btn mounts-btn-primary plugin-install-go">/.test(PU) && /plugin-install-cred-row dialog-field-row hidden"><span>\$\{escHtml\(t\('Credential'\)\)\}<\/span><div class="dialog-field-line">/.test(PU), 'Install plugin…: Cancel left of the primary Install; the Credential row is a field row (its name above, select + 建立… on one line)');
ok(/\.dialog-actions > \.mounts-btn, \.dialog-actions > \.btn-create, \.dialog-actions > \.btn-cancel \{ padding: 5px 14px; font-size: 12px; line-height: normal; border-radius: var\(--radius-sm\); \}/.test(CSS) && /\.mounts-btn-primary:hover:not\(:disabled\) \{ background: var\(--accent-hover\);/.test(CSS) && !/\.mounts-btn-primary:hover[^{]*\{[^}]*opacity/.test(CSS), 'style.css: ONE action row (every button at the footer\'s size, --radius-sm); the primary\'s hover is --accent-hover, never an opacity');
ok(/\.window\.window-form > \.window-content \{ overflow: clip; \}/.test(CSS) && /\.dialog-form > \.dialog > \.dialog-header \{ display: none; \}/.test(CSS) && /\.dialog-form \{ position: absolute; left: 0; top: 0; outline: none; \}/.test(CSS) && /\.plugin-install-row\.hidden, \.plugin-install-cred-hint\.hidden, \.plugin-install-error\.hidden \{ display: none; \}/.test(CSS), 'style.css: a form\'s head is its window\'s title bar, its dialog stands absolute (the window takes its size); the git-only rows hide');
ok(/app\.formsToSheets = \(\) => \{ for \(const h of \[\.\.\.OPEN\]\) h\.toSheet\(\); \};/.test(FW) && /function enterPhone\(app\) \{\n  app\.formsToSheets\?\.\(\);/.test(read('src/lib/viewport-switch.js')), 'viewport-switch: entering the phone tier re-hosts every open form as its sheet FIRST (before a phone rule sees a window — a focused one folds the sidebar for good)');
ok(/grow = new MutationObserver\(soon\); if \(dlg\) grow\.observe\(dlg, \{ childList: true, subtree: true, characterData: true/.test(FW) && /queueMicrotask\(\(\) => \{ queued = false; fit\(\); \}\)/.test(FW), 'form-window: a content change re-fits the form too (a MutationObserver, per microtask) — a background tab runs no ResizeObserver');
ok(/const k = formInside\(\{ at: \{ left: parseFloat\(win\.element\.style\.left\) \|\| 0, top: parseFloat\(win\.element\.style\.top\) \|\| 0 \}, box, ws \}\);/.test(FW) && /window\.addEventListener\('resize', \(\) => \{ const phone = phoneNow\(\); for \(const h of \[\.\.\.OPEN\]\)/.test(FW), 'form-window: every fit keeps the WHOLE form inside (formInside) — its growth and a viewport resize re-fit every open form');
ok((FW.match(/\bfocusWindow\(/g) || []).length === 1 && /if \(back && !back\.isMinimized && !back\._hiddenByDesktop\) wm\.focusWindow\(opener\);/.test(FW) && /wm\.revealWindow\(win\.id\)/.test(FW), 'form-window: a Tab the person pressed raises it through revealWindow (§62\'s door); its ONE focusWindow gives the active window back to its opener when it closes');
ok(/phoneMq = window\.matchMedia\(VC_PHONE_MEDIA\); phoneMq\.addEventListener\('change', \(e\) => \{ if \(e\.matches\) for \(const h of \[\.\.\.OPEN\]\) h\.toSheet\(\); \}\)/.test(FW) && /for \(const h of \[\.\.\.OPEN\]\) \{ if \(phone\) h\.toSheet\(\); else h\.refit\(\); \}/.test(FW) && /root\.className = 'dialog-overlay'; root\.style\.zIndex = '99998';\s*document\.body\.appendChild\(root\);\s*win\.onCloseRequest = null; win\.onClose = null;\s*wm\.closeWindow\(win\.id\);/.test(FW) && /active: sheet \|\| wm\.activeWindowId === win\.id/.test(FW), 'form-window: a crossing into the phone tier turns each open form into its SHEET (its own root — id, listeners, values kept), the window closed quietly; a sheet takes the focus');

console.log(`\n${fail ? '✗' : '✓'} test-dialog-yield: ${pass} passed, ${fail} failed${fail ? '' : ' — ALL PASS'}`);
process.exit(fail ? 1 : 0);
