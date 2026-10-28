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

console.log('① where a form stands — formOpenVerdict (round 2: «opened by the person» is the CALLER\'s fact; a sheet only while what made it holds)');
const OPEN = [
  [{ phone: false, blocked: false, opener: 'person' }, 'front', 'the person opened it on the desktop tier: a window in front'],
  [{ phone: false, blocked: false, opener: 'system' }, 'behind', 'the system opened it (a broadcast, a poll, a wake): a window BEHIND the focused one'],
  [{ phone: false, blocked: false, opener: 'person', typedLast: true }, 'behind', 'the person was TYPING in a field (their last act, within a second): behind, whatever the caller says'],
  [{ phone: true, blocked: false, opener: 'person' }, 'sheet', 'the phone tier: the sheet (nothing beside it to block)'],
  [{ phone: false, blocked: true, fromLayer: true, opener: 'person' }, 'sheet', 'opened FROM a blocking layer (the New Session sheet\'s picker, the tour\'s sign-in): its sheet above it'],
  [{ phone: false, blocked: true, fromLayer: false, opener: 'person' }, 'behind', 'a blocking layer up, not opened from it: a window UNDER the layer (the decision keeps its keys and buttons)'],
  [{}, 'front', 'undeclared: the person\'s (a call in a trusted handler)'],
  [{ phone: false, blocked: true, fromLayer: true, opener: 'system' }, 'behind', 'r3: the SYSTEM\'s form after a press inside the layer (1403 ms on c3ed5f0a: a sheet over the field) — behind, never a sheet'],
  [{ phone: false, blocked: true, fromLayer: true, opener: 'person', typedLast: true }, 'behind', 'r3: the person TYPING in the layer\'s field — behind under a layer too'],
];
const runOpen = (M) => OPEN.filter(([a, want]) => M.formOpenVerdict(a) !== want).map(([a]) => J(a));
ok(runOpen(FY).length === 0, `every row holds (${OPEN.length}): ${OPEN.map(([, w, why]) => `${w} — ${why}`).join('; ')}`, runOpen(FY));
const sheetOverAll = await mutant("if (blocked) return fromLayer && opener !== 'system' && !typedLast ? 'sheet' : 'behind';", "if (blocked) return 'sheet';");
ok(J(runOpen(sheetOverAll)) === J([J(OPEN[5][0]), J(OPEN[7][0]), J(OPEN[8][0])]), 'MUTANT (every form over a blocking layer a sheet — da9545e8: it covered the confirm\'s Delete and stayed a blocking sheet): the not-from-the-layer, the system and the typing rows are RED', runOpen(sheetOverAll));
const layerBlind = await mutant("if (blocked) return fromLayer && opener !== 'system' && !typedLast ? 'sheet' : 'behind';", "if (blocked) return fromLayer ? 'sheet' : 'behind';");
ok(J(runOpen(layerBlind)) === J([J(OPEN[7][0]), J(OPEN[8][0])]), 'MUTANT (c3ed5f0a: under a layer the opener and the typing ignored — a system form 1403 ms after a press covered the field being typed in): the system and the typing rows are RED', runOpen(layerBlind));
const allFront = await mutant("if (typedLast || opener === 'system') return 'behind';", "if (false) return 'behind';");
ok(J(runOpen(allFront)) === J([J(OPEN[1][0]), J(OPEN[2][0])]), 'MUTANT (every open in front — the base\'s steal, \'hello wor\' / \'ld\'): the system and the typing rows are RED', runOpen(allFront));
console.log('①b was the person typing — typedLastVerdict');
const TYPED = [
  [{ typedAt: 1000, pressAt: 500, now: 1300 }, true, 'typed 300 ms ago, no press since'],
  [{ typedAt: 1000, pressAt: 1200, now: 1300 }, false, 'a press (or a command key) after the typing: the person\'s act opened it'],
  [{ typedAt: 1000, pressAt: null, now: 2500 }, false, 'typed 1.5 s ago: no longer typing'],
  [{ typedAt: null, pressAt: 900, now: 1000 }, false, 'never typed'],
];
const runTyped = (M) => TYPED.filter(([a, want]) => M.typedLastVerdict(a) !== want).map(([a]) => J(a));
ok(runTyped(FY).length === 0, `every row holds (${TYPED.length}): ${TYPED.map(([, , why]) => why).join('; ')}`, runTyped(FY));
const pressBlind = await mutant('return pressAt == null || Number(typedAt) >= Number(pressAt);', 'return true;');
ok(J(runTyped(pressBlind)) === J([J(TYPED[1][0])]), 'MUTANT (a press after the typing ignored — the person\'s own click would open behind): exactly the press row is RED', runTyped(pressBlind));
console.log('①c a sheet\'s home — sheetHomeVerdict; the same form again — reopenVerdict');
ok(FY.sheetHomeVerdict({ phone: false, blocked: false }) === 'window' && FY.sheetHomeVerdict({ phone: true }) === 'sheet' && FY.sheetHomeVerdict({ blocked: true }) === 'sheet', 'a sheet re-hosts as its window the moment neither the phone nor a blocking layer holds it (390 → 1280, the confirm closed)');
const stuck = await mutant("export function sheetHomeVerdict({ phone = false, blocked = false } = {}) { return phone || blocked ? 'sheet' : 'window'; }", "export function sheetHomeVerdict() { return 'sheet'; }");
ok(stuck.sheetHomeVerdict({ phone: false, blocked: false }) === 'sheet', 'MUTANT (a sheet that never goes home — da9545e8\'s stuck blocking sheet): the desktop row is RED');
const REOPEN = [
  [{ openKey: null, nextKey: null }, 'raise', 'a single-subject form opened again (Install plugin): RAISED, never replaced'],
  [{ openKey: 'c1', nextKey: 'c1' }, 'raise', 'the same subject again (the Callers of one path): raised'],
  [{ openKey: 'once:1', nextKey: 'once:2' }, 'door', 'r3: another subject under the id (Rotate… twice — a new token; the switcher pA then pB): the open one\'s door first'],
  [{ openKey: 'h1', nextKey: 'h2', undismissable: true }, 'beside', 'r3: the open one declared itself undismissable (a running Set up): the new one opens BESIDE it'],
  [{ openKey: 'h1', nextKey: 'h1', undismissable: true }, 'raise', 'the same undismissable subject again: raised'],
  [{ openKey: 7, nextKey: '7' }, 'raise', 'a key is compared as words (7 ≡ \'7\')'],
];
const runReopen = (M) => REOPEN.filter(([a, want]) => M.reopenVerdict(a) !== want).map(([a]) => J(a));
ok(runReopen(FY).length === 0, `every row holds (${REOPEN.length}): ${REOPEN.map(([, w, why]) => `${w} — ${why}`).join('; ')}`, runReopen(FY));
const replace = await mutant("  if (k(openKey) === k(nextKey)) return 'raise';", "  return 'replace';");
ok(runReopen(replace).includes(J(REOPEN[0][0])), 'MUTANT (the dedup replaces — da9545e8: \'AAA\' became \'\', a ws handler leaked): the same-form row is RED', runReopen(replace));
const titleRule = await mutant("  if (k(openKey) === k(nextKey)) return 'raise';", "  return 'raise';");
ok(J(runReopen(titleRule)) === J([J(REOPEN[2][0]), J(REOPEN[3][0])]), 'MUTANT (c3ed5f0a\'s «same title ⇒ same form» — every re-open under the id raised: tok_TWO into a detached shell): the other-subject rows are RED', runReopen(titleRule));
const doorAll = await mutant("  return undismissable ? 'beside' : 'door';", "  return 'door';");
ok(J(runReopen(doorAll)) === J([J(REOPEN[3][0])]), 'MUTANT (a neighbour\'s open closes an undismissable form — c3ed5f0a closed the running Set up, handlers 28 → 27): exactly the beside row is RED', runReopen(doorAll));
ok(FY.undismissableVerdict({ undismissable: true }) && FY.undismissableVerdict({ escapeToClose: false, closeOnBackdrop: false }) && !FY.undismissableVerdict({ escapeToClose: true, closeOnBackdrop: false }) && !FY.undismissableVerdict({ escapeToClose: false, closeOnBackdrop: false, onEscape: true }) && !FY.undismissableVerdict({}), 'undismissable = said so, or every door the person has turned off (no Escape and no ask-first hook, no backdrop)');
console.log('①d ONE Escape — escapeVerdict; was anything typed — typedVerdict');
const ESCV = [
  [{ escapeToClose: false }, 'none', 'the site left Escape off (the self-update progress, a machine\'s set-up): it stays'],
  [{ escapeToClose: true }, 'close', 'Escape from inside a clean form: it closes'],
  [{ escapeToClose: true, guarded: true }, 'guard', 'a guarded form: its guard decides (Escape = the ✕: it asks when dirty)'],
  [{ escapeToClose: true, typed: true }, 'ask', 'an unguarded form with something typed: the shell asks (Report a problem\'s note is never lost)'],
  [{ escapeToClose: true, hook: true, callerSays: false, guarded: true }, 'kept', 'the caller\'s ask-first hook answered false (the OAT sign-in running): nothing closes'],
  [{ escapeToClose: true, hook: true, callerSays: true, guarded: true }, 'guard', 'the hook let it go: the guard decides'],
];
const runEsc = (M) => ESCV.filter(([a, want]) => M.escapeVerdict(a) !== want).map(([a]) => J(a));
ok(runEsc(FY).length === 0, `every row holds (${ESCV.length}): ${ESCV.map(([, w, why]) => `${w} — ${why}`).join('; ')}`, runEsc(FY));
const escAll = await mutant("  if (!escapeToClose && !hook) return 'none';\n  if (hook && callerSays === false) return 'kept';\n  if (!escapeToClose) return 'none';\n", "  if (hook && callerSays === false) return 'kept';\n");
ok(J(runEsc(escAll)) === J([J(ESCV[0][0])]), 'MUTANT (Escape closes every form, opted out or not — da9545e8: the self-update progress closed mid-bootstrap): exactly the opted-out row is RED', runEsc(escAll));
const hookAfter = await mutant("  if (hook && callerSays === false) return 'kept';\n", '');
ok(J(runEsc(hookAfter)) === J([J(ESCV[4][0])]), 'MUTANT (the caller\'s hook not consulted first — da9545e8: «Cancel the sign-in?» over a dialog already gone): exactly the hook row is RED', runEsc(hookAfter));
const typedNo = await mutant('  return typed ? \'ask\' : \'close\';', "  return 'close';");
ok(J(runEsc(typedNo)) === J([J(ESCV[3][0])]), 'MUTANT (a typed unguarded form closes — da9545e8 lost the note): exactly the typed row is RED', runEsc(typedNo));
ok(FY.typedVerdict([{ was: '', now: 'the export froze' }]) === true && FY.typedVerdict([{ was: 'x', now: 'x' }, { was: false, now: false }]) === false && FY.typedVerdict([]) === false && FY.typedVerdict([{ was: undefined, now: 'y' }]) === false, 'typed = a field whose value differs from what it held when first entered (a field never entered was never typed into)');

