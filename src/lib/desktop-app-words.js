// DESKTOP-APP WORDS (lane app-launch-singleton, fleet inc-mv7hxc2n-2cvr, .268) — WHERE an app runs and WHO started it, and a
// launch that ended as it started, in ONE spelling for every surface that says them: the Apps card and its Running list
// (desktop-app-launcher.js), the Desktop button's "Running apps" (desktop-picker.js) and the app's window
// (desktop-app-window.js). A leaf: it imports the dictionary only (the picker is bundled alone by test-installed-apps).
import { t } from './i18n.js';

/** "Running on :2 · started by agent session X" — the record's display (a paired machine's name before it) and its
 *  `launchedBy` (the keeper's fact: an agent session by name, an agent, the person); "Launching…" before a display exists. */
export function runningWhereText(rec) {
  if (!rec) return '';
  const remote = rec.hostId && rec.hostId !== 'local' && rec.hostLabel ? String(rec.hostLabel) : '';
  const at = [remote, rec.display || ''].filter(Boolean).join(' ');
  if (!at) return t('Launching…');
  const b = rec.launchedBy;
  if (b && b.kind === 'agent') return b.name ? t('Running on {display} · started by agent session {name}', { display: at, name: b.name }) : t('Running on {display} · started by an agent', { display: at });
  if (b && b.kind === 'person') return t('Running on {display} · started by you', { display: at });
  return t('Running on {display}', { display: at });
}
/** The quick exit's ONE sentence (`rec.quickExit`, the keeper's fact) — '' when the record has none. */
export function quickExitText(rec, name = '') {
  const q = rec && rec.quickExit;
  if (!q) return '';
  const app = name || rec.appTitle || rec.label || t('Desktop app');
  return t('{app} exited right after it started ({code}) — usually the same program is already running on another display', { app, code: q.signal ? String(q.signal) : `code ${q.code}` });
}
