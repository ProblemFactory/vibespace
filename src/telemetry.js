/**
 * Telemetry — local-first observability for iterating after internal rollout.
 *
 * PRIVACY MODEL: everything lands in data/telemetry/*.ndjson on THIS instance
 * only. An instance can OPT IN to forwarding batches to a central collector
 * (setting telemetry.forwardUrl) — for company deployments where one team
 * iterates on many users' instances. No payload ever includes file contents,
 * prompts, or transcripts: events carry type/name/version/ua + error stacks.
 *
 * Event shape: { ts, kind: 'error'|'event'|'boot'|'server-error',
 *                name, detail?, stack?, version, ua?, sid? }
 */
const fs = require('fs');
const path = require('path');

class Telemetry {
  constructor({ dataDir, version, getForwardUrl }) {
    this.dir = path.join(dataDir, 'telemetry');
    this.version = version;
    this._getForwardUrl = getForwardUrl || (() => '');
    this._buf = [];
    this._flushTimer = null;
    try { fs.mkdirSync(this.dir, { recursive: true }); } catch {}
  }

  _shard(ts) {
    const d = new Date(ts);
    return path.join(this.dir, `events-${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}.ndjson`);
  }

  record(ev) {
    const rec = {
      ts: Date.now(),
      kind: String(ev.kind || 'event').slice(0, 24),
      name: String(ev.name || '').slice(0, 120),
      detail: ev.detail != null ? String(ev.detail).slice(0, 2000) : undefined,
      stack: ev.stack != null ? String(ev.stack).slice(0, 4000) : undefined,
      version: ev.version || this.version,
      ua: ev.ua ? String(ev.ua).slice(0, 160) : undefined,
      // Numeric metrics (kind:'metric') — aggregated into percentiles by summary()
      value: Number.isFinite(ev.value) ? ev.value : undefined,
    };
    this._buf.push(rec);
    if (!this._flushTimer) this._flushTimer = setTimeout(() => this.flush(), 2000);
    return rec;
  }

  flush() {
    if (this._flushTimer) { clearTimeout(this._flushTimer); this._flushTimer = null; }
    if (!this._buf.length) return;
    const batch = this._buf.splice(0);
    const byShard = new Map();
    for (const r of batch) {
      const f = this._shard(r.ts);
      byShard.set(f, (byShard.get(f) || '') + JSON.stringify(r) + '\n');
    }
    for (const [f, text] of byShard) {
      try { fs.appendFileSync(f, text); } catch {}
    }
    this._forward(batch);
  }

  // Optional central collector (company rollout): fire-and-forget batches.
  _forward(batch) {
    const url = this._getForwardUrl();
    if (!url || !/^https?:\/\//.test(url)) return;
    try {
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instance: this._instanceId(), events: batch }),
        signal: AbortSignal.timeout(5000),
      }).catch(() => {});
    } catch {}
  }

  _instanceId() {
    // Stable anonymous id per instance (not per user identity).
    if (this._iid) return this._iid;
    const f = path.join(this.dir, '.instance-id');
    try { this._iid = fs.readFileSync(f, 'utf-8').trim(); } catch {}
    if (!this._iid) {
      this._iid = 'vs-' + require('crypto').randomBytes(6).toString('hex');
      try { fs.writeFileSync(f, this._iid); } catch {}
    }
    return this._iid;
  }

  // Aggregate for the report: totals by kind/name/version/day + recent errors.
  summary({ days = 14 } = {}) {
    const from = Date.now() - days * 86400000;
    const byName = {}; const byDay = {}; const byVersion = {};
    const errors = [];
    const metricVals = {}; // name → number[] (kind:'metric')
    let total = 0;
    let files = [];
    try { files = fs.readdirSync(this.dir).filter((f) => /^events-\d{4}-\d{2}\.ndjson$/.test(f)).sort().slice(-3); } catch {}
    for (const fn of files) {
      let data = '';
      try { data = fs.readFileSync(path.join(this.dir, fn), 'utf-8'); } catch { continue; }
      for (const line of data.split('\n')) {
        if (!line) continue;
        let r; try { r = JSON.parse(line); } catch { continue; }
        if (r.ts < from) continue;
        total++;
        const key = `${r.kind}:${r.name}`;
        byName[key] = (byName[key] || 0) + 1;
        const day = new Date(r.ts).toISOString().slice(0, 10);
        byDay[day] = (byDay[day] || 0) + 1;
        if (r.version) byVersion[r.version] = (byVersion[r.version] || 0) + 1;
        if (r.kind === 'error' || r.kind === 'server-error') {
          errors.push({ ts: r.ts, name: r.name, detail: r.detail, stack: r.stack, version: r.version });
        }
        if (r.kind === 'metric' && Number.isFinite(r.value)) {
          (metricVals[r.name] = metricVals[r.name] || []).push(r.value);
        }
      }
    }
    errors.sort((a, b) => b.ts - a.ts);
    // Group identical errors so one hot loop doesn't drown the list.
    const grouped = new Map();
    for (const e of errors) {
      const k = `${e.name}|${(e.stack || e.detail || '').slice(0, 200)}`;
      const g = grouped.get(k);
      if (g) { g.count++; g.lastTs = Math.max(g.lastTs, e.ts); }
      else grouped.set(k, { ...e, count: 1, lastTs: e.ts });
    }
    // Percentile aggregation per metric — vals arrive in file order, i.e.
    // chronological, so `last` is the newest sample.
    const metrics = {};
    for (const [name, vals] of Object.entries(metricVals)) {
      const sorted = [...vals].sort((a, b) => a - b);
      const pick = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
      metrics[name] = {
        count: vals.length,
        avg: Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10,
        p50: pick(0.5), p95: pick(0.95), max: sorted[sorted.length - 1],
        last: vals[vals.length - 1],
      };
    }
    return {
      days, total,
      byName: Object.fromEntries(Object.entries(byName).sort((a, b) => b[1] - a[1])),
      byDay, byVersion, metrics,
      errors: [...grouped.values()].sort((a, b) => b.lastTs - a.lastTs).slice(0, 50),
      instance: this._instanceId(),
    };
  }
}

module.exports = { Telemetry };
