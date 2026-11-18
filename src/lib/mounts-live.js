// THE REMOTE PANEL UNDER A BURST (B-a31a: «the Remote panel refreshes wildly and
// sometimes says failed to load»). Three small pieces the panel (src/lib/sidebar-mounts.js) is built from, testable without
// a page (scripts/test-exit-runs-dialog.mjs):
//   coalesce(fn, ms)       — however many calls arrive, fn runs ONCE per window (a burst paints a few times a second)
//   singleFlight(fn)       — ONE run in flight and ONE trailing; never two overlapping redraws
//   patchLastRunRow(row, line) — a machine row's last-run line patched IN PLACE (its words; the node kept, so a focus or a
//                            press on it survives; every other node of the row kept as it is)
//   rowsByHost(listEl)     — the panel's machine rows by their key (`row._hostId`, set by the row builder)
//   noteLastRun(hosts, id, lastRun) — the page's cached hosts list takes a pushed last run
//   overlayLastRuns(hosts, seen)    — a fetched list that is OLDER than a pushed last run (a refresh in flight when the run
//                            landed) keeps the pushed one: the newer `at` wins; entries the list caught up with leave `seen`
//   rerenderVerdict(state)  — what a SIDEBAR re-render does to the panel: a healthy panel is KEPT (no storm), a panel saying
//                            «the server is slow» is not healthy (ONE coalesced refresh), no panel yet is painted
/** fn runs once per `ms` window, however many calls arrive in it. */
export function coalesce(fn, ms, { setTimer = setTimeout } = {}) {
  let pending = false;
  return () => { if (pending) return; pending = true; setTimer(() => { pending = false; fn(); }, ms); };
}
/** ONE run in flight; calls while it runs fold into ONE trailing run, which their promise waits for. The first run starts
 *  synchronously (as a plain call would). → a promise of the run that will show the caller's change. */
export function singleFlight(fn) {
  let cur = null, next = null;
  const again = () => { next = null; return run(); };
  const run = () => {
    if (cur) return next || (next = cur.then(again, again));
    let p;
    try { p = Promise.resolve(fn()); } catch (e) { p = Promise.reject(e); }
    const me = p.finally(() => { if (cur === me) cur = null; });
    cur = me;
    return me;
  };
  return run;
}
const hasClass = (el, c) => !!el && typeof el.className === 'string' && el.className.split(/\s+/).includes(c);
/** Patch a machine row's last-run line (`.mounts-exit-last`, a direct child) to `line`: the same node takes its words
 *  (never replaced — a focus or a press on it survives a paint), inserted after the row's exit summary when the row had
 *  none, removed when `line` is null. Every other child stays the same node. → what it did. */
export function patchLastRunRow(row, line) {
  const kids = row && row.children ? [...row.children] : [];
  const old = kids.find((k) => hasClass(k, 'mounts-exit-last'));
  if (old && line) { if (old.textContent !== line.textContent) old.textContent = line.textContent; return 'updated'; }
  if (old) { old.remove(); return 'removed'; }
  if (!line) return 'none';
  const sum = kids.find((k) => hasClass(k, 'mounts-exit-line'));
  if (sum) sum.after(line); else row.appendChild(line);
  return 'inserted';
}
/** The panel's machine rows by their key (`row._hostId`). → Map hostId → row */
export function rowsByHost(listEl) {
  const m = new Map();
  for (const r of listEl && listEl.querySelectorAll ? listEl.querySelectorAll('.mounts-row') : []) if (r && r._hostId) m.set(r._hostId, r);
  return m;
}
const atOf = (lr) => (lr && Number(lr.at)) || 0;
/** The page's cached hosts list takes a pushed last run (`h.exit.lastRun`). → the host, or null when the list lacks it */
export function noteLastRun(hosts, hostId, lastRun) {
  const h = Array.isArray(hosts) ? hosts.find((x) => x && x.id === hostId) : null;
  if (!h) return null;
  if (!h.exit || typeof h.exit !== 'object') h.exit = {};
  h.exit.lastRun = lastRun || null;
  return h;
}
/** A fetched hosts list keeps every pushed last run that is NEWER than its own (by `at`); a pushed run the list has caught
 *  up with (same or newer `at` there) leaves `seen`. → the ids it kept from `seen` */
export function overlayLastRuns(hosts, seen) {
  const kept = [];
  if (!seen || typeof seen.forEach !== 'function') return kept;
  for (const [id, lr] of [...seen]) {
    const h = Array.isArray(hosts) ? hosts.find((x) => x && x.id === id) : null;
    const listed = h && h.exit && typeof h.exit === 'object' ? h.exit.lastRun : null;
    if (h && lr && atOf(lr) > atOf(listed)) { noteLastRun(hosts, id, lr); kept.push(id); } else seen.delete(id);
  }
  return kept;
}
/** What a sidebar re-render does to the Remote panel (B-a31a cure, the verdict of 07:52Z): another tab ⇒ 'other'; no panel
 *  showing ⇒ 'paint' (the first paint, a tab change); a panel showing the slow note is NOT healthy ⇒ 'refresh' (one coalesced,
 *  single-flight refresh — the note leaves when it lands); a healthy panel ⇒ 'keep' (nothing: the storm stays cured). */
export function rerenderVerdict({ tab, shown, slow } = {}) {
  if (tab !== 'mounts') return 'other';
  if (!shown) return 'paint';
  return slow ? 'refresh' : 'keep';
}
