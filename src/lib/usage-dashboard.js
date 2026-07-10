import { escHtml, createPopover, showContextMenu } from './utils.js';
import { t } from './i18n.js';

/**
 * Configurable usage dashboard (2.96.0) — Grafana/Posthog-style panels over
 * the /api/usage-stats aggregation. A panel = METRIC × DIMENSION × CHART:
 * every dimension group returns rows with the same numeric fields, so one
 * fetch (owned by usage-window) feeds every panel. Config persists in the
 * settings store ('usage.dashboard') → synced across clients like all
 * settings. Charts are dependency-free (canvas/conic-gradient/DOM rows),
 * matching the project's no-framework stance.
 */

export const METRICS = () => ([
  { key: 'cost', label: t('Est. cost'), fmt: fmtCost },
  { key: 'requests', label: t('Requests'), fmt: fmtNum },
  { key: 'totalTokens', label: t('Total tokens'), fmt: fmtTok },
  { key: 'output', label: t('Output tokens'), fmt: fmtTok },
  { key: 'input', label: t('Fresh input tokens'), fmt: fmtTok },
  { key: 'cacheRead', label: t('Cache read tokens'), fmt: fmtTok },
  { key: 'cacheWrite', label: t('Cache write tokens'), fmt: fmtTok },
  { key: 'cacheHitRatio', label: t('Cache hit ratio'), fmt: fmtPct },
  { key: 'sessions', label: t('Sessions'), fmt: fmtNum },
]);

export const DIMENSIONS = () => ([
  { key: 'total', label: t('Total (no grouping)') },
  { key: 'day', label: t('Day'), seq: true },
  { key: 'model', label: t('Model') },
  { key: 'account', label: t('Account') },
  { key: 'billing', label: t('Billing type') },
  { key: 'project', label: t('Project') },
  { key: 'mode', label: t('Mode') },
  { key: 'host', label: t('Host') },
  { key: 'hour', label: t('Hour of day'), seq: true },
  { key: 'weekday', label: t('Weekday'), seq: true },
  { key: 'session', label: t('Session') },
]);

export const CHARTS = () => ([
  { key: 'stat', label: t('Big number') },
  { key: 'bars', label: t('Bar rows') },
  { key: 'line', label: t('Line') },
  { key: 'pie', label: t('Donut') },
  { key: 'table', label: t('Table') },
]);

// Preset dashboards — the starting points users tweak from.
export const PRESETS = () => ({
  overview: {
    label: t('Cost overview'),
    panels: [
      { metric: 'cost', dim: 'total', chart: 'stat', span: 1 },
      { metric: 'requests', dim: 'total', chart: 'stat', span: 1 },
      { metric: 'cost', dim: 'day', chart: 'line', span: 2 },
      { metric: 'cost', dim: 'model', chart: 'pie', span: 1 },
      { metric: 'cost', dim: 'account', chart: 'bars', span: 1 },
      { metric: 'cost', dim: 'project', chart: 'bars', span: 2, topN: 10 },
    ],
  },
  tokens: {
    label: t('Token throughput'),
    panels: [
      { metric: 'totalTokens', dim: 'total', chart: 'stat', span: 1 },
      { metric: 'cacheHitRatio', dim: 'total', chart: 'stat', span: 1 },
      { metric: 'totalTokens', dim: 'day', chart: 'line', span: 2 },
      { metric: 'output', dim: 'model', chart: 'bars', span: 1 },
      { metric: 'cacheRead', dim: 'model', chart: 'bars', span: 1 },
      { metric: 'cacheHitRatio', dim: 'day', chart: 'line', span: 2 },
    ],
  },
  accounts: {
    label: t('Account reconciliation'),
    panels: [
      { metric: 'cost', dim: 'billing', chart: 'pie', span: 1 },
      { metric: 'cost', dim: 'account', chart: 'pie', span: 1 },
      { metric: 'cost', dim: 'account', chart: 'table', span: 2, topN: 12 },
      { metric: 'requests', dim: 'account', chart: 'bars', span: 2 },
    ],
  },
  rhythm: {
    label: t('Time patterns'),
    panels: [
      { metric: 'requests', dim: 'hour', chart: 'bars', span: 1 },
      { metric: 'requests', dim: 'weekday', chart: 'bars', span: 1 },
      { metric: 'cost', dim: 'day', chart: 'line', span: 2 },
      { metric: 'requests', dim: 'session', chart: 'table', span: 2, topN: 10 },
    ],
  },
});

