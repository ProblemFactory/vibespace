#!/usr/bin/env node
// test-voice-oauth — Dropline voice input P1, THE OAUTH TIER (design q-029 D4; lane voice-p1-oauth-teach) against a FAKE
// authorization server + FAKE Dropline (no real call to fish.audio ever): the real vendor module
// (src/server/dropline-client.js), the real Connect machine (src/server/dropline-oauth.js) on a real oauth-loopback
// `public` flow, and the REAL landing route GET /api/channels/oauth/cb/dropline (src/routes/channels.js → oauth-doors).
//   ① register ⇒ a client_id WITHOUT a secret, written to the row ONCE; no https + no relay ⇒ `needs-https` (no call)
//   ② authorize: S256 + resource + scope checked by the fake; the landing exchanges ONCE (a re-used landing = used);
//     a forged / other-kind state is refused before any exchange; the verifier never leaves the hub (only the token
//     POST carries it); the pair = 24 h access (expires_in) + refresh, file 0600; /v1/me names the account
//   ③ refresh: rotates, the old refresh re-used is REFUSED by the fake; two concurrent callers = ONE refresh (single
//     flight); a write failure ⇒ the old pair kept and the new token never used; a 401 after one refresh ⇒ reconnect
//   ④ a cluster preset (clientId + relayUrl) ⇒ the relay callback, no registration
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 600) : ''}`); }
};
const express = require(path.join(REPO, 'node_modules/express'));
const DC = require(path.join(REPO, 'src/server/dropline-client.js'));
const DO = require(path.join(REPO, 'src/server/dropline-oauth.js'));
const OL = require(path.join(REPO, 'src/oauth-loopback.js'));
const doors = require(path.join(REPO, 'src/server/oauth-doors.js'));
const b64u = (b) => Buffer.from(b).toString('base64url');

// ── the fake authorization server + fake Dropline (one http server) ──
const log = [];             // every request: method, path, body text
const fake = { clients: new Map(), codes: new Map(), refresh: new Map(), access: new Set(), force401: 0, tokenDelayMs: 0, n: 0 };
const readBody = (req) => new Promise((r) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => r(b)); });
const srv = http.createServer(async (req, res) => {
  const body = await readBody(req);
  const u = new URL(req.url, 'http://x');
  log.push({ m: req.method, p: u.pathname, q: u.search, body, auth: req.headers.authorization || '' });
  const json = (st, o) => res.writeHead(st, { 'Content-Type': 'application/json' }).end(JSON.stringify(o));
  if (u.pathname === '/oauth/register') {
    const j = JSON.parse(body); const id = `cid_${++fake.n}_abcdef`;
    fake.clients.set(id, j.redirect_uris);
    return json(201, { client_id: id, client_name: j.client_name, redirect_uris: j.redirect_uris, token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'] });
  }
  if (u.pathname === '/oauth/authorize') {
    const q = Object.fromEntries(u.searchParams);
    const bad = q.response_type !== 'code' ? 'response_type' : q.code_challenge_method !== 'S256' ? 'S256' : q.resource !== DC.DROPLINE_BASE ? 'resource' : q.scope !== 'dropline:api' ? 'scope' : !(fake.clients.get(q.client_id) || []).includes(q.redirect_uri) ? 'redirect_uri' : !q.code_challenge ? 'challenge' : null;
    if (bad) return json(400, { error: 'invalid_request', field: bad });
    const code = 'code_' + crypto.randomBytes(6).toString('hex');
    fake.codes.set(code, { challenge: q.code_challenge, client: q.client_id, redirect: q.redirect_uri });
    return res.writeHead(302, { Location: `${q.redirect_uri}?code=${code}&iss=${encodeURIComponent('https://fish.audio')}&state=${encodeURIComponent(q.state)}` }).end();
  }
  if (u.pathname === '/oauth/token') {
    if (fake.tokenDelayMs) await new Promise((r) => setTimeout(r, fake.tokenDelayMs));
    const f = Object.fromEntries(new URLSearchParams(body));
    const mint = (client) => { const at = 'at_' + crypto.randomBytes(6).toString('hex'), rt = 'rt_' + crypto.randomBytes(6).toString('hex'); fake.access.add(at); fake.refresh.set(rt, { client, live: true }); return { access_token: at, refresh_token: rt, expires_in: 86400, token_type: 'Bearer', scope: 'dropline:api' }; };
    if (f.grant_type === 'authorization_code') {
      const c = fake.codes.get(f.code);
      if (!c || c.used) return json(400, { error: 'invalid_grant' });
      c.used = true;
      if (b64u(crypto.createHash('sha256').update(String(f.code_verifier || '')).digest()) !== c.challenge || f.client_id !== c.client || f.redirect_uri !== c.redirect || f.client_secret) return json(400, { error: 'invalid_grant', why: 'pkce' });
      return json(200, mint(f.client_id));
    }
    if (f.grant_type === 'refresh_token') {
      const r = fake.refresh.get(f.refresh_token);
      if (!r || !r.live || r.client !== f.client_id) return json(400, { error: 'invalid_grant' });
      r.live = false;   // ROTATION: the old refresh is dead the moment a new pair is minted
      return json(200, mint(f.client_id));
    }
    return json(400, { error: 'unsupported_grant_type' });
  }
  if (u.pathname === '/v1/me') {
    const tok = (req.headers.authorization || '').replace(/^Bearer /, '');
    if (fake.force401 > 0) { fake.force401--; return json(401, { error: { code: 'unauthorized' } }); }
    if (!fake.access.has(tok)) return json(401, { error: { code: 'unauthorized' } });
    return json(200, { user: { id: 'u1', email: 'ana@example.test', name: 'Ana' }, team: { id: 't1', name: 'Fish Lab' }, memory: true, request_id: 'r1' });
  }
  json(404, { error: 'nope' });
}).listen(0, '127.0.0.1');
await new Promise((r) => srv.on('listening', r));
const FAKE = `http://127.0.0.1:${srv.address().port}`;

