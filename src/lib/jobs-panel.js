// Background Work window + rail panel + Interaction Panel window (2.342.x,
// docs/design-background-work.md §9). XSS LAW: every job-record string is
// agent-/process-controlled and synced to all clients — EVERYTHING renders via
// textContent; agent markup NEVER touches our DOM (panel md → DOMPurify).
import { escHtml, fetchJson, showConfirmDialog, showToast, createModalShell } from './utils.js';
import { t } from './i18n.js';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const GLYPH = { 'awaiting-user': '⚑', failed: '✖', unverified: '?', missed: '✖', up: '●', starting: '◌', down: '○', scheduled: '◷', interrupted: '⚠', done: '✔' }; // text glyphs only — emoji ban
const SEV = { failed: 'bad', missed: 'bad', unverified: 'bad', 'awaiting-user': 'warn', interrupted: 'warn', up: 'ok', starting: 'ok', scheduled: 'idle', down: 'idle', done: 'idle' };
const KIND_ICON = {
  service: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/><circle cx="6.5" cy="7" r=".9" fill="currentColor"/><circle cx="6.5" cy="17" r=".9" fill="currentColor"/></svg>',
  task: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 5l10 7-10 7z"/></svg>',
  cron: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>',
};
const hum = (ms) => { const m = Math.round(Math.abs(ms) / 60000); return m < 1 ? '<1m' : m < 60 ? m + 'm' : m < 1440 ? Math.round(m / 60) + 'h' : Math.round(m / 1440) + 'd'; };

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
  if (act === 'panel') return openInteractWindow(app, j.id);
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

