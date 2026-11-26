import { t } from './i18n.js';
import { ago as pageAgo, markAgo } from './page-time.js'; // lane ui-language: the ONE formatter of a time a person reads
import { menuPlace, menuKeyStep, MENU_PAD } from './menu-place.js'; // PURE (lane desktop-small P2-3): THE ONE placement of a menu inside the viewport
import { metric } from './telemetry-client.js';
import { pressCloses, pressPhase, tapVerdict, shouldCloseOnBlur } from './outside-press.js';
import { NATIVE_PRESS_SELECTOR, PRESS_CHROME_SELECTOR, effectiveUserSelect, pointOnText, pressTargetClass, longPressVerdict, selectionCloses, selectStartAllowed, trustedContextMenu } from './press-select.js';
import { enterSubmits } from './chat-enter-keys.js';
import { arrivalVerdict } from '../sync-arrival.js'; // PURE: StateSync's arrival rule (lane statesync-last-arrival)
import { VOICE_UI } from '../voice-focus.js'; // PURE: the voice UI outside every box — never an outside press (lane phone-tray-voice-done)
import { VC_PHONE_MEDIA } from '../viewport-class.js'; // lane duo-build-1: the phone paths' ONE media list (compact ∪ regular)
import { DIALOG_ROOTS, SHEET_ROOTS, reopenVerdict, undismissableVerdict, escapeVerdict, typedVerdict, ownFloat } from './form-yield.js'; // PURE (lane dialog-yield r2/r3): the ONE dialog predicate set + the shell's verdicts
import { splitSettingLinks, hasScheme as hasSettingScheme } from '../internal-link.js'; // PURE (CJS): THE scheme's ONE grammar (lane setting-doors pick 1's settings row; a toast — the product's own words — draws only that row)

export function formatSize(b) { if(b<1024) return b+' B'; if(b<1048576) return (b/1024).toFixed(1)+' KB'; return (b/1048576).toFixed(1)+' MB'; }

// ── Shared modal shell (dynamic overlay dialogs) ──
// ONE implementation of the hand-rolled overlay pattern (dialog-overlay +
// .dialog + header/✕ + body) that used to be copy-pasted across app.js,
// manage-agents.js, sidebar-mounts.js and file-explorer.js. Deliberately NOT
// [data-popover]: the global Escape handler blind-.remove()s popovers, which
// would skip onClose side effects (e.g. the bootstrap dialog's ws-handler
// unregistration) — Escape support is opt-in and self-contained instead.
//   const { overlay, dialog, body, close } = createModalShell({ title, id });
// id: a decision's singleton dedup — an existing overlay with the same id is removed first (a FORM's id + key: below).
// escapeToClose: focuses the overlay and closes on Escape (stopPropagation so
// the global #dialog-overlay handler doesn't also fire).
// lane dialog-keys (the owner's "ok", 2026-09-30): EVERY APP MODAL SAYS IT OPENED — createModalShell (below) and the static
// #dialog-overlay (app._showDialog) dispatch MODAL_OPEN_EVENT on the document, synchronously, in the opening act's own task,
// so a live view driving the agent's browser judges WHO opened it (src/lib/keyboard-yield.js onDialogOpen → PURE
// dialogOpener / dialogVerdict): the user's own fresh act ⇒ the dialog takes Enter / Escape / typing; a dialog that opens by
// itself ⇒ the keys stay the page's (the password guard). The event carries no evidence of its own — the judge reads the
// browser's trusted press it saw itself — so a forged announcement can never hand a dialog the keys.
export const MODAL_OPEN_EVENT = 'vs-modal-open';
export function announceModal(overlay) {
  try { document.dispatchEvent(new CustomEvent(MODAL_OPEN_EVENT, { detail: { overlay } })); } catch { /* a listener's failure is its own */ }
}
// lane dialog-unsaved-guard (B-bc31 — the owner 2026-10-21 ticked «Also judge plain replies» in Notify…, closed it with ✕,
// and a colleague's reply went unjudged): A CHANGE THE PERSON MADE NEVER VANISHES WITHOUT A WORD. `unsaved` guards the
// person's own dismissals (✕, Escape, a backdrop press — never the caller's `close()`, which stays its Save / Cancel):
//   unsaved: { isDirty?, save, words?, discard?, saveLabel? }
// dirty ⇒ the shell asks IN PLACE (a sheet inside the dialog, not a second modal): «You have unsaved changes» ·
// Save / Discard / Keep editing. Save runs `save()` — the dialog's own save: it LANDED when the dialog closed itself, is
// no longer dirty, or resolved `true` (then the shell closes); a throw, a string / `{error}` / `false`, or a dialog still
// open and dirty is a failure: the sheet stays and says «Not saved: <reason>» (the reason = what it threw / answered, else
// the error toast its own save showed meanwhile). Discard runs `discard()` (e.g. a typed
// secret cleared from the DOM) and closes. Keep editing (Escape on the sheet or the overlay) puts the sheet away.
// No `isDirty` ⇒ the shell's own flag: any input / change event inside the body after open, cleared by `markSaved()`
// (`markDirty()` for a change no event reports). `unsaved: false` = nothing in the dialog changes until its Save — said at
// the call with the reason; scripts/test-dialog-unsaved-census.mjs keeps every Save dialog on one of the two.
// lane dialog-yield (the owner, 2026-10-26, on his hub: «尽可能减少 blocking popup 的使用；带填空的对话框不阻塞聊天；打开别的窗口要
// 让位»): ONE shell, TWO kinds, DECLARED at every call — `kind` has NO default (test-architecture §103 reds a call without one,
// by file:line, and prints the form list):
//   'decision' — the person answers before anything goes on: a yes / no, a consent, a destructive confirm, the vault unlock
//     (each decision call says why on its line: `// decision: <reason>`, printed by §103). The overlay: a backdrop over
//     everything (z 99998).
//   'form' — what the person FILLS, reads or picks from (install a plugin, a credential, mounts, a channel's editors, the
//     Agents forms, a one-line input — showInputDialog…): on the desktop tier a small WINDOW that yields (src/lib/form-window.js
//     — no backdrop, the chat and every window stay interactive, it goes behind what the person focuses and comes back from
//     the taskbar). The phone tier and a form opened FROM a blocking layer keep the sheet — only while that holds.
// Round 2 (acceptance r1, three MAJORs on da9545e8):
//   • ONE ESCAPE DOOR, the shell's, and it honours the call (PURE escapeVerdict): `escapeToClose` as before (a site that left
//     it off stays off — the self-update progress, a machine's set-up), the unsaved guard for a dirty form (Escape = the ✕: it
//     asks), and a caller's ask-first hook `onEscape(e) → false` (it keeps the form — asks or answers itself) consulted BEFORE
//     the close. A caller never puts its own Escape listener on the root (§103 reds it): the shell's ran first and closed the
//     OAT sign-in under its own «Cancel the sign-in?». An unguarded FORM with something TYPED never loses it to an Escape: the
//     shell asks (Keep editing / Discard — PURE typedVerdict over the text-like fields: a select or a box that applies at once
//     is no draft — round 3: the vault Filter's Sort made Escape claim «unsaved changes»).
//   • «Opened by the person» is the CALLER's fact: `opener: 'person' | 'system'` (default person; a broadcast / poll / wake
//     path says 'system' — it opens behind). Whatever it says, a form never takes the keys from a field the person was typing in.
// Round 3 (acceptance r2 — three regressions of round 2 and a hole):
//   • A FORM'S IDENTITY IS THE CALLER'S KEY, never its title: every form has its OWN `id` (no shared constant — a call without
//     one gets `form-<n>`; §103 reds it) and declares `key` = the subject its content is about (the caller, the entry, the
//     document, the conversation, the profile; none = a single-subject form; content shown ONCE keys freshKey()). PURE
//     reopenVerdict: the same key ⇒ the open form is RAISED and the caller gets the LIVE shell with `raised: true` (what was
//     typed, its handlers and its guard stay; a caller that draws per-subject content draws into the live body — every
//     fixed-id caller reads `raised`, §103); another key ⇒ the open one's DOOR first — closed ⇒ the new one opens now; asked
//     (it was dirty) ⇒ the new one is QUEUED: built now (`asked: true`), shown when that door closes it, never if the person
//     keeps it (`ready` → the shell, or null — and its onClose runs); an open form that declared itself undismissable (a
//     running set-up) is never closed by a neighbour: the new one opens BESIDE it. Measured on c3ed5f0a: the token rotated
//     away stayed on screen and tok_TWO went into a detached shell. A raise ANNOUNCES like an open (a live view driving the
//     agent's browser hands the raised form the keys).
//   • «FROM THE LAYER» IS A FACT CAPTURED AT THE PRESS: `from` = pressToken() read in the handler before any await (path-field's
//     Browse… over a 2 s remote listing); without one, the press of the current task. No clock.
// Round 4 (acceptance r3 — measured in headless Chrome against the real modules):
//   • A KEY NAMES ONE SUBJECT: a field's picker is keyed by the field INSTANCE (every Task Detail row passed the same field id
//     and Browse… on row B raised row A's picker), an app request by the request (Remove inkscape raised «Remove gimp»).
//   • THE FAMILY: every form open under an id — the one at the id and every one BESIDE it, a queued one too — is registered
//     under the id and found by its key (PURE reopenVerdict over the family): Set up box2 asked again raises box2's, never a
//     third window. `beside: true` = two subjects are two forms (Properties of X and of Y, two rows' pickers, two published
//     pages — forms that had no id before round 3 stood side by side, and still do).
//   • A QUEUED FORM'S CALLER IS TOLD: the shell answers `asked: true` and `ready` (→ the shell when it opens, null when the
//     person kept the old one), and `live()` is THE liveness predicate — true while it waits, false once it ended or was
//     dropped. A detached body's isConnected is no liveness check: «Models — B» read itself closed during the ask and
//     opened on «Loading…» for ever (§103 reds an isConnected read on the shell's own elements, and a queueable caller that
//     never reads `ready`).
// Round 5 (acceptance r4):
//   • A QUEUED FORM IS ANSWERED ON EVERY ROAD: the open form ended by its caller's `overlay.remove()` (the documented close)
//     releases the one waiting behind its ask — it opens (`ready` → the shell); every end has a NAME (`endedBy`: 'closed',
//     'removed', 'window', 'kept' — the person kept the form it waited for — or 'replaced' — a third ask took its place). On
//     37c1b566 B's ready hung for ever and asking B again was a silent no-op.
//   • THE QUESTION A DOOR ASKS IS SEEN: a person's ask that needs the open form's «unsaved changes» answer RAISES that form
//     first (another desktop: switched to, said in a toast); the system's pulses its tile. 37c1b566 drew the question under
//     the window the person was in — a hang nobody could see.
//   • `active()` = open and the person's active window (a reopen stands where the old form stood); `hold(on)` = undismissable
//     while it runs (a running install's log is never closed by the person's next app request: that one opens beside it).
// The shape returned is the same: `overlay` = the root holding the id (a form's: .dialog-form inside its window, whose
// .remove() closes the window — a caller's overlay.remove() keeps working).
let formHost = null, formTitleSeq = 0, formIdSeq = 0, freshSeq = 0;
/** app.js wires the desktop tier's form host once (src/lib/form-window.js installFormHost); null = every form is a sheet */
export function setFormHost(host) { formHost = host && typeof host.open === 'function' ? host : null; }
/** THE KEY of content shown ONCE (a token, a pairing code): every show is its own subject — a second show closes the dead one
 *  through its door and draws the new one */
export function freshKey(prefix = 'once') { return `${prefix}:${++freshSeq}`; }
/** THE PERSON'S PRESS that starts a call chain (round 3): read SYNCHRONOUSLY in the press's own handler, before any await, and
 *  handed to createModalShell({ from }) — «opened from the layer» is what it says, however long the chain took. null = none. */
export function pressToken() { try { return formHost && typeof formHost.pressToken === 'function' ? formHost.pressToken() : null; } catch { return null; } }
const TEXT_SKIP = /^(button|submit|reset|image|hidden|search|checkbox|radio|range|color|file)$/i;   // a search box's words are its own; a box / select that applies at once is no draft
const fieldOf = (el) => { try { if (!el || el.nodeType !== 1) return false; if (el.isContentEditable) return true; if (el.tagName === 'TEXTAREA') return !el.disabled; return el.tagName === 'INPUT' && !el.disabled && !TEXT_SKIP.test(el.type || ''); } catch { return false; } };
const fieldValue = (f) => (f.isContentEditable ? f.textContent : f.value);
/** WHAT WAS TYPED in a form (round 2): each text-like field's value when the person first entered it; dirty = one differs now */
function typedWatch(scope) {
  const was = new Map();
  scope.addEventListener('focusin', (e) => { const f = e.target; if (fieldOf(f) && !was.has(f)) was.set(f, fieldValue(f)); }, true);
  return { dirty: () => typedVerdict([...was].filter(([f]) => f.isConnected).map(([f, w]) => ({ was: w, now: fieldValue(f) }))) };
}
/** THE FAMILY (round 4): id → the shells open under it (the one at the id, every one beside it, a queued one) — found by key */
const families = new Map();
const familyOf = (id) => { const fam = (families.get(id) || []).filter((s) => s.live()); if (fam.length) families.set(id, fam); else families.delete(id); return fam; };
/** the id a new member of the family takes: the id itself when free, else the next free `<id>-<n>` (a queued member holds its own) */
const freeId = (id, fam) => { const taken = (x) => fam.some((s) => s.domId === x) || (document.getElementById(x) && fam.some((s) => s.overlay === document.getElementById(x))); if (!taken(id)) return id; let n = 2; while (taken(`${id}-${n}`) || document.getElementById(`${id}-${n}`)) n++; return `${id}-${n}`; };
export function createModalShell(opts = {}) {
  const { kind, key = null, opener = 'person', beside = false } = opts;
  let { id } = opts;
  if (kind !== 'decision' && kind !== 'form') { try { console.warn(`[createModalShell] ${id || opts.title}: kind must be 'decision' or 'form' (test-architecture §103) — drawn as a decision`); } catch { /* a console is a courtesy */ } }
  if (kind === 'form' && !id) id = `form-${++formIdSeq}`;   // never a shared constant (round 3 — §103 reds a form call without its own id)
  const from = opts.from || (kind === 'form' ? pressToken() : null);   // the press of THIS task, when the caller carried none
  const base = kind === 'form' ? id : null;   // the family it joins (round 4)
  if (base) {
    const fam = familyOf(base);
    const { verdict, at } = reopenVerdict({ open: fam.map((s) => ({ key: s.key, undismissable: s.undismissable })), nextKey: key, beside: !!beside });
    if (verdict === 'raise') return fam[at].raise({ opener: opener === 'system' ? 'system' : 'person', onClose: opts.onClose });
    if (verdict === 'door') {
      const sh = fam[at];
      if (sh.asks()) sh.raise({ opener: opener === 'system' ? 'system' : 'person' });   // r5: its question is SEEN — in front for the person's ask (switched to, said), the tile pulsing for the system's
      sh.door();
      if (sh.live()) { const q = buildShell({ ...opts, id: sh.domId, base, from }, true); sh.queue(q); return q.api; }   // asked: it opens in that one's place when its door closes it
    }
    id = freeId(base, familyOf(base));
  }
  if (id) { const old = document.getElementById(id); if (old && !(old._shell && old._shell.live() && old._shell.base)) old.remove(); }   // a decision's singleton dedup (and a dead root left under the id)
  return buildShell({ ...opts, id, base, from }, false).api;
}
function buildShell({ kind, id, base = null, key = null, title = '', dialogClass = '', bodyClass = '', minWidth = null, closeOnBackdrop = true, escapeToClose = false, onClose = null, unsaved = null, onEscape = null, opener = 'person', from = null, undismissable = false } = {}, deferred = false) {
  const hosted = kind === 'form' && !!formHost;   // a form the host draws (else the sheet: a page without app.js)
  let fh = null;
  const overlay = document.createElement('div');
  if (id) overlay.id = id;
  const dialog = document.createElement('div');
  dialog.className = 'dialog' + (dialogClass ? ' ' + dialogClass : '');
  if (minWidth) dialog.style.minWidth = minWidth;
  const header = document.createElement('div');
  header.className = 'dialog-header';
  const h3 = document.createElement('h3'); h3.textContent = title;
  const closeBtn = document.createElement('button'); closeBtn.className = 'dialog-close'; closeBtn.textContent = '✕';
  header.append(h3, closeBtn);
  const body = document.createElement('div');
  body.className = 'dialog-body' + (bodyClass ? ' ' + bodyClass : '');
  dialog.append(header, body);
  overlay.appendChild(dialog);
  if (hosted) {
    // a NON-MODAL dialog for assistive tech (round 2 — the window yields: no aria-modal, no focus trap), named by its title
    // (every form the app draws has its host; a page without one keeps the overlay's markup exactly — test-mounts-dialog-extract)
    overlay.setAttribute('role', 'dialog');
    h3.id = id ? `${id}-title` : `dialog-title-${++formTitleSeq}`;   // deterministic: the same dialog draws the same markup (test-mounts-dialog-extract compares two renders)
    overlay.setAttribute('aria-labelledby', h3.id);
  }
  pageKeysScroll(overlay, dialog); // lane door-healthy-chat: PageUp / PageDown move the dialog's scroll region
  let unbindEscape = null;
  let gone = false;   // a form ends ONCE: its own close, or its window closed by any other door (the ✕, a desktop's close)
  let mounted = false, queued = null, settle = null, endedBy = null, held = false;
  const ready = new Promise((r) => { settle = r; });
  const closers = [onClose];   // + the onClose of every re-open that RAISED this form: released when it ends
  /** it ends ONCE, with its NAME (r5): 'closed' · 'removed' (its caller's overlay.remove()) · 'window' (its window closed by another door) · 'kept' / 'replaced' (queued, never opened) */
  const ended = (why) => { if (gone) return false; gone = true; endedBy = why; unbindEscape?.(); return true; };
  const detach = () => { try { Element.prototype.remove.call(overlay); } catch { /* already out */ } };
  /** what waits on it is answered: its own `ready` (null when it never opened) and the form queued behind its ask (it opens) */
  const release = () => { if (!mounted) settle(null); const q = queued; queued = null; if (q) q.go(); };
  const runClose = () => {
    for (const fn of closers) { try { fn?.(); } catch (e) { console.warn('[createModalShell] onClose:', e); } }
    release();   // the form the person asked for while this one's door asked
  };
  const close = hosted
    ? () => { if (!ended('closed')) return; if (fh) fh.close(); runClose(); }
    : () => { if (!ended('closed')) return; if (mounted) detach(); runClose(); };
  // THE CALLER'S overlay.remove() is a door too (r5): it closes the form WITHOUT onClose — as a decision's bare remove (refresh-live:
  // remove, then finish(r)) — and answers what waits on it (37c1b566: the queued form's ready hung for ever, asked again: a no-op)
  overlay.remove = () => {
    if (hosted || !mounted) { if (ended('removed')) { if (fh) fh.close(); release(); } return; }   // a form (or one still queued): it ends here
    detach(); if (!gone && !endedBy) { endedBy = 'removed'; release(); }   // a sheet, as before (a later close() still runs its onClose) — what waits on it is answered
  };
  const dropQueued = () => { const q = queued; queued = null; if (q) q.drop('kept'); };   // the person kept this one: the asked form never opens — said (its onClose, ready null, endedBy 'kept')
  const guard = unsaved && typeof unsaved === 'object' ? unsavedGuard({ overlay, dialog, body, unsaved, close, onKept: dropQueued }) : null;
  const dismiss = guard ? guard.dismiss : close;   // the person's own ✕ / Escape / backdrop — asks first when dirty
  // an unguarded FORM: what the person typed is watched, and an Escape (or another form under its id) asks before it goes
  const typed = kind === 'form' && !guard && unsaved !== false ? typedWatch(body) : null;
  let soft = null;
  const softAsk = () => { soft = soft || unsavedGuard({ overlay, dialog, body, unsaved: { isDirty: () => !!typed && typed.dirty() }, close, soft: true, onKept: dropQueued }); soft.dismiss(); };
  /** THE ONE ESCAPE DOOR (PURE escapeVerdict) → the verdict ('none' = not this shell's key) */
  const escDoor = (e) => {
    const hook = typeof onEscape === 'function';
    let says = true;
    if (hook) { try { says = onEscape(e) !== false; } catch (err) { console.warn('[createModalShell] onEscape:', err); } }
    const v = escapeVerdict({ escapeToClose: !!escapeToClose, hook, callerSays: says, guarded: !!guard, typed: !!typed && typed.dirty() });
    if (v === 'guard' || v === 'close') dismiss('escape');
    else if (v === 'ask') softAsk();
    return v;
  };
  closeBtn.onclick = () => dismiss();
  if (closeOnBackdrop) overlay.addEventListener('mousedown', (e) => { if (e.target === overlay && (!fh || fh.mode() === 'sheet')) dismiss(); });
  if (hosted) {
    // A FORM: Escape is its door only from a focus INSIDE it (a menu over it closes first; an open picker keeps its key)
    overlay.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return;
      if (document.querySelector('[data-popover]')) return;
      try { if (e.target && e.target.matches && e.target.matches('select:open')) return; } catch { /* :open unknown: the key is the form's */ }
      if (escDoor(e) === 'none') return;
      e.preventDefault(); e.stopPropagation();
    });
  } else if (escapeToClose) {
    overlay.tabIndex = -1;
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); escDoor(e); } });
    // lane race-sweep (B-6b74, test-desktop-webrtc-chrome ⑪ 5/5 on 2 busy cpus): the overlay hears Escape only from a focus
    // INSIDE it — a control that disables / replaces itself (the window picker's 「停止」 swaps its row) drops the focus to
    // <body>, and Escape closed nothing: the picker stayed over the window. While NOTHING holds the focus, Escape is the
    // topmost such modal's (after the app's own handler: a popover or the static dialog first — they prevent the default)
    overlay._escapeToClose = true;
    const onIdleEscape = (e) => {
      if (!overlay.isConnected) { if (mounted) unbindEscape(); return; }
      if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return;
      if (e.target !== document.body && e.target !== document.documentElement) return;   // something holds the keyboard
      const open = [...document.querySelectorAll(DIALOG_ROOTS)].filter((o) => o._escapeToClose);
      if (open[open.length - 1] !== overlay) return;   // the topmost one only
      e.preventDefault(); escDoor(e);
    };
    document.addEventListener('keydown', onIdleEscape);
    unbindEscape = () => document.removeEventListener('keydown', onIdleEscape);
  } else if (typeof onEscape === 'function') {
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !e.isComposing) { e.stopPropagation(); escDoor(e); } });
  }
  const noop = () => {};
  const live = () => !gone && (!mounted || overlay.isConnected);
  const api = {
    overlay, dialog, body, closeBtn, close, dismiss,
    markSaved: guard ? guard.markSaved : noop, markDirty: guard ? guard.markDirty : noop, isDirty: guard ? guard.isDirty : () => false,
    raised: false, asked: deferred, ready,
    /** THE liveness predicate (round 4): true while it is open or QUEUED (its detached body is no «closed» — never read
     *  isConnected on the shell's own elements), false once it ended or the person kept the form it waited for */
    live: () => live(),
    /** r5: open AND the person's active window (a sheet: the screen's) — a reopen stands where the old form stood */
    active: () => live() && mounted && (fh ? fh.active() : true),
    /** r5: while it runs, a neighbour never closes it (undismissable — the next subject opens BESIDE it); hold(false) when done */
    hold: (on = true) => { held = !!on; },
    /** r5: why it ended — null while live; 'closed' · 'removed' · 'window' · 'kept' · 'replaced' */
    get endedBy() { return endedBy; },
    /** where it landed: 'front' | 'behind' | 'sheet' (null while queued) — a caller's «busy» latch clears unless 'front' / 'sheet' */
    get placed() { return !mounted ? null : fh ? fh.placed() : 'sheet'; },
  };
  /** SHOW IT (now, or — queued — when the door of the form it waited for closed that one) */
  const mount = () => {
    if (mounted || gone) return;
    mounted = true;
    fh = hosted ? formHost.open({ id, title, opener: opener === 'system' ? 'system' : 'person', from }) : null;   // the host decides where it stands
    if (fh) fh.adopt(overlay);   // its sheet (an overlay, z 99998) or its window's root (.dialog-form) — the host may move it
    else if (hosted) { gone = true; return; }
    else { overlay.className = 'dialog-overlay'; overlay.style.zIndex = '99998'; document.body.appendChild(overlay); }
    announceModal(overlay); // lane dialog-keys: in the opening act's own task, before the caller focuses anything in it
    if (fh) {
      fh.bind({ dismiss: (how) => dismiss(how), closed: () => { if (ended('window')) runClose(); } });
      setTimeout(() => { try { if (fh.active() && overlay.isConnected && !overlay.contains(document.activeElement)) overlay.focus({ preventScroll: true }); } catch { /* focus is a courtesy */ } }, 0);
    } else if (escapeToClose) setTimeout(() => { if (!overlay.contains(document.activeElement)) overlay.focus(); }, 0);   // (never from the dialog's own field — lane dialog-yield r2: the mounts key step focuses its passphrase box)
    settle(api);
  };
  // what a second open of this id finds: the same KEY is raised, another one asks this one's door first (round 3)
  overlay._shell = {
    kind, key, title, base, domId: id, overlay,
    get undismissable() { return kind === 'form' && (held || undismissableVerdict({ undismissable, escapeToClose: !!escapeToClose, closeOnBackdrop, onEscape: typeof onEscape === 'function' })); },
    live,
    /** r5: its door will ASK (an unsaved guard / typed words that are dirty) — the opener raises it first so the question is seen */
    asks: () => mounted && !gone && (guard ? guard.isDirty() : !!typed && typed.dirty()),
    raise: ({ opener: by = 'person', onClose: also = null } = {}) => {
      if (also) closers.push(also);
      if (!mounted) return { ...api, raised: true };   // the same subject is QUEUED already: the same wait (asked, its ready)
      if (fh) fh.raise({ opener: by }); else { try { overlay.focus({ preventScroll: true }); } catch { } }
      announceModal(overlay);   // a raise is an open to the keys' judge (round 3: the raised form's field was reclaimed by a driving live view)
      return { ...api, raised: true, asked: false, ready: Promise.resolve(api) };
    },
    door: () => { if (guard) guard.dismiss(); else if (typed && typed.dirty()) softAsk(); else close(); },
    queue: (q) => { if (queued) queued.drop('replaced'); queued = q; },
  };
  if (base) families.set(base, [...(families.get(base) || []), overlay._shell]);   // found by its key from now on — beside or queued too
  if (!deferred) mount();
  return {
    api,
    go: mount,
    drop: (why = 'kept') => { if (!ended(why)) return; runClose(); },
  };
}
/** THE PAGE KEYS SCROLL A DIALOG (lane door-healthy-chat, 2.369.344 — the naive studies' B3: «the Who can use… dialog and
 *  the pairing command ignore the wheel», a dialog's long list read by dragging its bar). A press inside a dialog lands
 *  the focus on the overlay (tabindex −1, an ANCESTOR of every scroll region) or on <body>, where the browser's own
 *  PageUp / PageDown find no scroller. The keys page the region that holds the focus, else the region of the last press,
 *  else the dialog's tallest one; a text field keeps its own keys. (The wheel needs nothing: it scrolls what is under it.) */
