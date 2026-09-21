// Background Work window + rail panel + Interaction Panel window (2.342.x,
// docs/design-background-work.md §9). XSS LAW: every job-record string is
// agent-/process-controlled and synced to all clients — EVERYTHING renders via
// textContent; agent markup NEVER touches our DOM (panel md → DOMPurify).
import { escHtml, fetchJson, showConfirmDialog, showToast, createModalShell } from './utils.js';
import { t } from './i18n.js';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { registerWindowType } from './window-types.js';
import { badgeCounts, foldTasks, pruneFolds, heldText, ackableIds } from './jobs-layout.js';

const GLYPH = { 'awaiting-user': '⚑', failed: '✖', unverified: '?', missed: '✖', up: '●', starting: '◌', down: '○', scheduled: '◷', interrupted: '⚠', done: '✔' }; // text glyphs only — emoji ban
const SEV = { failed: 'bad', missed: 'bad', unverified: 'bad', 'awaiting-user': 'warn', interrupted: 'warn', up: 'ok', starting: 'ok', scheduled: 'idle', down: 'idle', done: 'idle' };
const KIND_ICON = {
  service: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/><circle cx="6.5" cy="7" r=".9" fill="currentColor"/><circle cx="6.5" cy="17" r=".9" fill="currentColor"/></svg>',
  task: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 5l10 7-10 7z"/></svg>',
  cron: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>',
};
const hum = (ms) => { const m = Math.round(Math.abs(ms) / 60000); return m < 1 ? '<1m' : m < 60 ? m + 'm' : m < 1440 ? Math.round(m / 60) + 'h' : Math.round(m / 1440) + 'd'; };

// expanded-card state survives the jobs-updated full re-render (2.357.0
// sidebar unification — the rail panel is THE surface now, so it must not
// collapse what the user opened every time the engine broadcasts)
const EXPANDED = new Set();

// ── TRIAGE state (design §13, 2026-09-14) ─────────────────────────────────
// The user's fold choices live in user state (`jobsPanelFolds`, PATCH
// merge-only like desktopAppRecents), are loaded ONCE per page and kept in
// step with other clients through the user-state-updated broadcast. The
// archive list is fetched only when its row is clicked.
let FOLDS = null;
let foldsWired = false;
let ARCHIVE_OPEN = false;
async function loadFolds(app) {
  if (!foldsWired) {
    foldsWired = true;
    app.ws.onGlobal((msg) => { if (msg.type === 'user-state-updated' && msg.state && msg.state.jobsPanelFolds && typeof msg.state.jobsPanelFolds === 'object') FOLDS = { ...msg.state.jobsPanelFolds }; });
  }
  if (FOLDS) return FOLDS;
  const st = await fetchJson('/api/user-state');
  FOLDS = st && st.jobsPanelFolds && typeof st.jobsPanelFolds === 'object' ? { ...st.jobsPanelFolds } : {};
  return FOLDS;
}
/** BATCH "Mark all seen" (2.369.121, owner: 批量已读): ONE request for every
 *  ackable id (a terminal one-shot not yet seen); the server acknowledges them
 *  all with one save + one broadcast, so the badge and every open panel repaint
 *  once. Never sent for an empty list. */
function seenAllButton(ids, refresh, { compact = false } = {}) {
  if (!ids || !ids.length) return null;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'jobs-btn jobs-seen-all';
  b.textContent = compact ? `✓ ${ids.length}` : `✓ ${t('Mark all seen')} (${ids.length})`;
  b.title = t('Acknowledge every finished job here that you have not looked at yet — the red count drops, nothing is deleted');
  b.onclick = async (ev) => {
    ev.stopPropagation();
    b.disabled = true;
    const r = await fetchJson('/api/jobs/seen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) });
    if (!r || r.error) showToast(t('Could not mark them seen') + (r?.error ? `: ${r.error}` : ''), { type: 'error' });
    refresh?.();
  };
  return b;
}
/** persist ONE toggle (a family group OR a whole session — both carry key +
 *  expanded): the map is pruned to the keys that still exist, so a fold can
 *  never outlive its group/session and grow user state without bound */
function setFold(g, layout) {
  FOLDS = pruneFolds({ ...(FOLDS || {}), [g.key]: !g.expanded }, layout);
  fetch('/api/user-state', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobsPanelFolds: FOLDS }) }).catch(() => {});
}
/** conversation id / webui id → the sidebar's own display name for the session */
function sessionNameMap(app) {
  const out = {};
  const sb = app.sidebar;
  for (const s of (sb && sb._allSessions) || []) {
    let custom = null; try { custom = sb.getCustomName ? sb.getCustomName(s) : null; } catch { custom = null; }
    const cwdFolder = s.cwd ? String(s.cwd).replace(/\/+$/, '').split('/').pop() : '';
    const name = custom || s.name || s.webuiName || cwdFolder || '';
    if (!name) continue;
    if (s.backendSessionId) out[s.backendSessionId] = name;
    if (s.webuiId) out[s.webuiId] = name;
  }
  return out;
}
/** the summary line (rule 2): running · N failed · M seen · K awaiting you · H held */
function summaryText(counts, held) {
  const parts = [`${counts.running} ${t('running')}`];
  if (counts.failed) parts.push(`${counts.failed} ${t('failed')}` + (counts.ackedFailed ? ` · ${counts.ackedFailed} ${t('seen')}` : ''));
  if (counts.awaiting) parts.push(`${counts.awaiting} ${t('awaiting you')}`);
  if (held && held.total) parts.push(`${held.total} ${t('held')}`);
  return parts.join(' · ');
}

