// A FAKE SLACK over the recorded answers (scripts/fixtures/slack/recorded.json — design 012 lane S1: the lane makes NO
// live Slack call). `createSlackVendor({token, mode})` → {fetchFn, calls, state, FX}: `fetchFn` is a fetch that answers
// https://slack.com/api/<method> (POST form, Bearer checked — a wrong one is `invalid_auth`) and the files on
// https://files.slack.com/; every other host throws (a suite that reached one is wrong). `calls` records
// {method, params (the form, never a token), host, path, auth: 'ok'|'bad'|'none'}. `mode` steers it:
//   {fail: {<method>: '<error>'}, status429: {<method>: <retryAfterSec>}, lose: {<method>: true} (the request is recorded,
//   then the answer is lost), limited15: true, scopes: '<header>', marked: true (a sent message carries an app marker),
//   createTeam: {…} (the create answer's workspace fields — by default the MEASURED pair {team_id, team_domain},
//   design-desk q-017-probe 2026-10-03; `createTeam: {}` = an answer that names no workspace)}
// design 017: `apps.manifest.create` answers ONLY the app configuration token CONFIG_TOKEN (a JSON POST; `manifest` a
// JSON string) with an app id A0VIBEAPP<n> + `credentials` + `oauth_authorize_url` (the documented shape — the
// adapter must drop the credentials); `state.created` keeps each parsed manifest.
// design 018: the WORKSPACE APP (client WS_CLIENT_ID / WS_CLIENT_SECRET): `allow(consentUrl, {token})` is the member
// pressing Allow on Slack's page — it mints a one-time code bound to the consent's redirect_uri and answers the URL
// Slack redirects to (the consent's redirect_uri, else the app's registered WS_REGISTERED); `oauth.v2.access` answers
// only HTTP Basic WS_CLIENT_ID:WS_CLIENT_SECRET, a live code (used once) and the SAME redirect_uri, with
// `authed_user.access_token` (an issued token auth.test then accepts). `mode.whoami[<token>]` overrides auth.test's
// answer for that token (a second member).
// Also loaded by scripts/fixtures/channels-vendor-stub.cjs for chrome legs (the same answers).
'use strict';
const fs = require('fs');
const path = require('path');
const FX = JSON.parse(fs.readFileSync(path.join(__dirname, 'slack', 'recorded.json'), 'utf-8'));
const TOKEN = ['xoxp', '1111111111', '2222222222', '3333333333', 'fixturetokenabcdef'].join('-'); // split: a token-shaped literal in the source trips GitHub push protection
const CONFIG_TOKEN = 'xoxe.' + ['xoxp', '1', 'Mi0yLTEwMjM0NTY3ODkw', 'configfixtureabcdef'].join('-'); // split, as above
const CLIENT_SECRET = ['fixture', 'client', 'secret', '0123456789abcdef'].join('');
const WS_CLIENT_ID = '1111111111.9999999999';
const WS_CLIENT_SECRET = ['workspace', 'app', 'secret', 'fedcba9876543210'].join('');
const WS_REGISTERED = 'https://relay.example.test/slack/';
const WS_TOKEN = ['xoxp', '1111111111', '2222222222', '4444444444', 'workspacetokenabcd'].join('-');

