// A STALE PAGE THAT GAVE UP CHECKS AGAIN (lane think-tools-phone, 主开发 2026-11-17 — the owner's page ran the 2.369.404 bundle
// against a 2.369.406 hub for TWELVE HOURS; its nav log's last entry, at the hub's restart: «stale, 404 to 406, wait»). The stale
// check ran only on a socket (re)connect; when the wait for the hub's ready gave up (a slow boot), it noted «wait» and returned —
// «the next reconnect checks again» — and the socket then stayed up all day: nothing checked again, and every fix shipped since
// reached the hub and not the page.
// THE LAWS: a page that knows the hub runs another version reaches that version by itself — a give-up is followed by another try
// (backing off, bounded by the ready wait, never a reload loop: the once-per-version-per-tab stamp of staleTabStep stands), a
// reload never fires while a person types or the page holds work a reload would LOSE (it is HELD and looked at again). IT NEVER NAGS (主开发
// 21:36Z; the owner of update notices: «以后别拿这个刷屏了吧»): a page that reloads by itself within seconds says NOTHING (today's
// road); ONE pinned notice appears only while the page is behind AND will not reload now — after a give-up, or while a hold stands —
// and says which; its ✕ hides it for that version, and the tries and the hold go on in silence. The back-off is for a hub that is
// still STARTING: on a hub that answers «ready» the next look reloads (subject to the hold).
// PURE: no DOM, no globals — every effect is injected (app.js wires the real ones; scripts/test-stale-watch.mjs a simulated hub); its
// one state is the marks' WeakMap, keyed by the box (utils.js re-exports the marks for every box's owner).
import { staleTabStep } from './boot-ladder.js';

/** The waits before the next look after the n-th give-up: 30 s, 1 min, 2 min, 5 min — then every 5 min while the versions differ. */
export const STALE_RETRY_MS = Object.freeze([30000, 60000, 120000, 300000]);
/** A HELD reload is looked at again after this long (a person typing, unsaved work). */
export const STALE_HOLD_MS = 15000;
/** Typing = a change in an editable field within this long. */
export const TYPING_QUIET_MS = 10000;

/** The notice's words (English keys, worded through t() by the page; zh / ja rows) — WHY the page is behind and not reloading now. */
export const STALE_WORDS = Object.freeze({
  starting: 'The server is still starting — this page tries again by itself',   // ui-words: an English KEY — app.js words it through t()
  hold: 'This page reloads when you pause — or press Reload',                     // ui-words: an English KEY — app.js words it through t()
  unsaved: 'This page waits for the words you typed here — press Reload when they are safe',   // ui-words: an English KEY — app.js words it through t()
});

/** The notice for version v and its reason — null when there is nothing to say (not behind, reloading now) or the person's ✕
 *  hid it for THIS version (`hidden`). → { words, door: 'Reload' } (English keys; the page words them). */
export function staleNotice({ v, why, hidden = false } = {}) {
  if (!v || !why || hidden || !STALE_WORDS[why]) return null;
  return { words: STALE_WORDS[why], door: 'Reload' };
}

/** ONLY WORDS A PERSON TYPED AND HAS NOT YET SAVED OR SENT HOLD THE RELOAD (主开发's verdicts — the law, restated so a miss on either
 *  side is the safe side). Facts per text box: { typed — wasTyped(box) below; text; enabled; connected }. A box nobody typed in never
 *  holds, whatever it shows (a Settings row, a Task Group's objective, a proposed description — every constructor, with no
 *  declaration); a typed box holds until it is gone, empty, or a landed save releases it; a box whose save is never marked keeps
 *  holding (the true notice, its Reload). */
export function heldWords(boxes) {
  return (boxes || []).some((b) => !!b && b.connected && b.enabled && b.typed && String(b.text || '').trim().length > 0);
}

/** THE MARK, kept per box element (a WeakMap — a box that leaves the page leaves the map): the person TYPED in it during this page's
 *  life — OBSERVED by app.js's ONE capture listener (their own input, or the microphone's words: their event carries
 *  Symbol.for('vibespace.voice.spoken') — the mic never focuses the box), never declared; a composer that re-fills the person's own
 *  in-memory draft into a rebuilt box carries it (markTyped at its restore). markLanded — ONLY where a save or send PROVED a success;
 *  a failed save calls nothing, so its words keep holding. */