console.log('② the window box that holds its dialog exactly — formBox (never taller than the workspace) · formMaxDialog');
const BOX = [
  [{ dialog: { w: 460, h: 318.4 }, chrome: { w: 2, h: 34 } }, { w: 462, h: 353 }],
  [{ dialog: { w: 440, h: 200 }, chrome: null }, { w: 440, h: 200 }],
  [{ dialog: { w: 460, h: 425 }, chrome: { w: 2, h: 34 }, ws: { w: 900, h: 436 } }, { w: 462, h: 436 }],
  [{ dialog: { w: 0, h: 200 }, chrome: { w: 2, h: 34 } }, null],
  [{}, null],
];
const runBox = (M) => BOX.filter(([a, want]) => J(M.formBox(a)) !== J(want)).map(([a]) => J(a));
ok(runBox(FY).length === 0, 'the dialog\'s box + the window chrome, whole pixels up, never taller than the workspace (900 × 480: 436); a dialog not laid out ⇒ null', runBox(FY));
const noChrome = await mutant('return { w: Math.ceil(dialog.w + cw), h: ws && ws.h > 0 ? Math.min(h, Math.floor(ws.h)) : h };', 'return { w: Math.ceil(dialog.w), h: Math.ceil(dialog.h) };');
ok(runBox(noChrome).length === 2, 'MUTANT (the title bar forgotten and no workspace cap — the dialog\'s foot cut / 459 > 436): the chrome and the cap rows are RED', runBox(noChrome));
ok(FY.formMaxDialog({ ws: { w: 900, h: 436 }, chrome: { w: 2, h: 34 } }) === 402 && FY.formMaxDialog({ ws: null }) === null, 'the dialog\'s cap inside its window = the workspace\'s height less the title bar (its body scrolls, its foot stays reachable)');