const fmtCost = (v) => '$' + (Number(v) || 0).toFixed(2);
const fmtNum = (v) => (Number(v) || 0).toLocaleString();
const fmtTok = (v) => {
  v = Number(v) || 0;
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'k';
  return String(Math.round(v));
};
const fmtPct = (v) => ((Number(v) || 0) * 100).toFixed(1) + '%';

const PALETTE = ['var(--accent)', 'var(--green, #3fb950)', 'var(--yellow, #e5c07b)', 'var(--red, #e55)', 'var(--blue, #61afef)', 'var(--magenta, #c678dd)', 'var(--cyan, #56b6c2)', 'var(--text-dim)'];

function metricOf(key) { return METRICS().find((m) => m.key === key) || METRICS()[0]; }

// Rows for a panel: dimension group rows sorted by the metric (sequential
// dims keep their natural order), value derived per row. cacheHitRatio isn't
// summed in group rows — derive it from the token fields.
function panelRows(data, panel) {
  const dim = DIMENSIONS().find((d) => d.key === panel.dim);
  if (!dim || panel.dim === 'total') {
    const totals = data.totals || {};
    return [{ key: t('Total'), value: valueOf(totals, panel.metric) }];
  }
  let rows = (data.groups?.[panel.dim] || []).map((r) => ({
    key: r.name || r.key, raw: r, value: valueOf(r, panel.metric),
  }));
  if (!dim.seq) {
    rows.sort((a, b) => b.value - a.value);
    rows = rows.slice(0, panel.topN || 8);
  }
  return rows;
}

function valueOf(r, metric) {
  if (metric === 'cacheHitRatio') {
    const denom = (r.cacheRead || 0) + (r.input || 0) + (r.cacheWrite || 0);
    return denom ? (r.cacheRead || 0) / denom : (r.cacheHitRatio || 0);
  }
  return Number(r[metric]) || 0;
}

// ── Chart renderers (all theme-token based, no deps) ──

function chartStat(body, rows, m) {
  const el = document.createElement('div');
  el.className = 'udash-stat';
  el.textContent = m.fmt(rows[0]?.value || 0);
  body.appendChild(el);
}

function chartBars(body, rows, m) {
  if (!rows.length) return empty(body);
  const max = Math.max(...rows.map((r) => r.value), 1e-9);
  for (const r of rows) {
    const row = document.createElement('div');
    row.className = 'udash-barrow';
    row.innerHTML = `<span class="udash-barlabel" title="${escHtml(String(r.key))}">${escHtml(String(r.key))}</span>`
      + `<span class="udash-bartrack"><span class="udash-barfill" style="width:${Math.max(1, (r.value / max) * 100)}%"></span></span>`
      + `<span class="udash-barval">${escHtml(m.fmt(r.value))}</span>`;
    body.appendChild(row);
  }
}

function chartLine(body, rows, m) {
  if (!rows.length) return empty(body);
  const canvas = document.createElement('canvas');
  canvas.className = 'udash-canvas';
  body.appendChild(canvas);
  requestAnimationFrame(() => {
    const rect = canvas.parentElement.getBoundingClientRect();
    const W = canvas.width = Math.max(200, rect.width - 4) * devicePixelRatio;
    const H = canvas.height = 150 * devicePixelRatio;
    canvas.style.height = '150px';
    const ctx = canvas.getContext('2d');
    const cs = getComputedStyle(canvas);
    const accent = cs.getPropertyValue('--accent').trim() || '#0f766e';
    const dim = cs.getPropertyValue('--text-dim').trim() || '#888';
    const max = Math.max(...rows.map((r) => r.value), 1e-9);
    const px = (i) => rows.length === 1 ? W / 2 : (i / (rows.length - 1)) * (W - 20 * devicePixelRatio) + 10 * devicePixelRatio;
    const py = (v) => H - 18 * devicePixelRatio - (v / max) * (H - 34 * devicePixelRatio);
    // area fill + line
    ctx.beginPath();
    rows.forEach((r, i) => { i ? ctx.lineTo(px(i), py(r.value)) : ctx.moveTo(px(0), py(r.value)); });
    ctx.strokeStyle = accent; ctx.lineWidth = 2 * devicePixelRatio; ctx.stroke();
    ctx.lineTo(px(rows.length - 1), H); ctx.lineTo(px(0), H); ctx.closePath();
    ctx.globalAlpha = 0.12; ctx.fillStyle = accent; ctx.fill(); ctx.globalAlpha = 1;
    // x labels: first / middle / last; y max label
    ctx.fillStyle = dim; ctx.font = `${10 * devicePixelRatio}px system-ui`;
    ctx.textAlign = 'left'; ctx.fillText(String(rows[0].key), 4 * devicePixelRatio, H - 4 * devicePixelRatio);
    ctx.textAlign = 'right'; ctx.fillText(String(rows[rows.length - 1].key), W - 4 * devicePixelRatio, H - 4 * devicePixelRatio);
    ctx.textAlign = 'left'; ctx.fillText(m.fmt(max), 4 * devicePixelRatio, 12 * devicePixelRatio);
  });
}

