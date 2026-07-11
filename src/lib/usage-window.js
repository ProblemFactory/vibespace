// Usage window — a dashboard over the permanent per-request token ledger
// (/api/usage-stats). Many analysis cuts: totals, daily trend, billing category
// (subscription vs API — never mixed), account, model, project, mode, cache
// efficiency, hour/weekday activity, top sessions. Opened from ⚙ → Usage.
import { t } from './i18n.js';
import { renderDashboard, PRESETS, destroyCharts, panelPivots } from './usage-dashboard.js';
import { showContextMenu } from './utils.js';
import { escHtml, fetchJson, showToast, copyText } from './utils.js';
import { createBackendIconHtml } from './agent-meta.js';

// Small vendor logo — accounts and models from BOTH CLIs mix in one dashboard,
// so every such row/chip carries the backend brand to keep them apart.
const beIc = (be) => be ? createBackendIconHtml(be, { className: 'usage-be-ic', title: be === 'codex' ? 'Codex' : 'Claude' }) : '';
const bucketBe = (r) => r.key === '__global__' ? 'claude'
  : r.key === '__global_codex__' ? 'codex'
  : (r.be || (r.type === 'codex-subscription' ? 'codex' : 'claude'));

const DAY = 86400000;
const RANGES = [
  { key: '7d', label: () => t('7 days'), ms: 7 * DAY },
  { key: '30d', label: () => t('30 days'), ms: 30 * DAY },
  { key: '90d', label: () => t('90 days'), ms: 90 * DAY },
  { key: 'all', label: () => t('All time'), ms: null },
  { key: 'custom', label: () => t('Custom…') },
];
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

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

  const state = {
    range: '30d', backend: '', account: '', metric: 'cost', data: null, loading: false, view: 'dash',
    customFrom: isoDay(Date.now() - 7 * DAY), customTo: isoDay(Date.now()),
    acctOptions: null, // account rows from the last UNFILTERED load — the chip set must not shrink while filtered
  };

  // The dashboard's saved panels (or the default preset) — split-series
  // panels declare 2-D pivots the fetch must request.
  const currentPanels = () => {
    const saved = app.settings.get('usage.dashboard');
    return Array.isArray(saved) && saved.length ? saved : PRESETS().overview.panels;
  };

  const load = async () => {
    state.loading = true; render();
    const qs = new URLSearchParams();
    if (state.range === 'custom') {
      const f = Date.parse(state.customFrom), to = Date.parse(state.customTo);
      if (Number.isFinite(f)) qs.set('from', String(f));
      if (Number.isFinite(to)) qs.set('to', String(to + DAY - 1)); // inclusive end of day
    } else {
      const r = RANGES.find(x => x.key === state.range);
      if (r && r.ms) qs.set('from', String(Date.now() - r.ms));
    }
    if (state.backend) qs.set('backend', state.backend);
    if (state.account) qs.set('account', state.account);
    const pivots = panelPivots(currentPanels());
    if (pivots.length) qs.set('pivot', pivots.join(','));
    try { state.data = await fetchJson('/api/usage-stats?' + qs.toString()); }
    catch { state.data = null; showToast(t('Could not load usage'), { type: 'error' }); }
    if (!state.account && state.data?.groups?.account) {
      // Union, not replace: switching to a narrower range must not drop chips
      // for accounts that simply have no data there.
      const have = new Map((state.acctOptions || []).map(r => [r.key, r]));
      for (const r of state.data.groups.account) have.set(r.key, r);
      state.acctOptions = [...have.values()];
    }
    state.loading = false; render();
  };

  const render = () => {
    destroyCharts(root); // Chart.js instances must not outlive their canvases
    root.innerHTML = '';
    root.appendChild(renderControls(app, state, load, render));
    const body = document.createElement('div'); body.className = 'usage-body';
    root.appendChild(body);
    if (state.view === 'pricing') { body.appendChild(renderPricingEditor(state, render, load)); return; }
    if (state.loading && !state.data) { body.innerHTML = `<div class="usage-empty">${t('Loading…')}</div>`; return; }
    const d = state.data;
    if (!d || !d.totals || !d.totals.requests) {
      body.innerHTML = `<div class="usage-empty">${t('No usage recorded yet for this range. Run some sessions, then re-open this window.')}</div>`;
      return;
    }
    body.appendChild(renderTiles(d));
    if (state.view === 'classic') {
      // The pre-2.96 fixed layout, kept as an escape hatch.
      body.appendChild(renderTrend(d, state));
      body.appendChild(sectionGrid([
        renderBilling(d),
        renderGroup(t('By account'), d.groups.account, state, { badge: true }),
        renderGroup(t('By model'), d.groups.model, state, { beIcon: true }),
        renderCache(d),
        renderGroup(t('By project'), d.groups.project, state, { path: true }),
        renderGroup(t('By mode'), d.groups.mode, state, { small: true }),
        renderHours(d),
        renderWeekdays(d),
        renderGroup(t('Top sessions'), d.groups.session, state, { session: true, limit: 12 }),
      ]));
    } else {
      // Configurable dashboard (2.96.0): panels persist in settings and sync
      // across clients like everything else.
      const panels = currentPanels();
      renderDashboard(body, d, panels, {
        onChange: (next) => {
          app.settings.set('usage.dashboard', next);
          // An edit that introduces a NEW 2-D cross (splitBy) needs data the
          // last fetch didn't request — refetch instead of rendering a hole.
          const needed = panelPivots(next);
          if (needed.some((k) => !state.data?.pivots?.[k])) load();
          else render();
        },
      });
    }
    body.appendChild(renderFooter(d));
  };

  const prevClose = winInfo.onClose;
  winInfo.onClose = () => { destroyCharts(root); prevClose?.(); };
  winInfo._reloadUsage = load;
  load();
  return winInfo;
}

