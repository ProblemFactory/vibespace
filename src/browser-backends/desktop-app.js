'use strict';
/**
 * THE AGENT'S OWN DESKTOP-APP BROWSER (tier 3, the ladder's LOWEST rung) — ONE browser backend, ONE file (lane e2a,
 * docs/design-agent-browser-v2 §E2, B-830d). PURE: requires nothing; registered by its one line in
 * src/browser-backends/index.js, BEFORE `local-window`. A real Chrome (the registry's browser row: chromium → firefox by
 * `execs`) that an agent launches through `vibespace-browser new <label> --backend desktop-app [--url] [--keep-profile]`,
 * on the xpra per-window rung, with its own throwaway profile under data/desktop-apps/<id>/profile (deleted with the app
 * session unless --keep-profile). It is NOT a profile and has NO CDP: the launch hands the opener a WINDOW-TARGET lease
 * (+ `openerGrant`), and from then on it is driven with vibespace-window's verbs. No egress proxy, no domain fence, no
 * CDP judge on this rung — said here (`allowedDomains: false`, `canSwitchTo: 'no'`) and in the manual.
 */
const i18nKey = (s) => s; // extraction marker (scripts/i18n-extract.mjs) — the client words it through t()

module.exports = Object.freeze({
  id: 'desktop-app',
  // E2.1 (owner rulings 2026-09-25 + 2026-10-02): `starts` true (a process of ours, launched by the desktop-app keeper),
  // `ownsDir` true (its profile dir is the app session's), `binary` null (the registry browser row's exec decides),
  // `remote` null (v1: this machine; a paired machine later through desktop-serve)
  row: Object.freeze({ tier: 3, wired: true, label: 'A real desktop browser the agent opens beside its chat (tier 3: the window tools, no CDP, no egress policy)', keyScope: 'none', canSwitchTo: 'no', ownsDir: true, leaseKind: 'window-target', remote: null, starts: true, headed: true, binary: null, cdp: false, allowedDomains: false, pinTab: false, consent: null }),
  words: Object.freeze({ name: i18nKey('a desktop browser the agent opens'), chip: i18nKey('desktop browser'), blurb: i18nKey('A real browser window the agent opened beside its chat and drives through the window tools — no CDP, no egress policy, its own throwaway profile.'), newProfileName: i18nKey('A desktop browser the agent opens') }),
});
