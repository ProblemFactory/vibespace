'use strict';
/**
 * THE BUILD-TIME PATCH OF THE BUNDLED noVNC (lane desktop-v2-entry, design q-030 §3; measured in @novnc/novnc 1.7.0 first):
 *   ① 1.7's RFB._updateClip turns viewport clipping OFF whenever it scales ("Disable viewport clipping if we are scaling"),
 *     so one display of a multi-screen framebuffer cannot be shown scaled to the window. The patch adds `vsCrop`
 *     ({x, y, w, h} in fb pixels | null): while set, the Display clips to that rect AND autoscales it (Display.autoscale
 *     already scales the viewport, not the framebuffer); pointer coordinates go through Display.absX/absY — the viewport's
 *     offset is added there, so a click lands on the machine where it was seen. Switching the rect never reconnects.
 *   ② 1.7's _handleExtendedDesktopSize keeps only the FIRST screen's id/flags and skips every rect — the patch hands the
 *     payload (4 + 16·n bytes) to the page as a `vsscreens` event first (src/desktop-screens.js rfbScreens reads it).
 * The added code calls rfb.js's own methods _updateClip(), _updateScale() and _setClippingViewport() (defined there, not here).
 * Each anchor must match exactly once, else the build FAILS (an upstream change is read, never silently unpatched).
 * PURE: scripts/build-novnc.mjs applies it; scripts/test-screen-map.mjs pins it; the chrome suite builds a copy without it (the
 * mutant: the crop leg goes red).
 */
const PATCHES = Object.freeze([
  {
    name: 'crop',
    anchor: '    _updateClip() {\n        const curClip = this._display.clipViewport;',
    text: [
      '    get vsCrop() { return this._vsCrop || null; }',
      '    set vsCrop(r) {',
      '        this._vsCrop = r && r.w > 0 && r.h > 0 ? { x: Math.floor(r.x), y: Math.floor(r.y), w: Math.floor(r.w), h: Math.floor(r.h) } : null;',
      '        if (!this._vsCrop && this._display.clipViewport) this._display.clipViewport = false;',
      '        this._updateClip(); this._updateScale();',
      '    }',
      '    _updateClip() {',
      '        if (this._vsCrop) {',
      '            const c = this._vsCrop, d = this._display;',
      '            if (!d.clipViewport) d.clipViewport = true;',
      '            d.viewportChangeSize(c.w, c.h);',
      '            d.viewportChangePos(c.x - d._viewportLoc.x, c.y - d._viewportLoc.y);',
      '            this._setClippingViewport(false);',
      '            return;',
      '        }',
      '        const curClip = this._display.clipViewport;'].join('\n'),
  },
  {
    name: 'screens',
    anchor: '        const firstUpdate = !this._supportsSetDesktopSize;',
    text: '        this.dispatchEvent(new CustomEvent("vsscreens", { detail: { bytes: this._sock.rQpeekBytes(bytes) } }));\n        const firstUpdate = !this._supportsSetDesktopSize;',
  },
]);
/** The added lines (the ≤ 20-line budget the design set). */
const ADDED_LINES = PATCHES.reduce((n, p) => n + p.text.split('\n').length - p.anchor.split('\n').length, 0);

/** rfb.js source → { ok, text, applied: [name], missing: [name] } (an anchor found 0 or 2+ times is missing). */
function patchRfb(src) {
  let text = String(src || '');
  const applied = [], missing = [];
  for (const p of PATCHES) {
    const at = text.indexOf(p.anchor);
    if (at < 0 || text.indexOf(p.anchor, at + 1) >= 0) { missing.push(p.name); continue; }
    text = text.slice(0, at) + p.text + text.slice(at + p.anchor.length);
    applied.push(p.name);
  }
  return { ok: missing.length === 0, text, applied, missing };
}

module.exports = { PATCHES, ADDED_LINES, patchRfb };