function renderControls(app, state, load, rerender) {
  const bar = document.createElement('div'); bar.className = 'usage-controls';
  if (state.view === 'pricing') {
    const back = document.createElement('button'); back.className = 'usage-btn'; back.textContent = '← ' + t('Back to dashboard');
    back.onclick = () => { state.view = 'dash'; rerender(); };
    const title = document.createElement('div'); title.className = 'usage-ctl-label'; title.style.fontSize = '13px'; title.textContent = t('Pricing (per model + per account)');
    bar.append(back, title);
    return bar;
  }
  const seg = (items, cur, onPick) => {
    const wrap = document.createElement('div'); wrap.className = 'usage-seg';
    for (const it of items) {
      const b = document.createElement('button');
      b.className = 'usage-seg-btn' + (it.key === cur ? ' on' : '');
      const label = typeof it.label === 'function' ? it.label() : it.label;
      if (it.iconHtml) b.innerHTML = it.iconHtml + escHtml(label);
      else b.textContent = label;
      if (it.tip) b.title = it.tip;
      b.onclick = () => onPick(it.key);
      wrap.appendChild(b);
    }
    return wrap;
  };
  bar.appendChild(labelled(t('Range'), seg(RANGES, state.range, k => { state.range = k; load(); })));
  if (state.range === 'custom') {
    const dates = document.createElement('div'); dates.className = 'usage-seg usage-dates';
    const mk = (val, on) => {
      const i = document.createElement('input'); i.type = 'date'; i.className = 'usage-date';
      i.value = val;
      i.onchange = () => { if (i.value) { on(i.value); load(); } };
      return i;
    };
    const arrow = document.createElement('span'); arrow.className = 'usage-ctl-label'; arrow.textContent = '→';
    dates.append(mk(state.customFrom, v => { state.customFrom = v; }), arrow, mk(state.customTo, v => { state.customTo = v; }));
    bar.appendChild(dates);
  }
  bar.appendChild(labelled(t('Backend'), seg([
    { key: '', label: t('All') }, { key: 'claude', label: 'Claude', iconHtml: beIc('claude') }, { key: 'codex', label: 'Codex', iconHtml: beIc('codex') },
  ], state.backend, k => {
    state.backend = k;
    // A selected account from the OTHER backend makes the filtered view
    // permanently empty — drop it (mixed comma keys checked per key).
    if (k && state.account) {
      const rows = state.acctOptions || [];
      const ok = state.account.split(',').every(key => {
        const r = rows.find(x => x.key === key);
        return r ? bucketBe(r) === k : true;
      });
      if (!ok) state.account = '';
    }
    load();
  })));
  // Account filter — one chip per ledger bucket, each with its vendor logo.
  // Backend-scoped: with Backend=Codex only codex identities show (and vice
  // versa). The two CLIs' machine logins are separate buckets ('__global__'
  // claude, '__global_codex__' codex); when a machine login IS a named account
  // (email link), the two buckets render as ONE chip whose filter spans both
  // (comma key), mirroring the pies' dedupe.
  let acctRows = state.acctOptions || [];
  if (state.backend) acctRows = acctRows.filter(r => bucketBe(r) === state.backend);
  if (acctRows.length > 1) {
    const GLOBALS = [
      { key: '__global__', label: t('Claude CLI login'), link: app._usageGlobal },
      { key: '__global_codex__', label: t('Codex CLI login'), link: app._usageCodexGlobal },
    ];
    const isGlobalKey = (k) => GLOBALS.some(G => G.key === k);
    const opts = [{ key: '', label: t('All') }];
    const mergedGlobals = new Set();
    for (const r of acctRows) {
      if (isGlobalKey(r.key)) continue;
      const g = GLOBALS.find(G => G.link?.accountId === r.key && acctRows.some(x => x.key === G.key));
      if (g) {
        mergedGlobals.add(g.key);
        opts.push({ key: `${r.key},${g.key}`, label: (r.name || r.key) + ' ✦', iconHtml: beIc(bucketBe(r)), tip: t('Same account as the machine CLI login — includes its (unattributed) usage too') });
      } else {
        opts.push({ key: r.key, label: r.name || r.key, iconHtml: beIc(bucketBe(r)), tip: r.deleted ? t('Account was removed from VibeSpace — history kept') : (r.tail ? `…${r.tail}` : '') });
      }
    }
    for (const G of GLOBALS) {
      if (mergedGlobals.has(G.key)) continue;
      if (acctRows.some(r => r.key === G.key)) opts.push({ key: G.key, label: G.label, iconHtml: beIc(bucketBe({ key: G.key })), tip: t('Sessions that ran on the machine’s own login (no VibeSpace account selected)') });
    }
    bar.appendChild(labelled(t('Account'), seg(opts, state.account, k => { state.account = k; load(); })));
  }
  bar.appendChild(labelled(t('Bars show'), seg([
    { key: 'cost', label: t('Cost') }, { key: 'totalTokens', label: t('Tokens') },
  ], state.metric, k => { state.metric = k; load(); })));
  const spacer = document.createElement('div'); spacer.style.flex = '1'; bar.appendChild(spacer);
  // Dashboard controls (2.96.0): preset templates + classic-layout escape hatch
  const dashBtn = document.createElement('button'); dashBtn.className = 'usage-btn';
  dashBtn.textContent = state.view === 'classic' ? t('Classic view') : t('Panels…');
  dashBtn.onclick = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const presets = PRESETS();
    showContextMenu(r.left, r.bottom + 4, [
      ...Object.entries(presets).map(([key, p]) => ({
        label: t('Preset: {name}', { name: p.label }),
        // load(), not rerender(): a preset can carry split-series panels whose
        // 2-D pivots the last fetch didn't request (accounts preset does).
        action: () => { app.settings.set('usage.dashboard', p.panels); state.view = 'dash'; load(); },
      })),
      { label: state.view === 'classic' ? t('Switch to panel dashboard') : t('Switch to classic layout'),
        action: () => { state.view = state.view === 'classic' ? 'dash' : 'classic'; rerender(); } },
    ]);
  };
  const priceBtn = document.createElement('button'); priceBtn.className = 'usage-btn'; priceBtn.textContent = t('Pricing…');
  priceBtn.title = t('Edit per-model rates and per-account discounts');
  priceBtn.onclick = () => { state.view = 'pricing'; rerender(); };
  const csv = document.createElement('button'); csv.className = 'usage-btn'; csv.textContent = t('Export CSV');
  csv.onclick = () => exportCsv(state.data);
  const refresh = document.createElement('button'); refresh.className = 'usage-btn'; refresh.textContent = t('Refresh');
  refresh.onclick = load;
  bar.append(dashBtn, priceBtn, csv, refresh);
  return bar;
}

