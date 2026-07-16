import {
  Chart, LineController, BarController, DoughnutController,
  LineElement, PointElement, BarElement, ArcElement,
  CategoryScale, LinearScale, Tooltip, Legend, Filler,
} from 'chart.js';
Chart.register(LineController, BarController, DoughnutController, LineElement, PointElement, BarElement, ArcElement, CategoryScale, LinearScale, Tooltip, Legend, Filler);
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

// A panel with splitBy (series split, 2.99.3) needs a 2-D pivot from the
// server — collect the 'dim:splitBy' keys a panel set requires so the window's
// one fetch can request them all (and refetch when an edit adds a new one).
export function panelPivots(panels) {
  return [...new Set((panels || [])
    .filter((p) => p.splitBy && p.splitBy !== p.dim && p.dim !== 'total' && (p.chart === 'line' || p.chart === 'bars'))
    .map((p) => `${p.dim}:${p.splitBy}`))];
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
      { metrics: ['cost'], dim: 'total', chart: 'stat', span: 1 },
      { metrics: ['requests', 'sessions'], dim: 'total', chart: 'stat', span: 1 },
      { metrics: ['cost', 'requests'], dim: 'day', chart: 'line', span: 2 },
      { metrics: ['cost'], dim: 'model', chart: 'pie', span: 1 },
      { metrics: ['cost'], dim: 'billing', chart: 'pie', span: 1 },
      { metrics: ['cost', 'requests'], dim: 'account', chart: 'bars', span: 1 },
      { metrics: ['cost'], dim: 'hour', chart: 'bars', span: 1 },
      { metrics: ['cost'], dim: 'project', chart: 'bars', span: 2, topN: 10 },
    ],
  },
  tokens: {
    label: t('Token throughput'),
    panels: [
      { metrics: ['totalTokens', 'output'], dim: 'total', chart: 'stat', span: 1 },
      { metrics: ['cacheHitRatio'], dim: 'total', chart: 'stat', span: 1 },
      { metrics: ['totalTokens', 'output'], dim: 'day', chart: 'line', span: 2 },
      { metrics: ['cacheRead', 'cacheWrite', 'input'], dim: 'model', chart: 'bars', span: 2, topN: 8 },
      { metrics: ['cacheHitRatio', 'requests'], dim: 'day', chart: 'line', span: 2 },
      { metrics: ['output'], dim: 'model', chart: 'pie', span: 1 },
      { metrics: ['totalTokens'], dim: 'project', chart: 'pie', span: 1 },
    ],
  },
  accounts: {
    label: t('Account reconciliation'),
    panels: [
      { metrics: ['cost'], dim: 'billing', chart: 'pie', span: 1 },
      { metrics: ['cost'], dim: 'account', chart: 'pie', span: 1 },
      { metrics: ['totalTokens'], dim: 'day', splitBy: 'account', chart: 'bars', span: 2 },
      { metrics: ['cost'], dim: 'day', splitBy: 'account', chart: 'line', span: 2 },
      { metrics: ['cost', 'requests', 'totalTokens'], dim: 'account', chart: 'table', span: 2, topN: 12 },
      { metrics: ['cost', 'requests'], dim: 'account', chart: 'bars', span: 2 },
    ],
  },
  rhythm: {
    label: t('Time patterns'),
    panels: [
      { metrics: ['requests', 'cost'], dim: 'hour', chart: 'bars', span: 2 },
      { metrics: ['requests', 'cost'], dim: 'weekday', chart: 'bars', span: 1 },
      { metrics: ['sessions'], dim: 'weekday', chart: 'bars', span: 1 },
      { metrics: ['cost', 'requests'], dim: 'day', chart: 'line', span: 2 },
      { metrics: ['cost', 'requests', 'totalTokens'], dim: 'session', chart: 'table', span: 2, topN: 10 },
    ],
  },
  models: {
    label: t('Model comparison'),
    panels: [
      { metrics: ['cost'], dim: 'model', chart: 'pie', span: 1 },
      { metrics: ['requests'], dim: 'model', chart: 'pie', span: 1 },
      { metrics: ['cost', 'requests', 'output', 'cacheHitRatio'], dim: 'model', chart: 'table', span: 2, topN: 10 },
      { metrics: ['output', 'input'], dim: 'model', chart: 'bars', span: 2 },
      { metrics: ['cost'], dim: 'mode', chart: 'pie', span: 1 },
      { metrics: ['cost'], dim: 'host', chart: 'bars', span: 1 },
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
  const mode = effectiveSort(panel, dim);
  if (!dim.seq) {
    // Top-N is a RANKING concept — always cut by value, then order the
    // survivors per the panel's sort (name order alphabetizes the top N).
    rows.sort((a, b) => b.value - a.value);
    rows = rows.slice(0, panel.topN || 8);
    sortRowsBy(rows, mode, (r) => r.value);
  } else {
    sortRowsBy(rows, mode, (r) => r.value);
    // hour/weekday are CLOSED scales — in axis order, fill the missing buckets
    // with zeros so the axis stays continuous (a gap reads as a mislabeled
    // bar, not "no data"); value-sorted views skip the zero clutter
    if (mode === 'axis' && (panel.dim === 'hour' || panel.dim === 'weekday')) {
      const n = panel.dim === 'hour' ? 24 : 7;
      const byIdx = new Map(rows.map((r) => [Number(r.raw.key), r]));
      rows = Array.from({ length: n }, (_, i) => byIdx.get(i) || ({ key: String(i), raw: { key: String(i) }, value: 0, values: mkeys.map(() => 0) }));
    }
    if (panel.dim === 'weekday') {
      const WD = [t('Sun'), t('Mon'), t('Tue'), t('Wed'), t('Thu'), t('Fri'), t('Sat')];
      rows.forEach((r) => { r.key = WD[Number(r.raw.key)] ?? r.key; });
    }
  }
  return rows;
}

// Panel sort (2.180.3, user request): '' = dimension default (axis order for
// sequential dims, value desc for categorical); 'axis' | 'desc' | 'asc'.
function effectiveSort(panel, dim) {
  return panel.sort || (dim?.seq ? 'axis' : 'desc');
}
function sortRowsBy(rows, mode, val) {
  if (mode === 'axis') {
    rows.sort((a, b) => {
      const na = Number(a.key), nb = Number(b.key);
      return (Number.isFinite(na) && Number.isFinite(nb)) ? na - nb : String(a.key).localeCompare(String(b.key));
    });
  } else if (mode === 'asc') rows.sort((a, b) => val(a) - val(b));
  else rows.sort((a, b) => val(b) - val(a));
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

// ── Chart.js shared plumbing ──
// One library, one interaction model: hover tooltips, clickable legends and
// animations behave identically across line/bar/donut. Instances MUST be
// destroyed before their canvas is dropped (Chart.js keeps a global registry
// + a ResizeObserver per chart) — destroyCharts() below, called by the
// usage window before every re-render and on window close.

export function destroyCharts(rootEl) {
  rootEl?.querySelectorAll?.('canvas').forEach((c) => Chart.getChart(c)?.destroy());
}

function themeColors(el) {
  const cs = getComputedStyle(el);
  const v = (n, fb) => (cs.getPropertyValue(n) || '').trim() || fb;
  return { text: v('--text-secondary', '#888'), dim: v('--text-dim', '#777'), grid: 'rgba(128,128,128,0.14)' };
}

// PALETTE entries are var() strings — canvas needs resolved colors.
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

function chartHolder(body, tall) {
  const holder = document.createElement('div');
  holder.className = 'udash-chart' + (tall ? ' udash-chart-tall' : '');
  const canvas = document.createElement('canvas');
  holder.appendChild(canvas);
  body.appendChild(holder);
  return canvas;
}

// unit → axis id: first unit owns the primary axis, everything else shares
// the secondary (a third unit on one chart is past the point of readability).
function axisAssign(mlist) {
  const units = [...new Set(mlist.map((m) => m.unit))];
  return { units, idOf: (u) => (units.indexOf(u) > 0 ? 'sec' : 'pri') };
}

function scaleTicks(mlist, unit, colors) {
  const m = mlist.find((mm) => mm.unit === unit) || mlist[0];
  return { color: colors.dim, callback: (v) => m.fmt(v), maxTicksLimit: 6 };
}

function commonOpts(mlist, colors, { horizontal, showLegend } = {}) {
  const { units, idOf } = axisAssign(mlist);
  const valueAxis = horizontal ? 'x' : 'y';
  const catAxis = horizontal ? 'y' : 'x';
  const scales = {
    [catAxis]: { ticks: { color: colors.dim, autoSkip: true, maxTicksLimit: horizontal ? 20 : 12 }, grid: { display: false } },
    pri: { axis: valueAxis, position: horizontal ? 'bottom' : 'left', beginAtZero: true,
      ticks: scaleTicks(mlist, units[0], colors), grid: { color: colors.grid } },
  };
  if (units.length > 1) {
    scales.sec = { axis: valueAxis, position: horizontal ? 'top' : 'right', beginAtZero: true,
      ticks: scaleTicks(mlist, units[1], colors), grid: { display: false } };
  }
  return {
    responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
    indexAxis: horizontal ? 'y' : 'x',
    scales,
    plugins: {
      legend: { display: showLegend, labels: { color: colors.text, boxWidth: 10, boxHeight: 10, font: { size: 10 } } },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const m = mlist[ctx.datasetIndex] || mlist[0];
            const v = horizontal ? ctx.parsed.x : ctx.parsed.y;
            return `${m.label}: ${m.fmt(v)}`;
          },
        },
      },
    },
  };
}