const scrollRegion = (el, stop) => {
  for (let n = el; n && n !== stop.parentNode; n = n.parentElement) {
    if (n.nodeType !== 1) continue;
    const oy = getComputedStyle(n).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 1) return n;
  }
  return null;
};
function pageKeysScroll(overlay, dialog) {
  if (overlay.tabIndex < 0 && !overlay.hasAttribute('tabindex')) overlay.tabIndex = -1; // a press inside focuses the dialog, never <body>
  let pressed = null;
  dialog.addEventListener('pointerdown', (e) => { pressed = e.target; }, true);
  overlay.addEventListener('keydown', (e) => {
    if ((e.key !== 'PageUp' && e.key !== 'PageDown') || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.defaultPrevented || e.isComposing) return;
    const tg = e.target;
    if (_editable(tg)) return; // a text field keeps its own keys
    let box = (tg && tg !== overlay && dialog.contains(tg) && scrollRegion(tg, dialog)) || (pressed && dialog.contains(pressed) && scrollRegion(pressed, dialog));
    if (!box) for (const n of dialog.querySelectorAll('*')) { const r = scrollRegion(n, n); if (r && (!box || r.clientHeight > box.clientHeight)) box = r; }
    if (!box) return;
    e.preventDefault();
    box.scrollBy({ top: (e.key === 'PageUp' ? -1 : 1) * Math.max(40, Math.round(box.clientHeight * 0.9)) });
  });
}
/** The unsaved guard of ONE shell (lane dialog-unsaved-guard — the contract is createModalShell's `unsaved`, above). */
function unsavedGuard({ overlay, dialog, body, unsaved, close, soft = false, onKept = null }) {
  // `soft` (lane dialog-yield r2): an UNGUARDED form's typed words on an Escape — the same sheet with no Save (Keep editing / Discard)
  // `onKept` (r3): the person answered Keep editing — a form queued on this one's door never opens
  let flagged = false;
  const own = typeof unsaved.isDirty !== 'function';
  if (own) { const flag = () => { flagged = true; }; body.addEventListener('input', flag); body.addEventListener('change', flag); }
  const isDirty = () => { if (own) return flagged; try { return !!unsaved.isDirty(); } catch { return true; } };   // a dirty test that throws asks — never a silent drop
  if (!soft) dialog.classList.add('dialog-guarded');
  let sheet = null; let back = null;
  const keepEditing = () => {
    if (!sheet) return;
    sheet.remove(); sheet = null;
    try { onKept?.(); } catch { /* the queue's own */ }
    try { if (back && back.isConnected) back.focus({ preventScroll: true }); else overlay.focus?.({ preventScroll: true }); } catch { /* focus is a courtesy */ }
  };
  const discard = () => { try { unsaved.discard?.(); } finally { close(); } };
  const ask = () => {
    if (sheet) { sheet.querySelector('.dialog-unsaved-save')?.focus({ preventScroll: true }); return; }
    back = document.activeElement;
    sheet = document.createElement('div');
    sheet.className = 'dialog-unsaved';
    sheet.setAttribute('role', 'alertdialog');
    const card = document.createElement('div'); card.className = 'dialog-unsaved-card';
    const words = document.createElement('p'); words.className = 'dialog-unsaved-words'; words.id = `dialog-unsaved-${Date.now().toString(36)}`;
    words.textContent = unsaved.words || t('You have unsaved changes');
    sheet.setAttribute('aria-labelledby', words.id);
    const err = document.createElement('p'); err.className = 'dialog-unsaved-err'; err.setAttribute('role', 'alert'); err.hidden = true;
    const row = document.createElement('div'); row.className = 'dialog-unsaved-actions';
    const mk = (cls, text) => { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = text; return b; };
    const keepB = mk('btn-cancel dialog-unsaved-keep', t('Keep editing'));
    const dropB = mk('btn-cancel dialog-unsaved-discard', t('Discard'));
    const saveB = soft ? keepB : mk('btn-create dialog-unsaved-save', unsaved.saveLabel || t('Save'));   // soft: no save to run — Keep editing is the default
    if (soft) row.append(dropB, keepB); else row.append(keepB, dropB, saveB);
    card.append(words, err, row);
    sheet.appendChild(card);
    keepB.onclick = keepEditing;
    dropB.onclick = discard;
    if (!soft) saveB.onclick = async () => {
      saveB.disabled = dropB.disabled = true; err.hidden = true;
      let r; let thrown = null; const said = [];
      unsavedSaySink = said;
      try { r = await unsaved.save(); } catch (e) { thrown = e; } finally { if (unsavedSaySink === said) unsavedSaySink = null; }
      if (!overlay.isConnected) return;   // the dialog's own save closed it: it landed
      saveB.disabled = dropB.disabled = false;
      const why = thrown ? String((thrown && thrown.message) || thrown) : typeof r === 'string' && r ? r : r && typeof r === 'object' && r.error ? String(r.error) : said.length ? said[said.length - 1] : null;
      if (!why && r !== false && (r === true || !isDirty())) { close(); return; }
      err.textContent = why ? t('Not saved: {reason}', { reason: why }) : t('Not saved');
      err.hidden = false;
      saveB.focus({ preventScroll: true });
    };
    // Escape ON the sheet = Keep editing (it never reaches the overlay's own Escape, nor the page's)
    sheet.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !e.isComposing) { e.preventDefault(); e.stopPropagation(); keepEditing(); } });
    // a press on the sheet's scrim is not a press on the dialog's controls (the sheet holds the dialog until answered)
    sheet.addEventListener('mousedown', (e) => { if (e.target === sheet) { e.preventDefault(); saveB.focus({ preventScroll: true }); } });
    dialog.appendChild(sheet);
    saveB.focus({ preventScroll: true });
  };
  return {
    // `how` = 'escape' (an Escape the sheet itself did not hear): with the sheet up, that is Keep editing
    dismiss: (how) => { if (sheet) { if (how === 'escape') keepEditing(); else ask(); return; } if (isDirty()) ask(); else close(); },
    markSaved: () => { flagged = false; },
    markDirty: () => { flagged = true; },
    isDirty,
  };
}

// ── In-app modal dialogs (replace native prompt/confirm/alert) ──
// Native dialogs block the event loop, ignore the theme, and are awkward on
// mobile. These reuse the existing .dialog CSS. Promise-based:
//   const name = await showInputDialog({ title: 'Rename', value: old });  // null on cancel
//   if (await showConfirmDialog({ title: 'Delete?', message: '...', danger: true })) …
// closeOnBackdrop off: the callers wire backdrop mousedown themselves so the
// Promise resolves (a bare overlay.remove() would leave the await hanging).
let inputSeq = 0;
function _modalShell(title, { kind = 'decision', onClose = null, opener = 'person', from = null } = {}) {
  // lane dialog-yield r2: showInputDialog is a FORM (the ruling «带填空的对话框不阻塞聊天» names no one-line exemption): a window
  // that yields, Escape its shell's door (asks when the line was edited), its window's ✕ answers null (onClose); a caller that
  // must hold everything until answered passes kind 'decision' with its reason. showConfirmDialog stays a decision.
  const { overlay, dialog, body, closeBtn, close } = createModalShell({ kind: kind === 'form' ? 'form' : 'decision', id: kind === 'form' ? `input-dialog-${++inputSeq}` : null, title, closeOnBackdrop: false, escapeToClose: kind === 'form', onClose, opener, from }); // decision: a yes / no answered before anything goes on (showConfirmDialog; showInputDialog's caller may ask for one)
  const footer = document.createElement('div'); footer.className = 'dialog-footer';
  const cancelBtn = document.createElement('button'); cancelBtn.className = 'btn-cancel'; cancelBtn.textContent = t('Cancel');
  const okBtn = document.createElement('button'); okBtn.className = 'btn-create';
  footer.append(cancelBtn, okBtn);
  dialog.appendChild(footer);
  return { overlay, body, okBtn, cancelBtn, closeBtn, close };
}

export function showInputDialog({ title = t('Input'), label = '', value = '', placeholder = '', confirmText = t('OK'), multiline = false, decorate = null, validate = null, kind = 'form', opener = 'person', from = null } = {}) {
  return new Promise((resolve) => {
    let deco = null, settled = false;
    const finish = (result) => { if (settled) return; settled = true; try { deco && deco.destroy && deco.destroy(); } catch { } resolve(result); };
    const form = kind !== 'decision';
    const { overlay, body, okBtn, cancelBtn, closeBtn, close } = _modalShell(title, { kind: form ? 'form' : 'decision', onClose: () => finish(null), opener, from });   // (a fresh id per question: each is its own form)
    okBtn.textContent = confirmText;
    const wrap = document.createElement('label');
    if (label) wrap.appendChild(document.createTextNode(label));
    const input = document.createElement(multiline ? 'textarea' : 'input');
    if (!multiline) input.type = 'text';
    else input.rows = 4;
    input.value = value;
    input.placeholder = placeholder;
    wrap.appendChild(input);
    body.appendChild(wrap);
    // a multi-line box is a message: its caller may attach to it (the microphone — src/lib/voice-input.js; utils imports none of it)
    deco = multiline && typeof decorate === 'function' ? decorate(input) : null;
    const done = (result) => { finish(result); close(); };
    // lane launch-picture-size: `validate(value)` → '' | the refusal's words — said INLINE under the box (role alert), the dialog
    // stays open and the box keeps the text (a typed size refused never closes the question)
    const err = document.createElement('p'); err.className = 'dialog-hint dialog-error hidden'; err.setAttribute('role', 'alert');
    if (typeof validate === 'function') body.appendChild(err);
    const submit = () => {
      const why = typeof validate === 'function' ? validate(input.value) : '';
      if (why) { err.textContent = String(why); err.classList.remove('hidden'); input.focus(); return; }
      done(input.value);
    };
    okBtn.onclick = submit;
    cancelBtn.onclick = closeBtn.onclick = () => done(null);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) done(null); });
    input.addEventListener('keydown', (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Enter' && !multiline) { e.preventDefault(); submit(); }
      if (e.key === 'Enter' && multiline && (e.ctrlKey || e.metaKey)) { e.preventDefault(); done(input.value); }
      if (e.key === 'Escape' && !form) { e.preventDefault(); e.stopPropagation(); done(null); } // (a form's Escape is its shell's door: it asks when the line was edited)
    });
    setTimeout(() => { input.focus(); input.select(); }, 0);
  });
}

export function showConfirmDialog(opts = {}, legacyMessage) {
  // verify-r6 D1: a confirm that shows NOTHING of what OK does is no confirm — two call sites passed (title, message) as
  // strings and rendered a blank "Confirm / OK" (setup-flows' layout restore, then plugins-ui's Stop frp / Tailscale).
  // A string first argument is read as that pair; the approval census (test-approval-census) also refuses the form
  if (typeof opts === 'string') opts = { title: opts, message: typeof legacyMessage === 'string' ? legacyMessage : '' };
  const { title = t('Confirm'), message = '', confirmText = t('OK'), danger = false, items = null } = opts || {};
  const cancelDefault = !!(opts && opts.cancelDefault);   // B-3b03 follow-up: a question that may open while the person types — Enter and focus keep, only a press on the button confirms
  const extra = opts && opts.extra && opts.extra.nodeType === 1 ? opts.extra : null;   // a node of the CALLER's under the list (the Terminate confirm's job rows — the manager design's piece 7)
  const list = Array.isArray(items) ? items.map((x) => String(x)) : []; // B-a67c: what the confirm ends, one row each (a group close names every tab)
  return new Promise((resolve) => {
    const { overlay, body, okBtn, cancelBtn, closeBtn } = _modalShell(title);
    okBtn.textContent = confirmText;
    if (danger) okBtn.classList.add('danger'); // red fill+border+hover as a set (inline bg kept the accent border)
    const p = document.createElement('p');
    p.className = 'dialog-hint';
    p.style.fontSize = '12px';
    // lane ui-language: `message` may be a list of sentences — one line each, as TEXT (a key never carries <br> / <b>)
    const lines = Array.isArray(message) ? message.filter((x) => x != null && x !== '').map(String) : null;
    const paras = lines && lines.length ? lines.map((x, i) => { const q = i ? p.cloneNode(false) : p; q.textContent = x; if (i) q.style.marginTop = '6px'; return q; }) : [p];
    if (!lines) p.textContent = message;
    if ((lines ? lines.length : message) || !list.length) for (const q of paras) body.appendChild(q);
    if (list.length) {
      const ul = document.createElement('ul');
      ul.className = 'dialog-list';
      for (const x of list) { const li = document.createElement('li'); li.textContent = x; ul.appendChild(li); }
      body.appendChild(ul);
    }
    if (extra) body.appendChild(extra);
    const done = (result) => { overlay.remove(); resolve(result); };
    okBtn.onclick = () => done(true);
    cancelBtn.onclick = closeBtn.onclick = () => done(false);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) done(false); });
    overlay.tabIndex = -1;
    overlay.addEventListener('keydown', (e) => {
      if (cancelDefault && e.key === 'Enter') { e.preventDefault(); done(document.activeElement === okBtn); return; }
      if (e.key === 'Enter') { e.preventDefault(); done(true); }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); }
    });
    setTimeout(() => (cancelDefault ? cancelBtn : okBtn).focus(), 0);
    // cancelDefault: the confirm button is OFF for its first second — a Tab then Enter, or a tap, meant for what the person was doing
    // when the question appeared late never confirms it (B-3b03 follow-up, its read's S1)
    if (cancelDefault) { okBtn.disabled = true; setTimeout(() => { okBtn.disabled = false; }, 1000); }
  });
}

// ── Global toast notifications ──
// One shared bottom-center stack for transient feedback. Replaces the ad-hoc
// mix of alert()s, per-component toasts, and silent .catch(() => {}) failures.
// showToast('Saved');  showToast('Rename failed: ' + e.message, { type: 'error' })
// ── Toast cards ──
// Card popups anchored next to the inbox button (user directive: the old
// centered floating strip had no visible background and went unnoticed).
// Duration is user-configurable (taskbar.toastSeconds) and EVERY toast —
// info and error alike — is recorded into a local history that the inbox
// popup shows as its "Notifications" tab.
let _toastCfg = {};
export function configureToasts(cfg) { _toastCfg = cfg || {}; }
export function getToastHistory() {
  try { return JSON.parse(localStorage.getItem('vibespace.toastHistory') || '[]'); } catch { return []; }
}
// A TOAST ABOUT A RECORD keeps no words in the history (lane-redact verify r4, reproduced): a For-you item's arrival toast
// carried the item's text, and this history is localStorage — a copy on every device that was open when the item arrived,
// shown by the popup's Notifications tab after the owner had cleared the item ("Clear content…" cannot reach a device's
// storage). The caller passes `history: {m, ref}`: `m` = what the history keeps (a head, never the record's words), `ref`
// = `{kind, id}` the Notifications tab words from the LIVE store at render time (a cleared record reads the sentence).
// A TOAST SHOWN WHILE THE USER ACTS IS ONE THEY SAW (B-3f5d ①, the 2026-09-24 verifier's note): the Notifications tab's
// unread count took the user's OWN feedback — "Reply sent", "Copied", the error of a click — as news. A toast shown on a
// visible, focused page within OWN_GESTURE_MS of the user's press, Enter, Space or shortcut (never plain typing in a field)
// is recorded `seen` and tabCounts (src/lib/user-todos-layout.js) does not count it; a record's arrival toast (`ref`) is
// news by construction and never `seen`. The history keeps every entry either way.
export const OWN_GESTURE_MS = 4000;
let _gestureAt = 0;
/** PURE: does this key press count as the user ACTING (not typing)? A modifier shortcut, Enter, or any key outside a text field. */
export function isGestureKey(e, editable) {
  if (!e || typeof e.key !== 'string') return false;
  if (e.ctrlKey || e.metaKey || e.altKey || enterSubmits(e)) return true;
  return !editable;
}
/** PURE: is a toast shown at `now` one the user was looking at? */
export function toastSeenAtShow({ now, gestureAt, visible, focused, ref = null }) {
  return !ref && !!visible && !!focused && gestureAt > 0 && now >= gestureAt && now - gestureAt < OWN_GESTURE_MS;
}
const _editable = (el) => !!(el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || '')));
// B-6944's stamps ride the same two listeners: did a KEY lead to the menu that opens now (showContextMenu, MENU_KEY_MS) — a gesture
// key stamps `_menuKeyAt`, the person's own MENU key (isMenuKey) `_menuOwnKeyAt`, a pointer press takes both back. NO LISTENER OF
// ITS OWN (the block checkpoint's red: test-needs-doors' move-mode legs count the document's keydown listeners — a page-long one
// added at module load stood there after every Esc)
let _menuKeyAt = 0, _menuOwnKeyAt = 0;
// B-c87d: the person's LAST ACT on the page — where it landed, on the page's own clock — rides the same two listeners (the late-focus
// door, src/lib/late-focus.js, asks whether the person acted elsewhere since a window's open began). The coordinator's ruling (r364):
// an act is one that PUTS THE KEYBOARD SOMEWHERE — a press, or a key typed INTO an editable target or a window; a modifier alone and
// a key that lands on the page's body never; only the person's own (trusted) events. The target is held by a WeakRef: a closed
// window's page tree is never kept alive by the stamp.
let _personAct = null;
const _MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'OS', 'Super', 'Hyper', 'Fn', 'FnLock', 'CapsLock', 'NumLock', 'ScrollLock']);
/** B-c87d: does this keydown put the keyboard somewhere (an act a late focus must not override)? */
export function keyIsAct(e) {
  if (!e || e.isTrusted === false || _MODIFIER_KEYS.has(e.key)) return false;
  const t = e.target;
  if (!t || (typeof document !== 'undefined' && (t === document.body || t === document.documentElement))) return false;
  return _editable(t) || !!(typeof t.closest === 'function' && t.closest('.window'));
}
const _weak = (t) => (t && typeof WeakRef === 'function' ? new WeakRef(t) : { deref: () => t || null });
// …and beside it the window PART the act landed in — its tab's content, else its frame (r558): a press on what the open removes
// before it asks the door (the opening window's own «Connecting…» body) still lies inside that window. Both held weakly.
const _partOf = (t) => (t && typeof t.closest === 'function' ? t.closest('.window-content') || t.closest('.window') : null);
const _actRef = (t) => { const r = _weak(t), p = _weak(_partOf(t)); return { deref: () => r.deref(), part: () => p.deref() || null }; };
const _now = () => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());
// B-c87d r673: an act's time is its OWN instant on the page's clock (the event's timeStamp; now when that is not on this clock) — the
// same instant an open made inside that act starts at (late-focus.js startNow), so the act that starts an open lies at its start
const _actAt = (e) => { const n = _now(), ts = e && e.timeStamp; return Number.isFinite(ts) && ts >= 0 && ts <= n ? ts : n; };
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('pointerdown', (e) => { _gestureAt = Date.now(); _menuKeyAt = _menuOwnKeyAt = 0; if (e.isTrusted !== false) _personAct = { at: _actAt(e), ref: _actRef(e.target) }; }, true);
  window.addEventListener('keydown', (e) => { if (isGestureKey(e, _editable(e.target))) _gestureAt = _menuKeyAt = Date.now(); if (isMenuKey(e)) _menuOwnKeyAt = Date.now(); if (keyIsAct(e)) _personAct = { at: _actAt(e), ref: _actRef(e.target) }; }, true);
}
/** B-c87d: the person's last act on the page ({ at, target, part } on the page's clock — target null once its tree is gone; part = the
 *  window content or frame it landed in, kept while that window stands), or null before the first */
export function lastPersonAct() { return _personAct ? { at: _personAct.at, target: _personAct.ref.deref() || null, part: _personAct.ref.part() } : null; }
/** B-c87d: the page's clock the late-focus door compares on (an open's start is read from it) */
export function pageClock() { return _now(); }
/** A gesture neither listener above sees — the phone's back swipe (lane mobile-back-guard) — is the person's own act too:
 *  a toast it shows next is not an unread notification. */
export function noteOwnGesture() { _gestureAt = Date.now(); }
function _seenAtShow(ref) {
  try { return toastSeenAtShow({ now: Date.now(), gestureAt: _gestureAt, visible: document.visibilityState === 'visible', focused: document.hasFocus(), ref }); } catch { return false; }
}
/** THE write of the history (its newest 100) — _recordToast and B-7a51's _markToastSeen share it (test-user-state-echo's census counts
 *  the storage write sites by file, call and key against master's) */
function _putToastHistory(h) { localStorage.setItem('vibespace.toastHistory', JSON.stringify(h.slice(0, 100))); }
function _recordToast(message, type, ref = null) {
  let key = null;
  try {
    const h = getToastHistory();
    const seen = _seenAtShow(ref && ref.kind && ref.id ? ref : null);   // B-3f5d ①: shown while the user acted ⇒ not unread
    h.unshift({ m: String(message).slice(0, 500), type, ts: Date.now(), ...(ref && ref.kind && ref.id ? { ref: { kind: String(ref.kind), id: String(ref.id) } } : {}), ...(seen ? { seen: true } : {}) });
    key = { ts: h[0].ts, m: h[0].m };
    _putToastHistory(h);
  } catch {}
  try { window.dispatchEvent(new CustomEvent('vs-toast')); } catch {}
  return key;   // B-7a51: the toast's key into the history (its record time + its words) — a toast held at its birth is judged again when drawn
}
/** The words an older build kept in a record's arrival toast (`<head> · <label>: <the record's words>`), cut back to
 *  `<head>` — every load, idempotent (an entry with a `ref` was written by this build and holds neither). The LABEL goes
 *  too (lane-redact verify r5): a Background Work ask's label is the job's name, and an old entry has no ref to tell.
 *  `heads` = the toast heads that name a record (e.g. "Added to For you", in any language the device used).
 *  @returns how many entries were cut */
export function stripLegacyRecordToasts(heads) {
  try {
    const hs = (Array.isArray(heads) ? heads : []).filter((x) => typeof x === 'string' && x);
    const h = getToastHistory();
    let n = 0;
    for (const e of h) {
      if (!e || e.ref || typeof e.m !== 'string' || !hs.some((hd) => e.m.startsWith(hd))) continue;
      const cut = e.m.indexOf(' · ');
      if (cut < 0) continue;
      e.m = e.m.slice(0, cut);
      n++;
    }
    if (n) localStorage.setItem('vibespace.toastHistory', JSON.stringify(h));
    return n;
  } catch { return 0; }
}
/** P2-1 (lane phone-refusal-wrap — the duo walk measured the centred strip, `bottom: taskbar + 14 px`, ON the phone composer's
 *  row at 382×580, 594×368, 669×420 and 669×867, and over the bottom row of the Backup / Restore dialogs). PURE: WHERE THE
 *  TOAST STACK STANDS on the phone / touch tier (`tier`) — never on the composer, never on an open modal's content.
 *  A modal open ⇒ `{ room: true }`: the dialog makes ROOM for the stack under its head (an empty `.gt-room` as tall as
 *  the stack) and the stack stands over it — the dialog's rows move down, none is covered. Else a composer on screen
 *  (`composerTop`, viewport px) ⇒ `{ bottom }` = the stack's bottom edge `gap` px above it (layout px: ÷ `scale`). Else
 *  null = the stylesheet's own place. The desktop tier and a stack anchored at the inbox button: null (as before). */
export function toastSpot({ tier = false, anchored = false, modal = false, composerTop = null, vh = 0, scale = 1, gap = 8 } = {}) {
  if (!tier || anchored) return null;
  if (modal) return { room: true };
  if (typeof composerTop === 'number' && Number.isFinite(composerTop) && composerTop > 0 && composerTop <= vh) return { bottom: (vh - composerTop + gap) / (scale || 1) };
  return null;
}
/** lane desktop-small (fence ⑨ — the walk at 1100 / 1280 px: a «listening on port 98xx» toast over a chat window's status bar,
 *  a Files cell, the desktop menu's Delete; the stack's z 100000 stands over every menu, and a toast that takes a press
 *  takes the menu's). PURE: WHERE THE DESKTOP TIER'S STACK STANDS — its own place (beside the inbox button, else the
 *  centred strip over the taskbar) unless its rect `rect` meets an open menu or a composer (`avoid`, viewport px); then it
 *  rises above what it meets (`gap` px clear), again while it meets another, never past the toolbar's bottom `topY` (no
 *  room ⇒ its own place). → { bottom } (the stack's CSS bottom, layout px: ÷ `scale`) | null (its own place).
 *  `down` (lane needs-card-tail r14 — the For-you announce under a TOP bar's button): it SINKS below what it meets instead,
 *  never past `bottomY` → { top } (the stack's CSS top, layout px). A SOFT obstacle (`soft: true` — a window's title-bar
 *  buttons, r14) is cleared while there is room; with no room clear of everything it gives way first (the composer, a strip,
 *  a menu, the announce never do — ⑱'s shot on the first r14 commit: four toasts at their own place over Session 10's Send). */
