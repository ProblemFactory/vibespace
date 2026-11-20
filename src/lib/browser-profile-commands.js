// B-acb9 — A PLUGIN'S WINDOW OPENS A BROWSER PROFILE'S OWN «Proxy…» AND «Check the exit…» (the owner asked in the custom kernel's
// Studio window whether a proxy can be set there, 2026-11-19). TWO CORE COMMANDS of the Ph1 registry — never a second form: each
// opens the very dialog the profile card opens (src/lib/browser-proxy-dialog.js, src/lib/browser-exit-dialog.js) on the profile's
// own row, and the caller learns ONE word — onDone('done' | 'cancelled') — never a value: the proxy's login goes dialog → the vault,
// the exit dialog → the keeper. THE PRESS THE LAW NAMES IS THE DIALOG's OWN SAVE: the opening itself cannot be fenced against a
// trusted plugin (it holds api.app and may open whatever the page may), so nothing changes until the person saves in the dialog,
// and the save routes refuse every bearer. A second open of the same profile raises the live form; the word is that form's. The
// panels redraw on the keeper's `browser-profiles-updated` broadcast (src/server/browser-keeper.js, after every committed change).
// A trusted module runs them with api.runCommand('browser.profileProxy', { profileId, onDone }) (docs/plugins.md).
// No DOM here: the dialogs, the row read and the toast are handed in (src/lib/browser-trace-view.js wires the real ones).
import { registerCommand } from './contributions.js';

export const PROFILE_DIALOG_COMMANDS = Object.freeze(['browser.profileProxy', 'browser.profileExitCheck']);
const PROFILE_ID_RE = /^bp-[0-9a-f]{8}$/;   // the profiles routes' own id shape (src/routes/browser.js ID_RE)

/** The run of ONE profile dialog command. `open(app, row, { onClose })` is the dialog; its onClose says 'done' after a save.
 *  `rowOf(id)` → the profile's row as the profiles panel has it, or null; it THROWS when the list could not be read (`noReply()`
 *  says so — never «missing»); `notFound(id)` says a profile is not here (the id cut to 40 characters). */
export function profileDialogRun(open, { rowOf, notFound, noReply = () => { }, appOf = () => globalThis.app || null } = {}) {
  return async (c = {}) => {
    let told = false;
    const tell = (word) => { if (told) return; told = true; try { if (typeof c.onDone === 'function') c.onDone(word === 'done' ? 'done' : 'cancelled'); } catch { /* the caller's own */ } };
    const id = String((c && c.profileId) || '');
    let row = null;
    if (PROFILE_ID_RE.test(id)) {
      try { row = await rowOf(id); } catch { try { noReply(); } catch { /* said or not */ } tell('cancelled'); return false; }   // the server did not answer: never «missing»
    }
    if (!row || row.id !== id) { try { notFound(id.length > 40 ? id.slice(0, 40) + '…' : id); } catch { /* said or not, the caller hears cancelled */ } tell('cancelled'); return false; }
    open((c && c.app) || appOf(), row, { onClose: (how) => tell(how) });
    return true;
  };
}

/** Registers the two commands (once, at the profiles panel's import). → their disposers. */
export function registerBrowserProfileCommands({ openProxy, openExit, rowOf, notFound, noReply, titles = {}, appOf } = {}) {   // titles: { proxy(), exit() } — the page's words (t()), required
  if (typeof titles.proxy !== 'function' || typeof titles.exit !== 'function') throw new Error('registerBrowserProfileCommands: titles.proxy and titles.exit (the page\'s words) are required');
  const when = (c) => !!(c && c.profileId);   // only with a profile: never offered bare in a palette
  return [
    registerCommand({ id: 'browser.profileProxy', title: () => titles.proxy(), when, run: profileDialogRun(openProxy, { rowOf, notFound, noReply, appOf }) }),
    registerCommand({ id: 'browser.profileExitCheck', title: () => titles.exit(), when, run: profileDialogRun(openExit, { rowOf, notFound, noReply, appOf }) }),
  ];
}
