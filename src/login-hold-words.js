'use strict';
// PURE, imports nothing — THE HOLD WORDS of a website-login fence (lane chrome-157, vault-login round 32's persisted hold).
// One closed set: the record (src/browser-profiles.js normalizeLoginFenceState) writes ONE word per held tab and reads only rows
// that carry one; src/browser-login.js re-exports them beside its sentences. Kept apart so the device agent's bundle, which carries
// browser-profiles, never pulls browser-login in (test-architecture §107's budget).
const HOLD_TOO_MUCH_TEXT = 'too much text to check';
const HOLD_UNKNOWN_TYPED = 'unknown_typed';
const HOLD_VALUE_SHOWN = 'value_shown';   // (the page put what was typed into its own address or title)
// the two PHASES of a hold after a cold restart — no hold lifts unchecked: every held tab waits for the vault; a tab whose filled
// entry is gone when the vault opens stays held until it is closed. Phases, not kinds: the record keeps the kind's own word.
const HOLD_AWAIT_VAULT = 'await_vault';
const HOLD_ENTRY_GONE = 'entry_gone';
/** one word per memory state, and each word maps back to one: a live fill · held (a guard found the value put back) · guard (a
 *  guard only) · one per HOLD_* reason. */
const HOLD_WORD_OF_REASON = Object.freeze({ [HOLD_TOO_MUCH_TEXT]: 'too_much_text', [HOLD_UNKNOWN_TYPED]: 'unknown_typed', [HOLD_VALUE_SHOWN]: 'value_shown' });
const HOLD_WORDS = Object.freeze(['live', 'held', 'guard', ...Object.values(HOLD_WORD_OF_REASON)]);
const HOLD_PHASES = Object.freeze([HOLD_AWAIT_VAULT, HOLD_ENTRY_GONE]);
const isHoldWord = (w) => typeof w === 'string' && HOLD_WORDS.includes(w);

module.exports = { HOLD_TOO_MUCH_TEXT, HOLD_UNKNOWN_TYPED, HOLD_VALUE_SHOWN, HOLD_AWAIT_VAULT, HOLD_ENTRY_GONE, HOLD_WORD_OF_REASON, HOLD_WORDS, HOLD_PHASES, isHoldWord };