export function toastDeskSpot({ rect = null, avoid = [], topY = 0, vh = 0, scale = 1, gap = 8, down = false, bottomY = vh } = {}) {
  if (!rect || !(rect.height > 0) || !(vh > 0)) return null;
  const all = (Array.isArray(avoid) ? avoid : []).filter(Boolean);
  const place = (list) => {   // → null (its own place is clear) | a spot | false (no room)
    const meets = (top, bottom) => list.find((a) => rect.left < a.right && rect.right > a.left && top < a.bottom && bottom > a.top);
    let bottom = rect.bottom;
    for (let i = 0; i <= list.length; i++) {
      const a = meets(bottom - rect.height, bottom);
      if (!a) return bottom === rect.bottom ? null : down ? { top: (bottom - rect.height) / (scale || 1) } : { bottom: (vh - bottom) / (scale || 1) };
      bottom = down ? a.bottom + gap + rect.height : a.top - gap;
      if (down ? bottom > bottomY : bottom - rect.height < topY) return false;
    }
    return false;
  };
  const spot = place(all);
  if (spot !== false) return spot;
  const hard = all.filter((a) => !a.soft);
  return hard.length < all.length ? place(hard) || null : null;
}
/** B-7a51 — THE STACK STANDS CLEAR OF THE OPEN FOR-YOU PANEL. PURE: a stack `rect` that still meets the panel `panel` after
 *  toastDeskSpot (no room above it under the toolbar: a tall panel, several toasts) stands BESIDE it, `gap` px clear: on its LEFT
 *  → { right } (the stack's CSS right), else on its RIGHT (the For-you button moved to a left bar — its round's MUST: the left
 *  alone was tried) → { left } (the stack's CSS left); layout px (÷ `scale`). null = it meets no panel, or there is no room on
 *  either side (then the caller's yield: toastMayYield). Viewport px in, like toastDeskSpot. */
export function toastBesidePanel({ rect = null, panel = null, vw = 0, scale = 1, gap = 8 } = {}) {
  if (!rect || !panel || !(rect.width > 0) || !(rect.height > 0) || !(panel.right > panel.left) || !(panel.bottom > panel.top) || !(vw > 0)) return null;
  const meets = rect.left < panel.right && rect.right > panel.left && rect.top < panel.bottom && rect.bottom > panel.top;
  if (!meets) return null;
  if (panel.left - gap - rect.width >= 0) return { right: (vw - panel.left + gap) / (scale || 1) };
  if (panel.right + gap + rect.width <= vw) return { left: (panel.right + gap) / (scale || 1) };
  return null;
}
/** B-7a51 (its round's MUST — A TOAST THAT YIELDS IS NEVER LOST). PURE: may this toast step aside — HELD: not drawn, its time not
 *  running — while the stack finds no room clear of the open For-you panel? A toast of a person's failed act (an error; a refusal
 *  of their press — `warn`: the panel's «… moved under the pointer just now — press it again», the setting card's «It changed
 *  meanwhile»), one with a door (an action — an Undo —, a setting link, a tap that opens), one that NAMES A TIME (`timed`: «press ✕
 *  again within n s» — held, its words would turn false) and a pinned notice NEVER yield: they stay, over the panel's edge if
 *  nothing else fits. A plain one yields; its time starts WHOLE when it is drawn again. */
export function toastMayYield({ type = 'info', action = false, pinned = false, timed = false } = {}) { return type !== 'error' && type !== 'warn' && !action && !pinned && !timed; }
/** B-7a51 (round 3's MUST — THE CAP DROPPED THE NEWBORN: with four plain toasts held, a fifth — an error, an Undo — went at its
 *  birth, never drawn, its history line «seen»). PURE: which of the stack's OTHER toasts goes when a fifth arrives? `facts` = the
 *  toasts beside the one being born, oldest first, a pinned notice never among them (the caller's two laws: the newborn is never
 *  dropped, a pinned notice never), each { yields, drawn }. A toast that may yield goes before one that may not; among those, one
 *  the person has seen (drawn) before one never drawn; the oldest first. → its index; -1 = none (the stack keeps them all). */
export function toastCapPick(facts = []) {
  let at = -1, best = 9;
  facts.forEach((f, i) => { const rank = (f && f.yields ? 0 : 2) + (f && f.drawn ? 0 : 1); if (rank < best) { best = rank; at = i; } });
  return at;
}
/** a toast's own facts for toastMayYield, read when it may yield: its kind at birth + every door it carries NOW (the For-you arrival
 *  toast's tap is added after showToast returns; a setting link is drawn in its words) */
const _toastYields = (t) => toastMayYield({ ...(t._toastKind || {}), action: !!(t._toastKind && t._toastKind.action) || !!t.querySelector('.global-toast-setting, .global-toast-tap') });
/** THE ONE LIST of a window's own interactive chrome that transient attention UI never stands on (lane needs-card-tail r14 —
 *  the r13 acceptance: the For-you announce's first card over Session 10's Send, the toasts above it clear of the composer):
 *  every composer, every attention strip (chat-view's `.chat-attn-dock`), a window's title-bar buttons. The global toasts
 *  (_toastAvoid) and the For-you announce (user-todos-panel.js annPlace) both stand clear of it through toastDeskSpot.
 *  B-9a64 (needs-card-tail r16's shot: an expired announce card stood over a chat's run card and its «Always…»): A TRANSCRIPT'S
 *  PRESS POINTS ARE CHROME TOO — the buttons of a permission card or a helper's ask (.chat-permission-inline: an answered one
 *  has none), the buttons of a needs card that still waits (chat-needs-card.js .cn-card.cn-open — never an answered line) and
 *  a needs card's box (its reply, kept while in use) — each press point, never the whole card (a tall card would leave no
 *  room); chromeAvoidRects takes the part of one its list's scrolled box shows, and SOFT.
 *  (The selector stays INSIDE its DOM query: test-oat-identity's census reads a `.window-` literal anywhere else as a path.) */
export const chromeAvoidEls = () => document.querySelectorAll('.chat-input-area, .chat-attn-dock, .window-controls, .chat-permission-inline button, .cn-card.cn-open button, .cn-card textarea');
/** the viewport rects of the elements `els` that show on this desktop (a window on another one is visibility:hidden); `skip(el)` ⇒ not counted */
export function avoidRects(els, skip = null) {
  const out = [];
  for (const el of els) {
    if (skip && skip(el)) continue;
    if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ visibilityProperty: true })) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight) out.push(r);
  }
  return out;
}
/** THE BOXES IN FRONT OF `el`, from what the window manager already knows — A PLACEMENT NEVER HIT-TESTS THE PAGE (lane
 *  window-close-stall; the owner's own recording, 2026-11-11: ONE close's toast placement — chromeAvoidRects probing nine points
 *  of every composer, strip and title bar in the stack's column — ran 76 document.elementsFromPoint in the click's task and 79 in
 *  the frame after, 10.8 ms EACH on a page of 20 stacked windows over 4 desktops: 970 + 922 ms, «every close stalls about a
 *  second»; kb-patterns «A placement never hit-tests the page»). In front of `el`: the windows of THIS desktop stacked above its
 *  window (each window's inline z-index — the window manager's own order; a window on another desktop is visibility:hidden) and
 *  the open floats (FRONT_FLOATS: menus, popovers, the For-you window) — above every window; among floats the later one is in
 *  front. `skip(e)` passes over one (the toasts, the announce's stack). Viewport rects. */
export const FRONT_FLOATS = '.context-menu, .taskbar-context-menu, [data-popover], #user-todos-popup';
const zOfWin = (w) => parseInt(w && w.style ? w.style.zIndex : '', 10) || 0;
const showsHere = (e) => !(typeof e.checkVisibility === 'function' && !e.checkVisibility({ visibilityProperty: true }));
export function frontRects(el, skip = () => false) {
  const out = [], take = (e) => { const r = e.getBoundingClientRect(); if (r.width > 0 && r.height > 0) out.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom }); };
  const win = typeof el.closest === 'function' ? el.closest('.window') : null;
  const floats = [...document.querySelectorAll(FRONT_FLOATS)], mine = floats.findIndex((f) => f === el || f.contains(el));
  if (mine < 0 && win) { const z = zOfWin(win); for (const w of document.querySelectorAll('.window')) if (w !== win && !w.contains(el) && zOfWin(w) > z && !skip(w) && showsHere(w)) take(w); }
  floats.forEach((f, i) => { if (i > mine && !f.contains(el) && !el.contains(f) && !(win && win.contains(f)) && !skip(f) && showsHere(f)) take(f); });
  return out;
}
/** is a point of the box [l, t, r, b] — its corners (1 px in), its middle, and with `nine` its edges' middles — clear of every
 *  box in `fronts`? (what a person sees there, read from geometry) */
export function seenAt(l, t, r, b, fronts, nine = true) {
  const xs = [l + 1, (l + r) / 2, r - 1], ys = [t + 1, (t + b) / 2, b - 1];
  const pts = nine ? xs.flatMap((x) => ys.map((y) => [x, y])) : [[xs[0], ys[0]], [xs[2], ys[0]], [xs[1], ys[1]], [xs[0], ys[2]], [xs[2], ys[2]]];
  return pts.some(([x, y]) => !fronts.some((f) => x >= f.left && x <= f.right && y >= f.top && y <= f.bottom));
}
/** THE CHROME A PERSON SEES in the column [x0, x1] (lane needs-card-tail r14 — ⑱ on fb61162f9: the composers and strips of
 *  windows COVERED by the For-you window pushed the toasts and the announce into each other, a toast over the card pressed):
 *  chromeAvoidEls' rects of which a point inside the column is clear of every box in front of it (frontRects — the windows
 *  stacked above its window, the open floats; the overlays `over(el)` passed over) — a covered window's controls are no control
 *  to keep clear of; outside the column nothing meets. NO hit test (lane window-close-stall: it was nine a control). */
export function chromeAvoidRects(x0, x1, over = () => false) {
  const out = [], fronts = new Map(), boxes = new Map(); // (the boxes in front of one window, read once a call; a list's / a message's own box, once)
  const boxOf = (e) => { if (!boxes.has(e)) boxes.set(e, e.getBoundingClientRect()); return boxes.get(e); };
  for (const el of chromeAvoidEls()) {
    if (!showsHere(el)) continue;
    // B-9a64: a transcript's press point is seen only inside its list's scrolled box (a card scrolled out of it is no obstacle);
    // its MESSAGE's box is read first — a message outside the list's box is skipped before a rect inside it is asked for
    // (chat.css: a .chat-msg is content-visibility: auto — a rect read inside an off-screen one would lay it out)
    const list = typeof el.closest === 'function' ? el.closest('.chat-message-list') : null, c = list ? boxOf(list) : null;
    const msg = list ? el.closest('.chat-msg') : null, m = msg ? boxOf(msg) : null;
    if (m && c && (m.bottom <= c.top || m.top >= c.bottom || m.right <= x0 || m.left >= x1)) continue;
    const b = el.getBoundingClientRect(), cb = c || b;
    const r = { left: Math.max(b.left, cb.left), right: Math.min(b.right, cb.right), top: Math.max(b.top, cb.top), bottom: Math.min(b.bottom, cb.bottom) };
    r.width = r.right - r.left; r.height = r.bottom - r.top;
    if (!(r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight) || r.right <= x0 || r.left >= x1) continue;
    const win = typeof el.closest === 'function' ? el.closest('.window') : null;
    if (!fronts.has(win)) fronts.set(win, frontRects(el, over));
    if (!seenAt(Math.max(r.left, x0), r.top, Math.min(r.right, x1), r.bottom, fronts.get(win))) continue;
    // a title bar's buttons are SOFT: they give way first when there is no room clear of everything (toastDeskSpot); B-9a64: so
    // is a transcript's press point (the transcript scrolls — never the composer or the strip given up for it)
    out.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom, soft: !!el.classList?.contains('window-controls') || !!list });
  }
  return out;
}
/** what the desktop tier's stack must not stand on: every open menu / float, THE window chrome it would meet (chromeAvoidRects in
 *  its own column) and the For-you announce's stack (`.ut-announce`, no popover since lane needs-card-tail r11) — viewport px.
 *  (THE OPEN For-you panel has its own step after these — _placeDeskToasts, B-7a51: a tall obstacle in this list would send a stack
 *  that cannot clear it back to its own place, onto a composer it used to rise above.) */
function _toastAvoid(sr = null) { // (`sr`: the stack's rect its placement already read)
  if (!sr) { const st = document.getElementById('global-toasts'); sr = st ? st.getBoundingClientRect() : null; }
  return [...avoidRects(document.querySelectorAll('.context-menu, .taskbar-context-menu, [data-popover], .ut-announce'), (el) => el.id === 'global-toasts' || !!el.closest('#global-toasts')),
    ...chromeAvoidRects(sr ? sr.left : 0, sr ? sr.right : window.innerWidth, (e) => !!e.closest?.('#global-toasts, .ut-announce'))];
}
/** r14: the For-you announce MOVED (its placement follows the window chrome now) — the toasts placed clear of it ask again */
export function placeToastsSoon() { _queueToastPlace(); }
/** THE STACK'S OWN PLACE: beside the inbox button when it shows (customize mode can move it to any bar; a phone hides it ⇒
 *  the centred strip). Re-asked by the desktop tier's placement before it measures (lane desktop-small fence ⑨). */
function _anchorToastStack(stack) {
  const anchor = _toastCfg.getAnchor?.();
  const r = anchor && anchor.offsetParent ? anchor.getBoundingClientRect() : null;
  if (r) {
    stack.classList.add('gt-anchored');
    stack.style.left = 'auto';
    stack.style.transform = 'none';
    const Z = uiScale(); // viewport→layout px (F2)
    stack.style.right = (Math.max(8, window.innerWidth - r.right) / Z) + 'px';
    if (r.top > window.innerHeight / 2) { stack.style.bottom = ((window.innerHeight - r.top + 8) / Z) + 'px'; stack.style.top = 'auto'; }
    else { stack.style.top = ((r.bottom + 8) / Z) + 'px'; stack.style.bottom = 'auto'; }
  } else {
    stack.classList.remove('gt-anchored');
    stack.style.left = ''; stack.style.right = ''; stack.style.top = ''; stack.style.bottom = ''; stack.style.transform = '';
  }
}
/** the desktop tier: its own place, then off any open menu / composer (PURE toastDeskSpot); a menu opened later is a <body>
 *  child, so the watch re-places it */
function _placeDeskToasts(stack) {
  _anchorToastStack(stack);
  const tb = document.getElementById('toolbar'), tr = tb ? tb.getBoundingClientRect() : null;
  const rect = stack.getBoundingClientRect();
  const desk = toastDeskSpot({ rect, avoid: _toastAvoid(rect), topY: tr && tr.height ? tr.bottom : 0, vh: window.innerHeight, scale: uiScale() });
  if (desk) { stack.style.top = 'auto'; stack.style.bottom = desk.bottom + 'px'; }
  // B-7a51 — THE OPEN FOR-YOU PANEL IS NO PLACE FOR A TOAST (K41: an Undo over «… more — expand», the press outside the panel closed
  // it). A stack that still meets the open panel: ABOVE it, clear of everything else too, when there is room; else BESIDE it — its
  // left, else its right (toastBesidePanel) — and off whatever stands there; else its PLAIN toasts yield (toastMayYield): HELD, not
  // drawn and their time not running, drawn again with their time WHOLE at the first placement that has room (_placeToastStack);
  // an error, an action toast and a pinned notice never yield — placed clear when the smaller stack now fits, else over the
  // panel's edge. The panel's open, close and growth re-place the stack. A stack that meets no panel is placed exactly as before.
  const fy = document.getElementById('user-todos-popup');
  const fr = fy && !fy.classList.contains('hidden') && fy.getClientRects().length ? fy.getBoundingClientRect() : null;
  const onPanel = (r) => r.left < fr.right && r.right > fr.left && r.top < fr.bottom && r.bottom > fr.top;
  if (fr && onPanel(stack.getBoundingClientRect())) {
    const topY = tr && tr.height ? tr.bottom : 0;
    const clear = () => {
      const r2 = stack.getBoundingClientRect();
      const up = toastDeskSpot({ rect: r2, avoid: [..._toastAvoid(r2), fr], topY, vh: window.innerHeight, scale: uiScale() });   // (meeting the panel, null = no room)
      if (up) { stack.style.top = 'auto'; stack.style.bottom = up.bottom + 'px'; return true; }
      const beside = toastBesidePanel({ rect: r2, panel: fr, vw: window.innerWidth, scale: uiScale() });
      if (!beside) return false;
      stack.style.transform = 'none';
      if (beside.right != null) { stack.style.left = 'auto'; stack.style.right = beside.right + 'px'; } else { stack.style.right = 'auto'; stack.style.left = beside.left + 'px'; }
      const r3 = stack.getBoundingClientRect(), there = toastDeskSpot({ rect: r3, avoid: [..._toastAvoid(r3), fr], topY, vh: window.innerHeight, scale: uiScale() });
      if (there) { stack.style.top = 'auto'; stack.style.bottom = there.bottom + 'px'; }
      return true;
    };
    if (!clear()) {
      for (const t of stack.children) if (_toastYields(t)) _toastHold(t);
      if ([...stack.children].some((t) => !t.classList.contains('global-toast-held')) && onPanel(stack.getBoundingClientRect()) && !clear()) {
        // nothing fits: what stays stands OVER THE PANEL'S EDGE — against the viewport's edge away from the panel, the least of the
        // panel under it (its anchored place would cover the panel's lowest rows: K41's band bar)
        stack.style.transform = 'none';
        if (fr.left + fr.right > window.innerWidth) { stack.style.right = 'auto'; stack.style.left = (8 / uiScale()) + 'px'; }
        else { stack.style.left = 'auto'; stack.style.right = (8 / uiScale()) + 'px'; }
      }
    }
  }
  if (!_toastWatch) { _toastWatch = new MutationObserver(_queueToastPlace); _toastWatch.observe(document.body, { childList: true }); }
  _toastWatch.observe(stack, { childList: true });
  // …and the panel opening or closing (a persistent element: its class and its place change, never the body's children) or GROWING
  // from its content (a band opened, rows arrived — its round's MUST) re-places it
  if (fy) _toastWatch.observe(fy, { attributes: true, attributeFilter: ['class', 'style'] });
  if (fy && !_toastPanelSize && typeof ResizeObserver === 'function') { _toastPanelSize = new ResizeObserver(_queueToastPlace); _toastPanelSize.observe(fy); }
}
const _toastTier = () => { try { return matchMedia(VC_PHONE_MEDIA).matches || isTouchDevice(); } catch { return false; } }; // int355: the phone paths' ONE media list (duo-build-1's law, test-viewport-class)
/** the dialog of the topmost open app modal (createModalShell's overlay or the static #dialog-overlay), else null */
function _openModalDialog() {
  const ovs = [...document.querySelectorAll(SHEET_ROOTS)].filter((o) => !o.classList.contains('hidden') && o.getClientRects().length); // (a form's WINDOW is no modal: toasts stand clear of a sheet only)
  const ov = ovs[ovs.length - 1];
  return ov ? [...ov.children].find((d) => d.classList.contains('dialog') && !d.classList.contains('hidden') && d.getClientRects().length) || null : null;
}
/** the highest composer on screen (a chat window's .chat-input-area) — or the attention strip standing on it (lane needs-card-tail
 *  r14: the phone's toasts stood over the strip's answers — the one avoid list's rule on this tier too), viewport px; null when none shows */
function _composerTop() {
  let top = null;
  for (const el of document.querySelectorAll('.chat-input-area, .chat-attn-dock')) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || r.bottom <= 0 || r.top >= window.innerHeight) continue;
    if (top === null || r.top < top) top = r.top;
  }
  return top;
}
let _toastWatch = null, _toastPlaceQueued = false, _toastPanelSize = null;
const _queueToastPlace = () => {
  if (_toastPlaceQueued) return;
  _toastPlaceQueued = true;
  const frame = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (f) => setTimeout(f, 16);
  frame(() => { _toastPlaceQueued = false; _placeToastStack(); });
};
/** Put the stack where toastSpot says; re-run (one frame later) whenever a toast comes or goes, a modal opens or closes
 *  (a shell overlay added to / removed from <body>, the static #dialog-overlay's classes) or the viewport resizes.
 *  A placement that cannot run (a page without the DOM it reads) leaves the stack where the stylesheet put it. */
function _placeToastStack() {
  // B-7a51: a HELD toast is measured with the stack (not drawn yet, its time still stopped); one this placement no longer holds is
  // drawn again and its time starts WHOLE (_toastShow)
  const stack = document.getElementById('global-toasts');
  const held = stack ? [...stack.children].filter((t) => t.classList.contains('global-toast-held')) : [];
  for (const t of held) t.classList.remove('global-toast-held');
  try { _placeToastStackNow(); } catch { /* the toast still shows — in the stylesheet's place */ }
  for (const t of held) if (t.isConnected && !t.classList.contains('global-toast-held')) _toastShow(t);
}
function _placeToastStackNow() {
  const stack = document.getElementById('global-toasts');
  const shown = !!stack && stack.isConnected && stack.children.length > 0;
  const live = shown && !stack.classList.contains('gt-anchored');
  const dlg = live ? _openModalDialog() : null;
  const spot = live ? toastSpot({ tier: _toastTier(), modal: !!dlg, composerTop: dlg ? null : _composerTop(), vh: window.innerHeight, scale: uiScale() }) : null;
  let room = spot && spot.room ? dlg.querySelector(':scope > .gt-room') : null;
  for (const r of document.querySelectorAll('.gt-room')) if (r !== room) r.remove();
  if (!live || !spot) {
    if (live) { stack.style.top = ''; stack.style.bottom = ''; }
    // the desktop tier, anchored or centred (lane desktop-small fence ⑨): never on an open menu or a composer
    if (shown && !_toastTier() && !_openModalDialog()) { _placeDeskToasts(stack); return; }
    if (!live && _toastWatch) { _toastWatch.disconnect(); _toastWatch = null; }
    return;
  }
  if (!_toastWatch) {
    _toastWatch = new MutationObserver(_queueToastPlace);
    _toastWatch.observe(document.body, { childList: true });
    const st = document.getElementById('dialog-overlay');
    if (st) _toastWatch.observe(st, { attributes: true, attributeFilter: ['class'], subtree: true });
  }
  _toastWatch.observe(stack, { childList: true });
  if (spot.room) {
    if (!room) {
      room = document.createElement('div');
      room.className = 'gt-room';
      room.setAttribute('aria-hidden', 'true');
      const head = dlg.querySelector(':scope > .dialog-header, :scope > .ns-head');
      if (head) head.after(room); else dlg.prepend(room);
    }
    room.style.height = (stack.offsetHeight + 12) + 'px';   // layout px, like offsetHeight
    stack.style.bottom = 'auto';
    stack.style.top = ((room.getBoundingClientRect().top + 6) / uiScale()) + 'px';
    return;
  }
  stack.style.top = '';
  stack.style.bottom = spot.bottom + 'px';
}
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') window.addEventListener('resize', () => { if (document.getElementById('global-toasts')) _queueToastPlace(); });
// WORDS A PERSON TYPED (lane think-tools-phone — the stale page's law): the mark lives in PURE src/lib/stale-watch.js, re-exported here
// for every box's owner (markTyped / carryUnsaved at a carry, markLanded / markLandedOnSave only where a save PROVED a success)
export { markTyped, markLanded, markLandedOnSave, carryUnsaved, wasTyped } from './stale-watch.js';
// `action: { label, run }` (split UX R5, 2026-09-23) = ONE button inside the
// toast (Undo / Show side by side): a click runs it and dismisses the toast; an
// action toast lives 5 s unless the user's toast-seconds setting says otherwise.
// lane dialog-unsaved-guard: while an unsaved sheet's Save runs, an error the dialog's own save says (a toast) is ALSO the
// sheet's reason — «Not saved: <the same words>» stays beside the choices after the toast fades
let unsavedSaySink = null;
// A DOOR TO ONE SETTING IN A TOAST (lane setting-doors pick 1): the app registers `{ has, open }` at boot — `has` = the
// client's schema test (settings-schema isSettingKey), `open` = THE door (app.openSettingAt). A toast's words then draw each
// `vibespace://settings/<key>` naming a KNOWN row as a button holding the link's own words (textContent): a press opens
// Settings on that row and closes the toast; every other word stays textContent, and the body's text is the message as
// before. Nothing registered (a page without the app, a suite) ⇒ a toast is exactly as it was. A link opens, never writes.
let _settingLinks = null;
export function registerSettingLinks(door) {
  _settingLinks = door && typeof door.has === 'function' && typeof door.open === 'function' ? { has: door.has, open: door.open } : null;
}
/** A toast body's words (showToast): text nodes + one `.global-toast-setting` button per known setting link — never HTML.
 *  `close` dismisses the toast. Returns the number of links drawn (0 ⇒ `body.textContent = message`, as before). */
