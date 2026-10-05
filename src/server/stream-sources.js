'use strict';
/**
 * THE PICTURE SOURCES behind the ONE desktop stream bridge (src/server/desktop-stream.js) — rv-desktop-apps F-B3, lane
 * dc-desktop-caps 2026-10-04. Every stream id is owned by exactly ONE source; the bridge's wiring
 * (src/server/window-live-wiring.js) folds over this list and spells no id:
 *   singleton       — the in-container Desktop (src/vnc.js) on its fixed id: the person's own, never governed; its
 *                     input still counts as the person's activity (the keeper's and the window engine's clocks)
 *   machine-desktop — a paired Windows / macOS machine's whole desktop (design 014 D1), resolved by the ACCESS layer,
 *                     never the keeper; the person's own, and its input never reaches the keeper's idle clock
 *   keeper          — every desktop-app session (the keeper says null for an id it has no record of) — governed
 * A source: { name, owns(id), target(id), onInput(id) | null, upstreamWhy(id) | null, personal }. The FIRST that owns
 * an id answers for it; the keeper owns the rest. A new source is one entry here.
 */
const M = require('../desktop-apps.js');

function create({ vnc, keeper, engine, access = null, singletonId = M.DESKTOP_SINGLETON_ID }) {
  const noteInput = (id) => { keeper.noteInput(id); engine.noteUserInput(id); };
  const sources = [{ name: 'singleton', owns: (id) => id === singletonId, target: () => ({ kind: 'rfb', port: vnc.port }), onInput: noteInput, upstreamWhy: null, personal: true }];
  if (access) sources.push({ name: 'machine-desktop', owns: (id) => !!M.machineDesktopHost(id), target: (id) => access.machineDesktopTarget(id), onInput: null, upstreamWhy: (id) => access.machineDesktopGone(id), personal: true });
  sources.push({ name: 'keeper', owns: () => true, target: (id) => keeper.streamTarget(id), onInput: noteInput, upstreamWhy: null, personal: false });
  return Object.freeze(sources.map((s) => Object.freeze(s)));
}
/** The source that owns a stream id (the keeper's when no other claims it). */
const sourceOf = (sources, id) => sources.find((s) => s.owns(id));

module.exports = { create, sourceOf };
