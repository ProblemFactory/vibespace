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
const SR = require('../store-read.js');
const HOLD = require('../store-read-hold.js');   // 主开发 r3005 (the content stores): channels/api-proposals.json under the store-read law
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

function create({ dataDir, engine, getMounts = () => null, fetchFn = (typeof fetch === 'function' ? fetch : null), now = () => Date.now(), broadcast = () => {}, log = console, writer = null } = {}) {
  if (!dataDir) throw new Error('channel-api: dataDir is required');
  const eng = () => (typeof engine === 'function' ? engine() : engine);
  const dir = path.join(dataDir, 'channels');
  const stateFile = path.join(dir, 'api-proposals.json');
  // THE STORE-READ LAW (主开发 r3005, the content stores; src/store-read-hold.js). The release read ANY failure as «no proposal» and
  // the agent's next proposal wrote over the file: the pending proposals (an Approve found nothing), the decided history and the
  // owner's «always allow» shapes gone. HELD: a new proposal, an Approve / Reject / Resubmit and a shape's revoke are refused by
  // name (api_unread); a write an always-allowed shape would run is ASKED, and the ask refused (the shapes are unread — never
  // «allowed» on an unread list); a read call runs as before; nothing is written over the file; it is read again off the loop.
  // THE LIFT judges every shape read back against the tiers NOW (a tier lowered while held ends it). Torn bytes are kept aside
  // once per content, then it starts empty. A REMOVER reads its silence: the cards' sync (channel-api-cards.js) drops its link
  // rows of proposals the view no longer names — while held it removes nothing (isHeldUnread); after torn bytes its drop is of
  // derived rows only (the For-you items themselves stay).
  const PROPOSALS_SHAPE = (v) => !!v && typeof v === 'object' && !Array.isArray(v) && (v.proposals === undefined || (!!v.proposals && typeof v.proposals === 'object' && !Array.isArray(v.proposals))) && (v.shapes === undefined || Array.isArray(v.shapes));
  const hold = HOLD.create({
    file: stateFile, valid: PROPOSALS_SHAPE, code: 'api_unread', aside: (mark) => stateFile + '.corrupt-' + mark,
    words: (h) => `VibeSpace cannot read its API proposals right now (${h.code}); it reads them again by itself every few minutes. No proposal is lost: nothing is written over them, and new API proposals and their decisions wait until it reads`,
    log: (s) => log.warn('[channel-api] ' + s),
    onLift: (v) => lifted(v),
  });
  const state = (() => {
    let read; try { read = { text: fs.readFileSync(stateFile, 'utf8') }; } catch (error) { read = { error }; }
    const a0 = SR.storeAnswer(read, { valid: PROPOSALS_SHAPE });
    const j = hold.start(a0) === 'data' ? a0.value : {};
    return { proposals: j.proposals || {}, shapes: Array.isArray(j.shapes) ? j.shapes : [] };
  })();
  const heldRefusal = () => ({ ok: false, code: 'api_unread', error: hold.words() });
  const stamps = new Map();        // `${cred}|${principal id}` -> call instants (the grant's budget)
  const mountTokens = new Map();   // mountId -> { token, until } (a refreshed access token, memory only)
  const refreshing = new Map();    // mountId -> the ONE refresh in flight (single-flight) | { failedUntil } after a refusal (paced)
  // B-574d slice «channels-small-stores» (lane nl-journals, 主开发 r4939): THE STORE WRITER (src/store-writer.js — its thread does the temp,
  // the write, the SYNC and the rename, off the hub's loop; ONE writer for this file). An agent's proposal, the hold's lift and the groups'
  // change signal HAND the file (the bytes made at the write); a PERSON's decision (Approve — its «running» mark before the call and its
  // outcome after —, Reject, Resubmit, a shape's revoke) also LANDS by the writer's own synchronous flush before its answer: false when it
  // is not on disk (kept in memory, written again by the writer). The cards' sync reads this file: it takes the writer's owed bytes first.
  const SW = () => writer || require('../store-writer.js').storeWriter();
  function save({ act = false } = {}) {
    if (!hold.writable('an API proposal change')) return true;
    try { SW().dirty(stateFile, { name: 'api-proposals.write', makeDir: true, produce: () => JSON.stringify(state) }); } catch (e) { log.warn('[channel-api] the state write was not handed to the store writer:', e && e.message); return false; }
    if (!act) return true;
    const r = SW().flushSync([stateFile]);
    return !!r && !r.deferred && !(r.left || []).some((x) => x && x.file === stateFile);   // a flush deferred to the exit's own is no landing
  }
  const notOnDisk = (what) => ({ ok: false, code: 'not-durable', status: 503, notOnDisk: true, error: `${what}, but data/channels/api-proposals.json is not on disk yet (the storage did not write it) — it is kept and written again` });
  const credDir = (cred) => path.join(dir, String(cred).replace(/[^A-Za-z0-9._-]/g, '_'), 'api.ndjson');
  const pkOf = (ctx) => `${ctx.kind}:${ctx.id}`;
  /** The call shapes this principal's cards made always-allowed on one credential (the verdict's `shapes`). */
  // a shape KEPT only because its principal's groups were unknown (`keptHeld`) never auto-allows — held or not (the delta reads: a
  // re-widen while held, or after, would run calls with no ask); the store's read drops it (below); the agent asks again
  const shapesOf = (ctx, cred) => state.shapes.filter((s) => s.cred === cred && s.principal === pkOf(ctx) && s.keptHeld !== true).map((s) => s.shape);

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
    // B-4e97: a 403 for a missing scope said, never silent; cure: the challenge line gets the SAME scrub as the answer's headers
    // (the bearer never rides an answer — not even inside a vendor's echo of it in scope=)
    const scopeSays = res.status === 403 ? scopeRefusalOf(c, cur, String(res.headers.get('www-authenticate') || '').split(token).join(REDACTED)) : null;
    return { ok: true, status: res.status, headers: beltValue(hdrs), ...beltBody(scrubToken(b.body, token), res.headers.get('content-type')), bytes: b.bytes, truncated: b.truncated, ms: now() - t0, ...(scopeSays ? { scopeSays } : {}) };
  }
  /** B-4e97: the ONE line a scope refusal adds — the vendor's own challenge names the scope, else the row's declaration for
   *  the host the call went to (the held token lacks every scope it lists); null when neither says so. */
  function scopeRefusalOf(c, req, challenge) {
    const ins = F.insufficientScopeOf(challenge);
    const host = String((req && req.host) || '').toLowerCase();
    const need = F.reachOf(F.vendorRowOf(c), c && typeof c.scopes === 'function' ? c.scopes() : null).needs.find((n) => n.host === host);
    if (!ins && !need) return null;
    const scopes = ins && ins.scopes.length ? ins.scopes : need ? need.scopes : [];
    // belted like every answer field (the scope names come from the vendor's header — reduced to the token alphabet above)
    return beltValue(`the token lacks the permission this API needs${scopes.length ? ` (${scopes.slice(0, 6).join(' or ')}${scopes.length > 6 ? ' …' : ''})` : ''} — this account's sign-in did not ask for it; whether it asks for more is the user's decision`);
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
    const mh = mountsHeldOf();   // B-f276 (r3230's table): mounts.json held — a mount's credentials are UNKNOWN, never «none granted»
    return { ok: true, ...(mh ? { mountsHeld: mh } : {}), creds: list.map((c) => ({ id: c.id, kind: c.kind, label: c.label, source: c.source, tier: c.tier, tierSays: F.TIER_SAYS[c.tier] || c.tier, perDay: c.perDay || F.BUDGET_DEFAULT.perDay, perMin: F.BUDGET_DEFAULT.perMin })) };
  }
  /** The vendor's OWN docs + the fence summary — nothing else is "known" by VibeSpace. */
  function docs(ctx, cred) {
    { const mh = String(cred || '').startsWith('mount:') ? mountsHeldOf() : null; if (mh) return { ok: false, code: 'store-blocked', error: mh }; }   // B-f276 (r3230's table)
    const tr = tierNow(ctx, cred);
    const c = tr.tier !== 'none' && allCreds().some((x) => x.id === cred) ? credentialOf(cred) : null;
    const v = F.vendorRowOf(c);
    if (!v) return NOT_GRANTED();
    // B-4e97: the hosts the HELD token reaches; the rest named with the scopes they need (the consent is the owner's)
    const r = F.reachOf(v, c && typeof c.scopes === 'function' ? c.scopes() : null);
    return { ok: true, cred, vendor: v.label, docs: v.docs, hosts: r.reach, ...(r.needs.length ? { needsScope: r.needs, needsScopeSays: 'these hosts need a permission this account\'s sign-in did not ask for — calls there are refused (403); whether its sign-in asks for more is the user\'s decision' } : {}), tier: tr.tier, tierSays: F.TIER_SAYS[tr.tier] || tr.tier, fence: { readByPost: v.readByPost.map(String), sensitive: v.sensitive.map(String), sensitiveAlso: ['DELETE', `a body over ${F.SENSITIVE_BODY / 1024} KiB`, 'an upload'], budget: { perMin: F.BUDGET_DEFAULT.perMin, perDay: tr.perDay || F.BUDGET_DEFAULT.perDay }, bodyMax: F.BODY_MAX, responseMax: F.RESPONSE_MAX } };
  }
  /** ONE PROPOSAL: the FROZEN request (what the user's Approve runs), the policy, the agent's note; the oldest decided
   *  ones beyond PROPOSALS_KEEP are dropped. The caller saves + tells the owner. */
  function fileProposal(ctx, cred, c, req, { cls, sensitive, note = null, why, extra = {} }) {
    const id = `api-${crypto.randomBytes(6).toString('hex')}`;
    state.proposals[id] = { id, status: 'pending', cred, credLabel: c.label, kind: c.kind, at: now(), conv: ctx.id, principal: { kind: ctx.kind, id: ctx.id, name: ctx.name || null, groups: ctx.groups || [], ...(ctx.inheritedGroups === null ? { inheritedGroups: null } : Array.isArray(ctx.inheritedGroups) && ctx.inheritedGroups.length ? { inheritedGroups: ctx.inheritedGroups } : {}), ...(ctx.groupsUnreadable === true ? { groupsUnreadable: true } : {}) }, frozen: F.freeze(req), sensitive, offersAlways: F.offersAlways({ cls, sensitive }), note, why, ...extra };
    const keep = Object.values(state.proposals).sort((a, b) => b.at - a.at).slice(PROPOSALS_KEEP).filter((p) => p.status !== 'pending');
    for (const p of keep) delete state.proposals[p.id];
    return state.proposals[id];
  }
  /** THE CALL. → the answer, `api_pending` (a proposal filed), or a refusal by name. `touch` = the chat's call row. */
  // B-f276 A2 (主开发 r487): while the channels are PAUSED nothing is fetched or sent on a channels credential — a call and an
  // approval refused BY NAME (store-blocked) before any vendor request; a lent mount's credential is not the channels'
  // B-f276 family unit 2 (round wgbjnr750's MUST — MS1's second road): a `mount:` credential while mounts.json is HELD is UNKNOWN, never
  // «gone»: a person's Approve / Resubmit and an agent's call are refused BY NAME before anything changes (the card stays pending, the
  // press works after the lift) — the sweep's road was cured in commit 2
  const mountsHeldOf = () => { try { const m = getMounts(); return m && typeof m.unreadWords === 'function' ? m.unreadWords() || null : null; } catch { return null; } };
  const pausedOf = (cred) => { if (String(cred || '').startsWith('mount:')) { const w = mountsHeldOf(); return w ? { error: w, code: 'storage_unread' } : null; } const e = eng(); return e && typeof e.pausedState === 'function' ? e.pausedState() : null; };
  async function call(ctx, input = {}) {
    const cred = String(input.cred || '');
    { const pz = pausedOf(cred); if (pz) return { ok: false, code: 'store-blocked', error: pz.error }; }
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
    if (vd.action === 'propose' && hold.held()) { line(req, { verdict: 'refused', code: 'api_unread' }); return { ...heldRefusal(), touch }; }   // r3005: held — no proposal filed into an unread list
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
    if (hold.held()) return heldRefusal();
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
    // B-f276 family unit 2 (the census's MS1): mounts.json HELD lends no client because it is UNREAD — the view says so (a remover
    // never reads a held store's silence as «the account was removed»)
    const mountsHeld = (() => { try { const m = getMounts(); return !!(m && typeof m.unreadWords === 'function' && m.unreadWords()); } catch { return false; } })();
    return { ...(hold.held() ? { held: hold.words(), code: 'api_unread' } : {}), ok: true, ...(mountsHeld ? { mountsHeld: true } : {}), creds: allCreds().map((c) => ({ ...c, grants: rows.filter((g) => g.scope && g.scope.id === c.id).map((g) => ({ principal: g.principal, tier: g.api, perDay: g.perDay || null })), except: e && typeof e.apiExceptOf === 'function' ? e.apiExceptOf(c.id) : [], shapes: state.shapes.filter((s) => s.cred === c.id), sensitive: (F.vendorRowOf(credentialOf(c.id)) || { sensitive: [] }).sensitive.map((re) => re.source) })), proposals: Object.values(state.proposals).sort((a, b) => b.at - a.at).slice(0, 50).map((p) => proposalView(p)) };
  }
  async function setTiers(cred, list, { by = 'user', except = undefined, removeExcept = [] } = {}) {
    const e = eng();
    if (!e || typeof e.setApiGrants !== 'function') return { ok: false, code: 'unavailable', error: 'Channels are not available' };
    if (!allCreds().some((c) => c.id === cred)) { const mh = String(cred || '').startsWith('mount:') ? mountsHeldOf() : null; return mh ? { ok: false, code: 'store-blocked', error: mh } : { ok: false, code: 'not-found', error: 'no such credential' }; }   // B-f276 (r3230's table)
    let rows;
    try { rows = (Array.isArray(list) ? list : []).filter((r) => r && r.tier && r.tier !== 'none').map((r) => F.apiGrant({ principal: r.principal, cred, tier: r.tier, perDay: r.perDay, at: now(), by, allWrite: r.allWrite === true })); }
    catch (err) { return { ok: false, code: /write_all_named_only/.test(err.message) ? 'write_all_named_only' : 'bad-request', error: err.message }; }
    const pk = (g) => `${g.principal.kind}:${g.principal.id}`;
    const was = new Map((typeof e.apiGrants === 'function' ? e.apiGrants() : []).filter((g) => g && g.scope && g.scope.id === cred && F.TIERS.includes(g.api)).map((g) => [pk(g), g]));
    const before = new Set([...was].filter(([, g]) => g.api === 'write-all').map(([k]) => k));
    const r = await e.setApiGrants(cred, rows, { by, except, removeExcept: Array.isArray(removeExcept) ? removeExcept : [] });   // lane grants-unify: «除了» — the members of a granted Task Group / All agents left out
    // a NEW 完全信任 writes its own line in the credential's API log: who holds it, when, by whom (the dialog shows it)
    if (r.ok) for (const g of rows) if (g.api === 'write-all' && !before.has(`${g.principal.kind}:${g.principal.id}`)) audit(cred, { at: now(), cred, principal: { kind: g.principal.kind, id: g.principal.id, name: g.principal.name || null }, conv: null, method: null, host: null, path: null, verdict: 'granted', tier: 'write-all', by: String(by).slice(0, 64) });
    // …and lowering one (any step down, a removal = none) writes the same-shaped `lowered` line (tier-verify L2)
    if (r.ok) for (const [k, g] of was) { const to = (rows.find((x) => pk(x) === k) || { api: 'none' }).api; if (F.TIERS.indexOf(to) < F.TIERS.indexOf(g.api)) audit(cred, { at: now(), cred, principal: { kind: g.principal.kind, id: g.principal.id, name: g.principal.name || null }, conv: null, method: null, host: null, path: null, verdict: 'lowered', tier: to, from: g.api, by: String(by).slice(0, 64) }); }
    // a tier below "Read + write" ends that principal's always-allowed shapes — a later re-widen starts asking again (verify r1 M1)
    if (r.ok) {
      const n = state.shapes.length;
      const KEEP = ['write-ask', 'write-auto', 'write-all'];
      // the follow-owed read's must: WHILE Task Groups are held, a shape whose tier falls on an unknown group is kept (B-55dc's law: no
      // drop on an unknown answer); once they read, a tier lowered for any reason ends it — a shape recorded while held included
      // (the delta read: kept for good, a later re-widen auto-allowed with no ask; a drop only means the agent asks again)
      // only a group row (or a group left out of a row) at Read + write or above can lift the tier back — a Read-only group row decides
      // nothing here; a shape kept on the unknown is STAMPED `keptHeld`, and once the store reads the next prune drops it
      const heldNow = require('./groups-hold.js').held();
      const mark = { stamped: false };
      state.shapes = state.shapes.filter((s) => shapeStays(s, cred, heldNow, mark, KEEP));
      const landed = state.shapes.length !== n || mark.stamped ? save({ act: by === 'user' }) : true;   // B-574d: the OWNER's tier change prunes the shapes — it lands before the answer (a pruned shape never comes back after a crash)
      notifyOwner([]);
      if (!landed) return notOnDisk('The access was changed and its always-allowed calls ended');   // r5041 (a): said as a Reject and a revoke say it (not-durable, 503)
    }
    return r;
  }
  // a RECORDED principal (a shape, a proposal) carries the groups it was filed with — the hold rides it too (主开发 05:42Z (3): at the
  // base the model's own predicate refused these while Task Groups were held unread; a recorded list is judged under the same fact)
  // the follow-owed read: a tier that is `none` ONLY because Task Groups are held (the principal's recorded groups, read as read, would
  // reach it) is UNKNOWN — a card is never used up on it, a shape never dropped on it
  // A RECORDED group list (a proposal's principal, a shape) carries its OWN mark: recorded while Task Groups were held ⇒ its
  // groups are UNKNOWN for good — never «in no group» once the store reads (the follow-owed read's MUST: an approve after the lift
  // judged the held [] as read, and an «All agents except G» row admitted G's agent). It is judged under the hold NOW as well
  // (主开发 05:42Z (3)). An unknown that decides the tier refuses BY NAME, never «no longer holds».
  const markOf = (r) => (r && r.groupsUnreadable === true ? { groupsUnreadable: true } : {});
  const judgedCtx = (pr) => ({ kind: pr.kind, id: pr.id, name: pr.name, groups: pr.groups || [], inheritedGroups: pr.inheritedGroups === null ? null : (pr.inheritedGroups || []), ...markOf(pr), ...require('./groups-hold.js').fact() });   // lane lg-group-parents U3c: + the recorded lineage
  // the unknown DECIDES when any row of the credential is a Task Group's or leaves a Task Group out (the delta read: access that comes
  // THROUGH a group reads the held [] as a known «none» — «no longer holds» there was false too)
  const groupDecides = (cred, tiers = null) => { const e = eng(); return (e && typeof e.apiGrants === 'function' ? e.apiGrants() : []).some((g) => g && g.scope && g.scope.id === cred && (!tiers || tiers.includes(g.api)) && ((g.principal && g.principal.kind === 'group') || (Array.isArray(g.except) && g.except.some((x) => x && x.kind === 'group')))); };
  const heldTierUnknown = (ctx, cred) => ctx.groupsUnreadable === true && groupDecides(cred);
  /** the tier rule a kept «always allow» shape answers — setTiers' prune and the lift's (r3005) */
  function shapeStays(s, cred, heldNow, mark, KEEP = ['write-ask', 'write-auto', 'write-all']) {
    if (s.cred !== cred) return true;
    if (!heldNow && s.keptHeld === true) return false;
    const sc = shapeCtx(s);
    if (KEEP.includes(tierNow(sc, cred).tier)) return true;
    if (heldNow && sc.groupsUnreadable === true && groupDecides(cred, KEEP)) { if (s.keptHeld !== true) { s.keptHeld = true; mark.stamped = true; } return true; }
    return false;
  }
  /** r3005: the hold lifted — the proposals back (or, torn bytes kept aside, none), every shape judged against the tiers NOW */
  function lifted(v) {
    state.proposals = (v && v.proposals) || {}; state.shapes = v && Array.isArray(v.shapes) ? v.shapes : [];
    const heldNow = require('./groups-hold.js').held(), mark = { stamped: false }, n = state.shapes.length;
    for (const cred of new Set(state.shapes.map((s) => s && s.cred))) state.shapes = state.shapes.filter((s) => shapeStays(s, cred, heldNow, mark));
    if (state.shapes.length !== n || mark.stamped) save();
    try { notifyOwner(Object.keys(state.proposals)); } catch { }
  }
  const HELD_TIER_WORDS = 'Task Groups cannot be read right now, and this access comes through a Task Group — nothing ran; the card stays — decide it again once they read';
  const FILED_UNREAD_WORDS = 'This was filed while Task Groups could not be read, and this access comes through a Task Group — the agent\'s groups then are unknown, so nothing ran; reject it and let the agent ask again';
  const unknownRefusal = (pr) => (pr && pr.groupsUnreadable !== true && require('./groups-hold.js').held() ? { ok: false, code: 'groups_unreadable', error: HELD_TIER_WORDS } : { ok: false, code: 'groups_unknown_filed', error: FILED_UNREAD_WORDS });
  const shapeCtx = (s) => { const i = String(s.principal).indexOf(':'); return { kind: s.principal.slice(0, i), id: s.principal.slice(i + 1), groups: s.groups || [], inheritedGroups: s.inheritedGroups === null ? null : (s.inheritedGroups || []), ...markOf(s), ...require('./groups-hold.js').fact() }; };
  /** `digest` = the frozen digest the user's card was drawn from: a record that changed since (a restart over an edited
   *  file) runs nothing (verify r1 M3). */
  async function approve(id, { always = false, by = 'user', digest = null } = {}) {
    if (hold.held()) return heldRefusal();
    const p = state.proposals[String(id || '')];
    if (!p) return { ok: false, code: 'not-found', error: 'no such API proposal' };
    { const pz = pausedOf(p.cred); if (pz) return { ok: false, code: 'store-blocked', error: pz.error }; }   // B-f276: the card stays pending
    if (p.status !== 'pending') return { ok: false, code: 'not-pending', error: `this proposal is ${p.status} already` };
    if (!digest || digest !== (p.frozen && p.frozen.digest)) return { ok: false, code: 'api_frozen_mismatch', error: 'the card you approved is not the request on record — reopen API access… and decide the card again' };
    const req = F.thaw(p.frozen);
    const ctx = judgedCtx(p.principal);   // the recorded list: its own mark + the hold now (主开发 05:42Z (3))
    const c = credentialOf(p.cred);
    // a decided card that runs nothing is a refused call on its log line, like any other (lane channel-api-log-blank)
    const refused = (code) => audit(p.cred, F.auditLine({ at: now(), principal: ctx, conv: p.conv, cred: p.cred, req: req || p.frozen, verdict: 'refused', code, proposal: p.id, by }));
    if (!req || !c) { p.status = 'failed'; p.reason = !req ? 'the frozen request no longer matches its digest — nothing ran' : 'the credential is gone'; refused('api_frozen_mismatch'); save({ act: true }); notifyOwner([p.id]); return { ok: false, code: 'api_frozen_mismatch', error: p.reason }; }
    // the follow-owed read: Task Groups HELD and the card's access comes through a group — its tier is UNKNOWN: refused BY NAME, the card
    // stays pending (never used up on «no longer holds API access», a false end)
    if (tierNow(ctx, p.cred).tier === 'none' && heldTierUnknown(ctx, p.cred)) return unknownRefusal(p.principal);
    if (tierNow(ctx, p.cred).tier === 'none') { p.status = 'failed'; p.reason = 'the agent no longer holds API access to this credential — nothing ran'; refused('api_not_granted'); save({ act: true }); notifyOwner([p.id]); return { ok: false, code: 'api_not_granted', error: p.reason }; }
    const was = { decidedAt: p.decidedAt, decidedBy: p.decidedBy }, shapesBefore = state.shapes.length;
    p.status = 'running'; p.decidedAt = now(); p.decidedBy = by;
    if (always && p.offersAlways) state.shapes.push({ id: `shape-${crypto.randomBytes(5).toString('hex')}`, cred: p.cred, principal: `${ctx.kind}:${ctx.id}`, principalName: ctx.name || null, groups: ctx.groups, ...(ctx.inheritedGroups === null ? { inheritedGroups: null } : ctx.inheritedGroups && ctx.inheritedGroups.length ? { inheritedGroups: ctx.inheritedGroups } : {}), ...markOf(p.principal), shape: F.shapeOf(req), at: now(), by });   // the shape keeps the list's own mark
    // B-574d: THE RUN'S MARK IS ON DISK BEFORE THE CALL RUNS (the writer's synchronous flush) — else NOTHING runs: a restart would offer the
    // same card again and a second Approve would call the vendor twice. The card goes back to pending, said by name (api_not_recorded)
    if (!save({ act: true })) {
      p.status = 'pending'; p.decidedAt = was.decidedAt; p.decidedBy = was.decidedBy; state.shapes.length = shapesBefore;
      save(); notifyOwner([p.id]);
      return { ok: false, code: 'api_not_recorded', status: 503, notOnDisk: true, error: 'the Approve could not be recorded — the storage did not write it, so nothing ran; the card is still pending: approve it again once the storage answers' };
    }
    const kept = {};
    const r = await run(ctx, p.cred, c, req, kept);
    p.status = r.ok ? 'ran' : 'failed';
    p.result = r.ok ? { status: r.status, headers: r.headers, json: r.json, text: r.text, binary: r.binary || false, bytes: r.bytes, truncated: r.truncated, ...(r.scopeSays ? { scopeSays: r.scopeSays } : {}) } : { code: r.code, error: r.error, ...(r.to ? { status: r.status || null, from: r.from, to: r.to, why: r.why, resubmit: r.resubmit === true } : {}) };
    // 重新提交 (B-fc37): the target the vendor pointed at, kept SERVER-side (its query may be signed) for resubmit()
    if (!r.ok && r.resubmit === true && kept.target) p.redirect = { status: r.status, ...kept.target };
    audit(p.cred, F.auditLine({ at: now(), principal: ctx, conv: p.conv, cred: p.cred, req, status: r.status || null, bytes: r.bytes || 0, ms: r.ms || 0, verdict: r.ok ? 'approved' : r.withheld ? 'withheld' : 'refused', code: r.ok ? null : r.code, proposal: p.id, by, redirect: r.ok ? null : r.to ? { to: r.to, why: r.why } : null }));
    const landed = save({ act: true }); notifyOwner([p.id]);
    return { ok: true, proposal: proposalView(p), ...(landed ? {} : { notOnDisk: true }) };   // B-574d: the call RAN — its outcome kept in memory and written again when not on disk
  }
  /** 重新提交 (B-fc37) — the user's door on an approved card whose run the vendor redirected to a target the fence did not
   *  clear (it would need the user, or is heavier than the call): that target becomes a NEW proposal — its own card,
   *  words, chip and digest, judged like any call of the agent's — so what the user approves next is exactly what runs.
   *  Nothing runs here; once per card; `digest` = the failed card's own (the card the user pressed). */
  function resubmit(id, { by = 'user', digest = null } = {}) {
    if (hold.held()) return heldRefusal();
    const p = state.proposals[String(id || '')];
    if (!p) return { ok: false, code: 'not-found', error: 'no such API proposal' };
    { const pz = pausedOf(p.cred); if (pz) return { ok: false, code: 'store-blocked', error: pz.error }; }   // (MS1's second road: the resubmit beside the approve)
    if (p.status !== 'failed' || !p.redirect || p.resubmittedAs) return { ok: false, code: 'not-resubmittable', error: p.resubmittedAs ? `this card was resubmitted already (${p.resubmittedAs})` : 'only a card whose run the vendor redirected can be resubmitted' };
    if (!digest || digest !== (p.frozen && p.frozen.digest)) return { ok: false, code: 'api_frozen_mismatch', error: 'the card you pressed is not the request on record — reopen API access… and look again' };
    const orig = F.thaw(p.frozen), c = credentialOf(p.cred);
    if (!orig || !c) return { ok: false, code: 'api_frozen_mismatch', error: !orig ? 'the frozen request no longer matches its digest — nothing filed' : 'the credential is gone' };
    const ctx = judgedCtx(p.principal);   // the recorded list: its own mark + the hold now (主开发 05:42Z (3))
    const tr = tierNow(ctx, p.cred);
    if (tr.tier === 'none' && heldTierUnknown(ctx, p.cred)) return unknownRefusal(p.principal);   // the follow-owed read: unknown, never «no longer holds»
    if (tr.tier === 'none') return { ok: false, code: 'api_not_granted', error: 'the agent no longer holds API access to this credential — nothing filed' };
    const v = F.retarget(c, orig, p.redirect);
    if (!v.ok) return v;
    const cls = F.classOf(c, v.req), sensitive = F.sensitiveOf(c, v.req);
    const vd = F.verdict({ tier: tr.tier, cls, sensitive, shape: F.shapeOf(v.req), shapes: shapesOf(ctx, p.cred) });
    if (!vd.ok) return vd;
    if (pending().filter((x) => x.cred === p.cred && x.conv === p.conv).length >= F.PENDING_MAX) return { ok: false, code: 'api_budget', error: `${F.PENDING_MAX} of this agent's API proposals on the credential wait already — decide one first` };
    const np = fileProposal({ ...ctx, groupsUnreadable: p.principal.groupsUnreadable === true }, p.cred, c, v.req, { cls, sensitive, note: p.note || null, why: 'resubmit', extra: { resubmitOf: p.id } });   // the new record keeps the OLD list's mark (its groups were recorded then)
    p.resubmittedAs = np.id;
    audit(p.cred, F.auditLine({ at: now(), principal: ctx, conv: p.conv, cred: p.cred, req: v.req, verdict: 'resubmitted', proposal: np.id, by }));
    const landed = save({ act: true }); notifyOwner([p.id, np.id]);
    if (!landed) return notOnDisk('The new card was filed');
    return { ok: true, proposal: proposalView(np) };
  }
  function reject(id, { reason = null, by = 'user' } = {}) {
    if (hold.held()) return heldRefusal();
    const p = state.proposals[String(id || '')];
    if (!p) return { ok: false, code: 'not-found', error: 'no such API proposal' };
    if (p.status !== 'pending') return { ok: false, code: 'not-pending', error: `this proposal is ${p.status} already` };
    p.status = 'rejected'; p.decidedAt = now(); p.decidedBy = by; p.reason = reason ? String(reason).slice(0, 500) : null;
    audit(p.cred, F.auditLine({ at: now(), principal: p.principal, conv: p.conv, cred: p.cred, req: F.thaw(p.frozen) || p.frozen, verdict: 'rejected', proposal: p.id, by }));
    // r5041 (主开发, MUST 2): ONLY A PERSON's Reject lands by the synchronous flush — the cards' sweep ends a card (expired by the clock,
    // withdrawn when the agent's conversation or access is gone) on a timer or an agent's broadcast: HANDED, like every machine-made write.
    // A restart before that ending lands reads the card pending again, and the next sweep ends it again (the release's rule)
    const landed = save({ act: by === 'user' }); notifyOwner([p.id]);
    if (!landed) return notOnDisk('The card was rejected');
    return { ok: true, proposal: proposalView(p) };
  }
  function revokeShape(id) {
    if (hold.held()) return heldRefusal();
    const n = state.shapes.length;
    state.shapes = state.shapes.filter((s) => s.id !== id);
    if (state.shapes.length === n) return { ok: false, code: 'not-found', error: 'no such always-allowed shape' };
    const landed = save({ act: true }); notifyOwner([]);
    if (!landed) return notOnDisk('The always-allowed call was revoked');
    return { ok: true };
  }

  // THE STORE READ (groups-hold's change signal): the shapes kept on an unknown end at once — the owner's list never shows one as
  // «always allowed» that no longer applies (the delta read)
  const offShapeLift = require('./groups-hold.js').onStoreChange(() => {
    if (require('./groups-hold.js').held() || !state.shapes.some((s) => s.keptHeld === true)) return;
    state.shapes = state.shapes.filter((s) => s.keptHeld !== true);
    save(); notifyOwner([]);
  });
  const close = () => { try { offShapeLift(); } catch { } hold.stop(); };
  return { creds, docs, call, proposalFor, logFor, ownerView, setTiers, approve, resubmit, reject, revokeShape, auditTail, pending, close, isHeldUnread: () => !!hold.held(), heldWords: () => hold.words(), _hold: hold };
}

module.exports = { create, AUDIT_RING_BYTES, TAIL_LINES, TAIL_BYTES };
