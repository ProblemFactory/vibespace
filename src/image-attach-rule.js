'use strict';
/**
 * THE PICTURE RULE — PURE, imports nothing; CJS so the browser bundle and the server share ONE spelling (B-c9ed, B-51dd).
 *
 * A picture a person hands to an agent is judged WHEN IT IS HANDED (picked, pasted, shot), never at the vendor
 * minutes later: measured 2026-11-10 by the phone-take-photo acceptance — a 40 MB file rode ONE WebSocket frame as
 * 56 MB of base64, a .txt became an image block typed text/plain, a .heic became image/heif (the model API does not
 * take it), a 0-byte file became an image block with no data, and nothing was said. Every door that takes a picture —
 * the chat composer (paste / gallery / camera) and the For-you reply box (button / paste / drop) — asks THIS rule, and
 * the reply route asks it again over the bytes it was sent (a page cannot skip it).
 *
 * The verdict, in this order (the first that fails names the refusal):
 *   empty     — a file of 0 bytes
 *   heic      — HEIC / HEIF (an iPhone's own format) — refused BY NAME, the person can save it as JPEG
 *   not_image — anything else that is not PNG, JPEG, GIF or WebP (the four the model API reads; AVIF is not one)
 *   too_big   — its base64 (what an API measures) over the harness's limit per picture — said with the file's own size
 *               and that limit (claude: 5 MiB of base64, «image exceeds 5 MB maximum: N bytes > 5242880 bytes» — a file
 *               over 3.75 MiB)
 *   too_wide  — a side over the harness's limit (claude: 8000 px), read from the header when the head holds it
 *               (PNG / GIF / WebP always; JPEG when its frame header lies in the first 64 KiB) — unknown sides pass
 *   too_much  — with it, the message's pictures pass the harness's request size (claude: 32 MB of base64): the pictures
 *               already in the message are `total`
 * THE THREE NUMBERS ARE THE HARNESS'S, never this file's (bl-chat-b batch 20 cure, 主开发 2026-11-18 08:44Z: «a limit is a
 * row of the harness, never one vendor's number applied to all»): `limits` = src/backend-caps.js imageLimitsOf(the
 * conversation's harness) = {b64PerPicture, sidePx, requestB64}; a harness that states none (null) gets NO numeric cap —
 * a codex conversation takes the 4.6 MB phone photo it always took. The type, the empty file and HEIC stay for everyone.
 *   too_much_here — VibeSpace's OWN ceiling, for every harness (its readers' round on the cure): with it, the message's pictures
 *               pass CARRY_B64 (48 MiB of base64) — the most one message carries through the hub's own doors (a reply's JSON
 *               body is cut at 50 MiB by the hub, a chat frame rides one WebSocket message and is written in one go); never a
 *               vendor's number: past it the hub would answer a raw 413 / close the socket, and the person read «server
 *               unreachable» — a false reason
 * The type is read from the file's FIRST BYTES — never its name or the type the browser declared (a renamed .txt is
 * not a picture; a JPEG named .png is a JPEG) — and the verdict's `mediaType` is what the image block says.
 * NO COUNT CAP (主开发 2026-11-17 22:55Z): a number of pictures is refused only where a harness or the API states its
 * limit, read from where it is stated — this rule invents none. (The API's 2000 px side for a request holding more
 * than 20 pictures counts the whole conversation's history, which no page sees — not judged here.)
 *
 * judgeImage({size, head}, {total, limits}) → {ok:true, mediaType, b64, width?, height?} | {ok:false, code, size, width?, height?}
 *   size = the file's bytes; head = its first bytes (≥ 32 for the sides; up to HEAD_BYTES for a JPEG; a Uint8Array or an
 *   array of numbers); total = the base64 the message already carries; b64 = this picture's base64 length
 * judgeImageBase64(base64, {total, limits}) → the same verdict over a base64 string (the size from its length, the head decoded
 *   from its first chars, its shape read at its ends — no whole-string pass) — the server's belt
 * REFUSAL_WORDS[code] = the person's words (an English t() key; {mb} {side} {total} = the harness's limits, {size} {w} {h} = its own)
 * refusalVars(refusal, limits) = those words' values
 */

