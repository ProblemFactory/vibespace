'use strict';
/**
 * THE INSTALLABLES — one row per thing the machine's ONE package slot (src/install-slot.js) installs, each declared by
 * the module that owns it and registered here by ONE line (lane dc-apps-rows, 2026-10-04; review rv-desktop-apps F-I1).
 * A row:
 *   { id, from: 'facts' (planned from the machine's facts op) | 'hello' (from the agent's hello — no facts op),
 *     plan(facts) | spec (a closed apt spec → the slot's packageInstallPlan), default? (the install a request that names
 *     none means), humanOnly? (an agent token is refused at the route), local?: {code, error} (refused BY NAME on this
 *     machine), done: 'display' | 'catalog' | 'vnc' (what the route re-checks after the run) }
 * The access layer (src/server/desktop-access.js installPlan / installPackage), the routes (src/routes/desktop-apps.js
 * GET install-plan, POST install) and the plan lookup ask the ROW; none of them names an installable. A new installable
 * = its row in its owner module + one line below (its words in the install dialog aside).
 */
const M = require('./desktop-apps');
const O = require('./office-open');
const S = require('./install-slot');

const INSTALLS = Object.freeze([
  M.XPRA_INSTALL, // the display rung (src/desktop-apps.js)
  ...O.INSTALL_ROWS, // §7.9 the LibreOffice set (src/office-open.js)
  M.TIGHTVNC_INSTALL, // design 014 D1 the Windows one-time setup (src/machine-desktop-model.js, re-exported by src/desktop-apps.js)
]);
const BY_ID = new Map(INSTALLS.map((r) => [r.id, r]));
/** The install a request that names none means (the one row declaring `default`). */
const DEFAULT_INSTALL = INSTALLS.find((r) => r.default).id;
/** The installs planned from the machine's facts op — the closed set a refusal names. */
const INSTALL_WHATS = Object.freeze(INSTALLS.filter((r) => r.from === 'facts').map((r) => r.id));
const whatOf = (what) => (what === undefined || what === null || what === '' ? DEFAULT_INSTALL : String(what));
/** `what` (absent ⇒ the default) → its row, or null. */
function installRow(what) { return BY_ID.get(whatOf(what)) || null; }
/** THE ONE PLAN LOOKUP over the facts op (the access layer's `installPlan(hostId, what)`): the row's own plan, or the
 *  slot's apt plan over its closed spec; anything else refused `bad-request` by name. */
function installPlanFor(what, f) {
  const w = whatOf(what);
  const row = BY_ID.get(w);
  if (!row || row.from !== 'facts') return { ok: false, code: 'bad-request', error: `unknown install ${JSON.stringify(w.slice(0, 40))} — one of ${INSTALL_WHATS.join(', ')}` };
  return typeof row.plan === 'function' ? row.plan(f) : S.packageInstallPlan(f, row.spec);
}

module.exports = { INSTALLS, DEFAULT_INSTALL, INSTALL_WHATS, installRow, installPlanFor };
