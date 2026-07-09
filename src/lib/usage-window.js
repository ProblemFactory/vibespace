// Usage window — a dashboard over the permanent per-request token ledger
// (/api/usage-stats). Many analysis cuts: totals, daily trend, billing category
// (subscription vs API — never mixed), account, model, project, mode, cache
// efficiency, hour/weekday activity, top sessions. Opened from ⚙ → Usage.
import { t } from './i18n.js';
import { escHtml, fetchJson, showToast, copyText } from './utils.js';

const DAY = 86400000;
const RANGES = [
  { key: '7d', label: () => t('7 days'), ms: 7 * DAY },
  { key: '30d', label: () => t('30 days'), ms: 30 * DAY },
  { key: '90d', label: () => t('90 days'), ms: 90 * DAY },
  { key: 'all', label: () => t('All time'), ms: null },
];

const fmtNum = (n) => {
  n = n || 0;
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(Math.round(n));
};
const fmtCost = (n) => '$' + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (r) => (Math.round((r || 0) * 1000) / 10) + '%';

export function openUsageWindow(app, opts = {}) {
  const existing = [...app.wm.windows.values()].find(w => w.type === 'usage');
  if (existing) { if (existing.isMinimized) app.wm.restore?.(existing.id); app.wm.focusWindow(existing.id); return existing; }
  const winInfo = app.wm.createWindow({
    title: t('Usage'), type: 'usage', width: 860, height: 640,
    openSpec: opts.syncId ? undefined : { action: 'openUsage' },
    syncId: opts.syncId,
  });
  const root = document.createElement('div');
  root.className = 'usage-win';
  winInfo.content.appendChild(root);

  const state = { range: '30d', backend: '', metric: 'cost', data: null, loading: false };

  const load = async () => {
    state.loading = true; render();
    const r = RANGES.find(x => x.key === state.range);
    const from = r && r.ms ? (Date.now() - r.ms) : '';
    const qs = new URLSearchParams();
    if (from) qs.set('from', String(from));
    if (state.backend) qs.set('backend', state.backend);
    try { state.data = await fetchJson('/api/usage-stats?' + qs.toString()); }
    catch { state.data = null; showToast(t('Could not load usage'), { type: 'error' }); }
    state.loading = false; render();
  };

  const render = () => {
    root.innerHTML = '';
    root.appendChild(renderControls(app, state, load));
    const body = document.createElement('div'); body.className = 'usage-body';
    root.appendChild(body);
    if (state.loading && !state.data) { body.innerHTML = `<div class="usage-empty">${t('Loading…')}</div>`; return; }
    const d = state.data;
    if (!d || !d.totals || !d.totals.requests) {
      body.innerHTML = `<div class="usage-empty">${t('No usage recorded yet for this range. Run some sessions, then re-open this window.')}</div>`;
      return;
    }
    body.appendChild(renderTiles(d));
    body.appendChild(renderTrend(d, state));
    body.appendChild(sectionGrid([
      renderBilling(d),
      renderGroup(t('By account'), d.groups.account, state, { badge: true }),
      renderGroup(t('By model'), d.groups.model, state, {}),
      renderCache(d),
      renderGroup(t('By project'), d.groups.project, state, { path: true }),
      renderGroup(t('By mode'), d.groups.mode, state, { small: true }),
      renderHours(d),
      renderWeekdays(d),
      renderGroup(t('Top sessions'), d.groups.session, state, { session: true, limit: 12 }),
    ]));
    body.appendChild(renderFooter(d));
  };

  winInfo._reloadUsage = load;
  load();
  return winInfo;
}

