'use strict';
// PURE (imports nothing; CJS — the server's doors, the PURE policy modules and the client bundle all require it) — THE
// ONE ANSWER TO "IS THIS CHARACTER SHOWN AS WHAT IT DOES?" (verify-r6 Z2, lane-pairing, "what you approve is what runs").
//
// A character that REORDERS how a line reads (the Unicode bidi embedding / override / isolate controls, the direction
// marks) or is NOT DRAWN AT ALL (every Unicode format character — zero-width space and joiners, the soft hyphen, the
// BOM, the invisible operators, the tag block — the Hangul fillers, the line / paragraph separators, and every control
// character but tab and line feed) makes what a person READS differ from what runs or is sent: `echo hi<RLO>…` reads
// as a comment; `https://example.com<ZWSP>.evil.io` reads as example.com. r5 X2 refused the direction controls at the
// exit door; r6 found the other invisibles passing there (Z1), and three surfaces each carrying its OWN list — the exit
// door, the outbox (channel-policy), the permission card (helper-ask), the browser confirmation card (browser-takeover)
// — none of them the same set. This module is the set; each surface asks it (the approval census pins that no surface
// spells its own, and that no tracked source file carries such a character raw — a reviewer cannot see it either).
//   · a DOOR refuses them (exit-reach hiddenOrderOf; channel-policy for an address / a subject / a replyTo);
//   · a DISPLAY marks each as a visible `U+XXXX` token (the permission card, the outbox text, the confirmation card).
// Options — only where the text needs them: `allowCR` (a message body's / a file's line endings), `allowJoiners`
// (U+200C / U+200D: emoji sequences and several scripts need them — never in an address, an id or a command). Variation
// selectors (U+FE00–FE0F) are never hidden (an emoji carries U+FE0F).
const HIDDEN_RE = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u00ad\u034f\u115f\u1160\u17b4\u17b5\u180b-\u180f\u2028\u2029\u3164\uffa0\p{Cf}]/gu;
const JOINERS = new Set(['\u200c', '\u200d']);
const codeOf = (c) => 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
const allowedBy = (c, { allowCR = false, allowJoiners = false } = {}) => (allowCR && c === '\r') || (allowJoiners && JOINERS.has(c));
/** Is `c` (one code point) hidden under these options? */
function isHidden(c, opts = {}) { HIDDEN_RE.lastIndex = 0; const hit = HIDDEN_RE.test(String(c)); HIDDEN_RE.lastIndex = 0; return hit && !allowedBy(c, opts); }
/** Every string a value carries (object keys included), bounded — an agent-authored input may be any shape. */
function stringsIn(value, out = [], depth = 0) {
  if (out.length > 5000 || depth > 20) return out;
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) stringsIn(v, out, depth + 1);
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) { out.push(k); stringsIn(v, out, depth + 1); }
  return out;
}
/** The hidden characters a value holds (a string, or any shape of strings), as `U+XXXX` codes — distinct, in order of
 *  appearance, at most `max`. [] when none. */
function hiddenCharsOf(value, { allowCR = false, allowJoiners = false, max = 64 } = {}) {
  const seen = new Set();
  for (const s of stringsIn(value)) {
    for (const m of s.matchAll(HIDDEN_RE)) {
      if (allowedBy(m[0], { allowCR, allowJoiners })) continue;
      seen.add(codeOf(m[0]));
      if (seen.size >= max) return [...seen];
    }
  }
  return [...seen];
}
/** `s` cut into `{text}` runs and one `{code: 'U+XXXX'}` per hidden character — a renderer draws the code as a visible
 *  mark and escapes the text; the character itself is never drawn. */
function revealParts(s, opts = {}) {
  const str = String(s == null ? '' : s);
  const out = [];
  let last = 0;
  for (const m of str.matchAll(HIDDEN_RE)) {
    if (allowedBy(m[0], opts)) continue;
    if (m.index > last) out.push({ text: str.slice(last, m.index) });
    out.push({ code: codeOf(m[0]) });
    last = m.index + m[0].length;
  }
  if (last < str.length) out.push({ text: str.slice(last) });
  return out;
}
/** `s` with every hidden character spelled `<open>U+XXXX<close>` (a plain-text surface). */
function revealHidden(s, { open = '⟦', close = '⟧', ...opts } = {}) {
  return revealParts(s, opts).map((p) => (p.code ? open + p.code + close : p.text)).join('');
}

module.exports = { HIDDEN_RE, hiddenCharsOf, revealParts, revealHidden, isHidden, codeOf };
