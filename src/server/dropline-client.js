'use strict';
// THE ONE VENDOR SURFACE of Dropline voice input (design q-029 §1; P0 = the key tier). Every request to Dropline is
// built HERE and nowhere else — scripts/test-vendor-whitelist.mjs counts the host's request constructions per file
// (this file's row: max 6, gates pluginOn / credentialOf) and reds a copy planted anywhere else.
//   dictate({audio, mime, ctx, language, uiLang}) → POST /v1/dictate, multipart in the documented order
//     request → context → audio (DICTATE_PART_ORDER); 502/503/504 retried ONCE; 429's Retry-After handed back;
//     401/403 ⇒ `reconnect`. The audio is held in memory for the one request: never written, never logged.
//   me(apiKey?) → GET /v1/me → {name, team} (the plugin card's "Connected: <name> · <team>" + the registry Test).
// P1 (lane voice-p1-oauth-teach): THE OAUTH TIER — register (ONE client per deployment), the authorize URL (S256,
// scope dropline:api, resource = the API), the code exchange and the refresh; the pair {access, accessExp, refresh,
// refreshExp, clientId} sits in `tokens` (data/dropline-oauth.json, 0600); a refresh is SINGLE-FLIGHT (gmail.js's
// `refreshing` shape) and its rotation is WRITTEN BEFORE USE (a write failure keeps the old pair); a 401 after one
// refresh ⇒ `reconnect`. The TEACH calls — vocabulary() (a read), terms(list) and context({title, text}) (writes, only
// ever called by src/server/voice-teach-engine.js after the person's press, under `teachCap`).
// The key/token lives only in the hub; a browser never sees it. 20 dictations a minute per instance (the account's
// 30/min is shared with the person's own apps). Precedence: the person's own `dl_` key > the OAuth pair > none.
const VM = require('../voice-model.js');

const DROPLINE_BASE = 'https://api.dropline.fish.audio';
const OAUTH_BASE = 'https://api.fish.audio';                     // /oauth/register + /oauth/token (measured 2026-10-12)
const AUTHORIZE_URL = 'https://fish.audio/oauth/authorize';      // the consent page (the person's own browser tab)
const OAUTH_SCOPE = 'dropline:api';
const REFRESH_LIFE_MS = 60 * 24 * 3600e3;                        // the refresh token's 60 days
const ACCESS_SKEW_MS = 60e3;                                     // refresh a minute before the access token ends
const DEFAULT_ACCESS_S = 86400;                                  // measured: expires_in 86400 (the docs say 1 h; never assumed)

class DroplineError extends Error {
  constructor(code, message, { status = 502, retryAfter = null, requestId = null } = {}) {
    super(message); this.code = code; this.status = status; this.retryAfter = retryAfter; this.requestId = requestId;
  }
}

