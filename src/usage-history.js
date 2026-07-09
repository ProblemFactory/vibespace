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

// API-equivalent prices, USD per MILLION tokens. Subscription sessions don't
// actually cost this — it's shown as a reference ("what this would cost on the
// API"). Official Anthropic pricing per platform.claude.com/docs/.../pricing,
// as of 2026-07-09 (researched + cross-verified). Tier matched by substring of
// the model id (current flagship rates; deprecated Opus 4.1/4 were $15/$75 —
// override per-account in pricing.json if you still run those). Editable at
// data/usage-history/pricing.json.
const DEFAULT_PRICING = {
  // Fable 5 — $10/$50 (2× Opus; Mythos-class). NOTE: Fable uses a newer tokenizer
  // (~30% more tokens per unit of English text), so effective $/word is higher.
  fable:  { input: 10, output: 50, cacheWrite5m: 12.5, cacheWrite1h: 20, cacheRead: 1.0 },
  opus:   { input: 5,  output: 25, cacheWrite5m: 6.25, cacheWrite1h: 10, cacheRead: 0.5 },  // Opus 4.5–4.8
  sonnet: { input: 3,  output: 15, cacheWrite5m: 3.75, cacheWrite1h: 6,  cacheRead: 0.3 },  // standard (intro $2/$10 through 2026-08-31)
  haiku:  { input: 1,  output: 5,  cacheWrite5m: 1.25, cacheWrite1h: 2,  cacheRead: 0.1 },
  // OpenAI (codex) — per developers.openai.com pricing as of 2026-07-09 (GPT-5.6
  // GA'd today: Sol $5/$30, Terra $2.50/$15, Luna $1/$6; 5.5 $5/$30; 5.4
  // $2.50/$15; 5.4-mini $0.75/$4.50; 5.3-codex $1.75/$14). cacheRead = the 90%-
  // off cached-input rate. cacheWrite 0: codex rollouts don't report cache-write
  // token counts, so those events always carry cw=0 — a price would never apply.
  // Tier match is LONGEST-substring over these keys, so 'gpt-5.6-sol' wins over
  // any shorter overlap; a new model = one new key here or in pricing.json.
  'gpt-5.6-sol':   { input: 5,    output: 30,   cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0.5 },
  'gpt-5.6-terra': { input: 2.5,  output: 15,   cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0.25 },
  'gpt-5.6-luna':  { input: 1,    output: 6,    cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0.1 },
  'gpt-5.5':       { input: 5,    output: 30,   cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0.5 },
  'gpt-5.4-mini':  { input: 0.75, output: 4.5,  cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0.075 },
  'gpt-5.4':       { input: 2.5,  output: 15,   cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0.25 },
  'gpt-5.3':       { input: 1.75, output: 14,   cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0.175 },
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
    this.codexSessionsDir = path.join(process.env.CODEX_HOME || path.join(homeDir, '.codex'), 'sessions');
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
      // A global-login entry legitimately stores acct=null, so track WHETHER an
      // entry matched (found) separately from its value — otherwise a null match
      // followed by a later account switch would fall through to metaAcct and
      // mis-bill a global-login request to the later account.
      let found = false, chosen = null;
      for (const e of list) { if (e.ts <= ts) { found = true; chosen = e.acct; } else break; }
      if (found) return chosen;                 // exact account active at that time (may be null = global)
      return list[0].acct;                      // request predates the first entry → earliest known
    }
    return metaAcct || null;
  }

  _loadJson(f, fallback) { try { return JSON.parse(fs.readFileSync(f, 'utf-8')); } catch { return fallback; } }
  // Pricing schema v2: { version, tiers:{opus,sonnet,haiku,fable,_default}, accounts:{ <id>: {discount} | {tiers:{...}} } }.
  // Subscriptions use the default tiers (the "API-equivalent" reference). API-key
  // accounts can carry a per-account DISCOUNT (negotiated rate) or a full tier
  // override — because different keys really do bill at different rates.
  _loadPricing() {
    let p = this._loadJson(this.pricingFile, null);
    if (!p) {
      p = { version: 2, tiers: DEFAULT_PRICING, accounts: {} };
      try { fs.writeFileSync(this.pricingFile, JSON.stringify(p, null, 2)); } catch {}
    } else if (!p.tiers) {
      // migrate the old FLAT {opus:{...},...} file to v2 in place
      p = { version: 2, tiers: p, accounts: {} };
      try { fs.writeFileSync(this.pricingFile, JSON.stringify(p, null, 2)); } catch {}
    }
    if (!p.accounts) p.accounts = {};
    if (!p.tiers) p.tiers = DEFAULT_PRICING;
    // Newly-shipped default tiers (e.g. the gpt-* family) fill into an existing
    // on-disk pricing.json without clobbering the user's edited values.
    for (const [k, v] of Object.entries(DEFAULT_PRICING)) if (!p.tiers[k]) p.tiers[k] = v;
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

  // Incrementally scan every transcript (Claude JSONLs + Codex rollouts),
  // appending new per-request events.
  scan() {
    if (this._scanning) return { skipped: true };
    this._scanning = true;
    let added = 0, filesTouched = 0;
    try {
      const meta = this._metaMap();
      const attrib = this._attribMap();
      const shardBuffers = {}; // shardPath → [lines]
      const push = (ev) => {
        const shard = this._shardFor(ev.ts);
        (shardBuffers[shard] = shardBuffers[shard] || []).push(JSON.stringify(ev));
        added++;
      };
      const cursorFor = (fp, size) => {
        const cur = this._cursors[fp] || { offset: 0, lastRid: null };
        if (size < cur.offset) { cur.offset = 0; cur.lastRid = null; } // rotated/truncated → re-read
        return cur;
      };

      // ── Claude transcripts (~/.claude/projects/<proj>/<sid>.jsonl) ──
      let projDirs = [];
      try { projDirs = fs.readdirSync(this.projectsDir); } catch {}
      for (const pd of projDirs) {
        const pdAbs = path.join(this.projectsDir, pd);
        let entries = [];
        try { entries = fs.readdirSync(pdAbs); } catch { continue; }
        for (const fn of entries) {
          if (!fn.endsWith('.jsonl')) continue; // top-level session transcripts only
          const fp = path.join(pdAbs, fn);
          let st; try { st = fs.statSync(fp); } catch { continue; }
          if (!st.isFile()) continue;
          const cur = cursorFor(fp, st.size);
          if (st.size === cur.offset) continue; // unchanged
          const sid = fn.replace(/\.jsonl$/, '');
          const minfo = meta[sid] || {};
          filesTouched++;
          this._scanFileLines(fp, cur, st.size, (line) => {
            if (line.indexOf('"usage"') < 0) return;
            let r; try { r = JSON.parse(line); } catch { return; }
            if (r.type !== 'assistant') return;
            const msg = r.message; if (!msg || typeof msg !== 'object') return;
            const u = msg.usage; if (!u || typeof u !== 'object') return;
            const rid = r.requestId || r.message?.id || r.uuid;
            if (!rid) return;
            if (rid === cur.lastRid) return; // contiguous duplicate of the same request
            cur.lastRid = rid;
            const cc = u.cache_creation || {};
            const ts = Date.parse(r.timestamp) || Date.now();
            // WHICH account: per-request by time from the attribution log, else
            // the session's current meta account. atype = its billing TYPE, baked
            // now so subscription vs API never mix (and it survives account
            // deletion). name = a human label frozen at scan time.
            const acct = this._acctAt(sid, ts, attrib, minfo.acct);
            const ainfo = acct ? (this._resolveAccount(acct) || null) : null;
            push({
              rid, ts, sid,
              be: minfo.backend || 'claude',
              model: msg.model || null,
              acct: acct || null,
              atype: ainfo ? ainfo.type : (acct ? 'unknown' : 'global'),
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
            });
          });
          this._cursors[fp] = cur;
        }
      }

      // ── Codex rollouts (~/.codex/sessions/YYYY/MM/DD/rollout-*-<threadId>.jsonl) ──
      // Per-request usage rides `event_msg`/`token_count` records:
      // payload.info.last_token_usage = the LAST model request's tokens
      // ({input_tokens ⊇ cached_input_tokens, output_tokens ⊇ reasoning}), while
      // info === null marks rate-limit-only heartbeats (skip). There is no
      // requestId — the synthetic rid is the CUMULATIVE total (strictly
      // monotonic per thread), so re-emits/replays dedup exactly like Claude's
      // 2-3 identical records. model/cwd come from the preceding `turn_context`
      // record and PERSIST IN THE CURSOR — an incremental scan may start
      // mid-file, long after the last turn_context line.
      let rollouts = [];
      try { rollouts = fs.readdirSync(this.codexSessionsDir, { recursive: true }); } catch {}
      for (const rel of rollouts) {
        const m = /rollout-.*-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i.exec(String(rel));
        if (!m) continue;
        const fp = path.join(this.codexSessionsDir, String(rel));
        let st; try { st = fs.statSync(fp); } catch { continue; }
        if (!st.isFile()) continue;
        const cur = cursorFor(fp, st.size);
        if (st.size === cur.offset) continue;
        const sid = m[1].toLowerCase();
        const minfo = meta[sid] || {};
        filesTouched++;
        this._scanFileLines(fp, cur, st.size, (line) => {
          if (line.indexOf('"turn_context"') >= 0) {
            let r; try { r = JSON.parse(line); } catch { return; }
            if (r.type === 'turn_context' && r.payload) {
              if (r.payload.model) cur.model = r.payload.model;
              if (r.payload.cwd) cur.cwd = r.payload.cwd;
            }
            return;
          }
          if (line.indexOf('"token_count"') < 0) return;
          let r; try { r = JSON.parse(line); } catch { return; }
          if (r.type !== 'event_msg' || r.payload?.type !== 'token_count') return;
          const info = r.payload.info;
          const last = info && info.last_token_usage;
          if (!last || !(last.input_tokens || last.output_tokens)) return;
          const ts = Date.parse(r.timestamp) || Date.now();
          const cum = info.total_token_usage ? info.total_token_usage.total_tokens : null;
          const rid = `cx:${sid}:${cum != null ? cum : cur.offset + '-' + ts}`;
          if (rid === cur.lastRid) return;
          cur.lastRid = rid;
          const cached = last.cached_input_tokens || 0;
          const acct = this._acctAt(sid, ts, attrib, minfo.acct);
          const ainfo = acct ? (this._resolveAccount(acct) || null) : null;
          push({
            rid, ts, sid, be: 'codex',
            model: cur.model || null,
            acct: acct || null,
            atype: ainfo ? ainfo.type : (acct ? 'unknown' : 'global'),
            aname: ainfo ? (ainfo.name || null) : null,
            mode: minfo.mode || null,
            host: minfo.host || null,
            cwd: cur.cwd || null,
            i: Math.max(0, (last.input_tokens || 0) - cached), // input INCLUDES cached → fresh = the difference
            cw5: 0, cw1: 0, // rollouts don't report cache-write token counts
            cr: cached,
            o: last.output_tokens || 0, // includes reasoning tokens (billed as output)
            tier: null,
          });
        });
        this._cursors[fp] = cur;
      }

      for (const [shard, lines] of Object.entries(shardBuffers)) {
        if (lines.length) fs.appendFileSync(shard, lines.join('\n') + '\n');
      }
      this._writeAtomic(this.cursorsFile, JSON.stringify(this._cursors));
      this._lastScan = Date.now();
    } finally { this._scanning = false; }
    return { added, filesTouched };
  }

  // Feed a file's UNSCANNED bytes to onLine, in bounded chunks — a rollout can
  // exceed Node's max string length (real case: 1.9GB), so the file must never
  // be materialized whole. Only complete lines are consumed; a partial tail
  // waits for the next scan. CRITICAL (do not regress): cur.offset is a BYTE
  // position — advance by Buffer.byteLength of the consumed text, never by the
  // UTF-16 string length (CJK under-advances → records re-counted, totals
  // inflate). A chunk may end mid-UTF-8-sequence; everything up to the last
  // newline still decodes cleanly (continuation bytes can't be '\n'), and the
  // partial char is re-read from the byte-accurate offset next iteration.
  _scanFileLines(fp, cur, size, onLine) {
    const CHUNK = 32 * 1024 * 1024;
    let fd; try { fd = fs.openSync(fp, 'r'); } catch { return; }
    try {
      while (cur.offset < size) {
        const len = Math.min(CHUNK, size - cur.offset);
        const buf = Buffer.allocUnsafe(len);
        const read = fs.readSync(fd, buf, 0, len, cur.offset);
        if (read <= 0) break;
        const text = buf.toString('utf-8', 0, read);
        const lastNl = text.lastIndexOf('\n');
        if (lastNl < 0) break; // no complete line in this chunk (partial tail)
        const chunk = text.slice(0, lastNl + 1);
        for (const line of chunk.split('\n')) if (line) onLine(line);
        cur.offset += Buffer.byteLength(chunk, 'utf-8');
      }
    } catch {} finally { try { fs.closeSync(fd); } catch {} }
  }

  _tier(model) {
    // Data-driven: longest tier key that substring-matches the model id wins
    // ('gpt-5.6-sol' beats 'gpt-5.6…' prefixes; adding a tier in pricing.json
    // makes it match with no code change).
    const m = String(model || '').toLowerCase();
    if (!this._tierKeys || this._tierKeysFor !== this._pricing.tiers) {
      this._tierKeys = Object.keys(this._pricing.tiers).filter(k => k !== '_default').sort((a, b) => b.length - a.length);
      this._tierKeysFor = this._pricing.tiers;
    }
    for (const k of this._tierKeys) if (m.includes(k)) return k;
    return '_default';
  }
  // The rate for a given account + tier: an account may override specific tiers
  // and/or carry a flat discount (0..1). Subscriptions/global have no override →
  // default tiers (the API-equivalent reference).
  _rateFor(acct, tier) {
    const ov = acct ? this._pricing.accounts?.[acct] : null;
    const base = (ov?.tiers && ov.tiers[tier]) || this._pricing.tiers[tier] || this._pricing.tiers._default;
    const disc = ov && typeof ov.discount === 'number' ? Math.max(0, Math.min(0.99, ov.discount)) : 0;
    if (!disc) return base;
    const f = 1 - disc;
    return { input: base.input * f, output: base.output * f, cacheWrite5m: base.cacheWrite5m * f, cacheWrite1h: base.cacheWrite1h * f, cacheRead: base.cacheRead * f };
  }
  _cost(ev) {
    const p = this._rateFor(ev.acct, this._tier(ev.model));
    return (ev.i * p.input + ev.o * p.output + ev.cw5 * p.cacheWrite5m + ev.cw1 * p.cacheWrite1h + ev.cr * p.cacheRead) / 1e6;
  }

  // Stream shard files in [from,to] (epoch ms) and yield UNIQUE events (deduped
  // by requestId). The ledger is append-only and can contain a duplicate rid if
  // a crash (e.g. OOM respawn) hit between a shard append and the cursor write —
  // read-time dedup makes totals correct regardless of how a dup got there.
  // requestIds are globally unique, so this never drops a distinct request.
  * _events(from, to) {
    const seen = new Set();
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
        if (ev.rid) { if (seen.has(ev.rid)) continue; seen.add(ev.rid); }
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
  aggregate({ from = null, to = null, backend = null, accounts = null } = {}) {
    const dims = { day: {}, model: {}, account: {}, billing: {}, project: {}, mode: {}, host: {}, hour: {}, weekday: {}, session: {} };
    const dimMeta = {}; // dim → key → {name,type,...} extra labels
    const totals = this._emptyBucket();
    let firstTs = null, lastTs = null;
    for (const ev of this._events(from, to)) {
      if (backend && ev.be !== backend) continue;
      const acctKey = ev.acct || '__global__';
      // accounts = Set of bucket keys (account ids / '__global__'); the UI can
      // pass several at once (e.g. a named sub + '__global__' when the machine
      // login IS that account) — the whole dashboard then shows one account.
      if (accounts && !accounts.has(acctKey)) continue;
      this._add(totals, ev);
      if (firstTs == null || ev.ts < firstTs) firstTs = ev.ts;
      if (lastTs == null || ev.ts > lastTs) lastTs = ev.ts;
      const d = new Date(ev.ts);
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
  // Accept a full v2 object OR a partial patch ({tiers?, accounts?}). Merges so a
  // UI editor can PATCH just one account's discount without resending everything.
  setPricing(patch) {
    if (!patch || typeof patch !== 'object') return this._pricing;
    const cur = this._pricing;
    const next = { version: 2, tiers: { ...cur.tiers, ...(patch.tiers || {}) }, accounts: { ...cur.accounts } };
    if (patch.accounts) {
      for (const [id, cfg] of Object.entries(patch.accounts)) {
        if (cfg == null) delete next.accounts[id];       // null clears an override
        else next.accounts[id] = cfg;
      }
    }
    this._pricing = next;
    this._writeAtomic(this.pricingFile, JSON.stringify(next, null, 2));
    return next;
  }
}

module.exports = { UsageHistory, DEFAULT_PRICING };
