// THE AGENT BROWSER PANEL'S ROW MODEL (design 015 §2 A + §2b, lane browser-panel-tidy — the owner, 2026-10-03:
// 「这个界面UI也优化一下吧 目前有点乱」, then 「…每个信息横向都不对齐。应该思考下哪些信息可以展示的时候truncate，哪些可能很长需要单独一行」).
// PURE — imports nothing, touches no DOM (node-imported by scripts/test-browser-panel-model.mjs). The view
// (src/lib/browser-trace-view.js) passes the row, the facts it reads from the digest and the words it owns (`x`), and
// draws what this answers: ONE grid of five columns (every row a subgrid of it, so a cell's left edge is the table's
// track), every cell TWO lines — `l1` the one-glance fact, `l2` the secondary, always present so rows keep one rhythm —
// a per-row fold for everything else, ONE primary act and ONE ⋯ menu. No act is ever disabled: an act that cannot run
// is ABSENT and the fold (or the state's second line) says why.
//
// x = { w: { t, state, why, ago, bytes, size, memory, display, human } — the view's word functions;
//       chip (the browser chip's words), mine (this machine's name), stuck (stuckWords(…) or null), autoDialogs (bool),
//       autoText (its sentence), buildLine (cardBuildLine's {text, warn} or null), limits (the housekeeping view's), now,
//       unresponsive (browser-stuck's unresponsiveWords(…) for a row whose `r.unresponsive` stands, or null) }

/** The grid's four sized tracks (px minimums: profile, state, who, size) + the column gap; the fifth track (the acts)
 *  is `max-content` — the widest row's buttons, shared by every row. public/style.css's `.bprof-table` template says
 *  the same numbers (pinned by the model suite). Below `gridNeed(acts)` the panel re-flows its rows (`bprof-stacked`). */
export const GRID = Object.freeze({ mins: Object.freeze([140, 100, 170, 120]), gap: 10 });
export function gridNeed(actsPx) { return GRID.mins.reduce((s, n) => s + n, 0) + Math.max(0, Number(actsPx) || 0) + GRID.gap * GRID.mins.length; }

/** Every act a profile row offers, once: the primary, the ⋯ menu's items, the who cell's Change… (the ACT CENSUS). */
export const ROW_ACTS = Object.freeze(['browse', 'record', 'record-mine', 'replay', 'build', 'rename', 'stop', 'restart', 'restart-hold', 'delete', 'who']);

const T = (x) => (x && x.w && typeof x.w.t === 'function' ? x.w.t : (s) => s);
const W = (x, k, d) => (x && x.w && typeof x.w[k] === 'function' ? x.w[k] : d);
const notOurs = (r) => r.state === 'not-ours';
const ours = (r) => !notOurs(r) && !r.host;
const canBrowse = (r) => !!r.canBrowse && !notOurs(r);
const label = (r) => String(r.label || r.id || '');
/** lane browser-unresponsive: a live browser of THIS computer judged hung — its state word and its ONE primary (Restart). */
const hung = (r, x) => !!(r && r.unresponsive && r.live && !r.host && x && x.unresponsive);

/** The name cell's l2 chips, in order: the browser (whole, never folds), then the machine · legacy · separate tabs ·
 *  renamed-from — those fold from the end into "+n" when the column is narrow (the view measures). */
export function nameChips(r, x = {}) {
  const t = T(x), out = [];
  out.push({ key: 'browser', text: String(x.chip || r.provider || ''), fixed: true, cls: 'browser-chip' });
  if (r.host) out.push({ key: 'host', text: String(r.host), title: t('The machine this profile\'s browser last started on') });
  const rf = r.renamedFrom && typeof r.renamedFrom === 'object' && r.renamedFrom.host ? r.renamedFrom : null;
  const mine = String(x.mine || '');
  if (!rf && r.launchHost && mine && String(r.launchHost) !== mine) out.push({ key: 'launch-host', text: String(r.launchHost), title: t('The machine this profile\'s browser last started on') });
  if (r.legacy) out.push({ key: 'legacy', text: t('legacy') });
  if (r.mediated) out.push({ key: 'mediated', text: t('separate tabs'), title: t('Each conversation sees and drives only its own tabs through a mediated CDP endpoint; while you drive, its input and navigation are refused.') });
  if (rf) out.push({ key: 'renamed', text: t('renamed from {host}', { host: String(rf.host) }), title: t('This machine was renamed (a pod restarted under a new name) — the lock its previous name {from} left on this profile was taken over; its browser runs here as {host}.', { from: String(rf.host), host: mine || String(r.launchHost || '') }) });
  return out.filter((c) => c.text);
}

/** The state's sentences by priority: stuck (warn) > unavailable (warn) > leave-page dialogs accepted (warn) > the
 *  row's own why (last used, who uses it). The first is the cell's l2; the fold lists them all. */
