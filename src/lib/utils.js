import { t } from './i18n.js';
import { menuPlace } from './menu-place.js'; // PURE (lane desktop-small P2-3): THE ONE placement of a menu inside the viewport
import { metric } from './telemetry-client.js';
import { pressCloses, pressPhase, tapVerdict, shouldCloseOnBlur } from './outside-press.js';
import { NATIVE_PRESS_SELECTOR, PRESS_CHROME_SELECTOR, effectiveUserSelect, pointOnText, pressTargetClass, longPressVerdict, selectionCloses, selectStartAllowed, trustedContextMenu } from './press-select.js';
import { enterSubmits } from './chat-enter-keys.js';
import { arrivalVerdict } from '../sync-arrival.js'; // PURE: StateSync's arrival rule (lane statesync-last-arrival)
import { VOICE_UI } from '../voice-focus.js'; // PURE: the voice UI outside every box — never an outside press (lane phone-tray-voice-done)
import { VC_PHONE_MEDIA } from '../viewport-class.js'; // lane duo-build-1: the phone paths' ONE media list (compact ∪ regular)
import { DIALOG_ROOTS, SHEET_ROOTS, reopenVerdict, undismissableVerdict, escapeVerdict, typedVerdict, ownFloat } from './form-yield.js'; // PURE (lane dialog-yield r2/r3): the ONE dialog predicate set + the shell's verdicts

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
  const list = Array.isArray(items) ? items.map((x) => String(x)) : []; // B-a67c: what the confirm ends, one row each (a group close names every tab)
  return new Promise((resolve) => {
    const { overlay, body, okBtn, cancelBtn, closeBtn } = _modalShell(title);
    okBtn.textContent = confirmText;
    if (danger) okBtn.classList.add('danger'); // red fill+border+hover as a set (inline bg kept the accent border)
    const p = document.createElement('p');
    p.className = 'dialog-hint';
    p.style.fontSize = '12px';
    p.textContent = message;
    if (message || !list.length) body.appendChild(p);
    if (list.length) {
      const ul = document.createElement('ul');
      ul.className = 'dialog-list';
      for (const x of list) { const li = document.createElement('li'); li.textContent = x; ul.appendChild(li); }
      body.appendChild(ul);
    }
    const done = (result) => { overlay.remove(); resolve(result); };
    okBtn.onclick = () => done(true);
    cancelBtn.onclick = closeBtn.onclick = () => done(false);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) done(false); });
    overlay.tabIndex = -1;
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); done(true); }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); }
    });
    setTimeout(() => okBtn.focus(), 0);
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
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('pointerdown', () => { _gestureAt = Date.now(); }, true);
  window.addEventListener('keydown', (e) => { if (isGestureKey(e, _editable(e.target))) _gestureAt = Date.now(); }, true);
}
/** A gesture neither listener above sees — the phone's back swipe (lane mobile-back-guard) — is the person's own act too:
 *  a toast it shows next is not an unread notification. */
