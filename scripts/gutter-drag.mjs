// THE SCROLLBAR'S DOOR (r1175, lane bl-chat-b) — beside scripts/scratch.mjs's realClicker / stillPresser, in a file of its own so that
// only the suites pressing a scrollbar read it (scratch.mjs is read by nearly every heavy suite). No import: the suite hands its
// own evalJs / cdp.
/** A SCROLLBAR DRAG AS ONE ACT (r1175, lane bl-chat-b — the chat's jump hold, drawn): a scroller's own scrollbar has no element of
 *  its own, so realClicker / stillPresser cannot aim at it. This door measures the scroller's vertical GUTTER (the strip of its border
 *  box the content box does not reach: offsetWidth − clientWidth − its borders, on the right in LTR, in viewport px — body zoom
 *  scales the rect, not clientWidth), aims at the THUMB (where scrollTop / scrollHeight put it on the client height), proves the point
 *  is the scroller's OWN (document.elementFromPoint there IS the scroller), presses there, runs `whileHeld` (a suite's look while the
 *  press is held), moves by `dy` px in `steps`, releases, and checks where the press LANDED (a one-shot capture listener: the
 *  pointerdown's target is the scroller) → { ok, why?, x, y, sbw, st, dy, held } — a point that is not the scroller's own is never
 *  pressed (named); an RTL scroller or one with no vertical scrollbar is refused by name. */
export function gutterDragger({ evalJs, cdp, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  return async (expr, { dy = 0, steps = 4, stepMs = 20, whileHeld = null } = {}) => {
    const m = await evalJs(`(() => { const e = ${expr}; if (!e || !e.isConnected) return { found: false };
      const cs = getComputedStyle(e), r = e.getBoundingClientRect(), k = e.offsetWidth ? r.width / e.offsetWidth : 1;
      const bl = parseFloat(cs.borderLeftWidth) || 0, br = parseFloat(cs.borderRightWidth) || 0, bt = parseFloat(cs.borderTopWidth) || 0;
      const sbw = e.offsetWidth - e.clientWidth - bl - br;
      if (!(sbw > 0)) return { found: true, sbw, why: 'no vertical scrollbar (its gutter is 0 wide)' };
      if (cs.direction === 'rtl') return { found: true, sbw, why: 'an RTL scroller (its gutter on the left): not measured by this door' };
      const track = e.clientHeight * k, thumb = Math.max(track * e.clientHeight / Math.max(1, e.scrollHeight), Math.min(track, 2 * sbw * k));
      const x = r.right - (br + sbw / 2) * k, y = r.top + bt * k + (e.scrollTop / Math.max(1, e.scrollHeight - e.clientHeight)) * (track - thumb) + thumb / 2;
      const hit = document.elementFromPoint(x, y);
      window.__vsGutterSeen = null;
      if (hit === e) { const own = (ev) => { window.__vsGutterSeen = { mine: ev.target === e }; window.removeEventListener('pointerdown', own, true); }; window.addEventListener('pointerdown', own, true); }
      return { found: true, sbw, x, y, st: e.scrollTop, hits: hit === e, under: hit ? hit.tagName.toLowerCase() + (typeof hit.className === 'string' && hit.className.trim() ? '.' + hit.className.trim().split(/\\s+/)[0] : '') : null }; })()`);
    if (!m || !m.found) return { ok: false, why: 'no such scroller on the page' };
    if (m.why) return { ok: false, ...m };
    if (!m.hits) return { ok: false, ...m, why: `its gutter point is not the scroller's own (${m.under} there) — not pressed` };
    await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: m.x, y: m.y });
    await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: m.x, y: m.y, button: 'left', buttons: 1, clickCount: 1 });
    const held = whileHeld ? await whileHeld() : null;
    for (let i = 1; i <= steps; i++) { await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: m.x, y: m.y + (dy * i) / steps, button: 'left', buttons: 1 }); await sleep(stepMs); }
    await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: m.x, y: m.y + dy, button: 'left', buttons: 0, clickCount: 1 });
    const seen = await evalJs('window.__vsGutterSeen || null');
    if (!seen || !seen.mine) return { ok: false, ...m, dy, held, why: 'the press did not land on the scroller (no pointerdown of its own)' };
    return { ok: true, ...m, dy, held };
  };
}
