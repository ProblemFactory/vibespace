'use strict';
// THE LAUNCH IMAGE (B-78db (B), 主开发 r4481 — the owner, on the simulator's pictures: can the launch's white be removed altogether, it looks
// very long). The coordinator read the runtime: a home-screen copy takes a startup image and a landscape one from the page's
// apple-touch-startup-image links WHEN IT IS ADDED (an existing copy took nothing at three cold launches; a person adds it again once).
// The image is our ground as ONE solid colour, made here on request (server.js: /launch-image/<W>x<H>.png?g=<colour>, a page behind the
// sign-in like every other); the index route writes the links in the colour the page itself paints first — the remembered ground
// (launch-ground.js, the vs_ground cookie), else today's dark — ONE link set, never a look of the system's (the product follows none).
// PURE: node's zlib (its async deflate, off the main thread), no fs, no DOM.
// UNPROVEN until the simulator: whether the system's fetch at «Add to Home Screen» carries the sign-in; whether a size that is not the
// screen's own is scaled or refused; which image the Duo's inner display takes (both displays read 466×678 at 3×, so no media query
// tells them apart). After a theme change the copy keeps the image it took: the launch shows the OLD colour for that moment, until the
// copy is added again. A colour's alpha is not drawn (an image is opaque; every built-in theme's ground is opaque).
const zlib = require('zlib');
const { DARK, cleanGround, rgbOf } = require('./launch-ground.js');   // rgbOf: the colour's channels, one reader with the launch ground

/** THE SCREENS a home-screen copy launches on — device points, the pixel ratio, what has it (Apple's published iPhone screens; the Duo
 *  from the simulator's probe, int359/duo-probe/readings.jsonl: screen 466×678, devicePixelRatio 3 on both displays). Each gives a
 *  portrait image (w·r × h·r device pixels) and a landscape one (its mirror). */
const SCREENS = Object.freeze([
  [466, 678, 3, 'the iPhone Duo (both displays)'],
  [440, 956, 3, 'iPhone 16 Pro Max / 17 Pro Max'],
  [420, 912, 3, 'iPhone Air'],
  [402, 874, 3, 'iPhone 16 Pro / 17 / 17 Pro'],
  [430, 932, 3, 'iPhone 14 Pro Max / 15 Plus / 15 Pro Max / 16 Plus'],
  [393, 852, 3, 'iPhone 14 Pro / 15 / 15 Pro / 16'],
  [428, 926, 3, 'iPhone 12 Pro Max / 13 Pro Max / 14 Plus'],
  [390, 844, 3, 'iPhone 12 / 12 Pro / 13 / 13 Pro / 14 / 16e'],
  [375, 812, 3, 'iPhone X / XS / 11 Pro / 12 mini / 13 mini'],
  [414, 896, 3, 'iPhone XS Max / 11 Pro Max'],
  [414, 896, 2, 'iPhone XR / 11'],
  [414, 736, 3, 'iPhone 8 Plus'],
  [375, 667, 2, 'iPhone 8 / SE (2nd and 3rd)'],
].map(([w, h, r, what]) => Object.freeze({ w, h, r, what })));
const ORIENTS = Object.freeze(['portrait', 'landscape']);
/** one screen's image in one orientation → { W, H } device pixels */
const pixelsOf = (s, o) => (o === 'portrait' ? { W: s.w * s.r, H: s.h * s.r } : { W: s.h * s.r, H: s.w * s.r });
/** THE SIZES the route answers — every other is a 404 */
const SIZES = Object.freeze([...new Set(SCREENS.flatMap((s) => ORIENTS.map((o) => { const { W, H } = pixelsOf(s, o); return `${W}x${H}`; })))]);

const CRC_TABLE = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
function crc32(buf) { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4), crc = Buffer.alloc(4), td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  len.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** a solid W×H PNG (8-bit RGB) of `colour` → Promise<Buffer>. The rows: the first is filter 1 (Sub: its first pixel, then zeros — each
 *  pixel the one before), every other filter 2 (Up: all zeros — the row above); so the bytes are almost all zeros and deflate small */
function solidPng(colour, W, H) {
  const [r, g, b] = rgbOf(colour), stride = 1 + 3 * W, raw = Buffer.alloc(stride * H);
  raw[0] = 1; raw[1] = r; raw[2] = g; raw[3] = b;
  for (let y = 1; y < H; y++) raw[y * stride] = 2;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;   // 8 bits, RGB; compression, filter, interlace 0
  return new Promise((resolve, reject) => zlib.deflate(raw, { level: 9 }, (e, z) => (e ? reject(e) : resolve(Buffer.concat([SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', z), chunk('IEND', Buffer.alloc(0))])))));
}

/** the route's answer: '<W>x<H>.png' on the list + a colour → Promise<Buffer>, else Promise<null> (the route's 404). The last 16
 *  images are kept (a colour × a size; a request in flight is shared) */
const CACHE = new Map(), CACHE_MAX = 16;
function imageFor(size, colour) {
  const m = /^(\d{2,4})x(\d{2,4})\.png$/.exec(String(size == null ? '' : size));
  if (!m || !SIZES.includes(`${m[1]}x${m[2]}`)) return Promise.resolve(null);
  const g = cleanGround(Array.isArray(colour) ? '' : colour) || DARK, key = `${m[1]}x${m[2]} ${g}`;
  if (!CACHE.has(key)) {
    const p = solidPng(g, Number(m[1]), Number(m[2]));
    p.catch(() => CACHE.delete(key));
    CACHE.set(key, p);
    while (CACHE.size > CACHE_MAX) CACHE.delete(CACHE.keys().next().value);
  }
  return CACHE.get(key);
}

/** the links, ONE set in `ground` (the remembered ground, else today's dark): each screen's portrait and landscape image */
function linksFor(ground) {
  const g = encodeURIComponent(cleanGround(ground) || DARK);
  return SCREENS.flatMap((s) => ORIENTS.map((o) => { const { W, H } = pixelsOf(s, o);
    return `<link rel="apple-touch-startup-image" media="(device-width: ${s.w}px) and (device-height: ${s.h}px) and (-webkit-device-pixel-ratio: ${s.r}) and (orientation: ${o})" href="/launch-image/${W}x${H}.png?g=${g}">`; }));
}

/** the page with its launch links at the end of its head (unchanged without a head) */
function withLinks(html, ground) {
  const s = String(html), at = s.indexOf('</head>');
  return at < 0 ? s : `${s.slice(0, at)}  ${linksFor(ground).join('\n  ')}\n${s.slice(at)}`;
}

module.exports = { SCREENS, SIZES, pixelsOf, rgbOf, crc32, solidPng, imageFor, linksFor, withLinks };
