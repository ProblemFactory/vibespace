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
ok(/app\.formsToSheets = \(\) => \{ for \(const h of \[\.\.\.OPEN\]\) h\.toSheet\(\); \};/.test(FW) /* r20: STRICT again — the forms go first, never deferred alone (⑩ ⑪) */ && /function enterPhone\(app\) \{\n  app\.formsToSheets\?\.\(\);/.test(VS) && /app\.sheetsToForms\?\.\(\); \/\/ lane dialog-yield r2: LAST/.test(VS), 'viewport-switch: entering the phone tier re-hosts every open form as its sheet FIRST; entering the desktop tier re-hosts every sheet as its window LAST');
ok(/app\.sheetsToForms = \(\) => \{ if \(sheetHomeVerdict\(\{ phone: phoneNow\(\), blocked: blockedNow\(\) \}\) !== 'window'\) return; for \(const h of sheets\(\)\) h\.toWindow\(\); \};/.test(FW) && /layerMo = new MutationObserver\(\(\) => \{ if \(!sheets\(\)\.length\) \{ layerMo\.disconnect\(\); return; \} (?:app\.sheetsToForms|rehost)\(\); \}\);/.test(FW) /* r20: the layer's door through the one retry (⑩) */, 'form-window: a sheet exists only while what made it does — the layer it stands over closing (a MutationObserver while a sheet is open) or the page back at a desktop width re-hosts it as its window');
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
  ok(/id: 'file-props-dialog', key: fp, beside: true/.test(FEO) && /id: 'page-published-dialog', key: freshKey\('published'\), beside: true/.test(FEO) && /id: 'design-published-dialog', key: freshKey\('published'\), beside: true/.test(DW) && /id: 'doc-comment-sheet', key: JSON\.stringify\(\[host, path, line, quote\]\), beside: true/.test(DWU), 'two subjects, two forms: Properties of X and of Y, two published pages, two passages\' comment sheets stand side by side (`beside`) — as they did before round 3 gave them an id (r6: the comment sheet\'s subject is the passage — its line, its words — never the document)');
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

// ── round 6 (acceptance r5 of 0ae9fbcb): the Link form's subject is the LINK; the sheets' containing block declared; the add row reset ──
{
  const DW6 = read('src/lib/doc-window-ui.js');
  const m = /const linkDialog = \(title, href, text, at\) => new Promise\(\(resolve\) => \{\n\s*const sh = createModalShell\(\{ id: 'doc-link-dialog', key: (JSON\.stringify\(\[host, path, at, href, text\]\)), beside: true,/.exec(DW6);
  ok(!!m && /const ans = await linkDialog\(link \? t\('Edit link'\) : t\('Link'\), link \? link\.href : '', link \? link\.text : cur\.text, link \? `\$\{link\.from\}-\$\{link\.to\}` : `\$\{from\}-\$\{to\}`\);/.test(DW6), 'doc editor: the Link form is keyed by the LINK asked about — where it stands, its address, its text (the inputs its fields show, through field()) — beside: two links, two forms');
  const LKEY = [
    [['h', '/d.md', '9-21', 'https://example.com/design', 'design notes'], ['h', '/d.md', '40-47', 'https://tracker.example.org/board', 'tracker'], false, 'a second link in the same document — its own form'],
    [['h', '/d.md', '9-21', 'https://example.com/design', 'design notes'], ['h', '/d.md', '9-21', 'https://example.com/design', 'design notes'], true, 'the same link asked again — ONE form (raised)'],
    [['h', '/d.md', '9-21', 'https://example.com/a', 'here'], ['h', '/d.md', '60-64', 'https://example.com/a', 'here'], false, 'two links with the same words and address at two places — two forms (each edits its own)'],
    [['h', '/d.md', '9-9', '', ''], ['h', '/d.md', '30-30', '', ''], false, 'Link at two bare carets — two inserts, two forms'],
    [['h', '/a.md', '9-21', 'https://x', 'x'], ['h', '/b.md', '9-21', 'https://x', 'x'], false, 'two documents — two forms'],
  ];
  const runL = (f) => LKEY.filter(([x, y, same]) => (f(...x) === f(...y)) !== same).map(([, , , w]) => w);
  const linkKey = m ? new Function('host', 'path', 'at', 'href', 'text', `return ${m[1]};`) : () => '';
  ok(!!m && runL(linkKey).length === 0, `doc-link-dialog: the key is the link's subject (${LKEY.length} rows)`, runL(linkKey));
  const r5link = (host, path) => `${host}:${path}`;   // 0ae9fbcb doc-window-ui.js:707, verbatim
  ok(J(runL(r5link)) === J([LKEY[0][3], LKEY[2][3], LKEY[3][3]]), 'MUTANT (0ae9fbcb\'s `${host}:${path}` — the document): a second link, two same-worded links and two bare carets share ONE form — RED', runL(r5link));
  const CSS6 = read('public/style.css');
  ok(/\.dialog-overlay > \.dialog\.design-sheet, \.dialog-overlay > \.dialog\.design-composer-sheet \{ position: absolute; left: 0; right: 0; bottom: 0;/.test(CSS6) && /\.dialog-overlay \{\n\s*position: fixed; inset: 0;/.test(CSS6) && !/design-(composer-)?sheet[^{}]*\{[^}]*position: fixed/.test(CSS6), 'style.css: the design window\'s bottom sheets are ABSOLUTE in their FIXED overlay — the containing block declared, never the side effect of its backdrop-filter (Safari before 18 drops the unprefixed property)');
  const TD6 = read('src/lib/task-detail.js'), PF6 = read('src/lib/path-field.js');
  ok(/const addWas = was\.get\('\+add'\);\n\s*const addKept = addWas && addWas\.inUse\(_ae\) \? addWas : null;/.test(TD6) && /addPf\.set\('', \{ commit: true \}\);/.test(TD6) && /at: rows\.length, key: '\+add', was: addKept \? was : null,/.test(TD6) && !/addInput\.value = '';/.test(TD6) && /byRow\.set\(key, old\); old\.refresh\(\); return old; \}/.test(TD6), 'Task Detail: the «+ Add a path…» row is RESET after an add (its hint back) and carried over while the person is in it (r7: inUse() — the table below); a kept row is painted as the world is now');
  ok(/const picking = \(\) => !!\(st\.picking \|\| \(st\.picker && st\.picker\.live\(\)\)\);/.test(PF6) && /ensure, destroy, picking, inUse \};/.test(PF6), 'path-field: `picking()` — its picker open or its listing on the way');
  const MDH = read('src/lib/machine-desktop-handover.js'), DRV = read('scripts/dbg-comm-surfaces.mjs');
  ok(/id: 'machine-desktop-handover', key: `\$\{hostId\}:\$\{s\.key\}`/.test(MDH), 'Hand over: its key names the machine its post goes to, then the stream');
  ok((DRV.match(/querySelectorAll\('\.dialog-overlay, \.dialog-form'\)\) o\.remove\(\);/g) || []).length === 3 && !/querySelectorAll\('\.dialog-overlay'\)\) o\.remove\(\)/.test(DRV), 'dbg-comm-surfaces (test-channels-i18n\'s driver): its «close the dialogs» closes the FORMS too, through their door (the rule\'s «Who may read» form left open had the conversation\'s Grant access wait behind its question: notify / reach / Integrations never drawn)');
}

// ── round 7 (acceptance r6 of f2c3b9c2): the add row is carried over while the person is IN it; an emptied box drops its stale words ──
{
  const TD7 = read('src/lib/task-detail.js'), PF7 = read('src/lib/path-field.js');
  const mi = /const inUse = \(ae = document\.activeElement\) => (!st\.destroyed && !!\(inside\(ae\) \|\| st\.open \|\| input\.value\.trim\(\) \|\| picking\(\)\));/.exec(PF7);
  ok(!!mi && /ensure, destroy, picking, inUse \};/.test(PF7) && /const addKept = addWas && addWas\.inUse\(_ae\) \? addWas : null;/.test(TD7) && TD7.indexOf("const _ae = document.activeElement;") < TD7.indexOf("body.innerHTML = '';\n    const host = document.createElement('div');\n    host.className = 'task-detail-settings';") && /at: rows\.length, key: '\+add', was: addKept \? was : null,/.test(TD7) && /addPf\.set\('', \{ commit: true \}\);/.test(TD7),
    'path-field: `inUse(ae)` — ONE predicate, the person is IN the field (focused or a press in its list / picker, its list open, typed, picking); Task Detail carries the add row over by it — the active element read BEFORE the body is emptied (emptying it moves the focus out) — and resets it only after a successful add');
  // the add field's state when a tasks-updated repaint lands → carried over (the same element, its list as it was)?
  const INUSE = [
    [{ focused: true, open: true, text: '', picking: false }, true, 'an EMPTY box the person is in, its suggestion list OPEN (f2c3b9c2 rebuilt it: the list closed under the person)'],
    [{ focused: true, open: false, text: '', picking: false }, true, 'an empty box with the caret in it (its list closed by Escape)'],
    [{ focused: false, open: true, text: '', picking: false }, true, 'its list open, the press on its way'],
    [{ focused: false, open: false, text: '~/wo', picking: false }, true, 'typed words not yet added, the person elsewhere'],
    [{ focused: false, open: false, text: '', picking: true }, true, 'its picker open (or its listing on the way)'],
    [{ focused: false, open: false, text: '', picking: false }, false, 'an empty box the person LEFT — drawn fresh, its hint'],
    [{ focused: false, open: false, text: '   ', picking: false }, false, 'blanks only, the person elsewhere — empty'],
    [{ destroyed: true, focused: true, open: true, text: '', picking: false }, false, 'a destroyed field — never carried'],
  ];
  const mk7 = (expr) => new Function('st', 'input', 'inside', 'ae', 'picking', `return ${expr};`);
  const run7 = (f) => INUSE.filter(([x, want]) => !!f({ destroyed: !!x.destroyed, open: x.open }, { value: x.text }, (n) => n === 'IN', x.focused ? 'IN' : 'OUT', () => x.picking) !== want).map(([, , w]) => w);
  ok(!!mi && run7(mk7(mi[1])).length === 0, `the add field's carry-over table (${INUSE.length} rows)`, mi && run7(mk7(mi[1])));
  const r6keep = mk7('!!(input.value.trim() || picking())');   // f2c3b9c2 task-detail.js:461 `addWas.input.value.trim() || addWas.picking()`, in the field's own terms
  ok(J(run7(r6keep)) === J([INUSE[0][2], INUSE[1][2], INUSE[2][2]]), "MUTANT (f2c3b9c2's `input.value.trim() || picking()`): the empty box the person is in — its list open, its caret, its list — is rebuilt — RED", run7(r6keep));
  // a row's «not applied» words over a sequence of the field's states → what a repaint refills from
  const mo = /^\s*onState: (\(v\) => \{ const k = input\.dataset\.rowKey \|\| ''; .*\} \}),$/m.exec(TD7);
  const SEQ = [
    [['unresolved', 'empty'], null, 1, 'typed ~/nope (not applied), then the box EMPTIED — the words are dropped (f2c3b9c2 refilled them on the next repaint, «Not applied … was not found»)'],
    [['unresolved', 'searching', 'empty'], null, 1, 'typed, edited, emptied — dropped'],
    [['unresolved', 'ok'], null, 0, 'typed, then a path that resolves — dropped'],
    [['unresolved'], '~/nope', 0, 'typed and not applied — kept (the box keeps saying 未生效)'],
    [['unresolved', 'missing'], '~/nope', 0, 'typed, then edited to another missing path not yet committed — the words not applied stay'],
  ];
  const runS = (f) => SEQ.filter(([steps, want, empties]) => { const u = new Map(); let e = 0; const input = { dataset: { rowKey: '+add' }, value: '~/nope' }; const g = f(u, input, { onEmpty: () => { e++; } }); for (const st of steps) g({ status: st }); return (u.has('+add') ? u.get('+add') : null) !== want || e !== empties; }).map(([, , , w]) => w);
  const mkS = (expr) => new Function('unresolved', 'input', 'bind', `return ${expr};`);
  ok(!!mo && runS(mkS(mo[1])).length === 0 && /old\._bind\.onEmpty = onEmpty;/.test(TD7) && /onEmpty: \(\) => \{ if \(addWarn\) \{ addWarn\.remove\(\); addWarn = null; \} \},/.test(TD7), `Task Detail: a box the person EMPTIED drops its «not applied» words (the 'empty' status) and the add row's «Not applied … was not found» line with them (${SEQ.length} sequences)`, mo && runS(mkS(mo[1])));
  const r6state = mkS("(v) => { if (v.status === 'unresolved') unresolved.set(input.dataset.rowKey || '', input.value); else if (v.status === 'ok') unresolved.delete(input.dataset.rowKey || ''); }");   // f2c3b9c2 task-detail.js:156, verbatim
  ok(J(runS(r6state)) === J([SEQ[0][3], SEQ[1][3]]), "MUTANT (f2c3b9c2's onState — 'empty' drops nothing): an emptied box's words come back on the next repaint — RED", runS(r6state));
}

// ── hotfix 2.369.368 — the «Install plugin…» dialog's credential option (the owner, 2026-10-31, installing the custom
// browser: the saved Plugin Git credential always read «not set — Set up…»). /api/integrations/:id answers
// `{ integration: view }`; readCred had read `c.values` / `c.set` off that ENVELOPE. ONE pure reader now
// (src/plugin-cred-state.js), the wiring pinned both ways.
console.log('\n⑨ the Install plugin… dialog reads the Plugin Git credential through ONE pure reader (hotfix 2.369.368)');
{
  const PC = (await import(pathToFileURL(path.join(repo, 'src/plugin-cred-state.js')).href)).default;
  const view = { id: 'plugin-git', values: { host: 'github.com', username: 'x-access-token' }, set: { host: true, username: true, token: true, deployKey: false }, masked: { token: '••••vpxB' } };
  ok(J(PC.pluginGitCredOf({ integration: view })) === J({ ready: true, host: 'github.com', kind: 'token' }), "the route's envelope { integration: view } ⇒ ready · github.com · token", PC.pluginGitCredOf({ integration: view }));
  ok(J(PC.pluginGitCredOf(view)) === J({ ready: true, host: 'github.com', kind: 'token' }), 'a bare view ⇒ the same (one shape, one reader)');
  ok(PC.pluginGitCredOf({ integration: { ...view, set: { host: true, token: false, deployKey: true } } }).kind === 'deployKey', 'a deploy key names its kind');
  ok(PC.pluginGitCredOf({ integration: { ...view, set: { host: true } } }).ready === false, 'a host with no sealed secret ⇒ not ready');
  ok(PC.pluginGitCredOf({ integration: { ...view, values: {}, set: {} } }).ready === false, 'a locked vault (the view answers values {} / set {}) ⇒ not ready — never «ready» over a secret nobody can open');
  ok(PC.pluginGitCredOf(null).ready === false && PC.pluginGitCredOf({ error: 'unauthorized' }).ready === false && PC.pluginGitCredOf('x').ready === false, 'no answer / a refusal / junk ⇒ not ready, never a throw');
  // the bug, reproduced: the shipped reading over the real envelope
  const pre = (c) => { const host = c && c.values ? String(c.values.host || '') : ''; return !!(c && host && c.set && (c.set.token || c.set.deployKey)); };
  ok(pre({ integration: view }) === false && pre(view) === true, 'CONTROL (the shipped reading, 2.369.3xx–.367): c.values off the ENVELOPE ⇒ never ready — the defect the owner hit');
  const PU9 = read('src/lib/plugins-ui.js'), IR9 = read('src/routes/integrations.js');
  ok(/const st = pluginGitCredOf\(c\);/.test(PU9) && /import \{ pluginGitCredOf \} from '\.\.\/plugin-cred-state\.js'/.test(PU9) && !/c\.values\s*\?\s*String\(c\.values\.host/.test(PU9), 'WIRING: readCred reads through pluginGitCredOf — the envelope reading is gone from plugins-ui.js');
  ok(/res\.json\(\{ integration: store\(\)\.publicView\(req\.params\.id\) \}\)/.test(IR9), 'the route still answers { integration: view } — the shape the reader unwraps (a change here changes the reader)');
}

console.log('⑩ r19 (lane needs-card-tail, a cross-fix — .367: test-automation-keys-chrome ⑫ — 授权给… opened inside a viewport crossing\'s 120 ms settle as a SHEET, and the settle re-hosted it into its window under the press on its picker\'s row): a stale class is never read at an open; a re-host never moves a form under a press');
{
  // the PURE verdict: the ms a crossing waits (0 = now) — a press down, a press just ended, a press long past
  const RW = [
    [{ pressing: true, pressAt: 9900, pressEnd: 0, now: 10000 }, 300, 'a press is down (between its pointerdown and pointerup) ⇒ wait'],
    [{ pressing: true, pressAt: 8100, pressEnd: 0, now: 10000 }, 100, 'r20: a press down 1.9 s ⇒ wait only to its 2 s bound'],
    [{ pressing: true, pressAt: 7900, pressEnd: 0, now: 10000 }, 200, 'r20: a press down 2.1 s (its release never came) counts as ended at 2 s ⇒ the 300 ms quiet from there'],
    [{ pressing: true, pressAt: 5000, pressEnd: 0, now: 10000 }, 0, 'r20: a press stuck 5 s ⇒ now — nothing waits for ever'],
    [{ pressing: false, pressAt: 69900, pressEnd: 70000, now: 10000 }, 2300, 'r21: stamps 60 s AHEAD of now (a clock stepped back) ⇒ never more than the 300 ms quiet + the 2 s bound'],
    [{ pressing: false, pressEnd: 9900, now: 10000 }, 200, '100 ms after the press ended ⇒ wait the rest of the 300'],
    [{ pressing: false, pressEnd: 9700, now: 10000 }, 0, 'the press ended 300 ms ago ⇒ now'],
    [{ pressing: false, pressEnd: 0, now: 10000 }, 0, 'no press ⇒ now'],
  ];
  const runRW = (F) => RW.filter(([x, want]) => !F || typeof F.rehostWaitVerdict !== 'function' || F.rehostWaitVerdict(x) !== want).map(([, , w]) => w);
  ok(runRW(FY).length === 0 && FY.REHOST_QUIET_MS === 300 && FY.PRESS_MAX_MS === 2000, `RED-able (r19 — 1c4261dcc had no rehostWaitVerdict; r20 — b4271577f's press had no bound: «answers 300 for ever»): rehostWaitVerdict's table (${RW.length} rows)`, runRW(FY));
  const mut8 = async (from, to) => { try { return await mutant(from, to); } catch { return null; } };   // (a tree without the verdict: no anchor — the control is red, never a crash)
  const mDown = await mut8('  if (pressing && age < maxPressMs) return Math.min(quietMs, maxPressMs - age, cap);\n', ''), mQuiet = await mut8('export const REHOST_QUIET_MS = 300, PRESS_MAX_MS = 2000;', 'export const REHOST_QUIET_MS = 0, PRESS_MAX_MS = 2000;'), mBound = await mut8('  if (pressing && age < maxPressMs) return', '  if (pressing) return'), mCap = await mut8('return left > 0 ? Math.min(left, cap) : 0;', 'return left > 0 ? left : 0;');
  ok(!!mDown && !!mQuiet && !!mBound && !!mCap && runRW(mDown).includes(RW[0][2]) && runRW(mQuiet).includes(RW[0][2]) && runRW(mBound).includes(RW[3][2]) && runRW(mCap).includes(RW[4][2]), 'MUTANTS: «a press down is no reason to wait», «no quiet after the press», «a press without a bound» and (r21) «no cap» each go RED on their rows', { mDown: runRW(mDown), mQuiet: runRW(mQuiet), mBound: runRW(mBound), mCap: runRW(mCap) });
  // the wiring: the press in flight is tracked; BOTH crossings ask the verdict; the open settles a crossing still pending first
  const FW8 = read('src/lib/form-window.js'), VS8 = read('src/lib/viewport-switch.js');
  ok(/document\.addEventListener\('pointerdown', \(e\) => \{ if \(e\.isTrusted\) \{ prunePress\(\); pressDownAt = monoNow\(\); pressIds\.set\(e\.pointerId, pressDownAt\); \} \}, true\);/.test(FW8) && /for \(const type of \['pointerup', 'pointercancel'\]\) document\.addEventListener\(type, \(e\) => \{ if \(e\.isTrusted\) pressOver\(e\.pointerId\); \}, true\);/.test(FW8)
      && /const prunePress = \(\) => \{ const now = monoNow\(\); for \(const \[id, at\] of pressIds\) if \(now - at >= PRESS_MAX_MS\) \{ pressIds\.delete\(id\); if \(!pressIds\.size\) pressEnd = Math\.max\(pressEnd, at \+ PRESS_MAX_MS\); \} \};/.test(FW8)
      && /document\.addEventListener\('pointermove', \(e\) => \{ if \(pressIds\.has\(e\.pointerId\) && e\.isTrusted && e\.buttons === 0 && e\.pointerType === 'mouse'\) pressOver\(e\.pointerId\); \}, true\);/.test(FW8) && /document\.addEventListener\('visibilitychange', \(\) => \{ if \(document\.hidden\) pressOver\(\); \}\);/.test(FW8) && /window\.addEventListener\('blur', \(\) => pressOver\(\)\);/.test(FW8)
      && /const monoNow = \(\) => \(typeof performance !== 'undefined' && typeof performance\.now === 'function' \? performance\.now\(\) : Date\.now\(\)\);/.test(FW8)
      && /app\.crossingWait = \(\) => \{ if \(!OPEN\.size\) return 0; prunePress\(\); return rehostWaitVerdict\(\{ pressing: pressIds\.size > 0, pressAt: pressDownAt, pressEnd, now: monoNow\(\) \}\); \};/.test(FW8)
      && /const rehost = \(\) => \{ clearTimeout\(retry\); retry = 0; const ms = app\.crossingWait\(\); if \(ms > 0\) \{ retry = setTimeout\(rehost, ms\); return; \} if \(viewportPhone\(\)\) app\.formsToSheets\(\); else app\.sheetsToForms\(\); \};/.test(FW8) && /return isPhoneClass\(vs\.classNow\(\)\);/.test(FW8)
      && /phoneMq\.addEventListener\('change', \(\) => rehost\(\)\);/.test(FW8) && /window\.addEventListener\('resize', \(\) => \{ if \(!phoneNow\(\)\) for \(const h of \[\.\.\.OPEN\]\) h\.refit\(\); rehost\(\); \}, \{ passive: true \}\);/.test(FW8)
      && /const wait = !now && switchVerdict\(app\._vc, next\)\.act === 'tier' && typeof app\.crossingWait === 'function' \? app\.crossingWait\(\) : 0;\n    if \(wait > 0\) \{ timer = setTimeout\(settle, wait\); return; \}\n    applyViewportClass\(app, next\);/.test(VS8),
    'RED-able (r20 — b4271577f deferred the FORMS alone, each direction on its own timer, with an unbounded press; r21 — 7a01f4626: one boolean for every pointer, wall-clock stamps, a wait with no form open): the host tracks a BOUNDED press PER POINTER on the MONOTONIC clock (down adds its id, up / cancel removes it; a mouse\'s move with no button, a blur, the page hidden end it); the WHOLE tier crossing waits on app.crossingWait — only while a form is open — in the viewport switch\'s settle (settleNow never waits); the other doors re-host through ONE retry that re-reads the tier');
  const op8 = (/    open\(\{ id = null[\s\S]*?const where = formOpenVerdict\(/.exec(FW8) || [''])[0];
  ok(/if \(vs && typeof vs\.pending === 'function' && vs\.pending\(\)\) \{\n          if \(typeof app\.crossingWait === 'function' && app\.crossingWait\(\) > 0 && typeof vs\.classNow === 'function'\) freshPhone = isPhoneClass\(vs\.classNow\(\)\);\n          else vs\.settleNow\(\);\n        \}/.test(op8) && /const phone = !wm \|\| \(freshPhone !== null \? freshPhone : phoneNow\(\)\), blocked = blockedNow\(\);/.test(op8) && /classNow: \(\) => readViewportClass\(app\._vc\) \};/.test(VS8)
      && /return \{ settleNow: \(\) => \{ clearTimeout\(timer\); settle\(true\); \}, pending: \(\) => timer !== null \|\| readViewportClass\(app\._vc\) !== app\._vc, classNow: \(\) => readViewportClass\(app\._vc\) \};/.test(VS8) && /const settle = \(now = false\) => \{\n    timer = null;/.test(VS8),
    'RED-able (r19 — 1c4261dcc read app.isMobile as it stood: a form opened inside the 120 ms settle of a phone → desktop crossing was a SHEET, then jumped into its window; r21 — 7a01f4626 ran the whole crossing at the open under a held press): the open settles a crossing seen and not yet settled BEFORE its verdict (viewport-switch `pending`) — unless a press holds it: then the form is hosted by the class read fresh (`classNow`) and the crossing waits');
}

console.log('⑪ r20 (lane needs-card-tail, the r19 acceptance) — the REAL form-window.js + viewport-switch.js (copies with only their UI imports stubbed) over a fake DOM and a fake clock: a press holds the WHOLE tier crossing and the forms still go first; one retry re-hosts to what the viewport IS; a press is bounded');
{
  const { execFileSync } = await import('node:child_process');
  const VC_URL = pathToFileURL(path.join(repo, 'src/viewport-class.js')).href, FY_URL = pathToFileURL(path.join(repo, 'src/lib/form-yield.js')).href;
  fs.writeFileSync(path.join(tmp, 'st-utils.mjs'), 'export const setFormHost = (h) => { globalThis.__fwHost = h; };\n');
  fs.writeFileSync(path.join(tmp, 'st-wt.mjs'), "export const registerWindowType = () => {}; export const svgIcon16 = () => '';\n");
  fs.writeFileSync(path.join(tmp, 'st-nav.mjs'), 'export class MobileNav { constructor() {} }\n');
  fs.writeFileSync(path.join(tmp, 'st-back.mjs'), 'export const installMobileBack = () => ({});\n');
  fs.writeFileSync(path.join(tmp, 'st-pal.mjs'), 'export const installSessionPalette = () => {};\n');
  const swap = (text, map) => { let t = text; for (const [x, y] of map) { if (!t.includes(x)) return null; t = t.split(x).join(y); } return t; };
  const fwCopy = swap(read('src/lib/form-window.js'), [["from './window-types.js'", "from './st-wt.mjs'"], ["from './utils.js'", "from './st-utils.mjs'"], ["from './form-yield.js'", `from ${J(FY_URL)}`], ["from '../viewport-class.js'", `from ${J(VC_URL)}`]]);
  const vsCopy = swap(read('src/lib/viewport-switch.js'), [["from '../viewport-class.js'", `from ${J(VC_URL)}`], ["from './mobile-nav.js'", "from './st-nav.mjs'"], ["from './mobile-back.js'", "from './st-back.mjs'"], ["from './session-palette.js'", "from './st-pal.mjs'"]]);
  // the child: a fake DOM enough for installFormHost + installViewportSwitch, a fake clock, ONE scenario → JSON
  const HARNESS = String.raw`
const [, , FW, VS, SCEN0] = process.argv;
const [SCEN, MOD] = String(SCEN0).split(':'), TIE = MOD === 'lifo' ? -1 : 1;   // (r22: same-deadline timers in the other order)
let now = 1000000, width = 1280, tid = 0; const timers = [];
let wallOffset = 0;
Object.defineProperty(globalThis, 'performance', { value: { now: () => now }, configurable: true, writable: true });   // (r21: the MONOTONIC clock)
globalThis.setTimeout = (f, ms = 0) => { const id = ++tid; timers.push({ id, at: now + Math.max(0, ms | 0), f }); return id; };
globalThis.clearTimeout = (id) => { const k = timers.findIndex((t) => t.id === id); if (k >= 0) timers.splice(k, 1); };
Date.now = () => now + wallOffset;   // (the wall clock — r21's leg steps it back)
const advance = (ms) => { const end = now + ms; for (;;) { timers.sort((x, y) => x.at - y.at || TIE * (x.id - y.id)); const t = timers[0]; if (!t || t.at > end) break; timers.shift(); now = t.at; t.f(); } now = end; };
const L = {}, W = {}, MQ = [], log = [];
const mqm = (q) => { if (/max-width: 768px\), \(pointer: coarse\)/.test(q)) return width <= 768; let m; if ((m = /\(max-width: (\d+)px\)/.exec(q)) && !/min/.test(q)) return width <= +m[1]; if ((m = /\(min-width: (\d+)px\)/.exec(q))) return width >= +m[1]; return false; };
const el = (tag = 'div') => { const e = { tag, className: '', style: {}, dataset: {}, parentNode: null, isConnected: true, scrollTop: 0, scrollLeft: 0, classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
  querySelector: () => null, querySelectorAll: () => [], contains: () => false, addEventListener() {}, getClientRects: () => [], appendChild(c) { c.parentNode = e; return c; }, append(...cs) { for (const c of cs) c.parentNode = e; }, focus() {} }; return e; };
globalThis.Element = class {};
const body = el('body');
globalThis.document = { addEventListener: (t, f) => { (L[t] ||= []).push(f); }, querySelectorAll: () => [], getElementById: () => null, body, documentElement: { dataset: {} }, activeElement: body, scrollingElement: null, hidden: false };
globalThis.window = globalThis;
globalThis.matchMedia = (q) => { const o = { q, get matches() { return mqm(q); }, ls: [], addEventListener(t, f) { o.ls.push(f); } }; MQ.push(o); return o; };
globalThis.addEventListener = (t, f) => { (W[t] ||= []).push(f); };
globalThis.dispatchEvent = () => true;
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; this.detail = o && o.detail; } };
globalThis.requestAnimationFrame = (f) => setTimeout(f, 16);
globalThis.MutationObserver = class { observe() {} disconnect() {} };
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
globalThis.getComputedStyle = () => ({ overflowX: 'hidden' });
Object.defineProperty(globalThis, 'innerWidth', { get: () => width, configurable: true });
globalThis.scrollX = 0; globalThis.scrollY = 0;
let wid = 0;
const forms = () => [...wm.windows.values()].filter((w) => w.type === 'form').map((w) => w.id).join(',') || 'none';
const wm = { windows: new Map(), activeWindowId: null,
  createWindow({ title, type }) { const id = 'w' + (++wid); const w = { id, type, title, element: el('window'), content: el('content'), isMinimized: false }; this.windows.set(id, w); this.activeWindowId = id; log.push('createWindow ' + id); return w; },
  closeWindow(id) { this.windows.delete(id); if (this.activeWindowId === id) this.activeWindowId = null; log.push('closeWindow ' + id); },
  placeBehind() {}, markArrived() {}, setFixedSize() {}, setTitle() {}, revealWindow() {}, focusWindow() {},
  refitForViewport(phone) { log.push('refit(' + phone + ') forms=' + forms()); }, _mobileLayout: () => width <= 768 };
const { installFormHost } = await import(FW);
const { installViewportSwitch } = await import(VS);
const app = { wm, isMobile: false, _vc: 'desktop', _mobileNav: {}, _mobileBack: {}, updateTaskbar() {}, _applyChromeArrangement() {}, phoneHome: { hide() {} }, _updateMobileNavTitle() {},
  sidebar: { setPhoneMode(p) { log.push('setPhoneMode(' + p + ') forms=' + forms()); }, setRegularMode() {}, restoreListHidden() {} } };
installFormHost(app);
app._viewportSwitch = installViewportSwitch(app);
const fire = (t, extra = {}) => { for (const f of L[t] || []) f({ isTrusted: true, target: body, key: '', buttons: 1, pointerId: 1, pointerType: 'mouse', ...extra }); };
const crossTo = (w) => { width = w; for (const m of MQ) for (const f of m.ls) f({ matches: m.matches }); for (const f of W.resize || []) f({}); };
const NOFORM = SCEN === 'noform-held';
const h = NOFORM ? { mode: () => 'none' } : globalThis.__fwHost.open({ id: 'f1', title: 'F1' }); if (!NOFORM) h.adopt(el('root'));
const out = { at0: h.mode() };
if (SCEN === 'press-then-cross') { fire('pointerdown'); fire('pointerup'); advance(50); crossTo(390); advance(600); }
else if (SCEN === 'held-press-cross') { fire('pointerdown'); advance(20); crossTo(390); advance(500); out.held = { mode: h.mode(), log: log.slice() }; fire('pointerup'); advance(700); }
else if (SCEN === 'round-trip') { fire('pointerdown'); advance(20); crossTo(390); advance(200); crossTo(1280); advance(400); fire('pointerup'); advance(1200); }   // (200: the class settles into the phone under the press)
else if (SCEN === 'reverse-trip') { crossTo(390); advance(500); out.phone = h.mode(); fire('pointerdown'); fire('pointerup'); advance(400); fire('pointerdown'); advance(20); crossTo(1280); advance(200); crossTo(390); advance(400); fire('pointerup'); advance(1200); }
else if (SCEN === 'stuck-press') { fire('pointerdown'); crossTo(390); advance(1000); out.held = { mode: h.mode(), log: log.slice() }; advance(1600); }
else if (SCEN === 'move-ends-press') { fire('pointerdown'); advance(10); fire('pointermove', { buttons: 0 }); advance(10); crossTo(390); advance(700); }
else if (SCEN === 'blur-ends-press') { fire('pointerdown'); advance(10); for (const f of W.blur || []) f({}); advance(10); crossTo(390); advance(700); }
else if (SCEN === 'no-press') { crossTo(390); advance(300); }
else if (SCEN === 'noform-held') { fire('pointerdown'); advance(20); crossTo(390); advance(200); out.at200 = { vc: app._vc, log: log.slice() }; fire('pointerup'); advance(500); }
else if (SCEN === 'code-open-held') { fire('pointerdown'); advance(20); crossTo(390); advance(200); const h2 = globalThis.__fwHost.open({ id: 'f2', title: 'F2', opener: 'system' }); h2.adopt(el('root2')); out.atOpen = { f1: h.mode(), f2: h2.mode(), vc: app._vc, log: log.slice() }; advance(300); out.held = { f1: h.mode(), f2: h2.mode(), log: log.slice() }; fire('pointerup'); advance(700); out.f2 = h2.mode(); }
else if (SCEN === 'wall-steps-back') { fire('pointerdown'); fire('pointerup'); wallOffset -= 60000; advance(50); crossTo(390); advance(600); }
else if (SCEN === 'stale-touch-held') { fire('pointerdown', { pointerId: 7, pointerType: 'touch' }); advance(3000); fire('pointerdown', { pointerId: 1 }); crossTo(390); advance(200); out.held = { mode: h.mode(), vc: app._vc, log: log.slice() }; fire('pointerup', { pointerId: 1 }); advance(700); }
else if (SCEN === 'lost-then-click') { fire('pointerdown', { pointerId: 7, pointerType: 'touch' }); advance(3000); fire('pointerdown', { pointerId: 1 }); fire('pointerup', { pointerId: 1 }); crossTo(390); advance(100); out.held = { mode: h.mode(), vc: app._vc, log: log.slice() }; advance(700); }
else if (SCEN === 'thumb-resting') { fire('pointerdown', { pointerId: 5, pointerType: 'touch' }); advance(5000); fire('pointerdown', { pointerId: 6, pointerType: 'touch' }); crossTo(390); advance(1000); out.held = { mode: h.mode(), vc: app._vc, log: log.slice() }; advance(1500); }
else if (SCEN === 'code-open-desktop-held') { crossTo(390); advance(500); out.phone = { f1: h.mode(), vc: app._vc }; fire('pointerdown', { pointerId: 1 }); advance(20); crossTo(1280); advance(200);
  const before = new Set(wm.windows.keys()); const h2 = globalThis.__fwHost.open({ id: 'f2', title: 'F2', opener: 'system' }); h2.adopt(el('root2')); const w2 = [...wm.windows.keys()].find((k) => !before.has(k)) || null;
  out.atOpen = { f2: h2.mode(), w2, vc: app._vc }; fire('pointerup', { pointerId: 1 }); advance(700); out.end = { f2: h2.mode(), w2Alive: !!w2 && wm.windows.has(w2), closedW2: log.includes('closeWindow ' + w2), f1: h.mode(), vc: app._vc }; }
else if (SCEN === 'two-fingers') { fire('pointerdown', { pointerId: 2, pointerType: 'touch' }); fire('pointerdown', { pointerId: 3, pointerType: 'touch' }); advance(20); crossTo(390); advance(300); fire('pointerup', { pointerId: 2, pointerType: 'touch' }); fire('pointermove', { pointerId: 4, pointerType: 'pen', buttons: 0 }); advance(600); out.held = { mode: h.mode(), log: log.slice() }; fire('pointerup', { pointerId: 3, pointerType: 'touch' }); advance(700); }
out.mode = h.mode(); out.vc = app._vc; out.width = width; out.log = log; out.pending = timers.length;
console.log(JSON.stringify(out));
process.exit(0);
`;
  fs.writeFileSync(path.join(tmp, 'fw-harness.mjs'), HARNESS);
  let nCopy = 0;
  const scenOf = (fwText, vsText, scen) => {
    if (!fwText || !vsText) return { threw: 'an import to stub was not found' };
    const a = path.join(tmp, `fw-real-${++nCopy}.mjs`), b = path.join(tmp, `vs-real-${nCopy}.mjs`);
    fs.writeFileSync(a, fwText); fs.writeFileSync(b, vsText);
    try { return JSON.parse(execFileSync(process.execPath, ['--no-warnings', path.join(tmp, 'fw-harness.mjs'), pathToFileURL(a).href, pathToFileURL(b).href, scen], { encoding: 'utf8', timeout: 20000 }).trim().split('\n').pop()); }
    catch (e) { return { threw: String(e.stderr || e.message).slice(0, 400) }; }
  };
  const phoneRule = (r) => (r.log || []).find((x) => x.startsWith('setPhoneMode(true)')) || null, refitRule = (r) => (r.log || []).find((x) => x.startsWith('refit(true)')) || null;
  const firstOk = (r) => !r.threw && phoneRule(r) === 'setPhoneMode(true) forms=none' && refitRule(r) === 'refit(true) forms=none' && r.log.indexOf('closeWindow w1') >= 0 && r.log.indexOf('closeWindow w1') < r.log.indexOf(phoneRule(r));
  const A = scenOf(fwCopy, vsCopy, 'press-then-cross'), B = scenOf(fwCopy, vsCopy, 'held-press-cross'), N = scenOf(fwCopy, vsCopy, 'no-press');
  ok(firstOk(A) && A.mode === 'sheet' && A.vc === 'compact',
    `RED-able (r20 — b4271577f: «setPhoneMode sees form windows=w1 / refitForViewport sees w1 active=w1», the forms deferred alone): a click, 50 ms later the viewport crosses INTO the phone tier ⇒ the crossing waits for the press's quiet as one unit and the forms still go FIRST — ${J(A.log)}`, A);
  ok(firstOk(B) && B.held && B.held.mode === 'window' && !B.held.log.some((x) => /setPhoneMode|refit/.test(x)) && B.mode === 'sheet',
    `RED-able (r20 — b4271577f built the phone around the form window under the held press): a press DOWN, the viewport crosses into the phone tier ⇒ while it is down nothing moves and no phone rule runs (${J(B.held)}); the press UP ⇒ the crossing, the forms first — ${J(B.log)}`, B);
  ok(firstOk(N) && N.mode === 'sheet', `no press anywhere ⇒ the crossing as it always was: the forms first (${J(N.log)})`, N);
  const RT = scenOf(fwCopy, vsCopy, 'round-trip'), RV = scenOf(fwCopy, vsCopy, 'reverse-trip');
  ok(!RT.threw && RT.mode === 'window' && RT.vc === 'desktop' && RT.width === 1280 && !RV.threw && RV.phone === 'sheet' && RV.mode === 'sheet' && RV.vc === 'compact' && RT.pending === 0 && RV.pending === 0,
    `RED-able (r20 — b4271577f: every form a SHEET on a 1280 px desktop after the round trip): desktop → phone → desktop inside one held press ⇒ the form a ${RT.mode} on the ${RT.width} px ${RT.vc}; phone → desktop → phone ⇒ a ${RV.mode} on the ${RV.vc} — ONE retry re-hosts to what the viewport IS, nothing left pending (${RT.pending}, ${RV.pending})`, { RT, RV });
  const ST = scenOf(fwCopy, vsCopy, 'stuck-press'), MV = scenOf(fwCopy, vsCopy, 'move-ends-press'), BL = scenOf(fwCopy, vsCopy, 'blur-ends-press');
  ok(!ST.threw && ST.held && ST.held.mode === 'window' && firstOk(ST) && ST.mode === 'sheet' && firstOk(MV) && MV.mode === 'sheet' && firstOk(BL) && BL.mode === 'sheet',
    `RED-able (r20 — b4271577f: a release the page never received held every re-host for ever, «rehostWaitVerdict answers 300»): a press whose release never comes holds the crossing 1 s (${ST.held && ST.held.mode}) and no longer than its 2 s bound + the quiet (then ${ST.mode}, the forms first); a move with no button down ends it (${MV.mode}); the page losing the focus ends it (${BL.mode})`, { ST, MV, BL });
  // r21 (the r20 acceptance's four minors)
  const NF = scenOf(fwCopy, vsCopy, 'noform-held'), CO = scenOf(fwCopy, vsCopy, 'code-open-held'), WS = scenOf(fwCopy, vsCopy, 'wall-steps-back'), TF = scenOf(fwCopy, vsCopy, 'two-fingers');
  ok(!NF.threw && !!NF.at200 && NF.at200.vc === 'compact' && NF.at200.log.some((x) => x === 'setPhoneMode(true) forms=none'),
    `RED-able (r21 — 7a01f4626 held EVERY tier crossing for a press, no form open: setPhoneMode at +2300): no form open, a press DOWN, the viewport to 390 ⇒ the crossing settles at its 120 ms as the base did, the press still down (${J(NF.at200)})`, NF);
  ok(!CO.threw && !!CO.atOpen && CO.atOpen.f2 === 'sheet' && CO.atOpen.f1 === 'window' && CO.atOpen.vc === 'desktop' && !CO.atOpen.log.some((x) => /setPhoneMode|refit|closeWindow/.test(x)) && CO.held.f1 === 'window' && !CO.held.log.some((x) => /setPhoneMode|refit/.test(x)) && firstOk(CO) && CO.mode === 'sheet' && CO.f2 === 'sheet',
    `RED-able (r21 — 7a01f4626: settleNow at the open ran the crossing under the press, f1 moved): a press holds a crossing into the phone, a SYSTEM form opens ⇒ it stands as the viewport is (a sheet, read fresh) and nothing else moves, no phone rule runs (${J(CO.atOpen)}); the press UP ⇒ the crossing, forms first (${J(CO.log)})`, CO);
  ok(!WS.threw && firstOk(WS) && WS.mode === 'sheet',
    `RED-able (r21 — 7a01f4626 stamped the press on the wall clock: a step back of 60 s held the crossing ~60 s): a click, the wall clock steps back 60 s, the viewport crosses ⇒ the crossing goes after the press's quiet, forms first (${J(WS.log)})`, WS);
  ok(!TF.threw && !!TF.held && TF.held.mode === 'window' && !TF.held.log.some((x) => /setPhoneMode|refit/.test(x)) && firstOk(TF) && TF.mode === 'sheet',
    `RED-able (r21 — 7a01f4626: one boolean — the first finger lifting ended the press): two fingers down, the viewport crosses, the FIRST lifts and a pen hovers by ⇒ still held (${J(TF.held)}); the second lifts ⇒ the crossing, forms first (${J(TF.log)})`, TF);
  // r22 (the r21 acceptance's two minors)
  const STT = scenOf(fwCopy, vsCopy, 'stale-touch-held'), LTC = scenOf(fwCopy, vsCopy, 'lost-then-click'), THR = scenOf(fwCopy, vsCopy, 'thumb-resting');
  const quietHeld = (r) => !r.threw && !!r.held && r.held.mode === 'window' && r.held.vc === 'desktop' && !r.held.log.some((x) => /setPhoneMode|refit|closeWindow/.test(x)) && firstOk(r) && r.mode === 'sheet';
  ok(quietHeld(STT), `RED-able (r22 — d973c5711: a stale touch kept the Set non-empty, the held mouse press inherited its old stamp and the guard answered 0 — the form closed into a sheet under it): a touch down and never released, 3 s later a mouse press HELD, the viewport crosses ⇒ held (${J(STT.held)}); the press up ⇒ the crossing, forms first`, STT);
  ok(quietHeld(LTC), `RED-able (r22 — d973c5711: the click's release stamped no quiet while the lost touch stayed in the Set): a lost touch release, 3 s later a click, the viewport crosses at once ⇒ still a window 100 ms later — the click's quiet (${J(LTC.held)}); then the crossing, forms first`, LTC);
  ok(quietHeld(THR), `RED-able (r22 — d973c5711: a thumb resting 5 s made the second press's wait 0): a thumb resting 5 s, a second finger down, the viewport crosses ⇒ held 1 s on the second press's own bound (${J(THR.held)}); after its 2 s + the quiet ⇒ the crossing, forms first`, THR);
  const CDF = scenOf(fwCopy, vsCopy, 'code-open-desktop-held'), CDL = scenOf(fwCopy, vsCopy, 'code-open-desktop-held:lifo');
  const keeps = (r) => !r.threw && !!r.phone && r.phone.f1 === 'sheet' && !!r.atOpen && r.atOpen.f2 === 'window' && !!r.atOpen.w2 && !!r.end && r.end.f2 === 'window' && r.end.w2Alive && !r.end.closedW2 && r.end.f1 === 'window' && r.end.vc === 'desktop';
  ok(keeps(CDF) && keeps(CDL), `RED-able (r22 — d973c5711: the retry read app.isMobile, closed the window the form had just opened in and enterDesktop built another): on the phone, a press held across the crossing back to 1280, a SYSTEM form opens as its window ${CDF.atOpen && CDF.atOpen.w2} ⇒ the press up and the crossing: it stays in that window (${J(CDF.end)}; the same-deadline timers in the other order: ${J(CDL.end)})`, { CDF, CDL });
  // the control: r19's shape — the forms deferred ALONE (the strict first rule's mutant) — breaks the first rule
  const r19ish = fwCopy && fwCopy.replace('app.formsToSheets = () => { for (const h of [...OPEN]) h.toSheet(); };', "app.formsToSheets = () => { if (app.crossingWait() > 0) { setTimeout(() => app.formsToSheets(), app.crossingWait()); return; } for (const h of [...OPEN]) h.toSheet(); };");
  const vsNoWait = vsCopy && vsCopy.replace("if (wait > 0) { timer = setTimeout(settle, wait); return; }", '');
  const XA = scenOf(r19ish, vsNoWait, 'press-then-cross');
  ok(!!r19ish && r19ish !== fwCopy && vsNoWait !== vsCopy && !firstOk(XA), `CONTROL (r20): the forms deferred alone and the crossing not held (r19's shape) ⇒ a phone rule sees the form window — ${J(XA.log)}`, XA);
}

console.log(`\n${fail ? '✗' : '✓'} test-dialog-yield: ${pass} passed, ${fail} failed${fail ? '' : ' — ALL PASS'}`);
process.exit(fail ? 1 : 0);