function create({ integrations = null, pluginOn = () => true, base = DROPLINE_BASE, oauthBase = OAUTH_BASE, authorizeUrl: authorizeBase = AUTHORIZE_URL, tokens = null, teachCap = () => true, fetchImpl = null, now = Date.now, log = console } = {}) {
  const fetch = (...a) => (fetchImpl || globalThis.fetch)(...a);
  let refreshing = null;  // the ONE refresh in flight (single-flight: two callers share its answer)
  const store = () => { try { return (typeof integrations === 'function' ? integrations() : integrations) || null; } catch { return null; } };
  const sent = [];        // dictation start times inside the last minute (the per-instance bucket)

  /** the key this instance dictates with — the `dropline` registry row (own key > cluster preset), or null + why */
  function credentialOf() {
    const st = store();
    if (!st || typeof st.resolveIntegration !== 'function') return { key: null, why: 'no integration store on this instance' };
    let r; try { r = st.resolveIntegration('dropline'); } catch (e) { return { key: null, why: e && e.message }; }
    const key = r && r.values && typeof r.values.apiKey === 'string' ? r.values.apiKey.trim() : '';
    return key ? { key, source: r.source || null } : { key: null, why: (r && r.why) || 'no Dropline key' };
  }
  const pairNow = () => { try { return (tokens && tokens.read()) || null; } catch { return null; } };
  const livePair = () => { const p = pairNow(); return p && p.access && p.state !== 'reconnect' ? p : null; };
  function pairOf(j, clientId, prev = null) {
    const t = now();
    const s = Number(j && j.expires_in);
    return { access: String(j.access_token || ''), accessExp: t + (Number.isFinite(s) && s > 0 ? s : DEFAULT_ACCESS_S) * 1000, refresh: j.refresh_token ? String(j.refresh_token) : null, refreshExp: t + REFRESH_LIFE_MS, clientId, name: prev ? prev.name || '' : '', team: prev ? prev.team || '' : '', state: 'connected', at: t, ...(prev && prev.registeredFor ? { registeredFor: prev.registeredFor } : {}) };
  }
  const form = (o) => ({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(o).toString() });
  async function markReconnect(why) {
    const p = pairNow();
    if (p && p.state !== 'reconnect') { try { tokens.write({ ...p, state: 'reconnect' }); } catch (e) { log.warn?.(`[voice] the reconnect mark was not written: ${e && e.message}`); } }
    log.warn?.(`[voice] Dropline sign-in needs a reconnect (${why})`);
    return new DroplineError('reconnect', 'the Dropline sign-in has ended — connect again', { status: 401 });
  }
  /** ONE refresh at a time; the rotated pair is WRITTEN BEFORE it is used — a write failure keeps the old pair. */
  function refreshPair() {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      const p = pairNow();
      if (!p || !p.refresh || p.state === 'reconnect' || (p.refreshExp && p.refreshExp <= now())) throw await markReconnect('no live refresh token');
      let res;
      // POST https://api.fish.audio/oauth/token (grant_type=refresh_token; a public client: no secret)
      try { res = await fetch(`${oauthBase}/oauth/token`, form({ grant_type: 'refresh_token', refresh_token: p.refresh, client_id: p.clientId })); } catch (e) { throw new DroplineError('failed', `Fish Audio unreachable: ${e && e.message}`, { status: 502 }); }
      if (res.status === 400 || res.status === 401) throw await markReconnect(`refresh answered ${res.status}`);
      if (!res.ok) throw await vendorError(res);
      const next = pairOf(await res.json(), p.clientId, p);
      if (!next.access) throw await markReconnect('refresh answered no access token');
      try { tokens.write(next); } catch (e) { throw new DroplineError('store-failed', `the new Dropline sign-in could not be saved (${e && e.message}) — the old one is kept`, { status: 500 }); }
      return next;
    })().finally(() => { refreshing = null; });
    return refreshing;
  }
  /** the bearer of the next request: the person's own key, else the OAuth access token (refreshed when due), else null */
  async function bearerOf() {
    const cred = credentialOf();
    if (cred.key) return { token: cred.key, tier: 'key' };
    const p = livePair();
    if (!p) return null;
    if (p.accessExp && p.accessExp - ACCESS_SKEW_MS <= now()) return { token: (await refreshPair()).access, tier: 'oauth' };
    return { token: p.access, tier: 'oauth' };
  }
  /** `send(token)` once; an OAuth 401 refreshes ONCE and sends again; a second 401 ⇒ `reconnect` */
  async function authed(send, bearer) {
    let res = await send(bearer.token);
    if (res.status !== 401 || bearer.tier !== 'oauth') return res;
    const next = await refreshPair();
    res = await send(next.access);
    if (res.status === 401) throw await markReconnect('401 after a refresh');
    return res;
  }

  async function vendorError(res) {
    let body = null; try { body = await res.json(); } catch { }
    const vendorCode = body && body.error && body.error.code;
    const ra = Number(res.headers && res.headers.get && res.headers.get('retry-after'));
    return new DroplineError(VM.failureCodeOf(res.status, vendorCode), `Dropline answered ${res.status}${vendorCode ? ' ' + vendorCode : ''}`,
      { status: res.status, retryAfter: Number.isFinite(ra) && ra > 0 ? Math.ceil(ra) : null, requestId: (body && body.request_id) || null });
  }

  async function me(apiKey = null, { signal } = {}) {
    const bearer = apiKey ? { token: apiKey, tier: 'key' } : await bearerOf();
    if (!bearer) throw new DroplineError('not-connected', 'no Dropline key', { status: 409 });
    // GET https://api.dropline.fish.audio/v1/me (`base` differs only for the tests' fake vendor)
    const res = await authed((tok) => fetch(`${base}/v1/me`, { headers: { Authorization: `Bearer ${tok}` }, signal }), bearer);
    if (!res.ok) throw await vendorError(res);
    const b = await res.json();
    const u = (b && b.user) || {};
    return { name: String(u.name || u.email || ''), team: String((b && b.team && b.team.name) || '') };
  }

  async function dictate({ audio, mime = VM.RECORDER_MIME, ctx = null, language = 'auto', uiLang = 'en' } = {}) {
    if (!pluginOn()) throw new DroplineError('plugin-off', 'voice input is turned off', { status: 409 });
    const bearer = await bearerOf();
    if (!bearer) throw new DroplineError('not-connected', credentialOf().why, { status: 409 });
    if (!audio || !audio.length) throw new DroplineError('audio-invalid', 'no audio', { status: 400 });
    if (audio.length > VM.VOICE_LIMITS.maxBytes) throw new DroplineError('too-long', 'over 8 MB', { status: 413 });
    const t = now();
    while (sent.length && t - sent[0] >= 60e3) sent.shift();
    if (sent.length >= VM.VOICE_LIMITS.perMinute) throw new DroplineError('rate-limited', 'this instance sent 20 dictations this minute', { status: 429, retryAfter: Math.max(1, Math.ceil((sent[0] + 60e3 - t) / 1000)) });
    sent.push(t);
    const parts = {
      request: JSON.stringify(VM.dictateRequestOf({ language, uiLang })),
      context: JSON.stringify(ctx && typeof ctx === 'object' ? ctx : { app: 'VibeSpace' }),
    };
    // the multipart body BY HAND (the documented curl shape): request + context are JSON FIELDS (no filename — a
    // FormData Blob would make them file parts), audio is the one file part; built once, sent on each attempt
    const boundary = `----vsDropline${require('crypto').randomBytes(12).toString('hex')}`;
    const chunks = [];
    for (const name of VM.DICTATE_PART_ORDER) {
      const file = name === 'audio';
      chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"${file ? '; filename="dictation.webm"' : ''}\r\nContent-Type: ${file ? String(mime).replace(/[\r\n]/g, '') : 'application/json'}\r\n\r\n`));
      chunks.push(file ? Buffer.from(audio) : Buffer.from(parts[name]));
      chunks.push(Buffer.from('\r\n'));
    }
    chunks.push(Buffer.from(`--${boundary}--\r\n`));
    const payload = Buffer.concat(chunks);
    for (let attempt = 0; ; attempt++) {
      let res;
      // POST https://api.dropline.fish.audio/v1/dictate — the one dictation request
      try { res = await authed((tok) => fetch(`${base}/v1/dictate`, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': `multipart/form-data; boundary=${boundary}` }, body: payload }), bearer); } catch (e) {
        if (e instanceof DroplineError) throw e;
        throw new DroplineError('failed', `Dropline unreachable: ${e && e.message}`, { status: 502 });
      }
      if (res.ok) {
        const out = VM.dictateAnswerOf(await res.json());
        log.log?.(`[voice] dictation ${out.request_id || '?'} · rewrite ${out.rewrite.status || '?'}`); // ids only: no text, no audio
        return out;
      }
      if (attempt === 0 && VM.RETRY_ONCE.includes(res.status)) continue; // the docs: "Retry once"
      const err = await vendorError(res);
      log.warn?.(`[voice] dictation refused: ${err.message}${err.requestId ? ' (' + err.requestId + ')' : ''}`);
      throw err;
    }
  }

  /** the registry row's Test (credential-exchange): ONE GET /v1/me with the key being tested. */
  async function testRunner({ resolved, signal } = {}) {
    const key = resolved && resolved.values && resolved.values.apiKey;
    if (!key) return { ok: false, detail: 'no key' };
    // the card says "Connected: <name> · <team>"
    try { const m = await me(key, { signal }); return { ok: true, detail: `${m.name}${m.team ? ' · ' + m.team : ''}` }; } catch (e) { return { ok: false, error: e.message, code: e.code }; }
  }

  // ── the OAuth tier (design D4): one client per deployment; the browser only ever sees the authorize URL ──
  /** ONE dynamic registration (a hub without a cluster preset, on its first Connect): a public client, no secret */
  async function register({ redirectUri }) {
    let res;
    // POST https://api.fish.audio/oauth/register {client_name:'VibeSpace', redirect_uris:[<the callback>]}
    try { res = await fetch(`${oauthBase}/oauth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_name: 'VibeSpace', redirect_uris: [redirectUri] }) }); } catch (e) { throw new DroplineError('failed', `Fish Audio unreachable: ${e && e.message}`, { status: 502 }); }
    if (!res.ok) throw await vendorError(res);
    const j = await res.json();
    if (!j || typeof j.client_id !== 'string' || !j.client_id) throw new DroplineError('failed', 'Fish Audio registered no client_id', { status: 502 });
    return { clientId: j.client_id };
  }
  /** the consent page's address (opened in a NEW TAB by the card) — S256, scope dropline:api, resource = the API */
  function authorizeUrl({ clientId, redirectUri, state, challenge }) {
    const u = new URL(authorizeBase);
    for (const [k, v] of Object.entries({ response_type: 'code', client_id: clientId, redirect_uri: redirectUri, scope: OAUTH_SCOPE, resource: DROPLINE_BASE, state, code_challenge: challenge, code_challenge_method: 'S256' })) u.searchParams.set(k, v);
    return u.toString();
  }
  /** the landing's code → the pair, WRITTEN, then /v1/me names the account on the card */
  async function connectWith({ clientId, code, verifier, redirectUri }) {
    let res;
    // POST https://api.fish.audio/oauth/token (grant_type=authorization_code + the PKCE verifier; no secret)
    try { res = await fetch(`${oauthBase}/oauth/token`, form({ grant_type: 'authorization_code', code, client_id: clientId, redirect_uri: redirectUri, code_verifier: verifier })); } catch (e) { throw new DroplineError('failed', `Fish Audio unreachable: ${e && e.message}`, { status: 502 }); }
    if (!res.ok) throw await vendorError(res);
    const pair = pairOf(await res.json(), clientId, { registeredFor: (pairNow() || {}).registeredFor || null });
    if (!pair.access) throw new DroplineError('failed', 'Fish Audio answered no access token', { status: 502 });
    tokens.write(pair);
    let who = { name: '', team: '' };
    try { who = await me(); tokens.write({ ...pairNow(), name: who.name, team: who.team }); } catch (e) { log.warn?.(`[voice] connected, but /v1/me failed: ${e && e.message}`); }
    log.log?.('[voice] Dropline connected by OAuth'); // never the code, the verifier or a token
    return { user: who };
  }
  /** Disconnect: the pair is forgotten HERE (Fish Audio keeps the grant until the person removes it at fish.audio) */
  function disconnect() { if (tokens) tokens.clear(); return { ok: true }; }
  function account() {
    if (credentialOf().key) return { tier: 'key', state: 'connected', name: null, team: null };
    const p = pairNow();
    if (!p || !p.access) return { tier: null, state: null, name: null, team: null };
    return { tier: 'oauth', state: p.state === 'reconnect' ? 'reconnect' : 'connected', name: p.name || '', team: p.team || '' };
  }

  // ── the teach purpose (owner 2026-10-12: never automatic — the engine calls terms/context only after a press, or
  //    for a project the person opted into; `teachCap` = the per-instance hour caps) ──
  async function jsonCall(method, route, body = null) {
    const bearer = await bearerOf();
    if (!bearer) throw new DroplineError('not-connected', 'no Dropline sign-in', { status: 409 });
    let res;
    // https://api.dropline.fish.audio/v1/vocabulary | /v1/terms | /v1/context — JSON in and out
    try { res = await authed((tok) => fetch(`${base}${route}`, { method, headers: { Authorization: `Bearer ${tok}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }), bearer); } catch (e) { if (e instanceof DroplineError) throw e; throw new DroplineError('failed', `Dropline unreachable: ${e && e.message}`, { status: 502 }); }
    if (!res.ok) throw await vendorError(res);
    return res.json();
  }
  /** a teach WRITE: the plugin on, and this instance's hour cap for the kind not spent (`teachCap`) */
  const teachGate = (kind) => { if (!pluginOn()) throw new DroplineError('plugin-off', 'voice input is turned off', { status: 409 }); if (!teachCap(kind)) throw new DroplineError('teach-cap', `this instance sent its ${kind} for this hour`, { status: 429 }); };
  /** the person's dictionary (a READ — no confirmation needed): the terms' spellings */
  async function vocabulary() {
    const j = await jsonCall('GET', '/v1/vocabulary');
    return (Array.isArray(j && j.terms) ? j.terms : []).map((x) => String((x && x.term) || '')).filter(Boolean);
  }
  async function terms(list) {
    teachGate('terms');
    const j = await jsonCall('POST', '/v1/terms', { terms: list.map((term) => ({ term })) });
    return { added: Array.isArray(j && j.added) ? j.added.map(String) : [], skipped: Array.isArray(j && j.skipped) ? j.skipped.map((x) => String((x && x.term) || x)) : [] };
  }
  async function context({ title, text }) {
    teachGate('context');
    const j = await jsonCall('POST', '/v1/context', { title, source: 'VibeSpace', text });
    return { ok: true, request_id: (j && j.request_id) || null };
  }

  return { dictate, me, credentialOf, testRunner, connected: () => !!credentialOf().key || !!livePair(), account, register, authorizeUrl, connectWith, refreshPair, disconnect, vocabulary, terms, context };
}

module.exports = { create, DroplineError, DROPLINE_BASE, OAUTH_BASE, AUTHORIZE_URL, OAUTH_SCOPE };