function chartPie(body, rows, m) {
  if (!rows.length) return empty(body);
  const top = rows.slice(0, 7);
  const rest = rows.slice(7).reduce((s, r) => s + r.value, 0);
  const parts = rest > 0 ? [...top, { key: t('Other'), value: rest }] : top;
  const total = parts.reduce((s, r) => s + r.value, 0) || 1;
  let acc = 0;
  const stops = parts.map((r, i) => {
    const from = (acc / total) * 360; acc += r.value;
    return `${PALETTE[i % PALETTE.length]} ${from}deg ${(acc / total) * 360}deg`;
  });
  const wrap = document.createElement('div');
  wrap.className = 'udash-pie-wrap';
  const pie = document.createElement('div');
  pie.className = 'udash-pie';
  pie.style.background = `conic-gradient(${stops.join(',')})`;
  const legend = document.createElement('div');
  legend.className = 'udash-legend';
  parts.forEach((r, i) => {
    const li = document.createElement('div');
    li.className = 'udash-legend-item';
    li.innerHTML = `<span class="udash-dot" style="background:${PALETTE[i % PALETTE.length]}"></span>`
      + `<span class="udash-legend-label" title="${escHtml(String(r.key))}">${escHtml(String(r.key))}</span>`
      + `<span class="udash-legend-val">${escHtml(m.fmt(r.value))} · ${Math.round((r.value / total) * 100)}%</span>`;
    legend.appendChild(li);
  });
  wrap.append(pie, legend);
  body.appendChild(wrap);
}

function chartTable(body, rows, m, panel, data) {
  if (!rows.length) return empty(body);
  const tbl = document.createElement('table');
  tbl.className = 'udash-table';
  const cols = ['requests', panel.metric === 'cost' ? 'totalTokens' : 'cost', panel.metric];
  const uniqCols = [...new Set(cols)];
  tbl.innerHTML = `<tr><th></th>${uniqCols.map((c) => `<th>${escHtml(metricOf(c).label)}</th>`).join('')}</tr>`
    + rows.map((r) => `<tr><td class="udash-td-key" title="${escHtml(String(r.key))}">${escHtml(String(r.key))}</td>`
      + uniqCols.map((c) => `<td class="udash-td-num">${escHtml(metricOf(c).fmt(r.raw ? valueOf(r.raw, c) : r.value))}</td>`).join('') + '</tr>').join('');
  body.appendChild(tbl);
}

function empty(body) {
  const e = document.createElement('div');
  e.className = 'usage-note';
  e.textContent = t('No data');
  body.appendChild(e);
}

// ── Panel + grid rendering ──

export function renderDashboard(container, data, panels, { onChange }) {
  const grid = document.createElement('div');
  grid.className = 'udash-grid';
  panels.forEach((panel, idx) => grid.appendChild(renderPanel(data, panels, panel, idx, onChange)));
  const add = document.createElement('button');
  add.className = 'udash-add';
  add.textContent = '+ ' + t('Add panel');
  add.onclick = (e) => openPanelEditor(e, null, (p) => onChange([...panels, p]));
  grid.appendChild(add);
  container.appendChild(grid);
}