export function stateLines(r, x = {}) {
  const why = String(W(x, 'why', () => '')(r) || '');
  const out = [];
  if (hung(r, x)) out.push({ key: 'unresponsive', text: String(x.unresponsive.tooltip || x.unresponsive.state), tone: 'warn' });
  if (x.stuck && x.stuck.line) out.push({ key: 'stuck', text: String(x.stuck.line), tone: x.stuck.tone === 'info' ? 'info' : 'warn' }); // lane browser-held-not-hung: a blind watch is info
  if (r.browserClosed && why) out.push({ key: 'closed', text: why, tone: 'warn' });
  if (x.autoDialogs && x.autoText) out.push({ key: 'auto-dialogs', text: String(x.autoText), tone: 'warn' });
  if (!r.browserClosed && why) out.push({ key: 'why', text: why, tone: '' });
  return out;
}

/** The usage cell: l1 the size on disk (never cut), l2 the counts (cut at the cell's end; "recording" in red). */
export function usageLine(r, x = {}) {
  const t = T(x), bytes = W(x, 'bytes', (n) => String(n));
  const tr = r.trace || { n: 0 };
  const recs = Array.isArray(r.recordings) ? r.recordings : [];
  const l2 = [{ key: 'actions', text: tr.n ? t('{n} action(s)', { n: tr.n }) : t('no actions') }];
  if (recs.length) l2.push({ key: 'recordings', text: t('{n} recording(s)', { n: recs.length }) });
  if (r.recording) l2.push({ key: 'recording', text: t('recording'), tone: 'rec' });
  if (r.recordingRefused) l2.push({ key: 'refused', text: t('refused: {why}', { why: String(r.recordingRefused.error || r.recordingRefused.code || '') }), tone: 'warn' });
  return { l1: r.bytes === null || r.bytes === undefined ? t('not measured') : bytes(r.bytes), l2 };
}

/** The ONE visible act: Browse yourself / Open your browsing window — ABSENT (never greyed) for a paired machine's
 *  profile, a browser VibeSpace only connects to, or a folder it does not keep. */
export function rowPrimary(r, x = {}) {
  // lane browser-unresponsive: a browser that stopped answering has ONE way out — Restart is the primary, Browse is not offered
  if (hung(r, x)) return { id: 'restart', open: false, warn: true, label: String(x.unresponsive.action), title: String(x.unresponsive.tooltip || '') };
  if (!canBrowse(r)) return null;
  const t = T(x), open = !!r.human;
  return { id: 'browse', open, label: open ? t('Open your browsing window') : t('Browse yourself'), title: open ? t('Your own tab in this browser — its window') : t('Open this profile\'s browser and browse it yourself — its logins are there; conversations using it keep working in their own tabs') };
}

/** The ⋯ menu, in order: the two record switches (check rows), Replay…, Change build…, Rename…, the live-only Stop /
 *  Restart / Restart to hold dialogs, then — after a separator — Delete… in the warn colour. Only the acts that can run. */
export function rowMenu(r, x = {}) {
  const t = T(x), out = [];
  if (ours(r)) out.push({ id: 'record', label: t('Record the screen'), check: !!r.record, title: t('Record this profile\'s screen (30 fps WebM, needs agent-browser ≥ {floor}) whenever its browser is live — a video of a logged-in profile is a secret with a storage bill', { floor: String((x.limits && x.limits.recordingFloor) || '0.37.0') }) });
  if (canBrowse(r)) out.push({ id: 'record-mine', label: t('Also record my own actions'), check: r.recordMine !== false, title: t('When you browse this profile yourself, record what you do like an agent\'s actions (before / after frames; typed text is kept as a length only) — off keeps only when you started and stopped') });
  if (r.trace && r.trace.n) out.push({ id: 'replay', label: t('Replay…'), title: t('Every browser session on this profile, action by action') });
  if (r.buildChoice && !notOurs(r)) out.push({ id: 'build', label: t('Change build…'), title: t('Choose which installed Chrome build this profile runs') });
  out.push({ id: 'rename', label: t('Rename…') });
  if (r.live) out.push({ id: 'stop', label: t('Stop'), title: t('Stop this profile\'s browser now — its logins stay in the profile; the next command starts it again (this also resets a browser that keeps closing)') });
  if (hung(r, x)) { /* Restart is the row's primary (never twice) */ } else if (x.stuck && x.stuck.action && r.live && !r.host) out.push({ id: 'restart', label: String(x.stuck.action), title: String(x.stuck.tooltip || '') });
  else if (x.autoDialogs) out.push({ id: 'restart-hold', label: t('Restart to hold dialogs'), title: t('Restart this browser so VibeSpace holds leave-page dialogs for a decision instead of the browser accepting them — its tabs close, logins stay') });
  if (!notOurs(r)) { out.push({ sep: true }); out.push({ id: 'delete', label: t('Delete…'), warn: true, title: t('Stop it, take it away from every conversation that uses it, and move its directory beside itself — nothing is deleted for good until you click Delete permanently below') }); }
  return out;
}