const CARRY_B64 = 48 * 1024 * 1024;              // VibeSpace's own: one message's pictures through the hub's doors (the reply body's 50 MiB, with room for its text)
const HEAD_BYTES = 64 * 1024;                    // what a door reads before judging (a JPEG's frame header sits after its EXIF)
const ACCEPTED = Object.freeze(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const mib = (n) => Math.round((n / (1024 * 1024)) * 100) / 100;
const CAPS = Object.freeze({ headBytes: HEAD_BYTES, accepted: ACCEPTED });   // what holds for every harness (the numbers are each harness's)
/** the largest FILE whose base64 fits a limit of `b64` (claude's 5 MiB ⇒ 3 932 160 bytes, 3.75 MiB) */
const fileBytesOf = (b64) => Math.floor((Number(b64) || 0) / 4) * 3;
/** a harness's limits, read as numbers (anything else = that limit not stated) */
const limitOf = (limits, k) => { const v = limits && typeof limits === 'object' ? Number(limits[k]) : NaN; return v > 0 ? v : null; };

const REFUSAL_WORDS = Object.freeze({
  empty: 'The file is empty',   // ui-words: a t() key of this table — worded by src/lib/image-attach.js refusalText; scripts/i18n-check.mjs requires its zh / ja rows
  heic: 'HEIC pictures cannot be sent — save it as JPEG or PNG first',
  not_image: 'Not a picture the model can read (PNG, JPEG, GIF or WebP)',
  too_big: '{size} — larger than {mb} MB, the largest picture the model takes',
  too_wide: '{w} × {h} pixels — the model takes at most {side} pixels on a side',
  too_much: 'With it, this message\'s pictures pass {total} MB — the most one request to the model carries',
  too_much_here: 'With it, this message\'s pictures pass {carry} MB — the most VibeSpace carries in one message',
  unreadable: 'The file could not be read',   // the page's own read failed (a file moved or removed while it was read)
});

/** A reply's words beside the picture refusals (an English t() key, {mb} = the frame's size): the reopen road's frame that
 *  the just-started conversation cannot take yet (src/server/user-input.js too_large / no-sidecar) — said in the page's language */
const REPLY_WORDS = Object.freeze({
  reopenTooLarge: 'The conversation has just started and cannot take this reply ({mb} MB) yet — nothing was sent; wait a moment and send it again',
});

/** base64 length of `size` bytes */
const b64Of = (size) => 4 * Math.ceil((Number(size) || 0) / 3);

// ISO-BMFF brands of HEIC / HEIF stills and sequences (the 'ftyp' box at byte 4); an AVIF may carry the generic mif1 /
// msf1 as its major brand — its compatible brands then say avif / avis, and it is not a HEIC
const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1']);
const AVIF_BRANDS = new Set(['avif', 'avis']);

const at = (h, i) => (h && i < h.length ? Number(h[i]) & 0xff : -1);
const ascii = (h, from, n) => { let s = ''; for (let i = from; i < from + n; i++) { const b = at(h, i); if (b < 0) return null; s += String.fromCharCode(b); } return s; };
const be16 = (h, i) => (at(h, i) << 8) | at(h, i + 1);
const be32 = (h, i) => ((at(h, i) << 24) >>> 0) + (at(h, i + 1) << 16) + (at(h, i + 2) << 8) + at(h, i + 3);
const le16 = (h, i) => at(h, i) | (at(h, i + 1) << 8);
const le24 = (h, i) => at(h, i) | (at(h, i + 1) << 8) | (at(h, i + 2) << 16);

/** The type the bytes say: one of ACCEPTED, 'image/heic', 'image/avif', or null (not a picture the rule knows). */
function sniffImage(head) {
  if (at(head, 0) === 0x89 && ascii(head, 1, 3) === 'PNG' && at(head, 4) === 0x0d && at(head, 5) === 0x0a && at(head, 6) === 0x1a && at(head, 7) === 0x0a) return 'image/png';
  if (at(head, 0) === 0xff && at(head, 1) === 0xd8 && at(head, 2) === 0xff) return 'image/jpeg';
  const gif = ascii(head, 0, 6);
  if (gif === 'GIF87a' || gif === 'GIF89a') return 'image/gif';
  if (ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 4) === 'WEBP') return 'image/webp';
  if (ascii(head, 4, 4) === 'ftyp') {
    const box = be32(head, 0), brands = [ascii(head, 8, 4)];
    for (let i = 16; i + 4 <= Math.min(box || 0, 64); i += 4) brands.push(ascii(head, i, 4));
    if (brands.some((b) => AVIF_BRANDS.has(b))) return 'image/avif';
    if (HEIF_BRANDS.has(brands[0])) return 'image/heic';
  }
  return null;
}

const JPEG_SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
/** {width, height} from the header, or null (the head does not reach it). */
function sidesOf(head, kind) {
  if (kind === 'image/png') return at(head, 23) < 0 ? null : { width: be32(head, 16), height: be32(head, 20) };
  if (kind === 'image/gif') return at(head, 9) < 0 ? null : { width: le16(head, 6), height: le16(head, 8) };
  if (kind === 'image/webp') {
    const chunk = ascii(head, 12, 4);
    if (chunk === 'VP8X' && at(head, 29) >= 0) return { width: 1 + le24(head, 24), height: 1 + le24(head, 27) };
    if (chunk === 'VP8L' && at(head, 24) >= 0) { const b = (at(head, 21) | (at(head, 22) << 8) | (at(head, 23) << 16) | (at(head, 24) << 24)) >>> 0; return { width: (b & 0x3fff) + 1, height: ((b >>> 14) & 0x3fff) + 1 }; }
    if (chunk === 'VP8 ' && at(head, 29) >= 0) return { width: le16(head, 26) & 0x3fff, height: le16(head, 28) & 0x3fff };
    return null;
  }
  if (kind === 'image/jpeg') {
    let i = 2;
    while (at(head, i + 3) >= 0) {
      if (at(head, i) !== 0xff) return null;
      const m = at(head, i + 1);
      if (m === 0xff) { i++; continue; }                                    // fill bytes
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }   // markers with no length
      if (JPEG_SOF.has(m)) return at(head, i + 8) < 0 ? null : { width: be16(head, i + 7), height: be16(head, i + 5) };
      if (m === 0xd9 || m === 0xda) return null;                            // the scan began: no frame header before it
      i += 2 + be16(head, i + 2);
    }
    return null;
  }
  return null;
}

