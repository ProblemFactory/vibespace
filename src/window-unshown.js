'use strict';
/**
 * B-dbb4 (the coordinator's r756 / r772) — THE APP'S WINDOWS A PIXEL IMAGE DOES NOT SHOW, NAMED. PURE, imports nothing: the
 * hub's window engine (src/server/window-targets-engine.js) asks it over the keeper's windows and window-reach's pixelPlan. Its
 * own module so the device agent's bundle (which carries src/window-reach.js) is not touched.
 */
/**
 * B-dbb4 (the coordinator's r756; userW's report of a sign-in popup a desktop-app Chromium opened, «not followed»): THE APP'S
 * WINDOWS THIS IMAGE DOES NOT SHOW — never a silent stay on the first window. Every NAMED top-level of the app, at least
 * UNSHOWN_MIN_PX on both sides (Chrome's 15×15 helper is no window a person sees), that the plan leaves out or cuts, with WHY:
 * 'unmapped' (no pixels on the display), 'outside' (up-left of the main window and not over it — the origin stays the main's),
 * 'clipped' (partly beyond the image's box: a pinned size). `rows` = the keeper's windows, `plan` = pixelPlan's answer →
 * `[{id, title, x, y, w, h, why}]` (x / y from the IMAGE's origin, so negative = up-left of it), the largest first, ≤ UNSHOWN_KEEP.
 */
const UNSHOWN_MIN_PX = 100, UNSHOWN_KEEP = 8;
/** THE ONE title of an app's window for the agent's words (unit 1's list, unit 2's subject): its own title (a web page's <title>,
 *  the app's to set) with every control character a space, bounded — stripped once, here. */
function titleOf(w) { return String((w && (w.title || w.name || w.instance || w.cls)) || '').replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').slice(0, 120); }
function unshownOf(rows, plan) {
  if (!plan || !plan.ok || !plan.origin) return [];
  const ids = new Set((Array.isArray(plan.members) ? plan.members : []).map((m) => m.id));
  const ox = Number(plan.origin.x), oy = Number(plan.origin.y), right = ox + Number(plan.w), bottom = oy + Number(plan.h);
  const out = [];
  for (const w of Array.isArray(rows) ? rows : []) {
    if (!w || !(w.cls || w.instance || w.title || w.name) || (plan.main && w.id === plan.main.id)) continue;
    const x = Number(w.x), y = Number(w.y), ww = Number(w.w), hh = Number(w.h);
    if (![x, y, ww, hh].every(Number.isFinite) || ww < UNSHOWN_MIN_PX || hh < UNSHOWN_MIN_PX) continue;
    const why = w.mapped === false ? 'unmapped' : !ids.has(w.id) ? 'outside' : (x < ox || y < oy || x + ww > right || y + hh > bottom) ? 'clipped' : null;
    if (!why) continue;
    out.push({ id: w.id, title: titleOf(w), x: x - ox, y: y - oy, w: ww, h: hh, why });
  }
  return out.sort((a, b) => b.w * b.h - a.w * a.h).slice(0, UNSHOWN_KEEP);
}
/** B-dbb4 unit 2 (r772): ONE window of an app as a call's subject — `<handle>.w<hex X id>`: its own image, origin and --at. */
const SUB_RE = /^(.+)\.w([0-9a-f]{1,8})$/i;
function subHandle(handle, id) { return `${String(handle || '')}.w${(Number(id) >>> 0).toString(16)}`; }
/** …and the agent's words for them: what each is, where, why the image leaves it out, and how to reach it — by ITS OWN handle
 *  (the agent chooses it: its screenshot, --at, keys); an unmapped one has no pixels until the user's live view shows it. */
function unshownText(list, handle = '<handle>', { handles = true } = {}) {
  const rows = Array.isArray(list) ? list.filter((u) => u && u.why) : [];
  if (!rows.length) return '';
  const WHY = {
    unmapped: 'it has no pixels on the display yet (nobody shows it): its handle reaches it once the user\'s live view of the app shows it (`vibespace-window watch ' + handle + '` names where)',
    outside: 'it sits up-left of the main window without covering it (this image starts at the main window\'s top-left)',
    clipped: 'it reaches beyond this image\'s pinned size',
  };
  // the cure (round wudero5nj, ruled): on a SHARED desktop (a rung that does not own its display) no window has a handle of its own
  if (!handles) WHY.unmapped = 'it has no pixels on the display yet (nobody shows it) — the user\'s live view of the app shows it (`vibespace-window watch ' + handle + '` names where)';
  const one = (u) => `«${u.title || 'untitled'}» ${u.w}x${u.h} at ${u.x},${u.y} of this image: ${WHY[u.why] || u.why}${handles ? ` — its own handle \`${subHandle(handle, u.id)}\`` : ''}`;
  const tail = handles ? `. A window's own handle makes it the subject: \`vibespace-window screenshot <its handle>\`, then \`click <its handle> --at x,y\` / \`key\` / \`type\` / \`scroll\` on THAT window's pixels (keys and text focus it)` : '. This desktop is shared with the user\'s own windows, so no window of it has a handle of its own: ask the user, who sees them in the live view';
  return `this app has ${rows.length} more window(s) this image does not show — ${rows.map(one).join('; ')}${tail}`;
}

module.exports = { unshownOf, unshownText, titleOf, UNSHOWN_MIN_PX, UNSHOWN_KEEP, SUB_RE, subHandle };