function chartBars(body, rows, mlist, panel) {
  if (!rows.length) return empty(body);
  const dimMeta = DIMENSIONS().find((d) => d.key === panel.dim);
  const horizontal = !dimMeta?.seq; // categorical reads better horizontally
  const canvas = chartHolder(body, horizontal && rows.length > 8);
  const colors = themeColors(canvas);
  const { idOf } = axisAssign(mlist);
  new Chart(canvas, {
    type: 'bar',
    data: {
      labels: rows.map((r) => String(r.key)),
      datasets: mlist.map((m, i) => ({
        label: m.label,
        data: rows.map((r) => r.values[i]),
        backgroundColor: resolveColor(canvas, PALETTE[i % PALETTE.length], 0.75),
        borderRadius: 3,
        [horizontal ? 'xAxisID' : 'yAxisID']: idOf(m.unit),
      })),
    },
    options: commonOpts(mlist, colors, { horizontal, showLegend: mlist.length > 1 }),
  });
}

function chartLine(body, rows, mlist) {
  if (!rows.length) return empty(body);
  const canvas = chartHolder(body);
  const colors = themeColors(canvas);
  const { idOf } = axisAssign(mlist);
  new Chart(canvas, {
    type: 'line',
    data: {
      labels: rows.map((r) => String(r.key)),
      datasets: mlist.map((m, i) => ({
        label: m.label,
        data: rows.map((r) => r.values[i]),
        borderColor: resolveColor(canvas, PALETTE[i % PALETTE.length]),
        backgroundColor: resolveColor(canvas, PALETTE[i % PALETTE.length], 0.10),
        fill: i === 0,
        tension: 0.25,
        pointRadius: rows.length > 40 ? 0 : 2,
        borderWidth: 2,
        yAxisID: idOf(m.unit),
      })),
    },
    options: commonOpts(mlist, colors, { showLegend: mlist.length > 1 }),
  });
}

