/**
 * THE STREAM VIEWS — the client twin of src/server/stream-relays.js (rv-desktop-apps F-B4, lane dc-seams-desktop
 * 2026-10-05): one entry per picture-stream KIND, keyed by the view module's OWN `STREAM_KIND`. A desktop-app window
 * asks `viewOf(rec.stream)` and spells no kind; a new kind is its view module + ONE line here. `STATUS_KIND` = the
 * view that carries the window's status line when no record names a picture (a gone record, an error) — and the one an
 * unregistered kind falls to, as before this registry (the bridge refuses such a kind 501 by name).
 */
import * as rfb from './vnc-view.js';
import * as xpra from './xpra-view.js';

const VIEWS = [
  { kind: rfb.STREAM_KIND, create: rfb.createVncView },
  { kind: xpra.STREAM_KIND, create: xpra.createXpraView },
];

export const STREAM_VIEWS = Object.freeze(Object.fromEntries(VIEWS.map((v) => [v.kind, v.create])));
export const STATUS_KIND = rfb.STREAM_KIND;
/** The view factory of a stream kind (the STATUS_KIND view for a kind no module registered — never a guess by name). */
export function viewOf(kind) { return Object.hasOwn(STREAM_VIEWS, kind) ? STREAM_VIEWS[kind] : STREAM_VIEWS[STATUS_KIND]; }
