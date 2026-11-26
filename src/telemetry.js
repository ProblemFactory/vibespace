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
const { timedSync } = require('./timed-sync.js'); // PURE: the store-read clock (design 011 lane 1, store-timing) — the instance id's one read
const SR = require('./store-read.js');            // B-f276 (r4721): the store-read law — the instance id's read has three answers
const HOLD = require('./store-read-hold.js');     // … and its HOLD when the read fails or its bytes are torn (never a new id over the file)
const IID_PARSE = (t) => String(t).trim();
const IID_SHAPE = (v) => typeof v === 'string' && /^[\x21-\x7e]{1,200}$/.test(v);   // one printable word (the release mints `vs-` + 12 hex)
const IID_MINT = () => 'vs-' + require('crypto').randomBytes(6).toString('hex');
const { isBrowserNote } = require('./browser-notes.js'); // B-402f: the browser's ResizeObserver loop note — never an error group (older pages sent it as one)

class Telemetry {
  constructor({ dataDir, version, getForwardUrl, getForwardToken, summaryTimeoutMs = 0, summaryReadMs = 0, summaryPool: pool = null }) {
    this.dir = path.join(dataDir, 'telemetry');
    this.version = version;
    this._getForwardUrl = getForwardUrl || (() => '');
    this._getForwardToken = getForwardToken || (() => '');
    this._buf = [];
    this._flushTimer = null;
    this._asks = new Map();   // B-360d unit 2: the summary READS in flight, one a window (each keyed by its summary AND its days)
    this._kept = new Map();   // B-360d r887 (5): a read that outlived every ask's reply, kept for the next ask (KEPT_MS)
    this._summaryMs = Number(summaryTimeoutMs) > 0 ? Number(summaryTimeoutMs) : SUMMARY_TIMEOUT_MS;   // an ASK's reply deadline (a suite places a short one)
    this._readMs = Number(summaryReadMs) > 0 ? Number(summaryReadMs) : SUMMARY_READ_MS;   // the READ's own (the worker's) deadline
    this._pool = pool;   // a suite hands its own pool (a short hung-path memory); the product's is the module's
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
    // the client's OWN clock (2.369.143): batches flush 15 s apart or later
    // under a stall, so `ts` (receipt) misplaces an event by up to the stall —
    // keep `cts` when it is sane (within 10 min of receipt) for timelines.
    const cts = Number.isFinite(ev.t) && Math.abs(now - ev.t) < 600000 ? ev.t : undefined;
    return {
      ts, cts,
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

  /** the forward target as configured (settings first, then the deployment env) — lane feedback-forward: an agent's
   *  feedback report rides the same target to the maintainer hub (src/server/feedback-forward.js) */
  forwardTarget() { return { url: String(this._getForwardUrl() || ''), token: String(this._getForwardToken() || '').trim() }; }

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
      }).then((res) => { if (typeof this.onForwardAnswer === 'function') this.onForwardAnswer(url, res); }).catch(() => {});   // lane feedback-forward-404: the feedback forward reads its target's release off this answer
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

