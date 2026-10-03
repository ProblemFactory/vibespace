// A FAKE SLACK over the recorded answers (scripts/fixtures/slack/recorded.json — design 012 lane S1: the lane makes NO
// live Slack call). `createSlackVendor({token, mode})` → {fetchFn, calls, state, FX}: `fetchFn` is a fetch that answers
// https://slack.com/api/<method> (POST form, Bearer checked — a wrong one is `invalid_auth`) and the files on
// https://files.slack.com/; every other host throws (a suite that reached one is wrong). `calls` records
// {method, params (the form, never a token), host, path, auth: 'ok'|'bad'|'none'}. `mode` steers it:
//   {fail: {<method>: '<error>'}, status429: {<method>: <retryAfterSec>}, lose: {<method>: true} (the request is recorded,
//   then the answer is lost), limited15: true, scopes: '<header>', marked: true (a sent message carries an app marker)}
// Also loaded by scripts/fixtures/channels-vendor-stub.cjs for chrome legs (the same answers).
'use strict';
const fs = require('fs');
const path = require('path');
const FX = JSON.parse(fs.readFileSync(path.join(__dirname, 'slack', 'recorded.json'), 'utf-8'));
const TOKEN = ['xoxp', '1111111111', '2222222222', '3333333333', 'fixturetokenabcdef'].join('-'); // split: a token-shaped literal in the source trips GitHub push protection

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
  const state = { posted: [], reactions: [] };
  const J = (status, body, headers = {}) => new Response(JSON.stringify(shifted(body, Number(mode.tsShift) || 0)), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'x-oauth-scopes': mode.scopes || FX.scopesHeader, ...headers } });
  async function fetchFn(url, init = {}) {
    const u = new URL(String(url && url.url ? url.url : url));
    const auth = String((init.headers && (init.headers.Authorization || init.headers.authorization)) || '');
    const ok = auth === `Bearer ${token}` || (mode.extraTokens || []).some((t) => auth === `Bearer ${t}`);
    if (u.hostname === 'files.slack.com') {
      calls.push({ host: u.hostname, path: u.pathname, method: 'files.download', params: {}, auth: auth ? (ok ? 'ok' : 'bad') : 'none' });
      if (!ok) return new Response('<html>sign in</html>', { status: 200, headers: { 'Content-Type': 'text/html' } });
      return new Response(Buffer.from('%PDF-1.4 fixture'), { status: 200, headers: { 'Content-Type': 'application/pdf' } });
    }
    if (u.hostname !== 'slack.com' || !u.pathname.startsWith('/api/')) throw new Error(`slack fixture: a request to ${u.hostname} was not expected`);
    const method = u.pathname.slice(5);
    const p = Object.fromEntries(new URLSearchParams(String(init.body || '')));
    if (Number(mode.tsShift)) for (const k of TS_PARAMS) if (isTs(p[k])) p[k] = moveTs(p[k], -Number(mode.tsShift));
    calls.push({ host: u.hostname, path: u.pathname, method, params: p, auth: auth ? (ok ? 'ok' : 'bad') : 'none' });
    if (mode.lose && mode.lose[method]) { if (method === 'chat.postMessage') state.posted.push(p); throw new Error('socket hang up'); }
    if (mode.status429 && mode.status429[method]) return J(429, { ok: false, error: 'ratelimited' }, { 'Retry-After': String(mode.status429[method]) });
    if (!ok) return J(200, { ok: false, error: 'invalid_auth', echoed: auth });
    if (mode.fail && mode.fail[method]) return J(200, { ok: false, error: mode.fail[method], ...(mode.fail[method] === 'missing_scope' ? { needed: 'chat:write', provided: 'channels:read' } : {}) });
    const by = (table, key) => (FX[table] && FX[table][key]) || null;
    switch (method) {
      case 'auth.test': return J(200, FX['auth.test']);
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
  return { fetchFn, calls, state, FX, token };
}

module.exports = { createSlackVendor, FX, TOKEN };
