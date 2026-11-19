'use strict';
/**
 * THE TASK GROUPS STORE HELD UNREAD — the HUB's own fact (lane bl-windows, 主开发's follow): is task-groups.json held right now?
 * Set ONCE by the store's wiring (task-groups-wiring createStore). The hub's doors that judge a LIVE agent from the roster's
 * groups (the channel reach / watch / send, an automation key's reach) HAND it to the pure verdicts as a fact —
 * `groupsUnreadable` — the way the exit, browser and vault doors already pass their unreadable mark; a pure model never holds it
 * (src/grant-model.js rides the device agent's bundle as the release has it).
 */
let heldFn = () => false;
/** the store's own predicate (one setter: task-groups-wiring) */
function setHeld(fn) { heldFn = typeof fn === 'function' ? fn : () => false; }
/** → true while held; a predicate that throws reads as held (fail closed) */
function held() { try { return heldFn() === true; } catch { return true; } }
/** the fact as a spread for a verdict's facts / a principal: `{ groupsUnreadable: true }` while held, else nothing */
const fact = () => (held() ? { groupsUnreadable: true } : {});
module.exports = { setHeld, held, fact };