  // ── THE TWO SUMMARIES OFF THE LOOP (B-360d unit 2, lane bl-keys-misc — the owner's hub on 2.369.413: ONE loop hold of 5.7 s at
  //    the Diagnostics report's read, the folder listed and up to three monthly files read and parsed line by line on the data
  //    folder's mount). The listing, the reads and the summing run in the «telemetry-summary» worker (src/telemetry-summary-worker.js
  //    on a pool of one); the answer is the same object as before, field for field (the PURE summarizeEvents / summarizeCentral,
  //    moved verbatim). ONE READ IN FLIGHT a window: a second ask meanwhile waits for the same answer. → a Promise.
  //    r887: TWO DEADLINES. An ASK's reply ends at SUMMARY_TIMEOUT_MS (503 «still-reading»: the route says it, the page says «wait a
  //    moment and open it again»); the READ goes on to its own SUMMARY_READ_MS — a slow disk that is alive finishes it, and an answer
  //    no ask was left to take is KEPT (KEPT_MS) for the next ask. A read past its own deadline ends its worker (503): the pool then
  //    refuses that folder by name for its bounded time (SafeFs's hung-path memory reads `path`), never one more thread a press. ──
  summary({ days = 14, now = Date.now() } = {}) {
    return this._offLoop('telemetrySummary', { path: this.dir, days, now }).then((r) => ({ ...r, instance: this._instanceId() }));
  }
  centralSummary({ days = 14, now = Date.now() } = {}) {   // the fleet aggregate: per-instance totals + errors over the central-* shards
    return this._offLoop('centralSummary', { path: this.dir, days, now });
  }
  _offLoop(op, payload) {
    const k = `${op}|${payload.days}`;
    const kept = this._kept.get(k);
    if (kept) { this._kept.delete(k); if (Date.now() - kept.at < KEPT_MS) return Promise.resolve(kept.value); }
    let read = this._asks.get(k);
    if (!read) {
      const r = read = { waiting: 0, p: (this._pool || summaryPool()).call(op, payload, { timeoutMs: this._readMs }) };
      const done = () => { if (this._asks.get(k) === r) this._asks.delete(k); };
      r.p.then((value) => { done(); if (!r.waiting) this._kept.set(k, { at: Date.now(), value }); }, done);   // no ask left to take it: kept
      this._asks.set(k, r);
    }
    const r = read;
    r.waiting++;
    let timer = null;
    const reply = new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error(`still being read — more than ${(this._summaryMs / 1000).toFixed(this._summaryMs < 10000 ? 1 : 0)} s so far`), { status: 503, code: 'still-reading' })), this._summaryMs);
      if (timer.unref) timer.unref();
    });
    return Promise.race([r.p, reply]).finally(() => { clearTimeout(timer); r.waiting--; });
  }

  _instanceId() {
    // Stable anonymous id per instance (not per user identity).
    if (this._iid) return this._iid;
    if (this._iidHeld) return this._iidHeld.mine;   // B-f276 (r4721): HELD — this life's own id (memory only); the file is read again off the loop
    const f = path.join(this.dir, '.instance-id');
    let read;
    try { read = { text: timedSync('telemetry.read', () => fs.readFileSync(f, 'utf-8')) }; } catch (error) { read = { error }; }   // the folder's one read left on the loop (timed)
    const a = SR.storeAnswer(read, { parse: IID_PARSE, valid: IID_SHAPE });
    if (a.state === 'data') return (this._iid = a.value);
    if (a.state === 'missing') {   // a first run: minted and written, as the release
      this._iid = IID_MINT();
      try { timedSync('telemetry-id.write', () => fs.writeFileSync(f, this._iid)); } catch {}   // its one sync write, timed (§72)
      return this._iid;
    }
    // B-f276 (r4721, lane lg-vault-stages): a read that FAILED, or torn bytes, is HELD (src/store-read-hold.js) — never a new id over
    // the file. This life answers its own id from memory (a batch forwarded meanwhile carries it: the collector sees this life apart,
    // and the file keeps its id for the next one); the file is read again off the loop: its id back ⇒ this life takes it; not there
    // twice, or its torn bytes kept aside ⇒ this life's id becomes the file's (written off the loop)
    const mine = IID_MINT();
    const hold = HOLD.create({
      file: f, parse: IID_PARSE, valid: IID_SHAPE, aside: (m) => `${f}.corrupt-${m}`, code: 'instance_id_unread', log: (l) => console.warn(`[telemetry] ${l}`),
      words: (h) => `this VibeSpace's anonymous usage id could not be read${h && h.code ? ` (${h.code})` : ''} — nothing is written over it, and it is read again by itself`,
      onLift: (value) => {
        this._iid = value || mine; this._iidHeld = null;
        if (!value) {   // THE STORE WRITER's thread writes it (whole, synced, then put in place) — never the hub's loop
          const id = this._iid;
          try { require('./store-writer.js').storeWriter().dirty(f, { name: 'telemetry-id.write', rank: 0, makeDir: true, produce: () => id }); }
          catch (e) { console.warn(`[telemetry] .instance-id: this run's id could not be handed to the store writer (${(e && e.code) || 'error'}) — this run keeps it`); }
        }
      },
    });
    this._iidHeld = { mine, hold };
    hold.start(a);
    return mine;
  }

  /** THE HELD SECONDS PER DAY BY CAUSE (lane hub-loop-stalls, «the number»: the owner's hub, 2026-11-16) — PURE, DERIVED
   *  from the rows the hub already keeps; no file, no notice, no budget of its own. The rows: kind 'metric', name
   *  'srv-loop-hold-ms' — ONE a hold of a second or more, written by src/server/loop-holds.js onHold as the loop turns again:
   *  `value` = the hold's ms, `detail` = «verdict · frame» (« · (the boot)» after a boot's own hold). THE CAUSE = the hourly
   *  report's own key (src/loop-day-report.js causeOf — loop-day-report R5: the day and its hours key alike): a tie's fixed word
   *  (r116 / r147), else the hub's code location in the frame, else the verdict's fixed words (none ⇒ NO_CAUSE); a BOOT's hold is apart — `boot` {ms, count} of
   *  each period, never in its ms, count or causes. THE DAY CUT IS UTC: a row's day = the UTC date of its `ts` (as byDay and the monthly shards) — so a hold
   *  across midnight counts on the day it ended; today = the UTC date of `now`, yesterday = the UTC date before it, the
   *  seven days = today and the six UTC dates before it (a row dated after today counts nowhere). Each period:
   *  {from, to, ms, count, causes: [{cause, ms, count}] — the larger ms first}; `ms` = the plain sum of the rows' values. */
  static heldDays(rows, now = Date.now()) {
    const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);
    const today = dayOf(now), yesterday = dayOf(now - 86400000), weekFrom = dayOf(now - 6 * 86400000);
    const period = (from, to) => ({ from, to, ms: 0, count: 0, by: new Map(), boot: { ms: 0, count: 0 } });
    const LDR = require('./loop-day-report.js');
    const out = { today: period(today, today), yesterday: period(yesterday, yesterday), week: period(weekFrom, today) };
    for (const r of Array.isArray(rows) ? rows : []) {
      if (!r || r.kind !== 'metric' || r.name !== HOLD_ROW || !Number.isFinite(r.ts) || !Number.isFinite(r.value) || r.value < 0) continue;
      const day = dayOf(r.ts);
      let d = typeof r.detail === 'string' ? r.detail : '';
      const boot = d.endsWith(' · (the boot)');
      if (boot) d = d.slice(0, -' · (the boot)'.length);
      const noOurs = d.endsWith(' · (no frame of ours)');   // the hold book's mark (a row with no frame of the tree): the hour's cause
      if (noOurs) d = d.slice(0, -' · (no frame of ours)'.length);
      const cut = d.indexOf(' · ');
      const verdict = (cut < 0 ? d : d.slice(0, cut)).trim(), frame = cut < 0 ? null : d.slice(cut + 3);
      const cause = verdict || frame ? LDR.causeOf({ verdict: verdict || null, frame, noOurs }) : NO_CAUSE;
      for (const p of Object.values(out)) {
        if (day < p.from || day > p.to) continue;
        if (boot) { p.boot.ms += r.value; p.boot.count++; continue; }
        p.ms += r.value; p.count++;
        const c = p.by.get(cause) || { cause, ms: 0, count: 0 };
        c.ms += r.value; c.count++;
        p.by.set(cause, c);
      }
    }
    const done = ({ by, ...p }) => ({ ...p, causes: [...by.values()].sort((a, b) => b.ms - a.ms || (a.cause < b.cause ? -1 : 1)) });
    return { cut: 'UTC', today: done(out.today), yesterday: done(out.yesterday), week: done(out.week) };
  }
}
/** the main loop's hold row (src/server/loop-holds.js) and the cause of one that names none */
const HOLD_ROW = 'srv-loop-hold-ms';
const NO_CAUSE = '(no cause recorded)';