function chartPie(body, rows, mlist) {
  if (!rows.length) return empty(body);
  const m = mlist[0]; // a donut is single-metric by nature — first metric wins
  const top = rows.slice(0, 7);
  const rest = rows.slice(7).reduce((s2, r) => s2 + r.value, 0);
  const parts = rest > 0 ? [...top, { key: t('Other'), value: rest }] : top;
  const total = parts.reduce((s2, r) => s2 + r.value, 0) || 1;
  const canvas = chartHolder(body);
  const colors = themeColors(canvas);
  new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: parts.map((r) => String(r.key)),
      datasets: [{
        data: parts.map((r) => r.value),
        backgroundColor: parts.map((_, i) => resolveColor(canvas, PALETTE[i % PALETTE.length], 0.85)),
        borderWidth: 0,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 250 }, cutout: '58%',
      plugins: {
        legend: { position: 'right', labels: { color: colors.text, boxWidth: 9, boxHeight: 9, font: { size: 10 } } },
        tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${m.fmt(ctx.parsed)} · ${Math.round((ctx.parsed / total) * 100)}%` } },
      },
    },
  });
}

// Split-series chart (2.99.3): one dataset per key of panel.splitBy, over the
// main dimension's categories — e.g. dim=day × splitBy=account answers "how
// many tokens did each account burn per day". Data = the server's 2-D pivot
// (same finalized cell shape as group rows). Single-metric by nature (the
// first selected metric); bars stack, lines overlay.
function chartSplit(body, data, panel, mlist) {
  const m = mlist[0];
  const pv = data.pivots?.[`${panel.dim}:${panel.splitBy}`];
  if (!pv || !pv.length) return empty(body);
  const dimMeta = DIMENSIONS().find((d) => d.key === panel.dim);
  const numericKeys = panel.dim === 'hour' || panel.dim === 'weekday';
  let rows = pv.map((r) => ({
    key: r.key, cells: r.cells,
    total: Object.values(r.cells).reduce((s2, c) => s2 + valueOf(c, m.key), 0),
  }));
  const smode = effectiveSort(panel, dimMeta);
  if (smode === 'axis') rows.sort((a, b) => (numericKeys ? Number(a.key) - Number(b.key) : String(a.key).localeCompare(String(b.key))));
  else { rows.sort((a, b) => (smode === 'asc' ? a.total - b.total : b.total - a.total)); if (!dimMeta?.seq) rows = rows.slice(0, panel.topN || 8); }
  // Series = top split keys by grand total; the tail folds into "Other" so a
  // session/project split stays readable.
  const totalsByS = {};
  for (const r of rows) for (const [k, c] of Object.entries(r.cells)) totalsByS[k] = (totalsByS[k] || 0) + valueOf(c, m.key);
  const sorted = Object.keys(totalsByS).sort((a, b) => totalsByS[b] - totalsByS[a]);
  const kept = sorted.slice(0, 6), rest = sorted.slice(6);
  const labMap = new Map((data.groups?.[panel.splitBy] || []).map((g) => [g.key, g.name || g.key]));
  const horizontal = panel.chart === 'bars' && !dimMeta?.seq;
  const canvas = chartHolder(body, rows.length > 20);
  const colors = themeColors(canvas);
  const stacked = panel.chart === 'bars';
  const mkData = (k) => rows.map((r) => valueOf(r.cells[k] || {}, m.key));
  // Every dataset MUST bind to the configured 'pri' scale — unbound datasets
  // make Chart.js mint a phantom default axis next to the real one.
  const axisBind = { [horizontal ? 'xAxisID' : 'yAxisID']: 'pri' };
  const datasets = kept.map((k, i) => ({
    label: String(labMap.get(k) || k),
    data: mkData(k),
    ...axisBind,
    ...(stacked
      ? { backgroundColor: resolveColor(canvas, PALETTE[i % PALETTE.length], 0.75), borderRadius: 2 }
      : { borderColor: resolveColor(canvas, PALETTE[i % PALETTE.length]), backgroundColor: resolveColor(canvas, PALETTE[i % PALETTE.length], 0.10), tension: 0.25, pointRadius: rows.length > 40 ? 0 : 2, borderWidth: 2 }),
  }));
  if (rest.length) {
    datasets.push({
      label: t('Other'),
      data: rows.map((r) => rest.reduce((s2, k) => s2 + valueOf(r.cells[k] || {}, m.key), 0)),
      ...axisBind,
      ...(stacked
        ? { backgroundColor: resolveColor(canvas, 'var(--text-dim)', 0.5), borderRadius: 2 }
        : { borderColor: resolveColor(canvas, 'var(--text-dim)'), tension: 0.25, pointRadius: 0, borderWidth: 1.5 }),
    });
  }
  const opts = commonOpts([m], colors, { horizontal, showLegend: true });
  // All datasets share ONE metric — tooltip names the SERIES, not the metric.
  opts.plugins.tooltip.callbacks.label = (ctx) => `${ctx.dataset.label}: ${m.fmt(horizontal ? ctx.parsed.x : ctx.parsed.y)}`;
  if (stacked) {
    const catAxis = horizontal ? 'y' : 'x';
    opts.scales[catAxis].stacked = true;
    opts.scales.pri.stacked = true;
  }
  new Chart(canvas, { type: stacked ? 'bar' : 'line', data: { labels: rows.map((r) => String(r.key)), datasets }, options: opts });
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
  // Attach BEFORE rendering panels: chart color resolution probes computed
  // styles (var(--accent) etc.) — in a detached tree they resolve to nothing
  // and every chart renders black (real regression).
  container.appendChild(grid);
  panels.forEach((panel, idx) => renderPanel(grid, data, panels, panel, idx, onChange));
  const add = document.createElement('button');
  add.className = 'udash-add';
  add.textContent = '+ ' + t('Add panel');
  add.onclick = (e) => openPanelEditor(e, null, (p) => onChange([...panels, p]));
  grid.appendChild(add);
  container.appendChild(grid);
}

function renderPanel(grid, data, panels, panel, idx, onChange) {
  const mlist = panelMetrics(panel).map(metricOf);
  const dimMeta = DIMENSIONS().find((d) => d.key === panel.dim);
  const card = document.createElement('div');
  card.className = 'udash-panel' + (panel.span === 2 ? ' udash-span2' : '');
  const head = document.createElement('div');
  head.className = 'udash-panel-head';
  const mLabel = mlist.map((mm) => mm.label).join(' + ');
  const splitMeta = panel.splitBy ? DIMENSIONS().find((d) => d.key === panel.splitBy) : null;
  const title = panel.title || (panel.dim === 'total' ? mLabel
    : `${mLabel} · ${dimMeta?.label || panel.dim}${splitMeta ? ` × ${splitMeta.label}` : ''}`);
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
  card.append(head, body);
  grid.appendChild(card); // must be IN the document before charts resolve theme colors
  // Split-series route: line/bars with a splitBy render from the 2-D pivot.
  // Other chart types ignore the split (a donut/table of a cross isn't a thing).
  if (panel.splitBy && panel.splitBy !== panel.dim && panel.dim !== 'total' && (panel.chart === 'line' || panel.chart === 'bars')) {
    chartSplit(body, data, panel, mlist);
    return;
  }
  const rows = panelRows(data, panel);
  ({ stat: chartStat, bars: chartBars, line: chartLine, pie: chartPie, table: chartTable }[panel.chart] || chartBars)(body, rows, mlist, panel, data);
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
  // Series split — the 2nd dimension (day×account etc.). Line → one line per
  // key, bars → stacked. Only meaningful on those two chart types.
  sel(t('Split series by'), [{ key: '', label: t('None') }, ...DIMENSIONS().filter((d) => d.key !== 'total')],
    panel.splitBy || '', (v) => { if (v) panel.splitBy = v; else delete panel.splitBy; });
  sel(t('Chart'), CHARTS(), panel.chart, (v) => { panel.chart = v; });
  // Sort (2.181.0, user request): '' = dimension default (axis for sequential,
  // value desc for categorical)
  sel(t('Sort'), [
    { key: '', label: t('Default (by dimension)') },
    { key: 'axis', label: t('Axis / name order') },
    { key: 'desc', label: t('Value (high → low)') },
    { key: 'asc', label: t('Value (low → high)') },
  ], panel.sort || '', (v) => { if (v) panel.sort = v; else delete panel.sort; });
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