function renderPanel(data, panels, panel, idx, onChange) {
  const m = metricOf(panel.metric);
  const dimMeta = DIMENSIONS().find((d) => d.key === panel.dim);
  const card = document.createElement('div');
  card.className = 'udash-panel' + (panel.span === 2 ? ' udash-span2' : '');
  const head = document.createElement('div');
  head.className = 'udash-panel-head';
  const title = panel.title || (panel.dim === 'total' ? m.label : `${m.label} · ${dimMeta?.label || panel.dim}`);
  head.innerHTML = `<span class="udash-panel-title" title="${escHtml(title)}">${escHtml(title)}</span>`;
  const tools = document.createElement('span');
  tools.className = 'udash-panel-tools';
  const edit = document.createElement('button');
  edit.className = 'udash-tool'; edit.textContent = '✎'; edit.title = t('Edit panel');
  edit.onclick = (e) => openPanelEditor(e, panel, (p) => {
    const next = panels.slice(); next[idx] = p; onChange(next);
  });
  const menu = document.createElement('button');
  menu.className = 'udash-tool'; menu.textContent = '⋯';
  menu.onclick = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    showContextMenu(r.left, r.bottom + 4, [
      { label: t('Move left/up'), action: () => { if (idx > 0) { const n = panels.slice(); [n[idx - 1], n[idx]] = [n[idx], n[idx - 1]]; onChange(n); } } },
      { label: t('Move right/down'), action: () => { if (idx < panels.length - 1) { const n = panels.slice(); [n[idx + 1], n[idx]] = [n[idx], n[idx + 1]]; onChange(n); } } },
      { label: panel.span === 2 ? t('Half width') : t('Full width'), action: () => { const n = panels.slice(); n[idx] = { ...panel, span: panel.span === 2 ? 1 : 2 }; onChange(n); } },
      { label: t('Remove panel'), action: () => onChange(panels.filter((_, i) => i !== idx)), style: 'color:var(--red, #e55)' },
    ]);
  };
  tools.append(edit, menu);
  head.appendChild(tools);
  const body = document.createElement('div');
  body.className = 'udash-panel-body';
  const rows = panelRows(data, panel);
  ({ stat: chartStat, bars: chartBars, line: chartLine, pie: chartPie, table: chartTable }[panel.chart] || chartBars)(body, rows, m, panel, data);
  card.append(head, body);
  return card;
}

// Panel editor popover — metric / dimension / chart / topN selects.
function openPanelEditor(e, existing, commit) {
  // Cursor-anchored: the "+ Add panel" button spans the full grid width, so
  // its left edge reads as detached from the click.
  const pop = createPopover(e.currentTarget, 'udash-editor', { position: 'cursor', x: e.clientX, y: e.clientY + 6 });
  const panel = { metric: 'cost', dim: 'day', chart: 'line', span: 1, topN: 8, ...(existing || {}) };
  const sel = (label, options, cur, onSet) => {
    const wrap = document.createElement('label');
    wrap.className = 'udash-editor-row';
    const span = document.createElement('span'); span.textContent = label;
    const s = document.createElement('select');
    s.className = 'task-log-sessfilter';
    for (const o of options) {
      const op = document.createElement('option');
      op.value = o.key; op.textContent = o.label; op.selected = o.key === cur;
      s.appendChild(op);
    }
    s.onchange = () => onSet(s.value);
    wrap.append(span, s);
    pop.appendChild(wrap);
    return s;
  };
  sel(t('Metric'), METRICS(), panel.metric, (v) => { panel.metric = v; });
  sel(t('Group by'), DIMENSIONS(), panel.dim, (v) => { panel.dim = v; });
  sel(t('Chart'), CHARTS(), panel.chart, (v) => { panel.chart = v; });
  sel(t('Top N'), [5, 8, 10, 15, 25].map((n) => ({ key: String(n), label: String(n) })), String(panel.topN || 8), (v) => { panel.topN = Number(v); });
  sel(t('Width'), [{ key: '1', label: t('Half') }, { key: '2', label: t('Full') }], String(panel.span || 1), (v) => { panel.span = Number(v); });
  const actions = document.createElement('div');
  actions.className = 'udash-editor-actions';
  const ok = document.createElement('button');
  ok.className = 'btn-create';
  ok.textContent = existing ? t('Apply') : t('Add');
  ok.onclick = () => { pop.remove(); commit(panel); };
  actions.appendChild(ok);
  pop.appendChild(actions);
}