/** B-360d unit 2 — THE REPORT'S AGGREGATE, PURE (moved verbatim from Telemetry#summary: the totals by kind / name / version / day, the
 *  recent errors grouped, the metrics' percentiles, the harness drift, the held seconds) over the TEXTS of the newest monthly event
 *  files (`events-YYYY-MM.ndjson`, the three newest, in name order — the worker reads them). `now` = the clock the window and the days
 *  are read against. */
function summarizeEvents(texts, { days = 14, now = Date.now() } = {}) {
  {
    const from = now - days * 86400000;
    const byName = {}; const byDay = {}; const byVersion = {};
    const errors = [];
    const metricVals = {}; // name → number[] (kind:'metric')
    // HARNESS DRIFT (design-unknown-records §3): the schema-drift breadcrumb +
    // the two unknown-record breadcrumbs, grouped by name+detail with first/
    // last seen and the versions that reported them — the Diagnostics report's
    // "Harness drift" block, so a new CLI build's additions are read off one
    // table instead of fished out of byName.
    const drift = new Map(); // `${name}|${detail}` → {name, detail, count, firstTs, lastTs, versions:Set}
    let total = 0;
    const held = [];   // the main loop's hold rows of the last seven UTC days, whatever `days` is (Telemetry.heldDays)
    const heldFrom = Telemetry.heldDays([], now).week.from;
    for (const data of texts) {
      for (const line of String(data || '').split('\n')) {
        if (!line) continue;
        let r; try { r = JSON.parse(line); } catch { continue; }
        if (r && r.name === HOLD_ROW && r.kind === 'metric' && Number.isFinite(r.ts) && new Date(r.ts).toISOString().slice(0, 10) >= heldFrom) held.push(r);
        if (r.ts < from) continue;
        total++;
        const key = `${r.kind}:${r.name}`;
        byName[key] = (byName[key] || 0) + 1;
        const day = new Date(r.ts).toISOString().slice(0, 10);
        byDay[day] = (byDay[day] || 0) + 1;
        if (r.version) byVersion[r.version] = (byVersion[r.version] || 0) + 1;
        if ((r.kind === 'error' || r.kind === 'server-error') && !(r.kind === 'error' && isBrowserNote(r.name))) {
          errors.push({ ts: r.ts, name: r.name, detail: r.detail, stack: r.stack, version: r.version });
        }
        if (r.kind === 'metric' && Number.isFinite(r.value)) {
          (metricVals[r.name] = metricVals[r.name] || []).push(r.value);
        }
        if (r.kind === 'event' && typeof r.name === 'string' && /^(harness-shape-drift$|cli-unknown-|codex-unknown-record:)/.test(r.name)) {
          const detail = typeof r.detail === 'string' ? r.detail.slice(0, 200) : (r.detail == null ? '' : JSON.stringify(r.detail).slice(0, 200));
          const k = r.name + '|' + detail;
          const g = drift.get(k) || { name: r.name, detail, count: 0, firstTs: r.ts, lastTs: r.ts, versions: new Set() };
          g.count++; g.firstTs = Math.min(g.firstTs, r.ts); g.lastTs = Math.max(g.lastTs, r.ts);
          if (r.version) g.versions.add(r.version);
          drift.set(k, g);
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
      drift: [...drift.values()].sort((a, b) => b.lastTs - a.lastTs).slice(0, 100).map((g) => ({ ...g, versions: [...g.versions].sort() })),
      loopHeld: Telemetry.heldDays(held, now),   // ⚙ Diagnostics «Main loop held»: the held seconds per day by cause
    };
  }
}


/** …and the fleet's (moved verbatim from Telemetry#centralSummary), over the central-* shards' texts. */
function summarizeCentral(texts, { days = 14, now = Date.now() } = {}) {
  {
    const from = now - days * 86400000;
    const instances = {}; // id → { total, errors, lastTs, versions:{} }
    const errors = [];
    let total = 0;
    for (const data of texts) {
      for (const line of String(data || '').split('\n')) {
        if (!line) continue;
        let r; try { r = JSON.parse(line); } catch { continue; }
        if (r.ts < from) continue;
        total++;
        const g = instances[r.inst] || (instances[r.inst] = { total: 0, errors: 0, lastTs: 0, versions: {} });
        g.total++;
        g.lastTs = Math.max(g.lastTs, r.ts);
        if (r.version) g.versions[r.version] = (g.versions[r.version] || 0) + 1;
        if ((r.kind === 'error' || r.kind === 'server-error') && !(r.kind === 'error' && isBrowserNote(r.name))) {   // B-402f: the browser's note is no error in the fleet view either
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
}

/** the newest monthly shards of a kind in the telemetry folder, in name order (the worker's listing: `events-` / `central-`) */
const SHARD_RE = Object.freeze({ events: /^events-\d{4}-\d{2}\.ndjson$/, central: /^central-\d{4}-\d{2}\.ndjson$/ });
const SUMMARY_TIMEOUT_MS = 20000;   // an ask not answered in 20 s is said (503 still-reading); its read goes on
const SUMMARY_READ_MS = 120000;     // B-360d r887: a read that has not answered in 2 min ends its worker (503); the folder is refused by name a while
const KEPT_MS = 120000;             // B-360d r887: a read that answered after every ask had gone is kept this long for the next ask
let _summaryPool = null;
function summaryPool() {
  if (_summaryPool) return _summaryPool;
  const { SafeFs } = require('./safe-fs.js');
  _summaryPool = new SafeFs({ workerPath: path.join(__dirname, 'telemetry-summary-worker.js'), name: 'telemetry-summary', poolSize: 1, timeouts: { default: SUMMARY_READ_MS } });
  return _summaryPool;
}

/** THE COLLECTOR'S VERDICT — the telemetry ingest door's, and (lane feedback-forward) the maintainer hub's two feedback
 *  doors': the shared Bearer token is both the on-switch and the whole gate. No token configured ⇒ 404 `collector disabled`;
 *  anything but `Bearer <token>` (timing-safe) ⇒ 403 `bad token`. */
function collectorVerdict(authorization, token) {
  const tok = String(token || '').trim();
  if (!tok) return { ok: false, status: 404, error: 'collector disabled' };
  const got = Buffer.from(String(authorization || ''));
  const want = Buffer.from(`Bearer ${tok}`);
  if (got.length !== want.length || !require('crypto').timingSafeEqual(got, want)) return { ok: false, status: 403, error: 'bad token' };
  return { ok: true };
}

module.exports = { Telemetry, collectorVerdict, summarizeEvents, summarizeCentral, SHARD_RE, SUMMARY_TIMEOUT_MS, SUMMARY_READ_MS, KEPT_MS };
