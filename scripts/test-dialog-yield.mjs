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
  [{ open: [], nextKey: 'a' }, 'open', -1, 'nothing open under the id: it opens'],
  [{ open: [{ key: null }], nextKey: null }, 'raise', 0, 'a single-subject form opened again (Install plugin): RAISED, never replaced'],
  [{ open: [{ key: 'c1' }], nextKey: 'c1' }, 'raise', 0, 'the same subject again (the Callers of one path): raised'],
  [{ open: [{ key: 'once:1' }], nextKey: 'once:2' }, 'door', 0, 'r3: another subject under the id (Rotate… twice — a new token; the switcher pA then pB): the open one\'s door first'],
  [{ open: [{ key: 'h1', undismissable: true }], nextKey: 'h2' }, 'beside', -1, 'r3: the open one declared itself undismissable (a running Set up): the new one opens BESIDE it'],
  [{ open: [{ key: 'h1', undismissable: true }, { key: 'h2', undismissable: true }], nextKey: 'h2' }, 'raise', 1, 'r4: the subject opened BESIDE asked again (Set up box2 twice): ITS form raised — never a third window'],
  [{ open: [{ key: 'f1' }], nextKey: 'f2', beside: true }, 'beside', -1, 'r4: the call says two subjects are two forms (Properties of X then of Y; row B\'s picker beside row A\'s): beside, the first stays'],
  [{ open: [{ key: 'f1' }, { key: 'f2' }], nextKey: 'f2', beside: true }, 'raise', 1, 'r4: … the second subject again: its own form raised'],
  [{ open: [{ key: 'h1', undismissable: true }, { key: 'x' }], nextKey: 'y' }, 'door', 1, 'r4: the first one the person can dismiss is doored; the undismissable one stays'],
  [{ open: [{ key: 7 }], nextKey: '7' }, 'raise', 0, 'a key is compared as words (7 ≡ \'7\')'],
];
const runReopen = (M) => REOPEN.filter(([a, want, at]) => { const v = M.reopenVerdict(a); return v.verdict !== want || v.at !== at; }).map(([a]) => J(a));
ok(runReopen(FY).length === 0, `every row holds (${REOPEN.length}): ${REOPEN.map(([, w, , why]) => `${w} — ${why}`).join('; ')}`, runReopen(FY));
const rows = (...i) => J(i.map((x) => J(REOPEN[x][0])));
const replace = await mutant("  if (same >= 0) return { verdict: 'raise', at: same };", "  if (same >= 0) return { verdict: 'replace', at: same };");
ok(J(runReopen(replace)) === rows(1, 2, 5, 7, 9), 'MUTANT (the dedup replaces — da9545e8: \'AAA\' became \'\', a ws handler leaked): every same-subject row is RED', runReopen(replace));
const titleRule = await mutant("  const same = open.findIndex((o) => k(o && o.key) === k(nextKey));", "  const same = open.length ? 0 : -1;");
ok(J(runReopen(titleRule)) === rows(3, 4, 5, 6, 7, 8), 'MUTANT (c3ed5f0a\'s «same title ⇒ same form» — every re-open under the id raised the first: tok_TWO into a detached shell): the other-subject rows and the beside raises are RED', runReopen(titleRule));
const baseOnly = await mutant("  const same = open.findIndex((o) => k(o && o.key) === k(nextKey));", "  const same = open.length && k(open[0] && open[0].key) === k(nextKey) ? 0 : -1;");
ok(J(runReopen(baseOnly)) === rows(5, 7), 'MUTANT (981f70d6 — only the form AT the id compared, a beside one never found: Set up box2 asked again opened host-setup-dialog-3): exactly the beside-raise rows are RED', runReopen(baseOnly));
const noBeside = await mutant("  if (beside) return { verdict: 'beside', at: -1 };\n", '');
ok(J(runReopen(noBeside)) === rows(6), 'MUTANT (a call\'s `beside` ignored — 981f70d6: Properties of Y closed X\'s, row B\'s Browse… doored row A\'s picker): exactly the two-subjects row is RED', runReopen(noBeside));
const doorAll = await mutant("  return door >= 0 ? { verdict: 'door', at: door } : { verdict: 'beside', at: -1 };", "  return { verdict: 'door', at: 0 };");
ok(J(runReopen(doorAll)) === rows(4, 8), 'MUTANT (a neighbour\'s open closes an undismissable form — c3ed5f0a closed the running Set up, handlers 28 → 27): the undismissable rows are RED', runReopen(doorAll));
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
const FOCUS = [[{ active: true }, 'allow'], [{ active: false, byKeyboard: true }, 'raise'], [{ active: false, byKeyboard: false }, 'refuse'], [{}, 'refuse'], [{ active: false, byKeyboard: false, within: true }, 'allow']];
const runFocus = (M) => FOCUS.filter(([a, want]) => M.formFocusVerdict(a) !== want).map(([a]) => J(a));
ok(runFocus(FY).length === 0, 'the active form takes a focus; a Tab the person pressed raises it; a script\'s focus into a form behind is refused; r5: a move WITHIN a form the focus is already in enters nothing (allowed)', runFocus(FY));
const noWithin = await mutant("if (active || within) return 'allow';", "if (active) return 'allow';");
ok(J(runFocus(noWithin)) === J([J(FOCUS[4][0])]), 'MUTANT (37c1b566 — a move within the form refused: the guard sent the focus back to the field it came from, whose focusin sent it back again — the stack overflowed): the within row is RED', runFocus(noWithin));
const anyFocus = await mutant("return byKeyboard ? 'raise' : 'refuse';", "return 'allow';");
ok(runFocus(anyFocus).length === 3, 'MUTANT (any focus allowed — a re-render takes the caret from the chat): the three rows behind are RED', runFocus(anyFocus));