/** Focus the sidebar-native jobs panel (optionally on one job). Returns false
 *  when there is no rail (mobile / activityRail off) so callers fall back to
 *  the window. NOTE _railGo collapses on re-click of the active tab — the
 *  already-active case rebuilds the panel instead. */
export function focusJobsPanel(app, jobId) {
  const sb = app.sidebar;
  if (!sb?._railEl || !sb.listEl) return false;
  if (jobId) { sb._jobsFocusId = jobId; EXPANDED.add(jobId); }
  if (sb._activeTab !== 'jobs') sb._railGo('jobs');
  else {
    if (!sb.isOpen) sb.toggle(true);
    sb.listEl.querySelector('.rail-panel-jobs')?.remove();
    sb._renderRailPanel();
  }
  return true;
}

function stateLine(j) {
  const run = j.run || {};
  const bits = [j.state];
  if (run.startedAt && !run.endedAt) bits.push(hum(Date.now() - run.startedAt));
  else if (run.endedAt) bits.push(hum(Date.now() - run.endedAt) + ' ' + t('ago'));
  if (run.exit !== null && run.exit !== undefined) bits.push('exit=' + run.exit);
  if (j.nextFireAt) bits.push(t('next') + ' ~' + hum(j.nextFireAt - Date.now()));
  return bits.join(' · ');
}