export function toastWordsInto(body, message, close = () => {}) {
  const door = _settingLinks;
  const segs = door && typeof message === 'string' && hasSettingScheme(message) ? splitSettingLinks(message, door.has) : null;
  if (!segs || !segs.some((g) => g.key)) { body.textContent = message; return 0; }
  body.textContent = '';
  let made = 0;
  for (const g of segs) {
    if (!g.key) { body.append(document.createTextNode(g.text)); continue; }
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'global-toast-setting';
    b.dataset.setting = g.key;
    b.title = t('Open in Settings');
    b.textContent = g.text;
    const key = g.key;
    b.onclick = (e) => { e.stopPropagation(); close(); try { (_settingLinks || door).open(key); } catch (err) { console.warn('setting link failed', err); } };
    body.append(b); made++;
  }
  return made;
}
// `icon` (lane phone-refusal-wrap) = an SVG string of OURS (a module constant — never words) drawn before the words: a
// toast that names a control shows the control's own icon (UI convention: SVG, no emoji)
export function showToast(message, { type = 'info', duration, action, actions, history = null, icon = '', pinned = false, timed = false } = {}) {
  if (unsavedSaySink && type === 'error') unsavedSaySink.push(String(message));
  let stack = document.getElementById('global-toasts');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'global-toasts';
    document.body.appendChild(stack);
  }
  // Anchor next to the inbox button when it's visible (customize mode can
  // move it to any bar; mobile hides it → fall back to the centered strip).
  _anchorToastStack(stack);
  const el = document.createElement('div');
  // EVERY REMOVAL CLEARS ITS TIME (B-7a51 round 4): its ✕, an action, a setting link, the For-you tap, the cap's drop and an OWNER's
  // withdrawal (`.remove()` on the toast this returns) all end here — a timer (its time, its fade) never fires on a detached toast
  const detach = el.remove.bind(el);
  el.remove = () => { clearTimeout(el._toastTimer); el._toastTimer = null; detach(); };
  el.className = `global-toast global-toast-${type}` + (pinned ? ' global-toast-pinned' : '');   // pinned: until its ✕ or its owner takes it away (no timer; the cap never drops it)
  const body = document.createElement('div');
  body.className = 'global-toast-body';
  toastWordsInto(body, message, () => { el.remove(); if (!stack.children.length) stack.remove(); });   // lane setting-doors pick 1: a known setting link is a button; the rest textContent
  const x = document.createElement('button');
  x.className = 'global-toast-x';
  x.setAttribute('aria-label', 'Dismiss');
  x.textContent = '✕';
  x.onclick = (e) => { e.stopPropagation(); el.remove(); if (!stack.children.length) stack.remove(); };
  if (icon) { const ic = document.createElement('span'); ic.className = 'global-toast-icon'; ic.innerHTML = String(icon); el.append(ic); }
  el.append(body);
  // `action` = one button; `actions` = several, in order (split tabs v2: Undo · Unsplit) — each runs once and closes the toast
  const acts = (Array.isArray(actions) ? actions : action ? [action] : []).filter((a) => a && typeof a.run === 'function');
  for (const a of acts) {
    const act = document.createElement('button');
    act.className = 'global-toast-action';
    act.textContent = String(a.label || '');
    act.onclick = (e) => { e.stopPropagation(); el.remove(); if (!stack.children.length) stack.remove(); try { a.run(); } catch (err) { console.warn('toast action failed', err); } };
    el.appendChild(act);
  }
  el.append(x);
  stack.appendChild(el);
  el._toastKey = _recordToast(history && typeof history.m === 'string' ? history.m : message, type, history && history.ref);   // a record's toast keeps its head + a ref, never its words (above)
  el._toastRef = history && history.ref && history.ref.kind && history.ref.id ? history.ref : null;
  el._toastKind = { type, action: acts.length > 0, pinned, timed: !!timed };   // B-7a51: may it yield to the open For-you panel (toastMayYield)
  // Cap the stack so a burst of errors doesn't fill the screen
  // THE CAP (B-7a51 round 3 — toastCapPick): the toast being born is never the one dropped, nor a PINNED notice (the stale page's);
  // one that may yield goes before one that may not; one dropped never drawn keeps its history line unseen
  for (let k = stack.children.length; k > 4; k--) {
    const others = [...stack.children].filter((c) => c !== el && !c.classList.contains('global-toast-pinned'));
    const at = toastCapPick(others.map((c) => ({ yields: _toastYields(c), drawn: !!c._toastDrawn })));
    if (at < 0) break;
    const drop = others[at];
    if (!drop._toastDrawn && drop._toastKey) _markToastSeen(drop._toastKey, false);
    drop.remove();
  }   // a PINNED notice (the stale page's) is never the one dropped
  const secs = Number(_toastCfg.getSeconds?.());
  const ttl = duration ?? (secs > 0 ? secs * 1000 : (type === 'error' ? 6000 : (acts.length ? 5000 : 3000)));
  el._toastTtl = pinned ? 0 : ttl;   // pinned: no time at all
  _placeToastStack(); _queueToastPlace();   // P2-1: off the phone composer / an open modal's rows — now, and once the act that showed it is done
  if (!el.classList.contains('global-toast-held')) { _toastRun(el); _markDrawn(el); }   // (held at its birth: its time waits until it is drawn)
  el._toastBorn = true;
  return el;
}
/** B-7a51 — A TOAST'S TIME RUNS ONLY WHILE IT CAN BE SEEN (its round's MUST: a stack hidden for the open For-you panel let the
 *  panel's own error and every «Marked done · Undo» expire unseen, and the history called them seen). _toastRun starts its time
 *  (once); _toastHold takes it off the screen and stops its time — held at its BIRTH it was not seen then: its history entry
 *  loses `seen` and is judged again, by the same verdict (toastSeenAtShow), when it is first drawn; _toastShow draws it and starts
 *  its time WHOLE. `_toastDrawn` remembers that the person has had it on screen (the cap reads it: toastCapPick). */
function _toastRun(el) {
  if (!el._toastTtl || el._toastTimer) return;
  el._toastTimer = setTimeout(() => {
    el.classList.add('global-toast-out');
    el._toastTimer = setTimeout(() => { el._toastTimer = null; const st = el.parentNode; el.remove(); if (st && !st.children.length) st.remove(); }, 250);   // the fade is its time too: a removal or a hold clears it
  }, el._toastTtl);
}
/** B-7a51 round 4 — FIVE ERRORS AT ONCE: a toast is DRAWN for the cap (seen on screen) only once a frame has painted it unheld — one
 *  dropped in the very turn it was born (the fifth of a burst) never reached the screen: its history line stays unseen */
function _markDrawn(el) {
  const frame = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (f) => setTimeout(f, 16);
  frame(() => { if (el.isConnected && !el.classList.contains('global-toast-held')) el._toastDrawn = true; });
}
function _toastHold(el) {
  clearTimeout(el._toastTimer); el._toastTimer = null;
  el.classList.add('global-toast-held');
  if (!el._toastBorn && el._toastKey) { el._toastJudge = true; _markToastSeen(el._toastKey, false); }
  el.classList.remove('global-toast-out');   // held in its fade: drawn again whole, not faded
}
function _toastShow(el) {
  el.classList.remove('global-toast-held');
  _toastRun(el);
  _markDrawn(el);
  if (el._toastJudge) { el._toastJudge = false; if (_seenAtShow(el._toastRef)) _markToastSeen(el._toastKey, true); }
}
/** the history entry of a toast (its key: the entry's record time + its words) marked seen / not seen — the B-3f5d field, nothing
 *  else changes */
function _markToastSeen(key, seen) {
  try {
    const h = getToastHistory();
    const e = key ? h.find((x) => x && x.ts === key.ts && x.m === key.m) : null;
    if (!e || !!e.seen === seen) return;
    if (seen) e.seen = true; else delete e.seen;
    _putToastHistory(h);
    window.dispatchEvent(new CustomEvent('vs-toast'));
  } catch {}
}

const _uploadName = (f) => f._relPath || f.webkitRelativePath || f.name;

// Resilient multipart upload to /api/upload. A folder upload used to go up as
// ONE giant request, so a single file the browser can't read (permission /
// special file / dead symlink — common in macOS project dirs) failed the WHOLE
// thing with net::ERR_ACCESS_DENIED. This chunks the files and, when a chunk
// fails, retries it FILE-BY-FILE so the readable files still land and only the
// bad ones are reported. Returns { uploaded:[{name,path,size}], failed:[{name,error}] }.
/**
 * Recurse a drop's DataTransfer into a flat File list. Directories are walked
 * via webkitGetAsEntry/readEntries (looped — one readEntries call returns at
 * most 100 entries); each file gets `_relPath` ("dir/sub/name") so uploads can
 * recreate the tree. MUST be CALLED synchronously from the drop handler: the
 * entries are grabbed before the first await (DataTransferItems are neutered
 * once the handler yields). Falls back to the flat files list when the
 * entries API is unavailable.
 */
export async function collectDroppedFiles(dt) {
  const entries = Array.from(dt.items || []).map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
  if (!entries.length) return Array.from(dt.files || []);
  const out = [];
  const walk = async (entry, prefix) => {
    if (entry.isFile) {
      const file = await new Promise((res, rej) => entry.file(res, rej));
      try { file._relPath = prefix + entry.name; } catch {}
      out.push(file);
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const readBatch = () => new Promise((res, rej) => reader.readEntries(res, rej));
      let batch;
      do { batch = await readBatch(); for (const e of batch) await walk(e, prefix + entry.name + '/'); } while (batch.length);
    }
  };
  for (const entry of entries) await walk(entry, '');
  return out;
}

export async function uploadFilesBatched(files, { destDir, preservePaths, onProgress, host, sessionId = '' , uploadDirSet = false} = {}) {
  const list = (files || []).filter(Boolean);
  const CHUNK_FILES = 40, CHUNK_BYTES = 64 * 1024 * 1024;
  const chunks = [];
  let cur = [], curBytes = 0;
  for (const f of list) {
    if (cur.length && (cur.length >= CHUNK_FILES || curBytes + (f.size || 0) > CHUNK_BYTES)) { chunks.push(cur); cur = []; curBytes = 0; }
    cur.push(f); curBytes += f.size || 0;
  }
  if (cur.length) chunks.push(cur);

  const postChunk = async (chunkFiles) => {
    const fd = new FormData();
    const names = [];
    for (const f of chunkFiles) { fd.append('files', f); names.push(_uploadName(f)); }
    fd.append('destDir', destDir);
    fd.append('fileNames', JSON.stringify(names));
    if (sessionId) fd.append('sessionId', sessionId); // lane artifacts-registries: the composer's chat ⇒ the files are its `upload` rows
    if (uploadDirSet) fd.append('uploadDirSet', '1'); // lane chat-attachments-persist: chat.uploadDir is set ⇒ the server never moves the files
    if (preservePaths || names.some((n) => n.includes('/'))) fd.append('preservePaths', '1');
    // Remote sessions: route the upload to the host so destDir resolves on the
    // remote (and its ~ is the remote home) — without ?host= a remote-session
    // upload silently landed on the LOCAL server (review finding).
    const url = host ? `/api/upload?host=${encodeURIComponent(host)}` : '/api/upload';
    const res = await fetch(url, { method: 'POST', body: fd });
    const data = await res.json().catch(() => ({}));
    // row B-422c (r3507): a refusal at file k says what LANDED before it (the server's `landed`, files 1..k−1 in order) — kept as uploaded
    const landedOf = () => (Array.isArray(data.landed) ? data.landed.map((f) => (data.keptWithConversation ? { ...f, keptFrom: data.keptFrom || '', keptDir: data.dir || '' } : f)) : []);
    if (!res.ok || data.success === false) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), data.code ? { code: data.code, params: data.params } : {}, { landed: landedOf(), landedOf: typeof data.landedOf === 'number' ? data.landedOf : null });   // B-3b03 follow-up: a refusal by name keeps its code
    // lane chat-attachments-persist: the server kept them with the conversation (a temporary cwd) — each file says where from
    return (data.files || []).map((f) => (data.keptWithConversation ? { ...f, keptFrom: data.keptFrom || '', keptDir: data.dir || '' } : f));
  };

  const uploaded = [], failed = [];
  const _t0 = performance.now();
  const _totalBytes = list.reduce((s2, f) => s2 + (f.size || 0), 0);
  let done = 0;
  for (const chunk of chunks) {
    try {
      uploaded.push(...await postChunk(chunk));
    } catch (e) {
      if (chunk.length === 1) {
        failed.push({ name: _uploadName(chunk[0]), error: e.message, ...(e.code ? { code: e.code, params: e.params } : {}) });
      } else {
        // Isolate the unreadable file(s): retry each on its own — but never a file that already LANDED before the refusal (B-422c: on
        // the kept road a second post would place it again as «name (1)»); a page loaded before the server said `landed` retries all.
        // Line 834's round: the landed list is taken only when it is shorter than the chunk and the reply counted THIS chunk
        // (`landedOf`); any other answer retries the whole chunk, as before
        const landed = Array.isArray(e.landed) && e.landed.length < chunk.length && e.landedOf === chunk.length ? e.landed : [];
        uploaded.push(...landed);
        for (const f of chunk.slice(landed.length)) {
          try { uploaded.push(...await postChunk([f])); }
          catch (e2) { failed.push({ name: _uploadName(f), error: e2.message, ...(e2.code ? { code: e2.code, params: e2.params } : {}) }); }
        }
      }
    }
    done += chunk.length;
    onProgress?.(done, list.length);
  }
  const _dt = (performance.now() - _t0) / 1000;
  if (_dt > 0.5 && _totalBytes > 1048576) metric('upload-mbps', (_totalBytes / 1048576) / _dt);
  return { uploaded, failed };
}
// Front-truncate a path-like string: keep the END (the meaningful filename),
// drop the front with a leading ellipsis. Used for window/taskbar titles so a
// CSS end-ellipsis doesn't hide the filename. e.g. "…/deep/dir/file.js".
export function frontTruncate(str, maxLen = 40) {
  const s = String(str ?? '');
  return s.length > maxLen ? '…' + s.slice(-(maxLen - 1)) : s;
}
// Escapes quotes too — safe in BOTH text and attribute contexts (the old
// textContent/innerHTML round-trip left " and ' unescaped, allowing attribute
// breakout in `attr="${escHtml(x)}"` template patterns).
const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function escHtml(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ESC_MAP[c]); }

// The sidebar merge composes a remote webui session's cwd as the DISPLAY/
// grouping string "<host name>: /real/path" (sidebar.js _merge — it is a
// load-bearing folder-grouping/archivedFolders KEY, so the composer stays).
// That string leaked into openSpecs (persisted in layouts) and from there into
// operations: a resume `cd`'d into the literal label, fell back to $HOME, and
// claude said "No conversation found" (real incident, userL's h200 session).
// Strip the label iff the remainder is an absolute/home path; server-side
// twin in ws-handler heals already-persisted polluted specs.
export function stripCwdHostLabel(cwd) {
  if (typeof cwd !== 'string') return cwd;
  const m = cwd.match(/^[^/~]+: (?=[/~])/);
  return m ? cwd.slice(m[0].length) : cwd;
}

// ── THE ONE OUTSIDE-PRESS CLOSER (lane M, inc-muhms5kt-0ejl) ──
// Every floating menu / popover / flyout / popup closes through this. It
// listens on document for `pointerdown` in the CAPTURE phase — the first thing
// a press dispatches, before any element on its path runs — because an app's
// picture (xpra-view.js's pane, noVNC's canvas) cancels its pointerdown, and a
// cancelled pointerdown SUPPRESSES the compatibility `mousedown` in every phase:
// the old document `mousedown` closers never saw a press into the picture and
// the menu stayed open over the app (the incident). The listeners are PASSIVE
// and call neither preventDefault nor stopPropagation — the press still reaches
// the app. The decision is PURE (src/lib/outside-press.js, tabled by
// scripts/test-outside-press.mjs): inside the root / an `exclude` element / the
// `ignore(target)` rule / a nested [data-popover] (when `nested`) keeps it
// open; a mouse press counts at pointerdown, a touch / pen press only as a TAP
// (a scroll, drag or long-press never closes). Escape stays the [data-popover]
// protocol (app.js's global handler removes the tagged surface); a surface
// removed by other means retires its closer on the next press without calling
// `close` (`root-gone`). It arms SYNCHRONOUSLY: a press that BEGAN before it
// was armed (event timeStamp < the arming instant) is the one that opened the
// surface, never an outside press of it (`opening`) — the old setTimeout(0)
// deferral was starved on a busy page (Chrome dispatches input ahead of timer
// tasks; measured on the real xpra rung: the click into the picture arrived
// before the deferred closer existed and the menu stayed open).
//   const dispose = onOutsidePress(pop, () => pop.remove(), { exclude: [anchor] });
// opts: exclude (elements), ignore(target) → true keeps it open, nested (default
// true: the chained-popover rule), once (default true: retire after closing;
// false for a PERSISTENT popup that closes by class), signal (AbortSignal —
// window-scoped surfaces pass winInfo._listenerCtl.signal), selection (default
// = once: a TRANSIENT surface on a touch device also closes when a text
// selection starts OUTSIDE it — lane mobile-select M2, PURE selectionCloses in
// press-select.js; a persistent popup is armed for the app's life and opts out).
// A PRESS INTO A FRAME closes it too (lane menu-close-residue, B-5bd5 ①): a
// press inside an <iframe> (a Web view, a plugin window, the mail frame, a
// Design artboard) is dispatched in the frame's own document and never reaches
// this document's pointerdown — the one signal the parent gets is `window`
// blur, with document.activeElement already the frame and document.hasFocus()
// still true (measured; a blur to another top-level window leaves the active
// element where it was, hasFocus() false). PURE shouldCloseOnBlur decides: a
// frame inside the surface or its excludes keeps it open. Nothing per site.
export function onOutsidePress(root, close, { exclude = [], ignore = null, nested = true, once = true, signal = null, selection = once } = {}) {
  const roots = (Array.isArray(root) ? root : [root]).filter(Boolean);
  const ctl = new AbortController();
  const dispose = () => ctl.abort();
  if (signal) {
    if (signal.aborted) return dispose;
    signal.addEventListener('abort', dispose, { once: true, signal: ctl.signal });
  }
  const within = (els, target) => els.some((el) => !!el && typeof el.contains === 'function' && el.contains(target));
  // event timeStamps and performance.now() share the time origin; a press stamped before this instant began before the
  // surface existed
  const armedAt = typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : 0;
  const began = (e) => (Number.isFinite(e.timeStamp) && e.timeStamp < armedAt ? 'before' : 'after');
  // WHERE the press went down, measured WHEN it went down (lane phone-tray-voice-done, inc-mvhzgiq8-bs3j): a touch is decided
  // at its pointerup, and a repaint between the two may take the target out of the page — the recording microphone redraws
  // its capsule four times a second, so a finger held on 「● 0:02」 across one redraw went down on a span that was gone at
  // the lift: inside nothing, it read as an OUTSIDE press, and the phone's For-you tray closed under the reply it dictated
  const where = (target, e) => ({
    inRoot: within(roots, target),
    excluded: within(exclude, target),
    ignored: !!(ignore && ignore(target, e)),
    voice: !!target?.closest?.(VOICE_UI),
    inNestedPopover: !!target?.closest?.('[data-popover]'),
  });
  const judge = (at, e, opening = false) => {
    const v = pressCloses({ connected: roots.some((r) => r.isConnected !== false), opening, ...at, nested });
    if (v.retire) { dispose(); return; }
    if (!v.close) return;
    if (once) dispose();
    close(e);
  };
  let pending = null; // a touch / pen press waiting to become a tap
  const o = { capture: true, passive: true, signal: ctl.signal };
  document.addEventListener('pointerdown', (e) => {
    const opening = began(e) === 'before';
    if (pressPhase(e.pointerType) === 'down') { pending = null; judge(where(e.target, e), e, opening); return; }
    pending = opening ? null : { id: e.pointerId, x: e.clientX, y: e.clientY, at: e.timeStamp, seen: where(e.target, e) };
  }, o);
  document.addEventListener('pointerup', (e) => {
    const p = pending;
    if (!p || p.id !== e.pointerId) return;
    pending = null;
    // the press is judged where it went DOWN, as it stood then (a captured pointer's pointerup targets the capturing element;
    // the down target may have left the page since — see `where`)
    if (tapVerdict({ dx: e.clientX - p.x, dy: e.clientY - p.y, heldMs: e.timeStamp - p.at })) judge(p.seen, e);
  }, o);
  document.addEventListener('pointercancel', (e) => { if (pending && pending.id === e.pointerId) pending = null; }, o);
  // A PRESS INTO A FRAME IS AN OUTSIDE PRESS (lane menu-close-residue, B-5bd5 ①): the frame's document takes the press,
  // the parent sees only `window` blur — judged by PURE shouldCloseOnBlur over document.activeElement (already the frame
  // at the blur) and document.hasFocus() (true: the focus went into a frame of THIS page; a blur to another window or
  // the devtools reads false and leaves activeElement where it was). Same dispose, same `once`, same ignore rule.
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('blur', (e) => {
      const active = document.activeElement || null;
      const v = shouldCloseOnBlur({
        active, el: roots, excludes: exclude,
        pageFocused: typeof document.hasFocus === 'function' ? document.hasFocus() : true,
        ignored: !!(ignore && active && ignore(active, e)),
        connected: roots.some((r) => r.isConnected !== false),
      });
      if (v.retire) { dispose(); return; }
      if (!v.close) return;
      if (once) dispose();
      close(e);
    }, { signal: ctl.signal });
  }
  // A SELECTION THAT STARTS OUTSIDE THE SURFACE WINS (lane mobile-select M2). On a phone a long press elsewhere is
  // never an outside TAP, so a menu stayed open while the platform's selection began beside or under it — the next
  // move of the finger landed on the menu's words. Touch only (a mouse selection begins with a press that already
  // closed it); the selection the surface opened with (a word the opening press selected) never closes it.
  if (selection && isTouchDevice() && typeof document.getSelection === 'function') {
    const s0 = document.getSelection();
    const atOpen = s0 ? [s0.anchorNode, s0.anchorOffset, s0.focusNode, s0.focusOffset] : null;
    document.addEventListener('selectionchange', () => {
      const sel = document.getSelection();
      const v = selectionCloses({
        connected: roots.some((r) => r.isConnected !== false),
        touch: true,
        collapsed: !sel || sel.rangeCount === 0 || sel.isCollapsed,
        textAnchor: !!sel?.anchorNode && sel.anchorNode.nodeType === 3,
        anchorInRoot: !!sel?.anchorNode && within(roots, sel.anchorNode),
        sameAsOpen: !!sel && !!atOpen && sel.anchorNode === atOpen[0] && sel.anchorOffset === atOpen[1] && sel.focusNode === atOpen[2] && sel.focusOffset === atOpen[3],
      });
      if (v.retire) { dispose(); return; }
      if (!v.close) return;
      if (once) dispose();
      close();
    }, { signal: ctl.signal });
  }
  return dispose;
}

/** A touch device — the very media query app.isTouch reads (app.js), so the door, the closer and the App agree. */
export function isTouchDevice() {
  try { return typeof matchMedia === 'function' && matchMedia('(hover: none) and (pointer: coarse)').matches; } catch { return false; }
}

/** The popover closer every createPopover / showContextMenu / hand-built menu uses: an outside press removes it. A
 *  popover spawned FROM this one (a context menu on a list row, a submenu flyout) is a child interaction — a press in
 *  it (any [data-popover]) does not dismiss this one; opening a popover from regular UI still closes this one (that
 *  press lands outside any [data-popover]). Returns the dispose function.
 *  The popover OWNS its closer (lane K verify r1 — the hover chooser opens and closes with ZERO presses, and each cycle
 *  used to leave a listener holding its detached popover): `popover._closeCtl.abort()` disposes it (an owner whose
 *  popover can go by another path — a leave timer, Esc, a row — calls it in its own cleanup; a closer whose popover is
 *  already gone retires itself on the next press, `root-gone`), and `popover._closeExclude` is the LIVE exclusion list
 *  (the very array the helper reads at every press): an owner that rebuilds its anchor pushes the new one (the taskbar
 *  chooser's re-anchor — a rebuilt button's press is never "a press elsewhere"). */
export function attachPopoverClose(popover, ...excludeEls) {
  popover._closeExclude = excludeEls; // LIVE: onOutsidePress reads this array at every press
  const dispose = onOutsidePress(popover, () => popover.remove(), { exclude: excludeEls });
  popover._closeCtl = { abort: dispose }; // the owner's disposer (lane K: the hover chooser's one cleanup)
  return dispose;
}

/** ONE LATEST RENDER of an async panel (lane ui-controls-and-bugs — the walk found the Ports panel drawn TWICE: its render cleared,
 *  awaited, then appended, so two overlapping calls each appended a copy). `build(out)` fills a DETACHED element; when it ends, a
 *  newer call has not started since and the container is still in the page, ONE replaceChildren lands it — else it is dropped.
 *  → `render()`, to call as often as broadcasts and buttons want. (scripts/test-control-says-why.mjs pins the rule.) */
export function latestRender(container, build) {
  let gen = 0;
  return async () => {
    const mine = ++gen;
    if (!container.isConnected) return false;
    const out = document.createElement('div');
    await build(out);
    if (mine !== gen || !container.isConnected) return false;
    container.replaceChildren(...out.childNodes);
    return true;
  };
}
/** A BUTTON THAT SAYS WHY (lane ui-controls-and-bugs — kb §17: no greyed control with a hint). The button stays LIVE; pressed
 *  while `why()` answers (a reason in words), it does nothing and says that reason on its own line just above the buttons'
 *  row — never a toast, never a greyed button with the reason in a corner. `line` = the caller's own status element to say it
 *  in (else one is made). A capture listener on the button: it runs before the button's own onclick and stops it.
 *  → `{ refresh() }` — call it when the inputs change: a line that was said and no longer holds is cleared.
 *  (scripts/test-control-says-why.mjs ② pins the rule and keeps a ledger of the state-derived `.disabled =` left.) */
