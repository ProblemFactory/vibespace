// THE WORDS a browser's DISPLAY FACT is said with (lane headless-fallback, 2026-09-28 — the dev box sat at the login
// screen after a reboot and every agent browser failed to start because its config asks for a window). One place for
// every surface: the Agent browser panel's rows, the switch dialog, the live view's note and Settings → Agent browser's
// read-only line. The rule and the fact are PURE src/browser-display.js (the keeper records the fact of each LAUNCH on its
// browser record — `display`, broadcast with the digest); the agent's own sentence is the server's (English, never here).
import { t } from './i18n.js';
import { factCode, kindName, NO_DESKTOP_WINDOW_DEFAULT } from '../browser-display.js';

/** B-346d law 1 (the coordinator's r803): a stopped browser's view says WHY it stopped, from the keeper's record (`ended`, carried
 *  with browser_stopped): its own idle timeout after N minutes with no command, or ended on its own BEFORE it (found gone within N s
 *  of a command it served — a bound, never when it ended; why is not known here); anything else keeps the plain sentence. */
export function stoppedText(ended) {
  const tail = t("the agent's next browser command starts it again, and this view reconnects then");
  const e = ended && typeof ended === 'object' ? ended : null;
  if (!e || e.by !== 'idle') return t('Stopped — {tail}', { tail });
  const min = Number.isFinite(Number(e.idleMs)) && Number(e.idleMs) > 0 ? Math.max(1, Math.round(Number(e.idleMs) / 60000)) : null;
  if (e.early && Number.isFinite(Number(e.early.withinMs))) {
    const sec = Math.max(1, Math.round(Number(e.early.withinMs) / 1000));
    return min ? t('Ended on its own — found gone within {sec} s of a command it served, before its {min} min idle timeout; why is not known here. {tail}', { sec, min, tail }) : t('Ended on its own — found gone within {sec} s of a command it served; why is not known here. {tail}', { sec, tail });
  }
  return min ? t('Stopped on its own after {min} min with no command (its idle timeout) — {tail}', { min, tail }) : t('Stopped on its own (its idle timeout) — {tail}', { tail });
}

/** The fact of a profile's CURRENT browser from the profile digest (`browsers[id].display`), or null. */
export function displayFactOf(digest, profileId) {
  const b = digest && digest.browsers && profileId ? digest.browsers[profileId] : null;
  return b && b.display && typeof b.display === 'object' ? b.display : null;
}

/** B-346d (the coordinator's r1228): the QUIET MARK on the live view's bar for a fact a person needs once a browser run — the
 *  browser runs out of sight (a hidden window, or headless): a word and its tip (the full sentence), a state, never a door.
 *  null for every other fact (a substituted kind keeps its line). */
export function displayMarkOf(fact) {
  const c = factCode(fact);
  if (c === 'hidden-window') return { word: t('Hidden window'), tip: displayFactText(fact) };
  if (c === 'headless') return { word: t('No window'), tip: displayFactText(fact) };
  return null;
}

/** B-346d (r1228): how long the out-of-sight line is said, once a browser run, before the bar's mark alone says it. */
const DISPLAY_SAY_MS = 20000;
/** B-346d (r1228; PURE since r1505): is a browser run's out-of-sight line said NOW — once a run, for `sayMs` from the first time a
 *  view showed that run. `firstAt` = when the view first showed it (null/undefined: this is the first showing). Returns
 *  { first, at, say, leftMs }: `at` = the first showing's time (the caller keeps it), `leftMs` = until the line ends (the caller's
 *  one re-render). A first showing dated after now (the clock went back) still says the line, never longer than `sayMs`. */
export function runLineVerdict(firstAt, now, sayMs = DISPLAY_SAY_MS) {
  const first = !Number.isFinite(firstAt), at = first ? now : firstAt;
  const left = Math.min(sayMs, sayMs - (now - at));
  return { first, at, say: left > 0, leftMs: Math.max(0, left) };
}

