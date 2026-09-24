// A VENDOR STUB for chrome legs that drive a REAL channel account through its
// consent (docs/design-integrations-per-account.zh.md chunk 3; the lane's rule:
// "ZERO vendor calls: OAuth consent runs against a stub loopback, never a real
// provider"). Preloaded into a SCRATCH worktree server with
//   NODE_OPTIONS=--require <this file>   VS_VENDOR_STUB_DIR=<scratch dir>
// it replaces globalThis.fetch BEFORE server.js runs, so the Gmail adapter
// (which binds globalThis.fetch at create time) talks to these canned answers
// for the Google hosts; every other URL passes through untouched. The consent
// itself is the product's own loopback (oauth-loopback.js): the suite lands the
// browser's redirect on it (or pastes it back), and the token EXCHANGE the
// loopback then makes is answered here.
//
// <dir>/mode.json (re-read on every call) steers it: {email, refresh:
// 'ok'|'invalid_grant', expiresIn}; <dir>/calls.ndjson records every
// intercepted call as {at, method, host, path} — never a body, never a token.
// Never loaded by product code.
'use strict';
const fs = require('fs');
const path = require('path');
const DIR = process.env.VS_VENDOR_STUB_DIR || null;
const HOSTS = new Set(['oauth2.googleapis.com', 'accounts.google.com', 'gmail.googleapis.com', 'www.googleapis.com', 'pubsub.googleapis.com', 'open.feishu.cn', 'open.larksuite.com']);
const real = globalThis.fetch;
let n = 0;
const mode = () => { try { return JSON.parse(fs.readFileSync(path.join(DIR, 'mode.json'), 'utf-8')); } catch { return {}; } };
const J = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const THREADS = [
  { id: 't-quote', subject: 'Supplier quote v3', from: 'Brook <brook@example.test>', text: 'The revised quote is attached.' },
  { id: 't-interview', subject: 'Interview on Thursday', from: 'Cass <cass@example.test>', text: 'Does 15:00 work for you?' },
  { id: 't-news', subject: 'Weekly digest', from: 'Ada <ada@example.test>', text: 'Nothing urgent this week.' },
];
const b64u = (s) => Buffer.from(s, 'utf-8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const message = (t, full) => ({ id: `${t.id}-m1`, threadId: t.id, internalDate: String(Date.now() - 120000), snippet: t.text,
  payload: { mimeType: full ? 'text/plain' : 'multipart/alternative', headers: [{ name: 'Subject', value: t.subject }, { name: 'From', value: t.from }, { name: 'Date', value: new Date().toUTCString() }], body: full ? { data: b64u(t.text) } : {} } });

globalThis.fetch = async function stubFetch(url, init = {}) {
  let u;
  try { u = new URL(String(url && url.url ? url.url : url)); } catch { return real(url, init); }
  if (!HOSTS.has(u.hostname)) return real(url, init);
  const m = mode();
  if (DIR) { try { fs.appendFileSync(path.join(DIR, 'calls.ndjson'), JSON.stringify({ at: Date.now(), method: (init && init.method) || 'GET', host: u.hostname, path: u.pathname }) + '\n'); } catch {} }
  if (u.hostname === 'oauth2.googleapis.com' && u.pathname === '/token') {
    const form = new URLSearchParams(String((init && init.body) || ''));
    n++;
    if (form.get('grant_type') === 'refresh_token') {
      if (m.refresh === 'invalid_grant') return J(400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' });
      return J(200, { access_token: `stub-at-${n}`, expires_in: Number(m.expiresIn || 3600), token_type: 'Bearer' });
    }
    return J(200, { access_token: `stub-at-${n}`, refresh_token: `stub-rt-${n}`, expires_in: Number(m.expiresIn || 3600), scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send', token_type: 'Bearer' });
  }
  if (u.hostname === 'gmail.googleapis.com') {
    const p = u.pathname.replace(/^\/gmail\/v1\/users\/me/, '');
    if (m.api === '401') return J(401, { error: { code: 401, message: 'Request had invalid authentication credentials.', status: 'UNAUTHENTICATED' } });
    if (p === '/profile') return J(200, { emailAddress: m.email || 'ada@example.test', historyId: '1000', messagesTotal: THREADS.length });
    if (p === '/history') return J(200, { historyId: '1000' });
    if (p === '/threads') return J(200, { threads: THREADS.map((t) => ({ id: t.id, snippet: t.text, historyId: '1000' })), resultSizeEstimate: THREADS.length });
    const tm = /^\/threads\/([^/]+)$/.exec(p);
    if (tm) {
      const t = THREADS.find((x) => x.id === decodeURIComponent(tm[1]));
      if (!t) return J(404, { error: { code: 404, message: 'Requested entity was not found.' } });
      return J(200, { id: t.id, historyId: '1000', messages: [message(t, u.searchParams.get('format') === 'full')] });
    }
  }
  return J(404, { error: { code: 404, message: `not stubbed: ${u.hostname}${u.pathname}` } });
};