export function pressSays(btn, why, { line = null } = {}) {
  let say = line;
  const ensure = () => {
    if (say) return say;
    say = document.createElement('div');
    say.className = 'press-says';
    say.setAttribute('role', 'status');
    const row = btn.parentElement;
    if (row && row.parentElement) row.parentElement.insertBefore(say, row); else if (row) row.prepend(say);
    return say;
  };
  btn.addEventListener('click', (e) => {
    const w = why();
    if (!w) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const l = ensure();
    l.textContent = w;
    l.classList.remove('press-says-again'); void l.offsetWidth; l.classList.add('press-says-again');   // a second press is seen too
  }, { capture: true });
  return {
    refresh() {
      if (!say) return;
      const w = why();
      if (!w) { if (line) say.textContent = ''; else { say.remove(); say = null; } }
      else if (say.textContent) say.textContent = w;   // still said: the reason as it stands now
    },
  };
}
/**
 * Create a positioned popover, removing any existing one with the same class. Returns the popover element for the
 * caller to populate. When the one removed hung off the SAME anchor (the anchor pressed while its popover is open) the
 * press TOGGLES: nothing opens and the element returned is DETACHED (`_closedByAnchor`), filled unseen.
 * @param {HTMLElement} anchor - element to position below (the toggle's key)
 * @param {string} className - CSS class (also used to remove duplicates)
 * @param {object} [opts] - { parent, position: 'below'|'cursor', x, y, toggle: false (a programmatic rebuild) }
 */
export function createPopover(anchor, className, opts = {}) {
  // THE ANCHOR TOGGLES (lane menu-close-residue, B-5bd5 ②): the dedup already knows the open popover of this class —
  // when it hangs off THIS anchor, this call is the anchor pressed again (the anchor is exempt from the closer, so the
  // popover was still open at the click) and the press CLOSES it instead of rebuilding it: the open one is removed and
  // a DETACHED element comes back, which the caller fills unseen — nothing per site (a caller that already asked
  // `isConnected` first — the principal picker, the stream pill, the filter buttons — never reaches this). A
  // cursor-placed popover is not an anchor's (the doc link bar's "anchor" is the whole pane: every press there is a new
  // place) and `opts.toggle === false` opts a programmatic rebuild out.
  const cls = '.' + className.split(' ')[0];
  let reopened = false;
  document.querySelectorAll(cls).forEach((p) => { if (anchor && p._anchor === anchor && p.isConnected !== false) reopened = true; p.remove(); });
  const pop = document.createElement('div');
  pop.className = className;
  pop.dataset.popover = '1'; // global Escape handler closes anything tagged
  if (reopened && opts.position !== 'cursor' && opts.toggle !== false) { pop._closedByAnchor = true; return pop; } // closed: detached, never shown
  pop._anchor = anchor; // the toggle's key (the dedup above reads it)
  ownFloat(pop, anchor); // lane dialog-yield r3: a popover opened from inside a form is THAT form's (a press on it keeps the form's keys)
  pop.style.position = 'fixed';
  pop.style.zIndex = '99999';
  // Initial placement (off-screen to measure)
  pop.style.visibility = 'hidden';
  // /uiScale(): fixed body children take LAYOUT px; all inputs are VIEWPORT px
  const Z = uiScale();
  if (opts.position === 'cursor') {
    pop.style.left = ((opts.x || 0) / Z) + 'px';
    pop.style.top = ((opts.y || 0) / Z) + 'px';
  } else {
    const rect = anchor.getBoundingClientRect();
    pop.style.left = (rect.left / Z) + 'px';
    pop.style.top = ((rect.bottom + 2) / Z) + 'px';
  }
  (opts.parent || document.body).appendChild(pop);
  // Clamp to viewport after render so content is measured. Clamp math runs in
  // VIEWPORT space (pr + innerWidth agree), only the final write divides.
  const clamp = () => {
    const vw = window.innerWidth, vh = window.innerHeight;
    // ITS WIDTH IS HELD TO THE SCREEN TOO (lane bl-phone-ui, the 390 census's first find — 主开发 r1198: the position was held,
    // the width never: a popover wider than a 390 px phone started at 0 and still ran past the right edge). Measured where it
    // has the screen's width (at the left pad — B-16ab (3)'s lesson for menus: at its anchor a fixed box is only as wide as
    // the room right of it), a box wider than the screen is capped at the screen less its two pads, and what still does not fit
    // inside it (a row that never breaks) scrolls sideways IN the box, never off the screen; the clamps below then keep it
    // inside. A box the screen holds whole gets no style, so nothing on a desk moves and an edge-to-edge sheet keeps its edges. (Its PLACE is the
    // anchor's, as before: one near the right edge still narrows to the room there — a slide like menuPlace's would move
    // desk popovers too.)
    if (pop._heldW) { pop.style.maxWidth = pop._ownMaxW || ''; pop.style.overflowX = pop._ownOverflowX || ''; pop._heldW = false; }   // measured afresh at each clamp (its first frame, its content resized — a turn of the screen alone re-clamps nothing)
    const at = pop.style.left, atR = pop.style.right;
    pop.style.left = (MENU_PAD / Z) + 'px'; pop.style.right = 'auto';   // measured where it has the screen's width (a right-anchored box too: held by its right it would read the fill, not its width)
    const across = vw - 2 * MENU_PAD, natural = pop.getBoundingClientRect().width;
    // only a box WIDER THAN THE SCREEN itself is held (r2082 — the hosted run's test-doc-window ⑬): one the screen holds whole was never
    // past it — the phone's link bar, edge to edge by its own rule, was capped at the screen less its pads and stood 8 px short. A box
    // its CALLER anchors by its right (r2157) is held at the screen less its pads, as before: past that bound its right edge stays
    // where it was written, the clamps below write its left, and its row runs past the box with no scroll in it
    const bound = atR && atR !== 'auto' ? across : vw + 0.5;
    if (natural > bound) {
      pop._ownMaxW = pop.style.maxWidth; pop._ownOverflowX = pop.style.overflowX;   // what the caller wrote is put back when the box fits again
      pop.style.maxWidth = (across / Z) + 'px';
      pop.style.overflowX = 'auto';
      const drawn = pop.getBoundingClientRect().width;   // its padding and border ride outside a content-box cap: take them off
      if (drawn > across + 0.5) pop.style.maxWidth = (Math.max(0, 2 * across - drawn) / Z) + 'px';
      pop._heldW = true;
    }
    pop.style.left = at; pop.style.right = atR;
    const pr = pop.getBoundingClientRect();
    if (pr.right > vw) pop.style.left = (Math.max(0, vw - pr.width - 4) / Z) + 'px';
    if (pr.bottom > vh) pop.style.top = (Math.max(0, vh - pr.height - 4) / Z) + 'px';
    if (pr.left < 0) pop.style.left = '4px';
    if (pr.top < 0) pop.style.top = '4px';
  };
  requestAnimationFrame(() => { clamp(); pop.style.visibility = ''; });
  // design 009 (lane apps-interface): a popover whose content grows AFTER it opened (a picker filling in, a row toggled)
  // is clamped again — the Apps dialog's footer share row opened its picker 733 px down an 813 px page and its rows grew
  // off-screen, where a click closed it as an outside press
  if (typeof ResizeObserver === 'function') { const ro = new ResizeObserver(() => { if (pop.isConnected) clamp(); else ro.disconnect(); }); ro.observe(pop); }
  attachPopoverClose(pop, anchor);
  return pop;
}

/**
 * Show a context menu at cursor position.
 * @param {number} x
 * @param {number} y
 * @param {Array<{label: string, action: function, style?: string}>} items
 * @param {string} [className='context-menu']
 * @param {object} [opts] - { up: true } = open ABOVE the point (its bottom edge at y) when there is room — a menu opened from
 *   the lower half of the screen (a title bar near the taskbar, a taskbar tile); the placement is PURE menuPlace either way.
 *   `extraClass` = classes on the MENU only (its items keep `className + '-item'`), set BEFORE it is measured — a class
 *   added after the placement restyled a menu already placed (lane desktop-small r2: the desktop list landed 85 px above
 *   its button, measured unstyled)
 */
export function showContextMenu(x, y, items, className = 'context-menu', { up = false, extraClass = '', placesItself = false } = {}) {
  // B-6944: what opened it (the focus goes back there) and whether a KEY led to it — read BEFORE the same-class sweep: a menu that
  // redraws itself while the keys stand in it (the billing menu when the host's answer lands) keeps its opener and the row in focus
  const held = [...document.querySelectorAll('.' + className.split(' ')[0])].find((p) => p.contains(document.activeElement));
  const opener = held ? (held._menuOpener || null) : document.activeElement;
  const keep = held ? (document.activeElement.textContent || '').trim() : null;
  const fromKey = !!held || Date.now() - _menuKeyAt < MENU_KEY_MS;
  const menuKey = Date.now() - _menuOwnKeyAt < MENU_KEY_MS;   // the person's OWN menu key opened it (menuTakesFocus)
  if (menuKey) _menuOwnKeyAt = 0;   // …one key, one menu: a menu code opens later in the second is code's
  // Remove existing menus of same class
  document.querySelectorAll('.' + className.split(' ')[0]).forEach(p => p.remove());
  const pop = document.createElement('div');
  pop.className = className;
  pop.setAttribute('role', 'menu');
  pop._menuOpener = opener;
  if (extraClass) pop.classList.add(...String(extraClass).split(/\s+/).filter(Boolean));
  pop.dataset.popover = '1'; // global Escape handler closes anything tagged
  pop.style.position = 'fixed';
  pop.style.zIndex = '99999';
  pop.style.visibility = 'hidden';
  const Z = uiScale(); // viewport→layout px for fixed body children (F2)
  pop.style.left = (x / Z) + 'px';
  pop.style.top = (y / Z) + 'px';
  try { ownFloat(pop, document.elementFromPoint(x, y)); } catch { /* no layout: no owner */ }   // lane dialog-yield r3: a menu opened over a form is that form's
  document.body.appendChild(pop);
  attachPopoverClose(pop); // no anchor exclusion — any outside click closes
  // lane ui-controls-and-bugs — THE GREYED-OPTIONS RULE (kb §17: no greyed control with a hint): a row WORKS, or it is a
  // CAPTION (words, not a control: `caption` / caller-escaped `captionHtml`), or it is OFF and says WHY in words on the row
  // (`off`, + `offDoor: {label, action}` — the door that fixes it; a `title` may add detail on hover). ONE drawer for the
  // top level and every submenu. A legacy `disabled` row is still drawn the old way: its title is often a description, not a
  // reason, so it is never promoted to a why — scripts/test-control-says-why.mjs ① forbids a new one and keeps the rest in a
  // ledger that only shrinks.
  const wordRow = (item) => {
    if (item.caption != null || item.captionHtml != null) {
      const cap = document.createElement('div');
      cap.className = className + '-caption';
      if (item.captionHtml != null) cap.innerHTML = item.captionHtml; else cap.textContent = String(item.caption);   // captionHtml: the caller escHtml's every part
      cap.setAttribute('role', 'presentation');   // B-6944: words, no stop (a reader still reads them)
      if (item.title) cap.title = item.title;
      if (item.style) cap.style.cssText = item.style;
      return cap;
    }
    if (item.off == null) return null;
    const row = document.createElement('div');
    // the desktop doors' proven markup, now every menu's: `.disabled` (the state every reader keys on) + .door-label / .door-why
    row.className = className + '-item ' + className + '-off disabled';
    row.setAttribute('role', 'menuitem'); row.setAttribute('aria-disabled', 'true'); row.tabIndex = -1; row.dataset.menuStop = '1';   // B-6944: an OFF row is a stop the keys reach (its words and why read) — Enter presses nothing
    const name = document.createElement('span'); name.className = 'door-label';
    if (item.labelHtml != null) name.innerHTML = item.labelHtml; else name.textContent = item.label;
    const why = document.createElement('span'); why.className = 'door-why'; why.textContent = String(item.off);
    why.id = `menu-why-${++_menuWhySeq}`; row.setAttribute('aria-describedby', why.id);   // the row's why, read with it
    row.append(name, why);
    if (item.offDoor && item.offDoor.label) {
      const b = document.createElement('button'); b.type = 'button'; b.className = className + '-off-door'; b.textContent = item.offDoor.label; b.tabIndex = -1; b.dataset.menuStop = '1';   // its door IS a stop
      b.onclick = (e) => { e.stopPropagation(); pop.remove(); item.offDoor.action?.(); };
      row.appendChild(b);
    }
    if (item.title) row.title = item.title;
    if (item.style) row.style.cssText = item.style;
    return row;
  };
  for (const item of items) {
    const words = wordRow(item);
    if (words) { pop.appendChild(words); continue; }
    if (item.separator) { const sep = document.createElement('div'); sep.className = className + '-separator'; sep.setAttribute('role', 'separator'); pop.appendChild(sep); continue; }
    const el = document.createElement('div');
    el.className = className + '-item' + (item.disabled ? ' disabled' : '');
    menuStop(el, !item.disabled);
    if (item.style) el.style.cssText = item.style;
    if (item.children?.length) {
      // Submenu item: hover to expand. Since 2026-09-28 a parent may carry the same
      // OPT-IN `labelHtml` (caller escHtml's every part \u2014 the billing switcher's pool row
      // with its usage cluster), a `title`, and its OWN `action`: a MOUSE click on the row
      // runs it (the pool row itself = "automatic"), a TOUCH tap only opens the submenu
      // (the first child row offers the same act \u2014 no touch path is lost).
      if (item.labelHtml != null) { el.innerHTML = item.labelHtml; const arrow = document.createElement('span'); arrow.className = className + '-arrow'; arrow.textContent = ' \u25B8'; el.appendChild(arrow); }
      else el.textContent = item.label + ' \u25B8';
      if (item.title) el.title = item.title;
      el.style.position = 'relative';
      el.setAttribute('aria-haspopup', 'menu'); el.setAttribute('aria-expanded', 'false');
      const sub = document.createElement('div');
      sub.className = className;
      sub.setAttribute('role', 'menu');
      sub.style.cssText = 'position:absolute;left:100%;top:-4px;display:none;z-index:99999';
      for (const child of item.children) {
        const words = wordRow(child);   // a caption / an off row in a submenu too (the window's Scale ▸, Stored logins ▸)
        if (words) { sub.appendChild(words); continue; }
        const ce = document.createElement('div');
        ce.className = className + '-item' + (child.disabled ? ' disabled' : '');
        menuStop(ce, !child.disabled);
        // labelHtml: see the top-level item note below — callers MUST escHtml
        // every interpolated string.
        if (child.labelHtml != null) ce.innerHTML = child.labelHtml;
        else ce.textContent = child.label;
        if (child.style) ce.style.cssText = child.style;
        if (child.title) ce.title = child.title;
        // disabled children must not fire (this was silently ignored — a
        // "disabled" submenu entry still ran its action on click)
        if (child.disabled) { ce.style.opacity = '0.4'; ce.style.cursor = 'default'; }
        else ce.onclick = (e) => { e.stopPropagation(); pop.remove(); child.action?.(); };
        sub.appendChild(ce);
      }
      el.appendChild(sub);
      // Clamp the submenu into the viewport on EVERY open — the hover path
      // used to skip it, so bottom-of-screen submenus ran off-screen (real
      // report: 右键菜单不会考虑超出屏幕)
      const showSub = () => {
        sub.style.display = '';
        el.setAttribute('aria-expanded', 'true');
        requestAnimationFrame(() => {
          const r = sub.getBoundingClientRect();
          if (r.right > window.innerWidth && !sub.style.right) { sub.style.left = 'auto'; sub.style.right = '100%'; }
          const overflowY = r.bottom - window.innerHeight;
          if (overflowY > 0) sub.style.top = `${-4 - overflowY - 4}px`; // top is relative to the parent row (initial -4px)
        });
      };
      el._showSub = showSub;   // B-6944: ArrowRight / Enter on the row opens it from the keyboard
      el.addEventListener('mouseenter', showSub);
      el.addEventListener('mouseleave', () => { if (sub.contains(document.activeElement)) return; sub.style.display = 'none'; el.setAttribute('aria-expanded', 'false'); });   // (the keys stand in it: it stays)
      // Touch: no hover exists — tap the parent row to open the submenu.
      // Only opens (never toggles closed): emulated mouseenter on tap may have
      // already shown it, and a toggle would immediately re-hide it.
      let lastPointer = 'mouse';
      el.addEventListener('pointerdown', (e) => { lastPointer = e.pointerType || 'mouse'; });
      el.addEventListener('click', (e) => {
        if (sub.contains(e.target)) return; // child item clicks handle themselves
        e.stopPropagation();
        if (item.action && !item.disabled && lastPointer === 'mouse') { pop.remove(); item.action(); return; }
        showSub();
      });
    } else {
      // OPT-IN rich label (2.245.2): `labelHtml` renders via innerHTML for
      // rows that need styled fragments (e.g. the billing switcher's
      // water-level-colored quota percentages). ⚠ SECURITY: the caller MUST
      // escHtml() EVERY interpolated string (names, emails, hosts, reasons —
      // anything user/peer-controlled). Only our own code sets labelHtml;
      // NEVER pass through strings from a remote payload unescaped. Plain
      // `label` stays textContent (no escaping needed) — prefer it.
      if (item.labelHtml != null) el.innerHTML = item.labelHtml;
      else el.textContent = item.label;
      if (item.title) el.title = item.title; // esp. WHY a disabled item is disabled
      if (item.disabled) { el.style.opacity = '0.4'; el.style.cursor = 'default'; }
      else el.onclick = () => { pop.remove(); item.action(); };
    }
    pop.appendChild(el);
  }
  armMenuKeys(pop, { opener, fromKey, keep, menuKey, kept: !!held });   // B-6944: the keys of this menu (and the focus, when a key led to it)
  placeMenu(pop, x, y, { up, placesItself });
  return pop;
}
/** B-6944 — THE KEYS OF AN OPEN MENU (PURE menu-place.js menuKeyStep decides): armed by showContextMenu just before its
 *  placement; a menu a KEY led to takes the focus at its first STOP once it stands placed (a microtask: placeMenu shows it) */
function armMenuKeys(pop, { opener = null, fromKey = false, keep = null, menuKey = false, kept = false } = {}) {
  // a menu a KEY opened takes the focus at its first STOP — an OFF row first is that stop (read with its why), never skipped for
  // the live row behind it (its round: the plugin's «⋯» while an update runs — Update… off, then Uninstall…: the Enter that opened
  // it landed on Uninstall…). Up / Down / Home / End move among the STOPS of the menu holding the focus — every row, an off one too
  // (reached and read, Enter / Space on it press nothing); a caption is no stop. Enter / Space press, ArrowRight / Enter open a
  // submenu and ArrowLeft leaves it, Escape (and Tab) close it and give the focus back to what opened it. A pointer's menu is
  // unchanged: it takes no focus, and a key it never hears changes nothing.
  const stopsOf = (level) => [...level.querySelectorAll(':scope > [data-menu-stop], :scope > * > [data-menu-stop]')];
  const giveBack = () => { if (opener && opener !== document.body && opener.isConnected && typeof opener.focus === 'function') opener.focus({ preventScroll: true }); };
  pop.addEventListener('keydown', (e) => {
    const cur = document.activeElement;
    const level = (cur && pop.contains(cur) && cur.closest('[role="menu"]')) || pop;
    const stops = stopsOf(level), at = stops.indexOf(cur), row = at >= 0 ? stops[at] : null;
    if (e.repeat && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); return; }   // a held Enter on the opener never presses the first row
    const st = menuKeyStep({ key: e.key, at, count: stops.length, parent: !!row && row.getAttribute('aria-haspopup') === 'menu', inSub: level !== pop, off: !!row && row.getAttribute('aria-disabled') === 'true' });
    if (!st) return;
    if (e.key !== 'Tab') e.preventDefault();   // Tab: the focus goes back to the opener and moves on from there
    e.stopPropagation();
    if (st.close) { pop.remove(); if (st.back) giveBack(); return; }
    if (st.leave) { const host = level.parentElement; level.style.display = 'none'; if (host) { host.setAttribute('aria-expanded', 'false'); host.focus({ preventScroll: true }); } return; }
    if (st.open) { row._showSub?.(); const sub = row.querySelector(':scope > [role="menu"]'); const first = sub && stopsOf(sub)[0]; if (first) first.focus({ preventScroll: true }); return; }
    if (st.press) { row.click(); if (!pop.isConnected && (!document.activeElement || document.activeElement === document.body)) giveBack(); return; }
    if (st.focus != null && stops[st.focus]) stops[st.focus].focus({ preventScroll: true });
  });
  // …a menu CODE opened never from where a person's keys go (menuOpenerTyping: a field, a frame, a desktop's or a live browser's
  // view — it leaves the focus and the characters where they are); a menu the person's OWN menu key opened takes it wherever it was
  // but on a view (the key is the shown machine's) — menuTakesFocus; a redrawn menu that held the focus keeps it (`kept`)
  const takes = menuTakesFocus({ fromKey, menuKey, opener, kept });
  // a redrawn menu puts the focus back on the row it was on (by its words), else on its first STOP
  if (takes) queueMicrotask(() => { if (!pop.isConnected) return; const all = stopsOf(pop); const at = (keep && all.find((r) => (r.textContent || '').trim() === keep)) || all[0]; if (at) at.focus({ preventScroll: true }); });
}
/** B-6944 ② (its round — THE TYPING GUARD counted fields only). PURE over the element holding the focus when a menu opens: do a
 *  person's KEYS go there? A field (the caret), a frame, or a VIEW that takes keys — a desktop's picture (noVNC's canvas, a stream's
 *  video) or the live browser view's own root: a menu opened by code within a second of a character typed there took the focus
 *  and the characters after it. Then the menu takes no focus. */
export function menuOpenerTyping(el) {
  if (!el) return false;
  return _editable(el) || menuOpenerView(el);
}
/** …the VIEWS among them (PURE): a frame, a desktop's or a stream's picture, the live browser view's root, and the KEY SINKS a
 *  driven view keeps the focus in (xpra's `.xpra-ime`, the live browser's `.browser-live-kbd` — textareas, so fields too) — what
 *  they show takes the keys, its own menu key too (a remote desktop's machine has a menu key of its own) */
export function menuOpenerView(el) {
  if (!el) return false;
  const tag = String(el.tagName || '').toUpperCase(), cls = (c) => !!(el.classList && typeof el.classList.contains === 'function' && el.classList.contains(c));
  return tag === 'IFRAME' || tag === 'CANVAS' || tag === 'VIDEO' || cls('browser-live') || cls('xpra-ime') || cls('browser-live-kbd');
}
/** B-6944 (主开发 09:53Z — THE TYPING GUARD IS FOR A MENU OPENED BY CODE). PURE: is this key the person's own MENU key — the
 *  context-menu key, or Shift+F10 (and nothing else held)? */
export function isMenuKey(e) {
  if (!e || e.ctrlKey || e.metaKey || e.altKey) return false;   // with a modifier the browser raises no menu
  return e.key === 'ContextMenu' || (e.key === 'F10' && !!e.shiftKey);
}
/** PURE: does a menu opening now take the focus? `kept` = a menu redrawing itself while the focus is in it — yes, it keeps it
 *  (whatever opened it: a menu the menu key opened from a field, redrawn a moment later); `menuKey` = the person's own menu key a
 *  moment ago (MENU_KEY_MS) — then YES, wherever the focus was (a field too: a keyboard-only person must walk the menu they asked
 *  for), but NOT from a view that takes keys (menuOpenerView: the key belongs to the machine shown there); else `fromKey` = a
 *  gesture key a moment ago — yes only from where no person's keys go (menuOpenerTyping); no key — no (a pointer's menu or one a
 *  timer opens takes no focus). */
export function menuTakesFocus({ fromKey = false, menuKey = false, opener = null, kept = false } = {}) {
  if (kept) return true;
  if (menuKey) return !menuOpenerView(opener);
  return !!fromKey && !menuOpenerTyping(opener);
}
/** B-6944: a menu row that is a STOP for the keys — role menuitem, focusable by script; a live row presses, an OFF one (aria-disabled)
 *  is a stop too: reached and read with its why, never pressed */
function menuStop(el, live) { el.setAttribute('role', 'menuitem'); el.tabIndex = -1; el.dataset.menuStop = '1'; if (!live) el.setAttribute('aria-disabled', 'true'); }   // a dead row is a stop too (read, never pressed)
// B-6944: did a KEY lead to the menu that opens now? A gesture key (Enter / Space on a focused button, an arrow, a shortcut — never
// plain typing in a field: isGestureKey) within MENU_KEY_MS; a pointer press takes it back — `_menuKeyAt`, stamped by the page's two
// gesture listeners beside `_gestureAt` (above: no listener of its own); a menu a timer opens long after a key takes no focus
const MENU_KEY_MS = 1000;
let _menuWhySeq = 0;

/** A MENU IS BOUNDED BY THE SCREEN (lane ui-controls-and-bugs, 主开发's width-sweep rule 4, 2026-11-13) — THE ONE placement of
 *  every context menu (showContextMenu and the file explorer's own builder): PURE menuPlace (below the point, above it when
 *  `up` and there is room, else clamped; a menu TALLER than the viewport is capped and scrolls inside). Two things on top:
 *  - a menu whose rows change after it opened is PLACED AGAIN when its builder asks (`follow` — the file explorer's office
 *    rows arrive late: «删除» grew below a 1024×700 screen, no scroll). OPT-IN: a menu that places itself after a patch (the
 *    desktop list keeps its TOP, lane desktop-doors-table r4/r5; the sheets) must never be moved under the pointer behind
 *    its back (the acceptance reader's must-fix: an observer on every menu did exactly that);
 *  - a capped menu keeps its CLOSING rows in view — the last group after a separator when it is short (≤ 4 rows: Rename /
 *    Properties / Delete), else that group's last two (the session card's 属性… / 终止): they stick to its bottom edge while
 *    the rest scrolls under them. The rows stay the menu's own children (no wrapper).
 *  `placesItself` — the caller places it from here on (the desktop list, a sheet): the release's plain placement only, no
 *  pinned rows, no following. Viewport px measured, layout px written (uiScale). */