/** The ids of every act the row offers (primary ∪ menu ∪ the who cell's Change…) — each at most once. */
export function rowActs(r, x = {}) {
  const p = rowPrimary(r, x);
  return [...(p ? [p.id] : []), ...rowMenu(r, x).filter((m) => !m.sep).map((m) => m.id), ...(r.legacy ? [] : ['who'])];
}

/** One profile row's closed line: per cell `{l1, l2}` (design 015 §2b's table). */
export function rowLine(r, x = {}) {
  const t = T(x), st = stateLines(r, x);
  return {
    name: { l1: label(r), title: label(r), chips: nameChips(r, x) },
    state: { l1: hung(r, x) ? String(x.unresponsive.state) : String(W(x, 'state', (s) => String(s || ''))(r.state) || ''), tone: hung(r, x) ? 'unresponsive' : String(r.state || '').replace(/[^a-z-]/g, ''), l2: st[0] || null, title: st.map((s) => s.text).join(' · ') },
    who: r.legacy ? { kind: 'legacy', l1: t('Legacy profile — it keeps no list') } : { kind: 'list' },
    usage: usageLine(r, x),
    primary: rowPrimary(r, x),
  };
}

/** The row's fold: `[{key, k, v, tone?, mono?, title?}]`, only the facts present — the whole name, the directory, every state
 *  sentence, memory, the Chrome build, the records against their limit, the recordings, the display fact, your own
 *  browsing. */
export function rowFold(r, x = {}) {
  const t = T(x), bytes = W(x, 'bytes', (n) => String(n)), size = W(x, 'size', (n) => String(n)), ago = W(x, 'ago', () => '');
  const out = [{ key: 'name', k: t('Name'), v: label(r) }];
  if (r.dir) out.push({ key: 'dir', k: t('Directory'), v: String(r.dir), mono: true });
  const st = stateLines(r, x);
  if (st.length) out.push({ key: 'state', k: t('State'), v: st.map((s) => s.text).join(' · '), tone: st.some((s) => s.tone === 'warn') ? 'warn' : '' });
  const mem = r.usage ? String(W(x, 'memory', () => '')(r.usage.memBytes, r.usage.memMetric) || '') : '';
  if (mem) out.push({ key: 'memory', k: t('Memory'), v: mem, tone: r.usage.over ? 'warn' : '', title: r.usage.over ? String(r.usage.over) : '' });
  const bl = x.buildLine || null; // the view's cardBuildLine (the choice + the build the running browser reports)
  if (bl && bl.text) out.push({ key: 'build', k: t('Browser build'), v: String(bl.text), tone: bl.warn ? 'warn' : '' });
  const tr = r.trace || { n: 0 };
  const lim = Number(tr.limit) || (x.limits && x.limits.bytesPerProfile) || 0;
  const rec = [tr.n ? t('{n} action(s)', { n: tr.n }) : t('no actions'), t('{used} of {size}', { used: bytes(Number(tr.used) || 0), size: size(lim) })];
  if (Number(tr.fitBytes) > 0) rec.push(t('page-size frames: {size}', { size: bytes(Number(tr.fitBytes) || 0) }));
  if (tr.last) rec.push(t('last {ago}', { ago: ago((Number(x.now) || 0) - Number(tr.last)) }));
  out.push({ key: 'records', k: t('Records'), v: rec.join(' · ') });
  const recs = Array.isArray(r.recordings) ? r.recordings : [];
  const rv = [recs.length ? t('{n} recording(s)', { n: recs.length }) + ' · ' + bytes(r.recordingBytes || 0) : t('no recordings')];
  if (r.recording) rv.push(t('recording'));
  if (r.recordingRefused) rv.push(t('refused: {why}', { why: String(r.recordingRefused.error || r.recordingRefused.code || '') }));
  out.push({ key: 'recordings', k: t('Recordings'), v: rv.join(' · '), tone: r.recordingRefused ? 'warn' : '' });
  const disp = String(W(x, 'display', () => '')(r.display) || '');
  if (disp) out.push({ key: 'display', k: t('Display'), v: disp });
  const hl = String(W(x, 'human', () => '')(r.human, t) || '');
  if (hl) out.push({ key: 'human', k: t('Your browsing'), v: hl, tone: r.human && r.human.state === 'driving' ? 'accent' : '' });
  return out;
}

/** Unregistered directories, the largest first (an unmeasured one last), then by name. */
export function orphanOrder(list) {
  const n = (o) => (o && Number.isFinite(Number(o.bytes)) && o.bytes !== null ? Number(o.bytes) : -1);
  return (Array.isArray(list) ? list : []).slice().sort((a, b) => n(b) - n(a) || String((a && a.name) || '').localeCompare(String((b && b.name) || '')));
}
