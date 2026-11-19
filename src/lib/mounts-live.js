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
//   noteAskOnce(note)       — that refresh is asked ONCE per note (the law), however many re-renders follow
//   slowNote(panel, opts)   — the note itself: made once with ONE bounded self-retry timer; met again it only says its words
//   patchHostFace(top, prev, next, makers) — a machine row's STATUS face (the dot, its words, the tools badge, the state chip)
//                            patched IN PLACE: a probe whose answer equals what the row shows touches NO node; a changed answer
//                            changes the dot and its words only (every other node of the row kept)
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
/** A re-render asks a slow note's refresh ONCE per failure (B-a31a cure 2; once per FAILURE since 09:20Z: slowNote re-arms it
 *  when a refresh fails again), however many digest changes follow. */
export function noteAskOnce(note) {
  if (!note || note._asked) return false;
  note._asked = true;
  return true;
}
const kid = (el, c) => (el && el.children ? [...el.children].find((k) => hasClass(k, c)) : null);
/** The slow note on `panel`: made ONCE — its words, its Retry, and ONE bounded self-retry timer (`retryMs`); met again (a refresh
 *  that failed again) it says its words again and enables Retry — never a second timer, never a loop. → { box, made } | null */
export function slowNote(panel, { words, retry, retrying, onRetry, onSelfRetry, setTimer = setTimeout, retryMs = 15000 } = {}) {
  if (!panel) return null;
  const had = kid(panel, 'mounts-slow');
  if (had) {
    had._asked = false;   // ONCE PER FAILURE (主开发 09:20Z): a failure said again re-arms the re-render's one ask (noteAskOnce) — the hub's recovery edge then asks again; the 15-s self-retry stays once per note
    const w = kid(had, 'mounts-slow-words'), b = kid(had, 'mounts-slow-retry');
    if (w) w.textContent = words;
    if (b) b.disabled = false;
    return { box: had, made: false };
  }
  const box = document.createElement('div');
  box.className = 'mounts-slow';
  box.setAttribute('role', 'status');
  const w = document.createElement('span');
  w.className = 'mounts-slow-words';
  w.textContent = words;
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'btn-cancel mounts-slow-retry'; b.textContent = retry;
  // the note stays, saying it retries, until that refresh's answer: a new list replaces the panel (and the note), a slow one says so again
  b.onclick = () => { w.textContent = retrying; b.disabled = true; if (onRetry) onRetry(); };
  box.append(w, ' ', b);
  panel.prepend(box);
  setTimer(() => { if (box.isConnected && onSelfRetry) onSelfRetry(); }, retryMs);
  return { box, made: true };
}
const faceKey = (f) => (f ? JSON.stringify([f.dot, f.dotTip, f.badge || '', f.chip ? [f.chip.kind, f.chip.text, f.chip.title] : null, f.errline ? [f.errline.text, f.errline.title] : null]) : '');
/** Two status faces show the same thing. */
export function hostFaceSame(a, b) { return !!a && !!b && faceKey(a) === faceKey(b); }
/** Patch a machine row's status face IN PLACE (`row` = the .mounts-row; its .mounts-host-top holds the dot, the badge and the
 *  chip): an equal face ⇒ 'same' and no node touched; else the dot's class and words, the tools badge (replaced only when its
 *  words changed), the state chip (added / replaced / removed) and the row's failure line (its words in place, added /
 *  removed) — every other node of the row stays the same node. `chipOf(chip)` / `badgeOf(html)` make the new nodes; with
 *  `errOf(errline)` the failure line is the builder's need line and its fold, each replaced whole when the words change. */
export function patchHostFace(row, prev, next, { chipOf, badgeOf, errOf } = {}) {
  const top = kid(row, 'mounts-host-top');
  if (!top || !next) return 'none';
  if (hostFaceSame(prev, next)) return 'same';
  const dot = kid(top, 'mounts-dot');
  if (dot) {
    const cls = 'mounts-dot mounts-dot-' + next.dot;
    if (dot.className !== cls) dot.className = cls;
    if (dot.getAttribute('title') !== next.dotTip) dot.setAttribute('title', next.dotTip);
  }
  if ((prev && prev.badge || '') !== (next.badge || '')) {
    const old = kid(top, 'mounts-badge'), name = kid(top, 'mounts-name');
    const nb = next.badge && badgeOf ? badgeOf(next.badge) : null;
    if (old && nb) old.replaceWith(nb); else if (old) old.remove(); else if (nb && name) name.after(nb);
  }
  const oldChip = kid(top, 'host-state-chip');
  const chip = next.chip && chipOf ? chipOf(next.chip) : null;
  if (oldChip && chip) oldChip.replaceWith(chip);
  else if (oldChip) oldChip.remove();
  else if (chip) { const acts = kid(top, 'mounts-row-actions'); if (acts) top.insertBefore(chip, acts); else top.appendChild(chip); }
  const oldErr = kid(row, 'mounts-errline');
  if (errOf) {
    // lane ui-needs-a-button MEETS B-a31a (the restack for 2.369.412, 主开发 20:03Z, ruling (a)): the failure line is the NEED LINE —
    // its words and its doors — with its Details fold, drawn by the builder (`errOf(errline)` → [line, fold]). Each is replaced WHOLE,
    // in its own place (a key answer between them stays), only when the words or the title change — never written in place (a text
    // write would take the doors); the same words build nothing and touch nothing
    const pe = prev && prev.errline, ne = next.errline;
    if (!(ne && oldErr && pe && pe.text === ne.text && pe.title === ne.title)) {
      const oldMore = kid(row, 'mounts-errline-details');
      const [nErr = null, nMore = null] = ne ? [].concat(errOf(ne)) : [];
      if (oldErr && nErr) oldErr.replaceWith(nErr); else if (oldErr) oldErr.remove(); else if (nErr) row.appendChild(nErr);
      if (oldMore && nMore) oldMore.replaceWith(nMore); else if (oldMore) oldMore.remove(); else if (nMore) row.appendChild(nMore);
    }
  } else if (next.errline) {
    const e = oldErr || document.createElement('div');
    if (!oldErr) { e.className = 'mounts-errline'; row.appendChild(e); }
    if (e.textContent !== next.errline.text) e.textContent = next.errline.text;
    if (e.getAttribute('title') !== next.errline.title) e.setAttribute('title', next.errline.title);
  } else if (oldErr) oldErr.remove();
  return 'patched';
}
