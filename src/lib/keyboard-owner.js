// THE ONE KEYBOARD OWNER OF THIS CLIENT (lane J r2, 2026-09-25 — the
// naive-user study: while a person drove the agent's browser, the text they
// typed vanished or landed in the CHAT COMPOSER, one Enter from sending a
// password to the agent). While a live view drives a takeover it CLAIMS the
// keyboard here; every "put the caret in my text box" path asks
// `keyboardOwned()` first and stands down (ChatInput.focus — which the attach
// and reconnect paths reach through ChatView.focus — and TerminalSession.focus),
// and the owning view's own document-level capture listeners take every key,
// paste and composition and reclaim focus from any editable element that gets
// it anyway (the backstop for the ~70 other `.focus()` sites: a guard per call
// site would be the per-site patch this module exists to avoid).
//
// A claim is `{id, owns(), yielded?()}`: `owns` is re-asked on every question (the view's
// PURE `keyboardOwnership` over its live mode / socket / visibility), so a
// socket that drops, a desktop switch or a handback releases the keyboard
// without anybody remembering to. Two views driving two browsers on one
// client: the LAST claim that still owns wins (PURE `ownerOf`).
//
// lane takeover-keyboard (userW inc-mum339id-1zsb, 2026-09-28): the user's OWN press on a text box outside the view
// YIELDS the keyboard to it — the claim stays (the takeover continues, the agent stays refused) but its `owns()` answers
// false until a press inside the view, so `keyboardOwned()` is false and ChatInput / TerminalSession behave normally.
// `yielded()` says so; `keyboardYielded()` = this client drives a browser whose keys the user gave to a text box (the
// composer's line "You are typing to the agent…" reads it); `onKeyboardChange` / `keyboardChanged` = the one signal a
// view sends when that answer may have changed (claim, release, yield, a press back inside the view).
import { ownerOf } from '../browser-takeover.js';

const claims = [];
const listeners = new Set();

export function claimKeyboard(claim) {
  if (!claim || claim.id === undefined || typeof claim.owns !== 'function') return;
  releaseKeyboard(claim.id);
  claims.push(claim);
}
export function releaseKeyboard(id) {
  for (let i = claims.length - 1; i >= 0; i--) if (claims[i].id === id) claims.splice(i, 1);
}
/** The claim that owns the keyboard now (null = nobody: every path behaves as before). */
export function keyboardOwner() {
  const id = ownerOf(claims.map((c) => { let owns = false; try { owns = !!c.owns(); } catch { owns = false; } return { id: c.id, owns }; }));
  return id === null ? null : (claims.find((c) => c.id === id) || null);
}
/** THE guard every focus-into-a-text-box path asks (App.takeoverOwnsKeyboard is this). */
export function keyboardOwned() { return !!keyboardOwner(); }
/** lane takeover-keyboard: nobody owns the keys, and a view still driving a takeover gave them to a text box the user pressed. */
export function keyboardYielded() {
  if (keyboardOwned()) return false;
  return claims.some((c) => { try { return typeof c.yielded === 'function' && !!c.yielded(); } catch { return false; } });
}
/** Subscribe to "the keyboard's answer may have changed" → an unsubscribe. */
export function onKeyboardChange(fn) {
  if (typeof fn !== 'function') return () => {};
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
/** A view says its claim / yield changed; every subscriber re-reads (a throwing one never stops the rest). */
export function keyboardChanged() {
  for (const fn of [...listeners]) { try { fn(); } catch { /* one subscriber's failure is its own */ } }
}
