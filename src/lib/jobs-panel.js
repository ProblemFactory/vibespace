// Background Work window + Interaction Panel window (2.342.0,
// docs/design-background-work.md §9). XSS LAW: every job-record string
// (names, notes, progress, payloads, log tails, panel text) is agent- or
// process-controlled and synced to all clients — EVERYTHING renders via
// textContent/escHtml; agent markup NEVER touches our DOM (panel blocks are
// declarative widgets rendered by us; md goes through DOMPurify).
import { escHtml, fetchJson, showConfirmDialog, showToast } from './utils.js';
import { t } from './i18n.js';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const GLYPH = { 'awaiting-user': '✋', failed: '✖', unverified: '?', missed: '✖', up: '●', starting: '◌', down: '○', scheduled: '⏰', interrupted: '⚠', done: '✔' };
const COLOR = { up: 'var(--green)', starting: 'var(--yellow)', 'awaiting-user': 'var(--yellow)', failed: 'var(--red)', missed: 'var(--red)', unverified: 'var(--red)', down: 'var(--text-dim)', scheduled: 'var(--accent)', interrupted: 'var(--yellow)', done: 'var(--text-dim)' };
const hum = (ms) => { const m = Math.round(Math.abs(ms) / 60000); return m < 1 ? '<1m' : m < 60 ? m + 'm' : m < 1440 ? Math.round(m / 60) + 'h' : Math.round(m / 1440) + 'd'; };

