// THE AVATAR RULE of the channel surfaces (channel-polish, 2026-09-27 — the
// owner: "这个当作 IM 用还是有必要把界面好好优化下至少保证人能看清楚必要的信息").
//
// PURE (imports nothing): the panel's conversation rows, the conversation
// window's message runs and the group window all ask HERE what an author's (or
// a conversation's) avatar says and which colour it wears, so one person is
// the same circle everywhere and across every repaint.
//
//  · THE TEXT = initials: the first letter of each of the first two words
//    ("Ada Example" → "AE", "Brook" → "B"); a name that starts with a CJK
//    character (or an emoji) is that ONE character ("张三" → "张"). Leading
//    punctuation of a word is skipped ("@Brook" → "B"); an empty / unreadable
//    name is "?". Bidi controls and zero-width characters are dropped first.
//    The result is TEXT (the caller assigns it as textContent — a name is
//    peer-controlled input).
//  · THE COLOUR = a hue index 0…AVATAR_HUES-1 from a stable hash (FNV-1a) of
//    the author's KEY (its vendor id, else its name) — the same person is the
//    same colour on every client and after every repaint; the SELF author
//    wears the accent (`self: true`, no hue). The palette itself is CSS
//    (public/style.css `.chan-av[data-hue]`): each hue is a THEME variable
//    (blue / green / yellow / red / magenta / cyan + two mixes), the fill 22 %
//    of it over the surface, the initials 35 % of it into --text — ≥ 4.5 : 1
//    in all six themes on both surfaces (test-channel-blocks ⑭ computes it
//    from the theme blocks).
//  · AN AVATAR IS PAINT: the name it abbreviates is always in the row's own
//    text, so the element is aria-hidden (test-ax-paint's rule).

export const AVATAR_HUES = 8;

const INVISIBLE = /[\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180b-\u180f\u200b-\u200f\u202a-\u202e\u2060-\u206f\u3164\ufe00-\ufe0f\ufeff]/g;
const CJK = /^[⺀-⿟々-〇〡-〩぀-ヿ㄀-ㄯㄱ-ㆎㆠ-ㆿㇰ-ㇿ㐀-䶿一-鿿ꥠ-꥿가-힯豈-﫿]|^[\uD840-\uD87F][\uDC00-\uDFFF]/;
const PICTO = /\p{Extended_Pictographic}/u;
const LETTER = /[\p{L}\p{N}\p{Extended_Pictographic}]/u;
const SEPARATORS = /[\s/\\|·•,;:()[\]{}<>"'“”‘’«»]+/u;

let segmenter = null;
try { if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' }); } catch { segmenter = null; }
function graphemes(s) {
  if (segmenter) { const out = []; for (const g of segmenter.segment(s)) out.push(g.segment); return out; }
  return Array.from(s);
}
/** The first grapheme of a word that is a letter / digit / pictograph (leading punctuation skipped). */
function firstMark(word) {
  for (const g of graphemes(word)) if (LETTER.test(g)) return g;
  return '';
}

/** The initials a name reads as (see the header). Never empty: '?' for nothing readable. */
export function initialsOf(name) {
  const s = String(name == null ? '' : name).replace(INVISIBLE, '').normalize('NFC').trim().slice(0, 256);
  if (!s) return '?';
  const words = s.split(SEPARATORS).filter((w) => w && LETTER.test(w));
  if (!words.length) return '?';
  const a = firstMark(words[0]);
  if (!a) return '?';
  if (CJK.test(a) || PICTO.test(a)) return a;
  const b = words.length > 1 ? firstMark(words[1]) : '';
  const second = b && !CJK.test(b) && !PICTO.test(b) ? b : '';
  return (a + second).toUpperCase();
}

/** A stable hue index for a key (FNV-1a over its code points). */
export function hueOf(key) {
  let h = 0x811c9dc5;
  for (const ch of String(key == null ? '' : key)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % AVATAR_HUES;
}

/** ONE avatar: `{text, hue, self}` — `hue` null for the self author (the accent). */
export function avatarOf({ name = '', key = '', self = false } = {}) {
  return { text: initialsOf(name), hue: self ? null : hueOf(key || name || ''), self: !!self };
}
