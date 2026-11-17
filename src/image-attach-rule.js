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
 *   too_big   — its base64 (what the API measures: «image exceeds 5 MB maximum: N bytes > 5242880 bytes») over 5 MiB,
 *               i.e. a FILE over 3.75 MiB — said with the file's own size and that cap
 *   too_wide  — a side over 8000 px (the API's stated largest side), read from the header when the head holds it
 *               (PNG / GIF / WebP always; JPEG when its frame header lies in the first 64 KiB) — unknown sides pass
 *   too_much  — with it, the message's pictures pass 32 MB of base64 (the API's stated largest request): the pictures
 *               already in the message are `total`
 * The type is read from the file's FIRST BYTES — never its name or the type the browser declared (a renamed .txt is
 * not a picture; a JPEG named .png is a JPEG) — and the verdict's `mediaType` is what the image block says.
 * NO COUNT CAP (主开发 2026-11-17 22:55Z): a number of pictures is refused only where a harness or the API states its
 * limit, read from where it is stated — this rule invents none. (The API's 2000 px side for a request holding more
 * than 20 pictures counts the whole conversation's history, which no page sees — not judged here.)
 *
 * judgeImage({size, head}, {total})  → {ok:true, mediaType, b64, width?, height?} | {ok:false, code, size, width?, height?}
 *   size = the file's bytes; head = its first bytes (≥ 32 for the sides; up to HEAD_BYTES for a JPEG; a Uint8Array or an
 *   array of numbers); total = the base64 the message already carries; b64 = this picture's base64 length
 * judgeImageBase64(base64, {total}) → the same verdict over a base64 string (the size from its length, the head decoded
 *   from its first chars, its shape read at its ends — no whole-string pass) — the server's belt
 * REFUSAL_WORDS[code] = the person's words (an English t() key; {mb} {side} {total} = the caps, {size} {w} {h} = its own)
 */

const MAX_B64 = 5 * 1024 * 1024;                 // one picture AS SENT (its base64) — the model API's stated limit
const MAX_BYTES = Math.floor(MAX_B64 / 4) * 3;   // 3 932 160 — the largest file whose base64 fits (3.75 MiB)
const MAX_SIDE = 8000;                           // px — the model API's stated largest side
const MAX_REQUEST = 32 * 1000 * 1000;            // the model API's stated largest request: one message's pictures together
const HEAD_BYTES = 64 * 1024;                    // what a door reads before judging (a JPEG's frame header sits after its EXIF)
const ACCEPTED = Object.freeze(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const mib = (n) => Math.round((n / (1024 * 1024)) * 100) / 100;
const CAPS = Object.freeze({ maxBytes: MAX_BYTES, maxB64: MAX_B64, mb: mib(MAX_BYTES), side: MAX_SIDE, maxRequest: MAX_REQUEST, totalMb: MAX_REQUEST / 1e6, headBytes: HEAD_BYTES, accepted: ACCEPTED });

const REFUSAL_WORDS = Object.freeze({
  empty: 'The file is empty',   // ui-words: a t() key of this table — worded by src/lib/image-attach.js refusalText; scripts/i18n-check.mjs requires its zh / ja rows
  heic: 'HEIC pictures cannot be sent — save it as JPEG or PNG first',
  not_image: 'Not a picture the model can read (PNG, JPEG, GIF or WebP)',
  too_big: '{size} — larger than {mb} MB, the largest picture the model takes',
  too_wide: '{w} × {h} pixels — the model takes at most {side} pixels on a side',
  too_much: 'With it, this message\'s pictures pass {total} MB — the most one request to the model carries',
  unreadable: 'The file could not be read',   // the page's own read failed (a file moved or removed while it was read)
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

function judgeImage({ size, head } = {}, { total = 0 } = {}) {
  const n = Number(size) || 0;
  if (!(n > 0)) return { ok: false, code: 'empty', size: 0 };
  const kind = sniffImage(head);
  if (kind === 'image/heic') return { ok: false, code: 'heic', size: n };
  if (!kind || !ACCEPTED.includes(kind)) return { ok: false, code: 'not_image', size: n };
  const b64 = b64Of(n);
  if (b64 > MAX_B64) return { ok: false, code: 'too_big', size: n };
  const sides = sidesOf(head, kind);
  if (sides && (sides.width > MAX_SIDE || sides.height > MAX_SIDE)) return { ok: false, code: 'too_wide', size: n, ...sides };
  if ((Number(total) || 0) + b64 > MAX_REQUEST) return { ok: false, code: 'too_much', size: n };
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

/** The words' values for one refusal {code, size, width, height} (the caps, and the picture's own size / sides). */
function refusalVars(r = {}) {
  return { mb: CAPS.mb, side: MAX_SIDE, total: CAPS.totalMb, size: `${mib(Number(r.size) || 0)} MB`, w: r.width || 0, h: r.height || 0 };
}

module.exports = { judgeImage, judgeImageBase64, sniffImage, sidesOf, headOfBase64, bytesOfBase64, refusalVars, REFUSAL_WORDS, CAPS, MAX_BYTES, MAX_B64, MAX_SIDE, MAX_REQUEST, HEAD_BYTES, ACCEPTED };