function renderControls(app, state, load) {
  const bar = document.createElement('div'); bar.className = 'usage-controls';
  const seg = (items, cur, onPick) => {
    const wrap = document.createElement('div'); wrap.className = 'usage-seg';
    for (const it of items) {
      const b = document.createElement('button');
      b.className = 'usage-seg-btn' + (it.key === cur ? ' on' : '');
      b.textContent = typeof it.label === 'function' ? it.label() : it.label;
      b.onclick = () => onPick(it.key);
      wrap.appendChild(b);
    }
    return wrap;
  };
  bar.appendChild(labelled(t('Range'), seg(RANGES, state.range, k => { state.range = k; load(); })));
  bar.appendChild(labelled(t('Backend'), seg([
    { key: '', label: t('All') }, { key: 'claude', label: 'Claude' }, { key: 'codex', label: 'Codex' },
  ], state.backend, k => { state.backend = k; load(); })));
  bar.appendChild(labelled(t('Bars show'), seg([
    { key: 'cost', label: t('Cost') }, { key: 'totalTokens', label: t('Tokens') },
  ], state.metric, k => { state.metric = k; load(); })));
  const spacer = document.createElement('div'); spacer.style.flex = '1'; bar.appendChild(spacer);
  const csv = document.createElement('button'); csv.className = 'usage-btn'; csv.textContent = t('Export CSV');
  csv.onclick = () => exportCsv(state.data);
  const refresh = document.createElement('button'); refresh.className = 'usage-btn'; refresh.textContent = t('Refresh');
  refresh.onclick = load;
  bar.append(csv, refresh);
  return bar;
}
function labelled(label, el) {
  const w = document.createElement('div'); w.className = 'usage-ctl';
  const l = document.createElement('span'); l.className = 'usage-ctl-label'; l.textContent = label;
  w.append(l, el); return w;
}

function renderTiles(d) {
  const T = d.totals;
  const wrap = document.createElement('div'); wrap.className = 'usage-tiles';
  const tile = (label, value, sub, accent) => `<div class="usage-tile${accent ? ' accent' : ''}"><div class="usage-tile-v">${value}</div><div class="usage-tile-l">${label}</div>${sub ? `<div class="usage-tile-s">${sub}</div>` : ''}</div>`;
  wrap.innerHTML = [
    tile(t('Est. API-equivalent cost'), fmtCost(T.cost), t('subscriptions are plan-covered'), true),
    tile(t('Total tokens'), fmtNum(T.totalTokens), `${fmtNum(T.output)} ${t('output')}`),
    tile(t('Cache hit ratio'), fmtPct(T.cacheHitRatio), `${fmtNum(T.cacheRead)} ${t('cached reads')}`),
    tile(t('Requests'), fmtNum(T.requests), `${fmtNum(T.sessions)} ${t('sessions')}`),
    tile(t('Fresh input'), fmtNum(T.input), t('non-cached')),
    tile(t('Cache writes'), fmtNum(T.cacheWrite), `${fmtNum(T.cacheWrite1h || 0)} 1h`),
  ].join('');
  return wrap;
}

// Daily trend as a canvas bar chart (cost or tokens).
function renderTrend(d, state) {
  const sec = section(t('Daily trend'));
  const series = d.series || [];
  const metricKey = state.metric;
  const canvas = document.createElement('canvas'); canvas.className = 'usage-canvas';
  sec.appendChild(canvas);
  requestAnimationFrame(() => drawBars(canvas, series, metricKey));
  return sec;
}
function drawBars(canvas, series, metricKey) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 780, h = 160;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  if (!series.length) return;
  const vals = series.map(s => metricKey === 'cost' ? s.cost : s.totalTokens);
  const max = Math.max(...vals, 1);
  const css = getComputedStyle(document.documentElement);
  const accent = css.getPropertyValue('--accent').trim() || '#7c5cff';
  const dim = css.getPropertyValue('--text-dim').trim() || '#888';
  const pad = 22, bw = Math.max(1, (w - 8) / series.length - 1.5);
  ctx.font = '9px system-ui';
  series.forEach((s, i) => {
    const v = vals[i];
    const bh = Math.max(1, (v / max) * (h - pad - 14));
    const x = 4 + i * ((w - 8) / series.length);
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(x, h - pad - bh, bw, bh);
  });
  ctx.globalAlpha = 1; ctx.fillStyle = dim;
  // sparse date labels (first, mid, last)
  const marks = [0, Math.floor(series.length / 2), series.length - 1];
  for (const i of marks) {
    if (!series[i]) continue;
    const x = 4 + i * ((w - 8) / series.length);
    ctx.fillText(series[i].key.slice(5), Math.min(x, w - 30), h - 6);
  }
  ctx.textAlign = 'right'; ctx.fillText(metricKey === 'cost' ? fmtCost(max) : fmtNum(max), w - 2, 10); ctx.textAlign = 'left';
}

