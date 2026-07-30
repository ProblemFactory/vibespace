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
 * (three-gap theorem). ALL dimensions engage from the start (v5): the 12
 * discrete planes (3 lightness bands × 4 line styles — solid trio first,
 * then dash/dot/diag trios) cycle every 12 slots, while the within-plane
 * golden index grows without bound — the sequence is INFINITE, later
 * points pack the existing space ever more densely (min gap
 * ~0.618×360/perPlaneCount) but NEVER collide exactly.
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
  // v5 (2.232.0, user: "20 groups and still no texture — is this really
  // done?"): ALL FOUR dimensions participate from the start. The 12 discrete
  // planes (3 bands × 4 line styles, solid trio first, then dash/dot/diag
  // trios) cycle every 12 slots, so any two groups within 11 of each other
  // differ in lightness band or texture outright; the within-plane
  // golden-angle index j = floor(k/12) grows WITHOUT BOUND (infinite
  // sequence, 2.231.2: irrational rotation never repeats a hue, min gap
  // degrades gracefully as ~0.618 × 360/perPlaneCount — later points pack
  // the existing space ever denser, never colliding). A per-plane hue
  // offset (97° steps) decorrelates consecutive slots in hue as well.
  // NOTE: this reordered the k<144 renderings once (the old layout filled
  // 36 solid slots before any texture — an aesthetic choice that
  // contradicted the maximize-difference directive).
  const kk = Math.max(0, Math.floor(k) || 0);
  const planeIdx = kk % 12;
  const band = planeIdx % 3;
  const pattern = PATTERNS[Math.floor(planeIdx / 3)];
  const j = Math.floor(kk / 12);
  const hue = ((j * GOLDEN + planeIdx * 97) % 360);
  return { color: `hsl(${Math.round(hue * 10) / 10}, 62%, ${BANDS[band]}%)`, hue, lightness: BANDS[band], pattern };
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
 *  colorSeq — deletion frees slots naturally) nor MASKED by a manual pick
 *  (tested on the fly, so masking extends over the whole infinite
 *  sequence, not just the first cycle). Always terminates: a manual pick
 *  only masks slots rendering close to it, never a whole plane. */
function pickColorSeq(tasks) {
  const taken = new Set();
  const manuals = [];
  for (const t of tasks || []) {
    if (Number.isInteger(t?.colorSeq)) taken.add(t.colorSeq);
    if (t?.color && t.color !== 'none') {
      const hl = colorToHl(t.color);
      if (hl) manuals.push({ hl, pat: t.pattern && t.pattern !== 'solid' ? t.pattern : null });
    }
  }
  for (let k = 0; k < 100000; k++) {
    if (taken.has(k)) continue;
    const s = seqTaskColor(k);
    if (manuals.some((m) => s.pattern === m.pat && Math.abs(s.lightness - m.hl.l) < 12 && hueDist(s.hue, m.hl.h) < 24)) continue;
    return k;
  }
  return 100000; // unreachable in practice
}

module.exports = { seqTaskColor, pickColorSeq, maskedSlotsFor, colorToHl, hueDist, SLOTS };
