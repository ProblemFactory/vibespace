'use strict';
/**
 * A WINDOW ON THE USER'S OWN DESKTOP (tier 3) — ONE browser backend, ONE file (lane dc-browser-backends, decoupling wave 2b). PURE: requires nothing;
 * registered by its one line in src/browser-backends/index.js. `row` = its capability cells (src/browser-profiles.js
 * PROVIDERS is derived from the list), `words` = its name / chip / blurb as i18n keys the client words through t()
 * off the /providers rows; `newProfileName` = what a New profile… row calls it.
 */
const i18nKey = (s) => s; // extraction marker (scripts/i18n-extract.mjs) — the client words it through t()

module.exports = Object.freeze({
  id: 'local-window',
  // P10 (§7.6 tier 3, D27 (b), D31): WIRED — a window already open on the user's
  // own desktop, addressed through vibespace-window (the AT-SPI tree + its own
  // pixmap), NO CDP, NO process of ours, NO directory of ours; usable only while
  // the consent setting reads true (src/window-desktop.js is the model)
  row: Object.freeze({ tier: 3, wired: true, label: 'A window on your own desktop (tier 3: the accessibility tree + pixels, no CDP)', keyScope: 'none', canSwitchTo: 'no', ownsDir: false, leaseKind: 'window-target', remote: null, starts: false, headed: true, binary: null, cdp: false, allowedDomains: false, pinTab: false, consent: 'window.realDesktopTargets' }),
  words: Object.freeze({ name: i18nKey('a window on your desktop'), chip: i18nKey('desktop window'), blurb: i18nKey("This is a window on your own desktop, not a browser VibeSpace started, so it can't be switched from here."), newProfileName: i18nKey('A window on your desktop') }),
});