// Per-model rates + per-account discount/override editor. Saves via PATCH to
// /api/usage-stats/pricing (merges), then reloads the dashboard so costs update.
function renderPricingEditor(state, rerender, reload) {
  const wrap = document.createElement('div'); wrap.className = 'usage-pricing';
  const pricing = (state.data && state.data.pricing) || { tiers: {}, accounts: {} };
  // Accounts from the UNFILTERED union — the editor must list every account,
  // not just whatever the currently-active backend/account filter left visible
  // (a codex-filtered dashboard used to shrink this to one row).
  const accounts = (state.acctOptions || (state.data?.groups?.account) || []).filter(a => a.key !== '__global__' && a.key !== '__global_codex__');
  const TIERS = Object.keys(pricing.tiers || {}).filter(k => k !== '_default');
  const FIELDS = [['input', t('Input')], ['output', t('Output')], ['cacheWrite5m', t('Cache write 5m')], ['cacheWrite1h', t('Cache write 1h')], ['cacheRead', t('Cache read')]];
  const edited = { tiers: {}, accounts: {} };

  const note = document.createElement('div'); note.className = 'usage-note';
  note.innerHTML = escHtml(t('USD per million tokens. Default rates apply to every account (subscriptions bill as this API-equivalent reference). Give an API-key account a discount % or its own rates — different keys really do bill differently.'));
  wrap.appendChild(note);

  // Default per-model rates
  const tsec = document.createElement('div'); tsec.className = 'usage-section';
  tsec.innerHTML = `<div class="usage-section-title">${t('Default rates ($ / Mtok)')}</div>`;
  const tbl = document.createElement('table'); tbl.className = 'usage-price-tbl';
  tbl.innerHTML = `<tr><th>${t('Model')}</th>${FIELDS.map(f => `<th>${f[1]}</th>`).join('')}</tr>`;
  for (const tier of TIERS) {
    const row = document.createElement('tr');
    row.innerHTML = `<td>${tier}</td>`;
    for (const [fk] of FIELDS) {
      const td = document.createElement('td');
      const inp = document.createElement('input'); inp.type = 'number'; inp.step = '0.01'; inp.className = 'usage-price-inp';
      inp.value = (pricing.tiers?.[tier]?.[fk] ?? '');
      inp.oninput = () => { (edited.tiers[tier] = edited.tiers[tier] || { ...(pricing.tiers?.[tier] || {}) })[fk] = parseFloat(inp.value) || 0; };
      td.appendChild(inp); row.appendChild(td);
    }
    tbl.appendChild(row);
  }
  tsec.appendChild(tbl); wrap.appendChild(tsec);

  // Per-account discount / override
  const asec = document.createElement('div'); asec.className = 'usage-section';
  asec.innerHTML = `<div class="usage-section-title">${t('Per-account discount')}</div>`;
  if (!accounts.length) { asec.appendChild(emptyLine()); }
  for (const a of accounts) {
    const cur = pricing.accounts?.[a.key] || {};
    const row = document.createElement('div'); row.className = 'usage-bar-row';
    const badge = beIc(bucketBe(a)) + (a.type ? typeBadge(a.type, a.deleted) : '');
    const discPct = typeof cur.discount === 'number' ? Math.round(cur.discount * 100) : '';
    row.innerHTML = `<span class="usage-bar-label">${badge}${escHtml(a.name || a.key)}</span>`;
    const ctrl = document.createElement('span'); ctrl.style.cssText = 'display:flex;align-items:center;gap:6px;grid-column:2/4';
    const inp = document.createElement('input'); inp.type = 'number'; inp.min = '0'; inp.max = '99'; inp.step = '1'; inp.className = 'usage-price-inp'; inp.style.width = '64px'; inp.value = discPct; inp.placeholder = '0';
    const suffix = document.createElement('span'); suffix.className = 'usage-note'; suffix.style.margin = '0'; suffix.textContent = t('% off (subscriptions ignore this)');
    inp.oninput = () => {
      const v = parseFloat(inp.value);
      edited.accounts[a.key] = (Number.isFinite(v) && v > 0) ? { discount: Math.min(0.99, v / 100) } : null; // null clears
    };
    ctrl.append(inp, suffix); row.appendChild(ctrl); asec.appendChild(row);
  }
  wrap.appendChild(asec);

  const actions = document.createElement('div'); actions.style.cssText = 'display:flex;gap:8px;padding:6px 0';
  const save = document.createElement('button'); save.className = 'usage-btn'; save.textContent = t('Save prices');
  save.onclick = async () => {
    save.disabled = true;
    const patch = {};
    if (Object.keys(edited.tiers).length) patch.tiers = edited.tiers;
    if (Object.keys(edited.accounts).length) patch.accounts = edited.accounts;
    try {
      await fetchJson('/api/usage-stats/pricing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
      showToast(t('Prices saved'));
      state.view = 'dash';
      reload(); // re-fetch so costs reflect the new prices
    } catch { showToast(t('Save failed'), { type: 'error' }); save.disabled = false; }
  };
  const cancel = document.createElement('button'); cancel.className = 'usage-btn'; cancel.textContent = t('Cancel');
  cancel.onclick = () => { state.view = 'dash'; rerender(); };
  actions.append(save, cancel);
  wrap.appendChild(actions);
  return wrap;
}
function labelled(label, el) {
  const w = document.createElement('div'); w.className = 'usage-ctl';
  const l = document.createElement('span'); l.className = 'usage-ctl-label'; l.textContent = label;
  w.append(l, el); return w;
}

function renderTiles(d) {
  const T = d.totals;
  const wrap = document.createElement('div'); wrap.className = 'usage-tiles';
  const tile = (label, value, sub, cls) => `<div class="usage-tile${cls ? ' ' + cls : ''}"><div class="usage-tile-v">${value}</div><div class="usage-tile-l">${label}</div>${sub ? `<div class="usage-tile-s">${sub}</div>` : ''}</div>`;
  // Codex rollouts don't report cache-write token counts at all — when the view
  // is codex-only, an honest "—" beats a fake 0 (in mixed views the number is
  // the Claude-side sum; codex contributes nothing by construction).
  const billingKeys = (d.groups?.billing || []).map(r => r.key);
  const codexOnly = billingKeys.length > 0 && billingKeys.every(k => k === 'chatgpt' || k === 'codex-cli-login');
  // Total tokens = cached reads + cache writes + fresh input + output. Cached
  // reads usually DOMINATE (>95%), so it gets its own tile — otherwise the total
  // looks like it doesn't add up from what's shown. The four component tiles are
  // grouped (.comp) right after Total so they visibly sum to it.
  wrap.innerHTML = [
    tile(t('Est. API-equivalent cost'), fmtCost(T.cost), t('subscriptions are plan-covered'), 'accent'),
    tile(t('Requests'), fmtNum(T.requests), `${fmtNum(T.sessions)} ${t('sessions')}`),
    tile(t('Cache hit ratio'), fmtPct(T.cacheHitRatio), t('of input tokens')),
    tile(t('Total tokens'), fmtNum(T.totalTokens), t('= the 4 components →'), 'total'),
    tile(t('Cached reads'), fmtNum(T.cacheRead), `${fmtPct(T.cacheHitRatio)} · ${t('billed ~10%')}`, 'comp'),
    codexOnly
      ? tile(t('Cache writes'), '—', t('not reported by Codex'), 'comp')
      : tile(t('Cache writes'), fmtNum(T.cacheWrite), `${fmtNum(T.cacheWrite1h || 0)} 1h · ${t('~1.25–2×')}`, 'comp'),
    tile(t('Fresh input'), fmtNum(T.input), t('non-cached'), 'comp'),
    tile(t('Output'), fmtNum(T.output), t('generated'), 'comp'),
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
  'cli-global-login': { label: () => t('Claude CLI login (unattributed)'), cls: 'global' },
  'codex-cli-login': { label: () => t('Codex CLI login (unattributed)'), cls: 'global' },
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
    if (opts.session) label = r.name || r.key.slice(0, 8); // name from session-meta (VibeSpace sessions)
    let badge = opts.badge && r.type ? typeBadge(r.type, r.deleted) : '';
    if (opts.beIcon || opts.badge || opts.session) badge = beIc(r.be || (opts.badge ? bucketBe(r) : null)) + badge;
    sec.appendChild(barRow(label, r, max, metric, { badge, title: opts.path ? r.key : (opts.session ? r.key : label) }));
  }
  return sec;
}

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
