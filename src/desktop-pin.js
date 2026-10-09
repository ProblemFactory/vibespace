'use strict';
/**
 * THE PINNED PIXEL SIZE (lane e2b, docs/design-agent-browser-v2 §E2.2, B-830d ②) — PURE, imports nothing. A desktop-app
 * window may PIN an absolute framebuffer size: the record's fact `pin: {w, h} | null` (device px). With a pin the X
 * window IS the pin (the xpra client fits the main window to it, never to the pane) and the pane always rescales the
 * picture (contain-fit, upscaling allowed); pixel coordinates are the pin's (`mapPoint` unchanged). The outer window
 * stays freely resizable — never `setFixedSize` (that is app-fit-fixed's answer to an app that fixed its OWN size).
 * Set by the launch arg `--size WxH`, mid-way by `vibespace-window size <handle> WxH | auto` (the opener on its own
 * window) or the window menu "Pin size…" (the user, any window). The ONE home of: the parse + bounds, who may set it,
 * the picture's fit, the chip's words and E2c's default (E2c decides the mode; this only answers what a mode pins).
 */
const PIN_BOUNDS = Object.freeze({ minW: 320, maxW: 7680, minH: 240, maxH: 4320 });
/** The window menu's "Pin size…" rows (then Auto). */
const PIN_CHOICES = Object.freeze([Object.freeze({ w: 1920, h: 1080 }), Object.freeze({ w: 1280, h: 720 })]);
const PIXELS_PIN = Object.freeze({ w: 1920, h: 1080 });
const PIN_WORDS = Object.freeze({ en: '{w}×{h} (pinned)', zh: '{w}×{h}（钉住）', ja: '{w}×{h}（固定）' });

/** `'1920x1080'` (x / X / ×) or `{w, h}` → `{ok, pin: {w, h}}`; `'auto'` / null → `{ok, pin: null}` (unpinned); else refused by name. */
function parsePin(src) {
  if (src === null || src === undefined) return { ok: true, pin: null };
  const s = typeof src === 'object' ? `${src.w}x${src.h}` : String(src).trim().toLowerCase();
  if (s === 'auto') return { ok: true, pin: null };
  const m = /^(\d{1,5})\s*[x×]\s*(\d{1,5})$/.exec(s);
  if (!m) return { ok: false, code: 'bad-size', error: `a size is WxH in pixels (e.g. 1920x1080) or auto — got ${JSON.stringify(typeof src === 'object' ? src : String(src))}` };
  const w = Number(m[1]), h = Number(m[2]), B = PIN_BOUNDS;
  if (w < B.minW || w > B.maxW) return { ok: false, code: 'size_out_of_bounds', error: `width ${w} is outside ${B.minW}–${B.maxW} pixels` };
  if (h < B.minH || h > B.maxH) return { ok: false, code: 'size_out_of_bounds', error: `height ${h} is outside ${B.minH}–${B.maxH} pixels` };
  return { ok: true, pin: { w, h } };
}
/** A stored value read back (a record, a broadcast): a valid pin or null — never a refusal. */
function pinOf(v) { const r = v ? parsePin(v) : null; return r && r.ok ? r.pin : null; }

/** Who may pin: the USER on any window; an AGENT only on a desktop browser it opened (`record.by` = its opener) —
 *  else `not_your_window`. `{ok, pin}` | `{ok:false, code, error}`. */
function pinVerdict({ facts = {}, record = null, who = 'agent', size } = {}) {
  const p = parsePin(size === undefined ? '' : size);
  if (!p.ok) return p;
  if (!record) return { ok: false, code: 'not-found', error: 'no such window' };
  if (who === 'user') return { ok: true, pin: p.pin };
  const opener = record.by && record.by.sessionId;
  if (opener && facts && opener === facts.sessionId) return { ok: true, pin: p.pin };
  return { ok: false, code: 'not_your_window', error: `${record.id || 'that window'} is not a desktop browser this conversation opened — only its opener pins its size; the user pins any window from its menu (Pin size…)` };
}

/** The picture of a pinned window in the pane — contain-fit, CENTRED, UPSCALING ALLOWED (a pin always rescales):
 *  `pin` and `pane` in the same units → `{scale, x, y, w, h}` (whole-px offset), or null with no pin / no pane. */
function fitForPin(pin, pane) {
  const pw = pane && Number(pane.width != null ? pane.width : pane.w), ph = pane && Number(pane.height != null ? pane.height : pane.h);
  if (!pin || !(pin.w > 0) || !(pin.h > 0) || !(pw > 0) || !(ph > 0)) return null;
  const scale = Math.min(pw / pin.w, ph / pin.h), w = pin.w * scale, h = pin.h * scale;
  return { scale, x: Math.max(0, Math.floor((pw - w) / 2)), y: Math.max(0, Math.floor((ph - h) / 2)), w, h };
}

/** The window chip: "1920×1080 (pinned)" (zh 钉住) — '' when unpinned. */
function pinChipText(pin, lang = 'en') {
  const p = pinOf(pin);
  return p ? (PIN_WORDS[lang] || PIN_WORDS.en).replace('{w}', String(p.w)).replace('{h}', String(p.h)) : '';
}

/** E2c's DEFAULT (lane e2c-mode calls it; this lane never decides the mode): pixels ⇒ 1920×1080, tree / anything else ⇒ unpinned. */
function defaultPinFor(mode) { return mode === 'pixels' ? { ...PIXELS_PIN } : null; }

module.exports = { PIN_BOUNDS, PIN_CHOICES, PIN_WORDS, parsePin, pinOf, pinVerdict, fitForPin, pinChipText, defaultPinFor };