const TYPED_BOXES = new WeakMap();
export function markTyped(box) { if (box) TYPED_BOXES.set(box, true); return box; }
export function markLanded(box) { if (box) TYPED_BOXES.set(box, false); return box; }
export function wasTyped(box) { return !!box && TYPED_BOXES.get(box) === true; }

/** A Settings box is released only when the settings store says the POST carrying ITS path landed ('saved' — src/lib/settings.js
 *  saveStateOf / onSaveState), WHAT LANDED IS THIS BOX'S OWN WORDS (`value` = what its set() wrote, read against the store's
 *  serverValue — two doors may show one setting: the attention block in Settings and in Channels ⚙, Manage agents' instruction box
 *  and that setting's own row in Settings; a save of the other's
 *  words never releases this one) and the box still shows them; `set()` alone only changes this tab's copy (the POST follows 500 ms
 *  later and may fail — a hub restarting is the very scene). 'failed' never releases: the box keeps holding and its door says so (a
 *  Settings text row's save mark «Not saved — …», Manage agents' error toast). Call it right after `store.set(path, value)` with
 *  that same value (required: a JSON row's box shows text, its set() writes the parsed object). → a Promise of the answer — 'landed'
 *  (this box's own words landed; it is released), 'failed' (the POST did not land), 'other' (the server holds other words, or the
 *  box changed before the answer) — the doors' toasts speak from it, never at the press; null for a store with no save states
 *  (nothing to answer from: a door keeps its old word). */
export function markLandedOnSave(store, path, box, value) {
  if (!box || !store || typeof store.onSaveState !== 'function') return null;
  const sent = box.value, mine = JSON.stringify(value === undefined ? null : value);
  return new Promise((answer) => {
    const off = store.onSaveState((p, st) => {
      if (p !== path) return;
      if (st === 'saved') { off(); const own = box.value === sent && landedIs(store, path, mine); if (own) markLanded(box); answer(own ? 'landed' : 'other'); }
      else if (st === 'failed') { off(); answer('failed'); }
    });
  });
}
// the server holds exactly these words for the path (a store with no serverValue proves nothing: the box keeps holding)
const landedIs = (store, path, mine) => typeof store.serverValue === 'function' && JSON.stringify(store.serverValue(path) ?? null) === mine;

/** A box REBUILT from the settings store's copy (a search keystroke redraws the Settings rows; a Manage agents tab switch redraws its
 *  boxes) carries the mark while that copy has not landed: 'pending' / 'saving' ⇒ typed, released when its POST answers «saved»
 *  (markLandedOnSave); 'failed' ⇒ typed — a failed save never releases. A text row's copy moves only by a set() its own box made, so
 *  this carries the old box's observed mark to the new element; a copy the server holds ('saved' / 'idle') carries nothing. */
export function carryUnsaved(store, path, box) {
  const st = box && store && typeof store.saveStateOf === 'function' ? store.saveStateOf(path) : 'idle';
  if (st === 'pending' || st === 'saving') { markTyped(box); markLandedOnSave(store, path, box, store.get(path)); }
  else if (st === 'failed') markTyped(box);
  return box;
}

/** The wait after the n-th give-up (n ≥ 1): the back-off, then its last rung for ever. */
export function staleRetryWait(n) {
  const i = Math.max(1, Math.floor(Number(n) || 1));
  return STALE_RETRY_MS[Math.min(i, STALE_RETRY_MS.length) - 1];
}

/** THE VERDICT at one look. step = staleTabStep's answer; typing / unsaved = what the page holds now.
 *  → { act } — 'none' (nothing to try: the same version, or the one reload already spent — its notice is staleTabStep's), 'hold'
 *    (unsaved work, or a person typing: look again in STALE_HOLD_MS — `why` names which), 'wait' (wait for the hub's ready, then reload). */