export function placeMenu(pop, x, y, { up = false, follow = false, placesItself = false } = {}) {
  const Z = uiScale();
  const isSep = (k) => [...k.classList].some((c) => /-(separator|sep)$/.test(c));
  const unpin = () => { for (const k of pop.children) if (k.dataset && k.dataset.menuTail) { delete k.dataset.menuTail; k.style.position = ''; k.style.bottom = ''; k.style.zIndex = ''; k.style.background = ''; k.style.boxShadow = ''; } };
  const pinTail = () => {
    const kids = [...pop.children].filter((k) => !k.classList.contains('context-submenu'));
    let i = kids.length - 1;
    while (i >= 0 && !isSep(kids[i])) i--;
    const group = kids.slice(i + 1), tail = group.length <= 4 ? group : group.slice(-2);
    if (i < 0 || !tail.length) return;
    let below = 0;
    for (let k = tail.length - 1; k >= 0; k--) {
      const row = tail[k];
      row.dataset.menuTail = '1';
      Object.assign(row.style, { position: 'sticky', bottom: below + 'px', zIndex: '1', background: 'var(--bg-dialog)' });
      // the first pinned row draws the group's rule above it; the last covers the menu's bottom padding (a scrolled row
      // showed through the 4 px under «终止»)
      row.style.boxShadow = [k === 0 ? '0 -1px 0 var(--border)' : '', k === tail.length - 1 ? '0 6px 0 var(--bg-dialog)' : ''].filter(Boolean).join(', ');
      below += row.offsetHeight;
    }
  };
  const place = () => {
    unpin(); pop.style.maxHeight = ''; pop.style.overflowY = ''; pop.style.maxWidth = '';   // its natural size first —
    // B-16ab (3): MEASURED WHERE IT HAS THE SCREEN'S WIDTH. At x a fixed box is only as wide as the room right of it: the
    // helper slid it by that squeezed width and it grew back into what it gained, flush on the edge (the Agents dialog's
    // «+ Add account…» opened at x 205 of a 390 px phone: 201 + 189 = 390). Measured at the left pad, the box wider than the
    // screen less its two pads is capped (menuPlace's maxW, now applied); every other box keeps the width it measured.
    pop.style.left = (MENU_PAD / Z) + 'px';
    const mr = pop.getBoundingClientRect();
    const at = menuPlace({ x, y, w: mr.width, h: mr.height, vw: window.innerWidth, vh: window.innerHeight, up });
    if (at.maxW != null) pop.style.maxWidth = (at.maxW / Z) + 'px';
    if (at.maxH != null) { pop.style.maxHeight = (at.maxH / Z) + 'px'; pop.style.overflowY = 'auto'; if (!placesItself) pinTail(); }
    pop.style.left = (at.left / Z) + 'px';
    pop.style.top = (at.top / Z) + 'px';
  };
  place();
  pop.style.visibility = '';
  // rows added or removed after it opened ⇒ placed again (a submenu the builder hangs INSIDE the menu is not a row)
  if (follow && !placesItself) followContent(pop, () => { const keep = pop.scrollTop; place(); pop.scrollTop = keep; }, { rows: true });
  return pop;
}

/** FOLLOW AN OPEN BOX'S CONTENT (lane ui-controls-and-bugs — ONE helper: placeMenu's opt-in `follow` and the status bar's panel
 *  settle): `fn` runs once the caller has filled `el` (a microtask) and again — once per frame — whenever its content changes;
 *  it ends with the box (disconnected the first time it is out of the page). `rows`: only a child added or removed counts
 *  (never a submenu the builder hangs inside it); else any child / text change. `fn` must only write styles (it cannot feed
 *  itself: the observer watches children and text). → `stop()` */
export function followContent(el, fn, { rows = false } = {}) {
  let q = 0, mo = null;
  const run = () => { q = 0; if (el.isConnected) fn(); };
  if (!rows) queueMicrotask(run);
  if (typeof MutationObserver !== 'function') return () => {};
  mo = new MutationObserver((recs) => {
    if (!el.isConnected) { mo.disconnect(); return; }
    if (rows && !recs.some((r) => [...r.addedNodes, ...r.removedNodes].some((n) => n.nodeType === 1 && !(n.classList && n.classList.contains('context-submenu'))))) return;
    if (!q) q = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(run) : setTimeout(run, 16);
  });
  mo.observe(el, rows ? { childList: true } : { childList: true, subtree: true, characterData: true });
  return () => mo.disconnect();
}

/** What the DOM says about a press at (x, y) on `target` — the facts PURE pressTargetClass (press-select.js) reads:
 *  inside a text field / the terminal, on a control, a glyph under the finger, and that glyph's effective
 *  user-select. Never throws (a fact it cannot read is the conservative one: no glyph ⇒ the menu keeps working).
 *  THE FINGER'S POINT DECIDES, not the event's target (channel-touch-menu verify r1, measured): Chrome's touch
 *  adjustment retargets a touchstart to a control NEAR the finger — a long press on a channel message's first word,
 *  11 px under its author's name (a role=button), arrived with target = the name and clientX/Y on the word — while the
 *  platform's own long press selected the word under the point. Judged by the target, the door armed its timer and our
 *  menu (500 ms) held that selection off. The element under (x, y) is judged; the target only when nothing is there. */
export function pressFacts(target, x, y) {
  const hit = typeof document.elementFromPoint === 'function' && Number.isFinite(x) && Number.isFinite(y) ? document.elementFromPoint(x, y) : null;
  const el = hit || (target?.nodeType === 1 ? target : target?.parentElement);
  if (!el?.closest) return { native: false, chrome: true, overText: false, userSelect: 'none' };
  if (el.closest(NATIVE_PRESS_SELECTOR)) return { native: true, chrome: false, overText: false, userSelect: 'auto' };
  if (el.closest(PRESS_CHROME_SELECTOR)) return { native: false, chrome: true, overText: false, userSelect: 'none' };
  let overText = false, userSelect = 'none';
  try {
    let node = null;
    if (typeof document.caretPositionFromPoint === 'function') node = document.caretPositionFromPoint(x, y)?.offsetNode || null;
    else if (typeof document.caretRangeFromPoint === 'function') node = document.caretRangeFromPoint(x, y)?.startContainer || null;
    if (node && node.nodeType === 3 && node.data.trim()) {
      const r = document.createRange();
      r.selectNodeContents(node);
      overText = pointOnText([...r.getClientRects()], x, y);
      const vals = [];
      for (let e = node.parentElement; e; e = e.parentElement) {
        const cs = getComputedStyle(e);
        vals.push(cs.userSelect || cs.webkitUserSelect);
      }
      userSelect = effectiveUserSelect(vals);
    }
  } catch { overText = false; }
  return { native: false, chrome: false, overText, userSelect };
}

/** The verdict for a touch press at (x, y) — 'menu' | 'selection' | 'native' (PURE longPressVerdict). */
export function touchPressVerdict(target, x, y) {
  return longPressVerdict({ device: 'touch', target: pressTargetClass(pressFacts(target, x, y)) });
}

/**
 * Long-press → contextmenu for touch devices — THE ONE DOOR of a touch long press.
 *
 * iOS Safari never fires `contextmenu` on long-press, so every right-click
 * menu (file explorer, group headers, …) is unreachable there. Synthesize a
 * bubbling contextmenu event after a 500ms still press. Android Chrome fires
 * the native event itself — a trusted contextmenu cancels the pending timer
 * so menus don't double-fire.
 *
 * A LONG PRESS ON SELECTABLE TEXT IS A SELECTION, NEVER A MENU (lane
 * mobile-select, src/lib/press-select.js): on selectable text the timer is never
 * armed (iOS: our timer was the only menu, racing the platform's selection), and
 * a TRUSTED touch contextmenu there (Android: fired after the platform already
 * selected the word) is stopped here before any menu handler sees it — without
 * preventDefault, so the selection handles and the platform's Copy bar appear.
 * Controls, padding, gutters and pictures keep the menu — and once an app handler
 * TOOK such a menu press (a menu is open) the platform's own selection is held
 * off for it (`selectstart` cancelled: measured, Chrome's long press on a
 * message's role strip still selected the nearest word under our menu); when the
 * platform's long press comes FIRST (its selectstart before our 500 ms), our
 * contextmenu is fired right then, so one press is one outcome either way. A
 * mouse right-click is never judged. A trusted contextmenu arriving after OUR
 * synthetic one was taken is swallowed (measured: the menu was built twice,
 * ~180 ms apart); one nobody took passes (the platform's own long-press menu).
 * Every decision is a PURE table (press-select.js: longPressVerdict,
 * selectStartAllowed, trustedContextMenu).
 */
export function installLongPressContextMenu() {
  let timer = null, sx = 0, sy = 0, fired = false, handled = false, touching = false, verdict = null, target = null;
  const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
  // our contextmenu, at the touch point; `handled` = an app handler took it (cancelled it: a menu opened)
  const fire = () => {
    timer = null; fired = true;
    try { navigator.vibrate?.(10); } catch {}
    handled = !target.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true, cancelable: true, view: window, clientX: sx, clientY: sy,
    }));
  };
  document.addEventListener('touchstart', (e) => {
    cancel(); fired = false; handled = false;
    touching = true; verdict = null; target = null;
    if (e.touches.length !== 1) return;
    target = e.target;
    const t = e.touches[0];
    sx = t.clientX; sy = t.clientY;
    // Native long-press matters on text fields / the terminal (paste menu, text selection) and on selectable
    // text (the platform's selection) — only a 'menu' verdict arms the timer
    verdict = touchPressVerdict(target, sx, sy);
    if (verdict !== 'menu') return;
    timer = setTimeout(fire, 500);
  }, { passive: true, capture: true });
  document.addEventListener('touchmove', (e) => {
    if (!timer) return;
    const t = e.touches[0];
    if (Math.abs(t.clientX - sx) > 10 || Math.abs(t.clientY - sy) > 10) { cancel(); verdict = null; } // a scroll, never a long press
  }, { passive: true, capture: true });
  // Non-passive: preventDefault after a fired long-press suppresses the
  // emulated click that would otherwise also activate the pressed element
  document.addEventListener('touchend', (e) => {
    cancel();
    touching = e.touches?.length > 0;
    if (!touching) verdict = null;
    if (fired) { fired = false; handled = false; e.preventDefault(); }
  }, { capture: true });
  document.addEventListener('touchcancel', () => { cancel(); fired = false; handled = false; touching = false; verdict = null; }, { capture: true });
  // the platform's long press reached a MENU press first: our menu now (one press, one outcome) — and its selection
  // only if no app handler took the menu
  document.addEventListener('selectstart', (e) => {
    if (!touching || verdict !== 'menu') return;
    if (!fired && target) { cancel(); fire(); }
    if (!selectStartAllowed({ touching, verdict, handled })) e.preventDefault();
  }, { capture: true });
  document.addEventListener('contextmenu', (e) => {
    if (!e.isTrusted) return;
    cancel();
    const touch = touching || e.pointerType === 'touch';
    const act = trustedContextMenu({ touch, fired, handled, verdict: touch && !fired ? touchPressVerdict(e.target, e.clientX, e.clientY) : 'menu' });
    if (act === 'swallow') { e.preventDefault(); e.stopImmediatePropagation(); }   // our menu is already open
    else if (act === 'stop') e.stopImmediatePropagation();                          // the selection wins (never cancelled)
  }, { capture: true });
}

/** The rect a popup hangs from (lane phone-titlebar-title r5 — the r4 acceptance: the Usage popup opened from the phone's ⋯ row
 *  was anchored on its FOLDED chip, display:none — a zero rect — and took the whole screen's height as its room): the
 *  anchor's own rect when it is drawn, else the nearest drawn box that holds it (the bar that folded it). Viewport px. */
export function drawnAnchorRect(anchor) {
  let el = anchor;
  while (el?.parentElement && !el.getClientRects().length) el = el.parentElement;
  return el.getBoundingClientRect();
}

/**
 * Anchor a persistent position:fixed popup next to its trigger element.
 * The trigger can live ANYWHERE (customize mode moves chrome elements between
 * bars), so hardcoded bottom/right CSS is wrong the moment it's dragged — this
 * flips above/below by the trigger's screen half, right/left-aligns to it, and
 * clamps into the viewport. Growth-direction friendly: anchored-above popups
 * pin `bottom` (grow upward), anchored-below pin `top` — so live re-renders
 * that change the height stay glued to the trigger without re-measuring.
 */
export function anchorFixedPopup(popup, anchor, { gap = 6 } = {}) {
  if (!popup || !anchor) return;
  const r = drawnAnchorRect(anchor); // a folded chip's popup: from the bar that holds it, never a zero rect (r5)
  const vw = window.innerWidth, vh = window.innerHeight;
  const Z = uiScale(); // viewport→layout px for fixed body children (F2)
  const openUp = r.top + r.height / 2 > vh / 2;
  if (openUp) {
    popup.style.bottom = `${Math.max(8, vh - r.top + gap) / Z}px`;
    popup.style.top = 'auto';
    popup.style.maxHeight = `${Math.max(120, r.top - gap - 16) / Z}px`;
  } else {
    popup.style.top = `${Math.min(vh - 40, r.bottom + gap) / Z}px`;
    popup.style.bottom = 'auto';
    popup.style.maxHeight = `${Math.max(120, vh - r.bottom - gap - 16) / Z}px`;
  }
  if (r.left + r.width / 2 > vw / 2) {
    popup.style.right = `${Math.max(8, vw - r.right) / Z}px`;
    popup.style.left = 'auto';
  } else {
    popup.style.left = `${Math.max(8, r.left) / Z}px`;
    popup.style.right = 'auto';
  }
  // width clamp needs the rendered size — nudge back inside if overflowing
  const pr = popup.getBoundingClientRect();
  if (pr.right > vw - 8) { popup.style.left = `${Math.max(8, vw - 8 - pr.width) / Z}px`; popup.style.right = 'auto'; }
  else if (pr.left < 8) { popup.style.left = '8px'; popup.style.right = 'auto'; }
}

/** The auth layer's same-origin refusal (403 {error:'cross-site'}, lane owner-write-origin) said in words: VibeSpace's
 *  own page never meets it — a page that ever does shows the sentence, not the code (`code` keeps the code). */
/** The hub HOLDS its paired machines (hosts.json could not be read — 503 `hosts-unread`): ONE sentence the page words by code
 *  (主开发 01:20Z (5): the server's own words are English) — the exit dialog, a usage refresh, the dial status, a machine's removal. */
export function hostsHeldWords() { return t('VibeSpace cannot read its paired machines right now — nothing was paired or changed. Try again in a few minutes (it reads them again by itself).'); }
/** …and its machines' MOUNTS (machine-mounts.json could not be read — 503 `mounts-unread`): ONE sentence the page words by code — a
 *  mount's add, remove and mount-again, a machine's removal (the stores chain's read on 921c0de17: they showed the hub's English). */
export function mountsHeldWords() { return t('VibeSpace cannot read the machines’ mounts right now — nothing was changed. Try again in a few minutes (it reads them again by itself).'); }
/** A refusal answered BY A HOLD (its code: `hosts-unread` / `mounts-unread`) → the page's sentence; any other answer → null (its own words
 *  stand). For the pages that fetch by hand (the exit runs and device activity dialogs, Settings' config export and import). */
/** …and plugins.json (503 `plugins_unread`, B-f276 family unit 1): a plugin's on-switch, an install, a start or a stop refused */
/** …and providers.json (503 `providers_unread`, B-f276 family — lane lg-providers): adding, changing, removing or testing a model provider refused */
export function providersHeldWords() { return t('VibeSpace cannot read its list of model providers right now — nothing was changed. Try again in a few minutes (it reads the list again by itself).'); }
export function pluginsHeldWords() { return t('VibeSpace cannot read its plugins’ settings right now — nothing was changed. Try again in a few minutes (it reads them again by itself).'); }
/** …and published-pages.json (503 `pages_unread`, 主开发 r3005): a publish, a rename, a flag or an unpublish refused */
/** …the same list read as «none» (the chat status bar's pages chip): what is not shown, and why */
export function pagesListHeldWords() { return t('VibeSpace cannot read its list of published pages right now, so none is shown here. Nothing is lost: every link given out stays, though it answers «cannot be shown right now» until the list reads, and the list comes back by itself (it tries again every few minutes).'); }
export function pagesHeldWords() { return t('VibeSpace cannot read its list of published pages right now — nothing was changed: the page stays as it was, and a public page is served again as soon as the list reads. Press again in a few minutes.'); }
/** B-f276 family (主开发 r3032): THE FAMILY's HELD CODES, ONE TABLE. A store whose file could not be read is HELD and its route answers
 *  the store's code (503); the page says it in its OWN words — what could not be read by its plain name, that nothing was changed, that
 *  it is read again by itself — never the hub's English, never a file name. The older holds keep their own branches in heldWordsOf
 *  (hosts-unread, mounts-unread, store_unread by its file and kind); every other held code is worded HERE: a row — a unit's own sentence
 *  function stays its row's value (plugins_unread, providers_unread, pages_unread, status_unread: moved under the table, r3224 / r3233) —
 *  or, a list hold the census classed with no row of its own (HELD_GENERIC), the ONE generic sentence; ANY other code keeps its own
 *  words (r3123). A lane whose cure adds a held store adds its code as a row here; scripts/test-held-words.mjs is the
 *  census (every held 503 of the tree, and every code ending in unread / unreadable whatever its status). */
const HELD_WORDS = Object.freeze({
  doc_owners_unread: () => t('VibeSpace cannot read the list of who owns each document window right now — nothing was changed and no comment was sent. It reads the list again by itself every few minutes: send again then.'),   // r3332: data/doc-owners.json (src/server/doc-engine.js)
  browser_settings_unread: () => t('VibeSpace’s settings cannot be read right now — the browsers keep the choices last known in this run, and stop or lapse nothing by a default clock'),   // B-50e7: the agent browser while the settings are held (src/server/browser-keeper.js)
  storage_unread: () => t('VibeSpace cannot read its storage list right now — nothing was changed. Try again in a few minutes (it reads it again by itself).'),   // mounts.json (src/mounts.js)
  tokens_unread: () => t('VibeSpace cannot read its folder links right now — nothing was changed. Try again in a few minutes (it reads them again by itself).'),   // mount-tokens.json (src/webdav.js)
  plugins_unread: () => pluginsHeldWords(),   // plugins.json (src/plugins.js)
  'store-blocked': () => t('Paused: a channels file could not be read — this change is refused, and nothing is fetched or sent, until it reads again (see For you)'),   // the channels' held files (src/server/groups-engine.js, src/channel-store.js) — channel-words routeErrorText's own sentence, one key
  providers_unread: () => providersHeldWords(),   // lg-providers' own edit (providers.json): its sentence stays in force — moved under the table (r3224: one lookup)
  pages_unread: () => pagesHeldWords(),   // card-door-in-chat's own edit (published-pages.json): its sentence stays in force — moved under the table (r3224: one lookup)
  status_unread: () => statusHeldWords(),   // card-door-in-chat's own edit (session-status.json, the content stores — r3233): its sentence stays in force — moved under the table (one lookup)
  api_unread: () => t('VibeSpace cannot read its API proposals right now — nothing was decided or run. Press again in a few minutes (it reads them again by itself).'),   // card-door-in-chat (the content stores, lines 678 + 679 — r3233) — the lane's words (r3168)
  msg_stash_unread: () => t('The messages waiting for this agent could not be read just now — VibeSpace reads them again by itself; the ones already waiting are kept as they were.'),   // msg-stash.json (src/server/conversation-deliver.js) — lane hub-loop-stalls, r3003 (a): the hand-over's claim refused while the list of waiting messages is held (r3488: the unit carries its own row; the strip's own sentence)
  handover_memory_unread: () => t('The record of messages already handed to agents could not be read just now — VibeSpace reads it again by itself; nothing was lost or changed. A message an agent hands back waits until it reads.'),   // stash-handover.json (src/server/stash-handover.js) — lane hub-loop-stalls, r3003 (c): no route refuses by it; the family's notice and this row (r3488: the unit carries its own row)
  expiry_warnings_unread: () => t('The record of the login warnings already filed could not be read just now — VibeSpace reads it again by itself; nothing was lost or changed. A new login warning waits until it reads.'),   // login-expiry.json (src/server/login-expiry-watch.js) — lane hub-loop-stalls, r3003 (d): no route refuses by it; the family's notice and this row (r3488: the unit carries its own row)
  turn_carry_unread: () => t('The record of the conversations a restart interrupted could not be read just now — VibeSpace reads it again by itself; nothing was lost or changed. A conversation asked meanwhile is told about the restart once the record reads.'),   // turn-carry-outstanding.json (src/turn-carry.js) — B-f276, lane bl-scratch (slice hub-own-ledgers): no route refuses by it; its row in the held list says it
  cli_measure_unread: () => t('This hub’s record of the Claude Code builds it measured could not be read just now — VibeSpace reads it again by itself; nothing was lost or changed. Until it reads, a new build is not placed on this hub’s own measurement.'),   // cli-self-measure.json (src/server/cli-self-measure.js) — B-f276, lane bl-scratch (slice hub-own-ledgers): its torn bytes kept aside, then it starts empty
  device_upgrades_unread: () => t('The record of the agent updates of your machines could not be read just now — VibeSpace reads it again by itself; nothing was lost or changed. A stuck or refused agent update is told once it reads.'),   // device-upgrades.json (src/server/device-upgrade-watch.js) — lane lg-remote-hardening, r4718 (B-f276): no route refuses by it; the family's notice and this row
  dial_health_unread: () => t('The record of extra agents dialing in to your machines could not be read just now — VibeSpace reads it again by itself; nothing was lost or changed. A second agent still dialing in is told once it reads.'),   // dial-health.json (src/server/dial-health-watch.js) — lane lg-remote-hardening, r4718 (B-f276): no route refuses by it; the family's notice and this row
  apps_unread: () => t('VibeSpace cannot read its app proposals right now — nothing was installed or changed. Press again in a few minutes (it reads them again by itself).'),   // card-door-in-chat (the content stores, lines 678 + 679 — r3233) — the lane's words (r3168)
  designs_unread: () => t('VibeSpace cannot read its list of designs right now — nothing was changed, and the design folders stay as they are. Press again in a few minutes (it reads it again by itself).'),   // card-door-in-chat (the content stores, lines 678 + 679 — r3233) — the lane's words (r3168)
  labels_unread: () => t('VibeSpace cannot read the labels you taught right now — this label was not saved. Press it again in a few minutes (it reads them again by itself).'),   // card-door-in-chat (the content stores, lines 678 + 679 — r3233) — the lane's words (r3168)
  feedback_unread: () => t('VibeSpace cannot read its feedback reports right now — nothing was changed. Press again in a few minutes (it reads them again by itself).'),   // card-door-in-chat (the content stores, lines 678 + 679 — r3233) — the lane's words (r3168)
  accounts_unread: () => t('VibeSpace cannot read your accounts list right now — nothing was changed and no conversation starts on another login meanwhile. If it does not come back by itself, see the notice in For you.'),   // bl-windows (lines 625 + follow; bl-accounts' consumers reuse it — bl-windows' wording) — the lane's words (r3168)
  setting_holds_unread: () => t('The record of raised spending ceilings could not be read, so nothing was changed. VibeSpace reads it again by itself every few minutes; press again then. You can still lower a ceiling on its row.'),   // bl-loop-b (lines 618 + 641: data/setting-holds.json) — the lane's words (r3168)
  automation_unread: () => t('Automation keys can\'t be read right now. Nothing was lost or changed, and no key works until they read again. VibeSpace reads them again by itself.'),   // login-request-card (lines 613 + 630: the automation store) — the lane's words (r3168)
  forgotten_unread: () => t('The list of browsers you set aside can\'t be read right now, so nothing was set aside or deleted. VibeSpace reads it again by itself every few minutes — try again then.'),   // bl-browser-b (browser-forgotten.json) — the lane's words (r3168)
  serve_record_unread: () => t('VibeSpace cannot read the record of its OpenCode background service right now, so nothing was started or stopped — a serve from before may still be running. It reads the record again by itself; press again in a few minutes, or read it again from For you.'),   // bl-chat-b (r3334: data/opencode-serve.json, the OpenCode serve's record) — the lane's words (r3168)
  passkeys_unread: () => t('The passkeys saved in your agent browsers can\'t be read right now, so nothing was changed and no passkey was offered to a site or registered. VibeSpace reads them again by itself every few minutes — try again then.'),   // bl-browser-b (browser-passkeys.json, r3261) — the unit's own row (r3488)
  takeovers_unread: () => t('The requests waiting for you to take over a browser can\'t be read right now, so nothing was asked, ended or run on those browsers. VibeSpace reads them again by itself every few minutes — try again then.'),   // bl-browser-b (browser-takeovers.json, r3261's second unit) — the unit's own row (r3488)
  voice_signin_unread: () => t('VibeSpace cannot read your voice sign-in right now — nothing was changed and no sign-in is lost. It reads it again by itself; try again in a few minutes, or read it again from For you.'),   // bl-chat-b (r3334 unit 2: data/dropline-oauth.json, the voice sign-in) — the lane's words (r3168)
  kept_unread: () => t('VibeSpace cannot read its list of kept browsers right now — nothing was removed or changed. Try again in a few minutes (it reads it again by itself).'),   // card-door-in-chat (r3585: browser-kept.json, the list of kept browsers) — the lane's words
  bindings_unread: () => t('VibeSpace cannot read which browser belongs to which conversation right now — nothing was changed, and no kept browser ends meanwhile. Try again in a few minutes (it reads it again by itself).'),   // card-door-in-chat (r3585: browser-env/bindings.json, which browser belongs to which conversation) — the lane's words
  vault_use_marks_unread: () => t('VibeSpace cannot read who may use your stored values right now — nothing was changed and no permission is lost. It reads the list again by itself; try again in a few minutes.'),   // lg-vault-env (unit (a): the vault-use marks) — the lane's words (r3168)
  // the units picked into the hotfix's trial after the chain (主开发 r3314): each lane's own words (r3168)
  vault_grants_unread: () => t('VibeSpace cannot read who may receive your two-step codes right now — nothing was changed and no code is given out until it reads. It reads the list again by itself; try again in a few minutes.'),   // lg-vault-env (unit (c): vault-grants.json, line 695) — the lane's words
  reset_claims_unread: () => t('The reset marks could not be read just now — VibeSpace reads them again by itself; nothing was lost or changed. Marking a limit as reset waits until they read.'),   // hub-loop-stalls (line 701: usage-reset-claims.json) — the lane's words
  'session-meta-unread': () => t('VibeSpace cannot read this conversation\'s saved details right now. Nothing has been changed: what you do meanwhile is kept and saved as soon as they read again.'),   // bl-chat-c (line 663: a conversation's record in data/session-meta) — the lane's words
  webhook_callers_unread: () => t('VibeSpace cannot read its webhook callers right now — nothing was changed, and each caller is told to try again later. It reads them again by itself in a few minutes.'),   // bl-ci (the webhook callers, callers.json) — the lane's words; its page (webhook-view.js heldWords) shows the answer's words, these now
  webhook_pairing_unread: () => t('VibeSpace cannot read its pending pairing codes right now — no code was made or used. It reads them again by itself in a few minutes.'),   // bl-ci (pair-pending.json) — the lane's words
  prices_unread: () => t("VibeSpace cannot read your edited prices right now — nothing was changed and nothing is written over them, and costs are not shown as yours until they read. It reads them again by itself in a few minutes."),   // bl-ci (r3145 unit 2: the person's edited prices, usage-history/pricing.json) — the lane's words
  vault_grant_ends_unread: () => t('VibeSpace cannot read the list of approvals that ended right now — nothing was changed. It reads it again by itself; until then the list may miss an approval that ended earlier.'),   // lg-vault-env (unit (d): vault-grant-ends.json, the chain on f98e315a9 — 主开发 r3377) — the lane's words; no route refuses by it (an end is news only)
  channel_people_unread: () => t('This account\'s list of people cannot be read right now — nothing was changed. It is read again by itself; names and your own messages are shown again once it reads.'),   // bl-mail (line 698: a channels account's people memo, channels/<account>/people.json, one hold an account) — the lane's words (主开发 r3608; no route answers the code today: the memo's writes wait or are kept)
  plugin_registry_unread: () => t('VibeSpace cannot read which plugins are on and trusted right now — nothing was changed and no plugin is lost. Try again in a few minutes (it reads the list again by itself).'),   // bl-browser-a (plugin-registry.json, 主开发 r3305 / r3470: the row in the unit for the train) — a plugin's switch, consent, install, uninstall, update, an engine profile's start
  ports_unread: () => t('VibeSpace cannot read its list of port forwards right now — nothing was changed, and the addresses published before stay published. It reads the list again by itself; try again in a few minutes.'),   // bl-machines-a (lines 702 + 749: port-forwards.json, src/port-forward.js) — the lane's words; the job card's removal keeps its own (src/lib/jobs-panel.js)
  instance_url_unread: () => t('VibeSpace cannot read its publish setting right now — nothing was changed, and this VibeSpace\'s public address stays as it was. It reads the setting again by itself; try again in a few minutes.'),   // bl-machines-a (line 646: instance-url.json, src/server/instance-url.js) — the lane's words
  record_unreadable: () => t('VibeSpace cannot read your vault right now — nothing is lost and nothing was changed. It reads it again by itself; wait a few minutes, then unlock again.'),   // lg-vault-env (unit (b): data/vault.json, the vault record) — the vault itself, not a list: its own sentence (r3168: a store boarding after the hotfix adds its own row)
  // lg-recovery (the synced stores' one read, 主开发 r3262 / r3271; rows in the unit, r3489): GET /api/sync/:store 503 and a reconnect's state-held (src/sync-store.js) — LIST holds: read again by itself, nothing written over, what is typed meanwhile kept. The page words the drafts and the uploads in place with these same sentences (src/lib/chat-input.js, src/lib/file-explorer-uploads.js)
  drafts_unread: () => t('Your saved drafts can’t be read right now: what you type stays on this page until they read again'),   // drafts.json
  stage_unread: () => t('The Stage layout can’t be read right now — nothing was changed; it is read again by itself'),   // stage-sync.json
  uploads_unread: () => t('The list of recent uploads can’t be read right now — it is read again by itself'),   // uploads-sync.json
  settings_unread: () => t('The synced settings can’t be read right now — nothing was changed; they are read again by themselves'),   // settings-sync.json
  // lg-recovery (B-f276 slice window-targets, 主开发 r4720): the window engine's two stores (src/server/window-targets-engine.js) — LIST holds
  window_leases_unread: () => t('The record of which agent holds which window can’t be read right now — nothing was changed, and the agents’ window commands wait until it reads. VibeSpace reads it again by itself in a few minutes.'),   // window-leases.json
  window_reach_unread: () => t('The share mode of each window can’t be read right now — nothing was changed, and no agent reaches a window and no share changes until it reads. VibeSpace reads it again by itself in a few minutes.'),   // window-reach.json
});
const HELD_CODE_RE = /(?:^|[_-])(?:unread|unreadable)$/i;   // THE STATED PATTERN the census finds held-looking codes by — never what the step words by (r3123)
// 主开发 r3123 (a must of this unit, found by its own read): the pattern also matches codes that are NO list hold (a vault's unreadable key,
// a proxy login, a browser's tabs, a bare «unreadable» …) — so the generic sentence reaches ONLY the codes the census classed a LIST HOLD
// without a row of their own (scripts/test-held-words.mjs: every code of the tree with that ending, whatever its status, has a class);
// every other code — a new one included, until somebody judged it — keeps its own words through the step
const HELD_GENERIC = new Set(['hosts-unread', 'mounts-unread', 'store_unread', 'plugins_unread', 'storage_unread', 'tokens_unread', 'TASK_GROUPS_UNREAD', 'todos-unread', 'records-unread', 'ledger_unreadable']);
export function heldGenericWords() { return t('VibeSpace cannot read one of its saved lists right now — nothing was changed. Try again in a few minutes.'); }
/** a held code → its row's sentence, else the generic one when the census classed it a list hold (HELD_GENERIC); any other code → null (its own words stand) */
export function familyHeldWords(code) { const c = String(code || ''); return Object.prototype.hasOwnProperty.call(HELD_WORDS, c) ? HELD_WORDS[c]() : HELD_GENERIC.has(c) ? heldGenericWords() : null; }
export function heldWordsOf(d) { return d && d.code === 'hosts-unread' ? hostsHeldWords() : d && d.code === 'mounts-unread' ? mountsHeldWords() : d && d.code === 'store_unread' ? storeHeldWords(d.held) : d ? familyHeldWords(d.code) : null; }   // r3224 / r3233: plugins_unread, providers_unread, pages_unread, status_unread are rows of the table (one lookup)
/** …and session-status.json (503 `status_unread`, 主开发 r3005): an override, a clear refused */
/** …the same store read as «none» (a status timeline, the board): what is not shown, and why */
export function statusListHeldWords() { return t('VibeSpace cannot read the conversations’ statuses right now, so none is shown. Nothing is lost: they come back when they read (it tries again every few minutes); status changes wait until then.'); }
export function statusHeldWords() { return t('VibeSpace cannot read the conversations’ statuses right now — nothing was changed. Try again in a few minutes (it reads them again by itself).'); }
/** B-225b (lane lg-store-writes, the persistence holds): a persistence store the hub's START could not read is HELD — 503 `store_unread`
 *  with `held` {file, kind, code, since, rung}. ONE sentence by its file and its kind, in the page's words (the hub's are English). */
