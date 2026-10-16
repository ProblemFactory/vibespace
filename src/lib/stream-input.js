// lane stream-p1a-transport (design q-041 r2 §2 输入 / §3 P1b — owner 2026-10-16 「一起做」): what a press, the pointer and the
// wheel on the stream's <video> send down the `input` data channel. No DOM here — the view (src/lib/stream-view.js) hands
// over the event's fields, so a suite imports this file in node.
//   • A DOOR of THE primary-modifier table (src/lib/modifier-map.js, the .287 rule): the viewer's primary modifier becomes
//     the machine's — a Mac viewer's ⌘ reaches a Windows machine as Ctrl (its side kept); every other key is sent as the
//     PHYSICAL key it is (`code`), and the machine's injector presses that key's scan code
//   • the pointer: a point on the element → the source's pixel (letterbox aware) + the source's origin on the machine's
//     desktop (src/stream-model.js videoToSource); a point in the letterbox moves nothing
//   • the wheel: DOM deltas → the desktop's wheel units (120 a notch, src/stream-model.js wheelUnitsOf)
import { primaryModifierMap, modifierKeyOf, platformOf } from './modifier-map.js';
import { videoToSource, wheelUnitsOf } from '../stream-model.js';

/** The viewer's platform, from what the browser says (userAgentData first). */
export function viewerPlatform(nav = typeof navigator !== 'undefined' ? navigator : null) {
  return platformOf((nav && nav.userAgentData && nav.userAgentData.platform) || (nav && nav.platform) || (nav && nav.userAgent) || '');
}
/** The (viewer, machine) row of the table — asked once per window. */
export function keyMapFor(viewer, host) { return primaryModifierMap({ viewer, host }); }

/** A keydown / keyup → `{ t: 'kd' | 'ku', c }` | null. A modifier KEY moves through the table (⌘ → Control, side kept); any
 *  other key stays the physical key it is. */
export function keyMessage(e, down, map) {
  const moved = modifierKeyOf({ key: e && e.key, code: e && e.code }, map);
  const code = (moved && moved.code) || (e && e.code) || '';
  if (!/^[A-Za-z][A-Za-z0-9]{0,23}$/.test(code)) return null;
  return { t: down ? 'kd' : 'ku', c: code };
}
const BUTTONS = Object.freeze([0, 1, 2]);
/** A pointer event (`kind` 'mv' | 'md' | 'mu') on the element → its message, or null (nothing decoded yet; a press in the
 *  letterbox). `box` = the element's rect, `video` = { w, h } decoded, `origin` = the source's place on the machine. */
export function pointerMessage(kind, e, box, video, origin) {
  const p = videoToSource({ x: e.clientX, y: e.clientY }, box, video, origin);
  if (!p || (kind === 'md' && !p.inside)) return null;
  const msg = { t: kind, x: p.x, y: p.y };
  if (kind !== 'mv') msg.b = BUTTONS.includes(e.button) ? e.button : 0;
  return msg;
}
/** A wheel event → `{ t: 'wh', x, y, dx, dy }` | null (no notch in it). dy > 0 = away from the person (scroll up). */
export function wheelMessage(e, box, video, origin) {
  const p = videoToSource({ x: e.clientX, y: e.clientY }, box, video, origin);
  if (!p) return null;
  const dy = wheelUnitsOf(e.deltaY, e.deltaMode), dx = -wheelUnitsOf(e.deltaX, e.deltaMode);
  return dx || dy ? { t: 'wh', x: p.x, y: p.y, dx, dy } : null;
}