function judgeImage({ size, head } = {}, { total = 0, limits = null } = {}) {
  const n = Number(size) || 0;
  if (!(n > 0)) return { ok: false, code: 'empty', size: 0 };
  const kind = sniffImage(head);
  if (kind === 'image/heic') return { ok: false, code: 'heic', size: n };
  if (!kind || !ACCEPTED.includes(kind)) return { ok: false, code: 'not_image', size: n };
  const b64 = b64Of(n);
  const perPicture = limitOf(limits, 'b64PerPicture'), side = limitOf(limits, 'sidePx'), request = limitOf(limits, 'requestB64');
  if (perPicture && b64 > perPicture) return { ok: false, code: 'too_big', size: n };
  const sides = sidesOf(head, kind);
  if (side && sides && (sides.width > side || sides.height > side)) return { ok: false, code: 'too_wide', size: n, ...sides };
  if (request && (Number(total) || 0) + b64 > request) return { ok: false, code: 'too_much', size: n };
  if ((Number(total) || 0) + b64 > CARRY_B64) return { ok: false, code: 'too_much_here', size: n };   // VibeSpace's own ceiling, every harness
  return { ok: true, mediaType: kind, b64, ...(sides || {}) };
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_VAL = (() => { const v = new Int16Array(128).fill(-1); for (let i = 0; i < 64; i++) v[B64.charCodeAt(i)] = i; return v; })();
/** The first bytes of a base64 text (4 chars → 3 bytes; by default as many as a door reads), decoded here: no Buffer, no
 *  atob — one spelling everywhere; null when a char is not base64. */
function headOfBase64(b64, bytes = HEAD_BYTES) {
  const s = String(b64 || '');
  const end = Math.min(s.length, Math.ceil(bytes / 3) * 4);
  const out = [];
  let acc = 0, bits = 0;
  for (let i = 0; i < end; i++) {
    const c = s.charCodeAt(i);
    if (c === 61) break;   // '=' — the padding
    const v = c < 128 ? B64_VAL[c] : -1;
    if (v < 0) return null;
    acc = ((acc << 6) | v) & 0xffff; bits += 6;
    if (bits >= 8) { bits -= 8; out.push((acc >> bits) & 0xff); }
  }
  return out;
}
/** The bytes a base64 text holds, from its length (its padding counted). */
function bytesOfBase64(b64) {
  const s = String(b64 || '');
  if (!s) return 0;
  const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((s.length * 3) / 4) - pad);
}
// a base64 text's SHAPE, read at its ends only (a whole-string regex over a 7 MB text holds the caller's turn): a length of
// whole quads and a tail of the alphabet (its padding last) — the head is decoded above
const B64_TAIL = /^[A-Za-z0-9+/]*={0,2}$/;
function judgeImageBase64(b64, opts = {}) {
  if (typeof b64 !== 'string') return { ok: false, code: 'empty', size: 0 };
  if (b64 && (b64.length % 4 !== 0 || !B64_TAIL.test(b64.slice(-24)))) return { ok: false, code: 'not_image', size: bytesOfBase64(b64) };
  return judgeImage({ size: bytesOfBase64(b64), head: headOfBase64(b64) || [] }, opts);
}

/** The words' values for one refusal {code, size, width, height} — the harness's limits it was judged with, and the picture's
 *  own size / sides. */
function refusalVars(r = {}, limits = null) {
  const perPicture = limitOf(limits, 'b64PerPicture'), request = limitOf(limits, 'requestB64');
  return { mb: perPicture ? mib(fileBytesOf(perPicture)) : 0, side: limitOf(limits, 'sidePx') || 0, total: request ? request / 1e6 : 0, carry: mib(CARRY_B64), size: `${mib(Number(r.size) || 0)} MB`, w: r.width || 0, h: r.height || 0 };
}

module.exports = { judgeImage, judgeImageBase64, sniffImage, sidesOf, headOfBase64, bytesOfBase64, refusalVars, fileBytesOf, REFUSAL_WORDS, REPLY_WORDS, CAPS, CARRY_B64, HEAD_BYTES, ACCEPTED };