export function openJobsWindow(app, opts = {}) {
  for (const [, w] of app.wm.windows) if (w.type === 'jobs') { app.wm.focusWindow(w.id); return w; }
  const winInfo = app.wm.createWindow({ title: t('Background Work'), type: 'jobs', syncId: opts.syncId, openSpec: { action: 'openJobs' }, width: 720, height: 520 });
  const root = document.createElement('div');
  root.style.cssText = 'height:100%;overflow:auto;padding:10px 12px;font-size:12px';
  winInfo.content.appendChild(root);
  let detail = null; // job id whose detail is expanded

  async function render() {
    const r = await fetchJson('/api/jobs');
    root.textContent = '';
    if (r?.error) { const e = document.createElement('div'); e.className = 'empty-hint'; e.style.color = 'var(--red)'; e.textContent = r.error; root.appendChild(e); return; }
    const jobs = r?.jobs || [];
    const sections = [['service', t('Services')], ['task', t('Tasks')], ['cron', t('Cron')]];
    for (const [kind, label] of sections) {
      const list = jobs.filter((j) => j.kind === kind);
      const h = document.createElement('div');
      h.style.cssText = 'font-weight:600;margin:10px 0 4px;color:var(--text-dim);text-transform:uppercase;font-size:10px;letter-spacing:.06em';
      h.textContent = `${label} · ${list.length}`;
      root.appendChild(h);
      if (!list.length) { const e = document.createElement('div'); e.style.cssText = 'color:var(--text-dim);padding:2px 0 6px'; e.textContent = t('none'); root.appendChild(e); continue; }
      for (const j of list) root.appendChild(row(j));
    }
    // escapes (read-only visibility of hand-rolled systemd/crontab jobs)
    const esc = await fetchJson('/api/jobs-escapes');
    if (esc && (esc.systemd?.length || esc.crontab?.length)) {
      const h = document.createElement('div');
      h.style.cssText = 'font-weight:600;margin:14px 0 4px;color:var(--text-dim);font-size:10px;text-transform:uppercase;letter-spacing:.06em';
      h.textContent = t('Outside the registry (read-only)');
      root.appendChild(h);
      for (const line of [...(esc.systemd || []), ...(esc.crontab || [])]) {
        const e = document.createElement('div'); e.style.cssText = 'color:var(--text-dim);font-family:monospace;font-size:11px'; e.textContent = line; root.appendChild(e);
      }
    }
  }

  function row(j) {
    const el = document.createElement('div');
    el.style.cssText = 'padding:6px 8px;border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:6px;cursor:pointer';
    const l1 = document.createElement('div');
    l1.style.cssText = 'display:flex;align-items:center;gap:8px';
    const dot = document.createElement('span'); dot.textContent = GLYPH[j.state] || '·'; dot.style.color = COLOR[j.state] || 'var(--text)';
    const name = document.createElement('span'); name.textContent = j.name; name.style.fontWeight = '600';
    const st = document.createElement('span'); st.style.color = 'var(--text-dim)';
    const run = j.run || {};
    st.textContent = j.state + (run.startedAt && !run.endedAt ? ' · ' + hum(Date.now() - run.startedAt) : run.endedAt ? ' · ' + hum(Date.now() - run.endedAt) + ' ago' : '') + (j.nextFireAt ? ' · ' + t('next') + ' ~' + hum(j.nextFireAt - Date.now()) : '');
    const spacer = document.createElement('span'); spacer.style.flex = '1';
    l1.append(dot, name, st, spacer);
    for (const [label, act, when] of [[t('Open panel'), 'panel', j.pendingPanel], [t('Start'), 'start', ['down', 'failed', 'missed'].includes(j.state) || (j.kind === 'cron' && !j.desiredUp)], [t('Stop'), 'stop', ['up', 'starting', 'awaiting-user'].includes(j.state) || (j.kind === 'cron' && j.desiredUp && j.state === 'scheduled')], ['🗑', 'rm', ['done', 'interrupted', 'failed', 'missed'].includes(j.state)]]) {
      if (!when) continue;
      const b = document.createElement('button'); b.className = 'file-tool-btn media-btn'; b.textContent = label;
      b.onclick = async (ev) => {
        ev.stopPropagation();
        if (act === 'panel') return openInteractWindow(app, j.id);
        if (act === 'rm' && !(await showConfirmDialog({ title: t('Remove job'), message: t('Remove {name} and its run history?', { name: j.name }), confirmText: t('Remove'), danger: true }))) return;
        const r = await fetchJson(`/api/jobs/${j.id}/${act === 'panel' ? '' : act}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        if (r?.error) showToast(r.error, { error: true });
        render();
      };
      l1.appendChild(b);
    }
    const l2 = document.createElement('div');
    l2.style.cssText = 'color:var(--text-dim);margin-top:2px;font-size:11px';
    l2.textContent = [j.progress ? '「' + j.progress + '」' : '', j.context?.payload ? j.context.payload.split('\n')[0].slice(0, 80) : '', (j.ports || []).length ? ':' + j.ports.join(' :') : ''].filter(Boolean).join(' — ') || j.id;
    el.append(l1, l2);
    if (detail === j.id) el.appendChild(detailView(j));
    el.onclick = () => { detail = detail === j.id ? null : j.id; render(); };
    return el;
  }

  function detailView(j) {
    const d = document.createElement('div');
    d.style.cssText = 'margin-top:6px;border-top:1px solid var(--border);padding-top:6px;cursor:default';
    d.onclick = (e) => e.stopPropagation();
    (async () => {
      const r = await fetchJson(`/api/jobs/${j.id}?tail=60`);
      if (!r?.job) return;
      const job = r.job;
      const meta = document.createElement('div'); meta.style.cssText = 'font-family:monospace;font-size:11px;color:var(--text-dim)';
      meta.textContent = `${job.id} · ${t('created')} ${new Date(job.createdAt).toLocaleString()} · ${(job.owner?.groups || []).join(',') || t('no group')}`;
      d.appendChild(meta);
      if (job.context?.payload) { const c = document.createElement('pre'); c.style.cssText = 'white-space:pre-wrap;background:var(--bg-panel);padding:6px;border-radius:var(--radius-sm);font-size:11px'; c.textContent = job.context.payload; d.appendChild(c); }
      // access row (user lock)
      const acc = document.createElement('div'); acc.style.cssText = 'display:flex;gap:8px;align-items:center;margin:4px 0';
      for (const dim of ['view', 'control']) {
        const lbl = document.createElement('span'); lbl.textContent = t(dim === 'view' ? 'view' : 'control') + ':'; lbl.style.color = 'var(--text-dim)';
        const sel = document.createElement('select'); sel.className = 'toolbar-select';
        for (const v of ['session', 'group', 'all']) { const o = document.createElement('option'); o.value = v; o.textContent = v; if ((job.access || {})[dim] === v) o.selected = true; sel.appendChild(o); }
        sel.onchange = async () => { const r2 = await fetchJson(`/api/jobs/${j.id}/access`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [dim]: sel.value }) }); if (r2?.error) showToast(r2.error, { error: true }); };
        acc.append(lbl, sel);
      }
      const lock = document.createElement('button'); lock.className = 'file-tool-btn media-btn';
      const setLockLabel = () => { lock.textContent = (job.access?.lockedBy === 'user' ? '🔒 ' : '🔓 ') + t(job.access?.lockedBy === 'user' ? 'locked by you' : 'agents may change'); };
      setLockLabel();
      lock.onclick = async () => { const r2 = await fetchJson(`/api/jobs/${j.id}/access`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lock: job.access?.lockedBy !== 'user' }) }); if (!r2?.error) { job.access = r2.access; setLockLabel(); } };
      acc.appendChild(lock);
      d.appendChild(acc);
      // runs ring
      for (const run of (job.runs || []).slice(-6).reverse()) {
        const rr = document.createElement('div'); rr.style.cssText = 'font-family:monospace;font-size:11px;color:var(--text-dim)';
        rr.textContent = `${new Date(run.startedAt).toLocaleString()} · ${run.endedAt ? hum(run.endedAt - run.startedAt) : t('running')} · exit=${run.exit ?? '—'} ${run.cause || ''} (${run.trigger})`;
        d.appendChild(rr);
      }
      if (job.logTail) { const lt = document.createElement('pre'); lt.style.cssText = 'white-space:pre-wrap;max-height:200px;overflow:auto;background:var(--bg-panel);padding:6px;border-radius:var(--radius-sm);font-size:10px'; lt.textContent = job.logTail; d.appendChild(lt); }
    })();
    return d;
  }

  const off = app.ws.onGlobal((msg) => { if (msg.type === 'jobs-updated') render(); });
  const tick = setInterval(() => { if (!document.hidden) render(); }, 30000);
  winInfo._listenerCtl?.signal.addEventListener('abort', () => { try { off?.(); } catch { } clearInterval(tick); });
  render();
  return winInfo;
}

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
          btn.className = 'file-tool-btn media-btn' + (o.style === 'primary' ? ' active' : '');
          btn.textContent = o.label || o.id;
          btn.onclick = async () => {
            const r2 = await fetchJson(`/api/jobs/${jobId}/answer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers: { ...values, button: o.id, version } }) });
            if (r2?.error) return showToast(r2.error, { error: true });
            root.textContent = '';
            const okEl = document.createElement('div'); okEl.className = 'empty-hint'; okEl.textContent = t('Submitted — the job continues.');
            root.appendChild(okEl);
            setTimeout(() => { const stillOpen = app.wm.windows.has?.(winInfo.id) ?? true; if (stillOpen) render(); }, 2500);
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
