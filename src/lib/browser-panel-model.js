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
export const ROW_ACTS = Object.freeze(['browse', 'record', 'record-mine', 'replay', 'build', 'rename', 'stop', 'restart', 'restart-hold', 'passkeys', 'delete', 'who']); // lane passkey-ui: + Passkeys (n)…

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
  // lane browser-disk-sample: the keeper's du sample is THE size once it has measured; the panel's own reading until then
  const d = measuredDisk(r), b = d ? d.bytes : r.bytes;
  return { l1: b === null || b === undefined ? t('not measured') : bytes(b), l2 };
}

const measuredDisk = (r) => (r && r.disk && (r.disk.state === 'ok' || r.disk.state === 'over') && Number.isFinite(r.disk.bytes) ? r.disk : null);
/** lane browser-disk-sample (B-5fab): the fold's On disk fact — the keeper's `du -sk` sample against the profile disk
 *  budget ("1.3 GB of 2 GB"; over it in the warn tone), "not measured yet" before the first answer or after a failed one
 *  (its why in the title), and a paired machine's row its why. The view PATCHES it in place (never a row rebuild). */
export function diskFold(r, x = {}) {
  const t = T(x), bytes = W(x, 'bytes', (n) => String(n)), size = W(x, 'size', (n) => String(n));
  const d = (r && r.disk) || null, k = t('On disk');
  const m = measuredDisk(r);
  if (m) return { key: 'disk', k, v: t('{used} of {size}', { used: bytes(m.bytes), size: size(m.limit) }), tone: m.state === 'over' ? 'warn' : '', title: m.state === 'over' ? t('Over the profile disk budget — said in For you; Delete… in its menu frees it') : '' };
  if (d && d.state === 'not-measured') return { key: 'disk', k, v: d.reason === 'remote' ? t('not measured — its folder is on a paired machine') : t('not measured — VibeSpace keeps no folder for it'), tone: '', title: '' };
  return { key: 'disk', k, v: t('not measured yet'), tone: '', title: d && d.state === 'unknown' && d.why ? String(d.why) : '' };
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
  // lane passkey-ui (design-passkey-store §2.5): Passkeys (n)… — n = 0 too (the agents-never switch lives inside)
  if (!notOurs(r)) out.push({ id: 'passkeys', label: t('Passkeys ({n})…', { n: Math.max(0, Number(x.passkeys) || 0) }), title: t('The passkeys this profile keeps — site, user, who registered it, last use, policy') });
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
  // lane browser-profile-clone (B-9669): where a copy's logins came from — a one-time snapshot, dated in the viewer's locale
  if (r.clonedFrom && r.clonedFrom.label) out.push({ key: 'cloned', k: t('Logins'), v: t('copied from {label} on {date}', { label: String(r.clonedFrom.label), date: String(W(x, 'date', (ms) => new Date(ms).toISOString().slice(0, 10))(Number(r.clonedFrom.at) || 0)) }) });
  const tr = r.trace || { n: 0 };
  const lim = Number(tr.limit) || (x.limits && x.limits.bytesPerProfile) || 0;
  const rec = [tr.n ? t('{n} action(s)', { n: tr.n }) : t('no actions'), t('{used} of {size}', { used: bytes(Number(tr.used) || 0), size: size(lim) })];
  if (Number(tr.fitBytes) > 0) rec.push(t('page-size frames: {size}', { size: bytes(Number(tr.fitBytes) || 0) }));
  if (tr.last) rec.push(t('last {ago}', { ago: ago((Number(x.now) || 0) - Number(tr.last)) }));
  out.push(diskFold(r, x)); // lane browser-disk-sample: next to the records' "0 B of 1 GB"
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

// ── lane passkey-ui (design-passkey-store §2.5): THE PASSKEYS TABLE — the owner's publicRows (P1's GET
// /api/browser/passkeys) as the panel draws them. A row is built from NAMED fields only, never a spread: a row that
// carries a key field (or the whole credential id) is REFUSED — never drawn, counted in `refused`. ──
export const PASSKEY_POLICIES = Object.freeze(['yes', 'ask', 'no']);
export const PASSKEY_KEY_FIELDS = Object.freeze(['keySealed', 'key', 'privateKey', 'userHandle', 'credentialId']);
/** The three-way control's words, in order (allow / ask each time / never). */
export function policySegments(policy, x = {}) {
  const t = T(x), on = PASSKEY_POLICIES.includes(policy) ? policy : 'ask';
  const words = { yes: t('Allow'), ask: t('Ask each time'), no: t('Never') };
  return PASSKEY_POLICIES.map((p) => ({ value: p, label: words[p], on: p === on }));
}
/** One table row from one publicRow — null (refused) when it carries a key field. */
export function passkeyRow(k, x = {}) {
  if (!k || typeof k !== 'object' || PASSKEY_KEY_FIELDS.some((f) => Object.prototype.hasOwnProperty.call(k, f))) return null;
  const t = T(x), date = W(x, 'date', (n) => new Date(n).toISOString().slice(0, 10)), ago = W(x, 'ago', date); // no `ago` words ⇒ the date
  const id = String(k.id || '').slice(0, 8);
  if (!/^[A-Za-z0-9_-]{1,8}$/.test(id)) return null;
  const user = String(k.userName || k.displayName || '').slice(0, 64);
  const disp = String(k.displayName || '').slice(0, 64);
  const created = Number(k.createdAt) || 0, used = Number(k.lastUsedAt) || 0;
  const policy = PASSKEY_POLICIES.includes(k.policy) ? k.policy : 'ask';
  return {
    id, site: String(k.rpId || '').slice(0, 253), user, userTitle: disp && disp !== user ? disp : '',
    source: k.source === 'you' ? 'you' : 'agent',
    sourceText: (k.source === 'you' ? t('you') : t('agent')) + (created ? ' · ' + String(date(created) || '') : ''),
    lastUsed: used ? String(ago(used) || '') : t('never'), uses: Math.max(0, Number(k.uses) || 0),
    policy, segments: policySegments(policy, x),
  };
}
/** The whole table: the head row (the switch + the one sentence), the column titles, the rows, the empty state. */
export function passkeyTable(list, x = {}) {
  const t = T(x), keys = Array.isArray(list && list.keys) ? list.keys : [];
  const rows = keys.map((k) => passkeyRow(k, x)).filter(Boolean);
  return {
    switchOn: !!(list && list.agentsOff), switchLabel: t('Agents never sign in with passkeys'),
    // lane passkey-prewrap-fix: a page that replaced the credentials API in the last hour (taken back) is said here, once
    note: (list && Number(list.displaced) > 0 ? t('A page replaced the credentials API (taken back)') + ' · ' : '') + t('Keys live only in this VibeSpace; deleting the profile deletes them'),
    columns: [t('Site'), t('User'), t('Source'), t('Last used'), t('Policy'), ''],
    rows, refused: keys.length - rows.length,
    empty: rows.length ? null : { line: t('No passkeys yet — when an agent asks to register one, its card appears in For you.'), hint: 'vibespace-browser passkey register <site>' },
  };
}
/** Delete…'s confirm words — the site and the user named. */
export function passkeyDeleteWords(row, x = {}) {
  const t = T(x);
  return { title: t('Delete the passkey for {site}?', { site: row.site }), message: row.user ? t('The passkey of {user} on {site} is deleted from this VibeSpace — signing in to {site} with it stops working; the site keeps its own record until you remove it there.', { user: row.user, site: row.site }) : t('The passkey on {site} is deleted from this VibeSpace — signing in to {site} with it stops working; the site keeps its own record until you remove it there.', { site: row.site }), confirm: t('Delete') };
}
