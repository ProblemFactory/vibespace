import uPlot from 'uplot';
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
  // unit → axis grouping: metrics sharing a unit share a y-scale; a chart with
  // two units gets a right axis for the second (cost + requests on one line
  // chart Just Works).
  { key: 'cost', label: t('Est. cost'), fmt: fmtCost, unit: '$' },
  { key: 'requests', label: t('Requests'), fmt: fmtNum, unit: 'n' },
  { key: 'totalTokens', label: t('Total tokens'), fmt: fmtTok, unit: 'tok' },
  { key: 'output', label: t('Output tokens'), fmt: fmtTok, unit: 'tok' },
  { key: 'input', label: t('Fresh input tokens'), fmt: fmtTok, unit: 'tok' },
  { key: 'cacheRead', label: t('Cache read tokens'), fmt: fmtTok, unit: 'tok' },
  { key: 'cacheWrite', label: t('Cache write tokens'), fmt: fmtTok, unit: 'tok' },
  { key: 'cacheHitRatio', label: t('Cache hit ratio'), fmt: fmtPct, unit: '%' },
  { key: 'sessions', label: t('Sessions'), fmt: fmtNum, unit: 'n' },
]);

// Panel metric list — panels predating 2.97.0 carry a single `metric`.
export function panelMetrics(panel) {
  const list = Array.isArray(panel.metrics) && panel.metrics.length ? panel.metrics : [panel.metric || 'cost'];
  return list.filter((k) => METRICS().some((m) => m.key === k));
}

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
      { metrics: ['cost', 'requests'], dim: 'day', chart: 'line', span: 2 },
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
      { metrics: ['totalTokens', 'output'], dim: 'day', chart: 'line', span: 2 },
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
  const mkeys = panelMetrics(panel);
  const first = mkeys[0];
  if (!dim || panel.dim === 'total') {
    const totals = data.totals || {};
    return [{ key: t('Total'), raw: totals, value: valueOf(totals, first), values: mkeys.map((k) => valueOf(totals, k)) }];
  }
  let rows = (data.groups?.[panel.dim] || []).map((r) => ({
    key: r.name || r.key, raw: r, value: valueOf(r, first), values: mkeys.map((k) => valueOf(r, k)),
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

function chartStat(body, rows, mlist) {
  const wrap = document.createElement('div');
  wrap.className = 'udash-stat-row';
  mlist.forEach((m, i) => {
    const cell = document.createElement('div');
    cell.className = 'udash-stat-cell';
    cell.innerHTML = `<div class="udash-stat">${escHtml(m.fmt(rows[0]?.values?.[i] ?? 0))}</div>`
      + (mlist.length > 1 ? `<div class="udash-stat-label">${escHtml(m.label)}</div>` : '');
    wrap.appendChild(cell);
  });
  body.appendChild(wrap);
}

function chartBars(body, rows, mlist) {
  if (!rows.length) return empty(body);
  // Per-metric max: metrics live on wildly different ranges (cost $ vs
  // cache-read billions) — each metric's bar normalizes to its own max.
  const maxes = mlist.map((_, i) => Math.max(...rows.map((r) => r.values[i]), 1e-9));
  if (mlist.length > 1) body.appendChild(miniLegend(mlist));
  for (const r of rows) {
    const row = document.createElement('div');
    row.className = 'udash-barrow' + (mlist.length > 1 ? ' udash-barrow-multi' : '');
    const bars = mlist.map((m, i) =>
      `<span class="udash-bartrack"><span class="udash-barfill" style="width:${Math.max(1, (r.values[i] / maxes[i]) * 100)}%;background:${PALETTE[i % PALETTE.length]}"></span></span>`
      + `<span class="udash-barval">${escHtml(m.fmt(r.values[i]))}</span>`).join('');
    row.innerHTML = `<span class="udash-barlabel" title="${escHtml(String(r.key))}">${escHtml(String(r.key))}</span><span class="udash-barset">${bars}</span>`;
    body.appendChild(row);
  }
}

function miniLegend(mlist) {
  const lg = document.createElement('div');
  lg.className = 'udash-minilegend';
  lg.innerHTML = mlist.map((m, i) => `<span class="udash-legend-item"><span class="udash-dot" style="background:${PALETTE[i % PALETTE.length]}"></span>${escHtml(m.label)}</span>`).join('');
  return lg;
}

function chartLine(body, rows, mlist) {
  if (!rows.length) return empty(body);
  const holder = document.createElement('div');
  holder.className = 'udash-uplot';
  body.appendChild(holder);
  requestAnimationFrame(() => {
    const rect = holder.parentElement.getBoundingClientRect();
    const cs = getComputedStyle(holder);
    const gridColor = 'rgba(128,128,128,0.15)';
    const textColor = cs.getPropertyValue('--text-dim').trim() || '#888';
    // Unit → scale/axis: first unit owns the left axis, second the right;
    // further units share the right axis (rare in practice).
    const units = [...new Set(mlist.map((mm) => mm.unit))];
    const scaleOf = (u) => 'y' + Math.min(units.indexOf(u), 1);
    const xs = rows.map((_, i) => i);
    const data = [xs, ...mlist.map((_, i) => rows.map((r) => r.values[i]))];
    const series = [
      {},
      ...mlist.map((mm, i) => ({
        label: mm.label,
        stroke: resolveColor(holder, PALETTE[i % PALETTE.length]),
        width: 2,
        fill: i === 0 ? resolveColor(holder, PALETTE[0], 0.10) : undefined,
        scale: scaleOf(mm.unit),
        value: (u, v) => v == null ? '' : mm.fmt(v),
      })),
    ];
    const axes = [
      { stroke: textColor, grid: { stroke: gridColor }, values: (u, splits) => splits.map((i2) => rows[Math.round(i2)]?.key ?? '') },
      { stroke: textColor, grid: { stroke: gridColor }, scale: 'y0', size: 56,
        values: (u, splits) => splits.map((v) => metricForUnit(mlist, units[0]).fmt(v)) },
    ];
    if (units.length > 1) {
      axes.push({ stroke: textColor, grid: { show: false }, scale: 'y1', side: 1, size: 56,
        values: (u, splits) => splits.map((v) => metricForUnit(mlist, units[1]).fmt(v)) });
    }
    const u = new uPlot({
      width: Math.max(220, rect.width - 8), height: 170,
      series, axes,
      scales: { x: { time: false }, y0: {}, y1: {} },
      cursor: { drag: { setScale: false } },
      legend: { live: true },
    }, data, holder);
    // re-fit when the panel resizes with the window
    const ro = new ResizeObserver(() => {
      const w = holder.parentElement?.getBoundingClientRect().width;
      if (w && Math.abs(w - 8 - u.width) > 4) u.setSize({ width: Math.max(220, w - 8), height: 170 });
    });
    ro.observe(holder.parentElement);
    holder._udashRo = ro; // GC'd with the panel re-render (observer on detached node is inert)
  });
}

function metricForUnit(mlist, unit) { return mlist.find((mm) => mm.unit === unit) || mlist[0]; }

// PALETTE entries are var() strings — canvas/uPlot need resolved colors.
function resolveColor(el, varStr, alpha) {
  const probe = document.createElement('span');
  probe.style.color = varStr;
  el.appendChild(probe);
  const c = getComputedStyle(probe).color;
  probe.remove();
  if (alpha == null) return c;
  const m2 = c.match(/rgba?\(([^)]+)\)/);
  if (!m2) return c;
  const [r, g, b] = m2[1].split(',').map((x) => parseFloat(x));
  return `rgba(${r},${g},${b},${alpha})`;
}

function chartPie(body, rows, mlist) {
  const m = mlist[0]; // a donut is single-metric by nature — first metric wins
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

function chartTable(body, rows, mlist, panel) {
  if (!rows.length) return empty(body);
  const tbl = document.createElement('table');
  tbl.className = 'udash-table';
  // Selected metrics ARE the columns; a lone metric gets requests+cost context.
  const keys = panelMetrics(panel);
  const cols = keys.length > 1 ? keys : [...new Set(['requests', keys[0] === 'cost' ? 'totalTokens' : 'cost', keys[0]])];
  tbl.innerHTML = `<tr><th></th>${cols.map((c) => `<th>${escHtml(metricOf(c).label)}</th>`).join('')}</tr>`
    + rows.map((r) => `<tr><td class="udash-td-key" title="${escHtml(String(r.key))}">${escHtml(String(r.key))}</td>`
      + cols.map((c) => `<td class="udash-td-num">${escHtml(metricOf(c).fmt(r.raw ? valueOf(r.raw, c) : r.value))}</td>`).join('') + '</tr>').join('');
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
  const mlist = panelMetrics(panel).map(metricOf);
  const dimMeta = DIMENSIONS().find((d) => d.key === panel.dim);
  const card = document.createElement('div');
  card.className = 'udash-panel' + (panel.span === 2 ? ' udash-span2' : '');
  const head = document.createElement('div');
  head.className = 'udash-panel-head';
  const mLabel = mlist.map((mm) => mm.label).join(' + ');
  const title = panel.title || (panel.dim === 'total' ? mLabel : `${mLabel} · ${dimMeta?.label || panel.dim}`);
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
  ({ stat: chartStat, bars: chartBars, line: chartLine, pie: chartPie, table: chartTable }[panel.chart] || chartBars)(body, rows, mlist, panel, data);
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
  // Metrics: MULTI-select — checkbox list (the whole point of 2.97.0).
  {
    const wrap = document.createElement('div');
    wrap.className = 'udash-editor-row udash-editor-metrics';
    const span = document.createElement('span'); span.textContent = t('Metrics');
    const list = document.createElement('div');
    list.className = 'udash-metric-list';
    const chosen = new Set(panelMetrics(panel));
    for (const mm of METRICS()) {
      const lab = document.createElement('label');
      lab.className = 'udash-metric-check';
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = chosen.has(mm.key);
      cb.onchange = () => {
        if (cb.checked) chosen.add(mm.key); else if (chosen.size > 1) chosen.delete(mm.key); else cb.checked = true;
        panel.metrics = METRICS().map((x) => x.key).filter((k) => chosen.has(k));
        panel.metric = panel.metrics[0];
      };
      lab.append(cb, document.createTextNode(mm.label));
      list.appendChild(lab);
    }
    wrap.append(span, list);
    pop.appendChild(wrap);
  }
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
