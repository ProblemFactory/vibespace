import { enterSubmits } from './chat-enter-keys.js';

/**
 * BLUR COMMITS (lane task-group-context, POC v2.1 §2 — "a value that resolves takes effect, one that doesn't keeps its text
 * and says why; never drop silently"): a box saves when it is LEFT, the same as Enter, and the save waits for the press
 * that left it to be RELEASED — a re-render the save causes never eats the click on the next control. The press witness is
 * the document's own pointer state (capture, passive): no element follows the pointer, nothing is dragged.
 */
let pointerDown = false;
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', () => { pointerDown = true; }, { capture: true, passive: true });
  document.addEventListener('pointerup', () => { pointerDown = false; }, { capture: true, passive: true });
  document.addEventListener('pointercancel', () => { pointerDown = false; }, { capture: true, passive: true });
}

/** run `fn` now, or — a press is down — right after its release (the click it causes lands first) */
export function afterPointerUp(fn) {
  if (!pointerDown) { fn(); return; }
  document.addEventListener('pointerup', () => setTimeout(fn, 0), { once: true, capture: true });
}

/** a free-text box: Enter commits (`commit('enter')`), leaving it commits (`commit('blur')`, after the release); an empty
 *  box does nothing */
export function blurCommits(input, commit) {
  input.addEventListener('keydown', (e) => { if (enterSubmits(e)) { e.preventDefault(); commit('enter'); } });
  input.addEventListener('blur', () => { if (input.value.trim()) afterPointerUp(() => commit('blur')); });
}
