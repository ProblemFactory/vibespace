'use strict';
// WHERE THE OWNER'S TRAY IS, IN WORDS AN AGENT CAN SAY (lane agent-context-owner-facts, B-7960 b — userW 2026-10-20). The
// injected rules, vibespace-ask's answers and the vault's locked line all said «the For you tray at the bottom right»: a
// literal. userW had moved the tray to the top (Customize mode), reads the page in Chinese, and calls the tray by the
// name on it — an agent telling him «bottom right» sounds broken. The memory rule (userW's feedback): name the tray by
// its LABEL and its CURRENT position.
//
// trayWords({ arrangement, lang, phone }) DERIVES the words, never a literal:
//   · the LABEL = what the tray's popup and window are titled in the owner's language — the 'For you' key of the page's
//     own tables (LABELS; test-task-injection pins it to src/lib/i18n-zh.js / -ja.js);
//   · the PLACE = where the For-you element sits under the synced chrome settings (TRAY_SETTING_KEYS): the zone
//     `chrome.arrangement` puts it in (Customize mode; absent = its default zone, the taskbar tray), the taskbar's edge
//     (`taskbar.position`), the tray's end (`chrome.zoneAlign`); hidden when its switch is off or the taskbar is hidden.
//     On a phone the tray is the button in the top bar (the mobile nav), whatever the desktop arrangement says.
//   `lang` / `phone` = the owner's LAST page (it reports them into user-state `ownerPage`: ownerPageDelta).
// PURE: imports nothing — src/server/owner-facts.js reads the settings and user-state and hands them in.

/** = the 'For you' key's words in each table of the page (the popup's title, the window's title). */
const LABELS = Object.freeze({ en: 'For you', zh: '待你处理', ja: 'あなた宛て' });
const LANGS = Object.freeze(Object.keys(LABELS));
/** = src/lib/customize-mode.js CHROME_ELEMENTS' For-you row (its id and defaultZone; test-task-injection pins both). */
const TRAY_ELEMENT = 'taskbar-user-todos';
const TRAY_DEFAULT_ZONE = 'taskbar-tray';
/** The synced settings the place reads — and nothing else. */
const TRAY_SETTING_KEYS = Object.freeze(['chrome.arrangement', 'taskbar.position', 'taskbar.visibility', 'chrome.zoneAlign', 'taskbar.showUserTodos']);

const langOf = (lang) => (LANGS.includes(lang) ? lang : 'en');

/** The zone the For-you element sits in: the first `chrome.arrangement` zone listing it, else its default zone. */
function zoneOfTray(arr) {
  const a = arr && typeof arr === 'object' && !Array.isArray(arr) ? arr : null;
  if (a) for (const [z, ids] of Object.entries(a)) if (Array.isArray(ids) && ids.includes(TRAY_ELEMENT)) return z;
  return TRAY_DEFAULT_ZONE;
}

/** WHERE: 'bottom right' | 'bottom left' | 'top right' | 'top left' | 'top' | 'bottom', or null = not on their screen. */
function trayPlace(arrangement = {}, { phone = false } = {}) {
  const s = arrangement && typeof arrangement === 'object' ? arrangement : {};
  if (s['taskbar.showUserTodos'] === false) return null;
  if (phone) return 'top';
  const zone = zoneOfTray(s['chrome.arrangement']);
  const align = s['chrome.zoneAlign'] && typeof s['chrome.zoneAlign'] === 'object' ? s['chrome.zoneAlign'] : {};
  if (zone.startsWith('taskbar-')) {
    if (s['taskbar.visibility'] === 'hidden') return null;
    const edge = s['taskbar.position'] === 'top' ? 'top' : 'bottom';
    if (zone === 'taskbar-tray') return `${edge} ${align['taskbar-tray'] === 'left' ? 'left' : 'right'}`;
    return edge;   // the taskbar's second row: its edge, the row's end is not a fixed side
  }
  if (zone === 'toolbar-right') return 'top right';
  if (zone === 'toolbar-center') return align['toolbar-center'] === 'right' ? 'top right' : align['toolbar-center'] === 'left' ? 'top left' : 'top';
  return 'top';   // toolbar-row2 — the row under the top bar
}

/** THE words → { label, where, name, phrase }: name = `the “待你处理” (For you) tray` (the English gloss when the page is not
 *  English), phrase = `<name> at the top right` / `<name> at the top of their phone screen` / `<name> (hidden from their
 *  screen now)` — short: it rides every SessionStart, every reminder and the session intro (their byte budgets). */
function trayWords({ arrangement = {}, lang = 'en', phone = false } = {}) {
  const l = langOf(lang);
  const label = LABELS[l];
  const where = trayPlace(arrangement, { phone: !!phone });
  const name = `the “${label}”${l === 'en' ? '' : ` (${LABELS.en})`} tray`;
  const phrase = !where ? `${name} (hidden from their screen now)` : phone ? `${name} at the top of their phone screen` : `${name} at the ${where}`;
  return { label, where, name, phrase, lang: l };
}

/** What a page writes into user-state after it loaded it (merge-only PATCH) — null when user-state already says so:
 *  `ownerPage = { lang, phone }` (the language its i18n resolved, whether it is the phone layout). No record reads as an
 *  English desktop page, so such a page never writes (the words are already right). */
function ownerPageDelta(state, { lang, phone } = {}) {
  const now = { lang: langOf(lang), phone: !!phone };
  const was = state && state.ownerPage && typeof state.ownerPage === 'object' ? state.ownerPage : {};
  return langOf(was.lang) === now.lang && !!was.phone === now.phone ? null : { ownerPage: now };
}

module.exports = { trayWords, trayPlace, ownerPageDelta, LABELS, TRAY_ELEMENT, TRAY_DEFAULT_ZONE, TRAY_SETTING_KEYS };