console.log('②b THE ONE «did the person open a dialog?» predicate (keyboard-yield, lateFocus, toasts, the phone\'s back… ask it)');
const el = (cls, extra = {}) => ({ nodeType: 1, className: cls, ...extra });
ok(FY.isPersonDialog(el('dialog-overlay')) && FY.isPersonDialog(el('dialog-form')) && FY.isPersonDialog(el('dialog-overlay form-sheet')) && !FY.isPersonDialog(el('window')) && !FY.isPersonDialog(null), 'a decision\'s overlay, a form\'s root and a form\'s sheet are dialogs the app opened; a window is not');
ok(FY.isFormRoot(el('dialog-form')) && !FY.isFormRoot(el('dialog-overlay form-sheet')), 'a FORM root is the window shape (a sheet is an overlay — a backdrop like a decision)');
const winActive = el('window window-form window-active'), formIn = el('dialog-form', { contains: (x) => x === 'field', closest: () => winActive });
const winBehind = el('window window-form'), formBehind = el('dialog-form', { contains: () => false, closest: () => winBehind });
ok(FY.formHoldsNow(formIn, null) && FY.formHoldsNow(formBehind, 'field') === false && FY.formHoldsNow(el('dialog-form', { contains: (x) => x === 'f', closest: () => winBehind }), 'f') && !FY.formHoldsNow(formBehind, null), 'a form holds the keys while the person works in it (its window active, or the focus inside); a form left behind does not');
const overlayOnly = await mutant("return c.includes('dialog-overlay') || c.includes('dialog-form'); }", "return c.includes('dialog-overlay'); }");
ok(!overlayOnly.isPersonDialog(el('dialog-form')), 'MUTANT (the overlay alone — da9545e8\'s keyboard-yield: a form never held the keys of a takeover): the form root is RED');
ok(FY.DIALOG_ROOTS === '.dialog-overlay, .dialog-form' && /:not\(\.form-sheet\)/.test(FY.BLOCKING_LAYERS), 'the selectors: DIALOG_ROOTS covers both roots; BLOCKING_LAYERS never counts a form\'s own sheet');

