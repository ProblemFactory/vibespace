'use strict';
// PURE (no DOM, no imports; CJS like src/voice-model.js so the bundle and the node suites share it) — DICTATION FOLLOWS THE
// FOCUS (lane voice-follows-focus; the owner 2026-10-21: 「我发现还是有些输入框不能用 drop line，比如说编辑或者拒绝 Agent 要发的消息」,
// on top of 2026-10-13: 「每个输入框都做一下 Dropline」). A hand-wired list of boxes was a fence, not a census — the reject box of
// an agent's message had no microphone and the owner found it. This file is the ONE place that says which focused field
// takes Dropline dictation, where its microphone stands and what it tells the dictation; the DOM half is
// src/lib/voice-input.js `followFocus` (it reads the facts off the element — this file decides).
//   dictationTarget(facts) → {ok, why}: EVERY editable text field is a target — a <textarea>, an <input> of a text type
//     (none, text, search, url, email, tel; a number typed as text = a text input), a [contenteditable] — except by THIS
//     predicate, never by a list of places: 'secret' (type=password; autocomplete one-time-code / current-password /
//     new-password — the vault's passwords, its second password included), 'terminal' (xterm's helper textarea: its keys
//     go to the shell), 'disabled', 'read-only', 'opted-out' (data-no-dictation on the field or an ancestor), 'hidden' (a
//     box nobody sees: an off-screen copy helper, a live view's or a desktop's keyboard proxy), 'not-text' (a checkbox, a
//     number, a date, a colour…), 'not-editable'. A box with its own microphone is a target too — the follower leaves it
//     to that microphone (voiceField / the chat composer).
//   followCandidates / followPlace({field, view, size, gap, avoid}) → {x, y, side, anchor}: the microphone OUTSIDE the
//     field's box (it never covers the field, never changes its layout), the first side that is inside the view and
//     clear of `avoid` (the keyboard-yield strip, the buttons beside the field); none clear ⇒ the first that keeps off
//     the field; a field that fills the view ⇒ its own trailing corner (the one case it sits on the field).
//   followFacts({label, dialog, near}) → {title, text}: a followed field's context for the dictation — its label, the
//     dialog's title or the card's words around it, ≤ 600 characters in all (the chat composer keeps its richer facts).

const TEXT_TYPES = Object.freeze(['', 'text', 'search', 'url', 'email', 'tel']);
const SECRET_AUTOCOMPLETE = Object.freeze(['one-time-code', 'current-password', 'new-password']);
const FOLLOW_LIMITS = Object.freeze({ factsChars: 600, titleChars: 120, minSide: 4, gap: 4, deskSize: 28, phoneSize: 40 });
const WHY = Object.freeze(['target', 'secret', 'terminal', 'disabled', 'read-only', 'opted-out', 'hidden', 'not-text', 'not-editable']);
// THE VOICE UI THAT STANDS OUTSIDE EVERY BOX (lane phone-tray-voice-done, inc-mvhzgiq8-bs3j): the follower's microphone host and
// a field's floating chip (Inserted · Undo, the failure words) live on document.body, never inside the surface whose box they
// serve — a press on them is the dictation's own, never another surface's outside press (utils.js onOutsidePress reads it;
// voice-input.js voiceOwns is the DOM predicate over it). A field's own microphone needs no entry: it is inside its surface.
const VOICE_UI = '.voice-follow, .voice-chip-float';

const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const lower = (v) => str(v).trim().toLowerCase();
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const no = (why) => ({ ok: false, why });

/** a box nobody sees: smaller than 4 px either way, transparent, or wholly outside the view */
function hiddenBox(f) {
  if (f.hidden === true) return true;
  if (num(f.opacity) === 0) return true;
  const b = f.box;
  if (!b || typeof b !== 'object') return false;
  const w = num(b.width), h = num(b.height);
  if (w !== null && h !== null && (w < FOLLOW_LIMITS.minSide || h < FOLLOW_LIMITS.minSide)) return true;
  const v = f.view;
  if (v && typeof v === 'object' && [b.left, b.top, b.right, b.bottom, v.width, v.height].every((x) => num(x) !== null)) {
    if (b.right <= 0 || b.bottom <= 0 || b.left >= v.width || b.top >= v.height) return true;
  }
  return false;
}