/** B-bcf8 (r4256): the live view's display line while the tab it SHOWS draws nothing — by the keeper's code for that tab (the
 *  record's `paint`: codes and target ids only, src/server/browser-keeper.js paintOf). '' for no code, another tab's code, or a code
 *  it does not know (front_unread is never one: that browser draws). Said while the code stands; gone when it clears.
 *  r4297 (the round's must): the third line names a door that WORKS from where the person stands — `canFront` is the shown tab's
 *  chip's own verdict (the live view asks clickOf, the same answer that makes the chip a button): it can bring the tab forward ⇒
 *  «Click its tab above»; the person only watches ⇒ «Take over, then click its tab above» (the two steps that exist); the person
 *  drives and the chip still cannot (a mediated browser's tabs) ⇒ the fact alone, no door named. No new power. */
export function paintLineOf(record, targetId, { canFront = false, driving = false } = {}) {
  const id = String(targetId || '').toUpperCase(); const p = record && record.paint && typeof record.paint === 'object' ? record.paint : null;
  const c = id && p && Object.prototype.hasOwnProperty.call(p, id) ? p[id] : null;
  if (c === 'thaw-unread') return t('This page is not drawing: it did not answer when it was woken. VibeSpace keeps asking while you watch.');
  if (c === 'show-owed') return t('This page has not come back to the front yet. VibeSpace tries again shortly.');
  if (c === 'show-left') return canFront ? t('VibeSpace could not bring this page back to the front. Click its tab above to bring it forward.') : driving ? t('VibeSpace could not bring this page back to the front.') : t('VibeSpace could not bring this page back to the front. Take over, then click its tab above to bring it forward.');
  return '';
}
/** One sentence for a browser's launch fact — '' when there is nothing to say (a window as asked, or none asked). */
export function displayFactText(fact) {
  const c = factCode(fact);
  // B-d635: beside VibeSpace's own VNC desktop the words say where the browser is NOT — never "no desktop session"
  const vnc = fact && fact.vnc && fact.vnc.name ? String(fact.vnc.name) : '';
  if (vnc && c === 'hidden-window') return t('The browser runs in a hidden window, not on this machine’s VNC desktop ({name}) — watch it and take over in the live view', { name: vnc });
  if (vnc && c === 'headless') return t('The browser runs headless, not on this machine’s VNC desktop ({name}) — watch it and take over in the live view', { name: vnc });
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
  else if (d.vnc && d.vnc.name) main = d.xvfb === true && answer.mode !== 'headless' ? t('Agent browsers do not use this machine’s VNC desktop ({name}) — a browser that asks for a window runs in a hidden window (the live view can still take over)', { name: String(d.vnc.name) }) : t('Agent browsers do not use this machine’s VNC desktop ({name}) — a browser that asks for a window runs headless (the live view can still take over)', { name: String(d.vnc.name) }); // B-d635
  // lane hooks-create H5: an UNSET preference asks for that window here (no desktop + Xvfb + auto) — said as the rule's result
  else if (NO_DESKTOP_WINDOW_DEFAULT && d.xvfb === true && answer.mode !== 'headless' && (answer.preference === null || answer.preference === undefined)) main = /* H5's line — said only while its switch is on (OFF in 2.369.200) */ t("This machine has no desktop session now — with the window setting unset, an agent's browser runs in a hidden window (the live view can still take over)");
  else if (d.xvfb === true && answer.mode !== 'headless' && answer.preference !== false) main = t('This machine has no desktop session now — a browser that asks for a window runs in a hidden window (the live view can still take over)');
  else if (answer.preference === false) main = t("This machine has no desktop session now — the window setting says Headless, so an agent's browser runs headless");
  else main = t('This machine has no desktop session now — a browser that asks for a window runs headless (the live view can still take over)');
  return xv ? `${main} · ${xv}` : main;
}