async function jobAction(app, j, act, refresh) {
  if (act === 'panel') return openInteractWindow(app, j.id); // redirects to the rail panel when it exists
  if (act === 'rm' && !(await showConfirmDialog({ title: t('Remove job'), message: t('Remove {name} and its run history?', { name: j.name }), confirmText: t('Remove'), danger: true }))) return;
  const r = await fetchJson(`/api/jobs/${j.id}/${act}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  if (r?.error) showToast(r.error, { error: true });
  refresh?.();
}
function actionButtons(app, j, refresh, { compact } = {}) {
  const out = [];
  const mk = (label, act, cls = '') => {
    const b = document.createElement('button');
    b.className = 'jobs-btn ' + cls;
    b.textContent = label;
    b.onclick = (ev) => { ev.stopPropagation(); jobAction(app, j, act, refresh); };
    return b;
  };
  if (j.pendingPanel) out.push(mk(compact ? '⚑' : t('Open panel'), 'panel', 'jobs-btn-warn'));
  if (['up', 'starting', 'awaiting-user'].includes(j.state) || (j.kind === 'cron' && j.desiredUp && j.state === 'scheduled')) out.push(mk(compact ? '■' : t('Stop'), 'stop'));
  if (['down', 'failed', 'missed'].includes(j.state) || (j.kind === 'cron' && !j.desiredUp)) out.push(mk(compact ? '▸' : t('Start'), 'start', 'jobs-btn-ok'));
  if (['done', 'interrupted', 'failed', 'missed'].includes(j.state) && !compact) out.push(mk('✕', 'rm'));
  return out;
}

/** shared list renderer — the window (rich) and the rail panel (compact).
 *  TRIAGE (design §13): the Tasks section folds by owner session → name
 *  family (renderTaskSection); Services and Cron keep their flat rows. */
function renderList(app, root, jobs, { compact, refresh, archivedCount = 0 }) {
  const sections = [['service', t('Services'), KIND_ICON.service], ['task', t('Tasks'), KIND_ICON.task], ['cron', t('Cron'), KIND_ICON.cron]];
  for (const [kind, label, icon] of sections) {
    const list = jobs.filter((j) => j.kind === kind);
    const hasArchive = kind === 'task' && archivedCount > 0;
    if (compact && !list.length && !hasArchive) continue;
    const h = document.createElement('div');
    h.className = 'jobs-sec-head';
    h.innerHTML = icon; // static SVG constant, not user data
    const hl = document.createElement('span'); hl.textContent = ` ${label}`;
    const hc = document.createElement('span'); hc.className = 'jobs-sec-count';
    const up = list.filter((j) => ['up', 'starting', 'scheduled', 'awaiting-user'].includes(j.state)).length;
    hc.textContent = list.length ? `${up}/${list.length}` : '0';
    h.append(hl, hc);
    root.appendChild(h);
    if (!list.length && !hasArchive) { const e = document.createElement('div'); e.className = 'jobs-empty'; e.textContent = t('none'); root.appendChild(e); continue; }
    if (kind === 'task') { renderTaskSection(app, root, list, { compact, refresh, archivedCount }); continue; }
    for (const j of list) renderCard(app, root, j, { compact, refresh });
  }
}

/** The Tasks section (rule 3): owner session → name family → rows. A group
 *  row is a BUTTON (keyboard-reachable, aria-expanded); expanded by default
 *  when it holds a running job, an awaiting-user job or an UNACKNOWLEDGED
 *  failure, else collapsed; the user's persisted folds apply AFTER that.
 *  Inside an expanded group the rows keep today's renderer (renderCard). */
function renderTaskSection(app, root, list, { compact, refresh, archivedCount }) {
  const layout = foldTasks(list, { expanded: FOLDS || {}, sessionNames: sessionNameMap(app) });
  for (const sess of layout.sessions) {
    // SESSION HEADER = a fold button (2.369.121, owner: 按会话折叠 + 批量已读):
    // chevron · name · ×count · attention chips · "Mark all seen" · age.
    const sh = document.createElement('button');
    sh.type = 'button';
    sh.className = 'jobs-sess-head' + (sess.expanded ? ' jobs-sess-open' : '') + (sess.failedUnacked ? ' jobs-sess-attn' : '');
    sh.setAttribute('aria-expanded', sess.expanded ? 'true' : 'false');
    sh.dataset.session = sess.key;
    const schev = document.createElement('span'); schev.className = 'jobs-group-chev'; schev.textContent = sess.expanded ? '▾' : '▸';
    const sname = document.createElement('span'); sname.className = 'jobs-sess-name'; sname.textContent = sess.label.kind === 'manual' ? t('created by you') : sess.label.text;
    if (sess.label.kind === 'short') sh.title = t('session {id} (no longer listed)', { id: sess.label.text });
    const scnt = document.createElement('span'); scnt.className = 'jobs-group-count'; scnt.textContent = `×${sess.count}`;
    sh.append(schev, sname, scnt);
    const schip = (cls, text) => { const s = document.createElement('span'); s.className = 'jobs-group-chip ' + cls; s.textContent = text; sh.appendChild(s); };
    if (sess.running) schip('jobs-group-run', `${sess.running} ${t('running')}`);
    if (sess.awaiting) schip('jobs-group-ask', `${sess.awaiting} ${t('awaiting you')}`);
    if (sess.failedUnacked) schip('jobs-group-bad', `${sess.failedUnacked} ${t('failed')}`);
    const ssp = document.createElement('span'); ssp.style.flex = '1';
    sh.appendChild(ssp);
    const seenBtn = seenAllButton(sess.ackable, refresh, { compact });
    if (seenBtn) sh.appendChild(seenBtn);
    const sage = document.createElement('span'); sage.className = 'jobs-group-age'; sage.textContent = sess.latestAt ? hum(Date.now() - sess.latestAt) + ' ' + t('ago') : '';
    sh.appendChild(sage);
    sh.onclick = () => { setFold(sess, layout); refresh?.(); };
    root.appendChild(sh);
    if (!sess.expanded) continue;
    for (const g of sess.groups) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'jobs-group' + (g.expanded ? ' jobs-group-open' : '') + (g.failedUnacked ? ' jobs-group-attn' : '');
      btn.setAttribute('aria-expanded', g.expanded ? 'true' : 'false');
      btn.dataset.group = g.key;
      const chev = document.createElement('span'); chev.className = 'jobs-group-chev'; chev.textContent = g.expanded ? '▾' : '▸';
      const fam = document.createElement('span'); fam.className = 'jobs-group-name'; fam.textContent = g.family;
      const cnt = document.createElement('span'); cnt.className = 'jobs-group-count'; cnt.textContent = `×${g.count}`;
      btn.append(chev, fam, cnt);
      const chip = (cls, text) => { const s = document.createElement('span'); s.className = 'jobs-group-chip ' + cls; s.textContent = text; btn.appendChild(s); };
      if (g.running) chip('jobs-group-run', `${g.running} ${t('running')}`);
      if (g.awaiting) chip('jobs-group-ask', `${g.awaiting} ${t('awaiting you')}`);
      if (g.failedUnacked) chip('jobs-group-bad', `${g.failedUnacked} ${t('failed')}`);
      if (g.failedAcked) chip('jobs-group-seen', `${g.failedAcked} ${t('seen')}`);
      const sp = document.createElement('span'); sp.style.flex = '1';
      const age = document.createElement('span'); age.className = 'jobs-group-age'; age.textContent = g.latestAt ? hum(Date.now() - g.latestAt) + ' ' + t('ago') : '';
      btn.append(sp, age);
      btn.onclick = () => { setFold(g, layout); refresh?.(); };
      root.appendChild(btn);
      if (g.expanded) for (const j of g.jobs) renderCard(app, root, j, { compact, refresh });
    }
  }
  if (archivedCount > 0) renderArchivedRow(app, root, archivedCount, { compact, refresh });
}

/** "Archived · N" at the foot of Tasks (rule 5): NO fetch until clicked; an
 *  archived row keeps ✕ only, which deletes it for good behind the usual
 *  confirm dialog. */
function renderArchivedRow(app, root, n, { compact, refresh }) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'jobs-group jobs-archived-toggle' + (ARCHIVE_OPEN ? ' jobs-group-open' : '');
  btn.setAttribute('aria-expanded', ARCHIVE_OPEN ? 'true' : 'false');
  const chev = document.createElement('span'); chev.className = 'jobs-group-chev'; chev.textContent = ARCHIVE_OPEN ? '▾' : '▸';
  const lab = document.createElement('span'); lab.className = 'jobs-group-name'; lab.textContent = `${t('Archived')} · ${n}`;
  btn.append(chev, lab);
  btn.onclick = () => { ARCHIVE_OPEN = !ARCHIVE_OPEN; refresh?.(); };
  root.appendChild(btn);
  if (!ARCHIVE_OPEN) return;
  const box = document.createElement('div'); box.className = 'jobs-archived-list';
  root.appendChild(box);
  fetchJson('/api/jobs?archived=1').then((r) => {
    if (!box.isConnected) return;
    if (r?.error) { const e = document.createElement('div'); e.className = 'jobs-empty'; e.style.color = 'var(--red)'; e.textContent = r.error; return box.appendChild(e); }
    const rows = r?.jobs || [];
    for (const j of rows) renderCard(app, box, j, { compact, refresh, archived: true });
    if (!rows.length) { const e = document.createElement('div'); e.className = 'jobs-empty'; e.textContent = t('none'); box.appendChild(e); }
  });
}

/** ONE card — the renderer every row shares. An ARCHIVED row keeps ✕ only. */
function renderCard(app, root, j, { compact, refresh, archived = false }) {
  const el = document.createElement('div');
  el.className = 'jobs-card jobs-sev-' + (SEV[j.state] || 'idle') + (archived ? ' jobs-card-archived' : '');
  const l1 = document.createElement('div'); l1.className = 'jobs-card-l1';
  const dot = document.createElement('span'); dot.className = 'jobs-dot'; dot.textContent = GLYPH[j.state] || '·';
  const name = document.createElement('span'); name.className = 'jobs-name'; name.textContent = j.name;
  const st = document.createElement('span'); st.className = 'jobs-state'; st.textContent = stateLine(j) + (archived ? ` · ${t('archived')}` : '');
  const sp = document.createElement('span'); sp.style.flex = '1';
  l1.append(dot, name, st, sp, ...(archived ? [rmButton(app, j, refresh)] : actionButtons(app, j, refresh, { compact })));
  el.appendChild(l1);
  // a FAILED row says why (rule 4): the exit code rides stateLine, the last
  // non-empty log line is the actionable fact — shown in the compact rail too
  const lastLine = ['failed', 'missed', 'interrupted'].includes(j.state) && j.run && j.run.lastLine ? j.run.lastLine : '';
  if (!compact || j.progress || lastLine) {
    const l2 = document.createElement('div'); l2.className = 'jobs-card-l2';
    if (lastLine) { const ll = document.createElement('span'); ll.className = 'jobs-lastline'; ll.textContent = lastLine; ll.title = lastLine; l2.appendChild(ll); }
    if (j.progress) { const pg = document.createElement('span'); pg.className = 'jobs-chip jobs-chip-prog'; pg.textContent = j.progress; l2.appendChild(pg); }
    if (j.runsCount > 1) { const rc = document.createElement('span'); rc.className = 'jobs-chip'; rc.textContent = '×' + j.runsCount; l2.appendChild(rc); }
    for (const p of j.ports || []) { const c = document.createElement('span'); c.className = 'jobs-chip'; c.textContent = ':' + p; l2.appendChild(c); }
    if (j.publishedUrl) { const u = document.createElement('button'); u.className = 'jobs-chip jobs-chip-url'; u.textContent = '↗ ' + j.publishedUrl.replace(/^https?:\/\//, ''); u.onclick = (ev) => { ev.stopPropagation(); app.openBrowser?.(j.publishedUrl) || window.open(j.publishedUrl); }; l2.appendChild(u); }
    for (const g of (j.owner?.groups || []).slice(0, 2)) { const c = document.createElement('span'); c.className = 'jobs-chip jobs-chip-grp'; c.textContent = g; l2.appendChild(c); }
    if (!compact && j.context?.payload) { const cx = document.createElement('span'); cx.className = 'jobs-ctx'; cx.textContent = j.context.payload.split('\n')[0].slice(0, 90); l2.appendChild(cx); }
    if (l2.childNodes.length) el.appendChild(l2);
  }
  // one interaction everywhere (owner verdict 2.357.0: a click that
  // spawned a WINDOW from the sidebar was jarring): expand inline, in
  // the rail panel and the fallback window alike
  el.dataset.job = j.id;
  el.onclick = () => {
    if (el.classList.contains('jobs-open')) { EXPANDED.delete(j.id); el.classList.remove('jobs-open'); el.querySelector('.jobs-detail')?.remove(); }
    else { EXPANDED.add(j.id); expandDetail(app, el, j, refresh); }
  };
  root.appendChild(el);
  if (EXPANDED.has(j.id)) expandDetail(app, el, j, refresh);
}
function rmButton(app, j, refresh) { const b = document.createElement('button'); b.className = 'jobs-btn'; b.textContent = '✕'; b.onclick = (ev) => { ev.stopPropagation(); jobAction(app, j, 'rm', refresh); }; return b; }

async function expandDetail(app, el, j, refresh) {
  el.classList.add('jobs-open');
  // the user OPENED the row (triage §13 rule 1c): a terminal one-shot is now
  // acknowledged; the server's broadcast repaints the badge and the group
  if (j.kind === 'task' && !j.archived && ['failed', 'missed', 'unverified', 'interrupted', 'done'].includes(j.state)) fetchJson(`/api/jobs/${j.id}/seen`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const d = document.createElement('div');
  d.className = 'jobs-detail';
  d.onclick = (e) => e.stopPropagation();
  el.appendChild(d);
  const r = await fetchJson(`/api/jobs/${j.id}?tail=60`);
  const job = r?.job; if (!job) return;
  // pending interaction answers INLINE (2.357.0 — no more hunting for a
  // separate window); a jobs-updated broadcast rebuilds the panel, so a
  // one-shot form render here is always fresh
  if (job.interaction?.pending) {
    const fw = document.createElement('div'); fw.className = 'jobs-inline-panel';
    d.appendChild(fw);
    renderPanelBlocks(app, fw, job.id, job.interaction.pending, { onAnswered: refresh });
  }
  const meta = document.createElement('div'); meta.className = 'jobs-meta';
  meta.textContent = `${job.id} · ${t('created')} ${new Date(job.createdAt).toLocaleString()} · ${(job.owner?.groups || []).join(', ') || t('no group')}`;
  d.appendChild(meta);
  if (job.context?.payload) { const c = document.createElement('pre'); c.className = 'jobs-payload'; c.textContent = job.context.payload; d.appendChild(c); }
  const acc = document.createElement('div'); acc.className = 'jobs-access';
  for (const dim of ['view', 'control']) {
    const lbl = document.createElement('span'); lbl.textContent = t(dim === 'view' ? 'view' : 'control') + ':';
    const sel = document.createElement('select'); sel.className = 'toolbar-select';
    for (const v of ['session', 'group', 'all']) { const o = document.createElement('option'); o.value = v; o.textContent = v; if ((job.access || {})[dim] === v) o.selected = true; sel.appendChild(o); }
    sel.onchange = async () => { const r2 = await fetchJson(`/api/jobs/${j.id}/access`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [dim]: sel.value }) }); if (r2?.error) showToast(r2.error, { error: true }); };
    acc.append(lbl, sel);
  }
  const lock = document.createElement('button'); lock.className = 'jobs-btn';
  const setL = () => { lock.textContent = (job.access?.lockedBy === 'user' ? '🔒 ' : '🔓 ') + t(job.access?.lockedBy === 'user' ? 'locked by you' : 'agents may change'); };
  setL();
  lock.onclick = async () => { const r2 = await fetchJson(`/api/jobs/${j.id}/access`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lock: job.access?.lockedBy !== 'user' }) }); if (!r2?.error) { job.access = r2.access; setL(); } };
  acc.appendChild(lock);
  d.appendChild(acc);
  // owner auto-notify state (2.344.0): which lane told (or will tell) the
  // owner conversation about this job, and when it last happened
  {
    const nr = document.createElement('div'); nr.className = 'jobs-meta';
    const ln = job.lastNotify;
    const lastTxt = !ln ? t('nothing sent yet')
      : (ln.lane === 'message' || ln.lane === 'channel') && ln.ok ? t('messaged the owner conversation {ago}', { ago: hum(Date.now() - ln.ts) + ' ' + t('ago') })
      : ln.lane === 'stash' ? t('queued for the owner conversation’s next resume ({ago})', { ago: hum(Date.now() - ln.ts) + ' ' + t('ago') })
      : ln.lane === 'off' ? t('skipped — auto-notify is off ({source})', { source: ln.source || 'global' })
      : ln.lane === 'suppressed' ? t('suppressed by the rate floor')
      : t('nothing sent yet');
    const ov = job.notify === 'on' ? ' · ' + t('forced ON for this job') : job.notify === 'off' ? ' · ' + t('forced OFF for this job') : '';
    nr.textContent = t('Auto-notify') + ': ' + lastTxt + ov;
    d.appendChild(nr);
  }
  // delivery journal (2.361.5, owner ask): every delivery ATTEMPT with lane +
  // outcome — the monitoring view for "did my reminder actually reach anyone".
  if (Array.isArray(job.notifyLog) && job.notifyLog.length) {
    const dl = document.createElement('div'); dl.className = 'jobs-meta';
    dl.textContent = t('Delivery log') + ':';
    d.appendChild(dl);
    for (const e of job.notifyLog.slice(-6).reverse()) {
      const row = document.createElement('div'); row.className = 'jobs-run';
      row.textContent = `${new Date(e.ts).toLocaleTimeString()} · ${e.lane}${e.sub ? ' (subscriber)' : ''} · ${e.ok ? '✓' : '✗'}${e.to ? ' → ' + e.to : ''}${e.reason ? ' — ' + e.reason : ''}`;
      d.appendChild(row);
    }
  }
  for (const run of (job.runs || []).slice(-6).reverse()) {
    const rr = document.createElement('div'); rr.className = 'jobs-run';
    rr.textContent = `${new Date(run.startedAt).toLocaleString()} · ${run.endedAt ? hum(run.endedAt - run.startedAt) : t('running')} · exit=${run.exit ?? '—'} ${run.cause || ''} (${run.trigger})`;
    d.appendChild(rr);
  }
  if (job.logTail) { const lt = document.createElement('pre'); lt.className = 'jobs-log'; lt.textContent = job.logTail; d.appendChild(lt); }
}

function openCreateDialog(app, onDone) {
  const { body, okBtn, close } = createModalShell({ title: t('New background job'), minWidth: 440 });
  const f = {};
  const field = (label, el) => { const w = document.createElement('div'); w.className = 'jobs-form-row'; const l = document.createElement('label'); l.textContent = label; w.append(l, el); body.appendChild(w); return el; };
  const inp = (ph = '') => { const i = document.createElement('input'); i.placeholder = ph; return i; };
  f.name = field(t('Name'), inp('dev-server'));
  f.cmd = field(t('Command'), inp('npm run dev'));
  f.cwd = field(t('Working directory'), inp(app.cwd || ''));
  f.kind = field(t('Type'), (() => { const s2 = document.createElement('select'); for (const [v, l] of [['task', t('Task (runs once)')], ['service', t('Service (kept running)')], ['cron', t('Scheduled')]]) { const o = document.createElement('option'); o.value = v; o.textContent = l; s2.appendChild(o); } return s2; })());
  f.sched = field(t('Schedule (cron "41 9 * * *" / every 30m / at 2026-09-05 06:00)'), inp(''));
  f.ctx = field(t('Context brief (shown at every poll)'), inp(''));
  okBtn.textContent = t('Create');
  okBtn.onclick = async () => {
    const kind = f.kind.value;
    const schedRaw = f.sched.value.trim();
    let schedule = null;
    if (schedRaw) {
      const evm = /^every\s+(.+)$/i.exec(schedRaw); const atm = /^at\s+(.+)$/i.exec(schedRaw);
      schedule = evm ? { everyMs: (parseFloat(evm[1]) || 30) * (schedRaw.includes('h') ? 3600e3 : 60e3), jitterPct: 20 } : atm ? { at: new Date(atm[1]).getTime() } : { cron: schedRaw };
    }
    const task = { cmd: { argv: ['sh', '-c', f.cmd.value], cwd: f.cwd.value || undefined }, restart: 'on-failure' };
    const body2 = { kind: schedule ? 'cron' : kind, name: f.name.value || 'job', context: f.ctx.value ? { payload: f.ctx.value } : null, access: { view: 'group', control: 'session' }, ...(schedule ? { schedule, action: { type: 'spawn-task', task } } : task) };
    const r = await fetchJson('/api/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body2) });
    if (r?.error) return showToast(r.error, { error: true });
    close(); onDone?.();
  };
}

export function openJobsWindow(app, opts = {}) {
  // sidebar-native since 2.357.0 (owner verdict: the window duplicated the
  // rail panel) — every entry point lands on the rail panel when it exists;
  // the window remains only for mobile / activityRail-off
  if (!opts.forceWindow && focusJobsPanel(app, opts.focusJobId)) return null;
  for (const [, w] of app.wm.windows) if (w.type === 'jobs') { app.wm.focusWindow(w.id); return w; }
  const winInfo = app.wm.createWindow({ title: t('Background Work'), type: 'jobs', syncId: opts.syncId, openSpec: { action: 'openJobs' }, width: 760, height: 540 });
  const shell = document.createElement('div'); shell.className = 'jobs-win';
  const bar = document.createElement('div'); bar.className = 'jobs-toolbar';
  const summary = document.createElement('span'); summary.className = 'jobs-summary';
  const sp = document.createElement('span'); sp.style.flex = '1';
  const btnNew = document.createElement('button'); btnNew.className = 'jobs-btn jobs-btn-ok'; btnNew.textContent = '＋ ' + t('New');
  btnNew.onclick = () => openCreateDialog(app, () => render());
  const btnRefresh = document.createElement('button'); btnRefresh.className = 'jobs-btn'; btnRefresh.textContent = '⟳';
  const seenSlot = document.createElement('span'); seenSlot.className = 'jobs-seen-slot'; // the window-wide "Mark all seen" (2.369.121), filled per render
  bar.append(summary, sp, seenSlot, btnNew, btnRefresh);
  const root = document.createElement('div'); root.className = 'jobs-body';
  shell.append(bar, root);
  winInfo.content.appendChild(shell);

  async function render() {
    const [r] = await Promise.all([fetchJson('/api/jobs'), loadFolds(app)]);
    root.textContent = '';
    if (r?.error) { const e = document.createElement('div'); e.className = 'jobs-empty'; e.style.color = 'var(--red)'; e.textContent = r.error; root.appendChild(e); return; }
    const jobs = r?.jobs || [];
    const counts = badgeCounts(jobs);
    summary.textContent = summaryText(counts, r?.held);
    summary.title = r?.held && r.held.total ? heldText(r.held, { t }) : '';
    summary.classList.toggle('jobs-summary-held', !!(r?.held && r.held.total));
    seenSlot.textContent = '';
    const seenAll = seenAllButton(ackableIds(jobs), render);
    if (seenAll) seenSlot.appendChild(seenAll);
    renderList(app, root, jobs, { compact: false, refresh: render, archivedCount: r?.archivedCount || 0 });
    const esc = await fetchJson('/api/jobs-escapes');
    if (esc && (esc.systemd?.length || esc.crontab?.length)) {
      const h = document.createElement('div'); h.className = 'jobs-sec-head jobs-sec-esc'; h.textContent = t('Outside the registry (read-only)');
      root.appendChild(h);
      for (const line of [...(esc.systemd || []), ...(esc.crontab || [])]) { const e = document.createElement('div'); e.className = 'jobs-esc-line'; e.textContent = line; root.appendChild(e); }
    }
  }
  btnRefresh.onclick = render;
  const off = app.ws.onGlobal((msg) => { if (msg.type === 'jobs-updated') render(); });
  const tick = setInterval(() => { if (!document.hidden) render(); }, 30000);
  winInfo._listenerCtl?.signal.addEventListener('abort', () => { try { off?.(); } catch { } clearInterval(tick); });
  render();
  return winInfo;
}

/** THE primary Background Work surface (2.357.0 unification): full list with
 *  inline expand + inline interaction forms, toolbar (summary / New / ⟳),
 *  registry escapes. Live updates come from sidebar-rail's jobs-updated
 *  panel rebuild (renders-once guard) — EXPANDED keeps cards open across it. */
openJobsWindow.renderRail = (app, c) => {
  const bar = document.createElement('div'); bar.className = 'jobs-rail-bar';
  const summary = document.createElement('span'); summary.className = 'jobs-summary'; summary.style.flex = '1';
  const btnNew = document.createElement('button'); btnNew.className = 'jobs-btn jobs-btn-ok'; btnNew.textContent = '＋ ' + t('New');
  const btnRefresh = document.createElement('button'); btnRefresh.className = 'jobs-btn'; btnRefresh.textContent = '⟳';
  bar.append(summary, btnNew, btnRefresh);
  const root = document.createElement('div'); root.className = 'jobs-rail-list';
  c.append(bar, root);
  const focusId = app.sidebar?._jobsFocusId || null;
  if (app.sidebar) app.sidebar._jobsFocusId = null;
  async function render() {
    const [r] = await Promise.all([fetchJson('/api/jobs'), loadFolds(app)]);
    if (!c.isConnected) return;
    root.textContent = '';
    if (r?.error) { const e = document.createElement('div'); e.className = 'jobs-empty'; e.style.color = 'var(--red)'; e.textContent = r.error; root.appendChild(e); return; }
    const jobs = r?.jobs || [];
    const counts = badgeCounts(jobs);
    summary.textContent = summaryText(counts, r?.held);
    summary.title = r?.held && r.held.total ? heldText(r.held, { t }) : '';
    summary.classList.toggle('jobs-summary-held', !!(r?.held && r.held.total));
    if (!jobs.length && !(r?.archivedCount > 0)) { const e = document.createElement('div'); e.className = 'jobs-empty'; e.textContent = t('No background jobs yet — agents register them with vibespace-job'); root.appendChild(e); return; }
    renderList(app, root, jobs, { compact: true, refresh: render, archivedCount: r?.archivedCount || 0 });
    const esc = await fetchJson('/api/jobs-escapes');
    if (!c.isConnected) return;
    if (esc && (esc.systemd?.length || esc.crontab?.length)) {
      const h = document.createElement('div'); h.className = 'jobs-sec-head jobs-sec-esc'; h.textContent = t('Outside the registry (read-only)');
      root.appendChild(h);
      for (const line of [...(esc.systemd || []), ...(esc.crontab || [])]) { const e = document.createElement('div'); e.className = 'jobs-esc-line'; e.textContent = line; root.appendChild(e); }
    }
    if (focusId) { const el = root.querySelector(`[data-job="${CSS.escape(focusId)}"]`); el?.scrollIntoView({ block: 'center' }); el?.classList.add('jobs-focus'); }
  }
  btnNew.onclick = () => openCreateDialog(app, render);
  btnRefresh.onclick = render;
  render();
};

/** Shared interaction-panel form renderer (2.357.0 extraction): one
 *  implementation behind the inline card detail AND the fallback window.
 *  `pending` = job.interaction.pending; renders blocks + submits answers. */
function renderPanelBlocks(app, root, jobId, pending, { onAnswered } = {}) {
  const version = pending.version;
  const p = pending.panel;
  const title = document.createElement('div'); title.style.cssText = 'font-weight:600;font-size:13px'; title.textContent = p.title || ''; if (title.textContent) root.appendChild(title);
  const values = {};
  for (const b of p.blocks || []) {
      if (b.type === 'md') { const el = document.createElement('div'); el.className = 'markdown-preview'; el.innerHTML = DOMPurify.sanitize(marked.parse(String(b.text || ''))); root.appendChild(el); }
      else if (b.type === 'image') { const img = document.createElement('img'); img.style.cssText = 'max-width:100%;border-radius:var(--radius-sm)'; img.src = '/api/file/raw?path=' + encodeURIComponent(b.path); root.appendChild(img); }
      else if (b.type === 'progress') { const pr = document.createElement('progress'); pr.max = 100; pr.value = Number(b.value) || 0; pr.style.width = '100%'; root.appendChild(pr); }
      else if (b.type === 'input' || b.type === 'textarea') {
        const w = document.createElement('div');
        if (b.label) { const l = document.createElement('div'); l.textContent = b.label; l.style.cssText = 'font-size:11px;color:var(--text-dim);margin-bottom:2px'; w.appendChild(l); }
        const inp = document.createElement(b.type === 'input' ? 'input' : 'textarea');
        inp.placeholder = b.placeholder || ''; inp.style.cssText = 'width:100%;box-sizing:border-box';
        inp.oninput = () => { values[b.id] = inp.value; };
        w.appendChild(inp); root.appendChild(w);
      }
      else if (b.type === 'choice') {
        const w = document.createElement('div');
        if (b.label) { const l = document.createElement('div'); l.textContent = b.label; l.style.cssText = 'font-size:11px;color:var(--text-dim)'; w.appendChild(l); }
        const sel = document.createElement('select'); sel.className = 'toolbar-select';
        for (const o of b.options) { const op = document.createElement('option'); op.value = o; op.textContent = o; sel.appendChild(op); }
        values[b.id] = b.default || b.options[0]; sel.value = values[b.id];
        sel.onchange = () => { values[b.id] = sel.value; };
        w.appendChild(sel); root.appendChild(w);
      }
      else if (b.type === 'checkbox') {
        const w = document.createElement('label'); w.style.cssText = 'display:flex;gap:6px;align-items:center';
        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.onchange = () => { values[b.id] = cb.checked; };
        const l = document.createElement('span'); l.textContent = b.label || b.id;
        w.append(cb, l); root.appendChild(w);
      }
      else if (b.type === 'buttons') {
        const w = document.createElement('div'); w.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:4px';
        for (const o of b.options) {
          const btn = document.createElement('button');
          btn.className = 'jobs-btn' + (o.style === 'primary' ? ' jobs-btn-ok' : '');
          btn.textContent = o.label || o.id;
          btn.onclick = async () => {
            const r2 = await fetchJson(`/api/jobs/${jobId}/answer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers: { ...values, button: o.id, version } }) });
            if (r2?.error) return showToast(r2.error, { error: true });
            root.textContent = '';
            const okEl = document.createElement('div'); okEl.className = 'empty-hint'; okEl.textContent = t('Submitted — the job continues.');
            root.appendChild(okEl);
            onAnswered?.();
          };
          w.appendChild(btn);
        }
        root.appendChild(w);
      }
  }
}

