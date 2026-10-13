'use strict';
/**
 * DESKTOP v2 P1 (lane desktop-v2-latency, design q-030 §4 + §6 P1): how a paired machine's picture is asked for while the person
 * works in it. PURE (no I/O, no DOM): src/lib/vnc-view.js applies it, scripts/test-quality-plan.mjs pins it.
 *
 *   qualityPlan({moving, idleMs, kbps, slow})  → {qualityLevel, compressionLevel, rung, still, slow, why} — input or a changing
 *                                        picture ⇒ 流畅 3 / 1; still ≥ STILL_MS ⇒ 清晰 8 / 2 (the page then asks ONCE for the shown
 *                                        display again: a still screen sends nothing, so what was drawn at 3 would stay blurry);
 *                                        a slow link (the measured kbps < SLOW_KBPS; normal again at ≥ SLOW_KBPS × FAST_AGAIN, null
 *                                        kbps keeps the last verdict) steps ONE rung down the ladder
 *   pictureChanging(stats)               the timing table's last second: ≥ CHANGE_UPDATES answers to incremental requests carrying
 *                                        ≥ CHANGE_BYTES (a blinking caret or a ticking clock is not a moving picture)
 *   sentInput(type, bytes, at)           is this client message the person's input — a key, a press / drag / wheel (a bare hover
 *                                        moves the remote cursor only, not the picture)
 *   refreshRequest(rect)                 a NON-incremental FramebufferUpdateRequest for a rect (10 bytes)
 *   pasteChord(e)                        Ctrl/⌘+V without Alt → {keysym} — the key the machine gets right after the text
 *   pasteText(raw)                       the clipboard's text/plain → the ClientCutText text (CRLF → LF, the RFB rule) | null
 *   keyboardLockGate({secure, api, fullscreen, want}) → {lock, why} — navigator.keyboard.lock only on a secure page that has it,
 *                                        in full screen, with the ⌨ toggle on
 *   NAGLE_REFERENCE                      lane picture-path-nodelay's recorded before / after (words for the strip, never a live A/B)
 */

/** Still this long ⇒ the sharp rung. */
const STILL_MS = 500;
/** A measured link rate below this is a slow link (one rung down) … */
const SLOW_KBPS = 2000;
/** … and it is a normal link again only at SLOW_KBPS × FAST_AGAIN (no flapping on a link that hovers at the bound). */
const FAST_AGAIN = 1.5;
/** The picture is moving: this many updates in the last second … */
const CHANGE_UPDATES = 2;
/** … carrying at least this much. */
const CHANGE_BYTES = 24 * 1024;
/** THE LADDER, sharpest first: noVNC's qualityLevel (JPEG 0–9) and compressionLevel (zlib 0–9). A fast link spends no server time
 *  on compression while moving (1); a slow link spends it to send fewer bytes (4 / 6). */
const RUNGS = Object.freeze([
  Object.freeze({ rung: 'sharp', qualityLevel: 8, compressionLevel: 2 }),
  Object.freeze({ rung: 'balanced', qualityLevel: 6, compressionLevel: 4 }),
  Object.freeze({ rung: 'fluid', qualityLevel: 3, compressionLevel: 1 }),
  Object.freeze({ rung: 'lean', qualityLevel: 1, compressionLevel: 6 }),
]);
/** lane picture-path-nodelay (39caed5e8, 2026-10-12): a key press through the real hops (relay, hub forward, agentd), median. */
const NAGLE_REFERENCE = Object.freeze({ lane: 'picture-path-nodelay', beforeMs: 42.0, afterMs: 0.70, p95BeforeMs: 43.0, p95AfterMs: 1.14 });

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** The rung for the moment: { qualityLevel, compressionLevel, rung, still, slow, why: 'moving' | 'settling' | 'still' }. */
function qualityPlan({ moving = false, idleMs = null, kbps = null, slow = false } = {}) {
  const idle = num(idleMs), k = num(kbps);
  const why = moving ? 'moving' : idle != null && idle < STILL_MS ? 'settling' : 'still';
  const isSlow = k == null ? !!slow : slow ? k < SLOW_KBPS * FAST_AGAIN : k < SLOW_KBPS;
  const r = RUNGS[(why === 'still' ? 0 : 2) + (isSlow ? 1 : 0)];
  return { qualityLevel: r.qualityLevel, compressionLevel: r.compressionLevel, rung: r.rung, still: why === 'still', slow: isSlow, why };
}

/** The timing table's stats ({changes, changeBytes}) → is the picture moving. */
function pictureChanging(st) {
  return !!st && (num(st.changes) || 0) >= CHANGE_UPDATES && (num(st.changeBytes) || 0) >= CHANGE_BYTES;
}

/** One client message (its type, the send's bytes, its offset) → the person's input? KeyEvent (4), a PointerEvent (5) with a
 *  button / wheel bit, QEMU's extended key (255). */
function sentInput(type, bytes, at = 0) {
  if (type === 4 || type === 255) return true;
  if (type !== 5) return false;
  const b = bytes && typeof bytes.length === 'number' ? bytes : null;
  return !!b && at + 1 < b.length && b[at + 1] !== 0;
}

/** A non-incremental FramebufferUpdateRequest (type 3) for {x, y, w, h} in fb pixels. */
function refreshRequest(r) {
  const c = (v) => Math.max(0, Math.min(0xffff, Math.floor(num(v) || 0)));
  const x = c(r && r.x), y = c(r && r.y), w = c(r && r.w), h = c(r && r.h);
  return Uint8Array.from([3, 0, x >> 8, x & 255, y >> 8, y & 255, w >> 8, w & 255, h >> 8, h & 255]);
}

/** A keydown → the paste chord ({keysym} of the V the machine gets after the text) | null. */
function pasteChord(e) {
  if (!e || !(e.ctrlKey || e.metaKey) || e.altKey) return null;
  const v = e.code === 'KeyV' || (!e.code && (e.key === 'v' || e.key === 'V'));
  return v ? { keysym: e.shiftKey ? 0x56 : 0x76, code: 'KeyV' } : null;
}

/** The clipboard's text/plain → what ClientCutText carries (lines end with LF alone — RFB 6.4.6) | null when there is none. */
function pasteText(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.replace(/\r\n?/g, '\n');
  return s.length ? s : null;
}

/** May the page lock the keyboard now? → { lock, why: 'insecure' | 'no_api' | 'off' | 'not_fullscreen' | 'ok' }. */
function keyboardLockGate({ secure = false, api = false, fullscreen = false, want = true } = {}) {
  const why = !secure ? 'insecure' : !api ? 'no_api' : !want ? 'off' : !fullscreen ? 'not_fullscreen' : 'ok';
  return { lock: why === 'ok', why };
}

module.exports = { STILL_MS, SLOW_KBPS, FAST_AGAIN, CHANGE_UPDATES, CHANGE_BYTES, RUNGS, NAGLE_REFERENCE, qualityPlan, pictureChanging, sentInput, refreshRequest, pasteChord, pasteText, keyboardLockGate };