console.log('⑤ the wiring');
const U = read('src/lib/utils.js'), FW = read('src/lib/form-window.js'), W = read('src/lib/window.js'), L = read('src/lib/layout.js'), SM = read('src/lib/stage-manager.js'), TG = read('src/lib/tab-group.js'), SL = read('src/lib/session-lifecycle.js'), PU = read('src/lib/plugins-ui.js'), CSS = read('public/style.css'), KY = read('src/lib/keyboard-yield.js'), BLW = read('src/lib/browser-live-window.js'), VS = read('src/lib/viewport-switch.js'), A = read('src/lib/app.js'), MA = read('src/lib/manage-agents.js');
const shell = U.slice(U.indexOf('export function createModalShell('), U.indexOf('\n}\n', U.indexOf('function buildShell(')));
ok(/if \(fh\) fh\.adopt\(overlay\);[^\n]*\n\s*else if \(hosted\) \{ gone = true; return; \}\n\s*else \{ overlay\.className = 'dialog-overlay'; overlay\.style\.zIndex = '99998'; document\.body\.appendChild\(overlay\); \}/.test(shell), 'utils: a form stands where its host puts it (its window, or its sheet) — a decision keeps the overlay at z 99998 on <body>');
ok(/if \(closeOnBackdrop\) overlay\.addEventListener\('mousedown', \(e\) => \{ if \(e\.target === overlay && \(!fh \|\| fh\.mode\(\) === 'sheet'\)\) dismiss\(\); \}\);/.test(shell) && /if \(hosted\) \{[\s\S]*document\.querySelector\('\[data-popover\]'\)[\s\S]*select:open[\s\S]*if \(escDoor\(e\) === 'none'\) return;[\s\S]*\} else if \(escapeToClose\) \{[\s\S]*onIdleEscape/.test(shell), 'utils: a form window has no backdrop; its Escape is the ONE door (escDoor) from INSIDE it (a popover / an open picker first); the idle-Escape rule is a decision\'s alone');
ok(/const escDoor = \(e\) => \{[\s\S]*says = onEscape\(e\) !== false[\s\S]*escapeVerdict\(\{ escapeToClose: !!escapeToClose, hook, callerSays: says, guarded: !!guard, typed: !!typed && typed\.dirty\(\) \}\)/.test(shell), 'utils: ONE Escape door — the caller\'s onEscape FIRST, then escapeToClose / the guard / the typed ask (PURE escapeVerdict)');
ok(/const base = kind === 'form' \? id : null;/.test(shell) && /const fam = familyOf\(base\);\s*const \{ verdict, at \} = reopenVerdict\(\{ open: fam\.map\(\(s\) => \(\{ key: s\.key, undismissable: s\.undismissable \}\)\), nextKey: key, beside: !!beside \}\);\s*if \(verdict === 'raise'\) return fam\[at\]\.raise\(/.test(shell) && /if \(sh\.live\(\)\) \{ const q = buildShell\(\{ \.\.\.opts, id: sh\.domId, base, from \}, true\); sh\.queue\(q\); return q\.api; \}/.test(shell) && /id = freeId\(base, familyOf\(base\)\);/.test(shell) && /if \(base\) families\.set\(base, \[\.\.\.\(families\.get\(base\) \|\| \[\]\), overlay\._shell\]\);/.test(shell) && !/idleShell|besideId/.test(U), 'utils: a form\'s identity is id + KEY over its FAMILY (r4: every form open under the id — at it, beside it, queued — is registered and found by its key): the same key RAISED (the live shell, `raised: true`), another key through the open one\'s door (asked ⇒ QUEUED in its place), beside an undismissable one or when the call says `beside`; no detached shell');
ok(/const live = \(\) => !gone && \(!mounted \|\| overlay\.isConnected\);/.test(shell) && /live: \(\) => live\(\),/.test(shell) && /raised: false, asked: deferred, ready,/.test(shell) && /if \(!mounted\) return \{ \.\.\.api, raised: true \};/.test(shell), 'r4 utils: THE liveness predicate is the shell\'s — live() is true while it is open or QUEUED (a detached body is no «closed»), false once it ended or was dropped; a queued form asked again answers its own wait (asked, its ready)');
ok(/raise: \(\{ opener: by = 'person', onClose: also = null \} = \{\}\) => \{\s*if \(also\) closers\.push\(also\);\s*if \(!mounted\) return \{ \.\.\.api, raised: true \};[^\n]*\n\s*if \(fh\) fh\.raise\(\{ opener: by \}\);[^\n]*\n\s*announceModal\(overlay\);/.test(shell) && /const dropQueued = \(\) => \{ const q = queued; queued = null; if \(q\) q\.drop\('kept'\); \};/.test(shell) && /onKept: dropQueued/.test(shell) && /const q = queued; queued = null; if \(q\) q\.go\(\);/.test(shell), 'utils: a raise ANNOUNCES like an open (the live view hands the raised form the keys) and chains the re-open\'s onClose; a queued form opens when the door closed the old one, never when the person kept it (Keep editing ⇒ dropped, said)');
ok(/const from = opts\.from \|\| \(kind === 'form' \? pressToken\(\) : null\);/.test(shell) && /export function pressToken\(\)/.test(U) && /if \(kind === 'form' && !id\) id = `form-\$\{\+\+formIdSeq\}`;/.test(shell), 'utils: the press that asked is a TOKEN carried to the host (`from`, else the press of this task); a form never shares an id (none ⇒ a fresh one)');
ok(/overlay\.remove = \(\) => \{\s*if \(hosted \|\| !mounted\) \{ if \(ended\('removed'\)\) \{ if \(fh\) fh\.close\(\); release\(\); \} return; \}/.test(shell) && /const ended = \(why\) => \{ if \(gone\) return false; gone = true; endedBy = why;/.test(shell) && /closed: \(\) => \{ if \(ended\('window'\)\) runClose\(\); \}/.test(shell) && /: \(\) => \{ if \(!ended\('closed'\)\) return; if \(mounted\) detach\(\); runClose\(\); \};/.test(shell), 'utils: a form ends ONCE, with its NAME — its close and its window closed by any door run onClose once; a caller\'s overlay.remove() closes it WITHOUT onClose (a decision\'s bare remove) and answers what waits on it (r5)');
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
ok(/html\.vs-kb-open \.dialog-overlay:not\(#dialog-overlay\) \{ bottom: calc\(var\(--kb-inset, 0px\) \/ var\(--ui-scale, 1\)\); \}/.test(CSS) && /html\.vs-kb-open \.dialog-overlay:not\(#dialog-overlay\) > \.dialog \{ max-height: calc\(min\(80vh, 100vh - var\(--kb-inset, 0px\) - 16px\) \/ var\(--ui-scale, 1\)\); \}/.test(CSS) && !/html\.vs-kb-open \.dialog-overlay \{/.test(CSS) && !/html\.vs-kb-open \.dialog-overlay > \.dialog \{/.test(CSS) && !/vs-kb-open[^{}]*design-(composer-)?sheet[^{}]*\{[^}]*\bbottom\b/.test(CSS), 'r3 + r4 + r5 style.css: a SHEET\'s foot stays above the on-screen keyboard (the overlay ends at --kb-inset, the dialog fits what is left) — the yield law\'s sheets only, never the static #dialog-overlay (981f70d6 put New Session\'s header at −172..−78)');
ok(/escapeToClose: true, onEscape: \(\) => oatEscape\(\), kind: 'form' \}\);/.test(MA) && !/overlay\.addEventListener\('keydown', async \(e\) => \{\s*if \(e\.key !== 'Escape'\) return;/.test(MA), 'the OAT sign-in asks «Cancel the sign-in?» through the shell\'s door (onEscape) — no Escape listener of its own on the root');

console.log('⑥ round 4 — a key names ONE subject; a queued form\'s caller is told');
{
  const DAL = read('src/lib/desktop-app-launcher.js');
  const a = DAL.indexOf('export function installSubjectKey('), b = DAL.indexOf('\n}\n', a) + 2;
  const fnSrc = DAL.slice(a, b).replace(/^export /, '');
  const make = (src) => new Function(`${src}; return installSubjectKey;`)();
  const KEY = [
    [[{ hostId: 'local' }, { what: 'app', request: { kind: 'remove', entryId: 'gimp' } }], [{ hostId: 'local' }, { what: 'app', request: { kind: 'remove', entryId: 'inkscape' } }], false, 'Remove gimp ≠ Remove inkscape (981f70d6 raised «Remove gimp» for inkscape — its Remove would run apt-get remove gimp)'],
    [[{ hostId: 'local' }, { what: 'app', request: { kind: 'remove', entryId: 'gimp' } }], [{ hostId: 'local' }, { what: 'app', request: { kind: 'apt', packages: ['gimp'] } }], false, 'Remove gimp ≠ install gimp (the verb is the subject too)'],
    [[{ hostId: 'local' }, { what: 'app', request: { kind: 'apt', packages: ['a', 'b'] } }], [{ hostId: 'local' }, { what: 'app', request: { packages: ['a', 'b'], kind: 'apt' } }], true, 'the same request, its fields in another order: ONE subject (raised)'],
    [[{ hostId: 'local' }, { what: 'app', proposalId: 'p1' }], [{ hostId: 'local' }, { what: 'app', proposalId: 'p2' }], false, 'two agents\' proposals from For you: two subjects'],
    [[{ hostId: 'local' }, { what: 'xpra' }], [{ hostId: 'm2' }, { what: 'xpra' }], false, 'xpra on two machines: two subjects'],
    [[{ hostId: 'm2' }, { what: 'xpra' }], [{ hostId: 'm2' }, { what: 'xpra' }], true, 'xpra on one machine again: one subject (raised, its plan as it was)'],
  ];
  const runKey = (f) => KEY.filter(([x, y, same]) => (f(...x) === f(...y)) !== same).map(([, , , why]) => why);
  ok(runKey(make(fnSrc)).length === 0, `installSubjectKey: every row holds (${KEY.length}) — ${KEY.map(([, , , w]) => w).join('; ')}`, runKey(make(fnSrc)));
  const coarse = make('function installSubjectKey(m, { what = \'xpra\' } = {}) { return `${m && m.hostId}:${what}`; }');
  ok(J(runKey(coarse)) === J([KEY[0][3], KEY[1][3], KEY[3][3]]), 'MUTANT (981f70d6\'s key `${hostId}:${what}` — every app request ONE subject): the three two-request rows are RED', runKey(coarse));
  ok(/createModalShell\(\{ id: 'desktop-install-dialog', key: installSubjectKey\(m, \{ what, request, proposalId \}\),/.test(DAL) && /createModalShell\(\{ id: 'desktop-remove-failed', key: `\$\{row && row\.id\}:\$\{forget \? 'forget' : 'remove'\}`,/.test(DAL), 'the install form is keyed by its request (installSubjectKey); a failed remove by its row AND its verb (Forget ≠ Remove — §103\'s load census found it)');
  const PF = read('src/lib/path-field.js');
  ok(/const pickKey = `\$\{fid\}#\$\{\+\+pickerSeq\}`;/.test(PF) && (PF.match(/id: 'path-picker', key: pickKey, beside: true/g) || []).length === 2 && !/key: fid\b/.test(PF), 'path-field: a picker\'s key is the field INSTANCE (minted per pathField), beside — every Task Detail row passed \'task-context-row\': row B\'s Browse… raised row A\'s picker and the pick overwrote row A');
  const FEO = read('src/lib/file-explorer-ops.js'), DWU = read('src/lib/doc-window-ui.js'), DW = read('src/lib/design-window.js');
  ok(/id: 'file-props-dialog', key: fp, beside: true/.test(FEO) && /id: 'page-published-dialog', key: freshKey\('published'\), beside: true/.test(FEO) && /id: 'design-published-dialog', key: freshKey\('published'\), beside: true/.test(DW) && /id: 'doc-comment-sheet', key: `\$\{host\}:\$\{path\}`, beside: true/.test(DWU), 'two subjects, two forms: Properties of X and of Y, two published pages, two documents\' sheets stand side by side (`beside`) — as they did before round 3 gave them an id');
  const AM = read('src/lib/account-models.js'), RE = read('src/lib/channel-reach-editor.js'), MD = read('src/lib/machine-desktop.js');
  ok(/if \(!\(await ready\)\) return null;\n\s*const r = await fetchJson\(`\/api\/accounts\/\$\{encodeURIComponent\(accountId\)\}\/models`\);\n\s*if \(!live\(\)\) return null;/.test(AM) && !/body\.isConnected/.test(AM), 'account-models: a QUEUED «Models — B» draws its content when it opens (awaits `ready`; liveness = live()) — 981f70d6 read its detached body as closed and opened on «Loading…» for ever; r5: it READS its account when it opens (one deleted while it waited says so — 37c1b566 drew the rows read at the ask)');
  ok(/if \(!live\(\)\) \{ off\(\); return; \}/.test(RE) && !/body\.isConnected/.test(RE.slice(RE.indexOf('export async function showReachDialog'))), 'Reach & policy: its broadcast handler judges liveness by live() — a queued dialog no longer unsubscribes itself before it opens');
  ok(/if \(was && was\.live && was\.live\(\)\) return createModalShell\(\{ id: 'machine-desktop-signin', key: k, kind: 'form' \}\)\.ready\.then\(\(\) => was\.p\);/.test(MD) && /const entry = \{ p, finish, live: shellLive \};/.test(MD) && !/was\.overlay/.test(MD), 'machine-desktop: an ask while its sign-in waits (queued, its root detached) shares the one answer — 981f70d6 ended the first ask with null («sign-in cancelled»)');
  const LA = DAL.slice(DAL.indexOf("createModalShell({ id: 'desktop-launch-dialog'"), DAL.indexOf('return { overlay, close };', DAL.indexOf("createModalShell({ id: 'desktop-launch-dialog'")));
  ok(!/overlay\.isConnected/.test(LA) && (LA.match(/\blive\(\)/g) || []).length >= 20 && /if \(await ready\) setTimeout\(\(\) => \{\s*if \(!live\(\)\) return;/.test(LA), 'the app launcher: every observer (the body-childList cleanup, the broadcasts, the machine watch) judges liveness by live() — a queued launcher\'s cleanup ran before it opened; its focus waits for `ready`');
}

console.log('⑦ round 5 — a key names the subject a caller PREFILLS; every road that ends a form answers what waits on it');
{
  const CP = read('src/lib/channels-panel.js');
  const line = /const subject = (JSON\.stringify\(\[[^\n]*\]\));/.exec(CP);
  const keyOf = line ? new Function('accounts', 'convId', 'group', 'initial', 'agentMemo', 'searchedAt', `return ${line[1]};`) : () => null;
  const L = [{ id: 'lark-1' }], S = [{ id: 'slack-1' }], LS = [{ id: 'lark-1' }, { id: 'slack-1' }], SL = [{ id: 'slack-1' }, { id: 'lark-1' }];
  const SKEY = [
    [[LS, null, false, 'foo', null, 0], [LS, null, false, 'bar', null, 0], false, 'the panel\'s «Search messages for "foo"» then "bar" — two subjects (37c1b566: both «undefined:», bar raised foo\'s results)'],
    [[L, 'c1', false, 'deploy', 'm1', 11], [L, 'c1', false, 'rollback', 'm2', 12], false, 'two agent search cards in one conversation — two subjects (37c1b566: the second card showed the first card\'s hits)'],
    [[L, null, true, 'alpha', 'm1', 11], [S, null, true, 'beta', 'm2', 12], false, 'two cards on two accounts — two subjects'],
    [[L, null, true, 'alpha', null, 11], [S, null, true, 'alpha', null, 11], false, 'the same words on another account — two subjects'],
    [[LS, null, false, 'foo', null, 0], [SL, null, false, 'foo', null, 0], true, 'the same accounts in another order, the same words — ONE subject (raised)'],
    [[L, 'c1', false, 'deploy', 'm1', 11], [L, 'c1', false, 'deploy', 'm1', 11], true, 'the same card opened again — ONE subject (raised, its results as they were)'],
    [[L, 'c1', false, 'deploy', 'm1', 11], [L, 'c1', false, 'deploy', 'm3', 12], false, 'the agent searched the same words again later — its own card (its memo), its own hits'],
  ];
  const runS = (f) => SKEY.filter(([x, y, same]) => (f(...x) === f(...y)) !== same).map(([, , , w]) => w);
  ok(!!line && runS(keyOf).length === 0, `chan-search-dialog: the key is the search's subject — the account SET, the words, the scope, an agent card's own search (${SKEY.length} rows)`, runS(keyOf));
  const r4key = (a, convId) => `${a.id}:${convId || ''}`;   // 37c1b566 channels-panel.js:517, verbatim (`a` is the accounts LIST for both prefilled callers)
  ok(J(runS(r4key)) === J([SKEY[0][3], SKEY[1][3], SKEY[2][3], SKEY[3][3], SKEY[6][3]]), 'MUTANT (37c1b566\'s `${a.id}:${convId}` over a list — «undefined:» for every search): every two-search row is RED', runS(r4key));
  ok(/createModalShell\(\{ id: 'chan-search-dialog', key: subject, beside: true,/.test(CP) && /\/\/ not the subject: convTitle — [^\n]*\/\/ not the subject: agentHits — /.test(CP), 'chan-search-dialog: two searches are two forms side by side (`beside` — a view the person may compare; nothing typed is asked about); the same search again is raised');
  const AI = read('src/lib/app-install-dialog.js'), SMX = read('src/lib/sidebar-mounts.js');
  ok(/id: 'app-deb-dialog', key: `\$\{m\.hostId\}:\$\{path \|\| ''\}`/.test(AI) && /id: 'app-help-dialog', key: `\$\{m\.hostId\}:\$\{carried \|\| ''\}`/.test(AI) && /\{ id: 'share-onto-dialog', key: `\$\{h\.id\}:\$\{\(prefillFolder && prefillFolder\.path\) \|\| prefillFolder \|\| ''\}` \}/.test(SMX), 'a key names the value its caller PREFILLS — the .deb\'s path, the helper\'s words, the folder shared onto a machine (37c1b566: a second .deb planned the first, «inkscape» started a billed helper on «gimp», F2 mounted F1)');
  const shell = U.slice(U.indexOf('export function createModalShell('), U.indexOf('\n}\n', U.indexOf('function buildShell(')));
  ok(/if \(sh\.asks\(\)\) sh\.raise\(\{ opener: opener === 'system' \? 'system' : 'person' \}\);[^\n]*\n\s*sh\.door\(\);/.test(shell) && /asks: \(\) => mounted && !gone && \(guard \? guard\.isDirty\(\) : !!typed && typed\.dirty\(\)\),/.test(shell), 'utils: the question a door asks is SEEN — a person\'s ask raises the dirty form first (another desktop: switched to, said), the system\'s pulses its tile (37c1b566: «unsaved changes» drawn under the window the person was in)');
  ok(/get endedBy\(\) \{ return endedBy; \},/.test(shell) && /queue: \(q\) => \{ if \(queued\) queued\.drop\('replaced'\); queued = q; \},/.test(shell) && /drop: \(why = 'kept'\) => \{ if \(!ended\(why\)\) return; runClose\(\); \},/.test(shell) && /const release = \(\) => \{ if \(!mounted\) settle\(null\); const q = queued; queued = null; if \(q\) q\.go\(\); \};/.test(shell), 'utils: every end has its NAME (endedBy: closed · removed · window · kept · replaced) and answers `ready` + the form queued behind it — 37c1b566\'s overlay.remove() left B\'s ready pending for ever');
  ok(/hold: \(on = true\) => \{ held = !!on; \},/.test(shell) && /get undismissable\(\) \{ return kind === 'form' && \(held \|\| undismissableVerdict\(/.test(shell) && /active: \(\) => live\(\) && mounted && \(fh \? fh\.active\(\) : true\),/.test(shell), 'utils: `hold()` — undismissable while it runs (a neighbour opens beside it); `active()` — open and the person\'s active window');
  const DAL = read('src/lib/desktop-app-launcher.js'), BB = read('src/lib/browser-build-dialog.js');
  ok(/hold\(true\);\n\s*try \{ for \(;;\) \{/.test(DAL) && /\} \} finally \{ hold\(false\); \}/.test(DAL) && /const \{ body: ib, close: iclose, raised, hold \} = createModalShell\(\{ id: 'desktop-install-dialog'/.test(DAL), 'the install form HOLDS while its log streams — the person\'s next app request on the machine opens beside it, the log stays (37c1b566: its door closed the running install\'s window)');
  ok(/onDownloaded: \(v\) => \{ const was = shell\.active\(\) \? 'person' : 'system'; shell\.close\(\); openBuildDialog\(app, id, \{ label, onDone, pick: v, opener: was \}\); \}/.test(BB), 'Change build…: the reopen after a finished download stands WHERE THE OLD FORM STOOD — in front only if it was the active window (37c1b566: \'person\' from a 1 s poll took the focus from a chat)');
  const FW5 = read('src/lib/form-window.js');
  ok(/let refusing = false;/.test(FW5) && /if \(refusing\) return;/.test(FW5) && /refusing = true;\n\s*try \{[^\n]*\} catch \{ \} finally \{ refusing = false; \}/.test(FW5) && /within: !!back && root\.contains\(back\) \}\);/.test(FW5), 'form-window: the focus guard is BOUNDED (its own focus() never re-enters it) and a move within the form is no entry (37c1b566: «Maximum call stack size exceeded»)');
  const PF5 = read('src/lib/path-field.js'), TD = read('src/lib/task-detail.js'), MDX = read('src/lib/mounts-dialog.js');
  ok(/if \(st\.picker && st\.picker\.live\(\)\) \{ const pk = st\.picker; st\.picker = null; st\.picking = false; pk\.close\(\); showToast\(t\('The field this picker was for is gone — the picker closed and nothing was written'\)\); \}/.test(PF5) && /if \(!st\.destroyed\) input\.focus\(\);/.test(PF5), 'path-field: destroy() closes its open picker, said (37c1b566: a removed row\'s picker stayed and its pick was dropped in silence)');
  ok(/const was = byRow; byRow = new Map\(\); fields = \[\];/.test(TD) && /if \(old\) \{ was\.delete\(key\); old\._bind\.at = at; old\._bind\.onCommit = onCommit;/.test(TD) && /const j = rowKeysOf\(rows\)\.indexOf\(rk\);\n\s*if \(j < 0\) \{ showToast\(t\('The row \{path\} is gone — \{picked\} was not written'/.test(TD) && /for \(const f of was\.values\(\)\) \{ try \{ f\.destroy\(\); \} catch \{ \} \}/.test(TD) && !/rows\[i\] = \{ \.\.\.rows\[i\], path: text \}/.test(TD), 'Task Detail: a row\'s path field is KEPT across repaints by its row key (the keyed-row law) — a tasks-updated broadcast no longer rebuilds row A\'s field under its open picker; a commit finds its row as it is NOW, a row gone is said');
  ok(/const ctx = \{ close, inputs, body, applyConds: hasWhen \? applyConds : \(\) => \{\}, asked: shell\.asked, ready: shell\.ready, live: shell\.live \};/.test(MDX), 'mountsDialog: its caller is told like createModalShell\'s (asked, ready, live())');
}

console.log(`\n${fail ? '✗' : '✓'} test-dialog-yield: ${pass} passed, ${fail} failed${fail ? '' : ' — ALL PASS'}`);
process.exit(fail ? 1 : 0);
