// THE TAB'S NAVIGATION DIARY (lane phone-back-reload, 2026-10-25 — the owner's «按返回按钮是重新加载的» could not be
// reproduced from a description: the document that saw the back press is gone by the time the next one boots). A bounded
// ring in sessionStorage — per tab, and it survives every load inside the tab (a reload, a discarded tab shown again, a
// back onto an older entry) — so a boot can read what the PREVIOUS document of this tab did last, and every incident
// capture carries the story (incident-recorder.js snapshot.navLog). One row: t (ms), d (this document's short random
// id — a change of d between two rows IS a document load), k and a few facts:
//   boot  — type (performance navigation type), step (back-guard.js bootStep), st (vs1 | null | other), len
//           (history.length), ents (entriesShape), disc (document.wasDiscarded), ref (none | same | other), vis,
//           came (navigation.activation: back | forward | other — another site's page or not our entry — | '' no API)
//   pop   — st (the landed entry), v (the verdict), tg (the layer it closed), ex (the exit plan's skip, 0 = none)
//   go1   — the re-arm traversal: ms until the page stood on the sentinel again, or landed 0 + push 1 (the 500 ms belt)
//   leave — skip (history.go(-skip)), load (1 = the tab's first entry: the ONE named load); or why cancelled | input
//           (round 3: the exit's go() was announced and did not end within 3 s — a 204, a stopped load, or only a slow
//           one —, or a tap came while it was pending: the page stays; round 4: its intent kept for a late commit); or
//           slow (ms — round 4: that go() committed after all, this late: the page's pagehide after the stay)
//   rearm — why (cancelled | input): a page that stayed through its go() stands on a sentinel again (round 4)
//   hop   — a document the exit's go() LOADED went on back without booting the app (back-guard.js exitHop): n (the hop),
//           skip, ents; or n + stay 1 + why (cap | input | api | show | cancelled — the page stays and boots: the ONE
//           named load); or n + slow (ms: a stayed hop's go() committed late); or drop 1 (an intent not this load's)
//   hide / show — pagehide / pageshow (p = persisted: the back/forward cache; ek = the entry the page stood on, the
//           browser's own random key cut to 8 — what a later load's navigation.activation names as «from»)
//   stale — the stale-tab step: b (the bundle's version), s (the server's), d2 (reload | notice | quiet | wait)
//   cost  — this load followed a back press inside VibeSpace (back-guard.js backCostLoad), or why slow: an exit that left
//           late (back-guard.js slowExit — round 4): the auto capture's cause
// PRIVACY (the incident recorder's rule): never a URL, a title, a record or typed text — entry shapes, verdicts,
// version numbers.
export const NAV_LOG_KEY = 'vibespace.navLog';
export const NAV_LOG_CAP = 60;
export const DOC_ID = Math.random().toString(36).slice(2, 7);
/** THE EXIT'S INTENT (acceptance round 2 — back-guard.js exitHop): { t, hop, key (the entry the exit left, 8 chars of
 *  the browser's random key), to: 'below' } — its own key, so the diary's ring never drops it. */
export const EXIT_INTENT_KEY = 'vibespace.exitIntent';

/** The diary, oldest first ([] when storage is unreadable). */
export function navLogRead() {
  try { const v = JSON.parse(sessionStorage.getItem(NAV_LOG_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}

/** One row (the time and this document's id added); the ring keeps the last NAV_LOG_CAP. */
export function navNote(row) {
  try {
    const log = navLogRead();
    log.push({ t: Date.now(), d: DOC_ID, ...row });
    sessionStorage.setItem(NAV_LOG_KEY, JSON.stringify(log.slice(-NAV_LOG_CAP)));
  } catch { }
}

export function exitIntentRead() {
  try { const v = JSON.parse(sessionStorage.getItem(EXIT_INTENT_KEY) || 'null'); return v && typeof v === 'object' ? v : null; } catch { return null; }
}
export function exitIntentWrite(intent) { try { sessionStorage.setItem(EXIT_INTENT_KEY, JSON.stringify(intent)); } catch { } }
export function exitIntentClear() { try { sessionStorage.removeItem(EXIT_INTENT_KEY); } catch { } }

/** The PREVIOUS document's last rows (up to n, oldest first): the rows just above this document's own. */
export function prevDocTail(log = [], doc = DOC_ID, n = 3) {
  let i = log.length - 1;
  while (i >= 0 && log[i] && log[i].d === doc) i--;
  if (i < 0 || !log[i]) return [];
  const d = log[i].d, out = [];
  for (; i >= 0 && out.length < n && log[i] && log[i].d === d; i--) out.unshift(log[i]);
  return out;
}

/** navigation.entries() as a shape, no URLs: per entry '*' when current, then S (this document) or x (another), then
 *  o when it is not the app's own page (path ≠ `path`). e.g. 'xS*S' = an older document's entry, the page's, the
 *  sentinel (current). '' without the Navigation API. */
export function entriesShape(entries, current, path) {
  if (!Array.isArray(entries)) return '';
  return entries.map((e, i) => (i === current ? '*' : '') + (e.same ? 'S' : 'x') + (e.path === path ? '' : 'o')).join('');
}