export function noteOwnGesture() { _gestureAt = Date.now(); }
function _seenAtShow(ref) {
  try { return toastSeenAtShow({ now: Date.now(), gestureAt: _gestureAt, visible: document.visibilityState === 'visible', focused: document.hasFocus(), ref }); } catch { return false; }
}
function _recordToast(message, type, ref = null) {
  try {
    const h = getToastHistory();
    const seen = _seenAtShow(ref && ref.kind && ref.id ? ref : null);   // B-3f5d ①: shown while the user acted ⇒ not unread
    h.unshift({ m: String(message).slice(0, 500), type, ts: Date.now(), ...(ref && ref.kind && ref.id ? { ref: { kind: String(ref.kind), id: String(ref.id) } } : {}), ...(seen ? { seen: true } : {}) });
    localStorage.setItem('vibespace.toastHistory', JSON.stringify(h.slice(0, 100)));
  } catch {}
  try { window.dispatchEvent(new CustomEvent('vs-toast')); } catch {}
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
 *  room ⇒ its own place). → { bottom } (the stack's CSS bottom, layout px: ÷ `scale`) | null (its own place). */
export function toastDeskSpot({ rect = null, avoid = [], topY = 0, vh = 0, scale = 1, gap = 8 } = {}) {
  if (!rect || !(rect.height > 0) || !(vh > 0)) return null;
  const list = (Array.isArray(avoid) ? avoid : []).filter(Boolean);
  const meets = (top, bottom) => list.find((a) => rect.left < a.right && rect.right > a.left && top < a.bottom && bottom > a.top);
  let bottom = rect.bottom;
  for (let i = 0; i <= list.length; i++) {
    const a = meets(bottom - rect.height, bottom);
    if (!a) return bottom === rect.bottom ? null : { bottom: (vh - bottom) / (scale || 1) };
    bottom = a.top - gap;
    if (bottom - rect.height < topY) return null;
  }
  return null;
}
/** what the desktop tier's stack must not stand on: every open menu / float and every composer shown (viewport px) */
function _toastAvoid() {
  const out = [];
  for (const el of document.querySelectorAll('.context-menu, .taskbar-context-menu, [data-popover], .chat-input-area')) {
    if (el.id === 'global-toasts' || el.closest('#global-toasts')) continue;
    if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ visibilityProperty: true })) continue; // a window on another desktop is visibility:hidden
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight) out.push(r);
  }
  return out;
}
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
  const desk = toastDeskSpot({ rect: stack.getBoundingClientRect(), avoid: _toastAvoid(), topY: tr && tr.height ? tr.bottom : 0, vh: window.innerHeight, scale: uiScale() });
  if (desk) { stack.style.top = 'auto'; stack.style.bottom = desk.bottom + 'px'; }
  if (!_toastWatch) { _toastWatch = new MutationObserver(_queueToastPlace); _toastWatch.observe(document.body, { childList: true }); }
  _toastWatch.observe(stack, { childList: true });
}
const _toastTier = () => { try { return matchMedia(VC_PHONE_MEDIA).matches || isTouchDevice(); } catch { return false; } }; // int355: the phone paths' ONE media list (duo-build-1's law, test-viewport-class)
/** the dialog of the topmost open app modal (createModalShell's overlay or the static #dialog-overlay), else null */
function _openModalDialog() {
  const ovs = [...document.querySelectorAll(SHEET_ROOTS)].filter((o) => !o.classList.contains('hidden') && o.getClientRects().length); // (a form's WINDOW is no modal: toasts stand clear of a sheet only)
  const ov = ovs[ovs.length - 1];
  return ov ? [...ov.children].find((d) => d.classList.contains('dialog') && !d.classList.contains('hidden') && d.getClientRects().length) || null : null;
}
/** the highest composer on screen (a chat window's .chat-input-area), viewport px; null when none shows */
function _composerTop() {
  let top = null;
  for (const el of document.querySelectorAll('.chat-input-area')) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || r.bottom <= 0 || r.top >= window.innerHeight) continue;
    if (top === null || r.top < top) top = r.top;
  }
  return top;
}
let _toastWatch = null, _toastPlaceQueued = false;
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
  try { _placeToastStackNow(); } catch { /* the toast still shows — in the stylesheet's place */ }
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
// `action: { label, run }` (split UX R5, 2026-09-23) = ONE button inside the
// toast (Undo / Show side by side): a click runs it and dismisses the toast; an
// action toast lives 5 s unless the user's toast-seconds setting says otherwise.
// lane dialog-unsaved-guard: while an unsaved sheet's Save runs, an error the dialog's own save says (a toast) is ALSO the
// sheet's reason — «Not saved: <the same words>» stays beside the choices after the toast fades
let unsavedSaySink = null;
// `icon` (lane phone-refusal-wrap) = an SVG string of OURS (a module constant — never words) drawn before the words: a
// toast that names a control shows the control's own icon (UI convention: SVG, no emoji)
export function showToast(message, { type = 'info', duration, action, actions, history = null, icon = '' } = {}) {
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
  el.className = `global-toast global-toast-${type}`;
  const body = document.createElement('div');
  body.className = 'global-toast-body';
  body.textContent = message;
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
  _recordToast(history && typeof history.m === 'string' ? history.m : message, type, history && history.ref);   // a record's toast keeps its head + a ref, never its words (above)
  // Cap the stack so a burst of errors doesn't fill the screen
  while (stack.children.length > 4) stack.firstChild.remove();
  _placeToastStack(); _queueToastPlace();   // P2-1: off the phone composer / an open modal's rows — now, and once the act that showed it is done
  const secs = Number(_toastCfg.getSeconds?.());
  const ttl = duration ?? (secs > 0 ? secs * 1000 : (type === 'error' ? 6000 : (acts.length ? 5000 : 3000)));
  setTimeout(() => {
    el.classList.add('global-toast-out');
    setTimeout(() => { el.remove(); if (!stack.children.length) stack.remove(); }, 250);
  }, ttl);
  return el;
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

export async function uploadFilesBatched(files, { destDir, preservePaths, onProgress, host, sessionId = '' } = {}) {
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
    if (preservePaths || names.some((n) => n.includes('/'))) fd.append('preservePaths', '1');
    // Remote sessions: route the upload to the host so destDir resolves on the
    // remote (and its ~ is the remote home) — without ?host= a remote-session
    // upload silently landed on the LOCAL server (review finding).
    const url = host ? `/api/upload?host=${encodeURIComponent(host)}` : '/api/upload';
    const res = await fetch(url, { method: 'POST', body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) throw new Error(data.error || `HTTP ${res.status}`);
    return data.files || [];
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
        failed.push({ name: _uploadName(chunk[0]), error: e.message });
      } else {
        // Isolate the unreadable file(s): retry each on its own.
        for (const f of chunk) {
          try { uploaded.push(...await postChunk([f])); }
          catch (e2) { failed.push({ name: _uploadName(f), error: e2.message }); }
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
    const pr = pop.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
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
export function showContextMenu(x, y, items, className = 'context-menu', { up = false, extraClass = '' } = {}) {
  // Remove existing menus of same class
  document.querySelectorAll('.' + className.split(' ')[0]).forEach(p => p.remove());
  const pop = document.createElement('div');
  pop.className = className;
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
  for (const item of items) {
    if (item.separator) { const sep = document.createElement('div'); sep.className = className + '-separator'; pop.appendChild(sep); continue; }
    const el = document.createElement('div');
    el.className = className + '-item' + (item.disabled ? ' disabled' : '');
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
      const sub = document.createElement('div');
      sub.className = className;
      sub.style.cssText = 'position:absolute;left:100%;top:-4px;display:none;z-index:99999';
      for (const child of item.children) {
        const ce = document.createElement('div');
        ce.className = className + '-item' + (child.disabled ? ' disabled' : '');
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
        requestAnimationFrame(() => {
          const r = sub.getBoundingClientRect();
          if (r.right > window.innerWidth && !sub.style.right) { sub.style.left = 'auto'; sub.style.right = '100%'; }
          const overflowY = r.bottom - window.innerHeight;
          if (overflowY > 0) sub.style.top = `${-4 - overflowY - 4}px`; // top is relative to the parent row (initial -4px)
        });
      };
      el.addEventListener('mouseenter', showSub);
      el.addEventListener('mouseleave', () => { sub.style.display = 'none'; });
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
  // Keep menu on screen — THE ONE placement (PURE menuPlace, lane desktop-small P2-3): below the point, or above it when
  // `up` and there is room, else clamped to the edge; a menu TALLER than the viewport is capped + scrollable (clamping
  // alone left its tail unreachable). Viewport px measured, layout px written.
  const mr = pop.getBoundingClientRect();
  const at = menuPlace({ x, y, w: mr.width, h: mr.height, vw: window.innerWidth, vh: window.innerHeight, up });
  if (at.maxH != null) { pop.style.maxHeight = (at.maxH / Z) + 'px'; pop.style.overflowY = 'auto'; }
  pop.style.left = (at.left / Z) + 'px';
  pop.style.top = (at.top / Z) + 'px';
  pop.style.visibility = '';
  return pop;
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
  const r = anchor.getBoundingClientRect();
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
function refusalWords(body) {
  return body && typeof body === 'object' && body.error === 'cross-site' ? { ...body, code: 'cross-site', error: t('This action came from another site and was refused') } : body;
}

/** Fetch JSON with silent error handling. Returns null on failure. */
export async function fetchJson(url, opts) {
  try {
    const res = await fetch(url, opts);
    return refusalWords(await res.json());
  } catch { return null; }
}

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
    if (state === 'pending') label = 'checking…';
    else if (state === 'stale') label = age ? `as of ${agoText(age)}` : 'cached';
    else if (state === 'error') label = 'unreachable';
  }
  el.textContent = label;
  if (title) el.title = title;
  return el;
}

/** "3m ago" / "2h ago" for staleness labels (shared by the chip + callers). */
export function agoText(ts) {
  const m = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

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

export function copyText(text) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).catch(() => _fallbackCopy(text));
  }
  _fallbackCopy(text);
  return Promise.resolve();
}
function _fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;left:-9999px';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
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
      else if (msg.type === 'state-snapshot') this._applySnapshot(msg.store, msg.data, msg.version);
    };
    wsManager.onGlobal(this._globalHandler);
    // On reconnect, request missed ops for all stores
    this._stateHandler = (connected) => {
      // the socket dropped: an own set in flight is never answered on it — its held ops are judged now (resync converges)
      if (!connected) { for (const [name, s] of Object.entries(this.stores)) { s.pending.clear(); for (const key of [...s.held.keys()]) this._release(name, key); } return; }
      const versions = {};
      for (const [name, s] of Object.entries(this.stores)) versions[name] = s.version;
      if (Object.keys(versions).length) this.ws.send({ type: 'state-resync', versions });
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
    const s = this.stores[storeName] = { version: 0, data: {}, listeners: new Map(), loaded: null, pending: new Map(), acked: new Map(), held: new Map() };
    s.loaded = (async () => {
      try {
        const res = await fetch(`/api/sync/${storeName}`);
        const snap = await res.json();
        s.data = snap.data || {};
        s.version = snap.version || 0;
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
    s.pending.set(key, (s.pending.get(key) || 0) + 1);
    if (value == null || value === '') {
      delete s.data[key];
      this.ws.send({ type: 'state-set', store: storeName, key, value: '', basedOn: s.version });
    } else {
      s.data[key] = value;
      this.ws.send({ type: 'state-set', store: storeName, key, value, basedOn: s.version });
    }
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
    this._release(storeName, ack.key);
  }

  _release(storeName, key) {
    const s = this.stores[storeName];
    const q = s && s.held.get(key);
    if (!q) return;
    s.held.delete(key);
    for (const op of q) this._applyOp(storeName, op);
  }

  _applySnapshot(storeName, data, version) {
    const s = this.stores[storeName];
    if (!s) return;
    const oldData = s.data;
    const oldKeys = new Set(Object.keys(oldData));
    // Server ROLLBACK defense: a snapshot whose version is BELOW what this
    // client already applied means the store was reset/rolled back (crash-class
    // restart lost the debounced save). Local data is the newer truth on a
    // single-user instance — adopt the server's version base, then re-push
    // every differing key so both sides converge forward instead of silently
    // diverging (e.g. a draft typed in the ~2s before an OOM kill).
    const rolledBack = (version || 0) < s.version;
    s.data = data || {};
    s.version = version || 0;
    // a key with an own set still awaiting its ack keeps the own value: the server answers that set AFTER this snapshot,
    // so the snapshot's value is an op of the key like any other — the arrival rule holds it and judges it at the ack
    for (const key of [...s.pending.keys()]) {
      const op = key in s.data ? { op: 'set', key, value: s.data[key], version: s.version } : { op: 'delete', key, version: s.version };
      if (key in oldData) s.data[key] = oldData[key]; else delete s.data[key];
      this._applyOp(storeName, op);
    }
    if (rolledBack) {
      for (const key of new Set([...oldKeys, ...Object.keys(s.data)])) {
        const localVal = oldData[key] ?? '';
        const serverVal = s.data[key] ?? '';
        // set() mutates s.data + sends state-set, so the notify loop below
        // already sees the restored values.
        if (JSON.stringify(localVal) !== JSON.stringify(serverVal)) this.set(storeName, key, localVal);
      }
    }
    // Notify for all changed keys
    for (const key of new Set([...oldKeys, ...Object.keys(s.data)])) {
      const newVal = s.data[key] || '';
      this._notify(s, key, newVal);
    }
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