const BILLING_META = {
  'subscription': { label: () => t('Claude subscription'), cls: 'sub' },
  'api-key': { label: () => t('API key (pay-per-use)'), cls: 'api' },
  'chatgpt': { label: () => t('ChatGPT (Codex)'), cls: 'sub' },
  'cli-global-login': { label: () => t('CLI global login (unattributed)'), cls: 'global' },
  'unknown-account': { label: () => t('Unknown account'), cls: 'global' },
};
function renderBilling(d) {
  const sec = section(t('By billing type'));
  const note = document.createElement('div'); note.className = 'usage-note';
  note.textContent = t('Subscription vs API key are kept separate — subscription usage is covered by your plan; the cost shown is the API-equivalent for reference.');
  sec.appendChild(note);
  const rows = d.groups.billing || [];
  const max = Math.max(...rows.map(r => r.cost), 1);
  for (const r of rows) {
    const m = BILLING_META[r.key] || { label: () => r.key, cls: 'global' };
    sec.appendChild(barRow(m.label(), r, max, 'cost', { cls: 'bill-' + m.cls }));
  }
  return sec;
}

function renderGroup(title, rows, state, opts = {}) {
  const sec = section(title);
  const list = (rows || []).slice(0, opts.limit || 10);
  if (!list.length) { sec.appendChild(emptyLine()); return sec; }
  const metric = state.metric;
  const max = Math.max(...list.map(r => metric === 'cost' ? r.cost : r.totalTokens), 1);
  for (const r of list) {
    let label = r.key;
    if (opts.badge && r.name) label = r.name;
    if (opts.path && r.key !== 'unknown') label = r.key.split('/').slice(-2).join('/');
    if (opts.session) label = (app_sessionName(r.key)) || r.key.slice(0, 8);
    const badge = opts.badge && r.type ? typeBadge(r.type, r.deleted) : '';
    sec.appendChild(barRow(label, r, max, metric, { badge, title: opts.path ? r.key : (opts.session ? r.key : label) }));
  }
  return sec;
}
function app_sessionName() { return null; } // session names not resolved server-side yet

function renderCache(d) {
  const sec = section(t('Cache efficiency'));
  const T = d.totals;
  const parts = [
    { k: t('Cached reads'), v: T.cacheRead, c: 'var(--green,#3fb950)' },
    { k: t('Cache writes'), v: T.cacheWrite, c: 'var(--yellow,#e5c07b)' },
    { k: t('Fresh input'), v: T.input, c: 'var(--red,#e55)' },
  ];
  const tot = parts.reduce((s, p) => s + p.v, 0) || 1;
  const bar = document.createElement('div'); bar.className = 'usage-stack';
  bar.innerHTML = parts.map(p => `<span class="usage-stack-seg" style="width:${(p.v / tot * 100).toFixed(1)}%;background:${p.c}" title="${p.k}: ${fmtNum(p.v)} (${fmtPct(p.v / tot)})"></span>`).join('');
  sec.appendChild(bar);
  const legend = document.createElement('div'); legend.className = 'usage-legend';
  legend.innerHTML = parts.map(p => `<span class="usage-legend-item"><span class="usage-legend-dot" style="background:${p.c}"></span>${p.k} <b>${fmtPct(p.v / tot)}</b></span>`).join('');
  sec.appendChild(legend);
  const note = document.createElement('div'); note.className = 'usage-note';
  note.textContent = t('A high cached-read share means prompt caching is working — those tokens bill at ~10% of fresh input.');
  sec.appendChild(note);
  return sec;
}