export function staleVerdict({ step, typing = false, unsaved = false } = {}) {
  if (step !== 'reload') return { act: 'none' };
  if (unsaved) return { act: 'hold', why: 'unsaved' };   // words a reload would LOSE (an editor's unsaved file, a composer's words)
  if (typing) return { act: 'hold', why: 'hold' };
  return { act: 'wait' };
}

/**
 * ONE LOOK — the whole stale check, with its effects injected:
 *   bundle            the page's baked version
 *   fetchVersion()    → the hub's version (or null)
 *   store             { reloaded(v), noticed(v), markNoticed(v) } — the per-tab sessionStorage stamps
 *   pending()         → this document's reload is scheduled
 *   typing(), unsaved()→ what the page holds now: a person typing; words a reload would LOSE (a chat box's draft is saved and
 *                       comes back, so it is none of them)
 *   waitReady()       → { ok } — the hub's ready wait (boot-ladder waitServerReady)
 *   gaveUp            { n, srv } — this document's give-ups and the hub version a look last saw differ (the caller keeps it)
 *   schedule(ms)      → look again in ms (the caller keeps ONE timer: a new look cancels the old)
 *   reload(v)         → the existing reload (its toast, the stamp as it fires)
 *   say(v, why)       → the ONE pinned notice: why 'starting' | 'hold' for version v; say(null) takes it away (a page that
 *                       will reload now, or is not behind, says nothing)
 *   notice(v)         → the existing once-only notice (the reload did not take)
 *   note(d2, extra)   → the tab's diary (nav-log)
 * → the act taken: 'none' | 'notice' | 'hold' | 'retry' | 'reload'
 */
export async function staleLook(d) {
  const m = d.gaveUp;
  // ONE diary row per stretch (the adversarial read: a row per 15-s look pushed the tab's whole 60-row diary out in 15 minutes)
  const noteOnce = (d2, extra = {}) => { if (m.last === d2) { m.again = (m.again || 0) + 1; return; } m.last = d2; m.again = 0; d.note(d2, extra); };
  const srv = await d.fetchVersion();
  if (!srv) {   // the version read failed (a hub down, a busy hub, a blip): NEVER silence — look again on the back-off
    if (!d.bundle) return 'none';
    m.n += 1; noteOnce('wait', { n: m.n, why: 'version' });
    if (m.srv) d.say(m.srv, 'starting');   // a reload is owed only for a version a look saw as a step to reload
    d.schedule(staleRetryWait(m.n));
    return 'retry';
  }
  if (!d.bundle || srv === d.bundle) { m.srv = null; m.n = 0; m.last = null; d.say(null); return 'none'; }
  const step = staleTabStep({ bundle: d.bundle, server: srv, reloaded: d.store.reloaded(srv), noticed: d.store.noticed(srv), pending: d.pending() });
  m.srv = step === 'reload' ? srv : null;   // a spent reload (notice / quiet) owes no retry, and its notice never says «tries again»
  const v = staleVerdict({ step, typing: d.typing(), unsaved: d.unsaved() });
  if (step === 'notice') { d.say(null); d.store.markNoticed(srv); d.note('notice'); d.notice(srv); return 'notice'; }
  if (v.act === 'none') { if (step === 'quiet') d.say(null); return 'none'; }
  if (v.act === 'hold') { noteOnce('hold', { why: v.why }); d.say(srv, v.why); d.schedule(STALE_HOLD_MS); return 'hold'; }
  if (!(await d.waitReady()).ok) { m.n += 1; noteOnce('wait', { n: m.n }); d.say(srv, 'starting'); d.schedule(staleRetryWait(m.n)); return 'retry'; }
  // THE HUB IS UP: the back-off means nothing any more (主开发 21:36Z) — what the page holds is read again (a person may have
  // started typing during the wait), then the reload, or a hold looked at again in STALE_HOLD_MS
  m.n = 0;
  if (d.pending() || d.store.reloaded(srv)) return 'none';   // another look's wait won
  const after = staleVerdict({ step, typing: d.typing(), unsaved: d.unsaved() });
  if (after.act === 'hold') { noteOnce('hold', { why: after.why }); d.say(srv, after.why); d.schedule(STALE_HOLD_MS); return 'hold'; }
  d.say(null);
  d.note('reload');
  d.reload(srv);
  return 'reload';
}
