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

// THE ACCOUNT BADGE (B-5fe1 — the owner, 2026-10-01: "channel列表需要在头像上展示来源角标，比如gmail/lark的图标，并且这个
// 图标得是多色的，因为可能有多个账号属于同一个供应商，或者展示一个小字说这是那个channel标题的"):
//  · THE GLYPH = the library icon named after the account's KIND (`vendor-<kind>`, src/lib/icons.js — the chat glyph
//    when the library has none); a kind is a FACT of the digest, never an id a client branches on.
//  · THE COLOUR = per ACCOUNT, not per vendor: the accounts sorted by id, each takes hueOf('account/' + id) — or, when
//    an account of the SAME kind already wears that hue, the next free one — so two Lark accounts never share a colour
//    (up to AVATAR_HUES per kind) and every client draws the same one (a function of the account list alone).
//  · `multi` = the instance holds ≥ 2 accounts of that kind: a row then says the account's title in small text.
//  · A badge is paint too: it sits inside the aria-hidden avatar; the account is in the row's words.
//  · lane channels-badges (the owner, 2026-10-03: "这个角标的含义不明确，至少应该在账号下面把图标对应上吧。其次对于vibespace
//    自己的内部沟通也应该提供角标，就用vibespace图标就行"): the SAME record is the account card's icon in the 账号 section
//    (channel-chrome.js `accountBadge` draws both), `title` = the account's name (the hover says which account a badge
//    is); VibeSpace's OWN talk — an agent group, an agent private chat, the built-in agents source — wears
//    INTERNAL_BADGE: the product's mark (icons.js `vibespace`) on the theme's teal (`internal`, no hue).
/** VibeSpace's own badge (word-free: the client words its title). */
export const INTERNAL_BADGE = Object.freeze({ hue: null, glyph: 'vibespace', label: 'VibeSpace', title: '', multi: false, internal: true });
/** The account's NAME as its card heads it ("Office · ada@example.com"): the label, then the signed-in user when the
 *  token names one (channel-account-dialogs.js accountName's first rung asks HERE). */
export function accountTitle(a) {
  const label = String((a && (a.label || a.id)) || '');
  const user = a && a.auth && !a.auth.self && a.auth.user ? String(a.auth.user) : '';
  return user && user !== label ? `${label} · ${user}` : label;
}
/** `accounts` (the digest's adapters: `{id, kind, label, auth, builtin}`) → Map id → `{hue, glyph, label, title,
 *  multi}`; a built-in source (the message watcher) wears INTERNAL_BADGE. */
export function accountBadges(accounts) {
  const all = (Array.isArray(accounts) ? accounts : []).filter((a) => a && a.id);
  const list = all.filter((a) => !a.builtin)
    .map((a) => ({ id: String(a.id), kind: String(a.kind || ''), label: String(a.label || a.id).slice(0, 80), title: accountTitle(a).slice(0, 200) }))
    .sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  const perKind = new Map(), taken = new Map(), out = new Map();
  for (const a of list) perKind.set(a.kind, (perKind.get(a.kind) || 0) + 1);
  for (const a of list) {
    const used = taken.get(a.kind) || new Set();
    let hue = hueOf('account/' + a.id);
    for (let i = 0; i < AVATAR_HUES && used.has(hue); i++) hue = (hue + 1) % AVATAR_HUES;
    used.add(hue); taken.set(a.kind, used);
    out.set(a.id, { hue, glyph: 'vendor-' + a.kind, label: a.label, title: a.title, multi: perKind.get(a.kind) >= 2 });
  }
  for (const a of all) if (a.builtin) out.set(String(a.id), INTERNAL_BADGE);
  return out;
}