export function storeWhatOf(file) {
  const f = String(file || '');
  return f === 'layouts.json' ? t('your desktops') : f === 'user-state.json' ? t('your conversation list') : f === 'bookmarks.json' ? t('your bookmarks')
    : f === 'custom-themes.json' ? t('your custom themes') : f === 'settings.json' ? t('your settings')
    : f === 'layout-history' ? t('the rollback points of your desktops') : t('a saved list');   // B-225b's remainder: the points' own name
}
export function storeHeldWords(held) {
  if (Array.isArray(held)) return held.length === 1 ? storeHeldWords(held[0]) : t('VibeSpace cannot read {n} of its saved files right now — nothing is written over them (Details names them).', { n: held.length });   // a refusal naming several holds (the export, the import)
  const what = storeWhatOf(held && held.file), kind = held && held.kind;
  if (kind === 'damaged') return t('VibeSpace could not read {what}: the file is not what it should be. Nothing is written over it — replace it from a backup, or start it empty.', { what });
  if (kind === 'not-allowed') return t('VibeSpace is not allowed to read {what} — nothing is written over it. Check the permissions of the data folder.', { what });
  return t('VibeSpace cannot read {what} right now — nothing was changed and nothing is written over it. It reads it again by itself.', { what });
}
/** B-225b's second half: a store whose write the storage REFUSED (its change kept in memory, written again by the hold's ladder) — ONE
 *  sentence by its file, in the page's words; several → the count. Said on the strip; a press's own refusal says `storeRestoreUnsavedWords` */
export function storeUnsavedWords(u) {
  if (Array.isArray(u)) return u.length === 1 ? storeUnsavedWords(u[0]) : t("Changes to {n} of VibeSpace’s saved files are not being saved: the storage refused the writes. They are kept here and written again by themselves (Details names them).", { n: u.length });
  // B-225b's remainder (主开发 r1353 (2)(3)): the rollback points are no change of the person's — their own sentences: REFUSED (let go,
  // counted) or only LATE (the desktops went on without waiting for them) — nothing here says anything of the desktops: that is
  // the desktops' own row's to say (主开发 r1387 (4))
  if (u && u.file === 'layout-history') return u.code === 'queued'
    ? t('The rollback points of your desktops are not saved yet: the storage has not taken the write in time.')
    : t('The rollback points of your desktops are not being saved: the storage refused the write; the points made meanwhile are lost.') + (u.lost > 1 ? ' ' + t('{n} rollback points were lost.', { n: u.lost }) : '');
  // (B-0248 step 2: a write only QUEUED past the store writer's bound — code «queued» — is not refused: said as not taken in time)
  if (u && u.code === 'queued') return t("Changes to {what} are not saved yet: the storage has not taken the write in time. They are kept here and written by themselves.", { what: storeWhatOf(u.file) });
  return t("Changes to {what} are not being saved: the storage refused the write. They are kept here and written again by themselves.", { what: storeWhatOf(u && u.file) });
}
/** B-225b's remainder (主开发 r1318): what the hub's START knows of the LAST stop — `known` (a layouts write was owed and did not land:
 *  said until a person notes it) or `maynot` (no clean stop, nothing more known: said once and quietly). `time` = the moment in the
 *  page's words (page-time's stampAt), or '' when it is not known */
export function storeStopWords(fact, time = '') {
  // r1387 (6): the cause as it was (refused, or only not taken in time) — and WHERE the earlier layouts are, for a person to look
  const where = ' ' + t('Earlier layouts are kept as rollback points: {path}.', { path: `⚙ → ${t('System')} → ${t('Restore a previous layout…')}` });
  if (fact && fact.kind === 'known') {
    const late = fact.cause === 'late';
    return (late
      ? (time ? t('When VibeSpace last stopped, your latest desktop changes (made after {time}) had not reached the disk in time. The desktops shown are the last ones saved.', { time })
        : t('When VibeSpace last stopped, your latest desktop changes had not reached the disk in time. The desktops shown are the last ones saved.'))
      : (time ? t('When VibeSpace last stopped, your latest desktop changes (made after {time}) had not been saved: the storage refused the write. The desktops shown are the last ones saved.', { time })
        : t('When VibeSpace last stopped, your latest desktop changes had not been saved: the storage refused the write. The desktops shown are the last ones saved.'))) + where;
  }
  return (time
    ? t('VibeSpace stopped without a clean stop: desktop changes from its last moments (after {time}) may not have been saved.', { time })
    : t('VibeSpace stopped without a clean stop: desktop changes from its last moments may not have been saved.')) + where;
}
export function storeRestoreUnsavedWords(code = null) { if (code === 'queued') return t("Restored here, but not saved yet: the storage has not taken the write in time. The restore is kept and written by itself — a restart before then brings back the older desktops."); return t("Restored here, but not saved: the storage refused the write. The restore is kept and written again by itself — a restart before then brings back the older desktops."); }
function refusalWords(body) {
  if (body && typeof body === 'object' && body.code === 'store_unread') return { ...body, said: body.error, error: storeHeldWords(body.held) };   // B-225b: a held store, in the page's words
  if (body && typeof body === 'object' && body.code === 'store_unsaved') return { ...body, said: body.error, error: storeRestoreUnsavedWords(body.unsaved && body.unsaved.code) };   // B-225b's second half: a restore whose write the storage refused
  if (body && typeof body === 'object' && body.code === 'store_appeared') return { ...body, said: body.error, error: t('A saved file appeared since VibeSpace started — it was read and kept; this change was not made. Make it again.') };
  if (body && typeof body === 'object' && body.code === 'point_unread') return { ...body, said: body.error, error: t('This rollback point could not be read — nothing was restored. Pick another.') };   // B-225b's remainder P5
  if (body && typeof body === 'object' && body.code === 'hosts-unread') return { ...body, said: body.error, error: hostsHeldWords() };   // the server's words kept as `said`
  if (body && typeof body === 'object' && body.code === 'mounts-unread') return { ...body, said: body.error, error: mountsHeldWords() };
  const fw = body && typeof body === 'object' && body.code && (body.error || body.ok === false) ? familyHeldWords(body.code) : null;   // B-f276 family (r3032): every other held code, by the table or the generic sentence
  if (fw) return { ...body, said: body.error, error: fw };
  return body && typeof body === 'object' && body.error === 'cross-site' ? { ...body, code: 'cross-site', error: t('This action came from another site and was refused') } : body;
}
export { HELD_CODE_RE, HELD_GENERIC };   // the census reads the pattern and the classed list holds (scripts/test-held-words.mjs)

/** «NOT ON DISK» REACHES THE PERSON (lane lg-store-writes, the U4/U5 cure — 主开发's as-if-must): an answer carrying
 *  `notOnDisk: true` (the act is applied in the hub's memory; its store's file was not written inside the bound — the store
 *  writer keeps trying) is SAID once per answer, in the release's own sentence (the status route's, the channels index's —
 *  zh / ja beside it). fetchJson and api() ask it of every answer; a helper of its own (the Task Groups' _taskApi, the
 *  import button) asks it too. → whether it was said */
export function sayNotOnDisk(body) {
  if (!body || typeof body !== 'object' || body.notOnDisk !== true) return false;
  // by its CODE (lane lg-store-writes, the moved2 cure 2): an act whose step that cannot be undone RIDES the landing (a removal's
  // files, an answer the job hears) — saved here, it finishes by itself when the storage answers
  if (body.code === 'finishes-on-landing') { try { showToast(t('Saved here — it finishes by itself when the storage answers (it is slow or failing). A restart before then undoes it.'), { type: 'error', duration: 12000 }); } catch { } return true; }
  try { showToast(t('Saved, but not on disk yet — the storage has not written it (it is slow or failing). It stays in memory and is written when the storage can; a restart before then loses it.'), { type: 'error', duration: 12000 }); } catch { }
  return true;
}

/** Fetch JSON with silent error handling. Returns null on failure. */
export async function fetchJson(url, opts) {
  try {
    const res = await fetch(url, opts);
    const body = refusalWords(await res.json());
    sayNotOnDisk(body);
    return body;
  } catch { return null; }
}

/** B-225b R4: a user-state answer that LANDED — the server's state: not a refusal (`error` words — a held list's store_unread, any
 *  other) and not a failed fetch (null). A key written WHOLE (PATCH merge-only replaces the key) is written only over a map read
 *  from one of these — never over the defaults a refused read left (they would land over the real map at the lift). */
export const stateLanded = (st) => !!st && typeof st === 'object' && !Array.isArray(st) && typeof st.error !== 'string';

/** ONE text-filter predicate for sessions — local AND remote-discovered
 *  (2.275.0, CS unification). There were two hand-synced copies: the local one
 *  matched backend/agent fields, the remote one did not, so the SAME query
 *  silently meant different things per machine (typing "codex" listed every
 *  local codex session and not one remote codex rollout). Discovered records
 *  simply lack some fields — the `||` chain skips them, which is exactly the
 *  behaviour a single implementation should have. */
export function sessionMatchesFilter(s, f) {
  if (!f) return true;
  const fields = [s.cwd || s.projDir, s.sessionId, s.sessionKey, s.name, s.webuiName,
    s.backend, s.sourceKind, s.agentKind, s.agentRole, s.agentNickname, s.hostName];
  for (const v of fields) if (v && String(v).toLowerCase().includes(f)) return true;
  return false;
}

/** THROWING sibling of fetchJson (2.272.1, campaign shared primitive #1).
 *  fetchJson never throws — it returns null on a network/parse failure and
 *  hands back `{error}` bodies as ordinary data — so `try { await fetchJson }
 *  catch` is DEAD CODE and every call site that forgets to check the result
 *  silently claims success on failure (the single largest class in the
 *  lag/silent-failure audit: 49 findings). Use api() on any USER-ACTION path:
 *  it throws a real Error for both failure shapes, so one try/catch around a
 *  dialog handler is enough, and the message is user-showable.
 *  Reads that legitimately tolerate absence keep fetchJson. */
export async function api(url, opts) {
  let res;
  try { res = await fetch(url, opts); }
  catch { throw new Error('Server unreachable — check your connection and retry'); }
  let body = null;
  try { body = refusalWords(await res.json()); } catch { body = null; }
  if (!res.ok) throw new Error(body?.error || `${res.status} ${res.statusText || 'request failed'}`);
  if (body && typeof body === 'object' && body.error) throw new Error(String(body.error));
  sayNotOnDisk(body);
  return body;
}

/** Host-scoped transition-state chip (2.272.1, campaign shared primitive #3).
 *  ONE visual language for the three states every host-scoped surface needs
 *  and most of them lacked: checking / stale / unreachable. Returns an
 *  HTMLElement (callers append it); `age` is a ms timestamp of the data.
 *  state: 'pending' | 'stale' | 'error' | 'ok'. */
export function hostStateChip(state, { text = '', age = 0, title = '' } = {}) {
  const el = document.createElement('span');
  el.className = 'host-state-chip host-state-' + state;
  let label = text;
  if (!label) {
    // the default words in the reader's language (lane ui-language, the reader's round: «as of 4 分钟前» mixed two languages)
    if (state === 'pending') label = t('checking…');
    else if (state === 'stale') label = age ? t('as of {when}', { when: markAgo(age) }) : t('cached');   // a chip's age is a MARK (the owner's h / d ruling)
    else if (state === 'error') label = t('unreachable');
  }
  el.textContent = label;
  if (title) el.title = title;
  return el;
}

/** «3 分钟前» / «2 hours ago» for staleness labels (shared by the chip + callers) — the reader's units, through page-time
 *  (lane ui-language: it printed English «3m ago» in every language). */
export function agoText(ts) { return pageAgo(ts); }

/** Clipboard copy with execCommand fallback for non-HTTPS */

/** Full-screen image zoom overlay (chat thumbnails, pending attachment chips).
 *  Build the <img> via PROPERTY assignment, NOT innerHTML: the src is often a
 *  browser-decoded data: url and a hostile mediaType can smuggle a literal
 *  `" onerror=` past HTML escaping — property assignment is unescapable.
 *  data-popover joins the global Escape-close protocol (created-and-removed). */

/** Task Group color resolver (2.230.0, user request "颜色太少, 会建很多group").
 *  Explicit color wins; the sentinel 'none' = deliberately neutral; UNSET
 *  falls back to a DETERMINISTIC auto color — a stable id hash spread around
 *  the hue wheel by the golden angle, so ANY number of groups stay visually
 *  distinct with zero user action, identical on every client/restart (pure
 *  function of the id, nothing stored). Callers keep their own neutral
 *  styling when this returns null. */
export function taskGroupColor(t) {
  if (!t) return null;
  if (t.color === 'none') return null;
  if (t.color) return t.color;
  return autoTaskColor(t.id || t.title || '');
}
export function autoTaskColor(id) {
  return `hsl(${autoTaskHue(id)}, 62%, 52%)`;
}
export function autoTaskHue(id) {
  // FNV-1a + murmur-style avalanche — the STABLE ANCHOR hue for a group id.
  // Stateless hashing alone is birthday-bounded (near-collisions guaranteed
  // with enough groups), which is why rendering goes through
  // assignDistinctTaskColors below; this stays as the anchor + the fallback
  // when no group list is available.
  const str = String(id);
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  h ^= h >>> 16; h = Math.imul(h, 2246822507) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 3266489909) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) % 360;
}

// Auto color+texture sequence: shared with the server-side allocator —
// single source of truth in src/task-color-seq.js (see its header).
export { seqTaskColor } from '../task-color-seq.js';
const _seqNote = null;

export function showImageOverlay(src) {
  const overlay = document.createElement('div');
  overlay.className = 'chat-img-overlay';
  overlay.dataset.popover = '1';
  const img = document.createElement('img');
  img.src = src; img.alt = 'image';
  overlay.appendChild(img);
  overlay.onclick = () => overlay.remove();
  document.body.appendChild(overlay);
}

// TRUE stylesheet default of a :root CSS variable, ignoring any inline
// override on documentElement. getComputedStyle alone is WRONG for a var the
// caller itself drives: once root.style sets it, computed = the override — a
// "within-2px-of-default ⇒ reset" check then compares the value against
// ITSELF and resets on every apply (the 2.250.1 toolbar-resize snap-back).
// Temporarily lifting the override forces one sync style recalc — fine for
// rare interactions (drag end, layout restore), not for per-frame use.
export function cssVarDefault(name, fallback) {
  const root = document.documentElement;
  const cur = root.style.getPropertyValue(name);
  const pri = cur ? root.style.getPropertyPriority(name) : '';
  if (cur) root.style.removeProperty(name);
  const d = parseInt(getComputedStyle(root).getPropertyValue(name)) || fallback;
  if (cur) root.style.setProperty(name, cur, pri); // keep an 'important' flag intact through the round-trip
  return d;
}

// ── The address to hand to a HUMAN for something hosted on this instance ──
// The browser's own origin is only right when nothing better is configured.
// Once the instance is mapped to a public URL (Ports panel → This VibeSpace,
// or agentd.publicUrl), THAT is the address that works for everyone — the
// owner mapped an frp URL and every UI surface kept handing out this box's
// LAN hostname, because each one joined with location.origin (2.367.3).
// Absolute inputs pass through untouched; the server already resolves them.
let _instanceUrl = null;
export function setInstanceUrl(u) { _instanceUrl = (typeof u === 'string' && /^https?:\/\//i.test(u)) ? u.replace(/\/+$/, '') : null; }
export function getInstanceUrl() { return _instanceUrl; }
export function absUrl(pathOrUrl) {
  const s = String(pathOrUrl || '');
  if (/^https?:\/\//i.test(s)) return s;              // already absolute (server-resolved)
  if (!s.startsWith('/')) return s;
  return (_instanceUrl || location.origin.replace(/\/+$/, '')) + s;
}

/** Copy `text` → a promise of true (it is on the clipboard) / false (the clipboard refused — the API and the fallback alike).
 *  lane ui-needs-a-button (reader follow-up #0): the answer is TOLD — a caller may show the text to select by hand on false;
 *  a caller that ignores the answer keeps working. */
export function copyText(text) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).then(() => true, () => _fallbackCopy(text));
  }
  return Promise.resolve(_fallbackCopy(text));
}
/** The textarea + execCommand fallback (a plain-http page has no clipboard API) → whether the browser says it copied. */
function _fallbackCopy(text) {
  let copied = false;
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { copied = document.execCommand('copy') === true; } catch { copied = false; }
    ta.remove();
  } catch { copied = false; }
  return copied;
}

// ── StateSync: unified versioned state sync with diff broadcast ──
// Each store tracks a version. On reconnect, requests missed ops from server.
// Components listen via events: stateSync.on('drafts', 'chat:sess-1', handler)
// THE ARRIVAL RULE (lane statesync-last-arrival, B-cede): the server answers each own set with the version it produced
// (`state-ack`); a remote op the server ordered BEFORE an own set of the same key never lands over it, and one arriving
// while an own set of that key awaits its ack waits for the ack (src/sync-arrival.js, judged in _applyOp only).
class StateSync {
  constructor(wsManager) {
    this.ws = wsManager;
    this.stores = {};    // name → { version, data, listeners, pending, acked, held }
    this._globalHandler = (msg) => {
      if (msg.type === 'state-sync') this._applyOp(msg.store, msg);
      else if (msg.type === 'state-ack') this._applyAck(msg.store, msg);
      else if (msg.type === 'state-snapshot') this._applySnapshot(msg.store, msg.data, msg.version, msg);
      else if (msg.type === 'state-held') this._applyUnread(msg.store, msg);   // lane lg-recovery (r3262 / r3271): the hub cannot read the store
      else if (msg.type === 'state-held-putback') this._applyHeldPutback(msg.store, msg);   // r3890 A: Stop's put-back while the store is held
      else if (msg.type === 'state-restore-refused') this._applyRestoreRefused(msg.store, msg);   // law (E), r4040: the hub kept a newer write
    };
    wsManager.onGlobal(this._globalHandler);
    // On reconnect, request missed ops for all stores
    this._stateHandler = (connected) => {
      // the socket dropped: an own set in flight is never answered on it — its held ops are judged now (resync converges)
      // r4180 1: a restore the hub did not answer is NOT lost at a drop — its old copy goes back into the page's own copy (the box told),
      // as a restore that meets a new hold does
      if (!connected) { for (const [name, s] of Object.entries(this.stores)) { s.pending.clear(); if (s.restoring) for (const [k, v] of s.restoring) { s.data[k] = v; this._notify(s, k, v); } s.restoring = null; for (const key of [...s.held.keys()]) this._release(name, key); } return; }
      const versions = {}, unread = [];
      for (const [name, s] of Object.entries(this.stores)) { versions[name] = s.version; if (s.unread) unread.push(name); }
      // r3654 3: a store this page holds as UNREAD is named — a hub that reads it again answers with the full snapshot
      if (Object.keys(versions).length) this.ws.send({ type: 'state-resync', versions, ...(unread.length ? { unread } : {}) });
    };
    wsManager.onStateChange(this._stateHandler);
  }

