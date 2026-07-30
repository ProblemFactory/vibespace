/**
 * Task-group auto color+texture as a FIXED SEQUENCE S_k in the 4-D identity
 * space (hue × lightness band × line-style texture) — the user's
 * formalization (2.231.1): every prefix S_0..S_i stays "far enough apart",
 * ALREADY-ASSIGNED points NEVER MOVE, deletion FREES a slot for reuse, and
 * manual color/texture picks MASK the sequence points they sit close to so
 * auto never collides with them.
 *
 * The prefix-optimal hue generator is the GOLDEN ANGLE sequence (sunflower
 * phyllotaxis): within a plane the j-th hue is j×137.5077°, whose min
 * pairwise gap over ANY prefix stays ≥ ~61.8% of ideal even spacing
 * (three-gap theorem). Slots cycle lightness bands first (52/36/68%),
 * textures open after 36 solid slots: 12 hues × 3 bands × 4 line styles =
 * 144 immutable slots, wrapping past that (best effort).
 *
 * SHARED between server (allocator in task-groups.js) and client (renderers
 * via src/lib/utils.js re-export) — one source of truth; esbuild handles the
 * CJS import.
 */

const GOLDEN = 137.50776405003785;
const BANDS = [52, 36, 68];
const PATTERNS = [null, 'dash', 'dot', 'diag'];
const SLOTS = 144;

function seqTaskColor(k) {
  const kk = ((Math.floor(k) % SLOTS) + SLOTS) % SLOTS;
  const pattern = PATTERNS[Math.floor(kk / 36)];
  const k2 = kk % 36;
  const band = k2 % 3;
  const j = Math.floor(k2 / 3);
  // band offset decorrelates the three interleaved band sequences so
  // consecutive slots differ in hue as well as lightness
  const hue = Math.round((j * GOLDEN + band * 41) % 360);
  return { color: `hsl(${hue}, 62%, ${BANDS[band]}%)`, hue, lightness: BANDS[band], pattern };
}

function hueDist(a, b) { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); }

/** Parse #rgb/#rrggbb/hsl(...) to {h, l} (hue degrees, lightness %); null if unparseable. */
function colorToHl(c) {
  if (typeof c !== 'string') return null;
  const hsl = c.match(/hsl\(\s*(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)%[,\s]+(\d+(?:\.\d+)?)%\s*\)/);
  if (hsl) return { h: +hsl[1] % 360, l: +hsl[3] };
  let m = c.match(/^#([0-9a-f]{6})$/i);
  let r, g, b;
  if (m) { r = parseInt(m[1].slice(0, 2), 16); g = parseInt(m[1].slice(2, 4), 16); b = parseInt(m[1].slice(4, 6), 16); }
  else {
    m = c.match(/^#([0-9a-f]{3})$/i);
    if (!m) return null;
    r = parseInt(m[1][0] + m[1][0], 16); g = parseInt(m[1][1] + m[1][1], 16); b = parseInt(m[1][2] + m[1][2], 16);
  }
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  let h = 0;
  if (max !== min) {
    const d = max - min;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  return { h: Math.round(h) % 360, l: Math.round(l * 100) };
}

/** Slots masked by ONE manual (color, pattern) pick: any slot rendering
 *  close to it (same texture, similar lightness, hue within 24°). */
function maskedSlotsFor(color, pattern) {
  const hl = colorToHl(color);
  if (!hl) return [];
  const pat = pattern && pattern !== 'solid' ? pattern : null;
  const out = [];
  for (let k = 0; k < SLOTS; k++) {
    const s = seqTaskColor(k);
    if (s.pattern === pat && Math.abs(s.lightness - hl.l) < 12 && hueDist(s.hue, hl.h) < 24) out.push(k);
  }
  return out;
}

/** The allocator: lowest slot that is neither OCCUPIED (a live group's
 *  colorSeq — deletion frees slots naturally) nor MASKED by a manual pick.
 *  All 144 taken → overflow past the wheel (wraps in seqTaskColor). */
function pickColorSeq(tasks) {
  const taken = new Set();
  for (const t of tasks || []) {
    if (Number.isInteger(t?.colorSeq)) taken.add(((t.colorSeq % SLOTS) + SLOTS) % SLOTS);
    if (t?.color && t.color !== 'none') for (const k of maskedSlotsFor(t.color, t.pattern)) taken.add(k);
  }
  for (let k = 0; k < SLOTS; k++) if (!taken.has(k)) return k;
  let max = -1;
  for (const t of tasks || []) if (Number.isInteger(t?.colorSeq)) max = Math.max(max, t.colorSeq);
  return max + 1;
}

module.exports = { seqTaskColor, pickColorSeq, maskedSlotsFor, colorToHl, hueDist, SLOTS };
