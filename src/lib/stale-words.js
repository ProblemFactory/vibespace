// stale-words.js — B-5278 unit 2 (the coordinator's r951, THE LAW of item 4): A MACHINE THAT REPLIED IS NEVER CALLED UNREACHABLE,
// anywhere a list of it is drawn. ONE door for the words of an old list: the stale chip's tip (session-card.js) and the remote
// zone's full-width row (sidebar-workbench.js), both of its branches — a list the hub served old (a row's `staleWhy`) and no list
// at all (the hub's error `code`, the page then showing its own cached one). The reason is the device's own reply when it gave
// one: its walk ran out of time (discovery-slow / -timeout), or its list could not be read for another reason (too much output,
// a child that failed or did not start); no reason ⇒ the machine did not answer: unreachable. PURE: the caller hands `tr` in.
const TIME = new Set(['discovery-slow', 'discovery-timeout']);
const READ = new Set(['discovery-too-large', 'discovery-child-failed', 'discovery-child-unstarted']);
// the hub's own list kept on disk, served at once after its restart while the machine is read again (hosts.js, 2.320.0)
const AGAIN = 'discovery-rescan';
export const answered = (why) => TIME.has(why) || READ.has(why);
/** the stale chip's tip, by its row's reason */
export function staleTip(why, tr) {
  if (TIME.has(why)) return tr('This machine\'s list could not be read in time — showing its last list, so this session may have changed or ended since.');
  if (READ.has(why)) return tr('This machine\'s list could not be read — showing its last list, so this session may have changed or ended since.');
  if (why === AGAIN) return tr('This machine\'s list is being read again — showing its last list, so this session may have changed or ended since.');
  return tr('This machine was unreachable — showing the last successful scan, so this session may have changed or ended since.');
}
/** the zone's row over a list the hub served OLD (its rows' reason) */
export function staleZoneText(why, host, tr) {
  if (TIME.has(why)) return tr('Last known list — {host}\'s list could not be read in time.', { host });
  if (READ.has(why)) return tr('Last known list — {host}\'s list could not be read.', { host });
  if (why === AGAIN) return tr('Last known list — {host}\'s list is being read again.', { host });
  return tr('Last known scan — {host} was unreachable.', { host });
}
/** the zone's row when the hub answered NO list (its error's code) and the page shows its own cached one; and that row's chip */
export function errorZoneText(code, host, tr) {
  if (TIME.has(code)) return tr('Showing cached results — {host}\'s list could not be read in time.', { host });
  if (READ.has(code)) return tr('Showing cached results — {host}\'s list could not be read.', { host });
  return tr('Showing cached results — {host} is unreachable.', { host });
}
export function errorChipText(code, ago, tr) {
  if (ago) return tr('as of {ago}', { ago });
  return answered(code) ? tr('not read') : tr('unreachable');
}