// ── the hub under test: real client + real Connect machine + the real landing route ──
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-voice-oauth-'));
function hub({ instance = 'https://hub.example.ts.net', rowValues = {}, presets = [], tokens = null, fileName = 'dropline-oauth.json', clientPath = null, sink = null } = {}) {
  const writes = [];
  const row = { ...rowValues };
  const store = { resolveIntegration: () => ({ values: { ...row }, source: Object.keys(row).length ? 'user' : 'none' }), presetsFor: () => presets, setIntegration: (id, v) => { writes.push([id, v]); Object.assign(row, v); } };
  const tk = tokens || DO.tokenFile(path.join(dir, fileName));
  const client = (clientPath ? require(clientPath) : DC).create({ integrations: () => store, tokens: tk, base: FAKE, oauthBase: FAKE, authorizeUrl: `${FAKE}/oauth/authorize`, log: sink || { log() { }, warn() { } } });
  const oauth = DO.create({ client, flows: OL.createOAuthLoopback({ log: sink || { warn() { }, log() { } } }), integrations: () => store, instanceUrl: () => instance, tokens: tk, log: sink || { log() { }, warn() { } } });
  doors.register('dropline', { landing: oauth.landing, page: oauth.page });   // what the wiring does (the newest hub's door)
  return { client, oauth, writes, row, tk };
}
const chan = require(path.join(REPO, 'src/routes/channels.js'));
chan.setup({});
const app = express(); app.use(chan.router);
const appSrv = app.listen(0, '127.0.0.1'); await new Promise((r) => appSrv.on('listening', r));
const LAND = `http://127.0.0.1:${appSrv.address().port}/api/channels/oauth/cb/dropline`;
const consent = async (url) => { const r = await fetch(url, { redirect: 'manual' }); const loc = r.headers.get('location'); return { status: r.status, loc, q: loc ? Object.fromEntries(new URL(loc).searchParams) : null }; };

