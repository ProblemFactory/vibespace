/**
 * UsageHistory — a PERMANENT, append-only ledger of per-request token usage,
 * mined from Claude Code's own JSONL transcripts (the same file for terminal
 * AND chat sessions, so coverage is mode-independent).
 *
 * WHY a separate ledger: the CLI's transcripts get rotated/deleted; this ledger
 * keeps the atomic facts forever so ANY future analysis is just a read. Each
 * line is one API REQUEST (deduped by requestId — a single request appears on
 * 2-3 JSONL records with identical usage; summing raw records double-counts).
 *
 * Incremental: per-file {offset,lastRid} cursor → only new bytes are parsed, so
 * scanning stays O(new data) even across hundreds of MB of history.
 *
 * Attribution: the JSONL basename is the immutable session id; session-meta maps
 * it to account/mode/host. cwd comes from the record itself.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

// Estimated API-equivalent prices, USD per MILLION tokens. Subscription sessions
// don't actually cost this — it's shown as a reference ("what this would cost on
// the API"). Editable at data/usage-history/pricing.json (seeded on first run).
const DEFAULT_PRICING = {
  // tier matched by substring of the model id
  opus:   { input: 15, output: 75, cacheWrite5m: 18.75, cacheWrite1h: 30, cacheRead: 1.5 },
  sonnet: { input: 3,  output: 15, cacheWrite5m: 3.75,  cacheWrite1h: 6,  cacheRead: 0.3 },
  haiku:  { input: 0.8, output: 4, cacheWrite5m: 1,     cacheWrite1h: 1.6, cacheRead: 0.08 },
  // Fable is new (Mythos-class, above Opus) — no public price yet; opus-tier is a
  // placeholder ESTIMATE. Edit pricing.json with the real numbers when known.
  fable:  { input: 15, output: 75, cacheWrite5m: 18.75, cacheWrite1h: 30, cacheRead: 1.5 },
  _default: { input: 3, output: 15, cacheWrite5m: 3.75, cacheWrite1h: 6, cacheRead: 0.3 },
};

class UsageHistory {
  // resolveAccount(acctId) → { type:'subscription'|'api'|'codex-subscription', name, tail } | null
  // Lets the ledger BAKE which account (and its billing TYPE) each request used,
  // so subscription usage (plan quota) and API-key usage (real $) never mix, and
  // the label survives even if the account is later deleted.
  constructor({ dataDir, homeDir = os.homedir(), resolveAccount = () => null }) {
    this.dir = path.join(dataDir, 'usage-history');
    this.metaDir = path.join(dataDir, 'session-meta');
    this.projectsDir = path.join(homeDir, '.claude', 'projects');
    this.cursorsFile = path.join(this.dir, '_cursors.json');
    this.pricingFile = path.join(this.dir, 'pricing.json');
    this.attribFile = path.join(this.dir, 'attribution.ndjson');
    this._resolveAccount = resolveAccount;
    try { fs.mkdirSync(this.dir, { recursive: true }); } catch {}
    this._cursors = this._loadJson(this.cursorsFile, {});
    this._pricing = this._loadPricing();
    this._scanning = false;
    this._lastScan = 0;
  }

  // ── Account attribution log (append-only, PERMANENT) ────────────────────────
  // VibeSpace appends {sid, acct, ts} whenever it spawns/resumes a session under
  // a known account + known claudeSessionId. A session RESUMED under a different
  // account is then attributed per-request by TIME (the account active when each
  // request happened), not just the latest — so switching accounts mid-session
  // never mixes the billing. session-meta's current accountId is the fallback.
  recordAttribution({ sid, acct, ts }) {
    if (!sid) return;
    try { fs.appendFileSync(this.attribFile, JSON.stringify({ sid, acct: acct || null, ts: ts || Date.now() }) + '\n'); } catch {}
    this._attrib = null; // invalidate cache
  }
  _attribMap() {
    if (this._attrib) return this._attrib;
    const map = {};
    let data = ''; try { data = fs.readFileSync(this.attribFile, 'utf-8'); } catch {}
    for (const line of data.split('\n')) {
      if (!line) continue;
      let e; try { e = JSON.parse(line); } catch { continue; }
      if (!e.sid) continue;
      (map[e.sid] = map[e.sid] || []).push({ ts: e.ts || 0, acct: e.acct || null });
    }
    for (const sid of Object.keys(map)) map[sid].sort((a, b) => a.ts - b.ts);
    this._attrib = map;
    return map;
  }
  // The account active for session `sid` at time `ts` — latest attribution entry
  // whose ts <= the request, else the meta fallback.
  _acctAt(sid, ts, attrib, metaAcct) {
    const list = attrib[sid];
    if (list && list.length) {
      let chosen = null;
      for (const e of list) { if (e.ts <= ts) chosen = e.acct; else break; }
      if (chosen !== null || list[0].ts > ts) return chosen != null ? chosen : (list[0].acct); // before first entry → use earliest known
    }
    return metaAcct || null;
  }

  _loadJson(f, fallback) { try { return JSON.parse(fs.readFileSync(f, 'utf-8')); } catch { return fallback; } }
  _loadPricing() {
    let p = this._loadJson(this.pricingFile, null);
    if (!p) { p = DEFAULT_PRICING; try { fs.writeFileSync(this.pricingFile, JSON.stringify(p, null, 2)); } catch {} }
    return p;
  }
  _writeAtomic(f, data) { const t = f + '.tmp'; fs.writeFileSync(t, data); fs.renameSync(t, f); }
  _shardFor(ts) { const d = new Date(ts); return path.join(this.dir, `events-${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}.ndjson`); }

  // Build claudeSessionId → {acct, mode, host, backend, name} from session-meta.
  _metaMap() {
    const map = {};
    let files = [];
    try { files = fs.readdirSync(this.metaDir); } catch {}
    for (const fn of files) {
      if (!fn.endsWith('.json')) continue;
      let m; try { m = JSON.parse(fs.readFileSync(path.join(this.metaDir, fn), 'utf-8')); } catch { continue; }
      const sid = m.claudeSessionId || m.backendSessionId;
      if (!sid) continue;
      map[sid] = { acct: m.accountId || m._accountId || null, mode: m.mode || null, host: m.host || null, backend: m.backend || 'claude', name: m.name || null };
    }
    return map;
  }

  // Incrementally scan every Claude transcript, appending new per-request events.
  scan() {
    if (this._scanning) return { skipped: true };
    this._scanning = true;
    let added = 0, filesTouched = 0;
    try {
      const meta = this._metaMap();
      const attrib = this._attribMap();
      let projDirs = [];
      try { projDirs = fs.readdirSync(this.projectsDir); } catch {}
      const shardBuffers = {}; // shardPath → [lines]
      for (const pd of projDirs) {
        const pdAbs = path.join(this.projectsDir, pd);
        let entries = [];
        try { entries = fs.readdirSync(pdAbs); } catch { continue; }
        for (const fn of entries) {
          if (!fn.endsWith('.jsonl')) continue; // top-level session transcripts only
          const fp = path.join(pdAbs, fn);
          let st; try { st = fs.statSync(fp); } catch { continue; }
          if (!st.isFile()) continue;
          const cur = this._cursors[fp] || { offset: 0, lastRid: null };
          if (st.size < cur.offset) { cur.offset = 0; cur.lastRid = null; } // rotated/truncated → re-read
          if (st.size === cur.offset) continue; // unchanged
          const sid = fn.replace(/\.jsonl$/, '');
          const minfo = meta[sid] || {};
          const newBytes = this._readFrom(fp, cur.offset, st.size);
          if (newBytes == null) continue;
          filesTouched++;
          // The last line may be partial (file still being written) — process
          // only up to the last newline; leave the remainder for next scan.
          const lastNl = newBytes.lastIndexOf('\n');
          const consumed = lastNl < 0 ? 0 : lastNl + 1;
          const chunk = newBytes.slice(0, consumed);
          for (const line of chunk.split('\n')) {
            if (!line || line.indexOf('"usage"') < 0) continue;
            let r; try { r = JSON.parse(line); } catch { continue; }
            if (r.type !== 'assistant') continue;
            const msg = r.message; if (!msg || typeof msg !== 'object') continue;
            const u = msg.usage; if (!u || typeof u !== 'object') continue;
            const rid = r.requestId || r.message?.id || r.uuid;
            if (!rid) continue;
            if (rid === cur.lastRid) continue; // contiguous duplicate of the same request
            cur.lastRid = rid;
            const cc = u.cache_creation || {};
            const ts = Date.parse(r.timestamp) || Date.now();
            // WHICH account: per-request by time from the attribution log, else
            // the session's current meta account. atype = its billing TYPE, baked
            // now so subscription vs API never mix (and it survives account
            // deletion). name = a human label frozen at scan time.
            const acct = this._acctAt(sid, ts, attrib, minfo.acct);
            const ainfo = acct ? (this._resolveAccount(acct) || null) : null;
            const atype = ainfo ? ainfo.type : (acct ? 'unknown' : 'global');
            const ev = {
              rid, ts, sid,
              be: minfo.backend || 'claude',
              model: msg.model || null,
              acct: acct || null,
              atype,
              aname: ainfo ? (ainfo.name || null) : null,
              mode: minfo.mode || null,
              host: minfo.host || null,
              cwd: r.cwd || null,
              i: u.input_tokens || 0,
              cw5: cc.ephemeral_5m_input_tokens || 0,
              cw1: cc.ephemeral_1h_input_tokens || 0,
              cr: u.cache_read_input_tokens || 0,
              o: u.output_tokens || 0,
              tier: u.service_tier || null,
            };
            const shard = this._shardFor(ev.ts);
            (shardBuffers[shard] = shardBuffers[shard] || []).push(JSON.stringify(ev));
            added++;
          }
          cur.offset += consumed;
          this._cursors[fp] = cur;
        }
      }
      for (const [shard, lines] of Object.entries(shardBuffers)) {
        if (lines.length) fs.appendFileSync(shard, lines.join('\n') + '\n');
      }
      this._writeAtomic(this.cursorsFile, JSON.stringify(this._cursors));
      this._lastScan = Date.now();
    } finally { this._scanning = false; }
    return { added, filesTouched };
  }

  _readFrom(fp, start, end) {
    try {
      const fd = fs.openSync(fp, 'r');
      try {
        const len = end - start;
        const buf = Buffer.allocUnsafe(len);
        fs.readSync(fd, buf, 0, len, start);
        return buf.toString('utf-8');
      } finally { fs.closeSync(fd); }
    } catch { return null; }
  }

  _tier(model) {
    const m = String(model || '').toLowerCase();
    for (const k of ['opus', 'sonnet', 'haiku', 'fable']) if (m.includes(k)) return k;
    return '_default';
  }
  _cost(ev) {
    const p = this._pricing[this._tier(ev.model)] || this._pricing._default;
    return (ev.i * p.input + ev.o * p.output + ev.cw5 * p.cacheWrite5m + ev.cw1 * p.cacheWrite1h + ev.cr * p.cacheRead) / 1e6;
  }

  // Stream shard files in [from,to] (epoch ms) and yield parsed events.
  * _events(from, to) {
    let files = [];
    try { files = fs.readdirSync(this.dir).filter(f => /^events-\d{4}-\d{2}\.ndjson$/.test(f)).sort(); } catch {}
    for (const fn of files) {
      // Skip whole shards outside the range (by the month in the name).
      const [, y, mo] = fn.match(/events-(\d{4})-(\d{2})/) || [];
      if (y && to) { const mStart = Date.UTC(+y, +mo - 1, 1); if (mStart > to) continue; }
      if (y && from) { const mEnd = Date.UTC(+y, +mo, 1); if (mEnd < from) continue; }
      let data; try { data = fs.readFileSync(path.join(this.dir, fn), 'utf-8'); } catch { continue; }
      for (const line of data.split('\n')) {
        if (!line) continue;
        let ev; try { ev = JSON.parse(line); } catch { continue; }
        if (from && ev.ts < from) continue;
        if (to && ev.ts > to) continue;
        yield ev;
      }
    }
  }

  _emptyBucket() { return { requests: 0, sessions: new Set(), input: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0, output: 0, cost: 0 }; }
  _add(b, ev) {
    b.requests++; b.sessions.add(ev.sid);
    b.input += ev.i; b.cacheWrite5m += ev.cw5; b.cacheWrite1h += ev.cw1; b.cacheRead += ev.cr; b.output += ev.o;
    b.cost += this._cost(ev);
  }
  _finalize(b) {
    const totalIn = b.input + b.cacheWrite5m + b.cacheWrite1h + b.cacheRead;
    return {
      requests: b.requests, sessions: b.sessions.size,
      input: b.input, cacheWrite5m: b.cacheWrite5m, cacheWrite1h: b.cacheWrite1h,
      cacheWrite: b.cacheWrite5m + b.cacheWrite1h, cacheRead: b.cacheRead, output: b.output,
      totalInput: totalIn, totalTokens: totalIn + b.output,
      cacheHitRatio: totalIn ? b.cacheRead / totalIn : 0,
      cost: b.cost,
    };
  }

  // The one flexible query the UI uses. groupBy is an array of dimension keys;
  // returns { totals, series(byDay), groups: { <dim>: [{key,...}] }, accounts }.
  aggregate({ from = null, to = null, backend = null } = {}) {
    const dims = { day: {}, model: {}, account: {}, billing: {}, project: {}, mode: {}, host: {}, hour: {}, weekday: {}, session: {} };
    const dimMeta = {}; // dim → key → {name,type,...} extra labels
    const totals = this._emptyBucket();
    let firstTs = null, lastTs = null;
    for (const ev of this._events(from, to)) {
      if (backend && ev.be !== backend) continue;
      this._add(totals, ev);
      if (firstTs == null || ev.ts < firstTs) firstTs = ev.ts;
      if (lastTs == null || ev.ts > lastTs) lastTs = ev.ts;
      const d = new Date(ev.ts);
      const acctKey = ev.acct || '__global__';
      const keyOf = {
        day: d.toISOString().slice(0, 10),
        model: ev.model || 'unknown',
        account: acctKey,
        // billing = the coarse category, so subscription $ and API $ never merge
        billing: ev.atype === 'api' ? 'api-key' : ev.atype === 'subscription' ? 'subscription' : ev.atype === 'codex-subscription' ? 'chatgpt' : (ev.acct ? 'unknown-account' : 'cli-global-login'),
        project: ev.cwd || 'unknown',
        mode: ev.mode || 'unknown',
        host: ev.host || 'local',
        hour: String(d.getHours()),
        weekday: String(d.getDay()),
        session: ev.sid,
      };
      for (const dim of Object.keys(dims)) {
        const k = keyOf[dim];
        (dims[dim][k] = dims[dim][k] || this._emptyBucket());
        this._add(dims[dim][k], ev);
      }
      // Freeze human labels for the account dimension (name + billing type).
      if (!dimMeta.account) dimMeta.account = {};
      if (!dimMeta.account[acctKey]) {
        const live = ev.acct ? this._resolveAccount(ev.acct) : null;
        dimMeta.account[acctKey] = {
          name: ev.acct ? (live?.name || ev.aname || ev.acct) : 'CLI global login',
          type: ev.atype || (ev.acct ? 'unknown' : 'global'),
          tail: live?.tail || null,
          deleted: ev.acct ? !live : false,
        };
      }
    }
    const groupOut = {};
    for (const dim of Object.keys(dims)) {
      groupOut[dim] = Object.entries(dims[dim])
        .map(([key, b]) => ({ key, ...(dimMeta[dim]?.[key] || {}), ...this._finalize(b) }))
        .sort((a, b) => b.cost - a.cost || b.totalTokens - a.totalTokens);
    }
    const series = groupOut.day.slice().sort((a, b) => a.key < b.key ? -1 : 1);
    return {
      totals: this._finalize(totals),
      range: { from: firstTs, to: lastTs },
      pricing: this._pricing,
      series,
      groups: groupOut,
    };
  }

  // Attach human names to account/session groups (server enriches with account
  // names + session names it knows).
  pricingTable() { return this._pricing; }
  setPricing(p) { this._pricing = p; this._writeAtomic(this.pricingFile, JSON.stringify(p, null, 2)); }
}

module.exports = { UsageHistory, DEFAULT_PRICING };