/** Fallback window for hosts without the rail (mobile / activityRail off) —
 *  the rail panel is the primary surface (2.357.0). */
export function openInteractWindow(app, jobId, opts = {}) {
  if (!opts.forceWindow && focusJobsPanel(app, jobId)) return null;
  const winInfo = app.wm.createWindow({ title: t('Job input'), type: 'job-interact', syncId: opts.syncId, openSpec: { action: 'openJobInteract', jobId }, width: 420, height: 420 });
  const root = document.createElement('div');
  root.style.cssText = 'height:100%;overflow:auto;padding:14px;display:flex;flex-direction:column;gap:10px';
  winInfo.content.appendChild(root);
  async function render() {
    const r = await fetchJson(`/api/jobs/${jobId}`);
    root.textContent = '';
    const job = r?.job;
    if (!job) { root.textContent = t('Job not found'); return; }
    // `winInfo.setTitle?.(…)` was a permanent no-op (the literal has no such
    // member); the MANAGER owns titles — found while fixing the same shape in
    // channel-window.js (channels r3).
    app.wm.setTitle(winInfo.id, job.name + ' — ' + t('needs your input'));
    const pending = job.interaction?.pending;
    if (!pending) { const e = document.createElement('div'); e.className = 'empty-hint'; e.textContent = t('Nothing to answer — the job continues.'); root.appendChild(e); return; }
    renderPanelBlocks(app, root, jobId, pending, { onAnswered: () => setTimeout(render, 2500) });
  }
  const off = app.ws.onGlobal((msg) => { if (msg.type === 'jobs-updated' && msg.id === jobId) render(); });
  winInfo._listenerCtl?.signal.addEventListener('abort', () => { try { off?.(); } catch { } });
  render();
  return winInfo;
}

// ── WINDOW-TYPE REGISTRATIONS (Plugin Ph1) ── no title-bar icon today (unchanged)
registerWindowType({
  type: 'jobs', label: 'Background Work', singleton: true, icon: '',
  action: 'openJobs', replay: (app, spec, { syncId } = {}) => app.openJobs({ syncId }),
});
registerWindowType({
  type: 'job-interact', label: 'Job input', icon: '',
  action: 'openJobInteract', replay: (app, spec, { syncId } = {}) => app.openJobInteract(spec.jobId, { syncId }),
});