try {
  console.log('① register + the callback plan');
  {
    const h = hub({ instance: 'http://box.lan:3456' });
    const n0 = log.length;
    const r = await h.oauth.start({ origin: 'http://box.lan:3456' });
    ok('no https address and no relay ⇒ needs-https, NOTHING sent to Fish Audio', r.ok === false && r.why === 'needs-https' && log.length === n0, r);
  }
  const h = hub();
  const s1 = await h.oauth.start({ origin: 'https://hub.example.ts.net' });
  const reg = log.filter((x) => x.p === '/oauth/register');
  ok('the first Connect registers ONCE: client_name VibeSpace, redirect = the hub\'s own https + /api/channels/oauth/cb/dropline; no secret in the answer', reg.length === 1 && JSON.parse(reg[0].body).client_name === 'VibeSpace' && JSON.parse(reg[0].body).redirect_uris[0] === 'https://hub.example.ts.net/api/channels/oauth/cb/dropline' && s1.via === 'own-https', { reg, s1 });
  ok('the client_id is written to the `dropline` row (own value)', h.writes.length === 1 && h.writes[0][0] === 'dropline' && /^cid_/.test(h.writes[0][1].clientId));
  const au = new URL(s1.url);
  ok('the authorize URL: S256 challenge, scope dropline:api, resource = the API, the hub\'s state — and NO verifier', au.searchParams.get('code_challenge_method') === 'S256' && au.searchParams.get('scope') === 'dropline:api' && au.searchParams.get('resource') === 'https://api.dropline.fish.audio' && /^v1\./.test(au.searchParams.get('state')) && !/verifier/.test(s1.url), s1.url);
  const s2 = await h.oauth.start({ origin: 'https://hub.example.ts.net' });
  ok('a second Connect reuses the client (no second registration)', log.filter((x) => x.p === '/oauth/register').length === 1 && s2.ok);

  console.log('② consent → landing → exchange once');
  const c = await consent(s2.url);
  ok('the fake consent page accepted S256 + resource + scope and redirected with code + iss + state', c.status === 302 && c.q && c.q.code && c.q.iss && c.q.state === new URL(s2.url).searchParams.get('state'), c);
  const forged = c.q.state.replace(/\.[^.]+$/, '.' + 'A'.repeat(43));
  const rf = await fetch(`${LAND}?code=${c.q.code}&state=${encodeURIComponent(forged)}`);
  const otherKind = DO.stateOf({ origin: 'https://hub.example.ts.net', flowId: 'abcdef0123456789', issuedAt: Date.now(), kind: 'slack' }, h.oauth.sign);
  const rk = await h.oauth.landing({ code: c.q.code, state: otherKind });
  ok('a forged state (bad HMAC) and another kind\'s state are refused BEFORE any exchange', rf.status === 400 && rk.why === 'wrong-kind' && log.filter((x) => x.p === '/oauth/token').length === 0, { st: rf.status, rk });
  const land = await fetch(`${LAND}?code=${c.q.code}&state=${encodeURIComponent(c.q.state)}&iss=x`);
  const page = await land.text();
  ok('THE LANDING ROUTE /api/channels/oauth/cb/dropline (no cookie) exchanges and says connected; never the code or state', land.status === 200 && page.includes('id="connected"') && !page.includes(c.q.code) && !page.includes(c.q.state.slice(0, 20)), page.slice(0, 200));
  const again = await fetch(`${LAND}?code=${c.q.code}&state=${encodeURIComponent(c.q.state)}`);
  ok('the same landing twice ⇒ refused (a code is exchanged once)', again.status === 400 && log.filter((x) => x.p === '/oauth/token').length === 1);
  const tokPost = log.filter((x) => x.p === '/oauth/token')[0];
  const verifier = new URLSearchParams(tokPost.body).get('code_verifier');
  ok('the verifier never left the hub except in the ONE token POST (not in the authorize URL, the landing, any other request)', verifier && verifier.length >= 43 && log.filter((x) => (x.q + x.body).includes(verifier)).length === 1 && !s2.url.includes(verifier) && !new URLSearchParams(tokPost.body).get('client_secret'));
  const pair = h.tk.read();
  const mode = fs.statSync(path.join(dir, 'dropline-oauth.json')).mode & 0o777;
  ok('the pair: access 24 h from expires_in (never 1 h), refresh, clientId; file 0600', pair.access && pair.refresh && Math.abs(pair.accessExp - pair.at - 86400e3) < 5 && pair.clientId === h.writes[0][1].clientId && mode === 0o600, { pair: { ...pair, access: '…', refresh: '…' }, mode: mode.toString(8) });
  ok('the card\'s account: oauth · connected · Ana · Fish Lab; connected() true', JSON.stringify(h.client.account()) === JSON.stringify({ tier: 'oauth', state: 'connected', name: 'Ana', team: 'Fish Lab' }) && h.client.connected(), h.client.account());

  console.log('③ refresh: rotation, single flight, write-before-use, reconnect');
  const old = h.tk.read();
  h.tk.write({ ...old, accessExp: Date.now() - 1000 });
  const nTok = log.filter((x) => x.p === '/oauth/token').length;
  fake.tokenDelayMs = 150;
  const [m1, m2] = await Promise.all([h.client.me(), h.client.me()]);
  fake.tokenDelayMs = 0;
  const refreshes = log.filter((x) => x.p === '/oauth/token').length - nTok;
  const rotated = h.tk.read();
  ok('an access token past its time ⇒ TWO concurrent callers share ONE refresh (single flight); both answered', refreshes === 1 && m1.name === 'Ana' && m2.name === 'Ana', { refreshes });
  ok('the refresh ROTATED the pair and wrote it (new access + new refresh on disk)', rotated.access !== old.access && rotated.refresh !== old.refresh && rotated.state === 'connected');
  const reuse = await fetch(`${FAKE}/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: old.refresh, client_id: old.clientId }).toString() });
  ok('the OLD refresh re-used is REFUSED by the fake (rotation is real)', reuse.status === 400);
  // write failure: the file store throws on write ⇒ the old pair stays, the new access is never used
  const failing = { read: () => h.tk.read(), write: () => { throw new Error('EROFS: read-only file system'); }, clear: () => { } };
  const hf = hub({ tokens: failing, rowValues: { clientId: rotated.clientId } });
  h.tk.write({ ...h.tk.read(), accessExp: Date.now() - 1000 });
  const before = JSON.stringify(h.tk.read());
  const nMe = log.filter((x) => x.p === '/v1/me').length;
  let err = null; try { await hf.client.me(); } catch (e) { err = e; }
  ok('a write failure on rotation ⇒ store-failed, the OLD pair kept on disk, and NO request was made with the new token', err && err.code === 'store-failed' && JSON.stringify(h.tk.read()) === before && log.filter((x) => x.p === '/v1/me').length === nMe, err && err.message);
  // a 401 after one refresh ⇒ reconnect (fresh hub over the same file; the old refresh above is dead: mint a fresh pair)
  const h2 = hub({ fileName: 'b.json' });
  const s3 = await h2.oauth.start({ origin: 'https://hub.example.ts.net' });
  const c3 = await consent(s3.url);
  await fetch(`${LAND}?code=${c3.q.code}&state=${encodeURIComponent(c3.q.state)}`);
  fake.force401 = 2;
  let e401 = null; try { await h2.client.me(); } catch (e) { e401 = e; }
  ok('a 401 ⇒ ONE refresh ⇒ still 401 ⇒ `reconnect`: the card says it, connected() false', e401 && e401.code === 'reconnect' && h2.client.account().state === 'reconnect' && !h2.client.connected(), { e: e401 && e401.code, acct: h2.client.account() });
  h2.client.disconnect();
  ok('Disconnect forgets the pair here (the file is gone)', !fs.existsSync(path.join(dir, 'b.json')) && h2.client.account().tier === null);

  console.log('③b THE PAIR NEVER IN A LOG (and its RED control — voice-verify F3)');
  {
    // connect + one rotation with every sink captured: console.*, stdout/stderr, the client's / the Connect machine's /
    // the loopback's injected logs; the four tokens (old + new access and refresh) are the needles
    const pairLeg = async (clientPath, fileName) => {
      const lines = [], put = (...a) => lines.push(a.map(String).join(' '));
      const sink = { log: put, warn: put, error: put, info: put };
      const hx = hub({ fileName, clientPath, sink });
      const keep = { log: console.log, warn: console.warn, error: console.error, info: console.info, debug: console.debug }, outW = process.stdout.write, errW = process.stderr.write;
      let first = null, second = null;
      Object.assign(console, { log: put, warn: put, error: put, info: put, debug: put });
      process.stdout.write = process.stderr.write = (c) => { lines.push(String(c)); return true; };
      try {
        const s = await hx.oauth.start({ origin: 'https://hub.example.ts.net' });
        const cx = await consent(s.url);
        await fetch(`${LAND}?code=${cx.q.code}&state=${encodeURIComponent(cx.q.state)}`);
        first = hx.tk.read();
        hx.tk.write({ ...first, accessExp: Date.now() - 1000 });
        await hx.client.me();
        second = hx.tk.read();
      } finally { Object.assign(console, keep); process.stdout.write = outW; process.stderr.write = errW; }
      const needles = [first && first.access, first && first.refresh, second && second.access, second && second.refresh].filter(Boolean);
      return { lines: lines.length, rotated: !!(first && second && second.refresh !== first.refresh), needles: needles.length, leaked: lines.filter((l) => needles.some((n) => l.includes(n))).length };
    };
    const real = await pairLeg(path.join(REPO, 'src/server/dropline-client.js'), 'p.json');
    ok('connect + a rotation through the real modules: no captured line holds an access or a refresh token, old or new', real.rotated && real.needles === 4 && real.leaked === 0, real);
    const mdir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-voice-oauth-m-'));
    try {
      fs.mkdirSync(path.join(mdir, 'src/server'), { recursive: true });
      for (const f of ['src/voice-model.js', 'src/assistant-note.js']) fs.copyFileSync(path.join(REPO, f), path.join(mdir, f));
      const src = fs.readFileSync(path.join(REPO, 'src/server/dropline-client.js'), 'utf8');
      const anchor = '      try { tokens.write(next); }';
      fs.writeFileSync(path.join(mdir, 'src/server/dropline-client.js'), src.replace(anchor, '      log.log?.(`[voice] refreshed ${JSON.stringify(next)}`);\n' + anchor));
      const m = await pairLeg(path.join(mdir, 'src/server/dropline-client.js'), 'pm.json');
      ok('CONTROL: a copy that logs the rotated pair leaks it ⇒ the check above is RED on it', src.split(anchor).length === 2 && m.rotated && m.leaked > 0, m);
    } finally { fs.rmSync(mdir, { recursive: true, force: true }); }
  }

  console.log('④ a cluster preset');
  {
    const nReg = log.filter((x) => x.p === '/oauth/register').length;
    fake.clients.set('cid_cluster_000001', ['https://admin.example.test/relay/']);
    const hc = hub({ instance: 'http://10.0.0.5:3456', presets: [{ key: 'default', values: { clientId: 'cid_cluster_000001', relayUrl: 'https://admin.example.test/relay/' } }], fileName: 'c.json' });
    const r = await hc.oauth.start({ origin: 'http://10.0.0.5:3456' });
    const st = new URL(r.url).searchParams.get('state');
    const clear = JSON.parse(Buffer.from(st.split('.')[1], 'base64url').toString());
    ok('the preset\'s clientId + relay page: no registration; the state carries u = the hub origin and k = dropline for the relay', r.ok && r.via === 'relay' && new URL(r.url).searchParams.get('client_id') === 'cid_cluster_000001' && new URL(r.url).searchParams.get('redirect_uri') === 'https://admin.example.test/relay/' && log.filter((x) => x.p === '/oauth/register').length === nReg && clear.u === 'http://10.0.0.5:3456' && clear.k === 'dropline', { r, clear });
  }
  ok('the door registry: dropline\'s door is what the route consulted (and a bad kind is refused at registration)', (() => { try { doors.register('../x', { landing() { }, page() { } }); return false; } catch { return true; } })());
} finally {
  srv.close(); appSrv.close();
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