/** facts: {tag, type, editable (isContentEditable), autocomplete, terminal, disabled, readOnly, noDictation, hidden,
 *  opacity, box {left, top, right, bottom, width, height}, view {width, height}} → {ok, why} */
function dictationTarget(facts) {
  const f = facts && typeof facts === 'object' ? facts : {};
  const tag = lower(f.tag), type = lower(f.type);
  const field = tag === 'textarea' || tag === 'input';
  if (!field && !f.editable) return no('not-editable');
  if (tag === 'input' && type === 'password') return no('secret');
  if (lower(f.autocomplete).split(/\s+/).some((x) => SECRET_AUTOCOMPLETE.includes(x))) return no('secret');
  if (tag === 'input' && !TEXT_TYPES.includes(type)) return no('not-text');
  if (f.terminal) return no('terminal');
  if (f.disabled) return no('disabled');
  if (f.readOnly) return no('read-only');
  if (f.noDictation) return no('opted-out');
  if (hiddenBox(f)) return no('hidden');
  return { ok: true, why: 'target' };
}

const rectOf = (x, y, w, h) => ({ left: x, top: y, right: x + w, bottom: y + h });
const hits = (a, b) => !!a && !!b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const inside = (r, v) => r.left >= v.left && r.top >= v.top && r.right <= v.right && r.bottom <= v.bottom;

/** the six places beside a field, in the order they are tried: above its trailing end, below it, after it, above / below
 *  its start, before it. `anchor` = the edge the microphone keeps when it widens into the recording capsule. */
function followCandidates({ field, size = FOLLOW_LIMITS.deskSize, gap = FOLLOW_LIMITS.gap } = {}) {
  const f = field, s = size, g = gap;
  if (!f || [f.left, f.top, f.right, f.bottom].some((x) => num(x) === null)) return [];
  return [
    { side: 'above-end', x: f.right - s, y: f.top - g - s, anchor: 'right' },
    { side: 'below-end', x: f.right - s, y: f.bottom + g, anchor: 'right' },
    { side: 'after', x: f.right + g, y: f.bottom - s, anchor: 'left' },
    { side: 'above-start', x: f.left, y: f.top - g - s, anchor: 'left' },
    { side: 'below-start', x: f.left, y: f.bottom + g, anchor: 'left' },
    { side: 'before', x: f.left - g - s, y: f.bottom - s, anchor: 'right' },
  ].map((c) => ({ ...c, rect: rectOf(c.x, c.y, s, s) }));
}

/** → {x, y, side, anchor} — never over the field unless the field fills the view ('inside') */
function followPlace({ field, view, size = FOLLOW_LIMITS.deskSize, gap = FOLLOW_LIMITS.gap, avoid = [] } = {}) {
  const cands = followCandidates({ field, size, gap });
  if (!cands.length || !view) return null;
  const blockers = [field, ...(Array.isArray(avoid) ? avoid : [])].filter(Boolean);
  const pick = (c, crowded = false) => ({ x: c.x, y: c.y, side: c.side, anchor: c.anchor, ...(crowded ? { crowded: true } : {}) });
  for (const c of cands) if (inside(c.rect, view) && !blockers.some((b) => hits(c.rect, b))) return pick(c);
  for (const c of cands) if (inside(c.rect, view) && !hits(c.rect, field)) return pick(c, true);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  return { x: clamp(field.right - size - gap, view.left, view.right - size), y: clamp(field.bottom - size - gap, view.top, view.bottom - size), side: 'inside', anchor: 'right' };
}

const clean = (s) => str(s).replace(/\s+/g, ' ').trim();
/** {label, dialog, near} → {title, text}: the label (aria-label / <label> / placeholder), the dialog's title or the card's
 *  words; ≤ 600 characters in all */
function followFacts({ label = '', dialog = '', near = '' } = {}) {
  const L = clean(label), D = clean(dialog), N = clean(near);
  const title = (D || L).slice(0, FOLLOW_LIMITS.titleChars);
  const lines = [];
  for (const x of [L, D ? '' : N]) if (x && x !== title && !lines.includes(x)) lines.push(x);
  const text = lines.join('\n').slice(0, Math.max(0, FOLLOW_LIMITS.factsChars - title.length));
  return { title, text };
}

module.exports = { TEXT_TYPES, SECRET_AUTOCOMPLETE, FOLLOW_LIMITS, WHY, VOICE_UI, dictationTarget, followCandidates, followPlace, followFacts };
