'use strict';
/**
 * CHANNELS RAW API — THE ORCHESTRATOR (B-2198, docs/design-channel-raw-api.md; the fence is PURE src/channel-api.js).
 * `POST /api/agent/channels/api` (src/agent-routes.js) hands a call here: the credential → the TIER (the engine's
 * `apiTierFor`, asked again after EVERY await — a revoke lands mid-call) → the fence → the budget (the grant's own
 * per-minute / per-day counts, then the account's vendor meter) → the bearer (the adapter's, or a storage mount's lent
 * OAuth token — D3) → the ONE fetch (`vendorFetch`: the credential's DECLARED hosts only, a redirect never followed by
 * itself — each target judged by the fence like the call, B-fc37 —, 30 s, bounded) → the answer
 * through secret-shapes' redaction and the peer-text belt → the audit ring (data/channels/<cred>/api.ndjson — never a
 * body; ONE line at each run / refuse / decide point, read back by `auditTail` as a bounded tail of THAT credential's
 * lines — the API access dialog's log) and the chat's call row (the caller's touchChannel). A write under `write-ask` and every SENSITIVE call is a
 * PROPOSAL: the frozen bytes (method, host, path, query, headers, body digest) are what the user's Approve runs.
 * The vendor facts are the credential's DECLARED row (`cred.api`: the adapter's, handed by the engine; a mount's, by
 * src/mounts.js `oauthApiRows`) — this file names no vendor (test-architecture), adding an integration never edits it.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const F = require('../channel-api.js');
const { toAgentText } = require('../peer-text.js');
const { redactSecrets, REDACTED } = require('../secret-shapes.js');

const AUDIT_RING_BYTES = 16 * 1024 * 1024;
const TAIL_LINES = 2000;                 // the log's read window: the newest lines of the file (lane channel-api-log-blank)…
const TAIL_BYTES = 4 * 1024 * 1024;      // …read backwards from its end, never the whole 16 MB ring
const PROPOSALS_KEEP = 200;
const TOKEN_KEYS = /^(access_token|refresh_token|id_token|tenant_access_token|app_access_token|user_access_token|client_secret|authorization|password|secret)$/i;

function create({ dataDir, engine, getMounts = () => null, fetchFn = (typeof fetch === 'function' ? fetch : null), now = () => Date.now(), broadcast = () => {}, log = console } = {}) {
  if (!dataDir) throw new Error('channel-api: dataDir is required');
  const eng = () => (typeof engine === 'function' ? engine() : engine);
  const dir = path.join(dataDir, 'channels');
  const stateFile = path.join(dir, 'api-proposals.json');
  const state = (() => { try { const j = JSON.parse(fs.readFileSync(stateFile, 'utf8')); return { proposals: j.proposals || {}, shapes: Array.isArray(j.shapes) ? j.shapes : [] }; } catch { return { proposals: {}, shapes: [] }; } })();
  const stamps = new Map();        // `${cred}|${principal id}` -> call instants (the grant's budget)
  const mountTokens = new Map();   // mountId -> { token, until } (a refreshed access token, memory only)
  const refreshing = new Map();    // mountId -> the ONE refresh in flight (single-flight) | { failedUntil } after a refusal (paced)
  const save = () => { try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(stateFile + '.tmp', JSON.stringify(state)); fs.renameSync(stateFile + '.tmp', stateFile); } catch (e) { log.warn('[channel-api] state write failed:', e && e.message); } };
  const credDir = (cred) => path.join(dir, String(cred).replace(/[^A-Za-z0-9._-]/g, '_'), 'api.ndjson');
  const pkOf = (ctx) => `${ctx.kind}:${ctx.id}`;
  /** The call shapes this principal's cards made always-allowed on one credential (the verdict's `shapes`). */
  const shapesOf = (ctx, cred) => state.shapes.filter((s) => s.cred === cred && s.principal === pkOf(ctx)).map((s) => s.shape);

  /** THE AUDIT RING — one line per call (and per decision), the 16 MB ring rolled once (the exit-run precedent). */
  function audit(cred, line) {
    const f = credDir(cred);
    try {
      fs.mkdirSync(path.dirname(f), { recursive: true });
      try { if (fs.statSync(f).size > AUDIT_RING_BYTES) fs.renameSync(f, f.replace(/\.ndjson$/, '.1.ndjson')); } catch {}
      fs.appendFileSync(f, JSON.stringify(line) + '\n');
    } catch (e) { log.warn('[channel-api] audit write failed:', e && e.message); }
  }
  /** The newest ≤ TAIL_LINES lines of one ring file, read backwards from its end (≤ TAIL_BYTES) — `whole` = the file's
   *  start was reached (a cut first line is dropped, never half-parsed). */
  function tailRows(f) {
    let fd;
    try { fd = fs.openSync(f, 'r'); } catch { return { rows: [], whole: true }; }
    try {
      const size = fs.fstatSync(fd).size, chunks = [];
      let pos = size, nl = 0;
      while (pos > 0 && size - pos < TAIL_BYTES && nl <= TAIL_LINES) {
        const len = Math.min(64 * 1024, pos, TAIL_BYTES - (size - pos));
        pos -= len;
        const b = Buffer.alloc(len);
        fs.readSync(fd, b, 0, len, pos);
        for (let i = 0; i < len; i++) if (b[i] === 10) nl++;
        chunks.unshift(b);
      }
      let text = Buffer.concat(chunks).toString('utf8');
      if (pos > 0) text = text.slice(text.indexOf('\n') + 1);
      return { rows: text.split('\n').filter(Boolean).slice(-TAIL_LINES).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean), whole: pos === 0 };
    } catch { return { rows: [], whole: true }; } finally { try { fs.closeSync(fd); } catch {} }
  }
  /** THE API LOG the dialog and `api log` read: the last n lines OF THIS credential (PURE `logTail` — never another
   *  credential's), from a bounded tail of its ring; a ring rolled a moment ago lends its newest lines (`.1`). */
  function auditTail(cred, { n = 50, principal = null } = {}) {
    const f = credDir(cred);
    const live = tailRows(f);
    const rows = live.whole && live.rows.length < TAIL_LINES ? [...tailRows(f.replace(/\.ndjson$/, '.1.ndjson')).rows.slice(live.rows.length - TAIL_LINES), ...live.rows] : live.rows;
    return F.logTail(rows, { cred: String(cred), n, principal });
  }

  /** The storage mounts' lent credentials: one `[vendor, row]` per vendor whose raw-API row the mounts DECLARE. */
  const mountRows = () => { const m = getMounts(); const rows = m && typeof m.oauthApiRows === 'function' ? m.oauthApiRows() : null; return m && typeof m.oauthClientsFor === 'function' && rows ? Object.entries(rows) : []; };
  const mountLent = () => mountRows().flatMap(([vendor, row]) => getMounts().oauthClientsFor(vendor).map((x) => ({ x, vendor, row })));
  /** A credential id → its kind + declared row + bearer + meter. A Channels account id (the engine hands its adapter's
   *  row), or `mount:<id>` (a storage mount's lent client — D3; its row is the mounts' declaration). */
  function credentialOf(cred) {
    const id = String(cred || '');
    if (id.startsWith('mount:')) {
      const lent = mountLent().find(({ x }) => `mount:${x.mountId}` === id);
      if (!lent) return null;
      const { x, vendor, row } = lent;
      return { id, kind: `mount-${vendor}`, api: row, label: x.name || x.mountId, source: 'mount', bearer: () => mountBearer(x.mountId, vendor, row), gate: () => null, charge: () => {}, rateLimited: () => {} };
    }
    const e = eng();
    return e && typeof e.apiCredential === 'function' ? e.apiCredential(id) : null;
  }
  function allCreds() {
    const e = eng();
    const out = (e && typeof e.apiAccounts === 'function' ? e.apiAccounts() : []).map((a) => ({ id: a.id, kind: a.kind, label: a.label, source: 'channels' }));
    for (const { x, vendor } of mountLent()) out.push({ id: `mount:${x.mountId}`, kind: `mount-${vendor}`, label: x.name || x.mountId, source: 'mount' });
    return out;
  }
  /** THE TIER, now. Every agent answer asks it first and again after every await. */
  const tierNow = (ctx, cred) => { const e = eng(); return e && typeof e.apiTierFor === 'function' ? e.apiTierFor(ctx, cred) : { tier: 'none', perDay: null }; };
  const NOT_GRANTED = () => ({ ok: false, code: 'api_not_granted', error: 'this conversation has no API access to that credential (or there is no such credential) — `vibespace-channels api creds` lists yours; the user grants more in Channels → the account → API access…' });

  /** A mount's bearer: the stored access token while fresh, else ONE refresh with the mount's own client at the row's
   *  declared token endpoint (`refresh`). */
  async function mountBearer(mountId, vendor, row) {
    const c = mountTokens.get(mountId);
    if (c && c.until > now() + 60e3) return c.token;
    const m = getMounts();
    if (!m || typeof m.oauthTokenOf !== 'function') throw Object.assign(new Error('storage mounts are not available'), { code: 'api_cred_expired' });
    const t = m.oauthTokenOf(mountId, { vendor });
    const exp = Date.parse(t.token.expiry || '') || 0;
    if (t.token.access_token && exp > now() + 60e3) { mountTokens.set(mountId, { token: t.token.access_token, until: exp }); return t.token.access_token; }
    if (!t.token.refresh_token) throw Object.assign(new Error('the mount\'s token expired and holds no refresh token — sign the mount in again'), { code: 'api_cred_expired' });
    // ONE refresh per mount at a time, and none for a minute after a refused one — an agent never drives the token endpoint (verify r1 M4)
    const fl = refreshing.get(mountId);
    if (fl && fl.then) return fl;
    if (fl && fl.failedUntil > now()) throw Object.assign(new Error('the mount\'s token could not be refreshed a moment ago — the user re-authorizes the mount'), { code: 'api_cred_expired' });
    const p = refreshMount(mountId, t, row).then((tok) => { refreshing.delete(mountId); return tok; }, (e) => { refreshing.set(mountId, { failedUntil: now() + 60e3 }); throw e; });
    refreshing.set(mountId, p);
    return p;
  }
  async function refreshMount(mountId, t, row) {
    if (!row || !row.refresh) throw Object.assign(new Error('the mount\'s token expired and its row declares no token endpoint — sign the mount in again'), { code: 'api_cred_expired' });
    const body = new URLSearchParams({ client_id: t.clientId, client_secret: t.clientSecret, refresh_token: t.token.refresh_token, grant_type: 'refresh_token' }).toString();
    const r = await vendorFetch(row.refresh, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body }, { hosts: [], refresh: row.refresh });
    let j = null; try { j = JSON.parse(Buffer.from(await r.arrayBuffer()).toString('utf8')); } catch {}
    if (!r.ok || !j || !j.access_token) throw Object.assign(new Error(`the mount's token could not be refreshed (HTTP ${r.status}) — the user re-authorizes the mount`), { code: 'api_cred_expired' });
    mountTokens.set(mountId, { token: String(j.access_token), until: now() + Number(j.expires_in || 3600) * 1000 });
    return String(j.access_token);
  }

  /** THE ONE FETCH SITE (test-vendor-whitelist §14): https to a host the credential's DECLARED row names (`row.hosts`, or
   *  its `refresh` endpoint for a mount's token), `redirect: 'manual'` (a Location is judged by the fence, never followed
   *  blind), 30 s. */
  function vendorFetch(url, init, row) {
    const u = new URL(url);
    const hosts = new Set([...((row && row.hosts) || []), ...(row && row.refresh ? [new URL(row.refresh).host] : [])]);
    if (u.protocol !== 'https:' || !hosts.has(u.host)) throw Object.assign(new Error(`${u.host} is not a vendor API host`), { code: 'api_host_refused' });
    if (!fetchFn) throw Object.assign(new Error('no fetch on this server'), { code: 'api_unavailable' });
    return fetchFn(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(F.TIMEOUT_MS) });
  }
  async function readBounded(res) {
    const chunks = []; let n = 0; let truncated = false;
    if (res.body && typeof res.body.getReader === 'function') {
      const rd = res.body.getReader();
      for (;;) { const { done, value } = await rd.read(); if (done) break; n += value.length; if (n > F.RESPONSE_MAX) { truncated = true; chunks.push(Buffer.from(value).subarray(0, value.length - (n - F.RESPONSE_MAX))); try { await rd.cancel(); } catch {} break; } chunks.push(Buffer.from(value)); }
    } else chunks.push(Buffer.from(await res.arrayBuffer()));
    const b = F.boundResponse(Buffer.concat(chunks));
    return { body: b.body, bytes: truncated ? Math.max(n, b.bytes) : b.bytes, truncated: truncated || b.truncated };
  }

  /** THE ANSWER'S BELT: token-named keys REDACTED, every string through secret-shapes then the peer-text belt. */
  function beltValue(v, depth = 0) {
    if (typeof v === 'string') return toAgentText(redactSecrets(v).text, { max: Math.max(1, v.length) });
    if (!v || typeof v !== 'object' || depth > 64) return v;
    if (Array.isArray(v)) return v.map((x) => beltValue(x, depth + 1));
    const o = {};
    for (const [k, x] of Object.entries(v)) o[toAgentText(k, { kind: 'line', max: 200 })] = TOKEN_KEYS.test(k) && typeof x === 'string' ? REDACTED : beltValue(x, depth + 1);
    return o;
  }
  function beltBody(buf, contentType) {
    const ct = String(contentType || '');
    const text = /json|text|xml|javascript|x-www-form-urlencoded/i.test(ct) || !ct;
    if (!text) return { bodyBase64: buf.toString('base64'), binary: true };
    const s = buf.toString('utf8');
    try { return { json: beltValue(JSON.parse(s)) }; } catch {}
    return { text: toAgentText(s.split('\n').map((l) => redactSecrets(l).text).join('\n'), { max: F.RESPONSE_MAX }) };
  }

  /** RUN one vetted request (the agent's own, or a proposal's frozen bytes). Re-asks the tier after each await. A vendor
   *  redirect is never followed by itself (B-fc37): its target is judged by the fence like the call (`F.judgeRedirect`,
   *  the tier asked again just then) and a target it does not clear is sent NOTHING — the refusal names where the vendor
   *  pointed; one the user may still choose lands in `kept.target` (approve keeps it for 重新提交). */
  async function run(ctx, cred, c, req, kept = null) {
    const t0 = now();
    let token;
    try { token = await c.bearer(); } catch (e) { return { ok: false, code: 'api_cred_expired', error: `the credential cannot be used now (${String((e && e.message) || e).slice(0, 200)}) — the user re-authorizes it in Channels` }; }
    if (tierNow(ctx, cred).tier === 'none') return NOT_GRANTED();   // the revoke may have landed while the token was read
    let res, cur = req, hops = 0;
    const seen = [F.addressOf(req)];
    try {
      for (;;) {
        c.charge();
        res = await vendorFetch(F.urlOf(cur), { method: cur.method, headers: { ...cur.headers, authorization: `Bearer ${token}` }, body: cur.body || undefined }, F.vendorRowOf(c));
        if (tierNow(ctx, cred).tier === 'none') return { ...NOT_GRANTED(), withheld: true, status: res.status };   // …or while the vendor answered: the answer is withheld (the audit keeps that it ran)
        const location = res.headers.get('location');
        if (!F.REDIRECT_STATUSES.includes(res.status) || !location) break;
        if (res.body && typeof res.body.cancel === 'function') res.body.cancel().catch(() => {});   // the 3xx's own body is never read
        const j = F.judgeRedirect(c, { call: req, req: cur, status: res.status, location, tier: tierNow(ctx, cred).tier, shapes: shapesOf(ctx, cred), hops, seen });
        if (!j.ok) { const { target, ...said } = j; if (kept && target) kept.target = target; return { ...said, status: res.status }; }
        hops++; seen.push(F.addressOf(j.req)); cur = j.req;
      }
    } catch (e) { return { ok: false, code: (e && e.code && /^api_/.test(e.code)) ? e.code : 'api_vendor_unreachable', error: `the vendor could not be reached (${String((e && e.name === 'TimeoutError' ? 'timed out after 30 s' : e && e.message) || e).slice(0, 200)})` }; }
    if (res.status === 429) c.rateLimited(Number(res.headers.get('retry-after')) || 30);
    const b = await readBounded(res);
    if (tierNow(ctx, cred).tier === 'none') return { ...NOT_GRANTED(), withheld: true, status: res.status };
    // the bearer itself never rides an answer — a vendor echo of the request is cut out of ANY body, binary too (verify r1 M5)
    const hdrs = F.responseHeaders(res.headers);
    for (const k of Object.keys(hdrs)) hdrs[k] = hdrs[k].split(token).join(REDACTED);
    return { ok: true, status: res.status, headers: beltValue(hdrs), ...beltBody(scrubToken(b.body, token), res.headers.get('content-type')), bytes: b.bytes, truncated: b.truncated, ms: now() - t0 };
  }
  function scrubToken(buf, token) {
    const t = Buffer.from(String(token || ''));
    if (t.length < 8 || buf.indexOf(t) < 0) return buf;
    const out = []; let i = 0, j;
    while ((j = buf.indexOf(t, i)) >= 0) { out.push(buf.subarray(i, j), Buffer.from(REDACTED)); i = j + t.length; }
    out.push(buf.subarray(i));
    return Buffer.concat(out);
  }

  function proposalView(p, { agent = false } = {}) {
    const f = p.frozen;
    const body = f.body ? Buffer.from(f.body, 'base64') : null;
    return {
      id: p.id, status: p.status, cred: p.cred, credLabel: p.credLabel, at: p.at, conv: p.conv, principal: agent ? undefined : p.principal,
      method: f.method, host: f.host, path: f.path, query: f.query, digest: f.digest, sensitive: p.sensitive, offersAlways: p.offersAlways,
      body: body ? toAgentText(body.toString('utf8').slice(0, F.SHOWN_BODY_MAX), { max: F.SHOWN_BODY_MAX }) : null, bodyBytes: body ? body.length : 0,
      decidedAt: p.decidedAt || null, decidedBy: agent ? undefined : p.decidedBy || null, reason: p.reason || null, result: p.result || null, note: p.note || null,
      resubmitOf: p.resubmitOf || null, resubmittedAs: p.resubmittedAs || null,
    };
  }
  const pending = () => Object.values(state.proposals).filter((p) => p.status === 'pending');
  const notifyOwner = (changed) => { try { broadcast({ type: 'channel-api-updated', changed, pending: pending().length }); } catch {} };

  // ── THE AGENT'S VERBS (each asks the tier first; `call` again after every await) ──
  /** The credentials this conversation may use (tier ≠ none). */
  function creds(ctx) {
    const list = allCreds().map((c) => ({ ...c, ...tierNow(ctx, c.id) })).filter((c) => c.tier !== 'none');
    return { ok: true, creds: list.map((c) => ({ id: c.id, kind: c.kind, label: c.label, source: c.source, tier: c.tier, tierSays: F.TIER_SAYS[c.tier] || c.tier, perDay: c.perDay || F.BUDGET_DEFAULT.perDay, perMin: F.BUDGET_DEFAULT.perMin })) };
  }
  /** The vendor's OWN docs + the fence summary — nothing else is "known" by VibeSpace. */
  function docs(ctx, cred) {
    const tr = tierNow(ctx, cred);
    const c = tr.tier !== 'none' && allCreds().some((x) => x.id === cred) ? credentialOf(cred) : null;
    const v = F.vendorRowOf(c);
    if (!v) return NOT_GRANTED();
    return { ok: true, cred, vendor: v.label, docs: v.docs, hosts: v.hosts, tier: tr.tier, tierSays: F.TIER_SAYS[tr.tier] || tr.tier, fence: { readByPost: v.readByPost.map(String), sensitive: v.sensitive.map(String), sensitiveAlso: ['DELETE', `a body over ${F.SENSITIVE_BODY / 1024} KiB`, 'an upload'], budget: { perMin: F.BUDGET_DEFAULT.perMin, perDay: tr.perDay || F.BUDGET_DEFAULT.perDay }, bodyMax: F.BODY_MAX, responseMax: F.RESPONSE_MAX } };
  }
  /** ONE PROPOSAL: the FROZEN request (what the user's Approve runs), the policy, the agent's note; the oldest decided
   *  ones beyond PROPOSALS_KEEP are dropped. The caller saves + tells the owner. */
  function fileProposal(ctx, cred, c, req, { cls, sensitive, note = null, why, extra = {} }) {
    const id = `api-${crypto.randomBytes(6).toString('hex')}`;
    state.proposals[id] = { id, status: 'pending', cred, credLabel: c.label, kind: c.kind, at: now(), conv: ctx.id, principal: { kind: ctx.kind, id: ctx.id, name: ctx.name || null, groups: ctx.groups || [] }, frozen: F.freeze(req), sensitive, offersAlways: F.offersAlways({ cls, sensitive }), note, why, ...extra };
    const keep = Object.values(state.proposals).sort((a, b) => b.at - a.at).slice(PROPOSALS_KEEP).filter((p) => p.status !== 'pending');
    for (const p of keep) delete state.proposals[p.id];
    return state.proposals[id];
  }
  /** THE CALL. → the answer, `api_pending` (a proposal filed), or a refusal by name. `touch` = the chat's call row. */
  async function call(ctx, input = {}) {
    const cred = String(input.cred || '');
    const line = (req, extra) => audit(cred, F.auditLine({ at: now(), principal: ctx, conv: ctx.id, cred, req, ...extra }));
    const asked = () => ({ method: String(input.method || '').toUpperCase().slice(0, 8), host: null, path: String(input.path || '').slice(0, 200), query: [] });
    // a call on a credential this conversation holds no access to is a refused call too — its line in THAT credential's
    // log (the owner sees who asked); an id that names no credential writes nothing (no file for a made-up id), and
    // the agent's answer is the same either way (no existence oracle). The branch only logs (test-vendor-whitelist §14).
    const tr = tierNow(ctx, cred);
    const c = tr.tier !== 'none' ? credentialOf(cred) : null;
    if (!c) { if (tr.tier === 'none' && allCreds().some((x) => x.id === cred)) line(asked(), { verdict: 'refused', code: 'api_not_granted' }); return NOT_GRANTED(); }
    const v = F.validateRequest(c, input);
    if (!v.ok) { line(asked(), { verdict: 'refused', code: v.code }); return v; }
    const req = v.req;
    const cls = F.classOf(c, req), sensitive = F.sensitiveOf(c, req), shape = F.shapeOf(req);
    const shapes = shapesOf(ctx, cred);
    const vd = F.verdict({ tier: tr.tier, cls, sensitive, shape, shapes });
    const touch = { op: 'api', adapterId: cred, title: `${req.method} ${req.path}`, kind: c.kind };
    if (!vd.ok) { line(req, { verdict: 'refused', code: vd.code }); return { ...vd, touch }; }
    const bs = F.budgetCheck(stamps.get(`${cred}|${ctx.id}`) || [], now(), { perDay: tr.perDay });
    if (!bs.ok) { line(req, { verdict: 'refused', code: bs.code }); return { ...bs, touch }; }
    if (vd.action === 'propose') {
      // a proposal is a call of the budget, and one conversation keeps at most PENDING_MAX waiting (verify r1 M2)
      const waiting = pending().filter((p) => p.cred === cred && p.conv === ctx.id).length;
      if (waiting >= F.PENDING_MAX) { line(req, { verdict: 'refused', code: 'api_budget' }); return { ok: false, code: 'api_budget', error: `${waiting} of your API proposals on this credential wait for the user already — \`vibespace-channels api wait <id>\` until one is decided`, touch }; }
      stamps.set(`${cred}|${ctx.id}`, [...bs.stamps, now()]);
      const id = fileProposal(ctx, cred, c, req, { cls, sensitive, note: typeof input.why === 'string' && input.why.trim() ? input.why.trim().slice(0, 200) : null, why: vd.why }).id;
      save(); notifyOwner([id]);
      line(req, { verdict: 'proposed', proposal: id, bodySha: req.body ? crypto.createHash('sha256').update(req.body).digest('hex') : null });
      return { ok: false, code: 'api_pending', error: `this call waits for the user's approval (${sensitive ? `sensitive: ${sensitive}; your tier is ${F.TIER_SAYS[tr.tier] || tr.tier} — only Full trust (write-all) runs a sensitive call without asking` : 'a write under "ask each"'}) — proposal ${id}; \`vibespace-channels api wait ${id}\` prints the outcome`, proposal: proposalView(state.proposals[id], { agent: true }), touch: { ...touch, proposalId: id } };
    }
    const g = c.gate();
    if (g) { line(req, { verdict: 'refused', code: 'api_budget' }); return { ...g, code: 'api_budget', touch }; }
    stamps.set(`${cred}|${ctx.id}`, [...bs.stamps, now()]);
    const r = await run(ctx, cred, c, req);
    const trusted = vd.why === 'write-all' && sensitive ? { trust: 'write-all', sensitive } : {};   // 完全信任 · 敏感 on the log line and the chat row
    line(req, { verdict: r.ok ? 'ok' : r.withheld ? 'withheld' : 'refused', code: r.ok ? null : r.code, status: r.status || null, bytes: r.bytes || 0, ms: r.ms || 0, bodySha: req.body ? crypto.createHash('sha256').update(req.body).digest('hex') : null, ...trusted, redirect: r.ok ? null : r.to ? { to: r.to, why: r.why } : null });
    if (tierNow(ctx, cred).tier === 'none') return NOT_GRANTED();
    return { ...r, touch: { ...touch, count: r.status || 0, ...(trusted.trust ? { trust: 'write-all' } : {}) } };
  }
  /** One of the caller's OWN proposals (its outcome, for `wait`); another's = the uniform not-found. */
  function proposalFor(ctx, id) {
    const p = state.proposals[String(id || '')];
    if (!p || p.principal.id !== ctx.id || tierNow(ctx, p.cred).tier === 'none') return { ok: false, code: 'not-found', error: 'no such API proposal of yours' };
    return { ok: true, proposal: proposalView(p, { agent: true }) };
  }
  /** This conversation's own audit lines on one credential. */
  function logFor(ctx, cred) {
    if (tierNow(ctx, cred).tier === 'none') return NOT_GRANTED();
    return { ok: true, lines: auditTail(cred, { n: 20, principal: ctx }) };
  }

  // ── THE OWNER'S VERBS (cookie routes in src/routes/channels.js; an agent bearer is refused there first) ──
  function ownerView() {
    const e = eng();
    const rows = e && typeof e.apiGrants === 'function' ? e.apiGrants() : [];
    return { ok: true, creds: allCreds().map((c) => ({ ...c, grants: rows.filter((g) => g.scope && g.scope.id === c.id).map((g) => ({ principal: g.principal, tier: g.api, perDay: g.perDay || null })), except: e && typeof e.apiExceptOf === 'function' ? e.apiExceptOf(c.id) : [], shapes: state.shapes.filter((s) => s.cred === c.id), sensitive: (F.vendorRowOf(credentialOf(c.id)) || { sensitive: [] }).sensitive.map((re) => re.source) })), proposals: Object.values(state.proposals).sort((a, b) => b.at - a.at).slice(0, 50).map((p) => proposalView(p)) };
  }
  async function setTiers(cred, list, { by = 'user', except = undefined } = {}) {
    const e = eng();
    if (!e || typeof e.setApiGrants !== 'function') return { ok: false, code: 'unavailable', error: 'Channels are not available' };
    if (!allCreds().some((c) => c.id === cred)) return { ok: false, code: 'not-found', error: 'no such credential' };
    let rows;
    try { rows = (Array.isArray(list) ? list : []).filter((r) => r && r.tier && r.tier !== 'none').map((r) => F.apiGrant({ principal: r.principal, cred, tier: r.tier, perDay: r.perDay, at: now(), by, allWrite: r.allWrite === true })); }
    catch (err) { return { ok: false, code: /write_all_named_only/.test(err.message) ? 'write_all_named_only' : 'bad-request', error: err.message }; }
    const pk = (g) => `${g.principal.kind}:${g.principal.id}`;
    const was = new Map((typeof e.apiGrants === 'function' ? e.apiGrants() : []).filter((g) => g && g.scope && g.scope.id === cred && F.TIERS.includes(g.api)).map((g) => [pk(g), g]));
    const before = new Set([...was].filter(([, g]) => g.api === 'write-all').map(([k]) => k));
    const r = await e.setApiGrants(cred, rows, { by, except });   // lane grants-unify: «除了» — the members of a granted Task Group / All agents left out
    // a NEW 完全信任 writes its own line in the credential's API log: who holds it, when, by whom (the dialog shows it)
    if (r.ok) for (const g of rows) if (g.api === 'write-all' && !before.has(`${g.principal.kind}:${g.principal.id}`)) audit(cred, { at: now(), cred, principal: { kind: g.principal.kind, id: g.principal.id, name: g.principal.name || null }, conv: null, method: null, host: null, path: null, verdict: 'granted', tier: 'write-all', by: String(by).slice(0, 64) });
    // …and lowering one (any step down, a removal = none) writes the same-shaped `lowered` line (tier-verify L2)
    if (r.ok) for (const [k, g] of was) { const to = (rows.find((x) => pk(x) === k) || { api: 'none' }).api; if (F.TIERS.indexOf(to) < F.TIERS.indexOf(g.api)) audit(cred, { at: now(), cred, principal: { kind: g.principal.kind, id: g.principal.id, name: g.principal.name || null }, conv: null, method: null, host: null, path: null, verdict: 'lowered', tier: to, from: g.api, by: String(by).slice(0, 64) }); }
    // a tier below "Read + write" ends that principal's always-allowed shapes — a later re-widen starts asking again (verify r1 M1)
    if (r.ok) {
      const n = state.shapes.length;
      state.shapes = state.shapes.filter((s) => s.cred !== cred || ['write-ask', 'write-auto', 'write-all'].includes(tierNow(shapeCtx(s), cred).tier));
      if (state.shapes.length !== n) save();
      notifyOwner([]);
    }
    return r;
  }
  const shapeCtx = (s) => { const i = String(s.principal).indexOf(':'); return { kind: s.principal.slice(0, i), id: s.principal.slice(i + 1), groups: s.groups || [] }; };
  /** `digest` = the frozen digest the user's card was drawn from: a record that changed since (a restart over an edited
   *  file) runs nothing (verify r1 M3). */
  async function approve(id, { always = false, by = 'user', digest = null } = {}) {
    const p = state.proposals[String(id || '')];
    if (!p) return { ok: false, code: 'not-found', error: 'no such API proposal' };
    if (p.status !== 'pending') return { ok: false, code: 'not-pending', error: `this proposal is ${p.status} already` };
    if (!digest || digest !== (p.frozen && p.frozen.digest)) return { ok: false, code: 'api_frozen_mismatch', error: 'the card you approved is not the request on record — reopen API access… and decide the card again' };
    const req = F.thaw(p.frozen);
    const ctx = { kind: p.principal.kind, id: p.principal.id, name: p.principal.name, groups: p.principal.groups || [] };
    const c = credentialOf(p.cred);
    // a decided card that runs nothing is a refused call on its log line, like any other (lane channel-api-log-blank)
    const refused = (code) => audit(p.cred, F.auditLine({ at: now(), principal: ctx, conv: p.conv, cred: p.cred, req: req || p.frozen, verdict: 'refused', code, proposal: p.id, by }));
    if (!req || !c) { p.status = 'failed'; p.reason = !req ? 'the frozen request no longer matches its digest — nothing ran' : 'the credential is gone'; refused('api_frozen_mismatch'); save(); notifyOwner([p.id]); return { ok: false, code: 'api_frozen_mismatch', error: p.reason }; }
    if (tierNow(ctx, p.cred).tier === 'none') { p.status = 'failed'; p.reason = 'the agent no longer holds API access to this credential — nothing ran'; refused('api_not_granted'); save(); notifyOwner([p.id]); return { ok: false, code: 'api_not_granted', error: p.reason }; }
    p.status = 'running'; p.decidedAt = now(); p.decidedBy = by;
    if (always && p.offersAlways) state.shapes.push({ id: `shape-${crypto.randomBytes(5).toString('hex')}`, cred: p.cred, principal: `${ctx.kind}:${ctx.id}`, principalName: ctx.name || null, groups: ctx.groups, shape: F.shapeOf(req), at: now(), by });
    save();
    const kept = {};
    const r = await run(ctx, p.cred, c, req, kept);
    p.status = r.ok ? 'ran' : 'failed';
    p.result = r.ok ? { status: r.status, headers: r.headers, json: r.json, text: r.text, binary: r.binary || false, bytes: r.bytes, truncated: r.truncated } : { code: r.code, error: r.error, ...(r.to ? { status: r.status || null, from: r.from, to: r.to, why: r.why, resubmit: r.resubmit === true } : {}) };
    // 重新提交 (B-fc37): the target the vendor pointed at, kept SERVER-side (its query may be signed) for resubmit()
    if (!r.ok && r.resubmit === true && kept.target) p.redirect = { status: r.status, ...kept.target };
    audit(p.cred, F.auditLine({ at: now(), principal: ctx, conv: p.conv, cred: p.cred, req, status: r.status || null, bytes: r.bytes || 0, ms: r.ms || 0, verdict: r.ok ? 'approved' : r.withheld ? 'withheld' : 'refused', code: r.ok ? null : r.code, proposal: p.id, by, redirect: r.ok ? null : r.to ? { to: r.to, why: r.why } : null }));
    save(); notifyOwner([p.id]);
    return { ok: true, proposal: proposalView(p) };
  }
  /** 重新提交 (B-fc37) — the user's door on an approved card whose run the vendor redirected to a target the fence did not
   *  clear (it would need the user, or is heavier than the call): that target becomes a NEW proposal — its own card,
   *  words, chip and digest, judged like any call of the agent's — so what the user approves next is exactly what runs.
   *  Nothing runs here; once per card; `digest` = the failed card's own (the card the user pressed). */
  function resubmit(id, { by = 'user', digest = null } = {}) {
    const p = state.proposals[String(id || '')];
    if (!p) return { ok: false, code: 'not-found', error: 'no such API proposal' };
    if (p.status !== 'failed' || !p.redirect || p.resubmittedAs) return { ok: false, code: 'not-resubmittable', error: p.resubmittedAs ? `this card was resubmitted already (${p.resubmittedAs})` : 'only a card whose run the vendor redirected can be resubmitted' };
    if (!digest || digest !== (p.frozen && p.frozen.digest)) return { ok: false, code: 'api_frozen_mismatch', error: 'the card you pressed is not the request on record — reopen API access… and look again' };
    const orig = F.thaw(p.frozen), c = credentialOf(p.cred);
    if (!orig || !c) return { ok: false, code: 'api_frozen_mismatch', error: !orig ? 'the frozen request no longer matches its digest — nothing filed' : 'the credential is gone' };
    const ctx = { kind: p.principal.kind, id: p.principal.id, name: p.principal.name, groups: p.principal.groups || [] };
    const tr = tierNow(ctx, p.cred);
    if (tr.tier === 'none') return { ok: false, code: 'api_not_granted', error: 'the agent no longer holds API access to this credential — nothing filed' };
    const v = F.retarget(c, orig, p.redirect);
    if (!v.ok) return v;
    const cls = F.classOf(c, v.req), sensitive = F.sensitiveOf(c, v.req);
    const vd = F.verdict({ tier: tr.tier, cls, sensitive, shape: F.shapeOf(v.req), shapes: shapesOf(ctx, p.cred) });
    if (!vd.ok) return vd;
    if (pending().filter((x) => x.cred === p.cred && x.conv === p.conv).length >= F.PENDING_MAX) return { ok: false, code: 'api_budget', error: `${F.PENDING_MAX} of this agent's API proposals on the credential wait already — decide one first` };
    const np = fileProposal(ctx, p.cred, c, v.req, { cls, sensitive, note: p.note || null, why: 'resubmit', extra: { resubmitOf: p.id } });
    p.resubmittedAs = np.id;
    audit(p.cred, F.auditLine({ at: now(), principal: ctx, conv: p.conv, cred: p.cred, req: v.req, verdict: 'resubmitted', proposal: np.id, by }));
    save(); notifyOwner([p.id, np.id]);
    return { ok: true, proposal: proposalView(np) };
  }
  function reject(id, { reason = null, by = 'user' } = {}) {
    const p = state.proposals[String(id || '')];
    if (!p) return { ok: false, code: 'not-found', error: 'no such API proposal' };
    if (p.status !== 'pending') return { ok: false, code: 'not-pending', error: `this proposal is ${p.status} already` };
    p.status = 'rejected'; p.decidedAt = now(); p.decidedBy = by; p.reason = reason ? String(reason).slice(0, 500) : null;
    audit(p.cred, F.auditLine({ at: now(), principal: p.principal, conv: p.conv, cred: p.cred, req: F.thaw(p.frozen) || p.frozen, verdict: 'rejected', proposal: p.id, by }));
    save(); notifyOwner([p.id]);
    return { ok: true, proposal: proposalView(p) };
  }
  function revokeShape(id) {
    const n = state.shapes.length;
    state.shapes = state.shapes.filter((s) => s.id !== id);
    if (state.shapes.length === n) return { ok: false, code: 'not-found', error: 'no such always-allowed shape' };
    save(); notifyOwner([]);
    return { ok: true };
  }

  return { creds, docs, call, proposalFor, logFor, ownerView, setTiers, approve, resubmit, reject, revokeShape, auditTail, pending };
}

module.exports = { create, AUDIT_RING_BYTES, TAIL_LINES, TAIL_BYTES };