function renderHours(d) {
  const sec = section(t('By hour of day'));
  const rows = d.groups.hour || [];
  const by = {}; for (const r of rows) by[+r.key] = r;
  const max = Math.max(...rows.map(r => r.totalTokens), 1);
  const grid = document.createElement('div'); grid.className = 'usage-hours';
  for (let hEl = 0; hEl < 24; hEl++) {
    const r = by[hEl]; const v = r ? r.totalTokens : 0;
    const cell = document.createElement('div'); cell.className = 'usage-hour';
    cell.style.setProperty('--f', (v / max).toFixed(3));
    cell.title = `${hEl}:00 — ${fmtNum(v)} ${t('tokens')}, ${fmtCost(r ? r.cost : 0)}`;
    if (hEl % 6 === 0) cell.dataset.h = hEl + 'h';
    grid.appendChild(cell);
  }
  sec.appendChild(grid);
  return sec;
}
function renderWeekdays(d) {
  const sec = section(t('By weekday'));
  const names = [t('Sun'), t('Mon'), t('Tue'), t('Wed'), t('Thu'), t('Fri'), t('Sat')];
  const rows = d.groups.weekday || [];
  const by = {}; for (const r of rows) by[+r.key] = r;
  const max = Math.max(...rows.map(r => r.totalTokens), 1);
  for (let i = 0; i < 7; i++) {
    const r = by[i] || { totalTokens: 0, cost: 0, requests: 0 };
    sec.appendChild(barRow(names[i], r, max, 'totalTokens', { small: true }));
  }
  return sec;
}

function renderFooter(d) {
  const f = document.createElement('div'); f.className = 'usage-footer';
  const from = d.range?.from ? new Date(d.range.from).toISOString().slice(0, 10) : '—';
  const to = d.range?.to ? new Date(d.range.to).toISOString().slice(0, 10) : '—';
  f.innerHTML = `<span>${t('Data range: {from} → {to}', { from, to })}</span>
    <span>${t('Cost is an estimate (API-equivalent) — subscriptions are plan-covered. Prices editable in data/usage-history/pricing.json.')}</span>`;
  return f;
}

// ── small builders ──
function section(title) {
  const s = document.createElement('div'); s.className = 'usage-section';
  const h = document.createElement('div'); h.className = 'usage-section-title'; h.textContent = title;
  s.appendChild(h); return s;
}
function sectionGrid(sections) {
  const g = document.createElement('div'); g.className = 'usage-grid';
  for (const s of sections) g.appendChild(s);
  return g;
}
function barRow(label, r, max, metric, opts = {}) {
  const v = metric === 'cost' ? r.cost : r.totalTokens;
  const row = document.createElement('div'); row.className = 'usage-bar-row' + (opts.small ? ' small' : '');
  const pct = Math.max(1, (v / max) * 100);
  const valStr = metric === 'cost' ? fmtCost(r.cost) : fmtNum(r.totalTokens);
  row.innerHTML = `
    <span class="usage-bar-label" title="${escHtml(opts.title || label)}">${opts.badge || ''}${escHtml(label)}</span>
    <span class="usage-bar-track"><span class="usage-bar-fill ${opts.cls || ''}" style="width:${pct.toFixed(1)}%"></span></span>
    <span class="usage-bar-val">${valStr}</span>`;
  if (r.requests != null) row.querySelector('.usage-bar-val').title = `${fmtNum(r.totalTokens)} ${t('tokens')} · ${r.requests} ${t('req')} · ${fmtCost(r.cost)}`;
  return row;
}
function typeBadge(type, deleted) {
  const map = { subscription: ['sub', t('sub')], 'codex-subscription': ['sub', t('ChatGPT')], api: ['api', t('API')], global: ['global', t('global')], unknown: ['global', '?'] };
  const [cls, lab] = map[type] || ['global', type];
  return `<span class="usage-type-badge ${cls}">${escHtml(lab)}${deleted ? ' ✕' : ''}</span>`;
}
function emptyLine() { const e = document.createElement('div'); e.className = 'usage-note'; e.textContent = t('No data'); return e; }

function exportCsv(d) {
  if (!d) return;
  const lines = [['dimension', 'key', 'name', 'type', 'requests', 'sessions', 'input', 'cacheWrite', 'cacheRead', 'output', 'totalTokens', 'estCost'].join(',')];
  for (const [dim, rows] of Object.entries(d.groups || {})) {
    for (const r of rows) {
      lines.push([dim, csvq(r.key), csvq(r.name || ''), r.type || '', r.requests, r.sessions, r.input, r.cacheWrite, r.cacheRead, r.output, r.totalTokens, r.cost.toFixed(4)].join(','));
    }
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'vibespace-usage.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function csvq(s) { s = String(s == null ? '' : s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
