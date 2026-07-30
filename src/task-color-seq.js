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
 * textures open after 36 solid slots. The sequence is INFINITE: the 12
 * discrete planes (3 bands × 4 line styles) cycle, while the within-plane
 * golden index grows without bound — later points pack into the existing
 * space ever more densely (min gap ~0.618×360/perPlaneCount) but NEVER
 * collide exactly (irrational rotation).
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
  // INFINITE sequence (2.231.2, the user's theory question caught a gap: the
  // old `% 144` wrap made slot 144 an EXACT duplicate of slot 0). Only the
  // discrete dimensions cycle (3 bands × 4 line styles = 12 planes); the
  // within-plane golden-angle index j grows WITHOUT BOUND — an irrational
  // rotation never lands on the same hue twice, each new point splits an
  // existing gap in the golden ratio, and the min same-plane gap degrades
  // gracefully as ~0.618 × 360/perPlaneCount. So the sequence extends
  // forever, just increasingly dense — never colliding. For k < 144 this
  // formula equals the old one, so already-assigned slots keep their color.
  const kk = Math.max(0, Math.floor(k) || 0);
  const band = (kk % 36) % 3;
  const pattern = PATTERNS[Math.floor(kk / 36) % 4];
  const j = Math.floor(kk / 144) * 12 + Math.floor((kk % 36) / 3);
  // band offset decorrelates the three interleaved band sequences so
  // consecutive slots differ in hue as well as lightness
  const hue = ((j * GOLDEN + band * 41) % 360);
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
