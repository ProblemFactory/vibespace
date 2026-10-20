'use strict';
// THE OWNER'S FACTS AN AGENT IS TOLD (lane agent-context-owner-facts, B-7960): their clock and where their tray is. The
// ONE reader of what they rest on — the instance setting `instance.timezone` (+ the process TZ env and the system zone,
// zoneOf's fallbacks), the synced chrome settings the tray's place reads (tray-words TRAY_SETTING_KEYS) and the owner's
// last page (user-state `ownerPage`: its language, phone or not). The words themselves are PURE (src/when-words.js,
// src/tray-words.js); this module only binds them to the instance, so every door — the Task Group renders, the agent
// routes, the CLI answers — says the same thing without each one threading the settings in.
// server.js configure()s it at boot with THE server-side settings reader and user-state; unconfigured (a suite that builds
// one store) it reads no setting: the zone is the process's own, the tray its default place.
const WW = require('../when-words.js');
const TW = require('../tray-words.js');

let src = { setting: () => undefined, userState: () => null };
function configure({ setting, userState } = {}) {
  src = { setting: typeof setting === 'function' ? setting : () => undefined, userState: typeof userState === 'function' ? userState : () => null };
}
const read = (fn, ...a) => { try { return fn(...a); } catch { return undefined; } };
function systemZone() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { return null; } }

/** THE instance's zone → { zone, from, refused? } (when-words zoneOf). */
function zone() { return WW.zoneOf(read(src.setting, 'instance.timezone'), { env: process.env.TZ, system: systemZone() }); }
/** A time in the owner's zone (when-words whenOf); `now` drops today's date — pass it only beside zoneSentence. */
function when(ms, { now = null } = {}) { return WW.whenOf(ms, { zone: zone().zone, now }); }
function zoneSentence(now = Date.now()) { return WW.zoneSentence(zone(), now); }
/** The calendar day of `ms` in the owner's zone ('YYYY-MM-DD'), or null. */
function day(ms) { return WW.dayOf(ms, zone().zone); }
/** The tray in words (tray-words trayWords): { label, where, name, phrase }. */
function tray() {
  const arrangement = {};
  for (const k of TW.TRAY_SETTING_KEYS) arrangement[k] = read(src.setting, k);
  const st = read(src.userState);
  const page = st && st.ownerPage && typeof st.ownerPage === 'object' ? st.ownerPage : {};
  return TW.trayWords({ arrangement, lang: page.lang, phone: !!page.phone });
}

module.exports = { configure, zone, when, day, zoneSentence, tray };