  // Load initial snapshot from server. Resolves true once the server's snapshot is in (false: it could not be read);
  // a second caller awaits the SAME load — a surface reading a store at its mount (the Doc window's comments, lane
  // doc-comments-synced) must never take a store still loading for an empty one.
  init(storeName) {
    if (this.stores[storeName]) return this.stores[storeName].loaded;
    // pending: key → own sets not yet acked; acked: key → the version of the last acked own set; held: key → remote ops
    // waiting for that ack (the arrival rule's three facts)
    // saw: this page holds the store's data (false while a page that opened during a hold has never read it — r3654 2)
    const s = this.stores[storeName] = { version: 0, data: {}, listeners: new Map(), loaded: null, pending: new Map(), acked: new Map(), held: new Map(), saw: false };
    s.loaded = (async () => {
      try {
        const epoch = s.snapEpoch || 0;   // r3890: a snapshot that lands on the socket while this read is out is newer than its answer
        const res = await fetch(`/api/sync/${storeName}`);
        const snap = await res.json();
        const handed = snap && snap.held === true && Array.isArray(snap.putbacks) ? snap.putbacks : [];
        // the store was lifted (or answered) since: this older answer is dropped — but put-back words the hub HANDED in it left the
        // hub's memory for this page, so they land here all the same (r3972: owed words leave the hub only to a page that has them)
        if ((s.snapEpoch || 0) !== epoch) { for (const pb of handed) this._landPutback(storeName, pb, snap.code); return true; }
        // lane lg-recovery (主开发 r3262 / r3271, law (a)): the hub could not read this store — HELD by name: the page starts empty AND
        // held (init answers false: no surface takes it for «nothing stored»), and keeps what it holds — with any put-back the hub owed
        if (snap && snap.held === true) { this._applyUnread(storeName, snap); for (const pb of handed) this._applyHeldPutback(storeName, { ...pb, code: snap.code }); return false; }
        s.data = snap.data || {};
        s.version = snap.version || 0;
        s.saw = true;
        return !!res.ok;
      } catch { return false; }
    })();
    return s.loaded;
  }

  get(storeName, key) { return this.stores[storeName]?.data[key]; }
  getAll(storeName) { return this.stores[storeName]?.data || {}; }

  set(storeName, key, value) {
    const s = this.stores[storeName];
    if (!s) return;
    // r3654, THE PAGE OWNS WHAT IT HOLDS UNSENT: while the store is UNREAD nothing is sent for it (the hub takes nothing while held).
    // TEXT (a chat draft, a document's comments) stays on this page, in its map, and is sent at the store's first snapshot; any other
    // unit acts for this page only, is NOT kept, and the page says so once (onUnread's { notKept })
    if (s.unread) {
      (s.changedWhileUnread || (s.changedWhileUnread = new Set())).add(key);
      if (value == null || value === '') delete s.data[key]; else s.data[key] = value;
      if (this._isText(storeName)) (s.typedWhileUnread || (s.typedWhileUnread = new Map())).set(key, value == null || value === '' ? null : value);
      else if (!s.unread.notKeptSaid) { s.unread.notKeptSaid = true; this._tellUnread(storeName, s.unread, { notKept: true }); }
      return;
    }
    s.pending.set(key, (s.pending.get(key) || 0) + 1);
    if (s.restoring) s.restoring.delete(key);   // r4106: what the person types now supersedes a restore still in flight
    if (value == null || value === '') {
      delete s.data[key];
      this.ws.send({ type: 'state-set', store: storeName, key, value: '', basedOn: s.version });
    } else {
      s.data[key] = value;
      this.ws.send({ type: 'state-set', store: storeName, key, value, basedOn: s.version });
    }
  }

  /** LAW (E) (r4040): the rollback re-push of ONE unit, sent AS A RESTORE — the hub applies it only to a key nothing has written or
   *  cleared in its life, else answers `state-restore-refused` with its value. An own set as far as the arrival rule goes */
  _restore(storeName, key, value) {
    const s = this.stores[storeName];
    if (!s || s.unread || value == null || value === '') return;   // a restore never carries absence
    s.pending.set(key, (s.pending.get(key) || 0) + 1);
    // r4106 (the follow): the box keeps showing the hub's value while the hub decides — the page's old copy lands only when the hub
    // applies it (its ack), so a refused restore never flashes the old text in the box
    (s.restoring || (s.restoring = new Map())).set(key, value);
    this.ws.send({ type: 'state-set', store: storeName, key, value, basedOn: s.version, restore: true });
  }
  /** the hub refused a restore (law (E) 4): this page takes the hub's value for that key — unless an own later set of it is still
   *  out (a write: the hub takes it). The value is the hub's latest for the key, so the ops queued behind the restore are older */
  _applyRestoreRefused(storeName, msg) {
    const s = this.stores[storeName];
    if (!s || !msg || typeof msg.key !== 'string') return;
    if (s.restoring) s.restoring.delete(msg.key);
    const n = (s.pending.get(msg.key) || 0) - 1;
    if (n > 0) { s.pending.set(msg.key, n); return; }
    s.pending.delete(msg.key);
    s.held.delete(msg.key);
    if (msg.value === undefined || msg.value === null || msg.value === '') delete s.data[msg.key]; else s.data[msg.key] = msg.value;
    this._notify(s, msg.key, s.data[msg.key] === undefined ? '' : s.data[msg.key]);
  }

  // Listen for changes to a specific key (or '*' for all keys in a store)
  on(storeName, key, handler) {
    const s = this.stores[storeName];
    if (!s) return;
    if (!s.listeners.has(key)) s.listeners.set(key, []);
    s.listeners.get(key).push(handler);
  }

  off(storeName, key, handler) {
    const arr = this.stores[storeName]?.listeners.get(key);
    if (arr) { const i = arr.indexOf(handler); if (i >= 0) arr.splice(i, 1); }
  }

  _applyOp(storeName, op) {
    const s = this.stores[storeName];
    if (!s) return;
    if (op.version > s.version) s.version = op.version;
    const verdict = arrivalVerdict({ remote: op, own: { ackedVersion: s.acked.get(op.key), pending: s.pending.has(op.key) } }); // THE ARRIVAL RULE — its one caller
    if (verdict === 'queue') { const q = s.held.get(op.key); if (q) q.push(op); else s.held.set(op.key, [op]); return; }
    if (verdict === 'drop') return;
    s.acked.delete(op.key); // a newer op superseded the own set — every later op is newer still
    if (op.op === 'set') s.data[op.key] = op.value;
    else if (op.op === 'delete') delete s.data[op.key];
    this._notify(s, op.key, op.op === 'delete' ? '' : op.value, op); // the op rides along: a put-back's `prepended` (lane stop-refills-composer)
  }

  // The server's answer to an own set: the version it produced. The key's last outstanding ack releases its held ops.
  _applyAck(storeName, ack) {
    const s = this.stores[storeName];
    if (!s || typeof ack.key !== 'string') return;
    if (Number.isSafeInteger(ack.version) && ack.version > 0) {
      if ((s.acked.get(ack.key) || 0) < ack.version) s.acked.set(ack.key, ack.version);
      if (ack.version > s.version) s.version = ack.version;
    }
    const n = (s.pending.get(ack.key) || 0) - 1;
    if (n > 0) { s.pending.set(ack.key, n); return; }
    s.pending.delete(ack.key);
    const restored = s.restoring ? s.restoring.get(ack.key) : undefined;   // r4106: the hub applied this page's restore — now its box shows it (none after a drop)
    if (restored !== undefined) { s.restoring.delete(ack.key); s.data[ack.key] = restored; this._notify(s, ack.key, restored); }
    this._release(storeName, ack.key);
  }

  _release(storeName, key) {
    const s = this.stores[storeName];
    const q = s && s.held.get(key);
    if (!q) return;
    s.held.delete(key);
    for (const op of q) this._applyOp(storeName, op);
  }

  /** the hub cannot read this store (`state-held`, or the first load's 503): the page keeps what it holds — no snapshot, no rollback
   *  push, no listener told '' — and its surfaces say it once (onUnread) */
  _applyUnread(storeName, msg) {
    const s = this.stores[storeName];
    if (!s) return;
    const first = !s.unread;
    const code = String((msg && msg.code) || storeName + '_unread');
    if (first) s.unread = { code }; else s.unread.code = code;
    // r3654: the hub's answer to ONE op this page sent before it knew (`key`): not taken — its wait released; a text unit stays here
    if (msg && typeof msg.key === 'string') {
      const n = (s.pending.get(msg.key) || 0) - 1;
      if (n > 0) s.pending.set(msg.key, n); else { s.pending.delete(msg.key); this._release(storeName, msg.key); }
      const m = this._isText(storeName) ? (s.typedWhileUnread || (s.typedWhileUnread = new Map())) : null;
      // r4106: a restore that met a NEW hold — its words are this page's text now (sent at the next lift by rule (C)); very rare
      const restoring = s.restoring && s.restoring.has(msg.key) ? s.restoring.get(msg.key) : undefined;
      if (restoring !== undefined) { s.restoring.delete(msg.key); s.data[msg.key] = restoring; }
      if (m && !m.has(msg.key)) { const v = s.data[msg.key]; m.set(msg.key, v === undefined || v === '' ? null : v); }
    }
    if (first) this._tellUnread(storeName, s.unread, null);
  }
  /** STOP's PUT-BACK WHILE THE STORE IS HELD (r3890 A): its words land on this page as typed text — in front of the unit's draft here,
   *  kept in the unsent map like anything typed while unread, told to the composer as a PREFIX (it lands them in front of its live
   *  box, as a put-back lands) — and travel at the store's first snapshot as every held-time text does */
  _applyHeldPutback(storeName, msg) {
    const s = this.stores[storeName];
    if (!s || !msg || typeof msg.key !== 'string' || typeof msg.prefix !== 'string' || !msg.prefix) return;
    if (!s.unread) this._applyUnread(storeName, { code: msg.code });
    const cur = typeof s.data[msg.key] === 'string' ? s.data[msg.key] : '';
    const value = msg.prefix + cur;
    s.data[msg.key] = value;
    if (this._isText(storeName)) (s.typedWhileUnread || (s.typedWhileUnread = new Map())).set(msg.key, value);
    this._notify(s, msg.key, value, { prepended: msg.prefix.length });
  }
  /** a put-back the hub handed in a reply this page reads late (r3972): held → the held road; read already → an ordinary set, its words
   *  in front of the unit's draft, told to the composer as a prefix */
  _landPutback(storeName, pb, code) {
    const s = this.stores[storeName];
    if (!s || !pb || typeof pb.key !== 'string' || typeof pb.prefix !== 'string' || !pb.prefix) return;
    if (s.unread) { this._applyHeldPutback(storeName, { ...pb, code }); return; }
    const cur = typeof s.data[pb.key] === 'string' ? s.data[pb.key] : '';
    const value = pb.prefix + cur;
    this.set(storeName, pb.key, value);
    this._notify(s, pb.key, value, { prepended: pb.prefix.length });
  }
  /** the stores whose units are a person's TEXT (r3654 1): what is typed while unread stays on the page and is sent at the first snapshot */
  _isText(storeName) { return storeName === 'drafts'; }
  /** A PAGE THAT NEVER SAW THE DATA JOINS (r3654 2): the file's unit, then what was typed here, once — { value, prepended } (the saved
   *  text is a PREFIX of the result, so the composer lands it in front of its live box, as a put-back lands), or null: nothing to send */
  _joinUnseen(saved, typed) {
    const SEP = '\n\n';   // the put-back's separator (src/queue-putback.js PUTBACK_SEP)
    if (saved === undefined || saved === null || saved === '') return { value: typed };
    if (typeof saved === 'string' && typeof typed === 'string') {
      if (typed === saved || typed.includes(saved)) return { value: typed };
      if (saved.includes(typed)) return null;   // nothing new: the saved text already holds it
      return { value: saved + SEP + typed, prepended: (saved + SEP).length };
    }
    if (Array.isArray(saved) && Array.isArray(typed)) {   // a document's comments: the saved rows, then the new ones
      const id = (r) => (r && typeof r === 'object' && r.id != null ? 'id:' + r.id : JSON.stringify(r));
      const have = new Set(saved.map(id));
      const add = typed.filter((r) => !have.has(id(r)));
      return add.length ? { value: [...saved, ...add] } : null;
    }
    return null;   // not text: never sent over a unit this page never saw
  }
  /** the store's unread facts ({ code }) — null when it reads */
  unreadOf(storeName) { return this.stores[storeName]?.unread || null; }
  /** a surface's ONE notice: handler(store, unread | null, { setAside } | null) at each change; → the unsubscribe */
  onUnread(handler) { (this._unreadHandlers || (this._unreadHandlers = [])).push(handler); return () => { const a = this._unreadHandlers, i = a.indexOf(handler); if (i >= 0) a.splice(i, 1); }; }
  _tellUnread(storeName, unread, facts) { for (const h of [...(this._unreadHandlers || [])]) { try { h(storeName, unread, facts); } catch { } } }

  _applySnapshot(storeName, data, version, msg) {
    const s = this.stores[storeName];
    if (!s) return;
    // r3654, THE PAGE OWNS WHAT IT HOLDS UNSENT: at the store's FIRST snapshot (the lift's, or a later hub's first answer after a
    // restart) each unit typed here while unread is sent ONCE — a page that held the data before the hold sends a true edit; a page
    // that never saw it (it opened during the hold) JOINS a text unit (the file's, then what was typed) and sends a deletion of a unit
    // it never saw as nothing. Then the map is empty.
    const typed = s.typedWhileUnread && s.typedWhileUnread.size ? new Map(s.typedWhileUnread) : null;
    // r3890 C: «had seen the data» means «had seen THIS version» — a unit of this page is a true edit only when the snapshot is the
    // version it last saw; a newer one (the page slept through a lift, another page saved since) makes its text JOIN and its deletion
    // nothing, as on a page that never saw the data
    // A lift that set torn bytes aside or found no file is a FRESH START (its counter begins again): no page's last version is that
    // one, whatever its number (r3972), so nothing of this page counts as a true edit there
    const sawBefore = s.saw !== false;   // r3972: taken BEFORE the reset — the rollback re-push below stands for such a page
    const fresh = !!(msg && (msg.setAside || msg.fresh));
    const saw = sawBefore && !fresh && (version || 0) === s.version;
    const changed = s.changedWhileUnread || null;
    const wasUnread = !!s.unread;
    s.snapEpoch = (s.snapEpoch || 0) + 1;
    s.unread = null; s.typedWhileUnread = null; s.saw = true; s.changedWhileUnread = null;
    const oldData = s.data;
    const oldKeys = new Set(Object.keys(oldData));
    // Server ROLLBACK defense: a snapshot whose version is BELOW what this
    // client already applied means the store was reset/rolled back (crash-class
    // restart lost the debounced save). Local data is the newer truth on a
    // single-user instance — adopt the server's version base, then re-push
    // every differing key so both sides converge forward instead of silently
    // diverging (e.g. a draft typed in the ~2s before an OOM kill).
    // A FRESH START (r3972) is a rollback whatever its number: the file gave nothing, so a page that saw the data holds the newer truth
    const rolledBack = (version || 0) < s.version || fresh;
    s.data = data || {};
    s.version = version || 0;
    // a key with an own set still awaiting its ack keeps the own value: the server answers that set AFTER this snapshot,
    // so the snapshot's value is an op of the key like any other — the arrival rule holds it and judges it at the ack
    for (const key of [...s.pending.keys()]) {
      const op = key in s.data ? { op: 'set', key, value: s.data[key], version: s.version } : { op: 'delete', key, version: s.version };
      if (key in oldData) s.data[key] = oldData[key]; else delete s.data[key];
      this._applyOp(storeName, op);
    }
    const sent = new Map();   // key → { value, prepended? }: what this page sends now, of what it typed while unread
    if (typed) for (const [key, value] of typed) {
      if (saw) sent.set(key, { value: value === null ? '' : value });
      else if (value !== null) { const j = this._joinUnseen(s.data[key], value); if (j) sent.set(key, j); }
    }
    for (const [key, j] of sent) this.set(storeName, key, j.value);   // ordinary sets (set() mutates s.data)
    // the RELEASE's rollback defense, for a page that had seen the data (r3972 — a torn lift at version 1, a save that never reached the
    // file): its view is the newer truth and is pushed again; a unit changed while unread is left to rule (C) above (text) or was said
    // not kept (structured): never pushed twice
    // LAW (E) (r4040): each unit goes AS A RESTORE, which never beats a write — the hub applies it only to a key nothing has written or
    // cleared in its life (a page that wakes late meets the newer writes: refused, it takes the hub's value); a key this page LACKS is
    // not pushed at all (it never restores absence)
    if (rolledBack && sawBefore) {
      for (const key of oldKeys) {
        if (sent.has(key) || (typed && typed.has(key)) || (changed && changed.has(key))) continue;
        const localVal = oldData[key];
        if (localVal === undefined || localVal === '') continue;
        // the box keeps the hub's value until the hub applies the restore (its ack lands it); a refusal answers with the hub's value
        if (JSON.stringify(localVal) !== JSON.stringify(s.data[key] ?? '')) this._restore(storeName, key, localVal);
      }
    }
    // Notify for all changed keys — a joined text unit rides as a PREFIX (the composer lands it in front of its live box)
    for (const key of new Set([...oldKeys, ...Object.keys(s.data)])) {
      const newVal = s.data[key] || '';
      const j = sent.get(key);
      this._notify(s, key, newVal, j && j.prepended ? { prepended: j.prepended } : undefined);
    }
    if (wasUnread || (msg && msg.setAside)) this._tellUnread(storeName, null, msg && msg.setAside ? { setAside: String(msg.setAside) } : null);
  }

  // handlers get (value, key, op): `op` = the remote op that changed the key (undefined from a snapshot) — every listener
  // but the composer's ignores it; the composer lands a put-back (`op.prepended`) as a prefix (src/lib/chat-input.js)
  _notify(s, key, value, op) {
    const specific = s.listeners.get(key);
    const wildcard = s.listeners.get('*');
    if (specific) for (const h of specific) h(value, key, op);
    if (wildcard) for (const h of wildcard) h(value, key, op);
  }
}

let _stateSync = null;

// ── UI scale (DPI) + UI font scale — per-DEVICE prefs like the language ──────
// uiScale = a CSS zoom on <body> (whole-app "display scaling"); uiFontScale =
// a text-only multiplier consumed by curated chrome font-size rules via
// --ui-font-scale. Stored as PERCENT ints in localStorage (never synced —
// different monitors want different scales). applyUiPrefs() runs before App
// boots and again on every gs-menu change. Desktop-only for the zoom half
// (mobile keeps OS scaling + the 100vh!important sidebar override intact).
export const UI_SCALE_MIN = 60, UI_SCALE_MAX = 200, UI_FONT_MIN = 75, UI_FONT_MAX = 175; // widened per user request (was 80-130 / 85-140)
let _uiScaleVal = 1;
export function uiScale() { return _uiScaleVal; } // drag-delta compensation factor (viewport px → layout px = /uiScale())
/** inc-mtdrm922's counter-zoom rule: a container that must sit at NET zoom 1 under
 *  the body's DPI zoom (`zoom: calc(1 / var(--ui-scale, 1))`, var-reactive). The VNC
 *  canvas and — since 2.369.118 — every xterm container use it: both map the mouse
 *  by `clientX - rect.left` (ZOOMED px) over a cell/pixel size measured in LAYOUT
 *  px, so under body zoom a click landed scale× too far down (userW: a terminal
 *  selection took the wrong lines). The ONE definition; vnc-view.js re-exports it. */
export const COUNTER_ZOOM = 'calc(1 / var(--ui-scale, 1))';

// Dead-reckoning display pair (B-fcff v2): how a bucket's LAST READING (dark,
// confirmed) and its ESTIMATED current value (light/dashed) should render
// together. Within one window est ≥ reading always (est = reading + rate×cost,
// cost ≥ 0), so est < reading is the clean discriminator for "the window RESET
// since the reading" — the stale dark value no longer applies to the current
// window: dark collapses to 0 and the whole arc is estimate (user-specified).
export function estDisplayPair(readingBucket, estBucket) {
  const rdRaw = readingBucket ? Number(readingBucket.usedPercent ?? ((readingBucket.utilization || 0) * 100)) : null;
  const rd = Number.isFinite(rdRaw) ? Math.max(0, Math.min(100, Math.round(rdRaw))) : null;
  const eRaw = estBucket ? Number(estBucket.utilization) : null;
  if (!Number.isFinite(eRaw)) return { darkPct: rd ?? 0, estPct: null, rolled: false };
  const est = Math.max(0, Math.min(100, Math.round(eRaw * 100)));
  if (rd == null) return { darkPct: 0, estPct: est, rolled: false };
  // Hysteresis belt (adversarial-review major): a freshly-advanced reading vs
  // a ≤30s-memoized estimate can briefly read est ≈ rd−1 — that's freshness
  // skew, NOT a window reset. Only a clearly-lower estimate means the window
  // rolled; inside the skew band the estimate adds nothing → no light layer.
  if (est >= rd - 2 && est < rd) return { darkPct: rd, estPct: null, rolled: false };
  if (est < rd) return { darkPct: 0, estPct: est, rolled: true };
  return { darkPct: rd, estPct: est, rolled: false };
}
export function getUiPref(key, def = 100) {
  const v = parseInt(localStorage.getItem(key), 10);
  return Number.isFinite(v) ? v : def;
}
export function applyUiPrefs() {
  const mobile = window.matchMedia && window.matchMedia(VC_PHONE_MEDIA).matches;
  const sp = Math.max(UI_SCALE_MIN, Math.min(UI_SCALE_MAX, getUiPref('vibespace.uiScale')));
  const fp = Math.max(UI_FONT_MIN, Math.min(UI_FONT_MAX, getUiPref('vibespace.uiFontScale')));
  const s = mobile ? 1 : sp / 100;
  const changed = _uiScaleVal !== s;
  _uiScaleVal = s;
  try {
    document.body.style.zoom = s === 1 ? '' : String(s);
    document.documentElement.style.setProperty('--ui-scale', String(s));
    document.documentElement.style.setProperty('--ui-font-scale', String(fp / 100));
  } catch { }
  // a surface that converts viewport px ↔ layout px by the scale re-measures (the desktop-app window's minimum, 2.369.158)
  if (changed) { try { window.dispatchEvent(new CustomEvent('vs:ui-scale', { detail: { scale: s } })); } catch { } }
}

export function getStateSync() { return _stateSync; }

export async function initStateSync(wsManager) {
  _stateSync = new StateSync(wsManager);
  // lane lg-recovery (r3262 / r3271): a store lifted from TORN bytes says so ONCE, where its damaged bytes are kept and what the
  // person can do — never «restore that copy» (they are the damaged bytes)
  // r3654 4: a change to a structured unit while its store is unread acts for this page only and is NOT kept — said once, by name
  _stateSync.onUnread((store, unread, facts) => {
    if (!unread || !facts || !facts.notKept) return;
    if (store === 'stage') showToast(t('The Stage layout can’t be read right now: what you arrange here stays on this page and is not kept'));
    else if (store === 'uploads') showToast(t('The list of recent uploads can’t be read right now: uploads made meanwhile are not added to it'));
  });
  _stateSync.onUnread((store, unread, facts) => {
    if (unread || !facts || !facts.setAside) return;
    const list = store === 'drafts' ? t('Your saved drafts') : store === 'stage' ? t('The Stage layout') : store === 'uploads' ? t('The list of recent uploads') : t('A saved list');
    showToast(t('{list} could not be read: the file was damaged. Its damaged bytes are kept aside as {name} in VibeSpace’s data folder. What you typed since on this page is kept; add again what is missing, or mend the file by hand and restart.', { list, name: facts.setAside }), { type: 'error', duration: 15000 });
  });
  await _stateSync.init('drafts');
  await _stateSync.init('uploads');
  return _stateSync;
}

// Convenience wrappers for drafts (most common use case)
export function saveDraft(type, id, value) {
  _stateSync?.set('drafts', type + ':' + id, value);
}

export function loadDraft(type, id) {
  return _stateSync?.get('drafts', type + ':' + id) || '';
}

export function clearDraft(type, id) {
  saveDraft(type, id, '');
}

// Instant hover tooltip (no ~1s native-title delay) for any element carrying a
// `data-tip` attribute. Self-installs on import. Used for icon-only badges
// (config gear, icon-mode status tags) so hovering shows the label immediately.
(function setupInstantTooltip() {
  if (typeof document === 'undefined') return;
  let tip = null;
  const show = (el) => {
    const text = el.getAttribute('data-tip');
    if (!text) return;
    if (!tip) { tip = document.createElement('div'); tip.className = 'instant-tooltip'; (document.body || document.documentElement).appendChild(tip); }
    tip.textContent = text;
    tip.style.display = 'block';
    const r = el.getBoundingClientRect();
    const Z = uiScale(); // viewport→layout px (F2)
    tip.style.left = (r.left / Z) + 'px';
    tip.style.top = ((r.bottom + 5) / Z) + 'px';
    const tr = tip.getBoundingClientRect();
    if (tr.right > window.innerWidth - 6) tip.style.left = (Math.max(6, window.innerWidth - 6 - tr.width) / Z) + 'px';
    if (tr.bottom > window.innerHeight - 6) tip.style.top = ((r.top - 5 - tr.height) / Z) + 'px';
  };
  const hide = () => { if (tip) tip.style.display = 'none'; };
  document.addEventListener('mouseover', (e) => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el) show(el); });
  document.addEventListener('mouseout', (e) => { if (e.target.closest && e.target.closest('[data-tip]')) hide(); });
  // any press hides it — `pointerdown` in the capture phase: a press into an app's picture cancels its pointerdown and
  // so never produces a mousedown (lane M, the onOutsidePress note above)
  document.addEventListener('pointerdown', hide, { capture: true, passive: true });
  window.addEventListener('scroll', hide, true);
})();
