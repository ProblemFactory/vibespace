'use strict';
/**
 * THE STREAM RELAYS — one entry per picture-stream KIND the ONE bridge (src/server/desktop-stream.js) can carry
 * (rv-desktop-apps F-B4, lane dc-seams-desktop 2026-10-05). A new kind is its own relay module + ONE line here;
 * the bridge asks `STREAM_RELAYS[target.kind]` and refuses 501 a kind no row registers. Rows are keyed by their
 * own `STREAM_KIND` (the client twin: src/lib/stream-views.js keys the views by the view modules' STREAM_KIND).
 */
const RELAYS = [
  require('./stream-relay-rfb.js'),
  require('./stream-relay-xpra.js'),
];

module.exports = Object.freeze(Object.fromEntries(RELAYS.map((r) => [r.STREAM_KIND, Object.freeze(r)])));