/** shared list renderer — the window (rich) and the rail panel (compact) */
function renderList(app, root, jobs, { compact, refresh }) {
  const sections = [['service', t('Services'), KIND_ICON.service], ['task', t('Tasks'), KIND_ICON.task], ['cron', t('Cron'), KIND_ICON.cron]];
  for (const [kind, label, icon] of sections) {
    const list = jobs.filter((j) => j.kind === kind);
    if (compact && !list.length) continue;
    const h = document.createElement('div');
    h.className = 'jobs-sec-head';
    h.innerHTML = icon; // static SVG constant, not user data
    const hl = document.createElement('span'); hl.textContent = ` ${label}`;
    const hc = document.createElement('span'); hc.className = 'jobs-sec-count';
    const up = list.filter((j) => ['up', 'starting', 'scheduled', 'awaiting-user'].includes(j.state)).length;
    hc.textContent = list.length ? `${up}/${list.length}` : '0';
    h.append(hl, hc);
    root.appendChild(h);
    if (!list.length) { const e = document.createElement('div'); e.className = 'jobs-empty'; e.textContent = t('none'); root.appendChild(e); continue; }
    for (const j of list) {
      const el = document.createElement('div');
      el.className = 'jobs-card jobs-sev-' + (SEV[j.state] || 'idle');
      const l1 = document.createElement('div'); l1.className = 'jobs-card-l1';
      const dot = document.createElement('span'); dot.className = 'jobs-dot'; dot.textContent = GLYPH[j.state] || '·';
      const name = document.createElement('span'); name.className = 'jobs-name'; name.textContent = j.name;
      const st = document.createElement('span'); st.className = 'jobs-state'; st.textContent = stateLine(j);
      const sp = document.createElement('span'); sp.style.flex = '1';
      l1.append(dot, name, st, sp, ...actionButtons(app, j, refresh, { compact }));
      el.appendChild(l1);
      if (!compact || j.progress) {
        const l2 = document.createElement('div'); l2.className = 'jobs-card-l2';
        if (j.progress) { const pg = document.createElement('span'); pg.className = 'jobs-chip jobs-chip-prog'; pg.textContent = j.progress; l2.appendChild(pg); }
        if (j.runsCount > 1) { const rc = document.createElement('span'); rc.className = 'jobs-chip'; rc.textContent = '×' + j.runsCount; l2.appendChild(rc); }
        for (const p of j.ports || []) { const c = document.createElement('span'); c.className = 'jobs-chip'; c.textContent = ':' + p; l2.appendChild(c); }
        if (j.publishedUrl) { const u = document.createElement('button'); u.className = 'jobs-chip jobs-chip-url'; u.textContent = '↗ ' + j.publishedUrl.replace(/^https?:\/\//, ''); u.onclick = (ev) => { ev.stopPropagation(); app.openBrowser?.(j.publishedUrl) || window.open(j.publishedUrl); }; l2.appendChild(u); }
        for (const g of (j.owner?.groups || []).slice(0, 2)) { const c = document.createElement('span'); c.className = 'jobs-chip jobs-chip-grp'; c.textContent = g; l2.appendChild(c); }
        if (!compact && j.context?.payload) { const cx = document.createElement('span'); cx.className = 'jobs-ctx'; cx.textContent = j.context.payload.split('\n')[0].slice(0, 90); l2.appendChild(cx); }
        if (l2.childNodes.length) el.appendChild(l2);
      }
      if (compact) el.onclick = () => openJobsWindow(app);
      else el.onclick = () => el.classList.contains('jobs-open') ? (el.classList.remove('jobs-open'), el.querySelector('.jobs-detail')?.remove()) : expandDetail(app, el, j, refresh);
      root.appendChild(el);
    }
  }
}

async function expandDetail(app, el, j, refresh) {
  el.classList.add('jobs-open');
  const d = document.createElement('div');
  d.className = 'jobs-detail';
  d.onclick = (e) => e.stopPropagation();
  el.appendChild(d);
  const r = await fetchJson(`/api/jobs/${j.id}?tail=60`);
  const job = r?.job; if (!job) return;
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
  for (const [, w] of app.wm.windows) if (w.type === 'jobs') { app.wm.focusWindow(w.id); return w; }
  const winInfo = app.wm.createWindow({ title: t('Background Work'), type: 'jobs', syncId: opts.syncId, openSpec: { action: 'openJobs' }, width: 760, height: 540 });
  const shell = document.createElement('div'); shell.className = 'jobs-win';
  const bar = document.createElement('div'); bar.className = 'jobs-toolbar';
  const summary = document.createElement('span'); summary.className = 'jobs-summary';
  const sp = document.createElement('span'); sp.style.flex = '1';
  const btnNew = document.createElement('button'); btnNew.className = 'jobs-btn jobs-btn-ok'; btnNew.textContent = '＋ ' + t('New');
  btnNew.onclick = () => openCreateDialog(app, () => render());
  const btnRefresh = document.createElement('button'); btnRefresh.className = 'jobs-btn'; btnRefresh.textContent = '⟳';
  bar.append(summary, sp, btnNew, btnRefresh);
  const root = document.createElement('div'); root.className = 'jobs-body';
  shell.append(bar, root);
  winInfo.content.appendChild(shell);

  async function render() {
    const r = await fetchJson('/api/jobs');
    root.textContent = '';
    if (r?.error) { const e = document.createElement('div'); e.className = 'jobs-empty'; e.style.color = 'var(--red)'; e.textContent = r.error; root.appendChild(e); return; }
    const jobs = r?.jobs || [];
    const live = jobs.filter((j) => ['up', 'starting'].includes(j.state)).length;
    const bad = jobs.filter((j) => ['failed', 'missed', 'unverified'].includes(j.state)).length;
    const ask = jobs.filter((j) => j.state === 'awaiting-user').length;
    summary.textContent = `${live} ${t('running')}${bad ? ` · ${bad} ${t('failed')}` : ''}${ask ? ` · ${ask} ${t('awaiting you')}` : ''}`;
    renderList(app, root, jobs, { compact: false, refresh: render });
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

/** compact rail panel renderer (sidebar-rail delegates here) */
openJobsWindow.renderRail = (app, c) => {
  const bar = document.createElement('div'); bar.className = 'jobs-rail-bar';
  const btn = document.createElement('button'); btn.className = 'jobs-btn'; btn.textContent = t('Open window');
  btn.onclick = () => openJobsWindow(app);
  bar.appendChild(btn);
  const root = document.createElement('div'); root.className = 'jobs-rail-list';
  c.append(bar, root);
  (async () => {
    const r = await fetchJson('/api/jobs');
    if (!c.isConnected) return;
    const jobs = r?.jobs || [];
    if (!jobs.length) { const e = document.createElement('div'); e.className = 'jobs-empty'; e.textContent = t('No background jobs yet — agents register them with vibespace-job'); root.appendChild(e); return; }
    renderList(app, root, jobs, { compact: true, refresh: () => { c.textContent = ''; openJobsWindow.renderRail(app, c); } });
  })();
};

export function openInteractWindow(app, jobId, opts = {}) {
  const winInfo = app.wm.createWindow({ title: t('Job input'), type: 'job-interact', syncId: opts.syncId, openSpec: { action: 'openJobInteract', jobId }, width: 420, height: 420 });
  const root = document.createElement('div');
  root.style.cssText = 'height:100%;overflow:auto;padding:14px;display:flex;flex-direction:column;gap:10px';
  winInfo.content.appendChild(root);
  let version = null;
  async function render() {
    const r = await fetchJson(`/api/jobs/${jobId}`);
    root.textContent = '';
    const job = r?.job;
    if (!job) { root.textContent = t('Job not found'); return; }
    winInfo.setTitle?.(job.name + ' — ' + t('needs your input'));
    const pending = job.interaction?.pending;
    if (!pending) { const e = document.createElement('div'); e.className = 'empty-hint'; e.textContent = t('Nothing to answer — the job continues.'); root.appendChild(e); return; }
    version = pending.version;
    const p = pending.panel;
    const title = document.createElement('div'); title.style.cssText = 'font-weight:600;font-size:14px'; title.textContent = p.title || job.name; root.appendChild(title);
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
            setTimeout(() => render(), 2500);
          };
          w.appendChild(btn);
        }
        root.appendChild(w);
      }
    }
  }
  const off = app.ws.onGlobal((msg) => { if (msg.type === 'jobs-updated' && msg.id === jobId) render(); });
  winInfo._listenerCtl?.signal.addEventListener('abort', () => { try { off?.(); } catch { } });
  render();
  return winInfo;
}