console.log('②c what a form FLOATS is the form\'s — ownFloat / ownerFormOf (r3: a press on the path field\'s list dropped the hold)');
{
  const attrs = (o) => { const a = new Map(); o.setAttribute = (k, v) => a.set(k, String(v)); o.getAttribute = (k) => (a.has(k) ? a.get(k) : null); o.removeAttribute = (k) => a.delete(k); return o; };
  const root = attrs(el('dialog-form', { id: 'mount-add-dialog', isConnected: true }));
  const docu = { getElementById: (id) => (id === 'mount-add-dialog' ? root : null) };
  const field = attrs(el('', { closest: (sel) => (sel === '[data-owner-form]' ? null : root), ownerDocument: docu }));
  const list = attrs(el('pf-list pf-float', { ownerDocument: docu }));
  list.closest = (sel) => (sel === '[data-owner-form]' && list.getAttribute('data-owner-form') ? list : null);
  const row = el('pf-item', { closest: (sel) => (sel === '[data-owner-form]' ? list : null), ownerDocument: docu });
  const stamped = FY.ownFloat(list, field);
  ok(stamped === root && list.getAttribute('data-owner-form') === 'mount-add-dialog' && FY.ownerFormOf(row) === root, 'a list floated from a field inside a form is stamped with the form\'s id (by the helper that floated it); a row inside it is the form\'s', { owner: list.getAttribute('data-owner-form') });
  const loose = attrs(el('pop', { ownerDocument: docu })); loose.closest = () => null;
  const outside = attrs(el('', { closest: () => null, ownerDocument: docu }));
  ok(FY.ownFloat(loose, outside) === null && loose.getAttribute('data-owner-form') === null && FY.ownerFormOf(loose) === null && FY.ownerFormOf(null) === null, 'a float opened from outside every dialog has no owner (a press on it is outside)');
  const blind = await mutant("    const f = el && typeof el.closest === 'function' ? el.closest('[data-owner-form]') : null;\n    if (!f) return null;", '    return null;');
  ok(blind.ownerFormOf(row) === null, 'MUTANT (no owner read — c3ed5f0a: the suggestion press dropped the hold, \'me/proj⏎\' went to the page): the owned row is RED');
}

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
const U = read('src/lib/utils.js'), FW = read('src/lib/form-window.js'), W = read('src/lib/window.js'), L = read('src/lib/layout.js'), SM = read('src/lib/stage-manager.js'), TG = read('src/lib/tab-group.js'), SL = read('src/lib/session-lifecycle.js'), PU = read('src/lib/plugins-ui.js'), CSS = read('public/style.css'), KY = read('src/lib/keyboard-yield.js'), BLW = read('src/lib/browser-live-window.js'), VS = read('src/lib/viewport-switch.js'), A = read('src/lib/app.js'), MA = read('src/lib/manage-agents.js');
const shell = U.slice(U.indexOf('export function createModalShell('), U.indexOf('\n}\n', U.indexOf('function buildShell(')));
ok(/if \(fh\) fh\.adopt\(overlay\);[^\n]*\n\s*else if \(hosted\) \{ gone = true; return; \}\n\s*else \{ overlay\.className = 'dialog-overlay'; overlay\.style\.zIndex = '99998'; document\.body\.appendChild\(overlay\); \}/.test(shell), 'utils: a form stands where its host puts it (its window, or its sheet) — a decision keeps the overlay at z 99998 on <body>');
ok(/if \(closeOnBackdrop\) overlay\.addEventListener\('mousedown', \(e\) => \{ if \(e\.target === overlay && \(!fh \|\| fh\.mode\(\) === 'sheet'\)\) dismiss\(\); \}\);/.test(shell) && /if \(hosted\) \{[\s\S]*document\.querySelector\('\[data-popover\]'\)[\s\S]*select:open[\s\S]*if \(escDoor\(e\) === 'none'\) return;[\s\S]*\} else if \(escapeToClose\) \{[\s\S]*onIdleEscape/.test(shell), 'utils: a form window has no backdrop; its Escape is the ONE door (escDoor) from INSIDE it (a popover / an open picker first); the idle-Escape rule is a decision\'s alone');
ok(/const escDoor = \(e\) => \{[\s\S]*says = onEscape\(e\) !== false[\s\S]*escapeVerdict\(\{ escapeToClose: !!escapeToClose, hook, callerSays: says, guarded: !!guard, typed: !!typed && typed\.dirty\(\) \}\)/.test(shell), 'utils: ONE Escape door — the caller\'s onEscape FIRST, then escapeToClose / the guard / the typed ask (PURE escapeVerdict)');
ok(/if \(sh && kind === 'form' && sh\.kind === 'form' && sh\.live\(\)\) \{\s*const v = reopenVerdict\(\{ openKey: sh\.key, nextKey: key, undismissable: sh\.undismissable \}\);\s*if \(v === 'raise'\) return sh\.raise\(/.test(shell) && /if \(v === 'beside'\) id = besideId\(id\);/.test(shell) && /if \(sh\.live\(\)\) \{ const q = buildShell\(\{ \.\.\.opts, id, from \}, true\); sh\.queue\(q\); return q\.api; \}/.test(shell) && !/idleShell/.test(U), 'utils: a form\'s identity is id + KEY — the same key RAISED (the live shell, `raised: true`), another key through the open one\'s door (asked ⇒ the new one QUEUED, built now, shown when it closes), an undismissable one never doored (beside); no detached shell (r3)');
ok(/raise: \(\{ opener: by = 'person', onClose: also = null \} = \{\}\) => \{\s*if \(also\) closers\.push\(also\);\s*if \(fh\) fh\.raise\(\{ opener: by \}\);[^\n]*\n\s*announceModal\(overlay\);/.test(shell) && /const dropQueued = \(\) => \{ const q = queued; queued = null; if \(q\) q\.drop\(\); \};/.test(shell) && /onKept: dropQueued/.test(shell) && /const q = queued; queued = null; if \(q\) q\.go\(\);/.test(shell), 'utils: a raise ANNOUNCES like an open (the live view hands the raised form the keys) and chains the re-open\'s onClose; a queued form opens when the door closed the old one, never when the person kept it (Keep editing ⇒ dropped, said)');
ok(/const from = opts\.from \|\| \(kind === 'form' \? pressToken\(\) : null\);/.test(shell) && /export function pressToken\(\)/.test(U) && /if \(kind === 'form' && !id\) id = `form-\$\{\+\+formIdSeq\}`;/.test(shell), 'utils: the press that asked is a TOKEN carried to the host (`from`, else the press of this task); a form never shares an id (none ⇒ a fresh one)');
ok(/overlay\.remove = \(\) => \{ if \(ended\(\)\) \{ if \(fh\) fh\.close\(\); if \(!mounted\) settle\(null\); \} \};/.test(shell) && /const ended = \(\) => \{ if \(gone\) return false;/.test(shell) && /closed: \(\) => \{ if \(ended\(\)\) runClose\(\); \}/.test(shell), 'utils: a form ends ONCE — its close and its window closed by any door run onClose once; a caller\'s overlay.remove() closes it WITHOUT onClose (a decision\'s bare remove)');
ok(/overlay\.setAttribute\('role', 'dialog'\);/.test(shell) && /overlay\.setAttribute\('aria-labelledby', h3\.id\);/.test(shell) && !/setAttribute\('aria-modal'/.test(shell), 'utils: a form root is role="dialog" named by its title, NOT aria-modal (a window that yields — no focus trap)');
ok(/const quiet = place === 'behind';[^\n]*\n\s*landed = quiet \? 'behind' : 'front';\n\s*win = wm\.createWindow\(\{ title: String\(title \|\| ''\), type: 'form', width: 480, height: 320, \.\.\.\(quiet \? \{ quiet: true \} : \{\}\) \}\);/.test(FW) && /if \(quiet\) \{ wm\.placeBehind\(win\.id\); wm\.markArrived\(win\.id\); \}/.test(FW), 'form-window: opened by the system (or over a typing person, or under a layer) ⇒ quiet, placed BEHIND the active window, its tile pulses');
ok(/win\.onCloseRequest = \(\) => \{ if \(bound\) \{ bound\.dismiss\('close'\); return false; \} return true; \};/.test(FW) && /wm\.setFixedSize\(win\.id, box\)/.test(FW) && /formFocusVerdict\(\{ active: mode === 'sheet' \|\| \(!!win && wm\.activeWindowId === win\.id\)/.test(FW), 'form-window: the window\'s ✕ is the person\'s dismissal (the unsaved guard asks), its size is its dialog\'s, a focus is judged');
ok(/if \(type !== 'form'\) this\.windowCounter\+\+;/.test(W) && /if \(win\.type === 'form'\) return null;/.test(L) && /if \(win\.type === 'form'\) return; \/\/ lane dialog-yield/.test(SM) && /if \(targetWin\?\.type === 'form' \|\| win\?\.type === 'form'\)/.test(TG) && /if \(anchorWin\.type === 'form' \|\| guestWin\.type === 'form'\) return null;/.test(TG), 'per client: captureWin never records a form, the Stage never binds one, a form never joins a tab group or a split, nor moves the cascade of the next window');
ok(/const lateFocus = \(view\) => \{ if \(lateFocusVerdict\(document\.querySelectorAll\(DIALOG_ROOTS\), document\.activeElement\) === 'take'\) view\.focus\(\); \};/.test(SL), 'session-lifecycle: a late chat focus asks THE predicate — an open decision, or a form the person works in, keeps the keys');
ok(/export function isModalOverlay\(el\) \{ return isPersonDialog\(el\); \}/.test(KY) && /if \(isFormRoot\(ov\) && !formHoldsNow\(ov, active\)\) return null;/.test(KY) && /return 'dialog';/.test(KY), 'keyboard-yield: a FORM the person opened holds a takeover\'s keys like the overlay did (THE predicate); one opened behind holds nothing; a press into an open form takes them for it again');
ok(/w\.contains\(e\.target\) \|\| ownerFormOf\(e\.target\) === ov\)/.test(KY) && /\|\| ownerFormOf\(el\);\n\s*return r && isFormRoot\(r\) \? r : null;/.test(KY) && /ownFloat\(pop, anchor\);/.test(U) && /ownFloat\(pop, document\.elementFromPoint\(x, y\)\)/.test(U) && /document\.body\.appendChild\(list\); ownFloat\(list, wrap\);/.test(read('src/lib/path-field.js')), 'r3: «inside the form» = its window OR what it floats — keyboard-yield asks ownerFormOf; createPopover, showContextMenu and the path field\'s list stamp their owner');
ok(/if \(s\.holds\.some\(formOf\) && !s\.holds\.some\(\(h\) => inHeld\(h\.overlay\)\)\) \{/.test(KY) && /if \(r === 'dialog' \|\| ky\.dialogOverlays\(\)\.length !== held\) \{/.test(BLW) && /dialogMo\.observe\(w, \{ attributes: true, attributeFilter: \['class', 'style', 'aria-hidden'\] \}\)/.test(BLW), 'keyboard-yield + the live view: a press OUTSIDE a held form\'s window gives its keys back (a press on the view re-claims); its window\'s removal / minimize ends the hold');
ok(/<button class="mounts-btn plugin-install-cancel">[^<]*<\/button><button class="mounts-btn mounts-btn-primary plugin-install-go">/.test(PU) && /plugin-install-cred-row dialog-field-row hidden"><span>\$\{escHtml\(t\('Credential'\)\)\}<\/span><div class="dialog-field-line">/.test(PU), 'Install plugin…: Cancel left of the primary Install; the Credential row is a field row (its name above, select + 建立… on one line)');
ok(/\.dialog-actions > \.mounts-btn, \.dialog-actions > \.btn-create, \.dialog-actions > \.btn-cancel \{ padding: 5px 14px; font-size: 12px; line-height: normal; border-radius: var\(--radius-sm\); \}/.test(CSS) && /\.mounts-btn-primary:hover:not\(:disabled\) \{ background: var\(--accent-hover\);/.test(CSS) && !/\.mounts-btn-primary:hover[^{]*\{[^}]*opacity/.test(CSS), 'style.css: ONE action row (every button at the footer\'s size, --radius-sm); the primary\'s hover is --accent-hover, never an opacity');
ok(/\.window\.window-form > \.window-content \{ overflow: clip; \}/.test(CSS) && /\.dialog-form > \.dialog > \.dialog-header \{ display: none; \}/.test(CSS) && /\.dialog-form \{ position: absolute; left: 0; top: 0; outline: none; \}/.test(CSS) && /\.plugin-install-row\.hidden, \.plugin-install-cred-hint\.hidden, \.plugin-install-error\.hidden \{ display: none; \}/.test(CSS), 'style.css: a form\'s head is its window\'s title bar, its dialog stands absolute (the window takes its size); the git-only rows hide');
ok(/app\.formsToSheets = \(\) => \{ for \(const h of \[\.\.\.OPEN\]\) h\.toSheet\(\); \};/.test(FW) && /function enterPhone\(app\) \{\n  app\.formsToSheets\?\.\(\);/.test(VS) && /app\.sheetsToForms\?\.\(\); \/\/ lane dialog-yield r2: LAST/.test(VS), 'viewport-switch: entering the phone tier re-hosts every open form as its sheet FIRST; entering the desktop tier re-hosts every sheet as its window LAST');
ok(/app\.sheetsToForms = \(\) => \{ if \(sheetHomeVerdict\(\{ phone: phoneNow\(\), blocked: blockedNow\(\) \}\) !== 'window'\) return; for \(const h of sheets\(\)\) h\.toWindow\(\); \};/.test(FW) && /layerMo = new MutationObserver\(\(\) => \{ if \(!sheets\(\)\.length\) \{ layerMo\.disconnect\(\); return; \} app\.sheetsToForms\(\); \}\);/.test(FW), 'form-window: a sheet exists only while what made it does — the layer it stands over closing (a MutationObserver while a sheet is open) or the page back at a desktop width re-hosts it as its window');
ok(/grow = new MutationObserver\(soon\); if \(dlg\) grow\.observe\(dlg, \{ childList: true, subtree: true, characterData: true/.test(FW) && /queueMicrotask\(\(\) => \{ queued = false; fit\(\); \}\)/.test(FW), 'form-window: a content change re-fits the form too (a MutationObserver, per microtask) — a background tab runs no ResizeObserver');
ok(/const cap = formMaxDialog\(\{ ws, chrome \}\);/.test(FW) && /const k = formInside\(\{ at: \{ left: parseFloat\(win\.element\.style\.left\) \|\| 0, top: parseFloat\(win\.element\.style\.top\) \|\| 0 \}, box, ws \}\);/.test(FW), 'form-window: every fit caps the dialog at the workspace (its body scrolls) and keeps the WHOLE form inside (formInside)');
ok((FW.match(/\bfocusWindow\(/g) || []).length === 1 && /if \(back && !back\.isMinimized && !back\._hiddenByDesktop\) wm\.focusWindow\(backTo\);/.test(FW) && (FW.match(/wm\.revealWindow\(win\.id\)/g) || []).length === 2, 'form-window: a Tab the person pressed and the same form re-opened raise it through revealWindow (§62\'s door); its ONE focusWindow gives the active window back to its opener when it closes');
ok(/win\.onClose = \(\) => \{[^\n]*app\._checkWelcome\?\.\(\)/.test(FW) && /win\.type !== 'form'\) \{ hasWindows = true; break; \}/.test(A), 'the welcome never counts a form, and a form\'s close re-checks it (a blank desktop with no welcome on da9545e8)');
ok(/const notePress = \(e\) => \{/.test(FW) && /pressToken: \(\) => taskPress,/.test(FW) && /fromLayer: blocked && !!\(from && from\.inLayer\)/.test(FW) && !/1500/.test(FW), 'r3 form-window: «from the layer» is the press TOKEN (judged at the press, carried across awaits) — no clock');
ok(/typeof into\.moveBefore === 'function' && root\.isConnected && into\.isConnected/.test(FW) && /const back = \(\) => \{ for \(const \[el, top, left\] of kept\) if \(el\.isConnected\) \{ el\.scrollTop = top; el\.scrollLeft = left; \} \};/.test(FW) && /const movable = \(\) => \{ try \{ return typeof Element\.prototype\.moveBefore === 'function' \|\| !root\.querySelector\('iframe'\);/.test(FW), 'r3 form-window: a re-host MOVES the element (moveBefore: an iframe keeps its page) and puts every inner scroller back; without moveBefore a form holding an iframe keeps its shape');
ok(/html\.vs-kb-open \.dialog-overlay \{ bottom: calc\(var\(--kb-inset, 0px\) \/ var\(--ui-scale, 1\)\); \}/.test(CSS) && /html\.vs-kb-open \.dialog-overlay > \.dialog \{ max-height: calc\(min\(80vh, 100vh - var\(--kb-inset, 0px\) - 16px\) \/ var\(--ui-scale, 1\)\); \}/.test(CSS), 'r3 style.css: a sheet\'s foot stays above the on-screen keyboard (the overlay ends at --kb-inset, the dialog fits what is left)');
ok(/escapeToClose: true, onEscape: \(\) => oatEscape\(\), kind: 'form' \}\);/.test(MA) && !/overlay\.addEventListener\('keydown', async \(e\) => \{\s*if \(e\.key !== 'Escape'\) return;/.test(MA), 'the OAT sign-in asks «Cancel the sign-in?» through the shell\'s door (onEscape) — no Escape listener of its own on the root');

console.log(`\n${fail ? '✗' : '✓'} test-dialog-yield: ${pass} passed, ${fail} failed${fail ? '' : ' — ALL PASS'}`);
process.exit(fail ? 1 : 0);
