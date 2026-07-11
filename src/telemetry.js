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
  constructor({ dataDir, version, getForwardUrl, getForwardToken }) {
    this.dir = path.join(dataDir, 'telemetry');
    this.version = version;
    this._getForwardUrl = getForwardUrl || (() => '');
    this._getForwardToken = getForwardToken || (() => '');
    this._buf = [];
    this._flushTimer = null;
    try { fs.mkdirSync(this.dir, { recursive: true }); } catch {}
  }

  _shard(ts) {
    const d = new Date(ts);
    return path.join(this.dir, `events-${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}.ndjson`);
  }

  // Shared sanitizer for local records AND forwarded batches. Remote events
  // keep their ORIGINAL ts (clamped to a sane window so a bad clock can't
  // scatter shards) and their own version — never this instance's.
  _clean(ev, { remote = false } = {}) {
    const now = Date.now();
    let ts = now;
    if (remote && Number.isFinite(ev.ts)) ts = Math.min(now + 300000, Math.max(now - 90 * 86400000, ev.ts));
    return {
      ts,
      kind: String(ev.kind || 'event').slice(0, 24),
      name: String(ev.name || '').slice(0, 120),
      // kind:'trace' = diagnostic ring-buffer dumps (e.g. chat-scroll-jump)
      // — they need the whole buffer, not a 2KB head
      detail: ev.detail != null ? String(ev.detail).slice(0, ev.kind === 'trace' ? 65536 : 2000) : undefined,
      stack: ev.stack != null ? String(ev.stack).slice(0, 4000) : undefined,
      version: ev.version || (remote ? undefined : this.version),
      ua: ev.ua ? String(ev.ua).slice(0, 160) : undefined,
      // Numeric metrics (kind:'metric') — aggregated into percentiles by summary()
      value: Number.isFinite(ev.value) ? ev.value : undefined,
    };
  }

  record(ev) {
    const rec = this._clean(ev);
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
    const headers = { 'Content-Type': 'application/json' };
    const tok = String(this._getForwardToken() || '').trim();
    if (tok) headers.Authorization = `Bearer ${tok}`;
    try {
      fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ instance: this._instanceId(), events: batch }),
        signal: AbortSignal.timeout(5000),
      }).catch(() => {});
    } catch {}
  }

  // ── Collector side (team deployments): batches forwarded by OTHER instances
  // land in their own central-YYYY-MM.ndjson shards, each record stamped with
  // the sender's anonymous instance id. Same privacy model as local events. ──
  _centralShard(ts) {
    const d = new Date(ts);
    return path.join(this.dir, `central-${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}.ndjson`);
  }

  ingestRemote(instance, events) {
    const inst = String(instance || '').slice(0, 40).replace(/[^\w.-]/g, '') || 'unknown';
    const list = Array.isArray(events) ? events.slice(0, 500) : [];
    const byShard = new Map();
    let n = 0;
    for (const ev of list) {
      if (!ev || typeof ev !== 'object') continue;
      const rec = this._clean(ev, { remote: true });
      rec.inst = inst;
      const f = this._centralShard(rec.ts);
      byShard.set(f, (byShard.get(f) || '') + JSON.stringify(rec) + '\n');
      n++;
    }
    for (const [f, text] of byShard) {
      try { fs.appendFileSync(f, text); } catch {}
    }
    return n;
  }

  // Fleet aggregate for the diagnostics report: per-instance totals + errors
  // grouped across instances. Reads central-* shards only (local events stay
  // in summary()) — user-initiated, so per-call reads are fine like summary().
  centralSummary({ days = 14 } = {}) {
    const from = Date.now() - days * 86400000;
    const instances = {}; // id → { total, errors, lastTs, versions:{} }
    const errors = [];
    let total = 0;
    let files = [];
    try { files = fs.readdirSync(this.dir).filter((f) => /^central-\d{4}-\d{2}\.ndjson$/.test(f)).sort().slice(-3); } catch {}
    for (const fn of files) {
      let data = '';
      try { data = fs.readFileSync(path.join(this.dir, fn), 'utf-8'); } catch { continue; }
      for (const line of data.split('\n')) {
        if (!line) continue;
        let r; try { r = JSON.parse(line); } catch { continue; }
        if (r.ts < from) continue;
        total++;
        const g = instances[r.inst] || (instances[r.inst] = { total: 0, errors: 0, lastTs: 0, versions: {} });
        g.total++;
        g.lastTs = Math.max(g.lastTs, r.ts);
        if (r.version) g.versions[r.version] = (g.versions[r.version] || 0) + 1;
        if (r.kind === 'error' || r.kind === 'server-error') {
          g.errors++;
          errors.push({ ts: r.ts, inst: r.inst, name: r.name, detail: r.detail, stack: r.stack, version: r.version });
        }
      }
    }
    const grouped = new Map();
    for (const e of errors) {
      const k = `${e.name}|${(e.stack || e.detail || '').slice(0, 200)}`;
      const g = grouped.get(k);
      if (g) { g.count++; g.lastTs = Math.max(g.lastTs, e.ts); g.instances[e.inst] = (g.instances[e.inst] || 0) + 1; }
      else grouped.set(k, { ...e, count: 1, lastTs: e.ts, instances: { [e.inst]: 1 } });
    }
    return {
      days, total,
      instances: Object.fromEntries(Object.entries(instances).sort((a, b) => b[1].lastTs - a[1].lastTs)),
      errors: [...grouped.values()].sort((a, b) => b.lastTs - a.lastTs).slice(0, 50),
    };
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
