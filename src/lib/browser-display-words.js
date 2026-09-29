// THE WORDS a browser's DISPLAY FACT is said with (lane headless-fallback, 2026-09-28 — the dev box sat at the login
// screen after a reboot and every agent browser failed to start because its config asks for a window). One place for
// every surface: the Agent browser panel's rows, the switch dialog, the live view's note and Settings → Agent browser's
// read-only line. The rule and the fact are PURE src/browser-display.js (the keeper records the fact of each LAUNCH on its
// browser record — `display`, broadcast with the digest); the agent's own sentence is the server's (English, never here).
import { t } from './i18n.js';
import { factCode, kindName } from '../browser-display.js';

/** The fact of a profile's CURRENT browser from the profile digest (`browsers[id].display`), or null. */
export function displayFactOf(digest, profileId) {
  const b = digest && digest.browsers && profileId ? digest.browsers[profileId] : null;
  return b && b.display && typeof b.display === 'object' ? b.display : null;
}

/** One sentence for a browser's launch fact — '' when there is nothing to say (a window as asked, or none asked). */
export function displayFactText(fact) {
  const c = factCode(fact);
  if (c === 'hidden-window') return t('This machine has no desktop session — the browser runs in a hidden window (the live view can still take over)');
  if (c === 'headless') return t('This machine has no desktop session — the browser runs headless (the live view can still take over)');
  if (c === 'substituted') return t('The browser settings ask for {wanted}, which this machine does not have right now — it runs on {used} instead', { wanted: kindName(fact.fallback.wanted), used: kindName(fact.fallback.used) });
  if (c === 'recovered') return t('The desktop session is back — the browser runs in a window again');
  return '';
}

/** Settings' read-only line: THIS machine's display right now (GET /api/browser/display → `{display, mode}`), what a
 *  browser asking for a window does with it (the no-display rung the setting and Xvfb pick), and whether Xvfb is installed. */
export function machineDisplayText(answer) {
  if (!answer || answer.error) return t("Could not check this machine's display: {reason}", { reason: (answer && answer.error) || t('server unreachable') });
  const d = answer.display;
  if (!d || typeof d !== 'object') return t("Could not check this machine's display: {reason}", { reason: t('no answer') });
  const xv = d.xvfb === true ? t('Xvfb: installed') : d.xvfb === false ? t('Xvfb: not installed') : '';
  let main;
  if (d.kind === 'wayland') main = t('This machine has a Wayland desktop session ({name}) — a browser that asks for a window shows one', { name: String(d.name || '') });
  else if (d.kind === 'x11') main = t('This machine has an X11 display ({name}) — a browser that asks for a window shows one', { name: String(d.name || '') });
  else if (d.xvfb === true && answer.mode !== 'headless') main = t('This machine has no desktop session now — a browser that asks for a window runs in a hidden window (the live view can still take over)');
  else main = t('This machine has no desktop session now — a browser that asks for a window runs headless (the live view can still take over)');
  return xv ? `${main} · ${xv}` : main;
}