// `mode.tsShift` (whole seconds): every message timestamp the fake ANSWERS is moved by it and every timestamp a request
// NAMES is moved back — an engine suite needs RECENT messages (the store's retention trims anything older than its
// floor; the recorded instants are from 2023).
const TS_KEYS = new Set(['ts', 'thread_ts', 'latest_reply', 'last_read']);
const TS_PARAMS = ['oldest', 'latest', 'ts', 'timestamp', 'thread_ts'];
const isTs = (v) => typeof v === 'string' && /^\d{9,11}\.\d{1,6}$/.test(v);
const moveTs = (v, by) => { const [a, b] = v.split('.'); return `${Number(a) + by}.${b}`; };
function shifted(x, by, key = null) {
  if (!by) return x;
  if (isTs(x) && TS_KEYS.has(key)) return moveTs(x, by);
  if (Array.isArray(x)) return x.map((y) => shifted(y, by, null));
  if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, shifted(v, by, k)]));
  return x;
}
function createSlackVendor({ token = TOKEN, mode = {} } = {}) {
  const calls = [];
  const state = { posted: [], reactions: [], created: [], grants: new Map(), issued: new Set() };
  const J = (status, body, headers = {}) => new Response(JSON.stringify(shifted(body, Number(mode.tsShift) || 0)), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'x-oauth-scopes': mode.scopes || FX.scopesHeader, ...headers } });
  async function fetchFn(url, init = {}) {
    const u = new URL(String(url && url.url ? url.url : url));
    const auth = String((init.headers && (init.headers.Authorization || init.headers.authorization)) || '');
    const ok = auth === `Bearer ${token}` || (mode.extraTokens || []).some((t) => auth === `Bearer ${t}`) || state.issued.has(auth.slice(7));
    if (u.hostname === 'files.slack.com') {
      calls.push({ host: u.hostname, path: u.pathname, method: 'files.download', params: {}, auth: auth ? (ok ? 'ok' : 'bad') : 'none' });
      if (!ok) return new Response('<html>sign in</html>', { status: 200, headers: { 'Content-Type': 'text/html' } });
      return new Response(Buffer.from('%PDF-1.4 fixture'), { status: 200, headers: { 'Content-Type': 'application/pdf' } });
    }
    if (u.hostname !== 'slack.com' || !u.pathname.startsWith('/api/')) throw new Error(`slack fixture: a request to ${u.hostname} was not expected`);
    const method = u.pathname.slice(5);
    const isJson = /application\/json/.test(String((init.headers && (init.headers['Content-Type'] || init.headers['content-type'])) || ''));
    let p;
    try { p = isJson ? JSON.parse(String(init.body || '{}')) : Object.fromEntries(new URLSearchParams(String(init.body || ''))); } catch { p = { unparsable: true }; }
    if (Number(mode.tsShift)) for (const k of TS_PARAMS) if (isTs(p[k])) p[k] = moveTs(p[k], -Number(mode.tsShift));
    const cfgOk = method === 'apps.manifest.create' && auth === `Bearer ${CONFIG_TOKEN}`;
    calls.push({ host: u.hostname, path: u.pathname, method, params: p, json: isJson, auth: auth ? (ok || cfgOk ? 'ok' : 'bad') : 'none' });
    if (mode.lose && mode.lose[method]) { if (method === 'chat.postMessage') state.posted.push(p); throw new Error('socket hang up'); }
    if (mode.status429 && mode.status429[method]) return J(429, { ok: false, error: 'ratelimited' }, { 'Retry-After': String(mode.status429[method]) });
    if (method === 'oauth.v2.access') {
      if (auth !== `Basic ${Buffer.from(`${WS_CLIENT_ID}:${WS_CLIENT_SECRET}`).toString('base64')}`) return J(200, { ok: false, error: 'invalid_client', echoed: auth });
      const g = state.grants.get(String(p.code || ''));
      if (!g) return J(200, { ok: false, error: 'invalid_code' });
      state.grants.delete(String(p.code));
      if ((p.redirect_uri || null) !== g.redirectUri) return J(200, { ok: false, error: 'bad_redirect_uri' });
      state.issued.add(g.token);
      return J(200, { ok: true, app_id: 'A0WORKSPACE', authed_user: { id: FX['auth.test'].user_id, scope: 'channels:history,channels:read,users:read', access_token: g.token, token_type: 'user' }, team: { id: FX['auth.test'].team_id, name: FX['auth.test'].team }, enterprise: null, is_enterprise_install: false });
    }
    if (method === 'apps.manifest.create') {
      if (auth !== `Bearer ${CONFIG_TOKEN}`) return J(200, { ok: false, error: 'invalid_auth', echoed: auth });
      if (mode.fail && mode.fail[method]) return J(200, { ok: false, error: mode.fail[method], echoed: auth, ...(mode.fail[method] === 'missing_scope' ? { needed: 'app_configurations:write', provided: 'identify' } : {}) });
      let man = null;
      try { man = typeof p.manifest === 'string' ? JSON.parse(p.manifest) : null; } catch { man = null; }
      if (!isJson || !man || !man.display_information) return J(200, { ok: false, error: 'invalid_manifest', errors: [{ message: 'not a manifest', pointer: '/' }] });
      state.created.push(man);
      const n = state.created.length;
      return J(200, { ok: true, app_id: `A0VIBEAPP${n}`, credentials: { client_id: `1111111111.${2222222220 + n}`, client_secret: CLIENT_SECRET, verification_token: 'fixtureverificationtoken', signing_secret: 'fixturesigningsecret0123' }, oauth_authorize_url: `https://slack.com/oauth/v2/authorize?client_id=1111111111.${2222222220 + n}&scope=&user_scope=channels:history`, ...(mode.createTeam || { team_id: 'T0ACME001', team_domain: 'acme-ai' }) });
    }
    if (!ok) return J(200, { ok: false, error: 'invalid_auth', echoed: auth });
    if (mode.fail && mode.fail[method]) return J(200, { ok: false, error: mode.fail[method], ...(mode.fail[method] === 'missing_scope' ? { needed: 'chat:write', provided: 'channels:read' } : {}) });
    const by = (table, key) => (FX[table] && FX[table][key]) || null;
    switch (method) {
      case 'auth.test': return J(200, { ...FX['auth.test'], ...((mode.whoami || {})[auth.slice(7)] || {}) });
      case 'users.list': return J(200, FX['users.list']);
      case 'users.info': { const x = FX.users[p.user]; return J(200, x ? { ok: true, user: x } : { ok: false, error: 'user_not_found' }); }
      case 'bots.info': return J(200, by('bots.info', p.bot) || { ok: false, error: 'bot_not_found' });
      case 'team.info': return J(200, by('team.info', p.team) || { ok: false, error: 'team_not_found' });
      case 'users.conversations': return J(200, FX['users.conversations']);
      case 'conversations.info': return J(200, by('conversations.info', p.channel) || { ok: false, error: 'channel_not_found' });
      case 'conversations.members': return J(200, by('conversations.members', p.channel) || { ok: false, error: 'channel_not_found' });
      case 'conversations.history': {
        const h = by('history', p.channel);
        if (!h) return J(200, { ok: false, error: 'channel_not_found' });
        let msgs = h.messages.slice();
        if (p.oldest) msgs = msgs.filter((m) => Number(m.ts) > Number(p.oldest));
        if (p.latest) msgs = msgs.filter((m) => Number(m.ts) < Number(p.latest));
        const lim = mode.limited15 ? Math.min(15, Number(p.limit) || 100) : Math.min(999, Number(p.limit) || 100);
        const start = p.cursor ? Number(String(p.cursor).replace('cur-', '')) || 0 : 0;
        const page = msgs.slice(start, start + lim);
        const more = start + lim < msgs.length;
        return J(200, { ...h, messages: page, has_more: more, response_metadata: { next_cursor: more ? `cur-${start + lim}` : '' } });
      }
      case 'conversations.replies': {
        const r = by('replies', `${p.channel}|${p.ts}`);
        return J(200, r || { ok: false, error: 'thread_not_found' });
      }
      case 'reactions.get': return J(200, by('reactions.get', `${p.channel}|${p.timestamp}`) || { ok: false, error: 'message_not_found' });
      case 'reactions.add': state.reactions.push({ op: 'add', ...p }); return J(200, { ok: true });
      case 'reactions.remove': state.reactions.push({ op: 'remove', ...p }); return J(200, { ok: true });
      case 'files.info': return J(200, by('files.info', p.file) || { ok: false, error: 'file_not_found' });
      case 'chat.postMessage': {
        state.posted.push(p);
        const ts = `${1700000040 + state.posted.length}.000${100 + state.posted.length}`;
        return J(200, { ...FX['chat.postMessage'], channel: p.channel, ts, message: { ...FX['chat.postMessage'].message, text: p.text, ts, ...(mode.marked ? { app_id: 'A0VIBESPC', bot_profile: { name: 'VibeSpace' } } : {}) } });
      }
      default: return J(200, { ok: false, error: 'unknown_method' });
    }
  }
  /** design 018: the member presses Allow on the consent page → the URL Slack redirects the browser to. */
  function allow(consentUrl, { token: t = WS_TOKEN, deny = false } = {}) {
    const u = new URL(consentUrl);
    if (u.origin + u.pathname !== 'https://slack.com/oauth/v2/authorize' || u.searchParams.get('client_id') !== WS_CLIENT_ID) throw new Error('slack fixture: not this workspace app\'s consent URL');
    const redirectUri = u.searchParams.get('redirect_uri') || null;
    const back = new URL(redirectUri || WS_REGISTERED);
    if (deny) { back.searchParams.set('error', 'access_denied'); back.searchParams.set('state', u.searchParams.get('state') || ''); return back.toString(); }
    const code = `${Date.now()}.${state.grants.size + 1}.${Math.random().toString(16).slice(2, 10)}`;
    state.grants.set(code, { redirectUri, token: t });
    back.searchParams.set('code', code); back.searchParams.set('state', u.searchParams.get('state') || '');
    return back.toString();
  }
  return { fetchFn, calls, state, FX, token, allow };
}

module.exports = { createSlackVendor, FX, TOKEN, CONFIG_TOKEN, CLIENT_SECRET, WS_CLIENT_ID, WS_CLIENT_SECRET, WS_REGISTERED, WS_TOKEN };
